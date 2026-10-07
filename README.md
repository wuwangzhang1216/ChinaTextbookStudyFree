# ChinaStudyFree · 小学全科 AI 学习平台

**在线体验：[聪聪学堂](https://d3nmsqi4n72idj.cloudfront.net/)** · 支持电脑和手机浏览器，无需安装。

> **UX修复进展（2026-10-06）**：[PR #13](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/pull/13) 已提供续学恢复、儿童点数、一页结算、布局与题库修正，本地题目增加到6842道。尚未合并或生产部署；本分支启动需按 [补充资源安装](docs/ux-content-install.md) 安装新音频。验收与剩余项见 [UX修复状态](docs/ux-repair-status.md) 和 [issue #12](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/issues/12)。
>
> **版本说明（2026-10-05）**：当前线上 Web 已部署 [`main`](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/tree/main) 的判分与音频兼容更新，并保留首次听完讲解才解锁的边框光环体验。下文本地启动步骤使用 `main`。
>
> **完整资源包：[v1.2.0-assets](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.2.0-assets)**。包含新版 188 篇语文阅读、936 道配套题及既有四科资源；无需先安装旧版本。Release 中的 `web-source.zip` 是资源包发布时的源码快照，早于当前线上语音兼容和界面修复。详见 [安装与升级说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/release-install.md)。

> **一个免费、开源、纯公益的小学全科学习平台**
>
> 我们相信：**每一个中国孩子，无论身处北上广深，还是大山深处的乡村小学，都应该拥有一样好的学习资源。**
>
> 让孩子在玩中学，让 AI 方便你我他。 ❤️

---

## 🌱 项目愿景

中国的教育资源分布不均是一个长期存在的问题。一线城市的孩子可以购买数百元一套的教辅、上价格高昂的补习班；而偏远地区的孩子，往往连一本配套练习册都难以获得。

**ChinaStudyFree** 希望借助 AI 的力量，改变这件事：

- 📚 **覆盖小学全科**：语文、数学、英语、科学
- 🆓 **免费使用**：不卖课、不做广告；Web 学习记录保存在当前浏览器
- 🤖 **AI 生成题目**：基于教材知识体系生成单元小测与知识讲解，持续接受教师复核
- 🔊 **全站语音**：题目、选项、知识讲解均配有 TTS 语音朗读
- 📖 **课文听读**：语文/英语课文逐句跟读，配合课本原页展示
- 📚 **课外故事**：AI 生成 284 篇分级读物 + 阅读理解题 + 配图，巩固课内知识
- 🎮 **在玩中学**：题目形式生动、即时反馈，让孩子在闯关和互动中建立对知识的兴趣
- 🌏 **服务每一个孩子**：从一年级到六年级，只要有一台能上网的设备，就能用

---

## 📸 功能预览

### Web 端

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/screen-0.png" width="200" /><br/><b>年级选择</b></td>
    <td align="center"><img src="docs/screenshots/screen-1.png" width="400" /><br/><b>学科总览</b></td>
    <td align="center"><img src="docs/screenshots/screen-3.png" width="400" /><br/><b>学习路径</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/screen-2.png" width="200" /><br/><b>单元答题</b></td>
    <td align="center"><img src="docs/screenshots/screen-6.png" width="400" /><br/><b>课文听读</b></td>
    <td align="center"><img src="docs/screenshots/screen-7.png" width="400" /><br/><b>课外故事</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/screen-4.png" width="400" /><br/><b>错题回顾</b></td>
    <td align="center"><img src="docs/screenshots/screen-5.png" width="400" /><br/><b>个人中心</b></td>
    <td></td>
  </tr>
</table>

### iOS 端

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/ios/home.jpg" width="180" /><br/><b>学习路径</b></td>
    <td align="center"><img src="docs/screenshots/ios/feedback.jpg" width="180" /><br/><b>答题反馈</b></td>
    <td align="center"><img src="docs/screenshots/ios/shop.jpg" width="180" /><br/><b>商店</b></td>
    <td align="center"><img src="docs/screenshots/ios/profile.jpg" width="180" /><br/><b>我的</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/ios/reader.jpg" width="180" /><br/><b>课文听读</b></td>
    <td align="center"><img src="docs/screenshots/ios/review.jpg" width="180" /><br/><b>错题本</b></td>
    <td align="center"><img src="docs/screenshots/ios/profile-quests.jpg" width="180" /><br/><b>每日任务 · 周报</b></td>
    <td align="center"><img src="docs/screenshots/ios/dark.jpg" width="180" /><br/><b>深色模式</b></td>
  </tr>
</table>

> 全部 12 张界面截图与说明见 [`docs/ios-ux-gallery.html`](docs/ios-ux-gallery.html)（本地打开即可，支持点击放大）。

---

## ✨ 主要特性

| 功能 | 说明 |
|------|------|
| **单元小测** | 跟着课本章节走，学完一课就能练 |
| **知识讲解** | 已有资料支持概念、公式和易错点讲解；部分课程仍需补齐 |
| **课文听读** | 语文/英语课文逐句朗读，支持跟读练习，展示课本原页 |
| **跟读录音** | 浏览器内录音与回放，不上传录音；需要 HTTPS 和麦克风授权，暂无语音识别评分 |
| **课外故事** | 每单元 2 篇 AI 分级故事 + 阅读理解题 + 儿童插画配图 |
| **全站 TTS** | 题目、选项、讲解、故事文本均可朗读；Web 使用 65,694 个兼容 MP3 音频，保留原 Opus 资源 |
| **首次讲解** | 进入课程自动尝试播放，听完才解锁下一步；按钮边框光环跟随真实播放进度，不显示秒数 |
| **学习进度** | 当前浏览器保存完成情况、正确率与阅读星级；暂无云端账号和跨设备同步 |
| **连击系统** | 连续答对触发连击动画与语音激励 |
| **错题与学习报告** | 错题复习、每日目标、本周报告与家长每日学习时间限制 |

浏览器可能限制首次自动播放；可点标题旁的小喇叭恢复播放。静音或播放失败时提供“阅读后继续”。清除浏览器数据会影响本地学习记录。

**覆盖学科与版本：**

| 学科 | 版本 | 年级 | 课外故事 |
|------|------|------|----------|
| 数学 | 人教版 | 一至六年级 | — |
| 语文 | 统编版 | 一至六年级 | 188 篇 |
| 英语 | 人教版 PEP | 三至六年级 | 96 篇 |
| 科学 | 教科版 | 一至六年级 | — |

**当前资源规模**：44 册教材、2,166 个课节、6,545 道单元练习、779 篇课文、284 篇故事和 1,226 道故事阅读题（语文 936 道、英语 290 道）。这是资源覆盖统计，不代表所有题目已通过教师逐题审核。

---

## 🚀 快速开始

**Docker 家庭部署**：包含 Dockerfile 的当前代码版本支持 `docker compose up -d --build`，会自动下载完整资源并构建，无需自行安装 Node.js、Python 或 FFmpeg；见 [Docker 安装说明](docs/docker.md)。本节以下命令用于启动当前 `main` 版本。

**安卓自行安装**：用 Android Studio 打开 `apps/android`，或从 GitHub Actions 下载构建成功的调试 APK。当前是加载 HTTPS 课堂的在线客户端；构建步骤、录音权限和已知限制见 [安卓工程说明](docs/android.md)。

### 1. 克隆仓库

以下步骤启动当前线上版本。需要 Node.js 20+、Python 3.9+，以及带 `libmp3lame` 的 FFmpeg；请将 Python 和 FFmpeg 加入系统 PATH。

```bash
git clone --branch main https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree
```

### 2. 下载资源文件

音频、配图、课本原页和题库数据体积较大，通过 GitHub Release 分发，不包含在 Git 仓库中。

```bash
# macOS / Linux：在仓库根目录执行
python3 scripts/install-release.py --tag v1.2.0-assets

# Windows PowerShell
py -3 scripts/install-release.py --tag v1.2.0-assets
```

安装器下载并校验以下 5 个包的 SHA-256，再解压到对应目录；升级时会更新已有文件。下载总量约 2.06 GB，解压、依赖和 Web MP3 转码还需要额外磁盘空间。已有自定义数据时，请先备份；旧版 `download-assets.sh` / `.ps1` 会跳过已存在的目录，不适合资源升级。

| 文件 | 内容 | 大小 | 解压到 |
|------|------|------|--------|
| `audio.tar.gz` | 81,017 个原音频文件，以 Opus 为主 | 1.29 GB | `apps/web/public/audio/` |
| `story-images.zip` | 472 张图，含 284 张原图与 188 张新版图 | 550.7 MB | `apps/web/public/story-images/` |
| `textbook-pages.zip` | 1,562 张课本页图 + 20 个页码映射 JSON | 211.6 MB | `apps/web/public/textbook-pages/` |
| `data.zip` | 前端构建数据 (JSON) | 4.9 MB | `apps/web/public/data/` |
| `data-source.zip` | passages + stories 源 JSON | 833 KB | `data/` |

以上为 Release 压缩包大小，按十进制计。`manifest.json` 和 `SHA256SUMS` 提供精确大小及校验值。另附 `web-source.zip`（约 2.1 MB），供复现资源发布时的历史 Web 版本。

### 3. 运行 Web 端

在仓库根目录执行：

```bash
npm ci
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 即可。首次启动会构建数据，并从 Release 的原音频生成 65,694 个 Web 兼容 MP3；这一步可能较慢，后续启动复用校验缓存，无需调用付费语音模型。Release 中尚未单独提供这些 Web MP3。

生产构建执行 `npm run build`，静态站点输出到 `apps/web/out/`；部署静态文件即可，不需要 Node.js 业务后端。类型检查使用 `npm run type-check`。

### 电脑、手机与部署

电脑使用侧栏和宽屏阅读布局，手机使用底部导航和单列阅读。此前线上版本已检查 23 类页面 × 7 种尺寸（320×568 至 1920×1080），并测试完整答题、阅读、刷新恢复、错题、商店和家长时间限制。2026-10-05 的 `main` 更新另通过 45 项线上 HTTP 检查、完整文件与媒体引用核对，并验证 320、390 和 1440 像素宽度的课程讲解播放与边框进度。手机尺寸模拟不等于真机验收：真实 iPhone/Android、抖音内置浏览器的播放和麦克风权限仍需复核。详见 [Web 深测报告](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/web-deep-qa-2026-10-03.md)。

线上使用东京区域的私有 S3 + CloudFront HTTPS，使用 AWS 提供的链接；没有 EC2/Lightsail、数据库或业务后端。按存储、请求和流量计费，没有 $7.50/月的服务器固定费用。部署步骤见 [AWS Web 部署说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/aws-web-deployment.md)。

### 4. 运行 iOS 端

需要 macOS + Xcode 16+ + [XcodeGen](https://github.com/yonaskolb/XcodeGen)：

```bash
brew install xcodegen      # 首次安装
cd apps/mobile
xcodegen generate          # 生成 .xcodeproj
open ChinaTextbookStudy.xcodeproj
```

在 Xcode 里选 iPhone / iPad 模拟器，Cmd+R 即可运行。App 内置一本数学书（一年级上册 + 第一节课的 TTS 音频）作为离线种子，无需网络就能体验完整流程。

**iOS 端特点：**

- SwiftUI 原生（非 React Native），支持 iPhone + iPad（iPad 自动分栏布局）
- 域逻辑（SRS / 判分 / 成就 / 宝箱 / 吉祥物）从 `packages/core` 逐文件对译为 Swift
- 音频：Opus 预转码为 AAC m4a，`AVAudioPlayer` 播放，无第三方解码依赖
- 数据按书从 GitHub Release 按需下载，无需首启下载全部教材
- 包含单元测试与 UI 测试（答题闭环、退出确认、标签导航、装扮购买、每日任务）

**统一设计系统（`DesignSystem/`）**

全端共用一套令牌，没有任何页面掉回原生系统控件：

| 令牌 | 内容 |
|------|------|
| `DuoColors` | 品牌色 + 语义色（`bg` / `surface` / `border` / `ink`…），**浅色为主、深色为可选**，同一份代码自动适配 |
| `DuoFont` | 圆体字号角色（display / title / heading / body / caption…），根部统一 `.fontDesign(.rounded)` |
| `DuoLayout` | `Space` / `Radius` / `Motion` 三组令牌，全局共用一套动效曲线 |
| `DuoButtonStyle`·`DuoCardStyle` | 标志性的立体「下沿」按压质感 |

**学习体验**

- 路径即首页：当前节点呼吸动效 + 真实单元进度环，点击弹出开始气泡
- 答错回炉重练：进度条只在答对时前进，且必定走满；错题自动进入 SRS 错题本
- 爱心耗尽拦截、退出二次确认、答错震屏与抖卡、每次点选都有触感与音效
- 结算页连胜与每日达标庆祝；错题复习不扣爱心且奖励经验值
- 课文/故事支持「朗读全文」逐句高亮跟随，读完奖励经验值
- 吉祥物「聪聪」（熊猫）以 SwiftUI Canvas 绘制，含呼吸、眨眼与情绪反应

**装扮系统（earn → spend → express 闭环）**
- 用学习赚来的宝石购买皮肤 / 主题 / 课程背景，购买即装备
- **皮肤**：11 款配饰（学士帽、圆框眼镜、皇冠、法师帽、宇航员头盔、DJ 耳机…）直接画在聪聪身上，全局生效
- **主题**：10 套配色通过 `DuoColors.themeOverride` 重绘全局品牌色；深色系主题（暗夜模式 / 曜石黑）自动切换深色外观
- **课程背景**：8 款渐变作用于答题页，按对比度需要自动降低强度，保证题目始终可读
- 商店里的每个格子都是**实时预览**：皮肤格是戴着该配饰的聪聪本人，主题格是该主题的真实配色

**留存机制**

- **每日任务**：每天 3 个不同类型的任务（赚经验 / 完成小课 / 复习错题 / 读课文），
  由日期做种子确定性生成——同一天任何时候打开都是同一组，且不需要服务端；
  完成后可领取宝石奖励
- **本周报告**：近 7 天经验值柱状图 + 与上周的增减对比，作为离线版的「和自己比」
- **连胜提醒**：可选的本地通知，每晚 20:00 提醒保住连胜；当天已学习则自动顺延到
  次日，绝不打扰。默认关闭，在设置里开启时才申请系统授权

更多上架相关细节见 [`apps/mobile/APPSTORE.md`](apps/mobile/APPSTORE.md)。

### 5. （可选）运行数据生成 Pipeline

语文课外阅读的课文难度校准、题库审计，以及 GPT-6 Luna / Muse / Gemini TTS
修订流程见 [内容质量审计与升级说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/content-quality-review.md)。
新版流程先生成各年级样例，审核、配图和配音完成后再替换，并保留原数据备份。

如需从教材 PDF 重新生成题库数据：

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置 .env（填入 API Key）

# 生成题库
python scripts/quiz/pipeline.py --subject all

# 生成课外故事
python scripts/stories/pipeline.py --subject all

# 生成故事配图
python scripts/stories/images.py --subject all

# 生成 TTS 音频
python scripts/tts/collect_texts.py
python scripts/tts/api_tts.py

# 构建前端数据
npm run build:data --workspace=china-study-free
```

---

## 🏗️ 项目结构

```
ChinaStudyFree/
│
├── scripts/
│   ├── quiz/                       # 题库生成 Pipeline
│   │   ├── pipeline.py             #   PDF → 大纲 → 题库
│   │   ├── prompts.py              #   AI Prompt 模板（按学科定制）
│   │   └── subjects.py             #   学科 / 版本 / 年级配置
│   ├── stories/                    # 课外故事生成 Pipeline
│   │   ├── pipeline.py             #   大纲 → 分级故事 + 阅读理解题
│   │   ├── prompts_story.py        #   故事 Prompt 模板 + JSON Schema
│   │   └── images.py               #   Gemini AI 配图生成
│   ├── passages/                   # 课文抽取
│   │   ├── extract_passages.py     #   PDF → 逐句课文 JSON
│   │   └── render_pages.py         #   PDF → 课本原页 JPG
│   ├── tts/                        # TTS 语音合成
│   │   ├── collect_texts.py        #   扫描全部文本，生成待合成清单
│   │   └── api_tts.py              #   DashScope API 批量合成
│   ├── install-release.py          # 校验并安装/升级 Release 资源（线上版本分支）
│   ├── download-assets.sh          # 旧版资源下载器（Linux/macOS）
│   ├── download-assets.ps1         # 旧版资源下载器（Windows）
│   └── package-release.sh          # 打包资源为 Release 附件
│
├── output/                         # Pipeline 产出（大纲 + 题库 JSON）
│   ├── math/chinese/english/science/
│   │   ├── outlines/               #   教材知识大纲
│   │   └── quizzes/                #   单元题库
│
├── data/                           # 源数据（通过 Release 下载）
│   ├── passages/                   #   课文听读源 JSON（语文/英语）
│   └── stories/                    #   课外故事源 JSON（语文/英语）
│
├── packages/core/                  # TypeScript 共享域逻辑（Web 端运行时 + iOS 翻译蓝本）
│
└── apps/
    ├── mobile/                         # iOS SwiftUI 端（iPhone + iPad）
    │   ├── project.yml                 #   XcodeGen 项目定义
    │   ├── ChinaTextbookStudy/
    │   │   ├── App/                    #   SwiftUI @main + NavigationStack/SplitView + 路由
    │   │   ├── DesignSystem/           #   DuoColors / DuoFont / DuoLayout / Button / Card / Effects
    │   │   ├── Models/                 #   CoreTypes.swift（对译 packages/core/types.ts）
    │   │   ├── Domain/                 #   SRS / Grade / Achievements / Chest / Cosmetics / MascotTriggers
    │   │   ├── Services/               #   DataLoader / AssetDownloader / AudioPlayer / Haptic / SFX
    │   │   ├── Stores/                 #   ProgressStore / SettingsStore（持久化）
    │   │   ├── Features/               #   Onboarding / Home / Lesson / Review / Reading /
    │   │   │                           #   Stories / Shop / Profile / Settings / Achievements
    │   │   └── Components/             #   PathMapView / MascotView / BottomTabBar / 反馈与庆祝件
    │   ├── ChinaTextbookStudyTests/    #   单元测试（域逻辑 + 每日任务）
    │   └── ChinaTextbookStudyUITests/  #   UI 测试（答题闭环 / 导航 / 装扮 / 任务）
    │
    └── web/                            # Next.js 前端（原 frontend/）
        ├── scripts/
        │   └── build-data.ts           #   output/ + data/ → public/data/ 构建
        ├── src/
        │   ├── app/                    # 路由与页面
        │   │   ├── book/               #   教材详情 / 学习路径
        │   │   ├── reading/            #   课文听读
        │   │   ├── stories/            #   课外故事阅读 + 答题
        │   │   ├── lesson/             #   答题页面
        │   │   ├── grade/              #   年级总览
        │   │   ├── profile/            #   学习档案
        │   │   ├── review/             #   错题回顾
        │   │   └── shop/               #   商店 / 奖励
        │   ├── components/             # UI 组件
        │   ├── lib/                    # 工具库（TTS、音效、状态）
        │   ├── store/                  # Zustand 状态管理
        │   └── types/                  # TypeScript 类型定义
        └── public/
            ├── audio/                  # TTS 音频（通过 Release 下载）
            ├── data/                   # 题库+故事 JSON（通过 Release 下载）
            ├── story-images/           # AI 故事配图（通过 Release 下载）
            └── textbook-pages/         # 课本原页图片（通过 Release 下载）
```

---

## 📖 教材来源与版权

本项目引用的教材结构来自开源项目 [TapXWorld/ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook)。

**内容说明**：

1. 资源包包含教材知识大纲、课文文本及课本原页；教材文本与图片的版权属于各自权利人
2. 单元练习和课外故事由 AI 生成并持续修订，生成内容仍需教师审核
3. 项目的 MIT 代码许可不代表授予第三方教材内容的使用权
4. 如相关版权方认为本项目存在任何问题，请与我们联系，我们会第一时间响应处理

---

## 🤝 如何参与

这是一个**纯公益项目**，我们非常欢迎任何形式的参与：

- 👩‍🏫 **一线老师**：帮我们审核题目质量、指出错误、建议题型
- 👨‍👩‍👧 **家长**：把平台分享给需要的家庭，反馈孩子的使用体验
- 💻 **开发者**：提交 PR 修 bug、加功能、优化 UI
- 🎨 **设计师**：帮我们让界面对孩子更友好、更有趣
- 📣 **任何人**：把这个项目告诉一所乡村小学的老师

---

## 🛣️ 路线图

- [x] 数学、语文、英语、科学 Pipeline
- [x] Web 前端（单元小测 / 知识讲解 / 学习路径）
- [x] Web 兼容 MP3 朗读与浏览器跟读录音回放
- [x] PC / mobile 布局深测与东京 S3 + CloudFront 部署
- [x] 课文听读（语文 / 英语，779 篇）
- [x] 课外故事阅读（语文 188 篇 + 英语 96 篇，含 AI 配图）
- [x] iOS 端（SwiftUI，iPhone + iPad）
- [x] iOS 统一设计系统与游戏化学习体验（浅色为主 + 可选深色）
- [x] 装扮系统闭环（皮肤 / 主题 / 课程背景购买后全局生效）
- [x] 留存机制（每日任务 / 本周报告 / 连胜提醒推送）
- [ ] 道德与法治内容
- [x] 语文扩展阅读升级与题库质量审计
- [ ] 持续教师复核、补齐知识讲解与题量：审计发现 1,498 课缺讲解、1,183 课仅 1 题，见 [待修记录](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/content-review-followups.md)
- [ ] 离线版 / 校园内网部署包
- [ ] 云端学习记录与跨设备同步
- [ ] 老师端与班级学习报告
- [ ] 多端 App

---

## 📜 许可协议

本项目采用 **MIT License** 开源发布，详见 [LICENSE](LICENSE)。

---

## 💌 写在最后

> 我们不知道这个项目能走多远，
> 但我们知道，只要多一个孩子因为它而多做对一道题、
> 多理解一个知识点、多喜欢上一门课，
> 这件事就是值得的。

如果你认同我们的理念，欢迎 ⭐ Star 支持，也欢迎把它转发给任何一位你认识的老师和家长。

**让每一个中国孩子，都能在玩中学。**
