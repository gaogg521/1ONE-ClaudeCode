#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
浏览器自动化填充飞书文档
需要安装：pip install playwright
"""

import sys
import asyncio
from pathlib import Path

# 先检查是否安装了 playwright
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("❌ 需要安装 playwright")
    print("运行: pip install playwright")
    print("然后运行: playwright install chromium")
    sys.exit(1)

DOCS = [
    {
        "file": r"D:\1one-command\funding-application\00-申报材料总览.md",
        "doc_id": "AdmYd7Y1KoldGuxnHE6coAmUnZW",
        "title": "申报材料总览"
    },
    {
        "file": r"D:\1one-command\funding-application\01-产品方案书.md",
        "doc_id": "HZ35dNpeDoQfMjxhk8ScKWBBn8f",
        "title": "产品方案书"
    },
    {
        "file": r"D:\1one-command\funding-application\02-市场分析报告.md",
        "doc_id": "DnYyd80xKodr0cxADEAczSHqn9e",
        "title": "市场分析报告"
    },
    {
        "file": r"D:\1one-command\funding-application\03-财务预测与融资规划.md",
        "doc_id": "Rm3PdI5vboJP4TxcrofcsCCInbg",
        "title": "财务预测与融资规划"
    },
]

async def fill_document(page, doc_id: str, content: str, doc_title: str):
    """在飞书文档中填充内容"""

    # 打开飞书文档
    url = f"https://huanle.feishu.cn/docx/{doc_id}"
    print(f"📄 打开: {doc_title}")
    await page.goto(url, wait_until="networkidle")

    # 等待文档加载
    await page.wait_for_timeout(2000)

    # 点击文档编辑区
    print(f"  ✏️  点击编辑区...")
    await page.click("div[data-testid='editor']", timeout=5000)

    # 清空现有内容（如果有）
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Delete")

    # 粘贴内容
    print(f"  📋 粘贴内容...")
    await page.keyboard.type(content, delay=10)  # 逐字输入，delay 10ms

    # 等待保存
    await page.wait_for_timeout(2000)
    print(f"  ✅ 完成!")

async def main():
    print("=" * 70)
    print("🌐 使用浏览器自动化填充飞书文档")
    print("=" * 70)
    print()

    async with async_playwright() as p:
        # 打开浏览器
        browser = await p.chromium.launch(headless=False)  # headless=False 看得到浏览器
        context = await browser.new_context()
        page = await context.new_page()

        for doc_config in DOCS:
            md_file = doc_config["file"]

            # 检查文件是否存在
            if not Path(md_file).exists():
                print(f"❌ 文件不存在: {md_file}")
                continue

            # 读取文件
            try:
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                print(f"❌ 读取失败: {e}")
                continue

            # 填充文档
            try:
                await fill_document(page, doc_config["doc_id"], content, doc_config["title"])
            except Exception as e:
                print(f"⚠️  填充失败: {e}")
                continue

            # 等待用户查看
            await page.wait_for_timeout(3000)

        await browser.close()

    print()
    print("=" * 70)
    print("✅ 所有文档已填充!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(main())
