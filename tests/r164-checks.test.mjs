// R164 source-level regression checks — the third index.html split.
//
// #R162 moved the self-contained tables, #R163 the seven big feature modules. #R164 moves the six
// remaining ZERO-WRITE blocks (~545 KB): the data-layer catalogue/engine, the floating-window
// workspace, the widget board, the World-Bank choropleths, the beta overlays and the live-webcams
// layer. "Zero-write" was established by AST before extraction: none of these blocks assigns to any
// closure variable, so every dependency can be served by an IM_HOST getter — no setters needed.
//
// The load-bearing invariant is unchanged from #R162/#R163 and asserted again here for the new
// files: a module that reads a closure value which is REASSIGNED at runtime must read it through a
// live getter. A captured copy freezes at factory time, and because this codebase guards soft
// dependencies with `typeof X!=='undefined'` inside try/catch, the module then keeps "working"
// while silently reading a dead value. tests/r164.spec.js proves the live behaviour in a real
// browser; this file fixes the structure that makes it true.
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

/* Blank out comments and string/template literals so identifier scanning reads CODE only. */
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

/* The six modules this round extracted. `global` is set when index.html assigns the factory's
   return value; the bare-IIFE modules publish their own window.* surface from inside the body.
   `needle` is a string that lived only inside the moved block — it must be GONE from index.html. */
const MOVED = [
  { key: 'dataLayers', file: 'js/data-layers.js', global: null, needle: 'lyrEU:"EU members"' },
  { key: 'workspace', file: 'js/workspace.js', global: 'IntMapWorkspace', needle: 'window.IntMapWorkspace=(function(){' },
  { key: 'widgets', file: 'js/widgets.js', global: null, needle: 'Widget board v3' },
  { key: 'wbLayers', file: 'js/wb-layers.js', global: null, needle: 'refreshStatsLatest' },
  { key: 'betaOverlays', file: 'js/beta-overlays.js', global: null, needle: 'DeepStateMap' },
  { key: 'cameras', file: 'js/cameras.js', global: null, needle: 'otcmDone' },
];

/* Closure values the #R164 modules read that are REASSIGNED at runtime → must be host getters and
   must never appear as a bare identifier inside the new files. (lang/mode/countryGeo were already
   live members before this round; the other six getters are new in #R164.) */
const LIVE = {
  currentLang: 'lang', currentMode: 'mode', countryGeo: 'countryGeo',
  unitMode: 'unitMode', userTZ: 'userTZ', mapTooltipEl: 'mapTooltipEl',
  globalData: 'globalData', newsFeatures: 'newsFeatures', renderUI: 'renderUI',
};

test('R164 #1 each block was moved out, loaded, and instantiated at its original spot', () => {
  for (const { key, file, global, needle } of MOVED) {
    const src = rd(file);
    assert.ok(!html.includes(needle),
      `index.html must not still contain "${needle}" — a leftover in-page copy of ${file} would win`);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(src.includes(`window.IntMapModules.${key}=function(map,HOST){`),
      `${file} declares the ${key} factory taking (map,HOST)`);
    const call = global
      ? `window.${global}=window.IntMapModules.${key}(map,IM_HOST);`
      : `window.IntMapModules.${key}(map,IM_HOST);`;
    assert.ok(html.includes(call), `index.html instantiates ${key} with the shared host at the original position`);
  }
});

test('R164 #2 INVARIANT: every reassigned closure value the new modules read is a LIVE getter', () => {
  // Prove the classification rather than trusting it: each of these is assigned somewhere in
  // index.html OUTSIDE its own declaration, so a captured copy would go stale. (renderUI's only
  // reassignment sits in the retired-ACLED block behind an early `return` — dead code — but the
  // getter costs nothing and stays correct if that block ever comes back to life.)
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

test('R164 #3 no new module reads a reassigned value as a bare identifier', () => {
  // The rewrite that makes #2 meaningful: inside js/, these names must only ever appear as
  // HOST.<prop>. A bare `currentLang` in a module file is exactly the #R162 silent failure.
  for (const { file } of MOVED) {
    const src = code(rd(file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
      const hits = (src.match(bare) || []).length;
      assert.equal(hits, 0,
        `${file} still mentions ${name} as a bare identifier — it must read HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R164 #4 the parser-backed split-scope check passes (and covers the new files)', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R164 #5 the boot guard names every new factory, so one missing file cannot hide', () => {
  for (const { key } of MOVED) {
    assert.ok(new RegExp(`'${key}'`).test(html), `the boot guard lists the ${key} factory`);
  }
});

test('R164 #6 index.html actually shrank and no module body came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 24_000, `index.html should be well under the pre-R164 27,936 lines; it is ${lines}`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});

test('R164 #7 the moved blocks stayed zero-write: no module assigns to a HOST member source', () => {
  // The whole reason these six could move with getters only. `HOST.x = …` or `HOST.x++` anywhere
  // in a module would silently write to a getter-only property (a no-op in sloppy mode inside
  // try/catch) — the write would just vanish. Keep the contract explicit.
  for (const { file } of MOVED) {
    const src = code(rd(file));
    const writes = src.match(/HOST\.[A-Za-z_$][\w$]*\s*(?:=(?!=)|\+\+|--|[+\-*/%&|^]=)/g) || [];
    assert.deepEqual(writes, [], `${file} writes through HOST — these members are getter-only: ${writes.join(', ')}`);
  }
});
