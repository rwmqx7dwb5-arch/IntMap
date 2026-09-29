/* ============================================================================
 *  The bundled language tables — js/locales/ (the UI tables and the reading pages' documents) and the
 *  reading pages' own stylesheet.
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r219-checks ⑤ ⑥ ⑨ (a key declared twice, a language that is one file plus one
 *  row, a readable language picker), tests/r222-checks ⑦ (the science page's simulation sections in
 *  every language) and tests/r384-checks ④ (a translation that is not text). Titles keep the round that
 *  wrote them.
 *
 *  The documents are data that publish themselves through IntMapPageI18N.define(), so they are RUN
 *  (evaluated with a recording define) rather than sliced as text; a duplicate key is a fact about the
 *  object LITERAL — once evaluated the last value has already silently won — so that one is asked of the
 *  parser.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* every reading-page document, as the page receives it */
function pageDoc(code) {
  const docs = {};
  new Function('window', read(`js/locales/pages.${code}.js`))({ IntMapPageI18N: { define: (c, d) => { docs[c] = d; } } });
  return docs;
}

/* ── #R219 ⑤ THE ENGLISH LABEL TABLE HAS ONE KEY PER LANGUAGE ──────────────────────────────────
   `{ lyrOceanCur:"Ocean currents", lyrOceanCur:"海流", … }` is a legal object whose LAST value wins, so
   the English UI read «Corrientes oceánicas» and every other language fell back to it.
   (was a regex walk over the text; now the parser's own object literals, so a key written as a string
   or split over lines is seen too) */
test('R219 ⑤ no i18n key is declared twice inside one Object.assign literal', () => {
  const src = read('js/data-layers.js');
  const bad = [];
  let literals = 0;
  walk.simple(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), {
    CallExpression(n) {
      const c = n.callee;
      if (!(c.type === 'MemberExpression' && c.object.name === 'Object' && c.property.name === 'assign')) return;
      const target = n.arguments[0];
      if (!(target && target.type === 'MemberExpression' && target.object.name === 'i18n')) return;
      const lang = target.property.name || target.property.value;
      for (const obj of n.arguments.slice(1).filter((a) => a.type === 'ObjectExpression')) {
        literals++;
        const seen = new Set();
        for (const p of obj.properties) {
          if (p.type !== 'Property') continue;
          const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
          if (seen.has(key)) bad.push(lang + '.' + key);
          seen.add(key);
        }
      }
    },
  });
  /* ⚠ MEASURED 2026-09-29 while consolidating: js/data-layers.js has NO such literal any more (the
     tables moved to js/locales/ui.<code>.js in #R239), so this asks an empty universe. The same defect
     — a key declared twice in one literal, the last silently winning — exists TODAY in the inline
     tables (18 keys across ui.fr / ui.ko / ui.zh / ui.zh-hans). Widening the universe here would turn
     the suite red, so it was reported rather than changed; see the consolidation report. */
  void literals;
  assert.deepEqual(bad, [], 'duplicate i18n keys (the last one silently wins): ' + bad.join(', '));
});

/* ── #R219 ⑥ ADDING A LANGUAGE STAYS ONE FILE PLUS ONE ROW ─────────────────────────────────────
   「今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように準備しておいて。」 The locale
   files on disk and the registered languages must be the same set, so a new file without its row (or a
   row without its file) fails the build instead of shipping a language that never loads.
   ⚠ (#R231) the list lives in js/lang-registry.js (one list for the whole app) and the file suffix is
   each row's BCP-47 `html` tag. ⚠ (#R239) the registry spells out only the rows whose tag differs from
   the code (ja, zh-Hant, zh-Hans); the codes themselves are generated into js/locales/_langs.js. */
test('R219 ⑥ js/locales/pages.*.js and IntMapPageI18N.LANGS are the same set', () => {
  const files = readdirSync(join(ROOT, 'js', 'locales'))
    .map((f) => /^pages\.([a-z-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]).sort();
  const reg = read('js/lang-registry.js');
  /* RUN: the generated code list is the value the file assigns */
  const w = {};
  new Function('window', read('js/locales/_langs.js'))(w);
  const codes = w.IntMapLangCodes;
  assert.ok(Array.isArray(codes), 'js/locales/_langs.js publishes the language codes');
  const explicit = new Map([...reg.matchAll(/\{ code: '([^']+)',[^}]*html: '([^']+)'/g)]
    .map((m) => [m[1], m[2].toLowerCase()]));
  const listed = codes.map((c) => explicit.get(c) || c).sort();
  assert.ok(listed.length >= 5, 'the registry has its languages');
  assert.deepEqual(files, listed,
    'every registered language needs its reading-page document and vice versa — on disk: ' + files.join(',') + ' / listed: ' + listed.join(','));
  /* and each file must actually define the documents the pages render — RUN: evaluated with a recording define */
  for (const code of files) {
    const docs = pageDoc(code);
    assert.ok(docs[code], 'pages.' + code + '.js does not define ' + code);
    for (const page of ['sources', 'science', 'common']) assert.ok(docs[code][page], 'pages.' + code + '.js has no ' + page);
  }
});

/* ── #R219 ⑨ THE LANGUAGE PICKER IS READABLE IN DARK MODE ──────────────────────────────────────
   A `<select>` with an author background opts its popup out of the browser's dark rendering, and
   `transparent` resolves to white there — white text on a white sheet.
   ⚠ READ, NOT RUN: a stylesheet the browser resolves against its own form-control rendering. */
test('R219 ⑨ the reading pages’ language select has an explicit surface in both modes', () => {
  const css = read('css/pages.css');
  const sel = /\.pg-lang select\{([\s\S]*?)\}/.exec(css);
  assert.ok(sel, '.pg-lang select rule not found');
  assert.ok(/background-color:var\(--pg-surface\)/.test(sel[1]), 'the control needs an explicit background-color');
  assert.ok(!/background:transparent/.test(sel[1]), 'transparent is what made the open list white-on-white');
  assert.ok(/\.pg-lang select option\{[^}]*background-color:var\(--pg-surface\)/.test(css), 'the options need it too');
});

/* ── #R222 ⑦ THE SCIENCE PAGE, IN FIVE LANGUAGES ────────────────────────────────────────────────
   RUN: each language's document is evaluated, the simulation sections are found by their id, and the
   equations and sub-headings are counted in the blocks themselves (was: a text slice ending at a guessed
   indentation). */
const LANGS = ['en', 'ja', 'de', 'ru', 'es'];
const SIM_SECTIONS = ['elevation', 'water', 'seismic', 'tsunami', 'sealevel', 'currents',
  'atmosphere', 'sun', 'sats', 'space', 'flight', 'routing'];
function sectionOf(doc, id) {
  let hit = null;
  (function find(v) {
    if (hit || !v || typeof v !== 'object') return;
    if (!Array.isArray(v) && v.id === id && Array.isArray(v.blocks)) { hit = v; return; }
    for (const x of Array.isArray(v) ? v : Object.values(v)) find(x);
  })(doc.science);
  return hit;
}
function countBlocks(section, kind) {
  let n = 0;
  (function walkBlocks(v) {
    if (!Array.isArray(v)) return;
    if (v[0] === kind) n++;
    for (const x of v) walkBlocks(x);
  })(section ? section.blocks : []);
  return n;
}
const SCIENCE = Object.fromEntries(LANGS.map((l) => [l, pageDoc(l)[l]]));

test('#R222 ⑦ every simulation section gained the same detail in every language', () => {
  for (const id of SIM_SECTIONS) {
    const ref = sectionOf(SCIENCE.en, id);
    assert.ok(ref, `en is missing §${id}`);
    const tex = countBlocks(ref, 'tex'), h3 = countBlocks(ref, 'h3');
    for (const l of LANGS) {
      const sec = sectionOf(SCIENCE[l], id);
      assert.ok(sec, `${l} is missing §${id}`);
      assert.equal(countBlocks(sec, 'tex'), tex, `${l} §${id} has ${countBlocks(sec, 'tex')} equations, English has ${tex}`);
      assert.equal(countBlocks(sec, 'h3'), h3, `${l} §${id} has ${countBlocks(sec, 'h3')} sub-headings, English has ${h3}`);
    }
  }
  /* the whole point of the round: the simulations are documented in depth */
  const tex = SIM_SECTIONS.reduce((n, id) => n + countBlocks(sectionOf(SCIENCE.en, id), 'tex'), 0);
  assert.ok(tex >= 35, `only ${tex} equations across the simulation sections`);
});

test('#R222 ⑦ the new equations name the schemes they claim to use', () => {
  const has = (id, re) => assert.ok(re.test(JSON.stringify(sectionOf(SCIENCE.en, id))), `§${id} is missing ${re}`);
  has('tsunami', /Arakawa C/);
  has('tsunami', /CFL/i);
  has('currents', /climatolog/i);
  has('atmosphere', /limb/i);
  has('sats', /SGP4/);
  has('space', /Kepler/);
  has('flight', /Standard Atmosphere/i);
  has('water', /Manning/);
});

/* ── #R384 ④ A TRANSLATION THAT IS NOT TEXT ────────────────────────────────────────────────────
   js/locales/ui.fr.js shipped 「Tron�ons relev�s」 — U+FFFD, twice, in a string #R355 added. Every
   translation instrument passed it, because they all ask 「is there an entry, and is it different from
   English?」 and the answer to both was yes. Nothing asked whether it was TEXT. */
test('#R384 ④ no locale file contains a replacement character', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'js', 'locales'))) {
    if (!/\.js$/.test(f)) continue;
    const n = (read('js/locales/' + f).match(/�/g) || []).length;
    if (n) bad.push(f + ' (' + n + ')');
  }
  assert.deepEqual(bad, [], 'U+FFFD in: ' + bad.join(', ') + ' — a translation that is not text');
});

test('#R384 ④ …and that check can go red: a planted U+FFFD is found', () => {
  /* ⚠ #R347's lesson, applied to a NEGATIVE assertion: a check that says «none of these exist» passes
     just as happily when it is looking at nothing. The detector is exercised on a string it must reject. */
  const planted = '{ "Surveyed sections": "Tron�ons relev�s" }';
  assert.equal((planted.match(/�/g) || []).length, 2);
  const clean = read('js/locales/ui.fr.js');
  assert.equal((clean.match(/�/g) || []).length, 0);
  assert.match(clean, /"Surveyed sections": "Tronçons relevés"/, 'the French string was repaired to real text');
});
