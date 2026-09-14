/* ============================================================================
 *  IntMap · R716 — historical-map coverage, fidelity, and the gates that hold them
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ EACH TEST STATES THE DEFECT IT WAS WRITTEN FOR, NOT THE ANSWER THAT WAS REACHED.
 *  A check that restates the fix goes green the day the fix is replaced by a worse one that
 *  happens to produce the same shape (memory: intmap-restate-the-defect-not-the-fix).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { csName } from '../scripts/histnames/records.mjs';

const ROOT = new URL('../', import.meta.url);
const rd = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const load = (f, g) => { const w = {}; new Function('window', rd(f))(w); return w[g]; };

/* ══ ① A NAME THE HAND TABLE KNOWS IN ONE LANGUAGE MUST NOT BE ENGLISH IN THE OTHERS ═══════
   THE DEFECT: js/time-borders.js carries hand-written name tables, and scripts/build-histnames.mjs
   refused a row for ANY name those tables answered — in any single shipped language. The reason
   given was #R536: a row lacking the language the hand table has would make the hand table
   unreachable. But the shipped resolver had ALREADY been per-language since #R518
   (`const loc = own || _eraLocName(nm)`, where `own` is `_i18n[lg]`), so the fear was answered and
   the blanket refusal was pure loss. 86 of the 252 CShapes spellings were refused that way, and
   they are the ones a reader meets most — Japan, China, France, Mexico, Egypt, Turkey, India.
   A French, Korean or Chinese reader standing in 1950 read those in English; a Japanese one did not.
   ⚠ MEASURED THROUGH THE SHIPPED RESOLVER, not through the table: what is asked is what a reader
   RECEIVES (`_i18n[lg] || _eraLocName`). Counting one path and not the other is how the size of
   this hole was mis-stated twice before it was fixed. Counts, not percentages — a percentage hides
   which of the two numbers moved. */
const DRAWN = (() => {
  const CS = load('data/cshapes.js', '__CSHAPES');
  const ER = load('data/hist-eras.js', '__HISTERAS');
  /* ⚠ THE DRAWN NAME IS NOT THE STORED ONE. js/time-borders.js `_csName` strips a trailing
     「(gloss)」 before the feature is labelled AND before data/histnames.json is keyed, so
     「Madagascar (Malagasy)」 is drawn and looked up as 「Madagascar」. Measuring the stored
     spelling counts a string no reader ever sees. The rule is IMPORTED from its owner, never
     restated here — two copies of it is how the lane and the label would part company. */
  const cs = CS.feats.map((f) => csName(f[0])).filter((x) => typeof x === 'string' && x);
  const er = [];
  for (const s of ER.snaps) for (const ft of s.feats) {
    const a = ft && ft[0];
    const n = (a && typeof a === 'object') ? (a.en || a.name) : null;
    if (n) er.push(n);
  }
  return { cs, er };
})();

/* · observation — the committed bundles and table, 2026-09-14, counted by this file THROUGH
     js/time-borders.js itself. CShapes draws 710 features, the era snapshots 10,388.
   · expires — whenever either bundle or data/histnames.json is rebuilt; RE-MEASURE, and a language
     may only rise. A floor that stopped touching the metal is the #R700 ORPHAN_POINTS mistake,
     which test ② below exists because of.
   · canon — this table; no document restates these counts. */
const FLOOR = {
  de: [462, 2531], es: [475, 2627], fr: [477, 2659], jp: [660, 4531],
  ko: [619, 3173], ru: [660, 3724], zh: [622, 3546],
};

function received(lang) {
  const T = JSON.parse(rd('data/histnames.json'));
  const { api } = timeBorders({ lang, year: 1950 });
  const hn = (rec, en) => Object.assign({}, T.byName?.[rec]?.[en]?.n || null, T.prose?.[en]?.n || null);
  const count = (names, rec) => names.reduce((n, x) => n + ((hn(rec, x)[lang] || api.eraLocName(x)) ? 1 : 0), 0);
  return [count(DRAWN.cs, 'cshapes'), count(DRAWN.er, 'eras')];
}

for (const [lang, floor] of Object.entries(FLOOR)) {
  test(`① ${lang}: the historical map reaches this reader on at least as many drawn features as measured`, () => {
    const [cs, er] = received(lang);
    assert.ok(cs >= floor[0], `CShapes 1886-2019: ${cs} of ${DRAWN.cs.length} drawn features reach a ${lang} reader, under the measured ${floor[0]} — a name has stopped being localized`);
    assert.ok(er >= floor[1], `era snapshots: ${er} of ${DRAWN.er.length} drawn features reach a ${lang} reader, under the measured ${floor[1]} — a name has stopped being localized`);
  });
}

test('① the two name sources MERGE PER LANGUAGE rather than one owning the name outright', () => {
  /* The defect in its own terms: names the hand table answers, which data/histnames.json ALSO
     answers in a language the hand table is silent in. Under per-NAME ownership this set is empty
     BY CONSTRUCTION — which is exactly why eight rounds of green tests never mentioned it. */
  const T = JSON.parse(rd('data/histnames.json'));
  const langs = Object.keys(FLOOR);
  const apis = Object.fromEntries(langs.map((l) => [l, timeBorders({ lang: l }).api]));
  let merged = 0;
  for (const [name, row] of Object.entries(T.byName.cshapes || {})) {
    const handled = langs.filter((l) => apis[l].eraLocName(name));
    if (!handled.length) continue;                    // table-only name: not the shape under test
    if (langs.some((l) => !handled.includes(l) && row.n?.[l])) merged++;
  }
  assert.ok(merged > 0,
    'no CShapes name is answered by the hand table in one language and by data/histnames.json in another — ownership has gone back to being per-NAME, and every language the hand table is silent in is English again');
});

/* ══ ② A RATCHET THAT STOPPED TOUCHING THE METAL IS NOT A RATCHET ═══════════════════════════
   THE DEFECT: #R700 wrote `ORPHAN_POINTS = 1569` for unreferenced rings in data/cshapes.js and said
   in the same comment that it expires the moment the bundle is re-pooled — re-measure, do not
   raise. #R711/#R712's precision work re-pooled it and carried those rings away. Nobody
   re-measured, so the constant went on offering 1,569 points of slack to a file that had none:
   green, and asserting nothing. Slack is invisible precisely because it never fails. These assert
   the allowances EQUAL what the bundles hold, so a legitimate change must re-measure rather than
   coast on someone else's headroom. */
test('② the cshapes orphan allowance equals what the bundle actually holds', () => {
  const declared = Number(/const ORPHAN_POINTS = (\d+);/.exec(rd('scripts/build-cshapes.mjs'))?.[1]);
  assert.ok(Number.isInteger(declared), 'scripts/build-cshapes.mjs no longer declares ORPHAN_POINTS');
  const d = load('data/cshapes.js', '__CSHAPES');
  const used = new Set();
  for (const f of d.feats) for (const poly of f[8]) for (const ri of poly) used.add(ri);
  let pts = 0;
  for (let i = 0; i < d.rings.length; i++) if (!used.has(i)) pts += d.rings[i].length;
  assert.equal(declared, pts,
    `ORPHAN_POINTS is ${declared} and data/cshapes.js holds ${pts} — the allowance has stopped touching the metal; re-measure it rather than leave the slack`);
});

test('② the era named/blank ratchets equal what the bundle actually holds', () => {
  const src = rd('scripts/build-hist-eras.mjs');
  const named = Number(/const NAMED_MIN = (\d+);/.exec(src)?.[1]);
  const blank = Number(/const BLANK_MAX = (\d+);/.exec(src)?.[1]);
  assert.ok(Number.isInteger(named) && Number.isInteger(blank),
    'scripts/build-hist-eras.mjs no longer declares NAMED_MIN / BLANK_MAX');
  const d = load('data/hist-eras.js', '__HISTERAS');
  const f = d.snaps.reduce((n, s) => n + s.feats.length, 0);
  const b = d.snaps.reduce((n, s) => n + s.blank.length, 0);
  assert.equal(named, f, `NAMED_MIN is ${named} and the bundle names ${f}`);
  assert.equal(blank, b, `BLANK_MAX is ${blank} and the bundle carries ${b} unnamed polygons`);
});

/* ══ ③ A `--check` IS NOT A GATE UNTIL A DECLARED check:* REACHES IT ════════════════════════
   THE DEFECT: the three rules that hunt for gates nothing calls (gate-callers, gate-lists,
   ci-gates in scripts/doc-facts.mjs) all take package.json's DECLARED check:* scripts as their
   universe. A generator that implements `--check` and keeps it to itself is therefore invisible to
   the very rules written to find it (memory: intmap-gate-universe-is-declared-gates).
   data/border-detail/ (409 MB) and data/hist-places.json both sat outside for that reason, and the
   second was never run against its shipped bytes at all — two node tests exercised the builder's
   selection rule on fixtures, which is a different question from what ships.
   ⚠ THE UNIVERSE IS DISCOVERED, NOT LISTED. A hand-written roster of historical generators drops
   the next one silently, which is the failure this whole round keeps meeting.
   ⚠ AND SO IS THE EXEMPTION. One historical generator legitimately is not a gate:
   build-histcities-homonyms.mjs downloads 13.6 MB from GeoNames to build the EVIDENCE
   check:histcities judges against, and a CI runner has no cache for it. That exemption is not
   written here — it is read from package.json, which must carry the `build:*` script AND the `//`
   companion stating why. An exception a test keeps to itself is a hand list wearing a disguise
   (.agents/rules/no-ad-hoc-hardcoding.md §6: name it, and say what would let it go). */
test('③ every historical generator that writes a shipped bundle and implements --check is a declared gate, or says why not', () => {
  const scripts = JSON.parse(rd('package.json')).scripts;
  const declared = Object.entries(scripts)
    .filter(([k]) => k.startsWith('check:')).map(([, v]) => v).join(' ');
  /* exempt ONLY where the repository itself states the exemption: a declared build:* script whose
     `//` companion explains it. Silence is never an exemption. */
  const excused = Object.entries(scripts)
    .filter(([k]) => k.startsWith('build:') && String(scripts['//' + k] || '').trim().length > 40)
    .map(([, v]) => v).join(' ');
  const found = readdirSync(new URL('scripts/', ROOT))
    .filter((f) => f.endsWith('.mjs') && /^build-(hist|cshapes|border)/.test(f))
    .filter((f) => {
      const s = rd('scripts/' + f);
      return /--check(?![a-z-])/.test(s) && /writeFileSync|createWriteStream/.test(s);
    });
  assert.ok(found.length >= 8,
    `only ${found.length} historical generators were discovered — the discovery rule is no longer finding them and this test needs rewriting`);
  const orphans = found.filter((f) => !declared.includes('scripts/' + f) && !excused.includes('scripts/' + f));
  assert.deepEqual(orphans, [],
    `these historical generators implement --check, no declared check:* reaches them, and package.json states no reason why not — so the rules written to find uncalled gates cannot see them: ${orphans.join(', ')}`);
});

/* ══ ④ PROSE INSIDE A SCRIPT STATES FACTS ABOUT SHIPPED BUNDLES, AND NOTHING READ IT ═══════
   THE DEFECT: scripts/doc-facts.mjs discovers its universe from git — but only tracked `*.md`.
   That is deliberate and it is written down. What is NOT written down is the consequence: the
   explanatory prose inside the BUILD SCRIPTS makes the same kind of claim about the same shipped
   bytes, and no rule in the repository has ever read one word of it. Measured this round:
   scripts/asset-report.mjs described data/hist-eras.js as 「the era snapshots, 53 of them」 — the
   bundle has carried 54 since #R707 restored the sheet that had been dropped, and the row that
   exists to tell a reader what they are paying for had been wrong ever since.
   ⚠ The number is re-derived from the bundle, never restated here, and the rule fails if it finds
   no claim at all — a needle that matches nothing reports green (#R699). */
test('④ the asset ledger states the era snapshot count the bundle actually carries', () => {
  const src = rd('scripts/asset-report.mjs');
  const at = src.indexOf('hist-eras\\.js$/');
  assert.ok(at > 0, 'scripts/asset-report.mjs no longer carries a row for data/hist-eras.js');
  const row = /why:\s*'([^']*)'/.exec(src.slice(at));
  assert.ok(row, 'the data/hist-eras.js asset row no longer explains what ships');
  const stated = /([0-9][0-9,]*)\s+of them/.exec(row[1]);
  assert.ok(stated, 'the data/hist-eras.js asset row no longer says how many snapshots ship — this rule would pass while measuring nothing');
  const snaps = load('data/hist-eras.js', '__HISTERAS').snaps.length;
  assert.equal(Number(stated[1].replace(/,/g, '')), snaps,
    `scripts/asset-report.mjs says ${stated[1]} era snapshots; data/hist-eras.js carries ${snaps}`);
});
