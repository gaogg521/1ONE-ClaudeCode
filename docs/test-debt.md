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
- [x] **SuperAssistantPage.dom.test.tsx**(12)✅ 全修：useTranslation 补 `i18n.language`(9)；Modal mock 补 `onOk` 确定按钮；3 个后台运行用例补「点『运行』确认」——**重构后点『立即执行』先弹任务输入框、确认才运行(有意改进)**。✅ **顺带修复了一个退化**:auto-start(从 issue 一键启动)现在把该 issue 的 subject **预填进任务框**(`handleRunAgentNow` 加 `prefillPrompt` 参数),issue 内容透传给 runNow、不再丢失;测试已加 `issue.subject` 断言覆盖。
- [x] **toolsModalContent.dom.test.tsx**(3)✅ **根本原因是 `MediaToolsSettingsSection` 源码 bug**：`status?.ffmpeg.available`（初始 `status=null`，`null?.ffmpeg` = `undefined`，`.available` 抛 TypeError 导致整棵树崩溃，DOM 变 `<div/>`，其余所有断言一并失败）。**双修**：①源码 `ToolsModalContent.tsx:905-912` 补 `?.`（`status?.ffmpeg?.available`、`status?.ffprobe?.available` 等）②测试 mock 更新 `getFfmpegStatus/downloadFfmpeg` 返回正确嵌套 `FfmpegStatus` 结构（`{ ffmpeg:{available,source}, ffprobe:{available,source}, ready, toolsDir }`）③补 `Progress` arco mock 防 downloading 状态崩溃。

## B 类：断言漂移（已处理）
- [x] **guidAgentSelection.dom.test.ts**(1)✅ **有意设计、非 bug（用户确认）**：新会话默认权限模式由 `default`(每步确认)改成全自动放行(claude=`bypassPermissions`/其它=`yolo`)。测试已对齐期望为 `bypassPermissions`。
- [x] **layoutNavItems.test.ts**(1)✅ **真小 bug 已修源码**：企业团队版把 `/tasks` 合并进 Issues 时,漏了把 `/tasks` 加进 Issues 项的匹配 `paths`,导致在 `/tasks` 路由时 Issues 侧栏项不高亮。`sidebarNav.getSidebarNavItems` 在合并分支动态补 `paths`。
- [x] **useEditionFeatures.dom.test.ts**(1)✅ 我边界改动的回归：个人版视图不再展示企业 hub（`showEnterpriseWorkspaceHub` 加了 `isEnterpriseEdition &&`）。测试 1(standalone)期望已对齐 `false`。

## 剩余待办
- SuperAssistantPage 剩 3：助手创建/模板调用的参数断言（待确认是 bug 还是测试过时）。
