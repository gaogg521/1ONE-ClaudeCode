/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
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
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    if (csv) {
      chunks.push(`Sheet ${sheetName}:\n${csv}`);
    }
  }
  return chunks.join('\n\n');
}

async function extractPlainText(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8');
}

export async function extractAttachmentText(
  filePath: string,
  maxChars = DEFAULT_ATTACHMENT_MAX_CHARS
): Promise<AttachmentExtractSection | null> {
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
        rawText = await extractPdfText(filePath, buffer);
        kind = 'pdf';
        break;
      case '.docx':
        rawText = await extractDocxText(buffer);
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
        rawText = await extractPptxText(filePath);
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
        rawText = extractXlsxText(buffer);
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
    if (!isExtractableAttachmentPath(filePath)) {
      continue;
    }
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
