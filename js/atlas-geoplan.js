/* ============================================================================
 *  IntMap · Atlas — GEOSPATIAL TASK PLAN   (geo-task-planner)
 *  window-less module: js/atlas-plan.js stores the spec on its plan, the loop (js/atlas-agent.js)
 *  awaits preflight() when Atlas declares one. No DOM. The only global is read inside defaultProbe().
 * ----------------------------------------------------------------------------
 *  ══ WHAT WAS MISSING ══════════════════════════════════════════════════════════════════════
 *  The `plan` tool holds steps in prose. 「ベトナム北部の洪水の影響人口を 2020 年で」 has a SHAPE — a
 *  place, a time, a quantity, the data it needs, how complete that data must be, an operation, a
 *  place to run it, a deliverable — and the prose hid whether any of it existed. A plan could read
 *  well while the data it rested on was not in IntMap, not in any catalogue, or covered one tile of
 *  the region. Nothing held those facts where the executor could read them.
 *
 *  ══ WHO DECIDES WHAT ═══════════════════════════════════════════════════════════════════════
 *  · THE SPEC IS ATLAS'S. Every field is optional and the model writes all of it (the `geo` member of
 *    the `plan` tool). Nothing here fills a field in, picks a dataset, or requires a spec.
 *  · THE GAPS ARE IntMap's OBSERVATION OF THE SPEC: a field that was not stated is listed as not
 *    stated — never defaulted. 「未記載」 is not 「該当なし」.
 *  · AVAILABILITY IS ASKED OF THE SOURCES, NEVER OF THE MODEL: preflight() asks IntMap's own layers
 *    and datasets (IntMapGis describe) and the world's catalogues (gisRemote discover) and reports
 *    what they STATE. A catalogue that did not answer is `unknown`, not `unavailable`
 *    (.agents/rules/one-pass-or-a-reason.md §5). A catalogue cannot prove it holds everything, so
 *    `all` completeness is never confirmed from a collection's say-so — it stays `unproven`.
 *  ⚠ NOTHING HERE REFUSES A CALL. The verdict (`runnable`) is a statement that goes back to the
 *  model; no operation is blocked, reordered or limited for it (CONSTITUTION.md §5).
 * ==========================================================================*/

const SOURCE_KINDS = ['layer', 'dataset', 'stac', 'ogc', 'overture', 'upload', 'none'];
const ENVIRONMENTS = ['browser-gis', 'python', 'server', 'job'];
const COMPLETENESS = ['all', 'sample', 'any'];
const OUTPUT_KINDS = ['map', 'table', 'chart', 'file', 'answer'];

/* The capability each environment runs on. This is the registry's own id (js/atlas-cap-*.js), asked
   through `hasCapability` — so an environment with no capability is reported as having none instead of
   being assumed. server/job have no capability today: they come back `unavailable`, which is the truth
   a plan that wants them must be told. Observation 2026-11-20; fails when a capability for either is added
   (then add it here — the check in tests/geo-task-planner-checks.test.mjs lists this table). */
export const ENVIRONMENT_CAPABILITY = { 'browser-gis': 'data.gis', python: 'compute.run', server: null, job: null };

const str = (v) => (v == null ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && isFinite(v);
const pick = (v, set) => { const s = str(v).toLowerCase(); return set.indexOf(s) >= 0 ? s : null; };

function normBounds(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum)) return null;
  const [w, s, e, n] = b;
  if (!(w >= -180 && w <= 180 && e >= -180 && e <= 180 && s >= -90 && n <= 90 && s < n)) return null;
  return [w, s, e, n];   /* w > e is an antimeridian window, kept as written */
}

function normResolution(r) {
  if (r == null || r === '') return null;
  if (isNum(r && r.value) && str(r.unit)) return { value: r.value, unit: str(r.unit).toLowerCase() };
  return { text: str(typeof r === 'object' ? JSON.stringify(r) : r) };   /* stated but not machine-readable: kept, and said so below */
}

/** normalizeGeo(raw) -> {spec, unrecognised[]}. Unknown enum words are not guessed into a value: the
 *  field is left null and the word is returned, so it can be told to the model. */
export function normalizeGeo(raw) {
  const g = (raw && typeof raw === 'object') ? raw : {};
  const bad = [];
  const spec = { question: str(g.question), region: null, time: null, conditions: [], needs: [], method: null, environment: null, outputs: [] };
  if (g.region && typeof g.region === 'object') {
    const b = normBounds(g.region.bounds);
    if (g.region.bounds != null && !b) bad.push({ path: 'region.bounds', value: g.region.bounds, accepted: '[west,south,east,north] in degrees' });
    spec.region = { name: str(g.region.name) || null, bounds: b };
  } else if (typeof g.region === 'string' && str(g.region)) spec.region = { name: str(g.region), bounds: null };
  if (g.time != null && g.time !== '') {
    if (typeof g.time === 'object') {
      spec.time = { at: str(g.time.at) || null, from: str(g.time.from) || null, to: str(g.time.to) || null };
      if (!spec.time.at && !spec.time.from && !spec.time.to) spec.time = null;
    } else spec.time = { at: str(g.time), from: null, to: null };
  }
  spec.conditions = (Array.isArray(g.conditions) ? g.conditions : []).map(str).filter(Boolean);
  (Array.isArray(g.needs) ? g.needs : []).forEach((n, i) => {
    if (!n || typeof n !== 'object') return;
    const src = (n.source && typeof n.source === 'object') ? n.source : {};
    const kind = pick(src.kind, SOURCE_KINDS);
    if (src.kind != null && src.kind !== '' && !kind) bad.push({ path: 'needs[' + i + '].source.kind', value: src.kind, accepted: SOURCE_KINDS });
    const comp = pick(n.completeness, COMPLETENESS);
    if (n.completeness != null && n.completeness !== '' && !comp) bad.push({ path: 'needs[' + i + '].completeness', value: n.completeness, accepted: COMPLETENESS });
    spec.needs.push({ id: str(n.id) || ('need' + (i + 1)), what: str(n.what), source: { kind: kind, ref: str(src.ref) || null }, completeness: comp,
      resolution: normResolution(n.resolution), time: n.time != null && n.time !== '' ? str(n.time) : null });
  });
  if (g.method && typeof g.method === 'object') {
    spec.method = { ops: (Array.isArray(g.method.ops) ? g.method.ops : []).map(str).filter(Boolean), note: str(g.method.note) || null };
  } else if (typeof g.method === 'string' && str(g.method)) spec.method = { ops: [], note: str(g.method) };
  if (g.environment != null && g.environment !== '') {
    spec.environment = pick(g.environment, ENVIRONMENTS);
    if (!spec.environment) bad.push({ path: 'environment', value: g.environment, accepted: ENVIRONMENTS });
  }
  (Array.isArray(g.outputs) ? g.outputs : []).forEach((o, i) => {
    const k = pick(o && typeof o === 'object' ? o.kind : o, OUTPUT_KINDS);
    if (!k) { bad.push({ path: 'outputs[' + i + ']', value: o, accepted: OUTPUT_KINDS }); return; }
    spec.outputs.push({ kind: k, note: (o && typeof o === 'object' && str(o.note)) || null });
  });
  return { spec, unrecognised: bad };
}

/** mergeGeo(prev, raw) -> normalized spec. A later `plan` call states only what changed: a member
 *  present in `raw` replaces the same member, one absent is kept. */
export function mergeGeo(prev, raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const n = normalizeGeo(r);
  if (!prev) return n;
  const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
  const spec = Object.assign({}, prev.spec);
  ['question', 'region', 'time', 'conditions', 'needs', 'method', 'environment', 'outputs'].forEach((k) => { if (has(k)) spec[k] = n.spec[k]; });
  return { spec, unrecognised: n.unrecognised };
}

/** gapsOf(spec) -> [{code, path, message}]. What the spec does not say — listed, never filled in. */
export function gapsOf(spec) {
  const g = [];
  const add = (code, path, message) => g.push({ code, path, message });
  if (!spec) return g;
  if (!spec.region) add('region-not-stated', 'region', 'No target region is stated.');
  else if (!spec.region.bounds) add('region-bounds-not-stated', 'region.bounds', 'The region has no bounds, so no source can be asked whether it covers it.');
  if (!spec.time) add('time-not-stated', 'time', 'No target time is stated.');
  if (!spec.needs.length) add('needs-not-stated', 'needs', 'No data the analysis needs is listed.');
  spec.needs.forEach((n, i) => {
    const p = 'needs[' + i + ']';
    if (!n.what) add('need-what-not-stated', p + '.what', n.id + ': what the data is has no statement.');
    if (!n.source.kind) add('need-source-not-stated', p + '.source.kind', n.id + ': where the data comes from is not stated.');
    else if (n.source.kind !== 'none' && n.source.kind !== 'upload' && !n.source.ref && n.source.kind !== 'overture')
      add('need-ref-not-stated', p + '.source.ref', n.id + ': a ' + n.source.kind + ' source is named without which one.');
    if (!n.completeness) add('need-completeness-not-stated', p + '.completeness', n.id + ': whether the region must be fully covered is not stated.');
    if (!n.resolution) add('need-resolution-not-stated', p + '.resolution', n.id + ': the resolution is not stated.');
    else if (n.resolution.text != null) add('need-resolution-unreadable', p + '.resolution', n.id + ': the resolution is not {"value":n,"unit":"m"|"km"|"deg"}.');
  });
  if (!spec.method || (!spec.method.ops.length && !spec.method.note)) add('method-not-stated', 'method', 'No operation is stated.');
  if (!spec.environment) add('environment-not-stated', 'environment', 'No execution environment is stated (' + ENVIRONMENTS.join(' | ') + ').');
  if (!spec.outputs.length) add('outputs-not-stated', 'outputs', 'No deliverable is stated.');
  return g;
}

/**
 * probeNeed(need, spec, deps) -> {state, completeness, detail}
 *   state: 'available' | 'partial' | 'unavailable' | 'unknown' | 'not-needed'
 *   completeness of the REGION: 'stated-all' | 'stated-partial' | 'unstated' | 'unproven'
 * deps.describe(ref) -> row|null (IntMap's own layers/datasets); deps.discover(req) -> {ok, entries[], catalogs[]}.
 */
async function probeNeed(need, spec, deps) {
  const k = need.source.kind;
  if (!k) return { state: 'unknown', completeness: 'unstated', detail: 'source-not-stated' };
  if (k === 'none') return { state: 'unavailable', completeness: 'unstated', detail: 'the plan states there is no source' };
  if (k === 'upload') return { state: 'unknown', completeness: 'unstated', detail: 'an uploaded file is the reader\'s; nothing here can ask whether it exists' };
  if (k === 'layer' || k === 'dataset') {
    if (!deps.describe) return { state: 'unknown', completeness: 'unstated', detail: 'no-describe-door' };
    let row = null;
    try { row = need.source.ref ? await deps.describe(need.source.ref) : null; } catch (_) { return { state: 'unknown', completeness: 'unstated', detail: 'describe-threw' }; }
    if (!row) return { state: 'unavailable', completeness: 'unstated', detail: 'not-in-intmap' };
    const und = Array.isArray(row.undeclared) ? row.undeclared.map((u) => u && u.slot).filter(Boolean) : [];
    return { state: 'available', completeness: 'unstated', detail: 'in-intmap', ref: row.ref || need.source.ref, undeclared: und };
  }
  if (k === 'overture') {
    /* Overture is a theme/release, not a catalogue IntMap can ask: it is a plan to fetch from the Overture
       distribution. Reported as what it is — nothing in the app can confirm it. */
    return { state: 'unknown', completeness: 'unproven', detail: 'overture-is-not-asked-by-any-catalogue-in-the-app' };
  }
  /* stac / ogc — ask the catalogues; q words are all required, so only the stated what is passed on as q only when it is short */
  if (!deps.discover) return { state: 'unknown', completeness: 'unstated', detail: 'no-discover-door' };
  const kinds = k === 'stac' ? ['stac'] : ['ogc-features'];
  const req = { kinds, limit: 20 };
  if (need.source.ref) req.q = need.source.ref;
  else if (need.what) req.q = need.what;
  if (spec.region && spec.region.bounds) req.bounds = spec.region.bounds;
  const t = need.time || (spec.time && (spec.time.at || (spec.time.from && spec.time.to ? spec.time.from + '/' + spec.time.to : spec.time.from || spec.time.to)));
  if (t) req.time = t;
  let r = null;
  try { r = await deps.discover(req); } catch (e) { return { state: 'unknown', completeness: 'unproven', detail: 'discover-threw' }; }
  if (!r || r.ok === false) return { state: 'unknown', completeness: 'unproven', detail: 'discover-refused' + (r && r.why ? ':' + r.why : '') };
  const silent = (r.catalogs || []).filter((c) => !c.answered).map((c) => c.id);
  const entries = r.entries || [];
  if (!entries.length) {
    /* nothing listed is 「nothing there」 ONLY when every catalogue answered completely */
    const allAnswered = (r.catalogs || []).length > 0 && silent.length === 0 && (r.catalogs || []).every((c) => c.complete !== false);
    return { state: allAnswered ? 'unavailable' : 'unknown', completeness: 'unproven', detail: allAnswered ? 'no-collection-states-it-covers-this' : 'catalogues-did-not-all-answer', silent };
  }
  const covers = entries.filter((e) => e.match && e.match.spatial === 'covers' && e.match.temporal !== 'outside');
  return { state: covers.length ? 'available' : 'partial', completeness: 'unproven',
    detail: covers.length ? 'collections-state-they-cover-the-region' : 'collections-overlap-or-state-no-extent',
    candidates: entries.slice(0, 5).map((e) => ({ ref: e.ref, title: e.title, spatial: e.match && e.match.spatial, temporal: e.match && e.match.temporal,
      license: e.rights ? (e.rights.license == null ? null : e.rights.license) : null })), silent };
}

/**
 * preflight(spec, deps) -> {needs:[{id, ...probe, wanted}], environment, runnable, reason[]}
 * runnable: true  — every need found, the environment has its capability, the spec states what it must
 *           false — a need is known to be unavailable, or the environment has no capability
 *           null  — could not be established (a catalogue silent, a field not stated)
 * A `completeness:"all"` need is never `true` on a catalogue's say-so: it reports `unproven`.
 */
export async function preflight(spec, deps) {
  const d = deps || {};
  const reasons = [];
  const needs = [];
  for (const n of spec.needs) {
    const r = await probeNeed(n, spec, d);
    const row = Object.assign({ id: n.id, wanted: n.completeness }, r);
    if (n.completeness === 'all' && r.state === 'available' && r.completeness !== 'stated-all')
      row.fullCoverage = 'unproven';
    needs.push(row);
    if (r.state === 'unavailable') reasons.push(n.id + ': ' + r.detail);
  }
  let env = null;
  if (spec.environment) {
    const cap = ENVIRONMENT_CAPABILITY[spec.environment];
    let has = null;
    if (cap === null) has = false;
    else if (typeof d.hasCapability === 'function') { try { has = !!d.hasCapability(cap); } catch (_) { has = null; } }
    env = { name: spec.environment, capability: cap, available: has };
    if (has === false) reasons.push('environment ' + spec.environment + ' has no capability in IntMap' + (cap ? ' (' + cap + ' is not registered)' : ''));
  }
  const known = needs.length > 0 && needs.every((x) => x.state === 'available') && (!spec.environment || (env && env.available === true));
  const unproven = needs.some((x) => x.fullCoverage === 'unproven');
  const runnable = reasons.length ? false : (known && !unproven ? true : null);
  if (runnable === null) {
    needs.filter((x) => x.state !== 'available').forEach((x) => reasons.push(x.id + ': ' + x.state + ' (' + x.detail + ')'));
    if (unproven) reasons.push('full coverage of the region was asked for and no source states it');
    if (!needs.length) reasons.push('no needs are listed');
  }
  return { needs, environment: env, runnable, reasons };
}

/** The words that go back to the model. Gaps and availability, as IntMap observed them. */
export function geoReport(spec, unrecognised, check) {
  return { spec, gaps: gapsOf(spec), unrecognised: unrecognised || [], availability: check || null,
    note: 'gaps = what the spec does not state (not defaulted). availability = what IntMap\'s layers and the catalogues STATE; "unknown" is not "unavailable", and a catalogue cannot prove full coverage. runnable:false means a need or the environment does not exist; null means it could not be established. Nothing is blocked by this.' };
}

/** defaultProbe() -> deps for preflight, from the live app. Looked up at call time; absent doors are
 *  reported by probeNeed as `unknown`, never as `unavailable`. */
export function defaultProbe(g) {
  const root = g || (typeof globalThis !== 'undefined' ? globalThis : {});
  const atlas = () => (root.IntMapGis && root.IntMapGis.atlas) || null;
  return {
    describe: async (ref) => {
      try { if (root.IntMapLazy && !atlas()) await root.IntMapLazy.need('gisCore'); } catch (_) { /* absent door = unknown, below */ }
      const a = atlas(); if (!a || typeof a.describe !== 'function') throw new Error('no-describe'); return a.describe(ref);
    },
    discover: async (req) => {
      try { if (root.IntMapLazy && !atlas()) await root.IntMapLazy.need('gisCore'); } catch (_) { /* the door below says so */ }
      const a = atlas(); if (!a || typeof a.remote !== 'function') return { ok: false, why: 'no-remote-door' };
      return a.remote(Object.assign({ action: 'discover' }, req));
    },
    hasCapability: (id) => { const C = root.IntMapCapabilities; if (!C || typeof C.has !== 'function') return null; return C.has(id); },
  };
}
