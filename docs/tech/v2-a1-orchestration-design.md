# v2 A1 看板编排动作设计（对齐 one-employee）

> 状态：2026-07-05 起草并实施 Layer 1。二期计划见 `docs/tech/v2-phase2-plan.md` A1 项。
>
> 目标：把协作看板（one-devops requirements）与数字员工（one-employee）打通——需求可以指派给数字员工并驱动其执行，执行结果回写看板。**不照搬 1one 的 team-slot 模型**，直接对齐 v2 one-employee 的 personal-agent run 机制。

## one-employee run 机制（现状，实现依据）

- `EmployeeService::run_now(owner, agent_id)` → `start_personal_run` → 建会话 + 插 `one_employee_runs` 行 → spawn `execute_run`。
- `execute_run` 用 `build_run_prompt(agent)`（优先 `automation_config.instructions`，否则 description/name 兜底）作为 turn 的 `content` 发给 agent；run 行记录 `conversation_id / status / summary / trigger_source`。
- 数字员工是**个人级**：`one_personal_agents.owner_user_id` 隔离，`run_now` 先 `get(owner, agent_id)` 校验所有权。

## 三层路线

| Layer | 内容 | 状态 |
|---|---|---|
| **L1 assign + 手动派活** | 需求指派给数字员工；一键让员工带需求上下文跑一次；结果回写看板 | ✅ 完成（AionCore `c9e2093` + AionUi `b1b967f`） |
| L2 breakdown | LLM 把 epic/feature 自动拆解为子需求树 | 后续 |
| L3 autopilot | 状态变更/新需求自动触发派活；团队共享数字员工 | 后续（依赖 one-employee tenant 共享改造） |

## L1 设计

### 数据
- 复用 `one_requirements.assigned_to`（已存在，存数字员工 `agent_id`）——**不加表**。
- 派活的会话/运行关联与结果用 `one_requirement_comments` 记录（`author_type` 已支持 `agent`/`autopilot`），`metadata` 存 `{conversationId, runId}`。

### 派活端点（one-devops 内聚）
`POST /api/one/devops/requirements/{id}/dispatch`
1. 读 requirement；`assigned_to` 为空 → 400「未指派数字员工」。
2. 组装任务上下文 prompt：需求标题 + 描述 + 类型/优先级，说明"这是一条协作看板需求，完成后输出可交付摘要"。
3. 调 `EmployeeService::run_now_with_context(owner=当前用户, agent_id=assigned_to, task_context)`——校验该员工属于当前用户（个人级隔离，L1 限制）。
4. 回写：插一条 `author_type='agent'` 评论，body 记「已派发给数字员工，会话 {conversation_id}」，metadata 存 `{conversationId, runId}`；状态若为 `backlog/planning` 推进到 `developing`。
5. 返回 `{ conversationId, runId }`。

### 跨 crate 装配
- one-devops 依赖 one-employee（无环：one-employee 不依赖 one-devops）。
- `OneDevopsRouterState` 加 `employee: Option<Arc<EmployeeService>>`（Option 保持单测可构造不接 employee）。
- app router 里 `one_employee_service` 先于 devops state 构建，直接注入。

### one-employee 改动（最小侵入）
- `build_run_prompt` 保持不变；`start_personal_run` / `execute_run` 加 `task_context: Option<String>` 参数，prompt = `build_run_prompt(agent)` +（有上下文时）`\n\n## 本次任务\n{task_context}`。
- 新增 `pub async fn run_now_with_context(owner, agent_id, task_context) -> (run_id, conversation_id)`；原 `run_now` 走 `task_context = None`。

### 前端（AionUi IssuesTab 详情抽屉）
- 「数字员工」下拉：数据源 `ipcBridge.oneEmployee.list`（当前用户的数字员工）；选中即 `updateRequirement({ assignedTo })`。
- 「派活」按钮：`ipcBridge.oneDevops.dispatchRequirement({ id })`；成功 Toast 展示会话已创建，刷新看板与评论。
- 未指派时按钮禁用并提示先指派。

## L1 验证（2026-07-05）
- 后端 curl 冒烟：未指派 dispatch → 400；指派后 → 返回 `{conversationId, runId}`；状态 backlog→developing；agent 评论带 `{conversationId, runId}` metadata。
- 浏览器 E2E（webui + 真实 aioncore）：详情抽屉数字员工下拉列出员工 → 选中即指派（卡片显示员工名）→ 派活按钮启用 → 点击后状态卡片移到「开发中」、评论出现「已派发给数字员工，运行中（会话 …）」、左侧新建员工运行会话。
- 单测：`append_task_context` 追加/空值 no-op；原 `run_now`/cron 走 `None` 不受影响，one-employee 7/7 过。

## L1 范围限制（写清楚，避免后续误解）
- 只能派给**操作者自己的**数字员工。团队共享数字员工需要 one-employee 支持 tenant 级 agent，属 L3。
- 手动触发；autopilot（自动派活）属 L3。
- 员工执行是异步 turn，看板不实时轮询运行态；结果经评论回写，用户刷新或重开抽屉可见。
