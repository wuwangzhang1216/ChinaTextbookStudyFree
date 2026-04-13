"use client";

/**
 * 文字填空题：用于语文 / 英语 / 科学的术语填空。
 * 屏幕汉字键盘：把正确答案的字和干扰字打散，学生直接点字填写。
 *
 * 答案是 1-6 个汉字 / 1 个英文单词。
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import type { QuestionRendererProps } from "./QuestionRenderer";

/**
 * 常用汉字池 —— 用于生成干扰项，涵盖小学低年级高频字。
 */
const DISTRACTOR_POOL =
  "的一是了不人我在有他这中大来上个国到说们为子和你地出会也时要就可以对生能而着事前里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前把把道文些将主实重新明体开它合已从提力此面理由她长角期将再想许让向又物被全书走给最便位加将些别几义路反条其化或接将片向才助战持区住四带运段切反确据形今指两打西再至张头走知活步往什";

/** 简易伪随机 —— 基于 question id 做稳定 shuffle，每次渲染保持一致 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 根据答案生成候选字列表（答案字 + 干扰字，打散） */
function buildCandidates(answerStr: string, questionId: number): string[] {
  const answerChars = [...new Set(answerStr.split(""))];
  // 干扰字数量：至少让总数 >= 9，最多 12
  const need = Math.max(9, answerChars.length + 4);
  const distractorCount = need - answerChars.length;

  const pool = DISTRACTOR_POOL.split("").filter(c => !answerChars.includes(c));
  // 从池中选干扰字（用 seed 稳定）
  const shuffledPool = seededShuffle(pool, questionId + 7);
  const distractors = shuffledPool.slice(0, distractorCount);

  const all = [...answerChars, ...distractors];
  return seededShuffle(all, questionId);
}

export function FillBlankTextQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
}: QuestionRendererProps) {
  const disabled = phase === "checked";
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);

  const candidates = useMemo(
    () => buildCandidates(question.answer, question.id),
    [question.answer, question.id],
  );

  function handleKey(k: string) {
    if (disabled) return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    if (k === "⌫") {
      onChange(answer.slice(0, -1));
      return;
    }
    // 限制长度，防止误操作
    if (answer.length >= 10) return;
    onChange(answer + k);
  }

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

  // 键盘列数：候选字 <= 9 用 3 列，否则 4 列
  const cols = candidates.length <= 9 ? 3 : 4;

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed whitespace-pre-wrap flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} className="mt-1" label="朗读题目" />
      </div>

      {/* 答案显示区 */}
      <motion.div
        className={displayCls}
        initial={{ scale: 0.98, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      >
        {answer || <span className="text-ink-light/50 text-xl font-bold">点下方汉字作答</span>}
      </motion.div>

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

      {/* 汉字键盘 */}
      <div
        className="mt-6 grid gap-3 select-none"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {candidates.map((ch, i) => (
          <motion.button
            key={`${ch}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => handleKey(ch)}
            whileTap={!disabled ? { scale: 0.96 } : undefined}
            className={cn(
              "h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-ink",
              "hover:border-secondary/60 active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            )}
            style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
          >
            {ch}
          </motion.button>
        ))}
        {/* 退格键 */}
        <motion.button
          type="button"
          disabled={disabled}
          onClick={() => handleKey("⌫")}
          whileTap={!disabled ? { scale: 0.96 } : undefined}
          className={cn(
            "h-14 rounded-2xl text-2xl font-extrabold bg-white border-2 border-bg-softer text-danger",
            "hover:border-danger/40 active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
          )}
          style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
        >
          ⌫
        </motion.button>
      </div>
    </div>
  );
}
