/* ══ R707 — ONE CHANCE PER POLITY WAS NOT ENOUGH CHANCES ═══════════════════════════════════════
 *
 *  #R520 answered 「昔の国名ラベルが1国につき何十個も出る」 by reducing the era names to ONE Point per
 *  NAME — the pole of the polity's largest part — and said so in its own comment («ONE Point per
 *  era identity»). That is also ONE CHANCE. `text-allow-overlap` is off on `imtb-lbl`/`imtb-lbl2`,
 *  so a name whose single candidate loses the collision is not moved elsewhere, it is GONE; and a
 *  record that puts one polity on two continents — Russian America in 1800, Alaska in 1960,
 *  Ottoman Tripolitania in 1900, French Algeria in 1860, Danish Greenland — drew the second
 *  territory with nothing on it at all. `_ERAVAR` (`text-variable-anchor`, five directions) was the
 *  compensation, and it moves ONE label around ONE point; it does not make a second place.
 *
 *  #R707 gives the other parts of a polity their own chance, under two tests that are about the
 *  RECORD and not about a list of names: the part has to be a territory in its own right
 *  (`_LBL_MIN_KM2`, measured), and its centre has to stand further from every part already labelled
 *  than the two territories are themselves wide (the sum of the radii of discs of equal area — no
 *  second threshold).
 *
 *  ⚠ WHAT THESE CHECKS MEASURE, AND WHAT THEY DELIBERATELY DO NOT.
 *  They EVALUATE the shipped module over the shipped bundles (#R505, #R621) and read the collection
 *  the label source is actually handed. They do NOT re-implement the rule: a check that recomputed
 *  `_LBL_MIN_KM2` and the spacing would be the same judgement in two places (#R536) and would agree
 *  with the code no matter what either of them said. They also do not name a country: a list of
 *  spellings guards the cases somebody thought of in 2026 and nothing the bundles grow afterwards
 *  (#R488, .agents/rules/no-ad-hoc-hardcoding.md). What they state instead:
 *
 *    ① the point that was there before is still there, on the same part, to the same digits;
 *    ② no part of a polity carries two of its names, and no name stands off its own polity;
 *    ③ where the RECORD ITSELF puts a huge territory far from the body it names, that polity now
 *       has more than one chance — and the situation is asserted to occur, so the check cannot pass
 *       by looking at nothing (#R699);
 *    ④ nothing small buys a name, and a sheet does not fill up with them;
 *    ⑤ every point of a name is still the same feature's properties, in a fresh object — what
 *       `_same`, `_locName`/`_modName` and `_clk` all read.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the renderer as a RECORDER: it keeps what was written to each source and nothing else ─────── */
function makeEngine() {
  const layers = new Map(), sources = new Map();
  const eng = {
    hasRenderer: () => true, ready: () => true,
    layers: {
      hasSource: (id) => sources.has(id),
      addSource: (id, d) => { sources.set(id, d); },
      setSourceData: (id, d) => { if (!sources.has(id)) throw new Error('no such source: ' + id); sources.set(id, d); },
      has: (id) => layers.has(id), get: (id) => layers.get(id) || null,
      add: (def) => { layers.set(def.id, { def, layout: Object.assign({}, def.layout) }); },
      setLayout: (id, k, v) => { const l = layers.get(id); if (l) l.layout[k] = v; },
      getLayout: (id, k) => { const l = layers.get(id); return l ? l.layout[k] : undefined; },
      setPaint: () => {}, remove: (id) => layers.delete(id), move: () => {},
    },
    events: { onLayer: () => {}, on: () => {}, clickLayers: () => [], claimClick: () => {}, clickClaimed: () => false },
    coords: { queryRenderedFeatures: () => [] },
    ui: { popup: () => ({ setLngLat() { return this; }, setHTML() { return this; }, remove() {} }), attach: (p) => p },
    render: { canvas: () => ({ style: {} }) },
  };
  return { eng, layers, labels: () => sources.get('imtb-lbl-src') || null };
}

function loadModule() {
  const noop = () => {};
  const E = makeEngine();
  const win = {
    addEventListener: noop, setTimeout: (f) => { try { f(); } catch (_) {} return 0; }, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: E.eng, IntMapTime: { on: noop }, _applyBorders: noop,
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop }, documentElement: { setAttribute: noop },
    },
    navigator: { language: 'en' },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  /* the real registry, the real scales, the real border/coast marks — and all three shipped
     bundles, so every tier of the record answers (CShapes, OpenHistoricalMap, the era sheets). */
  for (const p of ['js/locales/_langs.js', 'js/lang-registry.js', 'js/label-scale.js', 'js/hist-scale.js',
    'js/border-coast.js', 'data/cshapes.js', 'data/hist-borders.js', 'data/hist-eras.js']) vm.runInContext(rd(p), ctx);
  vm.runInContext(rd('js/time-borders.js'), ctx);
  const HOST = { lang: 'en', canDraw: () => true, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), E, win: ctx.window };
}

/* ── geometry the CHECK owns: what the record says, asked of the record, not of the module ─────── */
const R_KM = 6371.0088, D2R = Math.PI / 180;
/* spherical excess, dλ wrapped — the area a ring covers on the planet */
const ringKm2 = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    let dl = r[i][0] - r[j][0];
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    s += dl * D2R * (2 + Math.sin(r[j][1] * D2R) + Math.sin(r[i][1] * D2R));
  }
  return Math.abs(s / 2) * R_KM * R_KM;
};
/* 3-D mean of the outline, back on the sphere: no antimeridian case to get wrong */
const ringMid = (r) => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const p of r) { const l = p[0] * D2R, q = p[1] * D2R, c = Math.cos(q); x += c * Math.cos(l); y += c * Math.sin(l); z += Math.sin(q); n++; }
  if (!n) return null;
  x /= n; y /= n; z /= n;
  return [Math.atan2(y, x) / D2R, Math.atan2(z, Math.hypot(x, y)) / D2R];
};
const gcKm = (a, b) => {
  const p1 = a[1] * D2R, p2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R, dp = p2 - p1;
  const sp = Math.sin(dp / 2), sl = Math.sin(dl / 2);
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(sp * sp + Math.cos(p1) * Math.cos(p2) * sl * sl)));
};
/* the parts of a geometry — outer ring and its holes — largest first IN SQUARE DEGREES, which is
   the order the module uses to decide which one already carries the name */
const degArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2); };
const partsOf = (geom) => {
  const t = geom && geom.type, cs = geom && geom.coordinates;
  const polys = (t === 'Polygon') ? [cs] : (t === 'MultiPolygon') ? cs : null;
  if (!polys) return [];
  const out = [];
  for (const p of polys) {
    const r = p && p[0];
    if (!r || r.length < 4) continue;
    out.push({ poly: p, deg: degArea(r), km: ringKm2(r), mid: ringMid(r) });
  }
  out.sort((a, b) => b.deg - a.deg);
  return out;
};
/* ray cast against the outer ring, minus any hole it falls in */
const inRing = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
  }
  return inside;
};
const inPart = (x, y, poly) => {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
};

/* ── the sheets: every tier of the shipped record ──────────────────────────────────────────────── */
const SHEETS = (() => {
  const ys = [];
  for (let y = 1890; y <= 2010; y += 10) ys.push(y);       /* data/cshapes.js */
  for (let y = 1700; y <= 1880; y += 20) ys.push(y);       /* data/hist-borders.js */
  for (const y of [-122999, -3999, -399, 200, 900, 1500]) ys.push(y);   /* data/hist-eras.js */
  return ys;
})();

/* one walk of the record, shared by every check below: the drawn label points beside the parts the
   record says the same names are made of */
const WALK = await (async () => {
  const { mod, E } = loadModule();
  const out = [];
  for (const y of SHEETS) {
    await mod._go(y);
    const lbl = E.labels(), fc = mod.currentFC();
    if (!lbl || !fc) continue;
    const by = new Map();
    for (const f of fc.features) {
      const p = f.properties || {};
      if (p._corrected || !f.geometry) continue;
      const k = String(p.NAME || p.name || '').trim();
      if (!k) continue;
      by.set(k, (by.get(k) || []).concat(partsOf(f.geometry)));
    }
    by.forEach((ps) => ps.sort((a, b) => b.deg - a.deg));
    const pts = new Map();
    for (const f of lbl.features) {
      const k = String((f.properties || {}).NAME || (f.properties || {}).name || '').trim();
      pts.set(k, (pts.get(k) || []).concat([f]));
    }
    out.push({ y, key: mod.current(), parts: by, pts, total: lbl.features.length });
  }
  return out;
})();

test('the record answered every tier, so the checks below are looking at something', () => {
  assert.equal(WALK.length, SHEETS.length, 'a sheet produced no label collection at all');
  const keys = new Set(WALK.map((s) => String(s.key).replace(/[0-9-]/g, '')));
  assert.ok(keys.has('cs') && keys.has('hb'), 'the CShapes and OpenHistoricalMap tiers did not both answer: ' + [...keys].join('/'));
  assert.ok(WALK.some((s) => s.parts.size > 60), 'no sheet decoded to a plausible number of polities');
});

/* ── ① the label that existed before has not moved ─────────────────────────────────────────────── */
test('R707 ①: every name still has its old anchor — the pole of its largest part, to the digit', () => {
  let checked = 0;
  const nameless = [];
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      if (!ps.length) continue;
      const got = sh.pts.get(nm);
      if (!got || !got.length) { nameless.push(sh.y + ' ' + nm); continue; }
      /* #R520's rule: one point, inside the largest part. It must still be among the points, and
         it must be the FIRST of them — the order is what a reader's collision sees first. */
      const [x, y] = got[0].geometry.coordinates;
      assert.equal(got[0].geometry.type, 'Point', sh.y + ': ' + nm + ' is not a Point');
      assert.ok(inPart(x, y, ps[0].poly),
        sh.y + ': ' + nm + "'s first anchor is no longer inside its largest part (" + x.toFixed(2) + ',' + y.toFixed(2) + ')');
      checked++;
    }
  }
  assert.ok(checked > 2000, 'only ' + checked + ' names were examined');
  /* ⚠ NOT «few»: NONE. Every name the record draws with at least one usable ring is labelled.
     (Two names in the bundles — «Hindu states» at 900 and «Bahmani Kingdom» at 1500 — are drawn
     with no ring of four points at all, so neither the module nor the loop above ever sees a part
     for them; they were unlabelled before this round for the same reason.) */
  assert.equal(nameless.length, 0, 'names with geometry and no label at all: ' + nameless.join(', '));
});

test('R707 ①: a polity the record draws in one piece still gets exactly one label', () => {
  let single = 0;
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      if (ps.length !== 1) continue;
      single++;
      assert.equal((sh.pts.get(nm) || []).length, 1,
        sh.y + ': ' + nm + ' is one polygon and got ' + (sh.pts.get(nm) || []).length + ' labels');
    }
  }
  assert.ok(single > 1000, 'only ' + single + ' single-part polities were examined');
});

/* ── ② one name never lands twice on the same ground, and never off its own ────────────────────── */
test('R707 ②: no part carries two of a polity\'s names, and no name stands off its polity', () => {
  let extra = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      const ps = sh.parts.get(nm);
      assert.ok(ps, sh.y + ': ' + nm + ' was labelled but the record holds no geometry for it');
      const used = [];
      for (const f of pts) {
        const [x, y] = f.geometry.coordinates;
        const hit = ps.findIndex((p) => inPart(x, y, p.poly));
        assert.ok(hit >= 0, sh.y + ': ' + nm + ' is labelled at ' + x.toFixed(2) + ',' + y.toFixed(2) + ' — a point that is not inside it');
        assert.ok(used.indexOf(hit) < 0, sh.y + ': ' + nm + ' put two labels on the SAME part');
        used.push(hit);
      }
      if (pts.length > 1) extra += pts.length - 1;
    }
  }
  assert.ok(extra > 0, 'no polity anywhere in the record got a second chance — check ③ would be vacuous');
});

/* ── ③ the defect itself: a huge territory far from the body that names it ─────────────────────── */
test('R707 ③: where the RECORD puts a vast territory far from its polity, the polity gets another chance', () => {
  /* The situation is described in the record's own terms and NOT in the module's: a part of at
     least a million square kilometres whose centre stands more than 3,000 km from the centre of
     the part that carries the name. Both numbers are far above anything the module tests, so this
     check states the DEFECT, not the rule that answers it — it stays true for any rule that fixes
     the defect, and false for the one-point-per-name rule that did not. */
  const HUGE_KM2 = 1e6, FAR_KM = 3000;
  const found = [];
  for (const sh of WALK) {
    for (const [nm, ps] of sh.parts) {
      const main = ps[0];
      if (!main || !main.mid) continue;
      for (let i = 1; i < ps.length; i++) {
        const p = ps[i];
        if (!p.mid || p.km < HUGE_KM2 || gcKm(p.mid, main.mid) < FAR_KM) continue;
        found.push(sh.y + ' ' + nm);
        assert.ok((sh.pts.get(nm) || []).length > 1,
          sh.y + ': ' + nm + ' spreads ' + Math.round(p.km).toLocaleString() + ' km² over '
          + Math.round(gcKm(p.mid, main.mid)).toLocaleString() + ' km and still has one label');
        break;
      }
    }
  }
  assert.ok(found.length >= 3,
    'the record holds ' + found.length + ' such territories — this check saw too few to be measuring anything (#R699)');
});

/* ── ④ and nothing small buys a name ───────────────────────────────────────────────────────────── */
test('R707 ④: a small island never gets a name of its own, and no sheet fills up with names', () => {
  /* 200,000 km² is BELOW the module's own floor on purpose: this check is not a copy of that number
     but a statement about what must never happen, and it would catch the #R520 thicket whatever the
     floor were set to. Every island named in that report is far under it — Hokkaidō 78,061 km²,
     Ireland 83,362, Luzon 94,455, Newfoundland 109,970, the South Island 113,916. */
  const SMALL_KM2 = 200000;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      const ps = sh.parts.get(nm);
      for (let k = 1; k < pts.length; k++) {
        const [x, y] = pts[k].geometry.coordinates;
        const p = ps.find((q) => inPart(x, y, q.poly));
        assert.ok(p && p.km >= SMALL_KM2,
          sh.y + ': ' + nm + ' took a second name onto a part of ' + Math.round((p && p.km) || 0).toLocaleString() + ' km²');
      }
    }
  }
  /* …and the thicket is bounded from both ends. MEASURED over the three bundles at 120 sheets: no
     polity anywhere reaches five labels, and the worst sheet gains 7 points on 163 names. The
     per-sheet allowance is written as a floor plus a share because the deep sheets are tiny —
     world_bc123000 names three polities and two of them straddle continents. */
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      assert.ok(pts.length <= 4,
        sh.y + ': ' + nm + ' has ' + pts.length + ' labels — that is the thicket #R520 was reported for');
    }
    assert.ok(sh.total - sh.parts.size <= 3 + sh.parts.size * 0.05,
      sh.y + ': ' + sh.total + ' labels for ' + sh.parts.size + ' polities — the sheet is filling up with names');
  }
});

/* ── ④b an added name stands CLEAR of the territory that already carries it ────────────────────── */
test('R707 ④: a second name never lands on a territory the first one already reaches across', () => {
  /* ⚠ THIS IS NOT THE MODULE'S RULE WRITTEN TWICE (#R536). The module requires the two centres to
     stand apart by the sum of BOTH radii; this requires only the FIRST — a strictly weaker
     statement, which any correct implementation satisfies and which a spacing-blind one does not.
     What it rules out is the shape #R520 was reported for: an island of a country's own
     archipelago taking a second copy of the country's name. Baffin Island's centre is 1,099 km
     from the centre of the Canadian mainland, whose equal-area radius is 1,606 km — it is inside
     the body that already carries «Canada», and stays unnamed. */
  let judged = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      const ps = sh.parts.get(nm);
      const seen = [];
      for (const f of pts) {
        const [x, y] = f.geometry.coordinates;
        const p = ps.find((q) => inPart(x, y, q.poly));
        if (!p || !p.mid) continue;
        for (const q of seen) {
          assert.ok(gcKm(p.mid, q.mid) > Math.sqrt(q.km / Math.PI),
            sh.y + ': ' + nm + ' put a second name ' + Math.round(gcKm(p.mid, q.mid)).toLocaleString()
            + ' km away, inside the reach of a territory of ' + Math.round(q.km).toLocaleString() + ' km² that already had it');
          judged++;
        }
        seen.push(p);
      }
    }
  }
  assert.ok(judged > 20, 'only ' + judged + ' pairs of same-name labels were weighed');
});

/* ── ⑤ every point of a name is still the same feature, in its own object ──────────────────────── */
test('R707 ⑤: the added points read exactly what the first one does, and own their properties', () => {
  let pairs = 0;
  for (const sh of WALK) {
    for (const [nm, pts] of sh.pts) {
      if (pts.length < 2) continue;
      for (let k = 1; k < pts.length; k++) {
        /* `_same` chooses WHICH of the two layers draws it, `_locName`/`_modName` are the words,
           `NAME`/`_gw` are what `_clk` resolves — a second point that disagreed on any of them
           would open a different country from the one the reader tapped. */
        assert.deepEqual(pts[k].properties, pts[0].properties, sh.y + ': ' + nm + ' point ' + k + ' says something else');
        assert.notEqual(pts[k].properties, pts[0].properties,
          sh.y + ': ' + nm + ' point ' + k + ' SHARES the properties object — #R520 ② is why that must not happen');
        pairs++;
      }
    }
  }
  assert.ok(pairs > 0, 'no polity had a second point, so nothing was compared');
});
