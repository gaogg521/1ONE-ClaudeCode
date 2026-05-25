import { describe, expect, it } from 'vitest';
import { resolveDisplayedFeishuRedirectUri } from '@/renderer/utils/feishuProviderDisplay';

describe('resolveDisplayedFeishuRedirectUri', () => {
  it('prefers the configured redirect uri over the local browser origin', () => {
    expect(
      resolveDisplayedFeishuRedirectUri(
        'http://192.168.11.159:25809/api/auth/feishu/callback',
        'http://localhost:25809'
      )
    ).toBe('http://192.168.11.159:25809/api/auth/feishu/callback');
  });

  it('falls back to the current origin callback path when config is empty', () => {
    expect(resolveDisplayedFeishuRedirectUri('', 'http://localhost:25809')).toBe(
      'http://localhost:25809/api/auth/feishu/callback'
    );
  });
});
