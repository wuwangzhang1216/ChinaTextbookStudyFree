import { promises as fs } from "fs";
import path from "path";
import { ArrowLeft, BookOpen } from "@/components/icons";
import { StatsBar } from "@/components/StatsBar";
import { SubjectBadge } from "@/components/SubjectBadge";
import { SoundLink } from "@/components/SoundLink";
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
    <main className="min-h-screen bg-bg-soft">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          {/* Row 1: back + title */}
          <div className="flex items-center gap-3">
            <SoundLink href={`/grade/${book.grade}/`} className="text-ink-light hover:text-primary shrink-0">
              <ArrowLeft className="w-6 h-6" />
            </SoundLink>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SubjectBadge book={book} />
                <div className="text-base font-extrabold text-ink truncate">{book.textbookName}</div>
              </div>
              <div className="text-xs text-ink-light mt-0.5">
                {book.unitsCount} 单元 · {book.lessonsCount} 节小课
              </div>
            </div>
          </div>
          {/* Row 2: stats */}
          <div className="flex justify-end mt-2">
            <StatsBar />
          </div>
        </div>
      </div>

      {book.hasPassages && (
        <div className="max-w-md mx-auto px-4 pt-4">
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

      <BookPathSection bookId={bookId} outline={outline} />
    </main>
  );
}
