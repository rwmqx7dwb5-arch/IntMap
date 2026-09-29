// The reader may zoom the page (WCAG 1.4.4); iOS WebKit alone keeps `maximum-scale`, where it caps only the
// focus zoom of small fields and cannot forbid a pinch. See dev-notes/2026-09-29-pinch-zoom-allowed.md.
//
// These checks EVALUATE the inline script that decides it, under each engine's user agent, rather than
// matching its spelling: the claim is "which viewport does each engine end up with".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const HTML_PAGES = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const index = fs.readFileSync('index.html', 'utf8');

function viewportFor(ua, maxTouchPoints = 0) {
  const meta = index.match(/<meta name="viewport" id="im-viewport" content="([^"]*)">/);
  assert.ok(meta, 'index.html declares the viewport meta with id="im-viewport"');
  // the inline <script> that follows the viewport meta is the one that adjusts it
  const after = index.slice(meta.index + meta[0].length);
  /* cut by position, not by a tag regex: the element that follows the meta is the script */
  const lower = after.toLowerCase();
  const open = lower.indexOf('<script');
  const bodyStart = lower.indexOf('>', open) + 1;
  const bodyEnd = lower.indexOf('</script', bodyStart);
  assert.ok(open >= 0 && after.slice(0, open).trim() === '' && bodyEnd > bodyStart, 'the viewport meta is followed directly by the script that adjusts it');
  const body = [null, after.slice(bodyStart, bodyEnd)];
  let content = meta[1];
  const el = { getAttribute: () => content, setAttribute: (_k, v) => { content = v; } };
  vm.runInNewContext(body[1], {
    navigator: { userAgent: ua, maxTouchPoints },
    document: { getElementById: id => (id === 'im-viewport' ? el : null) },
  });
  return content;
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

test('no page forbids the reader from zooming, on any engine', () => {
  for (const f of HTML_PAGES) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<meta name="viewport"[^>]*content="([^"]*)"/g)) {
      assert.doesNotMatch(m[1], /user-scalable\s*=\s*(no|0)/i, `${f}: user-scalable=no forbids zooming`);
    }
  }
  for (const [name, ua] of Object.entries(UA)) {
    const v = viewportFor(ua, name === 'ipadDesktopMode' ? 5 : 0);
    assert.doesNotMatch(v, /user-scalable/i, `${name}: ${v}`);
  }
});

test('engines that honour maximum-scale as a pinch limit are not given one', () => {
  for (const name of ['android', 'desktop', 'mac']) {
    assert.doesNotMatch(viewportFor(UA[name]), /maximum-scale/, name);
  }
});

test('iOS/iPadOS WebKit keeps maximum-scale=1 (it caps only the focus zoom of fields under 16 px there)', () => {
  assert.match(viewportFor(UA.iphone), /maximum-scale=1\.0/);
  // an iPad in desktop mode reports "Macintosh" — the touch points are what tell it apart from a Mac
  assert.match(viewportFor(UA.ipadDesktopMode, 5), /maximum-scale=1\.0/);
  assert.doesNotMatch(viewportFor(UA.mac, 0), /maximum-scale/);
});

test('both map canvases keep the pinch for the map (touch-action:none), so page zoom does not steal it', () => {
  const css = fs.readFileSync('css/intmap.css', 'utf8');
  assert.match(css, /\.cesium-widget canvas\{[^}]*touch-action:none/);
  const ml = fs.readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'utf8');
  assert.match(ml, /\.maplibregl-canvas-container\.maplibregl-touch-zoom-rotate\.maplibregl-touch-drag-pan[^{]*\{touch-action:none\}/);
});
