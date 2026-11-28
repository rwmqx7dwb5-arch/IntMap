/* ============================================================================
 *  IntMap · js/atlas-result-reuse.js — the same analysis on the same data is answered, not recomputed  (result-reuse)
 * ----------------------------------------------------------------------------
 *  WHAT EXISTED: a repeat is recognised inside ONE turn (atlas-turn-results callKey / doneCalls) and inside one
 *  delegation (contractKey). Across turns nothing was: asking Atlas to run the same regression on the same table a
 *  second time started Pyodide's work again, minutes included.
 *
 *  THE IDENTITY OF A RESULT is what determines it, and only that:
 *    · the code or the operation's arguments, byte for byte;
 *    · the DATA it read — a fingerprint of the input records' contents, not their ids (an id survives an edit; a
 *      content hash does not), so a recomputed or edited input is a different key and the old result is not served;
 *    · the conditions it ran under (runtime + version, outputs asked for, timeout class).
 *  A hit is served only while the datasets it made are STILL in the registry and unchanged (`valid` below) —
 *  a removed or stale output is recomputed, never faked.
 *
 *  ⚠ A RESULT THAT DEPENDS ON SOMETHING OTHER THAN CODE AND DATA IS NOT REUSED. Python can read the clock and a
 *    random generator; the sandbox has no network, so these are the sources of a different answer from the same
 *    key. `reusableCode` names them; code that mentions one is run every time. (Not exhaustive by construction —
 *    anything it misses would have to be imported, and the list is the set of modules/calls that do that.)
 *  ⚠ NOT OBSERVED IS NOT A HIT. An input that cannot be fingerprinted (too large to hash, a chunked record that
 *    will not materialise) yields no key: the analysis runs. The cache is a shortcut, never a source of facts.
 *  Pure functions + an injected `sha256Hex` and clock: the node tests evaluate them.
 * ============================================================================ */

/* Python's sources of a different answer from identical code and data. Observation 2026-11-20: the sandbox exposes
   no network, storage or page (js/compute-sandbox.js header), leaving time and randomness. Expires if the sandbox
   is granted a new input channel — then add it here. */
const NONDETERMINISTIC = /\b(random|secrets|uuid\d?|time|datetime|date\.today|perf_counter|urandom|getrandbits|shuffle|rng|default_rng|RandomState|train_test_split|KMeans|GaussianMixture|RandomForest)\b/;
export function reusableCode(code) { return !NONDETERMINISTIC.test(String(code || '')); }

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/* Reuse only the bytes sent to the runtime, including dataset identity, fields and raster samples.
   Keep the existing hash budget; a larger payload runs once without adding hashing overhead. */
export async function fingerprintInput(json, sha256Hex) {
  return json.length <= 8e6 ? sha256Hex(json) : null;
}

/* reuseKey({ kind, spec, inputs:[fingerprint…], conditions }, sha256Hex) → hex | null (any input unhashable → null) */
export async function reuseKey(parts, sha256Hex) {
  if (!parts || !Array.isArray(parts.inputs) || parts.inputs.some((f) => !f)) return null;
  return await sha256Hex(stable({ kind: parts.kind, spec: parts.spec, inputs: parts.inputs, conditions: parts.conditions || null }));
}

/* a bounded, ordered store: the oldest entry leaves first */
export function makeResultReuse(opt) {
  const max = Number.isInteger(opt && opt.max) && opt.max > 0 ? opt.max : 32;
  const now = (opt && typeof opt.now === 'function') ? opt.now : () => Date.now();
  const m = new Map();
  let hits = 0, misses = 0, stale = 0, savedMs = 0;
  return {
    /* get(key, valid?) — `valid(entry)` is the caller's check that what the entry points at still exists unchanged */
    get(key, valid) {
      const e = key ? m.get(key) : null;
      if (!e) { misses++; return null; }
      let ok = true; try { ok = typeof valid === 'function' ? !!valid(e.value) : true; } catch (_) { ok = false; }
      if (!ok) { m.delete(key); stale++; return null; }
      hits++; savedMs += Math.max(0, Number(e.value && e.value.elapsedMs) || 0);
      return Object.assign({}, e.value, { reused: true, reusedAt: e.at });
    },
    put(key, value) { if (!key) return; m.delete(key); m.set(key, { value, at: now() }); while (m.size > max) m.delete(m.keys().next().value); },
    stats() { return { size: m.size, hits, misses, stale, savedMs }; },
    clear() { m.clear(); },
  };
}
