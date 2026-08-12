/* ============================================================================
 *  IntMap · Ocean currents — THE FIELD FILE, decoded and strided   (#R222)
 * ----------------------------------------------------------------------------
 *  「海流レイヤーのquality, coverageを増強して」（確認済：本数増＋格子0.5°＋季節（月別））
 *
 *  ══ WHY THE FIELD STOPPED BEING A LIST OF ARROWS ═══════════════════════════════════════════════
 *  #R219–#R221 shipped it as `arrows` in the JSON — [lng, lat, bearing, speed] per cell, thinned at
 *  BUILD time to 1° because 0.25° would have been 700,000 rows of text. Two things were wrong with
 *  that and both are about who decides the spacing:
 *
 *    · the spacing was decided in a script, months ago, for every zoom at once. At z2 one arrow per
 *      degree is far denser than the eye can use (the renderer threw most of them away by collision);
 *      at z8 it is four arrows on the screen.
 *    · 28,208 point features is 28,208 point features whether or not any of them is on screen, and
 *      on a phone that is a real cost paid at the moment the layer is switched on.
 *
 *  A REGULAR GRID has neither problem. data/ocean-currents-field.bin.gz is the source's own 0.25°
 *  grid — 1,440 × 720 cells, one byte of speed and one byte of bearing each, gzipped to ~870 kB for
 *  466,007 cells with flow. Sixteen times the cells of the old file, in about the same bytes, and
 *  the CLIENT chooses the stride: 1 = 0.25°, 2 = 0.5°, 4 = 1°, 8 = 2°, … over the same array.
 *  `arrows()` below then emits only the cells inside the view, at the coarsest stride that still
 *  fills it — so the number of features handed to the renderer is roughly CONSTANT at every zoom,
 *  and it is SMALLER than #R221's at all of them.
 *
 *  ══ AND THE TWELVE MONTHS ══════════════════════════════════════════════════════════════════════
 *  data/ocean-currents-months.bin.gz is the same format with twelve planes at 0.5° — one calendar
 *  month each, six years of that month averaged. It is ~3 MB and it is NOT fetched unless the reader
 *  asks for a month: the climatological mean is what the layer opens with, exactly as before.
 *
 *  ⚠ ONE BYTE OF SPEED IS NOT LINEAR. A linear byte over 0–2.5 m/s quantises at 1 cm/s everywhere,
 *  which is coarse exactly where the field is interesting (the 3–10 cm/s eastern boundary currents).
 *  The build stores √(speed) and this file squares it back, so the resolution is 0.05 cm/s at the
 *  low end and 2 cm/s at the Gulf Stream's core.
 *  ⚠ SPEED 0 MEANS "NOTHING TO DRAW" — land, ice, or below the 3 cm/s floor — and never "calm sea
 *  we have no data for", which is why a zero cell is skipped rather than drawn as a still arrow.
 * ==========================================================================*/
window.IntMapCurrentField = (function () {
  'use strict';

  const MAGIC = 0x434f4d49;   /* 'IMOC' little-endian */

  /* ── the wire format ──────────────────────────────────────────────────────────────────────── */
  function parse(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== MAGIC) throw new Error('not an IMOC field');
    const version = dv.getUint8(4), planes = dv.getUint8(5);
    const nx = dv.getUint16(6, true), ny = dv.getUint16(8, true);
    const grid = dv.getUint16(10, true) / 1000, spMax = dv.getUint16(12, true) / 1000;
    if (version !== 1) throw new Error('IMOC version ' + version);
    const cells = nx * ny;
    const need = 16 + planes * cells * 2;
    if (buf.byteLength < need) throw new Error('short field file');
    const out = [];
    for (let p = 0; p < planes; p++) {
      const o = 16 + p * cells * 2;
      out.push({ sp: new Uint8Array(buf, o, cells), br: new Uint8Array(buf, o + cells, cells) });
    }
    return { version, planes: out, nx, ny, grid, spMax, cells };
  }

  /* ⚠ THE FILE IS GZIPPED BY US, NOT BY THE SERVER (the same construction js/gazetteer.js uses for
     the world gazetteer). Serving it with Content-Encoding would mean the origin has to be
     configured for it, and GitHub Pages does not compress application/octet-stream — so the bytes
     on the wire would be the raw 2 MB. `DecompressionStream` is in every browser that can run this
     app's renderer. A browser without it gets the named currents and no field, which is the same
     "degrade, do not break" the rest of the layer follows. */
  function fetchField(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('http ' + r.status);
      if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }).then(parse);
  }

  /* ── the stride ───────────────────────────────────────────────────────────────────────────────
     The coarsest spacing that still puts at most `cap` marks in the view. It is a CAP and not a
     zoom table because the two do not agree on a globe: the same zoom shows a hemisphere at one
     pitch and a bay at another, and what the eye can use is a number of arrows, not a spacing. */
  const STRIDES = [1, 2, 4, 8, 16, 32, 64];
  function strideFor(field, box, cap) {
    const spanX = Math.min(360, Math.max(0.001, box.e - box.w));
    const spanY = Math.min(180, Math.max(0.001, box.n - box.s));
    for (let i = 0; i < STRIDES.length; i++) {
      const st = STRIDES[i];
      const nxc = Math.ceil(spanX / (field.grid * st)), nyc = Math.ceil(spanY / (field.grid * st));
      if (nxc * nyc <= cap) return st;
    }
    return STRIDES[STRIDES.length - 1];
  }

  /* ── the marks ────────────────────────────────────────────────────────────────────────────────
     ⚠ A STRIDED CELL IS THE MEAN OF ITS BLOCK, not one sample of it. Taking every fourth cell of a
     0.25° field is a claim about the other fifteen, and in a boundary current the sample that
     happens to be picked can be four times the block's real speed. The mean is taken as a VECTOR
     (u, v), because averaging bearings as numbers turns 350° and 10° into 180°. */
  function arrows(field, planeIdx, box, cap) {
    const P = field.planes[planeIdx] || field.planes[0];
    if (!P) return { features: [], stride: 0, grid: field.grid };
    const st = strideFor(field, box, cap || 6000);
    const g = field.grid, nx = field.nx, ny = field.ny, spMax = field.spMax;
    const y0 = Math.max(0, Math.floor((box.s + 90) / g)), y1 = Math.min(ny - 1, Math.ceil((box.n + 90) / g));
    const x0 = Math.floor((box.w + 180) / g), x1 = Math.ceil((box.e + 180) / g);
    const feats = [];
    const RAD = Math.PI / 180;
    for (let y = y0 - (y0 % st); y <= y1; y += st) {
      if (y < 0 || y >= ny) continue;
      for (let xx = x0 - ((x0 % st) + st) % st; xx <= x1; xx += st) {
        let u = 0, v = 0, n = 0;
        for (let dy = 0; dy < st; dy++) {
          const yy = y + dy; if (yy >= ny) break;
          for (let dx = 0; dx < st; dx++) {
            const x = ((xx + dx) % nx + nx) % nx;
            const k = yy * nx + x;
            const q = P.sp[k]; if (!q) continue;
            const sp = spMax * (q / 255) * (q / 255);
            const b = (P.br[k] / 255) * 360 * RAD;
            u += Math.sin(b) * sp; v += Math.cos(b) * sp; n++;
          }
        }
        if (!n) continue;
        u /= n; v /= n;
        const sp = Math.hypot(u, v);
        if (sp < 0.03) continue;
        const lat = -90 + (y + st / 2) * g;
        if (lat < -80 || lat > 82) continue;
        let lng = -180 + (xx + st / 2) * g;
        lng = ((lng + 180) % 360 + 360) % 360 - 180;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [+lng.toFixed(3), +lat.toFixed(3)] },
          properties: { b: +(Math.atan2(u, v) * 180 / Math.PI).toFixed(1), s: +sp.toFixed(3) } });
      }
    }
    return { features: feats, stride: st, grid: g * st };
  }

  /* one cell, for a readout — the same decode, without building a feature */
  function at(field, planeIdx, lng, lat) {
    const P = field.planes[planeIdx] || field.planes[0]; if (!P) return null;
    const g = field.grid, nx = field.nx, ny = field.ny;
    const y = Math.floor((lat + 90) / g), x = Math.floor((((lng + 180) % 360 + 360) % 360) / g);
    if (y < 0 || y >= ny) return null;
    const k = y * nx + (x % nx);
    const q = P.sp[k]; if (!q) return null;
    return { speed: field.spMax * (q / 255) * (q / 255), bearing: (P.br[k] / 255) * 360 };
  }

  return { parse, fetchField, arrows, strideFor, at, MAGIC };
})();
