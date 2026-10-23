// wave4-history — 「家族史と国境」 in a real page: the Chronos panel's door, a GEDCOM file read in the browser, one person's
// events read at their own days over the border records, the changes of polity during the life, and the clock moved by
// «Go to that day».
//   ① the Chronos panel opens the sheet; a GEDCOM file chosen in it is read in the page (nothing is uploaded) and the
//     report counts its people and events;
//   ② a person's birth (Lemberg, 1 May 1880 — coordinates from the file) is read as Austria-Hungary with its first-level
//     unit, and «during this life» to 1952 counts the three changes of polity CShapes 2.0 states (1918-11-03, 1919-09-10,
//     1945-05-08 — the same as tests/wave4-history-checks.test.mjs ③, from the same records);
//   ③ the events are dots on the map while the sheet is open; «Go to that day» moves the master clock to 1880-05-01;
//   ④ «Delete everything kept here» empties this browser's copy.
// On the shared page (tests/helpers/app.js — no boot of its own).
import { test, expect } from './helpers/app.js';

const BOOT = { timeout: 45_000 };
const GED = [
  '0 HEAD', '1 SOUR wave4-history spec', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
  '0 @I1@ INDI', '1 NAME Anna /Kowalska/',
  '1 BIRT', '2 DATE 1 MAY 1880', '2 PLAC Lemberg, Galizien', '3 MAP', '4 LATI N49.8429', '4 LONG E24.0316',
  '1 DEAT', '2 DATE 1952', '2 PLAC Lwów', '3 MAP', '4 LATI N49.8429', '4 LONG E24.0316',
  '0 @I2@ INDI', '1 NAME Jan /Kowalski/', '1 BIRT', '2 DATE ABT 1875',
  '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 MARR', '2 DATE 12 JUN 1903',
  '0 TRLR', '',
].join('\n');

test('wave4-history ①–④ family history across borders: import, read at the day, the life, the clock', async ({ app }) => {
  const page = app.page;
  try {
    await page.waitForFunction(() => !!(window.IntMapTime && document.getElementById('ntl-toggle')), null, BOOT);
    await page.evaluate(() => { try { localStorage.removeItem('intmap_family_v1'); } catch (_) { /* no storage */ } const tl = document.getElementById('news-timeline'), tg = document.getElementById('ntl-toggle'); if (tl && tg && tl.classList.contains('collapsed')) tg.click(); });
    /* ① the door, and the file read in the page */
    const door = page.locator('#ntl-family');
    await expect(door).toBeVisible(BOOT);
    await door.click();
    const sheet = page.locator('#fh-sheet');
    await expect(sheet).toBeVisible(BOOT);
    await sheet.locator('.fh-file').setInputFiles({ name: 'family.ged', mimeType: 'text/plain', buffer: Buffer.from(GED, 'utf8') });
    await expect(sheet.locator('.fh-note').filter({ hasText: /2 people, 5 events/ })).toBeVisible(BOOT);
    await expect(sheet.locator('.fh-people .fh-row')).toHaveCount(2);
    /* ② one person, read at the days */
    await sheet.locator('.fh-people .fh-row', { hasText: 'Anna Kowalska' }).click();
    const birth = sheet.locator('.fh-ev', { hasText: /Birth/ }).locator('.fh-jur');
    await expect(birth).toContainText('Austria-Hungary', BOOT);
    await expect(birth).toContainText('Galicia and Lodomeria');
    const lifeBox = sheet.locator('.fh-life').first();
    await expect(lifeBox.locator('.fh-count')).toHaveText('3', BOOT);
    await expect(lifeBox).toContainText('Soviet Union');
    await expect(lifeBox).toContainText('CShapes 2.0');
    /* ③ the dots, and the clock */
    expect(await page.evaluate(() => { try { return window.IntMapGeoEngine.layers.hasSource('fh-src'); } catch (_) { return null; } }), 'the events are drawn while the sheet is open').toBe(true);
    await sheet.locator('.fh-ev', { hasText: /Birth/ }).locator('[data-go]').click();
    await expect.poll(() => page.evaluate(() => window.IntMapTime.state().iso.slice(0, 10)), { timeout: 10_000, intervals: [100] }).toBe('1880-05-01');
    /* ④ nothing stays behind */
    await sheet.locator('[data-act="list"]').click();
    await sheet.locator('[data-act="wipe"]').click();
    await sheet.locator('[data-act="wipe-go"]').click();
    await expect(sheet.locator('.fh-people')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('intmap_family_v1'))).toBeNull();
    await sheet.locator('.fh-x').click();
    await expect(sheet).toBeHidden();
  } finally {
    await page.evaluate(() => { try { window.IntMapTime.setNow({ source: 'test' }); } catch (_) { /* no clock */ } try { localStorage.removeItem('intmap_family_v1'); } catch (_) { /* no storage */ } const s = document.getElementById('fh-sheet'); if (s) s.hidden = true; }).catch(() => {});
  }
});
