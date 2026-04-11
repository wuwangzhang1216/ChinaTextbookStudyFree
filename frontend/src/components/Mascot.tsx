"use client";

/**
 * 聪聪 — 我们的吉祥物，灵感来自人教版小学数学教材里的猫头鹰角色。
 *
 * 用纯 SVG 实现（不依赖任何素材），可通过 props 控制表情。
 * mood:
 *   - happy:    默认开心（眨眼睛）
 *   - cheer:    欢呼（眼睛弯成 ^ ^）
 *   - sad:      答错时（眉毛低下）
 *   - think:    思考中（一只眼半闭）
 *   - wave:     挥手打招呼
 *   - surprise: 惊讶（眼睛很大）
 *
 * reactTo: 一次性动画触发器（由父组件通过 key 或 prop 切换）
 *   - 'correct':  scale 弹跳 + 翅膀挥
 *   - 'wrong':    头摇摆 + 汗滴
 *   - 'levelup':  跳跃 + 金色光晕
 */

import { motion, useAnimation, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export type MascotMood = "happy" | "cheer" | "sad" | "think" | "wave" | "surprise";
export type MascotReaction = "correct" | "wrong" | "levelup" | null;

export interface MascotProps {
  mood?: MascotMood;
  size?: number;
  animate?: boolean;
  reactTo?: MascotReaction;
  /** 每次 reactKey 变化时触发一次 reactTo 动画 */
  reactKey?: number;
}

// Eel #4B4B4B — Duolingo 官方眼珠/线条色
const EEL = "#4B4B4B";

export function Mascot({
  mood = "happy",
  size = 120,
  animate = true,
  reactTo = null,
  reactKey = 0,
}: MascotProps) {
  const prefersReduced = useReducedMotion();
  const controls = useAnimation();
  const wingControls = useAnimation();
  const [blinkClose, setBlinkClose] = useState(false);
  const [showSweat, setShowSweat] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  // 持续呼吸
  useEffect(() => {
    if (!animate || prefersReduced) return;
    controls.start({
      y: [0, -3, 0],
      scale: [1, 1.02, 1],
      transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
    });
  }, [animate, prefersReduced, controls]);

  // 随机眨眼（仅在 happy/think/wave 时视觉合理；cheer/sad 时 Eyes 会自己替换）
  useEffect(() => {
    if (!animate || prefersReduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const next = 2500 + Math.random() * 3500;
      timer = setTimeout(() => {
        setBlinkClose(true);
        setTimeout(() => setBlinkClose(false), 120);
        schedule();
      }, next);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [animate, prefersReduced]);

  // 一次性反应动画
  useEffect(() => {
    if (!reactTo || prefersReduced) return;
    setShowSweat(false);
    setShowGlow(false);
    if (reactTo === "correct") {
      controls.start({
        scale: [1, 1.18, 0.95, 1.05, 1],
        y: [0, -6, 0],
        transition: { duration: 0.55, ease: "easeOut" },
      });
      wingControls.start({
        rotate: [0, -25, 0, -18, 0],
        transition: { duration: 0.55 },
      });
    } else if (reactTo === "wrong") {
      controls.start({
        rotate: [0, -8, 8, -6, 6, 0],
        x: [0, -2, 2, 0],
        transition: { duration: 0.55 },
      });
      setShowSweat(true);
      setTimeout(() => setShowSweat(false), 1200);
    } else if (reactTo === "levelup") {
      setShowGlow(true);
      controls.start({
        y: [0, -18, 0, -8, 0],
        scale: [1, 1.1, 1, 1.05, 1],
        transition: { duration: 0.9, ease: "easeOut" },
      });
      wingControls.start({
        rotate: [0, -30, 0, -30, 0],
        transition: { duration: 0.9 },
      });
      setTimeout(() => setShowGlow(false), 1400);
    }
  }, [reactTo, reactKey, controls, wingControls, prefersReduced]);

  return (
    <div style={{ width: size, height: size, position: "relative", display: "inline-block" }}>
      {showGlow && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.6, 1.4, 1.6] }}
          transition={{ duration: 1.2 }}
          style={{
            position: "absolute",
            inset: "-20%",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(255,200,0,0.55), rgba(255,200,0,0) 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <motion.svg
        animate={controls}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="聪聪"
        style={{ display: "block" }}
      >
        {/* 身体 (圆鼓鼓的椭圆) */}
        <ellipse cx="60" cy="72" rx="38" ry="36" fill="#9DD7F2" />
        {/* 肚皮 (浅色椭圆) */}
        <ellipse cx="60" cy="80" rx="22" ry="22" fill="#FFF6D6" />

        {/* 头部羽毛簇 (左右两撮) */}
        <path d="M 28 38 Q 24 18 38 28 Z" fill="#7BC4E5" />
        <path d="M 92 38 Q 96 18 82 28 Z" fill="#7BC4E5" />

        {/* 眼眶 (两个大白圈) */}
        <circle cx="44" cy="48" r="14" fill="#FFFFFF" stroke={EEL} strokeWidth="2.5" />
        <circle cx="76" cy="48" r="14" fill="#FFFFFF" stroke={EEL} strokeWidth="2.5" />

        {/* 眼珠（按 mood 切换；blinkClose 时盖上眼皮） */}
        {blinkClose && (mood === "happy" || mood === "think" || mood === "wave") ? (
          <>
            <path d="M 32 48 Q 44 52 56 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
            <path d="M 64 48 Q 76 52 88 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <Eyes mood={mood} />
        )}

        {/* 喙（橙色三角 Fox） */}
        <path d="M 54 60 L 66 60 L 60 70 Z" fill="#FF9600" stroke="#E68A00" strokeWidth="1.5" />

        {/* 左翅膀（反应时会挥动） */}
        <motion.ellipse
          cx="22"
          cy="76"
          rx="8"
          ry="14"
          fill="#7BC4E5"
          style={{ originX: "60px", originY: "76px" } as React.CSSProperties}
          animate={wingControls}
          transform={mood === "wave" ? "rotate(-45 22 76)" : "rotate(-15 22 76)"}
        />
        {/* 右翅膀 */}
        <ellipse cx="98" cy="76" rx="8" ry="14" fill="#7BC4E5" transform="rotate(15 98 76)" />

        {/* 脚（橙色小爪 Fox） */}
        <ellipse cx="48" cy="106" rx="6" ry="3" fill="#FF9600" />
        <ellipse cx="72" cy="106" rx="6" ry="3" fill="#FF9600" />

        {/* 汗滴（答错时） */}
        {showSweat && (
          <motion.path
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-4, 2, 8, 14] }}
            transition={{ duration: 1.1 }}
            d="M 92 28 Q 96 36 92 40 Q 88 36 92 28 Z"
            fill="#7EC4F0"
            stroke="#1CB0F6"
            strokeWidth="1.2"
          />
        )}
      </motion.svg>
    </div>
  );
}

function Eyes({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "cheer":
      return (
        <>
          <path d="M 36 48 Q 44 40 52 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
          <path d="M 68 48 Q 76 40 84 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "sad":
      return (
        <>
          <circle cx="44" cy="50" r="4" fill={EEL} />
          <circle cx="76" cy="50" r="4" fill={EEL} />
          <path d="M 32 38 L 50 42" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 88 38 L 70 42" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case "think":
      return (
        <>
          <circle cx="44" cy="48" r="5" fill={EEL} />
          <circle cx="45.5" cy="46.5" r="1.5" fill="#FFFFFF" />
          <path d="M 68 48 Q 76 46 84 48" fill="none" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case "surprise":
      return (
        <>
          <circle cx="44" cy="48" r="7" fill={EEL} />
          <circle cx="46" cy="46" r="2" fill="#FFFFFF" />
          <circle cx="76" cy="48" r="7" fill={EEL} />
          <circle cx="78" cy="46" r="2" fill="#FFFFFF" />
        </>
      );
    case "wave":
    case "happy":
    default:
      return (
        <>
          <circle cx="44" cy="48" r="5" fill={EEL} />
          <circle cx="45.5" cy="46.5" r="1.5" fill="#FFFFFF" />
          <circle cx="76" cy="48" r="5" fill={EEL} />
          <circle cx="77.5" cy="46.5" r="1.5" fill="#FFFFFF" />
        </>
      );
  }
}
