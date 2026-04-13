"use client";

import { useEffect, useState } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { MathText } from "@/components/MathText";
import { StatsBar } from "@/components/StatsBar";
import { ArrowLeft, Bookmark, Check, XCircle, CheckCircle } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

/** 把"YYYY-MM-DD"和今天比较，<= today 即为可复习 */
function isDueToday(dateStr?: string): boolean {
  if (!dateStr) return true;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dateStr <= today;
}

const BOX_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "新错题", color: "text-danger bg-danger/10 border-danger/30" },
  2: { label: "再练练", color: "text-warning bg-warning/10 border-warning/40" },
  3: { label: "快掌握了", color: "text-primary-dark bg-primary/10 border-primary/30" },
};

export function ReviewClient() {
  const mistakes = useProgressStore(s => s.mistakesBank);
  const reviewMistake = useProgressStore(s => s.reviewMistake);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // SRS 排序：先 box 1 → 2 → 3，同 box 内按 lastReviewedAt 旧的优先
  const sortedMistakes = hydrated
    ? [...mistakes].sort((a, b) => {
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
  const dueCount = hydrated
    ? mistakes.filter(m => isDueToday(m.nextReviewDate)).length
    : 0;

  return (
    <main className="min-h-screen bg-bg-soft relative">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-2xl lg:max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <SoundLink
            href="/"
            aria-label="返回"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-base lg:text-lg font-extrabold text-ink flex items-center justify-center gap-1.5 truncate">
              <Bookmark className="w-4 h-4 lg:w-5 lg:h-5 text-primary shrink-0" />
              <span>错题本</span>
            </div>
            <div className="text-[11px] lg:text-xs text-ink-light truncate">
              {hydrated
                ? `共 ${totalMistakes} 道 · 今天该复习 ${dueCount} 道`
                : "\u00a0"}
            </div>
          </div>
          <div className="lg:hidden shrink-0">
            <StatsBar compact />
          </div>
          <div className="hidden lg:flex shrink-0">
            <StatsBar />
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 py-6">
        {hydrated && totalMistakes === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            {groupEntries.map(([lessonId, group], gi) => (
              <motion.section
                key={lessonId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.04 }}
                className="bg-white rounded-3xl border-2 border-bg-softer overflow-hidden"
                style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
              >
                <div className="px-5 py-3 border-b-2 border-bg-softer bg-bg-soft">
                  <div className="text-xs text-ink-light font-semibold">课程</div>
                  <div className="text-base font-extrabold text-ink">{group.title}</div>
                </div>
                <AnimatePresence>
                  {group.items.map(m => (
                    <MistakeItem
                      key={m.question.id}
                      lessonId={lessonId}
                      questionId={m.question.id}
                      questionText={m.question.question}
                      correctAnswer={m.question.answer}
                      explanation={m.question.explanation}
                      box={m.box ?? 1}
                      due={isDueToday(m.nextReviewDate)}
                      onMarkCorrect={() => {
                        playSfx("correct");
                        haptic("success");
                        reviewMistake(lessonId, m.question.id, true);
                      }}
                      onMarkWrong={() => {
                        playSfx("wrong");
                        haptic("medium");
                        reviewMistake(lessonId, m.question.id, false);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </motion.section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Mascot mood="cheer" size={140} />
      <h2 className="text-2xl font-extrabold text-ink mt-4">还没有错题！</h2>
      <p className="text-ink-light mt-2">继续加油，保持零错误～</p>
      <SoundLink href="/" hapticIntensity="medium" className="btn-chunky-primary mt-6 px-8">
        去学习
      </SoundLink>
    </div>
  );
}

interface MistakeItemProps {
  lessonId: string;
  questionId: number;
  questionText: string;
  correctAnswer: string;
  explanation: string;
  box: 1 | 2 | 3;
  due: boolean;
  onMarkCorrect: () => void;
  onMarkWrong: () => void;
}

function MistakeItem({
  questionText,
  correctAnswer,
  explanation,
  box,
  due,
  onMarkCorrect,
  onMarkWrong,
}: MistakeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const boxStyle = BOX_LABELS[box] ?? BOX_LABELS[1];
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
      className={`px-5 py-4 border-b border-bg-softer last:border-b-0 ${due ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${boxStyle.color}`}
            >
              {boxStyle.label}
            </span>
            {!due && (
              <span className="text-[10px] text-ink-softer">今天不用复习</span>
            )}
          </div>
          <div className="text-base font-semibold text-ink leading-relaxed">
            <MathText text={questionText} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-primary shrink-0" />
            <span className="text-ink-light">正确答案：</span>
            <span className="font-extrabold text-primary-dark">
              <MathText text={correctAnswer} />
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setExpanded(x => !x);
            }}
            className="mt-2 text-xs font-semibold text-secondary hover:text-secondary-dark"
          >
            {expanded ? "收起解析" : "查看解析"}
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
                <div className="mt-2 rounded-xl bg-bg-soft px-3 py-2 text-sm text-ink leading-relaxed">
                  <MathText text={explanation} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SRS 复习按钮：我会了 / 还要练 */}
          {due && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onMarkCorrect}
                className="btn-chunky-sm flex-1 bg-primary"
                style={{ boxShadow: "0 3px 0 0 #58A700" }}
              >
                <Check className="w-3.5 h-3.5" /> 我会了
              </button>
              <button
                type="button"
                onClick={onMarkWrong}
                className="btn-chunky-sm flex-1 bg-danger"
                style={{ boxShadow: "0 3px 0 0 #EA2B2B" }}
              >
                <XCircle className="w-3.5 h-3.5" /> 还要练
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
