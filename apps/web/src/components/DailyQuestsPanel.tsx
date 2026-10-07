"use client";

/**
 * DailyQuestsPanel —— 每日任务卡（仿多邻国 Daily Quests）
 *
 * 三条任务来自 @cstf/core dailyQuests（同一天双端结果一致）：
 *   - 每条任务：图标 + 中文标题 + 进度条 + 宝箱奖励意象
 *   - 完成未领取 → 高亮「领取」按钮（动效 + 音效 + toast）
 *   - 头部显示「距刷新还有 N 小时」倒计时（本地午夜刷新）
 *
 * 桌面端挂在 RightRail，移动端挂在 ProfileClient 顶部 —— 同一组件双端复用。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Quest, QuestKind } from "@cstf/core/quests";
import { useProgressStore } from "@/store/progress";
import { Lightning, BookOpen, Bookmark, Book, Chest, ChestOpen, Gem, Check } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

/** 各任务类型的图标与配色（feather 色板） */
const KIND_STYLE: Record<
  QuestKind,
  { icon: React.ComponentType<{ className?: string }>; iconBg: string; iconColor: string; bar: string }
> = {
  earnXP:         { icon: Lightning, iconBg: "bg-warning/20",   iconColor: "text-warning",        bar: "bg-warning" },
  finishLessons:  { icon: BookOpen,  iconBg: "bg-primary/15",   iconColor: "text-primary-dark",   bar: "bg-primary" },
  reviewMistakes: { icon: Bookmark,  iconBg: "bg-danger/10",    iconColor: "text-danger",         bar: "bg-danger" },
  readTexts:      { icon: Book,      iconBg: "bg-secondary/15", iconColor: "text-secondary-dark", bar: "bg-secondary" },
};

/** 本地时区的今天，YYYY-MM-DD（与 store 同实现） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 到今晚午夜的剩余时间文案：≥1 小时显示「N 小时」，否则「N 分钟」 */
function formatUntilMidnight(now: number): string {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const ms = Math.max(0, midnight.getTime() - now);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} 小时`;
  const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
  return `${minutes} 分钟`;
}

export function DailyQuestsPanel() {
  const toast = useToast();
  const todayQuests = useProgressStore(s => s.todayQuests);
  const questProgress = useProgressStore(s => s.questProgress);
  const claimQuest = useProgressStore(s => s.claimQuest);
  const claimedQuests = useProgressStore(s => s.claimedQuests);
  // 订阅进度相关原始字段：埋点变化时驱动本卡重渲染
  useProgressStore(s => s.todayXp);
  useProgressStore(s => s.lastXpDate);
  useProgressStore(s => s.dailyQuestDate);
  useProgressStore(s => s.dailyLessons);
  useProgressStore(s => s.dailyReviews);
  useProgressStore(s => s.dailyReadings);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 分钟级 tick：驱动倒计时 + 跨午夜自动换题
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 领取动效：记录刚领取的任务 id，播放 +N💎 弹跳
  const [justClaimed, setJustClaimed] = useState<string | null>(null);

  // SSR 首帧没有可靠本地日期，hydrate 后再生成任务，避免水合不一致
  const quests: Quest[] = hydrated ? todayQuests() : [];
  const today = todayStr();

  function handleClaim(quest: Quest) {
    playSfx("tap");
    haptic("light");
    const ok = claimQuest(quest.id, quest.reward);
    if (!ok) return;
    playSfx("unlock");
    haptic("success");
    setJustClaimed(quest.id);
    toast.success(`🎁 任务完成！+${quest.reward}💎`, 3000);
    window.setTimeout(() => setJustClaimed(c => (c === quest.id ? null : c)), 1200);
  }

  return (
    <div
      className="rounded-2xl border-2 border-bg-softer bg-white p-4"
      style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-extrabold text-ink">每日任务</div>
        {hydrated && (
          <div className="text-[10px] font-extrabold text-ink-softer">
            距刷新还有 {formatUntilMidnight(now)}
          </div>
        )}
      </div>

      {!hydrated ? (
        // 骨架占位：三条灰色行，避免闪烁
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-bg-soft shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded-full bg-bg-soft" />
                <div className="h-3 rounded-full bg-bg-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {quests.map(quest => (
            <QuestRow
              key={quest.id}
              quest={quest}
              progress={questProgress(quest.kind)}
              claimed={!!claimedQuests[`${today}:${quest.id}`]}
              justClaimed={justClaimed === quest.id}
              onClaim={() => handleClaim(quest)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestRow({
  quest,
  progress,
  claimed,
  justClaimed,
  onClaim,
}: {
  quest: Quest;
  progress: number;
  claimed: boolean;
  justClaimed: boolean;
  onClaim: () => void;
}) {
  const style = KIND_STYLE[quest.kind];
  const Icon = style.icon;
  const done = progress >= quest.target;
  const claimable = done && !claimed;
  const pct = Math.min(100, Math.round((Math.min(progress, quest.target) / quest.target) * 100));

  return (
    <div className="relative flex items-center gap-3">
      {/* 任务图标 */}
      <div
        className={`w-10 h-10 rounded-xl ${claimed ? "bg-bg-soft" : style.iconBg} flex items-center justify-center shrink-0`}
      >
        <Icon className={`w-5 h-5 ${claimed ? "text-ink-softer" : style.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-xs font-extrabold truncate ${claimed ? "text-ink-softer" : "text-ink"}`}>
          {quest.title}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-3 rounded-full bg-bg-softer overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`h-full rounded-full ${claimed ? "bg-bg-softer" : style.bar}`}
            />
          </div>
          <div className="text-[10px] font-extrabold text-ink-softer tabular-nums shrink-0">
            {Math.min(progress, quest.target)}/{quest.target}
          </div>
        </div>
      </div>

      {/* 奖励区：宝箱意象 → 可领取时变成高亮「领取」按钮 */}
      <div className="shrink-0 w-[52px] flex flex-col items-center">
        {claimed ? (
          <div className="flex flex-col items-center text-primary" aria-label="已领取">
            <ChestOpen className="w-6 h-6" />
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-extrabold">
              <Check className="w-3 h-3" /> 已领
            </span>
          </div>
        ) : claimable ? (
          <motion.button
            type="button"
            onClick={onClaim}
            whileTap={{ scale: 0.92 }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center text-ink rounded-xl px-2 py-1 min-h-11 min-w-11"
            style={{
              background: "linear-gradient(135deg, #FFC800, #FF9600)",
              boxShadow: "0 3px 0 0 #C89600",
            }}
            aria-label={`领取奖励 ${quest.reward} 宝石`}
          >
            <Chest className="w-5 h-5" />
            <span className="text-[10px] font-extrabold leading-tight">领取</span>
          </motion.button>
        ) : (
          <div className="flex flex-col items-center text-ink-softer">
            <Chest className="w-6 h-6" />
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-extrabold text-secondary tabular-nums">
              <Gem className="w-3 h-3" />
              {quest.reward}
            </span>
          </div>
        )}
      </div>

      {/* +N💎 领取飘字 */}
      <AnimatePresence>
        {justClaimed && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -28, scale: 1.1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="pointer-events-none absolute right-1 top-0 inline-flex items-center gap-0.5 text-sm font-extrabold text-secondary-dark"
          >
            <Gem className="w-4 h-4" />+{quest.reward}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
