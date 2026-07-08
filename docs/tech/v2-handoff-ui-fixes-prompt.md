# 接手话术：fork UI 修复续作（可直接复制给下一个 AI 会话）

> 用途：新会话读完就能接着改 fork 的 UI，不用重新侦察。最后更新 2026-07-08 第二十二轮。
> 详细技术记录见 `AionUi/docs/guides/session-2026-07-08-assistant-branding.zh-CN.md` 第 7 节 与本目录 `v2-handoff-quickstart.md` 第二十二轮。

---

## 最重要的事：代码在 fork，不在当前仓库

- 你的会话很可能开在 `D:\1one-command`——那里只有文档/规划，不是运行的 app。
- 真正运行的 app 和要改的代码在 fork（都在 `one-main` 分支）：
  - 前端 AionUi（Electron+React，monorepo）：`D:\aionui-m0\AionUi\packages\desktop\`，远端 `gaogg521/1oneUI`
  - 后端 AionCore（Rust）：`D:\aionui-m0\AionCore\`，远端 `gaogg521/1oneCore`
- 若文件工具访问不到 `D:\aionui-m0`，先用 `request_directory` 授权该目录。
- 判定「哪套在跑」：截图里的中文串（如「一键扫描全部」「CLI 助手」）在 1one-command 的 locales grep 不到、在 fork 里才有 → 跑的是 fork。

## 已完成（已 commit + push，但【未重编、未打包】）

提交：AionUi `63957f3` + `88ba13b`(doc)，AionCore `8403b02`，1one-command `d2ee36c5`(doc)。

- **① CLI 助手「装了就显示」**：`assistantSelection.ts` 的 `isInstalledGeneratedCliAssistant` 从 `online` 放宽为 `online||offline`；后端 `service.rs` `reconcile_generated_assistants` 过滤纳入 `Offline`。
- **② 1ONE CLI 猫图标**：迁移 `021` 已把 aionrs 头像指向 `/api/assets/logos/brand/1one.png`(猫)，源码已就位【无需改码】，重编后端跑迁移后即变猫。
- **③ 企业登录渠道桌面端置灰/不跳转**：`EnterpriseLoginChannelPanel.tsx` 的 SSO providers 相对 `fetch('/api/one/sso/providers')` 改用 `getBaseUrl()` 拼绝对地址。

## 关键澄清（别再走弯路）

- Cursor 接的是 **Cursor Agent CLI**（命令 `agent`，装在 `%LOCALAPPDATA%\cursor-agent\`，已在 PATH），**不是**编辑器 `Cursor.exe`；命令绝不能手填成 `Cursor.exe`。要真正能跑还需在 Cursor 登录。
- 后端状态语义：`missing`=没装 / `offline`=装了但握手失败(如需登录) / `online`=可用。
- 前端到后端基址：`getBaseUrl()`（`@/common/adapter/httpBridge`）——WebUI 返回 `''`(同源)、桌面返回 `http://127.0.0.1:{port}`、企业远端返回远端 URL。桌面渲染进程是 `file://`，相对 `/api` 一律打不到后端，必须用 `getBaseUrl()`。

## 铁律（踩过坑，别再犯）

- 永远在 `one-main` 分支改+提交，不建功能分支。
- commit 信息全中文，格式 `<type>(<scope>): <subject>`，【绝不加 AI 签名】(Co-Authored-By / Generated 等)。
- fork 仓库里有大量【别人进行中的未提交改动】(docs/resources/updateBridge 等)——提交时【只 `git add` 自己改的文件】，绝不 `git add -A` / `git add .`。
- 影响运行行为的改动(`src/**`、`crates/**`)必须【重编 + 出包】才在安装版生效；出包前 bump `package.json` 版本 patch+1；【打新包不许删任何旧 .exe】。
- 主进程/同步栈禁 `console.*`(会阻塞卡死)。

## 编译 / 测试 / 出包命令

后端（在 `D:\aionui-m0\AionCore`，bash 先 `export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"`）：

```bash
cargo build -p aionui-app --release        # 出后端 exe
cargo test -p aionui-assistant             # 跑该 crate 单测
```

前端（在 `D:\aionui-m0\AionUi`）：

```bash
bunx tsc --noEmit
bunx oxlint <改动文件>
bunx vitest run tests/unit/renderer/<xxx>.test.ts
```

出包（Windows x64，会内嵌后端 exe）：

```bash
AIONUI_BACKEND_LOCAL_PATH='D:\aionui-m0\AionCore\target\release\aioncore.exe' bun run dist:win
# 产物 out\1ONE Code-<version>-win-x64.exe
```

## 现在该干什么

1. 若要让本轮三个修复（尤其②猫图标必须重编后端）在运行的 app 里生效：bump 版本 → `cargo build --release`(AionCore) → `dist:win`(AionUi，不删旧 exe) → 用户实测。
2. 用户后续会提新需求——按上面的定位法找到 fork 里对应文件，小步改、跑 tsc/lint/单测、只提交自己的文件、中文 commit、按需重编出包。
