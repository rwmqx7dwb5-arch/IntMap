---
title: 地名検索の 1 行は 1 つの記録——「Japan · Tokyo」が日本の中心へ飛んでいた（首都の行が国の点を借りていた）。似ているものは他の入口と同じ尺度で測り、並びは名前・種別・人口、Enter は先頭の候補へ飛ぶ
date: 2026-10-03
newsen: Place search: each result is one place (choosing a capital no longer jumps to the country), and Enter goes to the first result.
newsjp: 地名検索の 1 行が 1 つの場所になりました（首都を選ぶと国の中心へ飛んでいた誤りを修正）。Enter で先頭の候補へ飛びます。
---

〈依頼〉本番（b797887）で観測: 地名検索で「Tokyo」と打つと候補に「Japan · Tokyo」があり、モバイルで 1 行目を 2 回タップして 2 回とも 36.143°N 138.442°E（長野の山中・標高 932 m）に着き、欄は「Japan」になった。候補に Togo・Takeo・Mokpo・Soyo が混ざる。Enter では動かない（5 秒無反応）。根本原因で直す（「Tokyo」の特例は足さない）。

## 0. 再現した（前・起点 b797887、3 つのジオコーダは空で答えさせ、端末にある候補だけを見る）

`tests/search-identity.spec.js`:

| 場面 | 前 |
|---|---|
| デスクトップ 1280×800、「Tokyo」→ 検索 → 全行を順に押す | カード「Tokyo」「Japan · Tokyo」。2 行目は **36.143, 138.442** に着き、欄は「Japan」 |
| 375×812 タッチ、打鍵の候補 | 「Tokyo」「Japan · Tokyo」「**Togo**」 |
| 「Tokyo」+ Enter | 6 秒待っても地図は動かない（カードが出るだけ） |

## 1. 原因

**① 札と点が別の記録だった。** `js/search-geocode.js` の `localFuzzyPlaces` は国の表（`countryStats`）の首都名に一致すると、ラベル `s.nameEn+' · '+s.capital` に**国の点 `s.latlng`**（Natural Earth の LABEL_X/Y＝日本なら長野の山中）を付けて行を作っていた。国の表は首都の**名前しか**持たないので、点を借りるしかなかった。欄に書く名前は `label.split(' · ')[0]`＝「Japan」。#R93d は同じ欠陥を Atlas 側から測り（「Riga」→ ラトビアの重心 83 km）、`js/atlas-geo-resolve.js` の `geocode` に「`capital` の行は信じない」という例外を足して**その呼び手だけ**を守っていた——読者に行を見せる検索欄は守られていなかった。

**② 似ているものの尺度が 1 つだけ違った。** 編集距離 2 以内（5 文字の語の半分）を許していたので Togo・Takeo・Mokpo・Soyo が「Tokyo」に入った。他の入口（Atlas の解決器・経路の欄・検索カードの遠隔の行）は `placeRules.agreement`（Dice、`NAME_AGREE_MIN` 0.45）を使う。携帯の候補は点数の床なしで全行を出すので、携帯でだけ見えた。

**③ Enter は検索をやり直すだけだった**（`js/app-body.js` の keydown → `doGeocode()`）。

## 2. 直したもの

- **首都の行＝地名辞書のその都市の記録。** 同じ名前で GeoNames の iso2 が国の alpha-2 と一致するもの（人口が最大のもの）。国を持たない手書きの行は国の範囲（`bboxAll`）の中に立つもの。索引に無い小さい首都は世界の一覧を 1 回だけ線形に引く（国×名前でメモ）。索引に同じ記録の行があれば 1 行に畳み、種別を `capital` にする。記録が無ければ首都の行は**出さない**——国の点に別の名前を付けない。
- `js/gazetteer.js` の `index()` の各項目に**人口と iso2**を持たせた（世界の行は自分の欄から、手書きの行は `cur=1` の GeoNames 記録から）。読み込みには触れていない。
- **似ているもの**は `placeRules.agreement` で測る（借りる・写さない）。`doGeocode` は規則のモジュールを待ってから端末の候補を作る（3 つのジオコーダのために既に取りに行っている）。規則が届く前の同期の呼び手には「似ている」の段が無い。
- ⚠ **最初の実装は Kyoto を出した**（Dice 0.75——bigram の 3 つが共通）。その床は 1 つのジオコーダの数件を判定するためのもので、1.5 万行を数え上げる床ではない。⇒ 名前そのものを含む行が端末に 1 つも無いときだけ「似ている」を探す（「osakaa」→ Osaka、「Tokio」→ Tokyo は残る）。名前が問い合わせの中にある向き（「osakaa」⊃ Osaka）は規則が 1 を返すので、問い合わせのうち名前が覆う割合で並べる。
- **並び**: ① 名前の一致（全体 3 ＞ 前方 2 ＞ 含む 1 ＞ 似ている 0〜1）② 種別の大きさ（`js/place-framing.js` の `zoomTable()`）③ 人口。カードの行は提供者を問わずこの順に差し込む（既に出ている行どうしの順は変えない）。`score` の数（≥88 完全・≥72 強い）は呼び手が読むので同じ段のまま。
- **Enter** は `doGeocode({go:true})`: 名前全体が一致する行が端末にあればネットワークを待たずに先頭へ、無ければ 3 つのジオコーダを待って（上限 5 秒）先頭へ——行の click そのもの（同じ選択・同じ飛行・同じカード）。候補が無ければ何も動かない。IME の変換確定（`isComposing`／keyCode 229）は除く。
- Atlas の確定の入口から #R93d の例外を外した——前提（首都の行は国の点）がもう無いので、完全一致の首都は他の完全一致の都市と同じく採る。検索欄と同じ答え（`tests/search-identity-checks.test.mjs` ④）。

## 3. 後（同じ spec）

全件緑（デスクトップ 1 件・携帯 1 件、計 63 s）: デスクトップのカードは「Tokyo」（首都・人口 973 万）と Nishi-Tokyo-shi だけ、どの行も札の場所へ着く。携帯の 1 行目は 2 回とも Tokyo（35.69, 139.69 から 30 km 以内）。Enter はデスクトップ・携帯とも Tokyo へ。IME の Enter では動かない。

照合の時間（node、同じ索引・同じ問い合わせ、前→後）: Paris 89→25 ms、Riga 87→28 ms、Tokyo（2 回目）84→33 ms、Tokio（似ている）179→178 ms。初回は畳み込みのメモが空なので前と同程度。

## 4. 残したもの

- 遠隔の行（Nominatim・Photon）は人口を出さないので、同じ名前と種別の中では到着順。種別が先なので「New York」は州が市より上に来うる（Nominatim の `importance` は単位が違うので人口と並べていない）。
- 首都の名前は国の表の英語名だけで照合する（「東京」は手書きの行の語に Tokyo があるので首都と分かる）。
- `check:i18n` の対象になる新しい文字列は無い。
- ⚠ 新しい spec（63 s）で全体の時間が天井 87.5 min を 1.1 min 超える（`check:testbudget` 赤）。天井は上げず、他から時間を取る判断が要る。

## 統合時: 大域を通る新しい読み（check:surface）

首都の行を地名辞書の都市の記録で引くため、`window.IntMapGazetteer`（3 か所）を読む。名前の一致度と種別の大きさは、検索欄と Atlas が同じ答えを返すように既存の判定を借りる。そのため `window.IntMapPlaceRules`（2 か所）と `window.IntMapPlaceFraming`（2 か所）も読む。3 つとも持ち主（js/gazetteer.js は classic script、ほかの 2 つは app-body が作る実体）が export していないので、import にはできない（`module-graph.mjs --plan` で確認）。そこで `node scripts/global-surface.mjs --update` で受け入れた。

## 統合時の性能予算

超えた行だけ `--update`（main から引き継いだ eager.gzip を含む）:
- eager.raw: 4628.5 kB → 4651.8 kB
- eager.gzip: 1523.9 kB → 1533.0 kB
