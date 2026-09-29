/* ============================================================================
 *  The data-sources page and the source registry
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs, tests/r254-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: sources.html のマークアップはテキストが成果物（描画と build のコピー一覧は評価している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 14. the sources page is the registry, not a copy of it ────────────────────────────────────── */
test('R212 ⑭: sources.html renders js/reference-data.js and ships with the build', async () => {
  const html = read('sources.html');
  assert.match(html, /<script src="\.\/js\/reference-data\.js"><\/script>/);
  /* ⚠ (#R218) the renderer moved out of the page into js/sources-list.js — the page is a shell now.
     The invariant is unchanged and is the whole point of this test: ONE list, read, never copied. */
  /* (consolidation) EVALUATED: the page's own scripts (the encoder, the registry, the renderer) run
     in a stub document in the order sources.html loads them, and what is asked is what the renderer
     PRINTS — every registry entry, and an entry added to the registry after load, which a page
     carrying its own copy of the list could not print */
  const els = {};
  const document = { getElementById: (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', placeholder: '', addEventListener() {} }) };
  const ctx = { console, document };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/safe-html.js', 'js/reference-data.js', 'js/sources-list.js']) vm.runInContext(read(f), ctx, { filename: f });
  ctx.IntMapPageI18N = { pick: () => '', normalise: (c) => c };
  const reg = ctx.IntMapRefData.dataSources;
  assert.ok(reg.length > 50, 'the registry evaluates to its list of sources');
  reg.push({ n: 'Consolidation Sentinel Source', u: 'https://example.org/sentinel' });
  ctx.IntMapSourcesList.render('en');
  const shown = els['src-list'].innerHTML;
  const missing = [...reg].filter((s) => !shown.includes(ctx.IntMapSafe.html(s.n))).map((s) => s.n);
  assert.deepEqual(missing, [], 'the page prints every entry of js/reference-data.js — ONE list, read, never copied');
  /* (consolidation) EVALUATED: the build's copy list is the exported array vite.config.js builds from */
  const { STATIC_ASSETS } = await import('../vite.config.js');
  assert.ok(STATIC_ASSETS.includes('sources.html'));
  assert.ok(STATIC_ASSETS.includes('js/reference-data.js'), 'the registry is copied so the page can read it in production');
  assert.ok(STATIC_ASSETS.includes('js/sources-list.js'), '…and so is the renderer it moved into');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 2 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（読者向けの文言は js/locales/pages.*.js の文そのもの） */
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

test('R215 ①d: Settings offers the data-sources PAGE and does not offer a second, lesser copy', () => {
  const html = read('index.html');
  assert.match(html, /id="link-sources"[^>]*href="\.\/sources\.html"/, 'the entry is the page');
  assert.equal(/id="btn-data-sources"/.test(html), false, '「アプリ内で簡易一覧を見る←ふざけんじゃねえよ」');
});

/* ═══ ⑦ THE DATA-SOURCES PAGE IS FOR A READER ════════════════════════════════════════════════
   「いや私向けに作ってんじゃねーよ。サイトに開発者向けのページおくわけないやろがくそ。作り直せ。」 */
test('R215 ⑦: sources.html explains the data, not the build', () => {
  /* ⚠ (#R218) sources.html is a shell and its words are in js/locales/pages.<lang>.js. The subject of
     this test is the WORDS, so it reads them where they are — and it now reads all five languages,
     which is strictly more than it checked before. The section ids are language-independent by
     construction (js/page-i18n.js renders `id` from the document), so they are checked once. */
  const langs = ['en', 'ja', 'de', 'ru', 'es'];
  for (const l of langs) {
    /* ⚠ block comments stripped first: a locale file has a MAINTAINER's header that names the file
       the registry lives in, and a maintainer's note is not something a reader is shown. The subject
       here is the reader-facing strings (#R216's own convention for "this must not appear"). */
    const body = codeOnly(read(`js/locales/pages.${l}.js`));
    assert.equal(/reference-data\.js/.test(body), false, `no source filename is shown to a reader (${l})`);
    assert.equal(/登録簿/.test(body), false, `no internal vocabulary for the list (${l})`);
    assert.equal(/二重に持たない|single source of truth/.test(body), false, `no maintenance argument (${l})`);
    assert.match(body, /science\.html/, `and still points at the method page (${l})`);
  }
  /* and it still answers the questions a reader actually has */
  const en = read('js/locales/pages.en.js');
  for (const id of ['what', 'live', 'privacy', 'licence', 'limits', 'list']) {
    assert.match(en, new RegExp(`id: '${id}'`), `the page keeps its «${id}» section`);
  }
});
}

/* ══════════ from tests/r216-checks.test.mjs — 1 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（読者向けの文言そのもの） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑭ the sources page is written for readers ──────────────────────────────────────── */
test('#R216 ⑭ sources.html has no essayistic register left in it', () => {
  /* ⚠ (#R218) THE PROSE MOVED, THE QUESTION DID NOT. sources.html is a shell now and the Japanese
     text lives in js/locales/pages.ja.js — one file per language, so that adding a sixth costs one
     file instead of a pass over two HTML documents. Reading the locale keeps this check alive; it is
     the same sentences, and they still have to not be there (and the two good ones still have to be). */
  const s = read('js/locales/pages.ja.js');
  const bad = [
    'その「誰か」の一覧です',            /* an aphorism, not a sentence a reader needs */
    '色は国境で止まりますが、現実はそこで止まりません',
    '古いものを新しいふりをして見せることはしません',
    'ここは注意',
    'いつの数字なのか',
    '作った人たちと利用条件',
  ];
  for (const b of bad) assert.equal(s.includes(b), false, 'sources.html still says: ' + b);
  /* …and it still says the things a reader needs */
  assert.match(s, /このページでは、その提供元を一覧にしています/);
  assert.match(s, /緊急時には、必ず公的機関の発表に従ってください/);
});
}

/* ══════════ from tests/r254-checks.test.mjs — 1 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（登録簿に載っている URL そのもの） */
/* (#R254) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

/* ── ⑪ THE SOURCES PAGE ──────────────────────────────────────────────────────────────────────── */
test('#R254 ⑪ the new data sources are declared', () => {
  const rd = read('js/reference-data.js');
  ['telecom%3Ddata_center', 'aws.amazon.com/about-aws/global-infrastructure', 'datacenters.microsoft.com',
    'cloud.google.com/about/locations', 'datacenters.atmeta.com', 'top500.org'].forEach(u => {
      assert.ok(rd.includes(u), `the Sources page does not declare ${u}`);
    });
});
}
