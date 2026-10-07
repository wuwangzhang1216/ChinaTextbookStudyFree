"use client";

import { Mascot } from "./Mascot";
import { Close } from "./icons";
import { playSfx } from "@/lib/sfx";

export function CountingWarmup({ counted, onCount, onStart, onHelp, onExit }: {
  counted: number[]; onCount: (id: number) => void; onStart: () => void; onHelp: () => void; onExit: () => void;
}) {
  const complete = counted.length === 3;
  return <main className="min-h-screen bg-bg-soft flex flex-col px-5 py-4">
    <button type="button" onClick={onExit} className="w-12 h-12 inline-flex items-center justify-center text-ink-light" aria-label="退出课程"><Close className="w-6 h-6" /></button>
    <div className="max-w-md w-full mx-auto flex-1 flex flex-col items-center justify-center text-center py-6">
      <Mascot mood={complete ? "cheer" : "wave"} size={110} />
      <h1 className="text-2xl font-extrabold text-ink mt-4">和聪聪一起数一数</h1>
      <p className="text-ink text-lg mt-3">点一下小苹果，一个一个数。</p>
      <div className="flex gap-3 mt-8">
        {[1, 2, 3].map(id => <button key={id} type="button" disabled={counted.includes(id)} aria-label={`数第 ${id} 个苹果`} aria-pressed={counted.includes(id)}
          onClick={() => { onCount(id); playSfx("tap"); }}
          className={`w-20 h-24 rounded-2xl border-2 text-4xl flex flex-col items-center justify-center gap-2 ${counted.includes(id) ? "border-primary bg-primary/15" : "border-bg-softer bg-white"}`}>
          <span aria-hidden>🍎</span><span className="text-lg font-extrabold text-ink">{counted.includes(id) ? counted.indexOf(id) + 1 : "点我"}</span>
        </button>)}
      </div>
      <p role="status" aria-live="polite" className="min-h-12 mt-6 text-xl font-extrabold text-primary-dark">{complete ? "数到了 3！一共有 3 个苹果。" : counted.length > 0 ? `已经数了 ${counted.length} 个` : "先点一个试试吧"}</p>
      <button type="button" onClick={onHelp} className="min-h-12 px-4 text-secondary-dark font-bold mt-3">看看讲解手册</button>
    </div>
    <div className="max-w-md w-full mx-auto pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <button type="button" disabled={!complete} onClick={onStart} className={`w-full ${complete ? "btn-chunky-primary" : "btn-chunky-disabled"}`}>开始练习</button>
    </div>
  </main>;
}
