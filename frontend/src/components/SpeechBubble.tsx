"use client";

/**
 * SpeechBubble — 聪聪对话气泡
 *
 * 白底圆角，带一个指向左下的小三角，spring 弹入，随后自然静止。
 * 父组件通过 key 变化触发重挂载 + 动画。
 */

import { motion } from "framer-motion";

interface SpeechBubbleProps {
  text: string;
  tone?: "neutral" | "primary" | "danger";
}

export function SpeechBubble({ text, tone = "neutral" }: SpeechBubbleProps) {
  const colors =
    tone === "primary"
      ? { border: "border-primary", text: "text-primary-dark", bg: "bg-primary/15", shadow: "0 3px 0 0 rgba(88,204,2,0.35)" }
      : tone === "danger"
        ? { border: "border-danger", text: "text-danger-dark", bg: "bg-danger/15", shadow: "0 3px 0 0 rgba(234,43,43,0.3)" }
        : { border: "border-bg-softer", text: "text-ink", bg: "bg-white", shadow: "0 3px 0 0 rgba(0,0,0,0.08)" };

  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0, x: -8 }}
      animate={{ scale: 1, opacity: 1, x: 0 }}
      exit={{ scale: 0.7, opacity: 0, x: -8 }}
      transition={{ type: "spring", damping: 16, stiffness: 320 }}
      className={`relative inline-block h-8 px-3.5 inline-flex items-center rounded-2xl border-2 font-extrabold text-sm whitespace-nowrap ${colors.border} ${colors.text} ${colors.bg}`}
      style={{ boxShadow: colors.shadow }}
    >
      {text}
      {/* 指向左下的小三角 */}
      <span
        className={`absolute -bottom-[6px] left-4 w-0 h-0`}
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid currentColor",
        }}
      />
    </motion.div>
  );
}
