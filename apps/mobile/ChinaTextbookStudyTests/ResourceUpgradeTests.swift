import XCTest
import ZIPFoundation
@testable import ChinaTextbookStudy

final class ResourceUpgradeTests: XCTestCase {
    private func seedArchive(root: URL, name: String, files: [String: String]) throws -> URL {
        let source = root.appendingPathComponent(name)
        for (path, text) in files {
            let file = source.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file)
        }
        let archive = root.appendingPathComponent(name + ".zip")
        try FileManager.default.zipItem(at: source, to: archive, shouldKeepParent: false)
        return archive
    }

    private func seedFile(_ root: URL, _ path: String, _ text: String) throws {
        let file = root.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: file)
    }

    func testLegacySeedUpgradePreservesDownloadedBooksAudioReceiptsAndGrades() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let installed = root.appendingPathComponent("installed")
        let existing = ["data/books/g1up/outline.json": "downloaded original book",
                        "audio/aa/old.m4a": "downloaded audio",
                        "audio/.downloaded/g1up": "verified download receipt",
                        "progress.json": "existing stars and completed lessons",
                        "seed-version.txt": "1792859899"]
        for (path, text) in existing { try seedFile(installed, path, text) }
        let archive = try seedArchive(root: root, name: "seed", files: [
            "data/books/g1up/outline.json": "bundled demo must not replace downloaded book",
            "audio/bb/demo.m4a": "missing demo audio"])
        XCTAssertTrue(try SeedInstaller.install(zipURL: archive, cstfRoot: installed))
        for (path, text) in existing where path != "seed-version.txt" {
            XCTAssertEqual(try Data(contentsOf: installed.appendingPathComponent(path)), Data(text.utf8))
        }
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("audio/bb/demo.m4a"), encoding: .utf8), "missing demo audio")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("seed-version.txt"), encoding: .utf8).count, 64)
    }

    func testIdenticalSeedWithNewPackagingTimestampDoesNotReinstall() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let archive = try seedArchive(root: root, name: "seed", files: ["data/books/g1up/outline.json": "original"])
        let installed = root.appendingPathComponent("installed")
        XCTAssertTrue(try SeedInstaller.install(zipURL: archive, cstfRoot: installed))
        let stamp = try Data(contentsOf: installed.appendingPathComponent("seed-version.txt"))
        try fm.setAttributes([.modificationDate: Date(timeIntervalSince1970: 1_900_000_000)], ofItemAtPath: archive.path)
        XCTAssertFalse(try SeedInstaller.install(zipURL: archive, cstfRoot: installed))
        XCTAssertEqual(try Data(contentsOf: installed.appendingPathComponent("seed-version.txt")), stamp)
    }

    func testChangedSeedAddsIndependentBookAndKeepsOriginalResources() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let installed = root.appendingPathComponent("installed")
        let first = try seedArchive(root: root, name: "first", files: [
            "data/books/g1up/outline.json": "original book", "audio/aa/old.m4a": "original audio"])
        try SeedInstaller.install(zipURL: first, cstfRoot: installed)
        let previousStamp = try Data(contentsOf: installed.appendingPathComponent("seed-version.txt"))
        let next = try seedArchive(root: root, name: "next", files: [
            "data/books/g1up/outline.json": "replacement must be ignored",
            "data/books/g1up-54-qingdao/outline.json": "independent five-four book",
            "audio/bb/new.m4a": "new audio"])
        XCTAssertTrue(try SeedInstaller.install(zipURL: next, cstfRoot: installed))
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("data/books/g1up/outline.json"), encoding: .utf8), "original book")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("audio/aa/old.m4a"), encoding: .utf8), "original audio")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("data/books/g1up-54-qingdao/outline.json"), encoding: .utf8), "independent five-four book")
        XCTAssertNotEqual(try Data(contentsOf: installed.appendingPathComponent("seed-version.txt")), previousStamp)
    }

    func testCorruptSeedKeepsOldResourcesAndVersionStamp() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let installed = root.appendingPathComponent("installed")
        let existing = ["data/books/g1up/outline.json": "original book", "audio/aa/old.m4a": "original audio", "seed-version.txt": "legacy timestamp"]
        for (path, text) in existing { try seedFile(installed, path, text) }
        let corrupt = root.appendingPathComponent("corrupt.zip")
        try Data("not a zip".utf8).write(to: corrupt)
        XCTAssertThrowsError(try SeedInstaller.install(zipURL: corrupt, cstfRoot: installed))
        for (path, text) in existing {
            XCTAssertEqual(try Data(contentsOf: installed.appendingPathComponent(path)), Data(text.utf8))
        }
    }

    func testDataOnlyAndAudioOnlyUpdatesInvalidateTheInstalledReceipt() {
        func entry(_ data: String, _ audio: String) -> ManifestEntry {
            ManifestEntry(bookId: "chinese-g1up", audioRefCount: 1,
                data: ManifestBundle(name: "data.zip", bytes: 1, sha256: data),
                audio: ManifestBundle(name: "audio.zip", bytes: 1, sha256: audio))
        }
        let old = AssetDownloader.bundleFingerprint(entry("data-old", "audio-old"))
        XCTAssertNotEqual(old, AssetDownloader.bundleFingerprint(entry("data-new", "audio-old")))
        XCTAssertNotEqual(old, AssetDownloader.bundleFingerprint(entry("data-old", "audio-new")))
        XCTAssertEqual(old, AssetDownloader.bundleFingerprint(entry("data-old", "audio-old")))
    }

    func testArchiveUpgradeReplacesExistingResourcesAndPreservesOtherFiles() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let source = root.appendingPathComponent("source")
        let destination = root.appendingPathComponent("installed")
        try fm.createDirectory(at: source, withIntermediateDirectories: true)
        try fm.createDirectory(at: destination, withIntermediateDirectories: true)
        try Data("new lesson and pinyin paths".utf8).write(to: source.appendingPathComponent("lesson.json"))
        try Data("old lesson".utf8).write(to: destination.appendingPathComponent("lesson.json"))
        let progress = Data("existing completed grades".utf8)
        try progress.write(to: destination.appendingPathComponent("other-file.json"))
        let archive = root.appendingPathComponent("update.zip")
        try fm.zipItem(at: source, to: archive, shouldKeepParent: false)
        try AssetDownloader.installArchive(archive, destination: destination)
        XCTAssertEqual(try Data(contentsOf: destination.appendingPathComponent("lesson.json")), Data("new lesson and pinyin paths".utf8))
        XCTAssertEqual(try Data(contentsOf: destination.appendingPathComponent("other-file.json")), progress)
        // A repeated verified install is idempotent.
        try AssetDownloader.installArchive(archive, destination: destination)
        XCTAssertEqual(try Data(contentsOf: destination.appendingPathComponent("other-file.json")), progress)
    }

    func testCorruptArchiveDoesNotChangeInstalledResources() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("lesson.json")
        let original = Data("existing lesson".utf8)
        try original.write(to: file)
        let corrupt = root.appendingPathComponent("corrupt.zip")
        try Data("not a zip".utf8).write(to: corrupt)
        XCTAssertThrowsError(try AssetDownloader.installArchive(corrupt, destination: root))
        XCTAssertEqual(try Data(contentsOf: file), original)
    }
}
