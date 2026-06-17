import { describe, expect, it } from 'vitest';
import { AIONRS_MESSAGE_SYNC_POLL_MS } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';

describe('AIONRS_MESSAGE_SYNC_POLL_MS', () => {
  it('polls DB frequently while waiting for upstream output', () => {
    expect(AIONRS_MESSAGE_SYNC_POLL_MS).toBeLessThanOrEqual(500);
  });
});
