import type { Config } from "tailwindcss";

/**
 * 多邻国官方配色（design.duolingo.com/identity/color）
 *
 * 命名同时提供"动物别名"（duo 的色板）和"语义别名"（primary/secondary 等）。
 * 两者指向同一 hex，二选一使用互不冲突。
 */

const chineseStack = [
  '"PingFang SC"',
  '"Microsoft YaHei"',
  '"Hiragino Sans GB"',
  "sans-serif",
];

// ============================================================
// Duolingo 动物色板（源自官方品牌指南）
// ============================================================

const DUO = {
  // 绿（Feather 系列）
  feather: "#58CC02",  // 主绿
  treeFrog: "#58A700", // 按钮底部阴影 / 按下去的深色
  maskGreen: "#89E219", // 聪聪眼罩 / 高亮绿
  // 蓝
  macaw: "#1CB0F6",    // 主蓝
  whale: "#1899D6",    // 蓝按钮阴影
  iguana: "#BBE7FC",   // 浅蓝高亮
  humpback: "#235390", // 深海蓝，用于深色文本/标题
  sea: "#14D4F4",      // 青绿
  // 红
  cardinal: "#FF4B4B", // 主红
  fire: "#EA2B2B",     // 红按钮阴影
  walkingFish: "#FFC1C1", // 浅粉红
  // 黄橙
  bee: "#FFC800",      // 主黄
  canary: "#FFDE00",   // 更亮的柠檬黄
  fox: "#FF9600",      // 橙（Duo 嘴喙）
  // 紫
  beetle: "#CE82FF",
  // 中性灰（从浅到深）
  snow: "#FFFFFF",
  polar: "#F7F7F7",
  swan: "#E5E5E5",
  hare: "#AFAFAF",
  wolf: "#777777",
  eel: "#4B4B4B",
} as const;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 动物色板直通（可直接 bg-feather / text-eel 等）
        feather: DUO.feather,
        "tree-frog": DUO.treeFrog,
        "mask-green": DUO.maskGreen,
        macaw: DUO.macaw,
        whale: DUO.whale,
        iguana: DUO.iguana,
        humpback: DUO.humpback,
        sea: DUO.sea,
        cardinal: DUO.cardinal,
        fire: DUO.fire,
        bee: DUO.bee,
        canary: DUO.canary,
        fox: DUO.fox,
        beetle: DUO.beetle,
        snow: DUO.snow,
        polar: DUO.polar,
        swan: DUO.swan,
        hare: DUO.hare,
        wolf: DUO.wolf,
        eel: DUO.eel,

        // 语义别名（维持原有命名以便现有组件零改动）
        primary: {
          DEFAULT: DUO.feather,   // #58CC02
          dark: DUO.treeFrog,     // #58A700 ← 修正
          light: DUO.maskGreen,   // #89E219
        },
        secondary: {
          DEFAULT: DUO.macaw,     // #1CB0F6
          dark: DUO.whale,        // #1899D6 ← 修正
          light: DUO.iguana,      // #BBE7FC
        },
        danger: {
          DEFAULT: DUO.cardinal,  // #FF4B4B
          dark: DUO.fire,         // #EA2B2B ← 修正
        },
        warning: DUO.bee,         // #FFC800
        gold: DUO.bee,            // #FFC800 ← 统一到 Bee，消除重复
        ink: {
          DEFAULT: DUO.eel,       // #4B4B4B ← 修正（原 #3C3C3C）
          light: DUO.wolf,        // #777777
          softer: DUO.hare,       // #AFAFAF
        },
        bg: {
          DEFAULT: DUO.snow,      // #FFFFFF
          soft: DUO.polar,        // #F7F7F7
          softer: DUO.swan,       // #E5E5E5 ← 修正（原 #EFEFEF）
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Hiragino Sans GB"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", ...chineseStack],
      },
      boxShadow: {
        // 多邻国按钮的"立体感"——底部硬阴影
        chunky: "0 4px 0 0 rgba(0,0,0,0.15)",
        "chunky-primary": `0 4px 0 0 ${DUO.treeFrog}`,     // #58A700
        "chunky-secondary": `0 4px 0 0 ${DUO.whale}`,      // #1899D6
        "chunky-danger": `0 4px 0 0 ${DUO.fire}`,          // #EA2B2B
        glow: "0 0 0 6px rgba(88,204,2,0.25)",
        "glow-gold": "0 0 0 8px rgba(255,200,0,0.3)",
      },
      letterSpacing: {
        tightest: "-0.025em",
      },
      animation: {
        "bounce-slow": "bounce 2s infinite",
        wiggle: "wiggle 0.4s ease-in-out",
        "pop-in": "popIn 0.3s ease-out",
        "ripple": "ripple 0.55s ease-out forwards",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "float-idle": "floatIdle 3.2s ease-in-out infinite",
        "heart-beat": "heartBeat 1.1s ease-in-out infinite",
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.45" },
          "100%": { transform: "scale(3)", opacity: "0" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,200,0,0.55)" },
          "50%": { boxShadow: "0 0 0 14px rgba(255,200,0,0)" },
        },
        floatIdle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        heartBeat: {
          "0%, 100%": { transform: "scale(1)" },
          "15%": { transform: "scale(1.12)" },
          "30%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.08)" },
          "60%": { transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
