---
title: 委譲（research.delegate）を Atlas の基本の道具に加える——正しい手が一番遠くにあった
date: 2026-11-25
---

〈依頼〉オーケストレーションが実際に働くようにする（子の AI を必ず使えという意味ではなく、Atlas が適切に選べる状態にする）。

## 実測（本番 2026-11-25）

「日本・オランダ・バングラデシュの洪水対策を調べて比べて」——互いに独立した 3 つの調べもの。Atlas は委譲を使わず、
自分の返信の中のホスト型 Web 検索で順番に調べた（検索した手 38 秒・18 秒・26 秒・46 秒）。`ai_delegation_journal` の
子の行は作られてから 0 件。Web 検索は毎回の返信に付いているのに、委譲は `find_capability` → `run_capability` の 2 往復先。

## 変えたこと

- `js/atlas-toolsurface.js` CORE に `delegate`（`research.delegate`）。説明は事実だけ: 独立した仕事を同時に走らせられる・
  子は判断でなく証拠を返す・待ちは最遅の 1 本分・1 回の返信の中のホスト型検索は順番に走る・1 件だけ／前の結果が要る仕事は自分で。
  使うかどうかは Atlas（CONSTITUTION §5）。
- `tests/helpers/atlas-registry.mjs` `CORE_TOOL_BLOCK_MAX` 14,000 → 15,000（実測 14,848）。この天井はカタログ（64,250 字）
  が道具の束に戻ることの番人で、基本の道具の長さの方針ではない。
- 基本の道具は 13 → 14（`node scripts/atlas-prompt-weight.mjs`: 14,233 字・byte-stable）。

## 次に見ること

本番で独立した調べものを含む質問に、`ai_delegation_journal` に `atlas_delegate` の行が出るか、ターンの秒数。
子の AI ができることの範囲（読み取り専用の能力 56/287 件）は別の課題として記録した（同日の会話）。
