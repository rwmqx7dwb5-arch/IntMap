/* ============================================================================
 *  IntMap · GLYPH OUTLINES FROM THE READER'S OWN FONT   (js/file-glyph.js)
 * ----------------------------------------------------------------------------
 *  A browser will not hand over a system font's outlines, and the repository carries no CJK font (licence, size),
 *  so the PDF writer (js/file-pdf.js) gets its glyphs from here: the character is drawn once, large, on a canvas
 *  with whatever font the reader's device has, and its OUTLINE is read back off the antialiased coverage —
 *      marching squares at the 0.5 level, edge crossings placed by linear interpolation (sub-pixel),
 *      Douglas-Peucker to drop the points a straight run does not need,
 *  in 1000 units per em, y up — the unit a PDF Type3 glyph procedure wants.
 *
 *  traceGlyph is pure (alpha field in, contours out) so node tests it on a synthetic disc; canvasGlyphOf is the
 *  only part that touches the DOM. Same hook shape as the writer asks for: glyphOf(ch, style) → { adv, path }.
 *  ⚠ The outline is as good as the 192 px trace: ≈ 0.2 px of 192 (≈ 1 unit of 1000) — an 800 % zoom of 10 pt text
 *  still shows a round stroke. It is the reader's font, so what the reader's device could draw is what is kept.
 * ==========================================================================*/

const EM = 1000;
const TRACE_PX = 192;      /* the size a character is drawn at to read its outline: 1 px = 5.2 units */
const TOL = 1.0;                  /* Douglas-Peucker tolerance in units (1000 per em) = 0.19 trace-px. Measured 2026-11-21 against the font's own raster at a 400 px em (≈ 30× zoom of 10.5 pt text): mean IoU 0.98-0.99; 0.7 added 30 % to the file for no visible gain */

/**
 * a: Uint8 coverage (0..255) w×h → closed contours in pixel coordinates [[x,y],…]. The 0.5 level, interpolated.
 * Contours of holes and of outer edges both come out; the writer fills them even-odd, so orientation is free.
 */
export function marchingSquares(a, w, h, level = 127.5) {
  const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x]);
  /* a crossing sits on a grid edge; key it so the two cells sharing the edge meet at one point */
  const keyH = (x, y) => 2 * (y * (w + 1) + x), keyV = (x, y) => 2 * (y * (w + 1) + x) + 1;
  const pts = new Map(), adj = new Map();
  const cross = (k, x0, y0, x1, y1) => {
    if (pts.has(k)) return k;
    const p = v(x0, y0), q = v(x1, y1), t = (level - p) / (q - p);
    pts.set(k, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); return k;
  };
  const link = (p, q) => { (adj.get(p) || adj.set(p, []).get(p)).push(q); (adj.get(q) || adj.set(q, []).get(q)).push(p); };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const a0 = v(x, y), a1 = v(x + 1, y), a2 = v(x + 1, y + 1), a3 = v(x, y + 1);
    const c = (a0 > level ? 1 : 0) | (a1 > level ? 2 : 0) | (a2 > level ? 4 : 0) | (a3 > level ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const top = () => cross(keyH(x, y), x, y, x + 1, y), bot = () => cross(keyH(x, y + 1), x, y + 1, x + 1, y + 1);
    const lef = () => cross(keyV(x, y), x, y, x, y + 1), rig = () => cross(keyV(x + 1, y), x + 1, y, x + 1, y + 1);
    switch (c) {
      case 1: case 14: link(top(), lef()); break;
      case 2: case 13: link(top(), rig()); break;
      case 4: case 11: link(rig(), bot()); break;
      case 8: case 7: link(bot(), lef()); break;
      case 3: case 12: link(lef(), rig()); break;
      case 6: case 9: link(top(), bot()); break;
      case 5: case 10: {                              /* a saddle: the cell's mean says whether the inked corners join */
        const inked = (a0 + a1 + a2 + a3) / 4 > level;
        if ((c === 5) === inked) { link(top(), rig()); link(bot(), lef()); } else { link(top(), lef()); link(bot(), rig()); }
        break;
      }
      default: break;
    }
  }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); loop.push(pts.get(cur));
      const n = adj.get(cur), next = n[0] !== prev && !seen.has(n[0]) ? n[0] : n[1];
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function dp(p, tol) {                    /* Douglas-Peucker on a closed loop: split at the two farthest points, simplify both halves */
  const n = p.length; if (n <= 4) return p;
  let a = 0, b = 0, best = -1;
  for (let i = 1; i < n; i++) { const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  const half = (s, e) => {               /* open run p[s..e] (indices, e may wrap) */
    const run = []; for (let i = s; ; i = (i + 1) % n) { run.push(p[i]); if (i === e) break; }
    const keep = new Uint8Array(run.length); keep[0] = keep[run.length - 1] = 1;
    const stack = [[0, run.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop(); if (j <= i + 1) continue;
      const [x1, y1] = run[i], [x2, y2] = run[j], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      let md = -1, mk = -1;
      for (let k = i + 1; k < j; k++) { const d = Math.abs(dy * (run[k][0] - x1) - dx * (run[k][1] - y1)) / L; if (d > md) { md = d; mk = k; } }
      if (md > tol) { keep[mk] = 1; stack.push([i, mk], [mk, j]); }
    }
    return run.filter((_, i) => keep[i]);
  };
  const r1 = half(a, b), r2 = half(b, a);
  return r1.concat(r2.slice(1, -1));
}

/** coverage field → { path:[[ [x,y],… ],…] } in 1000 units, y up, origin at (originX, baselineY) of the field */
export function traceGlyph(alpha, w, h, originX, baselineY, px = TRACE_PX) {
  const k = EM / px, out = [];
  for (const loop of marchingSquares(alpha, w, h)) {
    const sim = dp(loop.map(([x, y]) => [(x + 0.5) * k, (y + 0.5) * k]), TOL);   /* sample (x, y) is the CENTRE of pixel (x, y): +0.5 puts it on the canvas grid the origin is measured in */
    if (sim.length < 3) continue;
    out.push(sim.map(([x, y]) => [Math.round(x - originX * k), Math.round(baselineY * k - y)]));
  }
  return out;
}

/** the browser's glyphOf(ch, style): the reader's own font → outline. `fonts` = { n, b, m } CSS font-family strings. */
export function canvasGlyphOf(fonts, doc = document) {
  const cache = new Map(), PAD = Math.round(TRACE_PX * 0.5), HT = Math.round(TRACE_PX * 2.2), BASE = Math.round(TRACE_PX * 1.45);
  const cv = doc.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
  return (ch, style) => {
    const key = style + ch; if (cache.has(key)) return cache.get(key);
    const font = (style === 'b' ? '700 ' : '400 ') + TRACE_PX + 'px ' + (style === 'm' ? fonts.m : fonts.n);
    x.font = font;
    const adv = x.measureText(ch).width / TRACE_PX * EM;
    const W = Math.ceil(x.measureText(ch).width) + PAD * 2;
    let g;
    if (!/\S/.test(ch)) g = { adv, path: [] };
    else {
      if (cv.width !== W || cv.height !== HT) { cv.width = W; cv.height = HT; x.font = font; }
      x.clearRect(0, 0, W, HT); x.fillStyle = '#000'; x.textBaseline = 'alphabetic'; x.font = font; x.fillText(ch, PAD, BASE);
      const d = x.getImageData(0, 0, W, HT).data, al = new Uint8Array(W * HT);
      for (let i = 0; i < al.length; i++) al[i] = d[i * 4 + 3];
      g = { adv, path: traceGlyph(al, W, HT, PAD, BASE) };
    }
    cache.set(key, g); return g;
  };
}
