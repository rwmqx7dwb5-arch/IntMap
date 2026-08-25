/* ============================================================================
 *  IntMap · R456 — the sixth surface was measuring two files of markup
 * ----------------------------------------------------------------------------
 *  ① 「レイヤーのツールチップが9言語すべてで英語のまま。」
 *
 *  `scripts/i18n-attr-audit.mjs` (#R240) describes itself as «title / aria-label / placeholder /
 *  alt with NO key at all» and reported 0 — while `tg.title='Layers'` and two writers of
 *  `title='Favorite'` shipped English in all nine languages. Its universe was
 *  `FILES = ['index.html','admin.html']`; every attribute JavaScript writes at runtime was outside
 *  it. This file pins the widened universe, and it pins it in the only way that means anything:
 *  by handing the scanner the three defect lines AS THEY WERE WRITTEN and asserting it reports
 *  them. A check that can only say «the repo is at zero» is the check that was green for 216
 *  rounds — [[intmap-recurring-lessons]] B.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource } from '../scripts/i18n-attr-audit.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(path.join(ROOT, p), 'utf8');
/* ⚠ THE 15th TIME A CHECK READ ITS OWN NOTE. The comment that EXPLAINS the defect spells the
   defect out, so a raw search finds the explanation and calls it the disease. Strip comments
   before asking whether the CODE still holds a string. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① THE CHECK FIRES — the three lines, exactly as they shipped ════════════════════════════ */

/* ⚠ VERBATIM. These are the three sites as they stood at 03d942a, so this test is a REPRODUCTION
   and not a paraphrase of one. If the scanner ever stops seeing them, it has regressed to the
   universe that could not see them for 216 rounds. */
const AS_IT_SHIPPED = `
  const tg=document.createElement('button'); tg.id='lsr-toggle'; tg.title='Layers'; tg.innerHTML='<span class="chev"></span>';
  const st=document.createElement('button'); st.type='button'; st.textContent='★'; st.title='Favorite';
  const star=document.createElement('button'); star.type='button'; star.title='Favorite'; star.dataset.key=info.key;
`;

test('R456 ① the widened audit reports the three tooltips that shipped English in nine languages', () => {
  const hits = scanSource(AS_IT_SHIPPED, 'as-it-shipped.js');
  assert.equal(hits.length, 3,
    'expected 3 findings, got ' + hits.length + ': ' + JSON.stringify(hits.map((h) => h.text)));
  assert.deepEqual(hits.map((h) => h.text).sort(), ['Favorite', 'Favorite', 'Layers']);
  for (const h of hits) assert.equal(h.attr, 'title');
});

test('R456 ① …and the two shapes the markup-only universe could not hold', () => {
  /* a runtime setAttribute */
  assert.equal(scanSource(`el.setAttribute('aria-label','Close popup');`).length, 1);

  /* ⚠ MARKUP SPLIT ACROSS A `+` CHAIN. Neither literal contains a whole start tag, so a scanner
     that reads each string ALONE sees `<input … value="` with no `>` and reports nothing. Two live
     findings (js/app-body.js's ACLED credential boxes) hid in exactly this shape. */
  const chain = `x.innerHTML='<input id="acled-email" type="email" placeholder="email" value="'+esc(v)+'" style="flex:1;">';`;
  const hits = scanSource(chain);
  assert.equal(hits.length, 1, 'a tag spread over a + chain is still one tag');
  assert.equal(hits[0].text, 'email');
  assert.equal(hits[0].attr, 'placeholder');
});

test('R456 ① a value that goes through a translation call is NOT a finding', () => {
  /* otherwise the check above proves nothing: an instrument that reports everything reports nothing */
  assert.equal(scanSource(`tg.title=window.IntMapLang.t(lang,'Layers','レイヤー','Ebenen','Слои','Capas');`).length, 0);
  assert.equal(scanSource(`el.setAttribute('aria-label',window.IntMapLang.t(lang,'Close','閉じる','Schließen','Закрыть','Cerrar'));`).length, 0);
  /* …and neither is a value that is not language: a unit symbol, a URL, a proper noun with punctuation */
  assert.equal(scanSource(`el.title='m'; el.title='https://example.org/x'; el.title='IntMap — '+t;`).length, 0);
});

/* ⚠⚠ AND NAMING THE LANGUAGE IS NOT A TRANSLATION CALL. The first draft of the widened audit waved
   through any expression mentioning `lang`, on the theory that a hand-written ladder belongs to
   scripts/i18n-two-branch-audit.mjs. Measured: that hatch covered exactly one site in the repo —
   js/tool-panel.js's minimise button, whose branches are themselves conditionals, so that audit
   could not match it either. Five languages named by hand, four told «Expand». */
test('R456 ① a hand-written language ladder is a finding, not another instrument’s problem', () => {
  const ladder = `mb.title=(HOST.lang==='jp'?(on?'展開':'最小化'):HOST.lang==='de'?(on?'Ausklappen':'Minimieren'):(on?'Expand':'Minimize'));`;
  assert.ok(scanSource(ladder).length > 0, 'a ladder that names five of nine languages is reported');
  assert.doesNotMatch(code(R('js/tool-panel.js')), /HOST\.lang==='jp'\?\(on\?/, 'and js/tool-panel.js no longer holds one');
});

/* ══ ② …AND THE REPOSITORY IS AT ZERO AGAINST THAT WIDER UNIVERSE ════════════════════════════ */

test('R456 ② every reader-facing attribute in js/ carries a translation, and the gate says so', () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'i18n-attr-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.total, 0, 'unkeyed reader-facing attributes: '
    + [...new Set(out.findings.map((f) => `${f.file}:${f.line} ${f.text}`))].join(' · '));

  /* the universe is BOTH files of markup AND every file of js/ — a count, so it cannot shrink back */
  const g = R('scripts/i18n-attr-audit.mjs');
  assert.match(g, /parseAll/, 'it reads the shared parse of js/');
  assert.match(g, /shapeOf/, 'and asks the ONE question about what a translation call is');
  assert.doesNotMatch(g, /from 'acorn-walk';[\s\S]{0,80}FILES = \['index\.html', 'admin\.html'\];\s*$/,
    'index.html and admin.html are no longer the whole universe');
});

/* ══ ③ BOTH WRITERS OF THE ★, AND THE KEY THAT SURVIVES A LANGUAGE SWITCH ════════════════════ */

test('R456 ③ the ★ tooltip is fixed in BOTH files that write it', () => {
  /* ⚠ fixing one leaves the other: js/map-ui.js draws the tile grid's ★ and js/layer-favs.js the
     classic row's, and they wrote the same English string independently. */
  for (const f of ['js/map-ui.js', 'js/layer-favs.js']) {
    assert.doesNotMatch(code(R(f)), /\.title\s*=\s*'Favorite'/, f + ' still writes the English literal');
    assert.match(R(f), /ttlFavorite/, f + ' must name the key');
  }
  assert.doesNotMatch(code(R('js/map-ui.js')), /\.title\s*=\s*'Layers'/);
  assert.match(R('js/map-ui.js'), /ttlLayersPanel/);
});

test('R456 ③ an attribute that outlives a language change carries the KEY as well as the text', () => {
  /* the edge toggle and the ★s are built once and are still on screen after a switch, so the text
     alone would freeze in whatever language they were built in. js/app-body.js's updateI18n()
     re-applies [data-i18n-title]; these three elements are the reason it has to. */
  assert.match(R('js/map-ui.js'), /setAttribute\('data-i18n-title',\s*k\)/, 'map-ui sets the key');
  assert.match(R('js/layer-favs.js'), /setAttribute\('data-i18n-title',\s*'ttlFavorite'\)/);
  assert.match(R('js/app-body.js'), /\[data-i18n-title\]/, 'and the applier still exists');
});

test('R456 ③ both keys exist in all nine languages, and none of them is still the English word', () => {
  const files = readdirSync(path.join(ROOT, 'js', 'locales')).filter((n) => /^ui\..*\.js$/.test(n));
  assert.equal(files.length, 9, 'nine ui tables: ' + files.join(' '));
  for (const f of files) {
    const src = R('js/locales/' + f);
    for (const k of ['ttlLayersPanel', 'ttlFavorite']) {
      assert.match(src, new RegExp(k + '\\s*:'), `${f} is missing ${k}`);
    }
    if (/ui\.en\.js$/.test(f)) continue;
    /* every non-English table must differ from English on both keys — a copied English row is the
       gap this whole family of instruments exists to find, not a translation. */
    const layers = (src.match(/ttlLayersPanel\s*:\s*(["'])(.*?)\1/) || [])[2];
    const fav = (src.match(/ttlFavorite\s*:\s*(["'])(.*?)\1/) || [])[2];
    assert.notEqual(layers, 'Layers', `${f}: ttlLayersPanel is still the English word`);
    assert.notEqual(fav, 'Favorite', `${f}: ttlFavorite is still the English word`);
  }
});

/* ══ ④ THE FINDING HAS TO BE OPENABLE ════════════════════════════════════════════════════════ */

test('R456 ④ no shipped file holds a lone CR, so a reported line is the line on disk', () => {
  /* js/satellite.js carried one. JavaScript treats a bare \r as a line terminator and grep does
     not, so acorn numbered that file one line higher than the editor from line 12 down — every
     instrument in this family reported it wrong, and a finding nobody can open is half a finding. */
  const bad = [];
  for (const f of readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    if (/\r(?!\n)/.test(R('js/' + f))) bad.push(f);
  }
  assert.deepEqual(bad, [], 'lone CR in: ' + bad.join(' '));
});

test('R456 ④ a finding inside a multi-line template names the line the attribute is on', () => {
  /* the line the BACKTICK is on sends the reader to the wrong end of a panel-sized template */
  const src = ['const a = `<div>', '  <span>x</span>', '  <button title="Delete this">y</button>', '`;'].join('\n');
  const hits = scanSource(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3, 'reported line ' + hits[0].line + ', the attribute is on 3');
});
