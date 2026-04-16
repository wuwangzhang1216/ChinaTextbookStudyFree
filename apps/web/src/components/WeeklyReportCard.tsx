"use client";

/**
 * WeeklyReportCard —— 本周学习报告卡片
 *
 * 数据来源：useProgressStore.xpHistory + lessonHistory（最近 60 天滚动）
 * 显示：
 *   - 本周（周一→周日）每日 XP 柱状图
 *   - 总 XP / 完成课时 / 学习天数
 *   - 与上周对比的小变化
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Calendar, TrendingUp, Lightning } from "@/components/icons";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 取本周一作为起点（getDay 中 0=周日，1=周一） */
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - offset);
  return out;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export function WeeklyReportCard() {
  const xpHistory = useProgressStore(s => s.xpHistory);
  const lessonHistory = useProgressStore(s => s.lessonHistory);

  const data = useMemo(() => {
    const now = new Date();
    const thisMonday = startOfWeek(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const thisWeek: Array<{ date: string; label: string; xp: number; isToday: boolean }> = [];
    const todayKey = ymd(now);
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisMonday);
      d.setDate(d.getDate() + i);
      const key = ymd(d);
      thisWeek.push({
        date: key,
        label: WEEKDAY_LABELS[i],
        xp: xpHistory[key] ?? 0,
        isToday: key === todayKey,
      });
    }
    let lastWeekXp = 0;
    let lastWeekLessons = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastMonday);
      d.setDate(d.getDate() + i);
      const key = ymd(d);
      lastWeekXp += xpHistory[key] ?? 0;
      lastWeekLessons += lessonHistory[key] ?? 0;
    }

    const totalXp = thisWeek.reduce((sum, x) => sum + x.xp, 0);
    const totalLessons = thisWeek.reduce(
      (sum, x) => sum + (lessonHistory[x.date] ?? 0),
      0,
    );
    const activeDays = thisWeek.filter(x => x.xp > 0).length;
    const maxXp = Math.max(10, ...thisWeek.map(x => x.xp));
    const xpDelta = totalXp - lastWeekXp;
    const lessonDelta = totalLessons - lastWeekLessons;

    return {
      thisWeek,
      totalXp,
      totalLessons,
      activeDays,
      maxXp,
      xpDelta,
      lessonDelta,
    };
  }, [xpHistory, lessonHistory]);

  return (
    <section
      className="bg-white rounded-3xl border-2 border-bg-softer p-5"
      style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
      aria-label="本周学习报告"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-secondary" />
          <div className="text-base font-extrabold text-ink">本周报告</div>
        </div>
        {data.xpDelta !== 0 && (
          <div
            className={`text-xs font-extrabold inline-flex items-center gap-1 ${
              data.xpDelta > 0 ? "text-primary" : "text-ink-softer"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {data.xpDelta > 0 ? "+" : ""}
            {data.xpDelta} XP
          </div>
        )}
      </div>

      {/* Stats 三连 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <MiniStat label="本周 XP" value={data.totalXp} />
        <MiniStat label="完成课时" value={data.totalLessons} />
        <MiniStat label="学习天数" value={`${data.activeDays}/7`} />
      </div>

      {/* 柱状图 */}
      <div className="flex items-end justify-between gap-1.5 h-24 mb-1">
        {data.thisWeek.map((d, idx) => {
          const pct = (d.xp / data.maxXp) * 100;
          return (
            <motion.div
              key={d.date}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "100%", opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="flex-1 flex flex-col items-center justify-end"
            >
              <div
                className={`w-full rounded-t-md transition-all ${
                  d.isToday ? "bg-primary" : d.xp > 0 ? "bg-secondary" : "bg-bg-softer"
                }`}
                style={{
                  height: `${Math.max(6, pct)}%`,
                  minHeight: d.xp > 0 ? "8px" : "4px",
                }}
                title={`${d.label}：${d.xp} XP`}
              />
            </motion.div>
          );
        })}
      </div>
      <div className="flex items-end justify-between gap-1.5">
        {data.thisWeek.map(d => (
          <div
            key={d.date}
            className={`flex-1 text-center text-[10px] font-extrabold ${
              d.isToday ? "text-primary" : "text-ink-softer"
            }`}
          >
            {d.label}
          </div>
        ))}
      </div>

      {data.totalXp === 0 && (
        <p className="mt-4 text-center text-xs text-ink-softer inline-flex items-center justify-center gap-1 w-full">
          <Lightning className="w-3 h-3" />
          本周还没有学习记录，去开始一节课吧
        </p>
      )}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-bg-soft rounded-xl p-2.5 text-center">
      <div className="text-xl font-extrabold text-ink tabular-nums leading-none">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-ink-softer font-extrabold mt-1">
        {label}
      </div>
    </div>
  );
}
