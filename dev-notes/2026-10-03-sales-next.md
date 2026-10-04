---
title: 授業ツアーを紙にする「印刷用ワークシート」と、相談のコンソールの「パイプライン」——学校に持っていける授業パックと、話が始まった組織を落とさない台帳
date: 2026-10-03
newsen: Classroom tours can be printed as worksheets: each step becomes a map image with its legend and sources, ready to hand out.
newsjp: 授業ツアーを印刷用ワークシートにできます。各段が凡例と出典つきの地図の絵になり、そのまま配れます。
---

〈依頼〉「改善ではなく商品開発、マーケティング、営業。足し算。全権を委任する」の営業の 2 本目。
同じ日の sales-channels（窓口・相談フォーム・紹介ページ）が**話を受ける口**を作ったので、その上に
⑴ 学校へ持っていける**授業パック**の欠けていた半分（紙）と、⑵ 受けた話を**最後まで追う**台帳を積んだ。
料金・契約・外部サービスの設定・外部への送信には触れていない。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 授業ツアー | 宣言 3 本・自作（ツアー作成）・Atlas の一時ツアー。学習指導要領の項目は `CURRICULUM` で宣言済み | 投影はできる |
| ツアーを紙にする経路 | 無い。各段を手でスクリーンショットするしかなく、そうすると**凡例も出典も無い**絵になる | 生徒の机に届かない／出典の条件を満たさない |
| 地図を 1 枚の絵にする部品 | `js/map-recorder.js` の絵葉書（凡例と出典を焼き込む）。export されていない | 作り直さず借りる |
| 地図が描き終えたかの判定 | `js/time-lapse.js` の `drawnNow`（時間の核・タイル・境界の記録）。export されていない | 同上 |
| 相談のその後 | `org_inquiries.status`（new / replied / closed / spam）だけ。「返信したか」であって「使ってくれそうか」ではない | 5 件並ぶと次に忘れるのはどれか、を誰も持っていない |
| 状態の語 | `['new','replied','closed','spam']` が migration の CHECK・生成器・`js/admin-inquiries.js` の 3 か所に綴られていた | 4 つ目の語を足すと黙って 1 か所がずれる |

## 1. 印刷用ワークシート（`js/tour-worksheet.js`）

- 授業モードのパネルにプリンタのボタン（`data-imt="sheet"`）と、Atlas の `panel.tourWorksheet`（`id` を渡せば始めてから作る）。
- **撮り方は既存の 3 つだけ**: 段はプレイヤーの `go(n)`（共有リンクの復元と読み返し）、描き終えは
  `time-lapse.js` の `mapDrawn`（`drawnNow` を export しただけ）、絵は `map-recorder.js` の `postcard`（`export { postcard }` と
  `siteBrand()`）。合成器も「描けたか」の判定も写していない（検査 ② が `getContext`・`drawImage`・`toBlob` の不在を見る）。
- 撮り終えたら先生がいた段へ戻す。撮っている間は地図を隠さず、上に小さな進捗だけを出す（撮っているのは地図そのものだから）。
- **描けなかった段は撮らない**: 隠れたタブ（絵葉書の `not-drawn`）と 30 秒（`DRAW_WAIT_MS`・推定。根拠と失効条件は定数の横）
  までに描き終えなかった段は、半分の絵を載せず「撮れませんでした」と紙に書き、Atlas の結果がその段を名指す。
  シートは開いているので Atlas には `ok` で返し、撮れなかった段は facts に入れる（失敗として返すと、紙ができているのに
  同じ操作を繰り返させる——`.agents/rules/one-pass-or-a-reason.md` §2 の 1）。
- **紙は 2 種類**: 生徒用（題・宣言ツアーの学習指導要領の項目・組／番号／氏名・段ごとの題・日付・地図・問い・解答欄 4 行）、
  教員用（加えて読み上げる文と、宣言ツアーなら段を開く短いアドレス `index.html?tour=<id>&step=<n>`——プレイヤーはクエリだけで
  段を復元する。自作ツアーのアドレスは 8 KB 近くあり紙に書けないので出さない）。足元に全段の出典を重複なく文字でも書く。
- 印刷は `window.print()`。`@media print` は `html[data-worksheet]` の間だけ効き、プレビュー以外を隠す。紙は常に白地に黒。
  プレビューが開いている間、プレイヤーはキーを譲る（そうしないと Esc でツアーごと終わり、矢印で裏の地図が動く）。
- 授業ページ（`teachers.html`・`ja/teachers.html`）の「授業ツアー」の節に 1 文（`scripts/landing-text.mjs`）。

## 2. パイプライン（`js/admin-pipeline.js`・migration `20261003211800_org_inquiry_pipeline.sql`）

- `org_inquiries` に `stage`（lead → talking → trial → adopted | declined、既定 lead）・`next_step`（≤300）・`next_step_on`・
  `stage_changed_at`。**状態とは別の軸**（返信したか ≠ 使ってくれるか。採用した報道機関が新しい質問を書けば状態は new）。
  grant はこの 4 列を authenticated に足すだけで、誰が書けるかは既存の RLS（管理者だけ）。新しい policy・anon の grant は無い。
- コンソールの Pipeline タブ: 開いたときだけ `import()`（素の script からの動的 import——window に何も出さない）。
  段ごとの列、区分 × 段の件数、**期日が運営者の暦日で今日以前のもの**、段が進んだのに期日の無いもの、ページが知らない段
  （表とページが食い違っている——隠さず言う）。spam と支援者の掲載申し込みは載せない。
- **語は 1 か所**: `inquiry-shape.js` の `INQUIRY_PIPELINE`（statuses・stages・closedStages・notLeads・nextStepMax）。生成器が
  `<main>` の `data-*` に書き、`admin-inquiries.js` と `admin-pipeline.js` はそれを読む。**既存の状態の綴り 2 か所も同時に
  読む側へ移した**（初期のタブと handled_at の判定）。検査 ④ は 2 つのスクリプトがどの語も文字列として綴っていないことを見る。
- 保存期間（730 日）は変えていない。adopted も消える——事例は相手の書面の同意から書く（`docs/sales/README.md` 4b）。

## 3. 構造として直したもの

- 状態の語が 3 か所に綴られていた → 宣言 1 つ・ページの `data-*`・読む側（上の 2）。
- `INQUIRY_LIMITS` に `next_step` を足すと sales-channels ① が「全部の上限が 150000 の migration にある」で落ちる
  （正しい落ち方）。パイプラインの上限は別の宣言 `INQUIRY_PIPELINE.nextStepMax` にし、その migration に照らす。
- 管理画面の入力欄の名前を `placeholder`/`aria-label` の英語の直書きにすると `check:i18n` の属性監査に当たる
  （コンソールは英語だけでも、監査は js/ の全部を見る）。目に見える `<label>` で包んだ。

## 4. 検証

- 段 0: `node --test tests/sales-next-checks.test.mjs`（6 件）。関連: classroom-tours・tour-builder・sales-channels・map-postcard・icon-system の検査。
- 段 1: `check:static`・`check:i18n`・`check:catalog`・`check:capabilities`・`check:archfiles`・`check:surface`・`check:types`・`check:docs`・
  `node scripts/org-pages.mjs --check`・`node scripts/landing.mjs`（check）。
- 段 2: `npx playwright test tests/sales-next.spec.js`（ビルドしたアプリ・ヘルメティック: `?tour=ww1-europe&step=2` → プリンタ →
  全段が 1200×630 で復号できる・生徒用に教員の文が無い・教員用に段ごとのアドレス・印刷のメディアで紙だけ・閉じると段 2 に戻る）。
  1 回目で緑（47 秒、`tests/durations.json` に 45 秒で記録——未計測の spec は core に数えられ、`check:docs` の段の件数が動くため）。
  ⚠ 1 回目の起動は webServer の 180 秒（このマシンで 14 セッションが同時にビルド中）に間に合わず、先にビルドして `IM_PREBUILT_DIST=1` で走らせた。
  撮った紙を目で見た: 段ごとに地図・日付の札・凡例・出典の帯・問い・解答欄が並ぶ。⚠ ヘルメティックな環境は基図と外部のタイルを
  返さないので、**明治 1868 の令制国の線が紙に載るかはここでは確かめられない**——本番での確認が要る（授業ツアーの段そのものの描画で、
  ワークシートは描き終えた地図を撮るだけ）。
- `check:perf` は緑。新しい async chunk `tour-worksheet`（13.8 kB）。手元の eager raw が天井より +13.8 kB と出たが、eager に入った
  この作業の差は能力の行 1 本（数百バイト）だけで、残りは手元の node_modules が junction（OneDrive の長いパス）であることによる
  モジュール名の差と見ている（判定は「増えて幅を超えたときだけ赤」で、緑）。
- ⚠ pgTAP（`supabase/tests/27_org_inquiry_pipeline_test.sql`）はこのマシンに Docker が無く**手元では走らせていない**。CI の DB ゲートが初回。

## 5. 残したこと

- deploy: migration `20261003211800_org_inquiry_pipeline.sql`。それまでコンソールの Pipeline タブは「表を読めません——migration は適用済みか」と言う
  （相談の受け付けは影響を受けない——`stage` は既定値で埋まり、Edge Function は列を名指さない）。
- 組織向けの有料案（共有ワークスペース等）は `PRODUCT.md` §2.4 に手を入れていない（未承認の設計案で、business-account の作業場があるため）。
