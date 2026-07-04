# M1 — 渠道能力差距分析（上游 v2 vs 本 fork）

> 2026-07-05。源码对照：上游前端 AionUi v2.1.28（`packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/`）、上游后端 AionCore v0.1.41/v0.1.42（`crates/aionui-channel/`）、本 fork（`src/process/channels/`，自带 ARCHITECTURE.md）。

## 核心结论

1. **飞书/钉钉/Telegram：直接用上游，零移植**。凭据形态逐项一致（Lark: app_id+app_secret+可选 encrypt_key/verification_token；DingTalk: client_id+client_secret；Telegram: bot_token），连接方式一致（Lark WS 长连、DingTalk Stream+AI Card、Telegram 长轮询），配对模型一致（6 位码 + 10 分钟 TTL + Approve/Reject）。
2. **微信：实现路线不同，需决策**（见下）。
3. **企业微信（WeCom）：上游只有 UI 占位，后端无实现**——前端有完整 `WecomConfigForm.tsx`（platformType='wecom'），但 AionCore v0.1.41/v0.1.42 的 `PluginType` 枚举无 Wecom、plugins/ 目录无实现，routes.rs 里 "wecom" 仅是内置名称占位（同 Slack/Discord 的 reserved 状态）。**双方都没有可用的企微渠道**，与对比清单结论一致。
4. **配对码手动输入兜底：上游没有**（我们的交付约定项）。上游 5 个 ConfigForm 只有 pending 列表（`channel.getPendingPairings` + `pairingRequested` 事件推送）→ Approve/Reject；全文检索无手动输入配对码入口。**M4 需在上游 UI 叠加此兜底**——好消息：5 个表单结构高度一致（共享 PreferenceRow/SectionHeader 模式 + `assistantBinding.ts`），做一个共享的"手动配对码"组件即可全渠道复用。
5. **渠道↔助手绑定：上游更强**。上游每渠道可绑定助手 + 模型（`assistantBinding.ts`：buildChannelAssistantBinding/getDefaultChannelAssistant + GoogleModelSelector），等价甚至优于我们的 `assistant.{channel}.defaultModel/agent` 配置键。零损失。
6. **多模态**：上游统一消息模型带 `MessageContentType::{Image/Photo/Voice/File}` + image_url/file_name/mime_type 字段，骨架完整；各插件实际收发能力待 M1-3 真实 E2E 验证。

## 微信差异详解（唯一需要决策的渠道）

| | 本 fork（WeixinMonitor） | 上游（weixin 插件） |
|---|---|---|
| 对接目标 | **外部本地微信服务**（自部署 bridge，baseUrl+token 轮询收发） | **微信官方 iLink Bot API**（ilinkai.weixin.qq.com，getupdates 长轮询） |
| 凭据 | baseUrl + token（自建服务的） | account_id + bot_token（官方 bot 注册） |
| 登录辅助 | Electron BrowserWindow 扫码（唯一硬依赖 Electron 的插件） | QR 扫码走 SSE 流（`weixin/login.rs`），无 Electron 依赖 |
| 账号类型 | 取决于本地 bridge（通常=个人号，灰色地带） | 官方 bot 通道（合规，但需在微信侧注册 bot） |
| 迁移影响 | — | **得到**：合规官方通道、无本地服务运维、登录不依赖 Electron；**失去**：如果现有用户依赖"个人号直连"形态，官方 bot 的触达形态不同 |

**建议**：M1-3 用真实账号先验证上游 iLink 路线是否满足实际使用场景；若"个人号直连"仍是硬需求，则把我们的 WeixinMonitor 移植为 AionCore 自有 crate 的第五个 ChannelPlugin（trait 面 8 个方法，参照 dingtalk 约 1-2k 行 Rust）——这是渠道域唯一可能的移植项。

## 迁移结论表

| 渠道 | 上游能力 | 我们能力 | 差距 | 行动 |
|---|---|---|---|---|
| 飞书/Lark | WS 长连+互动卡片+配对 | 官方 SDK WS+互动卡片+配对 | 无实质差距 | **直接用上游**（M1-3 实测确认） |
| 钉钉 | Stream+AI Card 流式 | dingtalk-stream+AI Card 三级降级 | 无实质差距 | **直接用上游** |
| Telegram | 长轮询+InlineKeyboard | grammY 长轮询+InlineKeyboard | 无实质差距 | **直接用上游** |
| 微信 | 官方 iLink Bot | 本地 bridge（个人号形态） | **路线不同** | M1-3 实测 iLink；不满足则移植 WeixinMonitor 为 Rust 插件 |
| 企业微信 | UI 占位、后端无 | 无 | 双方均无 | 如需求成立，M2+ 在自有 crate 实现（前端表单白送） |
| 配对手动兜底 | **无** | 有（交付约定） | UI 缺口 | **M4 在上游 5 个 ConfigForm 叠加共享组件** |
| 助手/模型绑定 | 每渠道助手+模型绑定 | defaultModel/agent 配置键 | 上游更强 | 零损失，直接用 |

## M1 剩余事项

- M1-3 真实配对 E2E：需用户在上游实例（桌面窗口或 :25908）的渠道设置里自行填入飞书/Telegram 凭据走全流程（凭据不经由我处理）；微信路线验证同理。
- fork 基线：AionCore fork `one-main`@v0.1.41 已建并设为默认分支；AionUi fork 待 `gh auth refresh -s workflow` 后同步并建基线。
