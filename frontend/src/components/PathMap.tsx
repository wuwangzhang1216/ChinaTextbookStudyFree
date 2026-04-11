"use client";

/**
 * PathMap — 多邻国式蛇形学习路径
 *
 * 把 lessons 排成上下蛇行的节点，单元之间用一个 banner 分隔。
 * 节点状态：completed / current / locked
 * 点击可点节点时弹出课程摘要卡，而非直接跳转。
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Star, Crown } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { LessonStartModal } from "./LessonStartModal";

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

export function PathMap({ bookId, lessons, statuses, stars = {} }: PathMapProps) {
  const [activeLesson, setActiveLesson] = useState<PathLessonMeta | null>(null);

  // 按单元分组
  const byUnit = new Map<number, { title: string; lessons: PathLessonMeta[] }>();
  for (const l of lessons) {
    if (!byUnit.has(l.unitNumber)) byUnit.set(l.unitNumber, { title: l.unitTitle, lessons: [] });
    byUnit.get(l.unitNumber)!.lessons.push(l);
  }

  return (
    <div className="w-full max-w-md mx-auto py-6">
      {Array.from(byUnit.entries()).map(([unitNum, group], gi) => (
        <div key={unitNum} className="mb-8">
          <UnitBanner number={unitNum} title={group.title} delay={gi * 0.05} />
          <div className="mt-6 space-y-2">
            {group.lessons.map((lesson, idx) => {
              const status = statuses[lesson.id] || "locked";
              const offset = snakeOffset(idx);
              return (
                <PathNode
                  key={lesson.id}
                  lesson={lesson}
                  status={status}
                  stars={stars[lesson.id] ?? 0}
                  offsetX={offset}
                  breatheDelay={idx * 0.12}
                  onSelect={() => setActiveLesson(lesson)}
                />
              );
            })}
          </div>
        </div>
      ))}

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
    </div>
  );
}

/** 蛇形偏移：用正弦让节点左右摆动 */
function snakeOffset(index: number): number {
  const t = (index / 4) * 2 * Math.PI;
  return Math.round(Math.sin(t) * 80);
}

function UnitBanner({ number, title, delay }: { number: number; title: string; delay: number }) {
  return (
    <motion.div
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay, type: "spring", damping: 18 }}
      className="bg-primary text-white rounded-2xl px-5 py-4 shadow-chunky-primary flex items-center gap-3"
    >
      <div className="bg-white/20 rounded-xl w-10 h-10 flex items-center justify-center font-extrabold text-xl">
        {number}
      </div>
      <div>
        <div className="text-xs opacity-80">第 {number} 单元</div>
        <div className="text-lg font-extrabold leading-tight">{title}</div>
      </div>
    </motion.div>
  );
}

interface PathNodeProps {
  lesson: PathLessonMeta;
  status: LessonStatus;
  stars: number;
  offsetX: number;
  breatheDelay: number;
  onSelect: () => void;
}

function PathNode({ lesson, status, stars, offsetX, breatheDelay, onSelect }: PathNodeProps) {
  const isLocked = status === "locked";
  const isCurrent = status === "current";
  const isCompleted = status === "completed";

  const node = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
      style={{ transform: `translateX(${offsetX}px)` }}
    >
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
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow text-xs font-extrabold text-gold">
            {"★".repeat(stars)}
          </div>
        )}
      </motion.div>

      <div
        className={cn(
          "mt-2 text-center text-sm font-semibold max-w-[140px]",
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
