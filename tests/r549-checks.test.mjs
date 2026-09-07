/* ============================================================================
 *  R549 — the ShakeMap legend followed the map, but only by one door
 * ----------------------------------------------------------------------------
 *  MEASURED IN PRODUCTION (#R546, live site, 2014 South Napa):
 *    · `open(id, 'pga')` drew PGA on the map — contours, no surface, `units:"pctg"`,
 *      `levels:[0.2 … 50]` — and left the legend showing MMI's 2.5…7.5 swatches.
 *      Only `show()` mounted the legend, so every other door into `open()` left
 *      the reader reading the previous measure.
 *    · The heading NEVER followed, by any door. `_registerLayerOpacity` passes the
 *      name to `ensureGenericLegend`, which writes the <h4> only when it CREATES
 *      the box; a second call with a new name is ignored. The box said
 *      «ShakeMap（USGS） · MMI» over PGA's swatches and over PSA(1.0)'s.
 *
 *  ⚠ THE CHECKS RUN THE SHIPPED MODULE (#R505) against the real USGS fixture, with
 *  a legend host stubbed the way js/data-layers.js builds one — the claim is about
 *  what ends up IN the box, not about which function was called.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/shakemap-napa.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(ROOT, 'js/shakemap.js'), 'utf8');
const PROD = FIX.products.reduce((b, p) => (!b || +p.preferredWeight > +b.preferredWeight) ? p : b, null);
const U = k => PROD.contents[k].url;

/* the smallest element that behaves the way the legend code uses one */
function el(tag) {
  const node = {
    tag, className: '', innerHTML: '', textContent: '', style: { cssText: '' }, kids: [],
    appendChild(c) { node.kids.push(c); return c; },
    querySelector(sel) { return node.find(sel)[0] || null; },
    querySelectorAll(sel) { return node.find(sel); },
    find(sel) {
      const out = [];
      const want = sel.replace(/^[.[]|[\]]$/g, '');
      for (const k of node.kids) {
        if (sel.startsWith('.') && k.className === want) out.push(k);
        if (sel === 'h4' && k.tag === 'h4') out.push(k);
        out.push(...k.find(sel));
      }
      /* attribute selectors are read off the html this module writes as a string */
      if (sel.startsWith('[')) {
        const attr = want.split('=')[0];
        for (const k of node.kids) if (typeof k.innerHTML === 'string' && k.innerHTML.includes(attr)) out.push(k);
      }
      return out;
    }
  };
  return node;
}

function load(rec) {
  const layers = rec.layers = { sources: {}, styles: {} };
  const host = el('div'), h4 = el('h4');
  h4.textContent = 'PLACEHOLDER';
  host.appendChild(h4);
  rec.host = host; rec.h4 = h4;
  const win = {
    IntMapModules: {},
    IntMapGeoEngine: {
      layers: {
        has: id => Object.prototype.hasOwnProperty.call(layers.styles, id),
        hasSource: id => Object.prototype.hasOwnProperty.call(layers.sources, id),
        addSource: (id, def) => { layers.sources[id] = def; },
        setSourceData: (id, d) => { layers.sources[id].data = d; },
        removeSource: id => { delete layers.sources[id]; },
        add: def => { layers.styles[def.id] = def; },
        remove: id => { delete layers.styles[id]; },
        setPaint: () => { }, getLayout: () => 'visible'
      }
    },
    IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); }, pick: () => ({ arr: a => a[0] }) },
    IntMapSafe: { html: s => String(s) },
    dispatchEvent: () => true,
    CustomEvent: function (n, o) { this.detail = o && o.detail; },
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => { } },
    /* the same signature js/data-layers.js exports, and the same behaviour that
       caused the defect: the heading is written once, by whoever built the box */
    _registerLayerOpacity: () => { rec.registered = (rec.registered || 0) + 1; return host; },
    _hideGenericLegend: () => { rec.hidden = true; }
  };
  globalThis.window = win;
  globalThis.document = {
    createElement: (t) => (t === 'canvas'
      ? { width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => { } }), toDataURL: () => 'data:,' }
      : el(t))
  };
  globalThis.URL = win.URL;
  /* the module reaches for IntMapSafe as a BARE global, the way js/wb-layers.js and the
     rest of the app do — a sandbox that only defines window.IntMapSafe makes mountLegend
     throw into its own catch and write nothing, which is how this harness first read
     'the legend was never mounted'. */
  globalThis.IntMapSafe = win.IntMapSafe;
  globalThis.fetch = async (url) => {
    if (url.indexOf('/detail/') >= 0) return { ok: true, json: async () => ({ properties: { place: 'South Napa', mag: 6, time: 1, products: { shakemap: FIX.products } } }) };
    /* MMI is the fixture's own; every other metric is served the fixture's PGA files,
       because what is being measured here is the legend, not USGS's arithmetic. */
    if (url === U('download/cont_mmi.json')) return { ok: true, json: async () => FIX.contMmi };
    if (url === U('download/coverage_mmi_low_res.covjson')) return { ok: true, json: async () => FIX.covMmi };
    if (/\/cont_[a-z0-9]+\.json$/.test(url)) return { ok: true, json: async () => FIX.contPga };
    if (/coverage_[a-z0-9]+_low_res\.covjson$/.test(url)) {
      const d = FIX.covMmi.domain, k = Object.keys(FIX.pgaParameters)[0];
      return { ok: true, json: async () => ({ type: 'Coverage', domain: { domainType: 'Grid', axes: { x: { start: d.axes.x.start, stop: d.axes.x.stop, num: 2 }, y: { start: d.axes.y.start, stop: d.axes.y.stop, num: 2 } } }, parameters: FIX.pgaParameters, ranges: { [k]: { type: 'NdArray', values: [-0.65, -0.65, -0.65, -0.65] } } }) };
    }
    throw new Error('unstubbed fetch: ' + url);
  };
  new Function('window', SRC)(win);
  return win.IntMapModules.shakeMap({ lang: 'en' });
}

const body = rec => rec.host.kids.filter(k => k.className === 'shk-ctl').map(k => k.innerHTML).join('');

/* ── ① opening a measure draws its legend, whichever door was used ──────────*/
test('R549 ① open() mounts the legend itself, so a metric change never leaves the previous swatches up', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  const mmi = body(rec);
  assert.ok(mmi.length > 100, 'the legend body must have been written');
  assert.ok(mmi.includes('2.5') && mmi.includes('7.5'), 'MMI levels');
  assert.ok(!mmi.includes('pctg'), 'and no PGA units yet');

  /* the door the production defect came through: open(), not show() */
  await M.open('nc72282711', 'pga');
  const pga = body(rec);
  const st = M.state();
  assert.equal(st.metric, 'pga');
  assert.equal(st.units, 'pctg');
  assert.ok(pga.includes('pctg'), 'the legend must now carry PGA\'s units, straight from the contour file');
  assert.ok(pga.includes('0.2') && pga.includes('50'), 'and PGA\'s levels');
  assert.ok(!pga.includes('>7.5<'), 'the previous measure\'s levels must be gone');
  /* the same call also has to say WHY there is no surface for this measure */
  assert.equal(st.painted, false);
  assert.ok(/contour lines only|等値線のみ/.test(pga), 'a measure with no upstream palette says so in the legend');
});

/* ── ② the heading names the measure that is actually drawn ─────────────────*/
test('R549 ② the legend heading is rewritten on every open, not only when the box is created', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  const first = rec.h4.textContent;
  assert.ok(/MMI/.test(first), 'the heading names the open measure: ' + first);
  assert.ok(!/PLACEHOLDER/.test(first), 'and it was actually written');

  for (const m of ['pga', 'pgv', 'psa1p0']) {
    await M.open('nc72282711', m);
    const h = rec.h4.textContent;
    assert.equal(M.state().metric, m);
    assert.ok(h.includes(M.state().metricLabel), 'heading must name ' + m + ' — got: ' + h);
    assert.ok(!/·\s*MMI$/.test(h), 'the heading must not still say MMI while ' + m + ' is drawn');
  }
  /* the box is reused, not rebuilt — the heading is the only thing that has to be rewritten */
  assert.ok(rec.registered >= 4, 'the legend was re-registered on each open');
});
