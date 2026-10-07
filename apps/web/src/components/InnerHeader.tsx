import { ArrowLeft } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { cn } from "@/lib/cn";

/**
 * InnerHeader — 统一内页顶栏
 *
 * 用于所有二级页面（课文列表、故事列表、阅读器、答题等），
 * 确保返回按钮、标题、副标题、右侧插槽风格一致。
 *
 * 结构：  ← 返回  |  标题 + [badge]  |  右侧插槽
 *                  |  副标题          |
 *
 * flatOnDesktop：列表页入 AppShell 壳后传 true —— lg+ 退化为中央列内的
 * 普通标题行（去白底/边框/sticky/返回键，标题放大）；阅读器等沉浸页
 * 不传，保持原全宽 sticky 顶栏。
 */

interface InnerHeaderProps {
  backHref: string;
  title: string;
  subtitle?: string;
  /** 标题旁的小徽章 */
  badge?: React.ReactNode;
  /** 右侧插槽（进度、按钮等） */
  right?: React.ReactNode;
  /** 顶栏下方附加内容（进度条等） */
  bottom?: React.ReactNode;
  /** lg+ 退化为中央列内标题行（AppShell 壳内的列表页用） */
  flatOnDesktop?: boolean;
}

export function InnerHeader({
  backHref,
  title,
  subtitle,
  badge,
  right,
  bottom,
  flatOnDesktop = false,
}: InnerHeaderProps) {
  return (
    <div
      className={cn(
        "bg-white border-b border-bg-softer sticky top-0 z-10",
        flatOnDesktop && "lg:static lg:bg-transparent lg:border-0",
      )}
    >
      <div
        className={cn(
          "max-w-md lg:max-w-6xl mx-auto flex items-center gap-3 px-4 py-2.5",
          flatOnDesktop && "lg:max-w-none lg:px-0 lg:py-3",
        )}
      >
        <SoundLink
          href={backHref}
          aria-label="返回"
          className={cn(
            "inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0",
            flatOnDesktop && "lg:hidden",
          )}
        >
          <ArrowLeft className="w-5 h-5" />
        </SoundLink>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            {badge}
            <span
              className={cn(
                "text-sm lg:text-base font-extrabold text-ink truncate",
                flatOnDesktop && "lg:text-2xl",
              )}
            >
              {title}
            </span>
          </div>
          {subtitle && (
            <div
              className={cn(
                "text-[10px] lg:text-[11px] text-ink-light mt-1 leading-none truncate",
                flatOnDesktop && "lg:text-sm lg:mt-1.5",
              )}
            >
              {subtitle}
            </div>
          )}
        </div>
        {right ? (
          <div className="shrink-0">{right}</div>
        ) : (
          <div className={cn("w-10 shrink-0", flatOnDesktop && "lg:hidden")} />
        )}
      </div>
      {bottom}
    </div>
  );
}
