---
title: 歴史データの先読みを起動から「過去へ行く意図」へ移す——デスクトップの全セッションが、年に触れなくても約 58 MB（非圧縮）の国境と行政区分の束を取得して main thread で parse していた。意図の信号を Chronos に 1 つ、先読みしてよいかの規則を mem-budget に 1 つ
date: 2026-09-29
---

〈依頼（承認済み）〉「デスクトップの全セッションが、歴史機能に触れなくても起動直後に約 55 MB の歴史データを
先読みして main thread で parse する」のをやめ、時代 UI の最初の利用（の意図）に結びつける。

## 0. 測った

- **先読みは 2 か所にあった。** `js/time-borders.js` の `warm`（地図の最初の idle＋400 ms／遅くとも 4 s →
  `requestIdleCallback(…,{timeout:6000})`）と `js/time-admin1.js` の `warm`（idle＋900 ms／6 s →
  `timeout:8000`）。どちらもデスクトップでは**毎セッション**走っていた。
- **何が取られていたか**（2026-09-29、この作業の spec が意図の直後に記録した要求。先読みの関数 `pf` は
  変えていないので、これが従来の起動時の要求と同じ集合である）。ディスク上のバイト（`ls -l`）と、
  ローカルの `scripts/serve.mjs` での転送バイト（Playwright `request.sizes().responseBodySize`）:

  | ファイル | ディスク | 転送（ローカル） |
  |---|---:|---:|
  | `data/cshapes.js` | 12,955,808 | 3,921,167 |
  | `data/border-coast.js` | 516,643 | 136,572 |
  | `data/histnames.json` | 215,382 | 72,054 |
  | `data/hist-admin1.js` | 41,457,871 | 11,218,612 |
  | `data/hist-kuni.js` | 1,821,885 | 341,204 |
  | `data/hist-admin-fill.js` | 1,002,157 | （spec の時間内に完了せず未計測） |
  | **計** | **57,969,746** | **≥ 15,689,609** |

  `data/hist-eras.js`（10,644,502）は `cshapes.js` の取得が**失敗したときだけ**の予備で、平常時は取られない。
  ⚠ 本番（GitHub Pages）の圧縮はローカルのサーバと同じとは限らないので、転送バイトはローカルの値として読むこと。
- **変更後、起動から 12 秒の間に `data/` から取られるもの**（同じ spec、1280×800、種つきセッション）:
  `gazetteer-world.json.gz`・`hdi-series.json`・`world-basemap.jpg`・`stars.bin` だけ。上の 6 本は 0 本。
- **註の「5.5 MB」は誤りだった。** `data/cshapes.js` は今日 12.96 MB（#R192 の実測時は 5.6 MB）。
  `js/time-admin1.js` の第 2 層「15.5 MB」も今日は 40.66 MB。書き直した註にはサイズを写さず、
  この記録を指した（`.agents/rules/no-ad-hoc-hardcoding.md` §4——写した数は必ず離れる）。
- **同じ規則が 2 か所に写されていた。** 「saveData／2g ならしない」「`deviceIsPhone(HOST.isMobile)` なら
  しない」が両ファイルに一字一句。

## 1. 直した

- **意図の信号を 1 つ**：`js/chronos.js` の `IntMapTime.intent(source)`／`onIntent(fn)`／`intended()`。
  1 回だけ立ち、あとから購読した者には即座に届く（読み込み順で先読みの有無が決まらない）。立てるのは
  - **時計そのもの**——`set` が今年より前の年を受けたとき（Atlas・共有リンク・セッション復元・パネルの
    スライダ・日付入力が全部ここを通るので、個別に「意図です」と言う必要が無い）。未来（予報・潮汐）と
    今年の中は数えない。
  - **時代 UI**——`data-time-intent` を宣言した要素の中での最初の `pointerdown`／`focusin`。カーネルは文書に
    capture リスナを 1 組置くだけでコントロールを名指さない。宣言しているのは Chronos ボタン
    `#ntl-toggle`（`index.html`）と凡例の年の行 `.dl-clockrow`（`js/data-layers.js`）。発火後リスナは外す。
    ⚠ パネル全体ではなくボタンに付けた——予報の凡例は `_imTimeMachineForecast` で同じパネルを「時刻」タブで
    開くので、パネル全体を意図にすると天気の利用者に歴史の束を配ることになる。そこから年へ動けば時計が立てる。
- **先読みしてよいかを 1 か所に**：`js/mem-budget.js` の `maySpeculate(fallback)`（と `connectionIsMetered()`）。
  Data Saver・2G・`slow-2g`・携帯（`deviceIsPhone`＝端末で訊く。`fallback` は殻が `_imPhoneClass` を
  公開する前の幅テスト）では false。両ファイルの写しを消し、これを読む。
- **両ファイルの `warm` は `IntMapTime.onIntent` への登録になった。** 意図のあとも `requestIdleCallback`
  （6 s／8 s の上限）で main thread の空きを待つ。第 2 層以下は従来どおり先読みしない。
- 実際に年を変えたときの読み込み（`IntMapTime.on` の購読者の `csLoad()`／`T1.load()`）は触っていない——
  先読みを控えて失うのは初回の待ちだけで、描画は失わない（spec が 1900 年の国境線を確かめる）。

## 2. 否定した見立て・選ばなかったもの

- **「非ライブへの初回遷移を全部意図とみなす」は採らなかった。** 潮汐のプレーヤは時計を未来へ、日付タブは
  数日前へ動かす。どちらも歴史の束を必要としない（国境は今年以降で消える）。境界は「今年より前の年」にした。
- **パネル（`#news-timeline`）全体に宣言する案**は上の予報の理由で採らなかった。
- **`check:perf` はこの変更を見ない。** 測っているのは eager のビルド成果物で、歴史の束は元から
  `<script>` の動的挿入なので「起動時の要求」には入っていなかった。起動時に取られなくなったことを
  測るのは新しい spec である。

## 3. 一覧の外に残したもの（報告のみ）

- 「saveData／2g」の同じ写しは他にも 5 か所ある（`js/app-body.js` ×2・`js/atlas-loader.js`・
  `js/countries-ui.js`・`js/data-layers.js`）。今回は歴史の 2 ファイルだけを `maySpeculate` に寄せた。
- `js/war-layer.js`／`js/war-geom.js` の註「`data/cshapes.js` は時代機能が読むので既に手元にある」は、
  起動時の先読みが無くなったので常には真でない（戦争レイヤーは自分で読むので挙動は正しい）。
- `js/time-admin1.js` の他の註にも古いサイズ（「10 MB」「15.5 MB」）が残る。

## 4. 検査

- `tests/history-prefetch-on-demand-checks.test.mjs`（評価して確かめる）: `intent` は 1 回・遅い購読者にも届く・
  過去の年は意図で未来・現在・今年は違う・`[data-time-intent]` の中の pointerdown/focusin だけが意図・
  カーネルはコントロールを名指さない・`maySpeculate` を Data Saver／2g／slow-2g／携帯（端末と fallback）で評価・
  両ファイルに規則の写しが無い・**出荷されている `warm` を取り出して走らせ**、評価時には何も取らず、
  意図のあとは idle 経由で取り、携帯／従量では取らず、第 2・3 層は取らない。
- `tests/history-prefetch-on-demand.spec.js`: デスクトップで起動し 12 秒（旧 warm の最遅開始 4 s＋6 s より長い）
  待って、Chronos ボタンが持ち込むファイルのどれも起動中に要求されていないこと、その中に
  `data/cshapes.js` と `data/hist-admin1.js` があること、1900 年で国境線が描かれること。
- 旧挙動の綴りを固定していた `tests/r192`・`r201`・`r530`・`r564` の各 checks は、同じ主張（電話／Data Saver で
  投機しない・第 2 層は投機しない・idle を待つ）を新しい形で述べるよう書き換えた（消していない）。
