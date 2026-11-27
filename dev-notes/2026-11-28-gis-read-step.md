---
title: 本番の多段分析がまだ通らなかった 2 つ——op の無い data.gis が「読む段」にならず一覧を返した／tick の秘密が本番に無くジョブが 30 秒で止まっていた
date: 2026-11-28
internal: 読者に見える変化は gis-result-handoff の更新情報が述べている。これはその経路が本番で最後まで通るようにする修正と設定
---

〈依頼〉gis-result-handoff の本番検証（2 回目・main f2eee80・atlas-jobs v33）。

**測った。**
- **ジョブ 1（日本の都市）。** Atlas は 1 段目 `read` を `{"inputs":["url:https://…"]}` と、`op` 無しで組んだ。ページの `data.gis` では、これは「取得だけをする段」の書き方。サーバの twin は `!a.op` を一覧の要求と読み、ファイルを読まずに演算一覧を返して `done` で終えた。2 段目 `filter` が受け取る地物が無く、`"read" is none of these` と、原因と違う理由で断った。ジョブは `partial`（この状態の付け方は正しく働いた）。
- **ジョブ 2（アフリカ）。** worker が `data.gis` を道具として直接呼んだ。`filter` は「177 件中 51 件」で、正解と合った。ただ、最初の時間枠を返したあと再開されず、`running` のまま止まった。
  - 本番の Vault に `atlas_jobs_secret` が無く、関数の秘密 `ATLAS_JOBS_SECRET` も無かった。
  - そのため、毎分の pg_cron tick は記録の残る全期間で 1 度も送っていなかった。自分自身への続きの要求も `not_configured` になる。
  - 秘密を作る手順は migration（20261123130000）の注記にあったが、実行されていなかった。

**直したこと。**
- `data.gis`（サーバ）は、`inputs` があって `op` が無ければ入力を**読む**。結果はその地物で、出典と `output` も付く。一覧を返すのは `describe` のときか、`op` も `inputs` も無いときだけ。
- runner は、地物を持たない入力も名前で twin に渡す。読む側は `input_has_no_features` で、前段が何を答えたかを名指して断る。
- 本番に `ATLAS_JOBS_SECRET`（関数の秘密）と Vault `atlas_jobs_secret` を設定した。乱数 32 バイトの同じ値を入れ、値はどこにも記録していない。これで tick と、関数が続きのために自分を呼ぶ要求が動く。

**検査。** `tests/gis-result-handoff-checks.test.mjs` に、本番で組まれたそのままのジョブを足した。`op` 無しの読み → 素の名前での絞り込みで、日本だけが POP_MAX ごと残り、出典も残る。さらに、地物の無い前段を読む段の拒否文と、`describe` が今も一覧を返すことを確かめる。

**残り（範囲外）。** worker の道具の答えは 6,000 字で切れる。切れた先を読む手段（`read_step` は入力にしか効かない）が無く、worker は `join` を 4 回に分けて回り道した。
