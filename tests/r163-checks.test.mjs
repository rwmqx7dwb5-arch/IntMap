// R163 source-level regression checks — the second index.html split.
//
// #R162 moved the reference-data tables and four small modules out of index.html. #R163 moves the
// seven big self-contained FEATURE modules (566 KB): flight sim, historical borders, stats compare,
// routing, map compare, companies, street view — and promotes what was monitors' private host object
// into ONE shared IM_HOST that every module receives.
//
// The load-bearing invariant is the same one #R162 nearly lost a feature to, and it is asserted
// twice here: a module that reads a closure value which is REASSIGNED at runtime must read it
// through a getter. A captured copy freezes at factory time, and because this codebase guards soft
// dependencies with `typeof X!=='undefined'` inside try/catch, the module then keeps "working" while
// silently reading a dead value — no error anywhere. tests/r163.spec.js proves the live behaviour in
// a real browser; this file fixes the structure that makes it true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync } from 'node:fs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

/* Blank out comments and string/template literals so identifier scanning reads CODE only — the
   module headers document the rewrites in prose ("currentLang -> HOST.lang"), which would otherwise
   register as the very violation the scan is looking for. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* The seven modules this round extracted: global, factory key, file. */
const MOVED = [
  ['IntMapCompanies', 'companies', 'js/companies.js'],
  ['IntMapStatsCompare', 'statsCompare', 'js/stats-compare.js'],
  ['IntMapCompare', 'compare', 'js/compare.js'],
  ['IntMapRouting', 'routing', 'js/routing.js'],
  ['IntMapStreetView', 'streetView', 'js/street-view.js'],
  ['IntMapFlightSim', 'flightSim', 'js/flight-sim.js'],
  ['IntMapTimeBorders', 'timeBorders', 'js/time-borders.js'],
];

/* Closure values that are REASSIGNED at runtime → must be reached through a host getter, and must
   therefore never appear as a bare identifier inside a js/ module. */
const LIVE = {
  currentLang: 'lang', currentProj: 'proj', currentMapType: 'mapType',
  terrain3D: 'terrain3D', countryGeo: 'countryGeo',
};

test('R163 #1 each module was moved out, loaded, and instantiated at its original spot', () => {
  for (const [global, key, file] of MOVED) {
    const src = rd(file);
    assert.ok(!html.includes(`window.${global}=(function(){`),
      `index.html must not still define ${global} — a leftover in-page copy would win over ${file}`);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(src.includes(`window.IntMapModules.${key}=function(HOST){`),
      `${file} declares the ${key} factory taking (HOST)`);
    assert.ok(html.includes(`window.${global}=window.IntMapModules.${key}(IM_HOST);`),
      `index.html instantiates ${key} with the shared host at ${global}'s original position`);
  }
});

test('R163 #2 IM_HOST exists and EVERY member is an accessor — never a captured value', () => {
  const start = html.indexOf('const IM_HOST={');
  assert.ok(start > 0, 'index.html declares the shared IM_HOST');
  const body = html.slice(start + 'const IM_HOST={'.length, html.indexOf('\n  };', start));

  // Every member must be an accessor over the closure variable, never a captured value: a shorthand
  // (`imToast,`) or an assignment (`imToast: imToast`) would freeze the value at object-literal time
  // — which is both a stale-read hazard and a temporal-dead-zone hazard, since IM_HOST sits above
  // most of the declarations. Two accessor forms exist:
  //   · `get name(){ return x; }`   — the rule (#R163);
  //   · `set name(v){ x=v; }`      — (#R165) allowed ONLY as the write half of a READ-WRITE pair
  //     (the Atlas kernel writes five closure variables through the host). Every setter must have a
  //     matching getter over the SAME variable; tests/r165-checks pins the RW list itself.
  const members = body.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('/*') && !l.startsWith('*'));
  let checked = 0;
  const getters = new Map(), setters = new Map(); // member name -> closure variable
  for (const line of members) {
    for (const decl of line.split(/,(?=\s*(?:get\b|set\b|$))/)) {
      const d = decl.trim().replace(/,$/, '');
      if (!d) continue;
      checked++;
      const g = d.match(/^get\s+([A-Za-z_$][\w$]*)\(\)\{\s*return\s+([A-Za-z_$][\w$]*);\s*\}$/);
      const s = d.match(/^set\s+([A-Za-z_$][\w$]*)\(v\)\{\s*([A-Za-z_$][\w$]*)=v;\s*\}$/);
      /* (#R198) A THIRD ACCESSOR FORM: a getter that DELEGATES to a module rather than returning a
         closure variable — `get X(){ return window.IntMapY.z(); }`. It arrived because the gazetteer
         index is no longer derivable from the two synchronous tables alone: the world rows
         (data/gazetteer-world.json) land after boot, and the file that knows when is js/gazetteer.js,
         not the shell. This does NOT loosen the invariant the test exists for. The rule is "never a
         captured value", and a delegating getter is the strongest possible version of that — it holds
         no value at all, so there is nothing to go stale. What stays forbidden is exactly what was
         forbidden before: a shorthand (`imToast,`) or an assignment (`imToast: imToast`), both of
         which freeze the value at object-literal time. The delegation target must be a published
         window.IntMap* module, so the reference is to something this file can name and check. */
      const dg = d.match(/^get\s+([A-Za-z_$][\w$]*)\(\)\{\s*return\s+window\.(IntMap[\w$]*)\.[\w$]+\(\);\s*\}$/);
      assert.ok(g || s || dg, `every IM_HOST member must be a plain getter, a module-delegating getter, or the setter half of a RW pair; found: ${d}`);
      if (g) getters.set(g[1], g[2]);
      if (s) setters.set(s[1], s[2]);
    }
  }
  for (const [name, variable] of setters) {
    assert.equal(getters.get(name), variable,
      `IM_HOST setter "${name}" must pair with a getter over the same closure variable "${variable}"`);
  }
  // Guard the guard: if a refactor changed the layout so the parse above matched almost nothing,
  // the loop would pass trivially. IM_HOST carries 88 accessors today (27 at #R163).
  assert.ok(checked >= 25, `expected to validate the whole host interface; only parsed ${checked} member(s)`);
});

test('R163 #3 INVARIANT: every reassigned closure value is exposed as a LIVE getter', () => {
  // Prove the classification rather than trusting it: each of these is assigned somewhere in
  // index.html OUTSIDE its own declaration, so a captured copy would go stale.
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    return html.split('\n').filter((l) => asg.test(l) && !decl.test(l)).length;
  };
  for (const [name, prop] of Object.entries(LIVE)) {
    assert.ok(reassignments(name) > 0,
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a getter`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

test('R163 #4 no split-out module reads a reassigned value as a bare identifier', () => {
  // The rewrite that makes #3 meaningful: inside js/, these names must only ever appear as
  // HOST.<prop>. A bare `currentLang` in a module file is exactly the #R162 silent failure.
  for (const [, , file] of MOVED) {
    const src = code(rd(file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
      const hits = (src.match(bare) || []).length;
      assert.equal(hits, 0,
        `${file} still mentions ${name} as a bare identifier — it must read HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R163 #5 the parser-backed split-scope check passes (and covers the new files)', () => {
  // Regex scope analysis lies (#R162: a `/['"]/` regex literal was read as a string opener and the
  // rest of the file was blanked, producing a false PASS). This is acorn.
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R163 #6 the boot guard names every factory, so one missing file cannot hide', () => {
  // window.IntMapModules is created by whichever module file loads first, so checking the namespace
  // alone cannot detect a later file that failed to load — check each factory by name.
  for (const [, key] of MOVED) {
    assert.ok(new RegExp(`'${key}'`).test(html), `the boot guard lists the ${key} factory`);
  }
  assert.match(html, /module factories missing/, 'index.html reports missing factories loudly');
  assert.match(html, /window\.__imModuleCheck\s*=/, 'the boot guard exposes its result for the browser test');
});

test('R163 #7 index.html actually shrank and no module body came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 29_000, `index.html should be well under the pre-R163 32,890 lines; it is ${lines}`);
  // A module body reappearing inline is the regression that would silently undo the whole round.
  for (const [global] of MOVED) {
    const inline = new RegExp(`window\\.${global}\\s*=\\s*\\(function`);
    assert.ok(!inline.test(html), `${global} must not be defined inline in index.html again`);
  }
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
