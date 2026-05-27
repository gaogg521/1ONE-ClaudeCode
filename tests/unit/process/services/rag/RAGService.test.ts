import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock @xenova/transformers 避免测试中拉取模型文件阻塞
const mockPipeline = vi.fn();
vi.mock('@xenova/transformers', () => ({
  env: {
    allowLocalModels: true,
    localModelPath: '',
    cacheDir: '',
    remoteHost: '',
  },
  pipeline: vi.fn(async () => mockPipeline),
}));

// Mock initStorage 获取系统缓存路径
vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: '/mock/cache',
  }),
}));

import { RAGService } from '@process/services/rag/RAGService';

describe('RAGService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chunkText (滑动窗口切片算法)', () => {
    it('正确切分超长文本并附带重叠区域', () => {
      const text = '1234567890abcdefghij'; // 20 字符
      // ChunkSize=10, Overlap=5
      // 第一段：0-10 -> '1234567890'
      // 下一发起点：0 + 10 - 5 = 5
      // 第二段：5-15 -> '67890abcde'
      // 下一发起点：5 + 10 - 5 = 10
      // 第三段：10-20 -> 'abcdefghij'
      // 下一发起点：10 + 10 - 5 = 15
      // 第四段：15-20 -> 'fghij' (截取并 trim)
      const chunks = RAGService.chunkText(text, 10, 5);
      expect(chunks).toEqual(['1234567890', '67890abcde', 'abcdefghij', 'fghij']);
    });

    it('对短文本不进行切片，直接原样返回列表', () => {
      const text = 'short text';
      const chunks = RAGService.chunkText(text, 50, 10);
      expect(chunks).toEqual(['short text']);
    });

    it('处理空字符串或仅包含空格的文本，返回空列表', () => {
      expect(RAGService.chunkText('')).toEqual([]);
      expect(RAGService.chunkText('   ')).toEqual([]);
    });
  });

  describe('vectorToBuffer & bufferToVector (向量浮点二进制编解码)', () => {
    it('能够无损且高精度还原 float32 浮点数组', () => {
      const originalVector = [0.15, -0.992, 105.4, -0.00035];
      const buffer = RAGService.vectorToBuffer(originalVector);

      // 验证一个 float32 占 4 字节
      expect(buffer.length).toBe(originalVector.length * 4);

      const decodedVector = RAGService.bufferToVector(buffer);

      // 检查数组长度一致
      expect(decodedVector).toHaveLength(originalVector.length);

      // 浮点数由于 IEEE 754 精度微调，用 closeTo 逐一核对
      decodedVector.forEach((val, i) => {
        expect(val).toBeCloseTo(originalVector[i], 5);
      });
    });
  });

  describe('cosineSimilarity (余弦相似度核心计算)', () => {
    it('对方向完全一致的向量，相似度应为 1', () => {
      const vecA = [1.0, 2.0, 3.0];
      const vecB = [2.0, 4.0, 6.0]; // 方向相同，模不同
      const sim = RAGService.cosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it('对方向完全相反的向量，相似度应为 -1', () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [-1.0, 0.0, 0.0];
      const sim = RAGService.cosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(-1.0, 5);
    });

    it('对相互正交（垂直）的向量，相似度应为 0', () => {
      const vecA = [1.0, 0.0];
      const vecB = [0.0, 1.0];
      const sim = RAGService.cosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(0.0, 5);
    });

    it('向量长度不一致时，应该抛出 Error 拦截异常', () => {
      const vecA = [1.0, 2.0];
      const vecB = [1.0, 2.0, 3.0];
      expect(() => RAGService.cosineSimilarity(vecA, vecB)).toThrow('Vector length mismatch');
    });
  });

  describe('getEmbedding (向量特征提取)', () => {
    it('通过 pipeline 跑通提取并正常返回一维浮点数组', async () => {
      // Mock pipeline 的输出数据
      mockPipeline.mockResolvedValueOnce({
        data: new Float32Array([0.25, -0.5, 0.9]),
      });

      const embedding = await RAGService.getEmbedding('测试文本');
      expect(embedding).toHaveLength(3);
      expect(embedding[0]).toBeCloseTo(0.25, 5);
      expect(embedding[1]).toBeCloseTo(-0.5, 5);
      expect(embedding[2]).toBeCloseTo(0.9, 5);
    });

    it('在模型初始化失败后自动降级到 fallback embedding', async () => {
      vi.resetModules();

      const transformers = await import('@xenova/transformers');
      vi.mocked(transformers.pipeline)
        .mockRejectedValueOnce(new Error('download failed'))
        .mockResolvedValueOnce(
          vi.fn().mockResolvedValue({
            data: new Float32Array([0.4, 0.6]),
          })
        );

      const { RAGService: ReloadedRAGService } = await import('@process/services/rag/RAGService');

      const first = await ReloadedRAGService.getEmbedding('第一次');
      const second = await ReloadedRAGService.getEmbedding('第二次');

      expect(first).toHaveLength(384);
      expect(second).toHaveLength(384);
      expect(first.some((value) => value !== 0)).toBe(true);
      expect(second.some((value) => value !== 0)).toBe(true);
    });
  });
});
