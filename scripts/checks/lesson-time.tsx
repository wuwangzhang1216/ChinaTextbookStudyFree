import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';
import { lessonContentKey } from '../../packages/core/src/content';
const require = createRequire(import.meta.url);
const { create, act } = require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const originalPerformance = globalThis.performance;
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now, measure() {}, mark() {}, clearMeasures() {}, clearMarks() {} } });
const originalNow = Date.now, originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
let now = 1_800_000_000_000;
Date.now = () => now;
const timers = new Map<number, () => void>();
let timerId = 0;
(globalThis as any).setInterval = (fn: () => void) => { timers.set(++timerId, fn); return timerId; };
(globalThis as any).clearInterval = (id: number) => timers.delete(id);
const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const window = new EventTarget();
Object.assign(globalThis, { document, window });
const Stub = (props: any) => React.createElement('stub', props, props.children);
let state: any, completes = 0, learningTime = 0;
const useStore = Object.assign((select: any) => select(state), { getState: () => state });
// Run the actual component effects and finish handler. Only presentation, media
// and the external store adapter are replaced; timing and session logic are real.
const code = ts.transpileModule(readFileSync('apps/web/src/components/LessonRunner.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports: any = {};
const resolve = (id: string): any => {
  if (id === '@/store/progress') return { useProgressStore: useStore, MAX_HEARTS: 5, HEART_REFILL_COST: 30 };
  if (id === 'next/navigation') return { useRouter: () => ({ push() {} }) };
  if (id === 'next/link') return { default: Stub };
  if (id === 'next/dynamic') return { default: () => Stub };
  if (id === 'framer-motion') return { motion: new Proxy({}, { get: () => 'div' }), AnimatePresence: Stub, useAnimation: () => ({ start() {} }), useReducedMotion: () => true };
  if (id.startsWith('./') || id.startsWith('@/components/')) return { ...Object.fromEntries(['Close','Flame','BookOpen','Target','XCircle','Lightning','Gem','Star','Heart','SoundLink','MathText','HeartsBar','HeartTimer','QuestionRenderer','Mascot','MuteToggle','AutoNarrateToggle','TTSButton','NarrationNextButton','ChestModal','CountingWarmup','SchoolWarmup'].map(k => [k, Stub])), useSyncMute() {}, shouldIgnoreKey: () => false, isButtonTarget: () => false };
  if (/^@\/lib\/(useProgressTicker|useIntroNarration|useAutoNarrate|sfx|haptic|tts)$/.test(id)) return new Proxy({}, { get: () => () => 0 });
  if (id.startsWith('@/')) return require(`../../apps/web/src/${id.slice(2)}`);
  return require(id);
};
new Function('exports', 'require', code)(exports, resolve);
const lesson: any = { id: 'g2up-u1-kp1', bookId: 'g2up', title: '计时回归', knowledge: null, questions: [1,2,3].map(id => ({ id, type: 'true_false', question: '1+1=2', answer: '对', options: [] })) };
function initial(extra = {}) {
  completes = learningTime = 0;
  state = {
    hearts: 5, gems: 0, perfectedLessons: {}, claimedChests: {}, equippedBackdrop: null,
    activeLesson: { lessonId: lesson.id, index: 3, correctCount: 3, mistakeCount: 0, combo: 3, stage: 'practice', startedAt: now - 103_057_000, currentId: 3, queueIds: [], solvedIds: [1,2,3], phase: 'checked', checkedCorrect: true, attemptedIds: [1,2,3], draftAnswer: '对', contentKey: lessonContentKey(lesson), ...extra },
    refreshHearts() {}, dailyTimeLimitReached: () => false,
    upsertLessonSession(s: any) { state.activeLesson = s; }, clearLessonSession() { state.activeLesson = null; },
    addLearningTimeMs(ms: number) { learningTime += ms; }, todayQuests: () => [], questProgress: () => 0,
    recordLessonComplete() { completes++; return { stars: 3, xpGained: 10, gemsGained: 0, milestoneGems: 0, streakAfter: 1 }; },
  };
}
async function mount() { let root: any; await act(() => { root = create(React.createElement(exports.LessonRunner, { lesson })); }); return root; }
async function finish(root: any) {
  const feedback = root.root.findAllByType(Stub).find((node: any) => typeof node.props.onContinue === 'function');
  assert.ok(feedback, 'exercise the real restored final-feedback caller');
  await act(() => feedback.props.onContinue());
  const completion = root.root.find((node: any) => node.type?.name === 'CompletionScreen');
  const duration = completion.props.stats.durationSec;
  assert.equal(completion.props.stats.firstCorrect, 3);
  assert.equal(completion.props.stats.accuracy, 1);
  assert.equal(completes, 1, 'completion rewards recorded exactly once');
  await act(() => root.unmount());
  assert.equal(state.activeLesson, null, 'completed draft cleared');
  return duration;
}
async function main() {
try {
  for (let run = 0; run < 2; run++) {
    initial();
    const root = await mount();
    now += 5_000;
    const duration = await finish(root);
    console.log(`overnight resume run ${run+1}: ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`);
    assert.equal(duration, 5, 'legacy wall-clock startedAt must not count the night away');
  }
  // Same runner + foreground billing: repeated hide events cannot bill twice.
  initial({ activeTimeMs: 12_000 });
  let root = await mount();
  now += 5_000;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(state.activeLesson.activeTimeMs, 17_000);
  assert.equal(learningTime, 5_000);
  now += 24 * 60 * 60_000;
  for (const tick of timers.values()) tick();
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  now += 3_000;
  assert.equal(await finish(root), 20);
  assert.equal(learningTime, 8_000, 'same foreground time drives the daily allowance');

  // Navigation/reload checkpoints retain timing, draft and checked feedback.
  initial({ activeTimeMs: 10_000 });
  root = await mount(); now += 4_000;
  window.dispatchEvent(new Event('pagehide'));
  const before = { ...state.activeLesson };
  assert.equal(before.activeTimeMs, 14_000);
  now += 60 * 60_000;
  await act(() => root.unmount());
  assert.equal(state.activeLesson.activeTimeMs, 14_000);
  root = await mount(); now += 2_000;
  assert.equal(state.activeLesson.draftAnswer, before.draftAnswer);
  assert.equal(state.activeLesson.phase, before.phase);
  assert.deepEqual(state.activeLesson.attemptedIds, before.attemptedIds);
  assert.equal(await finish(root), 16);
  assert.equal(learningTime, 6_000, 'reload never rebills prior foreground time');

  // BFCache pagehide/pageshow without unmount, including repeated show events.
  initial({ activeTimeMs: 0 });
  root = await mount(); now += 3_000;
  window.dispatchEvent(new Event('pagehide')); now += 60 * 60_000;
  window.dispatchEvent(new Event('pageshow'));
  window.dispatchEvent(new Event('pageshow')); now += 2_000;
  assert.equal(await finish(root), 5);

  // A visible settings dialog is a break, not lesson time.
  initial({ activeTimeMs: 0 }); root = await mount(); now += 2_000;
  await act(() => root.root.findByProps({ 'aria-label': '课程设置' }).props.onClick());
  now += 60 * 60_000;
  const close = root.root.findAllByType('button').find((node: any) => node.children.includes('好了'));
  await act(() => close.props.onClick()); now += 3_000;
  assert.equal(await finish(root), 5);
  assert.equal(learningTime, 5_000);

  // Wall-clock adjustments do not alter monotonic elapsed time.
  initial(); root = await mount();
  Date.now = () => now + 7 * 24 * 60 * 60_000;
  now += 4_000;
  assert.equal(await finish(root), 4);
  Date.now = () => now;

  // Unannounced sleep is bounded; ordinary heartbeat intervals remain exact.
  initial({ activeTimeMs: 0 }); root = await mount();
  now += 15_000; for (const tick of timers.values()) tick();
  assert.equal(state.activeLesson.activeTimeMs, 15_000);
  now += 24 * 60 * 60_000;
  assert.equal(await finish(root), 45);
  assert.equal(learningTime, 45_000);
  assert.equal(timers.size, 0, 'unmount cleans every heartbeat');
  console.log('PASS: actual LessonRunner resume, hidden tab, pagehide/reload, BFCache, clock changes, sleep guard, grade and reward invariants.');
} finally {
  Date.now = originalNow;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: originalPerformance });
  globalThis.setInterval = originalInterval;
  globalThis.clearInterval = originalClear;
}

}
void main();
