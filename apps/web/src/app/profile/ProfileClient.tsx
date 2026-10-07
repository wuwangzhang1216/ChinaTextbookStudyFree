"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SoundLink } from "@/components/SoundLink";
import { motion } from "framer-motion";
import {
  useProgressStore,
  REPORT_KIND_LABELS,
  type QuestionReport,
} from "@/store/progress";
import { validateBackup, type BackupEnvelope } from "@cstf/core/backup";
import { Mascot } from "@/components/Mascot";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { StatsBar } from "@/components/StatsBar";
import { DailyGoalRing } from "@/components/DailyGoalRing";
import { DailyQuestsPanel } from "@/components/DailyQuestsPanel";
import { AchievementWall } from "@/components/AchievementWall";
import { WeeklyReportCard } from "@/components/WeeklyReportCard";
import { AppShell } from "@/components/layout/AppShell";
import {
  ArrowLeft,
  Lightning,
  Flame,
  Star,
  Crown,
  Snowflake,
  Bookmark,
  Gem,
} from "@/components/icons";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ProfileClient() {
  const xp = useProgressStore(s => s.xp);
  const streak = useProgressStore(s => s.streak);
  const freezes = useProgressStore(s => s.streakFreezes);
  const completedLessons = useProgressStore(s => s.completedLessons);
  const mistakes = useProgressStore(s => s.mistakesBank);
  const lifetimeGems = useProgressStore(s => s.lifetimeGems);
  const dailyTimeLimitMs = useProgressStore(s => s.dailyTimeLimitMs);
  const setDailyTimeLimit = useProgressStore(s => s.setDailyTimeLimit);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  function pickLimit(min: number) {
    playSfx("tap");
    haptic("light");
    setDailyTimeLimit(min * 60_000);
  }

  const completedCount = hydrated ? Object.keys(completedLessons).length : 0;
  const totalStars = hydrated
    ? Object.values(completedLessons).reduce((acc, r) => acc + r.stars, 0)
    : 0;
  const mistakesCount = hydrated ? mistakes.length : 0;

  return (
    <AppShell right={null} centerMaxWidth={920}>
    <main className="min-h-screen bg-bg-soft lg:bg-transparent relative">
      {/* Header —— 移动端白底 sticky；桌面端简化为 标题 + compact HUD */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10 lg:bg-transparent lg:border-0 lg:static lg:mb-2">
        <div className="max-w-2xl lg:max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-0 lg:py-2">
          <SoundLink
            href="/"
            aria-label="返回"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0 lg:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </SoundLink>
          <div className="flex-1 min-w-0 text-center lg:hidden">
            <div className="text-base font-extrabold text-ink truncate">我的主页</div>
          </div>
          <div className="hidden lg:block flex-1" />
          <div className="shrink-0">
            <StatsBar compact />
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 py-8">
        {/* 📋 每日任务（移动端专属入口；桌面端在首页右栏 RightRail 展示同一组件） */}
        <div className="lg:hidden mb-6">
          <DailyQuestsPanel />
        </div>

        {/* 顶部：聪聪 + 问候 + 每日目标环 */}
        <div className="flex items-center gap-6 mb-8">
          <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
          >
            <Mascot mood="wave" size={120} />
          </motion.div>
          <div className="flex-1">
            <div className="text-sm text-ink-light">欢迎回来</div>
            <div className="text-2xl font-extrabold text-ink">聪明的同学</div>
            <div className="text-sm text-ink-light mt-1">
              {hydrated && streak > 0 ? `已连续学习 ${streak} 天` : "开始你的学习之旅"}
            </div>
          </div>
          <DailyGoalRing size={100} />
        </div>

        {/* 统计卡片网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard
            icon={<Lightning className="w-6 h-6" />}
            label="总经验"
            value={hydrated ? xp.toString() : "0"}
            color="text-secondary"
          />
          <StatCard
            icon={<Flame className="w-6 h-6" />}
            label="连续天数"
            value={hydrated ? streak.toString() : "0"}
            color="text-warning"
          />
          <StatCard
            icon={<Crown className="w-6 h-6" />}
            label="完成课程"
            value={completedCount.toString()}
            color="text-primary"
          />
          <StatCard
            icon={<Star className="w-6 h-6 fill-current" />}
            label="获得星星"
            value={totalStars.toString()}
            color="text-gold"
          />
        </div>

        {/* 桌面 2x2 网格：商店 / 成就 / 错题本 / 家长设置 */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-5">
        {/* 累计宝石 + 商店入口 */}
        <SoundLink
          href="/shop"
          hapticIntensity="medium"
          className="group flex items-center gap-4 bg-white rounded-3xl border-2 border-secondary/30 p-5 mb-6 lg:mb-0 hover:border-secondary transition-colors"
          style={{ boxShadow: "0 4px 0 0 #d8b4fe" }}
        >
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center group-hover:bg-secondary group-hover:text-white transition-colors">
            <Gem className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-extrabold text-ink">聪聪衣橱</div>
            <div className="text-sm text-ink-light">
              累计获得 <span className="font-extrabold text-secondary-dark">{hydrated ? lifetimeGems : 0}</span> 颗宝石 · 去给聪聪换装吧
            </div>
          </div>
          <div className="text-ink-softer text-xl">›</div>
        </SoundLink>

        {/* 本周报告 */}
        <div className="mb-6 lg:mb-0">
          {hydrated && <WeeklyReportCard />}
        </div>

        {/* 连胜护盾小卡片 */}
        <section
          className="bg-white rounded-3xl border-2 border-bg-softer p-5 mb-6 lg:mb-0"
          style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
        >
          <div className="text-base font-extrabold text-ink mb-3">连胜护盾</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
              <Snowflake className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-ink">
                剩余 <span className="text-secondary tabular-nums">{hydrated ? freezes : 0}</span> 个
              </div>
              <div className="text-xs text-ink-light">周一自动补给一个 · 防止连胜中断</div>
            </div>
          </div>
        </section>

        {/* 成就墙（占满整行） */}
        <div className="lg:col-span-2 mb-6 lg:mb-0">
          {hydrated && <AchievementWall />}
        </div>

        {/* 快速入口 */}
        <SoundLink
          href="/review"
          hapticIntensity="medium"
          className="group flex items-center gap-4 bg-white rounded-3xl border-2 border-bg-softer p-5 hover:border-primary transition-colors mb-6 lg:mb-0"
          style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <Bookmark className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-extrabold text-ink">错题本</div>
            <div className="text-sm text-ink-light">
              {mistakesCount > 0 ? `${mistakesCount} 道题待复习` : "暂无错题"}
            </div>
          </div>
          <div className="text-ink-softer text-xl">›</div>
        </SoundLink>

        {/* 外观：免费深色模式三态开关（跟随系统 / 亮 / 暗） */}
        <section
          className="bg-white rounded-3xl border-2 border-bg-softer p-5 mb-6 lg:mb-0"
          style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-base font-extrabold text-ink">外观 · 深色模式</div>
          </div>
          <div className="text-xs text-ink-light mb-3">
            跟随系统自动切换，或手动选择亮色 / 暗色 · 免费使用
          </div>
          <ThemeModeToggle />
        </section>

        {/* 家长设置：每日学习时间上限（默认关闭，家长自愿启用） */}
        <section
          className="bg-white rounded-3xl border-2 border-bg-softer p-5"
          style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-base font-extrabold text-ink">家长设置 · 每日时间上限</div>
            <span className="text-[10px] text-ink-softer uppercase tracking-wider">
              防沉迷
            </span>
          </div>
          <div className="text-xs text-ink-light mb-3">
            达到上限后会暂停新课程，鼓励休息眼睛 · 不影响已开始的课程
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { label: "不限制", min: 0 },
              { label: "20 分钟", min: 20 },
              { label: "30 分钟", min: 30 },
              { label: "45 分钟", min: 45 },
              { label: "60 分钟", min: 60 },
            ] as const).map(opt => {
              const active = hydrated && dailyTimeLimitMs === opt.min * 60_000;
              return (
                <button
                  key={opt.min}
                  type="button"
                  onClick={() => pickLimit(opt.min)}
                  className={`h-9 px-4 inline-flex items-center rounded-2xl text-sm font-extrabold border-2 transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-ink-light border-bg-softer hover:border-primary/40"
                  }`}
                  style={
                    active
                      ? { boxShadow: "0 3px 0 0 #58A700" }
                      : { boxShadow: "0 2px 0 0 var(--shadow-card-color)" }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 💾 数据 · 存档备份（E2）：导出 / 导入，BackupEnvelope v1 双端互通 */}
        <BackupSection />

        {/* 🚩 已报告的问题（E2）：本地列表 + 一键导出 */}
        <div className="lg:col-span-2 mt-6 lg:mt-0">
          {hydrated && <ReportsSection />}
        </div>
        </div>
      </div>
    </main>
    </AppShell>
  );
}

// ============================================================
// 💾 数据 · 存档备份（E2）
// ============================================================

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function todayFileStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BackupSection() {
  const toast = useToast();
  const exportBackup = useProgressStore(s => s.exportBackup);
  const importBackup = useProgressStore(s => s.importBackup);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 待确认的导入信封（validateBackup 已通过）
  const [pending, setPending] = useState<{
    envelope: BackupEnvelope;
    repairs: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  function handleExport() {
    playSfx("tap");
    haptic("medium");
    const envelope = exportBackup();
    downloadJson(envelope, `cstf-backup-${todayFileStamp()}.json`);
    toast.success("存档已导出，收好这个文件哦", 3200);
  }

  async function handleFilePicked(file: File | null) {
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("这个文件打不开，不是有效的存档文件");
      return;
    }
    const result = validateBackup(parsed);
    if (!result.ok || !result.data) {
      toast.error(`导入失败：${result.errors[0] ?? "存档内容损坏"}`);
      return;
    }
    playSfx("tap");
    haptic("light");
    setPending({ envelope: result.data, repairs: result.errors });
  }

  function handleConfirmImport() {
    if (!pending || importing) return;
    setImporting(true);
    playSfx("unlock");
    haptic("success");
    importBackup(pending.envelope);
    toast.success("存档导入成功，正在刷新…", 2400);
    // 全量刷新：让所有页面 / watcher 基于新进度重算
    window.setTimeout(() => window.location.reload(), 800);
  }

  const d = pending?.envelope.data;
  const pendingLessons = d ? Object.keys(d.completedLessons).length : 0;
  const exportedDate = pending?.envelope.exportedAt
    ? new Date(pending.envelope.exportedAt).toLocaleDateString("zh-CN")
    : "未知时间";

  return (
    <section
      className="bg-white rounded-3xl border-2 border-bg-softer p-5 mt-6 lg:mt-0"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-base font-extrabold text-ink">数据 · 存档备份</div>
        <span className="text-[10px] text-ink-softer uppercase tracking-wider">
          手机电脑互通
        </span>
      </div>
      <div className="text-xs text-ink-light mb-3">
        导出一个存档文件保存好；换设备或换到 iPhone 上，导入就能接着学
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="h-10 px-4 inline-flex items-center gap-1.5 rounded-2xl text-sm font-extrabold border-2 bg-primary text-white border-primary"
          style={{ boxShadow: "0 3px 0 0 #58A700" }}
        >
          📤 导出存档
        </button>
        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            fileInputRef.current?.click();
          }}
          className="h-10 px-4 inline-flex items-center gap-1.5 rounded-2xl text-sm font-extrabold border-2 bg-white text-ink-light border-bg-softer hover:border-primary/40 transition-colors"
          style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
        >
          📥 导入存档
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            void handleFilePicked(e.target.files?.[0] ?? null);
            e.target.value = ""; // 同一文件可重复选择
          }}
        />
      </div>

      {/* 导入确认弹层：覆盖警告 + 存档摘要 */}
      <Modal
        open={pending !== null}
        onClose={() => (importing ? undefined : setPending(null))}
        ariaLabel="确认导入存档"
      >
        <div className="flex flex-col items-center text-center">
          <Mascot mood="surprise" size={96} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">确认导入这个存档？</h2>
          <p className="text-ink-light mt-2 text-sm">
            导入会<span className="font-extrabold text-danger">覆盖当前全部进度</span>
            ，建议先点「导出存档」备份一份再导入。
          </p>
          {pending && (
            <div className="mt-4 w-full rounded-2xl bg-bg-soft border-2 border-bg-softer p-3 text-left text-xs text-ink-light space-y-1">
              <div>
                来源：{pending.envelope.platform === "ios" ? "iPhone / iPad" : "网页版"} ·
                导出于 {exportedDate}
              </div>
              <div>
                进度：{pendingLessons} 节完成课程 · {d?.xp ?? 0} XP ·
                连胜 {d?.streak ?? 0} 天 · {d?.gems ?? 0} 宝石
              </div>
              {pending.repairs.length > 0 && (
                <div className="text-warning">
                  有 {pending.repairs.length} 个小问题已自动修复，不影响导入
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 w-full mt-5">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className={importing ? "btn-chunky-disabled w-full" : "btn-chunky-danger w-full"}
            >
              {importing ? "导入中…" : "覆盖并导入"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (importing) return;
                playSfx("tap");
                setPending(null);
              }}
              className="btn-chunky-ghost w-full"
            >
              取消
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

// ============================================================
// 🚩 已报告的问题（E2）
// ============================================================

function ReportsSection() {
  const toast = useToast();
  const reports = useProgressStore(s => s.reports);
  // 最近的排最前
  const sorted = [...reports].reverse();
  const shown = sorted.slice(0, 20);

  function handleExport() {
    playSfx("tap");
    haptic("medium");
    downloadJson(reports, `cstf-reports-${todayFileStamp()}.json`);
    toast.success("反馈记录已导出", 2800);
  }

  return (
    <section
      className="bg-white rounded-3xl border-2 border-bg-softer p-5"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
      aria-label="已报告的问题"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-base font-extrabold text-ink">已报告的问题</div>
        {reports.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="h-8 px-3 inline-flex items-center gap-1 rounded-xl text-xs font-extrabold border-2 bg-white text-ink-light border-bg-softer hover:border-primary/40 transition-colors"
            style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
          >
            📤 导出
          </button>
        )}
      </div>
      <div className="text-xs text-ink-light mb-3">
        答题时点小旗子 🚩 报告的题目问题都在这里 · 只保存在本机，不会上传
      </div>

      {reports.length === 0 ? (
        <div className="text-sm text-ink-softer py-4 text-center">
          还没有报告过问题，发现疑问时，可以在题目旁告诉聪聪。
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r: QuestionReport) => (
            <li
              key={r.id}
              className="rounded-2xl border-2 border-bg-softer bg-bg-soft/60 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[10px] font-extrabold shrink-0">
                  {REPORT_KIND_LABELS[r.kind]}
                </span>
                <span className="text-[10px] text-ink-softer ml-auto shrink-0 tabular-nums">
                  {new Date(r.createdAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <div className="text-xs text-ink mt-1.5 line-clamp-2 leading-snug">
                {r.questionText || "（无题干快照）"}
              </div>
              <div className="text-[10px] text-ink-softer mt-1">
                课程 {r.lessonId} · 题目 #{r.questionId}
                {r.answerGiven ? ` · 当时作答：${r.answerGiven.slice(0, 24)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > shown.length && (
        <div className="text-[11px] text-ink-softer mt-2 text-center">
          只显示最近 {shown.length} 条，导出可以看到全部 {reports.length} 条
        </div>
      )}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border-2 border-bg-softer p-4"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className={`${color}`}>{icon}</div>
      <div className="text-2xl font-extrabold text-ink mt-2 tabular-nums leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold mt-1.5">{label}</div>
    </motion.div>
  );
}

