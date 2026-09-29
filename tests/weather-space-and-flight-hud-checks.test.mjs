/* ============================================================================
 *  IntMap · the space view and the flight deck on a phone
 * ----------------------------------------------------------------------------
 *  js/space.js と js/flight-sim.js の HUD。
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

/* ════════ #R220 — from tests/r220-checks.test.mjs (4 of its 14 tests) ════════ */
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

/* ══ ⑥ THE SPACE VIEW ═══════════════════════════════════════════════════════════════════════ */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ⑥a the distance ladder is a scale, and draws no circle', () => {
  const fn = SPACE.slice(SPACE.indexOf('function drawCosmos('), SPACE.indexOf('function drawBody('));
  assert.ok(!/C\.ring\(/.test(fn), 'no ring is built for a rung — a radius is not a path');
  assert.match(fn, /new Float32Array\(\[R,0,-t, R,0,t\]\)/, 'each rung is a tick across its own radius');
  assert.match(fn, /out\.push\(\{ name:C\.label/, 'and it still carries its published value');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ⑥b the scene centres on whatever is selected, planet or not', () => {
  assert.match(SPACE, /function sceneCentre\(jd,pos\)/, 'there is one centre function');
  assert.equal((SPACE.match(/const centre=sceneCentre\(jd,pos\);/g) || []).length, 2,
    'and BOTH the draw path and the click hit-test use it');
  assert.match(SPACE, /function selScenePos\(jd\)/, 'a spacecraft/small body can be the centre');
  assert.match(SPACE, /if\(craftSel\|\|smallSel\) visitSel\(\);/, 'and selecting one goes there');
});

/* ══ ⑧ THE FLIGHT DECK ON A PHONE ══════════════════════════════════════════════════════════ */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ⑧ the action deck is behind one key on a phone, and that key can be seen', () => {
  assert.match(FLIGHT, /class="fs-deck-t"/, 'the key exists in the HUD');
  const base = FLIGHT.indexOf(".fs-deck-t{position:absolute;display:none");
  const on = FLIGHT.indexOf("#fs-hud .fs-deck-t{display:flex;}");
  assert.ok(base > 0 && on > 0, 'both rules exist');
  assert.ok(base < on, 'and the base rule comes FIRST — equal specificity is decided by order');
  assert.match(FLIGHT, /hud\.dataset\.deck=\(hud\.dataset\.deck==='1'\)\?'0':'1'/, 'the key toggles one piece of state');
  assert.match(FLIGHT, /fsAction\(b\.getAttribute\('data-act'\)\); hud\.dataset\.deck='0';/, 'and acting closes the sheet');
  /* nothing was removed: the same eight actions are still in the deck */
  const deck = FLIGHT.slice(FLIGHT.indexOf('<div class="fs-deck">'), FLIGHT.indexOf('<div class="fs-minimap">'));
  assert.equal((deck.match(/<button class="fs-act/g) || []).length, 8, 'eight buttons, as before');
});

/* ══ ⑨ THE SPACE VIEW ON A PHONE ═══════════════════════════════════════════════════════════ */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('r220 ⑨ the phone\'s detail sheet is a handle, and hides nothing permanently', () => {
  assert.match(SPACE, /class="sp-sheet-t"/, 'the handle is in the HUD');
  assert.match(SPACE, /col\.classList\.add\('sp-min'\)/, 'and it starts collapsed on a phone');
  assert.match(CSS, /#space-view \.sp-sheet-t\{ display:none; \}/, 'a pointer machine never sees it');
  assert.match(CSS, /#space-view \.sp-col\.sp-min \.sp-info,\s*\n\s*#space-view \.sp-col\.sp-min \.sp-events\{ display:none !important; \}/,
    'collapsed hides the two panels and nothing else');
});
}
