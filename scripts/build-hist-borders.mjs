#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-borders.js — the borders of 1850–1885, day by day   (#R518)
 * ----------------------------------------------------------------------------
 *  「1850–1885の国境を本気で埋めて」
 *
 *  ══ WHAT WAS THERE BEFORE, MEASURED ════════════════════════════════════════════════════════════
 *  Nothing. The clock reaches back to 1850 (js/chronos.js) and the bundled CShapes 2.0 record
 *  (data/cshapes.js) begins on 1886-01-01 — its earliest date, verified by walking all 710 records:
 *  ZERO of them are alive in any year from 1850 to 1885. Those 36 years fell to the aourednik
 *  historical-basemaps fallback, whose only two snapshots in that reach are world_1815 and
 *  world_1880 … and 1815 is unreachable: `nearest()` switches at the midpoint 1847.5, which is
 *  below the clock's own floor. So EVERY year from 1850 to 1885 drew one and the same file —
 *  world_1880.geojson, 236 features / 169 named polities, fetched from GitHub through a CORS proxy.
 *  1850 was shown with the borders of 1880. One frame for thirty-six years.
 *
 *  ══ WHY OpenHistoricalMap AND NOT ANOTHER SNAPSHOT ═════════════════════════════════════════════
 *  Because there is no other snapshot. The upstream repo's file list was re-read on 2026-09-07:
 *  world_1815 and world_1880 with nothing between them, exactly as the code says. CShapes starts
 *  1886. Euratlas and the MPIDR collection are not redistributable. OpenHistoricalMap is:
 *  CC0 1.0, and — this is the point — its 19th-century boundary relations carry `start_date` and
 *  `end_date` to the DAY, which is the same shape data/cshapes.js already has, so the day-exact
 *  machinery #R421 built for 1886–2019 extends downward instead of being duplicated.
 *
 *  Measured on the download this file consumes: 506 admin_level=2 relations overlap 1850–1885.
 *  data/hist-borders.js holds 494 records, 2,825 pooled rings and 216 transition dates inside the
 *  window; 164–216 of them are alive on any 15 June of it. Against one frame.
 *
 *  ⚠ OHM's `end_date` IS EXCLUSIVE, AND CShapes' IS NOT. Measured before writing a line of the
 *  selector: of the 180 consecutive same-`wikidata` pairs in the window, 151 have
 *  `end_date === the successor's start_date`. Reading that end as inclusive — the CShapes
 *  convention, which the neighbouring code uses — would draw BOTH polygons on the changeover day
 *  for 151 of the era's transitions. The bundle therefore stores the end as an EXCLUSIVE instant
 *  and js/time-borders.js selects `start <= t < end` for this record and `start <= t <= end` for
 *  CShapes. Two records, two conventions, neither converted into the other's.
 *
 *  ⚠ AND THE NAMES ARE THE SOURCE'S, IN NINE LANGUAGES. OHM carries name:en/ja/de/ru/es/zh/fr/ko
 *  on most of these relations. IntMap's era labels are otherwise localized by MATCHING the English
 *  name against tables in js/time-borders.js — which works for «Germany» and cannot work for
 *  «Kurhessen» or «Zuid-Afrikaansche Republiek». So the nine names travel WITH the polygon.
 *  Simplified Chinese is DERIVED from the Traditional lane by opencc-js — the #R224 rule, not a
 *  second hand-made copy.
 *
 *      node scripts/build-hist-borders.mjs --fetch    # download OHM into the cache (network)
 *      node scripts/build-hist-borders.mjs            # build data/hist-borders.js from the cache
 *      node scripts/build-hist-borders.mjs --check    # verify the COMMITTED file's invariants (offline)
 *      node scripts/build-hist-borders.mjs --report   # build, and print the coverage table
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { stitch, simplifyRing, ringArea, pointInRing } from './histborders/geom.mjs';
import { fetchIndex, fetchGeom } from './histborders/fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-borders.js');
const CACHE = process.env.INTMAP_HISTB_CACHE || join(tmpdir(), 'intmap-histb-cache');

/* ⚠ THE WINDOW IS THE GAP ITSELF, not a round number: the clock's floor (js/chronos.js YMIN) up to
   the day CShapes takes over (js/time-borders.js CS_MIN). Both ends are asserted by the checks. */
export const Y_MIN = 1850, Y_MAX = 1885;
const T_LO = 18500101, T_HI = 18860101;          /* [lo, hi) as sortable YYYYMMDD ints */

/* the app's own language codes (js/lang-registry.js), paired with the OHM tag that carries them.
   'zh-hans' has no row: it is derived from 'zh' below, the #R224 rule. */
const LANGS = [
  ['en', 'name:en'], ['jp', 'name:ja'], ['de', 'name:de'], ['ru', 'name:ru'],
  ['es', 'name:es'], ['zh', 'name:zh'], ['fr', 'name:fr'], ['ko', 'name:ko'],
];

/* ⚠ THE TOLERANCE IS A BUDGET, AND THE BUDGET IS data/cshapes.js. OHM's ways are drawn far finer
   than the record this file sits beside, so the raw assembly is 462 k points / 7.7 MB against
   CShapes' 338 k / 5.6 MB for a comparable number of polities — a border of 1860 delivered heavier
   than every border of 1886-2019 put together. Measured sweep: 0.008° → 462 k, 0.010° → 388 k,
   0.012° → 336 k, 0.015° → 280 k. 0.012° (~1.3 km) lands on the neighbouring record's own figure. */
const TOL = 0.012;
const MIN_AREA = 0.0006;    /* drop a ring smaller than this (deg²) — under a pixel at the zooms this draws */
const DEC = 3;              /* coordinate decimals, matching data/cshapes.js */

const ymd = (y, m, d) => y * 10000 + m * 100 + d;

/* ── dates ──────────────────────────────────────────────────────────────────
   OHM writes `1867-07-01`, `1867-07` and `1867`. A start is the FIRST instant the imprecise text
   can mean; an end is the first instant the record no longer covers.
   ⚠ A DAY-EXACT END IS ALREADY THAT INSTANT — DO NOT ADD A DAY TO IT. This function did, borrowing
   `csBounds`' `_dayAfter` reflex from the record next door, and every one of the 151 successions
   the exclusive reading was chosen FOR then overlapped its successor by exactly one day: measured
   on that build, 107 of 176 same-entity pairs overlapped where 0 should. Only the IMPRECISE forms
   are widened, because only they name a span rather than an instant. */
function parseDate(s, isEnd) {
  const t = String(s || '').trim();
  let m = /^(-?\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^(-?\d{1,4})-(\d{1,2})$/.exec(t);
  if (m) { const y = +m[1], mo = +m[2];
    return isEnd ? (mo === 12 ? [y + 1, 1, 1] : [y, mo + 1, 1]) : [y, mo, 1]; }
  m = /^(-?\d{1,4})$/.exec(t);
  if (m) { const y = +m[1]; return isEnd ? [y + 1, 1, 1] : [y, 1, 1]; }
  return null;
}

/* ⚠ A RECORD THAT STARTS AND ENDS ON THE SAME DAY MEANS «that day», not «no time at all». Under the
   exclusive reading `start_date === end_date` covers nothing and the record can never be drawn —
   and the eight in the source written that way are not noise: two of them are the Confederate
   States on 1861-01-09 and 1861-01-10, one polygon per seceding state. Read as one day. */
function oneDay(r) { if (r.e > r.s) return false;
  const t = new Date(Date.UTC(r.sArr[0], r.sArr[1] - 1, r.sArr[2])); t.setUTCDate(t.getUTCDate() + 1);
  r.eArr = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  r.e = ymd(r.eArr[0], r.eArr[1], r.eArr[2]); return true; }

/* ⚠ ONE ENTITY IS IN ONE PLACE AT A TIME. Two records sharing a `wikidata` id may not overlap, and
   two ways of overlapping turn up in this window:
     · an imprecise end widened past its own successor (`end_date=1867` → 1868-01-01 while the next
       record starts 1867-07-01), and
     · plain upstream duplicates whose spans genuinely cross.
   Both are closed the same way — the earlier record ends where the later one begins.
   ⚠ A THIRD KIND CANNOT BE CLAMPED AND MUST BE DROPPED. When the later record does not FOLLOW the
   earlier one — it starts on the same day or before — clamping would invert the span, so the
   LONGER of the two goes. Measured, both cases in this window: Bahawalpur State is in the source
   as two byte-identical relations, and «Confederate States of America» 1860-12-20→1861-01-09 sits
   on top of «Confederate States» 1860-12-20→1861-01-08, which is the first step of a twelve-record
   day-by-day secession sequence. Dropping the longer keeps the sequence and loses the duplicate. */
function clampOverlaps(recs) {
  const by = new Map();
  for (const r of recs) { if (!r.wd) continue; const a = by.get(r.wd); if (a) a.push(r); else by.set(r.wd, [r]); }
  let n = 0; const drop = new Set();
  for (const arr of by.values()) {
    arr.sort((a, b) => a.s - b.s);
    for (let i = 0; i + 1 < arr.length; i++) {
      const cur = arr[i], nx = arr[i + 1];
      if (drop.has(cur) || drop.has(nx)) continue;
      if (nx.s >= cur.e) continue;                 /* no overlap */
      if (nx.s <= cur.s) { drop.add(cur.e >= nx.e ? cur : nx); continue; }
      cur.e = nx.s; cur.eArr = nx.sArr; n++;
    }
  }
  for (let i = recs.length - 1; i >= 0; i--) if (drop.has(recs[i])) recs.splice(i, 1);
  return { clamped: n, dropped: drop.size };
}

/* ⚠ A MEMBER CAN BE ANOTHER RELATION, AND THAT IS WHERE THE ISLANDS LIVE. 27 of these records hold
   sub-relations — Qing holds twelve, the Confederate States and Sarawak hold NOTHING ELSE — and
   Overpass's `out geom` does not expand them, so reading only the way members loses Denmark's
   islands, Hong Kong, Austria's exclaves and the whole Confederacy. Expanded here, depth-guarded
   and cycle-guarded, off the same cache. */
function waysOf(rel, geom, seen = new Set(), depth = 0) {
  const out = [];
  if (!rel || depth > 4 || seen.has(rel.id)) return out;
  seen.add(rel.id);
  for (const m of rel.members || []) {
    if (m.type === 'way' && m.geometry) out.push({ role: m.role, pts: m.geometry.map(p => [p.lon, p.lat]) });
    else if (m.type === 'relation') for (const w of waysOf(geom.get(m.ref), geom, seen, depth + 1)) out.push(w);
  }
  return out;
}

/* ⚠ AN OUTLINE WITH A HOLE IN IT IS STILL AN OUTLINE. Measured: Bolivia 1839-1866 and Chile
   1848-1866 each have exactly one pair of degree-1 endpoints — one missing coastal way, a gap of
   0.358° across shapes 13-26° wide. Bridging that is right; bridging Canada's two-week 13-point
   stub, whose "gap" is its entire extent, is not. So the test is the gap AGAINST THE SHAPE, and a
   chain that fails it is dropped and named by --report rather than closed into a lie. */
const MAX_GAP_FRAC = 0.10;
function closeGap(chain) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of chain) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const diag = Math.hypot(x1 - x0, y1 - y0);
  const gap = Math.hypot(chain[0][0] - chain[chain.length - 1][0], chain[0][1] - chain[chain.length - 1][1]);
  return (diag > 0 && gap / diag <= MAX_GAP_FRAC) ? chain : null;
}

/* ── one relation → polygons ────────────────────────────────────────────────*/
function ringsOf(rel, geom) {
  const outer = [], inner = [];
  for (const w of waysOf(rel, geom)) (w.role === 'inner' ? inner : outer).push(w.pts);
  const O = stitch(outer), I = stitch(inner);
  let bridged = 0, dropped = 0;
  for (const chain of O.open) { const c = closeGap(chain); if (c) { O.rings.push(c); bridged++; } else dropped++; }
  for (const chain of I.open) { const c = closeGap(chain); if (c) I.rings.push(c); }
  const shells = [], holes = [];
  for (const r of O.rings) { const s = simplifyRing(r, TOL); if (s && Math.abs(ringArea(s)) >= MIN_AREA) shells.push(s); }
  for (const r of I.rings) { const s = simplifyRing(r, TOL); if (s && Math.abs(ringArea(s)) >= MIN_AREA) holes.push(s); }
  /* GeoJSON right-hand rule: shells CCW, holes CW; biggest shell first so a hole finds its owner */
  const polys = shells
    .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))
    .map(sh => [ringArea(sh) < 0 ? sh.slice().reverse() : sh]);
  for (const h of holes) {
    const owner = polys.find(p => pointInRing(h[0], p[0]));
    if (owner) owner.push(ringArea(h) > 0 ? h.slice().reverse() : h);
  }
  return { polys, bridged, dropped };
}

const round = r => r.map(p => [+p[0].toFixed(DEC), +p[1].toFixed(DEC)])
  .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);

/* ── build ──────────────────────────────────────────────────────────────────*/
async function build({ report } = {}) {
  const idx = JSON.parse(readFileSync(join(CACHE, 'index.json'), 'utf8'));
  const geom = new Map();
  for (const f of readdirSync(join(CACHE, 'geom'))) {
    const j = JSON.parse(readFileSync(join(CACHE, 'geom', f), 'utf8'));
    for (const e of j.elements) if (e.type === 'relation') geom.set(e.id, e);
  }

  const recs = [];
  const skipped = { noDate: 0, noName: 0, noGeom: 0, empty: 0, outside: 0, oneDay: 0 };
  for (const el of idx.elements) {
    const t = el.tags || {};
    const sArr = parseDate(t.start_date, false), eArr = parseDate(t.end_date, true);
    if (!sArr && !eArr) { skipped.noDate++; continue; }
    const s = sArr ? ymd(...sArr) : 10000101;
    const e = eArr ? ymd(...eArr) : 30000101;
    if (s >= T_HI || e <= T_LO) { skipped.outside++; continue; }
    const g = geom.get(el.id);
    if (!g) { skipped.noGeom++; continue; }
    const names = {};
    for (const [code, tag] of LANGS) { const v = t[tag]; if (v) names[code] = String(v).trim(); }
    if (!names.en) names.en = String(t.name || '').trim();
    if (!names.en) { skipped.noName++; continue; }
    const rec = { id: el.id, wd: t.wikidata || null, names,
                  s, e, sArr: sArr || [1000, 1, 1], eArr: eArr || [3000, 1, 1] };
    if (oneDay(rec)) skipped.oneDay++;
    recs.push(rec);
  }
  const { clamped, dropped: dupes } = clampOverlaps(recs);
  /* ⚠ AND FILTER AGAIN AFTERWARDS. Clamping only ever moves an end EARLIER, so a record admitted on
     its widened end can leave the window once its real successor is known — measured: four did
     (Prussia, the Austrian Empire, Modena, Tahuatu), each with a successor that begins in 1849. */
  for (let i = recs.length - 1; i >= 0; i--) if (!(recs[i].s < T_HI && recs[i].e > T_LO)) { recs.splice(i, 1); skipped.outside++; }

  /* Simplified Chinese, derived — never hand-written twice (#R224). `name:zh` in OHM is a MIX of
     the two orthographies (兩西西里王國 beside 奥斯曼帝国), so both lanes are normalised: the
     Traditional one through cn→tw and the Simplified one through tw→cn. */
  const OpenCC = (await import('opencc-js')).default;
  const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
  const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });
  for (const r of recs) if (r.names.zh) { const z = r.names.zh; r.names['zh-hans'] = t2s(z); r.names.zh = s2t(z); }

  const ringPool = new Map(), rings = [];
  const put = r => { const k = JSON.stringify(r); let i = ringPool.get(k);
    if (i === undefined) { i = rings.length; rings.push(r); ringPool.set(k, i); } return i; };

  const feats = []; let bridged = 0; const dropped = [];
  recs.sort((a, b) => a.s - b.s || a.id - b.id);
  for (const r of recs) {
    const g = ringsOf(geom.get(r.id), geom);
    bridged += g.bridged;
    if (g.dropped) dropped.push(r.names.en + ' (' + r.sArr.join('-') + ', ' + g.dropped + ')');
    const polys = g.polys.map(p => p.map(ring => put(round(ring)))).filter(p => p.length);
    if (!polys.length) { skipped.empty++; continue; }
    /* only names that DIFFER from English are carried — a Latin-script polity repeated nine times
       would be nine copies of the same bytes */
    const nm = { en: r.names.en };
    for (const k of Object.keys(r.names)) if (k !== 'en' && r.names[k] && r.names[k] !== r.names.en) nm[k] = r.names[k];
    feats.push([nm, r.wd, ...r.sArr, ...r.eArr, polys]);
  }

  const body = JSON.stringify({ v: 1,
    src: 'OpenHistoricalMap (openhistoricalmap.org) · CC0 1.0',   /* ⚠ (#R530) CC0, not ODbL. OHM's own /copyright page describes the project as «dedicated to the public domain» and its Overpass API answers «The data is made available under CC0» — both measured 2026-09-07. #R518 shipped ODbL here and in the Sources registry; correcting it was unavoidable this round, because #R530 draws a SECOND dataset from the same source and the page would otherwise have listed one organisation twice under two licences. */
    window: [Y_MIN, Y_MAX], rings, feats });
  writeFileSync(OUT, 'window.__HISTB=' + body + ';\n');

  if (report) {
    console.log(`records ${feats.length}   rings ${rings.length}   points ${rings.reduce((a, r) => a + r.length, 0)}   bytes ${body.length + 18}`);
    console.log('skipped', skipped, `| overlaps clamped ${clamped}, ${dupes} duplicate record(s) dropped | gaps bridged ${bridged}`);
    if (dropped.length) console.log('chains too broken to close:', dropped.join(', '));
    const bounds = new Set();
    for (const f of feats) { bounds.add(ymd(f[2], f[3], f[4])); bounds.add(ymd(f[5], f[6], f[7])); }
    const inWin = [...bounds].filter(k => k >= T_LO && k < T_HI).sort((a, b) => a - b);
    console.log(`transition dates inside 1850-1885: ${inWin.length}`);
    let line = '';
    for (let y = Y_MIN; y <= Y_MAX; y += 5) {
      const t = ymd(y, 6, 15);
      line += `${y}:${feats.filter(f => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t).length}  `;
    }
    console.log('polities on 15 June —', line);
    const perLang = {}; for (const c of ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) perLang[c] = feats.filter(f => f[0][c]).length;
    console.log('carry their own name in', perLang);
  }
  return { feats, rings };
}

/* ── check (offline) ────────────────────────────────────────────────────────
   ⚠ THIS RE-DERIVES NOTHING, and says so. The build needs ~400 MB of Overpass responses that CI
   cannot have, so the gate proves the COMMITTED file's INVARIANTS instead: every record inside the
   window, every ring index resolvable, every ring on the globe, every date ordered, an English name
   on every record, and — the failure this round exists to fix — every single year of the window
   with a world to draw. */
function check() {
  const src = readFileSync(OUT, 'utf8');
  const w = {}; new Function('window', src)(w);
  const d = w.__HISTB;
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  ok(d && d.v === 1, 'v must be 1');
  ok(d && Array.isArray(d.rings) && d.rings.length > 0, 'rings missing');
  ok(d && Array.isArray(d.feats) && d.feats.length > 0, 'feats missing');
  ok(d && d.window && d.window[0] === Y_MIN && d.window[1] === Y_MAX, 'window must be [1850,1885]');
  ok(d && /OpenHistoricalMap/.test(d.src) && /CC0/.test(d.src), 'src must name OpenHistoricalMap and CC0');
  if (bad.length) { fail(bad); return; }
  d.rings.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 3) bad.push('ring ' + i + ' has ' + (r && r.length) + ' points');
    else if (r.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]) ||
                          p[0] < -180.001 || p[0] > 180.001 || p[1] < -90.001 || p[1] > 90.001))
      bad.push('ring ' + i + ' leaves the globe');
  });
  const bounds = new Set();
  d.feats.forEach((f, i) => {
    const nm = f[0];
    if (!nm || typeof nm !== 'object' || !nm.en) bad.push('feat ' + i + ' has no English name');
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
    if (!(s < e)) bad.push('feat ' + i + ' (' + (nm && nm.en) + ') ends before it starts');
    if (!(s < T_HI && e > T_LO)) bad.push('feat ' + i + ' (' + (nm && nm.en) + ') is outside 1850-1885');
    bounds.add(s); bounds.add(e);
    if (!Array.isArray(f[8]) || !f[8].length) bad.push('feat ' + i + ' has no polygons');
    else for (const poly of f[8]) for (const ri of poly)
      if (!(ri >= 0 && ri < d.rings.length)) bad.push('feat ' + i + ' points at ring ' + ri);
  });
  const inWin = [...bounds].filter(k => k >= T_LO && k < T_HI);
  ok(inWin.length >= 150, 'only ' + inWin.length + ' transition dates inside the window');
  for (let y = Y_MIN; y <= Y_MAX; y++) {
    const t = ymd(y, 6, 15);
    const n = d.feats.filter(f => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t).length;
    if (n < 100) bad.push(y + ' has only ' + n + ' polities');
  }
  if (bad.length) { fail(bad); return; }
  console.log(`hist-borders ok — ${d.feats.length} records, ${d.rings.length} rings, ${inWin.length} transition dates in ${Y_MIN}-${Y_MAX}`);
}
function fail(bad) {
  console.error('hist-borders: ' + bad.length + ' problem(s)');
  for (const b of bad.slice(0, 25)) console.error('  ' + b);
  process.exitCode = 1;
}

const arg = process.argv.slice(2);
if (arg.includes('--check')) check();
else if (arg.includes('--fetch')) {
  const idx = await fetchIndex(CACHE);
  const py = s => { const m = /^(-?\d{1,4})/.exec(String(s || '').trim()); return m ? +m[1] : null; };
  const ov = idx.elements.filter(x => { const t = x.tags || {}; const s = py(t.start_date), e = py(t.end_date);
    if (s != null && s > Y_MAX) return false; if (e != null && e < Y_MIN) return false; return true; });
  console.error('fetching geometry for ' + ov.length + ' relations into ' + CACHE);
  await fetchGeom(CACHE, ov.map(x => x.id));
  console.error('done');
} else await build({ report: true });
