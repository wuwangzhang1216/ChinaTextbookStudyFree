import { common } from '@kit.AbilityKit';
import { MessageEvents, worker } from '@kit.ArkTS';
import { fileIo } from '@kit.CoreFileKit';
import { ALLOW_INSECURE_HTTP_FOR_LOCAL_TESTS, ASSET_BASE_URL, ASSET_TAG, MANIFEST_SHA256 } from '../config/AssetConfig';

interface InstallMessage {
  type: string;
  assetName?: string;
  fraction?: number;
  message?: string;
}

export class AssetInstaller {
  async isInstalled(context: common.UIAbilityContext): Promise<boolean> {
    const marker = `${context.filesDir}/cstf/.installed/${ASSET_TAG}/complete`;
    try {
      return fileIo.accessSync(marker);
    } catch (_error) {
      return false;
    }
  }

  install(
    context: common.UIAbilityContext,
    onProgress: (assetName: string, fraction: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const taskWorker = new worker.ThreadWorker('entry/ets/workers/assetWorker.ts', {
        name: 'CSTF asset installer',
      });

      taskWorker.onmessage = (event: MessageEvents): void => {
        const message = event.data as InstallMessage;
        if (message.type === 'progress') {
          onProgress(message.assetName ?? '', message.fraction ?? 0);
        } else if (message.type === 'complete') {
          taskWorker.terminate();
          resolve();
        } else if (message.type === 'error') {
          taskWorker.terminate();
          reject(new Error(message.message ?? '资源安装失败'));
        }
      };

      taskWorker.onerror = (event): void => {
        taskWorker.terminate();
        reject(new Error(event.message));
      };

      taskWorker.postMessage({
        context,
        assetBaseUrl: ASSET_BASE_URL,
        assetTag: ASSET_TAG,
        manifestSha256: MANIFEST_SHA256,
        allowInsecureHttp: ALLOW_INSECURE_HTTP_FOR_LOCAL_TESTS,
      });
    });
  }
}