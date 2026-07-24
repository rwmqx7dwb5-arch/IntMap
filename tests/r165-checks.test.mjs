// R165 source-level regression checks — the fourth index.html split: the Atlas kernel.
//
// #R162/#R163/#R164 moved out everything that only READS closure state (getters suffice). What was
// left was dominated by one block: window.IntMapConsole — the Atlas kernel (879 KB, ~6,200 lines),
// which WRITES five closure variables (Atlas actions set the theme / units / radius / measure
// state). #R165 moves it by amending the host contract with READ-WRITE members: a `get x(){…},
// set x(v){ x=v; }` pair over the closure variable, which stays in index.html as the single source
// of truth. `HOST.x=v` in the module runs the setter, so index.html code and module code keep
// reading the same live value.
//
// The contract this file pins down (and tests/r165.spec.js proves in a real browser):
//   · the RW list is EXACTLY the five members below — a getter silently growing a setter, or a new
//     RW member appearing without updating this list, is a test failure someone must review;
//   · only js/atlas-console.js writes through HOST at all; every other module stays zero-write;
//   · every closure value the module reads or writes that is reassigned at runtime goes through
//     IM_HOST — never a bare identifier (the #R162 silent-loss shape).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
const html = rd('index.html');
const mod = rd('js/atlas-console.js');

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

/* The READ-WRITE host members and who is allowed to write each one. #R165 introduced five (the Atlas
   kernel); #R166 added two for the Playground hub, which clears the active tab and hides the
   satellite controller when World Explorer takes the screen. Adding a row here is a deliberate act:
   the contract is that a module writes closure state ONLY through a member listed below. */
const RW = {
  measurePoints:     { v: 'measurePoints',     owner: 'atlas-console.js', oneLinePair: true },
  radiusColor:       { v: 'radiusColor',       owner: 'atlas-console.js', oneLinePair: true },
  radiusKm:          { v: 'radiusKm',          owner: 'atlas-console.js', oneLinePair: true },
  unitMode:          { v: 'unitMode',          owner: 'atlas-console.js', oneLinePair: true },
  userTheme:         { v: 'userTheme',         owner: 'atlas-console.js', oneLinePair: true },
  /* `mode`'s getter sits with the other mutable state (it predates the setter), so only the pairing
     over the same closure variable is required — not that both halves share a line. */
  mode:              { v: 'currentMode',       owner: 'playground.js',    oneLinePair: false },
  satPanelDismissed: { v: 'satPanelDismissed', owner: 'playground.js',    oneLinePair: true },
};
const RW_NAMES = Object.keys(RW);

/* Closure values the Atlas kernel reads that are REASSIGNED at runtime → live getters, and never a
   bare identifier inside the module. (lang/user/mode/countryGeo/globalData/radiusItems predate this
   round; newsDate/toolMode/userPins are new getters; the RW five are the new get+set pairs.) */
const LIVE = {
  currentLang: 'lang', currentUser: 'user', currentMode: 'mode',
  countryGeo: 'countryGeo', globalData: 'globalData', radiusItems: 'radiusItems',
  newsDate: 'newsDate', toolMode: 'toolMode', userPins: 'userPins',
  measurePoints: 'measurePoints', radiusColor: 'radiusColor', radiusKm: 'radiusKm',
  unitMode: 'unitMode', userTheme: 'userTheme',
};

test('R165 #1 the Atlas kernel was moved out, loaded, and instantiated at its original spot', () => {
  assert.ok(!html.includes('window.IntMapConsole=(function(){'),
    'index.html must not still define IntMapConsole inline — a leftover in-page copy would win');
  assert.ok(html.includes('<script src="js/atlas-console.js"></script>'), 'index.html loads js/atlas-console.js');
  assert.ok(mod.includes('window.IntMapModules=window.IntMapModules||{};'),
    'js/atlas-console.js extends IntMapModules without clobbering what earlier files put there');
  assert.ok(mod.includes('window.IntMapModules.atlasConsole=function(map,HOST){'),
    'js/atlas-console.js declares the atlasConsole factory taking (map,HOST)');
  assert.ok(html.includes('window.IntMapConsole=window.IntMapModules.atlasConsole(map,IM_HOST);'),
    'index.html instantiates the kernel with the shared host at the original position');
});

test('R165 #2 THE RW CONTRACT: the setter list is exactly the declared members, each with one writer', () => {
  const start = html.indexOf('const IM_HOST={');
  assert.ok(start > 0, 'index.html declares the shared IM_HOST');
  const body = html.slice(start, html.indexOf('\n  };', start));

  // (a) the setters that exist are EXACTLY the declared RW list — no more, no fewer.
  const setters = [...body.matchAll(/set\s+([A-Za-z_$][\w$]*)\(v\)\{\s*([A-Za-z_$][\w$]*)=v;\s*\}/g)];
  assert.deepEqual(setters.map((m) => m[1]).sort(), [...RW_NAMES].sort(),
    'the IM_HOST setter list must be exactly the declared RW members');
  for (const m of setters) {
    assert.equal(m[2], RW[m[1]].v, `setter ${m[1]} must assign the declared closure variable`);
  }
  // (b) every RW member is a get+set PAIR over the SAME closure variable — a setter without its
  //     getter would let a module write a value it cannot read back. Members introduced together
  //     with their setter also keep both halves on one line (greppability).
  for (const [name, spec] of Object.entries(RW)) {
    assert.match(body, new RegExp(`get ${name}\\(\\)\\{ return ${spec.v}; \\}`),
      `IM_HOST.${name} must have a getter over ${spec.v}`);
    if (spec.oneLinePair) {
      const pair = new RegExp(`get ${name}\\(\\)\\{ return ${spec.v}; \\},\\s*set ${name}\\(v\\)\\{ ${spec.v}=v; \\}`);
      assert.match(body, pair, `IM_HOST.${name} must be a one-line get+set pair over ${spec.v}`);
    }
  }
  // (c) the owning module really writes every RW member through the host — if a write disappears,
  //     the member should be demoted to a plain getter (and this list updated consciously).
  //     Probed on the RAW text: the string-blanking helper is regex-literal-blind (a quote inside
  //     /[&<>"']/ starts a phantom string and eats the following code — the #R162 lesson), and it
  //     eats exactly the `HOST.measurePoints=` write site. A false positive is impossible here:
  //     the header prose never spells a member as `HOST.<name>=`.
  for (const [name, spec] of Object.entries(RW)) {
    assert.match(rd('js/' + spec.owner), new RegExp(`HOST\\.${name}\\s*=(?!=)`),
      `js/${spec.owner} must write HOST.${name} somewhere — otherwise demote it to a getter`);
  }
  // (d) no module writes a host member it does not own: every HOST.* write in every js/ file must
  //     be an RW member whose declared owner is that same file (the #R164 zero-write contract kept
  //     explicit for everyone else).
  for (const f of readdirSync(new URL('js/', root)).filter((x) => x.endsWith('.js'))) {
    const src = code(rd('js/' + f));
    const writes = [...src.matchAll(/HOST\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+\+|--|[+\-*/%&|^]=)/g)].map((m) => m[1]);
    const bad = writes.filter((w) => !RW[w] || RW[w].owner !== f);
    assert.deepEqual(bad, [], `js/${f} writes host member(s) it does not own: ${bad.join(', ')}`);
  }
});

test('R165 #3 every live value is a real getter over a really-reassigned variable', () => {
  // Prove the classification rather than trusting it (same probe as #R163/#R164): each name is
  // assigned somewhere in index.html OUTSIDE its own declaration, so a captured copy would go stale.
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    return html.split('\n').filter((l) => asg.test(l) && !decl.test(l)).length;
  };
  for (const [name, prop] of Object.entries(LIVE)) {
    assert.ok(reassignments(name) > 0,
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a live member`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

test('R165 #4 the kernel never reads a live value as a bare identifier', () => {
  // The rewrite that makes #3 meaningful: inside the module these names must only ever appear as
  // HOST.<prop>. A bare `radiusKm` in js/atlas-console.js is exactly the #R162 silent failure.
  // (Verified shadow-free at extraction time: the module declares no local with any of these names.)
  const src = code(mod);
  for (const [name, prop] of Object.entries(LIVE)) {
    const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
    const hits = (src.match(bare) || []).length;
    assert.equal(hits, 0,
      `js/atlas-console.js still mentions ${name} as a bare identifier — it must use HOST.${prop} (${hits} hit(s))`);
  }
});

test('R165 #5 the parser-backed split-scope check passes (and covers the kernel)', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R165 #6 the boot guard names the atlasConsole factory, so a missing file cannot hide', () => {
  assert.match(html, /'atlasConsole'/, 'the boot guard lists the atlasConsole factory');
});

test('R165 #7 index.html actually shrank and no module body came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 17_000, `index.html should be well under the pre-R165 22,703 lines; it is ${lines}`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
