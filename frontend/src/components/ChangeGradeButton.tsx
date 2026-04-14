"use client";

/**
 * ChangeGradeButton —— 在 grade 页头部显示的"切换年级"按钮
 * 点击后清空 selectedGrade 并跳回 / ，触发 GradePicker 重新选择。
 */

import { useRouter } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ChangeGradeButton() {
  const router = useRouter();
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);

  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        setSelectedGrade(null);
        router.push("/");
      }}
      className="text-xs lg:text-sm font-extrabold text-secondary hover:underline"
    >
      切换年级
    </button>
  );
}
