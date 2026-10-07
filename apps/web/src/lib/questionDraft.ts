import type { Question } from "@/types";
import { gradeAnswer } from "./grade";

/** Map a saved partial sentence back to distinct option indices, including repeated words. */
export function wordOrderIndices(options: string[], answer: string): number[] {
  const picked: number[] = [];
  for (const token of answer.split(",").filter(Boolean)) {
    const index = options.findIndex((option, i) => option.trim() === token.trim() && !picked.includes(i));
    if (index >= 0) picked.push(index);
  }
  return picked;
}

export function matchingPairs(question: Question, answer: string): Partial<Record<string, string>> {
  const expected = new Set(question.answer.split(",").map(pair => pair.trim().toUpperCase()));
  const matched: Partial<Record<string, string>> = {};
  for (const pair of answer.split(",").map(pair => pair.trim().toUpperCase())) {
    if (!expected.has(pair)) continue;
    const [left, right] = pair.split("-");
    if (/^[A-D]$/.test(left) && /^[1-4]$/.test(right)) matched[left] = right;
  }
  return matched;
}

/** Matching supplies successful partial pairs, never an incorrect whole-answer attempt. */
export function answerReady(question: Question, answer: string): boolean {
  return !!answer.trim() && (question.type !== "matching" || gradeAnswer(question, answer));
}
