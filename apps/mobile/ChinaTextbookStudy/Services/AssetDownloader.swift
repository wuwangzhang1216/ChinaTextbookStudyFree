import Foundation
import CryptoKit
import ZIPFoundation

// MARK: - Manifest models

/// Per-bundle metadata (data zip OR audio zip).
struct ManifestBundle: Codable, Hashable {
    let name: String
    let bytes: Int64
    let sha256: String
}

/// One entry per book in `ios-manifest.json`.
struct ManifestEntry: Codable, Hashable, Identifiable {
    let bookId: String
    let audioRefCount: Int
    let data: ManifestBundle
    let audio: ManifestBundle

    var id: String { bookId }
}

/// Top-level shape produced by `scripts/package-release-ios.sh`.
struct IosManifest: Codable, Hashable {
    let generatedAt: String
    let aacBitrate: String
    let books: [ManifestEntry]
}

// MARK: - Errors

enum AssetDownloadError: Error, LocalizedError {
    case manifestUnavailable
    case sha256Mismatch(expected: String, actual: String, file: String)
    case unzipFailed(String)
    case httpStatus(Int)

    var errorDescription: String? {
        switch self {
        case .manifestUnavailable:
            return "无法获取资源 manifest，请检查网络后重试"
        case .sha256Mismatch(let exp, let act, let file):
            return "校验失败 \(file)：期望 \(exp.prefix(12))…，实际 \(act.prefix(12))…"
        case .unzipFailed(let msg):
            return "解压失败：\(msg)"
        case .httpStatus(let code):
            return "下载失败 HTTP \(code)"
        }
    }
}

// MARK: - Downloader

/// Downloads + verifies + unzips the per-book release bundles produced by
/// `scripts/package-release-ios.sh`. State machine is observable so SwiftUI
/// can drive a progress UI without polling.
@MainActor
final class AssetDownloader: ObservableObject {
    static let shared = AssetDownloader()

    /// GitHub Release base URL. Update this when cutting a new iOS asset tag.
    /// The script outputs files like `audio-ios-<bookId>.zip` + `data-<bookId>.zip` + `ios-manifest.json`.
    var releaseBaseURL = URL(string: "https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/download/v1.1.0-ios-assets")!

    @Published private(set) var manifest: IosManifest?
    @Published private(set) var bookProgress: [String: Double] = [:]   // bookId → 0...1
    @Published private(set) var inFlight: Set<String> = []
    @Published private(set) var lastError: String?

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 60
        cfg.timeoutIntervalForResource = 60 * 30
        return URLSession(configuration: cfg)
    }()

    /// Local destination roots — mirror what DataLoader expects.
    private var dataRoot: URL { DataLoader.shared.sandboxDataRoot }
    private var audioRoot: URL { DataLoader.shared.sandboxAudioRoot }

    // MARK: - Manifest

    /// Fetch the manifest from the GitHub Release. Caches it on disk so the
    /// app can render an offline list of books-already-downloaded later.
    @discardableResult
    func loadManifest() async throws -> IosManifest {
        let url = releaseBaseURL.appendingPathComponent("ios-manifest.json")
        let (data, resp) = try await session.data(from: url)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw AssetDownloadError.httpStatus((resp as? HTTPURLResponse)?.statusCode ?? -1)
        }
        let manifest = try JSONDecoder().decode(IosManifest.self, from: data)
        try? FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)
        try? data.write(to: cacheRoot.appendingPathComponent("ios-manifest.json"))
        self.manifest = manifest
        return manifest
    }

    /// Try to read a previously-cached manifest (offline launches).
    func loadCachedManifest() -> IosManifest? {
        let url = cacheRoot.appendingPathComponent("ios-manifest.json")
        guard let data = try? Data(contentsOf: url),
              let m = try? JSONDecoder().decode(IosManifest.self, from: data) else {
            return nil
        }
        self.manifest = m
        return m
    }

    // MARK: - Per-book download

    /// Whether a book's data zip has already been extracted locally.
    func isBookDownloaded(_ bookId: String) -> Bool {
        let outline = dataRoot
            .appendingPathComponent("books", isDirectory: true)
            .appendingPathComponent(bookId, isDirectory: true)
            .appendingPathComponent("outline.json")
        return FileManager.default.fileExists(atPath: outline.path)
    }

    /// Download both bundles for a book sequentially. Idempotent — if the
    /// data already exists and SHA matches, the download is skipped.
    func ensureBookDownloaded(_ entry: ManifestEntry) async throws {
        if inFlight.contains(entry.bookId) { return }
        inFlight.insert(entry.bookId)
        defer { inFlight.remove(entry.bookId) }
        bookProgress[entry.bookId] = 0

        do {
            try await downloadBundle(
                bundle: entry.data,
                extractTo: dataRoot,
                weight: 0.2,
                bookId: entry.bookId
            )
            try await downloadBundle(
                bundle: entry.audio,
                extractTo: audioRoot.deletingLastPathComponent(),  // zip already contains an `audio/` prefix
                weight: 0.8,
                bookId: entry.bookId
            )
            bookProgress[entry.bookId] = 1
            try? markExcludedFromBackup(dataRoot)
            try? markExcludedFromBackup(audioRoot)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
            throw error
        }
    }

    /// Stream-download a zip with progress, verify SHA-256, then unzip in place.
    private func downloadBundle(
        bundle: ManifestBundle,
        extractTo destination: URL,
        weight: Double,
        bookId: String
    ) async throws {
        let url = releaseBaseURL.appendingPathComponent(bundle.name)
        let (tempURL, resp) = try await session.download(from: url) { [weak self] received, expected in
            guard let self else { return }
            // expected may be -1 on chunked responses; fall back to manifest bytes
            let total = expected > 0 ? Double(expected) : Double(bundle.bytes)
            let frac = total > 0 ? Double(received) / total : 0
            Task { @MainActor in
                self.bookProgress[bookId] = (self.bookProgress[bookId] ?? 0) * (1 - weight) + frac * weight
            }
        }
        if let http = resp as? HTTPURLResponse, http.statusCode != 200 {
            throw AssetDownloadError.httpStatus(http.statusCode)
        }

        let actualSha = try sha256Hex(of: tempURL)
        guard actualSha == bundle.sha256 else {
            try? FileManager.default.removeItem(at: tempURL)
            throw AssetDownloadError.sha256Mismatch(expected: bundle.sha256, actual: actualSha, file: bundle.name)
        }

        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        do {
            try FileManager.default.unzipItem(at: tempURL, to: destination)
        } catch {
            throw AssetDownloadError.unzipFailed(String(describing: error))
        }
        try? FileManager.default.removeItem(at: tempURL)
    }

    // MARK: - Helpers

    private var cacheRoot: URL {
        dataRoot.deletingLastPathComponent()  // .../cstf/
    }

    private func sha256Hex(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while autoreleasepool(invoking: {
            let chunk = handle.readData(ofLength: 1 << 20)
            if chunk.isEmpty { return false }
            hasher.update(data: chunk)
            return true
        }) {}
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func markExcludedFromBackup(_ url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var u = url
        try u.setResourceValues(values)
    }
}

// MARK: - URLSession async download with progress

private extension URLSession {
    /// `download(from:)` with a progress callback. Wraps the delegate-based
    /// API in async/await so the call site stays clean.
    func download(
        from url: URL,
        progress: @escaping (Int64, Int64) -> Void
    ) async throws -> (URL, URLResponse) {
        try await withCheckedThrowingContinuation { cont in
            let task = self.downloadTask(with: url) { tmp, resp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let tmp, let resp else {
                    cont.resume(throwing: URLError(.badServerResponse)); return
                }
                // Move out of the system tmp dir before iOS reclaims it
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent("cstf-\(UUID().uuidString).zip")
                do {
                    try FileManager.default.moveItem(at: tmp, to: dest)
                    cont.resume(returning: (dest, resp))
                } catch {
                    cont.resume(throwing: error)
                }
            }
            let observation = task.progress.observe(\.fractionCompleted) { p, _ in
                progress(Int64(p.completedUnitCount), Int64(p.totalUnitCount))
            }
            // Keep the observation alive for the lifetime of the task
            objc_setAssociatedObject(task, &progressObservationKey, observation, .OBJC_ASSOCIATION_RETAIN)
            task.resume()
        }
    }
}

private var progressObservationKey: UInt8 = 0
