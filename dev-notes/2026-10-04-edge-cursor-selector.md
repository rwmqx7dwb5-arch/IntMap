---
title: 辺のカーソルの直し（#992）が窓自身のカーソルまで消していた——継ぐのは子だけ
date: 2026-10-04
---

〈依頼〉 #992（`dev-notes/2026-10-04-studio-wait-edge-cursor.md`）の本番検証（ビルド印 `2026-10-04T14:09:17Z-14b4fc0`）。

## 0. 測った（本番・1280×800）

比較ウィンドウの左の辺（縦の中央・地図の canvas の上）で pointermove の後、窓に `im-edge-hover` は付いた。しかし canvas の computed cursor は
`auto`、窓の computed cursor も `auto`——窓の inline style は `ew-resize` なのに。

## 1. なぜ

#992 の規則は `.im-edge-hover, .im-edge-hover *{cursor:inherit !important}` で、**窓自身にも当たっていた**。`!important` のスタイルシートの
宣言は（`!important` でない）inline の `cursor:ew-resize` に勝つので、窓は親（`#map-container`）の `auto` を継ぎ、子はそれを継いだ。
ワークスペースの `.rz-hover *` は子だけを指していた——写したつもりで、窓を足していた。検査は規則の綴りを測っていて、窓に当たるかは測っていなかった。

## 2. 直したこと

規則を `.im-edge-hover *{cursor:inherit !important}` に（子だけ）。窓は自分に書かれたカーソルを持ち、子はそれを継ぐ。
`tests/studio-wait-edge-cursor-checks` ① に「規則が窓自身に当たらない」を足した。
