import { promises as fs } from "fs";
import path from "path";
import { ArrowLeft, BookOpen } from "@/components/icons";
import { StatsBar } from "@/components/StatsBar";
import { SubjectBadge } from "@/components/SubjectBadge";
import { SoundLink } from "@/components/SoundLink";
import type { SiteIndex } from "@/types";
import type { BookOutlineWithLessons } from "./BookPathView";
import BookPathSection from "./BookPathSection";
import { BookSidebar } from "./BookSidebar";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getBookOutline(bookId: string): Promise<BookOutlineWithLessons> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "outline.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  const index = await getIndex();
  return index.books.map(b => ({ book: b.id }));
}

export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const { book: bookId } = await params;
  const index = await getIndex();
  const book = index.books.find(b => b.id === bookId);
  if (!book) return <div>未找到教材</div>;

  const outline = await getBookOutline(bookId);

  const lessonIds = outline.lessons.map(l => l.id);

  return (
    <main className="min-h-screen bg-bg-soft">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-md lg:max-w-6xl mx-auto px-4 py-2.5">
          {/* 单行：返回 + 标题 + stats */}
          <div className="flex items-center gap-2 lg:gap-3">
            <SoundLink
              href={`/grade/${book.grade}/`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0"
              aria-label="返回学科列表"
            >
              <ArrowLeft className="w-5 h-5" />
            </SoundLink>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-sm lg:text-base font-extrabold text-ink truncate">
                  {book.textbookName}
                </span>
                <SubjectBadge book={book} />
              </div>
              <div className="text-[10px] lg:text-[11px] text-ink-light mt-1 leading-none truncate">
                {book.unitsCount} 单元 · {book.lessonsCount} 节小课
              </div>
            </div>
            {/* 移动端 compact / 桌面端完整 */}
            <div className="lg:hidden shrink-0">
              <StatsBar compact />
            </div>
            <div className="hidden lg:flex shrink-0">
              <StatsBar />
            </div>
          </div>
        </div>
      </div>

      {/* 移动端：课文听读小条（lg+ 隐藏，桌面端在右侧 sidebar 里） */}
      {book.hasPassages && (
        <div className="lg:hidden max-w-md mx-auto px-4 pt-4">
          <SoundLink
            href={`/reading/${bookId}/`}
            className="flex items-center gap-3 rounded-2xl bg-white border border-bg-softer p-3 hover:border-primary/40 transition-colors"
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-ink">课文听读</div>
              <div className="text-xs text-ink-light mt-0.5">
                听老师范读 · 自己跟读练习
              </div>
            </div>
            <div className="shrink-0 text-xs text-primary font-bold">去听 →</div>
          </SoundLink>
        </div>
      )}

      {/* 桌面端 2 列：左路径 + 右侧边栏（sticky 跟随滚动）；移动端单列
       * 注意：grid 不能用 items-start，否则右 cell 高度会被压成内容高度，
       * sticky 就失去滚动范围。默认 stretch 让右 cell 跟左 cell 同高，
       * 内层 aside 的 sticky top-24 才能在整个路径长度内吸附。 */}
      <div className="max-w-md lg:max-w-6xl mx-auto lg:px-6 lg:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0">
          <BookPathSection bookId={bookId} outline={outline} />
        </div>
        <div className="hidden lg:block">
          <BookSidebar
            bookId={bookId}
            grade={book.grade}
            textbookName={book.textbookName}
            unitsCount={book.unitsCount}
            lessonIds={lessonIds}
            hasPassages={!!book.hasPassages}
          />
        </div>
      </div>
    </main>
  );
}
