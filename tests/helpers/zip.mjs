/* ============================================================================
 *  tests/helpers/zip.mjs — build a REAL ZIP archive in memory        (#R540 → #R576)
 * ----------------------------------------------------------------------------
 *  Not a fixture checked into the tree: the readers under test have to walk an
 *  actual end-of-central-directory record, an actual central directory and
 *  actual deflate streams, or they prove nothing.
 *
 *  ⚠ MOVED HERE IN #R576 SO THERE IS ONE OF IT. It was written for
 *  tests/r540-checks.test.mjs (the Atlas attachment reader) and the map's import
 *  path needs the same archive to test KMZ and a zipped Shapefile. A second copy
 *  is a second thing to fix when the writer is found to be wrong about a header
 *  field — and a builder that is wrong in the same way as the reader it tests is
 *  exactly the fixture that proves nothing.
 * ==========================================================================*/
import { deflateRawSync } from 'node:zlib';

let TBL = null;
export function crc32(b) {
  if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** zip([[name, Buffer], …]) → Buffer */
export function zip(entries) {
  const locals = [], dir = []; let off = 0;
  for (const [name, buf] of entries) {
    const nm = Buffer.from(name, 'utf8'), comp = deflateRawSync(buf), crc = crc32(buf);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(buf.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(buf.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    dir.push(ch, nm);
    off += lh.length + nm.length + comp.length;
  }
  const body = Buffer.concat(locals), cdir = Buffer.concat(dir), eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10);
  eo.writeUInt32LE(cdir.length, 12); eo.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, cdir, eo]);
}
