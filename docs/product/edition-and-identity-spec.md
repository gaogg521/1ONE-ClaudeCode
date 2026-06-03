# 版本与身份边界规格

## 核心身份

系统统一通过 `IdentitySnapshot` 表达当前身份：

- `anonymous`：未登录 WebUI，也不是桌面 operator。
- `desktop_operator`：桌面本机操作身份，只能代表个人本机能力。
- `webui_local`：WebUI 本地账号，未加入企业租户。
- `enterprise_member`：已加入真实企业租户的成员。
- `enterprise_admin`：组织管理员或系统管理员。

`authenticated` 只表示有 WebUI 会话，不等于企业成员；桌面 operator 也不是管理员。

## 能力原则

业务代码应通过 `EditionGate.can(capability)` 判断能力，而不是自行组合
`hasJoinedEnterprise`、`managementMode`、`auth.status`。

个人能力始终可用：

- `personal.workspace`
- `personal.agents`
- `issues.personal`
- `skills.local`
- `rag.personal`
- `mcp.personal`

企业团队协作能力只在以下条件全部满足时开启：

- 用户是企业成员或企业管理员。
- 当前版本偏好是企业团队版。
- 用户已加入真实企业租户。

管理后台能力只由管理员身份控制，与版本切换无关。

## 数据边界

- 个人智能体使用 `personal_agents`，不写入 `teams`。
- `teams` 只表达企业团队协作，并带 `tenant_id` 边界。
- 个人 Issue、团队 Issue、组织资源必须使用明确 owner/scope，不能把未登录个人数据混入全局 `anonymous` 池。
