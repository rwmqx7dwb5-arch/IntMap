---
title: Atlas の進捗表示を「作業の目的」の単位に作り直し、内部情報を既定の画面から外した
date: 2026-11-26
---

〈依頼〉発注書 ①進捗を目的単位に ②todo は展開時のみ ③送信直後に前の質問の todo ④費用・秒数・モデル名行 ⑤描画成功なのに「完了していないもの」
⑥英語の技術注記 ⑦「AI structured output was invalid」 ⑧地図の「Atlas 考え中」 ⑨GIS 操作ごとの赤いトースト。

## 根本原因と直し方

- **履歴が呼び出し単位だった**: 操作行は executor のイベントごとに 1 行、planner の待ちも 1 行（9 ステップ中 4 が「考え中」）。`atlas-progress.js` に
  **グループ**（レジストリのカテゴリの語が同じ連続操作＝1 行・主題を併記・呼び出しは行を開いたときだけ）を追加。think / write は行にせず見出しの live word のみ
  （reasoning の見出しは見出し側へ）。ステップ数はグループ数。trace は**最初から折りたたみ**、plan は展開時のみ（CSS）。
- **前の質問の todo（③）**: `plan.turn` は `current` を動かすだけでも今回に更新されるため、`thisTurn` が真になり旧 plan が今回の trace に描かれた。
  `declaredTurn`（steps を書いたターン）と `declaredThisTurn` を足し、plan view はそれで判定。
- **開発者表示が所有者に出ていた（④⑦）**: `aiDev()` は所有者アカウントを含むので、費用行・失敗の生文が所有者には常に表示されていた。
  `PROG.devNote()` を新設し、**console には常に、開発者表示では trace の展開部にだけ**出す。結果欄（成果物・調査結果）は失敗も model-only も含めない。trace の失敗の赤い × は常に控えめな「−」。
- **観測器の誤報（⑤）**: `unmetOf` が、(a) 呼び出しが 1 件も紐づかない step（pending）、(b) 完了した呼び出しと失敗が混在した step（partial）を「完了していない」としていた。
  どちらも「観測された未達」ではない（前者は skipped と別 step で完了済みを区別できない）ので外した。観測された partial/unobserved/waiting/stopped/running は従来どおり。
- **英語の注記（⑥）**: 日時変更の結果へ付けていた「描けない——この日時を述べる典拠がない」一覧を `hidden` の model-only 要素に。モデルは text として読めるまま、画面には出ない
  （各レイヤー行のタイトルが同じ事実を述べる）。
- **地図の表示（⑧⑨）**: 地図の pill（`atl-hud`）を撤去。赤いトースト（`.sat-toast` は `--info-mil`＝赤）は、Atlas のターン中は非 urgent を `notify.quiet` で
  描画せず log/console へ（`_setGoBusy` が窓を開閉）。ナビの urgent は従来どおり。

## 検査

`tests/atlas-progress-display-checks.test.mjs`（新）。atlas-progress / -one / -ux のうち、仕様変更に当たる 5 本を書き換え（grouped 行・pill 撤去・devNote）。
