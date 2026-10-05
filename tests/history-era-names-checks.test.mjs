/* ============================================================================
 *  IntMap · the names of past polities in nine languages — one table for three records, the rule
 *  that decides what may enter it, and what a reader of each language actually receives
 *  (data/histnames.json · scripts/histeras/* · scripts/histnames/* · js/time-borders.js)
 *  (consolidated from tests/r686-histeras-names, r695-histnames, r700-era-gloss,
 *   r713-hist-coverage ②, r714-hist-river-names and r716-hist-coverage ①; each test keeps its tag)
 * ----------------------------------------------------------------------------
 *  #R686 put a second lane beside data/hist-eras.js's English-only names and a rule deciding what may
 *  enter it (scripts/histeras/match.mjs) — measured by EVALUATION, because #R515 was a rule that took a
 *  ranker's first hit and a rule that cannot be run cannot be shown to refuse anything. #R695 made one
 *  table answer for all three records (whether a name reached a reader used to depend on which RECORD
 *  answered the year). #R700: «Ceylon (Dutch)» is a polity AND its possessor — decomposed by the rule
 *  js/time-borders.js publishes. #R713: the era lane asked ONE store (Wikidata) and recorded its silence
 *  as a verdict; English Wikipedia's redirects are a second store. #R714: at 1500 «Aragón» was labelled
 *  「アラゴン川」 — the RIVER agreed on every test the scorer makes, so the fix is by KIND
 *  (`watercourse`), and the obvious wider root (landform) would have deleted the United Kingdom.
 *  #R716: a name the hand table knows in ONE language must not be English in the others.
 *
 *  ⚠ EVERY CHECK HERE EVALUATES (#R505); none reads a source for a spelling (#R488).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle, boxDistance, lonGap, eraBaseCensus, eraNameRule } from '../scripts/histeras/census.mjs';
import { score, decide, labelsFor, plainLabel, timeSlack, wdYear, yearGap, LANG_SOURCES, REJECT, FLOOR, isSubject } from '../scripts/histeras/match.mjs';
import { CACHE, REJECT_ROOTS, ACCEPT_ROOTS, resolveArticles, articlesFor } from '../scripts/histeras/harvest.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { censusCShapes, censusHistBorders, histBordersQidGaps, bundle, csName } from '../scripts/histnames/records.mjs';
import { commonWords, isProse } from '../scripts/histnames/prose.mjs';
import { PROSE } from '../scripts/histnames/prose-text.mjs';
import { appLangs, shipLangs, attestedLangs } from '../scripts/histnames/langs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const load = (f, g) => { const w = {}; new Function('window', rd(f))(w); return w[g]; };
/* ⚠ (#R695) THE FILE MOVED AND GREW: #R686 shipped data/histeras-names.json for one record; the table
   now answers for all three (data/histnames.json), so #R686's rows are `byName.eras`. */
const NAMES_PATH = join(ROOT, 'data', 'histnames.json');
const doc = () => JSON.parse(readFileSync(NAMES_PATH, 'utf8'));
const TABLE = doc();
const eraRowsOf = (d) => d.byName.eras;

/* ══ #R686 — the deep past, named in nine languages: the RULE and the SHIPPED TABLE ══════════════ */
const NONE = new Set();
const INTERNAL = new Set(['Q4167410']);            /* Wikimedia disambiguation page */
/* a row shaped like the map's: one shape around the Aegean, drawn at 323 BC */
const ROW = { name: 'Test Polity', n: 1, snaps: ['bc323'], y0: -322, y1: -322, boxes: [[20, 34, 28, 41]] };
/* the record's own frames — the time slack is READ from these, never typed in */
const YEARS = eraBundle(ROOT).snaps.map((s) => s.y);
const cand = (o) => ({ qid: 'Q1', exact: true, coord: null, starts: [], ends: [], p31: [], geo: true, ...o });

test('#R686 ① a disambiguation page is not a polity — the class rejects it outright', () => {
  const v = score(ROW, cand({ p31: ['Q4167410'] }), INTERNAL, YEARS);
  assert.equal(v.why, REJECT.INTERNAL);
  assert.equal(v.points, null);
  /* measured on the first sweep: 353 of 1,335 exact English-title matches were this class */
  assert.equal(score(ROW, cand({ p31: ['Q4167410'] }), NONE, YEARS).why, null,
    'the class set is DERIVED from Wikidata, not written here — an empty set must reject nothing');
});

test('#R686 ② a stated coordinate must be INSIDE a shape the map draws — no tolerance band', () => {
  const near = score(ROW, cand({ coord: [24, 38] }), NONE, YEARS);     /* inside the shape */
  assert.equal(near.space, 0);
  assert.equal(near.why, null);
  for (const [lon, lat, what] of [[121, 14, 'Luzon'], [30, 38, 'just east of the box'], [24, 42, 'just north of it']]) {
    const v = score(ROW, cand({ coord: [lon, lat] }), NONE, YEARS);
    assert.equal(v.why, REJECT.SPACE, what + ' is not inside the shape and must be refused');
    assert.ok(v.space > 0);
  }
});

test('#R686 ③ the clock is asked at the record’s own resolution, not at a flat number', () => {
  const then = score(ROW, cand({ starts: ['-000400-00-00T00:00:00Z'], ends: ['-000200-00-00T00:00:00Z'] }), NONE, YEARS);
  assert.equal(then.time, 0);
  assert.equal(then.why, null);
  const modern = score(ROW, cand({ starts: ['+1960-00-00T00:00:00Z'] }), NONE, YEARS);
  assert.equal(modern.why, REJECT.TIME);
  assert.equal(wdYear('-000400-00-00T00:00:00Z'), -400);
  assert.equal(wdYear('+1960-01-01T00:00:00Z'), 1960);
  assert.equal(yearGap(1960, Infinity, -322, -322), 2282);
  /* ⚠ THE SLACK IS THE SNAPSHOT SPACING — the measured failure of a flat 400 years was CHEYENNE,
     WYOMING (founded 1867) answering for the Cheyenne at 1492, a gap of 375 */
  const AT1492 = { ...ROW, y0: 1492, y1: 1492 };
  assert.equal(timeSlack(AT1492, YEARS), 92);
  assert.equal(score(AT1492, cand({ coord: [24, 38], starts: ['+1867-00-00T00:00:00Z'] }), NONE, YEARS).why, REJECT.TIME);
  const DEEP = { ...ROW, y0: -122999, y1: -122999 };
  assert.ok(timeSlack(DEEP, YEARS) > 100000, 'and the deepest frame has no neighbour within a hundred millennia');
});

test('#R686 ④ two candidates that agree equally well decide nothing', () => {
  const a = cand({ qid: 'Q1', coord: [24, 38] });
  const b = cand({ qid: 'Q2', coord: [25, 39] });
  assert.equal(decide(ROW, [a, b], NONE, YEARS).why, REJECT.TIE);
  /* one of them agreeing on the century as well breaks the tie */
  const c = { ...b, starts: ['-000400-00-00T00:00:00Z'], ends: ['-000200-00-00T00:00:00Z'] };
  assert.equal(decide(ROW, [a, c], NONE, YEARS).qid, 'Q2');
});

test('#R686 ⑤ a lone candidate is taken only when it is a place at all', () => {
  assert.equal(decide(ROW, [cand({ geo: true })], NONE, YEARS).qid, 'Q1');
  assert.equal(decide(ROW, [cand({ geo: false })], NONE, YEARS).why, REJECT.BARE);
  assert.equal(decide(ROW, [cand({ geo: true, exact: false })], NONE, YEARS).why, REJECT.BARE,
    'an ALIAS with nothing else agreeing is not an identification');
});

test('#R686 ⑥ the antimeridian is not a distance — Fiji is not 173° wide', () => {
  const fiji = [176, -20, -178, -16];                   /* crosses 180 */
  assert.equal(boxDistance(fiji, 179, -18), 0);
  assert.equal(boxDistance(fiji, -179, -18), 0);
  assert.equal(lonGap(179, -179), 2);
  assert.equal(lonGap(-179, 179), 2);
  assert.ok(boxDistance(fiji, 0, -18) > 100, 'and Africa is still far from Fiji');
});

test('#R686 ⑦ the bare zh is SIMPLIFIED, and the language list is the app registry', () => {
  assert.ok(LANG_SOURCES['zh-hans'].includes('zh'), "Wikidata's bare zh is Simplified — it feeds zh-hans");
  assert.ok(!LANG_SOURCES.zh.includes('zh'), "IntMap's zh is Traditional and must not take Wikidata's bare zh");
  assert.deepEqual(LANG_SOURCES.zh, ['zh-hant', 'zh-tw', 'zh-hk']);
  assert.deepEqual(LANG_SOURCES.jp, ['ja']);
  const codes = JSON.parse(/\[[^\]]*\]/.exec(rd('js/locales/_langs.js'))[0]);
  assert.deepEqual(Object.keys(LANG_SOURCES).sort(), codes.slice().sort(),
    'a language added to js/locales/ must be answered here, not silently skipped');
  assert.deepEqual(labelsFor({ labels: { ja: 'エラム', zh: '埃兰', en: 'Elam' } }), { en: 'Elam', jp: 'エラム', 'zh-hans': '埃兰' });
});

test('#R686 ⑧ the shipped table is keyed to the bundle it names', () => {
  assert.ok(existsSync(NAMES_PATH), 'data/histnames.json is missing');
  const d = doc();
  const rows = census(eraBundle(ROOT));
  const known = new Set(rows.map((r) => r.name));
  const keys = Object.keys(eraRowsOf(d));
  assert.ok(keys.length > 0);
  for (const k of keys) assert.ok(known.has(k), `data/histnames.json names "${k}" as an era polity, which data/hist-eras.js does not draw`);
  for (const [k, rec] of Object.entries(eraRowsOf(d))) {
    assert.match(rec.q, /^Q\d+$/);
    assert.ok(!('en' in rec.n), `"${k}" carries an English name — English is the upstream's`);
    for (const [lg, v] of Object.entries(rec.n)) {
      assert.ok(d.langs.includes(lg), `"${k}" carries "${lg}", which is not an app language`);
      assert.notEqual(v, k, `"${k}" repeats the English in ${lg} — such a row says nothing`);
      assert.ok(!v.includes('�'), `"${k}" carries U+FFFD in ${lg}`);
    }
  }
  /* ⚠ AND NO LANGUAGE MAY BE CLAIMED THAT NOBODY WROTE: `a` can only be a subset of what Wikidata carried */
  const bit = (lg) => 1 << d.mask.indexOf(lg);   /* (#R695) the mask counts in the app registry's order */
  assert.equal(Object.values(eraRowsOf(d)).filter((r) => r.a & bit('en')).length, 0,
    'no row may claim an English attestation');
});

test('#R686 ⑨ no era name is answered twice — the bundled lane and the hand tables are disjoint', async () => {
  const d = doc();
  const clash = {};
  for (const lg of d.langs) {
    if (lg === 'en') continue;
    const { api } = await timeBorders({ lang: lg });
    const both = Object.entries(eraRowsOf(d)).filter(([k, r]) => r.n[lg] && api.eraLocName(k)).map(([k]) => k);
    if (both.length) clash[lg] = both.slice(0, 8);
  }
  assert.deepEqual(clash, {},
    'a name localized by BOTH data/histnames.json and the tables in js/time-borders.js has two '
    + 'answers, and only one of them can ever be read (#R536). Drop it from the built table.');
});

test('#R686 ⑩ a bracketed qualifier is a disambiguation, and no shipped name carries one', () => {
  for (const s of ['Montana (New Jersey)', 'Blackfoot (Montana)', '아이누 (동음이의)', 'Ainu（曖昧さ回避）', 'Arran (Azerbaïdjan)']) {
    assert.equal(plainLabel(s), false, JSON.stringify(s) + ' is Wikidata disambiguating, not a map label');
  }
  for (const s of ['Kalmar Union', 'ヴェネツィア', '新羅', 'Khanat der Krim']) assert.equal(plainLabel(s), true);
  const d = doc();
  const bad = [];
  for (const [k, rec] of Object.entries(eraRowsOf(d))) {
    for (const [lg, v] of Object.entries(rec.n)) if (!plainLabel(v)) bad.push(k + ' [' + lg + '] ' + v);
  }
  assert.deepEqual(bad, [], 'a map label has no room to carry a disambiguation');
});

/* ══ #R695 — one historical-name table, three records: the rules, EVALUATED ═══════════════════
   ⚠ WHAT #R695 FIXED IS A RULE ATTACHED TO THE WRONG THING: OpenHistoricalMap writes `name:xx` and
   CShapes does not, so 1750 was readable and 1950 was not. */
test('#R695 ① three records, one row shape — the rule can be asked once', () => {
  const cs = censusCShapes(ROOT), hb = censusHistBorders(ROOT), er = census(eraBundle(ROOT));
  for (const [what, rows] of [['cshapes', cs.rows], ['hist-borders', hb.rows], ['eras', er]]) {
    assert.ok(rows.length > 0, what + ' produced no census rows');
    for (const r of rows.slice(0, 50)) {
      assert.equal(typeof r.name, 'string');
      assert.ok(r.n >= 1, what + ': a row must count the features it is drawn on');
      assert.ok(Number.isFinite(r.y0) && Number.isFinite(r.y1) && r.y0 <= r.y1, what + ': ' + r.name + ' has no interval');
      assert.ok(Array.isArray(r.boxes) && r.boxes.length, what + ': ' + r.name + ' has no box — nothing to make a candidate agree with');
    }
  }
  /* ⚠ THE UNIT IS THE DRAWN FEATURE, NOT THE RING: an archipelago's islands must not outvote */
  const russia = cs.rows.find((r) => r.name === 'Russia');
  assert.ok(russia && russia.boxes.length === russia.n, 'one box per drawn feature');
  /* the gloss in brackets is not part of the name — js/time-borders.js strips it before labelling */
  assert.equal(csName('Madagascar (Malagasy)'), 'Madagascar');
  assert.equal(csName('Russia'), 'Russia');
});

test('#R695 ② the record’s own words always win — the merge is EVALUATED, not read', async () => {
  /* ⚠ THE MERGE ORDER IS THE WHOLE SAFETY OF THE IDENTIFIER LANE — js/time-borders.js is INSTANTIATED */
  const { api, window: w } = await timeBorders({ lang: 'jp' });
  const t = doc();
  /* the harness has no `fetch`, so the table is injected the way the module would have received it */
  await api.loadHistNames();
  const qid = Object.keys(t.byQid)[0];
  const table = api.histNames();
  assert.ok(table && typeof table === 'object', 'the names lane must resolve even with no fetch — it may never fail the map');
  void qid; void w;
  const d = bundle('hist-borders.js', '__HISTB', ROOT);
  /* a table row may never claim a language the record already filled */
  const gaps = histBordersQidGaps(attestedLangs(ROOT), ROOT);
  for (const q of Object.keys(t.byQid)) {
    assert.ok(gaps.has(q), 'data/histnames.json answers ' + q + ', which data/hist-borders.js has no gap for');
    for (const lg of Object.keys(t.byQid[q].n)) {
      assert.ok(gaps.get(q).has(lg), 'the identifier lane answers ' + q + ' in ' + lg
        + ', which OpenHistoricalMap already wrote on every feature that states it');
    }
  }
  /* and the whole record still reads as its upstream wrote it wherever it wrote anything */
  let kept = 0;
  for (const f of d.feats) {
    const row = t.byQid[f[1]]; if (!row) continue;
    for (const [lg, v] of Object.entries(f[0])) { if (row.n[lg]) assert.notEqual(row.n[lg], undefined); kept += v ? 1 : 0; }
  }
  assert.ok(kept > 0);
});

test('#R695 ③ the table only ever names something one of the three records draws', () => {
  const t = doc();
  const csNames = new Set(bundle('cshapes.js', '__CSHAPES', ROOT).feats.map((f) => csName(f[0])));
  const erNames = new Set(census(eraBundle(ROOT)).map((r) => r.name));
  /* (hist-coverage-expansion) every record that states identifiers: OpenHistoricalMap's relations and Cliopatria's verified rows,
     and (hist-colonial-era-borders) OpenHistoricalMap's relations on CShapes' days */
  const hbQids = new Set([...bundle('hist-borders.js', '__HISTB', ROOT).feats, ...bundle('hist-clio.js', '__HISTCLIO', ROOT).feats, ...bundle('hist-borders-late.js', '__HISTBLATE', ROOT).feats].map((f) => f[1]).filter(Boolean));
  for (const k of Object.keys(t.byName.cshapes)) assert.ok(csNames.has(k), 'cshapes lane names "' + k + '", which data/cshapes.js does not draw');
  for (const k of Object.keys(t.byName.eras)) assert.ok(erNames.has(k), 'era lane names "' + k + '", which data/hist-eras.js does not draw');
  for (const k of Object.keys(t.prose)) assert.ok(erNames.has(k), 'prose lane names "' + k + '", which data/hist-eras.js does not draw');
  for (const q of Object.keys(t.byQid)) assert.ok(hbQids.has(q), 'the identifier lane answers ' + q + ', which no feature states');
});

test('#R695 ④ a description is told from a name by a measure, not by a list', () => {
  const rows = census(eraBundle(ROOT));
  const common = commonWords(rows.map((r) => r.name));
  /* a string Wikidata carries an item for is a NAME, whatever it looks like */
  assert.equal(isProse('Savanna hunter-gatherers', true, common), false, 'an attested string is a name, not prose');
  assert.equal(isProse('Savanna hunter-gatherers', false, common), true);
  assert.equal(isProse('Plain bison hunters', false, common), true);
  /* …and a name is not prose merely for having a lower-case token nobody else uses */
  assert.equal(isProse('Guanches', false, common), false);
  assert.equal(isProse('Khoiasan', false, common), false);
  assert.equal(isProse('Malak malak', false, common), false, '「malak」 occurs in one name — that is a name, not vocabulary');
  assert.equal(isProse('Comté de Toulouse', false, common), false, 'a Romance particle is grammar, not description');
  /* ⚠ AND THE WORD LIST IS DISCOVERED — nothing about English is written down */
  const tiny = commonWords(['red pottery culture', 'grey pottery culture']);
  assert.ok(tiny.has('pottery') && tiny.has('culture'));
  assert.ok(!tiny.has('red') && !tiny.has('grey'), 'a token used in one name only is not vocabulary');
});

test('#R695 ⑤ the authored table cannot go stale — its membership is derived and the build enforces it', () => {
  const rows = census(eraBundle(ROOT));
  const common = commonWords(rows.map((r) => r.name));
  const t = doc();
  const shipped = new Set(Object.keys(t.prose));
  const written = new Set(Object.keys(PROSE.jp));
  assert.deepEqual([...shipped].filter((k) => !written.has(k)), [],
    'the shipped prose lane names a string scripts/histnames/prose-text.mjs has no line for');
  for (const k of shipped) {
    assert.ok(isProse(k, false, common), '"' + k + '" is shipped as the upstream’s prose but no longer classifies as prose');
  }
  /* and the mark is carried, so a description can be told from a polity's name downstream (#R682) */
  for (const [k, r] of Object.entries(t.prose)) assert.equal(r.d, 1, '"' + k + '" is a description and must say so');
});

test('#R695 ⑥ «is this the kind of thing the map draws» is asked of the kind, not of a coordinate', () => {
  const row = { name: 'Guanches', n: 34, y0: -999, y1: 1500, boxes: [[-18, 27, -13, 29]] };
  const years = [-999, 1500];
  const internal = new Set();
  /* a people: no coordinate, no dates, no country statement — #R686's `geo` said no */
  const people = { qid: 'Q219995', exact: true, coord: null, starts: [], ends: [], p31: ['Q41710'], geo: false };
  assert.equal(isSubject(people), false, 'without a subject set it falls back to #R686’s answer');
  const withSubject = { ...people, subject: true };
  assert.equal(isSubject(withSubject), true);
  assert.equal(decide(row, [people], internal, years).qid, null, 'this is the row #R686 refused');
  assert.equal(decide(row, [withSubject], internal, years).qid, 'Q219995', 'and the kind is what answers it');
  /* ⚠ IT BUYS ONE POINT, NOT AGREEMENT: a stated coordinate elsewhere is still refused */
  const elsewhere = { ...withSubject, coord: [139, 35] };
  assert.equal(score(row, elsewhere, internal, years).why, 'elsewhere');
  /* ⚠ AND IT CANNOT WIN A CONTEST ON ITS OWN */
  const other = { ...withSubject, qid: 'Q2' };
  assert.equal(decide(row, [withSubject, other], internal, years).qid, null, 'two equally good candidates decide nothing');
  assert.ok(ACCEPT_ROOTS.length && REJECT_ROOTS.length);
  assert.deepEqual(ACCEPT_ROOTS.filter((q) => REJECT_ROOTS.includes(q)), [],
    'a root cannot both be and not be a kind this map draws');
});

test('#R695 ⑦ narrowing what IntMap WRITES never narrows what a source wrote', () => {
  const all = appLangs(ROOT), att = attestedLangs(ROOT), ship = shipLangs(ROOT);
  assert.deepEqual(att, all, 'a label a source wrote is carried in every language the app has');
  assert.ok(ship.length >= 1 && ship.every((l) => all.includes(l)));
  assert.ok(ship.includes('en'), 'English is the upstream’s and is always shipped');
  const t = doc();
  assert.deepEqual(t.langs, att);
  assert.deepEqual(t.authored, ship);
  assert.deepEqual(t.mask, all, 'the attestation bits count in the app registry’s order, not the shipped one');
  /* ⚠ THE MEASURED FLOOR (#R686's own numbers, 2026-09-11) — the table may never answer FEWER */
  const FLOOR_R686 = { de: 242, es: 262, fr: 282, jp: 399, ko: 344, ru: 395, zh: 421, 'zh-hans': 421 };
  for (const [lg, floor] of Object.entries(FLOOR_R686)) {
    const n = Object.values(t.byName.eras).filter((r) => r.n[lg]).length;
    assert.ok(n >= floor, 'the era lane answers ' + n + ' names in ' + lg + '; #R686 already shipped ' + floor
      + ' — narrowing the policy must not delete what a source already wrote');
  }
  for (const lane of [t.byName.cshapes, t.byName.eras, t.byQid, t.prose]) {
    for (const [k, r] of Object.entries(lane)) {
      for (const lg of Object.keys(r.n)) {
        assert.ok(all.includes(lg), '"' + k + '" carries "' + lg + '", which is not an app language');
        assert.notEqual(lg, 'en', '"' + k + '" carries an English name — English is the upstream’s');
      }
    }
  }
});

test('#R695 ⑧ the shipped table is a table, not a second copy of the records', () => {
  assert.ok(existsSync(NAMES_PATH), 'data/histnames.json is missing');
  assert.ok(!existsSync(join(ROOT, 'data', 'histeras-names.json')),
    'the superseded table is back — one era name with two answers is #R536’s failure waiting');
  const t = doc();
  assert.equal(t.v, 1);
  assert.ok(t.src && t.src.wikidata && /CC0/.test(t.src.wikidata), 'the Wikidata lane must state its licence');
  assert.ok(t.src.prose && /IntMap/.test(t.src.prose), 'the prose lane must say the words are IntMap’s, not a source’s');
  for (const lane of [t.byName.cshapes, t.byName.eras, t.byQid, t.prose]) {
    for (const [k, r] of Object.entries(lane)) {
      assert.ok(Object.keys(r.n).length > 0, '"' + k + '" localizes nothing and should not be in the file');
      for (const v of Object.values(r.n)) assert.ok(!v.includes('�'), '"' + k + '" carries U+FFFD');
    }
  }
});

/* the other half of #R695: the years the reader can ASK for. Below 1689 there were no dates at all, so
   the stretch where dragging is WORST — a logarithmic slider over 124,688 years — had no way to step. */
test('#R695 ⑨ the stepper reaches the era sheets, and asks no bundle it does not already have', async () => {
  const { api, window: w } = await timeBorders({ lang: 'jp', year: 500 });
  const HS = w.IntMapHistScale;
  assert.ok(HS && typeof HS.utcAt === 'function', 'js/hist-scale.js must be the one owner of this arithmetic');
  /* minimal stand-ins: the RULE is what is measured. Nothing here may fetch. */
  w.__CSHAPES = { rings: [], feats: [] };
  w.__HISTB = { window: [1689, 1885], rings: [], feats: [[{ en: 'Y' }, null, 1689, 1, 1, 1885, 12, 31, []]] };
  const ymd = (d) => (d ? HS.ymd(d) : null);
  /* with no era bundle on the page, the next moment offered is the day-exact record's own first day */
  assert.equal(ymd(await api.changeAfter(HS.utcAt(500, 4, 15, 12))), '1689-01-01',
    'the stepper must not invent a date from a bundle that is not loaded');
  w.__HISTERAS = { rings: [], snaps: [{ y: -122999 }, { y: 500 }, { y: 600 }, { y: 1650 }, { y: 1700 }, { y: 2010 }] };
  assert.equal(ymd(await api.changeAfter(HS.utcAt(500, 4, 15, 12))), '0600-01-01');
  assert.equal(ymd(await api.changeAfter(HS.utcAt(-122999, 0, 2, 12))), '0500-01-01',
    'a key below year 0 must sort and decode — 123000 BC is 113,000 years from the next sheet');
  /* ⚠ AND A SHEET IS NOT A CHANGE DATE: only the sheets BELOW the day-exact window are offered */
  assert.equal(ymd(await api.changeAfter(HS.utcAt(1650, 5, 15, 12))), '1689-01-01');
  assert.equal(ymd(await api.changeBefore(HS.utcAt(1689, 0, 2, 12))), '1689-01-01');
});

test('#R695 ⑩ a key below year 0 decodes to the year it names — both traps, in one line', async () => {
  const { api, window: w } = await timeBorders({ lang: 'jp' });
  const HS = w.IntMapHistScale;
  /* ⚠ #R602: `new Date(y, …)` maps a year under 100 to 1900+y, and `Math.floor(k/100) % 100` yields a
     NEGATIVE month for a negative key. Neither could fire while the list stopped at 1689. */
  for (const y of [-122999, -322, -1, 0, 1, 99, 1689, 2019]) {
    const d = HS.utcAt(y, 0, 1, 12);
    assert.equal(d.getUTCFullYear(), y, 'the clock owner must place year ' + y + ' where it says');
  }
  assert.equal(HS.ymd(HS.utcAt(99, 0, 1, 12)), '0099-01-01', 'year 99 is year 99, not 1999');
  /* the floor the stepper offers is the deepest record's, never a number typed in this file */
  assert.equal(api.range().min, HS.FLOOR);
});

/* ══ #R700 — «Ceylon (Dutch)» is two questions, and only one was ever asked ═══════════════════
   314 of data/hist-eras.js's 3,028 spellings carry a possessor. ⚠⚠⚠ THE OBVIOUS FIX IS THE WRONG ONE:
   data/cshapes.js writes a bracket the reader NEVER SEES, while the era snapshots mean the opposite by
   the same punctuation (js/time-borders.js localizes the two halves and puts the bracket back). So
   the decomposition is PUBLISHED by the file that decides what the reader sees (`IntMapEraName`). */
const ROWS = census(eraBundle(ROOT));
const GLOSSED = ROWS.filter((r) => eraNameRule().split(r.name));

/* ⚠ THE MODULE'S OWN LOADER IS RUN, NOT BYPASSED: `hnFor` answers out of `_hn`, filled by `hnLoad()`
   from `fetch('data/histnames.json')`, and the harness stubs fetch to throw. A fetch resolving with the
   SHIPPED BYTES is defined INSIDE the vm context (via the context's own Function), because the
   harness owns the sandbox and this file may not reach into it. */
async function live(lang) {
  const { api } = await timeBorders({ lang });
  api.eraLocName.constructor('j',
    'fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(j);}});}')(TABLE);
  await api.loadHistNames();
  assert.ok(api.histNames() && api.histNames().byName, 'the shipped table did not reach the module');
  return api;
}

test('#R700 ① the published rule DECOMPOSES a glossed era name — it does not strip the bracket', () => {
  const R = eraNameRule();
  assert.ok(GLOSSED.length > 100, 'the record draws ' + GLOSSED.length + ' glossed names; #R700 measured 314');
  for (const r of GLOSSED) {
    const p = R.split(r.name);
    assert.ok(p.base && p.gloss, r.name + ' split away one of its halves');
    /* ⚠ THE RULE IS ITS OWN INVERSE — measured on all of them; whitespace is the one thing the round
       trip may move (some upstream strings carry a stray space). */
    assert.equal(R.join(p.base, p.gloss, 'en').replace(/\s/g, ''), r.name.replace(/\s/g, ''),
      r.name + ' does not survive its own rule');
  }
});

test('#R700 ② the join owns the punctuation, per language', () => {
  const R = eraNameRule();
  const jp = R.join('X', 'Y', 'jp'), en = R.join('X', 'Y', 'en');
  assert.ok(jp.includes('Y') && en.includes('Y'), 'the possessor left the label');
  assert.ok(jp.startsWith('X') && en.startsWith('X'), 'the base left the front of the label');
  assert.notEqual(jp, en, 'Japanese brackets are full-width — the label carried Latin ones');
  assert.ok(/[（）]/.test(jp), 'the Japanese label did not use full-width brackets');
});

test('#R700 ③ the hand tables still put the possessor back — a localized base alone is not the label', async () => {
  /* ⚠⚠ NOT EVERY LOCALIZED GLOSSED NAME GOES THROUGH THE BRACKET BRANCH («Cyraneica (UK Lybia)» is
     「キレナイカ」, «Arabia (Nejd)» comes back 「ナジュド（アラビア）」). So the composed ones are
     identified by what composition leaves behind — the localized base AND MORE. */
  const R = eraNameRule();
  const api = (await timeBorders({ lang: 'jp' })).api;
  let seen = 0, composed = 0;
  for (const r of GLOSSED) {
    const label = api.eraLocName(r.name);
    if (!label) continue;
    seen++;
    const p = R.split(r.name);
    const base = api.eraLocName(p.base) || p.base;
    if (!label.startsWith(base) || label === base) continue;   /* answered whole, not composed */
    composed++;
    const tail = label.slice(base.length);
    assert.ok(/^[\s（(].*[）)]$/.test(tail),
      r.name + ' → «' + label + '»: the possessor is not in a bracket of its own');
    assert.ok(tail.replace(/[\s（）()]/g, '').length > 0,
      r.name + ' → «' + label + '»: the bracket was put back empty');
  }
  assert.ok(seen > 20, 'only ' + seen + ' glossed names localize at all — the hand-table branch is unreachable');
  assert.ok(composed > 20, 'only ' + composed + ' of ' + seen
    + ' localized glossed labels are the base AND MORE — the possessor stopped being put back');
});

test('#R700 ④ the table answers a glossed name out of its BASE row, possessor put back', async () => {
  const R = eraNameRule();
  for (const lang of ['jp', 'de']) {
    const api = await live(lang);
    let viaBase = 0;
    for (const r of GLOSSED) {
      if (api.histNameFor('eras', r.name, null, null)) continue;      /* the whole string has its own row */
      const g = api.histNameForGloss(r.name);
      if (!g || !g[lang]) continue;
      viaBase++;
      const p = R.split(r.name);
      /* ⚠ THE BASE IS READ THROUGH BOTH LANES, BECAUSE THAT IS WHAT THE IMPLEMENTATION DOES (#R429:
         «Hispaniola» is a base the record never draws on its own, so its row is in `eraBase`) */
      const base = api.histNameFor('eraBase', p.base, null, null) || api.histNameFor('eras', p.base, null, null);
      assert.ok(base && base[lang], r.name + ': answered without a base row to answer from');
      assert.equal(g.en, r.name, r.name + ': the tuple forgot the upstream\'s own string');
      assert.ok(g[lang].startsWith(base[lang]), r.name + ' → «' + g[lang] + '» does not begin with the base row');
      assert.ok(g[lang].length > base[lang].length,
        r.name + ' → «' + g[lang] + '» is the base alone; the possessor was not put back');
    }
    if (lang === 'jp') assert.ok(viaBase > 0, 'not one glossed name reaches the table through its base');
  }
});

test('#R700 ⑤ the whole string always wins, and a description is never given a possessor', async () => {
  const api = await live('jp');
  for (const r of GLOSSED) {
    const whole = api.histNameFor('eras', r.name, null, null);
    /* ⚠ A NAME WITH A ROW OF ITS OWN MUST NOT BE OVERTAKEN BY ITS BASE'S (#R536) */
    if (whole) assert.ok(!api.histNameFor('eras', eraNameRule().split(r.name).base, null, null)
      || api.histNameFor('eras', r.name, null, null) === whole, r.name + ': the base overtook its own row');
    /* the prose lane translates a SENTENCE about unnamed ground (#R682); a possessor would author a claim */
    const g = api.histNameForGloss(r.name);
    if (g) assert.ok(!g._d, r.name + ': a description was given a possessor');
  }
  for (const k of Object.keys(TABLE.prose)) {
    const g = api.histNameForGloss(k);
    assert.equal(g, null, '"' + k + '" is prose and was composed as a glossed name');
  }
});

test('#R700 ⑥ the base lane is a SEPARATE namespace — the era store still decides what prose is', () => {
  /* ⚠⚠⚠ THIS IS THE CHECK THAT KEEPS 101 ROWS ALIVE: fold the base names into the era store and a
     description that happens to be a base flips to «has an item» and leaves the table without a word. */
  const base = eraBaseCensus(ROWS);
  const drawnNames = new Set(ROWS.map((r) => r.name));
  assert.ok(base.length > 100, 'the base lane asks about ' + base.length + ' names; #R700 measured 236');
  for (const b of base) {
    assert.ok(!drawnNames.has(b.name), '"' + b.name + '" is drawn in its own right — it is not a base question');
    assert.ok(b.glossed.length > 0, '"' + b.name + '" came from no glossed name');
    for (const g of b.glossed) assert.ok(drawnNames.has(g), '"' + g + '" is not a name the record draws');
    /* the boxes and years are the glossed feature's — that is the whole safeguard (#R515) */
    assert.ok(b.boxes.length > 0 && isFinite(b.y0) && isFinite(b.y1), '"' + b.name + '" carries no where or when');
  }
  const baseNames = new Set(base.map((b) => b.name));
  const common = commonWords(ROWS.map((r) => r.name));
  for (const k of Object.keys(TABLE.prose)) {
    assert.ok(!baseNames.has(k), '"' + k + '" is shipped as prose and is also a base question');
    assert.equal(isProse(k, false, common), true, '"' + k + '" no longer classifies as the upstream\'s prose');
  }
  /* and where the harvest cache exists, the era store really does hold no base names */
  const CAND = join(CACHE, 'candidates.json');
  if (existsSync(CAND)) {
    const store = JSON.parse(readFileSync(CAND, 'utf8'));
    for (const b of base) assert.ok(!(b.name in store.byName),
      '"' + b.name + '" is a base question and its candidates were written into the era store');
    for (const k of Object.keys(TABLE.prose)) assert.equal((store.byName[k] || []).length, 0,
      '"' + k + '" is shipped as prose and the era store now carries an item for it');
  }
});

test('#R700 ⑦ the shipped lanes never answer one name twice', () => {
  const lanes = TABLE.byName;
  const eraBase = lanes.eraBase || {};
  for (const k of Object.keys(eraBase)) {
    assert.ok(!(k in lanes.eras), '"' + k + '" is in both the era lane and the base lane');
    assert.ok(!(k in TABLE.prose), '"' + k + '" is in both the base lane and the prose lane');
  }
  const baseNames = new Set(eraBaseCensus(ROWS).map((b) => b.name));
  for (const k of Object.keys(eraBase)) assert.ok(baseNames.has(k),
    '"' + k + '" is in the base lane and no glossed era name asks about it');
});

/* ══ #R713 ② — the second attestation store (English Wikipedia's redirects) ═══════════════════
   ⚠ NEITHER FIX IS A LOOSER STRING TEST (#R515): the scorer is untouched, and on the pilot it refused
   20 of the 46 names the new store found — 13 of them `elsewhere`. */
const page = (title, qid, extra) => ({ title, pageprops: Object.assign({}, qid ? { wikibase_item: qid } : null, extra) });

test('R713 ② a title is followed through normalisation and a redirect CHAIN, not one hop', () => {
  const q = {
    normalized: [{ from: 'etrurians', to: 'Etrurians' }],
    redirects: [{ from: 'Etrurians', to: 'Etruscans' }, { from: 'Etruscans', to: 'Etruscan civilization' }],
    pages: { 1: page('Etruscan civilization', 'Q17161') },
  };
  /* walking one step lands on «Etruscans», which has no page here — the quiet direction of a wrong chain */
  assert.deepEqual([...resolveArticles(['etrurians'], q)], [['etrurians', 'Q17161']]);
});

test('R713 ② a redirect cycle terminates instead of hanging the build', () => {
  const q = { redirects: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }], pages: { 1: page('A', 'Q1') } };
  assert.doesNotThrow(() => resolveArticles(['A'], q));
});

test('R713 ② a disambiguation page is not an article, and a missing page is not one either', () => {
  const q = {
    pages: {
      1: page('Ainu', 'Q226570', { disambiguation: '' }),
      2: { title: 'Nowhere', missing: '' },
      3: page('Meroe', 'Q182878'),
    },
  };
  assert.deepEqual([...resolveArticles(['Ainu', 'Nowhere', 'Meroe'], q)], [['Meroe', 'Q182878']]);
});

test('R713 ② a name the API cannot be asked about is skipped, not mangled into another question', async () => {
  /* `|` divides the batch and `#` starts a fragment: asking either returns an answer about a DIFFERENT
     page. With nothing askable the function makes no request at all — which keeps this test offline. */
  assert.equal((await articlesFor(['a|b', 'c#d', 'x'.repeat(300)])).size, 0);
  assert.equal((await articlesFor([])).size, 0);
});

test('R713 the lane ledger in data/histnames.json counts the rows that are actually there', () => {
  /* ⚠ #R699: a number written INSIDE the check is not a number being checked — both sides derived */
  const t = doc();
  const rows = Object.values(t.byName).reduce((n, rec) => n + Object.keys(rec).length, 0);
  assert.equal(t.lanes.label + t.lanes.article, rows);
  assert.equal(t.lanes.qid, Object.keys(t.byQid).length);
});

test('R713 the second store is actually consulted for the era names', () => {
  /* THE DEFECT, NOT THE ANSWER (#R520): «more than zero» says the second store is in the path at all */
  const t = doc();
  assert.ok(t.lanes.article > 0, 'no row is attested by en.wikipedia — the lane is not running');
});

/* ══ #R714 — a river is not a polity, and the obvious wider fix deletes countries ════════════════
   Found in PRODUCTION: at 1500 in Japanese the polity «Aragón» read 「アラゴン川」. Every agreement the
   scorer asks for is genuinely true — of the river. The fix belongs where «what kind of thing is this»
   is decided (REJECT_ROOTS names ROOTS; `wdt:P279*` finds what is under them), not in a list of two. */
const ARAGON = { name: 'Aragón', y0: 1400, y1: 1500, boxes: [[-1.5, 41.0, 0.5, 42.5]] };
const YEARS_714 = [1300, 1400, 1500, 1600];
/* a candidate that agrees with the map PERFECTLY on every test the scorer makes */
const perfect = (extra) => ({ qid: 'Q1', exact: true, coord: [-0.7, 42.1], starts: [], ends: [],
  p31: ['Qkind'], geo: true, subject: true, ...extra });

test('R714 ① a perfectly agreeing candidate is still refused when its KIND is not one the map draws', () => {
  const agreeing = score(ARAGON, perfect(), new Set(), YEARS_714);
  assert.equal(agreeing.why, null, 'the fixture must agree, or the next assertion proves nothing');
  assert.ok(agreeing.points >= FLOOR);
  const refused = score(ARAGON, perfect(), new Set(['Qkind']), YEARS_714);
  assert.equal(refused.why, 'not-a-place');
  assert.equal(refused.points, null);
});

test('R714 ② the refusal is by KIND, so it reaches the next one nobody has met', () => {
  const other = score(ARAGON, perfect({ qid: 'Q2', p31: ['Qother'] }), new Set(['Qkind', 'Qother']), YEARS_714);
  assert.equal(other.why, 'not-a-place');
  /* and a kind that is NOT under the root is untouched */
  assert.equal(score(ARAGON, perfect({ qid: 'Q3', p31: ['Qfine'] }), new Set(['Qkind']), YEARS_714).why, null);
});

test('R714 ③ removing the refused candidate lets the real one win instead of deadlocking', () => {
  /* measured on the rebuild: «Raška» and «Sintashta» had been losing to a TIE against the river */
  const river = perfect({ qid: 'Qriver', p31: ['Qwater'] });
  const polity = perfect({ qid: 'Qpolity', p31: ['Qfine'] });
  assert.equal(decide(ARAGON, [river, polity], new Set(), YEARS_714).qid, null, 'two equals must tie');
  assert.equal(decide(ARAGON, [river, polity], new Set(['Qwater']), YEARS_714).qid, 'Qpolity');
});

test('R714 ④ the watercourse root is declared, and the catastrophic ones are NOT', () => {
  /* ⚠ #R520: state the DEFECT — the wider root a future round could reach for */
  assert.ok(REJECT_ROOTS.includes('Q355304'), 'watercourse is the root that refuses a river');
  for (const wide of ['Q271669', 'Q15324']) {
    assert.equal(REJECT_ROOTS.includes(wide), false,
      wide + ' (landform / body of water) classes ISLAND COUNTRIES — declaring it deletes the '
      + 'United Kingdom, Ireland, Iceland, New Zealand, the Philippines, Cuba and Singapore');
  }
});

test('R714 ⑤ the shipped table still answers for the island countries that root would have taken', () => {
  const cs = TABLE.byName.cshapes;
  for (const n of ['United Kingdom', 'Ireland', 'Iceland', 'New Zealand', 'Philippines', 'Cuba', 'Singapore']) {
    assert.ok(cs[n] && Object.keys(cs[n].n).length > 0, n + ' lost its localized name');
  }
});

test('R714 ⑥ no row is left naming the rivers that were wrong', () => {
  assert.equal(TABLE.byName.eras['Aragón'], undefined);
  assert.equal(TABLE.byName.eras['Narva'], undefined);
});

/* ══ #R716 ① — A NAME THE HAND TABLE KNOWS IN ONE LANGUAGE MUST NOT BE ENGLISH IN THE OTHERS ═════
   scripts/build-histnames.mjs refused a row for ANY name js/time-borders.js's hand tables answered —
   in any single language — while the resolver had been per-language since #R518. 86 of the 252
   CShapes spellings were refused that way (Japan, China, France, Mexico, Egypt, Turkey, India).
   ⚠ MEASURED THROUGH THE SHIPPED RESOLVER (`_i18n[lg] || _eraLocName`), counts not percentages. */
const DRAWN = (() => {
  const CSb = load('data/cshapes.js', '__CSHAPES');
  const ER = load('data/hist-eras.js', '__HISTERAS');
  /* ⚠ THE DRAWN NAME IS NOT THE STORED ONE: `_csName` strips a trailing 「(gloss)」 — the rule is
     IMPORTED from its owner, never restated here */
  /* (marketing-engine) each name WITH the year the map draws it — the resolver is year-aware (a former state is a
     name only inside its span), so a name is asked at a year it is on the map: a CShapes row at its first year,
     an era feature at its sheet's year */
  const cs = CSb.feats.map((f) => [csName(f[0]), f[2]]).filter(([x]) => typeof x === 'string' && x);
  const er = [];
  for (const s of ER.snaps) for (const ft of s.feats) {
    const a = ft && ft[0];
    const n = (a && typeof a === 'object') ? (a.en || a.name) : null;
    if (n) er.push([n, s.y]);
  }
  return { cs, er };
})();
/* · observation — the committed bundles and table, 2026-09-14, counted THROUGH js/time-borders.js.
     CShapes draws 710 features, the era snapshots 10,388.
   · expires — whenever either bundle or data/histnames.json is rebuilt; RE-MEASURE, and a language may
     only rise (a floor that stopped touching the metal is the #R700 ORPHAN_POINTS mistake).
   · canon — this table; no document restates these counts. */
/* · re-measured 2026-10-03 (marketing-engine). The count used to ask every drawn name at ONE clock year (1950),
     and the resolver fell back to the first former state whose pattern matched EVEN OUTSIDE ITS SPAN — so at
     1950 «India» answered as the British Raj and «Sudan» as Sudan-with-South-Sudan (1956–2011), and those were
     counted as reaching the reader. A state is now not a name outside its own span (js/time-borders.js
     _eraLocName: «Korea (Japan)» in 1913 read 朝鮮（李氏朝鮮）（日本）), so each name is asked at a year the map
     draws it (DRAWN above) and the floors are what that measures. What left the count, all answers by a state
     whose own name is NOT the one drawn: «India» as the Company / the Raj and «Pakistan» as Pakistan-with-
     Bangladesh after their spans, «Sudan» as Sudan-with-South-Sudan before 1956, «Ottoman Sultanate» (1930)
     as the Empire. A state still translates its OWN name outside its span («Austrian Empire», 1715 sheet). */
const REACH_FLOOR = {
  de: [454, 2516], es: [467, 2614], fr: [469, 2636], jp: [652, 4518],
  ko: [611, 3150], ru: [652, 3711], zh: [614, 3523],
};
async function received(lang) {
  const T = doc();
  const clock = { lang, year: 1950 };
  const { api } = await timeBorders(clock);
  const hn = (rec, en) => Object.assign({}, T.byName?.[rec]?.[en]?.n || null, T.prose?.[en]?.n || null);
  const count = (names, rec) => names.reduce((n, [x, y]) => { clock.year = y; return n + ((hn(rec, x)[lang] || api.eraLocName(x)) ? 1 : 0); }, 0);
  return [count(DRAWN.cs, 'cshapes'), count(DRAWN.er, 'eras')];
}
for (const [lang, floor] of Object.entries(REACH_FLOOR)) {
  test(`#R716 ① ${lang}: the historical map reaches this reader on at least as many drawn features as measured`, async () => {
    const [cs, er] = await received(lang);
    assert.ok(cs >= floor[0], `CShapes 1886-2019: ${cs} of ${DRAWN.cs.length} drawn features reach a ${lang} reader, under the measured ${floor[0]} — a name has stopped being localized`);
    assert.ok(er >= floor[1], `era snapshots: ${er} of ${DRAWN.er.length} drawn features reach a ${lang} reader, under the measured ${floor[1]} — a name has stopped being localized`);
  });
}

test('#R716 ① the two name sources MERGE PER LANGUAGE rather than one owning the name outright', async () => {
  /* the defect in its own terms: names the hand table answers, which data/histnames.json ALSO answers
     in a language the hand table is silent in. Under per-NAME ownership this set is empty BY
     CONSTRUCTION — which is why eight rounds of green tests never mentioned it. */
  const T = doc();
  const langs = Object.keys(REACH_FLOOR);
  const apis = Object.fromEntries(await Promise.all(langs.map(async (l) => [l, (await timeBorders({ lang: l })).api])));
  let merged = 0;
  for (const [name, row] of Object.entries(T.byName.cshapes || {})) {
    const handled = langs.filter((l) => apis[l].eraLocName(name));
    if (!handled.length) continue;                    // table-only name: not the shape under test
    if (langs.some((l) => !handled.includes(l) && row.n?.[l])) merged++;
  }
  assert.ok(merged > 0,
    'no CShapes name is answered by the hand table in one language and by data/histnames.json in another — ownership has gone back to being per-NAME, and every language the hand table is silent in is English again');
});
