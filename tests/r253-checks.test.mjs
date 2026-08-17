/* ============================================================================
 *  IntMap · #R253 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports. Each check is written as «the defect cannot come back», not «the fix is still
 *  typed here», wherever the difference is expressible in the source.
 *
 *  ① the indeterminate progress sweep is declared with LONGHANDS, so `!important` cannot outrank
 *     the animation that moves it;
 *  ② a small place label's boundary is looked up inside the click before it is looked up on the
 *     planet;
 *  ③ the place popup's copy button says WHAT it copies, in every language the app ships;
 *  ④ an open sidebar out-ranks the floating map panels, and something moves that rank on a pointer;
 *  ⑤ the intensity column sits beside the distance, and a place name has a floor to be legible on
 *     one line;
 *  ⑥ loading an earthquake starts its clock at zero, and the unload button is not a circle;
 *  ⑦ the CJK face is chosen per LABEL and the renderer is actually told — the stack a symbol layer
 *     asks for is the family list MapLibre rasterises it with.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught ten rounds writing a check that trips on its own
 *  explanation of the defect. (This file's own prose names `border-radius:50%` and `Noto Sans
 *  Regular`, and #R252's own notes are still in the files being read.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① THE SWEEP CAN ACTUALLY MOVE ───────────────────────────────────────────────────────────── */
test('#R253 ① the indeterminate bar is declared so that its animation outranks the rule', () => {
  const css = code(read('css/intmap.css'));
  const rule = /\.tp-prog\.indet\s+\.tp-prog-fill\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the indeterminate rule is gone — if the bar changed shape, re-derive this check');
  const body = rule[1];

  /* THE PROPERTY: no important declaration in this rule may reset `background-position`, because an
     important author declaration ranks above CSS animations and the keyframes only move that one
     longhand. The `background` SHORTHAND resets it; the longhands do not. */
  assert.doesNotMatch(body, /(^|;)\s*background\s*:[^;]*!important/,
    'the shorthand is back: `background: … !important` resets background-position as an important '
    + 'declaration, which outranks the @keyframes and freezes the sweep at 0 %');
  assert.doesNotMatch(body, /background-position\s*:/,
    'this rule sets background-position itself — the animation is the only thing that may');
  assert.match(body, /background-image\s*:\s*var\(--prog-sweep\)/, 'the sweep gradient is no longer applied');
  /* …and the colour has to be cleared, or the fill paints solid accent behind the moving band */
  assert.match(body, /background-color\s*:\s*transparent/,
    'the inline `background:var(--prog-grad)` colour is not cleared — the whole bar reads as full');
  assert.match(body, /animation\s*:\s*imProgSweep/, 'the sweep animation is not applied');
  assert.match(css, /@keyframes imProgSweep\{[^}]*background-position/, 'the keyframes no longer move the band');
});

/* ── ② THE SMALL PLACE IS ASKED FOR WHERE IT IS ──────────────────────────────────────────────── */
test('#R253 ② the boundary lookup asks the neighbourhood before it asks the planet', () => {
  const mt = code(read('js/map-tools.js'));

  assert.match(mt, /bounded=1/,
    'the tight pass is gone: an unbounded viewbox is a HINT, so a 丁目 or a Kiez loses its ten result '
    + 'slots to bigger namesakes and its own polygon is never in the answer to be chosen from');
  /* the tight pass must come FIRST — a fallback that runs after the wide one changes nothing */
  const tight = mt.indexOf('bounded=1'), wide = mt.search(/const d=8,\s*vb=/);
  assert.ok(tight > -1 && wide > -1 && tight < wide, 'the bounded pass no longer runs before the wide one');
  /* #R59's rule survives: no polygon means nothing is drawn, never a box around a point */
  assert.match(mt, /if\(!polys\.length\) return null;/, 'the «no rectangle fallback» guard is gone');
  assert.doesNotMatch(mt, /boundingbox.*=>.*geojson\s*=\s*\{type:'Polygon'/, 'a bbox rectangle is being synthesised');
});

/* ── ③ THE COPY BUTTON SAYS WHAT IT COPIES ──────────────────────────────────────────────────── */
test('#R253 ③ the place popup copies the NAME, and says so in every language', () => {
  const ui = code(read('js/map-ui.js'));
  assert.match(ui, /class="plc-copy"[^>]*>\$\{window\.IntMapLang\.t\(HOST\.lang,'Copy name'/,
    'the copy button is back to a bare “Copy” — it must name what it copies');
  /* the four languages whose translations live in a table rather than in the argument list */
  for (const f of ['ui.fr.js', 'ui.ko.js', 'ui.zh.js', 'ui.zh-hans.js']) {
    assert.match(read(join('js', 'locales', f)), /["']Copy name["']\s*:/,
      `js/locales/${f} has no “Copy name” — that language shows the button in English`);
  }
  /* zh-Hans is DERIVED (#R224), so the authored side must carry it too or the next rebuild drops it */
  assert.match(read('scripts/zh/22-inline-r253.json'), /"Copy name"/,
    'the Traditional translation is only in the generated file — a rebuild of ui.zh.js would lose it');
});

/* ── ④ THE OPEN SIDEBAR IS IN FRONT ─────────────────────────────────────────────────────────── */
test('#R253 ④ an open sidebar out-ranks the floating panels, and the pointer moves that rank', () => {
  const css = code(read('css/intmap.css'));
  const m = /body:not\(\.im-float-front\)\s*\.sidebar,\s*body:not\(\.im-float-front\)\s*#layer-sidebar-r\{\s*z-index:(\d+)/.exec(css);
  assert.ok(m, 'the front-most band for the two sidebars is gone');
  const z = +m[1];
  /* it must clear the whole map-surface band and stay under the modal layer */
  assert.ok(z > 2500, `the sidebar band is ${z}; the context menu is 2500 and the country card 2200, so it still paints through`);
  assert.ok(z < 9999, `the sidebar band is ${z}; the modal overlay is 9999 and must never go behind a sidebar`);
  assert.match(css, /@media\(min-width:769px\)\{[^}]*body:not\(\.im-float-front\)/s,
    'the band is not scoped to desktop — on a phone the bottom sheet (1700) has to stay above the panel');

  const ui = code(read('js/map-ui.js'));
  assert.match(ui, /addEventListener\('pointerdown'[\s\S]{0,400}im-float-front/,
    'nothing toggles im-float-front on a pointer, so the class can never change');
  assert.match(ui, /maplibregl-canvas-container/,
    'the map canvas is not excluded — clicking the map would raise the map itself over the sidebar');
  assert.match(ui, /,\s*true\s*\)/, 'the listener is not in the capture phase — a handler that stops propagation would hide the gesture');
});

/* ── ⑤ THE TABLE ─────────────────────────────────────────────────────────────────────────────── */
test('#R253 ⑤ the intensity column follows the distance, and the place name has a floor', () => {
  const sq = code(read('js/seismic.js'));

  /* header order: Place, Δ km, intensity, then the arrivals */
  const head = /<thead><tr[^>]*>([\s\S]*?)<\/tr><\/thead>/.exec(sq);
  assert.ok(head, 'the per-place table head is gone — re-derive this check');
  const cols = head[1].split('<th').slice(1);
  assert.ok(/Δ /.test(cols[1]), 'the second column is no longer the distance');
  assert.ok(/Shindo|MMI/.test(cols[2]), 'the intensity column is not third — 「MMI/JMAをΔ kmの右に」');
  assert.ok(/>P</.test(cols[3]), 'the P arrival should follow the intensity');

  /* body order matches the head — a reorder of one alone is a silently wrong table */
  const row = /return '<tr><td class="sq-st-nm"[\s\S]*?<\/tr>'/.exec(sq);
  assert.ok(row, 'the per-place row is gone — re-derive this check');
  const cells = row[0].split('<td').slice(1);
  assert.ok(/a\.km/.test(cells[1]), 'the second cell is no longer the distance');
  assert.ok(/iCell\(/.test(cells[2]), 'the intensity chip is not in the third cell — head and body disagree');

  /* the name is one line, and it has room to be one. The declaration is written across a string
     concatenation, so the whole run up to the closing brace is what has to be read. */
  const nm = /\.sq-st-nm\{([\s\S]*?)\}/.exec(sq);
  assert.ok(nm, 'the .sq-st-nm rule is gone');
  const decl = nm[1].replace(/['"+\s]+/g, '');
  assert.match(decl, /white-space:nowrap/, 'the place name can wrap again');
  assert.match(decl, /text-overflow:ellipsis/, 'a name too long for the column would be cut with no sign of it');
  const min = /min-width:(\d+)px/.exec(decl);
  assert.ok(min && +min[1] >= 70,
    'the name column has no floor: `width:100%;max-width:0` makes it the only compressible column, so it '
    + 'absorbs the whole deficit and every row becomes an ellipsis (measured 35 px before the floor)');
});

/* ── ⑥ THE CLOCK AND THE BUTTON ─────────────────────────────────────────────────────────────── */
test('#R253 ⑥ a newly loaded earthquake starts at t = 0, and its unload button is square', () => {
  const sq = code(read('js/seismic.js'));

  const fn = /function applyEvent\(id\)\{[\s\S]*?\n    \}/.exec(sq);
  assert.ok(fn, 'applyEvent is gone — re-derive this check');
  assert.match(fn[0], /tSec=0/, 'loading an earthquake leaves the clock where the previous one was scrubbed to');
  /* the two routes that already did it must not have lost it */
  assert.match(/function clearEvent\(\)\{[\s\S]*?\n    \}/.exec(sq)[0], /tSec=0/, 'clearEvent no longer resets the clock');
  assert.match(/function applyReal\(f\)\{[\s\S]*?\n    \}/.exec(sq)[0], /tSec=0/, 'applyReal no longer resets the clock');

  const x = /'\.sq-ev-x\{([^']*)'/.exec(sq);
  assert.ok(x, 'the .sq-ev-x rule is gone');
  const r = /border-radius:(\d+)(px|%)/.exec(x[1]);
  assert.ok(r && r[2] === 'px' && +r[1] <= 12, `the unload button is ${r ? r[0] : 'unset'} — 「丸ではなく四角に」`);
});

/* ── ⑦ THE FACE FOLLOWS THE LABEL ───────────────────────────────────────────────────────────── */
test('#R253 ⑦ the CJK face is chosen per label, and the renderer is told which family a stack means', () => {
  const mt = code(read('js/map-typography.js'));
  const pl = code(read('js/place-labels.js'));

  /* the language is the APP's code, read back from the one registry list — not the BCP-47 tag */
  assert.doesNotMatch(mt, /window\.IM_HOST\s*&&\s*window\.IM_HOST\.lang/,
    'window.IM_HOST does not exist (it is a module-local const in js/app-body.js); reading it means '
    + 'the language silently becomes document.documentElement.lang, which is「ja」and not「jp」');
  assert.match(mt, /rows\[i\]\.html/, 'the html tag is no longer walked back through IntMapLang.LANGS');

  /* the choice itself, and the fact that a Latin UI is not exempt from it */
  assert.match(mt, /function placeFont\(\)/, 'placeFont is gone');
  assert.match(mt, /\['case',\s*\['any'\]\.concat/, 'placeFont no longer emits a per-feature case');
  assert.match(mt, /IntMapOsmNameKeys/,
    'the condition is a second copy of the language→key list instead of the one place-labels builds text-field from');
  assert.doesNotMatch(mt, /if \(l === 'zh-hans' \|\| l === 'zh' \|\| l === 'zh-hant'\) return own;/,
    'the Chinese settings are exempted again — Noto Sans TC cannot draw 区/渋/峠, so a Japanese place '
    + 'name under a Traditional UI goes back to two faces');

  /* ⚠ THE STACK NAME IS THE DELIVERY MECHANISM, so every face this can emit must be a REAL CSS
     family. MapLibre builds the rasteriser with `_createTinySDF(stack)` for any stack that is not
     the style-spec default, i.e. it reads the name as a font-family list — which is why the old
     «Noto Sans Regular» drew CJK from the system font. A name nobody has installed silently brings
     that defect straight back. */
  const src = /const HAN_ALL = ([\s\S]*?)\n  function placeFont/.exec(mt);
  assert.ok(src, 'HAN_ALL / _readerFaces are gone — re-derive this check');
  const faces = [...src[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(faces.length, 'placeFont/readerFont name no font families at all');
  for (const f of faces) {
    assert.ok(!/^Noto Sans (Regular|Italic)$/.test(f),
      `«${f}» is a glyph-server stack name, not an installed font family — MapLibre would rasterise CJK `
      + 'from the system sans-serif with it');
  }
  /* the two families that are not bundled have to be the ones index.html actually requests */
  const html = read('index.html');
  for (const f of ['Noto+Sans+JP', 'Noto+Sans+SC', 'Noto+Sans+TC']) {
    assert.ok(html.includes(f), `index.html does not load ${f.replace(/\+/g, ' ')} — the family named in text-font would not exist`);
  }

  /* the layers use it, and re-apply it when the language changes */
  assert.match(pl, /const FONT=MT\(\)\.placeFont\(\)/, 'the place layers no longer name their own faces');
  assert.match(pl, /setLayout\(id,'text-font',fontExpr\)/, 'applyLabelLang does not re-apply the face with the language');
  assert.match(pl, /'text-font':FONTSEA/, 'the sea gazetteer no longer takes the reader’s own stack');

  /* …and a stack name that is a font family must still resolve to a real glyph URL: `text-font`
     doubles as the {fontstack} of every non-locally-rasterised range (Arabic, Thai, Devanagari…). */
  assert.match(mt, /SERVER_STACK/, 'the glyph rewrite no longer folds the new stack names onto a stack the tile server serves');
  assert.match(mt, /const SERVER_STACK = 'Noto Sans Regular'/, 'the upstream stack is not named in the rewrite');
});
