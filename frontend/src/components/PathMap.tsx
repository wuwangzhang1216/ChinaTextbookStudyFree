"use client";

/**
 * PathMap — 多邻国式蛇形学习路径
 *
 * 把 lessons 排成上下蛇行的节点，单元之间用一个 banner 分隔。
 * 节点状态：completed / current / locked
 * 每 N 课（CHEST_EVERY_N_LESSONS）后插入一个 chest 节点，点击若可领
 * 则弹出 ChestModal 开箱领取宝石。
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Star, Crown, Chest } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { LessonStartModal } from "./LessonStartModal";
import { ChestModal } from "./ChestModal";
import { computeChestsForBook, rollChestReward, type ChestSlot } from "@/lib/chestLogic";
import { useProgressStore } from "@/store/progress";

export interface PathLessonMeta {
  id: string;
  title: string;
  unitNumber: number;
  unitTitle: string;
  kpIndex: number;
  kpTotal: number;
  questionCount: number;
}

export type LessonStatus = "completed" | "current" | "locked";

interface PathMapProps {
  bookId: string;
  lessons: PathLessonMeta[];
  /** lessonId → status */
  statuses: Record<string, LessonStatus>;
  /** lessonId → 星数 (1-3) */
  stars?: Record<string, number>;
}

type UnitItem =
  | { kind: "lesson"; lesson: PathLessonMeta }
  | { kind: "chest"; slot: ChestSlot };

interface ActiveChestState {
  slot: ChestSlot;
  /** 本次开箱抽到的奖励 */
  gems: number;
}

export function PathMap({ bookId, lessons, statuses, stars = {} }: PathMapProps) {
  const [activeLesson, setActiveLesson] = useState<PathLessonMeta | null>(null);
  const [activeChest, setActiveChest] = useState<ActiveChestState | null>(null);

  const claimedChests = useProgressStore(s => s.claimedChests);
  const perfectedLessons = useProgressStore(s => s.perfectedLessons);
  const addGems = useProgressStore(s => s.addGems);
  const claimChest = useProgressStore(s => s.claimChest);

  // 宝箱插槽：每 N 课一个，稳定 id
  const chestSlots = useMemo(() => computeChestsForBook(bookId, lessons), [bookId, lessons]);
  const chestByAfterLesson = useMemo(() => {
    const m = new Map<string, ChestSlot>();
    for (const c of chestSlots) m.set(c.afterLessonId, c);
    return m;
  }, [chestSlots]);

  // 按单元分组，合并 lesson + chest 为一个 unitItems 列表
  const byUnit = useMemo(() => {
    const map = new Map<number, { title: string; items: UnitItem[] }>();
    for (const l of lessons) {
      if (!map.has(l.unitNumber)) map.set(l.unitNumber, { title: l.unitTitle, items: [] });
      map.get(l.unitNumber)!.items.push({ kind: "lesson", lesson: l });
      const chest = chestByAfterLesson.get(l.id);
      if (chest) {
        map.get(l.unitNumber)!.items.push({ kind: "chest", slot: chest });
      }
    }
    return map;
  }, [lessons, chestByAfterLesson]);

  function handleChestClick(slot: ChestSlot) {
    // 前置课程是否已通关
    const afterStatus = statuses[slot.afterLessonId];
    const unlocked = afterStatus === "completed";
    if (!unlocked) {
      playSfx("tap");
      haptic("light");
      return;
    }
    playSfx("tap");
    haptic("medium");
    // 已领过 → 仍弹窗但按已开箱状态，奖励数从 0 起（视觉上保留纪念）
    if (claimedChests[slot.id]) {
      setActiveChest({ slot, gems: 0 });
      return;
    }
    // 未领 → 当场抽奖 + 写入 store
    const reward = rollChestReward();
    claimChest(slot.id);
    addGems(reward.gems);
    setActiveChest({ slot, gems: reward.gems });
  }

  return (
    <div className="w-full max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      {Array.from(byUnit.entries()).map(([unitNum, group], gi) => {
        // 单元完成度统计：只统计 lesson kind 项
        const unitLessons = group.items
          .filter((it): it is Extract<UnitItem, { kind: "lesson" }> => it.kind === "lesson")
          .map(it => it.lesson);
        const completedCount = unitLessons.filter(l => statuses[l.id] === "completed").length;
        const starCount = unitLessons.reduce((s, l) => s + (stars[l.id] ?? 0), 0);

        return (
        <div key={unitNum} className="mb-6">
          <UnitBanner
            number={unitNum}
            title={group.title}
            delay={gi * 0.05}
            completed={completedCount}
            total={unitLessons.length}
            starCount={starCount}
          />
          <div className="mt-5 space-y-1">
            {group.items.map((item, idx) => {
              const offset = snakeOffset(idx);
              if (item.kind === "lesson") {
                const status = statuses[item.lesson.id] || "locked";
                return (
                  <PathNode
                    key={item.lesson.id}
                    lesson={item.lesson}
                    status={status}
                    stars={stars[item.lesson.id] ?? 0}
                    perfected={!!perfectedLessons[item.lesson.id]}
                    offsetX={offset}
                    breatheDelay={idx * 0.12}
                    onSelect={() => setActiveLesson(item.lesson)}
                  />
                );
              }
              // 宝箱节点
              const after = statuses[item.slot.afterLessonId];
              const unlocked = after === "completed";
              const claimed = !!claimedChests[item.slot.id];
              return (
                <ChestNode
                  key={item.slot.id}
                  unlocked={unlocked}
                  claimed={claimed}
                  offsetX={offset}
                  breatheDelay={idx * 0.12}
                  onSelect={() => handleChestClick(item.slot)}
                />
              );
            })}
          </div>
        </div>
        );
      })}

      {activeLesson && (
        <LessonStartModal
          open={!!activeLesson}
          onClose={() => setActiveLesson(null)}
          bookId={bookId}
          lessonId={activeLesson.id}
          title={activeLesson.title}
          questionCount={activeLesson.questionCount}
          unitNumber={activeLesson.unitNumber}
          kpIndex={activeLesson.kpIndex}
          kpTotal={activeLesson.kpTotal}
        />
      )}

      {activeChest && (
        <ChestModal
          open={!!activeChest}
          gems={activeChest.gems}
          onClose={() => setActiveChest(null)}
        />
      )}
    </div>
  );
}

/** 蛇形偏移：用正弦让节点左右摆动 */
function snakeOffset(index: number): number {
  const t = (index / 4) * 2 * Math.PI;
  return Math.round(Math.sin(t) * 80);
}

function UnitBanner({
  number,
  title,
  delay,
  completed,
  total,
  starCount,
}: {
  number: number;
  title: string;
  delay: number;
  completed: number;
  total: number;
  starCount: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <motion.div
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay, type: "spring", damping: 18 }}
      className="bg-primary text-white rounded-2xl px-4 py-3 shadow-chunky-primary flex items-center gap-3"
    >
      <div className="bg-white/20 rounded-lg w-8 h-8 flex items-center justify-center font-extrabold text-sm shrink-0 tabular-nums">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-80 leading-none">
          第 {number} 单元
        </div>
        <div className="text-base font-extrabold leading-tight truncate mt-0.5">
          {title}
        </div>
        {/* 完成度进度条 + 数字 */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <motion.div
              className="h-full bg-white rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${pct}%` }}
              transition={{ delay: delay + 0.15, duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <div className="text-[11px] font-extrabold tabular-nums opacity-90 shrink-0 inline-flex items-center gap-1">
            <span>{completed}/{total}</span>
            {starCount > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-1">
                <span className="opacity-60">·</span>
                <Star className="w-3 h-3 fill-current" />
                <span>{starCount}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface PathNodeProps {
  lesson: PathLessonMeta;
  status: LessonStatus;
  stars: number;
  /** 是否曾经首次完美通关（绑 progress.perfectedLessons），决定是否显示 👑 */
  perfected: boolean;
  offsetX: number;
  breatheDelay: number;
  onSelect: () => void;
}

function PathNode({ lesson, status, stars, perfected, offsetX, breatheDelay, onSelect }: PathNodeProps) {
  const isLocked = status === "locked";
  const isCurrent = status === "current";
  const isCompleted = status === "completed";

  const node = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center relative"
      style={{ transform: `translateX(${offsetX}px)` }}
    >
      {/* 首次完美通关的王冠（旋转摇摆） */}
      {perfected && (
        <motion.div
          className="absolute -top-7 z-10 select-none text-gold"
          initial={{ scale: 0, rotate: -30 }}
          animate={{
            scale: 1,
            rotate: [-3, 3, -3],
            y: [0, -2, 0],
          }}
          transition={{
            scale: { type: "spring", damping: 10, stiffness: 220 },
            rotate: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
            y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
          }}
          aria-label="首次完美通关"
          style={{ filter: "drop-shadow(0 2px 4px rgba(255,200,0,0.6))" }}
        >
          <Crown className="w-6 h-6 fill-current" />
        </motion.div>
      )}

      <motion.div
        animate={!isLocked ? { y: [0, -3, 0] } : { y: 0 }}
        transition={
          !isLocked
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={!isLocked ? { scale: 1.08, y: -4 } : undefined}
        whileTap={!isLocked ? { scale: 0.95 } : undefined}
        className={cn(
          "relative w-20 h-20 rounded-full flex items-center justify-center",
          "transition-colors duration-200",
          isCurrent && "path-node-current",
          isLocked && "bg-bg-softer text-ink-softer",
          isCurrent && "bg-primary text-white",
          isCompleted && "bg-gold text-white",
        )}
        style={{
          boxShadow: isLocked
            ? "0 4px 0 0 #d5d5d5"
            : isCompleted
              ? "0 5px 0 0 #c89600"
              : "0 5px 0 0 #58a700",
        }}
      >
        {isLocked && <Lock className="w-7 h-7" />}
        {isCurrent && <Star className="w-9 h-9 fill-white" />}
        {isCompleted && <Crown className="w-9 h-9 fill-white" />}

        {/* 星数小角标 */}
        {isCompleted && stars > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      <div
        className={cn(
          "mt-1.5 text-center text-[13px] font-bold leading-tight max-w-[140px] tracking-tight",
          isLocked ? "text-ink-softer" : "text-ink",
        )}
      >
        {lesson.title}
      </div>
    </motion.div>
  );

  if (isLocked) {
    return <div className="cursor-not-allowed">{node}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        onSelect();
      }}
      className="block w-full"
    >
      {node}
    </button>
  );
}

interface ChestNodeProps {
  unlocked: boolean;
  claimed: boolean;
  offsetX: number;
  breatheDelay: number;
  onSelect: () => void;
}

function ChestNode({ unlocked, claimed, offsetX, breatheDelay, onSelect }: ChestNodeProps) {
  const node = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
      style={{ transform: `translateX(${offsetX}px)` }}
    >
      <motion.div
        animate={unlocked && !claimed ? { y: [0, -4, 0] } : { y: 0 }}
        transition={
          unlocked && !claimed
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={unlocked ? { scale: 1.08, y: -4 } : undefined}
        whileTap={unlocked ? { scale: 0.95 } : undefined}
        className={cn(
          "relative w-20 h-20 rounded-full flex items-center justify-center",
          !unlocked && "bg-bg-softer text-ink-softer",
          unlocked && !claimed && "bg-warning text-white",
          claimed && "bg-bg-soft text-warning/60",
        )}
        style={{
          boxShadow: !unlocked
            ? "0 4px 0 0 #d5d5d5"
            : claimed
              ? "0 4px 0 0 #d5d5d5"
              : "0 5px 0 0 #c89600",
        }}
      >
        {!unlocked ? (
          <Lock className="w-7 h-7" />
        ) : (
          <Chest className="w-9 h-9" />
        )}

        {/* 未领取时的脉冲光圈 */}
        {unlocked && !claimed && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 0 6px rgba(255, 200, 0, 0.35)" }}
          />
        )}
      </motion.div>

      <div
        className={cn(
          "mt-1.5 text-center text-[13px] font-bold leading-tight max-w-[140px] tracking-tight",
          unlocked && !claimed ? "text-warning" : "text-ink-softer",
        )}
      >
        {claimed ? "已领取" : unlocked ? "宝箱！" : "宝箱"}
      </div>
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={unlocked ? "block w-full" : "block w-full cursor-not-allowed"}
      aria-label={claimed ? "已领取的宝箱" : unlocked ? "打开宝箱" : "未解锁宝箱"}
    >
      {node}
    </button>
  );
}
