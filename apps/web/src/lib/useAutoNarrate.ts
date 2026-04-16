"use client";

/**
 * useAutoNarrate — 面向低龄的自动朗读 hook。
 *
 * 场景：进入一道题、一张知识卡、一次答题反馈时，
 * 自动串行播放给定音频（只播有 src 的部分），避免小学生找不到喇叭。
 *
 * 行为：
 *   - 当 key 变化（或 autoNarrate / muted 开关切换到可播）时触发
 *   - 串行播 srcs 里所有非空 src，每段之间留 gapMs 间隔
 *   - 组件卸载 / key 再次变化 / 调用返回的 cancel() → 立刻停止
 *   - autoNarrate=false 或全局 muted → 不播
 *
 * 使用：
 *   const cancelNarrate = useAutoNarrate([q.audio?.question], q.id);
 *   // 用户点选项时：
 *   onSelect={(v) => { cancelNarrate(); ... }}
 */

import { useCallback, useEffect, useRef } from "react";
import { playTTS, stopTTS } from "./tts";
import { useProgressStore } from "@/store/progress";

interface Opts {
  /** 段间间隔，默认 200ms */
  gapMs?: number;
  /** 首段开始前的延迟，默认 0。仅在需要避开入场动画时才传 >0 值。 */
  startDelayMs?: number;
  /** 每段开始播放时回调，便于父组件做"当前播放项"高亮。idx 是过滤后非空 src 列表的 0 起索引。 */
  onSrcStart?: (idx: number) => void;
  /** 全部播放完毕（或被取消）时回调，可用于清理高亮状态。 */
  onAllDone?: () => void;
}

export function useAutoNarrate(
  srcs: Array<string | null | undefined>,
  key: string | number,
  opts: Opts = {},
): () => void {
  const { gapMs = 200, startDelayMs = 0, onSrcStart, onAllDone } = opts;
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const muted = useProgressStore(s => s.muted);

  // 用 ref 持有 srcs / 回调，避免引用变化造成 effect 反复重跑；
  // 触发重播只依赖语义 key / 开关。
  const srcsRef = useRef(srcs);
  srcsRef.current = srcs;
  const onSrcStartRef = useRef(onSrcStart);
  onSrcStartRef.current = onSrcStart;
  const onAllDoneRef = useRef(onAllDone);
  onAllDoneRef.current = onAllDone;

  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTTS();
  }, []);

  useEffect(() => {
    if (!autoNarrate || muted) return;
    cancelledRef.current = false;

    const run = async () => {
      // 可选入场延迟（默认 0，不打断用户手势链）
      if (startDelayMs > 0) {
        await sleep(startDelayMs);
        if (cancelledRef.current) return;
      }

      const list = srcsRef.current.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
      for (let i = 0; i < list.length; i++) {
        if (cancelledRef.current) return;
        onSrcStartRef.current?.(i);
        await playTTS(list[i]);
        if (cancelledRef.current) return;
        if (i < list.length - 1) await sleep(gapMs);
      }
      if (!cancelledRef.current) onAllDoneRef.current?.();
    };

    void run();

    return () => {
      cancelledRef.current = true;
      stopTTS();
      onAllDoneRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoNarrate, muted]);

  return cancel;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
