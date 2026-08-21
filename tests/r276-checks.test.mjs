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
  /* ⚠ (#R288) …and it names the LATITUDE BAND it is drawn in. Same variable, same model, same
     samples; what the third argument removes is the part of the planet that is not on the screen
     (measured: 6,599,680 samples / 17.96 MB global against 935,400 / 1.64 MB for a 21° band). */
  assert.match(w, /EC\(\)\.load\(VAR,null,band\(\)\)/, '…loads it once, for the band in view…');
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
  /* (#R284) the ids are a layer's CURRENT slot now (two slots per layer, so a forecast step never
     shows an empty map) — `curIds(cfg)` is the same set of layers, named through the swap. */
  assert.match(w, /activeLayers\(\)\.forEach\(cfg=>curIds\(cfg\)\.forEach\(l=>\{ try\{ EC\(\)\.lift\(l\)/,
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
  /* the layer's own NAME, not the panel's — 「凡例名がECMWF気象になっている」
     ⚠ (#R284) …and the name is now the BOX's `<h4>`, because the panel that carried the family name
     is gone: every ECMWF layer has its own legend box. Titling a bar inside a shared box was the
     half-answer; this is the whole one. */
  assert.match(w, /function renderOne\(cfg\)\{[\s\S]{0,400}?<h4>'\+ecLbl\(cfg\)\+'<\/h4>/,
    'the legend is titled with the layer, not with the panel');
  assert.ok(!/data-legend-ecmwf/.test(w), 'and there is no one box holding all of them');
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
  /* ⚠ (#R290) THE IDS ARE BUILT, NOT WRITTEN. Every weather legend has its own discrete time
     control again (「個別の時間選択UIを使え」), and the ECMWF ones are named after their layer —
     `ec-time-ec-temp`, `ec-time-ec-cape`, … — so counting literal ids cannot be the instrument any
     more. The PROPERTY it protects is stated directly instead: there is exactly ONE builder for
     that control and exactly one wirer, so two views of one clock cannot become two clocks. */
  const ids = (w.match(/id="(ec-time|ec-validtime|wind-time|wind-validtime)"/g) || []).sort();
  assert.deepEqual(ids, ['id="wind-validtime"'], 'no control id is written twice as a literal');
  assert.equal((w.match(/function _timeUI\(/g) || []).length, 1, 'ONE builder for the time control');
  assert.equal((w.match(/function _wireTimeUI\(/g) || []).length, 1, 'ONE wirer for it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend uses it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(\),L\)/,
    'and so does every ECMWF legend, under its own layer id');
  assert.match(w, /<select class="ecl-timesel"/,
    'and it is a <select>, so only a time the model publishes can be chosen');
  assert.ok(!/function buildPanel\(\)|panel\.className='tool-panel'/.test(w),
    'the second ECMWF panel — the one that duplicated them — is gone');
  assert.match(w, /return \{ open\(\)\{ if\(!anyOn\(\)\) return; activeLayers\(\)\.forEach\(l=>\{ boxFor\(l\)\.style\.display='block'; \}\); renderLegend\(\); \}/,
    'open() shows the one legend instead of building a rival');
  /* both players drive the SAME module */
  assert.match(w, /if\(sel\) sel\.onchange=\(\)=>\{ E\.pause\(\); E\.setIndex\(\+sel\.value,\{now:true\}\); \};/,
    'the one control writes the axis…');
  /* …and the other view is the time machine's forecast tab, which writes to the same axis */
  assert.match(codeOnly(read('js/news-timeline.js')),
    /if\(mode==='forecast'\)\{ const E=EC\(\); if\(E\)\{ E\.pause\(\); E\.setIndex\(\+slider\.value\); \}/, '…and the shared one');
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
  /* ⚠ (#R289) THE THREE CLOUD ASSERTIONS ARE GONE BECAUSE THE LAYER IS — 「雲・赤外（実時間）」 was
     deleted by name this round, so IR_SATS, the row and cloudsLegendHint no longer exist and a check
     for them would call a requested deletion a regression. What #R276 was really measuring here — the
     RainViewer player above — is untouched, and js/data-layers.js must now name none of it. */
  assert.ok(!/IR_SATS|cloudsLegendHint|setCloudsVis|_setCloudsOpacity/.test(s), 'the deleted IR-clouds layer left something behind');
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
  /* (#R290) …with hysteresis. The thresholds were 9 ms / 4.5 ms decided every 30 frames, so a
     machine sitting near either of them cut 18 % of its particles and put 12 % back for ever — a
     density that pulses twice a second, which is 「点滅」 from the other side. */
  assert.match(s, /function govern\(\) \{[\s\S]{0,300}?frameMs > 11/, 'the particle count follows the frame time');
  assert.match(s, /want !== _verdict\) \{ _verdict = want; return; \}/, 'and it never acts on one noisy window');
});

/* ── ⑭ the palette is ONE table, and it is the one the reader asked for ───────────────────────*/
test('R276 ⑭ the wind palette feeds the tiles and the legend from the same declaration', () => {
  const s = EC();
  /* ⚠ (#R284) the anchors are declared once and RESAMPLED, because the SDK's colour tables do not
     interpolate — a 17-entry table paints 17 flat bands. The declaration is still one. */
  assert.match(s, /var WIND_ANCHORS = \{[\s\S]{0,120}?unit: 'm\/s'/, 'the palette is declared once');
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, [0-9.]+\);/, '…and the table is built from it');
  /* ⚠ (#R288) …beside the temperature family, which got the same treatment. ONE object, so the
     tiles and every legend still read one declaration. */
  assert.match(s, /Object\.assign\(\{\}, sdk\.COLOR_SCALES_WITH_ALIASES \|\| base\.colorScales,\s*\{ wind: WINDY_WIND, temperature: WINDY_TEMP \}\)/,
    'and replaces the SDK\'s wind family in the protocol settings');
  assert.match(s, /sdk\.omProtocol\(params, ctl, st\)/, 'the tiles are rendered with those settings…');
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, st && st\.colorScales\)/, '…and the legend reads them');
  /* opaque: the reader's reference picture has no holes where the air is still */
  const raw = read('js/wx-ecmwf.js');
  const block = /breakpoints: \[([^\]]*)\][\s\S]*?colors: \[([\s\S]*?)\n    \]/.exec(raw.slice(raw.indexOf('var WIND_ANCHORS')));
  assert.ok(block, 'the palette is readable as data');
  const alphas = (block[2].match(/,\s*([0-9.]+)\]/g) || []).map((x) => parseFloat(x.replace(/[,\s\]]/g, '')));
  assert.ok(alphas.length >= 12, 'every stop declares an alpha');
  assert.deepEqual([...new Set(alphas)], [1], 'and every one of them is opaque');
});

/* ── ⑯ a layer that cannot be added YET keeps asking ──────────────────────────────────────────
   ⚠ CAUGHT BY THIS ROUND'S OWN PRODUCTION TEST, four attempts of 75 s each on the CI runner: the
   wind data arrived and the raster never appeared. `addField`/`addLayer` refuse while the style
   cannot accept a layer, and the rewrite called each of them ONCE — so on a machine where the style
   settles after the data does, the wind had particles and no colour for ever. #R85 answered exactly
   this report with a retry ladder; this asserts the ladder exists rather than the number in it. */
test('R276 ⑯ a weather layer that is refused keeps trying, and stops when it lands', () => {
  const w = WX();
  assert.match(w, /function ensureField\(key\)\{[\s\S]{0,400}?if\(n\+\+<\d+\) setTimeout\(again,\d+\);/,
    'the wind field retries on a timer…');
  assert.match(w, /GE\(\)\.events\.once\('idle',\(\)=>\{ if\(on&&liveKey!==key\) addField\(key\); \}\)/,
    '…and on the map\'s next idle');
  assert.match(w, /const again=\(\)=>\{ if\(!on\|\|liveKey===key\) return;/,
    'and it stops as soon as the slot is live, or the layer is off');
  assert.match(w, /if\(key&&key!==liveKey\) ensureField\(key\);/, 'load() goes through the ladder');
  /* the ECMWF rasters have the same shape and the same ladder */
  assert.match(w, /const go=\(\)=>\{ if\(!state\[id\]\.on\) return;\s*\n\s*if\(_imCanDraw\(\)&&addLayer\(cfg\)\)/,
    'an ECMWF layer retries too');
  assert.match(w, /if\(n\+\+<\d+\) setTimeout\(go,\d+\);/, '…on a bounded ladder');
  /* and a rebuild for a new hour cannot leave the map with nothing
     ⚠ (#R284) it no longer removes the old layer first AT ALL — the new hour is built in the free
     slot at zero opacity and the old one is dropped once the map has settled. The retry ladder is
     still there, because `addSlot` can still be refused; what is gone is the hole it was covering. */
  assert.match(w, /const old=cfg\._s\|0, nu=1-old;[\s\S]{0,300}?if\(!\(_imCanDraw\(\)&&addSlot\(cfg,nu\)\)\)\{ if\(n\+\+<\d+\) setTimeout\(go,\d+\); return; \}/,
    'a time step retries its rebuild');
  assert.match(w, /setOpSlot\(cfg,nu,0\);[\s\S]{0,300}?dropSlot\(cfg,old\);/,
    '…and the old picture is only dropped once the new one has painted');
});

/* ── ⑰ the next hour is warmed when the reader moves, not on first sight ──────────────────────
   「時刻変更時は隣接フレームを先読みし」 — the instruction's own words. Warming a frame costs the
   same ranged reads as the one on screen, so doing it for a reader who has not touched the player
   spends their bandwidth on a picture they may never ask for, and competes with the one they did. */
test('R276 ⑰ the prefetch is on the time change, not on the first load', () => {
  const w = WX();
  assert.match(w, /if\(opt&&opt\.step\)\{ try\{ EC\(\)\.prefetch\(\['wind_u_component_10m','wind_v_component_10m'\]/,
    'the wind warms the next hour only when the axis moved');
  assert.match(w, /load\(\{step:ev\.type==='time'\}\)/, 'and that is what a time event passes');
  assert.match(w, /function applyTime\(only\)\{[\s\S]{0,1600}?EC\(\)\.prefetch\(vars,Math\.min\(n-1,i\+1\)\)/,
    'the ECMWF rasters warm theirs from the time change too');
});

/* ── ⑱ one layer's teardown is not a global "forget everything" ───────────────────────────────
   MEASURED: switching the wind OFF called `release()` unqualified, clearing `held` AND `loadingKey`,
   so a load of a DIFFERENT variable that was in flight resolved, found `loadingKey` no longer its
   own, and returned null — an ECMWF layer whose point value went blank for no visible reason. And it
   is not a contrived race: js/map-ui.js re-applies the saved layer set at 700 / 1,800 / 3,200 ms
   after boot, switching OFF anything not in the share hash. */
test('R276 ⑱ a layer releases its own frame, never somebody else\'s', () => {
  const s = EC();
  /* (#R290) …and «the held frame» is now «the frames it holds»: more than one variable can be in
     hand (the wind's, and whichever raster the cursor is over — see the note on `frames`), so a
     release drops that variable's frames and refuses when it holds none of them. */
  assert.match(s, /function release\(variable\) \{[\s\S]{0,900}?if \(!had && !mineLoading\) return false;/,
    "release takes the variable it belongs to and refuses when it holds none of that variable's frames");
  assert.match(s, /frames = frames\.filter\(function \(f\) \{ return f\.variable !== variable; \}\);/,
    'and it drops only that variable…');
  assert.match(s, /loadingKey\.indexOf\('variable=' \+ encodeURIComponent\(variable\)\) >= 0/,
    '…and when nothing is held, the load in flight does');
  assert.match(WX(), /EC\(\)\.release\(VAR\)/, 'the wind layer names itself when it lets go');
  /* ⚠⚠ (#R288) THE TIME STEP'S OWN DROP IS GONE ENTIRELY. #R287 had already narrowed it — the
     unconditional `release()` was cancelling the load of the very hour it was announcing — and this
     round removed the drop itself: a load that SUCCEEDED still resolved as a failure whenever any
     later request superseded it (measured: 8.3 s, data present, result null), because the handler
     returned the module slot rather than the frame it had decoded. What survives is the rule this
     test was written for — a release NAMES its variable — plus a monotonic `seq` that makes
     「which frame is current」 explicit instead of leaving it to a slot anything could clear. */
  /* ⚠⚠ (#R288) THE UNCONDITIONAL RELEASE ON A TIME CHANGE IS GONE, and #R276's own reasoning is
     why: it invalidated the read that was already running for the hour the reader had just
     chosen, so a load that SUCCEEDED resolved as a failure and js/weather.js raised
     「風データを取得できませんでした」 (measured: 8.3 s, data present, result null). The new frame
     replaces the old one when it lands. What survives is the rule this test was written for — a
     release NAMES its variable — plus a monotonic `seq` that makes 「which frame is current」
     explicit instead of leaving it to a slot that anything could clear. */
  const ft = s.slice(s.indexOf('function fireTime()'), s.indexOf('function _clock()'));
  assert.ok(!/release\(\)/.test(ft), 'a time change no longer throws the current frame away');
  assert.match(s, /var mine = \+\+seq;/, 'which frame is current is explicit');
  assert.match(s, /if \(seq === mine\) \{/, '…and a superseded read still resolves to its caller');
});

/* ── ⑲ one reader, therefore one queue ────────────────────────────────────────────────────────
   `ensureData` re-points the SDK's single `omFileReader` at its own file every time it runs, so two
   reads of different files that overlap corrupt each other. Every read this module starts is queued
   behind the last, so it can never be the second party to that collision. */
test('R276 ⑲ every read this module starts is serialised', () => {
  const s = EC();
  assert.match(s, /function serial\(fn\) \{\s*var p = chain\.then\(fn, fn\);\s*chain = p\.then/,
    'there is one chain…');
  /* (#R288) …with the band's warm-up inside the SAME serialised body, so the prefetch cannot
     re-point the shared reader beside a read either. */
  assert.match(s, /return serial\(function \(\) \{[\s\S]{0,900}?sdk\.ensureData\(st, inst\.omFileReader/,
    '…the field load goes through it…');
  assert.match(s, /serial\(function \(\) \{[\s\S]{0,700}?setToOmFile\(f\)/,
    '…and so does the prefetch, which is the call that re-points the reader');
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
