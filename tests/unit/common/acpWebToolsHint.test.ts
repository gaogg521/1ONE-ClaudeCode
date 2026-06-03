import { describe, expect, it } from 'vitest';
import {
  buildWebToolsReminderForUserMessage,
  isReadOnlyUrlFetchCommand,
  userMessageNeedsWebTools,
} from '@/common/web/acpWebToolsHint';

describe('acpWebToolsHint', () => {
  it('detects URL and search intents', () => {
    expect(userMessageNeedsWebTools('https://api.luanti.org/ 总结一下')).toBe(true);
    expect(userMessageNeedsWebTools('百度搜索 四大淡水湖')).toBe(true);
    expect(userMessageNeedsWebTools('hello')).toBe(false);
  });

  it('builds reminder for web-related user messages', () => {
    const reminder = buildWebToolsReminderForUserMessage('阅读 https://example.com');
    expect(reminder).toContain('one_web_fetch');
    expect(reminder).toContain('system-reminder');
  });

  it('treats curl -s URL as read-only fetch', () => {
    expect(isReadOnlyUrlFetchCommand('curl -s https://api.luanti.org/')).toBe(true);
    expect(isReadOnlyUrlFetchCommand('curl -X POST https://api.luanti.org/')).toBe(false);
  });
});
