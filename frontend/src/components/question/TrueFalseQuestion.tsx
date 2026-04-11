"use client";

import { motion } from "framer-motion";
import { Check, XMark } from "@/components/icons";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { QuestionRendererProps } from "./QuestionRenderer";

const TRUE_VALUES = new Set(["对", "正确", "true", "T", "✓", "√"]);

export function TrueFalseQuestion({ question, answer, phase, isCorrect, onChange }: QuestionRendererProps) {
  const correctIsTrue = TRUE_VALUES.has(question.answer.trim());

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
          playSfx("tap");
          haptic("light");
          onChange(label);
        }}
        whileTap={phase === "answering" ? { scale: 0.96 } : undefined}
        className={cn("flex-1 flex flex-col items-center gap-2 py-6", cls)}
      >
        <motion.div animate={selected ? { scale: [1, 1.2, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
          {icon}
        </motion.div>
        <span className="text-2xl font-extrabold">{label}</span>
      </motion.button>
    );
  };

  return (
    <div className="w-full">
      <div className="text-2xl font-bold text-ink mb-8 leading-relaxed">
        <MathText text={question.question} />
      </div>
      <div className="flex gap-4">
        {renderBtn("对", <Check className="w-12 h-12 text-primary" />)}
        {renderBtn("错", <XMark className="w-12 h-12 text-danger" />)}
      </div>
    </div>
  );
}
