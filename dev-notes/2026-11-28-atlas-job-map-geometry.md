---
title: 永続ジョブの GIS 成果物の座標を地図まで渡す
date: 2026-11-28
newsen: Atlas can restore a background job’s GIS result and draw it using its stored coordinates.
newsjp: Atlas がバックグラウンドジョブの GIS 成果物を復元し、保存された座標で地図に表示できるようになりました。
---

本番では Natural Earth の京都が元データの経度 135.748・緯度 35.032 から約 60 km 離れた位置に描かれた。完了したジョブを再読する検査で、状態取得から成果物の ID が渡らず、同じ GeoJSON が別版として保存されることを確認した。

`jobs.status` は保存済みの GeoJSON のジオメトリ型と復元引数を Atlas に渡す。`work.job restore` は描画に使えるデータセット ID を返す。回帰検査は 500 地物から絞った 1 件を実際の能力経路で復元し、描画の入口に渡る座標と、作業ストアに保存した出典を照合する。
