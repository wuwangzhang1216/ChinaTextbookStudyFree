"use client";

/**
 * 词语排序题：把打乱的词语按正确顺序点击拼成句子。
 *
 * answer 是逗号连接的正确顺序词语；
 * options 是打乱顺序的同一组词语。
 *
 * 交互：
 *   - 上方"已选区"按点击顺序展示
 *   - 下方"待选区"展示尚未点选的词语
 *   - 点击已选区的词可以撤回
 *   - 全部点完后自动 join 成 string 写入 answer，触发 onChange
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { QuestionRendererProps } from "./QuestionRenderer";

export function WordOrderQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const options = question.options ?? [];

  // 已选索引列表（指向 options 中的 index）
  const [picked, setPicked] = useState<number[]>([]);

  // 题目切换时重置
  useEffect(() => {
    setPicked([]);
  }, [question.id]);

  // picked 变化时同步到外部 answer
  useEffect(() => {
    const text = picked.map(i => options[i]).join(",");
    if (text !== answer) onChange(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  function pick(i: number) {
    if (disabled) return;
    if (picked.includes(i)) return;
    playSfx("tap");
    haptic("light");
    setPicked(p => [...p, i]);
  }

  function unpick(i: number) {
    if (disabled) return;
    playSfx("tap");
    haptic("light");
    setPicked(p => p.filter(x => x !== i));
  }

  const remaining = useMemo(
    () => options.map((_, i) => i).filter(i => !picked.includes(i)),
    [options, picked],
  );

  // checked 阶段下，把正确序列拆出来供对照展示
  const correctSeq = phase === "checked" ? question.answer.split(",").map(s => s.trim()) : [];

  return (
    <div className="w-full">
      <div className="text-xl font-bold text-ink mb-6 leading-relaxed whitespace-pre-wrap">
        <MathText text={question.question} />
      </div>

      {/* 已选区 */}
      <div
        className={cn(
          "min-h-[64px] rounded-2xl border-2 border-dashed p-3 flex flex-wrap gap-2 mb-4 transition-colors",
          disabled
            ? isCorrect
              ? "border-primary bg-primary/5"
              : "border-danger bg-danger/5"
            : "border-bg-softer bg-bg-soft",
        )}
      >
        <AnimatePresence>
          {picked.length === 0 && !disabled && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-ink-softer text-base self-center"
            >
              点击下方词语按顺序排列
            </motion.span>
          )}
          {picked.map(i => (
            <motion.button
              key={`pick-${i}`}
              type="button"
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 260 }}
              whileTap={!disabled ? { scale: 0.94 } : undefined}
              onClick={() => unpick(i)}
              disabled={disabled}
              className="px-3 py-2 rounded-xl bg-secondary text-white font-extrabold text-base shadow-chunky-secondary"
            >
              {options[i]}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* 待选区 */}
      <div className="flex flex-wrap gap-2">
        {remaining.map(i => (
          <motion.button
            key={`opt-${i}`}
            type="button"
            layout
            whileTap={!disabled ? { scale: 0.94 } : undefined}
            onClick={() => pick(i)}
            disabled={disabled}
            className="px-3 py-2 rounded-xl bg-white border-2 border-bg-softer text-ink font-extrabold text-base hover:border-secondary transition-colors"
            style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
          >
            {options[i]}
          </motion.button>
        ))}
        {remaining.length === 0 && disabled === false && (
          <span className="text-xs text-ink-softer self-center">已全部选完，请检查</span>
        )}
      </div>

      {/* 错误时显示正确答案 */}
      {phase === "checked" && !isCorrect && (
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mt-4 text-center text-sm text-ink-light"
        >
          正确顺序：
          <span className="font-extrabold text-primary-dark">{correctSeq.join(" → ")}</span>
        </motion.div>
      )}
    </div>
  );
}
