# M3 设计 — 数字员工编排在 AionCore fork 中的 crate 化

> 2026-07-05 开工稿。M3 = 「数字员工：编排逻辑 API 化 + superAssistant UI 移植」（对比清单 4–6 人周）。
> 规格书 = 1one 现有实现：`src/process/digitalEmployee/**`（566 行编排）+ `src/renderer/pages/superAssistant/**`（6553 行 UI）+ cron 挂钩（digitalEmployeeCronRun.ts）。

## 1. 现有编排逻辑盘点（三条链路）

| 链路 | 入口 | 行为 |
|---|---|---|
| 个人员工 runNow | `DigitalEmployeeRunService.runNow` | PersonalAgent → **建新会话**（名称=`{agent} - {MM/DD HH:mm}`，preset context/skills 注入 extra）→ 发隐藏 prompt → `cronBusyGuard.onceIdle` 等空闲 → 取最近 12 条消息的最后 assistant 回复截 240 字为 summary → runHistory 回写 `personal_agents.automation_config`（JSON blob） |
| 团队员工 runNow | `TeamDigitalEmployeeRunService.runNow` | team.agents[slotId] → **复用既有会话** `agent.conversationId` → `session.sendMessageToAgent` → 同样 onceIdle/summary → 回写 `teams.agents`（JSON blob） |
| cron 触发 | `digitalEmployeeCronRun.ts` | `AutopilotContext{teamId:'personal'\|teamId, agentSlotId, personalAgentId, ownerUserId}` → started/finished 两钩子回写同上两处 JSON |

共性状态机：`running → success(summary) / failed(error)`，记录 `{runId, conversationId, startedAt, finishedAt, status, summary?, error?}`。

## 2. v2 映射决策

- **新增 crate `crates/one-employee`**（沿用 one-org 模式：自管迁移器 `_one_migrations` 共用账本、`/api/one/employee/*` 路由、上游 diff 仅挂载点）。
- **编排走 in-process 服务，不走 HTTP-to-self**：crate 生在 aioncore 里，直接复用上游 `ConversationService` + `WorkerTaskManager`（与 `aionui-cron::JobExecutor` 同构）。对比清单当时说"改写为 HTTP API 调用"，实测 fork 内更优路径是进程内调用——headless 天然成立，HTTP 面留给前端。
- **运行历史出 JSON 入表**：`one_employee_runs(id, agent_id, team_id?, slot_id?, conversation_id, status, summary, error, started_at, finished_at)`——1one 把 runHistory 塞 JSON blob 是历史包袱，迁移时顺手结构化。
- **员工定义表 `one_personal_agents`**：平移 1one `personal_agents`（含 tenant_id、automation_config），保持 M5 数据迁移一对一。团队员工不建新表——上游 `aionui-team` 的 team/agents 结构直接挂 run 记录（只在 one_employee_runs 关联 team_id+slot_id）。
- **完成判定**：M3a 落地时对齐上游 cron 执行器的等待/完成机制（event bus 订阅 agent 流事件或轮询会话 status），二选一以上游已验证路径为准；不移植 cronBusyGuard。
- **定时触发**：不自建 scheduler。复用上游 `aionui-cron`（At/Every/Cron 三模式齐备），员工的 cron 任务目标=员工会话；one-employee 通过监听自己创建的会话完成事件统一回写 run 记录（手动/定时同一条路径）。

## 3. 内部里程碑

| 步骤 | 内容 | 验收 |
|---|---|---|
| M3a | one-employee crate 骨架 + one_personal_agents/one_employee_runs 表 + 员工 CRUD API + 个人员工 run-now（建会话/发 prompt/完成判定/summary/run 记录） | cargo test + curl 冒烟：run-now 后 runs 表出现 success 记录 |
| M3b | 团队员工 run-now（复用上游 team 会话）+ cron 集成（员工定时任务经 aionui-cron） | 定时触发 E2E |
| M3c | superAssistant UI 移植首屏（Overview/AgentsTab 重接线 `/api/one/employee/*`）——与 M4 的 httpBridge 适配层共用 | fork AionUi 页面可视 |

## 4. UI 移植边界（M3c vs M4）

superAssistant 页面 14 个组件里 Runtimes/Issues/EnterpriseCollaboration 面板依赖企业域 API（one-org M2e 范围），M3c 只迁 Overview/Agents/Settings 三个纯员工域 tab；其余随 M4 管理后台一起重接线。
