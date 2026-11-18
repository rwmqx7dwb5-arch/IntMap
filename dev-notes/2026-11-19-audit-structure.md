---
title: 外部の構造監査を実物と照合して直した——到達可能性は探索で測る・GIS の循環を断つ・本番の方言で止まっていた管理者権限の migration
date: 2026-11-19
---

〈依頼〉 外部のアーキテクチャ監査（2026-11-19・main 4e7275f）を「できるだけ全部」。監査の主張を 1 つずつ実物で確かめ、本当だったものを直した。

## 0. 確かめた（実物との照合）
- **到達可能性が集合の所属で測られていた: 本当。** `scripts/js-reachability.mjs` の `isReachable` は `imported ∪ dyn ∪ sib` への所属。互いを import するだけの 2 モジュールは、入口から届かなくても通った（回帰検査に再現を置いた）。いまの js/ 521 本は探索でも 521 本すべて届く＝**既存の死んだコードは無かった**。
- **gis-core ↔ gis-runtime の循環: 本当。** 理由だった「js/ に読み手のない export は死んだコード」は、`export-readers` が名前で読むようになって解けていた。
- **本番の migration が止まっていた: 本当で、監査が見ていない原因があった。** 直前の dev-note（deploy-applied-migrations）は配備器の誤判定を直したが、そのあと run 44380412457 が**本物の失敗**で止まっている: 20261118130000 の書き換え規則が本番にしかない綴りを拾えず、末尾の検査が 7 本の policy で自分で拒んでいた（22 関数が未配備のまま）。`supabase db query --linked` で本番の `pg_policies` を**読み取りだけ**して確かめた。綴りは 3 種: ① `p.is_admin = true`（`AND (p.is_admin = true)`）② `auth.uid()` が包まれていない ③ `auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.is_admin = true)`。
- **PG 15 と 17 の差が原因という見立ては否定**: ローカルが通って本番だけ落ちたのは、バージョンでなく本番だけに存在するダッシュボード由来の policy のせい。
- **Atlas 本番評価が 30 回続けて止まっている: 本当。** 原因は repository secret `ATLAS_EVAL_REFRESH_TOKEN` と `ATLAS_EVAL_SECRET_WRITER` が無いこと（`gh secret list` に存在しない）。**利用者の資格情報が要るので、ここでは直せない**（AGENTS.md §7）。
- **27 名前空間という数: 監査自身が 26 に訂正している。**

## 1. 直したもの
- `isReachable` を**入口・worker・単独ページから静的 import・import()・再エクスポートを辿る探索**に。`reached` も返す。js/ 521 本の結果は変わらない。
- `gis-runtime.js` は `makeGisRuntimeOver(mountGis)` を出し、`gis-core.js` がそれを自分の `mountGis` に結んで `makeGisRuntime` として再エクスポートする。依存は gis-core → gis-runtime の一方向。外から見える `makeGisRuntime`（と `.externals/.contexts/.release/.serve/.attach/.workerSource`）・ブラウザ入口 `gisCore` は同じ。`mountGis` は読み手が無くなったので export をやめた。
- migration 20261118130000 の policy 書き換えを、デパーサの綴り（`uid_pat`・`flag_pat`）から組み立て直し、第 3 の形 `re_in` を足した。**本番の 35 policy に対して、書き換えと末尾の検査を同じ正規表現で `SELECT` だけで走らせた**: 21 本が一致し、検査に残るものは 0（ほかの 14 本は最初から `is_admin()`）。未適用の migration なので書き換えは履歴を壊さない。

## 2. 直していないもの（理由）
- **Pages の公開が Supabase 配備を待たない**: 順序を一本の処理へ寄せると監査自身の言う「巨大な 1 本」になる。`release-state.mjs` が差を検出しており、今回の本番停止はその検出が機能した例。互換性の契約（API 版・migration 順）を検証する設計は別の仕事。
- **`IM_HOST` の縮小・型の strict 化・`atlas-console.js`/`app-body.js` の分割**: 計測ずみの方針転換が要る大きな仕事で、1 回のパスで完了できない。
- **夜間 deep の連続赤（map-next・r530・r531）**: 退行の疑いは `nightly-blame` が #1150〜#1159 を指す。再現は別の主題。
- **`export-readers` が名前だけで読む件**: 同名 export の取り違えは理論上ありうる。いま偽陰性（本当は死んでいるのに通る）が実在するかは未測定——記録のみ。

## 3. 検査
`tests/audit-structure-checks.test.mjs`: ① 探索（循環する死んだ対・動的・worker・ページ・再エクスポート・この repo 全部）② gis の一方向 ③ migration の規則が本番の 5 つの綴りを拾う。
