/* ============================================================================
 *  IntMap · licence-stated-once — 出典の行は、表示言語でも同じ条件を二度言わない
 * ----------------------------------------------------------------------------
 *  MEASURED on production, 2026-09-26: sources.html?lang=jp showed four rows (the land/sea mask,
 *  the IAU feature names, the country facts' time zones, the build-time country test) whose
 *  Japanese description says 「パブリックドメイン」 and which were then shown 「— Public domain」.
 *  The English page repeated nothing. The same four rows did it in all eight non-English
 *  languages. Cause: js/reference-data.js `useText` asked 「has the sentence already named this
 *  licence?」 with the value's ENGLISH spelling only, and appended the value in English whatever
 *  language the reader was reading.
 *
 *  ⚠ THIS MEASURES WHAT THE SHIPPED RESOLVER RETURNS, over every registry row that carries `lic`
 *  × every language the app ships (the list is scripts/i18n-pages-audit.mjs `pageCodes()`, the
 *  same one the i18n gate uses — not a list here). The sentence is `useText(n, lang)` evaluated
 *  in a context with every page document loaded, exactly as sources.html and the in-app Sources
 *  dialog call it.
 *
 *  ⚠ THE IDENTITY OF A LICENCE IS ITS VALUE, and the names that value has are read from the page
 *  documents' `licenceName` table — this file carries no spelling of any licence. A value with no
 *  entry is a publisher's title and is its own name in every language. The recogniser below is the
 *  test's OWN (a name, its trailing version dropped, bounded on both sides), not an import of the
 *  resolver's, so the two can disagree ([[intmap-co-designed-reader-cannot-falsify]]).
 *
 *  ⚠ WHAT IT CANNOT SEE: a language whose document gives a value no name. For the seven languages
 *  held at their floor (CONSTITUTION.md §7) the vocabulary has no entry, the tail falls back to
 *  English, and a description that says 「Gemeinfrei」 before a tail that says 「Public domain」 is
 *  invisible here — the only name this file can recognise in German is the English one. That is
 *  stated rather than hidden: ④ reports it by count, per language.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageCodes } from '../scripts/i18n-pages-audit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const LANGS = pageCodes();   /* [{code:'jp', html:'ja'}, …] — the app's code and the page file's tag */

function load() {
  const ctx = { console };
  ctx.window = ctx;
  const tag = Object.fromEntries(LANGS.map((r) => [r.code, r.html]));
  ctx.IntMapLang = { htmlTag: (c) => tag[c] || c, list: () => LANGS };
  vm.createContext(ctx);
  for (const r of LANGS) vm.runInContext(read(`js/locales/pages.${r.html}.js`), ctx, { filename: `pages.${r.html}.js` });
  vm.runInContext(read('js/reference-data.js'), ctx, { filename: 'js/reference-data.js' });
  return { R: ctx.IntMapRefData, docs: ctx.IntMapPageI18N._d };
}
const { R, docs } = load();
const EN = LANGS.find((r) => r.code === 'en');
const ROWS = R.dataSources.filter((s) => s.lic);

/* every name the vocabulary gives this value: the reader's language, English, and the value itself */
function namesOf(lic, html) {
  const own = (h) => docs[h] && docs[h].licenceName && docs[h].licenceName[lic];
  return { shown: own(html) || own(EN.html) || lic, all: [...new Set([own(html), own(EN.html), lic].filter(Boolean))] };
}

/* the spans in `text` where one of `names` is stated. A name is matched without its trailing version
   (prose says 「ODbL」 of a value 「ODbL 1.0」), and it must END where the name ends — a letter, or a
   hyphen that does not open a version, after it means a longer, different licence (CC BY inside
   CC BY-NC-SA; but 「CC-BY-4.0」 is CC-BY with its version) — and must not START
   inside a word. Overlapping hits of two names of one value (「Public domain」 inside 「Public domain
   (work of …)」) are one statement. */
function statements(text, names) {
  const hay = text.toLowerCase();
  const spans = [];
  for (const n of names) {
    const stem = String(n).toLowerCase().replace(/[\s-]*v?\d+(\.\d+)*\s*$/, '').trim();
    if (!stem) continue;
    for (let i = hay.indexOf(stem); i >= 0; i = hay.indexOf(stem, i + 1)) {
      const next = hay.charAt(i + stem.length), after = hay.charAt(i + stem.length + 1);
      if (/[a-z]/.test(next)) continue;
      if (next === '-' && !/[v\d]/.test(after)) continue;   /* 「-NC-SA」 is a longer name; 「-4.0」 is a version */
      if (/^[a-z0-9]/.test(stem) && /[a-z0-9]/.test(hay.charAt(i - 1))) continue;
      spans.push([i, i + stem.length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let count = 0, end = -1;
  for (const [a, b] of spans) { if (a >= end) count++; end = Math.max(end, b); }
  return count;
}

/* what the resolver ADDED to the description, measured against the description itself */
function split(s, r) {
  const own = (h) => docs[h] && docs[h].sourceUse && docs[h].sourceUse[s.n];
  const base = own(r.html) || own(EN.html) || '';
  const text = R.useText(s.n, r.code);
  assert.ok(text.startsWith(base), `${r.code} · ${s.n}: the resolver rewrote the description instead of appending to it`);
  return { head: s.n + ' ' + base, added: text.slice(base.length), text };
}

test('① no sentence states its own licence twice — in any language, by any of the licence\'s names', () => {
  assert.ok(ROWS.length > 50, `only ${ROWS.length} rows carry a licence — this measured nothing`);
  assert.ok(LANGS.length >= 2 && EN, 'the language list lost English');
  const twice = [];
  const carrying = {};
  for (const r of LANGS) {
    carrying[r.code] = 0;
    for (const s of ROWS) {
      const { head, added } = split(s, r);
      const names = namesOf(s.lic, r.html).all;
      const inAdded = statements(added, names);
      if (inAdded) carrying[r.code]++;
      if (inAdded && statements(head, names)) twice.push(`${r.code} · ${s.n.slice(0, 60)} :: ${added.slice(0, 60)}`);
    }
  }
  /* ⚠ the mechanism has to be live in every language, or 「never twice」 passes by saying nothing */
  for (const r of LANGS) assert.ok(carrying[r.code] > 5, `${r.code}: only ${carrying[r.code]} sentences carry a derived licence`);
  assert.deepEqual(twice, [], 'these sentences state the same licence twice:\n' + twice.join('\n'));
});

test('② the appended licence is spoken in the reader\'s language where the vocabulary names it', () => {
  const wrong = [];
  let named = 0;
  for (const r of LANGS) for (const s of ROWS) {
    const own = docs[r.html] && docs[r.html].licenceName && docs[r.html].licenceName[s.lic];
    if (!own) continue;
    const { added } = split(s, r);
    if (!added) continue;
    named++;
    const shown = added.replace(/^ — /, '');
    if (!shown.startsWith(own)) wrong.push(`${r.code} · ${s.n.slice(0, 60)} shows 「${shown.slice(0, 60)}」, not 「${own}」`);
  }
  /* English and Japanese both name a value (CONSTITUTION.md §7), so this cannot be vacuous */
  assert.ok(named > 0, 'no row in any language shows a vocabulary-named licence — the table is unused');
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('③ …and no row hides its terms: every carried licence is stated at least once', () => {
  const hidden = [];
  for (const r of LANGS) for (const s of ROWS) {
    const { head, added } = split(s, r);
    if (!statements(head + ' ' + added, namesOf(s.lic, r.html).all)) hidden.push(`${r.code} · ${s.n.slice(0, 60)} (${s.lic})`);
  }
  assert.deepEqual(hidden, [], 'these rows never state the licence they carry:\n' + hidden.join('\n'));
});

test('④ the vocabulary names only values the registry carries, and en + jp name every one', () => {
  const values = new Set(ROWS.map((s) => s.lic));
  const en = docs[EN.html].licenceName || {};
  assert.ok(Object.keys(en).length > 0, 'the English licenceName table is empty');
  for (const r of LANGS) {
    const t = docs[r.html] && docs[r.html].licenceName;
    if (!t) continue;
    for (const k of Object.keys(t)) {
      assert.ok(values.has(k), `${r.html} names 「${k}」, which no registry row carries`);
      assert.ok(k in en, `${r.html} names 「${k}」 and English does not — the English table is the universe`);
    }
  }
  /* IntMap's own words are authored in en + jp (CONSTITUTION.md §7) */
  const jp = LANGS.find((r) => r.code === 'jp');
  const ja = (jp && docs[jp.html].licenceName) || {};
  for (const k of Object.keys(en)) assert.ok(typeof ja[k] === 'string' && ja[k] && ja[k] !== k, `jp has no name of its own for 「${k}」`);
  /* the frozen languages, stated by count rather than asserted (see the header) */
  for (const r of LANGS) {
    const t = (docs[r.html] && docs[r.html].licenceName) || {};
    const fallback = Object.keys(en).filter((k) => !(k in t)).length;
    if (fallback) console.log(`# ${r.code}: ${fallback}/${Object.keys(en).length} licence names fall back to English`);
  }
});
