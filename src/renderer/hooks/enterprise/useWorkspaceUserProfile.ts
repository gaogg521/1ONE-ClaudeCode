/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkspaceUserProfile } from '@/common/types/workspaceProfile';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { fetchWebuiApi, fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';

function resolveAvatarFetchPath(avatarUrl: string): string {
  if (avatarUrl.startsWith('http')) {
    const parsed = new URL(avatarUrl);
    return `${parsed.pathname}${parsed.search}`;
  }
  return avatarUrl;
}

function isManagedAvatarUrl(avatarUrl: string): boolean {
  return avatarUrl.includes('/api/auth/profile/avatar');
}

export function useWorkspaceUserProfile() {
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const [remoteProfile, setRemoteProfile] = useState<WorkspaceUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null);

  const canFetchRemote = Boolean(
    auth.status === 'authenticated' &&
      auth.user &&
      (!isElectronDesktop() || enterpriseMode.webuiApiBase)
  );

  const refresh = useCallback(async () => {
    if (!canFetchRemote) {
      setRemoteProfile(null);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWebuiApiJson<WorkspaceUserProfile>('/api/auth/workspace-profile');
      setRemoteProfile(data);
    } catch {
      setRemoteProfile(null);
    } finally {
      setLoading(false);
    }
  }, [canFetchRemote]);

  useEffect(() => {
    void refresh();
  }, [refresh, auth.user?.id, enterpriseMode.enterpriseContext?.tenantId]);

  const fallbackProfile = useMemo<WorkspaceUserProfile | null>(() => {
    if (!auth.user || auth.status !== 'authenticated') {
      return null;
    }
    const ctx = enterpriseMode.enterpriseContext;
    const joined = enterpriseMode.hasJoinedEnterprise;
    return {
      userId: auth.user.id,
      username: auth.user.username,
      email: null,
      role: auth.user.role ?? 'member',
      tenantId: ctx?.tenantId ?? auth.user.tenant_id ?? 'default',
      tenantName: ctx?.tenantName ?? null,
      joinedEnterprise: joined,
      avatarUrl: null,
      teams: [],
      updatedAt: Date.now(),
    };
  }, [
    auth.status,
    auth.user,
    enterpriseMode.enterpriseContext,
    enterpriseMode.hasJoinedEnterprise,
  ]);

  const profile = remoteProfile ?? fallbackProfile;

  useEffect(() => {
    if (!profile?.avatarUrl) {
      setAvatarDisplayUrl(null);
      return;
    }

    if (profile.avatarUrl.startsWith('http') && !isManagedAvatarUrl(profile.avatarUrl)) {
      setAvatarDisplayUrl(profile.avatarUrl);
      return;
    }

    if (!canFetchRemote) {
      setAvatarDisplayUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void fetchWebuiApi(resolveAvatarFetchPath(profile.avatarUrl))
      .then((response) => {
        if (!response.ok) {
          throw new Error('avatar fetch failed');
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setAvatarDisplayUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setAvatarDisplayUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [canFetchRemote, profile?.avatarUrl]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!canFetchRemote) {
        throw new Error('WEBUI_NOT_RUNNING');
      }
      const formData = new FormData();
      formData.append('avatar', file);
      const data = await fetchWebuiApiJson<WorkspaceUserProfile>('/api/auth/profile/avatar', {
        method: 'POST',
        body: formData,
      });
      setRemoteProfile(data);
      return data;
    },
    [canFetchRemote]
  );

  return {
    profile,
    loading,
    refresh,
    uploadAvatar,
    avatarDisplayUrl,
    canUploadAvatar: canFetchRemote,
    visible: Boolean(profile && auth.status === 'authenticated'),
  };
}
