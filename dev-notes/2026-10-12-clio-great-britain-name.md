---
title: 1942 年のクウェートに「Kingdom of Great Britain」（1707〜1800 年の国名）が立っていた——名前を 1800 年までに限り、名前を外した行も海岸を保つ
date: 2026-10-12
---

〈きっかけ〉`dev-notes/2026-10-11-ww2-tour.md` §5。第二次世界大戦の見本（1942-11-01）の写真で、ペルシア湾岸に «Kingdom of Great Britain»。

## 0. 何が描かれていたか（地図を評価して）

1942-11-01、東経 46.7〜48.4°・北緯 28.8〜30.1°（クウェート、14,043 km²）に Cliopatria の行 «Kingdom of Great Britain»（`of`: British Empire）。
CShapes はクウェートを 1961 年まで持たないので、合成がこの行で埋める。グレートブリテン王国は 1707-05-01〜1801-01-01
（Wikidata Q161885、後継 Q174193 連合王国）。Cliopatria は英国領の断片にこの名前を 20 世紀まで付けていて、出荷されている
47 行はすべて 1800-12-31 以降——全部が年代違いだった（他の審査記録〔フェロー諸島〕も「1941〜44 年にこの名前は誤り」と指摘済み）。

## 1. 直し方

`scripts/histclio/review.json` の `rows` に「Kingdom of Great Britain は 1800 年で終わる」（合同法 1800、Q161885）。
既存の仕組みどおり、1801 年以降の行は名前を出さずに輪郭と英帝国の一員であることを保ち、札が「Cliopatria はこう名づけるが、
史実ではこの名前は 1800 年に終わる」と述べる。

⚠ **名前を外すと海岸の断片まで消えた**: 束を作り直すと、海岸の補い（`data/hist-coast-snap.js`）から 37 片が消えた
（1886〜1961 年のクウェートほか）。`scripts/histclio/coast-snap.mjs` の `loadRows` が「名前の無い行」（白地の形）を海岸合わせの
対象から外していて、審査で名前を外した行も同じ扱いだった。名前を外した行は白地ではない——記録の政体で、輪郭も札も残る。
⇒ その身元は外した名前（`wn`）とした（`snapName` も同じ）。結果: 元の断片は 1 つも失わず（照合: 失われた 0 片）、
これまで名前を外していた行（イタリア王国・呉朝・ガーリチ・ヴォルィーニ占領など）の海岸に 218 片が加わった（11,256 → 11,474 行）。

## 2. 作り直した派生データ（すべて --check 緑）

`data/hist-clio.js`（47 行の名前が外れ、並びが変わって 97 行が動く。行数 12,886 は同じ）・`hist-eras-rest.js`（基礎の sha）・
`hist-coast-snap.js`・`border-coast.js`（環 136,414 → 136,461、文書 3 本の数も実体に）・`hist-courses.js`・`polity-arcs.json`
（«Kingdom of Great Britain» の年表だけが変わる）・`hist-fidelity.json` / `hist-coverage-holes.json` / `hist-claims.json`。
`on-this-day.json` は変わらない。

## 3. 確かめた

新規 `tests/clio-great-britain-name-checks.test.mjs`: ① 地図を評価し、1942 年のクウェートのラベルがその名前でなく、外した行が
描かれ英帝国の一員である ② 1800 年より後にその名前の行が無く、審査の行が理由を述べる ③ 名前を外した行の海岸の断片が 1942 年に
在る（直す前は 0）。関連 node 検査 167 件、check:histclio・histfidelity・bordercoast・histnames・static・docs。

## 4. 原本の写しで見つけたこと（直していない）

原本（OneDrive）の `data/hist-borders.js` は 9 月 14 日の写しのまま末尾の改行が CRLF で、Git は同じ内容と見なすが、バイトを読む
`build-hist-courses.mjs --check` は「別の束から作られた」と判定する。CI と作業場では起きない（原本の写しだけの状態）。
