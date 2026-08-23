/* ============================================================================
 *  R377 — a cached answer must record the data it was computed from
 * ----------------------------------------------------------------------------
 *  The defect this round fixes is not "the ocean test is wrong". It answers
 *  exactly what it is asked, against `window.countryGeo` — and js/countries-ui.js
 *  REPLACES that object a few seconds after boot, swapping Natural Earth 110 m
 *  for 10 m. The flight simulator's two caches (`_fsOceanCache`, the per-cell
 *  land/sea answer, and `_fsBBox`, the per-feature bounding boxes it pre-filters
 *  with) were built from whichever collection happened to be current on the first
 *  physics frame and then kept for the whole flight, with no record of which one
 *  that was. Over Suruga Bay the two disagree, so the simulator spent the flight
 *  over "land" and #R152's sea-surface floor never engaged.
 *
 *  The BEHAVIOUR is proved in the browser (tests/r356.spec.js, with synthetic
 *  coastlines so it depends on no CDN). What is proved here is the shape that
 *  makes it impossible to reintroduce:
 *
 *    ㋐ the guard runs BEFORE the cache is read — a guard after the early return
 *      would be a guard that never sees the stale hit;
 *    ㋑ the guard empties EVERY cache declared beside it, derived from the
 *      declaration rather than from a list written here;
 *    ㋒ nothing else in the file reads `window.countryGeo`, so there is no third
 *      cache quietly outliving the swap.
 *
 *  ⚠ EACH CHECK CARRIES ITS OWN RED. #R345: a predicate over source text that
 *  has never been shown to fail is a predicate that may be matching its own
 *  prose. Every claim below is also run against a deliberately broken copy of
 *  the same source and must reject it — so a check that stopped discriminating
 *  fails here rather than passing quietly.
 *
 *  ⚠ COMMENTS ARE STRIPPED FIRST (scripts/code-only.mjs, #R345). The paragraph
 *  above names `_fsOceanCache` and `_fsGeoSame`; without the stripper this file
 *  would be reading itself.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = codeOnly(readLF(path.join(ROOT, 'js/flight-sim.js')));

/** the body of `function <name>(…){ … }`, brace-matched */
function body(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'js/flight-sim.js no longer declares ' + name);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(open, i + 1);
}

/** the names declared by the `let` that introduces the ocean caches */
function cacheDecl(src) {
  const at = src.indexOf('let _fsOceanCache');
  assert.ok(at >= 0, 'js/flight-sim.js no longer declares _fsOceanCache');
  const line = src.slice(at, src.indexOf(';', at));
  return line.replace(/^let\s+/, '').split(',').map((s) => s.trim().split('=')[0].trim()).filter(Boolean);
}

/* the three claims, each as a predicate over a source string, so the same
   function can be pointed at a broken copy and required to reject it */
const CLAIMS = {
  'R377 ㋐ the guard runs before the cache is read': (src) => {
    const b = body(src, '_isOpenOcean');
    const guard = b.indexOf('_fsGeoSame(');
    const read = b.indexOf('_fsOceanCache[');
    return guard >= 0 && read >= 0 && guard < read;
  },
  'R377 ㋑ the guard empties every cache declared beside it': (src) => {
    const g = body(src, '_fsGeoSame');
    const names = cacheDecl(src);
    /* the last name on that line is the RECORD of which collection the caches
       hold — it is assigned, not emptied, and the guard needs it to compare */
    const record = names[names.length - 1];
    if (!g.includes(record + '=cg')) return false;
    return names.slice(0, -1).every((n) => new RegExp('\\b' + n + '\\s*=').test(g));
  },
  'R377 ㋒ nothing else in the file reads window.countryGeo': (src) => {
    const hits = src.split('window.countryGeo').length - 1;
    if (hits !== 2) return false;
    return body(src, '_fsBBoxes').includes('window.countryGeo')
      && body(src, '_isOpenOcean').includes('window.countryGeo');
  },
};

/* one edit each that reintroduces the defect, and that every claim must reject */
const BREAKS = {
  'R377 ㋐ the guard runs before the cache is read':
    (src) => src.replace('_fsGeoSame(cg);', ''),
  'R377 ㋑ the guard empties every cache declared beside it':
    (src) => src.replace('_fsOceanCache=Object.create(null); _fsBBox=null;', '_fsBBox=null;'),
  'R377 ㋒ nothing else in the file reads window.countryGeo':
    (src) => src.replace('function _fsGeoSame(cg){', 'function _fsGeoSame(cg){ const _x=window.countryGeo;'),
};

for (const [name, holds] of Object.entries(CLAIMS)) {
  test(name, () => {
    assert.equal(holds(SRC), true, name + ' — js/flight-sim.js does not satisfy it');
    const broken = BREAKS[name](SRC);
    assert.notEqual(broken, SRC, 'the negative control did not change the source — the check proves nothing');
    assert.equal(holds(broken), false, 'the check stayed green on a source that reintroduces the defect');
  });
}
