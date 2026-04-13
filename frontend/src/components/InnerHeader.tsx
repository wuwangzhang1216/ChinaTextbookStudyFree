import { ArrowLeft } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";

/**
 * InnerHeader — 统一内页顶栏
 *
 * 用于所有二级页面（课文列表、故事列表、阅读器、答题等），
 * 确保返回按钮、标题、副标题、右侧插槽风格一致。
 *
 * 结构：  ← 返回  |  标题 + [badge]  |  右侧插槽
 *                  |  副标题          |
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
}

export function InnerHeader({
  backHref,
  title,
  subtitle,
  badge,
  right,
  bottom,
}: InnerHeaderProps) {
  return (
    <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
      <div className="max-w-md lg:max-w-6xl mx-auto flex items-center gap-3 px-4 py-2.5">
        <SoundLink
          href={backHref}
          aria-label="返回"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </SoundLink>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            {badge}
            <span className="text-sm lg:text-base font-extrabold text-ink truncate">
              {title}
            </span>
          </div>
          {subtitle && (
            <div className="text-[10px] lg:text-[11px] text-ink-light mt-1 leading-none truncate">
              {subtitle}
            </div>
          )}
        </div>
        {right ? (
          <div className="shrink-0">{right}</div>
        ) : (
          <div className="w-10 shrink-0" />
        )}
      </div>
      {bottom}
    </div>
  );
}
