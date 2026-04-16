"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Volume } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playTTS, preloadTTS, stopTTS } from "@/lib/tts";

interface TTSButtonProps {
  src?: string | null;
  /** 进入视图时自动预加载 */
  preload?: boolean;
  /** 进入视图时自动播放一次（每次 src 变化触发） */
  autoPlay?: boolean;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}

/**
 * 点击播放预生成的 TTS mp3。无 src 时不渲染。
 */
export function TTSButton({
  src,
  preload = true,
  autoPlay = false,
  size = "md",
  className,
  label = "朗读",
}: TTSButtonProps) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (preload) preloadTTS(src);
  }, [src, preload]);

  useEffect(() => {
    if (!autoPlay || !src) return;
    void play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, autoPlay]);

  useEffect(() => () => {
    if (playing) stopTTS();
  }, [playing]);

  if (!src) return null;

  async function play(e?: React.MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    setPlaying(true);
    await playTTS(src);
    setPlaying(false);
  }

  const dim = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <motion.span
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={play}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); } }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "inline-flex items-center justify-center rounded-full cursor-pointer",
        "bg-bg-soft text-primary hover:bg-primary/10 transition-colors shrink-0",
        dim,
        playing && "animate-pulse text-primary",
        className,
      )}
    >
      <Volume className={icon} />
    </motion.span>
  );
}
