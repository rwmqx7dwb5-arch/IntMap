/* ============================================================================
 *  #R492 — 返答の中の数・時刻・略語を、読む手を止めずに引けるようにする
 * ----------------------------------------------------------------------------
 *  「120 miles にホバーしたら 193 km、14:30 UTC なら 23:30 JST、EEZ なら排他的経済水域」。
 *  三つとも「返答本文の中の、ある綴りを見つけて、印を付ける」仕事なので、壊れ方も三つとも同じ
 *  かたちをしている——**見つけすぎる**か、**見つけたものを間違って読む**か、**印が消える**か。
 *  この検査はその三つを別々に押さえる。
 *
 *  ⚠ ①〜③ は挙動そのもの（依頼に書かれた三つの例をそのまま）。
 *  ⚠ ④ は「読み違えない」——数の区切り記号はロケールから採り、読めない綴りは注釈しない。
 *     `10.000` は英語で 10、ドイツ語で 10000。どちらも正しいので、表で決めることはできない。
 *  ⚠ ⑤⑥ は「印が消えない」——走査がタグの中と <a>/<code> の中に入らないこと、そして
 *     注釈の一手が **プレースホルダ復元より前**に立っていること。ここは綴りを書き写さず、
 *     js/atlas-reply.js の本文から**順序を読み出して**比べる（#R345 の作法）。
 *  ⚠ ⑦ は意図した「見つけない」——`in` `NM` `M` `g` `t` は単位として引かない。
 *     曖昧な綴りを1つ許すたびに、正しい注釈より多くの誤った注釈が出る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/* the module is browser code that reads the language registry off `window`; in node the registry is
   the five positional arguments themselves, which is exactly what the browser does for en/ja/de/ru/es. */
const LANGS = { en: 0, jp: 1, de: 2, ru: 3, es: 4 };
globalThis.window = globalThis.window || {};
globalThis.window.IntMapLang = {
  t(lang) {
    const a = Array.prototype.slice.call(arguments, 1);
    const i = LANGS[lang];
    return (i != null && a[i]) ? a[i] : a[0];
  },
  locale(code, enTag) {
    return { en: 'en-US', jp: 'ja-JP', de: 'de-DE', ru: 'ru-RU', es: 'es-ES' }[code] || enTag || 'en-US';
  },
};

/* the module publishes two names — the stylesheet and the factory (tests/r175 ③) — so the machinery
   is reached the way js/atlas-reply.js reaches it, through one call. */
const MOD = await import('../js/atlas-annotate.js');
const A = Object.assign({ ATLAS_ANNOTATE_CSS: MOD.ATLAS_ANNOTATE_CSS }, MOD.makeAtlasAnnotate());
const NOW = new Date('2026-08-28T00:00:00Z');
const opt = (o) => A.annotateOptions(Object.assign({ lang: 'en', tz: 'Asia/Tokyo', now: NOW }, o || {}));
const note = (html) => { const m = /data-atl-note="([^"]*)"/.exec(html); return m ? m[1] : null; };
const sub = (html) => { const m = /data-atl-sub="([^"]*)"/.exec(html); return m ? m[1] : null; };

/* ── ① 依頼に書かれた三つの例 ─────────────────────────────────────────────── */
test('R492 ①: the three examples in the request come out as the request states them', () => {
  assert.equal(note(A.annotateAtlasHTML('It is 120 miles away.', opt())), '≈ 193 km');
  assert.equal(note(A.annotateAtlasHTML('Cruising at 10,000 ft.', opt())), '3,048 m');
  assert.equal(note(A.annotateAtlasHTML('It was 68°F.', opt())), '20 °C');
  /* ⚠ the ≈ is not decoration: 10,000 ft IS 3,048 m and 68 °F IS 20 °C, while 120 mi is 193.12 km.
     A note that rounds says so; one that does not, does not. */
  assert.ok(!/≈/.test(note(A.annotateAtlasHTML('Cruising at 10,000 ft.', opt()))));
  assert.ok(!/≈/.test(note(A.annotateAtlasHTML('It was 68°F.', opt()))));
});

test('R492 ①b: the conversions themselves are the SI definitions, not approximations of them', () => {
  assert.equal(A.convertQuantity(1, 'mi').value, 1.609344);
  assert.equal(A.convertQuantity(10000, 'ft').value, 3048);
  assert.equal(A.convertQuantity(68, 'degF').value, 20);
  assert.equal(A.convertQuantity(-40, 'degC').value, -40);
  assert.equal(A.convertQuantity(1, 'nmi').value, 1.852);
  assert.equal(A.convertQuantity(1, 'lb').value, 0.45359237);
  /* every pair that exists in both directions must round-trip */
  for (const [a, b] of [['mi', 'km'], ['km', 'mi'], ['ft', 'm'], ['m', 'ft'], ['degF', 'degC'], ['degC', 'degF'], ['kg', 'lb'], ['lb', 'kg']]) {
    const there = A.convertQuantity(37, a);
    const back = A.convertQuantity(there.value, A.unitIdForToken(there.unit) || b);
    assert.ok(Math.abs(back.value - 37) < 1e-9, a + ' -> ' + b + ' -> ' + a);
  }
});

/* ── ② 時刻 ──────────────────────────────────────────────────────────────── */
test('R492 ②: a UTC clock becomes the reader own zone, and says so only when it differs', () => {
  const r = A.timeNote('14:30 UTC', opt());
  assert.ok(/^23:30 /.test(r.note), 'expected 23:30 in Tokyo, got ' + r.note);
  assert.equal(A.timeNote('14:30 UTC', opt({ tz: 'UTC' })), null, 'no offset = nothing to say');
  /* the ISO form, the bare Z, the "UTC 06:00" order and an explicit offset are all read */
  assert.ok(/^07:05 /.test(A.timeNote('2026-08-28T22:05Z', opt()).note));
  assert.ok(/^07:05 /.test(A.timeNote('22:05Z', opt()).note));
  assert.ok(/^15:00 /.test(A.timeNote('UTC 06:00', opt()).note));
  assert.ok(/^21:30 /.test(A.timeNote('14:30 UTC+2', opt()).note), 'an offset is honoured, not ignored');
  /* the day moved, so the date is carried too */
  assert.ok(sub(A.annotateAtlasHTML('closes 22:05Z tonight', opt())), 'a day-crossing note carries its date');
  assert.equal(sub(A.annotateAtlasHTML('opens 14:30 UTC', opt())), null, 'a same-day note does not');
});

test('R492 ②b: a clock with no zone is left alone — there is nothing to convert it from', () => {
  const h = A.annotateAtlasHTML('The meeting is at 14:30 in Berlin.', opt());
  assert.ok(!/atl-an/.test(h), h);
});

/* ── ③ 略語 ──────────────────────────────────────────────────────────────── */
test('R492 ③: an abbreviation carries its expansion and its meaning, on first use only', () => {
  const h = A.annotateAtlasHTML('The EEZ is wide. The EEZ is not the territorial sea.', opt());
  assert.equal(note(h), 'Exclusive Economic Zone');
  assert.ok(/data-atl-sub="[^"]{20,}"/.test(h), 'the meaning line is there too');
  assert.equal(h.split('atl-an-a').length - 1, 1, 'the second occurrence is not underlined again');
  /* a fresh reply starts a fresh memory */
  assert.equal(A.annotateAtlasHTML('The EEZ again.', opt()).split('atl-an-a').length - 1, 1);
});

test('R492 ③b: the four terms the request named are all in the glossary, with both fields in nine languages', () => {
  const byTerm = new Map(A.ATLAS_GLOSSARY.map((g) => [g.t, g]));
  for (const t of ['EEZ', 'SAM', 'GDP PPP', 'MMI']) assert.ok(byTerm.has(t), t + ' is missing');
  assert.equal(byTerm.size, A.ATLAS_GLOSSARY.length, 'no term is defined twice');
  for (const g of A.ATLAS_GLOSSARY) {
    for (const lang of Object.keys(LANGS)) {
      assert.ok(g.n(lang) && g.n(lang).length > 2, g.t + '.n(' + lang + ')');
      assert.ok(g.d(lang) && g.d(lang).length > 10, g.t + '.d(' + lang + ')');
    }
    /* ja/de/ru/es must actually differ from English — a positional argument left empty falls
       through to English silently, which is the one failure the i18n gate cannot see per-term. */
    for (const lang of ['jp', 'de', 'ru', 'es']) {
      assert.notEqual(g.n(lang), g.n('en'), g.t + '.n is untranslated for ' + lang);
      assert.notEqual(g.d(lang), g.d('en'), g.t + '.d is untranslated for ' + lang);
    }
  }
  /* the two halves are read out of the source so the gate below counts what SHIPS, not what is written here */
  const src = CODE('js/atlas-annotate.js');
  const calls = (src.match(/window\.IntMapLang\.t\(/g) || []).length;
  assert.equal(calls, A.ATLAS_GLOSSARY.length * 2, 'every term has exactly one n() and one d() translation call');
});

/* ── ④ 数の読み方はロケールから ────────────────────────────────────────────── */
test('R492 ④: the separators come from Intl, so 10.000 is 10 in English and 10000 in German', () => {
  assert.equal(A.parseQuantityNumber('10.000', A.numberSeparators('en-US')), 10);
  assert.equal(A.parseQuantityNumber('10.000', A.numberSeparators('de-DE')), 10000);
  assert.equal(A.parseQuantityNumber('10,000', A.numberSeparators('en-US')), 10000);
  assert.equal(A.parseQuantityNumber('1,5', A.numberSeparators('de-DE')), 1.5);
  /* …and a spelling that fits NEITHER reading is refused rather than guessed */
  assert.equal(A.parseQuantityNumber('10 000', A.numberSeparators('en-US')), null);
  assert.equal(A.parseQuantityNumber('1,5', A.numberSeparators('en-US')), null);
  assert.equal(A.parseQuantityNumber('12,34,567', A.numberSeparators('en-US')), null);
  /* end to end: the same eight characters, two languages, two different (correct) answers */
  assert.equal(note(A.annotateAtlasHTML('10.000 ft', opt())), '≈ 3.05 m');
  assert.equal(note(A.annotateAtlasHTML('10.000 ft', opt({ lang: 'de' }))), '3.048 m');
});

/* ── ⑤ 走査はタグの中にもリンクの中にも入らない ────────────────────────────── */
test('R492 ⑤: the walk never enters a tag, a link or a code span', () => {
  const heading = '<div class="atl-h" style="font-size:1.3em;margin:1.05em 0 .3em;">Ridge</div>';
  assert.equal(A.annotateAtlasHTML(heading, opt()), heading, 'a style attribute is not prose');
  const link = '<a href="https://x.example/120-miles" rel="noopener">120 miles</a>';
  assert.equal(A.annotateAtlasHTML(link, opt()), link, 'the visible text of a link is not annotated');
  const code = '<code class="atl-code-i">alt = 5 km</code>';
  assert.equal(A.annotateAtlasHTML(code, opt()), code);
  /* …but the prose beside them still is */
  assert.ok(/atl-an-q/.test(A.annotateAtlasHTML(link + ' and 120 miles', opt())));
  /* the marked-up text itself is never re-read: one span, not a span inside a span */
  const twice = A.annotateAtlasHTML('120 miles', opt());
  assert.equal(twice.split('<span').length - 1, 1);
});

/* ── ⑥ 印は消えない — 一手の位置を本文から読み出す ─────────────────────────── */
test('R492 ⑥: the annotation pass stands inside mdMini, before the placeholders come back', () => {
  const src = CODE('js/atlas-reply.js');
  const iPass = src.indexOf('annotateAtlasHTML(html');
  const iRestore = src.indexOf('return html.replace(');
  assert.ok(iPass > 0, 'js/atlas-reply.js must run the annotation pass');
  assert.ok(iRestore > 0, 'the placeholder restore must still be there');
  assert.ok(iPass < iRestore,
    'the pass must run BEFORE the code/math/table placeholders are restored, or it would walk into them');
  /* the options object is made once per reply — that is what "first use" means */
  assert.ok(/function mdMini\(s\)\{[^\n]*_atlAnnOpts\(\)/.test(src), 'mdMini builds one options object');
  /* table cells go through the SAME object */
  assert.ok(/_atlCellFmt\(c,AN\)/.test(src) && /_atlCellFmt\(r\[i\],AN\)/.test(src), 'table cells are annotated too');
  assert.ok(/_atlBuildTable\(hdr,sp,bd,AN\)/.test(src), 'the table builder is handed the options');
  /* the hover wiring is document-level, so the sidebar tab and the workspace window get it as well */
  assert.ok(/wireAtlasAnnotations\(\)/.test(src));
});

test('R492 ⑥b: the stylesheet carries the rules, unscoped, outside the mobile block', () => {
  const src = CODE('js/atlas-styles.js');
  const iCss = src.indexOf('+ATLAS_ANNOTATE_CSS');
  const iMedia = src.indexOf('@media(max-width:768px){');
  assert.ok(iCss > 0, 'atlasPanelCSS() must include the annotation rules');
  assert.ok(iMedia > 0);
  assert.ok(iCss < iMedia, 'the rules belong to the desktop half; the mobile block closes with a brace');
  assert.ok(!/#atlas-panel \.atl-an/.test(A.ATLAS_ANNOTATE_CSS),
    'not scoped to the floating panel — the same reply is drawn in three places');
  for (const sel of ['.atl-an{', '.atl-antip{', '.atl-antip-t{', '.atl-antip-d{']) {
    assert.ok(A.ATLAS_ANNOTATE_CSS.indexOf(sel) >= 0, 'missing rule ' + sel);
  }
  /* ⚠ CONSTITUTION §2 names the exact trap: a back-tick inside CSS that lives in a JS TEMPLATE
     LITERAL terminates the literal and blanks the site. The way this file is safe from that is not
     that its prose avoids back-ticks — it is that the file contains no template literal at all, so
     there is nothing for one to terminate. That is the thing worth asserting, and it is asserted
     from the parse tree rather than from a grep over the text. */
  const ast = parse(R('js/atlas-annotate.js'), { ecmaVersion: 'latest', sourceType: 'module' });
  let templates = 0;
  walk.simple(ast, { TemplateLiteral() { templates++; } });
  assert.equal(templates, 0, 'js/atlas-annotate.js must build its CSS from quoted strings, never a template literal');
  assert.ok(A.ATLAS_ANNOTATE_CSS.indexOf('`') < 0, 'no back-tick inside the CSS itself');
});

/* ── ⑦ 見つけないと決めたもの ──────────────────────────────────────────────── */
test('R492 ⑦: the ambiguous spellings are refused on purpose', () => {
  for (const token of ['in', 'NM', 'M', 'g', 't', 'nm', 'K']) {
    assert.equal(A.unitIdForToken(token), null, token + ' must not be a unit alias');
  }
  assert.ok(!/atl-an/.test(A.annotateAtlasHTML('1 in 5 households', opt())), 'a preposition is not inches');
  assert.ok(!/atl-an/.test(A.annotateAtlasHTML('a magnitude 6.4 M event', opt())), 'M is magnitude, not metres');
  assert.ok(!/atl-an/.test(A.annotateAtlasHTML('a $5m grant', opt())), 'money is not a length');
  assert.ok(/atl-an/.test(A.annotateAtlasHTML('a 5 m wall', opt())), '…but a wall still is');
  /* every alias is claimed by exactly one unit, or the lexicon quietly resolves one of them away */
  const seen = new Map();
  for (const u of A.ATLAS_UNITS) for (const a of u.a) {
    assert.ok(!seen.has(a), 'alias ' + JSON.stringify(a) + ' is claimed by both ' + seen.get(a) + ' and ' + u.id);
    seen.set(a, u.id);
  }
  /* every unit converts to something, and no unit converts to itself */
  for (const u of A.ATLAS_UNITS) {
    assert.ok(u.to && u.to !== u.id, u.id);
    assert.ok(typeof u.k === 'number' || typeof u.f === 'function', u.id + ' has no conversion');
  }
});

/* ── ⑧ 台帳 ──────────────────────────────────────────────────────────────── */
test('R492 ⑧: the new module is in the file ledger', () => {
  assert.ok(R('docs/FILES.md').indexOf('atlas-annotate.js') > 0, 'docs/FILES.md must name js/atlas-annotate.js');
  assert.ok(R('package.json').indexOf('tests/r492-checks.test.mjs') > 0, 'this file must be in test:checks or it never runs');
});
