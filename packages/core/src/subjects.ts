import type { SubjectId, Book } from "./types";

/**
 * 学科配置 —— 每个学科都有显示名称、配色和 Tailwind 类名。
 * 新增学科只需要加一条即可。
 */

export interface SubjectConfig {
  id: SubjectId;
  label: string;
  /** 徽章：边框 / 背景 / 文字 Tailwind 类 */
  badgeClasses: string;
  /** 主色（用于图标等强调场景） */
  accent: "primary" | "danger" | "secondary" | "warning";
}

export const SUBJECTS: Record<SubjectId, SubjectConfig> = {
  math: {
    id: "math",
    label: "数学",
    badgeClasses: "border-primary/40 bg-primary/10 text-primary-dark",
    accent: "primary",
  },
  chinese: {
    id: "chinese",
    label: "语文",
    badgeClasses: "border-danger/40 bg-danger/10 text-danger-dark",
    accent: "danger",
  },
  english: {
    id: "english",
    label: "英语",
    badgeClasses: "border-secondary/40 bg-secondary/10 text-secondary-dark",
    accent: "secondary",
  },
  science: {
    id: "science",
    label: "科学",
    badgeClasses: "border-warning/40 bg-warning/10 text-ink",
    accent: "warning",
  },
};

/** 容错：老数据可能没有 subject 字段，默认返回 math */
export function resolveSubject(book: Pick<Book, "subject">): SubjectConfig {
  const id: SubjectId = book.subject ?? "math";
  return SUBJECTS[id] ?? SUBJECTS.math;
}
