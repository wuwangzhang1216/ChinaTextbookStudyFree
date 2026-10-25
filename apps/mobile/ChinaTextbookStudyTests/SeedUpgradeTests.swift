import XCTest
@testable import ChinaTextbookStudy

final class SeedUpgradeTests: XCTestCase {
    func testSeedUpgradePreservesDownloadedBooksAndAudio() throws {
        let fm = FileManager.default
        let testRoot = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: testRoot) }
        let installed = testRoot.appendingPathComponent("installed")
        let staged = testRoot.appendingPathComponent("staged")
        func write(_ text: String, root: URL, path: String) throws {
            let file = root.appendingPathComponent(path)
            try fm.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file)
        }
        try write("downloaded-content", root: installed, path: "data/books/g1up/outline.json")
        try write("manifest-sha", root: installed, path: "audio/.downloaded/g1up")
        try write("other-book-audio", root: installed, path: "audio/ab/existing.m4a")
        try write("older-seed", root: staged, path: "data/books/g1up/outline.json")
        try write("revised-book", root: staged, path: "data/books/g1up-2026/outline.json")
        try write("new-seed-audio", root: staged, path: "audio/cd/new.m4a")
        try SeedInstaller.mergeExtractedSeed(from: staged, into: installed)
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("data/books/g1up/outline.json")), "downloaded-content")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("audio/ab/existing.m4a")), "other-book-audio")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("data/books/g1up-2026/outline.json")), "revised-book")
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("audio/cd/new.m4a")), "new-seed-audio")
        // A repeated merge is safe and does not require clearing the cache.
        try SeedInstaller.mergeExtractedSeed(from: staged, into: installed)
        XCTAssertEqual(try String(contentsOf: installed.appendingPathComponent("audio/ab/existing.m4a")), "other-book-audio")
    }
}
