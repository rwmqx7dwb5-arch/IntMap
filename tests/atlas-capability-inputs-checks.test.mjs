/* ============================================================================
 *  Atlas capability inputs — the target gate reads the schema, not a table (atlas-capability-inputs)
 * ----------------------------------------------------------------------------
 *  `resolveInputs` used to ask a hand-written list of argument spellings per target kind (`hasTarget`),
 *  so a call the schema and the documentation both allow (`data.volcano {name}`, `sim.earthquake {epicentre}`,
 *  `map.outline {on:false}` …) answered `needs_input`. The gate now asks the capability's own schema.
 *  This runs the real registry: for every capability whose row demands a target, EACH set the schema
 *  says suffices (a whole `anyOf` branch, or `required`) must pass, and an empty call must still ask.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis.window || globalThis;
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { makeAtlasSchemas } from '../js/atlas-schemas.js';

const CAPS = makeAtlasCapabilities({});
const S = makeAtlasSchemas();
CAPS.bindRuntime({ schemas: S, dispatch: () => ({ ok: true }) });

function sample(sc) {
  if (!sc) return 'x';
  if (Array.isArray(sc.enum) && sc.enum.length) return sc.enum[0];
  switch (sc.type) {
    case 'boolean': return false;   /* an `on:false` must count as present */
    case 'number': case 'integer': return sc.minimum != null ? sc.minimum : 1;
    case 'array': return [sample(sc.items || { type: 'string' })];
    case 'object': return {};
    default: return 'x';
  }
}
const subjects = CAPS.all().filter((c) => !c.withdrawn && c.targetPolicy && c.targetPolicy.required);

test('atlas-capability-inputs ①: every set the schema declares sufficient passes the target gate', () => {
  assert.ok(subjects.length >= 40, 'only ' + subjects.length + ' target-demanding capabilities seen');
  const refused = [];
  for (const c of subjects) {
    const sc = S.schemaFor(c.id) || {};
    const branches = (sc.anyOf || []).map((b) => b.required).filter((r) => r && r.length);
    for (const br of (branches.length ? branches : [[]])) {
      const keys = [...new Set([...(sc.required || []), ...br])];
      const args = {};
      for (const k of keys) args[k] = sample(sc.properties[k]);
      const r = c.resolveInputs({}, args);
      if (r && r.inputRequest) refused.push(c.id + ' ' + JSON.stringify(Object.keys(args)));
    }
  }
  assert.deepEqual(refused, [], 'the schema says these suffice; the gate asked the reader instead');
});

test('atlas-capability-inputs ②: an empty call to a target-demanding capability still asks (the map centre is never taken)', () => {
  const silent = subjects.filter((c) => {
    const sc = S.schemaFor(c.id) || {};
    const demands = (sc.required && sc.required.length) || (sc.anyOf || []).some((b) => b.required && b.required.length);
    if (!demands) return false;
    const r = c.resolveInputs({}, {});
    return !(r && r.inputRequest);
  }).map((c) => c.id);
  assert.deepEqual(silent, []);
});

test('atlas-capability-inputs ③: the documented spellings that used to be refused now pass', () => {
  const ok = (id, a) => { const r = CAPS.resolve(id).resolveInputs({}, a); assert.ok(!(r && r.inputRequest), id + ' ' + JSON.stringify(a)); };
  ok('data.volcano', { name: 'Etna' });
  ok('data.heritage', { id: 1 });
  ok('news.company', { company: 'Toyota' });
  ok('news.category', { category: 'tech' });
  ok('data.exploreRelated', { target: 'gdp' });
  ok('map.isolateCountry', { on: false });
  ok('map.outline', { on: false });
  ok('panel.streetView', { on: false });
  ok('sim.pandemicRun', { days: 90 });
  ok('sim.earthquake', { epicentre: 'Tokyo' });
  ok('sim.radiation', { source: 'Fukushima' });
  ok('data.satelliteCompare', { dateA: '2020-01-01', dateB: '2021-01-01' });
  ok('map.elevationHighlight', { around: 'Fuji' });
});

/* ── ④ what a capability's documentation names as an argument, its schema declares ─────────────────────────────
   `sim.rfCoverage` documented `power` for months and the schema, the run and the viewshed all ignored it; an undeclared
   argument is not refused (a spelling the case reads must keep working), so nothing said so. The documentation is the
   planner's only picture of the arguments: the top-level names of every documented `{"type":…}` shape must be properties. */
import { CAPABILITY_MODULES } from '../js/atlas-caps-modules.js';
function topKeys(t) {
  let depth = 0, inStr = false; const keys = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') {
      if (depth === 1) { const m = t.slice(i).match(/^"([A-Za-z0-9_]+)"\??:/); if (m) { keys.push(m[1]); i += m[0].length - 1; continue; } }
      inStr = true; continue;
    }
    if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
  }
  return keys;
}
test('atlas-capability-inputs ④: every argument a capability documents is a property of its schema', () => {
  globalThis.window = globalThis.window || globalThis;
  let shapes = 0; const missing = [];
  for (const mod of Object.values(CAPABILITY_MODULES)) for (const e of mod) {
    const props = new Set(Object.keys((e.schema() || {}).properties || {}));
    const spellings = [e.row[1], ...String(e.row[2] || '').split(',')];
    for (const d of (e.doc || [])) {
      const t = typeof d.text === 'string' ? d.text : '';
      const m = t.match(/^\{"type":"([A-Za-z0-9_.]+)"/);
      if (!m || !spellings.includes(m[1])) continue;
      shapes++;
      const miss = topKeys(t).filter((k) => k !== 'type' && !props.has(k));
      if (miss.length) missing.push(e.row[0] + ': ' + miss.join(','));
    }
  }
  assert.ok(shapes >= 200, 'only ' + shapes + ' documented shapes were read');
  assert.deepEqual(missing, [], 'documented but undeclared: the call runs without them and reports success');
});
