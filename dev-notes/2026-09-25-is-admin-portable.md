---
title: 本番に is_admin() が無く、エラー記録の migration が適用できなかった——引数なしの is_admin() をどの DB にも同じ形で置いた
date: 2026-09-25
---

## 0. 測った

自前のエラー記録（`client_errors`）の migration を本番へ適用したところ、`42883: function public.is_admin() does not exist`
で**全体が巻き戻った**（表も関数も作られていない。記録を先に「適用済み」にしてしまったので `reverted` へ戻した）。
本番は baseline から作られておらず、管理者判定は **`is_admin(uid uuid)`**（SQL・search_path=public）だけを持つ。
baseline（＝CI のすべての DB）は **`is_admin()`**。`20260722100000_security_r155.sql` はこの分岐を記録し、
**どちらも呼ばない**ことで回避していた——次に admin 専用のポリシーを要る migration がそのまま踏んだ。

## 1. 直したこと

`20260925105000_is_admin_zero_arg.sql` が、**どの DB にも**baseline と同じ本体の `is_admin()` を置く（冪等）。
CI では同じ定義の置き直し、本番では足りない関数が加わる。本番の `is_admin(uuid)` は本番のポリシーが呼んでいるので残す（何も消さない）。
これで、admin 専用ポリシーを持つ migration は本番と CI で同じ関数を呼べる。
