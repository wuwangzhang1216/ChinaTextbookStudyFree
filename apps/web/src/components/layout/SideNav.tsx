"use client";

/**
 * SideNav —— 桌面端左侧导航
 *
 * 4 个真实页面：学习 / 错题本 / 商店 / 我的
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  Home as HomeIcon,
  Bookmark,
  Gem,
  User,
  type IconProps,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  matchPrefix: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "学习", Icon: HomeIcon, matchPrefix: "/learn-root" },
  { href: "/review/", label: "错题本", Icon: Bookmark, matchPrefix: "/review" },
  { href: "/shop/", label: "商店", Icon: Gem, matchPrefix: "/shop" },
  { href: "/profile/", label: "我的", Icon: User, matchPrefix: "/profile" },
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

  return (
    <nav className="flex flex-col gap-2 w-full" aria-label="主导航">
      {/* Logo —— 仅文字 wordmark（仿 duolingo 文字 logo） */}
      <Link
        href="/"
        onClick={() => {
          playSfx("tap");
          haptic("light");
        }}
        className="block px-3 py-3 mb-2"
      >
        <span className="text-2xl font-extrabold text-primary tracking-tightest">
          小猫头鹰
        </span>
      </Link>

      {ITEMS.map(item => {
        const Icon = item.Icon;
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => {
              playSfx("tap");
              haptic("light");
            }}
            className={cn(
              "group flex items-center gap-3 px-3 h-14 rounded-2xl border-2 transition-colors select-none",
              active
                ? "border-secondary/50 bg-secondary/10 text-secondary-dark"
                : "border-transparent text-ink-light hover:bg-bg-soft"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={cn(
                "w-7 h-7 shrink-0",
                active ? "text-secondary" : "text-ink-softer group-hover:text-ink-light"
              )}
            />
            <span
              className={cn(
                "text-base font-extrabold",
                active ? "text-secondary-dark" : "text-ink-light group-hover:text-ink"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
