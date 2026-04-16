import XCTest
@testable import ChinaTextbookStudy

private func q(
    type: QuestionType,
    answer: String,
    options: [String] = []
) -> Question {
    Question(
        id: 1,
        type: type,
        score: 10,
        difficulty: 1,
        knowledgePoint: "test",
        question: "q",
        options: options,
        answer: answer,
        explanation: "",
        audio: nil
    )
}

// MARK: - Grade

final class GradeTests: XCTestCase {
    func testTrueFalseTolerantSynonyms() {
        let qq = q(type: .trueFalse, answer: "对")
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "对"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "正确"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "true"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "✓"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "错"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "no"))
    }

    func testChoiceLetterAndContent() {
        let qq = q(type: .choice, answer: "B",
                   options: ["A. 苹果", "B. 香蕉", "C. 樱桃", "D. 西瓜"])
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "B"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "b"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "A"))
    }

    func testChoiceWithContentAnswer() {
        // answer is the option text, not a letter
        let qq = q(type: .choice, answer: "香蕉",
                   options: ["A. 苹果", "B. 香蕉", "C. 樱桃", "D. 西瓜"])
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "B"))
    }

    func testFillBlankNumeric() {
        let qq = q(type: .fillBlank, answer: "12")
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "12"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: " 12 "))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "012"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "13"))
    }

    func testFillBlankText() {
        let qq = q(type: .fillBlankText, answer: "你好")
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "你好"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: " 你好 "))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "你好。"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "再见"))
    }

    func testWordOrder() {
        let qq = q(type: .wordOrder, answer: "我,爱,学习")
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "我,爱,学习"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "我，爱，学习"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "我,学习,爱"))
    }

    func testMatchingOrderInsensitive() {
        let qq = q(type: .matching, answer: "A-1,B-2,C-3,D-4")
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "A-1,B-2,C-3,D-4"))
        XCTAssertTrue(Grade.gradeAnswer(question: qq, userAnswer: "D-4,A-1,C-3,B-2"))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "A-2,B-1,C-3,D-4"))
    }

    func testEmptyAnswerFails() {
        let qq = q(type: .fillBlank, answer: "5")
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: ""))
        XCTAssertFalse(Grade.gradeAnswer(question: qq, userAnswer: "   "))
    }
}

// MARK: - SRS

final class SRSTests: XCTestCase {
    private func makeEntry(box: Int? = 1) -> MistakeEntry {
        MistakeEntry(
            lessonId: "L1",
            lessonTitle: "test",
            question: q(type: .choice, answer: "A"),
            addedAt: SRS.isoFormatter.string(from: Date()),
            box: box,
            correctCount: 0,
            lastReviewedAt: nil,
            nextReviewDate: SRS.todayString()
        )
    }

    func testCorrectAnswerPromotesBox() {
        let now = Date()
        let updated = SRS.review(entry: makeEntry(box: 1), isCorrect: true, now: now)
        XCTAssertEqual(updated.box, 2)
        XCTAssertEqual(updated.correctCount, 1)
        XCTAssertEqual(updated.nextReviewDate, SRS.dateString(daysFromNow: 1, now: now))
        XCTAssertNotNil(updated.lastReviewedAt)
    }

    func testWrongAnswerResetsToBoxOne() {
        let now = Date()
        let updated = SRS.review(entry: makeEntry(box: 3), isCorrect: false, now: now)
        XCTAssertEqual(updated.box, 1)
        XCTAssertEqual(updated.correctCount, 0)
        XCTAssertEqual(updated.nextReviewDate, SRS.todayString(now: now))
    }

    func testBoxThreeStaysAtThreeAndPushes7Days() {
        let now = Date()
        let updated = SRS.review(entry: makeEntry(box: 3), isCorrect: true, now: now)
        XCTAssertEqual(updated.box, 3)
        XCTAssertEqual(updated.nextReviewDate, SRS.dateString(daysFromNow: 7, now: now))
    }

    func testDueEntriesSortByBoxThenDate() {
        let entries = [
            MistakeEntry(lessonId: "B", lessonTitle: nil, question: q(type: .choice, answer: "A"),
                         addedAt: "2026-01-02T00:00:00Z", box: 2, correctCount: 1,
                         lastReviewedAt: "2026-01-02T00:00:00Z", nextReviewDate: "2025-01-01"),
            MistakeEntry(lessonId: "A", lessonTitle: nil, question: q(type: .choice, answer: "A"),
                         addedAt: "2026-01-01T00:00:00Z", box: 1, correctCount: 0,
                         lastReviewedAt: nil, nextReviewDate: "2025-01-01"),
            MistakeEntry(lessonId: "C", lessonTitle: nil, question: q(type: .choice, answer: "A"),
                         addedAt: "2026-01-03T00:00:00Z", box: 1, correctCount: 0,
                         lastReviewedAt: "2026-01-03T00:00:00Z", nextReviewDate: nil),
        ]
        let due = SRS.dueEntries(entries)
        XCTAssertEqual(due.map(\.lessonId), ["A", "C", "B"])
    }
}

// MARK: - Achievements

final class AchievementsTests: XCTestCase {
    func testEmptySnapshotUnlocksNothing() {
        let snap = AchievementProgressSnapshot(
            xp: 0, streak: 0, lifetimeGems: 0,
            completedLessonCount: 0, perfectedLessonCount: 0,
            ownedCosmeticCount: 3, reviewedMistakeCount: 0
        )
        XCTAssertEqual(Achievements.unlockedIds(for: snap), [])
    }

    func testFirstLessonUnlocks() {
        let snap = AchievementProgressSnapshot(
            xp: 0, streak: 0, lifetimeGems: 0,
            completedLessonCount: 1, perfectedLessonCount: 0,
            ownedCosmeticCount: 3, reviewedMistakeCount: 0
        )
        XCTAssertTrue(Achievements.unlockedIds(for: snap).contains("first-lesson"))
    }

    func testNewlyUnlockedDiff() {
        let before = AchievementProgressSnapshot(xp: 99, streak: 2, lifetimeGems: 0,
                                                  completedLessonCount: 9, perfectedLessonCount: 0,
                                                  ownedCosmeticCount: 3, reviewedMistakeCount: 0)
        let after = AchievementProgressSnapshot(xp: 110, streak: 3, lifetimeGems: 0,
                                                 completedLessonCount: 10, perfectedLessonCount: 0,
                                                 ownedCosmeticCount: 3, reviewedMistakeCount: 0)
        let newly = Set(Achievements.newlyUnlocked(before: before, after: after).map(\.id))
        XCTAssertTrue(newly.contains("ten-lessons"))
        XCTAssertTrue(newly.contains("xp-100"))
        XCTAssertTrue(newly.contains("streak-3"))
        XCTAssertFalse(newly.contains("first-lesson")) // already unlocked before
    }
}

// MARK: - Chest

final class ChestTests: XCTestCase {
    private func lessons(unitNumber: Int, count: Int) -> [PathLessonMeta] {
        (0..<count).map { i in
            PathLessonMeta(
                id: "u\(unitNumber)-l\(i)",
                title: "L\(i)",
                unitNumber: unitNumber,
                unitTitle: "U\(unitNumber)",
                kpIndex: i,
                kpTotal: count,
                questionCount: 5
            )
        }
    }

    func testSlotsEveryFiveLessonsWithinUnit() {
        let ls = lessons(unitNumber: 1, count: 13)
        let slots = Chest.slots(bookId: "g1up", lessons: ls)
        XCTAssertEqual(slots.count, 2)
        XCTAssertEqual(slots[0].afterLessonId, "u1-l4")  // 5th lesson (index 4)
        XCTAssertEqual(slots[1].afterLessonId, "u1-l9")  // 10th lesson
        XCTAssertEqual(slots[0].id, "g1up-u1-chest-0")
        XCTAssertEqual(slots[1].id, "g1up-u1-chest-1")
    }

    func testSlotsResetCounterPerUnit() {
        let ls = lessons(unitNumber: 1, count: 5) + lessons(unitNumber: 2, count: 5)
        let slots = Chest.slots(bookId: "g1up", lessons: ls)
        XCTAssertEqual(slots.count, 2)
        XCTAssertEqual(slots[0].unitNumber, 1)
        XCTAssertEqual(slots[1].unitNumber, 2)
    }

    func testRollRewardTiersWithSeededRNG() {
        // Hammer the roll with a deterministic seed to verify all 3 tiers reachable
        // and gem ranges are sane. Apple's SystemRandomNumberGenerator is fine — we
        // just check ranges over many rolls.
        var commonHits = 0, rareHits = 0, epicHits = 0
        for _ in 0..<2000 {
            let r = Chest.rollReward()
            switch r.tier {
            case .common:
                XCTAssertTrue((10...20).contains(r.gems), "common gems out of range: \(r.gems)")
                commonHits += 1
            case .rare:
                XCTAssertTrue((21...30).contains(r.gems), "rare gems out of range: \(r.gems)")
                rareHits += 1
            case .epic:
                XCTAssertTrue((40...50).contains(r.gems), "epic gems out of range: \(r.gems)")
                epicHits += 1
            }
        }
        XCTAssertGreaterThan(commonHits, 0)
        XCTAssertGreaterThan(rareHits, 0)
        XCTAssertGreaterThan(epicHits, 0)
    }
}

// MARK: - MascotTriggers

final class MascotTriggersTests: XCTestCase {
    private func ctx(
        isCorrect: Bool = true,
        isPerfect: Bool = false,
        attempts: Int = 1,
        hearts: Int = 5,
        combo: Int = 0,
        index: Int = 0,
        total: Int = 5
    ) -> MascotTriggerContext {
        MascotTriggerContext(
            isCorrect: isCorrect,
            isPerfectSession: isPerfect,
            attemptCount: attempts,
            remainingHearts: hearts,
            combo: combo,
            maxCombo: combo,
            index: index,
            total: total,
            totalCorrectInSession: 0
        )
    }

    func testProudOnPerfectFinish() {
        let mood = MascotTriggers.decideMood(ctx(isPerfect: true, index: 4, total: 5))
        XCTAssertEqual(mood, .proud)
    }

    func testCheerOnHighCombo() {
        let mood = MascotTriggers.decideMood(ctx(combo: 5))
        XCTAssertEqual(mood, .cheer)
    }

    func testEmbarrassedOnLastHeartWrong() {
        let mood = MascotTriggers.decideMood(ctx(isCorrect: false, hearts: 1))
        XCTAssertEqual(mood, .embarrassed)
    }

    func testThinkOnFirstWrong() {
        let mood = MascotTriggers.decideMood(ctx(isCorrect: false, hearts: 5))
        XCTAssertEqual(mood, .think)
    }

    func testReactionLevelupOnComboMilestones() {
        XCTAssertEqual(MascotTriggers.decideReaction(ctx(combo: 3)), .levelup)
        XCTAssertEqual(MascotTriggers.decideReaction(ctx(combo: 5)), .levelup)
        XCTAssertEqual(MascotTriggers.decideReaction(ctx(combo: 10)), .levelup)
        XCTAssertEqual(MascotTriggers.decideReaction(ctx(combo: 4)), .correct)
        XCTAssertEqual(MascotTriggers.decideReaction(ctx(isCorrect: false)), .wrong)
    }

    func testToneMapping() {
        XCTAssertEqual(MascotTriggers.tone(for: .happy), .primary)
        XCTAssertEqual(MascotTriggers.tone(for: .sad), .danger)
        XCTAssertEqual(MascotTriggers.tone(for: .think), .neutral)
    }
}

// MARK: - Subjects

final class SubjectsTests: XCTestCase {
    func testResolveDefaultsToMath() {
        let book = Book(
            id: "g1up", grade: 1, semester: "up", subject: nil,
            gradeName: "一", semesterName: "上", subjectName: nil,
            textbookName: "一上", fullName: "数学一上",
            unitsCount: 1, lessonsCount: 1, hasPassages: nil, hasStories: nil
        )
        XCTAssertEqual(Subjects.resolve(book: book).id, .math)
    }

    func testEverySubjectHasConfig() {
        for id in SubjectId.allCases {
            XCTAssertNotNil(Subjects.all[id], "missing config for \(id)")
        }
    }
}

// MARK: - Cosmetics

final class CosmeticsTests: XCTestCase {
    func testStartersHaveZeroCost() {
        for c in Cosmetics.starters {
            XCTAssertEqual(c.cost, 0, "\(c.id) is starter but costs \(c.cost)")
        }
    }

    func testDefaultEquippedExist() {
        XCTAssertNotNil(Cosmetics.item(id: Cosmetics.defaultEquipped.mascotSkin))
        XCTAssertNotNil(Cosmetics.item(id: Cosmetics.defaultEquipped.uiTheme))
        XCTAssertNotNil(Cosmetics.item(id: Cosmetics.defaultEquipped.lessonBackdrop))
    }

    func testItemsByTypeMatchLayer() {
        XCTAssertEqual(Cosmetics.items(of: .mascotSkin).count, Cosmetics.mascotSkins.count)
        XCTAssertEqual(Cosmetics.items(of: .uiTheme).count, Cosmetics.uiThemes.count)
        XCTAssertEqual(Cosmetics.items(of: .lessonBackdrop).count, Cosmetics.lessonBackdrops.count)
    }
}
