/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { getSystemDir } from '@process/utils/initStorage';

// 我们在安装时使用了 --ignore-scripts 来跳过二进制编译，
// 这要求我们告诉 transformers 仅使用纯 JS/WASM，不需要本地 node-gyp 绑定
let pipelinePromise: any = null;

/**
 * RAG 本地化服务类
 */
export class RAGService {
  private static extractor: any = null;
  private static modelName = 'Xenova/all-MiniLM-L6-v2'; // 超轻量、仅 80MB 的世界级向量模型

  /**
   * 初始化本地 Transformers Pipeline
   */
  private static async initPipeline(): Promise<any> {
    if (this.extractor) return this.extractor;
    if (pipelinePromise) return pipelinePromise;

    pipelinePromise = (async () => {
      try {
        // 注入 sharp 模块虚拟 Mock 拦截器，100% 避开 win32-x64 原生二进制文件丢失报错
        // Intercept 'sharp' loading and return an empty mock to prevent native .node resolution failure
        try {
          const moduleAlias = require('node:module');
          const originalRequire = moduleAlias.prototype.require;
          moduleAlias.prototype.require = function (this: any, name: string) {
            if (name === 'sharp') {
              return {}; // 返回空对象，绕过 native require 异常
            }
            return originalRequire.apply(this, arguments);
          };
        } catch (mockError) {
          console.warn('[RAGService] Failed to inject sharp mock:', mockError);
        }

        // 动态导入以避免非必要冷启动开销
        const { pipeline, env } = await import('@xenova/transformers');

        const { cacheDir } = getSystemDir();
        const modelCachePath = path.join(cacheDir, 'models');
        await fs.mkdir(modelCachePath, { recursive: true });

        // 企业 RAG 安全配置：允许本地/缓存模型载入，并配置国内镜像兜底以防外网不通
        env.allowLocalModels = true;
        env.localModelPath = modelCachePath;
        env.cacheDir = modelCachePath;

        // 如果有中国大陆镜像需求，默认使用 hf-mirror 极速通道
        // @ts-ignore
        env.remoteHost = 'https://hf-mirror.com';

        console.log(`[RAGService] Loading embedding model '${this.modelName}' into local cache:`, modelCachePath);

        // 加载特征提取 pipeline (feature-extraction)
        const extractor = await pipeline('feature-extraction', this.modelName, {
          quantized: true, // 使用量化版，体积小一倍，速度快一倍
        });

        this.extractor = extractor;
        console.log('[RAGService] Local embedding model loaded successfully.');
        return extractor;
      } catch (error) {
        this.extractor = null;
        pipelinePromise = null;
        console.error('[RAGService] Failed to initialize embedding pipeline:', error);
        throw error;
      }
    })();

    return pipelinePromise;
  }

  /**
   * 健康检查：尝试初始化 pipeline，成功则 resolve，失败则 reject
   */
  public static async checkHealth(): Promise<void> {
    await this.initPipeline();
  }

  /**
   * 文本重叠滑动窗口切片算法 (Sliding Window Chunking)
   *
   * @param text 原始文本
   * @param chunkSize 每一个切片的最大字数
   * @param overlap 每一个相邻切片之间重叠的字数，防止语义在截断处丢失
   */
  public static chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
    const chunks: string[] = [];
    if (!text || text.trim().length === 0) return chunks;

    const trimmed = text.trim();
    if (trimmed.length <= chunkSize) {
      return [trimmed];
    }

    let start = 0;
    while (start < trimmed.length) {
      const end = Math.min(start + chunkSize, trimmed.length);
      const chunk = trimmed.substring(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      // 移动起始指针，减去重叠区域以保留上下文延续
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * 本地特征提取：文本转成 384 维向量浮点数组
   */
  public static async getEmbedding(text: string): Promise<number[]> {
    try {
      const extractor = await this.initPipeline();
      const output = await extractor(text, { pooling: 'mean', normalize: true });

      // 输出是一个 Tensor，包含浮点数组，转为标准的 JS number[]
      const vector = Array.from(output.data) as number[];
      return vector;
    } catch (error) {
      console.error('[RAGService] Failed to compute text embedding:', error);
      throw error;
    }
  }

  /**
   * 余弦相似度计算 (Cosine Similarity)
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 将 float32 浮点数数组向量高效序列化为二进制 Node.js Buffer 以存储于 DB
   */
  public static vectorToBuffer(vector: number[]): Buffer {
    const floatArray = new Float32Array(vector);
    return Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
  }

  /**
   * 从数据库二进制 BLOB 中高效反序列化还原为 float32 数组向量
   */
  public static bufferToVector(buffer: Buffer): number[] {
    // 强制按 float32 (4 字节) 读取
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    return Array.from(floatArray);
  }
}
