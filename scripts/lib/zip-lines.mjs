/* ============================================================================
 *  IntMap · scripts/lib/zip-lines.mjs — READ ONE TEXT FILE OUT OF A ZIP, LINE BY LINE, WITHOUT LOADING IT
 * ----------------------------------------------------------------------------
 *  A GTFS archive's stop_times.txt is hundreds of MB for a metropolitan feed — past Node's string
 *  limit — so it cannot be unzipped into memory. This reads the zip's central directory, then streams
 *  the entry through zlib's raw inflate and yields lines. No dependency (the repository ships none for
 *  zip). Supports stored (0) and deflate (8) entries — every GTFS archive in practice — and refuses
 *  ZIP64/encrypted ones by name rather than misreading them.
 * ==========================================================================*/
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';

/** the central directory: name → { method, csize, usize, offset } */
export function readDirectory(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen); fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error(file + ': not a zip (no end-of-central-directory record)');
    let total = tail.readUInt16LE(e + 10); const cdSize = tail.readUInt32LE(e + 12); let cdOff = tail.readUInt32LE(e + 16);
    if (cdOff === 0xffffffff || total === 0xffff) throw new Error(file + ': ZIP64 archives are not supported');
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = Object.create(null); let p = 0;
    while (total-- > 0 && p + 46 <= cd.length) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(file + ': corrupt central directory');
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const off = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nl);
      if (flags & 1) throw new Error(file + ': encrypted entry ' + name);
      out[name] = { method, csize, usize, offset: off };
      p += 46 + nl + xl + cl;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

/** an async iterator of the lines of one entry (names are matched case-insensitively, last path segment) */
export async function* lines(file, entryName) {
  const dir = readDirectory(file);
  const key = Object.keys(dir).find((n) => n.split('/').pop().toLowerCase() === entryName.toLowerCase());
  if (!key) return;
  const ent = dir[key];
  const fd = fs.openSync(file, 'r');
  let start;
  try {
    const h = Buffer.alloc(30); fs.readSync(fd, h, 0, 30, ent.offset);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error(file + ': bad local header for ' + key);
    start = ent.offset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  } finally { fs.closeSync(fd); }
  let src = fs.createReadStream(file, { start, end: start + ent.csize - 1 });
  if (ent.method === 8) src = src.pipe(zlib.createInflateRaw());
  else if (ent.method !== 0) throw new Error(file + ': unsupported compression method ' + ent.method + ' for ' + key);
  const rl = readline.createInterface({ input: src, crlfDelay: Infinity });
  let first = true;
  for await (let line of rl) {
    if (first) { first = false; if (line.charCodeAt(0) === 0xfeff) line = line.slice(1); }
    if (line.length) yield line;
  }
}

/** one CSV record → fields (RFC 4180 quotes; the common unquoted case is one split) */
export function splitCsv(line) {
  if (line.indexOf('"') < 0) return line.split(',');
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

/** records of one entry as objects keyed by the header row */
export async function* records(file, entryName) {
  let head = null;
  for await (const line of lines(file, entryName)) {
    const f = splitCsv(line);
    if (!head) { head = f.map((h) => h.trim()); continue; }
    const o = {}; for (let i = 0; i < head.length; i++) o[head[i]] = f[i] === undefined ? '' : f[i];
    yield o;
  }
}
