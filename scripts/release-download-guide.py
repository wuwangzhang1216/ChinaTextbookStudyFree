#!/usr/bin/env python3
"""Render a platform-specific download guide from verified release manifests."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', ROOT / 'scripts/install-release.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def render(manifest, ios, index):
    tag = installer.safe_name(manifest['tag'])
    base = f'{installer.RELEASE_ROOT}/{tag}'
    resources = installer.resource_base(manifest, tag)
    ios_base = f"{installer.RELEASE_ROOT}/{installer.safe_name(manifest.get('ios_resource_tag', tag))}"
    assets = {a['name']: a for a in manifest['assets']}
    books = {b['id']: b for b in index['books']}

    def link(name, label=None):
        installer.safe_name(name)
        if name not in assets and name not in {'manifest.json', 'files.jsonl', 'SHA256SUMS', 'VALIDATION.json', 'ios-manifest.json'}:
            raise ValueError(f'Unknown release asset: {name}')
        kind = assets.get(name, {}).get('kind', '')
        location = ios_base if kind.startswith('ios-') else (
            base if kind in {'installer', 'instructions'} or name in {'manifest.json', 'SHA256SUMS', 'VALIDATION.json', 'ios-manifest.json'} else resources)
        if assets.get(name, {}).get('release_tag') is not None:
            location = installer.asset_base(manifest, tag, assets[name])
        return f'[{label or name}]({location}/{name})'

    lines = [f'# {tag} 下载导航', '', '**不需要下载 Assets 中的全部文件。** 按使用方式选择一个入口即可。', '',
             '| 用途 | 从这里开始 |', '| --- | --- |',
             '| 直接学习 | [打开在线课堂](https://d3nmsqi4n72idj.cloudfront.net/)；无需下载附件 |',
             f'| 安装或升级 Web 网站 | {link("install-release.py")}，自动选择、下载及校验所需资源 |',
             '| iOS 离线教材 | 在 App 内按册下载；手动下载时按下方学科选择对应数据和音频两包 |',
             f'| 开发或自行构建 | {link("web-source.zip")}，或克隆仓库；再按安装说明获取资源 |', '',
             f'安装步骤：{link("INSTALL.md")}。完整性检查：{link("SHA256SUMS")}、{link("VALIDATION.json")}。', '',
             *([f'离线清单：{link("manifest.json")}、{link("files.jsonl")}。', ''] if manifest.get('resource_tag') else []),
             '## Web：在线安装', '',
             '下载安装器后运行，安装器不会下载 iOS 的逐册包：', '', '```sh',
             f'python3 install-release.py --tag {tag} --mode static --root ChinaStudyFree-site', '```', '',
             '## Web：离线下载清单', '',
             '以下清单由安装器实际选择规则生成。选一种模式，只下载该模式列出的 ZIP；另需 `manifest.json`、`files.jsonl` 和安装器。', '']
    for mode, source, label in [('static', False, '现成静态网站'), ('source', True, '源码与完整资源')]:
        selected = installer.install_plan(manifest, mode, source)
        lines += [f'<details><summary>{label}：{len(selected)} 个 ZIP，约 {sum(a["bytes"] for a, _ in selected)/1e9:.2f} GB</summary>', '']
        lines += [f'- {link(a["name"])}' for a, _ in selected]
        lines += ['', '</details>', '']
    lines += ['## iOS：按学科、年级下载', '',
              '每册下载“数据”和“AAC 音频”两包即可，不需要 Web 音频分包。旧版另行标明以兼容旧进度；不是重复发布。', '']
    entries = {b['bookId']: b for b in ios['books']}
    if set(entries) != set(books):
        raise ValueError('Book index and iOS manifest differ')
    for subject, label in [('math', '数学'), ('chinese', '语文'), ('english', '英语'), ('science', '科学')]:
        lines += [f'<details><summary>{label}</summary>', '', '| 教材 | 数据 | AAC 音频 |', '| --- | --- | --- |']
        for book in sorted((b for b in books.values() if b['subject'] == subject),
                           key=lambda b: (b.get('schoolSystem', '6-3') == '5-4', b['grade'], b['semester'] != 'up', bool(b.get('supersededBy')))):
            entry = entries[book['id']]
            for field in ('data', 'audio'):
                bundle = entry[field]
                if any(bundle[key] != assets[bundle['name']][key] for key in ('bytes', 'sha256')):
                    raise ValueError('iOS bundle metadata mismatch')
            def bundle(field, label):
                a = entry[field]
                return link(a['name'], f'{label} · {a["bytes"]/1e6:.1f} MB')
            lines.append(f'| {book["textbookName"]} | {bundle("data", "数据")} | {bundle("audio", "音频")} |')
        lines += ['', '</details>', '']
    lines += ['## 为什么还有这么多附件？', '',
              f'- iOS：{len(entries)} 册 × 每册数据/音频两包，共 {len(entries)*2} 个附件，支持按需下载。',
              '- Web：音频受单文件体积限制分包；MP3、原路径兼容音频和 iOS AAC 面向不同用途。',
              '- 未变更的资源可复用前版发布页：清单保留大小与 SHA-256，安装器自动获取；无需重复上传或手动拼接。',
              '- 源码、构建输入和校验清单供开发、离线安装及完整性验证使用。GitHub 另自动提供两种源码压缩包，开发者选一种源码获取方式即可。',
              ('- 本版采用独立的 Web 与 iOS 资源发布页，主发布页保留下载导航、安装器和校验入口。安装器自动获取对应资源，无需逐个选择。'
               if manifest.get('resource_tag') and manifest.get('ios_resource_tag') else
               '- 已发布的文件名和下载地址保持兼容。后续版本应将 Web 与 iOS 资源分开发布，配套下载器再实施资源去重；不能直接删除当前客户端引用的包。'), '']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--ios-manifest', type=Path, required=True)
    parser.add_argument('--book-index', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    content = render(*(json.loads(p.read_text()) for p in [args.manifest, args.ios_manifest, args.book_index]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content)
    print(f'Download guide written: {args.output}')
