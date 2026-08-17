/* ============================================================================
 *  IntMap · ⚠⚠⚠ WHICH CALLS ARE TRANSLATION CALLS — ONE ANSWER, REPO-WIDE   (#R251)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ ⚠⚠⚠ THE SIXTEENTH SHAPE, AND WHY IT WAS A *SCOPE* BUG RATHER THAN A NEW SHAPE ══════════════
 *  Fifteen shapes have been closed by writing a new detector for a new way of *spelling* a
 *  translation. The sixteenth is not a new spelling at all — it is the SAME spelling, read through
 *  a property of another module's host object:
 *
 *      js/app-body.js      const _coL = window.IntMapLang.pick(() => currentLang);
 *                          …  get _coL(){ return _coL; }          ← handed to every submodule
 *      js/companies-ui.js  HOST._coL('Market cap','時価総額','Marktkap.','Капитализация','Cap. bursátil')
 *
 *  That IS a five-argument translation call, and de/ru/es are right there in it. But every
 *  instrument resolved «is this name a helper?» FROM THE FILE IT IS READING, and `_coL` is not
 *  bound in js/companies-ui.js — it is bound in js/app-body.js. So:
 *
 *    · scripts/i18n-report.mjs never added the string to the inline universe → fr / ko / zh /
 *      zh-hans had no row to translate, and rendered ENGLISH, while the gate printed 100 %;
 *    · scripts/i18n-positional-audit.mjs never checked the German argument;
 *    · scripts/i18n-pair-audit.mjs, which resolves «already a translation call» from the file too,
 *      reported all 55 of js/companies-ui.js's correct calls as an OPEN GAP.
 *
 *  Two instruments blind and one crying wolf, from one cause: **a per-file question asked about a
 *  repo-wide fact**. Widening any one of them would have moved the blind spot rather than closing
 *  it ([[intmap-recurring-lessons]] B), so the resolution moved HERE, once, and the three
 *  instruments import it. A seventeenth way of reaching the registry is now one edit, in one file,
 *  and every surface picks it up together.
 *
 *  ══ WHAT COUNTS AS A TRANSLATION CALL ══════════════════════════════════════════════════════════
 *  STRICT — the callee resolves to `IntMapLang.pick()` / `.pickArgs()` / `.t`, so argument 0 (or 1,
 *  after `t()`'s language argument) IS the English source string. This is the universe the inline
 *  report and the positional audit measure.
 *    ① a local name bound to it                    const L  = window.IntMapLang.pick(…)
 *    ② …bound to the array form                    const LA = window.IntMapLang.pickArgs()
 *    ③ `IntMapLang.t(lang, en, …)`                 English at index 1
 *    ④ ⚠ NEW — a PROPERTY that is bound to one of the above anywhere in js/, called off any object
 *       (`HOST._coL(…)`, `W.L(…)`). The property name is collected repo-wide; the object is not
 *       inspected, because the same helper is handed round under a dozen names for `HOST`.
 *    ⑤ `L`, which is the convention when the toolkit is destructured.
 *
 *  LOOSE — additionally, anything that REACHES the registry however indirectly: a local function
 *  whose own body names `IntMapLang`, or a name destructured out of js/world-packs.js's `_ui`.
 *  Argument 0 is not necessarily the English string, so this universe is only good for answering
 *  «is this already a translation call?» — which is exactly what scripts/i18n-pair-audit.mjs asks
 *  before reporting an adjacent pair.
 *
 *      node scripts/i18n-helpers.mjs          # what it resolved, as a report
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');

/* ── parse every file in js/ once ───────────────────────────────────────────────────────────────
   ⚠ NO SUBSTRING PRE-FILTER, for the reason scripts/i18n-report.mjs records at length: js/ocean-
   currents.js spells its helper `const { …, L } = W;` and matches none of the obvious spellings.
   Parsing ~130 files costs a fraction of a second; guessing costs a silent gap. */
let _cache = null;
export function parseAll() {
  if (_cache) return _cache;
  const out = new Map();
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js')).sort()) {
    const src = readFileSync(join(JS, f), 'utf8');
    let ast;
    /* `locations` so scripts/i18n-positional-audit.mjs can report a line without re-parsing */
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
    catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }
    out.set(f, { src, ast });
  }
  _cache = out;
  return out;
}

/* the dotted source text of whatever a name is bound to — `window.IntMapLang.pick(…)` → `window.IntMapLang.pick` */
function boundTo(n) {
  let s = '', cur = n;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur.type === 'CallExpression') { cur = cur.callee; continue; }
    if (cur.type === 'LogicalExpression') { cur = cur.right; continue; }
    if (cur.type === 'MemberExpression') { s = '.' + (cur.property.name || cur.property.value) + s; cur = cur.object; continue; }
    if (cur.type === 'Identifier') { s = cur.name + s; }
    break;
  }
  return s;
}
/* ⚠⚠ A HELPER IS NOT THE SAME THING AS A HELPER'S RESULT, and `boundTo()` cannot tell them apart on
   its own — it walks through CallExpression to the callee, so `el.textContent = IntMapLang.t(lang,…)`
   reports `IntMapLang.t` just as `const T = IntMapLang.t` does. The first is a STRING. An early
   draft of this file did not separate them and collected `textContent`, `innerHTML`, `title` and
   `name` as «helper property names» — which would have exempted every DOM assignment in the repo
   from the pair audit. So the two cases are asked separately:
     · CALLED  — `pick(…)` and `pickArgs(…)` RETURN a helper; `t(…)` returns a translated string.
     · UNCALLED — the bare member `IntMapLang.t` / `.pick` / `.pickArgs` IS the helper. */
/* ⚠⚠⚠ AND THE BINDING IS TRANSITIVE, WHICH IS THE WHOLE POINT OF RESOLVING IT REPO-WIDE.
   The registry is handed down a chain, not read from a global at each site:
       js/app-body.js        const _coL = window.IntMapLang.pick(…)   → exposed as `_coL`
       js/companies-ui.js    const L = HOST._coL                      → `L` here IS the helper
       js/atlas-sims.js      const L = CTX.L                          → …and so is this one
   Resolving only the FIRST link (what is bound directly to `IntMapLang.*`) leaves the second and
   third links looking like ordinary locals, so a rule that withholds the conventional `L` from a
   file that binds it would drop js/atlas-*.js and js/companies-ui.js out of every measurement —
   34 strings, silently, while the report went UP. So `exposed` is computed to a FIXED POINT: each
   pass may prove a new property name, which may prove a new local name, until nothing changes. */
const bindsHelper = (n, exposed) => {
  if (!n) return false;
  if (n.type === 'LogicalExpression') return bindsHelper(n.left, exposed) || bindsHelper(n.right, exposed);
  /* `const L = (IntMapLang && IntMapLang.pick) ? IntMapLang.pick(…) : fallback` — js/basemap-switch.js */
  if (n.type === 'ConditionalExpression') return bindsHelper(n.consequent, exposed) || bindsHelper(n.alternate, exposed);
  if (n.type === 'CallExpression') return /IntMapLang\.pick(Args)?$/.test(boundTo(n.callee));
  if (n.type === 'MemberExpression') {
    if (/IntMapLang\.(pick|pickArgs|t)$/.test(boundTo(n))) return true;
    /* `CTX.L`, `HOST._coL` — a property already proven to carry a helper somewhere in js/ */
    return !!(exposed && !n.computed && n.property && exposed.has(n.property.name));
  }
  return false;
};

/* ⚠ PROVEN bindings only — no conventional names. `L` is seeded into the CALL-SITE universe below
   because that is the repo's convention for the destructured toolkit, but a convention is not proof,
   and using it as proof is how `rec.imagery = L` in js/cesium-engine.js (an imagery layer, named L)
   claimed that `.imagery(…)` is a translation call everywhere in js/. */
function provenNames(src, ast, exposed) {
  const names = new Set();
  walk.simple(ast, {
    VariableDeclarator(d) { if (d.id.type === 'Identifier' && bindsHelper(d.init, exposed)) names.add(d.id.name); },
    AssignmentExpression(a) { if (a.left.type === 'Identifier' && bindsHelper(a.right, exposed)) names.add(a.left.name); },
  });
  return names;
}

/* ── ① the strict local names, per file ──────────────────────────────────────────────────────────
   `L` is the repo's conventional name for the destructured toolkit and files that never bind it
   still call it, so it is seeded — but ⚠ ONLY WHERE THE FILE HAS NOT BOUND IT TO SOMETHING ELSE.
   js/i18n-late.js writes `const L=(k)=>i18n[HOST.lang][k]`, a KEYED lookup whose argument is a key
   and not an English string; seeding over that binding put `'tkgFx'`, `'tkgIdx'`, `'tkgCom'`,
   `'tkgCrypto'`, `'tkItems'` and `'tkNews'` into the inline universe as if they were prose, and
   reported all six as call sites missing their German. A name the file has explicitly bound to a
   non-helper is not the toolkit, whatever it is called. */
function strictNames(src, ast, exposed) {
  const names = provenNames(src, ast, exposed);
  const shadowed = new Set();
  walk.simple(ast, {
    VariableDeclarator(d) { if (d.id.type === 'Identifier' && d.init && !names.has(d.id.name)) shadowed.add(d.id.name); },
    FunctionDeclaration(d) { if (d.id && !names.has(d.id.name)) shadowed.add(d.id.name); },
  });
  if (!shadowed.has('L')) names.add('L');
  walk.simple(ast, {
    Property(p) { if (p.key && p.key.name === 'L') names.add(p.value && p.value.name ? p.value.name : 'L'); },
  });
  return names;
}

/* ── ② the loose ones: anything that reaches the registry at all ───────────────────────────────── */
function looseNames(src, ast, strict) {
  const names = new Set(strict);
  const uiHolders = new Set();
  walk.simple(ast, {
    VariableDeclarator(d) {
      if (!d.init) return;
      if (d.id.type === 'Identifier') {
        if (/IntMapWorld\._ui$/.test(boundTo(d.init))) uiHolders.add(d.id.name);
        if ((d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
          && src.slice(d.init.start, d.init.end).includes('IntMapLang')) names.add(d.id.name);
      } else if (d.id.type === 'ObjectPattern' && d.init.type === 'Identifier' && uiHolders.has(d.init.name)) {
        for (const p of d.id.properties) {
          const v = p.value && p.value.type === 'Identifier' ? p.value : (p.key && p.key.type === 'Identifier' ? p.key : null);
          if (v) names.add(v.name);
        }
      }
    },
    FunctionDeclaration(d) { if (d.id && src.slice(d.start, d.end).includes('IntMapLang')) names.add(d.id.name); },
  });
  return names;
}

/* ── ③ ⚠ THE REPO-WIDE PART — property names a helper is handed over under ─────────────────────── */
/* Only the three shapes that PROVABLY carry a helper: the property's value is a helper identifier,
   a getter whose entire body returns one, or the `pick()` call itself. Anything looser sweeps in
   whole modules — an early draft of this matched «the initialiser mentions IntMapLang» and collected
   108 names including `IntMapWorld` and `flightSim`, because a module factory's body naturally
   mentions the registry. That would have exempted arbitrary calls from the pair audit, which is
   #R244's langmap codemod breaking a working feature all over again. */
let _exposed = null;
export function exposedHelpers() {
  if (_exposed) return _exposed;
  const asts = parseAll();
  let out = new Set(['L']);
  /* fixed point — each pass may prove a property, which may prove a local, which exposes another */
  for (let pass = 0; pass < 8; pass++) {
    const next = onePass(asts, out);
    if (next.size === out.size) { out = next; break; }
    out = next;
  }
  _exposed = out;
  return out;
}
function onePass(asts, exposed) {
  const out = new Set(exposed);
  for (const [, { src, ast }] of asts) {
    const names = provenNames(src, ast, exposed);
    walk.simple(ast, {
      Property(p) {
        const key = p.key ? (p.key.name || p.key.value) : null;
        if (!key || !p.value) return;
        if (p.value.type === 'Identifier' && names.has(p.value.name)) { out.add(key); return; }
        if (p.kind === 'get' && p.value.type === 'FunctionExpression' && p.value.body.body.length === 1) {
          const st = p.value.body.body[0];
          if (st.type === 'ReturnStatement' && st.argument && st.argument.type === 'Identifier' && names.has(st.argument.name)) out.add(key);
          return;
        }
        if (bindsHelper(p.value, exposed)) out.add(key);
      },
      AssignmentExpression(a) {
        if (a.left.type !== 'MemberExpression' || a.left.computed || !a.left.property || !a.right) return;
        const key = a.left.property.name;
        if (!key) return;
        if (a.right.type === 'Identifier' && names.has(a.right.name)) out.add(key);
        else if (bindsHelper(a.right, exposed)) out.add(key);
      },
    });
  }
  return out;
}

/* ── the API the three instruments use ──────────────────────────────────────────────────────────
   `shapeOf(node, ctx)` → the index of the ENGLISH argument, or -1 if this is not a translation
   call. One function, so «what is a translation call» cannot differ between two instruments. */
export function context(file, mode /* 'strict' | 'loose' */) {
  const asts = parseAll();
  const e = asts.get(file);
  if (!e) return null;
  const exposed = exposedHelpers();
  const strict = strictNames(e.src, e.ast, exposed);
  return {
    src: e.src,
    ast: e.ast,
    names: mode === 'loose' ? looseNames(e.src, e.ast, strict) : strict,
    exposed,
  };
}

export function shapeOf(n, ctx) {
  if (!n || n.type !== 'CallExpression' || !n.callee) return -1;
  const c = n.callee;
  if (c.type === 'Identifier' && ctx.names.has(c.name)) return 0;
  if (c.type === 'MemberExpression' && !c.computed && c.property) {
    /* `IntMapLang.t(lang, en, …)` — the language is argument 0, so English is at 1 */
    if (c.property.name === 't' && /IntMapLang$/.test(ctx.src.slice(c.object.start, c.object.end))) return 1;
    /* ⚠ the sixteenth shape — a helper reached through a property, bound in some OTHER file */
    if (ctx.exposed.has(c.property.name)) return 0;
  }
  return -1;
}

/* ── run directly: what it resolved ─────────────────────────────────────────────────────────────── */
if (process.argv[1] && process.argv[1].endsWith('i18n-helpers.mjs')) {
  const asts = parseAll();
  const exposed = exposedHelpers();
  console.log(`js/ files parsed: ${asts.size}`);
  console.log(`helper property names, resolved repo-wide (${exposed.size}): ${[...exposed].sort().join(', ')}`);
  let sites = 0, viaProp = 0;
  for (const f of asts.keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const i = shapeOf(n, ctx);
        if (i < 0) return;
        sites++;
        if (n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name !== 't'
          && !ctx.names.has(n.callee.property.name)) viaProp++;
      },
    });
  }
  console.log(`translation call sites: ${sites} (${viaProp} of them reached through a property)`);
}
