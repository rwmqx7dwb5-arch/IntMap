---
title: 直せる版が無い開発用の勧告を、期限付きの台帳で例外にする——npm audit の赤が全 PR と bot を止めていた
date: 2026-11-18
---

〈依頼〉main と全 PR で赤だった `Dependency advisories (npm audit)` を、おまかせで片づける。

## 0. 測った

- 原因は picomatch の ReDoS 勧告 `GHSA-fc5q-39xc-vjpf`（範囲 `<=4.0.7`）。vite → tinyglobby → fdir の開発用ビルド道具が使う。
- 直せる版が**無い**: npm の最新が 4.0.7 で範囲の内側。`npm audit fix --force` は vite を動かすだけで勧告は残る（2026-11-18 実測）。
- ブラウザへ配る側（`--omit=dev`・全重大度）は緑。赤かったのは開発用の「high 以上」の段だけ。
- 副作用: 赤い PR には perf 天井の bot（#1192）と週次データ更新（#1133・#1200）が merge しない。必須検査ではないので人の PR は止まらなかった。

## 1. したこと

- `scripts/audit-gate.mjs`: `npm audit --json` を読み、`scripts/audit-exceptions.json` の行にある勧告を除いて high 以上を数える。行は理由・測った日・`expires` を持ち、期限の日から再び数える（赤になり、そう言う）。60 日を超える期限は検査が拒む。
- `security.yml` の開発用の段をこれに差し替え。ブラウザへ配る側の段は無変更。
- 既存の例外は picomatch の 1 行（期限 2026-12-18）。

## 2. 引き継いだもの

- 消えた能力は無い: 他の high/critical は従来どおり赤になる（`tests/audit-picomatch-exception-checks.test.mjs` ②）。picomatch は修正版が出るか期限が来れば再び数える。
- 外す条件: 修正版が出たら行を消す。上流を見るのは期限の日。
