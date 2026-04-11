"use client";

import dynamic from "next/dynamic";
import type { Lesson } from "@/types";

const LessonRunner = dynamic(
  () => import("@/components/LessonRunner").then(m => ({ default: m.LessonRunner })),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center px-4">
        <div className="w-full max-w-md animate-pulse">
          <div className="h-10 rounded-full bg-bg-softer/60 mb-4" />
          <div className="h-64 rounded-3xl bg-bg-softer/60 mb-4" />
          <div className="h-14 rounded-2xl bg-bg-softer/60" />
        </div>
      </main>
    ),
  },
);

export default function LessonPageClient({ lesson }: { lesson: Lesson }) {
  return <LessonRunner lesson={lesson} />;
}
