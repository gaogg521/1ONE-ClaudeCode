# 技能调用机制（Skills Invocation）

> 最后更新：2026-07-04。对应两轮修复见根目录 `CONTEXT.md` 同日章节。

## 数据源（统一 catalog）

三个消费方读**同一组目录、同一个元数据解析器**（`readSkillMetadata`），不允许各自造轮子：

| 目录 | 内容 | 谁扫它 |
|------|------|--------|
| `%APPDATA%/{app}/config/builtin-skills/` | 随包分发技能（源：`src/process/resources/skills/`） | `fs.listAvailableSkills` provider、`AcpSkillManager` |
| `%APPDATA%/{app}/config/builtin-skills/_builtin/` | 自动注入技能（所有会话生效，不在助手编辑器展示） | `fs.listAutoSkills` provider、`AcpSkillManager.discoverAutoSkills` |
| `%APPDATA%/{app}/config/skills/` | 用户导入的自定义技能 | 同 listAvailableSkills / AcpSkillManager |

- 技能中心 UI（`SkillsHubSettings`）与助手编辑器（`useAssistantEditor`）都走 `fs.listAvailableSkills`。
- 运行时按需加载走 `AcpSkillManager`（`src/process/task/AcpSkillManager.ts`）：**按 enabledSkills 组合的 Map 缓存实例**，并发会话互不覆盖；日志写 `logs/skills.log`（主进程禁 console）。

## 技能如何到达 agent（三条路径）

### 1. 原生机制（gemini 系）

`GeminiAgentManager.createBootstrap()` 把 enabledSkills（含 `_builtin` 名单）传给 worker，worker 侧 SkillManager 原生发现（symlink 进 `.gemini/skills/`）；助手规则写入 `GEMINI.md`。**不走首条消息注入**。

### 2. 首条消息注入（ACP 系：Claude/Codex/OpenCode…）

`applyAgentToolkitFirstMessage`（`src/process/services/agentToolkit/firstMessage.ts`）在会话首条消息注入，两路分支：

- backend 支持原生技能目录且非自定义 workspace → 只注入助手规则；
- 否则 → 注入规则 + **技能索引**（名字+描述+文件位置，agent 用 Read 工具按需读 SKILL.md）。

**关键不变量（2026-07-04 回归修复）**：注入必须应用在**实际发送的字符串**上（`data.agentPrompt ?? data.content`）。`agentPrompt` 是附件增强前缀+正文，渲染端消息都带；只注入 `data.content` 再发送 `agentPrompt` 会把规则和索引整个丢掉。回归用例：`tests/unit/AcpAgentManagerSkillInjection.test.ts` 带 agentPrompt 的两条。

`isFirstMessage` 是 **per-manager-instance** 字段：app 重启 / manager 闲置回收后重建，下一条消息自动重新注入——不需要额外的"会话恢复重注入"机制。已知缺口：CLI 会话中途自行压缩上下文可能挤掉索引，host 侧无法检测，靠路径 3 缓解。

### 3. 斜杠显式调用（所有会话类型，2026-07-04 新增）

- `conversation.getSlashCommands` 对所有会话类型返回"会话已启用技能"命令项（`source: 'skill'`，选中后填入 `/skill-name `）。
- 发送时 `sendConversationMessage` 调用 `expandSlashSkillInvocation`（`src/process/services/agentToolkit/slashSkillInvocation.ts`）：输入是 `/skill-name [args]` 且技能在会话 enabledSkills 中 → 技能全文确定性注入 agent prompt；用户看到的消息保持原样。
- **只匹配会话显式启用的技能**（与菜单展示范围一致），不劫持 ACP 原生命令（/compact 等）。

另有旧路径 `[LOAD_SKILL: name]` 文本协议（gemini 无文件工具时模型主动请求，`GeminiAgentManager` 截获回喂全文），保留兼容，但新功能不应依赖它——模型不输出标记就静默失败。

## 助手（assistant）与技能的绑定

- 预置助手：`src/common/config/presets/assistantPresets.ts` 的 `defaultEnabledSkills` 只做**首次落库种子**；运行时读的是存储配置（用户在设置里改过即生效）。种子引用的技能必须存在于打包资源——`tests/unit/assistantPresetSkillRefs.test.ts` 构建期校验。
- 会话创建时 enabledSkills 写进 `conversation.extra.enabledSkills`，manager 从中读取。
- 助手编辑抽屉对"已启用但 catalog 找不到"的技能标红并提供一键移除；判断时要排除 `_builtin` 自动技能（它们不在 `listAvailableSkills` 里但运行时可解析）。

## 排查入口

1. 技能发现/加载问题：看 `logs/skills.log`（stale 引用、目录缺失、body 加载失败都在这）。
2. 注入是否生效：CDP（dev 默认 9230，见 `docs/cdp.md`）重放 `conversation.getSlashCommands` / 检查发送链路。
3. 上游对照：`git log upstream/main`（已配 upstream remote，push 已禁用），release notes 是补丁清单。
