"use client";

/**
 * AchievementWall —— 个人中心的成就墙
 *
 * 网格展示所有成就，已解锁高亮 + 渐变边框；未解锁灰色 + 进度条。
 * 进入即调用 markAllSeen，清掉底部导航的红点。
 */

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
  markAllSeen,
  type Achievement,
} from "@/lib/achievements";
import { useProgressStore } from "@/store/progress";
import {
  Lightning,
  Flame,
  Star,
  Crown,
  Gem,
  Bookmark,
  Trophy,
  Rocket,
  Medal,
  Sparkle,
} from "@/components/icons";

const ICON_MAP = {
  lightning: Lightning,
  flame: Flame,
  star: Star,
  crown: Crown,
  gem: Gem,
  bookmark: Bookmark,
  trophy: Trophy,
  rocket: Rocket,
  medal: Medal,
  sparkle: Sparkle,
} as const;

export function AchievementWall() {
  const state = useProgressStore();
  const unlockedIds = useMemo(() => computeUnlockedAchievementIds(state), [state]);
  const unlockedSet = useMemo(() => new Set(unlockedIds), [unlockedIds]);

  useEffect(() => {
    markAllSeen();
  }, [unlockedIds.join(",")]);

  const unlockedCount = unlockedIds.length;
  const totalCount = ALL_ACHIEVEMENTS.length;

  return (
    <section
      className="bg-white rounded-3xl border-2 border-bg-softer p-5"
      style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
      aria-label="成就墙"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-base font-extrabold text-ink">成就</div>
        <div className="text-xs font-extrabold text-ink-light tabular-nums">
          <span className="text-primary">{unlockedCount}</span>
          <span className="text-ink-softer"> / {totalCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {ALL_ACHIEVEMENTS.map((a, idx) => (
          <AchievementBadge
            key={a.id}
            ach={a}
            unlocked={unlockedSet.has(a.id)}
            progress={a.getProgress(state)}
            delay={idx * 0.025}
          />
        ))}
      </div>
    </section>
  );
}

function AchievementBadge({
  ach,
  unlocked,
  progress,
  delay,
}: {
  ach: Achievement;
  unlocked: boolean;
  progress: number;
  delay: number;
}) {
  const Icon = ICON_MAP[ach.iconKey];
  const pct = Math.min(100, Math.round((progress / ach.goal) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", damping: 20 }}
      className={`relative flex flex-col items-center text-center p-2 rounded-2xl border-2 ${
        unlocked ? "bg-white" : "bg-bg-soft"
      }`}
      style={{
        borderColor: unlocked ? ach.color : "#E5E5E5",
        boxShadow: unlocked ? `0 3px 0 0 ${ach.color}` : "0 2px 0 0 #e5e5e5",
      }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: unlocked ? `${ach.color}22` : "#E5E5E5",
          color: unlocked ? ach.color : "#9CA3AF",
        }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div
        className={`text-[11px] font-extrabold mt-1.5 leading-tight line-clamp-1 ${
          unlocked ? "text-ink" : "text-ink-softer"
        }`}
        title={ach.name}
      >
        {ach.name}
      </div>
      <div className="text-[9px] text-ink-softer leading-tight mt-0.5 line-clamp-2 min-h-[1.6em]">
        {ach.description}
      </div>
      {!unlocked ? (
        <div className="w-full h-1 mt-1.5 bg-bg-softer rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: ach.color }}
          />
        </div>
      ) : (
        <div className="text-[9px] font-extrabold mt-1.5" style={{ color: ach.color }}>
          已解锁
        </div>
      )}
    </motion.div>
  );
}
