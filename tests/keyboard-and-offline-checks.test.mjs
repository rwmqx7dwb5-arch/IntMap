/* keyboard-and-offline — the halves that need no browser, EVALUATED:
   ① the offline policy is the ledger's statement and nothing else: data/offline-sources.json is what
     scripts/outbound-hosts.json derives; a malformed statement is refused; the rule says YES only for the
     part of a host a row covers, NO with the terms it rests on, and «not stated» for silence;
   ② the pure parts of a saved region (tile rectangles, antimeridian, coarse-first order, what fits);
   ③ sw.js answers the saved region ONLY while the browser is offline, from one key per terrain tile for all
     five host aliases, and the key is the one the page saved under;
   ④ the reading mode: the profile as sentences, the move in words, the narrator's one live-region writer;
   ⑤ the Settings rows exist, are named, and the two capabilities are registered and documented.
   tests/keyboard-and-offline.spec.js carries what needs a page (real keys, a real offline context). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { check, readLedger, browserFiles, deriveOfflineSources, OFFLINE_SOURCES, LEGAL } from '../scripts/outbound-hosts.mjs';
import { build as buildOffline } from '../scripts/offline-sources.mjs';
import * as P from '../js/offline-plan.js';
import { makeDemSource } from '../js/dem-source.js';
import { moveWords } from '../js/map-reader.js';
import { SHELL_TOKEN_RE } from '../scripts/app-shell.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const policy = JSON.parse(read(OFFLINE_SOURCES));
const ledger = readLedger(ROOT);

/* ── ① ─────────────────────────────────────────────────────────────── */
test('① data/offline-sources.json is exactly what the ledger derives — there is no second list', () => {
  assert.deepEqual(policy, deriveOfflineSources(ledger));
  assert.deepEqual(policy, buildOffline(ROOT));
  assert.ok(policy.hosts.some((h) => h.allowed === true) && policy.hosts.some((h) => h.allowed === false), 'both answers are carried — the reader is shown why a source is NOT saved');
  for (const h of policy.hosts) {
    assert.match(h.basis, /^https:\/\//, h.host + ' rests on terms a reader can open');
    assert.ok(h.why && h.whyJp, h.host + ' gives its reason in en and jp');
    if (h.allowed) assert.match(h.pathPrefix, /^\/.+\/$/, h.host + ': permission covers a path, not a whole host');
  }
});

test('① the ledger rule refuses a statement that has no basis, no reason, no kind, or covers a whole host', () => {
  const files = browserFiles(ROOT), legalSource = read(LEGAL);
  const bad = JSON.parse(JSON.stringify(ledger));
  const row = bad.hosts.find((r) => r.disclosure && r.probe);
  row.offline = { allowed: true };
  let r = check({ files, ledger: bad, legalSource });
  const mine = r.problems.filter((p) => p.includes(row.host) && p.includes('offline'));
  assert.ok(mine.some((p) => /basis/.test(p)), 'no basis is refused');
  assert.ok(mine.some((p) => /both languages/.test(p)), 'no reason is refused');
  assert.ok(mine.some((p) => /kind/.test(p)), 'no kind is refused');
  assert.ok(mine.some((p) => /pathPrefix/.test(p)), 'permission with no path is refused');
  row.offline = { allowed: 'yes', basis: 'https://x.test/t', why: 'a', whyJp: 'あ', kind: 'k' };
  r = check({ files, ledger: bad, legalSource });
  assert.ok(r.problems.some((p) => p.includes(row.host) && /true or false/.test(p)), 'a non-boolean answer is refused');
  /* …and the real ledger passes its own rule */
  assert.deepEqual(check({ files, ledger, legalSource }).problems, []);
});

test('① may-it-be-saved: yes inside the covered path, no with the terms, and silence is not permission', () => {
  const ok = P.verdict(policy, 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/4/8/5.png');
  assert.equal(ok.ok, true);
  assert.equal(P.verdict(policy, 'https://elevation-tiles-prod.s3.amazonaws.com/other-dataset/4/8/5.png').why, 'not-stated', 'the same host, outside the covered path');
  const no = P.verdict(policy, 'https://tiles.openfreemap.org/planet/20250101/3/4/2.pbf');
  assert.equal(no.ok, false); assert.equal(no.why, 'stated-no'); assert.match(no.row.basis, /openfreemap/);
  assert.equal(P.verdict(policy, 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1').why, 'not-stated', 'nobody wrote anything down about Esri imagery');
  assert.equal(P.verdict(policy, 'http://elevation-tiles-prod.s3.amazonaws.com/terrarium/4/8/5.png').ok, false, 'never plaintext');
  assert.equal(P.verdict({ hosts: [] }, 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/4/8/5.png').ok, false, 'an empty policy saves nothing');
  assert.equal(P.verdict(null, 'https://x.test/a').ok, false);
  const refused = P.refusals(policy);
  assert.ok(refused.length >= 1 && refused.every((r) => r.basis && r.why && r.whyJp));
});

/* ── ② ─────────────────────────────────────────────────────────────── */
test('② tile arithmetic: the world is 1+4+16 tiles to z2; a box that crosses 180° is two boxes; coarse comes first', () => {
  assert.equal(P.countTiles([-180, -85, 180, 85], 0, 2), 21);
  assert.deepEqual(P.splitBox([170, -10, -170, 10]), [[170, -10, 180, 10], [-180, -10, -170, 10]]);
  assert.deepEqual(P.splitBox([1, 2, 3, 4]), [[1, 2, 3, 4]]);
  const t = [...P.tilesOf([-180, -85, 180, 85], 0, 2)];
  assert.equal(t.length, 21);
  assert.deepEqual(t.map((x) => x.z), [...t.map((x) => x.z)].sort((a, b) => a - b), 'coarse levels are saved first');
  assert.equal(P.lng2x(0, 1), 1); assert.equal(P.lat2y(0, 1), 1);
  assert.equal(P.countTiles([170, -10, -170, 10], 3, 3), 4, 'both halves are counted');
  assert.equal(P.packId([1.0004, 2, 3, 4], 9), P.packId([1.0001, 2, 3, 4], 9), 'the same area is one pack');
});

test('② only the detail levels that fit the room are offered; the default is two levels finer than the view', () => {
  const opts = P.terrainOptions([139, 35, 140, 36], 0, 12, () => 50_000, 5_000_000);
  assert.ok(opts.length > 0 && opts.every((o) => o.bytes <= 5_000_000), 'nothing larger than the room');
  assert.ok(opts.every((o, i) => i === 0 || o.bytes >= opts[i - 1].bytes), 'finer is never smaller');
  assert.equal(P.terrainOptions([139, 35, 140, 36], 0, 12, () => 0, 1e9).length, 0, 'an unmeasured tile size offers nothing — no size is invented');
  const fixed = [{ zMax: 8 }, { zMax: 10 }, { zMax: 12 }];
  assert.equal(P.defaultDetail(fixed, 7.2).zMax, 10);
  assert.equal(P.defaultDetail(fixed, 11).zMax, 12, 'else the finest that fits');
  assert.equal(P.defaultDetail([], 7), null);
});

/* ── ③ ─────────────────────────────────────────────────────────────── */
function loadSw({ online, saved = new Map(), shell = true }) {
  const listeners = {};
  const self = { addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim: async () => {} },
    location: { origin: 'https://site.test' }, navigator: { onLine: online }, registration: { scope: 'https://site.test/' } };
  const calls = [];
  const caches = {
    match: async (key, opts) => { calls.push([key, opts && opts.cacheName]); return saved.get(key); },
    keys: async () => [], delete: async () => true, open: async () => ({ match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => true }),
  };
  const ctx = { self, caches, console, URL, Request: class {}, Response: class {}, Headers: class {}, fetch: async () => { throw new Error('network'); },
    setTimeout, clearTimeout, Date, Promise, Math, Map, Set, JSON };
  /* a BUILT worker carries the shell the build writes in place of the token; an unbuilt one (the dev server) carries none */
  const src = read('sw.js').replace(SHELL_TOKEN_RE, shell ? "{ build: 'b1', immutable: [], mutable: [] }" : '{ build: "", immutable: [], mutable: [] }');
  vm.runInNewContext(src, ctx);
  return { listeners, calls, ctx };
}
const fetchEvent = (url, mode = 'cors') => {
  const e = { request: { url, method: 'GET', mode }, answered: null, respondWith(p) { e.answered = p; }, waitUntil() {} };
  return e;
};

test('③ sw.js keeps one key for a terrain tile under all five host aliases, and it is the key the page saves under', () => {
  const tiles = makeDemSource().TILES;
  assert.equal(tiles.length, 5);
  const { ctx } = loadSw({ online: false });
  const t = { z: 7, x: 113, y: 51 };
  const keys = new Set(tiles.map((tpl) => vm.runInContext('offlineKey', ctx)(P.fill(tpl, t))));
  assert.equal(keys.size, 1, 'one tile, one key');
  const saved = P.savableTemplate(policy, tiles);
  assert.ok(saved, 'the policy lets one of the five spellings be saved');
  assert.equal([...keys][0], P.fill(saved, t), 'the page saves under the spelling the worker looks up');
  assert.equal(vm.runInContext('offlineKey', ctx)('https://site.test/data/x.json?v=1#a'), 'https://site.test/data/x.json?v=1', 'any other URL keeps itself, without the fragment');
  const pageName = /const OFFLINE_CACHE = '([^']+)'/.exec(read('js/offline-maps.js'))[1];
  assert.equal(vm.runInContext('OFFLINE_CACHE', ctx), pageName, 'the worker reads the cache the page writes');
  assert.ok(pageName.startsWith(vm.runInContext('PAGE_CACHE_PREFIX', ctx)), 'and activate keeps it across deploys');
});

test('③ the worker answers a saved file ONLY while the browser is offline, and never another origin’s', async () => {
  const res = { saved: true };
  const url = 'https://site.test/data/airports.json';
  const saved = new Map([[url, res]]);
  const off = loadSw({ online: false, saved });
  let e = fetchEvent(url);
  off.listeners.fetch(e);
  assert.ok(e.answered, 'offline: a same-origin file the reader saved is answered');
  assert.equal(await e.answered, res);
  assert.equal(off.calls[0][1], /const OFFLINE_CACHE = '([^']+)'/.exec(read('js/offline-maps.js'))[1], 'from the saved region’s cache and no other');
  e = fetchEvent('https://example.org/data/airports.json');
  off.listeners.fetch(e);
  assert.equal(e.answered, null, 'another origin is never answered from here');
  e = fetchEvent(url, 'navigate');
  off.listeners.fetch(e);
  assert.equal(e.answered, null, 'a navigation is the shell’s');
  const on = loadSw({ online: true, saved });
  e = fetchEvent(url);
  on.listeners.fetch(e);
  assert.equal(e.answered, null, 'online: nothing changes — the network answers as before, a saved copy is never preferred');
  assert.equal(on.calls.length, 0);
  const dev = loadSw({ online: false, saved, shell: false });
  e = fetchEvent(url);
  dev.listeners.fetch(e);
  assert.equal(e.answered, null, 'a worker that was never built (the dev server) answers no file of the app — only tiles — as installable-app ⑧ holds');
});

test('③ a terrain tile is answered from the saved region offline, before the network is tried', async () => {
  const tiles = makeDemSource().TILES;
  const t = { z: 5, x: 3, y: 2 };
  const key = P.fill(P.savableTemplate(policy, tiles), t), res = { tile: true };
  const off = loadSw({ online: false, saved: new Map([[key, res]]) });
  for (const tpl of tiles) {
    const e = fetchEvent(P.fill(tpl, t));
    off.listeners.fetch(e);
    assert.ok(e.answered, tpl);
    assert.equal(await e.answered, res, 'every alias reaches the one saved tile');
  }
});

/* ── ④ ─────────────────────────────────────────────────────────────── */
test('④ the move is said in words, in both languages, and a tiny move is not said', () => {
  const from = { lat: 35, lng: 139 };
  assert.equal(moveWords(from, { lat: 35.5, lng: 139 }, 'en'), 'Moved about 56 km north.');
  assert.match(moveWords(from, { lat: 35, lng: 139.5 }, 'en'), /east\.$/);
  assert.match(moveWords(from, { lat: 34.5, lng: 138.5 }, 'en'), /south-west\.$/);
  assert.equal(moveWords(from, { lat: 35.5, lng: 139 }, 'jp'), '約 56 km 北 へ移動。');
  assert.equal(moveWords(from, { lat: 35.00001, lng: 139 }, 'en'), '');
});

test('④ the profile is read as sentences from the record the card draws — holes are said, with their reason', async () => {
  globalThis.window = { IntMapSafe: { html: (s) => String(s) } };
  const { profileSpeech } = await import('../js/place-dossier.js');
  const HOST = { lang: 'en', fmtElevVal: (v) => Math.round(v) + ' m' };
  const rec = {
    at: { lng: 139, lat: 35, text: '35.0, 139.0' },
    place: { status: 'ok', chain: [{ name: 'Fujisawa' }, { name: 'Kanagawa' }] },
    country: { status: 'ok', name: 'Japan', capital: 'Tokyo' },
    elevation: { status: 'ok', value: 43, text: '43 m' },
    time: { status: 'ok', timeZone: 'Asia/Tokyo', sun: null, sunWhy: 'sun-model-not-loaded' },
    layers: { status: 'ok', rows: [{ label: 'Temperature', status: 'ok', text: '18 °C' }, { label: 'Wind', status: 'unreadable', reason: 'features-not-a-value' }] },
  };
  const s = profileSpeech(rec, HOST);
  assert.match(s, /Fujisawa, Kanagawa\./);
  assert.match(s, /Country: Japan, capital Tokyo\./);
  assert.match(s, /Elevation 43 m\./);
  assert.match(s, /Temperature: 18 °C\./);
  assert.match(s, /1 layer\(s\) on have no value at this point: Wind\./, 'a layer that is on and unreadable is named, not dropped');
  const hole = profileSpeech({ ...rec, place: { status: 'unavailable', reason: 'network' }, elevation: { status: 'unavailable', reason: 'no-value-here' } }, HOST);
  assert.match(hole, /Place name unavailable: the source could not be reached\./);
  assert.match(hole, /Elevation: no value at this point/);
  assert.equal(profileSpeech(rec, { ...HOST, lang: 'jp' }).includes('国: Japan'), true, 'the words are the reader’s language');
});

test('④ one writer of the live region: the reader hands text to the narrator, never touches #map-narration', () => {
  const reader = read('js/map-reader.js'), narrator = read('js/map-narrator.js');
  assert.ok(!/map-narration/.test(codeOnly(reader)), 'js/map-reader.js does not name the region in code');
  assert.match(narrator, /narratorApi\.say\s*=/);
  assert.match(narrator, /e\.code !== 'KeyR'/, 'the keys are read from e.code, so macOS Option+R works');
  assert.match(narrator, /aria-keyshortcuts', 'Alt\+N Alt\+Shift\+N Alt\+R Alt\+Shift\+R'/);
});

test('④ Alt+R and Alt+Shift+R do not collide with any other handler in the page', () => {
  const taken = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!f.endsWith('.js') || f === 'map-narrator.js') continue;
    const src = read('js/' + f);
    if (/altKey/.test(src) && /KeyR|['"]r['"]|['"]R['"]/.test(src.split('\n').filter((l) => /altKey/.test(l)).join('\n'))) taken.push(f);
  }
  assert.deepEqual(taken, [], 'no other file binds Alt together with R');
  const ks = read('js/keyboard-shortcuts.js');
  assert.match(ks, /if\(e\.ctrlKey\|\|e\.metaKey\|\|e\.altKey\) return;/, 'the single-key shortcuts still return on any modifier');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────── */
test('⑤ Settings carries both rows, each nameable, and the words are written in both languages', () => {
  const html = read('index.html'), ks = read('js/keyboard-shortcuts.js');
  assert.match(html, /<select id="setting-map-reading">/);
  assert.match(html, /<label for="setting-map-reading" id="lbl-map-reading">/);
  assert.match(html, /id="btn-offline-maps"[^>]*aria-labelledby="lbl-offline-maps btn-offline-label"/);
  for (const needle of ['Reading mode (screen reader)', '読み上げモード（スクリーンリーダー）', 'Offline maps', '持ち歩ける地図（オフライン）', 'Alt+R / Alt+Shift+R']) assert.ok(ks.includes(needle), needle);
});

test('⑤ both capabilities are declared with their rows, documented in en and jp, and run from the same modules the buttons use', () => {
  const caps = read('js/atlas-cap-settings.js'), reg = read('js/atlas-capabilities.js');
  for (const id of ['settings.mapReading', 'settings.offlineMaps']) assert.ok(caps.includes("'" + id + "'") && reg.includes('"' + id + '"'), id + ' is in the entry and in the generated registry');
  assert.match(caps, /import\('\.\/map-reader\.js'\)/); assert.match(caps, /import\('\.\/offline-maps\.js'\)/);
  assert.match(caps, /持ち歩ける地図/); assert.match(caps, /読み上げモード/);
});

/* ── ⑥ the manager and the mode, RUN over fakes (no browser) ─────────────────────────────────────────────── */
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function fakeCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name);
    return { match: async (k) => s.get(typeof k === 'string' ? k : k.url), put: async (k, r) => { s.set(typeof k === 'string' ? k : k.url, r); }, delete: async (k) => s.delete(k), keys: async () => [...s.keys()] };
  };
  return { open, stores, keys: async () => [...stores.keys()] };
}

test('⑥ save keeps coarse levels first, counts what failed instead of retrying it, and a second save of the same area is one pack', async () => {
  const M = await import('../js/offline-maps.js');
  globalThis.localStorage = fakeStorage(); globalThis.caches = fakeCaches();
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    if (/\/2\/1\/0\.png$/.test(url)) return { ok: false, status: 503, headers: new Headers(), blob: async () => null };
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), blob: async () => new Blob([new Uint8Array(100)]) };
  };
  const template = P.savableTemplate(policy, makeDemSource().TILES);
  const files = [{ url: 'https://site.test/data/a.json', bytes: 10 }, { url: 'https://site.test/assets/x.js', bytes: 20 }];
  const box = [-180, -85, 180, 85];
  const progress = [];
  const pack = await M.save({ box, zMax: 2, template, name: 'world', layers: ['Quakes'], files }, (s) => progress.push(s));
  assert.equal(pack.tilesWanted, 21);
  assert.equal(pack.tiles, 20, 'the one tile the supplier refused is not in the pack');
  assert.equal(pack.missing, 1, 'and it is said, not hidden');
  assert.equal(asked.filter((u) => /\/2\/1\/0\.png$/.test(u)).length, 1, 'a failed tile is asked for ONCE — no blind retry');
  const z = asked.filter((u) => u.includes('/terrarium/')).map((u) => +/terrarium\/(\d+)\//.exec(u)[1]);
  assert.equal(z[0], 0, 'the coarsest level is requested first');
  assert.equal(pack.bytes, (20 + 2) * 100, 'bytes are what was actually stored');
  assert.ok(progress.length && progress.at(-1).total === 23, 'progress counts tiles and files');
  const cache = await globalThis.caches.open('intmap-page-offline-v1');
  assert.equal((await cache.keys()).length, 22, '20 tiles and 2 files are in the page-owned cache');
  assert.ok(await cache.match(P.fill(template, { z: 1, x: 0, y: 0 })), 'stored under the one spelling the worker looks up');
  assert.equal(M.listPacks().length, 1);
  asked.length = 0;
  const again = await M.save({ box, zMax: 2, template, name: 'world', layers: [], files }, null);
  assert.equal(again.id, pack.id);
  assert.equal(M.listPacks().length, 1, 'the same area is one pack');
  assert.equal(asked.filter((u) => !/\/2\/1\/0\.png$/.test(u)).length, 0, 'a tile that is already saved is not fetched again');
});

test('⑥ stopping a save stops the lanes, and removing a pack keeps what another pack still needs', async () => {
  const M = await import('../js/offline-maps.js');
  globalThis.localStorage = fakeStorage(); globalThis.caches = fakeCaches();
  const ctl = new AbortController();
  let n = 0;
  globalThis.fetch = async (url, init) => {
    if (++n === 3) ctl.abort();
    if (init && init.signal && init.signal.aborted) throw new Error('aborted');
    return { ok: true, status: 200, headers: new Headers(), blob: async () => new Blob([new Uint8Array(10)]) };
  };
  const template = P.savableTemplate(policy, makeDemSource().TILES);
  const stopped = await M.save({ box: [-180, -85, 180, 85], zMax: 6, template, name: '', layers: [], files: [] }, null, ctl.signal);
  assert.equal(stopped.stopped, true);
  assert.ok(stopped.tiles < stopped.tilesWanted, 'a stopped save does not finish');
  assert.ok(stopped.tiles >= 1, 'the coarse levels that were reached are kept');
  assert.equal(stopped.missing, stopped.tilesWanted - stopped.tiles, 'the missing are the unsaved, and the pack says so');
  assert.ok(await M.remove(stopped.id), 'a stopped pack is listed and can be deleted like any other');
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob([new Uint8Array(10)]) });
  const shared = [{ url: 'https://site.test/data/shared.json', bytes: 1 }];
  const a = await M.save({ box: [0, 0, 10, 10], zMax: 2, template, name: 'a', layers: [], files: shared }, null);
  const b = await M.save({ box: [0, 0, 10, 10], zMax: 3, template, name: 'b', layers: [], files: shared }, null);
  assert.notEqual(a.id, b.id);
  const cache = await globalThis.caches.open('intmap-page-offline-v1');
  assert.ok(await M.remove(b.id));
  assert.ok(await cache.match('https://site.test/data/shared.json'), 'a file the other pack saved stays');
  assert.ok(await cache.match(P.fill(template, { z: 2, x: 2, y: 1 })), 'a tile the other pack needs stays');
  assert.equal(await cache.match(P.fill(template, { z: 3, x: 4, y: 3 })), undefined, 'a tile only the removed pack needed is gone');
  assert.equal(await M.remove('no-such-pack'), false);
  await M.remove(a.id);
  assert.equal(await cache.match('https://site.test/data/shared.json'), undefined, 'the last pack to need a file takes it with it');
});

test('⑥ the reading mode is stored, said, and the narrator’s enrich hook follows it', async () => {
  const R = await import('../js/map-reader.js');
  const { narratorApi } = await import('../js/narrator-api.js');
  globalThis.localStorage = fakeStorage();
  const said = [];
  narratorApi.say = (t) => said.push(t); narratorApi.host = { lang: 'en' };
  narratorApi.engine = () => ({ camera: { getCenter: () => ({ lng: 139, lat: 35 }) } });
  assert.equal(R.readingOn(), false);
  R.setReading(true);
  assert.equal(R.readingOn(), true);
  assert.equal(typeof narratorApi.enrich, 'function', 'the narrator now asks the reader for the fuller paragraph');
  assert.equal(globalThis.localStorage.getItem('intmap_map_reading'), 'on');
  assert.match(said.at(-1), /^Reading mode on\./);
  R.toggleReading();
  assert.equal(R.readingOn(), false); assert.equal(narratorApi.enrich, null);
  assert.equal(said.at(-1), 'Reading mode off.');
  R.restore();
  assert.equal(R.readingOn(), true);
  assert.equal(said.length, 2, 'start-up with the stored switch on says nothing — the next settled move speaks');
  narratorApi.host = { lang: 'jp' };
  R.toggleReading();
  assert.equal(said.at(-1), '読み上げモードをオフにしました。');
});
