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
- **コミット先は `main`。** Commit and push to `main`. (本番は OneDrive 上の `index.html` / `admin.html` を直接配信。)
- **Cesium は廃止済み。再構築しない。** Cesium is abandoned — do not rebuild it. The map is MapLibre GL.
- **テキストに勝手に影を付けない。** Do not add text-shadows / "contrast halos" to panels, legends, popups.
- **🫐 等の余計な装飾・絵文字を勝手に足さない。** Don't add gratuitous decoration the user didn't ask for.

## 2. 壊れやすい罠 (Hard rules that have blanked the site before)

- **JS テンプレートリテラル内の CSS にバッククォート（`` ` ``）を絶対に書かない（コメント内でも）。**
  NEVER put a back-tick inside CSS that lives in a JS template literal — even in a comment. It terminates
  the template literal and **blanks the entire site.** Build dynamic CSS/inline styles with normal quoted
  strings (`cssText` with `'...'`), not template literals containing back-ticks.
- **「パースが通る」だけで満足しない。「ページが実際に動く」ことを確認する。**
  Parsing isn't enough — verify the page actually RUNS. The canonical smoke test: the layer panel builds
  **≈72 layer-row checkboxes** and the console has **zero errors**.

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
- **ニュースの地点解析はサーバー側で事前にAI解析**し、Supabase に保存する。
  News location analysis is done server-side at fetch/cron time (AI primary for en/jp), stored in
  `current_news`. The frontend reads pre-analysed rows and shows pins instantly — it never calls the AI for
  news location, and there is no user "AI-locate" button.
- 非AIの辞書解析は**フォールバック**（AI失敗・en/jp 以外・過去ニュース・API停止時）。
- **同じURLは重複保存しない。AI解析済みは再解析しない。72時間より古いニュースは表示せず Supabase からも削除。**
- ユーザーに不要な表記・ボタンを出さない（例:「事前AI解析されたニュースを表示する」等は不要）。

## 6. ドキュメント (Docs)

- `DEV-NOTES.md` … 日記形式の開発記録（時系列・根本原因の記録）。**#R200 以降・新しい順**。新ラウンドは先頭に足す。
- `DEV-NOTES-ARCHIVE.md` … (#R217) それ以前の全記録（Round 1 〜 #R199）。**古い順の通し**。読むためだけの場所で、
  ここに追記することはない。⚠ ここに書いてあるのは「当時そうだった」であって「今もそうである」ではない。
- `Architecture.md` … 現状仕様書（再現・保守のための構造説明）。実装を変えたら更新する。
  (#R217) **ラウンド別の補足はここには置かない**——各ラウンドの記録側が持つ。1ファイル＝1つの役割・1つの並び順。
- `CONSTITUTION.md`（本ファイル）… 標準指示。変わるのはユーザーが方針を変えたときだけ。
- `CLAUDE.md` … (#R257) **Claude Code が毎セッション自動で読む恒久指示**（作業の進め方・ワークフロー・
  確認要件・報告要件・プロジェクト情報）。ユーザーが毎回チャットに貼っていた「IntMap 定例指示」が
  ここへ移り、**貼る必要が無くなった**。本ファイルと**同格**——`CLAUDE.md`＝「どう働くか」、
  `CONSTITUTION.md`＝「何を守るか」。⚠ **秘密情報を書いてはならない**（このリポジトリは public）。
  (#R258) §11 に**作業終了処理**（commit / push → **USB への完全ミラーと検証**・1 日 1 回）を追加。
- `CLAUDE.local.md` … (#R257) 同じ機構のローカル上書き。**追跡対象外**（`.gitignore` ＋
  `.git/info/exclude`）。資格情報など公開できない情報だけを置く。
- 出典・プライバシーポリシーは**常に現状に即した正確な情報**に保つ。

---

### 違反したら (If a change would violate any of the above)
立ち止まり、原因を特定し、加算的に直す。ユーザーの報告を疑わない。完了後は必ず commit & sync。
