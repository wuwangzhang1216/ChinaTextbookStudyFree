"use client";

/**
 * SubjectBadge — 学科徽章
 *
 * 显示学科名（数学 / 语文 / 英语...）的彩色胶囊，
 * 根据学科配置自动选取颜色。
 */

import type { Book } from "@/types";
import { resolveSubject } from "@/lib/subjects";

interface SubjectBadgeProps {
  book: Pick<Book, "subject">;
  size?: "sm" | "md";
  className?: string;
}

export function SubjectBadge({ book, size = "sm", className }: SubjectBadgeProps) {
  const subject = resolveSubject(book);
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 font-extrabold ${sizeClass} ${subject.badgeClasses} ${className ?? ""}`}
    >
      {subject.label}
    </span>
  );
}
