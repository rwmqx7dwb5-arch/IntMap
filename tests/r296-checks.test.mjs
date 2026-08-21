// ============================================================================
//  #R296 — the route popup and everything after it
// ----------------------------------------------------------------------------
//  「今回やるのは経路ポップアップ以下の項目だけでいいです。」 Twelve requests, and the ones that were
//  DEFECTS rather than preferences all had the same shape: a finished thing with nothing pressing it.
//
//    · `useHere(which)` — the current-location handler, complete with permission states — had NO
//      caller anywhere in the program (#R291 wrote it; nothing pressed it).
//    · the account preference sync read `intmap_widgets3`, the key #R292 left as a migration SOURCE
//      and never writes again, so a deleted card came back on every sign-in.
//    · the widget board had no scrolling ancestor at all: measured, every one of them was
//      `overflow-y: visible` or `hidden`, so a board taller than the sidebar was simply unreachable.
//
//  ⚠ EVERY CHECK HERE IS ABOUT WHAT RUNS, and several of them strip comments first: this is the
//  twenty-first round in which a check for a removed name matched the note explaining the removal.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/* comments out, so an assertion about code cannot be satisfied by prose about code */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ═══ ① THE BOARD TILES ITSELF ═══════════════════════════════════════════════════════════════
   「自動でウィジェットを敷き詰めてくれない。」 MEASURED on the default board at 2 columns: an S card
   (1 col) followed by four M cards (2 cols) left a 171×131 px hole in row 1, because `grid-auto-flow`
   is deliberately not `dense` (#R292: dense reorders VISUALLY without moving anything in the DOM,
   which breaks keyboard reordering and every screen reader).
   `packOrder` does the dense placement IN THE DOM instead, so reading order and visual order stay
   the same thing. This runs the real function out of js/widget-layout.js. */
function layout() {
  const src = read('js/widget-layout.js');
  const i = src.indexOf('function packOrder(');
  assert.ok(i > 0, 'packOrder must exist');
  const j = src.indexOf('\n  }', i);
  const body = src.slice(i, j + 4);
  const WC = { SPAN: { s: { cols: 1, rows: 1 }, m: { cols: 2, rows: 1 }, l: { cols: 2, rows: 2 } } };
  // eslint-disable-next-line no-new-func
  return new Function('WC', body + '\n return packOrder;')(WC);
}

/* the picture the packed order produces: true where a cell is covered */
function occupancy(order, cols) {
  const SPAN = { s: [1, 1], m: [2, 1], l: [2, 2] };
  const grid = [];
  const busy = (r, c) => !!(grid[r] && grid[r][c]);
  const fits = (r, c, w, h) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (busy(y, x)) return false;
    return true;
  };
  let r = 0, c = 0;
  for (const it of order) {
    const [w, h0] = SPAN[it.s] || SPAN.m;
    const ww = Math.min(cols, w);
    let guard = 0;
    while (!fits(r, c, ww, h0) && guard++ < 10000) { c++; if (c >= cols) { c = 0; r++; } }
    for (let y = r; y < r + h0; y++) { grid[y] = grid[y] || []; for (let x = c; x < c + ww; x++) grid[y][x] = it.i; }
    c += ww; if (c >= cols) { c = 0; r++; }
  }
  return grid;
}
const holes = (grid, cols) => {
  let n = 0;
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < cols; c++) if (!(grid[r] && grid[r][c])) n++;
  return n;
};

test('R296 ① the widget board tiles without holes, and never pushes a card back', () => {
  const packOrder = layout();
  /* the measured default board: one S in front of four Ms */
  const board = [{ i: 'a', s: 's' }, { i: 'b', s: 'm' }, { i: 'c', s: 'm' }, { i: 'd', s: 'm' }, { i: 'e', s: 'm' }];
  const before = holes(occupancy(board, 2), 2);
  assert.ok(before > 0, 'the unpacked default board really does leave a hole (this is the report)');

  const packed = packOrder(board, 2);
  assert.equal(packed.length, board.length, 'packing loses nothing');
  assert.deepEqual([...packed].map((x) => x.i).sort(), ['a', 'b', 'c', 'd', 'e'], 'and invents nothing');

  /* ⚠ a card is only ever pulled FORWARD, into a hole that would stay empty. `a` may not move back. */
  assert.equal(packed[0].i, 'a', 'the first card stays first');

  /* several shapes, several column counts — the invariant is «no interior hole» */
  const shapes = [
    [{ i: '1', s: 's' }, { i: '2', s: 'm' }, { i: '3', s: 's' }, { i: '4', s: 'm' }],
    [{ i: '1', s: 'l' }, { i: '2', s: 's' }, { i: '3', s: 'm' }, { i: '4', s: 's' }, { i: '5', s: 's' }],
    [{ i: '1', s: 'm' }, { i: '2', s: 's' }, { i: '3', s: 'l' }, { i: '4', s: 's' }, { i: '5', s: 's' }, { i: '6', s: 'm' }],
  ];
  /* ⚠⚠ THE INVARIANT IS NOT «no holes» — IT IS «no hole a later card could have filled». MEASURED
     while writing this: [m s l s s m] at 2 columns still ends with one empty cell, because by the
     time the cursor reaches it the only card left is 2 wide. That is arithmetic, not a defect, and a
     test that demanded zero would have been satisfiable only by REORDERING PAST what fits — i.e. by
     pushing a card backwards, which is the one thing this packer must never do. So the property
     asserted is the defining one for dense placement: every empty cell is empty because nothing that
     came after it fits there. */
  const fillableHoles = (order, cols) => {
    const SPAN = { s: [1, 1], m: [2, 1], l: [2, 2] };
    const g = occupancy(order, cols);
    const placedAt = new Map();
    for (let r = 0; r < g.length; r++) for (let c = 0; c < cols; c++) {
      const id = g[r] && g[r][c];
      if (id && !placedAt.has(id)) placedAt.set(id, r * cols + c);
    }
    let bad = 0;
    for (let r = 0; r < g.length - 1; r++) for (let c = 0; c < cols; c++) {
      if (g[r] && g[r][c]) continue;
      const cell = r * cols + c;
      for (const it of order) {
        const at = placedAt.get(it.i);
        if (at == null || at <= cell) continue;             /* only cards placed LATER could have filled it */
        const [w] = SPAN[it.s] || SPAN.m;
        if (Math.min(cols, w) === 1) { bad++; break; }       /* …and a 1-wide card always fits a 1-wide hole */
      }
    }
    return bad;
  };
  for (const cols of [2, 3, 4]) {
    for (const sh of shapes) {
      assert.equal(fillableHoles(packOrder(sh, cols), cols), 0,
        `cols=${cols} shape=${sh.map((x) => x.s).join('')} left a hole a later card could have filled`);
      /* and the reader's order is never made WORSE than it was */
      assert.ok(fillableHoles(packOrder(sh, cols), cols) <= fillableHoles(sh, cols),
        'packing never adds a fillable hole');
    }
  }

  /* idempotent — which is what lets it run on every render without the order drifting */
  const once = packOrder(shapes[2], 3), twice = packOrder(once, 3);
  assert.deepEqual(twice.map((x) => x.i), once.map((x) => x.i), 'packing a packed board changes nothing');

  /* and the DOM gets that order, so reading order is visual order (§18) */
  const lay = read('js/widget-layout.js');
  assert.match(lay, /packOrder\(items, cols\)\.forEach/, 'render() appends in the packed order');
  assert.doesNotMatch(code(lay), /grid-auto-flow:\s*dense/, 'and never by moving the picture only');
});

/* ═══ ② THE BOARD CAN BE SCROLLED ════════════════════════════════════════════════════════════
   「ウィジェット画面をスクロールできない。」 MEASURED by walking every ancestor of #widget-board and
   reading `overflow-y`: board `visible`, #sidebar `visible`, .operation-room `hidden`, body `hidden`.
   Nothing scrolled. The sidebar's scrolling region is `.content-area`, and `ensureBoard()` mounts the
   board as a SIBLING of one — so anything past the viewport was clipped and unreachable. */
test('R296 ② the widget board is the sidebar’s scrolling region', () => {
  const css = read('css/intmap.css');
  const rule = /\.sidebar > \.wgt-board\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the board must declare its own scrolling when it is the sidebar’s pane');
  assert.match(rule[1], /overflow-y:auto/, 'it scrolls');
  assert.match(rule[1], /min-height:0/, 'and can actually shrink inside a column flexbox');
  assert.match(rule[1], /flex:1 1 auto/, 'and takes the space the pane has');
  assert.match(rule[1], /overscroll-behavior:contain/, 'without chaining to the page behind it');

  /* ⚠ SCOPED. The same element is mounted in a Workspace pane and inside the phone sheet, and both
     of those scroll themselves — a second scroller inside them is #R34's nested-scroll trap. */
  const bare = /(^|\n)\.wgt-board\{([^}]*)\}/.exec(css);
  assert.ok(bare, 'the unscoped rule still exists');
  assert.doesNotMatch(bare[2], /overflow-y:auto/, 'and does NOT scroll everywhere the board is mounted');
});

/* ═══ ③ THE CURRENT-LOCATION BUTTON HAS A CALLER ═════════════════════════════════════════════
   「経路機能は現在地を地点に楽に選べるように。」 `useHere` was written in #R291 and never pressed. */
test('R296 ③ every route field can use the reader’s own position', () => {
  const ui = code(read('js/routing-ui.js'));
  assert.match(ui, /function useHere\(which\)/, 'the handler exists');
  assert.match(ui, /class="rtp-btn-ico rtp-here/, 'and a field draws the button');
  assert.match(ui, /q\('\.rtp-here'\)\).*useHere\(which\)/, 'and pressing it calls the handler');
  /* it says which state it is in — asking and denied are not silent */
  assert.match(ui, /function hereLabel\(\)/, 'the label is a function of the state');
  assert.match(ui, /hereState === 'denied'/, 'a refusal is spoken');
  assert.match(ui, /hereState === 'asking'/, '…and so is the wait');
  /* ⚠ opening the panel still asks for nothing — the prompt happens on the press (§4.3) */
  const open = /function open\(o\)\s*\{([\s\S]*?)\n    \}/.exec(read('js/routing-ui.js'));
  if (open) assert.equal(/getCurrentPosition/.test(open[1]), false, 'opening the panel asks for no permission');
});

/* ═══ ④ 「徒歩 → END」 ══════════════════════════════════════════════════════════════════════════
   MOTIS names the two ends of a trip `START` and `END`. They are not place names — they are the API
   saying 「the coordinate you gave me」 — and they were being printed as if they were. */
test('R296 ④ the provider’s END sentinel never reaches the reader', () => {
  const r = read('js/routing.js');
  assert.match(r, /const _sent=\(n\)=>\/\^\(START\|END\)\$\/i\.test/, 'the sentinel is recognised');
  assert.match(r, /toEnd:_sent\(_tN\)&&\/\^END\$\/i\.test\(_tN\)\?1:0/, 'and recorded as a FLAG, not a word');
  const c = read('js/routing-cards.js');
  assert.match(c, /l\.toEnd \? L\('Arrival', '到着'/, 'the word is chosen at render time…');
  /* ⚠ #R291 追記's lesson: a translated string baked into route DATA is resolved once and can never
     follow a language change. That is exactly why the flag travels and the word does not. */
  assert.doesNotMatch(code(r), /'到着'/, '…so js/routing.js never bakes a language into the data');
});

/* ═══ ⑤ 「経路機能で、現地の時刻に合わせろ」 ════════════════════════════════════════════════════ */
test('R296 ⑤ a route’s clocks are local to the place they happen', () => {
  const c = read('js/routing-cards.js');
  assert.match(c, /function zoneOffsetAt\(ll\)/, 'the zone comes from a coordinate');
  assert.match(c, /IntMapTimeZones[\s\S]{0,120}offsetAt/, '…through the app’s own zone lookup');
  assert.match(c, /function clock\(when, o, ll\)/, 'and the formatter takes a place');
  /* an explicit Settings zone still wins — a reader who pinned one asked for every time to be in it */
  assert.match(c, /if \(o\.tz && o\.tz !== 'auto'\) \{ opt\.timeZone = o\.tz; return/, 'a pinned zone short-circuits');
  /* each end of a ride is clocked WHERE IT HAPPENS */
  assert.match(c, /clock\(l\.dep, o, l\.fromLL\)/, 'departure in the departing city');
  assert.match(c, /clock\(l\.arr, o, l\.toLL\)/, 'arrival in the arriving one');
  assert.match(read('js/routing.js'), /fromLL:_ll\(l\.from\),toLL:_ll\(l\.to\)/, 'the legs carry those coordinates');
  /* the panel asks for the polygons rather than assuming somebody else did (#R293 ⑧'s defect) */
  assert.match(read('js/routing-ui.js'), /TZ\.ensure && \(!TZ\.ready \|\| !TZ\.ready\(\)\)/, 'and the data is requested on open');
});

/* ═══ ⑥ THE ROUTE PANEL IS NOT UNCONDITIONALLY TRANSLUCENT ═══════════════════════════════════
   「経路ポップアップは無条件で透過するな。」 — 「無条件で」 names the defect: every other surface follows
   the reader's own Settings ▸ サイドバーの質感 choice, and this one declared `--popup-bg` plus a
   backdrop-filter with no reference to it at all. */
test('R296 ⑥ the directions panel follows the transparency setting', () => {
  const css = read('css/intmap.css');
  const m = /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) \.rtp\{([^}]*)\}/.exec(css);
  assert.ok(m, 'an opaque rule must exist for the default (non-glass) setting');
  assert.match(m[1], /backdrop-filter:none/, 'and it turns the blur off');
  assert.match(m[1], /background:var\(--panel-bg,var\(--card-bg\)\)/, 'with an opaque fill');
  /* the SAME shape js/map-ui.js already uses for the layer sidebar — one idea, not two */
  assert.match(read('js/map-ui.js'), /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) #layer-sidebar-r\{background:var\(--panel-bg,var\(--card-bg\)\)/,
    'the layer sidebar states it the same way');
});

/* ═══ ⑦ THE CLASSIC DROPDOWN CANNOT BE SHOWN ═════════════════════════════════════════════════
   「レイヤー選択欄はclassic dropdownを完全削除。（右サイドバー形式に一本化し、設定から該当項目を削除。）」
   ⚠ THE ELEMENT STAYS, AND THAT IS NOT A HEDGE. Counted before touching it: `#layer-dropdown` is
   referenced 71 times across 20 files and is where EVERY layer checkbox in this program lives — the
   right sidebar is built by walking it (`rowsFromDropdown`), as are the presets, Atlas's layer
   catalogue and the share links. Deleting the node would not have removed a dropdown; it would have
   removed the layers. What is removed is the SURFACE. */
test('R296 ⑦ the classic layer dropdown has no way to be shown, and no setting', () => {
  const css = read('css/intmap.css');
  assert.doesNotMatch(css, /\.layer-dropdown\.show\{/, 'the class that displayed it is gone');
  /* ⚠ anchored at the start of a line: `.map-controls-top .layer-dropdown{pointer-events:auto}` comes
     first in the file and would otherwise be read as the panel's own rule. */
  const base = /\n\s*\.layer-dropdown\{([^}]*)\}/.exec(css);
  assert.ok(base, 'the base rule is still there (it styles the registry inside the phone sheet)');
  assert.match(base[1], /display:none/, 'and it is display:none');

  const dd = code(read('js/layer-dropdown.js'));
  assert.doesNotMatch(dd, /classList\.toggle\('show'\)/, 'nothing toggles it open');
  assert.doesNotMatch(dd, /classList\.remove\('show'\)/, 'and nothing dismisses it, because nothing opens it');
  assert.match(dd, /window\.IntMapLayerSidebar\) window\.IntMapLayerSidebar\.toggle\(\)/, 'the button has ONE destination');

  /* the setting is gone from the markup, from the save, from the load and from the commit */
  const html = read('index.html');
  assert.doesNotMatch(html, /id="setting-layerpanel"/, 'the Settings row is gone');
  const body = code(read('js/app-body.js'));
  assert.doesNotMatch(body, /setting-layerpanel/, 'nothing reads the control');
  assert.doesNotMatch(body, /layerPanelSet/, 'nothing records an explicit choice');
  assert.match(body, /window\.imLayerPanel='right';/, "and the one value is still declared");

  /* the search box that only existed inside it went with it */
  assert.doesNotMatch(code(read('js/map-extras.js')), /IntMapModules\.layerSearch\s*=/, 'the classic search module is gone');
  assert.doesNotMatch(body, /IntMapModules\.layerSearch\(/, 'and is not instantiated');
});

/* ═══ ⑧ THE FOUR TOOL ROWS, AND WHERE EACH FEATURE WENT ══════════════════════════════════════ */
test('R296 ⑧ nothing lost a feature when four rows were removed', () => {
  const ui = read('js/map-ui.js');
  for (const dead of ['sim.disaster', 'sim.transitReach', 'sim.rf', 'sim.earthReplay', 'sim.tsunami'])
    assert.ok(!ui.includes("id:'" + dead + "'"), dead + ' has no row');

  /* 到達圏: one tool, four transports, and the rail model is the one answering the fourth */
  const mt = read('js/map-tools.js');
  assert.match(mt, /transit:'transit',rail:'transit'/, 'the reachable-area panel knows the transport');
  assert.match(mt, /const TR=\(\)=>window\.IntMapTransitReach\|\|null;/, 'and reaches the rail model');
  assert.match(mt, /if\(cost==='transit'\)\{/, 'with a branch of its own');
  assert.match(mt, /t\.open\(\{lng:center\.lng,lat:center\.lat\},budget\)/, 'that calls it rather than re-implementing it');
  /* the two drawings are two sources, so closing has to take BOTH off */
  /* ⚠ js/map-tools.js holds several `function clear()`; this is the reachable-area one, so it is
     found from inside that module rather than by the first match in the file. */
  const iso = mt.slice(mt.indexOf('window.IntMapIsochrone='), mt.indexOf('window.IntMapArc3D='));
  const clear = /function clear\(\)\{([\s\S]*?)panel\.style\.display='none'; \}/.exec(iso);
  assert.ok(clear, 'the reachable-area clear() must be findable');
  assert.match(clear[1], /const t=TR\(\); if\(t&&t\.clear\) t\.clear\(\)/, 'clearing takes the rail drawing too');

  /* 電波・通信圏: a mode of the viewshed, which is the richer of the two models */
  const vs = read('js/viewshed.js');
  assert.match(vs, /let losMode='los';/, 'the viewshed has an analysis mode');
  assert.match(vs, /const horizonKm=\(h\)=>4\.12\*\(Math\.sqrt\(Math\.max\(1,h\)\)\+Math\.sqrt\(2\)\)/, 'the 4/3-earth horizon came across…');
  assert.match(vs, /const fsplKm=\(dbm,mhz\)=>/, '…and so did the free-space link budget');
  assert.match(vs, /setMode:\(m\)=>/, 'and the mode can be set from outside (Atlas uses it)');
  assert.match(code(read('js/atlas-console.js')), /L2\.setMode\(\/\^\(los\|lineOfSight\|viewshed\)\$\/\.test/, 'rfCoverage picks the radio analysis');

  /* the three modules are gone from js/sims.js, with their factories */
  const sims = code(read('js/sims.js'));
  for (const g of ['IntMapRF', 'IntMapDisaster', 'IntMapEarthReplay'])
    assert.doesNotMatch(sims, new RegExp('window\\.' + g + '='), g + ' is gone');
  const body = code(read('js/app-body.js'));
  for (const g of ['rf', 'disaster', 'earthReplay'])
    assert.doesNotMatch(body, new RegExp('IntMapModules\\.' + g + '\\(IM_HOST\\)'), g + ' is not instantiated');
  /* …and transitReach STAYS, because the reachable-area panel calls it */
  assert.match(body, /IntMapModules\.transitReach\(IM_HOST\)/, 'the rail model still loads');
});

/* ═══ ⑨ THE RADIOACTIVE DISPERSION MODEL HAS THE PANEL #R264 MEASURED MISSING ════════════════
   「災害シミュレーターは4つのうち、放射性物質拡散シミュレーションを残し全削除。」 #R264 measured that the
   tools row calls `openPanel()` and that this module had never had one — so removing the wrapper that
   used to reach it would have left the whole feature behind a row that opens nothing. */
test('R296 ⑨ the surviving simulator can be opened, and invents no numbers', () => {
  const sims = read('js/sims.js');
  assert.match(sims, /function openPanel\(ll\)\{/, 'the panel exists');
  assert.match(sims, /return \{ run, clear, isOpen, openPanel, closePanel,/, 'and is exported under the name the row presses');
  assert.match(read('js/map-ui.js'), /window\.IntMapRadiation&&window\.IntMapRadiation\.openPanel\(\)/, 'which is what the row presses');

  /* ⚠ NOTHING RUNS UNTIL THE READER PRESSES 実行, and every number is theirs. #R264's stated reason
     for NOT building this panel was that picking an isotope and a release rate on the reader's behalf
     is invented data — that argues against defaults that RUN, not against a panel. */
  const iGo = sims.indexOf("p.querySelector('.rad-go').onclick=");
  assert.ok(iGo > 0, 'the run button must be findable');
  const go = [null, sims.slice(iGo, iGo + 900)];
  assert.match(go[1], /if\(!site\) return;/, 'it refuses to run without a source the reader placed');
  assert.match(go[1], /source:uiSrc,isotope:uiIso,emitHours:uiEmit,hours:uiHours/, 'and passes only what the controls hold');
  assert.match(sims, /p\.querySelector\('\.rad-pick'\)\.onclick=\(\)=>startPick\(\);/, 'the source is placed on the map');
  /* the panel steps aside while the map is being tapped (#R196) */
  assert.match(sims, /const P=window\.IntMapPick;[\s\S]{0,400}P\.start\(\{ panel, hint,/, 'and uses the shared pick hand-off');
  /* it reports either kind of openness — a panel the reader opened, or a plume Atlas drew */
  assert.match(sims, /const isOpen=\(\)=>\{ if\(panelOpen\(\)\) return true;/, 'openness covers both');
});

/* ═══ ⑩ THE ATLAS ROUTE REPLY ════════════════════════════════════════════════════════════════ */
test('R296 ⑩ the route reply opens with the answer, and says one honest sentence', () => {
  const a = read('js/atlas-console.js');
  assert.match(a, /const _hdr='';/, 'the header is empty');
  assert.doesNotMatch(code(a), /_rmodes\(/, 'the mode-switch row is not built…');
  assert.doesNotMatch(code(a), /class="atl-route-modes"/, '…and its markup is not emitted');
  assert.doesNotMatch(code(a), /\.atl-route-mode\[data-rmode\]/, 'nor is there a handler for markup that cannot exist');
  assert.doesNotMatch(code(a), /#atlas-panel \.atl-route-mode\{/, 'nor CSS for it');

  /* the note keeps the CAVEAT and drops the provider name and the instruction */
  const note = /L\('Times are typical \(no live traffic\)\.','所要時間は交通状況を含まない標準値です。'/g;
  assert.equal((a.match(note) || []).length, 2, 'both provider branches say the same one sentence');
  assert.doesNotMatch(code(a), /up to 3 alternatives with lane guidance/, 'the provider blurb is gone');
  assert.doesNotMatch(code(a), /Clear it with "clear the route"/, 'and so is the instruction');
});

/* ═══ ⑪ 「Atlasはユーザーが送ったメッセージもコピーできるように」 ══════════════════════════════════ */
test('R296 ⑪ a reader’s own message can be copied, by the same button', () => {
  const a = read('js/atlas-console.js');
  assert.match(a, /function copyBtn\(src\)\{/, 'there is ONE copy button');
  assert.equal((a.match(/navigator\.clipboard\.writeText\(src\.innerText/g) || []).length, 1,
    'and one implementation of what 「copy」 means');
  assert.match(a, /if\(who==='u'\)\{[\s\S]{0,200}bar\.appendChild\(copyBtn\(d\)\)/, 'a user bubble gets it');
  assert.match(a, /bar\.appendChild\(copyBtn\(aiEl\)\)/, 'and so does a reply');
  /* Retry stays on the reply only — re-running the reader's own sentence is that same Retry */
  const u = /if\(who==='u'\)\{([\s\S]{0,300})/.exec(a);
  assert.ok(u && !/Retry|再試行/.test(u[1]), 'a user bubble gets Copy and not Retry');
  /* ══ ⚠⚠⚠ (#R296 追記) THE ICON MUST CLOSE ITS OWN TAG, AND THE LABEL MUST SURVIVE IT ═══════════
     MEASURED ON PRODUCTION after this round's deploy: BOTH copy buttons — the reply's and the
     reader's — rendered as a half-drawn rectangle with NO text beside it. The cause was in the
     source above, and it was mine: `cpSvg` was pasted from a TRUNCATED console print and ended
     mid-attribute (`…<path d="M5 15V5a2 2 0 0 1 2-2h1`), so the HTML parser swallowed everything
     after it — the closing `</svg>` AND the `<span>` carrying the word 「Copy」.
     ⚠ `node --check` cannot see this: the JavaScript is valid, the HTML inside the string is not.
     ⚠ And it broke a button that ALREADY WORKED — #R72's Copy on every reply — which is precisely
     what 「余計な変更をするな」 exists to prevent. The check is about the STRING, because that is
     where the defect was, and it is cheap enough to run on every commit. */
  const cp = /const cpSvg='([^']*)';/.exec(a);
  assert.ok(cp, 'the copy icon must be findable');
  assert.match(cp[1], /^<svg[ >]/, 'it starts as an svg…');
  assert.match(cp[1], /<\/svg>$/, '…and CLOSES as one');
  assert.equal((cp[1].match(/</g) || []).length, (cp[1].match(/>/g) || []).length,
    'every tag in the icon is terminated — an unterminated one eats whatever follows it');
  assert.match(a, /b\.innerHTML=cpSvg\+'<span>'\+L\('Copy'/, 'the label follows the icon…');
  assert.match(a, /'Copiar'\)\+'<\/span>'/, '…and the span is closed');
  /* ⚠ and the auto-scroll that assumed the reply's previous sibling IS the user message still works */
  assert.match(a, /while\(ub&&ub\.classList&&ub\.classList\.contains\('atl-msgt'\)\) ub=ub\.previousElementSibling;/,
    'the scroll walk skips the copy bar it now has to step over');
});

/* ═══ ⑫ THE CARD OPENS ═══════════════════════════════════════════════════════════════════════
   「経路の選択肢からひとつをえらんだときに、詳細が経路候補一覧の下に表示されるのではなく、経路カードが
     広がって詳細が表示されるUIに。」 #R291 put the detail below the list and wrote down why: a list of
   step BUTTONS cannot be nested inside a card that is itself a button. So the card stops being one. */
test('R296 ⑫ the selected route card holds its own detail, and a step press is a step press', () => {
  const c = read('js/routing-cards.js');
  assert.match(c, /<div class="rt-alt/, 'the card is a div…');
  assert.match(c, /role="radio"[^>]*tabindex=/, '…with the role the radiogroup around it already declared');
  assert.match(c, /o\.detail === 'function'/, 'and it can be given a detail to hold');

  const ui = read('js/routing-ui.js');
  assert.match(ui, /detail: \(i2, a2\) => detailFor\(a2\)/, 'the panel supplies it');
  /* ⚠ ORDER MATTERS NOW. With the detail nested in the card, `closest('.rt-alt')` also matches a
     press on a STEP; testing the card first would swallow every turn press and re-select the same
     alternative — which looks exactly like 「押しても何も起きない」 (#R268 counted that three times). */
  /* ⚠ (#R296) comments stripped FIRST. The note beside these two branches explains the ordering by
     naming `.rt-alt`, and reading it as code is the twenty-second instance of a check hitting the
     comment that documents the very thing it is asserting. */
  const onClick = code(ui).slice(code(ui).indexOf('function onClick(e)'));
  const iStep = onClick.indexOf(".rt-step'");
  const iAlt = onClick.indexOf(".rt-alt'");
  assert.ok(iStep > 0 && iAlt > 0, 'both branches exist');
  assert.ok(iStep < iAlt, 'the step is tested before the card');

  const css = read('css/intmap.css');
  assert.match(css, /\.rt-alt-detail\{/, 'the detail has a style of its own');
  assert.match(css, /\.rt-alt\{\s*\n\s*display:flex; flex-direction:column;/, 'and the card is a column that can hold it');
});
