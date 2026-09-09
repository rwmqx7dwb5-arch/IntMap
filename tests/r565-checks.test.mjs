/* ============================================================================
 *  #R565 — INTERNET HEALTH: the claims this layer makes about the world
 * ----------------------------------------------------------------------------
 *  ⚠ THESE DRIVE THE SHIPPED MODULE, not a copy of its logic. js/net-health-live.js
 *  is imported as the browser imports it, with `window` stubbed and `fetch`
 *  replaced — so a defect that only exists in the file we deploy is reachable
 *  from here (#R505: a check that READS source cannot see evaluation order, and
 *  #R551/R552: a fixture more capable than the real thing proves nothing).
 *
 *  The invariants, and why each one is here rather than somewhere cheaper:
 *   ① a scope the source does not publish must NOT read as "no outages"
 *   ② a source that could not be reached must NOT read as "no outages"
 *   ③ a reading with no usable baseline is refused, not painted as zero
 *   ④ one entity, one colour — the deepest reading wins
 *   ⑤ Natural Earth's «-99» is not a country code
 *   ⑥ a region whose country cannot be established is refused, not guessed
 *   ⑦ the signal roster comes from the data; this file holds no vocabulary
 *   ⑧ a provider in the registry cannot stay uncredited (the #R502 shape)
 *   ⑨ what could not be placed is counted, not silently dropped
 *   ⑩ the eager rows exist at boot and are reachable from the control plane
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the harness: the smallest browser the module will accept ─────────────────────────────── */
function langStub() {
  return {
    pick: () => (en) => en,
    pickArgs: () => (en) => en,
    t: (_lang, en) => en,
    list: () => [],
  };
}
function geoStub() {
  const src = Object.create(null), lyr = Object.create(null);
  return {
    layers: {
      hasSource: (id) => !!src[id], addSource: (id, o) => { src[id] = o; },
      setSourceData: (id, d) => { src[id] = { data: d }; },
      has: (id) => !!lyr[id], add: (o) => { lyr[o.id] = o; },
      setPaint: () => { }, setLayout: () => { }, onClick: () => { },
    },
    popup: () => { },
    _src: src, _lyr: lyr,
  };
}

/* Load the shipped factory once per test with a fresh window. The module is an ES module that
   writes onto `window` at import time, so `window` has to exist BEFORE the import — and the import
   is cached by Node, which is why the factory (not the module) is what each test re-runs. */
let FACTORY = null;
async function factory() {
  if (!FACTORY) {
    globalThis.window = globalThis.window || {};
    window.IntMapModules = window.IntMapModules || {};
    window.IntMapLang = langStub();
    window.document = undefined;
    await import(pathToFileURL(join(ROOT, 'js', 'net-health-live.js')).href);
    FACTORY = window.IntMapModules.netHealthLive;
  }
  return FACTORY;
}

/* Build one live API with a scripted network. `routes` maps a substring of the URL to either a
   value (resolved as JSON) or an Error (thrown), so "the host is down" and "the host answered
   nothing" are two different scripts rather than two readings of one. */
async function api(routes, opts) {
  const f = await factory();
  window.IntMapGeoEngine = geoStub();
  window.countryGeo = (opts && opts.countryGeo) || null;
  window.IntMapAtlasAdmin1 = (opts && opts.admin1) || null;
  window._registerLayerOpacity = null; window._hideGenericLegend = null;
  window.IntMapNetHealth = { label: (id) => id };
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    for (const k of Object.keys(routes)) {
      if (String(url).indexOf(k) >= 0) {
        const v = routes[k];
        if (v instanceof Error) throw v;
        return { ok: true, status: 200, json: async () => v };
      }
    }
    throw new Error('unrouted ' + url);
  };
  const A = f({ lang: 'en', escapeHtml: (s) => String(s) });
  A._seen = seen;
  return A;
}

const alert1 = (over) => Object.assign({
  datasource: 'ping-slash24', level: 'critical', time: 1788868200, value: 6093, historyValue: 7643,
  method: 'median', entity: { code: 'TN', name: 'Tunisia', type: 'country', attrs: { fqid: 'geo.netacuity.AF.TN', country_code: 'TN' } },
}, over || {});

/* ── ① a scope the source does not publish is not an all-clear ───────────────────────────────
   MEASURED on the live service: `entityType=nonsense` answers 200 / error:null / data:[] — the
   same three fields a calm planet answers with. If the roster guard is removed, THIS is what a
   reader sees: an empty map that means "we asked something meaningless". */
test('① an unpublished scope is reported as unsupported, not as calm', async () => {
  const A = await api({ '/entities/query': { error: null, data: [] }, '/outages/alerts': { error: null, data: [] } });
  const r = await A.report({ scope: 'country' });
  assert.equal(r.scope_supported, false, 'an empty roster was read as a supported scope');
  assert.equal(r.observations.length, 0);
  const src = r.sources.find((s) => s.id === 'ioda');
  assert.equal(src.last.ok, false, 'the provider claims success for a question it could not ask');
  assert.equal(src.last.why, 'unsupported_scope');
});

test('① …and a supported scope with nothing happening says exactly that', async () => {
  const A = await api({ '/entities/query': { error: null, data: [{ code: 'TN' }] }, '/outages/alerts': { error: null, data: [] } });
  const r = await A.report({ scope: 'country' });
  assert.equal(r.scope_supported, true, 'a real roster was read as unsupported');
  assert.equal(r.observations.length, 0);
  assert.equal(r.sources.find((s) => s.id === 'ioda').last.ok, true);
  /* ⚠ the two states above must be DISTINGUISHABLE — that is the whole point of the guard */
});

test('① …and a scope nobody recognises is asked about, not silently replaced', async () => {
  /* MEASURED in the browser: report({scope:'planet'}) used to answer with COUNTRY rows and
     scope_supported:true, because anything that was not 'region' was coerced to 'country'. */
  const A = await api({ '/entities/query': { error: null, data: [] }, '/outages/alerts': { error: null, data: [] } });
  const r = await A.report({ scope: 'planet' });
  assert.equal(r.scope, 'planet', 'the scope that was asked for was replaced by another one');
  assert.equal(r.scope_supported, false, 'an unknown scope was reported as supported');
  assert.equal(A._seen.some((u) => u.includes('entityType=planet')), true, 'the scope was never asked about');
});

/* ── ② a host that did not answer is not an all-clear ─────────────────────────────────────── */
test('② an unreachable source is recorded as unreachable', async () => {
  const A = await api({ '/entities/query': { error: null, data: [{ code: 'TN' }] }, '/outages/alerts': new Error('offline') });
  const r = await A.report({ scope: 'country' });
  const src = r.sources.find((s) => s.id === 'ioda');
  assert.equal(src.last.ok, false);
  assert.equal(src.last.why, 'unreachable');
  assert.equal(r.observations.length, 0, 'an unreachable host produced observations');
});

/* ── ③ a reading with no usable baseline is refused ───────────────────────────────────────────
   `1 - value/base` with base 0 is Infinity and with a missing value is NaN. Either one, handed to
   the colour ramp, paints the LIGHT end — i.e. "barely anything wrong" — for a reading nobody
   could interpret. Refusing it keeps the entity off the map instead. */
test('③ deficit refuses what it cannot compute, rather than returning a number', async () => {
  const A = await api({});
  assert.equal(A._deficit(6093, 7643) > 0.2, true);
  assert.equal(Math.abs(A._deficit(6093, 7643) - (1 - 6093 / 7643)) < 1e-12, true);
  for (const [v, b] of [[5, 0], [5, null], [null, 10], ['', 10], [undefined, undefined], [5, -3], [5, 'x']]) {
    assert.equal(A._deficit(v, b), null, `deficit(${v}, ${b}) produced a value`);
  }
  assert.equal(A._deficit(20, 10), 0, 'a reading ABOVE normal is a zero deficit, not a negative one');
  assert.equal(A._deficit(0, 10), 1, 'a total loss is the top of the scale');
});

/* ── ④ one entity, one colour ─────────────────────────────────────────────────────────────── */
test('④ several instruments on one entity collapse to the deepest reading', async () => {
  const A = await api({});
  const w = A._worstBy([
    { code: 'TN', deficit: 0.2 }, { code: 'TN', deficit: 0.8 }, { code: 'TN', deficit: 0.5 },
    { code: 'IQ', deficit: null }, { code: '', deficit: 0.9 },
  ], (o) => o.code);
  assert.equal(w.TN.deficit, 0.8, 'the map would have drawn a shallower reading over a deeper one');
  assert.equal('IQ' in w, false, 'a reading with no deficit reached the map');
  assert.equal('' in w, false, 'an entity with no code reached the map');
});

/* ── ⑤ Natural Earth's «-99» is not a country code ────────────────────────────────────────── */
test('⑤ the ISO ladder refuses the no-code sentinel', async () => {
  const A = await api({});
  assert.equal(A._iso2({ ISO_A2_EH: 'TN', ISO_A2: 'XX' }), 'TN');
  assert.equal(A._iso2({ ISO_A2_EH: '-99', ISO_A2: 'FR' }), 'FR', 'the ladder did not fall through -99');
  assert.equal(A._iso2({ ISO_A2_EH: '-99', ISO_A2: '-99' }), '', '«-99» was accepted as a country');
  assert.equal(A._iso2({}), '');
  assert.equal(A._iso2(null), '');
});

/* ── ⑥ a country that cannot be established is refused ────────────────────────────────────── */
test('⑥ the country of an entity is read, and refused when unreadable', async () => {
  const A = await api({});
  assert.equal(A._cc({ attrs: { country_code: 'tn', fqid: 'geo.netacuity.EU.FR.9' } }), 'TN',
    'the entity said TN and the identifier said FR — the entity wins');
  assert.equal(A._cc({ attrs: { fqid: 'geo.netacuity.AS.AF.2' } }), 'AF');
  assert.equal(A._cc({ attrs: { fqid: 'something.else' } }), '', 'a shape it cannot read produced a country anyway');
  assert.equal(A._cc({ attrs: {} }), '');
  assert.equal(A._cc(null), '');
});

/* ── ⑦ the signal roster is discovered, not listed ─────────────────────────────────────────── */
test('⑦ a signal nobody has ever heard of still appears in the roster', async () => {
  const A = await api({
    '/entities/query': { error: null, data: [{ code: 'TN' }] },
    '/outages/alerts': { error: null, data: [alert1({ datasource: 'quantum-tea-leaves' }), alert1()] },
  });
  const r = await A.report({ scope: 'country' });
  assert.deepEqual(r.signals, ['ping-slash24', 'quantum-tea-leaves'],
    'the roster was filtered against something this file knows');
});

test('⑦ …and the module carries no vocabulary of its own', () => {
  /* The instrument names are the SOURCE's words. If any of them is spelled in this file, then the
     file has an opinion about which instruments exist — and the one added upstream next month is
     the one that disappears. (Comments are prose ABOUT the source and are excluded, which is why
     this reads the code only.) */
  const src = read('js/net-health-live.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const word of ['ping-slash24', 'merit-nt', 'gtr', 'upstream-delay', 'mozilla', 'bgp']) {
    assert.equal(src.includes(word), false, `js/net-health-live.js spells the instrument «${word}»`);
  }
});

/* ── ⑦b the two sentences the reader actually reads are never silently empty ──────────────────
   MEASURED IN THE BROWSER, on the built app: both of these came out EMPTY for a whole build.
   They were assembled with `IntMapLang.pickArgs()`, which returns a NAME TABLE (an array) rather
   than a resolved string, so `.replace()` threw — and because each was the LAST statement of the
   block that wrote it, the legend rendered normally with its coverage line missing. Nothing in
   the suite could see it, because the suite was asking about state and not about what is said. */
test('⑦b the legend always says something about coverage, in every state', async () => {
  const A = await api({ '/entities/query': { error: null, data: [{ code: 'TN' }] }, '/outages/alerts': { error: null, data: [alert1()] } });
  await A.report({ scope: 'country' });   /* marks the provider reachable */
  const A2 = await api({ '/entities/query': { error: null, data: [{ code: 'TN' }] }, '/outages/alerts': new Error('down'), 'atlas.ripe.net': new Error('down') });
  await A2.report({ scope: 'country' });
  const unreachable = A2._coverageLine();
  assert.equal(typeof unreachable, 'string');
  assert.ok(unreachable.length > 10, 'an unreachable source produced no sentence at all');
  /* and the probe line, which had the identical defect. It says nothing while the layer is off —
     that is correct — so the layer is switched on first, against a host that does not answer. */
  assert.equal(A2._probeLine(), '', 'a layer nobody switched on volunteered a sentence');
  await A2.toggle('netreach', true);
  assert.equal(typeof A2._probeLine(), 'string');
  assert.ok(A2._probeLine().length > 10, 'the probe legend produced no sentence for an unreachable source');
  /* ⚠ and switch it off again: with no js/runtime.js wheel in a node process, everyTick() arms a
     REAL interval (js/runtime.js says so — it refuses to be a silent no-op), which would hold this
     process open for ever. Turning the layer off is what the reader would do, and it releases it. */
  await A2.toggle('netreach', false);
});
/* ── ⑦c a layer that could not be drawn never reports that it was ────────────────────────────
   MEASURED IN THE BROWSER on the built app: `state().painted` said 5 while
   `GE().layers.has('nh-fill')` was false and the map was empty. The paint block called a method the
   engine does not have (`layers.onClick`), threw on the way past it, and `S.painted = feats.length`
   sat AFTER the try — so the count was the INTENTION, not the outcome. A layer whose instrument
   cannot tell "drawn" from "attempted" is a layer that can die without anything going red. */
test('⑦c painted counts what the map holds, not what was handed to it', async () => {
  const A = await api({});
  const good = [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { code: 'TN', v: 0.4 } }];
  A._paintOutages(good);
  assert.equal(A.state().painted, 1, 'a successful paint was not counted');
  assert.equal(A.state().paintError, '', 'a successful paint reported an error');

  /* now an engine that refuses, the way the shipped one refused */
  const broken = geoStub();
  broken.layers.add = () => { throw new TypeError('GE.layers.onClick is not a function'); };
  broken.layers.has = () => false;
  window.IntMapGeoEngine = broken;
  const B = await api({});
  window.IntMapGeoEngine = broken;
  B._paintOutages(good);
  assert.equal(B.state().painted, 0, 'a layer that was never created reported shapes drawn');
  assert.ok(B.state().paintError.length > 0, 'the failure left no trace anyone could read');
  assert.ok(B._coverageLine().length > 10, 'the reader was told nothing about a map that could not draw');
});

/* ── ⑧ a provider in the registry cannot stay uncredited ──────────────────────────────────────
   ⚠ THE #R502 SHAPE. Two third parties were contacted for rounds with neither of them named in the
   list that was supposed to name every third party — because "a list cannot fail to contain what
   was never added to it". The fix there, and here, is to derive the question from the REGISTRY
   rather than from a second list: every provider this file will actually talk to must be named in
   the privacy paragraph and credited in the source registry, in all nine languages. */
test('⑧ every provider is named in the privacy text and credited in the registry', async () => {
  const A = await api({});
  const provs = A.providers();
  assert.ok(provs.length >= 3, 'the provider registry shrank');

  const legal = read('js/legal-text.js');
  for (const p of provs) {
    assert.ok(legal.includes(p.host), `js/legal-text.js §4 does not name the host ${p.host}`);
  }

  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/reference-data.js'), ctx, { filename: 'reference-data' });
  const names = ctx.window.IntMapRefData.dataSources.map((s) => s.n);
  const codes = readdirSync(join(ROOT, 'js', 'locales'))
    .filter((f) => /^pages\.[a-z]{2}(-[a-z]+)?\.js$/.test(f));
  for (const c of codes) vm.runInContext(read('js/locales/' + c), ctx, { filename: c });
  for (const p of provs) {
    assert.ok(names.includes(p.name), `js/reference-data.js does not credit ${p.name}`);
  }
  /* and the licence a provider declares is a fact about that provider, not decoration */
  for (const p of provs) assert.ok(p.licence && p.licence.length > 8, `${p.id} declares no licence`);
});

test('⑧ …and nothing is fetched from a host the registry does not declare', async () => {
  const A = await api({
    '/entities/query': { error: null, data: [{ code: 'TN' }] },
    '/outages/alerts': { error: null, data: [alert1()] },
    'stat.ripe.net': { data: { stats: [{ asns_ris: 5, v4_prefixes_ris: 9, v6_prefixes_ris: 1, stats_date: '2026-09-08T00:00:00' }] } },
  });
  await A.report({ scope: 'country', country: 'TN' });
  const hosts = A.providers().map((p) => p.host);
  for (const url of A._seen) {
    const h = new URL(url).host;
    assert.ok(hosts.includes(h), `the module contacted ${h}, which no provider entry declares`);
  }
  /* ⚠ THE HOST, NOT A SUBSTRING OF THE URL. `u.includes('stat.ripe.net')` is true of
     `https://evil.example/?x=stat.ripe.net` as well, so it is not a question about who was
     contacted — CodeQL calls this out as incomplete URL sanitisation and it is right: the parsed
     host is the only thing that answers it, which is what the loop above already asks. */
  const routing = A.providers().find((p) => p.yields.indexOf('routing') >= 0);
  assert.ok(routing, 'no provider in the registry claims to answer about routing');
  assert.ok(A._seen.some((u) => new URL(u).host === routing.host), 'the routing detail was never asked for');
});

/* ── ⑨ what could not be placed is counted ────────────────────────────────────────────────── */
test('⑨ an entity with no polygon is counted as unplaced, not dropped', async () => {
  const A = await api({});
  const geo = { features: [
    { properties: { ISO_A2_EH: 'TN' }, geometry: { type: 'Polygon', coordinates: [] } },
    { properties: { ISO_A2_EH: '-99', ISO_A2: '-99' }, geometry: { type: 'Polygon', coordinates: [] } },
  ] };
  window.countryGeo = geo;
  const g = A._geomForCountries([
    { cc: 'TN', code: 'TN', name: 'Tunisia', deficit: 0.4, datasource: 'x', level: 'critical' },
    { cc: 'ZZ', code: 'ZZ', name: 'Nowhere', deficit: 0.9, datasource: 'x', level: 'critical' },
  ]);
  assert.equal(g.feats.length, 1, 'a country with no polygon was drawn anyway');
  assert.equal(g.feats[0].properties.code, 'TN');
  assert.equal(g.missed, 1, 'the country that could not be placed was not counted');
  window.countryGeo = null;
  const g2 = A._geomForCountries([{ cc: 'TN', code: 'TN', name: 'Tunisia', deficit: 0.4 }]);
  assert.equal(g2.missed, 1, 'with no geometry at all, nothing was reported as unplaced');
});

/* ── ⑩ the rows exist at boot, and the control plane can reach them ──────────────────────────
   The row file is EAGER on purpose (a row that appears only after you have found the layer you
   cannot see is not a row). This evaluates it the way the app does and asks what it registered. */
test('⑩ the eager rows build themselves and register control-plane commands', () => {
  const rows = [], cmds = [];
  const el = () => {
    const e = { style: {}, dataset: {}, classList: { toggle: () => { }, remove: () => { }, add: () => { } },
      children: [], appendChild(c) { this.children.push(c); }, addEventListener: () => { },
      querySelector: () => el(), querySelectorAll: () => [], closest: () => el(), set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; } };
    return e;
  };
  const dd = el();
  const ctx = { console, setTimeout: (f) => f(), clearInterval: () => { }, setInterval: () => 0 };
  ctx.window = ctx; vm.createContext(ctx);
  ctx.IntMapLang = ctx.window.IntMapLang = langStub();
  ctx.IntMapOS = ctx.window.IntMapOS = { register: (id, fn, meta) => cmds.push({ id, meta }) };
  ctx.window.IntMapLazy = { need: () => Promise.resolve(false) };
  ctx.document = ctx.window.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'layer-dropdown' ? dd : null),
    createElement: () => { const e = el(); rows.push(e); return e; },
    addEventListener: () => { },
  };
  ctx.window.addEventListener = () => { };
  vm.runInContext(read('js/net-health.js'), ctx, { filename: 'net-health' });
  const API = ctx.window.IntMapModules.netHealth({ lang: 'en' });
  const ids = API.rows();
  assert.ok(ids.length >= 2, 'the row file registers fewer than two rows');
  for (const id of ids) {
    assert.ok(API.label(id) && API.label(id) !== id, `row ${id} has no name`);
    assert.ok(cmds.some((c) => c.id === id + '.toggle'), `row ${id} is not reachable from the control plane`);
  }
  /* ⚠ AND THE READING IS ITS OWN COMMAND. Switching a layer on is not an answer to 「イランの
     インターネットは落ちているか」, so there is a command that reports without redrawing. */
  assert.ok(cmds.some((c) => c.id === 'nethlth.report'), 'there is no way to ASK, only to switch on');
  /* the facade answers before the body exists — that is what lets a caller ask for free */
  assert.equal(API.isOn(ids[0]), false);
  assert.equal(API.state().loaded, false);
  /* ⚠ the arrays come out of the vm realm, so identity of Array.prototype is not the question here */
  assert.equal(API.signals().length, 0);

  /* every row this file declares is claimed by exactly one shelf in the Layers panel, so none of
     them is swept into «Others (beta)» by accident (js/data-layers.js:93) */
  const groups = read('js/data-layers.js');
  for (const id of ids) {
    const hits = (groups.match(new RegExp("'" + id + "'", 'g')) || []).length;
    assert.ok(hits >= 1, `row ${id} is in no group list — it would fall into Others (beta)`);
  }
});
