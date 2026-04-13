"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause } from "lucide-react";
import { Volume, Check, XMark, Star, Lightning } from "@/components/icons";
import { InnerHeader } from "@/components/InnerHeader";
import { QuestionRenderer, type QuestionPhase } from "@/components/question/QuestionRenderer";
import { playTTS, stopTTS } from "@/lib/tts";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/cn";
import { useProgressStore } from "@/store/progress";
import type { Story, StoryQuestion, Question } from "@/types";

const XP_STORY_READ = 5;
const XP_QUIZ_GOOD = 10;
const GOOD_THRESHOLD = 0.8;

const STORY_REWARDS_KEY = "csf-story-rewards-v1";
function hasStoryReward(storyId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORY_REWARDS_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(storyId);
  } catch { return false; }
}
function markStoryReward(storyId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORY_REWARDS_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(storyId)) {
      set.push(storyId);
      window.localStorage.setItem(STORY_REWARDS_KEY, JSON.stringify(set));
    }
  } catch { /* silent */ }
}

type Phase = "reading" | "quiz" | "result";
type PlayMode = "idle" | "playing";

function toQuestion(sq: StoryQuestion): Question {
  return {
    id: sq.id,
    type: sq.type as Question["type"],
    score: 5,
    difficulty: 1,
    knowledge_point: "",
    question: sq.question,
    options: sq.options,
    answer: sq.answer,
    explanation: sq.explanation,
    audio: sq.audio,
  };
}

interface Props {
  story: Story;
  backHref: string;
}

export default function StoryReaderClient({ story, backHref }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("reading");
  const [mode, setMode] = useState<PlayMode>("idle");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const abortRef = useRef(false);

  // Quiz state
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [qPhase, setQPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const recordXp = useProgressStore(s => s.recordLessonComplete);

  // 离开页面时停止
  useEffect(() => {
    return () => { abortRef.current = true; stopTTS(); };
  }, []);

  const hasAudio = story.sentences.some(s => s.audio);

  const playSingle = useCallback(async (idx: number) => {
    const s = story.sentences[idx];
    if (!s?.audio) return;
    stopTTS();
    setMode("playing");
    setCurrentIndex(idx);
    await playTTS(s.audio);
    setCurrentIndex(null);
    setMode("idle");
  }, [story]);

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
    for (let i = 0; i < story.sentences.length; i++) {
      if (abortRef.current) break;
      const s = story.sentences[i];
      if (!s.audio) continue;
      setCurrentIndex(i);
      await playTTS(s.audio);
      if (abortRef.current) break;
    }
    setCurrentIndex(null);
    setMode("idle");
  }, [mode, story]);

  const startQuiz = () => {
    abortRef.current = true;
    stopTTS();
    setCurrentIndex(null);
    setMode("idle");
    setPhase("quiz");
  };

  // Quiz logic
  const currentQ = story.questions[qIdx];
  const currentQuestion = currentQ ? toQuestion(currentQ) : null;

  const checkAnswer = () => {
    if (!currentQ || !answer.trim()) return;
    let correct = false;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

    if (currentQ.type === "true_false") {
      const trueVals = new Set(["对", "true", "正确"]);
      const falseVals = new Set(["错", "false", "错误"]);
      const userTrue = trueVals.has(norm(answer));
      const userFalse = falseVals.has(norm(answer));
      const correctTrue = trueVals.has(norm(currentQ.answer));
      correct = (userTrue && correctTrue) || (userFalse && !correctTrue);
    } else if (currentQ.type === "choice") {
      const userChar = answer.trim().toUpperCase().charAt(0);
      const idx = currentQ.options.findIndex(o => norm(o) === norm(currentQ.answer));
      const correctChar = idx >= 0 ? String.fromCharCode(65 + idx) : "";
      correct = userChar === correctChar;
    } else {
      correct = norm(answer) === norm(currentQ.answer);
    }

    setIsCorrect(correct);
    setQPhase("checked");
    if (correct) {
      setCorrectCount(c => c + 1);
      playSfx("correct");
      haptic("success");
    } else {
      playSfx("wrong");
      haptic("error");
    }
  };

  const nextQuestion = () => {
    if (qIdx + 1 < story.questions.length) {
      setQIdx(qIdx + 1);
      setAnswer("");
      setQPhase("answering");
      setIsCorrect(null);
    } else {
      const accuracy = story.questions.length > 0 ? correctCount / story.questions.length : 0;
      if (!hasStoryReward(story.id)) {
        markStoryReward(story.id);
        const xp = accuracy >= GOOD_THRESHOLD ? XP_STORY_READ + XP_QUIZ_GOOD : XP_STORY_READ;
        recordXp(`story-${story.id}`, story.title, accuracy, xp);
      }
      setPhase("result");
      playSfx("star");
      haptic("success");
    }
  };

  const accuracy = story.questions.length > 0 ? correctCount / story.questions.length : 0;
  const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.75 ? 2 : 1;

  return (
    <main className="min-h-screen bg-bg-soft pb-24">
      <InnerHeader
        backHref={backHref}
        title={story.title}
        subtitle={`第${story.unitNumber}单元 · ${story.unitTitle}`}
        right={phase === "quiz" ? (
          <span className="text-xs font-bold text-primary tabular-nums">
            {qIdx + 1}/{story.questions.length}
          </span>
        ) : undefined}
        bottom={phase === "quiz" ? (
          <div className="h-1 bg-bg-softer">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${((qIdx + (qPhase === "checked" ? 1 : 0)) / story.questions.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        ) : undefined}
      />

      <AnimatePresence mode="wait">
        {/* ===================== READING PHASE ===================== */}
        {phase === "reading" && (
          <motion.div
            key="reading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 桌面双栏：配图(左) + 正文(右)；移动端顺序堆叠 */}
            <div
              className={cn(
                "max-w-md lg:max-w-6xl mx-auto",
                story.image && "lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6 lg:items-start",
              )}
            >
              {/* 配图 */}
              {story.image && (
                <div className="px-4 pt-4 lg:pt-5">
                  <div className="relative rounded-2xl overflow-hidden bg-white border border-bg-softer shadow-sm">
                    <img
                      src={story.image}
                      alt={story.title}
                      className="w-full h-auto block"
                    />
                  </div>
                </div>
              )}

              {/* 正文 */}
              <div className="px-4 pt-5 lg:pt-5">
                <div className="rounded-2xl bg-white border border-bg-softer p-4 shadow-sm">
                  {story.sentences.map((s, i) => {
                    const active = currentIndex === i;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-2 rounded-lg px-2 py-2 my-0.5 transition-colors",
                          active && "bg-primary/10 ring-1 ring-primary/40",
                        )}
                      >
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
                        <span
                          className={cn(
                            "text-lg leading-[2] text-ink",
                            active && "font-bold text-primary",
                          )}
                        >
                          {s.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===================== QUIZ PHASE ===================== */}
        {phase === "quiz" && currentQuestion && (
          <motion.div
            key={`q-${qIdx}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="max-w-md lg:max-w-2xl mx-auto px-4 py-5"
          >
            <div className="bg-white rounded-2xl border border-bg-softer p-5 mb-4 shadow-sm">
              <QuestionRenderer
                question={currentQuestion}
                answer={answer}
                phase={qPhase}
                isCorrect={isCorrect}
                onChange={setAnswer}
              />
            </div>

            {qPhase === "checked" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-2xl p-4 mb-4",
                  isCorrect ? "bg-success/10 border border-success/30" : "bg-danger/10 border border-danger/30",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {isCorrect ? (
                    <>
                      <Check className="w-5 h-5 text-success" />
                      <span className="font-extrabold text-success">答对了!</span>
                    </>
                  ) : (
                    <>
                      <XMark className="w-5 h-5 text-danger" />
                      <span className="font-extrabold text-danger">
                        正确答案: {currentQ.answer}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm text-ink-light">{currentQ.explanation}</p>
              </motion.div>
            )}

            {qPhase === "answering" ? (
              <button
                onClick={checkAnswer}
                disabled={!answer.trim()}
                className={cn(
                  "w-full py-4 rounded-2xl text-lg font-extrabold transition-colors",
                  answer.trim()
                    ? "bg-primary text-white hover:bg-primary-dark"
                    : "bg-bg-softer text-ink-softer cursor-not-allowed",
                )}
                style={answer.trim() ? { boxShadow: "0 4px 0 0 var(--color-primary-dark, #1a7f37)" } : undefined}
              >
                检查答案
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-extrabold hover:bg-primary-dark transition-colors"
                style={{ boxShadow: "0 4px 0 0 var(--color-primary-dark, #1a7f37)" }}
              >
                {qIdx + 1 < story.questions.length ? "下一题" : "查看结果"}
              </button>
            )}
          </motion.div>
        )}

        {/* ===================== RESULT PHASE ===================== */}
        {phase === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md lg:max-w-2xl mx-auto px-4 py-5 text-center"
          >
            <div className="bg-white rounded-2xl border border-bg-softer p-8 mb-6 shadow-sm">
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3].map(n => (
                  <Star
                    key={n}
                    className={cn(
                      "w-10 h-10",
                      n <= stars ? "fill-current text-gold" : "text-bg-softer",
                    )}
                  />
                ))}
              </div>
              <h2 className="text-2xl font-extrabold text-ink mb-2">
                {stars === 3 ? "太棒了!" : stars === 2 ? "不错!" : "继续努力!"}
              </h2>
              <p className="text-ink-light mb-4">「{story.title}」阅读理解</p>
              <div className="flex justify-center gap-6 text-sm">
                <div>
                  <div className="text-2xl font-extrabold text-primary tabular-nums">
                    {correctCount}/{story.questions.length}
                  </div>
                  <div className="text-ink-softer">答对</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-gold tabular-nums">
                    {Math.round(accuracy * 100)}%
                  </div>
                  <div className="text-ink-softer">正确率</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => router.push(backHref)}
                className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-extrabold hover:bg-primary-dark transition-colors"
                style={{ boxShadow: "0 4px 0 0 var(--color-primary-dark, #1a7f37)" }}
              >
                返回故事列表
              </button>
              <button
                onClick={() => {
                  setPhase("reading");
                  setQIdx(0);
                  setAnswer("");
                  setQPhase("answering");
                  setIsCorrect(null);
                  setCorrectCount(0);
                }}
                className="w-full py-3 rounded-2xl bg-white border-2 border-bg-softer text-ink font-bold hover:border-primary/40 transition-colors"
              >
                再读一遍
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部操作栏 — 仅阅读阶段 */}
      {phase === "reading" && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-bg-softer shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-md lg:max-w-6xl mx-auto px-4 py-3 flex gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={playAll}
              disabled={!hasAudio}
              className={cn(
                "flex-1 gap-2",
                mode === "playing" ? "btn-chunky-danger" : "btn-chunky-primary",
                !hasAudio && "btn-chunky-disabled",
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
              onClick={startQuiz}
              className="flex-1 gap-2 btn-chunky-secondary"
            >
              <Lightning className="w-5 h-5" />
              开始答题
            </motion.button>
          </div>
        </div>
      )}
    </main>
  );
}
