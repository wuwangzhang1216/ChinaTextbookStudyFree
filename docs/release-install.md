# v1.7.3 默认首课互动引导：安装与升级

本版为当前默认修订版一年级数学首课补齐楼层互动，保留原题、ID、音频和成绩；已进入讲解的会话保留讲解进度。儿童、教师及真机验收仍待完成。继承 v1.7.2 修复的一年级语文拼音朗读，拼音与英语使用独立音频地址，校正拼音单元四道题；已完成成绩保留。包含此前新增的官方标注“根据2022年版课程标准修订”的七册人教版数学：一上、一下、二下、三下、四上、五上、六上，共 290 个课时、57 个单元挑战、2,082 道配套题，新音频采用 Edge。新版使用独立 ID，保留旧版和原有成绩；连同已更新的二上、三上，覆盖当前官方目录中全部九册修订版数学。包含全部 58 册教材版本的完整网站及资源，无需先安装旧版本，也不需要 AI API Key。

**不用下载 Assets 中的全部附件。** 在线学习直接[打开课堂](https://d3nmsqi4n72idj.cloudfront.net/)；Web 用户使用安装器自动选择资源；iOS 用户在 App 内按册下载。手动离线下载的分类清单及逐册链接见[下载导航](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/releases/v1.7.3-downloads.md)。主发布页仅保留入口和校验文件；大型 Web 包位于 `v1.7.3-web-resources`，iOS 逐册包位于 `v1.7.3-ios-resources`，安装器自动选择对应发布页。Web 音频分为独立 ZIP，每个不超过 1.4 GB（十进制），按安装模式下载对应分包后直接解压，无需拼接。

## 最快使用：安装现成网站

只需 Python 3.9+，无需 Node.js 或 FFmpeg。在 [Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.7.3) 下载 `install-release.py`，执行：

```sh
python3 install-release.py --tag v1.7.3 --mode static --root ChinaStudyFree-site
python3 -m http.server 8080 --directory ChinaStudyFree-site
```

打开 http://localhost:8080/。Windows 将 `python3` 换成 `py -3`。这是 HTTP 本地预览；正式托管时使用支持 MP3 和 HTTP Range 的静态服务器（例如 Nginx 或对象存储/CDN），跟读录音需要 HTTPS 或 localhost。

安装器会下载、验证完整附件的 SHA-256，再在临时目录解压并逐文件核验后安装。资源较大，请为下载、安装前的暂存、现有站点和备份预留充足空间，建议至少 40 GB。安装期间保持现有服务停止，安装完成后再启动。

## 已有旧版：原目录升级

先备份自定义文件或数据，并从新版 Release 下载新版安装器。不要用旧安装器安装新版分包。

```sh
python3 install-release.py --tag v1.7.3 --mode static --root /path/to/existing-site
```

此命令覆盖已有页面、配套数据、音频和缓存文件，包括旧 GPT 音频的同名兼容文件；不会因音频目录已存在而跳过更新。未包含在材料包中的自定义文件会保留，旧版遗留文件也不会自动删除。浏览器学习记录保存在原来的浏览器存储中；继续使用相同域名、协议和端口可以保留该存储。

如果是源码部署，先备份本地代码修改；希望安装本版匹配源码与所有资源时执行：

```sh
python3 install-release.py --tag v1.7.3 --with-source --root /path/to/ChinaTextbookStudyFree
cd /path/to/ChinaTextbookStudyFree
npm ci
npm run build
```

`--with-source` 会更新材料包中的源码文件。只更新已检出配套版本的资源时，省略这个参数。重新部署 `apps/web/out/`，刷新原站点 CDN 缓存，并重新打开页面，使新服务工作线程和音频版本地址生效。

## 全新源码安装

需要 Node.js 20+、Python 3.9+、带 libmp3lame 的 FFmpeg（均加入 PATH）：

```sh
python3 install-release.py --tag v1.7.3 --with-source --root ChinaTextbookStudyFree
cd ChinaTextbookStudyFree
npm ci
npm run build
python3 -m http.server 8080 --directory apps/web/out
```

`web-source.zip` 同时提供匹配源码，可单独解压到新目录；ZIP 内直接是仓库文件，没有额外顶层目录。源码构建复用包内音频和已校验的转换缓存，不调用在线 TTS。构建会再次检查音频；缓存不匹配时重新转换，而不是信任旧音频。生成数据会应用已验证的版本化音频地址，避免浏览器复用旧 GPT 语音。

## 离线安装与完整校验

在[下载导航](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/releases/v1.7.3-downloads.md)选择“现成静态网站”或“源码与完整资源”，只下载该模式列出的包至同一目录，另下载安装器、`manifest.json` 与 `files.jsonl`。Web 安装不需要 116 个 iOS 逐册包。

```sh
python3 install-release.py --tag v1.7.3 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads
python3 install-release.py --tag v1.7.3 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads --verify-only
```

源码目录校验使用 `--root /path/to/source`，省略 `--mode static`；如果安装过完整源码，同时加上 `--with-source`。

macOS/Linux 可额外验证所有下载附件：

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

`SHA256SUMS` 覆盖所有平台，`--ignore-missing` 只核验已下载文件；所选模式应有的包是否完整由安装器检查。`--verify-only` 只检查，不修改文件。任意分包缺失、校验和不符、归档内容不符、安装路径被符号链接指向外部时，安装器明确失败，不会跳过问题继续宣告成功。

## 附件对应关系

| 附件 | 内容与用途 |
| --- | --- |
| `audio-original-partNN.zip` | 原音频路径的兼容资源；每个 ZIP 含 `audio/` 顶层目录。历史 `.opus` 扩展名下可能是 Ogg/Opus 或 MP3，以实际内容为准 |
| `audio-web-partNN.zip` | 浏览器 MP3，包括本轮新音频和用于刷新缓存的版本化文件名 |
| `data.zip` | 当前线上配套 JSON；手动解压到站点 `data/` |
| `web-app.zip` | 当前线上页面、界面资源和服务工作线程；手动解压到站点根目录 |
| `story-images.zip` / `textbook-pages.zip` | 手动解压到站点同名目录 |
| `data-source.zip` | 课文和故事源 JSON；源码安装使用 |
| `web-audio-cache.zip` | 可携带到新目录的已验证转换缓存；源码安装使用 |
| `web-source.zip` | 对应本版的源码、构建输入、README、安装器及脚本 |
| `manifest.json` | 附件大小、SHA-256、安装位置、实际材料规模和源码提交 |
| `files.jsonl` | 每个归档成员的路径、大小、SHA-256，供安装与审计 |
| `SHA256SUMS` | 所有发布附件的校验和 |
| `VALIDATION.json` | 本轮全新安装、旧版升级、构建与播放验证结果 |

手动安装静态站点时，将全部音频 ZIP 解压到站点根目录，再按表中位置解压数据、页面和图片。安装器可以自动完成这些步骤及全部校验。

本包保留 14 册旧版教材路由以兼容既有进度：总计 58 册版本，当前展示 44 册。包含 2,863 个常规课时、385 个单元挑战，常规题 18,159 道、挑战题 4,875 道。另提供全部 58 册的 iOS AAC/M4A 数据及音频包，配套 `ios-manifest.json`；每本只需下载对应两包。旧版下载地址和学习记录继续保留。

## 题库保留与升级验收

本版恢复原补齐版 2,356 课、15,117 题，保留新增 2026 秋版数学、视觉数感示范和多孩子档案。原数感题移至三节巩固练习，旧错题仍能复习。当前合计 2,863 节常规课、18,159 题；每课有讲解且至少六题。此前 v1.7.0 已修正六下鸽巢问题的两条损坏讲解公式，题目、答案与 ID 不变；基线保存精确的前后指纹及原因。另修正两道旧数学题的“积/商”术语与验算文字，题号和标准答案不变。

安装完整源码并构建后可运行以下只读检查；静态网站把 `--public` 改成站点根目录，同时提供材料包中的基线文件路径：

```sh
python3 scripts/checks/content-retention.py --public apps/web/out
```

检查逐课比对已发布题库的课程 ID、题目 ID、内容指纹与讲解，不以总题数增加代替原题保留。构建、打包和部署都会运行该检查。教师签审仍待完成。Docker 全新部署和原项目升级命令见 [Docker 说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/docker.md)。

## 修订版的成绩兼容

旧版仍可从教材切换菜单进入，已选旧版时重新打开首页也保留该选择。新版课时、宝箱和朗读使用独立 ID，原成绩不会算入新版，也不会被清除。Web 更新只轮换页面及教材缓存，不访问或清空 localStorage/IndexedDB。

本轮另明确修正四节旧课中的题干、解析或损坏公式。如果恰好留有这些课的未完成会话，内容核对会提示一次性重开当前课；已入账奖励和已完成成绩保留。修订清单见 `docs/restored-content-fixes.json`，不会以音频地址变化为由重开课程。

材料与验证范围见[新版数学核对](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/issue-14-textbook-review-2026-10-25.md)及[发布验收报告](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/issue-14-release-2026-10-25.md)。
