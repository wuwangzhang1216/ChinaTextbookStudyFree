"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle } from "@/components/icons";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { uiAudio } from "@/lib/uiAudio";
import {
  useProgressStore,
  REPORT_KIND_LABELS,
  type ReportKind,
} from "@/store/progress";
import type { Question } from "@/types";

/** 🚩 报错挂点上下文：提供了才显示小旗子按钮 */
export interface ReportContext {
  lessonId: string;
  question: Question;
  /** 当次作答（可选） */
  userAnswer?: string;
}

interface FeedbackPanelProps {
  isCorrect: boolean;
  explanation: string;
  explanationAudio?: string | null;
  onContinue: () => void;
  /** 题目报错（E2 小旗子）：不传则不渲染旗子按钮 */
  reportContext?: ReportContext | null;
}

const PRAISE_POOL = ["答对了！", "做得好！", "继续保持！", "太棒了！"];
const COMFORT_POOL = ["再想想", "差一点", "加油", "没关系", "下次就对！"];

/** 小旗子图标（仅报错入口用，不动 icons.tsx） */
function FlagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.75V14a6 6 0 0 1-3 .75c-3 0-5-2-8-2a6 6 0 0 0-4 1.5" />
    </svg>
  );
}

const REPORT_OPTIONS: Array<{ kind: ReportKind; emoji: string }> = [
  { kind: "question_wrong", emoji: "✏️" },
  { kind: "answer_should_count", emoji: "✅" },
  { kind: "audio_issue", emoji: "🔊" },
];

export function FeedbackPanel({
  isCorrect,
  explanation,
  explanationAudio,
  onContinue,
  reportContext = null,
}: FeedbackPanelProps) {
  const bg = isCorrect ? "bg-primary/10 border-primary" : "bg-danger/10 border-danger";
  const titleColor = isCorrect ? "text-primary-dark" : "text-danger-dark";
  const btnCls = isCorrect ? "btn-chunky-primary" : "btn-chunky-danger";

  const addReport = useProgressStore(s => s.addReport);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 已提交：旗子变成「已收到」态，防止同题重复报
  const [reported, setReported] = useState(false);
  // 弹层用 portal 挂到 body：面板自身带 transform，fixed 子元素会被它捕获
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const title = useMemo(() => {
    const pool = isCorrect ? PRAISE_POOL : COMFORT_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [isCorrect]);

  // 面板出现：只播标题语音（"太棒了！" / "再想想"），讲解保留手动喇叭
  useAutoNarrate([uiAudio(title)], explanation);

  function submitReport(kind: ReportKind) {
    if (!reportContext) return;
    playSfx("tap");
    haptic("light");
    addReport({
      lessonId: reportContext.lessonId,
      questionId: reportContext.question.id,
      questionText: reportContext.question.question.slice(0, 80),
      kind,
      answerGiven: reportContext.userAnswer || undefined,
    });
    setReported(true);
    setSheetOpen(false);
  }

  return (
    <motion.div
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className={`fixed bottom-0 left-0 right-0 z-50 border-t-4 ${bg} backdrop-blur-sm`}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}
    >
      <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-5">
        <div className={`flex items-center gap-3 mb-3 font-extrabold text-2xl ${titleColor}`}>
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 260, delay: 0.05 }}
            className="inline-flex"
          >
            {isCorrect ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </motion.span>
          <motion.span
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="flex-1 min-w-0 truncate"
          >
            {title}
          </motion.span>
          {/* 🚩 报错小旗子（有上下文才显示） */}
          {reportContext && (
            <button
              type="button"
              onClick={() => {
                if (reported) return;
                playSfx("tap");
                haptic("light");
                setSheetOpen(true);
              }}
              className={`shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-full border-2 transition-colors ${
                reported
                  ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                  : "border-bg-softer bg-white text-ink-softer hover:text-ink hover:border-ink-softer"
              }`}
              aria-label={reported ? "已报告本题问题" : "报告本题问题"}
              title={reported ? "已收到你的反馈" : "这道题有问题？"}
            >
              {reported ? <CheckCircle className="w-5 h-5" /> : <FlagIcon className="w-4 h-4" />}
            </button>
          )}
        </div>
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-2 text-ink text-base leading-relaxed mb-4"
        >
          <div className="flex-1">
            <MathText text={explanation} />
          </div>
          {explanationAudio && (
            <TTSButton src={explanationAudio} size="sm" label="重听讲解" className="mt-0.5" />
          )}
        </motion.div>
        {/* autoFocus：让桌面端直接按 Enter/空格 继续（键盘快捷键 web-lesson-3） */}
        <button
          autoFocus
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onContinue();
          }}
          className={`w-full ${btnCls}`}
        >
          继续
        </button>
      </div>

      {/* 🚩 报错底部弹层：三选一（portal 到 body，避开面板自身的 transform） */}
      {portalReady &&
        createPortal(
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/45 backdrop-blur-[2px] z-40"
              onClick={() => setSheetOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ y: 280 }}
              animate={{ y: 0 }}
              exit={{ y: 320 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl border-t-2 border-bg-softer"
              style={{ boxShadow: "0 -10px 32px rgba(0,0,0,0.14)" }}
              role="dialog"
              aria-modal="true"
              aria-label="报告题目问题"
            >
              <div className="max-w-md lg:max-w-2xl mx-auto px-5 pt-4 pb-6">
                <div className="mx-auto w-12 h-1.5 rounded-full bg-bg-softer mb-4" />
                <div className="flex items-center gap-2 mb-1">
                  <FlagIcon className="w-5 h-5 text-danger" />
                  <h3 className="text-lg font-extrabold text-ink">这道题怎么了？</h3>
                </div>
                <p className="text-xs text-ink-light mb-4">
                  你的反馈只保存在本机，可以在「我的」页面查看和导出
                </p>
                <div className="flex flex-col gap-2.5">
                  {REPORT_OPTIONS.map(opt => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() => submitReport(opt.kind)}
                      className="w-full flex items-center gap-3 rounded-2xl border-2 border-bg-softer bg-white px-4 py-3.5 text-left font-extrabold text-ink hover:border-primary/50 transition-colors"
                      style={{ boxShadow: "0 3px 0 0 var(--shadow-card-color)" }}
                    >
                      <span className="text-xl" aria-hidden>
                        {opt.emoji}
                      </span>
                      <span>{REPORT_KIND_LABELS[opt.kind]}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSfx("tap");
                    setSheetOpen(false);
                  }}
                  className="btn-chunky-ghost w-full mt-4"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </motion.div>
  );
}
