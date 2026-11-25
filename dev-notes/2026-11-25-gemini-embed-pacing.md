---
title: 能力の索引を作る埋め込みを、同時に送る本数を抑え 429 を待って送り直す形にする
date: 2026-11-25
---

〈経緯〉#1412 で Gemini の埋め込みモデルが選ばれるようになった。本番で能力検索を走らせると（2026-11-25、OpenAI の残高
追加後）、検索は `catalog_unknown`（索引なし）を返し、索引を作る `seed` が `upstream_rate_limit`（Gemini の 429）で失敗した。
このモデルは 1 件ずつの `embedContent` しか挙げないので、150 件の説明文を一斉に 150 本送り、分あたりの回数制限に当たった。

## 直したこと

- `_shared/embedding-provider.js`: 1 件ずつの呼び出しは同時に最大 `EMBED_PARALLEL`（8）本。429 は観測された拒否として、
  提供元の `Retry-After`（無ければ倍々の待ち・最大 30 秒）だけ待って送り直し、回数を `retries` で返す。
  待ちが `EMBED_RETRY_DEADLINE_MS`（240 秒・Edge の壁時計 400 秒から書き込みの分を残す）を越えるなら 429 として失敗する。
- `js/atlas-capabilities.js`: ページが seed を待つ `SEED_TIMEOUT_MS` を 60 → 300 秒（サーバが終えてよい時間を捨てない）。
  待つ間も検索は綴りで答える。
- 検査 `tests/gemini-embed-pacing-checks.test.mjs`: 同時本数の上限・429 の待ちと回数・締め切りを越える待ちはしない。

## 同じ計測で確かめたこと（2026-11-25 本番）

REPLY FORMAT の訂正（#1406）の後、Atlas は 1 回の返信に呼び出しをまとめるようになった:
`set_time+find_capability×2` → `model_run×8` → `model_run×4+web_browse×2+web_render+find_capability`。
洪水予測モデル（`model.run`・GloFAS）を Atlas が自分で探して使った。
