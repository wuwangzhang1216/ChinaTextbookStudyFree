"use client";

import { Mascot } from './Mascot';
import { Close } from './icons';
import { playSfx } from '@/lib/sfx';

/** A short, unscored action from the current book's school-position topic. */
export function SchoolWarmup({ selected, onSelect, onStart, onHelp, onExit }: {
  selected?: number; onSelect: (floor: number) => void;
  onStart: () => void; onHelp: () => void; onExit: () => void;
}) {
  const complete = selected === 2;
  return <main className="min-h-screen bg-bg-soft flex flex-col px-5 py-4">
    <button type="button" onClick={onExit} className="w-12 h-12 inline-flex items-center justify-center text-ink-light" aria-label="退出课程"><Close className="w-6 h-6" /></button>
    <div className="max-w-md w-full mx-auto flex-1 flex flex-col items-center justify-center text-center py-4">
      <Mascot mood={complete ? 'cheer' : 'wave'} size={90} />
      <h1 className="text-2xl font-extrabold text-ink mt-3">和聪聪在学校里找一找</h1>
      <p className="text-ink text-lg mt-3">从下面数，点亮第2层的教室。</p>
      <div role="group" aria-label="4层教学楼，从下往上数" className="w-full max-w-xs mt-5 rounded-t-3xl border-4 border-secondary/40 bg-bg p-3 space-y-2">
        {[4, 3, 2, 1].map(floor => <button key={floor} type="button" aria-label={`第${floor}层的教室`} aria-pressed={selected === floor}
          onClick={() => { onSelect(floor); playSfx('tap'); }}
          className={`w-full min-h-14 rounded-xl border-2 flex items-center justify-between gap-3 px-4 text-ink ${selected === floor ? 'border-secondary bg-secondary/10' : 'border-bg-softer bg-bg-soft'}`}>
          <span className="font-extrabold text-lg">第{floor}层</span>
          <span aria-hidden="true" className="flex gap-3">{[0, 1, 2].map(n => <span key={n} className={`block h-7 w-7 rounded border-2 ${selected === floor ? 'border-secondary bg-secondary/30' : 'border-ink-light/40 bg-bg'}`} />)}</span>
        </button>)}
      </div>
      <p className="text-sm text-ink-light mt-2">↑ 从第1层往上数</p>
      <p role="status" aria-live="polite" className="min-h-14 mt-4 font-extrabold text-lg text-ink">
        {complete ? '找到了！第1层上面是第2层。' : selected ? `这是第${selected}层，再从下面找一找。` : '先点一层试试吧，不计分。'}
      </p>
      <button type="button" onClick={onHelp} className="min-h-12 px-4 text-secondary-dark font-bold">看看讲解手册</button>
    </div>
    <div className="max-w-md w-full mx-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <button type="button" disabled={!complete} onClick={onStart} className={`w-full ${complete ? 'btn-chunky-primary' : 'btn-chunky-disabled'}`}>开始练习</button>
    </div>
  </main>;
}
