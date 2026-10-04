---
title: 調査ノートを利用者から見えなくする——機能とデータは残し、切り替えは 1 か所
date: 2026-10-04
newsen: The Atlas investigation notebook is no longer shown: nothing new is recorded and Atlas no longer offers it. Anything you saved earlier stays where it was.
newsjp: Atlas の調査ノートの表示を止めました。新しく記録することはなく、Atlas もノートを提案しません。以前に保存したものはそのまま残っています。
---

〈依頼〉利用者:「Investigation notebook とかいう謎機能」。選択の回答:「機能だけ残すけど、いったんユーザーには存在せず、見えないように。」

## 何をしたか

- 切り替えは `js/atlas-notebook-store.js` の `NOTEBOOK_SHOWN`（`false`）1 か所。理由・戻す手順は定数の註。
- 入口の実測（全数）: Atlas 欄の上の帯とシート・設定（`js/atlas-notebook.js` の `mount`/`show`）、Atlas の能力 3 本
  （`js/atlas-cap-notebook.js`）、ブリーフィングのノート側の入口 4 つ（`js/atlas-briefing.js`: 今と比べる・ノートに保存・
  ノートから足す・ノートのファイル）と `briefing.share` のノート読み。コマンドパレット・ツール欄・設定・ギャラリー・
  オンボーディング・whats-new に入口は**無かった**（grep で 0）。
- 能力は `policy.withdrawn`（既存の撤去の仕組み）。`node scripts/atlas-caps.mjs --write` で `WITHDRAWN` を再生成し、
  呼ばれても `FEATURE_WITHDRAWN` で答える。カタログの節の見出しはブリーフィングのものに改めた。
- 隠している間は新規記録なし（`fileTurn` は保存も同期もしない。ブリーフィング用に claim されたターンだけは
  綴じずに渡す）。既存データは触らない。
- プライバシー文（`js/legal-text.js`・en/jp）を「現在は提供していない。以前に保存したものは残る」に直した。
- 検査: `tests/notebook-hidden-checks.test.mjs`。ノートのロジック（保存・書き出し）の検査は残した。

## 戻すとき

`NOTEBOOK_SHOWN = true` → `node scripts/atlas-caps.mjs --write` → 台本録画の再生成 → プライバシー文を戻す。
上の検査は定数を `true` にした版のソースでも全入口を見つける。
