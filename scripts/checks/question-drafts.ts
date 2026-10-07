import assert from "node:assert/strict";
import { wordOrderIndices, matchingPairs, answerReady } from "../../apps/web/src/lib/questionDraft";
import type { Question } from "../../packages/core/src/types";

assert.deepEqual(wordOrderIndices(["I", "like", "I", "can"], "I,can,I"), [0, 3, 2], "restore partial order with repeated words");
assert.deepEqual(wordOrderIndices(["I", "can"], "gone,I"), [0]);
const question: Question = { id: 1, type: "matching", question: "配对", options: ["a", "b", "c", "d", "1", "2", "3", "4"],
  answer: "A-2,B-1,C-4,D-3", explanation: "", score: 1, difficulty: 1, knowledge_point: "配对" };
assert.deepEqual(matchingPairs(question, "B-1,A-2"), { B: "1", A: "2" }, "refresh must retain completed pairs");
assert.deepEqual(matchingPairs(question, "A-1,B-1,B-2,Z-9"), { B: "1" }, "retain only valid completed pairs");
assert.equal(answerReady(question, "A-2,B-1"), false, "partial matching must not consume a heart or submit as wrong");
assert.equal(answerReady(question, "D-3,A-2,B-1,C-4"), true);
assert.equal(answerReady({ ...question, type: "word_order" }, "a"), true, "word-order drafts remain manually checkable");
console.log("PASS: partial word order, repeated words, matching drafts, and completion-gated submission.");
