/* ============================================================================
 *  THE MAP'S UI SHELL — 平面表示・窓・サイドバー・地点の指定・Atlas の吹き出し
 * ----------------------------------------------------------------------------
 *  The pieces of the app shell these rounds moved or pinned: one way to be flat, the window manager's
 *  corner catch, the frosted sidebar's inset, which tools ask for a point first, the Atlas message
 *  tools living in a module of their own, and no NUL byte in a source file.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { until } from './helpers/wx-ecmwf-page.mjs';
import { ROOT, isolate, read } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R298 · flat projection, the Atlas message tools   (was tests/r298-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R298's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R298 · flat projection, the Atlas message tools', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ── ⑬ the message tools moved out rather than the ceiling moving up ─────────────────────── */
  test('R298 ⑬ the Atlas kernel is under its ceiling because a subject left', () => {
    /* 綴りのまま: 主張が app shell／バンドルの import グラフという静的な構造で、実行しても観測できない。 */
    const n = (p) => read(p).split('\n').length;
    /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
    /* …and the subject is really somewhere, with its CSS, not deleted */
    const m = read('js/atlas-msg-tools.js');
    assert.match(m, /export const MSG_TOOLS_CSS/);
    assert.match(m, /export const MSG_TOOLS_CSS_MOBILE/);
    assert.match(m, /export function makeMsgTools\(CTX\)/);
    assert.match(m, /function copyBtn\(src\)\{/, 'the one copy button lives here now');
    assert.match(m, /\.atl-msgt\{display:flex/, 'and so do its rules');
    const k = read('js/atlas-console.js');
    /* ⚠ (#R313) THIS PINNED THE IMPORT LINE VERBATIM, which made it a test of a spelling rather than of
       a relation — the twenty-sixth time in this repository that a legitimate change was turned red by
       one. The kernel's ceiling is never raised, so #R313 moved the PANEL STYLESHEET out to
       js/atlas-styles.js, and the two CSS constants went with it: they are rules, and they now arrive
       where the rules are assembled. The msg-tools subject is no less whole for that — it is still one
       module exporting its behaviour AND its CSS, which is what the assertions above check. So ask who
       imports what, not how the line reads. */
    assert.match(k, /import \{[^}]*\bmakeMsgTools\b[^}]*\} from '\.\/atlas-msg-tools\.js';/,
      'the kernel takes the behaviour from the module that owns it');
    assert.match(read('js/atlas-styles.js'),
      /import \{[^}]*\bMSG_TOOLS_CSS\b[^}]*\bMSG_TOOLS_CSS_MOBILE\b[^}]*\} from '\.\/atlas-msg-tools\.js';/,
      '…and whoever builds the panel stylesheet takes the rules from that same module — not a copy of them');
    assert.match(k, /const \{ copyBtn, editBtn, msgTools \} = makeMsgTools\(/);
    assert.ok(!/function copyBtn\(/.test(k), 'a second copy button cannot be written in the kernel');
    /* the reader's own bar is hidden until hovered, and only theirs */
    assert.match(m, /\.atl-msgt-u\{align-self:flex-end;margin:-10px 0 0;padding-top:2px;opacity:0;\}/);
    assert.match(m, /@media\(hover:none\)\{[^}]*\.atl-msgt-u\{opacity:0\.55;\}/,
      'a touch screen has no hover, so there it stays reachable');
    assert.match(m, /\.atl-msgt-u:focus-within\{opacity:1;\}|:focus-within/, 'and a keyboard reaches it');
  });

  /* ── ⑩ the flat map wraps, and that is CHECKED rather than merely set once ───────────────── */
  test('R298 ⑩ there is one way to be flat, and the free scroll is re-asserted', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（js/map-projection.js と両エンジン）。 */
    /* ⚠ the subject left js/app-body.js in this same round — the app shell has a line budget
       (tests/r168 #8) and the rule beside it is that a subject moves out, never that the budget moves
       up. It is one file now, which is the point: 「there is one way to be flat」. */
    const b = read('js/map-projection.js');
    /* MEASURED on the built app before this: `?flat` set NO projection at all — `getProjection()`
       answered nothing, `currentProj` stayed 'globe', the Globe button stayed lit over a flat map,
       `minZoom` stayed 0 and `renderWorldCopies` stayed at the construction value (false). Five
       600-px pans left the centre on 141.3°: the camera did not move at all. 「自由スクロールできない」. */
    assert.match(b, /if\(\/\[\?&\]flat\\b\/\.test\(location\.search\)\)\{\s*\n?\s*if\(IntMapOS\.has&&IntMapOS\.has\('view\.proj\.flat'\)\) IntMapOS\.exec\('view\.proj\.flat'/,
      'the URL switch goes through the kernel command, not a second entrance');
    /* the invariant is READ before it is written — writing on every style event is #R297's oscillation */
    assert.match(b, /function _reassertFlatPan\(\)\{/);
    assert.match(b, /if\(c\.getRenderWorldCopies&&c\.getRenderWorldCopies\(\)\) return;/,
      'an already-free map costs nothing');
    assert.match(b, /GE\(\)\.events\.on\('styledata',_reassertFlatPan\); GE\(\)\.events\.on\('idle',_reassertFlatPan\);/,
      'and the check runs on the events that could have broken it');
    /* the cage is still cleared unconditionally — #R297's rule, kept */
    assert.match(b, /function applyFlatPanSetting\(\)\{[\s\S]{0,200}setMaxBounds\(null\)/);
    /* and both engines answer the question, so the contract has no hole */
    assert.match(read('js/geo-engine.js'), /getRenderWorldCopies\(\)\{ const m=_m\(\);/);
    assert.match(read('js/cesium-engine.js'), /getRenderWorldCopies\(\)\{ return false; \}/);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R299 · NUL bytes, the corner catch, point picking, the inset   (was tests/r299-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R299's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R299 · NUL bytes, the corner catch, point picking, the inset', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
     This project has paid for that twenty-four times; ask the question of the text that RUNS. */
  const noComments = (src) => codeOnly(src);

  /* ── ⓪ no file in this repository may carry a NUL byte ───────────────────────────────────────
     #R298 ⑨ found `js/routing-geocode.js` holding a raw 0x00: ripgrep classifies such a file as
     binary and SKIPS IT ENTIRELY, so every 「how many places is this fact in」 count taken over the
     repository silently excluded that module. This round put one into js/world-packs.js and caught
     it the same way — by grep calling the file binary. The rule is cheap, so it is a rule. */
  test('R299 ⓪ no source file contains a NUL byte (ripgrep skips such files whole)', () => {
    /* 綴りのまま: 主張がファイルのバイトそのもの。 */
    for (const p of ['js/world-packs.js', 'js/routing-geocode.js', 'js/weather.js', 'js/wx-ecmwf.js',
      'js/routing.js', 'js/routing-ui.js', 'js/map-ui.js', 'js/atlas-console.js', 'js/app-body.js']) {
      const b = readFileSync(resolve(ROOT, p));
      assert.ok(!b.includes(0), p + ' contains a NUL byte — ripgrep would skip the whole file');
    }
  });

  /* ── ⑦ the route panel is a window, and the corner is part of it ───────────────────────────── */
  test('R299 ⑦ the CORNER is caught on the document, because border-radius clips hit-testing', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（js/window-manager.js は document の pointer イベント）。 */
    const s = read('js/window-manager.js');
    const code = noComments(s);
    assert.ok(/function _armCornerCatch\(/.test(code), 'there is a document-level corner catcher');
    const c = code.slice(code.indexOf('function _armCornerCatch('), code.indexOf('function _armCornerCatch(') + 1800);
    /* ⚠ CORNERS ONLY — taking the edges here would swallow every click within M of a panel edge */
    assert.ok(/d\.length\s*!==\s*2/.test(c), 'only two-axis (corner) zones are claimed');
    /* ⚠ and the topmost window wins, which is the order bringToFront maintains */
    assert.ok(/zIndex/.test(c), 'the candidate with the highest z-index wins');
    /* ⚠ a press that already landed inside a resizable panel is that panel’s own */
    assert.ok(/data-edge-resize/.test(c), 'a press inside a resizable panel is left to it');
    /* the edge path is unchanged and still on the element */
    assert.ok(/panel\.addEventListener\('pointerdown'/.test(code), 'the edges are still the element’s own listener');
  });

  /* ── ⑨ a tool asks only when it cannot open without an answer ──────────────────────────────── */
  test('R299 ⑨ the extra 「use the map centre」 pill is gone, and the shared bar is not', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い。 */
    const code = noComments(read('js/map-ui.js'));
    assert.ok(!/im-pick-alt/.test(code), 'the pill #R298 added to the shared bar is gone');
    assert.ok(!/_hereLL/.test(code), '…and with it the accessor that named the camera centre');
    assert.ok(/window\.IntMapPick/.test(code) || /IntMapPick/.test(code), '#R196’s shared bar is still what asks');
    /* the picker itself is untouched */
    assert.ok(/im-pick-bar/.test(read('js/map-pick.js')), 'js/map-pick.js still owns the bar');
  });

  /* ⚠ (#R302) THE LIST MOVED, AND THE CHECK HAD THE LIST IN IT. This named `sim.sun` as a tool that
     must NOT ask — 「its panel can name a point itself」 — and the panel then answered for the camera's
     centre, printed 「観測地点は地図の中心」 and drew building shadows for a place nobody chose. The
     reader's reply: 「いきなり勝手に地図中心を選択しているという前提で勝手に計算して結果を表示するのを
     辞めろ。まずは地点を選ばせろ」. So `sim.sun` is now in the first group and the SECOND half of the same
     sentence — 「最初に地点選ぶ必要のないものまで全部最初に選ばせようとするな」 — is what keeps
     `sim.terrainWater` in the second. The rule is the DISTINCTION, not either list: a tool whose whole
     answer is a function of one coordinate asks first; a tool that has something to show without one
     opens. */
  test('R299 ⑨ a tool whose answer IS a point asks first, and no other tool does', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（道具の行は js/map-ui.js の中）。 */
    const code = noComments(read('js/map-ui.js'));
    const asked = (code.match(/_askPoint\(/g) || []).length;
    /* one definition plus one call per row that needs it */
    assert.ok(asked >= 4, '_askPoint is still used');
    for (const id of ['sim.los', 'sim.reach', 'sim.nightSky', 'sim.sun']) {
      const i = code.indexOf("'" + id + "'");
      assert.ok(i > 0, id + ' is still a row');
      assert.ok(/_askPoint/.test(code.slice(i, i + 400)), id + ' asks for a point');
    }
    for (const id of ['sim.terrainWater', 'sim.drone']) {
      const i = code.indexOf("'" + id + "'");
      assert.ok(i > 0, id + ' is still a row');
      assert.ok(!/_askPoint/.test(code.slice(i, i + 400)),
        id + ' opens straight away — it has something to show before any point is named');
    }
  });

  test('R299 ⑨ the two panels that had no way to name a point now have one', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い。 */
    assert.ok(/IntMapPick/.test(noComments(read('js/map-tools.js'))), 'the reachable-area panel can pick');
    assert.ok(/IntMapPick/.test(noComments(read('js/night-sky.js'))), 'the night-sky panel can pick');
  });

  test('R299 ⑨ Atlas asks rather than answering for the centre', () => {
    /* 綴りのまま: 対象が js/atlas-console.js の応答文で、Atlas は DOM とモデル呼び出しの上でしか組み立たない。 */
    const code = noComments(read('js/atlas-console.js'));
    /* the tsunami case is the model: it does not fall to the centre, it asks where */
    for (const probe of ['Where? Give the transmitter site', 'Where from? Give a place']) {
      assert.ok(code.includes(probe), 'Atlas asks: ' + probe);
    }
  });

  /* ── ⑩ the frosted sidebar owes the camera an inset; the solid one does not ─────────────────── */
  test('R299 ⑩ the inset is frosted-only, measured from the sidebar’s STATE, and written only on change', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（サイドバーの状態は DOM と地図の padding）。 */
    const s = read('js/sidebar-style.js');
    const code = noComments(s);
    assert.ok(/function _glassInset\(/.test(code), 'the visible width is one function');
    const g = code.slice(code.indexOf('function _glassInset('), code.indexOf('function _glassInset(') + 900);
    assert.ok(/sidebar-glass/.test(g), 'solid gets nothing — its canvas is already narrower');
    /* ⚠ a collapsed sidebar keeps its width (a negative margin parks it), so the STATE is read */
    assert.ok(/collapsed/.test(g), 'a collapsed sidebar contributes 0');
    assert.ok(/display|visibility/.test(g), 'and so does one hidden by workspace mode');
    /* ⚠ read before write: bottom belongs to the phone sheet */
    assert.ok(/getPadding\(\)/.test(code), 'the other sides are read before the left one is written');
    assert.ok(/setPadding\(/.test(code), 'and the left one is written');
    /* ⚠ only when it changed — a layer toggle must not move the map by a pixel (CONSTITUTION §3) */
    assert.ok(/!==\s*want/.test(code) || /!=\s*want/.test(code), 'nothing is written when the number is the same');
  });

  test('R299 ⑩ the shell moved a feature OUT rather than raising its ceiling', () => {
    /* 綴りのまま: 主張が app shell／バンドルの import グラフという静的な構造で、実行しても観測できない。 */
    /* tests/r168 #8 budgets index.html + src/* + js/app-body.js + js/geo-engine.js + js/lazy-modules.js.
       The rule that test states is that the ceiling follows the floor DOWN. */
    const body = read('js/app-body.js');
    assert.ok(/from '\.\/sidebar-style\.js'/.test(body), 'the shell imports the module it handed the feature to');
    /* ⚠ (#R167 dead-zone rule) js/mobile-ui.js binds this name at factory time, so it must be HOISTED */
    assert.ok(/function applySidebarStyle\(/.test(body),
      'the name stays a hoisted function declaration — a const would be undefined for earlier factories');
    assert.ok(/sidebar-style\.js/.test(read('docs/FILES.md')), 'and the ledger describes the new file');
  });

  ISOLATED.built();
});
