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
import { getBundledFfmpegPath } from '@process/utils/shellEnv';

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

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractPptxText(filePath: string): Promise<string> {
  const parser = new PPTX2Json();
  const json = (await parser.toJson(filePath)) as Record<string, unknown>;
  const slides = Object.entries(json)
    .filter(([key]) => /^ppt\/slides\/slide\d+\.xml$/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

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
async function transcribeMediaFile(filePath: string, isVideo: boolean): Promise<string | null> {
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
    const config = await ProcessConfig.get('tools.speechToText').catch((): null => null);
    if (!config || !config.enabled) return null;

    const audioBuffer = await fs.readFile(audioPath);
    const ext = extname(audioPath).toLowerCase();
    const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : ext === '.flac' ? 'audio/flac' : 'audio/mpeg';
    const fileName = path.basename(audioPath);

    const result = await SpeechToTextService.transcribe({
      audioBuffer: new Uint8Array(audioBuffer),
      fileName,
      mimeType,
    });
    return result?.text?.trim() || null;
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

async function withParseTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Parsing ${label} timed out after ${ATTACHMENT_PARSE_TIMEOUT_MS / 1000}s. The file may be too large or corrupt.`));
        }, ATTACHMENT_PARSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function extractAttachmentText(
  filePath: string,
  maxChars = DEFAULT_ATTACHMENT_MAX_CHARS
): Promise<AttachmentExtractSection | null> {
  // Audio/video files: try to transcribe via configured STT provider.
  // If STT is disabled or fails, fall back to a clear note so the agent
  // knows the file exists and can use a tool to process it.
  if (isAudioFilePath(filePath) || isVideoFilePath(filePath)) {
    const fileName = getAttachmentFileName(filePath);
    const kind = isAudioFilePath(filePath) ? 'audio' : 'video';
    const isVideo = kind === 'video';

    const transcript = await withParseTimeout(fileName, () => transcribeMediaFile(filePath, isVideo));
    if (transcript) {
      const { text, truncated } = truncateText(transcript, maxChars);
      return {
        filePath,
        fileName,
        kind,
        text: truncated ? `${text}\n…` : text,
        truncated,
      };
    }

    // Diagnose failure: STT disabled / ffmpeg missing / transcription error
    const sttConfig = await ProcessConfig.get('tools.speechToText').catch((): null => null);
    let hint: string;
    if (!sttConfig?.enabled) {
      hint = `Automatic transcription is disabled. Enable it in Settings → Speech-to-Text, or use a tool (ffmpeg + whisper) to process ${fileName}.`;
    } else if (isVideo && !getBundledFfmpegPath() && !(await isFfmpegOnPath())) {
      hint = `Video transcription requires ffmpeg, which is not installed. Install ffmpeg (https://ffmpeg.org/download.html) and add it to PATH, or use a tool to process ${fileName} manually.`;
    } else {
      hint = `Transcription failed. The agent should use a tool (ffmpeg + whisper) to process ${fileName}, or the user should provide a text summary.`;
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
      return {
        filePath,
        fileName,
        kind,
        text: '',
        truncated: false,
        error:
          kind === 'pdf'
            ? 'No extractable text found. This PDF may be scanned/image-based with no embedded text layer. Try converting it to text or uploading as an image.'
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
  options?: { maxCharsPerFile?: number; maxTotalChars?: number }
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

    const section = await extractAttachmentText(filePath, Math.min(maxCharsPerFile, remaining));
    if (!section) {
      continue;
    }
    sections.push(section);
    totalChars += section.text.length;
  }

  return formatAttachmentContextBlock(sections);
}
