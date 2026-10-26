#!/usr/bin/env python3
"""Render the public iOS policy from the same JSON bundled in the native app."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'apps/mobile/ChinaTextbookStudy/Resources/privacy-policy.json'
TARGET = ROOT / 'apps/web/public/ios-privacy.html'
p = json.loads(SOURCE.read_text())
e = html.escape
sections = ''.join(f'<section><h2>{e(s["title"])}</h2><p>{e(s["text"])}</p></section>' for s in p['sections'])
style = 'body{margin:0;background:#fff;color:#4b4b4b;font:17px/1.8 system-ui,-apple-system,"PingFang SC",sans-serif}main{max-width:760px;margin:auto;padding:40px 24px 72px}h1{font-size:30px;line-height:1.3}h2{font-size:21px;margin:0 0 10px}section{border:2px solid #e5e5e5;border-radius:16px;margin:20px 0;padding:22px}p{margin:0}header p{color:#777}a{color:#1899d6}footer{margin-top:30px;color:#777;font-size:14px}'
TARGET.write_text(f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{e(p["title"])}</title><style>{style}</style></head><body><main><header><h1>{e(p["title"])}</h1><p>更新日期：{e(p["updated"])} · 开发者：{e(p["owner"])}</p></header>{sections}<footer>家长支持：<a href="{e(p["support"])}">项目支持与隐私问题</a>。本页说明 iOS App 的数据处理方式。</footer></main></body></html>\n')
print(TARGET)
