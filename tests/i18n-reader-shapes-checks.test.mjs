/* ============================================================================
 *  IntMap · how translations are READ — the shapes that silently fall back to English, and the
 *  instruments that forbid them (js/**, scripts/i18n-*.mjs, the zh-hans generator, the language event)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r248-checks ①, tests/r246-checks ①②③⑥⑦⑧, tests/r224-checks ④ and
 *  tests/r428-checks ②.
 *
 *  #R248 ① the fourteenth translation shape — a language→POSITION map written as a ternary chain — is
 *     forbidden by SYNTAX, and the instrument that forbids it is shown to fire on the code it was
 *     written for (#R228: a check that has never failed is not a check).
 *  #R246 「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *     いつまでたっても言語対応の漏れが見つかることは許されない。」
 *     ⚠ Every #R246 test below was run against the UNFIXED file first and fails there (#R228's rule).
 *  #R224 ④ the seventh language is derived, not copied.
 *  #R428 ② 言語を切り替えると、カテゴリ chip だけが 5.9〜6.7 秒 英語のまま残る（本番実測 3 回）。
 *     `setLang()` は `intmap-lang` を投げるのに `js/news-events.js` が聞いていなかった。chip の語は
 *     **描画時**に評価されるので、次の描画（＝`news_events` の再取得のあと）まで前の言語が残る。
 *     ⚠ **再描画ではなく貼り替え**である。`renderChips()` は件数を `HOST.globalData` から読むが、
 *     言語切替はそれを空にした直後なので、ここで再描画すると「全カテゴリ 0」だけの行になる。
 *
 *  ⚠ Every assertion below reads the source with COMMENTS STRIPPED where it matches on text
 *  (scripts/code-only.mjs) — [[intmap-recurring-lessons]] E has caught eight rounds writing a check
 *  that trips on its own explanation of the defect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = pathToFileURL(ROOT + '/');
const JS = join(ROOT, 'js');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rd = read;
/* comments off, strings kept — the only safe way to grep this repository's own source */
const code = codeOnly;
const json = (script, args = []) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', script), '--json', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const events = read('js/news-events.js');
const body = read('js/app-body.js');

const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']);
function indexChains(src) {
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
  const intish = (x) => x && x.type === 'Literal' && typeof x.value === 'number' && Number.isInteger(x.value);
  const langTest = (x) => x && x.type === 'BinaryExpression' && (x.operator === '===' || x.operator === '==')
    && [x.left, x.right].some((s) => s.type === 'Literal' && typeof s.value === 'string' && CODES.has(s.value));
  const out = [];
  walk.simple(ast, {
    ConditionalExpression(n) {
      if (!langTest(n.test) || !intish(n.consequent)) return;
      const a = n.alternate;
      if (!(a && a.type === 'ConditionalExpression' && langTest(a.test) && intish(a.consequent))) return;
      out.push(n.loc.start.line);
    },
  });
  return out;
}

test('#R248 ① no reader turns a language into an array position with a ternary chain', () => {
  const bad = [];
  (function walkDir(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walkDir(join(dir, e.name), rel + e.name + '/'); continue; }
      if (!e.name.endsWith('.js')) continue;
      const p = rel + e.name;
      if (/locales\//.test(p)) continue;
      const lines = indexChains(readFileSync(join(dir, e.name), 'utf8'));
      if (lines.length) bad.push(`${p}:${[...new Set(lines)].join(',')}`);
    }
  })(JS, 'js/');
  assert.deepEqual(bad, [], 'a language→index ternary chain never reaches the registry, so every '
    + 'language past its last arm reads English with NO inline-table fallback — use pick().arr(tuple)');
});

test('#R248 ① …and that test FIRES on the shape it was written for (#R228)', () => {
  /* A check that has never failed is not a check (#R180 / #R200 / #R228). This is the exact reader
     js/drone-nav.js held four copies of before this round, and three innocent neighbours that must
     NOT be reported — a single language ternary with numeric arms is an offset, not a table. */
  const defect = "const specLabel=(f)=>f.lbl[HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0];";
  assert.ok(indexChains(defect).length > 0, 'the fourteenth-shape detector must fire on the shape');
  assert.equal(indexChains("const pad=(lang==='jp'?2:0);").length, 0, 'one ternary is an offset, not a language table');
  assert.equal(indexChains("const w=lang==='jp'?'A':'B';").length, 0, 'string arms are the two-branch audit\'s subject');
  /* ⚠ ONE hit, not two: the detector reports the OUTERMOST node of a chain (the inner ternary's own
     alternate is the integer `0`, not another ternary), so a chain is one finding however long it
     is. And it fires on any expression compared against a language code — the variable's name is
     not part of the test, deliberately: `HOST.lang`, `L()`, `lang` and `cur` are all the same
     defect, and a name list is the maintenance surface this family of instruments exists to remove. */
  assert.equal(indexChains("const n=cols==='jp'?1:rows==='de'?2:0;").length, 1,
    'a chain is ONE finding, and the name being compared is not part of the test');
});

test('#R248 ① the pair codemod refuses to file a matcher as UI, and refuses a non-translation slot', () => {
  /* ⚠ READ, NOT RUN: the codemod is a one-shot rewriting tool; the three guards are asked of its source rather than re-running it over the tree. */
  const s = code(read('scripts/i18n-pair-codemod.mjs'));
  assert.match(s, /parent\.elements\[0\] === n/, 'element 0 of a coordinate-bearing row is a match-term list, not a tuple');
  assert.match(s, /LETTER\.test/, 'a slot with no letter of any alphabet (🇺🇸, #6b6b6b) is not a translation');
  assert.match(s, /if \(JA\.test\(el\[0\]\.value\) \|\| !isProse\(el\[0\]\.value\)\) return;/,
    'the tuple has to start at slot 0 in the registry\'s own order, or LA() would relabel the slots');
});

test('#R248 ① every LA( reference resolves to a binding IN SCOPE, not merely earlier in the file', () => {
  /* ⚠ THE ONE DEFECT THIS ROUND SHIPPED TO THE BROWSER AND NO NODE CHECK SAW. The codemod picked the
     nearest pickArgs binding BY POSITION; js/layer-packs.js has four sibling IIFEs and the fourth got
     a name from a sibling, so `ReferenceError: LA is not defined` killed the religion/language pack
     at module evaluation while all 1,180 checks stayed green ([[intmap-recurring-lessons]] L). This
     is that check, written once so it covers every file rather than the one that broke. */
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'Program']);
  const bad = [];
  (function walkDir(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walkDir(join(dir, e.name), rel + e.name + '/'); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = readFileSync(join(dir, e.name), 'utf8');
      let ast;
      try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
      catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }
      const scopes = new Map();
      const declare = (node, name, anc, from) => {
        for (let i = anc.length - from; i >= 0; i--) {
          if (FN.has(anc[i].type)) { if (!scopes.has(anc[i])) scopes.set(anc[i], new Set()); scopes.get(anc[i]).add(name); return; }
        }
      };
      walk.ancestor(ast, {
        VariableDeclarator(n, _s, anc) { if (n.id.type === 'Identifier') declare(n, n.id.name, anc, 1); },
        FunctionDeclaration(n, _s, anc) { if (n.id) declare(n, n.id.name, anc, 2); },
      });
      walk.ancestor(ast, {
        CallExpression(n, _s, anc) {
          const c = n.callee;
          const name = c.type === 'Identifier' ? c.name
            : (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' ? c.object.name : null);
          if (name !== 'LA') return;
          for (let i = anc.length - 1; i >= 0; i--) {
            const a = anc[i];
            if (!FN.has(a.type)) continue;
            if (a.params && a.params.some((p) => p.type === 'Identifier' && p.name === name)) return;
            const s = scopes.get(a);
            if (s && s.has(name)) return;
          }
          bad.push(`${rel}${e.name}:${n.loc.start.line}`);
        },
      });
    }
  })(JS, 'js/');
  assert.deepEqual(bad, [], 'an LA() whose binding lives in a SIBLING scope throws at module '
    + 'evaluation and takes the whole file down — declare one at the top of the scope that uses it');
});

/* ══════════════════ #R246 — every language, every surface ══════════════════ */
/* ── ① THE ELEVENTH SHAPE IS ZERO, AND EVERY CONVERTED READER GOES THROUGH pick() ──────────── */
test('r246 ① the language-keyed object is gone from js/, and its readers resolve through pick()', () => {
  /* ⚠ READ, NOT RUN: the audit half is run; the reader half names twelve call sites inside DOM factories, which only a page executes. */
  assert.equal(json('i18n-langmap-audit.mjs').total, 0, 'a translation tuple is still keyed by language code');
  /* ⚠ CONVERTING THE DATA IS HALF THE JOB. `LA(…)` only reaches fr/ko/zh/zh-Hans if the READER is
     `pick().arr(…)`; a reader left as `x[lang] || x.en` would make the audit green and the screen
     English — which is exactly [[intmap-recurring-lessons]] B. These are the sites this round moved. */
  for (const [file, re] of [
    ['js/map-tools.js', /LP\.arr\(PROJS\[cur\]\.name\)/],
    ['js/night-sky.js', /L\.arr\(pl\.nm\)/],
    ['js/industry-web.js', /const indName = \(i\) => L\.arr\(i\.nm\)/],
    ['js/routing.js', /route:LSH\.arr\(seg\.Ln\.nm\)/],
    ['js/atlas-console.js', /const pick=o=>lx\(o\.n\)/],
    ['js/satellite.js', /LS\(\)\.arr\(pr\.name\)/],
    ['js/tool-panel.js', /\.arr\(grp\.g\)/],
    ['js/community-board.js', /\.arr\(c\.label\)/],
    ['js/companies-ui.js', /\.arr\(e\)\)\|\|b/],
    ['js/news-sources.js', /LNS\.arr\(f\.name\)/],
    /* (#R289) `V(L)` resolves a MODAL entry (CO₂ total ↔ per capita) to the mode that is showing;
       the reader is still `pick().arr(…)`, which is what this list is about. */
    ['js/wb-layers.js', /const bxLabel=\(L\)=> LWB\.arr\(V\(L\)\.n\)/],
    ['js/time-borders.js', /const n=_LTB\.arr\(E\[1\]\)/],
  ]) assert.match(code(read(file)), re, `${file} still reads its tuple without pick()`);
  /* the second table wb-layers kept for de/ru is gone — one name, one place (recurring-lessons G) */
  assert.equal(/BX_TR/.test(code(read('js/wb-layers.js'))), false, 'the second de/ru name table came back');
});

/* ── ② THE TWELFTH SHAPE IS MEASURED, AND THE MEASUREMENT IS IN THE ONE GATE ───────────────── */
test('r246 ② the adjacent-pair surface is measured and printed as an OPEN GAP', () => {
  const g = code(read('scripts/i18n-audit.mjs'));
  assert.match(g, /i18n-pair-audit\.mjs/, 'the one gate does not spawn the twelfth instrument');
  assert.match(g, /OPEN GAP — translation tuples held as ADJACENT DATA SLOTS/, 'and does not print its number');
  const j = json('i18n-pair-audit.mjs');
  assert.equal(typeof j.total, 'number', 'the instrument answers with a number');
  /* ⚠ THE RATCHET, AND THE REASON IT IS NOT A GATE. #R246 measured 2,262 containers in 37 files —
     more than one round can convert — and #R242's rule for that situation is that the number is
     PRINTED rather than gated, because a gate nobody can reach gets deleted by the next round.
     It may only go DOWN. When it reaches zero, promote it to `problems` in scripts/i18n-audit.mjs. */
  /* (#R247) 2,262 → 2,255. The ratchet only ever moves down; pin it to what the tree measures now. */
  assert.ok(j.total <= 2255, `the open gap grew to ${j.total} — write the new tuple as pickArgs() instead`);
  /* …and it must not be able to go green by mistaking a translation call for data */
  assert.match(read('scripts/i18n-pair-audit.mjs'), /function langNames\(ast, src\)/, 'the exemption is resolved per file');
});

/* ── ③ THE SOURCE REGISTRY'S PROSE HAS ONE HOME, AND IT IS INSIDE THE MEASURED UNIVERSE ────── */
test('r246 ③ every source description is a reading-page string, in every language the policy authors, and no carried language below its floor', async () => {
  /* ⚠ WHY THIS MOVED. scripts/i18n-pages-audit.mjs measures each language against every string PATH
     in the ENGLISH document. The English text used to live in js/reference-data.js (`use:{en,jp}`),
     so the de/ru/es `sourceUse` tables were outside the universe and the total ABSENCE of
     fr/ko/zh/zh-Hans read as 287/287 — 100 %, on a surface that was English for four languages. */
  const p = json('i18n-pages-audit.mjs');
  assert.ok(p.want >= 374, `the reading-page universe shrank to ${p.want} — sourceUse left pages.en.js`);
  /* ⚠ (licence-stated-once) THIS LINE KEPT A SECOND COPY OF THE LANGUAGE POLICY — «all nine, 100 %» —
     after CONSTITUTION.md §7 (2026-09-11) narrowed authoring to en+jp. It stayed green only because no
     round had added a reading-page string since; the first one (the licence names) turned it red for
     the seven carried languages. r239 ① met the same shape (#R707) and was fixed by DISTRIBUTING the
     judgement rather than copying it: scripts/lang-policy.mjs says who is authored (100 %) and who is
     carried (held at tests/i18n-coverage-floor.json's `pages`, which fails if a row is deleted). Restore
     the nine (`return all;` there) and this is «every language, 100 %» again with no edit here. */
  const { authoredLangs, carriedLangs } = await import('../scripts/lang-policy.mjs');
  const AUTHORED = new Set(authoredLangs(ROOT));
  const CARRIED = new Set(carriedLangs(ROOT));
  const FLOOR = JSON.parse(readFileSync(join(ROOT, 'tests', 'i18n-coverage-floor.json'), 'utf8')).langs;
  let authored = 0, carried = 0;
  for (const r of p.rows) {
    if (AUTHORED.has(r.code)) { assert.equal(r.have, r.want, `${r.code} is short on the reading pages — IntMap authors this language`); authored++; }
    else if (CARRIED.has(r.code)) {
      const f = (FLOOR[r.code] || {}).pages;
      assert.ok(f != null, `${r.code}: no reading-page floor recorded — the carried half would assert nothing`);
      assert.ok(r.have >= f, `${r.code}: reading pages fell to ${r.have}, below the floor of ${f}`);
      carried++;
    } else assert.fail(`${r.code} is neither authored nor carried by scripts/lang-policy.mjs`);
  }
  assert.ok(authored > 0 && carried > 0, 'r246 ③ measured nothing on one side');
  assert.match(read('js/locales/pages.en.js'), /\n {2}sourceUse: \{/, 'the English original is not a page string');
  /* …and the eager bundle no longer carries any of it */
  assert.equal(/use:\{en:/.test(read('js/reference-data.js')), false, 'the registry still holds prose');
  /* ⚠ (#R261) THE CEILING IS ON THE PROSE, NOT ON THE NUMBER OF SOURCES. This was a byte count, and
     #R261 registered eight more OSM facility layers — 8 `{n,u}` rows plus a comment, ~1.2 kB — which
     took the file from 38.9 kB to 40.3 kB and turned «the prose came back» red for «the map grew».
     The claim #R246 was making is the line above (no `use:{en:` in the registry); what this line
     adds is that a ROW is a name and a URL, not a paragraph. So it measures the mean row size, which
     the prose regressing would blow up and which adding sources cannot. (Measured now: ~110 chars a
     row against the ~330 the prose version carried.) */
  {
    /* ⚠ (#R700) COMMENTS ARE NOT ROWS, AND THIS WAS COUNTING THEM.
       The rule it exists to keep is 「a ROW is a name and a URL, not a paragraph」 — prose that a
       READER sees. #R700 added `lic:` / `cite:` to the CShapes row (CC BY-NC-SA 4.0 makes credit a
       condition of redistribution) and, with them, a 1,423-character comment explaining why the
       licence had to be a VALUE rather than part of `n`. That comment pushed the mean from 212 to
       225 and turned this red — while the reader-visible half was 114 chars a row, i.e. the ~110
       the paragraph above measured. A check that cannot tell an explanation from the thing it
       explains punishes the explaining, which is [[intmap-r621-lessons]]'s rule: strip the comments
       before you measure. `code()` is the same stripper the rest of this file already uses. */
    const reg = code(read('js/reference-data.js'));
    const arr = /const DATA_SOURCES=\[[\s\S]*?\n  \];/.exec(reg);
    assert.ok(arr, 'DATA_SOURCES is not a single array literal any more');
    const rows = (arr[0].match(/\{n:'/g) || []).length;
    assert.ok(rows > 100, `the registry holds only ${rows} sources`);
    const per = arr[0].length / rows;
    assert.ok(per < 220, `the registry averages ${Math.round(per)} chars a source — it is carrying prose again`);
  }
});

/* ── ⑥ A LANGUAGE'S NAME IS CLDR DATA, NOT A TABLE ─────────────────────────────────────────── */
test('r246 ⑥ the news-language names come from Intl.DisplayNames', () => {
  /* ⚠ READ, NOT RUN: the name table is built inside js/app-body.js, the app shell, which only runs in a page. */
  const s = code(read('js/app-body.js'));
  assert.equal(/NEWS_LANG_NAMES/.test(s), false, 'the eleven two-language objects came back');
  assert.match(s, /new Intl\.DisplayNames\(\[tag\],\{type:'language'\}\)/, 'the names are not read from CLDR');
  assert.match(s, /const NEWS_LANG_CODES=\['en','ja','fr','de','es','pt','it','ar','ru','zh','ko'\]/,
    'the eleven editions are no longer one list');
});

/* ── ⑧ A SECOND `const LA` IN AN ENCLOSED SCOPE IS A TEMPORAL DEAD ZONE ─────────────────────── */
test('r246 ⑧ no pickArgs/pick binding shadows one from an enclosing scope', async () => {
  /* ⚠ THIS IS A BUG THIS ROUND SHIPPED AND THE BROWSER SUITE CAUGHT. js/time-borders.js already
     bound `LA` at factory level (#R245); adding a second `const LA` just above `_ERA_LOC` — inside
     the same block, but BELOW `_VANISHED`, which #R245 had already converted — shadowed the outer
     one for the WHOLE block, so `_VANISHED`'s `LA(…)` ran in the temporal dead zone. Measured on the
     built app: `ReferenceError: Cannot access 'LA' before initialization` on every load.
     ⚠ THE SHAPE, NOT THE NAME: any binding of `IntMapLang.pick`/`pickArgs`/`t` counts, because the
     next round will pick a different letter. Sibling scopes are fine — js/layer-packs.js has four. */
  const { parse } = await import('acorn');
  const dir = join(ROOT, 'js');
  const { readdirSync } = await import('node:fs');
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    let ast;
    const src = read('js/' + f);
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
    catch (e) { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch (e2) { continue; } }
    const isLang = (n) => {
      let s = '', cur = n;
      for (let i = 0; i < 8 && cur; i++) {
        if (cur.type === 'CallExpression') { cur = cur.callee; continue; }
        if (cur.type === 'MemberExpression') { s = '.' + (cur.property.name || cur.property.value) + s; cur = cur.object; continue; }
        if (cur.type === 'Identifier') { s = cur.name + s; }
        break;
      }
      return /IntMapLang\.(pick|pickArgs|t)$/.test(s);
    };
    (function walk(node, stack) {
      if (!node || typeof node.type !== 'string') return;
      const opens = /Function|Program|BlockStatement|ForStatement|ForOfStatement|ForInStatement/.test(node.type);
      const scope = opens ? new Set() : null;
      const next = opens ? stack.concat([scope]) : stack;
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init && isLang(node.init)) {
        const name = node.id.name;
        if (stack.some((s) => s.has(name))) bad.push(`js/${f}:${node.loc.start.line} — \`${name}\` shadows an enclosing binding`);
        stack[stack.length - 1].add(name);
      }
      for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'range') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((x) => x && typeof x === 'object' && walk(x, next));
        else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, next);
      }
    })(ast, [new Set()]);
    assert.deepEqual(bad, [], 'a translation binding shadows an enclosing one:\n  ' + bad.join('\n  '));
  }
});

/* ── ⑦ «THE SAME WORD» IS A CLAIM ABOUT ONE LANGUAGE ───────────────────────────────────────── */
test('r246 ⑦ the positional audit excuses an untranslated word per LANGUAGE, not globally', () => {
  const s = read('scripts/i18n-positional-audit.mjs');
  /* ⚠ The global NEUTRAL set was fine while its members were units and product names. The moment
     the universe contains proper nouns, a global entry for «Japan» to excuse German would also
     excuse Russian, where the word is «Япония» — i.e. the instrument would go green over a real
     gap, in the one file whose job is to stop that. scripts/i18n-pages-audit.mjs already solved it. */
  assert.match(s, /const SAME_AS_EN = \{/, 'the per-language allowlist is gone');
  assert.match(s, /SAME_AS_EN\[code\] && SAME_AS_EN\[code\]\.has\(en\.trim\(\)\)/, '…and it is not consulted');
  const has = (lang, word) => new RegExp(`${lang}: new Set\\(\\[[\\s\\S]*?'${word}'`).test(s);
  assert.ok(has('de', 'Japan'), 'German does not claim «Japan»');
  assert.equal(/ru: new Set\(\[[\s\S]{0,40}'Japan'/.test(s), false, 'Russian must NOT be excused «Japan» — it is Япония');
  /* and the whole gate is green */
  const j = json('i18n-positional-audit.mjs');
  assert.equal(j.short, 0, 'a call site is short of five arguments');
  for (const r of j.rows) assert.equal(r.same, 0, `${r.code} still reads English at ${r.same} site(s)`);
});

/* ══════════════════ #R224 ④ — the seventh language is derived ══════════════════ */
/* ── ④ THE SEVENTH LANGUAGE IS DERIVED, NOT COPIED ────────────────────────────────────────────── */
test('R224 ④ Simplified Chinese is registered and regenerates byte-for-byte', () => {
  const reg = read('js/lang-registry.js');
  /* ⚠ (#R239) …and the same for Simplified — see the note in tests/r223-checks. */
  assert.match(reg, /\{ code: 'zh-hans', label: '简体中文', html: 'zh-Hans', pill: '简',/);
  assert.match(reg, /alias: \['zh-hans', 'zh-cn', 'zh-sg', 'zh-my', 'hans'\]/, 'the Simplified tags only');
  assert.ok(!/'zh-tw'[^\]]*zh-hans/.test(reg), 'zh-TW must stay with Traditional');
  assert.match(reg, /b\.textContent = l\.pill \|\| l\.code\.toUpperCase\(\);/, 'a code is not always a pill');
  /* (#R232) …the generated list, not an import line — see the matching note in tests/r223-checks. */
  assert.match(read('js/locales/_langs.js'), /"zh-hans"/, 'zh-hans is in the generated language list');
  const hansFull = read('js/locales/ui.zh-hans.js');
  /* ⚠ the STRINGS, not the header — that comment names the Traditional spellings it replaces */
  const hans = hansFull.slice(hansFull.indexOf("window.IntMapLang.define('zh-hans'"));
  assert.match(hansFull, /window\.IntMapLang\.define\('zh-hans', \{/);
  /* the mainland vocabulary actually landed — a character map alone would have left 网路 / 資訊 */
  for (const w of ['信息', '屏幕', '文件', '默认', '设置', '用户']) assert.ok(hans.includes(w), `missing ${w}`);
  for (const w of ['網路', '資訊', '螢幕', '檔案', '預設', '選單', '使用者']) assert.ok(!hans.includes(w), `Traditional ${w} survived`);
  /* ⚠ AND IT IS IN SYNC WITH ITS SOURCE. This is the whole reason it is generated: a string fixed in
     ui.zh.js is fixed in both, or this fails. */
  execFileSync(process.execPath, ['scripts/zh-hans.mjs', '--check'], { cwd: new URL('.', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: 'pipe' });
});

/* ══════════════════ #R428 ② — the language event reaches every control on the row ══════════════════ */
/* ── ② 言語を変えたら、その行は全部その言語になる ───────────────────────── */
test('R428 ② the category chips relabel on the language event, without re-rendering', () => {
  /* ⚠ READ, NOT RUN: relabelChips rewrites live chip elements inside the news-events factory, which needs the DOM and the news store. */
  assert.match(body, /window\.dispatchEvent\(new Event\('intmap-lang'\)\)/,
    'the app still announces a language change');
  assert.match(events, /addEventListener\('intmap-lang', relabelChips\)/,
    'the chips must listen to it — they were the one control on the row that did not');
  const fn = events.match(/function relabelChips\(\)[\s\S]*?\n  \}/);
  assert.ok(fn, 'relabelChips must be findable');
  /* ⚠ 貼り替えであって再描画ではない。`renderChips()` を呼ぶと件数が 0 になり行が消える。 */
  assert.ok(!/renderChips\(\)/.test(fn[0]),
    'relabelChips must not re-render: the counts come from globalData, which the switch just emptied');
  assert.match(fn[0], /querySelectorAll\('\.news-cat-chip'\)/, 'it rewrites the chips in place');
  assert.match(fn[0], /if \(n\) b\.appendChild\(n\)/, 'and it puts the count node back');
});
