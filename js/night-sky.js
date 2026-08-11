/* ============================================================================
 *  IntMap · THE SKY FROM A POINT ON THE GROUND — window.IntMapNightSky  (#R208)
 * ----------------------------------------------------------------------------
 *  「ある地点からの星空（右クリックから／既定は現在時刻／再生と日時設定／地形で空が隠れる＝既存3D流用）」
 *
 *  #R186 put the real sky BEHIND THE GLOBE: the same catalogue, rotated by Greenwich sidereal time,
 *  seen from the map's camera out in space. This is the other view of the same sky — the one a
 *  person standing at a point on the Earth has, looking up. Nothing about the astronomy changes;
 *  what changes is the frame it is expressed in and the fact that the ground gets in the way.
 *
 *  ── EVERYTHING HERE IS BORROWED, ON PURPOSE ─────────────────────────────────────────────────
 *  Four things this needed already existed, and re-deriving any of them would have created a second
 *  copy that drifts (the mistake #R136 traced a whole round of mis-painted eras to):
 *    · the star catalogue, its precession and Greenwich sidereal time  → window.IntMapSky
 *      (js/space-sky.js already exposes `load`, `gmstDeg`, `precess`, `bvToRGB` by name);
 *    · the Sun, the Moon and the planets as RA/Dec of date          → window.IntMapEphemeris
 *      (js/ephemeris.js already publishes `equatorial(id, jd)`, verified in Node against an
 *      independent solar series and against the Moon's own libration — #R197);
 *    · the terrain                                                   → window.IntMapTerrain
 *      (js/map-extras.js: `sampler(bounds, z)` → `elevAt(lon, lat)`, the same Terrarium DEM the
 *      viewshed and the drone planner read);
 *    · the clock                                                     → window.IntMapTime.when()
 *      (STANDING #R94 — one master clock; ⚠ there is no `.now`).
 *
 *  ── THE PROJECTION, AND WHY THIS ONE ────────────────────────────────────────────────────────
 *  Azimuthal equidistant on the horizon coordinates: the zenith at the centre, the horizon as the
 *  rim, and altitude linear in radius (r = (90° − alt)/90° · R). It is the standard all-sky chart,
 *  and it is the projection that makes the terrain honest: a horizon profile is one altitude per
 *  azimuth, so it closes into a single ring around the edge and the sky it hides is exactly the
 *  area outside it. North is up and EAST IS LEFT, because that is what looking up at the sky does
 *  to the compass — printing east on the right would mirror every constellation.
 *
 *  ── THE HORIZON IS MEASURED, NOT ASSUMED ────────────────────────────────────────────────────
 *  ⚠ A flat 0° horizon would be a drawing, not an answer. For each of 180 azimuths a ray is walked
 *  out to HORIZON_KM and the greatest ELEVATION ANGLE along it is kept — with the Earth's curvature
 *  and standard refraction taken off, because at 40 km the drop is 100 m and a mountain that far
 *  away is lower in the sky than its height alone suggests. Where the DEM cannot answer (no tiles,
 *  offline) the profile is left NULL and the view says the horizon is unmeasured, rather than
 *  drawing a flat one and letting it look like a measurement (standing instruction 4).
 *
 *  ── (#R214) THE SECOND VIEW: STANDING THERE ─────────────────────────────────────────────────
 *  「実際にその地点に立ったように見れるモードも追加して。」 The all-sky disc above is a CHART: it
 *  shows the whole hemisphere at once, which no one has ever seen, and it costs the thing a person
 *  actually experiences — that the sky is IN FRONT of you, that the ridge to the west is a shape at
 *  eye level, and that you have to turn round to find what is behind you. So there is a second mode
 *  over the same astronomy, and only the projection and the camera change:
 *
 *    · GNOMONIC (rectilinear), because that is what an eye and a normal lens do — a straight line in
 *      the sky stays straight on the screen. Everything is expressed as a unit vector in the
 *      observer's own ENU frame (x east, y north, z up) and divided by its component along the view
 *      axis. Nothing more than 88° off the axis can be drawn at all (the projection diverges at 90°),
 *      and the field of view is capped well inside that.
 *    · THE CAMERA IS UPRIGHT — no roll, ever. Screen-up is the direction 90° above the view axis in
 *      the same vertical plane, so the horizon is level wherever you point and "up" means up.
 *    · THE SAME MEASURED PROFILE IS THE SKYLINE. In the disc it closes into a ring; here it is a
 *      silhouette drawn across the view and filled to the bottom of the frame. It is the SAME
 *      `horizonAt()`, so the two modes cannot disagree about what the ground hides.
 *    · ⚠ AND WHEN IT IS NOT MEASURED IT IS NOT DRAWN AS GROUND. A first-person view has to put
 *      something under the sky, and the honest something is the GEOMETRIC horizon: a dotted 0° line
 *      with a translucent wash, which reads as a construction line rather than as a hill. The panel
 *      says which of the two you are looking at, exactly as the disc does.
 *
 *  ⚠ The per-star horizon coordinates are cached per instant (`skyCache`), because turning your head
 *  does not move the stars: a drag re-projects ~9,000 cached unit vectors instead of re-precessing
 *  98,887 catalogue entries at pointer rate.
 * ==========================================================================*/
window.IntMapNightSky = (function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const J2000 = 2451545.0;

  const SKY = () => window.IntMapSky;
  const EPH = () => window.IntMapEphemeris;
  const TER = () => window.IntMapTerrain;
  const lang = () => { try { return (window.IM_HOST && window.IM_HOST.lang) || document.documentElement.lang || 'en'; } catch (_) { return 'en'; } };
  const L = window.IntMapLang.pick(()=>lang());
  const esc = (s) => { try { return window.IntMapSafe.html(String(s)); } catch (_) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); } };

  /* ── state ──────────────────────────────────────────────────────────────────────────────── */
  let root = null, cv = null, ctx = null, panel = null;
  let open = false, site = null;              /* {lng, lat, elevM} */
  let stars = null, starErr = null;
  let horizon = null, horizonBusy = false, horizonErr = null;   /* Float32Array(AZ_N) of degrees, or null */
  let whenMs = null, live = true, playing = false, rate = 0;    /* rate: simulated seconds per real second */
  let raf = 0, lastTick = 0, lastDraw = null, dpr = 1;
  /* (#R214) the standing view. `mode` is the only switch; everything else here is the camera. */
  let mode = 'dome';                                            /* 'dome' = the all-sky chart, 'stand' = first person */
  let lookAz = 180, lookAlt = 12, fovDeg = 65;                  /* looking south, a little above the skyline */
  let drag = null, dragged = false, skyCache = null;

  const AZ_N = 180;                 /* one horizon sample every 2° of azimuth */
  const HORIZON_KM = 40;            /* far enough that a real skyline is in it, near enough to be a few DEM tiles */
  const MAG_LIMIT = 6.5;            /* the naked-eye sky — this view is what a person sees, not what a sensor does */
  const FOV_MIN = 15, FOV_MAX = 110, ALT_LIMIT = 85;
  const EYE_M = 1.7;                /* the same standing person measureHorizon() puts the rays' origin at */

  /* ── time ───────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THE MASTER CLOCK IS `when()`. #R94 made window.IntMapTime the one clock in this app and #R200
     recorded that `IntMapTime.now` does not exist — reaching for it is the silent-undefined trap. */
  function mapClock() {
    try { const t = window.IntMapTime; if (t && typeof t.when === 'function') { const w = t.when(); if (w != null) return +w; } } catch (_) { }
    return Date.now();
  }
  function nowMs() { return live ? mapClock() : whenMs; }
  const julianDay = (ms) => ms / 86400000 + 2440587.5;

  /* ── horizon coordinates ────────────────────────────────────────────────────────────────── */
  /* RA/Dec of date + the observer's longitude and latitude → altitude and azimuth. The local hour
     angle is (GMST + longitude − RA), which is the same sidereal rotation js/space-sky.js applies to
     put a star over its own meridian; here it is resolved into the observer's own horizon instead. */
  function altAz(raDeg, decDeg, lstDeg, latDeg) {
    const H = (lstDeg - raDeg) * D2R, d = decDeg * D2R, p = latDeg * D2R;
    const sinAlt = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
    return { alt: alt * R2D, az: ((az * R2D) % 360 + 360) % 360 };
  }

  /* Azimuthal equidistant, zenith at the centre. ⚠ EAST IS LEFT: looking up reverses the compass,
     and a chart with east on the right is a mirror image of the sky it claims to show. */
  function project(alt, az, R) {
    const r = (90 - alt) / 90 * R, a = az * D2R;
    return [Math.sin(a) * r, -Math.cos(a) * r];
  }

  /* ── (#R214) the standing camera ─────────────────────────────────────────────────────────── */
  /** a horizon coordinate as a unit vector in the observer's ENU frame: x east, y north, z up */
  function dirOf(altDeg, azDeg) {
    const a = altDeg * D2R, z = azDeg * D2R, ca = Math.cos(a);
    return [ca * Math.sin(z), ca * Math.cos(z), Math.sin(a)];
  }
  /* The basis, built so the camera can never roll: the axis is where you are looking, RIGHT is the
     horizontal direction 90° clockwise from it (dot with the axis is identically zero, whatever the
     altitude), and UP is 90° above the axis in the same vertical plane — which past the zenith
     correctly becomes the opposite azimuth coming down the other side. */
  function viewBasis() {
    return { f: dirOf(lookAlt, lookAz), r: dirOf(0, lookAz + 90), u: dirOf(lookAlt + 90, lookAz) };
  }
  const DOT_MIN = 0.035;            /* ≈ 88° off the axis; the gnomonic projection diverges at 90° */
  /** gnomonic projection of a horizon coordinate. Returns [x, y] in pixels from the centre, or null. */
  function projectStand(alt, az, B, F) {
    return projectVec(dirOf(alt, az), B, F);
  }
  function projectVec(v, B, F) {
    const d = v[0] * B.f[0] + v[1] * B.f[1] + v[2] * B.f[2];
    if (d <= DOT_MIN) return null;
    return [(v[0] * B.r[0] + v[1] * B.r[1] + v[2] * B.r[2]) / d * F,
            -(v[0] * B.u[0] + v[1] * B.u[1] + v[2] * B.u[2]) / d * F];
  }
  const wrapAz = (a) => ((a % 360) + 360) % 360;

  /* ⚠ TURNING YOUR HEAD DOES NOT MOVE THE STARS. Precessing 98,887 catalogue entries and resolving
     them into the horizon frame is per-INSTANT work, not per-frame work, so it is done once and kept
     as unit vectors. The 2-second bucket is 0.008° of sidereal rotation — below one screen pixel at
     any field of view this view offers — and it is what makes a drag cost three dot products a star. */
  function ensureSkyCache(ms, T, lst) {
    /* ⚠ the catalogue is part of the key: it arrives AFTER the first frame, and a cache keyed only on
       the instant would keep answering "no stars" for the two seconds that first empty frame owns. */
    const key = Math.round(ms / 2000) + '|' + site.lat.toFixed(4) + '|' + site.lng.toFixed(4) + '|' + (stars ? stars.n : 0);
    if (skyCache && skyCache.key === key) return skyCache;
    const S = SKY();
    const dir = [], alt = [], az = [], bri = [], rad = [], col = [];
    if (stars && S) {
      for (let i = 0; i < stars.n; i++) {
        const v = stars.mag[i];
        if (v > MAG_LIMIT) continue;
        const pr = S.precess(stars.ra[i], stars.dec[i], T);
        const q = altAz(pr[0], pr[1], lst, site.lat);
        if (q.alt <= 0) continue;
        const d = dirOf(q.alt, q.az);
        /* the same magnitude curve the disc uses, evaluated here because magnitude never changes */
        const b = Math.max(0, Math.min(1, (MAG_LIMIT + 1.5 - v) / 8));
        dir.push(d[0], d[1], d[2]); alt.push(q.alt); az.push(q.az);
        bri.push(Math.min(1, 0.25 + Math.pow(b, 1.4) * 1.5)); rad.push(0.5 + b * b * 2.4);
        col.push('rgb(' + stars.cr[i] + ',' + stars.cg[i] + ',' + stars.cb[i] + ')');
      }
    }
    skyCache = { key, n: alt.length, dir: Float32Array.from(dir), alt: Float32Array.from(alt),
      az: Float32Array.from(az), bri: Float32Array.from(bri), rad: Float32Array.from(rad), col };
    return skyCache;
  }

  /* ── the terrain horizon ────────────────────────────────────────────────────────────────── */
  /* The elevation ANGLE of the ground at distance d, seen from an eye at h0:
        tan(θ) = (h − h0 − d²/(2·k·Re)) / d
     The second term is the Earth curving away under the ray, reduced by the standard refraction
     factor k = 1.13 for optical sight lines — the same constant js/viewshed.js offers, and NOT the
     4/3 radio value, because this is about seeing. */
  const RE_M = 6371008.8, K_REFRACT = 1.13;
  function elevAngleDeg(h, h0, dM) { return Math.atan2(h - h0 - (dM * dM) / (2 * K_REFRACT * RE_M), dM) * R2D; }

  async function measureHorizon(lng, lat) {
    horizonBusy = true; horizonErr = null;
    try {
      const T = TER(); if (!T || !T.sampler) throw new Error('no terrain sampler');
      /* the DEM zoom is chosen so the whole disc is a handful of tiles — sampler() refuses more
         than 48 and returns null rather than fetching a screenful of them */
      const degLat = HORIZON_KM / 111.32;
      const degLng = HORIZON_KM / (111.32 * Math.max(0.05, Math.cos(lat * D2R)));
      const bounds = [lng - degLng, lat - degLat, lng + degLng, lat + degLat];
      let samp = null;
      for (const z of [11, 10, 9, 8]) { samp = await T.sampler(bounds, z); if (samp) break; }
      if (!samp) throw new Error('the elevation tiles did not answer');
      const h0raw = samp.elevAt(lng, lat);
      /* ⚠ THE OBSERVER STANDS ON THE SURFACE, AND OVER WATER THAT IS SEA LEVEL — NOT THE SEABED.
         The Terrarium DEM is bathymetric, so `elevAt` in the middle of the Pacific answers −5,367 m,
         which is a true fact about the sea floor and a nonsense place to put someone's eyes: every
         swell would be a mountain and the whole sky would be below the horizon. Measured before this
         clamp, an open-ocean point reported a skyline where there is none. */
      const ground = (h0raw == null ? 0 : Math.max(0, h0raw));
      const eye = ground + 1.7;                                       /* a standing person */
      const prof = new Float32Array(AZ_N);
      const STEP_M = Math.max(60, HORIZON_KM * 1000 / 400);
      for (let i = 0; i < AZ_N; i++) {
        const az = i * 360 / AZ_N, ca = Math.cos(az * D2R), sa = Math.sin(az * D2R);
        let best = -90;
        for (let d = STEP_M; d <= HORIZON_KM * 1000; d += STEP_M) {
          const dLat = (d * ca) / 111320;
          const dLng = (d * sa) / (111320 * Math.max(0.05, Math.cos((lat + dLat / 2) * D2R)));
          const h = samp.elevAt(lng + dLng, lat + dLat);
          if (h == null) continue;
          const a = elevAngleDeg(Math.max(0, h), eye, d);   /* the sea is a surface at 0 m, not a trench */
          if (a > best) best = a;
        }
        /* the sea, or ground that never rises above the eye, is a horizon at 0° — not at −90° */
        prof[i] = Math.max(0, best);
      }
      horizon = prof; site.elevM = h0raw == null ? null : ground; site.demZ = samp.z; site.demRaw = h0raw;
    } catch (e) {
      /* ⚠ NULL, NOT A FLAT RING. "I could not measure the horizon" and "the horizon is flat" are
         different answers and the panel says which one this is. */
      horizon = null; horizonErr = (e && e.message) || String(e);
    }
    horizonBusy = false;
    draw();
  }

  /** the measured horizon altitude at an azimuth, linearly interpolated between samples */
  function horizonAt(azDeg) {
    if (!horizon) return 0;
    const f = ((azDeg % 360) + 360) % 360 / 360 * AZ_N;
    const i = Math.floor(f), t = f - i;
    return horizon[i % AZ_N] * (1 - t) + horizon[(i + 1) % AZ_N] * t;
  }

  /* ── the drawing ────────────────────────────────────────────────────────────────────────── */
  const PLANETS = [
    { id: 'mercury', en: 'Mercury', jp: '水星', c: '#c9c0b4' },
    { id: 'venus', en: 'Venus', jp: '金星', c: '#f5e6c8' },
    { id: 'mars', en: 'Mars', jp: '火星', c: '#e2725b' },
    { id: 'jupiter', en: 'Jupiter', jp: '木星', c: '#e6d3a3' },
    { id: 'saturn', en: 'Saturn', jp: '土星', c: '#e3d6a8' },
    { id: 'uranus', en: 'Uranus', jp: '天王星', c: '#a8dce3' },
    { id: 'neptune', en: 'Neptune', jp: '海王星', c: '#7b96e0' },
  ];

  function draw() {
    if (!open || !cv || !ctx || !site) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.max(20, Math.min(w, h) / 2 - 16);
    const ms = nowMs(), jd = julianDay(ms), T = (jd - J2000) / 36525;
    const S = SKY();
    const lst = S ? (S.gmstDeg(ms) + site.lng) : 0;

    /* the sky disc. The Sun's altitude is what says whether this is a night sky at all, so the
       background is a function of it rather than a fixed navy — twilight is a real state. */
    let sunAlt = -90, sunAz = 0;
    try { const e = EPH().equatorial('sun', jd); const p = altAz(e.raDeg, e.decDeg, lst, site.lat); sunAlt = p.alt; sunAz = p.az; } catch (_) { }
    const day = Math.max(0, Math.min(1, (sunAlt + 18) / 24));           /* −18° = night, +6° = full day */
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const top = mix([6, 9, 24], [92, 148, 214], day), rim = mix([12, 18, 40], [166, 199, 232], day);
    /* (#R214) the two modes share every number above this line — the instant, the sidereal angle, the
       Sun's altitude and the two sky colours it mixes — and differ only in where they put them. */
    if (mode === 'stand') { drawStand(w, h, ms, jd, T, lst, sunAlt, sunAz, day, top, rim); return; }
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, 'rgb(' + top.join(',') + ')');
    bg.addColorStop(1, 'rgb(' + rim.join(',') + ')');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fillStyle = bg; ctx.fill();

    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.clip();

    /* altitude circles every 30°, and the cardinal spokes */
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
    for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, (90 - a) / 90 * R, 0, 6.2832); ctx.stroke(); }
    for (let az = 0; az < 360; az += 90) { const p = project(0, az, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p[0], cy + p[1]); ctx.stroke(); }

    /* ── the stars ───────────────────────────────────────────────────────────────────────── */
    let drawn = 0, above = 0, byTerrain = 0, byDaylight = 0;
    if (stars) {
      for (let i = 0; i < stars.n; i++) {
        const v = stars.mag[i];
        if (v > MAG_LIMIT) continue;
        const pr = S.precess(stars.ra[i], stars.dec[i], T);
        const q = altAz(pr[0], pr[1], lst, site.lat);
        if (q.alt <= 0) continue;
        above++;
        if (q.alt < horizonAt(q.az)) { byTerrain++; continue; }         /* the ground is in the way */
        const p = project(q.alt, q.az, R);
        /* size and alpha from the MEASURED magnitude, the same curve js/space-sky.js uses, and
           faded out as the sky brightens — a 5th-magnitude star is not visible at noon */
        const b = Math.max(0, Math.min(1, (MAG_LIMIT + 1.5 - v) / 8));
        const a = Math.min(1, 0.25 + Math.pow(b, 1.4) * 1.5) * (1 - day * 0.97);
        if (a <= 0.02) { byDaylight++; continue; }   /* ⚠ NOT the same as hidden by the ground */
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(' + stars.cr[i] + ',' + stars.cg[i] + ',' + stars.cb[i] + ')';
        ctx.beginPath(); ctx.arc(cx + p[0], cy + p[1], 0.5 + Math.pow(b, 2) * 2.4, 0, 6.2832); ctx.fill();
        drawn++;
      }
      ctx.globalAlpha = 1;
    }

    /* ── the Sun, the Moon and the planets ───────────────────────────────────────────────── */
    const marks = [];
    const put = (id, name, colour, raDeg, decDeg, rPix) => {
      const q = altAz(raDeg, decDeg, lst, site.lat);
      const hidden = q.alt < horizonAt(q.az);
      if (q.alt > -2) marks.push({ id, name, colour, alt: q.alt, az: q.az, r: rPix, hidden });
      if (q.alt <= 0 || hidden) return;
      const p = project(q.alt, q.az, R);
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(cx + p[0], cy + p[1], rPix, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 10px system-ui,sans-serif';
      ctx.fillText(name, cx + p[0] + rPix + 3, cy + p[1] + 3);
    };
    try {
      const E = EPH();
      const s = E.equatorial('sun', jd); put('sun', L('Sun', '太陽', 'Sonne', 'Солнце', 'Sol'), '#ffd75e', s.raDeg, s.decDeg, 7);
      const m = E.equatorial('moon', jd); put('moon', L('Moon', '月', 'Mond', 'Луна', 'Luna'), '#e8e6df', m.raDeg, m.decDeg, 6);
      for (const pl of PLANETS) {
        const e = E.equatorial(pl.id, jd); if (!e) continue;
        put(pl.id, lang() === 'jp' ? pl.jp : pl.en, pl.c, e.raDeg, e.decDeg, 3);
      }
    } catch (_) { }

    /* ── the ground ──────────────────────────────────────────────────────────────────────── */
    if (horizon) {
      ctx.beginPath();
      for (let i = 0; i <= AZ_N; i++) {
        const az = i * 360 / AZ_N, p = project(Math.min(89, horizon[i % AZ_N]), az, R);
        if (i === 0) ctx.moveTo(cx + p[0], cy + p[1]); else ctx.lineTo(cx + p[0], cy + p[1]);
      }
      /* …and back around the rim, so the filled region is the sky the ground HIDES */
      ctx.arc(cx, cy, R, 0, 6.2832, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,14,10,0.92)'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,150,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= AZ_N; i++) {
        const az = i * 360 / AZ_N, p = project(Math.min(89, horizon[i % AZ_N]), az, R);
        if (i === 0) ctx.moveTo(cx + p[0], cy + p[1]); else ctx.lineTo(cx + p[0], cy + p[1]);
      }
      ctx.stroke();
    }
    ctx.restore();

    /* the rim and the cardinal letters, outside the clip so they are never covered by the ground */
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 12px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [az, s] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const p = project(0, az, R + 10);
      ctx.fillText(s, cx + p[0], cy + p[1]);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

    lastDraw = { ms, jd, lst, sunAlt: +sunAlt.toFixed(2), day: +day.toFixed(3), starsDrawn: drawn, starsAboveHorizon: above, starsHiddenByTerrain: byTerrain, starsLostToDaylight: byDaylight, marks };
    updateReadout();
  }

  /* ══ (#R214) STANDING AT THE POINT ═════════════════════════════════════════════════════════════
     The same sky, the same measured skyline, seen through a rectilinear lens pointed somewhere. */
  function drawStand(w, h, ms, jd, T, lst, sunAlt, sunAz, day, top, rim) {
    const cx = w / 2, cy = h / 2;
    const B = viewBasis();
    const F = (h / 2) / Math.tan(fovDeg / 2 * D2R);      /* focal length in pixels, from the VERTICAL fov */
    const P = (alt, az) => { const p = projectStand(alt, az, B, F); return p ? [cx + p[0], cy + p[1]] : null; };
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

    /* ── the sky ─────────────────────────────────────────────────────────────────────────────
       The disc's radius IS zenith distance, so its radial gradient is a gradient in ALTITUDE. The
       same two colours therefore become a vertical gradient here — but evaluated at the altitude
       each screen row actually looks at, which is not proportional to the row once the camera tilts
       (that is the whole difference between a chart and a lens). */
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, yPix = t * h, k = (cy - yPix) / F;
      const vz = B.f[2] + B.u[2] * k, len = Math.hypot(B.f[0] + B.u[0] * k, B.f[1] + B.u[1] * k, vz);
      const alt = Math.asin(Math.max(-1, Math.min(1, vz / len))) * R2D;
      const c = mix(rim, top, Math.max(0, Math.min(1, alt / 90)));
      bg.addColorStop(t, 'rgb(' + c.join(',') + ')');
    }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    /* ── the grid: almucantars and azimuth lines, sampled through the same projection ───────── */
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    const poly = (pts) => { let s = false; ctx.beginPath();
      for (const p of pts) { if (!p) { s = false; continue; } if (!s) { ctx.moveTo(p[0], p[1]); s = true; } else ctx.lineTo(p[0], p[1]); }
      ctx.stroke(); };
    for (const a of [30, 60]) { const pts = []; for (let d = -100; d <= 100; d += 2) pts.push(P(a, lookAz + d)); poly(pts); }
    for (let az = 0; az < 360; az += 30) { const pts = []; for (let a = -8; a <= 88; a += 4) pts.push(P(a, az)); poly(pts); }

    /* ── the stars, from the per-instant cache ───────────────────────────────────────────────── */
    const C = ensureSkyCache(ms, T, lst);
    let drawn = 0, byTerrain = 0, byDaylight = 0;
    for (let i = 0; i < C.n; i++) {
      if (C.alt[i] < horizonAt(C.az[i])) { byTerrain++; continue; }      /* the ground is in the way */
      const a = C.bri[i] * (1 - day * 0.97);
      if (a <= 0.02) { byDaylight++; continue; }                          /* ⚠ NOT the same as hidden */
      const p = projectVec([C.dir[i * 3], C.dir[i * 3 + 1], C.dir[i * 3 + 2]], B, F);
      if (!p) continue;
      const x = cx + p[0], y = cy + p[1];
      if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
      ctx.globalAlpha = a; ctx.fillStyle = C.col[i];
      ctx.beginPath(); ctx.arc(x, y, C.rad[i], 0, 6.2832); ctx.fill();
      drawn++;
    }
    ctx.globalAlpha = 1;

    /* ── the Sun, the Moon and the planets ───────────────────────────────────────────────────── */
    const marks = [];
    const put = (id, name, colour, raDeg, decDeg, rPix) => {
      const q = altAz(raDeg, decDeg, lst, site.lat);
      const hidden = q.alt < horizonAt(q.az);
      if (q.alt > -2) marks.push({ id, name, colour, alt: q.alt, az: q.az, r: rPix, hidden });
      if (q.alt <= 0 || hidden) return;
      const p = P(q.alt, q.az); if (!p) return;
      /* the discs are drawn at the SAME angular size the disc chart gives them, scaled by the lens —
         at a 15° field of view the Moon is genuinely bigger on the screen, because it is */
      const s = rPix * Math.max(0.8, Math.min(3.2, 65 / fovDeg));
      ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(p[0], p[1], s, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '600 11px system-ui,sans-serif';
      ctx.fillText(name, p[0] + s + 4, p[1] + 4);
    };
    try {
      const E = EPH();
      const s = E.equatorial('sun', jd); put('sun', L('Sun', '太陽', 'Sonne', 'Солнце', 'Sol'), '#ffd75e', s.raDeg, s.decDeg, 7);
      const m = E.equatorial('moon', jd); put('moon', L('Moon', '月', 'Mond', 'Луна', 'Luna'), '#e8e6df', m.raDeg, m.decDeg, 6);
      for (const pl of PLANETS) { const e = E.equatorial(pl.id, jd); if (!e) continue; put(pl.id, lang() === 'jp' ? pl.jp : pl.en, pl.c, e.raDeg, e.decDeg, 3); }
    } catch (_) { }

    /* ── the ground ───────────────────────────────────────────────────────────────────────────
       One contiguous run of the profile, centred on the view axis (past ±90° from it there is no
       projection at all), closed below the bottom edge. Looking steeply down the ridge lands far
       above the frame and this fills everything; looking steeply up it lands far below and fills
       nothing — which is exactly right in both cases. */
    const ridge = []; for (let d = -100; d <= 100; d += 0.5) {
      const az = lookAz + d, p = P(Math.min(89, horizonAt(az)), az);
      if (p) ridge.push(p); else if (ridge.length) break;
    }
    if (ridge.length > 1) {
      ctx.beginPath(); ctx.moveTo(ridge[0][0], ridge[0][1]);
      for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
      ctx.lineTo(ridge[ridge.length - 1][0], h + 60); ctx.lineTo(ridge[0][0], h + 60); ctx.closePath();
      if (horizon) {
        const g = ctx.createLinearGradient(0, cy, 0, h);
        g.addColorStop(0, 'rgb(9,13,11)'); g.addColorStop(1, 'rgb(20,26,22)');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(150,190,150,0.6)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ridge[0][0], ridge[0][1]);
        for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
        ctx.stroke();
      } else {
        /* ⚠ NOT MEASURED — so this is the GEOMETRIC horizon, and it is drawn as one: a translucent
           wash under a dashed line, which cannot be mistaken for a hill. The panel says so too. */
        ctx.fillStyle = 'rgba(10,14,18,0.55)'; ctx.fill();
        ctx.save(); ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(210,225,240,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ridge[0][0], ridge[0][1]);
        for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
        ctx.stroke(); ctx.restore();
      }
    }

    /* ── the compass, on top of the ground so it is always readable ──────────────────────────── */
    const CARD = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let az = 0; az < 360; az += 10) {
      const p = P(0, az); if (!p || p[0] < 0 || p[0] > w) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - 4); ctx.lineTo(p[0], p[1] + 4); ctx.stroke();
    }
    for (const [az, s] of CARD) {
      const p = P(0, az); if (!p || p[0] < -20 || p[0] > w + 20) continue;
      const y = Math.max(12, Math.min(h - 10, p[1] + 16));
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = (s.length === 1 ? '700 14px' : '600 11px') + ' system-ui,sans-serif';
      ctx.fillText(s, p[0], y);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

    lastDraw = { ms, jd, lst, sunAlt: +sunAlt.toFixed(2), day: +day.toFixed(3), starsDrawn: drawn,
      starsAboveHorizon: C.n, starsHiddenByTerrain: byTerrain, starsLostToDaylight: byDaylight, marks,
      look: { az: +wrapAz(lookAz).toFixed(1), alt: +lookAlt.toFixed(1), fov: +fovDeg.toFixed(1) } };
    updateReadout();
  }

  /* ── the panel ──────────────────────────────────────────────────────────────────────────── */
  function fmtLocal(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function updateReadout() {
    if (!panel || !lastDraw) return;
    const r = panel.querySelector('.ns-read'); if (!r) return;
    const vis = lastDraw.marks.filter((m) => m.alt > 0 && !m.hidden);
    const hz = horizonBusy ? L('measuring the horizon from the terrain…', '地形から地平線を計測中…', 'Horizont wird aus dem Gelände gemessen…', 'Измеряю горизонт по рельефу…', 'Midiendo el horizonte…')
      : horizon ? L('horizon: measured from the DEM', '地平線：DEMから実測', 'Horizont: aus dem DEM gemessen', 'Горизонт: измерен по DEM', 'horizonte: medido del DEM')
        : L('horizon: NOT measured — ', '地平線：計測できず — ', 'Horizont: NICHT gemessen — ', 'Горизонт: НЕ измерен — ', 'horizonte: NO medido — ') + esc(horizonErr || '');
    r.innerHTML =
      '<div>' + esc(L('Sun', '太陽', 'Sonne', 'Солнце', 'Sol')) + ' ' + lastDraw.sunAlt.toFixed(1) + '°'
      + ' · ' + lastDraw.starsDrawn.toLocaleString() + '/' + lastDraw.starsAboveHorizon.toLocaleString() + ' '
      + esc(L('stars visible', '個の星が見えている', 'Sterne sichtbar', 'звёзд видно', 'estrellas visibles')) + '</div>'
      + '<div class="ns-sub">' + esc(hz) + (site && site.elevM != null ? ' · ' + Math.round(site.elevM) + ' m' : '')
      /* (#R214) in the standing view the eye height is part of the answer — the skyline was measured
         from it, and 1.7 m is why a ridge 40 km away sits where it does */
      + (mode === 'stand' && site && site.elevM != null
        ? ' · ' + esc(L('eye', '視点', 'Auge', 'глаз', 'ojo')) + ' ' + Math.round(site.elevM + EYE_M) + ' m' : '') + '</div>'
      + (vis.length ? '<div class="ns-sub">' + vis.map((m) => esc(m.name) + ' ' + m.alt.toFixed(0) + '°').join(' · ') + '</div>' : '');
  }

  function ensureDOM() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'night-sky';
    root.style.cssText = 'position:fixed;inset:0;z-index:9400;display:none;background:rgba(4,6,12,0.86);backdrop-filter:blur(3px);';
    root.innerHTML =
      '<div class="ns-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">'
      + '<canvas class="ns-cv" style="width:min(88vmin,88vw);height:min(88vmin,88vh);"></canvas></div>'
      + '<div class="ns-panel"></div>';
    document.body.appendChild(root);
    cv = root.querySelector('.ns-cv'); ctx = cv.getContext('2d');
    panel = root.querySelector('.ns-panel');
    panel.style.cssText = 'position:absolute;left:12px;top:12px;max-width:min(420px,92vw);background:rgba(12,16,26,0.92);'
      + 'border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:10px 12px;color:#e8eef8;'
      + 'font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
      + '<strong class="ns-title" style="flex:1"></strong>'
      + '<button class="ns-close" title="' + esc(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '" '
      + 'style="background:none;border:0;color:#e8eef8;font-size:16px;cursor:pointer;">✕</button></div>'
      + '<div class="ns-read" style="margin-bottom:8px;"></div>'
      /* (#R214) the two views of the same sky — a chart of the whole hemisphere, or standing in it */
      + '<div class="ns-modes" style="display:flex;margin-bottom:8px;border:1px solid rgba(255,255,255,.18);'
      + 'border-radius:8px;overflow:hidden;width:max-content;">'
      + '<button class="ns-mode" data-m="dome" style="border:0;background:none;color:#e8eef8;padding:4px 10px;cursor:pointer;font:inherit;"></button>'
      + '<button class="ns-mode" data-m="stand" style="border:0;border-left:1px solid rgba(255,255,255,.18);background:none;color:#e8eef8;padding:4px 10px;cursor:pointer;font:inherit;"></button>'
      + '</div>'
      + '<div class="ns-look" style="display:none;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">'
      + '<span class="ns-lookread" style="opacity:.85"></span>'
      + '<button class="ns-face" data-az="0" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:6px;padding:2px 7px;cursor:pointer;font:inherit;">N</button>'
      + '<button class="ns-face" data-az="90" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:6px;padding:2px 7px;cursor:pointer;font:inherit;">E</button>'
      + '<button class="ns-face" data-az="180" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:6px;padding:2px 7px;cursor:pointer;font:inherit;">S</button>'
      + '<button class="ns-face" data-az="270" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:6px;padding:2px 7px;cursor:pointer;font:inherit;">W</button>'
      + '<button class="ns-zenith" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:6px;padding:2px 7px;cursor:pointer;font:inherit;"></button>'
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">'
      + '<input class="ns-when" type="datetime-local" step="60" style="background:#1b2233;color:#e8eef8;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:4px 6px;font:inherit;">'
      + '<button class="ns-now" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:8px;padding:4px 9px;cursor:pointer;font:inherit;"></button>'
      + '<button class="ns-play" style="border:1px solid rgba(255,255,255,.2);background:#1b2233;color:#e8eef8;border-radius:8px;padding:4px 9px;cursor:pointer;font:inherit;"></button>'
      + '<select class="ns-rate" style="background:#1b2233;color:#e8eef8;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:4px 6px;font:inherit;">'
      + '<option value="60">1 min/s</option><option value="600">10 min/s</option>'
      + '<option value="3600" selected>1 h/s</option><option value="86400">1 day/s</option></select>'
      + '</div>'
      + '<div class="ns-sub ns-attr" style="opacity:.62;margin-top:8px;font-size:11px;"></div>';
    const st = document.createElement('style');
    st.textContent = '#night-sky .ns-sub{opacity:.78;font-size:12px}';
    root.appendChild(st);

    panel.querySelector('.ns-close').onclick = () => close();
    panel.querySelector('.ns-now').onclick = () => { live = true; playing = false; syncControls(); draw(); };
    panel.querySelector('.ns-play').onclick = () => { playing = !playing; if (playing) { live = false; if (whenMs == null) whenMs = mapClock(); lastTick = 0; } syncControls(); };
    panel.querySelector('.ns-when').onchange = (e) => {
      const v = Date.parse(e.target.value); if (!isFinite(v)) return;
      live = false; playing = false; whenMs = v; syncControls(); draw();
    };
    panel.querySelector('.ns-rate').onchange = (e) => { rate = +e.target.value || 3600; };
    rate = 3600;
    panel.querySelectorAll('.ns-mode').forEach((b) => { b.onclick = () => setMode(b.getAttribute('data-m')); });
    panel.querySelectorAll('.ns-face').forEach((b) => { b.onclick = () => { lookAz = +b.getAttribute('data-az'); lookAlt = Math.min(lookAlt, 25); syncControls(); draw(); }; });
    panel.querySelector('.ns-zenith').onclick = () => { lookAlt = (lookAlt > 60 ? 12 : 80); syncControls(); draw(); };
    root.addEventListener('click', (e) => {
      if (dragged) { dragged = false; return; }                     /* a look-around that ended on the backdrop is not a click */
      if (e.target === root || e.target.classList.contains('ns-wrap')) close();
    });

    /* ── (#R214) looking around ───────────────────────────────────────────────────────────────
       Drag moves the SKY, not the head: pulling right brings what is on your left into view, which
       is the same convention as the map underneath and the one every touch device has taught. The
       scale is exact — one pixel is one focal-length-worth of angle — so a drag across the frame
       turns you by the field of view and nothing else. */
    applyChrome();
    cv.addEventListener('pointerdown', (e) => {
      if (mode !== 'stand') return;
      drag = { x: e.clientX, y: e.clientY, az: lookAz, alt: lookAlt, moved: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (_) { }
      cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || mode !== 'stand') return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      const per = fovDeg / Math.max(1, cv.clientHeight);            /* degrees per pixel at this field of view */
      lookAz = wrapAz(drag.az - dx * per);
      lookAlt = Math.max(-ALT_LIMIT, Math.min(ALT_LIMIT, drag.alt + dy * per));
      syncControls(); draw();
    });
    const endDrag = (e) => {
      if (!drag) return;
      dragged = drag.moved > 4; drag = null; cv.style.cursor = '';
      try { cv.releasePointerCapture(e.pointerId); } catch (_) { }
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('wheel', (e) => {
      if (mode !== 'stand') return;
      e.preventDefault();
      fovDeg = Math.max(FOV_MIN, Math.min(FOV_MAX, fovDeg * Math.exp((e.deltaY || 0) * 0.0016)));
      syncControls(); draw();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (mode !== 'stand') return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const step = Math.max(2, fovDeg / 8);
      if (e.key === 'ArrowLeft') lookAz = wrapAz(lookAz - step);
      else if (e.key === 'ArrowRight') lookAz = wrapAz(lookAz + step);
      else if (e.key === 'ArrowUp') lookAlt = Math.min(ALT_LIMIT, lookAlt + step);
      else if (e.key === 'ArrowDown') lookAlt = Math.max(-ALT_LIMIT, lookAlt - step);
      else if (e.key === '+' || e.key === '=') fovDeg = Math.max(FOV_MIN, fovDeg / 1.2);
      else if (e.key === '-' || e.key === '_') fovDeg = Math.min(FOV_MAX, fovDeg * 1.2);
      else return;
      e.preventDefault(); syncControls(); draw();
    });
    window.addEventListener('resize', () => { if (open) draw(); });
  }

  /* the frame the two modes want are different shapes: a disc wants a square, a lens wants a window */
  function applyChrome() {
    if (!cv) return;
    cv.style.cssText = (mode === 'stand')
      ? 'width:min(96vw,1680px);height:min(76vh,880px);border-radius:14px;cursor:grab;display:block;touch-action:none;'
      : 'width:min(88vmin,88vw);height:min(88vmin,88vh);display:block;touch-action:none;';
  }
  function setMode(m) {
    m = (m === 'stand') ? 'stand' : 'dome';
    if (m === mode) return mode;
    mode = m; applyChrome(); syncControls(); draw();
    return mode;
  }

  function syncControls() {
    if (!panel) return;
    panel.querySelector('.ns-now').textContent = live
      ? L('live', '現在', 'live', 'сейчас', 'ahora')
      : L('back to now', '現在に戻す', 'zurück zu jetzt', 'вернуть к сейчас', 'volver a ahora');
    panel.querySelector('.ns-now').style.opacity = live ? '0.55' : '1';
    panel.querySelector('.ns-play').textContent = playing ? '⏸' : '▶';
    const w = panel.querySelector('.ns-when');
    if (document.activeElement !== w) w.value = fmtLocal(nowMs());
    /* (#R214) the mode switch, the look readout and the shortcuts that go with it */
    panel.querySelectorAll('.ns-mode').forEach((b) => {
      const m = b.getAttribute('data-m'), on = (m === mode);
      b.textContent = (m === 'dome')
        ? L('All-sky chart', '全天図', 'Ganzhimmelkarte', 'Карта всего неба', 'Carta de todo el cielo')
        : L('Standing here', 'ここに立つ', 'Hier stehen', 'Стоя здесь', 'De pie aquí');
      b.style.background = on ? 'rgba(120,170,255,0.28)' : 'none';
      b.style.fontWeight = on ? '700' : '400';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const lk = panel.querySelector('.ns-look');
    lk.style.display = (mode === 'stand') ? 'flex' : 'none';
    if (mode === 'stand') {
      const dir = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(wrapAz(lookAz) / 22.5) % 16];
      lk.querySelector('.ns-lookread').textContent =
        dir + ' ' + Math.round(wrapAz(lookAz)) + '° · ' + (lookAlt >= 0 ? '+' : '') + Math.round(lookAlt) + '° · '
        + L('view', '画角', 'Blickfeld', 'поле зрения', 'campo') + ' ' + Math.round(fovDeg) + '°';
      panel.querySelector('.ns-zenith').textContent = (lookAlt > 60)
        ? L('horizon', '地平線', 'Horizont', 'горизонт', 'horizonte')
        : L('zenith', '天頂', 'Zenit', 'зенит', 'cenit');
    }
    panel.querySelector('.ns-title').textContent =
      (mode === 'stand'
        ? L('Standing here', 'ここに立って', 'Hier stehen', 'Стоя здесь', 'De pie aquí')
        : L('Sky from here', 'ここからの星空', 'Himmel von hier', 'Небо отсюда', 'Cielo desde aquí'))
      + (site ? '  ' + site.lat.toFixed(3) + '°, ' + site.lng.toFixed(3) + '°' : '');
    panel.querySelector('.ns-attr').textContent =
      L('Stars: Hipparcos (ESA 1997). Sun, Moon and planets: JPL approximate elements. Terrain: Terrarium DEM (Mapzen/AWS).',
        '星＝Hipparcos（ESA 1997）／太陽・月・惑星＝JPL近似要素／地形＝Terrarium DEM（Mapzen/AWS）',
        'Sterne: Hipparcos (ESA 1997). Sonne, Mond, Planeten: JPL. Gelände: Terrarium DEM.',
        'Звёзды: Hipparcos (ESA 1997). Солнце, Луна, планеты: JPL. Рельеф: Terrarium DEM.',
        'Estrellas: Hipparcos (ESA 1997). Sol, Luna y planetas: JPL. Terreno: Terrarium DEM.');
  }

  function tick(t) {
    if (!open) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    if (playing) {
      if (lastTick) { whenMs += (t - lastTick) * rate; syncControls(); draw(); }
      lastTick = t;
    } else { lastTick = 0; if (live) { const m = mapClock(); if (!lastDraw || Math.abs(m - lastDraw.ms) > 30000) { syncControls(); draw(); } } }
  }

  /* ── public ─────────────────────────────────────────────────────────────────────────────── */
  async function openAt(ll) {
    if (!ll || !isFinite(ll.lng) || !isFinite(ll.lat)) return false;
    ensureDOM();
    site = { lng: +ll.lng, lat: +ll.lat, elevM: null, demZ: null };
    open = true; root.style.display = 'block';
    live = (ll.when == null); playing = false;
    whenMs = (ll.when == null) ? mapClock() : +new Date(ll.when);
    horizon = null; horizonErr = null; skyCache = null;
    /* (#R214) the caller may ask for either view; anything else leaves the last one in place.
       ⚠ THE SPELLINGS ARE RESOLVED HERE, not at the Atlas call site. js/atlas-console.js is at the
       #R199 line ceiling that tests/r200 ⑤ ratchets, and «what counts as asking for the standing
       view» is a fact about this view — so it belongs to the file that owns it, and every other
       door (the right-click item, a test, a share link) gets the same vocabulary for free. */
    const asked = (ll.mode || ll.view || (ll.stand === true ? 'stand' : ll.stand === false ? 'dome' : ''));
    if (/^(stand|standing|first-person|firstPerson|ground)$/i.test(asked)) mode = 'stand';
    else if (/^(dome|all-sky|allsky|chart)$/i.test(asked)) mode = 'dome';
    if (!isFinite(ll.az) && isFinite(ll.bearing)) ll = Object.assign({}, ll, { az: ll.bearing });
    if (isFinite(ll.az)) lookAz = wrapAz(+ll.az);
    if (isFinite(ll.alt)) lookAlt = Math.max(-ALT_LIMIT, Math.min(ALT_LIMIT, +ll.alt));
    if (isFinite(ll.fov)) fovDeg = Math.max(FOV_MIN, Math.min(FOV_MAX, +ll.fov));
    applyChrome();
    syncControls(); draw();
    if (!raf) raf = requestAnimationFrame(tick);
    /* the catalogue and the horizon are both fetched; neither blocks the first frame */
    if (!stars) {
      try { stars = await SKY().load(); } catch (e) { starErr = (e && e.message) || String(e); }
      draw();
    }
    measureHorizon(site.lng, site.lat);
    return true;
  }
  function close() {
    open = false; playing = false;
    if (root) root.style.display = 'none';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    return true;
  }

  return {
    open: openAt, close, isOpen: () => open,
    setWhen(d) { const v = (d instanceof Date) ? +d : +new Date(d); if (!isFinite(v)) return false; live = false; playing = false; whenMs = v; syncControls(); draw(); return true; },
    setLive() { live = true; playing = false; syncControls(); draw(); return true; },
    play(on) { playing = (on == null ? !playing : !!on); if (playing) { live = false; if (whenMs == null) whenMs = mapClock(); lastTick = 0; } syncControls(); return playing; },
    setRate(r) { rate = +r || 3600; return rate; },
    /* (#R214) the standing view, by name, so Atlas and a test can drive it */
    setMode, mode: () => mode,
    look(o) {
      o = o || {};
      if (isFinite(o.az)) lookAz = wrapAz(+o.az);
      if (isFinite(o.alt)) lookAlt = Math.max(-ALT_LIMIT, Math.min(ALT_LIMIT, +o.alt));
      if (isFinite(o.fov)) fovDeg = Math.max(FOV_MIN, Math.min(FOV_MAX, +o.fov));
      syncControls(); draw();
      return { az: wrapAz(lookAz), alt: lookAlt, fov: fovDeg };
    },
    /* the astronomy, by name, so a test can hold it against published values rather than itself */
    altAz, project, elevAngleDeg, horizonAt, dirOf, viewBasis, projectVec,
    state: () => ({
      open, mode, look: { az: +wrapAz(lookAz).toFixed(2), alt: +lookAlt.toFixed(2), fov: +fovDeg.toFixed(2) },
      site: site ? { lng: site.lng, lat: site.lat, elevM: site.elevM, demZ: site.demZ, eyeM: site.elevM == null ? null : site.elevM + EYE_M } : null,
      live, playing, rate, when: new Date(nowMs()).toISOString(),
      stars: stars ? stars.n : 0, starError: starErr,
      horizon: horizon ? { samples: horizon.length, maxDeg: +Math.max.apply(null, Array.from(horizon)).toFixed(2), measured: true }
        : { samples: 0, measured: false, error: horizonErr, busy: horizonBusy },
      last: lastDraw ? { sunAlt: lastDraw.sunAlt, starsDrawn: lastDraw.starsDrawn, starsAboveHorizon: lastDraw.starsAboveHorizon,
        starsHiddenByTerrain: lastDraw.starsHiddenByTerrain, starsLostToDaylight: lastDraw.starsLostToDaylight, marks: lastDraw.marks.length } : null,
    }),
  };
})();
