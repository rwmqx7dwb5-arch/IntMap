/* ============================================================================
 *  relay-entry-by-binding — tests/helpers/js-bindings.mjs resolves a callee by what it is BOUND to
 * ----------------------------------------------------------------------------
 *  THE DEFECT: tests/own-fetch-relay-checks matched calls to relay entries by the callee's spelling,
 *  so one function named `indexOf` made every `x.indexOf(…)` in js/ a relay call (ENTRIES 460 → 764,
 *  a CI shard past an hour, PR #1029). The discovery now asks the resolver here which functions a call
 *  can reach. Each case below is one kind of binding it must follow, or one it must refuse to guess.
 *  The use of it over js/ is checked in tests/own-fetch-relay-checks.test.mjs ⓪.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from './helpers/ast.mjs';
import { bindProgram, linkParents } from './helpers/js-bindings.mjs';

const program = (files) => {
  const list = Object.entries(files).map(([f, src]) => ({ f, ast: linkParents(parseSource(src)) }));
  return { P: bindProgram(list), list };
};
/* the function names a call on line `line` of file `f` can reach */
function reaches({ P }, f, line) {
  const c = P.calls.find((n) => n.file === f && n.loc.start.line === line && !(n.parent && n.parent.type === 'CallExpression' && n.parent.callee === n));
  assert.ok(c, `a call on ${f}:${line}`);
  return P.fnsOf(c).map((fn) => (fn.id && fn.id.name) || (fn.parent && fn.parent.key && fn.parent.key.name) || (fn.parent && fn.parent.id && fn.parent.id.name) || '?').sort();
}

test('relay-entry-by-binding: a member of a value it does not know resolves to nothing — never to a function of the same name', () => {
  const p = program({
    'js/a.js': `export function indexOf(u) { return u; }
                export function push(u) { return u; }`,
    'js/b.js': `import { indexOf } from './a.js';
                const xs = [];
                xs.indexOf(1);
                xs.push(2);
                'abc'.indexOf('b');
                new Map().set(1, 2);
                indexOf('u');`,
  });
  assert.deepEqual(reaches(p, 'js/b.js', 3), []);
  assert.deepEqual(reaches(p, 'js/b.js', 4), []);
  assert.deepEqual(reaches(p, 'js/b.js', 5), []);
  assert.deepEqual(reaches(p, 'js/b.js', 6), []);
  assert.deepEqual(reaches(p, 'js/b.js', 7), ['indexOf'], 'the imported binding is followed');
});

test('relay-entry-by-binding: lexical scope decides, not the spelling (shadowing, hoisting, aliases, namespaces, re-exports)', () => {
  const p = program({
    'js/a.js': `export function load(u) { return u; }
                export default function main(u) { return u; }`,
    'js/r.js': `export { load as fetchIt } from './a.js';
                export * from './a.js';`,
    'js/b.js': `import main, { load as L } from './a.js';
                import * as NS from './a.js';
                import { fetchIt, load } from './r.js';
                function outer() { function L(x) { return x; } return L(1); }
                L(1);
                NS.load(1);
                fetchIt(1);
                load(1);
                main(1);
                later(1);
                var later = function hoisted(u) { return u; };`,
  });
  assert.deepEqual(reaches(p, 'js/b.js', 4), ['L'], 'the inner declaration shadows the import');
  assert.deepEqual(reaches(p, 'js/b.js', 5), ['load']);
  assert.deepEqual(reaches(p, 'js/b.js', 6), ['load'], 'a member of an imported namespace');
  assert.deepEqual(reaches(p, 'js/b.js', 7), ['load'], 'a renamed re-export');
  assert.deepEqual(reaches(p, 'js/b.js', 8), ['load'], 'export *');
  assert.deepEqual(reaches(p, 'js/b.js', 9), ['main'], 'the default export');
  assert.deepEqual(reaches(p, 'js/b.js', 10), ['hoisted'], 'a hoisted var');
});

test('relay-entry-by-binding: a function handed in (factory, host object, getter, injected parameter) is followed', () => {
  const p = program({
    'js/router.js': `export function relay(u) { return u; }`,
    'js/factory.js': `import { relay } from './router.js';
                      export function makeFetch() { return function fetchIt(u) { return relay(u); }; }`,
    'js/sources.js': `export function makeSources(CTX) {
                        const f = CTX.fetchIt;
                        return { news: (q) => f(q), more: (q) => CTX.fetchIt(q) };
                      }`,
    'js/host.js': `import { relay } from './router.js';
                   import { makeFetch } from './factory.js';
                   import { makeSources } from './sources.js';
                   const fetchIt = makeFetch();
                   const HOST = Object.freeze({ get relay() { return relay; }, fetchIt });
                   makeSources(HOST);
                   export function useHost(H) { return H.relay('x'); }
                   useHost(HOST);`,
  });
  assert.deepEqual(reaches(p, 'js/sources.js', 3).sort(), ['fetchIt'], 'f = CTX.fetchIt, CTX the frozen host');
  assert.deepEqual(reaches(p, 'js/host.js', 7), ['relay'], 'a getter of the host');
});

test('relay-entry-by-binding: a lazily imported module reaches the factory it exports (import(), a registry, then)', () => {
  const p = program({
    'js/sat.js': `export function satellites(HOST) { return HOST.relay('u'); }`,
    'js/router.js': `export function relay(u) { return u; }`,
    'js/lazy.js': `import { relay } from './router.js';
                   const R = Object.freeze({ satellites: { load: () => import('./sat.js'),
                     mount: (H, m) => m.satellites(H) } });
                   const HOST = { relay };
                   export function need(name) { return R[name].load().then((mod) => R[name].mount(HOST, mod)); }`,
  });
  assert.deepEqual(reaches(p, 'js/sat.js', 1), ['relay'], 'HOST reaches the module through mount(H, m)');
  assert.deepEqual(reaches(p, 'js/lazy.js', 3), ['satellites'], 'm is the namespace the promise settles to');
});

test('relay-entry-by-binding: a parameter nobody passes and a call through an unknown key resolve to nothing', () => {
  const p = program({
    'js/a.js': `export function run(K) { return K.fetchIt(1); }
                const table = new Map();
                table.get('k')(1);`,
  });
  assert.deepEqual(reaches(p, 'js/a.js', 1), []);
  assert.deepEqual(reaches(p, 'js/a.js', 3), []);
});
