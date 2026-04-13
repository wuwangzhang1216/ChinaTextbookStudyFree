"use client";

/**
 * ThemeProvider —— 把 progress store 里 equippedTheme 应用到全局 CSS 变量。
 *
 * 不直接覆盖 Tailwind 的 primary/secondary（避免污染设计系统），而是设置
 * 一组 `--theme-*` 自定义属性，可被需要"主题色"的组件挑选使用。
 *
 * 同时，把 `data-theme` 属性写到 <body>，方便 CSS 选择器按主题做局部样式。
 *
 * 默认的 theme_default 会让所有 --theme-* 与 Tailwind 默认色相同，
 * 老组件零改动也能继续工作。
 */

import { useEffect } from "react";
import { useProgressStore } from "@/store/progress";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useProgressStore(s => s.equippedTheme);

  useEffect(() => {
    const item = getCosmeticById(themeId) as UiTheme | undefined;
    if (!item || item.type !== "ui_theme") return;
    const { primary, primaryDark, accent, bg } = item.data;
    const root = document.documentElement;
    root.style.setProperty("--theme-primary", primary);
    root.style.setProperty("--theme-primary-dark", primaryDark);
    root.style.setProperty("--theme-accent", accent);
    root.style.setProperty("--theme-bg", bg);
    document.body.dataset.theme = themeId;
    document.body.style.backgroundColor = bg;
  }, [themeId]);

  return <>{children}</>;
}
