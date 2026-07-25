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
  userTheme:          { v: 'userTheme',          owners: ['atlas-console.js'] },
  /* `mode`'s getter sits with the other mutable state (it predates the setter), so only the pairing
     over the same closure variable is required — not that both halves share a line. */
  mode:               { v: 'currentMode',        owners: ['playground.js'], oneLinePair: false },
  satPanelDismissed:  { v: 'satPanelDismissed',  owners: ['playground.js'] },
  /* Same exception as `mode`: globalData and newsFeatures were already live getters up with the
     other mutable state before #R167 gave them setters. */
  globalData:         { v: 'globalData',         owners: ['news-timeline.js'], oneLinePair: false },
  newsFeatures:       { v: 'newsFeatures',       owners: ['news-timeline.js', 'news-ui.js'], oneLinePair: false },
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
  lastElev:           { v: 'lastElev',           owners: ['map-readout.js'] },
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
