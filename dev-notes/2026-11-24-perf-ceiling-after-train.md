---
title: main の check:perf が赤で本番公開が止まっていた——天井 2 行を測った値まで上げた
date: 2026-11-24
newsen: Fixed a build-size budget that was blocking a release; no visible change.
newsjp: ビルドサイズの上限が本番公開を止めていたので直しました。見た目の変化はありません。
---

〈状況〉#1380 の merge 後、main の CI は Gates 2/3 の `check:perf` で 2 回続けて落ちた（run 45215395491・45233751989）。本番公開は緑の run が行うので、本番（最終更新 2026-11-22）が止まったままだった。
超過は `async.gzip` 4942.8 > 4918.1 kB と、`gis-core` 701.2 > 697.3 kB（#1380 の CI では通っていた——同じ時間帯に入った PR の合算で超えた）。

## 内訳（測った値）
- `async.gzip` +24.7 kB: 主因は新しい async チャンク `atlas-file-make`（file.create の書き手。生 58.7 kB。能力が呼ばれたときだけ読まれ、起動経路には載らない）。main の CI は新しいチャンクの天井を「merge のあと記録する」ため、その run には載っていなかった。
- `gis-core` +3.9 kB: 同じ時間帯に merge された GIS 側の変更。
- 起動時に読まれる行（entry・startup）は超えていない。`node scripts/perf-budget.mjs --update` が上げたのは超えた 2 行だけ。
- ⚠ この checkout には `data/hist-eras.js` と `data/border-detail/` が無く、build の最後の `intmap-history-pages` は失敗する。JS のチャンクは出力済みで、上の数字はそこから取った。

## 消したもの・引き継いだもの
何も消していない。天井を測定値に合わせただけで、「起動に載らない async の増分は、理由を書いて上げる」という既存の規則（`check:perf`）に従った。
