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
| **L2 breakdown** | LLM 把 epic/feature 自动拆解为子需求树 | ✅ 完成（2026-07-06，见下 L2 设计段） |
| **L3 autopilot** | 指派/进入 pre-dev 状态自动触发派活 | ✅ 完成（2026-07-06，见下 L3 设计段） |
| **L3 团队共享数字员工** | 需求可派给团队共享（tenant 级）数字员工 | ✅ 完成（2026-07-06，见下 L3 段末） |

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

## L2 设计（2026-07-06 完成）

与 L1「派活」的本质区别：dispatch 是 **fire-and-forget**（spawn 后台 turn，立即返回 `{conversationId,runId}`，结果异步经评论回写）；breakdown 需要**阻塞拿到 agent 完整回复**才能解析成子需求，所以走一条新的同步 run 路径。

### one-employee 改动
- `provision_run(owner, agent, trigger)`：从 `start_personal_run` 抽出的公共部分——建会话（注入 agent 身份到 extra）+ ensure_workspace + 插 `running` run 行，返回 `(run_id, conversation_id)`。`start_personal_run`（fire-and-forget）和新的阻塞路径共用。
- `run_prompt_blocking(owner, agent_id, prompt) -> RunReply`：provision 后**内联 await** `run_agent_turn`（不 spawn、不 prepend `build_run_prompt`，用调用方给的完整 prompt），成功后取**完整（不截断）回复**、持久化 run outcome，返回 `RunReply{run_id, conversation_id, reply}`。owner 隔离同 L1（`get` 校验所有权）。trigger_source 记为新常量 `breakdown`。
- `extract_summary` 拆成 `extract_latest_reply`（完整）+ `truncate_summary`（240 字）；run 行 summary 仍存截断版，breakdown 解析用完整版。

### one-devops 改动
- `breakdown.rs`（纯函数，可单测）：`build_breakdown_prompt(req)` 拼「把这条需求拆成 2-8 条子需求、严格只输出 JSON 数组、type∈story/task、priority∈low/medium/high/urgent」；`parse_breakdown_items(reply)` 宽松解析——切出最外层 `[...]`、剥 ```json 围栏与散文、clamp 非法 type/priority 到默认（story/medium）、跳过空 subject、上限 20 条。
- `DevopsService::create_breakdown_children(parent_id, creator, items)`：校验 parent 存在后循环 `create_requirement`（带 `parent_id`）建子树，返回子 DTO。
- 端点 `POST /api/one/devops/requirements/{id}/breakdown`：读 req → 必须已指派（同 L1 限制，未指派 400）→ `run_prompt_blocking` → `parse_breakdown_items`；空 → 插一条失败评论并 400；非空 → 建子树 + 插 `agent` 评论（body「已自动拆解为 N 条子需求」，metadata `{conversationId, runId, childIds}`）→ 返回 `{conversationId, runId, created}`。**breakdown 不推进 req 状态**（规划动作，非开发动作，与 dispatch 推进到 developing 不同）。

### 前端（AionUi IssuesTab 抽屉）
- ipcBridge `oneDevops.breakdownRequirement`（httpPost）；抽屉在「派活」旁加「自动拆解」按钮，指派后启用；成功 Toast「已拆解为 N 条子需求」→ 刷新树 + 评论。

### L2 验证（2026-07-06）
- 单测：`parse_breakdown_items` 5 例（纯数组/剥围栏散文/clamp 非法枚举+跳空/不可解析返回空/上限 20）；one-devops 14 过、one-employee 7 过。
- 后端 curl + **真实 claude CLI** E2E：未指派 breakdown → 400；建 claude 员工指派后 breakdown → claude 返回 JSON → 解析 6 条子需求全部建在 epic 下（tree 嵌套正确、type/priority clamp 正确）、agent 评论带 `{conversationId,runId,childIds}`、run 行 status=success trigger=breakdown。
- 前端 tsc/oxlint 零告警。

### L2 范围限制
- 同 L1：只能用**操作者自己的**数字员工做拆解（复用 `assigned_to`，未指派则先指派）。
- 子需求默认 type=story（feature/epic 的子项通常是 story/task），非法值 clamp 到 story/medium。
- 一次拆解只拆一层（不递归拆子需求的子需求）；子需求不继承 `assigned_to`（保持待规划）。

## L3 设计（2026-07-06）

L3 拆两块：**autopilot（自动派活）已完成**；**团队共享数字员工**推迟（见段末）。

### L3-autopilot（已完成）

在 L1 手动「派活」之上加一个**每需求 autopilot 开关**：开启后，指派数字员工或需求进入 pre-dev 状态时**自动触发派活**，省掉手动点击。

**数据**：`one_requirements` 加 `autopilot INTEGER NOT NULL DEFAULT 0`（migration 004）。RequirementRow/Dto 加 `autopilot: bool`；create/update input 加 `autopilot: Option<bool>`（create 默认 false，update 用 `COALESCE(?, autopilot)` 缺省保留）。

**触发机制（reactive，非 scanner）**：把 L1 dispatch 的核心抽成 `dispatch_core(state, user_id, id)`（run + 评论回写 + 状态推进），手动 `/dispatch` 端点与 autopilot 共用。新增 best-effort 的 `maybe_autopilot(state, user_id, id)`：在 `create_requirement` / `update_requirement` 路由**写库之后**调用——若 `autopilot on && 已指派 && 状态∈{backlog,planning}` 则调 `dispatch_core`；否则静默跳过，失败只 `tracing::warn` **绝不让原请求失败**。

**自守卫的重入控制**：dispatch 成功会把状态从 backlog/planning 推进到 developing，`{backlog,planning}` 门自然挡住后续重复触发（除非用户手动把状态挪回）。无需额外去重标记。

**前端**：devopsTypes RequirementNode/Create/Update 加 `autopilot`；IssuesTab 抽屉数字员工面板加「自动派活」Switch（`updateRequirement({autopilot})`）。

**验证（2026-07-06，真实 claude CLI 后端 E2E）**：
- 单测：`autopilot_flag_persists_and_toggles`（create 持久化/默认 off/改他字段不动 autopilot/显式 toggle）；one-devops 15 过。
- E2E：建 autopilot=true 需求（无指派→不触发）→ 指派 claude 员工 → 自动派活：状态 backlog→developing、agent 评论「已派发…运行中」、后台起员工运行会话；再改 priority（此时 developing）→ **不重复派活**（评论仍 1 条），重入门验证通过。

**autopilot 范围限制**：同 L1/L2 只能用操作者自己的员工；只在 create/update 路由 reactive 触发（无独立扫描器，故「员工自己把状态改回 backlog」这类非 HTTP 路径不会触发）；一次只派一层。

### L3-团队共享数字员工（2026-07-06 完成）

企业版：需求可派给**团队共享**（tenant 级）数字员工，突破 L1/L2「只能用自己的员工」限制。仅企业租户有意义（个人版单用户在 `default` 租户无共享概念）。

**数据**：`one_personal_agents` 加 `visibility TEXT NOT NULL DEFAULT 'private'`（migration 003，`private`=owner 专属 / `shared`=tenant 内共享）+ `(tenant_id, visibility)` 索引。PersonalAgentRow/Dto 加 `visibility`。

**tenant 解析（解耦）**：`CurrentUser` 只有 id/username，无 tenant。tenant 由 one-org 的 `OrgService::tenant_of(user_id)` 解析（membership→tenant_id，无则 `default`）。为避免 one-employee/one-devops 依赖 one-org，在 one-employee 定义 `TenantResolver` trait，**app 层**用 `OrgTenantResolver(Arc<OrgService>)` 实现并注入两个 router state（`Option`，缺省→`default`，个人版/测试可不接）。

**service（one-employee）**：
- `resolve_agent_for_use(user_id, tenant_id, agent_id)`：`WHERE id=? AND (owner=? OR (visibility='shared' AND tenant_id=?))`——owner 或同租户共享才可用，否则 NotFound。
- `list_available(user_id, tenant_id)`：`owner=? OR (visibility='shared' AND tenant_id=?)`——自己的 + 同租户共享；替代原 owner-only `list`（已删）。
- `set_visibility(owner, agent_id, visibility)`：owner-only，校验 private/shared。
- `run_now_with_context`/`run_prompt_blocking` 加 `tenant_id` 参数，改用 `resolve_agent_for_use`；**run 归调用者**（会话/工作区/run 行 owner=调用者），agent 定义 owner 不变。
- `create` 用 caller 的真实 tenant（原硬编码 'default'）；owner-only 变更仍走 `get`。
- 上述两条查询抽成自由函数 `select_agent_for_use`/`select_available_agents`（可脱离重构造的 EmployeeService 单测）。

**路由**：one-employee 加 `PUT /agents/{id}/visibility`；`list` 走 `list_available`；`create` 用解析 tenant。one-devops dispatch/breakdown 解析 caller tenant 传入 run 方法，去掉「team-shared not supported yet」分支，错误文案改「不是你的员工，也未在团队内共享」。

**前端**：PersonalAgent 加 `visibility`；`personalAgent.setVisibility` 通道；ManageAgentModal 加「共享给团队」Switch（**仅 `tenantId!=='default'` 的企业租户显示**，保存时经 setVisibility 应用）。派活/拆解下拉走 `personalAgent.list`→`list_available`，自动含同租户共享员工。

**验证（2026-07-06）**：
- 单测 `sharing_resolves_own_and_tenant_shared`：own/private 拒他人/shared 同租户可用/跨租户拒绝/own 跨租户仍可见；list_available 只含自己的+同租户共享。one-employee 8 过、one-devops 15 过、one-org 6 过、全 app 编译过。
- 后端 E2E（真实 aioncore --local）：`/visibility` set→shared、非法值 400；`/org/create` 后**新建员工继承企业 tenant**（验证 OrgTenantResolver 注入生效）；own 员工经新 resolve 路径 dispatch 回归 200。跨用户真实共享派活由「共享谓词单测 + tenant 解析 E2E」两部分组合覆盖（--local 单用户无法直接演两个 authed 用户）。

**范围限制**：只有 owner 能 share/unshare；共享按 tenant 边界（跨租户不可见）；autopilot 触发的 dispatch 同样走 resolve（若把需求指派给同租户共享员工，autopilot 也能派）。跨用户真实共享的活体 E2E 待多用户企业环境（归 C 组凭据轮）。存量数据边：本改动前建的员工 tenant='default'，企业用户共享它们只会到 'default' 租户——如需可后续 backfill，但新员工已带正确 tenant，且默认 private 无影响。
