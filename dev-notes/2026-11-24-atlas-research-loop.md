---
title: 調査を Atlas が回すための道具(research.search)・ツール定義の二重送信の解消・依頼した成果物が実在した割合の継続計測・セッション/PR を増やさない規則
date: 2026-11-24
newsen: Atlas can now run an investigation loop with a search tool that reads sources in their own language and never re-fetches what it already has, and IntMap now measures how often the thing a reader asked for actually existed when the turn ended.
newsjp: Atlas が原文の言語・国・出典サイトを指定して同時に検索し、取得済みのものを再取得しない道具で調査を繰り返せるようになり、依頼された成果物が実際に存在した割合を継続して測るようになった。
---

〈依頼〉 外部監査で「誰も着手していない」とされた 3 項目と開発規則 1 つを 1 本の PR で。重複しそうな PR(#1359 実行基盤・#1360 長文・#1296/#1337 Web 操作・#1331 費用記録・#1333 完了判定・#1377 実測記録)を着手時に確認し、触っていないことを確かめた(#1331・#1377 は merge 済みで、その上に積んだ)。

## 1. 調査の自律性 — `research.search`(`js/atlas-research-search.js`)

- **観測**: `research.analyze` は GDELT / Google News を 1 回集めて 1 回答える。検索語・言語・出典の変更は Atlas の手に無かった。GDELT は英語の話題しか当たらず(#R64)、Google News は読者の言語と英語の 2 版だけ(`_gnewsNews` の `LOCS`)で、ウクライナ語・ロシア語・ポーランド語の原文には当たれなかった。
- **作ったもの**: Atlas が `queries:[{q, lang, country, site, engine, timespan}]` を渡すと、全検索を同時に走らせ、記事(見出し・媒体・日付・URL)を返す読み取り専用の能力。回答は書かない。何を・どの言語で・いつまで調べるかは Atlas が決める。
  - 言語は BCP-47 の語、国は ISO alpha-2 を Atlas が書く。GDELT の `sourcelang:`/`sourcecountry:` の語は `Intl.DisplayNames` から**導出**(言語表を持たない)。Google News は `[hl, gl, ceid]` を直接指定(`_gnewsNews` に任意の第 4 引数を足しただけで、既存の呼び出しは同じ)。`site` は GDELT の `domainis:` と Google News の `site:` に渡る(一次資料・公的機関の発表への照合の入口)。
  - **同じ検索は再取得しない**: このターンで実行済みの検索は `alreadyRun` と答え、見つけた件数を返す。別の検索が既に返した記事は一度だけ並べ、2 回目以降は `alreadySeen` に数える。ターンが変われば記憶は新しい(最後の 8 ターンだけ保持)。
  - **3 つの状態**: 各検索は `ok / empty(取得先は答えたが 0 件) / unavailable(どこにも届かない)`。unavailable を「報道が無かった」と言わない(#R769 と同じ線)。
  - **調査の台帳**: Atlas が書く `gap`(不足)・`contradiction`(矛盾)・`changed`(変えたこと)をラウンドごとに保存して返し、**実際に変わったこと**(新しい語・言語・サイト・エンジン)は検索語から計算して `delta` に載せる(Atlas の申告を信じない)。
  - **上限は無い**(`one-pass-or-a-reason` §1・Atlas 全権): 検索数・ラウンド数・言語数に回数の柵を足していない。試験で 40 検索×13 ラウンドを通している。
- 結果は `js/atlas-toolsurface.js` の許可リストに `research` を足して初めてモデルに届く(許可リストに無いと、検索が走ってもモデルは何も読めない — #R766 と同じ形)。
- 能力数 261 → 262(台帳 `atlas-caps --write`、`check:capabilities`・`check:catalog`・`check:docs` で整合)。
- **未実施**: 本番での実測(ログインが要り、資格情報の入力は禁止行為なので行っていない)。`research.search` が実際に原文の記事を返すか、Atlas が選ぶかは、配備後に W 杯・半導体と同じ文面で見る(観る点: 各検索の `state`、`delta.languages` に英語以外が出るか、`alreadyRun` が出た回数)。

## 2. ツール定義の送信量 — 実測してから、効いた所だけ

`node scripts/atlas-prompt-weight.mjs`(今回足した計器。`--find "<語>"` と `--ledger <run.json>` でキャッシュ率も読む)。

| 部分 | 実測 | 判断 |
|---|---|---|
| 基本ツール 13 本の定義 | **13,127 字(≈3,300 トークン推定)**。ビルド 2 回でバイト一致 | 既に固定の前置き。変更なし |
| ペルソナ(`atlas-persona.js`) | 12,423 字 | 固定。変更なし |
| プロンプトキャッシュの鍵 | `cacheBasis` は system と基本ツールだけのハッシュ。昇格したツールは**後ろに足し、鍵に入れない**(`turn.ts`)。可変の地図状態は user 側 | **設計は既に正しい**。直す所が無い |
| `find_capability` の結果 | 広い問い(「ウクライナの港のニュース」)で 24 件・9,359 字、うち**スキーマ 7,351 字**。同じ 24 本が次の呼び出しからツール定義として **12,987 字**で再び載る | **同じスキーマが 2 回送られていた** |
| 狭い問い(「大阪駅からの経路」) | 3 件・1,361 字(スキーマ 1,023) | 差は小さい |

- **直したもの**: 昇格(`promotedTools`)した一致は、結果の `schema` を外して `schemaIn: 'the definition of the tool «…»'` と言う(`js/atlas-agent.js`)。昇格されなかった一致(関数数の上限で外れたもの)は schema を保つ——`run_capability` がそこへ届く唯一の道だから。発見の精度は変わらない(一致の id・tool 名・要約・順位は同じ、能力は 1 つも減らない)。広い問いで結果から約 7 KB、その結果が同じターンの後続の呼び出しで毎回再送される分が減る。
- **直していないもの**: 能力の絞り込み(検索型の読み込みは既にある: 基本 13 本＋`find_capability`)、昇格の件数制限(R413 で消した番人。Atlas 全権)。本番の `ai_turns` の入力/キャッシュ読み出しトークンの内訳は**取得できていない**(ログイン不可)ため、キャッシュ率の実測値は無い。`--ledger` で #1331 の費用記録を渡せば測れるようにした。**上の字数は文字数で、トークンは推定**(ASCII 4 字/トークン・それ以外 1.5 字/トークン)。
- documentation(`catalogText`)は計器の環境では結合されず 0 字。実際の結果ではこれが加わる(R406 の実測で最大 39,235 字)。

## 3. 「依頼された成果物が実在した割合」を繰り返し測る

- `scripts/atlas-eval/deliverables.mjs`: 問いが持つ `deliverables`(`map`＝既存の `mapState` の基準、`result`＝成功した能力呼び出しとその結果の値)を、**ハーネスが残した記録**(snapshot・operations・calls)から数える。答えは `present / absent / unobserved` の 3 つで、観測できなかったものは失敗に数えない(`one-pass-or-a-reason` §5)。ターン自身の trace が述べる `completion`(#1333)と突き合わせ、**「完了」と言ったのに成果物が無かった**ターン(falseCompletion)と、**正直に未完と言った**ターンを分けて数える。返答の文言は読まない。
- 既存の 42 問は `mapState` を持つので、**そのまま成果物として数えられる**(重ねて書かない)。他の問いは `deliverables` を足せば入る。
- `scripts/atlas-eval.mjs` が `completionRate` を report に載せ、`scripts/atlas-completion-rate.mjs --report <report.json> --history <file.jsonl>` が 1 行に畳んで追記する(**記録様式**: 1 行 1 JSON・追記のみ・古い順・dry-run と観測 0 件は追記しない)。傾向は `--history` だけで出る。既存のテストは変更していない(凍結中)。
- 実測の初回値は**まだ無い**: ライブ評価にログインが要る(夜間の `atlas-eval.yml` が必要な 2 つの秘密が未設定で、記録上 9 回走って何も測っていない — `scripts/atlas-eval/reach.mjs` の記述)。値が出るのはその設定後。今回の PR が保証するのは、測る側が動くこと(`tests/atlas-research-loop-checks.test.mjs`)。

## 4. 規則

`.agents/rules/execution-strategy.md` に §7「セッション数・PR 数を増やさない」を足した(`AGENTS.md` は天井があるので触っていない)。`check:agents` は通る(この規則は写しの対象外で、`.claude/` `.codex/` は変わらない)。

## 5. 検査

`tests/atlas-research-loop-checks.test.mjs`(12 件): 言語・国・サイトの導出、取得済みの再取得なし、3 状態、台帳と delta の計算、上限なし(40 検索・13 ラウンド)、能力の登録、成果物の present/absent/unobserved・falseCompletion・割合・履歴、スキーマの一度きり送信(実際のエージェントループで)。隣接の `atlas-turn-engine`・`atlas-agent-loop`・`atlas-50-remainder`・`atlas-eval-*` は無変更で通る。

## 6. 天井を上げた理由(check:perf)

- 上げた行は async chunk `atlas-cap-runs` の 1 行だけ: 981.3 kB → **991.0 kB(+9.7 kB)**。CI と同じ木(main を取り込んだ後)をビルドして測った値で、`perf-budget.mjs --update` が他の行を書いていない。
- 買ったもの: `research.search`(能力の run・schema・説明・結果カード)。検索の本体 `js/atlas-research-search.js` は約 170 行で、能力の run と同じ chunk に入る。これは Atlas が原文の言語・国・出典サイトを指定して調べる唯一の入口で、他の能力を介して代替できない(統合できる既存の検索は無い: `research.analyze` は 1 回集めて 1 回答える形)。
- 起動(eager)は増やしていない。能力の本体は遅延読み込みで、基本ツール 13 本の定義も変わらない。
