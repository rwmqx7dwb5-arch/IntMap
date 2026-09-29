/* ============================================================================
 *  IntMap · which articles are the same event — the one shared grouper
 * ----------------------------------------------------------------------------
 *  supabase/functions/_shared/news-cluster.js（#R334）と、Atlas の research.events がそれを呼ぶ
 *  アダプタ js/news-cluster.js（#R340）。実データの fixture で測る。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import path, { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { CATEGORIES, DEFAULTS, tokenise, normaliseTitle, normaliseUrl, pairVerdict, clusterArticles, countIndependentSources, geoClass, lngOf, latOf, kindOf } from '../supabase/functions/_shared/news-cluster.js';
import { makeNewsCluster } from '../js/news-cluster.js';

/* ════════ #R334 — from tests/r334-checks.test.mjs ════════ */
{
/* ============================================================================
 *  R334 — 同じ出来事を言っている記事を、実データで確かめながら結ぶ
 * ----------------------------------------------------------------------------
 *  #R76 が入れたクラスタリングは撤去されていない。js/atlas-console.js に今も生きていて、
 *  Capability Registry に `research.events` として登録されている。**そしてテストが 1 件も無い。**
 *  本番の実データ（current_news 1,651 行・2026-08-23）に #R76 の実定数を当てると:
 *
 *    en 150 記事（実際の読み込み件数相当） → 最大 17 件の塊。join の 63% が緩和規則 0.06 経由。
 *    600 記事                              → 最大 43 件の塊。その中身は
 *                                            「イラン経済戦争」「目薬 40,000 本の回収」
 *                                            「FDA の冷凍ブルーベリー警告」「米国人の老後不安」。
 *
 *  原因は 1 行にある。IntMapNewsGeo が国レベルに解決した subject は座標が完全に一致するので、
 *  `d < 30km && dh <= 24h` が常に真になり、見出しの閾値が 0.06 まで落ちていた。
 *  ⇒ **距離ゼロは「同じ場所」の証拠ではない。国の代表点であるという証拠でしかない。**
 *
 *  この検査は、その形が戻ってこないことを実データで押さえる。fixture は本番の見出しと
 *  メタデータだけ（本文は保存していない）で、正解ラベルが付けてある。
 *
 *  ⚠ ラベル付き fixture の「精度 100%」は精度の測定ではない——負例が 5 件しか無いので、
 *    閾値を半分にしても 100% のままだった。だから閾値は **実データ 857 件の n>=5 クラスタを
 *    全部読んで** 決めてある（docs/NEWS-EVENTS.md §5・supabase/functions/_shared/news-cluster.js）。
 *    ここで押さえるのは「その決定が動かないこと」である。
 * ========================================================================== */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const FIXTURE = JSON.parse(rd('tests/fixtures/r334-news-events.json'));
const ARTICLES = FIXTURE.articles.map((a) => ({ ...a, source_family: a.publisher }));
const of = (ev) => ARTICLES.filter((a) => a.event === ev).map((a) => ({ ...a }));

/* ── ① カテゴリの一覧は 1 つである ────────────────────────────────────────
 * コードの CATEGORIES と migration の check 制約が食い違えば、片方でしか通らない値が
 * 静かに生まれる。#R318 の「2 つの一覧が一致しない」形をここで作らない。 */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R334 ① the category list in code and in the migration are the same list', () => {
  const sql = rd('supabase/migrations/20260823120000_news_events.sql');
  /* migration には category の check が 2 か所ある（feeds と events）。両方を読む。 */
  const blocks = [...sql.matchAll(/check\s*\(\s*(?:category|primary_category)\s+in\s*\(([^)]*)\)/g)];
  assert.equal(blocks.length, 2, 'expected exactly two category CHECK constraints in the migration');
  for (const b of blocks) {
    const listed = [...b[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...listed].sort(), [...CATEGORIES].sort(),
      'the migration CHECK and CATEGORIES disagree: ' + listed.join(',') + ' vs ' + CATEGORIES.join(','));
  }
  assert.equal(CATEGORIES.length, 8);
  assert.equal(new Set(CATEGORIES).size, 8, 'CATEGORIES has a duplicate');
});

/* ── ② 国の代表点で閾値を「下げない」 ────────────────────────────────────
 * #R76 が壊れたのは、まさにここを下げたからである。上げるか、少なくとも下げないこと。 */
test('#R334 ② a country centroid never LOWERS the bar — that is what broke #R76', () => {
  for (const k of ['countrySame', 'countryNear']) {
    assert.ok(DEFAULTS.thr[k] >= DEFAULTS.thr.near,
      `thr.${k} (${DEFAULTS.thr[k]}) must not be below thr.near (${DEFAULTS.thr.near})`);
    assert.ok(DEFAULTS.thr[k] > DEFAULTS.thr.tight,
      `thr.${k} must be above thr.tight — a country centroid is not a tight geographic match`);
    assert.ok(DEFAULTS.containment[k] >= DEFAULTS.containment.near);
    assert.ok(DEFAULTS.minOverlap[k] >= DEFAULTS.minOverlap.near);
  }
  /* 同じ国の 2 記事は 0km 離れているが 'tight' ではない。 */
  const a = { lng: -98, lat: 39.5, place_kind: 'country' };
  const b = { lng: -98, lat: 39.5, place_kind: 'country' };
  assert.equal(geoClass(a, b).cls, 'countrySame');
  /* 精密な地点どうしなら 'tight' でよい。 */
  assert.equal(geoClass({ lng: 139.69, lat: 35.69, place_kind: 'place' },
                        { lng: 139.70, lat: 35.68, place_kind: 'place' }).cls, 'tight');
});

/* ── ③ #R76 が 1 つにまとめた記事は、1 つにならない ──────────────────────
 * fixture の 'separate-*' は、実測で 43 件の塊に同居していた実物の見出しである。 */
test('#R334 ③ the headlines #R76 fused into one event stay apart', () => {
  const junk = ARTICLES.filter((a) => a.event.startsWith('separate-')).map((a) => ({ ...a }));
  assert.ok(junk.length >= 5, 'the fixture must keep the real counter-examples');
  for (let i = 0; i < junk.length; i++) {
    for (let k = i + 1; k < junk.length; k++) {
      const v = pairVerdict(junk[i], junk[k]);
      assert.equal(v.same, false,
        'these are different events and must not merge:\n  ' + junk[i].title +
        '\n  ' + junk[k].title + '\n  ' + v.reasons.join(' · '));
    }
  }
  const groups = clusterArticles(junk);
  assert.equal(groups.length, junk.length, 'every counter-example must be its own event');
});

/* ── ④ 同じ会社の別の発表は別の出来事 ─────────────────────────────────── */
test('#R334 ④ the same company announcing two different things is two events', () => {
  const earnings = of('walmart-q2-earnings');
  const applePay = of('walmart-tap-to-pay');
  const groups = clusterArticles(earnings.concat(applePay));
  const all = earnings.concat(applePay);
  for (const g of groups) {
    const evs = new Set(g.map((i) => all[i].event));
    assert.equal(evs.size, 1,
      'Walmart earnings and Walmart tap-to-pay were merged: ' + g.map((i) => all[i].title).join(' | '));
  }
  /* tap-to-pay の 5 本は 1 件にまとまる（同じ発表の 5 媒体）。 */
  const only = clusterArticles(of('walmart-tap-to-pay'));
  assert.equal(only.length, 1, 'the five tap-to-pay reports are one event');
});

/* ── ⑤ 同じ事件の言い換えはまとまる ────────────────────────────────────── */
test('#R334 ⑤ nine reports of one attack become one event', () => {
  const g = clusterArticles(of('sweden-school-sword'));
  assert.equal(g.length, 1, 'the Swedish school attack fragmented into ' + g.length + ' events');
  assert.equal(g[0].length, 9);
});

/* ── ⑥ 地点の解像度が違っても、同じ出来事はまとまる ──────────────────────
 * TikTok の $400M 和解は、IntMapNewsGeo が一部を ByteDance 本社に、一部を「米国」の代表点に
 * 解決した。距離は約 10,000km ある。#R76 の 150km ゲートはここで必ず落ちていた。 */
test('#R334 ⑥ one event resolved to two different places still merges', () => {
  const arts = of('tiktok-doj-settlement');
  const kinds = new Set(arts.map((a) => a.place));
  assert.ok(kinds.size >= 2, 'the fixture must keep both geo resolutions');
  const g = clusterArticles(arts).sort((x, y) => y.length - x.length);
  assert.ok(g[0].length >= 8,
    'the cross-geo merge did not happen: biggest cluster is ' + g[0].length + ' of ' + arts.length);
});

/* ── ⑦ 独立媒体数は記事の本数ではない ────────────────────────────────────
 * 実測: 「Mount Fuji」6 件のうち 3 件は同じ字面（Sinclair 系列）。
 * 「6 媒体が報じた」と出したら、それは嘘である。 */
test('#R334 ⑦ identical reprints count as one voice, not as many sources', () => {
  const arts = of('mount-fuji-boy');
  assert.equal(arts.length, 6);
  assert.equal(countIndependentSources(arts), 4,
    'the three identical Sinclair headlines must collapse to one independent source');
  /* 全部ばらばらの見出しなら、媒体の数だけ声がある。 */
  assert.equal(countIndependentSources(of('walmart-tap-to-pay')), 5);
});

/* ── ⑧ fixture 全体の成績が落ちない ──────────────────────────────────────
 * ⚠ recall は下がらない方向にだけ動かす。precision は 100% を割ってはならない。
 *   ⚠⚠ この precision は「負例が 5 件しか無い fixture の上での」値であって、
 *      閾値を選んだ根拠ではない（根拠は実データ 857 件の目視）。 */
test('#R334 ⑧ the labelled fixture scores at least as well as when it was measured', () => {
  const arts = ARTICLES.map((a) => ({ ...a }));
  const groups = clusterArticles(arts);
  const at = new Map();
  groups.forEach((g, gi) => g.forEach((i) => at.set(i, gi)));
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < arts.length; i++) {
    for (let k = i + 1; k < arts.length; k++) {
      const pred = at.get(i) === at.get(k);
      const truth = arts[i].event === arts[k].event;
      if (pred && truth) tp++; else if (pred) fp++; else if (truth) fn++;
    }
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  assert.equal(fp, 0, 'a wrong merge appeared: precision fell to ' + (100 * precision).toFixed(1) + '%');
  assert.ok(recall >= 0.70,
    'recall fell to ' + (100 * recall).toFixed(1) + '% (measured 72.4% at #R334)');
});

/* ── ⑨ 見出しの正規化 ───────────────────────────────────────────────────── */
test('#R334 ⑨ titles lose the publisher suffix, stopwords and inflection', () => {
  assert.equal(normaliseTitle('Boeing Engineers Reject Offer - The Seattle Times'),
    'boeing engineers reject offer');
  const t = tokenise('The Chinese court sentences the founder of Evergrande to life in prison');
  assert.ok(!t.has('the'), 'stopwords must go');
  assert.ok(t.has('sentence'), 'sentences → sentence');
  assert.ok(t.has('evergrande'));
  /* 語尾だけが違う 2 本が結び付く。 */
  const a = tokenise('Evergrande founder sentenced to life in prison');
  const b = tokenise('Chinese court sentences Evergrande founder to life in prison');
  assert.ok([...a].filter((x) => b.has(x)).length >= 4);
});

/* ── ⑩ URL の正規化 — 同じ記事が 2 本にならない ────────────────────────── */
test('#R334 ⑩ tracking parameters, www, AMP and trailing slashes do not create a second article', () => {
  const A = normaliseUrl('https://www.bbc.co.uk/news/world-1234?utm_source=x&utm_medium=y#top');
  const B = normaliseUrl('https://bbc.co.uk/news/world-1234');
  assert.equal(A.url, B.url);
  assert.equal(A.canonical, true);
  assert.equal(normaliseUrl('https://example.com/a/amp').url, normaliseUrl('https://example.com/a').url);
  assert.equal(normaliseUrl('http://example.com/a/').url, 'https://example.com/a');
  /* Google News のリダイレクトは記事 URL ではない。canonical を名乗らせない。 */
  const g = normaliseUrl('https://news.google.com/rss/articles/CBMiswFBVV95cUxQ?oc=5');
  assert.equal(g.canonical, false);
});

/* ── ⑪ この論理は起動経路に入らない ──────────────────────────────────────
 * 指示 §17「clustering をブラウザの起動経路へ置かない」。
 *
 * ⚠⚠ (#R340) この検査は**要件そのものを測るように書き直した**。元の形は
 *   「js/ と src/ のどこからも news-cluster を参照していないこと」を git grep で見ており、
 *   理由としてこう書いてあった——「src/main.js が js/*.js を全部 import する構造なので、
 *   js/ に置いた瞬間 eager バンドルへ入る」。**その前提はこの構成では成り立たない。**
 *   src/main.js は js/ を全部 import してはおらず（scripts/static-checks.mjs は静的 import・
 *   動的 import・兄弟 import の3経路を認めている）、js/atlas-console.js は
 *   js/lazy-modules.js に載った**押されてから取りに行くモジュール**である。
 *
 *   #R340 が Atlas の research.events を**このファイルへ載せ替えた**（docs/NEWS-EVENTS.md
 *   「第二のクラスタリング実装を残さない」）ので、js/news-cluster.js という薄いアダプタが
 *   1つだけこれを import する。実測: 起動時に配られる chunk に `countrySame` は **0 件**で、
 *   出てくるのは Atlas を開いたときの async chunk だけ。要件は満たされている。
 *
 *   ⇒ ファイル名を grep するのをやめ、**「参照してよいのはアダプタ1本だけ」＋
 *      「そのアダプタを import しているファイルは遅延取得である」**を直接主張する。
 *   ⚠ これは緩和ではない。元の形は「eager に入ったか」を一度も見ていなかったが、
 *      こちらは lazy-modules の実データを読んで、起動経路かどうかを名指しで確かめる。 */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R334 ⑪ the clustering logic never reaches the boot path', async () => {
  for (const f of ['src/main.js', 'src/vendor.js', 'index.html']) {
    assert.ok(!rd(f).includes('news-cluster'),
      f + ' must not reference news-cluster.js — it must never be eager');
  }
  /* 参照してよいのは薄いアダプタ 1 本だけ。git grep はヒット 0 件で exit 1 を返す。 */
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', 'news-cluster', '--', 'js/', 'src/'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { hits = (e.status === 1) ? '' : String(e.message); }
  const files = hits ? hits.split(/\r?\n/).filter(Boolean) : [];
  assert.ok(files.every((f) => f.startsWith('js/')), 'src/ references the grouper: ' + files.join(', '));
  if (!files.length) return;   /* アダプタごと消えたなら、そもそも配られていない */
  assert.ok(files.includes('js/news-cluster.js'),
    'something in js/ reaches the grouper without going through the adapter: ' + files.join(', '));

  /* …そしてそのアダプタを import しているのは、遅延取得されるモジュールだけであること。 */
  const { lazyFiles } = await import('./app-source.mjs');
  const root = new URL('../', import.meta.url);
  const lazy = new Set(lazyFiles(root));
  const importers = [];
  for (const f of readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    if (f === 'news-cluster.js') continue;
    if (/from '\.\/news-cluster\.js'/.test(rd('js/' + f))) importers.push('js/' + f);
  }
  assert.ok(importers.length, 'nothing imports js/news-cluster.js — it is dead code');
  for (const imp of importers) {
    assert.ok(lazy.has(imp),
      imp + ' imports the grouper but is NOT lazily fetched — that puts clustering in the boot path');
  }
});

/* ── ⑫ 時間の窓は効いている ─────────────────────────────────────────────── */
test('#R334 ⑫ two identical-looking reports three days apart are not one event', () => {
  const a = { title: 'Strong earthquake strikes central Peru', published_at: '2026-08-20T00:00:00Z',
    lng: -75, lat: -10, place_kind: 'country' };
  const b = { title: 'Strong earthquake strikes central Peru again', published_at: '2026-08-23T12:00:00Z',
    lng: -75, lat: -10, place_kind: 'country' };
  const v = pairVerdict(a, b);
  assert.equal(v.same, false);
  assert.equal(v.code, 'time');
});

/* ── ⑬ 同じものに 2 つの名前がある問題を、読む口 1 つで塞いである ────────────
 * DB の列は subject_lng / subject_lat / subject_type、fixture は lng / lat / place_kind。
 * ⚠ 呼び出し側ごとに変換を書くと、片方だけ直った日に静かに壊れる。 */
test('#R334 ⑬ DB column names and fixture field names reach the same reader', () => {
  const dbShape = { subject_lng: -98, subject_lat: 39.5, subject_type: 'country' };
  const fxShape = { lng: -98, lat: 39.5, place_kind: 'country' };
  assert.equal(lngOf(dbShape), lngOf(fxShape));
  assert.equal(latOf(dbShape), latOf(fxShape));
  assert.equal(kindOf(dbShape), kindOf(fxShape));
  /* 分類も同じ答えを出す。 */
  assert.equal(geoClass(dbShape, fxShape).cls, 'countrySame');
  /* migration が実際にその綴りの列を持っていること。 */
  const sql = rd('supabase/migrations/20260823120000_news_events.sql');
  for (const col of ['subject_lng', 'subject_lat', 'subject_type']) {
    assert.ok(sql.includes(col), 'news_articles must have ' + col);
  }
});
}

/* ════════ #R340 — from tests/r340-checks.test.mjs ════════ */
{
/* ============================================================================
 *  IntMap · #R340 — Atlas research.events grouped unrelated stories into one
 *                   "event", and nothing in tests/ had ever looked at it.
 * ----------------------------------------------------------------------------
 *  THE STATE BEFORE THIS ROUND. `research.events` («最近の出来事をまとめて» /
 *  "summarize recent events") shipped in #R76 and ran for 254 rounds with ZERO
 *  tests: no file in tests/ named research.events, newsEvents or groupNews. The
 *  grouping lived inline inside a 58-line `case` in js/atlas-console.js, where
 *  nothing outside the browser could call it — so «it works» was an opinion.
 *
 *  WHAT IT WAS DOING, MEASURED. 1,641 production headlines (Supabase
 *  current_news) run through the shipped locator js/newsgeo.js: 1,005 place at
 *  all, and 499 of those resolve to a COUNTRY — 92 of them stacked on the one
 *  point [-98, 39.5] "United States". #R76's rule was Jaccard ≥0.15, RELAXED to
 *  ≥0.06 when d<30 km && Δt≤24 h. Between two country-level subjects d is
 *  EXACTLY 0, so the relaxed branch is true by construction and 6% is the only
 *  gate left. On 600 of those articles: 283 events, largest 36, and 60% of all
 *  joins came through the relaxed branch. That largest "event" held the Iran
 *  economic war, a 40,000-bottle eye-drops recall, a laptop fire on an American
 *  Airlines flight, US debt passing $40tn and childless Americans' retirement
 *  worries.
 *
 *  WHAT THESE TESTS MEASURE. #R334 shipped the event-first pipeline's grouper at
 *  supabase/functions/_shared/news-cluster.js, having reached the same diagnosis
 *  independently — and docs/NEWS-EVENTS.md settles that there is to be exactly
 *  one: «research.events は新パイプラインへ載せ替える。第二のクラスタリング実装
 *  を残さない。» So research.events now calls THAT module through the browser-side
 *  adapter js/news-cluster.js, and everything below runs the shared functions
 *  rather than a copy (#R317: a check that re-implements its subject stops
 *  measuring it the first time the subject moves). The corpus is
 *  tests/fixtures/news-events-prod.json — 400 real headlines with the real
 *  locator's real answers, captured once. Nothing here is invented.
 * ==========================================================================*/
   /* (#R283) line endings belong to the checkout, not to the file */


/* THE SHIPPED FUNCTIONS. js/atlas-console.js calls this same factory, and the
   factory's algorithm half comes straight out of the shared #R334 module. */
const {
  EVENT_RULES, groupNewsEvents, newsSubject, isRepresentative,
  DEFAULTS, tokenise, jaccard, geoClass, pairVerdict,
} = makeNewsCluster();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const FIX = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/news-events-prod.json'), 'utf8'));
const NOW = Date.parse(FIX.capturedAt);

/* The fixture keeps real pubDates and a fixed capture instant, so "hours ago" is
   a pure function of the fixture — the same shape js/atlas-console.js's _agoH has. */
const agoH = (d) => { const t = Date.parse(d); return isFinite(t) ? Math.max(0, Math.round((NOW - t) / 3600000)) : null; };
const group = (items) => groupNewsEvents(items || FIX.items, { agoH, fallbackH: 96 });
const titles = (ev) => ev.g.map((x) => x.it.title);
const eventWith = (evs, re) => evs.find((e) => titles(e).some((t) => re.test(t)));
/* An order-free identity for a whole grouping. ⚠ JSON, not join('|') — real
   headlines contain '|' ("…in Bali | World News"), and a separator that occurs
   inside the values makes two different groupings compare equal (or, as it did
   here first, one grouping compare unequal to itself). */
const canon = (evs) => evs.map((e) => JSON.stringify(titles(e).slice().sort())).sort();
/* geo helpers for ⑥ — the shared module reads subject_lng/lat/type */
const C = (lng, lat) => ({ subject_lng: lng, subject_lat: lat, subject_type: 'country' });
const K = (lng, lat) => ({ subject_lng: lng, subject_lat: lat, subject_type: 'city' });

/* ── ① the fixture is real, and still holds the cases the round was about ──── */
test('#R340 ① the production fixture is intact and discriminating', () => {
  assert.ok(Array.isArray(FIX.items) && FIX.items.length >= 300, `fixture holds ${FIX.items && FIX.items.length} articles`);
  assert.ok(isFinite(NOW), 'fixture has no capturedAt instant — "hours ago" would depend on the wall clock');
  for (const it of FIX.items) {
    assert.ok(it.title && it.pubDate, 'fixture article without a title/pubDate');
    assert.ok(newsSubject(it.analysis), `fixture article has no resolvable subject: ${it.title}`);
  }
  const kinds = {};
  FIX.items.forEach((it) => { const k = newsSubject(it.analysis).kind; kinds[k] = (kinds[k] || 0) + 1; });
  /* ⚠ THE WHOLE DEFECT LIVES IN THIS NUMBER. If country-level subjects ever stop
     dominating the feed the fixture stops probing the thing it was built for. */
  assert.ok(kinds.country >= 100, `only ${kinds.country} country-level subjects — the fixture no longer reproduces the failing shape`);
  const stacked = FIX.items.filter((it) => { const s = newsSubject(it.analysis); return s.kind === 'country' && s.loc[0] === -98 && s.loc[1] === 39.5; });
  assert.ok(stacked.length >= 20, `only ${stacked.length} articles stacked on the United States representative point`);
});

/* ── ② the reported case: one docking point, four different occurrences ────── */
test('#R340 ② Walmart earnings and Walmart Apple Pay are different events', () => {
  const evs = group();
  const earnings = eventWith(evs, /Walmart Beat Earnings/i);
  const applePay = eventWith(evs, /Walmart to let shoppers use Apple Pay/i);
  assert.ok(earnings && applePay, 'the fixture lost the Walmart articles');
  assert.notEqual(earnings, applePay, 'Walmart earnings and Walmart Apple Pay were grouped as one event:\n  ' + titles(earnings).join('\n  '));
  /* …and the split is not achieved by refusing to group anything: the Apple Pay
     reports ARE one event, at the same subject point and inside the same 48 h
     window as the earnings story. Only the wording separates them. */
  assert.ok(applePay.g.length >= 4, `the Apple Pay rollout fragmented into ${applePay.g.length} — over-splitting is not a fix`);
  assert.ok(titles(applePay).every((t) => /apple pay|tap-to-pay/i.test(t)), 'the Apple Pay event absorbed something else:\n  ' + titles(applePay).join('\n  '));
  assert.equal(earnings.g.length, 1, 'the earnings story picked up unrelated Walmart articles:\n  ' + titles(earnings).join('\n  '));
});

/* ── ③ …and the opposite failure is not the fix ────────────────────────────── */
test('#R340 ③ the Swedish school sword attack is ONE event', () => {
  const evs = group();
  const swordEvents = evs.filter((e) => titles(e).some((t) => /sword/i.test(t)));
  const reports = FIX.items.filter((it) => /sword/i.test(it.title));
  assert.ok(reports.length >= 8, `fixture holds only ${reports.length} sword-attack reports`);
  assert.equal(swordEvents.length, 1, 'one occurrence was split across ' + swordEvents.length + ' events:\n'
    + swordEvents.map((e) => '  [' + e.g.length + '] ' + titles(e)[0]).join('\n'));
  assert.equal(swordEvents[0].g.length, reports.length, 'the event dropped reports of the same attack');
  /* every one of those subjects is the SWEDEN representative point — a country
     stack that SHOULD group, because the headlines genuinely agree. */
  assert.ok(swordEvents[0].g.every((x) => isRepresentative(x.subj)), 'the sword reports are not the country-level case this asserts');
});

/* ── ④ unrelated stories filed under one country stay unrelated ────────────── */
test('#R340 ④ a country representative point does not fuse its articles', () => {
  const evs = group();
  const us = (x) => { const s = newsSubject(x.it.analysis); return s.kind === 'country' && s.loc[0] === -98 && s.loc[1] === 39.5; };
  const usEvents = evs.filter((e) => e.g.some(us));
  const biggest = usEvents.reduce((a, b) => (b.g.length > a.g.length ? b : a), usEvents[0]);
  assert.ok(biggest, 'the fixture lost the United States stack');
  /* #R76 put 36 of these in one group. The biggest legitimate one in this corpus
     is the TikTok $400M DOJ settlement — nine outlets on one occurrence. */
  assert.ok(biggest.g.length <= 12, 'unrelated United States articles fused into one event of ' + biggest.g.length + ':\n  ' + titles(biggest).join('\n  '));
  /* and every member really does agree with something already in the group */
  const tk = biggest.g.map((x) => tokenise(x.it.title));
  const floor = Math.min.apply(null, Object.keys(DEFAULTS.thr).map((k) => DEFAULTS.thr[k]));
  for (let i = 1; i < tk.length; i++) {
    const best = Math.max(...tk.slice(0, i).map((o) => jaccard(tk[i], o)));
    assert.ok(best >= floor, 'an article joined the group sharing almost nothing with it: ' + titles(biggest)[i]);
  }
  /* the whole corpus: no group is the old mega-cluster in disguise */
  const max = evs[0].g.length;
  assert.ok(max <= 14, `largest event is ${max} articles — #R76's was 36 and that was the bug`);
  assert.ok(evs.length >= FIX.items.length * 0.5, `${FIX.items.length} articles collapsed into only ${evs.length} events`);
});

/* ── ⑤ the relaxation is gone, and no second implementation grew back ──────── */
/* 綴りのまま: 対象は Atlas カーネル（js/atlas-console.js）の case の中で、ブラウザの Atlas からしか走らない */
test('#R340 ⑤ #R76\'s relaxed branch no longer exists, and there is ONE grouper', () => {
  const atlas = read('js/atlas-console.js');
  const evCase = atlas.slice(atlas.indexOf("case 'events':"));
  assert.ok(evCase.startsWith("case 'events'"), 'the events case is gone from js/atlas-console.js');
  /* ⚠ (#R386) END AT THE NEXT CASE, not at `case 'module':`. This used to slice all the way to
     `module` because `events` happened to be the case before it; the moment another case was
     added between them (news.category), the slice swallowed it and the size ceiling fired on
     code this check is not about. The subject is the EVENTS case, so the boundary is its own end. */
  const nextCase = evCase.slice(1).search(/\n\s{8}case '/);
  const body = nextCase > 0 ? evCase.slice(0, nextCase + 1) : evCase.slice(0, evCase.indexOf("case 'module':"));
  assert.ok(body.length > 200 && body.length < 12000, 'could not isolate the events case — this check needs rewriting');
  /* ⚠ (#R386) …and in EVENT mode it must not group at all: the server already did, over the whole
     window, and a second grouping is a second implementation running (docs/NEWS-EVENTS.md). */
  assert.match(body, /_evMode/, 'the events case does not branch on the surface mode');
  assert.ok(body.indexOf('_evMode') < body.indexOf('groupNewsEvents('),
    'the mode test must come BEFORE the grouper call, or event mode re-clusters what the server clustered');
  assert.ok(!/s3>=0\.15|d<30&&dh<=24|>=0\.06/.test(body), '#R76\'s relaxed branch is back in js/atlas-console.js');
  assert.ok(!/par\[find\(/.test(body), 'the events case grew its own union-find again');
  assert.match(body, /groupNewsEvents\(/, 'the events case no longer calls the shared grouper');
  assert.match(atlas, /from '\.\/news-cluster\.js'/, 'js/atlas-console.js does not import js/news-cluster.js');

  /* ⚠ AND THE ADAPTER MUST STAY AN ADAPTER. docs/NEWS-EVENTS.md forbids a second
     clustering implementation; the way that rule dies is by someone adding "just
     one threshold" here. The adapter may hold NO numeric threshold and NO
     union-find of its own — both live in the shared module. */
  const adapter = read('js/news-cluster.js');
  assert.match(adapter, /from '\.\.\/supabase\/functions\/_shared\/news-cluster\.js'/,
    'js/news-cluster.js no longer imports the shared #R334 grouper — that is a second implementation');
  const code = adapter.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/par\[find\(|union|jaccard\s*\(\s*[a-z]+\s*,\s*[a-z]+\s*\)\s*[<>]/.test(code),
    'js/news-cluster.js is deciding pairs itself instead of delegating');
  const nums = (code.match(/\b0\.\d+\b/g) || []);
  assert.deepEqual(nums, [], 'js/news-cluster.js grew thresholds of its own: ' + nums.join(', '));

  /* the constants are the shared module's, and they carry the anti-#R76 invariant */
  assert.equal(DEFAULTS.timeWindowH, 48, 'the time window changed without a measurement');
  assert.equal(EVENT_RULES.HOURS, DEFAULTS.timeWindowH, 'the reply quotes a window the code does not use');
  for (const k of ['tight', 'near', 'countrySame', 'countryNear', 'unknown', 'far']) {
    assert.ok(DEFAULTS.thr[k] >= 0.15, `${k} threshold ${DEFAULTS.thr[k]} is below what #R76 already had`);
  }
  /* ⚠⚠ THE ONE THAT MATTERS. #R76 LOWERED the bar for country-level pairs (to
     0.06). It must be RAISED — a distance of zero between two country centroids
     is evidence they share a label, not that they share a place. */
  assert.ok(DEFAULTS.thr.countrySame > DEFAULTS.thr.near,
    `countrySame ${DEFAULTS.thr.countrySame} must be HIGHER than near ${DEFAULTS.thr.near}`);
  assert.ok(DEFAULTS.thr.countrySame > DEFAULTS.thr.tight,
    `countrySame ${DEFAULTS.thr.countrySame} must be HIGHER than tight ${DEFAULTS.thr.tight}`);
});

/* ── ⑥ what "same place" means now, stated as behaviour ────────────────────── */
test('#R340 ⑥ a representative point is classified apart from a real place', () => {
  assert.equal(geoClass(C(-98, 39.5), C(-98, 39.5)).cls, 'countrySame', 'two articles on one country point are not classified as such');
  assert.equal(geoClass(C(-98, 39.5), C(-97, 39.5)).cls, 'countryNear', 'country points 86 km apart lost their country class');
  assert.equal(geoClass(C(-98, 39.5), K(-97, 39.5)).cls, 'countryNear', 'a country point next to a city is still a country point');
  assert.equal(geoClass(K(-98, 39.5), K(-97, 39.5)).cls, 'near', 'two real places 86 km apart are one neighbourhood');
  assert.equal(geoClass(K(-98, 39.5), K(-97.77, 39.5)).cls, 'tight', 'two real places 20 km apart are the tight class');
  assert.equal(geoClass(K(-98, 39.5), K(-95, 39.5)).cls, 'far', '257 km is not one neighbourhood');
  /* the behavioural consequence: identical coordinates, no shared wording, no join */
  const two = [
    { title: 'Childless Americans are feeling uneasy about retirement savings too', pubDate: FIX.items[0].pubDate,
      publisher: 'A', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } },
    { title: '40,000 bottles of eye drops across the US recalled over issues with sterility of product', pubDate: FIX.items[0].pubDate,
      publisher: 'B', analysis: { subjectLoc: [-98, 39.5], subjectType: 'country', loc: [-98, 39.5], ptype: 'country', mapped: true, name: 'United States' } },
  ];
  assert.equal(group(two).length, 2, 'two unrelated stories on one country point were called one event');
  /* …and the verdict says WHY, which is what makes a mis-group fixable */
  const v = pairVerdict(
    { title: two[0].title, published_at: '2026-08-23T00:00:00Z', subject_lng: -98, subject_lat: 39.5, subject_type: 'country' },
    { title: two[1].title, published_at: '2026-08-23T01:00:00Z', subject_lng: -98, subject_lat: 39.5, subject_type: 'country' });
  assert.equal(v.same, false);
  assert.equal(v.geo, 'countrySame', 'the pair was not even recognised as the country-stack case');
  assert.ok(Array.isArray(v.reasons) && v.reasons.length, 'the verdict carries no reason');
});

/* ── ⑦ an event is not a function of which pin the map happens to show ─────── */
test('#R340 ⑦ Publisher pin mode does not change the events', () => {
  /* js/app-body.js applyPinMode(), publisher branch, applied to the real data:
     analysis.loc becomes the outlet's HQ and ptype becomes 'city'. Under the old
     code that made every article from one newsroom «the same place». */
  const asPublisher = FIX.items.map((it) => {
    const a = it.analysis;
    if (!a.pubLoc) return it;
    return Object.assign({}, it, { analysis: Object.assign({}, a, { loc: a.pubLoc, name: a.pubName, mapped: 'publisher', ptype: 'city' }) });
  });
  const moved = asPublisher.filter((it, i) => it !== FIX.items[i]).length;
  assert.ok(moved >= 100, `only ${moved} articles have a resolvable publisher HQ — this check is not exercising the mode`);
  assert.deepEqual(canon(group(asPublisher)), canon(group()), 'the events changed when the map switched to Publisher pins');
});

/* ── ⑧ the tokeniser lifts real matches and drops false ones ───────────────── */
test('#R340 ⑧ stopwords and stemming lift true matches and sink false ones', () => {
  const t = tokenise('The report says officials will report on the latest update after they have been briefed');
  for (const w of ['the', 'says', 'report', 'will', 'after', 'they', 'have', 'been']) {
    assert.ok(!t.has(w), `stopword "${w}" survived tokenisation`);
  }
  assert.ok(t.has('official'), 'tokenisation dropped a content word (or stopped stemming)');
  /* ⚠ THE POINT IS THE DIRECTION, AND IT GOES BOTH WAYS. Dropping furniture
     shrinks the UNION of the Jaccard as well as the intersection, so removing it
     RAISES the score for two reports of one occurrence and SINKS it for two that
     only share their boilerplate. `naive` below is #R76's tokeniser, kept here as
     a characterisation of what shipped — the BEFORE of the comparison, not a
     second implementation of the AFTER. */
  const naive = (x) => { const str = String(x || ''); let w;
    try { w = str.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((y) => y.length >= 3); }
    catch (_) { w = str.toLowerCase().split(/[^a-z0-9]+/).filter((y) => y.length >= 3); }
    (str.match(/[一-鿿぀-ヿ가-힯]{2,}/g) || []).forEach((q) => {
      for (let i = 0; i < q.length - 1; i++) w.push(q.slice(i, i + 2)); });
    return new Set(w); };
  const both = (x, y) => [jaccard(tokenise(x), tokenise(y)), jaccard(naive(x), naive(y))];
  /* two reports of the Swedish school attack — measured 0.417 → 0.714 */
  const [sameNew, sameOld] = both('One killed in sword attack at Swedish school',
    'One killed, three injured when man attacks Swedish school with sword');
  assert.ok(sameNew > sameOld, `the tokeniser did not help a true match (${sameNew} vs ${sameOld})`);
  assert.ok(sameNew >= DEFAULTS.thr.countrySame, 'two reports of the same attack no longer clear the country-stack bar');
  /* two stories with NOTHING in common but news furniture — measured 0.357 → 0.222.
     0.357 cleared #R76's 0.15 outright, which is the other half of the reported bug. */
  const [junkNew, junkOld] = both('Report says US debt tops $40 trillion after latest update',
    'Report says eye drops recalled after latest update from the FDA');
  assert.ok(junkOld >= 0.15, 'the boilerplate pair no longer characterises what #R76 accepted');
  assert.ok(junkNew < junkOld, `the tokeniser did not sink a false match (${junkNew} vs ${junkOld})`);
  assert.ok(junkNew < DEFAULTS.thr.countrySame, 'two unrelated stories still clear the country-stack bar on furniture alone');
});

/* ── ⑨ deterministic: no clock, no randomness ──────────────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R340 ⑨ the same articles always produce the same events', () => {
  assert.deepEqual(canon(group()), canon(group()), 'grouping is not deterministic');
  assert.deepEqual(canon(group(FIX.items.slice().reverse())), canon(group()),
    'the events depend on the order the feed arrived in');
  /* ⚠ STRIP THE COMMENTS FIRST. The first version of this ran the pattern over the
     whole file and failed on js/news-cluster.js — because the note there explaining
     WHY it must not call Date.now() contains the string "Date.now()". A check that
     reads prose as code is the trap this repository keeps re-setting for itself.
     ⚠ And the subject is the WALL CLOCK, not the Date constructor: the adapter builds
     instants from the caller's "hours ago" against a fixed epoch, which is exactly what
     makes the fixture reproducible. Argless new Date() and Date.now() are the ban. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['js/news-cluster.js', 'supabase/functions/_shared/news-cluster.js']) {
    const code = strip(read(f));
    assert.ok(!/Math\.random|Date\.now\(\)|new Date\(\s*\)|fetch\(/.test(code), f + ' reached for the wall clock, a die or the network');
  }
});

/* ── ⑩ the results say which half of «map,explanation» actually happened ───── */
/* 綴りのまま: 対象は Atlas カーネル（js/atlas-console.js）の case の中で、ブラウザの Atlas からしか走らない */
test('#R340 ⑩ every research.events return carries meta', () => {
  const atlas = read('js/atlas-console.js');
  const evCase = atlas.slice(atlas.indexOf("case 'events':"));
  const body = evCase.slice(0, evCase.indexOf("case 'module':"));
  const returns = body.match(/return R\(/g) || [];
  assert.ok(returns.length >= 3, `only ${returns.length} returns found in the events case — this check needs rewriting`);
  const withMeta = body.match(/return R\([^;]*?\{meta:\{/g) || [];
  assert.equal(withMeta.length, returns.length,
    `${returns.length - withMeta.length} of ${returns.length} research.events returns still carry no meta`);
  for (const code of ['PLACE_NOT_FOUND', 'NO_ARTICLES', "code:'OK'"]) {
    assert.ok(body.includes(code), `the events case never reports ${code}`);
  }
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /'research\.events',\s*'events',\s*'newsEvents,groupNews'/, 'research.events left the capability table');
  assert.match(caps.slice(caps.indexOf("'research.events'")), /'map,explanation'/, 'research.events no longer declares map,explanation');
  assert.match(body, /produced:\(_evMapped\?\['map','explanation'\]:\['explanation'\]\)/, 'the OK return claims the map regardless of whether the pins drew');
  /* the footnote must quote the rule the code applies, not a remembered one */
  assert.match(body, /EVENT_RULES\.HOURS/, 'the footnote hard-codes the time window');
  assert.match(body, /EVENT_RULES\.SIM_MIN/, 'the footnote hard-codes the similarity bar');
});
}
