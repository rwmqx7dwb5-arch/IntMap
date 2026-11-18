---
title: 運営コンソールをアプリとは別の origin へ移し、管理者の権限を二要素（aal2）のセッションだけに付け、管理者アカウントはアプリから締め出した
date: 2026-11-18
---

〈依頼〉`docs/SECURITY-ARCHITECTURE.md` §8 の 20（運営コンソールがアプリと origin と localStorage のキーを共有し、アプリのどこかの XSS が管理者のセッションを読める）を閉じる。別 origin に加え、権限の分離と「管理者をアプリにログインさせたままにしない」まで。CSP を締めるだけでは完了にしない。

## 0. 測った・決めた

- 管理者の判定は DB の `profiles.is_admin` だけで、セッションの性質を見ていなかった（Edge Function の管理者判定は 0 件）。`is_admin()` を呼ばず列をインラインで読むものが 9 つ（ニュースの方針 3・RPC 4〜5・再定義を含む）、本番だけにある `profiles_select` は `is_admin(auth.uid())`。
- アプリと 3 つのコンソールの Supabase client は同じ既定の `storageKey`（`sb-<ref>-auth-token`）。コンソールで入るとアプリのタブも同じセッションを持つ。
- 同じアカウントの別リポジトリは `<owner>.github.io` の同じ origin になる——分離にならない。
- 利用者の判断（AskUserQuestion）: 置き場は無料の GitHub Organization `intmap-admin`（`https://intmap-admin.github.io/`）、管理者権限は TOTP 必須、管理者アカウントはアプリでは即サインアウトしアプリ内の管理機能はコンソールへ移す。

## 1. 直したこと（3 層。前の層が残すものを次の層が閉じる）

- **別 origin**: `scripts/admin-site.mjs` が「`js/admin-auth.js` を読むページ」をコンソールとして発見し、それが読むもの（src/href・import）を辿って独立したサイトに組み立てる。アプリのページへのリンクはアプリの絶対アドレスへ書き換える。公開は `intmap-admin/intmap-admin.github.io` の workflow がこのリポジトリの再利用 workflow `.github/workflows/admin-site.yml` を呼ぶ（秘密情報なし・向こうが公開リポジトリを取りに来る・アプリの本番が出している commit を組む）。アプリのビルドからは `admin` 入口・コンソールのファイル・SDK の写しを外し、コンソール専用のファイル（アプリのページが 1 つも読まないもの）を写そうとすると止まる。旧アドレスにはスクリプトの無いリンクだけのページを置く。アドレスは `site-origin.js` の `ADMIN_URL` 1 か所。
- **権限はセッションに**: `public.is_admin()` は `profiles.is_admin` **かつ** JWT の `aal = 'aal2'`。列をインラインで読む関数・方針は、移行の中で**カタログを発見して** `is_admin()` を呼ぶ形に書き換え（名前の一覧ではないので本番だけの同じ形も直る）、それ以外の判定が残っていれば移行は止まる。pgTAP 50 が「aal1 の管理者アカウントは管理者でない」「aal2 なら管理者」「他の判定が無い」を測る。既存の pgTAP の管理者のクレームには `aal2` を足した。
- **コンソールのサインイン**（`js/admin-auth.js` の `window.IntMapAdminAuth`・3 ページ共通。各ページの `window.supabase.createClient` の写しはこれ 1 つになった）: パスワード → TOTP（無ければ QR で登録）→ aal2 かつ管理者なら開く。セッションはそのタブの `sessionStorage`（キー `intmap-admin-auth`）にだけ。破壊的な取り込みの前の再確認はパスワードの再入力から TOTP の再チャレンジへ（パスワードで入り直すと aal1 に落ち、権限を失うため）。
- **アプリ**（`js/auth-ui.js`）: プロフィールが管理者と答えたら、その時点で `signOut({scope:'local'})`（このセッションだけを終え、リフレッシュトークンもサーバーで失効）し、コンソールへの案内を出す。`HOST.user.isAdmin` は消した。掲示板の他人の投稿を消すボタンと、みんなの地図の報告への対応欄はアプリから消し、後者はコンソールの Community タブ「Community maps」へ移した（投稿とコメントの削除はもともとコンソールにある）。

## 2. 検査

- `tests/admin-origin-checks.test.mjs`: コンソールの origin・ホストがアプリのどれとも違う／コンソールのページは発見される／組み立てたサイトが全ファイルを持ちアプリへのリンクは絶対アドレス／アプリの写す一覧にコンソール専用が無い／旧アドレスのページはスクリプトを持たない／`js/admin-auth.js` を**評価して** sessionStorage と独自キーだけを使い localStorage に触れないこと。
- `tests/admin-origin.spec.js`: 実ブラウザで、管理者のセッションは `scope=local` で終わり保存が消え案内が出る・一般のアカウントは残る。
- `supabase/tests/50_admin_mfa_session_test.sql`。
- 旧い綴りを固定していた検査（`window.SUPABASE_URL`・パスワードの再確認・`STATIC_ASSETS` に admin のファイル）は、実体（meta・stepUp・`consoleFiles`）を読むように直した。

## 3. 残したこと

- コンソールのセッションは、コンソール自身のページの XSS には読める（sessionStorage。Supabase JS は httpOnly cookie を使えない）。
- TOTP の秘密は運用者の端末にある。失くしたら Supabase のダッシュボードで因子を消して登録し直す（`docs/RELEASE.md`）。
- 本物の Supabase に対する TOTP の登録と aal2 の動作は、本番で運用者が最初にサインインするときに確かめる（エージェントは管理者の資格情報を持たない）。
