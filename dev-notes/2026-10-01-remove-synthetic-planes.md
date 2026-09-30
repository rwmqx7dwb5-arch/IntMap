---
title: 航空機レイヤーの作り物データと、死んだ airplanes.live の旧経路を撤去——取得が全滅すると乱数で約 270 機を実データとして描いていた genSyntheticPlanes() を、それを呼ぶ掃引・?aviation=v1 の切り替え・旧経路だけの MapLibre 描画ごと外し、残った aviation-feed の経路は失敗を「描けなかった」として行と通知と Atlas に述べる
date: 2026-10-01
---

〈依頼（利用者承認済み 2026-10-01「全部任せる」＝提案の承認）〉航空機レイヤーの作り物データの経路と、死んだ
airplanes.live の旧経路を撤去する。取得に失敗したときは偽データでなく「描けなかった」を
`js/layer-state.js` に報告し、利用者に通知する。出典表記を実際の上流に合わせる。

## 0. 測った（着手時）

- `js/data-layers.js` `genSyntheticPlanes()`: 51 地点（空港 42・軍用基地 9）の周り 200〜1,600 km に `Math.random()` で機体を散らし、
  便名（`<空港>NNN` / `MILNNNN`）と ICAO（`Math.random().toString(36)`＝16 進ですらない）をこしらえ、
  `planesData` に入れて描く。民間 42 空港 × 6 ＋ 軍用 9 基地 × 2 ＝ **270 機**（#R341 の本番実測と同じ数）。
  到達条件は「掃引の円が全部失敗し、手元に実データが 1 機も無い」。
- その掃引（`fetchPlanes` → `_sweep` → `https://api.airplanes.live/v2/point/…`）は `?aviation=v1` か
  localStorage `intmap_aviation_v2=0` で選べた。**`api.airplanes.live` は全リクエストに HTTP 403**
  （2026-09-30 実測、`scripts/upstream-liveness.mjs` でも refused）——つまりこの経路で画面に出せたのは
  合成機だけで、しかもツールチップの脚注は `airplanes.live · ADS-B`。
- 既定の経路（`aviation-feed` → `src/aviation-worker.js` → `js/aviation-live.js` の GPU cloud）は失敗した poll を
  `status().failures` に数えるだけで、行にも通知にも何も出なかった。**フィードが一度も答えないセッションは、
  描けた行と見分けがつかない。** 起動の失敗（worker 無し・GPU primitive 無し）も `_av2=null` で黙っていた。
- 旧経路だけが埋めていたものが、既定の経路でも読まれていた: `js/map-ui.js` の GIS 行 `aircraft` は
  `lyr-planes` / `src-planes` を読み（#R341 以降は常に空＝「機体 0」と答えていた）、出典を
  `airplanes.live ADS-B` と述べていた。ツールチップの脚注は `fmtClock(planesTime)`——`planesTime` は旧掃引しか
  書かないので、既定の経路では**1970-01-01 の時刻**を出していた。`js/aircraft-detail.js` の出典の既定値も
  `airplanes.live · ADS-B`。
- プライバシー §4 は「?aviation=v1 のときに限り airplanes.live に円の中心座標を送る」と述べ、出典ページは
  「今も参照しているのはプレビュー画像だけ」と述べていた——プレビューは #R341 から取得していないので、
  後者は着手時点ですでに事実でなかった。

## 1. 撤去したもの

- `js/data-layers.js`（−1,220 行 / +139 行）: `AIRPORTS`・`genSyntheticPlanes`・`AVIATION_V2`（URL と
  localStorage の切り替え）・掃引一式（`planeCircles` / `planeCellOf` / `adsbToPlane` / `fetchPlanes` / `_sweep` /
  `planePollMs` / `planeRefetchGapMs` / `schedulePlanePoll` と定数）・ズームの案内（`updatePlanesZoomHint`）・
  旧経路だけの描画（`lyr-planes` シンボル、`lyr-planes-3d` / `lyr-planes-post` 押し出し、`refreshPlanes3D` /
  `_cullFor3D` / `pickPlane` / `_planeDrawAlt` / `ensurePlaneIcons` / `_feHex` / `_outsetRing` / マークの定数の写し）・
  `recordTracks`・`applyPlanesMode`・旧経路の hover / click の枝・`planesData` / `planesTime` / `planesSynthetic`・
  `IntMapPlanes3D` の旧経路専用の診断（`screenPos` / `pickAt`、`state()` の掃引・被覆・押し出しの数値、`aviation().v2`）。
- 残したもの: 実高度の設定（`planes3D`・鍵 `intmap_planes3d3`。GPU cloud へ `lift` で渡る）、航跡
  （`planeTracks` / `drawTrack` / `TRACK_*` レイヤー——#R506 で worker の記録が流れ込む先）、選択・詳細カード・
  ツールチップ、`IntMapPlanes3D` の `set` / `select` / `find` / `track` / `trackStats` / `aviation()`（Atlas の
  `layers.aircraftTrack` がこれを通る）。マークの宣言は `js/plane-glyph.js` だけになった。
- `scripts/outbound-hosts.json` の `api.airplanes.live` 行（probe ごと）。規則 ③「台帳はコードより長生きしない」。

## 2. 失敗を述べる

- `src/aviation-worker.js` の `poll` は失敗に `reason`（`http`＋`status` / `network` / `parse`）を付けて投げ、
  worker の error 返信がそれを運び、`src/aviation-worker-client.js` が Error に戻す——`js/layer-state.js` の
  `classify` がそのまま読める語彙。
- `js/aviation-live.js` `start({ onState })`: poll の失敗は**在庫が 0 機のときだけ** `onState('failed', err)`、
  snapshot を運んだ poll が来たら `onState('ok')`（1 回だけ）。在庫がある間の失敗は本物の機体が古くなりつつある
  だけで「描けなかった」ではない（`status().updating` がそれを述べる）。飛ばされた poll（同じチャンネルが
  飛行中・endpoint 無し）は何も運ばないので、どちらも言わない。
- `js/data-layers.js` `_av2State` → `layerState.report('dl-planes', …)`。行に pill、読み上げは状態に入ったときに
  1 回（`js/notify.js`）、Atlas は `IntMapLayerState.get('dl-planes')`。`startTraffic('planes')` は `_av2Start()` を
  返し、行の要求（`toggleLayer` の `req` → `layerInflight` → `layerState.request`）になる——起動できなければ
  `reason:'unsupported'` で reject する。箱は外さない（外した箱は利用者が外した箱と見分けがつかない）。

## 3. 出典・プライバシー（AGENTS §3-4）

- 詳細カードの出典の既定値: `airplanes.live · ADS-B` → `ADS-B`。記録は必ず `_srcLine`（フィードの
  `x-intmap-attribution`）を持って作られるので、既定値に届くのは直に開いたときだけ。provider の名前は
  焼き込まない（`docs/AVIATION-DATA-SOURCES.md` §3）ので、既定値は provider を名乗らない——`_planeSourceLine()`
  がフィードの名乗る前に言うのと同じ語。
- GIS 行 `aircraft`（`js/map-ui.js`）: 出典・権利はフィードの attribution から、`on` は基盤から、
  `featuresIn` / `summary` は `IntMapAviation.snapshotFor()`（描画器が読んでいるバッファそのもの）から。
  消した `src-planes` を読み続ける行は「機体 0」と答え続けるので、読み先を今描いているものに移した。
- プライバシー §4: 「?aviation=v1 のときに限り airplanes.live へ…」の節を en / jp とも削除、`LEGAL_DATE`
  2026-10-01、変更の理由を `js/legal-text.js` の記録に 1 段落。
- 出典ページ（`js/locales/pages.*.js` の `airplanes.live`）: **判断** — 行は消さない（9 言語体制は凍結で、
  行の削除は縮小にあたる）。1 文目（「もう使っていない・403・adsb.lol から配信」）は事実のまま。2 文目
  （「今も参照しているのはプレビュー画像だけ」）は事実でないので、**en と jp は正しい文に書き換え**
  （「お使いのブラウザからこのサービスへ要求が送られることもありません」）、**残り 7 言語は該当文を削った**
  （IntMap が書く文は en+jp——CONSTITUTION §7。事実でなくなった訳を残すより、正しい 1 文目だけにする）。
- `README.md` の出典の一覧: airplanes.live → adsb.lol（ODbL 1.0）。

## 4. i18n

- 撤去した機能の文言 3 キー（`Simulated placeholder (live feed unavailable)`・`planesZoomHint`・
  `planesAreaHint`）は、呼ぶコードが消えたので `check:i18n` の dead-key 規則が拒んだ。
  `scripts/i18n-dead-key-codemod.mjs --write` で 22 行（＋`scripts/zh/00-ui.json` の 2 行）を外し、
  `tests/i18n-coverage-floor.json` を `--update-floor` で下げた（7 言語とも keyed −2、inline / positional −1＝
  インラインの「Simulated placeholder…」の 1 組）。**理由: 文が述べていた機能そのものを撤去した。**
  新しく足した利用者向けの文は無い（失敗の文は `js/layer-state.js` の既存の en+jp）。

## 5. 検査

- 新規 `tests/remove-synthetic-planes-checks.test.mjs`（4 本、評価）: ① `js/data-layers.js` の `_av2Start` /
  `_av2State` を構文木から切り出し、実物の `js/aviation-live.js`・`src/aviation-worker-client.js`・
  `js/layer-state.js` と 403 を返す worker で回す——行は `failed` / `http` / 403、通知は 1 回、描画器に渡る機体は
  0、回復で `ok`、在庫がある間の失敗は `ok` のまま ② 起動できない基盤は `unsupported` で reject し行に載る
  ③ worker の `poll` を切り出して回す——訊く先は aviation-feed だけ、失敗の理由が付く。ブラウザが読む全ファイルを
  `scripts/outbound-hosts.mjs` の構文解析で走査し `airplanes.live` への要求 0 ④ 撤去した名前がコードに無い。
- 旧経路・合成機を名指していた node 検査は、守っていた事実が残るものは**今それが住む場所**へ
  （マーク・縁取り・大きさの表は `js/plane-glyph.js`、軍用機の赤は worker の `COL`、実高度は `lift`、
  pick は cloud の pick、航跡は `_av2TrackApply` を切り出して実行）、旧掃引にしか無い事実（歩調・格子・持ち越し・
  押し出しの色補正・被覆の案内・部品の底）は理由を書いて撤去した。`?aviation=v1` で起動していた
  spec 9 本（r172/r173/r174×2/r175/r185/r186/r191/r192）も同じ。
- 否定した見立て: 「旧経路の描画は v2 でも hidden で作られていたので残してよい」——作られるだけで何も
  流れ込まない層で、`restored-layer-before-style` はその名前（`lyr-planes`）を「航空機が地図に載った」の
  証拠にしていた。⚠ 証人を GPU cloud（`lyr-aircraft-cloud`）に替えた最初の版は**赤になった**——cloud は
  MapLibre の custom layer で、`getStyle().layers` には通常の起動でも出てこない（実測。基盤は `live:true`、
  行は hermetic な網で `failed / network`）。報告の本体（「Style is not done loading」＝同期の add）が今も
  起きうるのは航跡のソースとレイヤー（`setupPlanes`）なので、証人は `lyr-plane-track`。
- 撤去に連れて直した検査の数: `layer-pointer-performance` の tooltip の setter 採用数の床 37→31（6 か所は
  撤去した描画の hover / click / pick だった——直書きに戻したのではない）、`shell-map-input` の claimClick は
  `if(…claimClick) …claimClick(e)` の綴りも受ける（事実は同じ）、`heal-waits-for-inflight` ④ は aircraft の行が
  基盤の起動を要求として返すことを知る、`shell-i18n-locales` は撤去した `planesAreaHint` を問わない、
  `tests/fetch-deadline-baseline.json` は `js/data-layers.js` 4→3。
- 同じ実行で `tests/shell-css-surface-checks.test.mjs` の `#R508 ②` が赤（`js/ui-stack.js` の `act()` の形）。
  この作業はどちらのファイルにも触れていない——既存の赤で、ここでは直していない。

## 5b. 航跡のズーム追従を戻した

`#R174` の「航跡の帯は縮尺から太さを決めるので、ズームが変わったら描き直す」は、撤去した押し出し描画の
再構築（`_planes3DZoom`）に相乗りしていて、**その層が表示中でなければ何もしない**書き方だった——GPU cloud の
経路（#R341 以降の既定）では一度も走っていなかった。押し出し描画を外すときにこの枝をどうするかを決める
必要があり、航跡だけを訊く形（`_trackZoom`：`zoomend` / `terrain` → 選択中なら `drawTrack`）で残した
（`tests/geo-flight-3d-checks.test.mjs` の #R174 がこの行を求めている）。

## 6. 残したこと・気づいたこと（直していない）

- **#R246 の民間機のシアン `#00D9FF` は GPU cloud では描かれていない。** worker の `COL` は民間機を高度で
  `#35E0FF`→`#008CFF` に塗る（#R341 から）。`#00D9FF` を持っていたのは撤去した旧経路だけだった。
  検査（r244 ⑧）は軍用機の赤だけを worker に訊くようにし、民間機の色はここに記録するだけにした。
- 詳細カードが開いている間に機体の数値が poll ごとに更新されるのは旧経路（`recordTracks` の
  `P.update`）だけだった。GPU cloud の経路では #R341 以降もともと更新されない。
- 実高度の切り替えで航跡が平面 / 3-D に切り替わるのは、次のフレーム（最大 12 秒）で描き直されたとき。
  旧経路の `applyPlanesMode` は GPU cloud の経路では #R341 以降もともと効いていなかった（ズームのほうは §5b で戻した）。
- `supabase/functions/aviation-feed` には provider `airplaneslive` の選択肢が残る（`AIRPLANESLIVE_ENABLED=1`
  のときだけ。ブラウザの経路ではない）。

## 統合時に足したこと — 民間機の色が利用者の指示と違っていた

#R246 の指示は「民間機：シアン `#00D9FF` 軍用機：鮮赤 `#FF3040` 両方とも：より太いアウトライン」。この指示を守っていたのは今回撤去した旧経路だけで、現行の描画（`src/aviation-worker.js` の `COL`）は民間機を高度のグラデーション `#35E0FF`→`#008CFF` で塗り、註は「パレットはそのまま引き継いだ」と述べていた——**`#00D9FF` の機体は現行経路で一度も描かれていなかった**。指示どおり民間機は単色の `#00D9FF` に戻した（軍用 `#FF3040`・縁取り 2.6 は元から一致）。回帰は評価で色の値を確かめる。
