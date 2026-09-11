/* ============================================================================
 *  IntMap · #R689 — the coverage #R679 left in numbers, and the credit it left unpaid
 * ----------------------------------------------------------------------------
 *  #R679 took the clock down to astronomical year −122 999 and grew the historical-city record
 *  from 611 handwritten cities to 4 011. It closed with three holes stated as numbers rather than
 *  filled in, and this round measured all three again before touching any of them.
 *
 *   ① THE MEDIEVAL GAP WAS AN ARTEFACT OF HOW OHM WAS MEASURED, not of what OHM holds. See
 *      scripts/histcities/harvest.mjs §5b: the era nodes are jittered, not stacked (80.1% of a
 *      QID's nodes are 1–110 m apart and only 4.2% share a coordinate), so an identity test
 *      written on exact equality measures its own tolerance; and OHM chains a succession as
 *      `1852..1853` then `1853..1889`, so a closed-interval overlap test calls a clean chain dirty.
 *   ② THE OPEN STARTS CANNOT BE BOUNDED FROM UPSTREAM, and that was measured rather than assumed.
 *      Of the 1 869 cities whose only evidence is a span that never says when its name began,
 *      Wikidata's inception (P571) covers 907 and its «earliest written record» (P1249) 242 — and
 *      where both exist the inception contradicts the record 3.1% of the time, because on a
 *      merged municipality it dates the legal entity and not the place (saitama 2001 against a
 *      span that ends 2000; kitakyushu 1963 against 1962). Clipping to it would write a year
 *      nobody recorded. ⇒ retained without invented dates; ⑤ now requires visible uncertainty in the runtime.
 *   ③ THE READABILITY DEFECT IS DOWNSTREAM OF ②. See ⑥.
 *
 *  ⚠ AND ON THE WAY, THE THING #R679 WROTE DOWN AND DID NOT DO: Pleiades is CC BY 3.0, its
 *  generated record file says in so many words «sources.html must name Pleiades and its
 *  contributors», and no reader-facing page named Pleiades anywhere. ①–④ here are about the
 *  structure that let a licence be a sentence instead of a value.
 * ==========================================================================*/
import { test } from 'node:test';
import vm from 'node:vm';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIC } from '../scripts/histcities/lang.mjs';
import { loadRecord } from '../scripts/histcities-record.mjs';
import { pageCodes, pageDoc } from '../scripts/i18n-pages-audit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const RECORD = JSON.parse(read('data/hist-cities.json'));

/* ── ① A LICENCE IS A VALUE, AND IT REFUSES THE READINGS THAT LET #R679 THROUGH ─────────────
   ⚠ THE FUNCTION IS EVALUATED, not read (#R505). What is asserted is what LIC() DECIDES. */
test('r681 ① LIC() refuses a licence that does not say what it costs', () => {
  const ok = { publisher: 'Upstream', licence: 'CC BY 4.0', url: 'https://example.invalid/', attribution: true, source: 'Upstream (CC BY 4.0)', read: '2026-09-11' };
  assert.doesNotThrow(() => LIC(ok));
  /* «attribution» may not be left out, and may not be a guess */
  assert.throws(() => LIC({ ...ok, attribution: undefined }), /true or false/);
  assert.throws(() => LIC({ ...ok, attribution: 'probably' }), /true or false/);
  /* a licence that owes credit must name the row that pays it — that is the whole gate */
  assert.throws(() => LIC({ ...ok, source: undefined }), /source/);
  /* …and one that owes none may not pretend to be paid by a row */
  assert.throws(() => LIC({ ...ok, attribution: false }), /owes no attribution/);
  /* the date the licence text was read is part of the reading */
  assert.throws(() => LIC({ ...ok, read: 'recently' }), /ISO date/);
  assert.throws(() => LIC({ ...ok, url: '' }), /url/);
});

/* ── ② …AND IT SURVIVES ITS OWN SERIALISATION ────────────────────────────────────────────────
   The declaration is written into the generated record file with JSON.stringify and read back by
   the loader. The first draft of the «owes no attribution names no row» rule tested
   `source !== undefined`, and the round trip turns «absent» into «''» — so the rule fired on the
   very file it was written to describe. A rule that cannot survive its own serialisation is not
   a rule about the world. */
test('r681 ② a LIC() declaration round-trips through JSON', () => {
  for (const src of [
    { publisher: 'Alpha', licence: 'CC0 1.0', url: 'https://example.invalid/a', attribution: false, read: '2026-01-01' },
    { publisher: 'Beta', licence: 'CC BY 3.0', url: 'https://example.invalid/b', attribution: true, source: 'Beta (CC BY 3.0)', read: '2026-01-01' },
  ]) {
    const once = LIC(src);
    const twice = LIC(JSON.parse(JSON.stringify(once)));
    assert.deepEqual({ ...twice }, { ...once }, `${src.publisher} does not survive being written out and read back`);
  }
});

/* ── ③ EVERY DERIVED RECORD FILE DECLARES WHOSE ROWS THOSE ARE ───────────────────────────────
   ⚠ THE UNIVERSE IS THE RECORD, NOT A LIST OF FILENAMES. loadRecord() asks each row whether it is
   derived, so a fourth upstream is covered on the day somebody harvests it (#R429). */
test('r681 ③ a file whose rows are somebody else’s says whose, and a handwritten one claims nobody', async () => {
  const { rows, licences } = await loadRecord();
  const derivedFiles = new Set(rows.filter((r) => r.derived).map((r) => r._file));
  const declared = new Set(licences.map((l) => l._file));
  assert.deepEqual([...derivedFiles].sort(), [...declared].sort(),
    'a record file holds harvested rows and declares no LICENCE, or declares one and holds none');
  assert.ok(licences.length >= 2, `only ${licences.length} upstream(s) declare a licence`);
  for (const l of licences) {
    assert.match(l.read, /^\d{4}-\d{2}-\d{2}$/, `${l._file}: no date for when the licence was read`);
    assert.ok(/^https?:\/\//.test(l.url), `${l._file}: the licence url is not a url`);
  }
});

/* ── ④ …AND THE READER IS TOLD, IN ALL NINE LANGUAGES ────────────────────────────────────────
   This is the shipped-artifact half of the gate scripts/build-hist-cities.mjs runs over the
   record. That one asks «does the registry carry the row»; this asks «does the reader get a
   page», which is the thing the licence actually requires and the thing that was missing. */
test('r681 ④ every upstream that is owed credit is named on the Sources page, in every language', () => {
  assert.ok(Array.isArray(RECORD.rights) && RECORD.rights.length,
    'data/hist-cities.json no longer carries the licences of what is inside it');
  const registry = read('js/reference-data.js');
  const owed = RECORD.rights.filter((r) => r.attribution);
  assert.ok(owed.length >= 1, 'no shipped upstream owes attribution — has the record stopped carrying Pleiades?');
  const codes = pageCodes();
  assert.equal(codes.length, 9, `the app has ${codes.length} languages, not nine`);
  for (const r of owed) {
    /* the publisher is named in the registry… */
    const stem = r.publisher.split(' (')[0];
    assert.ok(registry.includes(stem), `js/reference-data.js does not name ${stem}, whose ${r.licence} makes credit a condition`);
    /* …and every language has prose for the row, not just English */
    const en = pageDoc('en');
    const key = [...en.keys()].find((k) => k.startsWith('sourceUse.') && k.includes(stem));
    assert.ok(key, `pages.en.js has no Sources-page description naming ${stem}`);
    for (const c of codes) {
      const doc = pageDoc(c.html);
      assert.ok(doc && doc.get(key), `pages.${c.html}.js has no description at ${key} — ${stem}'s credit is English-only for that reader`);
    }
  }
});

/* ── ⑤ UNKNOWN STARTS REMAIN EVIDENCE, WITH VISIBLE UNCERTAINTY ────────────────────────
   The old absolute count rejected distant namesakes becoming reachable even though their
   evidence was unchanged. The contract is now observable: every open-start winning name
   carries its uncertainty in both MapLibre and the lookup API, never in the source name. */
test('r705 ⑤ unknown starts are disclosed by the actual map expression and lookup API', async () => {
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' },
    fetch: async () => ({ ok: true, json: async () => RECORD }) });
  ctx.window = ctx;
  vm.runInContext(asClassicScript(read('js/hist-scale.js')), ctx);
  let date;
  ctx.IntMapTime = { isLive: () => false, when: () => date, on: () => {} };
  vm.runInContext(asClassicScript(read('js/hist-cities.js')), ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  let checked = 0;
  const before = JSON.stringify(RECORD);
  for (const year of [ctx.IntMapHistScale.FLOOR, 1500, 1900]) {
    date = new Date(0); date.setUTCFullYear(year, 5, 15);
    const stamp = year * 10000 + 615;
    const expression = api.textField(['get', 'name'], 'en', 'ui');
    const parsed = createExpression(expression, { type: 'string', 'property-type': 'data-driven',
      expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
    if (parsed.result !== 'success') assert.fail(parsed.value.map(e => e.message).join('\n'));
    for (const c of RECORD.cities) {
      for (const e of c.e) if (!e.f) assert.equal(e.p[0], '-', `${c.id}: unknown precision retained`);
      const era = c.e.find(e => (!e.f || stamp >= e.f) && (!e.t || stamp <= e.t));
      if (!era) continue;
      const expected = era.n.en + (era.f ? '' : ' [?]');
      assert.equal(api.at(c.k[0], c.lon, c.lat, 'en'), expected, `${c.id}: lookup at ${year}`);
      const z = 14, n = 2 ** z, r = c.lat * Math.PI / 180;
      const sx = (c.lon + 180) / 360 * n;
      const sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
      const x = Math.floor(sx), y = Math.floor(sy);
      const feature = { type: 1, properties: { name: c.k[0] },
        geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] };
      assert.equal(parsed.value.evaluate({ zoom: z }, feature, {}, { z, x, y }), expected, `${c.id}: map at ${year}`);
      if (!era.f) checked++;
    }
  }
  assert.ok(checked > 2000, 'exercise the actual unknown-start corpus');
  assert.equal(JSON.stringify(RECORD), before, 'uncertainty is display metadata, never a fabricated source name');
});

/* ── ⑥ THE READABILITY DEFECT IS DOWNSTREAM OF ⑤, AND THIS IS THE MEASUREMENT THAT SAYS SO ────
 *  #R679 tried three ways to stop a dated-but-untranslated span hiding a nine-language one, and
 *  turned all three down. Re-measured this round over 1 049 sampled instants and all 4 011 cities:
 *  ordering by attestation instead cuts «the winning span has no form in the reader's language
 *  while another covering span does» from 16 163 answers to 448 for an English reader — and costs
 *  21 answers in which an undated span reaches a year earlier than any dated evidence the city
 *  has. Twenty-one against fifteen thousand looks like an easy trade and it is not: those 21 are
 *  «Constantinople in 300 BC», which is FALSE, against fifteen thousand that are merely hard to
 *  read. What makes the trade unbuyable is ⑤ — an open start with no evidence behind it cannot be
 *  ranked below anything, because nothing knows where it begins.
 *  ⚠ SO WHAT IS ASSERTED HERE IS THE CONNECTION, not the choice: for a city that HAS dated
 *  evidence, the ordering already answers with it, and the residue is exactly the cities that have
 *  none. If that stops being true, the trade is worth re-measuring. */
test('r681 ⑥ where a city has dated evidence, the dated evidence is what answers', () => {
  const covers = (e, d) => (!e.f || d >= e.f) && (!e.t || d <= e.t);
  let checked = 0, wrong = [];
  for (const c of RECORD.cities) {
    const dated = c.e.filter((e) => e.f);
    if (!dated.length) continue;
    for (const e of dated) {
      /* the middle of a span it states — the one instant its own evidence certainly covers */
      const y = Math.trunc(e.f / 10000);
      const d = y * 10000 + 701 <= e.t && y * 10000 + 701 >= e.f ? y * 10000 + 701 : e.f;
      const first = c.e.find((x) => covers(x, d));
      checked++;
      if (first && !first.f) wrong.push(`${c.id} @ ${d}: «${first.n.en}» has no stated start and answers over dated «${e.n.en}»`);
    }
  }
  assert.ok(checked > 2000, `only ${checked} dated spans to check`);
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} dated spans are hidden by an undated one`);
});

/* ── ⑦ …AND THE ANSWER TO ⑥ IS THAT THE SPANS SHARE COLUMNS, NOT THAT THEY SWAP PLACES ───────
 *  scripts/build-hist-cities.mjs lets two spans of one city that state THE SAME NAME use each
 *  other's language forms. Measured over 1,634 instants: answers whose winning span has no form in
 *  the reader's language while another covering span does fell from 324,259 to 107,930, and every
 *  one of the 216,329 is a case where the two spans were saying the same thing in two scripts.
 *  ⚠ WHAT IS ASSERTED IS THAT NOTHING MOVED. The pass may not change which span answers a year,
 *  so the shipped record must still be ordered exactly as ⑥ requires — and Volgograd, which is the
 *  case the pass was written for, must read the dated span WITH the readable name. */
test('r681 ⑦ a dated span carries the name the record holds in the reader’s language', () => {
  const v = RECORD.cities.find((c) => c.id === 'volgograd');
  assert.ok(v, 'volgograd left the record');
  const en = RECORD.langs.indexOf('en');
  const at1700 = v.e.find((e) => (!e.f || 17000701 >= e.f) && 17000701 <= e.t);
  assert.ok(at1700, 'nothing in the record answers for Volgograd in 1700');
  assert.ok(at1700.f, 'the 1700 answer for Volgograd comes from a span with no stated start again');
  assert.ok((at1700.a >> en) & 1, `the 1700 answer «${at1700.n.en}» is not attested in English`);
  assert.equal(at1700.n.en, 'Tsaritsyn');
  assert.equal(at1700.n.ru, 'Царицын');
  /* …and globally: a span may not claim a language it has no form for */
  let empty = 0;
  for (const c of RECORD.cities) for (const e of c.e) for (const [i, l] of RECORD.langs.entries()) {
    if (((e.a >> i) & 1) && !e.n[l]) empty++;
  }
  assert.equal(empty, 0, `${empty} spans claim a language they hold no string for`);
});

/* ── ⑧ THE MEDIEVAL GAP #R679 LEFT AS A NUMBER ──────────────────────────────────────────────
 *  106 spans ended between AD 1000 and 1499 and 289 between 1000 and 1799. OpenHistoricalMap —
 *  the upstream #R679 measured and turned down — took those to 452 and 929. This is the ratchet
 *  the other way round: coverage of the centuries the record was silent about may not quietly
 *  fall back to what it was. */
test('r681 ⑧ the medieval and early-modern centuries are covered', () => {
  const end = (e) => Math.trunc(e.t / 10000);
  const spans = RECORD.cities.flatMap((c) => c.e);
  const med = spans.filter((e) => end(e) >= 1000 && end(e) <= 1499).length;
  const early = spans.filter((e) => end(e) >= 1000 && end(e) <= 1799).length;
  assert.ok(med >= 388, `${med} spans end between AD 1000 and 1499 — was 106 before OpenHistoricalMap, 388 after`);
  assert.ok(early >= 827, `${early} spans end between AD 1000 and 1799 — was 289 before OpenHistoricalMap, 827 after`);
  const ohm = RECORD.cities.filter((c) => c.s === 'o');
  assert.ok(ohm.length >= 2211, `${ohm.length} cities come from OpenHistoricalMap`);
  /* ⚠ AND EVERY ONE OF ITS SPANS SAYS WHEN IT BEGAN. 57 of OHM's ended names carry no start date,
     and the harvest leaves them out rather than adding to the 2,288 claims nobody can bound (⑤). */
  const open = ohm.flatMap((c) => c.e).filter((e) => !e.f);
  assert.deepEqual(open.map((e) => e.n.en).slice(0, 5), [],
    `${open.length} OpenHistoricalMap spans ship with no stated start`);
});
