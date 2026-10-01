/* ============================================================================
 *  deps-runtime-majors — Turf 7 and supabase-js 2.117, checked against the libraries themselves
 * ----------------------------------------------------------------------------
 *  Every check below EVALUATES the shipped function with the real, installed library rather than
 *  reading its source for a spelling (#R505: a source-reading check cannot see behaviour). The
 *  function is lifted out of the shipped file with acorn and run as written.
 *
 *    ① Turf 7's union takes ONE FeatureCollection; the two dissolves in js/time-borders.js still
 *       dissolve (the 6.5 two-argument form throws, and their catch would have swallowed it).
 *    ② Turf 7's bbox trusts a declared `bbox` member; the one src/vendor.js publishes does not.
 *    ③ vite.config.js decides the eager `geo` chunk by static reachability, not by a list of names.
 *    ④ the Storage / Functions stub fails loudly, covers every name supabase-js imports from those
 *       two packages, and nothing in the app reaches for either client.
 *    ⑤ a passkey failure is classified from the error the REAL auth-js produces.
 *    ⑥ the passkey delete call names the parameter the SDK actually reads.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const R = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);

function parse(src, sourceType) {
  return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true });
}
/* the source text of the first function declaration / const declarator with this name
   (module-graph: every js/ file is an ES module now, so the default parse is a module's) */
function lift(src, name, sourceType = 'module') {
  let hit = null;
  walk.full(parse(src, sourceType), (n) => {
    if (hit) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = src.slice(n.start, n.end);
    if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === name)) hit = src.slice(n.start, n.end);
  });
  assert.ok(hit, `${name} is still declared where this check expects it`);
  return hit;
}

/* spherical area — the check needs a yardstick that is not the thing under test */
const turfArea = (await import('@turf/area')).default;
const { featureCollection, polygon } = await import('@turf/helpers');
const union7 = (await import('@turf/union')).default;

test('deps-runtime-majors ① the Tibet and East Prussia dissolves still dissolve under Turf 7', () => {
  const src = R('js/time-borders.js');
  const turf = { union: union7, featureCollection };
  const cases = [
    { fn: '_mergeTibet', consts: ['_TIBET_RE'], keep: 'China', gone: 'Tibet' },
    { fn: '_mergeEastPrussia', consts: ['_EPRUS_RE', '_DEU_RE'], keep: 'Germany', gone: 'East Prussia' },
  ];
  for (const c of cases) {
    const body = c.consts.map((k) => lift(src, k)).join('\n') + '\n' + lift(src, c.fn) + `\nreturn ${c.fn};`;
    // eslint-disable-next-line no-new-func
    const merge = new Function('window', body)({ turf });
    const main = polygon([[[10, 40], [20, 40], [20, 50], [10, 50], [10, 40]]], { NAME: c.keep });
    const part = polygon([[[20, 40], [26, 40], [26, 50], [20, 50], [20, 40]]], { NAME: c.gone });
    const other = polygon([[[-5, 0], [0, 0], [0, 5], [-5, 5], [-5, 0]]], { NAME: 'Elsewhere' });
    const out = merge(featureCollection([main, part, other]));
    const names = out.features.map((f) => f.properties.NAME);
    assert.deepEqual(names.sort(), [c.keep, 'Elsewhere'].sort(), `${c.fn}: ${c.gone} is dissolved, not renamed`);
    const merged = out.features.find((f) => f.properties.NAME === c.keep);
    assert.equal(merged.geometry.type, 'Polygon', `${c.fn}: the shared border is gone — one ring, not two`);
    const want = turfArea(main) + turfArea(part);
    assert.ok(Math.abs(turfArea(merged) - want) / want < 1e-9, `${c.fn}: and the area is the sum of the two`);
  }
  /* the trap the migration closed: the 6.5 call shape is an exception in 7.x, which both loops catch */
  assert.throws(() => union7(polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]), polygon([[[1, 0], [2, 0], [2, 1], [1, 0]]])),
    /at least 2 geometries/, 'Turf 7 rejects union(a, b) — which is why the call sites pass featureCollection([a, b])');
});

test('deps-runtime-majors ② the published bbox measures the coordinates, whatever the object claims', async () => {
  const turfBbox = (await import('@turf/bbox')).default;
  // eslint-disable-next-line no-new-func
  const bbox = new Function('turfBbox', lift(R('src/vendor.js'), 'bbox', 'module') + '\nreturn bbox;')(turfBbox);
  const f = { type: 'Feature', bbox: [0, 0, 1, 1], properties: {},
    geometry: { type: 'LineString', coordinates: [[139, 35], [141, 36]] } };
  assert.deepEqual(turfBbox(f), [0, 0, 1, 1], 'Turf 7 alone returns the declared member unread — the reason for the wrapper');
  assert.deepEqual(bbox(f), [139, 35, 141, 36], 'the app\'s bbox is the extent of the coordinates');
  assert.deepEqual(bbox(f, { recompute: false }), [139, 35, 141, 36], 'and a caller cannot switch that off by accident');
});

test('deps-runtime-majors ③ the eager geo chunk is the statically reachable @turf, not a hand list', async () => {
  const src = R('vite.config.js');
  // eslint-disable-next-line no-new-func
  const staticallyReached = new Function(lift(src, '_staticReach', 'module') + '\n' + lift(src, 'staticallyReached', 'module') + '\nreturn staticallyReached;')();
  /* entry → vendor → @turf/along → @turf/helpers ; vendor ⇢ import() @turf/buffer → @turf/jsts.
     Rolldown's ModuleInfo carries `importers` (static) and `dynamicImporters` separately. */
  const mk = () => ({
    entry: { isEntry: true, importers: [], dynamicImporters: [] },
    vendor: { isEntry: false, importers: ['entry'], dynamicImporters: [] },
    'node_modules/@turf/along': { isEntry: false, importers: ['vendor'], dynamicImporters: [] },
    'node_modules/@turf/helpers': { isEntry: false, importers: ['vendor', 'node_modules/@turf/along', 'node_modules/@turf/buffer'], dynamicImporters: [] },
    'node_modules/@turf/buffer': { isEntry: false, importers: [], dynamicImporters: ['vendor'] },
    'node_modules/@turf/jsts': { isEntry: false, importers: ['node_modules/@turf/buffer'], dynamicImporters: [] },
    /* a cycle among lazy modules must terminate, and still answer «not eager» */
    'node_modules/x/a': { isEntry: false, importers: ['node_modules/x/b'], dynamicImporters: ['vendor'] },
    'node_modules/x/b': { isEntry: false, importers: ['node_modules/x/a'], dynamicImporters: [] },
  });
  const graph = mk();
  const info = (id) => graph[id] || null;
  const eager = Object.keys(graph).filter((id) => staticallyReached(id, info)).sort();
  assert.deepEqual(eager, ['entry', 'node_modules/@turf/along', 'node_modules/@turf/helpers', 'vendor'],
    'what only a dynamic import() reaches (buffer, and its engine whatever it is called) is not eager');
  /* the memo is keyed on the ModuleInfo objects, so a new chunking pass (new objects) is asked afresh:
     the same id, now statically imported by the entry, is eager in the new graph */
  const next = mk(); next['node_modules/@turf/jsts'].importers.push('entry');
  assert.equal(staticallyReached('node_modules/@turf/jsts', (id) => next[id] || null), true, 'a verdict does not outlive its graph');
  assert.equal(staticallyReached('node_modules/@turf/jsts', info), false, 'and the old graph keeps its own');

  /* the group asks this question rather than a list, and asks it through the real config object */
  const { default: cfg } = await import('../vite.config.js');
  const geo = cfg.build.rolldownOptions.output.codeSplitting.groups.find((g) => g.debugName === 'geo');
  assert.ok(geo && typeof geo.name === 'function', 'the geo group names its members by asking the graph');
  assert.ok(geo.test('/r/node_modules/@turf/jsts/dist/jsts.min.js') && geo.test('/r/node_modules/topojson-client/src/index.js'),
    'the packages the group is about');
  const byId = mk();
  const ctx2 = { getModuleInfo: (id) => byId[id] || null };
  assert.equal(geo.name('node_modules/@turf/along', ctx2), 'geo', 'a statically reached @turf module is eager geo');
  assert.equal(geo.name('node_modules/@turf/jsts', ctx2), null, 'a lazily reached one gets no name here');
  assert.doesNotMatch(src, /'turf-jsts'|'@turf\/buffer'|'@turf\/convex'|'splaytree', 'concaveman'/,
    'the retired exclusion list is not back');
});

test('deps-runtime-majors ④ Storage and Functions are refused loudly, fully, and reached for by nothing', async () => {
  const stubPath = join(ROOT, 'src/supabase-unbundled-stub.js');
  const stub = await import(pathToFileURL(stubPath).href);
  const storage = new stub.StorageClient('https://x/storage/v1', {}, fetch);
  assert.throws(() => storage.from('bucket'), /not bundled in IntMap.*supabase-unbundled-stub/, 'the first read of supabase.storage throws, naming why');
  assert.throws(() => new stub.FunctionsClient('https://x/functions/v1', {}), /not bundled in IntMap/, 'supabase.functions throws at once');

  /* every name the SDK imports from the two packages exists on the stub — read out of the SDK, so the
     next SDK release that imports one more name fails HERE instead of at build time on CI */
  const sdkPath = require.resolve('@supabase/supabase-js').replace(/index\.cjs$/, 'index.mjs');
  const sdk = readFileSync(sdkPath, 'utf8');
  const wanted = [];
  for (const n of parse(sdk, 'module').body) {
    if (n.type === 'ImportDeclaration' && /^@supabase\/(storage|functions)-js$/.test(n.source.value)) {
      for (const s of n.specifiers) wanted.push(s.imported ? s.imported.name : 'default');
    }
  }
  assert.ok(wanted.includes('StorageClient') && wanted.includes('FunctionsClient'), 'the SDK still imports the two clients');
  assert.deepEqual(wanted.filter((w) => !(w in stub)), [], 'the stub exports every name the SDK imports from them');

  /* the alias really points both packages — and only them — at the stub */
  let find = null;
  walk.full(parse(R('vite.config.js'), 'module'), (n) => {
    if (n.type === 'Property' && n.key && n.key.name === 'find' && n.value.regex && /supabase/.test(n.value.regex.pattern)) {
      find = new RegExp(n.value.regex.pattern, n.value.regex.flags);
    }
  });
  assert.ok(find, 'vite.config.js aliases the Supabase packages');
  assert.ok(find.test('@supabase/storage-js') && find.test('@supabase/functions-js'), 'both unused clients');
  for (const used of ['@supabase/auth-js', '@supabase/postgrest-js', '@supabase/realtime-js', '@supabase/supabase-js']) {
    assert.ok(!find.test(used), `${used} is used and must stay real`);
  }

  /* nothing in the app reaches for either client. The client's names are DISCOVERED: `window.sb`
     and every binding assigned from it (DB, HOST.DB …), then any `<name>.storage` / `<name>.functions`. */
  const files = ['js', 'src'].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))
    .filter((f) => f !== 'src/supabase-unbundled-stub.js');
  const names = new Set(['sb', 'window.sb', 'HOST.DB']);
  for (const f of files) for (const m of R(f).matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?sb\b/g)) names.add(m[1]);
  const esc = [...names].map((n) => n.replace(/[.$]/g, (c) => '\\' + c)).join('|');
  const reach = new RegExp(`(?:^|[^\\w$.])(?:${esc})\\s*\\.\\s*(storage|functions)\\b`);
  const hits = [];
  for (const f of files) R(f).split('\n').forEach((line, i) => { if (reach.test(line)) hits.push(`${f}:${i + 1}`); });
  assert.deepEqual(hits, [], `a Supabase Storage/Functions client is used — remove src/supabase-unbundled-stub.js and its alias rather than work around it (clients: ${[...names].join(', ')})`);
});

test('deps-runtime-majors ⑤ a passkey failure is classified from the error the real auth-js returns', () => {
  const src = R('js/auth-ui.js');
  // eslint-disable-next-line no-new-func
  const classify = new Function(lift(src, '_pkFailure') + '\nreturn _pkFailure;')();
  const W = require('@supabase/auth-js/dist/main/lib/webauthn.errors.js');
  const E = require('@supabase/auth-js/dist/main/lib/errors.js');
  const dom = (name, message) => Object.assign(new Error(message), { name });
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window'), prev = globalThis.window;
  globalThis.window = { location: { hostname: '127.0.0.1' } };   /* the SDK reads the origin it runs on */
  try {
    const rp = W.identifyAuthenticationError({ error: dom('SecurityError', 'The relying party ID is not a registrable domain suffix of, nor equal to the current domain.'),
      options: { publicKey: { rpId: SITE_HOST } } });
    assert.match(String(rp.code), /^ERROR_INVALID_(RP_ID|DOMAIN)$/, 'the SDK names the relying-party refusal');
    assert.equal(classify(rp), 'unavailable', 'an origin the project cannot serve withdraws the controls');
    const cancel = W.identifyAuthenticationError({ error: dom('NotAllowedError', 'The operation either timed out or was not allowed.'), options: { publicKey: {} } });
    assert.equal(classify(cancel), 'cancel', 'a dismissed prompt is offered again');
    const aborted = W.identifyAuthenticationError({ error: dom('AbortError', 'aborted'), options: { publicKey: {}, signal: {} } });
    assert.equal(classify(aborted), 'cancel');
    const reg = W.identifyRegistrationError({ error: dom('SecurityError', 'rp'), options: { publicKey: { rp: { id: SITE_HOST }, user: { id: new Uint8Array(8) } } } });
    assert.equal(classify(reg), 'unavailable', 'the same refusal on registration');
  } finally { if (had) globalThis.window = prev; else delete globalThis.window; }
  assert.equal(classify(new E.AuthApiError('Not Found', 404, 'not_found')), 'unavailable', 'no passkey endpoint on the project');
  assert.equal(classify(new E.AuthApiError('boom', 500, 'unexpected_failure')), 'failed', 'a server error is a real failure — offer it again');
  assert.equal(classify(new E.AuthRetryableFetchError('Failed to fetch', 0)), 'failed', 'so is the network');
  assert.equal(classify(null), 'failed', 'and an unknown shape never withdraws anything');
});

test('deps-runtime-majors ⑥ the passkey delete call names the parameter the SDK reads', () => {
  const sdk = readFileSync(require.resolve('@supabase/auth-js/dist/module/GoTrueClient.js'), 'utf8');
  const del = /async _deletePasskey\(params\)[\s\S]*?\/passkeys\/\$\{params\.([A-Za-z_$][\w$]*)\}/.exec(sdk);
  assert.ok(del, 'auth-js still addresses the passkey to delete by a params member');
  const calls = [...R('js/auth-ui.js').matchAll(/passkey\.delete\(\{\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
  assert.ok(calls.length >= 1, 'the account sheet deletes passkeys');
  assert.deepEqual([...new Set(calls)], [del[1]], `every delete call passes {${del[1]}: …}`);
  assert.doesNotMatch(R('js/auth-ui.js'), /passkey\.delete\(\{\s*id\s*\}\)/, 'the guessed {id} form (DELETE …/passkeys/undefined) is gone');
});
