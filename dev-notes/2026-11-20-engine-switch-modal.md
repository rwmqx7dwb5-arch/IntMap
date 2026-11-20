---
title: 地図エンジンの切替が、ネイティブ確認ダイアログを出さない環境（Claude アプリ内ブラウザ）で一切効かなかった
date: 2026-11-20
newsen: Switching the map engine in Settings now asks in IntMap's own dialog, so it also works in embedded browsers that block native pop-ups.
newsjp: 設定で地図エンジンを切り替えるときの確認が IntMap 自身の画面になり、ネイティブのポップアップを出さない埋め込みブラウザでも切り替えられるようになりました。
---

〈依頼〉本番検証の最中、利用者が Claude アプリ内ブラウザで設定から Cesium に切り替えられなかった（確認ダイアログが出ない）。Edge では正常だった。

## 何が起きていたか

`js/app-body.js` の `setting-engine` は `window.confirm()` で「再読み込みします。切り替えますか？」と訊いていた。
Claude アプリ内ブラウザはネイティブダイアログを出さずに `false` を返す（本番検証の subagent も同じ理由で切替できなかった）。
結果、選択は黙って元に戻り、エンジンを変える手段が無かった。

## 何を直したか

- アカウント画面にだけあった `_acctAsk`（アプリ内の確認・入力ダイアログ）を `js/ask-dialog.js` の `askInApp()` へ移し、
  `js/auth-ui.js` はそれを呼ぶだけにした（asker は 1 つのまま。2 つ目を書かない）。
- エンジン切替はそれで訊く。キャンセル・Esc・外側クリックで選択が元に戻る点は同じ。
- 引き継いだもの: 既存の 5 つのアカウント画面の確認は、同じ DOM・同じ CSS（`acct-ask-*`）・同じ挙動のまま。

## 触らなかったもの（範囲外）

ほかに `window.confirm()` を使う箇所がある（admin-corrections / admin-inquiries / atlas-notebook / community など）。
同じ環境では同じ理由で効かないが、頼まれた範囲ではないので変えていない。一覧は `grep -rn "confirm(" js`。

## 検査

`tests/engine-switch-modal-checks.test.mjs`（切替が `askInApp` を使い `confirm` を呼ばない・asker の DOM を作るのは 1 ファイルだけ）、
`tests/desktop-one-entry.spec.js`（ネイティブダイアログ 0 件・アプリ内ダイアログが出て、キャンセルで元に戻る）。
