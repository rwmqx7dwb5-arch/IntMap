/* ============================================================================
 *  layer-manifest — the Layers registry and js/layer-manifest.js are the same list (browser)
 * ----------------------------------------------------------------------------
 *  The node half (tests/layer-manifest-checks.test.mjs) proves the list exists without a
 *  document. This half proves the document agrees with it — the defect layer-manifest names is «the rows and
 *  the declarations can disagree», and only a booted app has the rows:
 *    ① every checkbox the modules build is declared, and every declaration has its checkbox;
 *    ② after reorganizeLayerPanel, the order, the shelf headings and the 「その他N件」 marks the
 *      DOCUMENT shows are the manifest's — asked the way the Layers panel used to ask (a walk of the
 *      registry, copied here from js/map-ui.js before layer-manifest), so the reader that moved is compared
 *      against the reader it replaced;
 *    ③ the rows the manifest writes are the markup index.html shipped (attribute `checked` ⇔ `on`);
 *    ④ the session restore applies layers whose rows are built late (the wait itself is driven in the node half);
 *    ⑤ each lazy link is real: switching the row on loads the module the manifest names.
 *  ⚠ No fixed sleeps: every wait is for the thing itself (#R399).
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { LAYERS, HIDDEN, BASE, rowHTML } from '../js/layer-manifest.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';
import { BASE as ORIGIN, sessionWith, SESSION_KEY, seededStorageState } from './helpers/session-seed.js';

const DECL = LAYERS.map((l) => ({ id: l.id, shelf: l.shelf, rest: !!l.rest, html: !!l.html, on: !!l.on, label: l.label || null }));

/* every declared checkbox exists — i.e. every module has built its row */
async function allRows(page) {
  await page.waitForFunction((ids) => ids.every((id) => document.getElementById(id)), DECL.map((l) => l.id), { timeout: 60000 });
}

test('layer-manifest ①② the registry the modules build is exactly the manifest, in the manifest order, on its shelves', async ({ app }) => {
  const page = app.page;
  await allRows(page);
  const got = await page.evaluate(() => {
    window.reorganizeLayerPanel();
    const dd = document.getElementById('layer-dropdown');
    const skipIn = (el) => el.closest('#layer-active-section') || el.closest('#layer-fav-section') || el.closest('#layer-search-wrap') || el.closest('#layer-tools');
    const boxes = Array.from(dd.querySelectorAll('input[type=checkbox]')).filter((cb) => !skipIn(cb));
    /* the walk js/map-ui.js's rowsFromDropdown did before layer-manifest: headings and rows in document order */
    let shelf = 'base'; const walked = [];
    const walk = (el) => { for (const ch of el.children) { if (skipIn(ch)) continue;
      if (ch.classList.contains('lyr-head') || ch.classList.contains('lyr-section-label')) { shelf = ch.getAttribute('data-i18n') || shelf; continue; }
      if (ch.matches('label')) { const cb = ch.querySelector('input[type=checkbox]'); if (cb) { const row = ch.closest('.lyr-row') || ch;
        walked.push({ id: cb.id, shelf, rest: row.getAttribute('data-lyr-rest') === '1' }); } continue; }
      if (ch.children.length) walk(ch); } };
    walk(dd);
    return { ids: boxes.map((cb) => cb.id), walked, hidden: window.IntMapHiddenLayerRows.slice() };
  });
  /* ① the same set, both ways */
  const declared = new Set(DECL.map((l) => l.id));
  expect(got.ids.filter((id) => !declared.has(id)), 'rows the manifest does not declare').toEqual([]);
  expect(DECL.map((l) => l.id).filter((id) => got.ids.indexOf(id) < 0), 'declarations with no row').toEqual([]);
  expect(got.hidden).toEqual(DECL.filter((l) => l.shelf === HIDDEN).map((l) => l.id));
  /* ② the order, shelf and fold the document shows (hidden rows are not part of the browser) */
  const shown = got.walked.filter((r) => got.hidden.indexOf(r.id) < 0);
  const want = DECL.filter((l) => l.shelf !== HIDDEN).map((l) => ({ id: l.id, shelf: l.shelf === BASE ? 'base' : l.shelf, rest: l.rest }));
  expect(shown).toEqual(want);
});

test('layer-manifest ②③ the tile browser lists the manifest, and the rows the manifest writes are index.html\'s markup', async ({ app }) => {
  const page = app.page;
  await allRows(page);
  /* ③ what the manifest WROTE is still there, attribute for attribute (the attribute, not the live
     property, is what shipped). ⚠ Not a byte comparison of the whole row: other owners annotate the
     row after it is written, and which of them have run depends on what this worker did before —
     measured on CI, where an earlier test had loaded Atlas and js/atlas-controls.js had named every
     box (`aria-label`, `data-imname`), and the favourites star (js/layer-favs.js) appears at 900 ms.
     Those are not the manifest's to write; everything the manifest writes must be exactly as written. */
  const en = await page.evaluate(() => window.IntMapI18N.en);
  const want = DECL.filter((l) => l.html).map((l) => ({ id: l.id, html: rowHTML(l, (k) => en[k]) }));
  const drift = await page.evaluate((rows) => {
    const out = [];
    const cmp = (exp, act, path) => {
      if (!act || act.tagName !== exp.tagName) { out.push(path + ': ' + exp.tagName + ' is ' + (act ? act.tagName : 'missing')); return; }
      for (const a of exp.getAttributeNames()) if (act.getAttribute(a) !== exp.getAttribute(a)) out.push(path + ' @' + a + ': ' + JSON.stringify(act.getAttribute(a)) + ' ≠ ' + JSON.stringify(exp.getAttribute(a)));
      if (!exp.children.length && act.textContent !== exp.textContent) out.push(path + ' text: ' + JSON.stringify(act.textContent) + ' ≠ ' + JSON.stringify(exp.textContent));
      const kids = Array.from(act.children).filter((c) => !c.classList.contains('lyr-star'));
      Array.from(exp.children).forEach((c, i) => cmp(c, kids[i], path + '>' + c.tagName.toLowerCase()));
    };
    for (const r of rows) {
      const t = document.createElement('template'); t.innerHTML = r.html;
      cmp(t.content.firstElementChild, document.getElementById(r.id).closest('label'), r.id);
    }
    return out;
  }, want);
  expect(drift, 'the generated rows differ from what the manifest writes').toEqual([]);
  /* ② the right sidebar's tiles come from the manifest now: every tile id is declared, in manifest order */
  const tiles = await page.evaluate(async () => {
    const S = window.IntMapLayerSidebar; if (!S) return null;
    if (!document.querySelector('.lst-tile[data-lid]')) { try { S.toggle(); } catch (_) {} }
    for (let i = 0; i < 100 && !document.querySelector('.lst-tile[data-lid]'); i++) await new Promise((r) => requestAnimationFrame(r));
    const ids = Array.from(document.querySelectorAll('#layer-sidebar-r .lst-tile[data-lid]')).map((t) => t.dataset.lid);
    try { S.toggle(); } catch (_) {}
    return ids;
  });
  expect(tiles && tiles.length, 'the tile browser drew tiles').toBeGreaterThan(100);
  const order = DECL.filter((l) => l.shelf !== HIDDEN).map((l) => l.id);
  const seen = tiles.filter((id, i) => tiles.indexOf(id) === i);
  expect(seen.filter((id) => order.indexOf(id) < 0), 'tiles for undeclared rows').toEqual([]);
  expect(seen.map((id) => order.indexOf(id)), 'tiles in manifest order').toEqual(seen.map((id) => order.indexOf(id)).slice().sort((a, b) => a - b));
});

test("layer-manifest ④ the session restore applies rows that are built late, marked as the restore's", async ({ browser }) => {
  /* two module-built rows (900 ms and later) and a retired id nothing will ever build */
  const late = ['dl-webcams', 'wp-dl-currents'];
  /* the suite's seed (tests/helpers/session-seed.js), with its session entry replaced by one that
     also names the layers under test — every other entry the seed carries stays as it is */
  const state = seededStorageState();
  state.origins.forEach((o) => o.localStorage.forEach((e) => { if (e.name === SESSION_KEY) e.value = sessionWith(late.concat(['dl-never-a-layer'])); }));
  const ctx = await browser.newContext({ storageState: state });
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((ids) => ids.every((id) => { const cb = document.getElementById(id); return cb && cb.checked && cb.__imRestored; }), late, { timeout: 60000 });
    /* the retired id names no row and is not waited for (tests/layer-manifest-checks ④ drives the wait itself) */
    expect(await page.evaluate(() => !!document.getElementById('dl-never-a-layer'))).toBe(false);
  } finally { await ctx.close(); }
});

test('layer-manifest ⑤ each lazy link is real: switching the row on loads the module the manifest names', async ({ app }) => {
  const page = app.page;
  await allRows(page);
  /* one row per module: `loaded` only grows, so a second row naming a module the first already loaded
     would pass without asking anything (measured: 17 rows, 9 modules — 14.7 s for the same verdict) */
  const rows = LAYERS.filter((l) => l.lazy && l.lazy.length)
    .filter((l, i, all) => all.findIndex((m) => m.lazy.join() === l.lazy.join()) === i);
  expect(rows.length).toBeGreaterThan(0);
  for (const l of rows) {
    const names = l.lazy.filter((n) => LAZY_REGISTRY[n]);
    expect(names).toEqual(l.lazy);
    await page.evaluate((id) => { const cb = document.getElementById(id); if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } }, l.id);
    await page.waitForFunction((ns) => ns.every((n) => ((window.__imLazyCheck || {}).loaded || []).indexOf(n) >= 0), names, { timeout: 30000 });
    await page.evaluate((id) => { const cb = document.getElementById(id); if (cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } }, l.id);
  }
});
