/* ============================================================================
 *  R666 · 「LayersのToolsからアクセスできるように。」 — AND THE MOBILITY THAT CARRIES THE OUTBREAK
 * ----------------------------------------------------------------------------
 *  Two things, one round. The first is a door: the pandemic simulator was one of four cards inside
 *  the Playground hub, so it cost two taps and a screen about three other things. The second is the
 *  audit's PHASE 2 — the destination of an international importation was drawn UNIFORMLY, so
 *  Tuvalu and India were equally likely to receive the world's next outbreak.
 *
 *  The door checks read source, because a button's id and the command behind it are facts about the
 *  shipped files; the mobility checks RUN the model, because a distribution is not something a
 *  regular expression can see (#R505).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const nocomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ① the command ─────────────────────────────────────────────────────────────────────────── */
test('R666 ①: the pandemic simulator is an OS action, not three copies of an open sequence', () => {
  const s = nocomment(read('js/app-body.js'));
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'/, 'sim.pandemic is registered beside sim.seismic');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,400}?IntMapLazy\.need\('playground'\)/,
    'and it fetches the lazy module rather than assuming it is here');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,400}?window\._pgPandemic\(\)/,
    'and presses the simulator itself, not the hub');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,500}?btn:'btn-pandemic-sim'/,
    'and names the button the Layers strip builds');
});

/* ── ② the row in Layers ▸ Tools ───────────────────────────────────────────────────────────── */
test('R666 ②: Layers ▸ Tools has a row of its own for the pandemic simulator', () => {
  const s = read('js/data-layers.js');
  assert.match(s, /b\.id='btn-pandemic-sim'/, 'the button is built…');
  assert.match(s, /const _pan=_panBtn\(\);/, '…once per rebuild, like _seisBtn…');
  assert.match(s, /if\(_pan\) tools\.appendChild\(_pan\);/, '…and appended to the Tools strip');
  /* the press goes through the command; the direct call is only the fallback for a kernel that is
     not up yet — the same two-step `_seisBtn` uses */
  const body = s.slice(s.indexOf("const _panBtn=()=>{"), s.indexOf("order.push(mkHr());", s.indexOf("const _panBtn=()=>{")));
  assert.match(body, /OS\.exec\('sim\.pandemic',\{source:'ui'\}\)/, 'one press = one command');
  assert.match(body, /IntMapLazy\.need\('playground'\)[\s\S]*?_pgPandemic/, 'with a fallback that still opens the simulator');
  /* the label is the name the hub card already carries, so the four locale packs need no new key */
  assert.match(body, /IntMapLang\.t\(lang,'Pandemic Simulator'/, 'one thing, one name');
  /* ⚠ THE HUB IS NOT REPLACED — 「Playground ハブは残す」 */
  assert.match(read('js/analysis-panels.js'), /id="btn-edu"/, 'the Playground hub keeps its button');
});

/* ── ③ the dead wiring ─────────────────────────────────────────────────────────────────────── */
test('R666 ③: nothing binds a handler to #btn-playground, an id nothing creates', () => {
  /* MEASURED before this round: js/app-body.js bound an onclick to `#btn-playground` and no file in
     the repository — no .js, no .html — ever created that id. Settings ▸ Playground was that button
     until #R30 moved the hub to the Tools strip. */
  const src = ['js/app-body.js', 'js/analysis-panels.js', 'js/data-layers.js', 'js/atlas-console.js', 'index.html']
    .map((f) => nocomment(read(f))).join('\n');
  assert.ok(!src.includes('btn-playground'), 'the id is gone from the code (comments may still explain it)');
});

/* ── ④ Atlas asks for the module before it asks which mode ─────────────────────────────────── */
test('R666 ④: "open the pandemic simulator" does not answer with the hub on a cold page', () => {
  /* MEASURED: the pandemic arm tested `window._pgPandemic`, which js/playground.js's factory installs
     and #R209 made that factory run only on demand — so before anyone had opened the Playground the
     arm was false and the request fell through to the `else`, which opened the four-card hub. */
  const s = nocomment(read('js/atlas-console.js'));
  const c = s.slice(s.indexOf("case 'playground': case 'game':"));
  const arm = c.indexOf('_pgPandemic');
  const load = c.indexOf("IntMapLazy.need('playground')");
  assert.ok(load >= 0 && load < arm, 'the loader is awaited BEFORE the mode arms are tested');
  assert.ok(c.indexOf('_openPlayground') > arm, 'and the hub is still the fallback, not the answer');
});
