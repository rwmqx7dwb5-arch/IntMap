// Run with `node scripts/web-browse-runtime-probe.mjs` after installing Chromium.
// A real Chromium run with a local fixture and no application server or external network.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browse, parseHtml } from '../supabase/functions/_shared/web-browse.js';
import { render } from '../supabase/functions/_shared/web-render.js';

const PAGE = 'http://harbor.example.test/registry';
const GEO = 'http://layers.example.test';
const html = `<!doctype html><title>Survey Desk</title><main>Port condition survey data</main>
<script>
  const api = 'http://' + ['layers', 'example', 'test'].join('.');
  const path = ints => '/' + String.fromCharCode(...ints);
  fetch(api + path([115,117,114,118,101,121,115]));
  fetch(api + path([114,101,100,105,114,101,99,116]));
  fetch(api + path([109,105,115,115,105,110,103]));
  fetch(api + path([115,101,97,108,101,100]) + '?' + ['sig', 'example'].join('='));
  fetch(api + path([112,111,115,116]), {method: 'POST', body: 'a'});
  fetch(api + path([97,117,116,104]), {headers: {Authorization: 'Bearer fixture-only'}});
  fetch(api + path([111,112,97,113,117,101]) + '?' + ['state', 'example'].join('='));
  document.cookie = 'fixture=temporary; SameSite=Lax';
  fetch(path([98,121,45,99,111,111,107,105,101]));
  fetch('http://' + ['closed', 'example', 'test'].join('.') + path([104,105,100,100,101,110]));
  fetch(api + path([98,111,117,110,99,101]));
</script>`;
const feature = { type: 'Feature', properties: { pier: 'Aster' }, geometry: { type: 'Point', coordinates: [143.1, -12.4] } };

async function connection(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  return socket;
}

async function probe() {
  assert.deepEqual(parseHtml(html, PAGE).assets, []);
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization');
    if (req.url === '/registry') {
      res.setHeader('content-type', 'text/html'); res.end(html);
    } else if (req.url === '/redirect' || req.url === '/bounce') {
      res.writeHead(302, { location: req.url === '/redirect' ? GEO + '/surveys' : 'http://closed.example.test/hidden' }).end();
    } else {
      res.statusCode = req.url === '/missing' ? 404 : 200;
      res.setHeader('content-type', 'application/geo+json');
      res.end(JSON.stringify({ type: 'FeatureCollection', features: [feature] }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const dir = await mkdtemp(join(tmpdir(), 'intmap-render-cdp-'));
  const port = server.address().port;
  const chrome = spawn(chromium.executablePath(), ['--headless', '--no-sandbox', '--no-proxy-server', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, `--host-resolver-rules=MAP *.example.test 127.0.0.1:${port}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const exit = once(chrome, 'exit');
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chromium debug endpoint did not open: ' + output)), 10000);
      chrome.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-5000);
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      chrome.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    const resolvesPublic = async (host) => host === 'harbor.example.test' || host === 'layers.example.test';
    const result = await render({ url: PAGE, networkAssets: true, screenshot: false }, {
      cfg: { accountId: 'fixture', token: 'fixture' }, resolvesPublic,
      openNetworkSocket: () => connection(endpoint),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.page.assetObservation, { status: 'observed', matches: 1 });
    assert.deepEqual(result.page.assets, [{ href: GEO + '/surveys', kind: 'geojson', via: 'network-response' }]);
    assert.equal(requests.filter((request) => request === 'GET /surveys').length, 2);
    for (const seen of ['GET /missing', 'GET /bounce']) assert.ok(requests.includes(seen), seen);
    for (const blocked of ['GET /sealed?sig=example', 'POST /post', 'GET /auth', 'GET /hidden']) assert.ok(!requests.includes(blocked), blocked);
    const acquired = await browse({ action: 'download', url: result.page.assets[0].href }, {
      resolvesPublic, userAgent: 'fixture', fetch: (url, options) => fetch(`http://127.0.0.1:${port}${new URL(url).pathname}`, options),
    });
    assert.equal(acquired.ok, true);
    const features = JSON.parse(Buffer.from(acquired.file.b64, 'base64').toString()).features;
    assert.deepEqual(features, [feature]);
    console.log(`Static assets: 0. Runtime assets: ${result.page.assetObservation.matches}. Acquired GeoJSON features: ${features.length}.`);
  } finally {
    if (chrome.exitCode === null) chrome.kill();
    await exit.catch(() => {});
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 75 });
  }
}

await probe();
