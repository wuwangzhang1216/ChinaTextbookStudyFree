import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeAnswer } from "../../packages/core/src/grade";
import type { Lesson } from "../../packages/core/src/types";
import type { SrsMistakeEntry } from "../../packages/core/src/srs";
import { loadReviewLessons, reconcileMistakes } from "../../apps/web/src/lib/reviewContent";
import { reviewQueue } from "../../apps/web/src/lib/reviewQueue";

async function main() {
  const correction = JSON.parse(fs.readFileSync("docs/ux-content-corrections.json", "utf8"))
    .find((q: { lesson_id: string; question_id: number }) => q.lesson_id === "g1up-u6-kp2" && q.question_id === 11);
  const entry: SrsMistakeEntry = { lessonId: correction.lesson_id, question: correction.before,
    addedAt: "2026-01-01", box: 2, correctCount: 1, nextReviewDate: "2999-01-01" };
  const lesson = { id: entry.lessonId, title: "现在的题目", questions: [correction.after] } as Lesson;
  let requests = 0;
  const lessons = await loadReviewLessons([entry, entry], async (url, init) => {
    requests++;
    assert.match(url, /^\/data\/books\/g1up\/lessons\/g1up-u6-kp2\.json(?:\?|$)/);
    assert.equal(init?.cache, "no-store");
    return new Response(JSON.stringify(lesson));
  });
  assert.equal(requests, 1, "fetch each source lesson once");
  const refreshed = reconcileMistakes([entry], lessons);
  const staleCache = new Map([["/data/books/g1up/lessons/g1up-u6-kp2.json", { ...lesson, questions: [correction.before] }]]);
  const firstLoad = await loadReviewLessons([entry], async url => new Response(JSON.stringify(staleCache.get(url) ?? lesson)));
  assert(gradeAnswer(reconcileMistakes([entry], firstLoad)[0].question, "B"), "the first new page must bypass an installed older SW's stale JSON before that SW updates");
  assert(gradeAnswer(reviewQueue(refreshed, true)[0].entry.question, "B"), "the formerly impossible old question must use the corrected answer");
  assert.equal(refreshed[0].nextReviewDate, entry.nextReviewDate);
  assert.equal(refreshed[0].box, entry.box);
  assert.equal(refreshed[0].correctCount, entry.correctCount);
  assert.equal(entry.question.answer, correction.before.answer, "do not mutate historic inputs");
  for (const prefix of ["", "chinese-", "english-", "science-"]) {
    const id = `${prefix}g3up-u1-kp1`;
    const current = await loadReviewLessons([{ ...entry, lessonId: id }], async () => new Response(JSON.stringify({ ...lesson, id })));
    assert.equal(current.get(id)?.id, id, "all four subjects must load");
  }
  assert.deepEqual(reconcileMistakes([entry], new Map([[entry.lessonId, { ...lesson, questions: [] }]])), [], "retire removed questions without grading or rewards");
  const removed = await loadReviewLessons([entry], async () => new Response(null, { status: 404 }));
  assert.deepEqual(reconcileMistakes([entry], removed), []);
  for (const response of [new Response(null, { status: 503 }), new Response("not JSON"), new Response(JSON.stringify({ ...lesson, id: "wrong" }))]) {
    await assert.rejects(loadReviewLessons([entry], async () => response), "failed loads must not silently fall back to ungradable snapshots");
  }
  await assert.rejects(loadReviewLessons([{ ...entry, lessonId: "../secrets" }], async () => { throw new Error("must not fetch"); }));
  await assert.rejects(loadReviewLessons([entry], async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
  }), 5), /timed out/, "stalled requests must eventually expose the retry screen");
  console.log("PASS: old review snapshots resolve current content, preserve SRS, retire removed questions, and reject failed/invalid loads.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
