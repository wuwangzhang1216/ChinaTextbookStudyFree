import Foundation

/// Chest slot computation + variable reward roll — port of packages/core/src/chestLogic.ts.

enum ChestRewardTier: String, Codable, Hashable { case common, rare, epic }

struct ChestSlot: Identifiable, Hashable {
    let id: String
    /// The chest appears immediately after this lesson.
    let afterLessonId: String
    let unitNumber: Int
    let unitTitle: String
    /// 0-indexed position within the unit.
    let indexInUnit: Int
}

struct ChestRewardResult: Hashable {
    let gems: Int
    let tier: ChestRewardTier
}

enum Chest {
    static let everyNLessons = 5

    /// Insert a chest slot after every Nth lesson within each unit.
    /// Slots are deterministic for a given (bookId, lessons) input.
    static func slots(
        bookId: String,
        lessons: [PathLessonMeta],
        interval: Int = everyNLessons
    ) -> [ChestSlot] {
        var slots: [ChestSlot] = []
        var unitCounts: [Int: Int] = [:]
        for l in lessons {
            let count = (unitCounts[l.unitNumber] ?? 0) + 1
            unitCounts[l.unitNumber] = count
            if count % interval == 0 {
                let indexInUnit = count / interval - 1
                slots.append(ChestSlot(
                    id: "\(bookId)-u\(l.unitNumber)-chest-\(indexInUnit)",
                    afterLessonId: l.id,
                    unitNumber: l.unitNumber,
                    unitTitle: l.unitTitle,
                    indexInUnit: indexInUnit
                ))
            }
        }
        return slots
    }

    /// Returns the chest slot that immediately follows the given lesson, if any.
    static func chestAfter(
        bookId: String,
        lessons: [PathLessonMeta],
        lessonId: String
    ) -> ChestSlot? {
        slots(bookId: bookId, lessons: lessons).first { $0.afterLessonId == lessonId }
    }

    /// Three-tier variable reward — mirrors Duolingo's "variable reward" psychology:
    ///   - 85% common: 10–20 gems
    ///   - 10% rare:   21–30 gems
    ///   -  5% epic:   40–50 gems
    static func rollReward<G: RandomNumberGenerator>(using generator: inout G) -> ChestRewardResult {
        let roll = Double.random(in: 0..<1, using: &generator)
        if roll < 0.85 {
            return ChestRewardResult(gems: Int(round(10 + Double.random(in: 0..<1, using: &generator) * 10)), tier: .common)
        }
        if roll < 0.95 {
            return ChestRewardResult(gems: Int(round(21 + Double.random(in: 0..<1, using: &generator) * 9)), tier: .rare)
        }
        return ChestRewardResult(gems: Int(round(40 + Double.random(in: 0..<1, using: &generator) * 10)), tier: .epic)
    }

    static func rollReward() -> ChestRewardResult {
        var g = SystemRandomNumberGenerator()
        return rollReward(using: &g)
    }
}
