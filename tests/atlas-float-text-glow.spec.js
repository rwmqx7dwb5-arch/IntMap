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
