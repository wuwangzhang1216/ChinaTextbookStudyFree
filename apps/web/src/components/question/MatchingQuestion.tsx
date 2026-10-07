"use client";

/**
 * 连线题：左列 4 项、右列 4 项，点选配对（web-lesson-11：逐对即时判定）。
 *
 * options: 8 项数组，前 4 是左列（A/B/C/D），后 4 是右列（1/2/3/4）
 * answer:  "A-1,B-2,C-3,D-4" 形式的字符串
 *
 * 交互（与 iOS / 多邻国一致）：
 *   - 点左列某项 → 高亮，等待选右列
 *   - 点右列某项 → 立即判定该对：
 *       对 → 绿闪 + 双双消失（correct 触感）
 *       错 → 红抖 + 复位（不扣心）
 *   - 每对成功立即保存草稿；完整配对后父级才可判分
 *   - 键盘：1-4 选左列，5-8 选右列（桌面端角标提示）
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { playTTS } from "@/lib/tts";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import { matchingPairs } from "@/lib/questionDraft";
import type { QuestionRendererProps } from "./QuestionRenderer";

const LEFT_KEYS = ["A", "B", "C", "D"] as const;
const RIGHT_KEYS = ["1", "2", "3", "4"] as const;
type LeftKey = (typeof LEFT_KEYS)[number];
type RightKey = (typeof RIGHT_KEYS)[number];

export function MatchingQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const options = question.options ?? [];
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);
  const left = options.slice(0, 4);
  const right = options.slice(4, 8);
  const pairTotal = Math.min(left.length, right.length, 4);

  // canonical answer 解析：{ A: "1", B: "2", ... }
  const answerMap = useMemo(() => {
    const m: Partial<Record<LeftKey, RightKey>> = {};
    for (const part of question.answer.split(",")) {
      const [l, r] = part.trim().split("-");
      const lk = l?.trim().toUpperCase() as LeftKey | undefined;
      const rk = r?.trim() as RightKey | undefined;
      if (lk && rk && (LEFT_KEYS as readonly string[]).includes(lk)) m[lk] = rk;
    }
    return m;
  }, [question.answer]);

  /** 已配对成功（消失）的左键集合 */
  const matched = useMemo(() => matchingPairs(question, answer), [question, answer]);
  /** 正在播「绿闪」即将消失的一对 */
  const [vanishing, setVanishing] = useState<{ l: LeftKey; r: RightKey } | null>(null);
  /** 刚配错正在「红抖」的一对（key 用于重播动画） */
  const [wrongPair, setWrongPair] = useState<{ l: LeftKey; r: RightKey; key: number } | null>(null);
  const [activeLeft, setActiveLeft] = useState<LeftKey | null>(null);

  // 题目切换重置
  useEffect(() => {
    setVanishing(null);
    setWrongPair(null);
    setActiveLeft(null);
  }, [question.id]);

  // Only animation state is local. Successful pairs immediately become a saved draft.
  useEffect(() => {
    if (!vanishing) return;
    const timer = setTimeout(() => setVanishing(null), 420);
    return () => clearTimeout(timer);
  }, [vanishing]);

  function optionAudioAt(idx: number) {
    const src = question.audio?.options?.[idx];
    if (src) void playTTS(src);
  }

  function pickLeft(k: LeftKey) {
    if (locked || disabled || matched[k] || vanishing) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    optionAudioAt(LEFT_KEYS.indexOf(k));
    setActiveLeft(activeLeft === k ? null : k);
  }

  function pickRight(rk: RightKey) {
    if (locked || disabled || vanishing) return;
    if (activeLeft === null) return;
    if (Object.values(matched).includes(rk)) return;
    cancelNarrate();
    optionAudioAt(4 + RIGHT_KEYS.indexOf(rk));
    const l = activeLeft;
    setActiveLeft(null);

    if (answerMap[l] === rk) {
      // ✅ 配对正确：绿闪 → 双双消失
      playSfx("correct", { volume: 0.55 });
      haptic("light");
      setVanishing({ l, r: rk });
      onChange(Object.entries({ ...matched, [l]: rk }).map(([left, right]) => `${left}-${right}`).join(","));
    } else {
      // ❌ 配对错误：红抖 + 复位（不扣心，与 iOS 一致）
      playSfx("wrong", { volume: 0.35 });
      haptic("medium");
      setWrongPair({ l, r: rk, key: Date.now() });
      setTimeout(() => setWrongPair(null), 520);
    }
  }

  // 键盘快捷键（web-lesson-3）：左列 1-4，右列 5-8
  useEffect(() => {
    if (locked || phase !== "answering") return; // 遮罩打开时不接管键盘（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n)) return;
      if (n >= 1 && n <= pairTotal) {
        e.preventDefault();
        pickLeft(LEFT_KEYS[n - 1]);
      } else if (n >= 5 && n <= 4 + pairTotal) {
        e.preventDefault();
        pickRight(RIGHT_KEYS[n - 5]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question.id, activeLeft, matched, vanishing, pairTotal, locked]);

  const shakeAnim = { x: [0, -7, 7, -5, 5, 0], transition: { duration: 0.42 } };

  /** answerMap[k]（"1"~"4"）→ 右列文本 */
  function rightTextFor(k: LeftKey): string {
    const rk = answerMap[k];
    if (!rk) return "";
    return right[RIGHT_KEYS.indexOf(rk)] ?? "";
  }

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed whitespace-pre-wrap flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} className="mt-1" label="朗读题目" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 左列 */}
        <div className="flex flex-col gap-2">
          {LEFT_KEYS.slice(0, pairTotal).map((k, i) => {
            const txt = left[i] ?? "";
            const isVanishing = vanishing?.l === k;
            const gone = !!matched[k] && !isVanishing;
            const isWrong = wrongPair?.l === k;
            const active = activeLeft === k;
            return (
              <AnimatePresence key={k} initial={false}>
                {!gone && (
                  <motion.button
                    type="button"
                    disabled={disabled || isVanishing}
                    onClick={() => pickLeft(k)}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.25 } }}
                    animate={isWrong ? shakeAnim : { x: 0 }}
                    whileTap={!disabled ? { scale: 0.98 } : undefined}
                    className={cn(
                      "option-card text-left flex items-center gap-2 relative",
                      isVanishing
                        ? "option-card-correct"
                        : isWrong
                          ? "option-card-wrong"
                          : active
                            ? "option-card-selected"
                            : undefined,
                    )}
                  >
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current text-xs shrink-0">
                      {k}
                    </span>
                    <span className="flex-1">{txt}</span>
                    {/* 桌面端键盘角标 1-4 */}
                    <span className="w-5 h-5 rounded border-2 border-bg-softer hidden [@media(pointer:fine)]:flex items-center justify-center font-extrabold text-ink-softer text-[10px] tabular-nums shrink-0">
                      {i + 1}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            );
          })}
        </div>

        {/* 右列 */}
        <div className="flex flex-col gap-2">
          {RIGHT_KEYS.slice(0, pairTotal).map((k, i) => {
            const txt = right[i] ?? "";
            const isVanishing = vanishing?.r === k;
            const gone = Object.values(matched).includes(k) && !isVanishing;
            const isWrong = wrongPair?.r === k;
            const clickable = activeLeft !== null && !disabled && !isVanishing;
            return (
              <AnimatePresence key={k} initial={false}>
                {!gone && (
                  <motion.button
                    type="button"
                    disabled={disabled || isVanishing || activeLeft === null}
                    onClick={() => pickRight(k)}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.25 } }}
                    animate={isWrong ? shakeAnim : { x: 0 }}
                    whileTap={clickable ? { scale: 0.98 } : undefined}
                    className={cn(
                      "option-card text-left flex items-center gap-2 relative",
                      isVanishing
                        ? "option-card-correct"
                        : isWrong
                          ? "option-card-wrong"
                          : clickable
                            ? undefined
                            : "text-ink-softer cursor-default hover:border-bg-softer hover:bg-white",
                    )}
                  >
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-current text-xs shrink-0">
                      {k}
                    </span>
                    <span className="flex-1">{txt}</span>
                    {/* 桌面端键盘角标 5-8 */}
                    <span className="w-5 h-5 rounded border-2 border-bg-softer hidden [@media(pointer:fine)]:flex items-center justify-center font-extrabold text-ink-softer text-[10px] tabular-nums shrink-0">
                      {i + 5}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            );
          })}
        </div>
      </div>

      {/* 进度提示（配到一半时给点正反馈） */}
      {!disabled && Object.keys(matched).length > 0 && Object.keys(matched).length < pairTotal && (
        <div className="mt-3 text-center text-xs font-bold text-ink-softer">
          已配对 {Object.keys(matched).length}/{pairTotal}
        </div>
      )}

      {/* 错误兜底（如跳过）：展示左右文本配对列表，不再裸 A-1,B-2 */}
      <AnimatePresence>
        {phase === "checked" && !isCorrect && (
          <motion.div
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mt-4 space-y-2"
          >
            <div className="text-center text-sm font-bold text-ink-light">正确配对：</div>
            {LEFT_KEYS.slice(0, pairTotal).map((k, i) =>
              left[i] ? (
                <div
                  key={k}
                  className="flex items-center gap-2 rounded-xl bg-primary/10 border-2 border-primary/30 px-3 py-2 text-sm text-primary-dark"
                >
                  <span className="font-extrabold flex-1 text-right">{left[i]}</span>
                  <span aria-hidden>→</span>
                  <span className="font-extrabold flex-1">{rightTextFor(k)}</span>
                </div>
              ) : null,
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
