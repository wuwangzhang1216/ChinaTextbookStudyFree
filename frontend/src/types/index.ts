// ============================================================
// 题目相关
// ============================================================

export type QuestionType =
  | "true_false"
  | "choice"
  | "fill_blank"        // 数字键盘（数学 / 科学）
  | "calculation"       // 数字键盘（数学）
  | "fill_blank_text"   // 文字输入（语文 / 英语 / 科学术语）
  | "word_order"        // 词语排序（语文 / 英语）
  | "matching"          // 连线配对（语文 / 英语）
  | "word_problem";     // 历史保留

export interface Question {
  id: number;
  type: QuestionType;
  score: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  knowledge_point: string;
  question: string;
  options: string[]; // 选择题 4 项；其他为空
  answer: string;
  explanation: string;
}

// ============================================================
// 单元 / 知识点 / 课程
// ============================================================

export interface KnowledgeSummary {
  point: string;
  core_concept: string;
  key_formula: string;
  common_mistakes: string[];
  tips: string;
}

export interface QuizFile {
  textbook: string;
  unit: string;
  unit_number: number;
  unit_test: { title: string; total_score: number; time_minutes: number; questions: Question[] };
  exam: { title: string; total_score: number; time_minutes: number; questions: Question[] };
  knowledge_summary: KnowledgeSummary[];
}

/**
 * 一节"小课" = 一个知识点 + 该知识点对应的题目（5-7 道）
 * 这是多邻国式的最小学习单位
 */
export interface Lesson {
  id: string; // e.g. "g1up-u3-kp2"
  title: string; // 知识点名
  bookId: string; // "g1up"
  unitNumber: number;
  unitTitle: string;
  kpIndex: number; // 在单元内的序号 (从 0 开始)
  kpTotal: number; // 本单元知识点总数
  questions: Question[];
  knowledge: KnowledgeSummary | null;
}

// ============================================================
// 教材 / 大纲
// ============================================================

export interface KnowledgePoint {
  name: string;
  description: string;
  difficulty: number;
  question_types: string[];
}

export interface Unit {
  unit_number: number;
  title: string;
  knowledge_points: KnowledgePoint[];
}

export interface Outline {
  textbook: string;
  units: Unit[];
}

/**
 * 学科标识 —— 当前只有 math；未来添加 chinese/english/science 时保持同一 key。
 * 字段在 Book 上为可选以便老数据降级到 "math"。
 */
export type SubjectId = "math" | "chinese" | "english" | "science";

export interface Book {
  id: string; // 'g3up'
  grade: number; // 1-6
  semester: "up" | "down"; // 上 / 下
  subject?: SubjectId; // 学科（未来多科支持）
  gradeName: string; // '三年级'
  semesterName: string; // '上册'
  subjectName?: string; // '数学'（显示用）
  textbookName: string; // '三年级上册'
  fullName: string; // '人教版小学数学三年级上册'
  unitsCount: number;
  lessonsCount: number;
}

// ============================================================
// 全站索引
// ============================================================

export interface SiteIndex {
  books: Book[];
  generatedAt: string;
  totalLessons: number;
  totalQuestions: number;
}

// ============================================================
// 用户进度（localStorage）
// ============================================================

export interface LessonResult {
  lessonId: string;
  stars: 1 | 2 | 3;
  accuracy: number; // 0-1
  completedAt: string;
}

export interface UserProgress {
  xp: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  completedLessons: Record<string, LessonResult>;
  mistakesBank: { lessonId: string; question: Question }[];
}
