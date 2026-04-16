import Foundation

/// Read/write JSON snapshots under `Application Support/cstf/`.
/// Used by ProgressStore (and any future per-user state).
enum PersistenceService {
    private static var root: URL {
        let fm = FileManager.default
        let base = (try? fm.url(for: .applicationSupportDirectory,
                                in: .userDomainMask,
                                appropriateFor: nil,
                                create: true)) ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("cstf", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func url(for filename: String) -> URL {
        root.appendingPathComponent(filename)
    }

    static func read<T: Decodable>(_ type: T.Type, from filename: String) -> T? {
        let url = url(for: filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func write<T: Encodable>(_ value: T, to filename: String) throws {
        let url = url(for: filename)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(value)
        try data.write(to: url, options: .atomic)
    }
}
