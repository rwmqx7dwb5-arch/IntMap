/* ============================================================================
 *  IntMap · earth-system layers — ocean currents, tides, crops
 * ----------------------------------------------------------------------------
 *  js/ocean-currents.js と js/world-packs.js の潮汐・作物パック。
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

/* ════════ #R220 — from tests/r220-checks.test.mjs (3 of its 14 tests) ════════ */
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

/* ══ ③ THE OCEAN-CURRENT PLATE — every mark is outlined ══════════════════════════════════════ */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ③ every mark on the current plate has a casing under it', () => {
  for (const id of ["GLOW='oc-glow'", "CASE='oc-case'", "HEADC='oc-head-case'", "FLOWC='oc-flow-case'"])
    assert.ok(OCEAN.includes(id), `${id} exists`);
  assert.match(OCEAN, /const COL_CASE='rgba\(/, 'and they share one casing colour');
  /* the casing must not take part in collision, or it wins slots its own arrow loses */
  const flowc = OCEAN.slice(OCEAN.indexOf('layers.add({id:FLOWC'), OCEAN.indexOf('layers.add({id:FLOW,'));
  assert.match(flowc, /'icon-allow-overlap':true,'icon-ignore-placement':true/, 'the field casing ignores placement');
  /* ⚠ ONE list, read by the panel AND by every setVis — the first version of this round updated the
     panel and left `setVis([FLOW,LINE,HEAD,LBL])` behind, so every casing was built and never shown. */
  assert.match(OCEAN, /const ALL=\[FLOWC,FLOW,GLOW,CASE,LINE,HEADC,HEAD,LBL\];/, 'there is one list');
  assert.ok(OCEAN.includes('layers:()=>ALL.slice()'), 'the panel reads it');
  /* (#R222) a third `setVis(ALL, on)` lives in `drawFlow`, which is what re-shows the plate after the
     field is re-strided for a new view. The invariant is unchanged: every setVis names ALL. */
  assert.ok((OCEAN.match(/setVis\(ALL,/g) || []).length >= 2, 'and so does every setVis');
  assert.ok(!/setVis\(\[/.test(OCEAN.replace(/`setVis\(\[[^`]*`/g, '')), 'no setVis carries its own hand-written list');
  assert.ok(!/setVis\(\[FLOW,LINE,HEAD,LBL\]/.test(OCEAN.replace(/\/\*[\s\S]*?\*\//g, '')),
    'no partial list survives in the program (the note that records it may name it)');
});

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('r220 ④b the crop layer no longer announces the fetch', () => {
  /* the STRING may still appear in the note that records why it went; what must be gone is the CALL */
  assert.ok(!WORLD.includes("stat(L('Reading the FAO grid"), 'the status line is not printed any more');
  assert.ok(WORLD.includes('(#R220)'), 'and the round records where it was');
  assert.match(WORLD, /この作物・指標を GAEZ から取得できませんでした/, 'the FAILURE line stays — that is an answer');
});

/* ══ ⑤ THE TIDE LAYER SAYS WHICH POINT WAS CHOSEN ═══════════════════════════════════════════ */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ⑤ the tapped tide point is a ring and a label, not another dot', () => {
  assert.ok(WORLD.includes("SEL='wp-tide-sel'") && WORLD.includes("SELLBL='wp-tide-sel-lbl'"), 'the two layers exist');
  const sel = WORLD.slice(WORLD.indexOf('layers.add({id:SEL,'), WORLD.indexOf('layers.add({id:LBL,'));
  assert.match(sel, /filter:\['==',\['get','kind'\],'probe'\]/, 'and they draw the PROBE, not the scan');
  assert.match(sel, /'circle-stroke-width':2\.4/, 'the ring has a stroke the eye can find');
  assert.match(WORLD, /function selLabel\(\)/, 'the label names the point');
  assert.match(WORLD, /setVis\(\[PT,SEL,LBL,SELLBL\],on\)/, 'and all four follow the layer switch');
  assert.match(WORLD, /at=\[lng,lat\]; busy=true;\s*\n\s*\/\*[\s\S]{0,240}?\*\/\s*\n\s*try\{ drawStations\(\); \}/,
    'the mark goes down on the tap, before the model answers');
});
}
