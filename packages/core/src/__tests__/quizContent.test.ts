import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeAnswer } from "../grade";
import type { Question } from "../types";

function sourceQuestions(subject: string, filename: string): Question[] {
  const data = JSON.parse(readFileSync(new URL(`../../../../output/${subject}/quizzes/${filename}`, import.meta.url), "utf8"));
  const questions: Question[] = [];
  function collect(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const object = value as Record<string, unknown>;
    if (typeof object.question === "string" && typeof object.answer === "string") questions.push(object as unknown as Question);
    else Object.values(object).forEach(collect);
  }
  collect(data);
  return questions;
}

describe("corrected source questions (PR #4)", () => {
  it("gives an explicit starting point and a self-contained counting situation", () => {
    const questions = sourceQuestions("math", "义务教育教科书 · 数学一年级上册_unit1.json");
    const countdown = questions.find(q => q.id === 14)!;
    expect(countdown.question).toContain("从10开始");
    const correct = countdown.options.indexOf("8");
    expect(correct).toBeGreaterThanOrEqual(0);
    countdown.options.forEach((_, index) => expect(gradeAnswer(countdown, String.fromCharCode(65 + index))).toBe(index === correct));
    const objects = questions.find(q => q.id === 11)!;
    expect(objects.question).not.toContain("我们的教室");
    expect(objects.question).toContain("铅笔");
  });
  it("offers exactly one grammatical translation for the dinosaur comparison", () => {
    const question = sourceQuestions("english", "义务教育教科书·英语（三年级起点）六年级下册_unit1.json")
      .find(q => q.question.includes("那只恐龙比我高"))!;
    const translations = new Set(["That dinosaur is taller than me.", "That dinosaur is taller than I am."]);
    const valid = question.options.map((option, i) => translations.has(option) ? i : -1).filter(i => i >= 0);
    expect(valid).toHaveLength(1);
    expect(question.options[valid[0]]).toBe(question.answer);
    expect(gradeAnswer(question, String.fromCharCode(65 + valid[0]))).toBe(true);
  });

  it("accepts the equal-price option for two discounts that both produce 140 yuan", () => {
    const question = sourceQuestions("math", "义务教育教科书·数学六年级下册_unit2.json")
      .find(q => q.question.includes("一件上衣 200 元"))!;
    expect(200 * 0.7).toBe(200 - Math.floor(200 / 100) * 30);
    const index = question.options.indexOf("一样便宜");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(gradeAnswer(question, String.fromCharCode(65 + index))).toBe(true);
    expect(gradeAnswer(question, "A")).toBe(false);
    expect(gradeAnswer(question, "B")).toBe(false);
  });

  it("accepts a text response for the microorganism visibility blank", () => {
    const question = sourceQuestions("science", "义务教育教科书·科学六年级上册_unit1.json")
      .find(q => q.knowledge_point === "微生物大小" && q.question.includes("肉眼（）"))!;
    expect(question.type).toBe("fill_blank_text");
    expect(gradeAnswer(question, "无法")).toBe(true);
    expect(gradeAnswer(question, "0")).toBe(false);
  });
});
