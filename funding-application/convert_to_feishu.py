#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 Markdown 文档转换为飞书在线文档
"""

import sys
import json
import re
import requests
from pathlib import Path

sys.path.insert(0, r"c:\Users\allenzhao\.openclaw\workspace")
from feishu_tools import get_token, notify

FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

MD_FILES = {
    r"D:\1one-command\funding-application\00-申报材料总览.md": "🎯 1ONE ClaudeCode 申报材料总览",
    r"D:\1one-command\funding-application\01-产品方案书.md": "📋 产品方案书 - AI Agent 统一指挥台",
    r"D:\1one-command\funding-application\02-市场分析报告.md": "📊 市场分析报告 - 全球AI工具市场",
    r"D:\1one-command\funding-application\03-财务预测与融资规划.md": "💰 财务预测与融资规划 - 3年商业化路线",
}

def markdown_to_feishu_blocks(md_content: str) -> list:
    """将 Markdown 转换为飞书 Block"""
    blocks = []
    lines = md_content.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i]

        # 跳过空行
        if not line.strip():
            i += 1
            continue

        # 一级标题
        if line.startswith('# '):
            title = line[2:].strip()
            blocks.append({
                "block_type": 3,
                "heading1": {
                    "elements": [{"type": "text", "text": {"content": title}}]
                }
            })
            i += 1
            continue

        # 二级标题
        if line.startswith('## '):
            title = line[3:].strip()
            blocks.append({
                "block_type": 4,
                "heading2": {
                    "elements": [{"type": "text", "text": {"content": title}}]
                }
            })
            i += 1
            continue

        # 三级标题
        if line.startswith('### '):
            title = line[4:].strip()
            blocks.append({
                "block_type": 5,
                "heading3": {
                    "elements": [{"type": "text", "text": {"content": title}}]
                }
            })
            i += 1
            continue

        # 分隔线
        if line.strip() == '---':
            blocks.append({"block_type": 22, "divider": {}})
            i += 1
            continue

        # 代码块
        if line.strip().startswith('```'):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            code_text = '\n'.join(code_lines)
            if code_text.strip():
                blocks.append({
                    "block_type": 1,
                    "paragraph": {
                        "elements": [{"type": "text", "text": {"content": code_text}}]
                    }
                })
            continue

        # 普通段落
        if line.strip():
            blocks.append({
                "block_type": 1,
                "paragraph": {
                    "elements": [{"type": "text", "text": {"content": line.strip()}}]
                }
            })
        i += 1

    return blocks

def create_feishu_doc(title: str, token: str) -> str:
    """创建飞书文档"""
    url = f"{FEISHU_API_BASE}/docx/v1/documents"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {"title": title}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") == 0:
            doc_id = data["data"]["document"]["document_id"]
            print(f"✅ 创建文档: {title}")
            print(f"   文档ID: {doc_id}")
            return doc_id
        else:
            print(f"❌ 创建失败: {data.get('msg')}")
            return None
    except Exception as e:
        print(f"❌ API 请求失败: {e}")
        return None

def append_blocks_to_doc(doc_id: str, blocks: list, token: str):
    """向飞书文档追加 Block"""
    url = f"{FEISHU_API_BASE}/docx/v1/documents/{doc_id}/blocks"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 分批追加（每次最多 50 块）
    batch_size = 50
    for i in range(0, len(blocks), batch_size):
        batch = blocks[i:i+batch_size]
        payload = {
            "children": batch,
            "index": 0
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") == 0:
                print(f"   ✅ 追加 {len(batch)} 个块 ({i+1}-{min(i+batch_size, len(blocks))})")
            else:
                print(f"   ⚠️  追加失败: {data.get('msg')}")
        except Exception as e:
            print(f"   ⚠️  请求失败: {e}")

def convert_md_to_feishu(md_file: str, doc_title: str) -> str:
    """将单个 MD 文件转换到飞书"""
    print(f"\n📄 处理: {Path(md_file).name}")

    # 读取文件
    try:
        with open(md_file, 'r', encoding='utf-8') as f:
            md_content = f.read()
        print(f"   📖 文件大小: {len(md_content)} 字符")
    except Exception as e:
        print(f"❌ 读取失败: {e}")
        return None

    # 获取 token
    try:
        token = get_token()
    except Exception as e:
        print(f"❌ 获取 token 失败: {e}")
        return None

    # 创建文档
    doc_id = create_feishu_doc(doc_title, token)
    if not doc_id:
        return None

    # 转换 Markdown
    blocks = markdown_to_feishu_blocks(md_content)
    print(f"   📝 转换 {len(blocks)} 个块")

    # 追加块
    append_blocks_to_doc(doc_id, blocks, token)

    # 生成链接
    doc_url = f"https://huanle.feishu.cn/docx/{doc_id}"
    print(f"   🔗 链接: {doc_url}")

    return doc_url

def main():
    print("=" * 70)
    print("🚀 开始将 Markdown 转换为飞书在线文档")
    print("=" * 70)

    results = []

    for md_file, doc_title in MD_FILES.items():
        if not Path(md_file).exists():
            print(f"❌ 文件不存在: {md_file}")
            continue

        url = convert_md_to_feishu(md_file, doc_title)
        if url:
            results.append({
                "文件": Path(md_file).name,
                "标题": doc_title,
                "链接": url
            })

    # 输出结果
    print("\n" + "=" * 70)
    print("✅ 转换完成！")
    print("=" * 70)
    print("\n📚 生成的飞书文档：\n")

    for i, result in enumerate(results, 1):
        print(f"{i}. {result['标题']}")
        print(f"   🔗 {result['链接']}\n")

    # 保存链接
    output_file = r"D:\1one-command\funding-application\飞书文档链接.json"
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"✅ 链接已保存: {output_file}")
    except Exception as e:
        print(f"⚠️  保存失败: {e}")

    # 发送通知
    if results:
        message = "\n".join([f"{i}. {r['标题']}\n{r['链接']}"
                            for i, r in enumerate(results, 1)])
        try:
            notify("oc_dfa2562af3837d0960535e4587933142",
                   "📄 申报材料已上传飞书",
                   f"已成功将 {len(results)} 份 Markdown 文档转换为飞书在线文档\n\n{message}",
                   color="green")
            print("\n✅ 已发送通知到 1ONE总指挥群")
        except Exception as e:
            print(f"⚠️  发送通知失败: {e}")

if __name__ == "__main__":
    main()
