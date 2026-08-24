/* ============================================================================
 *  R395 — the claim that must hold on EVERY push
 *   a volcano card opened in Japanese is Japanese ALL THE WAY DOWN — the classifications too, not
 *   only the labels — and the paragraph the Smithsonian wrote is shown with the language it was
 *   published in named, rather than silently left in English.
 *
 *  ⚠ THIS IS THE ROUND'S WHOLE REPORT: 「クリックしたら出てくるカードの情報が翻訳されていない。」
 *  Before this round the same card in Japanese read 「火山の型 Stratovolcano」「構造区分 Subduction
 *  zone / Continental crust (> 25 km)」 — every label translated, every value English — while
 *  `npm run check:i18n` printed 100 %, correctly, because an upstream value that reaches the DOM is
 *  not a call site and so is in no instrument's denominator.
 *
 *  ⚠ IT NEEDS NO FEED. Everything asserted here comes from the two bundled files and the reader's
 *  language, so it is true whether or not USGS, JMA or the Smithsonian answered this minute — the
 *  #R341 rule: a gate that goes red because somebody else had a bad afternoon is a gate people
 *  learn to ignore.
 *
 *  ⚠ AND IT IS THE CHEAP HALF ON PURPOSE. scripts/tiers.mjs puts the current round's `rNNN.spec.js`
 *  in the gate WHATEVER it costs (`coreNames()` ignores CORE_MAX_S for it), and the gate's ceiling
 *  is 50 s against 42 s of always-on suites. So the narrowing, the master clock and the
 *  language-switch-back live in tests/r395-layer.spec.js, whose name the «r + digits» rule does not
 *  pull into the gate — the same split #R337 made for the same reason.
 *
 *  ⚠ THE SHARED FIXTURE, NOT A BOOT OF ITS OWN — see the note at the top of tests/r341.spec.js.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { volcanoLayerOn, setLang, AIRA } from './helpers/volcano.js';

test('R395 ① the card’s values are in the reader’s language, and its prose says which language it is in', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);
  await setLang(page, 'jp');

  const opened = await page.evaluate(async (v) => {
    const r = await window.IntMapOS.exec('volcano.open', { source: 'test', params: { v } });
    return r && r.ok !== false;
  }, AIRA);
  expect(opened).toBe(true);
  await page.waitForSelector('#volc-popup', { state: 'visible', timeout: 30000 });

  /* the tab whose nine rows are the catalog's own classifications */
  await page.evaluate(() => document.querySelector('[data-tab="about"]').click());
  await page.waitForFunction(() => /282080/.test(document.getElementById('volcp-body').textContent), null, { timeout: 30000 });
  /* ⚠ THE ROWS, NOT THE WHOLE PANEL. The geological summary below them is English ON PURPOSE (it is
     a paragraph the Smithsonian wrote), and it says «Japan» and «caldera» in its own prose — so an
     English-absence assertion over the whole body would be testing the thing this round decided to
     keep. The nine key/value rows are exactly what had to change. */
  const rows = await page.evaluate(() => [...document.querySelectorAll('#volcp-body .acp-row')].map((r) => r.textContent).join(' ⏐ '));
  const about = await page.evaluate(() => document.getElementById('volcp-body').textContent);

  /* ⚠ ASSERT THE JAPANESE IS THERE **AND** THE ENGLISH IS GONE. Only the second half can fail for
     the reason this round exists: a card that appends a translation while still printing the
     English would satisfy a «contains 成層火山» check and still be the bug. */
  expect(rows, 'the volcano type is translated').toMatch(/カルデラ|成層火山/);
  expect(rows, 'the tectonic setting is translated').toMatch(/沈み込み帯/);
  expect(rows, 'the magma composition is translated').toMatch(/安山岩|玄武岩|デイサイト|流紋岩/);
  expect(rows, 'the country comes from CLDR, not from the catalog string').toMatch(/日本/);
  expect(rows, 'the GVP volcano type must not still be printed in English').not.toMatch(/Stratovolcano|Caldera/);
  expect(rows, 'the tectonic setting must not still be printed in English').not.toMatch(/Subduction zone/);
  expect(rows, 'the country must not still be the catalog’s English string').not.toMatch(/\bJapan\b/);

  /* the geological summary is NOT translated — and the card says so, in Japanese */
  expect(await page.locator('#volcp-body .volc-orig').count(),
    'the paragraph the Smithsonian wrote must carry a line naming the language it was published in').toBeGreaterThan(0);
  expect(about).toMatch(/英語で公表|そのまま表示/);
});
