---
title: 「この端末に保存されているもの」——ブラウザが IntMap のために持つものを、コードの全ての書き込みから作った一覧と突き合わせて種類別に見せ、1 件ずつ・まとめて消せるようにする。あわせて、廃止した AI のキーを毎回保存し直していた経路を止める
date: 2026-10-13
newsen: New in Settings ▸ Privacy — "Stored on this device" lists everything your browser keeps for IntMap (sign-in, keys, what you made, preferences, cached data), what each item is and its size, and lets you delete one item or all of them.
newsjp: 設定 ▸ プライバシーに「この端末に保存されているもの」を追加しました。ブラウザが IntMap のために保持しているもの（ログイン、キー、作ったもの、設定、データの写し）を、各項目が何か・大きさとともに一覧し、1 件ずつ、またはまとめて消せます。
---

〈依頼〉全権委任の第 4 波（分野: セキュリティ・プライバシー・データ保護）。利用者が「IntMap は信頼できる」と確かめられる、目に見える新しい
保護か透明性の商品を作る。

## 0. 何を作るかを決めた理由（測ったこと）

読者が自分のデータについて持つ問いは 3 つある——**アカウントに何がある**（`js/account-data.js`、第 1 波）・**このページは誰と話した**
（`js/connections-panel.js`、第 2 波）・**この端末に何が残っている**。3 つ目だけ答える手段が無かった（開発者ツールを開く以外）。

| 何 | 着手前 | 意味 |
|---|---|---|
| ブラウザのコードが読者のブラウザに書く名前 | 誰も数えていない。`localStorage` を読み書きする `js/` は 76 本、`setItem` の第 1 引数の多くは const・連結・包み関数 | Privacy §2・§5 の「ローカル保存」「Cookie・ローカルストレージ」の記述は、コードについて誰も照合していない主張だった |
| 実測（この回の発見器） | **97 の名前**（local 79・session 6・IndexedDB 4・Cache Storage 8。うち 3 つは `index.html` のインラインの起動スクリプト）＋ライブラリが書くログインのセッション 1 | 種類別: ログインとキー 4・作ったもの 16・操作の記録 18・設定 43・写しと内部の記録 17 |
| 読者が自分で消す手段 | ブラウザの「サイトデータを消去」だけ（全部か無か・何が消えるか見えない） | 共用の端末で「API キーだけ消す」ができなかった |
| `intmap_ai_config` | 起動時に古い `keys`（#R27 で廃止した BYOK の、読者自身の AI 提供元のキー）を読み込み、設定を保存するたびに**書き戻していた**。読む箇所は 0 | Privacy §2 は「AI キーをブラウザに保存することはありません」と述べている。#R27 より前にキーを入れた読者のブラウザには残り続けていた |
| サイトのアドレス | GitHub Pages のホストは同じアカウントの全 Pages サイトと共有 | ブラウザの保存領域はアプリではなくアドレスに属する。IntMap のものでない名前が同じ領域に在りうる |

## 1. 作ったもの

### この端末に保存されているもの（`js/device-storage-panel.js`・オンデマンド）

- ブラウザに尋ねる: localStorage と sessionStorage の全キー（大きさ＝UTF-16 で 2 バイト／文字）・`indexedDB.databases()`・Cache Storage の
  全保存領域と件数・Cookie・`navigator.storage.estimate()`／`persisted()`。
- 各項目を `data/device-storage-ledger.json` と照合し、種類別（**ログインとキー → 作ったもの → 操作の記録 → 設定 → 写しと内部の記録**）に、
  何か（en/jp の語）・大きさ・領域（消すまで保持／このタブだけ…）を示す。種類ごとに「消すと何が起きるか」を 1 文。
- **中身は表示も書き出しもしない**（キーの値はログインのトークンや API キーでありうる）。JSON の書き出しも名前・種類・大きさだけ（`valuesIncluded:false`）。
- 消す: 項目ごとのごみ箱（2 回押し・4 秒で戻る）。**「この端末から消去」は台帳が名指すものだけ**を消して再読み込みする——動いているページは
  設定とログインをメモリに持っていて書き戻すため。ログインのセッションは個別には消さず「ログアウトで消える」と述べる（生きているログインの
  クライアントの下で鍵を消しても、次のトークン更新が書き戻す）。
- **台帳に名前の無い項目**は別の節に、共有アドレスの説明とともに。一括消去は触れず、読者が自分で 1 件ずつ消す。Cookie は消さない
  （IntMap のコードは設定しない＝在るなら他のページのもの。ブラウザのサイト設定で消すもの）。
- **台帳を読めないときは**誰も「名前が無い」と言わず、一括消去も出さない（`.agents/rules/one-pass-or-a-reason.md` §5）。
- 見えるもの・見えないものを毎回述べる（データベースの一覧を返さないブラウザ、データベースごとの大きさは合計にだけ含まれる、など）。
- 入口: 設定 ▸ プライバシー ▸ 「この端末に保存されているもの」（`index.html`。リスナは「このページの通信」と同じ `js/connection-watch.js` の 1 本）と
  Atlas `system.deviceStorage`（読むだけ。`show:true` で一覧を開く。消すのは一覧で読者が行う）。

### 一覧の正本: コードの全ての書き込みから発見する（`scripts/device-storage-ledger.mjs`）

- ⚠ **名前は発見する。手で並べない。** `js/`・`src/`・`sw.js` の全ての `setItem`／`indexedDB.open`／`caches.open` を acorn で見つける。
  **受け手は綴りでなく値の流れ**で決める（`idbBackend(indexedDB)` → 別モジュールの `idb.open(DB)`、`const g = idbGlobal(); g.open(…)`
  も書き込み。`store.setItem` は違う）。**名前は束縛で読む**（const・連結・テンプレート・`?:`・キーのオブジェクト・名前を返す関数・
  包み関数の引数——呼び出し元が別モジュールでも）。決まらない部分は `*`、全体が読めない名前は拒む。
  最初の実装は `indexedDB.open` の綴りだけを見て、Atlas ノート（`js/atlas-notebook-store.js`）と GIS プロジェクト（`js/gis-project.js`）の
  2 つのデータベースを取りこぼしていた——受け手を値の流れで決めて両方が出た。地図の誤り報告の受付番号（`intmap_corrections`）は包み関数の
  引数で、呼び出し元を読んで出た。
- 語は `scripts/device-storage-words.json`（名前ごとに種類と en/jp）。名前は意味を述べないので導出できない——サーバ側の
  `account_data_catalog` と同じ形の目録。ライブラリが自分の名前で書くもの（supabase-js の `sb-<ref>-auth-token`）は `libraries` に、名前を作る
  ソースの行とともに宣言し、門が `node_modules` のその行を読む。
- `check:datagov` に規則 **`stored-disclosed`**: 語の無い名前・書き込みの消えた行・読めない名前・**Cookie の設定**・導出と一致しない台帳を拒む。
  照合の規則 `globMatch` は一覧と生成器が同じ 1 つを使う。

### 公開の面

- `security.html`・`ja/security.html` に「ブラウザに残るもの」——同じ台帳から種類ごとの数、ログインとキーの一覧、「IntMap のコードは Cookie を
  設定しません」（台帳の `cookiesWritten` から）。
- プライバシーポリシー §2 の末尾に一覧の場所と「Cookie を設定しない」を 1 文（en/jp）。

### 廃止した AI のキーを保存し直していた経路（`js/app-body.js`）

`aiConfig.keys` を読み込まなくし、古い `keys` を持つ保存済みの `intmap_ai_config` は起動時に 1 度だけ `keys` を除いて書き直す。読む箇所が 0 で、
能力は何も減らない（サーバ側の AI はアカウントのセッションで動く）。

### 実ブラウザが見つけた 2 つ（`tests/security-next.spec.js` の後半）

- **ページのインラインの `<script>` も書き手だった。** 発見器の最初の母集合は `js/`・`src/`・`sw.js` で、実ブラウザの一覧に
  `intmap_build_seen` が「名前の無いもの」として出た——`index.html` のインラインの起動ガード（CSP がハッシュで許す）が書く。
  追跡された全ページのインラインのスクリプト（JSON・import map を除く）を、ページの行番号のまま読むようにして 3 つ
  （`intmap_build_seen`・`intmap_doc_bust`・`intmap_stale_bust`）が出た。
- **IntMap 自身が開いているデータベースは消去要求に `blocked` を返す**（実測 Chromium・ダッシュボードの写し `intmap` が 1 ms）。
  最初の実装は `blocked` を「消せなかった」に数え、「この端末から消去」が再読み込みせずに止まった。`blocked` はブラウザが受け付けた
  消去で、接続が閉じた瞬間に終わる——再読み込みがそれを閉じる。一括消去は `blocked` を待ちとして再読み込みし、1 件の消去は
  「再読み込みか他のタブを閉じると消える」と述べる。

## 2. 確かめた

- `tests/wave4-security-checks.test.mjs` 9 本（`docs/TESTING.md`）。発見器は注入したソースで、一覧は偽のブラウザ（値に秘密を入れて、
  観測・モデル・書き出しのどこにも出ないこと）で評価する。語の行を 1 つ消すと ① が、書き手のモジュールを外すと ② が赤くなることを確かめた。

- 実ブラウザ: `tests/security-next.spec.js` の同じ boot の後半に足した（単独の spec は 2 回目の boot の分だけ高かった）。
  ローカル実測（負荷の高い同じ機械で各 2 回）で本体 5.4–5.6 s → 8.9–9.3 s。`tests/durations.json` の記録を同じ比で 19 → 31 にした。

## 3. 共有面

- `check:surface`: `window.IntMapDialog` の読みが 1 本増える（48 → 49）。`js/dialog.js` は export を持たず（「このページの通信」と同じ）、
  一覧は Escape と焦点の閉じ込めをその登録簿から受ける。`node scripts/global-surface.mjs --update` で記録した。
- `check:datagov`: `data/device-storage-ledger.json` は出自を値で持つ（発行者・URL・ライセンス・周期 `static`・builder・schema・行数と欠け・重複）。
  残る欄（`retrievedAt`・`generatedAt`・`asOf` と builder 側の同類）だけを `data/governance-ledger.json` に記録した（`--update`）。理由は
  `data/connection-ledger.json` と同じ: このファイルはコードと語の純関数で、`--check` がバイトで比べるので、生成時刻を書けば毎回不一致になる。

## 4. 残っていること

- 消した項目を、動いているページがメモリから書き戻すことがある（設定など）。一覧はそう述べ、まっさらにしたいときは「この端末から消去」
  （再読み込みつき）を使う。
- データベースごとの大きさはブラウザが報告しない（合計にだけ含まれる）。
