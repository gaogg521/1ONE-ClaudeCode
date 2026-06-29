/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process TCP server that backs the `export_to_pdf` MCP tool.
 *
 * The aionrs binary spawns `builtin-mcp-export-pdf.js` as a stdio MCP server.
 * That script forwards tool calls here over TCP (4-byte BE length header + JSON).
 * This server invokes the shared PDF conversion logic from exportBridge.ts.
 */

import net from 'net';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import {
  renderHtmlToPdfBuffer,
  convertViaWindowsCom,
  convertViaSoffice,
  convertViaOfficecliHtml,
  detectNativeOfficeConverter,
} from '@process/bridge/exportBridge';

const START_PORT = 19820;
const MAX_PORT_ATTEMPTS = 10;

type ExportRequest = {
  source: string;
  source_type: 'html' | 'html_file' | 'office_file';
  output_path?: string;
};

type ExportResponse = {
  success: boolean;
  file_path?: string;
  error?: string;
};

let server: net.Server | null = null;
let currentPort = 0;

function writeTcpMessage(socket: net.Socket, data: unknown): void {
  const json = JSON.stringify(data);
  const body = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

function createTcpMessageReader(onMessage: (msg: unknown) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) break;
      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      buffer = buffer.subarray(4 + bodyLen);
      try {
        onMessage(JSON.parse(jsonStr));
      } catch {
        // Malformed JSON — skip
      }
    }
  };
}

async function handleExportRequest(req: ExportRequest): Promise<ExportResponse> {
  const { source, source_type, output_path } = req;

  if (!output_path) {
    return { success: false, error: 'output_path is required' };
  }
  if (!source) {
    return { success: false, error: 'source is required' };
  }

  try {
    if (source_type === 'html') {
      const pdfBuffer = await renderHtmlToPdfBuffer(source);
      await writeFile(output_path, pdfBuffer);
      return { success: true, file_path: output_path };
    }

    // html_file + office_file both need a real file on disk
    if (!existsSync(source)) {
      return { success: false, error: `Source file not found: ${source}` };
    }

    if (source_type === 'html_file') {
      const { readFile } = await import('fs/promises');
      const html = await readFile(source, 'utf-8');
      const pdfBuffer = await renderHtmlToPdfBuffer(html);
      await writeFile(output_path, pdfBuffer);
      return { success: true, file_path: output_path };
    }

    // office_file: COM / soffice / fallback
    const ext = path.extname(source).toLowerCase();
    if (!['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].includes(ext)) {
      return { success: false, error: `Unsupported office file type: ${ext}` };
    }

    const { hasNative, sofficePath } = await detectNativeOfficeConverter();
    try {
      if (hasNative) {
        if (process.platform === 'win32') {
          await convertViaWindowsCom(source, output_path);
        } else if (sofficePath) {
          await convertViaSoffice(source, output_path, sofficePath);
        }
      } else {
        await convertViaOfficecliHtml(source, output_path);
      }
      return { success: true, file_path: output_path };
    } catch (e) {
      // Native failed — try fallback before giving up
      try {
        await convertViaOfficecliHtml(source, output_path);
        return { success: true, file_path: output_path };
      } catch (e2) {
        return { success: false, error: e2 instanceof Error ? e2.message : String(e2) };
      }
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function handleConnection(socket: net.Socket): void {
  const reader = createTcpMessageReader(async (msg) => {
    const req = msg as ExportRequest;
    try {
      const result = await handleExportRequest(req);
      writeTcpMessage(socket, result);
    } catch (err) {
      writeTcpMessage(socket, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    socket.end();
  });
  socket.on('data', reader);
  socket.on('error', () => {
    // Client disconnect — ignore
  });
}

function listenOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tryServer = net.createServer(handleConnection);
    tryServer.once('error', () => resolve(false));
    tryServer.listen(port, '127.0.0.1', () => {
      server = tryServer;
      currentPort = port;
      resolve(true);
    });
  });
}

export async function startExportPdfMcpServer(): Promise<number> {
  if (server) return currentPort;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = START_PORT + i;
    const ok = await listenOnPort(port);
    if (ok) {
      console.log(`[exportPdfMcpServer] Listening on 127.0.0.1:${port}`);
      return port;
    }
  }
  throw new Error(`[exportPdfMcpServer] No available port in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS - 1}`);
}

export function getExportPdfMcpPort(): number {
  return currentPort;
}

export async function stopExportPdfMcpServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server!.close(() => {
      server = null;
      currentPort = 0;
      resolve();
    });
  });
}
