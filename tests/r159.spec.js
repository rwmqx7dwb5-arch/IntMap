// R159 behavioural checks in a real browser.
// (1) Atlas reply markdown renders with NO bold and NO horizontal divider.
// (4) Toggling the LEFT sidebar does not visually pan the map (the edge anchor holds a fixed geo-point in place).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } }); // desktop → sidebar is a flex sibling, anchor path active
  await installHermeticRouting(context);
  // Force CLASSIC (non-workspace) mode: desktop otherwise defaults to ws-mode where the sidebar is a floating
  // window and the classic #sidebar is display:none — there the sidebar never reflows the map. The map-move the
  // anchor fixes only happens in classic mode (ws-mode off), so opt out via the persisted preference.
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.IntMapAtlasDebug !== 'undefined' && typeof window.IntMapAtlasDebug.mdMini === 'function' && !!document.getElementById('map'),
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R159 #1 Atlas markdown renders with no bold and no divider line', async () => {
  const out = await page.evaluate(() =>
    window.IntMapAtlasDebug.mdMini('This is **bold** text and a key **term**.\n\n## Section Heading\n\n### Subheading\n\n# Big Title\n\nA closing sentence.'),
  );
  // (1) no bold anywhere in the reply body
  expect(out, 'no inline <b>').not.toContain('<b>');
  expect(out, 'no <strong>').not.toContain('<strong>');
  expect(out, 'no heavy 800 weight').not.toContain('font-weight:800');
  expect(out, 'no heavy 750 weight').not.toContain('font-weight:750');
  // the emphasised words survive as plain text (only the ** markers are stripped)
  expect(out).toContain('bold');
  expect(out).toContain('term');
  // (2) no horizontal divider line (the old "## " top-rule is removed)
  expect(out, 'no divider hairline').not.toContain('border-top');
  // headings still exist, differentiated by SIZE (semibold, not bold)
  expect(out).toContain('font-weight:600');
  expect(out).toContain('Section Heading');
});

test('R159 #4 → R160 LEFT sidebar toggle keeps its mechanism AND never drives the camera (no rotation, on GLOBE too)', async () => {
  await page.waitForFunction(() => !!(window.__imap && typeof window.__imap.getBearing === 'function'), null, { timeout: 25_000 });
  // classic (non-ws), SOLID mode: the left #sidebar is a real flex SIBLING (NOT restructured into an overlay).
  const layout = await page.evaluate(() => ({
    classic: !document.body.classList.contains('ws-mode') && !!document.getElementById('sidebar') && getComputedStyle(document.getElementById('sidebar')).display !== 'none',
    glass: document.body.classList.contains('sidebar-glass'),
    sbPos: getComputedStyle(document.getElementById('sidebar')).position,
    mcw: document.getElementById('map-container').getBoundingClientRect().width,
    winW: window.innerWidth,
  }));
  expect(layout.classic, 'classic-mode sidebar present').toBeTruthy();
  expect(layout.glass, 'default is SOLID (not frosted) mode').toBeFalsy();
  expect(layout.sbPos, 'SOLID sidebar is a flex sibling, NOT an absolute overlay').not.toBe('absolute');

  // use the GLOBE projection at a normal zoom — this is where a stray panBy would visibly ROTATE the planet.
  await page.evaluate(() => { try { window.__imap.setProjection({ type: 'globe' }); } catch {} window.__imap.jumpTo({ center: [2.3, 48.85], zoom: 4, bearing: 0, pitch: 0 }); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('collapsed')) document.getElementById('btn-toggle-sidebar').click(); });
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => {
    const m = window.__imap; const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(), w: document.getElementById('map-container').getBoundingClientRect().width };
  });

  // collapse the sidebar (and open it again) — the beside-flex map area resizes, but the toggle must touch the camera NOTHING.
  await page.evaluate(() => document.getElementById('btn-toggle-sidebar').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('btn-toggle-sidebar').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('btn-toggle-sidebar').click());
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const m = window.__imap; const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(), w: document.getElementById('map-container').getBoundingClientRect().width };
  });

  // the beside-flex mechanism is intact (the map area really resized between open/closed states) …
  expect(Math.abs(after.w - before.w), `container width changes with the toggle (beside-flex): ${before.w}→${after.w}`).toBeGreaterThan(120);
  // … but the CAMERA is byte-for-byte untouched — no panBy (which would ROTATE the globe), no setPadding, no easeTo.
  expect(Math.abs(after.bearing - before.bearing), `bearing must NOT change (no globe rotation): ${before.bearing}→${after.bearing}`).toBeLessThan(0.001);
  expect(Math.abs(after.lng - before.lng), `center lng must NOT change: ${before.lng}→${after.lng}`).toBeLessThan(0.001);
  expect(Math.abs(after.lat - before.lat), `center lat must NOT change: ${before.lat}→${after.lat}`).toBeLessThan(0.001);
  expect(Math.abs(after.zoom - before.zoom), `zoom must NOT change`).toBeLessThan(0.001);
  expect(Math.abs(after.pitch - before.pitch), `pitch must NOT change`).toBeLessThan(0.001);

  // no exceptions
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
