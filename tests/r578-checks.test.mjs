/* ============================================================================
 *  R578 — measured radiation: the checks that keep the layer honest
 * ----------------------------------------------------------------------------
 *  ⚠ THESE RUN THE SHIPPED MODULE, they do not read it. #R505 cost a production outage because a
 *  check that PARSES a file cannot see evaluation order, and #R552 cost another because a fixture
 *  more capable than the real thing hides a wiring fault. So the factory below is evaluated with
 *  the thinnest stubs that let it run, and the assertions ask the object it returns.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── evaluate js/radiation-layer.js the way the browser does ──────────────────────────────── */
async function mountLayer() {
  const g = globalThis;
  if (typeof g.window === 'undefined') g.window = g;
  const noop = () => { };
  const layers = {
    _s: new Set(), _l: new Set(),
    hasSource: (id) => layers._s.has(id), addSource: (id) => layers._s.add(id),
    has: (id) => layers._l.has(id), add: (d) => layers._l.add(d && d.id),
    setLayout: noop, setSourceData: noop, getLayout: () => 'none'
  };
  g.window.IntMapGeoEngine = { layers, events: { on: noop, onLayer: noop }, ready: () => true, popup: () => null };
  g.window.IntMapLang = { pick: () => (v) => (Array.isArray(v) ? v[0] : v), pickArgs: () => (...a) => a };
  g.window.IntMapSafe = { html: (s) => String(s) };
  g.window.IntMapLabelScale = { sub: (n) => n };
  g.window.IntMapModules = g.window.IntMapModules || {};
  g.window.addEventListener = g.window.addEventListener || noop;
  await import('../js/radiation-layer.js');
  const f = g.window.IntMapModules.radiationLayer;
  assert.equal(typeof f, 'function', 'js/radiation-layer.js must register IntMapModules.radiationLayer');
  return f({ lang: 'en', canDraw: () => true });
}

/* ── ① the ramp is REACHABLE, and it is the one the document describes ─────────────────────── */
test('① the colour ramp the module actually evaluates matches docs/RADIATION.md', async () => {
  const api = await mountLayer();
  const ramp = api.ramp();
  assert.ok(Array.isArray(ramp) && ramp.length >= 4, 'the layer must publish its ramp');
  const steps = ramp.map((r) => r[0]);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'ramp steps must ascend');
  assert.equal(steps[0], 0, 'the ramp must start at zero — a station reading nothing still has a colour');

  /* the document holds the same numbers in prose, each with the observation it came from. A number
     a machine holds and prose copies WILL drift (#R500), so the drift is measured here. */
  const doc = read('docs/RADIATION.md');
  /* the provenance table: every row states its step AND where the number came from. Read the whole
     table rather than a "N nSv/h" pattern — the first row legitimately says «50 / 100 nSv/h», and a
     check that only understood one shape would have called a documented step undocumented. */
  const table = doc.slice(doc.indexOf('| 段 | 由来 |'), doc.indexOf('**失効条件**'));
  assert.ok(table.length > 300, 'could not find the ramp provenance table in docs/RADIATION.md — this check is blind');
  const cited = new Set([...table.matchAll(/\b(\d[\d,]*)\b/g)].map((m) => Number(m[1].replace(/,/g, ''))));
  for (const s of steps.slice(1)) {
    assert.ok(cited.has(s), `ramp step ${s} nSv/h is not cited anywhere in docs/RADIATION.md — a threshold with no stated provenance is exactly what .agents/rules/no-ad-hoc-hardcoding.md §4 forbids`);
  }
});

/* ── ② measurement and simulation must not be confusable ───────────────────────────────────── */
test('② the measured ramp shares no colour with the plume simulation', async () => {
  const api = await mountLayer();
  const mine = new Set(api.ramp().map((r) => String(r[1]).toLowerCase()));
  /* ⚠ THE MODEL IS ASKED, NOT GREPPED. This first read `const ZONES` out of js/sims.js, and #R568
     moved the ladder into js/radiation-model.js and made it depend on the isotope — so the check
     went blind on a refactor that was entirely correct. Asking `zonesFor` for EVERY isotope the
     model declares means a new ladder, a new isotope or another move cannot take the palette out
     of this comparison's sight. */
  const { RAD } = await import('../js/radiation-model.js');
  const theirs = new Set();
  for (const iso of Object.keys(RAD.ISOTOPES)) {
    for (const b of (RAD.zonesFor(iso).bands || [])) if (b && b.c) theirs.add(String(b.c).toLowerCase());
  }
  assert.ok(theirs.size >= 3, 'could not read the simulation palette out of the radiation model — this check is blind, fix it rather than deleting it');
  const shared = [...mine].filter((c) => theirs.has(c));
  assert.deepEqual(shared, [], `the measured layer and the plume model share ${shared.join(', ')} — one is an observation and the other a hypothesis, and a reader cannot be asked to tell them apart by context`);
});

/* ── ③ a station with no coordinate is carried, not drawn ──────────────────────────────────── */
test('③ near() ignores stations with no usable coordinate and never invents one', async () => {
  const api = await mountLayer();
  /* nothing has been fetched, so the honest answer is an empty list — not a throw, and not a
     fabricated nearest station. */
  assert.deepEqual(api.near(35.0, 139.0, 100), []);
  assert.equal(api.state().stations, 0);
  assert.equal(api.state().on, false);
});

/* ── ④ EURDEP is not reachable from anything we ship ───────────────────────────────────────── */
test('④ nothing in the shipped tree fetches EURDEP', () => {
  /* ⚠ THIS IS THE POINT OF THE ROUND, NOT A STYLE RULE. EURDEP data stays under each national
     provider's copyright; the BfS mirror `eurdep_latestValue` fetches perfectly and still may not
     be shown. A URL is how that mistake would come back, so a URL is what is measured — mentions
     in comments and documents are how the reason survives, and are not the failure. */
  const dirs = ['js', 'src', 'supabase/functions'];
  const bad = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|mjs|ts)$/.test(e.name)) continue;
      /* comments are stripped first: a comment cannot fetch anything, and the REASON EURDEP is
         excluded has to be allowed to live next to the code that excludes it. Without this the
         check would make the explanation unwriteable, which is how a rule loses its why. */
      const src = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      for (const m of src.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        if (/eurdep|remap\.jrc|remon\.jrc|redata\.jrc/i.test(m[0])) bad.push(rel + ' → ' + m[0]);
      }
      for (const m of src.matchAll(/['"`][^'"`]*eurdep_latestValue[^'"`]*['"`]/gi)) bad.push(rel + ' → ' + m[0]);
    }
  };
  dirs.forEach(walk);
  assert.deepEqual(bad, [], 'a EURDEP endpoint is referenced as a URL:\n  ' + bad.join('\n  ') + '\n  docs/RADIATION.md §2 says why it may not be carried.');
});

/* ── ⑤ the layer is registered everywhere a layer has to be registered ─────────────────────── */
test('⑤ every registration point the row needs actually exists', () => {
  const beta = read('js/beta-overlays.js');
  assert.match(beta, /beta-dl-radobs/, 'the Layers row id is missing from js/beta-overlays.js');
  assert.match(beta, /radobs:\s*LA\(/, 'the row label must be an LA() tuple read directly — an aliased helper takes the string out of the i18n audit (#R548)');
  assert.match(beta, /radiation\.observed/, 'the kernel command must be registered eagerly, or Atlas cannot offer it before the module exists');
  assert.match(beta, /radiation\.near/, 'the point→stations join must be a kernel command too');

  /* the row has to land in a group, or it sits in Others(beta) for ever */
  assert.match(read('js/data-layers.js'), /lyrGrpHazard'.*radobs/, 'the row is not filed into the hazard group in reorganizeLayerPanel()');

  /* Atlas must be able to say what is on screen */
  assert.match(read('js/map-ui.js'), /imrad-obs-src/, 'js/map-ui.js does not register the layer with layerData — «what is on screen» would have no answer');

  /* and the dispatch must exist for both capability types */
  const console_ = read('js/atlas-console.js');
  for (const t of ['radiationObserved', 'radiationNear']) {
    assert.ok(console_.includes(`case '${t}':`), `dispatch has no case for '${t}'`);
  }
});

/* ── ⑦ the nuclear registry replaced the typed list, and it REFUSES rather than guessing ─────── */
test('⑦ resolveSite answers from data/npp.json and refuses a name it does not hold', async () => {
  const g = globalThis;
  if (typeof g.window === 'undefined') g.window = g;
  const noop = () => { };
  g.window.IntMapLang = { pick: () => (v) => (Array.isArray(v) ? v[0] : v), pickArgs: () => (...a) => a };
  g.window.IntMapGeoEngine = g.window.IntMapGeoEngine || { layers: { has: () => false, hasSource: () => false, addSource: noop, add: noop, setLayout: noop, setSourceData: noop, getLayout: () => 'none' }, events: { on: noop, onLayer: noop }, ready: () => true, popup: () => null };
  g.window.IntMapSafe = g.window.IntMapSafe || { html: (s) => String(s) };
  g.window.IntMapModules = g.window.IntMapModules || {};
  /* the module fetches its registry; serve the REAL file, so this measures the shipped data and not
     a fixture that happens to contain whatever the assertion wants (#R552). */
  const registry = read('data/npp.json');
  g.fetch = async (u) => (String(u).includes('npp.json')
    ? { ok: true, json: async () => JSON.parse(registry) }
    : { ok: false, json: async () => null });
  /* ⚠ the factory early-returns a stub when there is no renderer, and that stub has no resolveSite.
     Saying so here rather than stubbing around it: if this assertion starts firing, the module took
     the no-renderer branch and the test would otherwise be measuring the stub. */
  g.window.IntMapGeoEngine.hasRenderer = () => true;
  g.window.IntMapGeoEngine.camera = { flyTo: noop, getZoom: () => 3 };
  await import('../js/sims.js');
  g.window.IntMapModules.radiation({ lang: 'en', canDraw: () => true });
  const R = g.window.IntMapRadiation;
  assert.equal(typeof R.resolveSite, 'function', 'js/sims.js must still expose resolveSite (did the factory take the no-renderer branch?)');

  const plants = JSON.parse(registry).plants;
  const find = (rx) => plants.find((p) => rx.test(p.name));
  const daiichi = find(/Fukushima Daiichi Nuclear/);
  assert.ok(daiichi, 'the registry no longer holds Fukushima Daiichi — the check is blind, fix the registry');

  const hit = await R.resolveSite('Fukushima Daiichi');
  assert.ok(hit, 'resolveSite could not find a site the registry holds');
  const km = Math.hypot((hit.lat - daiichi.lat) * 111.32, (hit.lng - daiichi.lon) * 111.32 * Math.cos(daiichi.lat * Math.PI / 180));
  assert.ok(km < 5, `resolveSite returned a point ${km.toFixed(1)} km from the registry's own coordinate`);

  /* ⚠ THE REFUSAL IS THE POINT (#R515). The old table returned null for anything it did not list,
     and a similarity score with no floor would return the least-bad stranger instead — which is how
     a plume gets drawn over the wrong country with no sign that anything went wrong. */
  for (const nonsense of ['qqzzxx nuclear power plant', 'the blue restaurant on the corner', '存在しない原子力発電所ズズズ']) {
    assert.equal(await R.resolveSite(nonsense), null, `resolveSite invented a site for "${nonsense}"`);
  }
  assert.equal(await R.resolveSite(''), null);
});

/* ── ⑥ the honesty note is present in every language the module ships inline ────────────────── */
test('⑥ the legend note keeps all four cautions in all five inline languages', () => {
  const src = read('js/radiation-layer.js');
  const block = src.slice(src.indexOf('const note ='), src.indexOf('const clock ='));
  assert.ok(block.length > 400, 'could not find the legend note — this check is blind');
  /* one probe per language for the two facts a reader is harmed by losing: that the band is
     NORMAL, and that rain alone moves it. The i18n sweep fills fr/ko/zh from js/locales/. */
  const probes = [/50–200 nSv\/h is normal/, /通常の自然放射線量/, /normale natürliche/, /обычный природный фон/, /el fondo natural normal/];
  probes.forEach((p, i) => assert.match(block, p, `inline language ${i} lost the "this is normal background" sentence`));
  const rain = [/Rain alone/, /降雨/, /Regen/, /дождь/i, /lluvia/i];
  rain.forEach((p, i) => assert.match(block, p, `inline language ${i} lost the rain caveat — BfS measures a factor of three, and without it an ordinary wet afternoon reads as an accident`));
});
