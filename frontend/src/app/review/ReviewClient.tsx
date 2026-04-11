"use client";

import { useEffect, useState } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { MathText } from "@/components/MathText";
import { StatsBar } from "@/components/StatsBar";
import { ArrowLeft, Bookmark, Trash, CheckCircle } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ReviewClient() {
  const mistakes = useProgressStore(s => s.mistakesBank);
  const removeMistake = useProgressStore(s => s.removeMistake);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 按 lessonId 分组
  const grouped = hydrated
    ? mistakes.reduce<Record<string, { title: string; items: typeof mistakes }>>((acc, m) => {
        const key = m.lessonId;
        if (!acc[key]) acc[key] = { title: m.lessonTitle || m.lessonId, items: [] };
        acc[key].items.push(m);
        return acc;
      }, {})
    : {};
  const groupEntries = Object.entries(grouped);
  const totalMistakes = hydrated ? mistakes.length : 0;

  return (
    <main className="min-h-screen bg-bg-soft relative">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <SoundLink href="/" className="text-ink-light hover:text-primary shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </SoundLink>
          <div className="flex-1 text-center">
            <div className="text-lg font-extrabold text-ink flex items-center justify-center gap-2">
              <Bookmark className="w-5 h-5 text-primary" /> 错题本
            </div>
            <div className="text-xs text-ink-light">
              {hydrated ? `${totalMistakes} 道错题待复习` : "\u00a0"}
            </div>
          </div>
          <StatsBar />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {hydrated && totalMistakes === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
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
                      onRemove={() => {
                        playSfx("tap");
                        haptic("light");
                        removeMistake(lessonId, m.question.id);
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
  onRemove: () => void;
}

function MistakeItem({
  questionText,
  correctAnswer,
  explanation,
  onRemove,
}: MistakeItemProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-5 py-4 border-b border-bg-softer last:border-b-0"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
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
        </div>
        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("medium");
            onRemove();
          }}
          className="text-ink-softer hover:text-danger shrink-0 p-1"
          aria-label="移除错题"
        >
          <Trash className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
