/* ============================================================================
 *  IntMap · THE BORDERS OF A DATE, TO TAKE AWAY — GeoJSON with every shape's own record  (sales-pro-audiences)
 * ----------------------------------------------------------------------------
 *  「記者・研究者・開発者が IntMap を自分の仕事に組み込み、出典として引用する理由を製品の中に作る。」
 *  The era borders were the one thing IntMap draws that nobody could take with them: a researcher who
 *  wanted «the world on 1 July 1850» as data, a graphics desk that wanted it in QGIS or Datawrapper, a
 *  developer who wanted it in an app, could look at it and press a line for its record (js/border-provenance-card.js),
 *  and nothing more. This writes the shapes the map draws at its instant as a GeoJSON FeatureCollection, each
 *  feature carrying the facts the line card states — which record, which row, the dates and who stated them,
 *  the identifiers, how its outline was written — and the terms it may be reused under.
 *
 *  ══ ⚠⚠⚠ A SHAPE IS RELEASED ONLY UNDER TERMS THAT LET INTMAP PASS IT ON ══════════════════════════════
 *  The terms are not decided here. They are the open-data catalogue's (api/v1/catalog.json, scripts/public-api.mjs),
 *  which reads them from the builders' GOVERNANCE — the same values `npm run check:datagov` holds. A shape is
 *  joined to its catalogue entry by the FILE its row is in (`side.bundle`, js/time-borders.js `_provSide`), and
 *  held to every upstream that entry names, except one that states it began shaping rows only on a later day
 *  (`rowsFrom`) than the row ends. IntMap is a commercial service, so it does not pass on what a non-commercial
 *  licence covers:
 *    released        geometry and attributes — every applicable upstream permits commercial reuse
 *    attributes      the attributes without the outline — the outline was cut against a non-commercial record
 *                    (`contributes: 'outline'`), but the name, dates and identifiers are the row's own record's
 *    withheld        nothing but a count — the row's own record is non-commercial (CShapes 2.0, CC BY-NC-SA 4.0),
 *                    its file is withheld by the catalogue, or the shape has no shipped row
 *  Every withheld shape is counted and the summary says by whom and where the reader can get it themselves.
 *  ⚠ NO TABLE OF RECORDS AND LICENCES IS WRITTEN HERE ([[intmap-discovered-list-is-a-photograph]]): a record whose
 *  licence changes changes what this releases, with no edit to this file.
 *
 *  ⚠ NO DOM, NO window, NO fetch at evaluation: the node tests import `buildExtract` / `termsForSide` and must get
 *  the page's answer. The page hands in the drawn shapes, the side reader and the catalogue (js/map-cite.js).
 * ==========================================================================*/

/** the schema of the file, and of the `intmap` member that describes it */
export const EXTRACT_SCHEMA = 'intmap.borders/1';
/** where the catalogue is served beside the site (scripts/public-api.mjs API_DIR + catalog.json) */
export const CATALOG_PATH = 'api/v1/catalog.json';

/* ⚠ THE OPEN ENDS ARE THE BUILDS' OWN SENTINELS, not chosen here: an OpenHistoricalMap row with no start is drawn from
   [-99999,1,1] and one with no end to [3000,1,1] (scripts/build-border-provenance.mjs `ohmEdge`, which tells «unstated»
   by exactly these). A date at or beyond them is «not stated», written as null — never as a year nobody said. */
const OPEN_START = -99999, OPEN_END = 3000;
const ymd = (a) => (Array.isArray(a) && a.length === 3 && a.every((x) => isFinite(+x))) ? (+a[0]) * 10000 + (+a[1]) * 100 + (+a[2]) : null;
const pad = (n, w) => String(Math.abs(n)).padStart(w, '0');
/** [y, m, d] → 'YYYY-MM-DD' (astronomical years: 0 is 1 BCE, -0499 is 500 BCE, ISO 8601's expanded form), or null when open */
export function isoDay(a) {
  if (!Array.isArray(a) || a.length !== 3) return null;
  const y = +a[0]; if (!isFinite(y) || y <= OPEN_START || y >= OPEN_END) return null;
  return (y < 0 ? '-' : '') + pad(y, 4) + '-' + pad(+a[1], 2) + '-' + pad(+a[2], 2);
}
/* does the row reach `from` ('YYYY-MM-DD') — could a record that began shaping rows that day have shaped it? An end the
   row does not state is read as reaching (the stricter answer); a sheet is the year it is drawn for. */
function reaches(side, from) {
  const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(String(from || '')); if (!m) return true;
  const f = (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);
  const e = ymd(side && side.end);
  if (e != null) return side.endInclusive ? e >= f : e > f;
  if (side && side.sheet != null && isFinite(+side.sheet)) return (+side.sheet) * 10000 + 1231 >= f;
  return true;
}

/**
 * The terms one drawn shape is under, from the catalogue: { state:'released'|'attributes'|'withheld', reason,
 * datasets, upstreams (the applicable ones), licences, credit, shareAlike, blockedBy }.
 */
export function termsForSide(side, catalog) {
  const none = (reason, extra) => Object.assign({ state: 'withheld', reason, datasets: [], upstreams: [], licences: [], credit: false, shareAlike: false, blockedBy: [] }, extra || {});
  if (!side || side.unattributed || !side.bundle) return none('no-record');
  if (!catalog || !Array.isArray(catalog.datasets)) return none('no-catalogue');
  const paths = [side.bundle];
  if (side.coastSnap && side.coastSnap.file) paths.push(side.coastSnap.file);   /* a coast piece: its parent's record and the coast's */
  const datasets = [], ups = [];
  for (const p of paths) {
    const d = catalog.datasets.find((x) => (x.files || []).some((f) => f.path === p));
    if (!d) {
      const w = (catalog.withheld || []).find((x) => (x.paths || []).includes(p));
      return none(w ? 'catalogue:' + w.reason : 'not-in-catalogue', { datasets: w ? [w.id] : [] });
    }
    datasets.push(d.id);
    for (const u of d.upstreams || []) if (!u.rowsFrom || reaches(side, u.rowsFrom)) ups.push(Object.assign({ dataset: d.id }, u));
  }
  const lic = (id) => (catalog.licences || []).find((l) => l.id === id) || null;
  const free = (u) => { const l = lic(u.licenceId); return !!(l && l.commercial); };
  const blocked = ups.filter((u) => !free(u));
  const own = ups.filter((u) => u.contributes !== 'outline');
  const state = !blocked.length ? 'released' : (own.length && own.every(free) ? 'attributes' : 'withheld');
  const kept = state === 'released' ? ups : (state === 'attributes' ? own : []);
  return {
    state, reason: state === 'released' ? null : 'non-commercial', datasets, upstreams: ups,
    licences: [...new Set(kept.map((u) => u.licenceId))],
    credit: kept.some((u) => { const l = lic(u.licenceId); return !!(l && l.credit) || u.creditRequired === true; }),
    shareAlike: kept.some((u) => { const l = lic(u.licenceId); return !!(l && l.shareAlike); }),
    blockedBy: blocked.map((u) => ({ publisher: u.publisher || null, licence: u.licence, licenceId: u.licenceId, url: u.url || null, credit: u.credit || null, outlineOnly: u.contributes === 'outline' })),
  };
}

/* the provenance index row for a side, only when its fingerprint is the drawn row's (the card's rule:
   js/border-provenance-card.js `indexRow`) — a rebuilt bundle never borrows the previous build's relation */
function indexRow(side, indexes) {
  const ix = side && side.index; if (!ix || !indexes) return null;
  const j = indexes[ix.name]; if (!j || !j.sets) return null;
  const set = j.sets[ix.file]; const rows = set ? (Array.isArray(set) ? set : set.rows) : null;
  const r = rows && rows[ix.i];
  if (!r || r[0] !== ix.key) return null;
  const cols = j.columns || [];
  const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o;
}
const relUrl = (id) => 'https://www.openhistoricalmap.org/relation/' + id;

/* the attributes a feature carries — the record's own facts, never a value borrowed from a neighbour */
function propertiesOf(side, terms, ixr) {
  const p = {
    record: side.rec || null,
    dataset: terms.datasets[0] || null,
    file: side.bundle || null,
    record_name: side.recordName || null,
    map_label: side.name || null,
    /* the record names this shape, and the map does not draw that name in this year (js/time-borders.js `blankNote`) */
    record_name_not_drawn: side.withheld ? true : undefined,
    start: isoDay(side.start), end: isoDay(side.end),
    end_inclusive: side.start ? !!side.endInclusive : undefined,
    sheet_year: side.sheet != null ? side.sheet : undefined,
    wikidata: ((side.ids || []).find((x) => x.kind === 'wikidata') || {}).value || null,
    row: side.index ? side.index.i : null,
    row_key: side.index ? side.index.key : null,
    vertex_decimals: side.geometry ? side.geometry.decimals : null,
    vertices: side.geometry ? side.geometry.vertices : null,
    coast_piece: side.coastSnap ? true : undefined,
    licences: terms.licences,
    credit_required: terms.credit,
    share_alike: terms.shareAlike,
  };
  if (ixr) {
    if (ixr.relation != null) p.ohm_relation = [].concat(ixr.relation).map(relUrl);
    for (const k of ['start_date', 'end_date']) if (ixr[k] != null) p['ohm_' + k] = ixr[k];
    if (ixr.FromYear != null) p.cliopatria_from_year = ixr.FromYear;
    if (ixr.ToYear != null) p.cliopatria_to_year = ixr.ToYear;
    if (ixr.SeshatID != null) p.seshat_id = ixr.SeshatID;
    for (const [k, out] of [['startBy', 'start_by'], ['startBasis', 'start_basis'], ['endBy', 'end_by'], ['endBasis', 'end_basis']]) if (ixr[k] != null) p[out] = ixr[k];
  }
  if (terms.state === 'attributes') p.outline_withheld = terms.blockedBy.filter((b) => b.outlineOnly).map((b) => b.credit || b.publisher).join('; ');
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
}

/* does a geometry's bounding box meet [w, s, e, n]? A view across the antimeridian (w > e) is two ranges. */
function meets(g, bb) {
  if (!bb) return true;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
  for (const poly of polys) for (const p of (poly && poly[0]) || []) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  if (!(x1 >= x0)) return false;
  if (y1 < bb[1] || y0 > bb[3]) return false;
  const inX = (w, e) => !(x1 < w || x0 > e);
  return bb[0] <= bb[2] ? inX(bb[0], bb[2]) : (inX(bb[0], 180) || inX(-180, bb[2]));
}

/**
 * buildExtract({ features, sideOf, catalog, at, bbox?, link?, generatedAt?, site?, indexes? })
 *   features  the drawn collection's features (js/time-borders.js `currentFC().features`)
 *   sideOf    f → the side the line card reads (js/time-borders.js `provenanceOf`)
 *   catalog   api/v1/catalog.json
 *   at        the instant drawn, {y, m, d, exact} (js/time-borders.js `drawnAt`)
 *   bbox      [w, s, e, n] to keep only the shapes that reach into it (whole, not clipped), or null for the world
 *   indexes   { ohm, clio } — data/border-provenance-*.json, when read (the relation ids and who stated each date)
 * → { geojson, summary }
 */
export function buildExtract(o) {
  const at = o.at || null;
  const atIso = at ? isoDay([at.y, at.m, at.d]) : null;
  const feats = [], byRecord = {}, blockedBy = new Map(), credits = new Set(), cites = new Set(), licences = new Set();
  let released = 0, attributes = 0, withheld = 0, total = 0;
  const citeOf = new Map();   /* an upstream's citation, by its credit line */
  for (const u of ((o.catalog && o.catalog.datasets) || []).flatMap((d) => d.upstreams || [])) if (u.cite && u.credit) citeOf.set(u.credit, u.cite);
  for (const f of o.features || []) {
    if (!f || !f.geometry || !meets(f.geometry, o.bbox || null)) continue;
    total++;
    let side = null; try { side = o.sideOf(f); } catch (_) { side = null; }
    const t = termsForSide(side, o.catalog);
    const rec = (side && side.rec) || 'unattributed';
    const b = byRecord[rec] || (byRecord[rec] = { released: 0, attributes: 0, withheld: 0 });
    b[t.state]++;
    for (const x of t.blockedBy) {
      const k = (x.credit || x.publisher || x.licence) + '|' + x.licenceId;
      const e = blockedBy.get(k) || Object.assign({ shapes: 0, outlineOnly: 0 }, x); e.shapes++; if (t.state === 'attributes') e.outlineOnly++; blockedBy.set(k, e);
    }
    if (t.state === 'withheld') { withheld++; continue; }
    if (t.state === 'released') released++; else attributes++;
    const kept = t.state === 'released' ? t.upstreams : t.upstreams.filter((u) => u.contributes !== 'outline');
    for (const u of kept) { if (u.credit) credits.add(u.credit); if (u.cite) cites.add(u.cite); else if (citeOf.has(u.credit)) cites.add(citeOf.get(u.credit)); licences.add(u.licenceId); }
    feats.push({ type: 'Feature', geometry: t.state === 'released' ? f.geometry : null, properties: propertiesOf(side, t, indexRow(side, o.indexes)) });
  }
  const summary = {
    at: atIso, exact: at ? !!at.exact : null, shapes: total, released, attributes, withheld,
    byRecord, blockedBy: [...blockedBy.values()], credits: [...credits], cites: [...cites], licences: [...licences],
  };
  const site = o.site || null;
  const geojson = {
    type: 'FeatureCollection',
    features: feats,
    /* a foreign member (RFC 7946 §6.1): what this file is, where it came from and what it may be used for */
    intmap: {
      schema: EXTRACT_SCHEMA,
      what: 'The borders IntMap draws on ' + (atIso || 'the date shown') + ', one feature per shape, each with the record and row it came from and the terms it may be reused under.',
      at: atIso, exact: summary.exact, bbox: o.bbox || null, generatedAt: o.generatedAt || null,
      view: o.link || null, site, catalog: site ? site + CATALOG_PATH : CATALOG_PATH,
      terms: 'Each feature is under the licences in its own `licences` (ids as in the catalogue); this file is a collection of them, not one licence. Credit every record in `credits` when you publish; a share-alike licence applies to what you adapt from that feature.',
      credits: summary.credits, cite: summary.cites, licences: summary.licences,
      counts: { shapes: total, released, attributesOnly: attributes, withheld, byRecord },
      withheld: summary.blockedBy.map((x) => ({ record: x.credit || x.publisher, licence: x.licence, url: x.url, shapes: x.shapes, outlineOnly: x.outlineOnly,
        why: 'IntMap is a commercial service and does not pass on what this licence limits to non-commercial use' + (x.outlineOnly ? '; the attributes of ' + x.outlineOnly + ' shape(s) whose outline it shaped are included without the outline' : '') + '. Its publisher distributes it at the address given.' })),
      columns: {
        record: 'the record the shape is drawn from (cshapes, ohm, ohm-late, clio, sheet, sheet-rest)',
        record_name: 'the name the record gives the row', map_label: 'the name IntMap writes on the map for this date',
        start: 'first day of the row, as drawn (astronomical years); null when the record states none', end: 'the day the row stops being drawn (exclusive unless end_inclusive); null when open',
        start_by: 'who set the start: upstream (the record names that day), partial (a year or month, read as its first day), derived (the build set it — see start_basis), unstated',
        end_by: 'the same, for the end', ohm_relation: 'the OpenHistoricalMap relation(s) the row was built from',
        row: 'the row index in `file`', row_key: 'the fingerprint of that row (js/border-provenance.js rowKey)',
        vertex_decimals: 'decimal places the outline is written to', outline_withheld: 'the record whose terms withhold this shape’s outline',
      },
    },
  };
  return { geojson, summary };
}
