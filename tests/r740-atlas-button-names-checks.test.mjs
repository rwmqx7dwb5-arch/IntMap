/* ══ R740 — the accessible name a button gets must be the button's own ══════════════════════════
 *
 *  Measured in the production DOM (logged in, 2026-09-15):
 *
 *    document.querySelectorAll('[data-imname]').length                        → 441
 *    …of which the aria-label contradicted the element's own title            → 13
 *
 *  All thirteen announced themselves as "close: <container>". Among them:
 *
 *    .atl-go          title "Send"                     → aria-label "close: atlas panel"
 *    .atl-map-toggle  title "Show / hide on the map"    → aria-label "close: atlas panel"
 *    .atl-jump        title "Jump to latest"            → aria-label "close: atlas panel"
 *    .alc-x           title "Hide"                      → aria-label "close: layer active section"
 *    .accent-sw ×9    title "Default"/"Indigo"/…        → aria-label "close: accent picker"
 *
 *  A screen-reader user pressing what was announced as "close the Atlas panel" SENT the question;
 *  Atlas itself resolves controls by aria-label (`findControl`), so 「Atlasパネルを閉じて」 could
 *  reach the Send button. The cause was one guard: `if(t2 && !/^[××✖xX]$/.test(t2)) return` — the
 *  test meant to confirm "this element is a ×" let through exactly the elements with no text at
 *  all, i.e. every icon-only button.
 *
 *  This check EVALUATES the shipped sweep (#R505) against a DOM built here, rather than reading it.
 * ============================================================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const SRC = codeOnly(readFileSync(new URL('../js/atlas-controls.js', import.meta.url), 'utf8'));
const GENERIC = 'button:not([aria-label]), [role="button"]:not([aria-label])';

function el({ title, text, id, hostId }) {
  const attrs = Object.create(null);
  if (title != null) attrs.title = title;
  const host = hostId ? { id: hostId } : null;
  return {
    id: id || '', textContent: text == null ? '' : text, attrs,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = v; },
    closest: () => host,
    get aria() { return 'aria-label' in attrs ? attrs['aria-label'] : null; },
  };
}

/* the shipped sweep, run. Everything it reaches for is supplied; every selector but the generic
   one answers with nothing, so this measures that one rung and not the twelve beside it. */
function sweepOver(nodes) {
  const body = liftFunction(SRC, '_uiNameSweep');
  const doc = { querySelectorAll: (sel) => (sel === GENERIC ? nodes : []) };
  const win = { IntMapLang: { t: (_l, en) => en } };
  const fn = new Function('document', 'window', 'HOST', '_name', '_rowLbl',
    body + '\n;return _uiNameSweep;')(doc, win, { lang: 'en' },
    (e, txt) => { e.setAttribute('aria-label', txt); e.setAttribute('data-imname', '1'); },
    () => '');
  fn();
}

test('R740 ① a button that carries its own title keeps it — the sweep never renames it "close"', () => {
  const send = el({ title: 'Send', text: '', hostId: 'atlas-panel' });          /* .atl-go: SVG only */
  const toggle = el({ title: 'Show / hide on the map', text: '', hostId: 'atlas-panel' });
  const swatch = el({ title: 'Indigo', text: '', hostId: 'accent-picker' });
  sweepOver([send, toggle, swatch]);
  assert.equal(send.aria, 'Send', 'the Send button must announce itself as Send');
  assert.equal(toggle.aria, 'Show / hide on the map');
  assert.equal(swatch.aria, 'Indigo');
  for (const e of [send, toggle, swatch]) {
    assert.ok(!/^close: /.test(String(e.aria)),
      `a button whose own title says otherwise must never be named "${e.aria}"`);
  }
});

test('R740 ② a real ×-button is still named for the container it closes', () => {
  const x = el({ text: '×', hostId: 'weather-card' });
  const x2 = el({ text: ' ✖ ', hostId: 'satellite-card' });
  sweepOver([x, x2]);
  assert.equal(x.aria, 'close: weather card');
  assert.equal(x2.aria, 'close: satellite card');
});

test('R740 ③ an icon-only button with no name of its own is left unnamed, not misnamed', () => {
  const icon = el({ text: '', hostId: 'some-panel' });                 /* SVG only, no title */
  const blank = el({ title: ' ', text: '', hostId: 'some-panel' });    /* a title that says nothing */
  sweepOver([icon, blank]);
  assert.equal(icon.aria, null,
    'no name is honest and the audit counts it; a wrong name is a handle Atlas will act on');
  assert.equal(blank.aria, null);
});

test('R740 ④ the guard that caused it cannot come back', () => {
  const body = liftFunction(SRC, '_uiNameSweep');
  assert.ok(!/t2\s*&&\s*!\/\^\[/.test(body),
    'the close test must confirm the glyph is present, not skip the check when there is no text at all');
});
