# IntMap — 現状仕様書 §18 地域監視基盤 (Area Monitors)

> **現状仕様書の §18。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §18.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 18. 地域監視基盤 (Area Monitors)

⚠ **この機能には現在、利用者から到達できる入口が1つも無い。** タブ・ワークスペースのウィンドウ・
Atlas のどれからも開けず、Atlas は `FEATURE_WITHDRAWN` を返す（`PRODUCT.md` §3.4 が言う唯一の例外）。
**撤去であって削除ではない**——モジュール（`js/monitors.js`）・API（`window.IntMapMonitors`）・
その表示領域・Edge Function（`monitor-run`）・DB の 5 表・cron はすべて動いたまま残してある。

サーバー側が監視地域を定期実行し、**変化の有無はコードが判定し、AI は説明のみを書く**
（取得 → 正規化／重複排除 → スナップショット → 機械的 diff → change score → 閾値超過時のみ AI →
AI が引いた evidence ID をコードで検証 → 永続化）。⚠ **取得失敗は「変化なし」ではなく専用 status。**

**設計・DB・status 一覧・cron の SQL・復帰させるときに戻す入口の正本は
[`docs/AREA-MONITORS.md`](../AREA-MONITORS.md)。**
