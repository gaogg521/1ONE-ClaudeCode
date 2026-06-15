import type { RequestHandler } from 'express';
import express from 'express';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// 1. Mock 验证中间件，自动放行并注入模拟的用户上下文
vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenMiddleware: {
    extractToken: vi.fn(() => null),
    validateToken: () =>
      ((req, _res, next) => {
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

const getAuthProviderMock = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: (...args: unknown[]) => getAuthProviderMock(...args),
  },
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
  const layer = app.router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods[method]);
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

async function runRouteStack(app: express.Express, method: string, path: string, req: any, res: any): Promise<void> {
  const layer = app.router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods[method]);
  const stack = layer?.route?.stack as Array<{ handle: RequestHandler }> | undefined;
  if (!stack) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  const dispatch = async (index: number): Promise<void> => {
    const entry = stack[index];
    if (!entry) return;
    let nextCalled = false;
    await entry.handle(req, res, (error?: unknown) => {
      nextCalled = true;
      if (error) {
        throw error;
      }
    });
    if (nextCalled) {
      await dispatch(index + 1);
    }
  };
  await dispatch(0);
}

describe('devopsRoutes', () => {
  let app: express.Express;
  let registerDevOpsRoutes: (app: express.Express) => void;

  beforeAll(async () => {
    ({ registerDevOpsRoutes } = await import('@process/webserver/routes/devopsRoutes'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    app = express();
    app.use(express.json());
    registerDevOpsRoutes(app);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('creator_name'));
      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('FROM requirements r'));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 'epic-1',
            children: [expect.objectContaining({ id: 'story-1', parent_id: 'epic-1' })],
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

    it('POST /api/admin/requirements - 桌面本机未登录时写入默认工作区', async () => {
      const req = {
        headers: { host: '127.0.0.1:25809', 'x-one-client': 'electron-desktop' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        body: { type: 'story', subject: 'Personal Story', description: 'desc', priority: 'medium' },
      } as any;
      const res = createResponseMock();

      await runRouteStack(app, 'post', '/api/admin/requirements', req, res);

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'default',
        null,
        'story',
        'Personal Story',
        'desc',
        'backlog',
        'medium',
        null,
        null,
        'desktop-local-admin',
        expect.any(Number),
        expect.any(Number)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ id: expect.any(String) }),
      });
    });

    it('POST /api/admin/requirements - 远程浏览器未登录时拒绝写入默认工作区', async () => {
      const req = {
        headers: { host: '192.168.1.10:25809' },
        ip: '192.168.1.20',
        socket: { remoteAddress: '192.168.1.20' },
        body: { type: 'story', subject: 'Remote Story', description: 'desc', priority: 'medium' },
      } as any;
      const res = createResponseMock();

      await runRouteStack(app, 'post', '/api/admin/requirements', req, res);

      expect(mockRun).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Authentication required' });
    });

    it('PATCH /api/admin/requirements/:id - closes open stage and records process duration on status change', async () => {
      mockGet.mockReturnValueOnce({ id: 'req-1' }).mockReturnValueOnce({ id: 'stage-open', entry_time: 1_000 });

      const handler = getRouteHandler(app, 'patch', '/api/admin/requirements/:id');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123' },
        params: { id: 'req-1' },
        body: { status: 'developing' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockRun).toHaveBeenCalled();
      expect(mockDriver.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE value_stream_stages SET exit_time = ?, process_duration_ms = ? WHERE id = ?')
      );
      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO value_stream_stages'));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('PATCH /api/admin/requirements/:id - 个人未登录时可更新默认工作区 Issue', async () => {
      mockGet.mockReturnValueOnce({ type: 'story' });

      const handler = getRouteHandler(app, 'patch', '/api/admin/requirements/:id');
      const req = {
        params: { id: 'req-personal' },
        body: { status: 'developing' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT type FROM requirements WHERE id = ? AND tenant_id = ?')
      );
      expect(mockRun).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('POST /api/admin/requirements/:id/comments - 个人未登录时可发表评论', async () => {
      mockGet.mockReturnValueOnce({ id: 'req-personal' });

      const handler = getRouteHandler(app, 'post', '/api/admin/requirements/:id/comments');
      const req = {
        params: { id: 'req-personal' },
        body: { body: '个人评论' },
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
    it('GET /api/admin/rag/documents - returns failure reason for failed documents', async () => {
      mockAll.mockReturnValueOnce([
        {
          id: 'doc-1',
          title: '导入失败文档',
          status: 'failed',
          last_error: 'embedding warmup failed',
        },
      ]);

      const handler = getRouteHandler(app, 'get', '/api/admin/rag/documents');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 'doc-1',
            last_error: 'embedding warmup failed',
          }),
        ],
      });
    });

    it('POST /api/admin/rag/import-url - imports a public URL and queues indexing', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body>研发流程 文档内容</body></html>',
      } as Response);

      const handler = getRouteHandler(app, 'post', '/api/admin/rag/import-url');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        body: { url: 'https://example.com/doc', title: '研发流程' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/doc',
        expect.objectContaining({
          headers: { 'User-Agent': '1ONE-RAG/1.0' },
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'indexing',
          title: '研发流程',
        }),
      });
    });

    it('POST /api/admin/rag/import-feishu - rejects requests when Feishu provider is not configured', async () => {
      getAuthProviderMock.mockResolvedValueOnce(null);

      const handler = getRouteHandler(app, 'post', '/api/admin/rag/import-feishu');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        body: { url: 'https://sample.feishu.cn/docx/AbCdEf123456' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Feishu'),
      });
    });

    it('POST /api/admin/rag/import-feishu - imports Feishu docx content through tenant credentials', async () => {
      getAuthProviderMock.mockResolvedValueOnce({
        enabled: 1,
        config: {
          appId: 'cli_xxx',
          appSecret: 'secret_xxx',
        },
      });

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 'tenant-token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, data: { document: { title: '飞书规范' } } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, data: { content: '# 飞书规范\n\n正文' } }),
        } as Response);

      const handler = getRouteHandler(app, 'post', '/api/admin/rag/import-feishu');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        body: { url: 'https://sample.feishu.cn/docx/AbCdEf123456' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        expect.objectContaining({ method: 'POST' })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'indexing',
          title: '飞书规范',
        }),
      });
    });

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
      mockGet.mockReturnValueOnce({ scope: 'personal', team_id: null, created_by: 'test-user-id' });
      mockRun.mockReturnValueOnce({ changes: 1 });

      const handler = getRouteHandler(app, 'delete', '/api/admin/rag/documents/:id');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        params: { id: 'doc-1' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM rag_documents WHERE id = ?')
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('企业 Skills 技能仓库 API', () => {
    it('DELETE /api/admin/skills/:id — org_admin 可删除本租户技能', async () => {
      mockGet.mockReturnValueOnce({
        scope: 'personal',
        team_id: null,
        created_by: 'other-user',
      });
      mockRun.mockReturnValueOnce({ changes: 1 });

      const handler = getRouteHandler(app, 'delete', '/api/admin/skills/:id');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        params: { id: 'skill-1' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM skills_registry WHERE id=? AND tenant_id=?')
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('DELETE /api/admin/skills/:id — 非创建者且无管理权限时返回 403', async () => {
      mockGet.mockReturnValueOnce({
        scope: 'personal',
        team_id: null,
        created_by: 'other-user',
      });

      const handler = getRouteHandler(app, 'delete', '/api/admin/skills/:id');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'member' },
        params: { id: 'skill-1' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockRun).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Forbidden' });
    });

    it('DELETE /api/admin/skills/:id — 记录不存在时返回 404', async () => {
      mockGet.mockReturnValueOnce(undefined);

      const handler = getRouteHandler(app, 'delete', '/api/admin/skills/:id');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'org_admin' },
        params: { id: 'missing-skill' },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockRun).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Skill not found' });
    });

    it('POST /api/admin/skills — 无管理权限时更新返回 403 而非 404', async () => {
      mockGet.mockReturnValueOnce({
        scope: 'personal',
        team_id: null,
        created_by: 'other-user',
      });

      const handler = getRouteHandler(app, 'post', '/api/admin/skills');
      const req = {
        user: { id: 'test-user-id', tenant_id: 'tenant-123', role: 'member' },
        body: { id: 'skill-1', name: 'Renamed', description: '', content: '', enabled: true },
      } as any;
      const res = createResponseMock();

      await handler(req, res, () => {});

      expect(mockRun).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Forbidden' });
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
