# LiteLLM / new-api 网关对接（2026-04-14）

供后续会话直接复用；实现以仓库源码为准。

## 检测与何时加头

- 文件：`src/common/utils/litellmGateway.ts`
- **`isProviderLiteLlmProxy`**：`litellmProxy: true`、baseUrl/name/authTypeCustom 含 `litellm`、`useModel` 或 `model[]` 中任一为 `litellm/<upstream>` 前缀（前缀大小写不敏感；裸 `litellm` 不算）。
- **`shouldAttachLiteLlmOpenAiProtocolHeader`**（旧名 **`shouldSendOpenAiCompletionsApiHeader`**，仍为别名）：`new-api` 平台 **或** 上述 LiteLLM 探测为真时，对 OpenAI 兼容请求附加网关头。

## HTTP 头（用户要求：默认 openai-completions + openai 兼容）

- **`liteLlmOpenAiProtocolHeaders()`** 一次请求内同时发送：
  - `Api: openai-completions` — 常见 new-api / 中转约定；
  - `Protocol: openai` — 与 LiteLLM「工具封装」文档里 `protocol: "openai"` 等价。
- 使用处：**`src/common/api/ClientFactory.ts`**（OpenAI 客户端 `defaultHeaders`）、**`src/process/agent/one/OneAgent.ts`**（`fetch` 的 `headers`）。

## 文档侧配置形态（非请求体）

- 常量 **`LITELLM_OPENAI_WRAPPER_CONFIG_EXAMPLE`**：`base_url`、`api_key`、`model`、`endpoint: "/v1/chat/completions"`、`protocol: "openai"`、`content_type: "application/json"` — 与网关团队给出的工具封装示例 JSON 对齐，供对照；实际 URL 仍由 `baseUrl` 规范化 + `/chat/completions` 拼装。

## 设置与类型

- **`openai-completions`**：`ProviderAuthTypeChoice` 与 per-model 协议选项；UI 文案含「Protocol: openai / chat completions」；`platformAuthType` 等将其解析为 OpenAI 兼容路由。
- **aionrs**：`envBuilder.ts` 中 `[providers.openai]` 的 **`api = "openai-completions"`** 与上述 HTTP/OpenAI 线格式意图一致（注释中引用 LiteLLM 建议的 endpoint/protocol）。

## 开发注意

- 改的是 TypeScript：dev 下通常热更新；行为未更新时用 **`npm run restart`**（见 `memory/user-dev-restart-preference-2026-04-14.md`）。打安装包需重新 `electron-vite build` / `dist:win` 等。

## 单测

- `tests/unit/litellmGateway.test.ts`：代理探测、加头条件、`liteLlmOpenAiProtocolHeaders` 内容、别名与 `getProviderAuthType` 的 LiteLLM 相关用例。
