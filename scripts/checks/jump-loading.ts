import assert from 'node:assert/strict';
import { loadJumpData } from '../../apps/web/src/lib/loadJumpData';

async function main() {
  const calls: string[] = [];
  const outline = { units: [{ unit_number: 1, title: 'Start' }, { unit_number: 2, title: 'Next' }], lessons: [
    { id: 'book-u1-kp1', unitNumber: 1, unitTitle: 'Start' },
    { id: 'book-u1-kp2', unitNumber: 1, unitTitle: 'Start' },
    { id: 'book-u2-kp1', unitNumber: 2, unitTitle: 'Next' },
  ] };
  const fetcher = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(url.endsWith('outline.json') ? outline : { questions: [{ id: 1 }] })));
  }) as typeof fetch;
  const result = await loadJumpData('book', 2, fetcher);
  assert.equal(result.unitTitle, 'Next');
  assert.deepEqual(result.priorLessonIds, ['book-u1-kp1', 'book-u1-kp2']);
  assert.equal(result.sources.length, 2);
  calls.length = 0;
  await assert.rejects(loadJumpData('book', 999, fetcher), /不存在/);
  assert.equal(calls.length, 1, 'Invalid destinations must not assemble a test');
  const partial = ((url: string) => String(url).endsWith('kp2.json') ? Promise.resolve(new Response('', {status:404})) : fetcher(url)) as typeof fetch;
  await assert.rejects(loadJumpData('book', 2, partial), /部分题目/);
  const empty = ((url: string) => String(url).endsWith('outline.json') ? fetcher(url) : Promise.resolve(new Response('{"questions":[]}'))) as typeof fetch;
  await assert.rejects(loadJumpData('book', 2, empty), /部分题目/);
  await assert.rejects(loadJumpData('book', 1, fetcher), /不需要跳级/);
  calls.length = 0;
  await assert.rejects(loadJumpData('book', 0, fetcher), /链接不完整/);
  assert.equal(calls.length, 0);
  await assert.rejects(loadJumpData('../book', 2, fetcher), /链接不完整/);
  // Preparation and interleaved activities use independent numbers. The
  // destination may be unit1; only actual preceding lessons are prerequisites.
  const orderedOutline = { units: [
    {unit_number:101,title:'Preparation',label:'学习准备'},
    {unit_number:1,title:'First chapter'},
    {unit_number:102,title:'Activity',label:'实践活动'},
    {unit_number:2,title:'Second chapter'},
  ], lessons: [101,1,102,2].map(n => ({id:`parallel-u${n}-kp1`,unitNumber:n,unitTitle:String(n)})) };
  const orderedFetcher = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(url.endsWith('outline.json') ? orderedOutline : {questions:[{id:1}]})));
  }) as typeof fetch;
  calls.length=0;
  const firstChapter = await loadJumpData('g1up-54-qingdao',1,orderedFetcher);
  assert.deepEqual(firstChapter.priorLessonIds,['parallel-u101-kp1']);
  assert.equal(calls.length,2);
  const secondChapter = await loadJumpData('g1up-54-qingdao',2,orderedFetcher);
  assert.deepEqual(secondChapter.priorLessonIds,['parallel-u101-kp1','parallel-u1-kp1','parallel-u102-kp1']);
  await assert.rejects(loadJumpData('g1up-54-qingdao',101,orderedFetcher),/不需要跳级/);
  console.log('Jump loading rejects missing destinations, incomplete banks and invalid links.');
}
void main();
