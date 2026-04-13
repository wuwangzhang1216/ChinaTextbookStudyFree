import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { BookOpen, Volume } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { SubjectBadge } from "@/components/SubjectBadge";
import { InnerHeader } from "@/components/InnerHeader";
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

const KIND_LABEL: Record<string, string> = {
  ancient_poem: "古诗",
  poem: "现代诗",
  prose: "散文",
  story: "故事",
  song: "歌谣",
  dialogue: "对话",
};

/** Pick the "main" page image — the one matching pdfPage, or middle of array */
function pickCoverImage(
  pageImages: string[] | undefined,
  pdfPage: number | null | undefined,
): string | null {
  if (!pageImages || pageImages.length === 0) return null;
  if (pdfPage) {
    const match = pageImages.find(p => p.includes(`/p${pdfPage}.jpg`));
    if (match) return match;
  }
  return pageImages[Math.floor(pageImages.length / 2)] ?? null;
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
      <InnerHeader
        backHref={`/book/${bookId}/`}
        title={`${book.textbookName}·课文`}
        subtitle={`${doc.passages.length} 篇课文 · 听读 / 跟读`}
        badge={<SubjectBadge book={book} />}
      />

      <div className="max-w-md lg:max-w-4xl mx-auto px-4 py-5 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
        {doc.passages.map(p => {
          const audioReady = p.sentences.some(s => s.audio);
          const kindLabel = KIND_LABEL[p.kind] ?? "";
          const cover = pickCoverImage(p.pageImages, p.pdfPage);
          return (
            <SoundLink
              key={p.id}
              href={`/reading/${bookId}/${p.id}/`}
              className="block rounded-2xl bg-white border border-bg-softer overflow-hidden hover:border-primary/40 transition-colors"
            >
              {/* Textbook page cover — cropped to top portion */}
              {cover && (
                <div className="w-full aspect-[2/1] overflow-hidden bg-bg-softer">
                  <img
                    src={cover}
                    alt={p.title}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 p-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-ink truncate">
                    {p.title}
                  </div>
                  <div className="text-xs text-ink-light mt-0.5 truncate">
                    {p.author ? `${p.author} · ` : ""}
                    {kindLabel ? `${kindLabel} · ` : ""}
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
