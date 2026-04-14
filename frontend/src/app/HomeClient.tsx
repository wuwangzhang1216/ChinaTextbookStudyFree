"use client";

import { useEffect, useState } from "react";
import { useProgressStore } from "@/store/progress";
import { GradePicker } from "@/components/GradePicker";

interface HomeClientProps {
  grades: number[];
  byGrade: Record<number, number>;
  totalBooks: number;
  totalLessons: number;
  totalQuestions: number;
}

export function HomeClient(_props: HomeClientProps) {
  const selectedGrade = useProgressStore(s => s.selectedGrade);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  // 已选过年级 → 直接硬跳转到该年级的教材列表（成为真正的"home"）
  useEffect(() => {
    if (hydrated && selectedGrade != null) {
      window.location.replace(`/grade/${selectedGrade}/`);
    }
  }, [hydrated, selectedGrade]);

  if (!hydrated || selectedGrade != null) {
    return <div className="min-h-screen bg-bg" />;
  }

  return <GradePicker />;
}
