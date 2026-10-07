"use client";

/**
 * BottomNav —— 移动端底部固定导航栏
 *
 * 5 个真实 tab：学习 / 排行榜 / 错题本 / 商店 / 我的
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
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
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useProgressStore } from "@/store/progress";
import { ALL_COSMETICS } from "@/lib/cosmetics";
import { hasUnseenAchievements } from "@/lib/achievements";
import { isImmersivePath } from "@/lib/immersiveRoutes";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** 激活态的粗填充变体（web-shell-19），视觉重量对齐 iOS */
  IconActive: ComponentType<IconProps>;
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
    IconActive: HomeFill,
    matchPrefix: "/",
    activeColor: "text-primary",
    activeBg: "bg-primary/10",
  },
  {
    href: "/league/",
    label: "排行榜",
    Icon: Trophy,
    IconActive: TrophyFill,
    matchPrefix: "/league",
    activeColor: "text-gold",
    activeBg: "bg-gold/15",
  },
  {
    href: "/review/",
    label: "错题本",
    Icon: Bookmark,
    IconActive: BookmarkFill,
    matchPrefix: "/review",
    activeColor: "text-warning",
    activeBg: "bg-warning/15",
  },
  {
    href: "/shop/",
    label: "商店",
    Icon: Gem,
    IconActive: Gem,
    matchPrefix: "/shop",
    activeColor: "text-secondary",
    activeBg: "bg-secondary/15",
  },
  {
    href: "/profile/",
    label: "我的",
    Icon: User,
    IconActive: UserFill,
    matchPrefix: "/profile",
    activeColor: "text-secondary-dark",
    activeBg: "bg-secondary/15",
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === "/") {
    return (
      pathname === "/" ||
      /^\/(grade|book|lesson|stories|reading)\//.test(pathname)
    );
  }
  return pathname.startsWith(item.matchPrefix);
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const selectedGrade = useProgressStore(s => s.selectedGrade);
  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  const mistakes = useProgressStore(s => s.mistakesBank);
  const gems = useProgressStore(s => s.gems);
  const ownedCosmetics = useProgressStore(s => s.ownedCosmetics);
  const claimableQuestCount = useProgressStore(s => s.claimableQuestCount);
  // claimableQuestCount 是派生函数（引用恒定），订阅其依赖字段驱动徽章实时刷新
  useProgressStore(
    s =>
      `${s.dailyQuestDate}|${s.lastXpDate}|${s.todayXp}|${s.dailyLessons}|${s.dailyReviews}|${s.dailyReadings}|${Object.keys(s.claimedQuests).length}`,
  );

  // 错题本徽章：今日可复习的数量
  const today = todayStr();
  const reviewBadge = hydrated
    ? mistakes.filter(m => !m.nextReviewDate || m.nextReviewDate <= today).length
    : 0;

  // 商店徽章：有任何当前 gems 买得起且未拥有的道具就亮红点
  const shopHasAffordable = hydrated
    ? ALL_COSMETICS.some(c => !ownedCosmetics[c.id] && c.cost > 0 && gems >= c.cost)
    : false;

  // 个人中心徽章：可领取的每日任务（计数优先），其次未读成就红点
  const claimableQuests = hydrated ? claimableQuestCount() : 0;
  const profileHasUnseen = hydrated && hasUnseenAchievements();

  // 沉浸式路径（课程 / 跳级 / 复习 runner / 阅读器）隐藏底部导航，
  // 否则固定底栏会盖住这些页面底部的「检查 / 继续」按钮。
  if (!hydrated || selectedGrade == null || isImmersivePath(pathname)) return null;

  const navItems = NAV_ITEMS.map(item => item.matchPrefix === "/league" && completed < 10 ? { ...item, href: `/reading/chinese-g${selectedGrade ?? 1}up/`, label: "听读", Icon: BookOpen, IconActive: BookOpen, matchPrefix: "/reading" } : item);

  function getBadge(item: NavItem): { count?: number; dot?: boolean } | null {
    if (item.matchPrefix === "/review" && reviewBadge > 0) return { count: reviewBadge };
    if (item.matchPrefix === "/shop" && shopHasAffordable) return { dot: true };
    if (item.matchPrefix === "/profile") {
      if (claimableQuests > 0) return { count: claimableQuests };
      if (profileHasUnseen) return { dot: true };
    }
    return null;
  }

  return (
    <>
    {/* 占位条：把页面内容顶出固定导航的高度（含安全区），
        代替旧版全局 body pb-16 —— 导航隐藏时占位也随之消失 */}
    <div
      aria-hidden="true"
      className="md:hidden"
      style={{ height: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))" }}
    />
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-bg-softer"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
      }}
      aria-label="主导航"
    >
      <div className="grid grid-cols-5 max-w-md mx-auto h-14">
        {navItems.map(item => {
          const active = isActive(pathname, item);
          const Icon = active ? item.IconActive : item.Icon;
          const badge = getBadge(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                playSfx("tap");
                haptic("light");
              }}
              className="flex flex-col items-center justify-center gap-0.5 select-none relative"
              aria-label={
                badge?.count
                  ? `${item.label}（${badge.count} 项待办）`
                  : badge?.dot
                    ? `${item.label}（有新内容）`
                    : item.label
              }
              aria-current={active ? "page" : undefined}
            >
              <div
                className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
                  active ? item.activeBg : ""
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    active ? item.activeColor : "text-ink-softer"
                  }`}
                />
                {badge?.count && badge.count > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-extrabold inline-flex items-center justify-center border-2 border-white tabular-nums"
                    aria-hidden="true"
                  >
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                ) : badge?.dot ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger border-2 border-white"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <span
                className={`text-[9px] font-extrabold leading-none ${
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
    </>
  );
}
