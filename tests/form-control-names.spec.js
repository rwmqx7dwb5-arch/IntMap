/* ============================================================================
 *  IntMap · every form control has a name, and no phone legend is under the chrome
 * ----------------------------------------------------------------------------
 *  MEASURED in production (2026-09-26, 1280 px, nine layers on): 87 of 932 form controls had no
 *  accessible name — 49 range, 27 select, 8 date, one each of color / file / time. The typical one
 *  was a layer's opacity slider sitting right next to the word 「Opacity」, the two never joined.
 *  And at 375×812 a legend card's top-left was under the map switcher (`#bm-square`'s canvas) and its
 *  right end under the round FAB column — elementFromPoint said so.
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
  expect(asked, 'some controls were rendered to ask the browser about').toBeGreaterThan(5);
  expect(disagree, 'the naming rule applied to hidden controls must agree with the browser on rendered ones').toEqual([]);
  const unnamed = ctl.filter((c) => !c.name).map((c) => c.what + (c.rendered ? ' (on screen)' : ''));
  expect(unnamed, `${unnamed.length} of ${ctl.length} form controls have no accessible name (layers on: ${ids.join(', ')})`).toEqual([]);
});

test.describe('② phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('② at 375×812 every legend card on screen is its own at its four corners and its centre', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
    /* switch on layers that own a legend, found in the Layers panel, until three cards are up */
    const legendsUp = () => page.evaluate(() => [...document.querySelectorAll('.data-legend, .koppen-legend')]
      .filter((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1; }).length);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#layer-dropdown .lyr-row.has-legend input[type=checkbox]')]
      .filter((c) => c.id && !c.checked).map((c) => c.id));
    for (const id of rows) {
      if ((await legendsUp()) >= 3) break;
      await page.evaluate((cid) => { const c = document.getElementById(cid); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }, id);
      await page.waitForTimeout(1_500);
    }
    await page.waitForTimeout(1_500);   /* the tiler runs on the legends' own timers */
    expect(await legendsUp(), 'three legend cards are on screen').toBeGreaterThanOrEqual(3);

    const covered = await page.evaluate(() => {
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
    });
    expect(covered).toEqual([]);
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
