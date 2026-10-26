# 聪聪学堂 iOS 上架记录

2026-10-25：已建立 [App Store Connect 记录](https://appstoreconnect.apple.com/apps/6826962612/distribution/ios/version/inflight)，Apple ID `6826962612`，首个版本为 `1.0`。`1.0 (4)` 已于 2026-10-26 03:58:32 UTC 成功上传，Apple 返回安装包正在处理。尚未确认处理完成，也未提交审核或公开上架。

## 应用与签名

- 主 App：`com.wuwangzhang1216.congcongschool`
- Widget：`com.wuwangzhang1216.congcongschool.widget`
- 共用 App Group：`group.com.wuwangzhang1216.congcongschool`
- 本机团队：`46KF5Z549N`。源码不固定团队，通过 Xcode 或构建参数选择。
- 主 App 保留 iCloud Key-value storage 权限；两个 App ID 的描述文件都必须包含上述 App Group。
- 已验证 `0.1.0 (1)` 开发签名 IPA。它只适用于描述文件内已登记设备，不能作为 App Store 分发包上传。
- 当前送审源版本为 `1.0 (4)`。以后每次上传递增构建号。
- 已使用 Xcode 托管的 Apple Distribution 签名导出 `1.0 (4)` App Store IPA，主 App 与 Widget 的签名、无设备列表的分发描述文件、共享 App Group 和 iCloud KVS 均已校验。
- 签名产物和构建日志存放在忽略的 `dist/ios/`，不要提交证书、描述文件、私钥或私有审核联系人。

## 商店资料

可复用文案见 [app-store-metadata.zh-Hans.json](app-store-metadata.zh-Hans.json)。名称为“聪聪学堂”，主分类 Education，次分类 Reference。应用免费，无广告、无内购、无需登录。审核联系人经用户授权沿用 Oxyn-AI，姓名可读取，但邮箱和电话被 Apple 遮挡；用户已另行确认审核电话与邮箱。联系资料已在 App Store Connect 保存，不写入公开仓库。

用户已确认教材课文、故事及配图属于自有、公版或已有适当授权。首发地区由用户指定为中国大陆以外；已配置 174 个地区，中国大陆状态为 Not Available，不自动加入未来新增地区。

年龄分级按实际内容填写：教材中存在少量文学／历史战争、武器、烟酒描写，Apple 当前计算为 13+（部分地区另有分级）。不能沿用旧草稿的 4+，也不能为进入儿童专区而隐瞒内容。用户希望按 7+，但当前全局分级不能手填为 7+；保留真实问卷答案，并在审核说明中交代小学课文的教育语境。

## 隐私与家长确认

- [公开 iOS 隐私政策](https://d3nmsqi4n72idj.cloudfront.net/ios-privacy.html)，在 App 内设置中亦可离线阅读。
- 唯一内容源为 `ChinaTextbookStudy/Resources/privacy-policy.json`；运行 `python3 scripts/media/build-ios-privacy.py` 生成 Web 页面。
- 学习存档主要保存在本机；系统 iCloud 可用时同步至用户自己的私有 Apple 账户，开发者不能读取。
- 下载通过 GitHub Release 提供，网络服务会接收完成请求所需的 IP / HTTP 信息；不随下载发送学习存档或录音。
- 跟读仅在本机临时录音，离开阅读页删除。首次麦克风许可、通知许可、外部分享和打开外部隐私页面前有本地家长确认。
- 家长确认不收集年龄或身份，不属于真实年龄验证。
- 本机重置不会自动删除已有 iCloud 备份或用户自行分享的副本。
- App Privacy 按 Apple 对 collection 的定义填写 Data Not Collected；这不等于没有网络请求、系统 iCloud 或家长主动分享。
- `PrivacyInfo.xcprivacy` 声明无追踪、无收集数据类型，以及 UserDefaults 和文件时间戳的必要使用理由。

## 内容与资源

客户端包含旧版及 2026 修订版一年级上册数学基础数据和首课音频，其余资源按需下载；下载后可离线使用。资源 Release 为 `v1.7.0-ios-resources`，目录含 58 册。不要承诺所有内容首次安装即离线，也不要未经证明宣称全量人工校对。

图标为与 Web 一致的聪聪熊猫，1024×1024、不透明；可用 `scripts/media/build-ios-icon.sh` 重建。原生界面验证见 [UX 图库](../../docs/ios-ux-gallery.html)。商店截图由 `StoreListingScreenshotTests` 在专用 iPhone 17 Pro Max 与 iPad Pro 13 M5 模拟器采集，不用历史截图或 HTML 模型冒充 App 画面。

## 提交前核对

- [x] 创建应用记录、正确 Bundle ID、分类及中文副标题。
- [x] 内容使用权由用户确认。
- [x] 免费价格及中国大陆以外首发范围。
- [x] 公开与离线隐私政策、家长确认流程。
- [x] 准确的产品说明、支持链接、无需测试账户及审核联系人。
- [ ] 解决用户希望 7+ 与 Apple 按实际内容计算 13+ 的分级差异。
- [x] 单元测试 215 项；Pro 家长确认 4 项、SE 3 项均已通过（发现问题后的修正已单独复测）。
- [x] iPhone 1206×2622 与 iPad 2064×2752 各 4 张实际原生截图已上传。
- [x] Release `1.0 (4)` 归档及主 App / Widget 签名校验成功。
- [x] App Store 分发签名 IPA 导出及验证成功，详见忽略目录 `dist/ios/app-store/DISTRIBUTION-VERIFICATION.json`。
- [x] 使用 App Store 分发签名归档并上传，Apple 返回 Upload succeeded。
- [ ] 当前 App Store Connect 服务条款窗口需由用户确认接受，之后核对 TestFlight 处理结果。
- [ ] 选择上传构建，检查所有必填项并提交审核。
- [ ] 真机音频、麦克风、通知和 iCloud 最终验收。

参考：[Apple 提交流程](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)、[审核指南](https://developer.apple.com/app-store/review/guidelines/)、[隐私定义](https://developer.apple.com/app-store/app-privacy-details/)、[截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)。

## 本机导出环境

本机同时安装了系统与 Homebrew 的 rsync。Xcode 打包时可能由系统 rsync 调用到 PATH 中的另一实现，报 `--extended-attributes: unknown option`，最终显示 `Copy failed`。对导出／上传命令单独使用 `env PATH=/usr/bin:/bin:/usr/sbin:/sbin /usr/bin/xcodebuild ...` 已验证可以避免该冲突；无需修改系统配置或重新归档。分发使用 `app-store-connect` 方法，上传时将 ExportOptions 的 `destination` 设为 `upload`，版本／构建号保持不自动修改。
