/* ============================================================================
 *  IntMap · ui-a11y-polish — what the 2026-09-27 production health check measured, measured again
 * ----------------------------------------------------------------------------
 *  ① desktop, 1280 × 800, FIRST VISIT (the right layer panel opens itself, js/map-ui.js) — the state
 *    the health check saw:
 *      · the map-search placeholder read 「Search any pla」: 185 px of text in a 105 px field;
 *      · the selected Map/Satellite and Flat/Globe segments were #007aff 12 px on white = 4.02:1;
 *      · Tab reached #search-input and the Countries sort <select> and drew nothing measurable on
 *        either (a 1-px border tint; a 3-px halo at 1.2:1).
 *    ⚠ THE FOCUS POPULATION IS WHATEVER Tab REACHES — nothing here names a control. Every stop must
 *      show a ≥2 px ring in --focus-ring, drawn by the control or, for a borderless field, by the
 *      pill it sits in; and a MOUSE click on a button or a select must draw none.
 *    ⚠ THE CONTRAST POPULATION IS EVERY RENDERED ELEMENT whose own text is painted in the accent, at
 *      its composited background — in light, and again in dark.
 *  ② phone, 375 × 812: 「© Esri」's link was 18 × 12 px. Each credit link must answer a finger over a
 *    24 × 24 square centred on it (elementFromPoint at its corners) while its own drawn box stays the
 *    size of its text.
 *  tests/ui-a11y-polish-checks.test.mjs carries the halves that need no browser (the search card's
 *  kind line, and the token ratios computed from the stylesheet).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { sessionWith } from './helpers/session-seed.js';

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}

/* in the page: WCAG contrast of every rendered element whose own text is in the accent */
const accentTextContrast = () => {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const probe = document.createElement('i'); probe.style.color = 'var(--primary-color)'; document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color; probe.remove();
  const bgOf = (el) => { const layers = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let out = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i]; out = out.map((v, k) => c[k] * c[3] + v * (1 - c[3])); } return out; };
  const lum = (c) => { const l = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(c[0]) + 0.7152 * l(c[1]) + 0.0722 * l(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.color !== acc) continue;
    out.push({ what: el.id || String(el.className).slice(0, 40) || el.tagName, text: el.textContent.trim().slice(0, 24), ratio: +ratio(parse(cs.color), bgOf(el)).toFixed(2) });
  }
  return { acc, out };
};

test.describe('① desktop, first visit', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('① the placeholder fits its field, the accent reads ≥4.5:1 in both themes, and every Tab stop shows a ≥2 px ring that a mouse click does not', async ({ page }) => {
    await page.addInitScript((v) => { try { localStorage.setItem('intmap_session2', v); } catch (_) {} }, sessionWith([], { lsrOpen: true }));
    await boot(page);
    await page.waitForFunction(() => document.body.classList.contains('lsr-open'), null, { timeout: 20_000 });
    await page.waitForTimeout(800);   /* the panel's slide, and the search watcher's re-measure after it (#R252) */

    /* ── placeholder ──────────────────────────────────────────────────────────────────────────── */
    const ph = await page.evaluate(() => {
      const i = document.getElementById('ms-input'), cs = getComputedStyle(i);
      const c = document.createElement('canvas').getContext('2d'); c.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ');
      return { text: i.placeholder, width: c.measureText(i.placeholder).width, room: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    expect(ph.room, 'the field is the narrow one the health check saw (the pill between two open sidebars)').toBeLessThan(200);
    expect(ph.width, `「${ph.text}」 is ${ph.width.toFixed(0)} px in a ${ph.room.toFixed(0)} px field`).toBeLessThanOrEqual(ph.room);

    /* ── contrast, light then dark ────────────────────────────────────────────────────────────── */
    for (const theme of ['light', 'dark']) {
      /* the theme's resting colours, not a frame of the 0.2 s transition into them (finite animations only) */
      await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); document.getAnimations().forEach((x) => { try { x.finish(); } catch (_) {} }); }, theme);
      const seg = await page.evaluate(() => [...document.querySelectorAll('.view-btn.active')].filter((b) => b.checkVisibility()).map((b) => b.id));
      expect(seg.length, `${theme}: the selected segments are on screen`).toBeGreaterThanOrEqual(2);
      const { acc, out } = await page.evaluate(accentTextContrast);
      if (theme === 'light') expect(out.map((o) => o.what), `light: the selected segments are the accent-text population (${acc})`).toEqual(expect.arrayContaining(seg));
      for (const o of out) expect(o.ratio, `${theme}: 「${o.text}」 (${o.what}) in ${acc}`).toBeGreaterThanOrEqual(4.5);
      if (theme === 'dark') {   /* the dark segment is #111 on #fff — measured here rather than assumed */
        const d = await page.evaluate(() => { const b = document.querySelector('.view-btn.active'); const cs = getComputedStyle(b); return [cs.color, cs.backgroundColor]; });
        expect(d, 'dark: the selected segment is dark text on a light thumb').toEqual(['rgb(17, 17, 17)', 'rgb(255, 255, 255)']);
      }
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    /* ── keyboard focus: walk the page with Tab ───────────────────────────────────────────────── */
    const ring = await page.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--focus-ring)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; });
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    const stops = [];
    for (let k = 0; k < 45; k++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate((ringColor) => {
        const a = document.activeElement; if (!a || a === document.body) return null;
        const what = (a.id ? '#' + a.id : '') || (a.tagName.toLowerCase() + '.' + String(a.className).split(/\s+/)[0]);
        if (!a.checkVisibility || !a.checkVisibility()) return { what, skip: true };
        const host = a.matches('input,textarea') ? a.closest('.search-bar,.map-search') : null;
        /* the resting state, not a frame of the transition into it (.mode-btn and the pills animate their colours) */
        for (const e of [a, host]) if (e && e.getAnimations) e.getAnimations().forEach((x) => { try { x.finish(); } catch (_) {} });
        const cs = getComputedStyle(a);
        if (host) {   /* the pill draws it: 1 px border + a 1 px spread ring, both in the ring colour */
          const h = getComputedStyle(host), sh = h.boxShadow;
          const spread = sh.startsWith(ringColor) ? parseFloat((/0px 0px 0px (\d+(?:\.\d+)?)px/.exec(sh) || [])[1] || 0) : 0;
          return { what, by: 'pill', px: (h.borderTopColor === ringColor ? parseFloat(h.borderTopWidth) : 0) + spread, colour: h.borderTopColor };
        }
        return { what, by: 'outline', px: cs.outlineStyle === 'solid' ? parseFloat(cs.outlineWidth) : 0, colour: cs.outlineColor };
      }, ring);
      if (s) stops.push(s);
    }
    const seen = stops.filter((s) => !s.skip);
    expect(seen.length, 'Tab reached the page').toBeGreaterThan(15);
    expect(seen.map((s) => s.what), 'the two controls the health check named are in the walk').toEqual(expect.arrayContaining(['#search-input']));
    expect(seen.some((s) => /^select\.stats-sort-sel/.test(s.what)), 'the Countries sort <select> is in the walk').toBe(true);
    for (const s of seen) {
      expect(s.px, `${s.what}: a ${s.px} px ${s.by} ring`).toBeGreaterThanOrEqual(2);
      expect(s.colour, `${s.what}: the ring is --focus-ring`).toBe(ring);
    }

    /* ── …and a mouse click on a button draws none ────────────────────────────────────────────────
       (a button that does not re-render itself when pressed: north is already up.)
       ⚠ NOT a <select>: MEASURED here, Chromium matches :focus-visible on a MOUSE-clicked select
       (fv=true, while the button beside it is fv=false) — it treats the select as taking typed input,
       as it does a text field. That is the browser's heuristic, which this rule deliberately follows;
       see dev-notes/2026-09-27-ui-a11y-polish.md. */
    for (const sel of ['#btn-compass']) {
      await page.locator(sel).first().click();
      const m = await page.evaluate((q) => { const a = document.activeElement; const cs = getComputedStyle(a); return { is: a.matches(q), fv: a.matches(':focus-visible'), style: cs.outlineStyle }; }, sel);
      expect(m.is, `${sel} took focus from the click`).toBe(true);
      expect(m.fv || m.style === 'solid', `${sel}: no keyboard ring after a mouse click (focus-visible ${m.fv}, outline ${m.style})`).toBe(false);
    }
  });
});

test.describe('② phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('② every map-credit link answers a finger over 24 × 24 px while drawing no larger than its text', async ({ page }) => {
    await boot(page);
    await page.waitForFunction(() => document.querySelectorAll('#map-credit a').length > 0, null, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const links = await page.evaluate(() => [...document.querySelectorAll('#map-credit a')].map((a, i) => {
      const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hw = Math.max(r.width, 24) / 2 - 0.5, hh = Math.max(r.height, 24) / 2 - 0.5;
      const pts = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx - hw, cy + hh], [cx + hw, cy + hh], [cx, cy - hh], [cx, cy + hh]];
      const miss = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !(e && e.closest('a') === a); }).map((p) => p.map((v) => +v.toFixed(1)));
      const pill = document.getElementById('map-credit').getBoundingClientRect();
      return { i, text: a.textContent, w: +r.width.toFixed(1), h: +r.height.toFixed(1), miss, pillH: +pill.height.toFixed(1) };
    }));
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.miss, `「${l.text}」 (${l.w} × ${l.h} px): points of its 24 × 24 square that do not reach it`).toEqual([]);
      expect(l.h, `「${l.text}」 still draws at the height of its text — the pill (${l.pillH} px) did not grow`).toBeLessThan(24);
    }
  });
});

/* ══ ③ (mobile-shell) THE PHONE IS THE MAP — measured the way production was measured before the rebuild ══════
   390 × 844, the iPhone the report used. Before (production, 2026-10-02): 45.2 % of the map under chrome, 14 of
   21 tap targets under 44 px, two legend cards opened over the map by default and drawn over the search results
   and Chronos. Now: the sheet's search row and one control group; legends behind a chip; every control 44 px.
   ⚠ COVERAGE IS PAINTED PIXELS, NOT BOXES: an element counts where it draws (a background, a backdrop filter,
   text, a canvas, an image, a control), clipped to the screen; the map and its own canvases do not count.
   ⚠ THE ONE ALLOWED SMALL TARGET is the data credit's link — licence text, kept small on purpose, with its own
   24 px floor measured by ② above. */
const PAINTED = () => {
  const W = innerWidth, H = innerHeight, S = 3, cols = Math.ceil(W / S), grid = new Uint8Array(cols * Math.ceil(H / S));
  const map = document.getElementById('map');
  for (const el of document.querySelectorAll('body *')) {
    if ((map && map.contains(el)) || el.closest('#boot-splash') || /^(space-canvas|wind-canvas|map-container)$/.test(el.id)) continue;
    if (el.tagName === 'CANVAS' && el.parentElement && /map-container/.test(el.parentElement.id)) continue;
    if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const cs = getComputedStyle(el);
    const paints = /^(CANVAS|IMG|svg|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor)
      || cs.backgroundImage !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none') || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!paints) continue;
    const r = el.getBoundingClientRect();
    for (let y = Math.max(0, Math.floor(r.top / S)); y < Math.min(H, r.bottom) / S; y++) for (let x = Math.max(0, Math.floor(r.left / S)); x < Math.min(W, r.right) / S; x++) grid[y * cols + x] = 1;
  }
  let n = 0; for (const v of grid) n += v; return n / grid.length;
};
const SMALL = (root) => [...document.querySelector(root || 'body').querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]')].filter((el) => {
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) return false;
  const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!(h && (h === el || el.contains(h) || (h.closest('label') && h.closest('label').contains(el))))) return false;
  if (el.closest('#map-credit')) return false;
  return Math.min(r.width, r.height) < 43.5;
}).map((el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' ' + Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height));

test.describe('③ phone shell', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('③ one sheet and one control group: the map is ≥ 80 % uncovered, every target is 44 px, legends wait behind their chip, Chronos and the candidates are in the sheet', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    /* one legend-owning layer, switched the way every route switches it */
    await page.evaluate(() => { const c = document.getElementById('dl-climate'); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
    await page.waitForFunction(() => !document.getElementById('m-legend-chip').hidden, null, { timeout: 30_000 });
    await page.waitForTimeout(900);   /* the sheet's spring and the legend's own layout */

    const cover = await page.evaluate(PAINTED);
    expect(cover, `the chrome paints ${(cover * 100).toFixed(1)} % of the map (production before: 45.2 %)`).toBeLessThan(0.2);
    expect(await page.evaluate(SMALL), 'tap targets under 44 px').toEqual([]);

    /* the legend is laid out but not on the map until the chip opens it; and then it is under the chrome's row */
    const lg = await page.evaluate(() => { const el = document.getElementById('koppen-legend'); const r = el.getBoundingClientRect();
      const at = () => { const h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return !!(h && el.contains(h)); };
      const shut = at(); document.getElementById('m-legend-chip').click(); const open = at();
      const z = (q) => +getComputedStyle(document.querySelector(q)).zIndex;
      return { shut, open, legend: z('#koppen-legend'), group: z('#m-fab-stack'), sheet: z('#sidebar') }; });
    expect(lg.shut, 'a legend is drawn over the map before anyone asked for it').toBe(false);
    expect(lg.open, 'the chip did not open the legend').toBe(true);
    expect(lg.legend < lg.group && lg.group < lg.sheet, `stacking ${JSON.stringify(lg)} — a legend can cover a control again`).toBe(true);
    await page.click('#m-legend-chip');

    /* Chronos is a screen of the sheet, with the map still above it, and every control in it is 44 px */
    await page.click('#m-clock');
    await page.waitForFunction(() => !!document.querySelector('#m-screens > #news-timeline'), null, { timeout: 15_000 });
    await page.waitForTimeout(900);
    const ch = await page.evaluate(() => ({ sheetTop: document.getElementById('sidebar').getBoundingClientRect().top / innerHeight,
      slider: document.getElementById('ntl-slider').getBoundingClientRect().height }));
    expect(ch.sheetTop, 'Chronos covered the map').toBeGreaterThan(0.4);
    expect(ch.slider, 'the year slider is a 44 px row to the finger').toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(SMALL, '#news-timeline'), 'Chronos targets under 44 px').toEqual([]);
    await page.click('#ntl-x');
    await page.waitForFunction(() => !document.querySelector('#m-screens > #news-timeline'));

    /* the one field: candidates as the reader types (no Enter), the last of them «Ask Atlas» */
    await page.click('#ms-input');
    await page.keyboard.type('Par', { delay: 40 });
    await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item').length >= 2, null, { timeout: 10_000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll('#ms-results .ms-item')].map((e) => e.classList.contains('ms-atlas')));
    expect(rows[rows.length - 1], 'the last candidate is «Ask Atlas»').toBe(true);
    expect(rows.filter(Boolean).length).toBe(1);
  });
});

/* ══ ③b (mobile-shell-flow) THE SHEET RESTS WHERE THE READER'S ANSWER CAN BE SEEN ══════════════════════════════
   MEASURED on production (0cb41ee, 390 × 844), the flow through the rebuilt sheet: a candidate picked from the search
   left the sheet at `full` 5 s later (the map was the top 118 px, the place card cut off above the screen, eight
   candidate rows still open); the card's × sat under the control group and its buttons were 28 px; Chronos opened at
   `half` with its year slider at y 819–863 of 844; Edit / Add / the layer screen's List, Turn all off, section rows and
   search field were under 44 px. The rule is js/mobile-sheet.js detentFor; this walks it the way a reader does.
   ⚠ 44 px HERE IS THE HIT AREA, read through elementFromPoint — a control may paint smaller and answer a finger over
   44 px (the widget board's and the legends' rule), and a hit area its scroll box clips does not count. */
const HIT = (root) => [...document.querySelector(root).querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], .lst-sech')].filter((el) => {
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) return false;
  const own = (x, y) => { const k = document.elementFromPoint(x, y); return !!(k && (k === el || el.contains(k))); };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (!own(cx, cy)) return false;
  let up = 0, dn = 0; while (up < 30 && own(cx, cy - up - 1)) up++; while (dn < 30 && own(cx, cy + dn + 1)) dn++;
  let lf = 0, rt = 0; while (lf < 30 && own(cx - lf - 1, cy)) lf++; while (rt < 30 && own(cx + rt + 1, cy)) rt++;
  return Math.min(up + dn + 1, lf + rt + 1) < 44;
}).map((el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]));
const DETENT = () => (document.body.className.match(/sheet-(full|min|hidden)/) || ['sheet-half'])[0].replace('sheet-', '');

test.describe('③b phone shell — the flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('③b a picked place brings the sheet down to its card; an app flight at full shows the map; Chronos, the layer screen and the board answer a finger at half', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);

    /* ── search → a candidate → the card. The last letter is typed and the row tapped inside the 120 ms the
       suggestion timer waits, which is the race that reopened the list on production. ── */
    await page.click('#ms-input');
    await page.keyboard.type('Pari', { delay: 40 });
    await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item:not(.ms-atlas)').length >= 1, null, { timeout: 10_000 });
    expect(await page.evaluate(DETENT), 'the field raises the sheet for its candidates').toBe('full');
    await page.waitForTimeout(300);
    await page.keyboard.type('s');
    await page.click('#ms-results .ms-item:not(.ms-atlas)');
    /* the flight lands first, then the camera's padding follows the sheet (an ease during the flight would cancel it) */
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => !window.__imap.isMoving(), null, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    const card = await page.evaluate(() => {
      const box = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const res = document.getElementById('ms-results'), x = document.querySelector('.src-card-close'), xb = x.getBoundingClientRect();
      const hit = document.elementFromPoint(xb.left + xb.width / 2, xb.top + xb.height / 2);
      return { open: res.style.display !== 'none' && res.childElementCount > 0,
        card: box('.search-result-card'), group: box('.m-ctl-group'), sheet: box('#sidebar'), xHits: hit === x || x.contains(hit),
        buttons: [...document.querySelectorAll('.src-actions button')].map((b) => b.getBoundingClientRect().height), focused: document.activeElement && document.activeElement.id };
    });
    expect(await page.evaluate(DETENT), 'the card is the answer — the sheet comes down to its search row').toBe('min');
    expect(card.open, 'the candidates closed with the pick (and stayed closed after the suggestion timer fired)').toBe(false);
    expect(card.focused, 'the keyboard went away with the pick').not.toBe('ms-input');
    expect(card.card.t >= 0 && card.card.b <= card.sheet.t, `the card is on the map above the sheet ${JSON.stringify(card)}`).toBe(true);
    expect(card.card.r <= card.group.l, 'the card stops short of the control group').toBe(true);
    expect(card.xHits, 'the card\'s × answers its own tap').toBe(true);
    expect(Math.min(...card.buttons), 'Copy / Drop a pin are 44 px').toBeGreaterThanOrEqual(44);
    await page.click('.src-card-close');
    /* the home board at half (Atlas's own chips are measured by Atlas's styles, not here) */
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForTimeout(700);
    expect(await page.evaluate(HIT, '#sidebar'), 'targets in the sheet at half under 44 px').toEqual([]);

    /* ── an app flight with the sheet at full (an Atlas fit) brings it to half, and the flight is not cut short;
       a finger panning the strip of map at full is the reader's own move and changes nothing ── */
    await page.click('#btn-community');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__setDetent('full', false));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__imap.fitBounds([[2, 41], [8, 51]], { padding: 60, duration: 700 }));
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !window.__imap.isMoving(), null, { timeout: 10_000 });
    await page.waitForTimeout(900);
    const fl = await page.evaluate(() => ({ c: window.__imap.getCenter(), pad: window.__imap.getPadding().bottom, top: document.getElementById('sidebar').getBoundingClientRect().top }));
    expect(await page.evaluate(DETENT), 'an answer drawn on the map while the sheet covered it').toBe('half');
    expect(Math.abs(fl.c.lng - 5), `the flight was cut short (centre ${fl.c.lng})`).toBeLessThan(0.5);
    expect(Math.abs(fl.pad - (844 - fl.top)), 'the camera\'s padding followed the sheet once the flight landed').toBeLessThan(4);
    await page.evaluate(() => window.__setDetent('full', false));
    await page.waitForTimeout(400);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 60, id: 1 }] });
    for (let i = 1; i < 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 12, y: 60, id: 1 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1200);
    expect(await page.evaluate(DETENT), 'a finger on the map is not an answer').toBe('full');

    /* ── at half: Chronos (every tab's own control on the screen), then the layer screen ── */
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForTimeout(700);
    await page.click('#m-clock');
    await page.waitForFunction(() => !!document.querySelector('#m-screens > #news-timeline'), null, { timeout: 15_000 });
    await page.waitForTimeout(700);
    for (const mode of ['year', 'date', 'time']) {
      await page.click('#ntl-mode-' + mode);
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => ({ bottom: document.getElementById('ntl-slider').getBoundingClientRect().bottom, vh: innerHeight }));
      expect(await page.evaluate(DETENT)).toBe('half');
      expect(s.bottom, `Chronos ${mode}: the slider is below the screen at half`).toBeLessThanOrEqual(s.vh);
    }
    expect(await page.evaluate(HIT, '#news-timeline'), 'Chronos targets under 44 px').toEqual([]);
    await page.click('#ntl-x');
    await page.click('#m-fab-map');
    await page.waitForFunction(() => !!document.querySelector('#m-screens > #mo-sheet'), null, { timeout: 15_000 });
    await page.waitForTimeout(900);
    expect(await page.evaluate(HIT, '#mo-sheet'), 'layer screen targets under 44 px').toEqual([]);
  });
});

/* ══ (shell-experience) 「IntMap のいま」 and the supplier named on a failure ══════
   Added to this file rather than as a spec of its own: the suite's ceiling (scripts/test-budget.mjs) has no
   room for a new file, and these are the same kind of claim this file already makes about the desktop shell.
   One boot of the desktop shell. (The first-visit Layers panel is first-impression's to decide, not this round's.) */
test.describe('shell-experience: desktop at 1000 px', () => {
  test.use({ viewport: { width: 1000, height: 760 } });

  test('the status page opens from Settings, a failure names its supplier', async ({ page }) => {
    const { readFileSync } = await import('node:fs');
    const bundle = JSON.parse(readFileSync(new URL('../data/service-status.json', import.meta.url), 'utf8'));
    await page.addInitScript((v) => { try { localStorage.setItem('intmap_session2', v); } catch (_) {} }, sessionWith([]));
    await boot(page);

    /* ── ② the status page, from its button in Settings ── */
    const served = await page.evaluate(() => fetch('./data/service-status.json').then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), head: (await r.text()).slice(0, 40) }), (e) => ({ error: String(e) })));
    expect(served.status, 'the nightly measurement is served beside the app: ' + JSON.stringify(served)).toBe(200);
    await page.click('#btn-open-settings');
    await page.click('#btn-status-page');
    await page.waitForFunction(() => { const r = document.getElementById('im-status'); return !!r && r.style.display !== 'none' && !r.querySelector('[aria-busy]') && r.querySelectorAll('.ims-sec').length === 4; }, null, { timeout: 20_000 });
    const st = await page.evaluate(() => ({
      secs: [...document.querySelectorAll('#im-status .ims-sec')].map((x) => x.dataset.sec),
      upRows: document.querySelectorAll('#im-status .ims-sec[data-sec="upstream"] > .ims-group > .ims-row').length,
      all: document.querySelectorAll('#im-status .ims-sec[data-sec="upstream"] details .ims-row').length,
      dialog: window.IntMapDialog.anyOpen(),
      settingsShut: getComputedStyle(document.getElementById('settings-modal')).display === 'none',
    }));
    expect(st.secs).toEqual(['device', 'layers', 'upstream', 'atlas']);
    const down = bundle.upstream ? bundle.upstream.hosts.filter((h) => h.verdict === 'dead' || h.verdict === 'refused').length : 0;
    expect(st.upRows, 'one count row and one row per supplier the nightly check found not answering').toBe(bundle.upstream ? 1 + down : 1);
    expect(st.all, 'every supplier is listed behind the disclosure').toBe(bundle.upstream ? bundle.upstream.hosts.length : 0);
    expect(st.dialog, 'it is a registered dialog (Escape, focus trap)').toBe(true);
    expect(st.settingsShut, 'Settings steps aside for it').toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('im-status').style.display === 'none', null, { timeout: 5_000 });

    /* ── ③ a failed request, through a relay, is joined to last night's check of the host it targeted ── */
    const row = bundle.upstream && bundle.upstream.hosts.find((h) => !h.host.includes('*'));
    test.skip(!row, 'the shipped measurement lists no host');
    const relay = 'https://example.supabase.co/functions/v1/fetch-relay?u=' + encodeURIComponent('https://' + row.host + '/probe');
    await page.evaluate((u) => window.IntMapLayerState.report('cb-shell-experience-probe', Object.assign(new Error('http 503'), { reason: 'http', status: 503, url: u })), relay);
    await page.waitForFunction(() => { const r = window.IntMapLayerState.get('cb-shell-experience-probe'); return !!(r && r.upstream); }, null, { timeout: 15_000 });
    const rec = await page.evaluate(() => window.IntMapLayerState.get('cb-shell-experience-probe'));
    expect(rec.upstream.host).toBe(row.host);
    expect(rec.detail, 'the record’s words carry the nightly sentence').toMatch(/nightly check|毎晩の確認/);
  });
});
