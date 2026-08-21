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
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
/* (#R293) js/wx-reanalysis.js is gone — see ⑩ and ⑪ */
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
  /* (#R290) …and «this map holds its units» became «the unit layer is drawing it right now», because
     the quiet collection is bounded by the view and by the zoom — a country whose units are cached
     but off-screen has to keep the country-wide sheet or nothing would paint it. */
  assert.match(body, /return\s*quietSet\[c\]\?2:1;/, '「read and quiet」 is still its own tier');
  /* the paint expressions still read the tier the way those states assume */
  /* ⚠ (#R293) the condition moved into `hatchOp(v)` — see tests/r293 ⑯ for what was writing over it */
  assert.match(src, /const hatchOp=\(v\)=>\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the hatch paints on tier 0 only');
  assert.match(src, /const choroOp=\(v\)=>\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the wash paints on a positive tier only');   /* (#R293) …in a builder — see tests/r293 ⑯ */
  /* ══ ⚠⚠⚠ (#R290) AND THE HATCH TILE MUST NOT BE A GREY SHEET WITH LINES ON IT ════════════════
     「灰色塗と灰色斜線が両方ある地域があるが、どうなっとんねんごら。」 The tile opened with a
     `fillRect` in rgba(158,162,170,0.26) and stroked the diagonals over it, so 「未対応 / 未取得」
     was drawn as grey fill PLUS lines while 「発令なし」 is grey fill alone — every hatched country
     wearing the quiet country's appearance underneath its own. The two claims have to be visually
     exclusive, so the tile is lines on transparent and nothing else. */
  /* ⚠ (#R293) the tile is BUILT in `hatchCanvas()` now, because the legend swatch is a picture of
     the same tile (「斜線塗がなんなのか分かるように、凡例に追加しろ」) and two hand-written patterns
     that have to agree is the #R270 defect waiting to happen. The property is unchanged and is
     asserted where the drawing now lives. */
  const h = src.indexOf('function hatchCanvas(');
  const hb = src.slice(h, src.indexOf('const HAZ', h) > h ? src.indexOf('const HAZ', h) : h + 1200);
  assert.ok(!/fillRect\(0,0,S,S\)/.test(hb), 'the hatch tile paints no backing sheet');
  assert.match(hb, /g\.clearRect\(0,0,S,S\);/, '…it starts transparent');
  assert.match(hb, /g\.strokeStyle=/, '…and the diagonals are the whole signal');
});

/* ── ② 「発令なし」 is decided at the administrative unit ────────────────────────────────────── */
test('#R288 ② the quiet grey is a unit layer, under the warnings, in the same grey', () => {
  const src = WP();
  /* ⚠ (#R298) THIS CHECK USED TO NAME THE STRUCTURE, AND THE STRUCTURE WAS THE DEFECT.
     It required a SECOND source and a SECOND pair of layers for the quiet grey — which is exactly
     what made Japan's 「発表なし」 a different colour, at a different opacity, in a different layer
     from everyone else's, and what put a grey sheet UNDER every warned unit. The invariant this
     test exists for is 「発表なし is drawn per unit, in one grey, and never under the answer」, and
     that is the question it asks now. */
  assert.ok(!/wp-alert-quiet/.test(src),
    'there is no second quiet source or layer — one collection, one fill, one grey');
  /* ⚠ (#R293) the VALUE moved (「灰色塗の色味は少しだけ白に近づけろ」) and the PROPERTY did not: one
     declaration, and the country-wide sheet paints from that same constant rather than a copy of
     its literal — which is now enforced by construction instead of by two matching regexes. */
  assert.match(src, /const QUIET_COL='rgba\(\d+,\d+,\d+,0\.42\)';/,
    'the unit grey is declared once — a second shade would be a second meaning');
  assert.match(src, /\n\s+1,QUIET_COL,/, '…and the country-wide sheet paints from that declaration');
  /* the unit grey is produced in ONE place, and that place is not country-specific */
  assert.match(src, /function quietFeature\(iso,feed,geometry,unit,name\)\{/);
  assert.match(src, /colA:NONE_COL, colN:NONE_COL/, 'one grey for every country');
  assert.ok(!/quietFeature\('JPN'/.test(src),
    'no country gets a quiet path of its own — that was why Japan looked different');
  /* it rides in the SAME collection as the warnings, ahead of them (array order is draw order) */
  assert.match(src, /quietFeatures\(\)\.concat\(feats\)/,
    'quiet first, warnings after — one source, one fill layer');
  /* and a unit a warning is drawn on does not ALSO get a grey underneath it */
  assert.match(src, /if\(coveredByWarning\(iso,g\)\) return;/);
  assert.match(src, /function coveredByWarning\(iso,g\)\{/);
  /* the division is still half the answer: the outline tells norm-0 units apart from each other */
  assert.match(src, /'line-color':\['case',\['>',\['get','norm'\],0\],\['get',colField\(\)\],'rgba\(/);
  /* a country the unit layer is drawing must not ALSO get the country-wide sheet */
  assert.match(src, /return\s*quietSet\[c\]\?2:1;/);
  /* the unit sets are the ones the placement ladder already builds */
  const u = src.indexOf('function askUnits(');
  const ub = src.slice(u, src.indexOf('function askUnitsWorld(', u));
  ['jpMuniGeo()', 'cnGeo()', 'twTownGeo()', 'nutsGeo()', 'adm1Geo()'].forEach(fn =>
    assert.ok(ub.includes(fn), 'askUnits must read ' + fn));
  assert.match(src, /const GB_MAX=2;/, 'geoBoundaries is asked for at most two countries at a time');
  assert.match(src, /function askUnitsInView\(/, 'and only for countries the reader can see');
  /* ══ ⚠⚠ (#R290) …AND THERE IS A WORLD INDEX BEFORE THAT LAST RESORT ═══════════════════════
     MEASURED on production before this round: 95 countries were still one sheet of country-wide
     grey and only 50 were drawn at the unit, because everything outside the five closer indexes
     fell to geoBoundaries one country at a time. `data/admin1-world.json.gz` is 4,515 units across
     247 countries in 2.38 MB, fetched once. */
  assert.match(src, /const ADM1_URL='data\/admin1-world\.json\.gz';/, 'the world index is a shipped file');
  assert.match(src, /function askUnitsWorld\(iso\)\{/, 'and askUnits falls to it before geoBoundaries');
  assert.match(src, /DecompressionStream\('gzip'\)/, 'it is read the way the gazetteer is read');
  assert.ok(existsSync(resolve(ROOT, 'data/admin1-world.json.gz')), 'and the file is in the repository');
});

/* ── ③ 対応国も増やせ — learned from the geometry, not written down ─────────────────────────── */
test('#R288 ③ coverage is learned from a drawn polygon, adds only, and is not persisted', () => {
  const src = WP();
  const i = src.indexOf('function learnCoverage(');
  assert.ok(i > 0, 'learnCoverage must exist');
  const body = src.slice(i, src.indexOf('function centroidOf(', i));
  assert.match(body, /centroidOf\(f\.geometry\)/, 'the CENTROID, not any vertex');
  /* ⚠ (#R297) the same question, asked only of the countries whose answer would be USED. The
     unqualified walk cost 5,562 ms of point-in-polygon per 50 s (it walks every ring of every
     hi-res country outline); the predicate IS the old three-way test, moved into the search. */
  assert.match(body, /countryAtWhere\(c\[0\],c\[1\],\(iso\)=>iso!==q\.iso&&!FEEDS\[iso\]&&!LEARNED\[iso\]\)/,
    'a country with its own feed is never re-assigned — 「ソースは一国一ソース」');
  assert.match(src, /function countryAtWhere\(lng,lat,pred\)\{/, 'and that search has a name of its own');
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
  /* ⚠ (#R297) pin the RELATION, not the numbers. The floor exists because asking a country again
     inside the relay's own edge cache returns THE SAME BYTES — so the invariant is 「the floor is at
     or under the cache」, and #R297 shortened both together for 「更新が遅すぎる」. */
  const floor = +(/const MIN_AGE_MS=(\d+);/.exec(src) || [])[1];
  const smax = +(/s-maxage=(\d+)/.exec(read('supabase/functions/alerts-relay/index.ts')) || [])[1] * 1000;
  assert.ok(floor > 0 && floor <= smax,
    `the relay's own edge cache is still the floor (${floor} ms against ${smax} ms)`);
  assert.match(src, /const COLD_CALLS=\d+;/, 'the cold burst survives');
});

/* ── ⑤ one call decides whether the layer is showing ────────────────────────────────────────── */
test('#R288 ⑤ alert visibility is one list, one call, re-asserted', () => {
  const src = WP();
  assert.match(src, /const ALL_LYR=\(\)=>LYR\.concat\(\[CHORO,HATCH\]\);/);
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
  /* …and the wind ramp is built the same way, from its own anchors. ⚠ (#R293) it is no longer the
     seventeen #R284 measured: 「Windyと完全に同じ風速と色の対応に」 replaced them with windy.com's own
     table, sampled through `RGBA()`. What this line pins is that the two ramps are built by the
     SAME routine at their own steps — not what either table happens to contain. */
  assert.match(src, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/);
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
  /* ⚠ (#R297) the read is still ONE band-limited read of ONE variable; which band is decided
     first — the band around the view, then the whole view behind it (`bandFor` answers 「the
     planet」 at the opening view, which was 14.5 s before a particle moved). */
  assert.match(w, /return EC\(\)\.load\(VAR,null,b\);/);
  assert.match(w, /EC\(\)\.load\(VAR,null,want\)/, 'and the wide band follows');
  /* (#R290) …of ITS OWN variable: more than one frame can be held now, so 「the band I have」 has to
     name whose band it is or the wind would read the temperature's. */
  assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),band\(\)\)\) load\(\);/);
});

/* ── ⑨ わざわざ分けるな — there is no ECMWF clock ──────────────────────────────────────────── */
test('#R288 ⑨ the forecast axis is the app clock, and the separate box is gone', () => {
  const w = WX();
  assert.ok(!/'ec-time'/.test(w), 'the 「ECMWF 予報時刻」 box must not be created');
  assert.ok(!/ec-validtime/.test(w), '…nor its readout');
  assert.ok(!/function ensureLegend\(/.test(w), '…nor the function that made it');
  assert.match(w, /class="ecl-when"/, 'each legend states WHICH INSTANT its picture is of');
  /* ══ ⚠⚠⚠ (#R290) …AND IT NO LONGER PASSES THAT INSTANT TO THE APP CLOCK ════════════════════
     「ECMWF系レイヤーで、時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」
     The half of #R288 that stays is the one it was asked for: no floating box appears by itself.
     The half the reader has now reversed is the coupling — a forecast step used to write
     window.IntMapTime, which dragged the news feed, the historical borders, the terminator and the
     country statistics to that hour, and a master-clock move used to overwrite the hour the reader
     had chosen. Neither direction exists; the hour is chosen in the layer's own legend. */
  assert.ok(!/function openClock\(\)/.test(w), 'nothing opens Chronos on a layer’s behalf');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(\),L\)/,
    '…and the hour is chosen in that legend');
  /* the wind legend keeps its player — this is a consolidation, not a removal */
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend’s own view of the clock survives');
  const e = EC();
  assert.ok(!/C\.set\(new Date\(tms\(vt\)\), \{ allowFuture: true, source: 'ecmwf' \}\)/.test(e),
    'a step does not write the master clock');
  /* ══ ⚠⚠⚠ (#R293) THE PULL IS BACK, AND ONLY THE PULL ══════════════════════════════════════
     「Chronosで時間を変更したら、IntMap内の対応するすべての要素をChronosの時間に合わせるように。」
     #R290 cut both wires because #R288 had wired both; the one that hurt was the PUSH, and it is
     still cut (the assertion above). The reader is now asking for the other direction, which is
     the opposite trade — Chronos is the app's one clock, so an instant chosen there has to be the
     instant the weather is showing. `covers()` keeps it honest: travelling to 1972 is not a
     request for a forecast. */
  assert.match(e, /function _followClock\(e\)/, 'the seek stays declared — Atlas can ask for it by name');
  assert.match(e, /followClock: _followClock,/, '…and it is exported');
  assert.match(e, /C\.on\(function\(e\)\{ try\{ _followClock\(e\); \}/,
    '…and the master clock DOES drive the axis again (#R293)');
  assert.match(e, /function _pushClock\(\) \{\}/, 'but a forecast step still writes nothing back');
  /* (#R293) 「時刻と予報タブを分けるな」 — the fourth tab is gone and its transport moved into 「時刻」 */
  const t = TL();
  assert.ok(!/ntl-mode-fc/.test(t), 'the separate forecast tab is gone');
  assert.match(t, /const fcReady=\(\)=>/, 'the transport is present only when the model published an axis');
  assert.match(t, /if\(mode!=='time'\|\|!fcReady\(\)\)\{ fcStop\(\); playerEl\.style\.display='none'/,
    '…and it lives inside the Time tab');
  assert.match(t, /window\._imTimeMachineForecast=/);
  assert.ok(!/id="ntl-mode-fc"/.test(read('index.html')), 'the fourth tab is gone from the markup too');
  assert.match(read('index.html'), /id="ntl-player"/, '…and its transport is not');
});

/* ── ⑩ 一つのレイヤー、同じ色分け、ソースだけ切り替え ─────────────────────────────────────── */
/* ⚠⚠ (#R293) 「気温レイヤーで、MERRA-2 再解析は削除。」 — the second source is gone, and so is
   everything that only served it. What #R288 was really pinning is that air temperature is ONE row
   with ONE ramp and no duplicate in js/data-layers.js; that half is unchanged and is what this
   test asserts now. The removal is asserted too, because an unreachable branch that still looks
   like a feature is exactly what this project forbids. */
test('#R288 ⑩ air temperature is one layer with one ramp, and the reanalysis is gone', () => {
  const w = WX();
  assert.match(w, /id:'ec-temp',\s*variable:'temperature_2m'/);
  assert.match(w, /label:LA\('Temperature','気温'/, '「名前は単に気温に」');
  assert.ok(!/Temperature 2 m \(ECMWF\)/.test(w), 'the old name must be gone');
  /* (#R293) the source picker, the month clock and the reanalysis module went together */
  assert.ok(!/merra2/.test(w), 'no branch of the weather module mentions the reanalysis');
  assert.ok(!/class="ec-srcsel"/.test(w), '…the source picker is gone');
  assert.ok(!/function setSource\(id,src\)\{/.test(w), '…and the switch behind it');
  assert.ok(!/function applyMonth\(iso\)\{/.test(w), '…and the month clock that only it used');
  assert.ok(!/IntMapReanalysis/.test(w), '…and the module reference');
  assert.ok(!/wx-reanalysis/.test(codeOnly(read('src/main.js'))), 'the file is not imported');   /* (#R293) comments stripped — see ⑪ */
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

/* ── ⑪ the reanalysis is GONE, and nothing is left half-wired ────────────────────────────────
   ⚠⚠ (#R293) 「気温レイヤーで、MERRA-2 再解析は削除。」 #R288 ⑪ asserted that the reanalysis tile was
   inverted through NASA's own published colormap rather than a transcribed copy of it. There is no
   longer a reanalysis tile. What this test protects now is the OTHER half of a removal — that it
   went all the way: no module, no import, no protocol, and no caller left pointing at any of them.
   A half-removed feature is the shape this project keeps paying for. */
test('#R288 ⑪ the reanalysis is removed end to end, with nothing left pointing at it', () => {
  assert.ok(!existsSync(resolve(ROOT, 'js/wx-reanalysis.js')), 'the module is deleted');
  /* ⚠ (#R293) COMMENTS ARE STRIPPED FIRST. The removal is explained in a comment that names the
     file it removed — and an earlier draft of this very test matched its own explanation. That is
     the nineteenth time this project has hit that shape; `codeOnly` is the standing answer. */
  const all = ['src/main.js', 'js/weather.js', 'js/wx-ecmwf.js', 'js/data-layers.js'];
  for (const f of all) {
    const s = codeOnly(read(f));
    assert.ok(!/wx-reanalysis/.test(s), f + ' does not import it');
    assert.ok(!/IntMapReanalysis/.test(s), f + ' does not reach for the global');
    assert.ok(!/imwxre:/.test(s), f + ' does not use its protocol');
  }
  assert.ok(!/MERRA2_2m_Air_Temperature_Monthly/.test(read('js/data-layers.js')), '…nor its tiles');
  /* the documents say so too — a removal the ledger still lists is a document that has gone stale */
  assert.ok(!/^wx-reanalysis\.js/m.test(read('docs/FILES.md')), 'the file ledger no longer lists it');
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
