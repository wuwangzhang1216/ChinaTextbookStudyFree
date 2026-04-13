"use client";

/**
 * DailyGoalRing — 每日目标圆环
 *
 * SVG stroke-dasharray 进度圆环，XP 在中间 count-up。
 * 达成时播放一次光晕脉冲。可点击弹出目标调整弹窗。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DAILY_GOAL_OPTIONS, useProgressStore } from "@/store/progress";
import { Target, Lightning, Check } from "./icons";
import { Modal } from "./Modal";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface DailyGoalRingProps {
  size?: number;
}

export function DailyGoalRing({ size = 120 }: DailyGoalRingProps) {
  const todayXp = useProgressStore(s => s.todayXp);
  const goal = useProgressStore(s => s.dailyGoal);
  const lastXpDate = useProgressStore(s => s.lastXpDate);
  const setDailyGoal = useProgressStore(s => s.setDailyGoal);

  const [hydrated, setHydrated] = useState(false);
  const [showModal, setShowModal] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 若 lastXpDate 不是今天，则今日 XP 显示为 0
  const today = hydrated ? new Date().toISOString().slice(0, 10).replace(/-/g, "-") : "";
  const displayXp = hydrated ? (lastXpDate === todayStr() ? todayXp : 0) : 0;
  const progress = Math.min(1, displayXp / goal);
  const achieved = progress >= 1;

  const stroke = Math.max(7, Math.round(size * 0.1));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const gradientId = `dgr-grad-${size}-${achieved ? "g" : "p"}`;

  // 内部字号根据 size 动态缩放
  const xpFontPx = Math.round(size * 0.26);
  const labelFontPx = Math.max(9, Math.round(size * 0.11));

  return (
    <>
      <motion.button
        type="button"
        onClick={() => {
          playSfx("tap");
          haptic("light");
          setShowModal(true);
        }}
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        aria-label="每日目标"
      >
        {/* 内圆软底 + 内阴影 */}
        <div
          className="absolute rounded-full"
          style={{
            width: size - stroke * 2 + 4,
            height: size - stroke * 2 + 4,
            background: achieved
              ? "linear-gradient(180deg, #FFFBEB 0%, #FFF6D6 100%)"
              : "linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.04)",
          }}
        />
        <svg width={size} height={size} className="-rotate-90 relative">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              {achieved ? (
                <>
                  <stop offset="0%" stopColor="#FFE066" />
                  <stop offset="100%" stopColor="#FFB300" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#76E32A" />
                  <stop offset="100%" stopColor="#3FA800" />
                </>
              )}
            </linearGradient>
          </defs>
          {/* 背景环 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#EDEDED"
            strokeWidth={stroke}
            fill="none"
          />
          {/* 进度环 */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ type: "spring", damping: 20, stiffness: 80 }}
            style={{
              filter: achieved
                ? "drop-shadow(0 0 8px rgba(255,200,0,0.55))"
                : "drop-shadow(0 1px 2px rgba(88,204,2,0.25))",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <div
            className={`font-extrabold tabular-nums tracking-tight inline-flex items-baseline gap-0.5 ${
              achieved ? "text-warning" : "text-ink"
            }`}
            style={{ fontSize: xpFontPx, lineHeight: 1 }}
          >
            <Lightning
              className={`${achieved ? "text-warning" : "text-primary"}`}
              style={{
                width: xpFontPx * 0.7,
                height: xpFontPx * 0.7,
                marginRight: 1,
              }}
            />
            {displayXp}
          </div>
          <div
            className="font-extrabold text-ink-softer mt-0.5 uppercase tracking-wider"
            style={{ fontSize: labelFontPx }}
          >
            / {goal} XP
          </div>
        </div>
        {achieved && (
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 10 }}
            className="absolute -top-1 -right-1 bg-warning text-white rounded-full w-6 h-6 flex items-center justify-center shadow"
            style={{ boxShadow: "0 3px 0 0 #c89600" }}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </motion.div>
        )}
      </motion.button>

      {/* 目标调整弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="text-center">
          <Target className="w-12 h-12 text-primary mx-auto" />
          <h2 className="text-2xl font-extrabold text-ink mt-2">每日目标</h2>
          <p className="text-ink-light mt-1 mb-5">选择你每天想挣的 XP</p>
          <div className="grid grid-cols-2 gap-3">
            {DAILY_GOAL_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  setDailyGoal(opt);
                }}
                className={`rounded-2xl border-2 p-4 font-extrabold text-lg transition-colors ${
                  goal === opt
                    ? "border-primary bg-primary/10 text-primary-dark"
                    : "border-bg-softer text-ink hover:border-primary"
                }`}
                style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
              >
                {opt} XP
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              playSfx("unlock");
              haptic("medium");
              setShowModal(false);
            }}
            className="btn-chunky-primary w-full mt-6"
          >
            确定
          </button>
        </div>
      </Modal>
    </>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
