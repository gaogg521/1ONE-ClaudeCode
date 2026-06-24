# 预存测试债清理清单

> 基线 2026-06-24：HEAD 跑全量 `vitest run` ~49 失败、9 文件（预热池合入 + 历史遗留的测试 mock 滞后为主，少量断言漂移）。运行时功能正常,这些是测试代码债。
> 已修绿并提交：`WorkspacePage`(12)、`conversationBridge.sendMessage`(4)。

## 进度汇总
- ✅ **A 类 mock 滞后已全部清掉**(platformSendBoxes/acpCronGuard/AcpSkillInjection/useGemini + SuperAssistant 的 i18n 部分)。
- ✅ **B 类断言漂移已处理**(guidAgentSelection 确认非 bug、layoutNavItems 修了真 bug、useEditionFeatures 对齐我的边界改动)。
- ⏳ 剩 **6 个断言级**(SuperAssistant 3 + toolsModal 3),不是 mock 问题,需对照功能逻辑逐个判断是 bug 还是测试过时。

## A 类：mock 滞后
- [x] **platformSendBoxes.dom.test.tsx**(14)✅ 补 conversation 的 turnCompleted/listChanged/warmup.invoke + acp/gemini responseStream/turnCompleted（useConversationRuntimeView + warmupConversation 用到）。
- [x] **acpAgentManagerCronGuard.test.ts**(9)✅ mock `BaseAgentManager` 补 `getConfirmations`；`mockAgent` 补 `getModelInfo`；`ipcBridge.conversation.turnCompleted.emit` 补全（emitAgentTurnCompleted 链）。
- [x] **AcpAgentManagerSkillInjection.test.ts**(4)✅ conversation mock 补 `turnCompleted.emit`。
- [x] **useGeminiMessage.dom.test.ts**(3)✅ conversation mock 补 `responseStream.on`/`turnCompleted.on`。
- [~] **SuperAssistantPage.dom.test.tsx**(12 → 剩 3) useTranslation mock 补 `i18n.language`（修了 9）。剩 3 个是**断言级**：`expected vi.fn() to be called with ObjectContaining{…}`——需对照 SuperAssistant 助手创建/模板调用逻辑,判断是参数变了(代码 bug)还是测试过时。
- [~] **toolsModalContent.dom.test.tsx**(3)补了 arco `Tag` + `systemSettings`(ffmpeg) mock。剩 3 个**断言级**：①ffmpeg status 返回结构(`next.available`)②`tools.speechToText` 配置保存断言 ③`settings.speechToTextRequired` 文案查找。

## B 类：断言漂移（已处理）
- [x] **guidAgentSelection.dom.test.ts**(1)✅ **有意设计、非 bug（用户确认）**：新会话默认权限模式由 `default`(每步确认)改成全自动放行(claude=`bypassPermissions`/其它=`yolo`)。测试已对齐期望为 `bypassPermissions`。
- [x] **layoutNavItems.test.ts**(1)✅ **真小 bug 已修源码**：企业团队版把 `/tasks` 合并进 Issues 时,漏了把 `/tasks` 加进 Issues 项的匹配 `paths`,导致在 `/tasks` 路由时 Issues 侧栏项不高亮。`sidebarNav.getSidebarNavItems` 在合并分支动态补 `paths`。
- [x] **useEditionFeatures.dom.test.ts**(1)✅ 我边界改动的回归：个人版视图不再展示企业 hub（`showEnterpriseWorkspaceHub` 加了 `isEnterpriseEdition &&`）。测试 1(standalone)期望已对齐 `false`。

## 剩余待办（断言级，需深入功能,非 mock）
- SuperAssistantPage 剩 3：助手创建/模板调用的参数断言。
- toolsModalContent 剩 3：ffmpeg status 结构 / speechToText 配置 / 文案查找。
