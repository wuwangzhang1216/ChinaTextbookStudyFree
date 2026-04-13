/**
 * build-data.ts
 *
 * 把 ../output/{subject}/ 下的 outlines/ + quizzes/ + knowledge/ 转换成
 * frontend/public/data/ 下前端可直接 fetch 的结构。
 *
 * 多学科支持：遍历 output/{math,chinese,english,science}/ 每个子目录。
 *
 * bookId 规则：
 *   - math 维持 `g1up` 等老格式（兼容老用户 localStorage 进度）
 *   - 非 math 学科带前缀：`chinese-g1up` / `english-g3up` / `science-g1up`
 */

import { createHash } from "crypto";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  Lesson,
  Outline,
  QuizFile,
  Question,
  Book,
  SiteIndex,
  SubjectId,
  Passage,
  BookPassages,
  Story,
  StoryQuestion,
  BookStories,
} from "../src/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_SRC = path.resolve(ROOT, "..", "output");
const PASSAGES_SRC = path.resolve(ROOT, "..", "data", "passages");
const STORIES_SRC = path.resolve(ROOT, "..", "data", "stories");
const DATA_DST = path.resolve(ROOT, "public", "data");
const AUDIO_ROOT = path.resolve(ROOT, "public", "audio");
const PAGES_ROOT = path.resolve(ROOT, "public", "textbook-pages");
const STORY_IMAGES_ROOT = path.resolve(ROOT, "public", "story-images");

// ============================================================
// TTS 音频映射：与 scripts/tts/collect_texts.py 的 hash 规则保持一致
//   - normalize: trim + 折叠空白
//   - hash:      sha1(text)
//   - rel path:  /audio/<hash[0:2]>/<hash>.opus
// 仅当对应 opus 已生成时才注入路径，避免前端 404。
// ============================================================

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function textHash(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

function audioRel(text: string): string {
  const h = textHash(text);
  return `${h.slice(0, 2)}/${h}.opus`;
}

let audioIndex: Set<string> | null = null;

async function buildAudioIndex(): Promise<Set<string>> {
  if (audioIndex) return audioIndex;
  const set = new Set<string>();
  if (!existsSync(AUDIO_ROOT)) {
    audioIndex = set;
    return set;
  }
  const buckets = await fs.readdir(AUDIO_ROOT);
  for (const b of buckets) {
    const dir = path.join(AUDIO_ROOT, b);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (f.endsWith(".opus")) set.add(`${b}/${f}`);
    }
  }
  audioIndex = set;
  return set;
}

function audioFor(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const norm = normalizeText(text);
  if (!norm) return undefined;
  const rel = audioRel(norm);
  if (audioIndex && audioIndex.has(rel)) return `/audio/${rel}`;
  return undefined;
}

function stripOptionPrefix(opt: string): string {
  return opt.replace(/^[A-Da-d][.、]\s*/, "");
}

function decorateQuestion(q: Question): Question {
  const audio: NonNullable<Question["audio"]> = {};
  const qa = audioFor(q.question);
  if (qa) audio.question = qa;
  if (q.options && q.options.length) {
    const opts = q.options.map(o => audioFor(stripOptionPrefix(o)) ?? null);
    if (opts.some(Boolean)) audio.options = opts;
  }
  const ea = audioFor(q.explanation);
  if (ea) audio.explanation = ea;
  if (Object.keys(audio).length) q.audio = audio;
  return q;
}

function decorateKnowledge<T extends { point: string; core_concept: string; key_formula: string; tips: string; common_mistakes: string[]; audio?: unknown }>(
  ks: T,
): T {
  const audio: Record<string, unknown> = {};
  const p = audioFor(ks.point); if (p) audio.point = p;
  const c = audioFor(ks.core_concept); if (c) audio.core_concept = c;
  const f = audioFor(ks.key_formula); if (f) audio.key_formula = f;
  const t = audioFor(ks.tips); if (t) audio.tips = t;
  if (Array.isArray(ks.common_mistakes) && ks.common_mistakes.length) {
    const cm = ks.common_mistakes.map(m => audioFor(m) ?? null);
    if (cm.some(Boolean)) audio.common_mistakes = cm;
  }
  if (Object.keys(audio).length) (ks as { audio?: unknown }).audio = audio;
  return ks;
}

// ============================================================
// 课文听读（passages）构建
// 读 data/passages/{subject}/{bookId}.json，对每个 sentence 注入音频路径，
// 输出到 public/data/books/{bookId}/passages.json
// 返回一个 Set，记录有课文的 bookId，供上游给 Book 打 hasPassages 标记
// ============================================================

/**
 * 读 render_pages.py 写的 pages.json 映射。
 * 结构：{ bookId, offset, passages: [{passage_id, page_hint, pdf_page, pages: [n...]}] }
 * 这个映射已经把 Gemini 的 page_hint 应用了书级 offset，得到真实 PDF 物理页 + ±1 兜底。
 */
interface PagesMapping {
  bookId: string;
  offset: number;
  passages: Array<{
    passage_id: string;
    page_hint: number | null;
    pdf_page: number | null;
    pages: number[];
  }>;
}

interface PagesInfo {
  pdfPage: number | null;
  pages: number[];
}

async function loadPagesMapping(bookId: string): Promise<Map<string, PagesInfo>> {
  const file = path.join(PAGES_ROOT, bookId, "pages.json");
  if (!existsSync(file)) return new Map();
  try {
    const doc = JSON.parse(await fs.readFile(file, "utf-8")) as PagesMapping;
    return new Map(
      doc.passages.map(p => [
        p.passage_id,
        { pdfPage: p.pdf_page, pages: p.pages },
      ]),
    );
  } catch {
    return new Map();
  }
}

async function buildPassages(): Promise<Set<string>> {
  const withPassages = new Set<string>();
  if (!existsSync(PASSAGES_SRC)) {
    console.log("  [跳过] data/passages/ 不存在，无课文听读数据");
    return withPassages;
  }
  const subjectDirs = await fs.readdir(PASSAGES_SRC);
  let totalBooks = 0;
  let totalPassages = 0;
  let totalSentences = 0;
  let audioHit = 0;
  let passageWithImage = 0;

  for (const subject of subjectDirs) {
    const subjectDir = path.join(PASSAGES_SRC, subject);
    let stat;
    try {
      stat = await fs.stat(subjectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const files = (await fs.readdir(subjectDir)).filter(
      f => f.endsWith(".json") && !f.endsWith(".draft.json"),
    );
    for (const f of files) {
      const srcPath = path.join(subjectDir, f);
      let doc: {
        bookId: string;
        subject: SubjectId;
        textbook: string;
        passages: Array<{
          id: string;
          unitNumber: number | null;
          lessonNumber: number;
          title: string;
          kind: Passage["kind"];
          author?: string | null;
          language: "Chinese" | "English";
          sentences: string[];
          page_hint?: number | null;
        }>;
      };
      try {
        doc = JSON.parse(await fs.readFile(srcPath, "utf-8"));
      } catch (e) {
        console.warn(`  ⚠️  解析失败 ${f}: ${(e as Error).message}`);
        continue;
      }

      const bookId = doc.bookId;
      if (!bookId || !Array.isArray(doc.passages) || doc.passages.length === 0) {
        continue;
      }

      const pagesMap = await loadPagesMapping(bookId);

      const enriched: Passage[] = doc.passages.map(p => {
        const info = pagesMap.get(p.id) ?? { pdfPage: null, pages: [] };
        const pageImages = info.pages.map(
          n => `/textbook-pages/${bookId}/p${n}.jpg`,
        );
        if (pageImages.length > 0) passageWithImage++;
        return {
          id: p.id,
          bookId,
          unitNumber: p.unitNumber,
          lessonNumber: p.lessonNumber,
          title: p.title,
          kind: p.kind,
          author: p.author ?? null,
          language: p.language,
          pageHint: p.page_hint ?? null,
          pdfPage: info.pdfPage,
          pageImages,
          sentences: p.sentences.map(s => {
            const audio = audioFor(s);
            if (audio) audioHit++;
            totalSentences++;
            return { text: s, audio };
          }),
        };
      });

      const bookDir = path.join(DATA_DST, "books", bookId);
      await fs.mkdir(bookDir, { recursive: true });
      const out: BookPassages = {
        bookId,
        subject: doc.subject,
        textbook: doc.textbook,
        passages: enriched,
      };
      await fs.writeFile(
        path.join(bookDir, "passages.json"),
        JSON.stringify(out, null, 2),
        "utf-8",
      );

      withPassages.add(bookId);
      totalBooks++;
      totalPassages += enriched.length;
    }
  }

  console.log(
    `📖 课文听读: ${totalBooks} 本 / ${totalPassages} 篇 / ${totalSentences} 句 ` +
      `(${audioHit} 句已生成 TTS, ${totalSentences - audioHit} 句待合成)`,
  );
  console.log(
    `📕 课本原页: ${passageWithImage}/${totalPassages} 篇挂上了 pageImages`,
  );
  return withPassages;
}

// ============================================================
// 故事阅读（stories）构建
// 读 data/stories/{subject}/{bookId}.json，注入 TTS 音频路径，
// 输出到 public/data/books/{bookId}/stories.json
// ============================================================

function decorateStoryQuestion(q: StoryQuestion): StoryQuestion {
  const audio: NonNullable<StoryQuestion["audio"]> = {};
  const qa = audioFor(q.question);
  if (qa) audio.question = qa;
  if (q.options && q.options.length) {
    const opts = q.options.map(o => audioFor(o) ?? null);
    if (opts.some(Boolean)) audio.options = opts;
  }
  const ea = audioFor(q.explanation);
  if (ea) audio.explanation = ea;
  if (Object.keys(audio).length) q.audio = audio;
  return q;
}

async function buildStories(): Promise<Set<string>> {
  const withStories = new Set<string>();
  if (!existsSync(STORIES_SRC)) {
    console.log("  [跳过] data/stories/ 不存在，无故事数据");
    return withStories;
  }
  const subjectDirs = await fs.readdir(STORIES_SRC);
  let totalBooks = 0;
  let totalStories = 0;
  let totalSentences = 0;
  let audioHit = 0;

  for (const subject of subjectDirs) {
    const subjectDir = path.join(STORIES_SRC, subject);
    let stat;
    try {
      stat = await fs.stat(subjectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    // skip cache dir
    if (subject.startsWith(".")) continue;

    const files = (await fs.readdir(subjectDir)).filter(
      f => f.endsWith(".json"),
    );
    for (const f of files) {
      const srcPath = path.join(subjectDir, f);
      let doc: {
        bookId: string;
        subject: SubjectId;
        textbook: string;
        grade: number;
        stories: Array<{
          id: string;
          unitNumber: number;
          unitTitle: string;
          storyIndex: number;
          title: string;
          language: "Chinese" | "English";
          sentences: string[];
          vocabulary_used?: string[];
          questions: StoryQuestion[];
        }>;
      };
      try {
        doc = JSON.parse(await fs.readFile(srcPath, "utf-8"));
      } catch (e) {
        console.warn(`  ⚠️  解析失败 ${f}: ${(e as Error).message}`);
        continue;
      }

      const bookId = doc.bookId;
      if (!bookId || !Array.isArray(doc.stories) || doc.stories.length === 0) {
        continue;
      }

      const enriched: Story[] = doc.stories.map(s => {
        // decorate questions
        s.questions.forEach(decorateStoryQuestion);

        // check for story image
        const imgPath = path.join(STORY_IMAGES_ROOT, bookId, `${s.id}.jpg`);
        const image = existsSync(imgPath) ? `/story-images/${bookId}/${s.id}.jpg` : undefined;

        return {
          id: s.id,
          bookId,
          unitNumber: s.unitNumber,
          unitTitle: s.unitTitle,
          storyIndex: s.storyIndex,
          title: s.title,
          language: s.language,
          sentences: s.sentences.map(text => {
            const audio = audioFor(text);
            if (audio) audioHit++;
            totalSentences++;
            return { text, audio };
          }),
          questions: s.questions,
          image,
        };
      });

      const bookDir = path.join(DATA_DST, "books", bookId);
      await fs.mkdir(bookDir, { recursive: true });
      const out: BookStories = {
        bookId,
        subject: doc.subject,
        textbook: doc.textbook,
        stories: enriched,
      };
      await fs.writeFile(
        path.join(bookDir, "stories.json"),
        JSON.stringify(out, null, 2),
        "utf-8",
      );

      withStories.add(bookId);
      totalBooks++;
      totalStories += enriched.length;
    }
  }

  console.log(
    `📚 故事阅读: ${totalBooks} 本 / ${totalStories} 篇 / ${totalSentences} 句 ` +
      `(${audioHit} 句已生成 TTS, ${totalSentences - audioHit} 句待合成)`,
  );
  return withStories;
}

// ============================================================
// 学科配置（与 Python 侧 subjects.py 对齐）
// ============================================================

interface SubjectMeta {
  id: SubjectId;
  name: string;
  publisherLabel: string;
}

const SUBJECTS: SubjectMeta[] = [
  { id: "math", name: "数学", publisherLabel: "人教版" },
  { id: "chinese", name: "语文", publisherLabel: "统编版" },
  { id: "english", name: "英语", publisherLabel: "人教版PEP" },
  { id: "science", name: "科学", publisherLabel: "教科版" },
];

// ============================================================
// 文件名解析
// ============================================================

const FILENAME_PATTERNS: { regex: RegExp; grade: number; semester: "up" | "down" }[] = [
  { regex: /一年级上册/, grade: 1, semester: "up" },
  { regex: /二年级上册/, grade: 2, semester: "up" },
  { regex: /三年级上册/, grade: 3, semester: "up" },
  { regex: /四年级上册/, grade: 4, semester: "up" },
  { regex: /五年级上册/, grade: 5, semester: "up" },
  { regex: /六年级上册/, grade: 6, semester: "up" },
  { regex: /一年级下册/, grade: 1, semester: "down" },
  { regex: /二年级下册/, grade: 2, semester: "down" },
  { regex: /三年级下册/, grade: 3, semester: "down" },
  { regex: /四年级下册/, grade: 4, semester: "down" },
  { regex: /五年级下册/, grade: 5, semester: "down" },
  { regex: /六年级下册/, grade: 6, semester: "down" },
];

const GRADE_NAMES = ["", "一", "二", "三", "四", "五", "六"];

function parseStem(
  stem: string,
  subjectId: SubjectId,
): { grade: number; semester: "up" | "down"; bookId: string } | null {
  for (const p of FILENAME_PATTERNS) {
    if (p.regex.test(stem)) {
      // bookId 命名规则：math 维持原状，其他学科加前缀
      const baseId = `g${p.grade}${p.semester}`;
      const bookId = subjectId === "math" ? baseId : `${subjectId}-${baseId}`;
      return { grade: p.grade, semester: p.semester, bookId };
    }
  }
  return null;
}

// ============================================================
// 单本教材处理
// ============================================================

async function processTextbook(
  subject: SubjectMeta,
  outlineFile: string,
  outlineDir: string,
  quizDir: string,
): Promise<{ book: Book; lessonCount: number; questionCount: number } | null> {
  const stem = outlineFile.replace(/\.json$/, "");
  const parsed = parseStem(stem, subject.id);
  if (!parsed) {
    console.warn(`  ⚠️  跳过无法识别的教材: ${stem}`);
    return null;
  }

  const { grade, semester, bookId } = parsed;
  const outline: Outline = JSON.parse(
    await fs.readFile(path.join(outlineDir, outlineFile), "utf-8"),
  );

  const bookDir = path.join(DATA_DST, "books", bookId);
  await fs.mkdir(bookDir, { recursive: true });

  // 处理每个单元 → 拆成多个 lesson
  const allLessons: Lesson[] = [];

  for (const unit of outline.units) {
    const quizPath = path.join(quizDir, `${stem}_unit${unit.unit_number}.json`);
    let quiz: QuizFile;
    try {
      quiz = JSON.parse(await fs.readFile(quizPath, "utf-8"));
    } catch {
      console.warn(`    ⚠️  缺失题库: ${stem}_unit${unit.unit_number}.json`);
      continue;
    }

    quiz.knowledge_summary.forEach(decorateKnowledge);
    quiz.unit_test.questions.forEach(decorateQuestion);
    quiz.exam?.questions?.forEach(decorateQuestion);

    const ksByPoint = new Map(quiz.knowledge_summary.map(ks => [ks.point, ks]));
    const allUnitQuestions = quiz.unit_test.questions;

    // 按 knowledge_point 分组
    const byKp = new Map<string, Question[]>();
    for (const q of allUnitQuestions) {
      const kp = q.knowledge_point || "其他";
      if (!byKp.has(kp)) byKp.set(kp, []);
      byKp.get(kp)!.push(q);
    }

    // 按大纲中的 KP 顺序生成 lessons
    const kpNames = unit.knowledge_points.map(kp => kp.name);
    for (const kp of byKp.keys()) {
      if (!kpNames.includes(kp)) kpNames.push(kp);
    }

    const unitLessons: Lesson[] = [];
    kpNames.forEach((kpName, idx) => {
      const questions = byKp.get(kpName) ?? [];
      if (questions.length === 0) return;
      unitLessons.push({
        id: `${bookId}-u${unit.unit_number}-kp${idx + 1}`,
        title: kpName,
        bookId,
        unitNumber: unit.unit_number,
        unitTitle: unit.title,
        kpIndex: idx,
        kpTotal: kpNames.length,
        questions,
        knowledge: ksByPoint.get(kpName) ?? null,
      });
    });

    const realTotal = unitLessons.length;
    unitLessons.forEach((l, i) => {
      l.kpIndex = i;
      l.kpTotal = realTotal;
    });

    allLessons.push(...unitLessons);
  }

  // 写每个 lesson 一个 JSON 文件
  const lessonDir = path.join(bookDir, "lessons");
  await fs.mkdir(lessonDir, { recursive: true });
  for (const lesson of allLessons) {
    await fs.writeFile(
      path.join(lessonDir, `${lesson.id}.json`),
      JSON.stringify(lesson, null, 2),
      "utf-8",
    );
  }

  // 写大纲
  const outlineWithLessons = {
    ...outline,
    bookId,
    grade,
    semester,
    subject: subject.id,
    lessons: allLessons.map(l => ({
      id: l.id,
      title: l.title,
      unitNumber: l.unitNumber,
      unitTitle: l.unitTitle,
      kpIndex: l.kpIndex,
      kpTotal: l.kpTotal,
      questionCount: l.questions.length,
    })),
  };
  await fs.writeFile(
    path.join(bookDir, "outline.json"),
    JSON.stringify(outlineWithLessons, null, 2),
    "utf-8",
  );

  const semesterName = semester === "up" ? "上册" : "下册";
  const gradeName = `${GRADE_NAMES[grade]}年级`;
  const book: Book = {
    id: bookId,
    grade,
    semester,
    subject: subject.id,
    gradeName,
    semesterName,
    subjectName: subject.name,
    textbookName: `${gradeName}${semesterName}`,
    fullName: `${subject.publisherLabel}小学${subject.name}${gradeName}${semesterName}`,
    unitsCount: outline.units.length,
    lessonsCount: allLessons.length,
  };

  const questionCount = allLessons.reduce((s, l) => s + l.questions.length, 0);
  return { book, lessonCount: allLessons.length, questionCount };
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("🚀 build-data: 开始处理 output/ → public/data/");
  console.log(`   源: ${OUTPUT_SRC}`);
  console.log(`   目标: ${DATA_DST}`);

  // 清空目标目录
  await fs.rm(DATA_DST, { recursive: true, force: true });
  await fs.mkdir(DATA_DST, { recursive: true });
  await fs.mkdir(path.join(DATA_DST, "books"), { recursive: true });

  // 索引已生成的 TTS 音频文件
  const audio = await buildAudioIndex();
  console.log(`🔊 已索引 ${audio.size} 个 TTS 音频文件`);

  // 构建课文听读 + 故事阅读（在教材处理之前跑一次，得到 bookId → 有无课文/故事 的映射）
  const booksWithPassages = await buildPassages();
  const booksWithStories = await buildStories();

  const books: Book[] = [];
  let totalLessons = 0;
  let totalQuestions = 0;

  // 遍历每个学科目录
  for (const subject of SUBJECTS) {
    const subjectDir = path.join(OUTPUT_SRC, subject.id);
    if (!existsSync(subjectDir)) {
      console.log(`  [跳过] 学科 ${subject.id} 没有数据目录`);
      continue;
    }

    const outlineDir = path.join(subjectDir, "outlines");
    const quizDir = path.join(subjectDir, "quizzes");
    if (!existsSync(outlineDir)) {
      console.log(`  [跳过] 学科 ${subject.id} 没有 outlines/`);
      continue;
    }

    const outlineFiles = (await fs.readdir(outlineDir)).filter(f => f.endsWith(".json"));
    if (outlineFiles.length === 0) {
      console.log(`  [跳过] 学科 ${subject.id} outlines 为空`);
      continue;
    }

    console.log(`\n📘 处理学科: ${subject.name} (${subject.id}) — ${outlineFiles.length} 本教材`);

    for (const outlineFile of outlineFiles) {
      const result = await processTextbook(subject, outlineFile, outlineDir, quizDir);
      if (!result) continue;
      if (booksWithPassages.has(result.book.id)) {
        result.book.hasPassages = true;
      }
      if (booksWithStories.has(result.book.id)) {
        result.book.hasStories = true;
      }
      books.push(result.book);
      totalLessons += result.lessonCount;
      totalQuestions += result.questionCount;
      console.log(
        `  ✓ ${result.book.textbookName.padEnd(8)} ${result.book.unitsCount} 单元 → ${result.lessonCount.toString().padStart(2)} 节课`,
      );
    }
  }

  // 排序：先按学科 (math 最前)，再按学期 (上 → 下)，再按年级
  const subjectOrder: Record<string, number> = {
    math: 0,
    chinese: 1,
    english: 2,
    science: 3,
  };
  books.sort((a, b) => {
    const sa = subjectOrder[a.subject ?? "math"] ?? 99;
    const sb = subjectOrder[b.subject ?? "math"] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.semester !== b.semester) return a.semester === "up" ? -1 : 1;
    return a.grade - b.grade;
  });

  const index: SiteIndex = {
    books,
    generatedAt: new Date().toISOString(),
    totalLessons,
    totalQuestions,
  };
  await fs.writeFile(path.join(DATA_DST, "index.json"), JSON.stringify(index, null, 2), "utf-8");

  console.log("\n📊 汇总:");
  console.log(`   教材: ${books.length} 本`);
  console.log(`   课程: ${totalLessons} 节`);
  console.log(`   题目: ${totalQuestions} 道`);
  // 按学科分组打印
  const bySubject = new Map<SubjectId, number>();
  for (const b of books) {
    const sid = (b.subject ?? "math") as SubjectId;
    bySubject.set(sid, (bySubject.get(sid) ?? 0) + 1);
  }
  for (const [sid, n] of bySubject) {
    console.log(`     - ${sid}: ${n} 本`);
  }
  console.log("✅ build-data 完成");
}

main().catch(err => {
  console.error("❌ build-data 失败:", err);
  process.exit(1);
});
