"use client";

/**
 * ReviewRunnerClient —— 错题复习 runner（/review/runner/）
 *
 * 多邻国式「真实作答」复习流程：
 *   - 队列 = 今日到期错题（core getDueSrsEntries，毕业条目除外）
 *   - 复用 QuestionRenderer + core gradeAnswer 真实判分，答完才亮对错与解析
 *   - 首次作答的结果驱动 SRS（store reviewMistake）；答错的题重排队尾再练
 *   - 完成页：正确数 + XP（store awardReviewXP，每答对 +5）+ 毕业庆祝
 *   - 完成整轮：首答正确达五题；可用题不足五题则整轮正确 → 补 1 颗红心
 *     （store awardReviewHeart，每天一次的账本在 store 里）
 *
 * 无红心消耗：复习是「安全区」，答错只会把题排回队尾，不扣心。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import type { Question } from "@/types";
import { gradeAnswer } from "@/lib/grade";
import { getDueSrsEntries } from "@/lib/srs";
import {
  useProgressStore,
  REVIEW_XP_PER_CORRECT,
  REVIEW_HEART_MIN_CORRECT,
} from "@/store/progress";
import { QuestionRenderer, type QuestionPhase } from "@/components/question/QuestionRenderer";
import { MathText } from "@/components/MathText";
import { Mascot } from "@/components/Mascot";
import { EmptyState } from "@/components/StateMessages";
import { SoundLink } from "@/components/SoundLink";
import { MuteToggle, useSyncMute } from "@/components/MuteToggle";
import { Close, CheckCircle, XCircle, Lightning, Heart, Bookmark } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const ConfettiCanvas = dynamic(
  () => import("@/components/ConfettiCanvas").then(m => ({ default: m.ConfettiCanvas })),
  { ssr: false },
);

/** 队列条目：一道待复习的错题 */
interface ReviewItem {
  key: string; // `${lessonId}:${questionId}` 唯一键
  lessonId: string;
  lessonTitle: string;
  question: Question;
}

/** 会话结算快照 */
interface ReviewStats {
  total: number;
  correct: number;
  xpGained: number;
  graduated: number;
  /** 本轮补回的红心数（0 = 没到门槛 / 今天领过 / 已满心） */
  heartsGained: number;
}

export function ReviewRunnerClient() {
  useSyncMute();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 断心跳转标记（?from=hearts）：完成页多给一句「红心会慢慢恢复」的安抚。
  const fromHearts = searchParams.get("from") === "hearts";

  const reviewMistake = useProgressStore(s => s.reviewMistake);
  const awardReviewXP = useProgressStore(s => s.awardReviewXP);
  const awardReviewHeart = useProgressStore(s => s.awardReviewHeart);
  const prefersReduced = useReducedMotion();

  // ============ 队列：hydrate 后一次性快照（复习中 store 变化不打乱当前会话）============
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const totalRef = useRef(0);

  useEffect(() => {
    const bank = useProgressStore.getState().mistakesBank;
    const due = getDueSrsEntries(bank);
    const items: ReviewItem[] = due.map(e => ({
      key: `${e.lessonId}:${e.question.id}`,
      lessonId: e.lessonId,
      lessonTitle: e.lessonTitle ?? e.lessonId,
      question: e.question,
    }));
    totalRef.current = items.length;
    setQueue(items);
    setReady(true);
  }, []);

  // ============ 答题状态 ============
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  // 首答记录：key → 是否答对（SRS/XP 只认首答；重练不再记账）
  const firstAttemptRef = useRef<Map<string, boolean>>(new Map());
  const graduatedRef = useRef(0);
  const settledRef = useRef(false);
  const shakeControls = useAnimation();

  const current = queue[0] ?? null;
  const total = totalRef.current;
  const progress = total > 0 ? (solvedCount / total) * 100 : 0;

  const currentGraduatedNow = useRef(false);

  function handleCheck() {
    if (!current || !answer.trim()) return;
    const ok = gradeAnswer(current.question, answer);
    setIsCorrect(ok);
    setPhase("checked");
    currentGraduatedNow.current = false;

    // 首答才驱动 SRS（重练答对不提前升 box）
    if (!firstAttemptRef.current.has(current.key)) {
      firstAttemptRef.current.set(current.key, ok);
      const newlyGraduated = reviewMistake(current.lessonId, current.question.id, ok);
      if (newlyGraduated) {
        graduatedRef.current += 1;
        currentGraduatedNow.current = true;
      }
    }

    if (ok) {
      haptic("light");
      playSfx("correct");
    } else {
      haptic("heavy");
      playSfx("wrong");
      if (!prefersReduced) {
        shakeControls.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.45 } });
      }
    }
  }

  function handleContinue() {
    if (!current) return;
    playSfx("tap");
    haptic("light");

    let nextQueue: ReviewItem[];
    let nextSolved = solvedCount;
    if (isCorrect) {
      // 答对 → 离场
      nextQueue = queue.slice(1);
      nextSolved = solvedCount + 1;
      setSolvedCount(nextSolved);
    } else {
      // 答错 → 重排队尾再练（本次会话内练到会为止）
      nextQueue = [...queue.slice(1), queue[0]];
    }
    setQueue(nextQueue);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");

    if (nextQueue.length === 0) {
      finishSession(nextSolved);
    }
  }

  function finishSession(solved: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    const attempts = firstAttemptRef.current;
    const correct = [...attempts.values()].filter(Boolean).length;
    // 统一记账：每首答答对 +5 XP、dailyReviews += 复习量、推进连胜
    const xpGained = awardReviewXP(correct, attempts.size);
    // 走完一整轮到期错题才结算补心；首答至少五题正确，不足五题则整轮正确。
    // 上限（不超过 MAX_HEARTS）、当天只领一次都由 store awardReviewHeart 裁决。
    const heartsGained = awardReviewHeart(correct, attempts.size);
    setStats({
      total: solved,
      correct,
      xpGained,
      graduated: graduatedRef.current,
      heartsGained,
    });
    playSfx("complete");
    haptic("success");
  }

  function handleExit() {
    playSfx("tap");
    haptic("light");
    // 中途退出：把已完成的复习量结算掉（0 对也算活动），避免「白练」
    if (!settledRef.current && firstAttemptRef.current.size > 0) {
      settledRef.current = true;
      const attempts = firstAttemptRef.current;
      const correct = [...attempts.values()].filter(Boolean).length;
      awardReviewXP(correct, attempts.size);
    }
    router.push("/review/");
  }

  // ============ 加载占位 ============
  if (!ready) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center">
        <Mascot mood="think" size={100} />
      </main>
    );
  }

  // ============ 完成页 ============
  if (stats) {
    return <ReviewCompletionScreen stats={stats} fromHearts={fromHearts} />;
  }

  // ============ 空队列（直接进入 / 今天没有到期错题）============
  if (!current) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center px-5">
        <EmptyState
          mood="cheer"
          title="今天没有要复习的错题！"
          desc="错题都安排好了，明天再来看看吧～"
          action={
            <SoundLink href="/review/" hapticIntensity="medium" className="btn-chunky-primary px-8">
              回错题本
            </SoundLink>
          }
        />
      </main>
    );
  }

  // ============ 答题中 ============
  return (
    <motion.main animate={shakeControls} className="min-h-screen bg-bg-soft flex flex-col">
      {/* 顶栏：退出 + 进度条 + 静音 */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExit}
            className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="退出复习"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-danger rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0">
            {solvedCount}/{total}
          </div>
          <MuteToggle />
        </div>
      </div>

      {/* 来源课程胶囊 */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger/10 text-danger text-[11px] font-extrabold">
          <Bookmark className="w-3 h-3" />
          错题复习 · {current.lessonTitle}
        </span>
      </div>

      {/* 题目区 */}
      <div className="flex-1 flex flex-col items-center justify-start px-5 py-4 pb-40">
        <div className="w-full max-w-md lg:max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${current.key}-${solvedCount}-${queue.length}`}
              initial={{ x: 30, y: 8, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ x: -30, y: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 240 }}
            >
              <QuestionRenderer
                question={current.question}
                answer={answer}
                phase={phase}
                isCorrect={isCorrect}
                onChange={setAnswer}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* a11y：实时播报判分结果 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" && isCorrect === true && `回答正确。${current.question.explanation ?? ""}`}
        {phase === "checked" && isCorrect === false &&
          `回答错误。正确答案是：${current.question.answer}。${current.question.explanation ?? ""}`}
      </div>

      {/* 底部：检查按钮（答题中） */}
      {phase === "answering" && (
        <div className="bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4">
            <button
              onClick={handleCheck}
              disabled={!answer.trim()}
              className={answer.trim() ? "w-full btn-chunky-primary" : "w-full btn-chunky-disabled"}
            >
              检查
            </button>
          </div>
        </div>
      )}

      {/* 判分后反馈：对错 + 正确答案（答错时）+ 解析（MathText） */}
      {phase === "checked" && (
        <ReviewFeedbackPanel
          isCorrect={isCorrect ?? false}
          correctAnswer={current.question.answer}
          explanation={current.question.explanation}
          graduatedNow={currentGraduatedNow.current}
          onContinue={handleContinue}
        />
      )}
    </motion.main>
  );
}

function ReviewFeedbackPanel({
  isCorrect,
  correctAnswer,
  explanation,
  graduatedNow,
  onContinue,
}: {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  graduatedNow: boolean;
  onContinue: () => void;
}) {
  const bg = isCorrect ? "bg-primary/10 border-primary" : "bg-danger/10 border-danger";
  const titleColor = isCorrect ? "text-primary-dark" : "text-danger-dark";
  const btnCls = isCorrect ? "btn-chunky-primary" : "btn-chunky-danger";

  // z-50：必须压过移动端固定底栏（z-40），否则「继续」按钮会被盖住点不到
  return (
    <motion.div
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className={`fixed bottom-0 left-0 right-0 z-50 border-t-4 ${bg} backdrop-blur-sm bg-white/90`}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}
    >
      <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-5">
        <div className={`flex items-center gap-3 mb-2 font-extrabold text-2xl ${titleColor}`}>
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 260, delay: 0.05 }}
            className="inline-flex"
          >
            {isCorrect ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </motion.span>
          <span>{isCorrect ? "答对啦！" : "先看看正确答案"}</span>
          {graduatedNow && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10, delay: 0.25 }}
              className="ml-auto text-sm font-extrabold text-primary-dark bg-primary/15 rounded-full px-2.5 py-1"
            >
              这题毕业了！🎓
            </motion.span>
          )}
        </div>

        {!isCorrect && (
          <div className="flex items-start gap-2 text-sm mb-2">
            <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="text-ink-light shrink-0">正确答案：</span>
            <span className="font-extrabold text-primary-dark">
              <MathText text={correctAnswer} />
            </span>
          </div>
        )}

        <div className="text-ink text-base leading-relaxed mb-4">
          <MathText text={explanation} />
        </div>

        <button onClick={onContinue} className={`w-full ${btnCls}`}>
          {isCorrect ? "继续" : "记住了，待会再练"}
        </button>
      </div>
    </motion.div>
  );
}

function ReviewCompletionScreen({
  stats,
  fromHearts,
}: {
  stats: ReviewStats;
  fromHearts: boolean;
}) {
  const activeLesson = useProgressStore(s => s.activeLesson);
  const resumeHref = activeLesson ? `/lesson/${activeLesson.lessonId.split("-u")[0]}/${activeLesson.lessonId}/` : "/";
  useEffect(() => {
    playSfx("complete");
  }, []);

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 relative overflow-hidden">
      <ConfettiCanvas active />
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 16, stiffness: 220 }}
        className="text-center relative z-10 w-full max-w-sm"
      >
        <Mascot mood="cheer" size={140} reactTo="levelup" reactKey={1} />
        <h1 className="text-4xl font-extrabold text-primary mt-4">复习完成!</h1>
        <p className="text-ink-light mt-2">错题越练越少，你越来越棒～</p>

        {/* 🎓 毕业庆祝 */}
        <AnimatePresence>
          {stats.graduated > 0 && (
            <motion.div
              initial={{ scale: 0, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", damping: 12 }}
              className="inline-flex items-center gap-1.5 h-8 px-4 mt-4 rounded-full font-extrabold text-sm text-white"
              style={{
                background: "linear-gradient(135deg, #58CC02, #1CB0F6)",
                boxShadow: "0 4px 0 0 #58A700",
              }}
            >
              <span>{stats.graduated} 道题毕业了！🎓</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div
            className="bg-white rounded-2xl p-4 border-2 border-bg-softer text-center"
            style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold">
              一次就对
            </div>
            <div className="text-xl font-extrabold text-primary tabular-nums mt-1">
              {stats.correct}/{stats.total}
            </div>
          </div>
          <div
            className="bg-white rounded-2xl p-4 border-2 border-bg-softer text-center"
            style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold">
              经验值
            </div>
            <div className="text-xl font-extrabold text-secondary flex items-center justify-center gap-1 mt-1 tabular-nums">
              <Lightning className="w-4 h-4" />+{stats.xpGained}
            </div>
          </div>
        </div>
        {stats.correct > 0 && (
          <div className="mt-2 text-[11px] text-ink-softer">
            每答对一题 +{REVIEW_XP_PER_CORRECT} 经验
          </div>
        )}

        {/* ❤️ 复习补心（parity-5）：答对够多，红心补回来 */}
        <AnimatePresence>
          {stats.heartsGained > 0 && (
            <motion.div
              initial={{ scale: 0, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: 0.35, type: "spring", damping: 12 }}
              className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-full font-extrabold text-base text-white"
              style={{
                background: "linear-gradient(135deg, #FF6B6B, #FF4B4B)",
                boxShadow: "0 4px 0 0 #d33",
              }}
            >
              <Heart className="w-4 h-4" />
              <span className="tabular-nums">+{stats.heartsGained}</span>
              <span className="text-sm">红心补回来啦！</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 断心跳转而来：没拿到补心时给一句安抚 + 告诉孩子怎么才能拿到 */}
        {fromHearts && stats.heartsGained === 0 && (
          <div className="mt-5 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-danger/10 border-2 border-danger/30 text-danger text-sm font-extrabold">
            <Heart className="w-4 h-4" />
            <span>
              复习辛苦啦！一轮首答正确至少 {Math.min(REVIEW_HEART_MIN_CORRECT, stats.total)} 题可回心，每天可领取一次。
              红心也会每 5 分钟自己恢复 1 颗～
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-8">
          <SoundLink href={resumeHref} hapticIntensity="medium" className="btn-chunky-primary w-full">
            {activeLesson ? "继续上次课程" : "继续学习"}
          </SoundLink>
          <SoundLink href="/review/" hapticIntensity="light" className="btn-chunky-ghost w-full">
            回错题本
          </SoundLink>
        </div>
      </motion.div>
    </main>
  );
}
