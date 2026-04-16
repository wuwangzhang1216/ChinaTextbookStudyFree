"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { StatsBar } from "@/components/StatsBar";
import { DailyGoalRing } from "@/components/DailyGoalRing";
import { AchievementWall } from "@/components/AchievementWall";
import { WeeklyReportCard } from "@/components/WeeklyReportCard";
import { AppShell } from "@/components/layout/AppShell";
import {
  ArrowLeft,
  Lightning,
  Flame,
  Star,
  Crown,
  Snowflake,
  Bookmark,
  Gem,
} from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ProfileClient() {
  const xp = useProgressStore(s => s.xp);
  const streak = useProgressStore(s => s.streak);
  const freezes = useProgressStore(s => s.streakFreezes);
  const completedLessons = useProgressStore(s => s.completedLessons);
  const mistakes = useProgressStore(s => s.mistakesBank);
  const lifetimeGems = useProgressStore(s => s.lifetimeGems);
  const dailyTimeLimitMs = useProgressStore(s => s.dailyTimeLimitMs);
  const setDailyTimeLimit = useProgressStore(s => s.setDailyTimeLimit);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  function pickLimit(min: number) {
    playSfx("tap");
    haptic("light");
    setDailyTimeLimit(min * 60_000);
  }

  const completedCount = hydrated ? Object.keys(completedLessons).length : 0;
  const totalStars = hydrated
    ? Object.values(completedLessons).reduce((acc, r) => acc + r.stars, 0)
    : 0;
  const mistakesCount = hydrated ? mistakes.length : 0;

  return (
    <AppShell right={null} centerMaxWidth={920}>
    <main className="min-h-screen bg-bg-soft lg:bg-transparent relative">
      {/* Header —— 移动端白底 sticky；桌面端简化为 标题 + compact HUD */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10 lg:bg-transparent lg:border-0 lg:static lg:mb-2">
        <div className="max-w-2xl lg:max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-0 lg:py-2">
          <SoundLink
            href="/"
            aria-label="返回"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0 lg:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
          <div className="flex-1 min-w-0 text-center lg:hidden">
            <div className="text-base font-extrabold text-ink truncate">我的主页</div>
          </div>
          <div className="hidden lg:block flex-1" />
          <div className="shrink-0">
            <StatsBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 py-8">
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

        {/* 桌面 2x2 网格：商店 / 成就 / 错题本 / 家长设置 */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-5">
        {/* 累计宝石 + 商店入口 */}
        <SoundLink
          href="/shop"
          hapticIntensity="medium"
          className="group flex items-center gap-4 bg-white rounded-3xl border-2 border-purple-200 p-5 mb-6 lg:mb-0 hover:border-purple-400 transition-colors"
          style={{ boxShadow: "0 4px 0 0 #d8b4fe" }}
        >
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
            <Gem className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-extrabold text-ink">美妆商店</div>
            <div className="text-sm text-ink-light">
              累计获得 <span className="font-extrabold text-purple-600">{hydrated ? lifetimeGems : 0}</span> 颗宝石 · 去给聪聪换装吧
            </div>
          </div>
          <div className="text-ink-softer text-xl">›</div>
        </SoundLink>

        {/* 本周报告 */}
        <div className="mb-6 lg:mb-0">
          {hydrated && <WeeklyReportCard />}
        </div>

        {/* 连胜护盾小卡片 */}
        <section
          className="bg-white rounded-3xl border-2 border-bg-softer p-5 mb-6 lg:mb-0"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="text-base font-extrabold text-ink mb-3">连胜护盾</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
              <Snowflake className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-ink">
                剩余 <span className="text-secondary tabular-nums">{hydrated ? freezes : 0}</span> 个
              </div>
              <div className="text-xs text-ink-light">周一自动补给一个 · 防止连胜中断</div>
            </div>
          </div>
        </section>

        {/* 成就墙（占满整行） */}
        <div className="lg:col-span-2 mb-6 lg:mb-0">
          {hydrated && <AchievementWall />}
        </div>

        {/* 快速入口 */}
        <SoundLink
          href="/review"
          hapticIntensity="medium"
          className="group flex items-center gap-4 bg-white rounded-3xl border-2 border-bg-softer p-5 hover:border-primary transition-colors mb-6 lg:mb-0"
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

        {/* 家长设置：每日学习时间上限（默认关闭，家长自愿启用） */}
        <section
          className="bg-white rounded-3xl border-2 border-bg-softer p-5"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-base font-extrabold text-ink">家长设置 · 每日时间上限</div>
            <span className="text-[10px] text-ink-softer uppercase tracking-wider">
              防沉迷
            </span>
          </div>
          <div className="text-xs text-ink-light mb-3">
            达到上限后会暂停新课程，鼓励休息眼睛 · 不影响已开始的课程
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { label: "不限制", min: 0 },
              { label: "20 分钟", min: 20 },
              { label: "30 分钟", min: 30 },
              { label: "45 分钟", min: 45 },
              { label: "60 分钟", min: 60 },
            ] as const).map(opt => {
              const active = hydrated && dailyTimeLimitMs === opt.min * 60_000;
              return (
                <button
                  key={opt.min}
                  type="button"
                  onClick={() => pickLimit(opt.min)}
                  className={`h-9 px-4 inline-flex items-center rounded-2xl text-sm font-extrabold border-2 transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-ink-light border-bg-softer hover:border-primary/40"
                  }`}
                  style={
                    active
                      ? { boxShadow: "0 3px 0 0 #58A700" }
                      : { boxShadow: "0 2px 0 0 #e5e5e5" }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>
        </div>
      </div>
    </main>
    </AppShell>
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
      <div className="text-2xl font-extrabold text-ink mt-2 tabular-nums leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold mt-1.5">{label}</div>
    </motion.div>
  );
}

