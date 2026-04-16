import SwiftUI

/// Per-subject display config — port of packages/core/src/subjects.ts.
/// Tailwind classes from the web are dropped; iOS uses native SwiftUI Color.
struct SubjectConfig: Hashable {
    let id: SubjectId
    let label: String
    let accent: Color
    let accentDark: Color
}

enum Subjects {
    static let all: [SubjectId: SubjectConfig] = [
        .math: SubjectConfig(
            id: .math, label: "数学",
            accent: Color(red: 0.345, green: 0.800, blue: 0.008),    // #58CC02
            accentDark: Color(red: 0.345, green: 0.655, blue: 0)     // #58A700
        ),
        .chinese: SubjectConfig(
            id: .chinese, label: "语文",
            accent: Color(red: 1, green: 0.294, blue: 0.294),         // #FF4B4B
            accentDark: Color(red: 0.898, green: 0.282, blue: 0.302)  // #E5484D
        ),
        .english: SubjectConfig(
            id: .english, label: "英语",
            accent: Color(red: 0.110, green: 0.690, blue: 0.965),    // #1CB0F6
            accentDark: Color(red: 0.094, green: 0.600, blue: 0.839) // #1899D6
        ),
        .science: SubjectConfig(
            id: .science, label: "科学",
            accent: Color(red: 1, green: 0.698, blue: 0),             // #FFB200
            accentDark: Color(red: 0.898, green: 0.596, blue: 0)      // #E59800
        ),
    ]

    /// Old data may be missing `subject` — default to math, mirroring resolveSubject().
    static func resolve(book: Book) -> SubjectConfig {
        let id = book.subject ?? .math
        return all[id] ?? all[.math]!
    }

    static func resolve(_ id: SubjectId?) -> SubjectConfig {
        all[id ?? .math] ?? all[.math]!
    }
}
