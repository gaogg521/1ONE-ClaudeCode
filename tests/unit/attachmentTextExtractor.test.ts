/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { describeImage, pdfParseMock } = vi.hoisted(() => ({
  describeImage: vi.fn(),
  pdfParseMock: vi.fn(),
}));

vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: pdfParseMock,
}));

vi.mock('@process/services/visionDescribe', () => ({
  describeImage,
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

import { spawn } from 'child_process';
import { extractAttachmentText } from '@process/services/attachmentTextExtractor';
import fs from 'fs/promises';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFile: vi.fn(async () => Buffer.from('pdf')),
      mkdtemp: vi.fn(async () => 'C:/tmp/one-pdf-page-abc'),
      readdir: vi.fn(async () => ['page-1.png']),
      rm: vi.fn(async () => undefined),
    },
  };
});

describe('extractAttachmentText PDF vision fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfParseMock.mockResolvedValue({ text: '', numpages: 1 });
    describeImage.mockResolvedValue('Invoice total: $42');
  });

  it('uses vision OCR when embedded PDF text is empty', async () => {
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockImplementation((_cmd, _args, _opts) => {
      return {
        on: (event: string, handler: (code: number) => void) => {
          if (event === 'exit') {
            queueMicrotask(() => handler(0));
          }
        },
      } as never;
    });

    const section = await extractAttachmentText('C:/tmp/scan.pdf', 4000, {
      visionModel: {
        platform: 'openai',
        name: 'openai',
        useModel: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
      },
    });

    expect(section?.text).toContain('Scanned PDF');
    expect(section?.text).toContain('Invoice total: $42');
    expect(describeImage).toHaveBeenCalled();
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith('C:/tmp/scan.pdf');
  });
});
