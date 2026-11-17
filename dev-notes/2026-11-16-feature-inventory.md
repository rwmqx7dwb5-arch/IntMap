---
title: 機能の全容を実体から出す一覧——234 の能力のうち、Atlas を通さず画面から届くのは 157、ログイン時のみ 21、Atlas のみ 46、不明 10
date: 2026-11-16
internal: 開発用の計器と能力定義の欄で、利用者に見える挙動は変わらない
---

〈依頼〉「機能が増えすぎて全容把握が私にも不可能になってる」。条件は、一覧を新しい巨大な仕組みにしないこと、不明を正常と扱わないこと。

## 0. 測った

- `js/` 約 30 万行の内訳: コメント・空行 35%、翻訳表 11%、処理 54%（Atlas 以外 46%・Atlas 8%）。どこからも読まれないファイルは 0 本（`js-reachability.mjs`）。
- 能力表に載る能力は 234 個（撤去済みを除く）。ログインしていない読者がそれに届くかどうかは、どこにも記録されていなかった。`ui-atlas-converge` が数えていたのは、画面と Atlas が同じ OS コマンドに着く 2 件だけ。

## 1. 直したこと

- 能力の定義に `ui` 欄を足した（`js/atlas-caps.js`）。値は 4 通り: 画面の入口 `{ at: [selector] }`・ログイン時のみ `login: true`・キーだけ `{ key }`・入口なし `{ none: 日付 }`。**欄が無いものは「不明」で、届くものとして数えない。**
- 234 件の値は、3 体の調査役がハンドラを読んで出した証拠付きの判定から書いた。判断が割れた 10 件（map.choropleth・map.clear 系・map.drawLine/drawPolygon・map.pandemicDay・view.openShared・system.module/control・briefing.open）は欄を書かずに不明として残した。
- 案内の 4 件（navigation.stop/status/camera/voice）は、画面の操作部品はあるものの、案内を始められるのが Atlas だけなので「入口なし」にした。
- `scripts/feature-inventory.mjs` が、この欄と `tests/` から一覧を導出する。新しい台帳は作っていない。本番検証の列は、能力ごとの記録が存在しないため全行「不明」と書く。
- `check:capabilities` に検査 ㉔ `ui-entry-built` を足した。申告した入口のセレクタが名指す id・class・属性を、Atlas 以外のページや `js/` が実際に作っているかを確かめる。確かめるのは「作られているか」までで、「見えるか」は測っていない。

## 2. 見つかったもの（直していない・別の作業）

- `panel.widgets` は死んでいる。Atlas と W キーが呼ぶ `IntMapWidgets.toggle` は何もしない stub（`js/app-body.js` の widgets disabled）。
- `layers.countryInfo` は入口を失っていた。`cb-countries` の行が消えて以来、画面から ON にする手段が無い。
- `navigation.start` は Atlas からしか始められないので、案内の画面はログインしていない読者に届かない。
- 能力 234 件のうち 73 件は、id を名指す検査が 1 本も無い。

## 3. 検査

`tests/feature-inventory-checks.test.mjs`: 欄が無ければ不明になること、崩れた欄を拒むこと、検査の数え方、㉔ が作られていない入口を捕まえること（class は語として照合し、前方一致では通さない）。

## 容量の天井を上げた（main 取り込み時）

能力の宣言に `ui`（Atlas を使わずに同じ操作ができる画面の入口）を足したので、宣言を運ぶ非同期チャンクが増えた: atlas-cap-runs 811.5→818.6 kB、atlas-console 986.9→994.0 kB、dist.assets 20683.3→20793.9 kB。Atlas を開いたときだけ読むチャンクで、起動時の読み込みは変わらない。宣言はエントリの検証器（js/atlas-caps.js）が形を確かめるので、能力の隣に置いている。
