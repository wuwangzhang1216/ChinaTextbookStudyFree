# v1.8.1：续学计时修复、安装与升级

本版修复课程跨夜续学的结算计时；后台、离页和休息弹窗暂停，刷新保留前台时间、答案和反馈。旧进度没有可靠时长时从本次续学起计，原成绩保留。教材、音频及iOS逐册包与v1.8.0相同。

v1.8.0已新增青岛版数学、科学各10册（小学1—5年级上下册），鲁科版英语6册（3—5年级上下册）。每册按核对后的原书目录编排，独立教材ID与六三制并列，不替换原58册教材或成绩。新增1,585个常规课时、244个单元挑战、375组英语听读，新增语音使用Edge，iOS按册提供AAC/M4A。原书版次为2010—2022年间，并非“2026最新版”；版次、印次、ISBN、来源指纹与目录见[逐册核对报告](five-four-2026-10-27/README.md)。资源包含完整84册，无需先安装旧版，无需AI API Key。

**不用下载 Assets 中的全部附件。** 在线学习直接[打开课堂](https://d3nmsqi4n72idj.cloudfront.net/)；Web 用户使用安装器自动选择资源；iOS 用户在 App 内按册下载。手动离线下载的分类清单及逐册链接见[下载导航](https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.1/DOWNLOADS.md)。主发布页仅保留入口和校验文件；新Web与源码ZIP位于 `v1.8.1-web-resources`；未变更的大型资源继续位于 `v1.8.0-web-resources`，iOS逐册包继续位于 `v1.8.0-ios-resources`。清单为复用附件注明原发布标签、大小及SHA-256，安装器自动选择，不重复上传191个未变更ZIP。Web 音频分为独立 ZIP，每个不超过 1.4 GB（十进制），按安装模式下载对应分包后直接解压，无需拼接。

## 最快使用：安装现成网站

只需 Python 3.9+，无需 Node.js 或 FFmpeg。在 [Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.8.1) 下载 `install-release.py`，执行：

```sh
python3 install-release.py --tag v1.8.1 --mode static --root ChinaStudyFree-site
python3 -m http.server 8080 --directory ChinaStudyFree-site
```

打开 http://localhost:8080/。Windows 将 `python3` 换成 `py -3`。这是 HTTP 本地预览；正式托管时使用支持 MP3 和 HTTP Range 的静态服务器（例如 Nginx 或对象存储/CDN），跟读录音需要 HTTPS 或 localhost。

安装器会下载、验证完整附件的 SHA-256，再在临时目录解压并逐文件核验后安装。资源较大，请为下载、安装前的暂存、现有站点和备份预留充足空间，建议至少80 GB（已有多份备份时另加备份所需空间）。安装期间保持现有服务停止，安装完成后再启动。

## 已有旧版：原目录升级

先备份自定义文件或数据，并从新版 Release 下载新版安装器。不要用旧安装器安装新版分包。

```sh
python3 install-release.py --tag v1.8.1 --mode static --root /path/to/existing-site
```

此命令覆盖已有页面、配套数据、音频和缓存文件，包括旧 GPT 音频的同名兼容文件；不会因音频目录已存在而跳过更新。未包含在材料包中的自定义文件会保留，旧版遗留文件也不会自动删除。浏览器学习记录保存在原来的浏览器存储中；继续使用相同域名、协议和端口可以保留该存储。

如果是源码部署，先备份本地代码修改；希望安装本版匹配源码与所有资源时执行：

```sh
python3 install-release.py --tag v1.8.1 --with-source --root /path/to/ChinaTextbookStudyFree
cd /path/to/ChinaTextbookStudyFree
npm ci
npm run build
```

`--with-source` 会更新材料包中的源码文件。只更新已检出配套版本的资源时，省略这个参数。重新部署 `apps/web/out/`，刷新原站点 CDN 缓存，并重新打开页面，使新服务工作线程和音频版本地址生效。

## 全新源码安装

需要 Node.js 20+、Python 3.9+、带 libmp3lame 的 FFmpeg（均加入 PATH）：

```sh
python3 install-release.py --tag v1.8.1 --with-source --root ChinaTextbookStudyFree
cd ChinaTextbookStudyFree
npm ci
npm run build
python3 -m http.server 8080 --directory apps/web/out
```

`web-source.zip` 同时提供匹配源码，可单独解压到新目录；ZIP 内直接是仓库文件，没有额外顶层目录。源码构建复用包内音频和已校验的转换缓存，不调用在线 TTS。构建会再次检查音频；缓存不匹配时重新转换，而不是信任旧音频。生成数据会应用已验证的版本化音频地址，避免浏览器复用旧 GPT 语音。

## 离线安装与完整校验

在[下载导航](https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.1/DOWNLOADS.md)选择“现成静态网站”或“源码与完整资源”，只下载该模式列出的包至同一目录，另下载安装器、`manifest.json` 与 `files.jsonl`。Web 安装不需要 168个iOS逐册包。

```sh
python3 install-release.py --tag v1.8.1 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads
python3 install-release.py --tag v1.8.1 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads --verify-only
```

源码目录校验使用 `--root /path/to/source`，省略 `--mode static`；如果安装过完整源码，同时加上 `--with-source`。

macOS/Linux 可额外验证所有下载附件：

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

每个发布页的 `SHA256SUMS` 覆盖该页附件，完整跨版本资源的大小和SHA-256由新版 `manifest.json` 记录并由安装器验证；`--ignore-missing` 只核验已下载文件；所选模式应有的包是否完整由安装器检查。`--verify-only` 只检查，不修改文件。任意分包缺失、校验和不符、归档内容不符、安装路径被符号链接指向外部时，安装器明确失败，不会跳过问题继续宣告成功。

## 附件对应关系

| 附件 | 内容与用途 |
| --- | --- |
| `audio-original-partNN.zip` | 原音频路径的兼容资源；每个 ZIP 含 `audio/` 顶层目录。历史 `.opus` 扩展名下可能是 Ogg/Opus 或 MP3，以实际内容为准 |
| `audio-web-partNN.zip` | 浏览器 MP3与版本化文件名；本版逐字节复用v1.8.0音频 |
| `data.zip` | 当前线上配套 JSON；手动解压到站点 `data/` |
| `web-app.zip` | 当前线上页面、界面资源和服务工作线程；手动解压到站点根目录 |
| `story-images.zip` / `textbook-pages.zip` | 手动解压到站点同名目录 |
| `data-source.zip` | 课文和故事源 JSON；源码安装使用 |
| `web-audio-cache.zip` | 可携带到新目录的已验证转换缓存；源码安装使用 |
| `web-source.zip` | 对应本版的源码、构建输入、README、安装器及脚本 |
| `manifest.json` | 附件大小、SHA-256、安装位置、实际材料规模和源码提交 |
| `files.jsonl` | 每个归档成员的路径、大小、SHA-256，供安装与审计 |
| `SHA256SUMS` | 所在发布页附件的校验和；完整资源使用manifest与安装器验证 |
| `VALIDATION.json` | 本版验证范围与结果；人工和未验证项目单独标明 |

手动安装静态站点时，将全部音频 ZIP 解压到站点根目录，再按表中位置解压数据、页面和图片。安装器可以自动完成这些步骤及全部校验。

本包保留14册历史教材路由：总计84册版本，当前展示70册，其中原有六三制58册、独立五四制26册。包含4,448个常规课时、629个单元挑战，常规题27,669道、挑战题6,339道，另有1,311篇/组课文和284篇故事。全部84册均提供iOS数据及AAC/M4A音频包，每本只需下载对应两包。原发布页、旧版下载地址和学习记录保留。

## 题库保留与升级验收

本次对原有教材和内容做逐文件、逐册元数据比对；五四制的课时、题目、单元挑战、宝箱和听读均使用独立ID。每个来源单元先核对范围，再生成配套内容并进行模型审校与实际判分检查；这不代表已完成教师逐题签审。历史v1.7.3及以前的教材、拼音修复、首课互动和未完成会话恢复逻辑继续保留。

安装完整源码并构建后可运行以下只读检查；静态网站把 `--public` 改成站点根目录，同时提供材料包中的基线文件路径：

```sh
python3 scripts/checks/content-retention.py --public apps/web/out
```

检查逐课比对已发布题库的课程 ID、题目 ID、内容指纹与讲解，不以总题数增加代替原题保留。构建、打包和部署都会运行该检查。教师签审仍待完成。Docker 全新部署和原项目升级命令见 [Docker 说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/docker.md)。

## 新旧教材的成绩兼容

旧版仍可从教材切换菜单进入，已选旧版时重新打开首页也保留该选择。新版课时、宝箱和朗读使用独立 ID，原成绩不会算入新版，也不会被清除。Web 更新只轮换页面及教材缓存，不访问或清空 localStorage/IndexedDB。

本次不改写原教材题库或既有成绩；选择五四制教材后从独立路径开始学习。首次选书可切换“五四制/六三制”，六年级只提供六三制。原版教材仍可通过教材切换菜单进入。

来源与验证范围见[五四制核对报告](five-four-2026-10-27/README.md)。#12中需要教师、儿童、真机和隔日学习效果配合的事项继续单独跟进。
