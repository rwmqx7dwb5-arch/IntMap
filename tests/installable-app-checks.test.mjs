// installable-app — IntMap as an installed app: the manifest and its icons, the app shell the worker
// keeps for an offline open, and the ONE reading of the device position the locate doors share.
// PRODUCT.md §1 said 「PWA としても入る」 while the repository held no manifest, no theme-color, no
// apple-touch-icon and no install entry. Every check below EVALUATES the shipped code (the generator,
// the worker with its shell filled the way the build fills it, the capability's own run()) rather than
// reading its spelling. See dev-notes/2026-10-01-installable-app.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check as manifestCheck, derive as manifestDerive, readDocument, readThemeTokens } from '../scripts/build-app-manifest.mjs';
import { appShellFiles, injectAppShell, htmlRefs, cssRefs, SHELL_TOKEN_RE } from '../scripts/app-shell.mjs';
import { pngDecode } from '../scripts/subcables/png.mjs';
import { deltaE00 } from './helpers/colour-difference.js';
import { requestFix, FIX_FAILURE } from '../js/locate-me.js';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ══ ① THE MANIFEST AND ITS ICONS ARE WHAT THEIR SOURCES SAY ═════════════════════════════════════ */
test('installable-app ① the manifest, the icons and index.html\'s head tags agree with their sources', () => {
  const problems = manifestCheck();
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('installable-app ② the manifest meets the install criteria and resolves under the Pages sub-path', () => {
  const mf = JSON.parse(read('manifest.webmanifest'));
  /* the product name is the title's wordmark, untranslated (memory: product name is a wordmark) */
  assert.equal(mf.name, readDocument().name);
  assert.equal(mf.short_name, mf.name);
  assert.equal(mf.display, 'standalone');
  /* relative, so the same file is right at https://…/IntMap/ and at a local server's root */
  const base = 'https://rwmqx7dwb5-arch.github.io/IntMap/manifest.webmanifest';
  assert.equal(new URL(mf.start_url, base).href, 'https://rwmqx7dwb5-arch.github.io/IntMap/');
  assert.equal(new URL(mf.scope, base).href, 'https://rwmqx7dwb5-arch.github.io/IntMap/');
  /* Chromium: a 192 and a 512 PNG, each a real file of that size */
  for (const want of [192, 512]) {
    const ic = mf.icons.find((i) => i.sizes === `${want}x${want}` && /\bany\b/.test(i.purpose));
    assert.ok(ic, `an «any» ${want} px icon is declared`);
    const im = pngDecode(fs.readFileSync(ic.src));
    assert.equal(im.w, want); assert.equal(im.h, want);
  }
  /* the colours are the dark --bg-color: the field the icon is flattened onto */
  const t = readThemeTokens();
  assert.equal(mf.background_color, t.dark); assert.equal(mf.theme_color, t.dark);
});

test('installable-app ③ the maskable icon keeps every visible pixel of the mark inside the safe zone', () => {
  const mf = JSON.parse(read('manifest.webmanifest'));
  const ic = mf.icons.find((i) => /\bmaskable\b/.test(i.purpose));
  assert.ok(ic, 'a maskable icon is declared (Android launchers crop to their own shape)');
  const im = pngDecode(fs.readFileSync(ic.src));
  const F = [im.data[0], im.data[1], im.data[2]];
  const c = (im.w - 1) / 2, R = 0.4 * im.w;   /* W3C: a circle of radius 40 % of the width */
  let outside = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (Math.hypot(x - c, y - c) <= R) continue;
    const o = (y * im.w + x) * im.bpp;
    if (deltaE00([im.data[o], im.data[o + 1], im.data[o + 2]], F) >= 1) outside++;
  }
  assert.equal(outside, 0, `${outside} visible pixels of the mark lie outside the safe zone and may be cropped`);
});

test('installable-app ④ what index.html links verbatim is what the build copies verbatim', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  const html = read('index.html');
  const ignored = [...html.matchAll(/<link\b[^>]*\bvite-ignore\b[^>]*>/g)].map((m) => /href="([^"]+)"/.exec(m[0])[1]);
  assert.ok(ignored.length >= 3, 'the manifest and the icons are linked with vite-ignore');
  for (const h of ignored) {
    assert.ok(STATIC_ASSETS.some((a) => h === a || h.startsWith(a + '/')), `${h} is linked verbatim but not in STATIC_ASSETS — it would be absent from dist/`);
  }
  const mf = manifestDerive().manifest;
  for (const i of mf.icons) assert.ok(STATIC_ASSETS.some((a) => i.src.startsWith(a + '/')), `${i.src} is not copied`);
});

/* ══ ⑤ THE SHELL LIST IS DERIVED FROM THE BUILD ════════════════════════════════════════════════ */
function fixtureDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-installable-app-'));
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
  put('index.html', `<html><head><script>window.INTMAP_BUILD='2026-10-01T00:00:00Z-abcdef1';</script>
    <link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="./icons/i-192.png">
    <link rel="preconnect" href="https://tiles.example"><script type="module" src="./assets/main-AAA.js"></script>
    <link rel="stylesheet" href="./assets/main-BBB.css"></head></html>`);
  put('manifest.webmanifest', JSON.stringify({ icons: [{ src: 'icons/i-192.png' }, { src: 'icons/i-512.png' }] }));
  put('icons/i-192.png', 'x'); put('icons/i-512.png', 'x');
  put('assets/main-AAA.js', 'x'); put('assets/dep-CCC.js', 'x'); put('assets/lazy-DDD.js', 'x');
  put('assets/main-BBB.css', '@font-face{src:url(./inter-EEE.woff2)} .a{background:url("data:image/png;base64,xx")} .b{background:url(https://x.test/y.png)}');
  put('assets/inter-EEE.woff2', 'x');
  const report = {
    eager: { chunks: ['assets/main-AAA.js', 'assets/dep-CCC.js'], css: { files: ['assets/main-BBB.css'] }, workers: { files: [] } },
    chunks: { 'assets/main-AAA.js': {}, 'assets/dep-CCC.js': {}, 'assets/lazy-DDD.js': {} },
    assets: { 'assets/main-BBB.css': {}, 'assets/inter-EEE.woff2': {} },
  };
  return { d, report, put };
}

test('installable-app ⑤ the shell is the eager graph plus what the document, its manifest and its CSS name — never a lazy chunk', () => {
  const { d, report } = fixtureDist();
  try {
    const s = appShellFiles(d, report);
    assert.equal(s.build, '2026-10-01T00:00:00Z-abcdef1');
    assert.deepEqual(s.immutable, ['assets/dep-CCC.js', 'assets/inter-EEE.woff2', 'assets/main-AAA.js', 'assets/main-BBB.css']);
    assert.deepEqual(s.mutable, ['icons/i-192.png', 'icons/i-512.png', 'manifest.webmanifest']);
    assert.ok(!s.immutable.includes('assets/lazy-DDD.js'), 'a chunk the boot does not load is not the shell');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  assert.deepEqual(htmlRefs('<a href="x.html"></a><link href="//cdn.x/y.css"><script src="/abs.js"></script><img src="./p.png">'), ['p.png']);
  assert.deepEqual(cssRefs('url(../fonts/a.woff2) url(#f)', 'assets/m.css'), ['fonts/a.woff2']);
});

test('installable-app ⑥ the build refuses a shell it cannot stand behind', () => {
  const { d, report, put } = fixtureDist();
  try {
    put('sw.js', 'const A = 1;');
    assert.throws(() => injectAppShell(d, report), /token/, 'a worker without the token would ship without its list');
    put('sw.js', "const APP_SHELL = /*__INTMAP_APP_SHELL__*/{ build: '', immutable: [], mutable: [] }/*__INTMAP_APP_SHELL_END__*/;");
    const s = injectAppShell(d, report);
    const lit = SHELL_TOKEN_RE.exec(fs.readFileSync(path.join(d, 'sw.js'), 'utf8'))[0];
    assert.ok(lit.includes(s.build) && lit.includes('assets/main-AAA.js'));
    fs.rmSync(path.join(d, 'assets/dep-CCC.js'));
    assert.throws(() => appShellFiles(d, report), /did not produce/, 'a named file that is not in dist/ fails the build');
    put('index.html', '<html></html>');
    assert.throws(() => appShellFiles(d, report), /build stamp/, 'a shell with no version is refused');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

/* ══ ⑦ THE WORKER, RUN ═══════════════════════════════════════════════════════════════════════════ */
const ORIGIN = 'https://example.test', SCOPE = ORIGIN + '/IntMap/';
const SHELL = { build: '2026-10-01T00:00:00Z-abcdef1', immutable: ['assets/main-AAA.js'], mutable: ['manifest.webmanifest'] };
function worker({ shell, online = true, net } = {}) {
  const handlers = {}, stores = new Map(), network = [];
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { match: async (r) => m.get(keyOf(r)), put: async (r, res) => { m.set(keyOf(r), res); },
      keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (r) => m.delete(keyOf(r)) };
  };
  const caches = { open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n),
    match: async (r) => { for (const m of stores.values()) if (m.has(keyOf(r))) return m.get(keyOf(r)); } };
  const self = {
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, skipWaiting() {},
    clients: { claim: async () => {}, get: async (id) => ({ id, type: 'window', url: SCOPE }) },
    registration: { scope: SCOPE }, location: { origin: ORIGIN },
    navigator: { onLine: online, storage: { estimate: async () => ({ usage: 0, quota: 1e12 }) } },
  };
  const answer = net || ((u) => new Response(u === SCOPE ? `<html>${SHELL.build}</html>` : 'body:' + u, { status: 200 }));
  const fetchStub = async (r, init) => { const u = keyOf(r); network.push(u); return answer(u, init); };
  let code = fs.readFileSync('sw.js', 'utf8');
  if (shell) code = code.replace(SHELL_TOKEN_RE, () => '/*__INTMAP_APP_SHELL__*/' + JSON.stringify(shell) + '/*__INTMAP_APP_SHELL_END__*/');
  new Function('self', 'caches', 'fetch', code)(self, caches, fetchStub);
  const dispatch = async (type, extra) => {
    const waits = []; let responded = null;
    for (const h of handlers[type] || []) h(Object.assign({ waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } }, extra));
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return { responded: !!responded, res };
  };
  return { self, stores, network, dispatch, cacheOf };
}
const SHELL_CACHE = 'intmap-shell-' + SHELL.build;

test('installable-app ⑦ install fills the shell — the document only when it is THIS build\'s', async () => {
  const W = worker({ shell: SHELL });
  await W.dispatch('install', {});
  const shell = W.stores.get(SHELL_CACHE);
  assert.ok(shell, 'the shell cache is named for the build');
  assert.deepEqual([...shell.keys()].sort(), [SCOPE, SCOPE + 'assets/main-AAA.js', SCOPE + 'manifest.webmanifest'].sort());
  /* the previous deploy's document, still in the HTTP cache (#R465), is NOT stored */
  const stale = worker({ shell: SHELL, net: (u) => new Response(u === SCOPE ? '<html>2026-09-30T00:00:00Z-0000000</html>' : 'x') });
  await stale.dispatch('install', {});
  assert.ok(!stale.stores.get(SHELL_CACHE).has(SCOPE), 'a document naming another build is not kept');
  /* a hashed file the previous shell already holds is carried over, not downloaded again */
  const carry = worker({ shell: SHELL });
  await carry.cacheOf('intmap-shell-OLD').put(SCOPE + 'assets/main-AAA.js', new Response('old-but-same-bytes'));
  await carry.dispatch('install', {});
  assert.ok(!carry.network.includes(SCOPE + 'assets/main-AAA.js'), 'an unchanged chunk costs no download on a new deploy');
  /* …and activate then drops every shell but this build's (#R16) */
  await carry.dispatch('activate', {});
  assert.ok(!carry.stores.has('intmap-shell-OLD') && carry.stores.has(SHELL_CACHE));
});

test('installable-app ⑧ a navigation is answered ONLY offline (DECISIONS.md: the worker does not own navigations)', async () => {
  const nav = (url) => ({ request: { method: 'GET', url, mode: 'navigate' }, resultingClientId: 'c1' });
  const on = worker({ shell: SHELL, online: true });
  await on.dispatch('install', {});
  assert.equal((await on.dispatch('fetch', nav(SCOPE))).responded, false, 'online, the browser navigates exactly as before');
  const off = worker({ shell: SHELL, online: false });
  await off.dispatch('install', {});
  const r = await off.dispatch('fetch', nav(SCOPE + '?q=1'));
  assert.ok(r.responded && /abcdef1/.test(await r.res.text()), 'offline, the app opens from the shell');
  assert.equal((await off.dispatch('fetch', nav(SCOPE + 'privacy.html'))).responded, false, 'only the app document, no other page');
  /* the page can learn that it was opened from the shell */
  const got = [];
  await off.dispatch('message', { data: { type: 'shell-status' }, source: { id: 'c1', postMessage: (m) => got.push(m) } });
  assert.equal(got.length, 1); assert.equal(got[0].openedFromShell, true);
  /* a worker that was never built has no shell and answers nothing but tiles */
  const dev = worker({ online: false });
  assert.equal((await dev.dispatch('fetch', nav(SCOPE))).responded, false);
  assert.equal((await dev.dispatch('fetch', { request: { method: 'GET', url: SCOPE + 'assets/main-AAA.js' } })).responded, false);
});

test('installable-app ⑨ a hashed file is answered from the shell without the network; the manifest is revalidated behind it', async () => {
  const W = worker({ shell: SHELL });
  await W.dispatch('install', {});
  const before = W.network.length;
  const a = await W.dispatch('fetch', { request: { method: 'GET', url: SCOPE + 'assets/main-AAA.js' } });
  assert.ok(a.responded); assert.equal(W.network.length, before, 'immutable: zero network');
  const m = await W.dispatch('fetch', { request: { method: 'GET', url: SCOPE + 'manifest.webmanifest' } });
  assert.ok(m.responded); assert.equal(W.network.length, before + 1, 'mutable: answered, then refreshed (stale-while-revalidate)');
  const other = await W.dispatch('fetch', { request: { method: 'GET', url: SCOPE + 'assets/lazy-DDD.js' } });
  assert.equal(other.responded, false, 'anything outside the shell goes to the network as it always did');
});

/* ══ ⑩ ONE READING OF THE DEVICE POSITION ════════════════════════════════════════════════════════ */
const geoAnswering = (how) => ({ getCurrentPosition: (ok, err, o) => how(ok, err, o) });
test('installable-app ⑩ requestFix tells the five ways a reading ends without a position apart', async () => {
  assert.deepEqual(await requestFix({ geolocation: null, permissions: null }).then((r) => r.ok ? r : r.reason), FIX_FAILURE.UNSUPPORTED);
  const blocked = await requestFix({ geolocation: geoAnswering(() => assert.fail('a blocked site must not be asked')), permissions: { query: async () => ({ state: 'denied' }) } });
  assert.equal(blocked.reason, FIX_FAILURE.BLOCKED, 'a hard deny is told before any wait (#R155)');
  for (const [code, reason] of [[1, FIX_FAILURE.DENIED], [2, FIX_FAILURE.UNAVAILABLE], [3, FIX_FAILURE.TIMEOUT]]) {
    const r = await requestFix({ geolocation: geoAnswering((_, err) => err({ code })), permissions: { query: async () => ({ state: 'prompt' }) } });
    assert.equal(r.reason, reason, `PositionError ${code}`);
  }
  const silent = await requestFix({ geolocation: geoAnswering(() => {}), timeoutMs: 5 });
  assert.equal(silent.reason, FIX_FAILURE.TIMEOUT, 'an engine that never calls back is a timeout, not a refusal');
  let opts = null;
  const ok = await requestFix({ geolocation: geoAnswering((cb, _e, o) => { opts = o; cb({ coords: { longitude: 135.4959, latitude: 34.7016, accuracy: 18 } }); }) });
  assert.equal(ok.ok, true); assert.equal(ok.lat, 34.7016); assert.equal(ok.acc, 18);
  assert.equal(opts.maximumAge, 0, 'never a cached fix (#R170)'); assert.equal(opts.enableHighAccuracy, true);
  assert.equal(opts.timeout, 25000, 'the budget view.locate measured for a cold GPS fix after the prompt (#R170)');
});

test('installable-app ⑪ Atlas\'s view.locate reads the device through requestFix and hands the model the fact', async () => {
  const entry = (await import('../js/atlas-cap-view.js')).default.find((e) => e.row[0] === 'view.locate');
  assert.ok(entry && typeof entry.run === 'function', 'view.locate is in js/atlas-cap-view.js');
  const src = read('js/atlas-cap-view.js');
  assert.ok(!/navigator\.geolocation/.test(src), 'no capability reads the sensor with code of its own any more');
  assert.ok(!/navigator\.geolocation/.test(read('js/atlas-geo-resolve.js')), '「現在地から…」 neither');
  const run = async (geolocation, permissions) => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation, permissions }, configurable: true });
    const seeded = []; let flew = null;
    const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), warn: (s) => s, note: (s) => s, L: (en) => en,
      GE: () => ({ camera: { flyTo: (o) => { flew = o; }, getZoom: () => 3 } }), _selfLocSeed: (f) => seeded.push(f) };
    try { return { res: await entry.run({}, {}, K), seeded, flew }; }
    finally { if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator; }
  };
  const ok = await run(geoAnswering((cb) => cb({ coords: { longitude: 2.2945, latitude: 48.8584, accuracy: 7 } })));
  assert.equal(ok.res.ok, true);
  assert.deepEqual(ok.res.exec, { lat: 48.8584, lng: 2.2945, accuracyM: 7, provenance: 'device_location' }, 'the coordinates reach the model as a fact (#R413)');
  assert.deepEqual(ok.seeded[0], { lng: 2.2945, lat: 48.8584, acc: 7 }, 'and seed the 「現在地」 resolver');
  assert.deepEqual(ok.flew.center, [2.2945, 48.8584]);
  const blocked = await run(geoAnswering(() => assert.fail('not asked')), { query: async () => ({ state: 'denied' }) });
  assert.equal(blocked.res.ok, false); assert.match(blocked.res.html, /blocked for this site/);
  const timedOut = await run(geoAnswering((_, err) => err({ code: 3 })));
  assert.match(timedOut.res.html, /timed out/, 'a timeout is said as a timeout, not as a refusal');
});
