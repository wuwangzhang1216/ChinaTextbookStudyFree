"use client";

/**
 * AppShell —— 桌面端三栏布局壳（左 SideNav / 中央内容 / 右 RightRail）
 *
 * 移动端：仅渲染 children，依赖 BottomNav 提供导航。
 * 桌面端 (lg+)：固定 sidebar + 居中内容列 + 右侧 rail（可选）。
 */

import type { ReactNode } from "react";
import { SideNav } from "./SideNav";
import { RightRail } from "./RightRail";

interface AppShellProps {
  children: ReactNode;
  /** 自定义右栏。传 null 显式隐藏；不传则显示默认 RightRail */
  right?: ReactNode | null;
  /** 中央内容栏最大宽度，默认 640 */
  centerMaxWidth?: number;
}

export function AppShell({ children, right, centerMaxWidth = 640 }: AppShellProps) {
  const showRight = right !== null;
  return (
    <div className="min-h-screen w-full">
      {/* 桌面三栏（无 right 时降级为两栏，中央列拿回 360px 空间） */}
      <div
        className="hidden lg:grid mx-auto max-w-[1240px] gap-6 px-6 py-6"
        style={{
          gridTemplateColumns: showRight
            ? "260px minmax(0, 1fr) 360px"
            : "260px minmax(0, 1fr)",
        }}
      >
        <aside className="sticky top-6 self-start h-[calc(100vh-3rem)]">
          <SideNav />
        </aside>
        <main className="min-w-0">
          <div className="mx-auto w-full" style={{ maxWidth: centerMaxWidth }}>
            {children}
          </div>
        </main>
        {showRight && (
          <aside className="sticky top-6 self-start h-[calc(100vh-3rem)] overflow-y-auto pb-6">
            {right ?? <RightRail />}
          </aside>
        )}
      </div>

      {/* 移动端 */}
      <div className="lg:hidden">{children}</div>
    </div>
  );
}
