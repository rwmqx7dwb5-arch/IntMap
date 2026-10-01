#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/world-at-time.mjs — WHAT THE MAP AT AN INSTANT DRAWS, AND ON WHOSE WORD
 * ----------------------------------------------------------------------------
 *  The instrument for js/layer-time.js / js/layer-time-decl.js (world-at-time). It does two things:
 *
 *   --check   the gate (tests/world-at-time-checks.test.mjs runs it):
 *               · every layer of js/layer-manifest.js has a time declaration, and nothing else does
 *               · every declaration passes the rule's own `validate` (closed kinds, en + jp, a bound
 *                 with no author is refused)
 *               · every `by` that names a repository file names one that exists, and a `self` names a
 *                 file and a symbol that are in it — a declaration cannot cite a place that is not there
 *               · a snapshot that names its bundle states the period that bundle's own governance
 *                 record states as its cadence (js/data-governance.js is the one owner of cadence)
 *   --year Y  the enumeration .agents/rules/historical-verification.md §2 ① asks for: for one instant,
 *             every layer as drawn / drawn from another date / not drawn, with the reason.
 *             `--years` runs the key years (-200 1000 1600 1871 1900 1918 1945 2000 now).
 *
 *  ⚠ WHAT THIS CANNOT SEE: whether a module really draws nothing outside the range it declares. That
 *  is measured on the page (tests/restored-layer-before-style.spec.js, and the run recorded in
 *  dev-notes/2026-10-01-world-at-time.md) — a gate that reads declarations only holds declarations
 *  to themselves ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

export const KEY_YEARS = Object.freeze([-200, 1000, 1600, 1871, 1900, 1918, 1945, 2000, 'now']);

/** the files a `by` / `self` names: every token that looks like a repository path */
const pathsIn = (s) => (String(s || '').match(/(?:js|data|scripts|docs|supabase)\/[A-Za-z0-9_./-]+/g) || []).map((p) => p.replace(/[.,;:)]+$/, ''));

export async function check(opts) {
  const o = opts || {};
  const { LAYERS } = await imp('js/layer-manifest.js');
  const { TIME } = await imp('js/layer-time-decl.js');
  const { validate, resolve } = await imp('js/layer-time.js');
  const problems = [];
  const ids = new Set(LAYERS.map((l) => l.id));
  for (const id of ids) if (!TIME[id]) problems.push(id + ': no time declaration (js/layer-time-decl.js) — every layer says what time its source can state');
  for (const id of Object.keys(TIME)) if (!ids.has(id)) problems.push(id + ': declared but not a layer of js/layer-manifest.js');
  for (const [id, d] of Object.entries(TIME)) {
    problems.push(...validate(id, d));
    for (const p of [...pathsIn(d.by), ...pathsIn(d.self), ...pathsIn(d.reports), ...pathsIn(d.follows), ...pathsIn(d.entry), ...pathsIn(d.ownDate), ...pathsIn(d.bundle)]) {
      const abs = path.join(ROOT, p);
      /* a data/ path names a SUBJECT (data/x → data/x.json, data/x.js, data/x/…); a code path names a file */
      const exists = fs.existsSync(abs) || (p.startsWith('data/') && fs.readdirSync(path.dirname(abs), { withFileTypes: true }).some((e) => e.name.startsWith(path.basename(abs) + '.') || (e.isDirectory() && e.name === path.basename(abs))));
      if (!exists) problems.push(id + ': cites ' + p + ', which is not in the repository');
    }
    for (const field of ['self', 'follows', 'entry', 'ownDate', 'reports']) {
      const m = String(d[field] || '').match(/^(js\/[A-Za-z0-9_./-]+\.js)\s+([A-Za-z_$][\w$.]*)/);
      if (d[field] && !m) { problems.push(id + ': `' + field + '` is «<file> <symbol>» — «' + d[field] + '»'); continue; }
      if (m && fs.existsSync(path.join(ROOT, m[1]))) {
        const sym = m[2].split('.').pop();
        if (!fs.readFileSync(path.join(ROOT, m[1]), 'utf8').includes(sym)) problems.push(id + ': `' + field + '` names ' + m[2] + ', which ' + m[1] + ' does not contain');
      }
    }
  }
  /* a bound written as a value and CITED: the file it cites must state the same value today */
  const cached = {};
  const fileOf = (f) => { if (!(f in cached)) { try { cached[f] = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (_) { cached[f] = null; } } return cached[f]; };
  for (const [id, d] of Object.entries(TIME)) {
    if (!d.cite) continue;
    for (const [k, ptr] of Object.entries(d.cite)) {
      const file = String(ptr).split('#')[0];
      const got = resolve({ [k]: ptr }, { [file]: fileOf(file) })[k];
      if (got === 'runtime') problems.push(id + ': cite.' + k + ' ' + ptr + ' holds no date');
      else if (String(got) !== String(d[k])) problems.push(id + ': ' + k + ' is ' + d[k] + ' but ' + ptr + ' says ' + got);
    }
  }
  if (o.cadence !== false) {
    let gov = null;
    try { gov = (await imp('scripts/data-governance.mjs')).builderDeclarations(); } catch (_) { gov = null; }
    if (gov) {
      const { read } = await imp('js/data-governance.js');
      const cadenceOf = new Map();
      for (const b of gov) {
        const v = b.declaration; if (!v) continue;
        const per = (p) => (v && typeof v === 'object' && v[p] && typeof v[p] === 'object' ? v[p] : v);
        for (const p of b.paths || []) { try { const c = read(per(p)).cadence; if (c != null) cadenceOf.set(p.replace(/\.(json|js|geojson|gz|bin|pbf)(\.gz)?$/, ''), String(c)); } catch (_) { /* unreadable — data-governance's own gate says so */ } }
      }
      for (const [id, d] of Object.entries(TIME)) {
        if (!d.bundle || d.period == null) continue;
        const c = cadenceOf.get(String(d.bundle).replace(/\.(json|js|geojson|gz)(\.gz)?$/, ''));
        if (c != null && c !== String(d.period)) problems.push(id + ': period ' + d.period + ' ≠ the cadence ' + c + ' that ' + d.bundle + "'s governance record states");
      }
    }
  }
  /* ⚠ ON THE LIVE CLOCK ONLY A LAYER THAT OPENS ON ITS OWN RECORD MAY BE HELD. The kernel holds a row on the
     present as on any instant, so a modern layer declared «unstated now» would vanish from today's map — a
     declaration error, not a fact about the source. A war row is the one kind this is right for: its record
     ended, its tick moves the clock into it (`entry`). */
  const nowEnum = await enumerate('now');
  for (const r of nowEnum.rows) if (r.held && !(TIME[r.id] && TIME[r.id].entry)) problems.push(r.id + ': held back on the live clock (' + r.reason + ') — a layer of today must state the present');
  return { layers: ids.size, declared: Object.keys(TIME).length, problems };
}

/** the enumeration for one instant (a year, 'now', or an ISO date) */
export async function enumerate(when, opts) {
  const o = opts || {};
  const { LAYERS } = await imp('js/layer-manifest.js');
  const { TIME } = await imp('js/layer-time-decl.js');
  const { verdict, explain, toMs, withholds, resolve, pointerFiles } = await imp('js/layer-time.js');
  /* the files a bound points into, read from disk — the same files the kernel fetches */
  const files = {};
  for (const f of new Set(Object.values(TIME).flatMap(pointerFiles))) {
    try { files[f] = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (_) { /* unread → «range not yet read» */ }
  }
  const now = o.now != null ? toMs(o.now) : Date.now();
  const at = when === 'now' || when == null ? { when: now, live: true, now }
    : { when: (typeof when === 'number' ? toMs(when) + 165 * 86400000 + 43200000 : toMs(when)), live: false, now };
  const rows = LAYERS.map((l) => {
    const d = TIME[l.id] ? resolve(TIME[l.id], files) : null;
    const v = d ? verdict(d, at, {}) : { status: 'unknown', reason: 'undeclared' };
    return { id: l.id, self: !!(d && d.self), kind: d ? d.kind : null, status: v.status, reason: v.reason, held: d ? withholds(d, v) : false, why: d ? explain(d, v, at).en : '' };
  });
  const tally = rows.reduce((t, r) => { t[r.status] = (t[r.status] || 0) + 1; return t; }, {});
  return { when: when == null ? 'now' : when, tally, rows };
}

async function main() {
  const a = process.argv.slice(2);
  if (a.includes('--check')) {
    const r = await check();
    if (r.problems.length) { console.error('world-at-time: ' + r.problems.length + ' problem(s)\n  ' + r.problems.join('\n  ')); process.exit(1); }
    console.log('world-at-time: ' + r.declared + ' of ' + r.layers + ' layers declare what time their source states — ok');
    return;
  }
  const yi = a.indexOf('--year');
  const years = a.includes('--years') ? KEY_YEARS : yi >= 0 ? [a[yi + 1] === 'now' ? 'now' : (/^-?\d+$/.test(a[yi + 1]) ? +a[yi + 1] : a[yi + 1])] : ['now'];
  const json = a.includes('--json');
  const out = [];
  for (const y of years) out.push(await enumerate(y));
  if (json) { console.log(JSON.stringify(out, null, 1)); return; }
  for (const e of out) {
    console.log('\n== ' + e.when + ' — ' + Object.entries(e.tally).map(([k, v]) => k + ' ' + v).join(' · '));
    if (a.includes('--brief')) continue;
    for (const r of e.rows.filter((x) => x.status !== 'stated')) console.log('  ' + r.status.padEnd(9) + (r.held ? ' held ' : r.self ? ' self ' : '      ') + r.id.padEnd(22) + r.why);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
