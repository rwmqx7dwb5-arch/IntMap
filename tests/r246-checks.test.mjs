/* ============================================================================
 *  IntMap · #R246 — the checks for this round
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *  「地震シミュレータで、計算進捗は「震度分布を計算」の下ではなく上に。」
 *  「Live aircraft trafficで航空機の色は以下に。民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040
 *    両方とも：より太いアウトライン」
 *
 *  ⚠ Every test below was run against the UNFIXED file first and fails there (#R228's rule).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments blanked, so a note QUOTING a forbidden shape cannot fail its own file
   ([[intmap-recurring-lessons]] E — eight rounds of this) */
function code(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '/' && c2 === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    out += c; i++;
  }
  return out;
}
const json = (script, args = []) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', script), '--json', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ① THE ELEVENTH SHAPE IS ZERO, AND EVERY CONVERTED READER GOES THROUGH pick() ──────────── */
test('r246 ① the language-keyed object is gone from js/, and its readers resolve through pick()', () => {
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
test('r246 ③ every source description is a reading-page string, in all nine languages', () => {
  /* ⚠ WHY THIS MOVED. scripts/i18n-pages-audit.mjs measures each language against every string PATH
     in the ENGLISH document. The English text used to live in js/reference-data.js (`use:{en,jp}`),
     so the de/ru/es `sourceUse` tables were outside the universe and the total ABSENCE of
     fr/ko/zh/zh-Hans read as 287/287 — 100 %, on a surface that was English for four languages. */
  const p = json('i18n-pages-audit.mjs');
  assert.ok(p.want >= 374, `the reading-page universe shrank to ${p.want} — sourceUse left pages.en.js`);
  for (const r of p.rows) assert.equal(r.have, r.want, `${r.code} is short on the reading pages`);
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
    const reg = read('js/reference-data.js');
    const arr = /const DATA_SOURCES=\[[\s\S]*?\n  \];/.exec(reg);
    assert.ok(arr, 'DATA_SOURCES is not a single array literal any more');
    const rows = (arr[0].match(/\{n:'/g) || []).length;
    assert.ok(rows > 100, `the registry holds only ${rows} sources`);
    const per = arr[0].length / rows;
    assert.ok(per < 220, `the registry averages ${Math.round(per)} chars a source — it is carrying prose again`);
  }
});

/* ── ④ THE SEISMIC FOOTER DRAWS THE PROGRESS ABOVE THE BUTTON ──────────────────────────────── */
test('r246 ④ the compute progress is above 「震度分布を計算」, not below it', () => {
  const s = code(read('js/seismic.js'));
  const foot = /return '<div class="sq-foot"[\s\S]*?<\/div>';/.exec(s);
  assert.ok(foot, '_flowFoot no longer builds the pinned footer in one expression');
  const prog = foot[0].indexOf('sq-foot-prog');
  const btn = foot[0].indexOf('+btn');
  assert.ok(prog > 0 && btn > 0, 'the footer has both a progress box and the primary button');
  assert.ok(prog < btn, 'the progress bar is still emitted AFTER the button');
  /* one progress STATE, two readouts at most — `_setProg` writes to every `.sq-prog` it finds */
  assert.match(s, /panel\.querySelectorAll\('\.sq-prog'\)/, 'the progress is written to by class, not to the first one');
  assert.equal((s.match(/_progHTML\(/g) || []).length, 2, 'the progress markup is one helper, called once');
});

/* ── ⑤ THE TWO AIRCRAFT COLOURS AND THE THICKER OUTLINE ────────────────────────────────────── */
test('r246 ⑤ live aircraft are cyan and vivid red, with one outline width both renderings read', () => {
  const s = code(read('js/data-layers.js'));
  assert.match(s, /const PLANE_CIV='#00D9FF';/, 'civil aircraft are not the cyan the reader asked for');
  assert.match(s, /const PLANE_MIL='#FF3040';/, 'military aircraft are not the vivid red the reader asked for');
  /* ⚠ THICKER, AND ONLY ONCE. #R244's outline was 1.6 units of the 44-unit artwork; the lifted 3-D
     body draws the same stroke as a mitred RING whose half-width was the literal 0.8. Deriving it
     means the two renderings cannot disagree about how thick the outline is — the defect #R173
     wrote up and `_feHex` exists for. */
  const w = /const PLANE_STROKE=([\d.]+);/.exec(s);
  assert.ok(w, 'the outline width is not a constant');
  assert.ok(parseFloat(w[1]) > 1.6, `the outline is ${w[1]} units — it was asked to get THICKER than 1.6`);
  assert.match(s, /const _PLANE_STROKE=PLANE_STROKE\/2;/, 'the lifted mark still hard-codes its own half-width');
  assert.match(s, /ctx\.lineWidth=PLANE_STROKE;/, 'the flat glyph still hard-codes its own stroke');
  /* the ship glyph is NOT an aircraft and keeps its own line */
  assert.match(s, /const make=\(color\)=>\{ const s=40,[\s\S]{0,200}?ctx\.lineWidth=1\.6;/, 'the ship icon lost its own stroke');
});

/* ── ⑥ A LANGUAGE'S NAME IS CLDR DATA, NOT A TABLE ─────────────────────────────────────────── */
test('r246 ⑥ the news-language names come from Intl.DisplayNames', () => {
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
