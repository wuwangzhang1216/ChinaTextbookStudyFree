"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Heart } from "@/components/icons";
import { cn } from "@/lib/cn";

interface HeartsBarProps {
  total: number;
  remaining: number;
}

export function HeartsBar({ total, remaining }: HeartsBarProps) {
  const prevRemaining = useRef(remaining);
  const [lostIndex, setLostIndex] = useState<number | null>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (remaining < prevRemaining.current) {
      // 最近丢失的那颗在索引 = remaining（因为 i < remaining 是活的）
      setLostIndex(remaining);
      const t = setTimeout(() => setLostIndex(null), 900);
      return () => clearTimeout(t);
    }
    prevRemaining.current = remaining;
  }, [remaining]);

  useEffect(() => {
    prevRemaining.current = remaining;
  }, [remaining]);

  return (
    <div className="flex items-center gap-1 relative">
      {Array.from({ length: total }).map((_, i) => {
        const alive = i < remaining;
        const isBreaking = lostIndex === i;
        return (
          <div key={i} className="relative w-6 h-6">
            <motion.div
              animate={
                alive && !prefersReduced
                  ? { scale: [1, 1.1, 1, 1.06, 1] }
                  : { scale: 1 }
              }
              transition={
                alive
                  ? { duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }
                  : { duration: 0 }
              }
            >
              <Heart
                className={cn(
                  "w-6 h-6 transition-colors",
                  alive ? "fill-danger text-danger" : "fill-bg-softer text-bg-softer",
                )}
              />
            </motion.div>

            {/* 心碎动画 */}
            <AnimatePresence>
              {isBreaking && (
                <>
                  {/* 左半片 */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                    animate={{ opacity: 0, x: -10, y: 14, rotate: -35 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  >
                    <Heart className="w-6 h-6 fill-danger text-danger" style={{ clipPath: "inset(0 50% 0 0)" }} />
                  </motion.div>
                  {/* 右半片 */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                    animate={{ opacity: 0, x: 10, y: 14, rotate: 35 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  >
                    <Heart className="w-6 h-6 fill-danger text-danger" style={{ clipPath: "inset(0 0 0 50%)" }} />
                  </motion.div>
                  {/* 红色闪光 */}
                  <motion.div
                    className="absolute inset-[-6px] rounded-full pointer-events-none"
                    initial={{ opacity: 0.6, scale: 0.6 }}
                    animate={{ opacity: 0, scale: 1.8 }}
                    transition={{ duration: 0.5 }}
                    style={{ background: "radial-gradient(circle, rgba(255,75,75,0.55), transparent 70%)" }}
                  />
                </>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
