/* ============================================================================
 *  IntMap · the forecast-model registry (js/wx-models.js)
 * ----------------------------------------------------------------------------
 *  複数予報モデルの台帳・可用性・出所・配信元（#R356・#R514）。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ════════ #R356 — from tests/r356-checks.test.mjs ════════ */
{
/* ============================================================================
 *  IntMap · #R356 source checks — the forecast-model platform
 * ----------------------------------------------------------------------------
 *  「複数予報モデルの切替・比較」「モデル・run・有効時刻・解像度が常時確認可能」
 *  「地図、粒子、凡例、地点値が同じ表示状態を参照」
 *
 *  ⚠ THE FIXTURES ARE REAL METADATA, NOT INVENTED SHAPES. tests/fixtures/om-models/*.json are
 *  verbatim `latest.json` payloads captured from the live feed on 2026-08-23 (minus `crs_wkt`,
 *  3 kB of WKT per model that nothing here reads). They are what makes 「変数はモデルごとに違う」
 *  testable offline: ECMWF IFS HRES publishes 35 variables and NO pressure levels; GFS 0.13 has no
 *  `pressure_msl`, no `cape`, no `dew_point_2m`; ICON has 123 variables over 18 levels. A hand-made
 *  fixture would have had whatever variables the test author expected, which is the one thing this
 *  round must not assume.
 *
 *  ⚠ AND THE SOURCE IS READ THROUGH readLF. #R317 measured what a `\n`-anchored regex costs on a
 *  repo checked out with CRLF: a check that is永久に赤 on Windows and永久に緑 in CI, i.e. one that
 *  never ran anywhere it mattered.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments are prose ABOUT the code and must never satisfy an assertion about the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has now paid for ten times (#R320). */
const MDL = () => read('js/wx-models.js');
const EC = () => read('js/wx-ecmwf.js');
const WX = () => read('js/weather.js');
const fixture = (id) => JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/om-models/' + id + '.json'), 'utf8'));

/* Load js/wx-models.js the way the browser does: it publishes onto `window` and touches nothing
   else, so a bare object is a complete host. If that ever stops being true this line fails loudly
   rather than the module quietly acquiring a dependency nobody declared. */
function registry() {
  const win = {};
  new Function('window', MDL()).call(win, win);
  return win.IntMapWxModels;
}

/* ── ① the registry is the ONE place that says which models exist ─────────────────────────────*/
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R356 ① the model identity is one row, not four literals in the reader', () => {
  const R = registry();
  assert.ok(R, 'js/wx-models.js publishes window.IntMapWxModels against a bare window');
  const ids = R.ids();
  assert.ok(ids.length >= 3, 'at least the three global models the round promises (got ' + ids.length + ')');
  for (const want of ['ecmwf_ifs', 'ncep_gfs013', 'dwd_icon'])
    assert.ok(ids.includes(want), 'offers ' + want);
  assert.equal(R.defaultId(), 'ecmwf_ifs', 'and a session still opens on the 9 km ECMWF field');

  const ec = codeOnly(EC());
  /* the reader takes all four facts from the row it was built from */
  assert.match(ec, /var DOMAIN = cfg\.id;/, 'the domain comes from the row');
  assert.match(ec, /var BASE = WXM\(\)\.baseUrl\(DOMAIN\);/, 'the base URL comes from the registry');
  assert.match(ec, /var META_URL = WXM\(\)\.metaUrl\(DOMAIN\);/, 'and so does the metadata URL');
  assert.match(ec, /MODEL: cfg\.nameKey/, 'and the display name');
  assert.match(ec, /RESOLUTION_KM: cfg\.km/, 'and the resolution');
  /* …and holds no second copy of any of them */
  assert.ok(!/'ecmwf_ifs'/.test(ec), 'js/wx-ecmwf.js names no domain of its own');
  assert.ok(!/'ECMWF IFS HRES'/.test(ec), 'nor any model name');
  assert.ok(!/data_spatial/.test(ec), 'nor the host the files live on');
});

/* ── ② IDs, names and aliases are unique — a registry with two rows for one model is two answers */
test('R356 ② every row is distinct, and every row carries what a reader must be told', () => {
  const R = registry();
  const rows = R.all();
  const ids = rows.map(r => r.id), names = rows.map(r => r.nameKey);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(names).size, names.length, 'display names are unique');
  for (const r of rows) {
    assert.ok(r.agency && typeof r.agency === 'string', r.id + ' credits an agency');
    assert.ok(r.licence && typeof r.licence === 'string', r.id + ' names its licence');
    assert.ok(r.km > 0, r.id + ' states a resolution');
    assert.ok(Array.isArray(r.roles) && r.roles.length, r.id + ' declares what it may be used for');
  }
  /* ⚠ UK Met Office is CC-BY-SA where every other upstream centre here is CC-BY. Its data is live
     and its domain is in the SDK, and it is deliberately NOT offered: a share-alike obligation on
     the map's own presentation is not a decision this round may take on the reader's behalf. */
  assert.ok(!ids.some(i => /ukmo/.test(i)), 'no CC-BY-SA source is offered without that being decided');
  assert.ok(!rows.some(r => /SA/.test(r.licence) && r.map), 'and no share-alike source is on the map');
});

/* ── ③ AVAILABILITY IS AN INTERSECTION, and the fixtures prove it is not a declaration ─────────
   This is the assertion the whole round turns on. If a model change were allowed to mean 「same
   variable, other model」 unconditionally, four of the nine shipped layers would empty themselves
   the moment a reader picked GFS — silently, because an .om read for a variable that is not in the
   file returns nothing rather than failing. */
test('R356 ③ a model may only be offered for a variable it actually publishes', () => {
  const R = registry();
  const ecmwf = fixture('ecmwf_ifs'), gfs = fixture('ncep_gfs013'), icon = fixture('dwd_icon');

  /* the shape of the problem, measured */
  assert.equal(R.levels(ecmwf.variables).length, 0, 'ECMWF IFS HRES publishes NO pressure levels');
  assert.ok(R.levels(icon.variables).length >= 10, 'ICON publishes pressure levels (' + R.levels(icon.variables).length + ')');
  assert.ok(icon.valid_times.length < gfs.valid_times.length, 'and the three horizons differ');

  const ask = (meta, id, variable, level) =>
    R.availability({ modelId: id, meta: { variables: meta.variables, valid_times: meta.valid_times }, variable, level, role: 'surface' });

  assert.equal(ask(ecmwf, 'ecmwf_ifs', 'temperature_2m').ok, true, 'ECMWF has 2 m temperature');
  /* ⚠ THE LEVEL FAMILY'S BASE NAME IS "temperature", NOT "temperature_2m". A pressure-level field is
     not the surface field at a height, and the upstream naming says so: the level families are
     temperature / relative_humidity / wind_u_component / wind_v_component / geopotential_height /
     cloud_cover / vertical_velocity, each suffixed _<n>hPa. Getting it wrong is how a caller asks
     for "temperature_2m_500hPa" — a name no model has ever published — and then reads the refusal
     as «this model has no 500 hPa» when the truth is «that variable does not exist anywhere».
     This test asked for exactly that on its first run, which is why the note is here. */
  assert.equal(ask(ecmwf, 'ecmwf_ifs', 'temperature', 500).code, 'no_such_level',
    'and asking it for 500 hPa is refused with a reason, not answered with the surface');
  for (const v of ['pressure_msl', 'cape', 'dew_point_2m']) {
    assert.equal(ask(gfs, 'ncep_gfs013', v).code, 'no_such_variable',
      'GFS 0.13 does not publish ' + v + ', and the registry says so rather than drawing nothing');
  }
  assert.equal(ask(icon, 'dwd_icon', 'temperature', 500).ok, true, 'ICON does publish 500 hPa temperature');
  assert.equal(ask(icon, 'dwd_icon', 'temperature', 225).code, 'no_such_level',
    'but not 225 hPa — a level it does not have is refused even though the variable exists');
  assert.equal(R.availability({ modelId: 'no_such_model', meta: { variables: [], valid_times: ['x'] } }).code, 'unknown_model');
  assert.equal(R.availability({ modelId: 'ecmwf_ifs', meta: null }).code, 'no_metadata',
    'and a model that has not answered is «no metadata», NOT «no such variable»');
});

/* ── ④ coverage is derived from the grid the data is on, not declared beside it ────────────────*/
test('R356 ④ a regional model says no outside its own grid, and «unknown» is not «yes»', () => {
  const R = registry();
  const d2 = R.coverage({ type: 'regular', nx: 1215, ny: 746, latMin: 43.18, lonMin: -3.94, dx: 0.02, dy: 0.02 });
  assert.equal(R.covers(d2, 50.1, 8.7), true, 'Frankfurt is inside ICON D2');
  assert.equal(R.covers(d2, 35.7, 139.7), false, 'Tokyo is not');
  assert.equal(d2.global, false, 'and D2 does not claim to be global');

  const gauss = R.coverage({ type: 'gaussian', nx: 6599680, ny: 1, gaussianGridLatitudeLines: 1280 });
  assert.equal(gauss.global, true, 'a reduced Gaussian global grid is global');
  assert.equal(R.covers(gauss, -77, 166), true, '…including the places a lat/lon box would clip');

  /* ⚠ a grid whose extent is only in projected metres has NO box here, and `covers` answers null.
     null is 「分からない」 and callers must not read it as false: refusing a model for a point it
     does cover is the same defect as offering one for a point it does not. */
  assert.equal(R.coverage({ type: 'projectedFromProjectedOrigin', nx: 10, ny: 10 }), null);
  assert.equal(R.covers(null, 0, 0), null, 'unknown coverage is null, not false');
});

/* ── ⑤ switching model keeps the INSTANT ──────────────────────────────────────────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑤ a model change moves to the nearest valid time, never to the same index', () => {
  const R = registry();
  const ecmwf = fixture('ecmwf_ifs'), icon = fixture('dwd_icon');
  /* the axes really are different lengths and cadences */
  assert.notEqual(ecmwf.valid_times.length, icon.valid_times.length);

  const i = 30;
  const want = R._ms(ecmwf.valid_times[i]);
  const j = R.nearestTime(icon.valid_times, want);
  assert.notEqual(j, -1, 'the other model has an answer');
  const drift = Math.abs(R._ms(icon.valid_times[j]) - want) / 3600000;
  assert.ok(drift <= 1.5, 'and it is within a step of the instant on screen (' + drift + ' h)');

  /* the same index would have been a different hour — that is the whole point */
  const byIndex = R._ms(icon.valid_times[i]);
  assert.notEqual(byIndex, want, 'index ' + i + ' on the two axes is not the same instant');

  /* the code does it that way too */
  const wx = codeOnly(WX());
  assert.match(wx, /inst\.setIndex\(inst\.nearestTo\(ms\),\{quiet:true\}\)/,
    'setModel moves the new instance to the nearest instant');
  assert.match(wx, /const wasAt=\(d&&d\.validTime\)\|\|EC\(cfg\)\.validTime\(\)\|\|'';/,
    '…and it takes the instant from what is DISPLAYED, not from what was requested');
});

/* ── ⑥ THE LEGEND DESCRIBES THE PICTURE ───────────────────────────────────────────────────────
   「新しいGFSを読み込んでいる最中に、地図はECMWFのままなのに凡例だけGFSと表示する状態を作っては
    いけない。」 The structural guarantee is that there is exactly ONE writer of `displayed`, that it
   is called from the reveal, and that the words are built from `displayed` alone. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑥ what the reader is told is built from what is painted, and has one writer', () => {
  const wx = codeOnly(WX());
  assert.match(wx, /function displayed\(cfg\)\{ return \(state\[cfg\.id\]&&state\[cfg\.id\]\.displayed\)\|\|null; \}/,
    'there is a named reader for «what is on the screen»');
  /* exactly one assignment to .displayed, and it is inside commit() */
  const writes = (wx.match(/\.displayed\s*=/g) || []).length;
  assert.equal(writes, 1, 'exactly one place assigns displayed (found ' + writes + ')');
  assert.match(wx, /function commit\(cfg,prov\)\{[^}]*state\[cfg\.id\]\.displayed=prov;/,
    '…and it is commit()');
  /* commit is called from the reveal, beside the opacity change and the drop of the old slot */
  assert.match(wx, /dropSlot\(cfg,old\);[\s\S]{0,200}?commit\(cfg,prov\); renderOne\(cfg\);/,
    'the pixels and the words change in the same turn');
  /* the model line and the valid-time line read `displayed`, never `state.model` */
  const modelLine = wx.slice(wx.indexOf('function modelLine('), wx.indexOf('function modelLine(') + 1400);
  assert.ok(modelLine.length > 100, 'modelLine is where it is expected');
  assert.match(modelLine, /const st=state\[cfg\.id\]\|\|\{\}, d=displayed\(cfg\);/, 'modelLine reads both…');
  assert.match(modelLine, /esc\(d\.modelName\)/, '…and prints the DISPLAYED model');
  assert.ok(!/esc\(st\.modelName\)|st\.model\s*\)/.test(modelLine.replace(/m\.id===st\.model/g, '')),
    '…and never prints the requested one as if it were the displayed one');
  const whenLine = wx.slice(wx.indexOf('function whenLine('), wx.indexOf('function whenLine(') + 500);
  assert.match(whenLine, /const d=displayed\(cfg\);/, 'the valid-time line reads the displayed state');
  assert.match(whenLine, /if\(!d\|\|!d\.validTime\) return L\('loading/,
    '…and says «loading» rather than inventing an hour for a picture that is not there');
});

/* ── ⑦ provenance is one object, built at BUILD time and carried into the reveal ───────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑦ the provenance is the field’s own, not whatever is current when it lands', () => {
  const R = registry();
  const p = R.provenance({ modelId: 'dwd_icon', validTime: '2026-08-23T06:00Z',
    referenceTime: '2026-08-22T18:00:00Z', variable: 'temperature_2m', lat: 35.6, lon: 139.7 });
  assert.equal(p.modelId, 'dwd_icon');
  assert.equal(p.modelName, 'DWD ICON', 'the name comes from the row');
  assert.equal(p.agency, 'DWD', 'so does the credit');
  assert.equal(p.leadHours, 12, 'the lead time is derived, not carried');
  assert.equal(p.nativeResolutionKm, 13);
  assert.equal(p.sampledLatitude, 35.6);
  assert.equal(p.providerId, 'open-meteo');
  /* an unknown model still produces a usable object rather than throwing into a legend */
  const q = R.provenance({ modelId: 'gone', validTime: '', referenceTime: '' });
  assert.equal(q.leadHours, null, 'and an unknown one reports null rather than a number it made up');

  const wx = codeOnly(WX());
  assert.match(wx, /const src=EC\(cfg\);\s*const prov=WXM\(\)\.provenance\(\{modelId:src\.DOMAIN/,
    'the provenance is taken from the instance that built the slot');
});

/* ── ⑧ THE COLOUR-SCALE TRAP ──────────────────────────────────────────────────────────────────
   The renderer SDK's getColorScale ends in `?? settings.temperature`, so a variable it does not
   know comes back AS A TEMPERATURE, unit and all. Measured across the 857 variables the 58 live
   domains publish: 212 land on that branch and 52 of those are not temperatures — every air-quality
   species, both ocean currents, sea-level height, snowfall, weather codes. Shipping one of those as
   a layer would put a °C ramp under PM2.5 and nothing would have failed. */
test('R356 ⑧ a layer lands on the temperature fallback if and only if it IS a temperature', () => {
  const fx = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/om-sdk-colour-scales.json'), 'utf8'));
  /* the fixture is only about the version the reader pins.
     ⚠ A SUBSTRING, NOT A BUILT REGEXP. The first draft was `new RegExp("SDK_VER = '" +
     fx.sdkVersion.replace(/\./g, '\\.') + "'")`, and CodeQL was right to call that incomplete
     sanitisation: escaping only `.` leaves every other metacharacter live, so a version string
     containing `+` or `(` would have silently become a different pattern. There is no pattern to
     build here — the question is 「does the file contain this exact text」, which `includes` asks
     directly and cannot get wrong. */
  assert.ok(codeOnly(EC()).includes("SDK_VER = '" + fx.sdkVersion + "'"),
    'the measurement is against the SDK version js/wx-ecmwf.js actually loads (fixture says '
    + fx.sdkVersion + ')');
  assert.ok(fx.onFallbackAndNotATemperature >= 40,
    'the trap is real and large (' + fx.onFallbackAndNotATemperature + ' variables)');
  for (const v of ['pm2_5', 'pm10', 'ozone', 'ocean_u_current', 'sea_level_height_msl', 'weather_code'])
    assert.ok(fx.notATemperatureButGetsTheTemperatureScale.includes(v), v + ' is one of them');

  /* every layer IntMap ships: on the fallback branch exactly when the layer says it is a temperature */
  const wx = WX();
  const table = wx.slice(wx.indexOf('const LAYERS=['), wx.indexOf('const ecLbl='));
  const rows = [...table.matchAll(/\{id:'([\w-]+)',\s*variable:'(\w+)',\s*type:'(\w+)',\s*op:[\d.]+,\s*kind:'(\w+)'/g)]
    .map(m => ({ id: m[1], variable: m[2], type: m[3], kind: m[4] }));
  assert.ok(rows.length >= 8, 'the layer table was found and parsed (' + rows.length + ' rows)');
  for (const r of rows) {
    assert.ok(r.variable in fx.shipped, r.variable + ' was measured against the SDK');
    assert.equal(fx.shipped[r.variable], r.kind === 'temp',
      r.id + ' (' + r.variable + ') is on the temperature fallback iff it declares kind:temp — '
      + 'otherwise its legend would print the wrong unit and nothing would say so');
  }

  /* and the probe itself is the fallback BRANCH, not a guess that looks like it */
  const R = registry();
  const scales = { temperature: { unit: 'C' }, precipitation: { unit: 'mm' } };
  const sdk = { getColorScale: (v, d, s) => (s && s[v]) || (s && s.temperature) };
  assert.equal(R.usesFallbackScale(sdk, 'precipitation', scales), false, 'a known variable is not the fallback');
  assert.equal(R.usesFallbackScale(sdk, 'pm2_5', scales), true, 'an unknown one is');
  assert.equal(R.usesFallbackScale(sdk, 'temperature', scales), true,
    'and a genuine temperature is on that branch too — which is why the layer’s own kind is the other half of the test');
});

/* ── ⑨ two models are two instances and ONE of everything that belongs to the page ────────────*/
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R356 ⑨ the page keeps one SDK, one reader pool, one block cache and one set of ramps', () => {
  const ec = codeOnly(EC());
  const prelude = ec.slice(0, ec.indexOf('function createModel(cfg)'));
  const body = ec.slice(ec.indexOf('function createModel(cfg)'));
  for (const decl of ['var sdk = null, sdkP = null, protoReg = false;', 'var readers = [];',
    'var settings = null;', 'var _lys = null, _ids = null, _idsHooked = false;', 'var _dtf = Object.create(null);'])
    assert.ok(prelude.includes(decl), 'shared before the factory: ' + decl);
  for (const decl of ['var sdk = null', 'var readers = [', 'var settings = null', 'var _lys = null', 'var _dtf ='])
    assert.ok(!body.includes(decl), 'and NOT re-declared per instance: ' + decl);
  assert.ok(prelude.includes('var WINDY_WIND = rampFrom(WIND_ANCHORS, 0.1);'), 'the wind ramp is built once');
  assert.ok(prelude.includes('var WINDY_TEMP = rampFrom(TEMP_ANCHORS, 0.05);'), 'and so is the temperature ramp');

  /* the per-model state is inside, so it cannot be shared by accident */
  for (const decl of ['var meta = null;', 'var idx = 0;', 'var frames = [];', 'var touched = Object.create(null);',
    'var seq = 0;', 'var listeners = [];'])
    assert.ok(body.includes(decl), 'per instance: ' + decl);

  assert.match(ec, /window\.IntMapECMWF = model\(null\);/,
    'the name the app already uses IS the default instance, not a facade over a copy');
  assert.match(ec, /return instances\[cfg\.id\] \|\| \(instances\[cfg\.id\] = createModel\(cfg\)\);/,
    'and instances are built on demand, once each');
});

/* ── ⑩ an hour change on one model does not rebuild the layers on another ─────────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑩ each model wakes only the layers that are reading it', () => {
  const wx = codeOnly(WX());
  assert.match(wx, /function layersOn\(modelId\)\{ return activeLayers\(\)\.filter\(l=>state\[l\.id\]\.model===modelId\); \}/,
    'there is a named answer to «which layers are on this model»');
  assert.match(wx, /const mine=layersOn\(inst\.DOMAIN\);/, 'the subscription uses it');
  assert.ok(!/EC\(\)\.on\(ev=>/.test(wx), 'and the single module-wide subscription is gone');
  assert.match(wx, /if\(!inst\|\|!inst\.DOMAIN\|\|wired\[inst\.DOMAIN\]\) return; wired\[inst\.DOMAIN\]=1;/,
    'each model is subscribed to at most once');
  /* the warm-up is per model, with each model's own variables */
  assert.match(wx, /activeLayers\(\)\.forEach\(c=>\{ const m=state\[c\.id\]\.model; \(byModel\[m\]=byModel\[m\]\|\|\[\]\)\.push\(c\.variable\); \}\);/,
    'the prefetch groups variables by the model that will be asked for them');
});

/* ── ⑪ the share link carries the model, and only when it is not the default ──────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑪ an old link and an untouched session still produce the URL they produced before', () => {
  const wx = codeOnly(WX());
  assert.match(wx, /if\(state\[l\.id\]\.on&&state\[l\.id\]\.model&&state\[l\.id\]\.model!==def\) mdl\[l\.id\]=state\[l\.id\]\.model;/,
    'only a non-default model is written');
  assert.match(wx, /if\(Object\.keys\(mdl\)\.length\) o\.m=mdl;/, '…and the key is absent when there is nothing to say');
  assert.match(wx, /if\(v\.m\) Object\.keys\(v\.m\)\.forEach\(id=>\{ if\(!state\[id\]\) return; setModel\(id,v\.m\[id\]\); \}\);/,
    'restore goes through setModel, so a model that is gone is refused with a reason rather than swapped silently');
});

/* ── ⑫ the labels no longer name a model the layer may not be reading ─────────────────────────*/
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R356 ⑫ a layer that can read three models is not labelled with one of them', () => {
  const wx = WX();
  const table = wx.slice(wx.indexOf('const LAYERS=['), wx.indexOf('const ecLbl='));
  assert.ok(!/\(ECMWF\)/.test(table), 'no layer label claims a model in its name');
  assert.ok(!/（ECMWF）/.test(table), '…in any language');
  /* the model is still stated — in the one place that is rebuilt when the model changes */
  assert.match(codeOnly(wx), /class="ecl-model"/, 'the legend still says which model drew the picture');
  assert.match(codeOnly(wx), /class="ec-model" data-for="/, 'and offers the choice on the layer’s own legend');
});
}

/* ════════ #R514 — from tests/r514-checks.test.mjs ════════ */
{
/* ============================================================================
 *  IntMap · #R514 source checks — the model host moved upstream, and nothing here noticed
 * ----------------------------------------------------------------------------
 *  「本番 deploy の Post-deploy smoke が 2 回連続で同じ 5 本落ちている。上流の変更なのか、js 側の退行
 *    なのか、test 側の前提が古いのかを切り分けて根本原因で直すこと。」
 *
 *  MEASURED: Open-Meteo retired map-tiles.open-meteo.com (their Bunny CDN) on 2026-08-28; by
 *  2026-09-05 three public resolvers returned NXDOMAIN for it, and the successor their own maps app
 *  reads from (data-spatial.open-meteo.com) answers 403 to every Referer but *.open-meteo.com and
 *  localhost. The public origin they document for everybody else is the AWS Open Data bucket, and
 *  js/wx-models.js now reads from it. These checks pin the three things that had to move together:
 *
 *    ① the registry's URLs land on that origin AND keep the `data_spatial/<id>` segment the SDK
 *      extracts the domain from — a host change that dropped the prefix would load metadata and
 *      then fail to name the grid;
 *    ② the retired name is shipped nowhere (code, not comments: prose about the old host is history,
 *      a `dns-prefetch` for it is a request);
 *    ③ the policy the reader is shown names the host the code reads from, in both languages the
 *      policy exists in — the #R502 shape: a third-party recipient that changed while the sentence
 *      about it did not.
 *
 *  ⚠ NONE OF THIS ASKS THE NETWORK. Whether the host is up is a production question and is asked
 *  by tests/prod-smoke.spec.js (#R514) of the deployed build, before the five tests that need it.
 *  A unit test that resolved DNS would make `npm test` red on every train, and green on a runner
 *  whose resolver lies.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments are prose ABOUT the code and must never satisfy an assertion about the code (#R320) */

/* Load js/wx-models.js the way the browser does (the same harness tests/weather-models-checks.test.mjs #R356 uses). */
function registry() {
  const win = {};
  new Function('window', read('js/wx-models.js')).call(win, win);
  return win.IntMapWxModels;
}

const RETIRED = 'map-tiles.open-meteo.com';
/* THE HOSTS A TEXT NAMES — every token that parses as a hostname, compared WHOLE. Never a substring
   test: `text.includes(host)` also matches https://evil.example/?x=host, which is the defect CodeQL's
   js/incomplete-url-substring-sanitization names, and the same rule this repo already keeps in
   js/wx-source.js. The question here is membership, so it is asked of tokens. */
const hostsNamed = (text) => new Set(text.split(/[^A-Za-z0-9.-]+/)
  .filter((w) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(w)).map((w) => w.toLowerCase()));
/* the hosts index.html asks the browser to resolve early — parsed from the hint, not searched for */
const prefetched = (html) => new Set([...html.matchAll(/<link rel="dns-prefetch" href="([^"]+)">/g)]
  .map((m) => new URL(m[1]).hostname));
/* the SDK's own domain extraction — @openmeteo/weather-map-layer 0.0.19, dist/index.js:
   `xQ=/data_spatial\/(?<domain>[^/]+)/` — quoted from the pinned bundle so that ① asks the
   question the renderer asks, not one this file invents */
const SDK_DOMAIN_RE = /data_spatial\/(?<domain>[^/]+)/;

/* ── ① the registry reads from the public origin, on the path the SDK can parse ───────────── */
test('R514 ① every model URL is on the public AWS Open Data origin, with the segment the SDK parses', () => {
  const R = registry();
  assert.ok(R && R.HOST, 'js/wx-models.js publishes HOST');
  const host = new URL(R.HOST).hostname;
  assert.equal(host, 'openmeteo.s3.amazonaws.com', 'the host is the bucket Open-Meteo publishes for third parties');
  assert.equal(new URL(R.HOST).protocol, 'https:');
  for (const id of R.ids()) {
    const meta = R.metaUrl(id);
    const file = R.fileUrl(id, '2026-09-05T12:00:00Z', '2026-09-06T00:00Z');
    assert.ok(meta.startsWith(R.HOST + '/'), id + ': metadata is read from HOST');
    assert.ok(file.startsWith(R.HOST + '/'), id + ': fields are read from HOST');
    assert.equal(meta, R.HOST + '/' + id + '/latest.json');
    assert.equal(file, R.HOST + '/' + id + '/2026/09/05/1200Z/2026-09-06T0000.om', id + ': the path rule is unchanged');
    const m = SDK_DOMAIN_RE.exec(file);
    assert.ok(m && m.groups.domain === id, id + ': the SDK can still read the domain out of the file URL');
  }
});

/* ── ② the retired host is shipped nowhere ────────────────────────────────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R514 ② the retired CDN name is in no shipped code and no boot hint', () => {
  for (const p of ['js/wx-models.js', 'js/wx-ecmwf.js', 'js/weather.js', 'js/wx-wind.js', 'js/wx-source.js',
    'js/legal-text.js', 'sw.js']) {
    assert.ok(!hostsNamed(codeOnly(read(p))).has(RETIRED), p + ' ships no reference to ' + RETIRED);
  }
  const html = read('index.html');
  assert.ok(!hostsNamed(html).has(RETIRED), 'index.html does not name a host that does not resolve');
  assert.ok(!prefetched(html).has(RETIRED), 'and does not prefetch it');
  const R = registry();
  const host = new URL(R.HOST).hostname;
  assert.ok(prefetched(html).has(host), 'index.html prefetches the host the code reads from (' + host + ')');
});

/* ── ③ the policy names the recipient the code sends the request to ───────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R514 ③ the privacy policy names the model host the code reads from, in both languages', () => {
  const R = registry();
  const host = new URL(R.HOST).hostname;
  const src = codeOnly(read('js/legal-text.js'));
  const ja = src.slice(src.indexOf('4. 第三者'), src.indexOf('5. ', src.indexOf('4. 第三者')));
  const en = src.slice(src.indexOf('4. Third parties'), src.indexOf('5. ', src.indexOf('4. Third parties')));
  assert.ok(ja.length > 500 && en.length > 500, 'both §4 sections were found');
  const jaHosts = hostsNamed(ja), enHosts = hostsNamed(en);
  assert.ok(jaHosts.has(host), 'Privacy §4 (ja) names ' + host);
  assert.ok(enHosts.has(host), 'Privacy §4 (en) names ' + host);
  assert.ok(!jaHosts.has(RETIRED) && !enHosts.has(RETIRED), 'and neither still names the retired host');
  /* the bucket is Amazon's; the policy must say so — the recipient of the request is the fact */
  assert.ok(/Amazon Web Services/.test(en), 'Privacy §4 (en) says who serves the bytes');
  assert.ok(/Amazon Web Services/.test(ja), 'Privacy §4 (ja) says who serves the bytes');
});

/* ── ④ the S3 origin is outside Open-Meteo's daily-quota circuit breaker, deliberately ─────── */
test('R514 ④ the bucket is not mistaken for an Open-Meteo API host by the quota breaker', () => {
  /* js/wx-source.js trips a day-long breaker on Open-Meteo's `Daily API request limit` 429. The
     bucket has no such quota and must not share the breaker: a tripped API breaker used to take
     the model metadata down with it. Asked of the shipped predicate, not of a copy. */
  const win = { location: { href: 'https://rwmqx7dwb5-arch.github.io/IntMap/' } };
  const src = read('js/wx-source.js');
  const iife = src.indexOf('(function');
  assert.ok(iife >= 0, 'js/wx-source.js is an IIFE');
  let Wx = null;
  try {
    new Function('window', 'location', 'fetch', 'localStorage', src.slice(iife)).call(win, win, win.location,
      () => Promise.reject(new Error('no network in this test')), null);
    Wx = win.IntMapWx;
  } catch (e) { assert.fail('js/wx-source.js did not load against a bare window: ' + e.message); }
  assert.ok(Wx && typeof Wx.isOpenMeteo === 'function', 'IntMapWx.isOpenMeteo exists');
  const R = registry();
  assert.equal(Wx.isOpenMeteo(R.metaUrl(R.defaultId())), false, 'the bucket is not an Open-Meteo API host');
  assert.equal(Wx.isOpenMeteo('https://api.open-meteo.com/v1/forecast'), true, 'while the API still is');
});
}
