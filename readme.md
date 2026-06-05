<h1 align="center">1ONE ClaudeCode</h1>

<p align="center">
  <img src="./resources/brand-mark.png" alt="1ONE ClaudeCode" width="72">
</p>

<p align="center">
  <strong>Claude Code 可视化指挥台 · 个人 AI 工作台 · 企业团队协同 · DevOps 平台</strong><br>
  <em>开源免费 · 多 Agent 原生协作 · WebUI 远程 · 私有化部署 · 24/7 自动化</em>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/gaogg521/1ONE-Claude-Code?display_name=tag&sort=semver&style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-32CD32?style=flat-square" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6C757D?style=flat-square" alt="Platform">
  &nbsp;
  <img src="https://img.shields.io/badge/Electron-37-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  &nbsp;
  <img src="https://img.shields.io/badge/React-19.1-149ECA?style=flat-square&logo=react&logoColor=white" alt="React">
</p>

<p align="center">
  <a href="https://github.com/gaogg521/1ONE-Claude-Code/releases">
    <img src="https://img.shields.io/badge/⬇️%20立即下载-最新版本-32CD32?style=for-the-badge" alt="Download" height="45">
  </a>
  &nbsp;&nbsp;
  <a href="./docs/">
    <img src="https://img.shields.io/badge/📖%20使用文档-查看详情-0369a1?style=for-the-badge" alt="Docs" height="45">
  </a>
</p>

<p align="center">
  <img src="./resources/APP首页展示.png" alt="1ONE ClaudeCode 首页" width="92%">
</p>

---

<details open>
  <summary><strong>📋 目录</strong></summary>

- [产品定位：从个人版到企业团队版](#positioning)
- [竞争优势对比](#comparison)
- [系统架构](#architecture)
- [三大入口：个人 / 企业团队 / 管理后台](#editions)
- [功能模块全景](#modules)
- [功能截图](#screenshots)
- [快速开始](#quickstart)
- [企业版接入](#enterprise)
- [技术栈与数据存储](#tech)
- [常见问题](#faq)
- [参与贡献](#contribute)

</details>

---

<a id="positioning"></a>

## 产品定位：从个人版到企业团队版

早期版本聚焦 **「个人 AI 工作台」**——把 Claude Code、Codex、Gemini CLI 等 Agent 装进一个可视化桌面壳，降低安装配置门槛。

**当前版本是一次架构级升级**：在同一套 UI 与工作流之上，叠加 **企业团队版** 与 **组织管理后台**，形成「个人创作 → 团队协作 → 组织治理 → DevOps 平台」的完整链路。

| 阶段 | 能力重心 | 典型用户 |
|------|----------|----------|
| **个人版** | 本机 Agent、会话、工作区、技能/MCP、定时任务 | 开发者、创作者、独立使用者 |
| **企业团队版** | 同一工作台 + 企业身份、Issues、团队任务、数字员工、共享协同 | 已加入企业的成员 |
| **管理后台** | 成员/LDAP/飞书、邀请码、RAG/MCP/Skills 治理、CCI 流水线 | 组织管理员 |

> 切换「个人版 / 企业团队版」**不会**打开管理后台；管组织请走侧栏 **管理后台** 或工作区 **企业协同与平台能力** 入口。

---

<a id="comparison"></a>

## 竞争优势对比

与 **Cursor**、**GitHub Copilot**、**原生 Claude Code** 相比，1ONE ClaudeCode 的定位是：**开源可控的多 Agent 指挥台 + 可远程的 WebUI + 可扩展的企业协同平台**。

| 对比维度 | **1ONE ClaudeCode** | Cursor | GitHub Copilot | 原生 Claude Code |
|----------|---------------------|--------|----------------|------------------|
| **产品性质** | ✅ 开源免费 | 🔒 商业闭源 | 🔒 商业闭源 | 🔒 商业闭源 |
| **多 Agent 支持** | ✅ 原生支持（Claude / Codex / Gemini / OpenClaw 等） | ⚠️ 有限 | ⚠️ 较弱 | ❌ 单一 Agent |
| **开源可控** | ✅ 完全开源，可二次开发 | ❌ 闭源不可控 | ❌ 闭源不可控 | ❌ 闭源不可控 |
| **WebUI 远程访问** | ✅ 原生支持（桌面 + 浏览器 + LAN/服务器） | ❌ 无独立 WebUI | ❌ 无 WebUI | ❌ 无独立 WebUI |
| **团队协作能力** | ✅ 企业团队版（Issues / 团队任务 / 数字员工 / 组织资源） | 💰 商业付费版 | 💰 企业版 | ⚠️ 协作有限 |
| **私有化部署** | ✅ 支持 Docker / 本机 WebUI / 服务器模式 | ❌ 不支持 | ⚠️ 企业版可选 | ⚠️ 大客户定制 |
| **国内网络可用性** | ✅ 团队级系统部署，本地/内网运行 | ⚠️ 部分能力受限 | ✅ 连接较好 | ❌ 访问困难 |
| **服务定价** | ✅ **完全免费** | 💰 $20–40/人/月 | 💰 $10–19/人/月 | 💰 $20+/月 |

**一句话总结**：别人卖的是「单一 IDE 里的 AI 补全或聊天」；1ONE ClaudeCode 给的是 **可自托管、可编排、可协同、可自动化** 的 Agent 操作系统。

---

<a id="architecture"></a>

## 系统架构

### 多进程模型

```mermaid
flowchart TB
  subgraph Desktop["Electron 桌面 / WebUI 浏览器"]
    R["Renderer<br/>React UI"]
  end

  subgraph Main["Main Process"]
    B["IPC Bridge<br/>统一 RPC 通道"]
    DB["SQLite<br/>会话 / 消息 / 团队"]
    WS["Express WebServer<br/>JWT + WebSocket"]
  end

  subgraph Workers["Worker 子进程（按 Agent 类型隔离）"]
    W1["Claude / ACP"]
    W2["Gemini / Codex"]
    W3["OpenClaw / Nanobot …"]
  end

  R <-->|IPC / WebSocket| B
  B --> DB
  B --> WS
  B --> Workers
```

| 进程 | 目录 | 职责 |
|------|------|------|
| **Main** | `src/process/` | 应用生命周期、数据库、Bridge 实现、WebUI 服务 |
| **Renderer** | `src/renderer/` | React 界面，禁止直接访问 Node API |
| **Worker** | `src/process/worker/` | 各 Agent 独立子进程，通过 pipe 通信 |

所有跨进程调用统一走 **IPC Bridge**（`src/common/adapter/ipcBridge.ts` → `src/process/bridge/`）。WebUI 模式下，WebSocket 与 Electron IPC **复用同一套 Bridge 处理器**。

### 身份与能力矩阵

```mermaid
flowchart LR
  Auth["登录来源<br/>桌面 Operator / WebUI / 企业 SSO"]
  Identity["IdentitySnapshot<br/>个人 / 企业成员 / 组织管理员"]
  Gate["EditionGate<br/>能力开关"]
  UI["路由 + 侧栏 + 功能模块"]
  API["API 租户边界 + 资源 Scope"]

  Auth --> Identity --> Gate --> UI
  Gate --> API
```

| 能力域 | 个人版 | 企业团队版 | 管理后台 |
|--------|--------|------------|----------|
| 个人会话 / 工作区 / 本地 Agent | ✅ | ✅（企业身份） | — |
| Issues / 团队任务 / 数字员工 | ✅ 个人 Issues | ✅ 团队协作 | — |
| 组织成员 / LDAP / 飞书 / 邀请码 | — | — | ✅ 管理员 |
| RAG / MCP / Skills 组织级配置 | 本地 | 团队 + 组织 | ✅ |
| CCI 流水线 / CTeam 看板 / 制品库 | — | 按角色 | ✅ |

详细规格见 [`docs/product/edition-and-identity-spec.md`](./docs/product/edition-and-identity-spec.md)。

### 运行模式

| 模式 | 命令 / 场景 | 说明 |
|------|-------------|------|
| **桌面开发** | `npm run restart` | Electron + Vite HMR |
| **WebUI 生产** | `npm run webui:prod` | 浏览器访问，默认端口 25809（开发）/ 25808（安装包） |
| **远程 LAN** | `npm run restart:webui` | 局域网 IP 访问需先 `npm run build:webui` |
| **服务器部署** | 见 [`docs/SERVER_DEPLOY_GUIDE.md`](./docs/SERVER_DEPLOY_GUIDE.md) | Docker / 无界面 Node 服务 |

---

<a id="editions"></a>

## 三大入口：个人 / 企业团队 / 管理后台

<p align="center">
  <img src="./resources/团队版工作区.png" alt="企业团队版工作区" width="92%">
</p>

| 入口 | 做什么 | 从哪进 |
|------|--------|--------|
| **个人版** | 本机身份聊天、创作、自动化 | 标题栏 → **个人版** |
| **企业团队版** | 公司身份下的 **同一套** 工作台（Issues、团队协同、数字员工） | 标题栏 → **企业团队版** |
| **管理后台** | 成员、认证、邀请码、组织资源、CCI 流水线 | 侧栏 **管理后台** / 工作区 **企业协同与平台能力** |

<p align="center">
  <img src="./resources/企业团队版的超级管理员后台.png" alt="组织管理后台" width="92%">
</p>

---

<a id="modules"></a>

## 功能模块全景

### 一、个人工作台

| 模块 | 说明 |
|------|------|
| **会话** | 多 Agent 并行会话、历史搜索、工作区绑定 |
| **工作区（文件）** | 以项目/文件夹为中心；已加入企业时展示 **企业协同与平台能力** 快捷入口 |
| **Issues** | 产品需求看板；个人版与企业团队版共用入口，按身份隔离数据 |
| **任务** | 个人任务与团队任务（企业团队版） |
| **Skills** | 技能市场、本地技能仓库、可绑定到 Agent |
| **Hooks** | Agent 生命周期 Hook 监控与自动化 |
| **MCP** | MCP 服务注册、一键接入、运行监控 |
| **记忆** | 全局 / 项目记忆，跨会话上下文 |
| **定时任务** | Cron 调度，24/7 无人值守执行 Agent |
| **全局设置** | 模型、Agent、WebUI、主题、多语言、开机启动 |

### 二、AI Agent 与助手

| 模块 | 说明 |
|------|------|
| **多 Agent 管理** | Claude Code、Codex、Gemini、OpenClaw、Cursor Agent 等并存，按场景切换 |
| **内置助手** | 数十个开箱即用助手（PPT、游戏、开发、文档等） |
| **自定义助手** | 绑定提示词、技能、默认模型 |
| **Agent 助手（CAgent）** | 企业知识 + 工具连接 + 交付流程的统一 AI 工作台 |
| **数字员工 / Agent 舰队** | 个人智能体与企业团队数字员工；支持定时运行与文档交付 |
| **模型管理** | 任意 OpenAI-compatible / New-API / 自定义端点 |

### 三、连接与自动化

| 模块 | 说明 |
|------|------|
| **WebUI 远程访问** | 浏览器、手机、平板访问同一套 UI；支持 LAN / Tailscale / 服务器 |
| **通讯渠道** | 飞书、钉钉、微信等 IM 对接，消息触发 Agent、结果回传 |
| **Hook + Cron** | 事件驱动 + 时间驱动，构建通知、审计、批处理链路 |

### 四、企业团队协同

| 模块 | 说明 |
|------|------|
| **Issues 协同** | 需求状态、AI 拆单、协作评论、关联 Agent 处理 |
| **团队任务** | 跨角色任务看板与推进 |
| **共享会话 / 任务** | 主工作台内团队 scope 直达 |
| **团队 Skills 下发** | 组织级技能推送到成员 Agent |
| **团队知识库（RAG）** | 文档上传、切片、向量检索 |
| **团队 MCP** | 组织级外部工具代理与凭证管理 |

### 五、组织管理后台（DevOps 平台）

| 模块 | 说明 |
|------|------|
| **用户 / 团队** | 成员、角色、组织架构 |
| **企业认证** | LDAP、飞书 SSO、钉钉、企微、SMTP |
| **邀请码** | 成员自助加入企业 |
| **CTeam 规划看板** | 需求协同、版本规划、泳道推进 |
| **CCI 流水线** | 流水线编排、执行、质量闸口 |
| **CPack 制品库** | 制品资产与分发 |
| **CCode 代码库** | 代码资产接入与交付关联 |
| **CMeas 效能洞察** | DORA 指标与交付分析 |
| **CTest / CFlow** | 测试管理、价值流打点 |

> 对标商业 DevOps+AI 平台的架构分析见 [`docs/product/cagent-vs-1one-architecture.md`](./docs/product/cagent-vs-1one-architecture.md)。

---

<a id="screenshots"></a>

## 功能截图

### 首页与工作区

<p align="center">
  <img src="./resources/工作空间.png" alt="工作空间" width="90%">
</p>

<p align="center">
  <img src="./resources/网页版展示效果.png" alt="WebUI 网页版" width="90%">
</p>

### 多 Agent 与模型

<p align="center">
  <img src="./resources/AGENT搭配.png" alt="多 Agent 搭配" width="90%">
</p>

<p align="center">
  <img src="./resources/模型管理.png" alt="模型管理" width="90%">
</p>

<p align="center">
  <img src="./resources/会话中修改模型.png" alt="会话中切换模型" width="90%">
</p>

### 助手与数字员工

<p align="center">
  <img src="./resources/内置大量助手.png" alt="内置助手" width="90%">
</p>

<p align="center">
  <img src="./resources/创建个人智能体.png" alt="创建个人智能体" width="90%">
</p>

<p align="center">
  <img src="./resources/团队版的超级助手.png" alt="企业超级助手" width="90%">
</p>

### MCP · Skills · Hook · 记忆

<p align="center">
  <img src="./resources/MCP服务.png" alt="MCP 服务" width="45%">
  &nbsp;
  <img src="./resources/MCP监控1.png" alt="MCP 监控" width="45%">
</p>

<p align="center">
  <img src="./resources/一键添加各种使用MCP.png" alt="一键添加 MCP" width="90%">
</p>

<p align="center">
  <img src="./resources/技能.png" alt="技能" width="45%">
  &nbsp;
  <img src="./resources/skill仓库.png" alt="技能仓库" width="45%">
</p>

<p align="center">
  <img src="./resources/HOOK监控.png" alt="Hook 监控" width="90%">
</p>

<p align="center">
  <img src="./resources/记忆.png" alt="记忆中心" width="45%">
  &nbsp;
  <img src="./resources/记忆管理.png" alt="记忆管理" width="45%">
</p>

### 会话历史与定时任务

<p align="center">
  <img src="./resources/历史会话搜索.png" alt="历史会话搜索" width="45%">
  &nbsp;
  <img src="./resources/历史会话记录.png" alt="历史会话记录" width="45%">
</p>

<p align="center">
  <img src="./resources/定时任务.png" alt="定时任务" width="45%">
  &nbsp;
  <img src="./resources/定时任务2.png" alt="定时任务详情" width="45%">
</p>

### 远程访问与通讯渠道

<p align="center">
  <img src="./resources/远程访问.png" alt="远程访问" width="45%">
  &nbsp;
  <img src="./resources/远程访问设置.png" alt="远程访问设置" width="45%">
</p>

<p align="center">
  <img src="./resources/通讯渠道控制2.png" alt="通讯渠道控制" width="90%">
</p>

### 企业团队协同

<p align="center">
  <img src="./resources/团队需求面板.png" alt="团队需求面板" width="45%">
  &nbsp;
  <img src="./resources/团队需求面板2.png" alt="团队需求面板详情" width="45%">
</p>

<p align="center">
  <img src="./resources/团队任务.png" alt="团队任务" width="90%">
</p>

<p align="center">
  <img src="./resources/团队版技能下发.png" alt="团队技能下发" width="90%">
</p>

<p align="center">
  <img src="./resources/团队版的代码仓库.png" alt="团队代码仓库" width="90%">
</p>

### 组织管理后台

<p align="center">
  <img src="./resources/团队版后台功能预览.png" alt="企业后台功能预览" width="90%">
</p>

<p align="center">
  <img src="./resources/企业版后台登录.png" alt="企业后台登录" width="45%">
  &nbsp;
  <img src="./resources/企业版后台登录上帝视角.png" alt="系统管理员视角" width="45%">
</p>

### 一句话创作（效率演示）

<p align="center">
  <img src="./resources/一句话做游戏.png" alt="一句话做游戏" width="45%">
  &nbsp;
  <img src="./resources/一句话做专业PPT.png" alt="一句话做 PPT" width="45%">
</p>

<p align="center">
  <img src="./resources/一句话创作.png" alt="一句话创作" width="45%">
  &nbsp;
  <img src="./resources/一句话完成开发任务.png" alt="一句话完成开发任务" width="45%">
</p>

### 全局设置

<p align="center">
  <img src="./resources/全局设置.png" alt="全局设置" width="45%">
  &nbsp;
  <img src="./resources/开机启动和多语言.png" alt="开机启动与多语言" width="45%">
</p>

---

<a id="quickstart"></a>

## 快速开始

### 下载安装（推荐）

前往 [Releases](https://github.com/gaogg521/1ONE-Claude-Code/releases) 下载：

| 系统 | 格式 |
|------|------|
| Windows | `.exe` / `.zip` |
| macOS | `.dmg` / `.zip` |
| Linux | `.deb` |

### 第一次使用（3 步）

1. 打开应用 → 侧栏 **会话** → 选择 Agent（推荐 **1ONE CODE**）
2. **设置 → 模型** → 配置 API Key / Base URL
3. 开始对话；需要项目上下文时绑定 **工作区**

### 源码运行（开发者）

**环境：** Node.js ≥ 22、Git

```bash
git clone https://github.com/gaogg521/1ONE-Claude-Code.git
cd 1ONE-Claude-Code
npm install
npx electron-rebuild -f -w better-sqlite3
npm run restart
```

| 命令 | 用途 |
|------|------|
| `npm run restart` | 开发模式（已有实例时优先用这个） |
| `npm run restart:webui` | 构建 renderer + WebUI 模式 |
| `npm run build:webui` | 仅构建 `out/renderer/`（LAN 浏览器访问前必须） |
| `npm run webui:prod` | 生产 WebUI（`localhost:25809`） |
| `npm run test` | 单元测试 |

> **macOS Gatekeeper**：首次打开若被拦截，请到 **系统设置 → 隐私与安全性 → 仍要打开**。

> **Bun**：非必须；`postinstall` 在无 Bun 时会回退 `npx`。

> **Agent 工具包**：安装包内置 CodeGraph、agent-browser 等 CLI；源码开发可执行 `npm run prepare:agent-toolkit`。

---

<a id="enterprise"></a>

## 企业版接入

### 单机 WebUI vs 企业控制台

| 能力 | 入口 | 场景 |
|------|------|------|
| **单机 WebUI** | 设置 → 远程连接 → WebUI | 本机服务、端口、远程访问、本地 admin |
| **企业控制台** | 加入企业后 → `/#/enterprise` | 成员、LDAP/飞书、邀请码、CCI 等 |

### 成员：邀请码加入

1. 设置 → 远程连接 → WebUI → **加入企业**
2. 输入管理员发放的邀请码 → 验证 → 加入
3. 标题栏切换到 **企业团队版**，即可使用 Issues、团队协同、数字员工

### 管理员：创建企业与发码

1. 系统管理员在 **加入企业 → 创建企业** 创建组织
2. 企业后台 → **邀请码** 生成并分发给成员
3. 企业后台 → **企业认证** 配置 LDAP / 飞书 / SMTP

> **桌面端**：完整组织治理建议在浏览器打开 WebUI 企业后台；桌面内提供快捷入口与占位引导。

更多说明：[`docs/product/edition-personal-vs-enterprise.md`](./docs/product/edition-personal-vs-enterprise.md) · [`docs/WEBUI_GUIDE.md`](./docs/WEBUI_GUIDE.md)

---

<a id="tech"></a>

## 技术栈与数据存储

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 37 |
| 前端 | React 19 + TypeScript（strict） |
| 构建 | Vite 6 + electron-vite |
| UI | Arco Design + UnoCSS |
| 终端 | node-pty + xterm.js |
| 存储 | SQLite（better-sqlite3）+ ConfigStorage |
| 协议 | MCP（Model Context Protocol） |
| 后端 | Express + WebSocket + JWT |

### 数据路径（Windows 示例）

| 数据 | 路径 |
|------|------|
| 数据库 | `%APPDATA%\1OneClaudeCode-Dev\1one\1one.db` |
| 配置 | `%APPDATA%\1OneClaudeCode-Dev\config\one-config.txt` |
| 开发锁 | `%APPDATA%\1OneClaudeCode-Dev\lockfile` |

架构详情：[`docs/tech/architecture.md`](./docs/tech/architecture.md)

---

<a id="faq"></a>

## 常见问题

<details>
<summary><strong>个人版和企业团队版界面一样吗？</strong></summary>
一样。差别在身份、租户数据边界，以及企业团队版才开放的团队协作能力（团队页、团队任务 scope 等）。
</details>

<details>
<summary><strong>为什么 LAN IP 访问 WebUI 样式不对？</strong></summary>
非 localhost 访问的是 <code>out/renderer/</code> 预构建产物，不是 Vite HMR。修改 renderer 后请执行 <code>npm run build:webui</code> 并 Ctrl+F5 强刷。
</details>

<details>
<summary><strong>启动报 NODE_MODULE_VERSION / SQLite 错误？</strong></summary>

```bash
npx electron-rebuild -f -w better-sqlite3
npm run restart
```

</details>

<details>
<summary><strong>CodeGraph 需要手动 npx 吗？</strong></summary>
正式安装包不需要，优先使用包内 CLI。仅源码开发且未执行 <code>npm run prepare:agent-toolkit</code> 时才可能回退 npx。
</details>

<details>
<summary><strong>和 Cursor / Copilot 怎么配合？</strong></summary>
1ONE 是<strong>指挥台</strong>：可挂载 Cursor Agent、Claude Code CLI 等作为子 Agent，并统一管理模型、MCP、技能、定时任务与企业协同；不是替代 IDE，而是把多个 AI 工具 orchestrate 在一起。
</details>

---

<a id="contribute"></a>

## 参与贡献

- 🐛 [提交 Issue](https://github.com/gaogg521/1ONE-Claude-Code/issues)
- 💡 [发起讨论](https://github.com/gaogg521/1ONE-Claude-Code/discussions)
- 📖 [版本发布](https://github.com/gaogg521/1ONE-Claude-Code/releases)

开发规范见 [`AGENTS.md`](./AGENTS.md) · [`docs/conventions/file-structure.md`](./docs/conventions/file-structure.md)

---

<p align="center">
  <sub>Built by <a href="https://github.com/gaogg521">gaogg521</a> · Licensed under MIT</sub>
</p>
