"use client";

/**
 * GradePicker —— 首次进入时的年级选择引导（仿 Duolingo onboarding 的 "How much do you know?" 步骤）
 *
 * 触发：useProgressStore.selectedGrade === null
 * 完成后：setSelectedGrade(g) → 跳到 /grade/{g}/
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { SpeechBubble } from "@/components/SpeechBubble";
import { Apple, Sprout, Tree, Butterfly, Rocket, Trophy, type IconProps } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { ComponentType } from "react";

interface Option {
  grade: number;
  label: string;
  hint: string;
  Icon: ComponentType<IconProps>;
}

const OPTIONS: Option[] = [
  { grade: 1, label: "我刚上一年级", hint: "刚开始识字 / 学加减", Icon: Apple },
  { grade: 2, label: "我读二年级", hint: "已会简单加减 / 拼音", Icon: Sprout },
  { grade: 3, label: "我读三年级", hint: "认识更多汉字 / 学乘除", Icon: Tree },
  { grade: 4, label: "我读四年级", hint: "能写小作文 / 学小数", Icon: Butterfly },
  { grade: 5, label: "我读五年级", hint: "阅读理解 / 学分数", Icon: Rocket },
  { grade: 6, label: "我读六年级", hint: "面对小升初", Icon: Trophy },
];

export function GradePicker() {
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);
  const [picked, setPicked] = useState<number | null>(null);

  function handleContinue() {
    if (picked == null) return;
    playSfx("star");
    haptic("success");
    setSelectedGrade(picked);
    // 用硬跳转避免 next.js (output: export + trailingSlash) router.push 偶发 404
    window.location.assign(`/grade/${picked}/`);
  }

  return (
    <div className="fixed inset-0 z-40 bg-bg flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start pt-12 px-5 overflow-y-auto pb-32">
        {/* 顶部 mascot + 气泡 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 18 }}
          className="flex items-end gap-3 mb-8 max-w-md w-full"
        >
          <Mascot size={96} mood="wave" />
          <div className="mb-2">
            <SpeechBubble text="你现在读几年级呀？" tone="neutral" />
          </div>
        </motion.div>

        {/* 6 个选项 */}
        <div className="w-full max-w-md flex flex-col gap-3">
          {OPTIONS.map((opt, i) => {
            const Icon = opt.Icon;
            const selected = picked === opt.grade;
            return (
              <motion.button
                key={opt.grade}
                type="button"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  setPicked(opt.grade);
                }}
                className={cn(
                  "flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-colors select-none",
                  selected
                    ? "border-secondary bg-secondary/10"
                    : "border-bg-softer bg-white hover:border-secondary/40"
                )}
                style={{
                  boxShadow: selected
                    ? "0 4px 0 0 #1899D6"
                    : "0 3px 0 0 #e5e5e5",
                }}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                    selected ? "bg-secondary/15" : "bg-bg-soft"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-7 h-7",
                      selected ? "text-secondary" : "text-ink-light"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-base font-extrabold leading-tight",
                      selected ? "text-secondary-dark" : "text-ink"
                    )}
                  >
                    {opt.label}
                  </div>
                  <div className="text-xs text-ink-light mt-0.5">{opt.hint}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 底部 sticky 继续按钮 */}
      <div className="border-t-2 border-bg-softer bg-white">
        <div className="max-w-md mx-auto px-5 py-4 flex justify-end">
          <AnimatePresence>
            {picked != null && (
              <motion.button
                key="continue"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={handleContinue}
                className="btn-chunky-primary px-10"
              >
                继续
              </motion.button>
            )}
          </AnimatePresence>
          {picked == null && (
            <button
              type="button"
              disabled
              className="btn-chunky-disabled px-10"
            >
              继续
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
