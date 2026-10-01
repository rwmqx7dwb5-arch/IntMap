/* ============================================================================
 *  shell-index-document-checks — index.html as a document — its inline recovery, its analytics switch, its build stamp
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r465-checks.test.mjs
 *  tests/r502-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { SITE_BASE_PATH, SITE_ORIGIN, SITE_URL } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ── ⓪ the build stamp, both halves ─────────────────────────────────────────────────────────── */
/* (tests-by-topic) the accounts the folded copies carried, kept:
   R207 ⑬ — MEASURED on the live site right after the R207 deploy: `[prod-smoke] live build = 2026-08-10-R205`.
   R206 shipped with an R205 stamp and nothing noticed, because the only rule anyone had written was
   "the two stamps agree with each other" (tests/r169-checks ⑧) — which two equally stale stamps
   satisfy perfectly. #R174 had already lost three rounds to exactly this and answered it with a
   comment saying it MUST be bumped; a comment is not a gate. The stamp's job is to let the anti-stale
   guard (index.html ~line 50) and an incident responder tell which build is live: a stamp that names
   an older round makes a CURRENT build look stale to the guard and a stale one look plausible to a
   human — both directions wrong. (2026-09-25) the build derives the stamp from the COMMIT being built
   (scripts/build-stamp.mjs); what is asked is that it is not typed back in and that the build fills it.
   R203 ⑦ — ⚠ (#R204) the exact pin lives in the CURRENT round's file; an OLD round's file can honestly
   assert only the INVARIANT: two stamps, the same round, not older than the round that wrote this. */
test('R231 build: index.html names the same round in both stamps', async () => {
  /* ⚠ (#R232) THE ROUND NUMBER IS NOT THE PROPERTY. What #R231 was protecting is that the two stamps
     AGREE and that they MOVE: they sat at R171 through three rounds. (2026-09-25) The build fills both
     from the commit being built (scripts/build-stamp.mjs); asked without naming any value.
     (tests-by-topic) FOLDED HERE: five rounds each carried this same one-line assertion —
       R196 ⑧ the build stamps have moved on from this round
       R200 ⑧: the build stamps have moved on from this round
       R203 ⑦ both build stamps name the same round, and it is not older than R203
       R207 ⑬ the build stamp names the newest round in DEV-NOTES
     — `generatedStampProblems(index.html)` is empty. Their history: #R174 recorded that a test pinning
     the CURRENT round's stamp goes quiet the moment the round ends (shipped at R196 through #R198),
     #R176/#R199 turned each copy into the negative form, and on 2026-09-25 the build began writing
     both stamps from the commit, so every copy became this one question. */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}

/* ═══════════════════════ #R465 · from r465-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R465 — the document a browser kept is older than the build it names
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
{
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
    href: SITE_URL,
    origin: SITE_ORIGIN,
    pathname: SITE_BASE_PATH,
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

const ORIGIN = SITE_URL;
const ENTRY = { tagName: 'SCRIPT', type: 'module', src: ORIGIN + 'assets/main-OLDHASH1.js' };
const FRESH = '<script type="module" src="./assets/main-NEWHASH2.js"></script>';
const settle = () => new Promise((r) => setImmediate(() => setImmediate(r)));

/* ── ① the reported failure ─────────────────────────────────────────────────────────────────── */

test('R465 ① a stale document recovers itself — one reload, onto the build the server has', async () => {
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

test('R465 ② a genuinely broken deploy gets a prompt, never a reload', async () => {
  /* the server's OWN document still names the missing entry: the file is gone, not stale.
     Reloading cannot mend that, and reloading on it is an infinite loop. */
  const h = run({ serverHtml: '<script type="module" src="./assets/main-OLDHASH1.js"></script>' });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'a reload cannot bring back a file the server does not have');
  assert.deepEqual(h.calls.prompts, [true], 'the reader gets the pressable prompt instead');
});

test('R465 ③ the one-reload mark stops the second attempt', async () => {
  const h = run({ session: { intmap_doc_bust: '1' }, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'one automatic reload per tab, whatever the verification would say');
  assert.deepEqual(h.calls.prompts, [true]);
  assert.equal(h.calls.fetches.length, 0, 'and it does not even ask — the mark is checked first');
});

test('R465 ④ no storage → no automatic reload, because the mark is what stops the loop', async () => {
  const h = run({ noStorage: true, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'with nowhere to record the attempt, an automatic reload can spin');
  assert.deepEqual(h.calls.prompts, [true]);
});

test('R465 ⑤ offline is not a redeploy — it does nothing at all', async () => {
  const h = run({ online: false, serverHtml: FRESH });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0);
  assert.equal(h.calls.prompts.length, 0, 'the panel raises its own «check your connection» (#R372)');
});

test('R465 ⑥ an unreachable server gets a prompt, not a reload', async () => {
  const h = run({ fetchFails: true });
  h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.reload, 0, 'if the verification cannot be made, the reload is not safe to make');
  assert.deepEqual(h.calls.prompts, [true]);
});

/* ── ⑦ …and it must keep its hands off the failure #R372 already owns ───────────────────────── */

test('R465 ⑦ a LAZY chunk that 404s is left to #R372 — the app is alive and holding state', async () => {
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

test('R465 ⑧ a third-party script that 404s is none of its business', async () => {
  const h = run({ serverHtml: FRESH });
  h.fire({ tagName: 'SCRIPT', type: 'module', src: 'https://cdn.example.com/assets/main-OLDHASH1.js' });
  await settle();
  assert.equal(h.calls.reload, 0, 'same-origin only — another host going down is not our document being stale');
  assert.equal(h.calls.fetches.length, 0);
});

test('R465 ⑨ it fires ONCE however many of the six assets 404', async () => {
  const h = run({ serverHtml: FRESH });
  h.fire(ENTRY); h.fire(ENTRY); h.fire(ENTRY);
  await settle();
  assert.equal(h.calls.fetches.length, 1, 'a stale document 404s several assets; it must verify once');
  assert.equal(h.calls.reload, 1);
});

/* ── ⑩ the structural properties the executing checks above cannot see ──────────────────────── */

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R465 ⑩ the recovery is INLINE in the document, and listens in the capture phase', () => {
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

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R465 ⑪ the one-reload mark is never cleared — clearing it IS the loop', () => {
  /* The first draft cleared it on a load that saw no 404 («the recovery worked, so re-arm it»).
     The end-to-end test against a real HTTP cache caught that: recovering does not evict the stale
     document, which stays cached and fresh for the rest of its ten minutes, so the next navigation
     in that tab is served the same dead document and a re-armed guard reloads again. */
  assert.ok(!/removeItem\(\s*'intmap_doc_bust'/.test(code),
    'nothing may remove the mark — one automatic reload per tab');
  assert.match(code, /setItem\('intmap_doc_bust'/, 'and it is written');
});
}

/* ═══════════════════════ #R502 · from r502-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R502 — 計測は同意も告知もなく動いていて、AI が書いた段落は AI と名乗っていなかった
 * ----------------------------------------------------------------------------
 *  ① GA (`G-57X5MX0ZPW`) と Microsoft Clarity (`x2colhytq7`) は、最初の 1 バイトの時点で
 *     起動していた。index.html:10 の静的な `<script async src=…googletagmanager…>` は
 *     パースされた瞬間にリクエストを出し、Clarity は #R193 の requestIdleCallback で少し遅れて
 *     入るだけで、どちらにも同意の門は無かった。
 *  ② そして **js/legal-text.js は、その 2 つをどこにも名指していなかった。** 9 言語の
 *     「4. 第三者 / Third parties」は Supabase から Open-Meteo まで数十社を列挙しているのに、
 *     実際に Cookie を置き DOM 再生を録っている 2 社だけが抜けていた。§5 Cookie は
 *     `Used for your session and preferences.` の 1 行で、分析についてひとことも言っていない。
 *     ⚠ **抜けていたのは実装ではなく、実装と文書の対応である。** だから直しかたも
 *     「タグを消す」ではない——**止めて、戻すときに名指しを強制する**。それが ⑤。
 *  ③ 別件だが同じ形。js/news-events.js の該当ブロックのコメントは
 *     「⚠⚠⚠ **AI が書いたことを隠さない**」と宣言していた。ところが画面に出る 9 言語の文字列は
 *     `IntMap combined what these outlets published` /「IntMap がまとめたものである」で、
 *     **`AI` という語が 1 言語にも入っていなかった。** サーバー側の取り込みが LLM に書かせて
 *     いる段落（`news_events.summary`）についての表示である以上、「隠すつもりが無い」ことは
 *     「隠れていない」ことの証拠にならない（[[intmap-r485-lessons]] と同じ形）。
 *
 *  ⚠ この検査は **綴りではなく経路**を見る。#R488 の教訓——「その綴りがファイルに在る」ことは
 *    「その規則が効いている」ことではない——なので、①②③ はどれも
 *    「フラグより後ろに在るか」「同じ 1 つのスイッチを見ているか」という**順序と結線**を訊く。
 * ========================================================================== */
{
const HTML = read('index.html');
const SWITCH = /window\.INTMAP_ANALYTICS\s*=\s*(true|false)\s*;/;

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R502 ①: スイッチはちょうど 1 つ、真偽値リテラルで宣言されている', () => {
  const all = [...HTML.matchAll(/window\.INTMAP_ANALYTICS\s*=/g)];
  assert.equal(all.length, 1, `INTMAP_ANALYTICS への代入が ${all.length} 箇所ある——1 つでなければ「1 か所で戻せる」が嘘になる`);
  const m = HTML.match(SWITCH);
  assert.ok(m, 'INTMAP_ANALYTICS が `true` / `false` のリテラルで宣言されていない');
});

/* spelling kept: page markup / inline script (index.html, admin.html, privacy.html, terms.html, science.html, sources.html) — only a browser document runs it. */
test('R502 ②: スイッチを通らずにタグを読み込む経路が 1 本も無い', () => {
  /* 静的な `<script src=…>` はパースされた時点で必ず飛ぶ——フラグでは止められない。
     ⚠ index.html だけを見ない。**配られる HTML はこれで全部**（実測: 計測タグを持つのは
     index.html だけだが、「今そうである」ことと「増えても捕まる」ことは別）。 */
  const PAGES = ['index.html', 'admin.html', 'privacy.html', 'terms.html', 'science.html', 'sources.html'];
  for (const page of PAGES) {
    const body = read(page);
    const statics = [...body.matchAll(/<script[^>]*\ssrc\s*=\s*["'][^"']*(googletagmanager|google-analytics|clarity\.ms)[^"']*["']/gi)];
    assert.equal(statics.length, 0,
      `${page} に静的な <script src> が ${statics.length} 本ある（${statics.map((s) => s[1]).join(', ')}）——フラグの手前で読み込まれてしまう`);
    if (page !== 'index.html') {
      /* 計測は index.html の 1 か所だけが持つ。増えたら、そのページにも門が要る。 */
      for (const id of ['G-57X5MX0ZPW', 'x2colhytq7']) {
        assert.ok(!body.includes(id), `${page} が «${id}» を持ち始めた——このページには門が無い`);
      }
    }
  }

  const iSwitch = HTML.search(SWITCH);
  const iGaGuard = HTML.indexOf('if(!window.INTMAP_ANALYTICS) return;');
  const iGaLoad = HTML.indexOf('googletagmanager.com/gtag/js?id=G-57X5MX0ZPW');
  const iClGuard = HTML.indexOf('if(!c.INTMAP_ANALYTICS) return;');
  const iClLoad = HTML.indexOf('clarity.ms/tag/');

  for (const [name, v] of [['switch', iSwitch], ['GA guard', iGaGuard], ['GA loader', iGaLoad], ['Clarity guard', iClGuard], ['Clarity tag', iClLoad]]) {
    assert.ok(v > 0, `${name} が index.html に無い`);
  }
  assert.ok(iSwitch < iGaGuard, 'GA の門がスイッチより前にある（宣言前に読まれる）');
  assert.ok(iGaGuard < iGaLoad, 'GA のローダが門の外にある');
  assert.ok(iSwitch < iClGuard, 'Clarity の門がスイッチより前にある');
  assert.ok(iClGuard < iClLoad, 'Clarity のタグ挿入が門の外にある');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R502 ③: 止めても、タグ本体と #R155/#R272 の防御は 1 つも消えていない', () => {
  /* 「一旦停止であって削除ではない」——戻す先が残っていることを、ここで固定する。 */
  /* ⚠ assert.match は失敗すると HTML 全体（85 KB）を吐いてログを埋める。ここは includes で訊く。 */
  const has = (needle, why) => assert.ok(HTML.includes(needle), why);
  has('G-57X5MX0ZPW', 'GA の measurement id が消えている');
  has('clarity.ms/tag/', 'Clarity のタグ本体が消えている');
  has('window.__imScrubAuthUrl=_scrub;', '#R155 の auth URL スクラブが消えている');
  /* ⚠ スクラブの定義は門の **外**（常に走る）。GA を止めても window.__imScrubAuthUrl は在る。 */
  assert.ok(HTML.indexOf('window.__imScrubAuthUrl=_scrub;') < HTML.indexOf('if(!window.INTMAP_ANALYTICS) return;'),
    'スクラブの定義が門の内側に入った——GA を止めると __imScrubAuthUrl が消える');
  has('function gtag(){dataLayer.push(arguments);}', 'gtag の queue shim が消えている（呼ぶ側が落ちる）');
  has('c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};', 'Clarity の queue shim が消えている');
});

/* spelling kept: browser script (js/legal-text.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R502 ④: 計測を戻すなら、プライバシー本文が両サービスを名指していること', () => {
  /* ⚠⚠⚠ **これがこのラウンドの本体である。** 止めたことではなく、
     「名前を書かないまま黙って戻す」経路を塞いだことが直しかた。
     スイッチが `true` になった瞬間、この検査が js/legal-text.js を要求する。 */
  const on = (HTML.match(SWITCH) || [])[1] === 'true';
  if (!on) return;                      /* 停止中は要求しない——収集していないものの告知は要らない */
  const legal = read('js/legal-text.js');
  for (const name of ['Google Analytics', 'Clarity']) {
    assert.ok(legal.includes(name),
      `INTMAP_ANALYTICS を true に戻したのに js/legal-text.js が «${name}» を名指していない`);
  }
});
}
