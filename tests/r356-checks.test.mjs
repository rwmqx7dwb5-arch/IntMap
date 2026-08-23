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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments are prose ABOUT the code and must never satisfy an assertion about the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has now paid for ten times (#R320). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
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
test('R356 ⑪ an old link and an untouched session still produce the URL they produced before', () => {
  const wx = codeOnly(WX());
  assert.match(wx, /if\(state\[l\.id\]\.on&&state\[l\.id\]\.model&&state\[l\.id\]\.model!==def\) mdl\[l\.id\]=state\[l\.id\]\.model;/,
    'only a non-default model is written');
  assert.match(wx, /if\(Object\.keys\(mdl\)\.length\) o\.m=mdl;/, '…and the key is absent when there is nothing to say');
  assert.match(wx, /if\(v\.m\) Object\.keys\(v\.m\)\.forEach\(id=>\{ if\(!state\[id\]\) return; setModel\(id,v\.m\[id\]\); \}\);/,
    'restore goes through setModel, so a model that is gone is refused with a reason rather than swapped silently');
});

/* ── ⑫ the labels no longer name a model the layer may not be reading ─────────────────────────*/
test('R356 ⑫ a layer that can read three models is not labelled with one of them', () => {
  const wx = WX();
  const table = wx.slice(wx.indexOf('const LAYERS=['), wx.indexOf('const ecLbl='));
  assert.ok(!/\(ECMWF\)/.test(table), 'no layer label claims a model in its name');
  assert.ok(!/（ECMWF）/.test(table), '…in any language');
  /* the model is still stated — in the one place that is rebuilt when the model changes */
  assert.match(codeOnly(wx), /class="ecl-model"/, 'the legend still says which model drew the picture');
  assert.match(codeOnly(wx), /class="ec-model" data-for="/, 'and offers the choice on the layer’s own legend');
});
