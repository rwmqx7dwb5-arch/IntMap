---
name: intmap-i18n
description: IntMap の 9 言語 (de/en/es/fr/jp/ko/ru/zh/zh-hans) 翻訳掃引。利用者に見える文字列を追加・変更したあとの全言語反映、npm run check:i18n の穴埋め、翻訳漏れの調査に使う。表も面も多く出力が長いので必ずこれに渡す。
claude:
  tools: Read, Edit, Write, Grep, Glob, Bash
  model: sonnet
codex:
  sandbox_mode: workspace-write
---

# IntMap · 9 言語の掃引 (i18n)

## 対象

**de / en / es / fr / jp / ko / ru / zh / zh-hans** ——利用者に表示されるものは全部。
UI・文言・応答・凡例・ツールチップ・`<title>`・`<meta>`・エラー文・読み物ページ。

⚠ **これは実装のコードそのもの**（正本 `js/locales/_langs.js` の `IntMapLangCodes`）。
**日本語は `jp`、繁体字は `zh`**。別名（`js/lang-registry.js` が受理する綴り）を訳のキーに使うと、どの計器も
落ちないままその訳は誰にも届かない。**訳を書く側では常にこの 9 綴りを使う。**

## 唯一のゲート

```bash
npm run check:i18n
node scripts/i18n-audit.mjs --gate --todo <code>
```

`--todo` は、その言語の穴を埋めるための**コマンドそのもの**を印字する。

**計器を足さない。** 「翻訳済み」の定義が複数あったことが漏れの原因で、1 本にまとめてある。穴は**表を埋める**。

## 繰り返し踏んでいる罠——毎回この一覧を当てる

1. **英語の原文を鍵にすると衝突する**（災害名 Hail と都市 Hail (حائل)）。意味の異なるものには自分の鍵を持たせる。
2. **動的に組み立てた鍵は永久に一致しない。** 文字列連結で鍵を作らない。
3. **CJK を 1 つの表に束ねない**（日本語「北東」と簡体「东北」は別物）。
4. **翻訳をデータとして焼き込まない。** 鍵を持たせて描画時に解決する（でないと言語切替についてこない）。
5. **`js/locales/ui.zh-hans.js` は生成物。** 繁体の **`js/locales/ui.zh.js`** を編集して
   `node scripts/zh-hans.mjs` を走らせる。手で簡体を編集しない。
   UI の表は `ui.zh.js`（繁体）と `ui.zh-hans.js`（生成物）で、`-hant` が付くのは読み物ページの別の面
   `pages.zh-hant.js` だけ。変換元と変換先の正本は `scripts/zh-hans.mjs` の一覧。
6. **面は 1 つではない。** keyed の表・インラインの `L()` の表・位置引数・読み物ページ・
   `data-i18n` 属性・配列で持った翻訳・三項で書いた分岐。`--todo` が示す面を全部見る。
7. **モデル名・出典名・機関名は翻訳しない。**

## 返し方

```
追加/変更した鍵: N件 × 9言語 = M件
触ったファイル: js/locales/ui.<code>.js ...
check:i18n: <緑 / 残 N件（内訳）>
判断が要った箇所: <英語と同じにした語・訳し分けた語とその理由>
```

**「英語と同じ」を被覆として数えない。** 同じでよい語（固有名詞など）だけを **1 件ずつ理由つきで**そう扱う。
