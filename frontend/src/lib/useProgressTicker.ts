"use client";

import { useEffect, useState } from "react";
import { useProgressStore } from "@/store/progress";

/**
 * useProgressTicker — 定期刷新心数、提供一个每秒 tick 用于倒计时显示。
 *
 * 挂载时立即调用 refreshHearts（回填从上次关闭到现在的心数恢复），
 * 然后每秒 tick 一次用于"下一颗心还有 mm:ss" 显示，
 * 每次 tick 都会尝试 refreshHearts。
 *
 * 返回 now（ms）用于倒计时计算。
 */
export function useProgressTicker(): number {
  const refreshHearts = useProgressStore(s => s.refreshHearts);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    refreshHearts();
    setNow(Date.now());
    const t = setInterval(() => {
      refreshHearts();
      setNow(Date.now());
    }, 1000);

    // 页面切回前台时立即刷新
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refreshHearts();
        setNow(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshHearts]);

  return now;
}

/** 格式化毫秒为 mm:ss */
export function formatMsCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
