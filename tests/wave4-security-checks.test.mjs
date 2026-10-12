// (wave4-security) 「この端末に保存されているもの」 — what this browser keeps for IntMap, held against what the code writes.
// scripts/device-storage-ledger.mjs discovers every storage write in js/, src/, sw.js and the pages' inline scripts (parsed, through the code's own
// bindings) and derives data/device-storage-ledger.json with the words of scripts/device-storage-words.json;
// js/device-storage-panel.js asks the browser what it holds and judges each item against that file.
// These checks run the real discovery on injected sources and the real panel functions on a fake browser —
// nothing here is a copy of the rule. See dev-notes/2026-10-13-wave4-security.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { discover, names, check, derive, readWords, browserScripts, KINDS, AREAS, OUT } from '../scripts/device-storage-ledger.mjs';
import { KIND_WORDS, globMatch, rowFor, judge, forgettable, compose, reportDocument, observe } from '../js/device-storage-panel.js';

const LEDGER = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const FILES = browserScripts();
const found = (files) => names(discover(files).writes).map((n) => n.area + ':' + n.name);

test('① the repository: every name the browser code writes has a kind and en + jp words, and the shipped file is what they derive', () => {
  const r = check();
  assert.deepEqual(r.problems, []);
  assert.ok(r.found.length >= 50, 'the discovery found the code\'s writes (an empty universe would pass vacuously)');
  assert.deepEqual(LEDGER.kinds, KINDS);
  assert.deepEqual(LEDGER.areas, AREAS);
  assert.equal(LEDGER.cookiesWritten, 0, 'IntMap\'s code sets no cookie — the panel and the security page both say so');
  /* a page's inline <script> is browser code too: the boot guard in index.html writes the build it last saw */
  const seenBy = (LEDGER.names.find((x) => x.area === 'local' && x.name === 'intmap_build_seen') || { by: [] }).by;
  assert.ok(seenBy.some((b) => /^index\.html#script\d+$/.test(b)), 'found in index.html\'s inline script: ' + seenBy.join(', '));
  for (const r2 of LEDGER.names) assert.ok(KINDS.includes(r2.kind) && r2.en && r2.jp && r2.en !== r2.jp, r2.area + ':' + r2.name);
});

test('② a new write without words fails; a row whose write is gone fails; a cookie fails; an unreadable name fails', () => {
  /* the three injected modules in one run, and the removal in another: each run parses the whole code once */
  let r = check(undefined, FILES.concat([
    { file: 'js/zz-new.js', text: "localStorage.setItem('intmap_brand_new_thing', '1');" },
    { file: 'js/zz-cookie.js', text: "document.cookie = 'x=1';" },
    { file: 'js/zz-dyn.js', text: 'export function put(v){ localStorage.setItem(location.search, v); }' },
  ]));
  assert.ok(r.problems.some((p) => p.startsWith('local:intmap_brand_new_thing') && /has no row/.test(p)), r.problems.join('\n'));
  assert.ok(r.problems.some((p) => /js\/zz-cookie\.js:1 sets a cookie/.test(p)));
  assert.ok(r.problems.some((p) => /js\/zz-dyn\.js:1 writes to local storage under a name no binding in the file fixes/.test(p)));
  const owner = FILES.find((f) => f.file === 'js/drone-nav.js');
  assert.ok(owner, 'the fixture module exists');
  r = check(undefined, FILES.filter((f) => f !== owner));
  assert.ok(r.problems.some((p) => /local:intmap_drone_routes — no code writes this name any more/.test(p)), 'removing the only writer makes the row stale');
});

test('③ names are read through bindings: const, +, template, ?:, object of keys, returning function, wrapper across modules, the global by flow', () => {
  const files = [
    { file: 'js/a.js', text: [
      "const K = 'intmap_a_const';",
      "localStorage.setItem(K, 1);",
      "localStorage.setItem('intmap_a_count_' + uid, 1);",
      "sessionStorage.setItem(`intmap_a_tab_${x}_v2`, 1);",
      "const KEYS = { t: 'intmap_a_t', p: 'intmap_a_p' }; localStorage.setItem(KEYS[id], 1);",
      "function keyOf(){ return 'intmap_a_fn:' + (u ? u.id : ''); } localStorage.setItem(keyOf(), 1);",
      "const B = { build: '' }; const SHELL = B.build ? 'intmap-a-shell-' + B.build : ''; caches.open(SHELL);",
      "for (const listed of await caches.keys()) await caches.open(listed);",
    ].join('\n') },
    { file: 'js/store.js', text: "export function idbBackend(idb, name) { const DB = name || 'intmap-a-notebook'; return idb.open(DB, 1); }\nexport function save(k, v) { window.localStorage.setItem(k, v); }" },
    { file: 'js/user.js', text: "import { idbBackend, save as put } from './store.js';\nidbBackend(indexedDB);\nput('intmap_a_wrapped', 1);" },
    { file: 'js/not-storage.js', text: "const store = { setItem(){}, open(){} }; store.setItem('nope', 1); store.open('nope2'); window.open('https://x.example');" },
  ];
  const got = found(files);
  for (const want of ['local:intmap_a_const', 'local:intmap_a_count_*', 'session:intmap_a_tab_*_v2', 'local:intmap_a_t', 'local:intmap_a_p',
    'local:intmap_a_fn:*', 'cache:intmap-a-shell-*', 'idb:intmap-a-notebook', 'local:intmap_a_wrapped']) assert.ok(got.includes(want), want + ' in ' + got.join(', '));
  assert.ok(!got.some((g) => /nope|x\.example/.test(g)), 'an object that is not the storage global is not storage: ' + got.join(', '));
  assert.ok(!got.includes('local:intmap_a_fn:'), 'a fixed name a pattern of the same area covers is that pattern\'s row');
  assert.deepEqual(discover(files).unreadable, [], 'reopening a name read back from caches.keys() names nothing new');
});

test('④ the kinds have the reader\'s words in both languages, in the ledger\'s order', () => {
  assert.deepEqual(Object.keys(KIND_WORDS), KINDS);
  for (const [k, [head, note, icon]] of Object.entries(KIND_WORDS)) {
    assert.ok(head[0] && head[1] && head[0] !== head[1] && note[0] && note[1], k);
    assert.ok(typeof icon === 'string' && icon, k + ' has an icon');
  }
});

test('⑤ matching: exact before pattern, the longest pattern, within the item\'s own area', () => {
  assert.ok(globMatch('intmap_login_count_*', 'intmap_login_count_abc'));
  assert.ok(globMatch('intmap_watch_notified:*', 'intmap_watch_notified:'), '* matches the empty run');
  assert.ok(globMatch('sb-*-auth-token*', 'sb-vpekfwdpurzejrrmacac-auth-token-code-verifier'));
  assert.ok(!globMatch('intmap_a', 'intmap_ab'));
  const L = { names: [{ area: 'local', name: 'a_*', kind: 'cache' }, { area: 'local', name: 'a_b*', kind: 'content' }, { area: 'local', name: 'a_bc', kind: 'credential' }, { area: 'cache', name: 'x', kind: 'cache' }] };
  assert.equal(rowFor(L, 'local', 'a_bc').kind, 'credential');
  assert.equal(rowFor(L, 'local', 'a_bd').kind, 'content');
  assert.equal(rowFor(L, 'local', 'a_z').kind, 'cache');
  assert.equal(rowFor(L, 'local', 'x'), null, 'a cache name does not describe a key');
  const real = rowFor(LEDGER, 'local', 'sb-vpekfwdpurzejrrmacac-auth-token');
  assert.ok(real && real.kind === 'credential' && real.signsOut, 'the sign-in session is named, as a credential that signs out');
});

/* a fake browser: two keys holding secrets, a database, a cache, another page's key on the shared address, a cookie */
function fakeBrowser() {
  const mk = (o) => ({ get length() { return Object.keys(o).length; }, key: (i) => Object.keys(o)[i], getItem: (k) => (k in o ? o[k] : null), removeItem: (k) => { delete o[k]; } });
  const local = { intmap_ais_key: 'SECRET-AIS-KEY-123', 'sb-vpekfwdpurzejrrmacac-auth-token': '{"access_token":"SECRET-JWT"}', intmap_settings: '{"a":1}', 'otherapp.state': 'x' };
  const cachesStore = { 'intmap-tiles-v2': 3, 'someone-elses-cache': 1 };
  globalThis.localStorage = mk(local);
  globalThis.sessionStorage = mk({ intmap_session: '1' });
  globalThis.indexedDB = { databases: async () => [{ name: 'intmap-gis' }] };
  globalThis.caches = { keys: async () => Object.keys(cachesStore), open: async (n) => ({ keys: async () => new Array(cachesStore[n]).fill(0) }) };
  globalThis.document = { cookie: 'trk=abc' };
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { estimate: async () => ({ usage: 4096, quota: 1 << 30 }), persisted: async () => false } }, configurable: true });
  return () => { for (const k of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'document', 'navigator']) delete globalThis[k]; };
}

test('⑥ the browser is asked, values are never carried: not in what is observed, the model, or the downloaded file', async () => {
  const restore = fakeBrowser();
  try {
    const seen = await observe();
    const blob = JSON.stringify(seen) + JSON.stringify(compose(seen, LEDGER, 'en')) + JSON.stringify(compose(seen, LEDGER, 'jp')) + JSON.stringify(reportDocument(seen, LEDGER));
    assert.ok(!/SECRET/.test(blob), 'no stored value appears anywhere');
    assert.ok(!/trk=abc|abc/.test(JSON.stringify(reportDocument(seen, LEDGER))), 'not even a cookie\'s value');
    const J = judge(seen, LEDGER);
    assert.deepEqual(J.kinds.map((g) => g.kind), ['credential', 'content', 'history', 'preference', 'cache'].filter((k) => J.kinds.some((g) => g.kind === k)), 'most personal first');
    assert.deepEqual(J.kinds.find((g) => g.kind === 'credential').items.map((i) => i.name).sort(), ['intmap_ais_key', 'sb-vpekfwdpurzejrrmacac-auth-token']);
    assert.deepEqual(J.unnamed.map((i) => i.area + ':' + i.name).sort(), ['cache:someone-elses-cache', 'cookie:trk', 'local:otherapp.state']);
    assert.equal(J.kinds.find((g) => g.kind === 'cache').items[0].entries, 3, 'a file store says how many files it holds');
    assert.equal(seen.coverage.idb, 'listed');
    assert.equal(reportDocument(seen, LEDGER).valuesIncluded, false);
    const m = compose(seen, LEDGER, 'jp');
    assert.match(m.headline, /2 件はログインやキーとして使えます/);
    assert.equal(m.tone, 'warn', 'an unnamed item needs the reader\'s attention first');
  } finally { restore(); }
});

test('⑦ «Forget this device» takes only what IntMap\'s ledger names — never another page\'s item, never anything when the ledger is unread', async () => {
  const restore = fakeBrowser();
  try {
    const seen = await observe();
    const all = forgettable(judge(seen, LEDGER)).map((i) => i.area + ':' + i.name);
    assert.ok(all.includes('local:intmap_ais_key') && all.includes('cache:intmap-tiles-v2') && all.includes('idb:intmap-gis'));
    assert.ok(!all.some((n) => /otherapp|someone-elses|cookie:/.test(n)), all.join(', '));
    const unread = judge(seen, null);
    assert.equal(unread.comparable, false);
    assert.deepEqual(unread.unnamed, [], '«could not read» is not «not named»');
    assert.deepEqual(forgettable(unread), []);
    assert.match(compose(seen, null, 'en').headline, /could not be read to compare/);
  } finally { restore(); }
});

test('⑧ no module keeps the retired AI provider keys, which Privacy §2 says the browser never holds', () => {
  for (const { file, text } of FILES) assert.ok(!/aiConfig\.keys\s*=/.test(text), file + ' assigns aiConfig.keys');
  const body = FILES.find((f) => f.file === 'js/app-body.js').text;
  assert.match(body, /delete c\.keys; localStorage\.setItem\('intmap_ai_config'/, 'a stored copy from before #R27 is rewritten without its keys');
});

test('⑨ Atlas can read it, Settings opens it, the security page and Privacy §2 say it — from the same ledger', () => {
  const caps = fs.readFileSync('js/atlas-capabilities.js', 'utf8');
  assert.match(caps, /\["system\.deviceStorage","deviceStorage",[^\]]*"read","none"/);
  assert.match(fs.readFileSync('index.html', 'utf8'), /id="btn-device-storage"/);
  assert.match(fs.readFileSync('js/connection-watch.js', 'utf8'), /#btn-device-storage/);
  for (const [page, word] of [['security.html', ' kinds'], ['ja/security.html', ' 種類']]) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /<section class="lp-sec" id="device">/, page);
    for (const kind of LEDGER.kinds) {
      const n = LEDGER.names.filter((r) => r.kind === kind).length;
      if (n) assert.ok(new RegExp('data-kind="' + kind + '"><h3>[^<]+</h3><p><b>' + n + word).test(html), page + ' counts ' + kind + ' from the ledger');
    }
  }
  const legal = fs.readFileSync('js/legal-text.js', 'utf8');
  assert.match(legal, /Settings ▸ Privacy ▸ «Stored on this device»/);
  assert.match(legal, /「この端末に保存されているもの」/);
});
