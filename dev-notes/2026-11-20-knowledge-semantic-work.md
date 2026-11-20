---
title: 知識層を実際の仕事へつなぎ、複数 AI の結果を「並べてよいか」まで観測し、Skills に利用可否の観測を足す
date: 2026-11-20
newsen: Settings has a new row, Atlas knowledge: off, kept on this device only, or also in your account. Atlas can now re-check the sources of what it kept, and shows how old it is.
newsjp: 設定に「Atlas の知識」の行が加わりました。オフ・この端末にだけ保存・アカウントにも保存から選べます。Atlas は残した知識の出典を再確認でき、どれだけ古いかも示します。
---

〈依頼〉 監査 P1: ① #1280 の知識層が後の分析で使われ、出典を再確認でき、時間で古くなり、世界グラフと結ばれ、アカウントと設定画面に届くこと。② #1283 の結果統合が指標の比較可能性（単位・集計対象・期間・行政区域の変更）まで見て #1281 の Semantic Layer と結ぶこと。③ #1282 の Skills が必要なデータと計算の利用可否を調べること。モデルの判断は縛らず観測を渡す。

- ① 知識層: 主張に保存時の世界グラフの鍵を持たせ(`refKeys`)、別の綴りの質問から同じ対象へ届く(`js/atlas-knowledge-identity.js`)。`recheckAfterDays`/`standing`/`due` で時間を表示（時間では消さない）。`knowledge.recheck` が出典の再確認結果を記録（gone が全出典なら verified を外す。unreachable は何も変えない）。アカウント同期 `js/atlas-knowledge-sync.js` と `atlas_knowledge_claims`（owner-only RLS・64 KiB/行・20 MiB/アカウント=判断であって実測ではない）、設定画面の行（`js/atlas-knowledge-prefs.js`、オフ/端末/アカウント）。#1280 の CI 赤の一因だった `intmap_atlas_knowledge` の端末ストレージ台帳の行も足した。
- ② `js/atlas-fact-comparability.js`: 2 つ以上の子が述べた行に、単位(単位カーネルの判定)・範囲・境界の基準・期間・集計の同異と、列を名指した事実の Semantic Layer `comparable()`、対象の紐/有効期間が値の期間内に始まった・終わったか(`world-graph-store.tiesOf`)を観測として添える。status は変えず、判定もしない。述べていない面は `unstated`/`partial` で、`same` と読まない。
- ③ `skillReadiness`: skill が使う能力(登録・撤回・ネット要否)と宣言した `needs`(layer/dataset/runtime/login)を、ページが渡す probe に訊き available/unavailable/unobservable で返す。読めないものは「無い」ではない。何も拒否せず、skill 本文の隣に置く。
- 判断: 出典の Web 再読は IntMap が代行しない（任意 URL の中継は開いたプロキシになる）。読むのは Atlas の道具、記録とその規則がコード。
- 否定した見立て: 期間で自動失効（時間では何も消さない）。名前の別名表（同一性はグラフが言う）。
- 未了/注意: pgTAP はローカルで未実行（CI の migrations ジョブで確認）。#1280〜#1283 は未 merge のまま本ブランチに取り込んで積んでいる。
- 検査: `tests/knowledge-continuation-checks.test.mjs`、`tests/fact-comparability-checks.test.mjs`、`tests/atlas-skills-checks.test.mjs`（readiness）、`supabase/tests/53_atlas_knowledge_test.sql`。
