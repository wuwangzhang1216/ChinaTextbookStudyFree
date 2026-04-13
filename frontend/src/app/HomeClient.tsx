"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { Mascot } from "@/components/Mascot";
import { StatsBar } from "@/components/StatsBar";
import { DailyGoalRing } from "@/components/DailyGoalRing";
import { ContinueLearningCard } from "@/components/ContinueLearningCard";
import {
  Apple,
  Sprout,
  Tree,
  Butterfly,
  Rocket,
  Trophy,
  User,
  Bookmark,
  Gem,
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
    <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-8 relative">
      {/* === 桌面端顶栏 StatsBar（独立一行，避免与 hero DailyGoalRing 重叠） === */}
      <div className="hidden lg:flex w-full max-w-6xl justify-end mb-4">
        <StatsBar />
      </div>

      {/* === 移动端顶栏：紧凑 StatsBar 单独一行右对齐 === */}
      <div className="lg:hidden w-full max-w-md flex justify-end mb-3">
        <StatsBar compact />
      </div>

      {/* === 移动端 Hero（lg 隐藏）—— mascot + 标题 + 每日目标环 同一行 === */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 18, stiffness: 220 }}
        className="flex lg:hidden items-center gap-3 w-full max-w-md mb-5"
      >
        <Mascot mood="wave" size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold text-primary leading-tight truncate">
            小猫头鹰课堂
          </h1>
          <p className="text-[11px] text-ink-light mt-1 leading-tight">
            {totalBooks} 本教材 · {totalLessons} 节课 · {totalQuestions} 道题
          </p>
        </div>
        <div className="shrink-0">
          <DailyGoalRing size={84} />
        </div>
      </motion.div>

      {/* === 桌面 Hero（lg+ 才显示） === */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
        className="hidden lg:flex w-full max-w-6xl items-center gap-10 mb-10 mt-4"
      >
        <Mascot mood="wave" size={160} />
        <div className="flex-1 text-left">
          <h1 className="text-6xl font-extrabold text-primary leading-tight tracking-tight">
            小猫头鹰课堂
          </h1>
          <p className="text-xl text-ink-light mt-3 font-semibold">
            全科免费，人人可学
          </p>
          <p className="text-sm text-ink-softer mt-3">
            共 {totalBooks} 本教材 · {totalLessons} 节小课 · {totalQuestions} 道题
          </p>
        </div>
        <DailyGoalRing size={156} />
      </motion.div>

      {/* 继续学习：仅在有未完成会话时渲染 */}
      <ContinueLearningCard />

{/* === 桌面快捷入口（横向大按钮排，lg+ 才显示） === */}
      <div className="hidden lg:grid w-full max-w-6xl grid-cols-3 gap-5 mb-10">
        <Link
          href="/profile"
          onClick={() => {
            playSfx("tap");
            haptic("light");
          }}
          className="group flex items-center gap-4 px-6 py-5 rounded-3xl bg-white border-2 border-bg-softer hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div className="text-left">
            <div className="text-lg font-extrabold text-ink group-hover:text-primary">我的</div>
            <div className="text-xs text-ink-light mt-0.5">个人资料 · 成就</div>
          </div>
        </Link>

        <Link
          href="/review"
          onClick={() => {
            playSfx("tap");
            haptic("light");
          }}
          className="group flex items-center gap-4 px-6 py-5 rounded-3xl bg-white border-2 border-bg-softer hover:border-primary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center group-hover:bg-warning/25 transition-colors">
            <Bookmark className="w-7 h-7 text-warning" />
          </div>
          <div className="text-left">
            <div className="text-lg font-extrabold text-ink group-hover:text-warning">错题本</div>
            <div className="text-xs text-ink-light mt-0.5">复习曾经做错的题</div>
          </div>
        </Link>

        <Link
          href="/shop"
          onClick={() => {
            playSfx("tap");
            haptic("light");
          }}
          className="group flex items-center gap-4 px-6 py-5 rounded-3xl bg-white border-2 border-bg-softer hover:border-purple-400 transition-colors"
          style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
        >
          <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
            <Gem className="w-7 h-7 text-purple-500" />
          </div>
          <div className="text-left">
            <div className="text-lg font-extrabold text-ink group-hover:text-purple-700">商店</div>
            <div className="text-xs text-ink-light mt-0.5">皮肤 · 主题 · 背景</div>
          </div>
        </Link>
      </div>

      {/* 年级网格 */}
      <div className="w-full max-w-3xl lg:max-w-6xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 lg:gap-6" style={{ perspective: 1000 }}>
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
                className="group block bg-white rounded-3xl border-2 border-bg-softer p-6 lg:p-8 hover:border-primary transition-colors"
                style={{ boxShadow: "0 4px 0 0 #e5e5e5", transformStyle: "preserve-3d" }}
              >
                <Icon className="w-12 h-12 lg:w-16 lg:h-16 mb-3 lg:mb-4 text-ink-light group-hover:text-primary transition-colors" />
                <div className="text-xl lg:text-2xl font-extrabold text-ink group-hover:text-primary">
                  {GRADE_NAME[g]}年级
                </div>
                <div className="text-sm lg:text-base text-ink-light mt-1">{byGrade[g]} 本教材</div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-ink-softer text-center max-w-md leading-relaxed">
        我们相信每个孩子都值得快乐地学习，不该因为经济条件而失去机会。<br/>
        小猫头鹰课堂永久免费、开源，愿每一位小学生都能无负担地成长。
      </p>
    </main>
  );
}
