// Which caches survive a service-worker update. The page owns some (offline copies it writes and
// expires itself); sw.js used to keep exactly ONE of them by name (#R189) and wiped the three that were
// added later on every deploy. Ownership is now a fact carried by the name (`intmap-page-`), and this
// file checks it the way a browser would: it DISCOVERS every cache the page opens, then EVALUATES
// sw.js's activate handler against them. See dev-notes/2026-09-29-sw-cache-names-owned.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { codeOnly as strip } from '../scripts/code-only.mjs';

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// every `caches.open(<expr>)` in the page's code, with <expr> resolved to the string it names
let _found;
function pageCacheNames() {
  if (_found) return _found;
  const dirs = ['js', 'src'];
  const out = [];
  for (const d of dirs) {
    for (const f of fs.readdirSync(d, { recursive: true })) {
      if (!/\.(m?js)$/.test(f)) continue;
      const file = path.join(d, f);
      const src = strip(fs.readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/caches\.open\(\s*([^)]+?)\s*\)/g)) {
        const arg = m[1];
        let name = /^['"`]([^'"`]+)['"`]$/.exec(arg)?.[1];
        if (!name && /^[A-Za-z_$][\w$]*$/.test(arg)) {
          name = new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(arg)}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`).exec(src)?.[1];
        }
        out.push({ file, arg, name });
      }
    }
  }
  return (_found = out);
}

// run sw.js in a sandbox and fire `activate` over a fake Cache Storage holding `names`
async function survivorsOfActivate(names) {
  const listeners = {};
  const store = new Set(names);
  const self = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting() {}, clients: { claim: async () => {} },
    location: { origin: 'https://example.test' },
  };
  const caches = {
    keys: async () => [...store],
    delete: async (k) => store.delete(k),
    open: async () => ({ match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => true }),
  };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    self, caches, console, URL, Request: class {}, Response: class {}, Headers: class {}, fetch: async () => { throw new Error('offline'); },
    setTimeout, clearTimeout, Date, Promise, Math, Map, Set, JSON,
  });
  assert.equal(typeof listeners.activate, 'function', 'sw.js registers an activate handler');
  let done;
  listeners.activate({ waitUntil: (p) => { done = p; } });
  await done;
  return store;
}

test('every cache the page opens is resolved to a literal name (a computed name could not be owned)', () => {
  const found = pageCacheNames();
  assert.ok(found.length >= 1, 'the discovery found the page caches (it is not measuring an empty set)');
  for (const c of found) assert.ok(c.name, `${c.file}: caches.open(${c.arg}) — the name is not a literal this check can read`);
});

test('an update of the service worker keeps every cache the page owns', async () => {
  const pageNames = pageCacheNames().map((c) => c.name);
  const kept = await survivorsOfActivate([...pageNames]);
  for (const n of pageNames) assert.ok(kept.has(n), `${n} is deleted by sw.js activate — the page's offline copy is lost on every deploy`);
});

test('…and still purges its own past caches and anything it does not recognise (#R16 先祖返り defence)', async () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const current = /const CACHE = '([^']+)'/.exec(sw)[1];
  const legacy = ['intmap-tiles-v1', 'intmap-shell-v1', 'workbox-precache-v2-https://example.test/', 'intmap-subcables-v1', 'intmap-bnd-v1'];
  const kept = await survivorsOfActivate([current, ...legacy]);
  assert.ok(kept.has(current), 'the current tile cache survives');
  for (const n of legacy) assert.ok(!kept.has(n), `${n} survives activate — a stale copy could outlive the deploy`);
});
