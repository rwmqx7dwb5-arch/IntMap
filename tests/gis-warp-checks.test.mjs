/* ============================================================================
 *  #R819 · 出力格子の全確保をやめる ／ 面積の footprint 近似を検証可能にする
 * ----------------------------------------------------------------------------
 *  TWO MEASUREMENTS OPENED THIS ROUND, AND BOTH ARE ABOUT SOMETHING THAT WAS TRUE AND UNSTATED.
 *
 *  ① #R783 bounded the geometry that crosses a thread boundary and reported the peak it held. The
 *     OUTPUT was allocated whole before any of that was planned — `new Float64Array(W·H)` per band,
 *     alive for the whole run — so the budget was governing the smaller half of the residency: a
 *     4096² four-band warp stakes 512 MiB of output beside a decoded source of the same order.
 *     ⚠ THE DEFECT IS NOT 「予算という引数があるか」. What is measured below is that the residency a
 *     run actually holds is (a) reported in terms a reader can check and (b) BOUNDED when there is
 *     somewhere to write windows to — and that the same warp, split differently, is the same bytes.
 *
 *  ② An areal resample weighs each source pixel by how much of it the output pixel COVERS, and the
 *     footprint it was given is the BOX holding the output pixel's four transformed corners. A box
 *     that errs outward is the right thing for a PREFILTER and the wrong thing for a WEIGHT: under a
 *     rotation it holds ground the output pixel does not cover, so an `average` is taken over ground
 *     nobody asked about and a `sum` apportions a total across it. Nothing measured how much, so
 *     nothing could say where the fast path stops carrying a quantitative question.
 *     ⚠ THE FIX IS NOT 「全部厳密にする」 (AGENTS.md §3-1/§3-2): the box stays, bit for bit, and is
 *     now MEASURED against the quadrilateral it holds; `footprint:'exact'` is a stated decision with
 *     a stated tolerance. ③ below is the invariant that separates the two — a total that survives
 *     resampling — and it is measured on a ROTATED grid, where the box provably cannot conserve it.
 *
 *  ⚠ THE REFERENCES SIT OUTSIDE THE THING MEASURED ([[intmap-co-designed-reader-cannot-falsify]]):
 *  the areal fixture is computed in this file from the closed form js/gis-raster.js's header states,
 *  the conservation test compares against the SOURCE's own total, and the residency is watched by
 *  the sink itself rather than read out of the report it is meant to corroborate.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* The boot tests/r749-gis-warp-checks and tests/r783-worker-budget-checks use: js/geodesy.js
   publishes onto `window` at top level and exports nothing. */
async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const raster = makeGisRaster();
  const crs = makeGisCrs();
  const warp = makeGisWarp();
  w.IntMapGisRaster = raster; w.IntMapGisCrs = crs; w.IntMapGisWarp = warp;
  return { w, raster, crs, warp };
}

const D2R = Math.PI / 180;

/* A north-up degree grid, the shape docs/GIS-CORE.md §1.4 defines. */
function degreeGrid(o) {
  const { west, north, pixelLng, pixelLat, width, height } = o;
  const data = new Float64Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = o.value(c, r);
  return {
    width, height, crs: 'EPSG:4326',
    bands: [Object.assign({ name: 'v', unit: null, nodata: null }, o.band || {})],
    grid: { west, north, pixelLng, pixelLat },
    read: (i) => ((i == null || i === 0) ? data : null),
    _data: data,
  };
}

/* The same grid with a ROTATED affine — the case the box footprint cannot be exact for, and the one
   every 「回転・投影で footprint が矩形でなくなれば」 sentence below is about. GDAL's order:
   [c, a, b, f, d, e] with x = c + a·px + b·py, y = f + d·px + e·py. */
function rotatedGrid(o) {
  const g = degreeGrid(o);
  const t = (o.rotationDeg == null ? 20 : o.rotationDeg) * D2R;
  const cs = Math.cos(t), sn = Math.sin(t);
  const a = o.pixelLng, e = -o.pixelLat;
  g.affine = [o.west, a * cs, -e * sn, o.north, a * sn, e * cs];
  return g;
}

function bandTotal(a) { let s = 0; for (let i = 0; i < a.length; i++) if (isFinite(a[i])) s += a[i]; return s; }

/* ⚠ THE SINK IS ALSO THE WITNESS. It keeps what it was handed (so the windows can be reassembled
   and compared byte for byte with a resident run) and — separately — watches how much this file
   ever asked it to hold AT ONCE, which is the number ① is actually about. */
function memorySink(opts) {
  const o = opts || {};
  const rows = [];
  const s = {
    begins: [], windows: [], ended: null, maxBytesAtOnce: 0, attempts: 0,
    begin(decl) {
      s.begins.push(decl); s.attempts++;
      /* attempt > 1 means START OVER — the contract's own word, exercised rather than assumed. */
      rows.length = 0; s.windows.length = 0;
      if (o.failBegin) return { ok: false, why: 'no-room' };
      return undefined;
    },
    write(win) {
      let bytes = 0;
      for (const b of win.bands) bytes += b.byteLength;
      if (bytes > s.maxBytesAtOnce) s.maxBytesAtOnce = bytes;
      s.windows.push({ row0: win.row0, rows: win.rows, width: win.width });
      for (let i = 0; i < win.bands.length; i++) {
        rows[i] = rows[i] || [];
        rows[i].push({ row0: win.row0, rows: win.rows, data: win.bands[i] });
      }
      if (o.failWriteAt != null && s.windows.length === o.failWriteAt) return { ok: false, why: 'disk-full' };
      return undefined;
    },
    end(summary) { s.ended = summary; return o.endValue === undefined ? undefined : { ok: true, value: o.endValue }; },
    /* the whole band, reassembled from the windows in the order they arrived */
    band(i, width, height) {
      const out = new Float64Array(width * height);
      for (const w of (rows[i] || [])) out.set(w.data, w.row0 * width);
      return out;
    },
  };
  return s;
}

/* ══ ① THE OUTPUT IS NOT NECESSARILY RESIDENT ════════════════════════════════════════════════ */

const SRC = { west: 0, north: 20, pixelLng: 0.5, pixelLat: 0.5, width: 24, height: 20 };
function source() {
  return degreeGrid(Object.assign({}, SRC, {
    band: { nodata: -9999 },
    value: (c, r) => {
      const i = r * SRC.width + c;
      if (i % 53 === 7) return NaN;
      if (i % 47 === 11) return -9999;
      return c * 1.5 - r * 0.25 + (i % 7) * 0.125;
    },
  }));
}
/* Inside the source on every side, and deliberately not a whole number of source pixels. */
const TARGET = { west: 1.1, north: 18.3, pixelLng: 0.31, pixelLat: 0.27, width: 19, height: 17 };

test('R819 ① a windowed run is the same answer as a resident one, and never holds the whole grid', async () => {
  const { warp } = await boot();
  const src = source();

  for (const method of ['nearest', 'bilinear', 'cubic', 'average', 'mode', 'sum']) {
    const whole = await warp.resample(src, TARGET, { method });
    assert.equal(whole.ok, true, method + ': the resident resample refused: ' + whole.why);
    assert.equal(whole.report.memory.outputHeld, 'whole');
    assert.equal(whole.windowed, undefined, method + ': a run with no sink called itself windowed');

    /* A budget that cannot hold the output: four rows' worth, against seventeen rows of it. */
    const outRow = TARGET.width * 8;
    const sink = memorySink();
    const win = await warp.resample(src, TARGET, { method, sink: sink, budgetBytes: outRow * 4 });
    assert.equal(win.ok, true, method + ': the windowed resample refused: ' + win.why + ' ' + JSON.stringify(win.detail || null));

    /* ⚠ THE ANSWER FIRST — a split that changed a pixel would be a second implementation of the
       walk, which is the whole thing this arrangement exists not to be. Zero tolerance: the
       arithmetic is the same arithmetic in the same order. */
    const a = sink.band(0, TARGET.width, TARGET.height), b = whole.grid.read(0);
    const ba = new Uint8Array(a.buffer), bb = new Uint8Array(b.buffer);
    for (let i = 0; i < ba.length; i++) {
      if (ba[i] !== bb[i]) assert.fail(method + ': byte ' + i + ' differs (pixel ' + (i >> 3) + '): ' + a[i >> 3] + ' vs ' + b[i >> 3]);
    }
    for (const k of ['filled', 'missing', 'partial', 'incomplete', 'clipped', 'failed', 'cells']) {
      assert.equal(win.report[k], whole.report[k], method + ': report.' + k + ' moved when the output was windowed');
    }

    /* ⚠ AND THEN THE RESIDENCY, watched by the sink rather than read out of the report it checks. */
    const fullOut = TARGET.width * TARGET.height * 8;
    assert.ok(sink.maxBytesAtOnce < fullOut, method + ': a window held ' + sink.maxBytesAtOnce + ' of ' + fullOut + ' bytes');
    assert.ok(sink.maxBytesAtOnce <= outRow * 4, method + ': a window of ' + sink.maxBytesAtOnce + ' bytes does not fit the budget');
    assert.ok(sink.windows.length > 1, method + ': the budget did not split the output');
    assert.equal(win.report.memory.outputHeld, 'window');
    assert.equal(win.report.sink.windows, sink.windows.length);
    assert.equal(win.report.sink.attempts, 1);

    /* The windows tile the output exactly once, in order — a hole would be invisible in the bytes
       above only because this sink zero-fills, so it is asked directly. */
    let next = 0;
    for (const w of sink.windows) { assert.equal(w.row0, next); next += w.rows; }
    assert.equal(next, TARGET.height, method + ': the windows do not cover the output');

    /* ⚠ THE GRID IS NULL AND THE DESCRIPTION IS NOT: a `read` that answered null for every band
       would be a raster contract that is not one. */
    assert.equal(win.windowed, true);
    assert.equal(win.grid, null);
    assert.equal(win.written.width, TARGET.width);
    assert.equal(win.written.crs, 'EPSG:4326');
    assert.equal(typeof win.written.read, 'undefined');
  }
});

test('R819 ① the residency is reported in terms a reader can check, and over-budget is a statement', async () => {
  const { warp } = await boot();
  const src = source();
  const srcBytes = src._data.byteLength;

  /* No sink, no budget: nothing is bounded and nothing pretends to be. */
  const plain = await warp.resample(src, TARGET, { method: 'average' });
  const m = plain.report.memory;
  assert.equal(m.budgetBytes, null);
  assert.equal(m.budgetFrom, null);
  assert.equal(m.overBudget, null, 'a run with no budget reported a verdict about one');
  assert.equal(m.sourceBytes, srcBytes, 'the decoded source is not counted');
  assert.equal(m.outputBytes, TARGET.width * TARGET.height * 8);
  assert.ok(m.peakBytes >= m.sourceBytes + m.outputBytes);
  /* an areal walk holds the axis and two corner rows, and says so */
  assert.equal(m.latAxisBytes, (SRC.height + 1) * 8);
  assert.ok(m.cornerRowBytes > 0);

  /* ⚠⚠⚠ A BUDGET SMALLER THAN THE OUTPUT DOES NOT REFUSE THE WARP (CONSTITUTION.md §5) — it
     produces the grid and says the budget was not met, with the reason. A cap here would be a
     limit on work wearing a budget's name. */
  const tight = await warp.resample(src, TARGET, { method: 'average', budgetBytes: 1024 });
  assert.equal(tight.ok, true, 'a small budget turned a computable warp into a refusal');
  assert.equal(tight.report.memory.overBudget, true);
  assert.equal(tight.report.memory.reason, 'output-resident-no-sink');
  assert.equal(tight.report.memory.budgetFrom, 'stated');
  assert.equal(bandTotal(tight.grid.read(0)), bandTotal(plain.grid.read(0)), 'the budget changed the answer');

  /* With somewhere to put it, the same budget IS met. */
  const sink = memorySink();
  const held = await warp.resample(src, TARGET, { method: 'average', budgetBytes: 1024 + srcBytes, sink: sink });
  assert.equal(held.ok, true, held.why);
  assert.equal(held.report.memory.overBudget, false);
  assert.ok(held.report.memory.peakBytes <= 1024 + srcBytes);

  /* ⚠ A SINK WITH NO BUDGET IS A REFUSAL BY NAME rather than a window size invented here — the
     budget's canon is js/gis-worker.js and this file may not write a second one. */
  const noBudget = await warp.resample(src, TARGET, { method: 'average', sink: memorySink() });
  assert.equal(noBudget.ok, false);
  assert.equal(noBudget.why, 'warp-budget-not-stated');
  assert.deepEqual(noBudget.detail.from, ['opts.budgetBytes', 'opts.worker.budgetBytes()']);

  /* …and the canon is reachable without a thread pool being asked for one: a door that offers a
     budget hands it over even when nothing else about it is used. */
  const door = {
    run: () => { }, register: () => ({ ok: true }), provide: () => ({ ok: true }),
    planBlocks: () => ({ ok: false, why: 'plan-invalid' }), runBlocks: () => ({ ok: false }),
    jobNames: () => [], libraryNames: () => [], budgetBytes: () => 4096, available: () => false,
  };
  const fromDoor = await warp.resample(src, TARGET, { method: 'nearest', sink: memorySink(), worker: door });
  assert.equal(fromDoor.ok, true, fromDoor.why);
  assert.equal(fromDoor.report.memory.budgetBytes, 4096);
  assert.equal(fromDoor.report.memory.budgetFrom, 'worker');
});

test('R819 ① a sink that refuses ends the warp, and a broken one is refused before any work', async () => {
  const { warp } = await boot();
  const src = source();
  const outRow = TARGET.width * 8;

  const failing = memorySink({ failWriteAt: 2 });
  const r = await warp.resample(src, TARGET, { method: 'nearest', sink: failing, budgetBytes: outRow * 3 });
  assert.equal(r.ok, false, 'a window that did not land was reported as a complete grid');
  assert.equal(r.why, 'warp-sink-failed');
  assert.equal(r.detail.at, 'write');
  assert.equal(r.detail.why, 'disk-full', 'the sink’s own reason did not reach the caller');

  const begins = await warp.resample(src, TARGET, { method: 'nearest', sink: memorySink({ failBegin: true }), budgetBytes: outRow * 3 });
  assert.equal(begins.ok, false);
  assert.equal(begins.detail.at, 'begin');

  for (const bad of [{ write: 1 }, { begin: 7, write: () => { } }, 5]) {
    const b = await warp.resample(src, TARGET, { method: 'nearest', sink: bad, budgetBytes: outRow * 3 });
    assert.equal(b.ok, false, 'a sink that cannot receive a window was accepted: ' + JSON.stringify(bad));
    assert.equal(b.why, 'warp-sink-invalid');
  }

  /* `end` may hand something back, and it reaches the caller rather than being dropped. */
  const s = memorySink({ endValue: { id: 'saved-1' } });
  const ok = await warp.resample(src, TARGET, { method: 'nearest', sink: s, budgetBytes: outRow * 3 });
  assert.equal(ok.ok, true, ok.why);
  assert.deepEqual(ok.report.sink.value, { id: 'saved-1' });
  assert.equal(ok.ended, undefined);
  assert.equal(s.ended.windows, ok.report.sink.windows);
});

test('R819 ① the granularity of the split does not move a single output bit', async () => {
  const { warp } = await boot();
  const src = source();
  const outRow = TARGET.width * 8;
  /* ⚠ THE FIXED RESIDENCY IS TAKEN FROM THE RUN'S OWN ACCOUNTING, so this measures that a budget of
     「fixed + n rows」 buys n rows — the arithmetic — rather than restating it here. */
  const first = await warp.resample(src, TARGET, { method: 'average' });
  const fixed = first.report.memory.sourceBytes + first.report.memory.latAxisBytes + first.report.memory.cornerRowBytes;
  let reference = null;
  for (const rows of [1, 2, 5, 17, 40]) {
    const sink = memorySink();
    const r = await warp.resample(src, TARGET, { method: 'average', sink: sink, budgetBytes: outRow * rows + fixed });
    assert.equal(r.ok, true, r.why);
    const band = sink.band(0, TARGET.width, TARGET.height);
    if (reference == null) { reference = band; continue; }
    const x = new Uint8Array(band.buffer), y = new Uint8Array(reference.buffer);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail('a window height of ' + rows + ' changed pixel ' + (i >> 3));
    assert.equal(r.report.sink.rowsPerWindow, Math.min(rows, TARGET.height));
  }
});

/* ══ ② THE FOOTPRINT, AND HOW FAR OFF IT IS ══════════════════════════════════════════════════ */

test('R819 ② the box approximation is measured, and it is exact exactly where it is exact', async () => {
  const { warp } = await boot();
  const src = source();

  /* A north-up resample: every footprint IS a rectangle, so the excess is zero and the report says
     so with a number rather than by omission. */
  const up = await warp.resample(src, TARGET, { method: 'average' });
  assert.equal(up.report.footprint.mode, 'box');
  /* ⚠ 「0」 IS THE CLAIM AND FLOAT NOISE IS THE MEASUREMENT: the box and the quadrilateral are the
     same four numbers put through two different summations, so the ratio is 1 to ~1e-13. A
     tolerance here is arithmetic, not slack — anything a rotation produces is 1e11 times larger. */
  assert.ok(up.report.footprint.boxExcess.max < 1e-9, 'a north-up footprint box is not the footprint: ' + up.report.footprint.boxExcess.max);
  assert.equal(up.report.footprint.ring, null);
  /* and one latitude per row IS the row's latitude here, measured rather than claimed */
  assert.equal(up.report.footprint.latAxis.maxWeightError, 0);
  assert.equal(up.report.footprint.latAxis.at, 'middle-column');

  /* A point method covers no area, so there is no footprint to describe. */
  const pt = await warp.resample(src, TARGET, { method: 'bilinear' });
  assert.equal(pt.report.footprint.mode, null);
  assert.equal(pt.report.footprint.boxExcess, null);

  /* ⚠ A ROTATED GRID IS WHERE THE BOX STOPS BEING THE FOOTPRINT, and the number says how far.
     20° of rotation puts the corners of an axis-aligned output pixel on a diamond in source pixel
     space, whose bounding box is measurably larger than the quadrilateral it holds. */
  const rot = rotatedGrid(Object.assign({}, SRC, { value: () => 1 }));
  const box = await warp.to4326(rot, { method: 'average' });
  assert.equal(box.ok, true, box.why);
  assert.ok(box.report.footprint.boxExcess.max > 0.2,
    'a 20° rotation was reported as a footprint the box covers exactly (' + box.report.footprint.boxExcess.max + ')');
  assert.ok(box.report.footprint.boxExcess.at && box.report.footprint.boxExcess.at.row >= 0,
    'the worst excess has no pixel attached to it');
});

test('R819 ② an exact footprint is a ring, and it is stated or it is not in play', async () => {
  const { warp, raster } = await boot();
  const src = source();

  /* The kernel declares the two forms, and the warp asks it rather than assuming. */
  const forms = raster.sampleCellForms().map((f) => f.id);
  assert.deepEqual(forms.slice().sort(), ['box', 'ring']);
  assert.deepEqual(warp.footprintModes(), ['box', 'exact']);

  const noTol = await warp.resample(src, TARGET, { method: 'average', footprint: 'exact' });
  assert.equal(noTol.ok, false);
  assert.equal(noTol.why, 'warp-footprint-tolerance-not-stated');
  assert.equal(noTol.detail.unit, 'source-pixels');

  for (const t of [0, -1, 'small', NaN]) {
    const bad = await warp.resample(src, TARGET, { method: 'average', footprint: 'exact', footprintTolerance: t });
    assert.equal(bad.ok, false, 'a tolerance of ' + String(t) + ' was accepted');
    assert.equal(bad.why, 'warp-footprint-tolerance-invalid');
  }

  const unknown = await warp.resample(src, TARGET, { method: 'average', footprint: 'outline' });
  assert.equal(unknown.why, 'warp-footprint-unknown');
  assert.deepEqual(unknown.detail.modes, ['box', 'exact']);

  /* ⚠ A POINT METHOD HAS NO FOOTPRINT: asking for an exact one is refused rather than ignored. */
  const point = await warp.resample(src, TARGET, { method: 'bilinear', footprint: 'exact', footprintTolerance: 0.01 });
  assert.equal(point.ok, false);
  assert.equal(point.why, 'warp-footprint-not-areal');

  /* On a north-up grid the ring and the box describe the same rectangle, so the answers agree to
     the rounding of two different summations and the ring is the four corners — no refinement was
     needed and none was invented. */
  const b = await warp.resample(src, TARGET, { method: 'average' });
  const e = await warp.resample(src, TARGET, { method: 'average', footprint: 'exact', footprintTolerance: 1e-6 });
  assert.equal(e.ok, true, e.why);
  assert.equal(e.report.footprint.mode, 'exact');
  assert.equal(e.report.footprint.ring.maxPositions, 4, 'an axis-aligned edge was subdivided');
  assert.equal(e.report.footprint.ring.depthLimited, 0);
  assert.equal(e.report.footprint.boxExcess, null);
  const eb = e.grid.read(0), bb = b.grid.read(0);
  for (let i = 0; i < eb.length; i++) {
    if (Number.isNaN(eb[i]) || Number.isNaN(bb[i])) { assert.equal(Number.isNaN(eb[i]), Number.isNaN(bb[i]), 'void at ' + i); continue; }
    assert.ok(Math.abs(eb[i] - bb[i]) <= 1e-9 * Math.max(1, Math.abs(bb[i])), 'ring and box disagree at ' + i + ': ' + eb[i] + ' vs ' + bb[i]);
  }
});

test('R819 ② a constant field stays constant through a rotated areal warp', async () => {
  const { warp } = await boot();
  /* ⚠ THE INVARIANT THAT DOES NOT DEPEND ON THE WEIGHTS BEING RIGHT IN ANY PARTICULAR WAY: whatever
     the footprint covers, every pixel of it is 7, so any weighted mean of it is 7 and the largest
     class in it is 7. A footprint that reached off the grid, or weights that went negative, show up
     here immediately. */
  const rot = rotatedGrid(Object.assign({}, SRC, { value: () => 7 }));
  for (const method of ['average', 'mode']) {
    for (const fp of [{ method }, { method, footprint: 'exact', footprintTolerance: 0.05 }]) {
      const r = await warp.to4326(rot, fp);
      assert.equal(r.ok, true, JSON.stringify(fp) + ': ' + r.why);
      const band = r.grid.read(0);
      let seen = 0;
      for (let i = 0; i < band.length; i++) {
        if (Number.isNaN(band[i])) continue;
        seen++;
        assert.ok(Math.abs(band[i] - 7) < 1e-9, JSON.stringify(fp) + ': pixel ' + i + ' of a constant field came back ' + band[i]);
      }
      assert.ok(seen > band.length / 4, JSON.stringify(fp) + ': almost nothing was warped (' + seen + ' of ' + band.length + ')');
    }
  }
});

test('R819 ② a total survives an exact resample of a rotated grid, and the box says why it cannot', async () => {
  const { warp } = await boot();
  /* ⚠ THE REFERENCE IS THE SOURCE'S OWN TOTAL. `sum` apportions each source pixel by the fraction
     of itself an output pixel covers (js/gis-raster.js), so output pixels that TILE the source add
     up to exactly the source's total — which is the property a count quantity (人口・件数) is
     resampled for, and the one an outward-erring box cannot have: it apportions more than one
     pixel's worth of every pixel. */
  /* ⚠ THE MASS IS KEPT OFF THE EDGE ON PURPOSE, and the reason is a LIMIT this round did not
     change: an output pixel is clipped by where its CENTRE falls, so a pixel whose centre is off the
     rotated source contributes nothing even where its footprint overlaps. That loses mass at the
     diagonal boundary for every footprint mode, and measuring the footprint against it would be
     measuring the centre rule instead. Three rows of zeros put the boundary where there is nothing
     to lose. */
  const rot = rotatedGrid(Object.assign({}, SRC, {
    width: 16, height: 14,
    value: (c, r) => ((c < 3 || c > 12 || r < 3 || r > 10) ? 0 : 1 + ((c * 7 + r * 3) % 5)),
  }));
  const total = bandTotal(rot._data);

  const exact = await warp.to4326(rot, { method: 'sum', footprint: 'exact', footprintTolerance: 0.02 });
  assert.equal(exact.ok, true, exact.why);
  const got = bandTotal(exact.grid.read(0));
  const err = Math.abs(got - total) / total;
  assert.ok(err < 1e-3, 'an exact resample lost or invented ' + (err * 100).toFixed(4) + '% of the total (' + got + ' vs ' + total + ')');

  const box = await warp.to4326(rot, { method: 'sum' });
  const boxGot = bandTotal(box.grid.read(0));
  const boxErr = Math.abs(boxGot - total) / total;
  /* ⚠ NOT A COMPLAINT ABOUT THE BOX — a MEASUREMENT of the condition under which it may be used,
     and of the fact that the number now says so out loud. */
  assert.ok(boxErr > err * 5,
    'the box footprint conserved the total as well as the exact one — then one of the two is not what it says it is');
  assert.ok(box.report.footprint.boxExcess.max > 0);
});

test('R819 ② the row latitudes are an approximation, and a stated tolerance is a promise', async () => {
  const { warp, crs } = await boot();
  const ready = await crs.ready();

  /* On a degree grid the middle column IS every column: the bound is exactly zero and a tolerance
     of any size is met. */
  const src = source();
  const met = await warp.resample(src, TARGET, { method: 'average', areaTolerance: 1e-12 });
  assert.equal(met.ok, true, met.why);
  assert.equal(met.report.footprint.areaTolerance, 1e-12);
  assert.equal(met.report.footprint.latAxis.maxWeightError, 0);

  for (const t of [0, -3, 'tight']) {
    const bad = await warp.resample(src, TARGET, { method: 'average', areaTolerance: t });
    assert.equal(bad.ok, false, 'an area tolerance of ' + String(t) + ' was accepted');
    assert.equal(bad.why, 'warp-area-tolerance-invalid');
  }

  if (!ready) return;   /* proj4 is not installed here — the projected half is not measurable */

  /* A projected grid's rows BOW: the ends of a UTM row stand at a different latitude from its
     middle, so the one latitude the axis carries is wrong by a measurable amount and the report
     bounds it. ⚠ The bound is on the WEIGHTS, which is what an areal aggregate is sensitive to. */
  const utm = degreeGrid({ west: 0, north: 0, pixelLng: 1, pixelLat: 1, width: 8, height: 8, value: () => 3 });
  utm.crs = 'EPSG:32654';
  utm.grid = { west: 200000, north: 4200000, pixelLng: 40000, pixelLat: 40000 };
  const r = await warp.to4326(utm, { method: 'average' });
  assert.equal(r.ok, true, r.why);
  const la = r.report.footprint.latAxis;
  assert.ok(la.maxWeightError > 0, 'a projected grid reported its rows as iso-latitude lines');
  assert.ok(la.maxSpreadDeg > 0);
  assert.equal(la.columns.length, 2);

  /* …and a caller who asked for better than that is told so BY NAME, with the measurement. */
  const promised = await warp.to4326(utm, { method: 'average', areaTolerance: la.maxWeightError / 10 });
  assert.equal(promised.ok, false, 'a tolerance the measurement does not meet was answered with a grid');
  assert.equal(promised.why, 'warp-accuracy-outside-tolerance');
  assert.equal(promised.detail.of, 'latAxis');
  assert.ok(promised.detail.measured > promised.detail.tolerance);

  const loose = await warp.to4326(utm, { method: 'average', areaTolerance: la.maxWeightError * 10 });
  assert.equal(loose.ok, true, 'a tolerance the measurement meets was refused: ' + loose.why);
});

/* ══ ③ THE KERNEL'S SIDE OF THE SAME CONTRACT ════════════════════════════════════════════════ */

test('R819 ③ the raster kernel weighs a ring, and refuses one it cannot weigh', async () => {
  const { raster } = await boot();
  const g = degreeGrid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 10, height: 10, value: (c, r) => c + r * 10 });

  /* A ring around exactly the same ground as a box gives the same aggregate — one aggregation, two
     descriptions of one footprint. */
  const boxCell = [2, 4, 5, 7];
  const ringCell = { ring: [[2, 7], [5, 7], [5, 4], [2, 4]] };
  const byBox = raster.sample(g, 0, 3.5, 5.5, { method: 'average', cell: boxCell });
  const byRing = raster.sample(g, 0, 3.5, 5.5, { method: 'average', cell: ringCell });
  assert.equal(byBox.ok, true, byBox.why);
  assert.equal(byRing.ok, true, byRing.why);
  assert.ok(Math.abs(byBox.value - byRing.value) < 1e-9, 'a ring and the box around the same ground disagree: ' + byBox.value + ' vs ' + byRing.value);
  assert.equal(byRing.pixels, byBox.pixels);

  /* Half of that box, as a triangle: fewer pixels, and a mean that is not the rectangle's. */
  const tri = raster.sample(g, 0, 3.5, 5.5, { method: 'average', cell: { ring: [[2, 7], [5, 7], [2, 4]] } });
  assert.equal(tri.ok, true, tri.why);
  assert.notEqual(tri.value, byBox.value);
  assert.ok(tri.value > 0);

  /* ⚠ A DEGENERATE RING IS REFUSED BY NAME rather than aggregated to nothing — 「面積が測れない」 is
     not 「その範囲は空だった」. */
  for (const bad of [{ ring: [[0, 0], [1, 1]] }, { ring: [[0, 0], [1, 0], [2, 0]] }, { ring: [[0, 0], [1, 'x'], [2, 2]] }, { cell: 1 }]) {
    const r = raster.sample(g, 0, 3.5, 5.5, { method: 'average', cell: bad });
    assert.equal(r.ok, false, 'a footprint with no area was accepted: ' + JSON.stringify(bad));
    assert.equal(r.why, 'sample-cell-invalid');
  }
  const none = raster.sample(g, 0, 3.5, 5.5, { method: 'average' });
  assert.equal(none.why, 'sample-cell-not-stated');
  assert.deepEqual(none.detail.forms, ['box', 'ring']);

  /* `sum` over a ring covering a whole pixel apportions that whole pixel, and over a quarter of it
     a quarter — the property the conservation test above rests on, asked here directly. */
  /* ⚠ THE FOUR QUARTERS ADD UP TO THE WHOLE, AND NO ONE OF THEM IS A QUARTER: the apportionment is
     by GROUND, and the southern half of a one-degree pixel is more ground than the northern half
     (measured here: 10.7545 against 10.7455 of 43). A test asserting value/4 would be asserting
     that this file weighs by coordinates, which is the defect its header is about. */
  const whole = raster.sample(g, 0, 3.5, 5.5, { method: 'sum', cell: { ring: [[3, 6], [4, 6], [4, 5], [3, 5]] } });
  const quads = [[3, 5.5, 3.5, 5], [3.5, 5.5, 4, 5], [3, 6, 3.5, 5.5], [3.5, 6, 4, 5.5]];
  let sum = 0;
  for (const q of quads) {
    const s = raster.sample(g, 0, (q[0] + q[2]) / 2, (q[1] + q[3]) / 2, { method: 'sum', cell: { ring: [[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]] } });
    assert.equal(s.ok, true, s.why);
    sum += s.value;
  }
  assert.ok(Math.abs(sum - whole.value) < 1e-9,
    'four quarters of a pixel apportioned ' + sum + ' of its ' + whole.value);
  assert.ok(Math.abs(whole.value - 43) < 1e-9, 'a footprint covering exactly one pixel did not apportion all of it');
});
