"use client";

/**
 * ChestModal —— 宝箱开箱弹窗。
 *
 * 流程：
 *   1. 弹入（盖子还是合着的 Chest 图标）
 *   2. 用户点"打开"按钮 → 盖子动画 + 音效 + 触觉 + 宝石飞出
 *   3. 展示 "+N 💎" 卡片
 *   4. 底部 CONTINUE 关闭弹窗
 *
 * 奖励已经在外层组件里 addGems 过了，这里只负责动画演出。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "./Modal";
import { Chest, ChestOpen, Gem } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface ChestModalProps {
  open: boolean;
  gems: number;
  onClose: () => void;
}

export function ChestModal({ open, gems, onClose }: ChestModalProps) {
  const [opened, setOpened] = useState(false);

  // 弹窗关闭后重置内部状态，下次弹开重新从"合着"开始
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setOpened(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleOpen() {
    if (opened) return;
    playSfx("unlock");
    haptic("success");
    setOpened(true);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <h2 className="text-2xl font-extrabold text-ink mb-1">宝箱来啦！</h2>
        <p className="text-ink-light text-sm mb-4">点击打开，领取奖励</p>

        <div className="relative w-36 h-36 flex items-center justify-center">
          {/* 脉冲光圈 */}
          {!opened && (
            <motion.div
              aria-hidden
              animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0, 0.35] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "rgba(255, 200, 0, 0.35)" }}
            />
          )}

          <AnimatePresence mode="wait">
            {!opened ? (
              <motion.button
                key="closed"
                type="button"
                onClick={handleOpen}
                initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 220 }}
                whileHover={{ y: -4, scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="relative text-warning"
                aria-label="打开宝箱"
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Chest className="w-28 h-28 drop-shadow-lg" />
                </motion.div>
              </motion.button>
            ) : (
              <motion.div
                key="open"
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 220 }}
                className="text-warning"
              >
                <ChestOpen className="w-28 h-28 drop-shadow-lg" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 开箱后飞出的宝石粒子 */}
          <AnimatePresence>
            {opened &&
              Array.from({ length: 8 }).map((_, i) => {
                const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
                const dist = 70 + Math.random() * 20;
                return (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 10,
                      opacity: [0, 1, 1, 0],
                      scale: [0.4, 1.1, 1, 0.6],
                    }}
                    transition={{ duration: 1.1, delay: 0.05 * i, ease: "easeOut" }}
                    className="absolute text-purple-500 pointer-events-none"
                  >
                    <Gem className="w-5 h-5 drop-shadow" />
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>

        {/* 奖励数字 */}
        <AnimatePresence>
          {opened && (
            <motion.div
              initial={{ scale: 0, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 14, delay: 0.55 }}
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-2xl text-white"
              style={{
                background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                boxShadow: "0 5px 0 0 #6b21a8",
              }}
            >
              <Gem className="w-7 h-7" />
              <span className="tabular-nums">+{gems}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onClose();
          }}
          className={`mt-6 w-full ${opened ? "btn-chunky-primary" : "btn-chunky-disabled"}`}
          disabled={!opened}
        >
          {opened ? "收下" : "先点开宝箱"}
        </button>
      </div>
    </Modal>
  );
}
