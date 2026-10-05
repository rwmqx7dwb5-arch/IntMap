#!/usr/bin/env node
/* ==========================================================================
 * scripts/build-hist-admin-recon.mjs   (hist-reconstruction)
 *
 * data/hist-admin-recon.js — FIRST-LEVEL UNITS INTMAP RECONSTRUCTS ITSELF, where no published record
 * (OpenHistoricalMap, a publisher's dated atlas) answers and the present-day outline cannot simply be
 * carried back (data/hist-admin-fill.js refuses: «undated», «before-set-floor», a layout that no longer
 * exists).
 *
 * ══ THE METHOD (approved on the Meiji pilot, scripts/histrecon/build-meiji-v2.mjs) ════════════════════
 *   A unit on a span is a UNION OF ATOMS — finer units whose boundaries are the historical lines — and
 *   every membership is a stated fact with a citation. Nothing is drawn by hand, smoothed, interpolated
 *   or guessed. The facts live in one dossier per country (scripts/histrecon/dossiers/<ISO3>.json,
 *   format in docs/HIST-RECONSTRUCTION.md); scripts/histrecon/dossier-check.mjs refuses a dossier unless
 *     ③ every atom belongs to exactly one unit at every instant (or is named outside / unresolved),
 *     ② the number of units equals what the sources state on their dates,
 *     ④ every span cites a source,
 *   and this file measures what needs geometry:
 *     · test 3 (the SAME test data/hist-admin-fill.js applies, imported, not copied): the ground must lie
 *       in a polity the era map draws on that date, and not straddle two — the dossier's claim about the
 *       country is checked against the map the reader sees;
 *     · test 4: a span yields to OpenHistoricalMap and to every publisher's record (answeredSpans, the
 *       shared yield) — a reconstruction is the weaker claim wherever a dated record states the unit.
 *   What a test withholds is reported with its reason; nothing disappears silently.
 *
 * ══ PRECEDENCE ═══════════════════════════════════════════════════════════════════════════════════════
 *   OpenHistoricalMap > publishers' records > THIS RECORD > the present-day outline carried back.
 *   The fill yields to this record (recordFiles() in build-hist-admin-fill.mjs reads HIST_ADMIN_GAPS'
 *   `reconstructed` flag): a cited timeline outranks «Wikidata says the name was founded in D».
 *
 * ══ PRECISION ════════════════════════════════════════════════════════════════════════════════════════
 *   Atoms are read at the precision their publisher released (Natural Earth 10m at full precision, not the
 *   0.01° data/admin1-world.json.gz). The bundle is simplified to data/hist-admin1.js's tolerance for the
 *   overview only; data/border-detail serves the unsimplified union when the reader zooms in.
 *
 * Usage:  node scripts/build-hist-admin-recon.mjs [--only ISO3] [--report <file.json>]
 *         node scripts/build-hist-admin-recon.mjs --check      verify dossiers + committed bundle, offline
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';
import { simplifyGeoJSON } from './lib/elections-geo.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { checkDossier, norm } from './histrecon/dossier-check.mjs';
import { samplePoints, hitMask, answeredSpans, eraIndex, recordUnits, recordFiles, LOCATED_MIN, STRADDLE_MAX, OVERLAP_MIN } from './build-hist-admin-fill.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIERS = path.join(ROOT, 'scripts', 'histrecon', 'dossiers');
const ATOMS = path.join(ROOT, 'scripts', 'histrecon', 'atoms');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ONLY = argOf('--only', null);
const G = HIST_ADMIN_GAPS.find((g) => g.reconstructed);
const LEVEL = 4;
const REPO = 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/';

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。 */
export const GOVERNANCE = {
  'data/hist-admin-recon.js': {
    upstreams: [
      { publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'Public domain',
        licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', attribution: false, creditRequired: false,
        paidBy: 'Natural Earth' },
      { publisher: 'IntMap', url: 'https://github.com/rwmqx7dwb5-arch/IntMap/tree/main/scripts/histrecon', licence: 'IntMap licence (LICENSE)',
        licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE', attribution: false, creditRequired: false,
        paidBy: 'IntMap — reconstructed historical first-level divisions: dossiers of cited facts' },
      { publisher: 'Electronic Repository of Russian Historical Statistics (RISTAT)', url: 'https://doi.org/10.34894/NQOASN', licence: 'CC0 1.0 with a request for attribution',
        licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: true, creditRequired: false,
        paidBy: 'Electronic Repository of Russian Historical Statistics (RISTAT) — Russian Empire Historical GIS Maps, 1897 (CC0 1.0)' },
      { publisher: '国土交通省 国土数値情報（行政区域データ N03, 1920）', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2015.html',
        licence: '国土数値情報ダウンロードサイトコンテンツ利用規約（旧国土情報利用約款準拠版）', licenceUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html', attribution: true, creditRequired: true,
        paidBy: '国土交通省 国土数値情報 行政区域データ（N03・1920 年 1 月 1 日時点）— 明治の府県の復元の部品' },
      { publisher: '政府統計の総合窓口(e-Stat)', url: 'https://www.e-stat.go.jp/gis', licence: '政府標準利用規約（第2.0版）',
        licenceUrl: 'https://www.e-stat.go.jp/terms-of-use', attribution: true, creditRequired: true,
        paidBy: '政府統計の総合窓口（e-Stat）国勢調査 2020 年 小地域（町丁・字等別）境界データ — 明治の府県の復元で旧村を切り分ける部品' },
    ],
    cadence: 'static',
    cadenceBasis: { observed: 'on 2026-10-05 every atom set is pinned (Natural Earth commit ca96624, RISTAT version 3, N03 1920, e-Stat 2020); the record changes only when the research in a dossier changes', expires: 'when a dossier is revised or an atom set is re-pinned', canon: 'scripts/histrecon/atoms/*.mjs SET and scripts/histrecon/dossiers/*.json' },
    builtBy: 'scripts/build-hist-admin-recon.mjs',
  },
};

const ymd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return y * 10000 + m * 100 + d; };
const isoOf = (v) => { const y = Math.floor(v / 10000), m = Math.floor(v / 100) % 100, d = v % 100; return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
const addDay = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
/* the era outlines' resolution: data/hist-borders.js and CShapes as shipped carry ~19.4 vertices per degree
   (measured by scripts/build-hist-admin-fill.mjs's own comment, #R719) — a vertex every ~0.05°; twice that */
const ERA_RES = 0.1;
const SHIFTS = [[ERA_RES, 0], [-ERA_RES, 0], [0, ERA_RES], [0, -ERA_RES], [ERA_RES, ERA_RES], [ERA_RES, -ERA_RES], [-ERA_RES, ERA_RES], [-ERA_RES, -ERA_RES]];

/** the smaller of: the share of this unit's sample points the other units cover, and the share of theirs this covers */
function sameUnit(polys, pts, others) {
  let a = 0; const m = new Uint8Array(pts.length);
  for (const r of others) { const h = hitMask(r.polys, pts); for (let i = 0; i < h.length; i++) if (h[i]) m[i] = 1; }
  for (let i = 0; i < m.length; i++) a += m[i];
  let b = 0, n = 0;
  for (const r of others) { const op = samplePoints(r.polys); const h = hitMask(polys, op); n += op.length; for (let i = 0; i < h.length; i++) b += h[i]; }
  return Math.min(pts.length ? a / pts.length : 0, n ? b / n : 0);
}
const dayOf = (v) => Date.parse(isoOf(v) + 'T00:00:00Z') / 864e5;

export function dossierFiles() {
  if (!fs.existsSync(DOSSIERS)) return [];
  return fs.readdirSync(DOSSIERS).filter((n) => /^[A-Z]{3}(-[a-z0-9-]+)?\.json$/.test(n)).sort().map((n) => path.join(DOSSIERS, n));
}
/** reconstructions that hand over finished shapes (scripts/histrecon/assembled/*.mjs: KEY, COUNTRY, candidates()) */
async function assemblers() {
  const dir = path.join(ROOT, 'scripts', 'histrecon', 'assembled');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) out.push(await import(pathToFileURL(path.join(dir, f)).href));
  return out;
}
async function atomModule(set) {
  for (const f of fs.readdirSync(ATOMS).filter((n) => n.endsWith('.mjs'))) {
    const m = await import(pathToFileURL(path.join(ATOMS, f)).href);
    if (m.SET === set) return m;
  }
  throw new Error('no atom module declares SET = ' + set);
}

/** the dossiers, each checked; a dossier that fails ③②④ stops the build */
export async function loadDossiers() {
  const out = [], mods = new Map(), bad = [];
  for (const f of dossierFiles()) {
    const D = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (ONLY && D.country !== ONLY) continue;
    if (!mods.has(D.atomSet)) { const m = await atomModule(D.atomSet); mods.set(D.atomSet, { m, cat: await m.catalogue() }); }
    const r = checkDossier(D, mods.get(D.atomSet).cat);
    if (r.err.length) bad.push(path.basename(f) + ': ' + r.err.slice(0, 5).join(' | '));
    out.push({ file: f, D });
  }
  /* two dossiers of one polity on one atom set must not claim the same atoms */
  const claim = new Map();
  for (const { file, D } of out) {
    const key = D.atomSet + '|' + D.country;
    const cat = mods.get(D.atomSet).cat[D.country] || [];
    const mine = D.atomGroups ? cat.filter((a) => D.atomGroups.includes(a.group)) : cat;
    if (!claim.has(key)) claim.set(key, new Map());
    for (const a of mine) { const prev = claim.get(key).get(a.id); if (prev) bad.push(path.basename(file) + ': atom ' + a.id + ' is also covered by ' + prev); else claim.get(key).set(a.id, path.basename(file)); }
  }
  return { dossiers: out, mods, bad };
}

function bboxOf(polys) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}

async function build() {
  const { dossiers, mods, bad } = await loadDossiers();
  if (bad.length) { console.error('✖ dossiers refused:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.error('· ' + dossiers.length + ' dossier(s)');
  const geomOf = new Map();
  for (const [set, { m }] of mods) geomOf.set(set, await m.geometries());
  const era = eraIndex();
  /* the records it yields to — never its own previous build */
  const rec = recordUnits(recordFiles().filter((f) => f !== G.file));
  console.error('· record units consulted for the yield: ' + rec.length);

  const unionMemo = new Map();
  const unionOf = (set, atoms) => {
    const key = set + '|' + atoms.slice().sort().join(',');
    if (unionMemo.has(key)) return unionMemo.get(key);
    const gs = atoms.map((a) => geomOf.get(set).get(a)).filter(Boolean);
    if (gs.length !== atoms.length) throw new Error('atom without geometry in ' + key);
    const u = gs.length === 1 ? gs[0] : pc.union(...gs);
    unionMemo.set(key, u);
    return u;
  };

  /* ── the candidates: one per (unit, span) — from dossiers (unions of atoms) and from the assemblers in
     scripts/histrecon/assembled/ (a reconstruction that needs more than a union, e.g. Meiji's partly moved
     villages cut with ōaza — it runs its own criteria and hands over finished shapes) ─────────────────── */
  const groups = [];
  for (const { file, D } of dossiers) {
    const scopeEnd = addDay(norm(D.scope.to));
    const list = [];
    for (const u of D.units) for (const [k, s] of u.spans.entries()) {
      list.push({ unit: u, span: s, k, from: ymd(norm(s.from)), to: ymd(s.to != null ? norm(s.to) : scopeEnd),
        polys: () => unionOf(D.atomSet, s.atoms).map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length) });
    }
    groups.push({ key: path.basename(file, '.json'), country: D.country, file: path.relative(ROOT, file).split(path.sep).join('/'), units: D.units.length, unresolved: (D.unresolved || []).length, list });
  }
  for (const m of await assemblers()) {
    if (ONLY && m.COUNTRY !== ONLY) continue;
    const g = await m.candidates({ log: (x) => console.error('    ' + x) });
    groups.push({ key: m.KEY, country: m.COUNTRY, file: g.file, units: g.units, unresolved: g.unresolved, list: g.list.map((c) => ({ ...c, polys: () => c.polys })) });
  }

  const rows = [], report = { built: new Date().toISOString().slice(0, 10), records: {} };
  for (const grp of groups) {
    const t0 = Date.now();
    const R = report.records[grp.key] = { country: grp.country, file: grp.file, units: grp.units, spans: 0, drawn: 0, withheld: [], yielded: 0, unresolved: grp.unresolved };
    for (const c of grp.list) {
      R.spans++;
      const { unit: u, span: s, k, from, to } = c;
      const polys = c.polys();
      const pts = samplePoints(polys);
      const box = bboxOf(polys);
      /* test 3 — the era map must place this ground in one polity on the span */
      const near = era.meeting(box);
      let nearWide = null;
      const hits = near.map((eu) => { const m = hitMask(eu.polys, pts); let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return { n, m }; });
      /* the same points moved by the era outline's own resolution — asked only where the era map places none of
         this ground (below) */
      const shifted = new Map();
      const movedPts = SHIFTS.map(([dx, dy]) => Object.assign(pts.map((p) => [p[0] + dx, p[1] + dy, p[2]]), { vertex: pts.vertex }));
      const nearBy = (q) => {
        if (!shifted.has(q)) shifted.set(q, movedPts.some((mp) => hitMask(nearWide[q].polys, mp).some((h) => h)));
        return shifted.get(q);
      };
      const bps = new Set();
      for (const eu of near) { if (eu.s > from && eu.s < to) bps.add(eu.s); if (eu.e > from && eu.e < to) bps.add(eu.e); }
      if (era.present > from && era.present < to) bps.add(era.present);
      let alive = [], cur = from, last = null;
      for (const stop of [...bps].sort((p, q) => p - q).concat([to])) {
        const present = cur >= era.present;
        let located = 0, best = 0;
        const claimed = new Uint8Array(pts.length);
        for (let q = 0; q < near.length; q++) {
          if (!(near[q].s <= cur && near[q].e > cur && hits[q].n)) continue;
          let own = 0; const m = hits[q].m;
          for (let i = 0; i < pts.length; i++) if (m[i]) { own++; if (!claimed[i]) { claimed[i] = 1; located++; } }
          if (own > best) best = own;
        }
        let answered = present || (located > 0 && (pts.vertex || located / pts.length >= LOCATED_MIN));
        let ok = present ? true : answered ? (located - best) / located <= STRADDLE_MAX : (last ?? false);
        /* ⚠ GROUND THE ERA OUTLINE LEAVES IN THE SEA BY ITS OWN COARSENESS IS NOT GROUND NO POLITY HELD.
           MEASURED 2026-10-05 on the first full build: Conakry, Labuan, San Andrés, Batanes, Cotabato City, Lapu-Lapu
           City and Jervis Bay — capitals, islands and coastal cities the dossiers place with laws — were withheld as
           «no polity on this ground», because the era outlines carry ~19.4 points per degree and their coast passes
           seaward of a peninsula or misses a small island. ⇒ where the era map places NONE of the unit's points, the
           points moved by ERA_RES (twice the era outline's vertex spacing) in eight directions are asked; if exactly
           one polity in force answers, the ground is read as that polity's. Two answering is not resolved this way:
           a unit the coarse lines put between two polities stays withheld (straddle is decided only on real hits). */
        if (!present && located === 0) {
          const by = new Set();
          nearWide ??= era.meeting([box[0] - ERA_RES, box[1] - ERA_RES, box[2] + ERA_RES, box[3] + ERA_RES]);
          for (let q = 0; q < nearWide.length; q++) if (nearWide[q].s <= cur && nearWide[q].e > cur && nearBy(q)) by.add(nearWide[q].id);
          if (by.size === 1) { answered = true; ok = true; }
        }
        if (answered) last = ok;
        if (ok) alive.push([cur, stop]);
        else R.withheld.push({ unit: u.id, span: k, from: isoOf(cur), to: isoOf(stop), why: answered ? 'the era map divides this ground between polities (straddle ' + Math.round((located - best) / located * 100) + '%)' : 'the era map places no polity on this ground', test: 3 });
        cur = stop;
      }
      alive = alive.reduce((acc, iv) => { const l = acc[acc.length - 1]; if (l && l[1] === iv[0]) l[1] = iv[1]; else acc.push(iv.slice()); return acc; }, []);
      /* test 4 — yield to the dated records */
      const ans = answeredSpans(pts, box, rec, from, to);
      for (const iv of ans.spans) {
        const before = alive.reduce((acc, x) => acc + x[1] - x[0], 0);
        alive = alive.flatMap(([p, q]) => (iv[1] <= p || iv[0] >= q) ? [[p, q]] : [[p, iv[0]], [iv[1], q]].filter((x) => x[1] > x[0]));
        if (alive.reduce((acc, x) => acc + x[1] - x[0], 0) !== before) R.yielded++;
      }
      /* ⚠ A LEFTOVER SHORTER THAN A YEAR BESIDE AN ANSWERED SPAN IS A DATE DISAGREEMENT ONLY IF THE RECORD BESIDE IT
         IS THE SAME UNIT. build-hist-admin-surveys.mjs drops every such piece; for a reconstruction that is wrong.
         MEASURED 2026-10-05 on the Meiji record: OpenHistoricalMap's 滋賀県 begins 1872-09-28 — the day 犬上県 was
         merged into it — with the whole of present Shiga, and the rule dropped the seven months before it in which
         滋賀県 was the southern half and 犬上県 the northern: two real units nobody else states, not a seam.
         ⇒ a piece is a seam when the record's unit in force just before or just after it IS this unit: each covers
         at least 1 − OVERLAP_MIN of the other's sample points (the same share answeredSpans uses for «answers»,
         read both ways). ⚠ Not an area ratio: the first version compared areas and read OHM's 滋賀県 (Lake Biwa
         inside) against the 1920 survey's (lake outside) as 1.2 — two outlines of one unit, judged different.
         Otherwise the piece is a different configuration and is kept.
         ⚠ The 1872 case also shows OHM writing a pre-1873 Japanese date in the lunisolar calendar as if Gregorian
         (明治5年9月28日 is 1872-10-30; OHM states 1872-09-28) — this record yields to it by precedence and the
         month is reported, not corrected here. */
      if (ans.spans.length) {
        alive = alive.filter(([p, q]) => {
          if (dayOf(q) - dayOf(p) >= 366) return true;
          /* the record's units in force just before and just after the piece — a seam if EITHER side is this unit */
          const sides = [ans.spans.some((iv) => iv[1] === p) ? p - 1 : null, ans.spans.some((iv) => iv[0] === q) ? q : null].filter((t) => t != null);
          if (!sides.length) return true;
          let ratio = 0, seam = false;
          for (const t of sides) {
            const beside = ans.who.filter((r) => r.s <= t && r.e > t);
            if (!beside.length) continue;
            const x = sameUnit(polys, pts, beside);
            ratio = Math.max(ratio, x);
            if (x >= 1 - OVERLAP_MIN) { seam = true; break; }
          }
          if (seam) R.withheld.push({ unit: u.id, span: k, from: isoOf(p), to: isoOf(q), why: 'a sliver beside a dated record of the same unit (mutual cover ' + ratio.toFixed(2) + '): the two records disagree on the date by < 1 year', test: 4 });
          return !seam;
        });
      }
      for (const [p, q] of alive) {
        rows.push({ country: grp.country, key: grp.key, unit: u, span: s, k, a: p, b: q, polys, dossier: grp.file, dates: c.dates || null, startStated: p === from, endStated: q === to && s.to != null });
        R.drawn++;
      }
    }
    console.error('  ' + grp.key + ': ' + R.units + ' units, ' + R.spans + ' spans → ' + R.drawn + ' rows · yielded ' + R.yielded + ' · withheld ' + R.withheld.length + ' · unresolved ' + R.unresolved + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  return { rows, report };
}

/** the full-precision outlines of one record (a dossier's basename or an assembler's KEY), for
    scripts/build-border-detail.mjs: [{ id: unit id, coords: MultiPolygon }] — every span's union, so the
    detail builder can take the one whose simplification IS the shipped row (its byte-for-byte proof). */
export async function fineUnits(recordKey) {
  const out = [];
  for (const f of dossierFiles()) {
    if (path.basename(f, '.json') !== recordKey) continue;
    const D = JSON.parse(fs.readFileSync(f, 'utf8'));
    const geom = await (await atomModule(D.atomSet)).geometries();
    const memo = new Map();
    for (const u of D.units) for (const s of u.spans) {
      const key = s.atoms.slice().sort().join(',');
      if (!memo.has(key)) { const gs = s.atoms.map((a) => geom.get(a)); memo.set(key, gs.length === 1 ? gs[0] : pc.union(...gs)); }
      out.push({ id: u.id, coords: memo.get(key) });
    }
  }
  for (const m of await assemblers()) {
    if (m.KEY !== recordKey) continue;
    for (const c of (await m.candidates()).list) out.push({ id: c.unit.id, coords: c.polys });
  }
  return out;
}

/* the overview's simplification is the first tier's: its tolerance, and its decimals where it states them — else 4,
   the same fallback build-hist-admin-surveys.mjs applies to the same bundle.
   ⚠ (hist-reconstruction) MEASURED 2026-10-05: the first version GUESSED the decimals from the first coordinates
   in the file's head; the head is now all `dates`, the guess was Math.max() of nothing = −Infinity, and every
   shipped coordinate came out null (2,005 rows, 458 «distinct» rings that were all [null,null]). */
function readTol() {
  const head = fs.readFileSync(path.join(ROOT, 'data', 'hist-admin1.js'), 'utf8').slice(0, 4000);
  const tol = Number(/"tolerance":([0-9.]+)/.exec(head)[1]);
  const m = /"decimals":(d+)/.exec(head);
  const dec = m ? Number(m[1]) : 4;
  if (!(tol > 0) || !Number.isInteger(dec)) throw new Error('data/hist-admin1.js: no usable tolerance/decimals (' + tol + ', ' + dec + ')');
  return { tol, dec };
}

function write(rows, file, tol, dec) {
  rows = rows.slice().sort((p, q) => p.a - q.a || (p.country < q.country ? -1 : p.country > q.country ? 1 : p.unit.id < q.unit.id ? -1 : 1));
  const rings = [], ringKey = new Map(), feats = [], dates = {}, sources = {};
  const pool = (r) => { const k = JSON.stringify(r); let i = ringKey.get(k); if (i == null) { i = rings.push(r) - 1; ringKey.set(k, i); } return i; };
  const simplified = new Map();
  rows.forEach((r, i) => {
    let polys = r.polys;
    if (tol > 0) {
      if (!simplified.has(polys)) {
        const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: tol, decimals: dec });
        const g = fc.features[0].geometry;
        simplified.set(polys, g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
      }
      polys = simplified.get(polys);
    }
    const key = 'recon:' + r.key;
    sources[key] ||= { publisher: 'IntMap', title: 'Reconstructed first-level divisions — ' + r.key + ' (one cited fact per membership)', url: REPO + r.dossier,
      citation: 'IntMap reconstruction from cited facts (' + r.dossier + ').' };
    const [sy, sm, sd] = isoOf(r.a).split('-').map(Number), [ey, em, ed] = isoOf(r.b).split('-').map(Number);
    const names = { en: r.unit.names.en, ...(r.unit.names.ja ? { ja: r.unit.names.ja } : {}), ...(r.unit.names.local ? { local: r.unit.names.local } : {}) };
    feats.push([r.unit.names.en, LEVEL, sy, sm, sd, ey, em, ed, polys.map((p) => p.map(pool)), names, key, r.unit.id, r.country]);
    const prec = r.span.precision || (String(r.span.from).length === 4 ? 'year' : String(r.span.from).length === 7 ? 'month' : 'day');
    dates[i] = r.dates && r.startStated && r.endStated ? r.dates : {
      start: r.startStated ? { raw: String(r.span.from), precision: prec } : { raw: isoOf(r.a), precision: 'day', derived: true, basis: 'the era map or a dated record changes on this day' },
      end: r.endStated ? { raw: String(r.span.to), precision: String(r.span.to).length === 10 ? 'day' : String(r.span.to).length === 7 ? 'month' : 'year' }
        : { raw: isoOf(r.b), precision: 'day', derived: true, basis: r.span.to == null ? 'the dossier\'s scope ends' : 'the era map or a dated record changes on this day' },
      ...(r.unit.wikidata ? { wikidata: r.unit.wikidata } : {}),
    };
  });
  const data = { v: 1, src: 'IntMap reconstruction: first-level units as unions of Natural Earth admin-1 (public domain), one cited fact per membership (scripts/histrecon/dossiers) · assembled by scripts/build-hist-admin-recon.mjs',
    built: new Date().toISOString().slice(0, 10), tolerance: tol, decimals: dec, levels: [LEVEL], dateSemantics: 'exclusive-end', reconstructed: true, sources, dates, rings, feats };
  fs.writeFileSync(file, 'window.' + G.global + '=' + JSON.stringify(data) + ';\n');
  console.error('· wrote ' + path.relative(ROOT, file) + ' ' + (fs.statSync(file).size / 1e6).toFixed(2) + ' MB | rows ' + feats.length + ' | rings ' + rings.length);
  return data;
}

/* ── --check: the committed dossiers and bundle, offline ───────────────────────────────────────── */
async function check() {
  let fail = 0;
  const F = (m) => { console.log('  ✖ ' + m); fail++; };
  const { dossiers, bad } = await loadDossiers();
  for (const b of bad) F('dossier ' + b);
  const file = path.join(ROOT, G.file);
  if (!fs.existsSync(file)) { if (dossiers.length) F(G.file + ' missing while ' + dossiers.length + ' dossier(s) exist'); }
  else {
    const w = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: w });
    const d = w[G.global];
    /* a row names its record by its source key «recon:<record>» — a dossier's basename (one polity may have
       several: RUE-north, RUE-west…) or an assembler's KEY, which states its own units and their spans */
    const byKey = new Map(dossiers.map(({ file, D }) => [path.basename(file, '.json'), D]));
    const asm = new Map();
    for (const m of await assemblers()) if (typeof m.statedSpans === 'function') asm.set(m.KEY, m.statedSpans());
    d.feats.forEach((f, i) => {
      const key = String(f[10] || '').replace(/^recon:/, '');
      const a = f[2] * 10000 + f[3] * 100 + f[4], b = f[5] * 10000 + f[6] * 100 + f[7];
      if (!d.dates[i] || !d.dates[i].start) F('row ' + i + ' has no date record');
      let spans, scopeEnd;
      const D = byKey.get(key);
      if (D) {
        if (D.country !== f[12]) return F('row ' + i + ' names country ' + f[12] + ' but its record ' + key + ' is ' + D.country);
        const u = D.units.find((x) => x.id === f[11]);
        if (!u) return F('row ' + i + ' names unit ' + f[11] + ' which ' + key + ' does not have');
        spans = u.spans; scopeEnd = ymd(addDay(norm(D.scope.to)));
      } else if (asm.has(key)) {
        const st = asm.get(key);
        spans = st.units.get(f[11]);
        if (!spans) return F('row ' + i + ' names unit ' + f[11] + ' which the assembler ' + key + ' does not state');
        scopeEnd = ymd(st.scopeEnd);
      } else return F('row ' + i + ' names record ' + key + ' which no dossier or assembler is');
      const inside = spans.some((s) => ymd(norm(s.from)) <= a && (s.to == null ? scopeEnd : ymd(norm(s.to))) >= b);
      if (!inside) F('row ' + i + ' (' + f[11] + ' ' + a + '…' + b + ') lies outside every span its record states');
    });
    if (!fail) console.log('  ✓ ' + d.feats.length + ' rows, each inside a span its dossier states');
  }
  console.log(fail ? '✖ check:histrecon — ' + fail + ' failure(s)' : '✓ check:histrecon');
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!G) { console.error('HIST_ADMIN_GAPS has no `reconstructed` record (js/border-coast.js)'); process.exit(2); }
  if (args.includes('--check')) await check();
  else {
    const { rows, report } = await build();
    const { tol, dec } = readTol();
    if (!ONLY) write(rows, path.join(ROOT, G.file), tol, dec);
    const rep = argOf('--report', null);
    if (rep) fs.writeFileSync(rep, JSON.stringify(report, null, 1));
  }
}
