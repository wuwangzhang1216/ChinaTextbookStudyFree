import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function memory() {
  const data = new Map<string,string>();
  return { data, getItem: (key:string) => data.get(key) ?? null,
    setItem: (key:string,value:string) => {data.set(key,value);}, removeItem: (key:string) => {data.delete(key);} };
}
const storage = memory(), sessionA = memory(), sessionB = memory();
function tab(session: ReturnType<typeof memory>) {
  const cache = new Map<string,any>();
  const window = Object.assign(new EventTarget(),{localStorage:storage,sessionStorage:session});
  function load(path:string):any {
    if(cache.has(path))return cache.get(path);
    const exports = {};cache.set(path,exports);
    const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const resolve=(id:string):any=>{
      if(id.startsWith('@/'))return load(`apps/web/src/${id.slice(2)}.ts`);
      if(id.startsWith('./'))return load(`${path.slice(0,path.lastIndexOf('/'))}/${id.slice(2)}.ts`);
      return require(id);
    };
    new Function('exports','require','window','localStorage','sessionStorage',code)(exports,resolve,window,storage,session);
    return exports;
  }
  const profiles=load('apps/web/src/lib/learnerProfiles.ts') as typeof import('../../apps/web/src/lib/learnerProfiles');
  const manager=profiles.learnerProfiles();
  const store=(load('apps/web/src/store/progress.ts') as typeof import('../../apps/web/src/store/progress')).useProgressStore;
  const achievements=load('apps/web/src/lib/achievements.ts') as typeof import('../../apps/web/src/lib/achievements');
  return {manager,store,profiles,achievements,load};
}
storage.setItem('csf-progress-v1',JSON.stringify({version:6,state:{xp:120,gems:42,selectedGrade:2,dailyTimeLimitMs:60000,
  activeLesson:{lessonId:'g2up-u1-kp1',index:2}}}));
const first=tab(sessionA), alreadyOpen=tab(sessionB);
assert.equal(first.store.getState().xp,120);assert.equal(first.store.getState().activeLesson?.index,2);
first.manager.rename('姐姐');const secondProfile=first.manager.create('弟弟');
assert.throws(()=>first.manager.create('   '));assert.throws(()=>first.manager.rename('a'.repeat(21)));
assert.throws(()=>first.manager.prepareSwitch('missing'));
first.profiles.learnerLocalStorage.setItem('csf-theme-mode','dark');
first.profiles.learnerLocalStorage.setItem('csf-achievements-seen-v1','["first_lesson"]');
for(const key of ['cstf-review-session-v1','csf-number-check-v1','csf-story:fixture'])first.profiles.learnerSessionStorage.setItem(key,'first learner');
first.manager.prepareSwitch(secondProfile.id);
// Outgoing timers/effects keep their original scope until the full navigation.
first.store.getState().addGems(3);assert.equal(first.manager.activeId,'default');
const second=tab(sessionA);
assert.equal(second.store.getState().xp,0);assert.equal(second.store.getState().selectedGrade,null);
assert.equal(second.store.getState().activeLesson,null);assert.equal(second.store.getState().dailyTimeLimitMs,0);
assert.equal(second.profiles.learnerLocalStorage.getItem('csf-theme-mode'),null);
assert.equal(second.profiles.learnerLocalStorage.getItem('csf-achievements-seen-v1'),null);
for(const key of ['cstf-review-session-v1','csf-number-check-v1','csf-story:fixture'])assert.equal(second.profiles.learnerSessionStorage.getItem(key),null);
second.store.getState().setSelectedGrade(1);second.store.getState().addGems(9);
second.store.getState().recordLessonComplete('g1up-u1-kp1','计数',1,10);
second.store.getState().setDailyTimeLimit(120000);second.store.getState().loseHeart();
second.store.getState().addMistake('g1up-u1-kp1','计数',{id:1,type:'choice',question:'1+1=?',answer:'2',options:['1','2','3','4'],score:5,difficulty:1,knowledge_point:'计数',explanation:'等于2'});
assert.ok(second.store.getState().claimDailyReward().gems>0);assert.equal(second.store.getState().claimDailyReward().gems,0);
second.achievements.markAllSeen();assert.equal(second.achievements.hasUnseenAchievements(),false);
second.profiles.learnerLocalStorage.setItem('csf-theme-mode','light');
second.profiles.learnerSessionStorage.setItem('cstf-review-session-v1','second learner');
const saved=JSON.stringify(second.store.getState()),reloaded=tab(sessionA);
assert.equal(JSON.stringify(reloaded.store.getState()),saved);
assert.equal(reloaded.profiles.learnerSessionStorage.getItem('cstf-review-session-v1'),'second learner');
assert.equal(alreadyOpen.manager.activeId,'default');assert.equal(tab(sessionB).store.getState().gems,45);
second.manager.prepareSwitch('default');const back=tab(sessionA);
assert.equal(back.store.getState().xp,120);assert.equal(back.store.getState().gems,45);assert.equal(back.store.getState().selectedGrade,2);
assert.equal(back.store.getState().activeLesson?.index,2);assert.equal(back.store.getState().dailyTimeLimitMs,60000);
assert.equal(back.store.getState().hearts,5);assert.equal(back.store.getState().mistakesBank.length,0);
assert.equal(Object.keys(back.store.getState().completedLessons).length,0);
assert.equal(back.profiles.learnerLocalStorage.getItem('csf-theme-mode'),'dark');
assert.equal(back.profiles.learnerSessionStorage.getItem('cstf-review-session-v1'),'first learner');
assert.ok(back.store.getState().claimDailyReward().gems>0);
assert.equal(back.manager.list().find(p=>p.id==='default')?.name,'姐姐');
// The boot-time theme lookup must choose exactly the same keys as hydration.
const bootKey=new Function('localStorage','sessionStorage',`${second.profiles.LEARNER_BOOT_SCRIPT}; return learnerKey('csf-theme-mode');`)(storage,sessionA);
assert.equal(bootKey,back.manager.key('csf-theme-mode'));
assert.throws(()=>back.profiles.createLearnerProfiles({getItem:storage.getItem,setItem(){throw new Error('Quota');}}).create('新档案'));
// Edition upgrades retain old grades through the actual persisted store.
const revisions = JSON.parse(readFileSync('content/editions/2026/catalog.json', 'utf8')).books as {legacyId: string; id: string}[];
for (const edition of revisions) {
  const bookId = edition.legacyId;
  const oldId = `${bookId}-u1-kp1`, newId = `${edition.id}-u1-kp1`;
  back.store.getState().recordLessonComplete(oldId, '旧版第一课', 1, 10);
  const oldGrade = structuredClone(back.store.getState().completedLessons[oldId]);
  assert.equal(back.store.getState().completedLessons[newId], undefined);
  assert.equal(back.store.getState().perfectedLessons[newId], undefined);
  back.store.getState().recordLessonComplete(newId, '新版第一课', 0.6, 6);
  assert.deepEqual(back.store.getState().completedLessons[oldId], oldGrade);
  back.store.getState().setActiveBookId(bookId);
  const editionReload = tab(sessionA).store.getState();
  assert.deepEqual(editionReload.completedLessons[oldId], oldGrade);
  assert.ok(editionReload.completedLessons[newId]);
  assert.equal(editionReload.activeBookId, bookId);
  assert.equal(editionReload.perfectedLessons[oldId], true);
  assert.equal(editionReload.perfectedLessons[newId], undefined);
}
console.log('PASS latest-main learner profiles: actual v13 store, migration, independent progress/rewards/achievements/settings, reading/review/number-sense sessions, reload, theme boot and tab isolation.');
console.log(`PASS: ${revisions.length} revised editions retain legacy grades and active book through reload; new completion and perfect rewards stay independent.`);
// Parallel five-four books share a grade/subject with six-three books but never
// share their progress identities or implicitly replace an explicit selection.
const fiveFour = JSON.parse(readFileSync('docs/five-four-2026-10-27/source-review.json', 'utf8')).books as {id: string}[];
assert.equal(fiveFour.length, 26);
for (const book of fiveFour) {
  const previousBook = book.id.split('-54-')[0];
  const previousLesson = `${previousBook}-u1-kp1`, lesson = `${book.id}-u1-kp1`;
  back.store.getState().recordLessonComplete(previousLesson, '原教材第一课', 1, 10);
  const previousGrade = structuredClone(back.store.getState().completedLessons[previousLesson]);
  back.store.getState().setActiveBookId(previousBook);
  assert.equal(back.store.getState().completedLessons[lesson], undefined);
  back.store.getState().recordLessonComplete(lesson, '五四制第一课', 0.6, 6);
  const again = tab(sessionA).store.getState();
  assert.deepEqual(again.completedLessons[previousLesson], previousGrade);
  assert.ok(again.completedLessons[lesson]);
  assert.equal(again.perfectedLessons[previousLesson], true);
  assert.equal(again.perfectedLessons[lesson], undefined);
  assert.equal(again.activeBookId, previousBook);
  again.setActiveBookId(book.id);
  assert.equal(tab(sessionA).store.getState().activeBookId, book.id);
}
console.log('PASS 26 parallel five-four textbooks: old grades/perfect rewards preserved, new grades isolated, explicit selection survives reload.');
