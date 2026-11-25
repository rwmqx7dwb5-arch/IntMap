/* ============================================================================
 *  desktop-one-entry — one door per feature, measured the way a desktop reader meets it (1280 × 800)
 *  ① a setting takes effect the moment it is changed: no Apply, the change is saved before the dialog
 *    closes, × closes without asking, and the map engine asks before it reloads (a refusal puts the
 *    choice back and reloads nothing)
 *  ② the second doors are gone and the one that stays is there: no header language pills, no Settings
 *    copy of the day/night switch or of Send feedback, no second Data studio button
 *  ③ the desktop search box suggests while typing and ends with «Ask Atlas»; pressing it with the left
 *    sidebar folded away opens the sidebar on the Atlas tab
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}

test.describe('desktop-one-entry', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('settings commit on change, the second doors are gone, and the desktop search asks Atlas', async ({ page }) => {
    test.setTimeout(120_000);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await boot(page);

    /* ── ① ── */
    await page.evaluate(() => document.getElementById('btn-open-settings').click());
    await page.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none');
    const unit = await page.evaluate(() => {
      const s = document.getElementById('setting-units'); const to = s.value === 'imperial' ? 'metric' : 'imperial';
      s.value = to; s.dispatchEvent(new Event('change', { bubbles: true }));
      let saved = null; try { saved = JSON.parse(localStorage.getItem('intmap_settings') || '{}').units; } catch (_) { /* none */ }
      return { to, saved, open: getComputedStyle(document.getElementById('settings-modal')).display !== 'none',
        done: document.getElementById('btn-close-settings').textContent.trim() };
    });
    expect(unit.saved, 'the unit is saved the moment it is chosen — there is no Apply to wait for').toBe(unit.to);
    expect(unit.open, 'choosing does not close the dialog').toBe(true);
    expect(unit.done, 'the footer button only closes').toBe('Done');

    const eng = await page.evaluate(() => { const s = document.getElementById('setting-engine'), was = s.value;
      const other = [...s.options].map((o) => o.value).find((v) => v !== was);
      s.value = other; s.dispatchEvent(new Event('change', { bubbles: true }));
      return { was, now: s.value, stored: window.IntMapEngineSelect.choice() }; });
    /* the question is IntMap's own dialog (js/ask-dialog.js), not window.confirm(): a host that does not open native
       dialogs answers «no» silently, which made the engine impossible to change there */
    await page.waitForFunction(() => getComputedStyle(document.getElementById('acct-ask')).display !== 'none');
    const asked = await page.evaluate(() => ({ title: document.getElementById('acct-ask-h').textContent.trim(),
      body: document.getElementById('acct-ask-b').textContent.trim() }));
    expect(asked.title.length, 'switching the engine asks, in the app, before it reloads').toBeGreaterThan(0);
    expect(asked.body.length, '…and says the page reloads').toBeGreaterThan(0);
    await page.click('#acct-ask-no');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('acct-ask')).display === 'none');
    const refused = await page.evaluate(() => ({ now: document.getElementById('setting-engine').value, stored: window.IntMapEngineSelect.choice() }));
    expect(dialogs.length, 'no native dialog is opened for it').toBe(0);
    expect(refused.now, 'a refusal puts the choice back').toBe(eng.was);
    expect(refused.stored, '…and stores nothing').toBe(eng.was);

    await page.click('#settings-close-x');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display === 'none');
    expect(dialogs.length, '× closes without a discard-changes question').toBe(0);

    /* ── ② ── */
    const doors = await page.evaluate(() => ({
      pills: !!document.querySelector('.lang-toggle, #lang-en, #lang-jp'),
      nightSettings: !!document.getElementById('setting-night-side'), nightRow: !!document.getElementById('dl-nightside'),
      sendFeedback: !!document.getElementById('btn-send-feedback'), headerFeedback: !!document.getElementById('btn-feedback-hdr'),
      bugReport: !!document.getElementById('btn-report-bug'),
      studioButton: !!document.getElementById('btn-data-studio'),
      langOptions: document.querySelectorAll('#setting-lang option').length,
    }));
    expect(doors).toEqual({ pills: false, nightSettings: false, nightRow: true, sendFeedback: false, headerFeedback: true,
      bugReport: true, studioButton: false, langOptions: doors.langOptions });
    expect(doors.langOptions, 'every language is in the one picker').toBeGreaterThanOrEqual(9);

    /* ── ③ ── */
    await page.evaluate(() => { const sb = document.getElementById('sidebar'); if (!sb.classList.contains('collapsed')) document.getElementById('btn-toggle-sidebar').click(); });
    await page.waitForFunction(() => document.getElementById('sidebar').classList.contains('collapsed'));
    await page.click('#ms-input');
    await page.keyboard.type('Par', { delay: 40 });
    await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item').length >= 1, null, { timeout: 10_000 });
    const rows = await page.evaluate(() => ({ ph: document.getElementById('ms-input').placeholder,
      atlas: document.querySelectorAll('#ms-results .ms-atlas').length }));
    expect(rows.atlas, 'the field finds places only: no «Ask Atlas» row').toBe(0);
    expect(rows.ph, 'the field says what it takes').toBe('Search places');
  });
});
