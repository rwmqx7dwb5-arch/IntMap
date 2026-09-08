/* ============================================================================
 *  #R531 · 「昔の国境は海岸より先まであるのが気持ち悪い。1900年以前など。」
 * ----------------------------------------------------------------------------
 *  The historical outline stopped being one thing. A political record's ring is boundaries between
 *  polities welded to the polity's own copy of the coastline, and only the first half is something
 *  the record knows better than the planet does. data/border-coast.js marks which edges are which
 *  (scripts/build-border-coast.mjs); js/time-borders.js strokes only the border runs.
 *
 *  ⚠ WHAT WAS NOT MEASURED ANYWHERE BEFORE THIS ROUND: whether the drawn line is in the sea. The
 *  gates over these bundles ask whether the record is consistent WITH ITSELF — rings closed, dates
 *  ordered, every year populated, coordinates on the globe — and `scripts/build-hist-borders.mjs
 *  --check` says so in as many words ("THIS RE-DERIVES NOTHING"). A 40 km chord across the Gulf of
 *  Lion satisfies every one of them. The checks here ask the other question.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { buildWater } from '../scripts/bordercoast/water.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (file, global) => { const w = {}; new Function('window', rd('data/' + file))(w); return w[global]; };

const CS = bundle('cshapes.js', '__CSHAPES');
const HB = bundle('hist-borders.js', '__HISTB');
const BC = bundle('border-coast.js', '__IMBCOAST');
const TB = rd('js/time-borders.js');
const TBC = codeOnly(TB);

const closed = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };
const drawn = (mark, i) => mark === 1 || (Array.isArray(mark) && mark.some(([a, b]) => i >= a && i < b));
const KM_PER_DEG = 110.574;
const edgeKm = (a, b) => { const kx = KM_PER_DEG * Math.cos((a[1] + b[1]) * 0.5 * Math.PI / 360);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * KM_PER_DEG); };

/* ── ① the marks are a fact about the bundles, not a file somebody once wrote ──────────────────── */
test('① scripts/build-border-coast.mjs --check re-derives the committed marks', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-border-coast.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /re-derives/, out);
});

test('① every ring of both bundles has an entry, and every run is ordered and in range', () => {
  for (const [key, d] of [['cs', CS], ['hb', HB]]) {
    const set = BC.sets[key];
    assert.ok(set, 'data/border-coast.js has no marks for ' + key);
    assert.equal(set.rings, d.rings.length, key + ': the mark count and the bundle disagree');
    assert.equal(set.draw.length, d.rings.length, key + ': one entry per ring');
    let bad = 0;
    for (let i = 0; i < d.rings.length; i++) {
      const v = set.draw[i], E = closed(d.rings[i]).length - 1;
      if (v === 0 || v === 1) continue;
      if (!Array.isArray(v) || !v.length) { bad++; continue; }
      let prev = -1;
      for (const run of v) {
        if (!Array.isArray(run) || run.length !== 2) { bad++; break; }
        const [a, b] = run;
        if (!(Number.isInteger(a) && Number.isInteger(b) && a > prev && a < b && b <= E)) { bad++; break; }
        prev = b;
      }
    }
    assert.equal(bad, 0, key + ': ' + bad + ' entries are neither 0, 1, nor ordered in-range runs');
  }
});

/* ── ② the reported edge ───────────────────────────────────────────────────────────────────────── */
test('② the 40 km chord across the Gulf of Lion is in the record and is NOT drawn', () => {
  const f = CS.feats.find((x) => x[0] === 'France' && x[2] <= 1900 && x[5] >= 1900);
  assert.ok(f, 'CShapes no longer carries a France record covering 1900');
  let present = false, isDrawn = null;
  for (const poly of f[8]) for (const ri of poly) {
    const V = closed(CS.rings[ri]), mark = BC.sets.cs.draw[ri];
    for (let i = 0; i < V.length - 1; i++) {
      if (V[i][0] === 3.547 && V[i][1] === 43.32 && V[i + 1][0] === 3.965 && V[i + 1][1] === 43.541) {
        present = true; isDrawn = drawn(mark, i);
      }
    }
  }
  assert.ok(present, 'the reported edge is no longer in data/cshapes.js — re-measure before changing this check');
  assert.equal(isDrawn, false, 'the reported chord from Sète to Le Grau-du-Roi is being stroked again');
});

/* ── ③ what is drawn is not in the sea ─────────────────────────────────────────────────────────── */
test('③ almost none of the drawn length lies over water', () => {
  /* ⚠ NOT ZERO, AND THE REASON IS IN THE DATA. Some boundaries really do cross water — the 49th
     parallel through the Strait of Georgia, the Alaska convention line up the antimeridian — and
     the record draws them because they are borders. What must not survive is a coastline copy
     wandering offshore. Measured at the round: 0.25% of the drawn length. */
  const W = buildWater(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'coastline.json.gz')))));
  let total = 0, sea = 0;
  for (const [key, d] of [['cs', CS], ['hb', HB]]) {
    const marks = BC.sets[key].draw;
    for (let ri = 0; ri < d.rings.length; ri++) {
      const mark = marks[ri]; if (mark === 0) continue;
      const V = closed(d.rings[ri]);
      for (let i = 0; i < V.length - 1; i++) {
        if (!drawn(mark, i)) continue;
        const L = edgeKm(V[i], V[i + 1]); total += L;
        /* the SIGN is the whole question here, and `onLand` is a parity count — asking `inlandKm`
           would also walk the distance index out of the middle of a continent for every sample. */
        const steps = Math.max(2, Math.min(64, Math.ceil(L / 2)));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          if (!W.onLand(V[i][0] + (V[i + 1][0] - V[i][0]) * t, V[i][1] + (V[i + 1][1] - V[i][1]) * t)) sea += L / steps;
        }
      }
    }
  }
  assert.ok(total > 1e6, 'only ' + Math.round(total) + ' km is drawn at all — the marks have eaten the borders');
  const pct = 100 * sea / total;
  assert.ok(pct < 1, pct.toFixed(2) + '% of the drawn length is over water (' + Math.round(sea) + ' of ' + Math.round(total) + ' km) — a coastline copy is being stroked again');
});

/* ── ④ the runtime reads the marks the way the build wrote them ────────────────────────────────── */
test('④ _ringLines slices the CLOSED ring, for both spellings of a ring', () => {
  /* ⚠ EVALUATED, NOT READ (#R505). The trap this guards is an off-by-one that only shows on ONE of
     the two records: data/cshapes.js repeats a ring's first point and data/hist-borders.js does not,
     so a run [a,b] read off the raw array would slide by one on the OHM bundle alone — half the map,
     one era, silently wrong. */
  const sandbox = { Array }; vm.createContext(sandbox);
  vm.runInContext(liftFunction(TBC, '_ringLines').replace(/^function/, 'var _closedRing=(r)=>{const n=r.length;return (n>1&&r[0][0]===r[n-1][0]&&r[0][1]===r[n-1][1])?r:r.concat([r[0]]);};\nfunction') + '\nvar RL=_ringLines;', sandbox);
  /* ⚠ the vm builds its arrays in another realm, so deepEqual fails on identical content — compare
     the values, not the objects. */
  const RL = (ring, mark) => JSON.parse(JSON.stringify(sandbox.RL(ring, mark)));
  const open = [[0, 0], [1, 0], [1, 1], [0, 1]];                 /* the OHM spelling */
  const shut = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];          /* the CShapes spelling */
  for (const ring of [open, shut]) {
    assert.equal(RL(ring, 0).length, 0, 'mark 0 must stroke nothing');
    assert.equal(RL(ring, 1).length, 1, 'mark 1 must stroke one line');
    assert.equal(RL(ring, 1)[0].length, 5, 'mark 1 must stroke the ring CLOSED — 5 points for a square');
    const one = RL(ring, [[1, 3]]);
    assert.equal(one.length, 1, 'one run, one line');
    assert.deepEqual(one[0], [[1, 0], [1, 1], [0, 1]], 'a run [a,b] is V.slice(a, b+1) of the closed ring');
    const two = RL(ring, [[0, 1], [2, 4]]);
    assert.deepEqual(two.map((l) => l.length), [2, 3], 'two runs, two lines');
  }
});

/* ── ⑤ the wiring ─────────────────────────────────────────────────────────────────────────────── */
test('⑤ imtb-line strokes the line source and imtb-fill still holds the polygons', () => {
  const ensure = liftFunction(TBC, 'ensure');
  assert.match(ensure, /addLayer|layers\.add/, 'ensure() no longer creates layers in the shape this check reads');
  const line = /\{id:'imtb-line',type:'line',source:'([a-z-]+)'/.exec(ensure);
  const fill = /\{id:'imtb-fill',type:'fill',source:'([a-z-]+)'/.exec(ensure);
  assert.ok(line && fill, 'imtb-line / imtb-fill are not declared in the shape this check reads');
  assert.equal(line[1], 'imtb-ln-src', 'imtb-line is stroking the polygons again — the coastline copy is back');
  assert.equal(fill[1], 'imtb-src', 'imtb-fill must keep the polygons: it is the click target and the label anchors');
});

test('⑤ the source that draws carries the credit', () => {
  /* the attribution used to hang on imtb-src because imtb-src was what drew. It is not any more. */
  const ensure = liftFunction(TBC, 'ensure');
  const at = ensure.indexOf("addSource('imtb-ln-src'");
  assert.ok(at >= 0, 'imtb-ln-src is not added in the shape this check reads');
  const ln = ensure.slice(at, ensure.indexOf('});', at));   /* the whole call: the object has nested braces */
  assert.match(ln, /attribution:/, 'the line the reader sees comes from a source that credits nobody');
  for (const who of ['CShapes', 'OpenHistoricalMap']) assert.ok(ln.includes(who), who + ' is not credited on the line source');
});

test('⑤ the marks are lazy, like the bundles they mark', () => {
  assert.ok(!/border-coast\.js/.test(rd('index.html')), 'data/border-coast.js is on the boot path — it belongs with the bundles it marks');
  assert.match(TBC, /src='data\/border-coast\.js'/, 'js/time-borders.js no longer loads the marks');
  /* a lost request must not be latched: the line geometry is memoised, so one failure would pin the
     session to the whole-ring drawing this round removed. */
  const load = liftFunction(TBC, 'bcLoad');
  assert.match(load, /onerror=\(\)=>\{\s*_bcP=null/, 'bcLoad latches a failed load — one lost request would last the session');
});
