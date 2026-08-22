/* ============================================================================
 *  IntMap · #R305 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION a report named, not a number this round happened to pick.
 *
 *    · 「警報レイヤー、何も発令されていないのに、灰色に塗られていない場所がある。」
 *      MEASURED on the built page by sampling the rendered layers point by point — for each sample,
 *      which of `wp-alert-fill` (warned / quiet), `wp-alert-choro` (the country-wide sheet) and
 *      `wp-alert-hatch` actually covers it — with BOTH versions of the module put through the same
 *      camera, canvas and sample grid:
 *          z2, 7,154 samples · 3,404 of them on land under this layer
 *              before  **759 painted by NOTHING (22.3 %)** — Canada 386 · China 186 · USA 101 · Brazil 58
 *              after   **217 (6.4 %)**                      — Canada 206 · China   4 · USA   0 · Brazil  0
 *          z5 over central Europe, 3,213 samples → 73 (2.7 %), Switzerland 25 of them
 *      Two causes, and they are opposite ends of the same rule:
 *        ① `washTier` returned 2 (= 「the unit layer is painting this country」) for any country that
 *           was DRAWING something, and below `QUIET_UNIT_Z` the unit layer paints nothing at all.
 *        ② a warning SMALLER than one of this map's units threw that unit's grey away whole, so the
 *           part of the unit with nothing in force was painted by nobody.
 *      The residual is one country: the ECCC issues on its OWN forecast-region polygons, which nest
 *      inside no boundary set this map holds for Canada (13 provinces against 112 warnings).
 *      No new overlap of colour on grey is introduced by any of it.
 *
 *    · 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」 (2回目)
 *      Both of the reads this module starts on its own went down the SAME FIFO queue as the read the
 *      reader was waiting for, and at world zoom both of them ask for the planet; the warm-up asked
 *      for the hour AHEAD whichever way the reader was going. Those are defects and they are fixed.
 *      ⚠⚠⚠ AND IT DID NOT MAKE THE STEP FASTER, MEASURED. The 7,050 / 7,942 / 8,270 → 1,501 / 684 /
 *      1,665 ms this round first recorded was the browser's HTTP CACHE: the same origin had already
 *      fetched those `.om` byte ranges. Re-run with hours never visited by either build:
 *          before  6,849 / 6,357 / 6,858 ms      after  6,699 / 6,779 / 6,784 ms
 *      A cold step is dominated by ~6.5 s of ranged reads and the queue order does not move it.
 *      So what is pinned below is the SHAPE of the read path, never a speed.
 *
 *    · 「地点を選ばないといけない系のツール…いや並行してどちらも出てくるとかあほか。」
 *      #R302 added the app's red toast and left #R298's shared bar armed, so one press of one row
 *      put the same sentence on screen twice at the same moment.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-five times; ask the question of the text that RUNS. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => noComments(read('js/world-packs.js'));
/* ══ ⚠⚠⚠ (#R307) A WINDOW COUNTED IN CHARACTERS IS A TIMER ON THE NEXT ROUND ═══════════════════
   Two of the checks below used `[\s\S]{0,600}` / `{0,1600}` to mean 「inside this function」, and both
   went red the moment #R307 added lines to `quietGeomFor` and `warnMeeting` — for changes that make
   the very thing they assert MORE true. It is #R306's own ⑥ (a {0,600} window whose body is 604
   bytes with LF and 615 with CRLF, so CI was green and Windows red) with a different trigger.
   → ask the FUNCTION BODY, brace-balanced. The claims are unchanged; what is gone is the distance. */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
const WX = () => noComments(read('js/weather.js'));
const EC = () => noComments(read('js/wx-ecmwf.js'));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「何も発令されていないのに、灰色に塗られていない場所がある。」
 * ==========================================================================================*/

/* ── ① the country sheet steps aside, and something must actually take its place ──────────────
   ⚠ THE FIX IS NOT IN `washTier`. `drawnISO[c]` takes the country-wide sheet away from a country
   that is drawing warnings (#R270 ⑧ / #R299 ②, and both are right); `quietSet[c]` is what puts the
   per-unit grey in its place. The defect was that below `QUIET_UNIT_Z` the second one was empty by
   design, so the first arm handed the ground to nobody. Both arms stay; ② is the fix. */
test('R305 ① the country sheet steps aside only where something replaces it', () => {
  const s = WP();
  assert.match(s, /return \(quietSet\[c\]\|\|drawnISO\[c\]\)\?2:1; \}/,
    'a country that is drawing is never washed whole, and one whose units are drawn is not either');
  /* and the wash for what could not be placed is still only for a country drawing nothing */
  assert.match(s, /if\(u&&!drawnISO\[c\]\) return 10\+Math\.min\(4,u\);/,
    "#R273's rule stands: the rank wash is for a country whose units are not on the map at all");
  /* the arm that has to take over is the unit layer, and ② is what makes it run at every zoom */
  assert.match(s, /function refreshQuietSet\(\)\{ quietList=quietISOs\(\);/,
    'quietSet is filled from quietISOs — the set ② removes the floor from');
});

/* ── ② …and what replaces it has no zoom floor for a country with something in force ─────────
   `QUIET_UNIT_Z` is a statement about DISTINCTIONS (a Landkreis is a fraction of a pixel at world
   zoom). It became a statement about whether the ground gets painted at all the moment ① made the
   country sheet stand down for a warned country. */
test('R305 ② a warned country is drawn by unit at every zoom', () => {
  const s = WP();
  assert.match(s, /function warnedISOs\(\)\{[\s\S]{0,320}?\(\+q\.norm\|\|0\)>0\) s\[q\.iso\]=1;/,
    'the set of countries with anything in force is read from `feats` itself');
  const qi = /function quietISOs\(\)\{[\s\S]{0,700}?return out\.sort\(\); \}/.exec(s);
  assert.ok(qi, 'quietISOs must be findable');
  assert.match(qi[0], /if\(!\(z>=QUIET_UNIT_Z\|\|warned\[iso\]\)\) return;/,
    'the floor applies to a quiet country and not to a warned one');
  assert.ok(!/if\(!\(z>=QUIET_UNIT_Z\)\) return out;/.test(qi[0]),
    'the whole function must not bail out below the floor any more');
  /* the units have to be ASKED for at that zoom too, or the set above is always empty */
  const ask = /function askUnitsInView\(\)\{[\s\S]{0,900}?upgradeUnitsInView\(\); \}/.exec(s);
  assert.ok(ask, 'askUnitsInView must be findable');
  assert.match(ask[0], /if\(lowZ&&!warned\[c\]\) return;/,
    'a warned country is asked for its units below the floor as well');
});

/* ── ③ the published set and the asked-for set are bounded by the SAME box ───────────────────
   `quietISOs` pads the view by half a screen; `askUnitsInView` used the bare bounds, so a country
   in that padding was published as quiet if its units happened to exist and never asked for them
   otherwise. */
test('R305 ③ one padded view box answers both questions', () => {
  const s = WP();
  assert.match(s, /function paddedView\(\)\{[\s\S]{0,320}?w\*0\.5[\s\S]{0,200}?h\*0\.5/,
    'the padded box is one function');
  assert.match(s, /function quietISOs\(\)\{[\s\S]{0,400}?const vb=paddedView\(\);/,
    'the published set uses it');
  assert.match(s, /function askUnitsInView\(\)\{[\s\S]{0,600}?const vb=paddedView\(\);/,
    '…and so does the set that is asked for');
});

/* ── ④ a warning smaller than a unit becomes a HOLE in that unit, not the end of it ──────────
   ⚠ THE TWO DIRECTIONS ARE DIFFERENT QUESTIONS. 「the unit's centre is inside a warning」 does not
   mean 「the warning covers the unit」 — measured, that is how Sichuan lost Aba and Ganzi, two
   prefectures the size of a small country, to a county-level warning inside them. */
test('R305 ④ the quiet grey is cut, not dropped, where the warning is the smaller shape', () => {
  const s = WP();
  assert.match(s, /function warnMeeting\(iso,g\)\{/, 'the two directions are answered together');
  assert.match(s, /if\(_bbInside\(ub,bb\)\)\{ covering=true; break; \}/,
    'only a warning at least as big as the unit COVERS it');
  assert.match(s, /function punchQuiet\(g,warns\)\{/, 'the smaller ones are punched out');
  const q = fnBody(s, 'quietGeomFor');
  assert.match(q, /if\(sameOutline\(iso,g\)\)\{ _qDropped\+\+; return null; \}/,
    'a unit that IS the warning is still dropped whole (#R299)');
  assert.match(q, /const cut=punchQuiet\(g,ins\);/, 'and a warning that fits inside a unit is punched out of it');
  assert.match(q, /_qNoPunch\+\+; _qDropped\+\+; return null; \}/,
    'a warning that will not fit inside the unit falls back to dropping it');
  /* ⚠ (#R307) …and that whole path is now the FALLBACK: the exact difference answers first, and it
     answers this case too. What this test protects — 「a warning smaller than a unit does not take
     the unit with it」 — is what got stronger, so it is asserted of the first answer as well. */
  assert.ok(q.indexOf('subtractWarnings(') < q.indexOf('punchQuiet('),
    'the exact difference is asked before the punch');
});

/* ── ⑤ MapLibre decides 「ring or hole」 by WINDING ──────────────────────────────────────────
   `classifyRings` starts a NEW polygon whenever a ring's signed area has the same sign as the first
   one's. A hole ring copied in with its source's own winding would therefore be FILLED — the double
   coat #R298 removed, in the one place it would be hardest to see. */
test('R305 ⑤ a punched ring is wound against its outer ring', () => {
  const s = WP();
  assert.match(s, /function ringArea2\(r\)\{/, 'the signed area of a ring is measured');
  assert.match(s, /const oA=ringArea2\(out\[put\]\[0\]\), hA=ringArea2\(ring\);/,
    'both rings are measured, not assumed');
  assert.match(s, /out\[put\]\.push\(\(\(oA>0\)===\(hA>0\)\)\?ring\.slice\(\)\.reverse\(\):ring\);/,
    'the hole is reversed when it agrees with the outer ring');
  /* and it may only be a hole in a polygon it is actually inside */
  assert.match(s, /if\(put<0\) return null;/, 'a ring that fits no polygon of the unit is not punched');
  assert.match(s, /function ringInside\(r,outer\)\{[\s\S]{0,300}?if\(!ptInRing\(r\[i\],outer\)\) return false;/,
    'containment is tested against the outer ring, with no tolerance');
});

/* ── ⑥ the two halves of 「no overlap, and no hole either」 are counted ────────────────────────
   A count that cannot report a shortfall is not a count (#R302 ⑰). */
test('R305 ⑥ the instrument says how many units were cut and how many were dropped', () => {
  const s = WP();
  assert.match(s, /quietPunched:/, 'how many units kept their grey with the warned part cut out');
  assert.match(s, /quietSuppressed:/, 'how many had to be dropped whole');
  assert.match(s, /quietNoPunch:/, '…and how many of those were dropped because the cut would not fit');
  assert.match(s, /quietUnitISOs:/, 'and which countries the unit grey is being drawn for');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」
 * ==========================================================================================*/

/* ── ⑦ one reader, one at a time — and the reader's own request goes first ───────────────────
   The single chain was right about the SDK's shared `omFileReader` and silently also FIFO. Two
   background readers (the widening staircase, the warm-up of the next hour) shared it with the read
   a person was waiting for. */
test('R305 ⑦ the read queue has a lane for the reader and a lane for this module', () => {
  const s = EC();
  assert.match(s, /var qHi = \[\], qLo = \[\], pumping = false;/, 'two lanes, one pump');
  assert.match(s, /function serial\(fn, bg\) \{[\s\S]{0,240}?\(bg \? qLo : qHi\)\.push/,
    'a background read goes in the low lane');
  assert.match(s, /var job = qHi\.shift\(\) \|\| qLo\.shift\(\);/,
    'and the foreground lane is drained first');
  /* the reader's own read is still one-at-a-time — two different FILES corrupt the shared reader */
  assert.match(s, /pumping = true;[\s\S]{0,200}?pumping = false; _pump\(\);/,
    'only one job runs at a time');
  assert.ok(!/var chain = Promise\.resolve\(\);/.test(s), 'the single FIFO chain is gone');
});

/* ── ⑧ …and the two reads this module starts on its own are IN that lane ─────────────────────*/
test('R305 ⑧ the warm-up and the widening rung are background reads', () => {
  const s = EC();
  assert.match(s, /function load\(variable, i, bounds, bg\) \{/, 'load carries the flag');
  assert.match(s, /\}, !!bg\)\.catch\(function \(\) \{ return null; \}\);/, '…and passes it to the queue');
  assert.match(s, /\}, true\)\.catch\(function \(\) \{ delete warmed\[mark\]; \}\);/,
    'the next-hour warm-up is background');
  const wx = WX();
  assert.match(wx, /EC\(\)\.load\(VAR,null,want,true\)\.then\(f=>\{ widening=false;/,
    'a widening rung is background');
  /* the read the reader is waiting for is NOT */
  assert.match(wx, /return EC\(\)\.load\(VAR,null,b\);/, "…and the step's own read is not");
});

/* ── ⑨ the hour that is warmed is warmed at the band the step will actually read ─────────────
   #R290 追記2 wrote the rule and spelled it `band()`, which is `bandFor` — and `bandFor` answers
   NULL (「the planet」) for the view this app opens on. */
test('R305 ⑨ the warm-up asks for the band, not the planet', () => {
  const s = WX();
  assert.match(s, /EC\(\)\.prefetch\(\['wind_u_component_10m','wind_v_component_10m'\],nx,nearBand\(\)\|\|band\(\)\)/,
    'the warm-up band is the one a future hour will be read at');
  assert.ok(!/prefetch\(\['wind_u_component_10m','wind_v_component_10m'\],Math\.min\(EC\(\)\.count\(\)-1,EC\(\)\.index\(\)\+1\),band\(\)\)/.test(s),
    'and never `band()` alone, which is the planet at world zoom');
});

/* ── ⑩ the hour that is warmed is the one the reader is heading TOWARDS ──────────────────────*/
test('R305 ⑩ the warm-up follows the direction of travel', () => {
  const s = WX();
  assert.match(s, /let _lastIdx=-1, _stepDir=1;/, 'the axis has two directions and one default');
  assert.match(s, /if\(_lastIdx>=0&&i!==_lastIdx\) _stepDir=\(i>_lastIdx\)\?1:-1;/,
    'the direction is measured from the axis, not assumed');
  assert.match(s, /const n=EC\(\)\.count\(\), nx=Math\.max\(0,Math\.min\(n-1,EC\(\)\.index\(\)\+_stepDir\)\);/,
    'the warmed hour is the neighbour in that direction, inside the axis');
  assert.match(s, /if\(nx!==EC\(\)\.index\(\)\)/, 'and the end of the axis warms nothing');
});

/* ── ⑪ 「still」 includes the arrival, and the planet costs a longer wait than a band ─────────
   A read that takes 2.4 s had already been 「still」 for 1.5 s by the time it answered, so the
   staircase started its next rung the instant the reader could see the picture they asked for. */
test('R305 ⑪ the quiet window restarts when the field lands', () => {
  const s = WX();
  assert.match(s, /const STILL_MS=900, BIG_STILL_MS=2500;/, 'two windows, one for a rung that reads the planet');
  /* ⚠ the comment that says so is stripped before this runs — ask the code. `stir` stamps the same
     clock, so the line is identified by what it follows: the read that has just succeeded. */
  assert.match(s, /failN=0; if\(retryT\)\{ clearTimeout\(retryT\); retryT=0; \}\s*\n\s*stillAt=Date\.now\(\);/,
    'a landed field restarts the window');
  assert.match(s, /const need=\(want===null\)\?BIG_STILL_MS:STILL_MS;/,
    'a rung that is the planet waits the longer window');
  assert.match(s, /const rest=moving\?need:\(need-\(Date\.now\(\)-stillAt\)\);/,
    '…and the wait is measured against the same clock as before');
  /* the rung is chosen BEFORE the wait, or its size could not choose the window */
  assert.match(s, /const want=wideStep\(have,full\);\s*\n\s*const need=/,
    'the rung is decided first and the window follows from it');
});

/* ── ⑫ the hosts the wind layer needs are resolved before it is switched on ──────────────────*/
test('R305 ⑫ the tile SDK and the archive get a name resolution hint', () => {
  const h = read('index.html');
  assert.match(h, /<link rel="dns-prefetch" href="https:\/\/unpkg\.com">/, 'the SDK host');
  assert.match(h, /<link rel="dns-prefetch" href="https:\/\/map-tiles\.open-meteo\.com">/, 'the archive host');
  /* ⚠ a HINT, not a preload — the first view uses neither, which is the rule the block states */
  assert.ok(!/rel="preload"[^>]*unpkg\.com/.test(h), 'nothing is downloaded for a layer nobody switched on');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「地点を選ばないといけない系のツール…いや並行してどちらも出てくるとかあほか。」
 * ==========================================================================================*/

/* ── ⑬ one gesture says its sentence once ───────────────────────────────────────────────────*/
test('R305 ⑬ the shared bar can arm without speaking', () => {
  const s = noComments(read('js/map-pick.js'));
  assert.match(s, /if\(o\.announce!==false\)\{/, 'the banner is optional');
  assert.match(s, /\} else if\(bar\) bar\.style\.display='none';/,
    'and a silent arm takes down a banner an earlier gesture left up');
  /* everything the gesture IS stays on both paths */
  assert.match(s, /if\(panel&&o\.hidePanel!==false\)\{ s\.prevStyle=_ghost\(panel\); s\.hid=true; \}/,
    'the panel is still ghosted (#R207/#R219)');
  assert.match(s, /GE\(\)\.render\.canvas\(\)\.style\.cursor='crosshair';/, 'the crosshair is still set');
  assert.match(s, /document\.addEventListener\('keydown',s\.esc,true\);/, 'Esc still cancels');
});

/* ── ⑭ …and the tools list is the caller that has its own voice ──────────────────────────────
   ⚠ THE RED MESSAGE IS THE ONE THE READER ASKED FOR — 「普通の既存の赤メッセージ使ってください」 — so
   it is the bar that goes quiet here, not the toast. */
test('R305 ⑭ a tool row asks with the red toast and nothing else', () => {
  const s = noComments(read('js/map-ui.js'));
  const ap = /function _askPoint\(run,id\)\{[\s\S]{0,2600}?\n    \}/.exec(s);
  assert.ok(ap, '_askPoint must be findable');
  assert.match(ap[0], /P\.start\(\{ onPick:\(ll\)=>end\(ll\), onCancel:\(\)=>end\(null\), hint:ask, announce:false \}\)/,
    'the shared bar is armed silently');
  assert.match(ap[0], /\(HOST\.imToast\|\|HOST\.satToast\)\(ask\);/,
    "…and the app's own red toast is what says it (#R302)");
  /* one sentence object, so nine languages cannot drift apart */
  assert.match(ap[0], /const ask=\(name\?\(name\+' — '\):''\)\+T\(/, 'the bar and the toast share one string');
});

/* ── ⑮ the sun panel speaks in its own status line, once ─────────────────────────────────────*/
test('R305 ⑮ the sun panel does not say it twice either', () => {
  const s = noComments(read('js/sims.js'));
  const ask = /function askSite\(\)\{[\s\S]{0,700}?catch\(_\)\{ return false; \} \}/.exec(s);
  assert.ok(ask, 'askSite must be findable');
  assert.match(ask[0], /engSay\(_pickMsg\(\)\);/, 'the panel line is where the sentence goes');
  assert.match(ask[0], /announce:false/, 'and the bar is armed silently');
  /* the callers must not print it a second time on top of askSite's own line */
  assert.ok(!/engSay\(_pickMsg\(\)\); askSite\(\);/.test(s),
    'no caller repeats the sentence before calling askSite');
  /* …and the point still reaches the panel */
  assert.match(ask[0], /onPick:\(ll\)=>\{ engSay\(''\); setSite\(ll\);/,
    'answering the question clears it');
});

/* ── ⑯ the report file that is no longer in the repository is not claimed to be ──────────────
   「USGS.能登.pdf は不要なため削除してください。」 The file ledger is a statement about what is here. */
test('R305 ⑯ the deleted source PDF is gone from the tree and from the ledger', () => {
  assert.ok(!existsSync(resolve(ROOT, 'USGS.能登.pdf')), 'the file is deleted');
  const files = read('docs/FILES.md');
  assert.ok(!/USGS\.能登\.pdf/.test(files), 'and docs/FILES.md no longer lists it');
  /* ⚠ the MMI ramp it was read out of does NOT change — the numbers were taken from it in #R224 and
     they are still the numbers. What changes is only the claim that the paper is in this repo. */
  const sm = noComments(read('js/seismic.js'));
  assert.match(sm, /MMI/, 'the seismic module still carries the scale it was read into');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  #R306 追記 — 「何も発令されていないのに、灰色に塗られていない場所がある。」(same report)
 *  MEASURED on production after #R305 shipped: 275 of 3,400 land samples were still painted by
 *  nothing, and **83 of them were in Russia** — a country whose warnings this map places on ITS OWN
 *  admin-1 units. Two features out of one index cannot overlap, so neither can be a hole in the
 *  other; what put them there was `geomCentre`, the average vertex of the largest ring, landing
 *  outside its own concave subject and inside a neighbour's.
 * ==========================================================================================*/
test('R306 ⑰ a neighbour is not something inside this unit', () => {
  const s = WP();
  assert.match(s, /function unitBoxes\(iso\)\{/, 'the outlines this country holds are indexed');
  assert.match(s, /_uBoxOf\[iso\]=\{of:u,set:set\};/,
    "…once per country per publish, keyed on the unit array's own identity");
  const wm = fnBody(s, 'warnMeeting');
  assert.match(wm, /const isNeighbourUnit=\(wg\)=>\{ const k=_bboxKey\(geomBox\(wg\)\); return !!\(k&&k!==myKey&&boxes\[k\]\); \};/,
    'a warning whose outline IS one of this country’s units is that unit');
  assert.match(wm, /const add=\(wg\)=>\{ if\(wg!==g&&!isNeighbourUnit\(wg\)&&inside\.indexOf\(wg\)<0\) inside\.push\(wg\); \};/,
    '…so it is never collected as something inside this one');
  assert.match(wm, /if\(isNeighbourUnit\(bin\[i\]\)\) continue;/,
    '…and it can never COVER this one either, however big its bounding box is');
  /* ⚠ (#R307) the same exclusion has to reach the bbox candidate set, or the difference would
     subtract a neighbour from this unit — two features of one index never overlap, so it would be a
     no-op, but the cost is real and the intent should be one rule, not two. */
  assert.match(wm, /warnsNear\(rec,g,ub,isNeighbourUnit\)/, 'and the candidate set is filtered by it too');
  /* the unit that warning really belongs to is still dropped, by the test that was already there */
  assert.match(s, /function sameOutline\(iso,g\)\{/, 'the unit that IS the warning is still dropped');
});
