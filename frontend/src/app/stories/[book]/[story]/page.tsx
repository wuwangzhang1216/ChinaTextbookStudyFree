import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { BookStories, SiteIndex } from "@/types";
import StoryReaderClient from "./StoryReaderClient";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getStories(bookId: string): Promise<BookStories | null> {
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "books",
    bookId,
    "stories.json",
  );
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const index = await getIndex();
  const params: { book: string; story: string }[] = [];
  for (const book of index.books) {
    if (!book.hasStories) continue;
    const doc = await getStories(book.id);
    if (!doc) continue;
    for (const s of doc.stories) {
      params.push({ book: book.id, story: s.id });
    }
  }
  return params;
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ book: string; story: string }>;
}) {
  const { book: bookId, story: storyId } = await params;
  const doc = await getStories(bookId);
  if (!doc) notFound();
  const story = doc.stories.find(s => s.id === storyId);
  if (!story) notFound();

  return (
    <StoryReaderClient
      story={story}
      backHref={`/stories/${bookId}/`}
    />
  );
}
