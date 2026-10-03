---
title: 放射拡散モデルの「答え合わせ」——2011 年の福島第一の実測沈着とセルごとに比べ、悪化したら落ちる門と、読者が見られる入口を足した（結果は良くない）
date: 2026-10-03
---

〈依頼〉「足し算。商品開発。全権を委任する。」放射拡散シミュレータは実測との突き合わせを持っていなかった
（science-instruments の記録 §6 が「福島のヒンドキャストはやっていない」と書いて残した項目）。

## 0. 測った（着手前）

| 何 | 結果 |
|---|---|
| 実測の公開データ | 文科省／規制委の航空機モニタリングの**生のセル値**は取れる形で公開されていない（`ramap.jmc.or.jp` は接続できず、`radioactivity.nra.go.jp` は SPA でデータ API が見えない）。**Zenodo に IRSN が編纂した 0.05° セル平均が CC BY 4.0 である**（Dumont Le Brazidec & Saunier 2022, 10.5281/zenodo.7016491・1,740 セル・88,469 バイト・md5 は Zenodo の公表値と一致）→ 再配布条件を満たすのでこれを同梱 |
| そのファイルの基準日 | **書いていない。** 利用論文（GMD 16:1039）の出典 MEXT/NRA 2012-09-28 資料（web.archive.org から取得）が地図を **2012-06-28 に減衰補正**と述べる。採用した日付は推定で、束の `asOfNote` が推定と述べる（影響は 4 % 未満） |
| 気象 | Open-Meteo の archive（ERA5・10/100 m）が 2011-03 を返す（CC BY 4.0）。内側 49 地点・外側 169 地点、657 kB（gz）で `tests/fixtures/` に固定 |
| 計算時間 | 20,000 粒子・336 時間の 1 回が約 6 秒。9 メンバー（3 種 × 放出量の幅）で 19 秒 |
| Zenodo | 既定の fetch の User-Agent は 403。名乗れば通る（ビルダに書いた） |

## 1. 作ったもの

- **`data/radiation-hindcast.json`**（69 kB）: 実測 1,740 セルと、同じセルのモデルの p10 / p50 / p90、条件、指標、出典・ライセンス・基準日（`GOVERNANCE` を値として宣言・DATA_SOURCES の行が `paidBy` で払う）。
- **`js/radiation-hindcast.js`**: 純粋関数（再グリッド＝質量をセルの面積で割る・p10/p50/p90・指標・描画用セルと比の色階）。ビルダ・門・パネルが同じ計算を使う。
- **`scripts/build-radiation-hindcast.mjs`**（取得・md5 照合・モデル実行・書き出し・`--offline`）・`scripts/radiation-hindcast-fetch-wind.mjs`・`scripts/radiation-hindcast-config.mjs`（条件の 1 か所）・`scripts/radiation-hindcast-lib.mjs`。
- **パネル「2011 年の答え合わせ」**（`js/sims.js`）: 実測／モデル／比の 3 枚を同じセルで描く。シミュレータ既存の十進の階調（`RAD.PLAIN_ZONES`）を使うので、日本の地図に政策の語は載らない。比の階の端は FAC2 と同じ ±0.3（係数 2）なので、「中立色」は「当たり」と一致する。
- **Atlas**: `radiation` に `hindcast: obs|model|ratio`（場所は要らない）。同じ入口 `IntMapRadiation.hindcast` を呼び、指標を答えに書く。
- **`tests/radiation-hindcast-checks.test.mjs`**（9 件・約 25 秒）: 実測側が欠損なく governed か／モデル側がプリセットそのままか／指標の算術（完全なモデルは満点・10 倍の誤差は +1）／再グリッドの質量保存／**門（記録より悪化したら赤）**／束の地図が今のモデルと一致／文書・science の節の数が束と一致／パネルと Atlas の入口。束の相関を 0.28 から 0.5 に書き換えると 3 件が赤になることを確かめた。
- 文書: `docs/RADIATION-MODEL.md` §10（正本）・`docs/RADIATION.md` §8・`docs/architecture/02-features.md`・`docs/FILES.md`、science の放射性プルーム節（en・jp）、出典ページの行（en・jp）。

## 2. 結果——モデルは 2011 年をうまく再現していない（記録した）

| 指標 | 値 |
|---|---|
| 相関（log10・Pearson） | 0.28（Spearman 0.20） |
| バイアス | −1.37（中央のセルで約 23 分の 1） |
| FAC2 / FAC5 | 10.5 % / 29.8 % |
| 実測が p10〜p90 の帯に入る | 9.9 % |
| モデルが 100 Bq/m² 未満のセル | 49.9 % |
| 空間の figure of merit | 0.17（100 kBq/m²）・0.19（1 MBq/m²） |
| 調査範囲に置かれた量 | 実測 2,672 TBq に対し 1,022 TBq（38 %）。置かれた全沈着の約 78 % は調査範囲の外 |

- **わかっていること**: プリセットは一定の速さで 120 時間放出する（実際の放出は山のある時系列）。`simulate` に時間変化する放出率の口が無い。
- **わかっていないこと**: 当たらない原因が放出の時系列か、0.25° の風と降水か、沈着の式か——切り分けていない。切り分けには放出の時系列を入れる必要があり、それは調整になる。推測を事実にしていない。
- 実測に合わせて放出量・高さ・時間を動かすことは**していない**（モデルの既定値の答え合わせであり、調整の評価ではない）。

## 3. 踏んだもの

- 局所の構文: ツール経由の文字列で `\'` が `'` になる事故が 3 回（`boot-stage.js` の why・`sims.js` の LL・`atlas-cap-sim.js` の doc）。`node --check` が全部拾った。
- `check:static` の output-taint: パネルを文字列連結（innerHTML）で組むとレジャーが 16 → 18 になる。**DOM で組んで**台帳を増やさずに済ませた（`fillHc`）。
- `check:i18n`: 配列の中の隣り合う 2 つの文字列は「隣接データの組」として数えられ（143 → 153）、同じ英語キーに 2 つの日本語がある衝突も 1 件出る（`Measured` が既存の `計測` と衝突）。呼び出しの中に置き、英語の綴りを変えて解消した。
- `check:surface`: `window.IntMapRadiation` の読みが 21 → 22（Atlas の `hindcast` 呼び出し）。**新しい辺として台帳（`tests/global-surface-baseline.json`）を更新した**——正本は `sims.js` が作る窓口で、`atlas-cap-sim.js` が他の読みと同じ形で読む。

## 4. やらなかったこと・残り

- 放出の時系列を持つ入口（`simulate` が時間変化する放出率を受け取る）。Terada ほか 2020 の時系列を入れれば、原因の切り分けと、公表された最良の再構成でのモデルの上限が測れる。入れるのは次の仕事（その結果はこの記録と別に残す）。
- 湿性沈着の寄与を降水の有無で割る診断（0.25° の降水が山地の沈着を決めるため）。
- 他の事故（チェルノブイリ）の答え合わせ。実測のセル値が出典付きで取れる形で見つかっていない。
- 検査: `check:datagov`・`check:static`・`check:i18n`・`check:docs`・`check:catalog`・`check:capabilities`・`check:archfiles`・`check:surface`・`check:perf`（build 後）・`check:assets` と新しい検査 9 件。`npm test` 全体は統合後に 1 回。
