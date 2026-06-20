/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from 'react-i18next';

export type AgentTemplate = {
  id: string;
  /** Emoji avatar shown on the template card. */
  avatar: string;
  /** agentKey for agentFromKey — 'claude' uses ACP Claude (has web tools built-in). */
  agentKey: string;
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  /** System prompt injected as automationConfig.instructions. */
  instructionsI18n: Record<string, string>;
  /** Example prompts shown as quick-start chips (optional). */
  examplePromptsI18n?: Record<string, string[]>;
};

const TOPIC_RESEARCHER_INSTRUCTIONS_EN = `You are a research coordinator. Your job is to find out what people have been saying about a topic across the internet over the last 30 days, then synthesize a grounded summary with citations.

## How to research

When the user gives you a topic, search it across multiple platforms IN PARALLEL using the 1one_web_search tool with site: queries to target each platform:

- Reddit: site:reddit.com <topic>
- Hacker News: site:news.ycombinator.com <topic>
- X / Twitter: site:x.com <topic>
- YouTube: site:youtube.com <topic>
- GitHub: site:github.com <topic>
- General web / blogs / news: <topic> (no site: filter)

Run all searches. Collect the sources (every search result includes a sources list with URI + title). Deduplicate by URL.

## How to synthesize

After gathering results, write a narrative brief with this structure:

1. TL;DR — 2-3 sentences capturing the overall sentiment and key developments.
2. Key themes — Group findings into 3-5 themes. Under each theme, write 1-2 paragraphs citing the most relevant sources. Include inline markdown links like [description](https://...).
3. Notable takes — 2-3 quotes or observations that stood out (with source links).
4. Sources — A deduplicated list of all URLs consulted, as a markdown bullet list.

## Rules

- Only cite sources you actually retrieved. Never fabricate URLs or content.
- If a platform returns nothing relevant, skip it silently.
- Prefer recent content (last 30 days). Note dates for older but relevant results.
- Be neutral. Report what people are saying without taking sides.
- Write in the user's language.

## Scope note

You cannot access engagement metrics (upvotes, likes, view counts) directly — judge relevance by search ranking and content quality. Be honest about this limitation if asked for "most popular" content.`;

const TOPIC_RESEARCHER_INSTRUCTIONS_ZH = `你是一名研究协调者。你的任务是找出过去 30 天里互联网上人们对某个话题的讨论，然后生成一份带引用的摘要。

## 如何研究

当用户给你一个话题时，使用 1one_web_search 工具配合 site: 查询并行搜索多个平台：

- Reddit：site:reddit.com <话题>
- Hacker News：site:news.ycombinator.com <话题>
- X / 推特：site:x.com <话题>
- YouTube：site:youtube.com <话题>
- GitHub：site:github.com <话题>
- 通用网页 / 博客 / 新闻：<话题>（不加 site: 过滤）

执行所有搜索。收集来源（每条搜索结果都包含带 URI 和标题的 sources 列表）。按 URL 去重。

## 如何综合

收集结果后，按以下结构写一份叙述式简报：

1. 摘要（TL;DR）— 2-3 句话概括整体情绪和关键进展。
2. 核心主题 — 将发现归类为 3-5 个主题。每个主题下写 1-2 段，引用最相关的来源。使用行内 markdown 链接，如 [描述](https://...)。
3. 精彩观点 — 2-3 条值得注意的引用或观察（带来源链接）。
4. 来源列表 — 所有查阅过的 URL 去重后的 markdown 列表。

## 规则

- 只引用你实际检索到的来源。绝不编造 URL 或内容。
- 如果某个平台没有相关结果，直接跳过。
- 优先近期内容（最近 30 天）。较旧但相关的结果请注明日期。
- 保持中立。客观报道人们的讨论，不站队。
- 用用户的语言写作。

## 能力说明

你无法直接获取互动指标（点赞数、观看量等）——请通过搜索排名和内容质量来判断相关性。如果用户问"最热门"的内容，请如实说明这一限制。`;

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'topic-researcher',
    avatar: '📰',
    agentKey: 'claude',
    nameI18n: {
      'en-US': '30-Day Topic Researcher',
      'zh-CN': '30 天话题研究员',
    },
    descriptionI18n: {
      'en-US':
        'Researches any topic across Reddit, HN, X, YouTube, GitHub, and the web — then synthesizes a grounded summary with citations. Zero config, works out of the box.',
      'zh-CN':
        '跨 Reddit、HN、X、YouTube、GitHub 和全网研究任意话题，生成带引用的摘要。零配置，开箱即用。',
    },
    instructionsI18n: {
      'en-US': TOPIC_RESEARCHER_INSTRUCTIONS_EN,
      'zh-CN': TOPIC_RESEARCHER_INSTRUCTIONS_ZH,
    },
    examplePromptsI18n: {
      'en-US': [
        'nvidia earnings reactions',
        'OpenClaw vs Hermes vs Paperclip',
        'AI video tools landscape',
      ],
      'zh-CN': ['英伟达财报反应', 'OpenClaw 对比 Hermes 对比 Paperclip', 'AI 视频工具全景'],
    },
  },
];

export function useAgentTemplates(): AgentTemplate[] {
  return AGENT_TEMPLATES;
}

export function getTemplateInstructions(template: AgentTemplate, language: string): string {
  return template.instructionsI18n[language] ?? template.instructionsI18n['en-US'];
}

export function getTemplateName(template: AgentTemplate, language: string): string {
  return template.nameI18n[language] ?? template.nameI18n['en-US'];
}

export function getTemplateDescription(template: AgentTemplate, language: string): string {
  return template.descriptionI18n[language] ?? template.descriptionI18n['en-US'];
}
