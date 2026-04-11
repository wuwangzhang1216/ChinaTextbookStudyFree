"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { StatsBar } from "@/components/StatsBar";
import { DailyGoalRing } from "@/components/DailyGoalRing";
import {
  ArrowLeft,
  Lightning,
  Flame,
  Star,
  Crown,
  Snowflake,
  Bookmark,
} from "@/components/icons";

export function ProfileClient() {
  const xp = useProgressStore(s => s.xp);
  const streak = useProgressStore(s => s.streak);
  const freezes = useProgressStore(s => s.streakFreezes);
  const completedLessons = useProgressStore(s => s.completedLessons);
  const mistakes = useProgressStore(s => s.mistakesBank);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const completedCount = hydrated ? Object.keys(completedLessons).length : 0;
  const totalStars = hydrated
    ? Object.values(completedLessons).reduce((acc, r) => acc + r.stars, 0)
    : 0;
  const perfectCount = hydrated
    ? Object.values(completedLessons).filter(r => r.stars === 3).length
    : 0;
  const mistakesCount = hydrated ? mistakes.length : 0;

  return (
    <main className="min-h-screen bg-bg-soft relative">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <SoundLink href="/" className="text-ink-light hover:text-primary shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </SoundLink>
          <div className="flex-1 text-center">
            <div className="text-lg font-extrabold text-ink">我的主页</div>
          </div>
          <StatsBar />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 顶部：聪聪 + 问候 + 每日目标环 */}
        <div className="flex items-center gap-6 mb-8">
          <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
          >
            <Mascot mood="wave" size={120} />
          </motion.div>
          <div className="flex-1">
            <div className="text-sm text-ink-light">欢迎回来</div>
            <div className="text-2xl font-extrabold text-ink">聪明的同学</div>
            <div className="text-sm text-ink-light mt-1">
              {hydrated && streak > 0 ? `已连续学习 ${streak} 天` : "开始你的学习之旅"}
            </div>
          </div>
          <DailyGoalRing size={100} />
        </div>

        {/* 统计卡片网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard
            icon={<Lightning className="w-6 h-6" />}
            label="总经验"
            value={hydrated ? xp.toString() : "0"}
            color="text-secondary"
          />
          <StatCard
            icon={<Flame className="w-6 h-6" />}
            label="连续天数"
            value={hydrated ? streak.toString() : "0"}
            color="text-warning"
          />
          <StatCard
            icon={<Crown className="w-6 h-6" />}
            label="完成课程"
            value={completedCount.toString()}
            color="text-primary"
          />
          <StatCard
            icon={<Star className="w-6 h-6 fill-current" />}
            label="获得星星"
            value={totalStars.toString()}
            color="text-gold"
          />
        </div>

        {/* 成就栏 */}
        <section className="bg-white rounded-3xl border-2 border-bg-softer p-5 mb-6"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="text-base font-extrabold text-ink mb-4">成就</div>
          <div className="space-y-3">
            <Achievement
              icon={<Snowflake className="w-5 h-5 text-secondary" />}
              title="连胜护盾"
              desc={`剩余 ${freezes} 个 · 可保护连胜不中断`}
            />
            <Achievement
              icon={<Star className="w-5 h-5 fill-current text-gold" />}
              title="完美通关"
              desc={`已三星通过 ${perfectCount} 节小课`}
            />
          </div>
        </section>

        {/* 快速入口 */}
        <SoundLink
          href="/review"
          hapticIntensity="medium"
          className="group flex items-center gap-4 bg-white rounded-3xl border-2 border-bg-softer p-5 hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <Bookmark className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-extrabold text-ink">错题本</div>
            <div className="text-sm text-ink-light">
              {mistakesCount > 0 ? `${mistakesCount} 道题待复习` : "暂无错题"}
            </div>
          </div>
          <div className="text-ink-softer text-xl">›</div>
        </SoundLink>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border-2 border-bg-softer p-4"
      style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
    >
      <div className={`${color}`}>{icon}</div>
      <div className="text-2xl font-extrabold text-ink mt-2 tabular-nums">{value}</div>
      <div className="text-xs text-ink-light mt-0.5">{label}</div>
    </motion.div>
  );
}

function Achievement({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-bg-soft">
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border-2 border-bg-softer">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold text-ink">{title}</div>
        <div className="text-xs text-ink-light">{desc}</div>
      </div>
    </div>
  );
}
