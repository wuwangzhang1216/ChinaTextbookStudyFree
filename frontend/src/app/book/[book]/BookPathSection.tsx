"use client";

import dynamic from "next/dynamic";
import type { Book } from "@/types";
import type { BookOutlineWithLessons } from "./BookPathView";

const BookPathView = dynamic(
  () => import("./BookPathView").then(m => ({ default: m.BookPathView })),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-md lg:max-w-3xl mx-auto px-4 mt-4">
        <div className="h-[60vh] rounded-3xl bg-bg-softer/40 animate-pulse" />
      </div>
    ),
  },
);

export default function BookPathSection({
  bookId,
  outline,
  book,
}: {
  bookId: string;
  outline: BookOutlineWithLessons;
  book: Book;
}) {
  return <BookPathView bookId={bookId} outline={outline} book={book} />;
}
