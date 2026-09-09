/* ============================================================================
 *  R650 — WHO Disease Outbreak News, in a real browser
 *   ① the layer really DRAWS: one circle per country the window holds items for, and the panel's
 *      numbers are the same numbers the source carries (a legend that disagrees with the map is
 *      #R551's whole lesson)
 *   ② «not one country» is a state that survives contact with the renderer — those items are in the
 *      panel and NOT in the source, and nothing has invented a coordinate for them
 *   ③ the master clock moves the window, so the map answers about the day the reader is standing on
 *
 *  ⚠ NONE OF THESE NEED WHO TO ANSWER. The archive is bundled; the live tail is best-effort and its
 *  failure is printed rather than thrown (#R499). A gate that goes red because who.int had a bad
 *  afternoon is a gate people learn to ignore (the #R341 rule).
 *
 *  ⚠ AND THE DRAWING IS ASKED OF THE RENDERER, NOT OF THE SOURCE CODE. tests/r650-checks.test.mjs
 *  reads the file; this asks whether the layers exist and how many features are in them, because
 *  #R488 records what a spelling check is worth when the thing it names has stopped working.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

async function outbreaksOn(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  await page.evaluate(() => {
    const cb = document.getElementById('wp-dl-outbreaks');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  await page.waitForFunction(
    () => { try { return !!(window.IntMapOutbreaks && window.IntMapOutbreaks.state().total > 3000); } catch (_) { return false; } },
    null, { timeout: 60000 },
  );
  /* ⚠ «THE LAYER EXISTS» IS NOT «THE LAYER IS READY». `ensureLayers()` adds the source with an
     empty collection, so waiting on `layers.has(…)` returns the instant the CONTAINER is there —
     which is how the first version of this spec measured 0 features and blamed the renderer. The
     honest readiness condition is that the archive has been SELECTED (`shown`); whether anything
     was then drawn is the assertion, not the wait. */
  await page.waitForFunction(
    () => {
      try {
        return window.IntMapGeoEngine.layers.has('who-don-pt') && window.IntMapOutbreaks.state().shown > 0;
      } catch (_) { return false; }
    },
    null, { timeout: 60000 },
  );
}

test('R650 ① the layer draws one circle per country, and the panel agrees with the map', async ({ app }) => {
  const page = app.page;
  await outbreaksOn(page);

  const seen = await page.evaluate(() => {
    const GE = window.IntMapGeoEngine;
    const st = window.IntMapOutbreaks.state();
    const src = GE.layers.sourceData('who-don-src');
    const feats = (src && src.features) || [];
    const byIso = new Set(feats.map((f) => f.properties.iso));
    return {
      st,
      layers: ['who-don-halo', 'who-don-pt', 'who-don-lb'].map((l) => GE.layers.has(l)),
      n: feats.length,
      uniqueIso: byIso.size,
      /* every drawn point must carry the two things the picture encodes, and both must be real */
      allHaveN: feats.every((f) => Number.isInteger(f.properties.n) && f.properties.n >= 1),
      allHaveAge: feats.every((f) => Number.isFinite(f.properties.age) && f.properties.age >= 0),
      allOnEarth: feats.every((f) => {
        const c = f.geometry.coordinates;
        return c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
      }),
      sumN: feats.reduce((a, f) => a + f.properties.n, 0),
      noOutline: (st.noOutline || []).length,
      /* ⚠ READ IN THE SAME TICK AS EVERYTHING ELSE. Taking this in a second `evaluate` let the live
         tail land in between and change `shown` under the comparison — the measurement moved while
         it was being made, which is a defect in the instrument and not in the layer. */
      isoFromEvents: (() => {
        const set = new Set();
        window.IntMapOutbreaks.events().forEach((e) => e.countries.forEach((i) => set.add(i)));
        return set.size;
      })(),
    };
  });

  expect(seen.layers).toEqual([true, true, true]);
  expect(seen.st.total).toBeGreaterThan(3000);
  expect(seen.n).toBeGreaterThan(0);
  /* ⚠ ONE FEATURE PER COUNTRY, NOT ONE PER ITEM — and the accounting must BALANCE. It cannot be
     `n === uniqueIso`: countryGeo carries 258 units and WHO names some this map has no outline for
     (ESH, XKX, GRL …). The honest invariant is that every country WHO named is either drawn or
     NAMED AS UNDRAWABLE — a silent difference between the panel's count and the map's is exactly
     the hole this spec exists to keep shut. */
  expect(seen.st.drawn + seen.noOutline).toBe(seen.isoFromEvents);
  /* …and the RENDERER is holding exactly what the panel says it is holding, one feature per country */
  expect(seen.n).toBe(seen.st.drawn);
  expect(seen.uniqueIso).toBe(seen.n);
  expect(seen.n).toBeLessThanOrEqual(seen.isoFromEvents);
  expect(seen.allHaveN).toBe(true);
  expect(seen.allHaveAge).toBe(true);
  expect(seen.allOnEarth).toBe(true);
  /* an item in two countries is two circles' worth of one note, so the sum is ≥ the note count */
  expect(seen.sumN).toBeGreaterThanOrEqual(seen.st.placed);

  const body = await page.textContent('#data-legend-whodon .wp-body');
  expect(body).toContain(String(seen.st.shown));
});

test('R650 ② the items that are not about one country are listed and NOT placed', async ({ app }) => {
  const page = app.page;
  await outbreaksOn(page);

  /* «Everything up to this date» so the 179 global/multi-country items are certainly in range */
  await page.evaluate(() => window.IntMapOutbreaks.setWindow(null));
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const st = window.IntMapOutbreaks.state();
    const evs = window.IntMapOutbreaks.events();
    const src = window.IntMapGeoEngine.layers.sourceData('who-don-src');
    const drawnIso = new Set(((src && src.features) || []).map((f) => f.properties.iso));
    const unplaced = evs.filter((e) => !e.countries.length);
    return {
      unplaced: st.unplaced, placed: st.placed, shown: st.shown,
      unplacedHaveNoIso: unplaced.every((e) => e.countries.length === 0),
      /* the honest state: they exist as items, they have a WHO page, and they are not on the map */
      unplacedAreRealItems: unplaced.every((e) => e.url && e.published),
      drawn: drawnIso.size,
    };
  });

  expect(r.unplaced).toBeGreaterThan(50);
  expect(r.placed + r.unplaced).toBe(r.shown);
  expect(r.unplacedHaveNoIso).toBe(true);
  expect(r.unplacedAreRealItems).toBe(true);

  const body = await page.textContent('#data-legend-whodon .wp-body');
  expect(body).toContain(String(r.unplaced));
});

test('R650 ③ the master clock moves the window, and the map follows it', async ({ app }) => {
  const page = app.page;
  await outbreaksOn(page);
  await page.evaluate(() => window.IntMapOutbreaks.setWindow(365));
  await page.waitForTimeout(400);

  const now = await page.evaluate(() => window.IntMapOutbreaks.state());

  /* travel to a year whose outbreaks are nothing like this year's */
  await page.evaluate(() => window.IntMapTime.setYear(2014));
  await page.waitForFunction(
    () => { try { return window.IntMapOutbreaks.state().asOf.slice(0, 4) === '2014'; } catch (_) { return false; } },
    null, { timeout: 20000 },
  );
  await page.waitForTimeout(600);

  const then = await page.evaluate(() => {
    const st = window.IntMapOutbreaks.state();
    const evs = window.IntMapOutbreaks.events();
    return { st, latest: evs[0] ? evs[0].published : null, pathogens: window.IntMapOutbreaks.pathogens().slice(0, 6).map((p) => p.name) };
  });

  expect(then.st.asOf.startsWith('2014')).toBe(true);
  expect(then.st.shown).toBeGreaterThan(0);
  /* ⚠ THE POINT: nothing published after the clock may be on the map. */
  expect(then.latest <= then.st.asOf).toBe(true);
  expect(then.st.shown).not.toBe(now.shown);
  /* 2014 is the West African Ebola year — WHO published about it, and the layer must show it */
  expect(then.pathogens.join(' · ').toLowerCase()).toContain('ebola');
  /* ⚠ AND NO FACET MAY BE A BARE YEAR. `EmergencyEvent.Title` is a year on 2,700 of 3,195 items,
     and the first version of this layer offered «2014 · 2013» as diseases (#R534's shape: a field's
     PRESENCE read as its MEANING). This is the assertion that found it. */
  expect(then.pathogens.filter((p) => /^\d{4}$/.test(p))).toEqual([]);
  /* ⚠⚠⚠ AND THE RULE THAT KEEPS IT SO MUST BE IN THE SHIPPED BUNDLE (#R660). The node checks read
     js/outbreaks.js from disk; this one asks the PAGE. The live tail names every DON WHO publishes
     after the last build, and until #R660 it took `EmergencyEvent.Title` RAW — 26 of WHO’s newest
     100 items came out named differently from the archive beside them, one of them the glued
     «Mpox (monkeypox)- Democratic Republic of the Congo» a reader saw in production. */
  const rule = await page.evaluate(() => {
    const N = window.IntMapWhoDonName;
    if (!N || typeof N.donName !== 'function') return { there: false };
    const places = new Set(['democratic republic of the congo', 'senegal']);
    return {
      there: true,
      cut: N.donName({ Title: 'Mpox (monkeypox)- Democratic Republic of the Congo' }, places),
      uncut: N.donName({ Title: 'Mpox (monkeypox)- Democratic Republic of the Congo' }, new Set()),
      fallback: N.donName({ Title: 'Yellow fever in Senegal', EmergencyEvent: { Title: '2014' } }, places),
    };
  });
  expect(rule.there).toBe(true);
  expect(rule.cut).toBe('Mpox (monkeypox)');
  /* an unverified tail is LEFT ATTACHED, never guessed away */
  expect(rule.uncut).toBe('Mpox (monkeypox)- Democratic Republic of the Congo');
  /* a bare EmergencyEvent.Title falls back to the DON’s own title */
  expect(rule.fallback).toBe('Yellow fever');

  await page.evaluate(() => window.IntMapTime.setNow());
});
