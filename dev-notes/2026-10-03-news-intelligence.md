---
title: 19,000 件の出来事を一覧の 200 件以外の角度から読む——国ごとのニュースの脈と国の日報・IODA の障害を同じ国のニュースの隣に・企業が出てくる出来事・取り込みの鮮度・embed を cron に
date: 2026-10-03
---

〈依頼〉「修正・穴埋めではなく構造改革とイノベーション…全権を委任する」の 1 本（分野: ニュース・世界の事象・
インターネットの健康・企業・選挙）。途中で追加: (a) 企業 × ニュース（`news_event_entities`）(b) embed 段を cron に
(c) 取り込みの健全性（「確認できなかった」と「死んでいる」を分ける）(d) インターネット障害の履歴とニュースの結び付け
（IODA のみ・規約を確かめてから）(e) ニュース・企業・選挙・ネット障害に共通する鮮度の部品。

## 0. 測った（着手前・本番・匿名鍵の読み取りだけ）

| 何 | 値 | 意味 |
|---|---|---|
| `news_events`（active） | **19,083 行**・2026-08-21 から・地点つき 17,435・地点の異なり 3,616 | ブラウザが読むのは「更新の新しい順 200 件」だけだった |
| 1 日の新しい出来事 | 300〜850（09-03〜10-02） | 30 日の集計は (地点, カテゴリ, 日) で 10,660 組——PostgREST の 1,000 行上限を超える |
| 代表地点の名前と位置 | 「Georgia」の点はアトランタ（3 件）とトビリシ近く（1 件） | 綴りで国を決めると誤る |
| 10 m 輪郭の外に落ちる都市 | コペンハーゲン・マイアミ・ヴェネツィア・ムンバイ・ヌーク・バンジュール・モンバサが 0.1〜1.9 km 外 | 海の点はその先（コタキナバル港 2.2 km・English Channel 2.5 km・Hormuz 22 km） |
| 企業名の照合（本番の記事 3,099 本） | 最初の規則で 160 件。Title Case の「GDP Target」「Huawei Target」、引用の「“Visa hopping”」が誤り | 単語 1 つの名前は大文字が意味を持つときだけ |
| 同（速度） | 名前ごとの正規表現 1,053 本 → **15.3 s**。最初の語の索引 → **0.24 s**（同じ 148 件） | Edge Function の CPU に収まる形へ |
| IODA `/v2/outages/events` | 直近 7 日の国の出来事 149 件・応答は「Copyright … All Rights Reserved」 | データの保存・再配布を許す条項は無い（UI リポジトリの LICENSE はソフトウェアの許諾）⇒ **蓄積しない** |
| `news_ingest_runs` | 運用者専用。`embed` 段の結果は run の記録に 1 列も残っていなかった | 「止まっている」を読者に言えない／embed の失敗が見えない |

## 1. 何を作ったか

1. **国ごとのニュースの脈**（レイヤー `dl-newspulse`）——国を 24 時間／3／7／14 日に新しく報じられた出来事の件数、
   または直前の期間からの増加（件数の差）で塗る。カテゴリで絞れる。**Chronos に従う**（`record`・`clockUntil`）。
   サーバーは `news_pulse()` が 1 つの jsonb、国への振り分けはブラウザの 10 m 輪郭（`COAST_KM = 2`）。
   地点の無い出来事・海上の出来事も数えて言う。
2. **国の日報**——件数と増減・30 日の棒グラフ・カテゴリ・報道の多い出来事（`news_events_at()` の行を
   `IntMapNewsEvents.openRow` が一覧と同じ詳細で開く）・同じ国の IODA の障害と前後 12／24 時間に報じられた出来事。
3. **企業が出てくる出来事**——`news-ingest` の `entities` 段（決定論・有料の要求なし）が `news_event_entities` を書き、
   企業パネルの「ニュース」タブが根拠の文つきで並べ、最寄りの拠点から出来事へ線を引く。
4. **取り込みの鮮度**——`news_ingest_health()`（本文なしの要約）＋ `js/freshness.js`（新しい／N 時間更新なし／
   確認できなかった／未確認）。News 一覧の上・凡例・日報が同じ部品を使う。企業・選挙の担当が使える形で配る。
5. **embed を cron に**（`news-ingest-tick`）と、run の記録に `embed_*`・`entities_*` を残す。
6. **Atlas**: `news.pulse` / `news.brief` / `news.outages` / `news.health` / `news.company`。

## 2. 否定した見立て・やらなかったこと

- **障害を News 一覧の項目にする**のはやめた。一覧の書き手は `js/news-feed.js` 1 つ（#R165）で、IODA は蓄積できない
  ——出来事の表に混ぜられない。障害は日報と Atlas に出る。
- 「件数が少ない国＝平穏」とは言わない。凡例・日報・Atlas の文が「報道が少ないだけのことがある」と言う。
- 照合で捕まえきれない形（「the Amazon rainforest」）は残る。行は根拠の文を持ち、読者は必ず文と一緒に見る。
- 海の名前の点が海岸に置かれている 3 件は、海岸の許容でその国に入る（同じ実測）。

## 3. 本番へ要るもの（このラウンドではデプロイしない）

- migration `20261003110000_news_intelligence.sql` の適用（関数 3・表 1・列 1・索引・cron の段の置き換え）。
- Edge Function `news-ingest` の配備（`entities` 段・記録の列）。
- ⚠ **embed は鍵が埋め込みモデルに届くまで 0 件**（2026-08-24 実測の 403 のまま）。`OPENAI_API_KEY` を届く鍵にするか
  `NEWS_EMBED_MODEL` を届くモデルに——コードは変えずに動き出す。それまで `news_ingest_health()` は embed を「失敗」と返す。

## 4. 検査

`tests/news-intelligence-checks.test.mjs`（12 件——出荷している関数を本番の点・本番の見出し・同梱の輪郭と名簿で評価）・
`supabase/tests/21_news_intelligence_test.sql`（pgTAP）・`00_structure_test.sql` に表を追加・
`tests/news-ingest-checks.test.mjs` の段の順序・`tests/layer-descriptor-checks.test.mjs` ①（写真の後に足された層は
「新しいファイル」として除いて比べる——写真に写った行は 1 バイトも動いていないことを引き続き測る）。

## 5. 起動と配る資産の費用（`check:perf`）——上げる理由

| 行 | 増え方 | 理由 |
|---|---|---|
| `eager.modules` | 306 → 307 | `js/news-pulse.js`（レイヤー行・名前・IntMapOS 命令・窓口だけ。命令は層が点く前から届かなければならない——`js/net-health.js` と同じ分け方） |
| `eager.cssRaw` | +6.6 kB | 鮮度の部品・凡例・国の日報・企業パネルの「ニュース」タブの規則（`css/intmap.css` 末尾） |
| `async.raw` / `async.gzip` | +58 kB / +32 kB | 遅延の本体 `news-intel`・`news-intel-core`・`freshness` |
| `atlas-console` | +18 kB | Atlas の 5 能力（項目は能力の正本で、カーネルのチャンクに入る） |
| `company-panel` | +3.2 kB | 「ニュース」タブ |

⚠ **測ってから直した 1 件**: 本体が `js/ne-countries.js` を静的に import すると、そのモジュールが main と遅延チャンクの
共有になり、Rolldown が `fetch-deadline` / `proxy-fetch` を main へ畳まなくなって **eager requests 9 → 11**
（`vite.config.js` が記録している循環の規則）。輪郭の読み込みは起動側の窓口 `IntMapNewsIntel.outlines` が渡す形に変え、9 に戻した。
origin/main へ rebase した木で `npm run build` → `node scripts/perf-budget.mjs --update`。上げたのは上の 6 行だけ（`atlas-console` 1134.1→1152.2 kB・`company-panel` 20.9→24.1 kB・`cssRaw` 365.8→372.4 kB・`async.gzip` 3774.0→3806.2 kB）。

## 6. 共有窓口（`check:surface`）——足した結合

- `window.IntMapNewsIntel`（起動時の窓口）と `window.__imNewsIntel`（遅延の本体が置く口）——`js/net-health.js` /
  `__imNetHealth` と同じ形。行と命令は層が点く前から届かなければならず、本体は遅延なので import では渡せない。
- 既存の口を読む回数が増えた: `IntMapNewsEvents`（`openRow`・`columns`・`health`）・`IntMapLazy`（遅延の取得）・
  `IntMapNetHealth`（`outageEvents`）・`IntMapCompanyData` / `IntMapCompanyPanel`（Atlas `news.company`）・`IntMapOS`
  （3 命令）・`IntMapSafe`・`_registerLayerOpacity` / `_hideGenericLegend` / `reorganizeLayerPanel`（凡例と行——
  `js/net-health.js` と同じ扉）。どれも遅延モジュールか、他の層と同じ登録の扉で、import に置き換えられる所有者の
  export はまだ無い。鮮度の部品は window に出さず import で配る。
