# ChinaStudyFree · 小学全科 AI 学习平台

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
- 🆓 **永久免费**：不收费、不卖课、不做广告、不收集隐私
- 🤖 **AI 原创题目**：基于人教版/统编版教材知识体系，由 AI 生成单元小测与知识点全解
- 🔊 **全站语音**：题目、选项、知识讲解均配有 TTS 语音朗读
- 📖 **课文听读**：语文/英语课文逐句跟读，配合课本原页展示
- 🎮 **在玩中学**：题目形式生动、即时反馈，让孩子在闯关和互动中建立对知识的兴趣
- 🌏 **服务每一个孩子**：从一年级到六年级，只要有一台能上网的设备，就能用

---

## ✨ 主要特性

| 功能 | 说明 |
|------|------|
| **单元小测** | 跟着课本章节走，学完一课就能练 |
| **知识点全解** | 每个知识点配有清晰讲解、核心概念、公式与易错点 |
| **课文听读** | 语文/英语课文逐句朗读，支持跟读练习，展示课本原页 |
| **全站 TTS** | 题目、选项、讲解文本均可点击朗读（Opus 格式，66000+ 音频） |
| **学习进度** | 自动保存每课完成情况与正确率 |
| **连击系统** | 连续答对触发连击动画与语音激励 |

**覆盖学科与版本：**

| 学科 | 版本 | 年级 |
|------|------|------|
| 数学 | 人教版 | 一至六年级 |
| 语文 | 统编版 | 一至六年级 |
| 英语 | 人教版 PEP | 三至六年级 |
| 科学 | 教科版 | 一至六年级 |

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree
```

### 2. 下载资源文件

音频和题库数据体积较大，通过 GitHub Release 分发，不包含在 Git 仓库中。

```bash
# Linux / macOS / Git Bash (Windows)
bash scripts/download-assets.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts\download-assets.ps1
```

这会自动下载并解压以下文件到 `frontend/public/`：
- `audio.tar.gz` — 66,231 个 Opus 格式 TTS 音频（~711 MB）
- `textbook-pages.tar.gz` — 1,577 张课本原页图片（~192 MB）
- `data.tar.gz` — 题库 JSON 数据（~2.3 MB）

### 3. 运行前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000 即可。

### 4. （可选）运行数据生成 Pipeline

如需从教材 PDF 重新生成题库数据：

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置 .env（填入 API Key）
python pipeline.py
```

---

## 🏗️ 项目结构

```
ChinaStudyFree/
│
├── pipeline.py                  # 数据生成 Pipeline（PDF → 大纲 → 题库）
├── prompts.py                   # AI Prompt 模板（按学科定制）
├── subjects.py                  # 学科 / 版本 / 年级配置
│
├── output/                      # Pipeline 产出（大纲 + 题库 JSON）
│   ├── math/
│   │   ├── outlines/            #   教材知识大纲
│   │   └── quizzes/             #   单元题库
│   ├── chinese/
│   ├── english/
│   └── science/
│
├── data/
│   └── passages/                # 课文听读源数据（语文 / 英语）
│       ├── chinese/
│       └── english/
│
├── scripts/
│   ├── download-assets.sh       # 下载 Release 资源（Linux/macOS）
│   ├── download-assets.ps1      # 下载 Release 资源（Windows）
│   ├── package-release.sh       # 打包资源为 Release 附件
│   ├── cleanup_quizzes.py       # 题库数据清理
│   ├── passages/                # 课文抽取脚本
│   │   ├── extract_passages.py
│   │   └── render_pages.py
│   └── tts/                     # TTS 语音合成脚本
│       ├── collect_texts.py     #   扫描题库，生成待合成清单
│       ├── api_tts.py           #   DashScope API 批量合成
│       ├── ui_tts.py            #   UI 激励语合成
│       └── batch_tts.py         #   本地 qwen-tts 合成（备用）
│
└── frontend/                    # Next.js 前端
    ├── scripts/
    │   └── build-data.ts        # output/ → public/data/ 数据构建
    ├── src/
    │   ├── app/                 # 路由与页面
    │   │   ├── book/            #   教材详情 / 学习路径
    │   │   ├── reading/         #   课文听读
    │   │   ├── lesson/          #   答题页面
    │   │   ├── grade/           #   年级总览
    │   │   ├── profile/         #   学习档案
    │   │   └── review/          #   错题回顾
    │   ├── components/          # UI 组件
    │   ├── lib/                 # 工具库（TTS、音效、状态）
    │   ├── store/               # Zustand 状态管理
    │   └── types/               # TypeScript 类型定义
    └── public/
        ├── audio/               # TTS 音频（Opus，通过 Release 下载）
        ├── data/                # 题库 JSON（通过 Release 下载）
        └── textbook-pages/      # 课本原页图片
```

---

## 📖 教材来源与版权

本项目引用的教材结构来自开源项目 [TapXWorld/ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook)。

**版权策略**：

1. **不搬运教材原文**，只提取知识大纲与章节结构
2. **所有题目由 AI 原创生成**，基于知识点而非教材原题
3. 如相关版权方认为本项目存在任何问题，请与我们联系，我们会第一时间响应处理

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
- [x] Web 前端（单元小测 / 知识点全解 / 学习路径）
- [x] 全站 TTS 语音朗读
- [x] 课文听读（语文 / 英语）
- [ ] 道德与法治内容
- [ ] 题目质量评估与人工审核流程
- [ ] 离线版 / 校园内网部署包
- [ ] 家长 / 老师端的学习报告
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
