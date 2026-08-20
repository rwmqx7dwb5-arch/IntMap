/* ============================================================================
 *  IntMap · #R276 source checks
 * ----------------------------------------------------------------------------
 *  「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。説明もない。」
 *  「Wind(animated)はこんな感じで。色味も同一に合わせて。」
 *  「IntMapの気象レイヤーを抜本改善してください。」（12項目）
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Thirteen
 *  consecutive rounds have had a previous round's test pin a literal and turn a correct change into
 *  a false regression; this round fixed two more of them (tests/r154 #10, tests/r212 ⑬). So: the
 *  forecast axis is checked as «the valid time is in the file name», not as «109 steps»; the palette
 *  as «one table feeds both the tiles and the legend», not as a list of RGB triples.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* comments are prose ABOUT the code and must never satisfy an assertion about the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has paid for thirteen times (#R274). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const WIND = () => codeOnly(read('js/wx-wind.js'));
const WX = () => codeOnly(read('js/weather.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const RO = () => codeOnly(read('js/map-readout.js'));

/* ── ① the forecast hour is in the FILE NAME, because nothing else carries it ──────────────────
   MEASURED before the fix, in the browser, against the shipped SDK:
     normalizeUrl('…latest.json?variable=temperature_2m&time=2026-08-21T00:00Z')
       → '…/2026/08/20/0600Z/2026-08-20T0600.om?variable=temperature_2m'
   `time=` is ignored, and `DATA_RELEVANT_PARAMS` (the SDK's cache key) is ['variable'] — so two
   different hours share one cached state even if the URL differs. Building the .om path here is
   the only thing that makes a forecast hour real. */
test('R276 ① the ECMWF tile URL names the valid time, and no layer hands the SDK a .json', () => {
  const s = EC();
  assert.match(s, /function fileUrl\(i\) \{[\s\S]{0,700}?validTimes\[\(i == null \? idx : i\)\]/,
    'the file is built from the CHOSEN step of valid_times');
  assert.match(s, /p2\(r\.getUTCHours\(\)\) \+ '00Z\/'/, '…under the model run hour…');
  assert.match(s, /'T' \+ p2\(t\.getUTCHours\(\)\) \+ '00\.om'/, '…and named for the valid hour');
  assert.match(s, /function omUrl\(variable, extra, i\) \{[\s\S]{0,200}?'om:\/\/' \+ f/,
    'every om:// URL starts from that file');
  /* the whole point: `latest.json` is metadata for THIS module and is never a tile URL */
  const all = EC() + WX();
  assert.ok(!/om:\/\/[^'"`]*latest\.json/.test(all), 'no om:// URL may contain latest.json');
  assert.ok(!/[&?]time=/.test(WX().replace(/validTime/g, '')), 'and nothing passes the ignored &time=');
});

/* ── ② nothing filters the future out of the axis ─────────────────────────────────────────────
   MEASURED before the fix: the slider offered 8 steps of the 109 the feed publishes, because
   fetchMeta cut valid_times at now + 1 h. */
test('R276 ② every published forecast step is reachable, and the axis is a player', () => {
  const s = EC();
  assert.match(s, /validTimes: j\.valid_times\.slice\(\)/, 'the axis is the feed\'s own list, unfiltered');
  assert.ok(!/valid_times[\s\S]{0,200}?filter\(/.test(s), 'nothing filters valid_times');
  assert.ok(!/Date\.now\(\) \+ 3600e3|now\+3600e3/.test(s), 'and no "up to now" cut survives');
  for (const fn of ['function play\\(\\) \\{', 'function pause\\(\\) \\{', 'function step\\(n\\) \\{', 'function setIndex\\(i, opt\\) \\{'])
    assert.match(s, new RegExp(fn), 'the axis carries ' + fn);
  assert.match(s, /function nowIndex\(\) \{ return nearestTo\(Date\.now\(\)\); \}/, 'and knows where "now" is');
  /* a new model run must not move the reader by the same INDEX — index 6 of 06Z and of 12Z are six
     hours apart. The instant is what is preserved. */
  assert.match(s, /idx = _prevValid \? nearestTo\(tms\(_prevValid\)\) : nowIndex\(\)/,
    'a new run keeps the same wall-clock instant, not the same index');
});

/* ── ③ the colour surface, the particles and the point value are ONE array ────────────────────
   MEASURED before the fix: the animated wind was 2,232 Open-Meteo point requests in five chunks,
   with an 8° / 855-point fallback that usually won. */
test('R276 ③ the wind field is the model\'s own data, sampled directly', () => {
  const w = WX();
  assert.match(w, /const VAR='wind_u_component_10m';/, 'the layer names a MODEL VARIABLE…');
  assert.match(w, /EC\(\)\.load\(VAR\)/, '…loads it once…');
  assert.match(w, /renderer\.setField\(EC\(\)\.sampler\(VAR\)\)/, '…and hands THAT to the particles');
  assert.match(w, /url=EC\(\)\.omUrl\(VAR\)/, 'while the colour raster is the same variable');
  /* the sampler reads the decoded field itself — no lattice, no resample, no point API */
  const s = EC();
  assert.match(s, /uv: function \(lat, lon, out\)/, 'the sampler answers u,v …');
  assert.match(s, /var sp = _lin\(g, d\.values, lat, lon\);/, '…from the field\'s own speed…');
  assert.match(s, /var dir = _near\(g, d\.directions, lat, lon\)/, '…and its own bearing');
  /* ⚠ a bearing is an angle: linear interpolation across the 0/360 seam blows the wind backwards */
  assert.ok(!/_lin\(g, d\.directions/.test(s), 'the bearing must not be linearly interpolated');
});

/* ── ④ one alpha, and the weather is not under the terminator ─────────────────────────────────
   MEASURED before the fix, flat, z3, 150°E 20°N at 23:00 local: the LUT asks for rgb(40,130,180)
   and the pixel was rgb(15,43,64) — 0.36×. Two of the three multipliers were the ones the report
   names; the third was `im-night-shade`, which sat ABOVE the field because `firstSymbolId()`
   returns the first symbol layer in the style and that is a GRATICULE LABEL. */
test('R276 ④ the weather sits above the day/night shading, and one slider is the only multiplier', () => {
  const s = EC();
  assert.match(s, /function before\(\) \{[\s\S]{0,400}?indexOf\('im-night'\) === 0\) last = i;/,
    'the anchor is the layer after the night stack');
  assert.match(s, /function lift\(layerId\) \{[\s\S]{0,500}?layers\.move\(layerId, before\(\)\)/,
    'and it is re-asserted, because js/night-side.js re-adds its own layers on a timer');
  const w = WX();
  assert.match(w, /GE\(\)\.events\.on\('idle',\(\)=>\{ if\(!on\) return; SLOT\.forEach\(s=>\{ try\{ EC\(\)\.lift\(s\.lyr\)/,
    'the wind field re-asserts its place every idle');
  assert.match(w, /activeLayers\(\)\.forEach\(cfg=>\[cfg\.id,cfg\.id\+'-lbl'\]\.forEach\(l=>\{ try\{ EC\(\)\.lift\(l\)/,
    '…and so does every ECMWF raster');
  /* the slider is applied ONCE, and its default is 1 */
  assert.match(DL(), /else if\(id==='wind'\)\{ try\{ window\.Wind&&window\.Wind\.setOpacity&&window\.Wind\.setOpacity\(v\); \}catch\(_\)\{\} \}/,
    'the wind opacity slider passes the reader\'s number through unmultiplied');
  assert.match(DL(), /wind:1,/, 'and its default is fully opaque');
});

/* ── ⑤ the legend is built from the renderer's own table ──────────────────────────────────────
   「凡例がない。説明もない。」 and 「凡例の最大値と実際のLUTも一致させる」: the wind legend said
   40 m/s beside a ramp that runs to 60. A legend that is DERIVED cannot disagree. */
test('R276 ⑤ every ECMWF legend reads the colour scale the tiles were drawn with', () => {
  const s = EC();
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, st && st\.colorScales\)/,
    'the scale comes from the SDK, through the settings the protocol was registered with');
  assert.match(s, /function legend\(variable, dark\) \{[\s\S]{0,900}?stops\.push\(\{ v: bp\[i\]/,
    'the legend is the scale, turned into stops');
  const w = WX();
  assert.match(w, /const lg=EC\(\)\.legend\(cfg\.variable,dark\);/, 'each layer bar reads its own variable');
  assert.match(w, /const ticks=\[0,0\.25,0\.5,0\.75,1\]\.map/, 'with numeric ticks…');
  assert.match(w, /const u=unitOf\(cfg\.kind,lg\.unit\);/, '…and the scale\'s own unit');
  assert.match(w, /\bdesc:LA\(/, 'and every layer carries a description');
  /* the layer's own NAME, not the panel's — 「凡例名がECMWF気象になっている」 */
  assert.match(w, /const name=ecLbl\(cfg\)\.replace\(\/\\s\*\\\(ECMWF\\\)\\s\*\$\/,''\);/,
    'the bar is titled with the layer, not with the panel');
  assert.ok(!/40\*window\.windUnitFactor/.test(DL()), 'the hand-written 40 m/s maximum is gone');
});

/* ── ⑥ the model is named correctly, everywhere ───────────────────────────────────────────────*/
test('R276 ⑥ nothing calls this GFS, and an unspecified model is Best match', () => {
  const all = WX() + DL() + EC();
  assert.ok(!/Open-Meteo GFS/.test(all), 'the "Open-Meteo GFS" label is gone');
  assert.ok(!/GFS/.test(EC() + WIND()), 'and the model modules do not mention GFS at all');
  assert.match(EC(), /MODEL: 'ECMWF IFS HRES'/, 'the model names itself');
  assert.match(WX(), /'Open-Meteo · '\+\(\(!m\|\|m==='best_match'\)\?'Best match':m\)/,
    'an unspecified Open-Meteo model is reported as Best match');
  assert.match(codeOnly(read('js/wx-source.js')), /if \(!j\.model\) j\.model = 'best_match';/,
    'and the client stamps which model answered');
});

/* ── ⑦ layers are declared against the variables the feed really publishes ────────────────────
   MEASURED: `latest.json`'s variables list (35 names) has no sea_surface_temperature, so ec-sst
   asked the reader for a child that does not exist and drew nothing for nine rounds. */
test('R276 ⑦ a variable the feed does not publish cannot leave a dead row behind', () => {
  const w = WX();
  assert.ok(!/sea_surface_temperature/.test(w), 'the layer that asked for a missing variable is gone');
  assert.match(w, /\{id:'ec-gust',\s*variable:'wind_gusts_10m'/, 'and its row went to one that exists');
  assert.match(w, /function pruneMissing\(\)\{[\s\S]{0,400}?if\(E\.has\(l\.variable\)\) return;/,
    'rows are checked against the live variable list…');
  assert.match(w, /const row=document\.getElementById\('lyrrow-'\+l\.id\); if\(row\) row\.remove\(\);/,
    '…and a variable that disappears upstream takes its row with it');
});

/* ── ⑧ one time control per view, and no duplicate ids ────────────────────────────────────────
   MEASURED before the fix: opening the ECMWF panel put a SECOND #ec-time and #ec-validtime in the
   document (2 and 2). */
test('R276 ⑧ the two forecast players are two views of one state, with different ids', () => {
  const w = WX();
  const ids = (w.match(/id="(ec-time|ec-validtime|wind-time|wind-validtime)"/g) || []).sort();
  assert.deepEqual(ids, ['id="ec-time"', 'id="ec-validtime"', 'id="wind-time"', 'id="wind-validtime"'],
    'each control id is declared exactly once');
  assert.ok(!/function buildPanel\(\)|panel\.className='tool-panel'/.test(w),
    'the second ECMWF panel — the one that duplicated them — is gone');
  assert.match(w, /return \{ open\(\)\{ const el=ensureLegend\(\); el\.style\.display='block'; renderLegend\(\); \}/,
    'open() shows the one legend instead of building a rival');
  /* both players drive the SAME module */
  assert.match(w, /if\(sl\) sl\.oninput=\(\)=>\{ E\.pause\(\); E\.setIndex\(\+sl\.value\); \};/, 'the wind player…');
  assert.match(w, /if\(sl\)\{ sl\.oninput=\(\)=>\{ E\.pause\(\); E\.setIndex\(\+sl\.value\); \}; \}/, '…and the ECMWF one');
});

/* ── ⑨ the number under the cursor belongs to the picture under the cursor ────────────────────
   MEASURED before the fix: with the NASA `temp` layer on (MERRA-2 monthly mean, for a date the
   reader chooses) the readout fetched api.open-meteo.com's CURRENT temperature and printed that. */
test('R276 ⑨ the readout answers from the displayed layer, or says which dataset it cannot answer for', () => {
  const s = RO();
  assert.match(s, /const v=EC\.valueNow\(cfg\.variable,lat,lng\);/,
    'an ECMWF raster answers from its own decoded field');
  assert.match(s, /\{ const ec=ecmwfReadout\(lng,lat\); if\(ec\)\{ HOST\.lastLayerVal=ec; return; \} \}/,
    '…and it is asked first');
  assert.match(s, /out\+' · '\+EC\.fmt\(EC\.validTime\(\)/, 'the valid time travels with the number');
  /* the prohibition, checked as an absence */
  assert.ok(!/api\.open-meteo\.com\/v1\/forecast/.test(s), 'the readout opens no live weather request at all');
  assert.ok(!/marine-api\.open-meteo\.com/.test(s), '…including the marine one');
  /* the elevation lookup it DOES make is a different question, and it goes through the guard */
  assert.match(s, /window\.IntMapWx\.guardedJSON\(`https:\/\/api\.open-meteo\.com\/v1\/elevation/,
    'the elevation reading is guarded, cached and de-duplicated like everything else');
  assert.match(s, /const name=_GIBS_WHEN\[lyr\]\?_GIBS_WHEN\[lyr\]\(\):lyr;/,
    'a GIBS raster names its dataset…');
  assert.match(s, /HOST\.lastLayerVal=name\+\(when\?\(' · '\+when\):''\);/, '…and the date it is showing');
});

/* ── ⑩ the radar is a loop and the dead half of RainViewer is gone ────────────────────────────
   MEASURED live: radar.past = 13 frames (10 min apart, two hours); satellite.infrared = 0 frames;
   colour schemes 0/2/3/6/7/8 and 1/4/5/9 return byte-identical tiles. */
test('R276 ⑩ RainViewer animates its past frames, and its retired satellite product is not used', () => {
  const s = DL();
  assert.match(s, /_rvFrames=\(r\.past\|\|\[\]\)\.concat\(r\.nowcast\|\|\[\]\)/, 'every available frame is a frame');
  assert.ok(!/satellite&&_rvData\.satellite\.infrared|satellite\.infrared/.test(s),
    'nothing reads the retired satellite.infrared');
  assert.match(s, /window\._rvPlayer=\{ show:rvShow, step:rvStep, play:rvSetPlay/, 'the loop has a player');
  assert.match(s, /const mins=Math\.round\(\(Date\.now\(\)-tt\)\/60000\);/, 'the frame states its age…');
  assert.match(s, /cap\.textContent=clock\+' · '\+rel\+' · '\+\(_rvIdx\+1\)\+'\/'\+n;/, '…its clock and its place in the loop');
  /* stepping re-points the tiles instead of rebuilding the source, so a step cross-fades */
  assert.match(s, /GE\(\)\.layers\.setSourceTiles\('src-radar',tiles\)/, 'a step re-points the source');
  /* the scheme number is named for what the free tier actually returns */
  assert.match(s, /const RV_SCHEME=4;/, 'the palette is a named constant, not a magic number in a URL');
  /* …and the clouds layer is on a source that still exists, WITH a row to switch it on */
  assert.match(s, /const IR_SATS=\[\['clouds','Himawari_AHI_Band13_Clean_Infrared'\]/, 'clouds are GIBS clean-IR');
  assert.match(s, /\['clouds','lyrClouds'\]/, 'and the layer finally has a row in the panel');
  assert.match(s, /function cloudsLegendHint\(\)/, 'whose legend states the sector it does not cover');
});

/* ── ⑪ nothing bypasses the one guarded weather client ────────────────────────────────────────*/
test('R276 ⑪ every Open-Meteo request goes through IntMapWx', () => {
  const files = ['js/weather.js', 'js/wx-ecmwf.js', 'js/wx-wind.js', 'js/map-ui.js', 'js/map-readout.js',
    'js/app-body.js', 'js/widgets.js', 'js/layer-previews.js', 'js/sims.js', 'js/flight-sim.js',
    'js/world-packs.js', 'js/search-geocode.js', 'js/drone-ops.js', 'js/atlas-console.js'];
  const bad = [];
  for (const f of files) {
    const s = codeOnly(read(f));
    /* a raw fetch of an Open-Meteo DATA host (geocoding is a different product and a different
       quota, and its call sites carry an AbortController the guarded client does not model) */
    const re = /fetch\(\s*[`'"]https:\/\/(api|marine-api|air-quality-api|archive-api)\.open-meteo\.com/g;
    if (re.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'these files still fetch Open-Meteo directly');
  assert.match(codeOnly(read('js/wx-source.js')), /isOpenMeteo: isOpenMeteo,/,
    'the guard publishes the host test so callers can route by it');
  for (const f of ['js/sims.js', 'js/atlas-console.js'])
    assert.match(codeOnly(read(f)), /window\.IntMapWx\.isOpenMeteo\(url\)\) return await window\.IntMapWx\.guardedJSON\(url,\d+\)/,
      f + ' routes its shared loader through the guard');
});

/* ── ⑫ the share link carries the hour and the opacities ──────────────────────────────────────*/
test('R276 ⑫ a shared weather view reproduces the same hour, not the same index', () => {
  const w = WX();
  assert.match(w, /window\.IntMapShareState\.register\('weatherEC',io\)/, 'the weather registers its state');
  assert.match(w, /const vt=EC\(\)\.validTime\(\); if\(vt&&EC\(\)\.index\(\)!==EC\(\)\.nowIndex\(\)\) o\.t=vt;/,
    'the valid time travels as an INSTANT, and only when it is not simply "now"');
  assert.match(w, /if\(v\.t\)\{ const ms=Date\.parse\([\s\S]{0,80}?EC\(\)\.setIndex\(EC\(\)\.nearestTo\(ms\)\)/,
    'and is restored to the nearest step of whatever run the reader has');
  assert.match(w, /LAYERS\.forEach\(l=>\{ if\(state\[l\.id\]\.on&&state\[l\.id\]\.op!==l\.op\) ops\[l\.id\]=/,
    'a changed opacity travels too');
});

/* ── ⑬ the particle renderer counts in SECONDS ────────────────────────────────────────────────
   The old loop counted in frames: p.age++, dt = 0.05·mPerPx, fillRect(α=0.08). On a 144 Hz screen
   the wind blew 2.4× faster and the streaks were 2.4× shorter than on a 60 Hz one. */
test('R276 ⑬ movement, lifetime and trail are all real elapsed time, and the draw is batched', () => {
  const s = WIND();
  assert.match(s, /var dt = last \? Math\.min\(DT_MAX, Math\.max\(0, \(nowMs - last\) \/ 1000\)\) : 1 \/ 60;/,
    'dt is the measured interval in seconds');
  assert.match(s, /var metres = GAIN \* dt \* mPerPx;/, 'displacement is per second');
  assert.match(s, /p\.age \+= dt;/, 'age is in seconds');
  assert.match(s, /var keep = moving \? 0 : Math\.exp\(-dt \/ TRAIL_TAU\);/, 'the trail decays on a time constant');
  assert.ok(!/p\.age\+\+/.test(s), 'nothing counts frames any more');
  /* ONE draw call for every segment, and a real width (gl.lineWidth is clamped to 1 everywhere) */
  const draws = (s.match(/gl\.drawArrays\(gl\.TRIANGLES, 0, vcount\)/g) || []).length;
  assert.equal(draws, 1, 'the whole field is one drawArrays');
  assert.ok(!/gl\.lineWidth/.test(s), 'and width comes from geometry, not from the clamped lineWidth');
  assert.match(s, /function draw2D\(dt, moving\)/, 'a browser without WebGL still gets a picture…');
  assert.match(s, /for \(var b = 0; b < BUCKETS; b\+\+\)/, '…drawn in a handful of batched strokes');
  /* the budget follows the measured cost rather than a guess about the machine */
  assert.match(s, /function govern\(\) \{[\s\S]{0,300}?if \(frameMs > 9/, 'the particle count follows the frame time');
});

/* ── ⑭ the palette is ONE table, and it is the one the reader asked for ───────────────────────*/
test('R276 ⑭ the wind palette feeds the tiles and the legend from the same declaration', () => {
  const s = EC();
  assert.match(s, /var WINDY_WIND = \{[\s\S]{0,120}?unit: 'm\/s'/, 'the palette is declared once');
  assert.match(s, /Object\.assign\(\{\}, sdk\.COLOR_SCALES_WITH_ALIASES \|\| base\.colorScales, \{ wind: WINDY_WIND \}\)/,
    'and replaces the SDK\'s wind family in the protocol settings');
  assert.match(s, /sdk\.omProtocol\(params, ctl, st\)/, 'the tiles are rendered with those settings…');
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, st && st\.colorScales\)/, '…and the legend reads them');
  /* opaque: the reader's reference picture has no holes where the air is still */
  const raw = read('js/wx-ecmwf.js');
  const block = /breakpoints: \[([^\]]*)\][\s\S]*?colors: \[([\s\S]*?)\n    \]/.exec(raw);
  assert.ok(block, 'the palette is readable as data');
  const alphas = (block[2].match(/,\s*([0-9.]+)\]/g) || []).map((x) => parseFloat(x.replace(/[,\s\]]/g, '')));
  assert.ok(alphas.length >= 12, 'every stop declares an alpha');
  assert.deepEqual([...new Set(alphas)], [1], 'and every one of them is opaque');
});

/* ── ⑮ the point-weather panel says what the numbers are and when they are for ────────────────*/
test('R276 ⑮ the popup shows gusts, MSL pressure, the data\'s own valid time, and a refresh that refreshes', () => {
  const w = WX();
  assert.match(w, /L\('Gusts','突風'/, 'gusts are shown');
  assert.match(w, /L\('Pressure \(MSL\)','海面気圧'/, 'and the sea-level pressure…');
  assert.match(w, /const mslp=\(c\.pressure_msl!=null\)\?c\.pressure_msl:\(c\.surface_pressure!=null\?c\.surface_pressure:null\);/,
    '…from the field that means sea level, falling back only when it is absent');
  assert.match(w, /const upd=c\.time\?fmtInstant\(c\.time\):'—';/, 'the time shown is the DATA\'s time');
  assert.ok(!/const upd=new Date\(\)\.toLocaleTimeString/.test(w), 'not the browser\'s clock');
  assert.match(w, /rf\.onclick=\(\)=>open\(_lastLL\|\|lngLat,\{fresh:true\}\)/, 'the refresh button asks for fresh…');
  assert.match(w, /ttl:\(opt&&opt\.fresh\)\?0:300000/, '…and that reaches the client as a zero TTL');
  assert.match(codeOnly(read('js/wx-source.js')), /return metNo\(\+lat, \+lng, ttl\)/,
    'which reaches BOTH ladders, or the button still returns the cached answer');
  /* the map's own unit choice, not a private one */
  assert.match(w, /if\(window\.fmtWindSpeed\) return window\.fmtWindSpeed\(kmh\/3\.6\);/, 'wind follows the map\'s unit');
});
