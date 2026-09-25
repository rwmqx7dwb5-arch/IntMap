---
title: 多面的な監査——検証役が Claude Code から見えていなかった／原本の依存が lock から 14 件ずれていた／本番にだけある 2 版が migration の自動 push を全部拒ませていた／経路検索の 1 日の枠を 1 アドレスで使い切れた
date: 2026-09-26
---

〈依頼〉「IntMap, 様々な側面から監査し、すべてやりきって。全部任せる。」

観点を 6 つに分けて並列に測った: ①セキュリティ（Edge Functions・RLS・クライアントの注入経路・秘密）
②依存・CI・DB の設定 ③夜間 deep tier の赤 ④本番の検証と健康診断（前回までの未検証 PR を含む）
⑤エージェント環境そのもの ⑥本番スキーマと migrations の一致。この記録は**この PR で直したもの**を書く。
別の PR に分けたもの（起動時のレイヤー復元・フォーム部品の名前とモバイルの重なり・都市旧名ラベルの
式の作り直し）はそれぞれの記録にある。

## 0. 測った

- **Agent tool: `Agent type 'intmap-verifier' not found`。** `.claude/agents/intmap-verifier.md` は
  存在し、`check:agents` は緑。js-yaml で frontmatter を読むと `bad indentation of a mapping entry
  (2:201)`。description に「呼び出し側へ: … `model: "opus"` …」があり、引用符なしの YAML スカラーに
  `: ` が入って**YAML でなくなっていた**。Claude Code は読めない frontmatter を**黙って捨てる**。
  `check:agents` の読み手は YAML ではない自前の読み手なので、写しが正しいかしか見ていなかった。
- **原本の `node_modules` が `package-lock.json` と 14 件ずれていた**（`pdfjs-dist` 4.10.38 に対し lock は
  6.3.289、`js-yaml` 4.3.1 / 5.4.2、`@playwright/test` 1.61.1 / 1.63.0、`katex` 0.16 / 0.18 …）。
  全 worktree はこれを junction で借りるので、**このマシンのローカルの門は全部 CI と違う依存で走っていた**。
  `master-sync --sync` は `package-lock.json` を早送りするが、入っている木を動かすものが無かった
  （git の外のデータ集合は毎回配置しているのに、依存だけ抜けていた）。
- **`supabase db push --dry-run --linked`**: 「Remote migration versions not found in local migrations
  directory」。本番の履歴には別アプリ（mgmt）の 2 版 `20260722000000 mgmt` と `20260722120000 passkeys`
  がある。これがある限り CLI は**どの push も拒む**——`scripts/supabase-deploy.mjs` は secret が
  登録されていても全 migration で赤になる構造だった。
- **リポジトリ secret が 0 件**（`gh api …/actions/secrets` → `total_count: 0`）。DB の暗号化バックアップは
  `DORMANT` の notice を出して緑を返していた期間が長く、#731 以降は正しく赤。**一度も実行されたことがない。**
  Supabase deploy・Atlas eval も同じ理由で赤。値は利用者だけが持つので、最終報告で一括して依頼する。
- **`anon` が実行できる SECURITY DEFINER 関数**（`has_function_privilege` を本番で）: `monitor_limit_self()`・
  `monitor_mark_read(uuid)`（migration は authenticated にだけ grant）、`handle_new_user()`（トリガー関数）。
  `grant … to authenticated` は PUBLIC と Supabase の既定権限が与えた EXECUTE を取り消さない。
- **経路検索の中継**: ヘッダのコメントが「1 人の利用者は 1 日の 2% を超えて使えない」と述べていたが、
  それは **1 分あたり** の割合で、60 回/分なら 3,000/日の天井を 50 分で使い切る。1 つのアドレスが、
  その日の残り全員の経路検索を `spend_ceiling` にできた。
- **X-Forwarded-For の偽装**（監査役の「要確認」）: 本番の cable-geo に、許可リスト外の URL（上流に
  届かず 400 を返す経路）で 75 回ずつ。偽装ヘッダ付きの 75 回は 429 にならなかったが、続く素の 75 回は
  **11 回目で 429**——偽装した要求も本物のアドレスの枠を消費していた。**偽装では新しい枠を得られない**
  （プラットフォームが本物のアドレスを先頭に置く）。**この見立ては否定された。**
- **ニュースのリーダー**: `item.link`（フィード由来）を web モードの iframe `src`（sandbox
  `allow-same-origin allow-scripts`）と `href` に、属性用のエスケープ `escForReader` **だけ**で入れていた。
  URL の種別を見ていないので、`javascript:` のリンクが入れば IntMap の origin で動く。同じファイルの
  カードの「開く」ボタンは既に `IntMapSafe.url` を通していた。現状の出所（Google News RSS・GDELT）で
  攻撃者が値を入れる経路は確認できていないが、判定は値の出所ではなく sink でするもの。
- **dependabot**: npm の 1 グループ「dev-dependencies」が `'*'` を全更新種別で束ねていたので、#750 は
  maplibre-gl 5→6（#R158 から意図して固定）・@turf/* 6→7・vite 6→8 を、patch 水準の supabase-js と
  **同じ PR** で運んでいた。vite 8 で build が壊れ、PR ごと赤——**全ての minor/patch 更新（セキュリティ修正を
  含む）が、誰も決めていない移行の後ろで止まっていた**。#208（Actions）は 8/20 から衝突したまま、中身は
  別 PR で既に main に入っていた。`atlas-eval.yml`・`supabase-deploy.yml` だけが古いピン（checkout v4.4.0 等）。
- 夜間 deep tier: 4 晩連続の赤のうち決定的なのは `r318-atlas` R406 ②——#738 で `find` が async になったのに
  spec が Promise から `.matches` を読んでいた（製品は正常）。固定待ちの観測器（r159 R488・r160・r179）も
  直した。1916 年の時代切替の遅さは別 PR（`hist-city-label-epoch`）——**「10.6 MB の hist-eras.js の評価」
  という見立ては計測で否定された**（1916 年は CShapes の帯で hist-eras は読まれない。紀元前 200 年でも
  評価は 110 ms・0.9%）。最大の 1 回の long task は都市旧名ラベルの 1.2 MB の式の作り直しだった。

## 1. 直したもの（どれも事例ではなく、それを生んだ構造）

1. **`scripts/agent-sync.mjs`**: Claude Code の frontmatter の値は、裸の語でなければ YAML の二重引用
   スカラー（JSON 文字列）で書く。さらに門 `frontmatter-yaml` が、描いた agent と skill の frontmatter を
   **本物の YAML 読み手（js-yaml）で読み**、元の name と description が戻ることを要求する。変異検査
   （引用を外す）で `frontmatter-yaml` が赤になることを確かめた。
2. **`scripts/deps-fresh.mjs`（新規）＋ `master-sync`**: lock の各 `node_modules/…` の版とインストール済みの版を
   突き合わせる（その機械が取らない optional なプラットフォーム別パッケージは除く）。`--sync` は食い違う
   ときだけ `npm ci` し、再確認で一致しなければ成功を名乗らない。`--check`（＝`worktree status`）は警告する。
3. **空の migration 2 本**（`20260722000000_mgmt.sql`・`20260722120000_passkeys.sql`、`select 1;` のみ）で
   2 つの履歴を同じ一覧にした。`db push --dry-run` は今回の 1 本だけを push すると答えた。CLI の提案
   （`repair --status reverted`）は別アプリの記録を消すので採らない。
4. **`20260926090000_definer_execute_least_privilege.sql`** と pgTAP `11_definer_execute_test.sql`。規則は名前の
   一覧ではなくカタログに付けた: 「`anon` が呼べる SECURITY DEFINER 関数は、`anon` に効く RLS ポリシーが
   呼ぶものだけ」。本番で `begin … rollback` の試験適用をし、違反 0 件・ロールバック後は元どおりを確認。
5. **`routing-relay`**: 1 アドレスの 1 日の取り分（既定 = 全体の 1 日 ÷ `READERS_PER_ADDRESS` = 300、
   `ROUTING_RELAY_PER_IP_PER_DAY` で動かせる）を全体の桶より前に取る。呼び出し元の識別は
   `_shared/rate-limit.js` の `callerKey` 1 つにした（写しを消した）。
6. **`js/news-ui.js`**: リーダーの URL 属性 4 か所を `IntMapSafe.url` → `escForReader` の順にした。検査は
   「`escForReader` を URL 属性に使うなら `IntMapSafe.url` を包む」を js/ 全体に対して述べる。
7. **dependabot**: minor+patch を 1 グループ、major は個別 PR（Turf の 19 パッケージは 1 つのライブラリの
   1 リリースなので major も 1 グループ）。古い Action ピン 2 ファイルを他と同じ SHA に揃えた。
8. **夜間の観測器**: `r318-atlas`（await）、`r159` R488・`r160`・`r179`（固定待ちを状態待ちへ）。

## 2. 直さなかったもの（理由）

- **mgmt_* の 9 表**: 別アプリの持ち物で、`docs/SECURITY-ARCHITECTURE.md` §8 の 5 が「判断により据え置き」と
  記録済み。空の migration は版を揃えるだけで、表には触れない。
- **本番の索引名が migrations と違う**（`idx_*` と `*_idx`、`current_news` に同一定義の索引が 2 組）。全差分は
  `supabase db diff --linked` が要り、それは Docker が要る。Docker Desktop は起動時に自身の古いソケット
  ファイルで落ちた（この機械の既存の問題）ので、インストールには触れず閉じた。名前の比較だけで索引を
  付け替えるのは、定義の全体を見ずに本番を変えることになるので今回は測定の記録に留める。
- **ai-proxy に全体の支出上限が無い**（アカウントを量産すれば AI 費用が上限なく増える可能性）: 上限は
  Atlas の能力を削る判断と料金の判断を含むので、利用者に提案する。
- **fetch-relay の記事モードの DNS rebinding**: コード自身が「TOCTOU は塞げない」と記録している既知の穴。
- **MapLibre の critical（GHSA-jrc7-96c5-q579）**: #747 が到達経路を地図の生成口で閉じ、5.24.0 に据え置いた。
- **CelesTrak**: fetch-relay 経由も直接も接続タイムアウト（上流）。衛星は同梱カタログへ正しく退避している。

## 3. 検査

`tests/multi-aspect-audit-checks.test.mjs`（① agent/skill の frontmatter を YAML として読む・description が
元と一致 ② deps-fresh が版違いと欠落を名指し、optional を名指さない・`--sync` が再インストールと再確認を
する ③ 1 アドレスでは 1 日を使い切れない（公開された数から）・取り分が全体の桶より前 ④ URL 属性の
`escForReader` が `IntMapSafe.url` を包む）、`tests/r801-relay-spend-checks.test.mjs` を 4 つの桶の順序に更新、
pgTAP `supabase/tests/11_definer_execute_test.sql`。
