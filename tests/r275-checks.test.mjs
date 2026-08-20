/* ============================================================================
 *  IntMap · #R275 source checks
 * ----------------------------------------------------------------------------
 *  「地形編集・水流で地形のポップアップのUI、他の凡例やポップアップに比べて内部要素のサイズが大きすぎる。
 *    また、ツールは上部にスティックしろ。」
 *  「地形編集・水流を開くと勝手にズームするのを辞めろ。」
 *  「気象警報はまだ対応していない国は、灰色斜線で、発令されていないだけの地域は灰色に。」
 *  「今発表されている警報欄は、一国一行までにしろ。」
 *  「水流シミュレーションの解像度が低すぎる。また、一回きりの水源、再生できない。ふざけるな。
 *    一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。ふざけるな。」
 *  「警報レイヤー、日本以外でも区分単位、発令単位ごとに色分けしろ。…対応国も増やせ。更新が遅すぎる。
 *    リアルタイムにと言っている。ソースは一国一ソース。…GDACSを完全に撤廃しろ。また、押した地点の
 *    警報情報が別ポップアップで出るようにしろ。」
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT A PROPERTY, NOT ABOUT A NUMBER OR A CALL SITE. Twelve consecutive
 *  rounds have had a previous round's test pin a literal and turn a correct change into a false
 *  regression — this round fixed nine of them. So: the panel's scale is checked as «one declaration
 *  used everywhere», not as «30 px»; the source model as «one delivery mechanism», not as one line.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* comments are prose about the code and must never satisfy an assertion ABOUT the code — the
   「自分の検査が自分のコメントに当たる」 shape this project has paid for thirteen times (#R274). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TW = () => codeOnly(read('js/terrain-water.js'));
const WP = () => codeOnly(read('js/world-packs.js'));
const RELAY = () => codeOnly(read('supabase/functions/alerts-relay/index.ts'));

/* ── ① opening a tool is not a request to move the map ──────────────────────────────────────────
   MEASURED before the fix: js/map-ui.js's tool row calls `open(_hereLL())` — the camera's own
   centre — and open() flew to it at `zoom: max(current, 11)`. From z6 that landed the reader at
   z11, a fivefold zoom onto the point they were already looking at. */
test('R275 ① the terrain tool does not zoom the camera onto a point that is already in view', () => {
  const s = TW();
  assert.ok(!/zoom:Math\.max\(GE\(\)\.camera\.getZoom\(\),\s*\d+\)/.test(s),
    'nothing may impose a minimum zoom when the tool opens');
  assert.match(s, /const b=GE\(\)\.camera\.getBounds\(\);\s*\n\s*seen=/,
    'whether the point is on screen is MEASURED against the current view');
  assert.match(s, /if\(!seen\)\{ try\{ GE\(\)\.camera\.flyTo\(\{center:ctr,duration:600\}\);/,
    'the camera moves only for a point the reader cannot see, and its zoom is left alone');
  assert.match(s, /build\(ctr\?\{center:ctr\}:undefined\)/,
    'the working rectangle is aimed at the point instead of the camera being flown to it');
});

/* ── ② the elevation level follows the working rectangle, not the camera ────────────────────────
   MEASURED at camera z6 over the Kōfu basin: rectangle 47.2 km, grid cell 92 m, DEM level z10 —
   a 124 m sample under an 89 m grid. From the rectangle the same call gives z13 = 15.5 m. */
test('R275 ② the DEM level is chosen for the rectangle the solver runs on', () => {
  const s = TW();
  assert.match(s, /const viewKm=Math\.max\(/, 'the camera span has its own name…');
  assert.match(s, /if\(viewKm>MAXKM\)\{/, '…and is what the cap is applied to');
  assert.match(s, /const spanKm=Math\.min\(viewKm,MAXKM\);/,
    'and the span everything downstream sizes itself by is the CAPPED one');
  const i = s.indexOf('const spanKm=Math.min(viewKm,MAXKM);');
  assert.ok(i > 0);
  const after = s.slice(i);
  assert.match(after, /_demZoomForSpan\(Math\.max\(1,spanKm\)\)/, 'the DEM level reads it');
  assert.match(after, /nn=spanKm\/tk\+1/, '…and so does the tile budget');
  /* the two must be the same quantity, or one of them is sizing itself to a different rectangle */
  assert.ok(!/_demZoomForSpan\(Math\.max\(1,viewKm\)\)/.test(s), 'neither may use the camera span');
});

/* ── ③ one source, one difference ───────────────────────────────────────────────────────────────
   「一回きりと継続の差は、水が継続的に発生し続けるか否かしかないようにするべき。」 MEASURED before the
   fix: a one-shot volume was placed by `pool()` as a still lake, so `simMoving()` was false the
   instant it existed, `canPour()` said no, and ↺ left the run frozen with ▶ disabled for ever. */
test('R275 ③ a one-shot source is a tap with a bottom, and nothing else differs', () => {
  const s = TW();
  assert.match(s, /const srcCap=\(x\)=>\(x&&x\.cont\?Infinity:/, 'the kind is a bound on the total');
  assert.match(s, /const owed=\(x\)=>Math\.max\(0,srcCap\(x\)-/, '…and what is left is the only gate');
  assert.match(s, /function canPour\(\)\{ return !!\(owedAny\(\)\|\|simMoving\(\)\); \}/,
    '▶ is live whenever a source still owes water — which is what made ↺ useless before');
  /* both kinds go in through ONE call, so the physics cannot differ */
  const taps = /function feedTaps\(dt\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(taps, 'feedTaps must exist');
  assert.ok(!/sc\.cont/.test(taps[1]), 'feedTaps must not branch on the kind of source');
  assert.match(taps[1], /S\.addVolume\(\[c\.j\*B\.NX\+c\.i\],give\);/, 'one delivery, one call');
  /* and the one that made a one-shot un-runnable is gone from the source path */
  const feed = /function feedSim\(\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(feed, 'feedSim must exist');
  assert.ok(!/S\.pool\(/.test(feed[1]), 'a placed volume is no longer poured in as a finished lake');
  assert.ok(!/sources\.forEach/.test(feed[1]), 'feedSim is rainfall and nothing else');
  /* ⏭ has to keep feeding, or the resting state is the state of half the water */
  assert.match(s, /onStep:feedTaps/, 'the settle run feeds the taps too');
  assert.match(codeOnly(read('js/water-dynamics.js')), /const onStep=\(typeof opt\.onStep==='function'\)\?opt\.onStep:null;/,
    '…and the solver accepts the hook');
});

/* ── ④ the panel is sized like the legends it sits beside ───────────────────────────────────────
   MEASURED against `#data-legend-wpalerts` on the built page: legend title 11 px / body 10.5 px /
   rows 13–16 px, this panel 13 / 12 / 44. */
test('R275 ④ the terrain panel’s scale is one declaration, and it is the legends’ scale', () => {
  const s = read('js/terrain-water.js');
  for (const k of ['TW_FS', 'TW_FS_S', 'TW_FS_H', 'TW_ROW', 'TW_CTL', 'TW_IN', 'TW_PAD', 'TW_GAP', 'TW_INSET'])
    assert.match(s, new RegExp('const ' + k + '=|,\\s*' + k + '='), `${k} must be declared once`);
  const px = (k) => {
    const m = new RegExp('const ' + k + "=_mob\\(\\)\\?'?(\\d+(?:\\.\\d+)?)px'?:'?(\\d+(?:\\.\\d+)?)px'?").exec(s);
    assert.ok(m, k + ' must state both device classes');
    return { mob: +m[1], desk: +m[2] };
  };
  const fs = px('TW_FS'), row = px('TW_ROW'), ctl = px('TW_CTL');
  /* the desktop scale is the legends' — 11 px text, and a row that is not three times theirs */
  assert.ok(fs.desk <= 11, `desktop body type is legend-sized (${fs.desk} px)`);
  assert.ok(row.desk <= 32, `a desktop row is legend-sized (${row.desk} px)`);
  /* …and a phone still gets a thumb-sized row, because that is a different rule book */
  assert.ok(row.mob >= 44, `a phone row is a touch target (${row.mob} px)`);
  assert.ok(ctl.mob >= 36 && ctl.desk >= 26, 'a control is still pressable on both');
  /* one gap and one inset, used by every box in the column */
  assert.ok((s.match(/'\+TW_INSET\+'px/g) || []).length >= 3, 'the inset is shared, not repeated as a number');
});

/* ── ⑤ 「ツールは上部にスティックしろ。」 ─────────────────────────────────────────────────────────
   #R245's lesson: a pinned pane is DOM parentage, not CSS — `position:sticky` inside the scroller
   is a no-op, and one unbalanced `</div>` is what broke the pinned footer that round. */
test('R275 ⑤ the tool picker is a pinned pane, a sibling of the scroller', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /<div class="tw-tools"/, 'the tool block has its own pane');
  const html = s.slice(s.indexOf('panel.innerHTML='), s.indexOf("panel.querySelector('.tw-close')"));
  const iTools = html.indexOf('class="tw-tools"');
  const iBody = html.indexOf('class="tw-body"');
  const iFoot = html.indexOf('class="tw-foot"');
  assert.ok(iTools > 0 && iBody > iTools && iFoot > iBody,
    'head · tools · body · foot, in that order');
  /* the picker is IN the pinned pane, not in the scroller */
  const tools = html.slice(iTools, iBody);
  assert.match(tools, /class="tw-segwrap tw-modes"/, 'the mode picker is inside the pinned pane');
  assert.ok(!/class="tw-segwrap tw-modes"/.test(html.slice(iBody)), '…and not also in the scroller');
  assert.match(tools, /flex:0 0 auto/, 'a pinned pane does not scroll');
  /* the measured scrollbar width has to reach it, or the column has two right edges (#R271) */
  assert.match(codeOnly(s), /\['\.tw-head','\.tw-tools','\.tw-foot'\]/,
    'the scrollbar width is given to every pane that does not scroll');
});

/* ── ⑥ 「今発表されている警報欄は、一国一行までにしろ。」 ──────────────────────────────────────────
   MEASURED before the fix, fourteen visible rows: five were China, four Italy, two Australia. */
test('R275 ⑥ the what-is-in-force list is one row per country', () => {
  const s = WP();
  const fn = /function hotList\(\)\{([\s\S]*?)\n      function sourceList/.exec(s);
  assert.ok(fn, 'hotList must exist');
  assert.match(fn[1], /by\.set\(p\.iso,g\)/, 'the key is the country and nothing else');
  assert.ok(!/const key=p\.iso/.test(fn[1]), 'no composite key may reintroduce a row per hazard');
  assert.match(fn[1], /kinds:new Map\(\)/, 'the hazards are collected onto that one row');
  /* the rank printed on the row must be the rank OF the row — the old list captioned a CMA yellow
     「Red (I)」 because it took the whole country's worst level and put it beside one hazard */
  assert.match(fn[1], /if\(p\.norm>g\.norm\)\{ g\.norm=p\.norm; g\.lv=p\.lv; \}/,
    'the row carries the country’s own worst rank');
  assert.match(fn[1], /ks\.slice\(0,KN\)/, 'and the hazards that do not fit are counted, not dropped');
});

/* ── ⑦ 「押した地点の警報情報が別ポップアップで出るようにしろ。」 ───────────────────────────────── */
test('R275 ⑦ a tap answers about the point, in a card of its own', () => {
  const s = WP();
  assert.match(s, /function ptInGeom\(lng,lat,g\)\{/, 'the hit test is geometric');
  assert.match(s, /function alertsAt\(lng,lat\)\{/, '…over the features that are actually drawn');
  assert.match(s, /el\.className='country-popup'; el\.id='wpa-point';/,
    'the card is the app’s own detail shell, not a bespoke box');
  assert.match(s, /class="country-popup-close wpa-x"/, '…and its own close button (#R261)');
  /* #R255: that shell is position:absolute with no left/top — an unplaced one lands off-page */
  assert.match(s, /el\.style\.left=Math\.round\(Math\.max\(12,left\)\)\+'px';/, 'it is placed explicitly');
  /* the legend must keep the overview a tap used to destroy */
  /* ⚠ FIVE FAMILIES IN THIS FILE INSTALL A `mapClick` HANDLER, so the pattern has to name the one
     under test rather than the first one in the file — the alerts handler is the one that opens the
     point card, and asserting against the trade layer's handler would be an assertion about
     nothing. (This test caught exactly that on its own first run.) */
  const iC = s.indexOf('openPointCard(lng,lat,c)');
  assert.ok(iC > 0, 'the alerts tap must open the point card');
  const iH = s.lastIndexOf('mapClick(', iC);
  assert.ok(iH > 0 && iC - iH < 900, 'and it must be the mapClick handler that does it');
  const click = [null, s.slice(iH, s.indexOf('return true; });', iC) + 16)];
  assert.match(click[1], /openPointCard\(lng,lat,c\)/, 'the tap opens the point card');
  /* ⚠ THE PROPERTY IS «A TAP DOES NOT TAKE THE OVERVIEW AWAY», not «legendFor is never named here»:
     the card carries a button that opens the country list, and re-rendering the card after a late
     fetch has to re-wire it. So every `panel.open` inside the handler must belong to that button. */
  for (const m of click[1].matchAll(/panel\.open\(/g)) {
    const before = click[1].slice(Math.max(0, m.index - 70), m.index);
    assert.match(before, /mb\.onclick=\(\)=>\{ $/,
      'a tap may only open the country legend from the card’s own button');
  }
  /* …but the country list is still reachable, from the card */
  assert.match(s, /mb\.onclick=\(\)=>\{ panel\.open\('<div class="wp-a-body">'\+legendFor\(/,
    'the country legend is one button away');
  assert.match(s, /at:\(lng,lat\)=>alertsAt\(/, 'and the same answer is a call, for Atlas and for a test');
});

/* ── ⑧ a green MeteoAlarm row is not a warning ─────────────────────────────────────────────────
   MEASURED live: Italy publishes 474 warnings, 201 of them 「Green Thunderstorm Warning」 (awareness
   level 1 = nothing required), and Belgium's ENTIRE feed is green — ten regions this map was
   painting as warned. Austria puts no colour in its event text at all, so the event string is not
   a substitute for the parameter. */
test('R275 ⑧ the relay reads MeteoAlarm’s awareness level, and level 1 is not in force', () => {
  const t = RELAY();
  assert.match(t, /function awarenessOf\(info\)\s*\{/, 'the level is read from the parameter');
  assert.match(t, /String\(\(x && x\.valueName\) \|\| ""\)\.toLowerCase\(\) === "awareness_level"/,
    '…by its published name, not by parsing the event text');
  assert.match(t, /if \(aw === 1\) \{ green\+\+; continue; \}/, 'green is dropped');
  assert.match(t, /const tier = aw \? Math\.max\(1, aw - 1\) : \(SEV\[String\(pick\.severity\)\] \|\| 1\)/,
    'and 2–4 become the CAP ladder, with severity as the fallback for a feed without the parameter');
  assert.match(t, /areaTotal: areaMap\.size, green \}/, 'what was dropped is reported, never silent');
});

/* ── ⑨ 「対応国も増やせ。ソースは一国一ソース。」 ─────────────────────────────────────────────────
   MEASURED: 206 countries hatched before, 112 after — the WMO's register wires ninety-three more,
   each from its own national service. */
test('R275 ⑨ the WMO register is wired, one source per country, and it is not GDACS', () => {
  const s = WP(), t = RELAY();
  assert.match(t, /h === "severeweather\.wmo\.int"/, 'the host is allow-listed structurally');
  assert.match(t, /function summariseSWIC\(raw, mid\)\s*\{/, 'each member is summarised like the others');
  assert.match(t, /encodeURIComponent\("event,areadesc,sent,mem,s,expires,capurl,wkb_geometry"\)/,
    'the geometry column is NAMED — leaving it out returns every feature with a null shape');
  assert.match(t, /function summariseSWICScan\(raw\)\s*\{/, 'and one geometry-free call finds who has anything');
  /* one source per country: a member is only asked for if nothing else covers it */
  assert.match(s, /Object\.keys\(swicMeta\.mid\)\.forEach\(c=>\{ if\(!FEEDS\[c\]&&swicMeta\.status\[c\]===1\) FEEDS\[c\]='swic'; \}\);/,
    'a member with another feed is never given this one');
  assert.match(s, /const swicISO=\(\)=>Object\.keys\(swicMeta\.mid\)\.filter\(c=>FEEDS\[c\]==='swic'\);/,
    '…and only the members the WMO records as CAP-Completed are claimed as covered');
  /* the reader is told whose warning it is */
  assert.match(s, /function agencyFor\(feed,iso3\)\{/, 'the author is named per country');
  assert.match(s, /swicMeta\.dept\[iso3\]/, '…from the member’s own service name');
  /* GDACS stays gone (#R273) */
  assert.ok(!/gdacs/i.test(s), 'GDACS is not back');
});

/* ── ⑩ 「更新が遅すぎる。リアルタイムにと言っている。」 ────────────────────────────────────────────
   MEASURED before the fix, layer on, refresh() driven 80 times over eight minutes: MeteoAlarm made
   THREE requests in total and then none at all. `maAsked.filter(k=>!maData[k]).concat(maNext())`
   excludes a country the moment it arrives, in BOTH halves — it was a first-load queue, and nothing
   ever turned it into a refresh cycle. */
test('R275 ⑩ every feed is on a rotation, and none of them is a first-load queue', () => {
  const s = WP();
  const fn = /function maNext\(n\)\{([\s\S]*?)\n        return take; \}/.exec(s);
  assert.ok(fn, 'maNext must exist');
  assert.match(fn[1], /const byAge=fresh\.sort\(\(a,b\)=>\(maAt\[a\]\|\|0\)-\(maAt\[b\]\|\|0\)\);/,
    'the next batch is the countries read longest ago');
  assert.match(fn[1], /const cold=all\.filter\(k=>!maData\[k\]\)/, '…with the never-read ones first');
  assert.ok(!/maAsked\.filter\(k=>!maData\[k\]\)\.concat\(maNext\(\)\)/.test(s),
    'the queue that excluded a country the moment it arrived is gone');
  assert.match(s, /maAt\[k\]=Date\.now\(\)/, 'and every read stamps its own clock');
  assert.match(s, /function swicNext\(n\)\{/, 'the register rotates the same way');
  /* the number that proves it: the age of the country read longest ago is reported */
  assert.match(s, /maOldestS:\(function\(\)\{/, 'the oldest country’s age is an instrument, not an assumption');
  assert.match(s, /oldestS:\(function\(\)\{/, '…and the register has one too');
});

/* ── ⑪ grey is a statement, so it has to have been checked ──────────────────────────────────── */
test('R275 ⑪ a country is only painted «nothing in force» once its service has been read', () => {
  const s = WP();
  assert.match(s, /function readState\(c\)\{ const f=FEEDS\[c\];/, 'what is known per country has a name');
  assert.match(s, /if\(readState\(c\)==='loading'\) return 0;/,
    'a wired but unread country is hatched, not washed with the 「発表なし」 grey');
  /* the three states are still three appearances (#R273) */
  assert.match(s, /1,'rgba\(200,200,203,0\.42\)'/, 'read and quiet is grey');
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, 'and nothing-to-say is hatched');
  /* the hatch now covers two different reasons, and the tap says which */
  assert.match(s, /L\('Not read yet','未取得'/, 'the tap distinguishes them in words');
  assert.match(s, /unread:\(function\(\)\{/, 'and the count is an instrument that must reach zero');
});

/* ── ⑫ the build marks name this round ──────────────────────────────────────────────────────── */
test('R275 ⑫ both build markers name a round no older than R275', () => {
  /* ⚠ THE TWO STAMPS, NOT EVERY «R###» IN THE FILE — index.html is full of round tags in comments,
     and a pattern that takes them all is measuring the prose. */
  const html = read('index.html');
  const marks = [
    /window\.__imBuild='R(\d{3})'/.exec(html),
    /window\.INTMAP_BUILD='[\d-]+-R(\d{3})'/.exec(html),
  ];
  assert.ok(marks.every(Boolean), 'index.html must carry both build stamps');
  for (const m of marks) assert.ok(+m[1] >= 275, `a build stamp still says R${m[1]}`);
  assert.equal(marks[0][1], marks[1][1], 'and both must name the same round (#R174)');
});
