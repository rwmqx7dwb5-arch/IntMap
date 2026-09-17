/* ============================================================================
 *  #R783 · 画面が無いところで動く「同じ」GIS と、第三者が検証できる再現性の文書
 * ----------------------------------------------------------------------------
 *  An outside review (§8) read this layer and named what fifteen green test files did not: every
 *  GIS kernel resolves its neighbours from the GLOBAL SCOPE at call time (js/gis-ops.js:70,
 *  js/gis-layers.js:87, js/gis-raster.js:138 …), and the things the layer does not own — the geodesy,
 *  the layer registry, the renderer, the upload door — are supplied by the page. Each module was
 *  individually loadable in Node. THE ASSEMBLY WAS NOT: js/gis-core.js touched `window` on its first
 *  line, so the one file that decides what is mounted and in which order could not be imported
 *  outside a browser at all.
 *
 *  ⚠⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「makeGisRuntime が ok を返す」 is a sentence about an
 *  implementation, and it would pass over a runtime that mounts a SECOND set of kernels answering
 *  different numbers. What is measured is what a caller loses:
 *
 *    ① a GIS run with no window answers something OTHER than the same run in a browser — measured by
 *       running the same analysis in two separate processes and comparing the ANSWER's fingerprint,
 *       not the shape of the object it came in. ⚠ Both worlds are child processes deliberately: an
 *       in-process 「window を消したつもり」 measures the test's own bookkeeping.
 *    ② a dependency that was not handed over is quietly taken off the scope instead, so the caller
 *       cannot tell which half of their runtime belongs to the page
 *    ③ a refusal leaves a global `window` behind it, so the NEXT call is refused for a reason the
 *       first refusal created (this was real: the first version of resolveScope installed the scope
 *       before checking the dependencies)
 *    ④ asking twice builds two registries under one global, and a dataset id resolves in one of them
 *    ⑤ a manifest's filled fields are read as 「辿れる」: a recipe whose inputs are not in the
 *       document, a body with no fingerprint and a step whose engine stated null are all traceability
 *       holes, and all three used to be reported by no field at all
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const url = (rel) => pathToFileURL(join(ROOT, rel)).href;

/* ── the geodesy, as an injected dependency ────────────────────────────────────────────────────
   js/geodesy.js is a classic script that writes onto `window`; run into a bare object it yields the
   module itself, which is what a headless caller hands over. ⚠ This is the real one, not a stub: a
   stub geodesy would make ① compare two answers neither of which is the product's. */
function geodesyModule() {
  const o = {};
  new Function('window', read('js/geodesy.js'))(o);
  return o.IntMapGeodesy;
}

/* ══ ① 同じ入力に、同じ答え — window の有る世界と無い世界で ══════════════════════════════════
   One script, two modes, two processes. The analysis is written ONCE: two copies of it would let the
   comparison pass over two different analyses producing two matching numbers by coincidence. */
const CHILD = `
import { readFileSync } from 'node:fs';
const MODE = process.env.R783_MODE;
const GEO = readFileSync(${JSON.stringify(join(ROOT, 'js/geodesy.js'))}, 'utf8');
const geodesyInto = (o) => { new Function('window', GEO)(o); return o.IntMapGeodesy; };
const out = { mode: MODE };
let gis, scope;

if (MODE === 'browser') {
  /* The page: a window exists before anything is imported, and it carries what the app supplies. */
  const w = {}; globalThis.window = w; geodesyInto(w);
  await import(${JSON.stringify(url('js/gis-core.js'))});
  out.doorOnScope = typeof (w.IntMapModules && w.IntMapModules.gisCore) === 'function';
  gis = w.IntMapModules.gisCore({ lang: 'en' });
  out.scopeInstalled = false;
  scope = w;
} else {
  /* No window, and none is made by the caller: the runtime is handed the scope and the one
     dependency it declares as required. */
  out.windowBeforeImport = typeof globalThis.window;
  const mod = await import(${JSON.stringify(url('js/gis-core.js'))});
  out.windowAfterImport = typeof globalThis.window;
  scope = {};
  const r = mod.makeGisRuntime({ scope: scope, externals: { geodesy: geodesyInto({}) }, host: { lang: 'en' } });
  if (!r.ok) { console.log('##JSON##' + JSON.stringify({ mode: MODE, ok: false, why: r.why, detail: r.detail })); process.exit(0); }
  gis = r.gis;
  out.scopeInstalled = r.scopeInstalled;
  out.externals = r.externals;
  out.doorOnScope = typeof (scope.IntMapModules && scope.IntMapModules.gisCore) === 'function';
}

/* ── THE ANALYSIS. 探す → 確認する → 演算する → 根拠を返す, through gis.flow, which is the same
   surface Atlas is handed (js/gis-core.js flow). */
const FEATS = [
  { type: 'Feature', properties: { name: 'a', n: 1 }, geometry: { type: 'Point', coordinates: [139.7, 35.7] } },
  { type: 'Feature', properties: { name: 'b', n: 4 }, geometry: { type: 'Point', coordinates: [135.5, 34.7] } },
  { type: 'Feature', properties: { name: 'c', n: 9 }, geometry: { type: 'Point', coordinates: [141.3, 43.1] } },
];
gis.data.add({ id: 'src', title: 'fixture', features: FEATS,
  provenance: { kind: 'import', file: 'fixture.geojson', format: 'geojson', readAt: 1700000000000 } });
await gis.geometry.ready();
const cat = gis.flow.find();
out.ops = (cat.ops || []).map((o) => o.id).sort();
out.datasets = (cat.datasets || []).length;
/* 演算は Atlas に渡っている口そのもの（gis.flow.run === atlas.run）。⚠ id は付けない: 付けない
   ときに何と名づけられるかも、世界によって変わってはならない事実のひとつ。 */
const f = await gis.flow.run({ op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
out.filter = { ok: !!f.ok, why: f.why || null, id: f.ok ? f.dataset.id : null, count: f.ok ? f.dataset.count : null };
const b = await gis.ops.run({ id: 'buf', op: 'buffer', inputs: [f.ok ? f.dataset.id : 'none'], params: { radiusKm: 25 } });
out.buffer = { ok: !!b.ok, why: b.why || null, count: b.ok ? b.dataset.count : null };
const man = await gis.flow.account('buf');
out.manifestOk = !!man.ok;
out.fingerprint = man.answer && man.answer.fingerprint;
out.steps = (man.steps || []).map((s) => ({ id: s.id, origin: s.origin, data: s.trace.data, env: s.trace.environment, same: s.trace.retrieval.sameAnswer }));
out.traceability = man.traceability;
out.gaps = (man.gaps || []).map((g) => g.gap).sort();
out.kernelsLoaded = man.environment.kernelsLoaded;
out.manifestVersion = man.manifestVersion;
/* The same instances the panel and Atlas would reach — asked of the scope, which is where they look. */
out.oneRegistry = scope.IntMapData === gis.data && scope.IntMapGis === gis;
out.ok = true;
console.log('##JSON##' + JSON.stringify(out));
`;

function runChild(mode) {
  /* ⚠ THE MODE TRAVELS IN THE ENVIRONMENT, NOT IN argv. `node -e <script> browser` does NOT put the
     word at argv[2] — the first version of this read `process.argv[2]`, got `undefined` in BOTH
     runs, and therefore compared the headless world against itself: every assertion below passed
     while the browser path had never been exercised. A comparison whose two sides can silently
     become the same side is the shape .agents/rules/no-ad-hoc-hardcoding.md §5 keeps recording. */
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD], { encoding: 'utf8', cwd: ROOT, env: Object.assign({}, process.env, { R783_MODE: mode }) });
  const line = stdout.split('\n').find((l) => l.indexOf('##JSON##') === 0);
  assert.ok(line, 'child printed no result:\n' + stdout);
  return JSON.parse(line.slice('##JSON##'.length));
}

test('① window の無い Node で組み立てた GIS が、ブラウザ経路と同じ答えを返す', () => {
  const head = runChild('headless');
  const browser = runChild('browser');
  assert.equal(head.ok, true, 'headless: ' + JSON.stringify(head));
  assert.equal(browser.ok, true, 'browser: ' + JSON.stringify(browser));

  /* The premise of the whole test: the headless process really had no window, and importing
     js/gis-core.js did not make one (that first line was the defect). */
  assert.equal(head.windowBeforeImport, 'undefined');
  assert.equal(head.windowAfterImport, 'undefined');
  /* …and the runtime said out loud that IT supplied the scope. A silent global install is the same
     mechanism with nobody able to see it. */
  assert.equal(head.scopeInstalled, true);
  assert.equal(browser.scopeInstalled, false);

  /* ⚠ THE ANSWER, NOT THE SHAPE. */
  assert.equal(head.buffer.ok, true, 'headless buffer: ' + head.buffer.why);
  assert.equal(browser.buffer.ok, true, 'browser buffer: ' + browser.buffer.why);
  assert.ok(head.fingerprint, 'headless に答えの指紋が無い');
  assert.equal(head.fingerprint, browser.fingerprint,
    '同じ入力・同じレシピなのに、window の有無で答えが違う');
  assert.deepEqual(head.buffer, browser.buffer);
  assert.deepEqual(head.filter, browser.filter);

  /* The catalogue — 探す と 確認する — is the same surface in both worlds, and it is not empty. */
  assert.ok(head.ops.length >= 10, 'op の目録が空に近い: ' + head.ops.length);
  assert.deepEqual(head.ops, browser.ops, 'Atlas に渡る op の目録が世界によって違う');
  assert.deepEqual(head.kernelsLoaded, browser.kernelsLoaded, '載っているカーネルの集合が違う');
  assert.deepEqual(head.traceability, browser.traceability);
  assert.deepEqual(head.gaps, browser.gaps);
  assert.deepEqual(head.steps, browser.steps);

  /* One assembly, reachable through the scope: the panel, Atlas and an outside caller all read these
     globals, so a second set mounted beside them is the defect this file exists to refuse. */
  assert.equal(head.oneRegistry, true, 'headless: 組み立てたカーネルが scope から辿れない');
  assert.equal(browser.oneRegistry, true);
  /* And the shell's door exists in both worlds — the browser gets it at import time, the headless
     assembly gets it on the scope it was given. */
  assert.equal(head.doorOnScope, true);
  assert.equal(browser.doorOnScope, true);
});

/* ══ ② 依存が欠けたら、黙って既定へ落ちずに理由を述べて断る ═══════════════════════════════════ */

async function core() {
  delete globalThis.window;
  return await import('../js/gis-core.js');
}

test('② required な依存が渡されていなければ、名前と用途を述べて断る', async () => {
  const { makeGisRuntime } = await core();
  const r = makeGisRuntime({ scope: {}, externals: {} });
  assert.equal(r.ok, false, 'geodesy 無しで組み立てが通った');
  assert.equal(r.why, 'dependency-missing');
  const miss = r.detail.missing;
  assert.equal(miss.length, 1, JSON.stringify(miss));
  assert.equal(miss[0].name, 'geodesy');
  assert.equal(miss[0].global, 'IntMapGeodesy');
  /* ⚠ 断り文には、何が出来なくなるかが要る。コードだけの拒否は、読み手に次の手を渡さない。 */
  assert.ok(miss[0].for && miss[0].for.length > 20, '何のための依存かが述べられていない');
});

test('② 渡していない依存を scope から黙って拾わない', async () => {
  const { makeGisRuntime } = await core();
  /* A scope that happens to carry a layer registry, and a caller who did not hand it over. */
  const scope = { IntMapLayers: { state: () => null } };
  const r = makeGisRuntime({ scope: scope, externals: { geodesy: geodesyModule() } });
  assert.equal(r.ok, false, '注入した組の半分が page のもののまま通った');
  assert.equal(r.why, 'scope-carries-uninjected');
  assert.deepEqual(r.detail.deps.map((d) => d.name), ['layers']);
});

test('② 断ったときに、グローバルへ window を残さない', async () => {
  const { makeGisRuntime } = await core();
  const first = makeGisRuntime({ scope: {}, externals: {} });
  assert.equal(first.ok, false);
  assert.equal(typeof globalThis.window, 'undefined',
    '拒否が window を据え置いたので、次の呼び出しは自分が作った状態を理由に断られる');
  /* …and the next call, with the dependency supplied, works — which is what a left-behind scope
     would have broken (scope-conflict). */
  const second = makeGisRuntime({ scope: {}, externals: { geodesy: geodesyModule() } });
  assert.equal(second.ok, true, second.why);
  assert.equal(second.scopeInstalled, true);
});

test('② window が無く scope も渡されなければ、推測せずに断る', async () => {
  const { makeGisRuntime } = await core();
  const r = makeGisRuntime({ host: null });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'scope-missing');
  assert.ok(r.detail.because.length > 20, 'なぜ scope が要るのかが述べられていない');
});

/* ══ ③ 二度目は「もう済んでいる」と同じ組を返す ════════════════════════════════════════════════ */

test('③ 同じ scope と同じ host で二度呼んでも、カーネルは 1 組', async () => {
  const { makeGisRuntime } = await core();
  const scope = {}; scope.IntMapGeodesy = geodesyModule();
  const host = { lang: 'en' };
  const a = makeGisRuntime({ scope: scope, host: host });
  assert.equal(a.ok, true, a.why);
  const b = makeGisRuntime({ scope: scope, host: host });
  assert.equal(b.ok, true, b.why);
  assert.equal(b.reused, true, '二度目が「もう済んでいる」と述べていない');
  assert.equal(b.gis, a.gis, '二度目が別の組を作った（同じ global に 2 つの registry）');
  /* A dataset registered through the first must resolve through the second. That is the thing two
     registries break, and it is measured rather than inferred from object identity alone. */
  a.gis.data.add({ id: 'one', title: 'one', features: [] });
  assert.ok(b.gis.data.get('one'), '二度目の組から、一度目に入れた dataset が見えない');
});

/* ══ ④ flow は 5 段の実装そのものを指している（写しではない） ═════════════════════════════════ */

test('④ flow の各段は、既にその仕事をしている関数そのもの', async () => {
  const { makeGisRuntime } = await core();
  const scope = {}; scope.IntMapGeodesy = geodesyModule();
  const r = makeGisRuntime({ scope: scope, host: { lang: 'en' } });
  assert.equal(r.ok, true, r.why);
  const gis = r.gis;
  assert.equal(gis.flow.find, gis.atlas.catalogue);
  assert.equal(gis.flow.acquire, gis.atlas.acquire);
  assert.equal(gis.flow.run, gis.atlas.run);
  assert.equal(gis.flow.draw, gis.atlas.draw);
  assert.equal(gis.flow.account, gis.project.manifest);
  assert.equal(gis.flow.verify, gis.project.verify);
});

/* ══ ⑤ manifest から、原データと実行環境に到達できる — できないときはそう述べる ═══════════════ */

async function analysed(extra) {
  const { makeGisRuntime } = await core();
  const scope = {};
  scope.IntMapGeodesy = geodesyModule();
  if (extra) extra(scope);
  const r = makeGisRuntime({ scope: scope, host: { lang: 'en' } });
  assert.equal(r.ok, true, r.why);
  const gis = r.gis;
  gis.data.add({
    id: 'src', title: 'fixture',
    features: [
      { type: 'Feature', properties: { n: 1 }, geometry: { type: 'Point', coordinates: [139.7, 35.7] } },
      { type: 'Feature', properties: { n: 4 }, geometry: { type: 'Point', coordinates: [135.5, 34.7] } },
    ],
    provenance: { kind: 'import', file: 'fixture.geojson', format: 'geojson', readAt: 1700000000000, licence: 'CC0' },
  });
  await gis.geometry.ready();
  const f = await gis.ops.run({ id: 'flt', op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
  assert.equal(f.ok, true, f.why);
  return { gis: gis, scope: scope };
}

test('⑤ 演算の段は、この文書だけで再実行できる — 参照どおりに実行すると同じ答えが出る', async () => {
  const { gis } = await analysed();
  const man = await gis.project.manifest('flt');
  assert.equal(man.ok, true, man.why);
  const step = man.steps.find((s) => s.id === 'flt');
  assert.equal(step.trace.data, 'recipe', JSON.stringify(step.trace));
  assert.equal(step.trace.environment, 'recorded', JSON.stringify(step.engineThen));

  /* ⚠ THE REFERENCE IS EXECUTED. A `retrieval` block nobody ever ran would be exactly the
     「欄が埋まっている」 this test refuses: the document says how to get the answer again, so the
     answer is got again, through the call it names, and checked against the fingerprint it states. */
  const re = step.trace.retrieval;
  assert.equal(re.by, 'replay');
  assert.equal(re.call, 'IntMapGisOps.run');
  gis.data.remove('flt');
  const again = await gis.ops.run({ id: 'flt', op: re.args.op, inputs: re.args.inputs, params: re.args.params });
  assert.equal(again.ok, true, again.why);
  const v = await gis.project.verify('flt', man);
  assert.equal(v.verdict, 'same', JSON.stringify(v));
  /* The environment leg of the same question, through the same comparison the load path uses. */
  assert.equal(v.engine.verdict, 'same', JSON.stringify(v.engine));
});

test('⑤ 取り込みの段は、本体が要ると述べる — 指紋は「持っていること」の代わりにならない', async () => {
  const { gis } = await analysed();
  const man = await gis.project.manifest('flt');
  const src = man.steps.find((s) => s.id === 'src');
  assert.equal(src.trace.data, 'body');
  assert.equal(src.trace.retrieval.inThisDocument, false, '本体がこの文書に入っていると述べている');
  assert.equal(src.trace.retrieval.keptBy, 'IntMapGisProject.save');
  assert.equal(src.trace.retrieval.sameAnswer, 'same-bytes-only');
  assert.equal(src.trace.retrieval.file, 'fixture.geojson');
  assert.ok(src.trace.retrieval.expect, '同じ本体かを確かめる手段が無い');
  /* ⚠ THE PROVENANCE TRAVELS VERBATIM, so a statement this file has no field for is not lost. */
  assert.equal(src.provenance.licence, 'CC0');
  /* 鎖全体としては「本体を渡してもらえば辿れる」——「全部導ける」ではない。 */
  assert.equal(man.traceability.data, 'with-bodies');
  assert.deepEqual(man.traceability.blockedBy, []);
  assert.ok(man.gaps.some((g) => g.gap === 'source-bytes-not-kept'));
});

test('⑤ 入力がこの文書に無いレシピは、辿れないと述べる（欄は埋まっている）', async () => {
  const { gis } = await analysed();
  /* The reader deleted the input and kept the result — an ordinary state, and the recipe is still
     complete: op, params and the input's id are all there. What is missing is the input itself. */
  gis.data.remove('src');
  const man = await gis.project.manifest('flt');
  const step = man.steps.find((s) => s.id === 'flt');
  assert.equal(step.recipe.inputs[0], 'src', 'レシピの欄は埋まっているはず（そこが要点）');
  assert.equal(step.trace.data, 'recipe-inputs-missing');
  assert.deepEqual(step.trace.dataDetail.missingInputs, ['src']);
  assert.equal(man.traceability.data, 'partial');
  assert.deepEqual(man.traceability.blockedBy.map((b) => [b.step, b.axis]), [['flt', 'data']]);
  assert.ok(man.gaps.some((g) => g.gap === 'recipe-inputs-missing'));
});

test('⑤ 指紋を取らなかった文書は、本体の同一性を確かめられないと述べる', async () => {
  const { gis } = await analysed();
  const man = await gis.project.manifest('flt', { fingerprint: false });
  const src = man.steps.find((s) => s.id === 'src');
  assert.equal(src.trace.data, 'body-unverifiable');
  assert.equal(src.trace.retrieval.verifyWith, null);
  assert.equal(man.traceability.data, 'partial');
  assert.ok(man.gaps.some((g) => g.gap === 'body-not-verifiable'));
  /* ⚠ AND NOT REPORTED AS THE OTHER HOLE: 'fingerprint-unavailable' is 「取ろうとして取れなかった」,
     which is a different fact from 「取らないよう頼まれた」. */
  assert.ok(!man.gaps.some((g) => g.gap === 'fingerprint-unavailable'));
});

test('⑤ エンジンの版を述べなかった部品があれば、そう述べる（「同じ」とは言わない）', async () => {
  /* A module that is loaded, is discovered as a kernel by the prefix rule, and states an empty
     version — which engineNow records as null. 「測れなかった」 is not 「同じ」. */
  const { gis } = await analysed((scope) => { scope.IntMapGisSilent = { version: () => '' }; });
  const man = await gis.project.manifest('flt');
  const step = man.steps.find((s) => s.id === 'flt');
  assert.equal(step.engineThen.silent, null, JSON.stringify(step.engineThen));
  assert.equal(step.trace.environment, 'partly-recorded');
  assert.equal(step.trace.retrieval.sameAnswer, 'unknown',
    '版を述べない部品があるのに「エンジンが同じなら同じ答え」と述べている');
  assert.equal(man.traceability.environment, 'partly-recorded');
  assert.ok(man.gaps.some((g) => g.gap === 'engine-partly-recorded'));
});

test('⑤ 実行環境として、載っているが版を述べない module も名指される', async () => {
  const { gis } = await analysed();
  const man = await gis.project.manifest('flt');
  const env = man.environment;
  assert.ok(env.kernelsLoaded.indexOf('IntMapGisOps') >= 0);
  /* ⚠ engineNow では原理的に見えない集合。null の値と、無い鍵と、「載っているが黙っている」は
     別の事実で、最初の 2 つしか engineNow は持てない。 */
  assert.ok(env.statesNoVersion.indexOf('IntMapGisProject') >= 0, JSON.stringify(env.statesNoVersion));
  assert.equal(env.digest, 'sha256');
  assert.equal(env.recordVersion, gis.project.recordVersion);
  assert.equal(man.manifestVersion, 2, 'trace / environment / traceability が増えたのに版が上がっていない');
});
