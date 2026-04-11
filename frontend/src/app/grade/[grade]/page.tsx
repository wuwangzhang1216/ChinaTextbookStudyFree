import { promises as fs } from "fs";
import path from "path";
import { ArrowLeft, Book } from "@/components/icons";
import { StatsBar } from "@/components/StatsBar";
import { SubjectBadge } from "@/components/SubjectBadge";
import { SoundLink } from "@/components/SoundLink";
import type { SiteIndex } from "@/types";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  return [1, 2, 3, 4, 5, 6].map(g => ({ grade: String(g) }));
}

export default async function GradePage({ params }: { params: Promise<{ grade: string }> }) {
  const { grade } = await params;
  const gradeNum = Number(grade);
  const index = await getIndex();
  const books = index.books.filter(b => b.grade === gradeNum);

  const gradeName = ["", "一", "二", "三", "四", "五", "六"][gradeNum];

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 relative">
      <div className="absolute top-4 right-4">
        <StatsBar />
      </div>
      <div className="w-full max-w-3xl">
        <SoundLink
          href="/"
          className="inline-flex items-center gap-2 text-ink-light hover:text-primary mb-8"
        >
          <ArrowLeft className="w-5 h-5" /> 返回首页
        </SoundLink>

        <h1 className="text-3xl font-extrabold text-ink mb-2">{gradeName}年级</h1>
        <p className="text-ink-light mb-8">选择上册或下册</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {books.map(book => (
            <SoundLink
              key={book.id}
              href={`/book/${book.id}/`}
              hapticIntensity="medium"
              className="group bg-white rounded-3xl border-2 border-bg-softer p-6 hover:border-primary transition-colors"
              style={{ boxShadow: "0 4px 0 0 #e5e5e5" }}
            >
              <div className="flex items-start justify-between mb-3">
                <Book className="w-10 h-10 text-ink-light group-hover:text-primary transition-colors" />
                <SubjectBadge book={book} size="md" />
              </div>
              <div className="text-xl font-extrabold text-ink">
                {book.gradeName}
                {book.semesterName}
              </div>
              <div className="text-sm text-ink-light mt-2">
                {book.unitsCount} 个单元 · {book.lessonsCount} 节小课
              </div>
            </SoundLink>
          ))}
        </div>
      </div>
    </main>
  );
}
