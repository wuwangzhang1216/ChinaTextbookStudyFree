import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Volume } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { SubjectBadge } from "@/components/SubjectBadge";
import type { BookPassages, SiteIndex } from "@/types";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getPassages(bookId: string): Promise<BookPassages | null> {
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "books",
    bookId,
    "passages.json",
  );
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const index = await getIndex();
  return index.books.filter(b => b.hasPassages).map(b => ({ book: b.id }));
}

export default async function ReadingListPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookId } = await params;
  const index = await getIndex();
  const book = index.books.find(b => b.id === bookId);
  if (!book) notFound();
  const doc = await getPassages(bookId);
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-bg-soft">
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3 gap-3">
          <SoundLink
            href={`/book/${bookId}/`}
            className="text-ink-light hover:text-primary shrink-0"
          >
            <ArrowLeft className="w-6 h-6" />
          </SoundLink>
          <div className="text-center flex-1 min-w-0">
            <div className="flex items-center justify-center gap-2">
              <SubjectBadge book={book} />
              <div className="text-base font-extrabold text-ink truncate">
                {book.textbookName}·课文
              </div>
            </div>
            <div className="text-xs text-ink-light mt-0.5">
              {doc.passages.length} 篇课文 · 听读 / 跟读
            </div>
          </div>
          <div className="w-6 shrink-0" />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-5 space-y-3">
        {doc.passages.map(p => {
          const audioReady = p.sentences.some(s => s.audio);
          return (
            <SoundLink
              key={p.id}
              href={`/reading/${bookId}/${p.id}/`}
              className="block rounded-2xl bg-white border border-bg-softer p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-ink truncate">
                    {p.title}
                  </div>
                  <div className="text-xs text-ink-light mt-0.5 truncate">
                    {p.author ? `${p.author} · ` : ""}
                    {p.sentences.length} 句
                    {!audioReady && " · 音频生成中"}
                  </div>
                </div>
                {audioReady && (
                  <Volume className="w-5 h-5 text-primary shrink-0" />
                )}
              </div>
            </SoundLink>
          );
        })}
      </div>
    </main>
  );
}
