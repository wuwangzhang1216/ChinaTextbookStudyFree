import { promises as fs } from "fs";
import path from "path";
import { PageHeader } from "@/components/PageHeader";
import { SoundLink } from "@/components/SoundLink";
import type { SiteIndex, SubjectId, Book } from "@/types";
import { SUBJECTS } from "@/lib/subjects";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  return [1, 2, 3, 4, 5, 6].map(g => ({ grade: String(g) }));
}

// 按学科分组 —— Duolingo 纯色块 + 代表字 + 厚底阴影
interface SubjectTheme {
  id: SubjectId;
  /** 卡片纯色主背景（Duolingo 官方色） */
  bg: string;
  /** 按下/底部阴影的深色（按钮阴影原理） */
  shadow: string;
  /** 代表字（圆形徽章内） */
  glyph: string;
  tagline: string;
}

// 全用 tailwind config 里配好的 Duolingo 动物色
const THEMES: Record<SubjectId, SubjectTheme> = {
  math: {
    id: "math",
    bg: "#58CC02",       // feather
    shadow: "#58A700",   // treeFrog
    glyph: "数",
    tagline: "加减乘除 · 逻辑推理",
  },
  chinese: {
    id: "chinese",
    bg: "#FF4B4B",       // cardinal
    shadow: "#EA2B2B",   // fire
    glyph: "语",
    tagline: "识字认词 · 阅读写作",
  },
  english: {
    id: "english",
    bg: "#1CB0F6",       // macaw
    shadow: "#1899D6",   // whale
    glyph: "A",
    tagline: "听说读写 · 启蒙英语",
  },
  science: {
    id: "science",
    bg: "#FFC800",       // bee
    shadow: "#E0A800",
    glyph: "科",
    tagline: "探索自然 · 动手实验",
  },
};

const SUBJECT_ORDER: SubjectId[] = ["math", "chinese", "english", "science"];

export default async function GradePage({ params }: { params: Promise<{ grade: string }> }) {
  const { grade } = await params;
  const gradeNum = Number(grade);
  const index = await getIndex();
  const allBooks = index.books.filter(b => b.grade === gradeNum);

  const gradeName = ["", "一", "二", "三", "四", "五", "六"][gradeNum];

  // 按学科分组 —— math/chinese/english/science
  const bySubject = new Map<SubjectId, Book[]>();
  for (const b of allBooks) {
    const sid = (b.subject ?? "math") as SubjectId;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(b);
  }
  // 单本内按学期：上册 → 下册
  for (const [, arr] of bySubject) {
    arr.sort((a, b) => (a.semester === "up" ? -1 : 1) - (b.semester === "up" ? -1 : 1));
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-8">
      <PageHeader
        backHref="/"
        title={`${gradeName}年级`}
        subtitle="选择学科 · 选择上册或下册"
      />
      <div className="w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl">

        <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-10">
          {SUBJECT_ORDER.map(subjectId => {
            const subjectBooks = bySubject.get(subjectId);
            if (!subjectBooks || subjectBooks.length === 0) return null;
            const theme = THEMES[subjectId];
            const subject = SUBJECTS[subjectId];

            return (
              <section key={subjectId}>
                {/* 学科分组 header */}
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div
                    className="w-1.5 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: theme.bg }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-base lg:text-xl font-extrabold text-ink">
                      {subject.label}
                    </div>
                    <div className="text-[11px] lg:text-xs text-ink-light mt-0.5">{theme.tagline}</div>
                  </div>
                </div>

                {/* 该学科的书本卡片 —— Duolingo 纯色块 + 厚底阴影 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-5">
                  {subjectBooks.map(book => (
                    <SoundLink
                      key={book.id}
                      href={`/book/${book.id}/`}
                      hapticIntensity="medium"
                      className="duo-chunky-card group relative block rounded-2xl lg:rounded-3xl select-none overflow-hidden"
                      style={{
                        backgroundColor: theme.bg,
                        boxShadow: `0 5px 0 0 ${theme.shadow}`,
                      }}
                    >
                      <div className="relative flex items-center gap-3 lg:gap-4 px-4 py-3.5 lg:px-5 lg:py-5">
                        {/* 白色圆形徽章内的代表字 —— Duolingo 技能气泡风 */}
                        <div
                          className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center shrink-0"
                          style={{
                            boxShadow: `inset 0 -3px 0 0 rgba(0,0,0,0.08)`,
                          }}
                        >
                          <span
                            className="text-2xl lg:text-3xl font-extrabold"
                            style={{ color: theme.bg }}
                          >
                            {theme.glyph}
                          </span>
                        </div>

                        {/* 白色文字右侧 */}
                        <div className="flex-1 min-w-0 text-white">
                          <div className="text-[10px] lg:text-xs font-extrabold uppercase tracking-widest opacity-80">
                            {subject.label}
                          </div>
                          <div className="text-base lg:text-xl font-extrabold leading-tight truncate mt-0.5">
                            {book.gradeName}
                            {book.semesterName}
                          </div>
                          <div className="text-[11px] lg:text-xs font-semibold opacity-85 mt-0.5 lg:mt-1">
                            {book.unitsCount} 单元 · {book.lessonsCount} 节小课
                          </div>
                        </div>

                        {/* 右侧箭头 */}
                        <div className="text-white/90 text-xl lg:text-2xl font-extrabold shrink-0 group-hover:translate-x-1 transition-transform">
                          ›
                        </div>
                      </div>

                      {/* 装饰：右上角的淡色大字光影（像 Duolingo 的背景水印） */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-2 -right-2 text-[80px] lg:text-[120px] font-extrabold leading-none select-none text-white"
                        style={{ opacity: 0.08 }}
                      >
                        {theme.glyph}
                      </span>
                    </SoundLink>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
