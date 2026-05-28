/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Normalize binary payloads after Electron IPC structured clone / JSON serialization. */
export function normalizeIpcBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    if (record.type === 'Buffer' && Array.isArray(record.data)) {
      return Buffer.from(record.data as number[]);
    }

    if (Array.isArray(record.data)) {
      return Buffer.from(record.data as number[]);
    }

    const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      const values = numericKeys
        .toSorted((a, b) => Number(a) - Number(b))
        .map((key) => {
          const value = record[key];
          return typeof value === 'number' ? value : Number(value ?? 0);
        });
      return Buffer.from(values);
    }
  }

  throw new Error('Invalid avatar data');
}
