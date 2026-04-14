"use client";

import { useEffect, useState } from "react";
import { PathMap, type LessonStatus, type PathLessonMeta } from "@/components/PathMap";
import { SubjectBadge } from "@/components/SubjectBadge";
import { SoundLink } from "@/components/SoundLink";
import { BookOpen } from "@/components/icons";
import { useProgressStore } from "@/store/progress";
import { useSyncMute } from "@/components/MuteToggle";
import { playSfx } from "@/lib/sfx";
import type { Book, Outline } from "@/types";

export interface BookOutlineWithLessons extends Outline {
  bookId: string;
  grade: number;
  semester: "up" | "down";
  lessons: PathLessonMeta[];
}

export function BookPathView({
  bookId,
  outline,
  book,
}: {
  bookId: string;
  outline: BookOutlineWithLessons;
  book: Book;
}) {
  useSyncMute();
  const completedLessons = useProgressStore(s => s.completedLessons);
  const [hydrated, setHydrated] = useState(false);

  // 防 SSR/CSR 不一致：localStorage 只在挂载后可用
  useEffect(() => setHydrated(true), []);

  // 从课程页返回时播放解锁音效
  useEffect(() => {
    if (!hydrated) return;
    if (typeof document === "undefined") return;
    if (document.referrer && document.referrer.includes("/lesson/")) {
      const t = setTimeout(() => playSfx("unlock"), 300);
      return () => clearTimeout(t);
    }
  }, [hydrated]);

  // 计算每节课状态：第一节始终解锁，后续节点需要前一节完成
  const statuses: Record<string, LessonStatus> = {};
  const stars: Record<string, number> = {};
  let foundCurrent = false;

  for (let i = 0; i < outline.lessons.length; i++) {
    const lesson = outline.lessons[i];
    const result = hydrated ? completedLessons[lesson.id] : undefined;
    if (result) {
      statuses[lesson.id] = "completed";
      stars[lesson.id] = result.stars;
    } else if (!foundCurrent) {
      statuses[lesson.id] = "current";
      foundCurrent = true;
    } else {
      statuses[lesson.id] = "locked";
    }
  }

  const headerLabel = (
    <>
      <SubjectBadge book={book} className="!border-white/60 !bg-white/15 !text-white" />
      <span className="truncate">{book.textbookName}</span>
    </>
  );

  const topSlot =
    book.hasPassages || book.hasStories ? (
      <div className="flex items-center gap-2">
        {book.hasPassages && (
          <SoundLink
            href={`/reading/${bookId}/`}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white border-2 border-bg-softer text-xs font-extrabold text-primary hover:border-primary/40 transition-colors"
            style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
          >
            <BookOpen className="w-4 h-4" />
            课文听读
          </SoundLink>
        )}
        {book.hasStories && (
          <SoundLink
            href={`/stories/${bookId}/`}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white border-2 border-bg-softer text-xs font-extrabold text-warning hover:border-warning/40 transition-colors"
            style={{ boxShadow: "0 2px 0 0 #e5e5e5" }}
          >
            <BookOpen className="w-4 h-4" />
            故事阅读
          </SoundLink>
        )}
      </div>
    ) : null;

  return (
    <PathMap
      bookId={bookId}
      lessons={outline.lessons}
      statuses={statuses}
      stars={stars}
      headerLabel={headerLabel}
      hasGuide={outline.units.length > 0}
      backHref={`/grade/${book.grade}/`}
      topSlot={topSlot}
    />
  );
}
