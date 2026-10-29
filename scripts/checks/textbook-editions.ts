import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeAnswer } from "../../packages/core/src/grade";
import { computeChestsForBook } from "../../packages/core/src/chestLogic";
import { loadJumpData } from "../../apps/web/src/lib/loadJumpData";
import type { Book, Lesson, Outline, PathLessonMeta } from "../../packages/core/src/types";

const root = "apps/web/public/data";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const books: Book[] = read(`${root}/index.json`).books;
const current = books.find(b => b.id === "g2up-2026")!;
const legacy = books.find(b => b.id === "g2up")!;
assert.equal(current.supersedes, legacy.id);
assert.equal(legacy.supersededBy, current.id);
assert.equal(current.unitsCount, 6);
assert.equal(current.activitiesCount, 2);
assert.equal(current.editionLabel, "2026秋版");
assert.equal(books.filter(b => b.grade === 2 && b.semester === "up" && b.subject === "math" && !b.supersededBy && b.schoolSystem !== "5-4").length, 1);
const outline: Outline & { lessons: PathLessonMeta[] } = read(`${root}/books/${current.id}/outline.json`);
const oldOutline: Outline & { lessons: PathLessonMeta[] } = read(`${root}/books/${legacy.id}/outline.json`);
// Official current preview, page 5. Practice themes retain their own labels
// between numbered units, rather than shifting units four through six.
assert.deepEqual(outline.units.map(u => [u.unit_number, u.title]), [
  [1, "分类与整理"], [2, "1～6的表内乘法"], [3, "1～6的表内除法"],
  [101, "校园小导游"], [4, "厘米和米"], [102, "身体上的尺子"],
  [5, "7～9的表内乘、除法"], [6, "复习与关联"],
]);
assert.deepEqual(outline.units.filter(u => u.label).map(u => u.label), ["综合与实践", "综合与实践"]);
assert.equal(outline.lessons.length, 28);
const oldIds = new Set(oldOutline.lessons.map(l => l.id));
const oldChests = new Set(computeChestsForBook(legacy.id, oldOutline.lessons).map(c => c.id));
assert.ok(computeChestsForBook(current.id, outline.lessons).every(c => !oldChests.has(c.id)));
assert.ok(outline.lessons.every(l => !oldIds.has(l.id)));
let questions = 0;
for (const unit of outline.units) {
  const lessons = outline.lessons.filter(l => l.unitNumber === unit.unit_number);
  assert.deepEqual(lessons.map(l => l.title), unit.knowledge_points.map(k => k.name));
  for (const [i, meta] of lessons.entries()) {
    const lesson: Lesson = read(`${root}/books/${current.id}/lessons/${meta.id}.json`);
    assert.equal(lesson.unitLabel, unit.label);
    assert.equal(lesson.kpIndex, i);
    assert.equal(lesson.kpTotal, lessons.length);
    assert.equal(lesson.knowledge?.point, lesson.title);
    assert.ok(lesson.knowledge?.core_concept && lesson.knowledge?.tips);
    assert.equal(lesson.questions.length, 6);
    const ids = new Set(lesson.questions.map(q => q.id));
    assert.equal(ids.size, 6);
    for (const q of lesson.questions) {
      questions++;
      assert.equal(q.knowledge_point, lesson.title);
      assert.ok(q.explanation);
      if (q.type === "choice") {
        assert.equal(new Set(q.options).size, 4);
        for (const [i, option] of q.options.entries()) {
          assert.equal(gradeAnswer(q, String.fromCharCode(65 + i)), option === q.answer, q.question);
        }
      } else {
        assert.equal(gradeAnswer(q, q.answer), true, q.question);
        assert.equal(gradeAnswer(q, q.type === "true_false" ? (q.answer === "对" ? "错" : "对") : "999999"), false, q.question);
      }
      assert.equal(gradeAnswer(q, ""), false, q.question);
      // Independently verify the explicit arithmetic questions.
      const expression = q.question.match(/^(\d+)\s*([×÷])\s*(\d+)等于多少？$/);
      if (expression) {
        const [, a, op, b] = expression;
        assert.equal(Number(q.answer), op === "×" ? Number(a) * Number(b) : Number(a) / Number(b));
      }
    }
  }
}
assert.equal(questions, 168);
assert.equal(oldOutline.units[0].title, "长度单位");
assert.ok(oldOutline.lessons.every(l => read(`${root}/books/${legacy.id}/lessons/${l.id}.json`).id === l.id));
console.log("PASS textbook editions: official section order, practice labels, 28 lessons/168 questions, actual grading, legacy routes and independent progress/chest IDs.");

async function checkJumpOrder() {
  const fetcher = (async (url: string) => new Response(readFileSync(`apps/web/public${url}`, "utf8"))) as typeof fetch;
  const fourth = await loadJumpData(current.id, 4, fetcher);
  assert.ok(fourth.priorLessonIds.some(id => id.includes("-u101-")), "Campus practice precedes numbered unit four");
  assert.ok(!fourth.priorLessonIds.some(id => id.includes("-u102-")), "Body ruler practice comes after unit four");
  const campus = await loadJumpData(current.id, 101, fetcher);
  assert.equal(campus.unitLabel, "综合与实践");
  assert.ok(campus.priorLessonIds.every(id => /-u[123]-/.test(id)), "An activity cannot include later units in its prerequisites");
  console.log("PASS edition jump tests follow curriculum order across interleaved practice themes.");
}
void checkJumpOrder().catch(error => { console.error(error); process.exitCode = 1; });
