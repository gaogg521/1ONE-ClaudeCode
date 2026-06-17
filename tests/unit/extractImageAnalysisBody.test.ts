/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { extractImageAnalysisBody } from '@process/services/imageAnalysisPrefetch';

describe('extractImageAnalysisBody', () => {
  it('extracts text after Model response wrapper', () => {
    const raw =
      'Image generation did not produce any images.\n\nModel response: 这张截图展示了 1ONE Code 界面。';
    expect(extractImageAnalysisBody(raw)).toBe('这张截图展示了 1ONE Code 界面。');
  });

  it('returns empty when only the no-images warning is present', () => {
    expect(extractImageAnalysisBody('Image generation did not produce any images.')).toBe('');
  });
});
