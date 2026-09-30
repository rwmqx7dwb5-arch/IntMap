/* ============================================================================
 *  shell-i18n-locales-checks — the language registry and the locale tables — what each language actually holds
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r467-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r221-checks.test.mjs
 *  tests/r335-checks.test.mjs
 *  tests/r459-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readLF } from '../scripts/eol.mjs';
import { shapeOf } from '../scripts/i18n-helpers.mjs';
import * as acorn from 'acorn';
import * as OpenCC from 'opencc-js';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* The language registry, EVALUATED. js/locales/_langs.js and js/lang-registry.js are run in a fresh
   context against a stub window — the way the two reading pages load them (<script src>) — so a claim
   about what the registry ANSWERS is asked of the registry, not of how its source happens to be
   spelled. Each call builds its own context: no test sees another's tables. */
function langRegistry() {
  const doc = { documentElement: { lang: 'en', setAttribute() { } }, querySelector: () => null, title: '', addEventListener() { } };
  const w = { document: doc, console };
  w.window = w;
  const ctx = vm.createContext(w);
  for (const p of ['js/locales/_langs.js', 'js/lang-registry.js']) vm.runInContext(read(p), ctx, { filename: p });
  return { w, ctx, L: w.IntMapLang };
}

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R231 — source-level regression checks
 * ----------------------------------------------------------------------------
 *  One test per claim this round makes, written against the SOURCE rather than against a rendered
 *  page, because every one of these is a structural property: a list that must have one owner, a
 *  route that must not exist, a coordinate system that must come from one box.
 *
 *  ⚠ THE ASSERTIONS ARE RELATIONS, NOT THIS ROUND'S NUMBERS. Pinning a measured value here is the
 *  defect this project keeps re-learning (#R198, #R199, #R203, #R218, #R226): the next round moves
 *  the number in the direction it was asked to, and its own test fails. So the checks below ask
 *  "does the launch screen name every registered language" and not "does it name seven", and
 *  "is the field of the dark mark the dark screen colour" and not "is it #000000 at 89.7 %".
 * ==========================================================================*/
{
/* whole-line // comments */
const noHtml = (p) => codeOnly(read(p), { lang: 'html' });

/* ── ⑥ the reading pages come back to the map you left ──────────────────────────────────────── */
/* spelling kept: page markup / inline script (sources.html, science.html) — only a browser document runs it. */
test('R231 reading pages: back is history.back, and the href survives for a new tab', () => {
  const src = read('js/page-i18n.js');
  assert.match(src, /function wireBack\(a\)/, 'one helper');
  assert.match(src, /history\.back\(\)/, 'which goes back');
  assert.match(src, /new URL\(document\.referrer\)\.origin === location\.origin/, 'only when that lands on this site');
  assert.match(src, /e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey/, 'and only for a plain primary click');
  assert.ok((src.match(/wireBack\(/g) || []).length >= 3, 'wired at both links (header + footer) and declared');
  for (const p of ['sources.html', 'science.html']) {
    assert.match(read(p), /class="pg-back" href="\.\/index\.html"/, `${p} keeps a real href`);
  }
});

/* ── ⑦ the language system: ONE list, and Chinese actually reaches the screen ────────────────── */
test('R231 i18n: no hand-written five-language chain is left in js/', () => {
  /* the codemod is the check — it reports what it could still convert */
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/lang-ternary-codemod.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /convertible: 0\b/, 'nothing convertible is left:\n' + out);
});

test('R231 i18n: the registry answers for translations AND for Intl', () => {
  /* (tests-by-topic) ASKED OF THE REGISTRY. This used to match `function t(lang)` and
     `t: t, locale: locale` in the source; the registry now runs, and what it RETURNS is the claim. */
  const { L } = langRegistry();
  assert.equal(typeof L.t, 'function', 't(lang, …) is exported');
  assert.equal(typeof L.locale, 'function', 'and locale(code, enTag)');
  /* t(): positional for the first five, the `inline` table past them, English underneath both */
  assert.equal(L.t('jp', 'No data', 'データなし'), 'データなし', 'a positional language takes its own argument');
  L.define('fr', { inline: { Close: 'Fermer' } });
  assert.equal(L.t('fr', 'Close', '閉じる'), 'Fermer', 'a language past the fifth reads the inline table');
  assert.equal(L.t('ko', 'Close', '閉じる'), 'Close', 'and with no row it falls back to English, never to the Japanese argument');
  /* the English default must be preservable, or every en-GB call site silently changes format */
  assert.equal(L.locale('en', 'en-GB'), 'en-GB', 'an English caller keeps its own tag');
  assert.equal(L.locale('en'), 'en-US', 'and without one gets the registry’s English region');
  assert.equal(L.locale('zh-hans'), 'zh-CN', 'a Chinese reader gets a Chinese region, not the English caller’s tag');
  /* and the report can SEE the new shape, or the blind spot just moved */
  /* ⚠ (#R251) …and the shape is recognised in ONE place now (scripts/i18n-helpers.mjs), because the
     same question was answered three times, per file, and all three missed a helper reached through
     a property of another module. The report must still SEE `t(…)` — asked of the resolver itself:
     a `window.IntMapLang.t(lang, 'English', …)` call is a translation site whose English is argument 1. */
  const src = "window.IntMapLang.t(HOST.lang, 'Close', '閉じる');";
  const call = acorn.parse(src, { ecmaVersion: 'latest' }).body[0].expression;
  assert.equal(shapeOf(call, { names: new Set(), exposed: new Set(), src }), 1, 'the shared resolver counts t(…) call sites, English at argument 1');
  /* spelling kept: the report's WIRING to the resolver is the claim — which function scripts/i18n-report.mjs calls. */
  assert.match(read('scripts/i18n-report.mjs'), /shapeOf\(/, 'the coverage report asks the shared resolver');
});

/* spelling kept: page markup / inline script (sources.html, science.html) — only a browser document runs it. */
test('R231 i18n: the reading pages read the ONE registry, and Chinese is there', () => {
  const src = read('js/page-i18n.js');
  assert.match(src, /window\.IntMapLang && window\.IntMapLang\.list/, 'LANGS is derived from the registry');
  for (const p of ['sources.html', 'science.html']) {
    const h = noHtml(p);
    assert.ok(h.indexOf('lang-registry.js') >= 0, `${p} loads the registry`);
    assert.ok(h.indexOf('lang-registry.js') < h.indexOf('page-i18n.js'), `${p} loads it FIRST`);
  }
  /* ⚠⚠ …AND IT HAS TO REACH dist/. The two pages are copied, not bundled, so a file they <script
     src> is only in the build if vite.config.js's STATIC list names it. It did not, so the built
     page had no `window.IntMapLang`, page-i18n fell back to its five literals, and the picker lost
     Chinese again — the very defect this round exists to fix, reintroduced one layer down. Caught by
     opening the BUILT page, which is the only place a copy list can be wrong. */
  assert.match(read('vite.config.js'), /'js\/lang-registry\.js',/, 'vite copies the registry to dist/');
  /* every registered language must have a reading-pages file, or its picker entry renders English */
  const codes = [...read('js/lang-registry.js').matchAll(/\{ code: '([^']+)',[^}]*html: '([^']+)'/g)].map((m) => m[2].toLowerCase());
  assert.ok(codes.length >= 7, 'the registry has at least the seven that ship');
  for (const c of codes) {
    assert.ok(existsSync(join(ROOT, 'js/locales/pages.' + c + '.js')), `js/locales/pages.${c}.js exists`);
  }
  /* a partial translation must not delete the English prose it has not reached */
  assert.match(src, /Object\.keys\(t\)\.forEach/, 'sections merge per FIELD, not wholesale');
});

test('R231 i18n: the Simplified files are generated, never hand-written', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/zh-hans.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /ui\.zh-hans\.js is in sync/);
  assert.match(out, /pages\.zh-hans\.js is in sync/);
  /* ⚠⚠ AND THE ENGLISH KEYS SURVIVE THE CONVERSION. The `inline` table is keyed by the English
     source string, and two of those strings quote Japanese inside otherwise-English prose (the
     seismic method note cites 気象庁「計測震度の算出方法」). The character map rewrote the quote, so
     the Simplified key no longer equalled the string at the call site and the entry was dead — a
     translation sitting in the file, never used. */
  assert.match(read('scripts/zh-hans.mjs'), /keys are therefore lifted out before the conversion|Keys are\s+therefore lifted out/i,
    'the generator preserves keys');
  const hans = read('js/locales/ui.zh-hans.js');
  assert.ok(hans.includes('気象庁「計測震度の算出方法」'), 'the Japanese quoted INSIDE an English key is untouched');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R231 i18n: the launch screen names every registered language', () => {
  /* ⚠ IT CANNOT IMPORT THE REGISTRY — it runs before any module, which is the whole point of a launch
     screen (#R224 says so in that file). So it is VERIFIED against the registry instead of trusted to
     be remembered: #R223 added a language and missed this line, and Chinese booted in English. */
  const codes = [...read('js/lang-registry.js').matchAll(/\{ code: '([^']+)'/g)].map((m) => m[1]);
  const boot = read('index.html');
  const table = boot.slice(boot.indexOf('var L={en:'), boot.indexOf('var L={en:') + 400);
  for (const c of codes) {
    assert.ok(new RegExp(`(^|[{,])\\s*'?${c.replace('-', '\\-')}'?\\s*:`).test(table),
      `the launch screen has a word for '${c}' — add it to the L={…} table in index.html`);
  }
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑨ every new user-facing string exists in all five languages ───────────────────────────────── */
/* spelling kept: browser script (js/locales/ui.) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑨ the new settings strings are translated into EN/JP/DE/RU/ES', () => {
  /* ⚠ (#R239) SAME CLAIM, NEW HOME — every keyed string moved into js/locales/ui.<code>.js.
     The `Object.assign(i18n.en…es,{…})` shape this test read was five languages by
     construction, and fr/ko/zh fell back to English for ~170 keys declared that way
     (scripts/i18n-keyed-audit.mjs). Nine locale files is the stricter form of the same
     question. (#R203: move the assertion, say why.) */
  const keys = ['newsCountryOff', 'newsCountryMultiSel', 'lblNewsSources', 'newsSourceAll', 'newsSourceMultiSel', 'newsSourcesHint'];
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const t = read('js/locales/ui.' + c + '.js');
    for (const k of keys) assert.ok((t.includes(k + ':') || t.includes('"' + k + '":')), `${c} defines ${k}`);
  }
});
}

/* ═══════════════════════ #R467 · from r467-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · R467 — the gate said 100 %, production said «Display name»
 * ----------------------------------------------------------------------------
 *  #R459 widened scripts/i18n-attr-audit.mjs and translated the 29 reader-facing attributes it
 *  found. Production verification in French and Korean then showed two of them STILL English:
 *
 *      #am-name  placeholder="Display name"
 *      #am-pass  placeholder="Password"
 *
 *  ⚠⚠⚠ AND `npm run check:i18n` PRINTED fr 100 % WHILE THAT WAS ON SCREEN. #R459 wrapped both in
 *  `_authL(…)`, which is js/auth-ui.js's LAZY WRAPPER —
 *
 *      function _authL(){ if(!_authL._p) _authL._p = window.IntMapLang.pick(()=>HOST.lang);
 *                         return _authL._p.apply(null, arguments); }
 *
 *  — and that is the ONE shape scripts/i18n-helpers.mjs cannot prove is a helper. Architecture.md
 *  §10.1 already records the same case for js/map-readout.js. An unproven callee means the English
 *  strings never enter the inline `want` set; `pick()` resolves the first five languages
 *  POSITIONALLY and the other four out of the inline table, so fr / ko / zh fell through to
 *  argument 0 — the English — and no percentage anywhere could go down.
 *
 *  ⚠ SO THE LESSON IS NOT «add two rows». It is that «translated» was decided by the CALL GRAPH,
 *  and the call graph has a shape it cannot see. This file therefore asks the question the reader
 *  asks, of the TABLES rather than of the call graph: for each English string this family put on
 *  screen, does the French / Korean / Chinese table actually carry something else?
 * ==========================================================================*/
{
const R = read;

/* the four languages that have NO positional slot: they can only resolve out of the inline table,
   keyed by the English string. The other five are pinned by the positional surface of the gate. */
const INLINE = { fr: 'ui.fr.js', ko: 'ui.ko.js', zh: 'ui.zh.js', 'zh-hans': 'ui.zh-hans.js' };

/* every English string #R459/#R467 put behind a reader-facing attribute through the inline table */
const SHIPPED = [
  'Close', 'Close popup', 'Base map', 'Base map and projection',
  'Display name', 'Password', 'email', 'API key', 'remove', 'file: ',
  'Expand', 'Minimize',
  /* ⚠ THE ACCOUNT SHEET HAS A SECOND WRITER. `#am-pass`'s placeholder is set by the markup
     template AND rewritten by the tab switcher, so fixing one arm leaves the other — the same
     shape as the ★ that #R459 was reported for. The switcher's own strings are these three. */
  'Password (min. 8 chars, incl. a number)', 'Log In', 'Create account',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* the row as the locale file writes it: 'English': 'translation', either quote, either side */
function lookup(src, en) {
  const re = new RegExp('(["\'])' + esc(en) + '\\1\\s*:\\s*(["\'])((?:\\\\.|(?!\\2)[^\\\\])*)\\2');
  const m = src.match(re);
  return m ? m[3] : null;
}

/* spelling kept: browser script (js/locales/) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R467 ① every attribute string this family ships resolves in fr / ko / zh, and is not the English word', () => {
  const bad = [];
  for (const [code, file] of Object.entries(INLINE)) {
    const src = R('js/locales/' + file);
    for (const en of SHIPPED) {
      const got = lookup(src, en);
      if (got == null) bad.push(`${code}: "${en}" has no row`);
      else if (got === en) bad.push(`${code}: "${en}" is still the English word`);
    }
  }
  assert.deepEqual(bad, [], bad.join(' · '));
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* spelling kept: browser script (js/locales/_langs.js, js/i18n.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 i18n: every new string exists in every registered language', () => {
  /* ⚠ (#R223) EVERY REGISTERED LANGUAGE, not the number five — a sixth (zh) landed and this
     assertion was about coverage. `LANGS` is the one list (js/lang-registry.js). */
  const NL = (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z-]+"/g) || []).length;   /* (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
  const src = read('js/i18n.js');
  /* (remove-synthetic-planes) 'planesAreaHint' was the other key here — the airplanes.live sweep's
     partial-coverage notice. It went with the sweep, and scripts/i18n-dead-key-audit.mjs then
     (rightly) refused the rows no code could ask for. */
  for (const key of ['poiLabels']) {
    const n = [...src.matchAll(new RegExp(key + ':"', 'g'))].length;
    assert.equal(n, NL, `${key} is in ${n} languages, not ${NL}`);
  }
});
}

/* ═══════════════════════ #R221 · from r221-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R221 source-level checks (Node only — no browser)
 * ----------------------------------------------------------------------------
 *  Each test pins a defect this round actually hit, so the same mistake fails the build rather than
 *  being rediscovered from a screenshot. Nothing here asserts a value this round happened to
 *  produce (#R203's rule); they assert the RELATIONS that made those values right.
 * ==========================================================================*/
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));
const JS = join(ROOT, 'js');

/* ── ① ADDING A LANGUAGE MUST NOT MEAN EDITING 2,238 CALL SITES ───────────────────────────────
   The whole point of js/lang-registry.js. If a module re-grows its own five-positional helper, a
   sixth language silently returns `undefined` there — which is what the registry exists to stop. */
test('#R221 ① no module declares its own five-positional language helper any more', () => {
  const offenders = [];
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(JS, f), 'utf8');
    /* the shape: (en, jp|j|ja, de, ru, es) => … — in a declaration, not in a comment */
    const re = /=\s*\(\s*(?:en|e)\s*,\s*(?:jp|j|ja)\s*,\s*de\s*,\s*ru\s*,\s*es\s*\)\s*=>/g;
    let m;
    while ((m = re.exec(src))) {
      /* ignore anything inside a block comment */
      const before = src.slice(0, m.index);
      const open = before.lastIndexOf('/*'), close = before.lastIndexOf('*/');
      if (open > close) continue;
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], 'these files still hand-roll a 5-argument language helper: ' + offenders.join(', '));
});

/* spelling kept: browser script (js/lang-registry.js, src/locale-boot.js, src/main.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ① the registry is the ONE list, and the first five keep their argument order', () => {
  const src = read('js/lang-registry.js');
  const codes = [...src.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(codes.slice(0, 5), ['en', 'jp', 'de', 'ru', 'es'],
    'the first five languages ARE the argument order of every L(…) call site — append, never reorder');
  /* every registered language must have a locale file, or the table it builds is empty */
  for (const c of codes) {
    assert.ok(existsSync(join(JS, 'locales', `ui.${c}.js`)), `js/locales/ui.${c}.js is missing`);
  }
  /* ⚠ (#R232) …AND THE LIST NO LONGER RUNS THE OTHER WAY. src/main.js used to import every locale by
     name, which is what this line checked; it now imports NONE of them but English, because
     src/locale-boot.js globs the directory and loads the reader's own language on demand (492 kB off
     the boot bundle). The property that replaced it is the one that matters: adding a locale FILE is
     all it takes, so the directory is checked against the registry, not against an import list. */
  const boot = read('src/locale-boot.js');
  assert.match(boot, /import\.meta\.glob\('\.\.\/js\/locales\/ui\.\*\.js'\)/, 'the locale directory IS the language list');
  assert.doesNotMatch(read('src/main.js'), /locales\/ui\.(?!en\.js)[a-z-]+\.js/,
    'src/main.js imports only the English fallback — every other locale is fetched on demand');
  /* ⚠ (#R232) …AND THE DIRECTORY IS CHECKED AGAINST THE GENERATED LIST, NOT AGAINST THE ROWS. The
     registry names only the five positional languages and the two that carry facts a filename cannot;
     every other language is DISCOVERED from this directory. So what has to hold is that the directory
     and js/locales/_langs.js agree exactly — that IS the 「1発で終わる」 promise, checked. */
  const listed = (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z0-9-]+"/g) || [])
    .map((x) => x.replace(/"/g, '')).sort();
  const onDisk = readdirSync(join(JS, 'locales'))
    .map((f) => /^ui\.([a-z0-9-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  assert.deepEqual(listed, onDisk, 'js/locales/_langs.js is stale — run `node scripts/i18n-langs.mjs`');
});

test('#R221 ① a language table falls back to English PER KEY, not per table', () => {
  /* (tests-by-topic) EVALUATED: the registry and js/i18n.js run, and a table missing a key is read. */
  const { w, ctx, L } = langRegistry();
  L.define('en', { ui: { a: 'A', b: 'B' } });
  L.define('de', { ui: { a: 'Ah' } });
  vm.runInContext(read('js/i18n.js'), ctx, { filename: 'js/i18n.js' });
  const de = w.IntMapI18N.de;
  assert.equal(de.a, 'Ah', 'a key the language has is its own');
  assert.equal(de.b, 'B',
    'js/i18n.js must chain each table onto English so a missing key is English, not undefined');
  /* js/i18n-late.js does Object.assign(i18n.en, …) after the tables were built */
  Object.assign(w.IntMapI18N.en, { late: 'Late' });
  assert.equal(de.late, 'Late',
    'the prototype chain is what makes a late Object.assign on English reach every language');
});

/* ── ⑨ THE SCIENCE PAGE ──────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/page-i18n.js, js/locales/pages.${L}.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑨ equations are typeset, degrade to their source, and exist in every language', () => {
  const pi = read('js/page-i18n.js');
  assert.ok(/kind === 'tex'/.test(pi), "the ['tex', …] block type must exist");
  assert.ok(/data-tex/.test(pi), 'the LaTeX source must survive on the node so it can degrade to it');
  assert.ok(/throwOnError: false/.test(pi), 'one bad formula must not blank the page');
  assert.ok(/katex\/katex\.min\.js/.test(pi), 'the static page cannot import the bundle — it loads the copy');
  const vc = read('vite.config.js');
  assert.ok(/katexAssets\(\)/.test(vc) && /plugins: \[[^\]]*katexAssets\(\)/.test(vc),
    'katex/dist must be copied into the deploy, or the page has no renderer');

  for (const L of ['en', 'ja', 'de', 'ru', 'es']) {
    const src = read(`js/locales/pages.${L}.js`);
    const n = (src.match(/\['tex',/g) || []).length;
    assert.ok(n >= 20, `pages.${L}.js has only ${n} typeset equations`);
    assert.ok(src.includes("id: 'atmosphere'"), `pages.${L}.js has no atmosphere section`);
  }
});

/* spelling kept: browser script (js/locales/pages.${L}.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑨ every LaTeX string in the locale files is balanced', () => {
  for (const L of ['en', 'ja', 'de', 'ru', 'es']) {
    const src = read(`js/locales/pages.${L}.js`);
    for (const m of src.matchAll(/\['tex', '((?:[^'\\]|\\.)*)'\]/g)) {
      const tex = m[1];
      const open = (tex.match(/\\begin\{/g) || []).length, close = (tex.match(/\\end\{/g) || []).length;
      assert.equal(open, close, `unbalanced \\begin/\\end in ${L}: ${tex.slice(0, 60)}`);
      let depth = 0;
      for (let i = 0; i < tex.length; i++) {
        if (tex[i] === '\\') { i++; continue; }
        if (tex[i] === '{') depth++;
        if (tex[i] === '}') depth--;
        assert.ok(depth >= 0, `unbalanced braces in ${L}: ${tex.slice(0, 60)}`);
      }
      assert.equal(depth, 0, `unbalanced braces in ${L}: ${tex.slice(0, 60)}`);
    }
  }
});
}

/* ═══════════════════════ #R335 · from r335-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R335 — the character converter does not convert vocabulary, ONE ROUND LATER
 * ----------------------------------------------------------------------------
 *  #R319 found 紐西蘭 and 玻里尼西亞 shipping to Simplified readers as 纽西兰 / 玻里尼西亚: words
 *  whose characters are ALREADY shared between the two orthographies, so OpenCC `tw→cn` converts
 *  them to themselves and every orthography check in the project reads them as perfectly correct.
 *  「社群」 was the next one — the Taiwanese word for a community, shipped in the airplanes.live
 *  source description and in the Community tab, where the mainland word is 「社區」.
 *
 *  ⚠ THE POINT OF THIS FILE IS NOT THE ONE WORD. A hand-kept vocabulary table has no way to say
 *  what it is MISSING (the same shape as #R251's character map and [[intmap-recurring-lessons]] G),
 *  so this round stopped reading and asked a published table: OpenCC's SECOND Taiwan profile,
 *  twp→cn, converts vocabulary as well as orthography. Run OUTSIDE the pipeline — where #R251
 *  correctly refuses to run it, because inside it double-converts this project's own output — it is
 *  not a converter but an INVENTORY. 96 distinct disagreements over 8,321 Han runs; 49 survived
 *  being read one at a time, and they are the rows tagged (#R335) in scripts/zh-hans.mjs.
 * ==========================================================================*/
{
/* ⚠ (#R283/#R317) READ THROUGH readLF. A check written against the bytes a checkout happened to
   produce says something different on Windows and in CI, and tests/r313 ⑤ was red on one platform
   for its whole life because of it. */
const root = new URL('../', import.meta.url);
const read = (p) => readLF(new URL(p, root));

const TRAD = ['js/locales/ui.zh.js', 'js/locales/pages.zh-hant.js'];
const HANS = ['js/locales/ui.zh-hans.js', 'js/locales/pages.zh-hans.js'];
const cn = OpenCC.Converter({ from: 'tw', to: 'cn' });

/* ⚠ (#R323) THE TABLE IS READ FROM THE AST, NOT WITH A REGEX OVER THE FILE. A pattern that can
   match anywhere in a file answers a different question from the one being asked — #R323 spent a
   round on exactly that. Reading them out of the AST also keeps this test from being the thing that
   keeps the generated files in sync: tests/r224 ④ is what checks that. (Until #R548 there was a
   second reason — scripts/zh-hans.mjs rewrote both generated files as a TOP-LEVEL side effect, so
   importing it here would have regenerated them. #R548 put the rewrite behind IS_MAIN and exported
   `build()`, so the file is importable now; the AST read stays for the first reason.) */
function tableOf(name) {
  const src = read('scripts/zh-hans.mjs');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let node = null;
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : null;
    if (d && d.type === 'VariableDeclaration' && d.declarations[0].id.name === name) node = d.declarations[0].init;
  }
  assert.ok(node && node.type === 'ArrayExpression', name + ' is one exported array literal');
  return node.elements.map((el) => (el.type === 'Literal' ? el.value
    : el.elements.map((x) => { assert.equal(x.type, 'Literal', name + ' holds literals only'); return x.value; })));
}

/* ── ① NO LEFT-HAND SIDE OF THE TABLE SURVIVES INTO THE FILES THE READER GETS ────────────────────
   This is the defect stated in general, and it is the assertion 社群 needed for the months it
   shipped. Every Taiwanese word the table names is spelled the way the character layer WOULD have
   spelled it (紐西蘭 → 纽西兰, 社群 → 社群) and then looked for in the generated output. A row
   deleted, a row that stopped being applied, or a new Traditional string carrying a word the table
   already knows about all land here. */
test('R335 ① no word the vocabulary table names reaches the Simplified reader', () => {
  const WORDS = tableOf('WORDS'), PINNED = tableOf('PINNED');
  assert.ok(WORDS.length >= 170, 'the table has ' + WORDS.length + ' rows');
  const out = HANS.map(read).join('\n');
  const survived = [];
  for (const [a] of WORDS) {
    /* ⚠ the single character 著 is the aspect marker, and the PINNED words (著名/顯著/乾坤…) keep
       it on purpose — a one-character row is a statement about characters, not about vocabulary. */
    if (a.length < 2 || PINNED.some((p) => p.includes(a))) continue;
    const spelled = cn(a);
    const n = out.split(spelled).length - 1;
    if (n) survived.push(a + ' (would ship as ' + spelled + ') x' + n);
  }
  assert.deepEqual(survived, [], 'Taiwanese vocabulary reached the Simplified files');
});

/* ── ② 社群 AT BOTH ENDS ──────────────────────────────────────────────────────────────────────────
   The fix is a DERIVATION, not an edit of the translation: the Taiwan reader keeps 社群, which is
   their word, and only the derived file changes. Both halves of that have to be true, or the next
   round "fixes" it by rewriting ui.zh.js and takes the Traditional reader's word away. */
/* spelling kept: browser script (js/locales/ui.zh-hans.js, js/locales/pages.zh-hans.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R335 ② 社群 stays in Traditional and becomes 社区 in Simplified', () => {
  const trad = TRAD.map(read).join('\n');
  /* ⚠ (#R450) FIVE, NOT SIX — and the missing one was never on screen. `tabCommunity` labelled the
     Information/Community tab retired in #R139; no shipped file has named it since, so its nine rows
     were unreachable and #R450 deleted them (scripts/i18n-dead-key-audit.mjs). A bare count is what
     let a dead row prop this up, so the LIVE witness is named beside it: if the word is ever taken
     away from the Traditional reader, that line fails with the row it is about rather than with an
     arithmetic that could be satisfied by anything. */
  assert.ok(trad.includes('ctxPostHere:"發佈到社群"'), 'the Traditional reader keeps 社群 where it is on screen');
  assert.ok(trad.split('社群').length - 1 >= 5, 'the Traditional sources still say 社群');
  assert.ok(!trad.includes('社區 ADS-B'), 'the Traditional page was not rewritten');
  const ui = read('js/locales/ui.zh-hans.js'), pages = read('js/locales/pages.zh-hans.js');
  assert.ok(!ui.includes('社群') && !pages.includes('社群'), '社群 must not survive into Simplified');
  /* (#R450) the same derivation, asserted on a row that is actually drawn — see the note above */
  assert.ok(ui.includes('ctxPostHere:"发布到社区"'), 'the derivation still reaches the Simplified reader');
  assert.ok(pages.includes('社区 ADS-B'), 'the source description this was found in');
  assert.ok(pages.includes('OpenStreetMap 社区'), 'and the sources page prose');
  /* the pre-existing 社區 («about a neighbourhood») is untouched — it was already the right word */
  assert.ok(ui.includes('"约一个社区"'), 'the neighbourhood string still reads 社区');
});

/* ── ③ ONE SPELLING, TWO PLACES: 喬治亞 ──────────────────────────────────────────────────────────
   The corpus carries both Georgias. The US state is 佐治亞州 to a mainland reader and the country
   is 格魯吉亞, so a single row would have been wrong for one of them whichever way it was written.
   The table states BOTH, and the longest-first sort in toHans() is what makes the state's row win
   inside 「美國喬治亞州」. Checked on the shipped output, which is what a reader actually sees. */
test('R335 ③ the state and the country get different names', () => {
  const ui = read('js/locales/ui.zh-hans.js');
  assert.ok(ui.includes('美国佐治亚州'), 'the US state');
  assert.ok(ui.includes('格鲁吉亚'), 'the country');
  assert.ok(!ui.includes('乔治亚'), 'and the Taiwan spelling is gone from both');
  const lhs = tableOf('WORDS').map(([a]) => a);
  assert.ok(lhs.includes('喬治亞州') && lhs.includes('喬治亞'), 'both rows exist');
  assert.ok('喬治亞州'.length > '喬治亞'.length, 'so the sort in toHans() reaches the state first');
});

/* ── ④ THE TABLE DOES NOT FEED ITSELF ─────────────────────────────────────────────────────────────
   Every row is applied to the same string, so a right-hand side that a LATER row rewrites would
   turn one stated word choice into a second, unstated one — which is the exact failure #R251
   measured when OpenCC's twp profile ran INSIDE the pipeline (檔案 → 文件 → 文档). Stated here as
   a property of the table rather than as a list of the words it happened to be true for. */
test('R335 ④ no row rewrites another row-s answer, and no word is claimed twice', () => {
  const WORDS = tableOf('WORDS');
  const seen = new Map();
  for (const [a, b] of WORDS) {
    assert.ok(!seen.has(a), a + ' is stated twice (-> ' + seen.get(a) + ' and -> ' + b + ')');
    seen.set(a, b);
  }
  const sorted = [...WORDS].sort((x, y) => y[0].length - x[0].length);
  const apply = (t) => { let s = t; for (const [a, b] of sorted) s = s.split(a).join(b); return s; };
  const chained = WORDS.filter(([, b]) => apply(b) !== b).map(([a, b]) => a + '->' + b + ' becomes ' + apply(b));
  assert.deepEqual(chained, [], 'a right-hand side is rewritten by another row');
});

/* ── ⑤ NO TWO ROWS FIGHT OVER THE SAME CHARACTERS ────────────────────────────────────────────────
   Rows of EQUAL length are applied in array order, so two left-hand sides that overlap partially in
   the corpus make the answer depend on where somebody happened to type the row. Exactly one such
   pair exists and it is NOT this round's: 圖資→地圖數據 and 資料→數據 both match inside
   「地圖資料」, and only because 資料 is written first does that come out as 地圖數據 — the other
   order produces 「地地圖數據料」. Measured, and named here so a second one cannot arrive quietly.
   ⚠ Fixing it is not this round's scope; making it visible is. */
test('R335 ⑤ the only pair of rows that overlap in the corpus is the pre-existing one', () => {
  const corpus = TRAD.map(read).join('\n');
  const lhs = tableOf('WORDS').map(([a]) => a).filter((a) => a.length > 1);
  const spans = new Map(lhs.map((w) => {
    const out = []; let i = corpus.indexOf(w);
    while (i >= 0) { out.push([i, i + w.length]); i = corpus.indexOf(w, i + 1); }
    return [w, out];
  }));
  const pairs = new Set();
  for (const a of lhs) for (const b of lhs) {
    if (a === b) continue;
    for (const [s1, e1] of spans.get(a)) for (const [s2, e2] of spans.get(b)) {
      const nested = (s2 >= s1 && e2 <= e1) || (s1 >= s2 && e1 <= e2);
      if (s1 < e2 && s2 < e1 && !nested) pairs.add([a, b].sort().join(' x '));
    }
  }
  assert.deepEqual([...pairs].sort(), ['圖資 x 資料'], 'a new pair of rows can be applied in either order');
});

/* ── ⑥ THE THREE THAT WERE LEFT OUT ON PURPOSE ───────────────────────────────────────────────────
   The same sweep found three more real differences whose left-hand side carries TWO senses in this
   corpus, so a bare word swap would break one of them — the 複製 shape #R322 recorded (Taiwan's
   word for cloning is also the ordinary word for «copy», and 18 of its 19 lines were the Copy
   button). 擷取 is 截取 in 「螢幕擷取」 but 抓取 in 「擷取標題」; 向量 is 矢量 for a vector tile
   and stays 向量 for a vector mean; 數位 has a single bare site whose sense the string does not
   settle. They need a narrower left-hand side, not a row — and this records that their absence is
   a decision rather than an oversight. */
test('R335 ⑥ the three two-sense words are deliberately not rows', () => {
  const lhs = new Set(tableOf('WORDS').map(([a]) => a));
  for (const w of ['擷取', '向量', '數位']) {
    assert.ok(!lhs.has(w), w + ' carries two senses here — it needs a narrower left-hand side');
  }
  /* …and they are still IN the corpus, so this is a live decision and not a stale note */
  const corpus = TRAD.map(read).join('\n');
  for (const w of ['擷取', '向量', '數位']) assert.ok(corpus.includes(w), w + ' left the corpus — revisit');
});
}

/* ═══════════════════════ #R459 · from r459-checks.test.mjs ═══════════════════════ */
/* (#R459 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-audits-checks.test.mjs) */
{
const R = read;
/* ⚠ THE 15th TIME A CHECK READ ITS OWN NOTE. The comment that EXPLAINS the defect spells the
   defect out, so a raw search finds the explanation and calls it the disease. Strip comments
   before asking whether the CODE still holds a string. */

/* ══ ③ BOTH WRITERS OF THE ★, AND THE KEY THAT SURVIVES A LANGUAGE SWITCH ════════════════════ */

/* spelling kept: browser script (js/map-ui.js, js/layer-favs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R459 ③ the ★ tooltip is fixed in BOTH files that write it', () => {
  /* ⚠ fixing one leaves the other: js/map-ui.js draws the tile grid's ★ and js/layer-favs.js the
     classic row's, and they wrote the same English string independently. */
  for (const f of ['js/map-ui.js', 'js/layer-favs.js']) {
    assert.doesNotMatch(code(R(f)), /\.title\s*=\s*'Favorite'/, f + ' still writes the English literal');
    assert.match(R(f), /ttlFavorite/, f + ' must name the key');
  }
  assert.doesNotMatch(code(R('js/map-ui.js')), /\.title\s*=\s*'Layers'/);
  assert.match(R('js/map-ui.js'), /ttlLayersPanel/);
});

/* spelling kept: browser script (js/map-ui.js, js/layer-favs.js, js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R459 ③ an attribute that outlives a language change carries the KEY as well as the text', () => {
  /* the edge toggle and the ★s are built once and are still on screen after a switch, so the text
     alone would freeze in whatever language they were built in. js/app-body.js's updateI18n()
     re-applies [data-i18n-title]; these three elements are the reason it has to. */
  assert.match(R('js/map-ui.js'), /setAttribute\('data-i18n-title',\s*k\)/, 'map-ui sets the key');
  assert.match(R('js/layer-favs.js'), /setAttribute\('data-i18n-title',\s*'ttlFavorite'\)/);
  assert.match(R('js/app-body.js'), /\[data-i18n-title\]/, 'and the applier still exists');
});

/* spelling kept: browser script (js/locales/) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R459 ③ both keys exist in all nine languages, and none of them is still the English word', () => {
  const files = readdirSync(path.join(ROOT, 'js', 'locales')).filter((n) => /^ui\..*\.js$/.test(n));
  assert.equal(files.length, 9, 'nine ui tables: ' + files.join(' '));
  for (const f of files) {
    const src = R('js/locales/' + f);
    for (const k of ['ttlLayersPanel', 'ttlFavorite']) {
      assert.match(src, new RegExp(k + '\\s*:'), `${f} is missing ${k}`);
    }
    if (/ui\.en\.js$/.test(f)) continue;
    /* every non-English table must differ from English on both keys — a copied English row is the
       gap this whole family of instruments exists to find, not a translation. */
    const layers = (src.match(/ttlLayersPanel\s*:\s*(["'])(.*?)\1/) || [])[2];
    const fav = (src.match(/ttlFavorite\s*:\s*(["'])(.*?)\1/) || [])[2];
    assert.notEqual(layers, 'Layers', `${f}: ttlLayersPanel is still the English word`);
    assert.notEqual(fav, 'Favorite', `${f}: ttlFavorite is still the English word`);
  }
});
}
