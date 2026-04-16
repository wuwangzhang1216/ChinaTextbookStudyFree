"use client";

/**
 * tts.ts — 播放 build-data 注入的预生成 TTS mp3。
 *
 * 设计：
 *   - 单例 HTMLAudioElement，同一时间只有一段 TTS 在播
 *   - 受全局 muted 状态控制
 *   - 简单 LRU 预加载（避免重复 fetch）
 */

import { isMuted } from "./sfx";

let el: HTMLAudioElement | null = null;
let currentSrc: string | null = null;

const preloaded = new Map<string, HTMLAudioElement>();
const PRELOAD_MAX = 16;

function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

export function preloadTTS(src: string | undefined | null) {
  if (!src || typeof window === "undefined") return;
  if (preloaded.has(src)) return;
  const a = new Audio();
  a.preload = "auto";
  a.src = src;
  preloaded.set(src, a);
  if (preloaded.size > PRELOAD_MAX) {
    const first = preloaded.keys().next().value as string | undefined;
    if (first) preloaded.delete(first);
  }
}

export function stopTTS() {
  const a = getEl();
  if (!a) return;
  a.pause();
  a.currentTime = 0;
  currentSrc = null;
}

/**
 * 播放并在结束时 resolve（出错或立即被打断也 resolve）。
 */
export function playTTS(src: string | undefined | null): Promise<void> {
  if (!src || isMuted()) return Promise.resolve();
  const a = getEl();
  if (!a) return Promise.resolve();
  // 同一段再次点击 → 停止
  if (currentSrc === src && !a.paused) {
    a.pause();
    a.currentTime = 0;
    currentSrc = null;
    return Promise.resolve();
  }
  a.pause();
  a.src = src;
  a.currentTime = 0;
  currentSrc = src;

  return new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      a.removeEventListener("ended", finish);
      a.removeEventListener("pause", finish);
      a.removeEventListener("error", finish);
      resolve();
    };
    a.addEventListener("ended", finish);
    a.addEventListener("pause", finish);
    a.addEventListener("error", finish);
    a.play().catch(finish);
  });
}

export function isPlayingTTS(src: string): boolean {
  const a = getEl();
  return !!a && currentSrc === src && !a.paused;
}
