/* ============================================================================
 *  IntMap · geo-import.js — a dropped file becomes a FeatureCollection   (#R576)
 * ----------------------------------------------------------------------------
 *  「外部データ投入がGeoJSONで止まっている。特にCSVをドラッグ → 緯度経度列を
 *    自動認識 → 即ピン化はIntMapにはかなり合います。」
 *
 *  WHAT WAS ACTUALLY WRONG. The map's import path was 58 lines that did
 *  `FileReader.readAsText` then `JSON.parse` (js/map-ui.js, #R166). Everything it
 *  could not read, it called "not valid GeoJSON" — a KML, a GPX, a CSV of ports
 *  and a Shift_JIS spreadsheet all got the same sentence, and the sentence was
 *  wrong about all four. Meanwhile #R540 had already built the hard half of the
 *  answer for the Atlas attachment path — byte signatures, ZIP central
 *  directories, and a text decoder that tries the legacy encodings — and the map
 *  had never been wired to it.
 *
 *  ⚠ SO THIS FILE IS NOT A LIST OF EXTENSIONS. Two questions are separate and are
 *  asked of two different things:
 *
 *    ① WHAT CONTAINER IS THIS?   asked of the BYTES, by ATL_FILE (js/atlas-attach.js).
 *       zip / gzip / pdf / ole, and "which text does this decode as" — the same
 *       decoder that fixed the silently-mojibake Shift_JIS CSV for attachments,
 *       shared rather than copied, so a fix to it reaches both callers.
 *
 *    ② WHAT GRAMMAR IS THIS?     asked of the CONTENT, by the decoders below.
 *       A KML is a document whose root element is <kml>. It is not "a file whose
 *       name ends in .kml" — that name is a hint the operating system attaches,
 *       and #R540 removed exactly that kind of list from the attachment path
 *       after it had been rejecting PDFs, spreadsheets and LICENSE files.
 *
 *  The file name is used for ONE thing: the layer's label in the list. Never to
 *  decide what the file is.
 *
 *  ⚠ AND IT REFUSES. `.agents/rules/no-ad-hoc-hardcoding.md`: 「コードの仕事は判断
 *  することではなく、根拠のないものを拒むこと」. A CSV whose columns cannot be shown
 *  to be coordinates is refused — with the columns it considered — instead of
 *  being guessed at and pinned somewhere false. #R515 is the round where a
 *  guessed coordinate put 宇部港 in 浜松市.
 *
 *  Returns, always:
 *      { ok:true,  fc, format, stats, entry? }
 *      { ok:false, why, detail? }
 *  `why` is a CODE, never a sentence — the nine languages live at the call site
 *  (js/map-ui.js), because this module has no business knowing what UI it is in.
 * ==========================================================================*/

import { ATL_FILE } from './atlas-attach.js';

/* ⚠ ONE EXPORTED BINDING, EVERYTHING ELSE INSIDE IT — the shape js/atlas-attach.js uses and the
   one tests/r175 ③ enforces across js/: an UNEXPORTED top-level declaration in a file that used to
   be a classic script would have been a global, so none of these files has one. Nothing below is
   reachable except through GEO_IMPORT. */
export const GEO_IMPORT = (function () {

  /* ══ 1 · SCALARS — "is this text a coordinate?" ═══════════════════════════════════════════════
     Asked of a VALUE, never of a column name. This is what lets a header-less file work at all. */

  /* Decimal, with the separators real spreadsheets emit. ⚠ A EUROPEAN FILE WRITES 52,37 FOR 52.37
     and uses ';' between columns — so a comma is a decimal point exactly when it is not the
     delimiter, which is a fact only the delimiter decision below knows. It passes it in. */
  function decimal(s, comma) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (comma) t = t.replace(/\./g, '').replace(',', '.');    /* 1.234,56 → 1234.56 */
    else t = t.replace(/,/g, '');                             /* 1,234.56 → 1234.56 */
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return isFinite(n) ? n : null;
  }

  /* Degrees/minutes/seconds, in the shapes people actually paste: 35°41'22.2"N · N35 41 22 ·
     35 41.37 N · -35°41'. The hemisphere letter may lead or trail, and it is what makes the sign. */
  const DMS_RE = /^\s*([NSEWnsew])?\s*([+-]?\d{1,3})\s*[°:\s]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:['′:\s]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]\s*)?)?\s*([NSEWnsew])?\s*$/;
  function dms(s) {
    const m = DMS_RE.exec(String(s == null ? '' : s));
    if (!m) return null;
    if (m[1] && m[5]) return null;                     /* N35°41'S is not a coordinate, it is a typo */
    const hemi = (m[1] || m[5] || '').toUpperCase();
    const d = Number(m[2]);
    const mi = Number(String(m[3]).replace(',', '.'));
    const se = m[4] == null ? 0 : Number(String(m[4]).replace(',', '.'));
    if (!isFinite(d) || !isFinite(mi) || !isFinite(se) || mi >= 60 || se >= 60) return null;
    let v = Math.abs(d) + mi / 60 + se / 3600;
    if (d < 0 || hemi === 'S' || hemi === 'W') v = -v;
    /* The letter also says WHICH axis, and that is evidence no column name can contradict. */
    return { value: v, axis: (hemi === 'N' || hemi === 'S') ? 'lat' : (hemi === 'E' || hemi === 'W') ? 'lon' : null };
  }

  /* One cell → {value, axis} or null. The only coordinate reader in this file. */
  function coordCell(s, comma) {
    const d = decimal(s, comma);
    if (d != null) return { value: d, axis: null };
    return dms(s);
  }

  /* ══ 2 · DELIMITED TEXT ═══════════════════════════════════════════════════════════════════════ */

  /* RFC 4180 with a caller-chosen delimiter: quotes protect the delimiter and the newline, and a
     doubled quote inside a quoted field is one quote. Bare CR, CRLF and LF all end a row. */
  function parseDelimited(text, delim) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
        continue;
      }
      if (c === '"' && cell === '') { q = true; continue; }
      if (c === delim) { row.push(cell); cell = ''; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
        continue;
      }
      cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  }

  /* WHICH CHARACTER SEPARATES THE COLUMNS. Not a constant: a German CSV uses ';', a database export
     uses a tab, a log uses '|'. The answer is the candidate that makes the file look most like a
     TABLE — the same column count on every row — with more columns breaking ties, because any
     delimiter that appears nowhere yields a perfectly consistent table of exactly one column. */
  const DELIMS = [',', '\t', ';', '|'];
  function pickDelimiter(text) {
    const head = text.slice(0, 64 * 1024);
    let best = null;
    for (const d of DELIMS) {
      const rows = parseDelimited(head, d).slice(0, 200);
      if (!rows.length) continue;
      const counts = rows.map((r) => r.length);
      let mode = counts[0], modeN = 0;
      for (const c of counts) { const n = counts.filter((x) => x === c).length; if (n > modeN || (n === modeN && c > mode)) { mode = c; modeN = n; } }
      if (mode < 2) continue;
      const agree = modeN / counts.length;
      const score = agree * 100 + Math.min(mode, 40);
      if (!best || score > best.score) best = { delim: d, cols: mode, agree: agree, score: score };
    }
    return best;
  }

  /* ══ 3 · WHICH COLUMNS ARE THE COORDINATES ════════════════════════════════════════════════════
     ⚠ THE NAME IS EVIDENCE, NOT THE ANSWER — and the values are the other way round. A column can
     only be a latitude if its values are numbers inside [-90,90]; that is a VETO, and it is what
     lets a header-less file work at all. Among the columns that survive the veto, the header words
     break the tie. The words below are a VOCABULARY (how the nine UI languages and the common file
     formats write "latitude"), not a list of cases: adding one is adding a language, not an
     exception, and a file whose header says none of them still works if its numbers do. */
  const LAT_WORDS = /(^|[^a-z])(lat|latitude|lat_dd|lat_deg|ycoord|y_coord|breite|breitengrad|latitud|широта|위도|纬度|緯度)([^a-z]|$)/i;
  const LON_WORDS = /(^|[^a-z])(lon|lng|long|longitude|lon_dd|lon_deg|xcoord|x_coord|laenge|länge|laengengrad|längengrad|longitud|долгота|경도|经度|經度|経度)([^a-z]|$)/i;
  /* ⚠ 'x'/'y' ALONE ARE THE WEAKEST EVIDENCE THERE IS, and also extremely common, so they score,
     they never veto, and they lose to any real word. */
  const X_WORD = /^\s*x\s*$/i, Y_WORD = /^\s*y\s*$/i;

  function normHeader(h) { return String(h == null ? '' : h).replace(/^﻿/, '').trim(); }

  /* Read one column out of the body and say what it could be. */
  function profile(rows, i, comma) {
    let seen = 0, n = 0, min = Infinity, max = -Infinity, axis = null, mixed = false;
    const vals = [];
    for (const r of rows) {
      const raw = r[i];
      if (raw == null || String(raw).trim() === '') continue;
      seen++;
      const c = coordCell(raw, comma);
      if (!c) continue;
      n++; vals.push(c.value);
      if (c.value < min) min = c.value;
      if (c.value > max) max = c.value;
      if (c.axis) { if (axis && axis !== c.axis) mixed = true; axis = c.axis; }
    }
    if (!seen) return null;
    return { i: i, seen: seen, numeric: n, ratio: n / seen, min: min, max: max, axis: mixed ? null : axis, distinct: new Set(vals).size };
  }

  /* A column must be almost entirely coordinates to be one. Not 100 %: real files carry a blank or
     an "N/A" row, and those are counted as absent above rather than as failures. */
  const MIN_RATIO = 0.9;

  /* Can this column be this axis AT ALL? These are the VETOES, and they are facts about the values.
     Nothing a header says can lift one, which is what makes a file whose columns are labelled
     backwards still land in the right place. */
  function vetoed(p, kind, rows) {
    if (!p.numeric || p.ratio < MIN_RATIO) return true;
    const lim = kind === 'lat' ? 90 : 180;
    if (p.min < -lim || p.max > lim) return true;          /* outside the band entirely */
    if (p.distinct < 2 && rows > 2) return true;           /* a constant column is not a coordinate */
    if (p.axis && p.axis !== kind) return true;            /* the hemisphere letter said the other axis */
    return false;
  }

  /* How much this column LOOKS like this axis. May go negative — a header naming the other axis is
     evidence against, not a veto, because the numbers have already had the last word. */
  function score(headers, p, kind) {
    let s = 0;
    const h = normHeader(headers[p.i]);
    if ((kind === 'lat' ? LAT_WORDS : LON_WORDS).test(h)) s += 100;
    if ((kind === 'lat' ? LON_WORDS : LAT_WORDS).test(h)) s -= 120;   /* named as the OTHER one */
    if ((kind === 'lat' ? Y_WORD : X_WORD).test(h)) s += 20;
    if ((kind === 'lat' ? X_WORD : Y_WORD).test(h)) s -= 40;
    if (p.axis === kind) s += 90;                          /* N/S/E/W in the values themselves */
    /* Only a longitude can leave the latitude band, and that is a fact about the numbers. */
    if (kind === 'lon' && (p.min < -90 || p.max > 90)) s += 40;
    return s;
  }

  function inferPair(headers, rows, comma) {
    const cols = [];
    for (let i = 0; i < headers.length; i++) { const p = profile(rows, i, comma); if (p) cols.push(p); }
    const considered = cols.map((p) => ({
      column: normHeader(headers[p.i]) || ('#' + (p.i + 1)),
      numeric: Math.round(p.ratio * 100),
      range: p.numeric ? [p.min, p.max] : null,
    }));

    let best = null;
    for (const a of cols) for (const b of cols) {
      if (a.i === b.i || vetoed(a, 'lat', rows.length) || vetoed(b, 'lon', rows.length)) continue;
      /* Adjacency is a weak but real convention (lat,lon side by side) and only ever breaks ties. */
      const s = score(headers, a, 'lat') + score(headers, b, 'lon')
        + (Math.abs(a.i - b.i) === 1 ? 3 : 0) - Math.abs(a.i - b.i) * 0.01;
      if (!best || s > best.score) best = { lat: a, lon: b, score: s };
    }
    if (!best) return { ok: false, why: 'no-coordinate-columns', considered: considered };

    /* ⚠ SURVIVING THE VETOES IS NOT EVIDENCE. Two columns of prices and quantities both sit inside
       [-90,90] and both pass every test above, so "nothing ruled this pair out" would pin a sales
       report to the Gulf of Guinea. Something has to POSITIVELY say these are coordinates, and there
       are exactly three things that can:
          · a header word naming an axis      (Breite/Länge, lat/lon, 緯度/経度 …)
          · a hemisphere letter in the values (35°40′N)
          · a longitude that leaves ±90       — a number no latitude can be
       A header-less table whose columns all fit inside ±90 genuinely does not say which column is
       which, and #R515 is the round that shows what guessing costs. It is refused. */
    const named = LAT_WORDS.test(normHeader(headers[best.lat.i])) || LON_WORDS.test(normHeader(headers[best.lon.i]));
    const lettered = best.lat.axis === 'lat' || best.lon.axis === 'lon';
    const outOfBand = best.lon.min < -90 || best.lon.max > 90;
    if (!named && !lettered && !outOfBand) return { ok: false, why: 'coordinates-not-identifiable', considered: considered };

    return { ok: true, lat: best.lat.i, lon: best.lon.i, considered: considered };
  }

  /* Is the first row a header? It is when it reads as words while the rows under it read as
     numbers — asked of the two, never assumed. */
  function looksLikeHeader(first, body, comma) {
    if (!body.length) return true;
    const cellNum = (v) => v != null && String(v).trim() !== '' && coordCell(v, comma) != null;
    const firstNums = first.filter(cellNum).length;
    const sample = body.slice(0, 20);
    const bodyNums = sample.reduce((a, r) => a + r.filter(cellNum).length, 0) / sample.length;
    return firstNums < bodyNums;
  }

  /* A cell that is itself a geometry: WKT, or GeoJSON as text. Recognised by SHAPE, not by column
     name — which is the only way "the_geom", "shape", "wkt" and "geometry" all work at once. */
  function geometryCell(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (t.charAt(0) === '{') {
      let g = null;
      try { g = JSON.parse(t); } catch (_) { return null; }
      if (g && g.type === 'Feature' && g.geometry) return g.geometry;
      if (g && g.type && g.coordinates) return g;
      return null;
    }
    return wkt(t);
  }

  /* WKT, the subset with a GeoJSON counterpart. A PostGIS SRID= prefix is accepted and dropped;
     declaring an SRID other than 4326 is REFUSED rather than silently misplaced. */
  function wkt(t) {
    let s = t;
    const srid = /^SRID=(\d+)\s*;\s*/i.exec(s);
    if (srid) { if (srid[1] !== '4326') return null; s = s.slice(srid[0].length); }
    const m = /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON)\s*(?:Z|M|ZM)?\s*\(([\s\S]*)\)\s*$/i.exec(s.trim());
    if (!m) return null;
    const type = m[1].toUpperCase(), body = m[2];
    const pts = (str) => str.split(',').map((p) => {
      const n = p.trim().split(/\s+/).map(Number);
      return (n.length >= 2 && isFinite(n[0]) && isFinite(n[1])) ? [n[0], n[1]] : null;
    });
    const ok = (a) => a.length > 0 && a.every((p) => p != null);
    /* split on the commas that sit at depth 0 — "(a,b),(c,d)" is two groups, not four */
    const groups = (str) => {
      const out = []; let d = 0, cur = '';
      for (const c of str) {
        if (c === '(') { d++; if (d === 1) { cur = ''; continue; } }
        if (c === ')') { d--; if (d === 0) { out.push(cur); continue; } }
        if (d >= 1) cur += c;
      }
      return out;
    };
    try {
      if (type === 'POINT') { const a = pts(body); return (ok(a) && a.length === 1) ? { type: 'Point', coordinates: a[0] } : null; }
      if (type === 'LINESTRING') { const a = pts(body); return (ok(a) && a.length >= 2) ? { type: 'LineString', coordinates: a } : null; }
      if (type === 'MULTIPOINT') {
        const inner = groups(body);
        const a = inner.length ? inner.map((g) => pts(g)[0]) : pts(body);
        return ok(a) ? { type: 'MultiPoint', coordinates: a } : null;
      }
      if (type === 'POLYGON') { const rings = groups(body).map(pts); return (rings.length && rings.every(ok)) ? { type: 'Polygon', coordinates: rings } : null; }
      if (type === 'MULTILINESTRING') { const ls = groups(body).map(pts); return (ls.length && ls.every(ok)) ? { type: 'MultiLineString', coordinates: ls } : null; }
      if (type === 'MULTIPOLYGON') {
        const polys = groups(body).map((p) => groups(p).map(pts));
        return (polys.length && polys.every((rings) => rings.length && rings.every(ok))) ? { type: 'MultiPolygon', coordinates: polys } : null;
      }
    } catch (_) { return null; }
    return null;
  }

  function propsFrom(headers, row, skip) {
    const p = {};
    for (let i = 0; i < headers.length; i++) {
      if (skip.indexOf(i) >= 0) continue;
      const v = row[i];
      if (v == null || String(v).trim() === '') continue;
      p[normHeader(headers[i]) || ('#' + (i + 1))] = String(v).trim();
    }
    return p;
  }

  function decodeDelimited(ctx) {
    const d = pickDelimiter(ctx.text);
    if (!d || d.agree < 0.7) return { ok: false, why: 'not-a-table' };
    const comma = d.delim === ';';        /* see decimal(): ';' between columns frees ',' to be a point */
    const rows = parseDelimited(ctx.text, d.delim).filter((r) => r.length === d.cols);
    if (!rows.length) return { ok: false, why: 'not-a-table' };
    const hasHeader = looksLikeHeader(rows[0], rows.slice(1), comma);
    const headers = hasHeader ? rows[0].map(normHeader) : rows[0].map((_, i) => '#' + (i + 1));
    const body = hasHeader ? rows.slice(1) : rows;
    if (!body.length) return { ok: false, why: 'not-a-table' };

    /* ① a column that IS a geometry wins outright — it carries lines and areas, which a
       latitude/longitude pair cannot. Recognised by parsing the values, never by the column name. */
    for (let i = 0; i < headers.length; i++) {
      let tried = 0, hit = 0;
      for (const r of body.slice(0, 20)) {
        const v = r[i];
        if (v == null || String(v).trim() === '') continue;
        tried++; if (geometryCell(v)) hit++;
      }
      if (tried >= 1 && hit / tried >= MIN_RATIO) {
        const feats = [];
        for (const r of body) { const g = geometryCell(r[i]); if (g) feats.push({ type: 'Feature', geometry: g, properties: propsFrom(headers, r, [i]) }); }
        if (feats.length) return { ok: true, fc: fc(flatten(feats)), format: 'csv-geometry', stats: { rows: body.length, delimiter: d.delim, geometryColumn: headers[i] } };
      }
    }

    /* ② a latitude column and a longitude column */
    const pick = inferPair(headers, body, comma);
    if (!pick.ok) return { ok: false, why: pick.why, detail: { considered: pick.considered, delimiter: d.delim, rows: body.length } };
    const feats = [];
    for (const r of body) {
      const la = coordCell(r[pick.lat], comma), lo = coordCell(r[pick.lon], comma);
      if (!la || !lo) continue;
      if (!(la.value >= -90 && la.value <= 90 && lo.value >= -180 && lo.value <= 180)) continue;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo.value, la.value] }, properties: propsFrom(headers, r, [pick.lat, pick.lon]) });
    }
    if (!feats.length) return { ok: false, why: 'no-coordinate-columns', detail: { considered: pick.considered, delimiter: d.delim, rows: body.length } };
    return {
      ok: true, fc: fc(feats), format: 'csv',
      stats: { rows: body.length, delimiter: d.delim, lat: headers[pick.lat], lon: headers[pick.lon] },
    };
  }

  /* ══ 4 · XML — KML and GPX ════════════════════════════════════════════════════════════════════
     ⚠ PARSED, NOT PATTERN-MATCHED. js/atlas-attach.js strips XML with regular expressions on
     purpose — it wants prose out of machine-written Office parts. Here the STRUCTURE IS THE DATA
     (which <coordinates> belongs to which <Placemark> inside which <Folder>), so a real parser is
     the only correct reader. DOMParser is the browser's; outside one, the XML formats say so rather
     than half-working, and tests/r576.spec.js drives them in a real browser instead. */
  function parseXML(text) {
    if (typeof DOMParser === 'undefined') return null;
    let doc = null;
    try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch (_) { return null; }
    if (!doc || !doc.documentElement) return null;
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc;
  }
  function localName(el) { return String((el && (el.localName || el.nodeName)) || '').toLowerCase(); }
  function rootName(doc) { try { return localName(doc.documentElement); } catch (_) { return ''; } }
  function kids(el, name) {
    const out = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (localName(c) === name) out.push(c);
    return out;
  }
  function textOf(el, name) { const k = kids(el, name)[0]; return k ? String(k.textContent || '').trim() : ''; }

  /* KML's whitespace-separated list of "lon,lat[,alt]". */
  function kmlCoords(s) {
    const out = [];
    for (const tok of String(s || '').trim().split(/\s+/)) {
      if (!tok) continue;
      const p = tok.split(',').map(Number);
      if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) out.push([p[0], p[1]]);
    }
    return out;
  }

  function kmlGeometries(el, out) {
    const name = localName(el);
    if (name === 'point') { const c = kmlCoords(textOf(el, 'coordinates')); if (c.length) out.push({ type: 'Point', coordinates: c[0] }); return; }
    if (name === 'linestring' || name === 'linearring') {
      const c = kmlCoords(textOf(el, 'coordinates'));
      if (c.length >= 2) out.push({ type: 'LineString', coordinates: c });
      return;
    }
    if (name === 'polygon') {
      const rings = [];
      const outer = kids(el, 'outerboundaryis')[0];
      if (outer) { const r = kids(outer, 'linearring')[0]; if (r) { const c = kmlCoords(textOf(r, 'coordinates')); if (c.length >= 4) rings.push(c); } }
      for (const inner of kids(el, 'innerboundaryis')) { const r = kids(inner, 'linearring')[0]; if (r) { const c = kmlCoords(textOf(r, 'coordinates')); if (c.length >= 4) rings.push(c); } }
      if (rings.length) out.push({ type: 'Polygon', coordinates: rings });
      return;
    }
    if (name === 'track') {          /* gx:Track — one <gx:coord>"lon lat alt"</gx:coord> per fix */
      const c = [];
      for (let k = el.firstElementChild; k; k = k.nextElementSibling) {
        if (localName(k) !== 'coord') continue;
        const p = String(k.textContent || '').trim().split(/\s+/).map(Number);
        if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) c.push([p[0], p[1]]);
      }
      if (c.length >= 2) out.push({ type: 'LineString', coordinates: c });
      else if (c.length === 1) out.push({ type: 'Point', coordinates: c[0] });
      return;
    }
    if (name === 'multigeometry' || name === 'multitrack') { for (let c = el.firstElementChild; c; c = c.nextElementSibling) kmlGeometries(c, out); }
  }

  /* ⚠ A KML <description> IS HTML BY SPECIFICATION (OGC 07-147r2 §12.2) — a balloon's markup,
     often a whole table, and in a hostile file a <script> or an onerror attribute. textContent
     hands it back as a STRING that still contains that markup, and putting that string into a
     GeoJSON property puts hostile HTML into a field the rest of this app treats as text. Nothing
     renders an uploaded feature's properties as HTML today, so this is a trap rather than a hole
     — which is exactly the kind of thing #R138 exists to stop being left lying around ("every
     value that originates outside our own code … is HOSTILE"), and CodeQL's js/xss-through-dom
     named this file for it.
     ⚠ THE STRIPPER IS SHARED, NOT WRITTEN AGAIN. js/atlas-attach.js already turns machine-written
     XML into prose, and it already got the hard part right: #R540 found (via CodeQL's
     js/incomplete-multi-character-sanitization, on that same file) that removing markup ONCE can
     put it back — «<scr<b>ipt>» closes up into a tag — so its strip() runs to a FIXED POINT. A
     second implementation here would be a second thing to get wrong. */
  function kmlProps(pm) {
    const p = {};
    const nm = textOf(pm, 'name'); if (nm) p.name = nm;
    const de = textOf(pm, 'description'); if (de) p.description = ATL_FILE.xmlText(de, []).trim();
    for (const ed of kids(pm, 'extendeddata')) {
      for (const d of kids(ed, 'data')) {
        const k = d.getAttribute && d.getAttribute('name'), v = textOf(d, 'value');
        if (k && v) p[k] = v;
      }
      for (const sd of kids(ed, 'schemadata')) for (const sf of kids(sd, 'simpledata')) {
        const k = sf.getAttribute && sf.getAttribute('name'), v = String(sf.textContent || '').trim();
        if (k && v) p[k] = v;
      }
    }
    return p;
  }

  function decodeKML(ctx) {
    const all = ctx.xml.getElementsByTagName('*');
    const feats = [];
    let links = 0;
    for (let i = 0; i < all.length; i++) {
      const el = all[i], n = localName(el);
      if (n === 'networklink') { links++; continue; }
      if (n !== 'placemark') continue;
      const gs = [];
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) kmlGeometries(c, gs);
      const props = kmlProps(el);
      for (const g of gs) feats.push({ type: 'Feature', geometry: g, properties: props });
    }
    if (!feats.length) return { ok: false, why: links ? 'kml-network-link-only' : 'no-features' };
    return { ok: true, fc: fc(feats), format: 'kml', stats: { placemarks: feats.length, networkLinks: links } };
  }

  function decodeGPX(ctx) {
    const doc = ctx.xml, feats = [];
    const at = (el) => {
      const la = Number(el.getAttribute('lat')), lo = Number(el.getAttribute('lon'));
      return (isFinite(la) && isFinite(lo)) ? [lo, la] : null;
    };
    const meta = (el) => {
      const p = {};
      for (const k of ['name', 'desc', 'cmt', 'type', 'sym', 'ele', 'time']) { const v = textOf(el, k); if (v) p[k] = v; }
      return p;
    };
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i], n = localName(el);
      if (n === 'wpt') { const c = at(el); if (c) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: meta(el) }); continue; }
      if (n !== 'trkseg' && n !== 'rte') continue;
      const pts = [];
      for (let k = el.firstElementChild; k; k = k.nextElementSibling) {
        const kn = localName(k);
        if (kn !== 'trkpt' && kn !== 'rtept') continue;
        const c = at(k); if (c) pts.push(c);
      }
      /* a segment's name lives on the <trk> above it, a route's on itself */
      const owner = (n === 'trkseg' && el.parentElement) ? el.parentElement : el;
      if (pts.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: meta(owner) });
      else if (pts.length === 1) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pts[0] }, properties: meta(owner) });
    }
    if (!feats.length) return { ok: false, why: 'no-features' };
    return { ok: true, fc: fc(feats), format: 'gpx', stats: { kept: feats.length } };
  }

  /* ══ 5 · GeoJSON ══════════════════════════════════════════════════════════════════════════════ */
  function fc(features) { return { type: 'FeatureCollection', features: features }; }

  /* The four shapes js/map-ui.js already accepted, kept so nothing that worked stops working, plus
     GeometryCollection and MultiPoint FLATTENED — MapLibre draws them, but IntMapGeodesy
     .sanitizeFeatures (which this path now runs through) drops both, so they would arrive and then
     vanish. Flattening loses no feature; the alternative loses all of them. */
  function flatten(feats) {
    const out = [];
    for (const f of feats) {
      if (!f || !f.geometry) continue;
      const g = f.geometry, props = f.properties || {};
      if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
        out.push(...flatten(g.geometries.map((sub) => ({ type: 'Feature', geometry: sub, properties: props }))));
      } else if (g.type === 'MultiPoint' && Array.isArray(g.coordinates)) {
        for (const c of g.coordinates) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: props });
      } else out.push({ type: 'Feature', geometry: g, properties: props });
    }
    return out;
  }

  function decodeGeoJSON(ctx) {
    const g = ctx.json;
    let feats = null;
    if (g.type === 'FeatureCollection' && Array.isArray(g.features)) feats = g.features;
    else if (g.type === 'Feature') feats = [g];
    else if (g.type && g.coordinates) feats = [{ type: 'Feature', geometry: g, properties: {} }];
    else if (Array.isArray(g.features)) feats = g.features;
    if (!feats) return { ok: false, why: 'json-not-geojson' };
    const flat = flatten(feats);
    if (!flat.length) return { ok: false, why: 'no-features' };
    return { ok: true, fc: fc(flat), format: 'geojson', stats: { kept: flat.length } };
  }

  /* ══ 6 · THE REGISTRY ═════════════════════════════════════════════════════════════════════════
     Each decoder says what it CAN read, and is asked in turn. Adding a format is adding a row —
     there is no chain of `if (ext === …)` for it to be added to, and that is the point. */
  const DECODERS = [
    { id: 'geojson', test: (c) => c.json != null, decode: decodeGeoJSON },
    { id: 'kml', test: (c) => c.xml != null && rootName(c.xml) === 'kml', decode: decodeKML },
    { id: 'gpx', test: (c) => c.xml != null && rootName(c.xml) === 'gpx', decode: decodeGPX },
    { id: 'delimited', test: (c) => !!c.text, decode: decodeDelimited },
  ];

  /* ══ 7 · THE ONE QUESTION THE MAP ASKS ════════════════════════════════════════════════════════ */

  /* The ceiling is ATL_FILE's, deliberately: the map has no reason to hold a SECOND, different
     number for "how much of a dropped file may be read into this tab" (#R504 — two matching numbers
     are one number, not two copies of one). `features` is this module's own and is about the
     renderer: past it, a GeoJSON source stops being a thing a browser can paint. */
  const GEO_IMPORT_LIMITS = Object.freeze({ readBytes: ATL_FILE.LIMITS.readBytes, features: 200000 });

  async function context(bytes, name) {
    const t = ATL_FILE.decodeText(bytes);
    if (!t) return null;
    const text = t.text.replace(/^﻿/, '');
    const ctx = { text: text, encoding: t.encoding, name: name, json: null, xml: null };
    const head = text.slice(0, 4096).trim();
    const c0 = head.charAt(0);
    if (c0 === '{' || c0 === '[') { try { ctx.json = JSON.parse(text); } catch (_) { ctx.json = null; } }
    if (ctx.json == null && c0 === '<') ctx.xml = parseXML(text);
    return ctx;
  }

  async function decodeBytes(bytes, name) {
    const ctx = await context(bytes, name);
    if (!ctx) return { ok: false, why: 'not-text' };
    for (const d of DECODERS) {
      if (!d.test(ctx)) continue;
      const r = d.decode(ctx);
      /* "this is not a table" is the delimited decoder declining, not a verdict on the file. */
      if (r.ok || r.why !== 'not-a-table') return r;
    }
    if (ctx.xml) return { ok: false, why: 'xml-unknown', detail: { root: rootName(ctx.xml) } };
    if (ctx.text.trim().charAt(0) === '<' && typeof DOMParser === 'undefined') return { ok: false, why: 'xml-no-parser' };
    return { ok: false, why: 'unrecognised' };
  }

  /* Inside a ZIP: the entry that decodes into something a decoder recognises. A KMZ is "a ZIP with
     a KML in it" — asked of the entries, not of the ".kmz" on the end of the name. */
  async function fromZip(bytes) {
    const z = ATL_FILE.zipOpen(bytes);
    if (!z) return { ok: false, why: 'unreadable' };
    const names = z.names || [];
    /* Say the useful thing about the archive we cannot read YET, instead of "not valid GeoJSON". */
    if (names.some((n) => /\.shp$/i.test(n))) return { ok: false, why: 'shapefile', detail: { entries: names.length } };
    const likely = (n) => /\.(kml|geojson|json|gpx|csv|tsv|txt)$/i.test(n) ? 0 : 1;
    const ordered = names.slice().filter((n) => !/\/$/.test(n) && !/^__MACOSX\//.test(n)).sort((a, b) => likely(a) - likely(b));
    for (const n of ordered) {
      let inner = null;
      try { inner = await z.read(n); } catch (_) { continue; }
      if (!inner || !inner.length) continue;
      const r = await decodeBytes(inner, n);
      if (r.ok) { r.entry = n; return r; }
    }
    return { ok: false, why: 'archive', detail: { entries: names.length } };
  }

  /**
   * readGeoFile(file) → {ok:true, fc, format, stats, entry?} | {ok:false, why, detail?}
   *
   * `file` is a File or Blob. Nothing about it is trusted except its bytes; `file.name` is carried
   * through only so the caller can label the layer.
   */
  async function readGeoFile(file) {
    const size = (file && file.size) || 0;
    if (size > GEO_IMPORT_LIMITS.readBytes) return { ok: false, why: 'too-big', detail: { size: size, limit: GEO_IMPORT_LIMITS.readBytes } };
    const name = String((file && file.name) || 'data');
    let bytes = null;
    try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (_) { return { ok: false, why: 'unreadable' }; }
    if (!bytes.length) return { ok: false, why: 'empty' };

    const sig = ATL_FILE.sniff(bytes.subarray(0, ATL_FILE.LIMITS.sniff));
    let r;
    if (sig === 'zip') r = await fromZip(bytes);
    else if (sig === 'gzip') {
      const inner = await ATL_FILE.gunzip(bytes);
      r = inner ? await decodeBytes(inner, name) : { ok: false, why: 'unreadable' };
    } else if (sig === 'pdf' || sig === 'ole') r = { ok: false, why: 'not-geodata', detail: { container: sig } };
    else r = await decodeBytes(bytes, name);

    if (!r || !r.ok) return r || { ok: false, why: 'unreadable' };
    /* EVERY path lands here: the app's own coordinate repair, which the upload path had never been
       wired to — it clamps a stray latitude instead of dropping the whole feature (js/geodesy.js). */
    const before = r.fc.features.length;
    let feats = r.fc.features;
    try {
      const G = (typeof window !== 'undefined') && window.IntMapGeodesy;
      if (G && G.sanitizeFeatures) feats = G.sanitizeFeatures(feats);
    } catch (_) { /* the repair is an improvement, not a gate — a missing one must not lose the file */ }
    if (!feats.length) return { ok: false, why: 'no-valid-coordinates', detail: { read: before } };
    if (feats.length > GEO_IMPORT_LIMITS.features) return { ok: false, why: 'too-many-features', detail: { features: feats.length, limit: GEO_IMPORT_LIMITS.features } };
    r.fc = fc(feats);
    r.stats = Object.assign({}, r.stats, { features: feats.length, dropped: before - feats.length });
    return r;
  }

  return { readGeoFile: readGeoFile, LIMITS: GEO_IMPORT_LIMITS };
})();
