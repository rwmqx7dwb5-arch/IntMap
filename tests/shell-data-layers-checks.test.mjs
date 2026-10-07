/* ============================================================================
 *  shell-data-layers-checks — data layers and the facts they carry — countries, aviation, coasts, currents, elections
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r453-checks.test.mjs
 *  tests/r504-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r210-checks.test.mjs
 *  tests/r225-checks.test.mjs
 *  tests/r289-checks.test.mjs
 *  tests/r170-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r221-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import * as LM from '../js/layer-manifest.js';
import { wbRows, wbRowSeries } from './helpers/wb-rows.mjs';   /* (country-analysis-unify) the World Bank rows as js/wb-layers.js builds them */
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { publishedList } from './helpers/layer-groups.mjs';
import { installSafe } from './helpers/safe-html.mjs';
import { importModule, langRegistry } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R453 · from r453-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R453 — 死んだ API から、同梱したデータへ（そして「答えが無い」を値にする）
 * ----------------------------------------------------------------------------
 *  報告は本番の実測から来た——`enrichCountry()` が国別カードのたびに投げる
 *  `https://restcountries.com/v3.1/alpha/<ISO3>` が **5か国 5件とも CORS で失敗**する。
 *  だが CORS は症状で、病名ではない。**API そのものが撤去されている**：
 *  `/v3.1/alpha/USA` も `/v3.1/all` も `/v5/alpha/USA` も、261 バイトの
 *  「deprecated … migrate to v5」1枚へ 301 され、**その 301 に ACAO が無い**。
 *  v5 はアカウントと bearer key を要求するので、**URL を書き換える先も、中継する先も無い**
 *  （Supabase の relay を書いても、relay されるのは廃止通知である）。
 *
 *  ⚠⚠⚠ そして `catch(e){}` が、その失敗を**「隣国が無い国」と同じ値**にしていた。
 *  `sec()` は値が null の行を落とすので、USA のカードは **16行**で、Neighbours 行も
 *  Timezones 行も無いまま「完全なカード」に見えていた（#R262 の形：
 *  「空の答え」と「答えが無い」を同じ値にするな）。
 *
 *  ⚠⚠ 失われていたのは 2 行では済まない。`enrichCountry()` は **9つの欄**を供給していて、
 *  そのうち 3 つは `js/tables.js` の手書き表の**穴埋め**である。ne_10m の 252 コードに対して
 *  **CAPITAL が 60・CURRENCY が 100・LANGS が 115 欠けている**——それらのカードは API が
 *  死んで以来ずっと「—」を出していた。
 *
 *  ⚠ このファイルが**押す前**に言えること（`test:checks` に載っている）と、
 *  `tests/r424.spec.js` の末尾が**画面で**言えることは別物である。ここは
 *  **出荷される js/countries-ui.js を実際に実行し、出荷される data/country-facts.json を
 *  食わせて、カードの HTML に行が出ることまで**を見る——綴りの照合ではない。
 * ==========================================================================*/
{
const HERE = dirname(fileURLToPath(import.meta.url));
const at = (p) => resolve(HERE, '..', p);
const read = (p) => readLF(at(p));

const FACTS_PATH = 'data/country-facts.json';
const FACTS = JSON.parse(read(FACTS_PATH));

/* ══ ① 撤去された上流は、どのファイルからも呼ばれない ═══════════════════════════════════════
   ⚠ 注記を剥がしてから探す（#R345 の形——自分が書いた説明文を読んで緑になる検査を作らない）。
   このファイルの上の箱にも `restcountries.com` と書いてあるし、js/countries-ui.js の
   ⚠ 箱にも書いてある。**綴りではなく、コードに在るかどうか**が問われている。 */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('#R453 ① 撤去された restcountries.com を、実行されるコードのどこも名指さない', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(at(dir), { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|ts|html)$/.test(e.name)) continue;
      if (codeOnly(read(p)).includes('restcountries')) offenders.push(p);
    }
  };
  for (const d of ['js', 'src', 'supabase/functions']) walk(d);
  if (fs.existsSync(at('index.html')) && codeOnly(read('index.html')).includes('restcountries')) offenders.push('index.html');
  assert.deepEqual(offenders, [],
    '撤去された API を実行コードが名指している: ' + offenders.join(' '));
});

/* ══ ② 出典の付け替え ═══════════════════════════════════════════════════════════════════════
   AGENTS.md §3.4——データソースを変えたら出典表記も同時に変える。もう呼ばない API を
   出典として掲げ続けるのは、呼んでいる上流を隠すのと同じくらい誤りである。 */
/* spelling kept: browser script (js/reference-data.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R453 ② js/reference-data.js は、いま実際に読んでいる2つの上流を掲げている', () => {
  const src = read('js/reference-data.js');
  assert.ok(!/\{n:'REST Countries'/.test(src), '呼んでいない REST Countries が出典に残っている');
  assert.match(src, /mledoze\/countries/, 'mledoze/countries（ODbL）の出典が無い');
  assert.match(src, /ODbL 1\.0/, 'ODbL はライセンス義務——「任意の礼儀」ではない');
  assert.match(src, /iana\.org\/time-zones/, 'IANA time-zone database の出典が無い');
});

/* ══ ③ 同梱ファイルそのもの ═══════════════════════════════════════════════════════════════ */
test('#R453 ③ data/country-facts.json は、読める形で、主張どおりの中身を持つ', () => {
  assert.ok(FACTS && FACTS.countries, 'countries が無い');
  const C = FACTS.countries, codes = Object.keys(C);
  assert.ok(codes.length >= 200, '同梱コードが少なすぎる: ' + codes.length);

  /* 上流とライセンスが書いてある（この JSON 自身が出典を運ぶ） */
  assert.ok(Array.isArray(FACTS.sources) && FACTS.sources.length >= 2, 'sources が無い');
  assert.ok(FACTS.sources.some((s) => /mledoze/.test(s.u || '')), 'mledoze の出典が無い');
  assert.ok(FACTS.sources.some((s) => /iana\.org/.test(s.u || '')), 'IANA の出典が無い');

  /* 時間帯は UTC±HH:MM——カードは `slice(0,3).join(', ')` でそのまま出す */
  for (const [code, r] of Object.entries(C)) {
    if (r.tz === undefined) continue;
    assert.ok(Array.isArray(r.tz) && r.tz.length, code + ' の tz が空配列');
    for (const z of r.tz) assert.match(z, /^UTC[+-]\d\d:\d\d$/, code + ' の tz が UTC±HH:MM でない: ' + z);
  }
  /* 隣国は、この同じファイルの鍵でなければならない——カードは ISO3 をそのまま印字する */
  for (const [code, r] of Object.entries(C)) {
    for (const b of (r.borders || [])) {
      assert.ok(C[b], code + ' が知らないコードを隣国として持つ: ' + b);
      assert.ok((C[b].borders || []).includes(code), '陸の国境が片側だけ: ' + code + ' → ' + b);
    }
  }
  /* 国連加盟は真偽値で、193 ちょうど。VAT は宣言された訂正（常任オブザーバーであって加盟国ではない） */
  for (const [code, r] of Object.entries(C)) assert.equal(typeof r.un, 'boolean', code + ' の un が真偽値でない');
  assert.equal(Object.values(C).filter((r) => r.un).length, 193, '国連加盟国は 193');
  assert.equal(C.VAT.un, false, 'バチカン（教皇庁）は常任オブザーバーであって加盟国ではない');
  assert.ok((FACTS.corrections || []).some((c) => c.code === 'VAT'), '訂正はデータとして書き残す');
  assert.ok((FACTS.corrections || []).some((c) => c.code === 'LKA' && (c.dropBorders || []).includes('IND')),
    'スリランカとインドの間にあるのはポーク海峡であって陸の国境ではない——訂正が記録されていない');

  /* 報告された 2 行の実体 */
  assert.deepEqual(C.USA.borders, ['CAN', 'MEX'], 'USA の隣国');
  assert.ok(C.USA.tz.length >= 5, 'USA の時間帯が 5 未満: ' + JSON.stringify(C.USA.tz));
  assert.ok(C.DEU.borders.includes('POL') && C.DEU.borders.includes('FRA'), 'DEU の隣国');
  /* 表の穴埋めが実際に埋まる側（測定: ne_10m 252 コードに対し CAPITAL 60 / CURRENCY 100 / LANGS 115 欠） */
  assert.equal(C.URY.languages, 'Spanish', 'js/tables.js の LANGS にウルグアイは無い——ここが埋める');
  assert.match(C.MCO.currency, /^EUR/, 'js/tables.js の CURRENCY にモナコは無い——ここが埋める');
  assert.ok(C.BHR.capital, 'js/tables.js の CAPITAL にバーレーンは無い——ここが埋める');
});

/* ══ ④ 「無い」を宣言する ═══════════════════════════════════════════════════════════════════
   このラウンドの主題そのもの。tz を持たない行が在ってよいが、**黙って無い**のは駄目である。
   ファイルは `withoutTimezone` でそれを名指す（IANA が XK に区域を割り当てていないコソボと、
   無人の Heard & McDonald）。片方向ではなく両方向で照合する。 */
test('#R453 ④ tz を持たない行は、ファイル自身が名指している（黙って欠けていない）', () => {
  const C = FACTS.countries;
  const measured = Object.keys(C).filter((k) => !C[k].tz).sort();
  assert.deepEqual(FACTS.withoutTimezone || [], measured,
    'withoutTimezone が実体と一致しない — 宣言: ' + JSON.stringify(FACTS.withoutTimezone) +
    ' / 実測: ' + JSON.stringify(measured));
  for (const k of measured) assert.ok(C[k], k + ' は行そのものが無い（宣言できるのは「行は在るが tz が無い」だけ）');
});

/* ══ ⑤ 出荷されるファイルは、ハーネスが実行できる形である（#R443 が 16件で払った代金） ══
   (module-graph) このファイルは import / export を持つ ES module になった。ハーネスが実行できる
   ことの意味は「module として import でき、factory を export している」こと——どのハーネスも
   本文を文字列で評価せず import する（tests/news-countries-checks.test.mjs R443 ⑩ がそれを見ている）。 */
test('#R453 ⑤ js/countries-ui.js は module として import でき、factory を export している', async () => {
  const M = await importModule('js/countries-ui.js', { globals: { window: {} }, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: undefined } } });
  assert.equal(typeof M.countriesUi, 'function', 'js/countries-ui.js は factory countriesUi を export する');
});

/* ══ 出荷される module を、出荷されるデータで動かすための最小の窓 ═══════════════════════════
   再実装ではない——`js/tables.js` → `js/country-extent.js` → `js/countries-ui.js` を
   そのまま実行し、`showCountryDetail()` を呼んで、`#cp-body` に書かれた HTML を読む。 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(pred, ms = 6000) {
  const t0 = Date.now();
  for (;;) { if (pred()) return true; if (Date.now() - t0 > ms) return false; await sleep(10); }
}

function stubEl(id) {
  const el = {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', className: '',
    offsetWidth: 380, offsetHeight: 400,
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, contains() { return true; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getAttribute() { return null; }, setAttribute() {}, closest() { return null; }, click() {},
  };
  return el;
}

/** `factsBody` は fetch('data/country-facts.json') が返すもの。null なら失敗させる。 */
async function runCard({ facts }) {
  const els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, stubEl(id)); return els.get(id); };
  const fetches = [];
  const win = {
    innerWidth: 1280, innerHeight: 800,
    /* (module-graph) the language registry is no longer stubbed on window: js/countries-ui.js and
       js/tables.js IMPORT the real one (declared below with langRegistry()) */
  };
  const HOST = {
    countryStats: {}, countryGeo: null, lang: 'en', mode: 'map', statsFilters: [],
    canDraw: () => false, isMobile: () => false, searchVal: () => '',
    t: (k) => k,
    cName: (s, f) => (s && s.nameEn) || f || '—',
    fmtMoney: (v) => (v == null ? '—' : '$' + v + 'B'),
    fmtPc: (v) => (v == null ? '—' : '$' + Math.round(v)),
    makeDraggable: () => {},
    rebuildGeoIndex: () => {}, loadGdpPPP: () => Promise.resolve(), reapplyPPP: () => {},
    renderCompareFixed: () => {}, resolveCountryId: () => '', _respreadNews: () => {},
    applyCountryVisibility: () => {},
  };
  const doc = {
    getElementById: getEl,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => stubEl(''),
  };
  const env = {
    fetch: async (url) => {
      fetches.push(String(url));
      if (/country-facts\.json/.test(String(url))) {
        if (!facts) throw new Error('offline');
        return { ok: true, json: async () => JSON.parse(JSON.stringify(facts)) };
      }
      /* Wikipedia の要約（_fillCountryIntro）——このテストの主題ではない */
      return { ok: false, json: async () => null };
    },
    turf: { area: () => 1e12 },
    navigator: {}, requestIdleCallback: (fn) => setTimeout(fn, 0),
    console: { warn() {}, log() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  /* (module-graph) the browser is installed as globals and the files are IMPORTED, fresh per card:
     js/country-extent.js publishes on this card's window, js/countries-ui.js exports its factory and
     imports the real js/tables.js and language registry. Its js/geo-engine.js edge is handed
     `undefined` — this sandbox never had a renderer, which is what the card's own guards are for. */
  const globals = { window: win, document: doc, turf: env.turf, fetch: env.fetch, navigator: env.navigator,
    requestIdleCallback: env.requestIdleCallback, localStorage: env.localStorage };
  /* the card escapes names and facts through window.IntMapSafe (output-taint-gate) — the real encoder */
  installSafe(win);
  langRegistry();
  await importModule('js/country-extent.js', { globals });
  const { countriesUi } = await importModule('js/countries-ui.js', { globals, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: undefined } } });
  const mod = countriesUi(HOST);
  return { win, HOST, mod, body: getEl('cp-body'), popup: getEl('country-popup'), fetches };
}

/* USA の行——`_mkStat` を通さず、Natural Earth が実際に載せている欄だけを持たせる。
   同梱データが埋めるのは、ここに **書いていない** 欄である。 */
const usaStat = () => ({
  code: 'USA', nameEn: 'United States of America', a2: 'US', flag: '🇺🇸',
  pop: 340_000_000, area: 9_372_610, gdp: 27361, gdppc: 80474,
  region: 'North America', subregion: 'Northern America',
  capital: 'Washington, D.C.', currency: 'USD', languages: 'English',
  latlng: [39.4, -98.9],
});

/* ══ ⑥ 行が HTML に出る——このラウンドが直した当のもの ═════════════════════════════════════
   ⚠ 「関数が値を代入したか」ではなく「**カードに行が在るか**」を見る。欠陥は
   `sec()` が null の行を落とすところで起きていて、代入の側からは見えなかった。 */
test('#R453 ⑥ 同梱データで、カードに Neighbours / Timezones / UN member の3行が出る', async () => {
  const { HOST, mod, body } = await runCard({ facts: FACTS });
  HOST.countryStats.USA = usaStat();
  mod.showCountryDetail('USA', 'United States of America');
  const ok = await settle(() => /Neighbours/.test(body.innerHTML));
  assert.ok(ok, 'enrich 後も Neighbours 行が現れない: ' + body.innerHTML.slice(0, 400));

  const rows = [...body.innerHTML.matchAll(/<div class="cm-row"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/div>/g)]
    .map((m) => [m[1], m[2]]);
  const val = (k) => (rows.find((r) => r[0] === k) || [])[1];
  assert.equal(val('Neighbours'), 'CAN, MEX', 'Neighbours 行の値');
  assert.ok(val('Timezones'), 'Timezones 行が無い');
  assert.match(val('Timezones'), /^UTC[+-]\d\d:\d\d/, 'Timezones 行の値: ' + val('Timezones'));
  assert.equal(val('UN member'), 'Yes', 'UN member 行の値');

  /* ⚠ 「何行あるか」ではなく「**同じ国のカードが、供給者が居ないときと比べて何行増えるか**」。
     報告はまさにその差（16行・Neighbours も Timezones も無い）だったので、比べる相手を
     同じ通過の中に置く。⑧ が、この失敗した側が本当に失敗であることを別に言っている。 */
  const dead = await runCard({ facts: null });
  dead.HOST.countryStats.USA = usaStat();
  dead.mod.showCountryDetail('USA', 'United States of America');
  await settle(() => dead.win.IntMapCountryFacts.state === 'failed');
  const deadLabels = [...dead.body.innerHTML.matchAll(/<div class="cm-row"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  const gained = rows.map((r) => r[0]).filter((k) => !deadLabels.includes(k));
  assert.deepEqual(gained.sort(), ['Neighbours', 'Timezones', 'UN member'],
    '供給者が戻って増えた行が、報告された3行と一致しない: ' + JSON.stringify(gained));
});

/* ══ ⑦ 手書き表の穴が、同じ経路で埋まる ═══════════════════════════════════════════════════ */
test('#R453 ⑦ js/tables.js に無い国の Capital / Currency / Languages が「—」でなくなる', async () => {
  const { HOST, mod, body } = await runCard({ facts: FACTS });
  /* ウルグアイ——LANGS にも CURRENCY にも無い（測定済み） */
  HOST.countryStats.URY = {
    code: 'URY', nameEn: 'Uruguay', a2: 'UY', pop: 3_400_000, area: 176_215,
    gdp: 77, gdppc: 22000, region: 'South America', subregion: 'South America',
    capital: '', currency: '', languages: '', latlng: [-32.8, -56],
  };
  mod.showCountryDetail('URY', 'Uruguay');
  const ok = await settle(() => /Spanish/.test(body.innerHTML));
  assert.ok(ok, 'Languages が「—」のまま: ' + body.innerHTML.slice(0, 600));
  const rows = [...body.innerHTML.matchAll(/<div class="cm-row"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/div>/g)]
    .map((m) => [m[1], m[2]]);
  const val = (k) => (rows.find((r) => r[0] === k) || [])[1];
  assert.equal(val('statLang'), 'Spanish', 'Languages 行');
  assert.match(val('statCurrency'), /^UYU/, 'Currency 行');
  assert.equal(val('statCapital'), 'Montevideo', 'Capital 行');
});

/* ══ ⑧ 「答えが無い」は「空の答え」ではない（#R262） ═══════════════════════════════════════
   取得が失敗したときに ① 状態が値として残り ② それが「試した」として記録されず
   ③ 次のカードで retry される——3つとも、実行して確かめる。 */
test('#R453 ⑧ 取得が失敗したら、状態に残り、次のカードで retry される', async () => {
  const els = { n: 0 };
  /* まず失敗させる */
  const failing = await runCard({ facts: null });
  failing.HOST.countryStats.USA = usaStat();
  failing.mod.showCountryDetail('USA', 'United States of America');
  const F = failing.win.IntMapCountryFacts;
  const failed = await settle(() => F.state === 'failed');
  assert.ok(failed, '失敗が state に残らない（state=' + F.state + '）');
  assert.ok(F.error, 'error が空——「何が起きたか」が値として残っていない');
  assert.equal(F.get('USA'), null, '失敗したのに行が返る');
  assert.ok(!/Neighbours/.test(failing.body.innerHTML), '取得できていないのに行が出ている');
  /* ⚠ そして「試した」とは記録されない——これが古い `s._enrichedTried=true` との差 */
  assert.ok(!failing.HOST.countryStats.USA._enriched,
    '失敗した取得が「enrich 済み」として記録されている——このセッション中もう二度と取りに行かない');

  /* 同じ isolate で 2 枚目を開く＝もう一度 fetch が飛ぶ */
  const before = failing.fetches.filter((u) => /country-facts/.test(u)).length;
  failing.mod.showCountryDetail('USA', 'United States of America');
  const retried = await settle(() => failing.fetches.filter((u) => /country-facts/.test(u)).length > before);
  assert.ok(retried, '一度失敗したら二度と取りに行かない（' + before + ' 回で止まった）');
  assert.ok(els.n === 0);
});

/* ══ ⑨ 同梱ファイルが、実際に配られる経路に載っている ═══════════════════════════════════ */
test('#R453 ⑨ 読む側の綴りと、置いてある場所と、作り直す手順が一致している', () => {
  const src = codeOnly(read('js/countries-ui.js'));
  assert.ok(src.includes("'" + FACTS_PATH + "'"),
    'js/countries-ui.js が ' + FACTS_PATH + ' をその綴りで読んでいない（scripts/asset-report.mjs は綴りで照合する）');
  assert.ok(fs.existsSync(at(FACTS_PATH)), FACTS_PATH + ' が無い');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['build:countryfacts'], 'node scripts/build-country-facts.mjs',
    '作り直す手順が package.json に無い');
  assert.ok(fs.existsSync(at('scripts/build-country-facts.mjs')), '生成器が無い');
  /* 生成器は --check を持つ（byte 比較で上流とのズレを見つけられる） */
  assert.match(read('scripts/build-country-facts.mjs'), /--check/, '生成器に --check が無い');
});
}

/* ═══════════════════════ #R504 · from r504-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R504 — 「もっと多くの航空機を」と「方位磁針をちゃんとした計器に」
 * ----------------------------------------------------------------------------
 *  ⚠ 依頼の1本目は描画の話に見えて、**描画は一度も関係していなかった**。変更前の本番を測ると:
 *
 *      x-intmap-count      2,699 機
 *      x-intmap-coverage   lattice 0/980      ← どの isolate に訊いても、いつ訊いても
 *      provider の網が同じ分に見ていた機体   10,924 機（位置つき 10,911）
 *
 *  原因は2つあり、両方とも「上流が渋い」ではなかった。
 *
 *    ① **掃引の進捗が isolate を越えていなかった。** `STATE.cursor`・タイルごとの `last`/`miss`・
 *       #R434 の訊いた空域の台帳は全部 isolate の記憶で、Supabase は冷えた isolate を頻繁に配る。
 *       ⇒ 被覆率は 0 から動けず、掃引は毎回 cursor 0 から歩き直し、大洋を間引く `miss` は
 *         毎回 0 に戻るので**何も間引いていなかった**。
 *    ② **「間隔」が上流の実力の 1/5 だった。** #R434 はこの関数**全体**に 4 枚 / 45 秒
 *       ＝ 0.089 read/s を課していた。同じアドレス・同じ UA で測り直すと、2 秒間隔で 40 回中
 *       31 回が 200。**間隔で成功数が動かないのに 2 秒で 78 % 通る**のは四連発の弾倉ではなく
 *       毎秒 0.5 発ほどの leaky bucket の形である。
 *
 *  だからここで守るのは「今の定数が正しいこと」ではなく、**構造**である:
 *
 *    ① 上流を読む道は `takeTokens()` を通ったものしか無い（新しい呼び出し元が予算を迂回できない）。
 *    ② その bucket の算術が実際に平均 READ_RATE_PER_S を超えない——**出荷される桶そのもの**
 *       （#R801 から `_shared/read-budget.js`）を import し、この関数の takeTokens を vm に切り出して
 *       回す（#R498 の手口。写した式は写した瞬間から別物になる）。
 *    ③ isolate を越えて残るべき4つ（cursor・last・miss・台帳）が全部 `sweep.json` に載り、
 *       **格子の長さが変わったら捨てる**。番号を新しい空へ写すのは「探査済み」の嘘になる。
 *    ④ 45 秒の「間隔」は**消えている**。⚠ 消えたのは間隔だけで、「その空は訊く価値があるか」の
 *       VIEW_STALE_S は残る——1つの定数が持っていた2つの仕事のうち、1つだけを剥がした回なので、
 *       もう片方を巻き添えで消していないことを門にする。
 *    ⑤ 掃引ワークフローは「訊く」ことしかできない（`tiles=` は要求であって許可ではない）。
 *
 *  2本目（方位磁針）は見た目の話なので、守れるのは**見た目が壊れる形**だけである:
 *
 *    ⑥ 方位環は1つの図形で、デスクトップと携帯が**同じ幾何**を使う（片方だけ直す事故を止める）。
 *    ⑦ 北の針**以外**は `currentColor`＝テーマ追従。#9aa0a6 のような固定灰は1つも残っていない。
 *    ⑧ 2つの SVG は `id` を1つも持たない。gradient/defs を足した瞬間に**ページ内で id が衝突**し、
 *       後から来たほうが黙って前のを参照する——CSS でも検査でも見えない壊れ方なので、
 *       「入れられなくする」ほうを門にする。
 *    ⑨ #R480 の約束（.compass-btn は glass を再宣言しない・box-shadow はここにしか無い）が生きている。
 *
 *  3本目〜5本目は同じ回の追加依頼で、どれも「余白」の話である:
 *
 *    ⑩ 上の2つのバーと地名検索バーは**字を小さくせずに**縦を詰めた（実測 35.3→31.3・42→34）。
 *       ⚠ 検査するのは数値そのものではなく、**丸みが高さを追い越していないこと**——半径 21px は
 *       高さ 42px のちょうど半分で、高さだけ縮めるとピルが「角の丸い長方形」に化ける。
 *    ⑪ 画面下の2つの隅は**1つの余白を共有する**（「同じ幅で右下にそろえて」＝「隙間だけ同じように」）。
 *       片方だけ動かせる限り、それは「そろえた」ではなく「たまたま同じ数を2か所に書いた」である
 *       ——#R500 の形なので、**2つの数が等しいこと**を門にする。
 *    ⑫ Chronos の字は時計であって履歴の矢印ではない。
 * ==========================================================================*/
{
const rd = read;

const FEED = 'supabase/functions/aviation-feed/index.ts';

/* ⚠ コメントを剥がしてから数える。#R341 で同じ検査が**自分の説明コメント**に当たって
   `genSyntheticPlanes()` を3つ数えた——この文書化の濃いファイルでは10回目の形である。 */
const count = (s, re) => (s.match(re) || []).length;

/* ── ① 上流へ出る道は、予算を通ったものしか無い ─────────────────────────────────────────── */
/* spelling kept: Deno edge-function source (supabase/functions/aviation-feed/index.ts) — it runs against Deno, storage and the upstream feed. */
test('R504 ① every upstream read is granted by the one budget', () => {
  const code = codeOnly(rd(FEED));

  assert.match(code, /const READ_RATE_PER_S = [\d.]+;/, 'the ceiling is a named constant');
  assert.match(code, /const READ_BURST = \d+;/, 'and so is the burst');

  /* readTile は readSerial の中からしか呼ばれない（OpenSky の全球1発は別経路で、格子を使わない）。 */
  const readTileCalls = count(code, /(?<!function )\breadTile\(/g);
  assert.equal(readTileCalls, 1, `readTile() must have exactly one caller (readSerial); found ${readTileCalls}`);

  /* そして readSerial の呼び出し元は、どれも takeTokens で許可を得た数しか渡せない。
     呼び出し元の数と takeTokens の呼び出し数が一致することが、その言い換えである。 */
  const serialCalls = count(code, /await readSerial\(/g);
  const grants = count(code, /(?<!function )\btakeTokens\(/g);
  assert.equal(serialCalls, 2, `readSerial() has two call sites (view + sweep); found ${serialCalls}`);
  assert.equal(grants, serialCalls,
    `every readSerial() call site must be preceded by a takeTokens() grant — ${serialCalls} reads, ${grants} grants`);

  /* 視野側は「許可された枚数」だけを渡す。ranked 全部を渡してしまえば bucket は飾りになる。 */
  assert.match(code, /const grant = worthIt \? takeTokens\(ranked\.length, now\) : 0;/,
    'the viewport asks the budget for what it ranked');
  assert.match(code, /const spent = ranked\.slice\(0, grant\);/,
    'and spends only what it was granted');
  assert.match(code, /await readSerial\(provider, spent\.map\(/,
    'the read is over `spent`, not over `ranked`');
});

/* ── ② 出荷される bucket の算術そのものを回す ───────────────────────────────────────────── */
test('R504 ② the shipped bucket never averages more than READ_RATE_PER_S', async () => {
  const src = rd(FEED);
  const RATE = Number(/const READ_RATE_PER_S = ([\d.]+);/.exec(src)[1]);
  const BURST = Number(/const READ_BURST = (\d+);/.exec(src)[1]);

  /* ⚠ 写さずに切り出す。ここで式を書き写したら、明日この定数が動いたときに検査は古い式を
     守りつづける——#R498 が「シップ済みの塊を vm に出す」を選んだのと同じ理由。
     (#R801) 桶の算術は `_shared/read-budget.js` へ移った（ais-feed が同じ桶を引くため）ので、
     出荷される桶は import して回し、この関数に残った takeTokens（backoff の門）だけを切り出す。
     ⚠ 桶はこの関数が宣言した定数で作る——test が別の数で作った桶は、この関数の桶ではない。 */
  const { makeReadBudget } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/read-budget.js')).href);
  const grab = (name) => {
    const re = new RegExp('\\nfunction ' + name + '\\([\\s\\S]*?\\n\\}');
    const m = re.exec(src);
    assert.ok(m, `${name}() must be a top-level function so this test can run the shipped one`);
    return m[0];
  };
  assert.match(codeOnly(src), /const BUDGET = makeReadBudget\(\{ ratePerSec: READ_RATE_PER_S, burst: READ_BURST \}\);/,
    'the bucket is built from the two named constants, not from numbers written a second time');
  const ctx = { STATE: { backoffUntil: 0 }, BUDGET: makeReadBudget({ ratePerSec: RATE, burst: BURST }) };
  vm.createContext(ctx);
  vm.runInContext(grab('takeTokens'), ctx);

  /* 空のバケツは、経過時間ぶんしか出さない */
  ctx.BUDGET.seed(1000);
  assert.equal(ctx.takeTokens(6, 1000 + 10000), Math.floor(10 * RATE),
    '10 s of refill grants floor(10 · rate) tiles');

  /* どれだけ待っても BURST を超えない */
  ctx.BUDGET.seed(1000);
  assert.equal(ctx.takeTokens(9999, 1000 + 86400_000), BURST, 'a day of quiet still only fills the burst');

  /* backoff 中は 0——そして桶は止まらずに満ちる（休みが明けたとき最初の読みが待たされない） */
  ctx.BUDGET.seed(1000); ctx.STATE.backoffUntil = 5000;
  assert.equal(ctx.takeTokens(4, 4000), 0, 'nothing is granted while the function is backing off');
  assert.ok(Math.abs(ctx.BUDGET.tokens() - Math.min(BURST, 3 * RATE)) < 1e-9,
    'the bucket kept refilling through the backoff: ' + ctx.BUDGET.tokens());
  ctx.STATE.backoffUntil = 0;

  /* そして長い目で見た平均が ceiling を超えない。1 秒ごとに 4 枚ねだり続ける利用者を1時間。 */
  ctx.BUDGET.seed(0); ctx.BUDGET.refund(BURST);
  let got = 0;
  for (let t = 0; t <= 3600_000; t += 1000) got += ctx.takeTokens(4, t);
  const perSecond = got / 3600;
  assert.ok(perSecond <= RATE + BURST / 3600 + 1e-9,
    `a greedy hour must average <= the ceiling: ${perSecond.toFixed(4)}/s against ${RATE}/s`);
  assert.ok(perSecond > RATE * 0.95,
    `…and it must actually SPEND the ceiling, or the change bought nothing: ${perSecond.toFixed(4)}/s`);
});

/* ── ③ isolate を越えて残るもの ─────────────────────────────────────────────────────────── */
/* spelling kept: Deno edge-function source (supabase/functions/aviation-feed/index.ts) — it runs against Deno, storage and the upstream feed. */
test('R504 ③ the sweep ledger carries everything that used to die with the isolate', () => {
  const code = codeOnly(rd(FEED));

  /* 書く側 — cursor / last / miss / 台帳 / 最後に上流へ触れた時刻 */
  const body = /function sweepBody\(\)[\s\S]*?\n\}/.exec(code);
  assert.ok(body, 'sweepBody() builds the persisted form');
  for (const field of ['cursor', 'readAt', 'last', 'miss', 'asked', 'n:']) {
    assert.ok(body[0].includes(field), `sweepBody() must persist ${field}`);
  }

  /* 読む側 — そして格子の長さが変わったら捨てる */
  const apply = /function applySweep\([\s\S]*?\n\}/.exec(code);
  assert.ok(apply, 'applySweep() restores it');
  assert.match(apply[0], /j\.n === L\.length/,
    'a lattice of a different length must be discarded, not renumbered onto new sky');
  assert.match(apply[0], /STATE\.cursor = /, 'the cursor is restored');
  /* (#R801) the clock now lives in the shared bucket, and `seed()` is how the ledger's readAt reaches it */
  assert.match(apply[0], /BUDGET\.seed\(/,
    'and so is the bucket clock — otherwise a cold isolate grants itself a free burst');

  /* hydrate が実際に呼ぶ（作ったが誰も呼ばない、が #R493 の形） */
  assert.match(code, /Promise\.all\(\[loadSnapshot\(\), loadSweep\(\)/,
    'ensureHydrated loads the ledger alongside the aircraft');
  assert.match(code, /if \(applySweep\(sweep\)\)/, 'and applies it');

  /* 書き込みは両方の実際に走る経路から呼ばれる（#R341: after() は応答を越えて生きない） */
  const saves = count(code, /await saveSweep\(/g);
  assert.ok(saves >= 2,
    `saveSweep must be reached from BOTH paths that really run — the viewport read and ?refresh=1; found ${saves}`);
});

/* ── ③ b THE BUCKET'S MIME ALLOW-LIST IS A GATE THIS FUNCTION HAS TO PASS ─────────────────────
   ⚠ CAUGHT BEFORE DEPLOY, AND ONLY BECAUSE THE MIGRATION WAS RE-READ. `aviation` is declared with
   `allowed_mime_types = array['application/octet-stream']`, and Supabase Storage answers 415 to an
   upload with any other content-type. The first draft of saveSweep sent `application/json` —
   honest, and refused by the bucket on every single write, with the world snapshot and every other
   path still working perfectly. That is the #R341 shape exactly: a feature that looks alive in
   every test and never persists a byte in production. The two facts live in different files, so
   this is the only place they can be compared. */
/* spelling kept: Deno edge-function source (supabase/migrations/20260823130000_aviation_snapshot_bucket.sql) — it runs against Deno, storage and the upstream feed. */
test('R504 ③ b every object this function writes has a content-type the bucket accepts', () => {
  const mig = rd('supabase/migrations/20260823130000_aviation_snapshot_bucket.sql');
  const m = /allowed_mime_types\s*=?\s*array\[([^\]]+)\]/.exec(mig);
  assert.ok(m, 'the migration still declares the bucket mime allow-list');
  const allowed = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.ok(allowed.length, 'and the list is not empty');

  const code = codeOnly(rd(FEED));
  /* every upload — world.bin and sweep.json alike — goes to /storage/v1/object/ */
  const uploads = [...code.matchAll(/svcUrl\("\/storage\/v1\/object\/"[\s\S]{0,900}?"content-type": "([^"]+)"/g)]
    .map((x) => x[1]);
  assert.ok(uploads.length >= 2, `both objects must be written from here; found ${uploads.length} upload(s)`);
  for (const ct of uploads) {
    assert.ok(allowed.includes(ct),
      `content-type "${ct}" is not in the bucket's allow-list [${allowed.join(', ')}] — Storage answers 415 and the write silently never happens`);
  }
});

/* ── ④ 消したのは「間隔」だけ ───────────────────────────────────────────────────────────── */
/* spelling kept: Deno edge-function source (supabase/functions/aviation-feed/index.ts) — it runs against Deno, storage and the upstream feed. */
test('R504 ④ the global 45 s spacing is gone, and only the spacing', () => {
  const code = codeOnly(rd(FEED));
  assert.ok(!/now - STATE\.viewReadAt >= VIEW_STALE_S/.test(code),
    'the old "one burst per VIEW_STALE_S for the whole function" gate must be gone');
  /* ⚠ ですが VIEW_STALE_S 自身は残る。それは「その空は訊く価値があるか」で、上流の作法ではない。 */
  assert.match(code, /const VIEW_STALE_S = 45;/, 'VIEW_STALE_S still exists');
  assert.match(code, /const worthIt = ranked\.length > 0 && \(now - stalest\) \/ 1000 > VIEW_STALE_S;/,
    'and still decides whether a patch of sky is stale enough to be worth a read');

  /* 429 の休みは段階的で、成功で戻る */
  assert.match(code, /const RATE_BACKOFF_MIN_MS = \d+;/, 'the pause starts short');
  assert.match(code, /STATE\.backoffStep = Math\.min\(RATE_BACKOFF_MS, Math\.max\(RATE_BACKOFF_MIN_MS, STATE\.backoffStep \* 2\)\)/,
    'and doubles while refusals keep arriving, capped at the old flat value');
  assert.match(code, /STATE\.backoffStep = 0;/, 'a successful read clears it');
});

/* ── ⑤ 掃引ワークフローは「訊く」ことしかできない ───────────────────────────────────────── */
/* spelling kept: workflow configuration (.github/workflows/aviation-sweep.yml) — the claim is the text the runner reads. */
test('R504 ⑤ the sweeper may ask for a bigger slice; only the function may grant it', () => {
  const wf = rd('.github/workflows/aviation-sweep.yml');
  assert.match(wf, /\?ch=world&refresh=1&tiles=\d+/, 'the workflow asks with tiles=');
  assert.match(wf, /SLICES=\d+/, 'and loops rather than firing twice');

  const code = codeOnly(rd(FEED));
  assert.match(code, /const SWEEP_TILES_MAX = READ_BURST;/,
    'the query parameter is clamped to something the bucket can actually hold');
  assert.match(code, /Math\.min\(SWEEP_TILES_MAX, Number\(url\.searchParams\.get\("tiles"\)\)/,
    'the clamp is applied where the parameter is read');
  assert.match(code, /const grant = takeTokens\(want, now\);/,
    'and the sweep still asks the same budget everything else asks');
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑦ the satellite snapshot can answer any category ──────────────────────────────────────────── */
/* spelling kept: browser script (js/satellites-live.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑦ the bundled catalogue is the floor for every group, not only for `active`', () => {
  const s = read('js/satellites-live.js');
  assert.ok(!/if\(want==='active'&&!sats\.length\)/.test(s),
    'the bundle is no longer gated on the default group');
  assert.ok(/bundledGroupIds\(want\)/.test(s), 'a subset request is answered by filtering the bundle');
  assert.ok(/function ingestTLE\(text,want,only\)/.test(s), 'the filter is applied while parsing');
  /* ⚠ the honesty invariant: no membership list → no answer, rather than "everything" */
  assert.ok(/let only=null, haveList=\(want==='active'\)/.test(s),
    'a group with no published membership does not fall back to the whole catalogue');
  const b = read('scripts/build-tle-snapshot.mjs');
  assert.ok(/groups\.json/.test(b), 'the builder writes the membership beside the elements');
  /* the honesty invariant on the build side: a key is written ONLY when ids were actually parsed,
     and a failure is recorded rather than turned into an empty list */
  /* (tle-carry-forward) the rule moved into the one composer the builder and its test share; a group is
     written only when ids were parsed this run or carried from the previous bundle — evaluated in
     tests/tle-carry-forward-checks.test.mjs */
  assert.ok(/composeGroups\(/.test(b), 'the builder composes the membership through the shared rule');
  assert.ok(/if\s*\(fetched\[g\]\s*&&\s*fetched\[g\]\.length\)/.test(read('scripts/lib/tle-compose.mjs')), 'a group is written only when it has members');
  assert.ok(/groupErr\.push\(/.test(b), 'and a group that could not be fetched is recorded as an error, not as an empty catalogue');
});
}

/* ═══════════════════════ #R210 · from r210-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R210 — source-level checks (no browser, no boot).
 * ----------------------------------------------------------------------------
 *  Each of these states a property that a running app cannot cheaply show, and that a later round
 *  could undo without noticing. They are written as RELATIONS wherever a value would have done,
 *  because five assertions in this suite had to be rewritten this round for pinning literals.
 * ==========================================================================*/
{
const rd = read;

/* spelling kept: browser script (js/map-readout.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R210 ①: the graticule builder needs no turf, and nothing gates it on turf', () => {
  const src = rd('js/map-readout.js');
  const fn = /function buildGridFeatures\(\)\{[\s\S]*?\n  \}/.exec(src);
  assert.ok(fn, 'buildGridFeatures still exists');
  /* the defect: a gate on a library the function never uses. Both halves are asserted, because
     either one alone can come back — the gate without the usage, or the usage without the gate. */
  assert.doesNotMatch(fn[0], /hasTurf\(\)/, 'no turf gate — that gate WAS the reported display delay');
  assert.doesNotMatch(fn[0], /\bturf\./, 'and the body genuinely does not use turf, so the gate cannot be justified later');
  assert.match(src, /TROPIC_LAT=23\.4362/, 'the tropics use the mean obliquity of this epoch, not 23.5');
  assert.match(fn[0], /kind:'tropic'/, 'both tropics come out of the same builder as the rest of the grid');
});

test('R210 ②: the graticule style is white with a casing, and lives in one file', async () => {
  /* (tests-by-topic) THE SPECS ARE BUILT AND THEIR FILTERS RUN. gridLayerSpecs() is the module's
     export; the only thing it reads off window is the label scale, stubbed for the call and put back. */
  const { gridLayerSpecs } = await import('../js/grid-style.js');
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window'), prev = globalThis.window;
  globalThis.window = { IntMapLabelScale: { sub: (v) => v } };
  let specs;
  try { specs = gridLayerSpecs(); } finally { if (had) globalThis.window = prev; else delete globalThis.window; }
  const at = (id) => specs.findIndex((s) => s.id === id);
  assert.ok(at('grid-lines-casing') >= 0, 'the casing exists…');
  assert.ok(at('grid-lines-casing') < at('grid-lines'),
    '…and is declared BEFORE the white line, or it would be painted over it');
  assert.equal(specs[at('grid-lines')].paint['line-color'], '#ffffff', 'the graticule is white');
  assert.equal(specs[at('grid-tropic')].paint['line-color'], '#f4b740', 'the tropics are 山吹色');
  /* every kind the builder emits as its own layer must be excluded from the generic line layer,
     or it is painted twice — once as itself and once as a plain graticule line. Asked of the
     filters themselves: which line layers would draw a line of this kind? */
  const lines = specs.filter((s) => s.type === 'line');
  const drawnBy = (kind) => lines.filter((s) => featureFilter(s.filter, 'layers.' + s.id + '.filter').filter({ zoom: 3 }, { type: 2, properties: { kind } })).map((s) => s.id);
  for (const kind of ['equator', 'prime', 'tropic']) {
    assert.deepEqual(drawnBy(kind), ['grid-' + kind], `${kind} is excluded from grid-lines — drawn once, by its own layer`);
  }
  assert.deepEqual(drawnBy('major'), ['grid-lines-casing', 'grid-lines'], 'an ordinary line is drawn white over its casing');
  /* ⚠ the reason this is a module and not a member of IM_READOUT (#R200's boot-total-loss shape) */
  /* spelling kept: WHERE app-body takes the style from, and in what order it runs, is the claim — js/app-body.js only runs in a browser. */
  const body = rd('js/app-body.js');
  assert.match(body, /import \{ gridLayerSpecs \} from '\.\/grid-style\.js';/, 'app-body imports it by name');
  assert.ok(body.indexOf('...gridLayerSpecs()') < body.indexOf('const IM_READOUT='),
    'the style literal runs BEFORE IM_READOUT exists — that is why this is an import');
});
}

/* ═══════════════════════ #R225 · from r225-checks.test.mjs ═══════════════════════ */
/* (#R225 — the round's own account of why these checks exist heads its other half, in tests/shell-tiles-perf-checks.test.mjs) */
{
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ④ THE NINE GEOPOLITICS LAYERS ARE GONE — EVERYWHERE ──────────────────────────────────────────
   「大昔に捨てたはずの地政学レイヤーが勝手にオンになる。ふざけるな。」 → 「レイヤー自体を削除してほしい」.
   ⚠ A feature comes back when its removal is partial (#R220), so this counts every place it lived. */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R225 ④ the geopolitics layer family is deleted in every file that held a piece of it', () => {
  const KEYS = ['sahel', 'islandChain1', 'islandChain2', 'stringOfPearls', 'seaRoute', 'chokepoints', 'bri', 'pipelines', 'nuclear'];
  const html = read('index.html');
  for (const k of KEYS) assert.ok(!html.includes(`data-layer="${k}"`), `index.html still has the ${k} row`);
  assert.ok(!/data-i18n="lyrGrpGeo"|data-i18n="lyrGrpStrat"/.test(html), 'and neither group title');
  /* the data */
  const tables = read('js/tables.js');
  assert.ok(!/const geoLayersDB=\{/.test(tables), 'geoLayersDB is gone');
  assert.ok(!/const GEO_LABEL_JP=\{/.test(tables), 'and so are its Japanese labels');
  assert.ok(!/[{,]geoLayersDB[,}]/.test(tables), 'and it is not exported');
  /* the drawing and labelling */
  const pl = read('js/place-labels.js');
  for (const f of ['function buildGeoFC', 'function ensureGeoLayers', 'function updateGeoLayers', 'function localizeGeoLabels'])
    assert.ok(!pl.includes(f), `js/place-labels.js still declares ${f}`);
  assert.match(pl, /return \{ applyLabelLang, ensurePlaceLabels \};/, 'and the surface shrank with them');
  /* the callers */
  const ab = read('js/app-body.js');
  assert.ok(!/ensureGeoLayers\(\)|updateGeoLayers\(\)|localizeGeoLabels\(\)/.test(ab), 'app-body still calls one of them');
  assert.ok(!/\{geoLayersDB,GEO_LABEL_JP\}=window\.IntMapTables/.test(ab));
  assert.ok(!/document\.querySelectorAll\('\.geo-layer-cb'\)\.forEach/.test(ab), 'the change listener is gone');
  /* the preview and the favourite */
  assert.ok(!/function geoDBPrev/.test(read('js/layer-previews.js')));
  assert.ok(!/key:'geo:'\+k/.test(read('js/layer-favs.js')));
  /* ⚠⚠ AND THE READ SIDE OF THE URL HASH — this is what actually turned them on. A link saved months
     ago still carries `l=bri,pipelines,…`; resolving those keys by `data-layer` is how they came back
     on every load. Not writing them is not enough; the restore must stop resolving them. */
  const mu = read('js/map-ui.js');
  assert.ok(!/querySelector\('\.geo-layer-cb\[data-layer="'\+k\+'"\]'\)/.test(mu),
    'the hash restore must not resolve a retired key by data-layer');
  assert.match(mu, /want\.forEach\(k=>\{ const cb=document\.getElementById\(k\); if\(cb&&!cb\.checked\)\{/,
    'ids only');
  assert.ok(!/\.geo-layer-cb:checked/.test(mu.slice(mu.indexOf('function activeLayers'), mu.indexOf('function encode'))),
    'and it must not write them either');
});

/* ── ⑥ NOTHING NAMES A LAYER THAT NO LONGER EXISTS ────────────────────────────────────────────────
   The cheap sweep that would have caught #R220's half-removals: no shipped source may still mention
   one of the deleted layer keys as a live identifier. */
/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('R225 ⑥ no shipped source still resolves a deleted geopolitics key', () => {
  const KEYS = ['islandChain1', 'islandChain2', 'stringOfPearls'];   /* unambiguous names only */
  const files = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = read('js/' + f);
    for (const k of KEYS) {
      const at = src.indexOf(k);
      if (at < 0) continue;
      assert.fail(`js/${f} still names ${k} at offset ${at}`);
    }
  }
});
}

/* ═══════════════════════ #R289 · from r289-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R289 source checks — Chronos, the coastline, the merges, the compass
 * ----------------------------------------------------------------------------
 *  Ten instructions arrived in one message. The ones with a shape a source-level check can hold
 *  are here; the rest are measured by the browser smoke (tests/smoke.spec.js) or by the build
 *  (scripts/build-us-elections.mjs validates every one of its 2,342 state results as it writes them).
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs. Line endings belong to the CHECKOUT, not the file
 *  (#R283): `.gitattributes` pins only the extensions Linux executes, so js/ and *.html come back
 *  with a carriage return on this machine and without one in CI. A check that spelt a line break
 *  literally would be red on one platform and green on the other, for a reason that is not its
 *  subject — which is how #R274, #R279 and #R282 each spent a round re-diagnosing one defect.
 * ==========================================================================*/
{
const read = (p) => readLF(resolve(ROOT, p));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/* ── ③ THE COASTLINE IS THE BORDER LINE, DRAWN ROUND THE WATER ──────────────────────────────
   「海岸線も国境線が全く同じ手法で描かれるようにしてください。」 「全く同じ手法で」 is the assertion:
   the same source, the same colour, the same two width ladders, the same casing pair. */
test('R289 ③ the coastline uses the border line’s own source, colour and widths', () => {
  const s = read('js/coast-line.js');
  const body = read('js/app-body.js');
  /* (hist-border-same-look) the stroke is the border's own objects from js/border-style.js (colour, widths,
     casing); that they equal `borders-only-*` is evaluated in tests/history-era-display-checks.test.mjs */
  for (const need of [/source: 'ofm'/, /'source-layer': 'water'/, /paint: BORDER_PAINT\(\)/,
    /paint: BORDER_CASING_PAINT\(\)/, /id: 'coast-only-line'/, /id: 'coast-only-casing'/]) {
    assert.match(s, need, `the coastline must be drawn with ${need}`);
  }
  /* the casing goes UNDER the line, exactly as the border's does */
  assert.match(s, /BORDER_CASING_PAINT\(\) \}, 'coast-only-line'\);/, 'the casing is inserted below the line');
  /* a hotel pool is not a coast; a dock basin is */
  assert.match(s, /\['!', \['==', \['get', 'class'\], 'swimming_pool'\]\]/, 'swimming pools are excluded');
  /* the shell wires it in two lines and keeps no second copy of the layer */
  assert.match(body, /import \{ makeCoastLine \} from '\.\/coast-line\.js';/, 'app-body imports it by name');
  assert.match(body, /makeCoastLine\(\{ GE, canDraw, ensurePlaceLabels, BORDER_LAYOUT, BORDER_PAINT, BORDER_CASING_PAINT \}\);/);
  assert.ok(!/coast-only-line',type:'line'/.test(body), 'the shell must not build the layer as well');
  /* the row exists, ships ON (#R476), and is filed with the other base displays rather than as a
     data layer. ⚠ THIS ASSERTION USED TO READ «ships unchecked / NOT in the default-on list». That was
     #R289's own choice, not a property of the coastline, and 「Coastlines & shoresはデフォルトでオンに
     して」 reversed it — so the statement is reversed here rather than deleted, because what the check
     is for is that the two halves of the default agree, whichever way they point (tests/r476-checks ①). */
  /* ⚠ (#R719) AND IT HAS BEEN REVERSED AGAIN, FOR THE SAME REASON IT WAS REVERSED ONCE.
     「Coastlines & shoresはdefault base map & labelsから除外」. The row, its handler, its legend,
     its place in 基本表示 and the wind's one-shot offer are all untouched — only the DEFAULT moved,
     and the invariant being guarded is still that the two halves of that default agree. */
  /* (layer-manifest) the row, its tick and the two lists are js/layer-manifest.js — the markup is generated from it */
  const coast = LM.LAYERS.find((l) => l.id === 'cb-coast');
  assert.match(LM.rowHTML(coast), /<input type="checkbox" id="cb-coast">/, 'the row ships unchecked');
  const dl = (read('js/data-layers.js') + '\n' + read('js/layer-pkg-alliances.js'));
  const basic = publishedList('IntMapBasicLayerRows');
  assert.deepEqual(basic.slice(basic.indexOf('cb-borders'), basic.indexOf('cb-borders') + 3), ['cb-borders', 'cb-coast', 'cb-admin1'],
    'it sits with the base displays in the panel order');
  assert.ok(!publishedList('IntMapDefaultOn').includes('cb-coast'), 'and it is NOT in the default-on list');
  /* ⚠ 「風レイヤーオン時はデフォルトでオン」 IS A DEFAULT, NOT A COUPLING. The latch is what makes it
     one: a reader who switches the coast off while the wind is up must not be overruled (#R85). */
  assert.match(dl, /window\._imCoastAuto&&window\._imCoastAuto\(\);/, 'switching the wind on offers the coastline');
  assert.match(s, /if \(!c \|\| c\.__windAuto\) return false;/, 'and it only ever does so once');
});

/* ── ④ THE TWO MERGES ────────────────────────────────────────────────────────────────────────
   「1人当たりCO₂排出レイヤーとCO₂排出量（百万t）レイヤーは一つに統合し…他のものも」. Two rows became
   one row with a switch, twice. The QUANTITY must still be reachable — a merge is not a deletion. */
/* spelling kept: browser script (js/wb-layers.js, js/layer-previews.js, js/data-layers.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R289 ④ CO₂ and defence spending are one row each, with both views still reachable', () => {
  const wb = read('js/wb-layers.js');
  assert.ok(!/\{id:'wbco2t'/.test(wb), 'the separate total-CO₂ row is gone');
  assert.match(wb, /\{id:'wbco2', modes:\[/, 'and the survivor is modal');
  /* (country-analysis-unify) EVALUATED: the series are the catalogue's (js/wb-indicators.js), joined to the rows by the shipped
     `_wbInd` — tests/helpers/wb-rows.mjs runs both */
  const painted = wbRowSeries().flatMap((r) => [].concat(r.code));
  for (const code of ['EN.GHG.CO2.MT.CE.AR5', 'EN.GHG.CO2.PC.CE.AR5']) {
    assert.equal(painted.filter((c) => c === code).length, 1, `${code} must be declared exactly once`);
  }
  /* the FIRST mode is the default, and it is the total — the name the row always had */
  const co2 = wbRows().find((r) => r.id === 'wbco2');
  assert.deepEqual(co2.modes.map((m) => m.code), ['EN.GHG.CO2.MT.CE.AR5', 'EN.GHG.CO2.PC.CE.AR5'],
    'the total is the first mode, and the first mode is the default');
  /* ⚠ THE RAMP IS RE-ASSERTED ON EVERY REPAINT. The addLayer branch runs once; a mode change after
     it would otherwise paint megatonnes through the per-capita ramp. */
  assert.match(wb, /GE\(\)\.layers\.setPaint\(fill,'fill-color',\['case',\['has','v'\],\['interpolate',\['linear'\],\['get','v'\]\]\.concat\(L\.ramp\),'#9aa0a6'\]\)/,
    'the fill colour must be re-asserted, not only set at creation');
  /* ⚠ THE ROW'S NAME IS THE MODE'S NAME, and a shallow copy that drops `modes` makes it EMPTY —
     measured in the browser before this line existed: the CO₂ row rendered with a blank label and
     every other thing about it was correct. */
  assert.match(wb, /const ALL=WB\.map\(L=>\(\{id:L\.id,n:L\.n,modes:L\.modes,/,
    'the row list must carry `modes`, or a modal row has no name at all');
  /* the thumbnail's pre-load copy and the layer cannot disagree about which series is on */
  assert.match(wb, /codeOf:\(id\)=>\{ const L=WB\.find\(x=>x\.id===id\)(?:\|\|wbById\[id\])?; return L\?V\(L\)\.code:null; \}/,
    'the active indicator is published for the thumbnail to read');   /* (map-layer-system) `||wbById[id]`: a series the indicator browser paints is looked up too */
  assert.match(read('js/layer-previews.js'), /function wbCode\(id,spec\)\{/, 'and the thumbnail reads it');
  /* defence spending: one row, two fills, and the switch lives in BOTH legends because the reader
     is looking at the one for the mode that is on */
  const dl = (read('js/data-layers.js') + '\n' + read('js/layer-pkg-alliances.js'));
  assert.ok(!/\['milSpendGDP','lyrMilSpendGDP'\]/.test(dl), 'the second defence row is gone from the panel');
  assert.match(dl, /\['milSpend','lyrMilSpend'\],\['nato','lyrNATO'\]/, 'one defence row remains');
  assert.match(dl, /function applyMilMode\(\)\{/, 'and a mode decides which of the two is showing');
  /* (layer-packages) the defence row's package reads the two legends — rebuilt on a language change — through the kit's `live` getters */
  assert.match(dl, /milModeRow\(live\.lgdMil\); milModeRow\(live\.lgdMilGDP\);/, 'the switch is in both legends');
  assert.match(dl, /addChoro\('milSpendGDP'\); applyChoro\('milSpendGDP',s=>\(s\.milSpend!=null&&s\.gdp\)\?s\.milSpend\/s\.gdp\*100:null\)/,
    'the % of GDP picture is the one that was already there');
  /* a saved session that had either retired row on lands on the row that stayed */
  const st = read('js/session-tabs.js');
  assert.match(st, /'bx-wbco2t':'bx-wbco2', 'dl-milSpendGDP':'dl-milSpend'/,
    'both retired ids must be translated on the way in, not silently dropped');
});

/* ── ⑤ NATO / EU: A SECOND COLOURING, AND A LEGEND THAT DOES NOT CONTRADICT IT ───────────────
   「加盟年ごとに色分けされたバージョンも用意して」. #R270's defect was a legend whose gradient
   disagreed with the map; a flat blue bar over a year-coloured map is the same statement. */
/* spelling kept: browser script (js/data-layers.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R289 ⑤ NATO and the EU can be coloured by accession year, and the bar goes away with it', () => {
  const dl = (read('js/data-layers.js') + '\n' + read('js/layer-pkg-alliances.js'));
  assert.match(dl, /function yearColors\(years\)\{/, 'one palette builder');
  assert.match(dl, /function yearFillExpr\(years,colors,fallback\)\{/, 'one fill-expression builder');
  assert.match(dl, /function styleModeRow\(el,cls,get,set\)\{/, 'one switch builder — not two');
  for (const who of ['nato', 'eu']) {
    assert.match(dl, new RegExp(`function ${who}FillColor\\(\\)\\{ return \\(_${who}Style==='byYear'\\)`),
      `${who} must decide its fill from the mode`);
    assert.match(dl, new RegExp(`GE\\(\\)\\.layers\\.setPaint\\('${who}-fill','fill-color',${who}FillColor\\(\\)\\)`),
      `${who} must re-assert the colouring on every repaint, not only at creation`);
    assert.match(dl, new RegExp(`styleModeRow\\(el2,'${who}-style-row'`), `${who}'s legend carries the switch`);
  }
  /* the accession year travels WITH the feature — otherwise the expression has nothing to match on */
  assert.match(dl, /properties:\{__code:code,__y:\(jy\|\|0\)\}/, 'NATO features carry their accession year');
  assert.match(dl, /properties:\{__code:code,__y:\(EU_JOIN\[code\]\|\|0\)\}/, 'and so do the EU’s');
  /* ⚠ THE GRADIENT BAR DESCRIBES THE UNIFORM COLOURING ONLY */
  assert.match(dl, /\['\.dl-bar','\.dl-scale'\]\.forEach\(sel=>\{ const e2=el\.querySelector\(sel\); if\(e2\) e2\.style\.display=byYear\?'none':''; \}\);/,
    'the flat bar must be hidden while the map is coloured by year');
  /* ⚠ AND THE «BUILT ONCE» GUARD IS A BRANCH, NOT A RETURN — a control whose selected state changes
     while the legend stays up cannot be built behind an early return. */
  for (const who of ['nato', 'eu']) {
    assert.ok(!new RegExp(`querySelector\\('\\.${who}-year-row'\\)\\)[^\\n]*return;`).test(dl),
      `${who}Legend must not return before the colouring switch is (re)drawn`);
  }
  /* the EU key is built from the years countries actually acceded in — 2020 and 2024 are slider
     stops (Brexit, and «today»), and spending two of eight ramp steps on empty waves is a lie */
  assert.match(dl, /const EU_JOIN_YEARS=\[\.\.\.new Set\(Object\.values\(EU_JOIN\)\)\]\.sort\(\(a,b\)=>a-b\);/);
  assert.match(dl, /yearKeyHTML\(EU_JOIN_YEARS,yearColors\(EU_JOIN_YEARS\),EU_JOIN,_euYear,EU_LEFT\)/,
    'a member who has LEFT by the selected year must not be counted in its wave');
});

/* ── ⑥ THE U.S. ELECTIONS: A STATE'S OWN RESULT ─────────────────────────────────────────────
   「クリックした州内での票のグラフを表示して。選挙人の数も記載。」 */
test('R289 ⑥ every election carries per-state results, and they agree with the map’s own colours', () => {
  const d = json('data/us-elections.json');
  assert.equal(d.elections.length, 60, 'all sixty elections');
  let rows = 0, withVotes = 0, withEv = 0;
  for (const e of d.elections) {
    assert.ok(e.sv && Object.keys(e.sv).length, `${e.y} has no per-state result at all`);
    for (const [st, o] of Object.entries(e.sv)) {
      rows++;
      if (o.v) { withVotes++; assert.equal(o.v.length, e.c.length, `${e.y} ${st}: one vote entry per candidate`); }
      if (o.e) { withEv++; assert.equal(o.e.length, e.c.length, `${e.y} ${st}: one elector entry per candidate`); }
      assert.ok(o.v || o.e, `${e.y} ${st}: an empty result is not a result`);
      if (o.t) assert.ok(o.t > 0, `${e.y} ${st}: a total of ${o.t}`);
      /* ⚠ THE CHART MUST NOT CONTRADICT THE FILL. The state matrix `s` decides the colour; the
         candidate with the most electors decides the chart. A TIE is a state that split its
         electors (1892 North Dakota gave one each to three men) and is not a contradiction. */
      if (o.e && e.s[st] != null) {
        const max = Math.max.apply(null, o.e);
        const tied = o.e.filter((x) => x === max).length > 1;
        if (max > 0 && !tied) {
          assert.equal(o.e.indexOf(max), e.s[st],
            `${e.y} ${st}: the chart gives the electors to ${e.c[o.e.indexOf(max)].n} and the map colours it for ${e.c[e.s[st]].n}`);
        }
      }
    }
  }
  assert.ok(rows > 2_000, `only ${rows} state results — the record has more than that`);
  assert.ok(withVotes > 1_800, `only ${withVotes} states carry a popular vote`);
  assert.ok(withEv > 1_800, `only ${withEv} states carry an elector count`);
  /* the two years past the compilation are complete, and their electors sum to 538 */
  for (const y of [2020, 2024]) {
    const e = d.elections.find((x) => x.y === y);
    assert.equal(Object.keys(e.sv).length, 51, `${y}: fifty states and the District of Columbia`);
    const tot = Object.values(e.sv).reduce((a, o) => a + o.e.reduce((x, z) => x + z, 0), 0);
    assert.equal(tot, 538, `${y}: the electors must sum to 538, not ${tot}`);
    e.c.forEach((c, i) => {
      const got = Object.values(e.sv).reduce((a, o) => a + (o.e[i] || 0), 0);
      assert.equal(got, c.ev, `${y}: the per-state electors give ${c.n} ${got}, the record says ${c.ev}`);
    });
  }
  /* the two OVERRIDE cells the per-state returns corrected */
  const e1832 = d.elections.find((x) => x.y === 1832);
  assert.equal(e1832.c[e1832.s.VT].n, 'William Wirt', 'Vermont 1832 went to Wirt, the only state he carried');
  const e1892 = d.elections.find((x) => x.y === 1892);
  assert.equal(e1892.c[e1892.s.WY].n, 'Benjamin Harrison', 'Wyoming 1892 went to Harrison');
  /* the panel: the state chart exists and the year stepper is big enough to hit */
  const ue = read('js/us-elections.js');
  assert.match(ue, /function stateHtml\(e,st,name\)\{/, 'a click must be able to draw the state’s own result');
  assert.match(ue, /Electoral votes','選挙人票'/, 'and it names the elector count');
  assert.match(ue, /'\.usel-step\{flex:0 0 auto;width:38px;height:38px/, 'the ‹ › box is 38 px, not 30');
  assert.match(ue, /font-size:22px/, 'and the chevron itself is 22 px, not 13');
  assert.match(ue, /'@media'\+window\.IntMapDevice\.COMPACT\+'\{\.usel-step\{width:44px;height:44px/, 'a finger gets 44 px');   /* (ui-layer-owner) the boundary is the owner's */
});

/* ── ⑪ THE THREE DELETED LAYERS ARE GONE FROM EVERY SURFACE ─────────────────────────────────
   「以下の３レイヤーは削除して。紫外線エアロゾル指数／一酸化炭素 (CO)／雲・赤外（実時間）」
   ⚠ Named by the CODE SHAPE, so this round's own notes — which quote the ids to explain why they
   went — cannot make the check pass or fail by accident. */
test('R289 ⑪ the UV aerosol index, CO and the IR clouds layer left every surface', () => {
  for (const [f, shapes] of [
    ['js/layer-packs.js', ["{id:'gxaero'", "{id:'gxco'", 'gxaero:{lo:', 'gxco:{loK:']],
    ['js/layer-previews.js', ["'gx-gxaero':G(", "'gx-gxco':G("]],
    ['js/atlas-console.js', ["'co':'gx-gxco'"]],
    ['scripts/probe-gibs-range.mjs', ["id: 'gxaero'", "id: 'gxco'"]],
    ['js/data-layers.js', ['const IR_SATS=[', 'function cloudsLegendHint(', 'function setCloudsVis(',
      "['clouds','lyrClouds']", "clouds:0.75", "id==='clouds'"]],
  ]) {
    const s = read(f);
    for (const sh of shapes) assert.ok(!s.includes(sh), `${f} still carries ${sh}`);
  }
  /* the measured extents went with them, and the five that were NOT named are still there */
  const r = json('data/gibs-range.json');
  assert.ok(!r.layers.gxaero && !r.layers.gxco, 'data/gibs-range.json still measures a deleted layer');
  for (const id of ['gxndvi', 'gxseaice', 'gxsstanom', 'gxsoil']) {
    assert.ok(r.layers[id], `${id} was deleted and nobody asked for that`);
  }
  /* the dead i18n key went too — a key no surface asks for is a key that will be translated for ever */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok(!/"?lyrClouds"?:/.test(read(`js/locales/ui.${c}.js`)), `ui.${c}.js still declares lyrClouds`);
  }
  /* ⚠ AND THE ECMWF CLOUD LAYER IS A DIFFERENT LAYER AND STAYS */
  assert.ok(LM.layerFor('ec-cloud'), 'the ECMWF cloud-cover layer was not named and must remain');   /* (layer-manifest) filed in js/layer-manifest.js */
});
}

/* ═══════════════════════ #R170 · from r170-checks.test.mjs ═══════════════════════ */
/* (#R170 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (f) => (String(f).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + f, import.meta.url), 'utf8'));

/* ---------------------------------------------------------------- Companies as-of stamps */

/* spelling kept: browser script (js/companies.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 the Companies dataset declares its vintage', () => {
  const c = R('js/companies.js');
  assert.match(c, /const CURATED_ASOF='\d{4}-\d{2}-\d{2}';/, 'the curated table needs a compile date');
  assert.match(c, /const CURATED_FY='FY\d{4}';/, 'and a fiscal-year basis for the annual figures');
  assert.match(c, /CURATED_ASOF, CURATED_FY,/, 'both must be exported for the UI to stamp with');
  assert.match(c, /priceAsOf:c=>/, 'live prices must expose their timestamp');
  assert.match(c, /priceAsOfExact:c=>/, 'and whether it is the quote time or merely the fetch time');
});

/* spelling kept: browser script (js/companies.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 every live price carries the timestamp it came with', () => {
  const c = R('js/companies.js');
  assert.match(c, /function _applyPrice\(c,p,tMs\)/, '_applyPrice must accept the quote time');
  assert.match(c, /c\.priceT=\(tMs>0\?tMs:Date\.now\(\)\); c\.priceTexact=\(tMs>0\)/, 'and record whether it is exact');
  assert.match(c, /\+v\.ts\[v\.ts\.length-1\]\*1000/, 'the batched spark path must use the last close timestamp');
  assert.match(c, /\(\+m\.regularMarketTime\|\|0\)\*1000/, 'the per-symbol path must use the quote time Yahoo returns');
});

/* spelling kept: browser script (js/companies-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 every Companies metric has an as-of branch, and the chips are rendered everywhere', () => {
  const ui = R('js/companies-ui.js');
  const fn = ui.slice(ui.indexOf('function _coAsOf(c,key)'), ui.indexOf('function _coAsOfTitle'));
  for (const key of ['rev', 'ni', 'emp', 'fnd', 'price', 'mcap', 'pe']) {
    assert.ok(fn.includes(`'${key}'`), `_coAsOf must handle the ${key} metric`);
  }
  // list rows, detail overlay, compare bars, compare table and the CSV export
  assert.equal((ui.match(/_coAsOfChip\(/g) || []).length >= 5, true, 'the chip must appear in every place a figure is printed');
  assert.match(ui, /concat\(met\.map\(k=>_coAsOf\(c,k\)\)\)/, 'the CSV export must carry the dates too');
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* ── the decisions that were made from measurements ──────────────────────────────────────────── */

/* ⚠ (remove-synthetic-planes) 「R186 aircraft: the sweep is paced to what the feed actually tolerates」
   pinned the airplanes.live sweep's measured pace (1.2 s), radius (250 nm), zoom floor and count cap.
   The sweep is removed with its provider (403 to every request since #R341) — nothing in the page
   paces requests to that host any more because nothing in the page makes them. The pace the feed
   tolerates is now the server's to keep (supabase/functions/aviation-feed, checked in
   tests/backend-aviation-checks ⑮). The removal is measured in tests/remove-synthetic-planes-checks.test.mjs. */

/* spelling kept: browser script (js/data-layers.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 sea level: nothing between the ramp and the opacity slider', () => {
  const src = (read('js/data-layers.js') + '\n' + read('js/layer-pkg-alliances.js'));
  const m = /const cand=\[(.*?)\];/s.exec(src);
  assert.ok(m, 'the sea-level ramp candidates must still be one literal');
  /* Every FLOODED stop has to be fully opaque, or the slider can never reach 100 % — which is
     exactly what was reported. Only the two land-side stops may be transparent. */
  const stops = [...m[1].matchAll(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g)].map(x => +x[4]);
  const opaque = stops.filter(a => a === 1).length;
  const clear = stops.filter(a => a === 0).length;
  assert.equal(opaque + clear, stops.length, 'a sea-level ramp stop must be fully opaque or fully clear');
  assert.ok(opaque >= 4 && clear >= 2, `ramp alphas: ${stops.join(',')}`);
});
}

/* ═══════════════════════ #R221 · from r221-checks.test.mjs ═══════════════════════ */
/* (#R221 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));

/* ── ⑧ THE OCEAN-CURRENT DATA ────────────────────────────────────────────────────────────── */
test('#R221 ⑧ the shipped current atlas is the rebuilt one, and says how it was made', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  assert.equal(doc.v, 2, 'v2 is the rebuilt file');
  assert.ok(doc.named.length >= 55, `only ${doc.named.length} named currents`);
  /* ⚠ (#R222) STRICTLY STRONGER THAN THE 20,000 ARROWS THIS REPLACED. The field is the source's own
     0.25° grid in a binary file now, so the number to check is how many cells of it carry flow —
     466,007 at the time of writing, sixteen times what the 1° arrow list held. */
  assert.ok(doc.field && doc.field.cells >= 100000, `only ${doc.field && doc.field.cells} field cells`);
  assert.equal(doc.gridDeg, 0.25, 'the source grid must be kept, not rounded to 1°');
  assert.ok(doc.epochs >= 20, 'a climatology needs many fields, not one season');
  /* the paths must be currents, not stubs: the old file had six-point 300 km fragments */
  const short = doc.named.filter((c) => (c.lengthKm || 0) < 500);
  assert.ok(short.length <= doc.named.length * 0.15,
    'too many stub paths: ' + short.map((c) => c.en + ' ' + c.lengthKm + 'km').join(', '));
  /* ⚠ A SHORT CLOSED PATH IS AN EDDY, A LONG ONE IS A GYRE. #R208's Kuroshio was a ring the tracer
     walked round, and the first rebuild shipped ten more of them (Brazil 741 km, Canary 914 km).
     The build now rejects a closed trace under 1,500 km and re-seeds; a closed trace LONGER than
     that is a real circulation (the Alaska Gyre, the Weddell Gyre) and must survive. */
  for (const c of doc.named) {
    const a = c.path[0], b = c.path[c.path.length - 1];
    const gap = Math.hypot((b[1] - a[1]) * 110.6, (b[0] - a[0]) * 111.3 * Math.cos(a[1] * Math.PI / 180));
    if (gap < 150) assert.ok((c.lengthKm || 0) >= 1500,
      `${c.en} closes after only ${c.lengthKm} km — that is an eddy, not a current`);
  }
});

test('#R221 ⑧ warm/cold is measured against the sea at the same latitude', () => {
  const doc = JSON.parse(read('data/ocean-currents.json'));
  const by = Object.fromEntries(doc.named.map((c) => [c.en, c]));
  assert.ok(doc.sstEpochs > 0, 'the classification must have had a temperature field to measure');
  /* the four the flow-derived version got wrong, and the two it got right — all textbook */
  for (const n of ['Canary Current', 'California Current', 'Peru (Humboldt) Current', 'Benguela Current']) {
    assert.ok(by[n], n + ' missing');
    assert.equal(by[n].kind, 'cold', `${n} is a cold current (ΔT = ${by[n].sstAnomK} K)`);
    assert.equal(by[n].kindFrom, 'sst', n + ' must be classified from temperature, not from the flow');
  }
  for (const n of ['Gulf Stream', 'Kuroshio', 'Agulhas Current']) {
    assert.equal(by[n].kind, 'warm', `${n} is a warm current (ΔT = ${by[n].sstAnomK} K)`);
  }
});

/* spelling kept: browser script (js/ocean-currents.js, js/reference-data.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑧ the layer names its real sources, and the registry agrees', () => {
  const oc = read('js/ocean-currents.js');
  assert.ok(!/NASA\/JPL OSCAR's measured/.test(oc), 'the header must not still claim OSCAR');
  assert.ok(/Ralph & Niiler/.test(oc), 'the Ekman term must be attributed where the reader can see it');
  assert.ok(/OISST/.test(oc), 'the temperature source must be attributed');
  const rd = read('js/reference-data.js');
  assert.ok(/NOAA sea-surface currents, wind stress and temperature/.test(rd),
    'the source registry must carry the new entry');
  assert.ok(!/jplOscar\.html/.test(rd), 'the registry must not still point at the retired dataset');
});
}
