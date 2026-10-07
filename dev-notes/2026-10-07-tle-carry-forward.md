---
title: 同梱の衛星カタログが上流障害で 15,956 件から 1,685 件に縮んだ——「CelesTrak か SatNOGS か」の二者択一をやめ、直前の束を母集合に持ち越して合成する
date: 2026-10-07
newsen: The satellite layer now shows the full catalogue even when its upstream is down.
newsjp: 衛星レイヤーが、上流の障害中でも全カタログを表示するようになりました。
---

〈観測（#1025）〉`data/tle/catalogue.tle` が CelesTrak の 15,956 件から SatNOGS の 1,685 件に減り、manifest は
`errors: ["celestrak: HTTP 500"]`。本番は直取得も fetch-relay も失敗して同梱の束だけが答えるので、
「Live satellites」が 1,408/1,685 になった。`groups.json` も CelesTrak のグループ一覧が取れないと全グループが消える。

## 原因

`scripts/build-tle-snapshot.mjs` が「CelesTrak が答えれば CelesTrak、答えなければ SatNOGS」の二者択一で、
約 1,700 件の鏡の部分集合が直前の約 16,000 件を丸ごと上書きした。

## 直し

合成の規則を `scripts/lib/tle-compose.mjs` に 1 か所だけ持ち、ビルドとテストが同じ関数を使う。

- CelesTrak が答えた回: CelesTrak の active が母集合の正。そこに無い ID は落とす（減衰・再突入した物体を残さない）。
- 答えなかった回: 直前の束の ID を母集合に持ち越し、SatNOGS の要素で、epoch が新しいものだけ更新する
  （SatNOGS だけが知る新規の物体は実データなので加わる）。NORAD ID ごとに epoch の新しいほうが勝つ。
- `catalogue.json` は `sources: {celestrak, satnogs, carried}` と `lastCelestrakAt`（CelesTrak が最後に答えた時刻）を持つ。
  持ち越しに上限は置かず、この欄で長い障害が見える。アプリは `newestEpoch` だけを読み、要素の年齢表示は従来のまま正しい。
- `groups.json`: 取れなかったグループは直前の ID（今回の束に在るものだけ）を持ち越し、`carried` / `carriedSince` に記録。
  一度も知られていないグループは従来どおり欠落（空配列ではない）。
- `data/tle/` の 3 ファイルは #1024 の版（15,956 件）へバイトそのまま戻した。次回の定期実行は正しい母集合から合成する。

## 検査

`tests/tle-carry-forward-checks.test.mjs`: 合成関数を実際に評価する 8 件（CelesTrak 失敗時に件数が縮まない・成功時は
active に無い ID が落ちる・新しい epoch が勝つ・groups の持ち越し・同梱束の整合）。全 UI 文字列の追加は無い。
