import type { PathLessonMeta } from '@cstf/core';
import type { JumpQuestionSource } from '@cstf/core/jump';
import type { Lesson } from '@/types';

interface JumpOutline {
  lessons: PathLessonMeta[];
  units?: Array<{ unit_number: number; title: string; label?: string }>;
}

/** A jump may only assess an existing destination and a complete prerequisite bank. */
export async function loadJumpData(bookId: string, unitNumber: number, fetcher: typeof fetch = fetch) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookId) || !Number.isInteger(unitNumber) || unitNumber < 1) {
    throw new Error('跳级链接不完整，回到学习页面再试一次吧');
  }
  const outlineRes = await fetcher(`/data/books/${bookId}/outline.json`);
  if (!outlineRes.ok) throw new Error('教材没有加载出来，请返回学习页面重试');
  const outline: JumpOutline = await outlineRes.json();
  const target = outline.units?.find(unit => unit.unit_number === unitNumber);
  const targetLesson = outline.lessons.find(lesson => lesson.unitNumber === unitNumber);
  if (!target && !targetLesson) throw new Error('这个单元不存在，请回到学习页面重新选择');
  // Curriculum order can interleave practice themes with numbered units.
  const firstTarget = outline.lessons.findIndex(lesson => lesson.unitNumber === unitNumber);
  const prior = firstTarget < 0 ? [] : outline.lessons.slice(0, firstTarget);
  if (!prior.length) throw new Error('前面还没有课程，不需要跳级哦');
  const sources: JumpQuestionSource[] = await Promise.all(prior.map(async meta => {
    const response = await fetcher(`/data/books/${bookId}/lessons/${meta.id}.json`);
    if (!response.ok) throw new Error('部分题目没有加载出来，请返回后重试');
    const lesson: Lesson = await response.json();
    if (!Array.isArray(lesson.questions) || !lesson.questions.length) {
      throw new Error('部分题目没有加载出来，请返回后重试');
    }
    return { lessonId: meta.id, questions: lesson.questions };
  }));
  return { sources, priorLessonIds: prior.map(lesson => lesson.id), unitTitle: target?.title ?? targetLesson!.unitTitle,
    unitLabel: target?.label ?? targetLesson?.unitLabel ?? `第 ${unitNumber} 单元` };
}
