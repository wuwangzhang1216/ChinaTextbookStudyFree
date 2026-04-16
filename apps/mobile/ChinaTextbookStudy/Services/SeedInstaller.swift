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
/// collision because the seed only ships a single book + the audio for one
/// of its lessons.
enum SeedInstaller {
    static func installIfNeeded() {
        guard let zipURL = Bundle.main.url(forResource: "seed-data", withExtension: "zip") else {
            return
        }
        // Parent of `data/` and `audio/` — i.e. `Application Support/cstf/`.
        let cstfRoot = DataLoader.shared.sandboxDataRoot.deletingLastPathComponent()
        let booksDir = DataLoader.shared.sandboxDataRoot.appendingPathComponent("books", isDirectory: true)
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
        // Wipe the audio dir before re-extracting — it's fully reproducible
        // from the zip and the downloader, so no risk of data loss.
        // Don't touch books/ here: it may contain user-downloaded books.
        let audioDir = cstfRoot.appendingPathComponent("audio", isDirectory: true)
        try? fm.removeItem(at: audioDir)
        // Same for the seed book's data subtree (we'll re-extract a fresh copy).
        try? fm.removeItem(at: booksDir.appendingPathComponent("g1up", isDirectory: true))

        do {
            try fm.unzipItem(at: zipURL, to: cstfRoot)
            try? bundledVersion.write(to: stampURL, atomically: true, encoding: .utf8)
        } catch {
            // Non-fatal: the user can still download books normally.
            print("[SeedInstaller] unzip failed: \(error)")
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
