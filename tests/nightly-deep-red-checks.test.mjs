/* ============================================================================
 *  Overpass had no clock, and it had one copy of its loop per caller
 * ----------------------------------------------------------------------------
 *  The nightly deep run went red on tests/r184-routing.spec.js (route ⑨) and tests/r184-drone.spec.js
 *  (④ ⑥, whose `prepare()` runs the restricted-area check): the three Overpass mirrors answered 504
 *  after 12 s, 102 s and 93 s, and js/routing-ops.js and js/drone-ops.js walked them one after another
 *  with no deadline of any kind, so the specs ran out of time before they reached their own «Overpass
 *  unreachable, skip» line. The two files carried the same four lines; ten more files carried their
 *  own mirror lists and their own loops (some raced with an abort, some walked with none).
 *
 *  js/overpass.js is now the one client. These checks hold the three facts the fix rests on:
 *    ① no file but js/overpass.js spells an Overpass endpoint, and every file that both writes an
 *      Overpass query and fetches anything reaches that client — the callers are DISCOVERED from the
 *      sources, not listed here;
 *    ② a mirror that has not answered within its share of the budget hands over to the NEXT mirror
 *      (a different server — one-pass-or-a-reason.md §5), and an observed failure does so at once;
 *    ③ when every mirror has failed the caller is TOLD so (`OverpassUnavailable`), which is a
 *      different answer from an empty `elements` array.
 *  ② and ③ evaluate the shipped module with `fetch` replaced; nothing here touches the network.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = 'js/overpass.js';

/* every .js under js/ and src/, found on disk (a new file is counted the day it appears) */
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(n)) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}
const SOURCES = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'src'))]
  .filter((f) => !f.startsWith('js/locales/'))   /* prose pages that NAME the service for readers */
  .map((f) => ({ f, code: codeOnly(readFileSync(join(ROOT, f), 'utf8')) }));

/* an Overpass endpoint, however spelled: an https URL whose path is the interpreter */
const ENDPOINT = /https:\/\/[a-z0-9.-]*overpass[a-z0-9.-]*\/api\/interpreter/i;
/* reaching the client: importing it, the window publish, or atlas-sources' overpassRaw (which IS it) */
const REACHES = /\boverpassQuery\(|\bIntMapOverpass\(|\boverpassRaw\(/;

test('① js/overpass.js is the only file that spells an Overpass endpoint', () => {
  const client = SOURCES.find((s) => s.f === CLIENT);
  assert.ok(client && ENDPOINT.test(client.code), 'the client itself names no endpoint');
  const others = SOURCES.filter((s) => s.f !== CLIENT && ENDPOINT.test(s.code)).map((s) => s.f);
  assert.deepEqual(others, [], 'these files carry their own Overpass endpoint (and so their own loop): ' + others.join(', '));
});

test('① every file that writes an Overpass query and fetches reaches the one client', () => {
  const writers = SOURCES.filter((s) => s.f !== CLIENT && s.code.includes('[out:json]'));
  assert.ok(writers.length > 0, 'no Overpass query was found anywhere — the discovery is broken, not the rule satisfied');
  const callers = SOURCES.filter((s) => s.f !== CLIENT && REACHES.test(s.code)).map((s) => s.f);
  const stray = writers.filter((s) => /\bfetch\(/.test(s.code) && !REACHES.test(s.code)).map((s) => s.f);
  assert.deepEqual(stray, [], 'these files build an Overpass query and fetch, but not through js/overpass.js: ' + stray.join(', '));
  /* the callers found are the whole list: every writer is a caller or builds a query it hands to one */
  for (const w of writers) {
    if (callers.includes(w.f)) continue;
    assert.doesNotMatch(w.code, /\bfetch\(/, w.f + ' writes a query and fetches outside the client');
  }
  assert.ok(callers.length >= writers.filter((s) => /\bfetch\(/.test(s.code)).length,
    `${callers.length} callers for ${writers.length} query writers`);
});

/* ── ② ③ the shipped module, with the network replaced ─────────────────────────────────────── */
const { overpassQuery } = await import('../js/overpass.js');
const MIRRORS = overpassQuery.mirrors;

/* a fake fetch: per URL, 'hang' (never answers until aborted), a status number, or a JSON body */
function fakeFetch(plan, log) {
  return (url, init) => {
    log.push({ url, t: Date.now() });
    const what = plan[url];
    return new Promise((resolve, reject) => {
      const sig = init && init.signal;
      const onAbort = () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
      if (sig) { if (sig.aborted) return onAbort(); sig.addEventListener('abort', onAbort); }
      if (what === 'hang') return;
      if (typeof what === 'number') return resolve({ ok: false, status: what, text: async () => '' });
      resolve({ ok: true, status: 200, text: async () => JSON.stringify(what) });
    });
  };
}
async function withFetch(plan, fn) {
  const log = [], real = globalThis.fetch;
  globalThis.fetch = fakeFetch(plan, log);
  try { return await fn(log); } finally { globalThis.fetch = real; }
}
const Q = '[out:json][timeout:60];node(1);out;';

test('② a mirror that does not answer within its share hands over to the next one', async () => {
  const plan = { [MIRRORS[0]]: 'hang', [MIRRORS[1]]: { elements: [{ id: 2 }] }, [MIRRORS[2]]: 'hang' };
  await withFetch(plan, async (log) => {
    const t0 = Date.now();
    const j = await overpassQuery(Q, { budgetMs: 600 });   /* three endpoints → 200 ms of patience each */
    assert.deepEqual(j.elements, [{ id: 2 }], 'the answer came from the second mirror');
    assert.equal(log[0].url, MIRRORS[0]);
    assert.equal(log[1].url, MIRRORS[1], 'the next mirror is a DIFFERENT server, not the same one again');
    assert.ok(log[1].t - t0 >= 150, 'the second mirror was started before the first had its patience');
    assert.ok(Date.now() - t0 < 600, 'the hung first mirror held the call for the whole budget');
  });
});

test('② an observed failure (a 504, or a partial answer) moves on at once', async () => {
  const plan = {
    [MIRRORS[0]]: 504,
    [MIRRORS[1]]: { remark: 'runtime error: Query timed out in "query" at line 1 after 60 seconds.', elements: [{ id: 'fragment' }] },
    [MIRRORS[2]]: { elements: [] },
  };
  await withFetch(plan, async (log) => {
    const t0 = Date.now();
    const j = await overpassQuery(Q, { budgetMs: 3000 });
    assert.deepEqual(j.elements, [], 'an EMPTY answer from a healthy mirror is an answer, not a failure');
    assert.deepEqual(log.map((l) => l.url), MIRRORS, 'each server once, in order');
    assert.ok(Date.now() - t0 < 500, 'observed failures waited for the patience timer instead of moving on');
  });
});

test('③ when every mirror fails, the caller is told Overpass did not answer', async () => {
  const plan = { [MIRRORS[0]]: 504, [MIRRORS[1]]: 429, [MIRRORS[2]]: 'hang' };
  await withFetch(plan, async () => {
    const t0 = Date.now();
    await assert.rejects(overpassQuery(Q, { budgetMs: 400 }), (e) => {
      assert.equal(e.name, 'OverpassUnavailable');
      assert.equal(e.attempts.length, MIRRORS.length, 'every mirror is accounted for');
      assert.match(e.attempts[0].error, /504/);
      assert.match(e.attempts[1].error, /429/);
      assert.ok(e.attempts[2].error, 'the hung mirror is recorded as failed, not left blank');
      return true;
    });
    assert.ok(Date.now() - t0 < 1000, 'the budget did not bound the call');
  });
});

test('③ the budget is the query\'s own [timeout:], lowered but never raised by the caller', async () => {
  const plan = { [MIRRORS[0]]: 'hang', [MIRRORS[1]]: 'hang', [MIRRORS[2]]: 'hang' };
  await withFetch(plan, async () => {
    const t0 = Date.now();
    /* [timeout:0] declares nothing to wait for; a caller asking for a minute must not get one */
    await assert.rejects(overpassQuery('[out:json][timeout:0];node(1);out;', { budgetMs: 60000 }), /Overpass did not answer/);
    const took = Date.now() - t0;
    assert.ok(took < 6500, `a 0 s query was held for ${took} ms — the caller raised the budget`);
  });
});
