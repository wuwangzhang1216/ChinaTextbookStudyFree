"use client";

/**
 * RightRail —— 桌面端右侧 rail（仿 Duolingo web）
 *
 * 顺序：StatsBar HUD / DailyQuestsCard / LeaderboardTeaserCard / CreateProfilePromptCard / 页脚
 */

import { StatsBar } from "@/components/StatsBar";
import { useProgressStore } from "@/store/progress";
import { Lightning, Trophy } from "@/components/icons";

export function RightRail() {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-end">
        <StatsBar compact />
      </div>
      <LeaderboardTeaserCard />
      <DailyQuestsCard />
      <CreateProfilePromptCard />
      <FooterLinks />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border-2 border-bg-softer bg-white p-4"
      style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
    >
      {children}
    </div>
  );
}

function LeaderboardTeaserCard() {
  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  const NEED = 10;
  const remaining = Math.max(0, NEED - completed);
  if (remaining === 0) return null;
  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-bg-soft border-2 border-bg-softer flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-ink-softer" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-ink">解锁排行榜</div>
          <div className="text-xs text-ink-light mt-0.5">还差 {remaining} 节课</div>
        </div>
      </div>
    </CardShell>
  );
}

function DailyQuestsCard() {
  const todayXp = useProgressStore(s => s.todayXp);
  const target = 10;
  const pct = Math.min(100, Math.round((todayXp / target) * 100));
  return (
    <CardShell>
      <div className="text-sm font-extrabold text-ink mb-2">每日任务</div>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center shrink-0">
          <Lightning className="w-5 h-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 rounded-full bg-bg-softer overflow-hidden">
              <div
                className="h-full bg-warning rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10px] font-extrabold text-ink-softer tabular-nums shrink-0">
              {Math.min(todayXp, target)}/{target}
            </div>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function CreateProfilePromptCard() {
  return null;
}

function FooterLinks() {
  return null;
}
