/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  developer-embed — 埋め込みをページから動かす API（js/embed-client.js）と、静的に配るオープンデータ
 *  （scripts/public-api.mjs → api/v1/）、そして開発者向けページ
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥: 埋め込み（?embed=1）は他サイトに置ける「絵」で、置いたページはそれを動かすことも、読者が
 *  どこへ動かしたかを知ることもできなかった。そして data/ の約 80 のデータセットは全部の読者のブラウザに
 *  配られているのに、どれが何で、どの条件で再利用してよいかを言う場所が無かった。
 *
 *  ここで測るのは評価した結果（ブラウザでの往復は tests/developer-embed.spec.js）:
 *    ① ライセンスの語彙: 台帳に今ある綴りが同じ識別子に寄り、知らない綴りは「知らない」と答える
 *    ② 1 つのデータセットの条件: 黙っている上流が 1 つでもあれば出さない・知らないライセンスは名前つきで
 *       出さない・最も厳しい条件が全体にかかる（変異で確かめる）
 *    ③ 木の上のカタログ: 出すものと出さないものは排他で全部を覆い、出すものの URL は実在のファイルを指し、
 *       出典表示が条件のものは表示する行を持つ。「© …」を述べる束を注入すると出さない側に落ちる
 *    ④ 国ごとの表は発見される（手の一覧ではない）: 鍵の過半が国コードの表だけが拾われる
 *    ⑤ クライアントが書く URL は embedUrl の文法と同じで、クライアントは何も import しない
 *    ⑥ 約束事（PROTOCOL）の全命令に枠の側の答えがあり、開発者ページは全命令・全イベントを載せる
 *    ⑦ 命令→共有リンクの断片: 年は 7 月 1 日・紀元前は拡張形式・live は tt を消す・読めない日付は拒む・
 *       経度は折り返し、他の欄（レイヤー・時刻）は残る
 *    ⑧ 配信: vite が developers.html と js/embed-client.js を写し、api/v1/ を書く plugin が登録されている
 *    ⑨ Atlas `openData`: 能力表に在り、カタログを読めないときは「無い」ではなく「読めなかった」と述べる
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const P = await import('../scripts/public-api.mjs');
const G = await import('../scripts/data-governance.mjs');
const E = await import('../js/embed-mode.js');
const C = await import('../js/embed-client.js');
const { SITE_URL } = await import('../supabase/functions/_shared/site-origin.js');
const TABLE = G.rightsTable();

test('① the licence vocabulary: the spellings the ledger states today meet one identifier each; an unknown one is unknown', () => {
  const id = (s) => (P.licenceOf(s) || {}).id || null;
  assert.equal(id('CC BY 4.0'), 'CC-BY-4.0');
  assert.equal(id('CC-BY-4.0'), 'CC-BY-4.0');
  assert.equal(id('CC0 1.0 Universal'), 'CC0-1.0');
  assert.equal(id('CC0-1.0'), 'CC0-1.0');
  assert.equal(id('ODbL'), 'ODbL-1.0');
  assert.equal(id('Public domain'), 'public-domain');
  assert.equal(id('U.S. Government work — not subject to copyright'), 'public-domain');
  assert.equal(id('CC BY-NC-SA 3.0 IGO'), 'CC-BY-NC-SA-3.0-IGO');
  assert.equal(id('© UNESCO'), null, 'a copyright notice is not a licence to redistribute');
  assert.equal(id('CC BY-ND 4.0'), null, 'a licence not in the vocabulary is not guessed');
  assert.equal(P.licenceOf(null), null);
  /* every licence value the tree states is either known or reported as not recognised — never dropped */
  for (const b of TABLE.bundles) {
    const t = P.termsOf(b);
    if (t.offered) for (const u of t.upstreams) assert.ok(P.licenceOf(u.licence), b.subject + ': offered under «' + u.licence + '», which the vocabulary does not know');
  }
});

test('② one dataset\'s terms: silence withholds, an unknown licence withholds by name, the strictest obligation wins', () => {
  const b = (inBand) => ({ subject: 'data/x', inBand, declared: [] });
  const one = (licence, extra) => Object.assign({ licence, upstreams: null }, extra || {});
  assert.equal(P.termsOf(b(null)).why, 'licence-not-stated');
  const mixed = { licence: null, upstreams: [{ licence: 'CC0 1.0' }, { licence: null }] };
  assert.equal(P.termsOf(b(mixed)).why, 'licence-not-stated', 'one silent upstream is not permission');
  const t = P.termsOf(b(one('© Somebody')));
  assert.equal(t.why, 'licence-not-recognised'); assert.match(t.detail, /© Somebody/);
  const strict = P.termsOf(b({ licence: null, upstreams: [{ licence: 'public domain' }, { licence: 'ODbL 1.0', paidBy: 'Row A' }, { licence: 'CC BY-NC-SA 4.0', publisher: 'Pub B' }] }));
  assert.equal(strict.offered, true);
  assert.deepEqual([strict.credit, strict.shareAlike, strict.commercial], [true, true, false]);
  assert.ok(strict.upstreams.some((u) => u.credit === 'Row A'), 'the credit a source names is the line to show');
  /* a licence that makes credit a condition, with nothing named to credit, is not offered */
  assert.equal(P.termsOf(b({ licence: 'CC BY 4.0', upstreams: null })).why, 'credit-not-stated');
  /* the builder's declaration is read when the bundle says nothing in-band */
  const decl = P.termsOf({ subject: 'data/y', inBand: null, declared: [{ by: 'scripts/b.mjs', record: one('CC0 1.0') }] });
  assert.equal(decl.offered, true); assert.equal(decl.from, 'builder');
});

test('③ the catalogue of this tree: offered ∪ withheld is every dataset, exactly once; URLs are real files; credit is carried', () => {
  const M = P.model({ table: TABLE });
  const ids = (xs) => xs.map((x) => x.id);
  const all = TABLE.bundles.map((b) => b.subject.replace(/^data\//, ''));
  assert.deepEqual([...ids(M.catalog.datasets), ...ids(M.catalog.withheld)].sort(), all.slice().sort());
  assert.ok(M.catalog.datasets.length > 0 && M.catalog.withheld.length > 0, 'both sides measured something');
  for (const d of M.catalog.datasets) {
    assert.ok(d.files.length, d.id + ' lists no file');
    for (const f of d.files) { assert.ok(f.url.startsWith(SITE_URL), f.url); assert.ok(existsSync(join(ROOT, f.path)), f.path); }
    if (d.terms.credit) assert.ok(d.credit.length, d.id + ' requires credit and names no line to show');
  }
  for (const w of M.catalog.withheld) assert.ok(['licence-not-stated', 'licence-not-recognised', 'credit-not-stated', 'not-served'].includes(w.reason), w.id + ': ' + w.reason);
  /* mutation: a bundle that states only a copyright notice is withheld, and says what it stated */
  const fake = { subject: 'data/fake-notice', kind: 'bundle', members: ['data/country-facts.json'], inBand: { licence: '© Example Corp', upstreams: null }, declared: [] };
  const M2 = P.model({ table: { bundles: [fake], dataSources: [] } });
  assert.equal(M2.catalog.datasets.length, 0);
  assert.deepEqual(M2.catalog.withheld.map((w) => [w.id, w.reason]), [['fake-notice', 'licence-not-recognised']]);
  /* …and a file the build does not copy is not advertised */
  const M3 = P.model({ table: TABLE, served: () => false });
  assert.equal(M3.catalog.datasets.length, 0);
  assert.ok(M3.catalog.withheld.some((w) => w.reason === 'not-served'));
});

test('④ per-country tables are discovered by their keys, not listed', () => {
  const U = P.countryUniverse(ROOT);
  assert.ok(U.has('JPN') && U.get('JPN').jp, 'Natural Earth gives Japan a Japanese name');
  const t = P.countryTables({ meta: { a: 1 }, rows: { JPN: 1, FRA: 2, XXA: 3 }, byYear: { 1990: 1, 1991: 2 } }, U);
  assert.deepEqual(t.map((x) => x.member), ['rows']);
  assert.deepEqual(t[0].outside, ['XXA'], 'a key outside the universe is reported, not made a country');
  assert.equal(P.countryTables({ JPN: { x: 1 }, USA: { x: 2 } }, U)[0].member, null, 'a table at the top level');
  const M = P.model({ table: TABLE });
  assert.ok(M.tables.length > 0, 'the tree has per-country tables');
  const jp = M.countryFile(M.countries.countries.find((c) => c.code === 'JPN'));
  for (const s of jp.sections) assert.ok(jp.terms[s.dataset], 'each section carries its dataset\'s terms: ' + s.dataset);
  for (const s of jp.sections) assert.ok(M.catalog.datasets.some((d) => d.id === s.dataset), s.dataset + ' is in a country file but not offered');
});

test('⑤ the client writes the embed address js/embed-mode.js writes, and imports nothing', () => {
  const made = [];
  const el = { appendChild: (f) => made.push(f) };
  const g = globalThis;
  const keep = { document: g.document, window: g.window };
  g.document = { querySelector: () => el, createElement: () => ({ style: {}, remove() { } }) };
  g.window = { addEventListener() { }, removeEventListener() { } };
  try {
    C.mount('#x', { hash: '#v=1.0000,2.0000,3.00,0,0,f', interactive: false, site: 'https://example.org/IntMap/' });
    C.mount('#x', { hash: 'v=1.0000,2.0000,3.00,0,0,f', site: 'https://example.org/IntMap/' });
  } finally { g.document = keep.document; g.window = keep.window; }
  const base = 'https://example.org/IntMap/index.html#v=1.0000,2.0000,3.00,0,0,f';
  assert.equal(made[0].src, E.embedUrl(base, { interactive: false }));
  assert.equal(made[1].src, E.embedUrl(base, { interactive: true }));
  assert.doesNotMatch(codeOnly(src('js/embed-client.js')), /^\s*import\s/m, 'a host page loads this file alone');
});

test('⑥ every command in PROTOCOL has an answer in the frame, and the developer page prints the whole protocol', async () => {
  const now = '#v=13.4000,52.5000,4.00,0,0,f';
  for (const name of Object.keys(C.PROTOCOL.commands)) {
    if (name === 'get') continue;   /* answered by the bridge itself, with the state */
    const r = E.commandHash(name, { hash: now, lng: 1, lat: 2, zoom: 3, at: '1914' }, now);
    assert.ok(r.hash, name + ': ' + r.error);
  }
  assert.match(E.commandHash('nope', {}, now).error, /unknown command/);
  const { outputs } = await import('../scripts/landing.mjs');
  const out = outputs();
  for (const p of ['developers.html', 'ja/developers.html']) {
    const h = out[p];
    assert.ok(h, p + ' is generated');
    for (const n of [...Object.keys(C.PROTOCOL.commands), ...Object.keys(C.PROTOCOL.events)]) assert.ok(h.includes('<code>' + n + '</code>'), p + ' does not show «' + n + '»');
    assert.ok(h.includes(P.CATALOG_MARK), p + ' has the place the build fills with the catalogue');
  }
  /* the page names the client by the site token the build fills in, never by a spelled host */
  assert.match(out['developers.html'], /__INTMAP_SITE_URL__js\/embed-client\.js/);
  /* the catalogue table the build puts there */
  const html = P.catalogHtml(P.model({ table: TABLE }).catalog, 'jp');
  assert.match(html, /data-api-catalog/); assert.match(html, /出していないもの/);
});

test('⑦ a command becomes one share-link fragment, and only what the clock and the camera can read', () => {
  const now = '#v=13.4000,52.5000,4.00,0,0,f&l=dl-nato&tt=1914-07-01&title=Europe';
  assert.equal(E.commandHash('time', { at: '1939' }, now).hash, '#v=13.4000,52.5000,4.00,0,0,f&l=dl-nato&tt=1939-07-01&title=Europe');
  assert.match(E.commandHash('time', { at: '-499' }, now).hash, /tt=-000499-07-01/);
  assert.equal(E.commandHash('time', { at: 'live' }, now).hash, '#v=13.4000,52.5000,4.00,0,0,f&l=dl-nato&title=Europe');
  assert.match(E.commandHash('time', { at: 'not a date' }, now).error, /not a date the clock can read/);
  const v = E.commandHash('view', { lng: 190, lat: 10, zoom: 40 }, now).hash;
  assert.equal(v, '#v=-170.0000,10.0000,24.00,0,0,f&l=dl-nato&tt=1914-07-01&title=Europe', 'wrapped, clamped, the rest kept');
  assert.match(E.commandHash('view', { lng: 0, lat: 91, zoom: 1 }, now).error, /lat/);
  assert.match(E.commandHash('view', { lat: 1, zoom: 1 }, now).error, /finite/);
  assert.equal(E.commandHash('state', { hash: 'v=1,2,3,0,0,g' }, now).hash, '#v=1.0000,2.0000,3.00,0,0,g');
  assert.match(E.commandHash('state', { hash: '#l=dl-nato' }, now).error, /no map view/);
  /* the bridge refuses a protocol version it does not speak, and writes the address without a history entry */
  const body = src('js/embed-mode.js');
  assert.match(body, /m\.v !== PROTOCOL\.v/);
  assert.match(body, /MapState\.address\(null, r\.hash\)/, 'the address is written by the store (replaceState), never by a history call of this file');
  assert.doesNotMatch(codeOnly(body), /location\.hash\s*=/, 'a command must not add to the host page\'s history');
});

test('⑧ distribution: the page and the client are copied, and api/v1/ is written by a registered plugin', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  for (const f of ['developers.html', 'js/embed-client.js']) assert.ok(STATIC_ASSETS.includes(f), f + ' is not copied into dist/');
  assert.match(src('vite.config.js'), /historyPagesPlugin\(\), publicApiPlugin\(\)/, 'written after the static copy (it measures what was copied)');
  assert.equal(P.API_DIR, 'api/v1/');
});

test('⑨ Atlas `openData` is a capability, and an unreadable catalogue is reported as unreadable — never as «no open data»', async () => {
  const caps = src('js/atlas-capabilities.js');
  assert.match(caps, /\["data\.openData","openData",/);
  const D = await import('../js/atlas-cap-data.js');
  const H = { L: (en) => en, esc: (s) => String(s), note: (s) => s, resolveCountrySync: (n) => (/japan/i.test(n) ? { code: 'JPN' } : null) };
  const g = globalThis, keep = { fetch: g.fetch, document: g.document };
  g.document = { baseURI: 'https://example.org/IntMap/index.html' };
  try {
    /* a Response as js/fetch-deadline.js reads it (status, headers, the body as text) */
    const resp = (status, body) => ({ ok: status < 300, status, headers: { get: () => 'application/json' }, body: null, text: async () => body });
    g.fetch = async () => resp(404, '');
    const bad = await D.openDataAnswer({}, H);
    assert.equal(bad.ok, false); assert.equal(bad.meta.openData.readable, false); assert.match(bad.html, /could not be read/);
    const M = P.model({ table: TABLE });
    g.fetch = async (u) => resp(200, JSON.stringify(/catalog\.json$/.test(String(u)) ? M.catalog : M.countryFile(M.countries.countries.find((c) => c.code === 'JPN'))));
    const all = await D.openDataAnswer({}, H);
    assert.equal(all.meta.openData.offered, M.catalog.datasets.length);
    assert.equal(all.meta.openData.developers, 'https://example.org/IntMap/developers.html');
    const one = await D.openDataAnswer({ dataset: 'country-facts' }, H);
    assert.deepEqual(one.meta.openData.matched.map((d) => d.id), ['country-facts']);
    const jp = await D.openDataAnswer({ country: 'Japan' }, H);
    assert.equal(jp.meta.openData.country.code, 'JPN');
    assert.ok(jp.meta.openData.country.datasets.length > 0);
  } finally { g.fetch = keep.fetch; g.document = keep.document; }
});
