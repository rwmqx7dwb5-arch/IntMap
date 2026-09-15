#!/usr/bin/env node
/* ============================================================================
 *  hist-fidelity.mjs — what the historical map actually CLAIMS  (#R730)
 * ----------------------------------------------------------------------------
 *  「地方区分のcoverageが一部だけだったりする！ふざけんな！」
 *  「機械的だけでなく、歴史考証的なやり方で検証していって。（いずれは全時代、全地域を）」
 *
 *  #R719 measured the first half of that — the share of the world's land carrying a first-level
 *  subdivision — on a 0.25° grid, wrote the three numbers it got into a COMMENT at the top of
 *  scripts/build-hist-admin-fill.mjs, and threw the measuring code away. So the next round could
 *  not tell whether the number had moved, and no gate could fail when it got worse.
 *  [[intmap-discovered-list-is-a-photograph]] — the instrument is the thing to keep.
 *
 *  ⚠⚠⚠ AND THE SECOND HALF IS WHY THIS FILE MEASURES THREE THINGS, NOT ONE. Coverage alone
 *  rewards the wrong repair: the cheapest way to raise it is to draw a unit in years nobody
 *  placed it in, and that is exactly the defect #R730 found already shipping —
 *
 *      48 of the ritsuryō provinces and the circuits of the 五畿七道 were drawn from 200 BC,
 *      and 壱岐国 · 安房国 · 東海道 · 山陰道 · 西海道 were still on the map in 1900 and today,
 *      seventy years after 廃藩置県 (1871-08-29) abolished the system. The Shanghai
 *      International Settlement (1863) and French Concession (1849) were drawn from 200 BC too.
 *
 *  Every one of those is a HIGHER coverage number than the truth, and every gate was green,
 *  because a gate measures form and the map publishes a claim. So the three measures are taken
 *  together and the gate reads them together:
 *
 *    1. UNSOURCED SPANS  — rows drawn from a date no upstream stated.  Must be 0.
 *    2. DOUBLE CLAIM     — the same unit drawn twice over one instant. May not grow.
 *    3. COVERAGE         — land, per year and per polity, carrying a first-level unit.
 *
 *  Run:
 *    node scripts/hist-fidelity.mjs --check        the gate (npm run check:histfidelity)
 *    node scripts/hist-fidelity.mjs --report       all three, with the per-polity table
 *    node scripts/hist-fidelity.mjs --year 1900 --in 128,30,146,46
 *                                                  list what is drawn there, that year
 *    node scripts/hist-fidelity.mjs --update       re-record the observations in data/
 *
 *  ⚠ `--year` IS NOT A CONVENIENCE. .agents/rules/historical-verification.md §2-1 requires
 *  naming a year and a place and READING WHAT IS DRAWN, because that is how the ritsuryō
 *  provinces were found: every aggregate was green, and the list for Japan in 1900 read
 *  「滋賀県, 壱岐国, 安房国, 東海道, 山陰道, 西海道」.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const OBSERVED = 'data/hist-fidelity.json';

/* ── the shipped bundles, read the way the browser reads them ───────────────────────────── */
const load = (rel) => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
};
/* ⚠ THE TIERS AND THE GAP RECORDS ARE DISCOVERED FROM data/, NOT LISTED HERE. js/time-admin1.js
   builds T1/T2/T3 and its GAPS list from the bundles present; a hand-written copy of that list
   silently drops the fourth record the day one is added (.agents/rules/no-ad-hoc-hardcoding.md §2-4). */
const bundles = () => fs.readdirSync(path.join(ROOT, 'data'))
  .filter((f) => /^hist-(admin\d|admin-fill|kuni)\.js$/.test(f))
  .map((f) => ({ file: 'data/' + f, b: load('data/' + f) }))
  .sort((a, b) => Math.min(...a.b.levels) - Math.min(...b.b.levels));

/* ── dates ─────────────────────────────────────────────────────────────────────────────── */
const cmp = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]);
const inForce = (f, y, m, d) => cmp([f[2], f[3], f[4]], [y, m, d]) <= 0 && cmp([y, m, d], [f[5], f[6], f[7]]) < 0;
const spanOverlap = (a, b) => cmp([a[2], a[3], a[4]], [b[5], b[6], b[7]]) < 0 && cmp([b[2], b[3], b[4]], [a[5], a[6], a[7]]) < 0;

/* ══ 1. UNSOURCED SPANS ═══════════════════════════════════════════════════════════════════
   The question is not «is the span well formed» — check:histadmin already asks that, and it was
   green over every row below — but «did anybody SAY it».
   ⚠ THE MARK IS IN THE RECORD, NOT IN A LIST OF NAMES: build-hist-admin1.mjs writes
   `dates[id].start.raw = null` when upstream stated no start, so the defect names itself and the
   next one arrives already counted. [[intmap-restate-the-defect-not-the-fix]]
   ⚠ An absent END is upstream's way of saying «still in force», which IS a statement. An absent
   START is not: nothing about the unit says when it began, so every date the map draws it at is
   the map's own invention. */
function unsourcedSpans(bs) {
  const rows = [];
  for (const { file, b } of bs) {
    const dates = b.dates || {};
    for (const f of b.feats) {
      const d = dates[f[10]];
      if (!d) continue;
      /* ⚠ «STATED» AND «DERIVED» ARE BOTH ANSWERS; «INHERITED FROM AN OLD BUILD» IS NOT.
         A start upstream wrote is a statement. A start histadmin/class-dates.mjs derived from the
         unit's own system carries `derived` saying how, and js/time-admin1.js draws it in the
         derived line's style so the reader is told. The fossil `boundary: preserved-display-bound`
         is neither, and it is what put 令制国 in 200 BC. */
      if (!(d.start && (d.start.raw || d.start.derived))) {
        rows.push({ file, id: f[10], name: f[0], level: f[1],
          from: [f[2], f[3], f[4]].join('-'), end: (d.end && d.end.raw) || null });
      }
    }
  }
  return rows;
}

/* ══ 2. DOUBLE CLAIM ══════════════════════════════════════════════════════════════════════
   Two units of the SAME admin_level over the same ground at the same instant is one of three
   different things, and they are not interchangeable (historical-verification.md §2-5):
     a DISPUTE   — both really did claim it (Alaska boundary dispute, Essequibo, Acre)
     a DUPLICATE — upstream holds the unit twice (Закаспійская область, 1881, twice)
     a SEAM      — year precision on both sides of a handover ([1938..1949] × [1948..1973])
   What separates them mechanically is the identity of the unit, so that is what is counted: the
   same NAME at the same LEVEL over an OVERLAPPING span is a duplicate or a seam, never a
   dispute, because a polity does not dispute ground with itself. */
function selfOverlaps(bs) {
  const out = [];
  for (const { file, b } of bs) {
    const by = new Map();
    b.feats.forEach((f, i) => { const k = f[0] + '\t' + f[1]; if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
    for (const [, idx] of by) {
      if (idx.length < 2) continue;
      for (let a = 0; a < idx.length; a++) for (let c = a + 1; c < idx.length; c++) {
        const A = b.feats[idx[a]], B = b.feats[idx[c]];
        if (!spanOverlap(A, B)) continue;
        const identical = A[2] === B[2] && A[3] === B[3] && A[4] === B[4] && A[5] === B[5] && A[6] === B[6] && A[7] === B[7];
        const nested = !identical && (cmp([A[2], A[3], A[4]], [B[2], B[3], B[4]]) <= 0 && cmp([B[5], B[6], B[7]], [A[5], A[6], A[7]]) <= 0
          || cmp([B[2], B[3], B[4]], [A[2], A[3], A[4]]) <= 0 && cmp([A[5], A[6], A[7]], [B[5], B[6], B[7]]) <= 0);
        out.push({ file, name: A[0], level: A[1], ids: [A[10], B[10]], kind: identical ? 'identical' : nested ? 'nested' : 'seam' });
      }
    }
  }
  return out;
}

/* ══ 3. COVERAGE ══════════════════════════════════════════════════════════════════════════
   ⚠ MEASURED AS AREA, NOT AS A COUNT. «654 units in force in 1900» cannot show «一部だけ»:
   France was 2% of its own land and the count said nothing.
   [[intmap-coverage-counted-is-not-coverage-seen]]
   The denominator is the land the map itself puts inside a polity that year — the same three
   records js/time-borders.js dispatches over — so the fraction answers the reader's question
   («of the world I can see, how much has provinces drawn on it») and not a cartographic one. */
const RES = Number(arg('--res', '0.25'));
const NX = Math.round(360 / RES), NY = Math.round(180 / RES);
const latC = (j) => -90 + (j + 0.5) * RES;

/* even-odd scanline fill: every ring of a polygon is crossed on the row's own latitude, so a
   hole subtracts itself and no point-in-polygon test is run per cell. */
function scan(rings, cb) {
  let minY = 90, maxY = -90;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const j0 = Math.max(0, Math.floor((minY + 90) / RES - 0.5)), j1 = Math.min(NY - 1, Math.ceil((maxY + 90) / RES));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = latC(j); xs.length = 0;
    for (const r of rings) for (let k = 0, n = r.length; k < n; k++) {
      const a = r[k], b = r[(k + 1) % n];
      if ((a[1] <= y) === (b[1] <= y)) continue;
      xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.ceil((xs[k] + 180) / RES - 0.5), i1 = Math.floor((xs[k + 1] + 180) / RES - 0.5);
      if (i1 < 0 || i0 > NX - 1) continue;
      cb(j, Math.max(0, i0), Math.min(NX - 1, i1));
    }
  }
}

let _rec = null;
function records() {
  if (_rec) return _rec;
  const cs = load('data/cshapes.js'), hb = load('data/hist-borders.js'), er = load('data/hist-eras.js');
  /* ⚠ THE BANDS ARE DISCOVERED, NOT COPIED. js/time-borders.js holds CS_MIN/CS_MAX and
     HB_MIN/HB_MAX as constants; repeating the numbers here would put one fact in two places
     (.agents/rules/no-ad-hoc-hardcoding.md §1). Each record already says how far it reaches —
     the OHM band publishes `window`, and CShapes' reach is the span of its own rows. */
  let csLo = Infinity, csHi = -Infinity;
  for (const f of cs.feats) { if (f[2] < csLo) csLo = f[2]; if (f[5] > csHi) csHi = f[5]; }
  _rec = { cs, hb, er, csLo, csHi, hbLo: hb.window[0], hbHi: hb.window[1] };
  return _rec;
}
function politiesAt(y) {
  const { cs, hb, er, csLo, csHi, hbLo, hbHi } = records(), out = [];
  if (y >= csLo && y <= csHi) {
    for (const f of cs.feats) if (inForce(f, y, 7, 1)) out.push({ nm: f[0], polys: f[8], rings: cs.rings });
    return out;
  }
  if (y >= hbLo && y <= hbHi) {
    for (const f of hb.feats) if (inForce(f, y, 7, 1)) out.push({ nm: (f[0] && f[0].en) || f[1], polys: f[8], rings: hb.rings });
    if (out.length) return out;   /* per instant, not per band: #R690 widened the window and OHM does not fill it evenly */
  }
  let best = null;
  for (const s of er.snaps) if (s.y <= y && (!best || s.y > best.y)) best = s;
  if (best) for (const f of best.feats) out.push({ nm: (f[0] && f[0].en) || '?', polys: f[2], rings: er.rings });
  return out;
}
/* Which admin_level is «first-level» is the shallowest bundle's own answer, not a number written
   here: that bundle is the one js/time-admin1.js draws at every zoom, and its `levels` say which
   values that is. A gap record joins it when its own `levels` intersect them. */
function firstLevelAt(bs, y) {
  const lv = new Set(bs[0].b.levels), out = [];
  for (const { b } of bs) {
    if (!(b.levels || []).some((x) => lv.has(x))) continue;
    for (const f of b.feats) if (lv.has(f[1]) && inForce(f, y, 7, 1)) out.push({ polys: f[8], rings: b.rings });
  }
  return out;
}
function coverage(bs, y) {
  const pol = politiesAt(y), adm = firstLevelAt(bs, y);
  const cid = new Int32Array(NX * NY).fill(-1), names = [];
  pol.forEach((c, ix) => {
    names.push(c.nm);
    for (const poly of c.polys) scan(poly.map((r) => c.rings[r]), (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) cid[base + i] = ix; });
  });
  const cov = new Uint8Array(NX * NY);
  for (const u of adm) for (const poly of u.polys) scan(poly.map((r) => u.rings[r]), (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) cov[base + i] = 1; });
  const tot = new Map(), hit = new Map();
  let T = 0, H = 0;
  for (let k = 0; k < cid.length; k++) {
    const c = cid[k];
    if (c < 0) continue;
    T++; tot.set(c, (tot.get(c) || 0) + 1);
    if (cov[k]) { H++; hit.set(c, (hit.get(c) || 0) + 1); }
  }
  const per = [...tot].map(([c, t]) => ({ nm: names[c], cells: t, pct: 100 * (hit.get(c) || 0) / t })).sort((a, b) => b.cells - a.cells);
  /* «一部だけ» is the user's own complaint and needs a line. A polity is WHOLE when the grid finds
     a unit over essentially all of it; the 5% slack is the resolution difference between a polity
     outline and a subdivision outline — the same quantity #R719 measured at 20% for a
     unit-inside-country test, smaller here because this asks about a WHOLE country, where the
     edge cells are a far smaller share of the total than they are for one province. */
  return { year: y, units: adm.length, polities: per.length, pct: 100 * H / T,
    zero: per.filter((p) => p.pct < 1).length,
    partial: per.filter((p) => p.pct >= 1 && p.pct < 95).length,
    full: per.filter((p) => p.pct >= 95).length, per };
}

/* ══ main ════════════════════════════════════════════════════════════════════════════════ */
function listYear(bs, y, box) {
  for (const { file, b } of bs) {
    const hits = [];
    for (const f of b.feats) {
      if (!inForce(f, y, 7, 1)) continue;
      let sx = 0, sy = 0, n = 0;
      for (const poly of f[8]) for (const ri of poly) for (const p of b.rings[ri]) { sx += p[0]; sy += p[1]; n++; }
      const cx = sx / n, cy = sy / n;
      if (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) continue;
      const d = (b.dates || {})[f[10]];
      const mark = !d || (d.start && d.start.raw) ? ''
        : d.start && d.start.derived ? '   · 開始日は上流に無く、同じ制度の他の単位から導出（' + d.start.bound + '）'
        : '   ⚠ 開始日を誰も述べていない';
      hits.push(`${f[0]} (L${f[1]} ${[f[2], f[3], f[4]].join('-')} → ${[f[5], f[6], f[7]].join('-')})${mark}`);
    }
    console.log(`${file}: ${hits.length}`);
    for (const h of hits) console.log('    ' + h);
  }
}

function main() {
  const bs = bundles();
  if (has('--year')) {
    return listYear(bs, parseInt(arg('--year', '1900'), 10), arg('--in', '-180,-90,180,90').split(',').map(Number));
  }

  const spans = unsourcedSpans(bs);
  const dupes = selfOverlaps(bs);
  const kinds = { identical: 0, nested: 0, seam: 0 };
  for (const d of dupes) kinds[d.kind]++;

  const observed = JSON.parse(fs.readFileSync(path.join(ROOT, OBSERVED), 'utf8'));
  const cov = observed.years.map((r) => coverage(bs, r.year));

  if (has('--update')) {
    const next = { ...observed, measured: new Date().toISOString().slice(0, 10), res: RES,
      unsourcedSpans: spans.length, selfOverlaps: kinds,
      years: cov.map((c) => ({ year: c.year, pct: +c.pct.toFixed(2), zero: c.zero, partial: c.partial, full: c.full })) };
    fs.writeFileSync(path.join(ROOT, OBSERVED), JSON.stringify(next, null, 2) + '\n');
    console.log('wrote ' + OBSERVED + ' — ' + spans.length + ' unsourced span(s), coverage ' + cov.map((c) => c.year + ':' + c.pct.toFixed(1) + '%').join(' '));
    return;
  }

  const problems = [], notes = [];
  const say = (ok, tag, msg) => { (ok ? notes : problems).push(`  ${ok ? 'ok  ' : '✖  '} ${tag}: ${msg}`); };

  say(spans.length === 0, 'unsourced-span', spans.length === 0
    ? `every one of ${bs.reduce((n, x) => n + x.b.feats.length, 0)} shipped rows is drawn from a date some upstream stated`
    : `${spans.length} row(s) are drawn from a date NO upstream states — ${spans.slice(0, 4).map((r) => `${r.name} (drawn from ${r.from})`).join(', ')}. A start nobody stated is not a start: resolve it from the unit's own record, or do not draw the unit at that date (.agents/rules/historical-verification.md §2-3)`);

  for (const k of ['identical', 'nested', 'seam']) {
    say(kinds[k] <= observed.selfOverlaps[k], 'double-claim-' + k,
      `${kinds[k]} pair(s) of one unit drawn twice over one instant (was ${observed.selfOverlaps[k]})`);
  }

  for (const c of cov) {
    const was = observed.years.find((r) => r.year === c.year);
    /* The grid is deterministic, so the floor is the last measurement itself. The slack exists
       for a simplification-tolerance change, not for drift: a round that lowers coverage on
       purpose (by removing a claim nobody made) re-records it with --update and says why. */
    say(c.pct >= was.pct - 0.5, 'coverage-' + c.year,
      `${c.pct.toFixed(1)}% of the land inside a polity carries a first-level unit (was ${was.pct}%) — 0%:${c.zero} 一部だけ:${c.partial} 丸ごと:${c.full}`);
  }

  if (has('--report')) {
    console.log('\n── 開始日を誰も述べていない行: ' + spans.length + ' 件');
    for (const r of spans.slice(0, 90)) console.log(`   ${r.file.replace('data/', '').padEnd(20)} ${r.name} (L${r.level})  地図は ${r.from} から描く / 上流が述べる終わり ${r.end || 'なし'}`);
    console.log('\n── 同じ単位が同じ瞬間に二度描かれる組: identical ' + kinds.identical + ' / nested ' + kinds.nested + ' / seam ' + kinds.seam);
    console.log('\n── 年ごとの被覆（母集合＝その年、地図が政体の中に置いている陸地）');
    for (const c of cov) {
      console.log(`   ${String(c.year).padStart(6)}  ${c.pct.toFixed(1).padStart(5)}%   単位 ${String(c.units).padStart(4)}  政体 ${String(c.polities).padStart(3)}   0%:${c.zero}  一部だけ:${c.partial}  丸ごと:${c.full}`);
      const bad = c.per.filter((p) => p.cells >= 40 && p.pct < 95).slice(0, 12);
      if (bad.length) console.log('           大きく欠けている政体: ' + bad.map((p) => `${p.nm} ${p.pct.toFixed(0)}%`).join(' · '));
    }
    console.log('');
  }

  for (const n of notes) console.log(n);
  for (const p of problems) console.log(p);
  console.log('\ncheck:histfidelity — the historical map is measured as a claim, not as a shape');
  if (problems.length) process.exit(1);
}
main();
