"use client";

/**
 * SectionCard —— 仿 Duolingo Section 卡片
 *
 * 顶部小蓝色 "A1 • 查看详情" 标签 + 大号 Section N 标题 + 左侧深底气泡（pinyin/标题）+ 右侧 mascot
 * 状态:
 *   - current   : 进度条 + CONTINUE 按钮
 *   - locked    : "JUMP HERE" 链接 + 单元数提示
 *   - completed : crown + REVIEW 按钮
 */

import { motion } from "framer-motion";
import { Mascot } from "@/components/Mascot";
import { Crown, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";

export interface SectionCardProps {
  number: number;
  title: string;
  /** 顶部小标签，比如 "A1 · 第 1 单元" */
  level?: string;
  /** 气泡里的 pinyin 行（小灰字） */
  pinyin?: string;
  /** 气泡里的中文大字 */
  hanzi?: string;
  status: "current" | "locked" | "completed";
  completed: number;
  total: number;
  starCount?: number;
  delay?: number;
  /** 当前态：CONTINUE 点击 */
  onContinue?: () => void;
  /** 锁定态：JUMP HERE 点击（跳到当前 section） */
  onJump?: () => void;
}

export function SectionCard({
  number,
  title,
  level = "A1",
  pinyin,
  hanzi,
  status,
  completed,
  total,
  starCount = 0,
  delay = 0,
  onContinue,
  onJump,
}: SectionCardProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isLocked = status === "locked";
  const isCompleted = status === "completed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", damping: 22, stiffness: 220 }}
      className={cn(
        "relative w-full rounded-3xl border-2 p-5 mb-4 select-none",
        isLocked
          ? "border-bg-softer bg-bg-soft/60"
          : "border-bg-softer bg-white"
      )}
      style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
    >
      {/* 顶部小蓝色级别 */}
      <div className="mb-1">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary">
          {level}
        </span>
      </div>

      {/* 大号 section 标题 */}
      <h2
        className={cn(
          "text-2xl lg:text-3xl font-extrabold tracking-tightest mb-3",
          isLocked ? "text-ink-softer" : "text-ink"
        )}
      >
        第 {number} 单元 · {title}
      </h2>

      {/* 气泡 + Mascot */}
      <div className="flex items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-0 rounded-2xl border-2 border-bg-softer bg-bg-soft px-4 py-3">
          {pinyin && (
            <div className="text-[11px] font-bold text-ink-softer leading-none mb-1">
              {pinyin}
            </div>
          )}
          <div
            className={cn(
              "text-lg font-extrabold leading-tight truncate",
              isLocked ? "text-ink-softer" : "text-ink"
            )}
          >
            {hanzi || title}
          </div>
          {/* 气泡尾巴 */}
          <span
            aria-hidden
            className="absolute -right-2 bottom-4 w-4 h-4 rotate-45 bg-bg-soft border-r-2 border-b-2 border-bg-softer"
          />
        </div>
        <div className="shrink-0">
          <Mascot
            size={86}
            mood={isCompleted ? "happy" : isLocked ? "think" : "wave"}
          />
        </div>
      </div>

      {/* 状态分支 */}
      {status === "current" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="btn-chunky-primary flex-1"
          >
            继续学习
          </button>
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-warning/20 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-warning" />
          </div>
        </div>
      )}

      {status === "locked" && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-extrabold text-ink-softer">
            {total} 节小课
          </div>
          <button
            type="button"
            onClick={onJump}
            className="text-xs font-extrabold uppercase tracking-wider text-secondary hover:underline"
          >
            跳到这里
          </button>
        </div>
      )}

      {status === "completed" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="btn-chunky-ghost flex-1"
          >
            复习
          </button>
          <div className="shrink-0 inline-flex items-center gap-1 px-3 h-12 rounded-2xl bg-warning/15 text-warning font-extrabold">
            <Crown className="w-5 h-5 fill-current" />
            <span className="tabular-nums text-sm">{starCount}</span>
          </div>
        </div>
      )}

      {/* 进度条（current 态额外显示百分比） */}
      {status === "current" && total > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-bg-softer overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut", delay: delay + 0.15 }}
            />
          </div>
          <div className="text-[11px] font-extrabold tabular-nums text-ink-light">
            {completed}/{total} · {pct}%
          </div>
        </div>
      )}
    </motion.div>
  );
}
