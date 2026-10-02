---
title: 携帯の起動で「要らない処理」をやめる——地名照合器は届いた項目だけ・グリフは 1 字 1 回・格子は開くとき・起動画面のマークは箱の大きさで
date: 2026-10-02
---

〈依頼〉「スマホのパフォーマンスと UI を改善して」→「修正じゃなくて作り変え。意図を理解しろ」。
前段（mobile-performance）は起動の段を宣言で分けて操作できるまでを −1.5 秒にしたが、**long task の総量は減らず**、
起動画面が上がった後の 3 秒が 0.46 → 1.85 秒に重くなった（後ろへ移しただけ）。このエントリは**処理そのものを無くす**側。

## 0. 測った（着手前・main 0cb41ee2）

計器は前段の `scripts/frame-profile.mjs --boot --detail`（390×844・DPR 3・iPhone UA・CPU ×4・第三者のバイトは
`.frame-cache` の再生）。帰属は long-animation-frame の script 帰属に加え、**非圧縮 build（`vite build --minify false`）
の CPU プロファイル**（Chromium tracing の ProfileChunk）で関数名まで引いた。

| 何 | 実測 | 正体 |
|---|---:|---|
| `DOMContentLoaded` の処理 | 1.10〜1.30 s（うち強制レイアウト 0.43 s） | `initMobileUI → applyLayout → mountInto` 196 ms（閉じたシートの中にレイヤー格子と**デスクトップの側欄**を組み、`IntMapPlaceClear` の同期計測 73 ms・`_placeLayerTools` の rect 照会 73 ms で強制レイアウト）、`applyDockMode → renderUI → widgets` 120 ms、言語イベントの購読者 103 ms、旗の絵文字の判定 97 ms |
| main の `Worker.onmessage` | 0.98〜1.01 s | データの扉が地名辞書を返した続き（同じタスクのマイクロタスク）で `rebuildGeoIndex` が**約 4.6 万個の正規表現**を作る |
| MapLibre の TinySDF（`draw` と距離変換） | 約 0.8 s（プロファイルの自己時間で最大） | ブラウザが描くグリフ（CJK・ハングル・クラスタ）。**34 字に 166 回**描いていた |
| 起動画面のマーク（明るい側） | 206,207 B | 156 CSS px の箱に 1254 px の原本 |

⚠ **166 回の内訳は見立てと違った。** 最初は「Noto のサブセットが届くたびに全グリフを捨てる」（前段の
`refreshCjkGlyphs` が全部を消す）が原因と見て、届いた面の `unicode-range` だけを消すようにした——**166 → 144 回にしか
減らなかった。** 描画ごとに時刻とスタックを取ると、대 と 日 が **150 ms の間に 4 回ずつ**（4169／4286／4306／4321 ms）、
すべて別のタイルの `getGlyphs` から描かれていた。MapLibre 6 の `GlyphManager` は**描き終えてからキャッシュに書く**
（`glyphs[id] = await this._drawGlyph(…)`、描く前に `document.fonts.load` を待つ）ので、その間に同じ字を頼んだタイルの
数だけ描く。主因はこちら（§3）。

## 1. 地名照合器を「届いた項目だけ」に（`js/place-terms.js`・`js/news-context.js`）

- `rebuildGeoIndex` は**正規表現を 1 つも作らない**。項目の照合器は、その項目に最初の照合が届いたときに作る
  （#R311 の `terms` 配列に対するキャッシュはそのまま）。並べ替えは比較関数の中で毎回 `Math.max(...)` していたのを
  項目ごとに 1 回へ（同じ数・同じ安定順）。
- **取りこぼしの無い前置フィルタ。** 照合器は 3 種（ラテンの `\bterm\b`/i・キリルの語幹・CJK の部分文字列）で、
  どれも「語そのものが本文に現れる」ことを要する。比べ方は正規表現 `/i` 自身の規則——非 unicode の
  Canonicalize（ECMA-262 §22.2.2.7.3：1 単位ずつ `toUpperCase()`、1 単位にならなければそのまま、非 ASCII が
  ASCII に写るときもそのまま）——で、`canonUnit` はそれを 1 単位ずつ表にしたもの。だから当たる語は、その規則で
  写した本文の部分文字列であり、**先頭 3 単位と末尾 3 単位**もそうである。索引はその 2 つで引く。長さ 0 の語は常に候補。
- ⚠ **先頭 3 単位だけでは選べなかった。** 実測、本物の見出し 466 本で 15,650 項目中 10,535 項目に届いた（地名は
  「San 」「New 」「Port」で始まる）。末尾 3 単位を同じ本文に要求して 1,706 項目。
- 順序も答えの一部（同点は先に来た項目が勝つ）なので、候補は geoDB の順のまま調べる。走査そのもの（`bestSubject`・
  `bestPublisherPlace`）を `js/place-terms.js` へ移し、`cand = null` で全件走査になる——検査はその 2 つを比べる。

| 同じ入力に同じ出力か（node・実データ） | 前（main の news-context.js） | 後 |
|---|---:|---:|
| 入力（本番の見出し 466 本 ＋ 地名辞書の語から作った 16,956 本） | 17,422 | 17,422 |
| 出力が異なった件数（主題の位置・名前・種別・媒体の位置・名前） | — | **0** |
| `rebuildGeoIndex` 1 回目（desktop node） | 156〜166 ms | 11〜13 ms |
| 見出し 466 本の照合の合計 | 11.4〜12.2 s | **0.18 s** |
| 466 本の後に照合器を作った項目 | 15,650（全部） | 1,706 |

## 2. グリフは 1 字 1 回、作り直すのは届いた面の範囲だけ（`js/geo-engine.js`・`js/map-typography.js`）

- `_dedupeGlyphDraws`：進行中の（スタック・変種・字）は 1 つの約束で、後から頼んだタイルはそれを待つ。地図を作る
  1 か所（`_newMap`）が `GlyphManager` のクラスに 1 度だけ入れる（後の `setStyle` の分も同じクラス）。内部の形が
  違えば何もしない。
- `refreshCjkGlyphs(範囲)`：`loadingdone` で届いた面の `unicodeRange` を 1 フレーム分まとめて渡し、その範囲に
  入るグリフだけを消す。何も消えなければスタイルに変更を告げない（全シンボルタイルの再レイアウトをしない）。
  範囲を述べない面・全域の面は従来どおり全部。

| 起動〜ready＋8 s の TinySDF 描画（同じ条件・`fillText` を数えた） | 回数 |
|---|---:|
| main | 166（34 字） |
| 範囲だけ消す | 144 |
| ＋同時の依頼を 1 回に | **45**（34 字 ＋ 面が届いた後の正当な描き直し 11） |

## 3. 携帯のレイヤー格子は開くときに組む（`js/mobile-ui.js`）

起動時の `applyLayout` は格子を組まない。`openSheet()` が組み（従来どおり、待たない）、まだ開かれていなければ
起動画面が上がって 3 秒後の `settled` の番に、idle の中で 1 度だけ先に組む（`prebuildGrid`）。3 秒は台帳が
「起動後 3 秒」として測る窓で、格子はそこに入れない。
⚠ **これは「後ろへ移す」側の変更**で、仕事は ready＋3〜8 s に 0.09〜0.22 s 残る（下の表 `+3〜8 s`）。残した理由は
「開いた瞬間の体感」：開く費用を測ると、組んでいない格子を開いても組み済みと同程度だった。

| シートを開く（タップから格子表示＋0.6 s の long frame 合計、3 回） | main（起動時に組み済み） | 後 |
|---|---|---|
| ready＋1 s（後は未組み） | 745／850／1,038 ms | 620／530／869 ms |
| ready＋8 s（後は先組み済み） | 242／354／779 ms | 368／533／445 ms |

併せて `IntMapPlaceClear` の同期計測をやめた（`js/map-ui.js`）：検索欄の × の位置は ResizeObserver の最初の観測
（レイアウトの後・描画の前）で決まるので、配線時に全ページの強制レイアウト（73 ms）を起こす理由が無い。
旗の絵文字の判定は CPU 側のキャンバスで（`willReadFrequently`：読み戻し 10.8〜31.7 → 3.7〜4.0 ms）。

## 4. 起動画面のマーク

`css/intmap.css` が名指すのは原本ではなく、箱の大きさ（`.boot-icon` の 156 px × DPR 3 ＝ 468 px）へ縮めた写し
`IntMap.Icon_BW-inverted.boot.png`（**206,207 → 43,071 B**）。`scripts/boot-icon-flatten.mjs` が原本から
`scripts/build-app-manifest.mjs` と同じ box filter で作り、`--check` と検査④が画素で一致を確かめる。原本は残す。
WebP／AVIF は検討したが、このリポジトリに符号化器が無く（node に無い・依存も無い）、PNG のまま箱の大きさにする方が
差の大部分を取れるのでそうした。

## 5. 実測（前後・同じ条件・ABAB 交互・4 組）

`frame-profile.mjs --boot --detail --reps 1 --settle 8000`、前＝main 0cb41ee2 の build、後＝この branch の build を
交互に 4 組。数は**組ごとの差の中央値**（TESTING.md の規則）。⚠ 1 回目の 4 組（§3 の `IntMapPlaceClear` を入れる前）は
このマシンが他のセッションで忙しく、組ごとの差が ±2 s 揺れて向きが揃わなかった——ready 後 3 秒（−0.60 s）・
`Worker.onmessage`（−0.65 s）・`DOMContentLoaded`（−0.25 s）だけが 4 組とも負。下は 2 回目（4 組とも同じ向き）。

| 何（4 組・ABAB） | 前（中央値） | 後（中央値） | 組ごとの差の中央値 |
|---|---:|---:|---:|
| **long task の総量**（ready＋8 s まで） | 5.72 s | 3.62 s | **−2.04 s** |
| long animation frame の総量（同） | 7.53 s | 5.26 s | **−2.11 s** |
| 同・blocking | 4.97 s | 3.07 s | −1.85 s |
| **ready 後 3 秒の long frame** | 1.62 s | 0.96 s | **−0.66 s** |
| ready 後 3 秒の最長フレーム | 0.67 s | 0.27 s | −0.39 s |
| ready＋3〜8 s の long frame | 0 s | 0.16 s | +0.12 s（格子の先組み） |
| 起動画面が上がるまで（ready） | 6.14 s | 4.78 s | −1.35 s |
| ready までの long frame | 5.38 s | 4.16 s | −1.11 s |
| `DOMContentLoaded` の処理 | 1.31 s | 0.91 s | −0.48 s |
| main の `Worker.onmessage` | 0.98 s | 0.29 s | −0.70 s |
| ready までに読んだ本体 | 2,991 kB | 2,833 kB | −158 kB（マーク） |

操作中（`mobile-trace.mjs --engine chromium --cpu 4 --reps 1`、両腕とも同じ再生キャッシュ、各 1 回）は**差が
ノイズの内**——この変更は起動の仕事を消すもので、操作の 1 フレームの中身は変えていない:

| 相 | 前 fps | 後 fps | 前 blocking | 後 blocking |
|---|---:|---:|---:|---:|
| pan-first | 42.2 | 49.0 | 4 ms | 67 ms |
| pan-touch（本物の指） | 52.7 | 44.6 | 540 ms | 615 ms |
| pinch-touch | 52.6 | 55.7 | 115 ms | 110 ms |
| pan-alerts | 49.7 | 44.7 | 49 ms | 144 ms |

⚠ 最初の前側の 1 回はキャッシュを指定せず（再生 0 件）に走り、pan-touch 25.8 fps・pinch 21 fps と出た——比べられない
条件だったので捨てた。

**読み方**: 前段が後ろへ移した仕事のうち、地名照合器の構築とグリフの重複描画は**無くなった**（総量 −2 s）。
起動後 3 秒の重さは前段以前（0.46 s）にはまだ戻っていない——残りの大きいものは ready 直後の地名辞書の
読み（`ReadableStream.read` 約 0.27 s）と MapLibre のフレーム。

## 6. やっていないこと・提案

- **ウィジェットの板**（`applyDockMode → renderUI → widgets.sync → widget-layout.render` 120 ms）：携帯ではシートの
  中にあり、最小の高さでは見えないのに `boardShown()` が「見えている」と答えて起動時に組み、カードの取得も始める。
  見えているかの判定（シートの高さ）とカードの取得方針に関わるので、今回は触らずに提案に留める。
- **初期言語の `intmap-lang`**（購読者 103 ms：凡例の作り直し・国境・時刻帯の一覧）：起動時に「言語が変わった」と
  告げている。購読者ごとに初回の必要を確かめてからでないと外せない。
- ジェスチャ中の解像度低下は前段のとおり入れていない（R229 で利用者が撤去を指示した機構）。

## 7. 検査

`tests/mobile-heavy-work-checks.test.mjs`（①③④は**走らせて**確かめる）:
① 実データ（地名辞書・独露西の表・本番の見出し）で、rebuild は何も作らない／前置フィルタは全件走査の照合器が
当てる項目を 1 つも落とさない／`analyzeContext` の答えが全件走査と同じ／`canonUnit` が `/i` の規則と一致
（大文字小文字を持つ全単位で）② 起動の経路は格子を組まず、予約は ready・3 秒・`settled`・idle を経る
③ 同時の依頼は 1 回描く／範囲外のグリフは残り再レイアウトもしない／`loadingdone` の範囲が 1 フレーム分まとまる
④ CSS が名指すマークが原本を箱の大きさへ縮めたものと画素で一致。
既存の検査の綴りを実装に合わせた: `tests/shell-layer-panel-checks.test.mjs` R408 ⑥b（起動時は組まない）、
`tests/news-geo-checks.test.mjs` #14（フォールバックは `bestSubject`）、`tests/shell-launch-defaults-checks.test.mjs`
R206 ①と `tests/process-map-shell-source-lines-checks.test.mjs` R205 ④（明るい側のマークの名前）。

### 上げた天井（`check:perf`）

- `eager.modules` 305 → 306：`js/place-terms.js`（地名照合器。`js/news-context.js` が起動グラフにいるので一緒に入る。
  照合器の構築が無くなる代わりの 1 ファイル）。`dist.assets` は −156 kB（マークの原本がバンドルから外れた）。

その他の台帳: `tests/perf-phone-ledger.json`（この branch の build で `--ledger`）。
