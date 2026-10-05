import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { resourceManager } from '@kit.LocalizationKit';
import { webview } from '@kit.ArkWeb';
import { buffer } from '@kit.ArkTS';
import { WebNetErrorList } from '@ohos.web.netErrorList';
import { ASSET_TAG } from '../config/AssetConfig';

const CHUNK_BYTES: number = 256 * 1024;
const RESOURCE_HOST: string = 'cstf.invalid';

@Component
export struct OfflineWeb {
  origin: string = '';

  private controller: webview.WebviewController = new webview.WebviewController();
  private schemeHandler: webview.WebSchemeHandler = new webview.WebSchemeHandler();
  private attached: boolean = false;
  private permissionRequestPending: boolean = false;

  private attachHandler(): void {
    if (this.attached) return;
    const context = getContext(this) as common.UIAbilityContext;
    this.schemeHandler.onRequestStart((request: webview.WebSchemeHandlerRequest, handler: webview.WebResourceHandler) => {
      const requestUrl = request.getRequestUrl();
      if (!requestUrl.startsWith(`https://${RESOURCE_HOST}/`) && requestUrl !== `https://${RESOURCE_HOST}`) {
        this.respondError(handler, 404, 'Offline resource not found');
        return true;
      }
      void this.respond(context, request, handler);
      return true;
    });
    this.controller.setWebSchemeHandler('https', this.schemeHandler);
    this.attached = true;
  }

  private async respond(
    context: common.UIAbilityContext,
    request: webview.WebSchemeHandlerRequest,
    handler: webview.WebResourceHandler,
  ): Promise<void> {
    let filePath = '';
    let rawFilePath = '';
    let descriptor: fileIo.File | undefined;
    let rawDescriptor: resourceManager.RawFileDescriptor | undefined;
    try {
      const requestUrl = request.getRequestUrl();
      const origin = `https://${RESOURCE_HOST}`;
      if (!requestUrl.startsWith(`${origin}/`) && requestUrl !== origin) {
        this.respondError(handler, 404, 'Offline resource not found');
        return;
      }
      const pathWithQuery = requestUrl.slice(origin.length);
      const pathName = pathWithQuery.split('?', 1)[0];
      const decodedPath = decodeURIComponent(pathName);
      const pathParts = decodedPath.split('/').filter((part: string) => part.length > 0);
      if (pathParts.some((part: string) => part === '..' || part.includes('\\') || part.includes(':'))) {
        this.respondError(handler, 400, 'Bad Request');
        return;
      }
      let relative = pathParts.join('/');
      if (relative.length === 0) relative = 'index.html';
      else if (decodedPath.endsWith('/')) relative += '/index.html';

      if (relative.startsWith('audio/') || relative.startsWith('data/') ||
        relative.startsWith('story-images/') || relative.startsWith('textbook-pages/')) {
        filePath = `${context.filesDir}/cstf/assets/${ASSET_TAG}/${relative}`;
        descriptor = fileIo.openSync(filePath, fileIo.OpenMode.READ_ONLY);
      } else {
        const fileName = relative.slice(relative.lastIndexOf('/') + 1);
        if (!fileName.includes('.')) relative += '/index.html';
        rawFilePath = `site/${relative}`;
        rawDescriptor = context.resourceManager.getRawFdSync(rawFilePath);
      }

      const fileLength = rawDescriptor?.length ?? fileIo.statSync(filePath).size;
      const fileOffset = rawDescriptor?.offset ?? 0;
      const headers = request.getHeader();
      const rangeHeader = headers.find((header) => header.headerKey.toLowerCase() === 'range')?.headerValue;
      const range = parseRange(rangeHeader, fileLength);
      if (rangeHeader && !range) {
        this.respondError(handler, 416, 'Range Not Satisfiable');
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? fileLength - 1;
      const responseLength = Math.max(0, end - start + 1);
      const status = range ? 206 : 200;
      const response = new webview.WebSchemeHandlerResponse();
      response.setNetErrorCode(WebNetErrorList.NET_OK);
      response.setStatus(status);
      response.setStatusText(status === 206 ? 'Partial Content' : 'OK');
      response.setMimeType(mimeType(relative));
      if (isTextResource(relative)) response.setEncoding('utf-8');
      response.setHeaderByName('Content-Length', String(responseLength), true);
      response.setHeaderByName('Accept-Ranges', 'bytes', true);
      response.setHeaderByName('Cache-Control', 'no-store', true);
      if (range) response.setHeaderByName('Content-Range', `bytes ${start}-${end}/${fileLength}`, true);
      handler.didReceiveResponse(response);

      let sent = 0;
      while (sent < responseLength) {
        const size = Math.min(CHUNK_BYTES, responseLength - sent);
        const buffer = new ArrayBuffer(size);
        const sourceOffset = (rawDescriptor ? fileOffset : 0) + start + sent;
        const bytesRead = rawDescriptor
          ? fileIo.readSync(rawDescriptor.fd, buffer, { offset: sourceOffset, length: size })
          : fileIo.readSync(descriptor!.fd, buffer, { offset: sourceOffset, length: size });
        if (bytesRead <= 0) throw new Error(`Unexpected end of file: ${relative}`);
        handler.didReceiveResponseBody(buffer.slice(0, bytesRead));
        sent += bytesRead;
      }
      handler.didFinish();
    } catch (error) {
      this.respondError(handler, 404, error instanceof Error ? error.message : 'Not Found');
    } finally {
      if (descriptor) fileIo.closeSync(descriptor.fd);
      if (rawDescriptor) context.resourceManager.closeRawFdSync(rawFilePath);
    }
  }

  private respondError(handler: webview.WebResourceHandler, status: number, text: string): void {
    const encodedBody = buffer.from(text, 'utf-8');
    const body = encodedBody.buffer.slice(
      encodedBody.byteOffset,
      encodedBody.byteOffset + encodedBody.length,
    ) as ArrayBuffer;
    const response = new webview.WebSchemeHandlerResponse();
    response.setNetErrorCode(WebNetErrorList.NET_OK);
    response.setStatus(status);
    response.setStatusText(status === 404 ? 'Not Found' : 'Bad Request');
    response.setMimeType('text/plain');
    response.setEncoding('utf-8');
    response.setHeaderByName('Content-Length', String(encodedBody.length), true);
    handler.didReceiveResponse(response);
    handler.didReceiveResponseBody(body);
    handler.didFinish();
  }

  build() {
    Web({ src: this.origin, controller: this.controller })
      .width('100%')
      .height('100%')
      .domStorageAccess(true)
      .onPermissionRequest((event) => {
        if (!event || this.permissionRequestPending) {
          event?.request.deny();
          return;
        }
        this.permissionRequestPending = true;
        const context = getContext(this) as common.UIAbilityContext;
        const permissionManager = abilityAccessCtrl.createAtManager();
        permissionManager.requestPermissionsFromUser(context, ['ohos.permission.MICROPHONE'])
          .then((result) => {
            if (result.authResults.length > 0 && result.authResults.every((status: number) => status === 0)) {
              event.request.grant(event.request.getAccessibleResource());
            } else {
              event.request.deny();
            }
          })
          .catch(() => event.request.deny())
          .finally(() => {
            this.permissionRequestPending = false;
          });
      })
      .onControllerAttached(() => this.attachHandler())
  }
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(value: string | undefined, length: number): ByteRange | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || length <= 0) return undefined;
  let start = match[1].length > 0 ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  let end = match[2].length > 0 && match[1].length > 0 ? Number(match[2]) : length - 1;
  if (start >= length || end < start) return undefined;
  end = Math.min(end, length - 1);
  return { start, end };
}

function mimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json') || path.endsWith('.webmanifest')) return 'application/json';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.opus')) return 'audio/ogg';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function isTextResource(path: string): boolean {
  return path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css') ||
    path.endsWith('.json') || path.endsWith('.webmanifest') || path.endsWith('.svg');
}