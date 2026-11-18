---
title: Atlas の turn の事実が実行器に届いていなかった——期限切れを取り消す signal も途中で捨てられていた
date: 2026-11-19
---

依頼: 外部の性能監査の指摘「時間切れの処理が裏で走り続ける」。時間切れで呼び出しごとの signal を abort する修正は並行して #1233 が先に入れた。それを実コードで追うと、その signal が実行器に届かない欠陥が残っていた。

- `js/atlas-toolsurface.js` は `runAction(action, turn)` と呼ぶが、`js/atlas-console.js` の接続は `(action)=>` で `turn` を捨てていた。`externalContentSeen` も `callSignal` も実行器側の `_runOne` に届かず、期限切れの取り消しは実質働いていなかった。

直し: 接続を `(action,turn)=>` にして転送した。#R801 の「外部コンテンツ印」も本来の設計どおり届くようになる（挙動は変わる）。

検査: `tests/atlas-tool-cancel-checks.test.mjs`（surface が turn を渡し、console が転送し、`_runOne` が callSignal を読む）。
