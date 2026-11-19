/* ============================================================================
 *  WHY A REMOTE READ FAILED — js/gis-http.js and its readers (offline; real services are measured by
 *  scripts/gis-live-probe.mjs, dev-notes/2026-11-19-gis-live-probe.md)
 *    ① a no-cors HEAD that resolves OPAQUE means "reachable, not readable from a page" → cors-blocked
 *    ② a genuine network failure is never relabelled (Node has no opaque responses)
 *    ③ the server's own words and a cross-origin redirect travel with http-status
 *    ④ a 200 HTML page is a login page, not "the server ignores Range"
 *    ⑤ s3://bucket/key is read through its derived https address, and says so
 *    ⑥ a STAC next link that is a POST is not followed with GET; the result is partial and says why
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainFetchFailure } from '../js/gis-http.js';
import { makeGisGeotiff } from '../js/gis-geotiff.js';
import { makeGisCog } from '../js/gis-cog.js';
import { makeGisOgcApi } from '../js/gis-ogcapi.js';

const resp = (status, body, headers, extra) => Object.assign({ status, headers: { get: (k) => (headers || {})[k.toLowerCase()] ?? null }, text: async () => body || '', json: async () => JSON.parse(body), body: null, redirected: false }, extra || {});

test('① opaque probe → cors-blocked', async () => {
  const f = async (u, o) => { if (o && o.mode === 'no-cors') return { type: 'opaque' }; throw new TypeError('Failed to fetch'); };
  const r = await explainFetchFailure('https://h.example/x.tif', f, new TypeError('Failed to fetch'));
  assert.equal(r.corsBlocked, true);
});

test('② a real network failure stays a network failure', async () => {
  const f = async () => { throw new TypeError('fetch failed'); };
  const r = await explainFetchFailure('https://h.example/x.tif', f, new TypeError('fetch failed'));
  assert.equal(r.corsBlocked, undefined);
  assert.equal(r.reason, 'fetch failed');
  const g = async () => resp(200, '');                        /* Node: a no-cors probe is a normal response */
  assert.equal((await explainFetchFailure('https://h.example/x', g, new TypeError('fetch failed'))).corsBlocked, undefined);
});

test('③ http-status carries what the server said', async () => {
  const T = makeGisGeotiff();
  const r = await T.readUrl('https://h.example/x.tif', { fetch: async () => resp(409, '<Error><Code>PublicAccessNotPermitted</Code></Error>', {}) });
  assert.equal(r.why, 'http-status');
  assert.equal(r.detail.status, 409);
  assert.match(r.detail.serverSaid, /PublicAccessNotPermitted/);
  const o = makeGisOgcApi();
  const q = await o.readItems('https://h.example/c', { fetch: async () => resp(401, 'unauthorized', {}) });
  assert.equal(q.detail.serverSaid, 'unauthorized');
});

test('④ an HTML 200 is a page, not a Range failure', async () => {
  const T = makeGisGeotiff();
  const r = await T.readUrl('https://h.example/x.tif', { fetch: async () => resp(200, '<html>login</html>', { 'content-type': 'text/html; charset=utf-8' }, { redirected: true, url: 'https://login.example/in' }) });
  assert.equal(r.why, 'http-status');
  assert.equal(r.detail.redirectedTo, 'https://login.example/in');
});

test('⑤ s3:// is derived to https and reported as derived', async () => {
  const C = makeGisCog({});
  assert.deepEqual(C.checkUrl('s3://copernicus-dem-30m/a/b.tif'), { ok: true, url: 'https://copernicus-dem-30m.s3.amazonaws.com/a/b.tif', derivedFrom: 's3://copernicus-dem-30m/a/b.tif' });
  assert.equal(C.checkUrl('s3://my.dotted.bucket/k.tif').url, 'https://s3.amazonaws.com/my.dotted.bucket/k.tif');
  assert.equal(C.checkUrl('ftp://x/y').why, 'url-not-https');
});

test('⑥ a POST next link is not followed with GET', async () => {
  const body = JSON.stringify({ type: 'FeatureCollection', features: [{ id: 'a', properties: {}, assets: {} }], links: [{ rel: 'next', href: 'https://h.example/search', method: 'POST', body: { token: 't' } }] });
  const seen = [];
  const o = makeGisOgcApi();
  const r = await o.readItems('https://h.example/search', { search: true, limit: 10, fetch: async (u) => { seen.push(u); return resp(200, body, {}); } });
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(r.next, null);
  assert.equal(r.coverage.completeness, 'partial');
  assert.equal(r.coverage.continues, true);
  assert.match(r.coverage.reason, /POST/);
});
