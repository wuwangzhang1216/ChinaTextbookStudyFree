import type { Lesson } from '@/types';

export type LessonWarmupKind = 'count' | 'school' | null;
/** Warmups complement existing lessons; they never rewrite questions or grades. */
export function lessonWarmupKind(lesson: Pick<Lesson, 'id' | 'questions'>): LessonWarmupKind {
  if (lesson.id === 'g1up-u1-kp1') return 'count';
  const first = lesson.questions[0];
  if (lesson.id === 'g1up-2026-u101-kp1' && first?.id === 1010001 &&
      first.answer === '第2层' && first.question.startsWith('教学楼有4层，')) return 'school';
  return null;
}

/** Preserve pages already heard in the previous text introduction. */
export function resumeWarmupHandbook(kind: LessonWarmupKind, session: {
  introMode?: string; introPage?: number; introCompletedPages?: number[]; warmupCounted?: number[];
}): boolean {
  return session.introMode === 'handbook' || (kind === 'school' &&
    !session.warmupCounted?.length && ((session.introPage ?? 0) > 0 || !!session.introCompletedPages?.length));
}
