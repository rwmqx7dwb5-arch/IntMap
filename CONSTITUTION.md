# IntMap 憲法 (Constitution)

> このファイルは、ユーザーがIntMapの開発において繰り返し述べてきた原則・要求・禁止事項を体系的にまとめた**最上位の指示書**です。
> 日々の作業記録 (`DEV-NOTES.md`) や現状仕様書 (`Architecture.md`) より優先されます。
> **作業を始める前に必ず読むこと。** 過去に対応したという理由でここの項目を確認せず無視してはならない。
>
> This is the **top-level directive** for working on IntMap. Read it before every task. It outranks the
> dev diary and the architecture spec. Every item here is a standing rule, not a one-off.

---

## 0. 最重要 (Prime directives)

1. **最後まで作業を行い、Commit、Sync まで必ず行う。**
   Finish the work completely, then commit AND sync (push to `main`). A task is not done until it is pushed.

2. **ユーザーのせいにしない。バグ報告を「正常」「誤認」として切り捨てない。**
   Never blame the user. Never dismiss a bug report as "working as intended" or "your misperception."
   **すべての指摘は実際の現象であり、すべて実装側（あなた）の責任である。**
   Every report describes a real phenomenon and is your responsibility. Find the real root cause.

3. **既存機能は、明確な指示がない限り、削除・縮小を絶対に行わない。**
   Never delete or shrink an existing feature without an explicit instruction to do so.
   迷ったら「移動」「追加」「無効化」で対応し、消さない。When in doubt, move/add/disable — do not remove.

4. **過去に行ったからという理由で、現在の指示を確認せず無視しない。**
   Do not skip a current instruction just because a previous round "already did it." Re-read and re-verify
   against the instructions in front of you every time.

---

## 1. 変更の作法 (How to change the code)

- **変更は加算的・その場で。** Keep changes additive and in-place. Don't rewrite working subsystems wholesale.
- **作業は branch → PR → CI → squash merge。** `main` へ直接 push しない。
  本番は `main` への merge ごとに **GitHub Actions がビルドして GitHub Pages へ配信**する
  （公開されるのは `dist/`。リポジトリのソースツリーではない）。手順は `docs/RELEASE.md`。
  ⚠ **OneDrive（`C:\Users\gyuuk\OneDrive\IntMap`）は原本の作業ディレクトリであって、
  公開元ではない**——`CLAUDE.md` §6。merge のあとは原本も最新化する（§5 の最終工程）。
- **既定のレンダラは MapLibre GL。Cesium は設定で選べる第2エンジン**（設定 ▸ 地図の動作 ▸ 地図エンジン）。
  MapLibre is the default renderer; Cesium is a second engine the user can select. どちらも消さない。
  ⚠ レンダラの名を出してよいファイルは `js/geo-engine.js` だけ（`npm run check:engine`）。
- **テキストに勝手に影を付けない。** Do not add text-shadows / "contrast halos" to panels, legends, popups.
- **🫐 等の余計な装飾・絵文字を勝手に足さない。** Don't add gratuitous decoration the user didn't ask for.

## 2. 壊れやすい罠 (Hard rules that have blanked the site before)

- **JS テンプレートリテラル内の CSS にバッククォート（`` ` ``）を絶対に書かない（コメント内でも）。**
  NEVER put a back-tick inside CSS that lives in a JS template literal — even in a comment. It terminates
  the template literal and **blanks the entire site.** Build dynamic CSS/inline styles with normal quoted
  strings (`cssText` with `'...'`), not template literals containing back-ticks.
- **「パースが通る」だけで満足しない。「ページが実際に動く」ことを確認する。**
  Parsing isn't enough — verify the page actually RUNS. The canonical smoke test (`npm run test:smoke`):
  the layer panel builds **100 以上の `.lyr-row`** and the console has **zero errors**.

## 3. 地図・操作の不文律 (Map & interaction)

- **レイヤーを選択しても視点を一切動かさない（1px たりとも）。** Toggling a layer must NOT move the view —
  not on mobile, not on desktop, not by one pixel. No auto-scroll, no auto-fly, no list jump.
- **3D・投影などの切り替えで勝手にカメラを動かさない。** Enabling 3D / switching projection must not move
  the camera on its own. Relief appears when the USER tilts.
- **チェックボックスは確実に「1タップ＝1トグル」。誤チェック・チラつき・隣行誤動作を起こさない。**
  One tap = exactly one toggle, on the row the finger went down on. No double-fire, no flicker, no
  wrong-row toggles. State of checkbox ⇄ map layer ⇄ "Active layers" list must always agree.
- **何も操作していないのに勝手にレイヤーがオンにならない。オンなのに消せない「孤児レイヤー」を作らない。**
  No phantom layer activations; never strand a layer that is visible but unremovable.

## 4. モバイル (Mobile)

- **iOS 風のUIにする。** Match iOS conventions (sheets, rounded cards, segmented controls, no crushed text).
- ボタン・ポップアップは**地図が見えること・他のボタンが使えること**を前提に配置・サイズする。
  Panels/popups must leave the map visible and other controls usable (don't cover the screen).
- メインマップのボタンを勝手に消さない。重なるなら**移動**で解決する。
  Don't hide main-map controls to resolve an overlap — move them.
- **Others (beta) グループだけ**はモバイルでプルダウン（折り畳み）。他グループは展開のまま。
  On mobile only the "Others (beta)" group is a collapsible pulldown; every other group stays expanded.

## 5. AI・ニュース・鍵 (AI, news, keys)

- **APIキーは絶対にフロントに置かない。** Never put an API key in the frontend.
  AIは**サーバー側（Supabase Edge Function）**が当方の鍵で実行する（アカウント制・1日上限）。
- **ニュースの地点解析でブラウザが AI を呼ぶことは無い。ユーザー向けの「AIで解析」ボタンも作らない。**
  The frontend never calls the AI to place a headline, and there is no user-facing "AI-locate" button.
- ⚠ **現在の既定経路はブラウザ内の決定論エンジン `IntMapNewsGeo`**（`js/newsgeo.js`。ネットワーク無し・
  乱数無し・同じ見出しは常に同じ地点）。サーバー側の事前AI解析（`refresh-news` → `current_news`）は
  実装ごと残してあるが、`js/app-body.js` の `USE_SERVER_NEWS = false` で**読み出しを止めてある**。
  ⚠ **この経路を切り替えたら、プライバシーポリシー（`js/legal-text.js`）の第4項も同じ変更で直すこと**
  ——「どこでニュースを取得し、どこで解析し、どこに保存するか」は利用者への説明義務がある事実である。
- **同じURLは重複保存しない。AI解析済みは再解析しない。72時間より古いニュースは表示せず Supabase からも削除。**
- ユーザーに不要な表記・ボタンを出さない（例:「事前AI解析されたニュースを表示する」等は不要）。

## 6. ドキュメント (Docs)

- `DEV-NOTES.md` … 日記形式の開発記録（時系列・根本原因の記録）。**直近ラウンドだけ・新しい順**。新ラウンドは先頭に足す。
- `DEV-NOTES-ARCHIVE.md` … それ以前の全記録。**古い順の通し**。読むためだけの場所で、
  ここに追記することはない。⚠ ここに書いてあるのは「当時そうだった」であって「今もそうである」ではない。
  ⚠ **2つの境界は固定値ではない**——`DEV-NOTES.md` が育ちすぎたら、古い側をまとめてアーカイブへ動かす
  （**1行も削らず、索引の行も本文と一緒に**）。
- `Architecture.md` … 現状仕様書（**構造・データフロー・契約・不変条件**）。実装を変えたら更新する。
  **ラウンド別の補足はここには置かない**——各ラウンドの記録側が持つ。1ファイル＝1つの役割・1つの並び順。
- `PRODUCT.md` … **何のためにあり、何ができ、何をやらないか**（機能一覧と Atlas の到達点を含む）。
- `DECISIONS.md` … **今も有効な技術判断とその理由**だけ。覆ったら行ごと差し替える。
- `docs/README.md` … **文書の索引**。どれが何の正本で、いつ更新するか。**文書を足したらここに1行足す。**
- `docs/FILES.md`（ファイル台帳）/ `docs/MAP-LAYERS.md`（レイヤー実装の詳細）… `Architecture.md` の
  §3・§7 の本体。節番号は Architecture 側と同じにしてあるので `§3.x` / `§7.x` の参照はそのまま通る。
- `CONSTITUTION.md`（本ファイル）… 標準指示。変わるのはユーザーが方針を変えたときだけ。
- `CLAUDE.md` … (#R257) **Claude Code が毎セッション自動で読む恒久指示**（作業の進め方・ワークフロー・
  確認要件・報告要件・プロジェクト情報）。ユーザーが毎回チャットに貼っていた「IntMap 定例指示」が
  ここへ移り、**貼る必要が無くなった**。本ファイルと**同格**——`CLAUDE.md`＝「どう働くか」、
  `CONSTITUTION.md`＝「何を守るか」。⚠ **秘密情報を書いてはならない**（このリポジトリは public）。
  (#R260) §11 に**作業終了処理**（commit / push → **USB への完全ミラーと検証**）を追加。
  ⚠ **頻度・手順の正本は `CLAUDE.md` §11 だけ**。ここに書き写すと二重になり、片方だけ古くなる。
- `CLAUDE.local.md` … (#R257) 同じ機構のローカル上書き。**追跡対象外**（`.gitignore` ＋
  `.git/info/exclude`）。資格情報など公開できない情報だけを置く。
- 出典・プライバシーポリシー・利用規約は**常に現状に即した正確な情報**に保つ。
  ⚠ **データの流れを変えたら、同じ変更の中で法務文面も直す。** 「あとで直す」で残った差は、
  利用者に対して事実と違う説明をし続けることになる。文面の正本は `js/legal-text.js` の1本だけで、
  アプリ内モーダル・`privacy.html` / `terms.html` の公開ページはそこから読む。
- ⚠ **規則を文章で書いたら、その規則を測る検査を同じ変更の中で書く。** 書いただけの規則は守られない。
  文書と実装の突き合わせは `npm run check:docs`（`scripts/doc-facts.mjs`）が担当する。

---

### 違反したら (If a change would violate any of the above)
立ち止まり、原因を特定し、加算的に直す。ユーザーの報告を疑わない。完了後は必ず commit & sync。
