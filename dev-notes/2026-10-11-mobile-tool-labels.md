---
title: 携帯の Map tools シートで、ボタン名の 1 語目が消えていた（「Distance / area」が「/ area」）
date: 2026-10-11
newsen: On phones, the Map tools buttons show their full names again (Distance / area, 3-D volume, Map screenshot).
newsjp: 携帯の「Map tools」のボタン名が、途中で切れずに全部表示されるようになりました。
---

本番検証で見つかった既存の欠陥。携帯シートのボタンはデスクトップの実ボタンの文字を写すが、写すときに
「先頭の 1 語はアイコンの絵文字」と仮定して落としていた（`js/mobile-ui.js` の `/^(\S+)\s+([\s\S]+)$/`）。
アイコンが `[data-icon]` の SVG になってからは先頭の語がラベル自身で、「Distance / area」→「/ area」、
「3-D volume」→「volume」、「Map screenshot」→「screenshot」になっていた。位置ではなく何であるか（`[data-icon]`・svg・img）で
アイコンを外す `labelOf()` に替えた。`tests/smoke.spec.js` の tools-out-of-layers ④ が全タイルのラベルを実ボタンと照合し、
旧コードで赤になることを確認した。
