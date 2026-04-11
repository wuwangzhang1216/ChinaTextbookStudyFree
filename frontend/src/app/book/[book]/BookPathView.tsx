"use client";

import { useEffect, useState } from "react";
import { PathMap, type LessonStatus, type PathLessonMeta } from "@/components/PathMap";
import { useProgressStore } from "@/store/progress";
import { useSyncMute } from "@/components/MuteToggle";
import { playSfx } from "@/lib/sfx";
import type { Outline } from "@/types";

export interface BookOutlineWithLessons extends Outline {
  bookId: string;
  grade: number;
  semester: "up" | "down";
  lessons: PathLessonMeta[];
}

export function BookPathView({ bookId, outline }: { bookId: string; outline: BookOutlineWithLessons }) {
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

  return <PathMap bookId={bookId} lessons={outline.lessons} statuses={statuses} stars={stars} />;
}
