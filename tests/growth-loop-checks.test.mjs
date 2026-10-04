/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  growth-loop — 集めていた匿名集計を「読む・発信する・回答の型を数える」で閉じる
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  ① 入口: IntMap 自身の紹介ページ（作例 s/・about・teachers）から地図へ来た訪問は entry に数え、
 *     そのページのアドレスの utm を読む（紹介ページは計数器を走らせず、地図へのリンクで query を落とす）。
 *     ページの種類は scripts/landing.mjs（PAGES・shareDir）と一致していること・生成された sitemap の
 *     全ページを実際に分類できることを評価する。
 *  ② 回答の型: js/atlas-agent.js runTurn が回答で終わったターンにだけ {kernel:'atlas', phase:'answered',
 *     answerMode} をバスに流し、js/usage-counts.js がそれを atlas_mode として数える（同じ同意条件）。
 *     型の語彙は ANSWER_MODES と shape.js の閉じた規則で 1 つ。
 *  ③ admin.html «Growth»: 読む metric 名はすべて shape.js に宣言されていること、宣言された入口と回答の型に
 *     ラベルの欠けが無いこと、発信リンクの tag 規則が計数器の規則と同じであること、アドレスは site-url の
 *     トークンから来ること。
 *  ④ プライバシーポリシーが en / jp の両方で 2 つの新しい計数を述べていること。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE_HOST, SITE_URL } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p, q) => pathToFileURL(join(ROOT, p)).href + (q ? '?' + q : '');

const S = await import(modUrl('supabase/functions/usage-count/shape.js'));
const U = await import(modUrl('js/usage-counts.js'));
const CE = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const { PAGES, shareDir } = await import(modUrl('scripts/landing.mjs'));
const { SITE_TOKEN } = await import(modUrl('scripts/site-url.mjs'));
/* (marketing-next) the two doors the build generates (a directory of pages each, en and ja/), by the hub each generator owns */
const { HUB: HISTORY_HUB } = await import(modUrl('scripts/history-pages.mjs'));
const { OTD_HUB, dayPath } = await import(modUrl('scripts/on-this-day-pages.mjs'));
/* (country-pages) the third: one page per country */
const { COUNTRY_HUB, countryPath } = await import(modUrl('scripts/country-pages.mjs'));
const { WEEKLY_HUB } = await import(modUrl('scripts/weekly-earth-pages.mjs'));   /* (weekly-earth) the fourth generated door */
const GENERATED_DOORS = { history: HISTORY_HUB, 'on-this-day': OTD_HUB, countries: COUNTRY_HUB, weekly: WEEKLY_HUB };
const { makeAtlasAgent } = await import(modUrl('js/atlas-agent.js'));
const AGENT = makeAtlasAgent();

/* ── ① 入口 ─────────────────────────────────────────────────────────────────────────── */

test('growth-loop ① the landing-page doors are the pages scripts/landing.mjs makes, and nothing else', () => {
  /* the page kinds: landing.mjs's PAGES plus its share directory */
  assert.deepEqual(Object.keys(S.SITE_PAGES).filter((k) => k !== 'showcase').sort(), [...PAGES, ...Object.keys(GENERATED_DOORS)].sort());
  /* (marketing-next) a generated door is its hub and every page under it, in both languages — never a file beside them (a card's picture) */
  for (const [kind, hub] of Object.entries(GENERATED_DOORS)) {
    for (const dir of ['', 'ja/']) assert.equal(S.sitePageOf(SITE_URL + dir + hub, SITE_HOST), kind, dir + hub);
  }
  assert.equal(S.sitePageOf(SITE_URL + 'history/europe/1914/', SITE_HOST), 'history');
  assert.equal(S.sitePageOf(SITE_URL + dayPath('10-03', { dir: 'ja/' }), SITE_HOST), 'on-this-day');
  assert.equal(S.sitePageOf(SITE_URL + OTD_HUB + '10-03/card.png', SITE_HOST), null, 'a picture is not a door');
  assert.equal(S.sitePageOf(SITE_URL + countryPath('JPN', { dir: 'ja/' }), SITE_HOST), 'countries');
  assert.equal(S.sitePageOf(SITE_URL + 'api/v1/countries/JPN.json', SITE_HOST), null, 'a country\'s API file is not a door');
  assert.equal(shareDir({ dir: '' }), 's/', 'the share pages live under s/ (SITE_PAGES.showcase)');
  /* every door is a declared entry value, and every entry value is a door or one of the two map-link kinds */
  assert.deepEqual(S.METRICS.entry.dim.values.slice().sort(), ['embed', 'link', ...Object.keys(S.SITE_PAGES)].sort());
  /* every page the generated sitemap names is classified by what it is — read from the artifact, not listed */
  const locs = [...src('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].split(SITE_TOKEN).join(SITE_URL));
  assert.ok(locs.length > 4, 'the sitemap lists the landing pages');
  for (const loc of locs) {
    const rel = loc.slice(SITE_URL.length);
    const page = rel.replace(/^ja\//, '').replace(/\.html$/, '');
    const want = /^(ja\/)?s\//.test(rel) ? 'showcase' : PAGES.includes(page) ? page : null;   /* the map, sources, science … are not doors */
    assert.equal(S.sitePageOf(loc, SITE_HOST), want, loc);
  }
  assert.equal(S.sitePageOf(SITE_URL + 'privacy.html', SITE_HOST), null, 'a policy page is not a landing door');
  assert.equal(S.sitePageOf('https://elsewhere.example/s/koppen.html', SITE_HOST), null, 'only IntMap\'s own host');
});

test('growth-loop ① a visit through a landing page is counted with that page\'s campaign tags — once, on a fresh navigation', () => {
  const share = SITE_URL + 's/koppen.html?utm_source=Newsletter&utm_campaign=autumn';
  const rows = (o) => U.arrivalRows({ host: SITE_HOST, hash: '#v=15,25,1.4,0,0,f', ...o }).map((r) => r.m + '|' + r.d);
  assert.deepEqual(rows({ search: '', navType: 'navigate', referrer: share }),
    ['view|', 'entry|showcase', 'utm_source|newsletter', 'utm_campaign|autumn'],
    'the share page is the door (more specific than «link»), its tags are read, no ref row for IntMap\'s own host');
  assert.deepEqual(rows({ search: '?utm_source=x', navType: 'navigate', referrer: share }),
    ['view|', 'entry|showcase', 'utm_source|x'], 'the address the reader opened wins over the landing page\'s');
  assert.deepEqual(rows({ search: '', navType: 'reload', referrer: share }), ['view|'],
    'a reload keeps the first referrer; it is not a second arrival and its tags are not read again');
  assert.deepEqual(rows({ search: '', navType: 'navigate', referrer: SITE_URL + 'ja/teachers.html?utm_medium=email' }),
    ['view|', 'entry|teachers', 'utm_medium|email']);
  assert.deepEqual(rows({ search: '', navType: 'navigate', referrer: 'https://news.example.org/a?utm_source=leak' }),
    ['view|', 'entry|link', 'ref|news.example.org'], 'another site\'s query is never read — its host name only');
  assert.deepEqual(rows({ search: '?embed=1', navType: 'navigate', referrer: share }).slice(0, 2), ['view|', 'entry|embed']);
});

/* ── ② 回答の型 ───────────────────────────────────────────────────────────────────────── */

test('growth-loop ② one vocabulary for the kind of answer: the turn loop\'s and the counter\'s', () => {
  assert.deepEqual(S.METRICS.atlas_mode.dim.values.slice().sort(), AGENT.ANSWER_MODES.slice().sort());
  assert.equal(S.METRICS.atlas_mode.max, S.METRICS.atlas.max, 'one answer per question: the per-request bound is the questions\'');
  assert.equal(S.acceptRow('atlas_mode', 'essay', 1), null);
  assert.ok(/^[a-z][a-z_]{0,31}$/.test('atlas_mode'), 'the metric name passes the table\'s CHECK');
});

const scripted = (replies) => { let i = 0; return async () => replies[Math.min(i++, replies.length - 1)]; };
const TOOLS = { map_view: { name: 'map_view', description: 'Move the map.', parameters: { type: 'object', required: ['place'], properties: { place: { type: 'string', minLength: 1 } } } } };
async function turn(replies, extra) {
  const said = [];
  const os = { emit: (ev) => said.push(ev) };
  const r = await AGENT.runTurn({ model: scripted(replies), tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }], os, ...(extra || {}) });
  return { r, said };
}

test('growth-loop ② the turn loop announces the declared kind only when the reader is handed an answer', async () => {
  const a = await turn([{ text: 'The Seine is about 777 km long.', toolCalls: [], answerMode: 'text' }]);
  assert.equal(a.r.stopped, 'answered');
  assert.deepEqual(a.said, [{ kernel: 'atlas', phase: 'answered', answerMode: 'text' }], 'the mode and nothing of the question or answer');
  const none = await turn([{ text: 'An answer with no declared kind.', toolCalls: [] }]);
  assert.deepEqual(none.said, [], 'no declared kind — nothing to count');
  const empty = await turn([{ text: '', toolCalls: [], answerMode: 'text' }]);
  assert.notEqual(empty.r.stopped, 'answered');
  assert.deepEqual(empty.said, [], 'a turn with no answer in it is not an answer');
  const ac = new AbortController(); ac.abort();
  const aborted = await turn([{ text: 'x', toolCalls: [], answerMode: 'text' }], { signal: ac.signal });
  assert.equal(aborted.r.stopped, 'aborted');
  assert.deepEqual(aborted.said, [], 'a cancelled turn is not counted');
  /* the loop works the same with no bus at all (node, a test that injects none) */
  const bare = await AGENT.runTurn({ model: scripted([{ text: 'y', toolCalls: [], answerMode: 'text' }]), tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }], os: null });
  assert.equal(bare.text, 'y');
});

/* the real counter module on a fake production page, with a fake kernel bus */
async function bootPage(opts) {
  const o = opts || {};
  const listeners = { doc: {}, win: {} };
  const beacons = [];
  const subs = [];
  const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
  const doc = { referrer: '', visibilityState: 'visible', documentElement: { getAttribute: () => 'en' }, addEventListener: on(listeners.doc), getElementById: () => null };
  globalThis.window = {
    SUPABASE_URL: 'https://stub.supabase.test/', IM_HOST: { lang: 'en' }, IntMapDevice: { kind: () => 'desktop' },
    addEventListener: on(listeners.win),
    IntMapOS: { on: (fn) => { subs.push(fn); return () => {}; }, emit: (ev) => subs.forEach((f) => f(ev)) },
  };
  globalThis.document = doc;
  globalThis.location = { origin: CE.PRODUCTION_ORIGIN, hostname: SITE_HOST, search: '', hash: '' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { doNotTrack: o.dnt ? '1' : null, globalPrivacyControl: false, sendBeacon: (url, blob) => { beacons.push(blob); return true; } } });
  await import(modUrl('js/usage-counts.js', 'growth=' + Math.random()));
  (listeners.win.load || []).forEach((f) => f({}));
  const hide = () => { doc.visibilityState = 'hidden'; (listeners.doc.visibilitychange || []).forEach((f) => f({})); };
  const bodies = async () => Promise.all(beacons.map(async (b) => JSON.parse(await b.text())));
  const done = () => { for (const k of ['window', 'document', 'location', 'localStorage']) delete globalThis[k]; };
  return { emit: (ev) => globalThis.window.IntMapOS.emit(ev), hide, bodies, beacons, done };
}

test('growth-loop ② the counter counts the kind beside the question, under the same consent', async () => {
  const p = await bootPage();
  try {
    p.emit({ kernel: 'atlas', phase: 'turn', turnId: 1 });
    p.emit({ kernel: 'atlas', phase: 'answered', answerMode: 'map' });
    p.emit({ kernel: 'atlas', phase: 'turn', turnId: 2 });
    p.emit({ kernel: 'atlas', phase: 'answered', answerMode: 'map' });
    p.emit({ kernel: 'atlas', phase: 'answered', answerMode: 'essay' });
    p.emit({ kernel: 'atlas', phase: 'answered', answerMode: 'chart', capabilityId: 'x.y' });
    p.hide();
    const [body] = await p.bodies();
    const rows = body.c.filter((r) => r[0] === 'atlas' || r[0] === 'atlas_mode').map((r) => r.join('|')).sort();
    assert.deepEqual(rows, ['atlas_mode|map|2', 'atlas||2'], 'two questions, two map answers; an undeclared kind and a capability event are not counted');
  } finally { p.done(); }
  const q = await bootPage({ dnt: true });
  try {
    q.emit({ kernel: 'atlas', phase: 'answered', answerMode: 'text' });
    q.hide();
    assert.equal(q.beacons.length, 0, 'Do Not Track: nothing is sent');
  } finally { q.done(); }
});

/* ── ③ admin «Growth» ─────────────────────────────────────────────────────────────────── */

const ADMIN = src('admin.html');
const GROWTH = (() => {
  const a = ADMIN.indexOf('/* ---------------- GROWTH (growth-loop)'), b = ADMIN.indexOf('/* ---------------- NEWS EVENTS');
  assert.ok(a > 0 && b > a, 'the Growth block is in admin.html');
  return ADMIN.slice(a, b);
})();
const literal = (name) => {
  const m = new RegExp('const ' + name + '=(\\{[\\s\\S]*?\\}|/[^\\n]+/);').exec(GROWTH);
  assert.ok(m, name);
  return Function('return ' + m[1])();
};

test('growth-loop ③ every metric the Growth tab reads is declared, and every declared door and kind has a label', () => {
  const read = new Set([...GROWTH.matchAll(/\bg(?:Sum|Get|Top)\((?:cur|prev),(?:prev,)?'([a-z_]+)'/g)].map((m) => m[1]));
  for (const m of /\.in\('metric',\[([^\]]+)\]\)/.exec(GROWTH)[1].matchAll(/'([a-z_]+)'/g)) read.add(m[1]);
  for (const m of GROWTH.matchAll(/cur\.get\('([a-z_]+)'\)/g)) read.add(m[1]);
  assert.ok(read.size >= 8, [...read].join(','));
  for (const m of read) assert.ok(Object.prototype.hasOwnProperty.call(S.METRICS, m), `admin reads «${m}», which shape.js does not declare`);
  const doors = Object.keys(literal('G_ENTRY')).sort();
  assert.deepEqual(doors, ['direct', ...S.METRICS.entry.dim.values].sort(), 'a label per entry door, plus the ref counter\'s «direct»');
  assert.ok(S.acceptRow('ref', 'direct', 1), '«direct» is the ref counter\'s own word');
  assert.deepEqual(Object.keys(literal('G_MODE')).sort(), S.METRICS.atlas_mode.dim.values.slice().sort());
});

test('growth-loop ③ the campaign link uses the counter\'s tag rule and the site\'s one address', () => {
  const token = /const TOKEN = (\/[^\n]+\/);/.exec(src('supabase/functions/usage-count/shape.js'));
  assert.ok(token);
  assert.equal(String(literal('G_TAG')), token[1], 'the tag rule is the counter\'s (shape.js TOKEN)');
  /* the address is the build's token in an attribute (filled by scripts/site-url.mjs fillSiteToken), never a
     spelling, and never inside a script — a filled script would no longer match its CSP hash */
  assert.ok(ADMIN.includes('<meta name="intmap-site" content="' + SITE_TOKEN + '">'));
  assert.equal(ADMIN.split(SITE_TOKEN).length, 2, 'the token is written once — in that attribute, not inside a script');
  /* destinations are discovered from the sitemap, not listed */
  assert.match(GROWTH, /fetch\('\.\/sitemap\.xml'/);
  assert.ok(!/s\/koppen|teachers\.html|about\.html/.test(GROWTH), 'no page is listed by hand');
  /* the tab is wired like «Usage»: its own section, shown by its own listener */
  assert.match(ADMIN, /<button class="tab" data-tab="growth">Growth<\/button>/);
  assert.match(ADMIN, /<section id="tab-growth" class="hide">/);
});

/* ── ④ 開示 ─────────────────────────────────────────────────────────────────────────── */

test('growth-loop ④ the privacy policy states both new counts, in English and Japanese', () => {
  const legal = src('js/legal-text.js');
  assert.match(legal, /the <b>kind<\/b> of each Atlas answer \(text only, map, chart, or a mix/);
  assert.match(legal, /Atlas の回答の<b>種類<\/b>（文章のみ・地図・グラフ・その組み合わせ/);
  assert.match(legal, /one of the Service's own introduction pages \(an example, About, For teachers, Reading the news on a map, Embedding a map, the historical maps by year, On this day, This week on Earth\)/);
  assert.match(legal, /本サービスの紹介ページ（作例・概要・教員向け・ニュースを地図で読む・記事に地図を埋め込む・年代から探す歴史地図・この日の歴史地図・今週の地球）から開いたか/);
});
