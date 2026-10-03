---
title: 火山の週報が 502 だった——URL も解析も無事で、発行元が人による確認を前に置いていた。拒否を「読めなかった」と述べる
date: 2026-10-03
newsen: The weekly volcano report now says plainly when its publisher blocks automated reading, instead of failing without a word.
newsjp: 火山の週報が、発行元が自動取得を止めているときにその旨を表示するようになりました。
---

〈依頼〉 本番の `volcano-feed?feed=weekly` が 502 `upstream_error` を返し続け、火山カードを開くたびにコンソールエラーになる。

## 観測（判別の証拠）

- `curl https://volcano.si.edu/news/WeeklyVolcanoRSS.xml` は 403・`cf-mitigated: challenge`・46 kB の HTML
  「Smithsonian request verification」。`/`、`/rss`、`/API/`、`www.si.edu` も同じ。User-Agent を
  Chrome 風にしても、素の curl でも同じ。`robots.txt` だけは 200。
- したがって URL が移ったのでも、形式が変わって解析が壊れたのでもない。**発行元が機械の読み手の前に
  Cloudflare の確認を置いた**。GVP の WFS（webservices.volcano.si.edu）は生きているが、持つのは火山・噴火の
  台帳で週報は無い（層名を列挙して確認）。
- 確認の突破は行わない。代わりの出所は見つからなかった（週報は volcano.si.edu のみで発行）。

## 直したこと

- 中継: weekly の上流が非 2xx のとき 502 ではなく **200 `{rows:[], unavailable:{reason,status,checkedAt}}`**（10 分キャッシュ）。
  ネットワーク失敗は 502 のまま（こちらの失敗）。ash は変えない。
- 読み手 `js/volcano-intel.js`: `unavailable` を `failed` と別の状態にし、カードが週報の節で
  「読めなかった・発行元が拒否・最終確認日・活動の有無は述べていない」と述べる。
- 検査 `tests/volcano-feed-weekly-checks.test.mjs`: ハンドラを評価して 4 件。

## 残り

- 週報の中身（状況・本文）は上流が開くまで出ない。上流が 200 に戻れば無変更で復帰する。
- 要 deploy: `volcano-feed`。

## 統合時の性能予算（90d6aa65 へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- async chunk "volcano-intel": 104.6 kB → 106.7 kB
