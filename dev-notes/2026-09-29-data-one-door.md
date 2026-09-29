---
title: 同梱データ data/ を読む扉を 1 つにする——同じファイルを複数のモジュールが別々に取得・展開・parse し、gzip の展開と JSON.parse が UI スレッドで走っていた。js/data-door.js がファイルごとに 1 本の Promise を共有し、gzip は Worker で展開する
date: 2026-09-29
---

〈依頼（構造改革）〉同梱データ `data/` を取得する「扉」を 1 つにする。監査の実測: `data/admin1-world.json.gz`
（展開後 7.51 MB）を `js/world-packs.js` と `js/atlas-admin1.js` が別々の Promise で 2 回取得・展開・parse
（`js/net-health-live.js` の冒頭が二重を自認していた）、`data/volcanoes_gvp.json` は `js/beta-overlays.js` の
2 か所と `js/compare.js` の計 3 か所、`data/whc-sites.json` は `beta-overlays` の 2 か所で、`featuresOf` は
読み込み中フラグを見ないので同時に呼ぶと二重取得。gzip の展開と `JSON.parse` は UI スレッドで走っていた
（`gazetteer-world.json.gz` 13.28 MB ほか coastline・earth-structure・whc-detail）。

## 0. 測った

**UI スレッドの停止**——Playwright Chromium、ファイル 1 本を読む間のページ上の長いタスク（合計／最長 ms）、
新しいページ 3 回の中央値、`page.route` で worktree の実ファイルを配信（サーバを立てない）。

| ファイル | 4× CPU 減速: ページで展開 | 4×: Worker（オブジェクトで返す） | 4×: Worker（文字列で返しページで parse） |
|---|---|---|---|
| gazetteer-world.json.gz 5.29 MB | 550 / 361 | **254 / 254** | 314 / 314 |
| admin1-world.json.gz 2.38 MB | 286 / 185 | **142 / 142** | 158 / 158 |
| gazetteer-phone.json.gz 0.56 MB | 52 / 52 | **0 / 0** | 0 / 0 |
| slab2.bin.gz 0.97 MB（バイト列） | 67 / 67 | **0 / 0**（移譲で返る） | — |
| whc-detail.en.json.gz 0.31 MB | 0 / 0 | 0 / 0 | 0 / 0 |
| coastline.json.gz 0.26 MB | 0 / 0 | 0 / 0 | 0 / 0 |
| whc-sites.json 0.62 MB（非圧縮） | 0 / 0 | 0 / 0（+22 ms 遅延、減速なし） | — |
| volcanoes_gvp.json 0.30 MB（非圧縮） | 0 / 0 | 0 / 0（+16 ms 遅延、減速なし） | — |

減速なしのデスクトップでは gazetteer-world が 117 → 52 ms、ほかは全部 0 → 0。

- **構造化複製は無料ではない。** 大きい 2 本で残る 142〜254 ms は**複製の復元**で、オブジェクトを使うスレッドで
  組み立てる以上どの Worker にも消せない。それでも半分になる。
- **否定した見立て**: 「文字列で返してページで parse すれば複製より速い」——測ると長かった（上表の右列）。
- **効かない帯**: gzip で約 0.35 MB 以下（whc-detail・coastline）はどちらの経路でも長いタスクが出ない。
  Worker は減速なしで 7〜14 ms 遅れ、4× では差が測れなかった（32 → 26・37 → 34 ms）。閾値は置かず全部の gzip を
  Worker に出す（道は 1 本、保つべき数が無い）。非圧縮の JSON はページで parse する。
  数表と失効条件の正本は `js/data-door.js` の冒頭（非圧縮で数 MB のファイルが入ったら測り直す）。

**起動費用**——HEAD（`6dad1019`）を scratch に `git archive` して同じ手順で build し、`--report` と比べた:
eager raw 4,814.7 → 4,817.8 kB（**+3.1 kB**）・gzip +1.1 kB・brotli 1,190.8 → 1,191.6 kB（**+0.8 kB**）・
modules 286 → 287・requests 9 のまま。async raw は −0.8 kB。⚠ 台帳（`tests/perf-baseline.json`）は HEAD の時点で
既に raw +16.4 kB・brotli +5.1 kB 上にあり（許容幅の内側）、この変更の +0.8 kB で brotli が許容幅を越えたので
`--update` した。扉そのものは min 後 4.2 kB。

**期限の無い `fetch()`** は 12 本減った（`scripts/fetch-deadlines.mjs` の台帳 142 → 130。`atlas-admin1` 1・
`beta-overlays` 5・`coastline` 1・`compare` 1・`earth-structure` 2・`gazetteer` 1・`world-packs` 1）。
移したどの読み取りにも、それまで時計が無かった。

**本物のページでの確認**（`dist/` を `page.route` で配信）: `admin1` を 2 回・`featuresOf('volcanoes')` を
2 回・`featuresOf('heritage')` を 2 回同時に呼び、地名表を warm した結果、`data/` への要求は各ファイル
**1 回**、同じオブジェクト、`counts()` は reads 4・shared 3・worker 2（admin1・地名表）・page 2。

## 1. 直したもの

- **`js/data-door.js`（新規）** — `loadData(url, {as, cache})`。鍵は解決後の URL と形。取得中は同じ Promise、
  読めた値は WeakRef（誰かが持つ間は再取得しない・扉は生の文書を常駐させない）、失敗は表から消して次の
  呼び出しが読み直す（自動の再試行はしない）。時計は `js/fetch-deadline.js` の `readWithin` を idle ＋
  `clockFor` で（書き直していない）。gzip は先頭 2 バイトで判定し、本文を Blob Worker へ**移譲**。Worker は
  ページのフォールバックと**同じ関数 `inflate` の自身のソース**から組み立てる（実装は 1 つ）。スレッドは最後の
  仕事が返ったら終了する。例外の `reason`: `timeout`／`network`／`http`（`status`）／`parse`／`unsupported`／
  `worker`（死んだスレッドの次はページで走る——観測された失敗のあとの、違う道）。
- **`js/fetch-deadline.js`** — `readWithin` に `opts.bytes`（本文を `bytes` で返す。同じ時計・同じ塊ごとの掛け直し）。
  gzip を TextDecoder に通すと壊れるので、扉がこの時計を使うには要った。
- 移した呼び出し元: `js/world-packs.js` `worldAdm1`・`js/atlas-admin1.js` `rawLoad`（`deps.load` の注入は保持）・
  `js/beta-overlays.js` `volcLoad`／`whsLoad`／`whsDetailLoad`／`featuresOf`・`js/compare.js` の火山・
  `js/gazetteer.js` `warm`・`js/coastline.js` `ready`・`js/earth-structure.js`（CRUST1.0／Slab2／PB2002 の
  JSON と `.bin.gz`）。`gazetteer` と `earth-structure` は node のハーネスが `new Function` で評価する
  （import 行を持てない）ので、**呼び出しの時点で** `window.IntMapDataDoor` を引く。
- **新しい window 名 `IntMapDataDoor`**（`load`・`counts`）。読み手は `js/gazetteer.js` と `js/earth-structure.js`。
  `tests/global-surface-baseline.json` を `--update`。
- 挙動の差: gzip の判定を**バイトで**行うのが全経路になった（`earth-structure`・`world-packs`・`atlas-admin1`・
  whc-detail は従来ファイル名で決め打ち＝Content-Encoding を付けるホストでは失敗していた）。得られるデータは同一。
  ⚠ **値は共有される**——火山の文書は `beta-overlays` の `volcApplyStatus` が各地物に観測所の状態を書き込むが、
  `compare.js` はそれを `addSource` の時点で複製し、その欄を読む描画規則を持たない。

## 2. 検査

- `tests/data-one-door-checks.test.mjs`（13 件）— 扉を import して**評価する**: 同時 2 呼び出しで要求 1 回・
  同じ値／形が鍵の一部／`http`・`network` で拒否し次の呼び出しで読み直す／無音は `timeout`（mock timers）／
  ページ経路の展開が node の gunzip と一致（json・arrayBuffer・非圧縮）／**扉の Worker ソースを `worker_threads`
  の本物の別スレッドで走らせ**ページ経路と一致・スレッドは空けば返る／死ぬスレッドは `worker` で拒否し次は
  ページ。構造の半分は `scripts/code-only.mjs` のコードから**発見する**: 扉以外に「取得して gzip を自分で展開する」
  ファイルが無い（例外は理由つきの `NOT_YET` だけ・いまは空）／同じ `data/` ファイルを名指しで
  取得するファイルが 2 つ無い／`data/*.gz` をリテラルでも定数経由でも直に取得しない。変更前のソース
  （`git show HEAD:`）に当てて、admin1 の 2 読者・火山の二重・定数経由の `fetch(ADM1_URL)` を全部捕まえることを確かめた。
- 綴りを固定していた既存の検査 3 本を、事実の置き場に合わせて直した: `tests/data-gazetteer-checks` R208 ②b
  （gzip の magic 判定は扉にある）、`tests/weather-warnings-checks` #R288 ②・R290 ③（`loadData(ADM1_URL)`）、
  `tests/atlas-50-remainder-checks`（地名表を warm する前に扉を import する——アプリと同じ）。
- 段 1: `check:static`（`fetch-deadline` 台帳を下げた）・`check:engine`・`check:types`・`check:archfiles`・
  `check:surface`・`check:perf`・`check:assets`。段 2: `tests/r353.spec.js`（火山レイヤー）・`tests/r620.spec.js`
  （都市表の `coastKm`＝海岸線と地名表）が緑。

## 3. 続き（同じ作業の中で、承認を得て）

- **残っていた gzip の読み手 4 本も扉へ**: `js/ocean-currents-field.js`（`arrayBuffer`）・`js/outbreaks.js`
  （`load()` の取得部分だけ）・`js/volcano-intel.js`・`js/railways.js`（`getGz` が `loadData`）。classic script の
  3 本は呼び出しの時点で `window.IntMapDataDoor` を引く。`NOT_YET` は空になった。
- **`js/atlas-query.js` の火山表**も扉へ。これが `data/volcanoes_gvp.json` の 3 本目の読み手で、`new URL(...)` を
  変数に入れてから取得していたので ⑤b の綴りの網に掛かっていなかった。⚠ 検査が差し込み口に使っていた
  `D.fetchJSON` は Atlas のターンの取得器なので、差し込み口を `D.loadData` に分けた（アプリは束縛せず、扉が答える）。
  `tests/query-engine-checks` R747 と `tests/atlas-query-checks` R497 ② はそちらに差し込む。
- **発見規則を広げた**: 直接の取得＝リテラル・`fetch(new URL('data/…'))`・`data/` リテラルを含む式に束縛した名前
  （`const U = new URL('data/x', …)`・`const BASE = 'data/rail/'` → `fetch(BASE + k)`）。HEAD のソースに当てて、
  atlas-query の `url`・volcano-intel の `DETAIL_URL`・outbreaks の `DATA_URL`・railways の `BASE`・compare の
  リテラルを全部捕まえることを確かめ、⑤d で同じ形を固定した。
- **`js/world-packs.js` の `SUBDIV.world`** は失敗した Promise を会期中ずっと持っていた——`askWorldAdm1` は
  `worldAsked=false` で次を許すのに、memo が拒否済みの Promise を返し続け、読み直せる扉まで届かなかった。
  失敗時に memo から外す。⑥ が `worldAdm1` の出荷されたテキストを評価して、失敗 → 次の呼び出しが扉に届く →
  成功は保持、を確かめる。
- `js/net-health-live.js` の冒頭のコメント（「2 つが開く」）を現状に。
- 期限の無い `fetch()` はさらに 5 本減った（台帳 130 → 125）。
