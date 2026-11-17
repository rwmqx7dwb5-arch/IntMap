---
title: すりガラスのサイドバーでも Atlas の入力欄がフォーカスで光らないように
date: 2026-11-17
newsen: The Atlas field no longer turns blue when you click into it with the frosted-glass sidebar styles.
newsjp: サイドバーをすりガラスにしているときも、Atlas の入力欄はクリックしても青く光らなくなりました。
---

〈依頼〉同日の「Atlas の入力欄の周りがハイライトされるのもやめて」の続き。本番検証で見つかった取りこぼし。

- 本番で、サイドバーの「Frosted glass」「Frosted glass (more transparent)」のときだけ、フォーカスで枠が主色
  （`rgb(0,105,219)`）になった。`css/intmap.css` のすりガラス用の規則
  `body.sidebar-translucent / .sidebar-glass2 #atlas-panel .atl-in:focus{border-color:var(--primary-color)}` が残っていた。消した。
- 取りこぼした理由は検査の形: ② は `js/atlas-styles.js` 1 ファイルだけを読んでいた。規則は関数（ファイル）ではなく事実に付ける
  （`.agents/rules/no-ad-hoc-hardcoding.md` §1）——`css/` と `js/` の全ファイルを発見して、`.atl-in:focus`（`:focus-visible` 以外）を
  選択子に持つ規則が 1 つも無いことを測るように書き直した。消す前の `css/intmap.css` に対して赤になることを確かめた。
