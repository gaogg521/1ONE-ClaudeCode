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
- [~] **toolsModalContent.dom.test.tsx**(3)已补 arco `Tag`/`systemSettings`(ffmpeg)/`AionSelect` props 透传。剩 3 个是 **ToolsModalContent 深层功能/时序逻辑(非 mock)**：①image-gen MCP 启用后 `checkSingleServerInstallStatus` 刷新时序(called 0)②切 provider → `ConfigStorage.set('tools.speechToText')` 保存 effect 未触发(called 0)③required/optional marker(源码 line 354 `({t(...)})`)未找到。疑似重构后 save effect/状态时序/marker 渲染条件变化,需逐个深入 `ToolsModalContent.tsx` 的 handleProviderChange / save effect / marker 渲染判断。

## B 类：断言漂移（已处理）
- [x] **guidAgentSelection.dom.test.ts**(1)✅ **有意设计、非 bug（用户确认）**：新会话默认权限模式由 `default`(每步确认)改成全自动放行(claude=`bypassPermissions`/其它=`yolo`)。测试已对齐期望为 `bypassPermissions`。
- [x] **layoutNavItems.test.ts**(1)✅ **真小 bug 已修源码**：企业团队版把 `/tasks` 合并进 Issues 时,漏了把 `/tasks` 加进 Issues 项的匹配 `paths`,导致在 `/tasks` 路由时 Issues 侧栏项不高亮。`sidebarNav.getSidebarNavItems` 在合并分支动态补 `paths`。
- [x] **useEditionFeatures.dom.test.ts**(1)✅ 我边界改动的回归：个人版视图不再展示企业 hub（`showEnterpriseWorkspaceHub` 加了 `isEnterpriseEdition &&`）。测试 1(standalone)期望已对齐 `false`。

## 剩余待办（断言级，需深入功能,非 mock）
- SuperAssistantPage 剩 3：助手创建/模板调用的参数断言。
- toolsModalContent 剩 3：ffmpeg status 结构 / speechToText 配置 / 文案查找。
