/* ============================================================================
 *  IntMap · WHAT KIND OF EARTHQUAKE IS THIS, AND WHAT IS UNDER IT — window.IntMapEarth  (#R263)
 * ----------------------------------------------------------------------------
 *  「プレート境界型・スラブ内・活断層・安定大陸などを位置・深さ・メカニズム・全球プレートデータから
 *    自動判定し、地震動モデルへ反映する。」
 *
 *  Every "regional" constant in a stochastic ground-motion model is a statement about a TECTONIC
 *  SETTING. js/seismic.js carried exactly one setting — an active shallow crust with southern-
 *  California attenuation — and applied it from Tokyo to the Canadian Shield, so a craton earthquake
 *  and a megathrust were the same earthquake with different coordinates. This module answers the
 *  question the constants are really asking, from three shipped global datasets and nothing local:
 *
 *      data/crust1.bin.gz     CRUST1.0 (Laske et al. 2013) — 8 crustal layers + mantle, 1°
 *      data/slab2.bin.gz      Slab2 (Hayes et al. 2018) — subduction geometry, 0.05°
 *      data/tectonics.bin.gz  PB2002 (Bird 2003) — distance to the nearest plate boundary,
 *                             that boundary's class, and the orogen flag, 0.25°
 *
 *  ══ THE CLASSIFICATION ══════════════════════════════════════════════════════════════════════════
 *  The rule is Atkinson & Boore's (2003, BSSA 93(4)) own, which they state for exactly this purpose
 *  — «normal faulting mechanisms are always in-slab events; thrust mechanisms imply interface events
 *  for earthquakes at depths of less than 50 km on shallow dipping planes; thrust mechanisms are
 *  assumed to represent in-slab events if the events occur at depths greater than 50 km or on steeply
 *  dipping planes» — with the part they had to approximate by a depth threshold replaced by the thing
 *  the threshold stood in for. AB03 had no global slab geometry in 2003; Slab2 is that geometry, so
 *  «is it on the contact» is asked as «is it on the slab surface» and the 50 km cutoff is not needed.
 *
 *      slab under this point?  ──no──►  orogen, OR within ACTIVE_KM of a PB2002 boundary?
 *            │                              ├──yes──►  ACTIVE SHALLOW CRUSTAL
 *            │                              └──no───►  STABLE CONTINENTAL
 *            yes
 *            ├── |z − z_slab| ≤ INTERFACE_KM and z_slab in the seismogenic range  ►  INTERFACE
 *            ├── z  >  z_slab + INTERFACE_KM                                      ►  INTRASLAB
 *            └── z  <  z_slab − INTERFACE_KM   (the overriding plate)  ►  ACTIVE SHALLOW CRUSTAL
 *
 *  ⚠ THE LAST ARROW IS NOT A SHORTCUT. Crust sitting above an active subducting slab IS an active
 *  margin, whatever a plate-boundary LINE hundreds of kilometres away says — and without that arrow
 *  the model called Kobe 1995 a stable-continental earthquake, because the nearest PB2002 boundary is
 *  233 km down the Nankai Trough and Bird drew no orogen over Japan.
 *
 *  ⚠ THE MECHANISM IS USED WHEN THERE IS ONE, AND ONLY THEN. A drawn rupture has a strike and a dip
 *  (js/fault-geometry.js solves them from the outline), so a plane that disagrees with the slab's own
 *  strike and dip is not the interface however close it sits to it — AB03's «or on steeply dipping
 *  planes», with the slab's dip supplying what «steep» means at this trench instead of a constant.
 *  With no rupture drawn there is no mechanism to have, and geometry decides alone.
 *
 *  ══ WHAT THE ANSWER CHANGES, AND WHERE EACH NUMBER COMES FROM ═══════════════════════════════════
 *  ⚠ NOTHING HERE IS FITTED, AND NOTHING IS TUNED TO AN EVENT. Two complete published stochastic
 *  parameter sets are carried, each cited, each used whole:
 *
 *    ACTIVE SHALLOW CRUSTAL · SUBDUCTION INTERFACE — what js/seismic.js already used, unchanged:
 *      Δσ 3 MPa · κ 0.035 s (Anderson & Hough 1984) · Q = 180·f^0.45 (Raoof, Herrmann & Malagnini
 *      1999) · trilinear spreading R⁻¹ / R⁰ / R⁻⁰·⁵ with crossovers 70 and 130 km
 *      (Atkinson & Boore 1995).
 *    STABLE CONTINENTAL — Atkinson & Boore (2006, BSSA 96(6)) Table 1, the ENA model, whole:
 *      Δσ 140 bars = 14 MPa · κ 0.005 s · Q = 893·f^0.32 with a floor of 1000 (Atkinson 2004) ·
 *      spreading R⁻¹·³ (0-70 km) / R⁺⁰·² (70-140 km) / R⁻⁰·⁵ (>140 km).
 *
 *  ⚠ THE CROSSOVERS FOLLOW THE LOCAL MOHO, because that is what they are. Both published pairs are
 *  the post-critical Moho reflection appearing and then giving way to surface waves, and both were
 *  measured over crust of a known thickness (≈35 km western North America, ≈40 km eastern). CRUST1.0
 *  gives the real Moho depth at the source, so the pair is scaled by H/H_ref — which reproduces each
 *  published pair EXACTLY at its own reference thickness and generalises to a 70 km Tibetan crust or
 *  a 10 km oceanic one instead of asserting 70 km everywhere.
 *  ⚠ AND AN INTRASLAB EVENT IS BELOW THE CRUST, so it has no Moho bounce to have: the flat branch is
 *  the crustal wave-guide, and a source under the Moho is not in it. There the direct wave spreads as
 *  R⁻¹ until the surface-wave branch takes over. That is geometry, not a coefficient.
 *  ⚠ WHAT IS **NOT** CLAIMED: this model does NOT give intraslab events their own stress drop. They
 *  are observed to be higher than interface events, but there is no single published global figure
 *  this project is willing to write down, and inventing one to make a particular earthquake come out
 *  right is the thing the standing instructions forbid. The panel states the omission.
 *
 *  ⚠ ONE LOOKUP PER EVENT, NOT PER CELL. The regime is a property of the SOURCE, so it is asked once
 *  when the hypocentre moves. The crustal PROFILE is a property of the SITE and is asked per cell —
 *  that one is 1° and js/seismic-site.js says so.
 * ==========================================================================*/
window.IntMapEarth = (function () {
  'use strict';

  const D = Math.PI / 180;

  /* ── the published parameter sets ────────────────────────────────────────────────────────────*/
  const ACTIVE = {
    stressDropMPa: 3.0, kappaS: 0.035, q0: 180, qEta: 0.45, qFloor: 0,
    b: [-1.0, 0.0, -0.5], r1: 70, r2: 130, mohoRefKm: 35,
    cite: 'Atkinson & Boore (1995) trilinear spreading; Raoof, Herrmann & Malagnini (1999) Q; Anderson & Hough (1984) κ'
  };
  const STABLE = {
    stressDropMPa: 14.0, kappaS: 0.005, q0: 893, qEta: 0.32, qFloor: 1000,
    b: [-1.3, 0.2, -0.5], r1: 70, r2: 140, mohoRefKm: 40,
    cite: 'Atkinson & Boore (2006) Table 1 — the eastern North America stochastic model, used whole'
  };
  const REGIMES = {
    'active-crustal': Object.assign({ id: 'active-crustal' }, ACTIVE),
    interface: Object.assign({ id: 'interface' }, ACTIVE),
    intraslab: Object.assign({ id: 'intraslab' }, ACTIVE),
    'stable-continental': Object.assign({ id: 'stable-continental' }, STABLE)
  };

  /* ⚠⚠ THE THRESHOLDS THAT ARE **NOT** PUBLISHED CONSTANTS, SAID OUT LOUD — this is the weakest
     link in the chain and it is not going to be hidden in the middle of a function.
     · INTERFACE_KM — how far off the Slab2 surface an event may sit and still be «on» it. Slab2
       publishes a per-node depth uncertainty of this order over most of the model, so a tighter
       window asserts more than the geometry knows and a wider one swallows the shallow slab.
       ⚠ Within this window and BELOW the surface, geometry alone genuinely cannot separate a
       megathrust from a shallow in-slab event — that is what a mechanism is for (below), and where
       there is no mechanism the answer is flagged `ambiguous` rather than quietly asserted.
     · ACTIVE_KM — how near a PB2002 boundary LINE counts as active crust.
       ⚠ THE FIRST VALUE TRIED HERE WAS 100 km AND IT WAS WRONG, in a way worth recording. It put
       KOBE 1995 and CHRISTCHURCH 2011 — two of the most-studied active-shallow-crustal earthquakes
       there are — in STABLE CONTINENTAL, which would have given them a 14 MPa stress drop and ENA
       attenuation. Bird draws a boundary as a line and the crust it deforms is a zone, and measuring
       his own model says how wide: inside the PB2002 OROGENS, where he could resolve the zone and
       drew it as an area, the MEDIAN distance to the nearest drawn boundary line is 352 km (p90
       1,024 km, measured over the 62,106 orogen cells of data/tectonics.bin.gz). 150 km is well
       inside that, and it takes the share of the globe called active from 15.5 % to 18.6 % against
       the 7.45 % the orogen polygons cover on their own.
       ⚠ IT IS STILL A THRESHOLD THIS PROJECT CHOSE, not one anybody published, and it is the one
       assumption in this file with no citation. A purpose-built seismotectonic regionalisation — or
       GEM's Global Active Faults Database, which is CC-BY-SA and therefore a licensing decision for
       the repository rather than for this file — would replace it with mapped data.
     All three are exposed in `state()` and printed by the panel. */
  const INTERFACE_KM = 20;
  const ACTIVE_KM = 150;
  const SEISMOGENIC_MAX_KM = 70;      /* below this the slab surface is no longer a megathrust */

  /* ── loading ─────────────────────────────────────────────────────────────────────────────────*/
  let crust = null, slab = null, tec = null;
  let loading = null, failed = null, ms = 0;

  const url = (f) => { try { return new URL(f, document.baseURI).toString(); } catch (_) { return f; } };
  async function gunzip(f) {
    const r = await fetch(url(f));
    if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
    return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  async function json(f) {
    const r = await fetch(url(f));
    if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
    return r.json();
  }

  function warm() {
    if (crust && slab && tec) return Promise.resolve(true);
    if (loading) return loading;
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    loading = Promise.all([
      Promise.all([json('data/crust1.json'), gunzip('data/crust1.bin.gz')])
        .then(([m, b]) => { crust = mountCrust(m, b); }).catch((e) => { failed = 'crust1: ' + (e && e.message || e); }),
      Promise.all([json('data/slab2.json'), gunzip('data/slab2.bin.gz')])
        .then(([m, b]) => { slab = mountSlab(m, b); }).catch((e) => { failed = 'slab2: ' + (e && e.message || e); }),
      Promise.all([json('data/tectonics.json'), gunzip('data/tectonics.bin.gz')])
        .then(([m, b]) => { tec = mountTec(m, b); }).catch((e) => { failed = 'tectonics: ' + (e && e.message || e); })
    ]).then(() => {
      ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0);
      loading = null;
      return !!(crust && slab && tec);
    });
    return loading;
  }

  /* ── CRUST1.0 ────────────────────────────────────────────────────────────────────────────────*/
  function mountCrust(m, buf) {
    const NL = m.nlayers, NX = m.nlon, NY = m.nlat, N = NX * NY;
    const bnds = new Int16Array(buf, 0, N * NL);
    const vs = new Uint8Array(buf, N * NL * 2, N * NL);
    const rho = new Uint8Array(buf, N * NL * 3, N * NL);
    const bS = m.planes[0].scale, vS = m.planes[1].scale, rS = m.planes[2].scale;
    return { NL, NX, NY, bnds, vs, rho, bS, vS, rS, manifest: m };
  }
  /* CRUST1.0's cells are CENTRED on the half degree (89.5 N … −89.5 N), so the index is a floor of
     the offset grid rather than of the coordinate — the readme is explicit about it and getting it
     wrong shifts the whole model by half a cell, which is 55 km. */
  function crustAt(lng, lat) {
    if (!crust) return null;
    let lo = +lng; if (!isFinite(lo)) return null;
    lo = ((lo + 180) % 360 + 360) % 360 - 180;
    const la = Math.max(-90, Math.min(90, +lat || 0));
    let i = Math.floor(lo + 180); if (i < 0) i = 0; else if (i >= crust.NX) i = crust.NX - 1;
    let j = Math.floor(90 - la); if (j < 0) j = 0; else if (j >= crust.NY) j = crust.NY - 1;
    const o = (j * crust.NX + i) * crust.NL;
    const bottomKm = new Array(crust.NL), vsKms = new Array(crust.NL), rhoGcc = new Array(crust.NL);
    for (let l = 0; l < crust.NL; l++) {
      bottomKm[l] = crust.bnds[o + l] * crust.bS;
      vsKms[l] = crust.vs[o + l] * crust.vS;
      rhoGcc[l] = crust.rho[o + l] * crust.rS;
    }
    const surfaceKm = bottomKm[0];
    /* layer 2 is ice, layer 5 is the bottom of the lowest sediment, layer 8 is the Moho */
    const sedimentKm = Math.max(0, bottomKm[2] - bottomKm[5]);
    const waterKm = Math.max(0, bottomKm[0] - bottomKm[1]);
    const mohoKm = surfaceKm - bottomKm[8];
    return { surfaceKm, bottomKm, vsKms, rhoGcc, sedimentKm, waterKm, mohoKm,
      oceanic: waterKm > 0.5 && mohoKm < 20 };
  }

  /* ⚠ THE PER-CELL ONE. `crustAt` builds three 9-element arrays, which is the right shape for the
     handful of profiles js/seismic-site.js needs and the wrong shape for the two million cells the
     intensity field walks — that would be six million arrays per repaint. This returns the one
     number the field asks for, out of the same raster, with no allocation at all. */
  function sedimentAt(lng, lat) {
    if (!crust) return 0;
    let lo = +lng; if (!isFinite(lo)) return 0;
    lo = ((lo + 180) % 360 + 360) % 360 - 180;
    const la = Math.max(-90, Math.min(90, +lat || 0));
    let i = Math.floor(lo + 180); if (i < 0) i = 0; else if (i >= crust.NX) i = crust.NX - 1;
    let j = Math.floor(90 - la); if (j < 0) j = 0; else if (j >= crust.NY) j = crust.NY - 1;
    const o = (j * crust.NX + i) * crust.NL;
    return Math.max(0, (crust.bnds[o + 2] - crust.bnds[o + 5]) * crust.bS);
  }

  /* ── Slab2 ───────────────────────────────────────────────────────────────────────────────────*/
  function mountSlab(m, buf) {
    const regions = m.regions.map((r) => {
      const rows = new Uint16Array(buf, r.offset, r.ny * 2);
      let span = 0;
      const rowCell = new Int32Array(r.ny);
      for (let j = 0; j < r.ny; j++) { rowCell[j] = span; span += rows[j * 2 + 1]; }
      /* ⚠ THE DEPTH PLANE IS FIRST BECAUSE IT IS THE Int16 ONE. `new Int16Array(buf, off, n)` throws
         unless `off` is even, and `span` is whatever the slab's shape made it; putting the Int16
         plane straight after the 4-byte row headers is what keeps every mount aligned. The build
         pads each region body to a multiple of four for the same reason (scripts/build-slab2.mjs). */
      const base = r.offset + r.ny * 4;
      return Object.assign({}, r, { rows, rowCell, span,
        dep: new Int16Array(buf, base, span),
        mask: new Uint8Array(buf, base + span * 2, span),
        dip: new Uint8Array(buf, base + span * 3, span),
        str: new Uint8Array(buf, base + span * 4, span) });
    });
    return { regions, depScale: 20, depOff: 5, manifest: m };
  }
  function slabNode(r, jx, jy, S) {
    if (jx < 0 || jy < 0 || jx >= r.nx || jy >= r.ny) return null;
    const x0 = r.rows[jy * 2], len = r.rows[jy * 2 + 1];
    if (!len || jx < x0 || jx >= x0 + len) return null;
    const c0 = r.rowCell[jy], t = jx - x0;
    if (!r.mask[c0 + t]) return null;
    let cnt = 0;
    for (let k = 0; k <= t; k++) cnt += r.dep[c0 + k];
    return { depthKm: cnt / S.depScale - S.depOff,
      dipDeg: r.dip[c0 + t] ? r.dip[c0 + t] - 1 : null,
      strikeDeg: r.str[c0 + t] ? (r.str[c0 + t] - 1) * 2 : null };
  }
  /* ⚠ SLAB2 KEEPS ITS OWN LONGITUDE CONVENTION per region (0…360 around the Pacific), so the query
     is tried in both — see scripts/build-slab2.mjs. Bilinear over the four surrounding nodes; a
     query with any corner missing falls back to the nearest node so the edge of a slab is a nearest-
     neighbour edge rather than a hole. */
  function slabAt(lng, lat) {
    if (!slab) return null;
    const la = +lat;
    let best = null;
    for (const r of slab.regions) {
      for (const lo of [((+lng + 180) % 360 + 360) % 360 - 180, ((+lng % 360) + 360) % 360]) {
        const fx = (lo - r.lon0) / r.d, fy = (la - r.lat0) / r.d;
        if (!(fx >= 0 && fy >= 0 && fx <= r.nx - 1 && fy <= r.ny - 1)) continue;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        let sum = 0, w = 0, dip = 0, sx = 0, sy = 0, near = null, nearW = -1;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          const nd = slabNode(r, ix + a, iy + b, slab); if (!nd) continue;
          const ww = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
          sum += ww * nd.depthKm; w += ww;
          if (nd.dipDeg != null) dip += ww * nd.dipDeg;
          if (nd.strikeDeg != null) { sx += ww * Math.cos(nd.strikeDeg * D); sy += ww * Math.sin(nd.strikeDeg * D); }
          if (ww > nearW) { nearW = ww; near = nd; }
        }
        if (!(w > 0)) continue;
        const cand = { region: r.code, depthKm: sum / w,
          dipDeg: w > 0.999 ? dip / w : (near ? near.dipDeg : null),
          strikeDeg: (w > 0.999 && (sx || sy)) ? ((Math.atan2(sy, sx) / D) + 360) % 360 : (near ? near.strikeDeg : null),
          complete: w > 0.999 };
        /* several Slab2 rectangles overlap (Ryukyu/Izu/Kuril round Japan); the shallowest surface is
           the one an event near the trench belongs to */
        if (!best || cand.depthKm < best.depthKm) best = cand;
      }
    }
    return best;
  }

  /* ── PB2002 ──────────────────────────────────────────────────────────────────────────────────*/
  function mountTec(m, buf) {
    const W = m.width, H = m.height, N = W * H;
    return { W, H, dist: new Uint8Array(buf, 0, N), cls: new Uint8Array(buf, N, N),
      oro: new Uint8Array(buf, 2 * N, N),
      names: (m.planes[1].encoding || '').split(' ').map((s) => s.split('=')[1] || ''), manifest: m };
  }
  function tectonicAt(lng, lat) {
    if (!tec) return null;
    let lo = +lng; if (!isFinite(lo)) return null;
    lo = ((lo + 180) % 360 + 360) % 360 - 180;
    const la = Math.max(-90, Math.min(90, +lat || 0));
    let i = Math.floor((lo + 180) / 360 * tec.W); if (i < 0) i = 0; else if (i >= tec.W) i = tec.W - 1;
    let j = Math.floor((90 - la) / 180 * tec.H); if (j < 0) j = 0; else if (j >= tec.H) j = tec.H - 1;
    const k = j * tec.W + i, v = tec.dist[k];
    return { distKm: (v / 4) * (v / 4), stepClass: tec.names[tec.cls[k]] || 'none',
      classCode: tec.cls[k], orogen: !!tec.oro[k] };
  }

  /* ── the classification ──────────────────────────────────────────────────────────────────────*/
  /* how far apart two strikes are, as an angle in [0, 90] — a fault plane and its auxiliary read the
     same to a strike comparison, so 180° apart is the same plane, not the opposite one */
  const strikeGap = (a, b) => { let d = Math.abs(((a - b) % 180 + 180) % 180); return d > 90 ? 180 - d : d; };

  function regimeAt(ev) {
    const lng = +(ev && ev.lng), lat = +(ev && ev.lat);
    const z = Math.max(0, +(ev && ev.depthKm) || 0);
    const out = { lng, lat, depthKm: z, why: [] };
    const t = tectonicAt(lng, lat);
    const c = crustAt(lng, lat);
    const s = slabAt(lng, lat);
    out.tectonic = t; out.crust = c; out.slab = s;

    let id = null;
    if (s && isFinite(s.depthKm)) {
      const dz = z - s.depthKm;
      out.slabOffsetKm = dz;
      /* the mechanism test, when there is a mechanism: a plane that does not lie along the slab is
         not the interface, however close it is to it (Atkinson & Boore 2003) */
      let planeAgrees = true, planeWhy = 'no rupture drawn — geometry alone';
      if (isFinite(ev && ev.strikeDeg) && s.strikeDeg != null) {
        const gap = strikeGap(ev.strikeDeg, s.strikeDeg);
        planeAgrees = gap <= 40;
        planeWhy = 'strike ' + Math.round(ev.strikeDeg) + '° vs slab ' + Math.round(s.strikeDeg)
          + '° — ' + Math.round(gap) + '° apart';
      }
      if (isFinite(ev && ev.dipDeg) && s.dipDeg != null && planeAgrees) {
        const gap = Math.abs(ev.dipDeg - s.dipDeg);
        planeAgrees = gap <= 30;
        planeWhy += ' · dip ' + Math.round(ev.dipDeg) + '° vs slab ' + Math.round(s.dipDeg) + '°';
      }
      out.planeAgrees = planeAgrees; out.planeWhy = planeWhy;
      if (Math.abs(dz) <= INTERFACE_KM && s.depthKm <= SEISMOGENIC_MAX_KM && planeAgrees) {
        id = 'interface';
        out.why.push('on the Slab2 surface (' + s.depthKm.toFixed(0) + ' km) to within ' + Math.abs(dz).toFixed(0) + ' km');
      } else if (dz > INTERFACE_KM) {
        id = 'intraslab';
        out.why.push(dz.toFixed(0) + ' km below the Slab2 surface');
      } else if (Math.abs(dz) <= INTERFACE_KM && !planeAgrees) {
        id = 'intraslab';
        out.why.push('on the slab but the drawn plane does not lie along it (' + planeWhy + ')');
      } else {
        /* the overriding plate above a live slab — active crust by construction, see the ⚠ in the
           header. `aboveSlab` short-circuits the plate-boundary test below rather than repeating it. */
        id = 'active-crustal';
        out.aboveSlab = true;
        out.why.push('in the overriding plate, ' + Math.abs(dz).toFixed(0)
          + ' km above the Slab2 surface — an active margin');
      }
      /* an event inside the window but BELOW the surface, with no mechanism to separate the two
         readings, is a genuine tie. Say so; do not let the panel present a coin toss as a finding. */
      if (id === 'interface' && dz > 0 && !isFinite(ev && ev.strikeDeg)) {
        out.ambiguous = true;
        out.why.push('within Slab2\'s own depth uncertainty, so an in-slab reading is not excluded — '
          + 'draw the rupture to supply a mechanism');
      }
    }
    if (!id) {
      if (t && (t.orogen || t.distKm <= ACTIVE_KM)) {
        id = 'active-crustal';
        out.why.push(t.orogen ? 'inside a PB2002 orogen'
          : (t.distKm.toFixed(0) + ' km from a PB2002 ' + t.stepClass + ' boundary'));
      } else {
        id = 'stable-continental';
        out.why.push(t ? (t.distKm.toFixed(0) + ' km from the nearest plate boundary, outside every orogen')
          : 'no plate-boundary data loaded');
      }
    }
    out.id = id;
    out.params = paramsFor(id, c, z);
    return out;
  }

  /* the parameter set, with the spreading crossovers moved onto the local Moho — see the ⚠ block */
  function paramsFor(id, c, depthKm) {
    const base = REGIMES[id] || REGIMES['active-crustal'];
    const moho = (c && c.mohoKm > 5 && c.mohoKm < 90) ? c.mohoKm : base.mohoRefKm;
    const k = moho / base.mohoRefKm;
    const p = { id: base.id, stressDropMPa: base.stressDropMPa, kappaS: base.kappaS,
      q0: base.q0, qEta: base.qEta, qFloor: base.qFloor,
      b: base.b.slice(), r1: base.r1 * k, r2: base.r2 * k,
      mohoKm: moho, mohoRefKm: base.mohoRefKm, cite: base.cite, belowMoho: false };
    /* a source under the Moho is not inside the crustal wave-guide, so there is no post-critical
       reflection branch for it: the direct wave decays as R⁻¹ until surface waves take over */
    if (depthKm > moho + 5) {
      p.belowMoho = true;
      p.b = [base.b[0], base.b[0], base.b[2]];
      p.r1 = p.r2;
    }
    return p;
  }

  /* the trilinear geometrical spreading these parameters describe, as a factor (1 at 1 km) —
     js/seismic.js's `spread()` generalised to arbitrary exponents and crossovers. */
  function spreadOf(p, rKm) {
    const r = Math.max(1, rKm), r1 = Math.max(2, p.r1), r2 = Math.max(r1 + 1, p.r2);
    const g1 = Math.pow(r1, p.b[0]);
    if (r <= r1) return Math.pow(r, p.b[0]);
    const g2 = g1 * Math.pow(r2 / r1, p.b[1]);
    if (r <= r2) return g1 * Math.pow(r / r1, p.b[1]);
    return g2 * Math.pow(r / r2, p.b[2]);
  }

  return { warm, ready: () => !!(crust && slab && tec),
    crustAt, sedimentAt, slabAt, tectonicAt, regimeAt, paramsFor, spreadOf, REGIMES,
    INTERFACE_KM, ACTIVE_KM, SEISMOGENIC_MAX_KM,
    state: () => ({ ready: !!(crust && slab && tec), failed, loadMs: ms,
      crust: !!crust, slab: !!slab, tectonics: !!tec,
      slabRegions: slab ? slab.regions.length : 0,
      interfaceKm: INTERFACE_KM, activeKm: ACTIVE_KM, seismogenicMaxKm: SEISMOGENIC_MAX_KM,
      sources: { crust1: crust && crust.manifest.source, slab2: slab && slab.manifest.source,
        tectonics: tec && tec.manifest.source } }) };
})();
