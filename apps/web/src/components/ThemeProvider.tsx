"use client";

/**
 * ThemeProvider —— 把 progress store 里 equippedTheme 应用到全局 CSS 变量。
 *
 * 主题分两类：
 *   1. **亮色主题**：仅设置 --theme-primary / --theme-accent / --theme-bg
 *      其它 token (--ink, --bg-card, ...) 走默认值，老组件零改动
 *   2. **暗色主题** (data.isDark)：完整覆盖整套灰阶 token，body 加 .theme-dark 类
 *      tailwind class 里的 bg-white/bg-bg-soft 等通过 globals.css 的 .theme-dark 选择器
 *      自动重映射到深色背景
 *
 * 同时把 `data-theme` 属性写到 <body>，方便 CSS 选择器按主题做局部样式。
 */

import { useEffect } from "react";
import { useProgressStore } from "@/store/progress";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useProgressStore(s => s.equippedTheme);

  useEffect(() => {
    const item = getCosmeticById(themeId) as UiTheme | undefined;
    if (!item || item.type !== "ui_theme") return;
    const d = item.data;
    const root = document.documentElement;

    root.style.setProperty("--theme-primary", d.primary);
    root.style.setProperty("--theme-primary-dark", d.primaryDark);
    root.style.setProperty("--theme-accent", d.accent);
    root.style.setProperty("--theme-bg", d.bg);

    if (d.isDark) {
      root.style.setProperty("--app-bg", d.bg);
      root.style.setProperty("--app-bg-soft", d.bgSoft ?? d.bg);
      root.style.setProperty("--app-bg-softer", d.bgSofter ?? d.cardBg ?? d.bg);
      root.style.setProperty("--app-card", d.cardBg ?? "#1B2230");
      root.style.setProperty("--app-border", d.borderSoft ?? "#2A3343");
      root.style.setProperty("--app-ink", d.ink ?? "#F1F5F9");
      root.style.setProperty("--app-ink-light", d.inkLight ?? "#CBD5E1");
      root.style.setProperty("--app-ink-softer", d.inkSofter ?? "#94A3B8");
      document.body.classList.add("theme-dark");
    } else {
      // 亮色：清空所有 token，让 CSS 默认值生效
      root.style.removeProperty("--app-bg");
      root.style.removeProperty("--app-bg-soft");
      root.style.removeProperty("--app-bg-softer");
      root.style.removeProperty("--app-card");
      root.style.removeProperty("--app-border");
      root.style.removeProperty("--app-ink");
      root.style.removeProperty("--app-ink-light");
      root.style.removeProperty("--app-ink-softer");
      document.body.classList.remove("theme-dark");
    }

    document.body.dataset.theme = themeId;
    document.body.style.backgroundColor = d.bg;
  }, [themeId]);

  return <>{children}</>;
}
