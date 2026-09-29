---
title: 期限の無い取得を取得層に載せる——共有の気象クライアントは 1 本止まると同じ URL の全員が待ち続けた。失敗の理由を返し、サムネイルは本体の取得関数を読み、素の fetch はファイルごとの台帳で増やせなくする
date: 2026-09-29
---

〈依頼〉監査で、`js/`・`src/`・`supabase/` の素の `fetch()` の多くが signal もタイムアウトも持たず、
期限つきヘルパ（`js/fetch-deadline.js`・`js/proxy-fetch.js` の `clockFor`）の採用率は約 2 割だった。
最重要は `js/wx-source.js` の `guardedJSON`。取得層の核を既存のものに決めて載せ替え、失敗と空を区別し、
二重実装を 1 本にし、増えないための門を足す。

## 0. 測った

- この回の計器（`scripts/fetch-deadlines.mjs`。options に `signal` を持たない大域 `fetch(` を構文木から数える）で
  **着手前 161 本 / 70 ファイル**（`js/` と `src/`）。監査の 159 との差は数え方（`window.fetch` と、
  `signal` を後から代入する形の扱い）。
- `guardedJSON`（呼び出し 15 か所、Atlas の `_fetchJSON` もここを通る）は `fetch(url,{cache:'no-store'})`
  に期限なし、しかも `inflight[url]` で同じ URL の呼び手に同じ promise を渡すので、**1 本止まると同じ URL
  の呼び手全員がセッション中ずっと待つ**。表の項目が消えるのは promise が決着したときだけで、決着しない。
  失敗は `.catch(()=>null)` で、「止まった」「断られた」「中身が無い」が同じ `null` だった。
- `js/layer-previews.js` の海底ケーブルのサムネイルは**相手先 → 自前 relay** の順（素の fetch）。本体
  `js/data-layers.js` は cable-relay-first で**逆順**にし、同梱データを先に読む。コメントは「本体と同じ 2 段」
  と言ったまま、写しの側が古くなっていた。RainViewer の索引も本体（`rvFetch`、時計つき）と別取得。

## 1. 直した

- **核は既存の 2 つ**（新しい層は作らない）。`js/fetch-deadline.js` の `readWithin`/`jsonWithin` が
  投げる例外に `reason`（`timeout`／`aborted`／`network`／`http`＋`status`／`parse`）を付けた。
  ⚠ `aborted` は**呼び手自身の signal**で、相手の失敗として報告しない（`one-pass-or-a-reason.md` §5）。
  例外オブジェクトはプラットフォームのものをそのまま返すので `e.name === 'AbortError'` の読み手は変わらない。
- **`guardedJSON` を載せ替え**: `readWithin` ＋ `clockFor(url)`（無音の時計）。束ねは残し、共有表の項目は
  **決着した瞬間か待つ者が 0 になった瞬間に**消える。`opts.signal` は**その呼び手の待ちだけ**を終わらせ、
  共有中の取得を中断するのは最後の 1 人が去ったときだけ。戻り値の意味（使えないなら `null`）は変えず、
  理由は `opts.note`（#R769 の `fetchViaProxy` と同じ契約）へ `reason`／`status`／`cached` を書く。
  Atlas の `_fetchJSON`（`js/atlas-deadlines.js`）はターンの signal と note を渡す。MET Norway の
  `metNo` も同じ時計に載せた（Open-Meteo が落ちたとき全ウィジェットが落ちる先なので、2 か所目の同じ穴）。
- ⚠ **新しい窓口 `window.IntMapFetchWithin`**（`jsonWithin`・`readWithin`・`clockFor`、`js/fetch-deadline.js` が置く）。
  `js/countries-ui.js` と `js/routing-ops.js` は node のハーネスが classic script として実行する（`tests/r453` ⑤ が
  「export を足さない」と明記、`tests/r184` #5 は script として parse）ので import 行を持てない。最初に import を
  足して 27 本を赤くし、`js/nominatim-gate.js` と同じ「ES export と window の両方」の流儀に切り替えた。
  `check:surface` の基準に 1 名足した（`--update`）。実体は 1 つで、写しではない。
- **静かに機能を殺していた所**を時計に載せ、失敗を既存のトーストで言う（文言は既存の翻訳済みの文を再利用、
  新規文言は無い）:
  - `js/countries-ui.js` `grab`（jsDelivr 3 段）: 止まると `countryDataPromise` が決着せず、#R40 の再試行にも
    届かなかった。全段失敗なら「Could not load country data — try again.」。
  - `js/routing-ops.js` 経路上の地震: 「取れなかった」と「0 件」が同じ `[]` だった。`quakesErr` を `lastAlong`
    と `state().along` に持たせ（標高・国境の `err` と同じ形）、トースト「Could not load earthquake data」。
  - `js/compare.js` のプレート・オーロラ・地震・過去の国境: `.catch(()=>{})` をやめ、失敗を言う。
  - `js/beta-overlays.js` の隣接年の先読み（先読みなので黙る。本読み `hbLoad` が報告する）、
    `js/precip-annual.js` の 2 つの manifest（失敗を言い、`state().manifestFail` に理由）、
    `js/map-ui.js` のティッカー `fjson`/`ftext`（段ごとに直接／relay の時計）。
- **二重実装を 1 本に**: `js/data-layers.js` が `layerReads` を export し、行の取得関数そのもの
  （`subcables` ＝ `fetchSubcables`、`radarIndex` ＝ `rvFetch`）を入れる。`js/layer-previews.js` のケーブルと
  雨雲レーダーのサムネイルはそれを呼び、取得路を持たない——順序が食い違うことが原理的に起きない。
  地震のサムネイル 2 つとオーロラのサムネイルは時計に載せた。
- **門**: `scripts/fetch-deadlines.mjs` をファイルごとの台帳 `tests/fetch-deadline-baseline.json` と両方向に
  照合する規則を `check:static` に足した（新しい `check:*` は足していない——`execution-strategy.md` の
  表に余白が無い）。**着手後 142 本 / 67 ファイル**。除外は理由の文つきの `EXEMPT` だけで、今日は 0 行。

## 1b. 時計がこのページ自身の凍結を数えていた（nightly の赤の原因）

nightly deep tier の最新の赤（`tests/restored-layer-before-style.spec.js:147`、`lyr-radar` が欠ける）を
repeat 5 で再現し、計器を付けて測った: 多くの層を復元するタブで解放直後にメインスレッドが **3.8〜30 秒**
止まり、その間 RainViewer は **0.2〜2.9 秒**で答えていた。d03a5c85 がレーダー索引に付けた 6 秒の期限は
`setTimeout(ms)` 1 本で、スレッドが戻った瞬間に（その後ろに並んでいた応答より先に）発火し、
「ホストが答えない」として `dl-radar` を外していた——観測器が成功を失敗と報告する形
（`.agents/rules/one-pass-or-a-reason.md` §2 ①）。d03a5c85 より前は期限が無く、遅くても描かれていた。

今回の `guardedJSON` も同じ時計に載るので、**時計そのもの**を直した: `js/fetch-deadline.js` の期限は
最大 250 ms の歩を数える鎖になり、凍結で遅れた歩も 1 歩としか数えない。最後の歩が凍結で遅れたときは
もう 1 歩待つ。検査 ⑥ がこれを測る（ホストは 150 ms で答え、期限 100 ms、ページが 400 ms 凍結——旧い
時計では赤、新しい時計では緑。本当に黙るホストは今も期限で終わる）。node の mock timers は 1 回の
`tick()` の中で予約された次のタイマーを走らせないので、① と `stalled-fetch-and-surface-gauge` ① は
1 ms ずつ進める形にした（主張は同じ）。

retry 側の赤（`:110`、CI 2 コアでの CPU 飢餓で `page.evaluate` 自体が 134 秒かかる）は環境要因で、
保留の門（`js/layer-rows.js`）が漏らしている証拠は無かった。MapLibre 6 移行が飢えを悪化させたかは、
このマシンでは移行の前後とも 5/5 失敗で測れていない。

## 2. 残したもの・選ばなかったもの

- ⚠ **オーロラは本体とサムネイルがまだ 2 本の取得**。本体の取得は `js/layer-packs.js` にあり、この回は
  別作業がそのファイルを触るので触っていない。サムネイルと比較ウィンドウは時計に載せただけ。
- `js/map-ui.js` の `ftext` は呼び手が 0 か所（死んだ関数）。削除は確認が要るので時計に載せるに留めた。
- 経路パネル（`js/routing-ui.js`）は `quakesErr` をまだ描かない（トーストと Atlas の状態には出る）。
- 台帳の残り 142 本は増やせなくしただけで、減らすのは次の作業。多いのは画像・blob を読むもの
  （`readWithin` はテキストしか返さない）と、ユーザー操作 1 回で 1 本の取得。
- signal を持つことは「必ず中断される」ことの証明ではない。門が保証するのは「終われない取得を黙って足せない」まで。

## 3. 検査

- `tests/fetch-deadline-layer-checks.test.mjs`（新規）: 出荷中の `js/wx-source.js` を stub の fetch と
  偽の時計で評価し、①締切で全員に `null` と `timeout`、表から消え、次は新しく取りに行く ①' 呼び手の signal は
  自分の待ちだけを終え、最後の 1 人のときだけ共有の取得を中断する ② `http`/`refused`/`parse`/`network` と、
  note を渡さない呼び手の戻り値が変わらないこと ③ 時計の例外の理由 ④ サムネイルが `layerReads` を呼び、
  自前の取得も URL も持たない ⑤ 台帳が木と一致し、本物のファイルに素の fetch を戻すと赤くなる（変異）。
  `guardedJSON` を素の fetch に戻す変異で ① の 2 本が赤くなることを確かめた。
- `tests/helpers/load-wx-source.mjs`（新規）: `fetchWithinFor(fetch)` は本物の `js/fetch-deadline.js` を stub の
  fetch のスコープで評価する。`js/wx-source.js` が import を持ったので `tests/r183` の評価器をここへ移し、
  国データのローダを実行する `tests/r375`・`tests/r423` のハーネスは `win.IntMapFetchWithin` をこれで与える
  （stub の応答に本文 `text` を足した）。`tests/r276` の正規表現は `guardedJSON(url, N, {…})` の第 3 引数を、
  `tests/r266` ⑧ は manifest を `jsonWithin` で読む綴りを受け付けるようにした（主張は「両方ともデータファイルから」のまま）。
- 関連する既存の node 検査（対象ファイルを名指す 179 本）を走らせ、上の修正後に赤かったもの（r184・r266・r375・
  r423・r424・r453）を個別に再実行して緑。r674 と check:docs ⑮ は 15 分の打ち切りで、並行実行時の待ち行列
  （単独での再実行結果は最終報告に書く）。
- `tests/i18n-coverage-floor.json`: 既存の翻訳済みの文を 7 か所で再利用したので de/es/ru の行数が
  7631 → 7638 に上がり、`--update-floor` で床を上げた（下げてはいない）。
