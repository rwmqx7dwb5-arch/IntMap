---
title: 層の大きさは書かず導出する——spec を足す PR が全員で同じ 5 行を書き換え、1 本マージされるたびに残りが衝突していた
date: 2026-11-24
---

〈依頼〉open の PR が 30 本以上溜まった原因の切り分け。conflict の PR を 1 本ずつ解消していく途中で、PR が共通して書き換える行がもう 1 組見つかった。

〈実測〉deep tier の spec 数(173 など)は docs/FILES.md・docs/TESTING.md(3 か所)・package.json・scripts/worktree.mjs に手で書かれ、`deep-tier-size`(scripts/doc-facts.mjs)が実体との一致を見ていた。spec を 1 本足す PR は全部この数を +1 する。
- 1 本が main に入ると、残りの open PR は同じ行で衝突する。
- さらに悪いことに、2 本が同じ +1 を書いて続けて入ると、文字列の衝突は起きず(両方が 173 → 174)、実際は 175 のまま main に数が 1 つ足りない。main の CI が赤くなるまで誰も気づかない。
- 実際に PR #1307 の取り込みで 6 か所の数が食い違い、書き換えて通した。

〈直し方〉守られていたのは「数が一致していること」で、数そのものは誰にとっても要らない(要るのは読むときの 1 回)。
- `node scripts/tiers.mjs --sizes` を足した(scripts/tiers.mjs の `tierSizes()`)。ディレクトリと tests/durations.json から導出するので古くならない。フラグ無しの import は何も出さない。
- 5 か所の文書から数を消し、このコマンドを指すようにした(docs/TESTING.md の「whole suite 178 measured spec files / 87.9 min」は件数を外して分数だけ残した)。
- `deep-tier-size` の向きを反転した。以前: 書かれた数が実体と一致するか。以後: 層の大きさを書いたら落ちる(英語・日本語・「against core's N」の 3 形)と、package.json・docs/TESTING.md・scripts/worktree.mjs がコマンドを指しているか。

〈消したもの/引き継いだもの〉消したのは、5 か所の手書きの数と「一致を比べる」検査。引き継いだのは、読者がその数を知る手段(コマンド)と、数が再び書かれることを止める検査(反転した規則と tests/derive-tier-sizes-checks.test.mjs)。能力は減っていない。変異で確かめた: worktree.mjs に「174 spec files」を書き戻すと落ち、ポインタを外しても落ちる。

〈未了〉同じ形(PR のたびに全員が書き換える手書きの数)は他にもある: 能力の数(atlas-capabilities)・Edge Function の数・文書の数など。`npm run check:docs` の `edge-count` などが同じ「一致を比べる」作りで、今回は deep-tier だけを直した。次に衝突が出たものから同じ方法(導出して書かない)で直す。
