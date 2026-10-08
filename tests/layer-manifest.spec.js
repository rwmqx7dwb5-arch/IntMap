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
    /* leave the sidebar as it was found — a spec that toggles blind leaves it OPEN for the next test on
       this worker (measured: tests/r170's 3-D volume clicks all landed on it, 0/4 points) */
    const wasOpen = !!document.querySelector('.lst-tile[data-lid]');
    if (!wasOpen) { try { S.toggle(); } catch (_) {} }
    for (let i = 0; i < 100 && !document.querySelector('.lst-tile[data-lid]'); i++) await new Promise((r) => requestAnimationFrame(r));
    const ids = Array.from(document.querySelectorAll('#layer-sidebar-r .lst-tile[data-lid]')).map((t) => t.dataset.lid);
    if (!wasOpen) { try { S.toggle(); } catch (_) {} }
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

/* ══ (layer-packages) ⑥ A ROW WHOSE IMPLEMENTATION MOVED INTO ITS OWN MODULE DRAWS WHAT THE MONOLITH DREW ══════════
   js/layer-pkg-<name>.js holds the implementation js/data-layers.js used to carry for the rows whose declaration names
   it (`pkg`), and js/data-layers.js loads it the first time one of them is switched. The claim is that the reader sees
   no difference, so the evaluation is the reader's: tick the row, move its opacity slider, untick it — and after each
   step read what is on the map (every style layer and source the row added, with its paint, layout, tiles and its place
   in the stack) and the row's legend. tests/fixtures/layer-packages-before.json is that same evaluation, run on the tree
   BEFORE the move (IM_LAYER_PACKAGES_CAPTURE=<file> writes the evaluation there — never into the checkout, scripts/tree-writers.mjs
   — and the file was copied over the fixture; how it was taken is in dev-notes/2026-10-02-layer-packages.md).
   ⚠ (wave3-nightly-root) RE-TAKEN ONCE, THE SAME WAY, AFTER #902 (icons from glyphs to js/icons.js SVG): the radar
   player's ⏮ ◀ ▶ ▶ ⏭ and the 🕒 of the radar and fire «when» line became `<svg class="im-icon">`, and the nightly deep
   tier went red on dl-radar (2026-10-02/03). The capture of cb3a3918 differed from the old fixture in exactly those six
   legend strings (dl-radar and dl-thermal, three phases each) and nowhere else — every layer, source, paint, layout,
   tile and stack position was byte-identical — so the move this test guards is still measured against what it drew.
   The upstreams are answered from here so the drawing is deterministic: RainViewer's frame index (two frames) and the
   GIBS 4×4 probe the fire row makes; every other external host stays blocked (tests/helpers/network.js). Calendar dates
   and digits inside legend text are masked — they are the day and the timezone the run happens in, not the drawing —
   and so are the names js/atlas-controls.js writes onto every control when it runs.
   ⚠ A fresh context, not the shared page: «where in the stack did the row's layer land» is only comparable on a map
   nothing else has drawn on.
   ⚠⚠ (deep-tier-reds) THE LEGEND IS COMPARED AS WHAT IT SAYS, NOT AS A COPY OF ITS MARKUP. The re-take above was the
   first time the byte copy went stale; the second was #978 (quest-blind-everything), which gave the shared clock row
   js/data-layers.js builds an attribute that declares «this prints the map's year» to js/quest-panel.js — dl-milSpend,
   three phases, one attribute, and the nightly deep tier was red from 2026-10-02 on a change nobody had made to the
   package. Every owner that annotates a legend for its own reader would have repeated that, and each re-take moves the
   fixture off the tree before the move, which is the only thing it is for. So the map half stays byte-for-byte (every
   layer, source, paint, layout, tile and stack position), and the legend — fixture and page alike, through ONE reader,
   lpLegendRead — is read as: shown or hidden; its words; each control by the name its tooltip gives it (so a glyph
   becoming an SVG icon, #902, is not a difference); every slider's range; every colour ramp; every pressed state; and
   the class names other code finds the parts by. The fixture is still the capture of the tree before the move. */
import { readFileSync as _lpRead, writeFileSync as _lpWrite, existsSync as _lpExists } from 'node:fs';
import { installHermeticRouting } from './helpers/network.js';
const LP_FIXTURE = new URL('./fixtures/layer-packages-before.json', import.meta.url);
const LP_CAPTURE = process.env.IM_LAYER_PACKAGES_CAPTURE || '';
/* the rows the evaluation is run on, with the short name the row's legend and slider are keyed by */
const LP_ROWS = [['dl-subcables', 'subcables'], ['dl-radar', 'radar'], ['dl-thermal', 'thermal'],
  ['dl-nato', 'nato'], ['dl-eu', 'eu'], ['dl-milSpend', 'milSpend']];
const LP_RV = { version: '2.0', generated: 1700000600, host: 'https://tilecache.rainviewer.com',
  radar: { past: [{ time: 1700000000, path: '/v2/radar/1700000000' }, { time: 1700000600, path: '/v2/radar/1700000600' }], nowcast: [] } };
/* 1×1 transparent PNG — what the GIBS probe needs to hear to keep every fire product */
const LP_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/* the map has settled when what it holds (or what a row added to it) has read the same for `ms` — the boot draws the
   country table and the night side after the style is up, and a row's tiles and legend arrive after its tick; this
   waits for that, not for a fixed time */
const lpSettled = (page, sig, arg, ms) => page.waitForFunction(({ sig, arg, ms }) => {
  const s = JSON.stringify(sig === 'map' ? (() => { const st = window.__imap.getStyle(); return [st.layers.map((l) => l.id), Object.keys(st.sources)]; })() : window.__lpSnap(arg));
  const w = window.__lpSettle || (window.__lpSettle = {});
  if (w.s !== s) { w.s = s; w.at = performance.now(); return false; }
  return performance.now() - w.at >= ms;
}, { sig, arg, ms }, { timeout: 60000, polling: 250 });
/* what the row added to the map and to its legend, relative to the map before it was ticked */
function lpSnapshot({ base, key, cbId }) {
  const mask = (s) => String(s).replace(/\d{4}-\d{2}-\d{2}/g, 'DATE');
  const st = window.__imap.getStyle();
  const ids = st.layers.map((l) => l.id);
  const layers = st.layers.map((l, i) => [l, i]).filter(([l]) => base.layers.indexOf(l.id) < 0).map(([l, i]) => ({
    id: l.id, type: l.type, source: l.source || null,
    before: ids.slice(i + 1).find((x) => base.layers.indexOf(x) >= 0) || null,
    paint: JSON.parse(mask(JSON.stringify(l.paint || {}))), layout: l.layout || {}, filter: l.filter || null,
    minzoom: l.minzoom == null ? null : l.minzoom, maxzoom: l.maxzoom == null ? null : l.maxzoom }));
  const sources = Object.keys(st.sources).filter((s) => base.sources.indexOf(s) < 0).sort().map((s) => {
    const o = Object.assign({}, st.sources[s]);
    if (o.data && typeof o.data === 'object') { const j = JSON.stringify(o.data); let h = 0; for (let i = 0; i < j.length; i++) h = (h * 31 + j.charCodeAt(i)) | 0;
      o.data = { features: (o.data.features || []).length, chars: j.length, hash: h }; }
    if (o.tiles) o.tiles = o.tiles.map(mask);
    return [s, o]; });
  const lg = document.getElementById('data-legend-' + key);
  const cb = document.getElementById(cbId);
  const row = cb && cb.closest('.lyr-row');
  return { checked: !!(cb && cb.checked), rowOn: !!(row && row.classList.contains('on')), layers, sources,
    /* `aria-label` / `data-imname` are js/atlas-controls.js naming every control whenever it runs — another owner, on its own clock */
    legend: lg ? { display: lg.style.display, html: mask(lg.innerHTML).replace(/ (?:aria-label|data-imname)="[^"]*"/g, '').replace(/\d/g, '#') } : null };
}
/* what a legend SAYS (see the note above ⑥): one reader for the fixture's markup and the page's, so the two are read
   the same way. Runs in the page — it parses the markup the way the browser does. */
function lpLegendRead(html) {
  const t = document.createElement('template'); t.innerHTML = html;
  const out = [];
  const css = (el) => (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).sort().join('.');
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const s = c.textContent.replace(/\s+/g, ' ').trim(); if (s) out.push('text ' + s); continue; }
      if (c.nodeType !== 1 || c.namespaceURI === 'http://www.w3.org/2000/svg') continue;   /* an icon draws; its control is named below */
      const cls = css(c); if (cls) out.push('class ' + cls);
      const bg = (c.getAttribute('style') || '').match(/(?:linear|radial|conic)-gradient\([^;]*\)/);
      if (bg) out.push('ramp ' + bg[0].replace(/\s+/g, ''));
      if (c.hasAttribute('aria-pressed')) out.push('pressed ' + c.getAttribute('aria-pressed'));
      if (c.tagName === 'INPUT') out.push('input ' + ['type', 'min', 'max', 'step'].map((a) => c.getAttribute(a)).join(' '));
      if (c.hasAttribute('title')) { out.push('control ' + c.getAttribute('title')); continue; }   /* named by its tooltip, not by its glyph */
      walk(c);
    }
  };
  walk(t.content);
  return out;
}
/* the evaluation as compared: the map half as captured, the legend as lpLegendRead reads it */
const lpCompared = (snap) => (snap && snap.legend ? Object.assign({}, snap, { legend: { display: snap.legend.display, read: window.__lpRead(snap.legend.html) } }) : snap);

test('layer-packages ⑥ each packaged row draws, fades and clears exactly what js/data-layers.js drew before the move', async ({ browser }) => {
  test.setTimeout(LP_CAPTURE ? 300000 : 120000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(ctx);
  await ctx.route((u) => u.hostname === 'api.rainviewer.com', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LP_RV) }));
  await ctx.route((u) => u.hostname === 'gibs.earthdata.nasa.gov' && /WIDTH=4&/.test(u.search), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: LP_PNG }));
  const page = await ctx.newPage();
  const want = !LP_CAPTURE && _lpExists(LP_FIXTURE) ? JSON.parse(_lpRead(LP_FIXTURE, 'utf8')) : null;
  const got = {};
  try {
    await page.goto(ORIGIN + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((ids) => window.__imap && window.__imap.isStyleLoaded() && ids.every((id) => document.getElementById(id)), LP_ROWS.map((r) => r[0]), { timeout: 60000 });
    await page.evaluate('window.__lpSnap = ' + lpSnapshot.toString());
    await page.evaluate('window.__lpRead = ' + lpLegendRead.toString() + '; window.__lpCmp = ' + lpCompared.toString());
    /* the fixture read through the same reader as the page (it is markup; the reader is the browser's parser) */
    const wantCmp = want ? await page.evaluate((w) => { const o = {}; for (const id of Object.keys(w)) { o[id] = {}; for (const p of Object.keys(w[id])) o[id][p] = window.__lpCmp(w[id][p]); } return o; }, want) : null;
    /* the reader reads something: each row's legend, as the fixture holds it, has a title and its words */
    if (wantCmp) for (const [cbId] of LP_ROWS) expect((wantCmp[cbId].on.legend || { read: [] }).read.filter((s) => s.startsWith('text ')).length, cbId + ' legend read as words').toBeGreaterThan(1);
    for (const [cbId, key] of LP_ROWS) {
      await lpSettled(page, 'map', null, 3000);
      const base = await page.evaluate(() => { const st = window.__imap.getStyle(); return { layers: st.layers.map((l) => l.id), sources: Object.keys(st.sources) }; });
      const arg = { base, key, cbId };
      const steps = [
        ['on', () => page.evaluate((id) => { const cb = document.getElementById(id); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }, cbId)],
        ['opacity', () => page.evaluate((k) => { const s = document.getElementById('op-' + k); s.value = '0.5'; s.dispatchEvent(new Event('input', { bubbles: true })); }, key)],
        ['off', () => page.evaluate((id) => { const cb = document.getElementById(id); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }, cbId)],
      ];
      got[cbId] = {};
      for (const [phase, act] of steps) {
        await act();
        if (want) {
          await expect.poll(() => page.evaluate((a) => window.__lpCmp(window.__lpSnap(a)), arg), { timeout: 30000, message: cbId + ' ' + phase }).toEqual(wantCmp[cbId][phase]);
        } else {
          await lpSettled(page, 'row', arg, 2000);
          got[cbId][phase] = await page.evaluate(lpSnapshot, arg);
        }
      }
    }
    if (LP_CAPTURE) _lpWrite(LP_CAPTURE,JSON.stringify(got, null, 1) + '\n');
    else expect(want, 'tests/fixtures/layer-packages-before.json is the evaluation of the tree before the move').not.toBeNull();
  } finally { await ctx.close(); }
});
