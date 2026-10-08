---
title: 「ビルドが他の worktree の dist に書いた」は共有 scratchpad の同名ログだった——ビルドは交差していない。実在した 2 つ（--outDir を無視して dist/ に書く 6 つのプラグイン・同じ木の 2 本のビルドの重なり）を直し、共有の時代タイルキャッシュを rename で書く
date: 2026-10-08
internal: ビルドの道具の作り直しで、配られるページの中身も画面も変わらない
---

〈依頼〉並行 9 体の作業中に、wt-sales-schools で `npm run build` を 2 回走らせたら、生成ページの書き先が
`wt-hist-product\dist`、次に `wt-mobile-product\dist` と出た（`--configLoader native` では出ず、`runner` は失敗）。
別の担当は同じ worktree でビルドが重なり `dist/` が書き換わった・EPIPE を観測。見立ては「vite が設定を束ねた
一時ファイルを共有の `node_modules/.vite-temp` に書き、並行ビルドが取り違える」。機構を確定して構造で直す。

## 0. 見立ては否定された——ビルドは交差していない

- **vite 8.3.1 の既定の読み込み（`bundle`）を読んだ**（`node_modules/vite/dist/node/chunks/node.js` の
  `bundleConfigFile` / `loadConfigFromBundledFile`）。一時ファイル名は `vite.config.js.timestamp-<Date.now()>-<乱数>.mjs`
  で毎回一意。`import.meta.dirname` / `import.meta.url` は rolldown の `define` で置き換えられ、各モジュールの先頭に
  **元のファイルの位置が文字列として**注入される。残っていた一時ファイル（約 5 MB）を開くと、21 本の
  `scripts/*.mjs` の注入値はすべてそのファイルを作った worktree のものだった。
- **再現**: scratchpad に木の写しを 2 つ（`node_modules` は原本への junction、`worktree.mjs` と同じ形）作り、
  同時に `npx vite build`。両方とも自分の `dist/` に書いた（history-pages の書き先がそれぞれの写し）。
  設定の読み込みだけを 2 つの木から 6 本ずつ同時に 12 本走らせても、`root` は全部自分の木。
- **実際に起きていたこと**: 9 体は**同じセッションの subagent で、scratchpad が 1 つ**
  （`…\Temp\claude\<cwd>\2f5999b6-…\scratchpad`）。会話記録から:
  wt-mobile-product が 01:13:51 に `npm run build > scratchpad/build2.log`、wt-sales-schools が 01:16:38 に
  **同じ名前**へ `>`。sales-schools が読んだ `build2.log` は**先頭が NUL バイト**で、続く行は
  「history-pages: wrote … into …\wt-mobile-product\dist」——後から `>` で切り詰めた書き手の下で、
  先の書き手が自分の位置に書き続けた形そのもの。1 回目の `build.log` も、後から wt-hist-product が
  01:04:41 に同じ名前へ書いていた。`--configLoader native` が「直した」のは、そのとき**ログの名前を
  `build4.log` に変えた**から。`runner` の失敗は別件（«Vite module runner has been closed»、closeBundle で子プロセスを
  待つプラグインの途中で runner が閉じる）で、既定の経路ではないので触っていない。
- ⇒ 読み込み方を `native` に固定する理由は無くなった（変えていない）。共有 scratchpad の事実は
  `docs/AGENT-SETUP.md` §5.2 に書いた——**名前に slug を入れる**。

## 1. 実在した欠陥 ① ——6 つのプラグインが `--outDir` を無視して `dist/` に書いていた

`vite.config.js` の copyStatic・appShell・histTiles・katexAssets・supabaseAdminSdk・cesiumAssets が
`join(ROOT, 'dist')` を書いていた（ページを書く 7 つは `resolve(c.root, c.build.outDir)` を使っていた）。
`scripts/map-motion.mjs` と `scripts/phase-profile.mjs` が案内する `npx vite build --outDir dist-dev` は、束を
`dist-dev/` に、data/・sw.js・cesium/ などを**既存の `dist/` の上に**書いていた。6 つとも `configResolved` で
解決済みの出力先を受け取る形にした（`outDirOf`、ページを書く 7 つと同じ式）。

## 2. 実在した欠陥 ② ——同じ木の 2 本のビルドが同じ `dist/` を書き合った

1 つの worktree（wt-deep-tier-reds）に 3 体が居て、手で走らせた `npm run build` と Playwright の webServer の
`npm run build` が重なり、intmap-copy-static が «EPIPE, The process cannot access the file because it is being used by another
process … dist\data\admin1-world.json» で落ち、CSS の無いページが配られた。
ビルドは出力先を **1 本ずつ握る**（`acquireOutDirLock`。buildStart で取り、最後の closeBundle（`post`・一覧の末尾）
か process の exit で放す）。2 本目は**待ってから作る**——どちらも完成した木で終わり、拒否も再試行も無い
（`.agents/rules/one-pass-or-a-reason.md`）。錠は**解決済みの出力先**で決まるので、別の worktree や `--outDir` は
待たない。
錠は**待ち受けているソケット**（Windows は出力先から名づけた named pipe、他は `os.tmpdir()` の Unix socket）で、
2 つ目の待ち受けは OS が拒み、持ち主のプロセスがどう終わっても OS が閉じる。
⚠ 最初は「pid を書いたファイル＋心拍」で作り、実ビルドで測って捨てた: 同時に 3 本走らせると、site-URL の
埋め込みと CSP の付与（どちらも約 5,400 ページを同期で歩く）が **357 s と 287 s** かかり（rolldown の
PLUGIN_TIMINGS）、その間タイマーは 1 度も走らず心拍は止まっていた。「10 分黙っていたら死者」という規則は
負荷次第で生きているビルドから錠を奪う。ソケットへの接続は持ち主の JavaScript が塞がっていてもカーネルが
受けるので、忙しい持ち主を死者と取り違えない（検査 ④ が 3 秒同期で止まる持ち主で確かめる）。
⚠ 退役した `gate-lock`（dev-notes/2026-10-01-retire-gate-lock.md）との違い: あれはテストが**読む**木を
書き手の数だけ直列にし、600/900 s の待ちで飢えた。こちらはビルドの出力先 1 つに書き手が 1 つで、待ちは
先のビルド 1 本ぶん。

実測（この worktree、2026-10-08）: 最初の版で `npm run build` を 2 本と `npx vite build --outDir <scratch>/outC` を同時に
走らせ、2 本目は «build-lock: another build (pid … ) is writing …\wt-build-isolation\dist — waiting for it» と言って
952 s 待ってから作り、`--outDir` の 1 本は待たずに走ってページの書き先は全部 `outC`、3 本とも exit 0。
ソケットの版で `npm run build` を 2 本同時に: 2 本目は 230 s 待ってから作り、2 本とも exit 0、書き先は全部この木の `dist/`。
その `dist/` で `check:perf`・`check:assets` は緑。

## 3. 共有の時代タイルキャッシュ

`scripts/build-hist-tiles.mjs` のキャッシュ（`%LOCALAPPDATA%\intmap-data\hvt-cache`）は全 worktree のビルドが読み、
「3 つのファイルが在る」をヒットとして**検証せずに**読む。その場で書いていたので、書きかけの archive をヒットと
取る形があった（観測はしていない）。各ファイルを別名で書いて名前へ rename する。

## 4. 共有の場所の全数（直していないもの）

- `node_modules/.vite-temp/`: 一意の名前で安全。強制終了されたビルドの一時ファイルが残る（原本の中＝OneDrive、
  2026-10-08 時点で 8 本・約 40 MB）。
- `node_modules/.vite/`: `vite`（dev）の依存キャッシュ。プレビューは `scripts/serve.mjs` なので通常は使われない。
- データ更新スクリプトの上流キャッシュ（`node_modules/.cache/intmap-*` 7 系統・`%TEMP%\intmap-*-cache` 十数系統）:
  共有で、多くはその場で書く。頻繁に並行しては走らないので今回は触っていない。
- Playwright: 出力は各木の `test-results/`、ブラウザは共有の読み取りだけ。

## 5. 検査

`tests/build-isolation-checks.test.mjs`（6 本）: ① 2 つの木から既定の読み込みで同時に 12 本読ませ、root と
設定が import したモジュールの位置が自分の木 ② ビルドの全プラグインの closeBundle を自前の outDir で走らせ、
fs の書き込み関数（`scripts/tree-writers.mjs` の `WRITES` を配った）と `--out` を記録——outDir の外への書き込み 0
（6 つのうち 1 つを戻すと赤くなることを確かめた。appShell はビルドレポートが無い木では観測できない）
③ 同じ出力先の 2 本目は待ち、別の出力先は待たない ④ 3 秒同期で止まった持ち主からは奪わない
⑤ 錠を取って SIGKILL された実プロセスの錠はすぐ取れる ⑥ 錠の closeBundle が最後に走る。
