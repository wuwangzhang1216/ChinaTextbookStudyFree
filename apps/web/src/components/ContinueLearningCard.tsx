"use client";

/**
 * ContinueLearningCard —— Home 页顶部的"继续学习"大卡片。
 *
 * 行为：
 *   1. 如果 store 里有 activeLesson（未完成的课程会话），点击直达那节课
 *   2. 否则不渲染（Home 按年级网格选择即可）
 *
 * 视觉：Duolingo 风格绿色厚底卡片 + Mascot + 一句召唤 + ▶ CONTINUE 按钮
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mascot } from "./Mascot";
import { Check, Sparkle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { SoundLink } from "@/components/SoundLink";
import { useProgressStore } from "@/store/progress";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { Book, SubjectId } from "@/types";

/** 从 lessonId 反推 bookId —— pattern: {bookId}-u{N}-kp{M} */
function parseBookId(lessonId: string): string | null {
  const m = lessonId.match(/^(.+?)-u\d+-kp\d+$/);
  return m ? m[1] : null;
}

export function ContinueLearningCard() {
  const activeLesson = useProgressStore(s => s.activeLesson);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated || !activeLesson) return null;

  const bookId = parseBookId(activeLesson.lessonId);
  if (!bookId) return null;

  const href = `/lesson/${bookId}/${activeLesson.lessonId}/`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 220 }}
      className="w-full max-w-3xl lg:max-w-6xl mb-6 lg:mb-10"
    >
      <Link
        href={href}
        onClick={() => {
          playSfx("tap");
          haptic("medium");
        }}
        className="group block bg-white rounded-3xl border-2 border-primary/40 p-5 lg:p-7 hover:border-primary transition-colors relative overflow-hidden"
        style={{ boxShadow: "0 5px 0 0 #58a700" }}
      >
        <div className="flex items-center gap-3 lg:gap-6">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="shrink-0"
          >
            <Mascot mood="wave" size={64} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] lg:text-xs font-extrabold text-primary uppercase tracking-wide">
              继续学习
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="text-base lg:text-2xl font-extrabold text-ink truncate">
                聪聪帮你记住了进度
              </span>
              <Sparkle className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-gold shrink-0" />
            </div>
            <div className="text-xs lg:text-base text-ink-light mt-1 truncate">
              已答 {activeLesson.correctCount + activeLesson.mistakeCount} 题 · 连击 ×{activeLesson.combo}
            </div>
          </div>
          <motion.div
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="shrink-0 w-12 h-12 lg:w-16 lg:h-16 rounded-2xl bg-primary text-white flex items-center justify-center"
            style={{ boxShadow: "0 4px 0 0 #58a700" }}
          >
            <span className="text-2xl font-extrabold">▶</span>
          </motion.div>
        </div>

        {/* 用实际已答对题数表达本课进度 */}
        <motion.div
          className="mt-4 h-1.5 rounded-full bg-primary/15 overflow-hidden"
          aria-hidden
        >
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(100, (activeLesson.solvedIds?.length ?? activeLesson.index) / Math.max(1, activeLesson.totalQuestions ?? ((activeLesson.solvedIds?.length ?? activeLesson.index) + (activeLesson.queueIds?.length ?? 0))) * 100)}%` }}
            transition={{ delay: 0.3, duration: 0.8 }}
          />
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ============================================================
// ActiveBookSync —— 挂在 /book/{id} 页里的隐形同步器：
// 访问哪本书，哪本书就成为「当前教材」（activeBookId），
// 首页据此实现「打开即路径」。同时把 selectedGrade 对齐到该书年级。
// ============================================================
export function ActiveBookSync({ bookId, grade }: { bookId: string; grade: number }) {
  // 只在进入该书页时同步一次（依赖仅 bookId/grade）：
  // 若依赖 store 字段，会与弹层里的「换年级」（清空两者后跳走）竞态互写。
  useEffect(() => {
    const s = useProgressStore.getState();
    if (s.activeBookId !== bookId) s.setActiveBookId(bookId);
    if (s.selectedGrade !== grade) s.setSelectedGrade(grade);
  }, [bookId, grade]);

  return null;
}

// ============================================================
// CurrentBookBadge —— 「当前教材」徽章按钮 + 换书弹层
// 列出本年级各科教材（选择即 setActiveBookId 并跳转），附换年级入口。
// ============================================================

const SUBJECT_ORDER: SubjectId[] = ["math", "chinese", "english", "science"];

const SUBJECT_STYLE: Record<SubjectId, { color: string; glyph: string }> = {
  math: { color: "#58CC02", glyph: "数" },
  chinese: { color: "#FF4B4B", glyph: "语" },
  english: { color: "#1CB0F6", glyph: "A" },
  science: { color: "#FFC800", glyph: "科" },
};

function subjectOf(b: Book): SubjectId {
  return (b.subject ?? "math") as SubjectId;
}

export function CurrentBookBadge({
  book,
  gradeBooks,
}: {
  /** 当前所在的教材 */
  book: Book;
  /** 同年级全部教材（服务端传入，含当前这本） */
  gradeBooks: Book[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const setActiveBookId = useProgressStore(s => s.setActiveBookId);
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);

  const cur = SUBJECT_STYLE[subjectOf(book)];

  // 学科序 + 学期序（上册在前）
  const sorted = [...gradeBooks].sort((a, b) => {
    const so = SUBJECT_ORDER.indexOf(subjectOf(a)) - SUBJECT_ORDER.indexOf(subjectOf(b));
    if (so !== 0) return so;
    return (a.semester === "up" ? 0 : 1) - (b.semester === "up" ? 0 : 1);
  });

  function choose(b: Book) {
    playSfx("tap");
    haptic("light");
    setOpen(false);
    if (b.id === book.id) return;
    setActiveBookId(b.id);
    router.push(`/book/${b.id}/`);
  }

  function changeGrade() {
    playSfx("tap");
    haptic("light");
    setOpen(false);
    // 清空年级 + 当前教材 → 首页回到 GradePicker 引导
    setActiveBookId(null);
    setSelectedGrade(null);
    router.push("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSfx("tap");
          haptic("light");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`当前教材：${book.subjectName ?? ""}${book.textbookName}，点击切换`}
        className="inline-flex items-center gap-1.5 h-11 px-3 rounded-full bg-white border-2 border-bg-softer hover:border-primary/50 transition-colors select-none min-w-0"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
      >
        <span
          aria-hidden
          className="w-5 h-5 rounded-full text-white text-[10px] font-extrabold inline-flex items-center justify-center shrink-0"
          style={{ backgroundColor: cur.color }}
        >
          {cur.glyph}
        </span>
        <span className="text-xs font-extrabold text-ink truncate max-w-[150px]">
          {book.subjectName ?? ""}
          {book.textbookName}
        </span>
        <span aria-hidden className="text-ink-softer text-[10px] shrink-0">
          ▾
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="切换教材">
        <div className="text-lg font-extrabold text-ink leading-tight">切换教材</div>
        <div className="text-xs text-ink-light mt-1 mb-4">
          {book.gradeName}的全部教材，点一下就换
        </div>

        <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
          {sorted.map(b => {
            const s = SUBJECT_STYLE[subjectOf(b)];
            const isCurrent = b.id === book.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => choose(b)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-2xl border-2 text-left transition-colors select-none",
                  isCurrent
                    ? "border-primary bg-primary/5"
                    : "border-bg-softer bg-white hover:border-primary/40",
                )}
                aria-current={isCurrent ? "true" : undefined}
              >
                <span
                  aria-hidden
                  className="w-9 h-9 rounded-xl text-white text-base font-extrabold inline-flex items-center justify-center shrink-0"
                  style={{ backgroundColor: s.color, boxShadow: "inset 0 -2px 0 0 rgba(0,0,0,0.12)" }}
                >
                  {s.glyph}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold text-ink truncate">
                    {b.subjectName ?? ""}
                    {b.textbookName}
                  </span>
                  <span className="block text-[11px] text-ink-light mt-0.5">
                    {b.unitsCount} 单元 · {b.lessonsCount} 节小课
                  </span>
                </span>
                {isCurrent && (
                  <Check className="w-5 h-5 text-primary shrink-0" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t-2 border-bg-softer flex items-center justify-between">
          <button
            type="button"
            onClick={changeGrade}
            className="text-sm font-extrabold text-secondary hover:underline"
          >
            换个年级
          </button>
          <SoundLink
            href={`/grade/${book.grade}/`}
            onClick={() => setOpen(false)}
            className="text-sm font-extrabold text-ink-light hover:text-ink"
          >
            看年级主页 →
          </SoundLink>
        </div>
      </Modal>
    </>
  );
}
