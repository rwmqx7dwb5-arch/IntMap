---
title: ティッカーの能力が、同じ処理の二重の写しをやめて ticker.on/off を呼ぶ
date: 2026-11-19
internal: 挙動は同じで、能力とコマンドの実装を 1 本にした
---

〈依頼〉 未主張のコマンドを能力行へ寄せる（capability-command-bridge の続き）。

- `panel.ticker` の run は `window.imTicker=…; IntMapTicker.apply()` を自前で持ち、`ticker.on/off` の本体と
  同じことを二重に書いていた。`kexec('ticker.on'|'ticker.off')` に寄せ、`commands` に宣言した（未主張 47 → 45）。
  `IntMapTicker` が無いときの失敗報告と `saveSettings` はそのまま。
- 見送り: `panel.workspace`（`open()!==false` で「デスクトップ専用」を判定しており、コマンドは戻り値を捨てるため
  寄せると失敗報告が消える）。`map.isolateCountry` は分離の入口が他にもあり、別の整理が要る。
  戻り値を持つコマンドへ直してから寄せる。
- 本番検証（4623d53 より前の build 8c06c36）: 読み込み・資産 200・投影/基図ボタン・3 タブは確認。
  地図の描画は preview の幅 0 で未測定。世界銀行 API の CORS ブロックが Countries タブで 1 件（新規かは未比較）。
