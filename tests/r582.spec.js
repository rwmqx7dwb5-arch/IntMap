/* ============================================================================
 *  #R582 — the browser half of the national-elections layer
 * ----------------------------------------------------------------------------
 *  tests/r582-checks.test.mjs proves the DATA is well formed and that the runtime contains no
 *  country. Only a browser can prove the thing that actually matters: that a reader who switches
 *  the layer on, picks a country and presses a constituency is told the truth.
 *
 *  ⚠ #R552 is the reason this file exists at all. That round's fix was correct in every node check
 *  and did not run in the shipped browser, because the checks bound their own copy of the wiring
 *  instead of the one the app ships. So everything here goes through the checkbox a finger presses
 *  and reads the layer's own published state — never a fixture, never a private function.
 *
 *  ⚠ THREE TESTS, NOT SEVEN, AND THE WAITS ARE POLLS. This is the round's own spec, which means it
 *  is in the CORE gate whatever it costs (scripts/tiers.mjs) — and the core tier has a TOTAL
 *  ceiling that #R197 put there precisely so that a round cannot make everybody's push slower.
 *  Every fixed sleep here was replaced by a poll on the condition it was waiting for, and the
 *  assertions were grouped so that `autoReset` re-boots the view twice instead of six times.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

/** Switch the layer on through its own row and wait for the first election to land.
 *  One copy, called from Node — the page-side body is written once. */
const turnOn = (page) => page.evaluate(async () => {
  const cb = document.getElementById('dl-elect');
  if (!cb) return false;
  if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  for (let i = 0; i < 200 && !(window.IntMapElections && window.IntMapElections.current()); i++) {
    await new Promise((s) => setTimeout(s, 25));
  }
  return !!(window.IntMapElections && window.IntMapElections.current());
});

test('R582 ① the layer mounts from its own row and paints every district it draws', async ({ app }) => {
  const on = await turnOn(app.page);
  const r = await app.page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const idx = await fetch('data/elections/index.json').then((x) => x.json());
    const fc = window.IntMapElections.fc();
    return {
      fill: E.layers.has('elec-fill'), line: E.layers.has('elec-line'),
      legend: !!document.querySelector('#data-legend-elect .elec-box'),
      polities: window.IntMapElections.polities().slice().sort(),
      wantPolities: idx.polities.map((p) => p.id).sort(),
      elections: window.IntMapElections.elections().length,
      wantElections: idx.elections.length,
      total: fc.features.length,
      painted: fc.features.filter((f) => f.properties.col).length,
      named: fc.features.filter((f) => f.properties.win).length,
      colours: fc.features.slice(0, 3).map((f) => f.properties.col || null),
      /* CONSTITUTION §0.3 — a layer was ADDED beside the U.S. presidential one, not folded into it */
      uselect: !!document.getElementById('dl-uselect') && !!window.IntMapUSElections,
      mine: !!document.getElementById('dl-elect'),
    };
  });

  expect(on, 'the row exists and switching it on selected an election').toBe(true);
  expect(r.fill, 'the fill layer is on the map').toBe(true);
  expect(r.line, 'and its outline').toBe(true);
  expect(r.legend, 'the legend built its own body').toBe(true);
  /* ⚠ the counts come from the shipped index, never typed here — a count is a copy (#R304) */
  expect(r.polities).toEqual(r.wantPolities);
  expect(r.elections).toBe(r.wantElections);

  /* ⚠ THE FAILURE THE SCHEMA EXISTS TO PREVENT, ASKED OF THE RENDERED SOURCE. A district with no
     result carries no `col`, and the fill's colour for that case is transparent — so a hole can
     never be mistaken for a party. Anything short of every-district-painted means the join broke
     between the gate and the browser. */
  expect(r.total, 'the era file arrived').toBeGreaterThan(0);
  expect(r.painted, 'every district in it has a winner to colour').toBe(r.total);
  expect(r.named, 'and a party to name in the popup').toBe(r.total);
  for (const c of r.colours) expect(c).toMatch(/^#[0-9a-f]{6}$/i);

  expect(r.uselect, 'the U.S. presidential layer is still there beside it').toBe(true);
  expect(r.mine, 'and this is a second row, not a replacement').toBe(true);
});

test('R582 ② picking a country loads it, credits ITS publisher, and takes the camera there', async ({ app }) => {
  /* the reader's own act. #R582 added `goTo` to js/layer-home.js for exactly this — a selector that
     says Japan over a map of Germany is a selector that lies. */
  await turnOn(app.page);
  const r = await app.page.evaluate(async () => {
    const idx = await fetch('data/elections/index.json').then((x) => x.json());
    const cur = idx.elections.find((e) => e.id === window.IntMapElections.current());
    const other = idx.polities.find((p) => p.id !== cur.polity);   /* asked of the data, not named */
    const notes = () => [...document.querySelectorAll('#data-legend-elect .elec-note')].map((n) => n.textContent).join(' | ');
    const firstText = notes();
    const before = window.IntMapGeoEngine.camera.getCenter();
    const sel = document.querySelector('#data-legend-elect .elec-pol');
    sel.value = other.id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));

    const inBox = (c) => c.lng > other.home[0][0] && c.lng < other.home[1][0]
      && c.lat > other.home[0][1] && c.lat < other.home[1][1];
    let after = before;
    for (let i = 0; i < 400; i++) {
      await new Promise((s) => setTimeout(s, 25));
      after = window.IntMapGeoEngine.camera.getCenter();
      const now = idx.elections.find((e) => e.id === window.IntMapElections.current());
      if (now && now.polity === other.id && inBox(after)) break;
    }
    const now = idx.elections.find((e) => e.id === window.IntMapElections.current());
    return { wanted: other.id, got: now && now.polity, home: other.home, centre: [after.lng, after.lat],
             firstSrc: cur.src, otherSrc: now && now.src, firstText, otherText: notes() };
  });

  expect(r.got, 'the selector actually changed the election').toBe(r.wanted);
  /* ⚠ …and the credit followed the SELECTION, not the layer. Several of these licences make
     attribution the CONDITION of the right to redistribute, so one layer-wide constant would
     credit Britain's data to Germany. */
  expect(r.firstSrc).not.toBe(r.otherSrc);
  expect(r.firstText, 'the first election credited its own publisher').toContain(r.firstSrc.slice(0, 24));
  expect(r.otherText, 'and the next credits a different one').toContain(r.otherSrc.slice(0, 24));
  /* the camera settled inside the polity's own box — the box is the pack's, not this file's */
  const [w, s] = r.home[0], [e, n] = r.home[1];
  expect(r.centre[0]).toBeGreaterThan(w);
  expect(r.centre[0]).toBeLessThan(e);
  expect(r.centre[1]).toBeGreaterThan(s);
  expect(r.centre[1]).toBeLessThan(n);
});

test('R582 ③ a real press on a constituency opens that constituency’s own result', async ({ app }) => {
  /* ⚠ THE FINGER, NOT THE FUNCTION. Calling the handler directly would prove the handler works and
     say nothing about whether a press on the map ever reaches it — the shape #R552 measured, where
     the wiring and not the logic was the defect. */
  await turnOn(app.page);
  const aim = await app.page.evaluate(async () => {
    const fc = window.IntMapElections.fc();
    /* the biggest ring, and a point KNOWN to be inside it — a bounding-box centre falls outside a
       concave constituency often enough to make this flap, and a flapping test teaches people to
       re-run rather than to look */
    let best = null;
    for (const f of fc.features) {
      if (!f.properties.win) continue;
      const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
      for (const ring of rings) {
        let w = 180, s = 90, e = -180, n = -90;
        for (const c of ring) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
        const area = (e - w) * (n - s);
        if (!best || area > best.area) best = { area, ring, cd: f.properties.cd, win: f.properties.win, box: [w, s, e, n] };
      }
    }
    /* scanline at the ring's mid-latitude: the midpoint of its widest interior span is inside */
    const y = (best.box[1] + best.box[3]) / 2;
    const xs = [];
    for (let i = 0, j = best.ring.length - 1; i < best.ring.length; j = i++) {
      const a = best.ring[j], b = best.ring[i];
      if ((a[1] > y) === (b[1] > y)) continue;
      xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    let span = null;
    for (let i = 0; i + 1 < xs.length; i += 2) if (!span || (xs[i + 1] - xs[i]) > (span[1] - span[0])) span = [xs[i], xs[i + 1]];
    if (!span) return { cd: null };
    const inside = [(span[0] + span[1]) / 2, y];
    /* frame a small box on that point so it lands at the centre of the canvas, and the test does
       not have to know how the engine projects */
    const dx = Math.min(0.05, (span[1] - span[0]) / 6) || 0.01;
    window.IntMapGeoEngine.camera.fitBounds([[inside[0] - dx, inside[1] - dx / 2], [inside[0] + dx, inside[1] + dx / 2]], { padding: 0, duration: 0 });
    const want = window.IntMapGeoEngine.camera.getZoom();
    for (let i = 0; i < 200; i++) {
      await new Promise((s) => setTimeout(s, 25));
      const c = window.IntMapGeoEngine.camera.getCenter();
      if (Math.abs(c.lng - inside[0]) < dx && Math.abs(window.IntMapGeoEngine.camera.getZoom() - want) < 0.01) break;
    }
    const r = document.getElementById('map-container').getBoundingClientRect();
    return { cd: best.cd, win: best.win, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  expect(aim.cd, 'an interior point of some district was found').toBeTruthy();
  expect(aim.win, 'the district this aims at has a recorded winner').toBeTruthy();

  /* ⚠ THE PRESS IS RETRIED, NOT SLEPT BEFORE. `fitBounds(duration:0)` puts the camera there at once,
     so there is no camera state left to wait on — what is not ready is the frame the renderer has
     to draw before a press can hit anything. A fixed sleep would be a guess about that (measured:
     1.5 s worked and 0.6 s did not, on this machine, today). Pressing again until the popup opens
     asks the real question and costs one frame in the ordinary case. */
  let opened = false;
  for (let i = 0; i < 8 && !opened; i++) {
    await app.page.mouse.click(aim.x, aim.y);
    opened = await app.page.waitForSelector('.elec-pop', { timeout: 1200 }).then(() => true, () => false);
  }
  expect(opened, 'a press on the constituency opened a popup').toBe(true);
  const pop = await app.page.evaluate(() => {
    const el = document.querySelector('.elec-pop');
    return { text: el.textContent, rows: el.querySelectorAll('.elec-row').length };
  });
  /* the popup names the same party the colour already carried — one fact, two renderings */
  expect(pop.text, 'the popup names the winning party').toContain(aim.win);
  expect(pop.rows, 'and lists at least one candidacy').toBeGreaterThan(0);
});
