/* ============================================================================
 *  atlas-glass-look · three things the reader saw on one screen (2026-11-18)
 * ----------------------------------------------------------------------------
 *  ① The floating Atlas answer was a stack of dark bands — every line of the text its own frosted run
 *     (box-decoration-break:clone), the legend a card, the controls chips. The reader chose «text only» from three
 *     shots: no piece of an answer paints a surface; the glyphs carry a halo; the input row is quiet until used.
 *  ② The place search filled its list with the gallery, «Explore» and the phone doors as soon as it was focused.
 *     The reader asked for that to go; the list now opens only for typed text.
 *  ③ The satellite ocean showed tile-sized squares. Esri's «no imagery» tile was recognised as «≤ 3,500 bytes»,
 *     and real uniform-sea tiles are that small (7/49/116 = 2,925 B, measured), so real sea was replaced by an
 *     up-scaled crop of a lower zoom. It is now recognised by its bytes; both resolvers ask the same function.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isImageryPlaceholder } from '../js/esri-imagery.js';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* the float module's stylesheet, as the module builds it: the quoted pieces of `const CSS = … ;` joined */
function floatCss() {
  const src = codeOnly(read('js/atlas-float.js'));
  const a = src.indexOf('const CSS =');
  const b = src.indexOf("';\n", a);
  const body = src.slice(a, b + 2);
  return [...body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join('');
}
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), decl: m[2] }));

test('① no rule that reaches the answer paints a surface or a per-line run', () => {
  const css = floatCss();
  assert.doesNotMatch(css, /box-decoration-break:clone/, 'no line of the answer is its own box');
  const answer = rules(css).filter((r) => /\.atl-b\.a\b/.test(r.sel));
  assert.ok(answer.length > 3, 'the answer rules were found');
  for (const r of answer) {
    assert.doesNotMatch(r.decl, /background:(?!none)|backdrop-filter:(?!none)/, `${r.sel} paints no surface`);
  }
  const reset = answer.find((r) => /\.atl-cmp/.test(r.sel) && /background:none/.test(r.decl));
  assert.ok(reset, 'the legend card, the chips and the text are reset to no surface in one rule');
});

test('① legibility is the glyphs\' halo, set once on the conversation, white ink with a dark halo (2026-11-26)', () => {
  const css = floatCss();
  assert.match(css, /#atlas-float #atlas-panel \.atl-chat\{text-shadow:[^}]*rgba\(var\(--atl-halo\)/, 'one inherited halo');
  /* 2026-11-26 (the reader: white text with a glow, no grey): the ink is white in BOTH themes, so the halo is dark in both */
  assert.match(css, /#atlas-float\{--atl-halo:0,0,0;\}/, 'a dark halo round white ink, whatever the theme');
  assert.match(css, /\.atl-chat\{[^}]*--text-muted:#fff/, 'no grey ink on the map');
  assert.match(css, /#atlas-float:not\(\.bg\) #atlas-panel \.atl-chat \.atl-b\.u:not\(\.atl-imgrow\)\{background:none/, 'off the pane the reader question is text with the same halo, not a bubble');
});

test('① the input row is quiet at rest, edged on hover, a surface while focused', () => {
  const css = floatCss();
  const r = rules(css);
  const rest = r.find((x) => x.sel === '#atlas-float #atlas-panel .atl-inbar');
  const hover = r.find((x) => x.sel === '#atlas-float #atlas-panel .atl-inbar:hover');
  const focus = r.find((x) => x.sel === '#atlas-float #atlas-panel .atl-inbar:focus-within');
  assert.ok(rest && hover && focus, 'three states');
  const pct = (d) => Number((/popup-bg\) (\d+)%/.exec(d) || [])[1]);
  assert.ok(pct(focus.decl) > pct(rest.decl), 'focus is more surface than rest');
  assert.match(rest.decl, /box-shadow:none/);
  assert.match(focus.decl, /box-shadow:0 /);
});

test('② the place search has no empty state: focusing it draws nothing', () => {
  const src = read('js/search-geocode.js');
  assert.doesNotMatch(src, /addEventListener\('focusin'/, 'nothing listens for the field being focused');
  assert.doesNotMatch(src, /\.(showInResults|showEntry)\(/, 'nothing draws the gallery strip or the phone doors into its list');
  assert.match(src, /data-im-gallery/, 'the gallery\'s own control still opens it');
  /* the doors the strip held are still reachable — the phone sheet's home draws the same two (js/start-home.js) */
  const home = read('js/start-home.js');
  assert.match(home, /import \{ entryRow \} from '\.\/here-entry\.js'/);
  assert.match(home, /G\.showInResults\(gal/);
});

test('③ the «no imagery» tile is recognised by its bytes — a small real sea tile is imagery', () => {
  /* 2,925 B: the size of the real tile 7/49/116 measured on 2026-11-18. Any content of that size is not the placeholder. */
  assert.equal(isImageryPlaceholder(new Uint8Array(2925).fill(0x7f)), false, 'below the old threshold, still imagery');
  assert.equal(isImageryPlaceholder(new Uint8Array(2521)), false, 'the placeholder\'s length alone is not enough');
  assert.equal(isImageryPlaceholder(new ArrayBuffer(3065)), false, 'an ArrayBuffer is read the same way');
  /* the positive case needs Esri's own bytes, so it is asked against the live service: tests/prod-smoke.spec.js */
});

test('③ both resolvers — the worker and the main-thread fallback — ask the same function, and no size threshold remains', () => {
  for (const f of ['js/sat-proto.js', 'src/sat-worker.js']) {
    const s = read(f);
    assert.match(s, /placeholder: isImageryPlaceholder\(buf\)/, f + ' asks js/esri-imagery.js');
    assert.doesNotMatch(s, /byteLength\s*<=/, f + ' has no byte-length test of its own');
  }
});
