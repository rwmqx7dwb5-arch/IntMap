/* ==========================================================================
 * scripts/histrecon/atoms/geoboundaries.mjs   (hist-reconstruction · the geoBoundaries atom sets)
 *
 * ATOMS = geoBoundaries gbOpen (William & Mary geoLab) at ONE administrative level of ONE country, at the
 * publisher's precision. Three atom sets are declared by the thin modules next to this file:
 *   gb-adm1.mjs «gb-adm1@2026-10-06» · gb-adm2.mjs «gb-adm2@2026-10-06» · gb-adm3.mjs «gb-adm3@2026-10-06»
 *
 * WHY: the dossiers' own `unresolved` entries named the part they lacked — 242 of 691 (2026-10-06) asked for a
 * geoBoundaries ADM2 layer: a province of 1960 that is a union of TODAY's districts can be drawn from the
 * districts, never from today's provinces. A dossier still has to show, from a change list, that the
 * districts it unions kept their lines over the span it claims (docs/HIST-RECONSTRUCTION.md §1).
 *
 * ⚠ ONE LEVEL PER DOSSIER. A country's ADM1 and ADM2 are often from different publishers (Uganda: ADM1
 *   OpenStreetMap, ADM2 Wikimedia Commons, measured in the manifest) and their lines do not nest — mixing
 *   them would open seams. Each level is its own atom set, and a dossier names one.
 *
 * PINNING: every dataset is pinned to the commit its own published download URL names, recorded with its
 * licence in geoboundaries-manifest.json (read from the geoBoundaries API on 2026-10-06). The licence is
 * per dataset — public domain, CC0, CC BY, CC BY IGO, ODbL, CC BY-SA … — and is carried as a value
 * (`licenceOf`) to the governance record of the bundle the rows are written into.
 *
 * COORDINATES AT 1e-7° (≈ 1.1 cm). The files are written with 15 significant decimals — float noise from the
 * publishers' re-projections (1e-15° is far below a nanometre), not survey precision: OpenStreetMap, the source of
 * many of them, stores 7 decimals, and the national datasets are surveyed to metres at best. Carried through, that
 * noise made the full-precision outlines of the reconstruction 516 MB (measured 2026-10-06, 13–15 decimals per
 * coordinate). Rounding at the atom, before any union, keeps every vertex the publisher drew and keeps the coarse
 * overview and the full-precision outline derived from the same bytes (data/border-detail's proof).
 * Expires if a dataset is published with sub-centimetre survey precision.
 *
 * LAZY: 459 datasets; a catalogue or geometry call names the countries it needs (the callers pass the
 * dossiers' countries), so only those files are fetched (0.3–60 MB each) into the shared histrecon cache.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDir } from './ne-admin1.mjs';
import { wrapPolygons } from '../../histsurveys/ristat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'geoboundaries-manifest.json'), 'utf8'));

/** the manifest entry of one country at one level, or null */
export function datasetOf(iso, level) { return MANIFEST.datasets[iso + '-' + level] || null; }
/** the licence a dataset's publisher states, as a value */
export function licenceOf(iso, level) {
  const d = datasetOf(iso, level);
  return d ? { licence: d.licence, detail: d.licenceDetail, source: d.source, sourceUrl: d.sourceUrl, url: d.url, year: d.year } : null;
}

const fcMemo = new Map();
async function collection(iso, level) {
  const key = iso + '-' + level;
  if (fcMemo.has(key)) return fcMemo.get(key);
  const d = datasetOf(iso, level);
  if (!d) { fcMemo.set(key, null); return null; }
  const file = path.join(cacheDir(), 'gb-' + key + '-' + d.commit + '.geojson');
  if (!fs.existsSync(file)) {
    /* (coast-snap-detail) ⚠ ONE PASS, OR A REASON (.agents/rules/one-pass-or-a-reason.md §5) — the same rule as
       scripts/data-assets.mjs `download`: fetched again ONLY after an OBSERVED failure (a thrown network error or a 5xx),
       at most 3 times, and every attempt is printed; a 4xx is final. MEASURED 2026-10-09: GitHub raw answered 504 for
       geoBoundaries-BGD-ADM3 and then geoBoundaries-IND-ADM3 on two CI runs of the same commit, and the one fetch failed
       tests/hist-recon-expand-checks.test.mjs (dossier-check) — a check of nothing that had changed. */
    let r = null;
    for (let attempt = 1; ; attempt++) {
      let why;
      try {
        r = await fetch(d.url, { redirect: 'follow' });
        if (r.ok) break;
        if (r.status < 500) throw Object.assign(new Error('geoBoundaries ' + r.status + ' ' + d.url), { final: true });
        why = 'HTTP ' + r.status;
      } catch (e) {
        if (e.final) throw e;
        why = (e.cause && e.cause.code) || e.code || e.message;
      }
      console.error('  geoBoundaries ' + key + ': attempt ' + attempt + ' failed (' + why + ')');
      if (attempt >= 3) throw new Error('geoBoundaries ' + why + ' ' + d.url + ' after ' + attempt + ' attempts');
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
    const buf = Buffer.from(await r.arrayBuffer());
    /* a Git LFS pointer instead of the file would parse as nothing — refuse it rather than cache it */
    if (buf.length < 2000 && /git-lfs/.test(buf.toString('utf8'))) throw new Error('geoBoundaries returned an LFS pointer for ' + d.url);
    fs.writeFileSync(file, buf);
  }
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  /* shapeID names an atom; a repeated id would make a dossier's atom ambiguous — refuse the dataset */
  const seen = new Set();
  for (const f of fc.features) { const id = f.properties.shapeID; if (seen.has(id)) throw new Error('geoBoundaries ' + key + ': shapeID ' + id + ' repeats'); seen.add(id); }
  fcMemo.set(key, fc);
  return fc;
}

const idOf = (iso, level, p) => iso + '-' + level + '-' + p.shapeID;

export const DECIMALS = 7;
const K = 10 ** DECIMALS;
function clean(ring) {
  const out = [];
  for (const p0 of ring) { const p = [Math.round(p0[0] * K) / K, Math.round(p0[1] * K) / K]; const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}

/** an atom set for one level: { SET, LEVEL, catalogue(countries), geometries(countries) } */
export function atomSet(level) {
  const SET = 'gb-' + level.toLowerCase() + '@' + MANIFEST.read;
  const need = (countries) => {
    if (!countries || !countries.length) throw new Error(SET + ': name the countries (459 datasets are not fetched wholesale)');
    return [...new Set(countries)];
  };
  return {
    SET, LEVEL: level,
    SOURCE: { publisher: 'geoBoundaries (William & Mary geoLab)', title: 'geoBoundaries gbOpen ' + level + ' — per-country datasets pinned in scripts/histrecon/atoms/geoboundaries-manifest.json',
      url: 'https://www.geoboundaries.org/', licence: 'per dataset (see the manifest)', citation: 'Runfola, D. et al. (2020) geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866. https://doi.org/10.1371/journal.pone.0231866' },
    /** { [ISO3]: [{ id, name, iso, group }] } for the countries named */
    async catalogue(countries) {
      const out = {};
      for (const iso of need(countries)) {
        const fc = await collection(iso, level);
        if (!fc) continue;
        out[iso] = fc.features.map((f) => ({ id: idOf(iso, level, f.properties), name: f.properties.shapeName, iso: f.properties.shapeISO || null, group: f.properties.shapeGroup }));
      }
      return out;
    },
    /** Map id → MultiPolygon at the publisher's precision */
    async geometries(countries) {
      const out = new Map();
      for (const iso of need(countries)) {
        const fc = await collection(iso, level);
        if (!fc) continue;
        for (const f of fc.features) {
          const g = f.geometry;
          if (!g) continue;
          const polys = wrapPolygons(g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
            .map((poly) => poly.map(clean)).filter((poly) => poly[0]).map((poly) => poly.filter(Boolean));
          out.set(idOf(iso, level, f.properties), polys);
        }
      }
      return out;
    },
  };
}
