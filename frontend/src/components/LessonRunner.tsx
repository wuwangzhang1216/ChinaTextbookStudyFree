"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { Close, Flame, BookOpen, Target, XCircle, Lightning, Gem, Star, Sparkle, Confetti, Rocket } from "@/components/icons";
import type { Lesson, KnowledgeSummary } from "@/types";
import { gradeAnswer } from "@/lib/grade";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { useProgressStore, MAX_HEARTS, FIRST_PERFECT_XP_BONUS } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import { rollChestReward, type ChestSlot } from "@/lib/chestLogic";
import { HeartsBar } from "./HeartsBar";
import { HeartTimer } from "./HeartTimer";
import { QuestionRenderer, type QuestionPhase } from "./question/QuestionRenderer";
import { Mascot, type MascotMood, type MascotReaction } from "./Mascot";
import { MuteToggle, AutoNarrateToggle, useSyncMute } from "./MuteToggle";
import { TTSButton } from "./TTSButton";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { uiAudio } from "@/lib/uiAudio";
import { playTTS } from "@/lib/tts";
import { ChestModal } from "./ChestModal";
import {
  decideMascotMood,
  decideMascotReaction,
  pickBubble,
  moodToTone,
  type MascotTriggerContext,
} from "@/lib/mascotTriggers";
import { getCosmeticById, type LessonBackdrop } from "@/lib/cosmetics";
import type { QuestionType } from "@cstf/core";

/** 仿 Duolingo 题型胶囊文案（紫色 NEW WORD tag） */
function questionTagLabel(type: QuestionType): string {
  switch (type) {
    case "choice":
      return "选择题";
    case "true_false":
      return "判断题";
    case "fill_blank":
    case "calculation":
      return "计算填空";
    case "fill_blank_text":
      return "文字填空";
    case "word_order":
      return "排序";
    case "matching":
      return "连线配对";
    default:
      return "新题";
  }
}

// 重型/条件渲染的子组件：按需加载以减小 LessonRunner 初始 chunk
const FeedbackPanel = dynamic(
  () => import("./FeedbackPanel").then(m => ({ default: m.FeedbackPanel })),
  { ssr: false },
);
const ConfettiCanvas = dynamic(
  () => import("./ConfettiCanvas").then(m => ({ default: m.ConfettiCanvas })),
  { ssr: false },
);
const Modal = dynamic(
  () => import("./Modal").then(m => ({ default: m.Modal })),
  { ssr: false },
);
const SpeechBubble = dynamic(
  () => import("./SpeechBubble").then(m => ({ default: m.SpeechBubble })),
  { ssr: false },
);
const ComboOverlay = dynamic(
  () => import("./ComboOverlay").then(m => ({ default: m.ComboOverlay })),
  { ssr: false },
);

const XP_PER_CORRECT = 10;
const PERFECT_BONUS = 5;

const PRAISE_BUBBLES = ["太棒!", "完美!", "漂亮!", "好厉害!", "继续!"];
const COMFORT_BUBBLES = ["别灰心!", "再来一次!", "没关系!", "加油!"];
const COMBO_BUBBLES = ["连击!", "火力全开!", "势不可挡!"];

/** 三星 / 二星 阈值（与 progress.starsFromAccuracy 保持同步） */
const THREE_STAR_THRESHOLD = 0.95;
const TWO_STAR_THRESHOLD = 0.75;

/**
 * 顶栏下方一条小提示：「再答对 N 题就能拿到 三/二 星」
 *
 * 计算逻辑：假设剩余题全对，最终准确率是 (correctCount + remaining) / total。
 * 反推"还差几道连续答对就能跨过 0.95 / 0.75 阈值"。
 *
 * 超 1 题：默认浅色显示
 * 还差 1 题：换主色 + 缩放脉冲（"近失败"刺激）
 */
function StarDistanceHint({
  correctCount,
  index,
  total,
}: {
  correctCount: number;
  index: number;
  total: number;
}) {
  // 已答题数
  const answered = index;
  const remaining = total - answered;
  if (remaining <= 0 || total === 0) return null;

  // 当前所需答对数（达到三星 / 二星 的阈值）
  const need3 = Math.ceil(THREE_STAR_THRESHOLD * total);
  const need2 = Math.ceil(TWO_STAR_THRESHOLD * total);

  // 还差多少道才能拿到对应星
  const missingFor3 = Math.max(0, need3 - correctCount);
  const missingFor2 = Math.max(0, need2 - correctCount);

  // 选优先级最高的提示：三星仍然可达？否则二星？否则不显示
  let label: string | null = null;
  let starsToShow = 0;
  let highlight = false;
  if (missingFor3 <= remaining) {
    label = `还差 ${missingFor3} 题就 三星`;
    starsToShow = 3;
    if (missingFor3 <= 1) highlight = true;
  } else if (missingFor2 <= remaining) {
    label = `还差 ${missingFor2} 题就 二星`;
    starsToShow = 2;
    if (missingFor2 <= 1) highlight = true;
  }

  if (!label) return null;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-2">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={
          highlight
            ? { opacity: 1, y: 0, scale: [1, 1.04, 1] }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={
          highlight
            ? { scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }
            : { duration: 0.3 }
        }
        className={cn(
          "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold border-2",
          highlight
            ? "border-warning bg-warning/15 text-warning"
            : "border-bg-softer bg-white text-ink-light",
        )}
      >
        <span className="inline-flex items-center gap-0.5 text-gold">
          {Array.from({ length: starsToShow }).map((_, i) => (
            <Star key={i} className="w-3 h-3 fill-current" />
          ))}
        </span>
        <span>{label}</span>
      </motion.div>
    </div>
  );
}

interface LessonRunnerProps {
  lesson: Lesson;
  /** 本节课紧跟的宝箱 slot（由 page.tsx 预计算） */
  chestSlot?: ChestSlot | null;
}

/**
 * 一次性通关成果快照。传给 CompletionScreen 展示，
 * 避免 CompletionScreen 直接访问中间态。
 */
interface SessionStats {
  accuracy: number;
  /** 最终写入 store 的总 XP（含 perfect / first perfect 奖励） */
  xp: number;
  perfect: boolean;
  firstPerfect: boolean;
  maxCombo: number;
  durationSec: number;
  gemsEarned: number;
  chestReward: { slot: ChestSlot; gems: number } | null;
}

export function LessonRunner({ lesson, chestSlot = null }: LessonRunnerProps) {
  useSyncMute();
  useProgressTicker(); // 心数实时恢复
  const router = useRouter();
  const recordComplete = useProgressStore(s => s.recordLessonComplete);
  const addMistake = useProgressStore(s => s.addMistake);
  const loseHeart = useProgressStore(s => s.loseHeart);
  const upsertLessonSession = useProgressStore(s => s.upsertLessonSession);
  const clearLessonSession = useProgressStore(s => s.clearLessonSession);
  const addGems = useProgressStore(s => s.addGems);
  const markPerfected = useProgressStore(s => s.markPerfected);
  const claimChest = useProgressStore(s => s.claimChest);
  const alreadyPerfected = useProgressStore(
    s => !!s.perfectedLessons[lesson.id],
  );
  const chestAlreadyClaimed = useProgressStore(
    s => !!(chestSlot && s.claimedChests[chestSlot.id]),
  );
  const hearts = useProgressStore(s => s.hearts);
  const backdropId = useProgressStore(s => s.equippedBackdrop);
  const backdropStyle = useMemo<React.CSSProperties>(() => {
    const item = getCosmeticById(backdropId) as LessonBackdrop | undefined;
    if (!item || item.type !== "lesson_backdrop") {
      return { background: "#F7F7F7" };
    }
    return { background: item.data.background };
  }, [backdropId]);
  const prefersReduced = useReducedMotion();

  // 等待从 zustand persist 恢复已保存的会话后再渲染，避免闪烁
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [done, setDone] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  // 起始时若心数为 0，直接显示失败页
  const [failed, setFailed] = useState(() => hearts <= 0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  // +XP 飘字动画队列
  const [xpFloats, setXpFloats] = useState<
    { id: number; startX: number; startY: number; endX: number; endY: number }[]
  >([]);
  const xpFloatIdRef = useRef(0);
  const xpTargetRef = useRef<HTMLDivElement>(null);
  /** session 内累计 XP（预览用，最终写 store 还是在 handleContinue） */
  const [sessionXpPreview, setSessionXpPreview] = useState(0);
  const [mascotReact, setMascotReact] = useState<MascotReaction>(null);
  const [mascotReactKey, setMascotReactKey] = useState(0);
  /** Mascot 当前的"持续表情"，由 mascotTriggers 上下文决定 */
  const [mascotMood, setMascotMood] = useState<MascotMood>("happy");
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [bubbleTone, setBubbleTone] = useState<"neutral" | "primary" | "danger">("neutral");
  const [bubbleKey, setBubbleKey] = useState(0);
  const [comboOverlay, setComboOverlay] = useState<{ combo: number; key: number } | null>(null);
  // 标记是否曾经出现过连击/退出确认 —— 仅在首次需要时才 mount，从而触发 dynamic chunk 的按需加载
  const [comboMounted, setComboMounted] = useState(false);
  const [exitConfirmMounted, setExitConfirmMounted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showIntro, setShowIntro] = useState(lesson.knowledge !== null);

  const shakeControls = useAnimation();
  const progressControls = useAnimation();

  const startTimeRef = useRef<number>(Date.now());
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 会话恢复：挂载时若存在同课程的持久化进度，恢复到上次答到的题目
  useEffect(() => {
    const stored = useProgressStore.getState().activeLesson;
    if (stored && stored.lessonId === lesson.id) {
      // 确保 index 不越界（课程可能更新，题目数变化）
      const safeIndex = Math.min(stored.index, Math.max(0, lesson.questions.length - 1));
      setIndex(safeIndex);
      setCorrectCount(stored.correctCount);
      setMistakeCount(stored.mistakeCount);
      setCombo(stored.combo);
      startTimeRef.current = stored.startedAt || Date.now();
      // 有进度时默认跳过知识点介绍（用户已经看过了）
      setShowIntro(false);
    } else if (stored && stored.lessonId !== lesson.id) {
      // 切换到了新课程，丢弃上一个会话
      useProgressStore.getState().clearLessonSession();
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // 持久化会话：只要还在答题，就把核心进度写回 store
  useEffect(() => {
    if (!ready || done || failed) return;
    upsertLessonSession({
      lessonId: lesson.id,
      index,
      correctCount,
      mistakeCount,
      combo,
      startedAt: startTimeRef.current,
    });
  }, [
    ready,
    done,
    failed,
    lesson.id,
    index,
    correctCount,
    mistakeCount,
    combo,
    upsertLessonSession,
  ]);

  // 完成或失败时清除持久化会话
  useEffect(() => {
    if (done || failed) {
      clearLessonSession();
    }
  }, [done, failed, clearLessonSession]);

  const questions = useMemo(() => lesson.questions, [lesson]);
  const total = questions.length;
  const current = questions[index];
  const progress = ((index + (phase === "checked" ? 1 : 0)) / total) * 100;

  // 进度条宽度动画
  useEffect(() => {
    progressControls.start({
      width: `${progress}%`,
      transition: { duration: 0.4, ease: "easeOut" },
    });
  }, [progress, progressControls]);

  function triggerReact(kind: MascotReaction) {
    setMascotReact(kind);
    setMascotReactKey(k => k + 1);
  }

  function showBubble(text: string, tone: "neutral" | "primary" | "danger" = "neutral", duration = 1800) {
    setBubbleText(text);
    setBubbleTone(tone);
    setBubbleKey(k => k + 1);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubbleText(null), duration);
  }

  function showComboOverlay(c: number) {
    setComboMounted(true);
    setComboOverlay({ combo: c, key: Date.now() });
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => setComboOverlay(null), 1400);
    // 播放连击里程碑语音
    const comboLabel = c === 3 ? "连击 三连!" : c === 5 ? "连击 五连!" : c === 10 ? "连击 十连!" : null;
    if (comboLabel) void playTTS(uiAudio(comboLabel));
  }

  // 卸载时清计时器
  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    };
  }, []);

  function handleCheck() {
    if (!answer.trim()) return;
    const ok = gradeAnswer(current, answer);
    setIsCorrect(ok);
    setPhase("checked");

    // === 上下文感知的 mascot mood/reaction 决策 ===
    const newCombo = ok ? combo + 1 : 0;
    const triggerCtx: MascotTriggerContext = {
      isCorrect: ok,
      isPerfectSession: ok && mistakeCount === 0,
      attemptCount: 1, // 每题只答一次（无重做机制）
      remainingHearts: ok ? hearts : Math.max(0, hearts - 1),
      combo: newCombo,
      maxCombo: Math.max(maxCombo, newCombo),
      index,
      total,
      totalCorrectInSession: ok ? correctCount + 1 : correctCount,
    };
    const nextMood = decideMascotMood(triggerCtx);
    const nextReaction = decideMascotReaction(triggerCtx);
    setMascotMood(nextMood);

    if (ok) {
      setCorrectCount(c => c + 1);
      setSessionXpPreview(xp => xp + XP_PER_CORRECT);
      setCombo(newCombo);
      setMaxCombo(mc => (newCombo > mc ? newCombo : mc));

      // ★ T+0ms ★ 触觉立即响应
      haptic("light");
      // ★ T+0ms ★ 音效（Web Audio 几乎零延迟）
      playSfx("correct");

      // +XP 飘字：从屏幕中间飞到顶栏 XP 徽章
      if (typeof window !== "undefined" && xpTargetRef.current) {
        const rect = xpTargetRef.current.getBoundingClientRect();
        const endX = rect.left + rect.width / 2;
        const endY = rect.top + rect.height / 2;
        const startX = window.innerWidth / 2;
        const startY = window.innerHeight * 0.45;
        const id = ++xpFloatIdRef.current;
        setXpFloats(list => [...list, { id, startX, startY, endX, endY }]);
      }

      // ★ T+35ms ★ Mascot 反应（错峰，让用户先听到声音再看到动作）
      setTimeout(() => triggerReact(nextReaction), 35);

      // ★ T+200ms ★ 进度条脉冲：combo 越高，幅度越大（递增刺激）
      if (!prefersReduced) {
        const pulseAmp = Math.min(1.6 + newCombo * 0.05, 2.1);
        setTimeout(() => {
          progressControls.start({
            scaleY: [1, pulseAmp, 1],
            transition: { duration: 0.35 },
          });
        }, 200);
      }

      // ★ T+50ms ★ 气泡：按 mood 选择文案
      setTimeout(
        () => showBubble(pickBubble(nextMood), moodToTone(nextMood), 1400),
        50,
      );

      // ★ T+320ms ★ Combo 里程碑
      if (newCombo === 3 || newCombo === 5 || newCombo === 10) {
        setTimeout(() => {
          playSfx("combo");
          showComboOverlay(newCombo);
        }, 320);
      }
    } else {
      setCombo(0);
      setMistakeCount(m => m + 1);
      addMistake(lesson.id, lesson.title, current);

      // ★ T+0ms ★ 重触觉 + 错音
      haptic("heavy");
      playSfx("wrong");

      // ★ T+35ms ★ Mascot 反应（错峰）
      setTimeout(() => triggerReact(nextReaction), 35);

      // ★ T+50ms ★ 题区抖动
      if (!prefersReduced) {
        setTimeout(() => {
          shakeControls.start({
            x: [0, -8, 8, -5, 5, 0],
            transition: { duration: 0.45 },
          });
        }, 50);
      }

      // ★ T+50ms ★ 气泡按 mood
      setTimeout(
        () => showBubble(pickBubble(nextMood), moodToTone(nextMood), 1800),
        50,
      );

      // ★ T+120ms ★ 心碎音效（错峰避免和 wrong 重叠）
      setTimeout(() => playSfx("heartLoss"), 120);

      loseHeart();
      // hearts 是 store 订阅值，下一次渲染会更新；这里直接判断下一次会是多少
      if (hearts - 1 <= 0) {
        setFailed(true);
      }
    }
  }

  function handleContinue() {
    if (failed) return;
    if (index + 1 >= total) {
      const accuracy = correctCount / total;
      const baseXp = correctCount * XP_PER_CORRECT;
      const perfect = mistakeCount === 0;
      const perfectBonus = perfect ? PERFECT_BONUS : 0;

      // 首次三星（零失误）额外奖励
      const firstPerfect = perfect && !alreadyPerfected;
      const firstPerfectBonus = firstPerfect ? FIRST_PERFECT_XP_BONUS : 0;
      const xp = baseXp + perfectBonus + firstPerfectBonus;

      // 通关宝箱命中：有 chestSlot 且尚未领取
      const chestReward =
        chestSlot && !chestAlreadyClaimed
          ? { slot: chestSlot, gems: rollChestReward().gems }
          : null;

      // 写入 store（记录 + 宝箱领取 + 首次完美标记）
      if (firstPerfect) markPerfected(lesson.id);
      if (chestReward) {
        claimChest(chestReward.slot.id);
        addGems(chestReward.gems);
      }
      recordComplete(lesson.id, lesson.title, accuracy, xp);

      // 冻结一份展示快照供 CompletionScreen 用
      setSessionStats({
        accuracy,
        xp,
        perfect,
        firstPerfect,
        maxCombo,
        durationSec: Math.round((Date.now() - startTimeRef.current) / 1000),
        gemsEarned: chestReward?.gems ?? 0,
        chestReward,
      });
      setDone(true);
      return;
    }
    setIndex(i => i + 1);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");
    setMascotMood("happy");
  }

  function handleRequestExit() {
    playSfx("tap");
    haptic("light");
    setExitConfirmMounted(true);
    setShowExitConfirm(true);
  }

  function handleConfirmExit() {
    // 用户主动确认退出 → 放弃本次进度
    playSfx("tap");
    haptic("medium");
    clearLessonSession();
    router.push(`/book/${lesson.bookId}/`);
  }

  // ============ 首次加载占位（等待 persist 恢复）============
  if (!ready) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center">
        <Mascot mood="think" size={100} />
      </main>
    );
  }

  // ============ 完成页 ============
  if (done && sessionStats) {
    return (
      <CompletionScreen
        lesson={lesson}
        stats={sessionStats}
        onBack={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  // ============ 失败页 ============
  if (failed) {
    return (
      <FailScreen
        lesson={lesson}
        onRetry={() => router.refresh()}
        onBack={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  // ============ 知识点讲解（首次进入） ============
  if (showIntro && lesson.knowledge) {
    return (
      <IntroCard
        lesson={lesson}
        knowledge={lesson.knowledge}
        onStart={() => setShowIntro(false)}
        onExit={() => router.push(`/book/${lesson.bookId}/`)}
      />
    );
  }

  // ============ 答题中 ============
  return (
    <motion.main
      animate={shakeControls}
      className="min-h-screen flex flex-col relative"
      style={backdropStyle}
    >
      {/* +XP 飘字层 —— fixed 定位独立于 layout，不影响滚动 */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <AnimatePresence>
          {xpFloats.map(f => (
            <motion.div
              key={f.id}
              initial={{
                x: f.startX,
                y: f.startY,
                opacity: 0,
                scale: 0.4,
              }}
              animate={{
                x: [f.startX, (f.startX + f.endX) / 2, f.endX],
                y: [f.startY, f.startY - 30, f.endY],
                opacity: [0, 1, 1, 0],
                scale: [0.4, 1.25, 1.05, 0.7],
              }}
              transition={{ duration: 0.95, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
              onAnimationComplete={() =>
                setXpFloats(list => list.filter(x => x.id !== f.id))
              }
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-secondary to-secondary-dark text-white font-extrabold text-base"
              style={{
                boxShadow: "0 4px 0 0 #0d7aa8, 0 0 20px rgba(28, 176, 246, 0.4)",
                top: 0,
                left: 0,
              }}
            >
              <Lightning className="w-4 h-4" />
              +{XP_PER_CORRECT}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 大型 Combo Overlay —— 首次连击时才 mount，避免冷启动加载 */}
      {comboMounted && (
        <ComboOverlay
          triggerKey={comboOverlay?.key ?? 0}
          combo={comboOverlay?.combo ?? 0}
          visible={!!comboOverlay}
        />
      )}

      {/* 退出确认 —— 用户第一次点关闭按钮时才 mount */}
      {exitConfirmMounted && (
      <Modal open={showExitConfirm} onClose={() => setShowExitConfirm(false)}>
        <div className="flex flex-col items-center text-center">
          <Mascot mood="sad" size={96} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">你确定要退出吗？</h2>
          <p className="text-ink-light mt-2 mb-5">退出就会失去本节课的全部进度。</p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setShowExitConfirm(false);
              }}
              className="btn-chunky-primary w-full"
            >
              继续学习
            </button>
            <button
              onClick={handleConfirmExit}
              className="btn-chunky-danger w-full"
            >
              退出
            </button>
          </div>
        </div>
      </Modal>
      )}

      {/* Top bar: close, progress, combo, hearts, mute */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleRequestExit}
            className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="退出课程"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full origin-left"
              animate={progressControls}
              initial={{ width: "0%" }}
              style={{ boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35)" }}
            />
          </div>

          {/* Combo 徽章（顶栏） */}
          <AnimatePresence>
            {combo >= 3 && (
              <motion.div
                key={combo}
                initial={{ scale: 0, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 260 }}
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-gold text-white font-extrabold text-sm shadow-md tabular-nums"
              >
                <Flame className="w-4 h-4" />
                x{combo}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 本节已得 XP 徽章（飘字目标） */}
          <motion.div
            ref={xpTargetRef}
            animate={
              sessionXpPreview > 0
                ? { scale: [1, 1.22, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 border-secondary/40 text-secondary-dark bg-secondary/10 font-extrabold text-sm select-none tabular-nums"
            aria-label="本节已得 XP"
          >
            <Lightning className="w-4 h-4" />
            <span>{sessionXpPreview}</span>
          </motion.div>

          <HeartsBar total={MAX_HEARTS} remaining={hearts} />
          <HeartTimer />
          <AutoNarrateToggle />
          <MuteToggle />
        </div>
      </div>

      {/* 三星距离提示（动态：剩 N 题就三星 / 二星，临近时会更激励） */}
      <StarDistanceHint
        correctCount={correctCount}
        index={index}
        total={total}
      />

      {/* 吉祥物 + 气泡 */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-2 flex items-end gap-3 min-h-[96px]">
        <Mascot
          mood={phase === "checked" ? mascotMood : "happy"}
          size={72}
          reactTo={mascotReact}
          reactKey={mascotReactKey}
        />
        <div className="mb-2 h-8 flex items-end">
          <AnimatePresence mode="wait">
            {bubbleText && (
              <SpeechBubble key={bubbleKey} text={bubbleText} tone={bubbleTone} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col items-center justify-start px-5 py-4">
        <div className="w-full max-w-md lg:max-w-2xl">
          {/* "NEW WORD" 紫色胶囊 tag —— 仿 Duolingo 题型标签 */}
          <div className="mb-3 inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-600 text-[11px] font-extrabold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {questionTagLabel(current.type)}
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ x: 30, y: 8, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ x: -30, y: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 240 }}
            >
              <QuestionRenderer
                question={current}
                answer={answer}
                phase={phase}
                isCorrect={isCorrect}
                onChange={setAnswer}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* a11y: 屏幕阅读器实时播报答题结果（仅 sr-only） */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" && isCorrect === true && `回答正确。${current.explanation ?? ""}`}
        {phase === "checked" && isCorrect === false &&
          `回答错误。正确答案是：${current.answer}。${current.explanation ?? ""}`}
      </div>

      {/* Bottom: SKIP / CHECK 双按钮（仿 Duolingo 真机底栏） */}
      {phase === "answering" && (
        <div className="bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                playSfx("tap");
                haptic("light");
                // 跳过：等价于直接判错并继续
                setAnswer("");
                handleCheck();
              }}
              className="btn-chunky-ghost px-6"
              aria-label="跳过本题"
            >
              跳过
            </button>
            <button
              onClick={handleCheck}
              disabled={!answer.trim()}
              className={answer.trim() ? "flex-1 btn-chunky-primary" : "flex-1 btn-chunky-disabled"}
            >
              检查
            </button>
          </div>
        </div>
      )}

      {phase === "checked" && (
        <FeedbackPanel
          isCorrect={isCorrect ?? false}
          explanation={current.explanation}
          explanationAudio={current.audio?.explanation ?? null}
          onContinue={handleContinue}
        />
      )}
    </motion.main>
  );
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// 完成 / 失败子页
// ============================================================

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);
  return value;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CompletionScreen({
  lesson,
  stats,
  onBack,
}: {
  lesson: Lesson;
  stats: SessionStats;
  onBack: () => void;
}) {
  const { accuracy, xp, perfect, firstPerfect, maxCombo, durationSec, gemsEarned, chestReward } = stats;
  const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.75 ? 2 : 1;
  const [revealedStars, setRevealedStars] = useState(0);
  const [mascotReactKey, setMascotReactKey] = useState(0);
  const [chestOpen, setChestOpen] = useState(false);
  // 15% 偶发"超级庆祝" —— 仅在 perfect 通关时有可能触发
  const [superCelebration] = useState(() => perfect && Math.random() < 0.15);

  const xpDisplay = useCountUp(xp, 900);
  const accDisplay = useCountUp(Math.round(accuracy * 100), 900);

  useEffect(() => {
    playSfx("complete");
    // 星星揭晓完毕后播"完成!"语音（延迟到动画尾声，不抢音效节奏）
    const voiceTimer = setTimeout(() => {
      void playTTS(uiAudio("完成!"));
    }, 500 + 3 * 380 + 200);
    // 超级庆祝：再叠加一次 unlock 音效 + 多一次 mascot react
    let superTimer: ReturnType<typeof setTimeout> | null = null;
    if (superCelebration) {
      superTimer = setTimeout(() => {
        playSfx("unlock");
        haptic("success");
        setMascotReactKey(k => k + 1);
      }, 500 + 3 * 380 + 400);
    }
    const t0 = setTimeout(() => setMascotReactKey(k => k + 1), 120);
    const starTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < stars; i++) {
      const t = setTimeout(
        () => {
          setRevealedStars(s => s + 1);
          playSfx("star");
          haptic("light");
        },
        500 + i * 380,
      );
      starTimers.push(t);
    }
    // 命中宝箱：星星动画播完后自动弹宝箱弹窗
    let chestTimer: ReturnType<typeof setTimeout> | null = null;
    if (chestReward) {
      chestTimer = setTimeout(() => setChestOpen(true), 500 + stars * 380 + 600);
    }
    return () => {
      clearTimeout(voiceTimer);
      clearTimeout(t0);
      if (superTimer) clearTimeout(superTimer);
      starTimers.forEach(clearTimeout);
      if (chestTimer) clearTimeout(chestTimer);
    };
  }, [stars, chestReward, superCelebration]);

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 relative overflow-hidden">
      <ConfettiCanvas active />

      {/* 超级庆祝彩带 —— 15% 偶发，让幸运的玩家感觉"赚到了" */}
      <AnimatePresence>
        {superCelebration && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.4, type: "spring", damping: 14, stiffness: 240 }}
            className="absolute top-12 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 px-5 py-3 rounded-full text-white font-extrabold text-base"
            style={{
              background: "linear-gradient(135deg, #FFC800, #FF6B6B, #A855F7)",
              backgroundSize: "200% 100%",
              boxShadow: "0 5px 0 0 #6b21a8, 0 0 30px rgba(255, 200, 0, 0.6)",
            }}
          >
            <Confetti className="w-5 h-5" />
            <span>太厉害了！完美通关！</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 16, stiffness: 220 }}
        className="text-center relative z-10"
      >
        <Mascot mood="cheer" size={150} reactTo="levelup" reactKey={mascotReactKey} />
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-extrabold text-primary mt-4"
        >
          完成!
        </motion.h1>
        <p className="text-ink-light mt-2">{lesson.title}</p>

        {/* 完美标徽 */}
        <AnimatePresence>
          {perfect && (
            <motion.div
              initial={{ scale: 0, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", damping: 12 }}
              className="inline-flex items-center gap-1.5 h-7 px-3 mt-3 rounded-full font-extrabold text-sm text-white"
              style={{
                background: "linear-gradient(135deg, #FFC800, #FF9600)",
                boxShadow: "0 4px 0 0 #C89600",
              }}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>零失误 +{PERFECT_BONUS} XP</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 首次完美额外奖励 */}
        <AnimatePresence>
          {firstPerfect && (
            <motion.div
              initial={{ scale: 0, y: 6, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: 0.7, type: "spring", damping: 12 }}
              className="inline-flex items-center gap-1.5 h-7 px-3 mt-2 ml-2 rounded-full font-extrabold text-sm text-white"
              style={{
                background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                boxShadow: "0 4px 0 0 #6b21a8",
              }}
            >
              <Sparkle className="w-3.5 h-3.5" />
              <span>首次完美 +{FIRST_PERFECT_XP_BONUS} XP</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-center gap-4 mt-6">
          {[1, 2, 3].map(i => {
            const earned = i <= stars;
            const shown = i <= revealedStars;
            return (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: -180 }}
                animate={shown ? { scale: 1, rotate: 0 } : { scale: 0.4, rotate: -180, opacity: 0.3 }}
                transition={{ type: "spring", damping: 10, stiffness: 220 }}
                className={earned && shown ? "text-gold" : "text-bg-softer"}
                style={
                  earned && shown
                    ? { filter: "drop-shadow(0 4px 12px rgba(255,200,0,0.6))" }
                    : undefined
                }
              >
                <Star className="w-16 h-16 fill-current" strokeWidth={1.5} />
              </motion.div>
            );
          })}
        </div>

        <div className={`mt-8 grid gap-3 w-80 ${gemsEarned > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
          <StatCard label="经验值" value={`+${Math.round(xpDisplay)}`} color="text-secondary" />
          <StatCard label="准确率" value={`${Math.round(accDisplay)}%`} color="text-primary" />
          <StatCard
            label={maxCombo >= 3 ? "最高连击" : "用时"}
            value={maxCombo >= 3 ? `×${maxCombo}` : formatTime(durationSec)}
            color="text-warning"
          />
          {gemsEarned > 0 && (
            <StatCard label="宝石" value={`+${gemsEarned}`} color="text-purple-600" icon="gem" />
          )}
        </div>

        <button
          onClick={() => {
            playSfx("tap");
            haptic("medium");
            onBack();
          }}
          className="btn-chunky-primary mt-8 px-12"
        >
          继续学习
        </button>

        {/* 宝箱弹窗：通关后若命中 chest slot 自动弹出 */}
        {chestReward && (
          <ChestModal
            open={chestOpen}
            gems={chestReward.gems}
            onClose={() => setChestOpen(false)}
          />
        )}
      </motion.div>
    </main>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: "gem";
}) {
  return (
    <div
      className="bg-white rounded-2xl p-3 border-2 border-bg-softer text-center"
      style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold flex items-center justify-center gap-1">
        {icon === "gem" && <Gem className="w-3 h-3 text-purple-500" />}
        {label}
      </div>
      <div className={`text-xl font-extrabold tabular-nums mt-1 ${color}`}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// IntroCard — 多邻国 Tips 风格的分步讲解
// 每屏只讲一件事（core_concept / key_formula / common_mistakes / tips）
// 为小朋友设计：吉祥物反应 + 多层音效 + 弹性动画 + 鼓励气泡
// ============================================================

type IntroTone = "concept" | "rule" | "mistake" | "tip";

interface IntroPage {
  tone: IntroTone;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  accent: string; // hex，用于进度点和底部装饰
  mascotMood: MascotMood; // 每页吉祥物心情
  bubbleText: string; // 吉祥物气泡鼓励语
  /** 该页要按顺序自动播的所有 TTS 音频。单字段页只有一段，mistake 页有多段。 */
  audioSrcs?: Array<string | null | undefined>;
  /** 给标题旁的 TTSButton 用的"代表音频"。单段页 = audioSrcs[0]；多段页留空，避免重复。 */
  titleAudio?: string;
  /** 自定义 render，可接收当前播放索引（仅 mistake 页用） */
  render: (playingIdx: number) => React.ReactNode;
}

function IntroCard({
  lesson,
  knowledge,
  onStart,
  onExit,
}: {
  lesson: Lesson;
  knowledge: KnowledgeSummary;
  onStart: () => void;
  onExit: () => void;
}) {
  // 动态组装存在的页面（缺字段自动跳过）
  const pages: IntroPage[] = [];
  if (knowledge.core_concept) {
    pages.push({
      tone: "concept",
      title: "这是什么？",
      icon: BookOpen,
      iconBg: "bg-secondary/15",
      iconColor: "text-secondary-dark",
      accent: "#1CB0F6",
      mascotMood: "think",
      bubbleText: "一起学！",
      audioSrcs: [knowledge.audio?.core_concept],
      titleAudio: knowledge.audio?.core_concept,
      render: () => (
        <p className="text-ink leading-relaxed text-lg">
          <MathText text={knowledge.core_concept} />
        </p>
      ),
    });
  }
  if (knowledge.key_formula) {
    pages.push({
      tone: "rule",
      title: "记住这个！",
      icon: Target,
      iconBg: "bg-primary/15",
      iconColor: "text-primary-dark",
      accent: "#58CC02",
      mascotMood: "wave",
      bubbleText: "超级重要!",
      audioSrcs: [knowledge.audio?.key_formula],
      titleAudio: knowledge.audio?.key_formula,
      render: () => (
        <div className="bg-bg-soft border-2 border-bg-softer rounded-2xl px-5 py-5 text-center">
          <div className="text-xl text-ink font-bold leading-relaxed">
            <MathText text={knowledge.key_formula} />
          </div>
        </div>
      ),
    });
  }
  if (Array.isArray(knowledge.common_mistakes) && knowledge.common_mistakes.length > 0) {
    pages.push({
      tone: "mistake",
      title: "小心这些坑！",
      icon: XCircle,
      iconBg: "bg-danger/15",
      iconColor: "text-danger-dark",
      accent: "#FF4B4B",
      mascotMood: "surprise",
      bubbleText: "别踩坑哦!",
      audioSrcs: knowledge.audio?.common_mistakes,
      render: (playingIdx: number) => (
        <ul className="space-y-3">
          {knowledge.common_mistakes.map((m, i) => {
            const isPlaying = i === playingIdx;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-2xl px-4 py-3 border-2 transition-all duration-300",
                  isPlaying
                    ? "bg-danger/15 border-danger ring-4 ring-danger/20 scale-[1.02]"
                    : "bg-danger/5 border-danger/20",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    isPlaying
                      ? "bg-danger text-white"
                      : "bg-danger/20 text-danger-dark",
                  )}
                >
                  <XCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 text-ink leading-relaxed text-base">
                  <MathText text={m} />
                </div>
                <TTSButton
                  src={knowledge.audio?.common_mistakes?.[i] ?? null}
                  size="sm"
                  label="朗读"
                />
              </li>
            );
          })}
        </ul>
      ),
    });
  }
  if (knowledge.tips) {
    pages.push({
      tone: "tip",
      title: "学习小妙招",
      icon: Lightning,
      iconBg: "bg-warning/20",
      iconColor: "text-warning",
      accent: "#FFC800",
      mascotMood: "cheer",
      bubbleText: "你最棒!",
      audioSrcs: [knowledge.audio?.tips],
      titleAudio: knowledge.audio?.tips,
      render: () => (
        <p className="text-ink leading-relaxed text-lg">
          <MathText text={knowledge.tips} />
        </p>
      ),
    });
  }

  // 异常保护：知识点全是空的就直接开始
  useEffect(() => {
    if (pages.length === 0) onStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pageIdx, setPageIdx] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [mascotReactKey, setMascotReactKey] = useState(0);
  // mistake 页：当前正在播的条目下标（-1 = 没在播）。
  // useAutoNarrate 给出的 idx 是过滤后的 srcs 索引，索引 0 是 bubble，所以条目 i 对应过滤后 idx (i+1)。
  const [playingMistakeIdx, setPlayingMistakeIdx] = useState(-1);
  const isLast = pageIdx >= pages.length - 1;
  const current = pages[pageIdx];

  // 翻到某一页时：先播气泡短句（"一起学！"），再依次播该页的全部音频段
  const cancelNarrate = useAutoNarrate(
    [uiAudio(current?.bubbleText ?? ""), ...(current?.audioSrcs ?? [])],
    pageIdx,
    {
      onSrcStart: idx => {
        // idx 0 是 bubble，>=1 才是内容段，对应原数组 idx-1
        setPlayingMistakeIdx(idx >= 1 ? idx - 1 : -1);
      },
      onAllDone: () => setPlayingMistakeIdx(-1),
    },
  );

  // 进入每一页时：触发吉祥物反应动画 + 分层音效
  // 注意：依赖里只放 pageIdx，不能放 current（current 是 pages[pageIdx]，每次渲染都是新对象引用，会触发无限循环）
  useEffect(() => {
    if (pages.length === 0) return;
    setMascotReactKey(k => k + 1);
    // 图标徽章弹入时再补一声轻响（和动画节拍一致）
    const t = setTimeout(() => playSfx("progressTick"), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx]);

  function goNext() {
    cancelNarrate();
    if (isLast) {
      // 最后一步：从"学"过渡到"练"，多层音效 + 强反馈
      playSfx("unlock");
      setTimeout(() => playSfx("star"), 120);
      haptic("medium");
      setTimeout(() => haptic("heavy"), 140);
      onStart();
      return;
    }
    // 翻页：tap + star 叠加，带来清脆的"咔嗒+叮"双层反馈
    playSfx("tap");
    setTimeout(() => playSfx("star", { volume: 0.6 }), 60);
    haptic("light");
    setDirection(1);
    setPageIdx(i => i + 1);
  }

  function goPrev() {
    if (pageIdx === 0) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    setDirection(-1);
    setPageIdx(i => i - 1);
  }

  if (!current) return null;
  const Icon = current.icon;

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col">
      {/* 顶栏：关闭 + 进度点 */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              onExit();
            }}
            className="text-ink-light hover:text-ink transition-colors shrink-0"
            aria-label="退出课程"
          >
            <Close className="w-6 h-6" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            {pages.map((p, i) => {
              const active = i === pageIdx;
              const done = i < pageIdx;
              return (
                <motion.span
                  key={i}
                  animate={{
                    width: active ? 24 : 8,
                    backgroundColor: done ? p.accent : active ? current.accent : "#E5E5E5",
                  }}
                  transition={{ type: "spring", damping: 22, stiffness: 260 }}
                  className="h-2 rounded-full"
                />
              );
            })}
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0 w-10 text-right">
            {pageIdx + 1}/{pages.length}
          </div>
        </div>
      </div>

      {/* 单元 & 课程标题（小） */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-3 text-center">
        <div className="text-xs font-bold text-ink-softer uppercase tracking-wide">
          第 {lesson.unitNumber} 单元 · {lesson.unitTitle}
        </div>
        <div className="text-base font-extrabold text-ink-light mt-0.5 truncate">
          {lesson.title}
        </div>
      </div>

      {/* 主内容：单页聚焦 */}
      <div className="flex-1 flex items-center px-5 py-4">
        <div className="max-w-md lg:max-w-2xl mx-auto w-full">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={pageIdx}
              custom={direction}
              initial={{ x: direction * 50, opacity: 0, scale: 0.96 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: direction * -50, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", damping: 20, stiffness: 240 }}
              className="flex flex-col items-center text-center"
            >
              {/* 吉祥物 + 气泡 */}
              <div className="flex items-end gap-2 mb-2 min-h-[96px]">
                <motion.div
                  initial={{ y: 14, scale: 0.8, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 220, delay: 0.05 }}
                >
                  <Mascot
                    mood={current.mascotMood}
                    size={84}
                    reactTo="levelup"
                    reactKey={mascotReactKey}
                  />
                </motion.div>
                <motion.div
                  initial={{ y: 8, scale: 0, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 14, stiffness: 240, delay: 0.18 }}
                  className="mb-3"
                >
                  <SpeechBubble
                    text={current.bubbleText}
                    tone={
                      current.tone === "mistake"
                        ? "danger"
                        : current.tone === "concept" || current.tone === "rule"
                        ? "primary"
                        : "neutral"
                    }
                  />
                </motion.div>
              </div>

              {/* 图标徽章 + 脉冲光环 */}
              <motion.div
                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 220, delay: 0.12 }}
                className="relative mb-4"
              >
                {/* 脉冲光圈 */}
                <motion.div
                  aria-hidden
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: `${current.accent}33` }}
                />
                {/* 悬浮漂浮的图标圆 */}
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className={`relative w-20 h-20 rounded-full ${current.iconBg} flex items-center justify-center`}
                  style={{ boxShadow: `0 6px 0 0 ${current.accent}44` }}
                >
                  <motion.div
                    animate={{ rotate: [0, -6, 6, -4, 4, 0] }}
                    transition={{ duration: 0.9, delay: 0.3 }}
                  >
                    <Icon className={`w-10 h-10 ${current.iconColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>

              {/* 标题 */}
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 16, stiffness: 260, delay: 0.2 }}
                className="flex items-center justify-center gap-3 mb-4"
              >
                <h1 className="text-3xl font-extrabold text-ink leading-tight">
                  {current.title}
                </h1>
                {current.titleAudio && (
                  <TTSButton src={current.titleAudio} label="朗读讲解" />
                )}
              </motion.div>

              {/* 内容（继承父级居中） */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.35 }}
                className="w-full max-w-prose mx-auto"
              >
                {current.render(playingMistakeIdx)}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* 底部：上一步 + 主按钮 */}
      <div className="bg-white border-t-2 border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          {pageIdx > 0 ? (
            <motion.button
              type="button"
              onClick={goPrev}
              whileTap={{ scale: 0.94 }}
              aria-label="上一步"
              className="btn-chunky-ghost shrink-0 !px-4 text-xl"
            >
              ←
            </motion.button>
          ) : null}
          <motion.button
            type="button"
            onClick={goNext}
            whileTap={{ scale: 0.96 }}
            animate={
              isLast
                ? {
                    // 最后一页：按钮带呼吸式光晕 + 上下弹跳
                    y: [0, -2, 0],
                    boxShadow: [
                      "0 4px 0 0 #58A700, 0 0 0 0 rgba(88,204,2,0.6)",
                      "0 4px 0 0 #58A700, 0 0 0 14px rgba(88,204,2,0)",
                      "0 4px 0 0 #58A700, 0 0 0 0 rgba(88,204,2,0.6)",
                    ],
                  }
                : {}
            }
            transition={
              isLast
                ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
            className="flex-1 btn-chunky-primary flex items-center justify-center gap-2"
          >
            {isLast && <Rocket className="w-5 h-5" />}
            <span>{isLast ? "开始练习" : "下一步"}</span>
            <motion.span
              aria-hidden
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block"
            >
              →
            </motion.span>
          </motion.button>
        </div>
      </div>
    </main>
  );
}

function FailScreen({
  lesson,
  onRetry,
  onBack,
}: {
  lesson: Lesson;
  onRetry: () => void;
  onBack: () => void;
}) {
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const canRetry = hearts > 0;
  const msToNext = nextHeartAt ? Math.max(0, nextHeartAt - now) : 0;

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 18 }}
        className="flex flex-col items-center"
      >
        <Mascot mood="sad" size={140} />
        <h1 className="text-3xl font-extrabold text-danger mt-4">
          {canRetry ? "没关系，再来一次！" : "心数用完啦"}
        </h1>
        <p className="text-ink-light mt-2 mb-4">{lesson.title}</p>

        {!canRetry && nextHeartAt && (
          <div className="mb-6 text-center">
            <p className="text-sm text-ink-light">下一颗心还需</p>
            <div className="text-3xl font-extrabold text-danger tabular-nums mt-1">
              {formatMsCountdown(msToNext)}
            </div>
            <p className="text-xs text-ink-softer mt-1">每 5 分钟恢复 1 颗心</p>
          </div>
        )}

        <div className="flex flex-col gap-3 w-64">
          <button
            onClick={() => {
              if (!canRetry) return;
              playSfx("unlock");
              haptic("medium");
              onRetry();
            }}
            disabled={!canRetry}
            className={canRetry ? "btn-chunky-primary" : "btn-chunky-disabled"}
          >
            重新开始
          </button>
          <button
            onClick={() => {
              playSfx("tap");
              haptic("light");
              onBack();
            }}
            className="btn-chunky-ghost"
          >
            返回路径
          </button>
        </div>
      </motion.div>
    </main>
  );
}
