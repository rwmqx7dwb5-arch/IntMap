---
title: Atlas の回答内の切り替えと地図の状態を 1 つにする——チップは描いた面の受領証から、タブは確定状態から、評価は押した後の地図から
date: 2026-11-27
pr: 1497
newsen: The on/off switch under an Atlas reply now turns off everything that reply drew (isolate, shaded areas, composed labels), and a comparison tab that fails comes back to the last state it really showed.
newsjp: Atlas の回答の下のオンオフが、その回答が描いたもの（Isolate・塗り分け・構成図のラベル）を全部消せるようになり、比較タブの切り替えが失敗したときは直前に実際に表示していた状態へ戻ります。
---

〈依頼〉 Atlas がやった塗りなどを回答内のトグルで切れないことがある／比較タブの復帰が古い状態に戻る／描かれなかったタブが「描いた」と評価される／押した後の状態で確かめる検査を足す。個別の質問への対応は足さない。

## 0. 測った（ヘッドレス Chromium・`runDirect`・モデルなし・修正前の build）

描画 7 種で「描く → その回答のチップを OFF → `styledata` → ON」を測った（`tests/board-compose.spec.js` の atlas-controls-receipts ①）。

| 描画 | 修正前 | 原因の形 |
|---|---|---|
| 強調・ピン | 切れる | — |
| Isolate（`clear` の直後） | 「✓ Isolate」と返すが mask はまだ無く、チップが出ない | 描き手が非同期（国境データと描ける style を待つ）なのに、能力が待たずに成功を返していた |
| 線 | 切れたが、`clear` で消した**前の回答の強調がクローンとして復活**し残る | 退避の条件が「前の持ち主がいる」だけで、まだ表示中かを見ていない |
| Isolate | **OFF にしても mask・edge が残る** | 描き手が `styledata` で可視性を取り返す。チップは持ち主の裏で層を倒していた |
| compose | ラベル `atl-compose-t` が残る | `liftLabels` が層を作り直すとき可視性を捨てる |
| shadeAreas | **チップが出ない** | `js/map-ui.js` の取り込みレイヤーが `render.claim` しない |
| 前の回答の OFF の後に描いた多角形 | **見えず、チップも出ない** | 受領証の指紋が件数だけで、`hidden` の面を数えない |

推測（「トグルが知る一覧と描いたものが別管理」）は半分正しかった: 受領証（`render.drawn` の差分）は既にあったが、⑴ 申告しない描き手 ⑵ 可視性を自分で持つ描き手 ⑶ 隠れた面・同件数の塗り替え、の 3 つで受領証か切り替えが実物から外れていた。時刻（`timeTravel`）は描画ではなく地図の時計なのでチップの対象にしない（年代の比較はタブで切り替える）。

タブ: 0 → 1 → 2 を続けて押し 2 の二つ目を失敗させると、表示 0・地図 0・記録 1（外部監査と同じ）。戻り先を**キューに入れる前に**読んでいた。
評価: 正常なボタン 1 個と不正なタブ 1 個の呼び出しで、`initiative.mjs` が**引数**からタブを拾い `interactive` を付けていた。

## 1. 直したこと

- `js/geo-engine.js` — `render.drawn` の各ソースに内容の版 `rev`（レンダラが持つデータオブジェクトの同一性）。claim に `show(on)` を添えられ、`render.showSurface(id,on)` はそれを通る（無ければ読む層の可視性）。
- `js/atlas-console.js` — 受領証は `rev`・件数・状態で比べ、隠れた面への描き込みも数えて表示に戻す。チップは申告された面を `showSurface` で切り替え、`_OVL` の手書きの層だけを直接倒す（`isolate` の行は claim に置き換えて消した）。前の回答のクローン退避は、この run の開始時にその内容（`revs`）が表示されていたときだけ。タブの押下は `EXEC.execute`（source `ui`）を通す。
- `js/map-tools.js` — Isolate が `iso-src`・`iso-edge-src` を効果キー `map.isolate` で claim し（チップは mask だけでなく国境線も切り替えるようになった） `show` を持つ（隠している間は再表示しない）。Objects の表示切替も `showSurface`、取り込みレイヤーの隠し状態は層から読む（`hiddenUp` の副表を消した——層の可視性が同じ事実を持つ）。
- `js/map-tools.js`・`js/atlas-cap-map.js` — Isolate の入口は mask を地図に置いた（または国境が無かった）ときに解決する Promise を返し、能力はそれを待って ✓ を言う（描き手自身の待ち 7.2 s を超えたら従来どおり「開始した」）。
- `js/map-ui.js` — 取り込みレイヤーを効果キー `map.object` で claim。回答の受領証はソース id で持ち、チップはそのターンが描いた面だけを切り替える（1 枚ずつ切れる）。
- `js/atlas-map-compose.js` — ラベル層を作り直しても可視性を保つ。
- `js/atlas-switch.js` — 戻り先は順番が来たときの確定状態。戻せたら記録も同じ値で確定。成否はカーネルの観測状態（`unobserved` は失敗ではない）。
- `js/atlas-cap-ui.js` — `meta.drawn`＝実際に描いたコントロールの `{id, kind, options}`、markup に `data-ctl-id`。
- `scripts/atlas-eval.mjs`・`scripts/atlas-eval/initiative.mjs` — 描いた id を押して各状態の地図（時刻・レイヤー・凡例）を読み、`interactive` は押して地図が変わった切り替えにだけ付く。引数からは数えない。

## 2. 検査

- `tests/atlas-controls-receipts-checks.test.mjs` — 描いた id と markup の一致、続けて押したときの戻り先、観測状態での判定、評価が押下で `interactive` を決めること。
- `tests/board-compose.spec.js`（atlas-controls-receipts ①〜④・同じ起動と同じ扉なので別ファイルにせず、全体の時間の天井 5,250 s を動かさない）— 実ページで ①〜④（④ は押した後の年と、共有色尺度 `compare` で同じ区分が同じ色のままか）。
- 既存 `tests/atlas-autonomy-checks.test.mjs` ⑤・`tests/atlas-ui-parts-checks.test.mjs` の「引数のタブで interactive」は欠陥そのものを固定していたので、「描いた・押した」に言い直した。

## 3. 時間の天井

ブラウザ検査は別ファイルにすると 27.2 s（起動 1 回分を含む）、余白は 0 だった。同じ起動と同じ扉の `tests/board-compose.spec.js` へ移し（その reload の後に置く——前に置くと reload が長い会話を戻して既存の編集テストが 7 s → 35〜47 s になった）、固定の待ちを条件待ちにして 16.4 s（静かな機械・既存 3 件 14.9 s が表の 19 に当たる ×1.28 → 21）。台帳の方針は「天井は下げるだけ」で、3 本の検査が 5,250 を手で持っていたが、利用者の判断（2026-11-28「規則に囚われず最適解を」）で **実測の分だけ +21 s（5,250 → 5,271）** とし、3 本の数をそれに揃えた。他の spec の待ちを書き換えて捻出する案は、無関係なファイル（直近 #1426 が触った）に手を入れるので取らなかった。

## 4. main との合流

#1492 が Isolate の形（`refit`・`showEdge`）を作り直していたので、その版を取り、こちらの 4 点（mask が載ったら解決する Promise・`shown`・`show()` の扉・再表示の条件）を載せ直した。`ui.inlineControls` は main の件数の切り詰め（`counted`）と `meta.drawn` を両方持つ。

## 5. CI で見つかったこと

- claim の持ち主は能力が書く効果キーでなければならない（`tests/atlas-one-declaration-checks.test.mjs` ④b）。`isolate`・`upload:…` という私的な名前をやめ、`map.isolate`・`map.object` にした。同じ kind の中の区別は受領証のソース id が持つ。
- 解決関数を `done` と名づけたら、名前で呼び出しを結ぶ外向き効果の解析（D①）が `apply → done → post` を作り、無関係な 3 ファイルの押下が書き込みに届くと判定された。`landed` に改名。
- `check:perf`: `atlas-console` の非同期チャンクが天井 +帯を 0.2 kB 超えた（main は #1493 で天井を実測まで下げたばかり）。増分は機能そのもの（受領証・扉・押下の観測）なので、理由をここに書いて天井を上げた（`atlas-console` 1,484.8 → 1,493.3 kB、その行だけ）。
