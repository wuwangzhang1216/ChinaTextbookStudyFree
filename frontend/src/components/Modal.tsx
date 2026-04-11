"use client";

/**
 * Modal — 可复用的模态框底座
 *
 * backdrop 半透明黑 + blur，内容 spring 弹入。
 * 点击 backdrop 或按 Esc 触发 onClose。
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /** 禁用 backdrop 点击关闭 */
  dismissible?: boolean;
}

export function Modal({ open, onClose, children, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible && onClose) onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose, dismissible]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-5"
          onClick={() => dismissible && onClose?.()}
          style={{ backgroundColor: "rgba(17,17,17,0.45)", backdropFilter: "blur(6px)" }}
        >
          <motion.div
            initial={{ y: 30, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl border-2 border-bg-softer p-6"
            style={{ boxShadow: "0 10px 0 0 #e5e5e5, 0 16px 40px rgba(0,0,0,0.15)" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
