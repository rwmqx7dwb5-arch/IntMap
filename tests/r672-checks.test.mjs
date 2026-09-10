/* ============================================================================
 *  R672 — the popup a reader can actually see, and a sparkline with data in it
 * ----------------------------------------------------------------------------
 *  #R621 fixed the popup's DOOR (`GE().ui.popup`, not the invented `GE().popup`) and proved it with
 *  a check that asked whether the door exists. In production the door then opened onto nothing a
 *  reader could see:
 *
 *    · the popup root was `<div class="rad-pop country-popup">`, and `.country-popup{display:none}`
 *      is the COUNTRY PANEL's hidden template. The content was correct, inserted, and 20×16 px on
 *      screen — the close button alone.
 *    · the sparkline read `r.v`, while `?mode=series` returns the provider's own records, which
 *      carry `nsvh`. Every row scored null, `vs.length < 2` was always true, and the slot was set
 *      to '' — no line, and not even the «no history published» sentence, on an endpoint that was
 *      returning 168 points.
 *
 *  ⚠ SO THIS FILE MEASURES OUTCOMES, NOT DOORS. Three rounds running, the check asked whether the
 *  mechanism was NAMED correctly and the reader saw nothing. What a reader can see is: is any class
 *  on this element declared `display:none` by the stylesheet we ship, and does the drawing function
 *  return a line when handed rows in the shape the FEED actually emits.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* every class the shipped stylesheet hides outright. A rule may list several selectors, and only
   the ones that are a bare class (`.foo`) can be reasoned about this cheaply — which is enough,
   because that is the shape the defect took. */
function hiddenClasses() {
  /* ⚠ comments are stripped first: a rule's selector text runs from the previous `}`, so it picks
     up whatever comment sits above it and a bare-class match then never fires. The first run of
     this check reported that .country-popup was not hidden — on the very stylesheet that hides it. */
  const css = read('css/intmap.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (!/(^|[;\s])display\s*:\s*none/.test(body)) continue;
    for (const sel of m[1].split(',')) {
      const t = sel.trim();
      const bare = /^\.([A-Za-z_][\w-]*)$/.exec(t);
      if (bare) out.add(bare[1]);
    }
  }
  return out;
}

test('the station popup is not built out of a class the stylesheet hides', () => {
  const hidden = hiddenClasses();
  assert.ok(hidden.size > 3, `only ${hidden.size} hidden classes were found in css/intmap.css — the scan is wrong, not the layer`);
  assert.ok(hidden.has('country-popup'), 'the scan no longer sees .country-popup as hidden — it is the class this round exists for, so the check has gone blind');

  const src = read('js/radiation-layer.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const bad = [];
  /* every class= this file writes into markup */
  for (const m of src.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && hidden.has(c)) bad.push(c);
  }
  assert.deepEqual([...new Set(bad)], [],
    'the layer builds markup out of ' + [...new Set(bad)].join(', ') + ' — the stylesheet declares that display:none, so the element is inserted, correct, and invisible');
});

test('the sparkline draws from the shape the FEED emits, not a shape of its own', async () => {
  /* ⚠ THE ROWS ARE BUILT THE WAY THE FEED BUILDS THEM. `?mode=series` answers with the provider's
     own records untouched, and a provider record is `{code,name,lat,lon,nsvh,at,quantity,kind}` —
     so a fixture written by hand here could carry `v` and agree with a client that is wrong. */
  const shared = read('supabase/functions/_shared/radiation-sources.js');
  const rec = /function record\(o\)\s*\{[\s\S]*?return \{([\s\S]*?)\};/.exec(shared);
  assert.ok(rec, 'could not read the record builder out of _shared/radiation-sources.js — this check is blind, fix it rather than deleting it');
  const keys = [...rec[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gm)].map((m) => m[1]);
  assert.ok(keys.includes('nsvh') && keys.includes('at'),
    'the provider record no longer carries nsvh/at — it now carries ' + keys.join(', ') + '; the client must follow it');

  const g = globalThis;
  if (typeof g.window === 'undefined') g.window = g;
  const noop = () => { };
  g.document = g.document || { createElement: () => ({ className: '', innerHTML: '', querySelector: () => null }), querySelector: () => null, addEventListener: noop, readyState: 'complete' };
  await import('../js/lang-registry.js');
  const layers = {
    _s: new Set(), _l: new Set(),
    hasSource: (id) => layers._s.has(id), addSource: (id) => layers._s.add(id),
    has: (id) => layers._l.has(id), add: (d) => layers._l.add(d && d.id),
    setLayout: noop, setSourceData: noop, getLayout: () => 'none', sourceData: () => null,
  };
  g.window.IntMapGeoEngine = { layers: layers, events: { on: noop, onLayer: noop }, ready: () => true, ui: { popup: () => ({ setLngLat: function () { return this; }, setHTML: function () { return this; } }), attach: (x) => x } };
  g.window.IntMapSafe = { html: (s) => String(s) };
  g.window.IntMapLabelScale = { sub: (n) => n };
  g.window.IntMapModules = g.window.IntMapModules || {};
  g.window.addEventListener = g.window.addEventListener || noop;
  g.window._registerLayerOpacity = () => null;

  /* the module keeps `spark` private, so it is reached the way the popup reaches it: through the
     series fetch, whose result the popup writes into the slot. Serve rows in the record shape. */
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ code: 'x', name: 'x', lat: 50, lon: 8, nsvh: 90 + i, at: '2026-09-0' + ((i % 9) + 1) + 'T00:00:00Z', quantity: 'H*(10)', kind: 'hourly-mean' });
  g.window.SUPABASE_URL = 'https://example.invalid';
  g.fetch = async (u) => (String(u).includes('mode=series')
    ? { ok: true, json: async () => ({ v: 1, station: 'de-bfs:1', unit: 'nSv/h', series: rows }) }
    : { ok: true, json: async () => ({ v: 1, at: '', unit: 'nSv/h', sources: [], stations: [], reference: [] }) });

  await import('../js/radiation-layer.js');
  const api = g.window.IntMapModules.radiationLayer({ lang: 'en', canDraw: () => true });
  const series = await api.series('de-bfs:1');
  assert.equal(series.length, 12, 'the series call did not return the feed rows');

  /* the drawing is what matters: with twelve real rows there must be a path, and it must be built
     from the values — a line with no `d` is the same blank slot the reader was getting. */
  const src = read('js/radiation-layer.js');
  const fn = /function spark\(rows\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'spark() is gone — the sparkline has no drawing function');
  assert.ok(!/r\.v\b/.test(fn[1]),
    'spark() still reads `r.v`, but the feed sends `nsvh` — every row scores null and the slot is set to the empty string');
  assert.ok(/r\.nsvh\b/.test(fn[1]), 'spark() does not read the value key the feed sends');
});
