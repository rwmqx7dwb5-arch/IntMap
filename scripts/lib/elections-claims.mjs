/* ============================================================================
 *  IntMap · WHAT THE ELECTIONS LAYER CLAIMS ABOUT GROUND, ASKED OF ANOTHER RECORD
 * ----------------------------------------------------------------------------
 *  `npm run check:elections` proves the committed bytes are WELL FORMED: every district has a
 *  result, every result a district, the seats add up. It cannot see the claim the map actually
 *  makes to a reader — «on this date, THIS GROUND voted in THIS election» — because nothing in the
 *  data says what ground a polity had on a date. .agents/rules/historical-verification.md §1 is the
 *  rule this file exists for: a gate that is green on form can be wrong on the claim.
 *
 *  MEASURED 2026-10-03, the first time it was asked: the European Parliament elections of 1979,
 *  1984 and 1989 drew Germany as the reunified country — the German Democratic Republic, which
 *  joined on 1990-10-03 and elected no member before 1994, painted as having voted three times.
 *  scripts/elections/eu.mjs said so in a comment («an acknowledged anachronism in the geometry»);
 *  the reader was told nothing. That is the defect this check refuses.
 *
 *  THE OTHER RECORD is CShapes 2.0 (data/cshapes.js — already shipped for the time machine): the
 *  outline of every sovereign state on every day from 1886 to 2019, with Gleditsch–Ward codes. So
 *  the claim can be asked of an independent source by IDENTIFIER-FREE GEOMETRY: sample the interior
 *  of each district, ask which state's outline held each sample on polling day, and refuse a
 *  district that is partly in a state other than its own. No table maps «DE» to a GW code — the
 *  ground answers, which is the only way a name in one record and a name in another cannot be
 *  mis-joined (historical-verification §4.2).
 *
 *  ⚠ WHAT IT DOES NOT ASK, AND SAYS SO. CShapes ends on its last recorded day (2019-12-31); an
 *  election after that is `unasked`, not passed. A sample that falls in no state's outline (a
 *  coastline drawn differently by two publishers) is counted as `sea` and judged by nobody.
 *  «I could not look» is not «it is fine» (.agents/rules/one-pass-or-a-reason.md §5).
 *
 *  Pure: everything is passed in. The gate (scripts/build-elections.mjs --check) and the test
 *  (tests/companies-elections-live-checks.test.mjs) both evaluate it.
 * ==========================================================================*/

/* How many interior samples a district gets, at least.
   OBSERVED: 2026-10-03, every district of the committed boundary eras: a 9×9 grid over the bounding
   box; a district that keeps fewer than 12 samples inside (a thin coastal or multi-island outline)
   is re-sampled on a 27×27 grid. EXPIRES: if a district is so thin that both grids miss it — it then
   has no land samples and is judged by nobody, which the inventory (--enumerate) shows.
   CANON: these constants. */
const GRID = 9;
const GRID_FINE = 27;
const MIN_SAMPLES = 12;

/* How much of a district may lie in another state before the claim is refused — counted after
   the samples within BORDER_KM of the own state's border and the detached pieces (DETACHED_KM) are
   set aside.
   OBSERVED: 2026-10-03 over every election up to 2019 (100 elections, 20,619 districts): with those
   two set aside, NO district that is one state's ground keeps a single foreign sample (share 0);
   the reunified Germany drawn for the European elections of 1979-1989 keeps 14 of 52 (0.27).
   0.10 sits between them with room on both sides.
   EXPIRES: if a correct district is refused (a border drawn more coarsely than 10 km), or a split
   smaller than a tenth of a district is the claim to refuse — then a finer sample, not a different
   number. CANON: this constant. */
export const FOREIGN_SHARE_MAX = 0.10;

/* How far from its own state's border a sample must lie to count as foreign ground.
   OBSERVED: 2026-10-03, all 266 distinct districts of every election up to 2019 that had any sample
   in a second state: in every one that is genuinely one state's ground, the farthest such sample was
   5.2 km from the own state's CShapes outline (Russia district 74; France, Canada, Germany and the
   US House all under 4.6 km) — the two publishers drawing one border differently. The samples the
   reunified Germany of 1979 put in the GDR lie 15 to 166 km inside it. 10 km separates the two.
   EXPIRES: if a correct district puts a sample farther than this across a border (a coarser
   upstream border), or a split this check exists for lies within 10 km of the border throughout.
   CANON: this constant. */
export const BORDER_KM = 10;
/* How far a sample must be from its own state's whole extent to be a detached piece rather than a
   neighbour's ground. OBSERVED: the GDR samples are within 170 km of the FRG's box; the overseas
   pieces of France's outline are thousands of km from metropolitan France. EXPIRES: if a split
   across a land border reaches farther than this from the own state's box. CANON: this constant. */
export const DETACHED_KM = 500;

/* ── CShapes ───────────────────────────────────────────────────────────────────────────────── */

const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const dateNum = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? ymd(+m[1], +m[2], +m[3]) : null; };

/** The last day CShapes describes — the end of the record, read from the record. */
export function cshapesEnd(cs) {
  let end = 0;
  for (const f of cs.feats) end = Math.max(end, ymd(f[5], f[6], f[7]));
  return end;
}

/* A ring indexed by latitude band, so that a point-in-ring test reads the few edges that cross its
   latitude instead of every edge of a coastline with thousands of vertices. */
function indexRing(ring) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of ring) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const n = Math.max(1, Math.min(512, ring.length >> 3));
  const h = (maxy - miny) / n || 1;
  const bands = Array.from({ length: n }, () => []);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j][1], b = ring[i][1];
    const lo = Math.max(0, Math.floor((Math.min(a, b) - miny) / h));
    const hi = Math.min(n - 1, Math.floor((Math.max(a, b) - miny) / h));
    for (let k = lo; k <= hi; k++) bands[k].push(j);
  }
  return { ring, minx, miny, maxx, maxy, h, n, bands };
}
function inRing(ix, x, y) {
  if (x < ix.minx || x > ix.maxx || y < ix.miny || y > ix.maxy) return false;
  const k = Math.min(ix.n - 1, Math.max(0, Math.floor((y - ix.miny) / ix.h)));
  const r = ix.ring;
  let inside = false;
  for (const j of ix.bands[k]) {
    const i = j + 1 === r.length ? 0 : j + 1;
    const [xj, yj] = r[j], [xi, yi] = r[i];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* polygons as lists of indexed rings: [outer, ...holes] */
function inPolys(polys, x, y) {
  for (const p of polys) {
    if (!inRing(p[0], x, y)) continue;
    let hole = false;
    for (let k = 1; k < p.length; k++) if (inRing(p[k], x, y)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

/** The states CShapes says existed on `date` (YYYY-MM-DD), each with indexed outlines. Memoised by
 *  the set of rows in force, because most elections share it with their neighbours. */
export function statesOn(cs, date, memo = new Map()) {
  const d = dateNum(date);
  const rows = [];
  cs.feats.forEach((f, i) => { if (ymd(f[2], f[3], f[4]) <= d && d <= ymd(f[5], f[6], f[7])) rows.push(i); });
  const key = rows.join(',');
  if (memo.has(key)) return memo.get(key);
  if (!memo.rings) memo.rings = new Map();
  const ringOf = (k) => { if (!memo.rings.has(k)) memo.rings.set(k, indexRing(cs.rings[k])); return memo.rings.get(k); };
  const states = rows.map((i) => {
    const f = cs.feats[i];
    const polys = f[8].map((p) => p.map(ringOf));
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of polys) { const o = p[0]; minx = Math.min(minx, o.minx); miny = Math.min(miny, o.miny); maxx = Math.max(maxx, o.maxx); maxy = Math.max(maxy, o.maxy); }
    return { gw: f[1], name: f[0], polys, minx, miny, maxx, maxy };
  });
  states.key = key;
  memo.set(key, states);
  return states;
}

/* The distance in km from (x, y) to the nearest edge of a state's outlines. Local equirectangular
   projection — exact enough at the scale of a border tolerance. */
/** Distance in km from (x, y) to a state's bounding box (0 inside it). */
export function boxKm(state, x, y) {
  const cx = Math.cos(y * Math.PI / 180);
  const dx = x < state.minx ? state.minx - x : x > state.maxx ? x - state.maxx : 0;
  const dy = y < state.miny ? state.miny - y : y > state.maxy ? y - state.maxy : 0;
  return Math.hypot(dx * cx, dy) * 111.2;
}

export function distanceKm(state, x, y) {
  const cx = Math.cos(y * Math.PI / 180);
  const pad = BORDER_KM / 111 / Math.max(0.05, cx) + BORDER_KM / 111;
  let best = Infinity;
  for (const p of state.polys) for (const ix of p) {
    if (x < ix.minx - pad || x > ix.maxx + pad || y < ix.miny - pad || y > ix.maxy + pad) continue;
    const r = ix.ring;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = (r[j][0] - x) * cx, ay = r[j][1] - y, bx = (r[i][0] - x) * cx, by = r[i][1] - y;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111.2;
      if (d < best) best = d;
    }
  }
  return best;
}

export function stateAt(states, x, y) {
  for (const s of states) {
    if (x < s.minx || x > s.maxx || y < s.miny || y > s.maxy) continue;
    if (inPolys(s.polys, x, y)) return s;
  }
  return null;
}

/* ── districts ─────────────────────────────────────────────────────────────────────────────── */

function featurePolys(g) {
  if (!g) return [];
  const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return list.map((p) => p.map(indexRing));
}

/** Interior samples of one district: a grid over its box, kept where the district is. */
export function samples(geometry) {
  const polys = featurePolys(geometry);
  if (!polys.length) return [];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of polys) { const o = p[0]; minx = Math.min(minx, o.minx); miny = Math.min(miny, o.miny); maxx = Math.max(maxx, o.maxx); maxy = Math.max(maxy, o.maxy); }
  const grid = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = minx + (i + 0.5) * (maxx - minx) / n, y = miny + (j + 0.5) * (maxy - miny) / n;
      if (inPolys(polys, x, y)) out.push([x, y]);
    }
    return out;
  };
  const s = grid(GRID);
  return s.length >= MIN_SAMPLES ? s : grid(GRID_FINE);
}

/**
 * Ask CShapes what ground each district of one election stood on, on polling day.
 * @param {object} election  an index row (date, polity)
 * @param {object} geo       its FeatureCollection
 * @param {object} cs        window.__CSHAPES
 * @param {'one-state'|'member-states'} territory  what the polity is: one state, or a union whose
 *        every district is a whole member state (declared per pack in scripts/elections/upstreams.json)
 * @returns {{ asked:boolean, why?:string, own?:number, districts:Array, refused:Array }}
 */
export function territoryOf(election, geo, cs, territory = 'one-state', memo = new Map(), sampleMemo = new Map()) {
  const d = dateNum(election.date);
  if (d == null || d > cshapesEnd(cs)) return { asked: false, why: 'CShapes ends ' + String(cshapesEnd(cs)).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + '; this election is after its last recorded day', districts: [], refused: [] };
  const states = statesOn(cs, election.date, memo);
  const districts = [];
  for (const f of (geo && geo.features) || []) {
    const cd = f.properties && f.properties.cd;
    const key = (election.geo || '') + '|' + cd;
    let pts = sampleMemo.get(key);
    if (!pts) { pts = samples(f.geometry); sampleMemo.set(key, pts); }
    const by = new Map(), at = [];
    let sea = 0;
    for (const [x, y] of pts) {
      const s = stateAt(states, x, y);
      if (!s) { sea++; continue; }
      by.set(s.gw, (by.get(s.gw) || 0) + 1);
      at.push([x, y, s]);
    }
    let dom = null, domN = 0, land = 0;
    for (const [gw, n] of by) { land += n; if (n > domN) { dom = gw; domN = n; } }
    /* ⚠ A SAMPLE NEAR THE BORDER IS NOT EVIDENCE. CShapes and the electoral publishers draw the same
       border from different sources at different scales, so a sample a few kilometres across it says
       more about the two drawings than about the ground. A foreign sample counts only when it lies
       farther than BORDER_KM from the district's own state. */
    const home = dom == null ? null : states.find((t) => t.gw === dom);
    let foreign = 0, nearBorder = 0, detached = 0;
    const foreignBy = new Map();
    for (const [x, y, s] of at) {
      if (s.gw === dom) continue;
      if (home && distanceKm(home, x, y) <= BORDER_KM) { nearBorder++; continue; }
      /* a piece of the district an ocean away from its own state (France's outline in the European
         Parliament layer carries Guiana; CShapes codes Guiana as a unit of its own) is the
         dependency question again, not a split across a land border */
      if (home && boxKm(home, x, y) > DETACHED_KM) { detached++; continue; }
      foreign++;
      foreignBy.set(s.gw, (foreignBy.get(s.gw) || 0) + 1);
    }
    districts.push({ cd, samples: pts.length, sea, land, by, dominant: dom, foreign, nearBorder, detached, foreignBy });
  }
  /* ⚠ A DISTRICT IS JUDGED AGAINST ITS OWN STATE — the one that holds most of its ground. The claim
     refused is «a district whose ground was SPLIT between two states on polling day» (Germany 1979:
     the FRG and the GDR in one polygon). A district WHOLLY inside another unit is a different
     question CShapes cannot answer: it codes Guadeloupe, Martinique and Réunion as units of their
     own and does not say whose dependency they are, so a French overseas constituency would read
     as «outside France». Those are listed (`elsewhere`) for a person to read and not refused. */
  let own = null;
  if (territory === 'one-state') {
    const tot = new Map();
    for (const x of districts) for (const [gw, n] of x.by) tot.set(gw, (tot.get(gw) || 0) + n);
    let best = 0;
    for (const [gw, n] of tot) if (n > best) { best = n; own = gw; }
  }
  const nameOf = (gw) => { const s = states.find((t) => t.gw === gw); return s ? s.name : String(gw); };
  const refused = [], elsewhere = [];
  for (const x of districts) {
    if (!x.land) continue;
    const share = x.foreign / x.land;
    if (share > FOREIGN_SHARE_MAX) {
      const where = [...x.foreignBy].sort((a, b) => b[1] - a[1]).map(([gw, n]) => nameOf(gw) + ' ' + Math.round(n / x.land * 100) + '%');
      refused.push({ cd: x.cd, share: +share.toFixed(2), home: nameOf(x.dominant), where });
    }
    if (own != null && x.dominant !== own) elsewhere.push({ cd: x.cd, in: nameOf(x.dominant) });
  }
  return { asked: true, own: own != null ? nameOf(own) : null, districts, refused, elsewhere };
}

/** Every refused claim across the index. `readPart(kind, file)` reads a committed part. */
export function territoryClaims(index, readPart, cs, territoryOfPolity = () => 'one-state') {
  const memo = new Map(), sampleMemo = new Map(), seen = new Map();
  const problems = [], unasked = [];
  for (const e of (index && index.elections) || []) {
    if (!e.geo) continue;
    /* one boundary era judged against one set of states gives one answer: the US Senate class maps
       and every era shared by several elections are asked once (measured 2026-10-03: the whole --check went from 20 s to 6 s) */
    const end = cshapesEnd(cs), d = dateNum(e.date);
    const k = d != null && d <= end ? e.geo + '|' + territoryOfPolity(e.polity) + '|' + statesOn(cs, e.date, memo).key : null;
    let t = k && seen.get(k);
    if (!t) {
      const geo = readPart('geo', e.geo);
      if (!geo || !Array.isArray(geo.features)) continue;
      t = territoryOf(e, geo, cs, territoryOfPolity(e.polity), memo, sampleMemo);
      if (k) seen.set(k, t);
    }
    if (!t.asked) { unasked.push(e.id); continue; }
    for (const r of t.refused) {
      problems.push(e.id + ' (' + e.date + ') district ' + r.cd + ': ' + Math.round(r.share * 100) + '% of its ground lay outside ' + r.home
        + ' on polling day by CShapes (' + r.where.join(', ') + ') — the map says that ground voted in this election');
    }
  }
  return { problems, unasked };
}

/* ── the inventory a person reads (historical-verification §2.1) ───────────────────────────── */

/* ⚠ A BOX IN LONGITUDE IS AN ARC ON A CIRCLE, NOT AN INTERVAL ON A LINE. Alaska's at-large district
   runs from the Aleutians past +179° to −130°, so the plain min/max of its longitudes is −180…+180
   — the whole planet — and it was listed inside a box drawn around Germany (measured 2026-10-03,
   `--enumerate --year 1979 --in 5,47,16,55`). The district's extent is the SHORTEST arc that holds
   every longitude it has: the complement of the widest gap between them. Every ring vertex is
   on the district, so the arc is exact for the vertices, which are all a bbox ever looks at. */
export function lonArc(lons) {
  const xs = [...new Set(lons.map((x) => ((x % 360) + 540) % 360 - 180))].sort((a, b) => a - b);
  if (!xs.length) return null;
  let gap = (xs[0] + 360) - xs[xs.length - 1], at = 0;          /* the gap across ±180 */
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; at = i; }
  /* the arc starts after the widest gap and runs east for 360 − gap degrees */
  const west = xs[at];
  return { west, east: west + (360 - gap) };
}
const bboxOf = (g) => {
  let miny = Infinity, maxy = -Infinity;
  const lons = [];
  const walk = (a) => { if (typeof a[0] === 'number') { lons.push(a[0]); if (a[1] < miny) miny = a[1]; if (a[1] > maxy) maxy = a[1]; } else a.forEach(walk); };
  if (g && g.coordinates) walk(g.coordinates);
  const arc = lonArc(lons);
  return { arc, miny, maxy };
};
/** Does a longitude arc (west → east, east may exceed 180) meet the box's [w, e]? A box whose west
 *  edge is east of its east edge (170,…,-170) crosses ±180 itself and is read the same way. */
export function arcMeets(arc, w, e) {
  if (!arc) return false;
  if (w > e) e += 360;
  for (const k of [-360, 0, 360]) if (arc.west + k <= e && arc.east + k >= w) return true;
  return false;
}

/**
 * Name a year and a box; list what the layer draws there: for every polity, the chamber IN FORCE
 * that year (its newest election held on or before 31 December), the boundary era it was drawn on,
 * and every district inside the box with its winner.
 */
export function enumerate(index, readPart, year, box = null) {
  const out = [];
  const end = String(year).padStart(4, '0') + '-12-31';
  const byBody = new Map();
  for (const e of (index && index.elections) || []) {
    if (e.date > end) continue;
    const k = e.polity + '|' + (e.body && e.body.en);
    if (!byBody.has(k) || byBody.get(k).date < e.date) byBody.set(k, e);
  }
  for (const e of [...byBody.values()].sort((a, b) => a.polity.localeCompare(b.polity) || a.date.localeCompare(b.date))) {
    const geo = e.geo ? readPart('geo', e.geo) : null;
    const res = readPart('res', e.res) || {};
    const rows = [];
    for (const f of (geo && geo.features) || []) {
      const bb = bboxOf(f.geometry);
      if (box && (!arcMeets(bb.arc, box[0], box[2]) || bb.maxy < box[1] || bb.miny > box[3])) continue;
      const cd = f.properties && f.properties.cd;
      const r = (res.d || {})[cd] || {};
      rows.push({ cd, name: (f.properties && f.properties.n && (f.properties.n.en || f.properties.n.native)) || '', winner: r.w || null });
    }
    out.push({ election: e.id, date: e.date, body: e.body && e.body.en, geo: e.geo || null, fetchedAt: e.fetchedAt || null, up: e.up || null,
      sameYear: e.date.slice(0, 4) === String(year), districts: rows });
  }
  return out;
}
