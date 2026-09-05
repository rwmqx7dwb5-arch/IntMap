/* ============================================================================
 *  IntMap · #R514 source checks — the model host moved upstream, and nothing here noticed
 * ----------------------------------------------------------------------------
 *  「本番 deploy の Post-deploy smoke が 2 回連続で同じ 5 本落ちている。上流の変更なのか、js 側の退行
 *    なのか、test 側の前提が古いのかを切り分けて根本原因で直すこと。」
 *
 *  MEASURED: Open-Meteo retired map-tiles.open-meteo.com (their Bunny CDN) on 2026-08-28; by
 *  2026-09-05 three public resolvers returned NXDOMAIN for it, and the successor their own maps app
 *  reads from (data-spatial.open-meteo.com) answers 403 to every Referer but *.open-meteo.com and
 *  localhost. The public origin they document for everybody else is the AWS Open Data bucket, and
 *  js/wx-models.js now reads from it. These checks pin the three things that had to move together:
 *
 *    ① the registry's URLs land on that origin AND keep the `data_spatial/<id>` segment the SDK
 *      extracts the domain from — a host change that dropped the prefix would load metadata and
 *      then fail to name the grid;
 *    ② the retired name is shipped nowhere (code, not comments: prose about the old host is history,
 *      a `dns-prefetch` for it is a request);
 *    ③ the policy the reader is shown names the host the code reads from, in both languages the
 *      policy exists in — the #R502 shape: a third-party recipient that changed while the sentence
 *      about it did not.
 *
 *  ⚠ NONE OF THIS ASKS THE NETWORK. Whether the host is up is a production question and is asked
 *  by tests/prod-smoke.spec.js (#R514) of the deployed build, before the five tests that need it.
 *  A unit test that resolved DNS would make `npm test` red on every train, and green on a runner
 *  whose resolver lies.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments are prose ABOUT the code and must never satisfy an assertion about the code (#R320) */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* Load js/wx-models.js the way the browser does (the same harness tests/r356-checks.test.mjs uses). */
function registry() {
  const win = {};
  new Function('window', read('js/wx-models.js')).call(win, win);
  return win.IntMapWxModels;
}

const RETIRED = 'map-tiles.open-meteo.com';
/* the SDK's own domain extraction — @openmeteo/weather-map-layer 0.0.19, dist/index.js:
   `xQ=/data_spatial\/(?<domain>[^/]+)/` — quoted from the pinned bundle so that ① asks the
   question the renderer asks, not one this file invents */
const SDK_DOMAIN_RE = /data_spatial\/(?<domain>[^/]+)/;

/* ── ① the registry reads from the public origin, on the path the SDK can parse ───────────── */
test('R514 ① every model URL is on the public AWS Open Data origin, with the segment the SDK parses', () => {
  const R = registry();
  assert.ok(R && R.HOST, 'js/wx-models.js publishes HOST');
  const host = new URL(R.HOST).hostname;
  assert.equal(host, 'openmeteo.s3.amazonaws.com', 'the host is the bucket Open-Meteo publishes for third parties');
  assert.equal(new URL(R.HOST).protocol, 'https:');
  for (const id of R.ids()) {
    const meta = R.metaUrl(id);
    const file = R.fileUrl(id, '2026-09-05T12:00:00Z', '2026-09-06T00:00Z');
    assert.ok(meta.startsWith(R.HOST + '/'), id + ': metadata is read from HOST');
    assert.ok(file.startsWith(R.HOST + '/'), id + ': fields are read from HOST');
    assert.equal(meta, R.HOST + '/' + id + '/latest.json');
    assert.equal(file, R.HOST + '/' + id + '/2026/09/05/1200Z/2026-09-06T0000.om', id + ': the path rule is unchanged');
    const m = SDK_DOMAIN_RE.exec(file);
    assert.ok(m && m.groups.domain === id, id + ': the SDK can still read the domain out of the file URL');
  }
});

/* ── ② the retired host is shipped nowhere ────────────────────────────────────────────────── */
test('R514 ② the retired CDN name is in no shipped code and no boot hint', () => {
  for (const p of ['js/wx-models.js', 'js/wx-ecmwf.js', 'js/weather.js', 'js/wx-wind.js', 'js/wx-source.js',
    'js/legal-text.js', 'sw.js']) {
    assert.ok(!codeOnly(read(p)).includes(RETIRED), p + ' ships no reference to ' + RETIRED);
  }
  const html = read('index.html');
  assert.ok(!html.includes(RETIRED), 'index.html does not prefetch a name that does not resolve');
  const R = registry();
  const host = new URL(R.HOST).hostname;
  assert.match(html, new RegExp('<link rel="dns-prefetch" href="https://' + host.replace(/\./g, '\\.') + '">'),
    'index.html prefetches the host the code reads from');
});

/* ── ③ the policy names the recipient the code sends the request to ───────────────────────── */
test('R514 ③ the privacy policy names the model host the code reads from, in both languages', () => {
  const R = registry();
  const host = new URL(R.HOST).hostname;
  const src = codeOnly(read('js/legal-text.js'));
  const ja = src.slice(src.indexOf('4. 第三者'), src.indexOf('5. ', src.indexOf('4. 第三者')));
  const en = src.slice(src.indexOf('4. Third parties'), src.indexOf('5. ', src.indexOf('4. Third parties')));
  assert.ok(ja.length > 500 && en.length > 500, 'both §4 sections were found');
  assert.ok(ja.includes(host), 'Privacy §4 (ja) names ' + host);
  assert.ok(en.includes(host), 'Privacy §4 (en) names ' + host);
  assert.ok(!ja.includes(RETIRED) && !en.includes(RETIRED), 'and neither still names the retired host');
  /* the bucket is Amazon's; the policy must say so — the recipient of the request is the fact */
  assert.ok(/Amazon Web Services/.test(en), 'Privacy §4 (en) says who serves the bytes');
  assert.ok(/Amazon Web Services/.test(ja), 'Privacy §4 (ja) says who serves the bytes');
});

/* ── ④ the S3 origin is outside Open-Meteo's daily-quota circuit breaker, deliberately ─────── */
test('R514 ④ the bucket is not mistaken for an Open-Meteo API host by the quota breaker', () => {
  /* js/wx-source.js trips a day-long breaker on Open-Meteo's `Daily API request limit` 429. The
     bucket has no such quota and must not share the breaker: a tripped API breaker used to take
     the model metadata down with it. Asked of the shipped predicate, not of a copy. */
  const win = { location: { href: 'https://rwmqx7dwb5-arch.github.io/IntMap/' } };
  const src = read('js/wx-source.js');
  const iife = src.indexOf('(function');
  assert.ok(iife >= 0, 'js/wx-source.js is an IIFE');
  let Wx = null;
  try {
    new Function('window', 'location', 'fetch', 'localStorage', src.slice(iife)).call(win, win, win.location,
      () => Promise.reject(new Error('no network in this test')), null);
    Wx = win.IntMapWx;
  } catch (e) { assert.fail('js/wx-source.js did not load against a bare window: ' + e.message); }
  assert.ok(Wx && typeof Wx.isOpenMeteo === 'function', 'IntMapWx.isOpenMeteo exists');
  const R = registry();
  assert.equal(Wx.isOpenMeteo(R.metaUrl(R.defaultId())), false, 'the bucket is not an Open-Meteo API host');
  assert.equal(Wx.isOpenMeteo('https://api.open-meteo.com/v1/forecast'), true, 'while the API still is');
});
