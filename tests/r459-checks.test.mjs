/* ============================================================================
 *  IntMap · #R459 — the document a browser kept is older than the build it names
 * ----------------------------------------------------------------------------
 *  Observed in production on 2026-08-25, minutes after a deploy: the first load returned the
 *  PREVIOUS round's index.html (`window.__imBuild==='R451'`), the hashed entry it named
 *  (`assets/main-HWuheMpu.js`) was 404, and `IntMapConsole` / `IntMapAtlasAgent` were both
 *  undefined — the bundle had not loaded at all. Unregistering the service worker and clearing
 *  Cache Storage fixed it, which made the worker look guilty; it is not. sw.js passes every
 *  non-tile request straight through and never answers a navigation.
 *
 *  MEASURED against the live site: GitHub Pages serves `Cache-Control: max-age=600` on EVERY
 *  response — index.html, sw.js, and the content-hashed, immutable assets alike. That identical
 *  header on a file whose own name contains its hash is the proof that the policy is GitHub's and
 *  not ours: Pages has no per-file header control, so «serve index.html no-cache» is not an option
 *  that exists. For up to ten minutes after a deploy a returning reader's browser can therefore
 *  answer the navigation from its own HTTP cache with a document that names assets the deploy has
 *  already replaced — and the reader gets a dead page, not a degraded one.
 *
 *  `vite:preloadError` (#R372) cannot see this. It is dispatched by Vite's preload helper, which
 *  lives INSIDE assets/main-<hash>.js: when the entry is the file that 404s, the code that would
 *  raise the prompt is the code that never arrived. REPRODUCED locally against a real dist/ and a
 *  real browser HTTP cache — six 404s, no prompt, launch screen stuck on «Loading…».
 *
 *  ⚠ THESE CHECKS RUN THE SHIPPED CODE. The recovery is sliced out of index.html and executed with
 *  stubs, so what is asserted is what it DECIDES — reload, prompt, or nothing — and not how it is
 *  spelled. A spelling check would have passed the first draft of this fix, which looped.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readLF(resolve(ROOT, 'index.html'));
const code = codeOnly(html);

/* ── the shipped recovery, lifted out of the document verbatim ──────────────────────────────── */
const START = 'window.__imDocStale=function(failed){';
const from = html.indexOf(START);
assert.ok(from >= 0, 'the entry-404 recovery is not in index.html');
const TAIL = '\n  })();';
const end = html.indexOf(TAIL, from);
assert.ok(end > from, 'could not find the end of the recovery block');
const SRC = html.slice(from, end + TAIL.length);

/** Run the real code against stubs and report every decision it took. */
function run(opts = {}) {
  const calls = { reload: 0, prompts: [], marked: [], removed: [], fetches: [] };
  const listeners = [];
  const store = new Map(Object.entries(opts.session || {}));
  const win = {
    addEventListener: (t, fn, capture) => listeners.push({ t, fn, capture }),
    __imReloadPrompt: (stale) => calls.prompts.push(stale),
  };
  const ss = {
    getItem: (k) => { if (opts.noStorage) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (opts.noStorage) throw new Error('blocked'); calls.marked.push(k); store.set(k, v); },
    removeItem: (k) => { calls.removed.push(k); store.delete(k); },
  };
  /* ⚠ `origin` is not decoration: the recovery compares it against the failing element's URL, so a
     stub without one silently answers «different origin» and nothing below ever runs. */
  const loc = {
    href: 'https://rwmqx7dwb5-arch.github.io/IntMap/',
    origin: 'https://rwmqx7dwb5-arch.github.io',
    pathname: '/IntMap/',
    reload: () => { calls.reload++; },
  };
  const fetchImpl = (url, init) => {
    calls.fetches.push({ url, cache: init && init.cache });
    if (opts.fetchFails) return Promise.reject(new Error('network'));
    return Promise.resolve({ ok: !opts.notOk, text: () => Promise.resolve(opts.serverHtml || '') });
  };
  new Function('window', 'document', 'navigator', 'sessionStorage', 'location', 'fetch', SRC)(
    win, { body: {} }, { onLine: opts.online !== false }, ss, loc, fetchImpl);
  const l = listeners.find((x) => x.t === 'error');
  assert.ok(l, 'nothing listened for a resource error');
  return { calls, listeners, errorListener: l, fire: (target) => l.fn({ target }), win };
}

const ORIGIN = 'https://rwmqx7dwb5-arch.github.io/IntMap/';
const ENTRY = { tagName: 'SCRIPT', type: 'module', src: ORIGIN + 'assets/main-OLDHASH1.js' };
const FRESH = '<script type="module" src="./assets/main-NEWHASH2.js"></script>';
const settle = () => new Promise((r) => setImmediate(() => setImmediate(r)));

/* ── ① the reported failure ─────────────────────────────────────────────────────────────────── */

test('R459 ① a stale document recovers itself — one reload, onto the build the server has', async () => {
  const h = run({ serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 1, 'the reader must be carried to the deployed build');
  assert.equal(h.calls.prompts.length, 0, 'nothing to press — the recovery is automatic when it is safe');
  /* the verification fetch has to go PAST the cache, or it reads back the same stale document */
  assert.equal(h.calls.fetches.length, 1, 'it verifies before it reloads');
  assert.equal(h.calls.fetches[0].cache, 'reload', 'bypass on the way out, re-seed the HTTP cache on the way back');
  /* …and the mark must be written BEFORE the reload, or the next load has no memory of this one */
  assert.deepEqual(h.calls.marked, ['intmap_doc_bust'], 'the one-reload mark is set before reloading');
});

/* ── ② the five ways it must NOT reload ─────────────────────────────────────────────────────── */

test('R459 ② a genuinely broken deploy gets a prompt, never a reload', async () => {
  /* the server's OWN document still names the missing entry: the file is gone, not stale.
     Reloading cannot mend that, and reloading on it is an infinite loop. */
  const h = run({ serverHtml: '<script type="module" src="./assets/main-OLDHASH1.js"></script>' });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'a reload cannot bring back a file the server does not have');
  assert.deepEqual(h.calls.prompts, [true], 'the reader gets the pressable prompt instead');
});

test('R459 ③ the one-reload mark stops the second attempt', async () => {
  const h = run({ session: { intmap_doc_bust: '1' }, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'one automatic reload per tab, whatever the verification would say');
  assert.deepEqual(h.calls.prompts, [true]);
  assert.equal(h.calls.fetches.length, 0, 'and it does not even ask — the mark is checked first');
});

test('R459 ④ no storage → no automatic reload, because the mark is what stops the loop', async () => {
  const h = run({ noStorage: true, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'with nowhere to record the attempt, an automatic reload can spin');
  assert.deepEqual(h.calls.prompts, [true]);
});

test('R459 ⑤ offline is not a redeploy — it does nothing at all', async () => {
  const h = run({ online: false, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0);
  assert.equal(h.calls.prompts.length, 0, 'the panel raises its own «check your connection» (#R372)');
});

test('R459 ⑥ an unreachable server gets a prompt, not a reload', async () => {
  const h = run({ fetchFails: true });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'if the verification cannot be made, the reload is not safe to make');
  assert.deepEqual(h.calls.prompts, [true]);
});

/* ── ⑦ …and it must keep its hands off the failure #R372 already owns ───────────────────────── */

test('R459 ⑦ a LAZY chunk that 404s is left to #R372 — the app is alive and holding state', async () => {
  const h = run({ serverHtml: FRESH });
  /* Vite's preload helper injects <link rel=modulepreload>; a dynamic import() creates no element
     at all. Either way the entry HAS loaded, the reader has a map position and possibly an Atlas
     conversation, and reloading it out from under them is the regression, not the fix. */
  h.fire({ tagName: 'LINK', rel: 'modulepreload', href: ORIGIN + 'assets/atlas-console-X.js' });
  h.fire({ tagName: 'SCRIPT', type: '', src: ORIGIN + 'assets/some-classic.js' });
  h.fire({ tagName: 'IMG', src: ORIGIN + 'assets/whatever.png' });
  await settle();
  assert.equal(h.calls.reload, 0, 'only the entry <script type=module> may trigger an automatic reload');
  assert.equal(h.calls.prompts.length, 0, 'and it must not double up on the prompt #R372 raises');
  assert.equal(h.calls.fetches.length, 0);
});

test('R459 ⑧ a third-party script that 404s is none of its business', async () => {
  const h = run({ serverHtml: FRESH });
  h.fire({ tagName: 'SCRIPT', type: 'module', src: 'https://cdn.example.com/assets/main-OLDHASH1.js' });
  await settle();
  assert.equal(h.calls.reload, 0, 'same-origin only — another host going down is not our document being stale');
  assert.equal(h.calls.fetches.length, 0);
});

test('R459 ⑨ it fires ONCE however many of the six assets 404', async () => {
  const h = run({ serverHtml: FRESH });
  h.fire(ENTRY); h.fire(ENTRY); h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.fetches.length, 1, 'a stale document 404s several assets; it must verify once');
  assert.equal(h.calls.reload, 1);
});

/* ── ⑩ the structural properties the executing checks above cannot see ──────────────────────── */

test('R459 ⑩ the recovery is INLINE in the document, and listens in the capture phase', () => {
  /* Anything under assets/ is precisely what is missing, so a recovery that lived in js/ or src/
     would be shipped inside the bundle that never loaded. */
  assert.ok(code.includes('window.__imDocStale=function'), 'it is inline in index.html');
  const idx = code.indexOf('window.__imDocStale=function');
  const entryTag = code.indexOf('src="/src/main.js"');
  assert.ok(entryTag < 0 || idx < entryTag, 'and it is installed before the entry tag is parsed');
  /* resource error events fire at the element and do NOT bubble — only a capturing listener on
     window ever sees them. Without that third argument this whole file is dead code. */
  assert.match(SRC, /addEventListener\('error',function\(ev\)\{[\s\S]*?\},true\)/,
    'the error listener is registered with capture=true, or it never fires');
});

test('R459 ⑪ the one-reload mark is never cleared — clearing it IS the loop', () => {
  /* The first draft cleared it on a load that saw no 404 («the recovery worked, so re-arm it»).
     The end-to-end test against a real HTTP cache caught that: recovering does not evict the stale
     document, which stays cached and fresh for the rest of its ten minutes, so the next navigation
     in that tab is served the same dead document and a re-armed guard reloads again. */
  assert.ok(!/removeItem\(\s*'intmap_doc_bust'/.test(code),
    'nothing may remove the mark — one automatic reload per tab');
  assert.match(code, /setItem\('intmap_doc_bust'/, 'and it is written');
});
