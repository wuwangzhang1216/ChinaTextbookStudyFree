# v1.2.0-assets 安装与升级

本版为完整 Web 数据包，包含既有四科数据和媒体，并用新版替换188篇语文扩展阅读；96篇英语故事保留。无需先安装 v1.1.0。

## 推荐：使用配套 Web 源码

下载本 Release 的 `web-source.zip`，解压到一个新目录。进入其中的 `ChinaTextbookStudyFree-web`，执行（Python 3.9+、Node.js 20+）：

```sh
python3 scripts/install-release.py --tag v1.2.0-assets
npm ci
npm run dev
```

打开 http://localhost:3000；新版阅读总览为 http://localhost:3000/content-revision.html。

安装器下载全部5个资源包并校验 SHA-256，随后安装数据；不会因为旧文件已存在而跳过更新。下载包约2GB，依赖及解压后的文件另外占用空间。

离线安装：将5个资源包和 `manifest.json` 放在同一目录，执行：

```sh
python3 scripts/install-release.py --tag v1.2.0-assets --archives-dir /path/to/downloads
```

`web-source.zip` 是经过本轮验证的本地 Web/core 源码快照，包含判分、非朗读片段处理和已修正的题库构建输入。基线提交及本地修改标记见 `SOURCE-VERSION.json`。它不是当前远端 main 的最新源码，也不是 iOS 更新包。GitHub 自动生成的 Source code 附件不包含这些本地修复，请使用 `web-source.zip`。不要将此源码包直接覆盖到已有的更新分支；有自定义代码时，应合并对应修复后再更新数据。

## 包内容与手动解压位置

| 附件 | 解压到仓库目录 | 内容 |
| --- | --- | --- |
| audio.tar.gz | apps/web/public | 含 audio/ 顶层目录；81,017个 Opus |
| data.zip | apps/web/public/data | 44册四科数据、2,166个课节、6,545道单元题、779篇课文、284篇故事 |
| data-source.zip | data | passages/ 和 stories/ 源 JSON，共40个册文件 |
| story-images.zip | apps/web/public/story-images | 472张图，包含284张原图与188张新版图 |
| textbook-pages.zip | apps/web/public/textbook-pages | 1,562张教材页图及20个页码映射 JSON |
| web-source.zip | 新目录 | 配套 Web/core、构建脚本、修正题库源文件与质量报告 |

在 macOS/Linux 下载全部附件后，可运行 `shasum -a 256 -c SHA256SUMS` 校验。`manifest.json` 提供逐包大小、文件数和 SHA-256。旧版下载脚本遇到已有资源会跳过；升级应使用上述新安装器。

## 本轮内容变化与验收范围

- 188篇语文扩展阅读按课文参照调整篇幅与难度，题目从564道增至936道，按年级每篇4—6道。
- 配套188张 Muse 插画及所需朗读；保留旧音频和配图，以兼容既有内容。本轮新生成9,515个不同音频文件，包含返修缓存；最终新版故事使用其中8,993个。
- 修复13篇课文的识别/跨页问题，补回5张教材页图；8处教材原有填空或图示明确跳过朗读。
- 修正9道既有单元题与共享选择题判分；配套 Web 源码包含修复。
- 新版9,186个媒体引用无缺失；新增音频已通过解码检查，图片通过对应正文的场景审查。完整方法与尚存的题库质量限制见 `docs/content-quality-review.md`，不代表全题库已经教师逐题签审。

v1.1.0-assets 保持可下载，可用于回退。本版不打包环境密钥、生成日志、编辑缓存、PDF源文件或本地备份。
