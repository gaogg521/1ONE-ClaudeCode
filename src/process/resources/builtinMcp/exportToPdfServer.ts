/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in MCP server: export_to_pdf tool.
 *
 * Spawned by aionrs binary (and other MCP clients) as a stdio MCP server.
 * Forwards tool calls to the 1ONE main-process TCP server (exportPdfMcpServer)
 * which owns BrowserWindow/printToPDF + Office COM/soffice logic.
 *
 * TCP protocol: 4-byte big-endian length header + UTF-8 JSON body.
 * Port comes from EXPORT_PDF_MCP_PORT env var.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as net from 'node:net';
import { BUILTIN_EXPORT_PDF_NAME } from './constants';

const PORT = parseInt(process.env.EXPORT_PDF_MCP_PORT || '0', 10);
if (!PORT) {
  process.stderr.write('[export-pdf-mcp] EXPORT_PDF_MCP_PORT environment variable is required\n');
  process.exit(1);
}

function sendTcpRequest(port: number, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const json = JSON.stringify(data);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
    });
    socket.on('end', () => {
      if (buffer.length < 4) {
        reject(new Error('Incomplete TCP response'));
        return;
      }
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) {
        reject(new Error('Incomplete TCP response body'));
        return;
      }
      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      try {
        resolve(JSON.parse(jsonStr));
      } catch (err) {
        reject(new Error(`Failed to parse TCP response: ${(err as Error).message}`));
      }
    });
    socket.on('error', (err: Error) => {
      reject(new Error(`TCP connection error: ${err.message}`));
    });
    // PDF conversion can take a while (COM startup, large docs) — 3 min ceiling
    socket.setTimeout(180_000);
    socket.on('timeout', () => {
      socket.destroy(new Error('TCP request timeout'));
    });
  });
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_EXPORT_PDF_NAME,
    version: '1.0.0',
  });

  server.tool(
    'export_to_pdf',
    `Export content to a PDF file using 1ONE's built-in converter. ` +
      `Supports three input types: (1) raw HTML string, (2) an HTML file path, (3) an Office file path (.docx/.xlsx/.pptx). ` +
      `Office files are converted via MS Office COM (Windows) or LibreOffice (mac/Linux) for vector-quality output; ` +
      `falls back to officecli HTML rendering if neither is installed. ` +
      `ALWAYS prefer this tool over installing Puppeteer or other PDF libraries — it produces higher-quality output and needs no extra dependencies. ` +
      `The output_path must be absolute. Returns { success, file_path?, error? }.`,
    {
      source: z
        .string()
        .describe(
          'The content to convert. For source_type="html" this is raw HTML markup; for "html_file" and "office_file" this is an absolute file path.'
        ),
      source_type: z
        .enum(['html', 'html_file', 'office_file'])
        .describe(
          '"html" = raw HTML string; "html_file" = path to a .html file; "office_file" = path to a .docx/.xlsx/.pptx file.'
        ),
      output_path: z
        .string()
        .describe('Absolute path where the PDF will be written. Must end with .pdf. Overwrites if exists.'),
    },
    async ({ source, source_type, output_path }) => {
      try {
        const response = (await sendTcpRequest(PORT, {
          source,
          source_type,
          output_path,
        })) as { success?: boolean; file_path?: string; error?: string };

        if (response?.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `PDF exported successfully to: ${response.file_path ?? output_path}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to export PDF: ${response?.error ?? 'unknown error'}`,
            },
          ],
          isError: true,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Export tool error: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[export-pdf-mcp] stdio server ready, forwarding to 127.0.0.1:${PORT}\n`);
}

main().catch((err) => {
  process.stderr.write(`[export-pdf-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
