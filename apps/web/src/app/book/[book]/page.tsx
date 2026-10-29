import { promises as fs } from "fs";
import path from "path";
import { SoundLink } from "@/components/SoundLink";
import { StatsBar } from "@/components/StatsBar";
import { AppShell } from "@/components/layout/AppShell";
import {
  ActiveBookSync,
  ContinueLearningCard,
  CurrentBookBadge,
} from "@/components/ContinueLearningCard";
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
  const gradeBooks = index.books.filter(b => b.grade === book.grade);

  return (
    <AppShell centerMaxWidth={720}>
    <main className="min-h-screen bg-bg lg:bg-transparent">
      {/* 访问即成为「当前教材」（首页据此直达本页） */}
      <ActiveBookSync bookId={bookId} grade={book.grade} />

      {/* 移动端顶栏：当前教材徽章（可换书） + stats */}
      <div className="shell-page-toolbar bg-white border-b border-bg-softer relative z-10">
        <div className="book-toolbar max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <CurrentBookBadge book={book} gradeBooks={gradeBooks} />
          <StatsBar compact />
        </div>
      </div>

      {/* 桌面端：当前教材徽章行 */}
      <div className="hidden xl:flex items-center mb-3">
        <CurrentBookBadge book={book} gradeBooks={gradeBooks} />
      </div>

      {/* 续学 CTA —— 有未完成课程会话时出现 */}
      <div className="max-w-md lg:max-w-none mx-auto px-4 lg:px-0 pt-3 lg:pt-0 empty:hidden">
        <ContinueLearningCard compact />
      </div>

      {/* 听读与故事入口统一由路径顶栏承载。 */}
      {book.schoolSystem === "5-4" && <p className="px-4 py-3 text-sm text-ink-light">
        五四制（小学五年） · {book.publisherLabel} · {book.sourceEdition}
      </p>}
      {book.supersededBy && <p className="p-4 text-sm text-ink-light">
        当前为旧版教材，原学习记录保留。
        <SoundLink href={`/book/${book.supersededBy}/`} className="ml-2 font-bold text-primary">进入新版教材 →</SoundLink>
      </p>}
      <BookPathSection bookId={bookId} outline={outline} book={book} />
    </main>
    </AppShell>
  );
}
