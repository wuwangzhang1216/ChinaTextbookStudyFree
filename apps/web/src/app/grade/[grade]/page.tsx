import { promises as fs } from "fs";
import path from "path";
import { StatsBar } from "@/components/StatsBar";
import { AppShell } from "@/components/layout/AppShell";
import { ChangeGradeButton } from "@/components/ChangeGradeButton";
import { ContinueLearningCard } from "@/components/ContinueLearningCard";
import type { SiteIndex } from "@/types";
import GradeBooks from "./GradeBooks";

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
  const allBooks = index.books.filter(b => b.grade === gradeNum && !b.supersededBy);

  const gradeName = ["", "一", "二", "三", "四", "五", "六"][gradeNum];

  return (
    <AppShell centerMaxWidth={840}>
    <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
      {/* 页头：移动端带 compact StatsBar；lg+ 由右栏 RightRail 常驻 HUD，不再重复 */}
      <div className="w-full max-w-3xl lg:max-w-none">
        <div className="shell-page-toolbar flex justify-end mb-4">
          <StatsBar compact />
        </div>
        <div className="flex items-end justify-between gap-3 mb-5 lg:mb-8">
          <h1 className="text-2xl lg:text-4xl font-extrabold text-ink leading-tight truncate">
            {gradeName}年级
          </h1>
          <div className="shrink-0">
            <ChangeGradeButton />
          </div>
        </div>
      </div>
      <ContinueLearningCard />
      <div className="w-full">

        <GradeBooks books={allBooks} />
      </div>
    </main>
    </AppShell>
  );
}
