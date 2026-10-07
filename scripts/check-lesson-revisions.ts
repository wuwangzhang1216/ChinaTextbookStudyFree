/** Verify revised lessons through the data builder and actual runtime grader. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gradeAnswer } from "../packages/core/src/grade";
import type { Lesson } from "../packages/core/src/types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]),
  );
  return value;
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function clean(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "audio"));
}
function requireAudio(text: string, url: string | null | undefined): void {
  assert(url, `Missing speech reference for ${text}`);
  const hash = createHash("sha1").update(text.trim().replace(/\s+/g, " ")).digest("hex");
  assert.equal(url, `/audio/${hash.slice(0, 2)}/${hash}.mp3`, `Text/speech mismatch: ${text}`);
  const local = path.resolve("apps/web/public", url.slice(1));
  assert(fs.statSync(local).size > 0, `Missing speech asset: ${url}`);
}

const folder = path.resolve("docs/lesson-reviews");
assert(fs.existsSync(folder), "No applied lesson reviews");
let lessons = 0, questions = 0;
for (const file of fs.readdirSync(folder).filter(f => f.endsWith(".json"))) {
  const ledger = JSON.parse(fs.readFileSync(path.join(folder, file), "utf8"));
  if (!ledger.model_review) continue; // Standalone teacher submissions have no model draft.
  const book = ledger.lesson_id.split("-u")[0];
  const lesson: Lesson = JSON.parse(fs.readFileSync(path.resolve("apps/web/public/data/books", book, "lessons", `${ledger.lesson_id}.json`), "utf8"));
  assert(lesson.knowledge, `${lesson.id}: no knowledge`);
  assert(lesson.questions.length >= 6, `${lesson.id}: insufficient practice`);
  assert.equal(lesson.questions.length, ledger.after_question_count);
  const actual = { knowledge: clean(lesson.knowledge as unknown as Record<string, unknown>),
    questions: lesson.questions.map(q => clean(q as unknown as Record<string, unknown>)) };
  assert.equal(fingerprint(actual), ledger.after_fingerprint, `${lesson.id}: built content differs from reviewed source`);
  assert.equal(ledger.model_review.approved, true);
  assert.deepEqual(ledger.model_review.issues, []);
  const ks = lesson.knowledge;
  for (const field of ["point", "core_concept", "key_formula", "tips"] as const) requireAudio(ks[field], ks.audio?.[field]);
  ks.common_mistakes.forEach((text, i) => requireAudio(text, ks.audio?.common_mistakes?.[i]));
  for (const q of lesson.questions) {
    assert.equal(q.knowledge_point, lesson.title);
    assert(!gradeAnswer(q, ""), `${lesson.id} #${q.id}: empty answer`);
    if (q.type === "choice") {
      const idx = q.options.indexOf(q.answer);
      assert(idx >= 0, `${lesson.id} #${q.id}: answer not in options`);
      for (let i = 0; i < 4; i++) assert.equal(gradeAnswer(q, String.fromCharCode(65 + i)), i === idx, `${lesson.id} #${q.id}: option ${i}`);
    } else {
      assert(gradeAnswer(q, q.answer), `${lesson.id} #${q.id}: correct answer rejected`);
      const wrong = q.type === "true_false" ? (q.answer === "对" ? "错" : "对") : q.type === "fill_blank_text" ? "错误答案" : gradeAnswer(q, "99999") ? "99998" : "99999";
      assert(!gradeAnswer(q, wrong), `${lesson.id} #${q.id}: wrong answer accepted`);
    }
    requireAudio(q.question, q.audio?.question);
    requireAudio(q.explanation, q.audio?.explanation);
    q.options.forEach((text, i) => requireAudio(text.replace(/^[A-Da-d][.、]\s*/, ""), q.audio?.options?.[i]));
    questions++;
  }
  lessons++;
}
assert(lessons > 0, "No model-reviewed lesson revisions");
console.log(`PASS: ${lessons} revised lessons, ${questions} questions; exact reviewed content, correct/wrong/empty grading and content-addressed MP3 references.`);
