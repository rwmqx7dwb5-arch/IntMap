/* ============================================================================
 *  IntMap · Atlas fact merge — what several workers STATED about the same real-world object   (js/atlas-fact-merge.js)
 * ----------------------------------------------------------------------------
 *  integrate() in js/atlas-orchestrate.js compares the TEXT of findings. «Port of Rotterdam handled 14.4 Mt» and
 *  「ロッテルダム港の取扱量は1440万トン」 are two different strings about one object, so text comparison can neither fold
 *  them nor see that two workers disagree. A worker may therefore also return `facts` — a claim written as data:
 *
 *    { subject: { ref?, ids?, name? }, attribute, value, unit?, at?, source?, retrievedAt?, evidenceId? }
 *
 *    subject.ref      the world-graph ref (`facility:wd-Q123`) — the object itself
 *    subject.ids      external identifiers ({ wikidata:'Q123', osm:'node/5' }) — two facts that share one are ONE object
 *    subject.name     a name in any script, when the worker has neither: it is RESOLVED, never compared as text
 *    attribute        what is stated («throughput», «operator», «population»)
 *    value / unit     the figure or word, and its unit (a different unit is reported, not converted)
 *    at               the moment the value is about (ISO date / year) — NOT when it was read
 *    source           the URL the worker read it from       retrievedAt   when it read it
 *    evidenceId       the Evidence record that vouches for it (js/atlas-evidence.js), when one exists
 *
 *  mergeFacts(results, { resolve }) groups the facts of every usable result by OBJECT and then by ATTRIBUTE and says, for
 *  each row, one of:
 *    agree     two or more workers stated the same value (same unit, same time)
 *    conflict  they stated different values — every observation is returned WITH its source and evidence id
 *    single    one worker stated it: nothing checked it (that is not agreement)
 *  and, on any row, `missingFrom`: workers that covered the object (stated something about it) but not this attribute.
 *
 *  ⚠ WHO IS THE OBJECT IS NOT DECIDED HERE (.agents/rules/no-ad-hoc-hardcoding.md). There is no list of names and no
 *  alias table in this file. A subject is identified by, in this order: its ref; an external id it shares with another
 *  fact; the `resolve(subject)` the caller hands in (the page passes the session's world-object index and the persistent
 *  graph — js/atlas-world-objects.js, js/world-graph-store.js). A name nothing resolves stays its own object
 *  (`resolved:false`) — grouped only with the same folded spelling — and is listed so Atlas can see it was not folded.
 *  ⚠ NOTHING IS A VERDICT. Two values that differ may be two true things (different scopes); the rows carry the values,
 *  the units, the times and the evidence, and Atlas decides. A relative difference is MEASURED (`relDiff`), not judged.
 *
 *  Pure: no DOM, no network, no globals. `resolve` is the only door to the outside and may be async.
 * ==========================================================================*/
import { makeAtlasGeoObject } from './atlas-geo-object.js';

const geo = makeAtlasGeoObject();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const USABLE = (st) => st === 'done' || st === 'partial';
const fold = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const REF = /^[a-z_]+:.{1,200}$/;

/* normalizeFact(f) → a clean fact, or null when it states nothing checkable (no subject, no attribute or no value).
   A field the worker did not give stays absent: no default time, no default unit. */
export function normalizeFact(f) {
  if (!f || typeof f !== 'object') return null;
  const sub = (f.subject && typeof f.subject === 'object') ? f.subject : (typeof f.subject === 'string' ? { name: f.subject } : null);
  if (!sub) return null;
  const subject = {};
  const ref = s(sub.ref, 200); if (REF.test(ref)) subject.ref = ref;
  const ids = geo.cleanExtIds(sub.ids); if (Object.keys(ids).length) subject.ids = ids;
  const name = s(sub.name, 200); if (name) subject.name = name;
  if (!subject.ref && !subject.ids && !subject.name) return null;
  const attribute = s(f.attribute, 80); if (!fold(attribute)) return null;
  const v = f.value;
  const value = typeof v === 'number' ? (isFinite(v) ? v : undefined) : (typeof v === 'boolean' ? v : (typeof v === 'string' && v.trim() ? s(v, 300) : undefined));
  if (value === undefined) return null;
  const out = { subject, attribute, value };
  const unit = s(f.unit, 40); if (unit) out.unit = unit;
  const at = geo.timeMs(f.at); if (at != null) out.at = typeof f.at === 'number' ? new Date(at).toISOString() : s(f.at, 40);
  const source = s(f.source, 500); if (source) out.source = source;
  const rt = s(f.retrievedAt, 40); if (rt && geo.timeMs(rt) != null) out.retrievedAt = rt;
  const ev = s(f.evidenceId, 80); if (ev) out.evidenceId = ev;
  return out;
}

/** a worker's `facts` as clean facts (anything that states nothing checkable is dropped, and counted by the caller if it cares) */
export function normalizeFacts(list) { return (Array.isArray(list) ? list : []).map(normalizeFact).filter(Boolean); }

const idKeys = (subject) => Object.keys(subject.ids || {}).map((k) => k + ':' + subject.ids[k]);
const valueKey = (f) => (typeof f.value === 'number' ? 'n:' + String(f.value) : typeof f.value === 'boolean' ? 'b:' + f.value : 's:' + fold(f.value)) + '|' + fold(f.unit);

/* mergeFacts(results, opts?) → { objects, counts, unresolved }
     results          makeDelegation().run() output; only usable results are read
     opts.resolve     (subject) → { ref, name? } | null, sync or async — «which object does this name / these ids denote»
   Never throws on a resolver that throws: that subject is `resolved:false, resolveFailed:true` (observed, not guessed). */
export async function mergeFacts(results, opts) {
  const o = opts || {};
  const obs = [];
  (Array.isArray(results) ? results : []).forEach((r) => {
    if (!r || typeof r !== 'object' || !USABLE(r.state)) return;
    normalizeFacts(r.facts).forEach((f) => obs.push(Object.assign({}, f, { task: r.id })));
  });

  /* 1 · resolve each distinct subject once (a name or an id set that no fact states a ref for) */
  const memo = new Map();
  const resolveOnce = (subject) => {
    if (subject.ref || typeof o.resolve !== 'function') return Promise.resolve({ ref: subject.ref || null, failed: false });
    const k = JSON.stringify([subject.ids || null, fold(subject.name)]);
    if (!memo.has(k)) memo.set(k, Promise.resolve().then(() => o.resolve(subject)).then(
      (hit) => ({ ref: hit && REF.test(String(hit.ref || '')) ? String(hit.ref) : null, name: hit && hit.name ? s(hit.name, 200) : undefined, failed: false }),
      () => ({ ref: null, failed: true })));
    return memo.get(k);
  };
  const resolved = await Promise.all(obs.map((f) => resolveOnce(f.subject)));

  /* 2 · identity: union facts that share a ref or an external id (a resolved ref and a stated ref are the same key) */
  const parent = new Map();
  const find = (x) => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const keyOf = obs.map((f, i) => {
    const rr = resolved[i];
    const ref = f.subject.ref || rr.ref;
    const own = ref ? 'ref:' + ref : (idKeys(f.subject)[0] ? 'id:' + idKeys(f.subject)[0] : 'name:' + fold(f.subject.name));
    find(own);
    idKeys(f.subject).forEach((k) => union(own, 'id:' + k));
    return own;
  });
  const groups = new Map();   // root → { facts: [index] }
  keyOf.forEach((k, i) => { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });

  const objects = [];
  const counts = { agree: 0, conflict: 0, single: 0, missing: 0 };
  const unresolved = [];
  groups.forEach((idx, root) => {
    const fs = idx.map((i) => obs[i]);
    const refs = Array.from(new Set(idx.map((i) => obs[i].subject.ref || resolved[i].ref).filter(Boolean)));
    const names = Array.from(new Set(fs.map((f) => f.subject.name).filter(Boolean)));
    const ids = {}; fs.forEach((f) => Object.assign(ids, f.subject.ids || {}));
    const isResolved = refs.length > 0;
    const covered = Array.from(new Set(fs.map((f) => f.task)));
    const failed = idx.some((i) => resolved[i].failed);
    if (!isResolved) unresolved.push({ names, ids: Object.keys(ids).length ? ids : undefined, tasks: covered, resolveFailed: failed || undefined });

    /* attribute × time rows. A fact with no `at` is its own row: «no time stated» is not assumed to equal a stated one. */
    const rows = new Map();
    fs.forEach((f) => {
      const k = fold(f.attribute) + '|' + (f.at ? String(geo.timeMs(f.at)) : '');
      if (!rows.has(k)) rows.set(k, { attribute: f.attribute, at: f.at, facts: [] });
      rows.get(k).facts.push(f);
    });
    const attrTasks = new Map();   // attribute (folded) → tasks that stated it at any time
    fs.forEach((f) => { const a = fold(f.attribute); if (!attrTasks.has(a)) attrTasks.set(a, new Set()); attrTasks.get(a).add(f.task); });

    const attributes = [];
    rows.forEach((row) => {
      const byValue = new Map();
      row.facts.forEach((f) => {
        const k = valueKey(f);
        if (!byValue.has(k)) byValue.set(k, { value: f.value, unit: f.unit, tasks: [], observations: [] });
        const v = byValue.get(k);
        if (v.tasks.indexOf(f.task) < 0) v.tasks.push(f.task);
        v.observations.push({ task: f.task, name: f.subject.name, source: f.source, evidenceId: f.evidenceId, retrievedAt: f.retrievedAt });
      });
      const values = Array.from(byValue.values());
      const tasks = Array.from(new Set(row.facts.map((f) => f.task)));
      const units = new Set(values.map((v) => fold(v.unit)));
      let status = values.length > 1 ? 'conflict' : (tasks.length >= 2 ? 'agree' : 'single');
      const entry = { attribute: row.attribute, at: row.at, status, values, tasks };
      if (status === 'conflict') {
        if (units.size > 1) entry.unitMismatch = true;   /* 300 000 TEU and 3 Mt are not a disagreement, they are not comparable yet */
        const nums = values.filter((v) => typeof v.value === 'number');
        if (!entry.unitMismatch && nums.length === values.length) {
          const hi = Math.max.apply(null, nums.map((v) => Math.abs(v.value))), lo = Math.min.apply(null, nums.map((v) => Math.abs(v.value)));
          if (hi > 0) entry.relDiff = (hi - lo) / hi;
        }
      }
      const stated = attrTasks.get(fold(row.attribute));
      const miss = covered.filter((t) => !stated.has(t));
      if (miss.length) { entry.missingFrom = miss; counts.missing += 1; }
      counts[status] += 1;
      attributes.push(entry);
    });
    objects.push({ ref: refs[0], refs: refs.length > 1 ? refs : undefined, resolved: isResolved, names, ids: Object.keys(ids).length ? ids : undefined, tasks: covered, attributes });
  });
  return { objects, counts, unresolved };
}

/* makeFactResolver({ find, findPersisted }) — the `resolve` mergeFacts takes, built from the two lookups IntMap already has:
     find(query)             → world object | null   the session index (W.find: a ref, «wikidata:Q123», an exact or contained name)
     findPersisted(query)    → Promise<object | null> the persistent graph (G.findPersisted, exact name / id)
   An external id is asked first (it is a key; a name is a spelling), then the name. Neither finds → null: not guessed. */
export function makeFactResolver(deps) {
  const d = deps || {};
  const keyed = (sub) => Object.keys(sub.ids || {}).map((k) => k + ':' + sub.ids[k]);
  return async function resolve(subject) {
    const asks = keyed(subject).concat(subject.name ? [subject.name] : []);
    for (const q of asks) {
      const hit = typeof d.find === 'function' ? d.find(q) : null;
      if (hit && hit.ref) return { ref: hit.ref, name: hit.name };
    }
    if (typeof d.findPersisted === 'function') {
      for (const q of asks) {
        const hit = await d.findPersisted(q);
        if (hit && hit.ref) return { ref: hit.ref, name: hit.name };
      }
    }
    return null;
  };
}
