#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动向飞书文档填充 Markdown 内容
通过创建多个文本块来规避权限限制
"""

import sys
import json
import requests
import time
from pathlib import Path

sys.path.insert(0, r"c:\Users\allenzhao\.openclaw\workspace")
from feishu_tools import get_token

BASE = "https://open.feishu.cn/open-apis"

# 文件对应关系
DOCS = {
    r"D:\1one-command\funding-application\00-申报材料总览.md":
        "AdmYd7Y1KoldGuxnHE6coAmUnZW",
    r"D:\1one-command\funding-application\01-产品方案书.md":
        "HZ35dNpeDoQfMjxhk8ScKWBBn8f",
    r"D:\1one-command\funding-application\02-市场分析报告.md":
        "DnYyd80xKodr0cxADEAczSHqn9e",
    r"D:\1one-command\funding-application\03-财务预测与融资规划.md":
        "Rm3PdI5vboJP4TxcrofcsCCInbg",
}

def chunk_text(text: str, max_length: int = 1000) -> list:
    """将长文本分块"""
    chunks = []
    lines = text.split('\n')
    current_chunk = []
    current_length = 0

    for line in lines:
        line_length = len(line) + 1
        if current_length + line_length > max_length and current_chunk:
            chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_length = line_length
        else:
            current_chunk.append(line)
            current_length += line_length

    if current_chunk:
        chunks.append('\n'.join(current_chunk))

    return chunks

def create_text_block(text: str) -> dict:
    """创建文本块"""
    return {
        "block_type": 1,
        "paragraph": {
            "elements": [{"type": "text", "text": {"content": text}}]
        }
    }

def add_content_to_doc(doc_id: str, content: str, token: str) -> bool:
    """向飞书文档添加内容"""

    # 分块处理长文本
    chunks = chunk_text(content, max_length=2000)
    blocks = [create_text_block(chunk) for chunk in chunks]

    url = f"{BASE}/docx/v1/documents/{doc_id}/blocks"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 分批添加（每批最多 50 块）
    batch_size = 50
    for i in range(0, len(blocks), batch_size):
        batch = blocks[i:i+batch_size]
        payload = {
            "children": batch,
            "index": 0
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 0:
                    print(f"  ✅ 添加块 {i+1}-{min(i+batch_size, len(blocks))}")
                else:
                    print(f"  ⚠️  块添加失败: {data.get('msg')}")
                    return False
            else:
                print(f"  ⚠️  HTTP {resp.status_code}: {resp.text[:100]}")
                return False
        except Exception as e:
            print(f"  ❌ 请求异常: {e}")
            return False

        time.sleep(0.5)  # 避免 API 限流

    return True

def main():
    print("=" * 70)
    print("📝 自动向飞书文档填充 Markdown 内容")
    print("=" * 70)

    try:
        token = get_token()
    except Exception as e:
        print(f"❌ 获取 token 失败: {e}")
        return

    success_count = 0

    for md_file, doc_id in DOCS.items():
        file_name = Path(md_file).name
        print(f"\n📄 处理: {file_name}")

        # 读取文件
        try:
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"  ❌ 读取失败: {e}")
            continue

        print(f"  📖 文件大小: {len(content)} 字符")

        # 添加内容
        if add_content_to_doc(doc_id, content, token):
            print(f"  ✅ 完成!")
            success_count += 1
        else:
            print(f"  ❌ 失败")

    print("\n" + "=" * 70)
    print(f"✅ 完成! ({success_count}/{len(DOCS)} 个文档)")
    print("=" * 70)

if __name__ == "__main__":
    main()
