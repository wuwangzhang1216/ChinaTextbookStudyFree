"use client";

/**
 * SideNav —— 桌面端左侧导航
 *
 * 5 个真实页面：学习 / 排行榜 / 错题本 / 商店 / 我的
 *
 * 响应式（web-shell-14）：
 *   - md (768-1023)：icon-only 窄栏（AppShell 给 88px），文字隐藏
 *   - lg+：完整 260px，图标 + 文字
 * 激活态用粗填充图标（web-shell-19），视觉重量对齐 iOS。
 * 底部：免费深色模式三态开关。
 */

import { useProgressStore } from "@/store/progress";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  BookOpen,
  Home as HomeIcon,
  HomeFill,
  Trophy,
  TrophyFill,
  Bookmark,
  BookmarkFill,
  Gem,
  User,
  UserFill,
  type IconProps,
} from "@/components/icons";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** 激活态的粗填充变体（Gem 本身已是填充图标，复用同款） */
  IconActive: ComponentType<IconProps>;
  matchPrefix: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "学习", Icon: HomeIcon, IconActive: HomeFill, matchPrefix: "/learn-root" },
  { href: "/league/", label: "排行榜", Icon: Trophy, IconActive: TrophyFill, matchPrefix: "/league" },
  { href: "/review/", label: "错题本", Icon: Bookmark, IconActive: BookmarkFill, matchPrefix: "/review" },
  { href: "/shop/", label: "商店", Icon: Gem, IconActive: Gem, matchPrefix: "/shop" },
  { href: "/profile/", label: "我的", Icon: User, IconActive: UserFill, matchPrefix: "/profile" },
];

function isActiveLearn(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/grade/") ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/lesson/") ||
    pathname.startsWith("/stories/") ||
    pathname.startsWith("/reading/")
  );
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.label === "学习") return isActiveLearn(pathname);
  return pathname.startsWith(item.matchPrefix);
}

export function SideNav() {
  const pathname = usePathname() ?? "/";

  const grade = useProgressStore(s => s.selectedGrade) ?? 1;
  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  const items = ITEMS.map(item => item.matchPrefix === "/league" && completed < 10 ? { ...item, href: `/reading/chinese-g${grade}up/`, label: "听读", Icon: BookOpen, IconActive: BookOpen, matchPrefix: "/reading" } : item);

  return (
    <nav className="flex flex-col gap-2 w-full h-full" aria-label="主导航">
      {/* Logo —— 文字 wordmark（lg+）；md 窄栏显示熊猫图标 */}
      <Link
        href="/"
        onClick={() => {
          playSfx("tap");
          haptic("light");
        }}
        className="block px-3 py-3 mb-2"
        aria-label="聪聪学堂 · 回到首页"
      >
        <span className="hidden lg:inline text-2xl font-extrabold text-primary tracking-tightest">
          聪聪学堂
        </span>
        <span className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10 text-primary font-extrabold text-lg">
          聪
        </span>
      </Link>

      {items.map(item => {
        const active = isActive(pathname, item);
        const Icon = active ? item.IconActive : item.Icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => {
              playSfx("tap");
              haptic("light");
            }}
            className={cn(
              "group flex items-center justify-center lg:justify-start gap-3 px-3 h-14 rounded-2xl border-2 transition-colors select-none",
              active
                ? "border-secondary/50 bg-secondary/10 text-secondary-dark"
                : "border-transparent text-ink-light hover:bg-bg-soft"
            )}
            aria-current={active ? "page" : undefined}
            title={item.label}
          >
            <Icon
              className={cn(
                "w-7 h-7 shrink-0",
                active ? "text-secondary" : "text-ink-softer group-hover:text-ink-light"
              )}
            />
            <span
              className={cn(
                "hidden lg:inline text-base font-extrabold",
                active ? "text-secondary-dark" : "text-ink-light group-hover:text-ink"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* 底部：深色模式三态开关（md 窄栏收成纯图标） */}
      <div className="mt-auto pt-4 pb-2 px-1">
        <ThemeModeToggle compact />
      </div>
    </nav>
  );
}
