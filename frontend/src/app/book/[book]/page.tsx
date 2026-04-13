import { promises as fs } from "fs";
import path from "path";
import { BookOpen } from "@/components/icons";
import { StatsBar } from "@/components/StatsBar";
import { SubjectBadge } from "@/components/SubjectBadge";
import { SoundLink } from "@/components/SoundLink";
import { InnerHeader } from "@/components/InnerHeader";
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
      <InnerHeader
        backHref={`/grade/${book.grade}/`}
        title={book.textbookName}
        subtitle={`${book.unitsCount} 单元 · ${book.lessonsCount} 节小课`}
        badge={<SubjectBadge book={book} />}
        right={
          <>
            <div className="lg:hidden"><StatsBar compact /></div>
            <div className="hidden lg:flex"><StatsBar /></div>
          </>
        }
      />

      {/* 移动端：课文听读 + 故事阅读小条（lg+ 隐藏，桌面端在右侧 sidebar 里） */}
      {(book.hasPassages || book.hasStories) && (
        <div className="lg:hidden max-w-md mx-auto px-4 pt-4 space-y-3">
          {book.hasPassages && (
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
          )}
          {book.hasStories && (
            <SoundLink
              href={`/stories/${bookId}/`}
              className="flex items-center gap-3 rounded-2xl bg-white border border-bg-softer p-3 hover:border-gold/40 transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-full bg-gold/10 text-gold inline-flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink">故事阅读</div>
                <div className="text-xs text-ink-light mt-0.5">
                  趣味故事 · 阅读理解
                </div>
              </div>
              <div className="shrink-0 text-xs text-gold font-bold">去读 →</div>
            </SoundLink>
          )}
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
            hasStories={!!book.hasStories}
          />
        </div>
      </div>
    </main>
  );
}
