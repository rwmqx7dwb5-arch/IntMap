/* ============================================================================
 *  IntMap · map-a11y-structure — the map in words, walked from the keyboard, in a real page
 * ----------------------------------------------------------------------------
 *  ① #map is a named region described by a live status, and switching a layer on is SAID: the
 *    status names the layer the «Active layers» bar names (discovered — the first thematic row the
 *    Layers panel offers, whatever it is).
 *  ② Alt+N with focus on the map presses the nearest feature through the renderer's own click path:
 *    a point is drawn at the centre on a layer registered as a click owner, and the owner's own
 *    handler must receive the press, and the status must name the feature.
 *  ③ every z-index the stylesheet declares is resolved BY THE BROWSER (calc(var(--z-…) + n) set on a
 *    probe) and must equal the integer tests/z-layers-baseline.json recorded before the layers were
 *    named — the painting order did not move.
 *  ④ the single-key shortcut switch: off, «l» does not press the Layers button; on, it does.
 *  ⑤ in the narrow desktop layout (body.ms-narrow) the open search results are not clipped by the pill.
 *  tests/map-a11y-structure-checks.test.mjs carries the halves that need no browser.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER = JSON.parse(readFileSync(join(import.meta.dirname, 'z-layers-baseline.json'), 'utf8'));

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.getElementById('map-narration'), null, { timeout: 20_000 });
}

test.describe('map-a11y-structure', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /* ONE boot for the four claims — the page costs more than the claims do (tests/durations.json) */
  test('the map in words, walked from the keyboard; the stacking order; the shortcut switch', async ({ page }) => {
    await boot(page);
    await test.step('① the map is a named region, and a layer switched on is said', async () => {
    const region = await page.evaluate(() => {
      const m = document.getElementById('map');
      return { role: m.getAttribute('role'), label: m.getAttribute('aria-label'), desc: m.getAttribute('aria-describedby') };
    });
    expect(region.role).toBe('region');
    expect(region.label).toBeTruthy();
    expect(region.desc).toBe('map-narration');
    const live = await page.evaluate(() => { const l = document.getElementById('map-narration'); return { role: l.getAttribute('role'), live: l.getAttribute('aria-live'), atomic: l.getAttribute('aria-atomic'), w: l.getBoundingClientRect().width }; });
    expect(live).toEqual({ role: 'status', live: 'polite', atomic: 'true', w: 1 });
    await expect.poll(() => page.evaluate(() => document.getElementById('map-narration').textContent), { timeout: 15_000 }).toMatch(/Map centred/);
    /* the first thematic row the panel offers — whatever it is */
    const name = await page.evaluate(() => {
      const skip = new Set(window.IntMapBasicLayers || []);
      const cb = Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]')).find((c) => c.id && !c.checked && !skip.has(c.id) && c.closest('label'));
      if (!cb) return null;
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      return cb.id;
    });
    expect(name, 'the Layers panel offers a thematic row').toBeTruthy();
    await expect.poll(() => page.evaluate(() => { const n = document.querySelector('#layer-active-section .alc-name'); return n ? n.textContent.trim() : ''; }), { timeout: 10_000 }).not.toBe('');
    const chipName = await page.evaluate(() => document.querySelector('#layer-active-section .alc-name').textContent.trim());
    await expect.poll(() => page.evaluate(() => document.getElementById('map-narration').textContent), { timeout: 10_000 }).toContain('Layers on (1): ' + chipName);
    /* …and off again; a one-region layer frames its region once (CONSTITUTION §3), so ② waits for the camera to rest */
    await page.evaluate((id) => { const cb = document.getElementById(id); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }, name);
    await expect.poll(() => page.evaluate(() => document.getElementById('map-narration').textContent), { timeout: 10_000 }).toContain('No layers are on.');
    await page.waitForFunction(() => !window.IntMapGeoEngine.camera.isAnimating(), null, { timeout: 15_000 });
    });

    await test.step('② Alt+N presses the feature at the centre through the renderer’s own click path', async () => {
    await page.evaluate(() => {
      const GE = window.IntMapGeoEngine, c = GE.camera.getCenter();
      GE.layers.addSource('a11y-probe', { type: 'geojson', data: { type: 'FeatureCollection', features: [
        { type: 'Feature', id: 1, properties: { name: 'Probe point' }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } }] } });
      GE.layers.add({ id: 'a11y-probe-pt', type: 'circle', source: 'a11y-probe', paint: { 'circle-radius': 12, 'circle-color': '#ff3b30' } });
      window.__probePresses = [];
      GE.events.onLayer('click', 'a11y-probe-pt', (e) => { window.__probePresses.push((e.features || []).map((f) => f.properties.name)); });
    });
    await page.waitForFunction(() => window.IntMapGeoEngine.coords.queryRenderedFeatures(
      [window.IntMapGeoEngine.render.canvas().clientWidth / 2, window.IntMapGeoEngine.render.canvas().clientHeight / 2], { layers: ['a11y-probe-pt'] }).length > 0, null, { timeout: 15_000 });
    await page.evaluate(() => { const m = document.getElementById('map'); const f = m.querySelector('[tabindex]:not([tabindex="-1"])') || m; f.focus(); });
    await page.keyboard.press('Alt+KeyN');
    await expect.poll(() => page.evaluate(() => window.__probePresses), { timeout: 5_000 }).toEqual([['Probe point']]);
    await expect.poll(() => page.evaluate(() => document.getElementById('map-narration').textContent)).toMatch(/Feature \d+ of \d+: /);
    /* the view did not move by one pixel (CONSTITUTION §3) */
    const before = await page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return [c.lng, c.lat, window.IntMapGeoEngine.camera.getZoom()]; });
    await page.keyboard.press('Alt+Shift+KeyN');
    const after = await page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return [c.lng, c.lat, window.IntMapGeoEngine.camera.getZoom()]; });
    expect(after).toEqual(before);
    });

    await test.step('③ every stylesheet z-index, resolved by the browser, is the integer recorded before the layers were named', async () => {
    const got = await page.evaluate(() => {
      const sheet = Array.from(document.styleSheets).find((s) => { try { return Array.from(s.cssRules).some((r) => r.selectorText === ':root' && r.style.getPropertyValue('--z-controls')); } catch (_) { return false; } });
      if (!sheet) return null;
      const probe = document.createElement('div'); probe.style.position = 'absolute'; document.body.appendChild(probe);
      const out = [];
      (function walk(rules) {
        for (const r of rules) {
          if (r.cssRules && !r.style) { walk(r.cssRules); continue; }
          if (!r.style) continue;
          const v = r.style.getPropertyValue('z-index'); if (!v) continue;
          probe.style.setProperty('z-index', v);
          out.push(getComputedStyle(probe).zIndex);
        }
      })(sheet.cssRules);
      probe.remove();
      return out;
    });
    expect(got, 'the stylesheet with the layer tokens is loaded').not.toBeNull();
    expect(got).toEqual(LEDGER.stack.map((s) => String(s.split(' → ').pop()).replace(' !important', '')));
    });

    await test.step('④ the single-key shortcuts can be switched off, and on again', async () => {
    await page.evaluate(() => { window.__layersPressed = 0; document.getElementById('btn-layers').addEventListener('click', () => { window.__layersPressed++; }, true); });
    const set = (v) => page.evaluate((val) => { const s = document.getElementById('setting-kbd-single'); s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await set('off');
    expect(await page.evaluate(() => localStorage.getItem('intmap_kbd_single'))).toBe('off');
    await page.keyboard.press('l');
    expect(await page.evaluate(() => window.__layersPressed)).toBe(0);
    await set('on');
    await page.keyboard.press('l');
    await expect.poll(() => page.evaluate(() => window.__layersPressed)).toBe(1);
    });
    await test.step('⑤ the narrow desktop layout does not clip the search results it opens', async () => {
    /* (search-results-clipped) body.ms-narrow collapses the pill sideways (#R65) and did it with
       overflow:hidden, which also cut off the results panel hanging below it: measured in production
       2026-09-30 at this viewport with both side panels open, «Tokyo» returned 12 results and
       elementFromPoint found none. Checked in this boot rather than a new one — it is the same
       stacking-and-painting question as ③, at the same viewport. */
    const r = await page.evaluate(() => {
      document.body.classList.add('ms-narrow');
      const box = document.getElementById('map-search');
      const res = document.getElementById('ms-results');
      res.innerHTML = '<div>Tokyo</div><div>Tokyo Station</div><div>Tokyo Bay</div>';
      res.style.display = 'block';
      const b = res.getBoundingClientRect(), p = box.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(20, b.height / 2));
      const out = { hit: !!hit && res.contains(hit), resH: b.height, pillW: p.width,
                    maxW: parseFloat(getComputedStyle(box).maxWidth), ox: getComputedStyle(box).overflowX };
      res.style.display = ''; res.innerHTML = ''; document.body.classList.remove('ms-narrow');
      return out;
    });
    expect(r.resH, 'the results panel has height').toBeGreaterThan(0);
    expect(r.hit, 'the middle of the open results panel is the results panel, not what is behind it').toBe(true);
    expect(r.ox, 'the pill still clips sideways').toBe('clip');
    expect(r.pillW).toBeLessThanOrEqual(r.maxW + 0.5);
    });
  });
});
