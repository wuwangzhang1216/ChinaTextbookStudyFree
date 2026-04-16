"use client";

/**
 * StateMessages —— 通用空状态 / 错误状态组件
 *
 * 用法：
 *   <EmptyState mood="cheer" title="还没有错题！" desc="..." action={<button>...</button>} />
 *   <ErrorState title="加载失败" desc="网络似乎断开了" onRetry={refetch} />
 *
 * 风格：
 *   - 居中布局，吉祥物 + 标题 + 描述 + 可选 CTA
 *   - 使用项目里已有的 Mascot + chunky 按钮
 *   - 自动尺寸适配桌面 / 移动
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Mascot, type MascotMood } from "./Mascot";
import { CloudOff } from "@/components/icons";

interface EmptyStateProps {
  /** 吉祥物心情；默认 cheer */
  mood?: MascotMood;
  title: string;
  desc?: string;
  /** 可选 CTA 按钮节点 */
  action?: ReactNode;
  /** 较小的内联模式（卡片内部用） */
  compact?: boolean;
}

export function EmptyState({
  mood = "cheer",
  title,
  desc,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-16"
      }`}
    >
      <Mascot mood={mood} size={compact ? 84 : 140} />
      <h2
        className={`font-extrabold text-ink mt-4 ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
      {desc && (
        <p className="text-ink-light mt-2 max-w-xs leading-relaxed text-sm">
          {desc}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

interface ErrorStateProps {
  title?: string;
  desc?: string;
  /** 重试回调；若提供则显示"再试一次"按钮 */
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({
  title = "出错了",
  desc = "好像网络断开了，稍后再试试看",
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-16"
      }`}
      role="alert"
    >
      <div
        className={`flex items-center justify-center rounded-full bg-danger/10 text-danger ${
          compact ? "w-16 h-16" : "w-24 h-24"
        }`}
      >
        <CloudOff className={compact ? "w-8 h-8" : "w-12 h-12"} />
      </div>
      <h2
        className={`font-extrabold text-ink mt-4 ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {title}
      </h2>
      {desc && (
        <p className="text-ink-light mt-2 max-w-xs leading-relaxed text-sm">
          {desc}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-chunky-primary mt-6 px-8"
        >
          再试一次
        </button>
      )}
    </motion.div>
  );
}
