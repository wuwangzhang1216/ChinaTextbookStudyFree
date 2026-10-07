/** Source defects must stay fixed through export and the runtime grader. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gradeAnswer } from "../../packages/core/src/grade";
import type { Lesson, Question } from "../../packages/core/src/types";

const corrections = JSON.parse(fs.readFileSync("docs/ux-content-corrections.json", "utf8")) as {
  lesson_id: string; question_id: number; after: Question;
}[];
for (const correction of corrections) {
  const book = correction.lesson_id.split("-u")[0];
  const lesson: Lesson = JSON.parse(fs.readFileSync(`apps/web/public/data/books/${book}/lessons/${correction.lesson_id}.json`, "utf8"));
  const question = lesson.questions.find(q => q.id === correction.question_id)!;
  assert(question, `${lesson.id}: missing revised question`);
  const { audio: _audio, ...content } = question;
  assert.deepEqual(content, correction.after);
  if (question.type === "choice") {
    assert.equal(new Set(question.options).size, question.options.length);
    const correctIndex = question.options.indexOf(question.answer);
    assert(correctIndex >= 0);
    question.options.forEach((_, i) => assert.equal(gradeAnswer(question, String.fromCharCode(65 + i)), i === correctIndex));
  } else {
    assert(gradeAnswer(question, question.answer));
    assert(!gradeAnswer(question, "45"), "the decimal result must not be multiplied to accommodate the UI");
  }
  assert(!gradeAnswer(question, ""));
  const fields: [string, string | null | undefined][] = [
    [question.question, question.audio?.question],
    [question.explanation, question.audio?.explanation],
    ...question.options.map((text, i) => [text, question.audio?.options?.[i]] as [string, string | null | undefined]),
  ];
  for (const [text, url] of fields) {
    const hash = createHash("sha1").update(text.trim().replace(/\s+/g, " ")).digest("hex");
    assert.equal(url, `/audio/${hash.slice(0, 2)}/${hash}.mp3`, "repaired text must use matching audio");
    assert(fs.statSync(`apps/web/public${url}`).size > 0);
  }
}
// Both of these source defects accepted the wrong concept, beyond duplicate text.
const closest = corrections.find(q => q.lesson_id === "g1up-u6-kp2" && q.question_id === 16)!.after;
assert.equal(closest.answer, String([13, 11, 18, 20].sort((a, b) => Math.abs(a - 20) - Math.abs(b - 20))[0]));
const boats = corrections.find(q => q.lesson_id === "g4down-u1-kp4")!.after;
assert.deepEqual(boats.options.map(option => {
  const [large, small] = option.match(/\d+/g)!.map(Number);
  return large * 6 + small * 4;
}), [34, 32, 34, 36]);
console.log(`PASS: ${corrections.length} source repairs; unique options, correct/wrong/empty grading, arithmetic constraints and matching MP3 assets.`);
