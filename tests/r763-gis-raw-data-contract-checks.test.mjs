/* ============================================================================
 *  #R763 · 表示用の値ではなく、原データが解析へ流れる
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]). What was wrong
 *  was NOT that a field called `number` was missing. What was wrong is this, measured on the shipped
 *  code before this round:
 *
 *      OF THE 18 REGISTRATIONS THAT IMPLEMENT A POINT SAMPLER, ZERO RETURNED A NUMBER.
 *
 *  Every one of them rounded its value and concatenated a unit onto it — 「12.3°C」, 「0.2 mm/h」,
 *  「1240 m」 — and js/gis-datasets.js asNumber refuses a cell that is not a number all the way
 *  through, correctly. So every numeric field on this map — temperature, precipitation, elevation,
 *  NO₂, sea-surface temperature, snow, annual precipitation, the five GIBS scales — answered
 *  `layer-values-not-numeric` to zonal statistics, and the ONE layer that got through (`aod`) got
 *  through because its unit string happens to be empty. 「区域統計の関数がある」 and 「内蔵の気温
 *  レイヤーで区域統計を実行できる」 were different facts, and only the first was true.
 *
 *  Three more, of the same shape — a capability implemented one level down with nothing able to
 *  reach it ([[intmap-wiring-complete-is-not-wiring-live]]):
 *
 *    · js/gis-raster.js counts `failed` apart from `empty` so 「取得に失敗した」 and 「値が無い」 stay
 *      different — and js/gis-sources.js caught the throw one level up and returned null, so `failed`
 *      was STRUCTURALLY ALWAYS 0 and the reader was told their data was text when the upstream fell over
 *    · js/gis-sources.js region() takes `time` and `band`, and js/gis-layers.js's ACQUIRE — the list a
 *      planner is validated against — did not name them, so 「2020 年と 2025 年のこの範囲」 was unsayable
 *    · js/gis-sources.js acquire() — the door that WAITS — had zero callers anywhere in js/, so a
 *      supplier that has to fetch (which is what an undrawn layer must do) could not be reached at all
 *
 *  So the invariants are about the CLAIMS, not about the fields:
 *    ① a row that measured hands over the number AND the unit, not a sentence containing both
 *    ② region() reads that number — a layer whose text is 「12.3°C」 becomes a grid of 12.3
 *    ③ 「失敗した」「全部欠損だった」「文字列だった」 are three answers, not one code
 *    ④ one pixel does not decide for the whole window
 *    ⑤ the raster vocabulary carries `time` and `band`, and toRaster hands them down
 *    ⑥ a row that states a loader is readable while it is switched off and never drawn
 *    ⑦ the loader road and the drawn road narrow with ONE predicate
 *    ⑧ the async door has a caller, and the sync door still refuses an async supplier by name
 *    ⑨ every refusal this round added is declared, and has a sentence a reader can act on
 *
 *  ⚠ THE STUBS ARE NOT MORE CAPABLE THAN THE REAL REGISTRY ([[intmap-r671-lessons]]). The fake
 *  registry below answers exactly what js/map-ui.js publishes, and its `sampleAt` composes the row
 *  the real one composes — including that a row WITHOUT `measure` gets no `number`, which is what
 *  makes ② a measurement rather than a restatement.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

/* ── a registry no more able than js/map-ui.js's ──────────────────────────────────────────────── */

function makeFakeMap(w) {
  const rows = new Map();
  let camera = { w: -180, s: -90, e: 180, n: 90 };
  const inBox = (f, b) => {
    const c = f && f.geometry && f.geometry.coordinates;
    return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
  };
  const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

  w.IntMapLayers = {
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
    },
    featuresIn: (id, bounds) => {
      const r = rows.get(String(id));
      /* ⚠ 「まだ描かれていない」 is null, exactly as _srcFeatsIn answers for a source that does not
         exist yet. A row with a loader and no drawn features is the case ⑥ is about. */
      if (!r || !r.features) return null;
      const b = asBox(bounds);
      return r.features.filter((f) => inBox(f, b));
    },
    featuresInSource: () => null,
    /* THE SHAPE js/map-ui.js BUILDS: a row for every registration that was ASKED (#R774), text
       always when there was one, number/unit only when the row measured. ⚠ A REGISTRATION THAT
       ANSWERS null STILL PRODUCES A ROW — that is the fact 「訊いたが、そこには値が無い」, and
       collapsing it into silence here is exactly the defect this stub must not hide. */
    sampleAt: async (lng, lat, ids) => {
      const out = [];
      for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
        const r = rows.get(String(id));
        if (!r || (!r.measure && !r.sample)) continue;
        const row = { id: String(id), label: r.label, asked: true };
        try {
          if (r.measure) {
            const q = await Promise.resolve(r.measure(lng, lat));
            if (q) {
              if (q.text != null && q.text !== '') row.value = q.text;
              if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
              if (q.code != null) row.code = q.code;
            }
          } else {
            const v = await Promise.resolve(r.sample(lng, lat));
            if (v != null && v !== '') row.value = v;
          }
        } catch (_) { row.failed = true; }
        out.push(row);
      }
      return out;
    },
    loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
    /* ⚠ THE ONE PREDICATE. ⑦ measures that js/gis-layers.js asks THIS rather than keeping its own. */
    narrow: (features, bounds) => {
      if (!Array.isArray(features)) return null;
      if (!bounds) return features.slice();
      const b = asBox(bounds);
      return features.filter((f) => inBox(f, b));
    },
    declarationOf: (id) => { const r = rows.get(String(id)); return (r && r.holds) ? r.holds : null; },
    active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
    context: () => [],
    register: (id, impl) => rows.set(String(id), impl),
  };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
  };
  return { rows, setCamera: (b) => { camera = b; } };
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
  return { w, map, sources: w.IntMapGisSources, layers: w.IntMapGisLayers, data: w.IntMapData };
}

const WORLD = { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false };

/* ══ ① 数と単位は、文の中ではなく別々に渡る ═══════════════════════════════════════════════════ */

test('① 数量を述べた行は、読者に見せる文と、その文を作った数の両方を渡す', async () => {
  const { w, map } = await boot();
  map.rows.set('temp', { label: 'Air temperature', on: true, measure: () => ({ value: 12.34, unit: '°C', text: '12.3°C' }) });
  const rows = await w.IntMapLayers.sampleAt(0, 0, ['temp']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, '12.3°C', '読者に見える文は変わっていない');
  assert.equal(rows[0].number, 12.34, '丸める前の数が運ばれていない');
  assert.equal(rows[0].unit, '°C', '単位が値として運ばれていない');
});

test('① js/map-ui.js の数値レイヤーは、単位を文へ畳まず measure で述べる', () => {
  const src = read('js/map-ui.js');
  /* ⚠ 測っているのは「その行が measure を持つこと」であって綴りではない。単位付きの文字列を
     sampleAt から返す数値レイヤーが 1 行でも残っていれば、その行は region() から読めない。 */
  for (const id of ['temp', 'sst', 'precip', 'snow', 'aod', 'no2', 'co', 'wind', 'elevation', 'climate']) {
    const at = src.indexOf("register('" + id + "'");
    assert.ok(at > 0, id + ' の登録が見つからない');
    const body = src.slice(at, at + 1400);
    assert.ok(/measure\s*:/.test(body), id + ' はまだ表示用の文だけを返している（measure が無い）');
  }
});

test('① _om は数と単位を分けて返し、文はその数から作られる', () => {
  const src = read('js/map-ui.js');
  const at = src.indexOf('async function _om(');
  const body = src.slice(at, src.indexOf('(#R732)', at));
  assert.ok(/value\s*:\s*x/.test(body), '_om が value を返していない');
  assert.ok(/unit\s*:\s*\(/.test(body), '_om が unit を値として返していない');
  /* 文と数が 1 か所から出ていること: text は x から組み立てられる */
  assert.ok(/text\s*:\s*\(x\s*==\s*null\)/.test(body), '表示用の文が、返している数から作られていない');
});

/* ══ ② region() はその数を読む ═══════════════════════════════════════════════════════════════ */

test('② 「12.3°C」と見せる行は、12.3 の格子になる — 文字列は解析の入口ではない', async () => {
  const { map, sources } = await boot();
  map.rows.set('temp', { label: 'T', on: true, measure: (lng) => ({ value: 10 + lng, unit: '°C', text: (10 + lng).toFixed(1) + '°C' }) });
  const r = await sources.region('temp', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, true, r.why);
  const cells = Array.from(r.grid.read(0));
  assert.equal(cells.length, 4);
  for (const v of cells) assert.ok(Number.isFinite(v), '数値でないセルがある: ' + v);
  assert.equal(r.filled, 4);
});

test('② 単位は帯に載る — 述べられた単位は運ばれ、発明はされない', async () => {
  const { map, sources } = await boot();
  map.rows.set('no2', { label: 'NO2', on: true, measure: () => ({ value: 12.4, unit: 'µg/m³', text: '12.4 µg/m³' }) });
  const r = await sources.region('no2', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1 });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.grid.bands[0].unit, 'µg/m³', 'レイヤーが述べた単位が帯に載っていない');

  /* 呼び手が述べた単位のほうが具体的な主張なので、そちらが勝つ */
  const r2 = await sources.region('no2', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1, band: { unit: 'ppb' } });
  assert.equal(r2.grid.bands[0].unit, 'ppb');
});

test('② 数を述べない行は、今までどおり文字列として断られる（緩めてはいない）', async () => {
  const { map, sources } = await boot();
  map.rows.set('thermal', { label: 'Fires', on: true, sample: () => '37 fire pixels within ~15 km' });
  const r = await sources.region('thermal', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-values-not-numeric');
  assert.equal(r.detail.sample, '37 fire pixels within ~15 km', '何と答えたのかが読者に渡っていない');
});

/* ══ ③ 失敗・欠損・文字列は 3 つの答え ═══════════════════════════════════════════════════════ */

test('③ 全部が欠損の窓は「文字列を返す」ではなく「値がどこにも無い」と言う', async () => {
  const { map, sources } = await boot();
  /* 陸のデータを海の窓に訊いたときの形: 答えてはいるが、値はどこにも無い */
  map.rows.set('land', { label: 'Land only', on: true, measure: () => null });
  const r = await sources.region('land', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-values-all-missing', '海の窓が「このレイヤーは文字列を返す」と説明されている');
  assert.equal(r.detail.empty, 4);
});

test('③ 上流が落ちた窓は「取得に失敗した」と言う — 欠損ではない', async () => {
  const { map, sources } = await boot();
  map.rows.set('down', { label: 'Upstream', on: true, measure: () => { throw new Error('502'); } });
  const r = await sources.region('down', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-sample-failed', '取得失敗が欠損か文字列に潰れている');
  assert.ok(r.detail.failed > 0, '失敗件数が数えられていない');
});

test('③ js/gis-raster.js の failed と empty は重ならない（片方から他方を引けなければ差は読めない）', async () => {
  const { w } = await boot();
  const RS = w.IntMapGisRaster;
  let n = 0;
  const baked = await RS.fromSamplerAsync({
    bounds: [0, 0, 2, 2], width: 2, height: 2,
    band: { name: 'v', unit: null, nodata: null },
    /* 4 画素のうち 1 つが投げ、1 つが欠損、2 つが数 */
    sample: () => { n++; if (n === 1) throw new Error('x'); if (n === 2) return null; return 5; },
  });
  assert.equal(baked.ok, true);
  assert.equal(baked.failed, 1, '投げた画素が数えられていない');
  assert.equal(baked.empty, 1, '投げた画素が欠損にも数えられている（重複）');
  assert.equal(baked.filled, 2);
});

/* ══ ④ 1 点で全体を断じない ═════════════════════════════════════════════════════════════════ */

test('④ 中央が欠損でも、周辺に値があれば領域全体を拒まない', async () => {
  const { map, sources } = await boot();
  /* 表示がオフで、窓の中央だけが欠損 — 出荷前はこれだけで窓全体が layer-not-visible だった */
  map.rows.set('patchy', {
    label: 'Patchy', on: false,
    measure: (lng, lat) => ((Math.abs(lng - 1) < 0.01 && Math.abs(lat - 1) < 0.01) ? null : { value: 7, unit: 'm', text: '7 m' }),
  });
  const r = await sources.region('patchy', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, true, '中央 1 点の欠損で窓全体が拒まれた: ' + r.why);
});

/* ⚠⚠⚠ (#R774) この検査が測っていた事実は変わった。以前の実装は「5 点のどこかに値があるか」で
   窓全体を断じていたので、値を 1 つも返さないオフの行は `layer-not-visible`（＝訊けなかった）と
   呼ばれていた。いまは「訊いたか」と「値があったか」が別の観測なので、答えはした行は窓まで読まれ、
   どこにも値が無ければ `layer-values-all-missing`——「そこには無い」という別の事実になる。
   ⚠ 通すために緩めたのではない。断られることは変わっておらず、断り方の主語が
   「レイヤーの表示」から「データ」へ移った。本当に答えない行は下の検査が測る。 */
test('④ 答えはするが値を持たないオフのレイヤーは「そこに値が無い」と断られる（「見えていない」ではない）', async () => {
  const { map, sources } = await boot();
  map.rows.set('off', { label: 'Off', on: false, measure: () => null });
  const r = await sources.region('off', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-values-all-missing', '訊けた行が「訊けなかった」と説明されている');
  assert.equal(r.detail.empty, 4, 'どれだけ空だったのかが読者に渡っていない');
});

test('④ 本当に答えない行は、今までどおり名前を付けて断られる', async () => {
  const { map, sources } = await boot();
  /* 標本を取る扉が 1 つも無い登録＝ sampleAt が行を返さない＝「訊けなかった」 */
  map.rows.set('mute', { label: 'Mute', on: false });
  const r = await sources.region('mute', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-not-visible');
  assert.ok(r.detail.probes > 1, 'いくつ試したのかが述べられていない');
});

/* ══ ⑤ 取得語彙が time と band を運ぶ ═════════════════════════════════════════════════════════ */

test('⑤ ラスタの取得語彙に time と band が在る — 下で実装されていたものが名乗れる', async () => {
  const { layers } = await boot();
  const f = layers.acquireFields('raster');
  assert.ok(f.indexOf('time') >= 0, 'raster の取得語彙に time が無い');
  assert.ok(f.indexOf('band') >= 0, 'raster の取得語彙に band が無い');
  /* ⚠ 一覧は 1 つ。ここで綴りを並べ直さず、vector 側が失っていないことだけを測る。 */
  for (const k of ['bounds', 'width', 'height', 'where', 'unit']) assert.ok(f.indexOf(k) >= 0, k + ' が語彙から消えた');
});

test('⑤ toRaster は time を region へ渡す — 語彙に在ることと届くことは別', async () => {
  const { map, layers } = await boot();
  map.rows.set('t', { label: 'T', on: true, time: '2020', measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
  const r = await layers.toRaster('t', { bounds: { w: 0, s: 0, e: 1, n: 1 }, width: 1, height: 1, time: '2020' });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.equal(cov.requested.time, '2020', '求めた時点が coverage に届いていない');
});

test('⑤ 1 地点 1 値の供給元に帯を指定したら、黙って 0 番を返さず名前を付けて断る', async () => {
  const { map, sources } = await boot();
  map.rows.set('t', { label: 'T', on: true, measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
  const r = await sources.region('t', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1, band: { index: 2 } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'band-not-selectable');
});

/* ══ ⑥ 表示していないレイヤーから取得できる ═══════════════════════════════════════════════════ */

test('⑥ 一度も描かれていない行でも、loader を述べていれば読める', async () => {
  const { map, layers } = await boot();
  let drew = 0;
  map.rows.set('heritage', {
    label: 'WHS', on: false, holds: WORLD,
    /* features は無い = レンダラのソースがまだ無い。出荷前はこれで供給元になれなかった。 */
    load: async () => { drew++; return [pt(1, 1, { n: 'A' }), pt(50, 50, { n: 'B' })]; },
  });
  const r = await layers.acquireDataset('heritage', {});
  assert.equal(r.ok, true, '未表示のレイヤーが読めない: ' + r.why);
  assert.equal(r.dataset.features().length, 2);
  assert.equal(drew, 1, 'loader が呼ばれていない');
});

test('⑥ loader が失敗したら「表示をオンにしろ」ではなく「読み込めなかった」と言う', async () => {
  const { map, layers } = await boot();
  map.rows.set('heritage', { label: 'WHS', on: false, holds: WORLD, load: async () => { throw new Error('offline'); } });
  const r = await layers.acquireDataset('heritage', {});
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-load-failed', '読み込み失敗が表示の話にされている');
});

test('⑥ js/map-ui.js の 3 行が、描かずに渡す扉を実際に述べている', () => {
  const src = read('js/map-ui.js');
  for (const id of ['volcanoes', 'heritage', 'pharma']) {
    const at = src.indexOf("register('" + id + "'");
    assert.ok(at > 0, id + ' の登録が無い');
    assert.ok(/load\s*:/.test(src.slice(at, at + 2600)), id + ' は complete と述べているのに、描かずに渡す扉が無い');
  }
  /* その扉の実体が在ること — 宣言だけして実装が無いのは #R759 が記録した形そのもの */
  assert.ok(/function featuresOf\(/.test(read('js/beta-overlays.js')), 'js/beta-overlays.js に featuresOf が無い');
});

/* ══ ⑦ 範囲の判定は 1 つ ═════════════════════════════════════════════════════════════════════ */

test('⑦ loader 経路の絞り込みは、描画経路と同じ predicate を通る', async () => {
  const { map, layers } = await boot();
  map.rows.set('heritage', {
    label: 'WHS', on: false, holds: WORLD,
    load: async () => [pt(1, 1), pt(50, 50)],
  });
  const r = await layers.acquireDataset('heritage', { bounds: { w: 0, s: 0, e: 10, n: 10 } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.features().length, 1, '範囲の外の地物が混ざっている');

  /* ⚠ そしてそれは、この file が自分で書いた判定ではない: レジストリが narrow を持たなければ
     範囲つきの依頼は答えられないと述べる（黙って自前の判定に落ちない）。 */
  const src = read('js/gis-layers.js');
  const at = src.indexOf('async function loadedFetch(');
  const body = src.slice(at, at + 1400);
  assert.ok(/R\.narrow\(/.test(body), 'loader 経路が自前の範囲判定を持っている');
  assert.ok(/IntMapLayers\.narrow/.test(body), 'narrow が無いときに、それを名指して断っていない');
});

/* ══ ⑧ 非同期の扉に呼び手が居る ═══════════════════════════════════════════════════════════════ */

test('⑧ 同期の扉は、待つ必要のある供給元を今までどおり名前を付けて断る', async () => {
  const { map, sources } = await boot();
  map.rows.set('heritage', { label: 'WHS', on: false, holds: WORLD, load: async () => [pt(1, 1)] });
  const r = sources.features('heritage', {});
  assert.equal(r.ok, false);
  assert.equal(r.why, 'supplier-is-async', '非同期の供給元が同期の扉で呼ばれて捨てられている');
  assert.equal(r.detail.use, 'acquire');
});

test('⑧ js/gis-atlas.js は待つほうの扉を使う — 実装済みで呼び手が 0 だったのが欠陥だった', () => {
  const src = read('js/gis-atlas.js');
  assert.ok(/await layers\.acquireDataset\(/.test(src), 'planner がまだ同期の扉しか使っていない');
});

test('⑧ 両方の扉が同じ要求を組み立てる（2 つ目の綴りを作らない）', () => {
  const src = read('js/gis-layers.js');
  assert.ok(/function acquireReq\(o\)/.test(src), '要求の組み立てが 1 か所になっていない');
  /* ⚠ (#R819) 測るのは**綴りではなく不変条件**である。ここは長く `(features|acquire)` という
     2 語を固定していて、非同期の扉が `acquirePlanned` になった瞬間に落ちた——保たれていたのは
     「要求の組み立ては acquireReq 1 か所」という不変条件のほうで、落ちたのは検査が知っていた
     名前のほう。⇒ どの method 名であれ、SRC() の扉へ渡る要求が acquireReq から来ていることを数える
     （.agents/rules/no-ad-hoc-hardcoding.md: 規則は関数ではなく事実に付ける）。 */
  const calls = src.match(/SRC\(\)\.\w+\(id, acquireReq\(o\)\)/g) || [];
  assert.equal(calls.length, 2, '片方の扉が自前で要求を組み立てている: ' + calls.length);
});

/* ══ ⑨ 足した拒否は、宣言され、読者に文がある ═══════════════════════════════════════════════ */

test('⑨ この回が足した拒否コードは、どれも宣言され、読者への文を持つ', async () => {
  const { sources } = await boot();
  const declared = sources.refusalCodes();
  const panel = read('js/gis-panel.js');
  for (const code of ['layer-sample-failed', 'layer-values-all-missing', 'band-not-selectable']) {
    assert.ok(declared.indexOf(code) >= 0, code + ' が js/gis-sources.js の REFUSALS に無い');
    assert.ok(panel.indexOf("'" + code + "'") > 0, code + ' に読者への文が無い');
  }
  /* js/gis-layers.js が返すほうの 2 つ（供給元の一覧ではないので REFUSALS には無い） */
  for (const code of ['layer-load-failed', 'layer-is-a-field']) {
    assert.ok(panel.indexOf("'" + code + "'") > 0, code + ' に読者への文が無い');
  }
});

test('⑨ 新しい文は英語と日本語の両方を持つ（CONSTITUTION §7）', () => {
  const panel = read('js/gis-panel.js');
  for (const code of ['layer-sample-failed', 'layer-values-all-missing', 'band-not-selectable', 'layer-load-failed', 'layer-is-a-field']) {
    const at = panel.indexOf("code === '" + code + "'");
    assert.ok(at > 0, code + ' の行が無い');
    const line = panel.slice(at, panel.indexOf('\n', at));
    const args = line.match(/,\s*'[^']*'|,\s*"[^"]*"/g) || [];
    assert.ok(args.length >= 2, code + ' に en と jp が揃っていない');
  }
});
