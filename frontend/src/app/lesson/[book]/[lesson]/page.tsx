import { promises as fs } from "fs";
import path from "path";
import type { Lesson, SiteIndex } from "@/types";
import LessonPageClient from "./LessonPageClient";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getOutline(bookId: string) {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "outline.json");
  return JSON.parse(await fs.readFile(p, "utf-8")) as { lessons: { id: string }[] };
}

async function getLesson(bookId: string, lessonId: string): Promise<Lesson> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "lessons", `${lessonId}.json`);
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  const index = await getIndex();
  const params: { book: string; lesson: string }[] = [];
  for (const book of index.books) {
    const outline = await getOutline(book.id);
    for (const l of outline.lessons) {
      params.push({ book: book.id, lesson: l.id });
    }
  }
  return params;
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ book: string; lesson: string }>;
}) {
  const { book, lesson: lessonId } = await params;
  const lesson = await getLesson(book, lessonId);
  return <LessonPageClient lesson={lesson} />;
}
