/* ============================================================================
 *  scripts/histrecon/annex.mjs — ground a reconstructed record's atoms do not hold   (hist-findings-sweep)
 * ----------------------------------------------------------------------------
 *  An assembler (scripts/histrecon/assembled/*.mjs) draws its units from one atom set. Where a unit's ground of the
 *  time lies outside what that set holds, the unit is drawn short of its own territory, and no other record covers
 *  the difference. MEASURED 2026-10-07: N03-1920 (the 1920 町村, compiled on the 1950 municipalities) holds no 町村
 *  north-east of Etorofu, so at 1900 no first-level unit covered the Kurils from Urup to Shumshu — Japanese from 1875
 *  to 1945 and drawn in Japan by the country layer (scripts/cshapes/review.json kuril-1875) — while they were part of
 *  北海道庁.
 *  ⇒ scripts/histrecon/annex/<KEY>.json (KEY: the assembler's own) lists, per entry, the unit, the dates the fact holds
 *  inside the assembler's scope, another atom set and the ring `within` the added ground lies in, with the fact and its
 *  citations. The polygons of the named atoms whose WHOLE outer ring lies inside `within` are added to every span of
 *  the unit inside [from, to] — beside the union, never cut into it (a polygon partly inside throws). It acts on the
 *  assembler's finished spans, so the assembler's cached unions are not re-keyed by it.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDir } from './atoms/ne-admin1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const annexFile = (key) => path.join(HERE, 'annex', key + '.json');
const inRingXY = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const round6 = (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));
const ymd = (iso) => Number(iso.replace(/-/g, ''));
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** the polygons of `features` (GeoJSON) named in ax.atoms.names whose whole outer ring lies inside ax.within */
export function annexPolys(ax, features) {
  const out = [];
  for (const f of features) {
    if (!ax.atoms.names.includes(f.properties && f.properties.shapeName)) continue;
    const g = f.geometry, ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of ps) {
      let inn = 0, outn = 0; for (const [x, y] of p[0]) { if (inRingXY(ax.within, x, y)) inn++; else outn++; }
      if (inn && outn) throw new Error('annex ' + ax.id + ': a polygon of «' + f.properties.shapeName + '» lies partly inside `within`');
      if (inn) out.push(p);
    }
  }
  if (!out.length) throw new Error('annex ' + ax.id + ': no polygon of ' + ax.atoms.names.join(', ') + ' lies inside `within`');
  return round6(out);
}

/** the assembler's candidate list with every annex entry of `key` applied (the list itself when there is none) */
export function applyAnnex(key, list, log = () => {}, readAtoms = (file) => JSON.parse(fs.readFileSync(path.join(cacheDir(), file), 'utf8')).features) {
  const f = annexFile(key);
  if (!fs.existsSync(f)) return list;
  let out = list;
  for (const ax of JSON.parse(fs.readFileSync(f, 'utf8')).annex || []) {
    const add = annexPolys(ax, readAtoms(ax.atoms.file));
    const S = ymd(ax.from), E = ymd(addDays(ax.to, 1)), next = [];
    let hit = 0;
    for (const c of out) {
      if (c.unit.id !== ax.unit || c.to <= S || c.from >= E) { next.push(c); continue; }
      hit++;
      const a = Math.max(c.from, S), b = Math.min(c.to, E);
      const iso = (n) => String(n).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3');
      if (c.from < a) next.push({ ...c, to: a, span: { ...c.span, to: iso(a) } });
      next.push({ ...c, from: a, to: b, span: { ...c.span, from: iso(a), to: b === c.to ? c.span.to : iso(b) }, polys: c.polys.concat(add), annex: (c.annex || []).concat(ax.id) });
      if (c.to > b) next.push({ ...c, from: b, span: { ...c.span, from: iso(b) } });
    }
    if (!hit) throw new Error('annex ' + ax.id + ': the record ' + key + ' has no span of «' + ax.unit + '» between ' + ax.from + ' and ' + ax.to);
    log('annex ' + ax.id + ' — ' + add.length + ' polygon(s) added to ' + ax.unit + ' in ' + hit + ' span(s), ' + ax.from + ' → ' + ax.to);
    out = next;
  }
  return out;
}

/** the offline gate (npm run check:histrecon): every annex file names an assembler, and every entry states its unit, dates
    inside the assembler's scope, a ring, the atom set and names, the fact and its citations — and the unit is one the
    assembler states. `stated` is the assembler's statedSpans() (no atoms are read). */
export function annexProblems(key, stated) {
  const f = annexFile(key), out = [];
  if (!fs.existsSync(f)) return out;
  const A = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const ax of A.annex || []) {
    const tag = 'annex ' + key + ' ' + ax.id;
    if (!(ax.id && ax.unit && /^\d{4}-\d\d-\d\d$/.test(ax.from) && /^\d{4}-\d\d-\d\d$/.test(ax.to) && ax.from <= ax.to)) out.push(tag + ': id, unit and from <= to (YYYY-MM-DD) are required');
    if (!(Array.isArray(ax.within) && ax.within.length >= 4 && ax.within.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) out.push(tag + ': `within` must be a ring of [lng, lat]');
    if (!(ax.atoms && ax.atoms.file && ax.atoms.dataset && Array.isArray(ax.atoms.names) && ax.atoms.names.length)) out.push(tag + ': name the atom set (file, dataset) and the atoms');
    if (!(typeof ax.fact === 'string' && ax.fact.length > 60 && Array.isArray(ax.cite) && ax.cite.length && ax.cite.every((c) => c && typeof c.cite === 'string'))) out.push(tag + ': state the fact and cite it');
    if (stated && !stated.units.has(ax.unit)) out.push(tag + ': the assembler states no unit «' + ax.unit + '»');
    if (stated && (ax.to >= stated.scopeEnd)) out.push(tag + ': ' + ax.to + ' is outside the assembler’s scope (ends before ' + stated.scopeEnd + ')');
  }
  return out;
}
