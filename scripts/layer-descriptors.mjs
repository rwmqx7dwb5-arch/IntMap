#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/layer-descriptors.mjs — the layer declarations: discovered, checked, indexed
 * ----------------------------------------------------------------------------
 *  (layer-descriptor) A layer is ONE FILE, js/layers/<id>.js (scripts/lib/layer-descriptor.mjs says what it may
 *  hold). Two things about the set cannot be known at run time without a bundler, and this does them:
 *
 *    the GENERATED LAYERS region of js/layer-manifest.js — the Layers list DERIVED from the declarations
 *                          (scripts/lib/layer-descriptor.mjs deriveShelves) and every declaration's VALUE, between the
 *                          two markers. DISCOVERED from the directory js/layers/: every `*.js` that does not
 *                          start with `_`. It is generated so that Node (the tests, the gates) and the browser
 *                          read the SAME list; `npm run build` writes it first (package.json `prebuild`), so a
 *                          build can never ship a layer list that disagrees with the directory.
 *                          ⚠ COPIED INTO THE MANIFEST, NOT IMPORTED — the choice scripts/atlas-caps.mjs made for
 *                          the capability rows, for the same measured reason. An index of 174 `import` lines put
 *                          177 modules on the boot path (check:perf `eager.modules` 291 → 468, 2026-10-01) while the
 *                          boot BYTES went down; an index module of copied values still added one (292). Copied
 *                          into the region, the boot path carries exactly the modules it did before. The
 *                          declaration file stays the only place a value is written: the gate fails while the
 *                          region differs.
 *    the checks          — every declaration against the schema, the set against itself (one id, one
 *                          short name, one position, one owner per link), and every LINK against the
 *                          registry that holds it.
 *
 *      node scripts/layer-descriptors.mjs --write [--root DIR]   # rewrite the region after adding/changing a layer
 *      node scripts/layer-descriptors.mjs --check [--root DIR]   # exit 1 on a stale region or any problem
 *      node scripts/layer-descriptors.mjs --report               # …and print what is not yet joined
 *
 *  ⚠ ROOT IS THIS FILE'S OWN LOCATION (or --root), so the same script run inside a scratch copy of the
 *  checkout (tests/helpers/scratch-tree.mjs) checks the copy, top to bottom, with no other plumbing.
 *
 *  ── WHAT EACH LINK IS CHECKED AGAINST ───────────────────────────────────────────────────────
 *    registry  a literal `IntMapLayers.register('<id>'` in js/ (or the bare `register('<id>'` of the
 *              registry's own factory in js/map-ui.js)
 *    state     a literal `ShareState.register('<key>'`
 *    commands  a literal `<IntMapOS|OS>.register('<id>'`
 *    atlas     a capability entry `row: ['<id>'` in js/atlas-cap-<namespace>.js
 *    sources   a row `n:'<name>'` of js/reference-data.js
 *    lazy      a key of js/lazy-modules.js LAZY_REGISTRY
 *    label     a key of the en AND jp ui tables (js/locales/ui.<code>.js)
 *  Comments are stripped first (scripts/code-only.mjs): a sentence that QUOTES a registration is not one.
 *  ⚠ THE REVERSE IS REPORTED, NOT REQUIRED. A literal IntMapLayers registration that no layer claims is
 *  printed by --report — some are not rows at all (`elevation` is always on, `news` is the news panel's
 *  points, `choropleth` speaks for a whole family) and a gate that demanded a claim would be answered
 *  with an invented one.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireModule, langRegistry } from './lib/import-module.mjs';
import { codeOnly } from './code-only.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
const ROOT = resolve(opt('--root') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const DIR = join(ROOT, 'js', 'layers');
const MANIFEST = join(ROOT, 'js', 'layer-manifest.js');
const BEGIN = '/* ⚠ GENERATED LAYERS — BEGIN', END = '/* ⚠ GENERATED LAYERS — END */';
/** the generated region of a manifest text: from the line after BEGIN to the line before END (LF) */
export function regionOf(text) {
  const t = LF(text), b = t.indexOf(BEGIN), e = t.indexOf(END);
  if (b < 0 || e < b) return null;
  const from = t.indexOf('\n', b) + 1, to = t.lastIndexOf('\n', e) + 1;
  return { text: t, from, to, body: t.slice(from, to) };
}
const LF = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => LF(readFileSync(join(ROOT, rel), 'utf8'));

/** the declaration files, sorted — the directory IS the list */
const declarationFiles = (root = ROOT) => readdirSync(join(root, 'js', 'layers'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();

/* a declaration's value as a JS literal — strings, finite and infinite numbers, booleans, arrays, plain objects */
const lit = (v) => (Array.isArray(v) ? '[' + v.map(lit).join(', ') + ']'
  : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ': ' + lit(x)).join(', ') + ' }'
  : typeof v === 'string' ? JSON.stringify(v)
  : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : 'null');

/**
 * The region's text: the Layers list's SHELVES as scripts/lib/layer-descriptor.mjs `deriveShelves` derives them (DERIVED),
 * and every declaration whole (DECLARATIONS, in panel order). Derived HERE, when the region is written, so the
 * manifest carries no import of the declarations at all (check:perf).
 * @param {{ key: string }[]} shelves  @param {{ file: string, d: any }[]} list  @param {any} kit
 */
export function renderRegion(shelves, list, kit) {
  const ds = list.map((x) => x.d).filter((d) => d && typeof d === 'object');
  const fileOf = new Map(list.map((x) => [x.d, x.file]));
  const ordered = shelves.flatMap((s) => ds.filter((d) => d.shelf === s.key).sort((a, b) => a.order - b.order));
  const derived = kit.deriveShelves(shelves, ds);
  return '/** the Layers list — every shelf of js/layers/_shelves.js in panel order, its rows in `order` (scripts/lib/layer-descriptor.mjs deriveShelves) */\n'
    + 'const DERIVED = [\n' + derived.map((s) => '  { key: ' + JSON.stringify(s.key) + ', layers: ['
      + (s.layers.length ? '\n' + s.layers.map((l) => '    ' + lit(l) + ',').join('\n') + '\n  ' : '') + '] },').join('\n') + '\n];\n'
    + '/** every declaration whole, links included, in panel order */\n'
    + 'const DECLARATIONS = [\n' + ordered.map((d) => '  ' + lit(d) + ',   // ' + fileOf.get(d)).join('\n') + '\n];\n';
}

/* ── what each registry holds, read from the tree ─────────────────────────────────────────── */
function jsCode() {
  return readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => [f, codeOnly(read('js/' + f))]);
}
function registries(list) {
  const reg = new Set(), state = new Set(), cmds = new Set(), atlas = new Set();
  const byId = new Map(list.map((d) => [d.id, d]));
  for (const [f, src] of jsCode()) {
    /* a registration made FROM a declaration: `const X = …IntMapLayers.declaration('<id>')`, then
       `IntMapLayers.register(X.registry[i], …)` / `ShareState.register(X.state, …)` — it registers what the
       declaration says, so that is what it holds (js/outbreaks.js) */
    for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]*?IntMapLayers\.declaration\(\s*'([^']+)'\s*\)/g)) {
      const d = byId.get(m[2]); if (!d) continue;
      /* every regex metacharacter, not only `$` — the same full escape scripts/export-readers.mjs uses (CodeQL js/incomplete-sanitization) */
      const v = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const r of src.matchAll(new RegExp('IntMapLayers\\.register\\(\\s*' + v + '\\.registry\\[(\\d+)\\]', 'g'))) if (d.registry && d.registry[+r[1]]) reg.add(d.registry[+r[1]]);
      if (new RegExp('ShareState\\.register\\(\\s*' + v + '\\.state\\b').test(src) && d.state) state.add(d.state);
    }
    /* `'<id>'` followed by `,` or `)` — a literal; `'gx-' + L.id` is a composed id and is not one */
    for (const m of src.matchAll(/IntMapLayers\.register\(\s*'([^']+)'\s*[,)]/g)) reg.add(m[1]);
    if (f === 'map-ui.js') for (const m of src.matchAll(/(?<![.\w])register\(\s*'([^']+)'\s*[,)]/g)) reg.add(m[1]);
    for (const m of src.matchAll(/ShareState\.register\(\s*'([^']+)'\s*[,)]/g)) state.add(m[1]);
    for (const m of src.matchAll(/\b(?:IntMapOS|OS2?)\.register\(\s*'([^']+)'\s*[,)]/g)) cmds.add(m[1]);
    if (/^atlas-cap-/.test(f)) for (const m of src.matchAll(/row:\s*\[\s*'([^']+)'/g)) atlas.add(m[1]);
  }
  const sources = new Set([...read('js/reference-data.js').matchAll(/\bn\s*:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  return { reg, state, cmds, atlas, sources };
}
/* (module-graph) a locale table is an ES module that imports the registry and calls define() when it is
   evaluated: it is REQUIRED (the one shared instance) and its table read back from the real registry */
function uiTable(code) {
  requireModule('js/locales/ui.' + code + '.js');
  return langRegistry()._ui[code] || {};
}

/** load the declarations and the shelves of the tree at ROOT */
export async function load(root = ROOT) {
  const url = (rel) => pathToFileURL(join(root, rel)).href;
  const shelves = (await import(url('js/layers/_shelves.js'))).SHELVES;
  const kit = await import(url('scripts/lib/layer-descriptor.mjs'));
  const files = declarationFiles(root);
  const list = [];
  for (const f of files) list.push({ file: f, d: (await import(url('js/layers/' + f))).default });
  return { shelves, kit, files, list };
}

/** every problem with the tree's declarations, as sentences */
export async function problems() {
  const { shelves, kit, files, list } = await load();
  const out = [];
  const keys = new Set(shelves.map((s) => s.key));
  if (keys.size !== shelves.length) out.push('js/layers/_shelves.js names a shelf twice');
  for (const { file, d } of list) out.push(...kit.descriptorProblems(d, file, keys));
  const ds = list.map((x) => x.d).filter((d) => d && typeof d === 'object');
  out.push(...kit.setProblems(ds));
  /* the generated region is the directory */
  const want = renderRegion(shelves, list, kit);
  const reg = existsSync(MANIFEST) ? regionOf(readFileSync(MANIFEST, 'utf8')) : null;
  if (!reg) out.push('js/layer-manifest.js has no GENERATED LAYERS region');
  else if (reg.body !== want) out.push('the GENERATED LAYERS region of js/layer-manifest.js does not hold js/layers/ as it is — run `node scripts/layer-descriptors.mjs --write`');
  /* every link against its registry */
  const R = registries(ds);
  const { LAZY_REGISTRY } = await import(pathToFileURL(join(ROOT, 'js', 'lazy-modules.js')).href);
  const en = uiTable('en'), jp = uiTable('jp');
  const miss = (d, what, v, where) => out.push(d.id + '.js: ' + what + ' `' + v + '` — ' + where);
  for (const d of ds) {
    for (const v of d.registry || []) if (!R.reg.has(v)) miss(d, 'registry', v, 'no literal IntMapLayers.register(\'' + v + '\') in js/');
    if (d.state && !R.state.has(d.state)) miss(d, 'state', d.state, 'no literal ShareState.register(\'' + d.state + '\') in js/');
    for (const v of d.commands || []) if (!R.cmds.has(v)) miss(d, 'command', v, 'no literal IntMapOS.register(\'' + v + '\') in js/');
    for (const v of d.atlas || []) if (!R.atlas.has(v)) miss(d, 'capability', v, 'no entry with that id in js/atlas-cap-<namespace>.js');
    for (const v of d.sources || []) if (!R.sources.has(v)) miss(d, 'source', v, 'no row with that name in js/reference-data.js DATA_SOURCES');
    for (const v of d.lazy || []) if (!Object.prototype.hasOwnProperty.call(LAZY_REGISTRY, v)) miss(d, 'lazy module', v, 'not in js/lazy-modules.js LAZY_REGISTRY');
    if (d.label && !(en[d.label] && jp[d.label])) miss(d, 'label', d.label, 'not in both the en and the jp ui tables');
  }
  for (const s of shelves) if (/^lyrGrp/.test(s.key) && !(en[s.key] && jp[s.key])) out.push('js/layers/_shelves.js: the heading `' + s.key + '` is not in both the en and the jp ui tables');
  return { out, list: ds, R };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (argv.includes('--write')) {
    const { shelves, list, kit, files } = await load();
    const reg = regionOf(readFileSync(MANIFEST, 'utf8'));
    if (!reg) { console.error('layer-descriptors: js/layer-manifest.js has no GENERATED LAYERS region to write'); process.exit(1); }
    const text = reg.text.slice(0, reg.from) + renderRegion(shelves, list, kit) + reg.text.slice(reg.to);
    /* ⚠ UNLINK, THEN WRITE: in a scratch copy of the checkout every file is a HARD LINK to the real tree
       (tests/helpers/scratch-tree.mjs), and writing in place writes the one file both names point at —
       measured: the first run of tests/layer-descriptor-checks ③ wrote its probe layer into the real
       tree this way. A fresh file is the copy's alone. */
    if (reg.text !== text) {
      try { unlinkSync(MANIFEST); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      writeFileSync(MANIFEST, text);
    }
    console.log('layer-descriptors: js/layer-manifest.js holds ' + files.length + ' layers');
  }
  if (argv.includes('--check') || argv.includes('--report')) {
    const { out, list, R } = await problems();
    if (argv.includes('--report')) {
      const claimed = new Set(list.flatMap((d) => d.registry || []));
      const n = (k) => list.filter((d) => k in d).length;
      console.log('layer-descriptors: ' + list.length + ' layers · registry ' + n('registry') + ' · state ' + n('state') + ' · commands ' + n('commands')
        + ' · atlas ' + n('atlas') + ' · sources ' + n('sources') + ' · time ' + n('time'));
      console.log('  literal IntMapLayers registrations no layer claims: ' + ([...R.reg].filter((r) => !claimed.has(r)).sort().join(', ') || 'none'));
    }
    if (out.length) { for (const p of out) console.error('✗ ' + p); console.error('layer-descriptors: ' + out.length + ' problem(s)'); process.exit(1); }
    console.log('layer-descriptors: OK — ' + list.length + ' layers, every link found in its registry');
  }
}
