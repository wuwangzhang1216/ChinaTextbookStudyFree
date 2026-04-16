"use client";

/**
 * Toast —— 全局轻提示系统
 *
 * 用法：
 *   1. 在 layout.tsx 用 <ToastProvider> 包裹（已挂载，全局唯一）
 *   2. 任意组件里 const toast = useToast(); toast.success("已装备"); toast.error("宝石不够");
 *
 * 设计：
 *   - 多条堆叠：bottom-center 向上推；最多同时 3 条
 *   - 4 种类型：success / error / info / warning（颜色 + 图标 + chunky 阴影）
 *   - 自动 dismiss 2.4s（失败/警告 3.2s），可点击关闭
 *   - role="status" + aria-live="polite" 屏幕阅读器友好
 *   - reduced-motion 自动降级
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, XCircle, Lightning, Star } from "@/components/icons";

export type ToastKind = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
  duration: number;
}

interface ToastApi {
  show: (msg: string, kind?: ToastKind, duration?: number) => void;
  success: (msg: string, duration?: number) => void;
  error: (msg: string, duration?: number) => void;
  info: (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const KIND_STYLE: Record<
  ToastKind,
  { bg: string; shadow: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  success: { bg: "#58CC02", shadow: "#58A700", Icon: Check },
  error: { bg: "#FF4B4B", shadow: "#C40000", Icon: XCircle },
  info: { bg: "#1CB0F6", shadow: "#1899D6", Icon: Lightning },
  warning: { bg: "#FFC800", shadow: "#D9A800", Icon: Star },
};

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 2400;
const DEFAULT_DURATION_LONG = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems(list => list.filter(i => i.id !== id));
  }, []);

  const show = useCallback(
    (msg: string, kind: ToastKind = "info", duration?: number) => {
      const id = ++idRef.current;
      const dur =
        duration ?? (kind === "error" || kind === "warning" ? DEFAULT_DURATION_LONG : DEFAULT_DURATION);
      setItems(list => {
        const next = [...list, { id, msg, kind, duration: dur }];
        // 超过 MAX_VISIBLE 时丢掉最早的
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });
      window.setTimeout(() => remove(id), dur);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (msg, dur) => show(msg, "success", dur),
      error: (msg, dur) => show(msg, "error", dur),
      info: (msg, dur) => show(msg, "info", dur),
      warning: (msg, dur) => show(msg, "warning", dur),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* viewport */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
        aria-live="polite"
        role="status"
      >
        <AnimatePresence initial={false}>
          {items.map(item => {
            const style = KIND_STYLE[item.kind];
            const Icon = style.Icon;
            return (
              <motion.button
                key={item.id}
                type="button"
                layout
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.95 }}
                transition={{ type: "spring", damping: 22, stiffness: 320 }}
                onClick={() => remove(item.id)}
                className="pointer-events-auto inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-white max-w-[88vw]"
                style={{
                  backgroundColor: style.bg,
                  boxShadow: `0 5px 0 0 ${style.shadow}, 0 8px 24px rgba(0,0,0,0.18)`,
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate text-sm">{item.msg}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // 没有 Provider 时静默 fallback，避免 SSR / 测试报错
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}
