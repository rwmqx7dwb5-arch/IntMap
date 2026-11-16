/* ============================================================================
 *  startup-weight — what the boot chunk and the Atlas kernel carry, and the doors that fetch the rest
 * ----------------------------------------------------------------------------
 *  ① the build hands the Atlas kernel each capability WITHOUT its `run`, and the copy is the module's
 *    own entries otherwise — RUN on every js/atlas-cap-*.js through the function the build calls
 *    (scripts/atlas-caps-split.mjs), not a regex over it: every non-`run` property is byte-identical,
 *    every `run` is a call through the door with the entry's own id, and the copy parses.
 *  ② …and a module whose top level could hold state is refused, because the copy and the module are
 *    two instances of it.
 *  ③ the door (js/atlas-caps.js makeCapRunDoor) calls the module's own entry, by id, with `this` that entry; it
 *    refuses an id the module does not hold; a failed download is not remembered.
 *  ④ the modules this round took out of the boot graph are not reachable from the entry by a static
 *    import (the bundler would put them back), and each door asks the registry before it calls.
 *  ⑤ when a build is present, its own report agrees: the kernel chunk holds the copies, not the modules.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { capNamespaces, capMetaSource, capsModulesForKernel, capRunsModule, capRunsAllModule, META_QUERY } from '../scripts/atlas-caps-split.mjs';
import { makeCapRunDoor } from '../js/atlas-caps.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const parse = (s) => acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'module' });
const entriesOf = (src) => {
  const def = parse(src).body.find((n) => n.type === 'ExportDefaultDeclaration');
  return def.declaration.elements.map((el) => {
    const props = {};
    for (const p of el.properties) props[p.key.name || p.key.value] = src.slice(p.start, p.end);
    return props;
  });
};

test('startup-weight ① every capability module\'s kernel copy is its entries without `run`', () => {
  const agg = read('js/atlas-caps-modules.js');
  const ns = capNamespaces(agg);
  const files = readdirSync(join(ROOT, 'js')).filter((f) => /^atlas-cap-[a-z0-9-]+\.js$/.test(f)).sort();
  assert.deepEqual(Object.values(ns).sort(), files, 'the namespaces read off the aggregator are every js/atlas-cap-*.js');
  /* the aggregator points the kernel at the copies, and only at them */
  const kernelAgg = capsModulesForKernel(agg);
  assert.equal((kernelAgg.match(new RegExp("\\.js\\" + META_QUERY + "';", 'g')) || []).length, files.length);
  assert.doesNotMatch(kernelAgg, /from '\.\/atlas-cap-[a-z0-9-]+\.js';/, 'one capability import was not pointed at its copy');
  /* the door's loaders: every namespace, through ONE import() of the module that imports every capability module itself */
  const door = capRunsModule(ns, join(ROOT, 'js')), all = capRunsAllModule(ns, join(ROOT, 'js'));
  assert.equal((door.match(/import\(/g) || []).length, 1, 'the door has one import(), so the runs are one chunk');
  for (const n of Object.keys(ns)) assert.ok(door.includes('  ' + JSON.stringify(n) + ': () => all()'), `${n} has no loader`);
  for (const f of files) assert.ok(all.includes('/js/' + f + '";'), `${f} is not imported by the runs module`);
  let runs0 = 0;
  for (const [n, f] of Object.entries(ns)) {
    const src = read('js/' + f), copy = capMetaSource(src, n, f);
    parse(copy);
    /* a copy's sibling is the sibling's copy — an import of the real module would carry its run code into the kernel */
    assert.doesNotMatch(copy, /from\s+['"]\.\/atlas-cap-[a-z0-9-]+\.js['"]/, `${f}: the copy imports a real capability module`);
    const a = entriesOf(src), b = entriesOf(copy.slice(copy.indexOf('\n') + 1));
    assert.equal(b.length, a.length, `${f}: the copy has a different number of entries`);
    a.forEach((e, i) => {
      for (const k of Object.keys(e)) {
        if (k === 'run') {
          const id = /^row:\s*\[\s*'([^']+)'/.exec(e.row)[1];
          assert.equal(b[i].run, 'run(...__a) { return __capRuns.run(' + JSON.stringify(n) + ', ' + JSON.stringify(id) + ', __a); }', `${f} ${id}: run is not the door`);
          runs0++;
        } else assert.equal(b[i][k], e[k], `${f}: entry ${i}'s ${k} differs in the copy`);
      }
    });
  }
  assert.ok(runs0 > 200, `only ${runs0} runs were replaced — the entries were not read`);
});

test('startup-weight ② a capability module with top-level state is refused', () => {
  const ok = "import { x } from './y.js';\nconst A = 1;\nfunction f() {}\nexport default [{ row: ['a.b', 'b'], run() { return f(); } }];\n";
  assert.doesNotThrow(() => capMetaSource(ok, 'a'));
  for (const bad of [
    "let n = 0;\nexport default [{ row: ['a.b'], run() { return n++; } }];",
    "var n = 0;\nexport default [{ row: ['a.b'], run() {} }];",
    "window.X = 1;\nexport default [{ row: ['a.b'], run() {} }];",
    "export default [{ row: [ID], run() {} }];",
  ]) assert.throws(() => capMetaSource(bad, 'a'), /atlas-caps-split/, bad);
});

test('startup-weight ③ the door calls the module\'s own entry, refuses a stranger, forgets a failed download', async () => {
  let fails = 1, loads = 0;
  const entry = { row: ['ns.go', 'go'], tag: 'T', run(a, d, K) { return this.tag + a + d + K; } };
  const door = makeCapRunDoor({ ns: () => { loads++; if (fails-- > 0) return Promise.reject(new Error('offline')); return Promise.resolve({ default: [{ row: ['ns.other'], run: () => 'no' }, entry] }); } });
  await assert.rejects(door.run('ns', 'ns.go', [1, 2, 3]), /offline/);
  assert.equal(await door.run('ns', 'ns.go', [1, 2, 3]), 'T123', 'the second call asked again, and ran the entry with this = the entry');
  assert.equal(await door.run('ns', 'ns.go', ['x', '', '']), 'Tx', 'a module that arrived is kept');
  assert.equal(loads, 2);
  await assert.rejects(door.run('ns', 'ns.missing', []), /ns\.missing/);
  await assert.rejects(door.run('nope', 'x', []), /nope/);
});

/* the entry's STATIC import closure, from the parsed source of every file it reaches */
function staticClosure(entry) {
  const seen = new Set(); const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.m?js$/.test(f) || !existsSync(f)) continue;
    for (const n of parse(readFileSync(f, 'utf8')).body) {
      const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source.value : null;
      if (src && /^\.\.?\//.test(src)) stack.push(resolve(dirname(f), src));
    }
  }
  return new Set([...seen].map((a) => relative(ROOT, a).replace(/\\/g, '/')));
}

test('startup-weight ④ the planner, the simulators and the legal text are not in the boot graph, and their doors ask first', () => {
  const eager = staticClosure('src/main.js');
  assert.ok(eager.has('js/app-body.js') && eager.has('js/legal.js'), 'the entry graph was not read');
  for (const f of ['js/drone-nav.js', 'js/drone-ops.js', 'js/sims.js', 'js/legal-text.js']) assert.ok(!eager.has(f), `${f} is back in the boot graph`);
  /* the share registry restores a simulator by its key = its lazy name (js/map-ui.js IntMapShareState.apply) */
  for (const [k, file] of [['drone', 'js/drone-nav.js'], ['radiation', 'js/sims.js'], ['sun', 'js/sims.js']]) {
    assert.ok(LAZY_REGISTRY[k], `no lazy module «${k}» — a shared link carrying its state would not fetch it`);
    assert.match(read(file), new RegExp(`register\\('${k}'`), `${file} registers its share state under a key that is not its lazy name`);
  }
  /* every reader that CALLS one of them (not the passive «is it open» readers) asks the registry first */
  const doors = [
    ['js/map-ui.js', /_lazy\('radiation',/], ['js/map-ui.js', /_lazy\('sun',/], ['js/map-ui.js', /_lazy\('drone',/],
    ['js/tool-panel.js', /need\('popArea'\)/], ['js/tool-panel.js', /need\('sun'\)/],
    ['js/map-tools.js', /need\('popArea'\)/], ['js/map-tools.js', /need\('transitReach'\)/],
    ['js/atlas-cap-routing.js', /need\('drone'\)/], ['js/atlas-cap-routing.js', /need\('transitReach'\)/],
    ['js/atlas-cap-research.js', /need\('popArea'\)/],
    ['js/legal.js', /need\('legalText'\)/],
  ];
  for (const [f, re] of doors) assert.match(read(f), re, `${f} calls the module without fetching it`);
  /* the capabilities that call a simulator declare it, so the executor fetches it before the run (row column 10) */
  const caps = read('js/atlas-capabilities.js');
  for (const [id, mod] of [['sim.radiation', 'radiation'], ['sim.sunPosition', 'sun'], ['sim.sunHours', 'sun'], ['data.populationIn', 'popArea']]) {
    assert.match(caps, new RegExp(`\\["${id.replace('.', '\\.')}",[^\\]]*"${mod}"\\]`), `${id} does not declare «${mod}» (the generated row)`);
  }
});

const REPORT = join(ROOT, '.perf', 'build-report.json');
const reportFresh = () => {
  if (!existsSync(REPORT)) return 'no build report (run `npm run build`)';
  const t = statSync(REPORT).mtimeMs;
  return ['scripts/atlas-caps-split.mjs', 'js/atlas-caps-modules.js'].some((f) => statSync(join(ROOT, f)).mtimeMs > t) ? 'the build report predates the split' : false;
};
test('startup-weight ⑤ the build\'s own report agrees: the kernel carries the copies, the modules are the atlas-cap-runs chunk', { skip: reportFresh() }, () => {
  const r = JSON.parse(readFileSync(REPORT, 'utf8'));
  const chunks = Object.values(r.chunks);
  const kernel = chunks.find((c) => c.name === 'atlas-console');
  assert.ok(kernel, 'no atlas-console chunk');
  const mods = Object.keys(kernel.modules);
  const copies = mods.filter((m) => m.endsWith(META_QUERY));
  const whole = mods.filter((m) => /js\/atlas-cap-[a-z0-9-]+\.js$/.test(m));
  assert.ok(copies.length >= 20, `the kernel holds ${copies.length} capability copies`);
  assert.deepEqual(whole, [], 'a capability module (with its run) is in the kernel chunk');
  /* …nor in any chunk the kernel loads with it: what the first opening of Atlas downloads is the kernel's static closure */
  const files = Object.keys(r.chunks), eagerSet = new Set(r.eager.chunks);
  const kernelFile = files.find((f) => r.chunks[f] === kernel), seen = new Set(), st = [kernelFile];
  while (st.length) { const f = st.pop(); if (seen.has(f) || eagerSet.has(f) || !r.chunks[f]) continue; seen.add(f); for (const i of r.chunks[f].imports || []) st.push(i); }
  const carried = [...seen].flatMap((f) => Object.keys(r.chunks[f].modules)).filter((m) => /js\/atlas-cap-[a-z0-9-]+\.js$/.test(m));
  assert.deepEqual(carried, [], 'the chunks the kernel loads statically carry capability modules with their run');
  const runs = chunks.find((c) => c.name === 'atlas-cap-runs');
  assert.ok(runs && Object.keys(runs.modules).filter((m) => /js\/atlas-cap-[a-z0-9-]+\.js$/.test(m)).length >= 20, 'the capability modules are not in the atlas-cap-runs chunk');
  assert.ok(!r.eager.chunks.some((f) => /atlas-cap-runs/.test(f)), 'the runs chunk is eager');
  for (const f of ['js/drone-nav.js', 'js/sims.js', 'js/legal-text.js']) {
    assert.ok(!r.eager.chunks.some((file) => r.chunks[file] && Object.keys(r.chunks[file].modules).includes(f)), `${f} is in an eager chunk`);
  }
});
