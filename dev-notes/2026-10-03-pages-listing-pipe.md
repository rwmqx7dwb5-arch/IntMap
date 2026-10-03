---
title: 本番公開の組み立てが「ls | head」の SIGPIPE で落ちていた——サイトが検索入口ページで数千ファイルに増えた日から、以後の公開がすべて止まる形
date: 2026-10-03
---

〈依頼〉 #932 の本番検証で、直後の #934（bot の性能天井）の公開が `deploy failure` だった。

## 0. 測った

run 37104326436「Deploy (production, Pages)」の Build + verify → Assemble site: `ls: write error: Broken pipe`、exit 2。この step は `set -euo pipefail` の下で `echo "Site contents:" && ls -la _site | head -30` を走らせる。

## 1. 原因

`head` は 30 行を読むとパイプを閉じる。marketing-engine（#932）が歴史地図の入口ページ 3,382 枚を足して `_site` の一覧が長くなったため、`ls` は閉じたパイプへ書き続けて SIGPIPE で死ぬ。`pipefail` がそれを step の失敗にする。#932 自身の公開は通った（同じ一覧で通る回があるのは、ls が 30 行を書き終える前に head が閉じるかどうかの競争だから）。⇒ 再現は確率的で、以後の公開はいつ止まってもおかしくない。

## 2. 直したこと

ci.yml と deploy.yml の 2 か所（と同じ形の db.yml の 1 か所）を `ls -la _site | sed -n "1,30p"` に替えた（sed は最後まで読むので、パイプを先に閉じない。表示は同じ 30 行）。

## 3. 検査

`tests/pages-listing-pipe-checks.test.mjs`: 全 workflow ファイルを歩き、ディレクトリ一覧を head に流す行を拒む。直す前の木では赤になることを確かめた。
