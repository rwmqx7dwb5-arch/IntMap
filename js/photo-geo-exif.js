/* ============================================================================
 *  IntMap · READING EXIF FROM A PHOTOGRAPH — globalThis.IntMapPhotoExif   (#R527)
 * ----------------------------------------------------------------------------
 *  IntMap had no EXIF reader before this round. The one place that took a photograph from the
 *  reader — the Atlas attachment path, js/app-body.js compressImage — draws it through a canvas,
 *  and a canvas keeps pixels and nothing else, so orientation, focal length and any coordinates the
 *  camera recorded were all discarded before anything could look at them. For this feature all
 *  three matter, and they matter in three DIFFERENT ways:
 *
 *   · ORIENTATION must be obeyed, or a portrait photograph is analysed lying on its side and the
 *     skyline trace is nonsense. Browsers apply it to <img> by default but NOT to a canvas drawn
 *     from a bare ImageBitmap, which is what the analysis path uses.
 *   · FOCAL LENGTH is the single most useful hint the search can get: it turns the field of view
 *     from an unknown to be laddered over into a number with a small band around it.
 *   · ⚠ COORDINATES ARE NOT AN ANSWER, AND MUST NEVER BE PRESENTED AS ONE. If the camera recorded
 *     where it was, this feature has been handed the very thing it exists to compute. Reporting
 *     that as «the skyline matched here» would be a lie about the method — the reader would think
 *     the mountains had been recognised when in fact a number was copied out of a file header. So
 *     the presence of coordinates is SHOWN, plainly, and it is kept out of the search: it never
 *     seeds the rectangle, never weights a candidate, and never appears among the results. Its one
 *     legitimate use is the one the reader chooses — as an independent check on an answer already
 *     produced, which is exactly how docs/PHOTO-GEOLOCATION.md evaluates the method.
 *
 *  Only the tags above are read. This is not a general EXIF library and should not become one.
 * ==========================================================================*/
(function () {
  'use strict';

  var T_ORIENTATION = 0x0112, T_EXIF_IFD = 0x8769, T_GPS_IFD = 0x8825;
  var T_FOCAL = 0x920A, T_FOCAL35 = 0xA405, T_FPX_RES = 0xA20E, T_FPY_RES = 0xA20F, T_FP_UNIT = 0xA210;
  var T_PIXEL_X = 0xA002, T_PIXEL_Y = 0xA003, T_MODEL = 0x0110, T_MAKE = 0x010F;
  var T_GPS_LATREF = 1, T_GPS_LAT = 2, T_GPS_LONREF = 3, T_GPS_LON = 4, T_GPS_ALTREF = 5, T_GPS_ALT = 6;
  var T_GPS_IMGDIR_REF = 16, T_GPS_IMGDIR = 17;
  /* bytes per component, indexed by EXIF type code (1 BYTE … 12 DOUBLE) */
  var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

  function parse(buf) {
    var out = { present: false, orientation: 1 };
    try {
      var dv = new DataView(buf);
      if (dv.byteLength < 4) return out;
      if (dv.getUint16(0) !== 0xFFD8) return out;              /* not a JPEG: no EXIF to find */
      var off = 2, tiff = -1;
      while (off + 4 <= dv.byteLength) {
        if (dv.getUint8(off) !== 0xFF) break;
        var marker = dv.getUint8(off + 1);
        if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { off += 2; continue; }
        if (marker === 0xDA || marker === 0xD9) break;          /* start of scan: past the headers */
        var size = dv.getUint16(off + 2);
        if (marker === 0xE1 && off + 10 <= dv.byteLength &&
          dv.getUint32(off + 4) === 0x45786966 && dv.getUint16(off + 8) === 0) { tiff = off + 10; break; }
        off += 2 + size;
      }
      if (tiff < 0 || tiff + 8 > dv.byteLength) return out;
      var bom = dv.getUint16(tiff);
      var le = bom === 0x4949;
      if (!le && bom !== 0x4D4D) return out;
      if (dv.getUint16(tiff + 2, le) !== 42) return out;
      var ifd0 = tiff + dv.getUint32(tiff + 4, le);
      out.present = true;

      var main = readIFD(dv, tiff, ifd0, le);
      if (main[T_ORIENTATION] != null) {
        var or = main[T_ORIENTATION] | 0;
        if (or >= 1 && or <= 8) out.orientation = or;
      }
      if (main[T_MAKE]) out.make = String(main[T_MAKE]);
      if (main[T_MODEL]) out.model = String(main[T_MODEL]);

      if (main[T_EXIF_IFD] != null) {
        var ex = readIFD(dv, tiff, tiff + (main[T_EXIF_IFD] | 0), le);
        if (ex[T_FOCAL] != null) out.focalLengthMm = num(ex[T_FOCAL]);
        if (ex[T_FOCAL35] != null) out.focalLength35mm = num(ex[T_FOCAL35]);
        if (ex[T_PIXEL_X] != null) out.pixelXDimension = num(ex[T_PIXEL_X]);
        if (ex[T_PIXEL_Y] != null) out.pixelYDimension = num(ex[T_PIXEL_Y]);
        if (ex[T_FPX_RES] != null) out.focalPlaneXRes = num(ex[T_FPX_RES]);
        if (ex[T_FPY_RES] != null) out.focalPlaneYRes = num(ex[T_FPY_RES]);
        if (ex[T_FP_UNIT] != null) out.focalPlaneUnit = num(ex[T_FP_UNIT]);
      }
      if (main[T_GPS_IFD] != null) {
        var gp = readIFD(dv, tiff, tiff + (main[T_GPS_IFD] | 0), le);
        var la = dms(gp[T_GPS_LAT], gp[T_GPS_LATREF], 'S');
        var lo = dms(gp[T_GPS_LON], gp[T_GPS_LONREF], 'W');
        if (la != null && lo != null && isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
          /* ⚠ recorded, labelled, and kept out of the search — see the header */
          out.gps = { lat: la, lon: lo };
          if (gp[T_GPS_ALT] != null) {
            var alt = num(gp[T_GPS_ALT]);
            if (isFinite(alt)) out.gps.altitudeM = (num(gp[T_GPS_ALTREF]) === 1 ? -alt : alt);
          }
          if (gp[T_GPS_IMGDIR] != null) {
            var dir = num(gp[T_GPS_IMGDIR]);
            if (isFinite(dir)) {
              out.gps.imgDirectionDeg = dir;
              out.gps.imgDirectionRef = String(gp[T_GPS_IMGDIR_REF] || '').charAt(0) === 'M' ? 'magnetic' : 'true';
            }
          }
        }
      }
    } catch (e) { /* a malformed header is «no EXIF», never an exception into the caller */ }
    return out;
  }

  function readIFD(dv, tiff, ifd, le) {
    var tags = Object.create(null);
    if (ifd + 2 > dv.byteLength) return tags;
    var n = dv.getUint16(ifd, le);
    if (n > 512) return tags;                                   /* not a plausible IFD */
    for (var i = 0; i < n; i++) {
      var e = ifd + 2 + i * 12;
      if (e + 12 > dv.byteLength) break;
      var tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
      var sz = TYPE_SIZE[type] || 0;
      if (!sz || count > 4096) continue;
      var bytes = sz * count;
      var p = bytes <= 4 ? e + 8 : tiff + dv.getUint32(e + 8, le);
      if (p < 0 || p + bytes > dv.byteLength) continue;
      tags[tag] = readVal(dv, p, type, count, le);
    }
    return tags;
  }

  function readVal(dv, p, type, count, le) {
    if (type === 2) {
      var s = '';
      for (var i = 0; i < count; i++) { var c = dv.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); }
      return s;
    }
    var vals = [];
    for (var j = 0; j < count; j++) {
      var q = p + j * TYPE_SIZE[type];
      if (type === 1 || type === 7) vals.push(dv.getUint8(q));
      else if (type === 3) vals.push(dv.getUint16(q, le));
      else if (type === 4) vals.push(dv.getUint32(q, le));
      else if (type === 5) { var nu = dv.getUint32(q, le), de = dv.getUint32(q + 4, le); vals.push(de ? nu / de : 0); }
      else if (type === 6) vals.push(dv.getInt8(q));
      else if (type === 8) vals.push(dv.getInt16(q, le));
      else if (type === 9) vals.push(dv.getInt32(q, le));
      else if (type === 10) { var nn = dv.getInt32(q, le), dd = dv.getInt32(q + 4, le); vals.push(dd ? nn / dd : 0); }
      else if (type === 11) vals.push(dv.getFloat32(q, le));
      else if (type === 12) vals.push(dv.getFloat64(q, le));
      else vals.push(0);
    }
    return count === 1 ? vals[0] : vals;
  }

  function num(v) { return Array.isArray(v) ? Number(v[0]) : Number(v); }

  function dms(v, ref, negRef) {
    if (v == null) return null;
    var a = Array.isArray(v) ? v : [v, 0, 0];
    var d = Number(a[0]) || 0, m = Number(a[1]) || 0, s = Number(a[2]) || 0;
    var val = d + m / 60 + s / 3600;
    if (String(ref || '').charAt(0).toUpperCase() === negRef) val = -val;
    return val;
  }

  /* ── the field of view EXIF can justify ─────────────────────────────────────────────────────────
     Returns null rather than a guess. The 35 mm equivalent is the only figure that needs no
     assumption about sensor size; a bare focal length needs one, and the focal-plane resolution
     tags supply it when the camera wrote them. ⚠ A CROPPED PHOTOGRAPH KEEPS ITS OLD EXIF, so what
     comes back is a hint with a band around it, never a fixed value — js/photo-geo-match.js still
     ladders, it just ladders over a shorter ladder. */
  function fieldOfView(ex, imageWidth, imageHeight) {
    if (!ex) return null;
    var wide = !imageWidth || !imageHeight || imageWidth >= imageHeight;
    if (ex.focalLength35mm > 0) {
      /* 35 mm frame is 36 x 24 mm; the LONG side of the frame maps to the long side of the picture */
      var side = wide ? 36 : 24;
      return {
        hfovDeg: 2 * Math.atan(side / 2 / ex.focalLength35mm) * 180 / Math.PI,
        from: 'FocalLengthIn35mmFilm', focalLength35mm: ex.focalLength35mm
      };
    }
    if (ex.focalLengthMm > 0 && ex.focalPlaneXRes > 0 && ex.pixelXDimension > 0) {
      /* unit 2 = inch (the common case), 3 = centimetre */
      var perUnit = ex.focalPlaneUnit === 3 ? 10 : 25.4;
      var sensorW = ex.pixelXDimension / ex.focalPlaneXRes * perUnit;
      if (sensorW > 1 && sensorW < 100) {
        return {
          hfovDeg: 2 * Math.atan(sensorW / 2 / ex.focalLengthMm) * 180 / Math.PI,
          from: 'FocalLength + FocalPlaneResolution', focalLengthMm: ex.focalLengthMm, sensorWidthMm: sensorW
        };
      }
    }
    return null;
  }

  /* Orientation as the transform the analysis canvas must apply. `swap` means the stored width and
     height are the wrong way round for the upright picture. */
  function orientationTransform(or) {
    switch (or | 0) {
      case 2: return { rotateDeg: 0, flipX: true, swap: false };
      case 3: return { rotateDeg: 180, flipX: false, swap: false };
      case 4: return { rotateDeg: 180, flipX: true, swap: false };
      case 5: return { rotateDeg: 90, flipX: true, swap: true };
      case 6: return { rotateDeg: 90, flipX: false, swap: true };
      case 7: return { rotateDeg: 270, flipX: true, swap: true };
      case 8: return { rotateDeg: 270, flipX: false, swap: true };
      default: return { rotateDeg: 0, flipX: false, swap: false };
    }
  }

  var API = { parse: parse, fieldOfView: fieldOfView, orientationTransform: orientationTransform };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoExif = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoExif = API;
})();
