import Foundation

/// Simplified Leitner 3-box spaced repetition — port of packages/core/src/srs.ts.
///
/// Boxes:
///   - 1 → review today
///   - 2 → review tomorrow
///   - 3 → review in 3 days, then 7 days
///
/// Wrong answer demotes to box 1. Right answer promotes by one box.
enum SRS {
    static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func todayString(now: Date = Date()) -> String {
        dateFormatter.string(from: now)
    }

    static func dateString(daysFromNow days: Int, now: Date = Date()) -> String {
        let target = Calendar.current.date(byAdding: .day, value: days, to: now) ?? now
        return dateFormatter.string(from: target)
    }

    /// Apply a review result to an existing entry and return the updated copy.
    static func review(entry: MistakeEntry, isCorrect: Bool, now: Date = Date()) -> MistakeEntry {
        var next = entry
        next.lastReviewedAt = isoFormatter.string(from: now)

        if !isCorrect {
            next.box = 1
            next.correctCount = 0
            next.nextReviewDate = todayString(now: now)
            return next
        }

        next.correctCount = (entry.correctCount ?? 0) + 1
        let currentBox = entry.box ?? 1
        switch currentBox {
        case 1:
            next.box = 2
            next.nextReviewDate = dateString(daysFromNow: 1, now: now)
        case 2:
            next.box = 3
            next.nextReviewDate = dateString(daysFromNow: 3, now: now)
        default:
            next.box = 3
            next.nextReviewDate = dateString(daysFromNow: 7, now: now)
        }
        return next
    }

    /// Filter & sort entries that are due today.
    /// Lower box first; within a box, oldest `lastReviewedAt` (or `addedAt`) first.
    static func dueEntries(_ entries: [MistakeEntry], now: Date = Date()) -> [MistakeEntry] {
        let today = todayString(now: now)
        let due = entries.filter { e in
            guard let next = e.nextReviewDate else { return true }
            return next <= today
        }
        return due.sorted { a, b in
            let ba = a.box ?? 1
            let bb = b.box ?? 1
            if ba != bb { return ba < bb }
            let la = a.lastReviewedAt ?? a.addedAt
            let lb = b.lastReviewedAt ?? b.addedAt
            return la < lb
        }
    }

    /// Build a new mistake entry with default SRS scheduling fields.
    static func newEntry(
        lessonId: String,
        lessonTitle: String? = nil,
        question: Question,
        now: Date = Date()
    ) -> MistakeEntry {
        MistakeEntry(
            lessonId: lessonId,
            lessonTitle: lessonTitle,
            question: question,
            addedAt: isoFormatter.string(from: now),
            box: 1,
            correctCount: 0,
            lastReviewedAt: nil,
            nextReviewDate: todayString(now: now)
        )
    }
}
