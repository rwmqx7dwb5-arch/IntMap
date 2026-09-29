---
title: Service Worker がデプロイのたびにページのオフライン用キャッシュ 3 つを消していた——#R189 は 1 つだけを名前で例外にし、後から足された 3 つは例外表に入らなかった。所有を名前の接頭辞（intmap-page-）という事実にした
date: 2026-09-29
---

〈依頼〉「IntMap、様々な側面から監査し、すべてやりきって。全部任せる。求めるのは修正ではなく改革」——Service Worker とキャッシュの側面の監査で見つかった。

## 0. 測った

- `sw.js` の activate は「現行のタイルキャッシュ以外を全部消す」。#R189 がそこへ `!/^intmap-subcables-/.test(k)` を足して、ページが書く海底ケーブルのオフライン用の写しだけを例外にした（コメントは「Keep page-owned intmap-* caches」と一般則を述べるが、コードは 1 つの名前しか見ない）。
- その後ページは 3 つのキャッシュを足した: `intmap-nwszone-v1`（NWS 予報区・180 日）・`intmap-swicgeo-v1`（SWIC 警報区・7 日）・`intmap-bnd-v1`（geoBoundaries）。**3 つとも例外表に無く、SW が更新されるたびに消えていた**——#R189 が閉じた「一度取れたものが次の訪問で無い」窓が 3 回開き直していた。
- 形: **例外の一覧が、次に足されたものを黙って落とす**（`.agents/rules/no-ad-hoc-hardcoding.md` §2-4）。

## 1. 直したこと

- 所有を**名前が運ぶ事実**にした: ページが所有するキャッシュは `intmap-page-` で始まる。`sw.js` の `keepOnActivate(name)` は `CACHE` とその接頭辞だけを残す（それ以外は従来どおり消すので、#R16 の「古い index.html を生き残らせない」は保たれる）。
- ページ側の 4 つを `intmap-page-subcables-v1`・`intmap-page-nwszone-v1`・`intmap-page-swicgeo-v1`・`intmap-page-bnd-v1` に改名。旧名の写しは次の SW 更新で 1 回だけ消え、ページが次に取れたときに作り直す（オフラインの写しを 1 回失うのは、従来の毎デプロイより少ない）。
- 否定した案: 例外表に 3 つを足す——次に足される 4 つ目で同じことが起きる。

## 2. 検査

`tests/sw-cache-names-owned-checks.test.mjs`——`js/`・`src/` の `caches.open(…)` を全部**発見**して名前を解決し、`sw.js` を `vm` で**評価**して偽の Cache Storage に対し activate を走らせる。① ページの全キャッシュが残る ② 現行は残り、旧版（`intmap-tiles-v1`）・見知らぬ名前・旧名のページキャッシュは消える。変異（規則を 1 つの名前の例外に戻す）で ① が `intmap-page-nwszone-v1 is deleted` と赤くなることを確かめた。旧名を綴りで固定していた r188・r189・r293・r297・r383 を新しい名前へ合わせた。
