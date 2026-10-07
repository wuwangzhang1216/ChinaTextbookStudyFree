"use client";

/**
 * LessonStartModal — 点击路径节点后弹出的课程摘要卡
 *
 * 多邻国风格：小卡片显示课程标题、题目数、预计 XP，下方一个大"开始"按钮。
 * 若红心为 0，按钮禁用并显示下一颗心的倒计时。
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Lightning, Heart, Gem } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressStore } from "@/store/progress";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import {
  XP_PER_CORRECT,
  WEEKEND_XP_MULTIPLIER,
  EXAM_XP_MULTIPLIER,
  HEART_REFILL_COST,
  isWeekendXpActive,
} from "@cstf/core/economy";
import { useToast } from "./Toast";
import {
  resumableSession,
  remainingQuestionCount,
  sessionAnsweredCount,
} from "@/lib/lessonSession";

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
  /** ⚔️ 单元挑战课：XP ×2 预估 + 挑战徽章（kpIndex/kpTotal 不展示） */
  isExam?: boolean;
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
  isExam = false,
}: LessonStartModalProps) {
  const router = useRouter();
  const toast = useToast();
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const gems = useProgressStore(s => s.gems);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const activeLesson = useProgressStore(s => s.activeLesson);
  const clearLessonSession = useProgressStore(s => s.clearLessonSession);
  const dailyTimeLimitReached = useProgressStore(s => s.dailyTimeLimitReached);

  // hydrate 后才读时间上限（persist 恢复前恒为未达标，避免水合不一致）
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 周末双倍 XP —— 预估所见即所得
  const [weekend] = useState(() => isWeekendXpActive());

  // 是否存在同一课程的未完成会话？（已开始的课不受时间上限影响）
  // 口径统一到 lessonSession helper（webrunner-7）：以前用 index > 0，
  // 而 index 其实是"答对数" —— 全答错的孩子既看不到进度提示也没有重开入口。
  const resume0 = resumableSession(activeLesson, lessonId);

  // ⏱️ 家长时间关怀：达到每日上限后不再开新课；继续已开始的课不受影响
  const timeUp = hydrated && !resume0 && dailyTimeLimitReached();
  const canStart = hearts > 0 && !timeUp;
  const msToNext = nextHeartAt ? Math.max(0, nextHeartAt - now) : 0;
  const estimatedXp =
    questionCount *
    XP_PER_CORRECT *
    (isExam ? EXAM_XP_MULTIPLIER : 1) *
    (weekend ? WEEKEND_XP_MULTIPLIER : 1);

  function handleRefillHearts() {
    playSfx("tap");
    haptic("light");
    const ok = buyHeartRefill();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("❤️ 红心已补满，马上开始吧！");
    } else {
      playSfx("wrong");
      toast.error("宝石不够，先去学习攒宝石吧");
    }
  }

  const resume = resume0;
  // 剩余题数以持久化队列为准（含错题重排回队尾的题），与课内进度同口径
  const remaining = resume
    ? remainingQuestionCount(resume, questionCount)
    : questionCount;
  const answeredSoFar = resume ? sessionAnsweredCount(resume) : 0;

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
        <div className="text-[11px] uppercase tracking-wider text-ink-softer mt-4 font-extrabold">
          {isExam ? `第 ${unitNumber} 单元 · 单元挑战` : `第 ${unitNumber} 单元 · ${kpIndex}/${kpTotal}`}
        </div>
        <h2 className="text-2xl font-extrabold text-ink mt-2 leading-tight">{title}</h2>

        {questionCount < 3 && !isExam && <p className="mt-3 text-sm text-ink-light">微练习 · 先试一试，之后再用更多情境巩固。这次不评掌握星级。</p>}
        {isExam && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-white text-xs font-extrabold"
            style={{
              background: "linear-gradient(135deg, #CE82FF, #7C3AED)",
              boxShadow: "0 3px 0 0 #6B21A8",
              border: "2px solid #FFC800",
            }}
          >
            ⚔️ 单元挑战 · XP 双倍 ×{EXAM_XP_MULTIPLIER}
          </div>
        )}

        {resume && (
          <div className="mt-4 h-8 inline-flex items-center gap-2 px-3 rounded-full bg-secondary/10 border-2 border-secondary/30 text-secondary-dark text-xs font-extrabold">
            上次做了 {answeredSoFar} 题 · 还剩 {remaining} 题
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-full mt-6">
          <div
            className="bg-bg-soft rounded-2xl p-4 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[11px] uppercase tracking-wider text-ink-softer font-extrabold">
              {resume ? "剩余题数" : "题目数"}
            </div>
            <div className="text-xl font-extrabold text-ink mt-1 tabular-nums">
              {resume ? remaining : questionCount}
            </div>
          </div>
          <div
            className="bg-bg-soft rounded-2xl p-4 border-2 border-bg-softer"
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[11px] uppercase tracking-wider text-ink-softer font-extrabold">
              可获得
            </div>
            <div className="text-xl font-extrabold text-secondary flex items-center justify-center gap-1 mt-1 tabular-nums">
              <Lightning className="w-4 h-4" />+{estimatedXp}
            </div>
            {weekend && (
              <div
                className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white"
                style={{
                  background: "linear-gradient(135deg, #1CB0F6, #7c3aed)",
                }}
              >
                周末双倍 ×2
              </div>
            )}
          </div>
        </div>

        {/* ⏱️ 每日学习时间到上限：温柔劝休息（家长设置，防沉迷） */}
        {timeUp && (
          <div className="mt-4 w-full rounded-2xl border-2 border-secondary/30 bg-secondary/10 px-4 py-3">
            <div className="text-secondary-dark font-extrabold">
              今天学习时间到啦，休息一下眼睛 🌙
            </div>
            <div className="mt-1 text-xs text-ink-light">
              明天再来继续闯关吧～已开始的课程不受影响
            </div>
          </div>
        )}

        {hearts <= 0 && !timeUp && (
          <div className="mt-4 w-full rounded-2xl border-2 border-danger/30 bg-danger/10 px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-danger font-extrabold">
              <Heart className="w-5 h-5" />
              <span>红心不足</span>
            </div>
            {nextHeartAt && (
              <div className="mt-1 text-xs text-ink-light">
                下一颗心还需{" "}
                <span className="font-extrabold text-danger tabular-nums">
                  {formatMsCountdown(msToNext)}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleRefillHearts}
              disabled={gems < HEART_REFILL_COST}
              className={`w-full mt-3 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2.5 font-extrabold text-sm transition-colors ${
                gems >= HEART_REFILL_COST
                  ? "text-white"
                  : "bg-bg-softer text-ink-softer cursor-not-allowed"
              }`}
              style={
                gems >= HEART_REFILL_COST
                  ? {
                      background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                      boxShadow: "0 4px 0 0 #6b21a8",
                    }
                  : undefined
              }
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{HEART_REFILL_COST}</span>
              <span>立即补满红心</span>
            </button>
            {gems < HEART_REFILL_COST && (
              <div className="mt-1.5 text-[11px] text-ink-softer text-center">
                宝石还差 {HEART_REFILL_COST - gems} 颗
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={canStart ? "btn-chunky-primary w-full mt-6" : "btn-chunky-disabled w-full mt-6"}
        >
          {canStart ? (resume ? "继续学习" : "开始") : timeUp ? "明天再来" : "等待恢复"}
        </button>

        {resume && canStart && (
          <button
            type="button"
            onClick={handleRestart}
            className="mt-4 text-sm font-bold text-ink-light hover:text-ink transition-colors"
          >
            重新开始这节课
          </button>
        )}
      </div>
    </Modal>
  );
}
