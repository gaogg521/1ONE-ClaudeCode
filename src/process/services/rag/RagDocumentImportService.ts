/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';

import type { FeishuProviderConfig } from '@process/webserver/auth/providers/FeishuAuthProvider';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

import { RAGService } from './RAGService';

type RagDriver = Pick<ISqliteDriver, 'prepare' | 'transaction'>;

type RunRagDocumentIndexingInput = {
  driver: RagDriver;
  docId: string;
  title: string;
  content: string;
};

type ParsedFeishuDocumentUrl = {
  kind: 'docx' | 'wiki';
  token: string;
  url: string;
};

type FeishuApiEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
};

const FEISHU_HOST_SUFFIXES = ['feishu.cn', 'larksuite.com', 'larkoffice.com'];
const MAX_RAG_ERROR_LENGTH = 500;

function isFeishuHost(hostname: string): boolean {
  return FEISHU_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getRagErrorMessage(error: unknown): string {
  let message = 'Unknown error';

  if (error instanceof Error && error.message.trim()) {
    message = error.message.trim();
  } else if (typeof error === 'string' && error.trim()) {
    message = error.trim();
  } else if (error != null) {
    message = safeJsonStringify(error);
  }

  return message.slice(0, MAX_RAG_ERROR_LENGTH);
}

export function extractHtmlText(rawContent: string): string {
  return rawContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200000);
}

export async function runRagDocumentIndexing({
  driver,
  docId,
  title,
  content,
}: RunRagDocumentIndexingInput): Promise<void> {
  try {
    const chunks = RAGService.chunkText(content, 500, 100);
    const computedChunks: Array<{ id: string; index: number; content: string; blob: Buffer }> = [];

    let index = 0;
    for (const chunk of chunks) {
      const vector = await RAGService.getEmbedding(chunk);
      computedChunks.push({
        id: randomUUID(),
        index,
        content: chunk,
        blob: RAGService.vectorToBuffer(vector),
      });
      index += 1;
    }

    const insertChunk = driver.prepare(
      `INSERT INTO rag_document_chunks (id, document_id, chunk_index, content, token_count, embedding)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const batchInsert = driver.transaction((items: typeof computedChunks) => {
      for (const item of items) {
        insertChunk.run(item.id, docId, item.index, item.content, item.content.length, item.blob);
      }
    });
    batchInsert(computedChunks);

    driver
      .prepare(
        `UPDATE rag_documents
         SET status = 'completed', chunk_count = ?, last_error = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(chunks.length, Date.now(), docId);
  } catch (error) {
    const message = getRagErrorMessage(error);
    console.error(`[RAG-Index] Failed to index document '${title}':`, error);
    driver
      .prepare(`UPDATE rag_documents SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
      .run(message, Date.now(), docId);
  }
}

export function queueRagDocumentIndexing(input: RunRagDocumentIndexingInput): void {
  void runRagDocumentIndexing(input);
}

export function parseFeishuDocumentUrl(value: string): ParsedFeishuDocumentUrl | null {
  try {
    const url = new URL(value.trim());
    if (!isFeishuHost(url.hostname)) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const kindIndex = segments.findIndex((segment) => segment === 'docx' || segment === 'wiki');
    if (kindIndex === -1) {
      return null;
    }

    const token = segments[kindIndex + 1]?.trim();
    if (!token) {
      return null;
    }

    return {
      kind: segments[kindIndex] as ParsedFeishuDocumentUrl['kind'],
      token,
      url: `${url.origin}/${segments[kindIndex]}/${token}`,
    };
  } catch {
    return null;
  }
}

async function parseFeishuJson<T>(response: Response, fallback: string): Promise<FeishuApiEnvelope<T>> {
  const json = (await response.json().catch((): null => null)) as FeishuApiEnvelope<T> | null;
  if (!response.ok || !json) {
    throw new Error(`${fallback}: HTTP ${response.status}`);
  }
  if (typeof json.code === 'number' && json.code !== 0) {
    throw new Error(json.msg || fallback);
  }
  return json;
}

async function getFeishuTenantAccessToken(config: Pick<FeishuProviderConfig, 'appId' | 'appSecret'>): Promise<string> {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });
  const json = await parseFeishuJson(response, 'Failed to get Feishu tenant access token');
  const token = json.tenant_access_token ?? (json.data as { tenant_access_token?: string } | undefined)?.tenant_access_token;
  if (!token) {
    throw new Error('Failed to get Feishu tenant access token');
  }
  return token;
}

async function resolveFeishuDocumentId(
  parsedUrl: ParsedFeishuDocumentUrl,
  accessToken: string
): Promise<string> {
  if (parsedUrl.kind === 'docx') {
    return parsedUrl.token;
  }

  const wikiUrl = new URL('https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node');
  wikiUrl.searchParams.set('token', parsedUrl.token);
  const response = await fetch(wikiUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await parseFeishuJson<{ node?: { obj_token?: string; obj_type?: string } }>(
    response,
    'Failed to resolve Feishu wiki document'
  );
  const node = json.data?.node;
  if (!node?.obj_token || node.obj_type !== 'docx') {
    throw new Error('当前仅支持导入飞书 docx 文档或 wiki 中挂载的 docx 文档');
  }
  return node.obj_token;
}

async function fetchFeishuDocumentTitle(documentId: string, accessToken: string): Promise<string> {
  const response = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await parseFeishuJson<{ document?: { title?: string } }>(
    response,
    'Failed to get Feishu document metadata'
  );
  return json.data?.document?.title?.trim() || documentId;
}

async function fetchFeishuDocumentMarkdown(documentId: string, accessToken: string): Promise<string> {
  const contentUrl = new URL('https://open.feishu.cn/open-apis/docs/v1/content');
  contentUrl.searchParams.set('doc_token', documentId);
  contentUrl.searchParams.set('doc_type', 'docx');
  contentUrl.searchParams.set('content_type', 'markdown');

  const response = await fetch(contentUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await parseFeishuJson<{ content?: string }>(response, 'Failed to get Feishu document content');
  const content = json.data?.content?.trim();
  if (!content) {
    throw new Error('Feishu document content is empty');
  }
  return content;
}

export async function fetchFeishuDocumentContentFromUrl(input: {
  url: string;
  config: Pick<FeishuProviderConfig, 'appId' | 'appSecret'>;
}): Promise<{ title: string; content: string; mimeType: string }> {
  const parsedUrl = parseFeishuDocumentUrl(input.url);
  if (!parsedUrl) {
    throw new Error('请输入有效的飞书 docx 或 wiki 文档链接');
  }

  const accessToken = await getFeishuTenantAccessToken(input.config);
  const documentId = await resolveFeishuDocumentId(parsedUrl, accessToken);
  const [title, content] = await Promise.all([
    fetchFeishuDocumentTitle(documentId, accessToken),
    fetchFeishuDocumentMarkdown(documentId, accessToken),
  ]);

  return {
    title,
    content,
    mimeType: 'text/markdown',
  };
}
