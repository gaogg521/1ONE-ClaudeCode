# 设置页与 Guid 助手导航（2026-04-10）

## Guid 首页助手区

- 圆形「+」添加助手：在 `src/renderer/pages/guid/components/AssistantSelectionArea.tsx` 中应 `navigate('/settings/assistants')`（助手管理页），**不要**用 `/settings/agent`（那是 Agents）。
- 路由对照：`Router.tsx` 中 `/settings/assistants` → `AssistantSettings`，`/settings/agent` → `AgentSettings`。

## 设置侧栏性能与交互

- **扩展 Tab 数据**：`src/renderer/hooks/extensions/useExtensionSettingsTabs.ts` 使用 SWR，缓存 key 为 `extensions.settingsTabs`；`SettingsSider` 与 `SettingsPageWrapper` **共用**该 hook，避免重复 `getSettingsTabs` IPC。`extensions.stateChanged` 订阅里对结果 `mutate` 刷新。
- **当前项高亮**：侧栏与移动端顶栏用 **`pathname === `/settings/${item.path}`**（`pathname` 不含 query），**不要**用 `pathname.includes(item.path)`，以免短路径子串误匹配。
- **点击导航**：侧栏项 `onClick` 直接 `navigate(...)`，**不要**再包一层 `startTransition`，减轻「点了半天才切换」的体感延迟。
- **预加载**：`src/renderer/components/layout/Sider/index.tsx` 在 `isSettings === true` 时，对 `Router.tsx` 里与各设置页相同的 lazy 路径做并行 `import()`，降低 Tab 切换时现拉 chunk 的卡顿。

## 与本次改动无关、需保留的场景

- 本机代理 / Agent Hub 等仍可使用 `navigate('/settings/agent?tab=local')` 一类链接（例如 `AgentPillBar`），与助手「+」入口区分。
