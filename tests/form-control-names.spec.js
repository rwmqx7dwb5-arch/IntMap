/* ============================================================================
 *  IntMap · every form control has a name, and no phone legend is under the chrome
 * ----------------------------------------------------------------------------
 *  MEASURED in production (2026-09-26, 1280 px, nine layers on): 87 of 932 form controls had no
 *  accessible name — 49 range, 27 select, 8 date, one each of color / file / time. The typical one
 *  was a layer's opacity slider sitting right next to the word 「Opacity」, the two never joined.
 *  And at 375×812 a legend card's top-left was under the map switcher (`#bm-square`'s canvas) and its
 *  right end under the round FAB column — elementFromPoint said so.
 *  ② also opens each of those cards with its own button and asks the same five points (an opened card
 *  used to sit under the next one), and fires the `ofm` tile heartbeat twenty times to see it write
 *  nothing — both ride this boot because the phone profile cannot share the worker page (see ② itself).
 *
 *  ⚠ THE POPULATION IS DISCOVERED, NOT LISTED. ① asks the DOM for every input / select / textarea
 *  there is, visible or not, with one layer of every family the Layers panel offers switched on — so a
 *  control a future layer family adds is in this test the day it exists. Nothing here names a
 *  control, a layer or a legend.
 *
 *  ⚠ AND THE NAME IS THE BROWSER'S WHERE THE BROWSER CAN SAY. A control that is rendered is asked
 *  through Chromium's accessibility tree (CDP `Accessibility.getFullAXTree` — what a screen reader is
 *  handed). One that is not rendered (a closed panel, a collapsed row) is left out of that tree and
 *  has no name to ask for, so for those the naming steps are applied here (aria-labelledby,
 *  aria-label, <label>, title, placeholder), and ① also checks that this reading AGREES with the
 *  browser on every control the browser can answer for, so the half it cannot check is read by a rule
 *  shown to match it. (Playwright's `toHaveAccessibleName` was tried and dropped: it does not count
 *  `placeholder`, so it disagreed with Chromium on the search boxes.)
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

/* every form control in the document, tagged so the browser-side check can find each one again */
async function tagControls(page) {
  return page.evaluate(() => {
    const txt = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const labelText = (lab) => {
      const c = lab.cloneNode(true);
      c.querySelectorAll('input,select,textarea,[aria-hidden="true"]').forEach((x) => x.remove());
      return txt(c.textContent);
    };
    /* accname 1.2 §4.3.2, the steps a form control can take its name from, in their order */
    const nameOf = (el) => {
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = txt(by.split(/\s+/).map((id) => {
          const r = document.getElementById(id);
          if (!r) return '';
          return r === el ? (el.getAttribute('aria-label') || '') : r.textContent;   /* self-reference = own aria-label */
        }).join(' '));
        if (t) return t;
      }
      const al = txt(el.getAttribute('aria-label')); if (al) return al;
      for (const l of (el.labels || [])) { const t = labelText(l); if (t) return t; }
      const ti = txt(el.getAttribute('title')); if (ti) return ti;
      return txt(el.getAttribute('placeholder'));
    };
    const all = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')];
    return all.map((el, i) => {
      el.setAttribute('data-fcn', String(i));
      const rendered = typeof el.checkVisibility === 'function' ? el.checkVisibility() : !!el.getClientRects().length;
      return {
        i, rendered, name: nameOf(el),
        what: el.tagName.toLowerCase() + (el.type ? `[${el.type}]` : '') + (el.id ? '#' + el.id : '')
          + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')
          + ' in #' + ((el.parentElement && el.parentElement.closest('[id]')) || {}).id,
      };
    });
  });
}

test('① with a layer of every family on, every input / select / textarea in the DOM has an accessible name', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });

  /* ⚠ ONE LAYER OF EVERY FAMILY THE LAYERS PANEL OFFERS, found there. A layer's checkbox id says which
     module builds it (`dl-…` js/data-layers.js, `dl-ec-…` the ECMWF set, `bx-…` the World Bank packs,
     `gx-…`, `wp-dl-…`, `fac-dl-…`, `beta-dl-…` …), and it is the module that builds the legend and
     its controls — so the first unticked layer of each family is switched on, all together, and a
     family added tomorrow is in the sample the day it exists. ⚠ Not every layer at once: measured,
     170-odd layers switched on together keep the page's main thread busy long enough that the test
     itself cannot get a word in. */
  const ids = await page.evaluate(() => {
    const fam = new Map();
    for (const c of document.querySelectorAll('#layer-dropdown input[type=checkbox]')) {
      if (!c.id || c.checked) continue;
      const f = c.id.replace(/-[^-]+$/, '');
      if (!fam.has(f)) fam.set(f, c.id);
    }
    return [...fam.values()];
  });
  expect(ids.length, 'the Layers panel offered several families of layers').toBeGreaterThan(5);
  await page.evaluate((b) => {
    for (const id of b) { const c = document.getElementById(id); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }
  }, ids);
  /* legends and their rows arrive as their data does: wait until the population stops growing */
  let last = -1, still = 0;
  for (let t = 0; t < 40 && still < 4; t++) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => document.querySelectorAll('input:not([type=hidden]), select, textarea').length);
    still = n === last ? still + 1 : 0; last = n;
  }

  const ctl = await tagControls(page);
  expect(ctl.length, 'the population is the page, not a sample').toBeGreaterThan(150);
  /* the browser's own answer for every control it renders — Chromium's accessibility tree, the thing a
     screen reader is handed — and agreement with the reading above. The DOM and the tree are taken in
     two consecutive calls and joined by backend node id; a control re-rendered in between has lost its
     tag and is simply not asked about. */
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const fcnOf = new Map();
  (function walk(n) {
    const at = n.attributes || [];
    for (let j = 0; j < at.length; j += 2) if (at[j] === 'data-fcn') fcnOf.set(n.backendNodeId, +at[j + 1]);
    for (const k of (n.children || [])) walk(k);
    for (const k of (n.shadowRoots || [])) walk(k);
    if (n.contentDocument) walk(n.contentDocument);
  })(root);
  const byI = new Map(ctl.map((c) => [c.i, c]));
  const disagree = [];
  let asked = 0;
  for (const ax of nodes) {
    if (ax.ignored || !fcnOf.has(ax.backendDOMNodeId)) continue;
    const c = byI.get(fcnOf.get(ax.backendDOMNodeId)); if (!c) continue;
    asked++;
    const browserName = String((ax.name && ax.name.value) || '').trim();
    if (!!browserName !== !!c.name) disagree.push(`${c.what}: browser ${browserName ? `"${browserName}"` : 'unnamed'}, rule ${c.name ? `"${c.name}"` : 'unnamed'}`);
  }
  /* ⚠ A GUARD, NOT A POLICY. This number only says «the comparison below compared something». It was
     `> 5` and failed 2 runs in 4 at exactly 5 on the unchanged code: controls re-rendered between the
     DOM read and the tree read lose their tag and are not asked (see above), so how many are asked is a
     property of timing, not of naming. The claim is the next line; a vacuous run is what this refuses. */
  expect(asked, `some rendered controls were asked about (${ctl.filter((c) => c.rendered).length} rendered)`).toBeGreaterThan(0);
  expect(disagree, 'the naming rule applied to hidden controls must agree with the browser on rendered ones').toEqual([]);
  const unnamed = ctl.filter((c) => !c.name).map((c) => c.what + (c.rendered ? ' (on screen)' : ''));
  expect(unnamed, `${unnamed.length} of ${ctl.length} form controls have no accessible name (layers on: ${ids.join(', ')})`).toEqual([]);
});

/* every visible legend card, and each of its four corners and its centre that is not its own */
const COVERED = () => {
  const who = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ((e.closest('[id]') && !e.id) ? ' in #' + e.closest('[id]').id : '') : 'nothing';
  const out = [];
  for (const el of document.querySelectorAll('.data-legend, .koppen-legend')) {
    const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || b.width <= 1 || b.height <= 1) continue;
    /* a rounded corner is not part of the card: step in by the corner's own radius */
    const k = Math.max(2, Math.ceil(parseFloat(cs.borderTopLeftRadius) || 0));
    const pts = { 'top-left': [b.left + k, b.top + k], 'top-right': [b.right - k, b.top + k], 'bottom-left': [b.left + k, b.bottom - k],
      'bottom-right': [b.right - k, b.bottom - k], centre: [(b.left + b.right) / 2, (b.top + b.bottom) / 2] };
    for (const [where, [x, y]] of Object.entries(pts)) {
      const h = document.elementFromPoint(x, y);
      if (!(h && (h === el || el.contains(h)))) out.push(`#${el.id} ${where} (${Math.round(x)},${Math.round(y)}) is under ${who(h)}`);
    }
  }
  return out;
};

test.describe('② phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('② at 375×812 every legend card on screen is its own at its four corners and its centre — also after each is opened — and the ofm tile heartbeat writes nothing', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
    /* switch on layers that own a legend, found in the Layers panel, until three cards are up */
    const legendsUp = () => page.evaluate(() => [...document.querySelectorAll('.data-legend, .koppen-legend')]
      .filter((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1; }).length);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#layer-dropdown .lyr-row.has-legend input[type=checkbox]')]
      .filter((c) => c.id && !c.checked).map((c) => c.id));
    /* ⚠ WAITS ON THE CONDITION, NOT ON THE CLOCK. This used to sleep 1.5 s per layer and 1.5 s more
       «because the tiler runs on the legends' own timers». Since every legend's size change re-places
       the stack on the next frame (js/data-layers.js `watchLegendSize`), what is waited for is the card
       itself; the steps below re-ask after every press, so a card whose body arrives late is asked
       again anyway. The seconds this saved pay for those steps. */
    for (const id of rows) {
      const n = await legendsUp();
      if (n >= 3) break;
      await page.evaluate((cid) => { const c = document.getElementById(cid); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }, id);
      await page.waitForFunction((k) => [...document.querySelectorAll('.data-legend, .koppen-legend')]
        .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 1).length > k, n, { timeout: 1_500 }).catch(() => {});   /* at most the 1.5 s the old sleep always took */
    }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    expect(await legendsUp(), 'three legend cards are on screen').toBeGreaterThanOrEqual(3);

    expect(await page.evaluate(COVERED)).toEqual([]);

    /* ══ …AND STILL WHEN ONE OF THEM IS OPENED (2026-09-26, production, 375×812) ════════════════
       Pressing ▢ grew a card to its full body and left the cards below it where they were: the
       opened card's lower half was under the next one (measured here before the fix: Köppen's
       centre under the radar card; with the radar card open, all five points of the snow card
       under it). Every card is opened by its OWN button, in turn, and the same five points are
       asked of every card on screen — and a card the reader opened is not folded back. It rides
       this test's boot because the phone profile cannot share the worker page and the question
       needs exactly the three cards set up above. */
    await test.step('each legend, opened by its own button, is still its own at its corners and centre', async () => {
      const ids = await page.evaluate(() => [...document.querySelectorAll('.data-legend, .koppen-legend')]
        .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 1).map((el) => el.id));
      const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const shut = (i) => page.evaluate((x) => document.getElementById(x).classList.contains('legend-collapsed'), i);
      const tall = (i) => page.evaluate((x) => document.getElementById(x).getBoundingClientRect().height, i);
      let opened = 0;
      for (const id of ids) {
        if (!(await shut(id))) continue;
        const btn = page.locator(`#${id} > .legend-min`);
        const before = await tall(id);
        await btn.click();
        await page.waitForFunction((x) => !document.getElementById(x).classList.contains('legend-collapsed'), id);
        await frames();
        expect(await tall(id), `#${id} did not open`).toBeGreaterThan(before);
        expect(await page.evaluate(COVERED), `after opening #${id}`).toEqual([]);
        expect(await shut(id), `#${id} was folded back by the tiler`).toBe(false);
        opened++;
        await btn.click();
        await page.waitForFunction((x) => document.getElementById(x).classList.contains('legend-collapsed'), id);
        await frames();
        expect(await page.evaluate(COVERED), `after closing #${id} again`).toEqual([]);
      }
      expect(opened, 'no card on the phone started folded, so nothing was opened').toBeGreaterThanOrEqual(2);
    });

    /* ══ THE `ofm` TILE HEARTBEAT WRITES NOTHING (2026-09-26, production) ════════════════════════
       With the clock and camera still, `ofm` fired `sourcedata` every 0.1–1.2 s and js/app-body.js
       re-ran two whole passes each time (49 writes to `ofm-city` in twelve seconds). Both now run
       under `layers.witness()` (js/geo-engine.js). ⚠ FIRED, NOT WAITED FOR: on this harness a map
       at rest received no `ofm` sourcedata at all in twelve seconds, so waiting would prove nothing;
       the renderer's own event is dispatched twenty times and every write it causes is synchronous.
       Nothing here names a layer except the one the heal/theme/language half reads: `ofm-city`
       when the style has it (the layer the report counted), otherwise the first `ofm` symbol layer. */
    await test.step('the ofm heartbeat writes nothing; a new layer, the basemap, the theme and the language still do', async () => {
      await page.evaluate(() => {
        const m = window.__imap; const W = (window.__hbW = { on: false, n: {} });
        for (const f of ['setLayoutProperty', 'setPaintProperty']) {
          const orig = m[f].bind(m);
          m[f] = (id, p, v, o) => { if (W.on) { const k = id + ' ' + p; W.n[k] = (W.n[k] || 0) + 1; } return orig(id, p, v, o); };
        }
      });
      const beat = (n) => page.evaluate((k) => { const W = window.__hbW; W.n = {}; W.on = true;
        try { for (let i = 0; i < k; i++) window.__imap.fire('sourcedata', { sourceId: 'ofm', dataType: 'source', isSourceLoaded: true, sourceDataType: 'content' }); }
        finally { W.on = false; } return W.n; }, n);
      await beat(1);   /* the passes run once for whatever changed since boot (the legends above added layers) */
      expect(await beat(20), 'twenty ofm heartbeats over unchanged layers wrote to the renderer').toEqual({});

      const victim = await page.evaluate(() => { const L = window.__imap.getStyle().layers.filter((l) => l.type === 'symbol' && l.source === 'ofm').map((l) => l.id);
        return L.includes('ofm-city') ? 'ofm-city' : L[0]; });
      expect(victim, 'the style has place-label layers on the ofm source').toBeTruthy();
      /* a RECREATED label layer is given the pass by the next heartbeat (the #R26 / #R72 purpose) */
      await page.evaluate((id) => { const m = window.__imap; const ls = m.getStyle().layers; const i = ls.findIndex((l) => l.id === id);
        const def = ls[i], before = ls[i + 1] && ls[i + 1].id; m.removeLayer(id); m.addLayer(def, before); }, victim);
      const healed = await beat(1);
      expect(Object.keys(healed).includes(victim + ' text-font'), `the recreated ${victim} was not given the label pass`).toBe(true);

      /* the basemap and the theme reach the label colour, the language its text — each through its
         own caller (applyTheme / the language pill), which the heartbeat's witness never gates */
      const colourOf = () => page.evaluate((id) => JSON.stringify(window.__imap.getPaintProperty(id, 'text-color')), victim);
      const changes = (c) => page.waitForFunction(({ id, c }) => JSON.stringify(window.__imap.getPaintProperty(id, 'text-color')) !== c, { id: victim, c }, { timeout: 15_000 });
      if (await page.evaluate(() => document.getElementById('btn-view-sat').classList.contains('active'))) {
        const s0 = await colourOf();
        await page.evaluate(() => window.IntMapOS.exec('view.base.map', { source: 'test' }));
        /* on a light theme the map basemap gives dark text, where the satellite gave light */
        if (await page.evaluate(() => document.documentElement.getAttribute('data-theme') !== 'dark')) await changes(s0);
      }
      const c0 = await colourOf();
      const toDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme') !== 'dark');
      const tr = await page.evaluate((d) => window.IntMapConsole.dispatch({ type: 'theme', mode: d ? 'dark' : 'light' }), toDark);
      expect(tr && tr.ok, 'the theme action reported success').toBe(true);
      await changes(c0);
      const f0 = await page.evaluate((id) => JSON.stringify(window.__imap.getLayoutProperty(id, 'text-field')), victim);
      const other = await page.evaluate(() => (document.getElementById('lang-jp').classList.contains('active') ? 'en' : 'jp'));
      await page.evaluate((c) => document.getElementById('lang-' + c).click(), other);
      await page.waitForFunction(({ id, f }) => JSON.stringify(window.__imap.getLayoutProperty(id, 'text-field')) !== f, { id: victim, f: f0 }, { timeout: 15_000 });
    });
  });
});


test('③ every tool the Tools menu opens, opened one at a time, has a name on every form control it builds', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });

  /* ⚠ THE DOORS ARE FOUND, NOT LISTED. Two places in the app say which tools exist:
       · the Tools section of the Layers panel (`.lst-toolbody`) — the rows js/map-ui.js builds from its
         tool registry, plus the real `#layer-tools` strip every module appends its own button to;
       · the phone's tools sheet (`#tools-sheet [data-proxy]`) — the list of the map toolbar's tools,
         each naming the real button it presses.
     Each door is pressed, the page is left to build what it opens, every form control then in the
     DOM is read, and the door is closed again before the next one — one panel at a time, so no two
     simulators ever run together on the main thread. */
  await page.waitForFunction(() => document.querySelectorAll('.lst-toolbody .lst-toolrow').length > 0, null, { timeout: 30_000 });
  const doors = await page.evaluate(() => {
    const out = [];
    const key = (e) => e.dataset.act ? `[data-act="${e.dataset.act}"]` : (e.id ? '#' + e.id : null);
    for (const e of document.querySelectorAll('.lst-toolbody button')) {
      if (!e.getClientRects().length) continue;            /* a door the reader cannot see is not a door */
      const k = key(e); if (k && !out.includes(k)) out.push(k);
    }
    for (const e of document.querySelectorAll('#tools-sheet [data-proxy]')) {
      const k = '#' + e.dataset.proxy; if (document.querySelector(k) && !out.includes(k)) out.push(k);
    }
    return out;
  });
  expect(doors.length, 'the Tools menu offered tools to open').toBeGreaterThan(10);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('filechooser', () => {});

  const settle = async () => {
    let last = -1, still = 0;
    for (let t = 0; t < 25 && still < 3; t++) {
      await page.waitForTimeout(400);
      const n = await page.evaluate(() => document.querySelectorAll('input:not([type=hidden]), select, textarea').length);
      still = n === last ? still + 1 : 0; last = n;
    }
  };
  const unnamed = new Map();
  let seen = 0;
  for (const door of doors) {
    await page.evaluate((k) => { const e = document.querySelector(k); if (e) e.click(); }, door);
    await settle();
    const ctl = await tagControls(page);
    seen = Math.max(seen, ctl.length);
    for (const c of ctl) if (!c.name && !unnamed.has(c.what)) unnamed.set(c.what, door);
    /* close it again: a registry row closes on its second press (it asks the module, js/map-ui.js
       `_toolOn`), a toolbar tool through its panel's own ×, and every menu through the app's own
       `_close…` doors — the same ones tests/helpers/app.js uses */
    await page.evaluate((k) => {
      const e = document.querySelector(k);
      if (e && e.classList.contains('lst-toolrow') && e.classList.contains('on')) e.click();
      const x = document.querySelector('#tool-panel .tp-close'); if (x) x.click();
      for (const n of Object.keys(window)) if (/^_close[A-Za-z]*(Menu|Popup)$/.test(n) && typeof window[n] === 'function') { try { window[n](); } catch (_) { } }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, door);
    await page.waitForTimeout(300);
  }
  expect(seen, 'the population is the page, not a sample').toBeGreaterThan(150);
  const list = [...unnamed].map(([w, d]) => `${w}  ← opened by ${d}`);
  expect(list, `${list.length} form controls have no accessible name (doors: ${doors.length})`).toEqual([]);
});
