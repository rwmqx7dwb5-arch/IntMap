/* ============================================================================
 *  #R230 — source-level checks
 *  ① the mobile scrim is NOT PAINTED while it is shut (it blurred the whole viewport at opacity 0)
 *  ② …and it is still painted for the whole fade-out, or the fix would be visible
 *  ③ the phone's image concurrency is MapLibre's OWN default — read from MapLibre, not pinned here
 *  ④ …and it is asked of the user agent, so an iPhone in landscape does not fall out of it
 *  ⑤ the satellite prefetch runs in lanes, in BOTH the worker and the no-worker path
 *  ⑥ …and the worker is still held alive until the lanes drain
 *  ⑦ the on-device census measures the viewport intersection, skips `visibility:hidden`,
 *     and DOES NOT skip `opacity:0` — which is the state the defect lived in
 *
 *  WHY THESE EXIST. 「モバイル版がまだ劇的に遅い」, and the reader's answers closed the search space:
 *  BOTH orientations, BOTH basemaps, and 「見た目は一切落とすな」. That last one is the constraint the
 *  four previous rounds broke (#R229), so every property asserted here is one that costs the picture
 *  nothing — same tiles, same URLs, same resolution, same frosted glass.
 *  ⚠ #R229's rule is applied throughout: assert the RELATION, never this round's literal. ② and ③
 *  would both go red if someone "tidied" the values, which is the point of writing them this way.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments in this project carry the reasoning, so a check that greps them proves nothing (#R229) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* The declaration block of a rule whose selector list is EXACTLY `selector`.
   ⚠ Written this way because the loose version got it wrong on the first run, in the direction that
   makes a test lie: `.m-scrim` also appears as the last name in `.m-fab-stack, .m-sheet, .m-scrim{
   display:none; }` (the desktop rule) and again on its own in the reduced-motion block, so "a rule
   mentioning .m-scrim" is three different rules. `mustContain` picks the intended one. */
function cssRule(src, selector, mustContain) {
  const hits = [];
  /* ⚠ comments FIRST: a selector group is "everything since the last brace", so the long note above
     `.m-scrim` was being read as part of its selector and nothing matched. Same reason `code()`
     exists for the JS files. */
  const flat = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(flat))) {
    if (m[1].trim().replace(/\s+/g, ' ') !== selector) continue;
    if (mustContain && m[2].indexOf(mustContain) < 0) continue;
    hits.push(m[2]);
  }
  assert.ok(hits.length, 'CSS rule `' + selector + '`' + (mustContain ? ' containing `' + mustContain + '`' : '') + ' exists');
  return hits[0];
}

test('R230 ① the mobile scrim is not painted while it is shut', () => {
  const css = read('css/intmap.css');
  const shut = cssRule(css, '.m-scrim', 'backdrop-filter');
  const shown = cssRule(css, '.m-scrim.show', 'visibility');

  /* THE DEFECT: `display:block` + a full-viewport `backdrop-filter` + `opacity:0`. An opacity-0 box
     is still painted, so the compositor blurred 100 % of the viewport on every frame of every
     gesture, for a thing no reader has ever seen. `visibility:hidden` is not painted at all. */
  assert.match(shut, /visibility\s*:\s*hidden/,
    'the shut scrim is `visibility:hidden` — `opacity:0` alone leaves a full-viewport backdrop-filter '
    + 'being composited on every frame (the #R228 shape of defect: invisible, but drawn)');
  assert.match(shown, /visibility\s*:\s*visible/,
    'and `.show` puts it back, or opening a sheet would dim nothing');

  /* it must still BE a blur when shown — this round was not allowed to remove any frosting
     (「見た目は一切落とすな」), only to stop paying for it while it is invisible */
  assert.match(shut, /backdrop-filter\s*:\s*blur/,
    'the blur itself is untouched: the fix is when it is painted, not whether it exists');
});

test('R230 ② …and it stays painted for the whole fade-out', () => {
  const css = read('css/intmap.css');
  const shut = cssRule(css, '.m-scrim', 'backdrop-filter');
  const shown = cssRule(css, '.m-scrim.show', 'visibility');

  /* `visibility` is not an animatable value, so it flips at its DELAY. Shut must delay it by the
     full opacity duration (or the scrim vanishes instead of fading); shown must not delay it at all
     (or the fade-in starts on an unpainted element). Asserted as the RELATION between the two
     numbers in the same rule, not as "0.32s". */
  const opDur = shut.match(/transition\s*:[^;]*?opacity\s+([\d.]+)s/);
  const visDelay = shut.match(/transition\s*:[^;]*?visibility\s+0s[^,;]*?\s([\d.]+)s/);
  assert.ok(opDur, 'the shut rule transitions opacity over a stated duration');
  assert.ok(visDelay, 'the shut rule delays the visibility flip');
  assert.equal(visDelay[1], opDur[1],
    'the visibility delay equals the opacity duration — a shorter one un-paints the scrim mid-fade, '
    + 'which WOULD be a visible change');
  assert.match(shown, /transition\s*:[^;]*visibility\s+0s\s+\w+\s+0s/,
    '`.show` flips visibility with NO delay, so the fade-in is the fade-in it always was');

  /* reduced motion overrides transition-DURATION; the delay is a different property and needs its
     own override or an instant close leaves the blur painted for the length of the old fade.
     ⚠ found by SELECTOR, not by slicing from the first `prefers-reduced-motion` — the boot splash
     declares one of those too, several hundred lines earlier, and the slice landed in it. */
  assert.match(cssRule(css, '.m-scrim', 'transition-delay'), /transition-delay\s*:\s*0s\s*!important/,
    'the reduced-motion block zeroes the scrim delay too (it only overrides transition-duration)');
});

test('R230 ③ the phone gets MapLibre\'s own image-request default, not a raised one', () => {
  const app = code('js/app-body.js');

  const m = app.match(/const\s+_imgConcurrency\s*=\s*\/[^/]+\/\.test\(navigator\.userAgent\)\s*\?\s*(\d+)\s*:\s*(\d+)/);
  assert.ok(m, 'js/app-body.js decides image concurrency from the user agent in one place');
  const phone = Number(m[1]);

  /* ⚠ READ MAPLIBRE'S DEFAULT RATHER THAN PINNING 16 (#R229/#R203's rule: a test that pins this
     round's literal goes red the next time the same instruction is followed). If MapLibre changes
     its own default, this says so instead of silently blessing a number nobody chose. */
  const ml = fs.readFileSync(path.join(ROOT, 'node_modules/maplibre-gl/dist/maplibre-gl-dev.js'), 'utf8');
  const def = ml.match(/MAX_PARALLEL_IMAGE_REQUESTS\s*:\s*(\d+)/);
  assert.ok(def, 'maplibre-gl states MAX_PARALLEL_IMAGE_REQUESTS');
  assert.equal(phone, Number(def[1]),
    'the phone value IS MapLibre\'s default (' + def[1] + '). 48 meant up to 48 decodes+GPU uploads '
    + 'started while the map was still, all of them landing inside the gesture that followed — '
    + 'starting a request is throttled while moving, finishing one is not');

  /* the throttled-while-moving ceiling is MapLibre's and must stay MapLibre's — if this app ever
     starts setting it, the number above stops describing the gesture */
  assert.doesNotMatch(app, /MAX_PARALLEL_IMAGE_REQUESTS_PER_FRAME/,
    'the app does not touch the while-moving ceiling — Map registers that throttle itself');
});

test('R230 ④ …asked of the user agent, so landscape does not fall out of it', () => {
  const app = code('js/app-body.js');
  const line = app.match(/const\s+_imgConcurrency\s*=[^;]+;/);
  assert.ok(line, 'the image-concurrency decision is a single statement');

  /* isMobile() in this file is `matchMedia('(max-width:768px)')`. An iPhone in landscape is ~852 px
     wide, so a width test would hand it the desktop firehose — #R225's lesson, and the reader
     reports BOTH orientations as slow. The UA test is true in either orientation. */
  assert.doesNotMatch(line[0], /isMobile\s*\(/,
    'the device-class question is not answered by the layout width here');
  assert.match(line[0], /navigator\.userAgent/,
    'it is answered by the user agent, which does not change when the phone is turned sideways');
});

test('R230 ⑤ the satellite prefetch runs in lanes — in both paths', () => {
  const sw = code('sw.js');
  const warm = code('js/tile-warm.js');

  /* THE DEFECT: `Promise.all` over the whole batch put up to 96 fetches in the air in one turn,
     260 ms after the reader stopped moving — i.e. inside the next gesture — each one a connection
     slot, a body read, a Blob and a Cache write, competing with the tiles being drawn. */
  const handler = sw.slice(sw.indexOf("d.type !== 'prefetch'"));
  assert.doesNotMatch(handler.slice(0, 900), /Promise\.all/,
    'the worker does not start the whole batch at once');
  assert.match(sw, /PREFETCH_LANES\s*=\s*\d+/, 'the worker bounds concurrent prefetches');
  assert.match(sw, /while\s*\(\s*_pfLanes\s*<\s*PREFETCH_LANES/, 'and it fills those lanes from a queue');

  /* the queue is module-level, not per-batch: a pan is a run of moveends, so a per-batch limit would
     still let three overlapping batches put 3×N in the air */
  assert.match(sw, /^let\s+_pfQueue\s*=\s*\[\]/m, 'the queue outlives one message (one cursor, every batch)');

  /* the no-worker path is the FIRST load — the one being complained about — and it had the same
     shape: forEach over 60 (110 while tilted) bare fetches */
  assert.doesNotMatch(warm, /uniq\.forEach\s*\(\s*u\s*=>\s*\{[^}]*fetch\(/,
    'the no-service-worker fallback no longer fires the whole ring at once');
  assert.match(warm, /WARM_LANES\s*=\s*\d+/, 'it has lanes of its own');

  /* ⚠ AND THE STATE IT WALKS IS DECLARED ABOVE ITS READER. This file's own header (#R196) says a
     `const` below the function that reads it is a temporal dead zone, and every call site here sits
     inside a try/catch that would swallow it — the prefetch would just silently stop. */
  assert.ok(warm.indexOf('let _warmQueued') < warm.indexOf('function predictivePrefetch'),
    'the queue state is declared ABOVE predictivePrefetch (TDZ inside a try/catch is silent)');
});

test('R230 ⑥ …and the worker is held alive until the lanes drain', () => {
  const sw = code('sw.js');
  const handler = sw.slice(sw.indexOf("d.type !== 'prefetch'"));

  /* `Promise.all` gave `waitUntil` the whole batch for free. A queue that resolves the moment it is
     SCHEDULED lets the browser terminate the worker with lanes still in flight — that is not
     "smaller batches", it is silently fewer tiles. */
  assert.match(handler.slice(0, 900), /await\s+done/,
    'the message handler awaits the drain, so waitUntil covers the fetches and not just the enqueue');
  assert.match(sw, /function\s+pfSettle\s*\(\)[\s\S]{0,200}_pfLanes\s*===\s*0\s*&&\s*_pfQueue\.length\s*===\s*0/,
    'drained means: no lane running AND nothing left queued');
  /* an empty batch must resolve rather than hang forever holding the worker open */
  assert.match(sw, /pfSettle\(\);\s*\n?\s*\}/, 'pfPump settles even when there was nothing to do');
});

test('R230 ⑦ the census measures what is actually painted, on screen', () => {
  const hud = code('js/perf-hud.js');

  /* #R228 wrote «Measure the intersection, not the rect» in this file's header and left the body
     summing r.width * r.height. Measured this round: 382 % raw against 135 % clipped. */
  assert.match(hud, /Math\.min\(r\.right,\s*VW\)\s*-\s*Math\.max\(r\.left,\s*0\)/,
    'the census clips each rect to the viewport');
  assert.doesNotMatch(hud, /area\s*\+=\s*r\.width\s*\*\s*r\.height/,
    'and no longer bills the off-screen part of a parked sheet');

  /* skip what is genuinely not painted… */
  assert.match(hud, /c\.visibility\s*===\s*'hidden'\s*\)\s*continue/,
    '`visibility:hidden` is not painted, so it is not counted — otherwise this instrument would keep '
    + 'reporting the scrim #R230 just made free');
  /* …but NOT what is painted and invisible, which is the whole defect class */
  assert.doesNotMatch(hud, /c\.opacity\s*===\s*'0'\s*\)\s*continue/,
    '`opacity:0` IS still counted — that was the scrim\'s state for every frame of every gesture, and '
    + 'skipping it would blind the instrument to the defect it just found');
});
