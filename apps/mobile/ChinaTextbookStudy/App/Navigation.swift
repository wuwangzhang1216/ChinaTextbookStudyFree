import Foundation

/// All push destinations used by the root NavigationStack. Adding a new screen
/// is a one-line edit here + a `case` in `RootView.navigationDestination`.
enum AppRoute: Hashable {
    case gradePicker
    case bookList(grade: Int)
    case bookDetail(bookId: String)
    case lesson(bookId: String, lessonId: String)
    case lessonResult(LessonRunResult)
    case review
    case reviewRunner
    case achievements
    case stories(bookId: String)
    case storyReader(bookId: String, storyId: String)
    case reading(bookId: String)
    case passageReader(bookId: String, passageId: String)
}

/// Snapshot pushed onto the navigation stack after a lesson finishes.
struct LessonRunResult: Hashable {
    let bookId: String
    let lessonId: String
    let lessonTitle: String
    let questionCount: Int
    let correctCount: Int
    var accuracy: Double {
        guard questionCount > 0 else { return 0 }
        return Double(correctCount) / Double(questionCount)
    }
    var stars: Int {
        switch accuracy {
        case 0.95...: return 3
        case 0.80...: return 2
        default:      return 1
        }
    }
}
