---
title: 委譲の子が能力表を自分で引く手と、閉じたページからの再開
date: 2026-11-19
---

〈依頼〉 `2026-11-19-delegation-agent-loop`（子が許可された読み取り能力を `{"call":…}` で自分で呼ぶ）が「直していない」と書いた 2 点のうち、
① ページ内の snapshot／resume の配線（ブラウザを閉じても走り続けるサーバ実行ではない）と、② 子が能力を探す手（`find_capability` 相当）。

## 0. 経緯

最初は、子に Atlas と同じ手番の輪（`runTurn`）を持たせる新しい契約の種類 `agent` と、サーバのタスク `atlas_delegate_turn` で作った。
別の作業が先に `{"call":…}` の輪を `makeWorkerExecutor` に入れて main に着いたので、二重実装になる側（`agent`・`atlas_delegate_turn`・
`capabilityClass`）は捨て、その上に 2 点だけを足した。新しい契約の種類もサーバのタスクも作っていない。

## 1. 作ったもの

- **探す手**: 契約の `tools` に `find_capability` を入れると、子は `{"call":{"capability":"find_capability","args":{"query":…}}}` で
  能力表を語で引ける（`js/atlas-delegate.js` の `searchStep`）。検索はページの `findCapabilities`（`js/atlas-console.js`）＝ Atlas 自身の
  `find_capability` と同じ `TOOLS.find`。見つかったもののうち `classifyCapability` が `read` と言うものだけが、次の要求からその子の許可に加わる。
  それ以外は走らせず、`capability_not_read_only` の理由つきで子に返す。許可外の能力を直接呼んだときも、読み取りでなければ同じ理由を添えて拒む。
  `research.delegate` 自身は規則が `other` と言うので、検索で見つかっても直接呼んでも走らない。能力の一覧は手で持たない（レジストリの検索）。
  `find_capability` は Atlas が同じ検索を呼ぶ名前で、能力 id にその綴りは無いので、許可と能力を取り違えない。
- **再開**: `makeDelegationStore`・`delegationKey`・`pageDelegationStore`（状態は `js/atlas-delegate.js` 側。能力モジュールの先頭に状態を
  置くと build が拒む）。`research.delegate` は始めに同じ一覧の記録を引いて `resume` に渡し、仕事が 1 つ終わるたびに書く。`fresh:true`、
  カードの「前回の実行の結果・再実行なし」、結果の `resumed`、`meta.resume`。一覧の識別は各契約の `contractKey`（`tools` を含む）と `verify`。
  node（IndexedDB 無し）では `useDelegationStore()` で渡されない限り何も保存しない——既存の検査が同じ一覧を繰り返し走らせても互いの結果を拾わない。

## 2. 判断と根拠

- **探す許可は親が出す**（`tools` に `find_capability`）。親が何も渡さない子が勝手に能力表を引くと、#1250 が「許可は親の grant だけ」とした線が崩れる。
  許可されたのは「探すこと」で、走らせられる範囲は従来どおり読み取り専用だけ。
- **見つかったものの数に上限を足していない**。検索は 1 回あたり `TOOLS.find` の件数を返し、検索の回数は子の要求上限（8）に縛られる。
- **記録の寿命は `TURN_TTL_S`（900 秒）**。サーバが同じ要求の答えを返す（replay）間と同じで、それより古い「いまの世界についての答え」は返さない。
  数は `js/atlas-delegate.js` に観測・失効条件・正本を書き、検査が `config.ts` の値と境界で一致することを確かめる。
- **一覧単位で識別する**。後の仕事の鍵は入力を id で名指すだけで中身を含まないので、一覧をまたいで同じ鍵を流用すると違う入力からの結果を返しうる。

## 3. 見つけて直したもの（依頼の 2 点の外・同じ経路の欠陥）

`describeCapability` は `CAPS.resolve(id).schema()` を読んでいたが、レジストリの記録に `schema` は無い（schema は `js/atlas-schemas.js`
で、記録には `inputSchema` として、道具面では `TOOLS.schemaOf` として届く）。node で実測: `data.value` の記録の鍵に `schema` が無く、返り値は
常に空文字。つまり #1250 の子は、許可された能力の引数を一度も示されていなかった。`TOOLS.schemaOf`（Atlas の `run_capability` が検査に使うもの）
を読むように直した。探す手の答えが「引数は上に示した」と言うので、これを直さないと嘘になる。検査は実物の console の関数を取り出して評価する。

## 4. 起動費用の天井

- 非同期チャンク `atlas-delegate` が 59.8 kB → 62.7 kB（+2.9 kB、帯 2.0 kB を超える）。買ったもの: 再開の保存口（`makeDelegationStore`・
  `delegationKey`・`pageDelegationStore`）と、探す手（`searchStep`・許可外の理由）。委譲を使うときだけ読み込まれ、起動時の同期チャンクと
  起動時の要求数（3）は変わっていない。IndexedDB の 2 つの backend は `js/atlas-notebook-store.js` のものを読み、チャンクには複製していない
  （build の出力で `atlas-delegate` は既存の共有チャンクから import している）。
- ⚠ 天井はまだ上げていない。`node scripts/perf-budget.mjs --update` は「この木は CI が測る木ではない（origin/main に 5 commit 先行）」として
  拒んだ。commit して origin/main に載せ直し、build し直してから `--update` する（統合する側の作業）。

## 5. 直していないもの

- ブラウザを閉じているあいだも続く実行（server 側の実行器）。
- `dialog.ask` は能力表の上で読み取り専用（risk read-only・書き込みなし・確認不要）なので、`capability` の仕事からも子の `{"call":…}` からも
  走らせられる。利用者に質問を出す能力が子から出せるのは意図とずれている可能性がある（規則に例外を足すのではなく、表の `risk` が
  「利用者に話しかける」ことを表していない点を直すべきか、判断が要る）。
- 子への要求の長さ: 許可された能力の schema（各 1,200 字まで）と、それまでの呼び出しの結果（各 3,000 字＋データ 1,500 字まで）を毎回全部
  載せるので、8 回目近くでは ai-proxy の `MAX_PROMPT`（24,000 字）を超えうる（#1250 からの性質。探す手で許可が増えると早まる）。未測定。
- 8 回で足りるかの実測。

回帰: `tests/delegate-child-loop-checks.test.mjs`。
