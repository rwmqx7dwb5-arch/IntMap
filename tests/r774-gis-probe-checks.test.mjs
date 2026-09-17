/* ============================================================================
 *  #R774 · 表示状態は、取得の答えを変えない
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]). What was wrong
 *  was NOT that the probe had too few points. What was wrong is this, reproduced by an outside audit
 *  on the shipped code:
 *
 *      ONE WINDOW, ONE SUPPLIER, ONE QUESTION — AND TWO ANSWERS, DECIDED BY A CHECKBOX.
 *
 *  A field over [0,0]–[1,1] holding a value in its north-east pixel and nothing anywhere else was
 *  read normally while its layer was switched on (100 positions asked, one value returned), and
 *  refused `layer-not-visible` while it was switched off — because the off road asked five fractions
 *  of the window for a NUMBER and called their silence 「この供給元には訊けなかった」.
 *
 *  That is a proxy predicate ([[intmap-proxy-predicate-freezes-the-wrong-diagnosis]]): the probe
 *  wants to know 「この供給元は答えるか」 and was measuring 「この 5 座標に値があるか」. Adding points
 *  would move the corner it gets wrong and leave the shape intact
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1) — so what is separated is the two facts, at the door
 *  they were merged at: js/map-ui.js's sampleAt returned NO ROW for a registration it had asked and
 *  got null from, which is the same silence as 「訊ける登録が無い」.
 *
 *  So the invariants here are about the ANSWER, never about the probe:
 *    ① the same window, the same supplier, the same answer — with the layer on and with it off
 *    ② a supplier that answers nothing at all is still refused as 「訊けなかった」, on or off
 *    ③ a supplier that answers everywhere with no value is 「そこに値が無い」, which is a different
 *       refusal with its own sentence
 *    ④ a supplier that throws at every probe is still 「取得に失敗した」
 *    ⑤ the door itself: js/map-ui.js's sampleAt hands back a row for every registration it asked
 *
 *  ⚠ NOTHING BELOW MEASURES HOW MANY POINTS ARE PROBED OR WHERE THEY ARE. That is implementation;
 *  a check on it would be the ceiling-guard-as-policy this repository has recorded
 *  ([[intmap-ceiling-guards-are-not-policies]]).
 *  ⚠ AND ⑤ EVALUATES THE SHIPPED FUNCTION rather than reading its source
 *  ([[intmap-edge-function-must-be-evaluated]]): the fix lives in js/map-ui.js, and a regex over it
 *  would pass on code that never runs.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ── a registry no more able than js/map-ui.js's (⑤ measures that this is true) ───────────────── */

function makeFakeMap(w) {
  const rows = new Map();
  w.IntMapLayers = {
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
    },
    featuresIn: () => null,
    featuresInSource: () => null,
    /* THE SHAPE js/map-ui.js BUILDS (#R774): a row for every registration that was ASKED, with a
       `value` only when there was one. */
    sampleAt: async (lng, lat, ids) => {
      const out = [];
      for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
        const r = rows.get(String(id));
        if (!r || !r.measure) continue;
        const row = { id: String(id), label: r.label, asked: true };
        try {
          const q = await Promise.resolve(r.measure(lng, lat));
          if (q) {
            if (q.text != null && q.text !== '') row.value = q.text;
            if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
          }
        } catch (_) { row.failed = true; }
        out.push(row);
      }
      return out;
    },
    declarationOf: () => null,
    active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
    context: () => [],
    register: (id, impl) => rows.set(String(id), impl),
  };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => -180, getSouth: () => -90, getEast: () => 180, getNorth: () => 90 }) },
  };
  return { rows };
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const map = makeFakeMap(w);
  w.IntMapData = makeGisDatasets();
  w.IntMapGisRaster = makeGisRaster();
  w.IntMapGisSources = makeGisSources();
  w.IntMapGisLayers = makeGisLayers();
  return { w, map, sources: w.IntMapGisSources };
}

/* The window the audit used, and a field whose ONLY value sits in its north-east pixel. ⚠ The value
   is placed by COORDINATE, not by pixel index: the read must find it through the geometry it builds
   itself, and a fixture that counted calls would be measuring the loop instead of the answer. */
const BOX = { w: 0, s: 0, e: 1, n: 1 };
const SIZE = { width: 10, height: 10 };
const cornerOnly = (lng, lat) => ((lng > 0.9 && lat > 0.9) ? { value: 42, unit: 'm', text: '42 m' } : null);

/* ══ ① 同じ窓・同じ供給元・同じ答え ═══════════════════════════════════════════════════════════ */

test('① 北東の 1 画素だけが値を持つ場は、表示が ON でも OFF でも同じ答えを返す', async () => {
  const ask = async (on) => {
    const { map, sources } = await boot();
    map.rows.set('patchy', { label: 'Patchy field', on: on, measure: cornerOnly });
    const r = await sources.region('patchy', BOX, SIZE);
    return r;
  };
  const on = await ask(true);
  const off = await ask(false);

  assert.equal(on.ok, true, '表示 ON でも読めていない: ' + on.why);
  assert.equal(off.ok, true, '表示 OFF のとき、供給元が答えた窓が拒まれている: ' + off.why);
  /* ⚠ THE INVARIANT IS THE EQUALITY, not either side's number. */
  assert.equal(off.filled, on.filled, '表示状態で有効セル数が変わっている');
  assert.equal(off.empty, on.empty, '表示状態で欠損セル数が変わっている');
  assert.equal(off.failed, on.failed);
  assert.deepEqual(Array.from(off.grid.read(0)), Array.from(on.grid.read(0)), '表示状態で格子の中身が変わっている');
  /* そして、答えは実際にその 1 画素である（等しいが両方とも空、では測っていない） */
  assert.equal(on.filled, 1);
  assert.ok(Array.from(on.grid.read(0)).some((v) => v === 42), '北東の値 42 が格子に入っていない');
});

/* ══ ② 本当に答えない供給元は、表示状態によらず「訊けなかった」 ═══════════════════════════════ */

test('② 標本を取る扉を持たない行は、ON でも OFF でも layer-not-visible で断られる', async () => {
  const ask = async (on) => {
    const { map, sources } = await boot();
    map.rows.set('mute', { label: 'Mute', on: on });
    return sources.region('mute', BOX, SIZE);
  };
  for (const on of [true, false]) {
    const r = await ask(on);
    assert.equal(r.ok, false, '答えない行が成功を返した (on=' + on + ')');
    assert.equal(r.why, 'layer-not-visible', '「訊けなかった」が別の名前で呼ばれた (on=' + on + '): ' + r.why);
  }
});

/* ══ ③ 答えたが値が無いのは、別の事実 ═══════════════════════════════════════════════════════ */

test('③ どこでも答えるが値をどこにも持たない場は layer-values-all-missing（layer-not-visible ではない）', async () => {
  for (const on of [true, false]) {
    const { map, sources } = await boot();
    map.rows.set('ocean', { label: 'Land only', on: on, measure: () => null });
    const r = await sources.region('ocean', BOX, SIZE);
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-values-all-missing', '訊けた行が「訊けなかった」と説明されている (on=' + on + ')');
    assert.equal(r.detail.empty, 100, 'どれだけ空だったのかが読者に渡っていない');
  }
});

/* ══ ④ 全部投げたら、それは取得の失敗 ═══════════════════════════════════════════════════════ */

test('④ 供給元が投げ続ける場は、表示が OFF でも layer-sample-failed', async () => {
  const { map, sources } = await boot();
  map.rows.set('down', { label: 'Upstream', on: false, measure: () => { throw new Error('502'); } });
  const r = await sources.region('down', BOX, SIZE);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-sample-failed', '取得失敗が欠損か不可視に潰れている: ' + r.why);
});

/* ══ ⑤ 根を実際に評価する — js/map-ui.js の sampleAt ═══════════════════════════════════════ */

/* ⚠ THE SHIPPED FUNCTION, RUN. js/map-ui.js needs a DOM to load whole, so the one function the fix
   lives in is lifted out and evaluated against the two collaborators it closes over (`REG`, `state`).
   Those are the registry's own, and nothing here is more capable than they are. */
function shippedSampleAt(REG) {
  const src = read('js/map-ui.js');
  const a = src.indexOf('async function sampleAt(lng,lat,ids){');
  assert.ok(a > 0, 'js/map-ui.js の sampleAt が見つからない（名前が変わったなら、この検査も変える）');
  const b = src.indexOf('function featuresIn(', a);
  assert.ok(b > a, 'sampleAt の終端が見つからない');
  const body = src.slice(a, b);
  const state = (id) => ({ id: id, on: !!(REG[id] && REG[id].on), label: (REG[id] && REG[id].label) || id });
  const activeIds = () => Object.keys(REG);
  return new Function('REG', 'state', 'activeIds', body + '\nreturn sampleAt;')(REG, state, activeIds);
}

test('⑤ 訊いた登録は必ず 1 行返る — 値が無いことは、行が無いことではない', async () => {
  const REG = {
    hasValue: { label: 'Has', measure: () => ({ value: 7, unit: 'm', text: '7 m' }) },
    noValue: { label: 'None', measure: () => null },
    threw: { label: 'Threw', measure: () => { throw new Error('x'); } },
    silent: { label: 'Silent' },                 /* 扉が無い＝訊いていない */
  };
  const sampleAt = shippedSampleAt(REG);
  const rows = await sampleAt(0, 0, ['hasValue', 'noValue', 'threw', 'silent']);
  const by = (id) => rows.find((r) => r.id === id);

  assert.equal(rows.length, 3, '訊いた登録の数と行の数が合わない: ' + JSON.stringify(rows));
  assert.equal(by('silent'), undefined, '訊いていない登録が行を持っている');

  assert.equal(by('hasValue').value, '7 m', '読者に見える文が変わっている');
  assert.equal(by('hasValue').number, 7, '数が運ばれていない');
  assert.equal(by('hasValue').unit, 'm');

  /* ⚠ THE ROW THAT IS THE WHOLE POINT: asked, and there was nothing there. */
  assert.ok(by('noValue'), '値の無い地点で、訊いた登録の行が消えている');
  assert.equal(by('noValue').asked, true, '行が「訊いた」と述べていない');
  assert.equal(by('noValue').value, undefined, '値が無いのに値の欄がある');
  assert.equal(by('noValue').failed, undefined, '値が無いことが失敗として報告されている');

  assert.equal(by('threw').failed, true, '投げた登録が失敗として報告されていない');
  assert.equal(by('threw').value, undefined);
});
