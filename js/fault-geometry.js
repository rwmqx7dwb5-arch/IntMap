/* ============================================================================
 *  IntMap · A DRAWN OUTLINE IS A SURFACE PROJECTION — window.IntMapFaultGeom  (#R224)
 * ----------------------------------------------------------------------------
 *  「震源域を自由描画した場合、それをそのまま断層面積にせず地表投影として扱い、規模・形状から最も典型的な
 *    傾斜角・断層幅・深さを自動推定して3D断層面積と平均すべり量が現実的になるよう修正してください。
 *    通常は自動推定だけで自然な結果を出しつつ、詳細設定では dip・上端/下端深さ・断層幅などを手動上書きでき、
 *    Mw・M0・断層面積・平均すべり量が一貫して再計算されるようにしてください。」
 *
 *  ══ WHAT WAS WRONG ══════════════════════════════════════════════════════════════════════════════
 *  #R189 took the drawn loop's area straight into M₀ = μ·A·D̄. But you cannot draw a fault plane on a
 *  map — you can only draw its SHADOW. A fault dipping at δ has a map footprint of A·cos δ, so the
 *  drawn area is smaller than the fault by 1/cos δ, and for anything steeper than about 45° it is
 *  smaller by a lot: the 2024 Noto rupture is ~150 × 30 km on a fault dipping ~50°, whose footprint
 *  is 150 × 19 km. Feeding the shadow in as the plane understates M₀ by that same factor, and — worse
 *  — the model then had no fault WIDTH and no DEPTH EXTENT at all, so a 600 km ribbon and a 600 km
 *  square were the same object to it.
 *
 *  ══ THE THREE NUMBERS ARE NOT INVENTED — THEY ARE ELIMINATED FROM PUBLISHED RELATIONS ════════════
 *  ① THE TYPICAL WIDTH FOR THIS LENGTH. Wells & Coppersmith (1994), all slip types:
 *        log₁₀ L = −2.44 + 0.59·M      log₁₀ W = −1.01 + 0.32·M
 *     Eliminating M between them removes the magnitude — which we do not know yet, because it is what
 *     we are computing — and leaves a pure length→width statement:
 *        W_typ = 10^(0.3134) · L^0.5424 = 2.058 · L^0.5424     (km)
 *     150 km → 32 km (Noto's fault is ~30 km wide); 30 km → 13 km; 500 km → 62 km.
 *  ② THE DIP IS WHATEVER MAKES THE DRAWING CONSISTENT WITH ①. The footprint's across-strike width is
 *     W_proj = W·cos δ, so cos δ = W_proj / W_typ. A long thin ribbon ⇒ δ → vertical (strike-slip); a
 *     broad rectangle ⇒ δ → shallow (a megathrust). Nothing about faulting STYLE is assumed; the
 *     shape of the drawing decides, which is 「規模・形状から」.
 *     ⚠ CLAMPED TO [10°, 89°], and the clamp is load-bearing at BOTH ends. Below ~10° no real
 *     seismogenic interface is known; and W_proj > W_typ (someone drawing a genuine megathrust, which
 *     is far wider than W&C — that relation is not calibrated past M8) then falls on the floor and
 *     gives W ≈ W_proj, which is the right answer for exactly that case.
 *  ③ THE SLIP COMES FROM THE STRESS DROP THE PANEL ALREADY HAS. Δσ is not a new parameter invented
 *     here — it is the same 3 MPa that drives the Brune source spectrum this simulator's shaking is
 *     computed from, so the slip and the ground motion can no longer disagree. For a crack of
 *     equivalent radius a = √(A/π), Eshelby's circular-crack result gives
 *        D̄ = 16·Δσ·a / (7π·μ)
 *     which behaves correctly across the whole range where a long-fault formula does not: Noto
 *     (A₃D ≈ 4,500 km², Δσ = 3 MPa) → 2.5 m against a published mean of 2–4 m, and a 100,000 km²
 *     megathrust → 11.8 m against Tohoku's ~10 m. A Wells & Coppersmith area→M inversion was tried
 *     first and is NOT used: it gives 38 m for that same megathrust, because its A–M line saturates
 *     above M8 and this is precisely where a reader draws the biggest outlines.
 *
 *  ══ AND THEN EVERYTHING IS ONE CHAIN ════════════════════════════════════════════════════════════
 *        A₃D = A_proj / cos δ        (identically L · W)
 *        M₀  = μ · A₃D · D̄           Mw = (log₁₀ M₀ − 9.1) / 1.5      (Hanks & Kanamori)
 *        vertical extent = W · sin δ, hung about the focal depth
 *  so a manual override anywhere re-enters the SAME chain rather than a parallel one — which is what
 *  「一貫して再計算」 has to mean. Every override records itself, and `auto` says which of the five
 *  numbers the reader is still letting the model choose.
 *
 *  ⚠ PURE ARITHMETIC — no DOM, no renderer, no app state. That is what lets tests/r224-checks verify
 *  it in Node against published earthquakes instead of against a screenshot.
 * ==========================================================================*/
window.IntMapFaultGeom = (function () {
  'use strict';

  const D = Math.PI / 180;
  const DIP_MIN = 10, DIP_MAX = 89;
  /* Wells & Coppersmith (1994) with M eliminated — see ① above */
  const WC_A = 2.058, WC_B = 0.5424;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ── THE FOOTPRINT: the drawn ring measured as a rectangle on the ground ────────────────────────
     `areaKm2` is passed in rather than recomputed, because the app already has ONE spherical-excess
     area function (HOST.ringArea) and a second opinion about the size of the same polygon is exactly
     the kind of drift this project keeps writing down. What is measured HERE is only the STRIKE and
     the length along it: the ring is projected to local kilometres about its own centroid and the
     bearing that minimises the bounding box is taken as the strike. The across-strike width is then
     A/L rather than the box's own side, so the rectangle has the AREA THAT WAS DRAWN — a hand-drawn
     ellipse would otherwise be inflated by 4/π before any of the physics ran. */
  function footprint(ring, areaKm2) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    let cx = 0, cy = 0;
    for (const p of ring) { cx += +p[0]; cy += +p[1]; }
    cx /= ring.length; cy /= ring.length;
    const kx = 111.320 * Math.cos(cy * D), ky = 110.574;
    const pts = ring.map((p) => {
      let dl = +p[0] - cx; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
      return [dl * kx, (+p[1] - cy) * ky];
    });
    let best = null;
    for (let a = 0; a < 180; a += 1) {
      const c = Math.cos(a * D), s = Math.sin(a * D);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) {
        const x = q[0] * c + q[1] * s, y = -q[0] * s + q[1] * c;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const w = x1 - x0, h = y1 - y0, area = w * h;
      if (!best || area < best.area) best = { area, w, h, a };
    }
    /* the LONG side is the strike; `a` rotates the +x axis, so the strike bearing is measured from
       north the way every other bearing in this app is */
    const along = Math.max(best.w, best.h), across = Math.min(best.w, best.h);
    const strike = ((best.w >= best.h ? (90 - best.a) : (180 - best.a)) % 360 + 360) % 360;
    const A = (areaKm2 > 0) ? areaKm2 : (along * across);
    const L = Math.max(0.5, along);
    return { lengthKm: L, widthProjKm: Math.max(0.1, A / L), boxAcrossKm: across,
             areaProjKm2: A, strikeDeg: strike, centroid: [cx, cy] };
  }

  const typicalWidthKm = (L) => WC_A * Math.pow(Math.max(0.5, L), WC_B);

  /* ── THE SOLVE ─────────────────────────────────────────────────────────────────────────────────
     `over` may carry any of dip / widthKm / zTopKm / zBotKm / slipM. Which ones are present is the
     whole difference between 「通常は自動推定だけ」 and 「詳細設定では手動上書き」, and the returned
     `auto` map says, per quantity, which one answered.
     ⚠ THE ORDER BELOW IS THE DEPENDENCY ORDER, and it is why an override never needs a special case:
     dip → width → depths → area → slip → M₀ → Mw. A reader who types a bottom depth is choosing the
     width (through the dip), and a reader who types a width is choosing the bottom depth; both fall
     out of running the same chain with one more thing pinned. */
  function solve(inp) {
    inp = inp || {};
    const fp = inp.footprint || {};
    const L = Math.max(0.5, +fp.lengthKm || 1);
    const Wproj = Math.max(0.1, +fp.widthProjKm || 1);
    const Aproj = Math.max(0.01, +fp.areaProjKm2 || (L * Wproj));
    const mu = +inp.muPa > 0 ? +inp.muPa : 3.3075e10;
    const dSigma = (+inp.stressDropMPa > 0 ? +inp.stressDropMPa : 3) * 1e6;
    const focal = Math.max(0, +inp.depthKm || 0);
    const over = inp.override || {};
    const auto = { dip: true, width: true, depth: true, slip: true };

    /* ① dip */
    const Wtyp = typicalWidthKm(L);
    let dip;
    if (over.dip != null && isFinite(over.dip)) { dip = clamp(+over.dip, 1, 90); auto.dip = false; }
    else dip = clamp(Math.acos(clamp(Wproj / Wtyp, Math.cos(DIP_MAX * D), Math.cos(DIP_MIN * D))) / D, DIP_MIN, DIP_MAX);
    const cosd = Math.max(1e-3, Math.cos(dip * D)), sind = Math.sin(dip * D);

    /* ② down-dip width. An explicit width wins; a pinned pair of depths states one; otherwise the
       footprint and the dip give it. */
    let W;
    if (over.widthKm != null && isFinite(over.widthKm) && +over.widthKm > 0) { W = +over.widthKm; auto.width = false; }
    else if (over.zTopKm != null && over.zBotKm != null && isFinite(over.zTopKm) && isFinite(over.zBotKm)
             && (+over.zBotKm - +over.zTopKm) > 0 && sind > 1e-3) {
      W = (+over.zBotKm - +over.zTopKm) / sind; auto.width = false; auto.depth = false;
    } else W = Wproj / cosd;
    W = clamp(W, 0.5, 1500);

    /* ③ where it hangs. Centred on the focal depth unless a top was given, and never above ground. */
    const vert = W * sind;
    let zTop;
    if (over.zTopKm != null && isFinite(over.zTopKm)) { zTop = Math.max(0, +over.zTopKm); auto.depth = false; }
    else zTop = Math.max(0, focal - vert / 2);
    const zBot = zTop + vert;

    /* ④ the plane, and its shadow — reported together so the panel can show BOTH numbers rather than
       leaving the reader to wonder which one 「断層面積」 means. */
    const areaKm2 = L * W;
    const areaProjKm2 = auto.width && auto.dip ? Aproj : (L * W * cosd);

    /* ⑤ slip, ⑥ moment, ⑦ magnitude */
    let slipM;
    if (over.slipM != null && isFinite(over.slipM) && +over.slipM > 0) { slipM = +over.slipM; auto.slip = false; }
    else {
      const a = Math.sqrt((areaKm2 * 1e6) / Math.PI);          /* equivalent crack radius, m */
      slipM = 16 * dSigma * a / (7 * Math.PI * mu);
    }
    slipM = clamp(slipM, 0.01, 80);
    const M0 = mu * (areaKm2 * 1e6) * slipM;
    const mw = (Math.log10(M0) - 9.1) / 1.5;

    return { lengthKm: L, widthProjKm: Wproj, widthKm: W, typicalWidthKm: Wtyp,
             dipDeg: dip, strikeDeg: fp.strikeDeg,
             zTopKm: zTop, zBotKm: zBot, verticalKm: vert,
             areaKm2, areaProjKm2, slipM, M0, mw, auto };
  }

  return { footprint, solve, typicalWidthKm, DIP_MIN, DIP_MAX };
})();
