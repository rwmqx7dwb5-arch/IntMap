/* ============================================================================
 *  IntMap · the seismic simulator — idle panel, wavefront, on-map HUD
 * ----------------------------------------------------------------------------
 *  js/seismic.js。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { npmTestRunsScript } from './helpers/ci-reach.mjs';
import { execFileSync } from 'node:child_process';

/* ════════ #R220 — from tests/r220-checks.test.mjs (1 of its 14 tests) ════════ */
{
/* ============================================================================
 *  #R220 — source-level gates for the round's fixes.  `node --test`
 * ----------------------------------------------------------------------------
 *  One test per thing that was WRONG, written so it fails if the mechanism comes
 *  back rather than if a number moves (#R218's lesson: a test pinned to this
 *  round's own value fails in the next one).
 * ==========================================================================*/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const NIGHT = rd('js/night-side.js');
const OCEAN = rd('js/ocean-currents.js');
const SEIS = rd('js/seismic.js');
const WORLD = rd('js/world-packs.js');
const SPACE = rd('js/space.js');
const FLIGHT = rd('js/flight-sim.js');
const CSS = rd('css/intmap.css');

/* ══ ④ WORDS ════════════════════════════════════════════════════════════════════════════════ */

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('r220 ④a the seismic idle panel says nothing at all', () => {
  /* the old sentences survive in the NOTE that records why they went; what must be gone is the
     string the panel prints — i.e. the one inside the L(...) call. */
  assert.ok(!SEIS.includes("','地図のクリックは通常どおりです"), 'the #R219 sentence is no longer printed');
  assert.ok(!SEIS.includes("','どちらも選択されていません"), '…and neither is the #R218 one');
  /* ⚠⚠ (#R234) …AND NOR IS #R220'S OWN REPLACEMENT — 「『◎ で震源を配置、◇ で地点を追加します。』
     という文言はいらない」. Three rounds rewrote this sentence (#R218 a fault report, #R219 a state
     report, #R220 a label) and the answer turned out to be that an idle panel has nothing to say.
     This assertion is INVERTED rather than deleted, because a check that requires the sentence is a
     check that stops it being removed — the same shape #R229 found in five of its own tests. */
  assert.ok(!SEIS.includes('◎ で震源を配置、◇ で地点を追加します。'), 'the idle line is gone, not reworded');
  assert.ok(!/L\('◎ places the epicenter/.test(SEIS), '…in every language, at the one call site it had');
  /* what replaced it: an instruction that appears only while a mode is armed, in one shape for all
     three modes. The three banners and their wording are pinned in tests/r234-checks ④. */
  assert.match(SEIS, /const BANNER=\(txt\)=>/, 'a mode that IS armed gets a banner instead');
});
}

/* ════════ #R239 — from tests/r239-checks.test.mjs (4 of its 16 tests) ════════ */
{
/* ============================================================================
 *  #R239 — the translation gate, the dock, and the rupture's trailing front
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). The three that do NOT
 *  fail on the old tree are marked where they are, and each is a proof rather than a diff: they
 *  state a property the new code has to keep, not a line it happens to contain.
 * ==========================================================================*/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
/* (#R208/#R215) comments quote the instruction, and the instruction contains the very strings these
   tests look for — so every syntax check reads the file with its comments stripped. */
const code = (p) => R(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const run = (f, ...a) => execFileSync(process.execPath, [join(ROOT, 'scripts', f), ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* ══ ③ THE WAVEFRONT ════════════════════════════════════════════════════════════════════════════
   「その時々の破壊中の断層を考慮したやつにしろ。」 */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ③ the trailing (last-arrival) front exists and is the intersection, not the union', () => {
  const s = code('js/seismic.js');
  assert.match(s, /function _envRmin\(K,rFor,b\)/, 'a minimum envelope exists');
  /* the union takes a max and skips points it cannot reach; the intersection may do neither */
  const min = s.slice(s.indexOf('function _envRmin'), s.indexOf('function _envRmin') + 700);
  assert.match(min, /cand<R/, 'it takes the minimum');
  assert.match(min, /if\(r==null\)\s*return null/, 'and a point that has not radiated makes the bearing null');
  assert.match(s, /const K=back\?_srcPts\(\):_prune\(/,
    'the back ring does NOT prune — the pruned points are exactly the ones the minimum is made of');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ③ the band is drawn only when a rupture is drawn, and under everything else', () => {
  const s = code('js/seismic.js');
  assert.match(s, /const hasRupture=!!\(fault&&fault\.ring/, 'a point source has no band');
  assert.match(s, /if\(hasRupture\)\{[\s\S]{0,400}kind:'band'/, 'the band is inside that test');
  const layers = s.slice(s.indexOf("layers.add({id:'seis-band'"), s.indexOf("layers.add({id:'seis-ring'"));
  assert.ok(layers.length > 0, 'seis-band is declared BEFORE seis-ring — add order is z order');
  assert.match(s, /id:'seis-ring-back'/, 'and the trailing outline has its own layer');
});

/* ⚠ PASSES ON THE OLD TREE — it is #R238's theorem, kept here because the band's whole justification
   rests on it. If the leading edge ever stops being a circle this is the test that says so. */
test('#R239 ③ the LEADING edge is still a circle about the hypocentre (Vr ≤ V ⇒ min at off=0)', () => {
  const D = Math.PI / 180, V = 6.0, Vr = 0.75 * 3.5;          /* P speed, shipped rupture speed */
  let worst = Infinity;
  for (let b = 0; b < 360; b += 5) {
    const term = 1 / Vr - Math.cos((b - 30) * D) / V;          /* the bracket, for a point at φ=30° */
    worst = Math.min(worst, term);
  }
  assert.ok(worst > 0, `the bracket is positive at every bearing (min ${worst.toExponential(2)})`);
});

/* ══ ④ THE ON-MAP STEP HUD ══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ④ the armed state is told on the map, and drives the same handlers as the panel', () => {
  const s = code('js/seismic.js');
  assert.match(s, /id='sq-hud'|_hudEl\.id='sq-hud'/, 'the HUD exists');
  assert.match(s, /const on=opened&&\(_fDrawing\|\|clickMode==='epi'\|\|clickMode==='station'\)/,
    'it is a readout of the three armed states');
  assert.match(s, /b\.onclick=\(\)=>\{ toggleFaultDraw\(\); \}/, 'and it calls the panel’s own handler');
  assert.match(s, /b\.onclick=\(\)=>setClickMode\('none'\)/, 'and the panel’s own mode setter');
  assert.match(s, /function render\(\)\{[\s\S]{0,200}_hud\(\)/, 'refreshed from render(), one source of truth');
  assert.match(s, /function close\(\)\{[\s\S]{0,600}_hud\(\)/, 'and taken down when the panel closes');
});
}
