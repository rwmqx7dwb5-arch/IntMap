---
title: モーダルとキーボードを 1 つの契約に寄せる——Esc・Tab トラップ・フォーカス復帰を持つ面は 1 つだけで、「モーダルが開いているか」の一覧が 2 か所で食い違い、クリックで動く div/span/td/img が 44 か所キーボードから届かなかった
date: 2026-09-29
---

〈依頼（監査・アクセシビリティ）〉静的監査の結果を、共通部品に寄せて一括で満たす——共通の `openDialog()`
と「開いているダイアログの登録簿」、共通の `makeActionable()`、名前の無い × と alt の無い画像、
reduced-motion を 1 か所で、キーボードで届かない押下を数えるラチェット。

## 0. 測った（着手時・静的）

- **ダイアログの契約を全部持つ面は 1 つだけ。** role・aria-modal・Esc・Tab トラップ・閉じたときのフォーカス
  復帰が揃っていたのは `js/widget-gallery.js` だけ。`js/auth-ui.js` のアカウント画面は Esc とフォーカス復帰を、
  確認の小窓は Esc を、それぞれ自前で持っていた（Tab トラップは無し）。画像の拡大は Esc の listener を
  足して、クリックで閉じたときは外していなかった。
- **設定の注釈は「× と Escape で閉じる」と述べていたが、Escape の処理はどこにも無かった。**
- **「モーダルが開いているか」の一覧が 2 か所で違った。** `js/app-body.js` の
  `.modal,.lightbox,#compose-modal,#settings-modal`（`.lightbox` を持つ要素は 0 件、`.modal` はショートカットの
  ヘルプ 1 つだけ）と `js/workspace.js` の `.modal-overlay,.modal,#compose-modal,.lightbox`。前者は規約・出典・
  支援・フィードバックを知らないので、それらを開いたまま Esc を押すとサイドバーが開閉した。
- **キーボードで届かない押下**: 下の計器（`scripts/keyboard-reach.mjs`）で **44**（監査の手読みは 37）。
- 名前の無い × は `<button …>×</button>` の形だけで 15。alt の無い `<img>` は 3（`js/ai-core.js` の
  レポートの図、`js/news-ui.js` の見出し画像、`js/community.js` の拡大画像）。

## 1. ダイアログ——`js/dialog.js` の `window.IntMapDialog`

- `open(root, opts)`（需要に応じて作る面。閉じると外す）と `adopt(root, opts)`（ページに居て、持ち主が
  `style.display`／class で出し入れする面）。**開閉は観測する**——同じ面を 6 ファイルが `style.display` で
  閉じていて、呼び手に報告させる登録簿は最初に 1 人が忘れた時点で古くなるため。要素そのものの
  style／class／hidden と親の子の出入りを `MutationObserver` で見る（文書全体は見ない。地図は毎フレーム
  マーカーの style を書く）。画面外に待機する携帯のシートは、持ち主の `isOpen` 述語で答える。
- Escape は**一番上の面だけ**を、**持ち主の閉じる関数**で閉じる（設定は `closeSettings` なので
  「変更を破棄しますか」はそのまま訊く）。capture で受けて `stopImmediatePropagation` するので、サイドバー
  やワークスペースの Esc は同じ押下を見ない。自分で Esc を持つ面は `escape:false`。
- Tab／Shift+Tab は一番上の面の中を巡る。閉じると、開く前にフォーカスがあった所へ戻す——設定は開く前に
  blur する（上端から開くため）ので、**ダイアログの外で最後に focus を受けた要素**を focusin で覚えている。
  ⚠ 最初は「開いた瞬間の activeElement」だけを見ていて、本番の設定で戻り先が無かった（下の spec で発見）。
- 名前は `labelledby`／`label`、無ければ面の最初の見出し。
- 登録した面（22 か所・25 面以上）: 設定・支援・規約・出典・投稿・画像の拡大・公開プロフィール・
  アバターの切り抜き・フィードバック・不具合報告・ショートカットのヘルプ・ウィジェットの追加・AI レポート・
  時系列・相関・企業の詳細・監視の 3 画面（1 か所）・プレイグラウンドのカード（1 か所）・初回の案内・
  ログイン・アカウント・確認・携帯の 2 枚のシート。
- **2 つの一覧は消し、`IntMapDialog.anyOpen()` に訊く。** 一文字のショートカットもモーダルの背後には
  届かない（「?」だけはヘルプを開閉する）——フォーカスがダイアログの中のボタンに入るようになったので、
  そのまま L や N を押すと背後のパネルが切り替わっていた。
- `js/widget-gallery.js` の onKey／フォーカス復帰は消して同じ契約に載せた（見た目は変えていない）。

## 2. 押せるもの

- 委譲リスナー 1 つ: focus を持つ `role=button|option|radio|checkbox|switch|tab|menuitem*|link|treeitem`
  を Enter（link 以外は Space も）で `el.click()`。**クリックと同じ処理しか起きない。** 自分で Enter を
  処理して `preventDefault` した要素は二度押さない。`aria-sort` を述べる列見出しは表の見出しのまま並べ替えの
  操作になる。`makeActionable(el)` は `tabindex=0` と（無ければ）`role=button` を書くだけ。
- レイヤー欄: タイルは両方の形とも `role="switch"`。見た目の `.on` と `aria-checked` は `tileOn()` 1 か所が
  書く——`syncTiles` とチェックボックスの listener は class だけを書いていて、行の形（R309 の switch）は
  地図の側から切り替えられると古い状態を読み上げていた。モード行（radio）とセクションの見出しも Tab で届く。
- 地名検索の結果は listbox（`IntMapDialog.listbox`）: 欄にフォーカスを置いたまま ↓↑ で行を選び Enter で
  決める。欄に `aria-activedescendant` がある間、`js/app-body.js` の Enter は検索し直さない。
- 残りは文字列の組み立てに `role`＋`tabindex` を足した（各国・企業の行・カード、比較の × と列見出し、
  滑走路・海流・ドローン違反・監視の行、ケッペンの凡例、3D の一覧、画像・位置・投稿者、GIS のセル
  ——表のセルは役を変えず Tab と Enter で編集を開く）。

## 3. 名前・画像・動き

- 名前の無い × 15 個に `aria-label`（閉じる／削除／ストリートビューを終了）。alt 3 件（レポートの図は
  キャプション、見出し画像は装飾なので空、拡大画像は「拡大画像」）。
- **reduced motion**: `css/intmap.css` 末尾に全体の 1 ブロック——事件点と検索ピンの終わらないパルス、
  スクリーンショットの全画面の閃光を止める。各節の transition を止める 8 ブロックは**動かしていない**
  （`tests/r292`・`r291`・`r230` が節の中にあることを測っている）。回転する読み込み表示は止めない。
- カメラ: 共通の入口は既にあった——`js/geo-engine.js` の facade（`GE().camera.*`）。`flyTo`／`easeTo`／
  `fitBounds`／`zoomTo`／`zoomIn`／`zoomOut` が `duration:0` を渡す。行き先と「動くかどうか」は変えない
  （CONSTITUTION §3）。MapLibre は自前でこの設定を読むが `essential:true`（地名検索）は例外にしていて、
  Cesium は読んでいなかった。⚠ `camera.` を経ない `.flyTo(`／`.easeTo(` の行が `js/` に 15 ある（エンジン
  アダプタ自身を除く。素の map や別のビューを呼ぶもの）——今回は触っていない。

## 4. 無害化（safe-output の台帳を下げた）

`js/app-body.js`（`escapeHtml`・ACLED の `esc`・出典の `href`）、`js/map-ui.js`（`esc` と 3 つのインライン、
ティッカーの `href`、Atlas 文脈の `'src='` は `'source='` に——マークアップではないが計器の針に掛かっていた）、
`js/countries-ui.js`（`esc`・Wikipedia の `img`／`href`）、`js/companies-ui.js`（ロゴの `src`）、
`js/feedback.js`（寄付の `href`）を `IntMapSafe.html`／`.url` に。`js/data-layers.js` の `_x` は **XML**
（EEZ の SLD を WMS の URL に入れる）なので `kept` に理由付きで移した。

## 5. 門

- `check:static` の規則 16 `keyboard-reach`（`scripts/keyboard-reach.mjs`・台帳
  `tests/keyboard-reach-baseline.json`、両方向）。形で数え、名前で数えない。数えないもの: 背景
  （target が受け手そのもののときだけ動く——Esc が対）、止めるだけの handler、立ち去るだけの closest()、
  `aria-hidden` の幕、combobox を駆動するファイルの `role="option"`。
- **44 → 9。** 残り: `js/atlas-attach.js` 3・`js/atlas-console.js` 1・`js/atlas-map-compose.js` 1（別作業が
  触るファイル）、`js/app-body.js` 2（ACLED カード——`return;` の後ろの到達しないコード。削除の提案は下）、
  `js/map-tools.js` 1（`.iol-row` は押す的ではなく行の索引を引くための closest。同じ行の ◎ と名前が押せる）、
  `js/mobile-ui.js` 1（携帯で検索ピルを広げる capture。中の欄とボタンは本物の部品）。
- `tests/a11y-shared-dialog-checks.test.mjs` 14 本: `js/dialog.js` を DOM の代役の上で**評価**して、Esc で
  持ち主の関数が呼ばれ、閉じなかったら開いたまま、フォーカスが戻り、Tab が閉じ込められ、重なった面は上だけ
  閉じ、登録簿が開閉を答えること。計器の各形と、台帳が両方向で落ちること。
- 既存の検査で綴りを固定していたもの（`r152`・`r160`・`r252`・`r483`）は新しい綴りも受けるようにし、
  モジュールを評価する代役（`r709` に `IntMapSafe`、検索の 2 本に `setAttribute`）を足した。

## 6. やらなかったこと・提案

- **`tests/a11y-shared-dialog.spec.js` は置いていない。** 書いて 3 本とも緑（設定を開いて Esc で閉じ
  フォーカスが歯車へ戻りサイドバーは動かない／検索結果を ↓ と Enter で選ぶ／セクション見出しから Tab で
  タイルに届き Space で切り替わり、`aria-checked` とチェックボックスが追従し、視点が 1px も動かない——
  2 回繰り返して 6/6）が、spec 全体の実測時間が**天井にちょうど達している**（85.5 分／天井 85.5 分）ので、
  36 秒を足すと `check:testbudget` が落ちる。天井は上げない規則なので、どこから時間を抜くかの判断を
  待つ。
- **`index.html` の `user-scalable=no, maximum-scale=1.0` は触っていない。** 提案: WCAG 1.4.4 の
  拡大を妨げている。地図のピンチは MapLibre がタッチを自分で処理するので、`user-scalable` を外しても
  地図の上のピンチは地図のズームのまま、パネルの上ではページの拡大になるはず——ただし iOS Safari で
  パネルの上のピンチがページごと拡大して地図の枠がずれるかは実機で確かめる必要がある。
- **ACLED カード（`js/app-body.js`、#R22 で `return;` により停止）の本体は到達しないコード**で、
  削除を提案する（今回は触っていない）。
- 登録していない全画面の面: 夜空（`js/night-sky.js`）・宇宙ビュー（`js/space.js`）・フライトシムの設定と
  結果——どれも自分の Esc を持つ全画面ビューア。`js/basemap-switch.js` の `#bm-pop` と経路パネルは
  非モーダル。Atlas のファイル（`js/atlas-*.js`）は別作業が触るので触っていない。
