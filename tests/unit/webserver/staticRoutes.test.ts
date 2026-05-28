import { describe, expect, it } from 'vitest';
import { isLocalWebUiHost } from '@process/webserver/routes/staticRoutes';

describe('isLocalWebUiHost', () => {
  it('treats localhost and loopback as local WebUI hosts', () => {
    expect(isLocalWebUiHost(undefined)).toBe(true);
    expect(isLocalWebUiHost('localhost:25809')).toBe(true);
    expect(isLocalWebUiHost('127.0.0.1:25809')).toBe(true);
    expect(isLocalWebUiHost('[::1]:25809')).toBe(true);
  });

  it('treats LAN and remote hosts as non-local WebUI hosts', () => {
    expect(isLocalWebUiHost('172.29.128.120:25809')).toBe(false);
    expect(isLocalWebUiHost('192.168.1.10:25809')).toBe(false);
    expect(isLocalWebUiHost('example.com')).toBe(false);
  });
});
