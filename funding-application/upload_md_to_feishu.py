#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import requests
from pathlib import Path

sys.path.insert(0, r"c:\Users\allenzhao\.openclaw\workspace")
from feishu_tools import get_token

BASE = "https://open.feishu.cn/open-apis"

MD_FILES = {
    r"D:\1one-command\funding-application\00-申报材料总览.md": "AdmYd7Y1KoldGuxnHE6coAmUnZW",
    r"D:\1one-command\funding-application\01-产品方案书.md": "HZ35dNpeDoQfMjxhk8ScKWBBn8f",
    r"D:\1one-command\funding-application\02-市场分析报告.md": "DnYyd80xKodr0cxADEAczSHqn9e",
    r"D:\1one-command\funding-application\03-财务预测与融资规划.md": "Rm3PdI5vboJP4TxcrofcsCCInbg",
}

def upload_md_as_raw_content(md_file: str, doc_id: str):
    """以 raw_content 方式上传 Markdown 内容"""
    
    # 读取文件
    try:
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"❌ 读取 {Path(md_file).name} 失败: {e}")
        return False

    # 获取 token
    try:
        token = get_token()
    except Exception as e:
        print(f"❌ 获取 token 失败: {e}")
        return False

    # 上传为 raw_content
    url = f"{BASE}/docx/v1/documents/{doc_id}/raw_content"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {"content": content}

    try:
        resp = requests.patch(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        if data.get("code") == 0:
            print(f"✅ {Path(md_file).name}")
            return True
        else:
            print(f"⚠️  {Path(md_file).name}: {data.get('msg')}")
            return False
    except Exception as e:
        print(f"⚠️  {Path(md_file).name}: {e}")
        return False

def main():
    print("=" * 70)
    print("📤 上传 Markdown 内容到飞书文档")
    print("=" * 70)
    print()

    success_count = 0
    for md_file, doc_id in MD_FILES.items():
        if upload_md_as_raw_content(md_file, doc_id):
            success_count += 1

    print()
    print("=" * 70)
    print(f"✅ 完成! ({success_count}/{len(MD_FILES)} 个文档)")
    print("=" * 70)

if __name__ == "__main__":
    main()
