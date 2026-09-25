---
title: find_capability は綴りしか見ていなかった。意味検索を足して語彙検索と融合し、引けなかったときはそう述べる
date: 2026-09-25
---

〈#R802 の続き。能力 145 のうち 134 は `find_capability` の先にしか無い。#R802 は語彙の照合を綴りの範囲で
直せるだけ直したが、**同じことを別の言葉で言う要求**は綴りの外にある〉

### 0. 実測（このチェックアウト・変更前）

| 問い合わせ | 語彙検索の答え |
|---|---|
| 「現在地」 | `navigation.camera`・`routing.isochrone`・`map.radius`・**`view.locate` が 4 位**——`self` は 4 つとも 3 点で、同点を決めていたのは `a.id.localeCompare(b.id)`（綴りのアルファベット順） |
| 「地図を現代に戻す」 | **0 件**（`time.travel {"now":true}` がまさにそれ） |
| 「ありがとう」 | 0 件（正しい。#R745・#R802 ③） |

### 1. 直したもの

- **B. 同点を綴りで決めない**（`js/atlas-capabilities.js`）。順序は `self` → 得点 → **証拠の数**
  （要求の別々の語が何個その能力を指したか）。それでも等しい行は**同じ `rank` を持つ宣言された同点**として返す。
  `tests/r413` ⑪ⓓ は「現在の search の先頭 8 件」で旧欠陥を再現していたので、旧い並べ方（得点→綴り）を
  その場で当て直す形に書き換え、今日の答えが同点を宣言していることも足した。
- **A. 意味検索を足して融合する（`searchFused`）。語彙検索は消していない。**
  - Edge Function **`atlas-embed`**（新規・`verify_jwt` あり＋関数内でも呼び出し元を解決）。問い合わせは毎回
    OpenAI の埋め込み（既定 `text-embedding-3-small`、鍵は ai-proxy と同じ `OPENAI_API_KEY`）にして保存しない。
    能力側は `atlas_capability_vectors`（migration `20260925120000_atlas_capability_vectors.sql`）に
    **カタログ本文の SHA-256** を鍵に 1 回だけ埋める。鍵は**サーバが受け取った本文から計算し直す**ので、他人の
    本文を自分の鍵に登録できず、カタログが変われば鍵が変わって作り直しになる。類似度は pgvector で**全能力ぶん**。
    未知のカタログへの検索は**問い合わせを埋める前に** `catalog_unknown` を返し、ページが裏で 1 回だけ送る。
  - 流量: `_shared/rate-limit.js` の共有バケツを配った（写していない）——利用者ごと 1 分 30・利用者ごとの
    seed 1 時間 4・プロジェクト全体 1 日 20,000 単位。全部 fail-closed。
  - **近いことは一致ではない**: 候補は、その問い合わせ自身の類似度分布で**頑健 z が Φ⁻¹(1 − α/n)** を超えた
    能力だけ（α = 0.05・n = 144 で約 3.39）。⚠ 正規近似は**推定**で、本番の類似度はまだ 1 件も測っていない。
    結果が `semantic.threshold` と各行の `z` を持つので、最初の本番の問い合わせが測定になる。
  - 融合は **RRF（K = 60）**。⚠ 語彙側の順位は **`self` → 証拠の数**で付け、category hint を入れない——入れると
    「現在地」（`routing` の hint 語）で `routing.isochrone` が hint の +8 だけで語彙 1 位になり、意味で 1 位の
    `view.locate` を上回った（検査の偽の埋め込みで実測）。#R802 の「hint は順序を決めない」を融合にも運んだ。
  - **引けなかったことを 0 件と同じ答えにしない**: 未ログイン・関数の失敗・8 秒のタイムアウト・未知のカタログ
    では語彙だけで答え `basis:'lexical'`・`semantic:{state:'unavailable', reason}`。引けて何も立たなければ
    `basis:'lexical+semantic'`・`candidates:0`。同期の `search` は `semantic:{state:'not_consulted'}`。
- **E. プライバシー**（`js/legal-text.js` §4・en+jp）: 既存の文は送り先を「Anthropic／OpenAI／Google のいずれか」と
  書いていたが、埋め込みは**どの provider 設定でも OpenAI** に行く。何が（Atlas が依頼から書いた短い検索語）・
  何のために・何を保存するか（IntMap 自身の説明文のベクトルだけ）を足した。改定日 2026-09-25。
- **D.** pgTAP `supabase/tests/10_atlas_capability_vectors_test.sql`（面・権限・seed の全部か無しか・冪等・
  余弦・掃除）。**C.** `tests/atlas-semantic-search-checks.test.mjs`（決定的な偽の埋め込みで融合を評価し、
  Edge Function を `Deno.serve`／`fetch` を差し替えて実際に評価する）。

- **本数をテストに写さない。** 関数を 1 本足しただけで `tests/r403`（「17 本」«seventeen»「15本」）と `tests/r699` ⑦（「17 本」）が
  赤になった——文書の文を**数の綴りで探していた**から。数は `tests/helpers/edge-functions.mjs` が `supabase/config.toml`
  の `[functions.*]` と `_shared/relay-guard.js` の import から毎回数え、変異は「1 本少ない」にした。文書の数が
  正しいかは `check:docs`（doc-facts）の仕事で、テストは文を見つけるだけ（[[intmap-gate-universe-decided-by-spelling]]）。
  `supabase/tests/00_structure_test.sql` の 2 つの表一覧に `atlas_capability_vectors` を足した（`plan` 92→94）。

### 2. ⚠ 残っているもの

- ⚠⚠ **Atlas にはまだ届いていない。** `find_capability` の `find`（`js/atlas-toolsurface.js`）は同期の
  `search` を呼んでいる。`await CAPS.searchFused(query, { want: 3, min: 1 })` に替え、空振りの文を
  `semantic.state` で言い分けるのは toolsurface の担当。
- ⚠⚠ **この鍵が埋め込みモデルに届くかは未確認。** `news-ingest` は 2026-08-24 に `text-embedding-3-small` で
  403 `model_not_found` を実測している（`Architecture.md` の news-ingest の段）。届かなければ `atlas-embed` は
  `model_unavailable` を返し、検索は語彙だけで答えて**そう述べる**。
- 埋め込みの呼び出しは `news-ingest/index.ts` の `embedBatch` と同じ形をもう 1 つ持っている（`_shared` へ寄せる余地）。
