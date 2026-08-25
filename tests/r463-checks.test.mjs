// R463 — Atlas reply rendering: a sentence never ends inside a URL, a markdown link or a number.
//
// The report: an answer about Liptovská Mara rendered "地図中心付近の49." and "10°N・19.54°E" on two
// paragraphs, and its source link came out as a dead anchor reading "https://liptovska-mara.".
// Root cause: js/atlas-reply.js has TWO sentence tokenizers — _atlStanza's SENT (reflow) and
// _dedupText's dedupLine (#R137 repeat-stripping) — and both treated every '.' as a possible
// sentence end, so a dotted host and a decimal were read as several sentences.
//
//   ① the reported paragraph: decimals intact, ONE anchor carrying the WHOLE url
//   ② the dedup side: the same url twice must not become a second, wrong, live destination
//   ③ the reflow itself is unchanged — atom-free prose still gets its ~2-sentence stanzas
//   ④ nothing leaks: no placeholder in the html, and mdMini's own code/math tokens still round-trip
//   ⑤ both tokenizers read the HELD string (a future edit back to the raw one fails here)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'js/atlas-reply.js'), 'utf8');

/* The real module, executed — not grepped. js/atlas-reply.js is a pure text-in/html-out factory, so
   it runs under node with a minimal window and no document (its one document-level wiring block is
   already guarded and simply falls into its catch). #R447: a check that only reads the source is
   satisfied by its own comment. */
globalThis.window = globalThis;
globalThis.document = undefined;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const { makeAtlasReply } = await import(pathToFileURL(join(ROOT, 'js/atlas-reply.js')).href);
const R = makeAtlasReply({}, {
  L: (en) => en, esc, fitTo: (x) => x, fmtVal: (x) => x, highlight: (x) => x, note: () => {}, warn: () => {},
});
const anchors = (html) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: m[2] }));

const URL_FULL = 'https://liptovska-mara.slovakian-mountains.eu/?utm_source=openai';
/* the reported answer: one paragraph over the 230-char reflow gate, carrying three decimals and a link */
const REPORTED =
  'リプトフスカー・マラ（Liptovská Mara）はスロバキア北部の人造湖で、リプトフ盆地のヴァーフ川をせき止めて1975年に完成しました。'
  + '湛水面積はおよそ21.6平方キロメートル、最大水深は43メートルほどで、地図中心付近の49.10°N・19.54°Eに広がっています。'
  + '発電と洪水調節のほか、夏季にはヨットやウィンドサーフィンの拠点としても知られています。'
  + '詳しい観光情報は [liptovska-mara.slovakian-mountains.eu](' + URL_FULL + ') を参照してください。';

test('R463 ①: the reported paragraph keeps its decimals and its link', () => {
  const st = R._atlStanza(REPORTED);
  assert.ok(st.includes('\n\n'), 'the reflow still runs on this paragraph (otherwise ① proves nothing)');
  for (const n of ['21.6平方キロメートル', '49.10°N', '19.54°E']) {
    assert.ok(st.includes(n), 'decimal survives the sentence split: ' + n);
  }
  assert.ok(st.includes('[liptovska-mara.slovakian-mountains.eu](' + URL_FULL + ')'), 'the markdown link survives whole');

  const a = anchors(R.mdMini(REPORTED));
  assert.equal(a.length, 1, 'exactly one anchor');
  assert.equal(a[0].href, URL_FULL, 'the anchor carries the WHOLE url (was "https://liptovska-mara.")');
  assert.equal(a[0].text, 'liptovska-mara.slovakian-mountains.eu', 'the label is the label, not a url fragment');
  assert.ok(!/href="https:\/\/liptovska-mara\.[" ]/.test(R.mdMini(REPORTED)), 'the truncated host is gone');
});

test('R463 ②: a url repeated in one reply does not become a second, wrong destination', () => {
  /* dedupLine rejoins its tokens with '' so nothing shifts — it DELETES a repeated token instead.
     "slovakian-mountains." and "eu/tourism/index." were both seen in the first url, so the second
     url lost its middle and rendered as href="https://liptovska-mara.html": live, ordinary-looking
     and pointing somewhere else entirely. That is worse than a visibly broken link. */
  const u = 'https://liptovska-mara.slovakian-mountains.eu/tourism/index.html';
  const a = anchors(R.mdMini('公式サイトは ' + u + ' です。\n\n営業時間などの最新情報も ' + u + ' で確認できます。'));
  assert.equal(a.length, 2, 'both urls are still linked');
  for (const x of a) assert.equal(x.href, u, 'every anchor points at the real url');
});

test('R463 ③: the reflow, the dedup and the typography are otherwise untouched', () => {
  /* Guard against "fixed" meaning "disabled". Prose with no url and no number must reflow exactly as
     #R154 specified: a >230-char run-on becomes ~2-sentence stanzas separated by a blank line. */
  const p = '湖の面積は広く、周囲には集落が点在しています。ダムは発電と洪水調節の二つの目的を担っています。'
          + '夏には観光客が訪れます。冬の水位は下げられます。';
  const st = R._atlStanza(p + p);
  assert.ok(st.split('\n\n').length >= 3, 'a long atom-free run-on is still cut into stanzas');
  assert.equal(R._atlStanza('短い答えです。'), '短い答えです。', 'a one-line answer is still returned verbatim');
  assert.equal(R._atlStanza('## 見出し\n\n本文。' + p + p), '## 見出し\n\n本文。' + p + p, 'a model-authored ## reply is still untouched');
  const dup = '同じ文がここに書かれています。同じ文がここに書かれています。別の話がここから始まります。';
  assert.ok(!R.mdMini(dup).includes('同じ文がここに書かれています。同じ文がここに書かれています。'),
    '#R137 duplicate-sentence stripping still works');
});

test('R463 ④: no placeholder reaches the html, and mdMini keeps its own tokens', () => {
  /* the e-mail address and the scheme-less host sit inside a paragraph that IS over the reflow gate,
     so this asserts they survive a split rather than that no split happened. */
  const long = 'ダム湖の管理事務所は通年で開いており、見学の申し込みや水位の問い合わせを受け付けています。'
    + '連絡先は info@liptovska-mara.eu、案内図は www.example.org/a.b にあります。'
    + '週末は混み合うため、午前中の早い時間に訪れるのが確実です。冬季は路面が凍結することがあります。'
    + '公共交通で向かう場合はリプトフスキー・ミクラーシュ駅からバスに乗り換えます。';
  const html = R.mdMini(REPORTED + '\n\n' + long + '\n\n計算は `1.5 * 2` で、$x=1.25$ です。');
  assert.ok(!/[\uE000-\uE011]/.test(html), 'no private-use placeholder survives into the rendered html');
  assert.ok(html.includes('1.5 * 2'), 'inline code still renders its content');
  assert.ok(html.includes('info@liptovska-mara.eu'), 'an e-mail address is not cut at its dots');
  assert.ok(html.includes('www.example.org/a.b'), 'a scheme-less www host is not cut at its dots');
});

test('R463 ⑤: BOTH tokenizers read the held string', () => {
  assert.match(SRC, /const _ATL_ATOM=/, 'the atom pattern exists');
  assert.match(SRC, /function _atlHold\(s\)\{/, 'the hold helper exists');
  assert.match(SRC, /function _atlFree\(s,A\)\{/, 'the restore helper exists');
  assert.match(SRC, /const dedupLine=\(line\)=>\{ const H=_atlHold\(line\);/, '_dedupText holds before tokenizing');
  assert.match(SRC, /const toks=H\.t\.match\(/, '_dedupText tokenizes the HELD string');
  assert.match(SRC, /const H=_atlHold\(p\);/, '_atlStanza holds before splitting');
  assert.match(SRC, /const sents=\(H\.t\.match\(SENT\)\|\|\[H\.t\]\)\.map\(x=>_atlFree\(x,H\.A\)\);/, '_atlStanza splits the HELD string');
  assert.ok(!/const toks=line\.match\(/.test(SRC), 'the raw-line tokenizer is gone');
  assert.ok(!/const sents=p\.match\(SENT\)/.test(SRC), 'the raw-paragraph splitter is gone');
  assert.match(SRC, /if\(\(p\.length\+pc\)>230\)\{ const H=_atlHold\(p\);/, 'the 230 gate still measures the REAL paragraph, not the held one');
});
test('R463 ⑥: a bare host or filename is held too — that is what the app actually cites', () => {
  /* js/atlas-answer-render.js runs stripModelUrls() over a structured answer and hands mdMini the bare
     host, so "reuters.com" is the commonest citation shape in the product — and it was rendering as
     "reuters." / "com" on two paragraphs long after a scheme-ful url would have been safe. */
  const p = 'この件は複数の媒体が報じています。一次情報の要約は reuters.com に、続報の詳細は apnews.com にまとまっています。'
    + '現地当局の発表は同日中に更新される見込みで、被害の規模はまだ確定していません。避難所の開設状況も随時変わります。'
    + '公式の資料は pdf ファイルとして index.html から辿れます。';
  const st = R._atlStanza(p);
  assert.ok(st.includes('\n\n'), 'the paragraph is over the gate, so this asserts a survival, not an absence of reflow');
  for (const h of ['reuters.com', 'apnews.com', 'index.html']) assert.ok(st.includes(h), 'bare host survives: ' + h);

  /* the TLD is required to be lowercase so ordinary English prose keeps its sentence boundaries; a long
     English paragraph must still reflow. (An ABBREVIATION — "U.S.", "e.g." — is deliberately not held:
     guessing at those is the design this fix refuses, and they behave exactly as they always have.) */
  const en = 'The reservoir was filled in 1975 and it serves both power generation and flood control. '
    + 'Sailing and windsurfing are popular here in summer. The water level is drawn down in winter. '
    + 'A visitor centre near the dam opens every day except Monday. Buses run from the nearest railway station. ';
  assert.ok(R._atlStanza(en + en).split('\n\n').length >= 3, 'English prose still reflows into stanzas');
});
