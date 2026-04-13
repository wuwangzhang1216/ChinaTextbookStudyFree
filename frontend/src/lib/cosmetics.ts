/**
 * cosmetics.ts —— 美妆道具目录（吉祥物皮肤 + UI 主题 + 课程背景）
 *
 * 设计原则（公益项目特别约束）：
 *   - 所有皮肤都能通过游戏内 gems 解锁
 *   - 没有"premium 限定"或"充值专属"
 *   - 不影响游戏数值，**纯美学**
 *   - 每个 cosmetic 都能在前端零依赖渲染（SVG / CSS / 内置图标），不依赖外部素材
 *
 * 三种品类：
 *   1. mascot_skin   —— 吉祥物皮肤（帽子/眼镜/披风等装扮叠加）
 *   2. ui_theme      —— UI 主题色（影响 primary 色、按钮色等 CSS 变量）
 *   3. lesson_backdrop —— 课程页背景图案（学习时的氛围）
 */

export type CosmeticType = "mascot_skin" | "ui_theme" | "lesson_backdrop";

export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  /** 中文名 */
  name: string;
  /** 一句话描述 */
  description: string;
  /** 价格（gems），免费物品填 0 */
  cost: number;
  rarity: CosmeticRarity;
  /** 是否新手默认拥有 */
  starter?: boolean;
}

// ============================================================
// Mascot 皮肤（叠加 SVG 装饰，由 MascotSkinOverlay 渲染）
// ============================================================

export const MASCOT_SKINS: CosmeticItem[] = [
  {
    id: "skin_default",
    type: "mascot_skin",
    name: "原版聪聪",
    description: "我们最熟悉的小猫头鹰",
    cost: 0,
    rarity: "common",
    starter: true,
  },
  {
    id: "skin_graduate",
    type: "mascot_skin",
    name: "学士帽",
    description: "戴上学士帽的聪聪，学者气质满分",
    cost: 80,
    rarity: "common",
  },
  {
    id: "skin_glasses",
    type: "mascot_skin",
    name: "圆框眼镜",
    description: "复古圆框眼镜，文艺青年聪聪",
    cost: 100,
    rarity: "common",
  },
  {
    id: "skin_party",
    type: "mascot_skin",
    name: "派对锥帽",
    description: "彩虹色派对帽，每天都是节日",
    cost: 150,
    rarity: "rare",
  },
  {
    id: "skin_crown",
    type: "mascot_skin",
    name: "金色皇冠",
    description: "学习路上的小国王/小女王",
    cost: 250,
    rarity: "rare",
  },
  {
    id: "skin_wizard",
    type: "mascot_skin",
    name: "法师尖帽",
    description: "知识就是魔法",
    cost: 300,
    rarity: "epic",
  },
  {
    id: "skin_astronaut",
    type: "mascot_skin",
    name: "宇航员头盔",
    description: "向知识的宇宙出发！",
    cost: 500,
    rarity: "legendary",
  },
  {
    id: "skin_sunglasses",
    type: "mascot_skin",
    name: "酷炫墨镜",
    description: "Cool 到没朋友的墨镜聪聪",
    cost: 120,
    rarity: "common",
  },
  {
    id: "skin_pirate",
    type: "mascot_skin",
    name: "海盗船长",
    description: "扬帆出海寻知识宝藏",
    cost: 220,
    rarity: "rare",
  },
  {
    id: "skin_headphones",
    type: "mascot_skin",
    name: "DJ 耳机",
    description: "戴上耳机就能听见学习节奏",
    cost: 180,
    rarity: "rare",
  },
  {
    id: "skin_laurel",
    type: "mascot_skin",
    name: "桂冠加身",
    description: "胜利者才能戴的金色桂冠",
    cost: 280,
    rarity: "epic",
  },
  {
    id: "skin_bowtie",
    type: "mascot_skin",
    name: "绅士领结",
    description: "戴上领结就是优雅的小学者",
    cost: 60,
    rarity: "common",
  },
];

// ============================================================
// UI 主题（CSS 变量）
// ============================================================

export interface UiThemeData {
  /** 主色（按钮、强调） */
  primary: string;
  primaryDark: string;
  /** 次要强调色 */
  accent: string;
  /** 页面背景 */
  bg: string;
  /** 是否暗色文字（亮色主题用 false） */
  darkText?: boolean;
}

export interface UiTheme extends CosmeticItem {
  type: "ui_theme";
  data: UiThemeData;
}

export const UI_THEMES: UiTheme[] = [
  {
    id: "theme_default",
    type: "ui_theme",
    name: "Duolingo 绿",
    description: "经典清爽的草地绿",
    cost: 0,
    rarity: "common",
    starter: true,
    data: {
      primary: "#58CC02",
      primaryDark: "#58A700",
      accent: "#1CB0F6",
      bg: "#F7F7F7",
    },
  },
  {
    id: "theme_ocean",
    type: "ui_theme",
    name: "海洋蓝",
    description: "像在大海里学习",
    cost: 200,
    rarity: "common",
    data: {
      primary: "#1CB0F6",
      primaryDark: "#1899D6",
      accent: "#58CC02",
      bg: "#EFF8FE",
    },
  },
  {
    id: "theme_sakura",
    type: "ui_theme",
    name: "樱花粉",
    description: "粉嫩可爱的春天",
    cost: 200,
    rarity: "common",
    data: {
      primary: "#FF7AB6",
      primaryDark: "#E5588E",
      accent: "#FFC800",
      bg: "#FDF3F8",
    },
  },
  {
    id: "theme_sunshine",
    type: "ui_theme",
    name: "阳光黄",
    description: "充满活力的金色",
    cost: 250,
    rarity: "rare",
    data: {
      primary: "#FFB200",
      primaryDark: "#E59800",
      accent: "#FF6B6B",
      bg: "#FFF9E8",
    },
  },
  {
    id: "theme_galaxy",
    type: "ui_theme",
    name: "星空紫",
    description: "深邃神秘的宇宙紫",
    cost: 400,
    rarity: "epic",
    data: {
      primary: "#A855F7",
      primaryDark: "#7C3AED",
      accent: "#FFC800",
      bg: "#F5EEFF",
    },
  },
  {
    id: "theme_mint",
    type: "ui_theme",
    name: "薄荷青",
    description: "清新提神的薄荷青绿",
    cost: 220,
    rarity: "common",
    data: {
      primary: "#10B981",
      primaryDark: "#059669",
      accent: "#FBBF24",
      bg: "#ECFDF5",
    },
  },
  {
    id: "theme_coral",
    type: "ui_theme",
    name: "珊瑚红",
    description: "温暖热情的活力珊瑚",
    cost: 300,
    rarity: "rare",
    data: {
      primary: "#FF6B6B",
      primaryDark: "#E5484D",
      accent: "#1CB0F6",
      bg: "#FFF4F4",
    },
  },
  {
    id: "theme_aurora",
    type: "ui_theme",
    name: "极光",
    description: "梦幻的北极极光蓝绿",
    cost: 500,
    rarity: "legendary",
    data: {
      primary: "#22D3EE",
      primaryDark: "#0891B2",
      accent: "#A855F7",
      bg: "#ECFEFF",
    },
  },
];

// ============================================================
// 课程背景（lesson backdrop）—— 答题时的页面氛围
// ============================================================

export interface BackdropData {
  /** 背景渐变 / 图案 CSS */
  background: string;
  /** 是否需要顶层半透明白罩防止背景吃掉文字 */
  needsOverlay?: boolean;
}

export interface LessonBackdrop extends CosmeticItem {
  type: "lesson_backdrop";
  data: BackdropData;
}

export const LESSON_BACKDROPS: LessonBackdrop[] = [
  {
    id: "backdrop_default",
    type: "lesson_backdrop",
    name: "干净简洁",
    description: "默认的纯净背景",
    cost: 0,
    rarity: "common",
    starter: true,
    data: { background: "#F7F7F7" },
  },
  {
    id: "backdrop_clouds",
    type: "lesson_backdrop",
    name: "蓝天白云",
    description: "在云朵里学习",
    cost: 120,
    rarity: "common",
    data: {
      background:
        "linear-gradient(180deg, #BFE3F7 0%, #E6F3FB 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_forest",
    type: "lesson_backdrop",
    name: "森林晨光",
    description: "清晨的森林透着阳光",
    cost: 150,
    rarity: "common",
    data: {
      background:
        "linear-gradient(180deg, #D7F0CF 0%, #EDF8E5 60%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_sunset",
    type: "lesson_backdrop",
    name: "黄昏彩霞",
    description: "傍晚的天空是橘粉色",
    cost: 200,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #FFD7B3 0%, #FFE9D6 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_starfield",
    type: "lesson_backdrop",
    name: "星空夜",
    description: "深邃的紫色星空",
    cost: 350,
    rarity: "epic",
    data: {
      background:
        "radial-gradient(ellipse at top, #2A1B5C 0%, #1A0F3D 60%, #0F0822 100%)",
      needsOverlay: true,
    },
  },
  {
    id: "backdrop_sakura",
    type: "lesson_backdrop",
    name: "樱花飘落",
    description: "粉色花瓣的春日",
    cost: 220,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #FFE0EC 0%, #FFF0F6 50%, #FFFFFF 100%)",
    },
  },
  {
    id: "backdrop_ocean",
    type: "lesson_backdrop",
    name: "深海漫游",
    description: "在海底世界学习",
    cost: 280,
    rarity: "rare",
    data: {
      background:
        "linear-gradient(180deg, #93C5FD 0%, #BFDBFE 50%, #DBEAFE 100%)",
    },
  },
  {
    id: "backdrop_aurora",
    type: "lesson_backdrop",
    name: "极光夜",
    description: "极地夜空的彩色光带",
    cost: 480,
    rarity: "legendary",
    data: {
      background:
        "linear-gradient(180deg, #064E3B 0%, #047857 30%, #0E7490 60%, #312E81 100%)",
      needsOverlay: true,
    },
  },
];

// ============================================================
// 全部目录 + 查询函数
// ============================================================

export const ALL_COSMETICS: CosmeticItem[] = [
  ...MASCOT_SKINS,
  ...UI_THEMES,
  ...LESSON_BACKDROPS,
];

export function getCosmeticById(id: string): CosmeticItem | undefined {
  return ALL_COSMETICS.find(c => c.id === id);
}

export function getCosmeticsByType(type: CosmeticType): CosmeticItem[] {
  return ALL_COSMETICS.filter(c => c.type === type);
}

export function getStarterCosmetics(): CosmeticItem[] {
  return ALL_COSMETICS.filter(c => c.starter);
}

/**
 * 默认装备（首次启动 / migrate 兜底用）
 */
export const DEFAULT_EQUIPPED = {
  mascotSkin: "skin_default",
  uiTheme: "theme_default",
  lessonBackdrop: "backdrop_default",
} as const;

export const RARITY_COLORS: Record<CosmeticRarity, string> = {
  common: "#9CA3AF",
  rare: "#1CB0F6",
  epic: "#A855F7",
  legendary: "#FFC800",
};

export const RARITY_LABELS: Record<CosmeticRarity, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
};
