"use client";

/**
 * DailyRewardWatcher —— 进入应用首屏时的每日登陆奖励
 *
 * 行为：
 *   - 用户每天首次打开应用时，弹一个 Toast 告诉他 "今日奖励已发放"
 *   - 奖励金额随连续登陆天数递增（封顶 30）
 *   - 已领过的当天不会重复触发
 *   - 在 lesson runner 等沉浸页面不打扰
 *
 * 配合 store.claimDailyReward 使用。
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useProgressStore, dailyRewardForStreak, isWeekendBonusActive } from "@/store/progress";
import { useToast } from "./Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const HIDDEN_PREFIXES = ["/lesson/", "/reading/"];

export function DailyRewardWatcher() {
  const pathname = usePathname() ?? "/";
  const toast = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return;

    // 等待 store hydrate；用一帧延迟确保 persist 已加载
    const t = window.setTimeout(() => {
      const claim = useProgressStore.getState().claimDailyReward;
      const before = useProgressStore.getState();
      const reward = claim();
      if (reward > 0) {
        fired.current = true;
        const expected = dailyRewardForStreak(before.streak);
        toast.success(`💎 每日奖励 +${reward}（连续 ${before.streak} 天）`, 3200);
        playSfx("star");
        haptic("success");
        // expected 未使用警告抑制
        void expected;
      } else {
        fired.current = true;
      }

      // 周末 XP 双倍提示（每天只提一次）
      if (isWeekendBonusActive()) {
        const seenKey = `csf-weekend-bonus-seen-${todayStr()}`;
        if (typeof window !== "undefined" && !localStorage.getItem(seenKey)) {
          window.setTimeout(() => {
            toast.info("🎉 周末双倍 XP 已开启！", 3200);
          }, 800);
          try {
            localStorage.setItem(seenKey, "1");
          } catch {
            /* noop */
          }
        }
      }
    }, 600);

    return () => window.clearTimeout(t);
    // 仅依赖 pathname 变化触发再判定（首次进入时执行一次）
  }, [pathname, toast]);

  return null;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
