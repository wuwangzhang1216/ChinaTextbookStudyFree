# App Store 上架清单

这份文档记录 iOS 端送审所需的 metadata 和上架步骤。2026-10-25 完成聪聪学堂原生 UX 升级；模拟器截图与验证见 [iOS UX 图库](../../docs/ios-ux-gallery.html)。已生成 `0.1.0 (1)` Apple Development 签名测试包；真机运行验收和 App Store Connect 配置仍需完成。

## 0. 当前状态一览

| 项目 | 状态 | 位置 |
|---|---|---|
| Xcode 项目生成 | ✅ | `apps/mobile/project.yml` → `xcodegen generate` |
| App icon (1024×1024，不透明) | ✅ | 与 Web 统一的熊猫聪聪图标；`scripts/media/build-ios-icon.sh` 可重建 |
| 隐私清单 (`PrivacyInfo.xcprivacy`) | ✅ | `apps/mobile/ChinaTextbookStudy/Resources/PrivacyInfo.xcprivacy` |
| `LSApplicationCategoryType` | ✅ | `public.app-category.education` |
| `ITSAppUsesNonExemptEncryption` | ✅ | `NO`（没有自研加密） |
| `NSHumanReadableCopyright` | ✅ | 声明教材内容版权 + 客户端 MIT |
| 单元测试 | ✅ | 本轮具体结果与设备见 iOS UX 图库 |
| UI 测试 | ✅ | 本轮具体结果与设备见 iOS UX 图库 |
| 品牌图标 | ✅ | 复用 `apps/web/public/icons/icon.svg` 的熊猫几何图形 |
| Bundle ID | ✅ | App：`com.wuwangzhang1216.congcongschool`；Widget：同前缀加 `.widget` |
| `DEVELOPMENT_TEAM` | ✅ | 本机使用 `46KF5Z549N`；源码保留空值，通过 Xcode 或构建参数选择自己的团队 |
| 开发测试 IPA | ✅ | 已签名导出；App、Widget 的 App Group 与主 App 的 iCloud 权限已核对 |
| 真机运行验证 | ⬜ | 音频需要真机 / 开声音的模拟器手动听一遍 |
| GitHub Release iOS 资源包 | ✅ | `v1.7.0-ios-resources`，58 册目录；语文一上和新版数学一上已抽样验证数据与 AAC |

## 1. 上架前必须改的东西

### 1.1 Bundle ID & 团队

编辑 `apps/mobile/project.yml`：

```yaml
settings:
  base:
    DEVELOPMENT_TEAM: "XXXXXXXXXX"   # 你的 Apple Developer Team ID
targets:
  ChinaTextbookStudy:
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.wuwangzhang1216.congcongschool
```

然后 `cd apps/mobile && xcodegen generate` 重新生成 `.xcodeproj`。

App 与 Widget 共用 `group.com.wuwangzhang1216.congcongschool`，该 App Group 必须在两个 App ID 的描述文件中都启用。修改标识时同步更新 `project.yml`、`PersistenceService.appGroupId` 和 Widget 的 `SnapshotStore.appGroupId`。主 App 另外保留 iCloud Key-value storage 能力。

### 1.2 版本号

`MARKETING_VERSION: "0.1.0"` → 发布版改成 `1.0.0`。`CURRENT_PROJECT_VERSION: "1"` 每次上传到 TestFlight 都要递增。

### 1.3 真实的 App Icon

当前已使用和 Web 一致的熊猫聪聪品牌图标。运行 `bash scripts/media/build-ios-icon.sh` 可从规范 SVG 重新生成，需安装 `rsvg-convert`。产物为 1024×1024 无 alpha 的 PNG；iOS 自行应用系统圆角。

替换流程：
1. 产出一张 **1024×1024 sRGB 不透明 PNG**（Apple 要求：无 alpha，方形，系统自动圆角）
2. 覆盖 `apps/mobile/ChinaTextbookStudy/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png`
3. 无需改 `Contents.json`（iOS 17+ 单图标模式 Xcode 会自动处理所有尺寸）
4. `xcodebuild clean build` 验证

### 1.4 GitHub Release 的 iOS 资源包

iOS 端内置一年级上册旧版和 2026 修订版数据，以及各自首课音频。其余内容由 `AssetDownloader` 按需下载。当前已发布的资源为 `v1.7.0-ios-resources`，manifest 包含 58 册；无需重复创建该 Release。

未来发布新版本时：

```bash
# 1. 转码 & 打包（~40 min 全量，~10.7MB per book）
bash scripts/package-release-ios.sh

# 2. 使用新的资源 tag，且同步更新 AssetDownloader.releaseBaseURL
: "${IOS_ASSET_TAG:?请先设置本次新的 iOS 资源 tag}"
gh release create "$IOS_ASSET_TAG" \
    /tmp/release-assets-ios/*.zip \
    /tmp/release-assets-ios/ios-manifest.json \
    --notes "iOS asset bundle: per-book data + AAC-24k m4a audio"
```

对应代码在 [AssetDownloader.swift](ChinaTextbookStudy/Services/AssetDownloader.swift)，已指向 `v1.7.0-ios-resources`。调整离线首课时可运行 `scripts/media/extend-ios-seed.py`，输入官方 manifest、data ZIP 和 AAC ZIP；脚本验证 SHA-256 后追加新版教材，保留旧版种子。

## 2. App Store Connect metadata 草稿

### 2.1 基本信息

| 字段 | 值 |
|---|---|
| **App 名称** | 聪聪学堂 |
| **副标题 (30 字符)** | 小学全科 · 课本闯关与听读 |
| **Bundle ID** | `com.wuwangzhang1216.congcongschool` |
| **主分类** | Education |
| **次要分类** | Reference |
| **年龄分级** | 4+ |

### 2.2 描述 (简体中文)

```
聪聪学堂是一款面向中国大陆小学生（1-6 年级）的免费、离线优先的课本辅导应用，
覆盖语文、数学、英语、科学四科，全程零广告、无内购、不收集任何用户数据。

功能亮点：
• 多邻国式闯关学习 —— 每个知识点拆成一节「小课」，5-7 题一闯
• 八种题型全面覆盖：单选、判断、数字填空、文字填空、计算、连词成句、连线、应用题
• 内置 TTS 语音点读，题目、选项、解析一键朗读
• 间隔重复错题本（Leitner 3 box 算法），自动排程复习
• 课外故事 + 课文听读模块，支持语文英语双语
• 16 个学习成就激励长期坚持
• 暗色模式、iPad 分栏布局

教材数据严格对齐人民教育出版社等官方版本，题库和配套音频由 AI 辅助生成后
人工校对。所有内容均通过 GitHub Release 分发，按教材按需下载，首次安装包 < 20 MB。

本应用为公益项目，代码以 MIT 许可开源，欢迎提交反馈：
https://github.com/<your>/ChinaTextbookStudyFree
```

### 2.3 促销文本 (170 字符)

```
免费 · 无广告 · 不收数据 · 支持离线。小学 1-6 年级四科题库 + AI 朗读 + 错题 SRS 复习。
开源公益项目，认真做的小学生多邻国。
```

### 2.4 关键字 (100 字符，逗号分隔)

```
小学,课本,练习,数学,语文,英语,科学,人教版,错题本,朗读,闯关,教育,学习
```

### 2.5 支持网址 / 营销网址

- 支持网址: `https://github.com/<your>/ChinaTextbookStudyFree/issues`
- 营销网址（可选）: 项目主页

## 3. 隐私问卷答案

App Store Connect → App 隐私

> **你的 App 是否收集数据？**

**No** — 所有用户状态（XP、错题本、连续天数、设置）都只存在本机沙盒
（`Application Support/cstf/`），没有任何网络上报、analytics 或第三方 SDK。

对应声明已在 [PrivacyInfo.xcprivacy](ChinaTextbookStudy/Resources/PrivacyInfo.xcprivacy) 中：
- `NSPrivacyTracking = false`
- `NSPrivacyTrackingDomains = []`
- `NSPrivacyCollectedDataTypes = []`
- 两个 `NSPrivacyAccessedAPITypes` 条目（UserDefaults 用 CA92.1，FileTimestamp 用 C617.1）

## 4. 截图要求

App Store 要求至少两组尺寸的截图：

| 设备 | 尺寸 | 数量 | 生成方式 |
|---|---|---|---|
| iPhone 6.9"（iPhone 16 Pro Max） | 1320×2868 | 3-10 张 | 在 iPhone 16 Pro Max 模拟器跑 `ScreenshotTests.swift` 或手动截 |
| iPad 13"（iPad Pro 13 M5） | 2064×2752 | 3-10 张 | 在 iPad Pro 13 模拟器跑同样的测试 |

推荐截图场景：
1. **首页** — 显示快捷入口 + 书架
2. **课程地图** （Book detail） — 显示分单元的小课列表
3. **答题页** — 显示带音频按钮的题目
4. **答题反馈** — 显示正确 / 错误反馈块
5. **成就墙** — 多色 badge 阵列
6. **暗色模式首页** — 展示适配效果
7. **iPad 分栏布局**（仅 iPad 组）

`apps/mobile/ChinaTextbookStudyUITests/ScreenshotTests.swift` 已经有基础 flow
自动截图能力，需要的话再加几个场景（进入一节课 + 答对一题）。

## 5. 审核风险提示

1. **教材内容版权**：App 内展示的课本题目和音频由 AI 辅助生成并向原教材对齐，但不是原版扫描件。
   如果审核员质疑版权，准备说明：
   - 题目是基于课本知识点由 AI 生成 + 人工校对，不是直接复制
   - 音频全部是 TTS 合成，非课本附带的原声录音
   - 课本扫描原页 JPG 不进 iOS 包（只有 Web 端用）
2. **年龄分级**：选 4+。没有 IAP、没有外链、没有广告、没有 UGC。
3. **审核测试账号**：不需要（没有账号体系）。
4. **审核说明文本**：建议写一段：
   > 本 App 离线使用，首次进入某本教材时会从 GitHub Release 下载该书的课文、
   > 题库和 TTS 音频约 10-15 MB。不需要账号或联网登录即可使用全部功能。

## 6. 上架前最终 Checklist

- [ ] 替换 Bundle ID 为你的真实域名
- [ ] 填入 `DEVELOPMENT_TEAM` ID
- [ ] 生成真正的 App Icon 并替换 `icon-1024.png`
- [ ] 版本号改为 `1.0.0`
- [ ] 生成并上传 iOS 资源 Release
- [ ] 更新 `AssetDownloader.releaseBaseURL` 为新 tag
- [ ] 真机跑一次完整流程（验证音频能发声）
- [ ] 截 iPhone 6.9" + iPad 13" 两组截图
- [ ] Archive + Upload to App Store Connect
- [ ] 填 metadata + 隐私问卷 + 审核说明
- [ ] 提交审核
