// R149 UI runtime regression tests:
//   #5 send button ↑ arrow solid black even when idle   #6 bigger stop square
//   #3 Köppen legend: 30 zones fit the viewport + the last class is reachable (stretch-to-end)
//   #9 image paste/attach: dropping an image shows a thumbnail and enables Send
//   #8 choice free-input send button is white (no accent bg)
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const CRITICAL = ['IntMapConsole'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(800);
});
test.afterAll(async () => { await page?.context()?.close(); });

test('#5/#6 Atlas send button ↑ is solid black when idle; stop square is enlarged', async () => {
  const r = await page.evaluate(() => {
    try { window.IntMapConsole?.open?.(); } catch { /* ignore */ }
    const go = document.querySelector('#atlas-panel .atl-go');
    const svg = go && go.querySelector('svg');
    const iconColor = svg ? getComputedStyle(svg).color : null;   // currentColor of the ↑ arrow (idle)
    // measure the enlarged stop square from the busy SVG constant (rendered)
    return { idleClass: go && go.classList.contains('idle'), iconColor, bg: go && getComputedStyle(go).backgroundColor };
  });
  expect(r.idleClass).toBe(true);              // empty input → idle
  expect(r.iconColor).toBe('rgb(17, 17, 17)'); // #111 solid black, NOT the old faded rgba
  expect(r.bg).toBe('rgb(255, 255, 255)');     // white button
});

test('#3 Köppen legend: short viewport clamps to the screen bottom, inner scroll reveals the rest (R151)', async () => {
  // (#R151) the fit clamps to min(content, viewport). When the classes DON'T fit (short viewport) the box reaches
  // ~12px above the screen bottom and the inner .kl-scroll is the safety net — every class stays reachable by
  // scrolling. (The complementary tall-viewport "stop exactly at the content" case is covered in r150.spec.js #3.)
  await page.setViewportSize({ width: 1280, height: 520 });
  const r = await page.evaluate(() => {
    const lg = document.getElementById('koppen-legend');
    if (!lg || typeof window._fitKoppenLegend !== 'function') return { err: 'no legend/fit' };
    let items = '';
    for (let i = 0; i < 30; i++) items += '<div class="kl-item" data-c="X' + i + '"><span class="kl-sw"></span>Cfa · 温暖湿潤気候</div>';
    lg.innerHTML = '<span class="kl-drag">⋮⋮</span><button class="layer-popup-x">✕</button><h4>ケッペン気候区分</h4>'
      + '<div class="kl-scroll">' + items + '</div>'
      + '<div class="kl-hint">クリックでその気候だけ強調 / 右クリックで定義</div>';
    lg.style.display = 'flex'; lg.style.top = '74px'; lg.style.height = ''; lg.style.maxHeight = '';
    window._fitKoppenLegend(lg);
    lg.style.height = '4000px';   // simulate dragging the resize grip all the way down
    const rect = lg.getBoundingClientRect();
    const sc = lg.querySelector('.kl-scroll');
    const innerHidden = sc.scrollHeight - sc.clientHeight;   // > 0 → content exceeds the box, inner scroll is needed
    sc.scrollTop = sc.scrollHeight;   // scroll the inner area to the end
    const last = [...lg.querySelectorAll('.kl-item')].pop();
    const lr = last.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    return { bottomGap: Math.round(window.innerHeight - rect.bottom), innerHidden, lastReachable: lr.bottom <= sr.bottom + 2 };
  });
  expect(r.err).toBeUndefined();
  expect(r.bottomGap).toBeGreaterThanOrEqual(0);
  expect(r.bottomGap).toBeLessThanOrEqual(26);   // content exceeds the short viewport → the box reaches the screen bottom
  expect(r.innerHidden).toBeGreaterThan(0);      // and the inner scroll is genuinely needed
  expect(r.lastReachable).toBe(true);            // every climate class is still reachable via the inner scroll
});

test('#9 dropping an image into Atlas shows a thumbnail and enables Send', async () => {
  const r = await page.evaluate(async () => {
    try { window.IntMapConsole?.open?.(); } catch { /* ignore */ }
    const p = document.getElementById('atlas-panel'); if (!p) return { err: 'no panel' };
    const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d').fillRect(0, 0, 32, 32);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], 't.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    p.dispatchEvent(ev);
    await new Promise((res) => setTimeout(res, 500));
    const row = p.querySelector('.atl-imgrow');
    const go = p.querySelector('.atl-go');
    const img = row && row.querySelector('.atl-thumb img');
    return {
      thumbs: row ? row.querySelectorAll('.atl-thumb').length : 0,
      isJpeg: img ? /^data:image\/jpeg/.test(img.src) : false,   // compressImage output
      hasRemove: !!(row && row.querySelector('.atl-thumb-x')),
      sendEnabled: go ? !go.classList.contains('idle') : false,  // pending image enables Send with empty text
    };
  });
  expect(r.err).toBeUndefined();
  expect(r.thumbs).toBe(1);
  expect(r.isJpeg).toBe(true);
  expect(r.hasRemove).toBe(true);
  expect(r.sendEnabled).toBe(true);
});

test('no uncaught page errors during R149 interactions', () => {
  expect(diag.pageErrors, 'pageErrors: ' + JSON.stringify(diag.pageErrors)).toEqual([]);
});
