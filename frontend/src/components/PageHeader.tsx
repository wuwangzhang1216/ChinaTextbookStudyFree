"use client";

/**
 * PageHeader —— 内页通用顶栏（移动端 56px / 桌面 72px）
 *
 * 1:1 Duolingo 设计语言：
 *   - 左侧：圆角 ghost 风格的纯图标返回按钮（40×40 / lg 48×48），无文字
 *   - 中间：页面标题 + 可选副标题（左对齐，跟随返回按钮顶格）
 *   - 右侧：紧凑 StatsBar（移动端只显 心 + 连击 + 宝石 3 颗胶囊；lg+ 显示完整版）
 *
 * 设计原则：
 *   - 移动端 0 留白溢出，所有内容塞进一行
 *   - 桌面端用同一组件，自动展开 max-width 与字号
 *   - 标题区永远在第二行（避免文字与 stats 抢空间）
 */

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { StatsBar } from "@/components/StatsBar";

interface PageHeaderProps {
  /** 返回链接的目标路径；传 null 隐藏返回按钮（顶层页面无父级时用） */
  backHref: string | null;
  /** 主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 是否显示 StatsBar，默认 true */
  showStats?: boolean;
  /** 容器最大宽度（默认 max-w-3xl lg:max-w-5xl xl:max-w-6xl） */
  maxWidthClass?: string;
  /** 标题右侧附加内容（如自定义按钮） */
  rightExtra?: ReactNode;
}

export function PageHeader({
  backHref,
  title,
  subtitle,
  showStats = true,
  maxWidthClass = "max-w-3xl lg:max-w-5xl xl:max-w-6xl",
  rightExtra,
}: PageHeaderProps) {
  return (
    <div className={`w-full ${maxWidthClass}`}>
      {/* 顶部 app bar —— 单行：返回 + stats */}
      <div className="flex items-center justify-between gap-3 mb-4 lg:mb-6">
        {backHref ? (
          <SoundLink
            href={backHref}
            aria-label="返回"
            className="inline-flex items-center justify-center w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-white border-2 border-bg-softer text-ink-light hover:text-primary hover:border-primary transition-colors shrink-0 lg:hidden"
            style={{ boxShadow: "0 3px 0 0 #e5e5e5" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
        ) : null}

        {showStats && (
          <div className="flex-1 flex justify-end min-w-0">
            <StatsBar compact />
          </div>
        )}
      </div>

      {/* 标题区（独立一行，避免与 stats 抢宽） */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between gap-3 mb-5 lg:mb-8"
      >
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl lg:text-4xl font-extrabold text-ink leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm lg:text-base text-ink-light mt-1 truncate">{subtitle}</p>
          )}
        </div>
        {rightExtra && <div className="shrink-0">{rightExtra}</div>}
      </motion.div>
    </div>
  );
}
