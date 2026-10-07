"use client";

import { useEffect, useRef, useState } from "react";
import { useProgressStore } from "@/store/progress";
import { stopTTS } from "./tts";
import { IntroNarrationPlayer, type IntroPlaybackSnapshot } from "./introNarration";
import { getIntroAudio } from "./introAudio";

const INITIAL: IntroPlaybackSnapshot = { status: "ready", segment: -1, progress: null, remainingSeconds: null };

export function useIntroNarration(sources: Array<string | null | undefined>, key: string, required: boolean, alreadyHeard = false) {
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const muted = useProgressStore(s => s.muted);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const heardRef = useRef(new Set<string>());
  const playerRef = useRef<IntroNarrationPlayer | null>(null);
  const [state, setState] = useState({ ...INITIAL, key });
  const snapshot = state.key === key ? state : INITIAL;
  const locked = required && !alreadyHeard && !heardRef.current.has(key);

  useEffect(() => {
    let active = true;
    let playbackStatus = INITIAL.status;
    const list = sourcesRef.current.filter((src): src is string => !!src);
    const player = new IntroNarrationPlayer(list, next => {
      if (!active) return;
      playbackStatus = next.status;
      if (next.status === "done") heardRef.current.add(key);
      setState({ ...next, key });
    }, undefined, undefined, getIntroAudio());
    playerRef.current = player;
    setState({ ...INITIAL, key });
    if (!alreadyHeard && autoNarrate && !muted && list.length > 0) {
      stopTTS();
      void player.start();
    }
    const resume = (event: Event) => {
      if (alreadyHeard || !event.isTrusted || !autoNarrate || muted || playbackStatus !== "ready" || list.length === 0) return;
      const target = event.target instanceof Element ? event.target : null;
      // Explicit speaker and navigation controls own their click handlers.
      if (target?.closest('a, [role="button"], [aria-label="退出课程"], [aria-label="上一步"]')) return;
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      playbackStatus = "loading";
      stopTTS();
      void player.start();
    };
    document.addEventListener("pointerup", resume, true);
    document.addEventListener("touchend", resume, true);
    document.addEventListener("keydown", resume, true);
    return () => {
      active = false;
      document.removeEventListener("pointerup", resume, true);
      document.removeEventListener("touchend", resume, true);
      document.removeEventListener("keydown", resume, true);
      playerRef.current = null;
      player.dispose();
    };
  }, [key, autoNarrate, muted, alreadyHeard]);

  function start() {
    if (muted) return;
    stopTTS();
    void playerRef.current?.start();
  }
  function continueWithoutAudio() {
    if (snapshot.status !== "error" && !muted) return;
    playerRef.current?.cancel();
    heardRef.current.add(key);
    setState({ ...INITIAL, status: "done", key, progress: 1, remainingSeconds: 0 });
  }
  return {
    ...snapshot,
    locked,
    muted,
    start,
    cancel: () => { playerRef.current?.cancel(); stopTTS(); },
    continueWithoutAudio,
  };
}
