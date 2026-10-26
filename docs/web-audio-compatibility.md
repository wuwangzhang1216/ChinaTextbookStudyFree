# 老 iPad 与 Web 音频（issue #3）

Web 构建从原音频生成 MP3，再更新课程、课文、故事和 UI 语音引用。MP3 是通用 Web 播放格式；原 Opus 保留，iOS 原生应用的 AAC/m4a 打包流程不受影响。

Safari 到 iPadOS 18.4 才增加 Ogg/Opus 支持，见 [WebKit 官方说明](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)。因此仅改变 `.opus` 文件名或 MIME 不能解决旧系统解码问题，必须转换真实音频。

## 安装与构建

需要 Node.js 20+、Python 3.9+ 和提供 `libmp3lame` 的 FFmpeg，并已安装完整 Release 数据及原音频。在仓库根目录运行：

```sh
npm ci
npm run build
```

`npm run dev` 同样会先构建数据和兼容音频。构建流程使用原音频进行本地转码，不调用付费 TTS 模型；缓存按原文件、编码参数和输出文件的 SHA-256 验证。任一源文件缺失或转换失败都会中止，不将 JSON 改成部分可用的 MP3 引用。

部署时上传 `apps/web/out/` 的全部内容，包括新 MP3 和构建后 JSON，并正确提供 `audio/mpeg` 响应类型。更新静态文件后需刷新 CDN 缓存。旧错题本仍可能保存 Opus 地址，播放器会优先尝试对应 MP3，缺失时再回退原地址。

## 验证

```sh
python3 scripts/checks/web-audio-compat.py --self-test
npx tsx scripts/checks/tts-legacy-audio.ts
python3 scripts/checks/web-audio-compat.py
```

检查器验证实际 JSON 和 `uiAudio()` 返回的路径、MP3 文件签名及真实解码样本，不接受把 Ogg 改名为 `.mp3`。播放测试覆盖旧地址兼容、回退、暂停、过期事件和异步竞争。

生成的公开 JSON/MP3 使用可供静态服务器读取的权限，缓存命中也会修复旧版留下的限制权限；报告和缓存清单仍使用私有临时文件写入。Docker 实测覆盖非 root Nginx 读取，避免页面可打开但课程/语音返回 403。

这解决文件格式兼容问题，不绕过浏览器自动播放限制。首次打开时可能需要点小喇叭或页面上的播放控制；真实旧 iPad 的系统、浏览器与麦克风仍需设备验收。

## v1.7.3 发布后复核（2026-10-26）

格式兼容改造已上线。重新核验143,207处运行时引用和122,055个唯一真实MP3、15个编码反例场景、16段CDN实际下载/解码/MIME/SHA/Range及手动讲解播放均通过。[证据与自建站点、老iPad复测步骤](remaining-issues-2026-10-26/README.md)。尚未取得iPad6真机记录，实际设备结果继续在#12人工清单跟踪，不把模拟或桌面验证当作真机通过。
