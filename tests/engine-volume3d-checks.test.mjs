// The 3-D volume tool — js/volume3d.js, its panel in js/tool-panel.js, and the closed body js/solid3d.js
// draws for it.
//
// Gathered from tests/r171-checks (the "cannot type" bug, the shapes, colour and opacity, the drag),
// r172-checks (a floor and a filled interior, no altitude ceiling, units, a footprint that did not come
// from clicks, Atlas and the strings) and r173-checks (one closed mesh). Titles keep the round that
// wrote them.
//
// ⚠ The module is a factory that the booted app instantiates (and which then polls for the engine), so
// it is not constructed here. What it DECLARES is lifted out by name with the parser and run inside the
// same scope shape — the geometry (destM/circleRing/rectRing/rdp), the typed-number rule (_num), the
// altitude band (setAltitudes/loM/hiM), the units, the colour push (setStyle) and the click entry point
// (syncClicks). The panel's own converter (_toM) is lifted from js/tool-panel.js the same way. What
// stays READ is marked, with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { appShell } from './app-source.mjs';
import { codeOnly as stripComments } from '../scripts/code-only.mjs';

const R = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* (#R175) "the page" is index.html + src/main.js + js/app-body.js (+ js/geo-engine.js) */
const INDEX = appShell(new URL('../', import.meta.url));

/* ── lifting declarations out of a file by the NAME they declare ──────────────────────────────── */
function lifter(file) {
  const src = R(file);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const declOf = (name) => {
    let hit = null;
    walk.full(ast, (n) => {
      if (hit) return;
      if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = n;
      if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === name)) hit = n;
    });
    assert.ok(hit, `${file} no longer declares ${name}`);
    return hit;
  };
  /* evaluate the statements that declare `names` (each statement once, in file order) with `deps` as
     the only other free names, and hand back `expose` — an expression over the declared names */
  return (names, expose, deps = {}) => {
    const stmts = [...new Set(names.map(declOf))].sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n');
    const keys = Object.keys(deps);
    return new Function(...keys, `${stmts}\nreturn (${expose});`)(...keys.map((k) => deps[k]));
  };
}
const VOL = lifter('js/volume3d.js');

/* Real `map.<x>` member reads, via the parser (#R171) — the tool must stay engine-only */
function rawMapUses(file) {
  const ast = acorn.parse(R('js/' + file), { ecmaVersion: 'latest', sourceType: 'module' });
  const hits = [];
  walk.simple(ast, { MemberExpression(n) { if (!n.computed && n.object && n.object.type === 'Identifier' && n.object.name === 'map') hits.push((n.property && n.property.name) || '?'); } });
  return hits;
}

/* ─── #R171 the panel, the typed numbers, the shapes, colour and opacity, the drag ───────────── */

/* ⚠ READ, NOT RUN: the defect was the panel's innerHTML being rebuilt under a focused field — the
   panel is DOM wiring that exists only in the booted app. */
test('#R171 the volume panel never rebuilds itself from an input handler', () => {
  const src = stripComments(R('js/tool-panel.js'));
  const block = src.slice(src.indexOf("if(HOST.toolMode==='volume'){", src.indexOf('const cl=p.querySelector')));
  assert.ok(block.length > 400, 'volume wiring block not found');
  const wiring = block.slice(0, block.indexOf("if(HOST.toolMode==='radius'){"));
  assert.ok(/bI\.oninput=applyAlt/.test(wiring) && /tI\.oninput=applyAlt/.test(wiring), 'the altitude fields drive applyAlt');
  const applyAlt = wiring.slice(wiring.indexOf('const applyAlt='), wiring.indexOf('const applyAlt=') + 200);
  assert.ok(!/updateToolPanel\(\)/.test(applyAlt),
    'applyAlt must NOT call updateToolPanel() — that rewrites the panel innerHTML and destroys the field being typed into (measured: "2500" became "2")');
  assert.match(wiring, /const sync=\(\)=>/, 'derived numbers must be refreshed in place');
  for (const id of ['#v3d-pts', '#v3d-area', '#v3d-thick', '#v3d-vol', '#v3d-gnd']) {
    assert.ok(wiring.includes(id), `sync() must update ${id} in place`);
  }
});

test('#R171 the altitude fields survive a half-typed value and never swap under the cursor', () => {
  /* RUN: the panel's converter and the module's setter, end to end */
  const tp = lifter('js/tool-panel.js');
  const toM = tp(['_toM'], '_toM', { V: { fromUnit: (n) => n * 1000 } });   /* the unit is km */
  const band = VOL(['_num', 'clamp', 'MAX_M', 'ring', 'setAltitudes', 'loM'],
    '{ setAltitudes, loM, hiM, get base(){ return baseM; }, get top(){ return topM; } }', { paint: () => true });
  /* an empty or lone-sign field is a keyboard state, not the number 0 — +'' is 0, which is how the
     old isFinite(+b) test silently rewrote a cleared field */
  for (const half of ['', '-', '+', '.', '-.']) {
    assert.equal(toM(half), half, `the panel passes the half-typed ${JSON.stringify(half)} through unconverted`);
    band.setAltitudes(toM(half), toM('4'));
    assert.equal(band.base, 1000, `…and the module leaves the base alone for ${JSON.stringify(half)}`);
  }
  assert.equal(band.top, 4000, 'a finished number still arrives, converted into metres');
  band.setAltitudes('1e', null);
  assert.equal(band.base, 1000, "'1e' is on its way to 1e3, not a number yet");
  /* the base/top swap is gone — the band is min..max at paint time instead */
  band.setAltitudes(5000, 1000);
  assert.equal(band.base, 5000, 'the fields keep saying exactly what was typed into them');
  assert.equal(band.top, 1000);
  assert.equal(band.loM(), 1000, 'the band is derived, not stored swapped');
  assert.equal(band.hiM(), 5000);
  /* ⚠ READ (this half): the extrusion is painted onto a live renderer */
  const src = stripComments(R('js/volume3d.js'));
  assert.match(src, /const rb=Math\.max\(0, loM\(\)-off\), rh=Math\.max\(rb\+0\.5, hiM\(\)-off\)/, 'the extrusion uses the derived band');
});

test('#R171 the footprint is no longer only straight lines', () => {
  /* RUN: the footprint geometry */
  const G = VOL(['R_EARTH', 'distM', 'destM', 'circleRing', 'rectRing', '_perp', 'rdp'], '{ distM, circleRing, rectRing, rdp }');
  /* a real circular footprint, built in ground METRES, so it is round at any latitude */
  const centre = [10, 60];
  const circle = G.circleRing(centre, 1000, 96);
  assert.equal(circle.length, 96);
  for (const p of circle) assert.ok(Math.abs(G.distM(centre, p) - 1000) < 1e-6, 'every vertex is 1 km from the centre on the ground');
  const lngSpan = Math.max(...circle.map((p) => p[0])) - Math.min(...circle.map((p) => p[0]));
  const latSpan = Math.max(...circle.map((p) => p[1])) - Math.min(...circle.map((p) => p[1]));
  assert.ok(Math.abs(lngSpan / latSpan - 2) < 0.01, 'at 60°N a ground circle spans twice as many degrees of longitude — an ellipse in degrees');
  /* a rectangle, densified so its sides follow the projection */
  const rect = G.rectRing([0, 0], [4, 2], 16);
  assert.equal(rect.length, 64, 'sixteen points a side');
  assert.ok(rect.every(([x, y]) => (x === 0 || x === 4 || y === 0 || y === 2) && x >= 0 && x <= 4 && y >= 0 && y <= 2), 'every point is on an edge');
  /* freehand traces are simplified like the Draw tool: collinear runs collapse, corners survive */
  const trace = [[0, 0], [1, 0.0001], [2, 0], [3, 0.0001], [4, 0], [4, 1], [4, 2]];
  assert.deepEqual(G.rdp(trace, 0.01), [[0, 0], [4, 0], [4, 2]]);
  /* ⚠ READ (these halves): the shape list is a closure value and the panel's choices are DOM */
  const src = stripComments(R('js/volume3d.js'));
  for (const s of ['polygon', 'freehand', 'circle', 'rect']) assert.ok(src.includes(`'${s}'`), `shape ${s} must exist`);
  const panel = stripComments(R('js/tool-panel.js'));
  for (const s of ['polygon', 'freehand', 'circle', 'rect']) assert.ok(panel.includes(`['${s}'`), `the panel must offer ${s}`);
});

test('#R171 the volume tool has colour and opacity, and they reach the renderer', () => {
  /* RUN: setStyle, against an engine stub that records what reaches the layers */
  const painted = [], solids = [];
  const E = { layers: { has: () => true, setPaint: (id, k, v) => painted.push([id, k, v]), setSolid: (id, o) => solids.push([id, o]) } };
  const S = VOL(['SRC', 'ring', 'clamp', 'setStyle'], '{ setStyle, LYR, EDGE, BODY }', { GE: () => E, paint: () => true });
  S.setStyle('#ff3b30', 0.3);
  assert.deepEqual(painted, [[S.LYR, 'fill-extrusion-color', '#ff3b30'], [S.EDGE, 'line-color', '#ff3b30']],
    'a colour change must reach the box AND its ground outline');
  assert.deepEqual(solids, [[S.BODY, { color: '#ff3b30', opacity: 0.3 }]], 'and the closed body, with the opacity');
  S.setStyle(null, 5);
  assert.equal(solids.at(-1)[1].opacity, 0.95, 'opacity is clamped to what still reads as a volume');
  /* ⚠ READ (these halves): the controls are panel DOM, and the layer definition is built inside ensure()
     against a live engine */
  const panel = stripComments(R('js/tool-panel.js'));
  assert.match(panel, /const V3D_COLORS=\[/, 'colour presets');
  assert.match(panel, /id="v3d-color"/, 'a custom colour picker');
  assert.match(panel, /id="v3d-op"/, 'an opacity slider');
  assert.match(panel, /col\.oninput=\(\)=>\{ if\(V\) V\.setStyle\(col\.value,null\)/, 'the picker drives the module');
  assert.match(panel, /op\.oninput=\(\)=>\{ if\(V\) V\.setStyle\(null,parseFloat\(op\.value\)\)/, 'the slider drives the module');
  const mod = stripComments(R('js/volume3d.js'));
  assert.ok(!/coalesce'\],\['get','color'\]/.test(mod) && !/\['coalesce',\['get','color'\]/.test(mod),
    "the layer colour must be a plain value: the coalesce form left the layer's own paint property frozen at its creation colour");
});

/* ⚠ READ, NOT RUN: the gesture hand-over is between the tool, the engine's input contract and the
   map-click handler of the booted app. */
test('#R171 a stroke shape owns the drag and cannot leave a stray polygon vertex', () => {
  const mod = stripComments(R('js/volume3d.js'));
  assert.match(mod, /GE\(\)\.input\.setDragPan\(!on\)/, 'the tool suspends the renderer pan through the engine, not by touching its handler');
  assert.match(mod, /const ownsGesture=\(\)=>armed/, 'the tool must be able to say when it owns the gesture');
  const readout = stripComments(R('js/map-readout.js'));
  assert.match(readout, /IntMapVolume3D\.ownsGesture\(\)\) return/, 'handleMapClick must ignore the synthetic click at the end of a stroke');
  assert.match(stripComments(INDEX), /IntMapVolume3D\.release\(\)/, 'closing the tool must hand the gesture back, not merely clear the ring');
});

/* ─── #R172 / #R173 the closed body, the band, the units, the footprint's owner ─────────────────── */

/* (#R173) The CLAIM is unchanged — the volume must be a closed body with a floor and a filled interior.
   The MECHANISM is not: #R172 built it out of a floor slab and eight interior sheets, and those were
   never visible, because fill-extrusion writes depth and everything inside the body failed the depth
   test behind its own near wall. #R173 draws the whole prism as one closed mesh through the engine's
   solid contract.
   ⚠ READ, NOT RUN: the body is asked of a live engine in paint(); the look is measured in the browser. */
test('#R172 the volume is a closed body: a floor and a filled interior', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.match(v, /BODY='imv3d-body'/, 'the closed body has its own layer');
  assert.match(v, /E\.layers\.addSolid\(BODY\)/, 'asked of the engine as a SOLID, not as another extrusion');
  assert.match(v, /E\.layers\.setSolid\(BODY,\{ ring:r, base:rb, top:rh, color, opacity \}\)/, 'from the same ring and the same band');
  assert.ok(!/imv3d-slab-/.test(v), 'and no interior sheets — 「内部にシートなんていうあほなことをするな」');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'the tool stays engine-only');
});

/* ⚠ READ, NOT RUN: js/solid3d.js is a WebGL custom layer (shaders, cull faces, depth mask). */
test('#R173 the volume is drawn as one closed mesh — floor included, no interior sheets', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.match(v, /E\.layers\.addSolid\(BODY\)/, 'asked of the engine as a solid');
  assert.match(v, /function canSolid\(\)/, '…and it falls back to the open shell where the engine has no solids');
  assert.ok(!/imv3d-slab-/.test(v), 'no interior sheets — they were invisible behind the body’s own depth writes');
  assert.ok(!/imv3d-floor/.test(v), 'and no floor slab, for the same reason');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'the tool is still engine-only');

  const s = stripComments(R('js/solid3d.js'));
  assert.match(s, /function triangulate\(p\)/, 'the caps are triangulated (ear clipping — a traced outline can be concave)');
  assert.match(s, /idx\.push\(capBot\[tri\[t\+2\]\],capBot\[tri\[t\+1\]\],capBot\[tri\[t\]\]\)/, 'the BOTTOM cap exists and faces down');
  assert.match(s, /float a=clamp\(1\.0-pow\(1\.0-face,1\.0\/c\),0\.0,0\.985\)/, 'opacity follows the path length through the face');
  assert.match(s, /gl\.cullFace\(gl\.FRONT\); gl\.drawElements/, 'far side first…');
  assert.match(s, /gl\.cullFace\(gl\.BACK\);  gl\.drawElements/, '…then the near side, so the body composites as glass');
  assert.match(s, /gl\.depthMask\(false\)/, 'depth is TESTED against the world but not written, or the body hides itself');
  /* (#R174) …through the prelude, with the altitude scaled to the units THAT prelude takes; and since
     MapLibre 6 hands custom layers the LIVE globe cross-fade, both units at once (js/lifted-projection.js).
     tests/maplibre-6-migration.spec.js measures where the layers draw. */
  assert.match(s, /projectLifted\(a_pos, a_alt, a_alt\*u_altScale\)/, 'projected through MapLibre’s own prelude');
  assert.match(s, /import \{ LIFTED_GLSL \} from '\.\/lifted-projection\.js'/, '…with each half of it fed its own elevation unit');
});

test('#R172 the altitude band has no ceiling and can be typed in a chosen unit', () => {
  /* RUN: the limits, the units and the unit switch */
  const U = VOL(['MAX_M', 'UNITS', 'unit', 'setUnit', 'clamp', '_num', 'ring', 'setAltitudes'],
    '{ MAX_M, MIN_M, UNITS, setUnit, setAltitudes, get top(){ return topM; } }', { paint: () => true });
  U.setAltitudes(1000, 35786000);
  assert.equal(U.top, 35786000, 'the Kármán-line clamp is gone — a geostationary band is typed as it is (「上限の高度は無しに」)');
  assert.equal(U.MAX_M, 1e9, 'the only ceiling left is where the renderer still draws');
  assert.equal(U.MIN_M, -6371000, '…and the floor is the centre of the Earth');
  assert.deepEqual({ ...U.UNITS }, { m: 1, km: 1000, ft: 0.3048, mi: 1609.344 }, 'm / km / ft / mi');
  assert.equal(U.setUnit('ft'), 'ft', 'and the unit is a setting');
  assert.equal(U.setUnit('furlong'), 'ft', 'an unknown unit is refused, not adopted');
  /* ⚠ READ (these halves): the picker and its conversions are panel DOM */
  const tp = stripComments(R('js/tool-panel.js'));
  assert.match(tp, /V3D_UNITS=\['m','km','ft','mi'\]/, 'the picker offers them');
  assert.match(tp, /id="v3d-unit"/, 'the picker is in the panel');
  assert.match(tp, /const _toM=\(raw\)=>/, 'the fields convert into metres on the way in');
  assert.match(tp, /if\(s===''\|\|s==='-'\|\|s==='\+'\|\|s==='\.'\|\|s==='-\.'\) return s;/,
    "a half-typed value must reach setAltitudes UNCHANGED — converting '' first would write 0 m and undo #R171");
});

test('#R172 a footprint that did not come from clicks survives a panel refresh', () => {
  /* RUN: the two entry points, over the same ring */
  const F = VOL(['ring', 'ringFromClicks', 'setRing', 'syncClicks'], '{ setRing, syncClicks, get ring(){ return ring; } }', { paint: () => true });
  const drawn = [[0, 0], [1, 0], [1, 1]];
  F.setRing(drawn);                                       /* Atlas, a traced stroke, a restored shape */
  assert.equal(F.syncClicks([]), false, 'a panel refresh with no clicked vertices must not replace a ring it did not create');
  assert.deepEqual(F.ring, drawn, '…and the Atlas-drawn footprint is still there');
  F.syncClicks([[5, 5], [6, 5], [6, 6]]);
  assert.deepEqual(F.ring, [[5, 5], [6, 5], [6, 6]], 'clicking vertices takes the ring over');
  F.syncClicks([]);
  assert.deepEqual(F.ring, [], 'and a ring the clicks created is refreshed by them, down to empty');
  /* ⚠ READ (this half): the call sites are panel DOM wiring */
  const tp = stripComments(R('js/tool-panel.js'));
  assert.match(tp, /V\.syncClicks\(HOST\.measurePoints\)/, 'the panel goes through it');
  assert.ok(!/V\.setRing\(HOST\.measurePoints\)/.test(tp), 'the old unconditional push wiped Atlas-drawn footprints');
});

/* ⚠ READ, NOT RUN: the SYS catalogue TEXT is what the planner reads (#R115: uncatalogued = nonexistent). */
test('#R172 every new switch is operable from Atlas AND catalogued', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it. */
  const atlas = R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js');
  assert.ok(atlas.includes("case 'planeAltitude':"), 'Atlas must implement planeAltitude');
  assert.ok(atlas.includes('{"type":"planeAltitude"'), 'planeAltitude must appear in the SYS catalogue');
  assert.match(atlas, /\bplaneAltitude:\{ lbl:/, 'and offer an inline on/off switch in the reply');
  assert.match(atlas, /"unit"\?:"m"\|"km"\|"ft"\|"mi"/, 'the volume action must advertise the unit');
  /* (#R174) the closed-body OPTION is gone — "わざわざSolidを選択制なんてするな". A volume is a closed body,
     so there is nothing left to catalogue. Asserted in the negative so it cannot creep back. */
  assert.doesNotMatch(atlas, /"solid"\?:bool/, 'the solid/hollow choice was withdrawn in #R174');
  assert.match(atlas, /\/volume\|立体\|体積\/\.test\(n\)\?'btn-tool-volume'/,
    '{"type":"tool","name":"volume"} has been advertised since #R170 with no branch behind it — it fell through and did nothing');
});

/* ⚠ READ, NOT RUN: the strings are arguments of _L(...) calls in panel markup. */
test('#R172 the new UI strings exist in all five languages', () => {
  const tp = R('js/tool-panel.js'), d = R('js/data-layers.js');
  /* _L(en, jp, de, ru, es) — walk to the matching close paren, because the English text itself
     contains brackets and a naive indexOf(')') truncates the call. */
  const callAt = (src, needle) => {
    const i = src.indexOf(needle); assert.ok(i > 0, `${needle} is missing`);
    const start = src.lastIndexOf('_L(', i); let depth = 0;
    for (let k = start + 2; k < src.length; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')') { depth--; if (!depth) return src.slice(start, k + 1); }
    }
    assert.fail(`unterminated _L( for ${needle}`);
  };
  /* (#R174) 'Solid (floor + filled interior)' is gone with the checkbox it labelled. */
  for (const needle of ['Finish drawing', 'Altitude band above sea level']) {
    const call = callAt(tp, needle);
    assert.equal((call.match(/','/g) || []).length, 4, `${needle} must carry all five languages, got: ${call.slice(0, 160)}`);
  }
  for (const s2 of ['実際の高度で表示', 'In echter Höhe', 'На реальной высоте', 'A su altitud real', 'At real altitude'])
    assert.ok(d.includes(s2), `the aircraft-altitude toggle is missing its ${s2} string`);
});
