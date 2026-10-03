---
title: 16 本の機能 branch を 1 本の統合 branch に重ねる——単独では緑だった変更が組み合わせで壊した箇所を、検査を弱めずに根本で直す
date: 2026-10-03
---

〈依頼〉 origin/main に 16 本の機能 branch（atlas-core-split, delivery-quality, first-impression, search-identity,
showcase-gallery, place-dossier, map-postcard, map-layer-system, hist-coverage, science-instruments,
news-intelligence, atlas-os, shell-experience, companies-elections-live, marketing-engine, sales-channels）を
この順で merge した統合 branch `feat/wave-train` の赤を全部消す。検査は弱めない。

## 0. 衝突の解き方（merge の時点）

- 能力数を述べる文書: 数字以外が同じ行は 1 行にまとめ、数は下の §2 で実数に直した。
- `js/legal-text.js`: 段落ごとに追記を含む側を採るか、両方を残した。
- `js/atlas-cap-system.js`: 両方の追記を統合した（diagnose は Atlas 自身の自己診断と状態ページの両方を運ぶ）。
- `js/time-borders.js`: `tagSame` と `recordOf` の両方を残した。
- `tests/layer-descriptor-checks.test.mjs`: 発見型にし、除くのは 2 要素の組だけにした。
- `data/governance-ledger.json`: ours を採ってから `node scripts/data-governance.mjs --update`。

## 1. 組み合わせで壊れていたもの（どれも片方の branch だけでは見えない）

| 何が | なぜ壊れたか | 直し方 |
|---|---|---|
| `scripts/worktree.mjs` が構文エラー（`check:static`） | delivery-quality と shell-experience が同じ位置に関数を足し、自動合流が `atlasEval()` の閉じ括弧と改行を落とした | 閉じ括弧と改行を戻した（両方の追記は残す） |
| migration 3 本が main より古い時刻 | 各 branch が分岐元の main で「次」の時刻を取った。main には既に `20261003130000`・`140000` が在り、本番の `db push` は古い時刻を拒む（`scripts/migration-order.mjs`） | `org_inquiries` → `20261003150000`、`news_intelligence` → `160000`、`atlas_notebook` → `170000`（元の相対順を保つ）。参照する文書・コード・検査も同じ名前へ |
| 口座の台帳に 2 表の文が無い | account-data-center（main）は「アカウントが所有する表には `account_data_catalog` の文が要る」を pgTAP 23 と `tests/platform-backend-checks.test.mjs` で守る。`org_inquiries.user_id` と `atlas_notebook_entries.user_id` は `auth.users` を参照するので発見されるが、両 branch は台帳を知らなかった | 各 migration の末尾に en+jp の文を 1 行ずつ（`on conflict` で冪等）。改番で台帳の表より後に適用されるので書ける |
| `supabase/tests/00_structure_test.sql` | 各 branch が main の値に自分の表を足し、合流で配列の要素の間のカンマが落ちていた（SQL 構文エラー） | カンマを戻し、表 44 個 × 2 リスト。`plan(112)`＝main の 104 ＋ 新しい 4 表 × 2 |
| `tests/atlas-os-checks.test.mjs` ⑬ | atlas-os は「ai-proxy は消費の前に 401 を返す」を `index.ts` の `Deno.serve(` から読んでいた。atlas-core-split はその本体を `ask.ts` へ移し、`index.ts` は経路表になった | 検査が POST の経路表から handler とその import 先を辿る。名前を写さない |
| `tests/event-bus-checks.test.mjs` ③ | event-bus（main）は「宣言の無い発火を拒む」。place-dossier と showcase-gallery は `MAP_ANSWER_EVENT` を `window.dispatchEvent` で直に投げていた | 2 か所を `bus.emit` へ移し、`js/bus.js` の `from` に 2 ファイルを足した（`pending` には入れない＝裸の DOM 呼び出しは残っていない） |
| `tests/generated-file-merge-driver-checks.test.mjs` ⑥ | sales-channels の生成物 11 ページ（`scripts/org-pages.mjs`）が `.gitattributes` の合流規則に無い | 11 行を `regen`（`scripts/org-pages.mjs --write`）で宣言 |
| `tests/hazard-other-build-and-gate-checks.test.mjs` #R218 ⑨ | sales-channels が独立ページの一覧を発見型（`standalonePages`）にし、検査は 5 つの名前の並びを綴りで探していた | 検査は「走査が発見を回す」と「発見が元の 5 ページを含み index.html を含まない」を測る |
| `tests/output-taint-gate-checks.test.mjs` ⑦ | 同じ発見型化で、契約ページの宣言（`contact.html` など）が markup に入った。検査の probe は markup を index.html だけで組み直していたので、それらの宣言を失って赤 | probe の markup も同じ発見（index.html ＋ 独立ページ）から組む |
| `tests/shell-i18n-audits-checks.test.mjs` #R249 ③ | 組織向けページが `scripts/i18n-doc-audit.mjs` の計測にも除外にも無かった | 除外を `scripts/org-pages.mjs` の `PAGES` と `ADMIN_PAGE` から導出（言語別の静的ページ／運営者の画面という理由つき） |
| `tests/suite-hygiene-checks.test.mjs` R400 ① | news-intelligence が遅延モジュール `newsIntel` を足し、`tests/r209.spec.js` の MEMBER に行が無かった | `newsIntel: ['__imNewsIntel', 'toggle']`（js/news-pulse.js が層の行から呼ぶ扉） |
| `check:i18n`（属性） | `js/admin-inquiries.js` の placeholder 2 つが英語の直書き | 説明をラベルの本文へ移し placeholder を外した（運営者専用ページで、情報は減らしていない） |

## 2. 件数（`npm run check:docs`）

能力 178（撤去 1・到達可能 177）。deep tier 132 本・全体 138 本 / 80.6 分（`node scripts/test-budget.mjs` の実測）。
DECISIONS.md・docs/FILES.md・docs/TESTING.md・package.json・scripts/worktree.mjs の数を実数へ。

## 3. 性能予算

`npm run build` のあとの `check:perf` は各 branch が main の天井から個別に上げた分の和で超える
（理由は各 branch の記録: atlas-os・companies-elections-live・map-layer-system・map-postcard・hist-coverage・
news-intelligence・first-impression・marketing-engine・event-bus）。超えた行（この木の build）:

- eager.raw 4703.9 kB（天井 4652.9）・eager.gzip 1551.0（1531.9）・eager.brotli 1170.1（1155.8）
- eager.cssRaw 377.6（372.4）・eager.cssGzip 62.2（60.1）
- async.raw 11866.4（11606.5）・async.gzip 3917.3（3816.8）・async chunk "atlas-console" 1258.1（1169.3）
- dist.total 839061.3（834629.4）・dist.assets 19119.9（18794.1）

⚠ `node scripts/perf-budget.mjs --update` は「origin/main がこの branch に無い commit を 4 本持つ」ので拒否した
（CI が測るのは main との合流後の木）。main を取り込んで build し直してから `--update` する。

## 4. 残っていること

- pgTAP（00・18・21〜23）はこのマシンに Docker が無くローカルでは走らせていない。CI の DB job が走らせる。
- 本番適用: migration 3 本（改番後の名前）を `supabase db push`。

## 統合後の性能予算（origin/main を取り込んだ後の build）

超えた行だけ `--update` で上げた（各行の増えた理由は、その行を増やした branch の dev-notes にある）:
- eager.raw: 4652.9 kB → 4703.7 kB
- eager.gzip: 1531.9 kB → 1550.7 kB
- eager.brotli: 1155.8 kB → 1170.1 kB
- eager.cssRaw: 372.4 kB → 377.6 kB
- eager.cssGzip: 60.1 kB → 62.2 kB
- async.raw: 11606.5 kB → 11866.2 kB
- async.gzip: 3816.8 kB → 3917.3 kB
- async chunk "atlas-console": 1169.3 kB → 1258.1 kB
- dist.total: 834629.4 kB → 839060.6 kB
- dist.assets: 18794.1 kB → 19119.4 kB
