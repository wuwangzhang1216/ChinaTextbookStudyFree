"use client";

/**
 * Modal — 可复用的模态框底座
 *
 * backdrop 半透明黑 + blur，内容 spring 弹入。
 * 点击 backdrop 或按 Esc 触发 onClose。
 *
 * a11y:
 *   - role="dialog" + aria-modal="true"
 *   - 打开时 trap focus 在 modal 内；Tab/Shift+Tab 循环
 *   - 关闭后自动还焦给打开时的元素
 *   - 打开时锁 body 滚动
 */

import { useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /** 禁用 backdrop 点击关闭 */
  dismissible?: boolean;
  /** 无障碍标题（aria-label），如未提供尽量给一个 */
  ariaLabel?: string;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({ open, onClose, children, dismissible = true, ariaLabel }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible && onClose) onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose, dismissible]);

  // 焦点陷阱 + 还焦 + 滚动锁
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 下一帧聚焦第一个可聚焦元素
    const raf = requestAnimationFrame(() => {
      const root = dialogRef.current;
      if (!root) return;
      const firstFocusable = root.querySelector<HTMLElement>(FOCUSABLE);
      (firstFocusable ?? root).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : labelId}
            tabIndex={-1}
            initial={{ y: 30, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl border-2 border-bg-softer p-6 focus:outline-none"
            style={{ boxShadow: "0 10px 0 0 #e5e5e5, 0 16px 40px rgba(0,0,0,0.15)" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
