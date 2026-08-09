/* ============================================================================
 *  R210 — the round's own spec.  ONE boot, several questions (#R207's budget rule).
 * ----------------------------------------------------------------------------
 *  What this round changed that only a running app can answer:
 *
 *  ①  The graticule really is white, really carries a casing under it, and really draws BOTH
 *     tropics — and it appears WITHOUT waiting for turf (the gate that was the reported delay).
 *  ②  A place label yields to a map-level click owner. #R207's registry only knew about layers
 *     wired through `onLayer('click')`; the mechanism now is a CLAIM, so this asks the claim
 *     question the way the app asks it, through the engine contract.
 *  ③  A SAVED answer for the right layer panel still wins. (The unanswered/first-visit branch
 *     is a source check — see the note on that test: a second boot is the whole price of a spec.)
 *  ④  The day/night side can be switched off from Settings and the answer survives a reload.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { SESSION_KEY, BASE } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); } catch (_) {}
  }, [SESSION_KEY, '{"v":2,"defv":190,"layers":[],"lsrOpen":false}']);
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 60_000 });
});
test.afterAll(async () => { await page?.close(); });

test('R210 ①: the graticule is white, cased, and draws both tropics', async () => {
  /* ⚠ read the SERIALIZED style, not `layers.get(id).paint` — the renderer's layer object does not
     carry a `paint` bag, so that route returns undefined and the assertion passes vacuously. */
  const paint = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    let ls = [];
    try { ls = E.scene.getStyle().layers || []; } catch (_) {}
    const get = (id) => { const l = ls.find((x) => x.id === id); return l ? (l.paint || {}) : null; };
    return { line: get('grid-lines'), casing: get('grid-lines-casing'), tropic: get('grid-tropic') };
  });
  expect(paint.line, 'grid-lines exists').toBeTruthy();
  expect(paint.casing, 'a casing is drawn under it — white over a light basemap is otherwise invisible').toBeTruthy();
  expect(paint.tropic, 'the tropics are their own layer').toBeTruthy();
  expect(String(paint.line['line-color'])).toMatch(/#ffffff|rgba?\(255,\s*255,\s*255/i);
  expect(String(paint.tropic['line-color'])).toMatch(/#f4b740/i);

  /* ⚠ the reported defect was that switching Grid ON drew nothing until the camera next moved.
     Drive it the way the app drives it (Atlas — the standing "every feature is operable from
     Atlas" rule) and then ask the renderer whether the lines are actually there. The SOURCE-level
     claim — that the builder needs no turf at all — is in tests/r210-checks.test.mjs, where it
     costs nothing to state. */
  await page.evaluate(async () => { try { await window.IntMapConsole.dispatch({ type: 'grid', on: true }); } catch (_) {} });
  /* ⚠ POLL, do not sleep. The first draft waited a flat 900 ms and passed on the development
     machine and failed on CI, where there is no GPU: the rebuild is debounced 90 ms and the
     features still have to reach a painted frame. What the assertion is about is that the lines
     arrive WITHOUT the camera being touched — not that they arrive inside any particular
     millisecond — so it waits for the condition instead of guessing at a duration. */
  await page.waitForFunction(() => {
    try {
      const E = window.IntMapGeoEngine;
      return (E.coords.queryRenderedFeatures({ layers: ['grid-lines'] }) || []).length > 0
          && (E.coords.queryRenderedFeatures({ layers: ['grid-lines-casing'] }) || []).length > 0;
    } catch (_) { return false; }
  }, null, { timeout: 20_000 });

  const kinds = await page.evaluate(() => {
    try {
      const s = window.IntMapGeoEngine.scene.getStyle();
      return s.layers.filter((l) => /^grid-/.test(l.id)).map((l) => l.id).sort();
    } catch (_) { return []; }
  });
  expect(kinds).toEqual(expect.arrayContaining([
    'grid-equator', 'grid-labels', 'grid-lines', 'grid-lines-casing', 'grid-prime', 'grid-tropic',
  ]));
});

test('R210 ②: a click can be CLAIMED, and the claim is answered for that same event', async () => {
  const r = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    if (!E.events.claimClick || !E.events.clickClaimed) return { missing: true };
    const a = { originalEvent: { tag: 'a' } };
    const b = { originalEvent: { tag: 'b' } };
    const before = E.events.clickClaimed(a);
    E.events.claimClick(a);
    return { missing: false, before, sameEvent: E.events.clickClaimed(a), otherEvent: E.events.clickClaimed(b) };
  });
  expect(r.missing, 'the contract publishes claimClick/clickClaimed').toBe(false);
  expect(r.before, 'nothing is claimed until someone claims it').toBe(false);
  expect(r.sameEvent, 'the owner of THIS DOM event is recognised').toBe(true);
  /* the whole point of identity over a timer: a stale claim can never swallow a later click */
  expect(r.otherEvent, 'a different DOM event is not claimed').toBe(false);
});

test('R210 ③: a saved lsrOpen:false keeps the layer panel closed', async () => {
  /* ⚠ THE OTHER HALF — "no saved answer opens it" — IS NOT TESTED HERE ON PURPOSE. It needs a
     SECOND boot, and a boot is the whole price of a spec (#R207: 表明はタダ、起動が全額). Measured:
     the second page cost 15.2 s against a core ceiling of 66 s, for a branch whose logic is one
     expression. So the branch is asserted at source level (tests/r210-checks ⑥, free) and what
     runs here is the half that shares this file's one boot: a SAVED answer still wins, which is
     the property a regression would actually break. */
  const closed = await page.evaluate(() => {
    const el = document.getElementById('layer-sidebar-r');
    return { open: el ? el.classList.contains('open') : null, ui: window._imSessionUI };
  });
  expect(closed.ui, 'the session state the panel reads is published').toBeTruthy();
  expect(closed.ui.right, 'and it carries the saved answer, not null').toBe(false);
  expect(closed.open, 'this page booted with lsrOpen:false and must stay closed').toBe(false);
});

test('R210 ④: the day/night side can be turned off, and it stays off', async () => {
  const off = await page.evaluate(() => {
    const N = window.IntMapNightSide;
    if (!N || !N.setEnabled || !N.isOn) return null;
    N.setEnabled(false);
    return { on: N.isOn(), stored: localStorage.getItem('intmap_night_side') };
  });
  expect(off, 'IntMapNightSide publishes setEnabled/isOn').not.toBeNull();
  expect(off.on).toBe(false);
  expect(off.stored, "off is the only state that writes a key — an absent key means on").toBe('0');

  const back = await page.evaluate(() => {
    window.IntMapNightSide.setEnabled(true);
    return { on: window.IntMapNightSide.isOn(), stored: localStorage.getItem('intmap_night_side') };
  });
  expect(back.on).toBe(true);
  expect(back.stored, 'switching it back removes the key rather than writing a second truth').toBeNull();
});
