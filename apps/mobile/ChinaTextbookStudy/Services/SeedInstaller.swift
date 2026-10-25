import Foundation
import ZIPFoundation

/// On first launch, unzip the bundled `seed-data.zip` into the sandbox so the
/// app can demo the full lesson loop *with audio* without hitting GitHub Releases.
///
/// The zip is built by `scripts/build-seed-zip.sh` and contains:
///
///     data/books/<id>/...      → unzipped under `cstf/data/books/<id>/`
///     audio/<xx>/<sha>.m4a     → unzipped under `cstf/audio/<xx>/<sha>.m4a`
///
/// Both subtrees are siblings of `cstf/`, matching what AssetDownloader writes
/// for downloaded books. Already-downloaded books overlay the seed without
/// collision. The seed includes the legacy and current grade-one math books,
/// plus their first-lesson audio; downloaded bundles remain authoritative.
enum SeedInstaller {
    static func installIfNeeded() {
        guard let zipURL = Bundle.main.url(forResource: "seed-data", withExtension: "zip") else {
            return
        }
        // Parent of `data/` and `audio/` — i.e. `Application Support/cstf/`.
        let cstfRoot = DataLoader.shared.sandboxDataRoot.deletingLastPathComponent()
        let fm = FileManager.default
        try? fm.createDirectory(at: cstfRoot, withIntermediateDirectories: true)

        // Skip if the seed has already been installed at the current bundled
        // version. The version stamp lives in `cstf/seed-version.txt` so seed
        // upgrades (e.g. swapping the bundled book or re-encoding audio) take
        // effect on the next launch without needing the user to wipe the app.
        let stampURL = cstfRoot.appendingPathComponent("seed-version.txt")
        let bundledVersion = Self.currentBundledVersion(zipURL: zipURL)
        if let stamped = try? String(contentsOf: stampURL, encoding: .utf8),
           stamped.trimmingCharacters(in: .whitespacesAndNewlines) == bundledVersion {
            return
        }
        let staging = fm.temporaryDirectory.appendingPathComponent("congcong-seed-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: staging) }
        do {
            try fm.createDirectory(at: staging, withIntermediateDirectories: true)
            try fm.unzipItem(at: zipURL, to: staging)
            try mergeExtractedSeed(from: staging, into: cstfRoot)
            try? bundledVersion.write(to: stampURL, atomically: true, encoding: .utf8)
        } catch {
            // Non-fatal: the user can still download books normally.
            print("[SeedInstaller] unzip failed: \(error)")
        }
    }

    /// A UI/seed upgrade must not erase books or AAC already downloaded by
    /// a family. Replace only bundled book data without a download marker;
    /// content-addressed audio can be copied only when absent.
    static func mergeExtractedSeed(from staging: URL, into root: URL) throws {
        let fm = FileManager.default
        let sourceBooks = staging.appendingPathComponent("data/books", isDirectory: true)
        let targetBooks = root.appendingPathComponent("data/books", isDirectory: true)
        try fm.createDirectory(at: targetBooks, withIntermediateDirectories: true)
        if fm.fileExists(atPath: sourceBooks.path) {
            for source in try fm.contentsOfDirectory(at: sourceBooks, includingPropertiesForKeys: nil) {
                let marker = root.appendingPathComponent("audio/.downloaded/\(source.lastPathComponent)")
                guard !fm.fileExists(atPath: marker.path) else { continue }
                let destination = targetBooks.appendingPathComponent(source.lastPathComponent)
                if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
                try fm.copyItem(at: source, to: destination)
            }
        }
        let sourceAudio = staging.appendingPathComponent("audio", isDirectory: true)
        guard let files = fm.enumerator(at: sourceAudio, includingPropertiesForKeys: [.isRegularFileKey]) else { return }
        for case let file as URL in files {
            guard try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { continue }
            let relative = String(file.path.dropFirst(sourceAudio.path.count + 1))
            let destination = root.appendingPathComponent("audio/\(relative)")
            guard !fm.fileExists(atPath: destination.path) else { continue }
            try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try fm.copyItem(at: file, to: destination)
        }
    }

    /// Version derived from the bundled zip's mtime. Re-runs trigger a refresh
    /// whenever the developer rebuilds the seed via `scripts/build-seed-zip.sh`.
    private static func currentBundledVersion(zipURL: URL) -> String {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: zipURL.path),
           let date = attrs[.modificationDate] as? Date {
            return "\(Int(date.timeIntervalSince1970))"
        }
        return "unknown"
    }
}
