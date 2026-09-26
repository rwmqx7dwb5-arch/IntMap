---
title: 原本の依存を lock に合わせる手順が、早送り直後の 1 回目には走らず、走っても試験用ブラウザを入れていなかった——原本自身の deps-fresh --install を呼び、npm ci の後にブラウザも入れる
date: 2026-09-26
---

〈依頼〉「IntMap, 様々な側面から監査し、すべてやりきって。」の続き（多面的監査 #759 が入れた `master-sync --sync` の依存追従を、本番で初めて使って見つかった 2 点）。

## 0. 測った

- **#759 を merge した直後の `node scripts/master-sync.mjs --sync`（原本で実行）は、依存に一切触れなかった。**
  走っていたのは早送り**前**の `master-sync.mjs` で、依存の段がまだ無い版だった。2 回目の実行で
  `npm ci`（269 件、13 秒）が走り、`deps-fresh: OK` になった。データ集合の段は元から
  `<原本>/scripts/data-assets.mjs pull` を子プロセスで呼んでいたので、この問題が無かった。
- **npm ci で `@playwright/test` が 1.61→1.63 に上がった直後、ローカルの spec はすべて起動で落ちた**
  （`Executable doesn't exist at …\chromium_headless_shell-1243\…`）。Playwright のブラウザは
  node_modules の外に版ごとに置かれるので、lock を合わせただけでは試験が走る状態にならない。

## 1. 直したもの

- 依存を合わせる処理を `scripts/deps-fresh.mjs --install [dir]` に移した: 食い違うときだけ `npm ci`、
  再確認、そして木が変わったときは `npx playwright install chromium`（あれば何もしない）。
- `master-sync --sync` は、早送りの後に**原本自身の** `scripts/deps-fresh.mjs --install` を子プロセスで呼び、
  その終了コードで判定する（データ集合と同じ形）。

## 2. 検査

`tests/multi-aspect-audit-checks.test.mjs` ②b を新しい形に（`--sync` が原本の deps-fresh --install を呼ぶ／
install が 確認→npm ci→再確認→ブラウザ の順）。
