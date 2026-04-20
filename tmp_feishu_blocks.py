import sys
import requests
sys.path.insert(0, r'c:\Users\allenzhao\.openclaw\workspace')
from feishu_tools import get_token, read_doc_blocks

doc_id = 'DvjBdaflVoMDPfx5t6oclRLwnGe'
BASE = 'https://open.feishu.cn/open-apis'
headers = {'Authorization': f'Bearer {get_token()}', 'Content-Type': 'application/json'}

# 获取文档的block结构
blocks = read_doc_blocks(f'https://huanle.feishu.cn/docx/{doc_id}')
print(f"Found {len(blocks)} blocks")

# 找到最后一个block的ID
if blocks:
    last_block_id = blocks[-1]['block_id']
    print(f"Last block ID: {last_block_id}")

    # 在文档末尾添加新内容
    new_content = '''
## 9. 综合架构与商业落地说明

### 9.1 我们解决的核心痛点

- AI 工具与 Agent 生态高度碎片化，模型、Agent、渠道和配置分散在多个系统中。
- 团队协同缺少统一入口，权限审批、工具调用和会话记忆难以跟踪。
- 长期运行场景缺少稳定的调度与监控机制，远程访问与浏览器管理难以实现。
- 扩展和插件能力被孤立在单一客户端，无法形成可成长的生态。

### 9.2 1ONE ClaudeCode 的差异化定位

- **统一控制台**：桌面应用 + WebUI + 服务器模式，支持本地和远程访问。
- **多 Agent 并行**：Claude Code、OpenClaw、Gemini CLI、NanoBot、Remote、Aionrs 等可共存。
- **多模型与 MCP 管理**：支持任意 OpenAI-compatible、自定义端点、MCP 服务接入。
- **可视化运维能力**：Hook 监控、Cron 定时、会话搜索、记忆中心、权限审批。
- **扩展生态**：技能市场、Channel 插件、Agent 适配器、WebUI 贡献、主题与设置 Tab。

### 9.3 技术架构精要

- **三进程隔离**：主进程负责业务与数据库，渲染进程负责 UI，Worker 进程负责 AI 执行。
- **Typed IPC 与桥接**：`preload.ts` 的 `contextBridge` + `src/process/bridge/*`，确保主/渲染通信安全可测。
- **远程模式一体化**：WebUI 模式通过 Express + WebSocket + JWT，把浏览器客户端与 Electron 后端打通。
- **Agent 管理抽象**：`IAgentManager`、`IAgentFactory` 和 `BaseAgentManager` 统一管理不同 Agent 类型。
- **后端执行抽象**：`TeammateExecutor` 支持 `InProcessBackend`、`TmuxBackend`、`ITermBackend`，为多运行环境提供扩展点。
- **协作消息模型**：Team 模式采用"文件 Mailbox + 轮询"机制，保证跨进程异步通信可靠可复现。
- **同进程身份隔离**：`AsyncLocalStorage` 为同进程中的多个 Teammate 提供独立身份与上下文。
- **权限桥接设计**：同进程优先直连 Leader UI 审批，跨进程降级走 Mailbox 请求/响应。

### 9.4 核心能力地图

- 多 Agent / 多模型 / MCP / 技能市场 / 通道插件
- 桌面 + WebUI + 纯 Server + 远程 Agent
- Cron 定时任务 + Hook 事件监控 + 会话记忆
- 权限审批 + 统一事件总线 + 数据持久化
- 插件热加载 + 扩展生命周期管理

### 9.5 给用户与投资人的表达框架

- **用户视角**：这是一个"AI Agent 运营中台"，而不是传统聊天客户端。
- **投资人视角**：它的核心价值是"降低企业接入成本、提高团队可控性、增强长期运行稳定性"。
- **核心卖点**：可视化统一管理、多端远程访问、插件生态、运维级自动化、权限与审计。
- **技术壁垒**：严格的进程边界、Typed IPC、Agent 后端抽象、扩展 Registry、远程与本地兼容。

### 9.6 结论

- 这套系统的核心优势在于"统一、可扩展、可运维、可远程"。
- 已构建"Agent 运行平台 + 扩展市场 + 远程浏览器访问"三层价值。
- 下一步可以重点推进：远程 Agent 持续化、技能市场商业化、企业内网部署与行业定制。
'''

    # 创建新的文本block
    new_blocks = [{
        'block_type': 3,  # 标题
        'heading1': {
            'elements': [{
                'text_run': {
                    'content': '9. 综合架构与商业落地说明',
                    'text_element_style': {}
                }
            }]
        }
    }, {
        'block_type': 4,  # 二级标题
        'heading2': {
            'elements': [{
                'text_run': {
                    'content': '9.1 我们解决的核心痛点',
                    'text_element_style': {}
                }
            }]
        }
    }, {
        'block_type': 2,  # 文本
        'text': {
            'elements': [{
                'text_run': {
                    'content': '- AI 工具与 Agent 生态高度碎片化，模型、Agent、渠道和配置分散在多个系统中。\n- 团队协同缺少统一入口，权限审批、工具调用和会话记忆难以跟踪。\n- 长期运行场景缺少稳定的调度与监控机制，远程访问与浏览器管理难以实现。\n- 扩展和插件能力被孤立在单一客户端，无法形成可成长的生态。',
                    'text_element_style': {}
                }
            }]
        }
    }]

    # 使用batch_update API添加blocks
    update_url = f'{BASE}/docx/v1/documents/{doc_id}/blocks/{last_block_id}/batch_update'
    data = {
        'requests': [{
            'insert_location': 'AFTER',
            'payload': block
        } for block in new_blocks]
    }

    print(f"Updating document with {len(new_blocks)} new blocks...")
    resp = requests.post(update_url, headers=headers, json=data, timeout=30)

    print(f"Response status: {resp.status_code}")
    print(f"Response: {resp.text}")

else:
    print("No blocks found in document")