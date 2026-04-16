"use client";

/**
 * GuideClient — 单元知识手册 slide carousel
 *
 * 对标 Duolingo "这是什么?" 知识介绍页：
 *   - 一屏一个知识点，大图 + 标题 + TTS 朗读 + 通俗描述
 *   - 顶部 X 关闭 + 进度圆点 + 计数
 *   - 底部"下一步 →" 推进；最后一张显示"完成"
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Close } from "@/components/icons";
import { TTSButton } from "@/components/TTSButton";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { Book } from "@/types";
import type { KnowledgeSummary, Unit } from "@cstf/core";

interface GuideClientProps {
  book: Book;
  unit: Unit;
  summaries: KnowledgeSummary[];
}

export function GuideClient({ book, unit, summaries }: GuideClientProps) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const total = summaries.length;
  const current = summaries[idx];
  const isLast = idx === total - 1;

  function close() {
    playSfx("tap");
    haptic("light");
    router.push(`/book/${book.id}/`);
  }

  function next() {
    playSfx("tap");
    haptic("light");
    if (isLast) {
      close();
      return;
    }
    setIdx(i => Math.min(total - 1, i + 1));
  }

  // 空态：该单元的 lesson 没有 knowledge 数据
  if (!current) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <div className="text-base font-extrabold text-ink mb-2">本单元暂无知识手册</div>
        <div className="text-sm text-ink-light mb-6">
          {book.textbookName} · 第 {unit.unit_number} 单元 · {unit.title}
        </div>
        <button
          type="button"
          onClick={close}
          className="h-12 px-6 rounded-2xl bg-primary text-white font-extrabold text-sm"
          style={{ boxShadow: "0 4px 0 0 #58a700" }}
        >
          返回
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-white">
      {/* 顶部：X + 进度圆点 + 计数 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-bg-softer">
        <button
          type="button"
          aria-label="关闭"
          onClick={close}
          className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-ink-light hover:bg-bg-soft transition-colors"
        >
          <Close className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-8 bg-secondary" : i < idx ? "w-6 bg-secondary/60" : "w-6 bg-bg-softer",
              )}
            />
          ))}
        </div>
        <div className="shrink-0 text-xs font-extrabold text-ink-light w-10 text-right tabular-nums">
          {idx + 1}/{total}
        </div>
      </header>

      {/* 主体 slide */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex-1 flex flex-col items-center px-6 pt-6 pb-8"
          >
            {/* 单元上下文 */}
            <div className="text-[12px] font-extrabold text-ink-light text-center">
              第 {unit.unit_number} 单元 · {unit.title}
            </div>
            <div className="text-lg font-extrabold text-ink mt-1 text-center leading-snug max-w-lg">
              {current.point}
            </div>

            {/* 书本图标 —— 柔和的"这是什么"视觉 */}
            <div className="mt-10">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 16, stiffness: 220 }}
                className="w-32 h-32 rounded-full bg-secondary/10 text-secondary inline-flex items-center justify-center"
                style={{ boxShadow: "0 6px 0 0 rgba(28,176,246,0.18)" }}
              >
                <BookOpen className="w-16 h-16" />
              </motion.div>
            </div>

            {/* 标题 + TTS */}
            <div className="mt-8 flex items-center gap-3 justify-center">
              <div className="text-2xl font-extrabold text-ink tracking-tight">这是什么？</div>
              {current.audio?.core_concept && (
                <TTSButton src={current.audio.core_concept} autoPlay preload size="md" />
              )}
            </div>

            {/* 描述（核心概念） */}
            <div className="mt-3 text-[15px] text-ink-light leading-relaxed text-center max-w-lg">
              {current.core_concept}
            </div>

            {/* 小贴士 */}
            {current.tips && (
              <div className="mt-6 rounded-2xl bg-gold/10 border-2 border-gold/25 p-4 max-w-lg w-full">
                <div className="flex items-start gap-2">
                  {current.audio?.tips && (
                    <TTSButton src={current.audio.tips} size="sm" className="mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-gold mb-1">
                      小贴士
                    </div>
                    <div className="text-sm text-ink leading-snug">{current.tips}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 易错点 */}
            {current.common_mistakes && current.common_mistakes.length > 0 && (
              <div className="mt-4 rounded-2xl bg-danger/5 border-2 border-danger/20 p-4 max-w-lg w-full">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-danger mb-2">
                  容易搞错
                </div>
                <ul className="space-y-1.5">
                  {current.common_mistakes.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink leading-snug">
                      {current.audio?.common_mistakes?.[i] && (
                        <TTSButton
                          src={current.audio.common_mistakes[i]}
                          size="sm"
                          className="mt-0.5"
                        />
                      )}
                      <span className="flex-1">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部 CTA */}
      <div className="p-4 border-t border-bg-softer bg-white">
        <div className="max-w-lg mx-auto flex gap-3">
          {idx > 0 && (
            <button
              type="button"
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setIdx(i => Math.max(0, i - 1));
              }}
              className="shrink-0 h-14 px-5 rounded-2xl bg-white border-2 border-bg-softer text-ink font-extrabold text-sm"
              style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
            >
              上一步
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex-1 h-14 rounded-2xl bg-primary text-white font-extrabold text-base tracking-tight"
            style={{ boxShadow: "0 4px 0 0 #58a700" }}
          >
            {isLast ? "完成 ✓" : "下一步 →"}
          </button>
        </div>
      </div>
    </main>
  );
}
