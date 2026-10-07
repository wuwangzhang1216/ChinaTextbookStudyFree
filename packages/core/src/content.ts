import type { Lesson } from "./types";

/** Exact semantic identity; ignore media URLs and object-key ordering. One active lesson is stored. */
export function lessonContentKey(lesson: Pick<Lesson, "knowledge" | "questions">): string {
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "audio")
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, clean(item)]));
    }
    return value;
  }
  return `v1:${JSON.stringify(clean({ knowledge: lesson.knowledge, questions: lesson.questions }))}`;
}
