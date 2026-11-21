---
title: 昼夜の夜側が、描画の準備が間に合わなかった 1 回で永久に出なくなっていた——準備ができたときに作り直す
date: 2026-11-20
newsen: The day and night shading on the satellite globe no longer fails to appear when the map is still loading at startup.
newsjp: 衛星の地球儀で、起動時に地図の準備が間に合わないと昼夜の陰影が出ないままになる不具合を直しました。
---

〈依頼〉「Day & night shading が壊れている。夜側が十分に暗くならない・昼側に大気が出ない」。報告者は Edge、どのズームでも、
レイヤーはゼロ。提示された画面は 2026-11-21 00:46 JST（15:46 UTC）、z1.59、アジア上空で、地球が全面明るく夜側の陰影が無い。

## 0. 測った
- 仮説「noAir（Night Lights / Wind など）が大気を止めている」は否定。dl-nightsat をオンにすると `atmosphere-blend` は 0、オフで戻る（ローカル・本番とも）。
- 仮説「Edge で GPU が WARP と判定され im-limb が断られる」も否定。`edge://gpu` は Intel Arc・WebGL ハードウェア、
  レンダラー名は拒否条件（swiftshader/llvmpipe/software/microsoft basic/warp）に当たらない。
- 本番を同じ URL（`#v=90.8558,30.2166,1.59,…&d=dl-nightside&sat=1`）で直接開くと再現した: 25 秒後も
  `IntMapNightSide.state().built === false`、画面は白い球。45 秒後に build され夜側が正しく出た（`_nightAt(30,90)` は最初から 1）。
  つまり計算は正しく、**作られていなかった**。

## 1. 原因
`consider()` は `moveend` と `styledata` でしか呼ばれない。そこで予約した idle の `go()` は `build()` が先頭の
`canDraw()` で false を返すと何もせず戻り、**もう一度呼ばれる経路が無かった**。1 分ごとの tick は `built` のときの再描画だけ。
カメラが静止したまま描画の準備が遅れた起動では、次のイベントが来るまで（来なければ永久に）夜側が無い。

## 2. 直し方（構造）
- `go()` が build できなかったとき、描画できない状態なら `GE().whenCanDraw()`（エンジン自身の待ち。真のときだけ解決）を待って `consider()` をやり直す。
- 分あたりの tick は `built` なら再描画、未構築なら `consider()`（描画可能なのに build が失敗する場合の再試行は、ここだけで、ループにしない）。
- 夜側の濃さ（z4.6 で 0 になる設計）には触れていない——仕様変更は求められていない。

## 3. 検証
- `tests/daynight-air-checks.test.mjs`（読み取り検査・理由は冒頭）。
- 未検証: 昼側の大気は本件の再現では異常なし（im-limb 有効・blend 約 0.41）。報告の「大気が出ない」が同じ根（起動時の遅れ）かは、修正後に報告者の Edge で要確認。

## 4. 大気が出ない件（続き・実測）
報告者の Edge（Intel Arc・WebGL ハード・最新の同一ビルド）では、`?limb=1` で強制しても独自の大気（im-limb）が入らなかった。
`addLimb` は false を返し、`map.addLayer` は一度も呼ばれず、console にも何も出ない。判明した除外: 指の端末ではない
（coarse=false, touch=0）、WebGL2 は有る、地図の canvas も WebGL2、`IntMapSkyModel.tables()` は正常、読み込まれた版は本番と同じ。
拒否が bare `false` で理由が読めなかったので、`addLimb` は自分がどの段で返したかを残し、`IntMapGeoEngine.layers.limbWhy()` で読めるようにした
（例外は console.warn にも出す）。原因の確定は、この版が本番に出たあと報告者の Edge で `limbWhy()` を読んでから。
