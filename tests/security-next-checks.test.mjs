// (security-next) 「このページの通信」 — what the page really contacts, held against what IntMap says it contacts.
// js/connection-watch.js records (the browser's Resource Timing, every WebSocket, the CSP's refusals, and sw.js's
// batches of what background workers requested); js/connections-panel.js judges each host against
// data/connection-ledger.json, which scripts/connection-ledger.mjs derives from scripts/outbound-hosts.json.
// These checks evaluate the real modules (and sw.js in a sandbox) — nothing here is a copy of the rule.
// See dev-notes/2026-10-03-security-next.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readLedger, deriveConnectionLedger, CONNECTION_LEDGER, SENDS } from '../scripts/outbound-hosts.mjs';
import { build as buildConnectionLedger } from '../scripts/connection-ledger.mjs';
import { connectionKey, createWatch, MAX_HOSTS, RECENT_URLS } from '../js/connection-watch.js';
import { SENDS_WORDS, rowFor, judge, compose, reportDocument } from '../js/connections-panel.js';

const LEDGER = JSON.parse(fs.readFileSync(CONNECTION_LEDGER, 'utf8'));
const ORIGIN = 'https://intmap.example';   /* any origin: the rule is about the page's own origin, not a particular one */

test('① the shipped statement is exactly what the host ledger derives, row for row, each row in one form', () => {
  assert.deepEqual(LEDGER, deriveConnectionLedger(readLedger()));
  assert.deepEqual(buildConnectionLedger(), LEDGER, 'the builder writes the same thing check:datagov compares');
  assert.equal(LEDGER.hosts.length, readLedger().hosts.length, 'no row of the ledger is left out of what the reader is checked against');
  for (const r of LEDGER.hosts) {
    assert.ok(['disclosure', 'link', 'dormant', 'removedBy'].includes(r.form), r.host + ' carries one of the four forms');
    if (r.form === 'disclosure') assert.ok(r.disclosure.en && r.disclosure.jp && r.sends, r.host + ' says what it is sent and the policy words in en and jp');
  }
});

test('② every «what is sent» code has the reader\'s sentence, in en and jp — and no sentence for a code that does not exist', () => {
  assert.deepEqual(Object.keys(SENDS_WORDS).sort(), [...SENDS].sort());
  assert.deepEqual([...LEDGER.sendsCodes].sort(), [...SENDS].sort());
  for (const [k, [en, jp]] of Object.entries(SENDS_WORDS)) assert.ok(en && jp && en !== jp, k + ' has both languages');
});

test('③ what a request is recorded under: scheme and host only, never the page itself, never a non-network URL', () => {
  assert.equal(connectionKey('https://c.basemaps.cartocdn.com/light_all/4/8/5.png?api_key=SECRET', ORIGIN), 'https://c.basemaps.cartocdn.com');
  assert.equal(connectionKey('wss://stream.aisstream.io/v0/stream', ORIGIN), 'wss://stream.aisstream.io');
  assert.equal(connectionKey('http://127.0.0.1:8080/x', ORIGIN), 'http://127.0.0.1:8080', 'a port is part of the address');
  assert.equal(connectionKey(ORIGIN + '/IntMap/assets/main.js', ORIGIN), '', 'the page\'s own origin is IntMap itself');
  assert.equal(connectionKey(ORIGIN.replace('https:', 'wss:') + '/socket', ORIGIN), '', 'a socket to the page\'s own host is the page itself');
  for (const u of ['data:image/png;base64,AAAA', 'blob:' + ORIGIN + '/1234', 'about:blank', 'javascript:alert(1)', 'not a url']) assert.equal(connectionKey(u, ORIGIN), '', u);
});

test('④ the record aggregates by host, keeps the witnesses apart, and an overflow is counted — never silently dropped', () => {
  let clock = 1000;
  const w = createWatch({ origin: ORIGIN, now: () => clock });
  let heard = 0; const off = w.on(() => heard++);
  w.note('https://api.open-meteo.com/v1/forecast?latitude=35&longitude=139', 'page', 'fetch', { bytes: 300 });
  clock = 2000;
  w.note('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2', 'page', 'fetch', { bytes: 200 });
  w.note('wss://stream.aisstream.io/v0/stream', 'socket', 'websocket');
  w.note(ORIGIN + '/IntMap/data/x.json', 'page', 'fetch');
  w.noteWorkerBatch({ 'https://tiles.openfreemap.org': 40, [ORIGIN]: 3 }, 2);
  w.noteBlocked('https://evil.example/x.js', 'script-src-elem');
  const s = w.snapshot();
  const om = s.hosts.find((h) => h.host === 'api.open-meteo.com');
  assert.equal(om.count, 2); assert.equal(om.bytes, 500); assert.equal(om.first, 1000); assert.equal(om.last, 2000);
  assert.deepEqual(om.via, { page: 2 }); assert.deepEqual(om.kinds, { fetch: 2 });
  assert.equal(s.hosts.find((h) => h.host === 'stream.aisstream.io').scheme, 'wss');
  assert.deepEqual(s.hosts.find((h) => h.host === 'tiles.openfreemap.org').via, { worker: 40 });
  assert.equal(s.selfRequests, 1, 'IntMap\'s own requests are counted, not listed');
  assert.equal(s.hosts.length, 3, 'the page\'s own origin in a worker batch is not a host either');
  assert.equal(s.workerSeen, true); assert.equal(s.workerWindows, 2);
  assert.deepEqual(s.blocked.map((b) => b.host), ['evil.example'], 'a refused attempt is kept apart from what was contacted');
  assert.ok(!s.hosts.some((h) => h.host === 'evil.example'));
  assert.ok(heard >= 5, 'every note tells the listeners (the open panel redraws from them)');
  off();
  s.hosts[0].count = 999; assert.notEqual(w.snapshot().hosts[0].count, 999, 'a snapshot is a copy');
  const big = createWatch({ origin: ORIGIN, now: () => 0 });
  for (let i = 0; i < MAX_HOSTS + 5; i++) big.note('https://h' + i + '.example/', 'page', 'img');
  assert.equal(big.snapshot().hosts.length, MAX_HOSTS);
  assert.equal(big.snapshot().overflow, 5);
});

test('④b a request the policy refused is not «contacted» — whichever of its two reports arrives first', () => {
  /* Chromium gives a CSP-refused <script src> a Resource Timing entry AND a securitypolicyviolation (measured in
     tests/security-next.spec.js); the two are matched by the exact URL */
  const w = createWatch({ origin: ORIGIN, now: () => 0 });
  w.note('https://blocked.example/x.js', 'page', 'script');
  w.note('https://kept.example/a.js', 'page', 'script');
  w.noteBlocked('https://blocked.example/x.js', 'script-src-elem');
  w.noteBlocked('https://late.example/y.js', 'script-src-elem');
  w.note('https://late.example/y.js', 'page', 'script');
  w.note('https://late.example/y.js', 'page', 'script');    /* a second, real request to the same URL is counted */
  const s = w.snapshot();
  assert.deepEqual(s.hosts.map((h) => h.host).sort(), ['kept.example', 'late.example']);
  assert.equal(s.hosts.find((h) => h.host === 'late.example').count, 1, 'only the refused one is taken out');
  assert.deepEqual(s.blocked.map((h) => h.host).sort(), ['blocked.example', 'late.example']);
  /* the memory is bounded: a refusal for a URL noted RECENT_URLS notes ago is still matched, one older is not */
  const b = createWatch({ origin: ORIGIN, now: () => 0 });
  b.note('https://old.example/z.js', 'page', 'script');
  for (let i = 0; i < RECENT_URLS; i++) b.note('https://n' + i + '.example/', 'page', 'img');
  b.noteBlocked('https://old.example/z.js', 'script-src-elem');
  assert.ok(b.snapshot().hosts.some((h) => h.host === 'old.example'), 'past the bound the entry stays (documented beside RECENT_URLS)');
});

test('⑤ each observed host is judged against the statement: stated (by what is sent), unlisted, contradicting, refused', () => {
  assert.equal(rowFor(LEDGER, 'c.basemaps.cartocdn.com').host, '*.basemaps.cartocdn.com', 'a pattern names the hosts it covers');
  assert.equal(rowFor(LEDGER, 'a.basemaps.cartocdn.com').host, 'a.basemaps.cartocdn.com', 'an exact row wins over a pattern');
  assert.equal(rowFor(LEDGER, 'de.wikipedia.org:443').host, '*.wikipedia.org', 'the port is not part of the question');
  assert.equal(rowFor(LEDGER, 'wikipedia.org.evil.example'), null, 'a pattern never swallows a foreign suffix (js/host-match.js)');
  const link = LEDGER.hosts.find((r) => r.form === 'link');
  const dormant = LEDGER.hosts.find((r) => r.form === 'dormant');
  const h = (host, count) => ({ key: 'https://' + host, scheme: 'https', host, count, bytes: 0, first: 0, last: 0, via: { page: count }, kinds: { fetch: count } });
  const snap = { since: 0, at: 1, selfRequests: 4, overflow: 0, hosts: [h('c.basemaps.cartocdn.com', 30), h('de.wikipedia.org', 2), h('api.pwnedpasswords.com', 1), h(link.host, 1), h(dormant.host, 1), h('cams.example.net', 3)],
    blocked: [{ ...h('evil.example', 1), kinds: { 'script-src-elem': 1 } }] };
  const J = judge(snap, LEDGER);
  assert.equal(J.comparable, true);
  assert.deepEqual(J.unlisted.map((x) => x.host), ['cams.example.net']);
  assert.deepEqual(J.contradicts.map((x) => x.host).sort(), [link.host, dormant.host].sort(), 'a link-only or dormant row that was contacted contradicts the statement');
  const code = (host) => J.stated.find((g) => g.rows.some((r) => r.host === host)).code;
  assert.equal(code('c.basemaps.cartocdn.com'), 'area');
  assert.equal(code('de.wikipedia.org'), 'query-text');
  assert.equal(code('api.pwnedpasswords.com'), 'credential-prefix');
  assert.ok(J.stated.findIndex((g) => g.code === 'credential-prefix') < J.stated.findIndex((g) => g.code === 'area'), 'the most personal group comes first');
  assert.deepEqual(J.refused.map((x) => x.host), ['evil.example']);
  for (const lang of ['en', 'jp']) {
    const m = compose(snap, LEDGER, { page: true, socket: true, worker: false, policy: true }, lang);
    assert.equal(m.tone, 'bad', 'a contradiction outranks an unlisted host');
    assert.deepEqual(m.sections.slice(0, 2).map((s) => s.id), ['contradicts', 'unlisted'], 'what needs attention is shown first');
    assert.equal(m.sections.at(-1).id, 'coverage', 'what the list cannot see is always said');
    assert.ok(m.sections.at(-1).rows.some((r) => r.tone === 'warn'), 'an unwitnessed background worker is stated, not hidden');
    const stated = m.sections.find((s) => s.id === 'sends-area');
    assert.ok(stated.rows[0].detail.includes(lang === 'jp' ? '「CARTO」' : '«CARTO»'), 'each stated row quotes the policy words the reader can find');
  }
  const doc = reportDocument(snap, LEDGER, { page: true });
  assert.equal(doc.format, 'intmap-connections'); assert.equal(doc.unlisted[0].key, 'https://cams.example.net');
  assert.ok(!JSON.stringify(doc).includes('api_key'), 'the record carries hosts, never request URLs');
});

test('⑥ 「could not read the statement」 is not 「unlisted」 — nothing is accused when nothing could be compared', () => {
  const snap = { since: 0, at: 1, selfRequests: 0, overflow: 0, hosts: [{ key: 'https://x.example', scheme: 'https', host: 'x.example', count: 1, bytes: 0, first: 0, last: 0, via: {}, kinds: {} }], blocked: [] };
  const J = judge(snap, null);
  assert.equal(J.comparable, false); assert.equal(J.unlisted.length, 0); assert.equal(J.unread.length, 1);
  const m = compose(snap, null, {}, 'en');
  assert.equal(m.tone, 'warn'); assert.match(m.headline, /could not be read/);
  assert.ok(!m.sections.some((s) => s.id === 'unlisted'));
});

/* sw.js in a sandbox: what a WORKER client requests reaches every window; what a window requests does not (its own
   timeline has it); the request itself is never altered */
async function runWorker(events, clientTypes) {
  const listeners = {};
  const posted = [];
  const wins = Object.entries(clientTypes).filter(([, t]) => t === 'window').map(([id]) => ({ id, type: 'window', postMessage: (m) => posted.push({ to: id, m }) }));
  const timers = [];
  const self = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    skipWaiting() {}, location: { origin: 'https://example.test' },
    clients: { claim: async () => {}, get: async (id) => (clientTypes[id] ? { id, type: clientTypes[id], url: 'https://example.test/' } : undefined), matchAll: async () => wins },
  };
  const caches = { keys: async () => [], delete: async () => true, open: async () => ({ match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => true }), match: async () => undefined };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    self, caches, console, URL, Request: class {}, Response: class {}, Headers: class {}, fetch: async () => { throw new Error('offline'); },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, Date, Promise, Math, Map, Set, JSON, navigator: { onLine: true },
  });
  const waits = [];
  for (const e of events) {
    let responded = false;
    for (const fn of listeners.fetch) fn({ clientId: e.client, request: { url: e.url, method: 'POST', mode: 'cors', headers: { get: () => null } }, waitUntil: (p) => waits.push(p), respondWith: () => { responded = true; } });
    assert.equal(responded, false, 'noting a request never answers it');
  }
  while (timers.length) timers.shift()();
  await Promise.all(waits);
  return { posted, waits };
}

test('⑦ sw.js tells the page what background workers contacted — and only that', async () => {
  const { posted, waits } = await runWorker([
    { client: 'w1', url: 'https://tiles.openfreemap.org/planet/1/2/3.pbf' },
    { client: 'w1', url: 'https://tiles.openfreemap.org/planet/1/2/4.pbf' },
    { client: 'w1', url: 'https://example.test/own/file.json' },
    { client: 'win', url: 'https://api.open-meteo.com/v1/forecast' },
    { client: '', url: 'https://example.test/index.html' },
  ], { w1: 'worker', win: 'window' });
  assert.ok(waits.length >= 1, 'the worker is kept alive until the batch is delivered');
  assert.equal(posted.length, 1, 'one batch, to the one window');
  assert.equal(posted[0].m.type, 'connections-seen');
  assert.deepEqual(JSON.parse(JSON.stringify(posted[0].m.hosts)), { 'https://tiles.openfreemap.org': 2 }, 'the window\'s own request and the origin itself are not in it');
  assert.equal(posted[0].m.windows, 1);
  const none = await runWorker([{ client: 'win', url: 'https://api.open-meteo.com/v1/forecast' }], { win: 'window' });
  assert.equal(none.posted.length, 0, 'nothing is posted when no worker contacted anything');
});

test('⑧ the reader reaches it: the Settings button, the boot witness, the words in en and jp, and Atlas', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="btn-connections"[^>]*>.*data-i18n="viewConnections"/);
  assert.match(fs.readFileSync('js/connection-watch.js', 'utf8'), /closest\('#btn-connections'\)/, 'the button has its one listener in the module that is always loaded');
  assert.match(fs.readFileSync('src/main.js', 'utf8'), /^import '\.\.\/js\/connection-watch\.js';$/m, 'the witness is on the boot path — one that starts late has missed the start');
  for (const l of ['en', 'jp']) {
    const loc = fs.readFileSync(`js/locales/ui.${l}.js`, 'utf8');
    for (const k of ['lblConnections', 'viewConnections', 'viewSecurityPage']) assert.match(loc, new RegExp('\\b' + k + ':"'), `${k} in ui.${l}.js`);
  }
  const caps = fs.readFileSync('js/atlas-capabilities.js', 'utf8');
  assert.match(caps, /\["system\.connections","connections",/, 'Atlas can ask for it by id');
  assert.match(fs.readFileSync('vite.config.js', 'utf8'), /'data',/, 'data/ (where the statement lives) is shipped');
});

test('⑨ the security page states what the ledger and index.html state — and a report has a private road to the database', async () => {
  const GEN = await import('../scripts/org-pages.mjs');
  const S = GEN.securityFacts();
  const ledger = readLedger();
  const stated = ledger.hosts.filter((r) => r.disclosure != null);
  assert.equal(S.stated, stated.length, 'the count on the page is the ledger\'s');
  assert.equal(S.groups.reduce((n, g) => n + g.hosts.length, 0), stated.length, 'every stated host is in exactly one group');
  const index = fs.readFileSync('index.html', 'utf8');
  assert.equal(S.analytics, /window\.INTMAP_ANALYTICS\s*=\s*true/.test(index), 'the analytics sentence follows the switch');
  for (const [rel, lang] of [['security.html', 0], ['ja/security.html', 1]]) {
    const html = fs.readFileSync(rel, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(html, GEN.outputs()[rel], rel + ' is what the generator writes');
    for (const g of S.groups) assert.ok(html.includes('data-sends="' + g.code + '"'), rel + ': a tile for ' + g.code);
    assert.ok(html.includes(SENDS_WORDS.area[lang]), rel + ': the tiles use the in-map list\'s own words');
    assert.ok(html.includes('id="report"') && html.includes('contact.html?for=other&amp;about=security'), rel + ': the report button opens the form with the security purpose chosen');
    assert.match(html, /script-src 'self'"/, rel + ': the page runs IntMap\'s own script only');
  }
  const shape = await import('../supabase/functions/_shared/inquiry-shape.js');
  assert.ok(shape.INQUIRY.purposes.includes('security'), 'reader-reports accepts the word');
  const last = fs.readdirSync('supabase/migrations').filter((n) => /\.sql$/.test(n) && fs.readFileSync('supabase/migrations/' + n, 'utf8').includes('org_inquiries_purpose_check')).sort().at(-1);
  assert.match(fs.readFileSync('supabase/migrations/' + last, 'utf8'), /'security'/, 'the table accepts it (the last migration that states the CHECK)');
  for (const rel of ['contact.html', 'ja/contact.html']) {
    const html = fs.readFileSync(rel, 'utf8');
    assert.match(html, /<option value="security">/, rel + ': the choice is offered');
    assert.match(html, /data-hint-for="security" hidden/, rel + ': with what to write (and what not to), shown only for that choice');
  }
  assert.match(fs.readFileSync('SECURITY.md', 'utf8'), /security\.html/, 'SECURITY.md names the channel that exists');
  assert.match(fs.readFileSync('js/legal-text.js', 'utf8'), /href="\.\/security\.html"/, 'the privacy policy §9 links to it');
});
