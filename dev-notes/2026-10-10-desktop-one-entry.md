---
title: 同じ機能への 2 つ目の入口と死んだ入口を消す——設定は変えた瞬間に反映し、デスクトップの検索欄からも Atlas に訊ける（desktop-one-entry）
date: 2026-10-10
newsen: Settings now take effect the moment you change them (Apply is now Done), and the desktop search box suggests places as you type and ends with Ask Atlas.
newsjp: 設定は変えた瞬間に反映されるようになり（「適用」は「完了」に）、デスクトップの検索欄でも打つたびに候補が出て、最後の行から Atlas に訊けるようになりました。
---

〈依頼〉能力と品質は下げずに、同じ機能への 2 つ目以降の入口と死んだ DOM/JS を消す。物差しは「消したあと何が同じだけ
働いているか」。統合した入口では、旧い入口から来た人と呼び出し元（Atlas の能力・ショートカット・テスト）が残った 1 本に
着くことを確かめる。

## 何を消し、何が役目を引き継いだか

| 消したもの | 引き継いだもの | 呼び出し元の行き先 |
|---|---|---|
| 設定の「昼夜の表示」`#setting-night-side`（`lblNightSide` / `nightSideOn` / `nightSideOff` を全言語から） | レイヤー欄 ▸ 基本表示の `#dl-nightside`（`js/data-layers.js` `_setNightSide`）。持ち主は従来どおり `window.IntMapNightSide` | Atlas の `nightSide` 能力と、Atlas の機能チップ（`js/atlas-console.js` `nightSide.set`）——**後者は行を同期していなかった**ので `_imSyncNightSideRow()` を足した |
| ヘッダーの言語ピル `.lang-toggle`（`#lang-en` ほか 5 個と、`js/lang-registry.js` `syncChrome` が足していた残り 4 個）。#R11 から全幅で `display:none !important` だった | 設定の `#setting-lang` → `setLang()` | Atlas `settings.language` は `setLang()` を直に呼ぶ（ピルを押す代替経路を消した）。テストの言語切替 28 か所は `#setting-lang` の `change` へ |
| 設定の「フィードバックを送る」`#btn-send-feedback`（`sendFeedbackBtn` を全言語から） | ヘッダーの `#btn-feedback-hdr`（同じ `window._openFeedback`、全幅で常に出ている） | Atlas の `feedback` は `_openFeedback()` を直に呼ぶ。設定の「不具合を報告」「地図の誤り報告」は別のフォームなので残した |
| `#layer-search-wrap` の残骸（`js/map-ui.js` の CSS 2 選択子・行の除外・注記、`css/intmap.css` の 1 選択子、`tests/layer-manifest.spec.js` の除外） | 実体は #R296 で既に無い。タイル欄の `.lsr-q` が唯一の検索欄 | `tests/smoke.spec.js` の「不在」検査はそのまま |
| レイヤー欄の「データスタジオ — 表を地図に」ボタン `#btn-data-studio` | Layers ▸ Tools の行 `tool.dataStudio`。`js/data-studio.js` の `studio(HOST)` は 1 つの制御器を返すので**同じインスタンス**で、行は「描画中か」も示す | Atlas `data.studio`・座標の無い表のドロップ・`ds=` の復元は従来どおり |
| 設定の「適用」と、× / Escape の「変更を破棄しますか」（`btnApply` と 4 言語の inline 行を全言語から） | 各コントロールが自分の `change`（スライダーは `input`）で確定する（`js/app-body.js` `commitSetting`）。足のボタンは「完了」（既存の `mDone`）で、× と同じく閉じるだけ | Atlas の `setSel()` は `change` を発火するので、同じ `commitSetting` に着く（単位は以前 `HOST.unitMode` を書くだけで保存されなかった） |
| デスクトップだけ「Atlas に聞く」行・打鍵ごとの候補・「場所を検索・Atlas に質問」が無かった（`isMobile` の早期 return と `if(!mob()) return`） | 全端末で同じ `_askAtlasRow` と `doGeocode({suggest:true})` | 押すと、デスクトップで左サイドバーが畳まれていれば `IntMapOS.exec('ui.sidebar.open')` で開いてから Atlas タブを開いて `IntMapConsole.run(q)` |

## 設定をその場で反映するときに決めたこと

- **変わったコントロールの手順だけを走らせる。** 旧 Apply は全部の欄を読み直して書いていたので、開いている間に Atlas や
  ショートカットが変えた値を古い欄で上書きしえた。`commitSetting` は `e.target.id` で分岐する。
- **地図エンジン**だけは場面を移せないので、選んだ時点で「切り替えると再読み込みします」と `confirm` し、取り消せば
  選択を `ES.choice()` に戻す。了承すれば従来どおり保存→トースト→700 ms 後に再読み込み。
- **ニュースの言語・国・提供元**は 1 つ選ぶたびに確定し、取得は 700 ms 選び終わるのを待ってから、取得の条件
  （言語の範囲・言語・国の集合）が直前と同じなら走らせない。提供元は表示の絞り込みなので取得しない（従来どおり）。
  `js/news-sources.js` の `commit()` / `commitCountries()` は確定のたびにドロップダウンを閉じないようにした。
- 画面の塗り直しは 120 ms でまとめて 1 回（時刻帯・単位・地名の言語・テーマは `updateI18n()`、残りは `renderUI()`）。
  スライダーは動かしている間に即反映、保存はなぞり終えて 300 ms 後。アクセントの色ウェルも同じで、`input` で塗り
  `change` で保存する（`saveSettings` はアカウントの設定同期を呼ぶので、ドラッグ中に何十回も書かない）。
- 慣性のスライダーは旧 Apply が `(+value||100)` で読んでいたため **0 % を選ぶと 100 % になっていた**（注記は「0 → 慣性なし」）。
  書き直しで 0 を 0 として読む。
- `data-effect`: 書き込みに届く委譲リスナーの登録先 `#settings-modal` と `#accent-picker` に `private` を宣言した
  （`scripts/data-effects.mjs` の台帳は 0 のまま）。アクセントの聞き手は document からピッカー自身へ移した。
- AIS のキー欄（`js/data-layers.js`）は Apply の click ではなく自分の `change` で確定する。

## 検索欄を全端末で 1 つの入口にしたときに出たもの

- **全検索が、待っている候補に上書きされた。** 候補は打鍵の 120 ms 後に出る。その間にボタンか Enter を押すと、全検索の
  カードが直後の候補（端末内の行だけ）に置き換わる——デスクトップで `tests/search-identity.spec.js` の「Tokyo」の 2 行目が
  押す前に消えて実測された。携帯でも同じ窓はあった。全検索の開始が待っている候補を取り消す（`js/app-body.js` `_sugT`）。
- 「Atlas に聞く」は Atlas タブのボタンを押して開くが、そのボタンはトグルなので、**Atlas タブを開いたまま検索欄から訊くと
  タブが閉じていた**。開いているときは押さない（`HOST.mode`）。
- 言語ピルの短い名前 `pill`（`js/lang-registry.js` の 2 行と `derive()`・`list()`）は読み手がピルだけだったので一緒に消した。

## 文言の位置

`js/ai-core.js` の未ログイン時の説明「右上のアカウントからログイン」は、デスクトップでは左サイドバーの上にある
ボタンと食い違っていた。位置を書かず「「ログイン」ボタンから」「with the Log in button」にした。

## 計器

- i18n の床（`tests/i18n-coverage-floor.json`）は、消した UI 専用の鍵 5 本（keyed）と 1 本（positional / inline：破棄の確認文）の
  ぶんだけ `--update-floor` で下げた。既存の他の行は 1 つも消していない。
- `layer-packages` の台帳は `js/data-layers.js` が 1 行縮んだぶん `--update`。
- i18n の死んだ鍵 `"Day/night"`（fr / ko / zh / zh-hans と `scripts/zh/12-inline-c.json`）: どのコードも引いていなかったが、
  消した index.html の注記「Day/night shading」がその綴りを持っていたので生きているように数えられていた。門の指示どおり
  `scripts/i18n-dead-key-codemod.mjs --write` で落とした。
- 共有窓口（`check:surface`）: 新しい読みが 2 本——`window.IntMapOS`（`js/search-geocode.js` の「Atlas に聞く」が
  `ui.sidebar.open` を呼ぶ。`IntMapOS` は js/app-body.js が window に置く唯一の口で、export する持ち主が無い）と
  `window.imNewsCountries`（`js/app-body.js` `_newsFeedSig` が取得の条件を比べる。値の持ち主は設定の読み書きと同じ window）。
  減ったもの（`_accentPending` の撤去、`IntMapNightSide` / `_openFeedback` / `imAccent` / `imUnitTemp` の読み）と一緒に `--update`。
