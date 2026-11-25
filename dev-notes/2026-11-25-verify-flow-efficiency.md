---
title: 実装後の検証・後始末の待ちを短くした（CI の臨界経路・push 前の検査・merge 後の再実行・status と USB）
date: 2026-11-25
internal: 開発工程だけの変更（CI・開発用スクリプト）で、読者に見える挙動は変わらない
---

〈依頼〉「CI が落ちるたびにフルでやり直すのは非効率」「マージ後にもう一度 CI があるのは意味があるのか」「CI 以外の本業後の検証・後始末も」。
見つける力は下げない。待ちの形を変える。

## 0. 測った（2026-11-25・直近 36 run のジョブ別/ステップ別）

| 対象 | 中央値 | 最大 | 備考 |
|---|---|---|---|
| Regression（3 台） | 876 秒 | 1,108 秒 | 1 台あたりの測定ファイル秒は 2,022〜2,347 で、最長 1 ファイル（history-admin-coverage-gate）が 626 秒 |
| Gates（3 台） | 495 秒 | 707 秒 | **build（中央値 309 秒）を待った後**。1 台は `check:assets` 1 本で 523 秒（台帳は 115 秒と信じていた）|
| build | 309 秒 | 390 秒 | うち Vite 236 秒 |
| Browser rest | 258 秒 | | |
| main の push 全体 | 17〜39 分 | | 後続の merge が前の run を待つ（pending は 1 本に置き換わる）|
| post-deploy smoke / Pages / server-ready 待ち | 183 / 42 / 39 秒 | | 公開後の確認として必要。短縮せず |
| `worktree.mjs status --brief`（SessionStart と終了処理）| **29.4 秒** | | 12 回の `gh` と 1 回の履歴走査が直列（各 1.1〜7 秒）|
| `worktree.mjs status` | **36.6 秒** | | 同上 |
| `master-sync.mjs --check` | 4.3 秒 | | |
| USB（未接続のため実測不能）| | | 読み方から、変わらないファイルを両パスで 4 回読む |

赤の内訳（36 run）: Regression 5・Gates 4・build 1・browser 1。1 本の PR が 4 回走ったうち 3 回はローカルで先に分かるもの。
直前の main の「失敗」（35feb77）は push の run ではなく **nightly の deep tier**（`workflow_dispatch`・Cesium/rest 8 台が失敗）で、merge の CI とは別物。

## 1. 変えたもの

1. **build を読まないゲートは build を待たない。** `gates`（35 本・3 台）は run と同時に始まり、build を読む `check:assets`/`check:perf` だけが `gates-build`（build の後）。`ci-gates.mjs --pool free|build`、`--check` が 2 つの pool の分割を検証。台帳 `.github/gate-cost.json` を実測に更新。
2. **`check:assets` を全コアで。** worker に分けた。実 `dist/`（原本の OneDrive）に対し旧実装と新実装の JSON が**バイト一致**（旧 30 分 55 秒 → 56.9 秒。どちらも同じ理由で exit 1＝古い dist なので）。
3. **Regression を 3 台 → 5 台。** 計画は任意の n の分割（`checks-shards.mjs --check --of 5`）。
4. **merge 後の再実行を、同一の木のときだけ省く。** PR の run が `static`・`checks-gate`・`browser-gate` 全部緑で `green-tree-<tree>` を残す（`green-receipt`）。main の push は `reuse` で同じ tree の受領証を探し、あれば Regression/Gates/Browser を `skipped`。**build と公開は常に走る**（公開するバイトは main の build）。aggregate は受領証があるときだけ skipped を通す。nightly・dispatch は `reuse` が常に false。
5. **`npm run preflight`**。差分から（⑴ 名指しするテスト ⑵ 到達するゲート ⑶ build とそれを読むゲート）を中身から導いて並列に走らせ、赤を全部出す。一覧は持たない。
6. **`worktree.mjs status`**: probe を並列プロセスに（キャッシュなし）。29.4 → 13.6 秒、36.6 → 14 秒、出力は同一。
7. **`backup-usb.ps1`**: ミラー段で内容一致を確認したファイルを検証段で再読しない（コピーしたファイルは両側を再読）。
8. skill `intmap-round` §4（preflight）・§5（main の CI）・§7（`verified` の重複を除去）。

## 2. 捕まえる力が同じである根拠

- 1・3: 各テスト/ゲートは同じ回数だけ走る（partition の検査が `--check` と `tests/verify-flow-efficiency-checks.test.mjs` ③⑤）。
- 2: 判定は（ファイル, コーパス）の純関数。新旧の出力 JSON（全 row・重複・孤児）が一致。
- 4: 同一の木で動く試験は同じ入力を読む。tree が違えば（main が動いた＝#1138/#1139 型）受領証が無く全部走る。**失うもの**: 同じ木でも時刻や上流の状態で結果が変わる試験の 2 度目の観測。夜間の全実行と、公開前の build・各 aggregate が残る。⚠ 受領証の寿命は 7 日（artifact の retention）。
- 6・7: 出力同一／検証の対象（書いたバイト）は変わらない。

## 3. できなかった・やらなかった

- **PR #1419 の赤を preflight で再現する検証**: 当該 PR の差分を取り直していない。preflight は「名指す」「到達する」を中身から導くので、build の規則（atlas-caps-split）・fixture の写真・perf の天井は build/テスト/ゲートとして選ばれる設計だが、再現は未実施。pgTAP の列一覧は Docker が要り、preflight からは見えない（CI のまま）。
- **build（Vite 236 秒）の生成ページのキャッシュ**: 歴史ページ・年ページ・国ページを入力の digest でキャッシュする案は、生成器の入力集合を調べきれておらず**入れていない**（polity card は既にキャッシュ済み）。入れる前に「同じ退行を捕まえる」の実測が要る。
- **USB の所要の実測**: ドライブ未接続（`RESULT skipped not-connected`）。
- ローカルの `check:static` は 280 秒かかる。preflight は「到達する」ときだけ入れる。
