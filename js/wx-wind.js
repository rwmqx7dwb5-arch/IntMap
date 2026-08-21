/* ============================================================================
 *  IntMap · the animated wind renderer — window.IntMapWindGL   (#R276)
 * ----------------------------------------------------------------------------
 *  「粒子をWebGLまたは十分にバッチ化した描画へ変更し、移動量・寿命・残像を実経過時間基準にする。
 *    高リフレッシュレートでも速度が変化しないようにする。」
 *
 *  ── WHAT WAS WRONG, MEASURED ─────────────────────────────────────────────────────────────────
 *  The old loop did `beginPath(); moveTo(); lineTo(); stroke()` PER PARTICLE — up to 7,000 stroke
 *  calls per frame, each one a full Canvas2D state flush — and every quantity in it was counted in
 *  FRAMES rather than seconds:
 *      p.age++            → a particle lived 60–130 frames, so 2.2 s on a 60 Hz screen and 0.9 s on
 *                           a 144 Hz one;
 *      dt = 0.05*mPerPx   → displacement per FRAME, so the wind blew 2.4× faster on a 144 Hz screen;
 *      fillRect(α=0.08)   → the trail decayed per FRAME, so the streaks were 2.4× shorter there too.
 *  A 144 Hz laptop and a 60 Hz desktop were therefore showing different weather.
 *
 *  ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────
 *  · ONE draw call per frame. Every live segment is written into a single interleaved vertex buffer
 *    (two triangles per segment, so line width is real rather than the 1 px every browser clamps
 *    gl.lineWidth to) and drawn once.
 *  · The trail is a texture, not a fill. Two RGBA framebuffers ping-pong: the previous frame is
 *    re-drawn into the next one at `exp(-dt/τ)`, the new segments are drawn on top, and the result
 *    is blitted to the canvas. τ is in SECONDS, so the streak length is the same at 60 and 144 Hz.
 *  · Everything is per-SECOND: displacement is `gain · speed · dt` screen pixels, lifetime is a
 *    duration in seconds, the fade is a time constant. `dt` is clamped so a tab that was in the
 *    background for a minute resumes instead of teleporting every particle across the world.
 *  · There is a Canvas2D fallback for a browser with no WebGL, and it is BATCHED: segments are
 *    bucketed by width/alpha and each bucket is one path with one stroke — a few stroke calls per
 *    frame instead of thousands.
 *
 *  The renderer owns the particles; it does NOT own the data or the map. The caller supplies a
 *  field sampler (lat,lng → u,v in m/s), a projector and the view, which is what lets the same
 *  renderer sit over MapLibre's flat and globe projections.
 * ==========================================================================*/
(function () {
  'use strict';

  var R = Math.PI / 180;
  /* screen pixels per second per (m/s). 3.0 reproduces the pace the Canvas2D version had at 60 Hz
     (it moved 0.05 px per frame per m/s), so the picture people are used to does not change speed
     just because the clock became honest. */
  var GAIN = 3.0;
  var TRAIL_TAU = 0.75;      /* seconds — the streak's e-folding time */
  var LIFE_MIN = 1.2, LIFE_SPAN = 2.4;   /* seconds */
  var DT_MAX = 1 / 15;       /* never integrate more than one 15-fps step at once */

  function supported() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (_) { return false; }
  }

  var VS_LINE = [
    'attribute vec2 a_pos;',
    'attribute float a_alpha;',
    'uniform vec2 u_res;',
    'varying float v_alpha;',
    'void main(){',
    '  vec2 c = (a_pos / u_res) * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);',
    '  v_alpha = a_alpha;',
    '}'
  ].join('\n');
  var FS_LINE = [
    'precision mediump float;',
    'varying float v_alpha;',
    'uniform vec3 u_color;',
    'void main(){ gl_FragColor = vec4(u_color * v_alpha, v_alpha); }'
  ].join('\n');
  var VS_QUAD = [
    'attribute vec2 a_xy;',
    'varying vec2 v_uv;',
    'void main(){ v_uv = a_xy * 0.5 + 0.5; gl_Position = vec4(a_xy, 0.0, 1.0); }'
  ].join('\n');
  var FS_QUAD = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform float u_opacity;',
    'void main(){ gl_FragColor = texture2D(u_tex, v_uv) * u_opacity; }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }
  function program(gl, vs, fs) {
    var v = compile(gl, gl.VERTEX_SHADER, vs), f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
    return p;
  }

  function create(canvas, opts) {
    opts = opts || {};
    var project = opts.project || function () { return null; };
    var randomLL = opts.randomLL || function () { return null; };
    var visible = opts.visible || function () { return true; };
    var zoom = opts.zoom || function () { return 2; };
    var color = opts.color || [1, 1, 1];

    var gl = null, ok = false;
    var progLine = null, progQuad = null, vbo = null, quadVbo = null;
    /* ⚠ (#R298) THE LOCATIONS ARE LOOKED UP ONCE. `getAttribLocation` / `getUniformLocation` are
       synchronous queries into the driver's copy of the linked program, and both draw paths were
       asking for all six of them EVERY FRAME (three per `drawQuad`, and `drawQuad` runs twice a
       frame). A program's locations cannot change after it is linked, so this is pure overhead —
       and it changes not one pixel to hoist it. */
    var locLine = null, locQuad = null;
    var vboFloats = 0;         /* what `vbo` is currently sized for — see the note in drawGL */
    var tex = [null, null], fbo = [null, null], cur = 0;
    var ctx2d = null;

    var W = 1, H = 1, dpr = 1;
    var parts = [];
    var target = 0;
    var field = null;
    var last = 0, running = false, cleared = true;
    var verts = null, vcount = 0;
    var uv = [0, 0];
    var frameMs = 0, frames = 0, accMs = 0;

    function initGL() {
      try {
        gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true })
          || canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
      } catch (_) { gl = null; }
      if (!gl) return false;
      progLine = program(gl, VS_LINE, FS_LINE);
      progQuad = program(gl, VS_QUAD, FS_QUAD);
      if (!progLine || !progQuad) { gl = null; return false; }
      locLine = {
        pos: gl.getAttribLocation(progLine, 'a_pos'), alpha: gl.getAttribLocation(progLine, 'a_alpha'),
        res: gl.getUniformLocation(progLine, 'u_res'), color: gl.getUniformLocation(progLine, 'u_color')
      };
      locQuad = {
        xy: gl.getAttribLocation(progQuad, 'a_xy'),
        tex: gl.getUniformLocation(progQuad, 'u_tex'), opacity: gl.getUniformLocation(progQuad, 'u_opacity')
      };
      vbo = gl.createBuffer();
      vboFloats = 0;
      quadVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   /* premultiplied */
      return true;
    }
    function makeTargets() {
      if (!gl) return;
      for (var i = 0; i < 2; i++) {
        if (tex[i]) gl.deleteTexture(tex[i]);
        if (fbo[i]) gl.deleteFramebuffer(fbo[i]);
        tex[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        fbo[i] = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[i], 0);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    ok = initGL();
    if (!ok) { try { ctx2d = canvas.getContext('2d'); } catch (_) { ctx2d = null; } }

    /* ══ ⚠⚠⚠ (#R290) THE FLASH WAS A RESIZE THAT RESIZED NOTHING ══════════════════════════════
       「点滅してしまうバグが発生する。」 js/weather.js calls `resize()` from the map's `moveend`, i.e.
       at the end of EVERY pan and EVERY zoom — and this ran unconditionally. Assigning
       `canvas.width` clears a canvas **even when the value is identical**, `makeTargets()` deletes
       and re-creates both trail framebuffers, and `cleared = true` throws away the streaks. So the
       whole animation was wiped and rebuilt from nothing every time the reader let go of the map:
       one blank frame followed by three-quarters of a second of the trail growing back. That is
       the blink, and the window was never a different size.
       → a resize to the size it already is returns immediately. A real size change still does the
       full rebuild, because then the buffers genuinely have the wrong dimensions. */
    function resize(w, h, ratio) {
      var nw = Math.max(1, w | 0), nh = Math.max(1, h | 0), nd = ratio || 1;
      if (nw === W && nh === H && nd === dpr && canvas.width === Math.round(nw * nd)) return;
      W = nw; H = nh; dpr = nd;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      if (gl) { gl.viewport(0, 0, canvas.width, canvas.height); makeTargets(); }
      else if (ctx2d) { ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); }
      ensure();
      cleared = true;
    }

    /* Density is a per-area figure so a phone and a 1080p desktop show the same picture, not the
       same number of particles. The cap is what the frame-time governor below moves. */
    function ensure() {
      var area = W * H;
      var base = Math.floor(area / (opts.perPixels || 320));
      target = Math.max(600, Math.min(opts.maxParts || 6000, base));
      if (parts.length > target) parts.length = target;
      while (parts.length < target) parts.push(spawn({}));
      return target;
    }
    function spawn(p) {
      var ll = randomLL();
      if (!ll) { p.lng = null; p.age = 0; p.life = LIFE_MIN; return p; }
      p.lng = ll[0]; p.lat = ll[1];
      p.age = Math.random() * LIFE_MIN;
      p.life = LIFE_MIN + Math.random() * LIFE_SPAN;
      p.sx = null; p.sy = null;
      return p;
    }

    function setField(f) { field = f || null; }
    function clearTrails() { cleared = true; }

    function drawQuad(texture, opacity, toFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, toFbo);
      gl.useProgram(progQuad);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.enableVertexAttribArray(locQuad.xy);
      gl.vertexAttribPointer(locQuad.xy, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(locQuad.tex, 0);
      gl.uniform1f(locQuad.opacity, opacity);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /* ── one frame ────────────────────────────────────────────────────────────────────────────
       `nowMs` is the rAF timestamp; every quantity below is derived from the REAL interval since
       the previous frame, which is the whole point of this rewrite. */
    function tick(nowMs, moving) {
      if (!field) { last = nowMs; return 0; }
      var dt = last ? Math.min(DT_MAX, Math.max(0, (nowMs - last) / 1000)) : 1 / 60;
      last = nowMs;
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

      var z = zoom();
      var scale = Math.pow(2, z);
      var n = parts.length;
      if (!verts || verts.length < n * 18) verts = new Float32Array(Math.max(600, n) * 18);
      vcount = 0;
      var vi = 0;

      for (var i = 0; i < n; i++) {
        var p = parts[i];
        if (p.lng == null) { spawn(p); continue; }
        if (!visible(p.lng, p.lat)) { p.age += dt; if (p.age > p.life) spawn(p); continue; }
        field.uv(p.lat, p.lng, uv);
        var u = uv[0], v = uv[1];
        if (!(u === u) || !(v === v)) { spawn(p); continue; }
        /* the START point is the END point of the previous frame — one projection per particle per
           frame instead of two. MEASURED: map.project costs 5.8 ms per 12,000 calls, so halving the
           count is 2.9 ms of a 16.7 ms budget.
           ⚠ (#R298) `!moving` STAYS, and the second projection while the map moves is not waste.
           `p.sx` is a SCREEN position, and while the camera is moving it is a screen position under
           the PREVIOUS camera — so reusing it would draw every segment from where the particle was
           on the old screen to where it is on the new one, i.e. the camera's own displacement added
           to every particle. A pan would streak the whole field in the direction of the drag (the
           `len > 90` respawn only catches the fast ones), which is a broken picture rather than a
           cheaper one. The saving is real only while the camera is still, which is when it is
           already taken. */
        var s0 = (p.sx != null && !moving) ? { x: p.sx, y: p.sy } : project(p.lng, p.lat);
        if (!s0) { p.age += dt; if (p.age > p.life) spawn(p); continue; }
        var cosLat = Math.max(0.15, Math.cos(p.lat * R));
        var mPerPx = 156543.03392 * cosLat / scale;
        var metres = GAIN * dt * mPerPx;
        p.lng += (u * metres) / (111320 * cosLat);
        p.lat += (v * metres) / 110540;
        if (p.lng > 180) p.lng -= 360; else if (p.lng < -180) p.lng += 360;
        if (p.lat > 89.5 || p.lat < -89.5) { spawn(p); continue; }
        var s1 = project(p.lng, p.lat);
        if (!s1) { spawn(p); continue; }
        p.sx = s1.x; p.sy = s1.y;
        p.age += dt;
        if (p.age > p.life) { spawn(p); continue; }
        if (s0.x < -60 && s1.x < -60) continue;
        if (s0.x > W + 60 && s1.x > W + 60) continue;
        if (s0.y < -60 && s1.y < -60) continue;
        if (s0.y > H + 60 && s1.y > H + 60) continue;
        var dx = s1.x - s0.x, dy = s1.y - s0.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len > 90) { spawn(p); continue; }        /* a jump means the camera moved under us */
        var sp = Math.sqrt(u * u + v * v);
        /* fade in and out so a respawn is not a flash: a triangular envelope over the lifetime */
        var f = p.age / p.life;
        var env = f < 0.15 ? (f / 0.15) : (f > 0.75 ? (1 - (f - 0.75) / 0.25) : 1);
        /* ⚠ (#R298) 「パーティクルの不透明度を少しさげて。」 — the floor and the ceiling both come
           down (0.50 → 0.34 in still air, 0.95 → 0.68 in a jet) and the SPREAD stays: a fast
           particle is still visibly denser than a slow one, which is what the alpha is FOR. The
           divisor moves with the range, so a given speed sits at nearly the same fraction of it as
           before (7 m/s: 0.74 of the ceiling then, 0.75 now; saturation 15.3 → 14.3 m/s). */
        var a = (0.34 + Math.min(0.34, sp / 42)) * env;
        var wdt = (0.75 + Math.min(0.95, sp / 26)) * dpr;
        if (len < 0.35) { dx = 0.35; dy = 0; len = 0.35; }
        var nx = -dy / len * wdt * 0.5, ny = dx / len * wdt * 0.5;
        var x0 = s0.x * dpr, y0 = s0.y * dpr, x1 = s1.x * dpr, y1 = s1.y * dpr;
        nx *= 1; ny *= 1;
        /* two triangles: (0-,0+,1-) (1-,0+,1+) */
        verts[vi++] = x0 - nx; verts[vi++] = y0 - ny; verts[vi++] = a;
        verts[vi++] = x0 + nx; verts[vi++] = y0 + ny; verts[vi++] = a;
        verts[vi++] = x1 - nx; verts[vi++] = y1 - ny; verts[vi++] = a;
        verts[vi++] = x1 - nx; verts[vi++] = y1 - ny; verts[vi++] = a;
        verts[vi++] = x0 + nx; verts[vi++] = y0 + ny; verts[vi++] = a;
        verts[vi++] = x1 + nx; verts[vi++] = y1 + ny; verts[vi++] = a;
        vcount += 6;
      }

      if (gl) drawGL(dt, moving);
      else draw2D(dt, moving);

      var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      accMs += (t1 - t0); frames++;
      if (frames >= 30) { frameMs = accMs / frames; frames = 0; accMs = 0; govern(); }
      return vcount / 6;
    }

    /* The particle budget follows the MEASURED cost of drawing it. A machine that cannot hold the
       frame gets fewer particles rather than a slideshow, and one that has room gets them back.
       ⚠ (#R290) …WITH HYSTERESIS. The thresholds were 9 ms to shrink and 4.5 ms to grow, decided
       every 30 frames from a 30-frame mean — so a machine whose frame cost sits near either of
       them cut 18 % of its particles, measured under budget on the next window, put 12 % back, and
       oscillated for ever. A density that pulses twice a second is 「点滅」 too, from the other
       side. A change now needs the SAME verdict twice in a row, the dead band is wider, and the
       steps are smaller — so the governor still reacts to a machine that genuinely cannot hold the
       frame, and stops reacting to noise. */
    var _verdict = 0;
    function govern() {
      var want = (frameMs > 11) ? -1 : (frameMs < 5.5 && parts.length < target) ? 1 : 0;
      if (want === 0 || want !== _verdict) { _verdict = want; return; }
      if (want < 0 && parts.length > 900) parts.length = Math.floor(parts.length * 0.90);
      else if (want > 0) {
        var add = Math.min(target - parts.length, Math.ceil(target * 0.08));
        for (var i = 0; i < add; i++) parts.push(spawn({}));
      }
    }

    function drawGL(dt, moving) {
      if (!gl || !tex[0]) return;
      var keep = moving ? 0 : Math.exp(-dt / TRAIL_TAU);
      var next = 1 - cur;
      gl.viewport(0, 0, canvas.width, canvas.height);
      /* 1. previous trail → next target, dimmed by the real elapsed time */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!cleared && keep > 0.003) drawQuad(tex[cur], keep, fbo[next]);
      cleared = false;
      /* 2. this frame's segments on top — ONE draw call */
      if (vcount) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]);
        gl.useProgram(progLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        /* ⚠ (#R298) THE BUFFER IS ALLOCATED ONCE AND WRITTEN INTO. `bufferData` with a view asks
           the driver to throw the old store away and make a new one of that size EVERY FRAME —
           the segment count barely changes between two frames, so the allocation is the waste, not
           the upload. `bufferSubData` writes into the store that is already there; a re-allocation
           happens only when the frame genuinely needs more room than the last one did. */
        var need = vcount * 3;
        if (need > vboFloats) { vboFloats = Math.max(600 * 18, need); gl.bufferData(gl.ARRAY_BUFFER, vboFloats * 4, gl.DYNAMIC_DRAW); }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, need));
        gl.enableVertexAttribArray(locLine.pos); gl.vertexAttribPointer(locLine.pos, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(locLine.alpha); gl.vertexAttribPointer(locLine.alpha, 1, gl.FLOAT, false, 12, 8);
        gl.uniform2f(locLine.res, canvas.width, canvas.height);
        gl.uniform3f(locLine.color, color[0], color[1], color[2]);
        gl.drawArrays(gl.TRIANGLES, 0, vcount);
      }
      /* 3. blit to the visible canvas */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      drawQuad(tex[next], 1, null);
      cur = next;
    }

    /* Canvas2D fallback — BATCHED. Segments are bucketed by rendered width and each bucket is one
       path with one stroke, so a frame costs a handful of stroke() calls rather than thousands. */
    var BUCKETS = 5;
    function draw2D(dt, moving) {
      if (!ctx2d) return;
      var c = ctx2d;
      if (moving || cleared) { c.clearRect(0, 0, W, H); cleared = false; }
      else {
        var gone = 1 - Math.exp(-dt / TRAIL_TAU);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = 'rgba(0,0,0,' + gone.toFixed(3) + ')';
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
      }
      c.lineCap = 'round';
      var col = 'rgb(' + Math.round(color[0] * 255) + ',' + Math.round(color[1] * 255) + ',' + Math.round(color[2] * 255) + ')';
      for (var b = 0; b < BUCKETS; b++) {
        var wdt = 0.8 + b * 0.35;
        c.beginPath();
        var any = false;
        for (var k = 0; k < vcount; k += 6) {
          var o = k * 3;
          var a = verts[o + 2];
          /* (#R298) …over the alpha CEILING the loop above writes, which came down with it. Left at
             0.95 the top bucket would be unreachable and every streak would be drawn thinner. */
          var bucket = Math.min(BUCKETS - 1, Math.floor(a * BUCKETS / 0.68));
          if (bucket !== b) continue;
          c.moveTo((verts[o] + verts[o + 3]) / 2 / dpr, (verts[o + 1] + verts[o + 4]) / 2 / dpr);
          c.lineTo((verts[o + 6] + verts[o + 15]) / 2 / dpr, (verts[o + 7] + verts[o + 16]) / 2 / dpr);
          any = true;
        }
        if (!any) continue;
        c.lineWidth = wdt;
        c.strokeStyle = col;
        /* (#R298) the same 0.72 the WebGL alpha came down by, so the two renderers still draw the
           same picture — a reader with no WebGL must not get a denser field than one with it. */
        c.globalAlpha = Math.min(0.68, 0.144 + b * 0.137);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    function dispose() {
      running = false;
      if (gl) {
        try {
          for (var i = 0; i < 2; i++) { if (tex[i]) gl.deleteTexture(tex[i]); if (fbo[i]) gl.deleteFramebuffer(fbo[i]); }
          if (vbo) gl.deleteBuffer(vbo); if (quadVbo) gl.deleteBuffer(quadVbo);
          vboFloats = 0;
          if (progLine) gl.deleteProgram(progLine); if (progQuad) gl.deleteProgram(progQuad);
        } catch (_) {}
      }
      parts = []; field = null;
    }

    return {
      webgl: !!gl,
      resize: resize,
      setField: setField,
      clearTrails: clearTrails,
      tick: tick,
      dispose: dispose,
      reseed: function () { for (var i = 0; i < parts.length; i++) spawn(parts[i]); cleared = true; },
      count: function () { return parts.length; },
      stats: function () { return { webgl: !!gl, parts: parts.length, target: target, drawn: vcount / 6, frameMs: +frameMs.toFixed(2), dpr: dpr, w: W, h: H }; }
    };
  }

  window.IntMapWindGL = { supported: supported, create: create, GAIN: GAIN, TRAIL_TAU: TRAIL_TAU };
})();
