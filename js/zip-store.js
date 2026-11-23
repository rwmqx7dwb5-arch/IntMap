/* ============================================================================
 *  IntMap · STORED-method ZIP — write and read back   (js/zip-store.js)
 * ----------------------------------------------------------------------------
 *  THE ONE ZIP in the browser code that makes files: the OOXML writers (js/file-office.js, js/office-writer.js) pack
 *  through `zip`, and the verifier opens what they made through `readZip`. Stored (method 0): valid everywhere, nothing
 *  to trust but a CRC-32 per entry. Pure; no DOM.
 * ==========================================================================*/
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder('utf-8').decode(b);

/* ── ZIP ──────────────────────────────────────────────────────────────────── */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** parts: [{ name, data: string|Uint8Array }] → bytes of a ZIP (method 0). [Content_Types].xml first, as OPC wants. */
export function zip(parts, when) {
  const d = when instanceof Date ? when : new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [], central = []; let off = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const p of parts) {
    const name = enc(p.name), data = typeof p.data === 'string' ? enc(p.data) : p.data, crc = crc32(data);
    const lh = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(lh, name, data);
    central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += lh.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(parts.length), ...u16(parts.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = chunks.concat(central, [eocd]), out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

/** open a ZIP written by `zip` (stored method only) → [{ name, data }] | null when it is not one. Checks every CRC. */
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054B50) e--;
  if (e < 0) return null;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014B50) return null;
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec(bytes.subarray(p + 46, p + 46 + nl));
    if (method !== 0 || dv.getUint32(lo, true) !== 0x04034B50) return null;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = bytes.subarray(start, start + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 46 + nl + el + cl;
  }
  return out;
}
