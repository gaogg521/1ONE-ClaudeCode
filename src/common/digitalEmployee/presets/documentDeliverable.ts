/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const DOCUMENT_DELIVERABLE_AGENT_NAME = '文档产出专员';

export const DOCUMENT_DELIVERABLE_DESCRIPTION =
  '根据 Issue 或定时任务产出结构化文档：本地 HTML + Word 双格式；飞书可用时同步在线 docx。';

/** Skill folder name under user skills (see resources/skills/lark-doc-deliverable). */
export const LARK_DOC_DELIVERABLE_SKILL_NAME = 'lark-doc-deliverable';

export const DOCUMENT_DELIVERABLE_SKILL_IDS = [`local:${LARK_DOC_DELIVERABLE_SKILL_NAME}`] as const;

/** Local dual-format delivery steps shared by preset + default hints. */
export const DOCUMENT_DELIVERABLE_LOCAL_DUAL_FORMAT_STEPS = `【本地双格式（必做）】
1. 在 \`deliverables/<任务简称>/\` 下先写 \`report.md\` 草稿。
2. 同目录生成 \`report.html\`：完整 standalone HTML（含 \`<!DOCTYPE html>\`、标题、目录、基础样式），浏览器可直接打开。
3. 用内置 officecli 技能生成 \`report.docx\`（可从 report.md 结构化写入 Word）。
4. 数据表类任务可额外产出 \`data.xlsx\`；汇报类可额外产出 \`slides.pptx\`。`;

export const DOCUMENT_DELIVERABLE_INSTRUCTIONS = `【产出目标】
每次任务结束必须交付可打开的本地文件，不要只输出聊天 Markdown。

${DOCUMENT_DELIVERABLE_LOCAL_DUAL_FORMAT_STEPS}

【飞书在线文档 · 可选 · lark-cli】
1. 本地 HTML + Word 完成后，再尝试飞书（需 lark-doc-deliverable 技能且本机 lark-cli 已登录）。
2. 用 \`lark-cli docs +create --from-md deliverables/.../report.md --title "<标题>"\` 创建在线 docx。
3. **飞书失败或未配置时：不要中断任务**，说明原因即可，本地 .html + .docx 仍算交付完成。

【交付格式】
回复末尾固定包含：
- 本地：report.html、report.docx 的绝对路径（及其他附件路径）
- 飞书：链接列表（成功时）；失败时写一句原因，不伪造链接`;

export const DOCUMENT_DELIVERABLE_CRON_PROMPT =
  '请整理本轮待交付内容：必做本地 report.html + report.docx；再视情况同步飞书 docx。飞书不可用时只交付本地双格式并在摘要说明。';
