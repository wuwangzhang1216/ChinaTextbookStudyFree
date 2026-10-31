"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { QuestionPrompt } from "./QuestionPrompt";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import type { QuestionRendererProps } from "./QuestionRenderer";

/**
 * 通用填空题：用于 fill_blank / calculation / word_problem 三种类型。
 * 顶部展示当前输入，底部是一个屏幕数字键盘（避免用户被迫调用系统输入法）。
 *
 * 键盘（web-lesson-13）：补 "-"（负数）与 "/"（分数）键；
 * 桌面端物理键盘可直接输入 0-9 . / - 和退格。
 */

// 数字键盘布局：三行数字（尾列 - / .）+ 底行 [0(占2) / ⌫(占2)]
const KEYPAD_KEYS: { key: string; span?: 2 }[] = [
  { key: "1" }, { key: "2" }, { key: "3" }, { key: "-" },
  { key: "4" }, { key: "5" }, { key: "6" }, { key: "/" },
  { key: "7" }, { key: "8" }, { key: "9" }, { key: "." },
  { key: "0", span: 2 }, { key: "⌫", span: 2 },
];

export function FillBlankQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);

  function handleKey(k: string) {
    if (locked || disabled) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    if (k === "⌫") {
      onChange(answer.slice(0, -1));
      return;
    }
    if (k === "." && answer.includes(".")) return;
    // "-" 只允许作为开头的负号
    if (k === "-" && answer.length > 0) return;
    // "/" 只允许出现一次，且前面必须已有数字（分数写法 3/4）
    if (k === "/" && (answer.includes("/") || !/\d$/.test(answer))) return;
    onChange(answer + k);
  }

  // 桌面端物理键盘：数字 / . / - / 退格（web-lesson-3 的填空半边）
  useEffect(() => {
    if (locked || disabled) return; // 遮罩打开时不接管键盘（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const k = e.key;
      if (/^[0-9]$/.test(k) || k === "." || k === "/" || k === "-") {
        e.preventDefault();
        handleKey(k);
      } else if (k === "Backspace") {
        e.preventDefault();
        handleKey("⌫");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, answer, question.id, locked]);

  let displayCls =
    "w-full min-h-[68px] text-3xl font-extrabold text-center px-4 py-4 rounded-2xl border-2 flex items-center justify-center";
  if (disabled) {
    displayCls = cn(
      displayCls,
      isCorrect
        ? "border-primary bg-primary/20 text-primary-dark"
        : "border-danger bg-danger/15 text-danger-dark",
    );
  } else {
    displayCls = cn(displayCls, "border-secondary bg-white text-ink shadow-glow");
  }

  return (
    <div className="w-full">
      <QuestionPrompt text={question.question} audio={question.audio?.question} locked={locked} />

      <motion.div
        className={displayCls}
        initial={{ scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      >
        {answer ? (
          <span className="min-w-0 max-w-full break-all">{answer}</span>
        ) : (
          <span className="text-ink-light text-xl font-bold">点下方数字键</span>
        )}
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

      {/* 屏幕数字键盘（4 列：数字 + - / . + 大 0 / 大退格） */}
      <div className="mt-6 grid grid-cols-4 gap-3 select-none">
        {KEYPAD_KEYS.map(({ key: k, span }) => (
          <motion.button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => handleKey(k)}
            className={cn(
              "ui-key h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-ink",
              "hover:border-secondary/60 active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              span === 2 && "col-span-2",
              k === "⌫" && "text-danger",
              (k === "-" || k === "/") && "text-secondary-dark",
            )}
            style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
          >
            {k}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
