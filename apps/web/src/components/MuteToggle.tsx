"use client";

import { useEffect } from "react";
import { Volume, VolumeMute } from "@/components/icons";
import { useProgressStore } from "@/store/progress";
import { setMuted, playSfx, primeAudioOnFirstGesture } from "@/lib/sfx";

/** 同步 store.muted → sfx 全局静音 & 首次启动 prime AudioContext */
export function useSyncMute() {
  const muted = useProgressStore(s => s.muted);
  useEffect(() => {
    setMuted(muted);
  }, [muted]);
  useEffect(() => {
    primeAudioOnFirstGesture();
  }, []);
}

interface MuteToggleProps {
  className?: string;
}

export function MuteToggle({ className }: MuteToggleProps) {
  const muted = useProgressStore(s => s.muted);
  const toggleMute = useProgressStore(s => s.toggleMute);

  return (
    <button
      type="button"
      aria-label={muted ? "开启音效" : "关闭音效"}
      onClick={() => {
        toggleMute();
        // 解除瞬间播一下反馈（仅在从 muted 切回 on 时）
        if (muted) {
          setMuted(false);
          playSfx("tap");
        }
      }}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-bg-softer transition-colors ${className ?? ""}`}
    >
      {muted ? <VolumeMute className="w-5 h-5" /> : <Volume className="w-5 h-5" />}
    </button>
  );
}

/**
 * 自动朗读开关 —— 控制题干/知识卡/讲解是否自动播 TTS。
 * 面向家长/大童：默认开；低龄从此免找喇叭。
 */
export function AutoNarrateToggle({ className }: MuteToggleProps) {
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const toggleAutoNarrate = useProgressStore(s => s.toggleAutoNarrate);

  return (
    <button
      type="button"
      aria-label={autoNarrate ? "关闭自动朗读" : "开启自动朗读"}
      title={autoNarrate ? "自动朗读：开" : "自动朗读：关"}
      onClick={() => {
        toggleAutoNarrate();
        playSfx("tap");
      }}
      className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full text-xs font-extrabold transition-colors ${
        autoNarrate
          ? "bg-primary/15 text-primary-dark hover:bg-primary/25"
          : "bg-bg-soft text-ink-softer hover:bg-bg-softer"
      } ${className ?? ""}`}
    >
      <Volume className="w-3.5 h-3.5" />
      <span>自动</span>
    </button>
  );
}
