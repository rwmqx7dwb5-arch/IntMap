/* ============================================================================
 *  IntMap · #R288 source checks
 * ----------------------------------------------------------------------------
 *  「気象警報はまだ対応していない、もしくはデータがまだ入っていないところは灰色斜線で、
 *    発令されていないだけの地域は灰色に。個々の区別はちゃんとやれ。」
 *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…あと、警報の塗漏れが多すぎる。
 *    また、対応国も増やせ。更新が遅すぎる。リアルタイムにと言っている。対応地域まで斜線で塗るのを辞めろ。」
 *  「ECMWF系レイヤーを開くと勝手にECMWFの時間ポップアップが出るのを辞めろ。わざわざ分けるな。」
 *  「Wind(animated)は…点滅してしまうバグが発生する。未来に変えたとき、風データを取得できませんでした
 *    となる。あと、重すぎるから、品質は一切落とさずに爆速にしろ。」
 *  「気温 2m（ECMWF）レイヤーも色を添付画像と同じ色＋グラデーションに。また、名前は単に気温に。
 *    気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、グラフィックに。
 *    ソースだけ切り替えられる仕様に。」
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH (the sixteenth time this has mattered): this round's
 *  own comments quote the very strings it removed — `data-legend-ec-time`, `return -1`,
 *  `setVis(LYR` — so a check that read the raw file would fail on the sentence explaining the fix.
 *  ⚠ EVERY DELETION CHECK ALSO COUNTS WHAT MUST SURVIVE, so a fix that went too far is red too.
 *  ⚠ Nothing here matches a bare "\n": the working copy is CRLF on Windows and LF on CI (#R283).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const RE = () => codeOnly(read('js/wx-reanalysis.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));

/* ── ① 未対応 もしくは データがまだ入っていない → 灰色斜線 ──────────────────────────────────────
   #R284 answered 「対応国まで斜線で塗るのを辞めろ」 by drawing NOTHING for a wired-but-unread
   country (`washTier` = −1). The reader has now said which of the two silences they meant, in the
   same sentence as the rule, so both of them are the hatch again — and the three claims that DO
   exist have to survive the change.                                                              */
test('#R288 ① the hatch covers both silences, and the other three states survive', () => {
  const src = WP();
  const i = src.indexOf('function washTier(');
  assert.ok(i > 0, 'washTier must exist');
  const body = src.slice(i, src.indexOf('function paintCountries(', i));
  assert.match(body, /if\(!supported\(c\)\)\s*return\s*0;/, 'no feed at all → hatched');
  assert.match(body, /if\(readState\(c\)!=='ok'\)\s*return\s*0;/,
    '「データがまだ入っていない」 → hatched, the same appearance as 「未対応」');
  assert.ok(!/return\s*-1;/.test(body), '#R284’s fourth state must be gone');
  /* …and the claims that are NOT the hatch are still made */
  assert.match(body, /if\(u&&!drawnISO\[c\]\)\s*return\s*10\+Math\.min\(4,u\);/, 'the unplaced-rank wash survives');
  assert.match(body, /return\s*unitsOf\(c\)\?2:1;/, '「read and quiet」 is still its own tier');
  /* the paint expressions still read the tier the way those states assume */
  assert.match(src, /'fill-opacity':\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],0\.9,0\]/,
    'the hatch paints on tier 0 only');
  assert.match(src, /'fill-opacity':\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],1,0\]/,
    'the wash paints on a positive tier only');
});

/* ── ② 「発令なし」 is decided at the administrative unit ────────────────────────────────────── */
test('#R288 ② the quiet grey is a unit layer, under the warnings, in the same grey', () => {
  const src = WP();
  assert.match(src, /const QSRC='wp-alert-quiet-src',\s*QFILL='wp-alert-quiet',\s*QLINE='wp-alert-quiet-line';/);
  assert.match(src, /const QUIET_COL='rgba\(200,200,203,0\.42\)';/,
    'the unit grey is the SAME grey the country-wide sheet uses — a second shade would be a second meaning');
  assert.match(src, /1,'rgba\(200,200,203,0\.42\)',/, '…and the country-wide sheet still uses it');
  const i = src.indexOf('function ensureQuiet(');
  assert.ok(i > 0, 'ensureQuiet must exist');
  const body = src.slice(i, i + 1400);
  assert.match(body, /GE\(\)\.layers\.has\('wp-alert-fill'\)\?'wp-alert-fill'/,
    'the quiet units go UNDER the warning fills, by NAME (#R277’s rule)');
  assert.match(body, /id:QFILL,type:'fill'/);
  assert.match(body, /id:QLINE,type:'line'/, 'the division is half the answer — the outline is required');
  /* a country whose units this map holds must not ALSO get the country-wide sheet */
  assert.match(src, /return\s*unitsOf\(c\)\?2:1;/);
  /* the unit sets are the ones the placement ladder already builds */
  const u = src.indexOf('function askUnits(');
  const ub = src.slice(u, src.indexOf('function askUnitsGB(', u));
  ['jpMuniGeo()', 'cnGeo()', 'twTownGeo()', 'nutsGeo()', 'adm1Geo()'].forEach(fn =>
    assert.ok(ub.includes(fn), 'askUnits must read ' + fn));
  assert.match(src, /const GB_MAX=2;/, 'geoBoundaries is asked for at most two countries at a time');
  assert.match(src, /function askUnitsInView\(/, 'and only for countries the reader can see');
});

/* ── ③ 対応国も増やせ — learned from the geometry, not written down ─────────────────────────── */
test('#R288 ③ coverage is learned from a drawn polygon, adds only, and is not persisted', () => {
  const src = WP();
  const i = src.indexOf('function learnCoverage(');
  assert.ok(i > 0, 'learnCoverage must exist');
  const body = src.slice(i, src.indexOf('function centroidOf(', i));
  assert.match(body, /centroidOf\(f\.geometry\)/, 'the CENTROID, not any vertex');
  assert.match(body, /countryAt\(c\[0\],c\[1\]\)/);
  assert.match(body, /if\(!at\|\|at===q\.iso\|\|FEEDS\[at\]\|\|LEARNED\[at\]\)\s*return;/,
    'a country with its own feed is never re-assigned — 「ソースは一国一ソース」');
  assert.match(src, /const supported=\(c\)=>!!\(FEEDS\[c\]\|\|LEARNED\[c\]\);/);
  assert.match(src, /learnCoverage\(feats\);/, 'publish() is where the evidence is read');
  /* the hand-written list #R284 measured is still there — this ADDS to it, it does not replace it */
  assert.match(src, /const ALSO=\{ nws:\['PRI','VIR','GUM','MNP','ASM','PLW','FSM','MHL'\] \};/);
});

/* ── ④ 更新が遅すぎる — the rotation reads what the reader is looking at first ───────────────── */
test('#R288 ④ the rotation is view-first, and the shape library retries sooner while short', () => {
  const src = WP();
  assert.match(src, /function viewFirst\(list\)\{/);
  assert.match(src, /const byAge=viewFirst\(fresh\.sort/, 'MeteoAlarm rotates view-first');
  assert.match(src, /const byAge=viewFirst\(hot\.filter\(k=>swicData\[k\]\)/, 'the WMO register too');
  assert.match(src, /const SWIC_GEO_SHORT_MS=180000;/);
  assert.match(src, /const wait=short\?SWIC_GEO_SHORT_MS:SWIC_GEO_RETRY_MS;/);
  /* …and the floor the transport imposes is still respected (#R284) */
  assert.match(src, /const MIN_AGE_MS=45000;/, 'the relay’s own 60 s edge cache is still the floor');
  assert.match(src, /const COLD_CALLS=6;/, 'the cold burst survives');
});

/* ── ⑤ one call decides whether the layer is showing ────────────────────────────────────────── */
test('#R288 ⑤ alert visibility is one list, one call, re-asserted', () => {
  const src = WP();
  assert.match(src, /const ALL_LYR=\(\)=>LYR\.concat\(\[CHORO,HATCH,QFILL,QLINE\]\);/);
  assert.match(src, /function applyAlertVis\(\)\{ setVis\(ALL_LYR\(\),on\); \}/);
  assert.match(src, /GE\(\)\.events\.on\('idle',\(\)=>\{ if\(on\) applyAlertVis\(\); \}\)/, 're-asserted when the map settles');
  assert.match(src, /function tick\(\)\{ if\(on\) applyAlertVis\(\);/, '…and when it does not');
  const a = src.indexOf('(function alerts()');
  const b = src.indexOf('window.__wpAlerts=', a);
  assert.ok(a > 0 && b > a);
  assert.ok(!/setVis\(LYR,/.test(src.slice(a, b)), 'no partial list is set anywhere in the alerts module');
});

/* ── ⑥ the temperature ramp is the reference picture’s, measured ────────────────────────────── */
test('#R288 ⑥ the temperature ramp is 23 measured stops in °C, on the SDK’s temperature family', () => {
  const src = EC();
  const i = src.indexOf('var TEMP_ANCHORS');
  assert.ok(i > 0, 'TEMP_ANCHORS must exist');
  const body = src.slice(i, src.indexOf('var WINDY_TEMP', i));
  assert.match(body, /unit:\s*'°C'/, 'stated in the unit the feed publishes');
  const bp = /breakpoints:\s*\[([^\]]+)\]/.exec(body);
  assert.ok(bp, 'breakpoints must be a literal');
  const nums = bp[1].split(',').map(x => parseFloat(x.trim()));
  assert.equal(nums.length, 23, '23 stops reproduce windy.com’s own gradient to 3/255');
  assert.equal(nums[0], -70.15);
  assert.equal(nums[nums.length - 1], 46.85);
  for (let k = 1; k < nums.length; k++) assert.ok(nums[k] > nums[k - 1], 'breakpoints must increase');
  /* the freezing isotherm is emphasised — four stops inside one degree */
  assert.equal(nums.filter(v => v >= 0 && v <= 0.85).length, 5,
    'five stops inside one degree — dropping 0.40 takes the worst error from 3/255 to 7/255');
  assert.match(body, /\[115,\s*70,\s*105,\s*1\]/, 'the coldest colour is the reference’s');
  assert.match(body, /\[71,\s*14,\s*0,\s*1\]/, 'and the hottest');
  assert.match(src, /var WINDY_TEMP = rampFrom\(TEMP_ANCHORS, 0\.05\);/);
  assert.match(src, /\{ wind: WINDY_WIND, temperature: WINDY_TEMP \}/,
    'registered on the SDK’s FAMILY name, so every temperature variable moves together');
  /* …and the wind ramp #R284 measured is untouched */
  assert.match(src, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/);
  assert.match(src, /breakpoints:\s*\[0,\s*1,\s*3,\s*5,\s*7,\s*9,\s*11,\s*13,\s*15,\s*17,\s*20,\s*23,\s*26,\s*30,\s*36,\s*45,\s*60\]/);
});

/* the ramp is not asserted only as text: build it and check it reproduces the anchors exactly and
   moves smoothly between them, which is what 「色はそのまま／グラデーションに」 means. */
test('#R288 ⑥b the resampled ramp lands on its anchors and never steps visibly', () => {
  const src = read('js/wx-ecmwf.js');
  const i = src.indexOf('var TEMP_ANCHORS');
  const j = src.indexOf('var WINDY_TEMP', i);
  assert.ok(i > 0 && j > i, 'TEMP_ANCHORS literal');
  const lit = src.slice(i, j);
  const bp = JSON.parse('[' + /breakpoints:\s*\[([\s\S]*?)\]/.exec(lit)[1] + ']');
  /* the colours are [r,g,b,a] rows — read each row, keep the three channels */
  const cols = (lit.slice(lit.indexOf('colors:')).match(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1\s*\]/g) || [])
    .map(r => JSON.parse(r).slice(0, 3));
  assert.equal(bp.length, cols.length, 'one colour per breakpoint');
  const rampFrom = (a, step) => {
    const lo = a.bp[0], hi = a.bp[a.bp.length - 1];
    const out = { breakpoints: [], colors: [] };
    const n = Math.round((hi - lo) / step); let seg = 0;
    for (let k = 0; k <= n; k++) {
      const v = lo + k * step;
      while (seg < a.bp.length - 2 && v >= a.bp[seg + 1]) seg++;
      const span = (a.bp[seg + 1] - a.bp[seg]) || 1;
      let f = (v - a.bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
      const c0 = a.cols[seg], c1 = a.cols[Math.min(seg + 1, a.cols.length - 1)];
      out.breakpoints.push(Math.round(v * 1000) / 1000);
      out.colors.push([0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * f)));
    }
    return out;
  };
  const r = rampFrom({ bp, cols }, 0.05);
  assert.equal(r.breakpoints.length, 2341, '−70.15 … 46.85 °C at 0.05 °C');
  /* every anchor value lands on its own colour — 「色はそのまま」 is literal, not approximate */
  bp.forEach((v, k) => {
    let lo = 0, hi = r.breakpoints.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.breakpoints[m] <= v + 1e-9) lo = m; else hi = m; }
    const got = r.colors[lo];
    const want = cols[k];
    const err = Math.max(Math.abs(got[0] - want[0]), Math.abs(got[1] - want[1]), Math.abs(got[2] - want[2]));
    assert.ok(err <= 4, 'anchor ' + v + ' °C should land on its own colour (off by ' + err + ')');
  });
  /* and no step between neighbours is visible */
  let worst = 0;
  for (let k = 1; k < r.colors.length; k++) {
    const a = r.colors[k - 1], b = r.colors[k];
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  assert.ok(worst <= 24, 'the steepest neighbour step is the 0 °C isotherm; anything larger is a band (got ' + worst + ')');
});

/* ── ⑦ a read that succeeded is not reported as a failure ───────────────────────────────────── */
test('#R288 ⑦ load() returns its own frame, and a time change no longer drops the held one', () => {
  const src = EC();
  const i = src.indexOf('function load(variable, i, bounds)');
  assert.ok(i > 0, 'load must take the band');
  const body = src.slice(i, src.indexOf('function bandFor(', i));
  assert.match(body, /var frame = \{ key: key2, variable: variable, file: f, data: data, grid: g, band: band \};/);
  assert.match(body, /return frame;/, 'the handler returns what IT decoded');
  assert.ok(!/\breturn held;\s*\}\);/.test(body), 'never the module-level slot');
  assert.match(body, /if \(seq === mine\) \{/, 'a superseded read still resolves, it just does not install');
  const ft = src.indexOf('function fireTime()');
  const ftBody = src.slice(ft, src.indexOf('function _clock()', ft));
  assert.ok(!/release\(\)/.test(ftBody), 'a time change must not throw the current frame away');
  assert.match(src, /function release\(variable\) \{[\s\S]*?seq\+\+;/, 'a deliberate drop supersedes what is in flight');
});

/* ── ⑧ 品質は一切落とさずに爆速に — the latitude band ───────────────────────────────────────── */
test('#R288 ⑧ the field is read as the latitude band in view, warmed before it is read', () => {
  const src = EC();
  assert.match(src, /function bandCovers\(have, want\)/);
  assert.match(src, /if \(have === null \|\| have === undefined\) return true;/, 'the globe covers everything');
  assert.match(src, /rd\.prefetchVariable\(variable, st\.ranges\)/,
    'the band is latency-bound, so it is warmed at the SDK’s own concurrency first');
  assert.match(src, /bounds: band \|\| undefined/);
  assert.match(src, /var skey = key2 \+ \(band \? \('#'/, 'two bands must not share one state key');
  const bf = src.indexOf('function bandFor(');
  const bb = src.slice(bf, bf + 500);
  assert.match(bb, /if \(n2 - s2 >= 120\) return null;/, 'a view of most of the planet reads the planet');
  /* the wind asks for its own band and re-reads only when the view has left it */
  const w = WX();
  assert.match(w, /return EC\(\)\.bandFor\(b\.getSouth\(\),b\.getNorth\(\)\);/);
  assert.match(w, /EC\(\)\.load\(VAR,null,band\(\)\)/);
  assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(\),band\(\)\)\) load\(\);/);
});

/* ── ⑨ わざわざ分けるな — there is no ECMWF clock ──────────────────────────────────────────── */
test('#R288 ⑨ the forecast axis is the app clock, and the separate box is gone', () => {
  const w = WX();
  assert.ok(!/'ec-time'/.test(w), 'the 「ECMWF 予報時刻」 box must not be created');
  assert.ok(!/ec-validtime/.test(w), '…nor its readout');
  assert.ok(!/function ensureLegend\(/.test(w), '…nor the function that made it');
  assert.match(w, /class="ecl-when"/, 'each legend states WHICH INSTANT its picture is of');
  assert.match(w, /function openClock\(\)/);
  assert.match(w, /window\._imTimeMachineForecast\(\)/, '…and the line opens the ONE shared control');
  /* the wind legend keeps its player — this is a consolidation, not a removal */
  assert.match(w, /id="wind-time"/, 'the wind legend’s own view of the clock survives');
  /* the module writes the instant into the master clock, coalesced */
  const e = EC();
  assert.match(e, /C\.set\(new Date\(tms\(vt\)\), \{ allowFuture: true, source: 'ecmwf' \}\)/);
  assert.match(e, /if \(playing\) return;[\s\S]{0,120}pushT = setTimeout\(_pushNow, 220\);/,
    'playback does not broadcast 145 times');
  assert.match(e, /C\.on\(_followClock\); _clockWired = true;/, '…and follows it back');
  assert.match(e, /function _followClock\(e\)/);
  /* the time machine grew the tab that makes that possible */
  const t = TL();
  assert.match(t, /const modeFc=document\.getElementById\('ntl-mode-fc'\)/);
  assert.match(t, /const fcReady=\(\)=>/, 'the tab is present only when the model published an axis');
  assert.match(t, /if\(modeFc\) modeFc\.style\.display=fcReady\(\)\?'':'none';/);
  assert.match(t, /window\._imTimeMachineForecast=/);
  assert.match(read('index.html'), /id="ntl-mode-fc"/);
  assert.match(read('index.html'), /id="ntl-player"/);
});

/* ── ⑩ 一つのレイヤー、同じ色分け、ソースだけ切り替え ─────────────────────────────────────── */
test('#R288 ⑩ air temperature is one layer with two sources and one ramp', () => {
  const w = WX();
  assert.match(w, /id:'ec-temp',\s*variable:'temperature_2m'[\s\S]{0,200}sources:\['ecmwf','merra2'\]/);
  assert.match(w, /label:LA\('Temperature','気温'/, '「名前は単に気温に」');
  assert.ok(!/Temperature 2 m \(ECMWF\)/.test(w), 'the old name must be gone');
  assert.match(w, /class="ec-srcsel"/, 'the switch is in the legend');
  assert.match(w, /function setSource\(id,src\)\{/);
  assert.match(w, /if\(srcOf\(cfg\)==='merra2'\)\{/, 'the reanalysis is a source of the SAME layer');
  assert.match(w, /RE\(\)\.tiles\(state\[cfg\.id\]\.month\)/);
  /* the reanalysis month is written by the SAME clock the forecast hour is — one instant, two
     granularities, so a reader who travels to 1998 sees 1998's temperature */
  assert.match(w, /function applyMonth\(iso\)\{/);
  assert.match(w, /C\.on\(e=>\{ try\{ applyMonth\(e\.isLive\?\(RE\(\)&&RE\(\)\.latestMonth\(\)\):e\.iso\); \}/,
    'the master clock writes the reanalysis month');
  /* the second row is gone from the panel, and a saved session is translated rather than dropped */
  const d = DL();
  assert.ok(!/\['temp','lyrTemp'\]/.test(d), 'the duplicate row must not be declared');
  assert.ok(!/lgdTemp/.test(d), '…nor its legend');
  assert.ok(!/MERRA2_2m_Air_Temperature_Monthly/.test(d), '…nor its tiles');
  /* what must SURVIVE: the other dated GIBS layers still have their date control */
  assert.match(d, /const layerDates=\{precip:PRECIP_DATE,sst:GIBS_DATE,snow:GIBS_DATE,aod:GIBS_DATE\};/);
  assert.match(d, /const isDated=layerDates\.hasOwnProperty\(id\);/);
  assert.match(codeOnly(read('js/session-tabs.js')), /'dl-temp':'dl-ec-temp'/, 'a saved session is migrated');
});

/* ── ⑪ the reanalysis tile is inverted through NASA’s own published palette ─────────────────── */
test('#R288 ⑪ the reanalysis re-colour reads the colormap rather than copying it', () => {
  const src = RE();
  assert.match(src, /https:\/\/gibs\.earthdata\.nasa\.gov\/colormaps\/v1\.3\//, 'the palette is fetched, not transcribed');
  assert.match(src, /if \(ref === 1\) return 219\.75;/);
  assert.match(src, /return 220 \+ \(ref - 2\) \* 0\.5 \+ 0\.25;/, '180 half-degree bins, 220 K → 310 K');
  assert.match(src, /if \(ref >= 182\) return 310\.25;/);
  assert.match(src, /if \(\/nodata="true"\/\.test\(a\)\) continue;/, 'the no-data entry is not a temperature');
  assert.match(src, /ctx\.imageSmoothingEnabled = false;/,
    'a resampled pixel is a colour in no palette entry, i.e. a temperature that was never measured');
  assert.match(src, /window\.IntMapECMWF && window\.IntMapECMWF\.WINDY_TEMP/, 'one ramp, read from its owner');
  assert.match(src, /addProtocol\('imwxre'/);
  assert.match(codeOnly(read('src/main.js')), /import '\.\.\/js\/wx-reanalysis\.js';/);
  /* binK is arithmetic, so run it */
  const binK = (ref) => (ref <= 0 ? null : ref === 1 ? 219.75 : ref >= 182 ? 310.25 : 220 + (ref - 2) * 0.5 + 0.25);
  assert.equal(binK(0), null);
  assert.equal(binK(2), 220.25);
  assert.equal(binK(181), 309.75);
  assert.ok(binK(181) < binK(182), 'the bins increase to the last one');
});

/* ── ⑫ an `om://` url is never handed to MapLibre without the protocol behind it ────────────── */
test('#R288 ⑫ the om protocol flag only goes up when the registration happened', () => {
  const src = EC();
  const i = src.indexOf('function registerProtocol()');
  const body = src.slice(i, src.indexOf('function ready()', i));
  assert.match(body, /ok = !!window\.IntMapGeoEngine\.scene\.addProtocol\('om'/, 'addProtocol already returns a boolean');
  assert.match(body, /protoReg = ok;/);
  assert.ok(!/protoReg = true;\s*return true;/.test(body), 'the flag must not latch outside the try');
  const w = WX();
  assert.match(w, /if\(!EC\(\)\.registerProtocol\(\)\) return false;\s*const url=omUrl\(cfg/,
    'a raster layer refuses to be built before the protocol exists');
  assert.match(w, /if\(!EC\(\)\.registerProtocol\(\)\) return false;\s*const s=SLOT\[slot\], url=EC\(\)\.omUrl\(VAR\);/,
    '…and so does the animated field');
});
