# 预存测试债清理清单

> 基线：2026-06-24，HEAD 在 `ab6dc94` 之后跑全量 `vitest run` 得 ~49 失败、9 文件。
> 性质：预热池(a23cd10)合入 + 历史遗留造成的**测试 mock 滞后**为主，少量**断言漂移**。
> 运行时功能正常（应用可用），这些是测试代码债，不是功能 bug。
> **改一个勾一个**，可断点续做；每修完一个文件跑 `npx vitest run <file>` 确认再勾。
>
> 已修（不在下列）：`WorkspacePage.dom.test.tsx`(12)、`conversationBridge.sendMessage.test.ts`(4)。

## A 类：测试 mock 滞后（补 mock 即可，低风险，优先清）

- [x] **tests/unit/renderer/platformSendBoxes.dom.test.tsx**（14）✅ 已修
  补 conversation 的 `turnCompleted`/`listChanged`/`warmup.invoke` + acp/gemini 的 `responseStream`/`turnCompleted`（`useConversationRuntimeView`+`warmupConversation` 用到）。14 全绿。
- [ ] **tests/unit/SuperAssistantPage.dom.test.tsx**（12）— `Cannot read properties of undefined (reading 'language')`
  某 mock 缺 `language`（疑似 i18n / identity / editionFeatures mock）。定位后补字段。
- [ ] **tests/unit/acpAgentManagerCronGuard.test.ts**（9）— `this.agent?.getModelInfo is not a function`
  Acp agent mock 缺 `getModelInfo` 方法。给 agent stub 补 `getModelInfo: vi.fn()`。
- [ ] **tests/unit/AcpAgentManagerSkillInjection.test.ts**（4）— `Cannot read properties of undefined (reading 'emit')`
  某 channel（疑 `conversation.turnCompleted`）mock 缺 `.emit`。补 `{ emit: vi.fn() }`。
- [ ] **tests/unit/useGeminiMessage.dom.test.ts**（3）— `Cannot read properties of undefined (reading 'on')`
  channel mock 缺 `.on`。同 platformSendBoxes 处理。
- [~] **tests/unit/common/toolsModalContent.dom.test.tsx**（3）部分修
  已补 arco `Tag` + `systemSettings`(getFfmpegStatus/ffmpegDownloadProgress/downloadFfmpeg) mock。剩 3 个是**断言级**：①ffmpeg status 返回结构（代码读 `next.available`，mock 结构需对齐）②`tools.speechToText` 配置保存断言 ③`settings.speechToTextRequired` 文案查找。需对照 `ToolsModalContent.tsx` 实际逻辑，非纯 mock 补全。

## B 类：断言漂移（先判断是代码 bug 还是测试过时，谨慎改）

- [ ] **tests/unit/guidAgentSelection.dom.test.ts**（1）— `expected 'bypassPermissions' to be 'default'`
  默认权限模式由 `default` 变成 `bypassPermissions`。**⚠️ 权限/安全相关，先确认是有意变更还是回归**，再决定改代码还是改测试。
- [ ] **tests/unit/useEditionFeatures.dom.test.ts**（1）— `expected false to be true`
  某 edition 能力判断结果变了。对照 `useEditionFeatures` 当前逻辑确认。
- [ ] **tests/unit/layoutNavItems.test.ts**（1）— `expected [ '/enterprise/cteam', … ] to include '/tasks'`
  `issues` 导航项的 `paths` 不再含 `/tasks`。对照 `sidebarNav.tsx` 当前合并逻辑，确认是测试过时还是漏配。
