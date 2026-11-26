---
title: CDS の出典リンクをサービスホストでなく発行元の入口へ（事案中に DNS から消えたホストを名指さない）
date: 2026-11-26
---

# CDS の出典リンク — サービスホストでなく発行元の入口を指す (2026-11-26)

## 観測
- main の「Post-deploy smoke (live URL)」の (#R533) が `cdsarc.cds.unistra.fr, simbad.cds.unistra.fr` を DNS から消えたホストとして落ちていた（7ababefc 以降）。
- 実測（1.1.1.1・8.8.8.8・手元の resolver の 3 系統）: `simbad.` `cdsarc.` `vizier.` `aladin.cds.unistra.fr` は NXDOMAIN、`simbad.u-strasbg.fr` は A レコード無し。発行元の `cds.unistra.fr` は 200。
- `cds.unistra.fr` の告知（2026-11-18 更新）: CDS はストラスブールのサーバ網でサイバーセキュリティ事案の最中で、SIMBAD・VizieR 等を載せるホストを停止している。代替として CfA Harvard と IDIA のミラーを案内。**恒久移転ではなく一時的な事案**。
- ミラーは生きている: `simbad.cfa.harvard.edu` は 200、`simbad.idia.ac.za`・`vizier.cfa.harvard.edu` は名前解決する。

## 変更
- 出典の行（`js/reference-data.js`）が指す先を、サービスホストから**発行元の入口**へ: SIMBAD は `https://cds.unistra.fr/`（事案中はミラーを案内するページ）、Hipparcos は発行元の ESA `https://www.cosmos.esa.int/web/hipparcos/catalogues`。
- `tests/upstream-liveness-checks.test.mjs` ⑥b: 出典の host は builder の窓口の host と同一でなく**その親ドメイン（発行元）**であること、に改めた。
- smoke（`tests/prod-smoke.spec.js`）は変えない。「配った build が DNS に無い宛先を名指す」は本物の欠陥で、事案中でも読者にとって死んだリンクであることに変わりがない。直すのは宛先の選び方。1 ホストの例外は足していない。

## 引き継ぎ
- `scripts/build-deepsky.mjs` は元から正規 → CfA → IDIA の順で、CDS の復旧後は無編集で正規に戻る。
- `scripts/build-star-catalogue.mjs` の `cdsarc.cds.unistra.fr` は build 時のみ（配られない）。到達できなければ Harvard の BSC5 に落ちる既存の順序のまま。事案中に Hipparcos を作り直す場合は ESA / CfA ミラーの `ftp/I/239/hip_main.dat` の所在を別途確認すること（CfA の `/ftp/I/239/` は 404 だった）。
