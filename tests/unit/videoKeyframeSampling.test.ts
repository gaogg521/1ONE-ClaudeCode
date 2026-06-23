/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { computeSampleTimestamps } from '@process/services/attachmentTextExtractor';

describe('computeSampleTimestamps', () => {
  it('returns a single frame at 0 when duration is unknown', () => {
    expect(computeSampleTimestamps(undefined)).toEqual([0]);
    expect(computeSampleTimestamps(0)).toEqual([0]);
  });

  it('samples an 8s clip across the timeline incl. near start and end', () => {
    const ts = computeSampleTimestamps(8);
    expect(ts.length).toBe(5);
    expect(ts[0]).toBe(0); // near start
    expect(ts[ts.length - 1]).toBeCloseTo(7.7, 5); // just before the end (8 - 0.3)
    // strictly increasing
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    }
  });

  it('never exceeds maxFrames', () => {
    expect(computeSampleTimestamps(600).length).toBeLessThanOrEqual(5);
    expect(computeSampleTimestamps(600, 3).length).toBeLessThanOrEqual(3);
  });

  it('uses at least 2 frames for very short clips', () => {
    const ts = computeSampleTimestamps(1);
    expect(ts.length).toBeGreaterThanOrEqual(2);
    expect(ts[0]).toBe(0);
  });

  it('keeps the last sample inside the clip duration', () => {
    for (const d of [2, 5, 8, 30, 120]) {
      const ts = computeSampleTimestamps(d);
      expect(ts[ts.length - 1]).toBeLessThan(d);
      expect(ts[0]).toBeGreaterThanOrEqual(0);
    }
  });
});
