"use client";

import { useEffect, useState } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { isSrsGraduated } from "@/lib/srs";
import { MathText } from "@/components/MathText";
import { StatsBar } from "@/components/StatsBar";
import { EmptyState } from "@/components/StateMessages";
import { ArrowLeft, CheckCircle, Rocket } from "@/components/icons";
import { AppShell } from "@/components/layout/AppShell";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 把"YYYY-MM-DD"和今天比较，<= today 即为可复习 */
function isDueToday(dateStr?: string): boolean {
  if (!dateStr) return true;
  return dateStr <= todayKey();
}

function isTomorrow(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr === tomorrowKey();
}

const BOX_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "新错题", color: "text-danger bg-danger/10 border-danger/30" },
  2: { label: "再练练", color: "text-warning bg-warning/10 border-warning/40" },
  3: { label: "快掌握了", color: "text-primary-dark bg-primary/10 border-primary/30" },
};

const GRADUATED_LABEL = {
  label: "已掌握 🎓",
  color: "text-secondary-dark bg-secondary/10 border-secondary/30",
};

export function ReviewClient() {
  const mistakes = useProgressStore(s => s.mistakesBank);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // SRS 排序：先 box 1 → 2 → 3，同 box 内按 lastReviewedAt 旧的优先；毕业条目沉底
  const sortedMistakes = hydrated
    ? [...mistakes].sort((a, b) => {
        const ga = isSrsGraduated(a) ? 1 : 0;
        const gb = isSrsGraduated(b) ? 1 : 0;
        if (ga !== gb) return ga - gb;
        const ba = a.box ?? 1;
        const bb = b.box ?? 1;
        if (ba !== bb) return ba - bb;
        const la = a.lastReviewedAt ?? a.addedAt;
        const lb = b.lastReviewedAt ?? b.addedAt;
        return la.localeCompare(lb);
      })
    : [];

  // 按 lessonId 分组
  const grouped = sortedMistakes.reduce<Record<string, { title: string; items: typeof mistakes }>>((acc, m) => {
    const key = m.lessonId;
    if (!acc[key]) acc[key] = { title: m.lessonTitle || m.lessonId, items: [] };
    acc[key].items.push(m);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped);
  const totalMistakes = hydrated ? mistakes.length : 0;
  // 到期可复习 = nextReviewDate 到期 且 未毕业（与 core getDueSrsEntries 同口径）
  const dueCount = hydrated
    ? mistakes.filter(m => !isSrsGraduated(m) && isDueToday(m.nextReviewDate)).length
    : 0;

  return (
    <AppShell centerMaxWidth={840}>
    <main className="min-h-screen bg-bg-soft lg:bg-transparent relative">
      {/* Header —— 仅移动端：白底 sticky（lg+ HUD 由右栏 RightRail 常驻，不再重复） */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10 lg:hidden">
        <div className="max-w-2xl lg:max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-0 lg:py-2">
          <SoundLink
            href="/"
            aria-label="返回"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0 lg:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
          <div className="flex-1 min-w-0 text-center lg:hidden">
            <div className="text-base font-extrabold text-ink truncate">错题本</div>
          </div>
          <div className="hidden lg:block flex-1" />
          <div className="shrink-0">
            <StatsBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 py-6">
        {hydrated && totalMistakes > 0 && (
          <SrsSummary
            todayCount={dueCount}
            tomorrowCount={mistakes.filter(m => !isSrsGraduated(m) && isTomorrow(m.nextReviewDate)).length}
            laterCount={mistakes.filter(m => !isSrsGraduated(m) && !isDueToday(m.nextReviewDate) && !isTomorrow(m.nextReviewDate)).length}
            graduatedCount={mistakes.filter(m => isSrsGraduated(m)).length}
          />
        )}
        {hydrated && totalMistakes === 0 ? (
          <EmptyState
            mood="cheer"
            title="每一次尝试，都在进步"
            desc="这里会保存需要再练的题。现在去巩固一节小课，答错也没关系。"
            action={
              <SoundLink href="/" hapticIntensity="medium" className="btn-chunky-primary px-8">
                去巩固练习
              </SoundLink>
            }
          />
        ) : (
          <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            {groupEntries.map(([lessonId, group], gi) => (
              <motion.section
                key={lessonId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.04 }}
                className="bg-white rounded-3xl border-2 border-bg-softer overflow-hidden"
                style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
              >
                <div className="px-5 py-3 border-b-2 border-bg-softer bg-bg-soft">
                  <div className="text-xs text-ink-light font-semibold">课程</div>
                  <div className="text-base font-extrabold text-ink">{group.title}</div>
                </div>
                <AnimatePresence>
                  {group.items.map(m => (
                    <MistakeItem
                      key={m.question.id}
                      questionText={m.question.question}
                      correctAnswer={m.question.answer}
                      explanation={m.question.explanation}
                      box={m.box ?? 1}
                      graduated={isSrsGraduated(m)}
                      due={!isSrsGraduated(m) && isDueToday(m.nextReviewDate)}
                    />
                  ))}
                </AnimatePresence>
              </motion.section>
            ))}
          </div>
        )}
      </div>

      {/* 📚 底部悬浮：开始复习（有到期错题时才出现，直达 runner） */}
      {hydrated && dueCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 240, delay: 0.2 }}
          className="fixed bottom-20 lg:bottom-6 left-0 right-0 z-20 px-5 pointer-events-none"
        >
          <div className="max-w-2xl lg:max-w-4xl mx-auto flex justify-center">
            <SoundLink
              href="/review/runner/"
              hapticIntensity="medium"
              className="btn-chunky-danger px-10 pointer-events-auto inline-flex items-center gap-2"
            >
              <Rocket className="w-5 h-5" />
              开始复习（{dueCount} 题）
            </SoundLink>
          </div>
        </motion.div>
      )}
    </main>
    </AppShell>
  );
}

function SrsSummary({
  todayCount,
  tomorrowCount,
  laterCount,
  graduatedCount,
}: {
  todayCount: number;
  tomorrowCount: number;
  laterCount: number;
  graduatedCount: number;
}) {
  const total = todayCount + tomorrowCount + laterCount;
  const todayPct = total > 0 ? Math.round((todayCount / total) * 100) : 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 bg-white rounded-3xl border-2 border-bg-softer p-5"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-extrabold text-ink">今日复习计划</div>
        <div className="text-xs font-extrabold text-ink-light tabular-nums">
          <span className="text-danger">{todayCount}</span>
          <span className="text-ink-softer"> / {total} 待办</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-bg-softer overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${todayPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full bg-danger rounded-full"
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <SrsBucket label="今天" count={todayCount} color="text-danger" bg="bg-danger/10" />
        <SrsBucket label="明天" count={tomorrowCount} color="text-warning" bg="bg-warning/15" />
        <SrsBucket label="之后" count={laterCount} color="text-secondary" bg="bg-secondary/10" />
        <SrsBucket label="已掌握 🎓" count={graduatedCount} color="text-primary" bg="bg-primary/10" />
      </div>
    </motion.section>
  );
}

function SrsBucket({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl ${bg} p-2 text-center`}>
      <div className={`text-xl font-extrabold tabular-nums leading-none ${color}`}>{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold mt-1">
        {label}
      </div>
    </div>
  );
}

interface MistakeItemProps {
  questionText: string;
  correctAnswer: string;
  explanation: string;
  box: 1 | 2 | 3;
  graduated: boolean;
  due: boolean;
}

/**
 * 错题条目 —— 只读展示。
 * 正确答案默认折叠（先自己想一想，点「查看答案」才展开答案 + 解析）；
 * 真实作答请走「开始复习」runner，自评按钮已移除。
 */
function MistakeItem({
  questionText,
  correctAnswer,
  explanation,
  box,
  graduated,
  due,
}: MistakeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const boxStyle = graduated ? GRADUATED_LABEL : (BOX_LABELS[box] ?? BOX_LABELS[1]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
      className={`px-5 py-4 border-b border-bg-softer last:border-b-0 ${due || graduated ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${boxStyle.color}`}
            >
              {boxStyle.label}
            </span>
            {!graduated && !due && (
              <span className="text-[10px] text-ink-softer">今天不用复习</span>
            )}
          </div>
          <div className="text-base font-semibold text-ink leading-relaxed">
            <MathText text={questionText} />
          </div>

          {/* 正确答案默认折叠：先想一想，再看答案 */}
          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setExpanded(x => !x);
            }}
            className="mt-2 text-xs font-semibold text-secondary hover:text-secondary-dark"
          >
            {expanded ? "收起答案" : "查看答案"}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-ink-light">正确答案：</span>
                  <span className="font-extrabold text-primary-dark">
                    <MathText text={correctAnswer} />
                  </span>
                </div>
                <div className="mt-2 rounded-xl bg-bg-soft px-3 py-2 text-sm text-ink leading-relaxed">
                  <MathText text={explanation} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
