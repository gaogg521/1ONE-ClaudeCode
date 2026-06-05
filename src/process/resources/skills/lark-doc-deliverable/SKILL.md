---
name: lark-doc-deliverable
description: Create Feishu/Lark online docx via lark-cli after local HTML+Word deliverables. Feishu is optional; local files are mandatory.
---

# 飞书文档交付（lark-doc-deliverable）

飞书为**可选增强**。无论飞书是否成功，都必须先完成本地 **HTML + Word 双格式**。

## 推荐顺序

1. 写 `deliverables/<任务>/report.md`
2. 生成 `report.html`（standalone，浏览器可开）
3. 用 **officecli** 生成 `report.docx`
4. **最后**尝试飞书（本技能）

## 飞书命令

```bash
lark-cli docs +create --from-md deliverables/<任务>/report.md --title "<标题>"
```

成功后在摘要粘贴文档 URL；更新已有文档用 `docs +update`。

## 失败回退（必须遵守）

| 情况 | 处理 |
|------|------|
| lark-cli 未安装/未登录 | 说明原因，**仍交付** report.html + report.docx |
| 权限不足 | 记录错误，建议补授权，**仍交付**本地双格式 |
| 网络/API 失败 | 不重试到阻塞任务，**仍交付**本地双格式 |

禁止因飞书失败而不产出本地文件；禁止伪造飞书链接。
