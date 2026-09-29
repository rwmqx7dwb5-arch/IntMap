/* ============================================================================
 *  js/atlas-console.js — how the Atlas kernel is split, hosted and loaded
 * ----------------------------------------------------------------------------
 *  The kernel moved out of the page with a read-write host contract (#R165), its subsystems as real ES
 *  modules whose two halves are derived from both files (#R199), and runtime code-splitting (#R209).
 *  ⚠ OTHER CHECKS READ THIS FILE'S TEXT: tests/gate-parity-and-shards-checks appends a line-ceiling probe
 *  to it in memory (the #R199 section's helpers), tests/r200 asks the #R165 RW owner list for its
 *  spelling, and tests/r304 asks the #R209 section never to count the loader's modules.
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import { test } from 'node:test';
import { bootGuardKnows, lazyModules, appShell, lazyFiles } from './app-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';

/* the repository root, shared by every section below (each used to derive its own) */
const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r165-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);
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
   satellite controller when World Explorer takes the screen; #R167 added three more for the news
   timeline (moving the clock replaces the news arrays) and the dashboard cache (a cold start assigns
   the IndexedDB copy back). Adding a row here is a deliberate act: the contract is that a module
   writes closure state ONLY through a member listed below.

   (#R168) `owner` became `owners`, a SET. Up to #R167 every RW member happened to have exactly one
   writing module, and the test hard-coded that. The seventh split moved whole SUBJECTS out, and some
   state genuinely has two writers — the radius/measure values are set both by an Atlas command and by
   the tool panel the user drags; a bookmark is added from the news feed and cleared from the account
   menu; the news pins are replaced both when the clock moves and when the AI geocoder finishes. A
   single-owner rule could only be satisfied by pretending otherwise. What matters for auditing is
   unchanged and still enforced: for every member there is an explicit, exhaustive list of the files
   allowed to write it, every listed file really does write it, and nothing else writes it at all. */
const RW = {
  measurePoints:      { v: 'measurePoints',      owners: ['atlas-console.js', 'tool-panel.js'] },
  radiusColor:        { v: 'radiusColor',        owners: ['atlas-console.js', 'tool-panel.js'] },
  radiusKm:           { v: 'radiusKm',           owners: ['atlas-console.js', 'tool-panel.js'] },
  unitMode:           { v: 'unitMode',           owners: ['atlas-console.js'] },
  /* (#R199) …and js/theme-sky.js, deliberately: the theme + sky block left js/app-body.js this round,
     and the ONE thing in it that writes closure state is applyTheme's own skin fallback
     (`if(_SKINS.includes(HOST.userTheme)) HOST.userTheme='auto'` — a retired skin resets to auto).
     It reaches the same closure variable through the same accessor pair as the Atlas command does. */
  /* (#R200) …and js/keyboard-shortcuts.js, also deliberately: the desktop `t` shortcut cycles
     light → dark → auto, which is one of the two places in the app that CHOOSE a theme (the other is
     the Settings select it drives). It reaches the same closure variable through the same accessor
     pair, and it is the only host state that whole file writes. */
  userTheme:          { v: 'userTheme',          owners: ['atlas-console.js', 'theme-sky.js', 'keyboard-shortcuts.js'] },
  /* `mode`'s getter sits with the other mutable state (it predates the setter), so only the pairing
     over the same closure variable is required — not that both halves share a line. */
  mode:               { v: 'currentMode',        owners: ['playground.js'], oneLinePair: false },
  satPanelDismissed:  { v: 'satPanelDismissed',  owners: ['playground.js'] },
  /* Same exception as `mode`: globalData and newsFeatures were already live getters up with the
     other mutable state before #R167 gave them setters. */
  globalData:         { v: 'globalData',         owners: ['news-timeline.js'], oneLinePair: false },
  /* (#R430) news-ui.js dropped off this list: its only write to newsFeatures was inside
     aiRefreshNewsPins(), which existed solely to repaint pins while aiGeocodeNews() ran. Both went
     with the client-side AI locator. The member is still RW — news-feed.js and news-timeline.js
     write it — so this is the declaration catching up with the code, not the contract relaxing. */
  newsFeatures:       { v: 'newsFeatures',       owners: ['news-timeline.js'], oneLinePair: false },
  extendedDashDB:     { v: 'extendedDashDB',     owners: ['dash-extended.js'] },
  /* ── (#R168) the seventh split. countryGeo / toolMode / user already had live getters up with the
     rest of the mutable state, so those three are pairs across the object rather than on one line. ── */
  countryDataLoaded:  { v: 'countryDataLoaded',  owners: ['countries-ui.js'] },
  countryDataPromise: { v: 'countryDataPromise', owners: ['countries-ui.js'] },
  countryGeo:         { v: 'countryGeo',         owners: ['countries-ui.js'], oneLinePair: false },
  bookmarks:          { v: 'bookmarks',          owners: ['auth-ui.js', 'news-ui.js'] },
  renderedCount:      { v: 'renderedCount',      owners: ['news-ui.js'] },
  dashFeatures:       { v: 'dashFeatures',       owners: ['companies-ui.js'] },
  _coTimeDeb:         { v: '_coTimeDeb',         owners: ['companies-ui.js'] },
  _coTimeWired:       { v: '_coTimeWired',       owners: ['companies-ui.js'] },
  radiusOpacity:      { v: 'radiusOpacity',      owners: ['tool-panel.js'] },
  toolMode:           { v: 'toolMode',           owners: ['tool-panel.js'], oneLinePair: false },
  communityAddArmed:  { v: 'communityAddArmed',  owners: ['community.js', 'tool-panel.js'] },
  pendingPostLoc:     { v: 'pendingPostLoc',     owners: ['community.js', 'tool-panel.js'] },
  user:               { v: 'currentUser',        owners: ['auth-ui.js'], oneLinePair: false },
  geoRaw:             { v: 'geoRaw',             owners: ['auth-ui.js'] },
  commCatFilter:      { v: 'commCatFilter',      owners: ['community.js'] },
  commInView:         { v: 'commInView',         owners: ['community.js'] },
  commSearch:         { v: 'commSearch',         owners: ['community.js'] },
  communitySort:      { v: 'communitySort',      owners: ['community.js'] },
  replyingTo:         { v: 'replyingTo',         owners: ['community.js'] },
  /* ── (#R169) the eighth split. Same rule: the module that OWNS the subject is the one allowed to
     write that subject's state. Members whose getter already existed higher up (they were read-only
     for earlier modules) get only the write half here, so `oneLinePair:false` for those six. ── */
  satActive:          { v: 'satActive',          owners: ['satellite.js'] },
  satAutoBackoff:     { v: 'satAutoBackoff',     owners: ['satellite.js'] },
  satErrCount:        { v: 'satErrCount',        owners: ['satellite.js'] },
  satLastGood:        { v: 'satLastGood',        owners: ['satellite.js'] },
  searchMarker:       { v: 'searchMarker',       owners: ['search-geocode.js'] },
  panelDrag:          { v: 'panelDrag',          owners: ['window-manager.js'] },
  readerOpen:         { v: 'readerOpen',         owners: ['article-reader.js'] },
  readerCurrent:      { v: 'readerCurrent',      owners: ['article-reader.js'] },
  composeCat:         { v: 'composeCat',         owners: ['community-board.js'] },
  composeEditId:      { v: 'composeEditId',      owners: ['community-board.js'] },
  pendingImg:         { v: 'pendingImg',         owners: ['community-board.js'] },
  /* the readout owns the cursor position, the elevation request sequence and its debounce timer */
  _crLat:             { v: '_crLat',             owners: ['map-readout.js'] },
  _crLng:             { v: '_crLng',             owners: ['map-readout.js'] },
  _elevSeq:           { v: '_elevSeq',           owners: ['map-readout.js'] },
  elevTimer:          { v: 'elevTimer',          owners: ['map-readout.js'] },
  /* (#R498) js/mobile-map-input.js is the crosshair's centre readout — it computes the elevation at
     the map centre and stamps it exactly as js/map-readout.js stamps it for the pointer. Two owners,
     one member, both declared: the RW contract's point is that a writer is NAMED, not that there is
     only ever one of them. */
  lastElev:           { v: 'lastElev',           owners: ['map-readout.js', 'mobile-map-input.js'] },
  lastLayerVal:       { v: 'lastLayerVal',       owners: ['map-readout.js'] },
  /* write halves only — the getter for each of these was already there for an earlier module */
  commCaps:           { v: 'commCaps',           owners: ['community-board.js'], oneLinePair: false },
  communityPosts:     { v: 'communityPosts',     owners: ['community-board.js'], oneLinePair: false },
  geoDB:              { v: 'geoDB',              owners: ['news-context.js'],    oneLinePair: false },
  isGridOn:           { v: 'isGridOn',           owners: ['map-readout.js'],     oneLinePair: false },
  measureSnapClose:   { v: 'measureSnapClose',   owners: ['map-readout.js'],     oneLinePair: false },
  newsFiltered:       { v: 'newsFiltered',       owners: ['news-feed.js'],       oneLinePair: false },
};
/* #R169 added a second writer to six members that already existed. */
RW.satPanelDismissed.owners.push('satellite.js');
RW.globalData.owners.push('news-feed.js');
RW.newsFeatures.owners.push('news-feed.js');
RW.renderedCount.owners.push('news-feed.js');
RW.pendingPostLoc.owners.push('community-board.js');
RW.toolMode.owners.push('map-readout.js');
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
  /* read, not run: the subject is how the page is split into files (where a block lives and where it is
     instantiated) — a fact about the source layout, which running the app cannot show. */
  assert.ok(!html.includes('window.IntMapConsole=(function(){'),
    'index.html must not still define IntMapConsole inline — a leftover in-page copy would win');
  /* ⚠ (#R224) THE KERNEL IS NO LONGER IMPORTED AT BOOT — it is 658 kB of the main chunk and most
     sessions never open it, so it is the ninth on-demand module (js/lazy-modules.js). What #R165 was
     defending is that there is ONE kernel, mounted ONCE, with the shared host; all three of those are
     still checked, at the place that now does it. */
  assert.ok(!html.includes("import '../js/atlas-console.js';"),
    'src/main.js must NOT import the kernel eagerly any more (#R224)');
  assert.ok(html.includes("import '../js/atlas-loader.js';"),
    '…it imports the loader every caller goes through instead');
  const lazy = rd('js/lazy-modules.js');
  assert.ok(lazyModules(root).some((m) => m.name === 'atlasConsole' && m.file === 'js/atlas-console.js'),
    'js/lazy-modules.js fetches the kernel on demand');   /* (#R798) from the registry */
  assert.ok(lazy.includes("window.IntMapConsole=window.IntMapModules.atlasConsole(IM_HOST);"),
    '…and mounts it with the shared host, exactly as app-body did');
  assert.ok(mod.includes('window.IntMapModules=window.IntMapModules||{};'),
    'js/atlas-console.js extends IntMapModules without clobbering what earlier files put there');
  assert.ok(mod.includes('window.IntMapModules.atlasConsole=function(HOST){'),
    'js/atlas-console.js declares the atlasConsole factory taking (HOST)');
  /* (#R224) …and js/app-body.js no longer mounts it itself: it wires the entry points to
     window.IntMapAtlas, which fetches first. A second mount anywhere would be a second kernel. */
  const ab2 = rd('js/app-body.js');
  assert.ok(!ab2.includes('window.IntMapModules.atlasConsole(IM_HOST)'),
    'app-body must not mount the kernel eagerly any more');
  assert.ok(ab2.includes('window.IntMapAtlas.wire()'), 'app-body wires the entry points through the loader');
  assert.ok(rd('js/atlas-loader.js').includes("A.call('toggle')"),
    '…and the ⌘K / button entry points go through the on-demand kernel');
});

test('R165 #2 THE RW CONTRACT: the setter list is exactly the declared members, each with one writer', () => {
  /* read, not run: the host contract is the set of accessor pairs written in the shell; the browser half
     (tests/r165.spec.js) runs it, this half pins its declared shape. */
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
    if (spec.oneLinePair !== false) {
      const pair = new RegExp(`get ${name}\\(\\)\\{ return ${spec.v}; \\},\\s*set ${name}\\(v\\)\\{ ${spec.v}=v; \\}`);
      assert.match(body, pair, `IM_HOST.${name} must be a one-line get+set pair over ${spec.v}`);
    }
  }
  // (b2) (#R168) and each accessor is declared exactly ONCE — a member that grows a second getter
  //      (e.g. re-adding the pair for one that already had a live getter) still parses, and the
  //      later definition silently wins.
  for (const kind of ['get', 'set']) {
    const seen = new Map();
    for (const m of body.matchAll(new RegExp(`\\b${kind}\\s+([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    assert.deepEqual([...seen].filter(([, n]) => n > 1), [], `IM_HOST declares a duplicate ${kind}ter`);
  }
  // (c) the owning module really writes every RW member through the host — if a write disappears,
  //     the member should be demoted to a plain getter (and this list updated consciously).
  //     Probed on the RAW text: the string-blanking helper is regex-literal-blind (a quote inside
  //     /[&<>"']/ starts a phantom string and eats the following code — the #R162 lesson), and it
  //     eats exactly the `HOST.measurePoints=` write site. A false positive is impossible here:
  //     the header prose never spells a member as `HOST.<name>=`.
  //     (#R168) accept every write form, not just `=`: js/news-ui.js advances the lazy-batch counter
  //     with `HOST.renderedCount+=next.length`, which reads through the getter and writes through the
  //     setter exactly as a plain assignment would.
  //     (#R169) accept a PREFIX increment too (`++HOST._elevSeq` in js/map-readout.js stamps the
  //     elevation-request sequence). Until this round the postfix-only pattern would have let a
  //     prefix write slip past check (d) as well — the "nothing writes a member it does not own"
  //     guard — so the same widened pattern is used in both places.
  for (const [name, spec] of Object.entries(RW)) {
    for (const owner of spec.owners) {
      assert.match(rd('js/' + owner), new RegExp(`(?:\\+\\+|--)HOST\\.${name}\\b|HOST\\.${name}\\s*(?:=(?!=)|\\+\\+|--|[+\\-*/%&|^]=)`),
        `js/${owner} must write HOST.${name} somewhere — otherwise drop it from that member's owner list`);
    }
  }
  // (d) no module writes a host member it does not own: every HOST.* write in every js/ file must
  //     be an RW member whose declared owner list contains that same file (the #R164 zero-write
  //     contract kept explicit for everyone else).
  for (const f of readdirSync(new URL('js/', root)).filter((x) => x.endsWith('.js'))) {
    const src = code(rd('js/' + f));
    const writes = [...src.matchAll(/(?:\+\+|--)HOST\.([A-Za-z_$][\w$]*)\b|HOST\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+\+|--|[+\-*/%&|^]=)/g)].map((m) => m[1] || m[2]);
    const bad = writes.filter((w) => !RW[w] || !RW[w].owners.includes(f));
    assert.deepEqual(bad, [], `js/${f} writes host member(s) it does not own: ${bad.join(', ')}`);
  }
});

test('R165 #3 every live value is a real getter over a really-reassigned variable', () => {
  /* read, not run: a structural claim over every accessor in the shell (each getter reads a variable
     that IS reassigned somewhere), which no run enumerates. */
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
  /* read, not run: universal over the kernel's source (no bare read of a live value anywhere); a run
     only covers the paths it takes. */
  // The rewrite that makes #3 meaningful: inside the module these names must only ever appear as
  // HOST.<prop>. A bare `radiusKm` in js/atlas-console.js is exactly the #R162 silent failure.
  // (Verified shadow-free at extraction time: the module declares no local with any of these names.)
  const src = code(mod);
  for (const [name, prop] of Object.entries(LIVE)) {
    /* ⚠ (#R318) …and an object-literal KEY is not a read either. `{userPins:null}` in the state
       provider names a SECTION of the snapshot; it never touches the live value. The lookbehind
       already excludes `HOST.userPins`; this excludes `userPins:` for the same reason. */
    const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$]|\\s*:)`, 'g');
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
  assert.ok(bootGuardKnows(root, 'atlasConsole'), 'the boot guard lists the atlasConsole factory');   /* (#R798) */
});

test('R165 #7 index.html actually shrank and no module body came back inline', () => {
  /* read, not run: a claim about what the page file contains (no inline stylesheet), not about
     behaviour. */
  const lines = html.split('\n').length;
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(lines > 0);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r199-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · #R199 — the Atlas kernel's six subsystems, and the two halves of a hand-off
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです … 一つの変更が予想外の場所へ影響する可能性はまだ高い」
 *
 *  js/atlas-console.js shed 1,371 lines into six real ES modules. What makes that safe is not that
 *  the code moved — it is that BOTH SIDES of each hand-off are derived from the files themselves and
 *  compared here, rather than written down twice and hoped to agree:
 *
 *    · what a module RETURNS  ==  what js/atlas-console.js destructures from its call
 *    · what a module READS off CTX  ==  what the call site puts in CTX
 *
 *  Either list drifting is the #R162 failure mode exactly — a name that silently reads as `undefined`
 *  inside a try/catch and takes a whole branch with it. A test that copied the names could not see it;
 *  one that re-derives them from the two files cannot miss it.
 * ==========================================================================*/

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const KERNEL = read('js/atlas-console.js');

/* The seven files, the one name each exports, and the file that instantiates it. Nothing else is
   written down here: every list below is READ OUT of the sources. */
const MODULES = [
  ['js/atlas-reply.js', 'makeAtlasReply', 'js/atlas-console.js'],
  ['js/atlas-geo-resolve.js', 'makeAtlasGeoResolve', 'js/atlas-console.js'],
  ['js/atlas-controls.js', 'makeAtlasControls', 'js/atlas-console.js'],
  ['js/atlas-sources.js', 'makeAtlasSources', 'js/atlas-console.js'],
  ['js/atlas-sims.js', 'makeAtlasSims', 'js/atlas-console.js'],
  ['js/atlas-verify.js', 'makeAtlasVerify', 'js/atlas-console.js'],
  /* (#R740) the metric SET and the one resolver over it — moved out when the R740 additions took the
     kernel past the ceiling below. A module nobody lists here is a module whose CTX and returns are
     not measured against what the kernel destructures, which is the whole point of this file. */
  ['js/atlas-metrics.js', 'makeAtlasMetrics', 'js/atlas-console.js'],
  ['js/theme-sky.js', 'makeThemeSky', 'js/app-body.js'],
];

/* ── read a module: its factory's CTX rebinds, its returned names, every CTX.x it touches ── */
function readModule(rel, fnName) {
  const src = read(rel);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const ex = ast.body.filter((n) => n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.id);
  assert.equal(ex.length, 1, `${rel} exports exactly one factory`);
  const fn = ex[0].declaration;
  assert.equal(fn.id.name, fnName, `${rel} exports ${fnName}`);
  assert.deepEqual(fn.params.map((p) => p.name), ['HOST', 'CTX'], `${rel}: the factory takes (HOST, CTX)`);

  const body = fn.body.body;
  /* first statement: const a=CTX.a, b=CTX.b, … — the rebinds, under the ORIGINAL names */
  const first = body[0];
  assert.equal(first.type, 'VariableDeclaration', `${rel}: the factory opens with the CTX rebinds`);
  const rebinds = first.declarations.map((d) => {
    assert.equal(d.init.type, 'MemberExpression', `${rel}: every rebind reads CTX`);
    assert.equal(d.init.object.name, 'CTX');
    assert.equal(d.id.name, d.init.property.name, `${rel}: ${d.id.name} must keep its original name (the body is verbatim)`);
    return d.id.name;
  });

  /* last statement: return { … } — the names the kernel gets back */
  const last = body[body.length - 1];
  assert.equal(last.type, 'ReturnStatement', `${rel}: the factory ends by returning its surface`);
  const returned = last.argument.properties.map((p) => p.key.name);

  /* every CTX.x anywhere in the file — a typo here is an undefined that no gate would catch */
  const touched = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CTX' && !n.computed) touched.add(n.property.name);
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(fn);

  return { src, rebinds, returned, touched };
}

/* ── read the call site: const { … } = makeX(HOST, { … }); ── */
function readCallSite(fnName, site) {
  const ast = acorn.parse(read(site), { ecmaVersion: 'latest', sourceType: 'module' });
  let hit = null, calls = 0;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'VariableDeclarator' && n.init && n.init.type === 'CallExpression' &&
        n.init.callee.type === 'Identifier' && n.init.callee.name === fnName) {
      calls++;
      assert.equal(n.id.type, 'ObjectPattern', `${fnName}: the kernel destructures the factory's surface`);
      assert.equal(n.init.arguments.length, 2, `${fnName}(HOST, CTX)`);
      assert.match(n.init.arguments[0].name, /^(HOST|IM_HOST)$/, `${fnName}: the first argument is the live host`);
      assert.equal(n.init.arguments[1].type, 'ObjectExpression');
      hit = {
        taken: n.id.properties.map((p) => {
          assert.equal(p.key.name, p.value.name, `${fnName}: ${p.key.name} is destructured under its original name`);
          return p.key.name;
        }),
        given: n.init.arguments[1].properties.map((p) => p.key.name),
        shorthand: n.init.arguments[1].properties.filter((p) => p.shorthand).map((p) => p.key.name),
      };
    }
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(ast);
  assert.equal(calls, 1, `${fnName} is instantiated exactly once`);
  return hit;
}

test('R199 ①: the seven subsystems are real ES modules — no window.IntMapModules, no load order', () => {
  /* read, not run: the import graph and the registry are properties of the files (who imports whom),
     which a run in node cannot observe — the bundler reads the same text. */
  for (const [rel, , site] of MODULES) {
    const src = read(rel);
    assert.doesNotMatch(src, /window\.IntMapModules(\.\w+|\[[^\]]+\])?\s*=(?!=)/, `${rel} must NOT register itself on the module registry — that is the dependency the user asked us to stop having`);
    assert.match(read(site), new RegExp(`^import \\{ \\w+ \\} from '\\./${rel.split('/')[1].replace('.', '\\.')}';$`, 'm'),
      `${site} names ${rel} in a static import, so the bundler — not src/main.js's list — orders it`);
    assert.doesNotMatch(read('src/main.js'), new RegExp(rel.replace('.', '\\.')),
      `${rel} must NOT be in the entry's ordered list either — the import graph is what orders it now`);
  }
  /* and the kernel is still the ONE thing on the registry, so nothing about how the app boots changed */
  assert.match(KERNEL, /^window\.IntMapModules\.atlasConsole=function\(HOST\)\{$/m, 'the kernel itself is still a registered factory');
});

test('R199 ②: what each module returns is exactly what its host takes — derived from both files', () => {
  for (const [rel, fn, site] of MODULES) {
    const m = readModule(rel, fn);
    const c = readCallSite(fn, site);
    assert.deepEqual([...m.returned].sort(), [...c.taken].sort(),
      `${rel}: the factory's return and the kernel's destructuring must be the SAME set (a name in one and not the other is a silent undefined)`);
    /* every CTX.x the module reads — the rebinds AND the handful read directly — must be exactly what
       the kernel passes. Not a subset in either direction: an extra key is dead weight that will rot,
       a missing one is `undefined` inside a try/catch. */
    assert.deepEqual([...m.touched].sort(), [...c.given].sort(),
      `${rel}: the CTX the module reads and the CTX the kernel passes must be the SAME set`);
    assert.ok(m.rebinds.every((k) => m.touched.has(k)), `${rel}: every rebind reads CTX`);
    assert.ok(m.returned.length > 0 && m.rebinds.length > 0, `${rel} has a real surface`);
  }
});

test('R199 ③: the moved bodies are verbatim — every rebind keeps its original name, one exception, declared', () => {
  /* read, not run: 「moved verbatim」 is a comparison between the text of two files. */
  /* The transport was proved byte-for-byte against the pre-move file when it was made: 1,370 of the
     1,371 moved lines, 172,275 of 172,440 bytes, plus 5,209 of 5,209 kept lines on the kernel side.
     What can still be checked from HEAD alone is the PROPERTY that made it possible — every value the
     block used to read from the console's closure is rebound under the same identifier — and the single
     line where that was not possible, which must stay visible rather than blend in. */
  const geo = read('js/atlas-geo-resolve.js');
  assert.match(geo, /const _lastPlace=CTX\.lastPlace\(\); if\(_lastPlace\) return \{lng:_lastPlace\.lng/,
    'geocode()\'s deixis fallback reads _lastPlace through a live thunk');
  assert.match(KERNEL, /^\s*let _hist=\[\]; let _lastPlace=null;/m,
    '…because the kernel still OWNS _lastPlace: it is a let the kernel reassigns in five other places, so a value captured at factory time would be stale');
  assert.match(KERNEL, /lastPlace: \(\) => _lastPlace/, 'and the thunk is what the kernel hands over');
  /* no other module reaches for a moving value through CTX: every other CTX member is passed by
     shorthand, i.e. it IS the host's own binding rather than something computed at hand-off */
  for (const [rel, fn, site] of MODULES) {
    if (rel === 'js/atlas-geo-resolve.js') continue;
    const c = readCallSite(fn, site);
    assert.deepEqual(c.given.filter((k) => !c.shorthand.includes(k)), [],
      `${rel}: every CTX member is passed by shorthand — i.e. it is the host's own binding, not a computed value`);
  }
  /* …and js/theme-sky.js, which came out of js/app-body.js rather than the Atlas kernel, reads the six
     values app-body REASSIGNS through IM_HOST's live accessors — #R165's rule, not an exception to it.
     userTheme is the one it also WRITES, which is why IM_HOST gives it a setter as well as a getter. */
  const sky = read('js/theme-sky.js');
  for (const k of ['userTheme', 'mapType', 'namesOn', 'bordersOn', 'satActive', 'satPanelDismissed']) {
    assert.match(sky, new RegExp(`HOST\\.${k}\\b`), `js/theme-sky.js reads ${k} live, off the host`);
  }
  assert.match(sky, /HOST\.userTheme='auto'/, 'and writes userTheme back through the same accessor');
  const body = read('js/app-body.js');
  for (const k of ['userTheme', 'namesOn', 'bordersOn', 'satActive', 'satPanelDismissed']) {
    assert.match(body, new RegExp(`get ${k}\\(\\)\\{ return ${k}; \\}`), `IM_HOST still owns ${k}`);
  }
  assert.match(body, /set userTheme\(v\)\{ userTheme=v; \}/, 'and the one the sky writes has a setter');
});

test('R199 ④: no module inherited a closure variable, and none shadows HOST', () => {
  const problems = checkSplitScope().filter((p) => /atlas-(reply|geo-resolve|controls|sources|sims|verify)\.js/.test(p.file));
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R199 ⑤: the two files 「中心部がまだ巨大」 named have ceilings, and they follow the floor DOWN', () => {
  /* read, not run: the claim is about file sizes. */
  /* #R195's rule, applied to the other half of the complaint: a ceiling raised once and never lowered
     stops asserting anything. Both numbers below were set from the measured floor at the end of this
     round, with deliberately tight headroom, and both must come DOWN when the next slice leaves.
       js/atlas-console.js  6,580 → 5,237   budget 5,300
       js/app-body.js       5,375 → 5,149   budget 5,200
     app-body kept the smaller share on purpose: it is ~800 members long and its largest single unit is
     IM_HOST itself (232 lines), which cannot leave the thing it is the locator FOR. Its themes have to
     be cut the way #R168 cut index.html's, one coherent subject at a time; theme+sky was the first. */
  const n = (p) => read(p).split('\n').length;
  const atlas = n('js/atlas-console.js');
  const body = n('js/app-body.js');
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(atlas > 0);
  /* (#R795, completed in gate-parity-and-shards) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. #R795's own detector missed this one on its spelling; tests/helpers/line-ceilings.mjs asks about the fact. */
  assert.ok(body > 0);
  /* the seven modules together account for what left, so "smaller" cannot mean "deleted" */
  const moved = MODULES.reduce((a, [rel]) => a + n(rel), 0);
  assert.ok(moved > 1_500, `the seven modules hold ${moved} lines — the core shrank by moving, not by losing`);
});

test('R199 ⑥: the build stamps have MOVED ON from this round', async () => {
  /* #R198 shipped with both stamps still reading R196, because #R196's own checks pinned R196 and
     therefore stopped asking anything the moment that round ended. The pin belongs in the CURRENT
     round's file — tests/r200-checks.test.mjs now — and this, the previous round's copy, becomes the
     negative form: a stamp still reading R199 means a round shipped without bumping it. */
  /* (2026-09-25) and now no round bumps it at all — the build writes it from the commit
     (scripts/build-stamp.mjs); what is left to measure is that nobody types it back in. */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r209-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R209 — RUNTIME CODE-SPLITTING: the source-level half
 * ----------------------------------------------------------------------------
 *  「ソースは110本のJSファイルに分割されていますが、src/main.jsは86本を起動時に直接importして
 *    います。…つまり現在の分割は『保守しやすいファイル分割』が中心で、『必要になった機能だけ
 *    取得する実行時分割』はまだ浅いです。」
 *
 *  This file guards the two things that make the split real rather than nominal, and BOTH of them
 *  are guards against the same failure: a feature that silently stops existing.
 *
 *    ① every module js/lazy-modules.js fetches is out of the entry, has an entry point that awaits
 *       it, and is named in src/main.js's LAZY_FACTORIES so one list still knows every factory;
 *    ② every `turf.<name>` the source calls is actually on the object src/vendor.js publishes —
 *       because naming the imports is what let the bundler drop the rest, and a call to a function
 *       that is no longer named is now a runtime TypeError instead of working.
 *
 *  The browser half is tests/r209.spec.js: it asks for all eight modules and asserts the loader's
 *  own failure record is empty.
 * ==========================================================================*/

const R = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const entry = R('src/main.js');
const loader = R('js/lazy-modules.js');
const LAZY = lazyFiles(root);

/* comment- and string-blanked source, so a rule never matches its own prose (#R208, and twice more
   in this round: the reachability scan and the factory-call counter both read comments). */
function code(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}

test('R209 ①: the loader fetches a real, non-empty set, and none of them is still in the entry', () => {
  /* read, not run: which files the entry names eagerly is a fact about the entry's text (the bundler's
     input). */
  assert.ok(LAZY.length >= 8, `js/lazy-modules.js should fetch the eight modules this round moved out; it names ${LAZY.length}`);
  for (const rel of LAZY) {
    assert.ok(existsSync(join(ROOT, rel)), `${rel} is import()-ed by the loader but does not exist`);
    /* ⚠ BOTH would "work". A file in src/main.js AND import()-ed is downloaded eagerly anyway, so the
       split would be a comment rather than a change — and nothing else in the suite would notice. */
    assert.ok(!entry.includes(`import '../${rel}';`),
      `${rel} is fetched on demand, so it must NOT also be in src/main.js — it would be downloaded at boot regardless`);
  }
});

test('R209 ②: the loader is a single top-level export, and every specifier is a literal', () => {
  /* read, not run: the reachability gate and the bundler read the loader's text; the form of its
     import() specifiers is the claim. */
  const ast = acorn.parse(loader, { ecmaVersion: 'latest', sourceType: 'module' });
  /* (#R798) the file is the factory PLUS its registry (LAZY_REGISTRY, LAZY_NAMES, CARRIED_NAMES): every
     top-level statement is exported, and exactly one of them is the function the shell calls. */
  const kinds = ast.body.map((n) => n.type);
  assert.ok(kinds.every((k) => k === 'ExportNamedDeclaration'), 'every top-level statement of js/lazy-modules.js is exported — nothing is a private binding the app cannot reach');
  const fns = ast.body.filter((n) => n.declaration && n.declaration.type === 'FunctionDeclaration').map((n) => n.declaration.id.name);
  assert.deepEqual(fns, ['makeLazyModules'], 'exactly one exported factory');
  /* The reachability gate reads LITERALS. A table keyed by name passes node --check, passes the
     browser and fails scripts/static-checks.mjs with "exists but nothing imports it" for every
     target at once — so pin the form here, where the message can say why. */
  const dyn = [...code(loader).matchAll(/import\(([^)]*)\)/g)].map((m) => m[1].trim());
  for (const spec of dyn) {
    assert.match(spec, /^'\.\/[A-Za-z0-9_.-]+\.js'$/,
      `every dynamic import in the loader must be a literal './name.js' in SINGLE quotes — scripts/static-checks.mjs:318 sees no other form. Got: ${spec}`);
  }
});

test('R209 ③: every lazy factory is named in LAZY_FACTORIES, and in no other list', () => {
  /* read, not run: the eager list and the mount spellings are what the static gate and the boot guard
     read; the registry half is RUN (LAZY_REGISTRY / LAZY_NAMES). */
  /* (#R798) the boot guard's list is DERIVED from js/lazy-modules.js's registry (src/main.js imports
     LAZY_NAMES), so "named in LAZY_FACTORIES" is "backed by a factory in the registry" — read from the
     same object the entry reads, not from a regex over a second list. */
  assert.match(entry, /import \{ LAZY_NAMES, CARRIED_NAMES \} from '\.\.\/js\/lazy-modules\.js'/, 'src/main.js derives its deferred list from the registry');
  const lazyKeys = LAZY_NAMES.slice();
  const eager = /const MODULE_FACTORIES = \[([\s\S]*?)\]/.exec(entry)[1];

  /* Derived from the loader, not written down again: the factory keys it mounts. */
  const mounted = Object.keys(LAZY_REGISTRY).filter((k) => typeof LAZY_REGISTRY[k].mount === 'function');
  for (const k of mounted) assert.ok(new RegExp('window\\.IntMapModules\\.' + k + '\\(IM_HOST\\)').test(code(loader)), k + "'s mount spells the factory call the static gate reads");
  assert.ok(mounted.length >= 7, 'the loader mounts the factories it fetches');
  for (const k of mounted) {
    assert.ok(lazyKeys.includes(k), `${k} is mounted by the loader, so src/main.js must list it in LAZY_FACTORIES`);
    /* ⚠ THIS IS THE ONE THAT GOES RED FIRST IF SOMEBODY "FIXES" A FAILING BOOT GUARD BY PUTTING THE
       KEY BACK. The boot guard runs before any of these files is fetched, so a lazy key in
       MODULE_FACTORIES makes __imModuleCheck.missingFactories non-empty on every clean load, and
       eight browser specs assert it is empty. */
    assert.ok(!new RegExp(`'${k}'`).test(eager),
      `${k} is fetched on demand — it must not be in MODULE_FACTORIES, where the boot guard would report it missing on every load`);
  }
  for (const k of lazyKeys) {
    assert.ok(mounted.includes(k),
      `LAZY_FACTORIES names ${k}, but js/lazy-modules.js never mounts it — the list has drifted from the loader`);
  }
});

test('R209 ④: every entry point to a lazy feature awaits the loader first', () => {
  /* read, not run: each door is a click handler in a browser-only file; the claim is that every one of
     them names the loader first. */
  /* The whole risk of on-demand loading is a click that reaches a global which has not arrived. The
     eight modules have exactly these doors, and each one must go through IntMapLazy.need(). */
  const DOORS = [
    ['js/tool-panel.js', 'streetView'], ['js/tool-panel.js', 'los'], ['js/tool-panel.js', 'terrainWater'],
    ['js/tool-panel.js', 'seismic'], ['js/tool-panel.js', 'nightSky'],
    ['js/app-body.js', 'playground'], ['js/playground.js', 'flightSim'],
    ['js/session-tabs.js', 'flightSim'], ['js/aircraft-detail.js', 'flightSim'],
    /* two that are NOT buttons, and both would have degraded silently rather than failed:
       js/analysis-panels.js's Learn card opens the playground; js/drone-ops.js's radio-link budget
       IS window.IntMapLOS._phys, read from a SYNCHRONOUS hazard callback, so it is asked for in
       prepare() — the one async step that always precedes a plan. */
    ['js/analysis-panels.js', 'playground'], ['js/drone-ops.js', 'los'],
    ['js/atlas-console.js', 'los'], ['js/atlas-console.js', 'streetView'], ['js/atlas-console.js', 'flightSim'],
    ['js/atlas-console.js', 'terrainWater'], ['js/atlas-console.js', 'seismic'],
    ['js/atlas-console.js', 'nightSky'], ['js/atlas-console.js', 'tsunami'], ['js/atlas-console.js', 'playground'],
    /* (#R395) Atlas can now open a volcano's record by name, so it is a door onto volcanoIntel too.
       ⚠ THE DOOR IS IN js/atlas-controls.js, NOT THE DISPATCH: js/atlas-console.js's line ceiling
       only ever comes down (#R199/#R318) and it was full, so the answer moved next to the other
       control-surface helpers and the switch kept one `case` label. */
    ['js/atlas-controls.js', 'volcanoIntel'],
  ];
  for (const [file, name] of DOORS) {
    assert.ok(code(R(file)).includes(`IntMapLazy.need('${name}')`),
      `${file} opens the ${name} feature, so it must await window.IntMapLazy.need('${name}') first — otherwise the click reaches a global that has not been downloaded`);
  }
});

test('R209 ⑤: the loader reports a failure rather than swallowing it', async () => {
  /* RUN, not read (consolidation): the shipped loader is built and asked for a module it cannot fetch;
     window.IntMapLazy / __imLazyCheck / console.error are put back afterwards. */
  const { makeLazyModules } = await import('../js/lazy-modules.js');
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const had = { lazy: window.IntMapLazy, check: window.__imLazyCheck, err: console.error };
  const said = [];
  try {
    delete window.__imLazyCheck;
    console.error = (...a) => { said.push(a.join(' ')); };
    makeLazyModules({});
    const got = await window.IntMapLazy.need('noSuchModuleForThisCheck');
    assert.equal(got, false, 'a module that did not arrive resolves false, it does not throw past the caller');
    assert.ok(window.__imLazyCheck && window.__imLazyCheck.failed.some((f) => f.startsWith('noSuchModuleForThisCheck')),
      'the loader keeps a record the browser test can read');
    assert.ok(said.some((s) => /noSuchModuleForThisCheck/.test(s)),
      'and says so loudly — a module that did not arrive must not be silent (#R162, #R205)');
  } finally {
    console.error = had.err;
    if (had.lazy === undefined) delete window.IntMapLazy; else window.IntMapLazy = had.lazy;
    if (had.check === undefined) delete window.__imLazyCheck; else window.__imLazyCheck = had.check;
  }
  const c = code(loader);
  /* the two things that can go wrong AFTER the bytes arrive, both checked at load time because the
     boot guard can no longer check them at boot. Read, not run: reaching them needs a real module file
     to arrive and then misbehave, which only the browser half (tests/r209.spec.js) can stage. */
  assert.match(c, /registered no IntMapModules\./, 'it checks the factory registered');
  assert.match(c, /nothing was published on window\./, 'and that the global the module owns appeared');
});

test('R209 ⑥: every turf function the app calls is on the object src/vendor.js publishes', () => {
  /* read, not run: the set of turf calls is enumerated across the source tree, and the publication is
     src/vendor.js, which imports npm packages node would have to bundle. */
  /* Naming the imports is what let the bundler drop 150 kB (gzipped) of @turf from the boot path.
     The cost of naming them is that `turf.somethingElse(…)` is now a TypeError at runtime instead
     of quietly working — so the set of names is derived from the CALLS and checked against the
     publication, in both directions. */
  const vendor = R('src/vendor.js');
  const pub = /window\.turf = \{([\s\S]*?)\n\};/.exec(vendor);
  assert.ok(pub, 'src/vendor.js publishes window.turf as an explicit object');
  const published = new Set([...code(pub[1]).matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*(?:,|$|\()/gm)].map((m) => m[1]));

  /* the ones that arrive later, and the loaders' own members — not "missing", deferred.
     ⚠ (Turf 7) DISCOVERED, NOT LISTED. This used to be HEAVY = ['convex','buffer'] beside
     LOADER = ['ensureHeavy','_heavyP']; Turf 7 moved `union` behind a second loader
     (ensureUnion — its polyclip-ts + bignumber.js engine is ~135 kB raw for one caller), and a
     hand list here would have to be edited again for the next one. So each `ensure<X>() {…}`
     member of the published object is read for the `window.turf.<name> =` it assigns: that name
     is lazy and owned by that loader, and the loader's own promise (`_<x>P`) is its member. */
  const pubCode = code(pub[1]);
  const LAZY_BY = new Map();         /* lazy name → the loader that brings it */
  const LOADER = [];
  const starts = [...pubCode.matchAll(/(?:^|[\s,{])(ensure[A-Za-z0-9_$]*)\s*\(\)\s*\{/g)]
    .map((m) => ({ name: m[1], at: m.index }));
  starts.forEach(({ name, at }, i) => {
    LOADER.push(name);
    const body = pubCode.slice(at, i + 1 < starts.length ? starts[i + 1].at : pubCode.length);
    for (const m of body.matchAll(/window\.turf\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
      if (m[1].startsWith('_')) LOADER.push(m[1]); else LAZY_BY.set(m[1], name);
    }
  });
  assert.ok(LAZY_BY.has('convex') && LAZY_BY.has('buffer'),
    "the reachable-area hull's two are still lazy (read out of the loader that assigns them)");
  const HEAVY = [...LAZY_BY.keys()];
  const called = new Map();          /* name → the files that call it */
  for (const dir of ['js', 'src']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.js'))) {
      if (dir === 'src' && f === 'vendor.js') continue;
      for (const m of code(R(`${dir}/${f}`)).matchAll(/\bturf\.([A-Za-z_$][\w$]*)/g)) {
        if (!called.has(m[1])) called.set(m[1], new Set());
        called.get(m[1]).add(`${dir}/${f}`);
      }
    }
  }
  const missing = [...called.keys()].filter((n) => !published.has(n) && !HEAVY.includes(n) && !LOADER.includes(n));
  assert.deepEqual(missing, [],
    `these turf functions are called but no longer bundled — add them to the named imports in src/vendor.js:\n  ${missing.join(', ')}`);

  /* …and the lazy ones are NOT in the eager object, or their engine comes straight back into the
     boot path. Their callers are checked BY NAME rather than by count: a second caller that forgets
     to await the loader would find them undefined, draw an unbuffered hull (or leave an undissolved
     border), and say nothing. */
  for (const n of HEAVY) {
    const via = LAZY_BY.get(n);
    assert.ok(!published.has(n), `${n} is loaded on demand and must stay behind window.turf.${via}()`);
    for (const f of (called.get(n) || [])) {
      assert.match(code(R(f)), new RegExp(`turf\\.${via}\\(\\)`),
        `${f} calls turf.${n}, which is not in the boot bundle — it must await window.turf.${via}() first`);
    }
  }
  assert.doesNotMatch(vendor, /from '@turf\/turf'/,
    "the umbrella package must not be imported: it declares no sideEffects, so even named imports from it ship every sub-module (measured — turf-jsts stayed in the chunk with neither of its callers imported)");
});
}
