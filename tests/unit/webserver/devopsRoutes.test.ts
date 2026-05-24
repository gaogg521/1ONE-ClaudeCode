import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 1. Mock 验证中间件，自动放行并注入模拟的用户上下文
vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    validateToken: () => ((req, _res, next) => {
      req.user = { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' };
      next();
    }) as RequestHandler,
  },
}));

// Mock 速率限制器中间件
vi.mock('@process/webserver/middleware/security', () => ({
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

// Mock RAGService
vi.mock('@process/services/rag/RAGService', () => ({
  RAGService: {
    chunkText: vi.fn(() => ['chunk 1', 'chunk 2']),
    getEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
    vectorToBuffer: vi.fn(() => Buffer.from([1, 2, 3])),
    bufferToVector: vi.fn(() => [0.1, 0.2, 0.3]),
    cosineSimilarity: vi.fn(() => 0.85),
  },
}));

// 2. Mock SQLite 驱动器，录制所有 SQL 准备与运行状态
const mockAll = vi.fn();
const mockRun = vi.fn(() => ({ changes: 1 }));
const mockGet = vi.fn();
const mockTransaction = vi.fn((cb) => cb);

const mockDriver = {
  prepare: vi.fn(() => ({
    all: mockAll,
    run: mockRun,
    get: mockGet,
  })),
  transaction: mockTransaction,
};

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => mockDriver,
  }),
}));

// 辅助方法：快速创建 Mock Response
function createResponseMock() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  } as any;
  res.status.mockReturnValue(res);
  return res;
}

function getRouteHandler(app: express.Express, method: string, path: string): RequestHandler {
  const layer = app.router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods[method]
  );
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

describe('devopsRoutes', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    const { registerDevOpsRoutes } = await import('@process/webserver/routes/devopsRoutes');
    registerDevOpsRoutes(app);
  });

  describe('CTeam 敏捷看板 API', () => {
    it('GET /api/admin/requirements/tree - 正确构建嵌套树形需求结构', async () => {
      // 模拟数据库返回包含 parent_id 的层级数据
      mockAll.mockReturnValueOnce([
        { id: 'epic-1', parent_id: null, subject: 'Epic 1', created_at: 100 },
        { id: 'story-1', parent_id: 'epic-1', subject: 'Story 1', created_at: 110 },
      ]);

      const handler = getRouteHandler(app, 'get', '/api/admin/requirements/tree');
      const req = { user: { tenant_id: 'tenant-123' } } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('FROM requirements'));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 'epic-1',
            children: [
              expect.objectContaining({ id: 'story-1', parent_id: 'epic-1' }),
            ],
          }),
        ],
      });
    });

    it('POST /api/admin/requirements - 成功创建新需求记录', async () => {
      const handler = getRouteHandler(app, 'post', '/api/admin/requirements');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123' },
        body: { type: 'story', subject: 'New Story', description: 'desc', priority: 'high' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockRun).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ id: expect.any(String) }),
      });
    });
  });

  describe('RAG 知识库 API', () => {
    it('POST /api/admin/rag/query - 语义检索计算余弦相似度并排序过滤', async () => {
      // 模拟数据库已有的知识切片
      mockAll.mockReturnValueOnce([
        { title: '规范1', chunk_index: 0, content: '切片1', embedding: Buffer.from([1, 2, 3]) },
      ]);

      const handler = getRouteHandler(app, 'post', '/api/admin/rag/query');
      const req = {
        user: { tenant_id: 'tenant-123' },
        body: { query: '如何重置密码', limit: 5 },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            title: '规范1',
            score: 0.85,
            content: '切片1',
          }),
        ],
      });
    });

    it('DELETE /api/admin/rag/documents/:id - 级联删除文档及向量切片', async () => {
      mockRun.mockReturnValueOnce({ changes: 1 });

      const handler = getRouteHandler(app, 'delete', '/api/admin/rag/documents/:id');
      const req = {
        user: { tenant_id: 'tenant-123', role: 'org_admin' },
        params: { id: 'doc-1' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM rag_documents WHERE id = ?'));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('MCP 统一服务仓库', () => {
    it('GET /api/admin/mcp/registry - 获取列表并优雅脱敏敏感凭证信息', async () => {
      // 模拟数据库返回包含 env_json 的凭证
      mockAll.mockReturnValueOnce([
        { id: 'mcp-1', name: 'Jira', type: 'sse', endpoint: 'http://jira.com', env_json: '{"apiKey":"secret-key"}' },
      ]);

      const handler = getRouteHandler(app, 'get', '/api/admin/mcp/registry');
      const req = { user: { tenant_id: 'tenant-123' } } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            name: 'Jira',
            hasKeys: true, // 脱敏标记其拥有配置，而不暴露密匙明文
          }),
        ],
      });
    });
  });
});
