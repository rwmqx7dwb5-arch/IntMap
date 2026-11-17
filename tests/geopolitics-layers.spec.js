/* ============================================================================================
 *  geopolitics-layers · sanctions (dl-sanctions), UN General Assembly votes (dl-unvotes), border crossings (dl-crossings)
 *  in the real app. Every expected value is ASKED OF THE RECORDS and of js/geopolitics-core.js — never typed:
 *    · sanctions: one arc per link whose country has a place, minus the authority the legend switches off; a country's card
 *      names each authority;
 *    · UN votes: choosing A/RES/68/262 in the legend moves the clock to 2014-03-27 and colours Russia «no», Ukraine «yes»,
 *      China «abstain» on the shared countries source; OFF removes every state it set;
 *    · crossings: one point per post, each coloured by crossingState at the clock's instant.
 *  ⚠ PAID FOR OUT OF ITSELF (tests/durations.json, scripts/test-budget.mjs): the counts are taken IN the page (a 9,582-point
 *  source is not serialised back to Node), no fixed waits, no screenshots — what each layer computes is held by the node checks
 *  (tests/geopolitics-layers-checks.test.mjs); this file holds only what needs the drawn map.
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
/* how many features of a kind a source holds — counted in the page */
const countOf = (page, src, k) => page.evaluate(([s, kind]) => { const x = window.__imap.getSource(s); const d = x && x.serialize && x.serialize().data; return ((d && d.features) || []).filter((f) => !kind || f.properties.k === kind).length; }, [src, k]);
const has = (page, id) => page.evaluate((i) => window.IntMapGeoEngine.layers.has(i), id);

test('geopolitics layers: sanctions arcs and card, a UN vote on the countries, crossings by their hours', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));

  /* ── sanctions ── */
  await rowOn(page, 'dl-sanctions', true);
  await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('gp-sanc-arc'), null, { timeout: 30000 });
  const placed = S.links.filter((l) => S.places[l.c] && S.places[l.c].x != null);
  await expect.poll(() => countOf(page, 'gp-sanc-src', 'arc')).toBe(placed.length);
  await page.locator('#data-legend-sanctions input[data-gp-auth="UK"]').uncheck();
  await expect.poll(() => countOf(page, 'gp-sanc-src', 'arc')).toBe(placed.filter((l) => l.a !== 'UK').length);
  await page.locator('#data-legend-sanctions input[data-gp-auth="UK"]').check();
  /* tap Iran's point: the card names the three authorities */
  const p = S.places.IRN;
  /* tap it where the current view already draws it; move the camera only when it is off screen */
  await page.evaluate(([x, y]) => { const m = window.__imap, q = m.project([x, y]), c = m.getCanvas(); if (!(q.x > 40 && q.y > 40 && q.x < c.clientWidth - 40 && q.y < c.clientHeight - 40)) m.jumpTo({ center: [x, y], zoom: 3 }); }, [p.x, p.y]);
  /* wait for the tapped point itself to be drawn there — not for every base-map tile */
  const pt = await (await page.waitForFunction(([x, y]) => {
    const m = window.__imap, q = m.project([x, y]);
    if (!m.queryRenderedFeatures([q.x, q.y], { layers: ['gp-sanc-end'] }).length) return null;
    const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y };
  }, [p.x, p.y])).jsonValue();
  await page.mouse.click(pt.x, pt.y);
  const card = page.locator('.plc-popup').last();
  await expect(card).toContainText('OFAC');
  await expect(card).toContainText(/United Kingdom|英国/);
  await expect(card).toContainText(/European Union|EU/);
  await rowOn(page, 'dl-sanctions', false);
  await expect.poll(() => has(page, 'gp-sanc-arc')).toBe(false);

  /* ── UN votes ── */
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
  const want = Object.fromEntries(['RUS', 'UKR', 'CHN', 'USA'].map((c) => [c, code[v.by[c]]]));
  await expect.poll(() => page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, (window.__imap.getFeatureState({ source: 'countries', id }) || {}).unv])), Object.keys(want))).toEqual(want);
  await rowOn(page, 'dl-unvotes', false);
  await expect.poll(() => has(page, 'gp-unv-fill')).toBe(false);
  expect(await page.evaluate(() => (window.__imap.getFeatureState({ source: 'countries', id: 'RUS' }) || {}).unv)).toBeUndefined();
  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));

  /* ── border crossings ── */
  await rowOn(page, 'dl-crossings', true);
  await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('gp-cross-dot'), null, { timeout: 30000 });
  /* the count and the colours of the posts that state hours, read in the page in one call */
  const sample = B.crossings.map((c, k) => (c.oh ? k : -1)).filter((k) => k >= 0).slice(0, 25);
  const got = await page.evaluate((idx) => {
    const x = window.__imap.getSource('gp-cross-src'); const d = x.serialize().data;
    const st = {}; for (const f of d.features) if (idx.includes(f.properties.i)) st[f.properties.i] = f.properties.st;
    return { n: d.features.length, st, ms: Date.now() };
  }, sample);
  expect(got.n).toBe(B.count);
  for (const i of sample) {
    const now = crossingState(B.crossings[i], got.ms).state;
    /* the minute may have turned between the paint and the read */
    if (now !== got.st[i]) expect(crossingState(B.crossings[i], got.ms - 60000).state).toBe(got.st[i]);
  }
  await expect(page.locator('#data-legend-crossings')).toBeVisible();
  await rowOn(page, 'dl-crossings', false);
  await expect.poll(() => has(page, 'gp-cross-dot')).toBe(false);
});
