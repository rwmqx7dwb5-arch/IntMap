// R508 runtime test — 「Terms of Service · Privacy Policy をクリックして読もうとしても、設定に邪魔
// されて読めない。」
//
// ⚠ WHY THIS IS A BROWSER TEST AND NOT A SOURCE CHECK. The defect is a computed z-index, produced by
// three files agreeing: `.im-front{z-index:2650 !important}` in css/intmap.css, the `.modal-overlay`
// z-index of 9999 in the same file, and the `panelOf` walk in js/map-ui.js that decides which element
// wears the mark. No one of those three is wrong when read on its own — reading the source is how
// this survived five rounds of `.im-front` work (#R253–#R258) and every gate in `npm test`. What was
// wrong is the NUMBER the browser resolves after a wheel event, so the browser is the instrument.
// Measured on the shipped build before the fix:
//
//     afterOpen   legal 9999            / settings 9999      ← the dialog opens correctly
//     afterWheel  legal 2650 .im-front  / settings 9999      ← one wheel notch sinks it
//
//   #1 opening Terms from the Settings footer puts it in front
//   #2 SCROLLING IT KEEPS IT IN FRONT — the defect
//   #3 clicking inside it keeps it in front (pointerdown is the same machinery)
//   #4 the machinery it is exempted from still works: a panel inside the band is still raised
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  /* the front-most machinery is wired by js/map-ui.js, and the legal modal by js/legal.js */
  await page.waitForFunction(() => window.__imFrontMostWired === 1 && typeof window.openLegal === 'function',
    null, { timeout: 45_000 });
  /* ⚠ THE FIXTURE IS «SETTINGS IS OPEN AND TERMS WAS OPENED FROM IT», and it is built HERE rather
     than inside ①. Reaching that state is the boot cost every spec pays for its own setup (see
     tests/r494.spec.js, whose beforeAll does the same and whose entry in tests/durations.json is
     calibrated against testcase time) — charging it to a test would price this file at the app's
     start-up rather than at what it asserts. Every test below reads the SAME state, in order. */
  await page.click('#btn-open-settings');
  await page.waitForSelector('#link-terms', { state: 'visible' });
  await page.click('#link-terms');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('legal-modal')).display !== 'none',
    null, { timeout: 20_000 });
});
test.afterAll(async () => { await page?.context()?.close(); });

/** the two dialogs' resolved stacking, plus what a reader would actually touch at the centre of the
    legal sheet — `elementFromPoint` is the only one of the three that cannot be argued with. */
const stack = () => page.evaluate(() => {
  const lm = document.getElementById('legal-modal'), sm = document.getElementById('settings-modal');
  const box = lm.querySelector('.modal-content').getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return {
    legalZ: +getComputedStyle(lm).zIndex,
    settingsZ: +getComputedStyle(sm).zIndex,
    legalMarked: lm.classList.contains('im-front'),
    legalOpen: getComputedStyle(lm).display !== 'none',
    settingsOpen: getComputedStyle(sm).display !== 'none',
    hitInsideLegal: !!(hit && lm.contains(hit)),
    box: { x: box.left, y: box.top, w: box.width, h: box.height },
  };
});

test('#R508 ① Terms opens in front of the Settings dialog it was opened from', async () => {
  const s = await stack();
  expect(s.legalOpen, 'the legal dialog did not open').toBe(true);
  expect(s.settingsOpen, 'Settings closed itself — this test measures the two STACKED').toBe(true);
  expect(s.legalZ, 'the legal dialog is not above Settings on open').toBeGreaterThanOrEqual(s.settingsZ);
  expect(s.hitInsideLegal, 'the point the reader looks at is not part of the legal dialog').toBe(true);
});

test('#R508 ② scrolling the terms text does NOT sink it behind Settings', async () => {
  const before = await stack();
  /* a REAL wheel over the middle of the sheet — the reader's own gesture. A synthetic WheelEvent
     would exercise the same handler, but it would not prove the page scrolls where the reader
     points, which is the other half of the report. */
  await page.mouse.move(before.box.x + before.box.w / 2, before.box.y + before.box.h / 2);
  await page.mouse.wheel(0, 400);
  /* ⚠ WAIT FOR THE SCROLL, DO NOT SLEEP AT IT. A fixed 150 ms after the wheel made this a race
     against however long the sheet takes to lay out — measured: one flake in seven identical runs,
     and it was this line, not the stacking. Polling asserts the same thing without the race. */
  await expect.poll(() => page.evaluate(() => document.querySelector('#legal-modal .modal-content').scrollTop),
    { message: 'the terms text did not scroll at all', timeout: 5_000 }).toBeGreaterThan(0);

  const after = await stack();
  expect(after.legalMarked, '.im-front was put on the dialog — !important then drops it to the band').toBe(false);
  expect(after.legalZ, 'the terms dialog sank behind Settings after one scroll').toBeGreaterThanOrEqual(after.settingsZ);
  expect(after.hitInsideLegal, 'after scrolling, the point the reader looks at belongs to another dialog').toBe(true);
});

test('#R508 ③ clicking inside the terms text keeps it in front too', async () => {
  const before = await stack();
  await page.mouse.click(before.box.x + before.box.w / 2, before.box.y + before.box.h / 2);
  await page.waitForTimeout(120);
  const after = await stack();
  expect(after.legalOpen, 'the click closed the dialog — it landed on the overlay, not the sheet').toBe(true);
  expect(after.legalMarked).toBe(false);
  expect(after.legalZ).toBeGreaterThanOrEqual(after.settingsZ);
});

test('#R508 ④ the exemption is narrow: a panel INSIDE the band is still brought to the front', async () => {
  /* the positive control. `#country-popup` is `position:absolute; z-index:2200` — a member of the
     band, and exactly the kind of panel #R254 built this machinery for. If the guard were written as
     «ignore anything with a z-index» it would fail here. */
  const raised = await page.evaluate(() => {
    const p = document.getElementById('country-popup');
    if (!p) return { missing: true };
    document.querySelectorAll('.im-front').forEach((n) => n.classList.remove('im-front'));
    p.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
    return { missing: false, marked: p.classList.contains('im-front'), z: getComputedStyle(p).zIndex };
  });
  expect(raised.missing, '#country-popup is gone — re-point this control at whatever replaced it').toBe(false);
  expect(raised.marked, 'a panel in the band is no longer raised: the guard is too wide').toBe(true);
});

test('#R508 ⑤ nothing threw', async () => {
  /* the helper's own names — `pageErrors` is an uncaught exception, `consoleErrors` a
     console.error it did not classify as benign. See tests/helpers/network.js. */
  expect(diag.pageErrors, diag.pageErrors.join(' | ')).toEqual([]);
  expect(diag.consoleErrors, diag.consoleErrors.join(' | ')).toEqual([]);
});
