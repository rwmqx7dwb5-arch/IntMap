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

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import {
  CATEGORIES, DEFAULTS, tokenise, normaliseTitle, normaliseUrl,
  pairVerdict, clusterArticles, countIndependentSources, geoClass, lngOf, latOf, kindOf,
} from '../supabase/functions/_shared/news-cluster.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const FIXTURE = JSON.parse(rd('tests/fixtures/r334-news-events.json'));
const ARTICLES = FIXTURE.articles.map((a) => ({ ...a, source_family: a.publisher }));
const of = (ev) => ARTICLES.filter((a) => a.event === ev).map((a) => ({ ...a }));

/* ── ① カテゴリの一覧は 1 つである ────────────────────────────────────────
 * コードの CATEGORIES と migration の check 制約が食い違えば、片方でしか通らない値が
 * 静かに生まれる。#R318 の「2 つの一覧が一致しない」形をここで作らない。 */
test('① the category list in code and in the migration are the same list', () => {
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
test('② a country centroid never LOWERS the bar — that is what broke #R76', () => {
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
test('③ the headlines #R76 fused into one event stay apart', () => {
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
test('④ the same company announcing two different things is two events', () => {
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
test('⑤ nine reports of one attack become one event', () => {
  const g = clusterArticles(of('sweden-school-sword'));
  assert.equal(g.length, 1, 'the Swedish school attack fragmented into ' + g.length + ' events');
  assert.equal(g[0].length, 9);
});

/* ── ⑥ 地点の解像度が違っても、同じ出来事はまとまる ──────────────────────
 * TikTok の $400M 和解は、IntMapNewsGeo が一部を ByteDance 本社に、一部を「米国」の代表点に
 * 解決した。距離は約 10,000km ある。#R76 の 150km ゲートはここで必ず落ちていた。 */
test('⑥ one event resolved to two different places still merges', () => {
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
test('⑦ identical reprints count as one voice, not as many sources', () => {
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
test('⑧ the labelled fixture scores at least as well as when it was measured', () => {
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
test('⑨ titles lose the publisher suffix, stopwords and inflection', () => {
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
test('⑩ tracking parameters, www, AMP and trailing slashes do not create a second article', () => {
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

/* ── ⑪ この論理はブラウザに配られない ────────────────────────────────────
 * 指示 §17「clustering をブラウザの起動経路へ置かない」。src/main.js が js/*.js を全部
 * import する構造なので、js/ に置いた瞬間 eager バンドルへ入る。 */
test('⑪ the clustering logic is server-only and reaches no client bundle', () => {
  for (const f of ['src/main.js', 'src/vendor.js', 'index.html']) {
    assert.ok(!rd(f).includes('news-cluster'),
      f + ' must not reference news-cluster.js — it is server-only');
  }
  /* js/ 配下からの参照も無いこと。git grep はヒット 0 件で exit 1 を返すので、それを成功とみなす。 */
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', 'news-cluster', '--', 'js/', 'src/'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { hits = (e.status === 1) ? '' : String(e.message); }
  assert.equal(hits, '', 'js/ or src/ references news-cluster.js: ' + hits);
});

/* ── ⑫ 時間の窓は効いている ─────────────────────────────────────────────── */
test('⑫ two identical-looking reports three days apart are not one event', () => {
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
test('⑬ DB column names and fixture field names reach the same reader', () => {
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
