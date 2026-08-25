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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const at = (p) => resolve(HERE, '..', p);
const read = (p) => readLF(at(p));

const FACTS_PATH = 'data/country-facts.json';
const FACTS = JSON.parse(read(FACTS_PATH));

/* ══ ① 撤去された上流は、どのファイルからも呼ばれない ═══════════════════════════════════════
   ⚠ 注記を剥がしてから探す（#R345 の形——自分が書いた説明文を読んで緑になる検査を作らない）。
   このファイルの上の箱にも `restcountries.com` と書いてあるし、js/countries-ui.js の
   ⚠ 箱にも書いてある。**綴りではなく、コードに在るかどうか**が問われている。 */
test('① 撤去された restcountries.com を、実行されるコードのどこも名指さない', () => {
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
   CLAUDE.md §3.4——データソースを変えたら出典表記も同時に変える。もう呼ばない API を
   出典として掲げ続けるのは、呼んでいる上流を隠すのと同じくらい誤りである。 */
test('② js/reference-data.js は、いま実際に読んでいる2つの上流を掲げている', () => {
  const src = read('js/reference-data.js');
  assert.ok(!/\{n:'REST Countries'/.test(src), '呼んでいない REST Countries が出典に残っている');
  assert.match(src, /mledoze\/countries/, 'mledoze/countries（ODbL）の出典が無い');
  assert.match(src, /ODbL 1\.0/, 'ODbL はライセンス義務——「任意の礼儀」ではない');
  assert.match(src, /iana\.org\/time-zones/, 'IANA time-zone database の出典が無い');
});

/* ══ ③ 同梱ファイルそのもの ═══════════════════════════════════════════════════════════════ */
test('③ data/country-facts.json は、読める形で、主張どおりの中身を持つ', () => {
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
test('④ tz を持たない行は、ファイル自身が名指している（黙って欠けていない）', () => {
  const C = FACTS.countries;
  const measured = Object.keys(C).filter((k) => !C[k].tz).sort();
  assert.deepEqual(FACTS.withoutTimezone || [], measured,
    'withoutTimezone が実体と一致しない — 宣言: ' + JSON.stringify(FACTS.withoutTimezone) +
    ' / 実測: ' + JSON.stringify(measured));
  for (const k of measured) assert.ok(C[k], k + ' は行そのものが無い（宣言できるのは「行は在るが tz が無い」だけ）');
});

/* ══ ⑤ 出荷されるファイルは、素のスクリプトとして実行できる（#R443 が 16件で払った代金） ══ */
test('⑤ js/countries-ui.js は classic script として parse できる（export を足さない）', () => {
  assert.doesNotThrow(() => new Function(read('js/countries-ui.js')),
    'この repo の複数のハーネスが new Function(src) でこのファイルを実行する');
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
function runCard({ facts }) {
  const els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, stubEl(id)); return els.get(id); };
  const fetches = [];
  const win = {
    innerWidth: 1280, innerHeight: 800,
    IntMapModules: {},
    /* ⚠ `pick()` の戻り値は関数であり、`.arr(table)` を持つ（js/lang-registry.js §264）。
       ここを素の矢印関数にすると `_regionName` が `_LR.arr is not a function` で落ちる——
       つまりこのスタブは registry の実際の形に合わせてある。 */
    IntMapLang: {
      pick: () => { const fn = (...a) => a[0]; fn.arr = (a) => (Array.isArray(a) ? fn.apply(null, a) : String(a == null ? '' : a)); return fn; },
      pickArgs: () => ((...a) => a),
      t: (lang, ...a) => a[0],
      isLoaded: () => true,
      htmlTag: () => 'en',
    },
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
  const run = (src) => new Function(
    'window', 'document', 'turf', 'fetch', 'navigator', 'requestIdleCallback', 'console', 'localStorage', src,
  )(win, doc, env.turf, env.fetch, env.navigator, env.requestIdleCallback, env.console, env.localStorage);

  run(read('js/tables.js'));
  run(read('js/country-extent.js'));
  run(read('js/countries-ui.js'));
  const mod = win.IntMapModules.countriesUi(HOST);
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
test('⑥ 同梱データで、カードに Neighbours / Timezones / UN member の3行が出る', async () => {
  const { HOST, mod, body } = runCard({ facts: FACTS });
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
  const dead = runCard({ facts: null });
  dead.HOST.countryStats.USA = usaStat();
  dead.mod.showCountryDetail('USA', 'United States of America');
  await settle(() => dead.win.IntMapCountryFacts.state === 'failed');
  const deadLabels = [...dead.body.innerHTML.matchAll(/<div class="cm-row"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  const gained = rows.map((r) => r[0]).filter((k) => !deadLabels.includes(k));
  assert.deepEqual(gained.sort(), ['Neighbours', 'Timezones', 'UN member'],
    '供給者が戻って増えた行が、報告された3行と一致しない: ' + JSON.stringify(gained));
});

/* ══ ⑦ 手書き表の穴が、同じ経路で埋まる ═══════════════════════════════════════════════════ */
test('⑦ js/tables.js に無い国の Capital / Currency / Languages が「—」でなくなる', async () => {
  const { HOST, mod, body } = runCard({ facts: FACTS });
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
test('⑧ 取得が失敗したら、状態に残り、次のカードで retry される', async () => {
  const els = { n: 0 };
  /* まず失敗させる */
  const failing = runCard({ facts: null });
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
test('⑨ 読む側の綴りと、置いてある場所と、作り直す手順が一致している', () => {
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
