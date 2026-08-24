/* ============================================================================
 *  #R395 — switching the volcano layer on, and the language, from a spec
 * ----------------------------------------------------------------------------
 *  ⚠ IDEMPOTENT, AND EVERY CALLER CALLS IT. CI shards the suite, so a shard that gets only the
 *  second file must not assume the first one switched the layer on — that is the failure #R353
 *  measured on its own first CI run («Target page has been closed» after a 60 s wait for a layer
 *  nobody had asked for). Calling it twice on one page costs one `if`.
 *
 *  ⚠ IT LIVES HERE, NOT INSIDE THE SPEC. tests/r395.spec.js is the round's gate half and the volcano
 *  layer has other specs beside it; a copy of this door in each file is the one-behaviour-two-
 *  implementations shape this project keeps paying for.
 * ==========================================================================*/

/** Aira, Sakurajima's caldera: every field populated, and it is in Japan */
export const AIRA = 282080;

export async function volcanoLayerOn(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  /* ⚠ THE ROW TOGGLES ON pointerdown, NOT ON THE CHECKBOX'S click (#R37) — see tests/r341.spec.js. */
  await page.evaluate(() => {
    const cb = document.getElementById('beta-dl-volc2');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  await page.waitForFunction(
    () => { try { return (window.__imVolcLayer && window.__imVolcLayer.count()) > 1000; } catch (_) { return false; } },
    null, { timeout: 60000 },
  );
}

/** the language switch is `#lang-<code>`, a closure in js/app-body.js — there is no window.setLanguage.
 *  ⚠ WAIT FOR THE REGISTRY, NOT FOR A CLOCK. A fixed sleep is both slower than it needs to be and
 *  wrong when the machine is busy: what the caller actually needs is the locale table to have
 *  ARRIVED, which `IntMapLang.isLoaded` answers. (#R395 — this file stands in the push gate, and the
 *  gate's whole budget is 40 s.) */
export const setLang = async (page, code) => {
  await page.evaluate((c) => document.getElementById('lang-' + c)?.click(), code);
  await page.waitForFunction((c) => {
    try { return window.IntMapLang.isLoaded ? window.IntMapLang.isLoaded(c) : true; } catch (_) { return false; }
  }, code, { timeout: 20000 });
};
