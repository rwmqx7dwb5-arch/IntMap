---
title: Atlas のオーケストレーションを配線し直す——並列実行の事実を伝える・委譲を一般化し証拠を返す・能力の用途を一覧に載せる・意味検索を動かす
date: 2026-11-25
---

〈依頼〉調べもの以外も含め、独立した仕事は同時に進めること。オーケストレーションが実際の利用で機能していない状態を直す。
例の質問のための対応は足さない（全ての要求に効く配線だけ）。

## 1. 実測——部品はあるのに配線されていなかった（本番・2026-11-24〜25）

- 1 ターンのモデル往復は 4〜9 回で、ほぼ全ての返信が呼び出し 1 つ。1 回の返信の中の独立した呼び出しは**既に同時に実行される**
  （`js/atlas-agent.js` の footprint・`tests/atlas-turn-engine-checks.test.mjs` ②）のに、Atlas への指示（REPLY FORMAT）は
  「every call in one reply is run, **in order**」と実装の逆を述べていた。まとめる得が無いので、Atlas はまとめなかった。
- 委譲（`research.delegate`）: `ai_delegation_journal` が始まった 2026-11-19 以降、子の呼び出しは 0 件（拒否・失敗の行も 0）。
  サーバの委譲は既定 `independent` で有効。
- 永続ジョブ: `atlas_jobs` は 1 行だけ（他セッションの動作確認）。`atlas_knowledge_claims`・`atlas_notebook_entries` は 0 行。
- 能力の意味検索: `atlas_capability_vectors` が 0 行。OpenAI の鍵が埋め込みモデルに届かず（403）、atlas-embed は一度も動いていない。
- 11 月以降に足した能力 20 件はどれも基本の 13 道具に入らず、指示の `[WHAT INTMAP CAN DO]` に **id だけ**が並んでいた。
- 1 回の応答の中のホスト型 Web 検索は 1 本ずつ（6 本で 58 秒）。

## 2. 直したこと

1. **指示を実装に合わせた**（`js/atlas-console.js` REPLY FORMAT）: 同じ部分を変えない呼び出しは同時に走り、新しい返信はそのたびに
   モデルの往復になる——独立した仕事は 1 回の返信にまとめると待ちは一番遅い 1 本分。`DECISIONS.md` の「1 手の中の呼び出しは
   順に実行する」も実装に合わせた。検査は turn-engine ② の隣に「指示が ② と同じことを言う」を足した。
2. **委譲を一般化**（`js/atlas-cap-research.js` の説明・`js/atlas-job-core.js` の worker 指示と形・`js/atlas-delegate.js`）:
   種類を問わず独立した仕事を同時に任せられることを事実として書き、「単純な検索には使うな」等の縛りの文を消した。子は結論でなく
   **証拠**（出典・抜粋・日付・見つからなかったもの）を返し、出典と抜粋の揃った所見が無い子は「証拠なし」と報告される。
   `meta.delegated` が `notFound`・`evidence` を Atlas へ運ぶ。job-core の写しは `sync-atlas-job-core.mjs` で作り直した。
3. **能力の一覧に用途を 1 行**（`js/atlas-capabilities.js` `index()`）: 各能力の `find_capability` が返す説明文から自動で導く
   （手で書いた一覧は無い）。60 文字で切る。索引は 5,039 → 13,361 文字（キャッシュされる固定部分）。
4. **意味検索を動かす**（`supabase/functions/atlas-embed/`・新 `_shared/embedding-provider.js`）: 提供元のモデル一覧に訊き、
   鍵が届く埋め込みモデル（本番は Gemini `gemini-embedding-001`、1536 次元・正規化）を使う。能力側と問い合わせは必ず同じモデル
   （表の `model` が主キーの一部）。プライバシーポリシー §4（en / jp）と `docs/architecture/02-features.md`・`06-supabase.md` を更新。
   news-ingest は自前の写しを持ったまま——後で `_shared/embedding-provider.js` へ寄せられる。
5. **前回の二重を消した**（形式上の削除）: 前回足した「plan だけの返信」の注意は、`js/atlas-agent.js` が plan だけの返信に
   既に同じ注記を付けていた。何が引き継ぐか: その既存の注記。

## 3. 本番で確かめること

- `ai_delegation_journal` に `atlas_delegate` の行が現れるか、1 返信あたりの呼び出し数が増えモデル往復が減るか。
- `atlas_capability_vectors` に `gemini-embedding-001@1536/retrieval` の行ができるか。

## 4. 費用が上がったもの

- 遅延チャンク `atlas-console` 1,424,795 → 1,432,218 バイト、`atlas-cap-runs` 1,149,725 → 1,155,840 バイト（`tests/perf-baseline.json`）。
  能力の用途を導く `purposeOf()` と、指示・委譲の説明の追記の分。値は PR の CI がマージ後の木で測った 1398.6 kB / 1128.7 kB の
  丸めの上限（手元の build は時間切れで測れなかった）。
- `tests/atlas-embed-gemini-checks.test.mjs` が CI でだけ落ちた: 子プロセスが大きな JSON を書いた直後に `process.exit()` し、
  Linux の非同期パイプで 146 kB で切れていた（Windows は同期なので手元では緑）。書き終わってから終了するよう直した。
