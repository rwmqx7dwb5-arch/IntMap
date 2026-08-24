#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-cities.json — the name a city carried in the year on the clock   (#R427)
 * ----------------------------------------------------------------------------
 *  「都市名ラベルも同じ要領で（Chronos に）対応するように。」 The country labels have travelled
 *  in time since #R94k; scripts/histcities/*.mjs is the same record for SETTLEMENTS, and this
 *  turns it into the one file the app fetches.
 *
 *  ══ WHY THERE IS A BUILD AT ALL, WHEN THE RECORD IS ALREADY DATA ═══════════════════════════
 *  Because two things have to be PROVEN and neither of them is visible in the source:
 *
 *   ① A KEY MUST NAME ONE PLACE ON EARTH. The label is rewritten by matching the vector tile's
 *      own `name:en` / `name`, so a key that another populated place also carries would rename
 *      THAT city too — «Alexandria» in 1850 would relabel Alexandria, Virginia. Every key is
 *      resolved against data/gazetteer-world.json.gz (GeoNames cities1000 + alternate names):
 *      it must land within 40 km of the row's own coordinate, and any OTHER settlement of
 *      20 000 people or more carrying the same spelling fails the build. An exception is
 *      declared by ending the key with «!», which leaves the reason at the row.
 *   ② A COORDINATE MUST BE THE PLACE IT CLAIMS. The same lookup checks the country: a row whose
 *      gazetteer match sits in a different ISO-3166 country than the row declares is a typo, and
 *      the build says which.
 *
 *  ⚠ AND THE COMMITTED FILE IS RE-DERIVED, byte for byte, by `--check` (npm run check:histcities,
 *  inside `npm test`) — so data/hist-cities.json cannot drift away from the record in
 *  scripts/histcities/ without CI noticing, the same rule scripts/build-wars.mjs follows.
 *
 *      node scripts/build-hist-cities.mjs            # write data/hist-cities.json
 *      node scripts/build-hist-cities.mjs --check    # re-derive and compare; exit 1 on any drift
 *      node scripts/build-hist-cities.mjs --report   # the coverage table, per language
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'scripts', 'histcities');
const OUT = join(ROOT, 'data', 'hist-cities.json');
const GAZ = join(ROOT, 'data', 'gazetteer-world.json.gz');

/* the nine language codes, in js/lang-registry.js's own spelling (see scripts/histcities/lang.mjs) */
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];
const AMBIG_POP = 20000;      /* a settlement this big can carry a label at the zooms ofm-city draws */
const NEAR_KM = 40;           /* «the gazetteer's row for this key is this city» */
/* ⚠⚠⚠ (#R409's LESSON, ONE FILE OVER) A ROW THAT CANNOT REACH THE SCREEN IS NOT A SMALLER ROW —
   it is indistinguishable, in the source, from a row that works. #R409 shipped a war event dated
   thirty days before its layer's window and nothing said so for a whole round. The clock's floor is
   1850 (js/chronos.js `YMIN`), so a span that ENDS before it can never be displayed by anything,
   and the honest answer is to say so at build time rather than to carry it. */
const CLOCK_FLOOR = 1850;

const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--report') ? 'report' : 'write';

/* ── the record ─────────────────────────────────────────────────────────────────────────────── */
const REGIONS = readdirSync(SRC_DIR).filter((f) => f.endsWith('.mjs') && f !== 'lang.mjs').sort();
const rows = [];
for (const f of REGIONS) {
  const m = await import(new URL('./histcities/' + f, import.meta.url).href);
  if (!Array.isArray(m.ROWS)) fail(`scripts/histcities/${f} exports no ROWS array`);
  for (const r of m.ROWS) rows.push(Object.assign({ _file: f }, r));
}

const problems = [];
const warnings = [];
function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

/* ── ①/② the gazetteer, as a spelling → settlements index ──────────────────────────────────── */
const gaz = JSON.parse(gunzipSync(readFileSync(GAZ)).toString('utf8'));
const gIdx = new Map();
/* ⚠ WHICH FIELD MATCHED IS PART OF THE FINDING. GeoNames' `alt` list mixes other languages with
   FORMER names — «Кировск» is in Holubivka's alt list because that is what Holubivka was called
   until 2016 — and a former name is not what OpenMapTiles carries in `name` / `name:en` today. A
   collision on the PRIMARY name is a live mistranslation waiting to happen; a collision that only
   exists in `alt` may be one, and has to be read. Both stop the build; only one of them is usually
   a real defect, and the message says which it is so the row's «!» can carry a real reason. */
const push = (name, rec, field) => { if (!name) return; let a = gIdx.get(name); if (!a) gIdx.set(name, (a = [])); a.push(Object.assign({ field }, rec)); };
for (const g of gaz.rows) {
  const rec = { en: g[0], iso2: g[2], lon: g[3], lat: g[4], pop: g[5] || 0 };
  push(g[0], rec, 'name'); push(g[1], rec, 'name:ja');
  for (const alt of (g[6] || [])) push(alt, rec, 'alt');
}
const R = Math.PI / 180;
function km(aLon, aLat, bLon, bLat) {
  const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ── validate ──────────────────────────────────────────────────────────────────────────────── */
const seenId = new Map(), seenKey = new Map();
const NOW_Y = 2026;
let proven = 0, unproven = 0;
for (const r of rows) {
  const at = `${r._file} «${r.id}»`;
  if (seenId.has(r.id)) problems.push(`duplicate id «${r.id}» (${seenId.get(r.id)} and ${r._file})`);
  seenId.set(r.id, r._file);

  /* eras: ordered, disjoint, inside the record's reach, and never merely restating the modern name */
  let prevEnd = -1;
  for (const e of r.eras) {
    const f = e.from || 1000, t = e.to || NOW_Y;
    if (f < 1000 || t > NOW_Y) problems.push(`${at}: era ${e.from}–${e.to} is outside 1000–${NOW_Y}`);
    if (e.to && e.to < CLOCK_FLOOR) problems.push(`${at}: era «${e.name.en}» ends in ${e.to}, before the clock's floor of ${CLOCK_FLOOR} (js/chronos.js YMIN) — no reader can ever reach a year where it would be drawn, so it is shipped and invisible. Drop it, or widen it if the record supports a later end.`);
    if (f <= prevEnd) problems.push(`${at}: era «${e.name.en}» starts at ${f}, which overlaps the previous span ending ${prevEnd}`);
    prevEnd = t;
    for (const lg of LANGS) if (!e.name[lg]) problems.push(`${at}: era «${e.name.en}» has no ${lg} form`);
    if (r.keys.some((k) => k.replace(/!$/, '') === e.name.en)) problems.push(`${at}: era name «${e.name.en}» is also a modern key — nothing would change`);
  }

  /* keys: one place on Earth, in the country the row declares */
  for (const raw of r.keys) {
    const declared = raw.endsWith('!');
    const k = declared ? raw.slice(0, -1) : raw;
    if (!k) { problems.push(`${at}: empty key`); continue; }
    /* ⚠⚠⚠ A KEY MAY NOT REPEAT ANYWHERE — INCLUDING INSIDE ITS OWN ROW. The first version of this
       said `prior && prior !== r.id`, which reads as «one spelling cannot name two cities» and lets
       `['Jakarta', 'Jakarta']` straight through. That is not a harmless typo: every key of every
       active city goes into ONE MapLibre `match`, and a repeated branch label is not a wrong answer
       but a REJECTED STYLE — «Branch labels must be unique», addLayer throws, and the entire label
       stack stops existing (#R211 measured that failure mode). Three rows had it, the gate was
       green, and what found it was tests/r427-checks ⑦ running the real parser over the real
       output. The gate now asks the question the renderer asks. */
    const prior = seenKey.get(k);
    if (prior) problems.push(`${at}: key «${k}» is already used by «${prior}» — every key becomes a branch label in ONE match, and MapLibre rejects a style with a repeated label outright`);
    seenKey.set(k, r.id);
    const hits = gIdx.get(k) || [];
    const own = hits.filter((h) => km(r.lon, r.lat, h.lon, h.lat) <= NEAR_KM);
    const foreign = hits.filter((h) => km(r.lon, r.lat, h.lon, h.lat) > NEAR_KM && h.pop >= AMBIG_POP);
    if (own.length) {
      proven++;
      const cc = own.find((h) => h.iso2 === r.cc);
      if (!cc) problems.push(`${at}: key «${k}» resolves to ${own.map((h) => h.iso2).join('/')} in the gazetteer, but the row says ${r.cc}`);
    } else {
      unproven++;
      if (hits.length) warnings.push(`${at}: key «${k}» exists in the gazetteer but ${Math.round(km(r.lon, r.lat, hits[0].lon, hits[0].lat))} km away — check the coordinate`);
    }
    if (foreign.length && !declared) {
      const worst = foreign.sort((a, b) => (a.field === 'name' ? 1 : 0) - (b.field === 'name' ? 1 : 0) || b.pop - a.pop).pop();
      problems.push(`${at}: key «${k}» ALSO names ${worst.en} (${worst.iso2}, pop ${worst.pop.toLocaleString('en-US')}, ${Math.round(km(r.lon, r.lat, worst.lon, worst.lat))} km away, matched on its ${worst.field}) — that city would be relabelled too. Drop the key, or write «${k}!» and say why.`);
    }
  }
}
if (problems.length) {
  console.error(`\n✖ hist-cities: ${problems.length} problem(s)\n`);
  for (const p of problems.slice(0, 60)) console.error('  · ' + p);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}

/* ── the file ──────────────────────────────────────────────────────────────────────────────── */
const dnum = (y, end) => (y ? y * 10000 + (end ? 1231 : 101) : 0);
const out = {
  v: 1,
  src: 'scripts/histcities/ — the written record, one row per city; built by scripts/build-hist-cities.mjs',
  note: 'Spans are whole years unless the record gives a date. Outside every span the modern tile label stands.',
  langs: LANGS,
  cities: rows.map((r) => ({
    id: r.id,
    lon: +r.lon.toFixed(4),
    lat: +r.lat.toFixed(4),
    cc: r.cc,
    k: r.keys.map((k) => (k.endsWith('!') ? k.slice(0, -1) : k)),
    e: r.eras.map((e) => {
      const n = {};
      for (const lg of LANGS) n[lg] = e.name[lg];
      return { f: dnum(e.from, false), t: dnum(e.to, true), n };
    }),
  })),
};
const text = JSON.stringify(out) + '\n';

/* ── the coverage table: what «no established form» actually costs, measured ────────────────── */
const eraCount = rows.reduce((n, r) => n + r.eras.length, 0);
const have = Object.fromEntries(LANGS.map((l) => [l, 0]));
for (const r of rows) for (const e of r.eras) for (const lg of LANGS) if (lg === 'en' || e.name._has[lg]) have[lg]++;
function report() {
  console.log(`\nhist-cities · ${rows.length} cities · ${eraCount} historical names · ${REGIONS.length} region files`);
  console.log(`  tile keys: ${proven} proven against the gazetteer, ${unproven} not carried by it`);
  console.log('  per-language forms actually written down (the rest take the Latin/English form,');
  console.log('  which is what the live map already shows when OSM carries no tag for that language):');
  for (const lg of LANGS) console.log(`    ${lg.padEnd(8)} ${String(have[lg]).padStart(5)}/${eraCount}  ${(100 * have[lg] / eraCount).toFixed(1).padStart(5)}%`);
  if (warnings.length) { console.log(`\n  ${warnings.length} warning(s):`); for (const w of warnings.slice(0, 40)) console.log('    · ' + w); }
}

if (MODE === 'check') {
  let cur = null;
  try { cur = readFileSync(OUT, 'utf8'); } catch (_) { fail(`data/hist-cities.json is missing — run \`node scripts/build-hist-cities.mjs\``); }
  /* ⚠ LINE ENDINGS ARE NOT CONTENT (#R283's rule, and it cost this round a red gate). Git checks the
     file out with CRLF on Windows and with LF on the CI runner, so a byte-for-byte comparison against
     what the builder just wrote is a check that passes on one machine and fails on the other —
     which is worse than no check, because the failure teaches you to distrust the gate. */
  const eol = (s) => s.replace(/\r\n/g, '\n');
  if (eol(cur) !== eol(text)) fail('data/hist-cities.json does not match scripts/histcities/ — re-run `node scripts/build-hist-cities.mjs` and commit the result');
  console.log(`✓ hist-cities: data/hist-cities.json matches the record (${rows.length} cities, ${eraCount} names)`);
} else if (MODE === 'report') {
  report();
} else {
  writeFileSync(OUT, text);
  report();
  console.log(`\n✓ wrote data/hist-cities.json (${(text.length / 1024).toFixed(1)} kB)`);
}
