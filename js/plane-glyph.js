/* ============================================================================
 *  IntMap · plane-glyph — the aircraft mark, stated once  (#R379)
 * ----------------------------------------------------------------------------
 *  「航空機レイヤーの飛行機アイコンのデザインをもとに戻して。」
 *
 *  WHAT THE MARK IS
 *  ----------------
 *  An airliner PLAN-FORM — fuselage, swept wings, tailplane — filled with the aircraft's colour and
 *  stroked with white. It is the outline this app shipped with, unchanged from the first commit
 *  through #R164. #R183 replaced it with something 「もっと目立つもの」, #R187 put it back when the
 *  verdict came in, and #R190–#R192 then spent three rounds proving that the flat glyph and the
 *  lifted 3-D body draw the SAME outline at the SAME size rather than two marks that were each
 *  described as "the original one".
 *
 *  #R341 rebuilt the layer around a GPU point cloud and, with it, replaced the mark with a DART: a
 *  notched triangle. That was not a design decision anybody asked for — it is what a signed
 *  distance field costs when you write it for three vertices instead of eighteen. This file is the
 *  eighteen.
 *
 *  WHY IT IS ITS OWN FILE
 *  ----------------------
 *  Two renderers draw this mark and neither can see the other's memory: js/aircraft-points.js
 *  evaluates it as an SDF inside a fragment shader, and js/cesium-engine.js bakes it into a sprite
 *  for a BillboardCollection. #R341 wrote the dart into both by TRANSCRIBING it, with nothing
 *  holding the two copies together — the shape of defect this project has now met ten times
 *  (#R345: 「繰り返す欠陥の直し方が1ファイルの中にあると、次の occurrence が来る」). One
 *  declaration, two readers, and a check that the third — the frozen `?aviation=v1` path in
 *  js/data-layers.js, which #R341 deliberately left byte-for-byte alone — still agrees with it.
 *
 *  ⚠ NOT EAGER. Both readers are lazy (js/aviation-live.js imports the first; js/engine-select.js
 *  dynamically imports the second), so this file costs a MapLibre session that never turns the
 *  layer on exactly zero bytes.
 * ==========================================================================*/
window.IntMapPlaneGlyph = (function () {
  'use strict';

  /* The outline, in the artwork's own units with +y DOWN — the axis a 2-D canvas context uses, so
     this array can be traced into a path with no transform beyond a translate. The nose is
     [0,-19]; the half-length 19 and the 44-unit box around it are what `icon-size` was multiplying
     when the symbol layer drew this. VERBATIM `_PLANE_ORIG` from js/data-layers.js. */
  const OUTLINE = [[0, -19], [2.2, -6], [2.2, -3], [17, 5], [17, 9], [2.2, 4.5], [2.2, 12], [6, 16], [6, 18], [0, 15.5],
                   [-6, 18], [-6, 16], [-2.2, 12], [-2.2, 4.5], [-17, 9], [-17, 5], [-2.2, -3], [-2.2, -6]];

  /* The artwork's box. HALF of it is the sprite's [-1,1] in both renderers, which is what makes
     "one sizePx" mean the same number of screen pixels on either engine. The mark reaches
     (19 + STROKE/2) / 22 = 0.923 of that box, and the remaining 7.7 % is the margin an
     anti-aliased edge and a texture atlas both need. */
  const CANVAS = 44;
  const HALF = CANVAS / 2;

  /* The white outline's WIDTH, straddling the path — half inside, half outside, because that is
     what `ctx.fill()` followed by `ctx.stroke()` paints. ⚠ 2.6 rather than the original 1.6: #R246
     asked for a thicker outline (「両方とも：より太いアウトライン」) and this is that number.
     The alpha is the original's too. */
  const STROKE = 2.6;
  const STROKE_ALPHA = 0.95;

  /* ── HOW BIG THE MARK IS ──────────────────────────────────────────────────────────────────────
     The symbol layer built `icon-size` from this table and the lifted 3-D body evaluated it for its
     metres of ground, which is #R192's answer to four rounds of the two renderings drifting apart:
     「同じマークは同じ画素数」. ⚠ It is not the original ramp untouched — #R247 asked for aircraft
     「少し大きく」 and multiplied every stop by 1.25, so the SHAPE of the growth is the original's
     and the scale is #R247's. VERBATIM `_PLANE_SIZE` from js/data-layers.js. */
  const SIZE = [[2, 0.5], [5, 0.725], [9, 0.975]];

  /** The artwork's box in CSS pixels at this zoom — `CANVAS × icon-size`, held flat outside the
      table's ends exactly as `['interpolate',['linear'],['zoom'], …]` holds it. This is the number
      a renderer that draws the mark as a SPRITE wants, because the sprite's [-1,1] is the box. */
  function boxPx(z) {
    const t = SIZE, zz = (+z || 0);
    if (zz <= t[0][0]) return CANVAS * t[0][1];
    for (let i = 1; i < t.length; i++) {
      if (zz <= t[i][0]) {
        const a = t[i - 1], b = t[i];
        return CANVAS * (a[1] + (b[1] - a[1]) * (zz - a[0]) / (b[0] - a[0]));
      }
    }
    return CANVAS * t[t.length - 1][1];
  }

  /** Trace the outline into a 2-D path. `scale` is image pixels per artwork unit; the caller has
      already translated the context to the glyph's centre. Nothing is filled or stroked here — the
      two sprites Cesium needs differ only in what they do with the same path. */
  function path(ctx, scale) {
    const k = (scale == null) ? 1 : scale;
    ctx.beginPath();
    for (let i = 0; i < OUTLINE.length; i++) {
      const x = OUTLINE[i][0] * k, y = OUTLINE[i][1] * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  /** The same eighteen vertices as a GLSL ES 3.00 const array, in SPRITE space: divided by the
      box's half and flipped in y, because `gl_PointCoord` is made +y-up by the fragment shader so
      that a track of 0 rad points north. Generated rather than typed, so the shader cannot drift
      from the canvas by a decimal point. */
  function glsl(name) {
    const v = OUTLINE.map((p) => 'vec2(' + (p[0] / HALF).toFixed(7) + ',' + (-p[1] / HALF).toFixed(7) + ')');
    return 'const vec2 ' + name + '[' + OUTLINE.length + '] = vec2[' + OUTLINE.length + '](\n  ' +
      v.join(',\n  ') + ');';
  }

  return {
    OUTLINE, CANVAS, HALF, STROKE, STROKE_ALPHA, SIZE, boxPx,
    /* half the stroke, in sprite units — the distance either side of the outline the white band
       reaches, which is the one number the SDF needs beyond the vertices */
    SDF_HALF_STROKE: (STROKE / 2) / HALF,
    path, glsl,
  };
})();
