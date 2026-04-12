"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "@/components/icons";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { uiAudio } from "@/lib/uiAudio";

interface FeedbackPanelProps {
  isCorrect: boolean;
  explanation: string;
  explanationAudio?: string | null;
  onContinue: () => void;
}

const PRAISE_POOL = ["太棒了！", "完美！", "做得好！", "天才！", "继续保持！", "漂亮！"];
const COMFORT_POOL = ["再想想", "差一点", "加油", "没关系", "下次就对！"];

export function FeedbackPanel({ isCorrect, explanation, explanationAudio, onContinue }: FeedbackPanelProps) {
  const bg = isCorrect ? "bg-primary/10 border-primary" : "bg-danger/10 border-danger";
  const titleColor = isCorrect ? "text-primary-dark" : "text-danger-dark";
  const btnCls = isCorrect ? "btn-chunky-primary" : "btn-chunky-danger";

  const title = useMemo(() => {
    const pool = isCorrect ? PRAISE_POOL : COMFORT_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [isCorrect]);

  // 面板出现：只播标题语音（"太棒了！" / "再想想"），讲解保留手动喇叭
  useAutoNarrate([uiAudio(title)], explanation);

  return (
    <motion.div
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className={`fixed bottom-0 left-0 right-0 border-t-4 ${bg} backdrop-blur-sm`}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}
    >
      <div className="max-w-md mx-auto px-5 py-5">
        <div className={`flex items-center gap-3 mb-3 font-extrabold text-2xl ${titleColor}`}>
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 260, delay: 0.05 }}
            className="inline-flex"
          >
            {isCorrect ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </motion.span>
          <motion.span
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.12 }}
          >
            {title}
          </motion.span>
        </div>
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-2 text-ink text-base leading-relaxed mb-4"
        >
          <div className="flex-1">
            <MathText text={explanation} />
          </div>
          {explanationAudio && (
            <TTSButton src={explanationAudio} size="sm" label="重听讲解" className="mt-0.5" />
          )}
        </motion.div>
        <button
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onContinue();
          }}
          className={`w-full ${btnCls}`}
        >
          继续
        </button>
      </div>
    </motion.div>
  );
}
