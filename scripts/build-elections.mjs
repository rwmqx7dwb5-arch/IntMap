#!/usr/bin/env node
/* ============================================================================
 *  IntMap · NATIONAL ELECTIONS — the build, and the gate that keeps it honest   (#R584)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  ══ WHAT IS A «PACK» ════════════════════════════════════════════════════════════════════════
 *  One file per polity in scripts/elections/, each exporting `build(ctx)` and returning the shapes
 *  in scripts/lib/elections-schema.mjs. ⚠ THE LIST OF PACKS IS NOT WRITTEN DOWN ANYWHERE. It is the
 *  contents of that directory, discovered at run time, because a written list is the thing that
 *  silently drops the tenth country (`.agents/rules/no-ad-hoc-hardcoding.md` §2.4).
 *
 *  ══ WHY --check DOES NOT GO TO THE NETWORK ══════════════════════════════════════════════════
 *  Because it has to run on every `npm test` and in CI, and it has to fail for one reason only:
 *  the committed data is not well formed. scripts/build-us-elections.mjs (#R243) wrote its --check
 *  as «re-fetch everything and diff», and the measured consequence is that it was never wired into
 *  a gate at all — 「⚠ その --check は package.json にも .github/workflows/ にも 1 件も配線されていない」
 *  — so for eighteen rounds nothing verified that layer's data. A gate nobody can afford to run is
 *  not a gate. This one is offline, takes milliseconds, and is in `npm test`.
 *
 *  What --check actually proves (all of it from the committed bytes):
 *    · every election names a polity, a results file and — if it has districts — a geometry file;
 *    · every district polygon has a result and every result has a polygon (BOTH directions: a
 *      missing polygon paints nothing, a missing result paints a HOLE, and a hole in a choropleth
 *      says «nobody won here», which is false);
 *    · district seats + list seats = the chamber, so the bar chart cannot misreport who governs;
 *    · every party referenced anywhere exists in the party table with a colour;
 *    · every election carries the attribution line and the licence of the data it is made of.
 *
 *      node scripts/build-elections.mjs --check        # offline: verify the committed data
 *      node scripts/build-elections.mjs                # rebuild every pack (network)
 *      node scripts/build-elections.mjs --only jp uk   # rebuild some packs
 *      node scripts/build-elections.mjs --list         # what packs exist and what they claim
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validate } from './lib/elections-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = join(ROOT, 'scripts', 'elections');
const OUT_DIR = join(ROOT, 'data', 'elections');
const INDEX = join(OUT_DIR, 'index.json');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-elections');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) elections-build';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const LIST = argv.includes('--list');
const ONLY = (() => { const i = argv.indexOf('--only'); return i < 0 ? null : new Set(argv.slice(i + 1).filter(a => !a.startsWith('--'))); })();

/* ── the download cache ────────────────────────────────────────────────────────────────────────
   A rebuild pulls tens of megabytes from a dozen public services, several of which are slow and
   one of which (TIGERweb) takes sixteen seconds for a single national query. Caching under
   node_modules/.cache keeps a re-run cheap and keeps the fetched bytes out of the repository. */
/* ⚠ THE KEY IS A HASH OF THE WHOLE URL, NOT A TRUNCATION OF IT. The first version took the first
   180 characters of base64url(url), and two URLs that agree for their first 135 bytes collided —
   MEASURED during this round: an ArcGIS service's `?f=pjson` (metadata) and its `/query` (the
   features) mapped to the same file, so the second request was served the first one's body and the
   pack received a FeatureCollection with no features. Nothing failed; a country was simply empty.
   A truncating cache key also makes paging impossible, because pages differ only in the query. */
const keyOf = (url) => join(CACHE, createHash('sha256').update(url).digest('hex').slice(0, 40));

async function get(url, { json = false, text = false, headers = {} } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const key = keyOf(url);
  let buf;
  if (existsSync(key)) buf = readFileSync(key);
  else {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(key, buf);
  }
  if (json) return JSON.parse(buf.toString('utf8'));
  if (text) return buf.toString('utf8');
  return buf;
}
get.forget = (url) => { const key = keyOf(url); if (existsSync(key)) rmSync(key); };

/* ── discover the packs ───────────────────────────────────────────────────────────────────────── */
function packFiles() {
  if (!existsSync(PACK_DIR)) return [];
  return readdirSync(PACK_DIR).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort();
}

async function loadPacks() {
  const packs = [];
  for (const f of packFiles()) {
    const mod = await import(pathToFileURL(join(PACK_DIR, f)).href);
    const id = f.replace(/\.mjs$/, '');
    if (typeof mod.build !== 'function') throw new Error('scripts/elections/' + f + ' does not export build()');
    packs.push({ id, file: f, build: mod.build, about: mod.about || '' });
  }
  return packs;
}

/* ── read the committed data (also what --check reads) ────────────────────────────────────────── */
const readPart = (kind, id) => {
  const p = join(OUT_DIR, id);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return { __bad: String(e && e.message) }; }
};

function runCheck() {
  if (!existsSync(INDEX)) {
    console.error('data/elections/index.json is missing — run `node scripts/build-elections.mjs`');
    process.exit(1);
  }
  const index = JSON.parse(readFileSync(INDEX, 'utf8'));
  const errs = validate(index, readPart);
  /* ⚠ AND THE FILES ON DISK MUST BE THE FILES THE INDEX NAMES — no more. An orphan left behind by
     a pack that was renamed is shipped to every reader and never loaded by anything. */
  const named = new Set(['index.json']);
  for (const e of index.elections || []) { if (e.geo) named.add(e.geo); if (e.res) named.add(e.res); }
  for (const f of readdirSync(OUT_DIR)) if (!named.has(f)) errs.push('data/elections/' + f + ' is not referenced by index.json');

  if (errs.length) {
    console.error('elections: ' + errs.length + ' problem(s) in the committed data\n');
    for (const e of errs.slice(0, 40)) console.error('  · ' + e);
    if (errs.length > 40) console.error('  … and ' + (errs.length - 40) + ' more');
    process.exit(1);
  }
  const nGeo = new Set((index.elections || []).map(e => e.geo).filter(Boolean)).size;
  console.log('elections: ok — ' + (index.polities || []).length + ' polities, ' +
    (index.elections || []).length + ' elections, ' + nGeo + ' boundary eras, ' +
    Object.keys(index.parties || {}).length + ' parties');
}

/* ── build ─────────────────────────────────────────────────────────────────────────────────────
   Each pack returns its own slice; this merges them and writes one index. ⚠ A pack that fails does
   NOT take the others down and does NOT silently vanish from the index either — the run ends
   non-zero and says which pack failed, so a broken upstream is visible instead of appearing as a
   country that quietly stopped existing. */
async function runBuild() {
  const packs = await loadPacks();
  const use = packs.filter(p => !ONLY || ONLY.has(p.id));
  if (ONLY) for (const want of ONLY) if (!packs.some(p => p.id === want)) throw new Error('no pack named ' + want);

  mkdirSync(OUT_DIR, { recursive: true });
  /* start from what is committed so that `--only jp` does not delete every other country */
  const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8'))
    : { _: '', parties: {}, polities: [], elections: [] };
  const failed = [];

  for (const pack of use) {
    process.stdout.write('· ' + pack.id + ' … ');
    let out;
    try { out = await pack.build({ get, ROOT, OUT_DIR }); }
    catch (e) { console.log('FAILED — ' + (e && e.message)); failed.push(pack.id); continue; }

    /* replace this pack's contribution wholesale: leftovers from a previous shape are not merged */
    const mine = new Set((out.polities || []).map(p => p.id));
    index.polities = index.polities.filter(p => !mine.has(p.id)).concat(out.polities || []);
    index.elections = index.elections.filter(e => !mine.has(e.polity)).concat(out.elections || []);
    for (const k of Object.keys(index.parties)) if (mine.has(k.split(':')[0])) delete index.parties[k];
    Object.assign(index.parties, out.parties || {});

    let bytes = 0;
    for (const [id, fc] of Object.entries(out.geo || {})) { const s = JSON.stringify(fc); bytes += s.length; writeFileSync(join(OUT_DIR, id), s); }
    for (const [id, r] of Object.entries(out.res || {})) { const s = JSON.stringify(r); bytes += s.length; writeFileSync(join(OUT_DIR, id), s); }
    console.log((out.elections || []).length + ' election(s), ' + (bytes / 1048576).toFixed(2) + ' MB');
  }

  index.polities.sort((a, b) => a.id.localeCompare(b.id));
  index.elections.sort((a, b) => a.polity.localeCompare(b.polity) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  index.parties = Object.fromEntries(Object.entries(index.parties).sort((a, b) => a[0].localeCompare(b[0])));
  index._ = 'Built by scripts/build-elections.mjs from the packs in scripts/elections/. Every election ' +
    'carries its own `src` (attribution) and `lic` (licence); see docs/ELECTIONS.md.';
  writeFileSync(INDEX, JSON.stringify(index, null, 1));

  if (failed.length) { console.error('\nFAILED packs: ' + failed.join(', ')); process.exit(1); }
  runCheck();
}

if (LIST) {
  for (const f of packFiles()) console.log(f.replace(/\.mjs$/, ''));
} else if (CHECK) {
  runCheck();
} else {
  runBuild().catch(e => { console.error(e); process.exit(1); });
}
