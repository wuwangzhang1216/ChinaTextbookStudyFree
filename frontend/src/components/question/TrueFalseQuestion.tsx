"use client";

import { motion } from "framer-motion";
import { Check, XMark } from "@/components/icons";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import type { QuestionRendererProps } from "./QuestionRenderer";

const TRUE_VALUES = new Set(["对", "正确", "true", "T", "✓", "√"]);

export function TrueFalseQuestion({ question, answer, phase, isCorrect, onChange }: QuestionRendererProps) {
  const correctIsTrue = TRUE_VALUES.has(question.answer.trim());
  const cancelNarrate = useAutoNarrate([question.audio?.question], question.id);

  const renderBtn = (label: "对" | "错", icon: React.ReactNode) => {
    const selected = answer === label;
    const thisCorrect = (label === "对") === correctIsTrue;
    let cls = "option-card";
    if (phase === "checked") {
      if (thisCorrect) cls = "option-card option-card-correct";
      else if (selected && !isCorrect) cls = "option-card option-card-wrong";
    } else if (selected) {
      cls = "option-card option-card-selected";
    }
    return (
      <motion.button
        key={label}
        type="button"
        disabled={phase === "checked"}
        onClick={() => {
          if (phase !== "answering") return;
          cancelNarrate();
          playSfx("tap");
          haptic("light");
          onChange(label);
        }}
        whileTap={phase === "answering" ? { scale: 0.98 } : undefined}
        className={cn("flex-1 flex flex-col items-center gap-2", cls)}
        style={{ minHeight: 108 }}
      >
        <motion.div animate={selected ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
          {icon}
        </motion.div>
        <span className="text-lg font-extrabold">{label}</span>
      </motion.button>
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} className="mt-1" label="朗读题目" />
      </div>
      <div className="flex gap-3">
        {renderBtn("对", <Check className="w-10 h-10 text-primary" />)}
        {renderBtn("错", <XMark className="w-10 h-10 text-danger" />)}
      </div>
    </div>
  );
}
