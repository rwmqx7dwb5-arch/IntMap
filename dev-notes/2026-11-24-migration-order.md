---
title: 古い時刻の migration を足す PR を赤にする門を独立させ、base を取れないときは警告でなく赤にした
date: 2026-11-24
internal: 開発用ゲートの変更で、利用者に見える挙動は変わらない
---

〈依頼〉並行 PR が古い時刻の migration を後から main へ入れ、本番の `supabase db push` が `--include-all` 無しで拒み、
Supabase deploy と Pages の公開が止まった（6 本を手で適用して復旧）。これを PR の時点で赤にする。

## 0. 既にあった規則が効いていなかった理由
`check:static` の `migration-order` は base を PR では `HEAD^1` として読んだ。CI の checkout は深さ 1 なので `HEAD^1` は
無く、規則は「測れなかった」と**警告して通っていた**（観測できなかったことを成功と同じに扱う形）。改名・削除も見ていなかった。

## 1. 直したこと
- `scripts/migration-order.mjs` を門（`npm run check:migrationorder`）にした。判定は純関数 `analyze`: 「この branch が新規に足す
  migration の版 <= base 先端の最大版」なら赤。merge-base に在って branch に無いもの（削除・改名）、同じ版を名乗る 2 本も赤。
  一覧は持たず git の木とディレクトリから導出。赤のときは `git mv <旧> <新>` を出力（現在時刻と base 最新の遅いほうの後ろ）。
- base は `MIGRATION_BASE_REF` / `GITHUB_BASE_REF` / 既定 `main`。CI では base 先端を `git fetch --depth=1` で取り、**取れなければ赤**。
  main への push は比べる先が無いので通す。
- `check:static` 側の同じ規則は削除（二重実装）。引き継ぎは新しい門で、旧 `outOfOrder`/`stampOf` の export は旧テストのために残した。

## 2. 残る穴（隠さない）
PR が緑のあと、別の PR が新しい版で先に main へ入る競合は、その PR の CI が再実行されるまで見えない
（必須チェックが strict でないため）。この門は rebase 後・再実行時に必ず捕まえる。

## 3. 検査
`tests/migration-order-checks.test.mjs`（古い・新しい・同時刻・改名・削除・遅れた branch・複数の付け替え・重複・実 git の CLI）。
