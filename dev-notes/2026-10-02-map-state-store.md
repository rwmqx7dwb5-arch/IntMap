---
title: 地図の状態に名前の付いた正本を 1 つ作った——`js/map-state.js` の MapState が視野・基図・時刻・共有レイヤー・比較窓・地形・シミュレータ・セッションのレイヤー集合を SCHEMA で 1 回だけ宣言し、アドレスバー・共有リンク・セッション保存・Atlas の camera / time 節はその写像になった。復元は世代つきの 1 回の適用で、変化の通知は「復元」か「読者」かを述べる。既存のリンクとはバイト単位で互換
date: 2026-10-02
---

〈依頼〉利用者は全面委任（「構造改革とイノベーション。保守ではなく改革。景観放置ではなく再開発。全権を委任する。
基幹や根幹もいじってよい。引き算ではなく足し算。固執ではなく保全」）。監査で測った負債: 地図の状態に名前の付いた
正本が無く、同じ日に 4 件（復元が時計を奪われる・復元中の 2 本目が捨てられる・`tt` 無しが今に戻らない・
天気が予報時刻を勝手に書く）がこの構造から出ていた。

## 0. 測った——同じ状態を組み立てていた場所

| 場所 | 何を組み立てていたか | どう読んでいたか |
|---|---|---|
| `js/map-ui.js` `encode()` | `#v=…&l=…&tt=…&cmp=…&ct=…&sat=1&t3=1&s=…` | 9 本の `h+='&…='` の連結 |
| `js/map-ui.js` `restore()` | 同じ 9 欄 | 9 本の手書きの `[#&]…=` 正規表現（`ts` を含めて 10） |
| `js/session-tabs.js` `_snapshot()` | 基図・地形・年・レイヤー | `HOST.mapType` / `HOST.terrain3D` / `IntMapTime.year()` を直接 |
| `js/atlas-state.js` `camera` 節と undo の `capture` | 視野・基図・投影 | エンジン＋**ボタンの `active` クラス**（共有リンクは `HOST.mapType`——2 つの源） |
| `js/atlas-state.js` `time` 節 | 時刻 | `window.IntMapTime` を直接 |
| `js/compare.js` | `ct=` | 共有リンクの書き手が `compareTime.param()` を、読み手が `compareTime.set` を別々に |
| `js/session-tabs.js` の年の復元 | 「リンクが時計を持つか」 | `window.IntMapBookmark.carriesState()`（`BOOT_HASH` への 2 つ目の問い） |

保存の引き金も 3 か所に散っていた（`moveend` / レイヤーの `change` / `compareTime.on`——時計が動いても URL は
次のパンまで古いまま）。

## 1. 作ったもの——`js/map-state.js`

- **SCHEMA**: 欄ごとに URL の綴り（旧形式を含む）・毎回の復元か完全復元だけか・復元のどの時刻に適用するか
  （層 700/1800/3200 ms・時計 900・基図 300・地形 1200・比較窓 1300・シミュレータ 1500/4000——
  #R101/#R211 以来 `js/map-ui.js` に散っていた遅延を表 1 つに）・セッションでの鍵・持ち主のモジュール。
  並びはアドレスバーの並びで、同じ時刻の 2 段（等圧線のスイッチと時計、どちらも 900 ms）の発火順もこれで保たれる。
- **コーデック**: `encode(state)` / `decode(hash)` は純関数。無い欄は無いことが述べる値になる
  （`tt` 無し＝今・`ct` 無し＝主の時計に従う・`l` 無し＝共有レイヤーなし）。シミュレータの base64url も
  ここ（`packObject` / `unpackObject`）。
- **ストア**: 持ち主が `own(key, { read, apply, prepare })` を登録する。⚠ **値の複製を持たない**——`read()` が毎回
  答える（カメラはエンジン、時計は Chronos）。複製を持てばそれが 2 つ目の正本になる。`snapshot()` / `hash()` /
  `link()` / `session()` は写像。`restore(hash, { full, onSettle })` は**世代つきの 1 回の適用**（#881 の
  `restoreGen` をここへ移した）で、新しい復元は古い復元の段をすべて止め、持ち主がまだ居ない欄の値は**その復元が
  最新である間だけ**登録時に渡す。持ち主は `changed(key)` で変化を述べ、`on(fn)` の購読者は
  `cause`（`restore`＝その欄の復元の段の中で起きた変化／`reader`）で区別できる。
- **共有の読み手** `viewOf(engine, host)` / `timeOf(clock)`: 持ち主と Atlas が同じ組み立てで読む
  （Atlas は注入されたエンジンでも読めるので headless の検査が動く）。
- window 公開なし。import で読む（`check:surface` が数える `window.*` は増えていない。`IntMapBookmark` の読みが
  1 つ、`IntMapCompare` の読みが 2 つ減った）。

## 2. 移行

- **`js/map-ui.js`**: `encode()` は `MapState.hash()`。視野・基図・地形・共有レイヤー・シミュレータの持ち主を
  登録（レイヤーの `dl-wars` / `dl-ec-isobars` の読み替えは `prepare`、層の適用は `apply`——検査が評価する
  ブロックはそのまま）。`restore()` は `BOOT_HASH`・クラッシュ印・`full` の判定を保ち、適用は `MapState.restore`。
  アドレスバーは**ストアの購読者**になり、URL に載る欄（視野・層・時刻・比較窓・基図・地形・シミュレータ）が
  動くたびに書き直す。⚠ **これで時計の変化も URL に届く**（以前は次のパンまで古い `tt` のまま）。
  `IntMapBookmark` の形は保ち、`state()`（ストアの木。spec が読む）を足した。
- **時刻の欄**: 値は Chronos の時計（`timeOf(IntMapTime)`）、配線は `js/map-ui.js` の module 頂部。復元の適用は
  `source:'restore'`（以前の `'ui'`。読む者は居なかった）。⚠ **最初は `js/chronos.js` に登録を置き、実測で
  戻した**: chronos は遅延チャンクにも import されるので Rolldown が共通チャンクにして main へ畳むが、そこから
  `js/map-state.js`（Atlas の遅延チャンクとも共有）への静的 import は `vite.config.js` の注記が述べる辺で、
  畳むと循環になるため map-state が単独のチャンクに残った——`check:perf` 実測で eager.requests 9 → 10・
  modules 299 → 300・gzip +8.5 kB。main だけが読む `js/map-ui.js` に置くと requests は 9 に戻った。
  `js/chronos.js` は今回 1 行も変えていない。
- **`js/compare.js`**: `compare` 欄（`cmp` / `ct`）の持ち主。窓は `compareTime.open()` で開ける
  （`window.IntMapCompare` を経由しない）。
- **`js/session-tabs.js`**: セッションの地図の半分は `MapState.session()`。`toggles`（パネルの全チェック＋
  アプリが失敗で外した既定 ON。共有リンクの `layers` の上位集合）の持ち主になった。保存はストアの通知で。
  年をリンクに譲る判定は `MapState.carriesState()`。
- **`js/atlas-state.js`**: `camera` 節・undo の camera `capture`・`time` 節はストアの欄。⚠ **静的 import に
  しなかった**——`tests/atlas-state-checks.test.mjs` ⑤ はこのファイルを改変して `data:` module として読み、
  相対 import を 1 本（`atlas-view-ground.js`）だけ絶対 URL に直す。2 本目の静的 import はそこで解決できない
  ので、`time-lapse.js` と同じ動的 import にした（アプリでは起動グラフに既に在るので即座に解決する）。
  届く前は 2 節とも `null`（「持ち主が居ない」——推測しない）。

## 3. 門

`tests/map-state-store-checks.test.mjs` ⑤:
- **`js/map-state.js` 以外は URL の状態パラメータを綴らない**——`[#&]tt=` の手書きパーサも `'&l='` の連結も赤
  （パラメータ名は SCHEMA から導くので、欄を足せば門も知る）。旧 `js/map-ui.js` に当てて 8 本のパーサと
  6 本の連結を検出することを確かめた。
- **`location.hash` と `history.*State(` の直接の箇所をファイルごとに ratchet**（増えたら赤・減ったら基準を
  下げるまで赤。`scripts/global-surface.mjs` と同じ両方向）。2026-10-02 の写真: map-ui 読み 7・書き 1、
  page-i18n 2、usage-counts 1、atlas-cap-panel / auth-ui / legal-page / atlas-attach 書き各 1。

## 4. 起動費用

`check:perf` の天井を 2 行上げた（`--update`）: eager.modules 299 → 300（`js/map-state.js` 1 本——起動時に要る：
アドレスバーの復元が最初に読む）と eager.gzip 1511.4 → 1519.3 kB。⚠ gzip の差 +7.9 kB のうちこの変更の分は
約 2〜3 kB（raw +5.8 kB・map-state の min は約 6 kB で、map-ui から消えた連結と正規表現がその一部を相殺）。
残りは測った木の改行（この worktree は `core.autocrlf=true` で CRLF、CSS の gzip も +0.7 kB ずれている）で、
main の CI の自動の引き下げが Linux の実測へ戻す。requests は 9 のまま（§2 の「時刻の欄」）。

## 5. 検査

- `tests/map-state-store-checks.test.mjs`（新規・15 件）: ① 出荷した見本のリンク（`js/showcase.js` CAPTURED・
  見本ページと `s/*.html` が配るもの）を**バイト単位で**往復、spec が開く正規形のリンクを全件**意味で**往復
  （リンクはファイルから発見する）。② 無い欄の意味・旧形式。③ 欄ごとの適用時刻・世代・`restore`/`reader` の
  区別・遅れて来た持ち主・閉じの時刻（mock timers）。④ 各欄の持ち主が SCHEMA の名指すモジュール 1 つだけ
  （登録を木から発見）、セッションの写像。⑤ 門。
- 既存 spec への追記: `tests/landing-showcase.spec.js` の各見本で、アプリが今共有するリンク（ストアの写像）を
  同じコーデックで読み、見本のリンクと視野・時刻・層が一致すること。`tests/restored-layer-before-style.spec.js` ⑥(b)
  で、2 つの復元の後にストアが新しいリンクを読み返すこと。
- 既存の source 検査（BOOT_HASH・`save()` の形・`dl-wars` の評価・`want.forEach` の形・`IntMapShareState` の
  登録簿）はすべてそのまま緑——形を守る検査の対象は動かしていない。

## 6. 残り

- `scripts/landing.mjs` の見本リンクの照合（`showcaseProblems`）は自前でハッシュを読んでいる。`MapState.decode`
  を読めば 1 つになる（今回の範囲外のファイル）。
- `js/atlas-cap-panel.js` の見本の扉は `history.replaceState` してから `IntMapBookmark.restore` を呼ぶ。
  `MapState.restore(hash)` を直接呼べばアドレスバーへの書き込みが 1 つ減る（並行作業のファイル）。
- localStorage の他のキー（47 ファイル・58 キー）は地図の状態ではないものが大半で、今回は SCHEMA に入れていない。
  地図の状態に当たるもの（例: 投影の既定・地形の誇張）は欄を 1 行足せば URL・セッション・Atlas に同時に載る。
