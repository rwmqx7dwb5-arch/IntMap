/* ============================================================================
 *  IntMap · ATLAS — THE GEOGRAPHIC OBJECTS A REPLY IS ABOUT, ONE REFERENCE FOR ALL OF THEM
 * ----------------------------------------------------------------------------
 *  「回答に関係する地理オブジェクトは、地図に置いたかどうかに関わらず回答文でクリックできる」
 *
 *  js/atlas-map-compose.js's prose link used to read ONE source: the records `map.compose` PLACED.
 *  A station, a tunnel, a river or a border that Atlas resolved on the way to its answer but did
 *  not draw as a numbered marker was never clickable, and the route table's end-points carried no
 *  reference at all. The fix is not a longer list of tools to read — it is that the prose, the
 *  legend and the map all hold the SAME kind of object, whoever produced it:
 *
 *    ref = { id, name, spellings[], kind, country, lng, lat, bbox, extent, n?, color?, role?, note?, placed }
 *
 *  Sources, in order of how much they say:
 *    1. the records `map.compose` placed for this reply (numbered, coloured, with a role and note);
 *    2. the shapes it drew (their bounding box, so a river or a border can be framed whole);
 *    3. the places the conversation's ledger (js/atlas-geo-ledger.js) holds from THIS turn —
 *       everything Atlas resolved while answering. A name Atlas never resolved is not a ref, so
 *       an unrelated place name in the prose is never turned into a link.
 *
 *  ⚠ NOTHING HERE LISTS NAMES. The set of objects is whatever the turn resolved; the vocabulary
 *  of `kind` is the ledger's. The only tables are the two that say which kinds have an EXTENT
 *  (an area / a line) instead of a position, and they are facts about the kinds, not about places.
 *
 *  Pure: no DOM, no network, no globals — tests/atlas-geo-prose-links-checks.test.mjs drives it.
 * ==========================================================================*/

/* kinds whose subject is a REGION, not a spot — the camera frames them, it does not zoom onto a point */
const AREA_KINDS = ['country', 'admin1', 'admin2', 'region', 'sea', 'ocean', 'gulf', 'bay', 'basin', 'water', 'desert', 'plateau', 'range', 'continent', 'island', 'lake', 'strait', 'peninsula', 'park'];
/* kinds whose subject is a COURSE — a river, a tunnel, a line, a border */
const LINE_KINDS = ['river', 'canal', 'tunnel', 'railway', 'route', 'line', 'road', 'border', 'fault', 'pipeline', 'bridge'];

export function makeAtlasGeoRefs(deps) {
  deps = deps || {};
  const ledger = deps.ledger || null;

  const str = (v, n) => { const s = String(v == null ? '' : v).trim(); return n ? s.slice(0, n) : s; };
  const fin = (v) => (v != null && v !== '' && typeof v !== 'boolean' && isFinite(+v)) ? +v : null;

  /** extentOf(kind, want) -> 'point' | 'area' | 'line' */
  function extentOf(kind, want) {
    if (want === 'area' || want === 'line') return want;
    const k = str(kind, 40).toLowerCase();
    if (LINE_KINDS.indexOf(k) >= 0) return 'line';
    if (AREA_KINDS.indexOf(k) >= 0) return 'area';
    return 'point';
  }

  /** bboxOf(geometry) -> [w,s,e,n] | null — a GeoJSON geometry's bounding box (an antimeridian-crossing course is the wide box, as drawn) */
  function bboxOf(geom) {
    let w = 181, s = 91, e = -181, n = -91;
    const walk = (c) => {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; return; }
      for (let i = 0; i < c.length; i++) walk(c[i]);
    };
    walk(geom && geom.coordinates);
    return (e >= w && n >= s) ? [w, s, e, n] : null;
  }

  const bboxOk = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => fin(v) != null) && +b[2] >= +b[0] && +b[3] >= +b[1];

  function fromCompose(results) {
    const out = [];
    (Array.isArray(results) ? results : []).forEach((r) => {
      const c = r && r.meta && r.meta.compose;
      if (!c || !Array.isArray(c.placed)) return;
      const shapes = Array.isArray(c.shapes) ? c.shapes : [];
      c.placed.forEach((p) => {
        if (!p || !p.id) return;
        const sh = shapes.find((x) => x && x.item != null && x.item === p.item);
        const bbox = bboxOk(sh && sh.bbox) ? sh.bbox.map(Number) : (bboxOk(p.bbox) ? p.bbox.map(Number) : null);
        out.push({ id: str(p.id, 120), name: str(p.name, 160), spellings: (p.spellings && p.spellings.length ? p.spellings : [p.name, p.canonical]).map((s) => str(s, 120)).filter(Boolean),
          kind: str(p.kind, 40), country: str(p.country, 90), lng: fin(p.lng), lat: fin(p.lat), bbox, extent: extentOf(p.kind, sh && sh.shape),
          shape: sh ? str(sh.shape, 10) : '', n: p.n, color: str(p.color, 40), role: str(p.role, 160), note: str(p.note, 240), placed: true });
      });
    });
    return out;
  }

  function fromLedger(turn) {
    if (!ledger || typeof ledger.all !== 'function') return [];
    let list = [];
    try { list = ledger.all(turn == null ? {} : { since: turn }); } catch (_) { list = []; }
    const out = [];
    list.forEach((e) => {
      if (!e || (turn != null && e.turn !== turn)) return;
      const has = fin(e.lng) != null && fin(e.lat) != null;
      const bbox = bboxOk(e.bbox) ? e.bbox.map(Number) : null;
      if (!has && !bbox) return;   /* nothing to move the camera to is nothing to link */
      const sid = str(e.stableId, 120);
      /* the ledger's aliases are normalised, and include its own identifier — the identifier is not a word in any answer */
      const sp = [e.name, e.canonicalName, e.nativeName].concat(e.aliases || []).map((s) => str(s, 120)).filter((s) => s && s !== sid && s.indexOf(':') < 0);
      out.push({ id: sid, name: str(e.name || e.canonicalName, 160), spellings: sp, kind: str(e.kind, 40), country: str(e.countryName, 90),
        lng: has ? +e.lng : (bbox ? (bbox[0] + bbox[2]) / 2 : null), lat: has ? +e.lat : (bbox ? (bbox[1] + bbox[3]) / 2 : null),
        bbox, extent: extentOf(e.kind, ''), shape: '', role: str(e.role, 160), note: str(e.summary, 240), placed: false });
    });
    return out;
  }

  /**
   * build(results, opts) -> ref[]  (de-duplicated by id; a placed record outranks the ledger's entry for the same thing)
   * opts.turn  the ledger turn this reply belongs to;  opts.prev  refs the reply already held — never forgotten, so a past reply
   *            keeps working after a later turn has touched the same ledger entries.
   */
  function build(results, opts) {
    const o = opts || {};
    const byId = Object.create(null), out = [];
    const put = (r) => {
      if (!r || !r.id) return;
      const old = byId[r.id];
      if (old) {
        /* a placed record is richer; fill what the other source knew and this one did not */
        if (r.placed && !old.placed) { const i = out.indexOf(old); const m = Object.assign({}, old, r, { bbox: r.bbox || old.bbox, spellings: r.spellings.concat(old.spellings.filter((s) => r.spellings.indexOf(s) < 0)) }); out[i] = m; byId[r.id] = m; }
        else { old.spellings = old.spellings.concat(r.spellings.filter((s) => old.spellings.indexOf(s) < 0)); if (!old.bbox && r.bbox) old.bbox = r.bbox; }
        return;
      }
      byId[r.id] = r; out.push(r);
    };
    fromCompose(results).forEach(put);
    (o.prev || []).forEach(put);
    fromLedger(o.turn).forEach(put);
    return out;
  }

  /**
   * view(ref, zoomNow) -> { kind:'point', center, zoom } | { kind:'bounds', bounds:[[w,s],[e,n]] }
   * What the camera is asked to do for a click. A spot is centred (never zoomed OUT); a region or a course is framed whole.
   */
  function view(ref, zoomNow) {
    const z = fin(zoomNow) == null ? 3 : +zoomNow;
    if (ref && ref.bbox && (ref.extent !== 'point' || (ref.bbox[2] - ref.bbox[0]) > 0.02 || (ref.bbox[3] - ref.bbox[1]) > 0.02)) {
      const b = ref.bbox;
      return { kind: 'bounds', bounds: [[b[0], b[1]], [b[2], b[3]]] };
    }
    if (!ref || fin(ref.lng) == null || fin(ref.lat) == null) return null;
    return { kind: 'point', center: [ref.lng, ref.lat], zoom: Math.max(z, ref.extent === 'area' ? 4 : 9) };
  }

  return { build, fromCompose, fromLedger, extentOf, bboxOf, view };
}
