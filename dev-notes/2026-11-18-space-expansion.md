---
title: 宇宙機能の増強——今夜の空（天文暦）・日食の通過帯・打ち上げ・火球・宇宙天気・地球に近づく小惑星・衛星の通過予報、天文現象の時刻を TT に
date: 2026-11-18
newsen: New in space - The sky tonight (sunrise, twilight, the Moon, visible planets, meteor showers, satellite passes and the next eclipses from any point), solar eclipse paths, rocket launches, fireballs, and space-weather and asteroid flyby widgets.
newsjp: 宇宙の新機能——任意の地点の「今夜の空」（日の出入りと薄明・月・見える惑星・流星群・衛星の通過・次の日食と月食）、日食の通過帯、ロケット打ち上げ、火球、宇宙天気と小惑星接近のウィジェット。
---

〈依頼〉「宇宙機能を徹底的に増強して。」

## 0. 測った（着手時の棚卸し）

宇宙まわりは本物のデータで深く作られていた（太陽系エクスプローラ・星空・SGP4 のライブ衛星・食の計算・深宇宙）。欠けていたのは
**計算はあるのに読者と Atlas に届いていないもの**と、**上流が公開しているのに読んでいないもの**だった:

- 食の計算（`js/space-events.js`）はエクスプローラのパネルからしか見えず、Atlas の能力もレイヤーも無かった。地図上の日食の通過帯は無かった。
- 打ち上げ・ISS・Kp はウィジェットだけ。打ち上げのウィジェットは `mode=list` で読んでいて、その応答には `pad` が無い（2026-11-17 実測）ので
  射場の地図と fly-to は常に空だった。
- 宇宙天気は Kp とオーロラだけ。火球・小惑星の接近・流星群・惑星の見え方・頭上の衛星の一覧は無かった。
- `js/space-events.js` は UT をそのまま暦表に渡し、太陽の光行差も入れていなかった：月食の最大時刻が NASA より最大 188 秒遅い（2026-03-03）。

## 1. 足したもの

| もの | 正本 | 上流・方法 |
|---|---|---|
| ある地点・ある夜の暦 `IntMapAlmanac` | `js/space-almanac.js` | 天体暦から探索。出入りは Meeus 15 章の h0、惑星等級は AA 1984（Meeus 41 章）、流星群は IMO 2026 カレンダーの太陽黄経から年ごとに日付を計算（日付の表を持たない） |
| 日食の通過帯 `IntMapEclipsePath` | `js/space-eclipse-path.js` | 影の軸と円錐を WGS-84 と交差、ΔT（Espenak & Meeus）・光行差・地球月重心の補正を入れて TT で |
| 「今夜の空」パネル `IntMapSkyAlmanac` | `js/sky-almanac.js` | 上の 2 つと `passesOver`。地点を先に選ばせる（#R302） |
| 日食の通過帯レイヤー `dl-eclipse` | `js/layer-pkg-eclipse.js` | 時計の次の日食、または固定した日食 |
| ロケット打ち上げレイヤー `dl-launches` | `js/layer-pkg-launches.js` | Launch Library 2、時計の 7 日前〜30 日後 |
| 火球レイヤー `dl-fireballs` | `js/layer-pkg-fireballs.js` | NASA/JPL CNEOS、自前の中継（JPL は CORS ヘッダを返さない） |
| 宇宙天気・小惑星接近のウィジェット | `js/widget-defs-space.js` | NOAA SWPC（太陽風・GOES X 線・フレア確率・R/S/G・警報）、JPL CAD |
| Kp の 3 日予報 | `js/widget-defs-data.js` `space.kp` | SWPC `noaa-planetary-k-index-forecast.json` |
| 衛星の通過予報 `passesOver` | `js/satellites-live.js` | 既存の SGP4 と日照判定。候補の絞り込みは総当たりと突き合わせて取りこぼし 0 |
| Atlas: `sim.skyTonight` / `sim.satellitePasses` / `sim.spaceWeather` | `js/atlas-cap-sim.js` | 上の正本をそのまま呼び、計算した事実を `meta` に載せる |

中継の規則 `jpl-ssd-api`（`supabase/functions/_shared/fetch-relay-policy.js`）は `/fireball.api` と `/cad.api` だけを、両 API が文書化した引数だけで通す。
2026-11-17 実測: fireball（位置あり）888 件・63,900 B・0.93 s、cad 6,345 B・0.52 s、どちらも Access-Control-Allow-Origin なし。

## 2. 精度（照合した値）

- 日の出入り：東京 2026-06-21 が国立天文台の 4:25 / 11:43 / 19:00 と一致。満月は USNO と分単位で一致。流星群 11 群の 2026 年の極大日が IMO の印刷日と一致。
- 日食 4 件（2023-10-14・2024-04-08・2026-08-12・2027-08-02）：NASA との差は最大食の時刻 4〜46 s、地点 28〜37 km、中心線 13〜41 km、本影の幅 3 km 以内。
- 月食の時刻：TT 化で 2026-03-03 は NASA との差 188 s → 68 s。残りは `js/ephemeris.js` の太陽位置（JPL 近似要素、−13″〜+35″）の誤差で、
  検査はそこから導いた ±86 s で書いた。これ以上詰めるのは太陽理論の差し替え（VSOP87 の短縮版など）で、今回はしていない。
- 衛星の通過の「明るさ（等級）」は全件 null。出典つきの標準等級表がリポジトリに無いので作らなかった。

## 3. 窓口と台帳

- 新しいグローバル 2 つ: `IntMapEclipsePath`（日食の通過帯の計算。`js/layer-pkg-eclipse.js` は import で読むが、パネルと Atlas のために窓口にも置く）、
  `IntMapSkyAlmanac`（遅延モジュールのパネルの制御。`js/lazy-modules.js` の `publishes`）。
- Atlas（`js/atlas-cap-sim.js`）は暦を `window.IntMapSkyAlmanac.almanac` で読む——パネルの扉を通すので、暦と天体暦はパネルの遅延読み込みに
  載ったまま。⚠ 一度 `space-almanac.js` を直接 import したら、`js/ephemeris.js` が import 時に `window` を書くので、能力表を Node で読む
  `check:capabilities`・`check:catalog` が `window is not defined` で落ちた（Atlas の能力ファイルは Node で評価される）。
- `IntMapSpaceEvents` と `IntMapLang` の window 経由の読みは import にした（`module-graph --migrate`）。`window.IntMapSafe` の読みが 3 増えたのは、
  打ち上げの配信リンクを `IntMapSafe.url` に通したことと、パネル・火球の凡例で数値と識別子を符号化したことによる。
- ⚠ `scripts/output-taint.mjs` の名前の索引は**全ファイル共通**で、同じ名前の関数が他所で安全と判定されなければ自分のも判定されない
  （`days`・`deg`・`dirOf` が他のファイルにあった）。パネルの補助関数は固有の名前（`almDaysUntil` など）にし、数値の書式は `fmtN` で符号化した。
- 翻訳の床（`tests/i18n-coverage-floor.json`）を下げた：IntMap が書く新しい文は en + jp だけで、残り 7 言語は凍結（CONSTITUTION §7）。
- `js/legal-text.js` のプライバシーポリシー §4 に NASA/JPL と SWPC の追加系列・Launch Library 2 の送信内容を書き、日付を更新。

## 4. 既存の不具合の修正

- `space.launch` ウィジェットの `mode=list` → `mode=normal`（射場の座標が来ていなかった）。
- `js/space-events.js` の時刻（上の §2）。これに伴い `tests/layer-space-satellites-checks.test.mjs` R212 ⑥ の読み込みを `new Function` から
  `importModule` に替えた（space-events が import を持つモジュールになったため）。
- Atlas の `sim.space` の説明にあった「月以外の衛星は描かない」「ズームの床に出るボタンからしか行けない」を、現状（177 衛星・ズームアウトで入る）に合わせた。

## 5. 検査

`tests/space-almanac-checks.test.mjs`・`tests/space-almanac-panel-checks.test.mjs`・`tests/space-layers-checks.test.mjs`・`tests/space-weather-checks.test.mjs`、ブラウザでは `tests/r197.spec.js` の末尾 2 件（§8）
（各 12 件）。既存の `engine-space`・`space-ephemeris`・`layer-space-satellites` も緑。

## 6. CI で見つかり直したもの（PR の 1 周目）

- `ssd-api.jpl.nasa.gov` は中継を通すが、ブラウザのコードに URL の文字列として現れるので「要求するホスト」として申告が要る
  （`check:datagov` の手元の判定と CI の `outbound-hosts-disclosed` の判定が一度食い違い、CI 側が正しかった）。行を戻した。
- 出典表の新しい 4 行に en と jp の説明（`js/locales/pages.{en,ja}.js` の `sourceUse`）。
- 宇宙の棚は `rest`（「その他」に畳む行）が末尾に並ぶ必要がある：宇宙基地（30・rest）より前に新しい 3 行（22・24・26）を置いた。
- 地点を先に訊くツールの行は 5 → 6（`sim.skyTonight`）。`sim.skyTonight` / `sim.satellitePasses` / `sim.spaceWeather` は what-if のモデルではない
  理由を `tests/atlas-reasoning-checks.test.mjs` の台帳に書いた。
- spec の 375px の context は session seed を使う。遅延モジュールの一覧（`tests/r209.spec.js` MEMBER）に `skyAlmanac`。
- CodeQL：テストの URL 判定を部分文字列からホスト名の一致に。
- npm audit（picomatch → vite）は main でも赤で、この PR とは別件。

## 7. 起動費用の天井を上げた（判断）

`node scripts/perf-budget.mjs --update`（超えた行だけを上げる・main と合わせた木で測った。#1192 で main の天井が下がった後に測り直した最終値）。
eager raw 4,665.3 → 4,705.5 kB、gzip 1,528.7 → 1,542.7 kB、brotli 1,162.6 → 1,176.1 kB。requests と modules は main 側で既に 10 本になっていて超えていない。
- **バイトの増分の主因は `js/widget-defs-space.js`（main の中で 36.2 kB）**。ウィジェットの定義は盤が起動時に一覧を作るので起動時に読む
  （`js/widget-defs-markets.js` と同じ扱い）。残りは能力表の 3 行・レイヤー一覧の 3 行・出典表・ツール欄の 1 行など、入口そのもの。
- **requests +1 は `geo-engine-*.js`（70 kB、`js/geo-engine.js`・camera-math・geo-command-log・click-ownership）が main から別ファイルに
  分かれたもの**で、バイトは増えていない（main が同じだけ縮んだ）。パネルが日食レイヤーのパッケージを静的に読むのをやめても（いまは押したときに
  `import()`）分かれたままで、この回では束ね器がそう分けた理由を特定できなかった。⚠ 次に起動費用を触る人へ: 2026-11-17 の main（#1167）の
  build では main に含まれていた。宇宙の 3 つの遅延チャンク（space・sky-almanac・layer-pkg-eclipse）が `space-events` を共有チャンクにした
  ことが最も疑わしい。
- atlas-console（+6.8 kB）は新しい 3 能力のカタログの文、atlas-cap-runs（+14 kB）はその実行部。pandemic-atlas（+2.1 kB）はこの PR が触っていない
  チャンクで、geo-engine の分離と同じ束ね方の変化で共有部品の置き場所が動いたものと見ている（未確認）。
- async の増加は新しい遅延チャンク（sky-almanac 41 kB・space-events 13.7 kB・3 つのレイヤー・パッケージ）と、能力の実行部・衛星の通過予報・
  プライバシーポリシーの追記。

## 8. テストの総時間——別の spec を足さず、既存の宇宙の spec に相乗りして固定待ちで返す（利用者の判断）

main の時点でスイートの総時間は天井 5,250 s にちょうど達していて（余白 0、`TOTAL_BUDGET_S` は下げる方向にしか動かせないと 3 つの検査が固定）、
今回の spec（実測 24 s、1 起動に畳んで 16 s）を足すと超えた。利用者の判断（2026-11-18）は「他の固定待ちで返す」。
- 今夜の空・日食の帯・375px の確認は `tests/space-expansion.spec.js` をやめ、**`tests/r197.spec.js` の共有ページに 2 件として足した**（起動 1 回ぶんが要らない）。
- **返したもの**: r197 ③ の固定 1.2 s を「オーバーレイに地名が描かれるまで」の条件待ちに。r203（core）の 3 か所（起動後 2.5 s・傾けた後 4 s・
  宇宙の手前 2.5 s）を「MapLibre の `idle`、ただし元の秒数を上限」に——遅くなることはなく、落ち着いた時点で先へ進む。
- ⚠ このマシンは他セッションの負荷で同じ spec が 6〜20 s と揺れ、r203 は GPU の無いこの環境では main 版でも落ちるので、**台帳の数は CI のランナーで
  測った値で合わせる**（`tests/durations.json` の値は CI の計測と同じ尺度）。

- **起動費用の天井を上げた理由**（main 追従時に測り直し）: 宇宙機能（今夜の空・日食の帯・打ち上げ・火球・宇宙天気・小惑星接近・衛星の通過予報）の能力 3 件と実装が `atlas-cap-runs` と `atlas-console` に入り、非同期分が 4637.7 → 4684.1 kB（gzip）、eager は gzip 1536.5 → 1549.5 kB に増えた。利用者に届く能力の増分で、削れる重複は見つからなかった。数は `perf-budget.mjs --update` が main 合流後のビルドから書いたもの。

- **天井をもう一度上げた理由**（#1193 までの main を取り込んだあとの測り直し）: eager.raw 4689.9 → 4727.0 kB・eager.modules 909 → 910・async.raw 13877.6 → 13987.3 kB・dist.assets 21139.0 → 21290.1 kB。増えたのは宇宙機能（能力 3 件と今夜の空・日食の帯・衛星の通過予報）の実装で、main 側の増分はそれぞれの PR が自分の天井で持っている。数は main と同じ状態のビルドから `perf-budget.mjs --update` が書いた。
