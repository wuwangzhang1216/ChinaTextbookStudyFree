"use client";

/**
 * RightRail —— 桌面端右侧 rail（仿 Duolingo web）
 *
 * 顺序：StatsBar HUD / LeaderboardTeaserCard / DailyQuestsPanel
 * 每日目标环继续留在 profile；rail 上的目标卡已被「每日任务卡」取代。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UNLOCK_LESSONS,
  botsForWeek,
  botXpAt,
  leagueTier,
  userRank,
  weekKeyFor,
} from "@cstf/core/league";
import { StatsBar } from "@/components/StatsBar";
import { DailyQuestsPanel } from "@/components/DailyQuestsPanel";
import { useProgressStore, weekXpFromHistory } from "@/store/progress";
import { Trophy } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function RightRail() {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-end">
        <StatsBar compact />
      </div>
      <LearningNextStep />
      <DailyQuestsPanel />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border-2 border-bg-softer bg-white p-4"
      style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
    >
      {children}
    </div>
  );
}

/**
 * 排行榜真卡（Wave E1）：
 *   - 未解锁：还差 N 课的进度引导
 *   - 已解锁：当前名次 + 段位小卡（实时按 core botXpAt 计算）
 * 点击进入 /league/。
 */
function LeaderboardTeaserCard() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  const tierId = useProgressStore(s => s.leagueTier);
  const salt = useProgressStore(s => s.leagueSalt);
  const xpHistory = useProgressStore(s => s.xpHistory);

  const remaining = Math.max(0, UNLOCK_LESSONS - completed);
  const unlocked = hydrated && remaining === 0;

  let rank: number | null = null;
  const tier = leagueTier(tierId);
  if (unlocked && salt) {
    const now = new Date();
    const weekKey = weekKeyFor(now);
    const botXps = botsForWeek({ weekKey, tier: tier.id, salt }).map((_, i) =>
      botXpAt({ weekKey, tier: tier.id, salt, botIndex: i, date: now }),
    );
    rank = userRank({ userXp: weekXpFromHistory(xpHistory, weekKey), botXps });
  }

  return (
    <Link
      href="/league/"
      onClick={() => {
        playSfx("tap");
        haptic("light");
      }}
      className="block"
      aria-label={unlocked ? `排行榜：当前第 ${rank ?? "-"} 名` : "解锁排行榜"}
    >
      <CardShell>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-bg-soft border-2 border-bg-softer flex items-center justify-center shrink-0"
            style={
              unlocked
                ? { backgroundColor: `${tier.color}22`, borderColor: `${tier.color}66` }
                : undefined
            }
          >
            <Trophy
              className="w-5 h-5"
              style={{ color: unlocked ? tier.color : "#AFAFAF" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            {unlocked ? (
              <>
                <div className="text-sm font-extrabold text-ink">
                  {tier.name} · 第 {rank ?? "-"} 名
                </div>
                <div className="text-xs text-ink-light mt-0.5">
                  {rank != null && rank <= 5
                    ? "保持住，晋级区里见！"
                    : "多学几课，冲进前 5 名！"}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-extrabold text-ink">解锁排行榜</div>
                <div className="text-xs text-ink-light mt-0.5">
                  还差 {remaining} 节课
                </div>
              </>
            )}
          </div>
          <span className="text-ink-softer font-extrabold" aria-hidden>
            →
          </span>
        </div>
      </CardShell>
    </Link>
  );
}


function LearningNextStep() {
  const grade = useProgressStore(s => s.selectedGrade) ?? 1;
  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  if (completed >= UNLOCK_LESSONS) return <LeaderboardTeaserCard />;
  return <CardShell><p className="font-extrabold text-ink">和聪聪读一读</p><p className="text-sm text-ink-light mt-2">听一个故事，发现课本之外的新世界。</p><Link href={`/stories/chinese-g${grade}up/`} className="inline-flex min-h-11 items-center text-secondary-dark font-bold mt-2">去听故事 →</Link></CardShell>;
}
