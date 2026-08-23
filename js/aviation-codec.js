/* ============================================================================
 *  IntMap · Aviation wire codec — IMAV/1  (#R341)
 * ----------------------------------------------------------------------------
 *  ONE binary format, encoded on the server (supabase/functions/aviation-feed via the mirrored
 *  copy in _shared/) and decoded in the browser worker (src/aviation-worker.js). Same file, so the
 *  two halves cannot drift: scripts/sync-aviation.mjs writes the mirror and
 *  scripts/static-checks.mjs fails the build if it ever differs — the mechanism js/newsgeo.js has
 *  used since #R161.
 *
 *  WHY A BINARY FORMAT AND NOT JSON
 *  --------------------------------
 *  The layer this replaces rebuilt a GeoJSON FeatureCollection for every aircraft on every publish
 *  (js/data-layers.js refreshTrafficLayer) and, in 3-D, up to three polygons per aircraft. At the
 *  50,000-aircraft ceiling the JSON alone is ~18 MB of string that has to be parsed, walked and
 *  garbage-collected four times a minute on the main thread. Measured against that, a fixed-width
 *  record is not an optimisation, it is the only shape that lets a Worker hand the main thread a
 *  transferable buffer it can upload to the GPU without touching a single object.
 *
 *      24 bytes per aircraft  ×  50,000  =  1.20 MB raw  (≈ 380 kB gzip, measured in tests)
 *
 *  QUANTISATION — the error is stated, not hidden (§23.5 asks for it in metres)
 *  ---------------------------------------------------------------------------
 *      longitude / latitude   1e-7 deg   → 1.1 cm            (below any zoom IntMap can reach)
 *      altitude               25 ft      → 7.6 m
 *      track                  0.01 deg   → 0.9 m over 5 km
 *      ground speed           0.1 kt
 *      vertical rate          8 fpm
 *      age                    0.1 s
 *  None of these is visible at the sizes an aircraft glyph is drawn at, and every one of them is a
 *  CONSTANT below — a future round that needs more precision changes the constant and the version,
 *  it does not add a second parallel format.
 *
 *  LAYOUT (little-endian; the only byte order any IntMap target runs)
 *  -----------------------------------------------------------------
 *    HEADER — 40 bytes
 *      0   u32   magic        MAGIC ('IMAV' little-endian)
 *      4   u16   version      VERSION
 *      6   u16   flags        bit0 = this message is a DELTA
 *      8   u32   seq          monotonic per channel; the client detects gaps with it
 *      12  u32   baseSeq      delta only: the seq this delta applies to (0 in a snapshot)
 *      16  f64   serverTimeMs when the server built it (NOT when the aircraft was seen)
 *      24  u32   acCount      records that follow
 *      28  u32   removeCount  icao24s that follow the records
 *      32  u32   textBytes    bytes of the identity section that follows those
 *      36  u32   reserved     0 — a reader must ignore it, so v1 can grow a field here
 *    RECORDS — acCount × 24 bytes, see REC_* below
 *    REMOVALS — removeCount × u32 icao24
 *    IDENTITY — textBytes of UTF-8, one line per aircraft:
 *                 hex \t callsign \t typeDesignator \t registration \t operator \n
 *               Sent only for aircraft whose identity the client has not been told yet; a callsign
 *               changes once a flight, so re-sending it every second is 40 % of the wire for nothing.
 *
 *  FORWARD COMPATIBILITY. A reader that meets a version it does not know refuses the message rather
 *  than mis-reading it (decode throws CodecError). `reserved` and the flags word are the growth
 *  room; unknown flag bits are ignored, never treated as an error.
 * ==========================================================================*/
(function () {
  'use strict';

  /* 'I','M','A','V' read back as a little-endian u32. Written as the number so a reader can compare
     one integer instead of four bytes — and so a big-endian machine, if one ever runs this, fails
     loudly at the magic rather than silently transposing every coordinate. */
  var MAGIC = 0x56414d49;
  var VERSION = 1;

  var HEADER_BYTES = 40;
  var REC_BYTES = 24;

  /* Message flags (header word at offset 6). */
  var MSG_DELTA = 1 << 0;

  /* Per-aircraft flags (record byte at offset 22). */
  var AC_MILITARY  = 1 << 0;
  var AC_ON_GROUND = 1 << 1;
  var AC_EMERGENCY = 1 << 2;
  var AC_POS_VALID = 1 << 3;
  var AC_ALT_GEOM  = 1 << 4;   /* altitude came from GNSS, not the barometer */
  var AC_STALE     = 1 << 5;   /* the server has not re-seen this aircraft inside its freshness window */
  var AC_SPI       = 1 << 6;
  var AC_ALT_VALID = 1 << 7;

  /* Quantisation. Each is a divisor applied on encode and multiplied back on decode. */
  var Q_POS = 1e7;      /* degrees      → i32 */
  var Q_ALT = 25;       /* feet         → i16 */
  var Q_TRK = 100;      /* degrees      → u16 */
  var Q_GS = 10;        /* knots        → u16 */
  var Q_VR = 8;         /* feet/min     → i16 */
  var Q_AGE = 10;       /* seconds      → u16 (0.1 s units) */

  var AGE_MAX = 65535;  /* 6553.5 s — anything older is simply pinned here and flagged stale */

  function CodecError(msg) {
    var e = new Error(msg);
    e.name = 'CodecError';
    return e;
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */

  /* Clamp before the typed-array store truncates. A DataView setInt16 with an out-of-range value
     wraps silently, which is how an aircraft at 40,000 ft would arrive at −25,000 ft. */
  function clampInt(v, lo, hi) {
    v = Math.round(v);
    if (!isFinite(v)) return 0;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function hexToNum(hex) {
    if (typeof hex !== 'string') return 0;
    /* adsb.lol and OpenSky both use lower-case 6-hex-digit ICAO 24-bit addresses. A leading '~'
       marks a non-ICAO (TIS-B / ADS-R) target on the readsb feeds — it is a real aircraft with a
       synthetic address, so it is kept, with the high bit set so it can never collide with a real
       ICAO address (which is 24 bits and therefore always below 0x1000000). */
    var tilde = hex.charCodeAt(0) === 126;
    var s = tilde ? hex.slice(1) : hex;
    var n = parseInt(s, 16);
    if (!isFinite(n) || n < 0) return 0;
    n = n >>> 0;
    return tilde ? ((n | 0x80000000) >>> 0) : n;
  }

  function numToHex(n) {
    n = n >>> 0;
    var tilde = (n & 0x80000000) !== 0;
    var v = tilde ? (n & 0x7fffffff) >>> 0 : n;
    var s = v.toString(16);
    while (s.length < 6) s = '0' + s;
    return tilde ? '~' + s : s;
  }

  /* The identity section is tab-separated, so a field that contains a tab or a newline would shift
     every following column. Operators do put odd characters in a callsign; strip the two that are
     structural and leave everything else alone. */
  function cleanField(s) {
    if (s == null) return '';
    return String(s).replace(/[\t\n\r]/g, ' ').trim();
  }

  var enc = (typeof TextEncoder === 'function') ? new TextEncoder() : null;
  var dec = (typeof TextDecoder === 'function') ? new TextDecoder('utf-8') : null;

  /* ── encode ─────────────────────────────────────────────────────────────── */

  /*  encode(msg) → Uint8Array
   *
   *  msg = {
   *    seq, baseSeq, delta, serverTimeMs,
   *    aircraft: [ { hex, lon, lat, altFt, geometric, track, gsKt, vrFpm, ageSec,
   *                  onGround, military, emergency, spi, stale, category } ],
   *    remove:   [ hex, … ],
   *    identity: [ { hex, callsign, type, registration, operator } ]
   *  }
   *
   *  Every numeric field is optional; a missing one produces the corresponding *_VALID bit unset
   *  rather than a zero that reads as a real measurement. That distinction is the whole point of
   *  §22 — "no data" and "zero" must not look the same downstream.
   */
  function encode(msg) {
    if (!msg || typeof msg !== 'object') throw CodecError('encode: message required');
    var list = msg.aircraft || [];
    var removes = msg.remove || [];
    var idents = msg.identity || [];

    var textStr = '';
    for (var i = 0; i < idents.length; i++) {
      var it = idents[i];
      if (!it || !it.hex) continue;
      textStr += cleanField(it.hex) + '\t' + cleanField(it.callsign) + '\t' +
        cleanField(it.type) + '\t' + cleanField(it.registration) + '\t' +
        cleanField(it.operator) + '\n';
    }
    var textBuf = textStr ? (enc ? enc.encode(textStr) : utf8EncodeFallback(textStr)) : new Uint8Array(0);

    var total = HEADER_BYTES + list.length * REC_BYTES + removes.length * 4 + textBuf.length;
    var out = new Uint8Array(total);
    var dv = new DataView(out.buffer);

    dv.setUint32(0, MAGIC, true);
    dv.setUint16(4, VERSION, true);
    dv.setUint16(6, msg.delta ? MSG_DELTA : 0, true);
    dv.setUint32(8, (msg.seq || 0) >>> 0, true);
    dv.setUint32(12, (msg.baseSeq || 0) >>> 0, true);
    dv.setFloat64(16, msg.serverTimeMs || 0, true);
    dv.setUint32(24, list.length >>> 0, true);
    dv.setUint32(28, removes.length >>> 0, true);
    dv.setUint32(32, textBuf.length >>> 0, true);
    dv.setUint32(36, 0, true);

    var off = HEADER_BYTES;
    for (var k = 0; k < list.length; k++) {
      var a = list[k] || {};
      var f = 0;
      if (a.military) f |= AC_MILITARY;
      if (a.onGround) f |= AC_ON_GROUND;
      if (a.emergency) f |= AC_EMERGENCY;
      if (a.spi) f |= AC_SPI;
      if (a.stale) f |= AC_STALE;
      if (a.geometric) f |= AC_ALT_GEOM;

      var lon = a.lon, lat = a.lat;
      var posOk = (typeof lon === 'number' && typeof lat === 'number' &&
        isFinite(lon) && isFinite(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180);
      if (posOk) f |= AC_POS_VALID;

      var alt = a.altFt;
      var altOk = (typeof alt === 'number' && isFinite(alt));
      if (altOk) f |= AC_ALT_VALID;

      dv.setUint32(off, hexToNum(a.hex), true);
      dv.setInt32(off + 4, posOk ? clampInt(lon * Q_POS, -2147483648, 2147483647) : 0, true);
      dv.setInt32(off + 8, posOk ? clampInt(lat * Q_POS, -2147483648, 2147483647) : 0, true);
      dv.setInt16(off + 12, altOk ? clampInt(alt / Q_ALT, -32768, 32767) : 0, true);
      /* Track is normalised into [0,360) BEFORE quantising: a feed that reports −10° would clamp to
         0 and point every such aircraft due north. */
      var trk = (typeof a.track === 'number' && isFinite(a.track)) ? ((a.track % 360) + 360) % 360 : 0;
      dv.setUint16(off + 14, clampInt(trk * Q_TRK, 0, 65535), true);
      dv.setUint16(off + 16, clampInt((a.gsKt || 0) * Q_GS, 0, 65535), true);
      dv.setInt16(off + 18, clampInt((a.vrFpm || 0) / Q_VR, -32768, 32767), true);
      dv.setUint16(off + 20, clampInt((a.ageSec || 0) * Q_AGE, 0, AGE_MAX), true);
      dv.setUint8(off + 22, f & 0xff);
      dv.setUint8(off + 23, clampInt(a.category || 0, 0, 255));
      off += REC_BYTES;
    }

    for (var r = 0; r < removes.length; r++) {
      dv.setUint32(off, hexToNum(removes[r]), true);
      off += 4;
    }

    out.set(textBuf, off);
    return out;
  }

  /* ── decode ─────────────────────────────────────────────────────────────── */

  /*  decode(bytes) → {
   *    seq, baseSeq, delta, serverTimeMs, count,
   *    icao   : Uint32Array(count)   stable id — the ICAO 24-bit address itself
   *    lon    : Float32Array(count)  degrees
   *    lat    : Float32Array(count)  degrees
   *    alt    : Float32Array(count)  feet   (NaN when AC_ALT_VALID is clear)
   *    track  : Float32Array(count)  degrees
   *    gs     : Float32Array(count)  knots
   *    vr     : Float32Array(count)  feet/min
   *    age    : Float32Array(count)  seconds
   *    flags  : Uint8Array(count)
   *    cat    : Uint8Array(count)
   *    remove : Uint32Array(removeCount)
   *    identity: [ {hex, callsign, type, registration, operator} ]
   *  }
   *
   *  The arrays are struct-of-arrays on purpose: this is what the GPU uploader wants and what the
   *  filter pass wants, and building them here means nothing downstream ever allocates one object
   *  per aircraft.
   *
   *  ⚠ Longitude/latitude are decoded into Float32Array. That is NOT enough precision to hold
   *  1e-7 degrees (float32 has ~7 significant decimal digits, and a longitude near 180 needs 10).
   *  The renderer does not consume these directly — it consumes web-mercator unit coordinates,
   *  computed in this function in DOUBLE precision and returned as `mx`/`my`. `lon`/`lat` are for
   *  display and for the detail card, where 1 m is far below anything shown.
   */
  function decode(bytes) {
    if (!bytes) throw CodecError('decode: no bytes');
    var u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    if (u8.length < HEADER_BYTES) throw CodecError('decode: short header (' + u8.length + ' bytes)');

    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var magic = dv.getUint32(0, true);
    if (magic !== MAGIC) throw CodecError('decode: bad magic 0x' + magic.toString(16));
    var version = dv.getUint16(4, true);
    /* Refuse rather than guess. A v2 record may be a different width, and reading it as v1 would
       produce coordinates that look plausible and are wrong — the worst possible failure. */
    if (version !== VERSION) throw CodecError('decode: unsupported version ' + version);

    var flags = dv.getUint16(6, true);
    var seq = dv.getUint32(8, true);
    var baseSeq = dv.getUint32(12, true);
    var serverTimeMs = dv.getFloat64(16, true);
    var n = dv.getUint32(24, true);
    var nRemove = dv.getUint32(28, true);
    var nText = dv.getUint32(32, true);

    var need = HEADER_BYTES + n * REC_BYTES + nRemove * 4 + nText;
    if (u8.length < need) {
      throw CodecError('decode: truncated — header declares ' + need + ' bytes, got ' + u8.length);
    }

    var icao = new Uint32Array(n);
    var lon = new Float32Array(n);
    var lat = new Float32Array(n);
    var mx = new Float32Array(n);
    var my = new Float32Array(n);
    var alt = new Float32Array(n);
    var track = new Float32Array(n);
    var gs = new Float32Array(n);
    var vr = new Float32Array(n);
    var age = new Float32Array(n);
    var fl = new Uint8Array(n);
    var cat = new Uint8Array(n);

    var off = HEADER_BYTES;
    for (var i = 0; i < n; i++) {
      icao[i] = dv.getUint32(off, true);
      var f = dv.getUint8(off + 22);
      var lo = dv.getInt32(off + 4, true) / Q_POS;
      var la = dv.getInt32(off + 8, true) / Q_POS;
      lon[i] = lo;
      lat[i] = la;
      /* Web-mercator unit square, computed here in double precision — see the note above. */
      if (f & AC_POS_VALID) {
        mx[i] = (lo + 180) / 360;
        var s = Math.sin(la * Math.PI / 180);
        if (s > 0.9999) s = 0.9999; else if (s < -0.9999) s = -0.9999;
        my[i] = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
      } else {
        mx[i] = NaN;
        my[i] = NaN;
      }
      alt[i] = (f & AC_ALT_VALID) ? dv.getInt16(off + 12, true) * Q_ALT : NaN;
      track[i] = dv.getUint16(off + 14, true) / Q_TRK;
      gs[i] = dv.getUint16(off + 16, true) / Q_GS;
      vr[i] = dv.getInt16(off + 18, true) * Q_VR;
      age[i] = dv.getUint16(off + 20, true) / Q_AGE;
      fl[i] = f;
      cat[i] = dv.getUint8(off + 23);
      off += REC_BYTES;
    }

    var remove = new Uint32Array(nRemove);
    for (var r = 0; r < nRemove; r++) {
      remove[r] = dv.getUint32(off, true);
      off += 4;
    }

    var identity = [];
    if (nText) {
      var text = dec ? dec.decode(u8.subarray(off, off + nText)) : utf8DecodeFallback(u8.subarray(off, off + nText));
      var lines = text.split('\n');
      for (var L = 0; L < lines.length; L++) {
        if (!lines[L]) continue;
        var p = lines[L].split('\t');
        identity.push({
          hex: p[0] || '',
          callsign: p[1] || '',
          type: p[2] || '',
          registration: p[3] || '',
          operator: p[4] || '',
        });
      }
    }

    return {
      version: version,
      delta: (flags & MSG_DELTA) !== 0,
      seq: seq,
      baseSeq: baseSeq,
      serverTimeMs: serverTimeMs,
      count: n,
      icao: icao, lon: lon, lat: lat, mx: mx, my: my,
      alt: alt, track: track, gs: gs, vr: vr, age: age,
      flags: fl, cat: cat,
      remove: remove,
      identity: identity,
      bytes: u8.length,
    };
  }

  /* Deno, every browser IntMap supports and Node ≥ 11 all have TextEncoder/TextDecoder. These two
     exist so the codec is not the reason a target fails — they are never reached in practice and
     handle the ASCII that callsigns and registrations actually are. */
  function utf8EncodeFallback(s) {
    var a = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) a.push(c);
      else if (c < 2048) a.push(192 | (c >> 6), 128 | (c & 63));
      else a.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return new Uint8Array(a);
  }
  function utf8DecodeFallback(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) {
      var c = u8[i];
      if (c < 128) s += String.fromCharCode(c);
      else if (c < 224) { s += String.fromCharCode(((c & 31) << 6) | (u8[++i] & 63)); }
      else { s += String.fromCharCode(((c & 15) << 12) | ((u8[++i] & 63) << 6) | (u8[++i] & 63)); }
    }
    return s;
  }

  var API = {
    MAGIC: MAGIC,
    VERSION: VERSION,
    HEADER_BYTES: HEADER_BYTES,
    REC_BYTES: REC_BYTES,
    MSG_DELTA: MSG_DELTA,
    AC_MILITARY: AC_MILITARY,
    AC_ON_GROUND: AC_ON_GROUND,
    AC_EMERGENCY: AC_EMERGENCY,
    AC_POS_VALID: AC_POS_VALID,
    AC_ALT_GEOM: AC_ALT_GEOM,
    AC_STALE: AC_STALE,
    AC_SPI: AC_SPI,
    AC_ALT_VALID: AC_ALT_VALID,
    encode: encode,
    decode: decode,
    hexToNum: hexToNum,
    numToHex: numToHex,
  };

  if (typeof globalThis !== 'undefined') globalThis.IntMapAviationCodec = API;
  else if (typeof window !== 'undefined') window.IntMapAviationCodec = API;
})();
