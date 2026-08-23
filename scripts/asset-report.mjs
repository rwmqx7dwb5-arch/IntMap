#!/usr/bin/env node
/**
 * IntMap · asset-report — WHAT IS IN dist/, AND WHO ASKED FOR IT  (#R322)
 * =============================================================================================
 *  scripts/build-report.mjs weighs what Rollup produced. That is the smaller half: MEASURED on this
 *  build, JavaScript is 12.5 MB of a 106 MB deploy and `data/` alone is 55.8 MB, none of which
 *  passes through the bundler — vite.config.js copies the directory whole. So the build report can
 *  say a chunk grew and cannot say that a 5.6 MB file nobody fetches is being published.
 *
 *  ⚠ THE CLASSIFICATION IS DERIVED, NOT DECLARED. A hand-written list of "files we ship" is a second
 *  source of truth, and this repository has been bitten by those (#R220, #R274). So every dist file
 *  is matched against the STRINGS THE SOURCE ACTUALLY CONTAINS:
 *
 *    exact      some file in js/ src/ *.html sw.js names it outright — 'data/basins_mrb.json'
 *    prefix     the name is COMPUTED and only its directory or stem is literal —
 *               `'data/planets/' + id + '.jpg'`, `preview_${key}.png`. Recorded as its own class,
 *               never as "unreferenced": a grep that cannot see a concatenation must say so rather
 *               than report an absence it did not establish.
 *    build      only scripts/ names it — a generator's INPUT, not a visitor's download
 *    test       only tests/ names it
 *    doc        only *.md names it
 *    orphan     nothing in the repository contains the string at all
 *
 *  `--check` fails on an orphan, on a duplicate payload outside the allowlist, and on a file bigger
 *  than the per-file ceiling that no one has accepted. Everything else prints.
 *
 *  Usage
 *    node scripts/asset-report.mjs               the table
 *    node scripts/asset-report.mjs --check       the gate (used by npm run check:assets)
 *    node scripts/asset-report.mjs --json <p>    the whole classification, per file
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

/* ── what counts as a source that can ASK for an asset ────────────────────── */
const SOURCE_DIRS = [
  { dir: 'js', role: 'runtime' }, { dir: 'src', role: 'runtime' },
  { dir: 'css', role: 'runtime' }, { dir: 'scripts', role: 'build' },
  { dir: 'tests', role: 'test' }, { dir: 'docs', role: 'doc' },
];
const ROOT_SOURCES = ['index.html', 'admin.html', 'science.html', 'sources.html', 'privacy.html', 'terms.html', 'sw.js'];

/* ⚠ (#R322) THE ALLOWLIST IS FOR REASONS, NOT FOR NAMES. Every entry says why the tree is allowed
   to carry the thing, and a name with no reason is not an entry. */
const ALLOW = {
  /* Rollup emits the same helper into more than one entry; the duplicate is the bundler's, and
     de-duplicating it would mean giving two entries a shared chunk they both then wait for. */
  duplicateHash: [
    /* ⚠ EVERY ENTRY HERE IS «TWO PAGES, TWO WAYS IN», NOT «WE DID NOT GET ROUND TO IT». index.html
       is bundled and reaches its assets by content hash; privacy / science / sources / terms are
       shells copied verbatim and reach theirs by plain relative URL. Neither can use the other's
       copy, so the pair is the price of having pages that are not the app. MEASURED: 67 duplicate
       groups, 2,276,921 B, and after this round exactly none of them is avoidable. */
    { match: /^assets\/KaTeX_/, why: 'typeset fonts: the bundle reaches them by hash, dist/katex/katex.min.css (loaded lazily by js/page-i18n.js for science.html) reaches them by relative name' },
    { match: /^katex\/fonts\//, why: 'the other half of the pair above — the standalone-page copy' },
    { match: /^assets\/(inter|pretendard)-/i, why: 'the UI typeface: bundled for index.html, raw for the four shells that <link> dist/css/fonts.css' },
    { match: /^fonts\/(inter|pretendard)/i, why: 'the other half of the pair above' },
    { match: /^assets\/IntMap\.Icon-/, why: 'the app icon: bundled CSS reaches it by hash, the four shells load ./IntMap.Icon.png directly' },
    { match: /^IntMap\.Icon\.png$/, why: 'the other half of the pair above' },
    { match: /^assets\//, why: "bundler output — chunk identity is Rollup's to decide, not this gate's" },
  ],
  /* served verbatim because a page that is NOT part of the app bundle loads it with a plain
     <script src> — vite.config.js STATIC_ASSETS says the same thing, from the other side. */
  orphan: [
    { match: /^google[0-9a-f]+\.html$/, why: 'Google Search Console site verification — fetched by Google, named by nobody' },
    { match: /^(robots\.txt|sitemap\.xml|favicon\.ico|manifest\.webmanifest|\.nojekyll)$/, why: 'served by convention at a fixed URL' },
    { match: /^assets\//, why: 'bundler output — index.html references it by hashed name at build time' },
    { match: /^katex\//, why: 'KaTeX ships its own stylesheet and font tree; dist/katex/katex.min.css names the faces by relative URL and js/page-i18n.js loads the stylesheet, so the individual faces are named inside a file that is itself an asset (#R221)' },
    { match: /^fonts\/Inter Regular\//, why: 'SDF glyph atlas — the range is computed from the map view (js/app-body.js transformRequest)' },
    { match: /^cesium\//, why: "the Cesium SDK's own runtime tree (workers, shaders, IAU2006 tables, widget CSS). The SDK builds these URLs from CESIUM_BASE_URL at run time, so no string in this repository names any of them — which is exactly why vite.config.js cesiumAssets() copies the directory whole rather than listing it." },
  ],
  /* a production file larger than this needs a reason of its own */
  sizeCeiling: 6 * 1024 * 1024,
  bigFile: [
    { match: /^data\/ecoregions_2017\.geojson$/, why: 'the WWF terrestrial ecoregions layer — one file is the dataset (#R311 removed its duplicate)' },
  ],
};

const walk = (d, base = d, out = []) => {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else out.push(relative(base, f).split(sep).join('/'));
  }
  return out;
};

/* ── the strings the source actually contains ─────────────────────────────── */
function sourceCorpus() {
  const corpus = [];
  for (const { dir, role } of SOURCE_DIRS) {
    const d = join(ROOT, dir);
    if (!existsSync(d)) continue;
    for (const rel of walk(d)) {
      if (!/\.(m?js|ts|html|css|json|md|mjs)$/.test(rel)) continue;
      if (rel.includes('node_modules/')) continue;
      /* ⚠ NOT THIS FILE. The allowlist above spells out `KaTeX_` and `IntMap.Icon` in order to say
         WHY those are allowed, and a corpus that includes this script therefore reports every KaTeX
         face as 「named by scripts/asset-report.mjs」 — the check hitting its own comment, which this
         repository has done eight times (see [[intmap-recurring-lessons]]). It was done a ninth
         time while writing this file, and caught by reading the output. */
      if (dir === 'scripts' && rel === 'asset-report.mjs') continue;
      corpus.push({ path: dir + '/' + rel, role, text: readFileSync(join(d, rel), 'utf8') });
    }
  }
  for (const f of ROOT_SOURCES) {
    const p = join(ROOT, f);
    if (existsSync(p)) corpus.push({ path: f, role: 'runtime', text: readFileSync(p, 'utf8') });
  }
  for (const f of walk(ROOT).filter((x) => /^[^/]+\.md$/.test(x))) {
    corpus.push({ path: f, role: 'doc', text: readFileSync(join(ROOT, f), 'utf8') });
  }
  /* ⚠ (#R322) A MANIFEST IS A CONSUMER. Several of the largest rasters are never named in
     JavaScript at all — js/precip-annual.js:62 reads `mercator.file` out of data/precip-mm.json,
     js/vs30-mask.js:66 reads `phone.file` out of data/vs30.json. Without the small JSON files in
     the corpus, precip_mercator_1981-2010.png (3.82 MB) is attributed to whichever TEST happens to
     name it, which is true and says the opposite of what it means. Only the small ones: the payload
     files are megabytes of coordinates and cannot name anything. */
  const dataDir = join(ROOT, 'data');
  if (existsSync(dataDir)) {
    for (const rel of walk(dataDir)) {
      if (!rel.endsWith('.json')) continue;
      const p = join(dataDir, rel);
      if (statSync(p).size > 262144) continue;
      corpus.push({ path: 'data/' + rel, role: 'runtime', text: readFileSync(p, 'utf8') });
    }
  }
  return corpus;
}

/* Rank of certainty: an exact name beats a computed one, and a runtime consumer beats a build one. */
const RANK = { exact: 3, prefix: 2, none: 0 };
const ROLE_RANK = { runtime: 4, build: 3, test: 2, doc: 1 };
/* ⚠ a locale file that NAMES a data file is describing it to the reader, not fetching it — the
   Sources page lists what the app downloads. Attributing data/tle/catalogue.tle to
   js/locales/pages.de.js is true and useless, so a real consumer outranks a mention. */
const isProse = (p) => /\/locales\//.test(p) || /reference-data\.js$/.test(p);

function classify(distRel, corpus) {
  const name = basename(distRel);
  const stem = name.replace(/\.[^.]+$/, '');
  const dir = dirname(distRel);
  /* the two shapes a computed name takes here: a directory prefix, and a stem prefix before a
     variable — `preview_${key}.png` is written as the literal 'preview_' plus an expression. */
  const dirPrefix = dir === '.' ? null : dir + '/';
  const stemPrefix = /^([a-z0-9]+[_-])/i.exec(stem) ? /^([a-z0-9]+[_-])/i.exec(stem)[1] : null;

  let best = { how: 'none', role: null, where: null };
  for (const s of corpus) {
    if (s.path.startsWith('dist/')) continue;
    let how = null;
    if (s.text.includes(distRel) || s.text.includes(name)) how = 'exact';
    else if (dirPrefix && s.text.includes(dirPrefix)) how = 'prefix';
    else if (stemPrefix && stemPrefix.length >= 5 && s.text.includes(stemPrefix)) how = 'prefix';
    if (!how) continue;
    const score = RANK[how] * 10 + (ROLE_RANK[s.role] || 0) - (isProse(s.path) ? 3 : 0);
    const bestScore = RANK[best.how] * 10 + (ROLE_RANK[best.role] || 0) - (best.where && isProse(best.where) ? 3 : 0);
    if (score > bestScore) best = { how, role: s.role, where: s.path };
    if (best.how === 'exact' && best.role === 'runtime' && !isProse(best.where)) break;
  }
  if (best.how === 'none') return { klass: 'orphan', how: 'none', where: null };
  const klass = best.role === 'runtime' ? (best.how === 'exact' ? 'exact' : 'prefix') : best.role;
  return { klass, how: best.how, where: best.where };
}

const allow = (list, rel) => list.find((e) => e.match.test(rel));

function main() {
  if (!existsSync(DIST)) {
    console.error('asset-report: no dist/ — run `npm run build` first.');
    process.exit(1);
  }
  const corpus = sourceCorpus();
  const files = walk(DIST).sort();
  const rows = [];
  const byHash = new Map();
  for (const rel of files) {
    const abs = join(DIST, rel);
    const bytes = statSync(abs).size;
    const buf = readFileSync(abs);
    const sha = createHash('sha256').update(buf).digest('hex');
    const c = classify(rel, corpus);
    rows.push({ path: rel, bytes, sha, ext: extname(rel).slice(1) || '-', ...c });
    (byHash.get(sha) || byHash.set(sha, []).get(sha)).push(rel);
  }

  const dupes = [...byHash.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([sha, ps]) => ({ sha, paths: ps, bytes: rows.find((r) => r.path === ps[0]).bytes }))
    .filter((d) => !d.paths.every((p) => allow(ALLOW.duplicateHash, p)));

  const orphans = rows.filter((r) => r.klass === 'orphan' && !allow(ALLOW.orphan, r.path));
  const big = rows.filter((r) => r.bytes > ALLOW.sizeCeiling && !allow(ALLOW.bigFile, r.path));

  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const group = {};
  for (const r of rows) {
    const g = group[r.klass] || (group[r.klass] = { n: 0, bytes: 0 });
    g.n++; g.bytes += r.bytes;
  }

  const kb = (n) => (n / 1048576).toFixed(2) + ' MB';
  console.log('\nIntMap · production assets                 files        bytes');
  console.log('  ─────────────────────────────────────────────────────────────');
  for (const k of ['exact', 'prefix', 'build', 'test', 'doc', 'orphan']) {
    if (!group[k]) continue;
    console.log(`  ${k.padEnd(10)} ${String(group[k].n).padStart(6)}   ${kb(group[k].bytes).padStart(12)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(10)} ${String(rows.length).padStart(6)}   ${kb(total).padStart(12)}`);

  const top = rows.filter((r) => r.path.startsWith('data/')).sort((a, b) => b.bytes - a.bytes).slice(0, 20);
  if (top.length) {
    console.log('\n  largest data/ files');
    for (const r of top) console.log(`    ${kb(r.bytes).padStart(10)}  ${r.klass.padEnd(7)} ${r.path}${r.where ? '   ← ' + r.where : ''}`);
  }

  const errors = [];
  if (orphans.length) {
    console.log('\n  ⚠ nothing in the repository names these:');
    for (const r of orphans) console.log(`    ${kb(r.bytes).padStart(10)}  ${r.path}`);
    errors.push(`${orphans.length} production file(s) that no source, script, test or document mentions. Either something fetches them by a name this cannot see — say so in ALLOW.orphan with the reason — or they should not be copied into dist/ (vite.config.js).`);
  }
  if (dupes.length) {
    console.log('\n  ⚠ the same bytes, more than once:');
    for (const d of dupes) console.log(`    ${kb(d.bytes).padStart(10)}  ${d.paths.join('  ==  ')}`);
    errors.push(`${dupes.length} duplicate payload(s) outside the allowlist — one dataset, one file (#R311).`);
  }
  if (big.length) {
    console.log('\n  ⚠ over the per-file ceiling with no reason recorded:');
    for (const r of big) console.log(`    ${kb(r.bytes).padStart(10)}  ${r.path}`);
    errors.push(`${big.length} file(s) over ${kb(ALLOW.sizeCeiling)} that nobody has accepted. Add the reason to ALLOW.bigFile or make it smaller.`);
  }

  const out = val('--json', null);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ total, group, rows, dupes, orphans: orphans.map((r) => r.path) }, null, 2));
    console.log(`\n  → ${out}`);
  }

  if (has('--check')) {
    if (errors.length) { console.error('\nasset-report:\n  · ' + errors.join('\n  · ')); process.exit(1); }
    console.log('\n✓ every production asset has a consumer, and no payload is shipped twice.');
  }
}

main();
