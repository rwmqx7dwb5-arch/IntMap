/* ============================================================================
 *  IntMap · THE PHONE'S SLICE OF THE WORLD GAZETTEER  (#R217)
 *  data/gazetteer-world.json.gz  →  data/gazetteer-phone.json.gz
 * ----------------------------------------------------------------------------
 *  「モバイル版が、非常に重くなっている問題を解決して。…わたしのguessは機能拡張により、iPhoneのメモリを
 *    占有して遅くなってしまっていること。」 Measured on an iPhone-13 profile (CPU ÷4, everything but the
 *  app's own origin blocked so only our bytes are on the clock), boot with and without this file:
 *
 *      with     8,308 kB transferred   JS heap 66 MB
 *      without  4,842 kB transferred   JS heap 27 MB
 *
 *  …i.e. the world gazetteer alone is 3.5 MB of a phone's download and 39 MB of its heap. And a
 *  phone was never allowed to USE most of it: js/gazetteer.js has capped the phone at MOBILE_CAP
 *  rows since #R198 (#R208 measured that cap back down to 12,000 on exactly this argument). The
 *  bytes were downloaded, un-gzipped into ~15 MB of text, JSON.parsed into 148,000 rows — and then
 *  92 % of them were dropped on the next line.
 *
 *  So the cap moves to where it costs nothing: the file. The rows are already sorted by population,
 *  so the phone's file is the HEAD OF THE SAME LIST — the same rows, the same names, the same
 *  coordinates, the same GeoNames source and licence. Nothing is re-derived and nothing is a
 *  different dataset; taking row 12,000 out of the file and taking it out in the browser produce a
 *  byte-identical set of places. What changes is that the other 136,000 are never sent.
 *
 *  ⚠ THE ROW COUNT IS A CONTRACT WITH js/gazetteer.js. `PHONE_ROWS` here must be >= that file's
 *  MOBILE_CAP, or a phone would silently know fewer places than the code says it does. This script
 *  READS the constant out of js/gazetteer.js rather than repeating it, and fails loudly if it
 *  cannot find it — tests/r217-checks.test.mjs re-checks the built artefact against the same
 *  constant on every commit.
 *
 *  It takes no network: everything it needs is the artefact scripts/build-gazetteer.mjs already
 *  wrote. scripts/build-gazetteer.mjs calls it at the end, so a full rebuild refreshes both.
 *
 *      node scripts/build-gazetteer-phone.mjs
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data', 'gazetteer-world.json.gz');
const OUT = join(ROOT, 'data', 'gazetteer-phone.json.gz');

/** The phone's row cap, read from the one place that owns it. */
export function phoneCap() {
  const src = readFileSync(join(ROOT, 'js', 'gazetteer.js'), 'utf8');
  const m = /const\s+MOBILE_CAP\s*=\s*(\d+)/.exec(src);
  if (!m) throw new Error('js/gazetteer.js no longer declares MOBILE_CAP — the phone slice has no contract to build against');
  return Number(m[1]);
}

export function buildPhoneGazetteer() {
  if (!existsSync(SRC)) throw new Error('data/gazetteer-world.json.gz is missing — run scripts/build-gazetteer.mjs first');
  const doc = JSON.parse(gunzipSync(readFileSync(SRC)).toString('utf8'));
  const rows = doc.rows || [];
  const cap = phoneCap();
  if (rows.length < cap) throw new Error(`the world gazetteer has ${rows.length} rows, fewer than MOBILE_CAP ${cap}`);
  /* ⚠ SORTED BY POPULATION IS THE WHOLE JUSTIFICATION FOR "the head of the list". Assert it rather
     than trust it: if a future build ever emits a different order, the phone would quietly get an
     arbitrary 12,000 places instead of the 12,000 most populous ones. */
  for (let i = 1; i < rows.length; i++) {
    if ((+rows[i - 1][5] || 0) < (+rows[i][5] || 0)) {
      throw new Error(`data/gazetteer-world.json.gz is not sorted by population (row ${i}) — the phone slice would not be the most populous places`);
    }
  }
  const out = {
    v: doc.v, built: doc.built, attribution: doc.attribution, langs: doc.langs, fields: doc.fields,
    /* what this file IS, carried in the file, so nothing has to infer it from the name */
    slice: { of: 'gazetteer-world', rows: cap, by: 'population desc' },
    rows: rows.slice(0, cap),
  };
  const json = Buffer.from(JSON.stringify(out), 'utf8');
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(OUT, gz);
  return { rows: out.rows.length, json: json.length, gz: gz.length, full: readFileSync(SRC).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = buildPhoneGazetteer();
  console.log(`wrote data/gazetteer-phone.json.gz — ${r.rows.toLocaleString()} rows, `
    + `${(r.json / 1048576).toFixed(1)} MB of JSON → ${(r.gz / 1024).toFixed(0)} kB gzipped `
    + `(the full file is ${(r.full / 1048576).toFixed(2)} MB)`);
}
