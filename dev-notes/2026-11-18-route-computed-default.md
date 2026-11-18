---
title: Atlas の航路線の既定を海路計算に——route は basis を書かなければ海路エンジンの経路で、海上の経路が無い区間は描かずに報告する
date: 2026-11-18
newsen: Shipping routes Atlas draws now follow a computed path over water by default instead of a straight arc across land; a leg with no sea path is reported rather than faked.
newsjp: Atlas が描く航路は、陸を横切る弧ではなく、海上を通る計算経路が既定になりました。海路が見つからない区間は代わりの線を描かずに報告します。
---

〈依頼〉 利用者の決定「海路計算を既定に」（Atlas の地図説明で `type:"route"` の既定 `basis` を `schematic` から `computed` へ）。

`js/atlas-map-compose.js`: `basis` が無い `route` は `computed`（`IntMapRoute.seaPath`）。経路の無い区間は従来どおり `sea_path_failed` で描かない。
`flow` などの他の型と、明示した `"basis":"schematic"` は大円の弧のまま。能力文・`compose_map` の説明・`docs/architecture/02-features.md` を合わせた。
検査: `tests/atlas-completion-routes-checks.test.mjs` に「basis 無しの route は computed、flow は schematic」を足し、既存の A3 ① は
schematic を明示する形に（既定の変更は利用者の決定）。Atlas を触る既存検査 1,424 件とゲート（static・capabilities・catalog・atlasrepeat・docs・i18n）緑。
