# Windows + RTX 4080 上跑 TTS

**目标机器**: Alienware m18 r1 / RTX 4080 laptop (12GB VRAM) / 96GB RAM / Windows 原生（不用 WSL）

预计 52159 条独立文本：
- 单进程 CUDA + sdpa：约 18-24 小时
- 2 进程并行 + flash-attn：约 10-15 小时
- 过夜跑稳稳完成

---

## 一、环境准备（一次性）

### 1. 安装 Python 3.12

推荐从 <https://www.python.org/downloads/windows/> 下载 **3.12.x** 安装器（不要装 3.13/3.14，qwen-tts 依赖 torch 还没跟上最新 Python）。安装时勾上 "Add python.exe to PATH"。

验证：
```powershell
python --version
# Python 3.12.x
```

### 2. 安装 uv（快速包管理器）

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

关掉 PowerShell 窗口重开，验证：
```powershell
uv --version
```

### 3. 安装 ffmpeg

二选一：
```powershell
winget install Gyan.FFmpeg
# 或
scoop install ffmpeg
```

验证：
```powershell
ffmpeg -version
```

### 4. 确认 NVIDIA 驱动

```powershell
nvidia-smi
```

看到 RTX 4080 + 12GB + 驱动版本就行。驱动要 ≥ 535（Alienware 一般已经够）。

---

## 二、拉仓库 + 建虚拟环境

```powershell
# 任选一个工作目录
cd D:\
git clone https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree

# 建 venv
uv venv .venv-tts --python 3.12
.venv-tts\Scripts\activate

# 装 PyTorch CUDA 12.4 版本（RTX 4080 完美支持）
uv pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124

# 装 qwen-tts + soundfile
uv pip install qwen-tts soundfile

# 验证 CUDA 被识别
python -c "import torch; print('cuda:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
# 应输出: cuda: True NVIDIA GeForce RTX 4080 Laptop GPU
```

### （可选）装 flash-attention-2 — 推理提速 ~30%

Windows 原生编译 flash-attn 比较痛苦，需要 MSVC + CUDA toolkit。**不装也能跑**，只是慢一点。

如果你要装，最简单的方式是用预编译 wheel（注意要和你的 torch/cuda/python 版本匹配）：
```powershell
# 例如 torch 2.5 + cuda12.4 + py312：
uv pip install https://github.com/kingbri1/flash-attention/releases/download/v2.6.3/flash_attn-2.6.3+cu124torch2.5cxx11abiFALSE-cp312-cp312-win_amd64.whl
```

实在装不上就跳过，batch_tts.py 会自动回退到 sdpa。

---

## 三、运行

### 3.1 先生成 manifest（一次性，把 output/ 扫描成文本清单）

```powershell
python scripts\tts\collect_texts.py
```

这步纯 Python，没任何 GPU 需求，几秒钟出结果，写 `scripts\tts\manifest.json`。

### 3.2 Smoke test — 先跑 10 条确认环境 OK

```powershell
python scripts\tts\batch_tts.py --limit 10
```

应该看到：
```
✅ 使用 CUDA GPU (NVIDIA GeForce RTX 4080 Laptop GPU) + flash-attn2
   （或 + sdpa 如果没装 flash-attn）
🔄 加载模型 ...
✅ 模型加载完成
  [   10/10]  0.xx item/s  ...
🎉 完成。生成 10 条，失败 0 条，总耗时 x.x min
```

单条约 **2-4 秒**。如果这一步成了，后面全量跑就稳了。

### 3.3 正式全量 — 2 进程并行

打开 **两个** PowerShell 窗口，都 `cd D:\ChinaTextbookStudyFree && .venv-tts\Scripts\activate`。

**窗口 A**：
```powershell
python scripts\tts\batch_tts.py --shard 0/2
```

**窗口 B**：
```powershell
python scripts\tts\batch_tts.py --shard 1/2
```

两个进程会：
- 各自覆盖 manifest 的一半
- 跳过已存在的 mp3（我的 M4 Max 已经生成了 ~1035 条，会自动跳过不重复生成）
- CUDA 不漏内存，**不需要** `--max-items` 定期重启

### 显存够不够 2 路？

- 1.7B bf16 权重 ≈ 3.4GB × 2 = 6.8GB
- 推理 KV cache + activations ≈ 1.5GB × 2 = 3GB
- 总计 ~10GB / 12GB VRAM ✓

如果 `nvidia-smi` 显示显存吃到 11.5GB+ 偶尔报 OOM，改成 **单进程** 跑即可，无非慢一倍，过夜照样完成。

### 想更快？3 路或降精度

先试 2 路稳定后：
- **方案 1**：3 路（窗口 C 跑 `--shard 2/3`，同时 A/B 改成 `0/3` `1/3`）
  - 显存会更紧，可能 OOM
- **方案 2**：用 0.6B 模型（体积更小，3 路稳得住）
  ```powershell
  python scripts\tts\batch_tts.py --shard 0/3 --model-size 0.6B
  ```
  CUDA 上 0.6B 不像 MPS 那样有 NaN 问题，质量比 1.7B 略差但完全可用

---

## 四、运行中监控

新开一个窗口：

```powershell
# 显存 + GPU 利用率（每秒刷新）
nvidia-smi -l 1

# 已生成多少（手动运行）
(Get-ChildItem frontend\public\audio -Recurse -Filter *.mp3).Count

# 两个 python 进程还活着吗
Get-Process python | Format-Table Id, StartTime, WS, Path
```

正常速率：
- 单进程：~0.3-0.5 文件/s
- 2 进程：~0.6-1.0 文件/s
- 52159 条 / 0.8 ≈ 18 小时

---

## 五、跑完之后

1. 把 `frontend/public/audio/` 整个目录拿回去（压缩 + 传 / rsync / OneDrive 均可）
   - 预计 1-1.5 GB，~52k 个小 mp3
2. 在 Mac（或你的主开发机）上：
   ```bash
   cd frontend
   npm run build:data   # 自动索引 audio/ 目录，把路径注入到 lesson JSON
   npm run dev
   ```
3. 前端所有题目、选项、知识讲解旁边就会出现 🔊 按钮，可以逐条播放

---

## 六、遇到问题排查

| 症状 | 解决 |
|---|---|
| `torch.cuda.is_available() == False` | NVIDIA 驱动太老，或装成了 CPU 版 torch。重装：`uv pip install torch --index-url https://download.pytorch.org/whl/cu124 --force-reinstall` |
| 第一条就 OOM | 2 路并行显存不够，改单路 `--shard 0/1` |
| `Unsupported speakers: [...]` | 不会再发生，已经改成真实 speaker 名；如出现，回到 `collect_texts.py` 的 `pick_profile()` 选一个在错误消息里列出的名字 |
| `sox: command not found` | Windows 一般不需要 sox，qwen-tts 会跳过。如果硬报错，`scoop install sox` |
| 速率比预期慢 3x+ | `nvidia-smi` 看是不是别的程序（游戏 / Chrome 硬件加速）在抢 GPU；关掉再跑 |
| 想暂停续跑 | 直接 Ctrl+C 两个窗口，已生成的 mp3 不会丢。下次 `python scripts\tts\batch_tts.py --shard 0/2` 会自动跳过已存在的 |

---

## 附：目录约定

- 输入：`scripts\tts\manifest.json`（由 `collect_texts.py` 生成）
- 输出：`frontend\public\audio\<hash前2位>\<hash>.mp3`
- 约定：`hash = sha1(normalize(text))`，这样跨平台一致，Mac 上生成的和 Windows 上生成的可以无缝合并
