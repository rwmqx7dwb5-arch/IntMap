/* ============================================================================
 *  R384 (nightly) — the accuracy caveat follows the reader's language, and does
 *                   not multiply while doing it
 * ----------------------------------------------------------------------------
 *  「凡例に、正確な位置を示しているわけではないという趣旨の文言を書いておいて。」
 *
 *  The gate half (tests/r384.spec.js) asks the card for Japanese directly and
 *  reads the English caveat, because a language SWITCH is the expensive part —
 *  it reloads a locale chunk and rebuilds every panel, and tests/r251-langs.spec.js
 *  measures that at about seven seconds a language. This file pays for it once,
 *  at night, and holds the two claims that only a switch can make:
 *
 *    · the caveat is translated, not merely present, in a language served by the
 *      INLINE TABLE (fr) as well as in a positional one (jp) — those are two
 *      different code paths through IntMapLang.pick();
 *    · and there is still exactly ONE of it afterwards. ensureGenericLegend()
 *      refreshes the description by REMOVING `.dl-desc` and re-adding it, so a
 *      caveat written as its sibling rather than its child would survive the
 *      removal and the box would grow a paragraph on every switch.
 *
 *  ⚠ THE NAME KEEPS IT OUT OF THE GATE. scripts/tiers.mjs pulls the highest
 *  `r<digits>.spec.js` into the core tier by construction; `r384-legend` does not
 *  match that shape, which is the same arrangement as r337-atlas and r353-live.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { layerOn, readCaveats, setLang } from './helpers/subcables.js';

test('R384 the legend’s accuracy caveat is translated, and stays a single paragraph', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 1: window.__imap never appeared'); });
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 2: the layer rows were never built'); });

  const see = async () => {
    let c = { shown: [] };
    for (let round = 0; round < 3 && !c.shown[0]; round++) {
      await layerOn(page, 'dl-subcables', 'lyr-subcables');
      c = await readCaveats(page, 'data-legend-subcables');
    }
    return c;
  };

  const en = await see();
  expect(en.error).toBeUndefined();
  expect(en.text.length, 'the legend has no accuracy caveat').toBe(1);
  expect(en.shown[0], 'the English caveat renders nothing — ' + JSON.stringify(en)).toBe(true);
  expect(en.text[0]).toMatch(/not the exact position of the cable/);

  /* jp — a POSITIONAL language (argument 1 of every L(…) call site) */
  const toJa = await setLang(page, 'jp');
  expect(toJa.ok, 'the Japanese pill never took: ' + JSON.stringify(toJa)).toBe(true);
  const ja = await see();
  expect(ja.text.length, 'the caveat multiplied across a language switch').toBe(1);
  expect(ja.shown[0], 'the Japanese caveat renders nothing — ' + JSON.stringify(ja)).toBe(true);
  expect(ja.inRenderedText[0], 'the Japanese caveat is not in the legend’s rendered text').toBe(true);
  expect(ja.text[0]).toContain('正確な');
  expect(ja.text[0]).toContain('近似');

  /* fr — served by the INLINE TABLE, keyed by the English string */
  const toFr = await setLang(page, 'fr');
  expect(toFr.ok, 'the French pill never took: ' + JSON.stringify(toFr)).toBe(true);
  const fr = await see();
  expect(fr.text.length, 'the caveat multiplied across a language switch').toBe(1);
  expect(fr.shown[0], 'the French caveat renders nothing — ' + JSON.stringify(fr)).toBe(true);
  expect(fr.inRenderedText[0], 'the French caveat is not in the legend’s rendered text').toBe(true);
  expect(fr.text[0]).toMatch(/approximatifs/);
  expect(fr.text[0], 'the French caveat fell back to English').not.toMatch(/Routes are approximate/);
});
