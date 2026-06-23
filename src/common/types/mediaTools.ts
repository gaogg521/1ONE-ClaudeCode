/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type FfmpegToolSource = 'bundled' | 'downloaded' | 'path' | 'none';

export type FfmpegToolInfo = {
  available: boolean;
  source: FfmpegToolSource;
  path?: string;
};

export type FfmpegStatus = {
  ffmpeg: FfmpegToolInfo;
  ffprobe: FfmpegToolInfo;
  /** True when both ffmpeg and ffprobe are usable. */
  ready: boolean;
  /** Directory the in-app downloader writes to. */
  toolsDir: string;
};

export type FfmpegDownloadProgress = {
  phase: 'downloading' | 'extracting' | 'installing';
  receivedBytes?: number;
  totalBytes?: number;
};
