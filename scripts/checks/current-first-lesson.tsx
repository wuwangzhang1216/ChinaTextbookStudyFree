import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lessonWarmupKind, resumeWarmupHandbook } from '../../apps/web/src/lib/lessonWarmup';

async function main() {
  const index = JSON.parse(fs.readFileSync('apps/web/public/data/index.json', 'utf8'));
  const book = index.books.find((b: { id: string }) => b.id === 'g1up-2026');
  assert(book && !book.supersededBy, 'The tested book must be the current default');
  const first = JSON.parse(fs.readFileSync(
    'apps/web/public/data/books/g1up-2026/lessons/g1up-2026-u101-kp1.json', 'utf8',
  ));
  assert.equal(lessonWarmupKind(first), 'school',
    'The default revised first lesson must offer a learning action before the lecture pages');
  assert.equal(lessonWarmupKind({ id: 'g1up-u1-kp1', questions: [] }), 'count');
  console.log('PASS: current default and legacy first lessons both route to an interactive warmup.');

  const changed = structuredClone(first);
  changed.questions[0].answer = '第3层';
  assert.equal(lessonWarmupKind(changed), null,
    'A changed question must not retain a misleading illustration');
  assert(resumeWarmupHandbook('school', {
    introPage: 2, introCompletedPages: [0, 1], introMode: 'warmup',
  }));
  assert(!resumeWarmupHandbook('school', {
    introPage: 0, warmupCounted: [2], introMode: 'warmup',
  }));
  assert(resumeWarmupHandbook('school', { introMode: 'handbook', warmupCounted: [2] }));

  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { SchoolWarmup } = await import('../../apps/web/src/components/SchoolWarmup');
  for (const selected of [undefined, 1, 2, 4]) {
    const markup = renderToStaticMarkup(<SchoolWarmup
      selected={selected} onSelect={() => {}} onStart={() => {}}
      onHelp={() => {}} onExit={() => {}}
    />);
    assert(markup.includes('4层教学楼'));
    assert.equal((markup.match(/aria-label="第[1-4]层的教室"/g) ?? []).length, 4);
    assert.equal(/<button[^>]*disabled=""[^>]*>开始练习/.test(markup), selected !== 2);
    assert(!markup.includes('朗读讲解'));
  }
  console.log('PASS: safe source guard, previous lecture-page migration and fresh/wrong/correct warmup rendering.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
