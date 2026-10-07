# UX 修复分支的资源安装

这一分支修改了题目文本，新增了内容地址音频。仅下载旧版基础资源会缺少修订后的朗读。安装顺序为基础包、补充包、重新生成数据；旧 `data.zip` 不能覆盖新的构建输出。

## 安装

在仓库根目录运行：

```sh
npm ci
bash scripts/download-assets.sh v1.2.0-assets
gh release download v1.3.0-ux-content --repo wuwangzhang1216/ChinaTextbookStudyFree --pattern ux-content-audio.tar.gz --dir deploy-output
python3 - <<'PY'
import hashlib, json, pathlib
manifest = json.loads(pathlib.Path('docs/ux-content-assets.json').read_text())
bundle = pathlib.Path('deploy-output') / manifest['bundle']
assert bundle.stat().st_size == manifest['bytes']
assert hashlib.sha256(bundle.read_bytes()).hexdigest() == manifest['sha256']
print('音频补充包 SHA256 与长度通过')
PY
tar -xzf deploy-output/ux-content-audio.tar.gz -C apps/web/public
npm run build
npx tsx scripts/check-lesson-revisions.ts
npx tsx scripts/checks/ux-content.ts
python3 scripts/checks/site-integrity.py --public apps/web/public --site apps/web/out --report deploy-output/ux-site-integrity.json
```

`v1.3.0-ux-content` 当前是草稿release，需要有仓库权限并登录 `gh` 才能下载。合并/生产发布前需发布资源并验证无认证下载。离线安装可使用本地 `deploy-output/ux-content-audio.tar.gz`，同样先核对提交的manifest。

需要FFmpeg。`npm run build` 会先按新文本生成JSON并验证/转换MP3，再生成静态站点。全部资源校验通过之前不要部署。

## 来源与范围

- `docs/lesson-reviews/` 保存137课模型复核、内容指纹与待完成的教师审核状态；新增297题。
- `docs/ux-content-corrections.json` 保存另外9道旧题的修正前后记录。16段新增朗读来自已安装的macOS Tingting，拼音选项按对应音节生成；详见 `ux-repair-evidence/tts-repairs.json`，需教师听审。
- `docs/ux-content-assets.json` 保存补充包及每个Opus/MP3文件的长度与SHA256。
- 在数据与音频生成后运行 `python3 scripts/bundle-ux-content-assets.py` 可重新打包这些课涉及的全部朗读；不调用付费生成API。
- 本补充包包含已复核修订及9道补充修正涉及的全部音频。其余题库、课文和故事仍依赖基础资源包。
