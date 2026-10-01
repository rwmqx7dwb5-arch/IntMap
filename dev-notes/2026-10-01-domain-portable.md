---
title: 本番のアドレスを 1 か所の値にする——69 ファイルに手で綴られていた Pages のアドレスを supabase/functions/_shared/site-origin.js の CUSTOM_DOMAIN から導き、他所に綴れば check:static が赤。ページはベースパスを前提にせず、同じ dist/ がドメイン直下でも /IntMap/ 配下でも動く。ドメイン取得後の手順書を docs/RELEASE.md に
date: 2026-10-01
---

〈依頼〉利用者は独自ドメインを取得する方針（名前は未定・購入は利用者）。現在の本番 URL が 69 ファイルに
綴られている。ドメインが決まった日に「1 か所の値を変えるだけ」で全部が移るようにする: 正本を 1 つ／
ベースパス非依存／CNAME の受け口／切替の手順書／正本以外の綴りを赤にする検査。

## 0. 測った

- `git grep -l` で 69 ファイル。うち 21 本は `dev-notes/`・`DEV-NOTES-ARCHIVE.md`（記録）。残り 48 本・89 か所の
  内訳: 実行時に効くもの（`alerts-relay` の User-Agent 12 回・`gdelt-relay`・`sv-cov`・
  `_shared/client-error-shape.js` の受け付ける Origin・`index.html` の `og:url`/`og:image`・
  4 本の workflow の既定値・`prod-smoke.spec.js`・`release-state.mjs`・`atlas-eval.mjs`・
  `probe-relay-ladder.mjs`）、テストの固定値（hostname・rpId・スタック）、エージェントの役と
  `AGENTS.md`・`README.md` のリンク、そして**「本番で測った」と書くためだけの注釈**（約 20 か所）。
- ベースパス: `vite.config.js` は既に `base: './'`、`sw.js` は `js/tile-warm.js` が相対 URL `'sw.js'`
  で登録（scope はページのディレクトリ）、`admin.html` も相対。**ベースパスを前提にしていたのは
  `scripts/probe-relay-ladder.mjs` の Referer（`${ORIGIN}/IntMap/` を連結）だけ**だった。
  ビルドした 7 ページに root 絶対の `src`/`href` は 0 件。
- Pages の設定（`gh api repos/rwmqx7dwb5-arch/IntMap/pages`）: `build_type: workflow`・`cname: null`・
  `https_enforced: true`。`vars.PROD_URL` は未設定（`gh variable list` は `ENABLE_PAGES_DEPLOY` だけ）。
  `deploy-pages` の `page_url` は配備記録の `environment_url` と同じ形（末尾 `/` 付き）。
- GitHub の公式文書（docs.github.com「Managing a custom domain for your GitHub Pages site」）:
  **workflow で公開している場合 `CNAME` ファイルは作られず、既存のものも無視される**。apex の
  `A` 4 本・`AAAA` 4 本の値、subdomain は `CNAME` → `<user>.github.io`、ワイルドカード禁止、
  検証は TXT `_github-pages-challenge-<user>.<domain>`。REST の `PUT /repos/{o}/{r}/pages` は
  `cname`・`https_enforced` を取り、管理者権限が要る（`GITHUB_TOKEN` の `pages: write` では足りない）。
- **旧アドレスからのリダイレクト**は文書に見つからなかったので実測した。独自ドメインを持つ project
  サイト 2 つで `curl -sI`: `jekyll.github.io/jekyll/docs/installation/?x=1` → **301**
  `jekyllrb.com/docs/installation/?x=1`、`twbs.github.io/bootstrap/docs/5.3/…` → **301**
  `getbootstrap.com/docs/5.3/…`。**`/<repo>/` を落とし、残りのパスとクエリを保つ。**
  ⚠ 否定された見立て: 「GitHub Pages の自動リダイレクトで移行は何もしなくてよい」——リンクは切れないが、
  オリジンが変わるので `localStorage`・IndexedDB・Cache Storage・Service Worker・ログインの
  セッションは移らず、旧オリジンは 301 しか返さないので手元だけの状態は取り出せない。パスキーも
  RP ID（ホスト）に結ばれていて移らない。手順書に書いた。
- Supabase Auth の URL 設定（本番）は Management API の token がこのマシンのファイルに無く
  （キーチェーン）、読めなかった。`supabase/config.toml` の `site_url` はローカル専用。

## 1. 正本の場所

`supabase/functions/_shared/site-origin.js`。`client-error-shape.js` と同じ理由でここに置いた——
依存も型注釈も無い素の ESM なので、Edge Function は相対 import（関数の bundle は
`supabase/functions/` の下しか運べない）、Vite はページに bundle、node のスクリプトとテストは直接
import できる。持つのは 2 つの値 `PAGES_URL`（リポジトリ名が決める。テストが git remote から
`pagesUrlFromRemote` で導き直して突き合わせる）と **`CUSTOM_DOMAIN`（変えるのはこれだけ）**、
そこから `SITE_URL`・`SITE_ORIGIN`・`SITE_HOST`・`SITE_BASE_PATH`・`SITE_ORIGINS`・
`SITE_USER_AGENT`・`siteUrl(path)`・`isSiteOrigin()`。不正なホスト名は読み込み時に throw する。

移行期: `SITE_ORIGINS` は「サイト＋（独自ドメインがあれば）Pages のオリジン」。終わりの日付を
持たせなかった——Pages のアドレスはリポジトリがある限り他人に渡らず、古いタブや SW の読者はそこに
いる。受け付ける費用は無く、拒めばその読者のエラー報告が落ちる。

workflow は import できないので `scripts/site-url.mjs` が値を印字する（`--origin`・`--host`・
`--base`・`--cname`・`--pages-host`・`--github-output`）。依存は node 組み込みと正本だけなので、
`uptime.yml` は sparse checkout（`package.json`・この 2 ファイル）で足りる。

## 2. 導くようにしたもの

- Edge Function: `client-errors`・`reader-reports`（`originAllowed` → `isSiteOrigin`）、
  `alerts-relay`（12 か所）・`gdelt-relay`・`sv-cov`（User-Agent）。`news-relay` は注釈だけ。
- ブラウザ: `js/client-error-report.js` は `isProductionOrigin()`（新旧どちらのオリジンからも送る）。
- ビルド: `index.html` の `og:url`・`og:image` はトークン `__INTMAP_SITE_URL__` にし、
  `scripts/site-url.mjs` の `siteUrlPlugin()` が埋める（`build-stamp` と同じ形）。同じプラグインが
  `CUSTOM_DOMAIN` があれば `dist/CNAME` を出し、空なら出さない。⚠ 上の通り CNAME ファイルは
  ドメインを結ばない——**結ぶのは Pages の設定**で、`ci.yml`・`deploy.yml`・`rollback.yml` の
  post-deploy に `--pages-agrees <page_url>` を足し、GitHub の答えと正本が食い違えば赤にした
  （smoke の後に `!cancelled()` で走るので、smoke の結果は失わない）。
- workflow: 4 本の `|| 'https://…'` を外した。`PROD_URL` が空なら `prod-smoke.spec.js` が正本を
  読む。`vars.PROD_URL` の上書きは残した（未設定・既存の機能なので消さない）。
- スクリプト: `release-state.mjs` の既定を git remote 由来から `SITE_URL` へ（remote は Pages の
  アドレスしか知らず、移行後は 301 を答える）。`probe-relay-ladder.mjs` の Referer を
  `new URL(SITE_BASE_PATH, ORIGIN)` に（唯一のベースパス前提だった）。`atlas-eval.mjs` の既定。
- テスト: hostname・rpId・スタックの固定値は正本から。`process-standing-rules` ③ の needle も。
- 文書・エージェント: 「本番で測った」注釈は「production」に（日付は残る。記録の正確な値は
  `dev-notes/`）。`README.md`・`AGENTS.md`・`.agents/roles/intmap-prod-verifier.md` は Markdown の
  参照定義 `[site:<path>]: <url>` を 1 か所に持ち、本文は `[…][site:terms.html]` で引く。定義行は
  `node scripts/site-url.mjs --write` が正本から描き直す（生成物 `.claude/`・`.codex/` は
  `agent-sync`）。

**置き換えた綴り: 48 ファイル・89 か所のうち 80 か所**（記録 21 ファイルは対象外）。残る綴りは正本の
`PAGES_URL` 1 行と、正本から描かれた参照定義 9 行（README 5・AGENTS 1・役 1・その生成物の写し 2）。

## 3. 検査

`scripts/site-url.mjs` の `siteSpellings()` を `check:static` の規則 23 `site-address` にした。
**事実（ホストが現れた）に付けた規則**で、ファイルの一覧を持たない——明日足されたファイルも同じ日に
捕まる。母集合は `git ls-files --cached --others --exclude-standard`（未追跡の新規ファイルも見る。
`CLAUDE.local.md` や `.claude/launch.json` のような ignore 済みのものは見ない）。例外は 3 つで理由を
コードに書いた: 正本・`dev-notes/` と `DEV-NOTES-ARCHIVE.md`（その日のアドレスで測った記録。
今日のアドレスに書き換えると起きていないことを述べる）・正本から描かれた `[site:]` 定義行
（`siteUrl(path)` と完全一致のときだけ。古い定義は `--write` を促して赤）。

`tests/domain-portable-checks.test.mjs`（9 件）:
① 値から全部が導かれる——今日の状態と、正本を `CUSTOM_DOMAIN="intmap.example"` に書き換えて
data: URL で評価した「移行後」の両方で（root に置かれる・Pages のオリジンも受け付ける・不正な
ホスト名は 5 通りとも拒む）。判断する読み手（`originAllowed`・報告器・3 本の Edge Function の
User-Agent）が値に訊いている。
② `PAGES_URL` は git remote から導いたものと一致する。
③ 木全体が規則を満たす／規則が言った通りに拒み・見逃す（10 通り）／`--write` が CRLF と字下げを保って
定義を描き直す／3 文書の参照が全部定義を持つ。
④ `base: './'`・SW の相対登録・`index.html` のトークン・プラグインの CNAME の有無。**`dist/` があれば、
1 つのビルドを `/` と `/IntMap/` の 2 か所に置いて、組み込み済みの index が名指すローカル資源
（13 件）を全部 200 で取れること**と、7 ページに root 絶対の URL が無いこと。

## 4. ドメイン取得後（手順書の要約。正本は docs/RELEASE.md「Moving the site to its own domain」）

利用者: ドメイン購入／GitHub でのドメイン検証（TXT）／DNS（A・AAAA または CNAME）／Search Console
／CARTO の申告ドメイン。エージェント: `gh api` で Pages の `cname` と HTTPS 強制／`CUSTOM_DOMAIN` の
PR（`--write`・`agent-sync`）／`site-origin.js` を import する Edge Function の再配備／Supabase Auth
の Site URL・Redirect URLs・パスキーの RP（token があれば API、無ければ利用者が dashboard）／本番検証。

## 起動費の天井を上げた理由

`supabase/functions/_shared/client-error-shape.js` がアドレスの正本 `site-origin.js` を import するようになり、`js/client-error-report.js` が起動時にそれを読むので eager のモジュールが 1 本増えた。エラー報告は起動の最初から働く必要があり（起動時の失敗こそ報告したい）、送ってよいオリジンの判定はその正本にしかないので、遅延読み込みにはしない。`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。
