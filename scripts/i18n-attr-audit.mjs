#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE SIXTH SURFACE — prose that never enters the translation system  (#R240)
 * ----------------------------------------------------------------------------
 *  「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
 *    完璧かどうか最終点検し、未了点があれば修正して。（まだある）
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ ⚠⚠⚠ WHY THERE WAS STILL SOMETHING TO FIND ═══════════════════════════════════════════════════
 *  #R239 bound the five existing instruments into ONE gate and got every language to 100 % on every
 *  one of them. It was right about the binding and wrong about the universe: all five measure the
 *  COVERAGE OF STRINGS THAT ARE ALREADY IN THE SYSTEM — how much of the keyed table a language has,
 *  how many of the five positional arguments a call site passed, how much of the reading pages it
 *  carries. Not one of them can see a string that was never handed to `L(…)` or given a `data-i18n`
 *  key at all. That string is 100 % translated by every measure and English on every screen.
 *
 *  Measured this round by harvesting the RUNNING app in all nine languages and diffing what the
 *  reader actually sees: 49 distinct `title` / `aria-label` / `placeholder` strings were identical
 *  in every language, because they are literals in index.html with no key —
 *
 *      Reset North · 3D terrain · Grid + Labels · Measure distance / area · Radius · My location ·
 *      Freehand draw & trace · Draw a real-scale 3-D volume in the air · Time machine · Share ·
 *      Search · Toggle Sidebar · Map tools · Map options · Favorite · Drag to resize · Close …
 *
 *  ⚠ SO THIS INSTRUMENT ASKS THE OTHER QUESTION: not «how much of the table does this language
 *  have» but «is this string in the table at all». It is a surface of the ONE gate
 *  (scripts/i18n-audit.mjs), not a sixth free-standing percentage — that mistake is what #R239's
 *  own header is about.
 *
 *      node scripts/i18n-attr-audit.mjs            # the list
 *      node scripts/i18n-attr-audit.mjs --json     # for the gate
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'admin.html'];

/* the attributes a reader can SEE or HEAR, and the key that translates each one */
const ATTRS = {
  title: 'data-i18n-title',
  'aria-label': 'data-i18n-aria',
  placeholder: 'data-i18n-ph',
  alt: 'data-i18n-alt',
};

/* ⚠ NOT PROSE — and every entry here is a CLASS of value, not a specific string, so the list cannot
   be used to wave a real gap through. A value is exempt when it is not language at all: a URL, a
   number with a unit, a bare technical token, an emoji, or a name that is the same in every
   language because it is a proper noun this app does not translate. */
const EXEMPT = [
  /^\s*$/,                                   /* empty */
  /^[^A-Za-z]*$/,                            /* no latin letters at all: emoji, digits, symbols, CJK */
  /^https?:\/\//i,                           /* a URL */
  /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/,       /* an address */
  /^#[0-9a-f]{3,8}$/i,                       /* a colour */
  /^[-+]?[0-9][0-9.,\s]*[A-Za-z%°]{0,4}$/,   /* a number with a unit */
  /^(IntMap|Atlas|OpenStreetMap|MapLibre|Cesium|GitHub|Stripe|Supabase|USGS|NASA|NOAA|Esri|Maxar)$/i,
];
const exempt = (v) => EXEMPT.some((re) => re.test(v.trim()));

/* one pass over every start tag: the attribute soup of a tag is small and this file is ours */
const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;

const findings = [];
for (const f of FILES) {
  let src = '';
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch (_) { continue; }
  /* line number for a character offset, so a finding can be opened */
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    const attrs = {};
    let a;
    ATTR.lastIndex = 0;
    while ((a = ATTR.exec(m[2] || ''))) attrs[a[1].toLowerCase()] = (a[2] ?? a[3] ?? a[4] ?? '');
    /* ⚠ A LANGUAGE PILL NAMES ITS OWN LANGUAGE, IN THAT LANGUAGE. 「Español」 on the ES pill is the
       endonym js/lang-registry.js derives from Intl.DisplayNames precisely so a picker is readable
       to the reader it is for; translating it would be the defect, not the fix. */
    const isLangPill = /^lang-/.test(attrs.id || '');
    for (const name in ATTRS) {
      const v = attrs[name];
      if (v == null || exempt(v) || isLangPill) continue;
      if (attrs[ATTRS[name]]) continue;                       /* it has a key — it is in the system */
      findings.push({ file: f, line: lineAt(m.index), tag: m[1], attr: name, text: v.trim() });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: findings.length, findings }));
  process.exit(0);
}
console.log('IntMap · attributes a reader sees that are NOT in the translation system  (#R240)\n');
if (!findings.length) { console.log('  none — every title / aria-label / placeholder / alt carries a key.'); process.exit(0); }
const byText = new Map();
findings.forEach((x) => { if (!byText.has(x.text)) byText.set(x.text, []); byText.get(x.text).push(x); });
[...byText.entries()].sort().forEach(([t, xs]) => {
  console.log('  ' + t);
  xs.forEach((x) => console.log('      ' + x.file + ':' + x.line + '  <' + x.tag + ' ' + x.attr + '>  → add ' + ATTRS[x.attr] + '="…"'));
});
console.log(`\n${findings.length} attribute(s), ${byText.size} distinct string(s).`);
