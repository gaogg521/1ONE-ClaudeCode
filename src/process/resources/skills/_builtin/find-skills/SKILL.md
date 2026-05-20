---
name: find-skills
description: 当用户提出「我该如何完成X」「寻找适用于X的技能」「有没有能……的技能」这类问题，或是表达出扩展功能的需求时，帮助他们发现并安装 Agent 技能。当用户寻求可能作为可安装技能存在的功能时，即可使用本技能。
tags: agent-skills, skill-discovery, skill-installation, skills-cli, agent-ecosystem
---

# 寻找技能

本技能可帮助你从开放 Agent 技能生态中发现并安装技能。

## 何时使用本技能

当用户：

- 提出「我该如何完成 X」这类问题，且 X 是已有对应技能的常见任务时
- 说「寻找适用于 X 的技能」或「有没有适用于 X 的技能」
- 询问「你能完成 X 吗」，其中 X 是一项专业功能
- 表达出扩展 Agent 功能的需求
- 想要搜索工具、模板或工作流

## Skills CLI

Skills CLI（`npx skills`）是开放 Agent 技能生态的包管理器。

**核心命令：**

- `npx skills find [query]` — 搜索技能
- `npx skills add <package>` — 安装技能
- `npx skills check` — 检查更新
- `npx skills update` — 更新已安装技能

**浏览：** https://skills.sh/

## 工作流

1. 明确用户的领域与具体任务
2. 运行 `npx skills find [query]`
3. 向用户展示技能名称、安装命令与 skills.sh 链接
4. 用户确认后运行 `npx skills add <owner/repo@skill>`

## 与 1ONE Skills 市场

若用户需要 1ONE 官方/社区市场技能，可同时使用内置 `1one-skills` 技能（1ONE Skills 平台）。
