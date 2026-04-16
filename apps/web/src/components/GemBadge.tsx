"use client";

/**
 * GemBadge —— 顶栏宝石计数胶囊。
 *
 * 和 StatsBar 上的 心数 / 连胜 / XP 保持一致的视觉风格（带边框的胶囊 + 图标 + 数字）。
 * 支持 gems 变化时弹跳 + 发光，用来强化"赚到"的正反馈。
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Gem } from "@/components/icons";

interface GemBadgeProps {
  className?: string;
  /** 是否包成链接（默认 true，点击进商店） */
  asLink?: boolean;
}

export function GemBadge({ className = "", asLink = true }: GemBadgeProps) {
  const gems = useProgressStore(s => s.gems);
  const [hydrated, setHydrated] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const prev = useRef(0);

  useEffect(() => setHydrated(true), []);

  // gems 上涨时触发一次脉冲
  useEffect(() => {
    if (!hydrated) return;
    if (gems > prev.current) setPulseKey(k => k + 1);
    prev.current = gems;
  }, [gems, hydrated]);

  const display = hydrated ? gems : 0;

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      whileTap={asLink ? { scale: 0.95 } : undefined}
      className={`relative h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 font-extrabold text-sm select-none tabular-nums border-purple-400/50 text-purple-600 bg-purple-100/70 ${asLink ? "hover:bg-purple-200/70 transition-colors cursor-pointer" : ""} ${className}`}
      aria-label="宝石（点击进入商店）"
    >
      <Gem className="w-4 h-4" />
      <motion.span
        key={display}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 18 }}
      >
        {display}
      </motion.span>

      {/* 发光脉冲 */}
      <AnimatePresence>
        {pulseKey > 0 && (
          <motion.span
            key={pulseKey}
            aria-hidden
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: "0 0 0 4px rgba(168, 85, 247, 0.45)" }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (asLink) {
    return <Link href="/shop">{inner}</Link>;
  }
  return inner;
}
