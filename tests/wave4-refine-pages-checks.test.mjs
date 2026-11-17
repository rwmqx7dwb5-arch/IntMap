/* ============================================================================
 *  wave4-refine (pages) — five defects measured 2026-11-16, each held by the fact that was wrong
 * ----------------------------------------------------------------------------
 *  ① A DATED RECORD STATES NOTHING OUTSIDE ITS OWN REACH. «Sumerian City-States» was indexed from the sheet year
 *    122,999 BC — 119,600 years below Cliopatria's first row (3399 BC) — because the map answered a Cliopatria piece
 *    there and the builder never asked the record's window; the reader then called that point a stated beginning
 *    (an equality with the record's first year, not a range), and the page, its title and the hub said «from 123,000 BC».
 *  ② ONE WIKIDATA ITEM, ONE PAGE. «United States» and «United States of America» (both Q30), the 27 slices of New Spain
 *    (all Q170603 — which the index did not even carry, because the map writes OpenHistoricalMap's item on the row and
 *    not on the piece) were separate pages. Names whose records state one and the same item are one page; every other
 *    name keeps its address, canonical to it; a name with no item is never joined by its spelling.
 *  ③ A READER'S WAIT IS COUNTED ONCE PER CALLER, RELEASE AND DAY, AND THE PUBLIC READING HAS ONE WINDOW. A reload loop
 *    was a hundred page loads; a caller choosing p_days = 1 and 2 could difference the shares into one day.
 *  ④ A HOST THE CODE REACHES OVER A WEBSOCKET IS ASKED OVER A WEBSOCKET, AND AN OFFLINE DEVICE IS ASKED NOTHING. The
 *    readiness check asked stream.aisstream.io and the backend's live updates with an https GET and called them reached.
 *  ⑤ A STORAGE WRITE THROUGH A WINDOW HANDED IN AS AN ARGUMENT IS A WRITE. js/readiness-check.js writes
 *    `intmap_readiness_probe` through `w = win || {}` with `window` passed by its caller; the ledger did not see it.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(join(ROOT, p)).href;
/* a literal inside a RegExp: every metacharacter escaped, the backslash first among them */
const reEscape = (x) => String(x).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const bundle = (rel) => { const t = src(rel); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };

const A = await import(modUrl('js/polity-arc.js'));
const B = await import(modUrl('scripts/build-polity-arcs.mjs'));
const IDX = JSON.parse(src('data/polity-arcs.json'));

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① a dated record\'s piece is a point only inside the record\'s own reach, and its first year is a range', () => {
  const clio = bundle('data/hist-clio.js');
  const W = B.recordWindows({ csFrom: 1886, csTo: 2019 }, clio.window, [[1689, 1885], [1886, 1923]]);
  assert.equal(B.inWindow(W, 'clio', -122999), false, 'a sheet year 119,600 years below Cliopatria is not Cliopatria\'s');
  assert.equal(B.inWindow(W, 'clio', clio.window[0]), true);
  assert.equal(B.inWindow(W, 'ohm', 1900), true, 'OpenHistoricalMap\'s two bundles are one reach');
  assert.equal(B.inWindow(W, 'cshapes', 1885), false);
  assert.throws(() => B.recordWindows({ csFrom: 1886, csTo: 2019 }, null, []), /states no reach/);

  /* the committed index: no dated point outside its record's reach, read from the index itself */
  const IW = IDX.instants.windows;
  assert.ok(IW && IDX.recs.every((r) => Array.isArray(IW[r]) && IW[r].length), 'the index states each record\'s reach');
  assert.deepEqual(IW.clio, [clio.window], 'Cliopatria\'s reach is the bundle\'s window');
  const outside = [];
  for (const a of IDX.arcs) for (const p of a.d || []) IDX.recs.forEach((r, i) => { if ((p[2] & (1 << i)) && !B.inWindow(IW, r, p[0])) outside.push(a.n + ' ' + r + ' ' + p[0]); });
  assert.deepEqual(outside, [], 'a point no record\'s reach covers');
  const sumer = IDX.arcs.find((a) => a.n === 'Sumerian City-States');
  assert.equal(sumer.d[0][0], clio.window[0], 'Sumerian City-States begins where Cliopatria begins');
  const D = A.describe(IDX, sumer);
  assert.equal(D.first.edge, 'reach', '…and the page says that is the record\'s beginning, not the polity\'s');

  /* the reader's edge is a range: a first point AT OR BEFORE the record's first year is the record's edge */
  const idx = { recs: ['clio', 'ohm', 'cshapes'], instants: { clioFrom: -3399, dayFrom: 1689, csFrom: 1886, to: 2019 }, arcs: [] };
  const arc = { n: 'x', d: [[-122999, 10, 1], [-3199, 0, 0]], pk: [-122999, 10, 1, null] };
  assert.equal(A.describe(idx, arc).first.edge, 'reach', 'a point below the record\'s reach is not a stated beginning');
  assert.equal(A.describe(idx, { ...arc, d: [[-3000, 10, 1], [-2000, 0, 0]] }).first.edge, 'stated');
  assert.equal(A.describe({ ...idx, instants: { ...idx.instants, windows: { clio: [[-5000, 2019]], ohm: [[1689, 1923]], cshapes: [[1886, 2019]] } } },
    { ...arc, d: [[-3399, 10, 1], [-3199, 0, 0]] }).first.edge, 'stated', 'the reach the index states decides, not the three edges');
});

/* ①b the map draws Cliopatria by the record's reach, whatever order it is asked in (js/time-borders.js _epochKey) */
test('①b the map does not draw Cliopatria outside its reach, and does inside it, in either order of reading', () => {
  /* in a process of its own: the map's harness installs a browser's globals (timers included) on the process it runs in,
     which would change what the tests after this one measure */
  const clio = bundle('data/hist-clio.js'), first = clio.window[0];
  const code = `
    const { mapReader } = await import(${JSON.stringify(modUrl('scripts/history-pages.mjs'))});
    const { july1, partsOfTier, recordOf } = await import(${JSON.stringify(modUrl('scripts/year-choice.mjs'))});
    const out = [];
    for (const order of ${JSON.stringify([[-122999, first, -9999, first, first - 2], [first, -122999, first - 2, -9999, first]])}) {
      const R = await mapReader();
      for (const y of order) {
        const r = await R.labelsAt(july1(y)); const parts = partsOfTier(r.tier);
        out.push([order[0], y, r.fc.features.filter((f, i) => recordOf(f.properties || {}, parts) === 'clio' && r.labels.en[i] === 'Sumerian City-States').length]);
      }
    }
    process.stdout.write(JSON.stringify(out)); process.exit(0);`;
  const res = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }));
  assert.equal(res.length, 10);
  for (const [o, y, n] of res) assert.equal(n > 0, y >= first, 'reading from ' + o + ': Sumerian City-States at ' + y + ' (' + n + ')');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② one page per Wikidata item the records state — never by spelling — and every old address canonical to it', async () => {
  const dated = A.largest(IDX, Infinity);
  /* the item OpenHistoricalMap's rows state is carried: the 27 slices of New Spain all state Q170603 */
  const ns = dated.filter((a) => /^New Spain \(/.test(a.n));
  assert.ok(ns.length >= 20 && ns.every((a) => JSON.stringify(a.q) === '["Q170603"]'), 'every slice of New Spain carries its row\'s item');
  const items = A.itemsOf(IDX, dated);
  const us = dated.find((a) => a.n === 'United States'), usa = dated.find((a) => a.n === 'United States of America');
  assert.ok(items.get(us) && items.get(us) === items.get(usa), 'United States and United States of America are Q30, and the item label agrees with both');
  /* ⚠ (historical-verification §4-3) a stated item joins only the names it is confirmed for — the claims measured wrong
     2026-11-16 keep their own pages and are listed for review */
  const by = (n) => dated.find((a) => a.n === n);
  const pending = A.itemsPending(IDX, dated);
  for (const [a, b] of [['Colony of Maryland', 'Republic of Maryland'], ['Qin Dynasty', 'Zhai'], ['British Bay Islands', 'Spanish Bay Islands'],
    ['Republic of Pirates', 'Bahamas'], ['Dutch occupation of Pondichery', 'French India'], ['Joint Mexico-Texas Claim', 'Republic of Texas']]) {
    const x = items.get(by(a)), y = items.get(by(b));
    assert.ok(!x || !y || x !== y, a + ' and ' + b + ' are not one page');
    assert.ok(pending.some((p) => p.name === a || p.name === b), a + ' / ' + b + ' is listed for review');
  }
  assert.equal(pending.find((p) => p.name === 'Zhai').why, 'differs', 'Zhai is not the label of the Qin dynasty');
  assert.equal(pending.find((p) => p.name === 'Republic of Pirates').why, 'lifespan', 'the Republic of Pirates is drawn only before The Bahamas began');
  /* New Spain: the slices whose own names meet the item's labels are one page; the rest wait for a label to meet */
  const nsItem = items.get(ns.find((a) => items.get(a)));
  assert.ok(nsItem && nsItem.members.every((a) => a.qv[0] === 'ok'), 'only confirmed slices join');
  for (const a of ns) if (!items.get(a)) assert.ok(pending.some((p) => p.name === a.n), a.n + ' waits for review, listed');
  for (const [a, it] of items) assert.equal(a.qv && a.qv[0], 'ok', a.n + ' joined ' + it.qid + ' without its identity confirmed');

  /* the identity test itself: labels in the row's own language, the lifespan, and no shared language → unverified */
  const B2 = await import(modUrl('scripts/build-polity-arcs.mjs'));
  const P0 = (await import(modUrl('js/atlas-geo-resolve.js'))).makeAtlasGeoResolve.placeRules;
  const ag = (a, b) => P0.agreement(a, { name: b }), min = P0.NAME_AGREE_MIN;
  assert.equal(B2.itemIdentity({ en: ['Zhai'] }, { labels: { en: ['Qin dynasty'] } }, [-210, -206], ag, min), 'differs');
  assert.equal(B2.itemIdentity({ en: ['Qin Dynasty'] }, { labels: { en: ['Qin dynasty'] }, s: [-221], e: [-206] }, [-220, -206], ag, min), 'ok');
  assert.equal(B2.itemIdentity({ en: ['Republic of Pirates'] }, { labels: { en: ['The Bahamas'] }, s: [1973] }, [1706, 1718], ag, min), 'lifespan');
  assert.equal(B2.itemIdentity({ en: ['Colony of Maryland'], ko: ['메릴랜드 식민지'] }, { labels: { de: ['Maryland in Liberia'] } }, [1700, 1776], ag, min), 'unverified');
  assert.equal(B2.itemIdentity({ en: ['New Spain (1706-1710)'], de: ['Vizekönigreich Neuspanien'] }, { labels: { de: ['Vizekönigreich Neuspanien'] } }, [1706, 1709], ag, min), 'ok');
  /* the heading: a name that writes no year it is drawn in, when there is one */
  const dy = { n: 'Realm (1700-1720)', q: ['Q9'], qv: ['ok'], d: [[1700, 50, 2], [1721, 0, 0]], pk: [1700, 50, 2, null] };
  const pl = { n: 'Realm', q: ['Q9'], qv: ['ok'], d: [[1721, 5, 2], [1725, 0, 0]], pk: [1721, 5, 2, null] };
  assert.equal(A.itemsOf({ instants: { to: 2019 } }, [dy, pl]).get(dy).canon, pl, 'the undated name heads the page even though the dated one is drawn longer');
  /* a name with no item is never joined by its spelling */
  const russia = dated.find((a) => a.n === 'Russia');
  if (russia && !russia.q) assert.equal(items.get(russia), undefined, 'Russia states no item and stays its own page');
  for (const [a, it] of items) assert.ok(a.q && a.q.length === 1 && a.q[0] === it.qid, a.n + ' joined without stating the item');

  /* the item's line is the sum of its names' lines, in the index's own shape */
  const x = { n: 'X', q: ['Q1'], qv: ['ok'], d: [[1700, 10, 2], [1710, 0, 0]], bb: [0, 0, 1, 1], pk: [1700, 10, 2, [0, 0, 1, 1]] };
  const y = { n: 'Y', q: ['Q1'], qv: ['ok'], d: [[1705, 5, 2], [1720, 7, 2], [1730, 0, 0]], bb: [2, 0, 3, 1], pk: [1720, 7, 2, [2, 0, 3, 1]] };
  const two = { n: 'Z', q: ['Q1', 'Q2'], d: [[1700, 99, 2]], pk: [1700, 99, 2, null] };
  const none = { n: 'X', d: [[1700, 1, 2]], pk: [1700, 1, 2, null] };
  const refused = { n: 'W', q: ['Q1'], qv: ['differs'], d: [[1700, 3, 2]], pk: [1700, 3, 2, null] };
  const its = A.itemsOf({ instants: { to: 2019 } }, [x, y, two, none, refused]);
  assert.equal(its.get(refused), undefined, 'a name whose item was not confirmed joins nothing');
  assert.equal(its.get(two), undefined, 'a name stating two items joins neither');
  assert.equal(its.get(none), undefined, 'a name with no item joins nothing, whatever its spelling');
  const m = A.itemArc(its.get(x));
  assert.deepEqual(m.d, [[1700, 10, 2], [1705, 15, 2], [1710, 5, 2], [1720, 7, 2], [1730, 0, 0]]);
  assert.deepEqual(m.pk.slice(0, 2), [1705, 15]);
  assert.equal(m.n, 'Y', 'headed by the name drawn over the most years');
  assert.deepEqual(m.names, ['X', 'Y']);

  /* the pages: the item's page at its head's address; the other name's old address is the same page, canonical to it */
  const P = await import(modUrl('scripts/polity-pages.mjs'));
  const M = await P.model({ only: ['united-states'], years: [] });
  assert.ok(M.aliases.some((a) => a.slug === 'united-states-of-america' && a.to === 'united-states'), 'the other name keeps its address');
  const out = await P.outputs(M);
  for (const L of (await import(modUrl('scripts/history-pages.mjs'))).LANGS) {
    const alias = out[P.polityPath('united-states-of-america', L) + 'index.html'];
    assert.ok(alias, 'the old address is still written (' + L.key + ')');
    assert.match(alias, new RegExp('<link rel="canonical" href="[^"]*' + reEscape(P.polityPath('united-states', L)) + '">'), 'canonical to the item\'s page');
    const page = out[P.polityPath('united-states', L) + 'index.html'];
    assert.ok(page.includes('United States of America'), 'the item\'s page names its other name');
    assert.ok(!out[P.hubPath(L) + 'index.html'].includes('data-polity="united-states-of-america"'), 'the hub lists the item once');
  }
  assert.ok(!out['sitemap-polities.xml'].includes('united-states-of-america/'), 'the sitemap lists the item once');

  /* addresses that existed are kept: the two spellings of Denmark–Norway now state one item and keep both addresses */
  const slugs = P.assignSlugs(IDX, dated);
  assert.equal(slugs.get(dated.find((a) => a.n === 'Denmark-Norway')), 'denmark-norway-q62651');
  assert.equal(slugs.get(dated.find((a) => a.n === 'Denmark–Norway')), 'denmark-norway-from-1689');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ a speed reading counts once per caller, release and day; the public reading has one window no caller chooses', async () => {
  const S = await import(modUrl('supabase/functions/usage-count/shape.js'));
  const rel = '202611161200-abcdef0';
  const rows = [{ m: 'view', d: '', n: 1 }, { m: 'ready', d: rel + '.m.2s', n: 1 }, { m: 'boot_end', d: rel + '.m.idle', n: 1 }];
  assert.deepEqual(S.speedOnce(rows, Date.UTC(2026, 10, 16, 12)).map((o) => o.once), ['ready.' + rel + '.20261116', 'boot_end.' + rel + '.20261116']);

  /* the function: the second reading of the same release from the same caller that day is not written */
  const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' };
  globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
  const FN = await import(modUrl('supabase/functions/usage-count/index.ts'));
  const taken = new Set(), calls = [];
  globalThis.fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1], body = JSON.parse(String(init.body));
    calls.push({ name, body });
    if (name === 'relay_take') {
      if (body.p_scope !== S.SPEED_ONCE_SCOPE) return new Response(JSON.stringify([{ allowed: true, remaining: 5 }]), { status: 200 });
      const ok = !taken.has(body.p_key); taken.add(body.p_key);
      return new Response(JSON.stringify([{ allowed: ok, remaining: 0 }]), { status: 200 });
    }
    return new Response(JSON.stringify(body.p_rows.length), { status: 200 });
  };
  const STAMP_REL = (() => { const d = new Date(Date.now() - 3600e3); return d.toISOString().slice(0, 16).replace(/[-T:]/g, '') + '-abcdef0'; })();
  const { siteUrl } = await import(modUrl('supabase/functions/_shared/site-origin.js'));
  const origin = new URL(siteUrl('')).origin;
  const req = () => new Request('https://stub.supabase.test/functions/v1/usage-count', { method: 'POST',
    headers: { origin, 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ c: [['view', '', 1], ['ready', STAMP_REL + '.m.2s', 1], ['boot_end', STAMP_REL + '.m.idle', 1]] }) });
  const first = await (await FN.handle(req())).json();
  const wrote1 = calls.filter((c) => c.name === 'record_usage_counts').pop().body.p_rows.map((r) => r.m);
  assert.deepEqual(wrote1, ['view', 'ready', 'boot_end'], 'the first reading is written');
  assert.equal(first.repeated, undefined);
  const second = await (await FN.handle(req())).json();
  const wrote2 = calls.filter((c) => c.name === 'record_usage_counts').pop().body.p_rows.map((r) => r.m);
  assert.deepEqual(wrote2, ['view'], 'the second reading that day is not; the page view still is');
  assert.equal(second.repeated, 2);
  const keys = calls.filter((c) => c.name === 'relay_take' && c.body.p_scope === S.SPEED_ONCE_SCOPE).map((c) => c.body.p_key);
  for (const k of keys) {
    assert.match(k, /^[0-9a-f]{32}\.(ready|boot_end)\.\d{12}-[0-9a-f]+\.\d{8}$/, 'the caller is its HMAC, never the address');
    assert.ok(!k.includes('203.0.113'), 'no address in the key');
    assert.ok(k.length <= 128, 'within relay_take\'s key length');
  }

  /* the public reading: no window argument, and the window the reader states is the database's */
  const FS = await import(modUrl('scripts/field-speed.mjs'));
  const mig = readdirSync(join(ROOT, 'supabase/migrations')).filter((n) => /create or replace function public\.field_speed\(/.test(src('supabase/migrations/' + n))).sort().pop();
  const sql = src('supabase/migrations/' + mig);
  assert.match(sql, /create or replace function public\.field_speed\(\)/, 'the newest definition takes no window');
  assert.match(sql, /drop function if exists public\.field_speed\(integer\)/, 'and the signature that took one is gone');
  assert.equal(+/u\.day > \(now\(\) at time zone 'utc'\)::date - (\d+)/.exec(sql)[1], FS.DAYS, 'the window the status page states is the database\'s');
  assert.doesNotMatch(src('scripts/field-speed.mjs'), /p_days=/, 'the reader asks for no window');

  /* a load the 20 s failsafe ended is always in `late`: the failsafe starts after navigation began, the time is from it */
  const html = src('index.html');
  assert.equal(+/finish\('timeout'\); \}\s*\},(\d+)\);/.exec(html)[1], S.BOOT_EDGES_MS[S.BOOT_EDGES_MS.length - 1], 'the last edge is the failsafe');
  assert.match(html, /marks\[why\|\|'ready'\]=Math\.round\(performance\.now\(\)\)/, 'the ending is timed from the start of navigation');
  assert.equal(S.bootBucket(S.BOOT_EDGES_MS[S.BOOT_EDGES_MS.length - 1] + 1), 'late');
  assert.match(src('supabase/functions/usage-count/shape.js'), /`late` IS EVERY LOAD THE FAILSAFE ENDED/, 'the declaration says so');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ a socket the code opens is asked by opening it; an offline device is asked nothing', async () => {
  const RC = await import(modUrl('js/readiness-check.js'));
  const ledger = JSON.parse(src('data/connection-ledger.json'));
  const ais = ledger.hosts.find((h) => h.host === 'stream.aisstream.io');
  /* the socket is the one the code opens, read from the code */
  assert.ok(src('js/data-layers.js').includes("new WebSocket('" + ais.socket + "')"), 'the AIS row\'s socket is the address js/data-layers.js opens');
  assert.deepEqual(ais.protocols, ['wss']);
  const backend = new URL(/window\.SUPABASE_URL = '([^']+)'/.exec(src('src/vendor.js'))[1]).hostname;
  const be = ledger.hosts.find((h) => h.host === backend);
  assert.ok(be.protocols.includes('https') && be.protocols.includes('wss'), 'the backend is reached over https and Realtime\'s socket');
  assert.match(be.socket, new RegExp('^wss://' + reEscape(backend) + '/realtime/v1/websocket\\?apikey=[^&]+&vsn='), 'the socket supabase-js opens');

  const probes = RC.probeRows(ledger.hosts, { firstView: [], backend });
  const aisP = probes.filter((p) => p.host === 'stream.aisstream.io');
  assert.deepEqual(aisP.map((p) => [p.kind, p.url]), [['socket', ais.socket]], 'a host reached only over a socket is asked only over it');
  assert.deepEqual(probes.filter((p) => p.host === backend).map((p) => p.kind), ['https', 'socket'], 'the backend both ways');

  /* the verdicts of a socket: opened, refused, silent */
  class FakeWS { constructor(url) { this.url = url; FakeWS.made.push(this); setTimeout(() => { if (url.includes('open')) this.onopen && this.onopen(); else if (url.includes('refuse')) { this.onerror && this.onerror(); this.onclose && this.onclose(); } }, 1); } close() { this.closed = true; } }
  FakeWS.made = [];
  const sp = (h) => ({ host: h, url: 'wss://' + h + '/s', tier: 'layer', what: h, whatJp: h, kind: 'socket' });
  const fetchImpl = () => { throw new Error('a socket row is not fetched'); };
  const res = await RC.probeAll([sp('open.example'), sp('refuse.example'), sp('hang.example')], { WebSocketImpl: FakeWS, fetchImpl, timeoutMs: 40, concurrency: 3 });
  assert.deepEqual(res.map((r) => r.verdict), ['reached', 'blocked', 'timeout']);
  assert.ok(FakeWS.made.every((w) => w.closed), 'every socket is closed — nothing is subscribed, nothing kept open');

  /* offline: nothing is asked, and the verdict is one word, not every host «not reached» */
  let asked = 0;
  const none = await RC.probeAll(probes, { online: false, fetchImpl: () => { asked++; return Promise.resolve({}); }, WebSocketImpl: FakeWS });
  assert.deepEqual(none, []); assert.equal(asked, 0);
  const m = RC.assess({ map: true, workers: true, online: false }, none, null);
  assert.equal(m.overall, 'offline');
  assert.equal(m.allow.length + m.missing.length + m.supplierDown.length, 0, 'no host is listed');

  /* the page's own policy lets exactly those sockets through */
  for (const rel of ['readiness.html', 'ja/readiness.html']) {
    const csp = /connect-src ([^;]+);/.exec(src(rel))[1].split(' ');
    for (const o of RC.socketOrigins(probes)) assert.ok(csp.includes(o), rel + ' allows ' + o);
    assert.ok(!csp.includes('wss:'), rel + ': not every socket origin');
  }
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ a write through the window a caller hands in is found, and a same-named binding elsewhere does not blind it', async () => {
  const D = await import(modUrl('scripts/device-storage-ledger.mjs'));
  const files = [
    { file: 'js/a.js', text: "export function report(doc, win) { const w = win || {}; try { const k = 'intmap_probe_x'; w.localStorage.setItem(k, '1'); w.localStorage.removeItem(k); } catch (_) {} }\nexport async function all(list) { let next = 0; await Promise.all([1].map(async () => { const k = next++; return k; })); }\n" },
    { file: 'js/b.js', text: "import { report } from './a.js';\nreport(document, window);\n" },
    { file: 'js/c.js', text: "export function other(o) { o.localStorage.setItem('not_a_write', '1'); }\nother({ localStorage: { setItem() {} } });\n" },
  ];
  const { writes, unreadable } = D.discover(files);
  assert.deepEqual(writes.map((w) => w.area + ':' + w.glob), ['local:intmap_probe_x'], 'the window handed in is the window; a plain object is not');
  assert.deepEqual(unreadable, [], 'the `k` of another function is not this write\'s name');
  /* the shipped ledger names the readiness check's own probe */
  const led = JSON.parse(src('data/device-storage-ledger.json'));
  assert.ok(led.names.some((n) => n.area === 'local' && n.name === 'intmap_readiness_probe' && n.by.includes('js/readiness-check.js')), 'the readiness probe is in the ledger');
});
