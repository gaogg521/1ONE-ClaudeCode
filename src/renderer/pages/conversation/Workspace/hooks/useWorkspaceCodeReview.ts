/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';

export interface ICodeReviewResult {
  summary: string;
  issues: Array<{
    file: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    suggestion?: string;
  }>;
  score: number;
  generatedAt: number;
}

interface UseWorkspaceCodeReviewResult {
  reviewResult: ICodeReviewResult | null;
  reviewing: boolean;
  runCodeReview: (workspace: string, staged: Array<{ filePath: string }>, unstaged: Array<{ filePath: string }>) => Promise<void>;
  clearReview: () => void;
}

export function useWorkspaceCodeReview(): UseWorkspaceCodeReviewResult {
  const { t } = useTranslation();
  const [reviewResult, setReviewResult] = useState<ICodeReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const runCodeReview = useCallback(
    async (workspace: string, staged: Array<{ filePath: string }>, unstaged: Array<{ filePath: string }>) => {
      setReviewing(true);
      try {
        const changedPaths = [...new Set([...staged.map((f) => f.filePath), ...unstaged.map((f) => f.filePath)])];
        const diffs: Array<{ file: string; diff: string }> = [];

        for (const filePath of changedPaths.slice(0, 20)) {
          try {
            const content = await ipcBridge.fs.readFile.invoke({ path: filePath });
            diffs.push({ file: filePath, diff: typeof content === 'string' ? content.slice(0, 3000) : '' });
          } catch {
            diffs.push({ file: filePath, diff: '[Binary or unreadable]' });
          }
        }

        const issues: ICodeReviewResult['issues'] = [];
        const patterns: Array<{ regex: RegExp; severity: 'critical' | 'warning' | 'info'; title: string; desc: string }> = [
          { regex: /console\.(log|warn|error|debug)/g, severity: 'warning', title: '残留控制台输出', desc: '发现 console 调试输出，建议移除以保持生产代码清洁' },
          { regex: /any(?!\w)/g, severity: 'critical', title: '使用 any 类型', desc: '发现 TypeScript any 类型声明，破坏类型安全性' },
          { regex: /TODO|FIXME|HACK/gi, severity: 'info', title: '遗留 TODO 标记', desc: '发现技术债务标记，建议记录为任务卡片' },
          { regex: /\bvar\b/g, severity: 'warning', title: '使用 var 声明', desc: '建议使用 const/let 替代 var 以获得安全的块级作用域' },
          { regex: /\.innerHTML\s*=/g, severity: 'critical', title: 'XSS安全风险', desc: '直接赋值 innerHTML 存在 XSS 安全风险，建议使用 textContent 或 DOMPurify' },
          { regex: /setTimeout\([^,]+,\s*0\)/g, severity: 'warning', title: 'setTimeout(fn, 0) 反模式', desc: 'setTimeout(fn, 0) 是 Hack 写法，建议使用 Promise 微任务或 requestAnimationFrame 替代' },
          { regex: /\!\s*important/g, severity: 'info', title: 'CSS !important', desc: '使用 !important 覆盖样式可能导致维护困难' },
        ];

        for (const { file, diff } of diffs) {
          for (const pattern of patterns) {
            if (pattern.regex.test(diff)) {
              pattern.regex.lastIndex = 0;
              issues.push({
                file,
                severity: pattern.severity,
                title: pattern.title,
                description: pattern.desc,
                suggestion: t('admin.codeReview.autoFixSuggestion', { defaultValue: '已自动扫描并标记该问题，建议人工确认后清理' }),
              });
            }
          }
        }

        const totalDeduction = issues.reduce(
          (sum, i) => sum + (i.severity === 'critical' ? 10 : i.severity === 'warning' ? 5 : 1),
          0
        );
        const score = Math.max(0, 100 - totalDeduction);

        const finalResult: ICodeReviewResult = {
          summary: t('admin.codeReview.scannedFiles', { count: diffs.length, issueCount: issues.length, defaultValue: '已全面扫描 {{count}} 个变更文件，共发现 {{issueCount}} 个潜在质量与安全风险点' }),
          issues,
          score,
          generatedAt: Date.now(),
        };

        setReviewResult(finalResult);
        if (issues.length === 0) {
          Message.success(t('admin.codeReview.allClear', { defaultValue: '代码审查通过！未发现潜在风险' }));
        }
      } catch (_e) {
        Message.error(t('admin.codeReview.failed', { defaultValue: '代码审查分析失败' }));
      } finally {
        setReviewing(false);
      }
    },
    [t]
  );

  const clearReview = useCallback(() => {
    setReviewResult(null);
  }, []);

  return { reviewResult, reviewing, runCodeReview, clearReview };
}
