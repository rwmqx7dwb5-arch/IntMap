/* ============================================================================
 *  IntMap · build report  (#R311)
 * ----------------------------------------------------------------------------
 *  「最大chunkが大きい」という事実だけでは性能問題とは断定できません。
 *   巨大なasync chunkと、起動時に必ず読む巨大なentry chunkを混同しないでください。
 *
 *  So this does not report "the biggest chunk". It splits the bundle in two and
 *  reports each half separately:
 *
 *    EAGER  — the entry chunk of index.html plus the transitive closure of its
 *             STATIC imports. This is exactly the set the browser fetches,
 *             parses and executes before the app can run: Vite emits a
 *             <link rel="modulepreload"> for every one of them, so they are on
 *             the critical path whether or not the user ever opens a feature.
 *    ASYNC  — everything reachable only through import(). Large is not by
 *             itself a defect here (Cesium is 4.8 MB and a MapLibre session
 *             never asks for it); what matters is that it stays out of EAGER.
 *
 *  Sizes are raw / gzip / brotli, because they answer different questions:
 *  gzip+brotli are what the network costs, raw is what the parser costs. A
 *  change that only moves bytes between the two halves shows up here as a
 *  drop in EAGER with a matching rise in ASYNC, which is the shape of a real
 *  improvement; a change that deletes a feature shows up as a drop in both.
 *
 *  Emitted to .perf/build-report.json (gitignored — it describes one build, not
 *  the repository). scripts/perf-budget.mjs is the gate that reads it.
 * ==========================================================================*/
import { brotliCompressSync, constants as ZC, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_PATH = resolve(ROOT, '.perf', 'build-report.json');

const gz = (buf) => gzipSync(buf, { level: 9 }).length;
/* ⚠ TWO BROTLI QUALITIES, ON PURPOSE, AND THE REPORT SAYS WHICH IT USED.
   Quality 11 over the whole bundle costs ~40 s per build — Cesium alone is 4.8 MB — and this runs on
   every build including CI's. But only the EAGER numbers are ratcheted by scripts/perf-budget.mjs,
   so only they need to be exact; the async figure is context, and quality 5 lands within a few per
   cent of 11 in a small fraction of the time. Anything the gate compares is measured at 11. */
const br = (buf, q) => brotliCompressSync(buf, { params: { [ZC.BROTLI_PARAM_QUALITY]: q } }).length;
export const BROTLI_Q = { gated: 11, context: 5 };

/* ── the Vite plugin ────────────────────────────────────────────────────────
   generateBundle sees the finished graph: which chunk is an entry, which is a
   dynamic entry, what each one statically imports, and which source modules
   Rollup put inside it. Everything below is derived from that — nothing is
   guessed from filenames. */
export function buildReportPlugin(opts = {}) {
  const out = opts.out || REPORT_PATH;
  return {
    name: 'intmap-build-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = {};
      const assets = {};
      const code = {};
      for (const [fileName, o] of Object.entries(bundle)) {
        if (o.type === 'chunk') {
          code[fileName] = Buffer.from(o.code, 'utf8');
          chunks[fileName] = {
            name: o.name,
            isEntry: !!o.isEntry,
            isDynamicEntry: !!o.isDynamicEntry,
            facade: o.facadeModuleId ? relative(ROOT, o.facadeModuleId).replace(/\\/g, '/') : null,
            raw: code[fileName].length,
            imports: [...o.imports],
            dynamicImports: [...o.dynamicImports],
            css: [...(o.viteMetadata?.importedCss || [])],
            modules: Object.fromEntries(Object.entries(o.modules || {}).map(
              ([id, m]) => [relative(ROOT, id).replace(/\\/g, '/'), m.renderedLength])),
          };
        } else {
          const src = Buffer.isBuffer(o.source) ? o.source : Buffer.from(String(o.source), 'utf8');
          assets[fileName] = { raw: src.length, _buf: src };
        }
      }

      /* EAGER = closure of static imports from the app entry. `admin` is a second
         HTML entry (the operator console) and is NOT part of the app's startup
         cost, so it is walked separately rather than merged in. */
      const entryOf = (n) => Object.keys(chunks).find((f) => chunks[f].isEntry && chunks[f].name === n);
      const closure = (start) => {
        const seen = new Set(); const q = start ? [start] : [];
        while (q.length) {
          const f = q.shift();
          if (!f || seen.has(f) || !chunks[f]) continue;
          seen.add(f);
          for (const i of chunks[f].imports) q.push(i);
        }
        return seen;
      };
      const eager = closure(entryOf('main'));
      const adminEager = closure(entryOf('admin'));
      const async_ = new Set(Object.keys(chunks).filter((f) => !eager.has(f) && !adminEager.has(f)));

      /* …and only NOW are the compressed sizes taken, because the quality depends on which half a
         chunk landed in (see BROTLI_Q). Everything the gate reads is measured at quality 11. */
      for (const [f, c] of Object.entries(chunks)) {
        const q = eager.has(f) ? BROTLI_Q.gated : BROTLI_Q.context;
        c.gzip = gz(code[f]); c.brotli = br(code[f], q); c.brotliQ = q;
      }
      const eagerCssFiles = new Set();
      for (const f of eager) for (const c of chunks[f].css) eagerCssFiles.add(c);
      for (const [f, a] of Object.entries(assets)) {
        const q = eagerCssFiles.has(f) ? BROTLI_Q.gated : BROTLI_Q.context;
        a.gzip = gz(a._buf); a.brotli = br(a._buf, q); a.brotliQ = q; delete a._buf;
      }

      const sum = (files, key) => [...files].reduce((a, f) => a + (chunks[f]?.[key] || 0), 0);
      const cssOf = (files) => {
        const set = new Set();
        for (const f of files) for (const c of chunks[f].css) set.add(c);
        return set;
      };
      const cssSum = (set, key) => [...set].reduce((a, f) => a + (assets[f]?.[key] || 0), 0);
      const eagerCss = cssOf(eager);

      /* A module that Rollup copied into more than one chunk is paid for twice
         whenever both are loaded. Worth naming, not automatically a defect. */
      const where = new Map();
      for (const [f, c] of Object.entries(chunks))
        for (const id of Object.keys(c.modules)) {
          if (!where.has(id)) where.set(id, []);
          where.get(id).push(f);
        }
      const duplicates = [...where.entries()].filter(([, fs]) => fs.length > 1)
        .map(([id, fs]) => ({ module: id, chunks: fs })).sort((a, b) => b.chunks.length - a.chunks.length);

      const report = {
        generatedBy: 'scripts/build-report.mjs',
        eager: {
          chunks: [...eager].sort(),
          count: eager.size,
          raw: sum(eager, 'raw'), gzip: sum(eager, 'gzip'), brotli: sum(eager, 'brotli'),
          modules: [...eager].reduce((a, f) => a + Object.keys(chunks[f].modules).length, 0),
          css: { files: [...eagerCss].sort(), raw: cssSum(eagerCss, 'raw'), gzip: cssSum(eagerCss, 'gzip'), brotli: cssSum(eagerCss, 'brotli') },
          /* what the browser actually asks for before it can run: the entry
             script, its modulepreloads, and the stylesheets they pull in. */
          requests: eager.size + eagerCss.size,
        },
        async: {
          chunks: [...async_].sort(),
          count: async_.size,
          raw: sum(async_, 'raw'), gzip: sum(async_, 'gzip'), brotli: sum(async_, 'brotli'),
        },
        admin: { chunks: [...adminEager].sort(), raw: sum(adminEager, 'raw'), gzip: sum(adminEager, 'gzip') },
        chunks, assets, duplicates,
      };
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(report, null, 2));
    },
  };
}

/* ── CLI ───────────────────────────────────────────────────────────────────*/
const kb = (n) => (n / 1024).toFixed(1).padStart(9) + ' kB';
function print(r) {
  const line = (l, o) => console.log(`  ${l.padEnd(22)}${kb(o.raw)}${kb(o.gzip)}${kb(o.brotli)}`);
  console.log('\nIntMap · build report            raw       gzip     brotli');
  console.log('  ─────────────────────────────────────────────────────────');
  line(`EAGER JS (${r.eager.count} chunks)`, r.eager);
  line('EAGER CSS', r.eager.css);
  console.log(`  eager requests        ${String(r.eager.requests).padStart(9)}    modules ${r.eager.modules}`);
  console.log('  ─────────────────────────────────────────────────────────');
  line(`ASYNC JS (${r.async.count} chunks)`, r.async);
  console.log('\n  EAGER chunks:');
  for (const f of r.eager.chunks.sort((a, b) => r.chunks[b].raw - r.chunks[a].raw))
    console.log(`   ${kb(r.chunks[f].raw)}  ${kb(r.chunks[f].gzip)}  ${f}`);
  console.log('\n  largest EAGER modules:');
  const mods = [];
  for (const f of r.eager.chunks) for (const [id, n] of Object.entries(r.chunks[f].modules)) mods.push([id, n]);
  for (const [id, n] of mods.sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${kb(n)}  ${id}`);
  if (r.duplicates.length) {
    console.log(`\n  duplicated modules: ${r.duplicates.length}`);
    for (const d of r.duplicates.slice(0, 10)) console.log(`   ${d.module}  →  ${d.chunks.join(', ')}`);
  }
  console.log('');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let raw;
  try { raw = readFileSync(REPORT_PATH, 'utf8'); }
  catch { console.error(`no build report at ${relative(ROOT, REPORT_PATH)} — run \`npm run build\` first`); process.exit(1); }
  print(JSON.parse(raw));
}
