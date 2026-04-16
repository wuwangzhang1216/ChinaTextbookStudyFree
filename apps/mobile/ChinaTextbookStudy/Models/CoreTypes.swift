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

    var id: Int { unitNumber }

    enum CodingKeys: String, CodingKey {
        case unitNumber = "unit_number"
        case title
        case knowledgePoints = "knowledge_points"
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
    var unitsCount: Int
    var lessonsCount: Int
    var hasPassages: Bool?
    var hasStories: Bool?
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
}

struct UserProgress: Codable, Hashable {
    var xp: Int
    var streak: Int
    var lastActiveDate: String  // YYYY-MM-DD
    var completedLessons: [String: LessonResult]
    var mistakesBank: [MistakeEntry]
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
}

enum LessonStatus: String, Codable, Hashable {
    case completed, current, locked
}
