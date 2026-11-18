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
/* tap a point where the current view already draws it (the camera moves only when it is off screen), once that layer is drawn there —
   not after every base-map tile: measured, waiting for the tiles was 4.9 s of this file */
async function tapAt(page, lngLat, layer) {
  await page.evaluate(([x, y]) => { const m = window.__imap, q = m.project([x, y]), c = m.getCanvas(); if (!(q.x > 60 && q.y > 60 && q.x < c.clientWidth - 60 && q.y < c.clientHeight - 60)) m.jumpTo({ center: [x, y], zoom: 3 }); }, lngLat);
  const pt = await (await page.waitForFunction(([x, y, l]) => {
    const m = window.__imap, q = m.project([x, y]);
    if (!m.queryRenderedFeatures([q.x, q.y], { layers: [l] }).length) return null;
    const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y };
  }, [lngLat[0], lngLat[1], layer])).jsonValue();
  await page.mouse.click(pt.x, pt.y);
}

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
  await tapAt(page, [p.x, p.y], 'gp-sanc-end');
  const card = page.locator('.plc-popup').last();
  await expect(card).toContainText('OFAC');
  await expect(card).toContainText(/United Kingdom|英国/);
  await expect(card).toContainText(/European Union|EU/);
  /* (geopolitics-legends ⑤) the card names its lists and their licences, and the whole card — source line included — is inside the map */
  await expect(card).toContainText('Open Government Licence v3.0');
  await expect(card).toContainText('Decision 2011/833/EU');
  expect(await page.evaluate(() => { const c = [...document.querySelectorAll('.plc-popup')].pop().getBoundingClientRect(), m = document.getElementById('map-container').getBoundingClientRect(); return c.top >= m.top - 1 && c.bottom <= m.bottom + 1; })).toBe(true);
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
  /* (geopolitics-legends ④) a tap on a member under the vote opens THAT member's vote on THAT resolution, not the general country card */
  await tapAt(page, [S.places.RUS.x, S.places.RUS.y], 'gp-unv-fill');
  const vcard = page.locator('.plc-popup').last();
  await expect(vcard).toContainText(/Voted no|反対/);
  await expect(vcard).toContainText('R/68/262');
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

/* ── (geopolitics-legends) the cards take their place in the legend stack ─────────────────────────────────────────────
   MEASURED IN PRODUCTION 2026-11-18 (build 1be2049): the three cards sat on one spot (x 424, y 0) and over the World Bank card by
   28–74 px; at 1152×720 the UN votes card was 1,031 px tall with its lower 335 px cut off, lay over the map's search button
   (elementFromPoint answered the card), and its links were the browser's #0000ee on a dark card. */
const ROWS = ['bx-wbcpi', 'dl-sanctions', 'dl-unvotes', 'dl-crossings'];

const setRows = (page, on) => page.evaluate(([ids, v]) => { for (const i of ids) { const cb = document.getElementById(i); if (cb && cb.checked !== v) { cb.checked = v; cb.dispatchEvent(new Event('change', { bubbles: true })); } } }, [ROWS, on]);
/* the shown legend cards, their boxes, and what overflows — read in the page */
const stack = (page) => page.evaluate(() => {
  const mc = document.getElementById('map-container').getBoundingClientRect();
  const cards = [...document.querySelectorAll('#map-container .data-legend, #map-container .koppen-legend')].filter((el) => {
    const cs = getComputedStyle(el); return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  }).map((el) => { const r = el.getBoundingClientRect(); return { id: el.id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, scrolls: el.scrollHeight > el.clientHeight + 1 ? getComputedStyle(el).overflowY : 'fits' }; });
  return { mc: { x0: mc.left, y0: mc.top, x1: mc.right, y1: mc.bottom }, cards };
});
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test('legend cards at 1440×900, 1152×720 and 375×812: stacked, inside the map, off the search button, readable links', async ({ app }) => {
  const page = app.page;
  for (const [w, h] of [[1440, 900], [1152, 720], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await setRows(page, true);
    await page.waitForFunction(() => ['sanctions', 'unvotes', 'crossings'].every((k) => { const el = document.getElementById('data-legend-' + k); return el && el.querySelector('.gp-body') && el.querySelector('.gp-body').childElementCount > 0; }), null, { timeout: 30000 });
    /* the stack is placed on the next frame after a card changes size */
    await expect.poll(async () => {
      const s = await stack(page);
      const bad = [];
      for (let i = 0; i < s.cards.length; i++) for (let j = i + 1; j < s.cards.length; j++) if (overlap(s.cards[i], s.cards[j]) > 1) bad.push(s.cards[i].id + ' × ' + s.cards[j].id);
      for (const c of s.cards) {
        if (c.y0 < s.mc.y0 - 1 || c.y1 > s.mc.y1 + 1 || c.x0 < s.mc.x0 - 1 || c.x1 > s.mc.x1 + 1) bad.push(c.id + ' leaves the map');
        if (c.scrolls !== 'fits' && !/auto|scroll/.test(c.scrolls)) bad.push(c.id + ' is cut off');
      }
      return bad;
    }, { timeout: 15000 }).toEqual([]);
    /* ② the search button is what its own centre hits */
    const hit = await page.evaluate(() => {
      const b = document.getElementById('ms-btn'); if (!b) return 'none';
      const r = b.getBoundingClientRect(); if (!r.width || getComputedStyle(b).visibility === 'hidden') return 'none';
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return e && (e === b || b.contains(e)) ? 'button' : (e && (e.closest('.data-legend') ? 'a legend: ' + e.closest('.data-legend').id : e.tagName));
    });
    expect(['button', 'none']).toContain(hit);
    /* ③ links in the cards */
    const colours = await page.evaluate(() => [...document.querySelectorAll('#map-container .data-legend a')].map((a) => getComputedStyle(a).color));
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.filter((c) => c === 'rgb(0, 0, 238)')).toEqual([]);
    await page.screenshot({ path: 'test-results/geopolitics-legends-' + w + 'x' + h + '.png' });
    await setRows(page, false);
  }
});
