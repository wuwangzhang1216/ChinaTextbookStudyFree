import fs from 'fs';
import path from 'path';

const root = path.resolve('public/data');
const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));

const subjects = ['chinese', 'english', 'science'];
const report = { issues: [], summary: {} };

function addIssue(bookId, kind, detail) {
  report.issues.push({ bookId, kind, detail });
}

for (const book of index.books) {
  if (!subjects.includes(book.subject)) continue;
  const bookDir = path.join(root, 'books', book.id);
  const outlinePath = path.join(bookDir, 'outline.json');
  const lessonsDir = path.join(bookDir, 'lessons');

  if (!fs.existsSync(outlinePath)) { addIssue(book.id, 'missing_outline', outlinePath); continue; }
  if (!fs.existsSync(lessonsDir)) { addIssue(book.id, 'missing_lessons_dir', lessonsDir); continue; }

  const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
  const lessonFiles = fs.readdirSync(lessonsDir).filter(f => f.endsWith('.json'));

  // Outline has a flat `lessons` array (used by the app directly)
  const outlineLessonIds = (outline.lessons || []).map(l => l.id);

  const lessonFileIds = new Set(lessonFiles.map(f => f.replace(/\.json$/, '')));
  for (const id of outlineLessonIds) {
    if (!lessonFileIds.has(id)) addIssue(book.id, 'outline_lesson_missing_file', id);
  }
  for (const id of lessonFileIds) {
    if (!outlineLessonIds.includes(id)) addIssue(book.id, 'lesson_file_not_in_outline', id);
  }

  // expected count from index
  const expected = book.lessonsCount;
  if (expected && lessonFiles.length !== expected) {
    addIssue(book.id, 'lesson_count_mismatch', `index=${expected}, actual=${lessonFiles.length}`);
  }

  let totalQuestions = 0;
  let minQ = Infinity, maxQ = 0;
  let lessonsWithNoQuestions = 0;
  let lessonsWithNoKnowledge = 0;
  const questionTypes = {};
  let invalidAnswers = 0;
  let missingFields = 0;

  for (const f of lessonFiles) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(lessonsDir, f), 'utf8'));
    } catch (e) {
      addIssue(book.id, 'parse_error', `${f}: ${e.message}`);
      continue;
    }

    if (!data.id || !data.title || !data.bookId) {
      addIssue(book.id, 'lesson_missing_meta', f);
    }
    if (data.bookId && data.bookId !== book.id) {
      addIssue(book.id, 'bookId_mismatch', `${f}: ${data.bookId}`);
    }

    const qs = data.questions || [];
    if (qs.length === 0) lessonsWithNoQuestions++;
    totalQuestions += qs.length;
    if (qs.length < minQ) minQ = qs.length;
    if (qs.length > maxQ) maxQ = qs.length;

    if (!data.knowledge || !data.knowledge.core_concept) lessonsWithNoKnowledge++;

    for (const q of qs) {
      if (q.type) questionTypes[q.type] = (questionTypes[q.type] || 0) + 1;
      if (q.question == null || q.question === '') missingFields++;
      if (q.answer == null || q.answer === '') missingFields++;
      if (q.type === 'choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          addIssue(book.id, 'choice_bad_options', `${f} q${q.id}`);
        } else if (!q.options.includes(q.answer)) {
          addIssue(book.id, 'choice_answer_not_in_options', `${f} q${q.id}: answer="${q.answer}"`);
          invalidAnswers++;
        }
      }
      if (q.type === 'true_false') {
        const ok = ['对', '错', '正确', '错误', 'true', 'false', 'T', 'F'].includes(String(q.answer));
        if (!ok) addIssue(book.id, 'true_false_bad_answer', `${f} q${q.id}: ${q.answer}`);
      }
    }
  }

  report.summary[book.id] = {
    fullName: book.fullName,
    lessonFiles: lessonFiles.length,
    expectedLessons: expected,
    outlineLessons: outlineLessonIds.length,
    totalQuestions,
    avgQuestions: lessonFiles.length ? (totalQuestions / lessonFiles.length).toFixed(1) : 0,
    minQuestions: minQ === Infinity ? 0 : minQ,
    maxQuestions: maxQ,
    lessonsWithNoQuestions,
    lessonsWithNoKnowledge,
    questionTypes,
    invalidAnswers,
    missingFields,
  };
}

// Aggregate per subject
const perSubject = {};
for (const book of index.books) {
  if (!subjects.includes(book.subject)) continue;
  const s = report.summary[book.id];
  if (!s) continue;
  const sub = (perSubject[book.subject] ||= { books: 0, lessons: 0, questions: 0, issues: 0 });
  sub.books++;
  sub.lessons += s.lessonFiles;
  sub.questions += s.totalQuestions;
}
for (const i of report.issues) {
  const book = index.books.find(b => b.id === i.bookId);
  if (book && perSubject[book.subject]) perSubject[book.subject].issues++;
}

console.log('=== PER-SUBJECT TOTALS ===');
console.log(JSON.stringify(perSubject, null, 2));
console.log('\n=== PER-BOOK SUMMARY ===');
for (const [id, s] of Object.entries(report.summary)) {
  console.log(`${id.padEnd(20)} lessons=${s.lessonFiles}/${s.expectedLessons} Q=${s.totalQuestions} avg=${s.avgQuestions} min/max=${s.minQuestions}/${s.maxQuestions} noQ=${s.lessonsWithNoQuestions} noKnow=${s.lessonsWithNoKnowledge}`);
}
console.log('\n=== ISSUE COUNTS BY KIND ===');
const byKind = {};
for (const i of report.issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
console.log(JSON.stringify(byKind, null, 2));

console.log(`\nTotal issues: ${report.issues.length}`);
if (report.issues.length) {
  console.log('\n=== FIRST 40 ISSUES ===');
  for (const i of report.issues.slice(0, 40)) {
    console.log(`[${i.bookId}] ${i.kind}: ${i.detail}`);
  }
}

fs.writeFileSync('scripts/check-data-quality.report.json', JSON.stringify(report, null, 2));
