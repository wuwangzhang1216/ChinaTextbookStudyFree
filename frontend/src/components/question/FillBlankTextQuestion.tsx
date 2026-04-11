"use client";

/**
 * 文字填空题：用于语文 / 英语 / 科学的术语填空。
 * 不像数学的 fill_blank（数字键盘），这里直接用系统输入法。
 *
 * 答案是 1-6 个汉字 / 1 个英文单词。
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import type { QuestionRendererProps } from "./QuestionRenderer";

export function FillBlankTextQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
}: QuestionRendererProps) {
  const disabled = phase === "checked";

  let cls =
    "w-full text-2xl font-extrabold text-center px-4 py-4 rounded-2xl border-2 outline-none transition-all";
  if (disabled) {
    cls = cn(
      cls,
      isCorrect
        ? "border-primary bg-primary/10 text-primary-dark"
        : "border-danger bg-danger/10 text-danger-dark",
    );
  } else {
    cls = cn(cls, "border-bg-softer focus:border-secondary focus:shadow-glow text-ink bg-white");
  }

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed whitespace-pre-wrap flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} className="mt-1" label="朗读题目" />
      </div>

      <motion.input
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={answer}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder="在此输入答案"
        className={cls}
        autoFocus
        initial={{ scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      />

      {phase === "checked" && !isCorrect && (
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mt-3 text-center text-sm text-ink-light"
        >
          正确答案：
          <span className="font-extrabold text-primary-dark">{question.answer}</span>
        </motion.div>
      )}
    </div>
  );
}
