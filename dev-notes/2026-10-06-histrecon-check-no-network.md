---
title: 門はネットワークを拒まれて走る——RISTAT の 504 が無関係な PR を赤くした（check:histrecon）
date: 2026-10-06
internal: CI と npm test の門の走らせ方だけの変更で、地図にも読者にも見える変化は無い
---

〈依頼〉PR #1022（無関係な基盤の変更）が CI run 37406113749 の Gates 2/3 と Regression 3/3 で赤。原因は
`check:histrecon` が `scripts/histrecon/atoms/ristat-1897-uyezd.mjs` 経由で dataverse.nl から RISTAT 1897 の郡を
取りに行き HTTP 504 を受けたこと。第三者の障害が merge の門になっていた。

## 0. 測った

- 赤い run のスタックは `loadDossiers` → `Module.catalogue` → `rows()` の `fetch`。行番号（377/417）は #1017 の版で、
  #1021 が `--check` を `scripts/histrecon/atoms/catalogue-lock.json` だけを読むように直した**後**の main では再現しない。
  つまり 1 件は既に直っていたが、**それを守るものは無かった**——同じ形の門が次に足されても誰も気づかない。
- 現 main の `--check` を、`fetch` と非 loopback の socket を投げる preload ＋ **空の部品キャッシュ**で走らせて緑（1 秒）。
  #1017 版の `--check` を同じ条件で走らせると Natural Earth の取得で**決定的に**落ちる（RISTAT より手前）。
- 宣言された門 35 本を全部同じ条件で走らせた: build を読む 2 本（check:perf・check:assets）を除く 33 本は全部 exit 0・
  拒否 0 件。build 後の 2 本も同条件で確かめた。他の histrecon の部品（gb-adm*・ne-admin1・ottoman-anatolia-kaza）は
  どれも `fetch` を持つが、門からは呼ばれていない。`check:histfill` の WDQS 取得も組み立て時だけ。

## 1. 直したもの

規則を `check:histrecon` 1 本ではなく**事実（宣言された全ての門）**に付けた。

- `scripts/no-network.mjs` — preload。`fetch` と非 loopback への `net.Socket#connect` を `no-network: …` で投げる
  （http/https/tls/undici はここに行き着く）。`NODE_OPTIONS` で子孫にも効く（npm → node）。
- `scripts/gate-universe.mjs` の `gateEnv()` — 門に渡す環境。CI（`ci-gates.mjs`）も `npm test`（`test-parallel.mjs`）も
  全ての門をこれで走らせる。build そのものは門ではないので渡さない。
- 生の取得は組み立て器の仕事のまま。部品の一覧が古ければ門は「組み立て器を走らせよ」と落ちる（#1021 の挙動）。

## 2. 検査

`tests/histrecon-check-no-network-checks.test.mjs`: ① 守りが空振りでない（空キャッシュの RISTAT 読みが拒まれる）
② `check:histrecon` が拒まれた状態・空キャッシュで緑 ③ `gateEnv` が二重に積まず孫プロセスにも効く ④ `npm test` の
計画が門だけに印を付ける ⑤ CI の shard がネットワークに出る門を赤にする（使い捨ての木で評価）。
走査木を写す 2 本の既存検査（ci-build-once・process-test-tiers-and-shards）は `new URL('./x', import.meta.url)` も
依存として辿るようにした（`gateEnv` が preload をそう名指すため）。
