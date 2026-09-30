/* ============================================================================================
 *  R717 · what the historical map CLAIMS, measured against what it ships
 *  (Moved from tests/r717-hist-fidelity-checks.test.mjs — what the historical bundles claim, by topic)
 * --------------------------------------------------------------------------------------------
 *  Three defects, one shape: a statement about the shipped bytes that nothing was reading.
 *
 *  ① THE PROSE RULE'S UNIVERSE WAS 「tracked *.md」, so a count written in js/ or scripts/ was
 *     outside every gate. #R716 found one instance of that (scripts/asset-report.mjs saying the era
 *     record holds one sheet fewer than it does) and answered it with a needle for that one file and
 *     that one number — which left the identical sentence standing in js/time-borders.js,
 *     js/hist-scale.js, scripts/build-hist-borders.mjs, scripts/histeras/census.mjs and, worst, in
 *     js/locales/pages.*.js: the SOURCES PAGE A READER OPENS, in all nine languages.
 *     What is checked here is the UNIVERSE, not the six sentences: a claim planted in js/ must fail
 *     the gate. A rule that has stopped looking at js/ passes every other assertion in this file.
 *  ② data/hist-cities.json shipped a column for all nine languages on every span, filling the ones
 *     no source had written by copying the English spelling — 67,622 assertions with no author,
 *     each one standing beside an attestation bit that said the opposite. The build no longer writes
 *     them, and what makes that safe is a runtime contract nothing asserted: js/hist-cities.js
 *     resolves `n[lang] || n.en`. If that fallback ever goes, eight readers in nine get an empty
 *     label and check:histcities stays green, because the RECORD would still match the builder.
 *  ③ data/cshapes.js is the one historical bundle whose licence makes attribution a CONDITION of
 *     redistribution, and its own `src` named no licence at all while every CC0/GPL neighbour named
 *     theirs. The rule belongs to the FACT — every bundle that states a `src` states its terms in it
 *     — so it is asked of all of them, discovered from data/, rather than of cshapes by name.
 * ========================================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scratchTree } from './helpers/scratch-tree.mjs';
import vm from 'node:vm';
import { asClassicScript } from './app-source.mjs';
import { readSpec } from '../scripts/architecture-spec.mjs';

const ROOT = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const path = (p) => fileURLToPath(new URL(p, ROOT));

/* ══ ① the prose rule reaches the source, and says so by failing ═══════════════════════════════
   ⚠ ONE RUN, TWO PROBES. Evaluating 41 MB of bundles and sweeping 571 carriers costs ~6 s, and the
   suite has a ceiling that only goes down (#R197). The two questions — «does the universe reach
   js/» and «is a number spelled as a word still a number» — are independent claims about the same
   invocation, so they are planted together and read off one exit. */
test('#R717 ① a stale sheet count planted in js/ fails the gate, in digits and in words', () => {
  /* ⚠⚠⚠ THE PROBES ARE PLANTED IN A PRIVATE COPY OF THE CHECKOUT, NOT IN js/ (mutation-tests-off-tree).
     They used to be written into the working tree under the tree lock, and the lock only serialised
     the writers: three files that READ js/ took no lock and saw them — MEASURED 2026-09-30,
     hazard-other-build-and-gate R236 counted «js/ holds 331», hazard-other-i18n-shape-audit R241 ①
     and hazard-radiation-layer #R585 ④ hit ENOENT on a probe removed mid-read. Before that (when
     this test had no lock at all) eleven files went red the same way. The copy is invisible to
     every other test file, and the gate is run FROM it, so it reads the copy top to bottom. */
  const SCRATCH = scratchTree();
  /* Untracked-but-visible is deliberate: the sweep asks git for both halves (#R628), so a file
     written this second is in scope — which is the state a file being edited is always in. The copy
     carries this checkout's index, so the probes are exactly that there too. */
  const digits = 'js/__r717-probe.js';
  const words = 'js/__r717-word-probe.js';
  assert.equal(SCRATCH.exists(digits) || SCRATCH.exists(words), false, 'a probe path is already taken');
  /* The Sources page says 「Fifty-four frames」, not 「54」 — so the word form is not a nicety here,
     it is how the 正本 states the fact the other eight languages are held to. */
  assert.match(rd('js/locales/pages.en.js'), /Fifty-four frames, seventeen of them BC/,
    'the English Sources page no longer states the sheet count as a word — if it now uses a digit, this assertion is the thing to re-aim, not to delete');
  const { code, out } = SCRATCH.mutate([
    { file: digits, text: '/* data/hist-eras.js: 41 snapshots, seventeen of them BC. */\n' },
    { file: words, text: '/* data/hist-eras.js: forty-one snapshots in all. */\n' },
  ], () => SCRATCH.node('scripts/doc-facts.mjs', ['--check', '--rule=chronos-sheets']));
  assert.equal(SCRATCH.exists(digits) || SCRATCH.exists(words), false, 'the probes outlived the run');
  assert.equal(code, 1, 'a wrong sheet count in js/ did not fail the gate — its universe has stopped reaching the source');
  assert.match(out, /__r717-probe\.js says 41 sheets/,
    'the gate failed, but not on the planted digits — the failure this asserts must be the one it names');
  assert.match(out, /__r717-word-probe\.js says 41 sheets/,
    'a sheet count spelled as an English word passed the gate, and that is the form the 正本 uses');
});

/* ══ ② the contract the shrunken record rests on ═══════════════════════════════════════════════ */
test('#R717 ② hist-cities resolves a missing language column to the English one', async () => {
  /* RUN, not read: the shipped module is booted over the shipped record with a clock standing inside
     real spans that carry `en` and no `de`, and a German reader is asked for the name. */
  const DATA = JSON.parse(rd('data/hist-cities.json'));
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, URL, JSON, Array, Object, String, Map, Set, Math, Number });
  ctx.window = ctx;
  ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) });
  let now = new Date(0);
  ctx.IntMapTime = { isLive: () => false, when: () => new Date(now), on: () => {} };
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
  const HC = ctx.window.IntMapHistCities;
  await HC.ensure();
  assert.ok(HC.ready(), 'the record loaded');
  let asked = 0;
  for (const c of DATA.cities) {
    if (asked >= 12) break;
    const e = c.e.find((x) => x.f && x.n && x.n.en && x.n.de === undefined && x.f >= 10000101);
    if (!e) continue;
    const d = new Date(0); d.setUTCHours(12, 0, 0, 0);
    d.setUTCFullYear(Math.floor(e.f / 10000), Math.floor(e.f / 100) % 100 - 1, e.f % 100);
    now = d;
    const en = HC.at(c.k[0], c.lon, c.lat, 'en');
    if (en !== e.n.en) continue;               /* another span or city answers here — not this question */
    asked++;
    assert.equal(HC.at(c.k[0], c.lon, c.lat, 'de'), en,
      'js/hist-cities.js no longer falls back from a missing language column to `en`. data/hist-cities.json stopped '
      + 'shipping a column for every language in #R717 precisely because the module answers with `en` anyway; without it '
      + 'eight readers in nine get an empty label, and check:histcities cannot see it because the record still matches the builder');
  }
  assert.ok(asked >= 5, `only ${asked} span(s) without a German column could be asked — the probe is not reaching the record`);
});

test('#R717 ② no shipped span asserts a name in a language its own bitmask denies', () => {
  const d = JSON.parse(rd('data/hist-cities.json'));
  let dup = 0, cols = 0;
  for (const c of d.cities) for (const e of c.e) d.langs.forEach((lg, i) => {
    if (e.n[lg] === undefined) return;
    cols++;
    if (lg !== 'en' && e.n[lg] === e.n.en && !((e.a >> i) & 1)) dup++;
  });
  assert.equal(dup, 0, `${dup} column(s) repeat the English spelling under a clear attestation bit`);
  /* …and the saving is the point: a record that grows back to nine columns a span is the defect
     returning, and it would satisfy every assertion above if the bits were set to match. */
  assert.ok(cols < d.cities.reduce((n, c) => n + c.e.length, 0) * d.langs.length * 0.5,
    `${cols} columns over ${d.cities.length} cities — the per-language columns are back`);
});

/* ══ ④ the seam between the two day-exact records, as the spec describes it ════════════════════
   A reader scrubbing from 1885 to 1886 watches about a third of the world's polities disappear in
   one day, and nothing in the repository said why — which is how a reader concludes the record is
   broken (the same defect #R716 found in the 1688/1689 seam's prose). It is a CHANGE OF SUBJECT:
   CShapes 2.0 records the sovereign states of the international system and does not carry colonies
   or protectorates; OpenHistoricalMap draws them. Architecture.md now says so, with counts — and a
   count in prose parts from the machine that holds it unless something asks (#R500), so this asks.
   ⚠ The numbers are not written here either: they are re-derived from the bundles and compared with
   what the document states, so the test cannot be the thing that goes stale. */
test('#R717 ④ the polity counts Architecture.md states for the 1885/1886 seam are what the bundles hold', () => {
  const load = (f, g) => { const w = {}; new Function('window', rd(f))(w); return w[g]; };
  const HB = load('data/hist-borders.js', '__HISTB');
  const CS = load('data/cshapes.js', '__CSHAPES');
  const at = (y) => y * 10000 + 615;
  const start = (f) => f[2] * 10000 + f[3] * 100 + f[4];
  const end = (f) => f[5] * 10000 + f[6] * 100 + f[7];
  /* the two records read their end dates differently, and the spec says so: OHM's is exclusive,
     CShapes' inclusive. Asking one question of both would move every number in the paragraph. */
  const hbAt = (y) => HB.feats.filter((f) => start(f) <= at(y) && end(f) > at(y)).length;
  const csAt = (y) => CS.feats.filter((f) => start(f) <= at(y) && end(f) >= at(y)).length;
  const arch = readSpec(fileURLToPath(ROOT));   /* the spec: the map and its chapters (architecture-split) */
  const claim = /1885 年は OHM が \*\*(\d+)\*\*、1886 年は CShapes が \*\*(\d+)\*\*（OHM なら同じ日に (\d+)）/.exec(arch);
  assert.ok(claim, 'Architecture.md no longer states the 1885/1886 seam — a reader watching a third of the world vanish has nothing to read');
  assert.equal(Number(claim[1]), hbAt(1885), 'the stated 1885 count is not what data/hist-borders.js holds');
  assert.equal(Number(claim[2]), csAt(1886), 'the stated 1886 count is not what data/cshapes.js holds');
  assert.equal(Number(claim[3]), hbAt(1886), 'the stated OHM-at-1886 count is not what data/hist-borders.js holds');

  const unreached = /\*\*(\d+) 件は 1689–1885 のどの 6 月 15 日にも在force にならない\*\*/.exec(arch);
  assert.ok(unreached, 'Architecture.md no longer states how much of data/hist-borders.js the window never reaches');
  let never = 0;
  for (const f of HB.feats) {
    let seen = false;
    for (let y = 1689; y <= 1885 && !seen; y++) if (start(f) <= at(y) && end(f) > at(y)) seen = true;
    if (!seen) never++;
  }
  assert.equal(Number(unreached[1]), never,
    'the stated count of records the drawing window never reaches is not what the bundle holds');
});

/* ══ ③ a bundle carries its own terms ══════════════════════════════════════════════════════════ */
test('#R717 ③ every shipped data bundle that states a source states its licence in it', () => {
  /* discovered, not listed: a seventh bundle is asked the day it is added */
  const files = readdirSync(path('data')).filter((f) => /\.(js|json)$/.test(f));
  const LICENCE = /CC0|CC BY|GPL|ODbL|MIT|Apache|public domain|PDDL|OGL|derived/i;
  const seen = [];
  for (const f of files) {
    /* ⚠ THE `src` THAT IS A BUNDLE'S DECLARATION IS A TOP-LEVEL KEY, AND NOTHING ELSE IS. Measured
       while this was written: the first `"src"` in the first 4 KB finds a FEATURE PROPERTY in
       data/subcables.json («recon», a cable's provenance code), a country's religion prose in
       data/religion.json and a per-row field in data/npp.json — three files reported as shipping
       without terms when all three were simply being read at the wrong depth. So the match is
       anchored at the head of the object and may only step over top-level SCALARS on the way. */
    let src = null;
    try {
      const head = rd('data/' + f).slice(0, 4096);
      src = (head.match(/^(?:window\.__[A-Z0-9_]+\s*=\s*)?\{(?:\s*"[A-Za-z0-9_-]+"\s*:\s*(?:"(?:[^"\\]|\\.)*"|-?[\d.eE+]+|true|false|null)\s*,)*\s*"src"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    } catch { continue; }
    if (!src) continue;
    seen.push(f);
    assert.match(src, LICENCE,
      `data/${f} names its source but not its terms: «${src}». A reader who has the bytes and not the repository `
      + 'cannot see what they may do with them, and for data/cshapes.js (CC BY-NC-SA 4.0) attribution is a CONDITION '
      + 'of redistribution rather than a courtesy');
  }
  assert.ok(seen.length >= 6, `only ${seen.length} bundle(s) in data/ state a source — the needle has stopped matching`);
});
