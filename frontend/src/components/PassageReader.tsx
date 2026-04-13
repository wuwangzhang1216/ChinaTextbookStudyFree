"use client";

/**
 * PassageReader — 课文听读 / 跟读组件。
 *
 * 三种模式：
 *   1. 听读：顺序播放每句 mp3，当前播放句高亮
 *   2. 单句：点每句前的小喇叭播这一句
 *   3. 跟读：对每句先播原音、再录音、走完全文后可逐句回放（原音 vs 我的）
 *
 * 复用 `lib/tts.ts` 的单例 audio + mute 状态，避免两段同时播。
 * 录音用原生 MediaRecorder（`useRecorder`），不上传、刷新即丢。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, Pause, Mic, Square, RotateCcw } from "lucide-react";
import { ArrowLeft, Volume, Lightning } from "@/components/icons";
import { SoundLink } from "@/components/SoundLink";
import { playTTS, preloadTTS, stopTTS } from "@/lib/tts";
import { useRecorder } from "@/lib/useRecorder";
import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/cn";
import type { Passage } from "@/types";

/** 课文听读完成奖励：在 localStorage 里记一个集合避免重复发 */
const PASSAGE_REWARDS_KEY = "csf-passage-rewards-v1";
type RewardKind = "listen" | "followup";
function hasPassageReward(passageId: string, kind: RewardKind): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PASSAGE_REWARDS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, RewardKind[]>) : {};
    return (obj[passageId] ?? []).includes(kind);
  } catch {
    return false;
  }
}
function markPassageReward(passageId: string, kind: RewardKind): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PASSAGE_REWARDS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, RewardKind[]>) : {};
    const list = obj[passageId] ?? [];
    if (!list.includes(kind)) {
      obj[passageId] = [...list, kind];
      window.localStorage.setItem(PASSAGE_REWARDS_KEY, JSON.stringify(obj));
    }
  } catch {
    // 静默
  }
}

const XP_LISTEN = 5;
const XP_FOLLOWUP = 10;

interface Props {
  passage: Passage;
  backHref: string;
}

type Mode = "idle" | "playing" | "followup";

export function PassageReader({ passage, backHref }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  /** 跟读模式下每句的学生录音 blob URL */
  const [recordings, setRecordings] = useState<(string | null)[]>(
    () => passage.sentences.map(() => null),
  );
  const abortRef = useRef(false);
  const rec = useRecorder();

  // XP 奖励集成（接进 progress store 当 XP / gems 算）
  const recordPassageXp = useProgressStore(s => s.recordLessonComplete);
  const [xpToast, setXpToast] = useState<{ amount: number; key: number } | null>(null);

  function grantPassageReward(kind: RewardKind, xp: number) {
    if (hasPassageReward(passage.id, kind)) return;
    markPassageReward(passage.id, kind);
    // 用 recordLessonComplete 走主流：accuracy=1 → 三星 → 自动加 XP + gems + dailyGoal 进度
    // lessonId 用 passage- 前缀，避免和真正的 lesson 冲突
    recordPassageXp(`passage-${passage.id}-${kind}`, passage.title, 1.0, xp);
    setXpToast({ amount: xp, key: Date.now() });
    playSfx("star");
    haptic("success");
  }

  // 课本原页：render_pages.py 已经应用了书级 offset 算出真实 PDF 物理页 pdfPage，
  // pageImages 一般是 [pdfPage-1, pdfPage, pdfPage+1] 按页号升序。默认显示 pdfPage。
  const pageImages = passage.pageImages ?? [];
  const defaultPageIdx = useMemo(() => {
    if (pageImages.length === 0) return 0;
    if (!passage.pdfPage) return Math.floor(pageImages.length / 2);
    for (let i = 0; i < pageImages.length; i++) {
      const m = /p(\d+)\.jpg/.exec(pageImages[i]);
      if (m && parseInt(m[1], 10) === passage.pdfPage) return i;
    }
    return Math.floor(pageImages.length / 2);
  }, [pageImages, passage.pdfPage]);
  const [pageIdx, setPageIdx] = useState(defaultPageIdx);
  useEffect(() => setPageIdx(defaultPageIdx), [defaultPageIdx]);

  // 预加载全部句子音频，减少切换时的停顿
  useEffect(() => {
    for (const s of passage.sentences) {
      if (s.audio) preloadTTS(s.audio);
    }
  }, [passage]);

  // 清理：卸载时停掉一切
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopTTS();
    };
  }, []);

  const sleep = (ms: number) =>
    new Promise<void>(resolve => setTimeout(resolve, ms));

  const playSingle = useCallback(async (idx: number) => {
    const s = passage.sentences[idx];
    if (!s?.audio) return;
    stopTTS();
    setMode("playing");
    setCurrentIndex(idx);
    await playTTS(s.audio);
    setCurrentIndex(null);
    setMode("idle");
  }, [passage]);

  const playAll = useCallback(async () => {
    if (mode === "playing") {
      abortRef.current = true;
      stopTTS();
      setMode("idle");
      setCurrentIndex(null);
      return;
    }
    abortRef.current = false;
    setMode("playing");
    let completed = true;
    for (let i = 0; i < passage.sentences.length; i++) {
      if (abortRef.current) {
        completed = false;
        break;
      }
      const s = passage.sentences[i];
      if (!s.audio) continue;
      setCurrentIndex(i);
      await playTTS(s.audio);
      if (abortRef.current) {
        completed = false;
        break;
      }
      await sleep(200);
    }
    setCurrentIndex(null);
    setMode("idle");
    // 完整听完整篇 → 首次给 XP
    if (completed) {
      grantPassageReward("listen", XP_LISTEN);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passage]);

  // 跟读流程：逐句 → 播原音 → 录音 → 下一句
  const runFollowup = useCallback(async () => {
    if (mode === "followup") {
      // 中断
      abortRef.current = true;
      if (rec.state === "recording") await rec.stop();
      stopTTS();
      setMode("idle");
      setCurrentIndex(null);
      return;
    }
    abortRef.current = false;
    setMode("followup");
    setRecordings(passage.sentences.map(() => null));

    for (let i = 0; i < passage.sentences.length; i++) {
      if (abortRef.current) break;
      const s = passage.sentences[i];
      setCurrentIndex(i);

      // 1) 播原音
      if (s.audio) {
        await playTTS(s.audio);
      }
      if (abortRef.current) break;
      await sleep(250);
      if (abortRef.current) break;

      // 2) 录音（最长 8 秒，或用户手动停止）
      await rec.start();
      if (rec.state === "error") {
        break;
      }
      const durationMs = Math.max(3000, s.text.length * 280);
      const maxMs = Math.min(durationMs, 8000);
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        if (abortRef.current) break;
        await sleep(100);
      }
      const url = await rec.stop();
      if (abortRef.current) break;
      if (url) {
        setRecordings(prev => {
          const next = [...prev];
          next[i] = url;
          return next;
        });
      }
      await sleep(150);
    }

    setCurrentIndex(null);
    setMode("idle");
    // 完整完成跟读 → 首次给 XP（更高奖励）
    if (!abortRef.current) {
      grantPassageReward("followup", XP_FOLLOWUP);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passage, rec]);

  const playMyRecording = useCallback((idx: number) => {
    const url = recordings[idx];
    if (!url) return;
    const a = new Audio(url);
    void a.play();
  }, [recordings]);

  const resetRecordings = useCallback(() => {
    recordings.forEach(u => {
      if (u) URL.revokeObjectURL(u);
    });
    setRecordings(passage.sentences.map(() => null));
  }, [recordings, passage]);

  const hasAnyAudio = passage.sentences.some(s => s.audio);
  const isPoem =
    passage.kind === "poem" ||
    passage.kind === "ancient_poem" ||
    passage.kind === "song";

  return (
    <main className="min-h-screen bg-bg-soft pb-24">
      {/* Header */}
      <div className="bg-white border-b border-bg-softer sticky top-0 z-10">
        <div className="max-w-md lg:max-w-6xl mx-auto flex items-center justify-between px-4 py-3 gap-3">
          <SoundLink
            href={backHref}
            className="text-ink-light hover:text-primary shrink-0"
          >
            <ArrowLeft className="w-6 h-6" />
          </SoundLink>
          <div className="text-center flex-1 min-w-0">
            <div className="text-base font-extrabold text-ink truncate">
              {passage.title}
            </div>
            {passage.author && (
              <div className="text-xs text-ink-light mt-0.5 truncate">
                {passage.author}
              </div>
            )}
          </div>
          <div className="w-6 shrink-0" />
        </div>
      </div>

      {/* 桌面双栏：lg+ 时课本原页(左) + 课文正文(右) 并排；移动端顺序堆叠 */}
      <div
        className={cn(
          "max-w-md lg:max-w-6xl mx-auto",
          pageImages.length > 0 && "lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6 lg:items-start",
        )}
      >
      {/* 课本原页 */}
      {pageImages.length > 0 && (
        <div className="px-4 pt-4 lg:pt-5">
          <div className="relative rounded-2xl overflow-hidden bg-white border border-bg-softer shadow-sm">
            <img
              src={pageImages[pageIdx]}
              alt={`${passage.title} - 课本原页`}
              className="w-full h-auto block"
            />
            {pageImages.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="上一页"
                  disabled={pageIdx === 0}
                  onClick={() => setPageIdx(i => Math.max(0, i - 1))}
                  className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2",
                    "w-9 h-9 rounded-full bg-white/90 text-ink shadow-md backdrop-blur",
                    "inline-flex items-center justify-center",
                    pageIdx === 0 && "opacity-30 cursor-not-allowed",
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  aria-label="下一页"
                  disabled={pageIdx === pageImages.length - 1}
                  onClick={() =>
                    setPageIdx(i => Math.min(pageImages.length - 1, i + 1))
                  }
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2",
                    "w-9 h-9 rounded-full bg-white/90 text-ink shadow-md backdrop-blur",
                    "inline-flex items-center justify-center",
                    pageIdx === pageImages.length - 1 && "opacity-30 cursor-not-allowed",
                  )}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {pageIdx + 1} / {pageImages.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 课文正文 */}
      <div className="px-4 pt-5 lg:pt-5">
        {!hasAnyAudio && (
          <div className="mb-4 rounded-xl bg-warning/10 text-ink-light text-xs px-3 py-2">
            本课文的朗读音频还在生成中，暂时只能看文字
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl bg-white border border-bg-softer p-4 shadow-sm",
            isPoem && "text-center",
          )}
        >
          {passage.sentences.map((s, i) => {
            const active = currentIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-2 py-2 my-0.5 transition-colors",
                  active && "bg-primary/10 ring-1 ring-primary/40",
                  isPoem && "justify-center",
                )}
              >
                {!isPoem && (
                  <button
                    type="button"
                    aria-label="朗读这一句"
                    onClick={() => playSingle(i)}
                    disabled={!s.audio || mode !== "idle"}
                    className={cn(
                      "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full",
                      "bg-bg-soft text-primary hover:bg-primary/10 transition-colors",
                      (!s.audio || mode !== "idle") && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Volume className="w-4 h-4" />
                  </button>
                )}
                <span
                  className={cn(
                    "text-lg leading-[2] text-ink",
                    isPoem && "text-center",
                    active && "font-bold text-primary",
                  )}
                >
                  {s.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* 跟读模式：已录音列表，可回放原音 vs 我的 */}
        <AnimatePresence>
          {recordings.some(Boolean) && mode !== "followup" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 rounded-2xl bg-white border border-bg-softer p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-ink">我的朗读</div>
                <button
                  type="button"
                  onClick={resetRecordings}
                  className="inline-flex items-center gap-1 text-xs text-ink-light hover:text-danger"
                >
                  <RotateCcw className="w-3 h-3" />
                  清空
                </button>
              </div>
              <ul className="space-y-2">
                {passage.sentences.map((s, i) => {
                  const myUrl = recordings[i];
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm text-ink"
                    >
                      <span className="shrink-0 w-5 text-ink-light tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="flex-1 truncate">{s.text}</span>
                      <button
                        type="button"
                        onClick={() => playSingle(i)}
                        disabled={!s.audio}
                        className="shrink-0 text-xs px-2 py-1 rounded-full bg-bg-soft text-primary disabled:opacity-40"
                      >
                        原音
                      </button>
                      <button
                        type="button"
                        onClick={() => playMyRecording(i)}
                        disabled={!myUrl}
                        className="shrink-0 text-xs px-2 py-1 rounded-full bg-secondary/15 text-secondary disabled:opacity-40"
                      >
                        我的
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-bg-softer shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-md lg:max-w-6xl mx-auto px-4 py-3 flex gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={playAll}
            disabled={!hasAnyAudio || mode === "followup"}
            className={cn(
              "flex-1 gap-2",
              mode === "playing" ? "btn-chunky-danger" : "btn-chunky-primary",
              (!hasAnyAudio || mode === "followup") && "btn-chunky-disabled",
            )}
          >
            {mode === "playing" ? (
              <>
                <Pause className="w-5 h-5" />
                停止
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                听全文
              </>
            )}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={runFollowup}
            disabled={!hasAnyAudio || mode === "playing"}
            className={cn(
              "flex-1 gap-2",
              mode === "followup" ? "btn-chunky-danger" : "btn-chunky-secondary",
              (!hasAnyAudio || mode === "playing") && "btn-chunky-disabled",
            )}
          >
            {mode === "followup" ? (
              <>
                <Square className="w-5 h-5" />
                结束跟读
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                跟读
              </>
            )}
          </motion.button>
        </div>
        {rec.error && (
          <div className="max-w-md lg:max-w-6xl mx-auto px-4 pb-2 text-xs text-danger">
            麦克风错误：{rec.error}
          </div>
        )}
      </div>

      {/* +XP 奖励 toast（首次听完整篇 / 首次跟读全篇） */}
      <AnimatePresence>
        {xpToast && (
          <motion.div
            key={xpToast.key}
            initial={{ opacity: 0, y: 30, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", damping: 14, stiffness: 240 }}
            onAnimationComplete={() => {
              setTimeout(() => setXpToast(null), 1600);
            }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-white font-extrabold"
            style={{
              background: "linear-gradient(135deg, #1CB0F6, #1899D6)",
              boxShadow: "0 5px 0 0 #0d7aa8",
            }}
          >
            <Lightning className="w-5 h-5" />
            +{xpToast.amount} XP
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
