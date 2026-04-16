#!/usr/bin/env python3
"""
generate-app-icon.py —— 生成 iOS App Store 用的 1024×1024 占位图标。

设计原则：
  - 非商标 / 非人物 / 非品牌元素（不惹麻烦）
  - 纯色 / 渐变 + 一个汉字 "课"，突出"课本"的核心意涵
  - 不透明 sRGB（App Store 要求：方形、无 alpha，系统自动圆角）

用法:
    python3 scripts/generate-app-icon.py

产物:
    apps/mobile/ChinaTextbookStudy/Resources/Assets.xcassets/
        AppIcon.appiconset/
            Contents.json
            icon-1024.png

被 project.yml 里的 ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon 拾取。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "apps/mobile/ChinaTextbookStudy/Resources/Assets.xcassets/AppIcon.appiconset"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZE = 1024
ICON_PATH = OUT_DIR / "icon-1024.png"
CONTENTS_PATH = OUT_DIR / "Contents.json"


def linear_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            pass  # placeholder — loop replaced below for speed
    # faster: build row-by-row via putpixel only for the first column, then paste
    base = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        base.putpixel((0, y), (r, g, b))
    return base.resize((size, size))


def load_chinese_font(px: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, px)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    # Duolingo-ish green → sky blue gradient (matches the in-app default theme).
    img = linear_gradient(SIZE, top=(0x58, 0xCC, 0x02), bottom=(0x1C, 0xB0, 0xF6))
    draw = ImageDraw.Draw(img)

    # Draw the character "课" centered.
    font = load_chinese_font(int(SIZE * 0.62))
    text = "课"
    # Pillow 10+ uses `textbbox` for metrics.
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (SIZE - tw) // 2 - bbox[0]
    ty = (SIZE - th) // 2 - bbox[1]
    # Drop shadow for a bit of depth (subtle).
    draw.text((tx + 8, ty + 12), text, font=font, fill=(0, 0, 0, 40))
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255))

    img.save(ICON_PATH, format="PNG")
    print(f"wrote {ICON_PATH} ({ICON_PATH.stat().st_size // 1024} KB)")

    contents = {
        "images": [
            {
                "filename": "icon-1024.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            }
        ],
        "info": {"author": "xcode", "version": 1},
    }
    CONTENTS_PATH.write_text(json.dumps(contents, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {CONTENTS_PATH}")


if __name__ == "__main__":
    main()
