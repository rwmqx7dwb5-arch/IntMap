---
title: 操作型ブラウザ層(web.session)——見て・クリックし・入力し・複数画面をたどる実ブラウザを、許可 1 回・書き込み不可・記録付きで足す
date: 2026-11-20
newsen: Atlas can now operate a website in a real browser for you — look, click, type and move through pages — once you allow that site. It can never send, buy or post, and never types a password; you sign in yourself. Off until the site is connected to a browser service.
newsjp: Atlas が、サイトごとに 1 回の許可のもとで実ブラウザを操作できるようになりました(見て・クリック・入力・複数ページ)。送信・購入・投稿とパスワード入力は一切せず、ログインはご自身で行います。ブラウザのサービスにつなぐまでは停止したままです。
---

〈依頼〉 総合技術調査(2026-11-20)の最優先不足「API の無い Web を画面操作で調べる能力」。web.browse / web.render は生かし、必要なときだけ実ブラウザの**操作セッション**(画面を見て・クリック・入力・選択・複数画面・セッション継続)へ移れること。認証が要るサイトは利用者がログインし Atlas は許可範囲で続行。権限・利用条件・操作履歴を共通基盤で扱い、読み取りのたびの承認は要求しない。

## 0. 依存の整理(#1296 / #1312)
- 作業開始時: #1296(web.browse・OPEN・CI 実行中)、#1312(web.render・#1296 の上に積んだ分岐・`main` とは DIRTY)。本作業は **#1312 のブランチ(`feat/real-browser`)から切り、`origin/main` を取り込んで**積んでいる(文書の能力数 3 か所だけが衝突・生成物を再生成して解消)。マージ順は #1296 → #1312 → 本 PR。
- 同じ関数(`web-browse`)の `?tier=session` として足し、**新しい Edge Function・名簿・config の行は増やしていない**。

## 1. 利用者の判断(AskUserQuestion)
「実接続の確認には提供元の契約と API トークンが要る(リポジトリにも秘密にも現状ゼロ)」に対し、**「契約前提で実装のみ先行」**。契約・料金の発生は 0。したがって**実接続は確認していない**(下の §5)。

## 2. 提供元の調査(2026-11-20・公開文書)
Cloudflare Browser Run(旧 Browser Rendering): CDP の WebSocket `…/browser-rendering/devtools/browser`(`keep_alive` 10 秒〜20 分・既定 60 秒)、再接続 `…/devtools/browser/{sessionId}`、セッション取得 `POST …/devtools/browser`→`{sessionId}`、Live View `POST …/{sessionId}/live_view`→`devtoolsFrontendUrl`、終了 `DELETE …/{sessionId}`、ドメイン制限ヘッダ `cf-brapi-guardrails`、認証は **WebSocket でも `Authorization: Bearer`**(Deno の `new WebSocket(url,{headers})` で足りる想定)。トークン権限は「Browser Rendering - Edit」。Supabase Edge 上では Chromium は動かせないので、外部ブラウザを CDP で**遠隔操作**する形(Playwright ではなく素の CDP——Edge に Playwright は載らず、必要な動詞は十数個で足りる)。
- **否定した見立て**: GitHub Actions の Playwright(公開リポジトリ=ログと成果物が公開・遅い・URL が漏れる)、Edge 内での Chromium(不可)。

## 3. 作ったもの
- `supabase/functions/_shared/web-session.js` — エンジン兼アダプタ(純粋・Node で検査)。動詞は閉じた集合(`grant open observe click type select press scroll back wait live close`)。画面は「ページ本文(軽量層と同じパーサ)＋ **controls**(ブラウザ自身の AX ツリーから。ref は DOM の backend node id＝`n<id>` で**表を持ち回らない**)＋ スクリーンショット」。クリックは ref か座標(座標は `DOM.getNodeForLocation` で要素に解決)。
- `supabase/functions/web-browse/index.ts` — `?tier=session` の殻 `sessionTier`。順序: 専用の停止スイッチ → 未設定は何も出さず `session_unconfigured` → **アカウントを Auth に訊く**(許可もセッションもアカウントのもの) → 専用の呼び出し元 bucket → 専用の全体 bucket(閉じ側失敗)→ 本体。journal は応答前に書き切る(isolate が応答と同時に終わりうる)。
- `js/web-browse.js` に `session`、`js/atlas-cap-web.js` に **`web.session`**(confirm `none`)と **`web.sessionGrant`**(risk `external`・confirm `explicit`)。
- `supabase/migrations/20261120140000_web_session_journal.sql` + `supabase/tests/52_web_session_journal_test.sql` — 操作履歴(委譲ジャーナルと同じ型: service_role だけが書く・所有者が読む・30 日で消える・アカウントのデータ一覧に文を持つ)。

## 4. 権限と利用条件を「構造」で持たせた(読み取りのたびの承認は無い)
- **許可は 1 サイトにつき 1 回**(`web.sessionGrant`、risk `external`・confirm `explicit` ＝ 既存の確認モデルに従い、外部の内容が今ターンに入った後で Atlas が自分で提案したときに利用者へ確認する（`always` 行は表に 1 つも無い設計で、UI にも別トークンが要るため使わない。最初の CI 赤で判明）)。HMAC 署名の state(アカウント・許可ホスト・提供元 session・期限 4 時間)に入り、以降そのサイトでの閲覧・操作に承認は要らない。他アカウントの state・改変された state は `bad_state`。許可の無いホストは `needs_grant`(ホスト名つき)、期限切れは `grant_expired`。署名鍵はプロジェクトの秘密鍵から導出(新しい秘密は増やさない)。
- **書き込みは通信路で発行できない**: 接続中は CDP `Fetch` で全リクエストを止め、GET/HEAD/OPTIONS 以外を失敗させ(報告は `blockedWrites`)、許可外ホストへのトップレベル遷移も失敗させる。提供元にも許可ホストを `cf-brapi-guardrails` で渡す(二重の壁)。ボタンの文言の一覧ではなく**通信の性質**で止めるので、「買う」「Submit」以外の綴りのボタン・スクリプトが発行する POST も同じく止まる。⚠ 副作用が GET で起きるサイトは止められない(サイト側の欠陥)。
- **資格情報は打たない・通さない**: 欄の `type=password` / `autocomplete` が `*-password`・`one-time-code`・`cc-*` なら `type` を拒む。ログイン・CAPTCHA・ボット確認は `handoff` に **Live View のアドレス**を載せ、**利用者がそこでログインし、Atlas は同じセッションで `observe` から続ける**。パスワードは IntMap・モデル・記録のどこも通らず、cookie は提供元のブラウザの中にだけある。
- **呼び出し元はコードも欄も選べない**: ページ内で評価する関数は定数(`FN_FACTS`・`FN_SELECT`・`document.documentElement.outerHTML`・`location.href`)で、入力文は引数としてだけ届く。提供元のヘッダは固定。
- **操作履歴**: 動詞・ホスト・パス(クエリなし)・成否・所要・止めた書き込み数。**入力文・ページ・資格情報の列は表に存在しない**。

## 5. 実機で確認していないこと(隠さない)
- **提供元の API は一度も叩いていない**。経路・欄は公開文書の読みに基づく未検証で、**文書内でも不一致が 2 点**ある: ① 経路の接頭辞が `browser-run` と `browser-rendering` の 2 通りで書かれている(コードは #1312 と同じ `browser-rendering`)② タブを閉じる呼び出しの HTTP メソッドが資料間で食い違う(本実装は使わない)。Live View の `devtoolsFrontendUrl` の実際の形・Deno の WebSocket が `Authorization` を載せられること・`cf-brapi-guardrails` の効き方も未確認。**契約後の最初の作業は実機での通し**(`scripts/web-browse-probe.mjs` の session 版)で、外れていれば `SESSION_PROVIDERS.cloudflare` の 1 項目だけを直す。
- CDP 層そのものは標準プロトコルで、**CDP を話す偽ブラウザ**(`tests/browser-session-checks.test.mjs`)に対して検査した: 許可の 1 回性と期限・state の改ざん・アカウント結び付け・書き込みの遮断・許可外遷移の遮断・資格情報欄の拒否と Live View の引き渡し・同一セッションでの継続・消えたセッションの扱い・記録に入力文が入らないこと。実 Chromium での動作(座標とスクロール・`Input.insertText` の効き方・AX ツリーの粒度)は契約後に測る。
- 限界: セッション内で取ったファイルは Atlas に直接は渡らない(公開 URL なら `web.fetchFile {url}`・ログイン後にしか落とせないものは利用者が落として添付)。**Atlas の手数の上限は設けていない**(`.agents/rules/one-pass-or-a-reason.md`)ので、費用の上限は提供元の keep_alive・bucket・停止スイッチが持つ。値(許可 4 時間・keep_alive 10 分・毎分 60 手・全体 30／20 毎分)はすべて**推定**で、最初の請求書か最初の `capped` で見直す。
- 有効化(利用者の作業・1 回): Cloudflare の Workers 有料プランで Browser Run を有効にし、`supabase secrets set CF_BROWSER_ACCOUNT_ID=… CF_BROWSER_API_TOKEN=… --project-ref vpekfwdpurzejrrmacac`(render 層と同じ 2 つ。deploy 不要)。マイグレーションは merge 後に CI が適用する。

## 6. 検査
`tests/browser-session-checks.test.mjs`(15 件)・`supabase/tests/52_web_session_journal_test.sql`・`supabase/tests/00_structure_test.sql`(表の一覧に追加・plan 132→134)。能力表は `node scripts/atlas-caps.mjs --write` で生成(255→257 行)。

## 7. 起動費用の天井を上げた理由(check:perf)
CI の `check:perf` が、async の `atlas-cap-runs`(896→922 kB 級)・`atlas-console`(1061→1075 kB 級)・async 合計(raw 14136→14250 kB 級・gzip 4771→4795 kB 級)の超過を報告した。**eager(起動に載る側)は動いていない**——増えたのは Atlas の能力の実行体(`web.session` / `web.sessionGrant` の本体と、#1296・#1312 から積み上がった web 系の本体と確認文)で、いずれも遅延チャンク。起動に載る能力表の行は 2 行(約 1 kB)で eager の天井内。天井は超えた 4 行だけ、CI が測った値(kB は 1024)を切り上げて手で書いた——ローカルはビルドに `data:pull` のデータが要り `--update` が走らない(かつ main に遅れていると拒否される)ため。次に main の CI の bot が測り直して下げる。
`check:surface` は `window.IntMapSafe` の読みを 1 か所(`safeUrl`)にまとめて 171→170 とし、基準線を更新した(新しい経路は足していない)。

## 予算の天井を上げた理由（perf-baseline・2026-11-21）
操作型ブラウザ層が `web.session` の能力（`atlas-cap-web`・schema・確認文言・結果の描画）を足したため、遅延 chunk の `atlas-cap-runs` が 903.4→934.8 kB、`atlas-console` が 1073.1→1083.5 kB、async raw が 14221.0→14325.8 kB になった（`node scripts/perf-budget.mjs --update`）。どれも能力を呼んだときだけ読む遅延 chunk で、起動時に読む量は増えていない。失効条件: 能力の統合や縮小で下がったら、main の CI が `--tighten` で下げる。
