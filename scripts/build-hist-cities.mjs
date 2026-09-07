#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-cities.json — the name a city carried in the year on the clock   (#R427)
 *  ⚠⚠⚠ …AND WHICH CITY THAT IS — the guard radius                                      (#R521)
 * ----------------------------------------------------------------------------
 *  「都市名ラベルも同じ要領で（Chronos に）対応するように。」 The country labels have travelled
 *  in time since #R94k; scripts/histcities/*.mjs is the same record for SETTLEMENTS, and this
 *  turns it into the one file the app fetches.
 *
 *  ══ ⚠⚠⚠ WHAT #R521 CHANGED, AND WHY «Kochi» WAS NOT ONE BAD ROW ════════════════════════════
 *  A reader travelling to 1950 saw 高知市 relabelled コーチン. The row is right — Kochi in
 *  Kerala WAS Cochin until 1996 — and the row was not the defect. The defect was that a SPELLING
 *  was being used as an IDENTITY: js/hist-cities.js rewrote `ofm-city`'s `text-field` wherever
 *  the tile's own name matched a key, with nothing in the expression that could tell one Kochi
 *  from another. Every city on Earth sharing a spelling with a row was in scope, and the record
 *  holds over a thousand spellings.
 *
 *  So identity is now NAME **AND** PLACE. Each row carries a guard radius `g`; the runtime asks
 *  MapLibre's `distance` expression how far the candidate feature is from the row's coordinate
 *  and only renames it inside that radius. Kochi, Japan is 6 900 km from Kochi, Kerala.
 *
 *  ══ AND THE GATE THAT WAS SUPPOSED TO CATCH IT HAD THE ANSWER DELETED FROM ITS EVIDENCE ═════
 *  #R427's rule was «no other settlement of 20 000+ may carry this spelling», resolved against
 *  data/gazetteer-world.json.gz. That file is built for js/newsgeo.js, which needs ONE point per
 *  spelling, so scripts/build-gazetteer.mjs keeps `the more populous homonym` and drops the rest
 *  — plus every Latin form under four characters, every ordinary word, and everything a curated
 *  table owns. ⚠⚠⚠ THE UNIQUENESS THE GATE WAS ASKED TO PROVE HAD BEEN IMPOSED ON ITS ORACLE.
 *  Kirov (Kaluga oblast, 39 319, `place=town`) and Linden (New Jersey, 42 021, `place=town`) are
 *  both absent from it for exactly that reason, and both are namesakes of rows in this record.
 *  Kochi, Japan was invisible twice over: its GeoNames name is «Kōchi» with a macron, and the
 *  gazetteer's alternate names are filtered to the eighteen languages the news locator can
 *  tokenise, which do not include English.
 *
 *  The evidence is now data/histcities-homonyms.json.gz (scripts/build-histcities-homonyms.mjs):
 *  GeoNames cities500, unfiltered, restricted to the spellings this record actually joins on.
 *
 *  ══ WHAT IS PROVEN HERE, ROW BY ROW ════════════════════════════════════════════════════════
 *   ① THE COORDINATE IS THE CITY. Some settlement carrying one of the row's spellings, in the
 *      row's own country, must sit within ANCHOR_TOL_KM of the row's point. ⚠ This used to be a
 *      40 km formality; it is now load-bearing, because the guard is centred on that point and a
 *      coordinate 26 km out means the rename never happens. It found four (Sorokyne, KwaDukuza,
 *      Kunming, Kariega). A row GeoNames genuinely does not carry says so in `unlisted`.
 *   ② THE GUARD SEPARATES. `g` = half the distance to the nearest OTHER settlement answering to
 *      one of the row's spellings under its OWN name — never more than GUARD_MAX_KM. Derived,
 *      not typed: no row can be given a radius that reaches its namesake. Below GUARD_FLOOR_KM
 *      the two cannot be told apart at all and the build stops.
 *   ③ A NAMESAKE INSIDE THE GUARD IS DECLARED, AND THE DECLARATION IS RE-TESTED. Twin towns
 *      (Valga/Valka, 1.2 km) are closer than any radius. Those need `waive`, which names the
 *      other place and asserts the spelling reaches it ONLY through GeoNames' alternate list —
 *      an assertion this build re-checks every run. If GeoNames promotes it to that town's own
 *      name, the waiver stops being true and the build fails. ⚠ That is the whole difference
 *      from #R427's «!» suffix, which was an unconditional bypass of every finding for a key.
 *   ④ A KEY MAY NOT REPEAT, anywhere, including inside its own row — every key is a branch label
 *      in one MapLibre `match`, and a repeated label is a REJECTED STYLE, not a wrong answer.
 *   ⑤ ERAS are ordered, disjoint, complete in nine languages, and reachable by the clock.
 *
 *  ⚠ AND THE COMMITTED FILE IS RE-DERIVED, byte for byte, by `--check` (npm run check:histcities,
 *  inside `npm test`) — so data/hist-cities.json cannot drift away from the record.
 *
 *      node scripts/build-hist-cities.mjs            # write data/hist-cities.json
 *      node scripts/build-hist-cities.mjs --check    # re-derive and compare; exit 1 on any drift
 *      node scripts/build-hist-cities.mjs --report   # the coverage table, per language
 *      node scripts/build-hist-cities.mjs --audit    # every row × every namesake, as a table
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadRecord, km, GUARD_M } from './histcities-record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-cities.json');
const HOM = join(ROOT, 'data', 'histcities-homonyms.json.gz');

/* the nine language codes, in js/lang-registry.js's own spelling (see scripts/histcities/lang.mjs) */
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

/* ── the numbers, and where each of them comes from ─────────────────────────────────────────── */
const GUARD_MAX_KM = GUARD_M / 1000;
/* ⚠ MEASURED, NOT CHOSEN — from BOTH sides, because a guard has to be small enough to exclude the
   namesake and large enough to still contain the label.
     · the namesakes: the nearest one carrying a row's spelling as its own name is 13.5 km away
       (Türkmenbaşy village), then 25.6 (Abovyan village) and 29.2 (Holubivka village) — and 8.2,
       Armavir's, which is why `measured` exists. Everything else is over 40 km, and 600 of 611
       rows are not constrained at all.
     · the labels: the vector tile's `place` node is NOT the record's coordinate, and the gap was
       measured in the real renderer against live OpenFreeMap tiles — 0.11 km (Volgograd), 0.38
       (Kirov), 0.50 (Holubivka), 0.54 (Abovyan), 1.47 (Linden), 3.73 (Türkmenbaşy), 4.09 (Yining),
       4.78 (Kochi), 6.68 (Tokyo). ⚠ The worst of those is 6.68 km, so a guard NEAR the floor has
       single-digit kilometres of room and must not be taken on trust: the four narrowed rows were
       each checked against the real tile (margins 3.0 / 4.4 / 12.2 / 14.1 km).
   ⚠⚠ THE FLOOR IS «WHAT AN UNMEASURED ROW GETS». It is derived from OTHER rows' worst case, so a
   row that has actually been measured may declare `measured` and go below it — refusing evidence
   in favour of a default is not caution. What no declaration may cross is GUARD_HARD_FLOOR_KM:
   OpenMapTiles serves `place` at extent 4096, so at `ofm-city`'s minzoom of 3 one unit is 1.22 km
   and the rounding alone is ±0.61 km. A guard of a kilometre or two is decided by that rounding. */
const GUARD_FLOOR_KM = 6;
const GUARD_HARD_FLOOR_KM = 2;
const MEASURED_RATIO = 3;     /* a declared guard must be at least this many times the measured gap */
const MARGIN = 2;             /* the guard reaches at most HALFWAY to the nearest namesake */
const ANCHOR_MAX_KM = 40;     /* how far to look for the row's own city before calling it unproven */
const ANCHOR_TOL_KM = 10;     /* …and how far it may be before the coordinate is wrong (see ①) */
/* GeoNames files a city and its administrative seat as two rows a kilometre or two apart (Fuzhou
   is three rows). Closer than this, one spelling in one country is one place. */
const SAME_PLACE_KM = 3;
/* ⚠⚠⚠ (#R409's LESSON, ONE FILE OVER) A ROW THAT CANNOT REACH THE SCREEN IS NOT A SMALLER ROW —
   it is indistinguishable, in the source, from a row that works. The clock's floor is 1850
   (js/chronos.js `YMIN`), so a span that ENDS before it can never be displayed by anything. */
const CLOCK_FLOOR = 1850;
const NOW_Y = 2026;

const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--report') ? 'report'
  : argv.includes('--audit') ? 'audit' : 'write';

const problems = [];
const warnings = [];
function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

/* ── the record, and the evidence ───────────────────────────────────────────────────────────── */
const { files: REGIONS, rows } = await loadRecord();
let HOMONYMS;
try { HOMONYMS = JSON.parse(gunzipSync(readFileSync(HOM)).toString('utf8')); }
catch (_) { fail('data/histcities-homonyms.json.gz is missing or unreadable — run `node scripts/build-histcities-homonyms.mjs`'); }

/* ── ①②③ identity: which city, how far the guard may reach, and what still needs saying ────── */
const audit = [];
const seenId = new Map(), seenKey = new Map();
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
    if (r.keys.some((k) => k === e.name.en)) problems.push(`${at}: era name «${e.name.en}» is also a modern key — nothing would change`);
  }

  /* ④ a key may not repeat anywhere, INCLUDING inside its own row.
     ⚠⚠⚠ The first version of this said `prior && prior !== r.id`, which reads as «one spelling
     cannot name two cities» and lets `['Jakarta', 'Jakarta']` straight through. That is not a
     harmless typo: every key of every active city goes into ONE MapLibre `match`, and a repeated
     branch label is not a wrong answer but a REJECTED STYLE — «Branch labels must be unique»,
     addLayer throws, and the entire label stack stops existing (#R211 measured that failure
     mode). Three rows had it, the gate was green, and what found it was tests/r427-checks
     running the real parser over the real output. */
  const hits = [];
  for (const k of r.keys) {
    if (!k) { problems.push(`${at}: empty key`); continue; }
    const prior = seenKey.get(k);
    if (prior) problems.push(`${at}: key «${k}» is already used by «${prior}» — every key becomes a branch label in ONE match, and MapLibre rejects a style with a repeated label outright`);
    seenKey.set(k, r.id);
    const found = HOMONYMS.keys[k];
    if (!found) { problems.push(`${at}: key «${k}» is not covered by data/histcities-homonyms.json.gz — run \`node scripts/build-histcities-homonyms.mjs\` so the spelling is resolved against GeoNames before it ships`); continue; }
    for (const h of found) {
      hits.push({ k, name: h[0], cc: h[1], lon: h[2], lat: h[3], pop: h[4], fcode: h[5], field: h[6], d: km(r.lon, r.lat, h[2], h[3]) });
    }
  }

  /* ① the anchor: the biggest settlement near this point that answers to one of the row's
     spellings AT ALL — an alternate name proves «this coordinate is that city» perfectly well.
     (Which field matched only decides what a DIFFERENT place is dangerous, below.) */
  const near = hits.filter((h) => h.d <= ANCHOR_MAX_KM);
  const anchor = near.filter((h) => h.cc === r.cc).sort((a, b) => b.pop - a.pop)[0] || null;
  if (!anchor) {
    if (!r.unlisted) {
      const other = near.sort((a, b) => a.d - b.d)[0];
      problems.push(other
        ? `${at}: the nearest settlement answering to any of these spellings is ${other.name} in ${other.cc} (${Math.round(other.d)} km), and the row declares ${r.cc} — either the coordinate or the country is wrong`
        : `${at}: GeoNames cities500 carries no settlement under any of ${r.keys.map((k) => '«' + k + '»').join(', ')} — the coordinate cannot be proven, and the guard radius is centred on it. Fix the spelling, or declare { unlisted: '…why…' }.`);
    }
  } else if (anchor.d > ANCHOR_TOL_KM) {
    problems.push(`${at}: the coordinate is ${anchor.d.toFixed(1)} km from ${anchor.name} (${anchor.cc}, pop ${anchor.pop.toLocaleString('en-US')}), which is the settlement these spellings name. The guard radius is centred on the coordinate, so the era name would simply never appear. Move it to ${anchor.lon}, ${anchor.lat}.`);
  } else if (r.unlisted) {
    problems.push(`${at}: declares «unlisted», but ${anchor.name} (${anchor.cc}) resolves ${anchor.d.toFixed(1)} km away — drop the declaration`);
  }

  /* ② the guard. ⚠ WHICH FIELD MATCHED IS THE WHOLE QUESTION HERE. OpenMapTiles carries OSM's
     `name` and `name:*`; GeoNames' alternate list is a pile of exonyms, former names and
     transliterations that no tile is labelled with. A namesake under its OWN name is a live
     mislabel waiting for a radius that reaches it; a namesake in the alternate list is a claim
     to be read, which is what ③ is for. */
  /* ⚠ «the same place, listed twice» IS A CLAIM ABOUT ONE COUNTRY'S OWN FILING, so the collapse
     is only allowed inside the row's country. A border does not run through a duplicate record —
     but it does run between Valga and Valka, which are 2.3 km apart and are two towns. Collapsing
     on distance alone made the build declare their waiver unnecessary, which is the opposite of
     what those 2.3 km mean. */
  const elsewhere = (h) => !anchor || h.cc !== anchor.cc || km(anchor.lon, anchor.lat, h.lon, h.lat) > SAME_PLACE_KM;
  const rivals = hits.filter((h) => h.field !== 'alt' && elsewhere(h)).sort((a, b) => a.d - b.d);
  const nearestRival = rivals[0] || null;
  const guardKm = Math.min(GUARD_MAX_KM, nearestRival ? nearestRival.d / MARGIN : Infinity);
  if (guardKm < GUARD_FLOOR_KM) {
    const m = r.measured;
    const rival = `${nearestRival.name} (${nearestRival.cc}, pop ${nearestRival.pop.toLocaleString('en-US')}) is only ${nearestRival.d.toFixed(1)} km away and carries «${nearestRival.k}» as its own name, so the guard shrinks to ${guardKm.toFixed(1)} km`;
    if (!m) {
      problems.push(`${at}: ${rival} — below the ${GUARD_FLOOR_KM} km floor, which is what a row gets when nobody has measured the gap between its coordinate and the node the tiles draw. Either drop the key, or measure that gap against a real tile and declare { measured: { km, on, why } }.`);
    } else if (guardKm < GUARD_HARD_FLOOR_KM) {
      problems.push(`${at}: ${rival} — below the ${GUARD_HARD_FLOOR_KM} km hard floor, which no measurement can lift: at ofm-city's minzoom of 3 the tile's own quantisation is ±0.61 km, so a guard this small is decided by rounding. Drop the key.`);
    } else if (guardKm < m.km * MEASURED_RATIO) {
      problems.push(`${at}: ${rival}, but the row measured its label ${m.km} km from this coordinate (${m.on}) — the guard must be at least ${MEASURED_RATIO}× that, and ${guardKm.toFixed(1)} km is not. Re-measure, or drop the key.`);
    }
  } else if (r.measured) {
    problems.push(`${at}: declares «measured», but the guard is ${guardKm.toFixed(1)} km, at or above the ${GUARD_FLOOR_KM} km floor — the declaration excuses nothing, so it should go`);
  }

  /* ③ a namesake INSIDE the guard: declared, named, and re-tested */
  const inside = hits.filter((h) => h.d <= guardKm && elsewhere(h));
  const claimed = new Set();
  for (const h of inside) {
    const w = (r.waive || []).find((x) => x.key === h.k && x.place === h.name && x.cc === h.cc);
    if (!w) {
      problems.push(`${at}: ${h.name} (${h.cc}, pop ${h.pop.toLocaleString('en-US')}) is ${h.d.toFixed(1)} km away — inside the ${guardKm.toFixed(1)} km guard — and answers to «${h.k}» (matched on its ${h.field}). Either drop the key, or declare { waive: [{ key: '${h.k}', place: '${h.name}', cc: '${h.cc}', why: '…' }] } and say why no tile carries that spelling for it.`);
    } else {
      claimed.add(w);
      if (h.field !== 'alt') {
        problems.push(`${at}: the waiver for ${h.name} (${h.cc}) says the spelling «${h.k}» reaches it only through GeoNames' alternate list — but GeoNames now carries it as that place's ${h.field === 'name' ? 'own name' : 'ASCII name'}. The waiver has stopped being true; a tile can carry that label now.`);
      }
    }
  }
  for (const w of (r.waive || [])) {
    if (!claimed.has(w)) problems.push(`${at}: the waiver for ${w.place} (${w.cc}) under «${w.key}» no longer matches anything inside the guard — the finding it excuses is gone, so the waiver should go too`);
  }

  audit.push({ r, anchor, nearestRival, guardKm, hits, inside });
}

if (problems.length) {
  console.error(`\n✖ hist-cities: ${problems.length} problem(s)\n`);
  for (const p of problems.slice(0, 60)) console.error('  · ' + p);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}

/* ── the file ──────────────────────────────────────────────────────────────────────────────── */
const dnum = (y, end) => (y ? y * 10000 + (end ? 1231 : 101) : 0);
/* rounded DOWN to 100 m: a derived number that is re-derived from an external dump should not
   churn the shipped file over a metre, and rounding down never lets a guard grow. */
const guardOf = (r) => Math.floor(audit.find((a) => a.r === r).guardKm * 10) * 100;
const out = {
  v: 2,
  src: 'scripts/histcities/ — the written record, one row per city; built by scripts/build-hist-cities.mjs',
  note: 'Spans are whole years unless the record gives a date. Outside every span the modern tile label stands. '
    + '`g` is the guard radius in metres: a tile label is renamed only if its own spelling is one of `k` AND it lies within `g` of (lon, lat).',
  langs: LANGS,
  cities: rows.map((r) => ({
    id: r.id,
    lon: +r.lon.toFixed(4),
    lat: +r.lat.toFixed(4),
    cc: r.cc,
    g: guardOf(r),
    k: r.keys.slice(),
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
const keyCount = rows.reduce((n, r) => n + r.keys.length, 0);
const have = Object.fromEntries(LANGS.map((l) => [l, 0]));
for (const r of rows) for (const e of r.eras) for (const lg of LANGS) if (lg === 'en' || e.name._has[lg]) have[lg]++;
function report() {
  const tight = audit.filter((a) => a.guardKm < GUARD_MAX_KM);
  const unlisted = rows.filter((r) => r.unlisted);
  const waived = rows.reduce((n, r) => n + (r.waive || []).length, 0);
  console.log(`\nhist-cities · ${rows.length} cities · ${eraCount} historical names · ${REGIONS.length} region files`);
  console.log(`  identity: ${keyCount} spellings, each bound to a point; ${rows.length - tight.length - unlisted.length} rows at the ${GUARD_MAX_KM} km guard, `
    + `${tight.length} narrowed by a namesake, ${unlisted.length} not carried by GeoNames, ${waived} declared waiver(s)`);
  for (const a of tight.sort((x, y) => x.guardKm - y.guardKm)) {
    const m = a.r.measured;
    console.log(`    ${a.guardKm.toFixed(1).padStart(5)} km  ${a.r.id} — nearest namesake ${a.nearestRival.name} (${a.nearestRival.cc}) at ${a.nearestRival.d.toFixed(1)} km`
      + (m ? `  ⚠ below the ${GUARD_FLOOR_KM} km floor on a measurement: label ${m.km} km from the coordinate (${m.on})` : ''));
  }
  console.log('  per-language forms actually written down (the rest take the Latin/English form,');
  console.log('  which is what the live map already shows when OSM carries no tag for that language):');
  for (const lg of LANGS) console.log(`    ${lg.padEnd(8)} ${String(have[lg]).padStart(5)}/${eraCount}  ${(100 * have[lg] / eraCount).toFixed(1).padStart(5)}%`);
  if (warnings.length) { console.log(`\n  ${warnings.length} warning(s):`); for (const w of warnings.slice(0, 40)) console.log('    · ' + w); }
}

/* ── the audit: every row against every settlement on Earth that answers to one of its spellings ─
   ⚠ MACHINE-GENERATED, so «we checked once» cannot decay into «we checked in 2026». */
function auditTable() {
  console.log('id\tfile\tcc\tlon\tlat\tguard_km\tanchor\tanchor_km\tnamesakes\tnearest_rival\trival_km\trival_field\tverdict');
  for (const a of audit.sort((x, y) => x.guardKm - y.guardKm || x.r.id.localeCompare(y.r.id))) {
    const verdict = a.r.unlisted ? 'UNLISTED' : a.inside.length ? 'WAIVED_ALT_ONLY'
      : a.guardKm < GUARD_MAX_KM ? 'SAFE_NARROWED' : a.nearestRival ? 'SAFE_SPATIAL' : 'SAFE_UNIQUE';
    const rivals = a.hits.filter((h) => h.d > a.guardKm).length;
    console.log([a.r.id, a.r._file, a.r.cc, a.r.lon, a.r.lat, a.guardKm.toFixed(1),
      a.anchor ? a.anchor.name : '—', a.anchor ? a.anchor.d.toFixed(1) : '—', rivals,
      a.nearestRival ? `${a.nearestRival.name} (${a.nearestRival.cc})` : '—',
      a.nearestRival ? a.nearestRival.d.toFixed(1) : '—', a.nearestRival ? a.nearestRival.field : '—', verdict].join('\t'));
  }
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
  console.log(`✓ hist-cities: data/hist-cities.json matches the record (${rows.length} cities, ${eraCount} names, every spelling bound to a point)`);
} else if (MODE === 'report') {
  report();
} else if (MODE === 'audit') {
  auditTable();
} else {
  writeFileSync(OUT, text);
  report();
  console.log(`\n✓ wrote data/hist-cities.json (${(text.length / 1024).toFixed(1)} kB)`);
}
