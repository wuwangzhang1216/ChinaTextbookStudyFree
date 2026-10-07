import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const handlers = new Map();
let fetches = 0;
let writes = 0;
const quotaErrors = [];
const unhandled = error => quotaErrors.push(error);
process.on('unhandledRejection', unhandled);
const cached = new Response('cached full body');
runInNewContext(readFileSync(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8'), {
  self: { location: { origin: 'https://classroom.example' }, addEventListener: (name, handler) => handlers.set(name, handler) },
  caches: { open: async () => ({
    match: async () => cached.clone(),
    put: () => { writes++; return Promise.reject(new Error('Storage quota exceeded')); },
  }) },
  fetch: async () => { fetches++; return new Response('fresh body'); },
  URL,
  Response,
});
const handler = handlers.get('fetch');
assert.equal(typeof handler, 'function');
let intercepted = false;
handler({ request: new Request('https://classroom.example/audio/voice.mp3', { headers: { Range: 'bytes=0-31' } }),
  respondWith: () => { intercepted = true; } });
assert.equal(intercepted, false, 'Range requests must reach the network, without full cached audio substitution');
assert.equal(fetches, 0);
assert.equal(writes, 0);
let result;
handler({ request: new Request('https://classroom.example/data/index.json'), respondWith: promise => { result = promise; } });
assert.equal(await (await result).text(), 'cached full body');
await new Promise(resolve => setImmediate(resolve));
assert.equal(fetches, 1, 'Cached data must still refresh in the background');
assert.equal(writes, 1);
handler({ request: new Request('https://classroom.example/data/books/g1up/lessons/g1up-u6-kp2.json', { cache: 'no-store' }), respondWith: promise => { result = promise; } });
assert.equal(await (await result).text(), 'fresh body', 'review reconciliation must not grade stale cached lesson JSON');
assert.equal(fetches, 2);
assert.equal(writes, 1, 'explicit fresh loads must not re-enter the stale cache');
assert.deepEqual(quotaErrors, [], 'Storage quota failures must not cause unhandled rejections');
process.off('unhandledRejection', unhandled);
console.log('PASS: byte ranges bypass cache; cached data refreshes; review loads bypass stale JSON; quota errors are handled.');
