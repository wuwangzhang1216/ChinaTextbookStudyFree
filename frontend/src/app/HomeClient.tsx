"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { Mascot } from "@/components/Mascot";
import { StatsBar } from "@/components/StatsBar";
import { DailyGoalRing } from "@/components/DailyGoalRing";
import {
  Apple,
  Sprout,
  Tree,
  Butterfly,
  Rocket,
  Trophy,
  User,
  Bookmark,
  type IconProps,
} from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const GRADE_ICON: Record<number, ComponentType<IconProps>> = {
  1: Apple,
  2: Sprout,
  3: Tree,
  4: Butterfly,
  5: Rocket,
  6: Trophy,
};
const GRADE_NAME = ["", "一", "二", "三", "四", "五", "六"];

interface HomeClientProps {
  grades: number[];
  byGrade: Record<number, number>;
  totalBooks: number;
  totalLessons: number;
  totalQuestions: number;
}

export function HomeClient({ grades, byGrade, totalBooks, totalLessons, totalQuestions }: HomeClientProps) {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 relative">
      {/* 顶部状态条 */}
      <div className="absolute top-4 right-4">
        <StatsBar />
      </div>

      {/* Header */}
      <motion.div
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 220 }}
        className="flex items-center gap-4 mb-2"
      >
        <Mascot mood="wave" size={96} />
        <div className="text-left">
          <h1 className="text-4xl font-extrabold text-primary leading-tight">中国小学免费学</h1>
          <p className="text-ink-light mt-1">免费 · 有趣 · 有内容 · 数学</p>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm text-ink-softer mt-2 mb-8"
      >
        共 {totalBooks} 本教材 · {totalLessons} 节小课 · {totalQuestions} 道题
      </motion.p>

      {/* 每日目标 + 快捷入口 */}
      <div className="w-full max-w-3xl flex items-center justify-center gap-4 mb-10">
        <Link
          href="/profile"
          onClick={() => {
            playSfx("tap");
            haptic("light");
          }}
          className="group flex flex-col items-center gap-1 w-24 py-3 rounded-3xl bg-white border-2 border-bg-softer hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <User className="w-7 h-7 text-ink-light group-hover:text-primary transition-colors" />
          <span className="text-xs font-extrabold text-ink group-hover:text-primary">
            我的
          </span>
        </Link>

        <DailyGoalRing size={120} />

        <Link
          href="/review"
          onClick={() => {
            playSfx("tap");
            haptic("light");
          }}
          className="group flex flex-col items-center gap-1 w-24 py-3 rounded-3xl bg-white border-2 border-bg-softer hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <Bookmark className="w-7 h-7 text-ink-light group-hover:text-primary transition-colors" />
          <span className="text-xs font-extrabold text-ink group-hover:text-primary">
            错题本
          </span>
        </Link>
      </div>

      {/* 年级网格 */}
      <div className="w-full max-w-3xl grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ perspective: 1000 }}>
        {grades.map((g, i) => {
          const Icon = GRADE_ICON[g];
          return (
            <motion.div
              key={g}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, type: "spring", damping: 18 }}
              whileHover={{
                y: -6,
                rotateX: 5,
                rotateY: -5,
                scale: 1.03,
                transition: { type: "spring", damping: 14, stiffness: 260 },
              }}
              whileTap={{ scale: 0.97 }}
            >
              <Link
                href={`/grade/${g}/`}
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                }}
                className="group block bg-white rounded-3xl border-2 border-bg-softer p-6 hover:border-primary transition-colors"
                style={{ boxShadow: "0 4px 0 0 #e5e5e5", transformStyle: "preserve-3d" }}
              >
                <Icon className="w-12 h-12 mb-3 text-ink-light group-hover:text-primary transition-colors" />
                <div className="text-xl font-extrabold text-ink group-hover:text-primary">
                  {GRADE_NAME[g]}年级
                </div>
                <div className="text-sm text-ink-light mt-1">{byGrade[g]} 本教材</div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-ink-softer text-center max-w-md">
        本平台所有题目和讲解均由 AI 基于人教版小学数学教材生成，免费开源。
      </p>
    </main>
  );
}
