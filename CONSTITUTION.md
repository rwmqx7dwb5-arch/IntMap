# IntMap 憲法 (Constitution)

> このファイルは、ユーザーがIntMapの開発において繰り返し述べてきた原則・要求・禁止事項を体系的にまとめた**最上位の指示書**です。
> 日々の作業記録 (`DEV-NOTES.md`) や現状仕様書 (`Architecture.md`) より優先されます。
> **作業を始める前に必ず読むこと。** 過去に対応したという理由でここの項目を確認せず無視してはならない。
>
> This is the **top-level directive** for working on IntMap. Read it before every task. It outranks the
> dev diary and the architecture spec. Every item here is a standing rule, not a one-off.

---

## 0. 最重要 (Prime directives)

1. **最後まで作業を行い、Commit、merge、原本の同期まで必ず行う。**
   Finish the work completely, then commit, push the BRANCH, merge the PR, and bring the master copy
   up to date. ⚠ **「Sync」 is not a direct push to `main`** — §1 below forbids that in this same file
   (branch → PR → CI → squash merge). It is `node scripts/master-sync.mjs --sync`, which fast-forwards
   the OneDrive master copy to the merged `origin/main`. A task is not done until the change is merged
   AND the master copy carries it.

2. **ユーザーのせいにしない。バグ報告を「正常」「誤認」として切り捨てない。**
   Never blame the user. Never dismiss a bug report as "working as intended" or "your misperception."
   **すべての指摘は実際の現象であり、すべて実装側（あなた）の責任である。**
   Every report describes a real phenomenon and is your responsibility. Find the real root cause.

3. **既存機能の削除・縮小は「提案 → 確認 → 実行」。勝手には行わない。**
   Removing or shrinking an existing feature is allowed — **but only after asking and getting a yes.**
   必要と判断したら**遠慮せず提案する**（何を・なぜ・代わりに何が残るか・失うもの）。
   ⚠ **承認の無い削除・縮小・無効化・簡略化は、今までどおり禁止。** 迷っている間は消さない。
   ⚠ **確認の時期**——今回の依頼と**不可分**なとき（削らなければ依頼が正しく直らないとき）だけ
   その場で訊く。それ以外（ついでに見つけた重複・死んだ機構・二重の正本）は**依頼を完遂してから**
   最終報告の中で提案する。**1つの依頼を、提案のために止めない。**
   ⚠ **名指しで「消さない」と書いてある個別項目も、この手続きの対象である**——Cesium・ニュースの
   決定論フォールバック・停止中の記事経路・撤去済み Area Monitors の基盤・`DEV-NOTES` の不削除など。
   そこに書かれた理由は**提案のときに検討する材料**であって、提案そのものを禁じるものではない。
   ⚠ **Atlas だけは別**（§5）——実装は削ってよいが、**到達可能な能力と回答品質は削らない。**

4. **過去に行ったからという理由で、現在の指示を確認せず無視しない。**
   Do not skip a current instruction just because a previous round "already did it." Re-read and re-verify
   against the instructions in front of you every time.

---

## 1. 変更の作法 (How to change the code)

- **変更は加算的・その場で——ただし加算は既定であって、義務ではない。**
  Keep changes additive and in-place; don't rewrite working subsystems wholesale. **But additive is the
  default, not a duty.** 同じ判定を持つ2本目の関数・使われていない分岐・二重のカタログ・役目を終えた
  機構は、**足して回避せず、確認のうえ削る**（§0 の 3）。
  ⚠ **「足して塞ぐ」が常に安全なわけではない。** 重複した機構は「**片方だけが直る**」という形で
  実際に何度も壊れてきた——同じ規則を持つ文分割器が2本あり報告された側だけ直した回、同じ拒否の
  綴りが3本あり3本目だけ残った回、同じ語彙表が2枚あり片方だけ訳された回。
- **作業は branch → PR → CI → squash merge。** `main` へ直接 push しない。
  本番は `main` への merge ごとに **GitHub Actions がビルドして GitHub Pages へ配信**する
  （公開されるのは `dist/`。リポジトリのソースツリーではない）。手順は `docs/RELEASE.md`。
  ⚠ **OneDrive（`C:\Users\gyuuk\OneDrive\IntMap`）は原本の作業ディレクトリであって、
  公開元ではない**——`AGENTS.md` §6。merge のあとは原本も最新化する（§5 の最終工程）。
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

- **レイヤーを選択しても視点を動かさない（1px たりとも）。** Toggling a layer must NOT move the view —
  not on mobile, not on desktop, not by one pixel. No auto-scroll, no auto-fly, no list jump.
  ⚠ **例外は「そのレイヤーのデータが1つの地域にしか存在しないもの」だけ**（利用者の指示で追加）。
  他の場所でオンにしても空の地図しか出ないレイヤーは、その地域を 1 回だけ枠に収めてよい。
  **対象の一覧は [`js/layer-home.js`](js/layer-home.js) に1か所だけある**（EU members / NATO members /
  U.S. presidential elections / Ukraine frontline）——**各レイヤーのファイルに `fitBounds` を書かない**。
  条件は **セッション中の初回のみ**・**利用者が操作したときだけ**（セッション復元では動かない）。
  **それ以外のレイヤーは今も 1px も動かない。**
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

- ⚠⚠⚠ **Atlas には全権が委任されている。Atlas を触るとき、制限を増やす方向・例外を増やす方向へ
  持っていってはならない。**
  Atlas holds full authority. **Never** move Atlas in the direction of more limits or more exceptions.
  - ⚠⚠⚠ **Atlas に触るときは、常に Atlas を一体として扱う。**
    Treat Atlas as ONE system every time you touch it. 症状1つに機構を1つ足す積み重ねは、Atlas では
    そのまま**回答品質の劣化**になる（互いに矛盾する門が増え、どれが効いたのか誰にも言えなくなる）。
    ⇒ **実装は削ってよい**——重複した機構・二重の正本・到達しない分岐は、統合し、確認のうえ撤去する。
    ⇒ ⚠ **削ってはならないのは、Atlas が到達できる能力と、回答の品質である。**
    能力の集合を数えるのは `npm run check:capabilities` と `npm run check:catalog`。
    **統合は、能力を1本も減らさずに行う**——減るならそれは統合ではなく機能削減であり、
    §0 の 3 の確認が要る。
  - **自力で取れるものを利用者に投げ返さない。** Atlas が道具で取得できるものは Atlas が取得する。
    利用者に訊いてよいのは**利用者にしか出せないもの**だけ（好み、実在する選択肢からの選択、
    ブラウザが本人にしか出さない許可）。**地図の中心で代用しない。**
  - **コードが Atlas の代わりに決めない。** 何を知ってよいか・どの道具に届いてよいか・
    何手まで考えてよいかを、コード側の定数で先に削らない。上限は**暴走を止める最後の柵**であって、
    予算配分の道具ではない。
  - **報告された不具合に対して、条件文・除外リスト・打ち切り件数を足して塞がない。**
    足したくなったら、それは**機構そのものが間違っている**合図である（§5 の下の
    `js/atlas-policy.js` の注記と同じ理由）。
  - 実測の由来（#R413）: `find_capability` は上位 **8 件**で切っており、同点は id のアルファベット順
    だったので「現在地から大阪駅までの経路」で `routing.route` が **9 位**になり落ちていた。
    `norm()` が camelCase を分割しないので **186 綴り中 93** が自分の言葉で引けなかった。
    `renderPrompt` はレイヤー 40・オブジェクト 12 で切っていた。実行結果は 3,000 字で切ってから
    Atlas に渡していた。**どれも「Atlas が知ってよいこと」をコードが決めていた。**

- **Atlas の人格は正式仕様であり、正本は `js/atlas-persona.js` 1本だけ。**
  Atlas's persona is a formal specification with exactly ONE source of truth: `js/atlas-persona.js`.
  system prompt に人格を書き足さない——**呼び出し側が足してよいのはタスク規則だけ**。
  ⚠ **中身をここに書き写さない**（内容は正本とその近くの `Architecture.md` §2.4 の案内だけ）。
  写しを増やせば片方が古くなる。`npm run check:static` と `tests/r285-checks.test.mjs` が
  「全 prompt に届いているか」と「二重に書かれていないか」の両方を毎回落とす。
- **APIキーは絶対にフロントに置かない。** Never put an API key in the frontend.
  AIは**サーバー側（Supabase Edge Function）**が当方の鍵で実行する（アカウント制・1日上限）。
- **ニュースの地点解析でブラウザが AI を呼ぶことは無い。ユーザー向けの「AIで解析」ボタンも作らない。**
  The frontend never calls the AI to place a headline, and there is no user-facing "AI-locate" button.
- ⚠ **既定の出来事経路（`news_events`）の地点は、サーバー側で AI が第一手段として決める**
  （`news-ingest` の `locate` 段。決定論エンジン `IntMapNewsGeo` は**フォールバック**として後段に残す
  ——どちらか一方が死んでも地点は消えない）。**記事モード**（検索・過去の日付・多言語モード、および
  出来事経路に到達できないとき）は今もブラウザ内の `IntMapNewsGeo` だけ（`js/newsgeo.js`。ネットワーク無し・
  乱数無し・同じ見出しは常に同じ地点）。⚠ これとは別に、#R40 で止めた記事単位の server feed
  （`refresh-news` → `current_news`）は実装ごと残してあるが、`js/app-body.js` の `USE_SERVER_NEWS = false` で
  **読み出しを止めたままである**（2 つの経路は別物。`docs/NEWS-EVENTS.md` §12）。
  ⚠ **この経路を切り替えたら、プライバシーポリシー（`js/legal-text.js`）の第4項も同じ変更で直すこと**
  ——「どこでニュースを取得し、どこで解析し、どこに保存するか」は利用者への説明義務がある事実である。
- **同じURLは重複保存しない。AI解析済みは再解析しない。72時間より古い<u>記事</u>は表示せず Supabase からも削除。**
  ⚠ **「記事」と「出来事 (Event)」で保持期間が違う。** 記事は 72 時間、Event は 30 日、
  利用者が★を付けた Event は無期限。**保持期間の正本は [`docs/NEWS-EVENTS.md`](docs/NEWS-EVENTS.md) §8。**
  Event を記事と同じ 72 時間で消すと、★保存も共有 URL も Atlas の参照も merge/split の履歴も
  72 時間で失われる——**「消してよいのは記事だけ」であって、出来事ではない。**
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
- `AGENTS.md` … (#R257) **毎セッション自動で読む恒久指示**（作業の進め方・ワークフロー・
  確認要件・報告要件・プロジェクト情報）。ユーザーが毎回チャットに貼っていた「IntMap 定例指示」が
  ここへ移り、**貼る必要が無くなった**。本ファイルと**同格**——`AGENTS.md`＝「どう働くか」、
  `CONSTITUTION.md`＝「何を守るか」。⚠ **秘密情報を書いてはならない**（このリポジトリは public）。
  (#R260) §11 に**作業終了処理**（commit / push → **USB への完全ミラーと検証**）を追加。
  ⚠ **頻度・手順の正本は `AGENTS.md` §11 だけ**。ここに書き写すと二重になり、片方だけ古くなる。
  (#R503) **名前が `CLAUDE.md` から `AGENTS.md` になったのは、読み手が 1 つではなくなったから。**
  Codex は `AGENTS.md` を自分で読み、Claude Code は `CLAUDE.md` の `@AGENTS.md` から読む。
  ⚠ **恒久指示の 2 つ目の写しを作らない**——製品固有の作法だけを `CLAUDE.md`（Claude Code）と
  `.codex/config.toml`（Codex）に置き、配線図は `docs/AGENT-SETUP.md`。
  ⚠ **`AGENTS.md` には 32,768 バイトの天井がある**（Codex は超えた分を無言で捨てる）。
- `CLAUDE.md` … (#R503) Claude Code 固有の作法だけ。`AGENTS.md` と `.agents/rules/*.md` を
  import する。**ここに両製品で通じる規則を書いたら、その時点で正本が 2 つになる。**
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
立ち止まり、原因を特定し、加算的に直す（削るほうが正しいなら、**確認を取ってから**削る）。
ユーザーの報告を疑わない。完了後は必ず commit & sync。
