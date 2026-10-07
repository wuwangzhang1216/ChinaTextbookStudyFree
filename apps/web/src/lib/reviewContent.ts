import type { Lesson } from "@/types";
import type { SrsMistakeEntry } from "@cstf/core/srs";

type LessonMap = Map<string, Lesson | null>;
type FetchLesson = (url: string, init?: RequestInit) => Promise<Response>;

/** Historical snapshots must never drive grading after published content changes. */
export async function loadReviewLessons(entries: SrsMistakeEntry[], fetchLesson: FetchLesson = fetch, timeoutMs = 15_000): Promise<LessonMap> {
  const lessons = await Promise.all([...new Set(entries.map(entry => entry.lessonId))].map(async id => {
    if (!/^(?:(?:chinese|english|science)-)?g[1-6](?:up|down)-u\d+-(?:kp\d+|exam)$/.test(id)) throw new Error("Invalid lesson id");
    const book = id.split("-u")[0];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // The previously installed SW can control this first page until its update
      // activates. A new request URL also bypasses that older SW's SWR cache.
      const response = await fetchLesson(`/data/books/${book}/lessons/${id}.json?review=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 404) return [id, null] as const;
      if (!response.ok) throw new Error(`Lesson unavailable: ${response.status}`);
      const lesson: Lesson = await response.json();
      if (lesson.id !== id || !Array.isArray(lesson.questions) || lesson.questions.some(q =>
        !Number.isInteger(q.id) || typeof q.question !== "string" || typeof q.answer !== "string" || !Array.isArray(q.options))) {
        throw new Error("Invalid lesson content");
      }
      return [id, lesson] as const;
    } finally {
      clearTimeout(timeout);
    }
  }));
  return new Map(lessons);
}

/** Preserve dates, boxes and reward history; remove only questions confirmed absent. */
export function reconcileMistakes<T extends SrsMistakeEntry>(bank: T[], lessons: LessonMap): T[] {
  return bank.flatMap(entry => {
    if (!lessons.has(entry.lessonId)) return [entry];
    const lesson = lessons.get(entry.lessonId);
    const question = lesson?.questions.find(q => q.id === entry.question.id);
    return question ? [{ ...entry, question, lessonTitle: lesson!.title }] : [];
  });
}
