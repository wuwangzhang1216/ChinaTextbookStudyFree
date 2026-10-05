import { common } from "@kit.AbilityKit";
import { cryptoFramework } from "@kit.CryptoArchitectureKit";
import { fileIo } from "@kit.CoreFileKit";
import { request, zlib } from "@kit.BasicServicesKit";
import { http } from "@kit.NetworkKit";
import { buffer, MessageEvents, worker } from "@kit.ArkTS";

interface WorkerInput {
  context: common.UIAbilityContext;
  assetBaseUrl: string;
  assetTag: string;
  manifestSha256: string;
  allowInsecureHttp: boolean;
}

interface ReleaseAsset {
  name: string;
  bytes: number;
  sha256: string;
}

interface ReleaseManifest {
  tag: string;
  assets: ReleaseAsset[];
}

interface PackageSpec {
  name: string;
  directory: string;
}

const PACKAGES: PackageSpec[] = [
  { name: "data.zip", directory: "data" },
  { name: "story-images.zip", directory: "story-images" },
  { name: "textbook-pages.zip", directory: "textbook-pages" },
  { name: "audio.tar.gz", directory: "audio" },
];
const workerPort = worker.workerPort;

workerPort.onmessage = async (event: MessageEvents): Promise<void> => {
  const input = event.data as WorkerInput;
  try {
    await installAssets(input);
    workerPort.postMessage({ type: "complete" });
  } catch (error) {
    workerPort.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

async function installAssets(input: WorkerInput): Promise<void> {
  const baseUrl = normalizeBaseUrl(input.assetBaseUrl, input.allowInsecureHttp);
  const manifest = await downloadManifest(baseUrl);
  const manifestHash = await sha256Text(manifest);
  if (manifestHash !== input.manifestSha256) {
    throw new Error("资源清单校验失败，请检查下载地址或资源版本。");
  }

  const parsed = JSON.parse(manifest) as ReleaseManifest;
  if (parsed.tag !== input.assetTag) {
    throw new Error(`资源版本不匹配：期望 ${input.assetTag}，收到 ${parsed.tag}。`);
  }

  const context = input.context;
  const root = `${context.filesDir}/cstf`;
  const staging = `${root}/staging/${input.assetTag}`;
  const installedRoot = `${root}/assets/${input.assetTag}`;
  const markerDir = `${root}/.installed/${input.assetTag}`;
  makeDirectory(root);
  makeDirectory(staging);
  makeDirectory(installedRoot);

  let completedBytes = 0;
  const totalBytes = PACKAGES.reduce((sum: number, spec: PackageSpec) => {
    const asset = parsed.assets.find((candidate: ReleaseAsset) => candidate.name === spec.name);
    return sum + (asset?.bytes ?? 0);
  }, 0);

  for (const spec of PACKAGES) {
    const asset = parsed.assets.find((candidate: ReleaseAsset) => candidate.name === spec.name);
    if (!asset || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error(`资源清单缺少有效的 ${spec.name} 信息。`);
    }

    const marker = `${markerDir}/${spec.name}.complete`;
    if (fileExists(marker)) {
      completedBytes += asset.bytes;
      workerPort.postMessage({ type: "progress", assetName: spec.name, fraction: completedBytes / totalBytes });
      continue;
    }

    const archivePath = `${staging}/${spec.name}`;
    workerPort.postMessage({ type: "progress", assetName: `${spec.name} 校验中`, fraction: completedBytes / totalBytes });
    const reusable =
      fileExists(archivePath) &&
      fileIo.statSync(archivePath).size === asset.bytes &&
      sha256File(archivePath) === asset.sha256.toLowerCase();
    if (!reusable) {
      removeIfExists(archivePath);
      await downloadArchive(
        context,
        `${baseUrl}/${encodeURIComponent(spec.name)}`,
        archivePath,
        spec.name,
        completedBytes,
        totalBytes,
        asset.bytes,
      );

      const actualSize = fileIo.statSync(archivePath).size;
      if (actualSize !== asset.bytes) {
        removeIfExists(archivePath);
        throw new Error(`${spec.name} 大小不匹配，请重试下载。`);
      }

      const actualHash = sha256File(archivePath);
      if (actualHash !== asset.sha256.toLowerCase()) {
        removeIfExists(archivePath);
        throw new Error(`${spec.name} SHA-256 校验失败，请重试下载。`);
      }
    }

    const targetDirectory = `${installedRoot}/${spec.directory}`;
    makeDirectory(targetDirectory);
    workerPort.postMessage({
      type: "progress",
      assetName: `${spec.name} 解压中`,
      fraction: (completedBytes + asset.bytes) / totalBytes,
    });
    await extractArchive(archivePath, targetDirectory, spec.name);
    removeIfExists(archivePath);
    makeDirectory(markerDir);
    writeTextFile(marker, asset.sha256.toLowerCase());
    completedBytes += asset.bytes;
    workerPort.postMessage({ type: "progress", assetName: spec.name, fraction: completedBytes / totalBytes });
  }

  writeTextFile(`${markerDir}/complete`, input.assetTag);
}

function normalizeBaseUrl(value: string, allowInsecureHttp: boolean): string {
  const normalized = value.trim().replace(/\/+$/, "");
  const match = /^(https?):\/\/([^\/:?#@]+)(?::[0-9]{1,5})?(?:\/[^?#]*)?$/i.exec(normalized);
  if (!match) throw new Error("资源下载地址无效。");
  const scheme = match[1].toLowerCase();
  const hostname = match[2].toLowerCase();
  if (scheme !== "https" && !(allowInsecureHttp && scheme === "http")) {
    throw new Error("资源下载地址必须使用 HTTPS。");
  }
  if (scheme === "http" && !isPrivateIPv4(hostname)) {
    throw new Error("测试模式下的 HTTP 地址只能指向本机或私有局域网 IPv4 地址。");
  }
  return normalized;
}

function isPrivateIPv4(host: string): boolean {
  const octets = host.split(".").map((part: string) => Number(part));
  if (octets.length !== 4 || octets.some((part: number) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

async function downloadManifest(baseUrl: string): Promise<string> {
  const client = http.createHttp();
  try {
    const response = await client.request(`${baseUrl}/manifest.json`, {
      method: http.RequestMethod.GET,
      connectTimeout: 30000,
      readTimeout: 60000,
      expectDataType: http.HttpDataType.STRING,
    });
    if (response.responseCode < 200 || response.responseCode >= 300 || typeof response.result !== "string") {
      throw new Error(`无法获取资源清单（HTTP ${response.responseCode}）。`);
    }
    return response.result;
  } finally {
    client.destroy();
  }
}

async function downloadArchive(
  context: common.UIAbilityContext,
  url: string,
  destination: string,
  assetName: string,
  completedBytes: number,
  totalBytes: number,
  assetBytes: number,
): Promise<void> {
  const task = await request.downloadFile(context, { url, filePath: destination });
  await new Promise<void>((resolve, reject) => {
    task.on("progress", (received: number, _total: number) => {
      const fraction = totalBytes === 0 ? 0 : (completedBytes + Math.min(received, assetBytes)) / totalBytes;
      workerPort.postMessage({ type: "progress", assetName, fraction });
    });
    task.on("complete", () => resolve());
    task.on("fail", (error) => reject(new Error(`${assetName} 下载失败：${JSON.stringify(error)}`)));
  });
}

async function extractArchive(archivePath: string, targetDirectory: string, assetName: string): Promise<void> {
  if (assetName.endsWith(".zip")) {
    await zlib.decompressFile(archivePath, targetDirectory, {});
    return;
  }

  const tarPath = `${archivePath}.tar`;
  try {
    await decompressGzip(archivePath, tarPath);
    extractTar(tarPath, targetDirectory);
  } finally {
    removeIfExists(tarPath);
  }
}

async function decompressGzip(archivePath: string, tarPath: string): Promise<void> {
  const gzip = await zlib.createGZip();
  await gzip.gzopen(archivePath, "rb");
  try {
    const output = fileIo.openSync(tarPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
    try {
      const chunk = new ArrayBuffer(1024 * 1024);
      while (true) {
        const bytesRead = await gzip.gzread(chunk);
        if (bytesRead < 0) throw new Error("音频 gzip 归档解压失败。");
        if (bytesRead === 0) break;
        let written = 0;
        while (written < bytesRead) {
          const bytesWritten = fileIo.writeSync(output.fd, chunk.slice(written, bytesRead));
          if (bytesWritten <= 0) throw new Error("音频临时文件写入失败。");
          written += bytesWritten;
        }
      }
    } finally {
      fileIo.closeSync(output.fd);
    }
  } finally {
    const result = await gzip.gzclose();
    if (result !== 0) throw new Error("音频 gzip 归档不完整或已损坏。");
  }
}

function extractTar(tarPath: string, targetDirectory: string): void {
  const tar = fileIo.openSync(tarPath, fileIo.OpenMode.READ_ONLY);
  let position = 0;
  try {
    const header = new ArrayBuffer(512);
    while (true) {
      const headerRead = fileIo.readSync(tar.fd, header, { offset: position, length: 512 });
      if (headerRead === 0) break;
      if (headerRead !== 512) throw new Error("音频归档损坏（tar header 不完整）。");
      position += 512;

      const bytes = new Uint8Array(header);
      if (bytes.every((byte: number) => byte === 0)) break;
      const name = tarText(bytes, 0, 100);
      const prefix = tarText(bytes, 345, 155);
      const relativePath = normalizeTarPath(prefix.length > 0 ? `${prefix}/${name}` : name);
      const size = parseTarOctal(bytes, 124, 12);
      const type = String.fromCharCode(bytes[156]);
      const pathParts = relativePath.split("/");
      if (pathParts[0] === "audio") pathParts.shift();
      if (pathParts.length === 0 && type === "5") continue;
      const outputPath = `${targetDirectory}/${pathParts.join("/")}`;

      if (type === "5") {
        makeDirectory(outputPath);
      } else if (type === "\u0000" || type === "0") {
        if (pathParts.length === 0) throw new Error("音频归档包含空文件路径。");
        const parent = outputPath.slice(0, outputPath.lastIndexOf("/"));
        makeDirectory(parent);
        extractTarFile(tar, outputPath, position, size);
      } else if (type !== "x" && type !== "g") {
        throw new Error(`音频归档包含不支持的文件类型：${relativePath}`);
      }

      position += Math.ceil(size / 512) * 512;
    }
  } finally {
    fileIo.closeSync(tar.fd);
  }
}

function extractTarFile(tar: fileIo.File, outputPath: string, start: number, size: number): void {
  const output = fileIo.openSync(outputPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
  const bufferSize = 1024 * 1024;
  let copied = 0;
  try {
    while (copied < size) {
      const chunkSize = Math.min(bufferSize, size - copied);
      const chunk = new ArrayBuffer(chunkSize);
      const read = fileIo.readSync(tar.fd, chunk, { offset: start + copied, length: chunkSize });
      if (read <= 0) throw new Error(`音频归档文件截断：${outputPath}`);
      fileIo.writeSync(output.fd, chunk, { length: read });
      copied += read;
    }
  } finally {
    fileIo.closeSync(output.fd);
  }
}

function normalizeTarPath(value: string): string {
  const parts = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part: string) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.some((part: string) => part === ".." || part.includes(":"))) {
    throw new Error("音频归档包含非法路径。");
  }
  return parts.join("/");
}

function tarText(bytes: Uint8Array, start: number, length: number): string {
  let result = "";
  for (let index = start; index < start + length && bytes[index] !== 0; index++) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

function parseTarOctal(bytes: Uint8Array, start: number, length: number): number {
  const text = tarText(bytes, start, length).trim();
  if (!/^[0-7]*$/.test(text)) throw new Error("音频归档包含非法文件大小。");
  return text.length === 0 ? 0 : parseInt(text, 8);
}

async function sha256Text(value: string): Promise<string> {
  const encoded = buffer.from(value, "utf-8");
  const data = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index++) {
    data[index] = encoded[index];
  }
  const digest = cryptoFramework.createMd("SHA256");
  await digest.update({ data });
  return bytesToHex((await digest.digest()).data);
}

function writeTextFile(filePath: string, value: string): void {
  const file = fileIo.openSync(filePath, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
  try {
    fileIo.writeSync(file.fd, value);
  } finally {
    fileIo.closeSync(file.fd);
  }
}

function sha256File(filePath: string): string {
  const file = fileIo.openSync(filePath, fileIo.OpenMode.READ_ONLY);
  const digest = cryptoFramework.createMd("SHA256");
  const fileSize = fileIo.statSync(filePath).size;
  const chunkSize = 1024 * 1024;
  let position = 0;
  try {
    while (position < fileSize) {
      const length = Math.min(chunkSize, fileSize - position);
      const chunk = new ArrayBuffer(length);
      const read = fileIo.readSync(file.fd, chunk, { offset: position, length });
      if (read <= 0) throw new Error(`读取校验文件失败：${filePath}`);
      digest.updateSync({ data: new Uint8Array(chunk, 0, read) });
      position += read;
    }
    return bytesToHex(digest.digestSync().data);
  } finally {
    fileIo.closeSync(file.fd);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte: number) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeDirectory(directory: string): void {
  try {
    fileIo.mkdirSync(directory, true);
  } catch (error) {
    if (!fileExists(directory)) throw error;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fileIo.accessSync(filePath);
  } catch (_error) {
    return false;
  }
}

function removeIfExists(filePath: string): void {
  if (fileExists(filePath)) fileIo.unlinkSync(filePath);
}
