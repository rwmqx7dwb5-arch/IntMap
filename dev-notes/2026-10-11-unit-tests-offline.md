---
title: Node の回帰テストは他のホストへ出ない——geoBoundaries の 504 が無関係な PR の Regression を赤くした
date: 2026-10-11
internal: テストの走らせ方と 2 本のテストの測り方だけの変更で、地図にも読者にも見える変化は無い
---

〈依頼〉2026-10-10、PR の CI「Regression N/3」で `tests/hist-recon-expand-checks.test.mjs` の
「dossier-check: two dossiers under one polity key that name different countries do not share a catalogue」が
45.8 秒かけて `geoBoundaries HTTP 504 …/gbOpen/MMR/ADM3/geoBoundaries-MMR-ADM3.geojson after 3 attempts` で落ちた。
主張（2 つの dossier が別の国を名指すなら catalogue を共有しない）はネットワークを要らない規則。

## 0. 測った

門（`check:*`）は 2026-10-06 から `scripts/no-network.mjs` の下で走る（`gate-universe.mjs` の `gateEnv`）が、
**`npm run test:checks`（CI の Regression）はその外だった**。そこで同じ拒否を回帰テスト全体に掛けて全件を走らせ、
拒否の記録をテストファイルごとに集めた（`INTMAP_OFFLINE_LOG_DIR`）。結果: 7,158 件中 失敗 0・skip 5（dist/ が無い分）。
ただし失敗しなかったのは**例外を飲み込んでいた**からで、記録には次が残った。

| テスト | 何に触れていたか | 直し方 |
|---|---|---|
| `hist-recon-expand-checks` の catalogue 共有 | `dossier-check.mjs` の CLI を子プロセスで走らせ、英領インドの 2 dossier（`BRI-provinces-1886`＝IND,PAK,BGD,MMR／`-1937`＝IND,PAK,BGD）の geoBoundaries ADM3 を GitHub から取得 | 規則は catalogue の**キャッシュの鍵**であって幾何ではない。CLI の繰り返しを `checkFiles(files, { load, log })` として export し、読み込み器を注入して評価する。合成の 2 dossier（XXA／XXA,XXB）で「少ない国から先に」走らせ、鍵から国の一覧を抜く変異で `atomCountries: no atoms for XXB` が出て**赤**になることを確かめた。出荷している混在組についても、読み込みが国の一覧ごとに 1 回ずつであることを測る |
| `atlas-geo-resolve-checks` R413 ⑤ の `'91, 0'` | 座標として拒まれた文字列が地名検索へ落ち、`nominatim.openstreetmap.org` に実際に問い合わせていた（結果は上流の答え次第で null） | 主張は座標の解析器のもの。その 1 回だけ地名検索に「見つからない」（`[]`）を答えさせる。緯度の上限を 91 に緩める変異で**赤** |
| `chronos-unnamed-shapes-checks` | `fetch('data/…')`（相対パス）。node の fetch はそもそも拒む | 欠陥ではない。拒否は http(s)/ws の URL だけに掛け、URL でないものは node の fetch にそのまま渡す |
| `histrecon-check-no-network-checks` | 自分の fixture が `https://example.org/` を叩き、**拒まれることを主張**している | そのまま（拒否が主張そのもの） |

curl / wget / git の遠隔操作は 0 件（`git clone` は 3 ファイルにあるが、どれも一時ディレクトリのローカル repo）。
「上流が今答えるか」を主張するテストは 0 件だったので、nightly / upstream 側へ移したものは無い。

## 1. 再発防止

`scripts/test-checks.mjs` が `NODE_OPTIONS=--import=tests/helpers/offline.mjs` を渡す（`offlineEnv()`）。
CI の Regression も `npm test` もこの 1 本を通るので、**テストファイルと、テストが起動する node スクリプトの全部**に効く
（今回の 504 は後者の形だった）。`offline.mjs` は拒否そのものを持たず `scripts/no-network.mjs` を読み込み、
テストに要る 2 点だけを足す: loopback への fetch は通す（テストは 127.0.0.1 で自分の fixture を配る）／node でない
ネットワーク・クライアント（遠隔 URL を持つ curl・wget・git clone/fetch/pull/push/ls-remote）を拒む。

除外は**ファイル自身が理由を書く**: コメントに `network-allowed: <理由>`（10 文字以上）。一覧はどこにも持たない。
理由は `INTMAP_NETWORK_ALLOWED` として子プロセスへ継がれる。現時点で除外しているファイルは 0 本。

`tests/unit-tests-offline-checks.test.mjs` は**ランナーそのもの**を使い捨てのファイルに走らせて、fetch・https の
ソケット・子の node・curl と遠隔 git が拒まれ、ローカル git と loopback が通り、理由つきの印だけが除外になることを測る。
ランナーから `offlineEnv` を外す変異で赤。

⚠ 手で `node --test tests/x.test.mjs` と打った場合は守られない。ランナーと同じ条件で再現するには
`NODE_OPTIONS=--import=<tests/helpers/offline.mjs の file URL> node --test tests/x.test.mjs`。
