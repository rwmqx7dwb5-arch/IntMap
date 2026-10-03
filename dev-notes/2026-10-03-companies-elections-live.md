---
title: 企業アトラスと国政選挙を「一度撮った写真」から生きたデータへ——週次の再取得、受領証、法定期限で遅れを測る、更新不能の理由、選挙区が述べる領域を CShapes に訊く、時間で流す
date: 2026-10-03
---

〈依頼〉「求めるのは修正・穴埋めではなく構造改革とイノベーション。足し算。保全。改革。商品開発。再開発。全権を委任する。」
の分野「企業アトラスと選挙を、一度撮った写真から生きたデータへ」。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 企業プロフィールの日付 | 533 件すべて `generatedAt: 2026-08-23` | 一括の写真 1 枚 |
| `osmPending` | 501 / 533 | OSM に訊けていない企業が 94% |
| 企業の更新 workflow | 0 本 | 写真を撮り直す者がいない（[[intmap-discovered-list-is-a-photograph]] と同じ形） |
| 選挙の収録日 | 2026-09-10 の一度きり。行に取得日も上流名も無い | 記録が遅れても誰にも見えない |
| 選挙の上流の生死 | 夜間の probe は**ブラウザの**上流だけ（`scripts/outbound-hosts.json`） | 選挙のビルドが読む 12 系統は誰も見ていない |
| 記録と世界のずれ | 米国下院は 2018 年で止まる／カナダ第 45 回（2025-04-28）が無い／ロシア 2026 年が無い | 理由は**パックのコメントにだけ**あった |
| 主張の検査 | `check:elections` は形式（両方向の結合・議席の算術）だけ | 「その日その土地が投票した」は誰も訊いていない |

上流の実測（2026-10-03）:
- open.canada.ca の `elections` 組織 55 データセット: 「45th General Election」は報告書の題名にあるが、**OGL の Official Voting Results は 42〜44 回だけ**。
- dkobak/elections: `2026.csv.zip` が 2026-10-02 に追加。ヘッダは `,region,tik,uik,uik_num,guid,…` で、2016・2021 にあった **`oik`（小選挙区）列が無い**。cikrf.ru は TCP 接続できない（09-09 と同じ）。
- MEDSL 下院 1976–2024（doi:10.7910/DVN/IG0UN2・版 15・2026-03-09）: ファイル API が **400「Guestbook response」**。
- Statistics Canada の 2013 年区割り zip: **どの UA でも 403**（新しい事実。カナダのパックを今日組み直すと 2013 年版が取れない）。
- GISCO の国境 GeoJSON が **2026-09-25 に再公開**され、`CNTR_NAME` が全部英語名になった（「Österreich」→「Austria」）。

## 1. 何を作ったか

### 企業
- **`scripts/companies/refresh-plan.mjs`** — 週ごとのバッチを選ぶ純粋関数 `plan()`。`osmPending` が先、次に古いプロフィール。`BATCH = 120`（根拠と失効条件は定数の註）。**索引にある企業だけ**を選ぶ（`build.mjs` は同一 QID の 2 行を全行を見て畳むので、片割れだけのバッチは 2 社目のトヨタを出荷する）。
- **`.github/workflows/companies-refresh.yml`**（月曜）— 計画 → `build.mjs --only` → `check:companies` → bot PR → `land-bot-pr`。`.cache/companies` は `actions/cache`（新しい鍵で毎回保存）で運び、osm.mjs の「訊く前に保存済みを全部読む」でバッチが累積する。dispatch の入力は env 経由で、数字以外は拒む。空の計画は「全部」にならない。
- **パネル** — 見出しに「取得日 YYYY-MM-DD」（`osmPending` なら「OpenStreetMap の拠点は未取得」）。
- **`check:companies` ㉑** — プロフィールが組み立てた日を持たない／未来／それより後に取った出典を持つ、を落とす。合格行に pending の残数を出す。
- 経路の実証として 3 社（3m・a-p-m-ller-holding・ab-inbev）を実際に組み直した（7 分 40 秒、型索引と国境の初回取得が大半）。3 社とも `osmPending` が外れ、498 / 533 になった。

### 選挙
- **受領証** — 選挙の行に `fetchedAt`／`fetchedFrom`（`build`／`commit`）／`up`、polity に `pack`／`refresh`。既存 134 行は `--annotate` で結果ファイルを最後に変えたコミットの日（2026-09-09）を `fetchedFrom: commit` として持つ——**導出の日付は導出だと名乗る**（historical-verification §2.3）。組み直しは結果のバイトが変わったときだけ `fetchedAt` を進める。
- **`scripts/elections/upstreams.json`** — パックごとの上流名・probe・**議院ごとの選挙間隔の法定上限**（条文の根拠つき）。両方向に照合。JSON なのは依存を入れない夜間の probe が読むため。
- **`--watch`**（`scripts/lib/elections-live.mjs`）— 各議院の「法が次を要求した日」と、`watch()` を持つパック（ca・ru・us）へのキャッシュ無しの問い合わせ。結果は `current`／`overdue`／`blocked`／`importable`。見られなかった watch は前の記録を残す。
- **`.github/workflows/elections-refresh.yml`**（水曜）— `--watch` → `importable` のパックだけ組み直し → `--check` → bot PR → `land-bot-pr`。
- **upstream-liveness** — `buildProbes()` が `upstreams.json` の 25 本も夜ごとに訊く（識別子 `elections/<pack>: <host>`）。初回: alive 23・refused 1（statcan）・dead 1（cikrf）。
- **凡例** — 選挙ごとに「取得日／記録日 · 上流名」、polity の `blocked` を「**更新不能** · 何が · なぜ · 最終確認日」（en + jp）。
- **主張の検査**（`scripts/lib/elections-claims.mjs`、`--check` に内包）— 各選挙区の内部を標本化し、投票日に CShapes のどの国にあったかを幾何で引く。2 国にまたがる選挙区を拒む。`--enumerate --year Y --in box` で人が読む一覧。
- **新しい読み方（商品）: 時間で流す** — 凡例の ▶ が同じ議院の選挙を順に再生し、**同じ区割りで戦われた前回から勝者が変わった選挙区**を黄色の太線で囲んで件数を出す。区割りが違えば「比較しない」と言う。`IntMapElections.play/stop/swing/freshness`。

## 2. 主張の検査が見つけた欠陥と、直したもの

**欧州議会 1979・1984・1989 年が統一後のドイツを描いていた。** 東ドイツは 1990-10-03 まで加盟しておらず、その 3 回に投票していない。標本 52 のうち 14（0.27）が投票日の東ドイツ。`eu.mjs` のコメントは「認められた時代錯誤」と書いていたが、**読者には何も言っていなかった**。
→ 統一前のドイツを GISCO NUTS-1 の西独 10 州から dissolve して描く（ベルリンは描かない——西ベルリンの議員は 1994 年まで議会が選んだ）。1994 年は別の版 `eu-ms-1994` になり、境界の版は 81 → 82。

閾値は実測で決めた（全 100 選挙・20,619 選挙区）。最初の判定（全標本のうち他国の割合 > 0.25）は**誤検出を 2 種**出した:
1. フランス北部の小さな選挙区（5908）が 33% ベルギー——CShapes と選挙当局が同じ国境を違う縮尺で描いているだけ。他国の標本の、自国の国境からの距離を測ると、一国の土地である選挙区では**最大 5.2 km**、東ドイツの標本は **15〜166 km** → `BORDER_KM = 10`。
2. フランスの海外選挙区が「フランスの外」——CShapes はグアドループ等を独自の単位として持ち、どこの属領かを持たない。⇒ **丸ごと別の単位にある選挙区は拒まず列挙する**（`elsewhere`）。海を隔てた飛び地の標本も除く（`DETACHED_KM = 500`）。
この 2 つを除くと、一国の土地の選挙区で他国の標本が残るものは**ゼロ**、統一ドイツは 0.27 → `FOREIGN_SHARE_MAX = 0.10`。

⚠ **否定された見立て**: 「法定上限を過ぎたら遅れ」だけで足りる——足りなかった。カナダ 2025 は上限（2026-12-20）の内側、ロシア 2026 も（2026-10-19）。解散・前倒しは上限では捕まらず、捕まえたのはパック自身の `watch()`。上限は `watch()` を持たないパックの最後の網。
⚠ **否定された見立て**: Wikidata の「選挙」項目で一般的に新しい選挙を発見する——2021-09 以降のカナダ・ロシア・米国を引くと州議会・補欠選挙・個別選挙区の項目が大量に混ざり、議院の母集合にならなかった。

## 3. 上流のずれ（GISCO の名前）

EU のパックを組み直したら、25 か国の `native` が全部英語になった。GISCO が 2026-09-25 に `CNTR_NAME` を英語に変えたため。**上流が述べなくなった現地語名を現地語名として運ばない**——`native` は `CNTR_NAME` が `NAME_ENGL` と違うときだけ書き、上流が述べている `NAME_GERM`／`NAME_FREN` を `de`／`fr` として運ぶ。これでは国名の現地語形（「Österreich」「Ελλάδα」）が消える縮小になったので、§3b で前の版からの引き継ぎに改めた（独・仏語名の追加は残した）。

## 3b. 仕上げ（依頼の追加 3 点）

- **保全**: 上の §3 の扱いは現地語名の縮小だった。いまは `eu.mjs` が**国コードで**前の版（HEAD にコミット済みの
  束を `ctx.previous(file)` で読む——組み直し中の作業ツリーではない）から現地語形を引き継ぎ、行に `nativeFrom`
  （`file`・`committed`〈その版のコミット日〉・`stated`〈その版が何から読んだか〉）を持たせる。引き継いだ名前を
  次の版がさらに引き継ぐときは**最初の出所を保つ**。独語・仏語名の追加はそのまま。現地語形が英語名と同じだった
  France・Portugal は引き継ぐものが無い。
- **Atlas**: `layers.electionPlay`（観測器 `layer`——地図を約束する能力は地図で確かめる規則 map-verified）・
  `layers.electionSwing`・`layers.electionFreshness`。どれもレイヤー自身の関数を呼ぶだけで、勝者も入れ替わりも
  日付も導き直さない。国だけを名指す呼び出しは `IntMapElections.latest(pid)` に訊く（id の綴りから国を推さない）。
  レジストリは 154 → 157（到達可能 156）で、能力数を書いている 4 文書を直した。
- **日付変更線**: `--enumerate` の経度の範囲を最短の弧で比べる（`lonArc`／`arcMeets`）。アラスカ at-large が
  ドイツの箱から消え、±180° をまたぐ箱でも引ける。

## 4. 検査

- `node --test tests/companies-elections-live-checks.test.mjs` — 15 本（下の 12 本＋引き継ぎの出所・経度の弧・Atlas の登録）（計画の順序／宣言の両方向／法定期限の算術〈2 月 31 日を作らない〉／分割の拒否と国境の許容／**コミット済みの幾何で 1994 年のドイツを 1979 年に置くと拒まれ、1979 年の版は通る**／列挙／受領証／validate が受領証の欠けを拒む／probe の識別子／workflow の配線と入力の受け渡し／凡例とパネル）
- `check:elections`（20 秒 → 版と国の組で記憶して 6 秒）・`check:companies`・`node scripts/upstream-liveness.mjs --check`・`tests/upstream-liveness-checks.test.mjs`
- `tests/history-elections-checks.test.mjs` #R588 ⑤ の「整った最小の束」に、この作業で必須にした欄（政体の `pack`、選挙の `fetchedAt`・`fetchedFrom`・`up`）を足した（足さないと整った束が拒まれ、⑤j・⑤l も同じ理由で落ちていた）。
- `check:surface` の基準を `--update`: 新しい読みは **`window.IntMapElections` 3 件**（`js/atlas-cap-layers.js` の選挙 3 能力。選挙レイヤーは遅延で、`js/elections.js` はファクトリしか export せず実体はレイヤーが読み込まれたときに出来るので、`js/layer-home.js` と同じく公開された握りを読む）と **`window.IntMapSafe` 1 件**（`js/elections.js` の HTML の符号化。`js/safe-html.js` は export を持たない古典的な読み込みで、全員がこの名前で読む）。
- `check:perf` の `atlas-console` 非同期チャンクが 1,140.8 kB（天井 1,134.1 kB・帯 5.7 kB）: 選挙を Atlas から動かす 3 能力（`js/atlas-cap-layers.js`）の分で、起動経路には載らない。⚠ `node scripts/perf-budget.mjs --update` は origin/main が 4 commit 先にある（CI が測る木ではない）として拒んだので、天井は origin/main に載せ直してから上げる。

## 5. 残っていること

- 鮮度表示の共通部品（news-intelligence が作成中）への統合。いまはパネルと凡例の自前の 1 行。
- 米国下院 2020–2024 は、ゲストブックが外れても第 117 議会以降の区割りが要る。
- CShapes は 2019 年で終わるので、2020 年以降の 26 回は領域を訊けていない。
- 本番の検証（凡例の「更新不能」・▶・パネルの取得日）は統合後。

## 統合時の性能予算（main へ重ね直した後の build）

超えた行だけ `--update` で上げた（atlas-console は選挙の能力 3 つ分）:
- eager.raw: 4628.5 kB → 4652.5 kB
- eager.gzip: 1523.9 kB → 1533.1 kB
- async chunk "atlas-console": 1144.2 kB → 1156.3 kB

## 統合時の性能予算（8f3e8746 へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- async chunk "atlas-console": 1162.7 kB → 1169.3 kB
