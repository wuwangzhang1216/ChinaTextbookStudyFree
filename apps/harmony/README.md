# 聪聪学堂 HarmonyOS App

鸿蒙测试版采用 ArkTS 原生安装页 + ArkWeb 离线 Web 页面的结构，复用 [Web 应用](../web) 的 Next.js 静态导出。支持手机、平板和 PC（`2in1`）；手机固定横屏，平板和 PC 随窗口布局。

**HAP 不是完整课程离线包。** HAP 内置页面、脚本和样式，课程数据、音频和图片首次运行时从资源服务器下载。当前资源版本为 `v1.2.0-assets`，下载约 2.06 GB（1.92 GiB）。全部安装完成后，常规学习无需保持资源服务器在线，也不需要运行 Next.js 开发服务器。

## 文件结构

```text
apps/harmony/
  AppScope/                         应用名称、图标、包名和版本
  build-profile.json5               产品、SDK 版本和签名配置
  oh-package.json5                  鸿蒙工程依赖配置
  hvigorfile.ts                     应用级构建入口
  hvigor/hvigor-config.json5         Hvigor 配置
  local.properties                  本机配置，不应复制他人机器的路径
  entry/
    build-profile.json5             entry 模块构建配置
    src/main/
      module.json5                  Ability、设备类型和权限声明
      ets/
        entryability/EntryAbility.ets  应用启动、窗口和手机横屏设置
        pages/Index.ets               资源检查、下载进度、错误重试和 Web 入口
        config/AssetConfig.ets        资源地址、版本、清单哈希和离线域名
        services/AssetInstaller.ets   安装状态检查、Worker 调度及进度转发
        workers/assetWorker.ts        下载、校验、解压和安装标记
        web/OfflineWeb.ets            本地 HTTPS 请求拦截和文件响应
      resources/
        base/                       文案、图标、页面配置等
        rawfile/site/               自动生成的 Web 页面壳，不手动修改
    build/default/outputs/default/  HAP 输出目录

scripts/                            以下路径相对于仓库根目录
  package-harmony-web.mjs            复制 Web 静态导出到 rawfile/site
  harmony-assets-server.mjs          局域网资源下载服务
  harmony-assets.test.mjs            资源安装 Worker 回归测试
```

主要实现见 [Index.ets](entry/src/main/ets/pages/Index.ets)、[assetWorker.ts](entry/src/main/ets/workers/assetWorker.ts) 和 [OfflineWeb.ets](entry/src/main/ets/web/OfflineWeb.ets)。

## 运行条件

| 条件 | 说明 |
| --- | --- |
| Node.js 与 npm | 推荐 Node.js 22；用于安装 Web 依赖、静态构建和运行资源服务器 |
| DevEco Studio | 安装可使用 HarmonyOS 6.1.0 / API 23 SDK 的版本及对应构建工具 |
| SDK 与设备 | 当前 `compatibleSdkVersion` 和 `targetSdkVersion` 均为 `6.1.0(23)`，设备需满足当前兼容版本要求 |
| 调试签名 | 在 DevEco Studio 为自己的设备配置签名；工程中的本机证书路径和签名材料不能直接复用 |
| USB 调试 | 真机开启开发者模式及 USB 调试，授权电脑；命令行安装需让 `hdc` 可执行 |
| 局域网 | 首次下载时，电脑和手机连接可互访的网络，防火墙允许 TCP `8787` 入站，避免访客 Wi-Fi / AP 隔离 |
| 磁盘空间 | 电脑需容纳归档、解压数据和构建产物；手机需额外容纳下载包、临时 TAR 和最终资源，建议至少预留 6 GB 可用空间 |
| 下载辅助工具 | 使用现有资源下载脚本时需要 Bash、curl、tar、Python 3；下文 shell 示例以 macOS / Linux 为例 |

命令行构建还需要配置鸿蒙 SDK、Hvigor 及其匹配的 Node/JDK 环境。优先先在 DevEco Studio 内完成工程同步和一次构建，不要把普通 npm 包当成鸿蒙构建工具安装。

## 准备 Web 页面

除明确注明外，下文命令均在**仓库根目录**执行。

1. 安装工作区依赖：

```bash
npm install
```

2. 新克隆仓库需先准备 Web 构建使用的数据与媒体资源。已有完整资源可跳过；也可按[主 README](../../README.md) 中的 Web 环境说明准备。

```bash
bash scripts/download-assets.sh v1.2.0-assets
```

该脚本会下载并解压资源，同时准备构建所需的课文、故事源数据；**它会删除临时压缩包，也不会准备资源服务器的清单文件**。因此还需完成下一节的服务器文件准备。该脚本会跳过已有的部分资源目录，切换资源版本时要确认本地数据没有混用旧版本。

3. 构建静态页面并复制到鸿蒙工程：

```bash
npm run build
npm run harmony:prepare-web
```

产物来自 [apps/web/out](../web/out)，复制至 [entry/src/main/resources/rawfile/site](entry/src/main/resources/rawfile/site)。首次构建前这两个生成目录可能尚不存在。

[复制脚本](../../scripts/package-harmony-web.mjs) 排除课程资源目录、压缩包、资源清单和 Service Worker。修改 Web 代码后，需要重新执行上述两条命令，再重新构建 HAP；只重启资源服务器不会更新 App 内置页面。

## 搭建资源服务器

### 1. 准备原始归档

服务器从 [apps/web/public](../web/public) 读取以下文件，不能只放解压后的目录：

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | 版本、文件大小和 SHA-256 清单 |
| `data.zip` | 课程与题库 JSON |
| `story-images.zip` | 故事配图 |
| `textbook-pages.zip` | 教材图片 |
| `audio.tar.gz` | 音频资源 |

从 [v1.2.0-assets Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.2.0-assets) 获取这五个文件。已有文件无需重复下载；以下命令只下载缺失项：

```bash
mkdir -p apps/web/public
base_url="https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/download/v1.2.0-assets"
for asset in manifest.json data.zip story-images.zip textbook-pages.zip audio.tar.gz; do
  if [ ! -f "apps/web/public/$asset" ]; then
    curl --fail --location --retry 3 \
      --output "apps/web/public/$asset" "$base_url/$asset" || exit 1
  fi
done
```

下载失败可能留下不完整文件，重试前应移走失败的文件。不要重新压缩、格式化或修改这些发布文件，否则清单中的大小与哈希可能不再匹配。

### 2. 启动服务

```bash
npm run harmony:assets-server
```

服务绑定 `0.0.0.0:8787`，输出本机局域网地址，例如 `http://192.168.1.20:8787`。它只提供上述五个文件的 `GET` / `HEAD` 请求，不提供目录浏览；访问 `/` 返回错误不代表服务器未启动。

下载期间保持这个终端运行，并避免电脑休眠。端口已被占用时，可以换端口，同时修改 App 配置：

```bash
HARMONY_ASSET_PORT=8788 npm run harmony:assets-server
```

### 3. 配置 App 地址

修改 [AssetConfig.ets](entry/src/main/ets/config/AssetConfig.ets)：

```ts
export const ASSET_BASE_URL: string = 'http://192.168.1.20:8787';
export const ALLOW_INSECURE_HTTP_FOR_LOCAL_TESTS: boolean = true;
```

将示例 IP 换成服务器输出的、手机可以访问的电脑地址。不能使用 `localhost` 或 `127.0.0.1` 代替电脑 IP，因为在手机中它们指向手机本身。IP 或端口改变后，需要重新构建并覆盖安装 HAP。

`WEB_ORIGIN = 'https://cstf.invalid'` 是 WebView 内部的离线地址，由 App 拦截后读取本地文件，不是真实服务器域名。**不要把它改成下载服务器地址，也不需要为它部署 DNS 或 HTTPS 服务。**

### 4. 检查连通性

用自己的电脑 IP 替换示例值：

```bash
curl --fail http://192.168.1.20:8787/manifest.json
curl --head http://192.168.1.20:8787/audio.tar.gz
```

预期分别返回 JSON 清单和 `200` 响应。再在手机浏览器打开同一个清单 URL，确认不是只有电脑本机可访问。

服务器启动时检查清单固定哈希以及归档文件是否存在；App 下载时会进一步校验每个归档的大小和 SHA-256。

### 公网部署

内置 Node 服务仅供可信局域网测试，没有认证机制，不要直接暴露到公网。正式分发应使用 HTTPS 静态资源托管服务，将五个文件放在同一版本目录下，让 `ASSET_BASE_URL` 指向该目录，并把 `ALLOW_INSECURE_HTTP_FOR_LOCAL_TESTS` 设为 `false`。服务必须向 App 返回原始文件，不能返回登录页或下载确认页。

若只是更换镜像且文件内容完全相同，只需改地址。更换资源版本时，要同步更新 `ASSET_TAG`、`MANIFEST_SHA256`、`DOWNLOAD_BYTES`；若继续使用本地测试服务，还要更新[服务脚本](../../scripts/harmony-assets-server.mjs)中的 `expectedManifestHash`。清单哈希按原始文件字节计算，例如 macOS 可运行：

```bash
shasum -a 256 apps/web/public/manifest.json
```

## 构建和真机运行

### DevEco Studio

1. 打开本目录 `apps/harmony`，同步工程及鸿蒙依赖。
2. 检查 SDK，使用自己的签名配置，连接并授权真机。
3. 确认已生成 Web 页面壳、配置下载地址并启动资源服务器。
4. 选择 `entry` 模块运行。
5. 首次启动点击“下载全部资源”，等待下载、校验和解压完成后进入学习页。

### 命令行

配置好 SDK、签名以及 `hvigorw` / `hdc` 环境后，从仓库根目录进入鸿蒙工程：

```bash
cd apps/harmony
hvigorw --mode module -p module=entry@default -p product=default \
  -p buildMode=debug assembleHap --no-daemon

hdc list targets
hdc install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc shell aa start -a EntryAbility -b com.chinatextbookstudy.harmony
```

使用已签名的 `entry-default-signed.hap`。覆盖安装用于保留资源和学习数据，前提是包名与签名兼容；不要为排查普通错误先卸载 App，卸载会删除私有数据并导致重新下载。连接多台设备时，为 `hdc` 添加 `-t <设备标识>`。

若覆盖安装后仍在运行旧进程，可先执行 `hdc shell aa force-stop com.chinatextbookstudy.harmony`，再执行上面的启动命令。

## 安装流程与本地数据

资源保存于 App 私有目录，`<filesDir>` 由鸿蒙运行时提供，不要硬编码设备绝对路径：

```text
<filesDir>/cstf/
  staging/<ASSET_TAG>/          下载归档、解压过程中产生的临时 TAR
  assets/<ASSET_TAG>/           data/、audio/、story-images/、textbook-pages/
  .installed/<ASSET_TAG>/       各资源包的完成标记，以及最终 complete 标记
```

Worker 按资源包下载、校验和解压。ZIP 使用目录解压接口；音频先通过 `GZip` 分块生成临时 TAR，再解包。全部完成后写入最终安装标记，安装页切换为离线 Web 页面。

重试会跳过已完成的包，并复用大小和 SHA-256 均正确的已下载归档；不完整或校验失败的归档重新下载，**不支持未完成单个文件的断点续传**。重试仍需先联网获取并校验清单。音频解压期间有临时磁盘占用，下载完成不等于解压完成。

WebView 在控制器附着后注册 HTTPS 拦截器：页面和脚本来自 HAP 的 `rawfile/site`，课程资源来自私有目录。无扩展名页面路由会映射到对应的 `index.html`。学习状态使用 Web 本地存储，保持离线域名稳定，避免切换域名后读不到原学习数据。

## 测试与排错

资源安装逻辑回归测试，在仓库根目录运行：

```bash
node --test scripts/harmony-assets.test.mjs
```

这些测试在 Node 中转译 Worker 并模拟鸿蒙接口，覆盖文件判断、归档复用、gzip 分块处理及异常清理；不能代替 SDK 编译和真机下载、解压、页面跳转测试。

真机日志命令：

```bash
hdc shell hilog -x -T CSTF
hdc shell pidof com.chinatextbookstudy.harmony
hdc shell hilog -x -P <上一条返回的进程号> -L E,F
```

`hilog -x` 读取当前日志后退出；不要添加 Android logcat 的 `-d` 参数。VS Code 普通 TypeScript 检查器可能无法解析鸿蒙 `@kit.*` 模块，应以 DevEco Studio / Hvigor 的 ArkTS 编译结果为准。

| 现象 | 排查方法 |
| --- | --- |
| `CURLcode 7` / 连接失败 | 确认资源服务在运行、电脑 IP 和端口正确、防火墙放行且手机可访问清单 URL |
| 服务启动提示清单哈希不匹配 | 确认清单来自配置对应的 Release，未格式化或混入其他版本；不要简单关闭校验 |
| 找不到静态导出目录 / 页面空白 | 先执行 Web 构建和页面壳复制，再打 HAP；控制器相关接口需在 `onControllerAttached` 后调用 |
| `no such file or directory` | 检查目录创建和文件存在判断；`fileIo.accessSync` 返回 `false` 也表示不存在，不能只依赖异常判断 |
| `900002 destination path is not an existing directory` | `zlib.decompressFile` 只用于 ZIP，目标必须是已存在目录；gzip 必须走独立的流式解压分支 |
| 下载已到 100%，仍未进入首页 | 校验和解压尚需时间，特别是音频归档；当前版本用加载指示显示这两个阶段。持续不结束时检查错误日志和剩余空间 |
| 选择年级后 `Invalid relative path` | 检查无末尾斜杠的路由是否映射到 `site/<路由>/index.html`，并确认 HAP 中页面壳已更新 |
| 签名或安装失败 | 重新配置本机签名、确认设备授权及 SDK 兼容性；优先保留数据排查，不要直接卸载 |
| 更新代码后手机表现没变化 | Web 改动需重新导出并复制；ArkTS 改动需重新打 HAP；覆盖安装后重启 App |

证书、密钥、签名密码和机器专用配置不要提交到仓库或写入文档。生成的页面壳、构建目录和大型资源由脚本或 Release 提供，不应当作为日常源码维护。