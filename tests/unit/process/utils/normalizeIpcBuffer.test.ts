/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeIpcBuffer } from '@process/utils/normalizeIpcBuffer';

describe('normalizeIpcBuffer', () => {
  it('accepts Uint8Array', () => {
    expect(normalizeIpcBuffer(new Uint8Array([1, 2, 3]))).toEqual(Buffer.from([1, 2, 3]));
  });

  it('accepts Buffer', () => {
    expect(normalizeIpcBuffer(Buffer.from([4, 5]))).toEqual(Buffer.from([4, 5]));
  });

  it('accepts numeric arrays', () => {
    expect(normalizeIpcBuffer([7, 8, 9])).toEqual(Buffer.from([7, 8, 9]));
  });

  it('accepts serialized Buffer JSON', () => {
    expect(normalizeIpcBuffer({ type: 'Buffer', data: [10, 11] })).toEqual(Buffer.from([10, 11]));
  });

  it('accepts Electron IPC typed-array-like objects', () => {
    expect(normalizeIpcBuffer({ 0: 1, 1: 2, 2: 3 })).toEqual(Buffer.from([1, 2, 3]));
  });

  it('accepts nested data arrays from IPC wrappers', () => {
    expect(normalizeIpcBuffer({ data: [12, 13] })).toEqual(Buffer.from([12, 13]));
  });

  it('throws for unsupported payloads', () => {
    expect(() => normalizeIpcBuffer({ foo: 'bar' })).toThrow('Invalid avatar data');
  });
});
