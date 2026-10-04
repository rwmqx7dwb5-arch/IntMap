---
title: 本番検証で見つかった第 2 波の不具合を直す
date: 2026-10-04
---

## 新着（読者の行が無くて「新着」に第 2 波が載っていなかった）

- **実測**: 本番の updates.xml・設定 ▸ 新着に第 2 波の機能が 0 件。第 2 波の記録 14 本（ux-next・news-next・map-next・
  watch-places・sales-next・security-next・developer-embed・community-next・mobile-next・science-next・marketing-next・
  atlas-briefing・collection-workspace・atlas-reach）が `newsen:`/`newsjp:` を持たず、`scripts/whats-new.mjs` は
  持たない記録を黙って飛ばす。ops-next は持っていた。wave2-train（統合そのもの）と map-motion（main に未着地）には付けていない。
- **直した**: 14 本それぞれの本文を読み、読者に何が変わったかを en/jp の 1 行にして front matter へ足した（本文は触らない）。
  `node scripts/whats-new.mjs --print` で第 2 波が載ることを確認。
- **構造の穴**: 次の記録も書き忘れれば同じく黙って飛ばされる。`scripts/dev-notes.mjs` の `newsOmissions`（`--check` が呼ぶ）を足した。
  判定は名前の一覧でなく **branch の差分の事実**: その branch が記録を新しく足し、かつ `PRODUCT.md` を変えた／ルートに `*.html` を
  足したなら、その記録は `newsen`/`newsjp` か `internal: <理由>` を持つこと。書かないことを判断にする。
- **限界（確かな判定ができないので足していない）**: 新しい能力・レイヤーが PRODUCT.md にも新ページにも触れない場合は検出できない。
  また squash した統合 commit は複数の記録を 1 commit に持つので、履歴からは「どの記録がどの変更の持ち主か」を言えない——
  そのため差分は merge-base との比較に限り、その branch で**足された**記録だけを問う。未追跡のファイルは git の差分に出ないので、
  commit 前（add 前）の `--check` では見えない。検査は `tests/ops-next-checks.test.mjs`。

## ストーリー（2 語以上で必ず時間切れになっていた）

- **実測（本番 cb3a391・2026-10-04・anon）**: `rpc/news_story_terms` は「earthquake」でも 3.76 s で 500 57014、
  「earthquake japan」と見出し全体は 3.06 s で 57014。`?story=earthquake,japan` も「この出来事の流れを追う」も
  「ニュースの収集に到達できませんでした」と出ていた——サーバーは**応答していた**（時間切れと言って）。
- **根本原因（読み取り専用の EXPLAIN ANALYZE を anon で）**: `news_story(['earthquake'])` は 630.8 ms、同じ条件を
  リテラルで書くと GIN 索引で 15.1 ms。SET 句のある SQL 関数は引数の値を見ずに計画され、汎用計画は期間を ~1 行と
  見積もって `idx_news_events_first_published` を歩き、**期間の 18,420 行すべての見出しを語に切って** `@>` を試していた
  （prepared statement＋force_generic_plan で 633.9 ms と再現）。旧 `news_story_terms` はそれを語ごとに 2 回・対ごとに
  1 回呼んだ（1 語 1,291 ms）。依頼の見立て（語ごとの呼び出し）は半分で、もう半分は**1 回の呼び出しが既に全表**だったこと。
  PGlite で再現するには本番にある時刻の索引を足す必要があった（無いと GIN しか道が無く 5 ms で通る——前回の計時が
  見逃した理由）。足すと PGlite でも 2 語 2.1〜3.3 s・見出し全体 48〜53 s。
- **直した**（`20261004090000_news_story_one_scan.sql`・署名と権限は同じ）: `news_story_terms` は GIN 索引を 1 回だけ
  読み（文の語のどれか・`&&`、MATERIALIZED で期間を入れない）、行ごとに語の所属と「文の書き方か」を 1 回求め、
  件数・大文字・対の共起をその集合の GROUP BY で出す。`news_story` も照合を囲いに入れ、期間は結果に掛ける。
- **答えは変わらない**: 本番の行（2026-10-03 の 18,786 行）で新旧を PGlite に通し、fixture の 7 見出しの jsonb と、
  提案された語の行の集合が完全一致。
- **後の計時**（本番・同じ汎用計画・3 回の最遅）: 18 / 43 / 266 / 647 ms（1 語・2 語・AfD の見出し・11 語）、
  ありふれた語だけの 17 語 987 ms。`news_story` 2〜24 ms。PGlite の実見出し 418 本: 中央 155・p95 500・最大 1,131 ms。
- **否定した案**: 語ごとに索引の posting list を引いて所属を取る形（見出しを切り直さないので本番で約半分の時間）は、
  統計の無い表で計画器が seq scan を選ぶと **語の数 × 行数** に戻る（PGlite・統計なし 4,000 行・24 語で 7.8 s）。
  `&&` の 1 回読みは最悪でも行数 × 2 回で、語の数に依らないので、こちらを採った。
- **エラーの言い分け**: `js/news-story-core.js` `failureOf` が失敗の SQLSTATE／PGRST 符号から 時間切れ・権限・未配備・
  データベース不在・ネットワーク・その他 を分け、カードはそれぞれを言い（どれも「ストーリーが無いという意味では
  ありません」を添える）、Atlas の要約に `errorKind`・`errorCode` を足した。符号の無い例外は fetch の例外のときだけ
  「到達できない」と言い、それ以外は「エラー」（分からないものを到達不能と描かない）。
- **検査**: `tests/news-next-checks.test.mjs` ⑪〜⑭（最後に定義した migration を発見して本体の構造を測る——`news_story`
  を呼ばない・表を読むのは 2 回・索引を読む CTE は囲われ時刻条件を持たない・数は GROUP BY／計時の記録／`failureOf`）。
  `supabase/tests/25_news_story_test.sql` §4（本体が `news_story` を呼ばない・囲いがある・**24 語 × 4,000 行が
  anon と同じ 3 s の statement_timeout の内に答える**——旧本体は PGlite で 8.3 s、新本体 1.8 s）。
- **残り**: 期間の総数 `n` は時刻の索引の index-only scan だが可視性マップが古く（heap fetch 11,087）、冷えたキャッシュでは
  約 1.2 s かかる（旧本体も同じ）。本番 DB への適用は CI の配備。

## UI（本番 cb3a391 で測った 5 件と、nightly の r753）

- **マイマップの「編集」が読めない**: 実測（ダーク）で字 rgb(245,245,247)・地 rgb(240,240,240)＝WCAG 比 1.05。原因は色ではなく
  **順序**: `.mm-pop-edit` の規則は My map のパネルを開いたときに足す stylesheet にあり、保存された作図のピンをパネルより先に
  押すと、ボタンはブラウザ既定の灰色の地にアプリの白い字で描かれていた。直し方は 2 つの事実に付けた——① `.plc-popup`
  （地図の上のカードの面）の上のボタンは、その面から地と字を取る（`:where(...) button`、特定度は素の `button` なので
  クラス／インラインで言うものが勝つ。同じ面で stylesheet が遅れる・無いボタン全部に効く）、② マイマップはカードを描くときに
  自分の規則を足す。`.mm-pop-edit` からは色を消した。検査は `tests/map-next.spec.js`（リロード後・パネル前にピンを押し、
  両テーマで WCAG ≥ 4.5。修正を外すと 1.05 で赤）。
- **誤り報告のカードがはみ出す・Esc で閉じない**: 1000px で右端 1021・× 1008。初回の配置が `幅 − 384` と**カードの幅を
  推測**しており、実際は 360＋余白＝406px で、全員 22px はみ出していた。いまはその場で測り、入れ物のうち窓に見えている部分の
  内側に保つ（開いたとき・カードの大きさが変わったとき——一覧は後から届く——・窓の大きさが変わったとき。携帯は
  stylesheet が `position:fixed` で留めるので触らない）。開くと focus を受け、Escape は × と同じで、サイドバーの Escape へ
  渡さない。`msg.focus()` は `preventScroll`（focus が地図の入れ物をスクロールさせない）。
  ⚠ **「他のカードが持つ共通の仕組み」は実在しなかった**: 非モーダルのカード（`.country-popup` 系）で「画面内に収める」
  「Esc で閉じる」を持つ共通部品は無い。`IntMapDialog` はモーダル（`aria-modal`・Tab の閉じ込め）なので非モーダルの
  カードには使えない。同じ「推測した幅で置く」形は `js/place-dossier.js`・`js/here-now.js`・`js/volcano-intel.js`
  ほか（`r.width - card.offsetWidth - 24` 型は測っているが窓に対して留めない）。共通化の置き場は
  `js/window-manager.js`（ドラッグの clamp を持つ）——今回の担当範囲の外なので提案として残す。
  検査は `tests/community-next.spec.js`（1000px）。
- **コマンドパレットにシミュレーターが無い**: レイヤー欄のツールの行は読者の言語の名前と説明を持ち、コマンドを `data-act`
  で運んでいたが、パレットは meta `btn` と `title` しか読んでいなかった。`nameCommand` が「既に名づけているもの」から名前を
  取る（コントロール→meta `title`）。`data-act` は値がカーネルのコマンドであるときだけ（他所では「play」等の局所スイッチ）。
  能力表の綴り（dispatch 名・別名）を検索語に足したので「radiation」で放射性プルームが出る。何も名づけていないものは
  理由を返して出さない（`tests/wave2-prod-fixes-checks.test.mjs`）。`window.IntMapCapabilities` の読みが 1 つ増えた
  （1→2）——登録簿は起動時に `js/app-body.js` が組む実体で、モジュールの export では取れないので `global-surface --update`。
- **スマホで企業の比較バーが検索の一覧に乗る**: 検索の候補の一覧はシートの「画面」と同じ場所を埋めるのに、画面の規則
  （ホームの中身を隠す）に入っていなかった。一覧に行がある間は同じ規則を当てる（css の `:has`）。国の比較バーも同じ形で
  同時に直る。検査は `tests/map-next.spec.js` の携帯の項（指の当たる先が一覧であってバーでない）。
- **1000px で殻が横にずれる**: `.operation-room` の `overflow:hidden` はスクロール容器で、閉じた右のレイヤー欄
  （`translateX(102%)` で右の外に駐車）が scrollWidth を 1,306px にしていた。`overflow:clip`（スクロール容器にならない）へ。
  パネルの設計（右は地図の上に重なる・左は列）は変えていない。検査は `tests/community-next.spec.js`（scrollLeft を
  書いても・`scrollIntoView` しても 0）。
- **r753（nightly 赤・2026-10-02 から）**: #901 がログイン中のアカウントボタンを指の 44px にするとき、見た目の丸も 44px に
  していた。丸は 34px に戻し、透明な `::before` で当たりを 44px にした（`overflow:visible`。`::after` は
  `js/place-watch.js` の新着の点なので使わない）。検査は弱めず、当たり 44px の測定を r753 ① に足した（シートを上げてから
  `elementFromPoint` で測る）。
- **確かめたこと**: 上の 5 件はどれも修正を外した build で赤（WCAG 1.05・barHit true・scrollLeft が 0 でない・ツールの行が出ない）、
  入れて緑。`ui-a11y-polish.spec.js`（携帯の 44px）も緑。
- **触っていない／残り**: `check:docs` と横断検査 `doc-facts-legal-pages` の赤は migration の数（48→49、同じ worktree の
  `20261004090000_news_story_one_scan.sql`）で、この節の変更ではない。
