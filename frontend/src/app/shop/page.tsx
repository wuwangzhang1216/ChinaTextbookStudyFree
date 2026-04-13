"use client";

/**
 * 美妆商店 —— 用 gems 解锁吉祥物皮肤 / UI 主题 / 课程背景
 *
 * 公益项目约束：
 *   - 所有道具都能通过游戏内 gems 解锁
 *   - 没有"premium 限定"或"充值专属"
 *   - 不影响游戏数值，纯美学
 *
 * 桌面布局（lg+）：
 *   左侧粘性大预览（Mascot / 主题样卡 / 背景全屏） + 右侧道具网格
 * 移动端：
 *   顶部紧凑预览 + 下方道具网格
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  MASCOT_SKINS,
  UI_THEMES,
  LESSON_BACKDROPS,
  RARITY_COLORS,
  RARITY_LABELS,
  type CosmeticItem,
  type LessonBackdrop,
  type UiTheme,
} from "@/lib/cosmetics";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import {
  Gem,
  ArrowLeft,
  Check,
  Lock,
  Owl,
  Palette,
  Picture,
} from "@/components/icons";
import { GemBadge } from "@/components/GemBadge";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

type Tab = "mascot_skin" | "ui_theme" | "lesson_backdrop";

const TABS: Array<{
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "mascot_skin", label: "聪聪皮肤", Icon: Owl },
  { id: "ui_theme", label: "界面主题", Icon: Palette },
  { id: "lesson_backdrop", label: "课堂背景", Icon: Picture },
];

const CATALOGS: Record<Tab, CosmeticItem[]> = {
  mascot_skin: MASCOT_SKINS,
  ui_theme: UI_THEMES,
  lesson_backdrop: LESSON_BACKDROPS,
};

export default function ShopPage() {
  const [tab, setTab] = useState<Tab>("mascot_skin");
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const gems = useProgressStore(s => s.gems);
  const ownedCosmetics = useProgressStore(s => s.ownedCosmetics);
  const equippedMascotSkin = useProgressStore(s => s.equippedMascotSkin);
  const equippedTheme = useProgressStore(s => s.equippedTheme);
  const equippedBackdrop = useProgressStore(s => s.equippedBackdrop);
  const purchaseCosmetic = useProgressStore(s => s.purchaseCosmetic);
  const equipCosmetic = useProgressStore(s => s.equipCosmetic);

  const items = CATALOGS[tab];

  function isEquipped(item: CosmeticItem) {
    if (item.type === "mascot_skin") return equippedMascotSkin === item.id;
    if (item.type === "ui_theme") return equippedTheme === item.id;
    if (item.type === "lesson_backdrop") return equippedBackdrop === item.id;
    return false;
  }

  function getEquippedId(t: Tab): string {
    if (t === "mascot_skin") return equippedMascotSkin;
    if (t === "ui_theme") return equippedTheme;
    return equippedBackdrop;
  }

  // 当前预览的道具：hover 优先，否则当前已装备
  const previewId = hoverItemId ?? getEquippedId(tab);
  const previewItem = useMemo(
    () => items.find(i => i.id === previewId) ?? items[0],
    [items, previewId],
  );

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 1800);
  }

  function handleClick(item: CosmeticItem) {
    playSfx("tap");
    haptic("light");
    const owned = !!ownedCosmetics[item.id];
    if (owned) {
      const ok = equipCosmetic(item.id);
      if (ok) {
        playSfx("star");
        haptic("success");
        showToast(`已装备：${item.name}`);
      }
    } else {
      const result = purchaseCosmetic(item.id);
      if (result.ok) {
        playSfx("unlock");
        haptic("success");
        showToast(`解锁成功：${item.name}`);
      } else {
        playSfx("wrong");
        haptic("heavy");
        showToast(result.reason ?? "购买失败", false);
      }
    }
  }

  return (
    <main className="min-h-screen bg-bg-soft">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0"
            onClick={() => playSfx("tap")}
            aria-label="返回首页"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-base font-extrabold text-ink leading-tight">美妆商店</div>
            <div className="text-[11px] text-ink-light mt-0.5 inline-flex items-center gap-1 leading-none">
              <Gem className="w-3 h-3 text-purple-500" />
              <span>所有道具用宝石解锁，永久免费</span>
            </div>
          </div>
          <GemBadge />
        </div>
      </div>

      <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 py-4 lg:py-6">
        {/* Tab 切换 —— 移动端 3 列等宽不溢出 / 桌面端横向 chip */}
        <div className="grid grid-cols-3 gap-2 mb-4 lg:flex lg:gap-2 lg:mb-6">
          {TABS.map(t => {
            const active = tab === t.id;
            const Icon = t.Icon;
            const ownedInTab = CATALOGS[t.id].filter(
              c => ownedCosmetics[c.id],
            ).length;
            const totalInTab = CATALOGS[t.id].length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  setTab(t.id);
                  setHoverItemId(null);
                }}
                className={`min-w-0 inline-flex items-center justify-center gap-1 lg:gap-2 px-2 lg:px-4 h-10 lg:h-11 rounded-xl lg:rounded-2xl font-extrabold border-2 transition-all ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-ink-light border-bg-softer hover:border-primary/40"
                }`}
                style={
                  active
                    ? { boxShadow: "0 4px 0 0 #58A700" }
                    : { boxShadow: "0 2px 0 0 #e5e5e5" }
                }
              >
                <Icon className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
                <span className="text-[12px] lg:text-sm truncate">{t.label}</span>
                <span
                  className={`text-[9px] lg:text-[10px] tabular-nums px-1 lg:px-1.5 py-0.5 rounded-full shrink-0 ${
                    active ? "bg-white/25 text-white" : "bg-bg-soft text-ink-softer"
                  }`}
                >
                  {ownedInTab}/{totalInTab}
                </span>
              </button>
            );
          })}
        </div>

        {/* 桌面端 2 列：左大预览 + 右网格 / 移动端：上下堆叠 */}
        <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6 lg:items-start">
          {/* 大预览面板 */}
          <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
            <PreviewPane
              item={previewItem}
              isHoverPreview={hoverItemId !== null && hoverItemId !== getEquippedId(tab)}
              onTryEquip={() => {
                if (previewItem) handleClick(previewItem);
              }}
              owned={previewItem ? !!ownedCosmetics[previewItem.id] : false}
              equipped={previewItem ? isEquipped(previewItem) : false}
              canAfford={previewItem ? gems >= previewItem.cost : false}
            />
          </div>

          {/* 右侧网格 */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map(item => {
                const owned = !!ownedCosmetics[item.id];
                const equipped = isEquipped(item);
                const canAfford = gems >= item.cost;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    owned={owned}
                    equipped={equipped}
                    canAfford={canAfford}
                    isHovered={hoverItemId === item.id}
                    onMouseEnter={() => setHoverItemId(item.id)}
                    onMouseLeave={() => setHoverItemId(null)}
                    onClick={() => handleClick(item)}
                  />
                );
              })}
            </div>

            {/* 底部说明 */}
            <p className="text-center text-xs text-ink-softer mt-8 max-w-md mx-auto inline-flex items-start gap-1.5">
              <Gem className="w-3 h-3 text-purple-500 mt-0.5 shrink-0" />
              <span>
                宝石全部通过学习获得：通关 +3 / 二星 +5 / 三星 +10 / 首次完美 +15 / 每日目标 +20 /
                连胜里程碑 +30~800。无任何充值。
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl font-extrabold text-white shadow-lg z-50 ${
              toast.ok ? "bg-primary" : "bg-danger"
            }`}
            style={{
              boxShadow: toast.ok
                ? "0 5px 0 0 #58A700"
                : "0 5px 0 0 #c00",
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ============================================================
// 大预览面板（左 / 顶）
// ============================================================
function PreviewPane({
  item,
  isHoverPreview,
  owned,
  equipped,
  canAfford,
  onTryEquip,
}: {
  item: CosmeticItem | undefined;
  isHoverPreview: boolean;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  onTryEquip: () => void;
}) {
  if (!item) return null;
  const rarityColor = RARITY_COLORS[item.rarity];

  return (
    <motion.div
      layout
      className="bg-white rounded-3xl border-2 border-bg-softer overflow-hidden"
      style={{ boxShadow: "0 5px 0 0 #e5e5e5" }}
    >
      {/* 预览舞台 */}
      <PreviewStage item={item} />

      {/* 信息条 */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-extrabold text-ink leading-tight flex-1">
            {item.name}
          </h2>
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-extrabold border-2 shrink-0"
            style={{ color: rarityColor, borderColor: rarityColor }}
          >
            {RARITY_LABELS[item.rarity]}
          </span>
        </div>
        <p className="text-sm text-ink-light leading-relaxed">{item.description}</p>

        {/* 状态 / 行动按钮 */}
        <div className="mt-4">
          {equipped ? (
            <div className="btn-chunky bg-bg-softer text-ink-light cursor-default w-full">
              <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
              已装备
            </div>
          ) : owned ? (
            <button
              type="button"
              onClick={onTryEquip}
              className="btn-chunky-primary w-full"
            >
              <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
              立即装备
            </button>
          ) : canAfford ? (
            <button
              type="button"
              onClick={onTryEquip}
              className="btn-chunky w-full text-white"
              style={{
                background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                boxShadow: "0 5px 0 0 #6b21a8",
              }}
            >
              <Gem className="w-4 h-4 mr-1.5" />
              <span className="tabular-nums">{item.cost}</span>
              <span className="ml-1.5">解锁</span>
            </button>
          ) : (
            <div className="btn-chunky bg-bg-softer text-ink-softer cursor-not-allowed w-full">
              <Lock className="w-4 h-4 mr-1.5" />
              <span className="tabular-nums">{item.cost}</span>
              <span className="ml-1.5">还差 {item.cost - useProgressStore.getState().gems}</span>
            </div>
          )}
          {isHoverPreview && (
            <div className="mt-2 text-center text-[11px] text-ink-softer">
              试穿中 · 移开鼠标恢复当前装备
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// 预览舞台 —— 根据道具类型渲染不同的全屏式预览
// ============================================================
function PreviewStage({ item }: { item: CosmeticItem }) {
  if (item.type === "mascot_skin") {
    return (
      <div
        className="relative h-64 flex items-center justify-center"
        style={{
          background:
            "radial-gradient(ellipse at center, #ECFDF5 0%, #F7F7F7 70%)",
        }}
      >
        <motion.div
          key={item.id}
          initial={{ scale: 0.8, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 16, stiffness: 220 }}
        >
          <Mascot size={180} skinOverride={item.id} mood="happy" />
        </motion.div>
      </div>
    );
  }
  if (item.type === "ui_theme") {
    const theme = item as UiTheme;
    const t = theme.data;
    return (
      <div
        className="relative h-64 px-5 py-5 flex flex-col gap-3"
        style={{ background: t.bg }}
      >
        {/* 模拟一个题区卡片 */}
        <div className="bg-white rounded-2xl border-2 border-bg-softer p-3 flex items-center gap-2 shadow-sm">
          <div
            className="w-8 h-8 rounded-full"
            style={{ background: t.primary }}
          />
          <div className="flex-1">
            <div className="h-2.5 rounded-full bg-bg-softer w-3/4 mb-1.5" />
            <div className="h-2 rounded-full bg-bg-softer w-1/2" />
          </div>
        </div>
        {/* 模拟一个 chunky 主按钮 */}
        <div
          className="rounded-2xl py-3 text-center text-white font-extrabold text-sm"
          style={{
            background: t.primary,
            boxShadow: `0 4px 0 0 ${t.primaryDark}`,
          }}
        >
          检查
        </div>
        {/* 调色板色块 */}
        <div className="flex gap-2 mt-auto">
          <ColorChip color={t.primary} label="主色" />
          <ColorChip color={t.primaryDark} label="深色" />
          <ColorChip color={t.accent} label="点缀" />
        </div>
      </div>
    );
  }
  if (item.type === "lesson_backdrop") {
    const bd = item as LessonBackdrop;
    return (
      <div
        className="relative h-64 flex items-center justify-center"
        style={{ background: bd.data.background }}
      >
        {/* 半透明白罩（背景太深的暗色 backdrop 用） */}
        {bd.data.needsOverlay && (
          <div className="absolute inset-0 bg-white/40" />
        )}
        {/* 模拟一个题卡片漂浮其上 */}
        <div className="relative bg-white rounded-2xl border-2 border-bg-softer p-4 mx-6 shadow-lg">
          <div className="text-xs text-ink-softer font-extrabold uppercase tracking-wider mb-1">
            示意
          </div>
          <div className="text-sm font-bold text-ink leading-relaxed">
            这就是答题时背后看到的氛围
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function ColorChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-xl border-2 border-white"
        style={{ background: color, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}
      />
      <div className="text-[9px] text-ink-softer font-extrabold uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

// ============================================================
// 右侧道具卡片
// ============================================================
function ItemCard({
  item,
  owned,
  equipped,
  canAfford,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const rarityColor = RARITY_COLORS[item.rarity];
  return (
    <motion.button
      type="button"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className="relative bg-white rounded-2xl border-2 overflow-hidden text-left flex flex-col"
      style={{
        borderColor: equipped
          ? "#58CC02"
          : isHovered
            ? rarityColor
            : "#E5E5E5",
        boxShadow: equipped
          ? "0 4px 0 0 #58A700"
          : isHovered
            ? `0 4px 0 0 ${rarityColor}`
            : "0 3px 0 0 #e5e5e5",
      }}
    >
      {/* 缩略预览 */}
      <ItemThumb item={item} />

      {/* 锁角标（未拥有 + 不够买） */}
      {!owned && !canAfford && (
        <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 border-2 border-bg-softer text-ink-softer flex items-center justify-center">
          <Lock className="w-3.5 h-3.5" />
        </div>
      )}
      {/* 已装备角标 */}
      {equipped && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow">
          <Check className="w-4 h-4" strokeWidth={3} />
        </div>
      )}
      {/* 稀有度小条（卡片底色） */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: rarityColor }}
      />

      {/* 信息 */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <div className="text-[13px] font-extrabold text-ink leading-tight truncate">
          {item.name}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[9px] uppercase tracking-wider font-extrabold"
            style={{ color: rarityColor }}
          >
            {RARITY_LABELS[item.rarity]}
          </span>
          {equipped ? (
            <span className="text-[10px] font-extrabold text-primary-dark">
              已装备
            </span>
          ) : owned ? (
            <span className="text-[10px] font-extrabold text-secondary-dark">
              点击装备
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold tabular-nums ${
                canAfford ? "text-purple-600" : "text-ink-softer"
              }`}
            >
              <Gem className="w-3 h-3" />
              {item.cost}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================
// 缩略预览（卡片顶部）
// ============================================================
function ItemThumb({ item }: { item: CosmeticItem }) {
  if (item.type === "mascot_skin") {
    return (
      <div
        className="h-24 flex items-center justify-center pt-2"
        style={{ background: "#F7F7F7" }}
      >
        <Mascot size={72} skinOverride={item.id} animate={false} mood="happy" />
      </div>
    );
  }
  if (item.type === "ui_theme") {
    const t = (item as UiTheme).data;
    return (
      <div className="h-24 px-3 py-2 flex flex-col gap-1.5" style={{ background: t.bg }}>
        <div className="bg-white/90 rounded-md h-3 w-3/4" />
        <div
          className="rounded-md h-6 mt-auto"
          style={{
            background: t.primary,
            boxShadow: `0 2px 0 0 ${t.primaryDark}`,
          }}
        />
      </div>
    );
  }
  if (item.type === "lesson_backdrop") {
    const bd = (item as LessonBackdrop).data;
    return (
      <div className="relative h-24" style={{ background: bd.background }}>
        {bd.needsOverlay && <div className="absolute inset-0 bg-white/30" />}
      </div>
    );
  }
  return null;
}
