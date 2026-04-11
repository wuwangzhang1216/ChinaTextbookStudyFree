"use client";

/**
 * ConfettiCanvas — 零依赖手写撒花特效
 *
 * 在关卡完成时激活，rAF 驱动 ~140 颗粒子：
 * 矩形 / 圆形 / 细长丝带，随机颜色，受重力和阻力影响，
 * 最后淡出。卸载时释放 rAF。
 */

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: "rect" | "circle" | "ribbon";
  life: number;
}

// 全部取自 Duolingo 动物色板：Feather / Macaw / Bee / Cardinal / Canary / Mask / Fox / Beetle
const COLORS = [
  "#58CC02", // Feather
  "#1CB0F6", // Macaw
  "#FFC800", // Bee
  "#FF4B4B", // Cardinal
  "#FFDE00", // Canary
  "#89E219", // Mask Green
  "#FF9600", // Fox
  "#CE82FF", // Beetle
];

interface ConfettiCanvasProps {
  active: boolean;
  particleCount?: number;
  duration?: number; // ms，粒子总生存时间
}

export function ConfettiCanvas({ active, particleCount = 140, duration = 3200 }: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 初始化粒子：从屏幕中上部两个"喷泉"喷发
    const particles: Particle[] = [];
    const cx1 = window.innerWidth * 0.3;
    const cx2 = window.innerWidth * 0.7;
    const cy = window.innerHeight * 0.25;

    for (let i = 0; i < particleCount; i++) {
      const fromLeft = i % 2 === 0;
      const angle = (Math.random() - 0.5) * Math.PI * 0.9 - Math.PI / 2;
      const speed = 8 + Math.random() * 10;
      particles.push({
        x: fromLeft ? cx1 : cx2,
        y: cy,
        vx: Math.cos(angle) * speed + (fromLeft ? 1 : -1) * 1.5,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: (["rect", "circle", "ribbon"] as const)[Math.floor(Math.random() * 3)],
        life: 1,
      });
    }

    startRef.current = performance.now();

    const render = (now: number) => {
      const elapsed = now - startRef.current;
      const t = elapsed / duration;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const gravity = 0.28;
      const drag = 0.992;

      let alive = 0;
      for (const p of particles) {
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;

        // 淡出最后 30%
        p.life = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        if (p.life <= 0 || p.y > window.innerHeight + 40) continue;
        alive++;

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // ribbon
          ctx.fillRect(-p.size / 2, -p.size * 0.15, p.size * 1.4, p.size * 0.3);
        }
        ctx.restore();
      }

      ctx.restore();

      if (t < 1 && alive > 0) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [active, particleCount, duration]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
