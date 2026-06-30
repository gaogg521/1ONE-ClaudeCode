# OfficeCLI — 内置工具说明

OfficeCLI (`officecli`) 是 1ONE Code 的内置命令行工具，随安装包打包分发，用户安装后无需额外下载即可使用。

## 版本

当前内置版本：**1.0.125**（`resources/bundled-officecli/win32-x64/officecli.exe`）

## 功能覆盖

officecli 支持以下 Office 文件操作（通过 agent 调用 ExecCommand 执行）：

| 子命令           | 说明                              |
| ---------------- | --------------------------------- |
| `xlsx element`   | 列出 Excel 文件的表/行/列/单元格  |
| `xlsx read`      | 读取 Sheet 内容                   |
| `xlsx write`     | 写入/更新单元格                   |
| `xlsx create`    | 新建 Excel 文件                   |
| `pptx element`   | 列出 PPT 幻灯片及元素             |
| `pptx read`      | 读取幻灯片文本/图表内容           |
| `pptx write`     | 修改幻灯片元素                    |
| `watch <file>`   | 启动本地预览服务器（PPT/Office）  |
| `--version`      | 打印版本号                        |

## 打包方式

```
resources/
  bundled-officecli/
    win32-x64/
      officecli.exe   ← 32 MB，随安装包分发
      manifest.json   ← 元数据（版本/平台），供运行时快速检测
```

构建时通过 `electron-builder.yml` 的 `extraResources` 将 `resources/bundled-officecli` 复制到安装目录的 `resources/bundled-officecli/`，运行时通过 `process.resourcesPath` 定位。

## 运行时路径解析策略

两处使用 officecli 的代码均按以下优先级解析：

1. **bundled**（安装包内）：`{resourcesPath}/bundled-officecli/{platform}-{arch}/`
2. **dev bundled**：`{cwd}/resources/bundled-officecli/{platform}-{arch}/`
3. **用户本地安装**：`%LOCALAPPDATA%\OfficeCli\officecli.exe`（Windows）
4. **PATH fallback**：裸命令 `officecli`

> **关键安全规则**：解析时只检查 `manifest.json`（几十字节）的存在性，不对 32 MB 的 exe 本身做 `existsSync`，避免触发 Windows Defender 同步扫描导致主进程冻结。

### 涉及文件

| 文件 | 用途 |
| ---- | ---- |
| `src/process/bridge/pptPreviewBridge.ts` | PPT 实时预览，`findOfficecliExe()` 返回绝对路径给 `spawn` |
| `src/process/utils/shellEnv.ts` | `getWindowsExtraToolPaths()` 将 bundled 目录加入 PATH，aionrs/其他 worker 通过 `getEnhancedEnv()` 继承 |

## Agent 使用方式

- **财务建模助手**（preset `financial-model-creator`）：内置 `officecli-financial-model` skill，自动使用 `ExecCommand` 调用 officecli 创建/编辑 Excel
- **普通工作区对话**：需手动选用带 officecli skill 的 preset，或在对话中引用 officecli skill

## 更新说明

内置版本随应用版本发布更新。用户本地若安装了更新版本，`getWindowsExtraToolPaths()` 中本地安装目录同样在 PATH 内，但 `pptPreviewBridge` 优先使用内置版本。如需切换优先级，可修改 `findOfficecliExe()` 中的检查顺序。
