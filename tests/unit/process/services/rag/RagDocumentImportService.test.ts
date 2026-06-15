import { beforeEach, describe, expect, it, vi } from 'vitest';

const chunkTextMock = vi.hoisted(() => vi.fn());
const getEmbeddingMock = vi.hoisted(() => vi.fn());
const vectorToBufferMock = vi.hoisted(() => vi.fn());

vi.mock('@process/services/rag/RAGService', () => ({
  RAGService: {
    chunkText: (...args: unknown[]) => chunkTextMock(...args),
    getEmbedding: (...args: unknown[]) => getEmbeddingMock(...args),
    vectorToBuffer: (...args: unknown[]) => vectorToBufferMock(...args),
  },
}));

import { parseFeishuDocumentUrl, runRagDocumentIndexing } from '@process/services/rag/RagDocumentImportService';

describe('RagDocumentImportService', () => {
  const runMock = vi.fn();
  const prepareMock = vi.fn();
  const transactionMock = vi.fn((callback: (items: unknown[]) => void) => callback);
  const driver = {
    prepare: prepareMock,
    transaction: transactionMock,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    prepareMock.mockImplementation(() => ({
      run: runMock,
    }));
    chunkTextMock.mockReturnValue(['chunk-1']);
    vectorToBufferMock.mockReturnValue(Buffer.from([1, 2, 3]));
  });

  it('stores the failure reason when document indexing fails', async () => {
    getEmbeddingMock.mockRejectedValueOnce(new Error('model download failed'));

    await runRagDocumentIndexing({
      driver,
      docId: 'doc-1',
      title: '部署手册',
      content: 'hello world',
    });

    expect(runMock.mock.calls).toContainEqual(['model download failed', expect.any(Number), 'doc-1']);
  });

  it('parses direct docx and wiki Feishu urls', () => {
    expect(parseFeishuDocumentUrl('https://sample.feishu.cn/docx/AbCdEf123456')).toEqual({
      kind: 'docx',
      token: 'AbCdEf123456',
      url: 'https://sample.feishu.cn/docx/AbCdEf123456',
    });

    expect(parseFeishuDocumentUrl('https://sample.feishu.cn/wiki/NodeToken9988')).toEqual({
      kind: 'wiki',
      token: 'NodeToken9988',
      url: 'https://sample.feishu.cn/wiki/NodeToken9988',
    });
  });

  it('rejects non-Feishu document urls', () => {
    expect(parseFeishuDocumentUrl('https://example.com/docx/abc')).toBeNull();
    expect(parseFeishuDocumentUrl('not a url')).toBeNull();
  });
});
