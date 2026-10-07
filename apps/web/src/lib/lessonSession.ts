/**
 * lessonSession —— 「未完成课程会话」的判定口径单一事实源（webrunner-7）。
 *
 * 之前三处各写各的：
 *   - LessonStartModal 用 `index > 0`（index 其实是"答对数"，全答错时恒为 0 → 不提示、也没有重开入口）
 *   - LessonRunner 恢复只看 lessonId（一题未答的空会话也会被当成"有进度"，从而跳过课前知识讲解）
 *   - ContinueLearningCard 用 correctCount + mistakeCount
 * 统一为：**同一课程 + 已保存学习阶段或实际作答** 才算可续会话；剩余题数一律看持久化队列长度。
 */

import type { ActiveLessonSession } from "@/store/progress";

/** 本次会话已经首答过的题数（答对 + 答错）—— 全答错也算作答过 */
export function sessionAnsweredCount(session: ActiveLessonSession): number {
  return session.correctCount + session.mistakeCount;
}

/**
 * 会话是否有可恢复的学习阶段或实际作答。
 * solvedIds / index 只是兜底：老版本会话（无 queueIds/solvedIds）也能正确判定。
 */
export function hasLessonProgress(
  session: ActiveLessonSession | null | undefined,
): session is ActiveLessonSession {
  if (!session) return false;
  if (session.stage === "intro" || session.stage === "practice") return true;
  if (sessionAnsweredCount(session) > 0) return true;
  if ((session.solvedIds?.length ?? 0) > 0) return true;
  return session.index > 0;
}

/** 该课程是否有可续的会话；有则返回它，否则 null */
export function resumableSession(
  session: ActiveLessonSession | null | undefined,
  lessonId: string,
): ActiveLessonSession | null {
  if (!session || session.lessonId !== lessonId) return null;
  return hasLessonProgress(session) ? session : null;
}

/**
 * 还剩多少题要做。
 * 优先用持久化队列长度（含错题重排回队尾的题，口径与课内进度一致）；
 * 老会话没有 queueIds 时退回 total - index。
 */
export function remainingQuestionCount(
  session: ActiveLessonSession,
  total: number,
): number {
  const queued = session.queueIds?.length ?? 0;
  if (queued > 0) return Math.min(queued, total);
  return Math.max(0, total - session.index);
}

/** Restore feedback without grading again; reconcile older snapshots and changed content. */
export function restoreQuestionSession(session: ActiveLessonSession, ids: number[], contentKey?: string) {
  // Equal IDs do not establish equal prompts, answers or explanations. Unversioned
  // legacy sessions restart once; the runner explains this and retains earned rewards.
  if (contentKey !== undefined && session.contentKey !== contentKey) return null;
  const valid = new Set(ids);
  const solved = [...new Set(session.solvedIds ?? ids.slice(0, session.index))].filter(id => valid.has(id));
  const pending = [...new Set(session.queueIds ?? ids.slice(session.index))].filter(id => valid.has(id) && !solved.includes(id));
  const explicitCurrent = session.currentId != null && valid.has(session.currentId);
  let currentId = explicitCurrent ? session.currentId! : pending.shift() ?? null;
  const phase: "checked" | "answering" = explicitCurrent && session.phase === "checked" && typeof session.checkedCorrect === "boolean" ? "checked" : "answering";
  const queue = pending.filter(id => !(phase === "answering" && id === currentId));
  const known = new Set([...solved, ...queue, ...(currentId == null ? [] : [currentId])]);
  for (const id of ids) if (!known.has(id)) queue.push(id);
  // All former questions may have disappeared in a content update.
  if (currentId == null) currentId = queue.shift() ?? null;
  // Legacy snapshots store the unsolved fresh prefix followed by retried mistakes.
  const freshRemaining = Math.max(0, ids.length - session.correctCount - session.mistakeCount);
  const attempted = session.attemptedIds ?? [...solved, ...(session.queueIds ?? []).slice(freshRemaining)];
  return {
    currentId, queue, solved, phase,
    answer: explicitCurrent ? session.draftAnswer ?? "" : "",
    isCorrect: phase === "checked" ? session.checkedCorrect! : null,
    attempted: attempted.filter(id => valid.has(id)),
  };
}
