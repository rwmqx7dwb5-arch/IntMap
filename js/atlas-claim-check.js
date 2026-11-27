/* ============================================================================
 *  IntMap · Atlas verification — what a program can decide about a worker's claims, before a model is asked
 *                                                                              (js/atlas-claim-check.js)
 * ----------------------------------------------------------------------------
 *  A checking worker (js/atlas-orchestrate.js verifyContract) is a model call: seconds and money. Some of what a worker
 *  returns does not need one — a latitude of 123, a polygon whose ring does not close, a figure in a unit no table knows,
 *  the same quantity stated in two units of different dimensions. A program decides those exactly, and a model asked about
 *  them can only be wrong or slow. What a program cannot decide — whether a source says what the worker says it says, why
 *  something happened, how far a publisher can be trusted, an argument with several steps — stays with the model.
 *
 *  ⚠ THERE IS NO LIST OF KINDS OF CLAIM HERE (.agents/rules/no-ad-hoc-hardcoding.md). The split is not decided by sorting claims
 *  into «geometric» and «interpretive». It is decided by what each CHECK FOUND on the value the claim carries:
 *    · a check that finds a defect         → the claim is `contradicted` by that check, and the model is not asked about it
 *    · a check that finds nothing wrong    → this says the value is well-formed, NOT that the claim is true; the claim is still
 *                                            asked of the model (with the note that its value already passed the structure checks)
 *    · a value no check can read           → nothing is said; the model is asked
 *  So «supported» is never produced here: a program cannot know that a well-formed polygon is the right one.
 *
 *  Which kernel reads a value is handed in (`kernels`: { geometry, units }), the way fact-merge hands in `resolve`: the pure
 *  file has no window. A kernel that is absent does not fail a claim — its checks say nothing (`unchecked`).
 *
 *  A CLAIM IS NAMED BY AN ID, NOT BY ITS WORDS. `claimId(taskId, index)` is `<task>#<n>` — the position in the findings the
 *  worker returned. The checker is shown the ids and returns them; matching a verdict to a claim by the claim's text broke on
 *  any difference of wording (a paraphrase read as «not checked»).
 *
 *  Pure: no DOM, no network, no globals.
 * ==========================================================================*/

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const fold = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

export const VERDICTS = ['supported', 'unsupported', 'contradicted'];

/* the id of the n-th finding (0-based) of task `taskId`. Stable for the same result, whatever the claim says. */
export function claimId(taskId, index) { return s(taskId, 64) + '#' + (Number(index) + 1); }

/* [{ id, claim, finding }] — the findings of a result that state a claim, each with its id */
export function claimsOf(result) {
  const out = [];
  ((result && result.findings) || []).forEach((f, i) => {
    const claim = s(f && (typeof f === 'string' ? f : f.claim), 1200);
    if (claim) out.push({ id: claimId(result.id, i), claim, finding: (f && typeof f === 'object') ? f : { claim } });
  });
  return out;
}

const GEOM_TYPES = /^(Point|MultiPoint|LineString|MultiLineString|Polygon|MultiPolygon|GeometryCollection)$/;
const LAT_KEYS = ['lat', 'latitude'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitude'];

/* every GeoJSON geometry and every lat/lon pair inside a value, with where it was found. Bounded by what is walked
   (depth and node count) so that a hostile or huge result cannot make the check the slow part. */
export function findSpatial(value, opts) {
  const maxNodes = (opts && opts.maxNodes) || 4000;
  const geoms = [], pairs = [];
  let nodes = 0;
  const seen = new Set();
  (function walk(v, path, depth) {
    if (v == null || typeof v !== 'object' || depth > 8 || nodes++ > maxNodes || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']', depth + 1)); return; }
    if (typeof v.type === 'string' && GEOM_TYPES.test(v.type) && (v.coordinates !== undefined || v.geometries !== undefined)) { geoms.push({ path, geometry: v }); return; }
    if (v.type === 'Feature' && v.geometry && typeof v.geometry === 'object') { geoms.push({ path: path + '.geometry', geometry: v.geometry }); return; }
    /* an own key that STATES a value: a finding that merely has an empty `lat` slot, or inherits one, is not claiming a position */
    const stated = (k) => Object.prototype.hasOwnProperty.call(v, k) && v[k] !== null && v[k] !== undefined && v[k] !== '';
    const latK = LAT_KEYS.find(stated), lonK = LON_KEYS.find(stated);
    if (latK && lonK) pairs.push({ path, lat: v[latK], lon: v[lonK] });
    Object.keys(v).forEach((k) => walk(v[k], path ? path + '.' + k : k, depth + 1));
  })(value, '', 0);
  return { geoms, pairs };
}

const isNum = (x) => typeof x === 'number' && isFinite(x);
const asNum = (x) => (typeof x === 'string' && x.trim() !== '' ? Number(x) : x);

/* the defects a program finds in the spatial values of ONE value (a finding, or a task's data).
   → [{ check, code, path, detail? }]; an empty list means «nothing wrong found», never «true». */
function spatialDefects(value, kernels) {
  const defects = [];
  const sp = findSpatial(value);
  sp.pairs.forEach((p) => {
    const lat = asNum(p.lat), lon = asNum(p.lon);
    if (!isNum(lat) || !isNum(lon)) defects.push({ check: 'coordinates', code: 'coordinate_not_a_number', path: p.path, detail: { lat: p.lat, lon: p.lon } });
    else if (lat < -90 || lat > 90) defects.push({ check: 'coordinates', code: 'latitude_out_of_range', path: p.path, detail: { lat } });
    else if (lon < -180 || lon > 180) defects.push({ check: 'coordinates', code: 'longitude_out_of_range', path: p.path, detail: { lon } });
  });
  const geometry = kernels && kernels.geometry;
  if (geometry && typeof geometry.validate === 'function') {
    sp.geoms.forEach((g) => {
      let r = null;
      try { r = geometry.validate(g.geometry, { limit: 20 }); } catch (_) { r = null; }
      if (!r || r.ok !== true || !r.value) return;   /* the kernel could not read it: nothing is said */
      (r.value.problems || []).forEach((p) => defects.push({ check: 'geometry', code: s(p.code, 60), path: g.path, detail: { vertex: p.vertex, path: p.path } }));
    });
  }
  return defects;
}

const subjectKey = (f) => {
  const sub = f && f.subject ? f.subject : {};
  if (sub.ref) return 'ref:' + sub.ref;
  if (sub.ids) { const k = Object.keys(sub.ids).sort()[0]; if (k) return 'id:' + k + ':' + sub.ids[k]; }
  return 'name:' + fold(sub.name);
};

/* the defects a program finds in the FACTS of a result: a unit nothing parses, and one quantity stated in units of different
   dimensions. A different unit of the SAME dimension is not a defect (the figures are comparable — fact-merge measures the gap). */
function factDefects(facts, kernels) {
  const defects = [];
  const units = kernels && kernels.units;
  if (!units || typeof units.parse !== 'function') return defects;
  const dimsOf = new Map();   /* subject|attribute → Map(dimension key → unit) */
  (Array.isArray(facts) ? facts : []).forEach((f, i) => {
    if (!f || f.unit == null || String(f.unit).trim() === '') return;
    let p = null;
    try { p = units.parse(f.unit); } catch (_) { p = null; }
    if (!p) { defects.push({ check: 'units', code: 'unit_unknown', path: 'facts[' + i + ']', detail: { unit: s(f.unit, 40) }, soft: true }); return; }
    const key = subjectKey(f) + '|' + fold(f.attribute);
    const dk = JSON.stringify(p.d);
    if (!dimsOf.has(key)) dimsOf.set(key, new Map());
    dimsOf.get(key).set(dk, s(f.unit, 40));
  });
  dimsOf.forEach((m, key) => {
    if (m.size > 1) defects.push({ check: 'units', code: 'unit_dimension_mismatch', path: key.split('|')[1], detail: { units: Array.from(m.values()) } });
  });
  return defects;
}

/* decideClaims(result, kernels) → what the program found, per claim id:
     { byClaim: { <id>: { verdict:'contradicted', defects:[…] } | { passed:[check names] } },
       resultDefects: [...]   defects in values not tied to one claim (the task's data, its facts)
       undecided: [ids]       claims the model should be asked about }
   A claim is decided only when a check found a DEFECT in the value it carries; `soft` defects (a unit no table knows) are
   reported but never contradict — not knowing a unit is the program's gap, not the worker's error. */
export function decideClaims(result, kernels) {
  const claims = claimsOf(result);
  const byClaim = {};
  const undecided = [];
  claims.forEach((c) => {
    const defects = spatialDefects(c.finding, kernels);
    if (defects.length) byClaim[c.id] = { verdict: 'contradicted', basis: 'program', defects };
    else {
      const sp = findSpatial(c.finding);
      if (sp.geoms.length || sp.pairs.length) { byClaim[c.id] = { passed: ['structure'] }; c.passed = true; }
      undecided.push(c.id);
    }
  });
  const resultDefects = [];
  const dataD = spatialDefects(result && result.data, kernels);
  dataD.forEach((d) => resultDefects.push(d));
  factDefects(result && result.facts, kernels).forEach((d) => resultDefects.push(d));
  const out = { byClaim, resultDefects, undecided: undecided.filter((id) => !(byClaim[id] && byClaim[id].verdict)) };
  out.needsModel = out.undecided.length > 0;
  out.claims = claims;
  return out;
}

/* the goal a checking worker is given: the claims with their ids, only the ones a program did not decide */
export function checkerGoal(taskId, claims, extra) {
  const lines = claims.map((c) => '[' + c.id + '] ' + c.claim + (c.passed ? '   (its coordinates / shapes passed the structure checks: do not re-check them, check whether they are the right ones)' : ''));
  return 'Independently check the claims worker "' + s(taskId, 64) + '" returned, using different sources from the ones it cited where you can. '
    + 'Spend your effort on what a program cannot decide: whether a source really says it, why something happened, how far a publisher can be trusted, an argument that needs several steps.\n'
    + 'The claims, each with its id:\n' + lines.join('\n') + '\n'
    + 'For each claim return ONE finding with "id" set to the claim\'s id exactly as written above, "claim" the claim, "verdict" "supported" / "unsupported" / "contradicted", "source" the URL you found it at (or the capability id you ran), and "excerpt" what you checked it against: the source\'s own words verbatim, or the raw values the capability returned. '
    + 'A "supported" with no source and excerpt is counted as your agreement, not as a check. '
    + 'List in "gaps" every id you could not check.' + (extra ? '\n' + s(extra, 600) : '');
}

