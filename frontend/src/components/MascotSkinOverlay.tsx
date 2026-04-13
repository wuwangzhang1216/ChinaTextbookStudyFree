"use client";

/**
 * MascotSkinOverlay —— 吉祥物皮肤的 SVG 叠加层。
 *
 * 这是 Mascot.tsx 内部 <svg viewBox="0 0 120 120"> 的子元素，
 * 根据装备的 skin id 渲染对应的帽子 / 眼镜 / 配件 SVG。
 *
 * 坐标参考 Mascot 主体：
 *   - 头顶中心 ≈ (60, 28)
 *   - 头顶宽度 ≈ 60
 *   - 双眼水平 y ≈ 48
 *   - 喙位置 ≈ (60, 65)
 *   - 身体底 ≈ (60, 100)
 *
 * 所有装饰只用基础 SVG primitive（path/circle/rect），零外部依赖。
 */

import * as React from "react";

interface MascotSkinOverlayProps {
  skinId?: string | null;
}

export function MascotSkinOverlay({ skinId }: MascotSkinOverlayProps) {
  switch (skinId) {
    case "skin_graduate":
      return <GraduateCap />;
    case "skin_glasses":
      return <RoundGlasses />;
    case "skin_party":
      return <PartyHat />;
    case "skin_crown":
      return <GoldCrown />;
    case "skin_wizard":
      return <WizardHat />;
    case "skin_astronaut":
      return <AstronautHelmet />;
    case "skin_sunglasses":
      return <Sunglasses />;
    case "skin_pirate":
      return <PirateHat />;
    case "skin_headphones":
      return <Headphones />;
    case "skin_laurel":
      return <LaurelWreath />;
    case "skin_bowtie":
      return <BowTie />;
    case "skin_default":
    case null:
    case undefined:
    default:
      return null;
  }
}

// ============================================================
// 学士帽
// ============================================================
function GraduateCap() {
  return (
    <g>
      {/* 帽子底座（小方圆） */}
      <ellipse cx="60" cy="22" rx="22" ry="5" fill="#1A1A1A" />
      {/* 方板 */}
      <path d="M 30 18 L 90 18 L 80 26 L 40 26 Z" fill="#0F0F0F" />
      <path d="M 30 18 L 90 18 L 80 14 L 40 14 Z" fill="#1A1A1A" />
      {/* 流苏挂绳 */}
      <line x1="62" y1="18" x2="78" y2="14" stroke="#FFC800" strokeWidth="1.4" strokeLinecap="round" />
      {/* 流苏球 */}
      <circle cx="79" cy="14" r="2" fill="#FFC800" />
      <line x1="79" y1="16" x2="79" y2="22" stroke="#FFC800" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

// ============================================================
// 圆框眼镜
// ============================================================
function RoundGlasses() {
  return (
    <g>
      {/* 镜框（套在双眼眶外） */}
      <circle cx="44" cy="48" r="11" fill="none" stroke="#1A1A1A" strokeWidth="2.2" />
      <circle cx="76" cy="48" r="11" fill="none" stroke="#1A1A1A" strokeWidth="2.2" />
      {/* 鼻梁 */}
      <line x1="55" y1="48" x2="65" y2="48" stroke="#1A1A1A" strokeWidth="2" />
      {/* 镜片反光（右上一道光） */}
      <path d="M 38 42 Q 42 39 47 41" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M 70 42 Q 74 39 79 41" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
    </g>
  );
}

// ============================================================
// 派对锥帽
// ============================================================
function PartyHat() {
  return (
    <g>
      {/* 三角帽身（彩虹渐变用 stroke 模拟分层） */}
      <path d="M 60 -2 L 44 28 L 76 28 Z" fill="#FF6B6B" stroke="#1A1A1A" strokeWidth="1.2" />
      <path d="M 47 22 L 73 22" stroke="#FFC800" strokeWidth="3" />
      <path d="M 50 16 L 70 16" stroke="#1CB0F6" strokeWidth="3" />
      <path d="M 53 10 L 67 10" stroke="#A855F7" strokeWidth="2.5" />
      {/* 顶端绒球 */}
      <circle cx="60" cy="-2" r="3" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="0.8" />
    </g>
  );
}

// ============================================================
// 金色皇冠
// ============================================================
function GoldCrown() {
  return (
    <g>
      {/* 冠底（金色环带） */}
      <rect x="34" y="22" width="52" height="6" fill="#FFC800" stroke="#C89600" strokeWidth="1.2" />
      {/* 三个尖角 */}
      <path d="M 36 22 L 44 8 L 52 22 Z" fill="#FFC800" stroke="#C89600" strokeWidth="1.2" />
      <path d="M 52 22 L 60 4 L 68 22 Z" fill="#FFC800" stroke="#C89600" strokeWidth="1.2" />
      <path d="M 68 22 L 76 8 L 84 22 Z" fill="#FFC800" stroke="#C89600" strokeWidth="1.2" />
      {/* 镶嵌的红宝石 */}
      <circle cx="44" cy="14" r="1.8" fill="#FF4B4B" />
      <circle cx="60" cy="10" r="2" fill="#FF4B4B" />
      <circle cx="76" cy="14" r="1.8" fill="#FF4B4B" />
      {/* 高光 */}
      <line x1="36" y1="24" x2="84" y2="24" stroke="#FFFFFF" strokeWidth="1" opacity="0.5" />
    </g>
  );
}

// ============================================================
// 法师尖帽
// ============================================================
function WizardHat() {
  return (
    <g>
      {/* 帽身（紫色弯尖） */}
      <path d="M 36 28 Q 50 -2 62 8 Q 64 18 78 28 Z" fill="#7C3AED" stroke="#1A1A1A" strokeWidth="1.4" />
      {/* 帽檐 */}
      <ellipse cx="60" cy="28" rx="26" ry="4" fill="#5B21B6" stroke="#1A1A1A" strokeWidth="1.2" />
      {/* 星星装饰 */}
      <path d="M 50 18 L 51 16 L 52 18 L 54 19 L 52 20 L 51 22 L 50 20 L 48 19 Z" fill="#FFC800" />
      <path d="M 62 12 L 63 10 L 64 12 L 66 13 L 64 14 L 63 16 L 62 14 L 60 13 Z" fill="#FFC800" />
      <circle cx="56" cy="24" r="0.8" fill="#FFC800" />
    </g>
  );
}

// ============================================================
// 宇航员头盔（覆盖整个头部上方）
// ============================================================
function AstronautHelmet() {
  return (
    <g>
      {/* 头盔球体（透明感淡白） */}
      <ellipse cx="60" cy="44" rx="40" ry="36" fill="#FFFFFF" opacity="0.32" stroke="#1A1A1A" strokeWidth="1.8" />
      {/* 头盔边框 */}
      <path d="M 22 60 Q 60 80 98 60" fill="none" stroke="#1A1A1A" strokeWidth="2.2" />
      {/* 顶部反光弧 */}
      <path d="M 36 22 Q 60 12 84 22" fill="none" stroke="#FFFFFF" strokeWidth="2.2" opacity="0.85" />
      <path d="M 36 22 Q 50 18 60 18" fill="none" stroke="#FFFFFF" strokeWidth="1.3" opacity="0.6" />
      {/* 两侧通气孔 */}
      <circle cx="22" cy="44" r="3" fill="#1CB0F6" stroke="#1A1A1A" strokeWidth="1" />
      <circle cx="98" cy="44" r="3" fill="#1CB0F6" stroke="#1A1A1A" strokeWidth="1" />
    </g>
  );
}

// ============================================================
// 酷炫墨镜（横向矩形墨镜遮在双眼上）
// ============================================================
function Sunglasses() {
  return (
    <g>
      {/* 左镜片 */}
      <rect x="32" y="42" width="22" height="12" rx="3" fill="#1A1A1A" stroke="#000" strokeWidth="1.4" />
      {/* 右镜片 */}
      <rect x="66" y="42" width="22" height="12" rx="3" fill="#1A1A1A" stroke="#000" strokeWidth="1.4" />
      {/* 中间桥 */}
      <line x1="54" y1="48" x2="66" y2="48" stroke="#1A1A1A" strokeWidth="2.8" />
      {/* 反光高光 */}
      <path d="M 36 46 L 42 44" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.85" />
      <path d="M 70 46 L 76 44" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.85" />
    </g>
  );
}

// ============================================================
// 海盗船长（黑色三角帽 + 骷髅）
// ============================================================
function PirateHat() {
  return (
    <g>
      {/* 帽子主体（中间高两边翘的三角） */}
      <path
        d="M 26 24 Q 60 -2 94 24 Q 84 30 60 28 Q 36 30 26 24 Z"
        fill="#1A1A1A"
        stroke="#000"
        strokeWidth="1.4"
      />
      {/* 高光反光 */}
      <path d="M 38 18 Q 60 8 82 18" fill="none" stroke="#3F3F46" strokeWidth="1.8" opacity="0.7" />
      {/* 中央骷髅 */}
      <circle cx="60" cy="14" r="4" fill="#FFFFFF" />
      <circle cx="58.5" cy="13.5" r="0.8" fill="#000" />
      <circle cx="61.5" cy="13.5" r="0.8" fill="#000" />
      {/* 交叉骨头 */}
      <line x1="55" y1="19" x2="65" y2="19" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="55" y1="17.5" x2="65" y2="20.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

// ============================================================
// DJ 耳机（U 型横跨头顶 + 两侧大圆耳罩）
// ============================================================
function Headphones() {
  return (
    <g>
      {/* 头梁 */}
      <path d="M 22 38 Q 60 8 98 38" fill="none" stroke="#1A1A1A" strokeWidth="3.6" strokeLinecap="round" />
      {/* 头梁内层高光 */}
      <path d="M 26 36 Q 60 12 94 36" fill="none" stroke="#3F3F46" strokeWidth="1.6" opacity="0.7" />
      {/* 左耳罩 */}
      <circle cx="20" cy="46" r="9" fill="#1A1A1A" stroke="#000" strokeWidth="1.2" />
      <circle cx="20" cy="46" r="5" fill="#FF4B4B" />
      {/* 右耳罩 */}
      <circle cx="100" cy="46" r="9" fill="#1A1A1A" stroke="#000" strokeWidth="1.2" />
      <circle cx="100" cy="46" r="5" fill="#FF4B4B" />
    </g>
  );
}

// ============================================================
// 桂冠（两片金叶环绕头顶）
// ============================================================
function LaurelWreath() {
  return (
    <g>
      {/* 左侧弧形枝干 */}
      <path d="M 30 32 Q 26 18 38 6" fill="none" stroke="#C89600" strokeWidth="2" strokeLinecap="round" />
      {/* 右侧弧形枝干 */}
      <path d="M 90 32 Q 94 18 82 6" fill="none" stroke="#C89600" strokeWidth="2" strokeLinecap="round" />
      {/* 左叶子 */}
      <ellipse cx="29" cy="26" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(-30 29 26)" />
      <ellipse cx="28" cy="18" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(-50 28 18)" />
      <ellipse cx="32" cy="10" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(-70 32 10)" />
      {/* 右叶子 */}
      <ellipse cx="91" cy="26" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(30 91 26)" />
      <ellipse cx="92" cy="18" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(50 92 18)" />
      <ellipse cx="88" cy="10" rx="4" ry="2.4" fill="#FFC800" stroke="#C89600" strokeWidth="0.9" transform="rotate(70 88 10)" />
      {/* 顶部红丝带 */}
      <path d="M 56 6 L 60 2 L 64 6 L 60 10 Z" fill="#FF4B4B" stroke="#C00" strokeWidth="0.8" />
    </g>
  );
}

// ============================================================
// 绅士领结（在脖颈下方）
// ============================================================
function BowTie() {
  return (
    <g>
      {/* 左半 */}
      <path d="M 60 78 L 48 72 L 48 86 Z" fill="#FF4B4B" stroke="#1A1A1A" strokeWidth="1.2" />
      {/* 右半 */}
      <path d="M 60 78 L 72 72 L 72 86 Z" fill="#FF4B4B" stroke="#1A1A1A" strokeWidth="1.2" />
      {/* 中央结节 */}
      <rect x="57" y="74" width="6" height="9" rx="1" fill="#C00" stroke="#1A1A1A" strokeWidth="1" />
      {/* 高光 */}
      <line x1="51" y1="76" x2="55" y2="78" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.8" />
      <line x1="69" y1="76" x2="65" y2="78" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.8" />
    </g>
  );
}
