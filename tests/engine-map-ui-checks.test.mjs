/* Map chrome — the current-location pin (js/map-extras.js), picking a point through a ghosted panel
 * (js/map-pick.js), and the glass surfaces.
 *
 * Gathered from tests/r219-checks ⑧ ⑩ and tests/r222-checks ⑥ (the glass). Titles keep the round that
 * wrote them.
 *
 * The locate pin's easing is lifted out of js/map-extras.js and RUN against a frame clock the test
 * owns; the ghost and the glass are stylesheet rules, which only a browser resolves — those are read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ READ, NOT RUN: pointer-events on a ghosted panel is CSS the browser resolves. */
test('R219 ⑧ a ghosted panel keeps its own controls clickable', () => {
  assert.ok(/im-pick-ghost/.test(read('js/map-pick.js')), 'map-pick must mark the panel it ghosts');
  const css = read('css/intmap.css');
  assert.ok(/\.im-pick-ghost\{\s*pointer-events:none/.test(css), 'the ghosted panel surface must be transparent to input');
  assert.ok(/\.im-pick-ghost button[\s\S]{0,400}pointer-events:auto/.test(css), 'its buttons must not be');
});

/* THE CURRENT-LOCATION PIN INTERPOLATES, AND NEVER LEADS THE FIX.
   RUN: the pin's state and its frame step are lifted out of js/map-extras.js and driven frame by frame
   with requestAnimationFrame and performance.now supplied by the test. */
test('R219 ⑩ the locate pin eases between fixes and never runs ahead of one', () => {
  const src = read('js/map-extras.js');
  const want = ['anim', 'EASE_MS', '_mAway', '_tick', 'paint'];
  const stmts = [];
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    const hit = (n.type === 'FunctionDeclaration' && want.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => want.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  let clock = 0;
  const frames = [], painted = [];
  const pin = new Function('M', 'ensure', '_paintAt', 'active', 'requestAnimationFrame', 'performance',
    `${stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n')}\nreturn { paint };`)(
    () => ({}), () => true, (lng, lat) => painted.push({ lng, lat }), true,
    (f) => { frames.push(f); return frames.length; }, { now: () => clock });
  const step = () => { const f = frames.shift(); clock += 16; f(); };

  pin.paint(139.0, 35.0, 10);
  assert.deepEqual(painted.at(-1), { lng: 139.0, lat: 35.0 }, 'the first fix is DRAWN, not travelled');
  assert.equal(frames.length, 0, 'and nothing animates for it');

  const target = { lng: 139.0003, lat: 35.0 };                       /* a ~27 m step east */
  pin.paint(target.lng, target.lat, 10);
  assert.equal(frames.length, 1, 'the pin must animate toward the new fix');
  let prev = 139.0, n = 0;
  while (frames.length && n < 1000) {
    step(); n++;
    const p = painted.at(-1);
    assert.ok(p.lng >= prev - 1e-12 && p.lng <= target.lng + 1e-12, `frame ${n}: the drawn point left the segment between the last drawn point and the fix`);
    prev = p.lng;
  }
  assert.deepEqual(painted.at(-1), target, 'it converges onto the measurement exactly');
  assert.ok(n > 5, `and it travelled rather than jumped (${n} frames)`);
  assert.equal(frames.length, 0, 'and it stops — a stationary phone costs no frames');

  pin.paint(139.1, 35.0, 10);                                        /* ~9 km: a different place */
  assert.deepEqual(painted.at(-1), { lng: 139.1, lat: 35.0 }, 'a jump big enough to be a different place is drawn, not slid');
  assert.equal(frames.length, 0);
});

/* (#R229) #R222 asserted that #R221's suppression ALSO fired on a scroll and on a sheet transition. The
   whole mechanism is deleted; it was never asked for. See tests/r221-checks ⑥ for the standing check.
   ⚠ READ, NOT RUN: a CSS rule and a module file that must not exist. */
test('#R222 ⑥ the glass is never un-frosted by the app itself (#R229)', () => {
  assert.ok(!existsSync(join(ROOT, 'js/glass-motion.js')), 'js/glass-motion.js must not exist');
  /* ⚠ a SELECTOR, not the word — the comment that replaced the rule names it deliberately */
  assert.doesNotMatch(read('css/intmap.css'), /body\.im-moving[^{]*\{/, 'and no CSS rule survives for it');
});
