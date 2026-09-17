/* ============================================================================
 *  #R774 · 書き出した GeoTIFF の単位が、この製品の外の GIS に届くか
 * ----------------------------------------------------------------------------
 *  THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *      js/gis-export.js wrote the band's unit into GDAL_METADATA (42112) as
 *          <Item name="UNITTYPE" sample="0" role="unit">K</Item>
 *      and GDAL's GTiff driver pairs UNITTYPE with role="unittype". It is the ROLE that the driver
 *      reads back into the band, so GDAL 3.12.1 opened an IntMap GeoTIFF and reported the unit as
 *      None. The value was in the file. No GIS outside this repository could see it. The line above
 *      it — role="description" — was right, which is what made the wrong one look right.
 *
 *  ⚠⚠⚠ WHY NO ROUND TRIP COULD HAVE CAUGHT IT ([[intmap-co-designed-reader-cannot-falsify]]):
 *  js/gis-geotiff.js keys those items on `name` and ignores `role` entirely, so IntMap wrote a file
 *  IntMap could read and no one else could. Writer and reader, built together, agreed about a file
 *  that was wrong. THEREFORE THE WITNESS IN THIS FILE IS NEITHER OF THEM: the GDAL metadata document
 *  is lifted out of the emitted bytes by a TIFF scanner and an XML item scanner written here, and the
 *  expected role is the spelling GDAL uses.
 *
 *  ⚠ THE EXPECTED SPELLINGS ARE A CONSTANT WITH ITS THREE LINES (.agents/rules/no-ad-hoc-hardcoding.md §4):
 *    · observation — GDAL's GTiff driver carries a fixed pairing of band metadata item names to
 *      roles: DESCRIPTION↔description, UNITTYPE↔unittype, SCALE↔scale, OFFSET↔offset. It writes the
 *      role and it reads the role; a file whose role it does not recognise loses that item.
 *    · what would make it wrong — GDAL renaming a role, which would also orphan every file GDAL
 *      itself has written. ⚠ GDAL IS NOT INSTALLED ON THIS MACHINE, so this is not executed against
 *      it; what is executed is that IntMap writes the spelling and not another one.
 *    · the source of truth — js/gis-export.js, which is the only writer. This file is the only
 *      reference for what it should say, and it is deliberately not derived from it.
 *
 *  ⚠ AND THE READER'S INDEPENDENCE FROM `role` IS MEASURED, not assumed: GeoTIFFs written before
 *  #R774 (and GDAL files carrying roles this reader has never heard of) must keep opening with their
 *  units intact, so js/gis-geotiff.js must go on keying `name`. tests/r749-gis-geotiff-checks reads a
 *  fixture with NO role at all; the check below goes the other way and gives it a role it has never
 *  seen, in bytes of the same length so nothing else about the file moves.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeGisExport } from '../js/gis-export.js';
import { makeGisGeotiff } from '../js/gis-geotiff.js';
import { makeGisDatasets } from '../js/gis-datasets.js';

/* the id door of js/gis-export.js resolves through window.IntMapData at CALL time */
globalThis.window = globalThis;

const EX = makeGisExport();
const GT = makeGisGeotiff();
const DATA = makeGisDatasets();

/* ⚠ WHAT GDAL CALLS THESE. See the header for the observation, the expiry and the source of truth. */
const GDAL_ROLE = { DESCRIPTION: 'description', UNITTYPE: 'unittype' };

let seq = 0;
const GRID = { west: 135.5, north: 35.75, pixelLng: 0.25, pixelLat: 0.125 };

function gridRecord(bands, planes, w, h) {
  return DATA.add({
    id: 'r774-g-' + (++seq), kind: 'raster', title: 'grid', width: w, height: h,
    grid: GRID, bands, provenance: { kind: 'unknown' }, read: (b) => planes[b],
  });
}

/* ══ THE WITNESS — written here, asked of neither the writer nor the reader ═══════════════════ */

/* TIFF 6.0 §2: a little-endian header, one IFD, entries of 12 bytes. ASCII values only, which is all
   GDAL_METADATA is. Nothing here imports js/gis-geotiff.js — a check that asked the reader what the
   writer wrote would be the agreement this file exists to break. */
function asciiTag(bytes, tag) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  assert.equal(u[0], 0x49, 'not a little-endian TIFF');
  assert.equal(dv.getUint16(2, true), 42, 'not a TIFF');
  const ifd = dv.getUint32(4, true);
  const n = dv.getUint16(ifd, true);
  for (let i = 0; i < n; i++) {
    const at = ifd + 2 + i * 12;
    if (dv.getUint16(at, true) !== tag) continue;
    if (dv.getUint16(at + 2, true) !== 2) return null;              /* ASCII only */
    const count = dv.getUint32(at + 4, true);
    const off = count > 4 ? dv.getUint32(at + 8, true) : at + 8;
    let end = off;
    while (end < off + count && u[end] !== 0) end++;
    return new TextDecoder('utf-8').decode(u.subarray(off, end));
  }
  return null;
}

/* Every <Item> with ALL of its attributes — the point of this file is the attribute the module under
   test got wrong, so an item scanner that kept only name and body would measure nothing. */
function items(doc) {
  const out = [];
  for (const m of String(doc).matchAll(/<Item\b([^>]*)>([\s\S]*?)<\/Item>/g)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({
      attrs,
      body: m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, '&'),
    });
  }
  return out;
}

const byName = (list, name, sample) =>
  list.find((it) => it.attrs.name === name && (sample == null || it.attrs.sample === String(sample))) || null;

/* ══ ① 単位の role が GDAL の綴りである ═══════════════════════════════════════════════════ */

test('R774 ① the band unit is written with the role GDAL reads it back from', () => {
  const px = [1.5, 2.5, 3.5, 4.5];
  const rec = gridRecord([{ name: 'surface temperature', unit: 'K', nodata: null }], [px], 2, 2);

  const out = EX.write(rec, { format: 'geotiff' });
  assert.equal(out.ok, true, JSON.stringify(out));

  const doc = asciiTag(out.bytes, 42112);
  assert.ok(doc, 'the file carries no GDAL_METADATA at all');
  const list = items(doc);

  const unit = byName(list, 'UNITTYPE', 0);
  assert.ok(unit, 'the unit item is not in the file');
  assert.equal(unit.body, 'K');
  /* ⚠ THE MEASURED DEFECT. This was role="unit", and GDAL therefore reported no unit. */
  assert.equal(unit.attrs.role, GDAL_ROLE.UNITTYPE,
    'the unit item carries a role GDAL does not read units from: ' + JSON.stringify(unit.attrs));

  /* the neighbouring item was always right, and stays right — a fix that swapped them would be a
     different defect wearing the same green */
  const desc = byName(list, 'DESCRIPTION', 0);
  assert.ok(desc, 'the description item is not in the file');
  assert.equal(desc.body, 'surface temperature');
  assert.equal(desc.attrs.role, GDAL_ROLE.DESCRIPTION);
});

test('R774 ① every band gets its own item, with the sample index and the role', () => {
  /* Two bands, so a role written once outside the loop — or a sample index that did not move —
     shows up here rather than in a one-band file where both look the same. */
  const a = [1, 2, 3, 4], b = [5, 6, 7, 8];
  const rec = gridRecord([
    { name: 'temperature', unit: '°C', nodata: null },
    { name: 'precipitation', unit: 'mm/h', nodata: null },
  ], [a, b], 2, 2);

  const out = EX.write(rec, { format: 'geotiff' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const list = items(asciiTag(out.bytes, 42112));

  const u0 = byName(list, 'UNITTYPE', 0), u1 = byName(list, 'UNITTYPE', 1);
  assert.ok(u0 && u1, 'one of the two bands has no unit item: ' + JSON.stringify(list.map((i) => i.attrs)));
  /* ⚠ UTF-8, not Latin-1: 「°C」 survives the tag as itself, so a degree sign is not evidence of a
     broken role — it is evidence the encoding is right. */
  assert.equal(u0.body, '°C');
  assert.equal(u1.body, 'mm/h');
  assert.equal(u0.attrs.role, GDAL_ROLE.UNITTYPE);
  assert.equal(u1.attrs.role, GDAL_ROLE.UNITTYPE);
  assert.equal(byName(list, 'DESCRIPTION', 1).attrs.role, GDAL_ROLE.DESCRIPTION);

  /* ⚠ AND NO UNIT IS INVENTED FOR A BAND THAT STATES NONE (§1 of js/gis-export.js): an item is a
     claim, and an empty one claims 「単位は無い」 about data whose unit is simply unstated. */
  const bare = gridRecord([{ name: 'count', unit: null, nodata: null }], [a], 2, 2);
  const bareList = items(asciiTag(EX.write(bare, { format: 'geotiff' }).bytes, 42112));
  assert.equal(byName(bareList, 'UNITTYPE', 0), null, 'a unit was invented for a band that states none');
  assert.ok(byName(bareList, 'DESCRIPTION', 0), 'the name that IS stated went missing with it');
});

/* ══ ② 読み手は role に依存しない（#R774 より前のファイルが開けなくなっていない） ═══════ */

test('R774 ② js/gis-geotiff.js reads the unit by NAME — a role it has never seen changes nothing', () => {
  const px = [1.5, 2.5, 3.5, 4.5];
  const rec = gridRecord([{ name: 'elevation', unit: 'm', nodata: null }], [px], 2, 2);
  const bytes = EX.write(rec, { format: 'geotiff' }).bytes;

  return (async () => {
    const r = await GT.read(bytes);
    assert.equal(r.ok, true, JSON.stringify(r.why || null));
    assert.equal(r.grid.bands[0].unit, 'm');
    assert.equal(r.grid.bands[0].name, 'elevation');

    /* ⚠ THE ROLE IS OVERWRITTEN IN PLACE, byte for byte, so the strip offsets and the tag counts do
       not move and the only thing that differs is the attribute. `unittype` and `notarole` are both
       eight bytes. A GeoTIFF written before #R774 says role="unit" and a GDAL file may say something
       else again; all of them must keep opening. */
    const u = new Uint8Array(bytes);
    const where = find(u, 'role="unittype"');
    assert.ok(where >= 0, 'the role is not in the bytes at all — this check is measuring nothing');
    const replacement = new TextEncoder().encode('notarole');
    assert.equal(replacement.length, 8);
    u.set(replacement, where + 'role="'.length);

    const r2 = await GT.read(u);
    assert.equal(r2.ok, true, JSON.stringify(r2.why || null));
    assert.equal(r2.grid.bands[0].unit, 'm',
      'the reader started keying on `role`, so every GeoTIFF written before #R774 lost its units');
  })();
});

function find(u, needle) {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= u.length; i++) {
    for (let j = 0; j < n.length; j++) if (u[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}
