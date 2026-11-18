---
title: 地図に浮かぶ Atlas の回答を「文字と影だけ」に、地名検索の空欄の一覧を撤去、衛星画像の海の四角い継ぎ目を直す
date: 2026-11-18
newsen: Atlas answers on the map are now plain text with a soft halo instead of stacked dark bands; the place search no longer pops a list before you type; and the satellite ocean no longer shows square seams.
newsjp: 地図に浮かぶ Atlas の回答を、行ごとの黒い帯から「文字と柔らかい影だけ」に。地名検索は打つ前に一覧を出さなくなり、衛星画像の海に出ていた四角い継ぎ目も消えました。
---

〈依頼〉ChatGPT との議論とスクリーンショット 2 枚（太平洋ベルトの回答）。利用者が選んだ範囲: Atlas の見た目を作り変える（複数案を撮ってから決める）・入力欄の存在感・海の四角い継ぎ目・「上部の地名検索バーに入力しようとしたら色々出てくるあれ」の削除。

## 0. 測った

- **黒い帯の正体**: `js/atlas-float.js` が回答の各段落を `display:inline` にして `box-decoration-break:clone` で 1 行ずつガラスを敷いていた。さらに地点一覧（`.atl-cmp`）がカード、操作行が chip で、背景が三重に重なっていた。
- **海の継ぎ目の正体**: 衛星タイルの解決器（`js/sat-proto.js` と `src/sat-worker.js` の 2 か所）が Esri の「データなし」灰色タイルを **「3,500 バイト以下」** で見分けていた。実測（2026-11-18）で日本の東の外洋の本物のタイルは **7/49/116 = 2,925 B・7/50/116 = 3,065 B**。本物の海が灰色タイル扱いされ、上位ズームの拡大切り抜き（色調が違う）に差し替えられて四角が出ていた。Esri の生タイルを z5・z7 で並べると継ぎ目は無い（上流の問題ではない）。
- 灰色タイルは**固定の 1 枚**: 両方の keyless ホスト・6 地点（太平洋 z19・大西洋 z18・南太平洋 z17・南大洋 z19・サハラ z19・南極 z19）で全部 2,521 B、FNV-1a `0x92d9118f`。z16 の赤道太平洋は 5,208 B の本物。
- 否定された見立て: `?blankTile=false` で欠損を 404 にさせる案——欠損タイルは CORS ヘッダなしの 404 で `Failed to fetch` になり、ネットワーク失敗と区別できない（観測できなかったことを失敗と呼ぶ形になる）ので採らなかった。

## 1. Atlas の回答（利用者が 3 案から B を選んだ）

同じ回答（模擬した ai-proxy・本物の描画経路）を 3 案で撮って提示: A＝1 枚の統一ガラス／B＝背景なしの文字＋影／C＝縁のない柔らかい陰り。**B** を選択。

- 回答のどの部品も面を塗らない（本文・地点一覧・操作行・出典）。行ごとのランは廃止。
- 可読性は字の縁取り: `text-shadow` 3 層（輪郭・落ち影・広い減衰）を会話全体に 1 回だけ掛け（継承）、色はインクの反対（ダーク＝黒い halo、ライト＝白い halo。`--atl-halo`）。利用者自身の質問は吹き出しのままで halo なし。
- 入力欄: 普段は薄いガラスと髪の毛 1 本の縁、ホバーで縁、フォーカスで面と影（`prefers-reduced-motion` で遷移なし）。上部の Atlas バーは操作部品なので小さなガラスのまま。

## 2. 地名検索の空欄の一覧（撤去）

`js/search-geocode.js` のフォーカス時の空状態（作例・ツアー・「探索」「続きから」・「いま、ここ」「写真の場所」）を外した。一覧は打った文字の候補だけ。死んだ `js/here-entry.js` `showEntry` も削除。
**何が役目を引き継いだか**: 携帯のシートのホーム（`js/start-home.js`）が同じ帯と同じ 2 行を持つ。ギャラリー全体は設定の「作例の地図とツアーを見る」（`data-im-gallery`）と Atlas `panel.gallery`、「いま、ここ」は Atlas `research.hereNow` と `?here=1`。⚠ デスクトップでは「探索」「続きから」の帯への近道は無くなった（押していた先の機能——版・比較・地点カード・★保存・ライブラリ——はそれぞれの入口に残る）。

## 3. 衛星画像の灰色タイル判定

`js/esri-imagery.js` `isImageryPlaceholder(buf)`（長さ＋FNV-1a）を正本にし、worker と main-thread fallback の両方がそれを呼ぶ（2 か所の閾値の写しを廃止）。失効条件（Esri が画像を変える）は `tests/prod-smoke.spec.js` が本番で「範囲外のタイルは認識される・2,925 B の本物の海は認識されない」を毎回確かめる。

## 4. 検査

`tests/atlas-glass-look-checks.test.mjs`（回答に面を塗る規則が無い・halo が両テーマで反対色・入力欄の 3 状態・検索欄にフォーカス時の描画が無い・灰色判定がサイズでない・両解決器が同じ関数）。`r192-checks` と `process-map-shell-source-lines-checks` の閾値の綴りを新しい判定に更新。

`check:perf`: 非同期チャンク `start-home` が 6.7 → 9.0 kB。`js/here-entry.js` を動的 import していた検索欄が無くなり、`start-home` だけが静的に import するので bundler が `here-entry` チャンク（消えた）を `start-home` に合流させた——同じバイトの置き場所が変わっただけで、取得は 1 本減る。`perf-budget --update` でその行だけ上げた。
