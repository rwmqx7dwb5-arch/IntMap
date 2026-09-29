---
title: ページの拡大を読者に返した——viewport の user-scalable=no と maximum-scale を外し、iOS WebKit だけに入力欄の自動拡大の上限として maximum-scale を残す
date: 2026-09-29
---

〈依頼〉「IntMap、様々な側面から監査し、すべてやりきって。全部任せる。求めるのは修正ではなく改革」——
構造監査（`2026-09-29-structural-audit-reform.md` §5）が承認待ちとして残した「`user-scalable=no` の解除」を利用者が承認した。

## 0. 測った

- viewport の制限は `index.html:50` の 1 行だけ（他の html 6 本は制限なし）。依存するテストは 0 件、`gesturestart` 等の JS による抑止も 0 件。
- 地図のピンチは制限に頼っていなかった: 携帯幅（375×812・Android UA）で `.maplibregl-canvas-container` は
  `maplibregl-touch-drag-pan maplibregl-touch-zoom-rotate` を持ち、キャンバスと容器の computed `touch-action` は `none`。
  Cesium のキャンバスも `css/intmap.css` で `touch-action:none`。⇒ 地図の上のピンチは外しても地図のもの。
- ⚠ **単純に外すと iOS で退行する。** 携帯の起動直後に DOM にある入力欄 60 個のうち **39 個が 16px 未満**（10.5〜14px）。
  iOS WebKit は `maximum-scale` を読者のピンチには効かせない（iOS 10 以降）が、**16px 未満の欄にフォーカスしたときの自動拡大**
  の上限としては読む。外すと検索欄・日付欄をタップするたびにページが拡大される。

## 1. 直したこと

- viewport を `width=device-width, initial-scale=1.0, viewport-fit=cover` にした。
- meta の直後の inline script が、iOS/iPadOS の WebKit（iPhone/iPod/iPad の UA、または "Macintosh" でタッチ点を持つ iPadOS 13+）
  のときだけ `maximum-scale=1.0` を足す。そのエンジンではピンチを禁じられないので、足しても読者の拡大は奪わない。
- 否定した案: 入力欄を携帯で一律 16px にする——39 欄の見た目（レイヤー行の 10.5px の日付欄など）を変える、依頼に無い UI 変更。

## 2. 検査

`tests/pinch-zoom-allowed-checks.test.mjs`——綴りではなく、inline script を iPhone・iPad（デスクトップモード）・Mac・Android・
Windows の UA で**実行**し、得られた viewport を確かめる。全 html に `user-scalable=no` が無いこと、両キャンバスの `touch-action:none`。
