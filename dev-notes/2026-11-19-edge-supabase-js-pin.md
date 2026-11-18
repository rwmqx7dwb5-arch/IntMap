---
title: Edge Functions の supabase-js が文書の「ブラウザと同じ版」から 2 つ遅れていた——5 本の deno.json を package.json の厳密な版に揃え、ずれを検査が捕まえる
date: 2026-11-19
---

〈依頼〉 依存点検（2026-11）で見つかった唯一の「今すぐ直す点」。

## 0. 測った・確かめた
- `docs/SECURITY-ARCHITECTURE.md` は「functions の supabase-js はブラウザ側と同じ版（2.117.3）」と書いたが、`package.json` は 2.119.0、5 本の `supabase/functions/*/deno.json`（ai-proxy・delete-account・news-ingest・refresh-news・who-don）は 2.117.3 のままだった。
- 置いていかれた原因: Dependabot は `package.json` だけを見て、`deno.json` の `npm:` 指定は監視対象外。両者を結ぶ門も無かった。
- `npm:` / `jsr:` / https の import は supabase-js 以外に無い（esm.sh は撤去済み）。

## 1. 直したもの
- **正本は `package.json`**（ブラウザと同じ版であることが約束＝実装を文書の約束に合わせた）。5 本の `deno.json` を 2.119.0 へ。2.119.1 への更新は範囲外（別件）。
- `tests/security-logic.test.mjs` の「CDN を使わない」検査に、`deno.json` の各 import が `package.json` の同名依存と**同じ版か**の照合を足した。Dependabot が root だけ上げると赤になり、`deno.json` を上げ忘れた状態が main に入らない。
- 文書は版数の手書きをやめ「`package.json` の厳密な版」と述べる（SECURITY-ARCHITECTURE の 2 か所）。次に版が変わっても文書は偽にならない。

## 2. 引き継ぎ
- 関数の挙動: 2.117.3 → 2.119.0 は patch/minor 内。`x-client-info` の版は `ai-proxy-contract-run` が `<version>` に正規化済み。配備は merge 後の CI に任せる。
