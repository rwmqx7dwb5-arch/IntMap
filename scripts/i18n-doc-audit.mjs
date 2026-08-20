#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA   (#R249)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ WHY THERE WAS STILL SOMETHING TO FIND, FOR THE FIFTEENTH TIME ══════════════════════════════
 *  Every instrument before this one walks ELEMENTS. #R240 added `title`/`aria-label`/`placeholder`
 *  because those are attributes ON elements; #R239 added the reading pages because those are
 *  documents made OF elements. `<title>` and `<meta name="description">` are neither: they are the
 *  document's own metadata, nobody's innerText and nobody's `data-i18n`, and they were literals in
 *  index.html — so the browser tab, the bookmark, the window list and every shared link read
 *  「IntMap — Explore the world. Ask the map.」 in all nine languages while the coverage matrix
 *  printed 100 % on every row. Measured at run time before the fix: switching the app to jp and to
 *  zh left `document.title` byte-identical.
 *
 *  ⚠ AND THE MECHANISM ALREADY EXISTED. js/page-i18n.js has localised exactly these two fields for
 *  sources.html and science.html since #R239. The application page simply never called it — which
 *  is [[intmap-recurring-lessons]] G once more (one behaviour, two implementations, and the gap is
 *  in the one nobody instrumented) rather than a missing translation.
 *
 *  ══ WHAT THIS MEASURES ═════════════════════════════════════════════════════════════════════════
 *  ① every document that a reader can open has its <title> and <meta name=description> LOCALISED,
 *     i.e. reached by a mechanism rather than left as a literal;
 *  ② the keys that mechanism reads are declared by all nine languages (the keyed audit owns the
 *     count; this file owns the question of whether the key is WIRED AT ALL).
 *
 *  ⚠ `og:` / `twitter:` ARE DELIBERATELY OUT OF SCOPE, AND THAT IS RECORDED HERE RATHER THAN LEFT
 *  TO BE RE-DISCOVERED AS A SIXTEENTH GAP. A social-card crawler does not execute the page's
 *  JavaScript, so a runtime rewrite of those tags changes nothing any crawler sees; localising them
 *  is a BUILD-time question (one pre-rendered document per language), which is a different piece of
 *  work with a different cost. They stay English on purpose.
 *  ⚠ admin.html IS OUT OF SCOPE BY DECISION (#R249, confirmed with the reader): it is the operator
 *  console, not a reader-facing page. scripts/i18n-attr-audit.mjs still measures its attributes;
 *  see the note there.
 *
 *      node scripts/i18n-doc-audit.mjs            # the table
 *      node scripts/i18n-doc-audit.mjs --gate     # …and exit 1 if a document is not wired
 *      node scripts/i18n-doc-audit.mjs --json     # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch (_) { return ''; } };

/* ── the reader-facing documents, and what wires each one ──────────────────────────────────────
   ⚠ A LIST OF DOCUMENTS IS NOT A LIST OF NAMES TO MAINTAIN: it is every .html a reader can open,
   and the two that are deliberately excluded say so with a reason. A new reader-facing page that
   is not added here is caught by tests/r249-checks ③, which enumerates *.html from disk. */
const DOCS = [
  /* ⚠ index.html is wired by the REGISTRY, not by the app shell: js/lang-registry.js already owns
     `lang` and the keyed table, and js/app-body.js has a line ceiling that only ever comes down
     ([[intmap-recurring-lessons]] K). `syncDocument` is called from `syncChrome` at boot and from
     `updateI18n` on every language change, so a saved language and a switched one both land. */
  { file: 'index.html', wiredBy: 'js/lang-registry.js', keys: ['docTitle', 'docDesc'] },
  { file: 'sources.html', wiredBy: 'js/page-i18n.js', keys: null },   /* pages.<lg>.js `title`/`meta` */
  { file: 'science.html', wiredBy: 'js/page-i18n.js', keys: null },
  /* (#R280) the Terms and the Privacy Policy as pages of their own. Their CHROME — the tab title
     and the description this rule measures — is nine languages; the DOCUMENT they wrap is
     Japanese and English only, on purpose, and the page says so in the reader's own language.
     See the header of js/legal-page.js. */
  { file: 'privacy.html', wiredBy: 'js/legal-page.js', keys: null },
  { file: 'terms.html', wiredBy: 'js/legal-page.js', keys: null },
];
export const EXCLUDED = {
  'admin.html': 'the operator console, not a reader-facing page — #R249, confirmed with the reader',
  'google0266d9db8efbc48c.html': 'a search-console ownership token, not a page',
};

/* does the wiring file actually assign document.title AND the description meta? */
function wires(src) {
  return {
    title: /document\.title\s*=/.test(src),
    desc: /meta\[name=["']?description["']?\]/.test(src) && /setAttribute\(\s*['"]content['"]/.test(src),
  };
}

const rows = [];
for (const d of DOCS) {
  const html = read(d.file);
  const w = wires(read(d.wiredBy));
  const hasTitle = /<title>/i.test(html);
  const hasDesc = /<meta\s+name=["']description["']/i.test(html);
  /* the KEYS the wiring reads must be declared by every language (the keyed audit counts them;
     here we only assert that English declares them at all, so a typo cannot pass silently) */
  const en = read('js/locales/ui.en.js');
  const keysOk = !d.keys || d.keys.every((k) => new RegExp('\\b' + k + '\\s*:').test(en));
  rows.push({ file: d.file, wiredBy: d.wiredBy, hasTitle, hasDesc,
    titleWired: w.title, descWired: w.desc, keysOk,
    ok: hasTitle && hasDesc && w.title && w.desc && keysOk });
}

const bad = rows.filter((r) => !r.ok);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ rows, bad: bad.map((r) => r.file), excluded: EXCLUDED }));
  process.exit(0);
}

console.log('\nIntMap · document-metadata audit — <title> and <meta description>, per document  (#R249)\n');
console.log('document          wired by             <title>  desc   title←i18n  desc←i18n  keys');
for (const r of rows) {
  console.log(r.file.padEnd(18) + r.wiredBy.padEnd(21)
    + String(r.hasTitle).padEnd(9) + String(r.hasDesc).padEnd(7)
    + String(r.titleWired).padEnd(12) + String(r.descWired).padEnd(11)
    + (r.keysOk ? 'ok' : 'MISSING') + (r.ok ? '' : '   ⚠'));
}
console.log('\nexcluded, on purpose:');
for (const [f, why] of Object.entries(EXCLUDED)) console.log(`  ${f.padEnd(30)} ${why}`);
console.log('\nog: / twitter: card tags are NOT measured — a crawler does not run the page\'s JavaScript,');
console.log('so those are a build-time question. See the header of this file.');

if (process.argv.includes('--gate') && bad.length) {
  console.error('\n✖ document metadata is not localised: ' + bad.map((r) => r.file).join(', '));
  process.exit(1);
}
if (!bad.length) console.log('\n✓ every reader-facing document localises its title and description.');
