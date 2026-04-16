import Foundation

/// Achievement catalog + unlock evaluation — port of packages/core/src/achievements.ts.
/// Pure data + functions; no Store dependency.

enum AchievementCategory: String, Codable, Hashable {
    case milestone, streak, perfection, shop, review
}

enum AchievementIconKey: String, Codable, Hashable {
    case lightning, flame, star, crown, gem, bookmark, trophy, rocket, medal, sparkle

    /// Map to an SF Symbol name — useful for the iOS UI layer.
    var symbolName: String {
        switch self {
        case .lightning: return "bolt.fill"
        case .flame:     return "flame.fill"
        case .star:      return "star.fill"
        case .crown:     return "crown.fill"
        case .gem:       return "diamond.fill"
        case .bookmark:  return "bookmark.fill"
        case .trophy:    return "trophy.fill"
        case .rocket:    return "paperplane.fill"
        case .medal:     return "medal.fill"
        case .sparkle:   return "sparkles"
        }
    }
}

/// Snapshot of progress state — only the fields ALL_ACHIEVEMENTS read.
struct AchievementProgressSnapshot: Hashable {
    var xp: Int
    var streak: Int
    var lifetimeGems: Int
    var completedLessonCount: Int
    var perfectedLessonCount: Int
    var ownedCosmeticCount: Int
    var reviewedMistakeCount: Int  // entries with correctCount > 0
}

struct Achievement: Identifiable, Hashable {
    let id: String
    let category: AchievementCategory
    let name: String
    let description: String
    let iconKey: AchievementIconKey
    let colorHex: UInt32
    let goal: Int
    let progress: (AchievementProgressSnapshot) -> Int

    static func == (lhs: Achievement, rhs: Achievement) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

enum Achievements {
    static let all: [Achievement] = [
        // ===== Milestone =====
        Achievement(id: "first-lesson",  category: .milestone, name: "出师告捷", description: "完成你的第一节课",
                    iconKey: .rocket, colorHex: 0x1CB0F6, goal: 1,
                    progress: { $0.completedLessonCount }),
        Achievement(id: "ten-lessons",   category: .milestone, name: "学海十里", description: "累计完成 10 节课",
                    iconKey: .bookmark, colorHex: 0x1CB0F6, goal: 10,
                    progress: { $0.completedLessonCount }),
        Achievement(id: "fifty-lessons", category: .milestone, name: "百炼成钢", description: "累计完成 50 节课",
                    iconKey: .trophy, colorHex: 0xA855F7, goal: 50,
                    progress: { $0.completedLessonCount }),
        // ===== XP =====
        Achievement(id: "xp-100",  category: .milestone, name: "初露锋芒", description: "累计 100 经验",
                    iconKey: .lightning, colorHex: 0x1CB0F6, goal: 100,
                    progress: { $0.xp }),
        Achievement(id: "xp-1000", category: .milestone, name: "经验丰富", description: "累计 1000 经验",
                    iconKey: .lightning, colorHex: 0xA855F7, goal: 1000,
                    progress: { $0.xp }),
        Achievement(id: "xp-5000", category: .milestone, name: "学霸认证", description: "累计 5000 经验",
                    iconKey: .lightning, colorHex: 0xFFC800, goal: 5000,
                    progress: { $0.xp }),
        // ===== Streak =====
        Achievement(id: "streak-3",   category: .streak, name: "三日不辍",  description: "连续学习 3 天",
                    iconKey: .flame, colorHex: 0xFF9600, goal: 3,
                    progress: { $0.streak }),
        Achievement(id: "streak-7",   category: .streak, name: "一周如一日", description: "连续学习 7 天",
                    iconKey: .flame, colorHex: 0xFF9600, goal: 7,
                    progress: { $0.streak }),
        Achievement(id: "streak-30",  category: .streak, name: "月度坚持",  description: "连续学习 30 天",
                    iconKey: .flame, colorHex: 0xFF4B4B, goal: 30,
                    progress: { $0.streak }),
        Achievement(id: "streak-100", category: .streak, name: "百日行者",  description: "连续学习 100 天",
                    iconKey: .flame, colorHex: 0xFFC800, goal: 100,
                    progress: { $0.streak }),
        // ===== Perfection =====
        Achievement(id: "perfect-1",  category: .perfection, name: "完美初体验", description: "首次三星通关一节课",
                    iconKey: .star, colorHex: 0xFFC800, goal: 1,
                    progress: { $0.perfectedLessonCount }),
        Achievement(id: "perfect-10", category: .perfection, name: "完美十连",   description: "三星通关 10 节课",
                    iconKey: .star, colorHex: 0xFFC800, goal: 10,
                    progress: { $0.perfectedLessonCount }),
        Achievement(id: "perfect-50", category: .perfection, name: "无暇修行",   description: "三星通关 50 节课",
                    iconKey: .crown, colorHex: 0xA855F7, goal: 50,
                    progress: { $0.perfectedLessonCount }),
        // ===== Shop =====
        Achievement(id: "first-cosmetic", category: .shop, name: "时尚启航",   description: "解锁第一件美妆道具",
                    iconKey: .sparkle, colorHex: 0xA855F7, goal: 1,
                    progress: { max(0, $0.ownedCosmeticCount - 3) }),
        Achievement(id: "gem-collector",  category: .shop, name: "宝石收藏家", description: "累计获得 500 颗宝石",
                    iconKey: .gem, colorHex: 0xA855F7, goal: 500,
                    progress: { $0.lifetimeGems }),
        // ===== Review =====
        Achievement(id: "first-review", category: .review, name: "知错就改", description: "在错题本中复习一道题",
                    iconKey: .medal, colorHex: 0x58CC02, goal: 1,
                    progress: { $0.reviewedMistakeCount }),
    ]

    static func unlockedIds(for snapshot: AchievementProgressSnapshot) -> [String] {
        all.filter { $0.progress(snapshot) >= $0.goal }.map(\.id)
    }

    /// Achievements that became unlocked between two snapshots.
    static func newlyUnlocked(
        before: AchievementProgressSnapshot,
        after: AchievementProgressSnapshot
    ) -> [Achievement] {
        let beforeSet = Set(unlockedIds(for: before))
        return all.filter { $0.progress(after) >= $0.goal && !beforeSet.contains($0.id) }
    }
}
