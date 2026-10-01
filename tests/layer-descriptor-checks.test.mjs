/* ============================================================================
 *  layer-descriptor — a layer is ONE declaration (js/layers/<id>.js); the Layers list is derived from them
 * ----------------------------------------------------------------------------
 *  Measured 2026-09-30: the WHO outbreaks layer was written into seven registries under three spellings,
 *  and of the 174 rows only 9 had an IntMapLayers id a reader could guess from the row id. Nothing said
 *  what a layer IS; the registries agreed only where a test compared them.
 *
 *  What this file RUNS to hold the change:
 *    ① the derived Layers list is BYTE-FOR-BYTE what the hand-kept list handed its readers — every export
 *       of js/layer-manifest.js, called as its readers call it, against the photograph taken from the
 *       hand-kept manifest at 281e584c (tests/fixtures/layer-descriptor-before.json)
 *    ② the gate passes on this tree: every declaration well-formed, the index is the directory, and every
 *       link (registry · state · commands · atlas · sources · lazy · label) is held by its registry
 *    ③ ADDING A LAYER IS ONE FILE: in a private copy of the checkout, one new js/layers/<id>.js — and
 *       nothing else written by hand — puts the layer on its shelf, in its position, in the share set, in
 *       the generated rows and in the catalogue, and the gate passes
 *    ④ the gate refuses what it exists to refuse: a shelf that does not exist, a link no registry holds,
 *       an index that does not list the directory, a registration that stopped reading its declaration
 *    ⑤ the two modules that read their declaration read exactly what they used to hold
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as M from '../js/layer-manifest.js';
import { layerDerivedText } from '../scripts/lib/layer-derived.mjs';
import { scratchTree } from './helpers/scratch-tree.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import SATS from '../js/layers/dl-sats.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const gate = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(ROOT, 'scripts/layer-descriptors.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
};

/* ── ① ──────────────────────────────────────────────────────────────────────────────────── */
test('layer-descriptor ① the derived Layers list is byte-for-byte the list the hand-kept manifest handed its readers', () => {
  const now = layerDerivedText(M);
  const before = read('tests/fixtures/layer-descriptor-before.json');
  assert.ok(before.length > 50000, 'the photograph is there');
  assert.equal(now, before, 'a reader of js/layer-manifest.js would receive different bytes');
  /* and the file holds no list of its own any more — one source */
  /* …and the manifest writes no row by hand: outside its GENERATED LAYERS region there is none, and the region is
     what the declarations render to (② runs the gate that compares them) */
  const text = read('js/layer-manifest.js');
  const b = text.indexOf('/* ⚠ GENERATED LAYERS — BEGIN'), e = text.indexOf('/* ⚠ GENERATED LAYERS — END */');
  assert.ok(b > 0 && e > b, 'js/layer-manifest.js carries the generated region');
  const outside = codeOnly(text.slice(0, b) + text.slice(e));
  assert.ok(!/\bid\s*:\s*['"]/.test(outside), 'js/layer-manifest.js writes a row by hand outside the generated region');
  assert.ok(!/from '\.\/layers\//.test(codeOnly(text)), 'the manifest imports no declaration module (check:perf eager.modules)');
});

/* ── ② ──────────────────────────────────────────────────────────────────────────────────── */
test('layer-descriptor ② every layer is one declaration, the index is the directory, and every link is held by its registry', () => {
  const r = gate(['--check']);
  assert.equal(r.code, 0, r.out);
  const files = readdirSync(join(ROOT, 'js/layers')).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(files.length, M.LAYERS.length, 'one file per row of the Layers list');
  for (const l of M.LAYERS) assert.ok(files.includes(l.id + '.js'), l.id + ' has no declaration file');
  /* the outbreaks layer the audit measured: its three spellings are one declaration now */
  const d = M.layerDeclaration('wp-dl-outbreaks');
  assert.deepEqual([d.registry, d.state, d.commands, d.atlas], [['outbreaks'], 'outbreaks', ['outbreaks.open', 'outbreaks.close'], ['map.outbreaks']]);
  assert.equal(M.layerDeclaration('outbreaks'), d, 'asked by its IntMapLayers id, the same declaration');
  assert.equal(M.layerDeclaration('no-such-layer'), null);
});

/* ── ③ ──────────────────────────────────────────────────────────────────────────────────── */
const PROBE = `export default {
  id: 'zz-probe-layer',
  shelf: 'lyrGrpClimate',
  order: 15,
  key: 'zzprobe',
  label: 'lyrSnow',
  share: true,
  html: true,
};
`;
const READER = `import * as M from './js/layer-manifest.js';
const p = M.LAYERS.find((l) => l.id === 'zz-probe-layer') || null;
const climate = M.SHELVES.find((s) => s.key === 'lyrGrpClimate').layers.map((l) => l.id);
console.log(JSON.stringify({ p, climate, shared: M.sharedIds().includes('zz-probe-layer'),
  row: (M.htmlRows().find((l) => l.id === 'zz-probe-layer') && M.rowHTML(M.htmlRows().find((l) => l.id === 'zz-probe-layer'), (k) => k)) || null,
  catalog: M.catalog().find((c) => c.id === 'zz-probe-layer') || null,
  groups: M.layerGroups().find((g) => g[0] === 'lyrGrpClimate')[1], decl: M.layerDeclaration('zz-probe-layer') }));
`;
test('layer-descriptor ③ adding a layer is ONE file: a new js/layers/<id>.js reaches every reader, and the gate passes', () => {
  const SCRATCH = scratchTree();
  const r = SCRATCH.mutate([{ file: 'js/layers/zz-probe-layer.js', text: PROBE }, { file: 'zz-probe-read.mjs', text: READER }, { file: 'js/layer-manifest.js', edit: (t) => t }], () => {
    /* the one machine step — what `npm run build` runs first (package.json prebuild) */
    const w = SCRATCH.node('scripts/layer-descriptors.mjs', ['--write']);
    const c = SCRATCH.node('scripts/layer-descriptors.mjs', ['--check']);
    const seen = SCRATCH.node('zz-probe-read.mjs');
    return { w, c, seen };
  });
  assert.equal(r.w.code, 0, r.w.out);
  assert.equal(r.c.code, 0, r.c.out);
  assert.equal(r.seen.code, 0, r.seen.out);
  const s = JSON.parse(r.seen.stdout);
  assert.ok(s.p && s.p.shelf === 'lyrGrpClimate', 'the layer is on the shelf it declared');
  assert.equal(s.climate.indexOf('zz-probe-layer'), 1, 'between the rows at order 10 and 20');
  assert.ok(s.shared, 'the share link carries it');
  assert.equal(s.row, '<label class="layer-option"><input type="checkbox" id="zz-probe-layer"> <span data-i18n="lyrSnow">lyrSnow</span></label>', 'its row is generated');
  assert.deepEqual(s.catalog, { id: 'zz-probe-layer', key: 'zzprobe', shelf: 'lyrGrpClimate', label: 'lyrSnow', rest: false, on: false, share: true, lazy: [] });
  assert.ok(s.groups.includes('zzprobe'), 'reorganizeLayerPanel files it by its short name');
  assert.equal(s.decl.id, 'zz-probe-layer');
  /* and the real tree was never written */
  assert.ok(!readdirSync(join(ROOT, 'js/layers')).includes('zz-probe-layer.js'));
});

/* ── ④ ──────────────────────────────────────────────────────────────────────────────────── */
test('layer-descriptor ④ the gate refuses a missing shelf, an unheld link, a stale index and a registration that stopped reading its declaration', () => {
  const SCRATCH = scratchTree();
  /* the region the gate rewrites is put back with the rest, or one case would leave the next a stale region */
  const check = (changes, write = true) => SCRATCH.mutate(changes.concat([{ file: 'js/layer-manifest.js', edit: (t) => t }]), () => {
    if (write) SCRATCH.node('scripts/layer-descriptors.mjs', ['--write']);
    return SCRATCH.node('scripts/layer-descriptors.mjs', ['--check']);
  });
  const bad = (extra) => PROBE.replace("  html: true,\n", "  html: true,\n" + extra);
  let r = check([{ file: 'js/layers/zz-probe-layer.js', text: PROBE.replace("'lyrGrpClimate'", "'lyrGrpNoSuchShelf'") }]);
  assert.equal(r.code, 1); assert.match(r.out, /zz-probe-layer\.js: is on the shelf `lyrGrpNoSuchShelf`/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: bad("  atlas: ['map.noSuchCapability'],\n") }]);
  assert.equal(r.code, 1); assert.match(r.out, /capability `map\.noSuchCapability`/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: bad("  registry: ['no-such-registration'],\n") }]);
  assert.equal(r.code, 1); assert.match(r.out, /registry `no-such-registration`/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: bad("  sources: ['No Such Source'],\n") }]);
  assert.equal(r.code, 1); assert.match(r.out, /source `No Such Source`/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: PROBE.replace('order: 15', 'order: 10') }]);
  assert.equal(r.code, 1); assert.match(r.out, /the position `lyrGrpClimate #10` is claimed by both/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: PROBE }], false);
  assert.equal(r.code, 1); assert.match(r.out, /region of js\/layer-manifest\.js does not hold js\/layers\/ as it is/);
  r = check([{ file: 'js/layers/zz-probe-layer.js', text: bad("  colour: 'red',\n") }]);
  assert.equal(r.code, 1); assert.match(r.out, /says `colour`, which is not a field of a layer/);
  /* the outbreaks module registers what its declaration says — make it stop, and the claim is unheld */
  r = check([{ file: 'js/outbreaks.js', edit: (t) => t.replace('IntMapLayers.register(LAYER.registry[0],', "IntMapLayers.register('who-outbreaks',") }]);
  assert.equal(r.code, 1); assert.match(r.out, /wp-dl-outbreaks\.js: registry `outbreaks`/);
});

/* ── ⑤ ──────────────────────────────────────────────────────────────────────────────────── */
test('layer-descriptor ⑤ the modules that read their declaration read what they used to hold', () => {
  /* the satellites' element-span bands, exactly the table js/satellites-live.js held at 281e584c */
  assert.deepEqual(SATS.time.bands, [[11, 5], [1.5, 60], [-Infinity, 14]]);
  const SL = codeOnly(read('js/satellites-live.js'));
  assert.match(SL, /const _SPAN_BANDS=SATS_LAYER\.time\.bands;/);
  assert.match(SL, /import SATS_LAYER from '\.\/layers\/dl-sats\.js';/);
  assert.ok(!/_SPAN_BANDS=\[/.test(SL), 'one copy of the bands');
  /* the outbreaks module: its row id and its registration ids come from its declaration */
  const OB = codeOnly(read('js/outbreaks.js'));
  assert.match(OB, /window\.IntMapLayers\.declaration\('wp-dl-outbreaks'\)/);
  assert.match(OB, /const CB_ID = LAYER\.id;/);
  assert.match(OB, /ShareState\.register\(LAYER\.state,/);
  assert.match(OB, /IntMapLayers\.register\(LAYER\.registry\[0\],/);
  /* the registry answers the question for modules that cannot import (js/outbreaks.js is also run as a script) */
  assert.match(codeOnly(read('js/map-ui.js')), /const declaration=\(id\)=>layerDeclaration\(String\(id\|\|''\)\);/);
});

/* ── ⑥ ──────────────────────────────────────────────────────────────────────────────────── */
test('layer-descriptor ⑥ the dead-export instrument counts a spread read of a namespace (`...kit.x`) and still refuses `other.kit.x`', async () => {
  /* measured: scripts/layer-descriptors.mjs reads `kit.descriptorProblems` and `kit.setProblems` through `out.push(...kit.x(…))`,
     and the instrument called both dead because three dots looked like a member access */
  const { reachedNames } = await import('../scripts/export-readers.mjs');
  const got = reachedNames("const kit = await import('./x.js');\nout.push(...kit.spreadRead(1));\nother.kit.notARead();\nkit.plainRead();\n");
  assert.ok(got.has('spreadRead'), 'a spread read is a read');
  assert.ok(got.has('plainRead'));
  assert.ok(!got.has('notARead'), 'a property that happens to share the name is not the namespace');
});
