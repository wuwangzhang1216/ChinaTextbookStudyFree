"use client";

/**
 * SoundLink — Next.js Link 的有声版本
 *
 * 与 <Link> API 完全一致，多了一层"点击时播放 tap 音效 + 触感反馈"。
 * 用于所有需要导航的卡片/按钮型链接，避免每个组件都重复写 onClick + playSfx + haptic。
 */

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { playSfx, type SfxName } from "@/lib/sfx";
import { haptic, type HapticKind } from "@/lib/haptic";

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

interface SoundLinkProps extends LinkProps, AnchorProps {
  children: ReactNode;
  /** 音效名，默认 "tap" */
  sfx?: SfxName;
  /** 触感强度，默认 "light" */
  hapticIntensity?: HapticKind;
}

export function SoundLink({
  children,
  onClick,
  sfx = "tap",
  hapticIntensity = "light",
  ...rest
}: SoundLinkProps) {
  return (
    <Link
      {...rest}
      onClick={e => {
        playSfx(sfx);
        haptic(hapticIntensity);
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
