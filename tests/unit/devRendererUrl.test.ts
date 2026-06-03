import { describe, expect, it } from 'vitest';
import { DEV_VITE_HOST, resolveDevRendererUrl, resolveDevViteHost } from '@/common/config/devRendererUrl';

describe('devRendererUrl', () => {
  it('maps localhost renderer URL to IPv4 loopback', () => {
    expect(resolveDevRendererUrl('http://localhost:5173/')).toBe('http://127.0.0.1:5173/');
    expect(resolveDevRendererUrl('http://localhost:5174')).toBe('http://127.0.0.1:5174/');
  });

  it('maps ::1 renderer URL to IPv4 loopback', () => {
    expect(resolveDevRendererUrl('http://[::1]:5173/')).toBe('http://127.0.0.1:5173/');
  });

  it('keeps explicit 127.0.0.1 URL', () => {
    expect(resolveDevRendererUrl('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/');
  });

  it('resolveDevViteHost defaults to IPv4 loopback', () => {
    expect(resolveDevViteHost(undefined)).toBe(DEV_VITE_HOST);
    expect(resolveDevViteHost('http://localhost:5173')).toBe(DEV_VITE_HOST);
  });
});
