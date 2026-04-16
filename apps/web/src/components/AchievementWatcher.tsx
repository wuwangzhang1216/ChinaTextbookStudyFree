"use client";

/**
 * AchievementWatcher —— 监听 progress store，发现新解锁成就时弹 Toast
 *
 * 仅在客户端运行；用 zustand subscribe API 订阅。
 * 注意：组件本身不渲染任何东西，只负责副作用。
 */

import { useEffect, useRef } from "react";
import { useProgressStore } from "@/store/progress";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
} from "@/lib/achievements";
import { useToast } from "./Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function AchievementWatcher() {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    // 初始化：当前已解锁集，初次不弹任何 toast
    seen.current = new Set(
      computeUnlockedAchievementIds(useProgressStore.getState()),
    );

    const unsub = useProgressStore.subscribe(state => {
      const current = new Set(computeUnlockedAchievementIds(state));
      if (!seen.current) {
        seen.current = current;
        return;
      }
      const newly: string[] = [];
      current.forEach(id => {
        if (!seen.current!.has(id)) newly.push(id);
      });
      if (newly.length > 0) {
        for (const id of newly) {
          const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
          if (ach) {
            toast.success(`🏆 解锁成就：${ach.name}`, 3600);
            playSfx("unlock");
            haptic("success");
          }
        }
      }
      seen.current = current;
    });

    return unsub;
  }, [toast]);

  return null;
}
