/* ============================================================================
 *  R426 — 国を囲む枠は「その国が土地を持つ全ての場所」ではなく「その国が在る場所」
 * ----------------------------------------------------------------------------
 *  `js/countries-ui.js` は #R185 以来 `countryStats[code].bbox` を **Natural Earth の
 *  feature 全体の min/max** で作っていた。`js/place-framing.js` は「公表された範囲」を
 *  class zoom より優先する（#R183——範囲は測定値だから）ので、遠い海外領土を同じ
 *  feature に抱えた国は、**その領土まで入る枠**でカメラを決めていた。
 *
 *  実測（同梱の CDN 版 ne_10m_admin_0_countries.geojson・252 コード・2026-08-25）:
 *
 *      NOR ノルウェー   緯度 135.2°（ブーベ島 54.5°S・ヤンマイエン・スヴァールバル）
 *      FRA フランス     緯度 72.5° / 経度 117.7°（仏領ギアナ・レユニオン・ニューカレドニア）
 *      USA アメリカ              経度 358.9°（グアム・米領サモア・±180 をまたぐアラスカ）
 *      RUS ロシア                経度 360.0°
 *
 *  ⚠⚠⚠ **壊れ方は 2 通りあり、どちらも「カメラがその国を見ていない」で終わる。**
 *    ① **外れ値で膨らんだ枠**は place-framing の OUTLIER 規則に**捨てられる**ので、
 *       ノルウェー・フランス・オランダ・エクアドル・ポルトガル・チリ・デンマークが
 *       **一律 `country` zoom 4.4 に落ちていた**——#R185 が消すために存在した欠陥そのもの。
 *       捨てられなかった国は外れ値で伸びた枠のまま（豪州は 128 km² の島 1 つで緯度 45.5°）。
 *    ② **書き下せない枠**。±180 をまたぐ環は min/max では `-180…180`＝地球全幅になるので
 *       やはり拒否され、米・露・NZ・フィジー・キリバスは **zoom 3.2** へ飛ばされていた。
 *
 *  実測（HEAD の place-framing に union の bbox を渡して 252 コードを走らせた）:
 *  **実枠 220・拒否 25・「巨大」7**。修正後は **実枠 251・「巨大」1**（南極大陸だけ——
 *  本当に極を一周するので、区間として書けないのが正しい）。
 *
 *  ⚠ **この検査に手書きの 8 コードは無い。** ①は同梱の `data/cshapes.js`（CShapes 2.0・
 *    実在の多パート国境 181 件）を**全件**歩いて性質だけを言う。しかも
 *    **union がその性質を破ることを同時に主張する**——破らないなら、この検査は
 *    「直っている」ではなく「元から当たらない」であり、緑に意味が無い
 *    （[[intmap-recurring-lessons]]「理由のない緑」）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* js/country-extent.js は js/place-framing.js と同じ理由で自分のファイルにある——純粋で、
   地図にもレンダラにも HOST にも turf にも触らないので、実データに対して Node で測れる。 */
const EXT = (() => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/country-extent.js'), ctx);
  return ctx.window.IntMapCountryExtent;
})();
const FRAMING = (() => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/place-framing.js'), ctx);
  return ctx.window.IntMapPlaceFraming;
})();

/* 同梱の実在国境。`feats` は [name, …, y0,m0,d0, y1,m1,d1, polys] で polys[i] は環の添字列。 */
const CSHAPES = (() => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('data/cshapes.js'), ctx);
  return ctx.window.__CSHAPES;
})();
/* ⚠ vm の中の配列をそのまま持ち回ると、filter / map の結果も向こうの realm の配列になり、
   deepStrictEqual が中身は同じでも prototype で落ちる。こちら側に写してから使う。 */
const LIVE_COUNTRIES = Array.from(CSHAPES.feats).filter((f) => f[5] >= 2019).map((f) => ({
  name: f[0],
  geometry: { type: 'MultiPolygon', coordinates: f[8].map((poly) => poly.map((ri) => CSHAPES.rings[ri])) },
}));

const span = (b) => ({ lon: b[2] - b[0], lat: b[3] - b[1] });
/* 「枠として有り得ない」——地球の半周より広い、または 90° より高い。 */
const implausible = (b) => { const s = span(b); return s.lon > 180 || s.lat > 90; };

test('R426 ① 同梱の実在国境 181 件すべてで、枠は地球の有り得ない割合を占めない', () => {
  assert.ok(LIVE_COUNTRIES.length > 150,
    `CShapes から現行国境が ${LIVE_COUNTRIES.length} 件しか取れていない——形が変わったならこの検査を書き直すこと`);

  /* ⚠ まず「この検査には歯がある」を主張する。union が誰も破らないなら、下の緑は
     アルゴリズムではなく素材の話になる。実測: 露・NZ・フィジーの 3 件が 355〜360° 幅。 */
  const unionBad = LIVE_COUNTRIES
    .map((c) => ({ name: c.name, box: EXT.fullExtent(c.geometry) }))
    .filter((r) => r.box && implausible(r.box));
  assert.ok(unionBad.length >= 3,
    'union がどの国でも有り得ない枠にならないなら、この素材はこの欠陥を再現できていない');

  const bad = [];
  for (const c of LIVE_COUNTRIES) {
    const home = EXT.homeExtent(c.geometry, null);
    assert.ok(home, `${c.name}: 実在の多パート国境から枠が出ない`);
    if (implausible(home)) bad.push(`${c.name} ${span(home).lon.toFixed(0)}x${span(home).lat.toFixed(0)}`);
    /* 枠は必ず正規化されている——西端は [-180,180)、東端はその東（またぐ国は 180 を越えてよい）。 */
    assert.ok(home[0] >= -180 && home[0] < 180, `${c.name}: 西端 ${home[0]} が正規化されていない`);
    assert.ok(home[2] >= home[0], `${c.name}: 東端が西端の西にある`);
    assert.ok(home[3] > home[1], `${c.name}: 南北が潰れている`);
  }
  assert.deepEqual(bad, [], '枠として有り得ない大きさの国: ' + bad.join(' / '));
});

/* 検索欄が渡す点の代わり。Natural Earth の LABEL_X/LABEL_Y は CShapes には無いので、
   **その国の最大の環の中心**を置く——手書きの表ではなく、形から出る実在の錨。 */
function anchorPoint(geometry) {
  let best = null, bestArea = -Infinity;
  for (const rings of geometry.coordinates) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of rings[0]) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    const a = (e - w) * (n - s);
    if (a > bestArea) { bestArea = a; best = [(w + e) / 2, (s + n) / 2]; }
  }
  return best;
}
const frameAll = (mark) => LIVE_COUNTRIES.filter((c) => {
  const b = EXT.homeExtent(c.geometry, null), pt = anchorPoint(c.geometry);
  const raw = { boundingbox: [b[1], b[3], b[0], b[2]], lat: pt[1], lon: pt[0] };
  if (mark) raw.homeExtent = true;
  const fr = FRAMING.framingFor(raw, 'country');
  return !(fr.bounds && !fr.huge);
}).map((c) => c.name);

test('R426 ② 同じ 181 件で、place-framing はどれも実枠で構える（4.4 にも 3.2 にも落ちない）', () => {
  /* #R185 が約束したのは「Monaco は Monaco の大きさで、Russia は Russia の大きさで」だった。
     実測（修正前・NE 252 コード）: 25 件が拒否されて 4.4、7 件が「巨大」で 3.2。 */
  assert.deepEqual(frameAll(true), [], 'class zoom に落ちた国: ' + frameAll(true).join(' / '));

  /* ⚠ **そして出所の印には効き目がなければならない。** 印を外すと OUTLIER 規則——出所の
     分からない箱に対する**推測**——が、もう刈ってある箱にも当たる。実測: この素材で 5 件
     （バハマ・赤道ギニア・モルディブ・インドネシア・仏領ポリネシア）が拒否に戻る。
     ここが 0 件になったら、印を読む側か付ける側のどちらかが消えている。 */
  assert.ok(frameAll(false).length >= 3,
    '印を外しても誰も拒否されないなら、この検査は印の効き目を見ていない');
});

/* ---- 仕組みそのもの。①②は実データの性質、以下はその性質を生んでいる規則 ---- */

/* 環は矩形 1 つ。[w,s,e,n] を反時計回りで閉じる。 */
const rect = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const multi = (...rects) => ({ type: 'MultiPolygon', coordinates: rects });
/* ⚠ vm の中で作られた配列は**別の realm の Array.prototype** を持つので、
   `assert.deepEqual`（strict 版＝deepStrictEqual）は中身が同じでも prototype で落ちる。
   数値だけを見たいので、こちら側の配列に写してから比べる。 */
const box = (b) => Array.from(b, Number);

test('R426 ③ ±180 をまたぐ国は、拒否されずに「180 を越える東端」として書き下される', () => {
  /* Natural Earth は環を ±180 で切るので、**1 つのパートは決してまたがない**——またぐのは
     2 つの union のほうで、min/max はそれを言えない。チュクチ半島 179°E とビッグダイオミード
     169°W が「-180 から 180」＝地球全幅になっていた。 */
  const g = multi(rect(170, 60, 180, 70), rect(-180, 60, -170, 70));
  const home = EXT.homeExtent(g, null);
  assert.equal(home[0], 170, '西端は 170°E');
  assert.equal(home[2], 190, '東端は 190（＝170°W）——区間として書けている');
  assert.equal(home[2] - home[0], 20, 'またぐ国の幅は 20° であって 360° ではない');
  const full = EXT.fullExtent(g);
  assert.equal(full[2] - full[0], 360, 'union のほうは今でも地球全幅を主張する（だから枠に使えない）');
  /* そして place-framing はこれを拒否しない。 */
  const fr = FRAMING.framingFor({ boundingbox: [home[1], home[3], home[0], home[2]], homeExtent: true }, 'country');
  assert.ok(fr.bounds && !fr.huge, 'またぐ国は zoom 3.2 ではなく自分の枠で構える');
});

test('R426 ④ 遠くて小さい領土は落ち、遠くても国の 1/3 を占める部分は残る', () => {
  /* 距離だけでは決まらない——実測でマレー半島とサラワクは 5.4° 離れ、CONUS とアラスカも
     5.4° 離れている。分けているのは面積の割合で、アラスカは合衆国の 15.0 %、サラワクは
     マレーシアの 39.8 %。 */
  const far = 30;                                     /* 隙間は 20°——GAP_DEG=3 よりはるかに遠い */
  const main = rect(0, 0, 10, 10);                    /* 本土 */
  const tiny = rect(far, 0, far + 1, 1);              /* 遠い小島 */
  assert.deepEqual(box(EXT.homeExtent(multi(main, tiny), null)), [0, 0, 10, 10], '遠い小島は枠を広げない');
  const half = rect(far, 0, far + 9, 9);              /* 遠いが本土に匹敵する塊 */
  const withHalf = EXT.homeExtent(multi(main, half), null);
  assert.equal(withHalf[2], far + 9, '国の 1/3 を超える部分は、どれだけ遠くても答えの一部');
  /* union はどちらも同じに見える——それがこの欠陥の全部である。 */
  assert.equal(EXT.fullExtent(multi(main, tiny))[2], far + 1);
});

test('R426 ⑤ 島の連なりは連鎖でたどる（本州から沖縄までは一跳びではない）', () => {
  /* 単連結でつなぐのは、日本が南西諸島を伝って沖縄に届くため。錨から直接測る規則だと
     8° の跳躍になって拒否される。 */
  const chain = multi(rect(0, 0, 2, 2), rect(0, 4, 2, 6), rect(0, 8, 2, 10), rect(0, 12, 2, 14));
  assert.deepEqual(box(EXT.homeExtent(chain, null)), [0, 0, 2, 14], '2° ずつの飛び石は全部つながる');
  const broken = multi(rect(0, 0, 2, 2), rect(0, 4, 2, 6), rect(0, 40, 2, 42));
  assert.deepEqual(box(EXT.homeExtent(broken, null)), [0, 0, 2, 6], '連鎖が切れたところで枠も終わる');
});

test('R426 ⑥ 錨は「その国が自分の名前を置いた場所」——面積ではない', () => {
  /* Natural Earth の LABEL_X/LABEL_Y は「どれがその国か」という製図者の判断なので、
     面積と食い違うときはこちらが勝つ。キリバスの label はキリティマティにあり、
     環礁の最大の塊から 3,300 km 離れている。
     ⚠ 大小 2 つでは測れない——大きいほうは必ず全体の 1/3 を超えるので、④ の規則が
     どちらを錨にしても引き寄せてしまう。だから **1 つも 1/3 に届かない群れ**にする
     （キリバスの実際の形。キリティマティは全土の 48 %、タラワは 4 %）。 */
  const all = multi(rect(0, 0, 3, 3), rect(0, 5, 3, 8), rect(0, 10, 3, 13), rect(0, 15, 3, 18),
    rect(60, 60, 61, 61));
  assert.deepEqual(box(EXT.homeExtent(all, [60.5, 60.5])), [60, 60, 61, 61], 'label のあるパートが錨');
  assert.deepEqual(box(EXT.homeExtent(all, null)), [0, 0, 3, 18], 'label が無ければ最大のパートから');
  assert.deepEqual(box(EXT.homeExtent(all, [170, 80])), [0, 0, 3, 18], 'どのパートにも入らない label は使わない');
});

test('R426 ⑦ 極を一周する形は区間にならないので、-180…180 をそのまま返す', () => {
  /* 南極大陸だけがこれに当たる。区間として書けないことを枠のほうが言い、place-framing の
     「180° より広い箱」の道が受け取る——それが元からある正しい扱い。 */
  const ring = multi(rect(-180, -85, -60, -70), rect(-70, -85, 60, -70), rect(50, -85, 180, -70));
  const home = EXT.homeExtent(ring, null);
  assert.equal(home[0], -180);
  assert.equal(home[2], 180);
  const fr = FRAMING.framingFor({ boundingbox: [home[1], home[3], home[0], home[2]], homeExtent: true }, 'country');
  assert.ok(fr.huge, '極を一周する形は「巨大」の道へ（拒否ではなく、引いた既定へ）');
});

test('R426 ⑧ 2 つの箱は別々の名前で公表され、別々の読み手が読んでいる', () => {
  const cui = read('js/countries-ui.js');
  const view = read('js/atlas-view-subject.js');
  const ex = read('js/atlas-examples.js');
  const geo = read('js/search-geocode.js');
  const framing = read('js/place-framing.js');

  /* 作る側: 枠は homeExtent、union は fullExtent。同じ関数を両方に配ると欠陥が戻る。 */
  assert.match(cui, /bbox:\s*_homeOf\(f\)/, 'countryStats.bbox は home extent');
  assert.match(cui, /bboxAll:\s*_fullOf\(f\)/, 'countryStats.bboxAll は union');
  assert.match(cui, /_homeOf=.*homeExtent\(/s, '_homeOf は js/country-extent.js の homeExtent を呼ぶ');
  assert.match(cui, /_fullOf=.*fullExtent\(/s, '_fullOf は fullExtent を呼ぶ');
  /* ⚠ 10 m への差し替え側でも両方が更新されること。#R375 はここが片方だけで表と地形がずれた。 */
  assert.match(cui, /s\.bbox=_homeOf\(v\.f\)\|\|s\.bbox;\s*s\.bboxAll=_fullOf\(v\.f\)\|\|s\.bboxAll;/,
    '10 m の差し替えでも枠と union の両方が更新される');
  assert.ok(!/_bboxOf/.test(cui), 'union を返す旧 _bboxOf は残っていない（残れば枠に戻せてしまう）');

  /* 読む側: 当たり判定の足切りは union でなければならない——枠で切るとブーベ島が
     「ノルウェーではない」になる。 */
  assert.match(view, /st\.bboxAll\s*&&\s*st\.bboxAll\.length === 4/, '視野の主語判定は union で足切りする');
  assert.ok(!/st\.bbox\b(?!All)/.test(view.split('\n').filter((l) => /const bb =/.test(l)).join('\n')),
    '足切りの行が枠を読んでいない');
  /* atlas-examples の 4 つの主張は全部「その国の全領土」の話（#R337）。 */
  assert.match(ex, /st\.bboxAll&&st\.bboxAll\.length===4/, '地理の chip は union を読む（spread は外れ値そのものの測定）');

  /* 出所の印と、それを読む側。片方だけになると 20 か国が黙って 4.4 に戻る。 */
  assert.match(geo, /homeExtent:true/, '検索欄の local 一致は「もう刈ってある箱」だと名乗る');
  assert.match(framing, /if\(!raw\.homeExtent&&isFinite\(plng\)/, 'place-framing はその印で OUTLIER 判定を飛ばす');
});

test('R426 ⑨ 定数は、実測した窓の中にある', () => {
  /* GAP_DEG は 2.5°〜4° のどこでも同じ違反件数だと実測した窓の中。
     MAJOR_SHARE はアラスカ 15.0 %（外）とサラワク 39.8 %（中）を分ける窓の中。 */
  assert.ok(EXT.GAP_DEG >= 2.5 && EXT.GAP_DEG <= 4, `GAP_DEG=${EXT.GAP_DEG} は実測した窓の外`);
  assert.ok(EXT.MAJOR_SHARE > 0.16 && EXT.MAJOR_SHARE < 0.39,
    `MAJOR_SHARE=${EXT.MAJOR_SHARE} ではアラスカかサラワクのどちらかを間違える`);
});
