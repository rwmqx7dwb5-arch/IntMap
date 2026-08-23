/* ============================================================================
 *  R387 — the mobile trace, in an engine that is not Chromium
 * ----------------------------------------------------------------------------
 *  「実iPhone Safariを対象に、起動→最初のpan→最初のzoom→暖機後→気象ON→警報ONまでを1本の性能
 *   トレースとして測定し、MapLibre label placement / raster decode / texture upload / worker clone /
 *   GC / IntMap JS を完全に時間帰属すること」
 *
 *  Every number in that trace rests on two pieces of arithmetic and one refusal:
 *
 *    · SELF TIME. `Map._render` calls `Painter.render`, which calls `texImage2D`. Timing all three
 *      and adding them counts the same milliseconds three times, and a decomposition that sums to
 *      more than the wall clock is not a decomposition. ① runs the real probe against a fake map on
 *      a fake clock and pins every bucket to the millisecond, so the nesting can never silently
 *      become inclusive again.
 *    · busy = wall − pings × tick0, and other = busy − Σ buckets. ③ pins both, and pins what
 *      happens when the buckets exceed busy — which is a REPORT (`overAttributed`), not a clamp.
 *    · A HOOK THAT DID NOT ATTACH IS NOT A COST OF ZERO. ② removes `_updatePlacement` and requires
 *      the probe to say so instead of reporting label placement as free.
 *
 *  ④ is the one that came from a real failure rather than from foresight: the first run of this
 *  instrument drove `dl-ec-wind` (the id of a PREVIEW CANVAS) and `dl-alerts` (which does not
 *  exist), and reported the alerts phase as costing nothing. It is red if layerOn ever again
 *  accepts an element that is not a checkbox, or one whose box stays off.
 *
 *  ⚠ ⑥ IS THE CHECK THAT CAN GO RED FOR A REASON NOBODY WOULD GUESS. frame-profile.mjs decides its
 *  base URL AT IMPORT TIME, and its replay cache lets a URL through untouched only when it starts
 *  with that base. If mobile-trace.mjs computed a different port, every request for the app's own
 *  HTML and chunks would be answered out of the TILE cache. The test forces the two apart with
 *  PORT= and requires them to agree anyway.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PROBE_SRC = read('scripts/trace-probe.js');

/* A sandbox with a clock the test moves by hand: every assertion below is an exact millisecond
   count, not a tolerance, because the arithmetic being checked is exact. */
function sandbox({ withPlacement = true } = {}) {
  const clock = { t: 0 };
  const g = {};
  g.window = g;
  g.location = { search: '' };
  g.performance = { now: () => clock.t };
  g.MessageChannel = function () { this.port1 = { postMessage() {} }; this.port2 = { postMessage() {} }; };
  g.requestAnimationFrame = function raf() { return 0; };
  g.setInterval = () => 0; g.clearInterval = () => {}; g.setTimeout = () => 0;
  g.console = console;
  /* a WebGL context whose only job is to cost 5 ms per upload */
  g.WebGL2RenderingContext = function GL() {};
  g.WebGL2RenderingContext.prototype.texImage2D = function () { clock.t += 5; };
  const gl = new g.WebGL2RenderingContext();

  function Painter() {}
  Painter.prototype.render = function () { clock.t += 1; gl.texImage2D(); clock.t += 1; };
  function Style() {}
  if (withPlacement) Style.prototype._updatePlacement = function () { clock.t += 7; };
  function MapC() { this.painter = new Painter(); this.style = new Style(); }
  MapC.prototype._render = function () {
    clock.t += 2;
    this.painter.render();
    if (this.style._updatePlacement) this.style._updatePlacement();
    clock.t += 3;
  };
  const map = new MapC();
  g.IntMapGeoEngine = { raw: () => map };

  vm.createContext(g);
  vm.runInContext(PROBE_SRC, g, { filename: 'trace-probe.js' });
  return { g, map, clock, S: g.__imTrace };
}

/* ── ① the buckets are SELF time, and they sum to the wall clock ─────────────────────────────── */
test('① nested wrappers report self time, and the decomposition is exact', () => {
  const { S, map, clock } = sandbox();
  const att = S.attachMap();
  assert.equal(att.ok, true, 'attachMap() did not find the map');
  assert.deepEqual(
    { mapRender: att.mapRender, render: att.render, placement: att.placement },
    { mapRender: true, render: true, placement: true },
    'one of the three MapLibre hooks did not attach',
  );

  const t0 = clock.t;
  map._render();
  const wall = clock.t - t0;

  assert.equal(wall, 19, 'the fake frame did not cost what the fake clock says');
  assert.equal(S.self.mapRender, 5, 'Map._render self time must EXCLUDE painter.render and placement');
  assert.equal(S.self.render, 2, 'Painter.render self time must EXCLUDE the texture upload inside it');
  assert.equal(S.self.texUpload, 5);
  assert.equal(S.self.placement, 7);

  const sum = S.self.mapRender + S.self.render + S.self.texUpload + S.self.placement;
  assert.equal(sum, wall,
    `the buckets sum to ${sum} ms over a frame that took ${wall} ms — inclusive timing has come `
    + 'back, and every "other / unattributed" figure in the trace is wrong by the difference');

  /* and a second frame accumulates rather than resetting */
  map._render();
  assert.equal(S.self.texUpload, 10);
  assert.equal(S.calls.texUpload, 2);
});

/* ── ② a hook that did not attach is reported, never printed as zero ─────────────────────────── */
test('② label placement that could not be hooked is a miss, not a cost of zero', () => {
  const { S, map } = sandbox({ withPlacement: false });
  const att = S.attachMap();
  assert.equal(att.placement, false, 'attachMap claimed to have hooked a method that is not there');
  assert.equal(S.hooks.placement, undefined,
    'hooks.placement is set for a hook that never attached — a reader would take the 0 ms below as '
    + 'a measurement');
  assert.ok(
    S.misses.some((m) => m.includes('_updatePlacement') && m.includes('UNMEASURED')),
    `the miss was not recorded loudly enough to survive a skim: ${JSON.stringify(S.misses)}`,
  );
  map._render();
  assert.equal(S.self.placement, undefined, 'an unhooked bucket must have no entry at all');
  assert.equal(S.self.mapRender + S.self.render + S.self.texUpload, 12,
    'the buckets that DID attach must still be self-timed correctly around the missing one');
});

/* ── ③ busy, other, and the refusal to clamp an impossible attribution ───────────────────────── */
test('③ busy is accumulated, not inferred, and an over-attribution is reported rather than hidden', async () => {
  const { phaseOf, BUCKETS } = await import('../scripts/mobile-trace.mjs');
  const zero = () => Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const A = { t: 1000, self: zero(), calls: zero(), lat: {}, pings: 0, gapSum: 0, busy: 0, blocking: 0, gap50: 0, gap100: 0, maxGap: 0, frames: 0 };

  /* ⚠ `busy` comes off the probe's own accumulator (time in ping gaps over 2 ms) and is a
     DIFFERENCE between two snapshots — it is never derived from `pings`. Two earlier versions of
     this file derived it, and both were wrong by the whole column: the mean gap is wall/pings so
     the subtraction is identically zero, and the minimum gap in Chromium is the 0.1 ms clock
     quantum rather than the 0.013 ms queue cost. This assertion is what keeps it a measurement. */
  const B = { ...A, t: 3000, pings: 4000, busy: 1000, self: { ...zero(), render: 400, placement: 100 }, calls: zero(), blocking: 150, gap50: 3, gap100: 1, frames: 0 };
  const p = phaseOf(A, B, [16.7, 16.7, 33.4]);
  assert.equal(p.wallMs, 2000);
  assert.equal(p.busyMs, 1000, 'busy is the probe’s accumulator, differenced across the phase');
  assert.equal(p.blockingMs, 150);
  assert.equal(p.attributedMs, 500);
  assert.equal(p.otherMs, 500, 'other is busy minus the buckets');
  assert.equal(p.overAttributed, false);
  assert.equal(p.frames, 3);

  /* the 2 ms threshold makes busy a FLOOR, so the buckets can legitimately exceed it. That is a
     finding to print, not a number to clamp quietly. */
  const C = { ...B, self: { ...zero(), render: 1800 } };
  const q = phaseOf(A, C, []);
  assert.equal(q.attributedMs, 1800);
  assert.equal(q.otherMs, 0, 'other floors at zero');
  assert.equal(q.overAttributed, true,
    'the buckets exceeded measured busy time and the run did not say so — a reader would read '
    + 'other=0 as "everything is accounted for"');

  /* and a phase whose probe never accumulated anything must read 0, not the wall clock */
  const D = { ...B, busy: 0, self: zero() };
  assert.equal(phaseOf(A, D, []).busyMs, 0, 'an idle phase must not inherit its wall time as busy');
});

/* ── ④ a layer phase counts as driven only if the box really went on ─────────────────────────── */
test('④ layerOn refuses a non-checkbox and a box that stayed off — the defect the first run hit', async () => {
  const { layerOn } = await import('../scripts/mobile-trace.mjs');
  /* Playwright serialises the callback and runs it in the page; do the same, so this exercises the
     shipped function rather than a paraphrase of it. */
  const pageWith = (dom) => ({
    evaluate: (fn, arg) => {
      const g = { console, Promise };
      g.window = g;
      g.document = { getElementById: (id) => dom[id] || null };
      g.setTimeout = (f) => setTimeout(f, 0);          /* the bounded poll must not really take 3 s */
      /* ⚠ an IntMapOS whose exec NEVER SETTLES. Two diagnostic runs of this instrument hung inside
         one page.evaluate because the alert layer's command does not resolve when a request it
         starts cannot be answered. If layerOn ever goes back to awaiting it, this test stops
         returning — so the caller below converts that into a failure instead of a hang. */
      g.IntMapOS = { exec: () => new Promise(() => {}), list: () => ['layer.on'] };
      g.Event = function Event(type) { this.type = type; };
      vm.createContext(g);
      return vm.runInContext('(' + fn.toString() + ')', g)(arg);
    },
  });
  const noHang = (p) => Promise.race([p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('layerOn did not return — it is awaiting an app promise again')), 8000))]);

  /* the real shape of the first failure: dl-ec-wind is a <canvas>, dl-alerts does not exist */
  /* ⚠ [...x] / {...x}: the result crosses a vm realm boundary, so its Array and Object come from a
     different constructor and deepStrictEqual rejects them on the prototype before it ever looks at
     the contents. Re-wrap in this realm — the strings inside are primitives and carry over. */
  const bad = await noHang(layerOn(pageWith({ 'dl-ec-wind': { tagName: 'CANVAS', type: undefined, click() {}, dispatchEvent() {} } }), ['dl-alerts', 'dl-ec-wind']));
  assert.equal(bad.ran, false, 'a preview canvas was accepted as a layer toggle');
  assert.deepEqual([...bad.tried], ['dl-alerts:absent', 'dl-ec-wind:canvas']);

  /* a toggle the app refuses on every route is still a phase that did not happen. The `change`
     handler putting the box back is how a real refusal looks — the third route sets the property
     itself, so without this the fallback would call every dead layer a success. */
  const dead = { tagName: 'INPUT', type: 'checkbox', checked: false, disabled: false, click() {}, dispatchEvent() { dead.checked = false; } };
  const lying = await noHang(layerOn(pageWith({ 'dl-wind': dead }), ['dl-wind']));
  assert.equal(lying.ran, false, 'the checkbox stayed off and the phase was counted anyway');
  assert.deepEqual([...lying.tried], ['dl-wind:stayed-off(disabled=false)']);

  /* the reader's own route wins when it works, and the result names it */
  const box = { tagName: 'INPUT', type: 'checkbox', checked: false, click() { box.checked = true; }, dispatchEvent() {} };
  const good = await noHang(layerOn(pageWith({ 'dl-wind': box }), ['dl-wind', 'dl-ec-wind']));
  assert.deepEqual({ ...good }, { ran: true, id: 'dl-wind', via: 'click', waitedMs: 0 });

  /* …and a row that cancels the click is driven through `change`, and SAYS it was — a phase driven
     that way is a weaker statement than one a click could drive, and the JSON has to carry that */
  const cancels = { tagName: 'INPUT', type: 'checkbox', checked: false, click() {}, dispatchEvent() { cancels.checked = true; } };
  const late = await noHang(layerOn(pageWith({ 'wp-dl-alerts': cancels }), ['wp-dl-alerts']));
  assert.equal(late.ran, true, 'a layer whose row cancels the click was reported as not driven');
  assert.equal(late.via, 'change', `the route actually used was not reported: ${JSON.stringify({ ...late })}`);
});

/* ── ⑤ the probe cannot ship ─────────────────────────────────────────────────────────────────── */
test('⑤ trace-probe.js is instrumentation, and never enters the app', () => {
  const files = [];
  for (const dir of ['js', 'src']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.(js|mjs|ts)$/.test(f)) files.push(path.join(dir, f));
  }
  assert.ok(files.length > 50, 'the file sweep found almost nothing — it is not looking where it thinks');
  /* ⚠ codeOnly(): #R345 counted ten rounds in which a check matched its own explanatory prose. The
     string "trace-probe" appears in comments in this repo on purpose.
     ⚠ …and it runs ONLY on the files whose raw text mentions the probe at all. Stripping comments
     from all 225 js/ files took 24 s; the pre-filter is exact (a file that does not contain the
     string cannot contain it in code either) and takes milliseconds. */
  const hits = files.filter((f) => read(f).includes('trace-probe')).filter((f) => codeOnly(read(f)).includes('trace-probe'));
  assert.deepEqual(hits, [], `the probe is referenced from shipped code: ${hits.join(', ')}`);

  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    const idx = path.join(dist, 'index.html');
    if (fs.existsSync(idx)) assert.ok(!fs.readFileSync(idx, 'utf8').includes('trace-probe'), 'the probe reached dist/index.html');
  }
});

/* ── ⑥ one base URL, decided before frame-profile.mjs is imported ────────────────────────────── */
test('⑥ mobile-trace and frame-profile agree on the base URL, or the replay cache answers the app', () => {
  const url = (p) => pathToFileURL(path.join(ROOT, 'scripts', p)).href;
  const probe = (env) => execFileSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(url('mobile-trace.mjs'))});
     const fp = await import(${JSON.stringify(url('frame-profile.mjs'))});
     process.stdout.write(fp.BASE);`],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120_000 }).trim();

  assert.equal(probe({ PORT: '4999' }), 'http://127.0.0.1:4999',
    'frame-profile.mjs took its default port even though mobile-trace.mjs had chosen another — every '
    + 'request for the app’s own HTML and chunks would be served out of the tile replay cache');

  /* the line that can make this red: frame-profile alone must NOT already answer 4999 */
  const alone = execFileSync(process.execPath, ['--input-type=module', '-e',
    `const fp = await import(${JSON.stringify(url('frame-profile.mjs'))}); process.stdout.write(fp.BASE);`],
    { encoding: 'utf8', env: { ...process.env, PORT: '4999' }, timeout: 120_000 }).trim();
  assert.equal(alone, 'http://127.0.0.1:4173',
    'frame-profile.mjs reads PORT by itself now, so ⑥ would pass whatever mobile-trace.mjs did');
});
