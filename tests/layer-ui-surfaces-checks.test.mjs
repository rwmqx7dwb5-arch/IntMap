/* ============================================================================
 *  UI surfaces: widget cards, the front panel and progress bars
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r254-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 5. the widgets ──────────────────────────────────────────────────────────────────────────── */
test('R187 widgets: the AQI / UV tint is flat and translucent, i.e. glass', () => {
  /* ⚠ (#R292) RE-EXPRESSED AGAINST THE PLATFORM. The board's CSS left the JavaScript (it was a
     14 kB string built by concatenation), so `_TINT_GLASS` and the inline `setProperty` are gone.
     The requirement is unchanged and is now structural: an AQI or UV card is drawn on the SAME
     translucent material as every other card, and its category can only reach the border and the
     value. There is no code path left that can hand a card an opaque background. */
  const css = read('css/intmap.css');
  const src = css.slice(css.indexOf('#R292 · THE WIDGET BOARD'));
  /* The soft shading on these two cards was never OUTSIDE them: it was a 158° gradient that darkened
     the bottom-right corner by 14 %. Flat, so nothing fades into a corner; translucent, so the
     backdrop-filter the card already carries is what the eye sees. */
  assert.ok(!/linear-gradient\(158deg/.test(src), 'the colour gradient must be gone');
  const m = /--widget-surface:rgba\(255,255,255,([0-9.]+)\)/.exec(src);
  assert.ok(m, 'the card material must be a named token');
  assert.ok(+m[1] > 0.1 && +m[1] < 0.9, `a surface alpha of ${m[1]} is not translucent`);
  assert.match(src, /\.wgt-card,\.wgt-stack\{[^}]*background:var\(--widget-surface\)/,
    'and every card is drawn on it, tinted ones included');
  /* ⚠ SUPERSEDED BY #R188, ON PURPOSE. #R187 tied this alpha to the Solid/Frosted-Glass setting
     (#R33/#R153), which meant 1.0 — fully opaque — in the default Solid mode. Measured afterwards:
     every widget card was opaque and the AQI card was a slab of rgb(255,204,0), i.e. the request
     「全ウィジェットはガラス風の質感に」 was not met for ANY of them. The user confirmed in #R188
     that the widgets are glass regardless of the setting, so the alpha is now a constant and
     `_glassOn` is gone. What #R187 established and #R188 keeps — flat, translucent, contrast judged
     on the composite — is asserted above and below. See tests/r188-checks.test.mjs. */
  assert.match(src, /--widget-sev4:/,
    'the tint alpha is a constant (#R188) — the appearance setting no longer decides it');
  /* ⚠ (#R292) THE CONTRAST QUESTION STOPPED NEEDING AN ANSWER. #R187 had to compute the luminance
     of the category colour COMPOSITED over the glass, because the category was the card's
     background and the text had to survive it. Nothing paints a card its category colour any more —
     the text is `--widget-text-primary` on `--widget-surface` in every state, and the category
     reaches only the border and (at the top two severities) the value. So the assertion is that the
     situation cannot arise, which is what «flat and translucent» was always trying to buy. */
  assert.ok(!/\.wgt-card\.wgt-tone-\S+\{[^}]*(background|[^-]color):(?!\s*color-mix)/.test(src),
    'a severity may tint the border, never the card surface — contrast cannot be put at risk');
  /* the rule is matched by BOUNDARY, not by a character budget: from the selector to its closing
     brace. A `{0,600}` window is a number that has to be re-tuned every time a declaration is added. */
  assert.match(src, /\.wgt-card,\.wgt-stack\{[^}]*color:var\(--widget-text-primary\)/,
    'and every card takes the theme text colour');
});
}

/* ══════════ from tests/r188-checks.test.mjs — 1 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である */
/* (#R188) the round's header note is kept with its largest block, in tests/layer-aircraft-checks.test.mjs */

/* ── 4. widgets: glass, and one material for all of them ─────────────────────────────────────── */
test('R188 widgets: every card is translucent glass, tint included', () => {
  /* ⚠ (#R292) THE MATERIAL IS STILL ONE MATERIAL — it is `--widget-surface` in css/intmap.css now
     rather than `--wgt-glass` in a JavaScript string, because the board's stylesheet left the code.
     Every clause below is the same claim #R188 made, asked of the file that answers it today. */
  const src = read('css/intmap.css').slice(read('css/intmap.css').indexOf('#R292 · THE WIDGET BOARD'));
  /* measured in the DEFAULT appearance before the change: --glass-fill = #1c1c1e (opaque), every
     card rgb(28,28,30), the AQI card an opaque rgb(255,204,0). No widget was glass at all. */
  assert.match(src, /--widget-surface:rgba\(255,255,255,0\.55\)/, 'the cards get their own material');
  assert.match(src, /--widget-surface:rgba\(30,30,38,0\.44\)/, 'translucent in dark too');
  assert.match(src, /\.wgt-card,\.wgt-stack\{[^}]*background:var\(--widget-surface\)/,
    'the card fill must be the widget material, not the appearance-setting fill');
  assert.ok(!/\.wgt-card,\.wgt-stack\{[^}]*background:var\(--glass-fill\)/.test(src),
    '--glass-fill must no longer decide whether a widget is glass');
  /* ⚠ AND THE TINTED CARDS ARE THE SAME MATERIAL — #R187 took the alpha from the appearance setting,
     which meant 1.0 (opaque) by default. There is no per-card background left to get that wrong. */
  assert.ok(!/\.wgt-card\.wgt-tone-\S+\{[^}]*background:/.test(src),
    'AQI/UV must be the same material as every other card, not an opaque slab');
  /* the flat fill (#R187's other half) stays: no gradient may darken a corner */
  assert.ok(!/linear-gradient\(158deg/.test(src), 'no re-introduced 158° shade gradient');
  /* ⚠ and it is scoped to the widgets — every other surface still follows the setting (#R33/#R153) */
  const css = read('css/intmap.css');
  assert.match(css, /:root\{ --glass-blur:16px; --glass-sat:150%; --glass-fill:var\(--card-bg\);/,
    'the shared material is untouched');
});
}

/* ══════════ from tests/r254-checks.test.mjs — 2 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である・js/onboarding.js・js/sims.js・js/map-ui.js は DOM に閉じたファクトリで node では組み立てられない */
/* (#R254) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① THE BAR LOOKS LIKE EVERY OTHER BAR ────────────────────────────────────────────────────── */
test('#R254 ① the population progress bar has no UI of its own, because its fraction is real', () => {
  const css = code(read('css/intmap.css'));
  assert.doesNotMatch(css, /\.tp-prog\.indet/, 'the indeterminate rule is back — this bar must look like every other bar');
  assert.doesNotMatch(css, /@keyframes\s+imProgSweep/, 'the sweep keyframes are back');
  assert.doesNotMatch(css, /--prog-sweep\s*:/, 'the sweep token is back; there is one progress-bar token because there is one bar');
  assert.match(css, /--prog-grad\s*:\s*var\(--primary-color\)/, 'the accent token every bar fills with is gone');

  const ob = code(read('js/onboarding.js'));
  assert.doesNotMatch(ob, /classList\.(add|remove)\('indet'\)/, 'the controller still toggles an indeterminate class');
  /* `busy()` is «nothing has finished yet» = 0 %, never a blank percentage */
  const busy = /busy\(\)\{([^}]*)\}/.exec(ob);
  assert.ok(busy, 'the controller no longer has a busy() — re-derive this check against whatever replaced it');
  assert.doesNotMatch(busy[1], /textContent\s*=\s*''/, 'busy() blanks the percentage again — that is what made the bar unreadable');

  /* THE REASON IT CAN BE DETERMINATE: every sum is tiled, so `done/total` exists for any area */
  const sims = code(read('js/sims.js'));
  assert.doesNotMatch(sims, /areaKm2\s*>\s*95000/,
    'the single-request branch is back — a sub-cap sum has no fraction, and the bar would need a fake one again');
  assert.match(sims, /Math\.sqrt\(\s*wSpan\s*\*\s*hSpan\s*\/\s*4\s*\)/,
    'the cell side is no longer capped to about a 2×2 grid, so a small area is one request and reports nothing');
});

/* ── ⑧ WHO IS IN FRONT ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑧ the panel under the pointer is named, so a popup with no z-index can come forward', () => {
  const css = code(read('css/intmap.css'));
  const m = /\.im-front\{\s*z-index:(\d+)\s*!important/.exec(css);
  assert.ok(m, 'nothing raises the panel being used — a MapLibre popup has z-index:auto and can never beat the sidebar');
  const z = +m[1];
  assert.ok(z > 2600, `the raised panel is ${z}; the sidebar band is 2600 and would still cover it`);
  assert.ok(z < 9999, `the raised panel is ${z}; the modal overlay is 9999 and must stay on top`);
  { const at = css.indexOf('.im-front{'); const mq = css.lastIndexOf('@media(min-width:769px)', at);
    assert.ok(mq >= 0 && at - mq < 400,
      'the raise is not inside the desktop media block — on a phone the bottom sheet (1700) has to stay above the panel'); }

  const ui = code(read('js/map-ui.js'));
  assert.match(ui, /classList\.add\('im-front'\)/, 'nothing marks the panel');
  assert.match(ui, /querySelectorAll\('\.im-front'\)/, 'the previous panel is never un-marked — two panels would claim the front');
  assert.match(ui, /raise\(null\)/, 'a pointerdown in a sidebar does not drop the mark');
});
}
