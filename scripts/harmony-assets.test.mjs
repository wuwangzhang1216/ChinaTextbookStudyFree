import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadWorker(fileIo, zlib = {}) {
  const source = readFileSync(new URL("../apps/harmony/entry/src/main/ets/workers/assetWorker.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandbox = {
    exports: {},
    require(name) {
      if (name === "@kit.CoreFileKit") return { fileIo };
      if (name === "@kit.BasicServicesKit") return { zlib };
      if (name === "@kit.ArkTS") return { worker: { workerPort: { postMessage() {} } } };
      return {};
    },
  };
  vm.runInNewContext(outputText, sandbox);
  return sandbox;
}

test("fileExists preserves true and false access results and handles exceptions", () => {
  const worker = loadWorker({
    accessSync(filePath) {
      if (filePath === "/error") throw new Error("ENOENT");
      return filePath === "/present";
    },
  });
  assert.equal(worker.fileExists("/present"), true);
  assert.equal(worker.fileExists("/missing"), false);
  assert.equal(worker.fileExists("/error"), false);
});

test("removeIfExists only unlinks existing archives", () => {
  const removed = [];
  const worker = loadWorker({
    accessSync: (filePath) => filePath === "/present.zip",
    unlinkSync: (filePath) => removed.push(filePath),
  });
  worker.removeIfExists("/missing.zip");
  worker.removeIfExists("/present.zip");
  assert.deepEqual(removed, ["/present.zip"]);
});

test("makeDirectory propagates failure unless the directory already exists", () => {
  const mkdirError = new Error("permission denied");
  const worker = loadWorker({
    accessSync: (directory) => directory === "/existing",
    mkdirSync(_directory, recursive) {
      assert.equal(recursive, true);
      throw mkdirError;
    },
  });
  assert.doesNotThrow(() => worker.makeDirectory("/existing"));
  assert.throws(
    () => worker.makeDirectory("/missing"),
    (error) => error === mkdirError,
  );
});

test("a fresh install creates directories and downloads instead of skipping missing markers", async () => {
  const directories = [];
  const worker = loadWorker({
    accessSync: () => false,
    mkdirSync(directory, recursive) {
      assert.equal(recursive, true);
      directories.push(directory);
    },
    unlinkSync: () => assert.fail("must not unlink an absent archive"),
    openSync: () => assert.fail("must not write completion before downloading"),
  });
  const stopAfterDownload = new Error("download reached");
  const assetTag = "test-assets";
  const hash = "a".repeat(64);
  worker.downloadManifest = async () =>
    JSON.stringify({
      tag: assetTag,
      assets: [{ name: "data.zip", bytes: 10, sha256: hash }],
    });
  worker.sha256Text = async () => hash;
  worker.downloadArchive = async (_context, url, destination, name) => {
    assert.equal(url, "https://assets.example/data.zip");
    assert.equal(destination, "/files/cstf/staging/test-assets/data.zip");
    assert.equal(name, "data.zip");
    throw stopAfterDownload;
  };
  await assert.rejects(
    worker.installAssets({
      context: { filesDir: "/files" },
      assetBaseUrl: "https://assets.example",
      assetTag,
      manifestSha256: hash,
      allowInsecureHttp: false,
    }),
    (error) => error === stopAfterDownload,
  );
  assert.deepEqual(directories, ["/files/cstf", "/files/cstf/staging/test-assets", "/files/cstf/assets/test-assets"]);
});

test("ZIP extraction continues to use the directory-based API", async () => {
  const worker = loadWorker(
    {},
    {
      async decompressFile(archive, directory) {
        assert.equal(archive, "/staging/data.zip");
        assert.equal(directory, "/assets/data");
      },
    },
  );
  await worker.extractArchive("/staging/data.zip", "/assets/data", "data.zip");
});

test("retry reuses verified archives but downloads missing, incomplete or corrupt ones", async () => {
  for (const state of ["valid", "missing", "incomplete", "corrupt"]) {
    const calls = [];
    const hash = "a".repeat(64);
    const reachedExtraction = new Error("extract reached");
    const worker = loadWorker({
      accessSync: (filePath) => filePath.endsWith("data.zip") && state !== "missing",
      statSync: () => ({ size: state === "incomplete" ? 5 : 10 }),
      mkdirSync() {},
      unlinkSync: (filePath) => calls.push(["unlink", filePath]),
    });
    worker.downloadManifest = async () =>
      JSON.stringify({
        tag: "test-assets",
        assets: [{ name: "data.zip", bytes: 10, sha256: hash }],
      });
    worker.sha256Text = async () => hash;
    worker.sha256File = () => (state === "corrupt" ? "b".repeat(64) : hash);
    worker.downloadArchive = async () => {
      calls.push(["download"]);
      throw reachedExtraction;
    };
    worker.extractArchive = async () => {
      calls.push(["extract"]);
      throw reachedExtraction;
    };
    await assert.rejects(
      worker.installAssets({
        context: { filesDir: "/files" },
        assetBaseUrl: "https://assets.example",
        assetTag: "test-assets",
        manifestSha256: hash,
        allowInsecureHttp: false,
      }),
      (error) => error === reachedExtraction,
    );
    if (state === "valid") assert.deepEqual(calls, [["extract"]]);
    else assert.equal(calls.at(-1)[0], "download");
  }
});

test("gzip uses bounded reads, handles partial writes and closes both handles", async () => {
  const chunks = [Buffer.from("tar header"), Buffer.from("tar content")];
  const written = [];
  const closed = [];
  const worker = loadWorker(
    {
      OpenMode: { CREATE: 1, TRUNC: 2, WRITE_ONLY: 4 },
      openSync(filePath, mode) {
        assert.equal(filePath, "/staging/audio.tar");
        assert.equal(mode, 7);
        return { fd: 12 };
      },
      writeSync(descriptor, data) {
        assert.equal(descriptor, 12);
        const bytes = Buffer.from(data).subarray(0, 3);
        written.push(bytes);
        return bytes.length;
      },
      closeSync: (descriptor) => closed.push(descriptor),
    },
    {
      async createGZip() {
        return {
          async gzopen(filePath, mode) {
            assert.equal(filePath, "/staging/audio.tar.gz");
            assert.equal(mode, "rb");
          },
          async gzread(target) {
            assert.equal(target.byteLength, 1024 * 1024);
            const chunk = chunks.shift();
            if (!chunk) return 0;
            new Uint8Array(target).set(chunk);
            return chunk.length;
          },
          async gzclose() {
            closed.push("gzip");
            return 0;
          },
        };
      },
    },
  );
  await worker.decompressGzip("/staging/audio.tar.gz", "/staging/audio.tar");
  assert.equal(Buffer.concat(written).toString(), "tar headertar content");
  assert.deepEqual(closed, [12, "gzip"]);
});

test("gzip extraction cleans up the temporary TAR after success or failure", async () => {
  for (const failureStage of ["none", "gzip", "tar"]) {
    const calls = [];
    const failure = new Error(failureStage);
    const worker = loadWorker({
      accessSync: () => true,
      unlinkSync: (filePath) => calls.push(["unlink", filePath]),
    });
    worker.decompressGzip = async (archive, tarPath) => {
      calls.push(["gzip", archive, tarPath]);
      if (failureStage === "gzip") throw failure;
    };
    worker.extractTar = (tarPath, directory) => {
      calls.push(["tar", tarPath, directory]);
      if (failureStage === "tar") throw failure;
    };
    const extraction = worker.extractArchive("/staging/audio.tar.gz", "/assets/audio", "audio.tar.gz");
    if (failureStage === "none") await extraction;
    else await assert.rejects(extraction, (error) => error === failure);
    assert.deepEqual(calls[0], ["gzip", "/staging/audio.tar.gz", "/staging/audio.tar.gz.tar"]);
    assert.deepEqual(calls.at(-1), ["unlink", "/staging/audio.tar.gz.tar"]);
    assert.equal(
      calls.some((call) => call[0] === "tar"),
      failureStage !== "gzip",
    );
  }
});

test("gzip failures close acquired handles and do not report success", async () => {
  for (const failureStage of ["open", "read", "negative-read", "write", "close"]) {
    const closed = [];
    const worker = loadWorker(
      {
        OpenMode: { CREATE: 1, TRUNC: 2, WRITE_ONLY: 4 },
        openSync() {
          if (failureStage === "open") throw new Error("open failed");
          return { fd: 12 };
        },
        writeSync() {
          return 0;
        },
        closeSync: (descriptor) => closed.push(descriptor),
      },
      {
        async createGZip() {
          return {
            async gzopen() {},
            async gzread() {
              if (failureStage === "read") throw new Error("read failed");
              if (failureStage === "negative-read") return -1;
              return failureStage === "write" ? 1 : 0;
            },
            async gzclose() {
              closed.push("gzip");
              return failureStage === "close" ? -3 : 0;
            },
          };
        },
      },
    );
    await assert.rejects(worker.decompressGzip("/staging/audio.tar.gz", "/staging/audio.tar"));
    assert.deepEqual(closed, failureStage === "open" ? ["gzip"] : [12, "gzip"]);
  }
});
