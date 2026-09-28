/* ============================================================================
 *  IntMap · stale-tab-chunks checks — a lazy chunk that 404s after a deploy
 * ----------------------------------------------------------------------------
 *  Measured on production: a tab opened on build 24107be and kept across the next deploy asked for
 *  `atlas-console-<hash>.js`; GitHub Pages keeps no previous assets, so it was a 404 and the Atlas
 *  console could not load. index.html already raised a pressable prompt from `vite:preloadError` —
 *  but it said «a new version is available» for ANY failed chunk while online, so a dropped
 *  connection on the same build was told something untrue.
 *
 *  Now the prompt's words are earned by asking the server which build it serves:
 *    different stamp → «new version» · same stamp → «part could not be downloaded, reload to retry»
 *    (NOT silence: the failed URL stays failed in the module map until a reload) ·
 *    document unreachable → offline, no prompt, and the one question is not spent.
 *
 *  ⚠ THESE RUN THE SHIPPED CODE: the verdict and the check are imported from js/lazy-modules.js,
 *  and index.html's listener and prompt are sliced out and executed with stubs.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { chunkFailureVerdict, makeChunkFailureCheck } from '../js/lazy-modules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readLF(resolve(ROOT, 'index.html'));

const MINE = '2026-09-28T20:19:10Z-24107be';
const NEXT = '2026-09-29T01:02:03Z-04f3f0c';
const doc = (stamp) => `<script>window.__imBuild='${stamp}';</script>`;

test('① the verdict: a different served stamp is a new build; the same, or none, is not', () => {
  assert.equal(chunkFailureVerdict(MINE, doc(NEXT)), 'new-build');
  assert.equal(chunkFailureVerdict(MINE, doc(MINE)), 'same-build');
  /* a document we cannot read a stamp from does not prove a deploy — say only what is true */
  assert.equal(chunkFailureVerdict(MINE, '<html>Service unavailable</html>'), 'same-build');
  assert.equal(chunkFailureVerdict('', doc(NEXT)), 'same-build');
  /* the stamp the build writes into index.html is found in the real source shape */
  assert.equal(chunkFailureVerdict('__INTMAP_BUILD_STAMP__', html), 'same-build');
  assert.equal(chunkFailureVerdict(MINE, html), 'new-build', 'the stamp is read from the real index.html');
});

/** run the check against stubs; returns what it fetched and prompted */
function harness({ served, fails = 0 } = {}) {
  const calls = { fetches: 0, prompts: [] };
  let failLeft = fails;
  const check = makeChunkFailureCheck({
    mine: () => MINE,
    fetchDoc: () => { calls.fetches++; if (failLeft > 0) { failLeft--; return Promise.reject(new Error('network')); } return Promise.resolve(doc(served)); },
    prompt: (v) => calls.prompts.push(v),
  });
  return { check, calls };
}

test('② 404 → a new build is served → the «new version» prompt, once', async () => {
  const { check, calls } = harness({ served: NEXT });
  const v = await Promise.all([check(), check(), check()]);   /* measured: one module, three events */
  assert.deepEqual(v, ['new-build', 'new-build', 'new-build']);
  assert.equal(calls.fetches, 1, 'one question per tab, however many chunks fail at once');
  await check();
  assert.equal(calls.fetches, 1, 'and not again later');
  assert.deepEqual(calls.prompts, ['new-build']);
});

test('③ the same build is served → still a prompt, with the retry words (never silence)', async () => {
  const { check, calls } = harness({ served: MINE });
  assert.equal(await check(), 'same-build');
  assert.deepEqual(calls.prompts, ['same-build']);
});

test('④ the document is unreachable → offline: no prompt, and the question is not spent', async () => {
  const { check, calls } = harness({ served: NEXT, fails: 1 });
  assert.equal(await check(), 'unreachable');
  assert.deepEqual(calls.prompts, [], 'an unreachable server proves no deploy');
  assert.equal(await check(), 'new-build', 'the next failure asks again');
  assert.equal(calls.fetches, 2);
  assert.deepEqual(calls.prompts, ['new-build']);
});

/* ── index.html: the listener and the prompt, executed ─────────────────────────────────────── */
function slice(start, endMark) {
  const a = html.indexOf(start); assert.ok(a >= 0, `index.html no longer has «${start}»`);
  const b = html.indexOf(endMark, a); assert.ok(b > a);
  return html.slice(a, b + endMark.length);
}
const LISTENER = slice("window.addEventListener('vite:preloadError'", '\n').trim();   /* one line in the source */
const PROMPT = slice('window.__imReloadPrompt=function(stale,failed){', '}catch(e){} };');

function runListener({ online = true, ready = 'complete', hasCheck = true } = {}) {
  const calls = { checks: 0, prompts: [], deferred: [] };
  const handlers = {};
  const win = {
    addEventListener: (t, fn) => { if (handlers[t]) calls.deferred.push(t); handlers[t] = fn; },
    __imReloadPrompt: (stale) => calls.prompts.push(stale),
  };
  if (hasCheck) win.__imChunkFailed = () => { calls.checks++; };
  new Function('window', 'document', 'navigator', LISTENER)(win, { readyState: ready }, { onLine: online });
  const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  handlers['vite:preloadError'](ev);
  return { calls, handlers, ev };
}

test('⑤ the listener hands the failure to the verdict — and never consumes the event', () => {
  const a = runListener();
  assert.equal(a.calls.checks, 1);
  assert.deepEqual(a.calls.prompts, [], 'no unverified «new version» when the verdict is there');
  assert.equal(a.ev.defaultPrevented, false, 'the import must still reject (js/lazy-modules.js learns from it)');
  assert.equal(runListener({ online: false }).calls.checks, 0, 'offline is not a deploy');
  /* before the page has finished loading the verdict may not exist yet — wait for load */
  const b = runListener({ ready: 'loading' });
  assert.equal(b.calls.checks, 0); b.handlers.load(); assert.equal(b.calls.checks, 1);
  /* …and if the loader never arrived, the old prompt rather than nothing */
  assert.deepEqual(runListener({ hasCheck: false }).calls.prompts, [false]);
});

test('⑥ the prompt says the retry words for a same-build failure, in en and jp', () => {
  for (const [lang, want, other] of [['en', 'could not be downloaded', 'new version'], ['jp', '取得できませんでした', '新しいバージョン']]) {
    const say = (stale, failed) => {
      const made = [];
      const el = () => ({ firstChild: {}, lastChild: {}, setAttribute() {}, set innerHTML(_) {} });
      const document = { getElementById: () => null, createElement: () => { const e = el(); made.push(e); return e; }, body: { appendChild() {} } };
      const localStorage = { getItem: () => JSON.stringify({ lang }) };
      const window = { IntMapLang: { t: (l, en, jp) => (l === 'jp' ? jp : en) } };
      new Function('window', 'document', 'localStorage', 'location', PROMPT + '; window.__imReloadPrompt(' + stale + ',' + failed + ');')(window, document, localStorage, {});
      return made[0].firstChild.textContent;
    };
    assert.ok(say(false, true).includes(want), `${lang}: same build → retry words`);
    assert.ok(!say(false, true).includes(other));
    assert.ok(say(false, false).includes(other), `${lang}: new build → the «new version» words, unchanged`);
  }
});
