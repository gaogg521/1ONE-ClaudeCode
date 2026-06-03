/**
 * Dev desktop renderer (Vite) must use IPv4 loopback on Windows.
 * Default Vite bind can listen on ::1 only while Chromium/Electron often prefers 127.0.0.1 → hang/white screen.
 *
 * @license Apache-2.0
 */

export const DEV_VITE_HOST = '127.0.0.1';

function isIpv6LoopbackHost(hostname: string): boolean {
  return hostname === '::1' || hostname === '[::1]';
}

function shouldUseIpv4Loopback(hostname: string): boolean {
  return hostname === 'localhost' || isIpv6LoopbackHost(hostname);
}

/** Normalize electron-vite / env URL to IPv4 loopback for probes and loadURL. */
export function resolveDevRendererUrl(rendererUrl: string): string {
  try {
    const url = new URL(rendererUrl);
    if (shouldUseIpv4Loopback(url.hostname)) {
      url.hostname = DEV_VITE_HOST;
    }
    return url.href;
  } catch {
    return rendererUrl;
  }
}

export function resolveDevViteHost(rendererUrl: string | undefined): string {
  if (!rendererUrl) {
    return DEV_VITE_HOST;
  }
  try {
    const hostname = new URL(rendererUrl).hostname;
    if (shouldUseIpv4Loopback(hostname)) {
      return DEV_VITE_HOST;
    }
    return hostname;
  } catch {
    return DEV_VITE_HOST;
  }
}
