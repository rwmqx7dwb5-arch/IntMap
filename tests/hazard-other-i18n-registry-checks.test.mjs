/* ============================================================================
 *  LANGUAGES — the registry, the locale files and the reading pages
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. These are claims about FILES (which locale files
 *    exist, what a generator emits, what the build copies) or about js/lang-registry.js's shape; the
 *    audits are run where they have a CLI.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r211-checks.test.mjs (tests #10, #12 of 12) ═══
   R211 source-level regression checks.

   Everything here is written as a RELATION, never as a value (#R203's trap, hit five more times in
   #R210): "the gate does not grow with the ladder", "there is one palette and both halves use it",
   "the width is a square root of a ratio". A literal pinned here is a literal the next instruction
   breaks.

   (layer-manifest) which layers exist, and their facts */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 8 · the transparency page ────────────────────────────────────────────────────────────────── */
/* ⚠ (#R301) #R218 TURNED THIS PAGE INTO A SHELL and #R221 split the UI table into one file per
   language, so the two things #R211 asserted — anchors written as `id="water"` in the markup, and
   the Settings label counted as «2 in i18n-late + 3 in i18n.js» — are both spellings of a structure
   that no longer exists. The requirement has not changed: the page has to exist, ship, cover every
   model, state each model's limits, and be reachable in every language the app has. Written against
   the language REGISTRY instead of a count of five, adding a tenth language cannot make it stale. */
test('R211 science page: it exists, it ships, and Settings links to it in every language', () => {
  assert.ok(existsSync(join(ROOT, 'science.html')), 'the page exists');
  const shell = read('science.html');
  assert.match(shell, /IntMapPageI18N\.mount\(\{ page: 'science'/, 'and it mounts the science page (#R218)');
  /* it must document METHOD, and it must be the one place that says what each model does NOT answer */
  const en = read('js/locales/pages.en.js');
  for (const anchor of ['water', 'seismic', 'tsunami', 'tides', 'trade', 'energy', 'crops', 'alerts']) {
    assert.match(en, new RegExp(`id:\\s*'${anchor}'`), `the page covers ${anchor}`);
  }
  assert.match(en, /steady-state routing model/, 'and states the limits of each model');
  /* it is copied by the build (it is markup, not a bundle entry) */
  assert.match(read('vite.config.js'), /'science\.html',/, 'the build copies it');
  /* the app links to it, and the label exists in every language the app ships — DERIVED from the
     locale files, so a new language is caught here the same way it is caught by check:i18n */
  assert.match(read('index.html'), /id="link-science"[^>]*href="\.\/science\.html"/, 'Settings links to it');
  const uiFiles = readdirSync(new URL('../js/locales/', import.meta.url)).filter((f) => /^ui\.[a-z-]+\.js$/.test(f));
  const pgFiles = readdirSync(new URL('../js/locales/', import.meta.url)).filter((f) => /^pages\.[a-z-]+\.js$/.test(f));
  assert.ok(uiFiles.length >= 9, `the app ships at least nine languages (got ${uiFiles.length})`);
  assert.deepEqual(uiFiles.filter((f) => !/viewScience/.test(read('js/locales/' + f))), [],
    'the Settings label exists in every language');
  assert.equal(pgFiles.length, uiFiles.length, 'and the page itself is written in every one of them');
  assert.deepEqual(pgFiles.filter((f) => !/id:\s*'water'/.test(read('js/locales/' + f))), [],
    '…including the sections, not only the chrome');
});

/* ── 10 · the British→US sweep did not touch a contract ───────────────────────────────────────── */
test('R211 spelling: the sweep left every data contract and every other language alone', () => {
  /* the four landmines, by name (#R210 §10 found three of them; the fourth is the tile schema) */
  assert.match(read('js/atlas-console.js'), /'grey':'#8e8e93'/, "the colour table keeps 'grey' as an accepted input");
  assert.match(read('js/atlas-console.js'), /'defence':'milb'/, "…and 'defence' as an accepted query");
  assert.match(read('js/routing.js'), /'cancelled'/, 'the routing status token is untouched');
  assert.match(read('js/place-labels.js'), /'sports_centre'/, 'the OpenMapTiles class value is untouched');
  assert.match(read('js/place-framing.js'), /'neighbourhood'/, 'the Nominatim place type is untouched');
  assert.match(read('js/newsgeo.js'), /Organisation for the Prohibition/, 'a proper name is not a spelling');
  assert.match(read('js/space.js'), /Modellma/, 'German is not British English');
  /* and the user-visible side really did move */
  for (const [file, rx] of [['js/compare.js', /Minimize/], ['js/satellite-detail.js', /Center the map on it/],
                            ['js/viewshed.js', /Gray = terrain/], ['js/satellites-live.js', /catalog shipped with the app/]]) {
    assert.match(read(file), rx, `${file} reads in US English`);
  }
});
}

/* ═══ from tests/r218-checks.test.mjs (tests #11, #12, #13, #14 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));

/* ── ⑤ the reading pages: one file per language, and every language complete ─────────────── */
test('#R218 ⑤ each language is exactly one file, and js/page-i18n.js lists them all', () => {
  const rt = read('js/page-i18n.js');
  const codes = [...rt.matchAll(/\{ code: '([a-z]{2})'/g)].map((m) => m[1]);
  assert.deepEqual(codes, ['en', 'ja', 'de', 'ru', 'es'], 'the LANGS table is not the five languages');
  /* ⚠ (#R239) THE FIVE ARE A FLOOR, NOT THE SET. js/page-i18n.js keeps those five as its literal
     fallback (the real list comes from IntMapLang.list()), and the directory now also holds
     pages.fr.js, pages.ko.js, pages.zh-hant.js and pages.zh-hans.js — the two that DID NOT EXIST
     are exactly what scripts/i18n-pages-audit.mjs was written to find. So the claim becomes: every
     language the app registers has its document, and every document belongs to a registered
     language. tests/r219-checks ⑥ holds the same invariant against the registry. */
  const files = readdirSync(join(ROOT, 'js', 'locales'))
    .filter((f) => /^pages\.[a-z]{2}(-[a-z]+)?\.js$/.test(f)).sort();
  for (const c of codes) assert.ok(files.includes('pages.' + c + '.js'), c + ' has no document');
  assert.ok(files.length >= 9, 'every registered language has one, on disk: ' + files.join(','));
  /* adding a language must not mean editing the build list: the DIRECTORY is what ships */
  assert.match(read('vite.config.js'), /'js\/locales',/, 'js/locales is not copied to dist as a directory');
});
test('#R218 ⑤ …the two pages carry no prose of their own any more', () => {
  for (const p of ['sources.html', 'science.html']) {
    const h = read(p);
    assert.equal(/data-l="(ja|en)"/.test(h), false, `${p} still carries the two-language span pairs`);
    assert.equal(/<style/.test(h), false, `${p} still has a stylesheet of its own`);
    assert.match(h, /css\/pages\.css/, `${p} does not use the shared stylesheet`);
    assert.match(h, /js\/page-i18n\.js/, `${p} does not load the language machine`);
  }
  /* the registry is still generated from ONE list, not transcribed (#R212's invariant) */
  const sl = read('js/sources-list.js');
  /* (module-graph) the list is reached through the registry's own export, not off `window` */
  assert.match(sl, /^import \{ IntMapRefData \} from '\.\/reference-data\.js';/m);
  assert.match(sl, /IntMapRefData && IntMapRefData\.dataSources/);
  assert.equal(/dataSources\s*=\s*\[/.test(sl), false, 'the page carries its own copy of the list');
});
/* ⚠ (#R246) FIVE LANGUAGES BECAME NINE, AND THE ENGLISH MOVED. The registry used to carry
   `use:{en,jp}` and the other three lived in pages.<lg>.js — which meant the ENGLISH text was
   outside the document scripts/i18n-pages-audit.mjs measures against, so the de/ru/es translations
   were uncounted and the total ABSENCE of fr/ko/zh/zh-Hans read as 287/287, 100 %. Every language's
   description is now `sourceUse` in its own lazily-loaded pages file, English included, and the
   registry carries only the name and the URL (~50 kB out of the eager bundle). */
test('#R218 ⑤ …and every registry entry has a description in all nine languages', async () => {
  /* (module-graph) the registry is IMPORTED (it is an ES module that exports IntMapRefData); the nine
     pages.<lg>.js documents are still classic scripts that publish on `window`, so they run in a vm */
  const ctx = { console };
  ctx.window = ctx; vm.createContext(ctx);
  const CODES = ['en', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh-hant', 'zh-hans'];
  const { IntMapRefData } = await importModule('js/reference-data.js');
  for (const c of CODES) vm.runInContext(read(`js/locales/pages.${c}.js`), ctx, { filename: c });
  const list = IntMapRefData.dataSources;
  assert.ok(list.length > 80, 'the registry shrank');
  for (const s of list) {
    assert.equal(s.use, undefined, `${s.n} still carries prose in the eager registry`);
    for (const c of CODES) {
      const doc = ctx.window.IntMapPageI18N._d[c];
      assert.ok(doc.sourceUse && doc.sourceUse[s.n], `${s.n} has no ${c} description`);
    }
  }
  /* …and nothing translated that is no longer in the registry */
  const names = new Set(list.map((s) => s.n));
  for (const c of CODES)
    for (const k of Object.keys(ctx.window.IntMapPageI18N._d[c].sourceUse))
      assert.ok(names.has(k), `${c} describes "${k}", which is not in the registry`);
});
test('#R218 ⑤ …and the app fetches those descriptions only when it needs them', () => {
  const s = code('js/app-body.js');
  /* (#R246) the fetch moved to js/reference-data.js `ensureDocs`, so the in-app dialog and
     sources.html share ONE implementation; app-body just asks for it when the dialog opens. */
  assert.match(s, /IntMapRefData\.ensureDocs\(currentLang,paint\)/,
    'the Sources dialog does not lazily load the translated descriptions');
  assert.match(code('js/reference-data.js'), /sc\.src='\.\/js\/locales\/pages\.'\+c\+'\.js'/,
    'and the loader is the registry\'s');
  assert.equal(/import .*locales\/pages/.test(read('src/main.js')), false,
    'a locale file is in the eager bundle — the five-language registry must cost a phone nothing at start-up');
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #13, #14 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ⑩ the sixth language ─────────────────────────────────────────────────────────────────────── */
test('R223 ⑩ Traditional Chinese is registered, complete, and appended at the end', () => {
  const reg = read('js/lang-registry.js');
  const rows = [...reg.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  /* ⚠ (#R224) A PREFIX, NOT AN EXACT LIST. #R221's own lesson — 「『5言語ちょうど』を数えるテストは
     6言語目で必ず落ちる」 — and #R223 wrote the same shape one language later, so the seventh
     (zh-hans) failed it. What is load-bearing is that the FIRST FIVE never move (they are the
     argument order of 2,238 L(…) call sites) and that new languages are APPENDED; the count is not. */
  assert.deepEqual(rows.slice(0, 6), ['en', 'jp', 'de', 'ru', 'es', 'zh'],
    'order is load-bearing — never reordered, only appended to');
  /* ⚠ (#R239) the explicit «(beta)» is gone. #R232 made the mark MEASURED (scripts/i18n-langs.mjs)
     and kept a typed one here only because 「their reading pages are still partial even though the
     app is at 100%」 — pages.zh-hant.js is 287/287 now, so that sentence is no longer true and the
     mark would be telling a reader something false. The label itself is still asserted. */
  assert.match(reg, /label: '繁體中文'/);
  assert.doesNotMatch(reg, /繁體中文 \(beta\)/, 'a mark that is no longer true is not kept');
  assert.match(reg, /html: 'zh-Hant'/);
  assert.match(reg, /alias: \['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'\]/, 'the script tags, not a bare zh');
  /* (#R232) src/main.js no longer names any locale but English — src/locale-boot.js globs the
     directory and loads the reader's own on demand. The list to check against is the generated one. */
  assert.match(read('js/locales/_langs.js'), /"zh"/, 'zh is in the generated language list');
  /* the file itself: both tables, and no call site was touched to get them */
  const zh = read('js/locales/ui.zh.js');
  const ast = parse(zh, { ecmaVersion: 2022, sourceType: 'module' });   /* (module-graph) the locale imports the registry */
  let ui = 0, inl = 0;
  walk.simple(ast, { Property(n) {
    const k = n.key && (n.key.name || n.key.value);
    if (k === 'ui' && n.value.type === 'ObjectExpression') ui = n.value.properties.length;
    if (k === 'inline' && n.value.type === 'ObjectExpression') inl = n.value.properties.length;
  } });
  /* ⚠ (#R450) DERIVED, NOT 450. The floor was written when this table held 493 rows, 73 of which
     were keys no shipped file could ask for (#R450 removed them and this assertion is what caught
     it) — so the number was measuring dead weight, and any replacement constant would start
     rotting the same day. The property is what it always said: zh carries the late-registered keys
     too, i.e. AT LEAST what English declares. That cannot go stale, and it still fails the moment
     a language stops keeping up. */
  const enUi = (() => {
    let n = 0;
    walk.simple(parse(read('js/locales/ui.en.js'), { ecmaVersion: 2022, sourceType: 'module' }), { Property(p) {
      const k = p.key && (p.key.name || p.key.value);
      if (k === 'ui' && p.value.type === 'ObjectExpression') n = p.value.properties.length;
    } });
    return n;
  })();
  assert.ok(enUi > 300, 'the English keyed table was read (got ' + enUi + ')');
  /* ⚠ (share-embed-distribution) …and «at least what English declares» stopped being the rule on 2026-09-11:
     CONSTITUTION.md §7 narrowed what IntMap WRITES NEXT to en + jp, so English now grows past the seven carried
     languages by design (the share panel's Embed tab added 16 en/jp keys). What must still hold is the half that
     protects the reader — zh keeps every keyed row it HAS — and that number is the one the i18n gate already holds,
     tests/i18n-coverage-floor.json, read here rather than restated. */
  const floor = JSON.parse(read('tests/i18n-coverage-floor.json')).langs.zh.keyed;
  assert.ok(floor > 300 && ui >= floor, 'the keyed table keeps every row it carries (got ' + ui + ' vs the floor ' + floor + '; en has ' + enUi + ')');
  assert.ok(inl >= 1800, 'every inline L(…) string has an entry (got ' + inl + ')');
  /* …and it is really Chinese, not a copy of the template */
  const cjk = (zh.match(/[一-鿿]/g) || []).length;
  assert.ok(cjk > 15000, 'the values are translated (got ' + cjk + ' CJK characters)');
  /* the translation is REBUILDABLE: it lives in scripts/zh/*.json, not only in the generated file */
  assert.ok(existsSync(join(ROOT, 'scripts/build-ui-zh.mjs')));
  assert.ok(existsSync(join(ROOT, 'scripts/zh/00-ui.json')));
});
test('R223 ⑩ the coverage scanner reads every file, not the ones whose spelling it guessed', () => {
  /* ⚠ (#R251) THE GUARANTEE MOVED FILES; IT IS THE SAME GUARANTEE. Parsing every file in js/ — no
     substring pre-filter, because js/ocean-currents.js spells its helper `const { …, L } = W;` and
     matched none of the obvious spellings — is now made ONCE in scripts/i18n-helpers.mjs, which the
     report, the positional audit and the pair audit all read. Asserting on the old address would
     fail while the guarantee holds, so both halves are asserted: the promise where it now lives,
     and that the report actually goes through it rather than keeping a private copy. */
  const s = read('scripts/i18n-report.mjs');
  const h = read('scripts/i18n-helpers.mjs');
  assert.ok(!/indexOf\('IntMapLang\.pick'\) < 0 && src\.indexOf/.test(s + h),
    'the substring pre-filter hid js/ocean-currents.js entirely');
  assert.match(h, /NO SUBSTRING PRE-FILTER/);
  assert.match(s, /from '\.\/i18n-helpers\.mjs'/);
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #1, #2, #3, #4 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */
const R = (p) => join(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), p);

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => codeOnly(String(s));
const noHtml = (s) => codeOnly(String(s), { lang: 'html' });

/* ── ① adding a language is ONE FILE ─────────────────────────────────────────────────────────── */
test('R232 i18n: the locale directory IS the language list, and the generated copy follows it', () => {
  const boot = read('src/locale-boot.js');
  assert.match(boot, /import\.meta\.glob\('\.\.\/js\/locales\/ui\.\*\.js'\)/,
    'the language set is the set of files in js/locales/');
  assert.doesNotMatch(noJs(boot), /\{\s*eager:\s*true\s*\}/,
    'the glob must stay lazy — eager would ship all seven locales again');

  /* the generated list and the directory agree */
  const listed = (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z0-9-]+"/g) || [])
    .map((x) => x.replace(/"/g, '')).sort();
  const onDisk = readdirSync(new URL('js/locales/', ROOT))
    .map((f) => /^ui\.([a-z0-9-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  assert.deepEqual(listed, onDisk, 'run `node scripts/i18n-langs.mjs` — the generated list is stale');

  /* …and regenerating it changes nothing, which is what `prebuild` guarantees on every build */
  execFileSync(process.execPath, [R('scripts/i18n-langs.mjs'), '--check'], { stdio: 'pipe' });

  /* the registry derives a row it was not given */
  const reg = read('js/lang-registry.js');
  assert.match(reg, /function derive\(code\)/, 'a code alone is enough to build a row');
  assert.match(reg, /Intl\.DisplayNames/, "the label is the language's own name");
  assert.match(reg, /function declare\(codes, load\)/, 'discovery appends; it never reorders');

  /* the first five never move — they ARE the argument order of every L(…) call site */
  const rows = [...reg.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(rows.slice(0, 5), ['en', 'jp', 'de', 'ru', 'es']);

  /* the two reading pages get the same list, because they have no bundler */
  for (const p of ['sources.html', 'science.html']) {
    /* (module-graph) the static pages load their scripts as modules now */
    assert.match(read(p), /<script type="module" src="\.\/js\/locales\/_langs\.js"><\/script>/,
      `${p} loads the generated language list`);
  }
  const { STATIC_ASSETS } = JSON.parse(JSON.stringify({ STATIC_ASSETS: [] }));   /* shape only */
  void STATIC_ASSETS;
  assert.ok(read('vite.config.js').includes("'js/locales'"), 'js/locales ships whole');
});

test('R232 i18n: French and Korean exist, and cost nothing but their own files', () => {
  for (const c of ['fr', 'ko']) {
    assert.ok(existsSync(new URL(`js/locales/ui.${c}.js`, ROOT)), `js/locales/ui.${c}.js`);
    const src = read(`js/locales/ui.${c}.js`);
    /* (module-graph) it registers itself on the registry it IMPORTS, not on one found on `window` */
    assert.match(src, /^import \{ IntMapLang \} from '\.\.\/lang-registry\.js';/m, 'it imports the registry');
    assert.match(src, new RegExp(`^IntMapLang\\.define\\('${c}',`, 'm'), 'it registers itself');
    assert.match(src, /inline:\s*\{/, 'both tables are present');
  }
  /* ⚠ THE POINT OF THE ROUND: neither language is named anywhere else. */
  const reg = read('js/lang-registry.js');
  for (const c of ['fr', 'ko']) {
    assert.doesNotMatch(noJs(reg), new RegExp(`code:\\s*'${c}'`), `${c} needs no registry row`);
    assert.doesNotMatch(noJs(read('src/main.js')), new RegExp(`locales/ui\\.${c}\\.js`), `${c} needs no import line`);
  }
  /* …and the launch screen, which cannot import anything, still has a word for every language */
  const boot = read('index.html');
  const table = boot.slice(boot.indexOf('var L={en:'), boot.indexOf('var L={en:') + 400);
  for (const c of (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"([a-z0-9-]+)"/g) || [])) {
    const code = c.replace(/"/g, '');
    assert.ok(new RegExp(`(^|[{,])\\s*'?${code.replace('-', '\\-')}'?\\s*:`).test(table),
      `the launch screen has a word for '${code}'`);
  }
});

test('R232 i18n: (beta) is MEASURED, and DE/RU/ES no longer wear it', () => {
  const gen = read('js/locales/_langs.js');
  assert.match(gen, /window\.IntMapLangBeta\s*=/, 'the beta list is generated, not typed');
  const beta = JSON.parse(gen.slice(gen.indexOf('IntMapLangBeta')).match(/\[[^\]]*\]/)[0]);
  for (const c of ['en', 'jp', 'de', 'ru', 'es']) assert.ok(!beta.includes(c), `${c} is positional — never beta`);
  /* ⚠ (#R239) fr and ko were 25 % when this line was written and are 100 % on every surface now, so
     the measured list is empty — which is the POINT of measuring it rather than typing it. What is
     load-bearing is that the mark follows the measurement in both directions, and that is what is
     asserted: a language below the threshold must wear it, one at or above it must not. */
  const rep = JSON.parse(execFileSync(process.execPath,
    [new URL('scripts/i18n-report.mjs', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--json'], { encoding: 'utf8', maxBuffer: 64e6 }));
  for (const r of rep.rows) {
    if (r.positional) continue;
    const done = r.inline >= 0.98 * rep.inlineWant;
    assert.equal(!beta.includes(r.code), done, `${r.code}: the (beta) mark must follow the measurement`);
  }
  /* the ES pill's tooltip was the last (beta) mark on the five */
  assert.doesNotMatch(noHtml(read('index.html')), /Español \(beta\)/, 'Spanish is complete');
});

/* ── ② the locales are lazy, and the app waits for the reader's own ──────────────────────────── */
test('R232 startup: only English is eager, and the boot barrier waits for the rest', () => {
  const main = noJs(read('src/main.js'));
  assert.match(main, /import '\.\.\/js\/locales\/ui\.en\.js';/, 'the fallback prototype stays eager');
  assert.doesNotMatch(main, /locales\/ui\.(?!en\.js)[a-z0-9-]+\.js/, 'nothing else is imported by name');
  const body = read('js/app-body.js');
  assert.match(body, /window\.IntMapLocalePending/, 'the boot barrier knows about the locale');
  assert.match(body, /_l\.then\(_afterLocale,_afterLocale\)/,
    'then(go,go) — a locale that fails still gives the reader the app');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #10, #11 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234/#R235 — EIGHT rounds of a check hitting its own explanation).
   Strip the comments and match the SYNTAX. */

/* ── 4b · the DE/RU/ES gaps the positional audit could not see ───────────────────────────────── */
test('R236 i18n: t(…) call sites do not leave a language slot empty', () => {
  /* ⚠ THIS IS THE SHAPE THAT HID THE GAPS, so the check is for the shape, not for the strings.
     `HOST.lang==='de' ? '…' : t(HOST.lang, en, jp, undefined, ru)` put German in FRONT of the call
     and left the German slot undefined — and, because the argument list then ended, Spanish was
     absent entirely and fell through to English. scripts/i18n-positional-audit.mjs reads `L(…)`
     sites, so it reported 100 % throughout. */
  const s = code(read('js/countries-ui.js'));
  assert.doesNotMatch(s, /IntMapLang\.t\([^)]*,\s*undefined\s*,/,
    'no t(…) site passes undefined for a language slot');
  /* (module-graph) both spellings — the registry is an imported binding now, and a check anchored on
     `window.` alone would pass vacuously */
  assert.doesNotMatch(s, /HOST\.lang==='de'\?'[^']*':(?:window\.)?IntMapLang\.t\(/,
    'no language is hoisted in front of the call it belongs inside');
  for (const es of ['Solo este país', 'Series temporales', 'Informe de IA', 'Comparar'])
    assert.ok(s.includes(es), 'the country panel button has Spanish: ' + es);

  /* the news "(orig: …)" note handled jp and ru only — German and Spanish read English */
  const ab = code(read('js/app-body.js'));
  assert.doesNotMatch(ab, /currentLang==='jp'\?\('（原文: '\+lang\+'）'\):currentLang==='ru'\?/,
    'the original-language note no longer skips German and Spanish');
  assert.match(ab, /'\(Original: '\+lang\+'\)'/, 'German is supplied');
});

test('R236 i18n: the Köppen criteria are given in all five languages', () => {
  const s = code(read('js/data-layers.js'));
  /* it used to be a two-column {en, jp} table picked with a ternary — neither instrument saw it */
  assert.doesNotMatch(s, /HOST\.lang==='jp'\?info\.jp:info\.en/, 'the two-language pick is gone');
  assert.match(s, /function koppenCriteria\(code\)\{[\s\S]*?const T5=\(a\)=>IntMapLang\.t\(/,
    'the criteria go through the registry');
  /* all nineteen rows carry five columns.
     ⚠ (#R248) UPDATED FOR THE CONTAINER, NOT FOR THE COUNT. These rows were array LITERALS; the
     twelfth shape's codemod rewrote each one as `LA(…)` — byte-identical data (pickArgs returns its
     arguments) that is also an ordinary call site, which is what lets the inline table reach
     fr/ko/zh/zh-Hans. The thing this test is about — nineteen rows, five languages each — is
     unchanged and still asserted; only the brackets moved. */
  const body = s.slice(s.indexOf('function koppenCriteria'), s.indexOf('function showKoppenInfo'));
  const rows = [...body.matchAll(/LA\(('(?:[^'\\]|\\.)*'\s*,\s*){4}'(?:[^'\\]|\\.)*'\)/g)];
  assert.equal(rows.length, 19, 'five main classes and fourteen sub-codes, five languages each');
  assert.doesNotMatch(body, /\[('(?:[^'\\]|\\.)*'\s*,\s*){4}'(?:[^'\\]|\\.)*'\]/,
    'and none of them is a bare array any more, or no instrument would see it');
});
}

/* ═══ from tests/r237-checks.test.mjs (tests #7, #8 of 8) ═══
    R237 — the air over the disc, the front's resolution, the panel's shape, and the shape of
    string the positional audit cannot see.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap #R235 hit eight
   times and #R236 hit once more. */

/* ── 6 · the shape the positional audit cannot see ──────────────────────────────────────────────
   #R236 found three strings that were English in de/ru/es while the audit reported 100 %. It reads
   `L(…)` call sites; `jp ? '…' : '…'` is not one, so it is invisible to it. */
test('R237 i18n: no two-branch language ternary carries prose', async () => {
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'locales') walk(p); }
      else if (n.endsWith('.js')) files.push(p);
    }
  })(join(ROOT, 'js'));
  const CJK = /[぀-ヿ一-鿿]/;
  const PAT = /(?:HOST\.lang\s*===\s*'jp'|(?<![A-Za-z0-9_$])jp)\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  const bad = [];
  for (const f of files) {
    const src = readLF(f);
    let m; PAT.lastIndex = 0;
    while ((m = PAT.exec(src))) {
      const [a, b] = [m[1], m[2]];
      if (a === b) continue;
      const ls = src.lastIndexOf('\n', m.index) + 1;
      if (/^\s*(\*|\/\/|\/\*)/.test(src.slice(ls, src.indexOf('\n', m.index)))) continue;
      if (!CJK.test(a)) continue;                       /* a locale code, not a sentence */
      bad.push(f.slice(ROOT.length).replace(/\\/g, '/') + ': ' + a + ' / ' + b);
    }
  }
  assert.deepEqual(bad, [], 'these strings are English in every language but Japanese');
});

/* the instrument that counts them, so the next round reads a number instead of finding them again */
test('R237 i18n: the two-branch audit exists and is honest about being a heuristic', () => {
  const s = read('scripts/i18n-two-branch-audit.mjs');
  assert.match(s, /isProse/, 'it separates text from codes');
  assert.match(s, /NOT A GATE/, '…and says so rather than pretending to be one');
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #8 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */

test('R240 ⑤ a country is named in the reader’s language, from CLDR rather than a table', () => {
  const cu = code(R('js/countries-ui.js'));
  assert.match(cu, /window\._imCldrRegion=function\(a2,lang\)/, 'the mechanism exists');
  assert.match(cu, /new Intl\.DisplayNames\(\[tag\],\{type:'region',fallback:'none'\}\)/, 'and it is CLDR');
  assert.match(cu, /a2:a2\|\|'',/, 'the alpha-2 it needs is kept on the record');
  const ab = code(R('js/app-body.js'));
  assert.match(ab, /window\._imCldrRegion\(s\.a2,currentLang\)/, 'cName asks it');
  assert.match(ab, /currentLang==='jp'&&s&&s\.nameJp/, "…and Japanese keeps the app's own editorial name");
  /* ⚠ the COUNTRY mechanism may not live in the shell — tests/r168 #8 budgets it and the ceiling
     only falls — so app-body asks `window._imCldrRegion` rather than building a DisplayNames.
     ⚠ (#R246) The one DisplayNames the shell does hold is for LANGUAGE names, and it REPLACED a
     table (eleven `{en:'English',jp:'英語'}` objects), so the shell got smaller, not bigger. It is
     named here so that a THIRD one cannot arrive without somebody deciding to edit this line. */
  assert.equal((ab.match(/Intl\.DisplayNames/g) || []).length, 1, 'the shell holds one CLDR lookup');
  assert.match(ab, /_nlDN\[tag\]=new Intl\.DisplayNames\(\[tag\],\{type:'language'\}\)/,
    '…and it is the news-language names, which used to be a table');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #14 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */

/* ── ⑥ the place-label language is a table, and it covers every language ──────────────────────── */
test('R242 ⑥ every language the registry knows has an OSM name key', () => {
  const pl = code(read('js/place-labels.js'));
  const m = /const OSM_LANG=\{([\s\S]*?)\};/.exec(pl);
  assert.ok(m, 'OSM_LANG must exist — the else-if chain of five is what left fr/ko/zh in English');
  const have = new Set([...m[1].matchAll(/(?:^|[,{\s])'?([a-z-]+)'?\s*:/g)].map((x) => x[1]));
  const codes = readdirSync(join(ROOT, 'js', 'locales'))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => f.slice(3, -3));
  for (const c of codes) assert.ok(have.has(c), 'js/place-labels.js OSM_LANG has no row for «' + c + '»');
  assert.ok(!/HOST\.lang==='de'/.test(pl), 'the per-language else-if chain must be gone, not extended');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #8 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */

/* ⚠ AND THE THREE PLACES IT WAS ARE FIXED AT THE ROOT, not translated in place: two of them were not
   UI text at all but DATA that has a per-language answer, and a table would have had to be extended
   by hand for every language ever added. */
test('r247 ⑤ the calendar and the Wikipedia widgets answer from the registry, not from a table', () => {
  /* ⚠ (#R292) BOTH ANSWERS MOVED FILE AND NEITHER CHANGED ITS NATURE. The calendar grid is
     js/widget-render.js now and the Wikipedia edition js/widget-defs-data.js; both still derive
     from the registry rather than from a table that a new language would have to be typed into. */
  const r = code(read('js/widget-render.js'));
  assert.match(r, /WC\.date\(dow, \{ weekday: 'narrow'/, 'the weekday initials come from CLDR');
  const w = code(read('js/widget-defs-data.js'));
  assert.match(w, /function wikiLangs\(\)/, 'and the Wikipedia edition is derived from the reader\'s own tag');
  assert.match(w, /IntMapLang\.htmlTag\(WC\.lang\(\)\)/, '…from the registry, so a new language needs no edit here');
  assert.doesNotMatch(w, /\['ja','en'\]/, 'the two-language list is gone');
});
}
