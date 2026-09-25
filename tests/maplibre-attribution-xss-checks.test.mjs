/* ============================================================================
 *  MapLibre's attribution control is never switched on; IntMap draws the credit.
 * ----------------------------------------------------------------------------
 *  GHSA-jrc7-96c5-q579 (critical): the pinned maplibre-gl's `DOM.sanitize()` removes attributes
 *  while iterating a LIVE NamedNodeMap, so every second attribute survives. Its only caller is the
 *  AttributionControl, which does `innerHTML = DOM.sanitize(attribHTML)` with the `attribution`
 *  of every source in use — strings that arrive inside remote TileJSON / style documents. The fix
 *  exists only from 6.4.1, so the sink is closed at the engine: js/geo-engine.js `_newMap` is the
 *  one constructor, forces `attributionControl:false`, and mounts IntMap's own credit instead.
 *
 *  ① EVALUATED, not read: the real engine is imported with a recording renderer stub, and every
 *     way a caller can ask for the renderer's control still reaches the renderer as `false`.
 *     The scan beside it is an AST walk for the two ways round the engine (another `new ….Map`,
 *     or naming `AttributionControl` at all) over js/, src/ and the served pages.
 *  ② The two views that used the renderer's credit (compare, the guessing game) ask for a credit,
 *     and the credit the engine mounts names what is drawn — CARTO's text, taken from
 *     js/carto-basemap.js by evaluating it — and follows a base switch.
 *  ③ Hostile attributions reach the credit writer through the real engine and produce no element
 *     but the credit box and http(s) links; innerHTML is never touched (the fake DOM throws).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (p) => relative(ROOT, p).split('\\').join('/');

/* ── a DOM that records what is built and refuses markup ───────────────────────────────────── */
function fakeDoc() {
  const doc = { created: [], markupWrites: [] };
  const text = (t) => ({ nodeType: 3, data: String(t), parentNode: null, get textContent() { return this.data; } });
  doc.createTextNode = text;
  doc.createElement = (tag) => {
    const el = {
      nodeType: 1, tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], parentNode: null,
      style: { cssText: '' }, className: '', hidden: false,
      get firstChild() { return this.children[0] || null; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      get textContent() { return this.children.map((c) => c.textContent).join(''); },
      set textContent(v) { this.children = [text(v)]; },
    };
    for (const k of ['innerHTML', 'outerHTML']) {
      Object.defineProperty(el, k, {
        get() { throw new Error(k + ' read'); },
        set(v) { doc.markupWrites.push(v); throw new Error(k + ' written'); },
      });
    }
    el.insertAdjacentHTML = (_, v) => { doc.markupWrites.push(v); throw new Error('insertAdjacentHTML'); };
    doc.created.push(el);
    return el;
  };
  return doc;
}

/* ── the renderer, as a recording stub that answers the public style API from `o.style` ────── */
const constructed = [];
function FakeMap(o) {
  constructed.push(o);
  const style = (o && typeof o.style === 'object' && o.style) || { sources: {}, layers: [] };
  const layers = (style.layers || []).map((l) => ({ ...l, layout: { ...(l.layout || {}) } }));
  const handlers = {};
  this.host = (o && o.container && typeof o.container === 'object') ? o.container : null;
  this.on = (ev, f) => { (handlers[ev] = handlers[ev] || []).push(f); return this; };
  this.fire = (ev) => (handlers[ev] || []).forEach((f) => f({ type: ev }));
  this.getContainer = () => this.host;
  this.getZoom = () => 2;
  this.getLayersOrder = () => layers.map((l) => l.id);
  this.getLayer = (id) => layers.find((l) => l.id === id);
  this.getLayoutProperty = (id, k) => (this.getLayer(id) || { layout: {} }).layout[k];
  this.setLayoutProperty = (id, k, v) => { this.getLayer(id).layout[k] = v; };
  this.getSource = (id) => (style.sources || {})[id];
  this.getTerrain = () => null;
  this.removed = false;
  this.remove = () => { this.removed = true; };
}
globalThis.window = globalThis;
globalThis.maplibregl = { Map: FakeMap };
await import(pathToFileURL(join(ROOT, 'js', 'geo-engine.js')).href);
const GE = globalThis.window.IntMapGeoEngine;
const settle = () => new Promise((r) => setTimeout(r, 5));

function newHost() {
  const doc = fakeDoc();
  const host = doc.createElement('div');
  doc.created.length = 0;           /* the host is the page's, not the credit's */
  return { doc, host };
}
const creditOf = (host) => host.children.find((c) => c.className === 'map-credit-view') || null;

test('① every way of asking for the renderer credit reaches the renderer as false', () => {
  const asks = [
    {}, { attributionControl: true }, { attributionControl: { compact: true } },
    { attributionControl: { customAttribution: '<img src=x onerror=alert(1)>' } },
    { customAttribution: '<img src=x onerror=alert(1)>' }, { customAttribution: ['a', 'b'] },
    { credit: true }, { attributionControl: false },
  ];
  for (const ask of asks) {
    for (const entry of ['createView', 'createSubView']) {
      const { host } = newHost();
      constructed.length = 0;
      const v = GE.ui[entry]({ container: host, ...ask });
      assert.ok(v, `${entry} built a view`);
      assert.equal(constructed.length, 1);
      const got = constructed[0];
      assert.equal(got.attributionControl, false, `${entry}(${JSON.stringify(ask)}) reached the renderer with attributionControl=${JSON.stringify(got.attributionControl)}`);
      assert.ok(!('customAttribution' in got), `${entry} passed customAttribution through`);
      assert.ok(!('credit' in got), `${entry} passed IntMap's own option to the renderer`);
    }
  }
});

/* every js/ and src/ file, parsed — the scan is over syntax, so prose and strings do not count */
function jsUnder(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...jsUnder(p));
    else if (/\.(m?js)$/.test(n)) out.push(p);
  }
  return out;
}
test('① no other constructor and no AttributionControl anywhere the site loads', () => {
  const ctors = [], named = [], unparsed = [];
  for (const f of [...jsUnder(join(ROOT, 'js')), ...jsUnder(join(ROOT, 'src'))]) {
    const src = readFileSync(f, 'utf8');
    let ast = null;
    for (const sourceType of ['module', 'script']) {
      try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true }); break; } catch (_) {}
    }
    if (!ast) { unparsed.push(rel(f)); continue; }
    walk.full(ast, (n) => {
      if (n.type === 'NewExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'Map') ctors.push(rel(f) + ':' + src.slice(0, n.start).split('\n').length);
      if ((n.type === 'Identifier' && n.name === 'AttributionControl') ||
          (n.type === 'Literal' && n.value === 'AttributionControl')) named.push(rel(f));
    });
  }
  assert.deepEqual(unparsed, [], 'every js/ and src/ file parses, so none escapes the scan');
  assert.equal(ctors.length, 1, 'exactly one `new <ns>.Map(` in js/ and src/: ' + ctors.join(', '));
  assert.match(ctors[0], /^js\/geo-engine\.js:/);
  const ge = rd('js/geo-engine.js');
  const at = Number(ctors[0].split(':')[1]);
  const newMapAt = ge.split('\n').findIndex((l) => /function _newMap\(/.test(l)) + 1;
  assert.ok(newMapAt > 0 && at > newMapAt && at < newMapAt + 6, 'the one constructor is the one inside _newMap');
  assert.deepEqual(named, [], 'nothing names the renderer AttributionControl');
  for (const page of readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    assert.doesNotMatch(rd(page), /AttributionControl|maplibregl\s*\.\s*Map\s*\(/, page + ' builds a map or a renderer credit outside the engine');
  }
});

/* the options object each named file hands to ui.createSubView */
function subViewOptions(file) {
  const ast = acorn.parse(rd(file), { ecmaVersion: 'latest', sourceType: 'module' });
  const found = [];
  walk.full(ast, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'createSubView' && n.arguments[0]?.type === 'ObjectExpression') found.push(n.arguments[0]);
  });
  return found;
}
test('② compare and the guessing game ask for a credit', () => {
  for (const f of ['js/compare.js', 'js/playground.js']) {
    const opts = subViewOptions(f);
    assert.ok(opts.length >= 1, f + ' builds a sub-view');
    for (const o of opts) {
      const p = o.properties.find((x) => (x.key?.name || x.key?.value) === 'credit');
      assert.ok(p && p.value.type === 'Literal' && p.value.value === true, f + ' asks the engine for a credit (credit:true)');
    }
  }
});

test('② the credit names what is drawn, follows a base switch, and goes with the view', async () => {
  const sandbox = { window: {}, document: { readyState: 'complete', getElementById: () => null } };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(rd('js/carto-basemap.js'), sandbox, { filename: 'carto-basemap.js' });
  const CARTO = sandbox.window.CARTO_ATTRIBUTION;
  assert.ok(typeof CARTO === 'string' && /CARTO/.test(CARTO) && /OpenStreetMap/.test(CARTO));

  const { host } = newHost();
  constructed.length = 0;
  const v = GE.ui.createSubView({
    container: host, credit: true,
    style: { version: 8, sources: { c: { type: 'raster', attribution: CARTO }, s: { type: 'raster', attribution: '\u00a9 Esri' } },
      layers: [{ id: 'c', type: 'raster', source: 'c' }, { id: 's', type: 'raster', source: 's', layout: { visibility: 'none' } }] },
  });
  await settle();
  const el = creditOf(host);
  assert.ok(el, 'a credit element is mounted in the view');
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, CARTO);

  const mm = v.raw();
  mm.setLayoutProperty('c', 'visibility', 'none'); mm.setLayoutProperty('s', 'visibility', 'visible'); mm.fire('styledata');
  await settle();
  assert.equal(el.textContent, '\u00a9 Esri', 'switching the base switches the credit');
  mm.setLayoutProperty('s', 'visibility', 'none'); mm.fire('sourcedata');
  await settle();
  assert.equal(el.hidden, true, 'nothing drawn, nothing credited');

  v.destroy();
  assert.equal(creditOf(host), null, 'destroy takes the credit with it');

  const bare = newHost();
  GE.ui.createSubView({ container: bare.host, attributionControl: false, style: { version: 8, sources: { c: { type: 'raster', attribution: CARTO } }, layers: [{ id: 'c', type: 'raster', source: 'c' }] } });
  await settle();
  assert.equal(creditOf(bare.host), null, 'a view that did not ask gets none');
});

test('③ a hostile attribution builds no element but the credit box and http(s) links', async () => {
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '<img src=x a=1 onerror=alert(1) b=2 onload=alert(2) c=3>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" JaVaScRiPt:alert(1)">y</a>',
    '<a href="data:text/html,<script>alert(1)</script>">z</a>',
    '<svg onload=alert(1)><a href="https://example.com/">in-svg</a></svg>',
    '<script>alert(1)</script>',
    '<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>',
    '<a href="https://www.openstreetmap.org/copyright" onclick="alert(1)" style="x">&copy; OpenStreetMap</a>',
    '"><img src=x onerror=alert(1)>',
    '<a href=\'https://carto.com/attributions\' onmouseover=alert(1)>CARTO</a> & <b onclick=alert(1)>bold</b> 1 < 2',
  ];
  const { doc, host } = newHost();
  const sources = {}, layers = [];
  hostile.forEach((a, i) => { sources['s' + i] = { type: 'raster', attribution: a }; layers.push({ id: 'l' + i, type: 'raster', source: 's' + i }); });
  GE.ui.createSubView({ container: host, attributionControl: { compact: true }, customAttribution: '<img src=y onerror=alert(3)>', style: { version: 8, sources, layers } });
  await settle();
  const el = creditOf(host);
  assert.ok(el, 'the credit is drawn');
  assert.deepEqual(doc.markupWrites, [], 'no markup was ever handed to the DOM');
  const tags = doc.created.map((e) => e.tagName);
  assert.deepEqual([...new Set(tags)].sort(), ['A', 'DIV']);
  assert.equal(tags.filter((t) => t === 'DIV').length, 1, 'the only DIV is the credit box');
  const links = doc.created.filter((e) => e.tagName === 'A');
  for (const a of links) {
    assert.match(a.href, /^https?:\/\//, 'a credit link is http(s): ' + a.href);
    assert.equal(a.rel, 'noopener noreferrer');
    assert.deepEqual(Object.keys(a).filter((k) => /^on/i.test(k)), [], 'no handler property on a credit link');
  }
  assert.deepEqual(links.map((a) => a.href).sort(),
    ['https://carto.com/attributions', 'https://www.openstreetmap.org/copyright'].sort(),
    'only the two genuine links survive, and nothing inside <svg> is promoted to a link');
  const osm = links.find((a) => /openstreetmap/.test(a.href));
  assert.equal(osm.textContent, '\u00a9 OpenStreetMap', 'entities decode to text');
  assert.doesNotMatch(el.textContent, /alert\(1\)<\/script>|onerror/, 'no tag or handler source leaks into the text');
  assert.match(el.textContent, /CARTO & bold 1 < 2/, 'ordinary text survives as text');
});
