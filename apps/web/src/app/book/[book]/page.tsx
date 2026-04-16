import { promises as fs } from "fs";
import path from "path";
import { BookOpen } from "@/components/icons";
import { StatsBar } from "@/components/StatsBar";
import { SoundLink } from "@/components/SoundLink";
import { AppShell } from "@/components/layout/AppShell";
import type { SiteIndex } from "@/types";
import type { BookOutlineWithLessons } from "./BookPathView";
import BookPathSection from "./BookPathSection";

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

  return (
    <AppShell centerMaxWidth={720}>
    <main className="min-h-screen bg-bg-soft lg:bg-transparent">
      {/* 移动端 stats 顶栏：返回和教材/单元信息已并入 PathMap sticky banner */}
      <div className="lg:hidden bg-white border-b border-bg-softer sticky top-0 z-30">
        <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-end">
          <StatsBar compact />
        </div>
      </div>

      {/* 移动端：课文听读 + 故事阅读小条 */}
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

      {/* 单元路径 —— 桌面端的课文/故事入口由 PathMap 的 topSlot 承载，随 sticky banner 一起吸附 */}
      <BookPathSection bookId={bookId} outline={outline} book={book} />
    </main>
    </AppShell>
  );
}
