"use client";

/**
 * 连线题：左列 4 项、右列 4 项，点选配对。
 *
 * options: 8 项数组，前 4 是左列（A/B/C/D），后 4 是右列（1/2/3/4）
 * answer:  "A-1,B-2,C-3,D-4" 形式的字符串
 *
 * 交互：
 *   - 点左列某项 → 高亮，等待选右列
 *   - 点右列某项 → 配对完成，连线显示
 *   - 再次点左列已配对的项可以解除该对
 *   - 4 对都配齐后自动写入 answer
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { QuestionRendererProps } from "./QuestionRenderer";

const LEFT_KEYS = ["A", "B", "C", "D"] as const;
const RIGHT_KEYS = ["1", "2", "3", "4"] as const;
type LeftKey = (typeof LEFT_KEYS)[number];
type RightKey = (typeof RIGHT_KEYS)[number];

// 4 种配色循环，让连线后的卡片有不同色调
const PAIR_COLORS = [
  { border: "border-secondary", bg: "bg-secondary/15", text: "text-secondary-dark" },
  { border: "border-primary", bg: "bg-primary/15", text: "text-primary-dark" },
  { border: "border-warning", bg: "bg-warning/15", text: "text-ink" },
  { border: "border-danger", bg: "bg-danger/15", text: "text-danger-dark" },
];

export function MatchingQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const options = question.options ?? [];
  const left = options.slice(0, 4);
  const right = options.slice(4, 8);

  // pairs[A] = "1" 等
  const [pairs, setPairs] = useState<Record<LeftKey, RightKey | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const [activeLeft, setActiveLeft] = useState<LeftKey | null>(null);

  // 题目切换重置
  useEffect(() => {
    setPairs({ A: null, B: null, C: null, D: null });
    setActiveLeft(null);
  }, [question.id]);

  // pairs 变化时同步外部 answer
  useEffect(() => {
    const text = LEFT_KEYS.filter(k => pairs[k] !== null)
      .map(k => `${k}-${pairs[k]}`)
      .join(",");
    if (text !== answer) onChange(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

  function pickLeft(k: LeftKey) {
    if (disabled) return;
    playSfx("tap");
    haptic("light");
    // 已配对的左项点击 → 解除配对
    if (pairs[k] !== null) {
      setPairs(p => ({ ...p, [k]: null }));
      setActiveLeft(null);
      return;
    }
    setActiveLeft(activeLeft === k ? null : k);
  }

  function pickRight(rk: RightKey) {
    if (disabled) return;
    if (activeLeft === null) return;
    playSfx("tap");
    haptic("medium");
    setPairs(p => {
      // 如果该右项已被其他左项占用，先腾出来
      const next = { ...p };
      for (const k of LEFT_KEYS) {
        if (next[k] === rk) next[k] = null;
      }
      next[activeLeft] = rk;
      return next;
    });
    setActiveLeft(null);
  }

  // 给每个 left key 分配一个序号 → 颜色
  const leftPairOrder: Record<LeftKey, number> = { A: -1, B: -1, C: -1, D: -1 };
  let order = 0;
  for (const k of LEFT_KEYS) {
    if (pairs[k] !== null) {
      leftPairOrder[k] = order++;
    }
  }
  function colorFor(k: LeftKey) {
    const o = leftPairOrder[k];
    return o >= 0 ? PAIR_COLORS[o % PAIR_COLORS.length] : null;
  }
  function colorForRight(rk: RightKey) {
    const owner = LEFT_KEYS.find(k => pairs[k] === rk);
    return owner ? colorFor(owner) : null;
  }

  return (
    <div className="w-full">
      <div className="text-xl font-bold text-ink mb-6 leading-relaxed whitespace-pre-wrap">
        <MathText text={question.question} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 左列 */}
        <div className="flex flex-col gap-2">
          {LEFT_KEYS.map((k, i) => {
            const txt = left[i] ?? "";
            const c = colorFor(k);
            const active = activeLeft === k;
            return (
              <motion.button
                key={k}
                type="button"
                disabled={disabled}
                onClick={() => pickLeft(k)}
                whileTap={!disabled ? { scale: 0.96 } : undefined}
                className={cn(
                  "min-h-[56px] rounded-2xl border-2 px-3 py-2 font-extrabold text-base text-left",
                  "transition-colors flex items-center gap-2",
                  c
                    ? `${c.border} ${c.bg} ${c.text}`
                    : active
                      ? "border-secondary bg-secondary/10 text-secondary-dark"
                      : "border-bg-softer bg-white text-ink hover:border-secondary",
                )}
                style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-current text-xs">
                  {k}
                </span>
                <span className="flex-1">{txt}</span>
                {pairs[k] && <span className="text-xs opacity-70">→{pairs[k]}</span>}
              </motion.button>
            );
          })}
        </div>

        {/* 右列 */}
        <div className="flex flex-col gap-2">
          {RIGHT_KEYS.map((k, i) => {
            const txt = right[i] ?? "";
            const c = colorForRight(k);
            return (
              <motion.button
                key={k}
                type="button"
                disabled={disabled || activeLeft === null}
                onClick={() => pickRight(k)}
                whileTap={!disabled && activeLeft !== null ? { scale: 0.96 } : undefined}
                className={cn(
                  "min-h-[56px] rounded-2xl border-2 px-3 py-2 font-extrabold text-base text-left",
                  "transition-colors flex items-center gap-2",
                  c
                    ? `${c.border} ${c.bg} ${c.text}`
                    : activeLeft !== null && !disabled
                      ? "border-bg-softer bg-white text-ink hover:border-secondary cursor-pointer"
                      : "border-bg-softer bg-white text-ink-softer cursor-default",
                )}
                style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-current text-xs">
                  {k}
                </span>
                <span className="flex-1">{txt}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 错误时显示正确答案 */}
      <AnimatePresence>
        {phase === "checked" && !isCorrect && (
          <motion.div
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mt-4 text-center text-sm text-ink-light"
          >
            正确配对：
            <span className="font-extrabold text-primary-dark">{question.answer}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
