import Foundation

// ============================================================
// 题目相关 — 对应 packages/core/src/types.ts
// ============================================================

enum QuestionType: String, Codable, Hashable {
    case trueFalse = "true_false"
    case choice
    case fillBlank = "fill_blank"
    case calculation
    case fillBlankText = "fill_blank_text"
    case wordOrder = "word_order"
    case matching
    case wordProblem = "word_problem"
}

struct QuestionAudio: Codable, Hashable {
    var question: String?
    var options: [String?]?
    var explanation: String?
}

struct Question: Codable, Hashable, Identifiable {
    var id: Int
    var type: QuestionType
    var score: Int
    var difficulty: Int
    var knowledgePoint: String
    var question: String
    var options: [String]
    var answer: String
    var explanation: String
    var audio: QuestionAudio?

    enum CodingKeys: String, CodingKey {
        case id, type, score, difficulty
        case knowledgePoint = "knowledge_point"
        case question, options, answer, explanation, audio
    }
}

// ============================================================
// 单元 / 知识点 / 课程
// ============================================================

struct KnowledgeAudio: Codable, Hashable {
    var point: String?
    var coreConcept: String?
    var keyFormula: String?
    var tips: String?
    var commonMistakes: [String?]?

    enum CodingKeys: String, CodingKey {
        case point
        case coreConcept = "core_concept"
        case keyFormula = "key_formula"
        case tips
        case commonMistakes = "common_mistakes"
    }
}

struct KnowledgeSummary: Codable, Hashable {
    var point: String
    var coreConcept: String
    var keyFormula: String
    var commonMistakes: [String]
    var tips: String
    var audio: KnowledgeAudio?

    enum CodingKeys: String, CodingKey {
        case point
        case coreConcept = "core_concept"
        case keyFormula = "key_formula"
        case commonMistakes = "common_mistakes"
        case tips, audio
    }
}

struct QuizSection: Codable, Hashable {
    var title: String
    var totalScore: Int
    var timeMinutes: Int
    var questions: [Question]

    enum CodingKeys: String, CodingKey {
        case title
        case totalScore = "total_score"
        case timeMinutes = "time_minutes"
        case questions
    }
}

struct QuizFile: Codable, Hashable {
    var textbook: String
    var unit: String
    var unitNumber: Int
    var unitTest: QuizSection
    var exam: QuizSection
    var knowledgeSummary: [KnowledgeSummary]

    enum CodingKeys: String, CodingKey {
        case textbook, unit
        case unitNumber = "unit_number"
        case unitTest = "unit_test"
        case exam
        case knowledgeSummary = "knowledge_summary"
    }
}

/// 一节"小课" = 一个知识点 + 该知识点对应的题目（5-7 道）
struct Lesson: Codable, Hashable, Identifiable {
    var id: String              // e.g. "g1up-u3-kp2"
    var title: String
    var bookId: String
    var unitNumber: Int
    var unitTitle: String
    var kpIndex: Int
    var kpTotal: Int
    var questions: [Question]
    var knowledge: KnowledgeSummary?
    var unitLabel: String? = nil
}

// ============================================================
// 教材 / 大纲
// ============================================================

struct KnowledgePoint: Codable, Hashable {
    var name: String
    var description: String
    var difficulty: Int
    var questionTypes: [String]

    enum CodingKeys: String, CodingKey {
        case name, description, difficulty
        case questionTypes = "question_types"
    }
}

struct Unit: Codable, Hashable, Identifiable {
    var unitNumber: Int
    var title: String
    var knowledgePoints: [KnowledgePoint]
    /// 单元挑战课 id（"{bookId}-u{n}-exam"），build-data 在该单元 exam 题数
    /// ≥4 时注入；缺省 = 该单元没有挑战课。iOS 容错：outline 有此字段但
    /// 本地课程文件缺失时，路径上的挑战节点隐藏（旧资产包兼容）。
    var examLessonId: String?
    /// 单元挑战题目数（exam 全部，上限 15，超出均匀抽样后的实际数）。
    var examQuestionCount: Int?
    var label: String? = nil

    var displayLabel: String { label ?? "第 \(unitNumber) 单元" }

    var id: Int { unitNumber }

    enum CodingKeys: String, CodingKey {
        case unitNumber = "unit_number"
        case title
        case knowledgePoints = "knowledge_points"
        case examLessonId
        case examQuestionCount, label
    }
}

struct Outline: Codable, Hashable {
    var textbook: String
    var units: [Unit]
}

enum SubjectId: String, Codable, Hashable, CaseIterable {
    case math, chinese, english, science
}

struct Book: Codable, Hashable, Identifiable {
    var id: String              // 'g3up'
    var grade: Int              // 1-6
    var semester: String        // 'up' / 'down'
    var subject: SubjectId?
    var gradeName: String
    var semesterName: String
    var subjectName: String?
    var textbookName: String
    var fullName: String
    var schoolSystem: String? = nil
    var publisherLabel: String? = nil
    var sourceEdition: String? = nil
    var sourcePrinting: String? = nil
    var unitsCount: Int
    var lessonsCount: Int
    var hasPassages: Bool?
    var hasStories: Bool?
    var editionLabel: String? = nil
    var supersedes: String? = nil
    var supersededBy: String? = nil
    var activitiesCount: Int? = nil
}

// ============================================================
// 课文听读（语文 / 英语）
// ============================================================

enum PassageKind: String, Codable, Hashable {
    case poem
    case ancientPoem = "ancient_poem"
    case prose, story, song, dialogue
}

struct PassageSentence: Codable, Hashable {
    var text: String
    var audio: String?
}

struct Passage: Codable, Hashable, Identifiable {
    var id: String              // e.g. "chinese-g1up-p3"
    var bookId: String
    var unitNumber: Int?
    var lessonNumber: Int
    var title: String
    var kind: PassageKind
    var author: String?
    var language: String        // "Chinese" | "English"
    var sentences: [PassageSentence]
    var pageHint: Int?
    var pdfPage: Int?
    var pageImages: [String]?
    var curriculumRole: String? = nil

    var curriculumRoleLabel: String? {
        switch curriculumRole {
        case "main": return "正课"
        case "garden": return "语文园地"
        case "writing_example": return "习作例文"
        case "optional": return "选学"
        case "revision": return "复习"
        default: return nil
        }
    }
}

struct BookPassages: Codable, Hashable {
    var bookId: String
    var subject: SubjectId
    var textbook: String
    var passages: [Passage]
}

// ============================================================
// 故事阅读
// ============================================================

struct StoryQuestion: Codable, Hashable, Identifiable {
    var id: Int
    var type: String            // "true_false" | "choice" | "fill_blank_text"
    var question: String
    var options: [String]
    var answer: String
    var explanation: String
    var audio: QuestionAudio?
}

struct Story: Codable, Hashable, Identifiable {
    var id: String              // e.g. "chinese-g3up-s1"
    var bookId: String
    var unitNumber: Int
    var unitTitle: String
    var storyIndex: Int
    var title: String
    var language: String        // "Chinese" | "English"
    var sentences: [PassageSentence]
    var questions: [StoryQuestion]
    var image: String?
}

struct BookStories: Codable, Hashable {
    var bookId: String
    var subject: SubjectId
    var textbook: String
    var stories: [Story]
}

// ============================================================
// 全站索引
// ============================================================

struct SiteIndex: Codable, Hashable {
    var books: [Book]
    var generatedAt: String?
    var totalLessons: Int?
    var totalQuestions: Int?
}

// ============================================================
// 用户进度（持久化到 Application Support/cstf/progress.json）
// ============================================================

struct LessonResult: Codable, Hashable {
    var lessonId: String
    var stars: Int              // 1...3
    var accuracy: Double        // 0...1
    var completedAt: String     // ISO8601
}

/// Mistake bank entry. Carries the SRS Leitner-box state so the same record
/// can be used for both `UserProgress.mistakesBank` and SRS scheduling.
struct MistakeEntry: Codable, Hashable {
    var lessonId: String
    var lessonTitle: String?
    var question: Question
    var addedAt: String                 // ISO8601
    var box: Int?                       // 1...3
    var correctCount: Int?
    var lastReviewedAt: String?         // ISO8601
    var nextReviewDate: String?         // YYYY-MM-DD
    /// Wave D (parity-7): 毕业条目不再物理删除 —— box ≥ 3 且答对 ≥ 2 次后置
    /// 此标记。毕业条目不进 due 队列，但保留在错题本里（「已掌握」桶 +
    /// 成就快照 reviewedMistakeCount 不再回退）。答错会防御性回炉（清标记），
    /// 与 web store 一致。
    var graduated: Bool?
}

/// 未完成的课程会话（parity-13）—— 与 web `ActiveLessonSession` 心智对齐。
/// 用户中途退出课程时持久化，下次进入同一课可无缝恢复到上次的题目队列。
struct ActiveLessonSession: Codable, Hashable {
    var bookId: String
    var lessonId: String
    /// 还未答对、等待作答的题目 id 队列（队首 = 当前题）。
    var queueIds: [Int]
    /// 已（首答）答对的题目 id。
    var solvedIds: [Int]
    /// 首答答错过的题目 id（用于结算正确率 = solved - missed）。
    var missedIds: [Int]
    var combo: Int
    var maxCombo: Int
    /// 本会话内已累计展示的 XP（结算时以 store 计算为准）。
    var sessionXp: Int
    var startedAt: String               // ISO8601
    /// Audio is excluded; existing backups without this field remain readable.
    var contentKey: String? = nil
}

/// 上一周联赛的结算结果（Wave E1）—— 存档持久化，直到 UI 弹过结算幕后清除。
struct LeagueWeekResult: Codable, Hashable, Identifiable {
    /// 被结算的那一周的周键（周一 YYYY-MM-DD）。
    var weekKey: String
    /// 上周末终值名次 1..16。
    var rank: Int
    /// 结算前段位 id（bronze/silver/...）。
    var tierBefore: String
    /// 结算后段位 id。
    var tierAfter: String
    var promoted: Bool
    var demoted: Bool
    /// 已入账的宝石奖励（名次奖励 + 晋级奖励）。
    var gems: Int

    var id: String { weekKey }
}

/// 题目报错记录（Wave E2）—— 纯本地，不上传任何服务器。
/// 设置页「已报告的问题」列表可查看并一键导出 JSON。
struct QuestionReport: Codable, Hashable, Identifiable {
    enum Kind: String, Codable, Hashable, CaseIterable {
        case questionWrong = "question_wrong"
        case answerShouldCount = "answer_should_count"
        case audioIssue = "audio_issue"

        var label: String {
            switch self {
            case .questionWrong:     return "题目有误"
            case .answerShouldCount: return "我的答案应该算对"
            case .audioIssue:        return "音频有问题"
            }
        }

        var symbol: String {
            switch self {
            case .questionWrong:     return "exclamationmark.triangle.fill"
            case .answerShouldCount: return "checkmark.bubble.fill"
            case .audioIssue:        return "speaker.slash.fill"
            }
        }
    }

    var lessonId: String
    var questionId: Int
    var kind: Kind
    var createdAt: String               // ISO8601
    /// 当次作答（可选，帮助核对「我的答案应该算对」）。
    var userAnswer: String?
    /// 题干快照（可选，脱离题库也能看懂报的是哪道题）。
    var questionText: String?

    var id: String { "\(lessonId)#\(questionId)#\(kind.rawValue)#\(createdAt)" }
}

struct UserProgress: Codable, Hashable {
    var xp: Int
    var streak: Int
    var lastActiveDate: String  // YYYY-MM-DD
    var completedLessons: [String: LessonResult]
    var mistakesBank: [MistakeEntry]

    // Gamification fields (added in UX overhaul — all optional for backward compat)
    var hearts: Int?
    var nextHeartAt: Double?            // Unix ms, nil = no recharge in progress
    var gems: Int?
    var todayXp: Int?
    var lastXpDate: String?             // YYYY-MM-DD
    var dailyGoal: Int?                 // default 50
    var claimedChests: [String: Bool]?
    var equippedMascotSkin: String?
    var equippedTheme: String?
    var equippedBackdrop: String?
    var streakFreezes: Int?
    var ownedCosmetics: [String]?       // cosmetic ids the user owns
    var lifetimeGems: Int?              // total gems ever earned (for achievements)
    var displayName: String?
    var completedReadings: [String]?    // passage/story ids finished (for XP + crown)

    // Daily quests & weekly report
    var claimedQuests: [String]?        // "YYYY-MM-DD:questId"
    var xpHistory: [String: Int]?       // YYYY-MM-DD → XP earned that day
    var dailyDate: String?              // the day the counters below belong to
    var dailyLessons: Int?
    var dailyReviews: Int?
    var dailyReadings: Int?

    // Wave B economy ledgers (all optional for backward compat)
    var claimedStreakRewards: [Int]?    // streak milestones already paid (3/7/14/…)
    var lastDailyRewardDate: String?    // YYYY-MM-DD the login reward was last claimed
    /// 今日登录奖励是按哪一档「有效连胜」发的（parity-4）。补卡成功后有效连胜
    /// 回升，按新旧两档的差额补发，最终收益与 web「补卡决定后再发」等价。
    var lastDailyRewardStreak: Int?
    /// 复习补心账本（iosretention-4）：YYYY-MM-DD，每天只补一次，
    /// 杜绝「进复习 → 乱答 → 看结算 → 返回」无限回心。
    var lastReviewHeartDate: String?
    var unlockedAchievements: [String]? // permanent achievement ledger (never re-locks)
    var freezesMigrated: Bool?          // one-time max(current, 2) shield migration done

    // Wave D (all optional for backward compat)
    /// 未完成课程会话（parity-13）；nil = 没有挂起的课。
    var activeLesson: ActiveLessonSession?
    /// 已手动领取奖励的成就 id（ios-retention-10）：解锁进 unlockedAchievements
    /// 账本，领取才发宝石。迁移：老档已解锁未领取视为已领取（不补发）。
    var claimedAchievements: [String]?
    /// 首次使用日期 YYYY-MM-DD（ios-retention-12）；老档回填最早 completedAt。
    var joinedDate: String?

    // Wave E1 本地联赛（all optional for backward compat）
    /// 每台设备一次性生成的稳定随机串——联赛 seed 的一部分。
    var leagueSalt: String?
    /// 当前段位 id（bronze/silver/gold/sapphire/ruby/diamond）。
    var leagueTier: String?
    /// 已入组的那一周的周键（周一 YYYY-MM-DD）；周键变化即触发结算。
    var leagueWeekKey: String?
    /// 待展示的上周结算结果（宝石已入账；UI 弹过结算幕后清除）。
    var pendingLeagueResult: LeagueWeekResult?

    // Wave E2（all optional for backward compat）
    /// 已看过课前知识讲解的课程 id（content-2）：看过一次不再重复打断。
    var seenIntros: [String]?
    /// 题目报错列表（纯本地；设置页可查看 / 导出）。
    var reports: [QuestionReport]?
}

// ============================================================
// 玩法 UI 域类型
// ============================================================

enum MascotMood: String, Codable, Hashable {
    case happy, cheer, sad, think, wave, surprise, proud, embarrassed
}

enum MascotReaction: String, Codable, Hashable {
    case correct, wrong, levelup
}

struct PathLessonMeta: Hashable, Identifiable {
    var id: String
    var title: String
    var unitNumber: Int
    var unitTitle: String
    var kpIndex: Int
    var kpTotal: Int
    var questionCount: Int
    var unitLabel: String? = nil
}

enum LessonStatus: String, Codable, Hashable {
    case completed, current, locked
}
