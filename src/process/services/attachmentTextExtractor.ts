/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx-republish';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import PPTX2Json from 'pptx2json';
import type { TProviderWithModel } from '@/common/config/storage';
import { extname } from '@/common/chat/pathUtils';
import {
  DEFAULT_ATTACHMENT_MAX_CHARS,
  DEFAULT_ATTACHMENT_TOTAL_MAX_CHARS,
  formatAttachmentContextBlock,
  getAttachmentFileName,
  isExtractableAttachmentPath,
  type AttachmentExtractSection,
} from '@/common/chat/attachmentContext';
import { isAudioFilePath, isVideoFilePath } from '@/common/chat/messageFiles';
import { SpeechToTextService } from '@process/bridge/services/SpeechToTextService';
import { ProcessConfig } from '@process/utils/initStorage';
import { getBundledFfmpegPath, getBundledFfprobePath } from '@process/utils/shellEnv';

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  return { text: `${normalized.slice(0, maxChars)}\n…`, truncated: true };
}

async function extractPdfText(filePath: string, buffer: Buffer): Promise<string> {
  // Cap pages to avoid blocking the main process on huge PDFs (pdf-parse runs
  // synchronously on the event loop — a 500-page PDF freezes all IPC for ~30s).
  // 50 pages covers most documents; longer ones truncate with a marker.
  const MAX_PAGES = 50;
  const result = await pdfParse(buffer, { max: MAX_PAGES });
  const text = result.text || '';
  if (result.numpages && result.numpages > MAX_PAGES) {
    return `${text}\n\n[PDF truncated: extracted first ${MAX_PAGES} of ${result.numpages} pages]`;
  }
  return text;
}

/**
 * Render the first PDF page to PNG via pdftoppm (poppler-utils).
 * Returns the image path, or null when poppler is unavailable.
 */
async function renderPdfFirstPagePng(pdfPath: string): Promise<string | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'one-pdf-page-'));
  const outputPrefix = path.join(tmpDir, 'page');
  return new Promise((resolve) => {
    const proc = spawn('pdftoppm', ['-png', '-f', '1', '-l', '1', '-r', '150', pdfPath, outputPrefix], {
      stdio: 'ignore',
      windowsHide: true,
    });
    proc.on('error', () => {
      void fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      resolve(null);
    });
    proc.on('exit', (code) => {
      void (async () => {
        if (code !== 0) {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          resolve(null);
          return;
        }
        const files = await fs.readdir(tmpDir);
        const png = files.find((file) => file.endsWith('.png'));
        resolve(png ? path.join(tmpDir, png) : null);
      })();
    });
  });
}

async function describeScannedPdfFirstPage(filePath: string, visionModel: TProviderWithModel): Promise<string | null> {
  const pageImage = await renderPdfFirstPagePng(filePath);
  if (!pageImage) {
    return null;
  }
  try {
    const { describeImage } = await import('@process/services/visionDescribe');
    return await describeImage(pageImage, visionModel);
  } finally {
    await fs.rm(path.dirname(pageImage), { recursive: true, force: true }).catch(() => {});
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractPptxText(filePath: string): Promise<string> {
  const parser = new PPTX2Json();
  const json = (await parser.toJson(filePath)) as Record<string, unknown>;
  const slides = Object.entries(json)
    .filter(([key]) => /^ppt\/slides\/slide\d+\.xml$/i.test(key))
    .toSorted(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  const chunks: string[] = [];
  for (const [slideKey, slideXml] of slides) {
    const slideNumber = slideKey.match(/slide(\d+)\.xml/i)?.[1] ?? '?';
    const xml = String(slideXml ?? '');
    const textMatches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) =>
      match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    );
    const slideText = textMatches.filter(Boolean).join('\n').trim();
    if (slideText) {
      chunks.push(`Slide ${slideNumber}:\n${slideText}`);
    }
  }
  return chunks.join('\n\n');
}

function extractXlsxText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const chunks: string[] = [];
  // Cap sheets to avoid blocking the main process on workbooks with hundreds
  // of sheets (each sheet_to_csv call is synchronous).
  const MAX_SHEETS = 20;
  const sheets = workbook.SheetNames.slice(0, MAX_SHEETS);
  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    if (csv) {
      chunks.push(`Sheet ${sheetName}:\n${csv}`);
    }
  }
  if (workbook.SheetNames.length > MAX_SHEETS) {
    chunks.push(`[Workbook truncated: extracted first ${MAX_SHEETS} of ${workbook.SheetNames.length} sheets]`);
  }
  return chunks.join('\n\n');
}

async function extractPlainText(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8');
}

/**
 * Extract audio track from a video file using ffmpeg, returning a temp mp3 path.
 * Prefers the bundled ffmpeg binary; falls back to system PATH. Returns null
 * if ffmpeg is unavailable or extraction fails.
 */
async function extractAudioTrackFromVideo(videoPath: string): Promise<string | null> {
  const bundledFfmpeg = getBundledFfmpegPath();
  const ffmpegCmd = bundledFfmpeg ?? 'ffmpeg';
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'one-video-audio-'));
  const audioPath = path.join(tmpDir, 'audio.mp3');
  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegCmd, ['-y', '-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', audioPath], {
      stdio: 'ignore',
      windowsHide: true,
    });
    ffmpeg.on('error', () => resolve(null));
    ffmpeg.on('exit', (code) => {
      if (code === 0) resolve(audioPath);
      else resolve(null);
    });
  });
}

type VideoMeta = {
  durationSec?: number;
  width?: number;
  height?: number;
  creationTime?: string;
  recorder?: string;
};

/**
 * Probe video metadata (duration, resolution, recording tool, creation time) via
 * ffprobe — cheap and highly informative, and lets us sample keyframes by time.
 * Returns null when ffprobe is unavailable or the file can't be parsed.
 */
async function probeVideoMetadata(videoPath: string): Promise<VideoMeta | null> {
  const ffprobe = getBundledFfprobePath() ?? 'ffprobe';
  return new Promise((resolve) => {
    let out = '';
    const proc = spawn(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath], {
      windowsHide: true,
    });
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const json = JSON.parse(out) as {
          streams?: Array<Record<string, unknown>>;
          format?: Record<string, unknown>;
        };
        const video = (json.streams || []).find((s) => s.codec_type === 'video') ?? {};
        const format = json.format || {};
        const fTags = (format.tags as Record<string, unknown>) || {};
        const vTags = (video.tags as Record<string, unknown>) || {};
        const durRaw = (format.duration ?? video.duration) as string | undefined;
        resolve({
          durationSec: durRaw ? Math.round(parseFloat(durRaw)) : undefined,
          width: typeof video.width === 'number' ? video.width : undefined,
          height: typeof video.height === 'number' ? video.height : undefined,
          creationTime: (fTags.creation_time ?? vTags.creation_time) as string | undefined,
          recorder: (fTags.encoder ?? fTags.comment ?? vTags.handler_name) as string | undefined,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

function formatVideoMeta(meta: VideoMeta): string {
  const bits: string[] = [];
  if (meta.durationSec) bits.push(`duration ~${meta.durationSec}s`);
  if (meta.width && meta.height) bits.push(`resolution ${meta.width}x${meta.height}`);
  if (meta.creationTime) bits.push(`recorded ${meta.creationTime}`);
  if (meta.recorder) bits.push(`tool ${meta.recorder}`);
  return bits.join(', ');
}

/**
 * Compute up to `maxFrames` evenly-spaced sample timestamps across the video,
 * including a frame near the start and one just before the end. Mirrors the
 * "1s / 4s / 7s + first/last" sampling a human would pick for short clips.
 */
export function computeSampleTimestamps(durationSec: number | undefined, maxFrames = 5): number[] {
  if (!durationSec || durationSec <= 0) return [0];
  const n = Math.min(maxFrames, Math.max(2, Math.ceil(durationSec)));
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = (i / (n - 1)) * durationSec;
    if (i === n - 1) t = Math.max(0, durationSec - 0.3); // avoid black trailing frame
    ts.push(Math.round(t * 10) / 10);
  }
  return [...new Set(ts)];
}

/** Extract a single frame at timestamp `ts` (seconds) to `outPath`. */
async function extractFrameAt(videoPath: string, ts: number, outPath: string): Promise<boolean> {
  const ffmpegCmd = getBundledFfmpegPath() ?? 'ffmpeg';
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegCmd,
      ['-y', '-ss', String(ts), '-i', videoPath, '-frames:v', '1', '-q:v', '2', '-vf', 'scale=768:-1', outPath],
      { stdio: 'ignore', windowsHide: true }
    );
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Describe a video's visual content by sampling keyframes across its timeline
 * (duration-aware) and running each through the configured vision model. Frames
 * are described in parallel; the temp dir is always cleaned up. Returns null when
 * no frame could be described.
 */
async function describeVideoKeyframes(
  videoPath: string,
  visionModel: TProviderWithModel,
  meta: VideoMeta | null
): Promise<string | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'one-video-frames-'));
  try {
    const timestamps = computeSampleTimestamps(meta?.durationSec);
    const frames: Array<{ path: string; ts: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const outPath = path.join(tmpDir, `frame_${i}.png`);
      if (await extractFrameAt(videoPath, timestamps[i], outPath)) {
        if (
          await fs
            .access(outPath)
            .then(() => true)
            .catch(() => false)
        ) {
          frames.push({ path: outPath, ts: timestamps[i] });
        }
      }
    }
    if (frames.length === 0) return null;

    const { describeImage } = await import('@process/services/visionDescribe');
    const described = await Promise.all(
      frames.map((f) => describeImage(f.path, visionModel).catch((): string | null => null))
    );
    const parts = described.map((d, i) => (d ? `[Frame @${frames[i].ts}s]\n${d}` : '')).filter(Boolean);
    return parts.length > 0 ? parts.join('\n\n') : null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Check if ffmpeg is available on system PATH (used when bundled binary absent).
 */
async function isFfmpegOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true });
    ffmpeg.on('error', () => resolve(false));
    ffmpeg.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Transcribe an audio/video file via the configured SpeechToText provider.
 * Returns the transcript text, or null if STT is disabled / unavailable.
 */
async function transcribeMediaFile(
  filePath: string,
  isVideo: boolean,
  fallbackProvider?: TProviderWithModel
): Promise<string | null> {
  let audioPath = filePath;
  let tempAudioPath: string | null = null;

  // For video files, extract the audio track first (STT providers only accept audio)
  if (isVideo) {
    const extracted = await extractAudioTrackFromVideo(filePath);
    if (!extracted) return null;
    audioPath = extracted;
    tempAudioPath = extracted;
  }

  try {
    const audioBuffer = await fs.readFile(audioPath);
    const ext = extname(audioPath).toLowerCase();
    const mimeType =
      ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : ext === '.flac' ? 'audio/flac' : 'audio/mpeg';
    const fileName = path.basename(audioPath);
    const request = { audioBuffer: new Uint8Array(audioBuffer), fileName, mimeType };

    // 1) Explicitly configured STT provider takes precedence.
    const config = await ProcessConfig.get('tools.speechToText').catch((): null => null);
    if (config?.enabled) {
      const result = await SpeechToTextService.transcribe(request).catch((): null => null);
      if (result?.text?.trim()) return result.text.trim();
    }

    // 2) Best-effort fallback: try the chat/vision provider's OpenAI-compatible
    //    /audio/transcriptions endpoint (many gateways proxy Whisper) so audio
    //    works out of the box. Fails fast → caller shows an actionable note.
    if (fallbackProvider?.apiKey && fallbackProvider.baseUrl) {
      const result = await SpeechToTextService.transcribeDirect(request, {
        baseUrl: fallbackProvider.baseUrl,
        apiKey: fallbackProvider.apiKey,
        model: 'whisper-1',
      }).catch((): null => null);
      if (result?.text?.trim()) return result.text.trim();
    }

    return null;
  } catch {
    return null;
  } finally {
    if (tempAudioPath) {
      await fs.rm(path.dirname(tempAudioPath), { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Wrap a parser call with a timeout so a single huge/corrupt file cannot
 * freeze the main process. All parsers above (pdf-parse, mammoth, pptx2json,
 * xlsx) run synchronously on the event loop — without this guard a 200MB
 * Excel file blocks all IPC for minutes.
 */
const ATTACHMENT_PARSE_TIMEOUT_MS = 15_000;
// Media (audio/video) legitimately takes longer: ffmpeg extraction + remote STT +
// keyframe vision. Use a generous bound so transcription is not cut off mid-flight.
const MEDIA_PARSE_TIMEOUT_MS = 120_000;

async function withParseTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs = ATTACHMENT_PARSE_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`Parsing ${label} timed out after ${timeoutMs / 1000}s. The file may be too large or corrupt.`)
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function extractAttachmentText(
  filePath: string,
  maxChars = DEFAULT_ATTACHMENT_MAX_CHARS,
  options?: { visionModel?: TProviderWithModel }
): Promise<AttachmentExtractSection | null> {
  // Audio/video files: try to transcribe via configured STT provider.
  // If STT is disabled or fails, fall back to a clear note so the agent
  // knows the file exists and can use a tool to process it.
  if (isAudioFilePath(filePath) || isVideoFilePath(filePath)) {
    const fileName = getAttachmentFileName(filePath);
    const kind = isAudioFilePath(filePath) ? 'audio' : 'video';
    const isVideo = kind === 'video';

    // ffprobe metadata first (duration/resolution/recorder) — cheap, informative,
    // and drives time-based keyframe sampling below.
    const meta = isVideo ? await probeVideoMetadata(filePath).catch((): null => null) : null;

    const transcript = await withParseTimeout(
      fileName,
      () => transcribeMediaFile(filePath, isVideo, options?.visionModel),
      MEDIA_PARSE_TIMEOUT_MS
    );

    // For video, also describe the visual track via duration-aware keyframe sampling
    // + vision so the model understands the picture, not only the spoken audio.
    // Works even when STT is off (visual-only understanding). Has its own per-frame
    // timeout, so it is not wrapped in the short parse-timeout guard.
    let visualText: string | null = null;
    if (isVideo && options?.visionModel?.apiKey && options.visionModel.useModel) {
      visualText = await describeVideoKeyframes(filePath, options.visionModel, meta).catch((): string | null => null);
    }

    const parts: string[] = [];
    if (meta) {
      const metaLine = formatVideoMeta(meta);
      if (metaLine) parts.push(`[Video metadata]\n${metaLine}`);
    }
    if (transcript) parts.push(`[Audio transcript]\n${transcript}`);
    if (visualText) parts.push(`[Video keyframes]\n${visualText}`);
    // Metadata alone (no transcript/visual) is still useful, but flag the gap.
    if (parts.length > 0 && !transcript && !visualText) {
      parts.push(
        '(No audio transcript or visual analysis available. Configure Settings → Speech-to-Text or a vision-capable model for deeper analysis.)'
      );
    }
    if (parts.length > 0) {
      const { text, truncated } = truncateText(parts.join('\n\n'), maxChars);
      return {
        filePath,
        fileName,
        kind,
        text: truncated ? `${text}\n…` : text,
        truncated,
      };
    }

    // Diagnose failure: STT disabled / ffmpeg missing / transcription error.
    // (By this point the configured STT provider AND the best-effort gateway
    // Whisper fallback have both already been tried.)
    const sttConfig = await ProcessConfig.get('tools.speechToText').catch((): null => null);
    let hint: string;
    if (isVideo && !getBundledFfmpegPath() && !(await isFfmpegOnPath())) {
      hint = `Video transcription requires ffmpeg, which is not installed. Install ffmpeg (https://ffmpeg.org/download.html) and add it to PATH, or use a tool to process ${fileName} manually.`;
    } else if (!sttConfig?.enabled) {
      hint = `Could not transcribe automatically (no Speech-to-Text provider configured and the current model's gateway has no Whisper endpoint). Configure Settings → Speech-to-Text, or provide a text summary of ${fileName}.`;
    } else {
      hint = `Transcription failed. Check the Speech-to-Text provider settings, or provide a text summary of ${fileName}.`;
    }
    return {
      filePath,
      fileName,
      kind,
      text: '',
      truncated: false,
      error: `${kind === 'audio' ? 'Audio' : 'Video'} file attached. ${hint}`,
    };
  }

  if (!isExtractableAttachmentPath(filePath)) {
    return null;
  }

  const fileName = getAttachmentFileName(filePath);
  const ext = extname(filePath);

  try {
    const buffer = await fs.readFile(filePath);
    let rawText = '';
    let kind = ext.slice(1) || 'file';

    switch (ext) {
      case '.pdf':
        rawText = await withParseTimeout(fileName, () => extractPdfText(filePath, buffer));
        kind = 'pdf';
        break;
      case '.docx':
        rawText = await withParseTimeout(fileName, () => extractDocxText(buffer));
        kind = 'docx';
        break;
      case '.doc':
        // Legacy OLE .doc is not supported by mammoth (OpenXML only).
        return {
          filePath,
          fileName,
          kind: 'doc',
          text: '',
          truncated: false,
          error: 'Legacy .doc (Office 97-2003) is not supported. Please convert to .docx and re-upload.',
        };
      case '.pptx':
        rawText = await withParseTimeout(fileName, () => extractPptxText(filePath));
        kind = 'pptx';
        break;
      case '.ppt':
        return {
          filePath,
          fileName,
          kind: 'ppt',
          text: '',
          truncated: false,
          error: 'Legacy .ppt (Office 97-2003) is not supported. Please convert to .pptx and re-upload.',
        };
      case '.xlsx':
        rawText = await withParseTimeout(fileName, () => Promise.resolve(extractXlsxText(buffer)));
        kind = 'excel';
        break;
      case '.xls':
        return {
          filePath,
          fileName,
          kind: 'xls',
          text: '',
          truncated: false,
          error: 'Legacy .xls (Office 97-2003) is not supported. Please convert to .xlsx and re-upload.',
        };
      default:
        rawText = await extractPlainText(buffer);
        break;
    }

    const { text, truncated } = truncateText(rawText, maxChars);
    if (!text) {
      if (kind === 'pdf' && options?.visionModel?.apiKey && options.visionModel.useModel) {
        const visionText = await withParseTimeout(fileName, () =>
          describeScannedPdfFirstPage(filePath, options.visionModel as TProviderWithModel)
        );
        if (visionText?.trim()) {
          const visionResult = truncateText(`[Scanned PDF — page 1 vision OCR]\n${visionText.trim()}`, maxChars);
          return {
            filePath,
            fileName,
            kind,
            text: visionResult.text,
            truncated: visionResult.truncated,
          };
        }
      }
      return {
        filePath,
        fileName,
        kind,
        text: '',
        truncated: false,
        error:
          kind === 'pdf'
            ? 'No extractable text found. This PDF may be scanned/image-based with no embedded text layer. Install poppler-utils (pdftoppm) and configure a vision-capable model for OCR, or convert the PDF to text.'
            : 'No extractable text found',
      };
    }

    return { filePath, fileName, kind, text, truncated };
  } catch (error) {
    return {
      filePath,
      fileName,
      kind: ext.slice(1) || 'file',
      text: '',
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildAttachmentContextBlock(
  filePaths: string[],
  options?: { maxCharsPerFile?: number; maxTotalChars?: number; visionModel?: TProviderWithModel }
): Promise<string> {
  const maxCharsPerFile = options?.maxCharsPerFile ?? DEFAULT_ATTACHMENT_MAX_CHARS;
  const maxTotalChars = options?.maxTotalChars ?? DEFAULT_ATTACHMENT_TOTAL_MAX_CHARS;

  const sections: AttachmentExtractSection[] = [];
  let totalChars = 0;

  for (const filePath of filePaths) {
    // extractAttachmentText handles both extractable docs and audio/video
    // (which return an error note instead of text). Skip only truly unknown
    // types that extractAttachmentText returns null for.
    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) {
      break;
    }

    const section = await extractAttachmentText(filePath, Math.min(maxCharsPerFile, remaining), {
      visionModel: options?.visionModel,
    });
    if (!section) {
      continue;
    }
    sections.push(section);
    totalChars += section.text.length;
  }

  return formatAttachmentContextBlock(sections);
}
