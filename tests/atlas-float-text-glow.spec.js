/* ============================================================================
 *  atlas-float-text-glow — the floating Atlas, MEASURED in the real page (computed styles, not spellings)
 * ----------------------------------------------------------------------------
 *  The reader's standing asks for the floating card:
 *    ① every piece of text carries a glow on its GLYPHS (text-shadow);
 *    ② no rectangle stands in for that glow — no fill, drop shadow or blurred plate behind answer fragments;
 *    ③ the reader's own message is a BUBBLE (a visible fill and edge), the panel's own, on a light map and a dark one.
 *  Every element of the card is walked, including pieces that no stylesheet rule names (a made-up tag below stands for
 *  "what is added tomorrow"), so a new part cannot dodge the rule by being new.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => { try { return !!window.__imap && window.__imap.isStyleLoaded(); } catch (_) { return false; } }, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await window.IntMapLazy.need('atlasConsole');
    const s = document.getElementById('setting-atlas-display'); s.value = 'float'; s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => { const f = document.getElementById('atlas-float'); return f && f.classList.contains('on') && f.querySelector('.atl-chat'); }, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const chat = document.querySelector('#atlas-float .atl-chat');
    const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; };
    chat.replaceChildren();
    el('div', 'atl-b u', chat, 'What changed in Japan after 1871?');
    const md = el('div', 'atl-md', el('div', 'atl-b a', chat));
    el('h3', '', md, 'Prefectures');
    const p = el('p', '', md, 'The domains became '); el('code', 'atl-code-i', p, 'ken');
    el('li', 'atl-li', el('ul', 'atl-ul', md), 'Osaka');
    const tb = el('tbody', '', el('table', '', md)); el('th', '', el('tr', '', tb), 'Year'); el('td', '', el('tr', '', tb), '1871'); el('td', '', el('tr', '', tb), '1872');
    el('button', '', md, 'Show on map');
    const aside = el('aside', '', md); aside.id = 'atl-test-new'; el('em', '', aside, 'a part nobody wrote a rule for');
    el('div', 'atl-srcs', md.parentElement, 'Sources: Wikipedia');
  });
});
test.afterAll(async () => { await page.context().close(); });

const measure = () => page.evaluate(() => {
  const root = document.getElementById('atlas-float');
  const clear = (c) => c === 'transparent' || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const noGlow = [], plates = []; let bubble = null;
  const input = getComputedStyle(root.querySelector('.atl-inbar'));
  const composer = { fill: input.backgroundColor, blur: input.backdropFilter, edge: input.borderTopColor, radius: input.borderRadius };
  const pane = root.classList.contains('bg');
  root.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(e);
    const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
    if (text && cs.textShadow === 'none') noGlow.push((e.className || e.tagName) + '');
    if (e.matches('.atl-b.u')) { bubble = { fill: cs.backgroundImage, edge: cs.borderTopWidth !== '0px' && !clear(cs.borderTopColor) }; }
    if (e.closest('.atl-b.u,.atl-inbar') || (pane && e.matches('.atl-chat,.atl-float-bg'))) return;
    const bad = [];
    if (cs.backgroundImage !== 'none' || !clear(cs.backgroundColor)) bad.push('fill');
    if (cs.boxShadow !== 'none') bad.push('box-shadow');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.push('backdrop');
    if (bad.length) plates.push((e.className || e.tagName) + ':' + bad.join('+'));
  });
  const neu = getComputedStyle(document.querySelector('#atl-test-new em')).textShadow;
  return { noGlow, plates, bubble, neu, composer };
});

for (const theme of ['dark', 'light']) {
  test(`floating Atlas on a ${theme} map uses glyph glow and the same frosted composer in both modes`, async () => {
    await page.evaluate((t) => { const s = document.getElementById('setting-theme'); s.value = t; s.dispatchEvent(new Event('change', { bubbles: true })); }, theme);
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
    const mode = page.locator('#atlas-float .atl-float-bg');
    const chat = page.locator('#atlas-float .atl-chat');
    let bareComposer, bareBubble;
    for (const pane of [false, true]) {
      if ((await mode.getAttribute('aria-pressed')) !== String(pane)) await mode.evaluate((b) => b.click());
      await expect(mode).toHaveAttribute('aria-pressed', String(pane));
      await expect(chat).toHaveCSS('backdrop-filter', pane ? /blur\(/ : 'none');
      await expect.poll(async () => (await measure()).plates, { message: 'a fill, shadow or blurred plate behind a piece of the conversation' }).toEqual([]);
      const m = await measure();
      expect(m.composer.blur, 'the composer has a frosted surface even without the conversation pane').toContain('blur(');
      expect(m.noGlow, 'text without a glow').toEqual([]);
      expect(m.neu, 'a part no rule names still glows').not.toBe('none');
      expect(m.bubble, 'the reader’s message exists').not.toBeNull();
      expect(m.bubble.fill, 'the bubble has a fill').toContain('linear-gradient');
      expect(m.bubble.edge, 'the bubble has an edge').toBe(true);
      if (pane) {
        expect(m.composer).toEqual(bareComposer);
        expect(m.bubble).toEqual(bareBubble);
      } else {
        bareComposer = m.composer;
        bareBubble = m.bubble;
      }
    }
  });
}

test('the map centers in the visible strip beside Atlas and restores its center when Atlas closes', async () => {
  const set = (id, value) => page.evaluate(([id, value]) => {
    const setting = document.getElementById(id);
    setting.value = value;
    setting.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
  const measureCenter = (style, visible) => page.evaluate(([style, visible]) => {
    const root = document.getElementById('atlas-float');
    if (root.classList.contains('on') !== visible) return { ready: false, classes: root.className };
    const engine = window.IntMapGeoEngine;
    const canvas = engine.render.canvas().getBoundingClientRect();
    const sidebar = document.getElementById('sidebar');
    const left = visible ? root.getBoundingClientRect().right
      : style === 'translucent' && !sidebar.classList.contains('collapsed') ? sidebar.getBoundingClientRect().right : canvas.left;
    const center = engine.camera.getCenter();
    const projected = engine.coords.project(center);
    const expected = (left + canvas.right) / 2;
    const actual = canvas.left + projected.x;
    return { centered: Math.abs(actual - expected) < 2, actual, expected, padding: engine.camera.getPadding(), center, projected,
      canvas: canvas.toJSON(), map: document.getElementById('map').getBoundingClientRect().toJSON(), atlas: root.getBoundingClientRect().toJSON(),
      rootClass: root.className, sidebarClass: sidebar.className, bodyClass: document.body.className, projection: engine.camera.getProjection?.(), style, visible };

  }, [style, visible]);
  const checkCenter = (style, visible) => expect.poll(async () => {
    const measurement = await measureCenter(style, visible);
    return measurement.centered ? 'centered' : JSON.stringify(measurement);
  }).toBe('centered');
  const close = page.locator('#atlas-float .atl-float-x');
  for (const style of ['opaque', 'translucent']) {
    await set('setting-sidebar-style', style);
    await checkCenter(style, true);
    // A responsive pass at the same width must preserve the desktop overlay's inset.
    await page.evaluate(() => new Promise((resolve) => {
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await checkCenter(style, true);
    await close.evaluate((button) => button.click());
    await checkCenter(style, false);
    await set('setting-atlas-display', 'float');
  }
});

test('Atlas keeps the reading position while switching from the map to the tab and back', async () => {
  // The preceding test exercises a sidebar style that can start with the sidebar collapsed.
  await page.evaluate(() => {
    if (document.getElementById('sidebar').classList.contains('collapsed')) document.getElementById('btn-toggle-sidebar').click();
  });
  await expect(page.locator('#sidebar')).not.toHaveClass(/\bcollapsed\b/);
  const chat = page.locator('#atlas-panel .atl-chat');
  await chat.evaluate((node) => {
    node.append(...Array.from({ length: 70 }, (_, index) => {
      const message = document.createElement('div');
      message.className = 'atl-b a';
      message.textContent = 'Map evidence ' + index;
      return message;
    }));
  });
  // Hand scrolling to the reader and wait for the old-engine fallback to see the latest position.
  const scroll = (top) => chat.evaluate(async (node, top) => {
    node.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    if (node.scrollTop === top) return;
    const changed = new Promise((resolve) => node.addEventListener('scroll', resolve, { once: true }));
    node.scrollTo({ top, behavior: 'instant' });
    await changed;
  }, top);
  const topIn = (container) => page.evaluate((container) =>
    document.querySelector(container + ' #atlas-panel .atl-chat')?.scrollTop ?? -1, container);
  const tab = page.locator('#btn-community');
  const news = page.locator('#btn-news');
  for (const fallback of [false, true]) {
    if (fallback) await page.evaluate(() => {
      document.getElementById('atlas-feed').moveBefore = undefined;
      document.querySelector('.atl-float-card').moveBefore = undefined;
    });
    try {
      await scroll(640);
      await tab.evaluate((button) => button.click());
      await expect.poll(() => topIn('#atlas-feed')).toBe(640);
      await scroll(920);
      await news.evaluate((button) => button.click());
      await expect.poll(() => topIn('#atlas-float')).toBe(920);
    } finally {
      if (fallback) await page.evaluate(() => {
        delete document.getElementById('atlas-feed').moveBefore;
        delete document.querySelector('.atl-float-card').moveBefore;
      });
    }
  }
});

test('the floating card stays at full opacity while the reader pauses', async () => {
  const card = page.locator('#atlas-float .atl-float-card');
  await expect(card).toHaveCSS('opacity', '1');
  await page.clock.install();
  await card.dispatchEvent('pointerleave');
  await page.clock.fastForward(7_000);
  await expect(card).toHaveCSS('opacity', '1');
});

test('the first painted frame takes each new opacity value and leaves an explicit fade available', async () => {
  const result = await page.evaluate(async () => {
    const map = window.__imap, layers = window.IntMapGeoEngine.layers;
    const id = 'opacity-render-probe';
    const style = map.style;
    const paint = () => style.getLayer(id).paint.get('background-opacity');
    const frame = () => new Promise(resolve => { map.once('render', () => resolve(paint())); map.triggerRepaint(); });
    layers.add({ id, type:'background', paint:{ 'background-opacity':0.4 } });
    await frame();
    // The old write path is the engine's default transition.
    map.setPaintProperty(id, 'background-opacity', 0.8);
    const before = await frame();
    const after = [];
    for (const opacity of [0.2, 0.93, 0, 0.61]) {
      layers.setPaint(id, 'background-opacity', opacity);
      after.push(await frame());
    }
    layers.setPaint(id, 'background-opacity-transition', { duration:1000, delay:0 });
    layers.setPaint(id, 'background-opacity', 1);
    const fading = await frame();
    layers.setPaint(id, 'background-opacity', 0.17, { immediate:true });
    return { before, after, fading, immediate:await frame() };
  });
  expect(result.before).toBeLessThan(0.8);
  expect(result.after).toEqual([0.2, 0.93, 0, 0.61]);
  expect(result.fading).toBeLessThan(1);
  expect(result.immediate).toBe(0.17);
});

test('a new legend and renderer popup use unoccupied positions beside floating Atlas', async () => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.evaluate(async () => {
    const { camera } = window.IntMapGeoEngine;
    camera.setProjection('flat');
    camera.jumpTo({ center:[0,0], zoom:3, pitch:0, bearing:0 });
    await window.IntMapLazy.need('atlasConsole');
    const settings = document.getElementById('setting-atlas-display');
    settings.value = 'float';
    settings.dispatchEvent(new Event('change', { bubbles:true }));
  });
  const atlas = page.locator('#atlas-float.on .atl-float-card');
  await expect(atlas).toBeVisible();
  await page.evaluate(() => {
    const host = document.getElementById('map-container');
    const atlas = host.querySelector('.atl-float-card');
    const chat = atlas.querySelector('.atl-chat');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'A map conversation with explanation. '.repeat(120);
    chat.replaceChildren(paragraph);

    const legend = document.createElement('div');
    legend.className = 'data-legend';
    legend.id = 'overlay-test-legend';
    legend.style.cssText = 'display:block;position:absolute;width:190px;height:120px;';
    const label = document.createElement('button');
    label.textContent = 'Legend control';
    legend.append(label);
    host.append(legend);
    window._tileLegends();
  });
  const legend = page.locator('#overlay-test-legend');
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  await expect.poll(async () => overlap(await atlas.boundingBox(), await legend.boundingBox())).toBe(0);

  await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const canvas = E.render.canvas().getBoundingClientRect();
    const r = document.getElementById('overlay-test-legend').getBoundingClientRect();
    const target = E.coords.unproject([r.left - canvas.left + 80, r.top - canvas.top + 80]);
    E.ui.addPopup({ className:'overlay-test-popup', closeOnClick:false, anchor:'bottom' }, target,
      '<div style="width:155px;height:100px">Popup at a selected place</div>');
  });
  const popup = page.locator('.overlay-test-popup');
  await expect(popup).toBeVisible();
  await expect.poll(async () => {
    const r = await popup.boundingBox();
    return overlap(await atlas.boundingBox(), r) + overlap(await legend.boundingBox(), r);
  }).toBe(0);

  await page.evaluate(() => {
    const host = document.getElementById('map-container');
    const opened = host.querySelector('#overlay-test-legend').getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const card = document.createElement('section');
    card.id = 'overlay-test-window';
    card.style.cssText = 'position:absolute;width:160px;height:110px;';
    card.style.left = opened.left - frame.left + 'px';
    card.style.top = opened.top - frame.top + 'px';
    card.textContent = 'Tools for the displayed data';
    host.append(card);
    window.registerWindow(card);
  });
  await expect.poll(async () => {
    const r = await page.locator('#overlay-test-window').boundingBox();
    if (!r) return -1;
    return overlap(await atlas.boundingBox(), r) + overlap(await legend.boundingBox(), r) + overlap(await popup.boundingBox(), r);
  }).toBe(0);
});
