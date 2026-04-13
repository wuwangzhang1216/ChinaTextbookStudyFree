"use client";

/**
 * HeartTimer —— 心数不满时显示 mm:ss 到下一颗心。
 *
 * 放在课程页顶栏（LessonRunner），小胶囊贴在 HeartsBar 旁边。
 * hearts === MAX 或 nextHeartAt 为 null 时返回 null（不渲染）。
 *
 * 依赖 useProgressTicker 每秒刷新。LessonRunner 已经 mount 了 ticker，
 * 这里直接读取 store + 订阅自己的 tick 即可。
 */

import { motion } from "framer-motion";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import { MAX_HEARTS, useProgressStore } from "@/store/progress";
import { Heart } from "@/components/icons";

interface HeartTimerProps {
  className?: string;
}

export function HeartTimer({ className = "" }: HeartTimerProps) {
  const now = useProgressTicker();
  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);

  if (hearts >= MAX_HEARTS || !nextHeartAt) return null;

  const ms = Math.max(0, nextHeartAt - now);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full bg-danger/10 border-2 border-danger/30 text-danger text-xs font-extrabold tabular-nums ${className}`}
      aria-label={`下一颗心还需 ${formatMsCountdown(ms)}`}
    >
      <Heart className="w-3.5 h-3.5" />
      <span>+{formatMsCountdown(ms)}</span>
    </motion.div>
  );
}
