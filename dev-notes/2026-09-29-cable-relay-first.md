---
title: 海底ケーブルの予備の取得が、必ず CORS で拒否される直接取得を先に試していた——自前の中継を先に、直接は中継の無いビルドの最後の段に
date: 2026-09-29
---

〈依頼〉多面的な監査の続き。本番検証（ビルド 001f263）で、鉄道の計測中に `www.submarinecablemap.com` の
`landing-point-geo.json` と `cable-geo.json` が CORS で拒否され、コンソールにエラー 4 件（CORS 2・`net::ERR_FAILED` 2）。

## 0. 測った

同梱の `data/subcables.json` が時計（無音 6 秒）に掛かったとき、`_cableNet` は `[u, ownRelayUrl(u)]` の順に
読む。submarinecablemap.com は ACAO を送らないので、**ブラウザのどの origin からも直接取得は一度も成功しない**
（#R187/#R188 の実測と同じ）。#R190 が直接を先に残した理由「読んでよい origin から開かれることがある」に
当たる origin は、ブラウザの中には無かった。だから予備に落ちるたびに、確実に失敗する要求とエラーが先に出ていた。

## 1. 直したもの

`_cableNet` を `[ownRelayUrl(u), u]` の順に。直接取得は、中継の無いビルド（`ownRelayUrl` が `''`）で唯一残る
手段としてだけ最後に残す。`tests/r190-checks` の順序の主張を新しい順に直した。

## 2. 検査

`tests/r190-checks`・`r355-checks`・`stalled-fetch-and-surface-gauge-checks`（全枝の期限）緑。`check:static`・`check:engine` 緑。
