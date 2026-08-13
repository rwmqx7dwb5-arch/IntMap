/* ============================================================================
 *  IntMap · about.html — the public homepage's source-level invariants
 * ----------------------------------------------------------------------------
 *  「/ = IntMap本体、別URL/パスにホームページ」「IntMap本体を変更することは禁止」
 *
 *  Node-only, no browser: these are the properties that, if they quietly stopped holding, would
 *  break the page in a way nobody would notice until a visitor did — a missing asset in the deploy,
 *  a translation key that stopped resolving, an HTML sink appearing in a page that reads `?lang=`,
 *  or the homepage growing a claim about IntMap that the app itself contradicts.
 *
 *  ⚠ THE ONE INVARIANT THAT IS NOT ABOUT THIS PAGE: index.html must not change. The homepage was
 *  added under an explicit "do not touch the application" constraint, and the cheapest way for that
 *  to be violated later is for somebody to "just add a link" to the app's markup. §6 states it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const page = read('about.html');
const css = read('css/about.css');
const js = read('js/about.js');
/* ⚠ THE CHECKS BELOW READ THE PAGE WITHOUT ITS COMMENTS, and that is not a convenience.
   about.html carries long <!-- --> notes explaining WHY each decision is what it is — including a
   note that names the stale "30 uses per day" figure it exists to prevent, and one that says the
   parser "reaches the <img> six hundred lines down". Both tripped their own guard on the first run.
   A note about a defect must not read as the defect; §5 and §6 therefore ask their questions of the
   markup that ships. (§3 does the same for js/about.js's comments.)

   ⚠ AND IT LOOPS TO A FIXED POINT. A single `.replace(/<!--[\s\S]*?-->/g, '')` is the classic
   incomplete multi-character sanitisation — `<!-- <!-- --> -->` leaves a `<!--` behind — and CodeQL
   failed the pull request for it (js/incomplete-multi-character-sanitization). It is a test helper
   rather than a security boundary, but "it is only a test" is exactly the argument that puts the
   pattern in the codebase for somebody to copy later, and js/page-i18n.js already carries this
   project's ruling on regex "sanitisers". Repeating until nothing changes has no such edge. */
function stripHtmlComments(s) {
  var prev;
  do { prev = s; s = s.replace(/<!--[\s\S]*?-->/g, ''); } while (s !== prev);
  return s;
}
const pageOnly = stripHtmlComments(page);

/* ── ① the page ships: every asset it names is in the tree AND in the Vite copy list ───────── */
test('homepage ①: every local asset about.html references exists', () => {
  const refs = new Set();
  for (const m of page.matchAll(/(?:src|href|srcset)\s*=\s*"([^"]+)"/g)) refs.add(m[1]);
  const missing = [];
  for (const r of refs) {
    if (/^(https?:|data:|mailto:|#)/i.test(r)) continue;
    const clean = r.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    if (!clean || !/^[\w\-./]+$/.test(clean)) continue;
    if (!existsSync(join(ROOT, clean))) missing.push(clean);
  }
  assert.deepEqual(missing, [], 'about.html references files that do not exist: ' + missing.join(', '));
});

test('homepage ①: the Vite build copies the page, its stylesheet, its script and its pictures', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  /* ⚠ about.html is NOT a Rollup input — it is a shell with no imports, copied verbatim like
     sources.html and science.html. So every one of its own files has to be named here or it
     simply is not in dist/, and the page 404s in production while passing every local test.
     That is exactly how the first build of this page shipped without its CSS. */
  for (const a of ['about.html', 'css/about.css', 'js/about.js', 'about']) {
    assert.ok(STATIC_ASSETS.includes(a), `vite.config.js STATIC_ASSETS is missing "${a}" — it would not reach dist/`);
  }
  /* js/locales/about.<lang>.js rides along in the `js/locales` directory entry */
  assert.ok(STATIC_ASSETS.includes('js/locales'), 'the locale directory must still be copied whole');
});

/* ── ② the homepage is additive: index.html is untouched by it ─────────────────────────────── */
test('homepage ②: the application does not depend on the homepage', () => {
  const index = read('index.html');
  assert.equal(/about\.html/.test(index), false,
    'index.html references about.html — the homepage must be additive, not a change to the app');
  /* …and the reverse direction IS expected: the homepage is what links INTO the app. */
  assert.match(page, /href="\.\/index\.html"/, 'the homepage must actually link to IntMap');
  assert.match(page, /href="\.\/science\.html"/, 'the homepage must link to the method page');
  assert.match(page, /href="\.\/sources\.html"/, 'the homepage must link to the sources page');
});

/* ── ③ no HTML sink. The page reads `?lang=`; it must have nowhere for markup to land ──────── */
test('homepage ③: js/about.js never writes HTML', () => {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
    assert.equal(code.includes(sink), false,
      `js/about.js uses ${sink} — every string on this page must go through textContent (see its header)`);
  }
  /* the <script src> it builds for a locale file must come from its own table, never from the URL */
  assert.match(js, /for \(var i = 0; i < HAVE\.length; i\+\+\) if \(HAVE\[i\] === code\) \{ tag = HAVE\[i\]; break; \}/,
    'the locale URL must be assembled from HAVE, not from the argument');
});

/* ── ④ i18n: every key the markup asks for is answerable in every shipped language ──────────── */
test('homepage ④: every data-i key in the markup exists in every locale file', () => {
  const keys = new Set([...page.matchAll(/data-i="([^"]+)"/g)].map((m) => m[1]));
  const altKeys = new Set([...page.matchAll(/data-i-alt="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 80, `expected the page to be substantially translatable, found ${keys.size} keys`);

  const locales = readdirSync(join(ROOT, 'js/locales')).filter((f) => /^about\.[\w-]+\.js$/.test(f));
  assert.ok(locales.length >= 1, 'no about-locale files found');

  for (const f of locales) {
    const src = read('js/locales/' + f);
    const missing = [...keys].filter((k) => !new RegExp('(^|[\\s{,])' + k + '\\s*:').test(src));
    assert.deepEqual(missing, [], `js/locales/${f} is missing keys: ${missing.join(', ')}`);
    const missingAlt = [...altKeys].filter((k) => !new RegExp('(^|[\\s{,])' + k + '\\s*:').test(src));
    assert.deepEqual(missingAlt, [], `js/locales/${f} is missing alt keys: ${missingAlt.join(', ')}`);
  }
});

test('homepage ④: every language in HAVE has a locale file, and every locale file is in HAVE', () => {
  const have = /var HAVE = \[([^\]]+)\]/.exec(js);
  assert.ok(have, 'js/about.js no longer declares HAVE');
  const listed = [...have[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
  assert.ok(listed.includes('en'), 'English must stay the fallback');
  const files = readdirSync(join(ROOT, 'js/locales')).filter((f) => /^about\.[\w-]+\.js$/.test(f))
    .map((f) => f.slice('about.'.length, -3));
  for (const tag of listed) {
    if (tag === 'en') continue;   /* English IS the markup — it has no file on purpose */
    assert.ok(files.includes(tag), `HAVE lists "${tag}" but js/locales/about.${tag}.js does not exist — the picker would offer a language that 404s`);
  }
  for (const f of files) {
    assert.ok(listed.includes(f), `js/locales/about.${f}.js exists but "${f}" is not in HAVE — nobody can ever select it`);
  }
});

/* ── ⑤ accessibility + performance floors that are cheap to lose ───────────────────────────── */
test('homepage ⑤: every image has an alt attribute and intrinsic dimensions', () => {
  const imgs = [...pageOnly.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length > 8, `expected the page to be picture-led, found ${imgs.length} images`);
  for (const t of imgs) {
    assert.match(t, /\salt="/, 'an <img> has no alt attribute: ' + t.slice(0, 90));
    assert.match(t, /\swidth="\d+"/, 'an <img> has no intrinsic width — it will shift the layout: ' + t.slice(0, 90));
    assert.match(t, /\sheight="\d+"/, 'an <img> has no intrinsic height — it will shift the layout: ' + t.slice(0, 90));
  }
  /* exactly one eager image: the hero. Everything else waits. */
  const eager = imgs.filter((t) => /fetchpriority="high"/.test(t));
  assert.equal(eager.length, 1, 'exactly one image may be prioritised — the hero is the LCP element');
  const belowFold = imgs.filter((t) => !/fetchpriority="high"/.test(t) && !/mark\.webp/.test(t));
  for (const t of belowFold) {
    assert.match(t, /loading="lazy"/, 'a below-the-fold image is not lazy: ' + t.slice(0, 90));
  }
});

test('homepage ⑤: the hero rotation frames are fetched after load, not with it', () => {
  /* ⚠ MEASURED, AND THE REASON THIS TEST EXISTS. `loading="lazy"` does not defer an image inside
     the hero, so with all three frames in the document they arrived on the first connection:
     649 KB before a scroll, 367 KB of it two pictures nothing shows for 5.6 s. Frames 2 and 3 are
     therefore inside a <template>, whose contents a browser parses and never fetches, and
     js/about.js clones them in on the load event. Moving either picture out of the template is a
     two-line change that silently doubles the first view. */
  const frames = /<div class="hp-shot-frames"[\s\S]*?\n      <\/div>/.exec(pageOnly);
  assert.ok(frames, 'the hero frame block is gone');
  const tpl = /<template id="hp-frames-rest">([\s\S]*?)<\/template>/.exec(frames[0]);
  assert.ok(tpl, 'the deferred hero frames are no longer in a <template> — they would load with the first view');

  const eagerPart = frames[0].replace(tpl[0], '');
  assert.equal((eagerPart.match(/<picture>/g) || []).length, 1,
    'exactly one hero frame may be outside the template — it is the LCP image and the no-JS hero');
  assert.match(eagerPart, /\ssrc="\.\/about\//, 'frame 1 must carry a real src');
  assert.equal((tpl[1].match(/<picture>/g) || []).length, 2, 'expected the other two frames inside the template');

  /* ⚠ AND NO STRING MAY BECOME A URL. The first version of this used `data-src` + setAttribute,
     which CodeQL failed as js/xss-through-dom (high). Cloning a node moves no string at all, so
     the guard is that the promotion is a cloneNode and that no data-src has crept back. */
  assert.equal(/data-src(set)?=/.test(pageOnly), false,
    'about.html carries a data-src again — copying it into src is a DOM string becoming a URL');
  assert.match(js, /host\.appendChild\(tpl\.content\.cloneNode\(true\)\)/,
    'js/about.js no longer clones the deferred frames in — they would never appear');
  assert.equal(/setAttribute\(\s*'src'/.test(js), false,
    "js/about.js assigns an element's src from JavaScript again — use the template");
});

test('homepage ⑤: motion is opt-out-able and nothing hides itself without JavaScript', () => {
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/, 'the page must honour prefers-reduced-motion');
  /* the reveal's initial state is scoped to html.hp-js, which about.html sets in <head>. Without
     that scope, a browser that never runs the script renders a page of invisible sections. */
  assert.match(css, /\.hp-js \.hp-rv\{ opacity:0;/, 'the reveal must hide elements only when JS is present to un-hide them');
  assert.match(page, /document\.documentElement\.className \+= ' hp-js'/, 'about.html must stamp hp-js before first paint');
});

/* ── ⑥ the page may not out-claim the product ──────────────────────────────────────────────── */
test('homepage ⑥: the homepage does not contradict the application', () => {
  /* The free AI allowance is HOST.AI_FREE_DAILY, pinned at 10 by tests/r147-checks.test.mjs.
     README.md still says 30; a marketing page that repeats a stale number is a promise the app
     breaks on the visitor's first day. This caught exactly that during the round that added it. */
  const all = pageOnly + readdirSync(join(ROOT, 'js/locales')).filter((f) => /^about\./.test(f))
    .map((f) => read('js/locales/' + f).replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  assert.equal(/30 (?:uses|requests) (?:a|per) day/i.test(all), false, 'the homepage still claims the stale 30/day AI allowance');
  assert.equal(/1日30回/.test(all), false, 'the homepage still claims the stale 30/day AI allowance (JP)');
  /* the honesty callouts the product's own README leads with must survive a marketing edit */
  assert.match(page, /can fail/i, 'the Atlas section must keep saying that Atlas can fail');
  assert.match(page, /not for emergency response|not for emergency|safety-critical/i,
    'the footer must keep the not-for-safety-critical-use disclaimer');
});

/* ── ⑦ SEO/OGP — the reason this page exists at a URL of its own ───────────────────────────── */
test('homepage ⑦: the page is indexable and shareable', () => {
  for (const tag of [
    /<link rel="canonical" href="https:\/\/[^"]+about\.html">/,
    /<meta property="og:title"/, /<meta property="og:description"/,
    /<meta property="og:image" content="https:\/\/[^"]+"/,
    /<meta name="twitter:card" content="summary_large_image">/,
    /<link rel="alternate" hreflang="ja"/,
    /<link rel="alternate" hreflang="x-default"/,
    /application\/ld\+json/,
  ]) assert.match(page, tag, 'missing social/SEO markup: ' + tag);

  /* the JSON-LD must actually parse — a broken block is worse than none */
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page);
  assert.ok(ld, 'no JSON-LD block');
  const obj = JSON.parse(ld[1]);
  assert.equal(obj['@type'], 'SoftwareApplication');
  assert.equal(obj.url, 'https://rwmqx7dwb5-arch.github.io/IntMap/', 'the JSON-LD must point at the app, not at this page');

  /* the OG image the page names has to be one we actually ship */
  const og = /<meta property="og:image" content="https:\/\/[^"]*\/IntMap\/([^"]+)">/.exec(page);
  assert.ok(og && existsSync(join(ROOT, og[1])), 'the og:image file is not in the tree: ' + (og && og[1]));
});
