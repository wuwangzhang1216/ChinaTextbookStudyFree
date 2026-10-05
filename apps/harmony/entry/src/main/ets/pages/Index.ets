import { common } from '@kit.AbilityKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { WEB_ORIGIN, DOWNLOAD_BYTES } from '../config/AssetConfig';
import { AssetInstaller } from '../services/AssetInstaller';
import { OfflineWeb } from '../web/OfflineWeb';

@Entry
@Component
struct Index {
  @State private ready: boolean = false;
  @State private downloading: boolean = false;
  @State private progress: number = 0;
  @State private currentAsset: string = '';
  @State private errorText: string = '';

  private installer: AssetInstaller = new AssetInstaller();

  aboutToAppear(): void {
    this.checkAssets();
  }

  private async checkAssets(): Promise<void> {
    const context = getContext(this) as common.UIAbilityContext;
    this.ready = await this.installer.isInstalled(context);
  }

  private async startDownload(): Promise<void> {
    if (this.downloading) return;
    const context = getContext(this) as common.UIAbilityContext;
    this.downloading = true;
    this.errorText = '';
    try {
      await this.installer.install(context, (assetName: string, fraction: number) => {
        this.currentAsset = assetName;
        this.progress = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      });
      this.ready = true;
    } catch (error) {
      this.errorText = error instanceof Error ? error.message : String(error);
    } finally {
      this.downloading = false;
    }
  }

  build() {
    Column() {
      if (this.ready) {
        OfflineWeb({ origin: WEB_ORIGIN })
          .width('100%')
          .height('100%')
      } else {
        Column({ space: 20 }) {
          Text('聪聪学堂')
            .fontSize(30)
            .fontWeight(FontWeight.Bold)
            .fontColor('#20332B')

          Text('首次使用需要下载课程资源')
            .fontSize(18)
            .fontColor('#394B42')

          Text(`约 ${(DOWNLOAD_BYTES / (1024 * 1024 * 1024)).toFixed(1)} GB，建议使用 Wi-Fi，并预留约 3.4 GB 空间。`)
            .fontSize(15)
            .fontColor('#65746C')
            .textAlign(TextAlign.Center)

          if (this.downloading) {
            if (this.currentAsset.endsWith('校验中') || this.currentAsset.endsWith('解压中')) {
              LoadingProgress()
                .width(32)
                .height(32)
              Text(this.currentAsset)
                .fontSize(14)
                .fontColor('#65746C')
            } else {
              Progress({ value: this.progress, total: 100, type: ProgressType.Linear })
                .width('78%')
              Text(`${this.currentAsset}  ${this.progress}%`)
                .fontSize(14)
                .fontColor('#65746C')
            }
          } else {
            Button('下载全部资源')
              .height(48)
              .padding({ left: 32, right: 32 })
              .backgroundColor('#58CC02')
              .fontColor('#17311F')
              .onClick(() => this.startDownload())
          }

          if (this.errorText.length > 0) {
            Text(this.errorText)
              .fontSize(14)
              .fontColor('#B3261E')
              .textAlign(TextAlign.Center)
            if (!this.downloading) {
              Button('重试')
                .onClick(() => this.startDownload())
            }
          }

          Text(`设备：${deviceInfo.deviceType}`)
            .fontSize(12)
            .fontColor('#89958E')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .padding(28)
        .backgroundColor('#F7F7F7')
      }
    }
    .width('100%')
    .height('100%')
  }
}