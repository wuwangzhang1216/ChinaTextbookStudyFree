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
} from "../src/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_SRC = path.resolve(ROOT, "..", "output");
const DATA_DST = path.resolve(ROOT, "public", "data");

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
