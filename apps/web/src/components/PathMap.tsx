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
import { Lock, Star, Crown, Chest, Book, Owl, Sparkle } from "@/components/icons";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { LessonStartModal } from "./LessonStartModal";
import { ChestModal } from "./ChestModal";
import { SoundLink } from "./SoundLink";
import { computeChestsForBook, rollChestReward, type ChestSlot } from "@/lib/chestLogic";
import { useProgressStore } from "@/store/progress";
import type { PathLessonMeta, LessonStatus } from "@cstf/core";

export type { PathLessonMeta, LessonStatus };

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
  /** 在 sticky banner 上方渲染的插槽内容（随 banner 一起 sticky），桌面端专用 */
  topSlot?: ReactNode;
}

type UnitItem =
  | { kind: "lesson"; lesson: PathLessonMeta }
  | { kind: "chest"; slot: ChestSlot };

interface ActiveChestState {
  slot: ChestSlot;
  /** 本次开箱抽到的奖励 */
  gems: number;
}

/** Duolingo 各单元的颜色循环 —— 按 unit index 取模 */
const UNIT_COLORS: Array<{ bg: string; shadow: string }> = [
  { bg: "#58CC02", shadow: "#58A700" }, // feather green
  { bg: "#CE82FF", shadow: "#A560E8" }, // beetle purple
  { bg: "#1CB0F6", shadow: "#1899D6" }, // macaw blue
  { bg: "#FF9600", shadow: "#E08600" }, // fox orange
  { bg: "#FF4B4B", shadow: "#EA2B2B" }, // cardinal red
  { bg: "#FFC800", shadow: "#E0A800" }, // bee yellow
];

function unitColor(index: number) {
  return UNIT_COLORS[index % UNIT_COLORS.length];
}

export function PathMap({
  bookId,
  lessons,
  statuses,
  stars = {},
  headerLabel,
  hasGuide,
  backHref,
  topSlot,
}: PathMapProps) {
  const [activeLesson, setActiveLesson] = useState<PathLessonMeta | null>(null);
  const [activeChest, setActiveChest] = useState<ActiveChestState | null>(null);

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

  // 按单元分组，合并 lesson + chest 为一个 unitItems 列表
  const byUnit = useMemo(() => {
    const map = new Map<number, { title: string; items: UnitItem[] }>();
    for (const l of lessons) {
      if (!map.has(l.unitNumber)) map.set(l.unitNumber, { title: l.unitTitle, items: [] });
      map.get(l.unitNumber)!.items.push({ kind: "lesson", lesson: l });
      const chest = chestByAfterLesson.get(l.id);
      if (chest) {
        map.get(l.unitNumber)!.items.push({ kind: "chest", slot: chest });
      }
    }
    return map;
  }, [lessons, chestByAfterLesson]);

  const unitEntries = useMemo(() => Array.from(byUnit.entries()), [byUnit]);

  // sticky banner：跟随滚动指示当前可见的单元
  const sectionRefs = useRef(new Map<number, HTMLDivElement | null>());
  const [activeUnitNum, setActiveUnitNum] = useState<number>(unitEntries[0]?.[0] ?? 1);

  // sticky top 值 = 元素在文档流里的原始 offsetTop —— 这样吸附时 y 位置不变
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    function measure() {
      if (typeof window === "undefined") return;
      const isLg = window.matchMedia("(min-width: 1024px)").matches;
      if (!isLg) {
        setStickyTop(null);
        return;
      }
      const el = stickyRef.current;
      if (!el) return;
      let y = 0;
      let cur: HTMLElement | null = el;
      while (cur) {
        y += cur.offsetTop;
        cur = cur.offsetParent as HTMLElement | null;
      }
      setStickyTop(y);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      entries => {
        // 找到所有 isIntersecting 的 unit，取最靠上的那个
        const visible = entries
          .filter(e => e.isIntersecting)
          .map(e => Number((e.target as HTMLElement).dataset.unit ?? "0"))
          .sort((a, b) => a - b);
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
      setActiveChest({ slot, gems: 0 });
      return;
    }
    const reward = rollChestReward();
    claimChest(slot.id);
    addGems(reward.gems);
    setActiveChest({ slot, gems: reward.gems });
  }

  // 当前 sticky banner 对应的单元元数据
  const activeUnitIndex = unitEntries.findIndex(([n]) => n === activeUnitNum);
  const safeIndex = activeUnitIndex >= 0 ? activeUnitIndex : 0;
  const activeUnit = unitEntries[safeIndex];
  const color = unitColor(safeIndex);
  const activeUnitTitle = activeUnit?.[1]?.title ?? "";

  return (
    <div className="w-full max-w-md mx-auto lg:max-w-none lg:mx-0 px-4 lg:px-0 pb-6">
      {/* === sticky 单元 banner === */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-20 -mx-4 px-4 lg:mx-0 lg:px-0 pt-2 pb-3 bg-bg-soft/0 lg:bg-transparent"
        style={stickyTop !== null ? { top: stickyTop } : undefined}
      >
        {topSlot && <div className="hidden lg:block mb-3">{topSlot}</div>}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeUnitNum}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl px-3 py-2.5 text-white flex items-center gap-3"
            style={{
              backgroundColor: color.bg,
              boxShadow: `0 4px 0 0 ${color.shadow}`,
            }}
          >
            {backHref && (
              <SoundLink
                href={backHref}
                aria-label="返回"
                className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl text-white border-2 border-white/60 hover:bg-white/15 transition-colors"
              >
                <span aria-hidden className="text-lg font-extrabold leading-none">←</span>
              </SoundLink>
            )}
            <div className="min-w-0 flex-1">
              {/* 小标签行：subject + textbookName · 第 N 单元 */}
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold leading-none opacity-95 min-w-0 truncate">
                {headerLabel && (
                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                    {headerLabel}
                  </span>
                )}
                <span className="opacity-60">·</span>
                <span className="whitespace-nowrap">第 {activeUnitNum} 单元</span>
              </div>
              {/* 大字单元标题 */}
              <div className="text-lg font-extrabold leading-tight truncate tracking-tight mt-1.5">
                {activeUnitTitle}
              </div>
            </div>
            {hasGuide && (
              <SoundLink
                href={`/book/${bookId}/guide/${activeUnitNum}/`}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-white font-extrabold text-xs tracking-tight border-2 border-white/60 hover:bg-white/15 transition-colors"
                aria-label="打开知识手册"
              >
                <Book className="w-4 h-4" aria-hidden />
                <span className="hidden sm:inline">知识手册</span>
              </SoundLink>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* === 连续蛇形路径（单元边界只作为视觉分隔 label，不中断路径） === */}
      <div className="pt-2">
        <UnitPath
          entries={unitEntries}
          statuses={statuses}
          stars={stars}
          claimedChests={claimedChests}
          onLesson={setActiveLesson}
          onChest={handleChestClick}
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
          kpIndex={activeLesson.kpIndex}
          kpTotal={activeLesson.kpTotal}
        />
      )}

      {activeChest && (
        <ChestModal
          open={!!activeChest}
          gems={activeChest.gems}
          onClose={() => setActiveChest(null)}
        />
      )}

    </div>
  );
}

/**
 * 单元内部的蛇形路径渲染：
 * - 使用 400px 宽的居中舞台 (viewBox -200..200)
 * - SVG cubic bezier 连接相邻节点（控制点放在中点 y 上，自然形成 S 曲线）
 * - 节点以绝对定位放置到同一坐标系
 */
const STAGE_WIDTH = 440;
const STAGE_HALF = STAGE_WIDTH / 2;
const NODE_SIZE = 80;
const STEP_Y = 120;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

/**
 * 吉祥物装饰：每隔几课在路径外侧放一只小动物/星星，纯视觉陪跑。
 * atIndex：吸附到 flat 列表里哪个节点的 y 坐标附近；
 * side：1=右，-1=左（贴近 stage 边缘）；
 * yOffset：相对该节点 y 的上下偏移（px）；
 */
type DecoKind = "owl" | "sparkle" | "crown" | "star";
interface DecoSpec {
  atIndex: number;
  side: 1 | -1;
  yOffset: number;
  size: number;
  rotate: number;
  kind: DecoKind;
  color: string;
  delay: number;
}

const DECO_KINDS: DecoKind[] = ["owl", "sparkle", "star", "owl", "crown", "sparkle"];
const DECO_COLORS = ["#58CC02", "#FFC800", "#CE82FF", "#1CB0F6", "#FF9600", "#FF4B4B"];
const DECO_Y_OFFSETS = [30, -12, 18, 6, -6, 24];
const DECO_SIZES = [64, 36, 44, 60, 40, 56];

/** 每 3 步放一个装饰，左右交替，循环 DECO_KINDS 调色板 */
function generateDecorations(len: number): DecoSpec[] {
  const out: DecoSpec[] = [];
  for (let atIndex = 2; atIndex < len; atIndex += 3) {
    const step = Math.floor((atIndex - 2) / 3);
    const side: 1 | -1 = step % 2 === 0 ? 1 : -1;
    out.push({
      atIndex,
      side,
      yOffset: DECO_Y_OFFSETS[step % DECO_Y_OFFSETS.length],
      size: DECO_SIZES[step % DECO_SIZES.length],
      rotate: side === 1 ? -8 + (step % 3) * 4 : 8 - (step % 3) * 4,
      kind: DECO_KINDS[step % DECO_KINDS.length],
      color: DECO_COLORS[step % DECO_COLORS.length],
      delay: (step % 5) * 0.08,
    });
  }
  return out;
}

function renderDecoIcon(kind: DecoKind, size: number) {
  const common = { className: "w-full h-full" };
  switch (kind) {
    case "owl":
      return <Owl {...common} size={size} />;
    case "sparkle":
      return <Sparkle {...common} size={size} />;
    case "crown":
      return <Crown {...common} size={size} />;
    case "star":
      return <Star {...common} size={size} />;
  }
}

function buildSnakePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  const toX = (x: number) => x + STAGE_HALF;
  let d = `M ${toX(points[0].x)} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const midY = (a.y + b.y) / 2;
    d += ` C ${toX(a.x)} ${midY}, ${toX(b.x)} ${midY}, ${toX(b.x)} ${b.y}`;
  }
  return d;
}

interface FlatEntry {
  item: UnitItem;
  unitNum: number;
  unitTitle: string;
  firstInUnit: boolean;
  unitOrderIndex: number;
}

interface UnitPathProps {
  entries: Array<[number, { title: string; items: UnitItem[] }]>;
  statuses: Record<string, LessonStatus>;
  stars: Record<string, number>;
  claimedChests: Record<string, boolean>;
  onLesson: (l: PathLessonMeta) => void;
  onChest: (slot: ChestSlot) => void;
  sectionRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
}

function UnitPath({
  entries,
  statuses,
  stars,
  claimedChests,
  onLesson,
  onChest,
  sectionRefs,
}: UnitPathProps) {
  const flat: FlatEntry[] = [];
  entries.forEach(([unitNum, group], gi) => {
    group.items.forEach((item, idx) => {
      flat.push({
        item,
        unitNum,
        unitTitle: group.title,
        firstInUnit: idx === 0,
        unitOrderIndex: gi,
      });
    });
  });

  const positions = flat.map((_, i) => ({
    x: snakeOffset(i),
    y: PAD_TOP + NODE_SIZE / 2 + i * STEP_Y,
  }));
  const height = PAD_TOP + NODE_SIZE + Math.max(0, flat.length - 1) * STEP_Y + PAD_BOTTOM;
  const pathD = buildSnakePath(positions);

  return (
    <div className="relative mx-auto" style={{ width: STAGE_WIDTH, height }}>
      <svg
        className="absolute inset-0 pointer-events-none"
        width={STAGE_WIDTH}
        height={height}
        viewBox={`0 0 ${STAGE_WIDTH} ${height}`}
        aria-hidden
      >
        <path
          d={pathD}
          fill="none"
          stroke="#E5E5E5"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray="2 14"
        />
      </svg>

      {/* 吉祥物装饰：按 flat 长度动态生成，在路径外侧点缀，不可点击 */}
      {generateDecorations(flat.length).map((d, i) => {
        if (d.atIndex >= flat.length) return null;
        const p = positions[d.atIndex];
        const cx = d.side === 1 ? STAGE_WIDTH - d.size / 2 - 8 : d.size / 2 + 8;
        const cy = p.y + d.yOffset;
        return (
          <motion.div
            key={`deco-${i}`}
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: cx - d.size / 2,
              top: cy - d.size / 2,
              width: d.size,
              height: d.size,
              color: d.color,
              opacity: 0.55,
            }}
            initial={{ opacity: 0, scale: 0.7, rotate: d.rotate - 6 }}
            animate={{
              opacity: 0.55,
              scale: 1,
              rotate: [d.rotate - 2, d.rotate + 2, d.rotate - 2],
              y: [0, -3, 0],
            }}
            transition={{
              opacity: { duration: 0.5, delay: d.delay },
              scale: { duration: 0.5, delay: d.delay },
              rotate: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: d.delay },
              y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: d.delay },
            }}
          >
            {renderDecoIcon(d.kind, d.size)}
          </motion.div>
        );
      })}

      {/* IntersectionObserver markers：每个单元首个节点位置放一个 0 高度探针 */}
      {flat.map((entry, idx) =>
        entry.firstInUnit ? (
          <div
            key={`marker-${entry.unitNum}`}
            ref={el => {
              sectionRefs.current.set(entry.unitNum, el);
            }}
            data-unit={entry.unitNum}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: positions[idx].y - NODE_SIZE, height: 1 }}
            aria-hidden
          />
        ) : null,
      )}

      {/* 单元分隔 label：第一个单元省略（有 sticky banner 兜底） */}
      {flat.map((entry, idx) => {
        if (!entry.firstInUnit || entry.unitOrderIndex === 0) return null;
        const y = positions[idx].y - NODE_SIZE / 2 - 34;
        return (
          <div
            key={`label-${entry.unitNum}`}
            className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
            style={{ top: y }}
          >
            <div className="inline-flex items-center rounded-full bg-white/90 backdrop-blur px-3 py-1 text-[10px] font-extrabold text-ink-softer uppercase tracking-wider border border-bg-softer shadow-sm whitespace-nowrap">
              第 {entry.unitNum} 单元 · {entry.unitTitle}
            </div>
          </div>
        );
      })}

      {flat.map((entry, idx) => {
        const p = positions[idx];
        const style: CSSProperties = {
          left: STAGE_HALF + p.x - NODE_SIZE / 2,
          top: p.y - NODE_SIZE / 2,
          width: NODE_SIZE,
        };
        if (entry.item.kind === "lesson") {
          const lesson = entry.item.lesson;
          const status = statuses[lesson.id] || "locked";
          return (
            <div key={lesson.id} className="absolute" style={style}>
              <PathNode
                lesson={lesson}
                status={status}
                stars={stars[lesson.id] ?? 0}
                breatheDelay={idx * 0.12}
                onSelect={() => onLesson(lesson)}
              />
            </div>
          );
        }
        const slot = entry.item.slot;
        const after = statuses[slot.afterLessonId];
        const unlocked = after === "completed";
        const claimed = !!claimedChests[slot.id];
        return (
          <div key={slot.id} className="absolute" style={style}>
            <ChestNode
              unlocked={unlocked}
              claimed={claimed}
              breatheDelay={idx * 0.12}
              onSelect={() => onChest(slot)}
            />
          </div>
        );
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
  onSelect: () => void;
}

function PathNode({ lesson, status, stars, breatheDelay, onSelect }: PathNodeProps) {
  const isLocked = status === "locked";
  const isCurrent = status === "current";
  const isCompleted = status === "completed";

  const node = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: breatheDelay * 0.4 }}
      className="flex flex-col items-center relative"
    >
      <motion.div
        animate={!isLocked ? { y: [0, -3, 0] } : { y: 0 }}
        transition={
          !isLocked
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: breatheDelay }
            : { duration: 0 }
        }
        whileHover={!isLocked ? { scale: 1.08, y: -4 } : undefined}
        whileTap={!isLocked ? { scale: 0.95 } : undefined}
        className={cn(
          "relative w-20 h-20 rounded-full flex items-center justify-center",
          "transition-colors duration-200",
          isCurrent && "path-node-current",
          isLocked && "bg-bg-softer text-ink-softer",
          isCurrent && "bg-primary text-white",
          isCompleted && "bg-gold text-white",
        )}
        style={{
          boxShadow: isLocked
            ? "0 4px 0 0 #d5d5d5"
            : isCompleted
              ? "0 5px 0 0 #c89600"
              : "0 5px 0 0 #58a700",
        }}
      >
        {isLocked && <Lock className="w-7 h-7" />}
        {isCurrent && <Star className="w-9 h-9 fill-white" />}
        {isCompleted && <Crown className="w-9 h-9 fill-white" />}

        {/* 星数小角标 */}
        {isCompleted && stars > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow inline-flex items-center gap-0.5 text-gold">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-current" />
            ))}
          </div>
        )}
      </motion.div>

      {/* 课程标题：只在 current 节点上显示（避免视觉拥挤） */}
      {isCurrent && (
        <div className="mt-1.5 text-center text-[12px] font-extrabold leading-tight max-w-[160px] tracking-tight text-ink">
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
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
        whileHover={unlocked ? { scale: 1.08, y: -4 } : undefined}
        whileTap={unlocked ? { scale: 0.95 } : undefined}
        className={cn(
          "relative w-20 h-20 rounded-full flex items-center justify-center",
          !unlocked && "bg-bg-softer text-ink-softer",
          unlocked && !claimed && "bg-warning text-white",
          claimed && "bg-bg-soft text-warning/60",
        )}
        style={{
          boxShadow: !unlocked
            ? "0 4px 0 0 #d5d5d5"
            : claimed
              ? "0 4px 0 0 #d5d5d5"
              : "0 5px 0 0 #c89600",
        }}
      >
        {!unlocked ? (
          <Lock className="w-7 h-7" />
        ) : (
          <Chest className="w-9 h-9" />
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
