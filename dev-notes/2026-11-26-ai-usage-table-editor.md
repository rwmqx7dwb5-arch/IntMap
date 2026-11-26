---
title: テーブルエディタから AI usage の値を直せるようにする——台帳の守りは API ロールだけに効かせる
date: 2026-11-26
newsen:
newsjp:
---

〈依頼〉 Supabase のテーブルエディタから `ai_usage` の値（count）を変更できなくなっている。

## 原因

`20261201110000_ai_ledger_alignment.sql`（#1447）の ③ が、台帳関数の外から来る `ai_usage.count` の書き込みを**全部**拒否する AFTER トリガにした
（解除は同じトランザクションで `set local intmap.ai_ledger = 'admin'`）。テーブルエディタは素の UPDATE を出すだけでセッション設定を足せないので、
運用者が画面から count を直す道が閉じた（42501）。

## 直し

新しい migration `20261202100000_ai_usage_table_editor.sql` がトリガ関数を差し替える: 台帳関数・`admin` 宣言はこれまでどおり通し、
**`current_user` が API ロール（anon / authenticated / service_role / authenticator）のときだけ拒否**、運用者のセッション
（postgres / supabase_admin＝テーブルエディタ・SQL エディタ）は通す。守りたかったのは API 経由の手書きで、運用者本人ではない。
負の値は従来どおり CHECK が 23514 で止める。台帳関数は無変更。pgTAP 17 は「所有者の手書きは通る・service_role の直書きは拒否」に更新し、
`tests/ai-usage-table-editor-checks.test.mjs` が関数の形を見る。

引き継ぎ: 「手書きを全員に拒否」→「API からの手書きを拒否・運用者は可」。API 経由で count を上げ下げして枠を操作する道は閉じたまま。
