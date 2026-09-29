/* ============================================================================
 *  The layer packs: GIBS rasters, World-Bank choropleths, OSM facilities, data centres, precipitation, plates, time zones and railways
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r204-checks.test.mjs, tests/r266-checks.test.mjs, tests/r268-checks.test.mjs, tests/r254-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs, { existsSync, statSync, readFileSync } from 'node:fs';
import path, { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';
import { uiLocale, uiLocaleCodes } from './helpers/layer-locale-tables.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r204-checks.test.mjs — 3 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している）（ラベルの大きさの関係は js/label-scale.js を実行して評価している） */
/* (#R204) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */
const rd = read;

/* ── ⑥ THE PLATE LAYER ────────────────────────────────────────────────────────────────────────── */
test('R204 ⑥ the plate name is the biggest a non-place label may be, and stays under a place name', async () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /'text-size':window\.IntMapLabelScale\.sub\(1\)/, 'the plate label asks for the top of the sub ladder');
  assert.match(lp, /'text-font':\['Noto Sans Bold'\]/, 'as a plain font stack (js/cesium-layers fontOf reads spec[0])');
  /* …and the plate label's own line no longer uses the ['literal', …] form that reached Cesium as a
     font family called "literal". (Other layers in this file still use it; that is their round.) */
  const plateLbl = /id:'eco-plates-lbl'[\s\S]*?\}\}\);/.exec(lp);
  assert.ok(plateLbl, 'the plate label layer is declared');
  assert.doesNotMatch(plateLbl[0], /\['literal',/, "the plate label carries no ['literal', …] stack");
  /* the relation #R198 owns, re-derived from js/label-scale.js rather than quoted.
     (consolidation) EVALUATED: the module is run and ASKED — the size `sub(1)` hands the plate label,
     read at every zoom stop either table declares and between them, against the biggest a place
     name can be there (`refAt`). The regex this replaced re-did the arithmetic on REF, which stopped
     being what SUB is derived from in #R210 (SUB_REF), so it was checking a relation that no longer ships. */
  const lctx = { window: {} };
  vm.createContext(lctx);
  vm.runInContext(rd('js/label-scale.js'), lctx, { filename: 'label-scale.js' });
  const LS = lctx.window.IntMapLabelScale;
  const expr = LS.sub(1);
  assert.deepEqual(Array.from(expr.slice(0, 3), (x) => JSON.stringify(x)), ['"interpolate"', '["linear"]', '["zoom"]'], 'sub() is a zoom ramp');
  const zs = new Set([0, 0.5, 2.5, 30]);
  for (let i = 3; i < expr.length; i += 2) zs.add(expr[i]);
  for (const [z] of LS.REF) zs.add(z);
  for (const z of zs) {
    const sub = LS.subAt(z, 1), px = LS.refAt(z);
    assert.ok(sub < px, `at z${z} the plate label would be ${sub}px against a place name's ${px}px`);
  }
  for (let i = 3; i < expr.length; i += 2) {
    assert.equal(expr[i + 1], LS.subAt(expr[i], 1), 'the ramp the layer is handed is the one subAt measures, at z' + expr[i]);
  }
});

test('R204 ⑥b the plate layer retries instead of waiting for an idle that may never come', () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /function retry\(fn\)\{ let n=0;/, 'there is a bounded poll');
  assert.match(lp, /else if\(which==='plates'\)\{ retry\(/, 'and the plate toggle uses it');
  assert.match(lp, /if\(which==='worldcover'\)\{ retry\(/, 'as does the land-cover toggle');
  /* the data is KEPT and installed idempotently — #R204 measured it being dropped 1 run in 3 */
  assert.match(lp, /let plateGJ=null, plateBD=null;/);
  assert.match(lp, /function installPlates\(\)/);
  assert.match(lp, /platesLoaded=true; platesLoading=false;\s*\n\s*installPlates\(\);/,
    'loadPlates installs what it fetched rather than dropping it when the source is late');
  /* ⚠ the ONE sanitizer (#R138). `escapeHtml` does not exist and threw silently. */
  assert.match(lp, /window\.IntMapSafe\.html\(String\(s\)\)/);
  assert.doesNotMatch(lp, /IntMapSafe\.escapeHtml/, 'IntMapSafe has no escapeHtml');
});

/* ── ⑦ TIME ZONES ─────────────────────────────────────────────────────────────────────────────── */
test('R204 ⑦ pressing an offset highlights every band on it', () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /properties:\{label:offLabel\(b\.z\)\+'\\n'\+zoneTime\(b\.z\),zone:b\.z\}/,
    'the label feature carries the offset it names');
  assert.match(lp, /id:'tzl-hl',type:'fill'/, 'there is a highlight fill');
  assert.match(lp, /filter:\['==',\['get','zone'\],-1e9\]/, 'selecting nothing by default');
  assert.match(lp, /\[\['tzl-time',true\],\['tzl-fill',false\]\]\.forEach/, 'and both the text and the polygon answer a click');
  /* ⚠ …with the LABEL winning. One press lands on both — the label is anchored over its zone's
     largest polygon, which at low zoom is often drawn across a neighbour — and the fill's handler
     ran last. Measured: pressing 「UTC+8」 highlighted zone 7. */
  assert.match(lp, /if\(e && e\.__tzTaken\) return;/, 'the fill stands down when the label took the click');
  assert.match(lp, /if\(fromLabel && e\) e\.__tzTaken=true;/);
  assert.ok(lp.indexOf("['tzl-time',true]") < lp.indexOf("['tzl-fill',false]"), 'the label is wired first');
  assert.match(lp, /setHighlight\(\(hlZone!=null&&\+z===hlZone\)\?null:z\)/, 'a second press clears it');
  /* ⚠ (#R290) EXTENDED, NOT ASSIGNED. This literal used to REPLACE the object #R289 published two
     screens above it, which is why 「地図の中心の標準時」 silently gave every reader their device
     clock. The published name has to end up with BOTH sets of members, so that is what is asked. */
  assert.match(lp, /window\.IntMapTimeZones=Object\.assign\(window\.IntMapTimeZones\|\|\{\},\{ highlight:/,
    'published so Atlas and the tests can ask — by extending, never by replacing');
  assert.ok(!/window\.IntMapTimeZones=\{/.test(lp),
    'nothing in this file assigns the name outright: a second assignment would erase the first');
});
}

/* ══════════ from tests/r266-checks.test.mjs — 8 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している） */
/* ============================================================================
 *  #R266 — source-level checks for the round's twelve reports
 * ----------------------------------------------------------------------------
 *  These are the invariants that a later round could undo WITHOUT anything else
 *  going red: a deleted layer coming back, a retired World-Bank indicator being
 *  re-typed, the two globally-sparse facility sets losing their shipped snapshot,
 *  the alert layer losing a feed, the year picker losing its default.
 * ==========================================================================*/
/* (on the import of 'node:zlib') */ /* (#R388) the railway data ships gzipped */
const json = (p) => JSON.parse(read(p));
/* ⚠ THE CHECK MUST NOT BE ABLE TO CATCH THE NOTE THAT EXPLAINS IT. Every «X must be gone» assertion
   below names the CODE SHAPE X had — `code:'…'`, `fetch('…')`, `esc(L('…` — and not the bare string,
   because this round's own comments quote the retired strings to explain why they went:
   [[intmap-recurring-lessons]] records that shape eight times, and it caught three of these checks
   on the first run. ⚠ AND NOT BY STRIPPING COMMENTS EITHER: the first fix here was
   `read(p).replace(/\/\*…\*\//g, ' ')`, which CodeQL reads as an incomplete sanitizer
   (js/incomplete-sanitization, high) — correctly, since a comment terminator inside a string
   literal breaks it, which this very note managed to demonstrate on its first draft.
   Matching on syntax needs no sanitizer at all. */

test('R266 ①: the eight GIBS rasters named for deletion are gone from every surface', () => {
  const DEAD = ['gxtruecolor', 'gxlst', 'gxwvapor', 'gxcloud', 'gxcloudtop', 'gxlstnight', 'gxbtday', 'gxchlor'];
  const files = ['js/layer-packs.js', 'js/layer-previews.js', 'js/atlas-console.js', 'js/data-layers.js', 'scripts/static-checks.mjs'];
  for (const f of files) {
    const s = read(f);
    for (const id of DEAD) assert.ok(!read(f).includes(id), `${f} still names ${id}`);
  }
  /* …and the ones that were NOT named are still there — a deletion instruction is a list, not a sweep */
  const lp = read('js/layer-packs.js');
  /* ⚠ (#R289) `gxaero` and `gxco` LEFT THIS LIST BECAUSE THEY WERE ASKED FOR BY NAME — 「紫外線エアロゾル
     指数」「一酸化炭素 (CO)」 are deleted this round, so a check that they still exist would report a
     requested change as a regression. The list is otherwise unchanged, which is the point of it. */
  for (const id of ['gxndvi', 'gxseaice', 'gxsstanom', 'gxrelief', 'gxsoil']) {
    assert.ok(lp.includes("{id:'" + id + "'"), id + ' was deleted and nobody asked for that');
  }
});

test('R266 ②: the sea-surface-temperature ANOMALY layer explains what an anomaly is', () => {
  const s = read('js/layer-packs.js');
  const i = s.indexOf("{id:'gxsstanom'");
  assert.ok(i > 0);
  const block = s.slice(i, i + 4000);
  assert.match(block, /more:LA\(/, 'the anomaly layer carries no explanation');
  assert.match(block, /a DIFFERENCE, not a temperature/, 'the explanation does not say what an anomaly IS');
  assert.match(s, /m\.querySelector\('\.gx-more-b'\)\.textContent=_lx\(L\.more\)/, 'the legend never renders `more`');
});

test('R266 ③: no World-Bank layer points at an indicator the Bank has retired', () => {
  const s = read('js/wb-layers.js');
  /* the API answers «The indicator was not found. It may have been deleted or archived.» for both */
  for (const dead of ['SM.POP.REFG', 'SH.STA.OWAD.ZS']) {
    assert.ok(!s.includes("code:'" + dead + "'"), dead + ' is archived — the layer can only ever say 「取得できませんでした」');
  }
  assert.ok(s.includes("'SM.POP.RHCR.EA'") && s.includes("'SM.POP.RRWA.EA'"),
    'the refugee layer must sum the UNHCR and UNRWA series that replaced SM.POP.REFG');
  /* the exact duplicates are merged, not both kept */
  /* ⚠ COUNTED BY SPLITTING, NOT BY BUILDING A REGEXP. Escaping dots and not backslashes is what
     CodeQL reads as an incomplete sanitizer (js/incomplete-sanitization, high) — and it is right that
     the shape is wrong even where the input is a literal I control. A substring count needs no
     escaping at all. */
  for (const ind of ['SP.URB.TOTL.IN.ZS', 'ST.INT.ARVL']) {
    const n = s.split("code:'" + ind + "'").length - 1;
    assert.equal(n, 1, ind + ' is declared twice — that is the 「何が違うか」 report');
  }
});

test('R266 ④: every World-Bank choropleth paints ONE year, and says which', () => {
  const s = read('js/wb-layers.js');
  assert.match(s, /function wbSeries\(code\)/, 'the whole series is not fetched, so no year can be chosen');
  assert.match(s, /const wbYear=\{\}/, 'no per-layer year state');
  assert.match(s, /class="bx-year"/, 'the legend has no year picker');
  /* the default is a year, not the old mixed «latest per country» */
  assert.match(s, /wbYear\[L\.id\]!==undefined\)\?wbYear\[L\.id\]:\(\(S&&S\.best\)\|\|''\)/, 'the default is not the series default year');
  assert.match(s, /counts\[years\[i\]\]>=max\*0\.9/, 'the default year is not chosen by coverage');
  /* the second World-Bank family (js/layer-packs.js) got the same control */
  const lp = read('js/layer-packs.js');
  assert.match(lp, /const wbYr=\{\}/, 'the corruption / life-expectancy / unemployment / internet / precipitation family has no year state');
  assert.match(lp, /class="wb-year"/, '…and no picker');
  assert.match(lp, /window\.IntMapWB&&window\.IntMapWB\.series/, '…and it fetches its own series instead of sharing one');
});

test('R266 ⑤: the two globally sparse facility sets ship a global snapshot', () => {
  const s = read('js/osm-facilities.js');
  assert.match(s, /global:'data\/osm-diplo\.json'/);
  assert.match(s, /global:'data\/osm-space\.json'/);
  assert.match(s, /if\(z<SET\.zoom\) return;\s*\/\* the live query stays gated; the picture no longer is \*\//,
    'the zoom gate still blanks the layer');
  /* only these two — the other ten are dense enough that a viewport always holds some */
  assert.equal((s.match(/global:'data\/osm-/g) || []).length, 2);
  for (const [f, min] of [['data/osm-diplo.json', 10000], ['data/osm-space.json', 3000]]) {
    const j = json(f);
    assert.ok(j.count >= min, `${f} holds ${j.count}, expected at least ${min}`);
    assert.equal(j.count, j.features.length);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.built), f + ' does not say when it was built');
    for (const p of j.features.slice(0, 50)) {
      assert.ok(p.x >= -180 && p.x <= 180 && p.y >= -85 && p.y <= 85, 'a point is off the map');
      assert.ok(typeof p.k === 'string' && p.k.length, 'a point has no bucket');
    }
  }
  /* the diplomatic snapshot has to contain what the layer is named after */
  const d = json('data/osm-diplo.json');
  const kinds = new Set(d.features.map((f) => f.k));
  assert.ok(kinds.has('embassy') && kinds.has('consulate'), 'no embassies or consulates in the embassy layer');
  const sp = json('data/osm-space.json');
  const sk = new Set(sp.features.map((f) => f.k));
  for (const k of ['spaceport', 'pad', 'ground', 'radio']) assert.ok(sk.has(k), 'the space set has no ' + k);
});

test('R266 ⑧: annual precipitation is a measured field, and its grid is read from the manifest', () => {
  const s = read('js/precip-annual.js');
  assert.ok(!/const\s+(VAL_W|W)\s*=\s*\d{3,}/.test(s), 'the grid is hard-coded here instead of read from the manifest');
  /* (fetch-deadline-layer) the manifests are read under js/fetch-deadline.js's clock now — read(f) is
     jsonWithin(url(f), clockFor(url(f))) in the same file; what this pins is that BOTH come from the data files */
  assert.match(s, /read\('data\/precip-mm\.json'[,)]/);   /* (unobserved-is-not-refused) the read may also take the clock's scale */
  assert.match(s, /read\('data\/precip-year\.json'[,)]/);
  assert.match(s, /const read = \(f, s\) => \{ const u = url\(f\); return jsonWithin\(u, clockFor\(u\) \* s\); \};/);
  assert.match(s, /GE\(\)\.layers\.updateImage\(SRC/, 'the image source is repointed off-contract');

  const mm = json('data/precip-mm.json');
  assert.equal(mm.bands.length + 1, mm.colors.length, 'the bands and the colours disagree');
  assert.ok(mm.width >= 1800 && mm.height >= 900, 'the readout grid is coarser than 0.2°');
  assert.ok(/CHELSA/.test(mm.source), 'the climatology does not name its source');
  assert.ok(mm.mercator && mm.mercator.file && mm.mercator.phone, 'no picture is declared');

  const yr = json('data/precip-year.json');
  assert.ok(yr.years.length >= 30, 'fewer than thirty years to choose from');
  assert.equal(yr.years[0], 1981);
  assert.ok(/GPCC/.test(yr.source) && /DWD|Deutscher Wetterdienst/.test(yr.source));
  /* the two rasters share ONE encoding, so one decoder serves both */
  assert.equal(mm.logMax, yr.logMax);

  for (const f of ['precip_mercator_1981-2010.png', 'precip_mercator_1981-2010_4k.png', 'data/precip-mm.png', 'data/precip-year.png']) {
    const st = fs.statSync(path.join(ROOT, f));
    assert.ok(st.size > 100000, f + ' is suspiciously small');
    assert.ok(st.size < 12 * 1024 * 1024, f + ' is too heavy to ship');
  }
  /* the country-average World-Bank precipitation layer is still there — this is additive */
  const lp = read('js/layer-packs.js');
  assert.match(lp, /AG\.LND\.PRCP\.MM/);
  /* ⚠ (#R266 追記) …AND THE TWO ARE NOT BOTH CALLED «Annual precipitation». Measured on production:
     the new 1 km field and the World-Bank country average both read 「年降水量」 in the layer list —
     the very ambiguity 「人口密度レイヤは、国別とグリッドで名称の区別をつけて」 was reported about,
     reproduced by this round's own addition. */
  assert.match(lp, /precip:LA\('Annual precipitation \(by country\)'/, 'the country average does not say so');
  assert.ok(!/precip:LA\('Annual precipitation','/.test(lp), 'the two precipitation layers share a name again');
});

test('R266 ⑪: 1520 and 1524 are two gauges, and the three population layers are three names', () => {
  /* ⚠ (#R388) THE FINDING SURVIVED THE LAYER IT WAS WRITTEN AGAINST. #R266's claim is that 1520 mm
     and 1524 mm are two gauges and the map must draw them apart; what it checked was a colour table
     in js/layer-packs.js, a legend row, and a country list in _rail_convert.py — all three of which
     were how the OLD layer expressed it. The layer now reads OpenStreetMap's own `gauge` tag per
     track (js/rail-schema.js + js/railways.js), so the claim is re-asserted against that, and the
     DATA half is now stronger than it was: 1524 no longer comes from a hard-coded ['FIN'], it comes
     from Finnish track that says 1524. A gate outlives the mechanism it was written for. */
  const schema = read('js/rail-schema.js');
  assert.match(schema, /\['g1520', '#e03131'\]/, 'the Russian gauge has no colour of its own');
  assert.match(schema, /\['g1524', '#f08080'\]/, 'the Finnish gauge has no colour of its own');
  const layer = read('js/railways.js');
  assert.match(layer, /g1524: \(\) => LA\('Finnish 1524 mm'/, '…and no legend row');
  assert.match(layer, /g1520: \(\) => LA\('Russian 1520 mm'/);
  assert.ok(!layer.includes("'Russian 1520/1524 mm'"), 'the merged label is back');
  /* …and the two buckets cannot collapse into one */
  const bucket = /function gaugeBucket[\s\S]*?\n  \}/.exec(schema);
  assert.ok(bucket && /1520/.test(bucket[0]) && /1524/.test(bucket[0]), 'gaugeBucket stopped distinguishing them');

  const worldGz = path.resolve(ROOT, 'data/railways/world.json.gz');
  if (fs.existsSync(worldGz)) {
    const w = JSON.parse(gunzipSync(fs.readFileSync(worldGz)).toString('utf8'));
    const gi = w.k.indexOf('g');
    assert.ok(gi >= 0, 'the world file no longer ships a gauge');
    const seen = new Set();
    for (const t of w.d) if (t[gi] != null) seen.add(t[gi]);
    assert.ok(seen.has(1524), 'no line in the world is 1524 mm — Finland lost its own gauge');
    assert.ok(seen.has(1520), 'the 1520 mm class was emptied');
  }

  /* one is a 1 km grid, one is a country average, one is the World Bank's country average */
  /* (consolidation) EVALUATED: the names are read out of the tables js/locales/ui.<code>.js hands
     to IntMapLang.define, for every table that exists — not matched as text */
  const en = uiLocale('en').ui;
  assert.equal(en.lyrPop, 'Population density (by country)');
  assert.equal(en.lyrPopGrid, 'Population density (1 km grid)');
  /* the World-Bank row's name is written inside js/wb-layers.js's own factory table */
  assert.match(read('js/wb-layers.js'), /Population density \/km² \(World Bank\)/);
  const codes = uiLocaleCodes();
  assert.ok(codes.length >= 9, 'all nine UI tables are found (' + codes.join(',') + ')');
  for (const c of codes) {
    const t = uiLocale(c).ui;
    assert.ok(typeof t.lyrPop === 'string' && t.lyrPop.length > 0, c + ' lost lyrPop');
    assert.ok(typeof t.lyrPopGrid === 'string' && t.lyrPop !== t.lyrPopGrid, c + ' calls the country layer and the grid layer the same thing');
  }
});

test('R266 ⑬: the auto-rotate row is named the same thing in all nine languages', () => {
  const s = read('js/layer-packs.js');
  assert.match(s, /spin:LA\('Auto-rotate','自動回転'/);
  assert.ok(!s.includes("LA('Globe tour (slow spin)'"));
  /* (consolidation) EVALUATED: the English-keyed inline table each language hands to IntMapLang.define */
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) {
    const inl = uiLocale(c).inline;
    assert.ok(typeof inl['Auto-rotate'] === 'string' && inl['Auto-rotate'].length > 0, 'ui.' + c + '.js has no entry for the new name');
    assert.ok(!('Globe tour (slow spin)' in inl), 'ui.' + c + '.js still carries the old key');
  }
});
}

/* ══════════ from tests/r268-checks.test.mjs — 7 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している） */
/* ============================================================================
 *  IntMap · #R268 source & data checks
 * ----------------------------------------------------------------------------
 *  Every assertion here is about something that WAS wrong this round and was measured before it was
 *  changed. They are written against the RELATION rather than against a literal wherever that is
 *  possible (#R264's lesson: a test that pins a constant passes while the thing it is about breaks).
 * ==========================================================================*/
const json = (p) => JSON.parse(read(p));
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */

/* ── ④ the sparse facility layers ──────────────────────────────────────────────────────────── */
test('R268 ④ the live facility query is merged with the shipped snapshot, never substituted', () => {
  const s = codeOnly(read('js/osm-facilities.js'));
  const i = s.indexOf('cache.set(ck,feats)');
  const j = s.indexOf("showing='live'", i);
  assert.ok(i > 0 && j > i, 'the live path must still exist');
  const between = s.slice(i, j);
  assert.match(between, /inBox\(all,bb0\)/, 'the snapshot in view must be added to the live answer');
  assert.match(between, /osmId/, 'the merge must dedupe by OSM id');
});

test('R268 ④ the space layer asks for the satellite-communication tag, in both places', () => {
  const live = codeOnly(read('js/osm-facilities.js'));
  const build = codeOnly(read('scripts/build-osm-sparse.mjs'));
  const tag = 'communication:satellite';
  assert.ok(live.includes(tag), 'the live query must include it');
  assert.ok(build.includes(tag), 'the snapshot builder must include it');
  /* …and the shipped snapshot must actually have been rebuilt with it */
  const j = json('data/osm-space.json');
  assert.ok(j.count > 14000, `the space snapshot has ${j.count} objects, expected more than 14,000`);
  const k = {};
  for (const f of j.features) k[f.k] = (k[f.k] || 0) + 1;
  for (const b of ['pad', 'spaceport', 'ground', 'radio']) assert.ok(k[b] > 0, `bucket ${b} must be present`);
  assert.ok(j.query.some((q) => q.includes(tag)), 'the snapshot must record the query it was built with');
});

/* ── ⑥ GDP growth: zero is the hinge ───────────────────────────────────────────────────────── */
test('R268 ⑥ the GDP-growth ramp is diverging, white at zero and symmetric', () => {
  const s = read('js/wb-layers.js');
  const m = /\{id:'wbgdpgrow',[^}]*ramp:\[([^\]]*)\]/.exec(s);
  assert.ok(m, 'the GDP-growth layer must still exist');
  const parts = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  const stops = [];
  for (let i = 0; i < parts.length; i += 2) stops.push([Number(parts[i]), parts[i + 1]]);
  const zero = stops.find((x) => x[0] === 0);
  assert.ok(zero, 'there must be a stop exactly at 0');
  assert.equal(zero[1].toLowerCase(), '#ffffff', '…and it must be white');
  const lo = stops[0][0], hi = stops[stops.length - 1][0];
  assert.equal(lo, -hi, `the ramp must be symmetric about zero (${lo} … ${hi})`);
  /* ⚠ THE INVARIANT IS THE INSTRUCTION, NOT A CHANNEL ORDERING. 「0付近は白、正ほど青、負ほど赤」 says
     three things: white at zero, red on the negative side, blue on the positive side — and, because
     「ほど」 is a comparative, further from zero means further from white. A monotonic red channel is
     NOT that (a red → white → blue ramp has red rising on the way up to white), and asserting it is
     how a test ends up failing a correct palette. */
  const chan = (hex, o) => parseInt(hex.slice(1 + o * 2, 3 + o * 2), 16);
  const dist = (hex) => Math.max(...[0, 1, 2].map((o) => Math.abs(255 - chan(hex, o))));
  for (const [v, c] of stops) {
    if (v < 0) assert.ok(chan(c, 0) > chan(c, 2), `a shrinking economy must be reddish, got ${c} at ${v}`);
    if (v > 0) assert.ok(chan(c, 2) > chan(c, 0), `a growing economy must be bluish, got ${c} at ${v}`);
  }
  const neg = stops.filter((x) => x[0] <= 0).sort((a, b) => b[0] - a[0]);
  const pos = stops.filter((x) => x[0] >= 0).sort((a, b) => a[0] - b[0]);
  for (const side of [neg, pos]) for (let i = 1; i < side.length; i++) {
    assert.ok(dist(side[i][1]) > dist(side[i - 1][1]),
      `further from zero must be further from white: ${side[i - 1][1]} → ${side[i][1]}`);
  }
});

/* ── ⑦ every raster with an archive can be asked for another date ──────────────────────────── */
test('R268 ⑦ the GIBS date range is measured data, and every dated layer has one', () => {
  const r = json('data/gibs-range.json');
  const s = codeOnly(read('js/layer-packs.js'));
  const ids = [...s.matchAll(/\{id:'(gx[a-z0-9]+)',\s*gibs:'([^']+)'/g)].map((m) => [m[1], m[2]]);
  /* ⚠ (#R289) 6 → 5. 「紫外線エアロゾル指数」 and 「一酸化炭素 (CO)」 were deleted BY NAME this
     round, so a floor of six would report a requested removal as a regression. The floor is what
     stops the list being quietly emptied; it follows the list DOWN, exactly as the line ceilings do. */
  assert.ok(ids.length >= 5, `expected the GIBS list, found ${ids.length}`);
  for (const [id, gibs] of ids) {
    if (/staticDate/.test(s.slice(s.indexOf("{id:'" + id + "'"), s.indexOf("{id:'" + id + "'") + 260))) continue;
    const row = r.layers[id];
    assert.ok(row, `${id} has no measured temporal extent`);
    assert.equal(row.gibs, gibs, `${id} must name the same GIBS product as the layer`);
    assert.ok(row.from < row.to, `${id}: ${row.from} must precede ${row.to}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.from) && /^\d{4}-\d{2}-\d{2}$/.test(row.to), 'ISO dates');
  }
  /* the URL is built from the chosen date, not from «today» */
  assert.match(s, /const urlFor=\(L\)=>'https:\/\/gibs[^']*'\+L\.gibs\+'\/default\/'\+gxAt\(L\)/, 'urlFor must use gxAt');
  /* one promise for everybody — the second layer must not get a null while the first is fetching */
  assert.match(s, /if\(gxRangeP\) return gxRangeP;/, 'the in-flight promise must be shared');
});

test('R268 ⑦ the two-epoch rasters can be switched too', () => {
  const dl = codeOnly(read('js/data-layers.js'));
  /* ⚠ (#R550) THIS USED TO PIN `NIGHTSAT_EPOCHS` AND `window._nightsatEpoch` BY SPELLING, AND BOTH
     ARE GONE. The night-lights year is a function of Chronos now (js/night-lights.js): the private
     epoch variable was a second clock for one layer, and it had already produced the defect a second
     clock produces — js/night-side.js went on compositing 2016 of the SAME product while this layer
     drew 2012. Pinning the old spelling would assert only that the old model is still there.
     What #R268 was ABOUT is a property, and the property is what is checked: this raster still
     publishes more than one epoch, the two GIBS actually serves are still among them, and the tile
     URL is still built FROM the chosen one rather than from a fixed date. The BEHAVIOUR — which year
     a given clock year selects — is exercised by running the module, in tests/r550-checks.test.mjs. */
  const nl = codeOnly(read('js/night-lights.js'));
  const epochs = [...nl.matchAll(/id:'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  assert.ok(epochs.length >= 2, `night lights: expected an epoch list, found ${epochs.length}`);
  for (const d of ['2012-01-01', '2016-01-01'])
    assert.ok(epochs.includes(d), `night lights: ${d} is an epoch GIBS serves and must still be offered`);
  assert.match(nl, /\+e\.gibs\+'\/default\/'\+e\.id\b/, 'the URL must be built from the chosen epoch');
  assert.match(dl, /setSourceTiles\('src-nightsat',tiles\)/, '…and the layer must re-point to it');
  /* (#R268 追記) …and the 1 km population grid, which GIBS publishes as one product PER EPOCH.
     Probed one tile each: 2000 / 2005 / 2010 / 2015 / 2020 all answer 200. */
  assert.match(dl, /const POPGRID_EPOCHS=\['2020','2015','2010','2005','2000'\]/, 'the five GPW epochs');
  assert.match(dl, /const popgridTiles=\(\)=>gibsStatic\('GPW_Population_Density_'\+window\._popgridYear/,
    'the URL must be built from the chosen epoch');
  assert.match(dl, /addRaster\('popgrid',popgridTiles\(\),7\)/, '…and the layer must use it');
  const lp = codeOnly(read('js/layer-packs.js'));
  assert.match(lp, /const WC_EPOCHS=/, 'land cover: both ESA WorldCover versions');
  assert.ok(lp.includes('esa-worldcover-map-10m-2020-v1_map') && lp.includes('esa-worldcover-map-10m-2021-v2_map'),
    'both Terrascope layer names must be present');
  assert.match(lp, /tiles:wcTiles\(\)/, 'the source must be built from the chosen year');
});

test('R268 ⑪ the annual-precipitation tile has a real screenshot', () => {
  const s = read('js/layer-previews.js');
  assert.match(s, /'dl-annprecip':'preview_precip\.png'/, 'the tile must name the capture');
  assert.ok(existsSync(join(ROOT, 'preview_precip.png')), 'the capture must be committed');
  const size = statSync(join(ROOT, 'preview_precip.png')).size;
  assert.ok(size > 20000 && size < 400000, `the capture is ${size} bytes — the other preview_*.png sit well inside this`);
  assert.ok(existsSync(join(ROOT, 'scripts', 'shot-layer-preview.mjs')), 'and the way to remake it must be committed');
});

test('R268 ⑪ the hovered point reports the precipitation the layer is drawing', () => {
  const s = codeOnly(read('js/map-readout.js'));
  assert.match(s, /window\.IntMapPrecipAnnual/, 'the readout must ask the layer');
  assert.match(s, /P\.valueAt\(lng,lat\)/, '…for the point value');
  assert.match(s, /P\.year&&P\.year\(\)/, '…and say which year it is from');
  /* it must come BEFORE the weather branch, or a weather layer would hide it */
  assert.ok(s.indexOf('IntMapPrecipAnnual') < s.indexOf('const lyr=activeWxLayer()'), 'ordering');
});
}

/* ══════════ from tests/r254-checks.test.mjs — 4 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/layer-packs.js・js/wb-layers.js・js/osm-facilities.js・js/precip-annual.js などはレイヤー群のファクトリで DOM・MapLibre・fetch を前提にし node では組み立てられない（データファイルは読み込んで値を検査している） */
/* ============================================================================
 *  IntMap · #R254 source checks
 * ----------------------------------------------------------------------------
 *  Eleven reports. Each check is written as «the defect cannot come back», not «the fix is still
 *  typed here», wherever the difference is expressible in the source.
 *
 *  ① the population bar has NO UI of its own — no indeterminate class, no sweep, and the
 *     percentage is never blanked; the fraction that makes that possible is real, because every
 *     WorldPop sum is tiled;
 *  ② every country choropleth asks for the 10 m outline, not only the Countries tab;
 *  ③ the World-Bank choropleth family prints a colour scale, generated from its own ramp;
 *  ④ a GIBS layer with no time dimension is not given a date;
 *  ⑤ the trade arrowheads are registered through `scene`, and the country pins are gone, and the
 *     arrows have a switch;
 *  ⑥ the crop raster cannot lose a move that arrives during a fetch, and does not encode a
 *     650 kB data: URL on the main thread, and has no emoji;
 *  ⑦ "Others" is a real category holding the sixty-one World-Bank rows, "Beta" means beta, and the
 *     energy-mix row is promoted;
 *  ⑧ the panel under the pointer is NAMED, so a popup with no z-index of its own can come forward;
 *  ⑨ a fine place name that Nominatim's search cannot surface is asked of OpenStreetMap itself;
 *  ⑩ the data-center layer is its own module, with sources, and nothing invents a number;
 *  ⑪ the new data sources are declared on the Sources page.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught ten rounds writing a check that trips on its own
 *  explanation of the defect, and this round's own notes quote `.tp-prog.indet`, `wp-trade-pt`,
 *  `toDataURL` and `layers.hasImage` in prose.
 * ==========================================================================*/

/* ── ② THE BORDERS EVERY COUNTRY LAYER DRAWS ─────────────────────────────────────────────────── */
test('#R254 ② a country choropleth gets the 10 m outline without the Countries tab', () => {
  const dl = code(read('js/data-layers.js'));
  const w = /function withCountries\(cb\)\{([\s\S]*?)\n    \}/.exec(dl);
  assert.ok(w, 'withCountries is gone — re-derive this check against whatever gates the choropleths now');
  assert.match(w[1], /_imFlushCountryGeo\(true\)/,
    'withCountries does not force the fine geometry — every dl-* choropleth paints the 110 m stand-in');
  /* setSourceData clears feature state, so a LATE flush has to repaint */
  assert.match(dl, /_hiResCountries[\s\S]{0,600}_imReapplyChoros/,
    'a flush that lands after the colours are on does not repaint them — the layer would go blank');

  /* the World-Bank family builds its OWN copy of the borders and must follow the upgrade */
  const lp = code(read('js/layer-packs.js'));
  assert.match(lp, /geoOf\(\)\s*!==\s*usedGeo/,
    'wbToggle does not watch for the 10 m replacement — whichever outline was current at toggle time is kept for the session');
});

/* ── ③ THE LEGEND THAT WAS A BOX WITH NOTHING IN IT ──────────────────────────────────────────── */
test('#R254 ③ the World-Bank choropleths print a colour scale, built from their own ramp', () => {
  const lp = code(read('js/layer-packs.js'));
  assert.match(lp, /function rampKey\(\)/, 'the ramp key is gone — the legend is a title and a slider again');
  /* it must READ W.ramp, not carry a second table of colours */
  const rk = /function rampKey\(\)\{([\s\S]*?)\n      \}/.exec(lp);
  assert.ok(rk, 'rampKey changed shape');
  assert.match(rk[1], /W\.ramp\[i\]/, 'the scale is not derived from the layer ramp — the two can drift apart');
  assert.doesNotMatch(rk[1], /linear-gradient\(90deg,\s*#/, 'the gradient is built from typed colours instead of the layer ramp');
  assert.match(lp, /querySelector\('\.wb-key'\)/, 'the legend does not attach the key');
});

/* ── ④ THE PREVIEW THAT 403'd ────────────────────────────────────────────────────────────────── */
test('#R254 ④ a GIBS layer with no time dimension is not handed a date', () => {
  const lpv = code(read('js/layer-previews.js'));
  assert.match(lpv, /\(date\?\(date\+'\/'\):''\)/, 'the date segment is unconditional again — a static product 403s');
  const row = /'dl-popgrid':G\(([^)]*)\)/.exec(lpv);
  assert.ok(row, 'the population-density preview row is gone');
  assert.doesNotMatch(row[1], /\d{4}-\d{2}-\d{2}/, 'the population-density preview asks for a date again — GPW is static and answers 403');
});

/* ── ⑩ THE DATA-CENTER LAYER ─────────────────────────────────────────────────────────────────── */
test('#R254 ⑩ the data-center layer is its own module, sourced, and invents nothing', () => {
  const dc = read('js/datacenters.js');
  const dcc = code(dc);
  assert.match(dcc, /window\.IntMapDataCenters\s*=/, 'the module does not publish itself');

  /* the curated table: every row carries a source URL, and the count is worth stating */
  const rows = [...dcc.matchAll(/^\s{4}\[-?\d[\d.]*,\s*-?\d[\d.]*,'/gm)];
  assert.ok(rows.length >= 200, `the curated table has ${rows.length} rows; it replaced 73 and the instruction was 爆発的に`);
  const table = /const DC=\[([\s\S]*?)\n  \];/.exec(dcc);
  assert.ok(table, 'the curated table is gone');
  const lines = table[1].split('\n').filter(l => /^\s*\[-?\d/.test(l));
  lines.forEach(l => {
    assert.match(l, /(SRC_[A-Z0-9]+|'https?:\/\/[^']+')\]/, `a curated row has no source: ${l.trim().slice(0, 70)}`);
  });
  /* nothing may be filled in: capacity and year are null where unpublished, never a guess */
  assert.ok(lines.filter(l => /,null,/.test(l)).length > 100,
    'almost every row now carries a capacity — the sources do not publish one for most sites, so this would be invented');

  /* the other half — OpenStreetMap, raced mirrors, ODbL attribution */
  assert.match(dcc, /telecom"="data_center/, 'the OSM half is gone');
  /* the mirror list lives in js/overpass.js alone now (tests/nightly-deep-red-checks.test.mjs counts
     that); what this layer must still do is RACE them, which is the option it hands the one client */
  assert.match(dcc, /IntMapOverpass\(ql,\{race:true/, 'the Overpass mirrors are not raced — one 504 would silence the layer');
  assert.match(dcc, /attribution:'[^']*OpenStreetMap[^']*ODbL/, 'the OSM half is not attributed');

  /* the click opens a real card, and every value is escaped */
  assert.match(dcc, /function openCard\(/, 'there is no detail card');
  assert.match(dcc, /onLayer\('click',PT/, 'the card is not wired to a click');
  assert.doesNotMatch(dcc, /innerHTML=[^;]*\$\{/, 'a template literal reaches innerHTML unescaped');

  /* the row in layer-packs delegates rather than keeping a second table */
  const lp = code(read('js/layer-packs.js'));
  assert.doesNotMatch(lp, /const DC=\[/, 'the old 73-entry table is back in layer-packs.js');
  assert.match(lp, /IntMapDataCenters/, 'the row does not delegate to the module');
  assert.match(lp, /DCM\.key\(\)/, 'the legend key is typed again instead of asked of the layer');

  /* it is loaded — and (#R311) it is loaded ON DEMAND */
  /* ⚠ THE QUESTION IS UNCHANGED AND THE ANSWER MOVED. #R254 asked "is this module reachable and is
     it instantiated?", and answered it with a static import beside its consumer (js/layer-packs.js)
     plus a factory call in js/app-body.js — deliberately in two places, because tests/r168 #8
     budgets the shell and routing both through it put the shell seven lines over.
     #R311 made js/datacenters.js an on-demand module: 66 kB every session downloaded for a row most
     of them never tick. So BOTH halves are now js/lazy-modules.js — the literal `import('./…')` the
     reachability gate reads, and the mount the factory-call gate reads. Asserting the old shape
     would require the file back in the boot bundle; asserting nothing would let the layer silently
     stop existing, which is what this test is for. Hence: the loader fetches it, the loader mounts
     it, and the ROW awaits it before delegating. */
  const loader = code(read('js/lazy-modules.js'));
  assert.equal((String(LAZY_REGISTRY["dataCenters"] && LAZY_REGISTRY["dataCenters"].load).match(/import\('([^']+)'\)/) || [])[1], './datacenters.js',
    'js/datacenters.js is not fetched by the on-demand loader — nothing imports it at all');   /* (#R798) the registry entry */
  assert.match(loader, /window\.IntMapModules\.dataCenters\(IM_HOST\)/, 'the module is never instantiated');
  assert.doesNotMatch(code(read('src/main.js')), /datacenters\.js/, 'the shell imports it again — that is what tripped the line budget');
  assert.doesNotMatch(code(read('js/layer-packs.js')), /^import '\.\/datacenters\.js';/m,
    'the pack imports it statically again — the whole layer is then back in the boot bundle');
  /* every door into the layer, and there are two: the row, and Compare's own map */
  assert.match(lp, /IntMapLazy\.need\('dataCenters'\)[\s\S]{0,80}_dcToggle/,
    'the data-center ROW does not fetch its module before delegating');
  /* ⚠ (#R783) THIS ASSERTION USED TO FIX THE SPELLING OF THE BRANCH («if(key==='dc'){ …»), so the
     day the three if/else arms became a table the bundles declare themselves in, a correct change
     failed a check whose subject is «the dc door fetches its module before delegating»
     (.agents/rules/no-ad-hoc-hardcoding.md §1). The subject is the FETCH, not the shape of the
     control flow: the `dc` entry — however it is written — has to reach IntMapLazy.need. */
  assert.match(lp, /dc:\s*\{[\s\S]{0,400}?IntMapLazy\.need\('dataCenters'\)/,
    "IntMapBeta2.load('dc') does not fetch the module — js/compare.js's second map would draw nothing");
});
}
