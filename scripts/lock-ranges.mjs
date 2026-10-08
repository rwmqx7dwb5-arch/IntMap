/* ============================================================================
 *  IntMap · EVERY LOCKED PACKAGE MEETS THE RANGE ITS DEPENDENTS DECLARE   (security-hardening)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-08. package-lock.json pinned dompurify 3.4.13 while the package that ships it to the
 *  browser — @cesium/engine 26.3.0, the 3-D engine — declares `"dompurify": "^3.4.14"`. The lock had been
 *  merged by hand (#770: the Dependabot group was taken, one of its three updates put back) and the floor
 *  Cesium had raised was never applied. `npm ci` installs what the lock says and does not re-check a
 *  nested range against it, so every CI run and every deploy since 2026-09-26 built the site with a
 *  version below its own dependent's floor — and 3.4.13 is inside two published DOMPurify advisories
 *  (GHSA-p98j-92pf-mc4p, GHSA-6688-9rhm-gjv2) that 3.4.16 closes. Nothing watched for it: Dependabot
 *  alerts are DISABLED on the repository (`GET /repos/…/vulnerability-alerts` → 404, the same day).
 *
 *  The defect is not «one package is old». It is «the lock can contradict the packages it locks, and
 *  nothing reads the contradiction». So this reads every dependency edge the lock records and asks the
 *  one question npm ci does not: does the version the lock resolves for that name meet the range the
 *  dependent declared? It is pure data — no network, no node_modules — so it runs in check:static.
 *
 *  RESOLUTION is Node's: a package at `node_modules/a/node_modules/b` finds `c` at
 *  `node_modules/a/node_modules/b/node_modules/c`, then `node_modules/a/node_modules/c`, then
 *  `node_modules/c`. A `link` entry stands for its target.
 *
 *  RANGES are node-semver's grammar for the forms a lock contains: `||`, hyphen ranges, space-joined
 *  comparators, `^` `~` `~>` `<` `<=` `>` `>=` `=`, partial and x-range versions, and the prerelease rule
 *  (a prerelease satisfies a set only when a comparator of that set names the same major.minor.patch
 *  with a prerelease). A spec that is not a range (a tarball URL, `npm:` alias, git or file) is judged
 *  by what it names: a URL must equal the entry's `resolved`; an alias is judged by its own range;
 *  anything else is returned as UNJUDGED and the caller refuses it — a gate that cannot read a spec
 *  must say so, not pass it (.agents/rules/one-pass-or-a-reason.md §5).
 * ============================================================================ */

const VER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** parseVersion('1.2.3-alpha.1') → { major, minor, patch, pre: ['alpha', 1] } or null */
export function parseVersion(v) {
  const m = VER.exec(String(v || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.').map((x) => (/^\d+$/.test(x) ? +x : x)) : [] };
}

function cmpPre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;           /* a release is greater than any of its prereleases */
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i], y = b[i];
    if (x === y) continue;
    const xn = typeof x === 'number', yn = typeof y === 'number';
    if (xn && !yn) return -1;
    if (!xn && yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
export function compare(a, b) {
  return (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch) || cmpPre(a.pre, b.pre);
}

/* a partial version: '1', '1.2', '1.x', '*', '1.2.3-beta' → { parts:[…numbers up to 3], pre } (x / * / X end it) */
function parsePartial(s) {
  s = String(s).trim().replace(/^v/, '').replace(/^=/, '');
  if (s === '' || s === '*' || /^[xX]$/.test(s)) return { parts: [], pre: [] };
  const m = /^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(s);
  if (!m) return null;
  const parts = [];
  for (const p of [m[1], m[2], m[3]]) { if (p == null || /^[xX*]$/.test(p)) break; parts.push(+p); }
  return { parts, pre: m[4] && parts.length === 3 ? m[4].split('.').map((x) => (/^\d+$/.test(x) ? +x : x)) : [] };
}
const V = (major, minor, patch, pre) => ({ major, minor, patch, pre: pre || [] });
/* the lowest version of the next major/minor — written as a 0 prerelease so `<` excludes its prereleases */
const below = (major, minor) => V(major, minor, 0, [0]);

/* one comparator token → a list of [op, version] bounds (desugared the way node-semver does) */
function comparator(tok) {
  const m = /^(<=|>=|<|>|=|\^|~>|~)?\s*(.*)$/.exec(tok.trim());
  const op = m[1] || '';
  const p = parsePartial(m[2]);
  if (!p) return null;
  const [M, mi, pa] = p.parts, n = p.parts.length;
  if (op === '^') {
    if (n === 0) return [];
    if (n === 1) return [['>=', V(M, 0, 0)], ['<', below(M + 1, 0)]];
    if (n === 2) return M > 0 ? [['>=', V(M, mi, 0)], ['<', below(M + 1, 0)]] : [['>=', V(0, mi, 0)], ['<', below(0, mi + 1)]];
    const lo = V(M, mi, pa, p.pre);
    if (M > 0) return [['>=', lo], ['<', below(M + 1, 0)]];
    if (mi > 0) return [['>=', lo], ['<', below(0, mi + 1)]];
    return [['>=', lo], ['<', V(0, 0, pa + 1, [0])]];
  }
  if (op === '~' || op === '~>') {
    if (n === 0) return [];
    if (n === 1) return [['>=', V(M, 0, 0)], ['<', below(M + 1, 0)]];
    return [['>=', V(M, mi, n === 3 ? pa : 0, p.pre)], ['<', below(M, mi + 1)]];
  }
  if (op === '' || op === '=') {
    if (n === 0) return [];
    if (n === 1) return [['>=', V(M, 0, 0)], ['<', below(M + 1, 0)]];
    if (n === 2) return [['>=', V(M, mi, 0)], ['<', below(M, mi + 1)]];
    return [['=', V(M, mi, pa, p.pre)]];
  }
  /* <, <=, >, >= with a partial version */
  if (n === 3) return [[op, V(M, mi, pa, p.pre)]];
  if (n === 0) return op === '<' || op === '>' ? [['<', V(0, 0, 0, [0])]] : [];
  const lo = n === 1 ? V(M, 0, 0) : V(M, mi, 0);
  const next = n === 1 ? below(M + 1, 0) : below(M, mi + 1);
  if (op === '>=') return [['>=', lo]];
  if (op === '<') return [['<', lo.pre.length ? lo : V(lo.major, lo.minor, lo.patch, [0])]];
  if (op === '>') return [['>=', next]];
  return [['<', next]];   /* <= */
}

/** parseRange('^1.2.0 || >=3') → array of comparator sets, or null if a token is not a range */
export function parseRange(range) {
  const sets = [];
  for (const raw of String(range).split('||')) {
    let s = raw.trim();
    const hy = /^(\S+)\s+-\s+(\S+)$/.exec(s);
    if (hy) {
      const a = parsePartial(hy[1]), b = parsePartial(hy[2]);
      if (!a || !b) return null;
      const set = [];
      if (a.parts.length) set.push(['>=', V(a.parts[0], a.parts[1] || 0, a.parts[2] || 0, a.pre)]);
      if (b.parts.length === 3) set.push(['<=', V(b.parts[0], b.parts[1], b.parts[2], b.pre)]);
      else if (b.parts.length === 2) set.push(['<', below(b.parts[0], b.parts[1] + 1)]);
      else if (b.parts.length === 1) set.push(['<', below(b.parts[0] + 1, 0)]);
      sets.push(set);
      continue;
    }
    s = s.replace(/(<=|>=|<|>|=|\^|~>|~)\s+/g, '$1');
    const set = [];
    for (const tok of s.split(/\s+/).filter(Boolean)) {
      const c = comparator(tok);
      if (!c) return null;
      set.push(...c);
    }
    sets.push(set);
  }
  return sets;
}

function test(op, v, b) {
  const c = compare(v, b);
  return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '>=' ? c >= 0 : c === 0;
}
/** satisfies('3.4.13', '^3.4.14') → false; null when either side cannot be read */
export function satisfies(version, range) {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  const sets = parseRange(range);
  if (!v || !sets) return null;
  return sets.some((set) => {
    if (!set.every(([op, b]) => test(op, v, b))) return false;
    if (!v.pre.length) return true;
    /* node-semver: a prerelease only matches a comparator that names the same tuple with a prerelease
       (the 0-prerelease bounds `below()` writes are exclusion markers, not such a naming) */
    return set.some(([, b]) => b.pre.length && !(b.pre.length === 1 && b.pre[0] === 0)
      && b.major === v.major && b.minor === v.minor && b.patch === v.patch);
  });
}

/* Node's lookup: the nearest node_modules/<name> at or above the dependent's own directory */
function resolveIn(packages, from, name) {
  let base = from;
  for (;;) {
    const key = (base ? base + '/' : '') + 'node_modules/' + name;
    if (packages[key]) {
      const e = packages[key];
      return e.link && e.resolved && packages[e.resolved] ? { key: e.resolved, entry: packages[e.resolved] } : { key, entry: e };
    }
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i < 0 ? '' : base.slice(0, i);
  }
}

/**
 * lockEdges(lock) → { edges, unmet, unjudged, missing }
 *   edges     how many (dependent, dependency) edges were read
 *   unmet     [{ from, name, range, locked }] — the lock resolves a version outside the declared range
 *   unjudged  [{ from, name, spec, why }]     — a spec this cannot read; the caller must refuse it
 *   missing   [{ from, name, spec }]          — a required dependency the lock does not hold at all
 */
export function lockEdges(lock) {
  const packages = (lock && lock.packages) || {};
  const out = { edges: 0, unmet: [], unjudged: [], missing: [] };
  for (const [from, entry] of Object.entries(packages)) {
    if (entry.link) continue;   /* the target's own entry carries its dependencies */
    const optionalPeers = new Set(Object.entries(entry.peerDependenciesMeta || {}).filter(([, m]) => m && m.optional).map(([k]) => k));
    const kinds = [
      ['dependencies', false], ['optionalDependencies', true], ['peerDependencies', null],
      ...(from === '' ? [['devDependencies', false]] : []),
    ];
    for (const [kind, optional] of kinds) {
      for (const [name, spec0] of Object.entries(entry[kind] || {})) {
        const isOptional = optional === null ? optionalPeers.has(name) : optional;
        const hit = resolveIn(packages, from, name);
        out.edges++;
        if (!hit) {
          /* an optional dependency for another platform, or an optional peer nobody installed */
          if (!isOptional && kind !== 'peerDependencies') out.missing.push({ from: from || '(root)', name, spec: spec0 });
          continue;
        }
        let spec = String(spec0);
        const alias = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/.exec(spec);
        if (alias) spec = alias[2];
        if (/^(?:https?:|git\+|git:|github:|file:)/.test(spec)) {
          if (spec !== hit.entry.resolved) out.unjudged.push({ from: from || '(root)', name, spec: spec0, why: 'the spec names a source the lock entry does not resolve to (' + (hit.entry.resolved || 'nothing') + ')' });
          continue;
        }
        const ok = satisfies(hit.entry.version, spec);
        if (ok === null) { out.unjudged.push({ from: from || '(root)', name, spec: spec0, why: 'not a version range this reads, or the locked version ' + hit.entry.version + ' is not a version' }); continue; }
        if (!ok) out.unmet.push({ from: from || '(root)', name, range: spec0, locked: hit.entry.version, at: hit.key });
      }
    }
  }
  return out;
}

if (process.argv[1] && /lock-ranges\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const { readFileSync } = await import('node:fs');
  const r = lockEdges(JSON.parse(readFileSync(process.argv[2] || 'package-lock.json', 'utf8')));
  for (const u of r.unmet) console.log(`✗ ${u.from} wants ${u.name}@${u.range}, the lock holds ${u.locked} (${u.at})`);
  for (const u of r.unjudged) console.log(`? ${u.from} → ${u.name} «${u.spec}»: ${u.why}`);
  for (const u of r.missing) console.log(`∅ ${u.from} needs ${u.name}@${u.spec}, the lock has no such package`);
  console.log(`lock-ranges: ${r.edges} edges · ${r.unmet.length} unmet · ${r.unjudged.length} unjudged · ${r.missing.length} missing`);
  process.exit(r.unmet.length || r.unjudged.length || r.missing.length ? 1 : 0);
}
