/* ============================================================================================
 *  geopolitics-layers · sanctions (dl-sanctions), UN General Assembly votes (dl-unvotes), border crossings (dl-crossings)
 *  in the real app. Every expected value is ASKED OF THE RECORDS and of js/geopolitics-core.js — never typed:
 *    · sanctions: one arc per link whose country has a place, minus the authority the legend switches off; a country's card
 *      names each authority and its count;
 *    · UN votes: choosing A/RES/68/262 in the legend moves the clock to 2014-03-27 and colours Russia «no», Ukraine «yes»,
 *      China «abstain» on the shared countries source; OFF removes every state it set;
 *    · crossings: one point per post, each coloured by crossingState at the clock's instant.
 *  Screenshots go to test-results/ (the artefact the reviewer looks at).
 * ========================================================================================== */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './helpers/app.js';
import { findVote, decodeVote, sessionFile, crossingState } from '../js/geopolitics-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const S = J('data/sanctions.json'), I = J('data/unga-votes/index.json'), B = J('data/border-crossings.json');

const rowOn = (page, id, on) => page.evaluate(([i, v]) => { const cb = document.getElementById(i); cb.checked = v; cb.dispatchEvent(new Event('change', { bubbles: true })); }, [id, on]);
const featuresOf = (page, src) => page.evaluate((s) => { const x = window.__imap.getSource(s); const d = x && x.serialize && x.serialize().data; return ((d && d.features) || []).map((f) => f.properties); }, src);
const has = (page, id) => page.evaluate((i) => window.IntMapGeoEngine.layers.has(i), id);

test.describe('geopolitics layers', () => {
  test('sanctions: one arc per placed link; the legend switches an authority off; a country card names each list', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await rowOn(page, 'dl-sanctions', true);
    await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('gp-sanc-arc'), null, { timeout: 30000 });
    const placed = S.links.filter((l) => S.places[l.c] && S.places[l.c].x != null);
    await expect.poll(async () => (await featuresOf(page, 'gp-sanc-src')).filter((p) => p.k === 'arc').length).toBe(placed.length);
    await expect(page.locator('#data-legend-sanctions')).toBeVisible();
    await page.screenshot({ path: 'test-results/geopolitics-sanctions.png' });

    await page.locator('#data-legend-sanctions input[data-gp-auth="UK"]').uncheck();
    await expect.poll(async () => (await featuresOf(page, 'gp-sanc-src')).filter((p) => p.k === 'arc').length).toBe(placed.filter((l) => l.a !== 'UK').length);
    await page.locator('#data-legend-sanctions input[data-gp-auth="UK"]').check();

    /* tap Iran's point: the card names the three authorities */
    const p = S.places.IRN;
    await page.evaluate(([x, y]) => window.__imap.jumpTo({ center: [x, y], zoom: 3 }), [p.x, p.y]);
    await page.waitForTimeout(800);
    const pt = await page.evaluate(([x, y]) => { const q = window.__imap.project([x, y]); const r = window.__imap.getCanvas().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, [p.x, p.y]);
    await page.mouse.click(pt.x, pt.y);
    const card = page.locator('.plc-popup').last();
    await expect(card).toContainText('OFAC');
    await expect(card).toContainText(/United Kingdom|英国/);
    await expect(card).toContainText(/European Union|EU/);
    await page.screenshot({ path: 'test-results/geopolitics-sanctions-card.png' });

    await rowOn(page, 'dl-sanctions', false);
    await expect.poll(() => has(page, 'gp-sanc-arc')).toBe(false);
  });

  test('UN votes: choosing A/RES/68/262 moves the clock to its day and colours each member by its vote; OFF clears it', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await rowOn(page, 'dl-unvotes', true);
    await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('gp-unv-fill'), null, { timeout: 30000 });
    /* live clock: the record's last vote, said to be carried */
    await expect(page.locator('#data-legend-unvotes')).toContainText(I.votes[I.votes.length - 1][2]);

    await page.locator('#data-legend-unvotes [data-gp-q]').fill('territorial integrity ukraine');
    const r = findVote(I, 'R/68/262');
    await page.locator('#data-legend-unvotes [data-gp-vote="' + r.id + '"]').click();
    await expect.poll(() => page.evaluate(() => new Date(window.IntMapTime.nowMs()).toISOString().slice(0, 10))).toBe('2014-03-27');
    const v = decodeVote(I, J(sessionFile(r.s)), r.id);
    const code = { Y: 1, A: 2, N: 3, X: 4 };
    for (const c of ['RUS', 'UKR', 'CHN', 'USA']) {
      await expect.poll(() => page.evaluate((id) => (window.__imap.getFeatureState({ source: 'countries', id }) || {}).unv, c)).toBe(code[v.by[c]]);
    }
    await expect(page.locator('#data-legend-unvotes')).toContainText('R/68/262');
    await page.screenshot({ path: 'test-results/geopolitics-unvotes.png' });

    await rowOn(page, 'dl-unvotes', false);
    await expect.poll(() => has(page, 'gp-unv-fill')).toBe(false);
    expect(await page.evaluate(() => (window.__imap.getFeatureState({ source: 'countries', id: 'RUS' }) || {}).unv)).toBeUndefined();
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
  });

  test('crossings: one point per post, coloured by its published hours at the clock\'s instant', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await rowOn(page, 'dl-crossings', true);
    await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('gp-cross-dot'), null, { timeout: 30000 });
    const got = await featuresOf(page, 'gp-cross-src');
    expect(got.length).toBe(B.count);
    /* the colour of a few posts with hours is what crossingState answers for the same minute */
    const ms = await page.evaluate(() => Date.now());
    for (const i of B.crossings.map((c, k) => (c.oh ? k : -1)).filter((k) => k >= 0).slice(0, 25)) {
      const want = crossingState(B.crossings[i], ms).state;
      const have = got.find((p) => p.i === i).st;
      if (want !== have) expect(crossingState(B.crossings[i], ms + 60000).state).toBe(have);   /* the minute turned between the two reads */
    }
    await expect(page.locator('#data-legend-crossings')).toBeVisible();
    await page.evaluate(() => window.__imap.jumpTo({ center: [23.6, 52.1], zoom: 6 }));
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/geopolitics-crossings.png' });
    await rowOn(page, 'dl-crossings', false);
    await expect.poll(() => has(page, 'gp-cross-dot')).toBe(false);
  });
});
