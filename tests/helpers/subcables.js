/* ============================================================================
 *  IntMap · test helper — SWITCH THE CABLE LAYER ON, AND READ ITS LEGEND (#R384)
 * ----------------------------------------------------------------------------
 *  Shared by tests/r384.spec.js (gate) and tests/r384-legend.spec.js (nightly),
 *  because both halves need the same two awkward waits and a second copy of an
 *  awkward wait is a second thing to get wrong.
 *
 *  ⚠ THE ROW IS TICKED UNTIL IT TAKES, AND CAN GO OFF AGAIN. One pointerdown /
 *  pointerup pair is what every other spec sends and it is enough when nothing
 *  else is settling in the same tick. This layer is different: addSubcables()
 *  fetches a 2 MB dataset behind a retry ladder that ends in autoUncheck()
 *  (#R355), and on a headless runner that ladder really is reached — MEASURED
 *  here as `box:false` / `visibility:none` AFTER the layer had already reported
 *  visible. So the row is re-asserted rather than waited on longer.
 *
 *  ⚠ AND THE LEGEND FOLLOWS THE ROW. `.data-legend` is `display:none` by default
 *  and the layer's ON handler is what shows it, so a wait for the ELEMENT
 *  measures a legend that was never on screen. Ask for the computed display.
 * ==========================================================================*/

/** tick the row until the renderer says the layer is visible */
export const layerOn = (page, cbId, lyrId) => page.evaluate(async ({ cb: cbId2, lyr }) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = () => {
    try { const E = window.IntMapGeoEngine; return E.layers.has(lyr) && E.layers.getLayout(lyr, 'visibility') === 'visible'; }
    catch (_) { return false; }
  };
  for (let round = 0; round < 5 && !visible(); round++) {
    const cb = document.getElementById(cbId2);
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach(t => row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
    for (let i = 0; i < 120 && !visible(); i++) await sleep(100);
  }
  const cb = document.getElementById(cbId2);
  return { visible: visible(), box: !!(cb && cb.checked), autoOff: cb && cb.dataset ? cb.dataset.imAutoOff : null };
}, { cb: cbId, lyr: lyrId });

/** the legend's accuracy caveats, and whether each one RENDERS
 *
 *  ⚠ RENDERED, not merely present. The first version of this asked for
 *  `textContent`, which walks hidden nodes, and passed while the caveat was
 *  invisible: the class it had then, `dl-note`, was already the layer row's date
 *  note and is `display:none` until a date is set. Nine translations, one div,
 *  zero pixels, and a green test. */
export const readCaveats = (page, legendId) => page.evaluate(async (id) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const shownOf = (n) => n.offsetHeight > 0 && n.offsetWidth > 0
    && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden';
  let el = null, seen = [];
  for (let i = 0; i < 120; i++) {
    el = document.getElementById(id);
    seen = el ? [...el.querySelectorAll('.dl-caveat')] : [];
    if (seen.length && seen.every(shownOf)) break;
    await sleep(100);
  }
  if (!el) return { error: 'no legend ' + id };
  return {
    text: seen.map(n => n.textContent.trim()),
    shown: seen.map(shownOf),
    inRenderedText: seen.map(n => el.innerText.includes(n.textContent.trim().slice(0, 12))),
    legendDisplay: getComputedStyle(el).display,
  };
}, legendId);

/** switch the way a reader does — the pill — and prove it took (#R251) */
export const setLang = (page, lang) => page.evaluate(async (code) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let btn = null;
  for (let i = 0; i < 100 && !btn; i++) { btn = document.getElementById('lang-' + code); if (!btn) await sleep(50); }
  if (!btn) return { ok: false, why: 'no #lang-' + code };
  btn.click();
  const tag = window.IntMapLang.htmlTag(code);
  for (let i = 0; i < 120; i++) {
    if (window.IntMapLang.isLoaded(code) && document.documentElement.getAttribute('lang') === tag) break;
    await sleep(50);
  }
  await sleep(160);
  return { ok: window.IntMapLang.isLoaded(code) && document.documentElement.getAttribute('lang') === tag };
}, lang);
