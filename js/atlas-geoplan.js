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

const SOURCE_KINDS = ['layer', 'dataset', 'stac', 'ogc', 'overture', 'upload', 'url', 'inline', 'job-output', 'none'];
const ENVIRONMENTS = ['browser-gis', 'python', 'server', 'job'];
const COMPLETENESS = ['all', 'sample', 'any'];
const OUTPUT_KINDS = ['map', 'table', 'chart', 'file', 'answer'];

/* The capability each environment runs on. This is the registry's own id (js/atlas-cap-*.js), asked
   through `hasCapability` — so an environment with no capability is reported as having none instead of
   being assumed. server and job both run on `jobs.start` (js/atlas-cap-jobs.js): a persistent job runs the
   capability task `data.gis` on its server twin (supabase/functions/_shared/atlas-server-caps.js gisJob ->
   gis-headless.js), which loads the same js/gis-core.js as the page. Which operations that twin can run is
   asked through deps.opsOf (flow.runsWithoutScreen), not listed here. Observation 2026-11-27. */
export const ENVIRONMENT_CAPABILITY = { 'browser-gis': 'data.gis', python: 'compute.run', server: 'jobs.start', job: 'jobs.start' };

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
    const source = { kind, ref: str(src.ref) || null };
    for (const field of ['format', 'scope']) {
      if (str(src[field])) source[field] = str(src[field]).toLowerCase();
    }
    spec.needs.push({ id: str(n.id) || ('need' + (i + 1)), what: str(n.what), source, completeness: comp,
      resolution: normResolution(n.resolution), time: n.time != null && n.time !== '' ? str(n.time) : null });
  });
  if (g.method && typeof g.method === 'object') {
    spec.method = { ops: (Array.isArray(g.method.ops) ? g.method.ops : []).map(str).filter(Boolean), note: str(g.method.note) || null };
    for (const mode of ['strict', 'semantics']) {
      if (typeof g.method[mode] === 'boolean') spec.method[mode] = g.method[mode];
    }
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
    else if (!['none', 'upload', 'inline', 'overture'].includes(n.source.kind) && !n.source.ref)
      add('need-ref-not-stated', p + '.source.ref', n.id + ': a ' + n.source.kind + ' source is named without which one.');
    if (!n.completeness) add('need-completeness-not-stated', p + '.completeness', n.id + ': whether the region must be fully covered is not stated.');
    if (!n.resolution) add('need-resolution-not-stated', p + '.resolution', n.id + ': the resolution is not stated.');
    else if (n.resolution.text != null) add('need-resolution-unreadable', p + '.resolution', n.id + ': the resolution is not {"value":n,"unit":"m"|"km"|"deg"}.');
  });
  if (!spec.method || (!spec.method.ops.length && !spec.method.note && !spec.method.semantics)) add('method-not-stated', 'method', 'No operation is stated.');
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
    try { row = need.source.ref ? await deps.describe(need.source.ref, k) : null; } catch (_) { return { state: 'unknown', completeness: 'unstated', detail: 'describe-threw' }; }
    if (!row) return { state: 'unavailable', completeness: 'unstated', detail: 'not-in-intmap' };
    const und = Array.isArray(row.undeclared) ? row.undeclared.map((u) => u && u.slot).filter(Boolean) : [];
    return { state: 'available', completeness: 'unstated', detail: 'in-intmap', ref: row.ref || need.source.ref, undeclared: und };
  }
  if (k === 'overture') {
    /* Overture is a theme/release, not a catalogue IntMap can ask: it is a plan to fetch from the Overture
       distribution. Reported as what it is — nothing in the app can confirm it. */
    return { state: 'unknown', completeness: 'unproven', detail: 'overture-is-not-asked-by-any-catalogue-in-the-app' };
  }
  if (k === 'url' || k === 'inline' || k === 'job-output') {
    return { state: 'unknown', completeness: 'unstated', detail: 'source-is-confirmed-only-when-the-executor-reads-it' };
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
  /* resolution in metres (js/gis-atlas.js search maxGsd). Only {value, unit m|km} converts; anything else is said so below, not guessed. */
  if (need.resolution && isNum(need.resolution.value)) {
    if (need.resolution.unit === 'm') req.maxGsd = need.resolution.value;
    else if (need.resolution.unit === 'km') req.maxGsd = need.resolution.value * 1000;
  }
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
  /* A source covers the need only for what it STATES. A collection that names no period does not cover a period that was asked
     for, and one that does not state a resolution does not meet a resolution that was asked for — both are "not stated", reported as such. */
  const wantsTime = !!t;
  const res = need.resolution;
  const maxGsd = req.maxGsd == null ? null : req.maxGsd;
  const wantsRes = !!res;
  const resUnreadable = wantsRes && maxGsd == null;
  const cand = entries.map((e) => {
    const m = e.match || {};
    return { ref: e.ref, title: e.title, spatial: m.spatial, temporal: m.temporal, resolution: m.resolution,
      license: e.rights ? (e.rights.license == null ? null : e.rights.license) : null,
      coversRegion: m.spatial === 'covers',
      coversPeriod: wantsTime ? m.temporal === 'overlaps' : null,
      meetsResolution: wantsRes ? (!resUnreadable && m.resolution === 'meets') : null };
  });
  const full = cand.filter((c) => c.coversRegion && c.coversPeriod !== false && c.meetsResolution !== false);
  const missing = [];
  if (!cand.some((c) => c.coversRegion)) missing.push('collections-overlap-or-state-no-extent');
  else {
    const spatial = cand.filter((c) => c.coversRegion);
    if (wantsTime && !spatial.some((c) => c.coversPeriod)) missing.push(spatial.some((c) => c.temporal === 'unstated') ? 'collections-state-no-period' : 'collections-state-another-period');
    if (wantsRes && !spatial.some((c) => c.meetsResolution)) missing.push(resUnreadable ? 'resolution-not-convertible-to-metres' : 'collections-state-no-resolution-that-meets');
    if (wantsTime && wantsRes && !missing.length && !full.length) missing.push('no-single-collection-states-period-and-resolution');
  }
  return { state: full.length ? 'available' : 'partial', completeness: 'unproven',
    detail: full.length ? 'collections-state-they-cover-the-region' : missing.join(','),
    candidates: cand.slice(0, 5), silent };
}

/* Compatibility describes the host's route. Availability and extent remain observations of
   a particular data source. For example, accepting a whole GeoJSON file does not confirm its extent. */
function sourceExecution(source, contract, environment) {
  const { kind, format, scope } = source;
  if (!contract || !kind || kind === 'none') return { compatible: null };
  const route = Object.hasOwn(contract.sources, kind) ? contract.sources[kind] : null;
  const refusal = (reason) => ({ compatible: false, reason: reason + ' in ' + environment });
  if (!route) return refusal('source kind "' + kind + '" cannot be read');
  if (format && route.formats && !route.formats.includes(format)) {
    return refusal('format "' + format + '" cannot be read for source kind "' + kind + '"');
  }
  const scopes = format && route.scopeByFormat ? route.scopeByFormat[format] : route.scopes;
  if (scope && scopes && !scopes.includes(scope)) {
    return refusal('acquisition scope "' + scope + '" is unavailable for source kind "' + kind + '"');
  }
  if ((format && !route.formats) || (scope && !scopes)) {
    return { compatible: null, reason: 'the route for "' + kind + '" does not state the requested format or scope in ' + environment };
  }
  return { compatible: true };
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
  const soft = [];
  const needs = [];
  const location = spec.environment;
  const asksExecution = !!location && typeof d.executionOf === 'function';
  let contract = null;
  if (asksExecution) {
    try { contract = await d.executionOf(location); } catch (_) { contract = null; }
  }
  for (const n of spec.needs) {
    const r = await probeNeed(n, spec, d);
    const row = Object.assign({ id: n.id, wanted: n.completeness }, r);
    if (n.completeness === 'all' && r.state === 'available' && r.completeness !== 'stated-all')
      row.fullCoverage = 'unproven';
    if (asksExecution) {
      row.execution = sourceExecution(n.source, contract, location);
      if (row.execution.reason) {
        const target = row.execution.compatible === false ? reasons : soft;
        target.push(n.id + ': ' + row.execution.reason);
      }
    }
    needs.push(row);
    if (r.state === 'unavailable') reasons.push(n.id + ': ' + r.detail);
  }
  let env = null;
  if (spec.environment) {
    const cap = ENVIRONMENT_CAPABILITY[spec.environment];
    let has = null;
    if (cap === null) has = false;
    else if (typeof d.hasCapability === 'function') {
      try { const answer = d.hasCapability(cap); has = typeof answer === 'boolean' ? answer : null; } catch (_) { has = null; }
    }
    env = { name: spec.environment, capability: cap, available: has };
    if (asksExecution) env.execution = contract;
    if (has === false) reasons.push('environment ' + spec.environment + ' has no capability in IntMap' + (cap ? ' (' + cap + ' is not registered)' : ''));
  }
  /* method.ops against the operations that exist. Asked of the environment named, else of every environment (an op is known if any has it). */
  let method = null;
  const wanted = (spec.method && spec.method.ops) || [];
  if (wanted.length) {
    const envs = spec.environment ? [spec.environment] : ENVIRONMENTS;
    const lists = {};
    for (const e of envs) {
      let l = null;
      try { l = typeof d.opsOf === 'function' ? await d.opsOf(e) : null; } catch (_) { l = null; }
      lists[e] = Array.isArray(l) ? l : null;
    }
    const where = spec.environment || 'any environment';
    method = { ops: wanted.map((id) => {
      const home = envs.find((e) => lists[e] && lists[e].indexOf(id) >= 0);
      if (home) return { id, known: true, environment: home };
      const unasked = envs.some((e) => lists[e] === null);
      return { id, known: unasked ? null : false, environment: spec.environment || null };
    }) };
    for (const o of method.ops) {
      if (o.known === false) {
        const all = [].concat(...envs.map((e) => lists[e] || []));
        const low = o.id.toLowerCase();
        const near = Array.from(new Set(all)).filter((x) => { const y = x.toLowerCase(); return y.indexOf(low) >= 0 || low.indexOf(y) >= 0; }).slice(0, 3);
        reasons.push('method.ops: "' + o.id + '" is not an operation of ' + where + (near.length ? ' (near: ' + near.join(', ') + ')' : ''));
      } else if (o.known === null) soft.push('method.ops: "' + o.id + '" could not be checked against ' + where + ' (its operations were not asked or are not declared)');
    }
  }
  const modes = ['strict', 'semantics'].filter((mode) => spec.method && spec.method[mode] === true);
  if (modes.length) {
    if (!method) method = { ops: [] };
    method.execution = {};
    for (const mode of modes) {
      const supported = contract && typeof contract[mode] === 'boolean' ? contract[mode] : null;
      method.execution[mode] = supported;
      if (supported === false) reasons.push('method.' + mode + ' is unavailable in ' + location);
      if (supported === null) soft.push('method.' + mode + ': execution support could not be established');
    }
  }
  if (asksExecution && !contract) soft.push('the acquisition contract for ' + location + ' could not be established');
  const opsOk = !method || method.ops.every((o) => o.known === true);
  const routesOk = !asksExecution || (contract && needs.every((x) => x.execution.compatible === true));
  const known = needs.length > 0 && needs.every((x) => x.state === 'available') && (!location || (env && env.available === true)) && opsOk && routesOk && !soft.length;
  const unproven = needs.some((x) => x.fullCoverage === 'unproven');
  const runnable = reasons.length ? false : (known && !unproven ? true : null);
  if (runnable !== true) {
    /* everything that stopped a true is said, whether or not something else already made it false */
    needs.filter((x) => x.state !== 'available' && x.state !== 'unavailable').forEach((x) => reasons.push(x.id + ': ' + x.state + ' (' + x.detail + ')'));
    soft.forEach((x) => reasons.push(x));
    if (unproven) reasons.push('full coverage of the region was asked for and no source states it');
    if (!needs.length) reasons.push('no needs are listed');
    if (spec.environment && env && env.available === null) reasons.push('environment ' + spec.environment + ': whether ' + env.capability + ' is registered could not be asked');
  }
  const out = { needs, environment: env, runnable, reasons };
  if (method) out.method = method;
  return out;
}

/** The words that go back to the model. Gaps and availability, as IntMap observed them. */
export function geoReport(spec, unrecognised, check) {
  return { spec, gaps: gapsOf(spec), unrecognised: unrecognised || [], availability: check || null,
    note: 'gaps = what the spec does not state. availability reports what sources state and what the chosen environment can execute. A supported route does not confirm source coverage or availability. runnable:false records an observed incompatibility or unavailable requirement; null means execution could not be established. The check is advisory.' };
}

/** defaultProbe() -> deps for preflight, from the live app. Looked up at call time; absent doors are
 *  reported by probeNeed as `unknown`, never as `unavailable`. */
export function defaultProbe(g) {
  const root = g || (typeof globalThis !== 'undefined' ? globalThis : {});
  const atlas = () => (root.IntMapGis && root.IntMapGis.atlas) || null;
  const flowOf = async () => {
    try { if (root.IntMapLazy && !(root.IntMapGis && root.IntMapGis.flow)) await root.IntMapLazy.need('gisCore'); } catch (_) { /* absent door = null */ }
    return root.IntMapGis && root.IntMapGis.flow;
  };
  return {
    describe: async (ref, kind) => {
      if (kind === 'dataset') {
        const flow = await flowOf();
        if (!flow || typeof flow.find !== 'function') throw new Error('no-describe');
        const rows = (await flow.find()).datasets;
        const named = rows.filter((row) => String(row.title).toLowerCase() === ref.toLowerCase());
        return rows.find((row) => row.id === ref) || (named.length === 1 ? named[0] : null);
      }
      try { if (root.IntMapLazy && !atlas()) await root.IntMapLazy.need('gisCore'); } catch (_) { /* absent door = unknown, below */ }
      const a = atlas(); if (!a || typeof a.describe !== 'function') throw new Error('no-describe'); return a.describe(ref);
    },
    discover: async (req) => {
      try { if (root.IntMapLazy && !atlas()) await root.IntMapLazy.need('gisCore'); } catch (_) { /* the door below says so */ }
      const a = atlas(); if (!a || typeof a.remote !== 'function') return { ok: false, why: 'no-remote-door' };
      /* 'search' (not 'discover'): only search carries maxGsd and returns entries[].match.resolution (js/gis-atlas.js remote door) */
      return a.remote(Object.assign({ action: 'search' }, req));
    },
    /* The operations an environment runs, as the GIS declares them (flow.find().ops) — never a list written here.
       browser-gis: all; server/job: the ones flow.runsWithoutScreen accepts (what the job's data.gis twin runs); python: null — compute.run declares no operations. */
    opsOf: async (environment) => {
      if (environment === 'python') return null;
      const flow = await flowOf();
      if (!flow || typeof flow.find !== 'function') return null;
      const cat = await flow.find();
      const ops = cat && Array.isArray(cat.ops) ? cat.ops : null;
      if (!ops) return null;
      if (environment === 'browser-gis') return ops.map((o) => o.id);
      if (environment === 'server' || environment === 'job') return typeof flow.runsWithoutScreen === 'function' ? ops.filter(flow.runsWithoutScreen).map((o) => o.id) : null;
      return null;
    },
    executionOf: async (environment) => {
      if (environment === 'python') return null;
      const flow = await flowOf();
      return flow && typeof flow.executionOf === 'function' ? flow.executionOf(environment) : null;
    },
    hasCapability: (id) => { const C = root.IntMapCapabilities; if (!C || typeof C.has !== 'function') return null; return C.has(id); },
  };
}
