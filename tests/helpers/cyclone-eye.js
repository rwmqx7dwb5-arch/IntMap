/* ============================================================================
 *  IntMap · FINDING THE EYE OF A CYCLONE IN A WIND FIELD  (#R460)
 * ----------------------------------------------------------------------------
 *  Pure functions over a square lattice of wind speeds — no browser, no network.
 *  tests/prod-smoke.spec.js reads the lattice off the LIVE field and this file decides which of
 *  its points is the eye, so that tests/r460-checks.test.mjs can put THE SAME DECISION through
 *  the fields the live page cannot be made to show: a storm over land with calmer air inland, an
 *  eyewall whose ring has a gap, a box with no enclosed calm in it at all. The same division of
 *  labour tests/helpers/wind-ramp.js has for the colour verdicts (#R287), for the same reason —
 *  a decision that only ever runs inside a browser against a healthy site is a decision nobody
 *  has watched fail.
 *
 *  ══ ⚠⚠⚠ WHAT "THE EYE" HAS TO MEAN, AND WHY 「THE FIRST CALM POINT」 IS NOT IT ═══════════════
 *  The finder sweeps the tropics for the strongest wind on the planet and then looks inside a
 *  ±1.5° box around it. Until #R460 it took THE FIRST point of that box, scanned from the
 *  south-west corner on a 0.1° lattice, whose speed was at most 0.6 × peak — and stopped there.
 *  That is an answer about the order of two `for` loops, not about the atmosphere: MEASURED over
 *  the 145 forecast hours production was serving on 2026-08-25, 92 of the 99 hours that had an
 *  eye at all returned EXACTLY `peak.la - 1.5, peak.lo - 1.5`, the corner the scan starts at,
 *  because a median 38 % of the box — up to 90 % of it — is below that line. The median distance
 *  from the strongest wind was 222 km. The storm was not in the picture.
 *
 *  ⚠ AND THE MINIMUM OF THE BOX IS NOT IT EITHER. It is the obvious repair and it is right most
 *  of the time — MEASURED, it agrees with the rule below in 84 % of those hours — but it asks
 *  「where is the calmest air near the strongest wind」, which is a different question from
 *  「where is the eye」. When the storm reaches land the calmest air in the box is INLAND, behind
 *  the terrain, not in the eye: at 2026-08-27T23:00Z the peak was 34.22 m/s on the Zhejiang coast
 *  and the box minimum was 3.41 m/s at 26.0°N 119.5°E — 223 km away, over the hills, the same
 *  defect one milder step over. 13 of 99 hours put it more than 120 km from the peak.
 *
 *  So the rule is the test's own title, carried out: 「a calm eye INSIDE A RING of strong wind」.
 *  For every point, ask how high the wind has to rise before you can walk out of the box from it:
 *      wall(p) = the lowest, over all paths from p to the edge of the box, of the highest speed
 *                on that path                                    (a minimax path — Dijkstra's,
 *                                                                 with max-along-the-path as the
 *                                                                 cost, flooded in from the edge)
 *  and the eye is the calm point that ring encloses most deeply:
 *      prominence(p) = wall(p) - speed(p)          ← the eye is the point that maximises it
 *
 *  This is topographic prominence, upside down, and it needs NO NEW CONSTANT. It also states the
 *  old defect exactly: a point ON the edge of the box can be left without the wind rising at all,
 *  so its prominence is 0 by construction — and the south-west corner is on the edge of the box.
 *  MEASURED at 2026-08-25T02:00Z (peak 41.04 m/s at 26.5°N 131.0°E):
 *      as found (#R276)   25.0°N 129.5°E   17.13 m/s   wall 17.13   prominence  0.00   223 km
 *      this rule          26.1°N 130.8°E    6.66 m/s   wall 24.14   prominence 17.48    49 km
 *  ⚠ THE RING IS NOT A THRESHOLD. An earlier version of this file asked for a connected region of
 *  「below 0.6 × peak」 that does not touch the edge, and MEASURING KILLED IT: at that very hour
 *  0.6 × peak is 24.62 m/s, the eyewall dips below that in one sector, the eye's calm leaks out
 *  to the edge through the gap — and the rule then picked a two-cell dimple at 24.21 m/s INSIDE
 *  the wall and called it the eye. A ring with a gap is still a ring you have to climb.
 * ==========================================================================*/

/** A tiny binary min-heap of [level, i, j] — the lattice is 31×31, but O(n log n) is free. */
function heap() {
  const a = [];
  const up = (k) => { while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; const t = a[p]; a[p] = a[k]; a[k] = t; k = p; } };
  const down = (k) => {
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < a.length && a[l][0] < a[m][0]) m = l;
      if (r < a.length && a[r][0] < a[m][0]) m = r;
      if (m === k) break;
      const t = a[m]; a[m] = a[k]; a[k] = t; k = m;
    }
  };
  return {
    size: () => a.length,
    push: (x) => { a.push(x); up(a.length - 1); },
    pop: () => { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; down(0); } return top; },
  };
}

/**
 * For every cell, the lowest speed you can be sure of NOT exceeding on some walk out of the box —
 * i.e. the height of the lowest pass in the ring around it. Cells on the edge of the box are their
 * own answer: you are already out.
 *
 * ⚠ NaN is treated as impassable rather than as calm. A hole in the field is not somewhere the
 * wind is light; it is somewhere the field does not answer, and a walk cannot go through it.
 */
export function wallLevels(v, n) {
  const esc = [];
  for (let i = 0; i < n; i++) { esc.push([]); for (let j = 0; j < n; j++) esc[i].push(Infinity); }
  const h = heap();
  const relax = (i, j, level) => { if (!(level < esc[i][j])) return; esc[i][j] = level; h.push([level, i, j]); };
  const at = (i, j) => (v[i][j] === v[i][j] ? v[i][j] : Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) if (i === 0 || j === 0 || i === n - 1 || j === n - 1) relax(i, j, at(i, j));
  }
  while (h.size()) {
    const [level, i, j] = h.pop();
    if (level > esc[i][j]) continue;                 /* a better route to this cell was already out */
    const step = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < step.length; k++) {
      const x = i + step[k][0], y = j + step[k][1];
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      relax(x, y, Math.max(level, at(x, y)));
    }
  }
  return esc;
}

/**
 * The eye of the storm whose eyewall carries `peak` — or null when this box holds no calm at all,
 * and equally when the calm it holds is not ringed by anything (`why` tells the two apart).
 *
 * `box` is what tests/prod-smoke.spec.js reads off the live field:
 *     { la0, lo0, step, n, v }   with v[i][j] the speed at (la0 + i*step, lo0 + j*step)
 *
 * ⚠ THE 「IS IT CALM」 LINE IS THE ONE #R276 WROTE, UNCHANGED: a point counts as calm when it is at
 * or below 0.6 × peak. This round moves WHICH of those points is called the eye, not the line.
 * MEASURED over the 145 hours: the line rejected the hour in none of them, exactly as before.
 *
 * ⚠ AND THE ONE THING IT ADDS IS NOT A THRESHOLD. `prominence > 0` is not a tuned number — it is
 * the difference between 「the wind has to rise before you can leave」 and 「it does not」, which is
 * the whole of 「inside a ring」. A box whose every calm point sits on its own edge has no ring in
 * it and therefore no eye, and says so instead of naming one. MEASURED, it never fired: the chosen
 * point's prominence ran 0.27 … 31.78 m/s over the 101 hours, median 20.0.
 *
 * ⚠ TIES ARE BROKEN BY POSITION, south first then west, so two runs of the same hour name the same
 * point. Otherwise 「the selection moved」 and 「the map moved」 are the same observation (#R458).
 */
export function findEye(peak, box) {
  const n = box.n, v = box.v, cut = peak.sp * 0.6;
  const esc = wallLevels(v, n);
  let best = null, bestProm = 0, belowCut = 0, calmest = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const sp = v[i][j];
      if (!(sp === sp) || !isFinite(sp)) continue;
      if (calmest === null || sp < v[calmest[0]][calmest[1]]) calmest = [i, j];
      if (!(sp <= cut)) continue;
      belowCut++;
      const prom = esc[i][j] - sp;
      if (prom > bestProm) { bestProm = prom; best = [i, j]; }   /* row-major = south first, then west */
    }
  }
  const point = (c) => (c === null ? null : {
    la: +(box.la0 + c[0] * box.step).toFixed(2),
    lo: +(box.lo0 + c[1] * box.step).toFixed(2),
    sp: v[c[0]][c[1]],
    wall: esc[c[0]][c[1]],
    prominence: esc[c[0]][c[1]] - v[c[0]][c[1]],
  });
  const eye = point(best), calm = point(calmest);
  const half = ((n - 1) / 2 * box.step).toFixed(1);
  return {
    eye, cut, belowCut, cells: n * n, calmest: calm,
    why: eye ? ''
      : belowCut === 0
        ? 'nothing in the ±' + half + '° box around the strongest wind (' + peak.sp.toFixed(1)
          + ' m/s at ' + peak.la + ', ' + peak.lo + ') is at or below the ' + cut.toFixed(1)
          + ' m/s calm line — the calmest point it offers reads '
          + (calm ? calm.sp.toFixed(1) : 'nothing') + ' m/s'
        : 'all ' + belowCut + ' of the ' + (n * n) + ' points in the ±' + half + '° box that are at '
          + 'or below the ' + cut.toFixed(1) + ' m/s calm line can be walked out of the box from '
          + 'without the wind rising at all, so nothing here is ringed: this is a band of strong '
          + 'wind (' + peak.sp.toFixed(1) + ' m/s at ' + peak.la + ', ' + peak.lo + ') rather than '
          + 'a storm with a centre',
  };
}

/**
 * How this reads in a failure message, in the field's own unit.
 * ⚠ It names the PROMINENCE, because that is the number the choice was made on: the defect this
 * replaced would print a point 223 km away with 「prominence 0.0」, which says out loud that you
 * can walk away from it without the wind rising at all.
 */
export function describeEye(peak, found) {
  if (!found.eye) return found.why;
  const e = found.eye;
  const dKm = 111 * Math.hypot(e.la - peak.la, (e.lo - peak.lo) * Math.cos(peak.la * Math.PI / 180));
  return e.sp.toFixed(2) + ' m/s at ' + e.la + ', ' + e.lo + ' — ' + dKm.toFixed(0) + ' km from the '
    + peak.sp.toFixed(2) + ' m/s peak, ringed by wind that reaches ' + e.wall.toFixed(2)
    + ' m/s in every direction out of the box (prominence ' + e.prominence.toFixed(2) + ' m/s; '
    + found.belowCut + ' of ' + found.cells + ' points in the box are at or below the '
    + found.cut.toFixed(2) + ' m/s calm line)';
}
