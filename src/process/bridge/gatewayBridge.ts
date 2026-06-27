import { gatewayApi } from '@/common/adapter/ipcBridge';

export function initGatewayBridge(): void {
  gatewayApi.fetch.provider(async ({ url, apiKey }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'follow',
      });
      const body = await res.text();
      return {
        status: res.status,
        body,
        contentType: res.headers.get('content-type') ?? '',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
