---
title: Atlas の確認カードを操作の決着まで残し、実行結果を同じ回答へ返す
date: 2026-11-28
newsen: Atlas keeps approval buttons available while it waits for you. A background job you approve appears in the same answer, and Atlas can refer to it when you ask again.
newsjp: Atlas は確認への返答を待つ間、実行とやめるボタンを表示します。承認して始めたバックグラウンドジョブは同じ回答に表示され、次の質問でも Atlas が参照できます。
---

修正前のビルドで、最終回答の確定時に「やめる」ボタンが DOM から外れることを再現した。「実行」の直後には HTTP 202 とジョブカードが観測できたが、最終回答は「未開始」のままだった。確認待ちを失敗扱いにしたためカードが消え、押下の処理はその場の HTML だけを書き換えていた。

確認を元の呼び出しの入力として待ち、決着まで安定した欄に表示する。決着後は既存の能力結果の経路で同じ回答へ戻し、確認結果の受領証を会話履歴にも残す。

既存の回答出典 spec のログイン済みページを再利用し、確認前の未実行、承認後の HTTP 202 とカードの保持、取りやめ、次のモデル入力への結果の引き継ぎを測る。変更後はローカル Chrome で全6件が16.8秒、確認の検査本体は2.8秒で通過した。
