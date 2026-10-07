import assert from "node:assert/strict";
import { reviewQueue } from "../../apps/web/src/lib/reviewQueue";
import type { SrsMistakeEntry } from "../../packages/core/src/srs";

const item: SrsMistakeEntry = { lessonId: "lesson", addedAt: "2026-01-01", nextReviewDate: "2999-01-01", box: 2,
  question: { id: 1, type: "true_false", question: "练习", answer: "对", options: [], explanation: "说明", score: 1, difficulty: 1, knowledge_point: "练习" } };
assert.deepEqual(reviewQueue([item], false), [], "ordinary review must respect future scheduling");
assert.deepEqual(reviewQueue([item], true), [{ entry: item, scheduled: false }], "heart recovery must offer practice when nothing is due, without advancing SRS");
const due = { ...item, nextReviewDate: "2000-01-01", question: { ...item.question, id: 2 } };
const recovery = reviewQueue([item, due, item], true);
assert.deepEqual(recovery.map(q => [q.entry.question.id, q.scheduled]), [[2, true], [1, false]], "scheduled entries lead; repeated bank items appear once");
assert.equal(reviewQueue(Array.from({ length: 10 }, (_, i) => ({ ...item, question: { ...item.question, id: i } })), true).length, 5);
assert.deepEqual(reviewQueue([], true), []);
console.log("PASS: recovery uses available practice, preserves future SRS dates, deduplicates and bounds extra practice.");
