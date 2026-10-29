"use client";

/**
 * PathMap — 多邻国式蛇形学习路径
 *
 * - 顶部 sticky banner：随滚动切换显示当前可见单元（不同 unit 不同颜色）
 * - 单元之间用细分隔条（横线 + 居中标题），不再用大 SectionCard
 * - 节点蛇形左右摆动 (snake offset)
 * - 节点状态：completed / current / locked
 * - 每 N 课插入宝箱节点
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowLeft, Lightning, Lock, Star, Crown, Chest, Book, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { LessonStartModal } from "./LessonStartModal";
import { ChestModal } from "./ChestModal";
import { Mascot } from "./Mascot";
import { SoundLink } from "./SoundLink";
import { useToast } from "./Toast";
import {
  computeChestsForBook,
  rollChestReward,
  type ChestSlot,
  type ChestRewardTier,
} from "@/lib/chestLogic";
import { useProgressStore } from "@/store/progress";
import type { PathLessonMeta, LessonStatus } from "@cstf/core";

export type { PathLessonMeta, LessonStatus };

/**
 * 单元挑战节点（⚔️ exam 课）的展示元数据 —— 由 BookPathView
 * 按「该单元全部普通课完成 → 解锁」的规则计算好传入。
 */
export interface ExamNodeMeta {
  lessonId: string;
  questionCount: number;
  /** 该单元全部普通课已完成 → 可挑战 */
  unlocked: boolean;
  /** 已通关（completedLessons 有记录） */
  completed: boolean;
  /** accuracy ≥ 0.8 → 征服（奖杯金色态） */
  conquered: boolean;
}

interface PathMapProps {
  bookId: string;
  lessons: PathLessonMeta[];
  /** lessonId → status */
  statuses: Record<string, LessonStatus>;
  /** lessonId → 星数 (1-3) */
  stars?: Record<string, number>;
  /** 教材标签（如 "数学 · 一年级下册"），并入 sticky banner 顶部，替代独立的页面 header */
  headerLabel?: ReactNode;
  /** 是否展示 GUIDEBOOK 按钮；点击跳到 /book/{bookId}/guide/{activeUnitNum}/ */
  hasGuide?: boolean;
  /** ← 返回按钮目标路径；不传则不渲染返回按钮 */
  backHref?: string;
  /** 在 sticky banner 上方渲染的插槽内容（随 banner 一起 sticky） */
  topSlot?: ReactNode;
  /** 单元挑战节点：unitNumber → meta（缺省 = 该单元没有挑战课） */
  exams?: Record<number, ExamNodeMeta>;
}

type UnitItem =
  | { kind: "lesson"; lesson: PathLessonMeta }
  | { kind: "chest"; slot: ChestSlot }
  | { kind: "exam"; unitNumber: number; unitTitle: string; meta: ExamNodeMeta };

interface ActiveChestState {
  slot: ChestSlot;
  /** 本次开箱抽到的奖励 */
  gems: number;
  /** 奖励档位（common/rare/epic）—— ChestModal 按档位分层演出 */
  tier: ChestRewardTier;
}

/** A course keeps one accent; section labels distinguish units. */
const COURSE_COLOR = { bg: "#58CC02", shadow: "#58A700" };
function unitColor(_index: number) { return COURSE_COLOR; }

export function PathMap({
  bookId,
  lessons,
  statuses,
  stars = {},
  headerLabel,
  hasGuide,
  backHref,
  topSlot,
  exams,
}: PathMapProps) {
  const [activeLesson, setActiveLesson] = useState<PathLessonMeta | null>(null);
  const [activeChest, setActiveChest] = useState<ActiveChestState | null>(null);
  // 点开的单元挑战（弹 LessonStartModal 挑战版）
  const [activeExam, setActiveExam] = useState<{
    meta: ExamNodeMeta;
    unitNumber: number;
  } | null>(null);
  const toast = useToast();

  const claimedChests = useProgressStore(s => s.claimedChests);
  const addGems = useProgressStore(s => s.addGems);
  const claimChest = useProgressStore(s => s.claimChest);

  // 宝箱插槽：每 N 课一个，稳定 id
  const chestSlots = useMemo(() => computeChestsForBook(bookId, lessons), [bookId, lessons]);
  const chestByAfterLesson = useMemo(() => {
    const m = new Map<string, ChestSlot>();
    for (const c of chestSlots) m.set(c.afterLessonId, c);
    return m;
  }, [chestSlots]);

  // 按单元分组，合并 lesson + chest 为一个 unitItems 列表；
  // 单元末尾追加 ⚔️ 挑战节点（该单元有 exam 课时）
  const byUnit = useMemo(() => {
    const map = new Map<number, { title: string; label?: string; items: UnitItem[] }>();
    for (const l of lessons) {
      if (!map.has(l.unitNumber)) map.set(l.unitNumber, { title: l.unitTitle, label: l.unitLabel, items: [] });
      map.get(l.unitNumber)!.items.push({ kind: "lesson", lesson: l });
      const chest = chestByAfterLesson.get(l.id);
      if (chest) {
        map.get(l.unitNumber)!.items.push({ kind: "chest", slot: chest });
      }
    }
    if (exams) {
      for (const [unitNum, group] of map) {
        const meta = exams[unitNum];
        if (meta) {
          group.items.push({
            kind: "exam",
            unitNumber: unitNum,
            unitTitle: group.title,
            meta,
          });
        }
      }
    }
    return map;
  }, [lessons, chestByAfterLesson, exams]);

  const unitEntries = useMemo(() => Array.from(byUnit.entries()), [byUnit]);

  // sticky banner：跟随滚动指示当前可见的单元
  const sectionRefs = useRef(new Map<number, HTMLDivElement | null>());
  const [activeUnitNum, setActiveUnitNum] = useState<number>(unitEntries[0]?.[0] ?? 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      entries => {
        // 找到所有 isIntersecting 的 unit，取最靠上的那个
        const visible = entries
          .filter(e => e.isIntersecting)
          .map(e => Number((e.target as HTMLElement).dataset.unit ?? "0"))
          // Printed unit numbers can follow preparation/activity IDs such as101.
          .sort((a, b) => unitEntries.findIndex(([n]) => n === a) - unitEntries.findIndex(([n]) => n === b));
        if (visible.length > 0) {
          setActiveUnitNum(visible[0]);
        }
      },
      {
        // 观察"进入屏幕上半部分"的元素
        rootMargin: "-80px 0px -55% 0px",
        threshold: 0,
      },
    );
    sectionRefs.current.forEach(el => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [unitEntries]);

  function handleChestClick(slot: ChestSlot) {
    const afterStatus = statuses[slot.afterLessonId];
    const unlocked = afterStatus === "completed";
    if (!unlocked) {
      playSfx("tap");
      haptic("light");
      return;
    }
    playSfx("tap");
    haptic("medium");
    if (claimedChests[slot.id]) {
      // 已领取的宝箱不再进入开箱流程（避免开出 +0 的挫败感）
      toast.info("这个宝箱已经开过啦");
      return;
    }
    const reward = rollChestReward();
    claimChest(slot.id);
    addGems(reward.gems);
    setActiveChest({ slot, gems: reward.gems, tier: reward.tier });
  }

  function handleExamClick(unitNumber: number, meta: ExamNodeMeta) {
    if (!meta.unlocked) {
      playSfx("tap");
      haptic("light");
      toast.info("先完成本单元全部课程，就能开启挑战啦");
      return;
    }
    playSfx("tap");
    haptic("medium");
    setActiveExam({ meta, unitNumber });
  }

  // 当前 sticky banner 对应的单元元数据
  const activeUnitIndex = unitEntries.findIndex(([n]) => n === activeUnitNum);
  const safeIndex = activeUnitIndex >= 0 ? activeUnitIndex : 0;
  const activeUnit = unitEntries[safeIndex];
  const color = unitColor(safeIndex);
  const activeUnitTitle = activeUnit?.[1]?.title ?? "";

  // ⚡ 跳级入口（E2）：当前可见单元「整个单元都还锁着」时，banner 上出现
  // 「跳到这里」——测试通过即可解锁之前全部课程（口径见 /jump/）
  const activeUnitFullyLocked = useMemo(() => {
    const group = byUnit.get(activeUnitNum);
    if (!group) return false;
    const unitLessons = group.items.filter(
      (it): it is Extract<UnitItem, { kind: "lesson" }> => it.kind === "lesson",
    );
    return (
      unitLessons.length > 0 &&
      unitLessons.every(it => (statuses[it.lesson.id] ?? "locked") === "locked")
    );
  }, [byUnit, activeUnitNum, statuses]);

  return (
    <div className="w-full max-w-md mx-auto lg:max-w-none lg:mx-0 px-4 lg:px-0 pb-6">
      {/* === sticky 单元 banner === */}
      <div
        className="sticky top-0 lg:top-4 z-20 -mx-4 px-4 lg:mx-0 lg:px-0 pt-2 pb-4 bg-bg"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeUnitNum}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="path-banner rounded-2xl px-4 py-4 flex items-center gap-3"
            style={{
              backgroundColor: color.bg,
              boxShadow: `0 4px 0 0 ${color.shadow}`,
            }}
          >
            {backHref && (
              <SoundLink
                href={backHref}
                aria-label="返回"
                className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl path-banner-action hover:bg-white/15 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden />
              </SoundLink>
            )}
            <div className="min-w-0 flex-1">
              {/* 小标签行：subject + textbookName · 第 N 单元 */}
              <div className="flex items-center gap-1.5 text-sm font-bold leading-snug min-w-0 flex-wrap">
                {headerLabel && (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    {headerLabel}
                  </span>
                )}
                <span className="opacity-60">·</span>
                <span className="whitespace-nowrap">{activeUnit?.[1]?.label ?? `第 ${activeUnitNum} 单元`}</span>
              </div>
              {/* 大字单元标题 */}
              <div className="text-xl font-bold leading-snug break-words tracking-tight mt-1.5">
                {activeUnitTitle}
              </div>
            </div>
            {activeUnitFullyLocked && (
              <SoundLink href={`/jump/?book=${bookId}&unit=${activeUnitNum}`} hapticIntensity="medium"
                className="shrink-0 inline-flex items-center gap-1.5 px-2 min-h-11 rounded-xl path-banner-action hover:bg-white/15 transition-colors text-xs font-bold"
                aria-label={`跳级测试：直接跳到${activeUnit?.[1]?.label ?? `第 ${activeUnitNum} 单元`}`}>
                <Lightning className="w-4 h-4" aria-hidden /><span>跳级</span>
              </SoundLink>
            )}
            {hasGuide && (
              <SoundLink
                href={`/book/${bookId}/guide/${activeUnitNum}/`}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 h-11 rounded-xl font-bold text-sm tracking-tight path-banner-action hover:bg-white/15 transition-colors"
                aria-label="打开知识手册"
              >
                <Book className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">知识手册</span>
              </SoundLink>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {topSlot && <div className="mb-3">{topSlot}</div>}

      {/* === 连续蛇形路径（单元边界只作为视觉分隔 label，不中断路径） === */}
      <div className="pt-2">
        <UnitPath
          entries={unitEntries}
          statuses={statuses}
          stars={stars}
          claimedChests={claimedChests}
          onLesson={setActiveLesson}
          onChest={handleChestClick}
          onExam={handleExamClick}
          sectionRefs={sectionRefs}
        />
      </div>

      {activeLesson && (
        <LessonStartModal
          open={!!activeLesson}
          onClose={() => setActiveLesson(null)}
          bookId={bookId}
          lessonId={activeLesson.id}
          title={activeLesson.title}
          questionCount={activeLesson.questionCount}
          unitNumber={activeLesson.unitNumber}
          unitLabel={activeLesson.unitLabel}
          kpIndex={activeLesson.kpIndex}
          kpTotal={activeLesson.kpTotal}
        />
      )}

      {activeChest && (
        <ChestModal
          open={!!activeChest}
          gems={activeChest.gems}
          tier={activeChest.tier}
          onClose={() => setActiveChest(null)}
        />
      )}

      {activeExam && (
        <LessonStartModal
          open={!!activeExam}
          onClose={() => setActiveExam(null)}
          bookId={bookId}
          lessonId={activeExam.meta.lessonId}
          title={byUnit.get(activeExam.unitNumber)?.label
            ? `${byUnit.get(activeExam.unitNumber)!.title}挑战`
            : `第 ${activeExam.unitNumber} 单元挑战`}
          questionCount={activeExam.meta.questionCount}
          unitNumber={activeExam.unitNumber}
          unitLabel={byUnit.get(activeExam.unitNumber)?.label}
          kpIndex={0}
          kpTotal={0}
          isExam
        />
      )}

    </div>
  );
}

/**
 * 单元内部的蛇形路径渲染：
 * - 舞台最大宽 440px；窄容器保留文字宽度并收拢横向偏移，避免溢出
 * - SVG cubic bezier 连接相邻节点（控制点放在中点 y 上，自然形成 S 曲线）
 * - 节点与文字采用正常文档流；连接线根据实际行高测量绘制
 */
const STAGE_WIDTH = 440;
const NODE_SIZE = 72;


interface UnitPathProps {
  entries: Array<[number, { title: string; label?: string; items: UnitItem[] }]>;
  statuses: Record<string, LessonStatus>;
  stars: Record<string, number>;
  claimedChests: Record<string, boolean>;
  onLesson: (l: PathLessonMeta) => void;
  onChest: (slot: ChestSlot) => void;
  onExam: (unitNumber: number, meta: ExamNodeMeta) => void;
  sectionRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
}

function UnitPath({
  entries,
  statuses,
  stars,
  claimedChests,
  onLesson,
  onChest,
  onExam,
  sectionRefs,
}: UnitPathProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; points: Array<{ x: number; y: number }> }>({ width: STAGE_WIDTH, height: 0, points: [] });
  const flat = useMemo(() => entries.flatMap(([unitNum, group], unitOrderIndex) =>
    group.items.map((item, index) => ({ item, unitNum, unitTitle: group.title, unitLabel: group.label, firstInUnit: index === 0, unitOrderIndex }))), [entries]);

  useLayoutEffect(() => {
    const stage = containerRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const offsetLimit = Math.min(110, Math.max(0, (width - 176) / 2 - 12));
      // Measure flow rows, not animated transforms. Labels and separators own real height.
      const points = Array.from(stage.querySelectorAll<HTMLElement>("[data-path-node]")).map((row, index) => ({
        x: snakeOffset(index) / 110 * offsetLimit,
        y: row.offsetTop + NODE_SIZE / 2,
      }));
      const next = { width, height: stage.clientHeight, points };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.querySelectorAll("[data-path-entry]").forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [flat, statuses]);

  return (
    <div ref={containerRef} data-path-stage className="relative w-full max-w-[440px] mx-auto pt-6 pb-4">


      {flat.map((entry, index) => {
        const item = entry.item;
        return <div key={item.kind === "lesson" ? item.lesson.id : item.kind === "exam" ? item.meta.lessonId : item.slot.id}
          data-path-entry data-unit={entry.firstInUnit ? entry.unitNum : undefined}
          ref={entry.firstInUnit ? el => { sectionRefs.current.set(entry.unitNum, el); } : undefined}>
          {entry.firstInUnit && entry.unitOrderIndex > 0 && (
            <div data-unit-divider className="relative flex items-center justify-center gap-3 pt-2 pb-8">
              <span className="h-px flex-1 bg-bg-softer" />
              <div className="max-w-[75%] text-center text-sm font-bold leading-relaxed text-ink-light bg-bg-soft px-2">
                {entry.unitLabel ?? `第 ${entry.unitNum} 单元`} · {entry.unitTitle}
              </div>
              <span className="h-px flex-1 bg-bg-softer" />
            </div>
          )}
          <div data-path-node className="relative flex justify-center pb-11">
            <div className="relative w-44 max-w-full" style={{ left: `calc(${snakeOffset(index) / 110} * min(110px, max(0px, (100% - 200px) / 2)))` }}>
              {item.kind === "lesson" ? <PathNode lesson={item.lesson} status={statuses[item.lesson.id] || "locked"}
                stars={stars[item.lesson.id] ?? 0} breatheDelay={0} color={unitColor(entry.unitOrderIndex)} onSelect={() => onLesson(item.lesson)} />
              : item.kind === "exam" ? <ExamNode meta={item.meta} stars={stars[item.meta.lessonId] ?? 0}
                breatheDelay={0} onSelect={() => onExam(item.unitNumber, item.meta)} />
              : <ChestNode unlocked={statuses[item.slot.afterLessonId] === "completed"} claimed={!!claimedChests[item.slot.id]}
                breatheDelay={0} onSelect={() => onChest(item.slot)} />}
            </div>
          </div>
        </div>;
      })}

      {geometry.points.map((point, index) => {
        if (index < 2 || (index - 2) % 8 !== 0) return null;
        const edge = point.x >= 0 ? { left: 4 } : { right: 4 };
        return <div key={`companion-${index}`} aria-hidden className="absolute pointer-events-none" style={{ ...edge, top: point.y - 24 }}>
          <Mascot size={64} mood="happy" animate={false} />
        </div>;
      })}
    </div>
  );
}

/** 蛇形偏移：固定 8 步循环 (0, +60, +110, +60, 0, -60, -110, -60) px —— 明显 S 形 */
const SNAKE_PATTERN = [0, 60, 110, 60, 0, -60, -110, -60];
function snakeOffset(index: number): number {
  return SNAKE_PATTERN[index % SNAKE_PATTERN.length];
}

interface PathNodeProps {
  lesson: PathLessonMeta;
  status: LessonStatus;
  stars: number;
  breatheDelay: number;
  /** 所属单元的循环色（web-shell-15）：current 节点底色/阴影/光晕随单元色 */
  color: { bg: string; shadow: string };
  onSelect: () => void;
}

/** #RRGGBB → rgba 字符串（光晕用） */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function PathNode({ lesson, status, stars, breatheDelay, color, onSelect }: PathNodeProps) {
  const isLocked = status === "locked";
  const isCurrent = status === "current";
  const isCompleted = status === "completed";

  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center relative"
    >
      <motion.div
        animate={{ y: 0 }}
        transition={
          !isLocked
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={!isLocked ? { y: -2 } : undefined}
        whileTap={!isLocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          "transition-colors duration-200",
          isCurrent && "path-node-current text-white",
          isLocked && "bg-bg-softer text-ink-softer",
          isCompleted && "bg-gold text-white",
        )}
        style={{
          // current 节点底色/阴影/光晕跟随单元循环色（UNIT_COLORS）
          backgroundColor: isCurrent ? color.bg : undefined,
          boxShadow: isLocked
            ? "0 3px 0 0 var(--shadow-card-color)"
            : isCompleted
              ? "0 5px 0 0 #c89600"
              : `0 5px 0 0 ${color.shadow}`,
          ...(isCurrent
            ? ({ "--node-glow-color": hexToRgba(color.bg, 0.35) } as CSSProperties)
            : null),
        }}
      >
        {isLocked && <Star className="w-9 h-9 fill-current text-[#c4c4c4]" strokeWidth={0} />}
        {isCurrent && <Star className="w-8 h-8 fill-white" />}
        {isCompleted && (lesson.questionCount < 3 ? <Check className="w-8 h-8" /> : <Crown className="w-8 h-8 fill-white" />)}

        {/* 星数小角标 */}
        {isCompleted && stars > 0 && lesson.questionCount >= 3 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      {/* 课程标题：只在 current 节点上显示（避免视觉拥挤） */}
      {isCurrent && (
        <div data-path-label className="path-label mt-3 px-2 bg-bg rounded-lg text-center text-sm font-bold leading-relaxed text-ink">
          {lesson.title}
        </div>
      )}
    </motion.div>
  );

  if (isLocked) {
    return <div className="cursor-not-allowed">{node}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        onSelect();
      }}
      className="block w-full"
      title={lesson.title}
    >
      {node}
    </button>
  );
}

interface ChestNodeProps {
  unlocked: boolean;
  claimed: boolean;
  breatheDelay: number;
  onSelect: () => void;
}

function ChestNode({ unlocked, claimed, breatheDelay, onSelect }: ChestNodeProps) {
  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={unlocked && !claimed ? { y: [0, -4, 0] } : { y: 0 }}
        transition={
          unlocked && !claimed
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={unlocked ? { y: -2 } : undefined}
        whileTap={unlocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          !unlocked && "bg-bg-softer text-ink-softer",
          unlocked && !claimed && "bg-warning text-white",
          claimed && "bg-bg-soft text-warning/60",
        )}
        style={{
          boxShadow: !unlocked
            ? "0 3px 0 0 var(--shadow-card-color)"
            : claimed
              ? "0 3px 0 0 var(--shadow-card-color)"
              : "0 5px 0 0 #c89600",
        }}
      >
        {!unlocked ? (
          <Lock className="w-7 h-7" />
        ) : (
          <Chest className="w-8 h-8" />
        )}

        {/* 未领取时的脉冲光圈 */}
        {unlocked && !claimed && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 0 6px rgba(255, 200, 0, 0.35)" }}
          />
        )}
      </motion.div>
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={unlocked ? "block w-full" : "block w-full cursor-not-allowed"}
      aria-label={claimed ? "已领取的宝箱" : unlocked ? "打开宝箱" : "未解锁宝箱"}
    >
      {node}
    </button>
  );
}

// ============================================================
// ⚔️ 单元挑战节点（奖杯）—— 紫金配色，区别于普通课程节点
//   locked    ：灰色 + 点按提示「先完成本单元全部课程」
//   unlocked  ：紫底金边奖杯 + 脉冲光圈（可挑战）
//   completed ：紫底 + 星数角标（通关但未征服）
//   conquered ：金色奖杯（accuracy ≥ 0.8 征服态）
// ============================================================

interface ExamNodeProps {
  meta: ExamNodeMeta;
  stars: number;
  breatheDelay: number;
  onSelect: () => void;
}

function ExamNode({ meta, stars, breatheDelay, onSelect }: ExamNodeProps) {
  const { unlocked, completed, conquered } = meta;

  const background = !unlocked
    ? "var(--app-bg-softer, #E5E5E5)"
    : conquered
      ? "linear-gradient(160deg, #FFC800, #FF9600)"
      : "linear-gradient(160deg, #CE82FF, #7C3AED)";
  const shadow = !unlocked
    ? "0 3px 0 0 var(--shadow-card-color)"
    : conquered
      ? "0 5px 0 0 #C89600, 0 0 18px rgba(255,200,0,0.45)"
      : "0 5px 0 0 #6B21A8";

  const node = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center"
    >
      <motion.div
        animate={unlocked && !completed ? { y: [0, -4, 0] } : { y: 0 }}
        transition={
          unlocked && !completed
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={unlocked ? { y: -2 } : undefined}
        whileTap={unlocked ? { y: 4 } : undefined}
        className={cn(
          "path-disc relative rounded-full flex items-center justify-center",
          !unlocked && "text-ink-softer",
          unlocked && "text-white",
        )}
        style={{
          background,
          boxShadow: shadow,
          // 紫金配色：可挑战 / 已通关（未征服）时挂一圈金边
          border: unlocked && !conquered ? "3px solid #FFC800" : "none",
        }}
      >
        {!unlocked ? <Lock className="w-7 h-7" /> : <Trophy className="w-8 h-8" />}

        {/* 可挑战：金色脉冲光圈 */}
        {unlocked && !completed && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{ scale: [1, 1.22, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ boxShadow: "0 0 0 6px rgba(255, 200, 0, 0.4)" }}
          />
        )}

        {/* 通关星数角标 */}
        {completed && stars > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      {/* 节点小标签 */}
      <div data-path-label
        className={cn(
          "path-label mt-3 px-2 bg-bg-soft rounded-lg text-center text-sm font-bold leading-relaxed",
          !unlocked ? "text-ink-softer" : conquered ? "text-gold" : "text-purple-600",
        )}
      >
        {conquered ? "已征服 ⚔️" : "单元挑战"}
      </div>
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={unlocked ? "block w-full" : "block w-full cursor-not-allowed"}
      aria-label={
        !unlocked
          ? "单元挑战（先完成本单元全部课程）"
          : conquered
            ? "单元挑战（已征服）"
            : completed
              ? "单元挑战（已通关，可再战）"
              : "开始单元挑战"
      }
      title="单元挑战"
    >
      {node}
    </button>
  );
}
