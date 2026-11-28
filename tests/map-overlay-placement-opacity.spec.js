import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { bootEngine } from './helpers/engine.js';

test.beforeEach(async ({ context, page }) => {
  await installHermeticRouting(context);
  await bootEngine(page, 'maplibre', { timeout:45_000 });
  await page.waitForFunction(() => window.__imap?.isStyleLoaded?.());
});

test('the first painted frame takes each new opacity value and leaves an explicit fade available', async ({ page }) => {
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

test('a new legend and renderer popup use unoccupied positions beside floating Atlas', async ({ page }) => {
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
    chat.append(paragraph);

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
