"use client";

/**
 * LessonStartModal — 点击路径节点后弹出的课程摘要卡
 *
 * 多邻国风格：小卡片显示课程标题、题目数、预计 XP，下方一个大"开始"按钮。
 * 若心数为 0，按钮禁用并显示下一颗心的倒计时。
 */

import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Lightning, Heart } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressStore } from "@/store/progress";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";

interface LessonStartModalProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  lessonId: string;
  title: string;
  questionCount: number;
  unitNumber: number;
  kpIndex: number;
  kpTotal: number;
}

export function LessonStartModal({
  open,
  onClose,
  bookId,
  lessonId,
  title,
  questionCount,
  unitNumber,
  kpIndex,
  kpTotal,
}: LessonStartModalProps) {
  const router = useRouter();
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const activeLesson = useProgressStore(s => s.activeLesson);
  const clearLessonSession = useProgressStore(s => s.clearLessonSession);

  const canStart = hearts > 0;
  const msToNext = nextHeartAt ? Math.max(0, nextHeartAt - now) : 0;
  const estimatedXp = questionCount * 10;

  // 是否存在同一课程的未完成会话？
  const resume =
    activeLesson && activeLesson.lessonId === lessonId && activeLesson.index > 0
      ? activeLesson
      : null;
  const remaining = resume ? Math.max(0, questionCount - resume.index) : questionCount;

  function handleStart() {
    if (!canStart) return;
    playSfx("tap");
    haptic("medium");
    router.push(`/lesson/${bookId}/${lessonId}/`);
  }

  function handleRestart() {
    // 放弃旧进度重新开始
    clearLessonSession();
    handleStart();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood={canStart ? "happy" : "sad"} size={88} />
        <div className="text-xs text-ink-light mt-2 font-semibold">
          第 {unitNumber} 单元 · {kpIndex}/{kpTotal}
        </div>
        <h2 className="text-2xl font-extrabold text-ink mt-1">{title}</h2>

        {resume && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border-2 border-secondary/30 text-secondary-dark text-xs font-extrabold">
            上次答到第 {resume.index + 1} 题 · 还剩 {remaining} 题
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-full mt-5">
          <div
            className="bg-bg-soft rounded-2xl p-3 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
          >
            <div className="text-xs text-ink-light">{resume ? "剩余题数" : "题目数"}</div>
            <div className="text-xl font-extrabold text-ink">
              {resume ? remaining : questionCount}
            </div>
          </div>
          <div
            className="bg-bg-soft rounded-2xl p-3 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
          >
            <div className="text-xs text-ink-light">可获得</div>
            <div className="text-xl font-extrabold text-secondary flex items-center justify-center gap-1">
              <Lightning className="w-4 h-4" />+{estimatedXp}
            </div>
          </div>
        </div>

        {!canStart && (
          <div className="mt-4 w-full rounded-2xl border-2 border-danger/30 bg-danger/10 px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-danger font-extrabold">
              <Heart className="w-5 h-5" />
              <span>心数不足</span>
            </div>
            {nextHeartAt && (
              <div className="mt-1 text-xs text-ink-light">
                下一颗心还需{" "}
                <span className="font-extrabold text-danger tabular-nums">
                  {formatMsCountdown(msToNext)}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={canStart ? "btn-chunky-primary w-full mt-6" : "btn-chunky-disabled w-full mt-6"}
        >
          {canStart ? (resume ? "继续学习" : "开始") : "等待恢复"}
        </button>

        {resume && canStart && (
          <button
            type="button"
            onClick={handleRestart}
            className="mt-3 text-sm font-bold text-ink-light hover:text-ink transition-colors"
          >
            重新开始这节课
          </button>
        )}
      </div>
    </Modal>
  );
}
