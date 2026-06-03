import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { webui } from '@/common/adapter/ipcBridge';
import {
  withCsrfToken,
  hasValidCsrfToken,
  clearCookie,
  captureCsrfTokenFromResponse,
  clearCsrfSessionToken,
} from '@process/webserver/middleware/csrfClient';
import { CSRF_COOKIE_NAME } from '@process/webserver/config/constants';
import {
  clearAuthUserRequestBackoff,
  fetchWebuiApi,
  getWebuiApiBaseUrl,
  shouldSkipAuthUserRequest,
} from '@/renderer/utils/webuiApiBase';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import {
  getWebuiDesktopSession,
  setWebuiDesktopSession,
  type WebuiDesktopSession,
} from '@/renderer/utils/webuiDesktopSession';
import {
  ONE_WEBUI_CLIENT_DESKTOP,
  ONE_WEBUI_CLIENT_HEADER,
} from '@/common/config/webuiClientHeaders';
import { dispatchWebuiConfigRefresh } from '@/renderer/utils/webuiConfigSync';
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';
import { rememberEnterpriseApiOrigin } from '@/renderer/utils/rememberEnterpriseApiOrigin';

export { DESKTOP_OPERATOR_USER_ID };

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  id: string;
  username: string;
  tenant_id?: string;
  role?: 'member' | 'org_admin' | 'system_admin' | 'user' | 'admin';
}

interface LoginParams {
  username: string;
  password: string;
  remember?: boolean;
}

type LoginErrorCode =
  | 'invalidCredentials'
  | 'tooManyAttempts'
  | 'serverError'
  | 'dbUnavailable'
  | 'networkError'
  | 'csrfError'
  | 'unknown';

interface LoginResult {
  success: boolean;
  message?: string;
  code?: LoginErrorCode;
  shouldClearCache?: boolean;
  user?: AuthUser;
}

interface LogoutOptions {
  /** Join flow: clear session in UI without restoring desktop operator identity. */
  force?: boolean;
}

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  login: (params: LoginParams) => Promise<LoginResult>;
  loginWithLdap: (params: LoginParams) => Promise<LoginResult>;
  logout: (options?: LogoutOptions) => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthCache: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_USER_ENDPOINT = '/api/auth/user';
const DESKTOP_AUTH_TIMEOUT_MS = 8_000;

const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

async function withAuthTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// Clear expired auth cache including cookies and localStorage
// 清除过期的认证缓存，包括 Cookie 和 localStorage
function clearAuthCache(): void {
  if (typeof window === 'undefined') return;

  try {
    // Clear CSRF cookie + session cache (tiny-csrf header token)
    clearCsrfSessionToken();
    clearCookie(CSRF_COOKIE_NAME);
    clearCookie(CSRF_COOKIE_NAME, '/');

    // Clear localStorage auth-related items
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('auth') || key.includes('csrf') || key.includes('token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear auth cache:', error);
  }
}

async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const response = await fetch(AUTH_USER_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      signal,
    });

    captureCsrfTokenFromResponse(response);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthCache();
      }
      return null;
    }

    const data = (await response.json()) as {
      success: boolean;
      user?: AuthUser;
    };
    if (data.success && data.user) {
      return data.user;
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null;
    }
    console.error('Failed to fetch current user:', error);
  }

  return null;
}

function authUserFromDesktopSession(session: WebuiDesktopSession): AuthUser {
  return {
    id: session.userId,
    username: session.username,
    role: (session.role as AuthUser['role']) ?? 'member',
  };
}

async function loginViaWebui(path: string, body: Record<string, unknown>): Promise<LoginResult> {
  const base = await getWebuiApiBaseUrl();
  if (!base) {
    return {
      success: false,
      message: 'WebUI is not running. Start WebUI in settings first.',
      code: 'serverError',
    };
  }

  const loginHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (isDesktopRuntime) {
    loginHeaders[ONE_WEBUI_CLIENT_HEADER] = ONE_WEBUI_CLIENT_DESKTOP;
  }

  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: loginHeaders,
    credentials: 'include',
    body: JSON.stringify(withCsrfToken(body)),
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return {
      success: false,
      message: 'WebUI API unavailable. Ensure WebUI is running and refresh the page.',
      code: 'serverError',
    };
  }

  const data = (await response.json()) as {
    success: boolean;
    message?: string;
    code?: string;
    user?: AuthUser;
    token?: string;
  };

  captureCsrfTokenFromResponse(response);

  if (!response.ok || !data.success || !data.user) {
    let code: LoginErrorCode = 'unknown';
    const message = data?.message ?? 'Login failed';
    if (data.code === 'db_unavailable' || response.status === 503) code = 'dbUnavailable';
    else if (response.status === 401) code = 'invalidCredentials';
    else if (response.status === 403) code = 'csrfError';
    else if (response.status === 429) code = 'tooManyAttempts';
    else if (response.status >= 500) code = 'serverError';
    return { success: false, message, code };
  }

  if (data.user) {
    if (data.token) {
      setWebuiDesktopSession({
        userId: data.user.id,
        username: data.user.username,
        role: data.user.role ?? 'member',
        token: data.token,
      });
    } else {
      console.warn('[Auth] WebUI login succeeded without JWT token; desktop session may not persist across refresh');
    }
  }
  dispatchWebuiConfigRefresh();

  return { success: true, user: data.user };
}

function buildDesktopOperatorUser(adminUsername?: string): AuthUser {
  return {
    id: DESKTOP_OPERATOR_USER_ID,
    username: adminUsername || 'admin',
    tenant_id: 'default',
    role: 'member',
  };
}

async function fetchDesktopCurrentUser(): Promise<AuthUser | null> {
  try {
    const statusResult = await withAuthTimeout(webui.getStatus.invoke(), 5_000, 'webui.getStatus');
    if (!statusResult.success || !statusResult.data) {
      return null;
    }

    await withAuthTimeout(syncBrowserWebuiSessionToDesktop(), 5_000, 'syncBrowserWebuiSession');

    try {
      if (shouldSkipAuthUserRequest()) {
        throw new Error('AUTH_USER_BACKOFF');
      }
      const response = await fetchWebuiApi('/api/auth/user');
      if (response.ok) {
        const data = (await response.json()) as {
          success?: boolean;
          user?: AuthUser;
        };
        if (data.success && data.user) {
          const session = getWebuiDesktopSession();
          if (session?.token) {
            setWebuiDesktopSession({
              userId: data.user.id,
              username: data.user.username,
              role: data.user.role ?? session.role ?? 'member',
              token: session.token,
            });
          }
          return data.user;
        }
      } else if (response.status === 401 || response.status === 403) {
        setWebuiDesktopSession(null);
        clearAuthCache();
      }
    } catch {
      // WebUI not running or no browser session yet
    }

    const session = getWebuiDesktopSession();
    if (session?.token && !shouldSkipAuthUserRequest()) {
      const verified = await fetchWebuiApi('/api/auth/user').catch(() => null);
      if (verified?.ok) {
        return authUserFromDesktopSession(session);
      }
      setWebuiDesktopSession(null);
    }

    return buildDesktopOperatorUser(statusResult.data.adminUsername);
  } catch (error) {
    console.warn('[Auth] Desktop user fetch failed, attempting local operator fallback:', error);
    try {
      const statusResult = await withAuthTimeout(webui.getStatus.invoke(), 3_000, 'webui.getStatus(fallback)');
      if (statusResult.success && statusResult.data) {
        return buildDesktopOperatorUser(statusResult.data.adminUsername);
      }
    } catch {
      // ignore
    }
    return null;
  }
}

export function isDesktopOperatorUser(user: AuthUser | null | undefined): boolean {
  return user?.id === DESKTOP_OPERATOR_USER_ID;
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const userRef = useRef(user);
  userRef.current = user;
  const desktopUserIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDesktopRuntime) {
      let currentUser: AuthUser | null = null;
      try {
        currentUser = await withAuthTimeout(
          fetchDesktopCurrentUser(),
          DESKTOP_AUTH_TIMEOUT_MS,
          'fetchDesktopCurrentUser'
        );
      } catch (error) {
        console.warn('[Auth] Desktop refresh timed out, using local operator if available:', error);
        try {
          const statusResult = await withAuthTimeout(webui.getStatus.invoke(), 3_000, 'webui.getStatus(recover)');
          if (statusResult.success && statusResult.data) {
            currentUser = buildDesktopOperatorUser(statusResult.data.adminUsername);
          }
        } catch {
          currentUser = null;
        }
      } finally {
        setReady(true);
      }
      setStatus(currentUser ? 'authenticated' : 'unauthenticated');
      setUser(currentUser);
      dispatchWebuiConfigRefresh();
      const nextUserId = currentUser?.id ?? null;
      if (currentUser && nextUserId !== desktopUserIdRef.current) {
        desktopUserIdRef.current = nextUserId;
        window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
      }
      if (!currentUser) {
        desktopUserIdRef.current = null;
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Keep the current session visible during background revalidation (e.g. enterprise console).
    const backgroundRefresh = readyRef.current && userRef.current !== null;
    if (!backgroundRefresh) {
      setStatus('checking');
    }

    const currentUser = await fetchCurrentUser(controller.signal);
    if (currentUser) {
      if (typeof window !== 'undefined') {
        void rememberEnterpriseApiOrigin(window.location.origin);
      }
      setUser(currentUser);
      setStatus('authenticated');
    } else {
      setUser(null);
      setStatus('unauthenticated');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [refresh]);

  const login = useCallback(async ({ username, password, remember }: LoginParams): Promise<LoginResult> => {
    try {
      if (isDesktopRuntime) {
        const result = await loginViaWebui('/login', { username, password, remember });
        if (!result.success) {
          return result;
        }
        if (result.user) {
          clearAuthUserRequestBackoff();
          setUser(result.user);
          setStatus('authenticated');
          setReady(true);
          dispatchWebuiConfigRefresh();
          window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
        } else {
          await refresh();
        }
        return result;
      }

      // Check CSRF token availability before login
      // If token is missing, clear cache and inform user
      const csrfTokenValid = hasValidCsrfToken();
      if (!csrfTokenValid) {
        console.warn('CSRF token missing or invalid, clearing cache');
        clearAuthCache();
        // Allow login to proceed anyway - server will set new token
      }

      // P1 安全修复：登录请求需要 CSRF Token / P1 Security fix: Login needs CSRF token
      const response = await fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({ username, password, remember })),
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        console.error('[Auth] Login response is not JSON:', contentType, response.status);
        return {
          success: false,
          message: 'WebUI API unavailable. Ensure WebUI is running and refresh the page.',
          code: 'serverError',
        };
      }

      const data = (await response.json()) as {
        success: boolean;
        message?: string;
        code?: string;
        user?: AuthUser;
        token?: string;
      };

      captureCsrfTokenFromResponse(response);

      if (!response.ok || !data.success || !data.user) {
        let code: LoginErrorCode = 'unknown';
        let message = data?.message ?? 'Login failed';
        let shouldClearCache = false;

        if (data.code === 'db_unavailable' || response.status === 503) {
          code = 'dbUnavailable';
        } else if (response.status === 401) {
          code = 'invalidCredentials';
        } else if (response.status === 403) {
          // CSRF validation failed - clear cache
          code = 'csrfError';
          message = 'Security token expired. Please try again.';
          shouldClearCache = true;
        } else if (response.status === 429) {
          code = 'tooManyAttempts';
        } else if (response.status >= 500) {
          code = 'serverError';
        } else if (!csrfTokenValid) {
          // If we knew CSRF was invalid and login failed, suggest cache clear
          code = 'csrfError';
          message = 'Login failed due to cached data. Please clear your browser cache and try again.';
          shouldClearCache = true;
        }

        // Clear cache on CSRF-related errors
        if (shouldClearCache) {
          clearAuthCache();
        }

        return {
          success: false,
          message,
          code,
          shouldClearCache,
        };
      }

      setUser(data.user);
      setStatus('authenticated');
      setReady(true);
      clearAuthUserRequestBackoff();
      if (data.token) {
        setWebuiDesktopSession({
          userId: data.user.id,
          username: data.user.username,
          role: data.user.role ?? 'member',
          token: data.token,
        });
      }
      dispatchWebuiConfigRefresh();
      window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));

      // Re-enable WebSocket reconnection after successful login (WebUI mode only)
      if (typeof window !== 'undefined' && (window as any).__websocketReconnect) {
        (window as any).__websocketReconnect();
      }

      return { success: true, user: data.user };
    } catch (error) {
      console.error('Login request failed:', error);

      // Check if error is related to CSRF token parsing
      const errorMessage = (error as Error).message;
      if (errorMessage?.includes('parse') || errorMessage?.includes('csrf') || errorMessage?.includes('cookie')) {
        // CSRF or cookie parsing error - clear cache
        clearAuthCache();
        return {
          success: false,
          message: 'Login failed due to cached data. Please clear your browser cache and try again.',
          code: 'csrfError',
          shouldClearCache: true,
        };
      }

      return {
        success: false,
        message: 'Network error. Please try again.',
        code: 'networkError',
      };
    }
  }, [refresh]);

  const loginWithLdap = useCallback(async ({ username, password }: LoginParams): Promise<LoginResult> => {
    try {
      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        return { success: false, message: 'Username and password are required', code: 'unknown' };
      }

      if (isDesktopRuntime) {
        const result = await loginViaWebui('/api/auth/ldap/login', {
          username: trimmedUsername,
          password,
        });
        if (!result.success) {
          return result;
        }
        if (result.user) {
          clearAuthUserRequestBackoff();
          setUser(result.user);
          setStatus('authenticated');
          setReady(true);
          dispatchWebuiConfigRefresh();
          window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
        } else {
          await refresh();
        }
        return result;
      }

      const response = await fetch('/api/auth/ldap/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(withCsrfToken({ username: trimmedUsername, password })),
      });

      const data = (await response.json().catch((): null => null)) as {
        success?: boolean;
        message?: string;
        code?: string;
        user?: AuthUser;
      } | null;
      if (!response.ok || !data?.success || !data?.user) {
        let code: LoginErrorCode = 'unknown';
        let message = data?.message ?? 'Login failed';
        if (data?.code === 'db_unavailable' || response.status === 503) code = 'dbUnavailable';
        else if (response.status === 401) code = 'invalidCredentials';
        else if (response.status === 429) code = 'tooManyAttempts';
        else if (response.status >= 500) code = 'serverError';
        return { success: false, code, message };
      }

      setUser(data.user);
      setStatus('authenticated');
      setReady(true);
      clearAuthUserRequestBackoff();
      dispatchWebuiConfigRefresh();
      window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
      if (typeof window !== 'undefined' && (window as any).__websocketReconnect) {
        (window as any).__websocketReconnect();
      }
      return { success: true, user: data.user };
    } catch (error) {
      console.error('LDAP login request failed:', error);
      return { success: false, message: 'Network error. Please try again.', code: 'networkError' };
    }
  }, [refresh]);

  const logout = useCallback(async (options?: LogoutOptions) => {
    const forceSignOut = options?.force === true;

    const finishLogout = (currentUser: AuthUser | null) => {
      setWebuiDesktopSession(null);
      clearAuthCache();
      if (forceSignOut) {
        setUser(null);
        setStatus('unauthenticated');
      } else {
        setUser(currentUser);
        setStatus(currentUser ? 'authenticated' : 'unauthenticated');
      }
      setReady(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('one-enterprise-context-refresh'));
      }
    };

    if (isDesktopRuntime) {
      try {
        await fetchWebuiApi('/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(withCsrfToken({})),
        });
      } catch (error) {
        console.error('Desktop WebUI logout request failed:', error);
      } finally {
        if (forceSignOut) {
          finishLogout(null);
          return;
        }
        let currentUser: AuthUser | null = null;
        try {
          const response = await fetchWebuiApi('/api/auth/user');
          if (response.ok) {
            const data = (await response.json()) as {
              success?: boolean;
              user?: AuthUser;
            };
            if (data.success && data.user) {
              currentUser = data.user;
            }
          }
        } catch {
          // WebUI session cleared or unavailable.
        }
        finishLogout(currentUser);
      }
      return;
    }

    try {
      await fetchWebuiApi('/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(withCsrfToken({})),
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      finishLogout(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      status,
      login,
      loginWithLdap,
      logout,
      refresh,
      clearAuthCache,
    }),
    [login, loginWithLdap, logout, ready, refresh, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    if (process.env.NODE_ENV === 'test') {
      return {
        ready: true,
        user: null,
        status: 'unauthenticated',
        login: async () => ({ success: false, error: 'AuthProvider not mounted in test context' }),
        loginWithLdap: async () => ({ success: false, error: 'AuthProvider not mounted in test context' }),
        logout: async () => {},
        refresh: async () => {},
        clearAuthCache: () => {},
      };
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
