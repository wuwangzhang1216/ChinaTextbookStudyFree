"use client";

/**
 * StatsBar — 顶栏持续状态条（心数 · 连续天数 · XP · 静音）
 *
 * 放在 Home / Grade / Book 等主页面的右上角。
 * 心数胶囊可点击弹出恢复倒计时详情。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MAX_HEARTS, useProgressStore } from "@/store/progress";
import { Heart, Flame, Lightning, Snowflake } from "@/components/icons";
import { MuteToggle, AutoNarrateToggle, useSyncMute } from "./MuteToggle";
import { Modal } from "./Modal";
import { GemBadge } from "./GemBadge";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { Mascot } from "./Mascot";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";

interface StatsBarProps {
  /** 紧凑模式：移动端 / 内页用，只显示 心 + 连击 + 宝石，省掉 XP & 音频开关 */
  compact?: boolean;
}

export function StatsBar({ compact = false }: StatsBarProps = {}) {
  useSyncMute();
  const now = useProgressTicker();

  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const streak = useProgressStore(s => s.streak);
  const freezes = useProgressStore(s => s.streakFreezes);
  const xp = useProgressStore(s => s.xp);

  const [hydrated, setHydrated] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  useEffect(() => setHydrated(true), []);

  const dHearts = hydrated ? hearts : MAX_HEARTS;
  const dStreak = hydrated ? streak : 0;
  const dFreezes = hydrated ? freezes : 0;
  const dXp = hydrated ? xp : 0;
  const dNextHeartAt = hydrated ? nextHeartAt : null;

  const streakActive = dStreak > 0;
  const heartsFull = dHearts >= MAX_HEARTS;
  const msToNext = dNextHeartAt ? Math.max(0, dNextHeartAt - now) : 0;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* 心数胶囊 */}
        <motion.button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            setShowHearts(true);
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.95 }}
          className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 font-extrabold text-sm select-none tabular-nums transition-colors ${
            dHearts > 0
              ? "border-danger/40 text-danger bg-danger/10"
              : "border-bg-softer text-ink-softer bg-bg-soft"
          }`}
          aria-label="心数"
        >
          <Heart className="w-4 h-4" />
          <span>{dHearts}</span>
        </motion.button>

        {/* 连续天数 */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 font-extrabold text-sm select-none tabular-nums ${
            streakActive
              ? "border-warning text-warning bg-warning/10"
              : "border-bg-softer text-ink-softer bg-bg-soft"
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>{dStreak}</span>
        </motion.div>

        {/* XP —— compact 模式隐藏 */}
        {!compact && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 border-secondary/40 text-secondary-dark bg-secondary/10 font-extrabold text-sm select-none tabular-nums"
          >
            <Lightning className="w-4 h-4" />
            <span>{dXp}</span>
          </motion.div>
        )}

        {/* 宝石 */}
        <GemBadge />

        {/* 分割竖线 + 音频开关 —— compact 模式隐藏 */}
        {!compact && (
          <>
            <span aria-hidden className="w-px h-5 bg-bg-softer mx-0.5" />
            <AutoNarrateToggle />
            <MuteToggle />
          </>
        )}
      </div>

      {/* 心数详情弹窗 */}
      <Modal open={showHearts} onClose={() => setShowHearts(false)}>
        <div className="flex flex-col items-center text-center">
          <Mascot mood={heartsFull ? "happy" : "think"} size={88} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">心数</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            {Array.from({ length: MAX_HEARTS }).map((_, i) => {
              const alive = i < dHearts;
              return (
                <Heart
                  key={i}
                  className={`w-8 h-8 ${alive ? "text-danger" : "text-bg-softer"}`}
                />
              );
            })}
          </div>
          {heartsFull ? (
            <p className="text-ink-light mt-4">你的心数已满！</p>
          ) : (
            <div className="mt-4">
              <p className="text-ink-light text-sm">下一颗心还需</p>
              <div className="text-3xl font-extrabold text-danger tabular-nums mt-1">
                {formatMsCountdown(msToNext)}
              </div>
              <p className="text-xs text-ink-softer mt-2">每 5 分钟恢复 1 颗心</p>
            </div>
          )}

          {/* 连胜护盾信息 */}
          {dFreezes > 0 && (
            <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/10 border-2 border-secondary/30 text-secondary-dark">
              <Snowflake className="w-5 h-5" />
              <span className="text-sm font-extrabold">连胜护盾 × {dFreezes}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setShowHearts(false);
            }}
            className="btn-chunky-primary w-full mt-6"
          >
            知道了
          </button>
        </div>
      </Modal>
    </>
  );
}
