"use client";

/**
 * ContinueLearningCard —— Home 页顶部的"继续学习"大卡片。
 *
 * 行为：
 *   1. 如果 store 里有 activeLesson（未完成的课程会话），点击直达那节课
 *   2. 否则不渲染（Home 按年级网格选择即可）
 *
 * 视觉：Duolingo 风格绿色厚底卡片 + Mascot + 一句召唤 + ▶ CONTINUE 按钮
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mascot } from "./Mascot";
import { Sparkle } from "@/components/icons";
import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

/** 从 lessonId 反推 bookId —— pattern: {bookId}-u{N}-kp{M} */
function parseBookId(lessonId: string): string | null {
  const m = lessonId.match(/^(.+?)-u\d+-kp\d+$/);
  return m ? m[1] : null;
}

export function ContinueLearningCard() {
  const activeLesson = useProgressStore(s => s.activeLesson);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated || !activeLesson) return null;

  const bookId = parseBookId(activeLesson.lessonId);
  if (!bookId) return null;

  const href = `/lesson/${bookId}/${activeLesson.lessonId}/`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 220 }}
      className="w-full max-w-3xl lg:max-w-6xl mb-6 lg:mb-10"
    >
      <Link
        href={href}
        onClick={() => {
          playSfx("tap");
          haptic("medium");
        }}
        className="group block bg-white rounded-3xl border-2 border-primary/40 p-5 lg:p-7 hover:border-primary transition-colors relative overflow-hidden"
        style={{ boxShadow: "0 5px 0 0 #58a700" }}
      >
        <div className="flex items-center gap-3 lg:gap-6">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="shrink-0"
          >
            <Mascot mood="wave" size={64} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] lg:text-xs font-extrabold text-primary uppercase tracking-wide">
              继续学习
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="text-base lg:text-2xl font-extrabold text-ink truncate">
                上次的课程还没做完呢
              </span>
              <Sparkle className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-gold shrink-0" />
            </div>
            <div className="text-xs lg:text-base text-ink-light mt-1 truncate">
              已答 {activeLesson.correctCount + activeLesson.mistakeCount} 题 · 连击 ×{activeLesson.combo}
            </div>
          </div>
          <motion.div
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="shrink-0 w-12 h-12 lg:w-16 lg:h-16 rounded-2xl bg-primary text-white flex items-center justify-center"
            style={{ boxShadow: "0 4px 0 0 #58a700" }}
          >
            <span className="text-2xl font-extrabold">▶</span>
          </motion.div>
        </div>

        {/* 底部进度条占位（不显示具体百分比，仅视觉点缀） */}
        <motion.div
          className="mt-4 h-1.5 rounded-full bg-primary/15 overflow-hidden"
          aria-hidden
        >
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "60%" }}
            transition={{ delay: 0.3, duration: 0.8 }}
          />
        </motion.div>
      </Link>
    </motion.div>
  );
}
