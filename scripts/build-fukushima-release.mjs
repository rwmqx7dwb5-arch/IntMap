/* ============================================================================
 *  IntMap · the Fukushima Daiichi release, hour by hour — data/fukushima-release.json
 * ----------------------------------------------------------------------------
 *    node scripts/build-fukushima-release.mjs
 *
 *  WHAT IT IS
 *   The time series of the atmospheric release of Cs-137 from Fukushima Daiichi, March–April 2011, as
 *   reconstructed by the Japan Atomic Energy Agency: Katata G., Chino M., Kobayashi T. et al. (2015)
 *   "Detailed source term estimation of the atmospheric release for the Fukushima Daiichi Nuclear Power
 *   Station accident by coupling simulations of an atmospheric dispersion model with an improved
 *   deposition scheme and oceanic dispersion model", Atmos. Chem. Phys. 15, 1029–1070,
 *   doi:10.5194/acp-15-1029-2015 — CC BY 3.0. The table is the paper's own machine-readable supplement
 *   (141115_Suppl_acp_JAEAsourceterm.csv inside acp-15-1029-2015-supplement.zip): 71 intervals, each with
 *   a release rate (Bq/h) and a release height (a point, or a volume source for the two explosions).
 *
 *  WHY IT EXISTS
 *   docs/RADIATION-MODEL.md §10: the plume model's answer-check against the 2011 survey could not say how
 *   much of its miss was the RELEASE (the simulator's preset is one constant rate for 120 h) and how much was
 *   the transport. This table is what lets the model be asked that question (js/radiation-model.js
 *   `simulate(…, { release })`).
 *
 *  ⚠ IT IS NOT AN INDEPENDENT MEASUREMENT. The release rates were INFERRED by comparing a dispersion model
 *   (WSPEEDI-II) with measured air concentrations and dose rates, and the paper reports that the result
 *   reproduces the airborne deposition surveys. A model that does well with this release is therefore not
 *   validated by the survey; the answer-check says so wherever it shows this run.
 *
 *  The zip has no published checksum; the md5 below is the one measured on 2026-10-03, and a different file
 *  fails the build instead of silently replacing the table.
 * ==========================================================================*/
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipEntries } from './lib/elections-geo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'fukushima-release.json');
const ZIP = 'https://acp.copernicus.org/articles/15/1029/2015/acp-15-1029-2015-supplement.zip';
const MEMBER = '141115_Suppl_acp_JAEAsourceterm.csv';
/* OBSERVED 2026-10-03 (the publisher states none). Expires if Copernicus re-issues the supplement. */
const ZIP_MD5 = '9075498278502946d7f8625f1e4ad891';

/* ⚠ (#729) 出自は値である。npm run check:datagov がこの宣言と束の実体・js/reference-data.js の DATA_SOURCES を突き合わせる。 */
export const GOVERNANCE = {
  'data/fukushima-release.json': {
    publisher: 'Japan Atomic Energy Agency (Katata et al. 2015, Atmospheric Chemistry and Physics)',
    url: 'https://doi.org/10.5194/acp-15-1029-2015',
    licence: 'CC-BY-3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    /* true: CC BY makes the credit a condition of redistribution; the sentence that pays it is `credit` in the bundle */
    attribution: true,
    paidBy: 'Fukushima Daiichi release time series (JAEA, Katata et al. 2015, CC BY 3.0)',
    cadence: 'static',
    cadenceBasis: {
      observed: 'a closed historical event: the 2011 release reconstruction was published once, as the supplement of an ACP paper (2015-01-30)',
      expires: 'if the supplement is re-issued (the pinned md5 then fails the build), or IntMap adopts a later reconstruction (Terada et al. 2020) whose table is published in a redistributable form',
      canon: 'this record (the only builder that reads the JAEA release table)',
    },
    builtBy: 'scripts/build-fukushima-release.mjs',
  },
};
const G = GOVERNANCE['data/fukushima-release.json'];
const CREDIT = 'Katata G., Chino M., Kobayashi T., Terada H., Ota M., Nagai H., Kajino M., Draxler R., Hort M. C., Malo A., Torii T., Sanada Y. (2015) Atmos. Chem. Phys. 15, 1029–1070, doi:10.5194/acp-15-1029-2015 — Japan Atomic Energy Agency, CC BY 3.0.';

const res = await fetch(ZIP, { headers: { 'user-agent': 'IntMap-build/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)' } });
if (!res.ok) throw new Error('supplement: HTTP ' + res.status);
const zip = Buffer.from(await res.arrayBuffer());
const md5 = createHash('md5').update(zip).digest('hex');
if (md5 !== ZIP_MD5) throw new Error('supplement md5 ' + md5 + ' is not the one this table was built from (' + ZIP_MD5 + ')');
const csvBuf = zipEntries(zip).get(MEMBER);
if (!csvBuf) throw new Error(MEMBER + ' is not in the supplement');
const csvMd5 = createHash('md5').update(csvBuf).digest('hex');

/* columns (the file's own header rows 4–6): JST start, UTC start, UTC end, then Bq/h for I-131 particle, Te-132,
   Cs-137, Cs-134, I-131 as I2, as CH3I, I-131 total, then the release height (m) or a volume XxYxZ, then a note */
const lines = csvBuf.toString('latin1').split(/\r?\n/);
const head = lines[5].split(',');
if (head[5] !== '(Bq/h)' || !/Cs-137/.test(lines[3].split(',')[5])) throw new Error('the Cs-137 column is not where the header says it is');
const utc = (s) => {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error('not a time: ' + s);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString().replace(':00.000Z', 'Z');
};
const segments = [];
let missing = 0, outOfRange = 0;
for (const line of lines.slice(6)) {
  const c = line.split(',');
  if (!c[1] || !c[2]) continue;           /* the closing row (2011/5/1) and the totals row carry no interval */
  const t0 = utc(c[1]), t1 = utc(c[2]), rate = Number(c[5]);
  if (!isFinite(rate)) { missing++; continue; }
  if (!(rate > 0) || !(Date.parse(t1) > Date.parse(t0))) outOfRange++;
  let zBot, zTop;
  const vol = /^(\d+)x(\d+)x(\d+)$/.exec(c[10].trim());
  if (vol) {
    /* a volume source: the note gives its centre height, the third dimension its depth */
    const cen = /center height of (\d+)\s*m/.exec(c[11] || '');
    if (!cen) throw new Error('a volume source without a stated centre height: ' + line);
    zBot = +cen[1] - +vol[3] / 2; zTop = +cen[1] + +vol[3] / 2;
    if (zBot < 0) outOfRange++;
  } else if (/^\d+-\d+$/.test(c[10].trim())) {
    /* a line source (the note says so): released evenly between the two heights */
    [zBot, zTop] = c[10].trim().split('-').map(Number);
    if (!/line-source/.test(c[11] || '') || zBot >= zTop) outOfRange++;
  } else if (/^\d+$/.test(c[10].trim())) { zBot = zTop = +c[10]; }
  else throw new Error('an unreadable release height: ' + c[10]);
  segments.push([t0, t1, rate, zBot, zTop]);
}
const keys = new Set(segments.map((s) => s[0]));
const totalBq = segments.reduce((a, s) => a + s[2] * (Date.parse(s[1]) - Date.parse(s[0])) / 3600e3, 0);
/* the file's own cumulative total for Cs-137 (last row, PBq) — a reading of the table that disagrees with it is a misreading */
const stated = Number(lines.filter((l) => /^,+[\d.]+ ?,[\d.]+/.test(l)).map((l) => l.split(',').pop()).pop());
if (!(Math.abs(totalBq / 1e15 - stated) / stated < 0.01)) throw new Error('the intervals sum to ' + (totalBq / 1e15).toFixed(2) + ' PBq, the file states ' + stated);

const now = new Date().toISOString();
const out = {
  v: 1,
  title: 'Fukushima Daiichi 2011 — atmospheric release of Cs-137 over time (JAEA reconstruction)',
  publisher: G.publisher, url: G.url,
  /* the terms travel with the bytes (tests/chronos-claims-checks.test.mjs ③): a reader holding only this file
     sees what they may do with it — the same sentence radiation-hindcast's `src` ends with */
  src: 'Supplement of Katata et al. (2015), ' + ZIP + ' → ' + MEMBER + ' — CC BY 3.0',
  licence: G.licence, licenceUrl: G.licenceUrl, attribution: true, credit: CREDIT, paidBy: G.paidBy,
  retrievedAt: now.slice(0, 10), generatedAt: now, builtBy: G.builtBy,
  /* what the table is ABOUT: the release, which ended (as far as this table goes) on this date */
  asOf: segments[segments.length - 1][1].slice(0, 10),
  cadence: G.cadence,
  schema: 'segments: [startUTC, endUTC, Cs-137 release rate (Bq/h), bottom of the release (m above ground), top of the release (m)]',
  quality: { rows: segments.length, missing, outOfRange, duplicates: segments.length - keys.size },
  file: { zipMd5: md5, csvMd5, member: MEMBER },
  nuclide: 'cs137',
  totalPBq: +(totalBq / 1e15).toFixed(3),
  statedTotalPBq: stated,
  inferred: 'Release rates were estimated by reverse modelling (WSPEEDI-II against measured air concentrations and dose rates); the paper reports that the result reproduces the airborne deposition surveys. Agreement of another model with the survey under this release is therefore not an independent test.',
  /* the paper decay-corrects nothing the model needs: over the 51 days of the table Cs-137 decays by 0.3 % */
  fields: ['startUTC', 'endUTC', 'bqPerHour', 'zBotM', 'zTopM'],
  segments,
};
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, segments.length, 'intervals', out.totalPBq, 'PBq (file states', stated + ')', 'csv md5', csvMd5);
