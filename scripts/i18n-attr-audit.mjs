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
 *  ══ ⚠⚠⚠ (#R459) …AND IT WAS ASKING IT OF HALF THE APP ══════════════════════════════════════════
 *  「レイヤーのツールチップが9言語すべてで英語のまま。」
 *
 *  This file's own description — «title / aria-label / placeholder / alt with NO key at all» — is a
 *  claim about the APP. What it measured was `FILES = ['index.html', 'admin.html']`: two files of
 *  MARKUP. An attribute that js/*.js writes at runtime was outside the universe, so it printed
 *
 *      none — every title / aria-label / placeholder / alt carries a key.
 *
 *  …while three of them shipped English in all nine languages for 216 rounds:
 *
 *      js/map-ui.js      tg.title='Layers'      the layer sidebar's edge open/close button
 *      js/map-ui.js      st.title='Favorite'    the ★ on every tile
 *      js/layer-favs.js  star.title='Favorite'  the ★ on every classic row — the SAME string, a
 *                                               second writer, which is why fixing one is not a fix
 *
 *  ⚠ THE TELL WAS ON THE ELEMENT ITSELF. js/atlas-controls.js gives that same ★ an `aria-label`
 *  through `IntMapLang.t(…)`, so a French reader got `aria-label="favori : …"` and
 *  `title="Favorite"` on ONE button. Two attributes of one element disagreeing is what a universe
 *  that stops at the markup looks like from the outside.
 *
 *  ⚠ A GATE WHOSE DESCRIPTION IS WIDER THAN ITS MEASUREMENT IS THE DEFECT scripts/i18n-audit.mjs
 *  EXISTS TO PREVENT — «every round found English on a screen while the instrument of the day
 *  printed 100 %». So the fix is not the three lines. It is that the universe is now BOTH shapes a
 *  reader-facing attribute is written in, read by ONE tag scanner and ONE verdict:
 *
 *      ① markup on disk          index.html · admin.html          — as before
 *      ② markup a string builds  `<b title="Close">` inside js/    — the same scanner, over the
 *                                                                    constant text of the string
 *      ③ a runtime assignment    el.title = 'Layers'
 *                                el.setAttribute('aria-label', 'Favorite')
 *
 *  ⚠ AND IT HOLDS NO PARSER OF ITS OWN (#R372's rule). scripts/i18n-helpers.mjs already parses
 *  every file in js/ once for this whole family, and its `shapeOf()` is the ONE answer to «is this
 *  a translation call», so «in the system» cannot come to mean two different things in two files.
 *
 *  ══ ⚠ WHAT THIS STILL DOES NOT SEE — SAID HERE RATHER THAN DISCOVERED IN 216 ROUNDS ═══════════
 *  What it measures is THE CONSTANT TEXT THAT REACHES THE ATTRIBUTE. Two things are outside that,
 *  and both were counted before this line was written rather than guessed at:
 *
 *    · A literal buried in some OTHER expression's fallback, after a translated prefix —
 *      `t(…,'file: ',…) + String(el.accept || 'upload')`. 2 sites (js/atlas-controls.js:135 and
 *      :142, `'legend'` and `'upload'`), both naming a technical value a DOM node did not supply.
 *      Reporting these means reporting every string literal in the expression, and a translation
 *      KEY is a string literal too — `t('aiNoKey')`, `pick('common','toScience')`. Measured on the
 *      whole repo, that question returns 21 sites of which 18 are keys. An instrument that cannot
 *      tell a key from prose would have to be silenced by hand, which is how a gate stops meaning
 *      anything.
 *    · An attribute bag — `el('button', { title: … })`. 45 such sites; an independent sweep of all
 *      273 shipped JS files found 0 of them carrying an English literal, so nothing is hiding there
 *      today. It is a shape, not a gap, and it is named here so the next round does not rediscover
 *      it as one.
 *
 *      node scripts/i18n-attr-audit.mjs            # the list
 *      node scripts/i18n-attr-audit.mjs --json     # for the gate
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { parseAll, context, shapeOf, exposedHelpers } from './i18n-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'admin.html'];

/* the attributes a reader can SEE or HEAR, and the key that translates each one */
const ATTRS = {
  title: 'data-i18n-title',
  'aria-label': 'data-i18n-aria',
  placeholder: 'data-i18n-ph',
  alt: 'data-i18n-alt',
};
/* …and the DOM PROPERTY each one is spelled as when JavaScript assigns it instead (#R459) */
const PROPS = { title: 'title', ariaLabel: 'aria-label', placeholder: 'placeholder', alt: 'alt' };

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
  /* ⚠ (#R459) …AND THE SAME PROPER NOUN WITH PUNCTUATION AROUND IT IS STILL A PROPER NOUN. The
     markup universe only ever held the bare word; a string that JS BUILDS holds the decoration too
     — `document.title = 'IntMap — ' + title` on both reading pages, where `title` is the translated
     half and `IntMap — ` is a brand and an em-dash. Neither bracket may contain a latin letter, so
     `IntMap — Explore the world` is still reported. */
  /^[^A-Za-z]*(IntMap|Atlas|OpenStreetMap|MapLibre|Cesium|GitHub|Stripe|Supabase|USGS|NASA|NOAA|Esri|Maxar)[^A-Za-z]*$/i,
  /* ⚠ (#R459) A LONE SYMBOL — one latin letter, whatever punctuation sits around it: `m` on the
     sea-level box, `°C`. A unit symbol is fixed by BIPM/ICAO rather than by language, and the
     legend beside that box already prints `+70 m` as its own visible text. No tooltip in this app
     is one letter long, so the class cannot admit prose. */
  /^[^A-Za-z]*[A-Za-z][^A-Za-z]*$/,
  /* ⚠ (#R459) A BARE ALL-CAPS INSTRUMENT TOKEN — `PAPI` and `ILS` on the flight HUD. The header
     above already names this class («a bare technical token»); the markup universe simply never
     contained one. Both are ICAO abbreviations a cockpit shows in every country, and each sits
     beside a VISIBLE label spelling the same letters, so translating the tooltip while the label
     stays `PAPI` would leave one control disagreeing with itself — the exact shape this round is
     about. ⚠ THE 4-CHARACTER CEILING IS THE SAFETY OF THE CLASS: an abbreviation fits under it and
     a shouted English word does not (`CLOSE` 5, `REMOVE` 6, `SEARCH` 6). Widen it only after
     measuring what the wider class would swallow. */
  /^[A-Z][A-Z0-9]{1,3}$/,
];
/* ⚠ (#R459) ONE MORE CLASS, AND ONLY BECAUSE THE SECOND UNIVERSE CAN PRODUCE IT. A value a string
   BUILDS is constant text with a hole in it (`${…}` → EXPR below), so a unit that trails a computed
   number — `1 234 km`, `12 %` — arrives as «hole, space, km» and the numeric class above cannot
   match it: that class is anchored on a digit and the digit is inside the hole. This is the same
   «a number with a unit» exemption, said about the shape the hole leaves behind. */
const EXPR = '\u0001';
const EXEMPT_BUILT = [
  new RegExp('^[^A-Za-z]*' + EXPR + '[^A-Za-z]*(?:[A-Za-z]{1,4}[^A-Za-z]*)?$'),
];
const exempt = (v) => EXEMPT.some((re) => re.test(v.trim()))
  || (v.includes(EXPR) && EXEMPT_BUILT.some((re) => re.test(v.trim())));

/* one pass over every start tag: the attribute soup of a tag is small and this file is ours */
const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;

/* ⚠ (#R459) ONE SCANNER, TWO UNIVERSES. `index.html` is markup on disk and js/*.js builds markup
   into strings; the QUESTION is the same one, so the reader of it is one function and cannot answer
   differently on the two of them. */
export function scanMarkup(text, emit) {
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
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
      emit({ offset: m.index, tag: m[1], attr: name, text: v.trim() });
    }
  }
}

const findings = [];

/* ── ① markup on disk ─────────────────────────────────────────────────────────────────────────── */
for (const f of FILES) {
  let src = '';
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch (_) { continue; }
  /* line number for a character offset, so a finding can be opened */
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  scanMarkup(src, (x) => findings.push({ file: f, line: lineAt(x.offset), tag: x.tag, attr: x.attr, text: x.text }));
}

/* ── ②③ what JavaScript writes ────────────────────────────────────────────────────────────────── */

/* the CONSTANT text of an expression, with every part that is not constant replaced by EXPR.
   `null` when there is no constant text to judge at all — an identifier, a call, a lookup. */
export function constText(n) {
  if (!n) return null;
  if (n.type === 'Literal') return typeof n.value === 'string' ? n.value : EXPR;
  if (n.type === 'TemplateLiteral') return n.quasis.map((q) => (q.value.cooked ?? q.value.raw)).join(EXPR);
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const l = constText(n.left), r = constText(n.right);
    if (l == null && r == null) return null;
    return (l == null ? EXPR : l) + (r == null ? EXPR : r);
  }
  return null;
}

/* ⚠⚠⚠ (#R459) AND THE TAG DOES NOT HAVE TO FIT IN ONE STRING. A start tag this app builds is
   routinely spread across a `+` chain, with the constant parts in the literals and a value in
   between —

       '<input id="acled-email" type="email" placeholder="email" value="' + esc(cred.email) + '">'

   — so a scanner that looks at each literal ALONE sees `<input … value="` with no `>` and reports
   nothing. Two live findings hid in exactly that shape. The chain is therefore flattened FIRST and
   scanned as one text; the pieces it swallowed are skipped by the walk so nothing is counted twice.

   `flatten` returns the constant text AND, for every constant piece, where that piece starts in the
   source — so an offset in the flattened text still names a real line. A finding nobody can open is
   half a finding, and a template that builds a panel runs over a dozen lines. */
export function flatten(n) {
  const spans = [];
  let text = '';
  (function walkOne(x) {
    if (!x) { text += EXPR; return; }
    if (x.type === 'Literal') {
      if (typeof x.value !== 'string') { text += EXPR; return; }
      spans.push({ from: text.length, line: x.loc.start.line, text: x.value });
      text += x.value;
      return;
    }
    if (x.type === 'TemplateLiteral') {
      x.quasis.forEach((q, i) => {
        const s = q.value.cooked ?? q.value.raw;
        spans.push({ from: text.length, line: q.loc.start.line, text: s });
        text += s;
        if (i < x.expressions.length) text += EXPR;
      });
      return;
    }
    if (x.type === 'BinaryExpression' && x.operator === '+') { walkOne(x.left); walkOne(x.right); return; }
    text += EXPR;
  })(n);
  const lineAt = (offset) => {
    let best = null;
    for (const s of spans) { if (s.from <= offset) best = s; else break; }
    if (!best) return n.loc.start.line;
    const local = Math.max(0, Math.min(offset - best.from, best.text.length));
    return best.line + (best.text.slice(0, local).match(/\n/g) || []).length;
  };
  return { text, lineAt };
}

/* the top of a `+` chain, a template or a string is scanned; a piece INSIDE one is not */
const swallowed = (anc) => {
  const parent = anc[anc.length - 2];
  return !!parent && parent.type === 'BinaryExpression' && parent.operator === '+';
};

/* every constant string one expression can put on screen — both arms of a choice, both sides of a
   fallback. `on ? 'Hide' : 'Show'` is two English strings, not one dynamic value. */
export function constants(n) {
  if (!n) return [];
  if (n.type === 'ConditionalExpression') return [...constants(n.consequent), ...constants(n.alternate)];
  if (n.type === 'LogicalExpression') return [...constants(n.left), ...constants(n.right)];
  const t = constText(n);
  return t == null ? [] : [t];
}

/* ⚠⚠ DOES A TRANSLATION CALL REACH THIS VALUE? If one does, the string is in the system and a
   report here would be the same quantity counted twice ([[intmap-recurring-lessons]] G).
   `shapeOf()` is scripts/i18n-helpers.mjs's ONE answer to «is this a translation call», so this
   file cannot come to mean something different by it than its five siblings do.

   ⚠⚠⚠ (#R459) AND «A CALL» IS THE WHOLE TEST — NAMING THE LANGUAGE IS NOT ENOUGH. The first draft
   also waved through any expression that mentioned `lang`, on the theory that a hand-written
   `HOST.lang==='jp'? … : …` ladder belongs to scripts/i18n-two-branch-audit.mjs. Measured: that
   hatch was covering exactly ONE site in the whole repository — js/tool-panel.js's minimise button
   — and no sibling instrument could see it either. That audit matches single-quoted BRANCHES, and
   this ladder's branches are themselves conditionals (`on ? '展開' : '最小化'`), so it fell through
   every net while naming five of the nine languages: fr, ko and both Chinese readers were told
   «Expand». A hatch that protects one thing, and that thing is the defect, is not a hatch. */
export function reachesTranslation(n, ctx) {
  let hit = false;
  (function scan(x) {
    if (hit || !x || typeof x.type !== 'string') return;
    if (shapeOf(x, ctx) >= 0) { hit = true; return; }
    for (const k of Object.keys(x)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      const v = x[k];
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v.type === 'string') scan(v);
    }
  })(n);
  return hit;
}

/* ⚠⚠⚠ (#R459) THE JS PASS IS A FUNCTION OF A SOURCE, NOT OF THE REPOSITORY — and that is what lets
   a regression check FIRE. A check that can only assert «the repo is at zero» is indistinguishable
   from a check that passed for the wrong reason: it was green for 216 rounds while
   `tg.title='Layers'` shipped, because zero was all the instrument could ever say. Handed the three
   defect lines as they were WRITTEN, this returns 3 — see tests/r459-checks.test.mjs. */
export function scanSource(src, rel = '(source)', ctx = null) {
  const out = [];
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
  scanAst(ast, ctx || { src, names: new Set(), exposed: exposedHelpers() }, rel, out);
  return out;
}

function scanAst(ast, ctx, rel, findings) {
  const judge = (attr, value, at, shape) => {
    if (reachesTranslation(value, ctx)) return;
    for (const text of constants(value)) {
      if (exempt(text)) continue;
      findings.push({ file: rel, line: at.loc.start.line, tag: shape, attr, text: text.trim(), runtime: true });
    }
  };
  const built = (n, anc) => {
    if (swallowed(anc)) return;                    /* a piece of a bigger chain — scanned with it */
    const { text, lineAt } = flatten(n);
    scanMarkup(text, (x) => findings.push({ file: rel, line: lineAt(x.offset), tag: x.tag, attr: x.attr, text: x.text, runtime: true }));
  };
  walk.ancestor(ast, {
    /* ③ `el.title = …` / `el.ariaLabel = …` */
    AssignmentExpression(n) {
      if (n.operator !== '=') return;
      const l = n.left;
      if (l.type !== 'MemberExpression' || l.computed || !l.property) return;
      const attr = PROPS[l.property.name];
      if (!attr) return;
      judge(attr, n.right, n, '.' + l.property.name + '=');
    },
    /* ③ `el.setAttribute('aria-label', …)` */
    CallExpression(n) {
      const c = n.callee;
      if (c.type !== 'MemberExpression' || c.computed || !c.property || c.property.name !== 'setAttribute') return;
      const a0 = n.arguments[0];
      if (!a0 || a0.type !== 'Literal' || typeof a0.value !== 'string') return;
      const attr = a0.value.toLowerCase();
      if (!(attr in ATTRS)) return;
      judge(attr, n.arguments[1], n, "setAttribute('" + attr + "')");
    },
    /* ② markup a string builds — a `+` chain, a template, or a plain literal. A `${…}` is a hole,
       so a nested template is scanned as itself when the walk reaches it, never twice. */
    BinaryExpression(n, _st, anc) { if (n.operator === '+') built(n, anc); },
    TemplateLiteral(n, _st, anc) { built(n, anc); },
    Literal(n, _st, anc) { if (typeof n.value === 'string') built(n, anc); },
  });
  return findings;
}

/* every file in js/, through the same function */
for (const [file, { ast }] of parseAll()) {
  const ctx = context(file, 'loose');
  if (ctx) scanAst(ast, ctx, 'js/' + file, findings);
}

export { findings };

/* ── run directly: the list ──────────────────────────────────────────────────────────────────────
   ⚠ (#R459) GUARDED, because this file now EXPORTS the scanner it used to only run. An unguarded
   `process.exit(0)` at module scope kills whatever imports it — tests/r459-checks.test.mjs proves
   the widened universe by feeding this scanner a source of its own, and an import that exits is not
   a thing a test can call. Same shape as scripts/i18n-helpers.mjs's own tail. */
if (process.argv[1] && process.argv[1].endsWith('i18n-attr-audit.mjs')) {
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
    xs.forEach((x) => console.log('      ' + x.file + ':' + x.line + '  <' + x.tag + ' ' + x.attr + '>  → '
      + (x.runtime ? 'translate it where it is written' : 'add ' + ATTRS[x.attr] + '="…"')));
  });
  console.log(`\n${findings.length} attribute(s), ${byText.size} distinct string(s).`);
}
