"use client";

/**
 * BottomNav —— 移动端底部固定导航栏（1:1 Duolingo 模式）
 *
 * 4 个 tab：学习 / 错题本 / 商店 / 我的
 *
 * 设计语言：
 *   - 固定底部，全宽，56px 高（safe-area-inset 适配 iPhone 刘海/底栏）
 *   - 每个 tab：图标 + 标签，激活态 = 主色 + 灰底背板
 *   - 仅移动端显示（lg+ 用回原有的内联按钮）
 *   - 在课程进行中（lesson runner）等沉浸式页面隐藏（路径检查）
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home as HomeIcon,
  Bookmark,
  Gem,
  User,
  type IconProps,
} from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** 命中前缀判断 active */
  matchPrefix: string;
  /** 激活态主色 */
  activeColor: string;
  /** 激活态背景 */
  activeBg: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "学习",
    Icon: HomeIcon,
    matchPrefix: "/",
    activeColor: "text-primary",
    activeBg: "bg-primary/10",
  },
  {
    href: "/review/",
    label: "错题本",
    Icon: Bookmark,
    matchPrefix: "/review",
    activeColor: "text-warning",
    activeBg: "bg-warning/15",
  },
  {
    href: "/shop/",
    label: "商店",
    Icon: Gem,
    matchPrefix: "/shop",
    activeColor: "text-purple-600",
    activeBg: "bg-purple-100",
  },
  {
    href: "/profile/",
    label: "我的",
    Icon: User,
    matchPrefix: "/profile",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/15",
  },
];

/** 沉浸式路径，不显示底部导航 */
const HIDDEN_PREFIXES = ["/lesson/", "/reading/"];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === "/") {
    return pathname === "/" || /^\/grade\//.test(pathname) || /^\/book\//.test(pathname);
  }
  return pathname.startsWith(item.matchPrefix);
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  // 内嵌路径检查：sub-route 上的 lesson runner / reading 隐藏
  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-bg-softer"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
      }}
      aria-label="主导航"
    >
      <div className="grid grid-cols-4 max-w-md mx-auto h-14">
        {NAV_ITEMS.map(item => {
          const active = isActive(pathname, item);
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                playSfx("tap");
                haptic("light");
              }}
              className="flex flex-col items-center justify-center gap-0.5 select-none"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <div
                className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
                  active ? item.activeBg : ""
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    active ? item.activeColor : "text-ink-softer"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-extrabold leading-none ${
                  active ? item.activeColor : "text-ink-softer"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
