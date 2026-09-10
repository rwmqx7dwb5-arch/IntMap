/* ============================================================================
 *  IntMap · #R686 — the deep past, named in nine languages
 * ----------------------------------------------------------------------------
 *  data/hist-eras.js draws every polity before 1850 and names all of them in English only, so
 *  this round put a second lane beside it (data/histeras-names.json — moved to data/histnames.json by #R695) and a rule that decides what
 *  may go into that lane (scripts/histeras/match.mjs). What is measured here is the RULE and the
 *  SHIPPED TABLE, both by evaluation:
 *    · the rule, because #R515 was a rule that took a ranker's first hit, and a rule that cannot
 *      be run cannot be shown to refuse anything;
 *    · the table, because it is keyed by another file's strings, and two files keyed to each
 *      other part company silently (#R500);
 *    · and the two of them against the HAND-WRITTEN tables inside js/time-borders.js, because a
 *      name answered in two places is one judgement in two places (#R536).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle, boxDistance, lonGap } from '../scripts/histeras/census.mjs';
import { score, decide, labelsFor, plainLabel, timeSlack, wdYear, yearGap, LANG_SOURCES, REJECT } from '../scripts/histeras/match.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚠ (#R695) THE FILE MOVED AND GREW. #R686 shipped data/histeras-names.json, which answered
   for one record; the table now answers for all three (data/histnames.json), so the rows this
   round's ten checks are about are `byName.eras`. Every assertion below is #R686's, unchanged in
   what it demands — only where it reads from moved. */
const NAMES = join(ROOT, 'data', 'histnames.json');
const eraRowsOf = (doc) => doc.byName.eras;
const NONE = new Set();
const INTERNAL = new Set(['Q4167410']);            /* Wikimedia disambiguation page */

/* a row shaped like the map's: one shape around the Aegean, drawn at 323 BC */
const ROW = { name: 'Test Polity', n: 1, snaps: ['bc323'], y0: -322, y1: -322, boxes: [[20, 34, 28, 41]] };
/* the record's own frames — the time slack is READ from these, never typed in */
const YEARS = eraBundle(ROOT).snaps.map((s) => s.y);
const cand = (o) => ({ qid: 'Q1', exact: true, coord: null, starts: [], ends: [], p31: [], geo: true, ...o });

test('① a disambiguation page is not a polity — the class rejects it outright', () => {
  const v = score(ROW, cand({ p31: ['Q4167410'] }), INTERNAL, YEARS);
  assert.equal(v.why, REJECT.INTERNAL);
  assert.equal(v.points, null);
  /* measured on the first sweep: 353 of 1,335 exact English-title matches were this class, and
     "Ainu" was one of them (Q226570, Korean label «아이누 (동음이의)») */
  assert.equal(score(ROW, cand({ p31: ['Q4167410'] }), NONE, YEARS).why, null,
    'the class set is DERIVED from Wikidata, not written here — an empty set must reject nothing');
});

test('② a stated coordinate must be INSIDE a shape the map draws — no tolerance band', () => {
  const near = score(ROW, cand({ coord: [24, 38] }), NONE, YEARS);     /* inside the shape */
  assert.equal(near.space, 0);
  assert.equal(near.why, null);
  for (const [lon, lat, what] of [[121, 14, 'Luzon'], [30, 38, 'just east of the box'], [24, 42, 'just north of it']]) {
    const v = score(ROW, cand({ coord: [lon, lat] }), NONE, YEARS);
    assert.equal(v.why, REJECT.SPACE, what + ' is not inside the shape and must be refused');
    assert.ok(v.space > 0);
  }
});

test('③ the clock is asked at the record’s own resolution, not at a flat number', () => {
  const then = score(ROW, cand({ starts: ['-000400-00-00T00:00:00Z'], ends: ['-000200-00-00T00:00:00Z'] }), NONE, YEARS);
  assert.equal(then.time, 0);
  assert.equal(then.why, null);
  const modern = score(ROW, cand({ starts: ['+1960-00-00T00:00:00Z'] }), NONE, YEARS);
  assert.equal(modern.why, REJECT.TIME);
  assert.equal(wdYear('-000400-00-00T00:00:00Z'), -400);
  assert.equal(wdYear('+1960-01-01T00:00:00Z'), 1960);
  assert.equal(yearGap(1960, Infinity, -322, -322), 2282);
  /* ⚠ THE SLACK IS THE SNAPSHOT SPACING, so it is decades around 1492 and millennia before the
     common era — the measured failure of a flat 400 years was CHEYENNE, WYOMING (founded 1867)
     answering for the Cheyenne at 1492, a gap of 375. */
  const AT1492 = { ...ROW, y0: 1492, y1: 1492 };
  assert.equal(timeSlack(AT1492, YEARS), 92);
  assert.equal(score(AT1492, cand({ coord: [24, 38], starts: ['+1867-00-00T00:00:00Z'] }), NONE, YEARS).why, REJECT.TIME);
  const DEEP = { ...ROW, y0: -122999, y1: -122999 };
  assert.ok(timeSlack(DEEP, YEARS) > 100000, 'and the deepest frame has no neighbour within a hundred millennia');
});

test('④ two candidates that agree equally well decide nothing', () => {
  const a = cand({ qid: 'Q1', coord: [24, 38] });
  const b = cand({ qid: 'Q2', coord: [25, 39] });
  assert.equal(decide(ROW, [a, b], NONE, YEARS).why, REJECT.TIE);
  /* one of them agreeing on the century as well breaks the tie */
  const c = { ...b, starts: ['-000400-00-00T00:00:00Z'], ends: ['-000200-00-00T00:00:00Z'] };
  assert.equal(decide(ROW, [a, c], NONE, YEARS).qid, 'Q2');
});

test('⑤ a lone candidate is taken only when it is a place at all', () => {
  assert.equal(decide(ROW, [cand({ geo: true })], NONE, YEARS).qid, 'Q1');
  assert.equal(decide(ROW, [cand({ geo: false })], NONE, YEARS).why, REJECT.BARE);
  assert.equal(decide(ROW, [cand({ geo: true, exact: false })], NONE, YEARS).why, REJECT.BARE,
    'an ALIAS with nothing else agreeing is not an identification');
});

test('⑥ the antimeridian is not a distance — Fiji is not 173° wide', () => {
  const fiji = [176, -20, -178, -16];                   /* crosses 180 */
  assert.equal(boxDistance(fiji, 179, -18), 0);
  assert.equal(boxDistance(fiji, -179, -18), 0);
  assert.equal(lonGap(179, -179), 2);
  assert.equal(lonGap(-179, 179), 2);
  assert.ok(boxDistance(fiji, 0, -18) > 100, 'and Africa is still far from Fiji');
});

test('⑦ the bare zh is SIMPLIFIED, and the language list is the app registry', () => {
  assert.ok(LANG_SOURCES['zh-hans'].includes('zh'), "Wikidata's bare zh is Simplified — it feeds zh-hans");
  assert.ok(!LANG_SOURCES.zh.includes('zh'), "IntMap's zh is Traditional and must not take Wikidata's bare zh");
  assert.deepEqual(LANG_SOURCES.zh, ['zh-hant', 'zh-tw', 'zh-hk']);
  assert.deepEqual(LANG_SOURCES.jp, ['ja']);
  const codes = JSON.parse(/\[[^\]]*\]/.exec(readFileSync(join(ROOT, 'js', 'locales', '_langs.js'), 'utf8'))[0]);
  assert.deepEqual(Object.keys(LANG_SOURCES).sort(), codes.slice().sort(),
    'a language added to js/locales/ must be answered here, not silently skipped');
  assert.deepEqual(labelsFor({ labels: { ja: 'エラム', zh: '埃兰', en: 'Elam' } }), { en: 'Elam', jp: 'エラム', 'zh-hans': '埃兰' });
});

test('⑧ the shipped table is keyed to the bundle it names', () => {
  assert.ok(existsSync(NAMES), 'data/histnames.json is missing');
  const doc = JSON.parse(readFileSync(NAMES, 'utf8'));
  const rows = census(eraBundle(ROOT));
  const known = new Set(rows.map((r) => r.name));
  const keys = Object.keys(eraRowsOf(doc));
  assert.ok(keys.length > 0);
  for (const k of keys) assert.ok(known.has(k), `data/histnames.json names "${k}" as an era polity, which data/hist-eras.js does not draw`);
  for (const [k, rec] of Object.entries(eraRowsOf(doc))) {
    assert.match(rec.q, /^Q\d+$/);
    assert.ok(!('en' in rec.n), `"${k}" carries an English name — English is the upstream's`);
    for (const [lg, v] of Object.entries(rec.n)) {
      assert.ok(doc.langs.includes(lg), `"${k}" carries "${lg}", which is not an app language`);
      assert.notEqual(v, k, `"${k}" repeats the English in ${lg} — such a row says nothing`);
      assert.ok(!v.includes('�'), `"${k}" carries U+FFFD in ${lg}`);
    }
  }
  /* ⚠ AND NO LANGUAGE MAY BE CLAIMED THAT NOBODY WROTE. The mask says which languages a source
     attested; a Chinese sibling converted from the other orthography is a name to read, not a
     second attestation, so `a` can only ever be a subset of what Wikidata carried. */
  const bit = (lg) => 1 << doc.mask.indexOf(lg);   /* (#R695) the mask counts in the app registry's order, not the shipped one */
  assert.equal(Object.values(eraRowsOf(doc)).filter((r) => r.a & bit('en')).length, 0,
    'no row may claim an English attestation');
});

test('⑨ no era name is answered twice — the bundled lane and the hand tables are disjoint', () => {
  const doc = JSON.parse(readFileSync(NAMES, 'utf8'));
  const clash = {};
  for (const lg of doc.langs) {
    if (lg === 'en') continue;
    const { api } = timeBorders({ lang: lg });
    const both = Object.entries(eraRowsOf(doc)).filter(([k, r]) => r.n[lg] && api.eraLocName(k)).map(([k]) => k);
    if (both.length) clash[lg] = both.slice(0, 8);
  }
  assert.deepEqual(clash, {},
    'a name localized by BOTH data/histnames.json and the tables in js/time-borders.js has two '
    + 'answers, and only one of them can ever be read (#R536). Drop it from the built table.');
});

test('⑩ a bracketed qualifier is a disambiguation, and no shipped name carries one', () => {
  for (const s of ['Montana (New Jersey)', 'Blackfoot (Montana)', '아이누 (동음이의)', 'Ainu（曖昧さ回避）', 'Arran (Azerbaïdjan)']) {
    assert.equal(plainLabel(s), false, JSON.stringify(s) + ' is Wikidata disambiguating, not a map label');
  }
  for (const s of ['Kalmar Union', 'ヴェネツィア', '新羅', 'Khanat der Krim']) assert.equal(plainLabel(s), true);
  const doc = JSON.parse(readFileSync(NAMES, 'utf8'));
  const bad = [];
  for (const [k, rec] of Object.entries(eraRowsOf(doc))) {
    for (const [lg, v] of Object.entries(rec.n)) if (!plainLabel(v)) bad.push(k + ' [' + lg + '] ' + v);
  }
  assert.deepEqual(bad, [], 'a map label has no room to carry a disambiguation');
});
