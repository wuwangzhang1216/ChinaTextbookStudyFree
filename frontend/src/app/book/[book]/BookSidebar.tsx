"use client";

/**
 * BookSidebar —— 教材详情页桌面端右侧侧边栏（lg+ 才显示）
 *
 * 内容：
 *   1. 课程进度卡：已完成 / 总数 + ★ 累计 + 进度条
 *   2. 课文听读入口（如果 hasPassages）
 *   3. 返回学科年级
 *
 * 移动端不渲染，由 page.tsx 用 hidden lg:block 控制。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SoundLink } from "@/components/SoundLink";
import { useProgressStore } from "@/store/progress";
import {
  ArrowLeft,
  BookOpen,
  Crown,
  Star,
} from "@/components/icons";

interface BookSidebarProps {
  bookId: string;
  grade: number;
  textbookName: string;
  unitsCount: number;
  lessonIds: string[];
  hasPassages: boolean;
}

export function BookSidebar({
  bookId,
  grade,
  textbookName,
  unitsCount,
  lessonIds,
  hasPassages,
}: BookSidebarProps) {
  const completedLessons = useProgressStore(s => s.completedLessons);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const total = lessonIds.length;
  const completedCount = hydrated
    ? lessonIds.filter(id => completedLessons[id]).length
    : 0;
  const totalStars = hydrated
    ? lessonIds.reduce(
        (acc, id) => acc + (completedLessons[id]?.stars ?? 0),
        0,
      )
    : 0;
  const totalPossibleStars = total * 3;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <aside className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
      {/* 课程进度卡 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 20 }}
        className="bg-white rounded-3xl border-2 border-bg-softer p-5"
        style={{ boxShadow: "0 5px 0 0 #e5e5e5" }}
      >
        <div className="text-xs font-extrabold text-ink-softer uppercase tracking-wider mb-2">
          学习进度
        </div>
        <div className="text-2xl font-extrabold text-ink leading-tight truncate">
          {textbookName}
        </div>
        <div className="text-xs text-ink-light mt-1">
          {unitsCount} 单元 · 共 {total} 节小课
        </div>

        {/* 进度条 */}
        <div className="mt-4 h-3 rounded-full bg-bg-softer overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
            style={{ boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35)" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs font-bold text-ink-light">
          <span className="tabular-nums">
            {completedCount} / {total} 已完成
          </span>
          <span className="tabular-nums text-primary-dark">{progressPct}%</span>
        </div>

        {/* 星星统计 */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-gold/10 border-2 border-gold/30 px-3 py-2">
            <Star className="w-5 h-5 fill-current text-gold shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold">
                获得星星
              </div>
              <div className="text-base font-extrabold text-ink tabular-nums leading-none mt-0.5">
                {totalStars}
                <span className="text-[10px] text-ink-softer ml-0.5">
                  /{totalPossibleStars}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-primary/10 border-2 border-primary/30 px-3 py-2">
            <Crown className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-ink-light font-semibold">
                完成课程
              </div>
              <div className="text-base font-extrabold text-ink tabular-nums leading-none mt-0.5">
                {completedCount}
                <span className="text-[10px] text-ink-softer ml-0.5">
                  /{total}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 课文听读 */}
      {hasPassages && (
        <SoundLink
          href={`/reading/${bookId}/`}
          hapticIntensity="medium"
          className="group flex items-center gap-3 bg-white rounded-3xl border-2 border-bg-softer p-4 hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-ink">课文听读</div>
            <div className="text-xs text-ink-light mt-0.5">
              范读 · 跟读练习
            </div>
          </div>
          <div className="shrink-0 text-xl text-ink-softer">›</div>
        </SoundLink>
      )}

      {/* 返回 */}
      <SoundLink
        href={`/grade/${grade}/`}
        className="flex items-center gap-2 px-4 py-3 text-sm font-extrabold text-ink-light hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回 {grade} 年级
      </SoundLink>
    </aside>
  );
}
