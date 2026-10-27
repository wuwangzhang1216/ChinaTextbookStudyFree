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
import { SubjectBookIcon } from "./LearningIcon";
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

export function ContinueLearningCard({ compact = false, placement = "page" }: { compact?: boolean; placement?: "page" | "rail" } = {}) {
  const activeLesson = useProgressStore(s => s.activeLesson);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated || !activeLesson) return null;

  const bookId = parseBookId(activeLesson.lessonId);
  if (!bookId) return null;

  const href = `/lesson/${bookId}/${activeLesson.lessonId}/`;

  if (compact) return (
    <Link href={href} data-placement={placement} className="continue-strip flex items-center gap-3 w-full rounded-2xl border-2 border-bg-softer bg-white p-3 mb-4" onClick={() => { playSfx("tap"); haptic("light"); }}>
      <span className="continue-play w-10 h-10 rounded-xl flex items-center justify-center shrink-0" aria-hidden>▶</span>
      <span className="flex-1 min-w-0"><span className="block text-base font-bold text-ink">继续上次的练习</span><span className="block text-sm text-ink-light mt-0.5">已答 {activeLesson.correctCount + activeLesson.mistakeCount} 题</span></span>
      <span className="text-secondary-dark" aria-hidden>→</span>
    </Link>
  );

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
        className="group block bg-white rounded-2xl border-2 border-bg-softer p-5 lg:p-7 hover:border-primary transition-colors relative overflow-hidden"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
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
            <div className="text-sm font-extrabold text-primary uppercase tracking-wide">
              继续学习
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="text-base lg:text-2xl font-extrabold text-ink break-words">
                上次的课程还没做完呢
              </span>
              <Sparkle className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-gold shrink-0" />
            </div>
            <div className="text-xs lg:text-base text-ink-light mt-1 leading-relaxed">
              已答 {activeLesson.correctCount + activeLesson.mistakeCount} 题 · 连击 ×{activeLesson.combo}
            </div>
          </div>
          <motion.div
            whileHover={{ y: -1 }}
            whileTap={{ y: 3 }}
            className="continue-play shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center"
          >
            <span className="text-xl font-bold">▶</span>
          </motion.div>
        </div>

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
  const [schoolSystem, setSchoolSystem] = useState<"6-3" | "5-4">(book.schoolSystem ?? "6-3");
  useEffect(() => setSchoolSystem(book.schoolSystem ?? "6-3"), [book.id, book.schoolSystem]);
  const router = useRouter();
  const setActiveBookId = useProgressStore(s => s.setActiveBookId);
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);

  // 学科序 + 学期序（上册在前）
  const sorted = gradeBooks.filter(b => (b.schoolSystem ?? "6-3") === schoolSystem).sort((a, b) => {
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
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl bg-white border-2 border-bg-softer hover:border-primary/50 transition-colors select-none min-w-0"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
      >
        <SubjectBookIcon subject={subjectOf(book)} className="w-6 h-7 shrink-0" />
        <span className="text-xs font-extrabold text-ink break-words max-w-[150px]">
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
        {gradeBooks.some(b => b.schoolSystem === "5-4") && <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="切换学制">
          {(["6-3", "5-4"] as const).map(value => <button
            key={value} type="button" aria-pressed={schoolSystem === value}
            onClick={() => setSchoolSystem(value)}
            className={`min-h-11 px-4 rounded-xl border-2 font-bold text-sm ${schoolSystem === value ? "border-primary bg-primary/10 text-primary-dark" : "border-bg-softer text-ink"}`}
          >{value === "6-3" ? "六三制" : "五四制"}</button>)}
        </div>}

        <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
          {sorted.map(b => {
            const isCurrent = b.id === book.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => choose(b)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-2xl border-2 text-left transition-colors select-none",
                  isCurrent
                    ? "border-secondary bg-secondary/10"
                    : "border-bg-softer bg-white hover:border-primary/40",
                )}
                aria-current={isCurrent ? "true" : undefined}
              >
                <SubjectBookIcon subject={subjectOf(b)} className="w-9 h-10 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold text-ink break-words">
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
            className="min-h-11 px-2 text-sm font-extrabold text-secondary hover:underline"
          >
            换个年级
          </button>
          <SoundLink
            href={`/grade/${book.grade}/`}
            onClick={() => setOpen(false)}
            className="min-h-11 px-2 text-sm font-extrabold text-ink-light hover:text-ink"
          >
            看年级主页 →
          </SoundLink>
        </div>
      </Modal>
    </>
  );
}
