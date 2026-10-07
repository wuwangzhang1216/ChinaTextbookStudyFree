import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeAnswer } from "../../packages/core/src/grade";
import type { Question } from "../../packages/core/src/types";

const quiz = JSON.parse(fs.readFileSync("output/math/quizzes/义务教育教科书 · 数学五年级上册_unit4.json", "utf8"));
for (const id of [24, 26]) {
  const q: Question = quiz.unit_test.questions.find((question: Question) => question.id === id);
  const [total, ratio] = q.question.match(/\d+/g)!.map(Number);
  const valid = q.options.map(option => {
    const [a, b] = option.match(/\d+/g)!.map(Number);
    return a + b === total && a === ratio * b;
  });
  assert.equal(valid.filter(Boolean).length, 1, `#${id}: the stated total and ratio must admit exactly one option`);
  q.options.forEach((_, i) => assert.equal(gradeAnswer(q, String.fromCharCode(65 + i)), valid[i], `#${id}: grading must agree with the mathematical conditions`));
}
console.log("PASS: probability totals, ratios and runtime grading agree, with one valid option each.");
