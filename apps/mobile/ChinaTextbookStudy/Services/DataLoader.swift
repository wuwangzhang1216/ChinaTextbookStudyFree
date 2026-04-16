import Foundation

enum DataLoaderError: Error, LocalizedError {
    case seedIndexMissing
    case bookNotDownloaded(String)
    case lessonNotFound(String)

    var errorDescription: String? {
        switch self {
        case .seedIndexMissing:
            return "Bundle 内未找到 seed-index.json"
        case .bookNotDownloaded(let id):
            return "教材 \(id) 尚未下载"
        case .lessonNotFound(let id):
            return "课程 \(id) 不存在"
        }
    }
}

/// Reads the user-facing data layout that mirrors apps/web/public/data/.
///
/// Layout under sandbox `Application Support/cstf/data/`:
///
///     index.json
///     books/<bookId>/outline.json
///     books/<bookId>/passages.json   (optional)
///     books/<bookId>/stories.json    (optional)
///     books/<bookId>/lessons/<lessonId>.json
///
/// The same shape is used for the bundled seed (read-only) so that the
/// first launch can still display a bookshelf without network access.
final class DataLoader {
    static let shared = DataLoader()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    // MARK: - Sandbox roots

    /// `Application Support/cstf/data/`
    var sandboxDataRoot: URL {
        let fm = FileManager.default
        let base = (try? fm.url(for: .applicationSupportDirectory,
                                in: .userDomainMask,
                                appropriateFor: nil,
                                create: true)) ?? fm.temporaryDirectory
        return base.appendingPathComponent("cstf/data", isDirectory: true)
    }

    /// `Application Support/cstf/audio/`
    var sandboxAudioRoot: URL {
        sandboxDataRoot.deletingLastPathComponent().appendingPathComponent("audio", isDirectory: true)
    }

    // MARK: - Index

    /// Load the canonical SiteIndex, falling back to the bundled seed on first launch.
    func loadSiteIndex() throws -> SiteIndex {
        let sandboxIndex = sandboxDataRoot.appendingPathComponent("index.json")
        if FileManager.default.fileExists(atPath: sandboxIndex.path) {
            return try decode(SiteIndex.self, from: sandboxIndex)
        }
        return try loadSeedIndex()
    }

    /// Read the bundled seed index (offline bookshelf placeholder).
    func loadSeedIndex() throws -> SiteIndex {
        guard let url = Bundle.main.url(forResource: "seed-index", withExtension: "json") else {
            throw DataLoaderError.seedIndexMissing
        }
        return try decode(SiteIndex.self, from: url)
    }

    // MARK: - Book-scoped loads

    func loadOutline(bookId: String) throws -> Outline {
        let url = bookDir(bookId).appendingPathComponent("outline.json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw DataLoaderError.bookNotDownloaded(bookId)
        }
        return try decode(Outline.self, from: url)
    }

    func loadLesson(bookId: String, lessonId: String) throws -> Lesson {
        let url = bookDir(bookId)
            .appendingPathComponent("lessons", isDirectory: true)
            .appendingPathComponent("\(lessonId).json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw DataLoaderError.lessonNotFound(lessonId)
        }
        return try decode(Lesson.self, from: url)
    }

    func loadPassages(bookId: String) throws -> BookPassages? {
        let url = bookDir(bookId).appendingPathComponent("passages.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try decode(BookPassages.self, from: url)
    }

    func loadStories(bookId: String) throws -> BookStories? {
        let url = bookDir(bookId).appendingPathComponent("stories.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try decode(BookStories.self, from: url)
    }

    // MARK: - Helpers

    private func bookDir(_ bookId: String) -> URL {
        sandboxDataRoot
            .appendingPathComponent("books", isDirectory: true)
            .appendingPathComponent(bookId, isDirectory: true)
    }

    private func decode<T: Decodable>(_ type: T.Type, from url: URL) throws -> T {
        let data = try Data(contentsOf: url)
        return try decoder.decode(T.self, from: data)
    }
}
