export function resolveDisplayedFeishuRedirectUri(configuredRedirectUri: string, currentOrigin: string): string {
  const configured = configuredRedirectUri.trim();
  if (configured) {
    return configured;
  }

  const origin = currentOrigin.trim().replace(/\/+$/, '');
  return origin ? `${origin}/api/auth/feishu/callback` : '';
}
