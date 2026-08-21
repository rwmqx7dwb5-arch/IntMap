/* ============================================================================
 *  IntMap · #R297 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins something that was MEASURED on production before a line was written,
 *  and pins the RELATION rather than the number (#R199/#R203):
 *
 *    · 「警報レイヤーが重すぎる」 — with a control, on the deployed build, 60 s at z4 over Europe:
 *        nothing on   TBT 19.5 s · 36.5 fps
 *        warnings on  TBT 49.0 s · **3.4 fps**
 *        wind on      TBT 21.3 s · 17.7 fps
 *      and 62 whole-collection uploads in 78 s, up to 3,792 polygons each, 9,942 feature-state
 *      writes. ⚠ THE FIRST FOUR FIXES DID NOT MOVE THOSE NUMBERS, and that was the clue: the
 *      uploads were not coming through the publisher at all. MapLibre fires `styledata` for every
 *      style mutation — `setSourceData` included — and this file's basemap-swap recovery listened
 *      to it and re-uploaded unconditionally, so a publish fired the recovery, which re-uploaded,
 *      which fired the recovery. A publish did not settle; it oscillated (⑬). The other four are
 *      real work removed and are tested too: the agency's whole bulletin list was a STRING PROPERTY
 *      on every feature (①); every MeteoAlarm batch rebuilt all thirty-five countries (②); the
 *      upload was coalesced at 160 ms, which merges nothing (③); the abbreviation label layer ran
 *      symbol collision over four thousand features at a zoom where none could be read (④); and
 *      `countryAt` walked every ring of every hi-res country outline, 5,562 ms per 50 s.
 *    · 「風レイヤーが重すぎる」 — 14.5 s to the first particle at the opening view, 74.9 s zoomed in.
 *      `bandFor` returns null past 120° of latitude and the opening view is the globe, so the layer
 *      read the whole planet (13,199,360 samples, ~18 MB) before anything moved. Measured A/B: a
 *      global read is bandwidth-bound, so #R288's prefetch has nothing to collapse.
 *    · 「変えてから読み込まれるまでいったん地図が何もなくなる」 — `isSourceLoaded` is true for a raster
 *      source that has not been asked for a tile yet, so the new slot was uncovered and the old one
 *      removed while the new one had nothing to draw. #R290's rule, one source along.
 *    · 「風レイヤーのカラー凡例は、30m/sまでにして」 — the ramp runs to 104 m/s (Windy's own clamp).
 *    · 「データのある時間のみを選べる、離散的な感じに」 — every ECMWF clock steps over the model's own
 *      index already (#R290/#R293); the TIDE clock was a minute-resolution `datetime-local` over an
 *      HOURLY model, with a 6 h 12 m step that lands on :12.
 *    · 「塗漏れ、塗りすぎが多すぎる」 — measured: EVERY MeteoAlarm area carries an EMMA_ID and NOT ONE
 *      carries a polygon (ten countries, 850 areas), so those thirty-five countries are placed by
 *      NAME. Spain 99/153, Croatia 6/13, Finland 4/9 … The index that names their zones is the one
 *      the same service files with the WMO, and it started empty on every visit.
 *    · 「境界線解像度が低すぎる」 — Europe's regions were placed against Eurostat NUTS **20M**.
 *    · 「平面地図は自由スクロールに一本化」 — see tests/r223 ③, which now guards the removal.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* ── ① the agency's rows do not travel in the collection the map re-tiles ─────────────────────── */
test('R297 ① the warning rows are a side table, not a property of every feature', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/items:JSON\.stringify/.test(s), 'no bulletin list is serialised into a feature');
  assert.match(s, /const ROWS=Object\.create\(null\)/, 'the rows live beside the collection');
  assert.match(s, /const rowsOf=\(pr\)=>/, 'and one accessor reads them');
  assert.match(s, /ROWS\[rid\]=\(rows\|\|\[\]\)\.slice\(0,400\)/, 'the same cap as before, kept');
  /* every reader goes through the accessor — a JSON.parse of a feature property means one was missed */
  assert.ok(!/JSON\.parse\((?:pr|p|f\.properties)\.items/.test(s), 'nothing parses the old property');
  const uses = (s.match(/rowsOf\(/g) || []).length;
  assert.ok(uses >= 3, 'the tap card, the country key and the hot list all read through it, got ' + uses);
});

/* ── ② one country's batch rebuilds one country ───────────────────────────────────────────────── */
test('R297 ② maFeatures and swicFeatures are per-country, under a key that names every input', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const _maFeat=Object\.create\(null\)/);
  assert.match(s, /const _swFeat=Object\.create\(null\)/);
  /* the key has to move when the DATA moves, when an INDEX arrives, and when the LANGUAGE changes —
     miss one and a late boundary set is ignored for ever */
  const ma = /const fkey=mkey\+'\\u0000'\+\(maAt\[iso\]\|\|0\)\+'\\u0000'\+_lang;/;
  assert.ok(ma.test(s), 'the MeteoAlarm key names the index set, the read time and the language');
  assert.match(s, /const fkey=\(swicAt\[iso\]\|\|0\)\+'\\u0000'\+\(SHAPELIB\[iso\]\|\|0\)\+'\\u0000'\+\(WORLD\?1:0\)\+'\\u0000'\+_lang;/);
  /* and the memo is USED, not merely written */
  assert.match(s, /if\(done&&done\.k===fkey\)\{ done\.f\.forEach/);
});

/* ── ③ the collection is uploaded once per burst, and the country sheet shares the window ─────── */
test('R297 ③ publish and paintCountries are throttled to one window, and force still runs at once', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const PUBLISH_MS=\d+;/);
  const ms = +(/const PUBLISH_MS=(\d+);/.exec(s) || [])[1];
  assert.ok(ms >= 400, 'a window shorter than a few hundred ms merges nothing — it was 160 ms');
  assert.match(s, /const wait=Math\.max\(60,PUBLISH_MS-\(Date\.now\(\)-pubLast\)\);/);
  assert.match(s, /pubT=0; pubLast=Date\.now\(\);/, 'the throttle is measured from the last upload');
  assert.match(s, /if\(!force\)\{ if\(paintT\) return; paintT=setTimeout\([^\n]*PUBLISH_MS\);/,
    'the country sheet uses the same window');
  assert.match(s, /clearTimeout\(paintT\); paintT=0; _paintCountriesNow\(true\);/,
    'a forced repaint is not delayed');
});

/* ── ④ the abbreviation layer has a floor ─────────────────────────────────────────────────────── */
test('R297 ④ the hazard abbreviation is not collision-tested at a zoom nobody can read it', () => {
  const s = read('js/world-packs.js');
  const m = /id:'wp-alert-lbls',type:'symbol',source:SRC,\s*\n?\s*filter:\['>',\['get','norm'\],0\], minzoom:([\d.]+), maxzoom:5,/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(m, 'the abbreviation layer declares a minzoom');
  assert.ok(+m[1] > 0 && +m[1] < 5, 'and it is below the zoom where the full name takes over');
});

/* ── ⑤ the wind reads what is on screen first ─────────────────────────────────────────────────── */
test('R297 ⑤ the wind starts on the band around the view and widens behind it', () => {
  const s = read('js/weather.js');
  assert.match(s, /function nearBand\(\)/, 'the narrow band exists');
  assert.match(s, /EC\(\)\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/);
  assert.match(s, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),b\)\) b=nearBand\(\)\|\|b;/,
    'a frame that already covers the view is not narrowed');
  assert.match(s, /function widen\(\)/, 'and the wide read follows');
  assert.match(s, /setTimeout\(widen,0\);/, 'it is started as soon as the first frame is in hand');
  /* the wide read must not be skipped, or the top and bottom of the screen never get a field */
  assert.match(s, /EC\(\)\.load\(VAR,null,want\)\.then\(f=>\{ widening=false;/);
});

/* ── ⑥ a slot is uncovered only when it has painted ───────────────────────────────────────────── */
test('R297 ⑥ the new hour is revealed on a TILE, not on an empty source calling itself loaded', () => {
  const s = read('js/weather.js');
  assert.match(s, /const h=\(e\)=>\{ if\(e&&e\.sourceId===sid&&e\.tile&&e\.isSourceLoaded\) fin\(\); \};/,
    'a tile has to have landed');
  /* and the fallback is still there — an off-screen source never gets a tile event */
  assert.match(s, /setTimeout\(fin,maxMs\|\|12000\);/);
});

/* ── ⑦ the wind key reads to 30 m/s, and says that the ramp continues ─────────────────────────── */
test('R297 ⑦ the wind legend is capped at 30 m/s and the top tick carries a +', () => {
  const e = read('js/wx-ecmwf.js');
  assert.match(e, /var LEGEND_MAX = \{ wind: 30 \};/);
  assert.match(e, /function legendMax\(variable\)/);
  assert.match(e, /if \(cap != null && cap > min && cap < max\) max = cap;/);
  assert.match(e, /if \(bp\[i\] > max\) break;/, 'the stops stop where the key stops');
  assert.match(e, /capped: \(cap != null/, 'and the caller is told the ramp continues');
  /* the colour table itself is untouched — #R293 fitted it to Windy's own RGBA() */
  assert.match(e, /breakpoints: \[0, 1\.1, 3, 5, 7, 9, 10, 10\.5, 11, 13, 15, 17, 19, 19\.7, 21, 24, 25\.3, 27, 29,/,
    'the 27 measured stops are unchanged');
  const w = read('js/weather.js');
  const plus = (w.match(/lg\.capped\)\?'\+':''/g) || []).length;
  assert.ok(plus >= 2, 'both the wind box and the ECMWF boxes mark it, got ' + plus);
});

/* ── ⑧ every weather clock lands on a published instant ───────────────────────────────────────── */
test('R297 ⑧ the tide clock steps over the marine model’s own hours', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const TIDE_STEP_MS=3600e3;/);
  assert.match(s, /const snapHour=\(ms\)=>Math\.round\(ms\/TIDE_STEP_MS\)\*TIDE_STEP_MS;/);
  assert.match(s, /function setWhen\(ms\)\{ try\{ window\.IntMapTime\.set\(new Date\(snapHour\(ms\)\)/,
    'nothing reaches the clock unsnapped');
  assert.match(s, /type="datetime-local" step="3600"/, 'and the field cannot offer a minute');
  assert.ok(!/data-d="-?6\.2"/.test(s), 'the 6 h 12 m step, which lands on :12, is gone');
  /* the ECMWF clocks were already discrete — this is the rule they set (#R293) */
  const w = read('js/weather.js');
  assert.match(w, /class="ecl-timerange" id="'\+id\+'-r" min="0" max="'\+Math\.max\(0,n-1\)\+'" step="1"/);
});

/* ── ⑨ a tap opens the country's own key ──────────────────────────────────────────────────────── */
test('R297 ⑨ clicking a country opens that country’s key, and a publish cannot overwrite it', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function countryPanel\(iso\)\{/);
  assert.match(s, /openPointCard\(lng,lat,c\);[\s\S]{0,200}if\(c\) countryPanel\(c\);/);
  assert.match(s, /function showPanel\(\)\{ if\(!on\) return; if\(panelISO\) countryPanel\(panelISO\); else overview\(\); \}/);
  /* nothing may refresh the panel by calling overview() directly any more, or the country view
     would be replaced by the worldwide list on the next batch that lands */
  /* no DATA path may refresh the panel with overview() — the one place left is the tap card's own
     close button, which is deliberately taking the reader back to the worldwide view */
  const direct = (s.replace(/\r\n/g, '\n').match(/panel\.shown\(\)\) overview\(\)/g) || []).length;
  assert.equal(direct, 1, 'only closeTap() goes back to the worldwide view directly');
  assert.match(s, /const closeTap=\(\)=>\{ closePointCard\(\); if\(panelISO&&on\)\{ panelISO='';/,
    'closing the card returns the panel to the worldwide view');
});

/* ── ⑩ the shape library survives the session ─────────────────────────────────────────────────── */
test('R297 ⑩ the WMO shape library is cached, merged and applied before anything is asked for', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /const SWIC_GEO_CACHE='intmap-swicgeo-v1';/);
  assert.match(s, /async function swicGeoCached\(mid\)/);
  assert.match(s, /async function swicGeoStore\(mid,areas\)/);
  assert.match(s, /function warmSwicGeo\(iso\)/);
  assert.match(s, /Object\.keys\(MA\)\.forEach\(c=>\{ if\(swicMeta\.mid\[c\]\) warmSwicGeo\(c\); \}\);/,
    'the member table is the first moment the cache can be read');
  /* it must MERGE, never replace — the register only holds what is in force right now (#R284) */
  assert.match(s, /\(old\|\|\[\]\)\.concat\(d\.areas\|\|\[\]\)/, 'a stored library is merged, not overwritten');
  /* and only geometry is stored — never what is in force */
  assert.match(s, /keep\.push\(\{name:a\.name,geom:a\.geom\}\)/, 'name and shape, nothing else');
  /* a WMO member that could not place its own area builds a library too */
  assert.match(s, /if\(!a\.geom\)\{ anyMissed=true; missed=true; askSwicGeo\(iso\);/);
});

/* ── ⑪ Europe is not placed against a 1:20 million outline ────────────────────────────────────── */
test('R297 ⑪ Europe gets a finer boundary set when the reader is close enough to see it', () => {
  const s = read('js/world-packs.js');
  /* the floor stays coarse — it is what the whole of Europe is drawn from, and a finer floor makes
     every polygon in the ONE collection this layer re-tiles heavier for a picture nobody can tell
     apart. What a reader who has zoomed in gets is the FINE tier. Pin the relation, not a number. */
  const floor = /NUTS_RG_(\d+)M_\d+_4326_LEVL_3\.geojson'\)\]/.exec(s.replace(/\r\n/g, '\n'));
  assert.ok(floor, 'the floor is one generalisation, named once');
  assert.match(s, /NUTS_RG_03M_2021_4326_LEVL_3\.geojson/, 'and the finer tier exists');
  assert.ok(+floor[1] > 3, 'the fine tier really is finer than the floor');
  assert.match(s, /function askNutsFine\(\)/);
  assert.match(s, /askNutsFine\(\);/, 'the zoom that upgrades the units asks for it too');
  /* the memo has to notice — a finer index that arrives and is ignored is worse than none */
  assert.match(s, /\(idx\?\(nutsFineOn\?'N':'n'\):'-'\)/, 'mkey names the fine index');
  assert.match(s, /return maFeatures\(\)\.then\(\(\)=>\{ if\(on\) publish\(\); \}\);/);
});

/* ── ⑬ a data change is not a basemap swap ───────────────────────────────────────────────────── */
test('R297 ⑬ the style-swap recovery runs on a swap, not on every mutation it makes itself', () => {
  const s = read('js/world-packs.js').replace(/\r\n/g, '\n');
  /* MapLibre fires `styledata` for setSourceData too, so an unconditional re-upload in this
     handler re-fires itself. The dispatcher coalesces… */
  assert.match(s, /let _reT=0;/);
  assert.match(s, /GE\(\)\.events\.on\('styledata',\(\)=>\{ if\(_reT\) return;/,
    'a burst of mutations is one pass');
  /* …and the pack that owns four thousand polygons only recovers when it really was dropped.
     `ensureLayers()` clears the signature when it builds a fresh source (#R290), so that is the
     signal — not a flag somebody has to remember to set. */
  assert.match(s, /const fresh=\(featsSig===''\);/);
  assert.match(s, /if\(fresh\)\{ featsSig=featSig\(feats\); GE\(\)\.layers\.setSourceData\(SRC,/);
  assert.match(s, /publishQuiet\(fresh\); paintCountries\(fresh\);/,
    'and the forced quiet upload and the forced 258-country repaint go with it');
  /* the recovery must still EXIST — #R72 recorded what happens when nothing puts the layers back */
  assert.match(s, /onRestyle\(\(\)=>\{ if\(!on\) return; whenDrawable\(\(\)=>\{\n\s*if\(!ensureLayers\(\)\) return;/);
});

/* ── ⑫ the coverage numbers are printed rather than claimed ───────────────────────────────────── */
test('R297 ⑫ the shape libraries this browser holds are counted, not assumed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /shapeLib:Object\.assign\(\{\},SHAPELIB\)/);
  assert.match(s, /shapeLibTotal:Object\.keys\(SHAPELIB\)\.reduce/);
});
