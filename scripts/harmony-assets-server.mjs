import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/web/public");
const port = Number(process.env.HARMONY_ASSET_PORT ?? 8787);
const expectedManifestHash = "fa6aa87ccb585136965bbc6fbb71a69ea8118ba1b3eed4067202ce71bc4ddbd7";
const assetNames = new Set(["manifest.json", "data.zip", "audio.tar.gz", "story-images.zip", "textbook-pages.zip"]);

async function validateAssets() {
  const manifestPath = path.join(root, "manifest.json");
  await access(manifestPath);
  const manifestBytes = await readFile(manifestPath);
  const hash = createHash("sha256").update(manifestBytes).digest("hex");
  if (hash !== expectedManifestHash) {
    throw new Error(`本机 manifest SHA-256 不匹配：${hash}`);
  }

  for (const name of assetNames) {
    if (name === "manifest.json") continue;
    const filePath = path.join(root, name);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`资源不是普通文件：${filePath}`);
  }
}

function contentType(name) {
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".tar.gz")) return "application/gzip";
  if (name.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const rawPath = (request.url ?? "/").split("?", 1)[0];
  let name;
  try {
    const pathname = decodeURIComponent(rawPath);
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length !== 1 || rawPath.includes("%") || pathname.includes("\\")) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad path");
      return;
    }
    name = parts[0];
  } catch (_error) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad path");
    return;
  }
  if (!assetNames.has(name)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  try {
    const filePath = path.join(root, name);
    const info = await stat(filePath);
    response.writeHead(200, {
      "Content-Length": info.size,
      "Content-Type": contentType(name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch (_error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Asset unavailable");
  }
});

try {
  await validateAssets();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Harmony 资源测试服务器监听端口 ${port}`);
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === "IPv4" && !address.internal) {
          console.log(`资源地址：http://${address.address}:${port}`);
        }
      }
    }
    console.log(`资源目录：${root}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
