import Foundation
import Combine

/// User progress store — port of apps/web/src/store/progress.ts (subset).
///
/// State is persisted to `Application Support/cstf/progress.json` after every
/// mutation. Achievements / cosmetics / hearts are not yet wired — only the
/// subset that the core learning loop needs:
///   - xp, streak, lastActiveDate
///   - completedLessons (keyed by lessonId)
///   - mistakesBank (SRS-augmented)
@MainActor
final class ProgressStore: ObservableObject {
    static let shared = ProgressStore()

    @Published private(set) var progress: UserProgress

    /// Currently selected grade for the home screen (1-6, 0 = none picked yet).
    @Published var selectedGrade: Int

    private static let progressFile = "progress.json"
    private static let prefsFile = "prefs.json"

    private struct Prefs: Codable {
        var selectedGrade: Int
    }

    init() {
        if let restored = PersistenceService.read(UserProgress.self, from: Self.progressFile) {
            self.progress = restored
        } else {
            self.progress = UserProgress(
                xp: 0,
                streak: 0,
                lastActiveDate: "",
                completedLessons: [:],
                mistakesBank: []
            )
        }
        if let prefs = PersistenceService.read(Prefs.self, from: Self.prefsFile) {
            self.selectedGrade = prefs.selectedGrade
        } else {
            self.selectedGrade = 0
        }
    }

    // MARK: - Mutations

    /// Award XP + record the result for a finished lesson.
    /// Stars are derived from accuracy: ≥0.95 → 3, ≥0.80 → 2, else 1.
    func completeLesson(
        lessonId: String,
        accuracy: Double,
        questionCount: Int,
        now: Date = Date()
    ) {
        let stars: Int
        switch accuracy {
        case 0.95...:  stars = 3
        case 0.80...:  stars = 2
        default:       stars = 1
        }
        // 10 XP per question, doubled for a 3-star clear
        let baseXp = questionCount * 10
        let bonus = stars == 3 ? baseXp : 0
        let xpGain = baseXp + bonus

        let result = LessonResult(
            lessonId: lessonId,
            stars: stars,
            accuracy: accuracy,
            completedAt: ISO8601DateFormatter().string(from: now)
        )

        var p = progress
        p.xp += xpGain
        // Take the best result so a re-run can only improve stars.
        if let prior = p.completedLessons[lessonId] {
            if stars >= prior.stars { p.completedLessons[lessonId] = result }
        } else {
            p.completedLessons[lessonId] = result
        }
        bumpStreak(&p, now: now)
        progress = p
        save()
    }

    /// Add a mistaken question to the SRS bank if it isn't already there.
    func recordMistake(lessonId: String, lessonTitle: String?, question: Question, now: Date = Date()) {
        var p = progress
        let exists = p.mistakesBank.contains { $0.lessonId == lessonId && $0.question.id == question.id }
        if !exists {
            p.mistakesBank.append(SRS.newEntry(
                lessonId: lessonId,
                lessonTitle: lessonTitle,
                question: question,
                now: now
            ))
        }
        progress = p
        save()
    }

    /// Apply a review result against the SRS bank. Removes the entry once it
    /// reaches box 3 with at least 2 correct reviews (graduated).
    func reviewMistake(lessonId: String, questionId: Int, isCorrect: Bool, now: Date = Date()) {
        var p = progress
        guard let idx = p.mistakesBank.firstIndex(where: {
            $0.lessonId == lessonId && $0.question.id == questionId
        }) else { return }
        let updated = SRS.review(entry: p.mistakesBank[idx], isCorrect: isCorrect, now: now)
        if (updated.box ?? 1) >= 3 && (updated.correctCount ?? 0) >= 2 {
            p.mistakesBank.remove(at: idx)
        } else {
            p.mistakesBank[idx] = updated
        }
        progress = p
        save()
    }

    /// Persist the user's selected grade preference.
    func setSelectedGrade(_ grade: Int) {
        selectedGrade = grade
        try? PersistenceService.write(Prefs(selectedGrade: grade), to: Self.prefsFile)
    }

    // MARK: - Queries

    func isLessonCompleted(_ lessonId: String) -> Bool {
        progress.completedLessons[lessonId] != nil
    }

    func stars(for lessonId: String) -> Int? {
        progress.completedLessons[lessonId]?.stars
    }

    var totalCompletedLessons: Int { progress.completedLessons.count }
    var perfectedLessonCount: Int { progress.completedLessons.values.filter { $0.stars == 3 }.count }

    /// Snapshot used by Achievements.unlockedIds / newlyUnlocked.
    /// `lifetimeGems` and `ownedCosmeticCount` stay at 0 until Phase X wires
    /// up a Shop — locked shop achievements are the correct state for now.
    var achievementSnapshot: AchievementProgressSnapshot {
        AchievementProgressSnapshot(
            xp: progress.xp,
            streak: progress.streak,
            lifetimeGems: 0,
            completedLessonCount: totalCompletedLessons,
            perfectedLessonCount: perfectedLessonCount,
            ownedCosmeticCount: 3,  // 3 starter items, treated as unowned for the "first cosmetic" achievement
            reviewedMistakeCount: progress.mistakesBank.filter { ($0.correctCount ?? 0) > 0 }.count
        )
    }

    /// Mistakes the SRS scheduler thinks are due for review today.
    var dueMistakes: [MistakeEntry] {
        SRS.dueEntries(progress.mistakesBank)
    }

    // MARK: - Internal

    private func bumpStreak(_ p: inout UserProgress, now: Date) {
        let today = SRS.todayString(now: now)
        if p.lastActiveDate == today { return }
        let yesterday = SRS.dateString(daysFromNow: -1, now: now)
        if p.lastActiveDate == yesterday {
            p.streak += 1
        } else if p.lastActiveDate.isEmpty {
            p.streak = 1
        } else {
            // Gap of >1 day → streak resets but counts today.
            p.streak = 1
        }
        p.lastActiveDate = today
    }

    private func save() {
        try? PersistenceService.write(progress, to: Self.progressFile)
    }
}
