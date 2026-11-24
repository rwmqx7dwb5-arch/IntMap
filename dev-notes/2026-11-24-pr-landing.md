---
title: 溜まった PR の着地: 棚卸しと、直列に通すしかなかった理由（PR を main へ届ける作業の記録）
date: 2026-11-24
internal: 製品の挙動は変えない。open PR の棚卸しと着地の結果を残す記録だけ
---

〈依頼〉 開発済みの能力が本番へ届いていないことが最大の欠落だったので、open の PR を MERGED まで届ける。
担当外（Atlas ループ・サーバ自律・データ網羅・globe・workspace の各セッション持ち）と公開保留の #157 には触れていない。

## 1. 棚卸しと結果（2026-11-24 時点）

| PR | 結果 | 備考 |
|---|---|---|
| #1280 #1281 #1282 #1289 #1299 #1303 #1308 #1310 #1319 #1322 #1332 #1335 #1340 #1358 | MERGED | 依存の根元から先に通した |
| #1313 #1279 | MERGED | #1313 が先、#1279 は作った主題のセッションと同じ branch に二重 push があり調整した |
| #1315 | MERGED | #1290 の上に積んだ PR。#1290 の実装一式を運んで入った |
| #1290 | 閉じた（統合済み） | #1315 の MERGED 後に main との差分が 0 ファイル。migration は main の `20261120125000_world_graph_id_history.sql` と byte 単位で同一だったので重ねなかった |
| #1316 #1345 #1346 #1343 #1314 #1318 | MERGED | 下の 2 の理由で 1 本ずつ直列に通した（#1343 と #1346 は先に他のセッションが通した） |
| #1304 #1336 | MERGED | MCP は主題を持つ別セッション（local_94419f83）が着地させた。同じ branch への二重 push を避けて手放した |
| #1361 #1296 | 閉じた（置き換え済み） | リポジトリ所有者が #1380 / #1337 の置き換えとして閉じた。能力が失われないことを確認した |
| #1321 | 閉じた（merge 不可） | 別のセッションが閉じた。main のルールセットに `code_scanning` があり CodeQL の結果が全 PR に必須。Security の PR 起動を絞る変更は CodeQL を PR で走らせなくし、チェックが全部緑でも BLOCKED になる（本当の原因。base の古さではなかった）。ルールセットを緩めると PR 上の検出が無くなる弱体化なので閉じた。CI の待ち時間は別の手段で扱う |

## 2. 詰まりの原因（実測）

1. **キューの滞留** — Actions の待ちが数十本。本体 CI 1 周が 1〜2 時間で、push のたびに最後尾へ戻る。
2. **main が CI より速く進む** — 10 分〜1.5 時間ごとに進み、CI が走り切る前に PR が DIRTY になる。DIRTY の PR は merge-ref の CI が走らない。
3. **生成物が毎回 conflict** — 能力表（`js/atlas-capabilities.js`）、各台帳（governance・connection・device-storage）、org pages、
   global-surface、文書中の能力数。手で解かず main 側を採り、生成器で作り直すのが唯一の安定した解き方だった。
   `js/locales/pages.*.js` は CRLF の blob で、普通に add すると全行が LF になり全体が conflict に見える（`hash-object --no-filters` で CRLF のまま取り込む）。
4. **perf 天井の漂流** — 能力が増えるたびに `atlas-cap-runs` などが数 kB ずつ超える。merge で天井が main の値へ戻り、同じ行を各 PR が個別に上げ直した。
   main 自体は天井内（Perf ceiling workflow は success）で、赤は各 PR が実際に増やした分だった。
5. **同じ PR を複数セッションが同時に push** — CI が取り消され、non-fast-forward で担当 agent の push が拒否されることがあった（#1279 #1304 #1316 #1290）。
6. **`supabase/config.toml` の重複テーブル** — conflict 解消で `[functions.<name>]` が二重になり Migrations が赤になった（#1316）。
7. **migration の時刻順** — migration は main の最新より新しくなければならない（#1290 の改名）。pgTAP の plan も merge で落ちる（#1290 は 156→158）。
8. **文書の能力数** — main が能力を足すたび 4 文書（`DECISIONS.md` `PRODUCT.md` `docs/FILES.md` `docs/architecture/02-features.md`）がずれて `check:docs` が赤になる。

## 3. 採った運用（効いたもの）

- 依存の根元から 1 本ずつ直列。push した後は CI が走り切るまで main を取り込み直さない。
- DIRTY のときと、名指しの赤ゲートがあるときだけ push する（赤の中身が分かれば、その門だけを単独で再現して直す）。
- 生成物の conflict は手で解かず、main 側を採って生成器で再生成する。
- perf は取り込み後の tree を build し、`perf-budget --update` を 1 回。拒否されたときは CI の実測を目安に、超過した行だけ手で上げる（正しい値は CI の実測）。
- `clean` なのに auto-merge が外れていたら `gh pr merge <N> --squash --delete-branch --repo ...` で直接 merge する。
- 他のセッションの branch へ重ねて push しない。拒否されたら force せず、自分の版を捨てる。

## 4. 未解決・次に直すもの

- **main の前進が CI より速い構造** — 直列でも追い越される。merge train（#1371 / #1372）は別セッションが扱っていて、#1372 は merge されずに閉じた。
- **CodeQL が必須チェック** — 「Security は必須チェックではない」とした dev-notes の判断は `required_status_checks` の 4 件しか見ていなかった。ルールセットの `code_scanning` が漏れていた。
- **R568 ⑥（`radiation-plume`）** — CI でだけ間欠的に落ちる。ローカルでは再現せず、別のタスクとして切り出されている。
- **gpg の `Bad secret key`**（`security-audit-ci-checks` ⑦）— 1 回だけ出た。ローカルで再現せず、再発したら調べる。
- **#1314 の文言** — `intmap-atlas-work` の device-storage 行の開示文と、`js/atlas-cap-work.js` の英語キー「newly added」は判断を含む。
- **#1319** — 宣言されていない facet の数（228 件 / 3525 facet が 209 / 2484 と違う）。
- **#1358** — `mdCell` の backslash の扱いが変わった。
- **#1290 の perf 天井** — CI の実測に +1 kB で手設定した（ローカルで再現できなかった）。
