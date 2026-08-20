/* ============================================================================
 *  IntMap · #R286 source checks — a tile template is not always a URL
 * ----------------------------------------------------------------------------
 *  tests/monitors.spec.js's console-error gate failed intermittently with twenty
 *  refusals of 「Loading the image 'imapsat://2/0/2' violates … "img-src 'self'
 *  https: data: blob:"」. `imapsat://` is IntMap's OWN scheme — js/sat-proto.js
 *  registers it — so a tile served through it is never a browser image load at
 *  all. The message therefore meant the raw template was reaching the browser
 *  instead of the handler, and it was: js/dash-extended.js's speculative prefetch
 *  read the ACTIVE STYLE's tile template and assigned it to `new Image().src`.
 *  The satellite source has held the protocol URL since #R158 and has been the
 *  DEFAULT basemap since #R207, so the ordinary case warmed nothing at all and
 *  paid for it in console errors.
 *
 *  ⚠ THE TWO WAYS TO MAKE THE SYMPTOM GO AWAY WITHOUT FIXING ANYTHING ARE ALSO
 *  CHECKED HERE — widening index.html's `img-src` to admit `imapsat:`, and adding
 *  the message to tests/helpers/network.js's benign list. Both are asserted
 *  BEHAVIOURALLY (§ ③ § ④) rather than by looking for a spelling.
 *
 *  ⚠ …AND SO IS THE REASON REFUSING IS SAFE (§ ⑤). The fix says «satellite is
 *  warmed by js/tile-warm.js instead». That is a claim about another file, so it
 *  is measured rather than left in a comment — #R278's rule: a rule written in
 *  prose and never measured is a rule nobody is holding.
 *
 *  ⚠ Sources are read through scripts/eol.mjs (#R283) and stripped of comments
 *  before every search, because the notes those files now carry quote the very
 *  expressions these checks require to be absent.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readLF } from '../scripts/eol.mjs';
import { isBenign } from './helpers/network.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* the message Chromium logged, verbatim, for one of the twenty tiles */
const CSP_MESSAGE = "Loading the image 'imapsat://2/0/2' violates the following Content Security "
  + 'Policy directive: "img-src \'self\' https: data: blob:". The action has been blocked.';

/* the body of the speculative prefetch, comments removed, from its own source */
function prefetchBody() {
  const src = codeOnly(read('js/dash-extended.js'));
  const a = src.indexOf('function prefetch(lng,lat,z){');
  const b = src.indexOf("GE().events.on('moveend'", a);
  assert.ok(a >= 0 && b > a, 'js/dash-extended.js still has the speculative prefetch');
  return src.slice(a, b);
}

/* ── ① the prefetch decides on the SCHEME, and it decides before it builds an <img> ────────────
   Asserted as an ORDER, not as the presence of a line: a guard placed after the loop would satisfy
   "the predicate is called" and change nothing whatsoever. */
test('R286 ①: the prefetch refuses an unloadable template before it can reach an <img>', () => {
  const body = prefetchBody();
  const guard = body.indexOf('browserLoadable(tpl)');
  const img = body.indexOf('new Image()');
  assert.ok(guard >= 0, 'it asks whether the template is something the browser can load');
  assert.ok(img >= 0, 'it still warms ordinary http(s) templates through an <img>');
  assert.ok(guard < img, 'and it asks BEFORE it builds one, or the guard changes nothing');
  assert.match(body, /if\(!browserLoadable\(tpl\)\)\{[\s\S]*?return; \}/,
    'a template it cannot load ends the call rather than being substituted into anyway');
  /* …and the refusal is observable, so a path that quietly stopped running cannot pass for a
     path that correctly declined (tests/smoke.spec.js R286 ⑳ reads this). */
  assert.match(body, /refused:true/, 'the refusal is recorded');
  assert.match(codeOnly(read('js/dash-extended.js')), /window\.SpeculativePrefetch=\{ prefetch, last:\(\)=>_last \}/,
    'and exported, so the browser test can tell "refused" from "never ran"');
});

/* ── ② the predicate itself, in BOTH directions ────────────────────────────────────────────────
   #R283's rule: a check that only proved the refusal would also pass for `()=>false`, which would
   silently switch the whole prefetch off. The accepted half is the half that keeps it alive. */
test('R286 ②: it accepts what the browser can load and refuses every scheme this app registers', () => {
  const m = /const browserLoadable=(\(tpl\)=>\{[\s\S]*?\});/.exec(codeOnly(read('js/dash-extended.js')));
  assert.ok(m, 'the predicate is one named expression, so it can be measured here rather than copied');
  const loadable = new Function(`return (${m[1]});`)();

  for (const ok of ['https://server.arcgisonline.com/ArcGIS/.../tile/{z}/{y}/{x}',
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'http://127.0.0.1:4173/tiles/{z}/{x}/{y}.png',
    '//tiles.example/{z}/{x}/{y}.png',
    'tiles/{z}/{x}/{y}.png']) {
    assert.equal(loadable(ok), true, `must keep warming ${ok}`);
  }
  /* the schemes this app registers with the renderer — see the addProtocol call sites */
  for (const bad of ['imapsat://{z}/{y}/{x}', 'pmtiles://x/{z}/{x}/{y}', 'om://x',
    '  imapsat://2/0/2', 'IMAPSAT://2/0/2']) {
    assert.equal(loadable(bad), false, `must refuse ${bad}`);
  }
});

/* ── ③ the fix is not a wider policy ──────────────────────────────────────────────────────────
   Parsed out of the meta tag and compared as a SET, so `img-src 'self' https: data: blob: imapsat:`
   fails whatever order somebody writes it in. */
test('R286 ③: index.html\'s img-src still admits no custom scheme', () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read('index.html'));
  assert.ok(csp, 'the page still carries its CSP meta tag');
  const img = csp[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src '));
  assert.ok(img, 'and an img-src directive');
  const sources = img.slice('img-src '.length).trim().split(/\s+/);
  assert.deepEqual(new Set(sources), new Set(["'self'", 'https:', 'data:', 'blob:']),
    'widening this to admit imapsat: would hide the defect rather than repair it');
});

/* ── ④ …nor a wider benign list ───────────────────────────────────────────────────────────────
   Asked of the function the gate actually calls, with the message Chromium actually logged. */
test('R286 ④: a CSP refusal is still a real console error, not a benign one', () => {
  assert.equal(isBenign(CSP_MESSAGE), false,
    'tests/helpers/network.js must keep classifying a CSP violation as a genuine failure');
  assert.equal(isBenign("Loading the image 'pmtiles://a/1/2/3' violates the following Content "
    + 'Security Policy directive: "img-src \'self\' https: data: blob:". The action has been blocked.'),
  false, 'and not only for the one scheme that happened to be caught');
  /* …and the list must still do its own job, or this check could be passed by breaking it */
  assert.equal(isBenign('Failed to load resource: net::ERR_FAILED'), true,
    'a blocked external host is still benign under the hermetic policy');
});

/* ── ⑤ …and the imagery the prefetch declines IS warmed, by the module that owns it ────────────
   js/tile-warm.js warms satellite on the same `moveend`, and #R206 made it build the URL from the
   protocol's own exported builder rather than from a template — exactly the step that was missing
   in js/dash-extended.js. Without this, "refuse" and "drop the feature" look the same. */
test('R286 ⑤: js/tile-warm.js still owns satellite warming, through the protocol\'s own URL', () => {
  const warm = codeOnly(read('js/tile-warm.js'));
  assert.match(warm, /events\.on\('moveend'[\s\S]{0,200}?predictivePrefetch/,
    'the satellite prefetch still runs on moveend');
  assert.match(warm, /HOST\.mapType!=='sat'\)\s*return/,
    'and satellite is the case it runs for');
  assert.match(warm, /window\.IntMapSatProto&&window\.IntMapSatProto\.tileUrl/,
    'and it asks the protocol for the URL it will actually fetch (#R206)');

  const proto = codeOnly(read('js/sat-proto.js'));
  assert.match(proto, /tileUrl:\(z,y,x\)=>_satUrl\(/, 'which the protocol still exports');
  assert.match(proto, /_SAT_HOSTS=\['https:\/\/[^']+','https:\/\/[^']+'\]/,
    'and it resolves to ordinary https origins — something the browser can load');
  assert.match(proto, /_satUrl=\(z,y,x\)=>_SAT_HOSTS\[\(x\+y\)&1\]/,
    'chosen by the (x+y)&1 host rule the render path uses');
});

/* ── ⑥ the OTHER defect this round hit: a check that was reading bytes instead of content ──────
   tests/r280-checks ② asserts that every doc-facts rule goes red when its fact is made wrong, and
   it locates each fact with an anchor written using LF. `privacy.html` is not pinned by
   .gitattributes, so a `core.autocrlf` checkout hands it back with CRLF and the `legal` anchor
   could not be found — red on Windows, green in CI, for a reason that has nothing to do with what
   it asserts. That is #R283's finding in a fourth file, and § ② now widens the ANCHOR (it must not
   normalise what it reads: it writes the same text back to restore the file).
   ⚠ BOTH DIRECTIONS, for #R283's reason: a widener that matched everything would pass the first
   half and is exactly how this would be "fixed" by weakening it. */
test('R286 ⑥: r280 ②\'s anchor follows the checkout\'s line endings and relaxes nothing else', () => {
  const m = /const anchorRe = (\(s\) => new RegExp\([\s\S]*?\));\n/.exec(read('tests/r280-checks.test.mjs'));
  assert.ok(m, 'tests/r280-checks.test.mjs still builds its anchors through one named helper');
  const anchorRe = new Function(`return (${m[1]});`)();

  const anchor = '<script src="./js/legal-text.js"></script>\n';
  assert.equal(anchorRe(anchor).test('x<script src="./js/legal-text.js"></script>\ny'), true,
    'an LF checkout still matches — this is what CI reads');
  assert.equal(anchorRe(anchor).test('x<script src="./js/legal-text.js"></script>\r\ny'), true,
    'THE FIX: a CRLF checkout matches the same anchor');
  assert.equal(anchorRe(anchor).test('x<script src="./js/legal-text.js"></script>y'), false,
    '…and a line break that is genuinely ABSENT is still a failure');
  /* metacharacters stay literal — the widening is about line breaks and nothing else */
  assert.equal(anchorRe('a.c').test('abc'), false, 'a dot in an anchor is a dot');
  assert.equal(anchorRe('a.c').test('a.c'), true);
  assert.equal(anchorRe('x$y').test('x$y'), true, 'and a dollar sign is a dollar sign');

  /* …and it finds the real anchor in the real file, whichever way this machine checked it out */
  const raw = readFileSync(resolve(ROOT, 'privacy.html'), 'utf8');
  assert.equal(anchorRe(anchor).test(raw), true,
    'privacy.html still loads the one copy of the policy text, on this checkout');
});
