/* vendored-runtime-scripts — a script the served site pulls from another origin is pinned or excused.
 *
 * The defect: #R175 moved the seven CDN <script> tags into the bundle, and two loaders that insert a
 * <script> at RUNTIME (js/wx-ecmwf.js — the ECMWF tile SDK; js/layer-packs.js — the PMTiles plugin,
 * since removed with the loader nothing called) went on running unpkg code on this origin without Subresource Integrity. The gate is
 * scripts/runtime-scripts.mjs, run by `npm run check:static`. Every mutation below is applied to the
 * REAL served files in memory, so each case proves the gate turns red on the tree as it is today.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectServed, runtimeScriptProblems, cspScriptHosts, viteStaticAssets, UNPINNABLE, CSP_ONLY,
} from '../scripts/runtime-scripts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = collectServed(ROOT);
const SRI = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

const withFile = (rel, edit) => FILES.map((f) => (f.rel === rel ? { rel, text: edit(f.text) } : f));
const plus = (rel, text) => FILES.concat([{ rel, text }]);
const problems = (files, decl) => runtimeScriptProblems(files, decl).problems;
function mustChange(text, from, to) {
  assert.ok(text.includes(from), `the fixture no longer contains ${JSON.stringify(from)} — update the mutation`);
  return text.split(from).join(to);
}

test('① the tree as it is: every cross-origin script is pinned or declared', () => {
  assert.deepEqual(problems(FILES), []);
});

test('② the runtime loader carries a well-formed pin and crossOrigin', () => {
  const { sites } = runtimeScriptProblems(FILES);
  for (const rel of ['js/wx-ecmwf.js']) {
    const ext = sites.filter((s) => s.rel === rel && s.src && s.src.some((c) => /^https?:\/\//.test(c.value || '')));
    assert.ok(ext.length >= 1, `${rel}: the external <script> site is found`);
    for (const s of ext) {
      assert.ok(s.crossOrigin, `${rel}:${s.line} sets crossOrigin`);
      for (const c of s.src) {
        const sri = c.integrity ?? (s.integrity[0] && s.integrity[0].value);
        assert.match(String(sri), SRI, `${rel}:${s.line} ${c.value} carries a sha pin`);
      }
    }
  }
  // the SDK's pin is the SAME file on both CDNs (measured byte-identical), so both entries carry one hash
  const wx = readFileSync(join(ROOT, 'js/wx-ecmwf.js'), 'utf8');
  const pins = [...wx.matchAll(/integrity:\s*'(sha384-[^']+)'/g)].map((m) => m[1]);
  assert.equal(pins.length, 2);
  assert.equal(new Set(pins).size, 1);
});

test('③ removing the SDK\'s integrity turns the gate red', () => {
  const f = withFile('js/wx-ecmwf.js', (t) => mustChange(t, 's.integrity = c.integrity; ', ''));
  assert.ok(problems(f).some((p) => p.startsWith('js/wx-ecmwf.js') && /without a pinned integrity/.test(p)));
});

test('④ removing crossOrigin turns it red (the browser cannot check a pin without CORS)', () => {
  const f = withFile('js/wx-ecmwf.js', (t) => mustChange(t, " s.crossOrigin = 'anonymous';", ''));
  assert.ok(problems(f).some((p) => p.startsWith('js/wx-ecmwf.js') && /crossOrigin/.test(p)));
});

test('⑤ one URL losing its own pin in the array is caught, not covered by its neighbour', () => {
  const f = withFile('js/wx-ecmwf.js', (t) => {
    const i = t.indexOf("integrity: 'sha384-");
    return t.slice(0, i) + "integrity: 'not-a-hash-'" + t.slice(t.indexOf("'", i + 12) + 1);
  });
  assert.ok(problems(f).some((p) => p.startsWith('js/wx-ecmwf.js') && /unpkg\.com/.test(p)));
});

test('⑦ a NEW loader in any served file, in any form, is caught', () => {
  // the classic form
  assert.ok(problems(plus('js/new-loader.js',
    "const s=document.createElement('script'); s.src='https://unpkg.com/x@1/x.js'; document.head.appendChild(s);"))
    .some((p) => p.startsWith('js/new-loader.js')));
  // a form the site finder does not know: the host string itself is the site
  assert.ok(problems(plus('js/new-import.js', "import('https://unpkg.com/y@2/y.mjs');"))
    .some((p) => p.startsWith('js/new-import.js') && /no pinned <script> consumes it/.test(p)));
  // a static tag on a served page
  assert.ok(problems(withFile('index.html', (t) => t.replace('</head>', '<script src="https://unpkg.com/z@3/z.js"></script></head>')))
    .some((p) => p.startsWith('index.html') && /without integrity\+crossorigin/.test(p)));
  // ...and a tag that IS pinned passes
  assert.deepEqual(problems(withFile('index.html', (t) => t.replace('</head>',
    '<script src="https://unpkg.com/z@3/z.js" integrity="sha384-AAAA" crossorigin="anonymous"></script></head>'))), []);
});

test('⑧ same-origin loaders are not external (data/, ./js/locales, new URL(\'data/…\').href)', () => {
  const { sites } = runtimeScriptProblems(FILES);
  const local = sites.filter((s) => s.isScript && s.src && s.src.every((c) => c.value && !/^(https?:)?\/\//.test(c.value)));
  assert.ok(local.some((s) => s.rel === 'js/war-layer.js'), 'new URL(...).href resolves to its first argument');
  assert.ok(local.some((s) => s.rel === 'js/time-borders.js'));
});

test('⑨ Clarity\'s createElement(r) is found through the IIFE binding, and is what its declaration excuses', () => {
  const { sites } = runtimeScriptProblems(FILES);
  const cl = sites.find((s) => s.rel === 'index.html' && s.src && s.src.some((c) => /clarity\.ms/.test(c.value || '')));
  assert.ok(cl && cl.isScript, 'the r parameter resolves to "script"');
  const decl = { unpinnable: UNPINNABLE.filter((u) => u.host !== 'www.clarity.ms') };
  assert.ok(problems(FILES, decl).some((p) => p.startsWith('index.html') && /clarity\.ms/.test(p)));
});

test('⑩ the UNPINNABLE table is checked in both directions and demands a sentence', () => {
  const stale = UNPINNABLE.concat([{ file: 'js/wx-ecmwf.js', host: 'maps.googleapis.com', why: 'x'.repeat(60) }]);
  assert.ok(problems(FILES, { unpinnable: stale }).some((p) => /declared, but no site in that file loads from that host/.test(p)));
  const notServed = UNPINNABLE.concat([{ file: 'harness/waves.html', host: 'unpkg.com', why: 'x'.repeat(60) }]);
  assert.ok(problems(FILES, { unpinnable: notServed }).some((p) => /not served/.test(p)));
  const terse = UNPINNABLE.map((u, i) => (i === 0 ? { ...u, why: 'JSONP' } : u));
  assert.ok(problems(FILES, { unpinnable: terse }).some((p) => /needs a reason/.test(p)));
  for (const u of UNPINNABLE) assert.ok(u.why.length >= 40);
  // a site the table excuses disappearing makes its declaration red
  const f = withFile('js/street-view.js', (t) => mustChange(t, 'https://maps.googleapis.com/maps/api/js/GeoPhotoService', 'https://example.invalid/GeoPhotoService'));
  assert.ok(problems(f).some((p) => /UNPINNABLE js\/street-view\.js maps\.googleapis\.com: declared, but/.test(p)));
});

test('⑪ CSP script-src: a host nothing uses is refused unless declared CSP_ONLY; the declaration is checked both ways', () => {
  const hosts = cspScriptHosts(FILES);
  for (const h of ['unpkg.com', 'maps.googleapis.com', 'www.googletagmanager.com', 'www.clarity.ms']) assert.ok(hosts.has(h), h);
  const extra = withFile('index.html', (t) => mustChange(t, 'blob: https://unpkg.com', 'blob: https://cdn.example.org https://unpkg.com'));
  assert.ok(problems(extra).some((p) => /allows cdn\.example\.org, which nothing in the served code loads from/.test(p)));
  assert.ok(problems(FILES, { cspOnly: [] }).some((p) => /www\.google-analytics\.com/.test(p)), 'the analytics hosts stand only by declaration');
  assert.ok(problems(FILES, { cspOnly: CSP_ONLY.concat([{ host: 'unpkg.com', why: 'x'.repeat(60) }]) })
    .some((p) => /CSP_ONLY unpkg\.com: declared unused, but/.test(p)));
  assert.ok(problems(FILES, { cspOnly: CSP_ONLY.concat([{ host: 'nowhere.example', why: 'x'.repeat(60) }]) })
    .some((p) => /no served page's script-src has it/.test(p)));
});

test('⑫ the universe is discovered: root pages, js/, src/ and vite STATIC_ASSETS — harness/ is not served', () => {
  const rels = new Set(FILES.map((f) => f.rel));
  for (const r of ['index.html', 'admin.html', 'js/wx-ecmwf.js', 'src/vendor.js', 'sw.js']) assert.ok(rels.has(r), r);
  assert.ok(!rels.has('harness/waves.html'));
  const vite = viteStaticAssets(readFileSync(join(ROOT, 'vite.config.js'), 'utf8'));
  assert.ok(vite.assets.includes('sw.js') && vite.assets.includes('data'));
  assert.ok(!vite.assets.some((a) => a === 'harness' || a.startsWith('harness/')),
    'harness/ is outside the net only because the build does not copy it — if that changes, this fails');
});

test('⑬ check:static runs the gate', () => {
  const t = readFileSync(join(ROOT, 'scripts/static-checks.mjs'), 'utf8');
  assert.match(t, /runtimeScriptProblems\(collectServed\(ROOT\)\)/);
});
