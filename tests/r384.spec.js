/* ============================================================================
 *  R384 — the cable card answers in the reader's language, and the legend says
 *         the line is not the cable's exact position
 * ----------------------------------------------------------------------------
 *  「クリックしたら出てくるカードの情報が翻訳されていない。凡例に、正確な位置を
 *    示しているわけではないという趣旨の文言を書いておいて。」
 *
 *  tests/r384-checks.test.mjs proves the join keys are in the data and the code
 *  reaches for them. Neither of those is the claim. The claim is that a reader
 *  in Japanese sees Japanese, and only the browser can answer it: CLDR lives in
 *  the browser, `_imCldrRegion` is a runtime lookup, and the string that made
 *  #R355's gate read 100 % while the card read English was in the DATA.
 *
 *  ⚠ THE CARD IS BUILT, NOT CLICKED. `pick()` is map-relative and
 *  `page.mouse.click` is viewport-relative — #R352 lost a whole verification
 *  round to that 400 px, and a synthetic MouseEvent never reaches MapLibre at
 *  all. The popup's HTML comes from the module's own `_cableHtml` /
 *  `_landingHtml`, which is the function the click handler calls, with the meta
 *  the app itself fetched. tests/r355.spec.js is what proves the click path.
 *
 *  ⚠⚠⚠ AND THE LEGEND HALF ASKS WHETHER THE CAVEAT IS *RENDERED*. The first
 *  version of this file read `textContent` and passed while the caveat was
 *  invisible on the shipped build: the class it had then, `dl-note`, was ALREADY
 *  the layer row's date note (js/data-layers.js ~1078), which is `display:none`
 *  until a date is set. Nine translations, one <div>, zero pixels — and a green
 *  test. `textContent` walks hidden nodes; `offsetHeight` does not.
 *
 *  ⚠ THE CHEAP HALF. scripts/tiers.mjs puts this round's own `rNNN.spec.js` in
 *  the gate by construction and scripts/test-budget.mjs caps that gate at 36 s
 *  for every file in it, so this one runs on the WORKER'S SHARED PAGE
 *  (tests/helpers/app.js — #R208's mechanism, and what keeps tests/r379.spec.js
 *  at 2 s) and never switches the interface language: the card is asked for
 *  Japanese directly, and the caveat's DUPLICATION risk is exercised by
 *  refreshing the legend rather than by paying for a language change.
 *  Everything that needs a real language switch is tests/r384-legend.spec.js,
 *  which is named so that tiers.mjs's «r + digits» rule leaves it in nightly.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { layerOn, readCaveats } from './helpers/subcables.js';

test('R384 the cable card answers in Japanese, and the legend carries the accuracy caveat', async ({ app }) => {
  test.setTimeout(180000);
  const page = app.page;

  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 1: the layer rows were never built'); });

  const on = await layerOn(page, 'dl-subcables', 'lyr-subcables');
  expect(on.visible, 'stage 2: the cable layer never became visible — ' + JSON.stringify(on)).toBe(true);
  await page.waitForFunction(() => !!window.IntMapSubcableInfo, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 3: js/subcable-info.js never loaded'); });

  /* ── ① the card, asked for Japanese ─────────────────────────────────────── */
  const ja = await page.evaluate(async () => {
    const inst = window.IntMapSubcableInfo({ lang: 'jp' });
    const meta = await inst._loadMeta();
    if (!meta) return { error: 'no meta' };
    const strip = (h) => h.replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/\n{2,}/g, '\n').trim();
    /* a cable with several countries, a month-form RFS and a thousands separator */
    const id = Object.keys(meta.cables).find(k => {
      const c = meta.cables[k];
      return c.countries && c.countries.length >= 2 && c.rfsMonth && c.lengthKm >= 1000
        && c.countryCodes.every(Boolean) && c.landingPoints.length >= 2;
    });
    if (!id) return { error: 'no suitable cable in the meta' };
    const c = meta.cables[id];
    const lpId = Object.keys(meta.landingPoints).find(k => meta.landingPoints[k].cc === 'ID');
    return {
      id,
      englishCountries: c.countries,
      card: strip(inst._cableHtml({ id, name: c.name, quality: 'reconstructed', src: 'recon' }, [])),
      landing: lpId ? strip(inst._landingHtml({ id: lpId, name: meta.landingPoints[lpId].name }, { lat: 35.1, lng: 139.2 })) : null,
      cldr: window._imCldrRegion ? window._imCldrRegion('ID', 'jp') : null,
    };
  });
  expect(ja.error, 'building the Japanese card').toBeUndefined();

  /* the countries row is Japanese, and the English names it was handed are gone */
  for (const en of ja.englishCountries) {
    expect(ja.card, 'the card still prints the English country «' + en + '»').not.toContain(en);
  }
  expect(ja.cldr, 'CLDR cannot name a region in Japanese in this browser').toBe('インドネシア');
  expect(ja.card, 'the card has no Japanese at all').toMatch(/[ぁ-んァ-ン一-龥]/);
  /* 「2000 August」 became a date and 「1,041 km」 kept its separator */
  expect(ja.card, 'the RFS row is still English prose').not.toMatch(/\b(January|February|March|April|June|July|August|September|October|November|December)\b/);
  expect(ja.card, 'the RFS row is not a Japanese date').toMatch(/\d{4}年\d{1,2}月/);
  expect(ja.card).toMatch(/\d,\d{3} km/);

  /* the landing card names the country in Japanese, and its name's country tail too */
  expect(ja.landing, 'no Indonesian landing point in the meta').not.toBeNull();
  expect(ja.landing).toContain('インドネシア');
  expect(ja.landing, 'the landing point’s name still ends in the English country').not.toMatch(/, Indonesia\b/);

  /* ── ② the caveat is in the legend, and it is on the screen ──────────────── */
  let caveats = { shown: [] };
  for (let round = 0; round < 3 && !caveats.shown[0]; round++) {
    if (round) await layerOn(page, 'dl-subcables', 'lyr-subcables');
    caveats = await readCaveats(page, 'data-legend-subcables');
  }
  expect(caveats.error).toBeUndefined();
  expect(caveats.text.length, 'the legend has no accuracy caveat').toBe(1);
  expect(caveats.shown[0], 'the caveat is in the DOM but renders nothing — ' + JSON.stringify(caveats)).toBe(true);
  expect(caveats.inRenderedText[0], 'the caveat is not in the legend’s rendered text').toBe(true);
  expect(caveats.text[0]).toMatch(/not the exact position of the cable/);

  /* ── ③ …and refreshing the legend leaves ONE of it ───────────────────────── */
  /* ⚠ THIS IS THE MECHANISM A LANGUAGE SWITCH USES, WITHOUT PAYING FOR ONE.
     ensureGenericLegend() refreshes the description block by REMOVING `.dl-desc`
     and re-adding it; a caveat written as its SIBLING would survive the removal
     and the box would grow a paragraph every time the reader changed language.
     Calling the app's own refresh twice asks exactly that question for free —
     tests/r384-legend.spec.js asks it again through the pill, at night. */
  const afterRefresh = await page.evaluate(() => {
    window._ensureGenericLegend('subcables');
    window._ensureGenericLegend('subcables');
    const el = document.getElementById('data-legend-subcables');
    return { caveats: el.querySelectorAll('.dl-caveat').length, descs: el.querySelectorAll('.dl-desc').length };
  });
  expect(afterRefresh, 'the caveat multiplied when the legend was refreshed').toEqual({ caveats: 1, descs: 1 });
});
