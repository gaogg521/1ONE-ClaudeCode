# 协作状态机

## 状态

1. 个人版

   个人 Sessions、Workspace、Tasks、Issues、Personal Agents、Local Skills、Personal RAG/MCP 可用。
   不展示团队列表，不请求 Team 数据。

2. 已接入企业但仍在个人版

   可以看到组织名称和登录/切换引导，但团队协作入口不自动开启。
   个人 Issue 拆解仍留在个人 Issue 页面。

3. 企业团队版成员

   在个人能力基础上开启团队能力：Teams、团队任务、团队规划、Workspace Agents、组织资源。
   `/team/*` 和团队规划深链必须通过 `teams.collaboration` 能力进入。

4. 管理后台

   只由 `admin.console` 能力进入，用于组织治理、成员、认证、邀请码、组织资源管理。
   切换企业团队版不会进入管理后台。

## 路由降级

- 个人能力深链保持在个人页面。
- 团队能力深链在没有 `teams.collaboration` 时回到个人页或引导登录企业账号。
- 管理后台深链在没有 `admin.console` 时进入 WebUI 管理员登录。

## 登录意图

- `intent=enterprise-member` / legacy `mode=enterprise`：企业成员登录。
- `intent=webui-admin` / legacy `mode=admin`：WebUI 管理后台登录。
- 无 intent：普通 WebUI 本地登录。

桌面端企业成员登录优先在应用内完成，以便写入桌面 session。
