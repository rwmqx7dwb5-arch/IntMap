// atlas-briefing — the browser half of tests/atlas-briefing-checks.test.mjs: what only a real page can answer.
//   ① a briefing link opens the Atlas panel on the briefing with no account: the answer beside its evidence, the
//     recorded layers and clock put back AFTER the link's own restore settles, the recorded rows drawn on the map with
//     their credit, the briefing kept in the address bar while the map moves; Atlas reads it (briefing.open); the
//     second answer puts its own clock back; the recipient keeps it in their notebook (while the notebook is hidden —
//     NOTEBOOK_SHOWN — that door is not drawn); closing takes it out of the bar;
//   ② the sender's side: from the notebook entry, 「ブリーフィングで共有」 makes a link that decodes to that entry (hidden:
//     no notebook to share from, and briefing.share does not read it);
//   ③ a damaged link is refused by name, and the map still opens on its view.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { buildBriefing, packBriefing, unpackBriefing, briefingLink } from '../js/atlas-briefing-codec.js';
/* (deep-tier-reds) the product's one switch for the investigation notebook (#980, 2026-10-04). While it is false the
   briefing draws no notebook door — no 「ノートに保存」, no 「今と比べる」, no notebook strip to share from — so the steps
   that press those doors ask the switch, not a copy of it. MEASURED before this: from 2026-10-04 ① spent its whole
   240 s on `.atl-br-act[data-act="keep"]` (the trace: every step before it passed; the click never found the button). */
import { NOTEBOOK_SHOWN } from '../js/atlas-notebook-store.js';

test.describe.configure({ mode: 'serial' });

const AT = Date.UTC(2026, 9, 3, 8, 0);
const S1 = {
  id: 'nb-briefspec-aaaaaaaaaaaa', at: AT, updatedAt: AT, title: 'NATO in Europe', question: 'Which NATO members border Russia?',
  answer: 'Five members share a land border with Russia: **Norway**, **Finland**, **Estonia**, **Latvia** and **Poland**/**Lithuania** (Kaliningrad).',
  lang: 'en', status: 'answered',
  view: { camera: { lng: 25, lat: 58, zoom: 3.4, bearing: 0, pitch: 0, base: 'map', projection: 'flat' }, time: { live: true, t: null }, layersOn: ['dl-nato'], layerOpacity: {} },
  steps: [{ cap: 'layers.toggle', args: { type: 'layer', id: 'dl-nato', on: true }, status: 'completed', code: '', replay: true }],
  results: [{ at: AT - 60000, key: 'k', spec: { table: 'countries' }, table: 'countries', tableLabel: 'Countries', matched: 2, offered: 2,
    columns: [{ id: 'pop', label: 'Population', unit: '' }],
    rows: [{ id: 'FI', name: 'Finland', iso2: 'FI', lat: 64.5, lng: 26.0, v: { pop: 5563970 } }, { id: 'EE', name: 'Estonia', iso2: 'EE', lat: 58.7, lng: 25.5, v: { pop: 1365884 } }],
    unapplied: [], sources: [{ what: 'World Bank', src: 'https://data.worldbank.org/' }] }],
  sources: [{ url: 'https://www.nato.int/', title: 'NATO — member countries' }], note: '', followOf: null, pinned: false,
};
const S2 = {
  id: 'nb-briefspec-bbbbbbbbbbbb', at: AT + 1000, updatedAt: AT + 1000, title: '1990 年の東京', question: '1990 年の東京はどんな地図？',
  answer: '1990 年の地図です。', lang: 'jp', status: 'answered',
  view: { camera: { lng: 139.7, lat: 35.68, zoom: 6, bearing: 0, pitch: 0, base: 'map', projection: 'flat' }, time: { live: false, t: Date.UTC(1990, 5, 15, 12) }, layersOn: [], layerOpacity: {} },
  steps: [], results: [], sources: [], note: '', followOf: null, pinned: false,
};

let packed = '', hash = '';
test.beforeAll(async () => {
  const b = buildBriefing([S1, S2], { title: 'NATO and Tokyo — a briefing', lang: 'en', now: AT + 5000 });
  packed = await packBriefing(b);
  hash = briefingLink('', b, packed, null);
});

const panelReady = (page) => page.waitForFunction(() => { const s = document.querySelector('#atlas-panel .atl-br'); return !!(s && getComputedStyle(s).display !== 'none'); }, null, { timeout: 90_000 });

test('atlas-briefing ① a briefing link opens on the answer, its evidence and its map — no account', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e && e.message)));
  try {
    await page.goto('/' + hash, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await panelReady(page);
    const sheet = page.locator('#atlas-panel .atl-br');
    await expect(sheet.locator('.atl-br-title')).toHaveText('NATO and Tokyo — a briefing');
    await expect(sheet.locator('.atl-br-q')).toHaveText(S1.question);
    await expect(sheet.locator('.atl-br-ans')).toContainText('Russia: Norway, Finland');   /* the reply's own markdown renderer (body bold is not drawn, #R159) */
    await expect(sheet.locator('.atl-br-ans')).not.toContainText('**');
    await expect(sheet.locator('.atl-br-src')).toHaveAttribute('href', 'https://www.nato.int/');
    /* the recorded view, after the link's restore settled: the layer the answer had on is on again */
    await page.waitForFunction(() => { const cb = document.getElementById('dl-nato'); return !!(cb && cb.checked); }, null, { timeout: 30_000 });
    /* the recorded rows are on the map, credited as such */
    await page.waitForFunction(() => { try { return window.IntMapGeoEngine.layers.hasSource('atl-brief-ev') && window.IntMapGeoEngine.layers.has('atl-brief-ev-pt'); } catch (_) { return false; } }, null, { timeout: 20_000 });
    const credit = await page.evaluate(() => window.IntMapGeoEngine.scene.getStyle().sources['atl-brief-ev'].attribution);
    expect(credit).toContain('rows as recorded'); expect(credit).toContain('World Bank');
    await expect(sheet.locator('.atl-br-ev')).toContainText('Map clock');
    await expect.poll(() => sheet.locator('.atl-br-ev').textContent(), { timeout: 20_000 }).not.toContain('reading the map');
    /* the camera the answer ended on STAYS: the layer was put back, not switched on by the reader, so the NATO layer's
       fly-to-home (js/layer-home.js) does not take the map away from the recorded view */
    for (let k = 0; k < 6; k++) {
      const c = await page.evaluate(() => { const x = window.IntMapGeoEngine.camera.getCenter(); return [x.lng, x.lat, window.IntMapGeoEngine.camera.getZoom()]; });
      expect(Math.abs(c[0] - 25) < 0.5 && Math.abs(c[1] - 58) < 0.5 && Math.abs(c[2] - 3.4) < 0.1, 'the camera moved off the recorded view: ' + c.join(',')).toBe(true);
      await page.waitForTimeout(500);
    }
    /* the briefing stays in the address bar while the map moves */
    await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [20, 55], zoom: 4 }));
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 10_000 }).toMatch(/^#v=20\.0000,55\.0000/);
    expect(await page.evaluate(() => location.hash)).toContain('&b=' + packed);
    /* Atlas reads it — the capability a recipient's question reaches */
    const r = await page.evaluate(() => window.IntMapOS.execute('briefing.open', { section: 1, read: true }).then((x) => ({ status: x.status, ok: x.ok, meta: x.meta || null })));
    expect(r.status, JSON.stringify(r)).toBe('completed');
    /* the second answer puts its own clock back, and the first answer's rows leave the map */
    await sheet.locator('.atl-br-pg[data-sec="1"]').click();
    await expect(sheet.locator('.atl-br-q')).toHaveText(S2.question);
    await expect.poll(() => page.evaluate(() => { const t = window.IntMapBookmark.state().time; return t && t.year; }), { timeout: 15_000 }).toBe(1990);
    expect(await page.evaluate(() => window.IntMapGeoEngine.layers.hasSource('atl-brief-ev'))).toBe(false);
    if (NOTEBOOK_SHOWN) {
      /* the recipient keeps it in their notebook (IndexedDB — what survives a reload) */
      await sheet.locator('.atl-br-act[data-act="keep"]').click();
      await expect.poll(() => page.evaluate(() => new Promise((res) => { const rq = indexedDB.open('intmap-atlas-notebook', 1);
        rq.onsuccess = () => { const g = rq.result.transaction('entries').objectStore('entries').get('nb-briefspec-bbbbbbbbbbbb'); g.onsuccess = () => res(g.result ? g.result.question : null); g.onerror = () => res(null); };
        rq.onerror = () => res(null); })), { timeout: 10_000 }).toBe(S2.question);
    } else {
      /* hidden: the briefing's notebook doors are not drawn; its own doors are */
      await expect(sheet.locator('.atl-br-act[data-act="keep"], .atl-br-act[data-act="compare"]')).toHaveCount(0);
      await expect(sheet.locator('.atl-br-act[data-act="rebuild"]')).toHaveCount(1);
      await expect(sheet.locator('.atl-br-act[data-act="savemap"]')).toHaveCount(1);
    }
    /* closing takes the briefing out of the address bar */
    await sheet.locator('.atl-br-back').click();
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 10_000 }).not.toContain('&b=');
    expect(await page.evaluate(() => window.IntMapGeoEngine.layers.hasSource('atl-brief-ev'))).toBe(false);

    if (NOTEBOOK_SHOWN) {
      /* ② the sender's side: the kept entry, shared again from the notebook */
      await page.locator('#atlas-panel .atl-nb-strip').click();
      await page.locator('#atlas-panel .atl-nb-item[data-id="nb-briefspec-bbbbbbbbbbbb"]').click();
      await page.locator('#atlas-panel .atl-nb-act[data-act="brief"]').click();
      await expect(sheet.locator('.atl-br-url')).toHaveValue(/#v=139\.7000,35\.6800,6\.00,0,0,f&b=z/, { timeout: 15_000 });
      const link = await sheet.locator('.atl-br-url').inputValue();
      const back = await unpackBriefing(link.split('&b=')[1]);
      expect(back.sections.map((s) => s.question)).toEqual([S2.question]);
    } else {
      /* ② hidden: there is no notebook to share from — no strip in the panel — and Atlas's briefing.share, asked for
         notebook entries, does not read the notebook: it asks what to share. Its remaining door, thisTurn, hands the
         answer being written straight to the composer (tests/notebook-hidden-checks.test.mjs). */
      await expect(page.locator('#atlas-panel .atl-nb-strip')).toHaveCount(0);
      const sh = await page.evaluate(() => window.IntMapOS.execute('briefing.share', { recent: 1 }).then((x) => ({ status: x.status, ok: x.ok, meta: x.meta || null })));
      expect(sh.ok, JSON.stringify(sh)).toBe(false);
      expect((sh.meta || {}).code, JSON.stringify(sh)).toBe('needs_input');
    }
    expect(errors, errors.join('\n')).toEqual([]);
  } finally { await ctx.close(); }
});

test('atlas-briefing ③ a damaged link is refused by name, and the map still opens on its view', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto('/#v=25.0000,58.0000,3.40,0,0,f&b=zAAAA', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await panelReady(page);
    await expect(page.locator('#atlas-panel .atl-br-err')).toContainText('damaged');
    await expect.poll(() => page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return Math.round(c.lng) + ',' + Math.round(c.lat); })).toBe('25,58');
  } finally { await ctx.close(); }
});
