/* ============================================================================
 *  IntMap · #R243 — source-level contracts for this round
 * ----------------------------------------------------------------------------
 *  Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
 *  which is the only thing that makes a green suite mean anything (#R228).
 *  Comments are stripped before matching wherever a test looks for a fragment that this file's own
 *  prose could contain ([[intmap-recurring-lessons]] E, nine rounds running).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const node = (...a) => execFileSync(process.execPath, a.map((x) => (x.startsWith('-') ? x : join(ROOT, x))), { cwd: ROOT, encoding: 'utf8' });

/* ── ① the map's own letters sit on the baseline ──────────────────────────────────────────────── */
test('R243 ① every committed glyph carries the metrics the font says, `top` included', () => {
  /* --check re-derives every glyph from fonts/src/Inter.ttf and compares width/height/left/top/
     advance against the committed atlas. #R242's version compared only the SET of codepoints, which
     a file with every glyph at the wrong `top` passes without a word — that was the defect. */
  const out = node('scripts/build-glyphs.mjs', '--check');
  assert.ok(/glyph atlases check out/.test(out), 'scripts/build-glyphs.mjs --check must pass:\n' + out);
});

test('R243 ① the builder writes `top` as the distance to the TOP of the box', () => {
  const c = code(read('scripts/build-glyphs.mjs'));
  /* ⚠ (#R247) the EDGE is still the top of the box (that is what this test was written for) — what
     changed is the ORIGIN it is measured from. A server font's `top` is relative to a point 27 units
     ABOVE the alphabetic baseline, not to the baseline itself (MapLibre calls the same number
     `topAdjustment = 27.5` where it converts TinySDF metrics into this convention). Writing it from
     the baseline drew every Latin glyph 1.125 em high, which is invisible on a bare place label and
     is why the news band's pill and its text came apart. */
  assert.ok(/left:\s*x0,\s*top:\s*-y0\s*-\s*TOP_ORIGIN,/.test(c),
    '`top: -y0 - h` is the distance to the glyph BOTTOM and `-y0` alone is measured from the wrong '
    + 'origin — MapLibre places the quad at (−top − border) in the SERVER convention');
  assert.ok(/const TOP_ORIGIN\s*=\s*27\b/.test(c),
    'and the origin is 27 units above the baseline — measured against the font this atlas replaces');
  assert.ok(/o\.top\s*\|\s*0\)\s*!==\s*g\.top/.test(c) || /o\.top\s*!==\s*g\.top/.test(c),
    '--check must compare `top`, or a wrong metric can be committed again');
});

/* ── ② a docked panel is placed by the column, not by the rule that floats it over a phone's map ─ */
test('R243 ② the dock geometry reset is scoped to #docked-feed, so it outranks the float rules', () => {
  const css = read('css/intmap.css');
  assert.ok(/#docked-feed \.im-docked\{\s*\n?\s*position:relative !important/.test(css)
    || /#docked-feed \.im-docked\{[\s\S]{0,80}position:relative !important/.test(css),
    'the geometry reset must be `#docked-feed .im-docked` (1,1,0) — bare `.im-docked` (0,1,0) loses to '
    + '`.koppen-legend:not([data-dragged])` (0,2,0), which is where the 64 px / 6 px offsets came from');
  /* …and the rule it has to beat is still there, unchanged: this is a specificity fix, not a deletion */
  assert.ok(/\.koppen-legend:not\(\[data-dragged\]\)[^{]*\{[^}]*left:6px !important/.test(css),
    'the phone float placement must be untouched — it is correct for a legend that floats over the map');
  /* every geometry-adjacent .im-docked rule carries the id, or the next class rule wins again */
  const bare = (css.match(/(^|\n)\s*\.im-docked[^\n]*\{/g) || []).filter((r) => !/#docked-feed/.test(r));
  assert.equal(bare.length, 0, 'no bare `.im-docked{…}` rule may remain:\n' + bare.join('\n'));
});

/* ── ③ a panel that appears has to be somewhere the reader is looking ─────────────────────────── */
test('R243 ③ revealing a docked panel opens the sidebar / raises the sheet, tab state aside', () => {
  const wm = code(read('js/window-manager.js'));
  const rev = wm.slice(wm.indexOf('function _reveal('), wm.indexOf('function _reveal(') + 1200);
  assert.ok(/ui\.sidebar\.open/.test(rev), '_reveal must open a collapsed desktop sidebar');
  assert.ok(/__setDetent\('half'\)/.test(rev), "_reveal must raise a phone's sheet to 'half'");
  /* both are unconditional now: «is the right tab up» and «is the column visible» are different questions */
  assert.ok(!/!already&&window\.matchMedia/.test(rev),
    'the detent must not be gated on `already` — the reported case is the Panels tab already selected with the sheet at peek');
  assert.ok(/IntMapOS\.register\('ui\.sidebar\.open'/.test(code(read('js/app-body.js'))),
    'the sidebar open must be an OS action so it goes through applySidebarStyle + the resize event + the session save');
});

test('R243 ③ the reveal arms on the first input, so a restored session does not scroll itself', () => {
  const wm = code(read('js/window-manager.js'));
  assert.ok(/__revealArmed/.test(wm) && /pointerdown[\s\S]{0,80}once:true/.test(wm),
    'legends created while a saved session restores are not popups somebody opened');
});

/* ── ④ the empty line is derived from the column, not from a Map that can go stale ─────────────── */
test('R243 ④ the docked count is read off #docked-feed and the feed is watched', () => {
  const wm = code(read('js/window-manager.js'));
  const sync = wm.slice(wm.indexOf('function _dockEmptySync('), wm.indexOf('function _dockEmptySync(') + 500);
  assert.ok(/querySelectorAll\(':scope > \.im-docked'\)/.test(sync),
    'the count must come from the DOM — a panel removed while docked leaves `__docked` stale and the line never returns');
  assert.ok(/_feedWatch/.test(wm) && /observe\(host,\{childList:true\}\)/.test(wm),
    '#docked-feed childList must be observed so a removal by any route puts the line back');
});

/* ── ⑤ the earthquake panel ───────────────────────────────────────────────────────────────────── */
test('R243 ⑤ a loaded earthquake hides the source and parameter cards, keeping the intensity scale', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/\+\(evNow\?''\:\(''/.test(c),
    'cards 2 and 3 must be wrapped in `evNow ? "" : (…)` — a published earthquake is not a form');
  const scaleCard = c.indexOf("+(evNow?('<div><div class=\"sq-cap\">'");
  assert.ok(scaleCard > 0, 'the intensity-scale card must be drawn when an event IS loaded (the one exception the reader named)');
  assert.ok(/sq-scale sq-sel/.test(c.slice(scaleCard, scaleCard + 700)), 'and it must be the same `.sq-scale` control, not a copy');
});

test('R243 ⑤ the result card no longer restates the source or the solver telemetry', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(!/f<sub>c<\/sub>/.test(c) && !/fld\.stats\.ms\+' ms'/.test(c),
    'the M / depth / M₀ / f_c line and the z-level / cell-count / milliseconds line are both out');
  assert.ok(/The parameters changed — press ▶ to recompute/.test(c),
    'the one INSTRUCTION in that block stays — the reader has to act on it');
});

test('R243 ⑤ the progress bar appears under the button that starts it', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function _progHTML\(/.test(c), 'one builder for the bar');
  /* ⚠ (#R244) 「計算進捗ボタンが二つあるから下部のものだけにしろ。」 — two bars moving for one solve is
     what the reader saw, and the one that answers 「押したものは動いているか」 is the one under the
     pinned button. The card-4 copy is deleted, so this is declared once and used once. What the
     round-243 report was actually about — the bar being where the button is — is unchanged and is
     the line below it. */
  assert.equal((c.match(/_progHTML\(/g) || []).length, 2, 'declared once, used once — in the pinned footer');
  assert.ok(/panel\.querySelectorAll\('\.sq-prog'\)/.test(c),
    '_setProg must write EVERY .sq-prog — two readouts of one state cannot be allowed to disagree');
  assert.ok(!/Done — press ▶ above to watch the waves/.test(c), '「完了しました」 line is gone');
});

test('R243 ⑤ the transport is a labelled cluster and the tsunami button carries no emoji', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/sq-pl-cap/.test(c) && /sq-pl-jump/.test(c), 'the caption and the two jump buttons');
  assert.ok(/tl\.dispatchEvent\(new Event\('input'/.test(c), 'the jumps must go through the scrubber, not move time themselves');
  const tsu = c.slice(c.indexOf('sq-tsu-ic'), c.indexOf('sq-tsu-ic') + 600);
  assert.ok(!/🌊/.test(tsu), '「Open the tsunami simulatorには絵文字を使うな」');
});

/* ── ⑥ the simulator is reachable from the Layers panel a reader actually opens ────────────────── */
test('R243 ⑥ the tile browser carries a Tools row that runs the OS action', () => {
  const c = code(read('js/map-ui.js'));
  assert.ok(/function toolsBlock\(/.test(c) && /root\.appendChild\(toolsBlock\(\)\)/.test(c),
    'the row must be built into the tile browser — #layer-tools lives in #layer-dropdown, which is display:none on the default setting');
  assert.ok(/id:'sim\.seismic'/.test(c) && /OS\.exec\(t\.id/.test(c),
    'and it must go through IntMapOS, so the palette, the right-click menu and this row are one path');
});

/* ── ⑦ every U.S. presidential election ───────────────────────────────────────────────────────── */
test('R243 ⑦ the election dataset is sixty elections and every cell resolves', () => {
  assert.ok(existsSync(join(ROOT, 'data/us-elections.json')), 'data/us-elections.json is committed');
  const d = JSON.parse(read('data/us-elections.json'));
  const geo = JSON.parse(read('data/us-states.json'));
  const codes = new Set(geo.features.map((f) => f.properties.st));
  assert.equal(d.elections.length, 60, '1789 → 2024 inclusive is sixty elections');
  assert.equal(d.elections[0].y, 1789);
  assert.equal(d.elections[59].y, 2024);
  assert.equal(geo.features.length, 51, '50 states + DC');
  let cells = 0;
  for (const e of d.elections) {
    assert.ok(e.c.length >= 2, e.y + ': at least two candidates');
    assert.ok(e.t > 0, e.y + ': the elector total is what a majority is taken of');
    for (const st of Object.keys(e.s)) {
      cells++;
      assert.ok(codes.has(st), e.y + ': ' + st + ' is not a state in the geometry');
      assert.ok(e.s[st] >= 0 && e.s[st] < e.c.length, e.y + ' ' + st + ': candidate index out of range');
    }
    for (const c of e.c) assert.ok(d.parties[c.p], e.y + ': unknown party ' + c.p);
  }
  assert.ok(cells > 2000, 'the state matrix is the whole point: ' + cells + ' cells');
  /* the years a party label cannot answer, spot-checked against the record */
  const at = (y, st) => { const e = d.elections.find((x) => x.y === y); return e.c[e.s[st]].n; };
  assert.equal(at(1789, 'VA'), 'George Washington');
  assert.equal(at(1824, 'OH'), 'Henry Clay');
  assert.equal(at(1836, 'MA'), 'Daniel Webster');
  assert.equal(at(1860, 'KY'), 'John Bell');
  assert.equal(at(1860, 'MO'), 'Stephen A. Douglas');
  assert.equal(at(1912, 'PA'), 'Theodore Roosevelt');
  assert.equal(at(1948, 'SC'), 'Strom Thurmond');
  assert.equal(at(1968, 'AL'), 'George Wallace');
  assert.equal(at(2024, 'PA'), 'Donald Trump');
  assert.equal(at(2020, 'GA'), 'Joe Biden');
  /* a state that did not exist yet must be ABSENT, never present-with-a-party */
  assert.equal(d.elections.find((e) => e.y === 1789).s.CA, undefined, 'California did not vote in 1789');
});

test('R243 ⑦ «did not vote» is expressed in the colour, because the opacity slider owns fill-opacity', () => {
  const c = code(read('js/us-elections.js'));
  assert.ok(/'fill-color':\['coalesce',\['get','col'\],'rgba\(0,0,0,0\)'\]/.test(c),
    'a `fill-opacity` expression is replaced by _registerLayerOpacity the moment the slider initialises');
  assert.ok(/delete f\.properties\.col/.test(c),
    'the property must be ABSENT, not null — coalesce over a present-but-null property does not fall through');
});

/* ── ⑧ the UV widget's sub-line is three answers, not one run-on ───────────────────────────────── */
test('R243 ⑧ the UV card states the peak, the time and the qualifiers on their own lines', () => {
  /* ⚠ (#R292) SAME REQUIREMENT, STRUCTURAL INSTEAD OF STRING-BUILT. The complaint was that the UV
     card ran its three answers together into one interpunct-separated line. The card no longer
     assembles a line at all: the peak is the value, the two readings are rows of a `<dl>` fact grid,
     and the qualifier is its own element — so they cannot be concatenated back together, and the
     bracket-per-script problem the old code hand-coded does not arise because no bracket is typed. */
  const c = code(read('js/widget-defs-data.js'));
  const uv = c.slice(c.indexOf("id: 'env.uv'"), c.indexOf("function peakUV("));
  assert.ok(uv.length > 500, 'the UV definition was found');
  assert.ok(/R\.facts\(\[/.test(uv), 'the readings are separate rows, not one run-on line');
  assert.ok(/R\.where\(/.test(uv), 'and the qualifier is its own line');
  /* ⚠ THREE ELEMENTS, NOT THREE SUBSTRINGS. The old defect was a single `wgt-s` line carrying the
     peak, the time and the qualifiers joined by interpuncts; what makes that impossible now is that
     the value, the readings and the qualifier are three separate NODES. (An interpunct still joins
     the place to «clear sky» INSIDE the qualifier line — two facts on one line was never the
     complaint; three answers crushed into one was.) */
  assert.ok(/R\.value\(\{[\s\S]{0,220}unit: 'UV'/.test(uv), 'the peak is the card value');
  assert.ok((uv.match(/R\.facts\(\[/g) || []).length >= 1 && /k: L\('Now'/.test(uv),
    'the current and peak readings are labelled rows');
});

/* ── ⑨ the translation gates ──────────────────────────────────────────────────────────────────── */
test('R243 ⑨ the ninth surface is a gate now, and it is at zero', () => {
  const audit = code(read('scripts/i18n-audit.mjs'));
  assert.ok(/problems\.push\(`\$\{helper\.sites\}/.test(audit),
    'the helper-ternary count must FAIL the gate, not merely print — #R242 wrote down that promotion as the condition');
  const out = node('scripts/i18n-helper-ternary-audit.mjs');
  assert.ok(/no `jp\(\) \? … : …` translation pairs left/.test(out), out);
});

test('R243 ⑨ the positional audit reads `IntMapLang.t(lang, …)` too — the tenth blind spot', () => {
  /* ⚠ (#R251) THE SHAPE MOVED, THE QUESTION DID NOT. This used to grep
     scripts/i18n-positional-audit.mjs for `property.name === 't'`. #R251 resolved «which calls are
     translation calls» ONCE, repo-wide, in scripts/i18n-helpers.mjs — because the same question was
     answered three times, per file, and all three were wrong about a helper reached through a
     property. Asserting on the old ADDRESS would now fail while the capability is intact, so the
     assertion is on the capability: the shared resolver still knows `t()`, and the audit still uses
     the shared resolver rather than growing a fourth private copy. */
  const c = code(read('scripts/i18n-positional-audit.mjs'));
  const h = code(read('scripts/i18n-helpers.mjs'));
  assert.ok(/property\.name === 't'/.test(h) && /IntMapLang\$/.test(h),
    'de/ru/es were unmeasured at every `t()` site, and #R243 converted 467 more into that shape');
  assert.ok(/from '\.\/i18n-helpers\.mjs'/.test(c) && /shapeOf\(/.test(c),
    'the positional audit must ask the shared resolver, not carry its own — three private copies is '
    + 'how #R251 found 65 five-language call sites outside every measurement');
  const out = node('scripts/i18n-positional-audit.mjs');
  assert.ok(/total outstanding: 0/.test(out), out.slice(0, 1200));
  const sites = +((/call sites parsed: (\d+)/.exec(out) || [])[1] || 0);
  assert.ok(sites > 3000, 'the widened universe is ~3,200 sites, not the ~2,400 the old shape saw; got ' + sites);
});

test('R243 ⑨ one dictionary, six columns, and every row complete', () => {
  const apply = code(read('scripts/i18n-apply-inline.mjs'));
  assert.ok(/length !== 6/.test(apply), 'a short row is a half-finished translation and must fail the build');
});
