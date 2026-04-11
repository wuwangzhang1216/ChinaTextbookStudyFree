"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { QuestionRendererProps } from "./QuestionRenderer";

/**
 * 通用填空题：用于 fill_blank / calculation / word_problem 三种类型。
 * 顶部展示当前输入，底部是一个屏幕数字键盘（避免用户被迫调用系统输入法）。
 */

// 数字键盘布局：三行数字 + 一行 [. / 0 / ⌫]
const KEYPAD_ROWS: string[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

export function FillBlankQuestion({ question, answer, phase, isCorrect, onChange }: QuestionRendererProps) {
  const disabled = phase === "checked";

  function handleKey(k: string) {
    if (disabled) return;
    playSfx("tap");
    haptic("light");
    if (k === "⌫") {
      onChange(answer.slice(0, -1));
      return;
    }
    if (k === "." && answer.includes(".")) return;
    // 限制长度，防止误操作输入过长
    if (answer.length >= 10) return;
    onChange(answer + k);
  }

  let displayCls =
    "w-full min-h-[68px] text-3xl font-extrabold text-center px-4 py-4 rounded-2xl border-2 flex items-center justify-center";
  if (disabled) {
    displayCls = cn(
      displayCls,
      isCorrect
        ? "border-primary bg-primary/10 text-primary-dark"
        : "border-danger bg-danger/10 text-danger-dark",
    );
  } else {
    displayCls = cn(displayCls, "border-secondary bg-white text-ink shadow-glow");
  }

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed whitespace-pre-wrap flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} className="mt-1" label="朗读题目" />
      </div>

      <motion.div
        className={displayCls}
        initial={{ scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      >
        {answer || <span className="text-ink-light/50 text-xl font-bold">点下方数字键</span>}
      </motion.div>

      {phase === "checked" && !isCorrect && (
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mt-3 text-center text-sm text-ink-light"
        >
          正确答案：<span className="font-extrabold text-primary-dark">{question.answer}</span>
        </motion.div>
      )}

      {/* 屏幕数字键盘 */}
      <div className="mt-6 grid grid-cols-3 gap-3 select-none">
        {KEYPAD_ROWS.flat().map(k => (
          <motion.button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => handleKey(k)}
            whileTap={!disabled ? { scale: 0.92 } : undefined}
            className={cn(
              "h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-ink",
              "active:bg-bg-soft disabled:opacity-50 disabled:cursor-not-allowed",
              k === "⌫" && "text-danger",
            )}
          >
            {k}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
