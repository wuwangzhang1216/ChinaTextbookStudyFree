"use client";

/**
 * useRecorder — 轻量麦克风录音 hook。
 *
 * - 用原生 MediaRecorder，不接 ASR、不上传
 * - 每次 stop() 返回一个 blob URL，交给组件去 new Audio(url) 回放
 * - 刷新页面即丢（不落磁盘），因此不涉及隐私持久化
 *
 * 用法：
 *   const rec = useRecorder();
 *   await rec.start();
 *   const url = await rec.stop(); // blob URL
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "error";

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopResolverRef = useRef<((url: string | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (mediaRef.current) return; // 已经在录
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("当前浏览器不支持录音");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        const url = blob.size > 0 ? URL.createObjectURL(blob) : null;
        cleanup();
        setState("idle");
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        resolver?.(url);
      };
      mr.start();
      mediaRef.current = mr;
      setState("recording");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<string | null> => {
    return new Promise(resolve => {
      const mr = mediaRef.current;
      if (!mr || mr.state === "inactive") {
        resolve(null);
        return;
      }
      stopResolverRef.current = resolve;
      mr.stop();
    });
  }, []);

  return { state, error, start, stop };
}
