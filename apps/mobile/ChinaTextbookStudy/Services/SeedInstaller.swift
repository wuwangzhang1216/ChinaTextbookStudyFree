import Foundation
import CryptoKit
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
        let cstfRoot = DataLoader.shared.sandboxDataRoot.deletingLastPathComponent()
        do {
            try install(zipURL: zipURL, cstfRoot: cstfRoot)
        } catch {
            // Existing books, audio and learning records remain available.
            print("[SeedInstaller] unzip failed: \(error)")
        }
    }

    /// Seed updates only add missing files. Downloaded textbooks, audio and
    /// receipts may share this tree and must survive an app/seed upgrade.
    /// Revised textbook contents use independent book IDs; explicit downloads
    /// handle replacements verified by their resource-manifest fingerprints.
    @discardableResult
    static func install(zipURL: URL, cstfRoot: URL) throws -> Bool {
        let fm = FileManager.default
        let bundledVersion = SHA256.hash(data: try Data(contentsOf: zipURL))
            .map { String(format: "%02x", $0) }.joined()
        try fm.createDirectory(at: cstfRoot, withIntermediateDirectories: true)
        let stampURL = cstfRoot.appendingPathComponent("seed-version.txt")
        if let stamped = try? String(contentsOf: stampURL, encoding: .utf8),
           stamped.trimmingCharacters(in: .whitespacesAndNewlines) == bundledVersion {
            return false
        }
        // Fully extract before touching installed files. A corrupt seed cannot
        // wipe a working offline book or leave a success stamp behind.
        let stage = cstfRoot.appendingPathComponent(".seed-install-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: stage) }
        try fm.unzipItem(at: zipURL, to: stage)
        guard let enumerator = fm.enumerator(at: stage, includingPropertiesForKeys: [.isRegularFileKey]) else {
            throw CocoaError(.fileReadUnknown)
        }
        for case let source as URL in enumerator {
            guard try source.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { continue }
            let relative = String(source.path.dropFirst(stage.path.count + 1))
            let destination = cstfRoot.appendingPathComponent(relative)
            if fm.fileExists(atPath: destination.path) { continue }
            try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            // Same-volume move publishes a complete extracted file atomically.
            try fm.moveItem(at: source, to: destination)
        }
        try bundledVersion.write(to: stampURL, atomically: true, encoding: .utf8)
        return true
    }
}
