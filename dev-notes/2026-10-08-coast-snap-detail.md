---
title: 記録の海岸が残した陸を、基図と同じ OpenStreetMap の海岸線まで延ばした（継承条項のある記録は Natural Earth のまま）——ユスキュダル岸・ベシクタシュ岸の帯。地点の年表は CShapes の終わりから今日までを「記録なし」と述べる。歴史の塗りを押してもカードが開かないのは仕様（#R122）
date: 2026-10-08
newsen: Historical map: where an old record stops short of the shore, the land is now drawn up to the same coastline as the base map (OpenStreetMap) — the Bosporus shores at Üsküdar and Beşiktaş are no longer left blank; place timelines say that no record covers the years after 2019.
newsjp: 歴史地図: 古い記録が岸の手前で止まっている所の陸を、基図と同じ海岸線（OpenStreetMap）まで描くようにしました——ユスキュダル・ベシクタシュのボスポラス岸が空白になりません。地点の年表は 2019 年より後を「この期間を述べる歴史の記録はない」と示します。
---

〈依頼〉#1039 の本番検証（ビルド 38fd028）の 3 件。① ユスキュダル側のアジア岸（サラジャク・ハレム・セリミエからカドゥキョイ）が
1000・1500・1650 年とも塗られず、基図の陸の格子 919 点のうち 240 点が空く（ベシクタシュ岸・クムカプ沿いも同じ形）——吸着の外縁
（Natural Earth 1:10m）がボスポラス沿いで粗い直線のため。より細かい海岸線を使う。② 地点の年表が CShapes の終わり（2019）で
Turkey の行を止め、2020 年〜今日を述べない。③ ラベルの無い歴史の塗りを押してもカードが開かない——仕様か不具合か。

## 0. 測った

**基図の陸で数えると、#1039 の表は空白を見つけられない作りだった。** #1039 の港湾都市の表（`--coast-snap-measure`）と
検査 ⑤ は、吸着が切った当の Natural Earth の陸の点を数えていた——測る道具が測られる側と同じなので、ユスキュダルは
1000・1500・1650 年とも 100% と出た。基図（CARTO、OpenStreetMap 由来）の陸で数え直すと、出荷していた束の
イスタンブールは 1000 年 96.9%・1500 年 97.1%・1650 年 97.1%。0.001° の格子で報告の区域を測ると:

| 区域（0.001° 格子・基図の陸） | 陸の点 | #1039 の束で空白 |
|---|---|---|
| ユスキュダル〜カドゥキョイ（28.995–29.045E × 40.980–41.035N） | 1,692 | 218〜219（各年） |
| ベシクタシュ（28.990–29.020E × 41.035–41.050N） | 300 | 83（各年） |

原因（ボスポラスの 0.0025° の断面。o＝OSM だけ陸、n＝NE だけ陸）: アジア側は Natural Earth の海岸が OSM より約 0.5 km
内陸に直線で引かれ、ヨーロッパ側は逆に海へはみ出す。28.995–29.040E × 41.000–41.035N の OSM の陸 1,034 点のうち
NE も陸と言うのは 863 点、171 点は NE では海、NE の陸のうち 73 点は OSM では海。
⚠ クムカプ沿い「41.002 付近の 8 点」は旧い束でも再現しなかった（28.93–28.99E × 40.995–41.006N の 1650 年は空白 0）。
この入力（OSM 2017 年の陸地ポリゴン）では 28.963E より東の 41.0025N は海で、海岸は 41.003N 付近にある。

## 1. より細かい海岸——基図と同じ OpenStreetMap の陸地ポリゴン

この環境から取れる OSM の海岸は、osmdata.openstreetmap.de の陸地ポリゴンを 10 m で単純化して npm に出した
`@geo-maps/earth-lands-10m` 0.6.0（ODbL 1.0。osmdata 自体はこの環境のネットワーク方針で遮断）。77,858 多角形・
6,476,983 点・5 桁。devDependency として lockfile の integrity で固定し、`OSM_LAND.sha256` でも固定する。ビルド時
だけ読む（出荷するのは片だけ）。

**利用条件で 2 つに分けた（利用者の判断）。** 片は親の線と海岸の両方の派生物。ODbL の継承条項と、CShapes
（CC BY-NC-SA 4.0）・historical-basemaps（GPL-3.0）の継承条項は同時に満たせないので、その 2 つの記録の行は
Natural Earth（パブリックドメイン）のまま、OHM（CC0 1.0）・Cliopatria（CC BY 4.0）の行だけが OSM の海岸まで届く。
どの記録がどちらかは `TIERS` の `licence`/`shareAlike` → `coastOf`、束の `coasts`。門（`checkCoastSnap`）は各記録の
`src` がその条件をまだ述べていることを確かめる（条件が変われば黙って混ぜずに止まる）。

**一致の幅も海岸ごと。** 元の測り方（data/cshapes.js の全頂点のうち海岸から 7 km 以内のものの、海岸までの距離）を再現:
Natural Earth 594,603 点 p25 0.185・中央値 0.415・p75 0.868・p90 1.676 km（記録したとき 0.413）、OSM 510,507 点
p25 0.262・中央値 **0.626**・p75 1.286・p90 2.407 km。CShapes の海岸は OSM より Natural Earth に近い。OSM の行には
0.626 km を使う（`COASTS.osm.agreementKm`）。今日の国境（規則 ⑦）は Natural Earth だけが描くので両方ともそれ。

## 2. 実装で測って直したこと

- **同じ名前の行への「譲り」は、同じ海岸の行どうしに限る。** OSM の陸で最初に作り直した束では、ユスキュダルは 0 点空き
  になったが旧市街の先端が 100% → 39% に退行した。1650 年のイスタンブールは historical-basemaps の枚の «Ottoman Empire»
  が描き、Natural Earth の粗い陸は金角湾の一部を埋めるので、先端の帯は北岸（Cliopatria の «Ottoman Empire» の線）と
  つながり、枚の計算は「同じ名前の上位の行が描く」と譲った。Cliopatria の計算（OSM の陸では金角湾は海）は先端に
  触れず、誰も描かなかった。⇒ 譲るのは同じ海岸の行にだけ。海岸の違う同名の行はそれぞれ自分の海岸で描き、
  重なるところは同じ政体の上に同じ政体（時代の塗りは不透明度 0.001、片は線を引かない）。`drawn-by-another-row`
  は 43,254 → 485。
- **セルの切り出しを箱で先に切る。** 1° タイルの陸と各セル（1 タイルに 19²＝361）の polygon-clipping の交差は、OSM の
  北極海岸で 1 行 10 分を超えた。Sutherland–Hodgman で先にセルへ切ってから交差を取る——同じ領域（4 タイル 1,444 セルで
  面積差 4e-16 deg²）で 15.1 秒 → 0.23 秒。
- **OSM の陸は読み込み時に一度だけ 1° タイルへ分ける**（`splitTiles`、整数の経線・緯線で再帰的に二分）。タイルごとに
  多角形全体を切る方式は北極の環（25 万点）で 1 タイル 0.3 秒、キャッシュを絞ると同じタイルを何度も作り直して
  OHM の 1 行が 3 分かかった。読み込み 36 秒・24,720 タイル、直接の切り出しと面積差 1e-14。OSM の陸地ポリゴンは
  重ならないので union は要らない（Natural Earth は国境を溶かすため union のまま）。
- **メモリ。** OSM の陸と海岸の索引を持つ worker は 3.0 GB から始まり、CShapes の最重量行（ロシア・カナダ）はその上に
  3.5 GB 以上要る——混ぜた待ち行列は 4.3 GB・5 GB・6.5 GB で worker が落ちた。⇒ 海岸ごとに 2 段（Natural Earth の
  行を OSM を読まない worker で先に、残りを新しい worker で）。行をまたいで残る隣の行の索引とタイル片は 600 → 150 行、
  セルのキャッシュは 40,000 → 20,000、Natural Earth のタイルは LRU 500。並列数と heap は `INTMAP_SNAP_WORKERS` /
  `INTMAP_SNAP_HEAP_MB`（このマシンは 4 コア・15 GB で 3 並列・4.3 GB、約 40 分）。

**結果**: `data/hist-coast-snap.js` 11,256 行・38,032 リング・779,792 点・21.28 MB（前 10,937 行・34,306・611,316・17.58 MB）。
判定（連結した片）: 与えた 829,792・2 つ以上の政体 330,052・帯の外へ続く 183,675・海に接しない 108,378・帯より遠い 66,183・
同じ名前の上位の行 485・2 つの海岸線の食い違い 1,067,170・今日の国境 6,620。

## 3. 効果（基図＝OSM の陸で数える）

報告の区域（0.001° 格子）——1000・1500・1650 年とも**空白 0**:

| 区域 | 陸の点 | 前の束で空白 | 今の空白 |
|---|---|---|---|
| ユスキュダル〜カドゥキョイ | 1,692 | 218〜219 | 0 |
| ベシクタシュ | 300 | 83 | 0 |
| 旧市街の先端 | 243 | 0 | 0 |
| クムカプ沿い（28.93–28.99E × 40.995–41.006N） | 309 | 0 | 0 |

港湾都市の表（`node scripts/build-hist-clio.mjs --coast-snap-measure --before <前の束>`、0.0025° 格子・7 月 1 日・%。
記録だけ → 前の束 → 今の束）: イスタンブール 1000 年 79.8 → 96.9 → **100**・1500 年 83.6 → 97.1 → **100**・1650 年 83.5 →
97.1 → **100**・前 300 年 87.6 → 88.8・1900 年 95.3（CShapes＝Natural Earth のまま）。カルタゴ・チュニス 前 300〜1650 年
92.4〜92.5 → 97.9〜98.5。シンガポール 1000 年 88.9 → 98.1・1500〜1800 年 95.6 → 100。コペンハーゲン 1500・1650 年 49.9 →
60.6。ほかの都市・年は変わらず、下がった所は無い。

## 4. 地点の年表——記録の終わりの後も述べる

`js/place-history.js` `compose`: 点が記録の最後（CShapes の 2019-12-31）まで描かれていても、記録の終わりの翌日から今日までを
「この期間を述べる歴史の記録はない（記録はここまで）」の行として出す（`beyond`、Atlas には `afterTheRecords`）。シルケジ
（28.975, 41.010）は «Turkey 1923-10-14 – 2019-12-31（CShapes の記録の終わり）» の後に «2020-01-01 – 今日» の行が付く。
今日の輪郭（Natural Earth）はその政体がいつからその土地を治めたかを述べないので、行を今日へは延ばさない
（historical-verification.md §2-3）。

## 5. 二つの読み手と、カード（historical-verification.md §2b）

吸着は国の層の主張で、同梱の束だけが描く（OHM のベクタタイルは国の塗りを描かない）。片はどちらの海岸かを
`_coastSrc` として持ち、カード（`typeNote`）・「この線の根拠」（`coastSnap.coast`）・地点の年表の註が
「本物の海岸線（OpenStreetMap、© OpenStreetMap contributors、ODbL）」または「（Natural Earth 1:10m）」と述べる。
出典表記は `js/reference-data.js` に ODbL の行を 1 本足し（`paidBy`）、統治の宣言は 2 つの上流（`upstreams`）にした。

**③ ラベルの無い塗りを押してもカードが開かないのは仕様。** #R122 の利用者指示（「国名でも地名ラベルでもない場所を
クリックしたら、強制的に国名をクリックした判定になる」のをやめる）で、時代の国の塗りは国名ラベル（`imtb-lbl`/`imtb-lbl2`）
と、名前の無い形（`_openBlank`）だけが開く。名前のある政体の塗りの内部（片を含む）を押しても何も開かない。片の註を
読む経路は、地名ラベルから開く地点カードの年表（片の行の `notes`）と、その地点で開く「この線の根拠」（`coastSnap`）。

**残したもの**: 1886 年以降（CShapes の時代）のハレム・ユスキュダル岸は空白のまま——CShapes は継承条項のある記録なので
海岸は Natural Earth で、その海岸がこの岸まで届かない（地点の年表は 1886 年〜今日を「記録なし」の行として述べる）。
イスタンブールの 1900 年は 95.3%。同じ形は CShapes と historical-basemaps が描くすべての時代・場所にある。
OSM の入力は 2017 年の陸地ポリゴンで、それ以後の埋め立ては入らない。

## 6. 作り直した順

`node scripts/build-hist-clio.mjs --coast-snap`（約 40 分）→ `node scripts/build-border-coast.mjs`（全リング 132,688 → 136,414。
文書 4 か所と `.github/workflows/ci.yml` の数を合わせた）→ `node scripts/build-hist-courses.mjs --rebasis`（**新設**: OSM の
キャッシュはそれを取ったマシンの一時ディレクトリにしか無いので、出荷済みの川・城壁の線から置き換えを `--check` と同じ
手順で作り直し `basis` だけ記録し直す。置き換えは変わらなかった）→ `node scripts/hist-fidelity.mjs --update` →
`node scripts/build-on-this-day.mjs`（929 件のまま）→ `node scripts/data-governance.mjs --update` → build（起動費用は予算内・
`check:perf`／`check:assets` 緑）。`node scripts/build-border-provenance.mjs` は OHM のキャッシュが要るが、索引は変わらず
`check:borderprov` は緑のまま。

## 7. 検査

- 段 0: `tests/coast-snap-detail-checks.test.mjs`（4 件）——① 報告の 4 区域を基図の陸の 0.001° 格子で 1000・1500・1650 年
  すべての点 ② 記録の条件と海岸（`coastOf`・束の `coasts`）、1650 年のハレムの片の岸が OSM の海岸上にあり Natural Earth
  の海岸上に無い ③ ページが 1650 年のハレムをオスマン帝国の片（`_coastSrc` osm）として描き、註が英日で海岸の出典を言う
  ④ ハレムの年表が海岸を合わせたと述べ、1886 年〜今日を空白の行として出す。
- 段 1: `check:histclio`・`check:histfidelity`・`check:bordercoast`（hist-courses を含む）・`check:borderprov`・`check:docs`・
  `check:datagov`・`check:i18n`・`check:histeras`・`check:cshapes`・`check:histborders`・`check:perf`・`check:assets` 緑。
  `check:static` は icon-glyphs 31 件で赤だが、変更前の main でも同じ 31 件（この環境の Node 22。CI は `.nvmrc` の 24）。
- ブラウザ（ローカルの build・1650 年）: ハレム（29.0105, 41.011）を右クリック →「About the place」のカードの年表が
  «Ottoman Empire 1351–1885» に「本物の海岸線（OpenStreetMap, © OpenStreetMap contributors, ODbL）」の註を付け、
  «No record draws a polity here 1886 – today» を出す。`tests/coast-snap-gaps-checks.test.mjs` は
  ③ を 2 つの海岸の値に、⑤ の陸を基図（OSM）に、⑦ に記録の終わりの後の行（英日・Atlas）を足した。
- CI: `tests/hist-recon-expand-checks.test.mjs`（dossier-check）が、GitHub raw の geoBoundaries（BGD-ADM3・IND-ADM3）の 504 で
  同じ commit の 2 回の run で落ちた（この変更とは無関係）。利用者の判断でこの PR に入れた: `scripts/histrecon/atoms/geoboundaries.mjs`
  は、観測された失敗（ネットワーク例外・5xx）の後だけ最大 3 回取り直し、各試行を記録する（`scripts/data-assets.mjs` と同じ規則、
  4xx は最終）。
