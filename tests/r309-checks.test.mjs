/* ============================================================================
 *  IntMap · #R309 — source-level checks
 * ----------------------------------------------------------------------------
 *  Seven reports in one message:
 *    ①「CountriesのGDP/Descendingの行、フロストガラスにしたら四角の不要な背景が出てくる。消して。」
 *    ②「昔の国の国名ラベルを、今とおなじでクリック可能にして。そして、昔の国名ラベルの見た目や
 *        挙動も今の国名ラベルと完全に同じに。」
 *    ③「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて
 *        用意して変えるようにして。」
 *    ④「フロストガラス時のAtlasの入力欄が、フロストガラスになっていない。（News, Companies,
 *        Countriesの検索欄も）」
 *    ⑤「フロストガラス時に、サイドバーを左右両方開けると、地名検索バーが潰れる。」
 *    ⑥「Base map & labelsは、タイル形式ではなく、トグルで行で並べる形式に。サムネイル画像は
 *        いらない。あと、Base map & labelsのオン数をレイヤーのオン数にみなすな。」
 *    ⑦「『レイヤーサムネイル』フォルダに、各レイヤー用のサムネイル画像を入れておいたので、
 *        それをすべて使って実際にレイヤータイルにいれてください。」
 *
 *  ⚠ EVERY ASSERTION BELOW IS A RELATION BETWEEN TWO PLACES IN THE REPOSITORY, NOT A SPELLING.
 *  Twenty-four rounds running, a legitimate change here has been turned red by a check that pinned a
 *  literal — #R306's own ⑥ pinned a character-counted window that CRLF pushed 11 bytes wider, so CI
 *  was green and Windows was red. So: ② asks 「is the era label the same VALUES as ofm-country」 by
 *  reading BOTH layer definitions, ⑥ asks 「does every counter subtract the SAME published list」,
 *  and ⑦ asks the file system and the module about each other. None of them can be satisfied by
 *  copying a number into this file, and none of them notices a reworded comment.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing (23 rounds of exactly that) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* the body of a named function declaration, brace-balanced (#R228 / #R307) */
function fnBody(src, name) {
  /* the three shapes this repository declares a function in — a declaration, a property assignment
     and an arrow — so a check does not go red because the author picked a different one */
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>)').exec(src); if (m) start = m.index; }
  assert.notEqual(start, -1, 'a function called ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* ⚠ A CSS RULE IS NOT A LINE. #R306 lost a round to a check that measured a byte window; this one
   would have lost it to a check that assumed the author kept a selector and its declarations on one
   line. Split the stylesheet into real rules and ask each rule about itself. */
function cssRules(src, fromJs) {
  const flat = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(flat))) {
    let sel = m[1].replace(/\s+/g, ' ').trim();
    /* a stylesheet injected from JS arrives as `…' +'<selector>{…}'` — everything up to the last
       quote is the concatenation, not the selector */
    if (fromJs) { const q = sel.lastIndexOf("'"); if (q >= 0) sel = sel.slice(q + 1).trim(); }
    out.push({ sel, body: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}
/* the brace-balanced object literal a layer is DEFINED by: `{id:'<layerId>', … }` */
function layerDef(src, id) {
  const start = src.indexOf("{id:'" + id + "'");
  assert.notEqual(start, -1, "the layer definition for '" + id + "' exists");
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces in the definition of ' + id);
}
/* one `'<key>':<value>` out of a layer definition, as source text */
function prop(def, key) {
  const m = new RegExp("'" + key + "':\\s*([^,}]+)").exec(def);
  return m ? m[1].trim() : null;
}

/* ══ ② 昔の国名ラベルは、現代の国名ラベルと「同じラベル」である ═══════════════════════════════
   The report is two halves — clickable, and identical to look at — and the second half is the one a
   check can hold. Both definitions are read here, so the day somebody restyles ofm-country the era
   labels are required to move with it. */
const PL = code('js/place-labels.js');
const TB = code('js/time-borders.js');
const MODERN = layerDef(PL, 'ofm-country');
const ERA = ['imtb-lbl', 'imtb-lbl2'].map((id) => ({ id, def: layerDef(TB, id) }));

test('r309 ② the era country labels carry the same values as ofm-country', () => {
  /* the plain values: whatever ofm-country says, both era layers must say */
  for (const key of ['text-letter-spacing', 'text-max-width', 'text-padding', 'text-color', 'text-halo-color', 'text-halo-width']) {
    const want = prop(MODERN, key);
    assert.ok(want, 'ofm-country declares ' + key);
    for (const e of ERA) {
      assert.equal(prop(e.def, key), want, e.id + ' uses ofm-country\'s ' + key + ' (' + want + ')');
    }
  }
  /* the size RAMP is a call into js/label-scale.js — the two files spell the module differently
     (`LS` vs `window.IntMapLabelScale`), so compare the ARGUMENT, which is the tier being asked for */
  const tier = (def) => { const m = /place\('([a-z]+)'\)/.exec(prop(def, 'text-size') || ''); return m && m[1]; };
  assert.equal(tier(MODERN), 'country', 'ofm-country asks IntMapLabelScale for the country tier');
  for (const e of ERA) assert.equal(tier(e.def), tier(MODERN), e.id + ' asks for the same label tier');
});

test('r309 ② the era labels open at the same zooms as ofm-country', () => {
  const zoomOf = (def, k) => { const m = new RegExp('\\b' + k + ':\\s*([0-9.]+)').exec(def); return m ? Number(m[1]) : null; };
  const maxz = zoomOf(MODERN, 'maxzoom');
  assert.ok(maxz, 'ofm-country has a maxzoom');
  for (const e of ERA) {
    assert.equal(zoomOf(e.def, 'maxzoom'), maxz, e.id + ' stops where ofm-country stops');
    /* ofm-country has no floor, so neither may they — a floor is what made the past disappear at
       world zoom while the present kept its names */
    assert.equal(zoomOf(MODERN, 'minzoom'), null, 'ofm-country has no minzoom');
    assert.equal(zoomOf(e.def, 'minzoom'), null, e.id + ' has no minzoom either');
  }
});

test('r309 ② the era labels get a REAL font family, and the basemap re-paints them', () => {
  /* js/map-typography.js records that «Noto Sans Regular» is not an installed family and that
     MapLibre 5 therefore rasterises it through sans-serif. Neither era label may name it. */
  for (const e of ERA) assert.ok(!/Noto Sans Regular/.test(e.def), e.id + ' does not ask for the retired stack');
  /* …and the face they DO ask for is the one for text already in the reader's language */
  assert.ok(/readerFont\(\)/.test(TB), 'js/time-borders.js takes its face from IntMapMapTypography.readerFont()');
  /* the colours above are the birth values; the basemap swap is what keeps them true afterwards */
  const body = fnBody(PL, 'applyLabelLang');
  for (const e of ERA) assert.ok(body.includes(e.id), 'applyLabelLang re-paints ' + e.id + ' with the rest of the country labels');
});

test('r309 ② an era-label click says that it is spoken for', () => {
  /* THE root cause: js/map-ui.js's generic fallback calls clearHL() — which removes the popup —
     whenever the tap missed everything in ALL_LBL, and it runs in a microtask, i.e. always after
     this synchronous handler. #R210 built claimClick/clickClaimed for exactly this collision. */
  const opener = fnBody(TB, '_openEra');
  assert.ok(/claimClick\(/.test(opener), 'the era opener claims the click');
  assert.ok(/_imPlacePopup\(/.test(opener), 'the era opener still opens the shared place popup');
  /* and the per-layer handler goes through that one door rather than repeating its body */
  assert.ok(/_openEra\(/.test(TB.slice(TB.indexOf('const _clk='), TB.indexOf('const _clk=') + 1600)), 'the per-layer click calls the opener');
  /* the fallback it has to survive is still the one described above */
  const MU = code('js/map-ui.js');
  assert.ok(/clickClaimed/.test(MU), 'js/map-ui.js still steps aside for a claimed click');
});

test('r309 ② the era labels have the padded tap the modern labels have', () => {
  /* js/map-ui.js has given every place label a padded hit-box since #R23 because "a finger tap
     almost never lands on the exact label glyph". Read ITS radii and require the same two. */
  const MU = code('js/map-ui.js');
  const pads = [...MU.matchAll(/isMobile\(\)\)\s*\?\s*(\d+)\s*:\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pads.length, 'js/map-ui.js declares a touch radius and a mouse radius');
  const [touch, mouse] = pads[0];
  const era = TB.slice(TB.indexOf("['imtb-lbl','imtb-lbl2'].forEach"));
  assert.ok(/queryRenderedFeatures\(\[\[/.test(era), 'the era labels are queried with a BOX, not only a point');
  assert.ok(new RegExp('pad\\s*=\\s*' + mouse + '\\b').test(era), 'the era mouse radius is the one map-ui uses (' + mouse + ')');
  assert.ok(new RegExp('pad\\s*=\\s*' + touch + '\\b').test(era), 'the era touch radius is the one map-ui uses (' + touch + ')');
});

/* ══ ⑥ 「Base map & labels」は1つの一覧であり、数える側は全部それを引く ══════════════════════════ */
const DL = code('js/data-layers.js');

test('r309 ⑥ the base-map section is ONE published list, and it covers every row in the section', () => {
  /* ⚠ both halves are on `window`: js/data-layers.js is a module, so a top-level `const` would be
     private to it and js/widget-core.js could not subtract the same list (tests/r175 ③ fails the
     shape outright, which is how the first attempt at this was caught). */
  const cb = /window\.IntMapBasicLayerRows\s*=\s*\[([^\]]*)\]/.exec(DL);
  assert.ok(cb, 'js/data-layers.js publishes IntMapBasicLayerRows');
  const cbIds = cb[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  /* ⚠⚠ (#R469) THE FLOOR IS 9, AND WHAT IT PROTECTS IS UNCHANGED. This number is not a count of
     the section — it is a guard against the list being quietly emptied, which is the shape #R309
     found (four hand-written copies of this membership, disagreeing). `cb-countries` left it by
     instruction (「国境・国情報レイヤーは完全削除して」, narrowed by the reader to 「レイヤー行だけ隠す」),
     so it is now in `window.IntMapHiddenLayerRows` instead: the checkbox is still in the registry
     and the layer still works, it simply has no row.
     ⚠ AND ONE INVARIANT WAS DELIBERATELY GIVEN UP, so it is written down rather than left to be
     inferred from a smaller number: `cb-countries` is no longer SUBTRACTED from the layer counters
     either. #R309's rule was 「Base map & labels のオン数をレイヤーのオン数にみなすな」, and that still
     holds for the nine rows this section draws — but a layer with no row and no chip cannot be
     switched off at all, so the 「表示中のレイヤー」 chip is now its only handle and it has to count. */
  assert.ok(cbIds.length >= 9, 'the checkbox half of the section is there (' + cbIds.length + ')');
  const pub = /IntMapBasicLayers\s*=\s*window\.IntMapBasicLayerRows\.concat\(\[([^\]]*)\]\)/.exec(DL);
  assert.ok(pub, 'window.IntMapBasicLayers is those rows plus the ones that were moved in');
  const extra = pub[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

  /* ⚠ THE GUARD THAT WOULD HAVE CAUGHT #R271 AND #R273. `reorganizeLayerPanel` builds the section by
     pushing rows until the first divider; every `rowFor('x')` in that stretch is a member. Two of
     them were added in later rounds and no counter learned about them. */
  const from = DL.indexOf('const order=[];');
  const to = DL.indexOf('order.push(mkHr())', from);
  assert.ok(from > 0 && to > from, 'the section-building stretch is identifiable');
  const keys = [...DL.slice(from, to).matchAll(/rowFor\('([a-z0-9]+)'\)/g)].map((m) => m[1]);
  assert.equal(keys.length, extra.length, 'every row pushed into the section is published (' + keys.join(', ') + ')');
  for (const k of keys) {
    assert.equal(extra.filter((id) => id.includes(k)).length, 1, "'" + k + "' is in window.IntMapBasicLayers exactly once");
  }
});

test('r309 ⑥ every counter subtracts that list, and none keeps a copy of it', () => {
  const counter = fnBody(DL, '_refreshActiveLayers');
  assert.ok(/IntMapBasicLayers/.test(counter), 'the "Active layers (N)" counter reads the published list');
  /* the copy it replaced was a Set of ten-plus `'cb-…'` literals; a new one must not appear */
  const literals = (counter.match(/'cb-[a-z0-9]+'/g) || []).length;
  assert.ok(literals === 0, 'the counter holds no hand-written copy of the section (' + literals + ' found)');

  const WC = code('js/widget-core.js');
  const active = WC.slice(WC.indexOf('WC.activeLayers'), WC.indexOf('WC.setLayer'));
  assert.ok(/IntMapBasicLayers/.test(active), 'the widget deck\'s layer count subtracts the same list');
});

test('r309 ⑥ the base-map section is drawn as switch rows with no thumbnail', () => {
  const MU = code('js/map-ui.js');
  const build = fnBody(MU, 'buildTiles');
  assert.ok(/lst-rows/.test(build), 'buildTiles gives the basics section its own container class');
  assert.ok(/secName===basics/.test(build), 'the row shape is chosen by the section, not by a second id list');
  assert.ok(/tileFor\(r,\s*\w+\)/.test(build), 'the shape is passed to the one tile builder');

  const tile = fnBody(MU, 'tileFor');
  assert.ok(/asRow/.test(tile), 'tileFor knows the row shape');
  /* the thumbnail must be unreachable in the row shape: its creation sits in the else branch */
  const prevAt = tile.indexOf("className='lst-prev'");
  const elseAt = tile.indexOf('else{');
  assert.ok(prevAt > 0 && elseAt > 0 && prevAt > elseAt, 'the preview element is only built for the tile shape');
  assert.ok(/lst-sw/.test(tile), 'the row carries a switch');
  assert.ok(/role','switch'/.test(tile) && /aria-checked/.test(tile), 'the row is a switch to a screen reader too');

  /* both mounts, exactly as .lst-toolrow does it — the phone sheet builds through the same function */
  const css = read('js/map-ui.js');
  for (const sel of ['.lst-grid.lst-rows', '.lst-tile.lst-row', '.lst-sw']) {
    const line = css.split('\n').find((l) => l.includes("#layer-sidebar-r " + sel + '{') || l.includes("#layer-sidebar-r " + sel + ','));
    assert.ok(line, 'the sidebar rule for ' + sel + ' exists');
    assert.ok(line.includes('.lsr-mount ' + sel), 'the phone sheet gets ' + sel + ' in the same rule');
  }
});

/* ══ ⑦ タイルのサムネイル — 参照とファイルが双方向で一致する ═══════════════════════════════════ */
test('r309 ⑦ every preview the module names exists, and every preview on disk is named', () => {
  const src = read('js/layer-previews.js');
  const refs = [...new Set((src.match(/'preview_[a-z0-9_]+\.png'/g) || []).map((s) => s.slice(1, -1)))].sort();
  const files = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f)).sort();
  assert.ok(refs.length >= 28, 'the module names the whole set (' + refs.length + ')');
  for (const r of refs) assert.ok(existsSync(resolve(ROOT, r)), r + ' is in the repository');
  /* the other direction is the one that rots: a file nothing references is dead weight in a deploy
     that copies EVERY root-level png (vite.config.js ROOT_PNG) */
  for (const f of files) assert.ok(refs.includes(f), f + ' is referenced by js/layer-previews.js');
});

test('r309 ⑦ the previews are the tile\'s own aspect ratio, so `cover` crops nothing', () => {
  /* the tile canvas declares its own geometry; read it rather than restating 240/121 here */
  const src = read('js/layer-previews.js');
  const m = /const W=(\d+),H=(\d+)/.exec(src);
  assert.ok(m, 'js/layer-previews.js declares the preview canvas size');
  const want = Number(m[1]) / Number(m[2]);
  for (const f of readdirSync(ROOT).filter((x) => /^preview_.*\.png$/.test(x))) {
    const b = readFileSync(resolve(ROOT, f));
    assert.equal(b.toString('ascii', 12, 16), 'IHDR', f + ' is a PNG');
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(w >= 2 * Number(m[1]), f + ' is at least 2x the tile width (' + w + ')');
    assert.ok(Math.abs(w / h - want) / want < 0.02, f + ' is the tile aspect ratio (' + w + 'x' + h + ')');
  }
});

/* ══ ③ Atlas のプリセットは、いま見ている地域についての質問である ═══════════════════════════════
   ⚠ THE SUBJECT LIVES IN ITS OWN FILE. js/atlas-console.js is at #R199's 5,300-line ceiling and the
   ceiling is never raised, so the starter chips moved out the way #R199 / #R278 / #R298 all paid —
   which is also why this reads js/atlas-examples.js rather than the console. */
const AC = code('js/atlas-examples.js');

/* ⚠⚠ (#R313) THESE THREE NAMED `_exPlace` AND LOOKED FOR `L(` INSIDE `examples()`. #R313 replaced the
   four templates with a fact-gated POOL — the resolver is `exFacts()`, the substitution is `fill()`,
   and the chip strings live in the pool's own thunks — so all three went red on a change that made
   the feature MORE of what they were written to protect. Rewritten to ask the PROPERTIES rather than
   the identifiers: resolved from the camera, refuses to name a country from a hemisphere, one copy,
   substituted rather than sent literally, redrawn only when the answer changes, and every chip
   reachable by the translation gate. */
test('r309 ③ the starter chips are resolved from the map, not from a fixed list', () => {
  /* whatever the resolver is called, `examples()` must go through it rather than return constants */
  const ex = fnBody(AC, 'examples');
  assert.ok(/exFacts\(\)/.test(ex), 'examples() asks what is true of what is on screen');
  /* and the console reaches it through an import, not a copy */
  const con = code('js/atlas-console.js');
  assert.ok(/from '\.\/atlas-examples\.js'/.test(con), 'js/atlas-console.js imports the subject');
  assert.ok(!/function examples\(/.test(con), 'and does not keep a second copy of it');
  const place = fnBody(AC, 'exFacts');
  assert.ok(/codeAtPoint\(/.test(place), 'it uses the resolver this file already had');
  assert.ok(/camera\.getCenter\(\)/.test(place), '…at the camera centre');
  assert.ok(/getZoom\(\)/.test(place), '…and refuses to name a country when the view is a hemisphere');
  assert.ok(/2\.5/.test(place), '…which is what the zoom floor is for');
  /* the place-shaped chips must actually substitute, or they would send the literal token */
  assert.ok(/\{place\}/.test(AC), 'the place-shaped chips carry the substitution token');
  assert.ok(/replace\(\/\\\{place\\\}\/g/.test(AC), 'and it is substituted before a chip is drawn');
  assert.ok(!/\{place\}/.test(fnBody(AC, 'renderExamples')),
    'the drawing step never sees an unsubstituted token');
});

test('r309 ③ the chips redraw when the subject changes, and only then', () => {
  const r = fnBody(AC, 'renderExamples');
  assert.ok(/exFacts\(\)/.test(r) && /_exKey/.test(r), 'the renderer compares the subject with the one it drew');
  const wire = fnBody(AC, '_wireExampleCamera');
  assert.ok(/onCamera|moveend/.test(wire), 'it is driven by the camera settling');
  assert.ok(/setTimeout/.test(wire), 'debounced rather than per-frame');
});

test('r309 ③ every chip is visible to the translation gate', () => {
  /* the old form passed ARRAYS to L(), which js/lang-registry.js only resolves positionally — so
     zh-Hant / zh-Hans / fr / ko silently read English on all four chips while check:i18n reported
     100 %, because scripts/i18n-report.mjs drops an L() whose first argument is not a Literal.
     ⚠ (#R313) the chips are a pool now, so the count is taken over the FILE — but the shape rule is
     unchanged and is what the gate can actually see. */
  assert.ok(!/L\(\s*\[/.test(AC), 'no chip is declared as an array of arrays');
  const calls = (AC.match(/\bL\(\s*'/g) || []).length;
  assert.ok(calls >= 8, 'every chip is an ordinary L() call with a literal first argument (' + calls + ')');
});

/* ══ ①④⑤ フロストガラス — 三つとも「二度塗り」と「詳細度」の問題である ═══════════════════════════ */
const RULES = cssRules(read('css/intmap.css'));
/* the frosted modes, as the stylesheet spells them */
const FROSTED = /body\.sidebar-translucent|body\.sidebar-glass2/;
const frostedFor = (needle) => RULES.filter((r) => FROSTED.test(r.sel) && r.sel.includes(needle));

test('r309 ① the Countries sort bar paints nothing extra on the glass', () => {
  const rs = frostedFor('#countries-feed .stats-toolbar');
  assert.ok(rs.length, 'there is a frosted-only rule for the sort bar');
  assert.ok(rs.some((r) => /background:\s*transparent/.test(r.body)), 'it removes the fill rather than re-tinting it');
  /* ⚠ #R40 recorded that a SECOND backdrop-filter over an already-frosted panel is what draws the
     「四角い枠」 — the very thing this report is about. The rule must not add one. */
  assert.ok(rs.some((r) => /backdrop-filter:\s*none/.test(r.body)), 'and it does not re-blur what the sidebar already blurred');
  /* the solid-mode declaration is untouched: it still falls back through --panel-bg */
  const solid = RULES.find((r) => r.sel === '#countries-feed .stats-toolbar');
  assert.ok(solid && /var\(--panel-bg/.test(solid.body), 'the opaque mode still uses the panel tone');
});

test('r309 ① the same double-paint is gone from its siblings too', () => {
  /* 「3か所すべて直す」 — the reader asked for the sibling bars as well, so this asks for the whole
     CLASS rather than for three selectors.
     ⚠ THE CLASS IS NOT "everything that paints --glass-fill". `.measure-dropdown`, `.layer-dropdown`
     and the big frosted-surface list float over the MAP, where that fill is the element's own
     material and is exactly right. The defect is a strip that paints it while sitting INSIDE a
     surface that has already painted it — i.e. a bar in one of the sidebar's feed containers. Two
     shapes qualify: a `position:sticky` strip, and a rule whose selector names a feed. */
  /* ⚠ AND NOT ONLY css/intmap.css. Two of the strips in this class are injected from JS — the
     compare headers in js/stats-compare.js and js/companies-ui.js — and they were the only LIVE
     ones left (measured: both came out `rgba(255,255,255,0.34)`, the sidebar's own fill). A check
     that reads one stylesheet would have called the class clean while the visible case remained. */
  const ALL = RULES.concat(...['js/stats-compare.js', 'js/companies-ui.js'].map((f) => cssRules(read(f), true)));
  const feeds = [...read('index.html').matchAll(/class="content-area"\s+id="([a-z-]+)"/g)].map((m) => '#' + m[1]);
  assert.ok(feeds.length >= 4, 'the sidebar feed containers are identifiable (' + feeds.join(' ') + ')');
  const paintsPanelFill = (b) => /background:\s*var\(--glass-fill\)/.test(b) || /background:\s*var\(--panel-bg,\s*var\(--glass-fill\)\)/.test(b);
  const inside = ALL.filter((r) => !FROSTED.test(r.sel) && paintsPanelFill(r.body)
    && (/position:\s*sticky/.test(r.body) || feeds.some((f) => r.sel.includes(f))));
  assert.ok(inside.length >= 5, 'every strip in the class is found (' + inside.length + ')');
  for (const r of inside) {
    const cover = ALL.filter((c) => FROSTED.test(c.sel) && c.sel.includes(r.sel));
    assert.ok(cover.length, r.sel + ' has a frosted-only rule so it does not repaint the panel fill');
    assert.ok(cover.some((c) => /background:\s*transparent/.test(c.body)), r.sel + ' drops the fill in the frosted modes');
    /* ⚠ and does NOT answer it with a second backdrop-filter — that is the 「四角い枠」 of #R40 */
    assert.ok(cover.every((c) => !/backdrop-filter:\s*(saturate|blur)/.test(c.body)), r.sel + ' does not re-blur an already-frosted surface');
  }
});

test('r309 ④ the search fields are glass in the frosted modes', () => {
  const rs = frostedFor('.search-bar');
  assert.ok(rs.length, 'the three search bars have a frosted-only material');
  assert.ok(rs.some((r) => /backdrop-filter/.test(r.body)), '…which is a material, not just a colour');
  /* ⚠ NOT the panel's own fill: layering --glass-fill inside an element that already has it is
     defect ① one file along. The recipe is #R39's neutral translucent fill. */
  for (const r of rs) assert.ok(!/var\(--glass-fill\)/.test(r.body), 'it does not repaint the sidebar\'s own fill');
  /* the focus ring has to survive being restated */
  assert.ok(rs.some((r) => /:focus-within/.test(r.sel) && /--primary-color/.test(r.body)), 'a focused field still shows where the caret went');
  /* and Atlas's prompt box — the other half of the same report. Its BASE rule is injected from
     js/atlas-console.js; the frosted override sits here, beside the #R39 recipe it copies. */
  const atl = RULES.filter((r) => FROSTED.test(r.sel) && /\.atl-in\b/.test(r.sel));
  assert.ok(atl.length, 'the Atlas input has a frosted-only material too');
  assert.ok(atl.some((r) => /backdrop-filter/.test(r.body)), 'built from the same recipe as the search bars');
  for (const r of atl) assert.ok(!/var\(--glass-fill\)/.test(r.body), 'and it does not repaint the panel fill either');
});

test('r309 ⑤ the place-search pill keeps its width when both sidebars are open', () => {
  const centring = RULES.filter((r) => /\.map-search/.test(r.sel) && /:has\(\.sidebar:not\(\.collapsed\)\)/.test(r.sel));
  assert.ok(centring.length, 'the frosted centring rule is still there');
  /* ⚠ THE DEFECT: that selector is (0,4,1) and `body.ms-narrow .map-search` is (0,2,1), so it won
     `left` while the JS-computed `right` survived — and --ms-left / --ms-right only mean anything as
     a PAIR. Measured at 1440x900 with both sidebars open: left 920px, right 619px, width 18px. */
  for (const r of centring) assert.ok(/:not\(\.ms-narrow\)/.test(r.sel), 'it stands down when the JS watcher owns the geometry');
  /* …and when it does apply, it has to know about the RIGHT sidebar too */
  const withRight = centring.filter((r) => /lsr-open/.test(r.sel));
  assert.ok(withRight.length, 'the centring accounts for the right sidebar');
  assert.ok(withRight.every((r) => /--lsr-w/.test(r.body)), 'by subtracting its width from the centre AND from the cap');
});
