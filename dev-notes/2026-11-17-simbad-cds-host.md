---
title: SIMBAD を CDS の正規名で引き、CDS が止まっている間は CDS が名指すミラーから建てる（配備後スモーク #R533 の赤）
date: 2026-11-17
---

〈依頼〉 main の配備後スモーク `tests/prod-smoke.spec.js` の #R533（配信物が名指す第三者ホストがすべて DNS で引けるか）が
2026-11-16 の run 43950174057 から赤。名指していたのは `js/reference-data.js` の SIMBAD 出典行の `simbad.u-strasbg.fr`。
その機能が何をどこへ問い合わせているかを確かめ、現行の窓口が同じ問いに答えるかを実測し、到達経路を直す。

## 0. 測った（2026-11-16〜17、手元から）

- **ブラウザは SIMBAD に何も問い合わせていない。** 名指しは 2 か所だけ: 出典ページのリンク（`js/reference-data.js`）と、
  `data/deep-sky.json`（「宇宙を探索」の太陽系外 150 天体）を建てる `scripts/build-deepsky.mjs` の TAP。後者は配信物に
  入らないので #R533 は前者だけで赤くなった。ただし builder も同じ死んだ名を問うていた（毎日の自動更新が落ちる）。
- `simbad.u-strasbg.fr` は **DNS から消えた**（ENOTFOUND）。ストラスブール大学の合併前の別名。
- 正規名 `simbad.cds.unistra.fr` は**引けるが、`/simbad/` 以下はすべて 404「currently unavailable」**。根 `/` は 200 で、
  CDS 自身の告知（2026-11-09 付）: サイバーセキュリティ事案で SIMBAD・VizieR などが縮退中、代替として
  **CfA Harvard のミラー**（2026-10-14 までの取り込み）と **IDIA（南アフリカ）のミラー**の TAP を名指している。
- builder の ADQL を 3 窓口に同じ形で投げた:

  | 窓口 | Messier | 名指し天体（4 件の抜粋） | Messier の距離 |
  |---|---|---|---|
  | simbad.cds.unistra.fr | 404（HTML） | 404 | 404 |
  | simbad.cfa.harvard.edu | 110 | 4 | 740 |
  | simbad.idia.ac.za | 110 | 4 | 739 |

- 直した builder を一時ディレクトリで実走: CDS 404 → CfA で **150 天体・距離あり 131**（出荷中の 2026-10-21 版と同数）。

## 1. 直したこと

- `scripts/build-deepsky.mjs`: 窓口を**宣言された順序** `SIMBAD_TAP`（CDS の正規名 → CDS が名指す CfA → IDIA）にした。
  1 回の build は**全表を 1 つの窓口から**読む（取り込み日の違う 2 つの DB を混ぜない）。窓口が全問に答え床を越えたら
  書き、だめなら次の窓口で最初からやり直す。全滅なら何も書かず、各窓口の理由を並べて非零終了。`source` に
  答えた窓口を書く（「read from simbad.cfa.harvard.edu (the CfA Harvard mirror named by CDS)」）。CDS が戻れば
  誰も編集せずに正規名へ戻る。GOVERNANCE の `url` は正規名。
- `js/reference-data.js`: 出典行を `https://simbad.cds.unistra.fr/` へ。根は CDS 自身のサービスの表口で、事案中は
  ミラーを案内する告知が出る（`/simbad/` は今 404 なので根を指す）。
- `docs/DATA-GOVERNANCE.md` の builder 表の行を同じ内容に。
- `data/deep-sky.json` は**作り直していない**。中身は 2026-10-21 に CDS 本体から読んだもので、`source` の
  「simbad.u-strasbg.fr」は当時の事実。ミラーは 10-14 までの取り込みなので、今ミラーで上書きすると古くなる。
  自動更新が次に走るとき、答えた窓口の名で書き直される。

## 2. 回帰テスト

`tests/upstream-liveness-checks.test.mjs` ⑥b（偽の fetch をホスト別に答えさせる形に拡張）:
出典行のホスト＝builder が宣言する窓口のホスト／正規名が最初に問われる／正規名が 404 ならミラーから書かれ `source` が
その名を言う／次のミラーは問われない／全滅なら書かれず全窓口の理由が出る。旧コードでは「正規名が死んでいたら何も
書けない」で落ちる。

## 3. 残り

- CDS の事案が明ければ builder は自動で正規名へ戻る。出典リンクの `/simbad/` 直リンクに戻すかは、その時に CDS の
  表口がどこかを見て決める（今は根で足りる）。
