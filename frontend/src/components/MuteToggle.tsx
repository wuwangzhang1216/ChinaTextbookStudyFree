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
      className={`text-ink-light hover:text-ink transition-colors ${className ?? ""}`}
    >
      {muted ? <VolumeMute className="w-5 h-5" /> : <Volume className="w-5 h-5" />}
    </button>
  );
}
