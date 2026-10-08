/* ============================================================================
 *  marketing-growth — a link to an entry page is shared with its own picture, and a reader can share it
 * ----------------------------------------------------------------------------
 *  ① the reader's share links: one per declared service, each a plain https link whose page address, once the build fills
 *    the site's address in, is the page itself with utm tags the app's counter accepts (no «&» of the page's query leaks
 *    into the service's query), and nothing else (the service reads the page's own card)
 *  ② the shell every entry page is written through ends with those links and states an image's alt to Open Graph and X
 *    only when the page has one; the links carry no script (static pages run nothing)
 *  ③ a year page names its own card (not the site's card), with the year's picture alt, and the card is drawn from the
 *    page's own features: 1200×630, the year's tint inside a polity the page draws, the ocean outside every outline
 *  ④ a country page names its own card; the country is filled (Japan's interior is the card's blue) and a country too small
 *    to see (the Vatican) is MARKED at its place instead of vanishing
 *  ⑤ the year post drafts: every channel × language, X within 280 by X's weighting, the link a year page with tags the
 *    counter accepts, the image the page's own card, the numbers the page's own
 *  ⑥ the words key for key in both languages
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const S = await import('../scripts/lib/share-targets.mjs');
const H = await import('../scripts/history-pages.mjs');
const HT = (await import('../scripts/history-pages-text.mjs')).TEXT;
const CT = (await import('../scripts/country-pages-text.mjs')).TEXT;
const YT = (await import('../scripts/year-pages-text.mjs')).TEXT;
const { SITE_TOKEN } = await import('../scripts/site-url.mjs');
const { siteUrl } = await import('../supabase/functions/_shared/site-origin.js');
const { campaignOf } = await import('../supabase/functions/usage-count/shape.js');
const PC = await import('../scripts/lib/page-card.mjs');
const LANGS = H.LANGS;

/* ── a PNG, decoded (8-bit RGB or palette, the two map-card writes) ─────────────────────────────────── */
function decodePng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');
  let i = 8, w = 0, h = 0, type = 0, plte = null; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), t = buf.toString('ascii', i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; }
    else if (t === 'PLTE') plte = d;
    else if (t === 'IDAT') idat.push(d);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = type === 3 ? 1 : 3, stride = w * bpp;
  const px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x], left = x >= bpp ? px[y * stride + x - bpp] : 0;
      assert.ok(f === 0 || f === 1, 'filter ' + f);
      px[y * stride + x] = f === 1 ? (v + left) & 0xff : v;
    }
  }
  const at = (x, y) => { if (type === 3) { const k = px[y * w + x] * 3; return [plte[k], plte[k + 1], plte[k + 2]]; } const k = (y * w + x) * 3; return [px[k], px[k + 1], px[k + 2]]; };
  return { w, h, at };
}
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);

test('① a share link opens the service with the page itself, tagged as the counter reads tags', () => {
  const site = siteUrl('');
  for (const L of LANGS) {
    const path = L.dir + 'history/years/1914/';
    const links = S.shareLinks(SITE_TOKEN, path);
    assert.deepEqual(links.map((l) => l.id), S.SHARE_TARGETS.map((t) => t.id));
    assert.equal(new Set(links.map((l) => l.id)).size, links.length, 'one link per service');
    for (const l of links) {
      const u = new URL(l.href.split(SITE_TOKEN).join(site));
      assert.equal(u.protocol, 'https:', l.id);
      /* the page's address is one value of the service's query: whichever parameter carries it, it decodes to the page */
      const carried = [...u.searchParams.values()].map((v) => (v.match(/https:\/\/\S+/) || [])[0]).filter(Boolean);
      assert.equal(carried.length, 1, l.id + ': exactly one page address in ' + l.href);
      const page = new URL(carried[0]);
      assert.equal(page.origin + page.pathname, new URL(path, site).href, l.id + ': the page itself');
      assert.equal(page.searchParams.get('utm_source'), l.id);
      assert.equal(campaignOf(page.search).length, 3, l.id + ': the counter accepts the three tags');
      assert.ok(!u.searchParams.has('utm_source'), l.id + ': the page\'s tags did not leak into the service\'s query');
      /* the address alone: the service draws the page's own card (og:title, og:image) — no title repeated per link */
      assert.equal([...u.searchParams.keys()].length, 1, l.id + ': one parameter, the address');
    }
  }
});

test('② every entry page ends with the share links; an image alt is stated only when the page has one', () => {
  for (const L of LANGS) {
    const o = { path: L.dir + 'history/', pathFor: (l) => l.dir + 'history/', title: 'T', description: 'D', crumbs: null, ld: [], body: () => '<p>body</p>' };
    const plain = H.shell({ image: { path: 'og-image.jpg', width: 1200, height: 630 } }, L, o);
    const withAlt = H.shell({ image: { path: 'x/card.png', width: 1200, height: 630, alt: 'A <map>' } }, L, o);
    assert.ok(!plain.includes('og:image:alt'), 'no alt claimed for the site card');
    assert.match(withAlt, /<meta property="og:image:alt" content="A &lt;map&gt;">/);
    assert.match(withAlt, /<meta name="twitter:image:alt" content="A &lt;map&gt;">/);
    for (const html of [plain, withAlt]) {
      const sec = html.slice(html.indexOf('id="share"'), html.indexOf('</section>', html.indexOf('id="share"')));
      assert.ok(sec.includes(HT[L.key].share.h2), 'the heading in ' + L.key);
      for (const t of S.SHARE_TARGETS) assert.match(sec, new RegExp('data-share="' + t.id + '" target="_blank" rel="noopener noreferrer">' + t.name + '<'), t.id);
      assert.ok(!/<a [^>]*on[a-z]+=/i.test(sec) && !/javascript:/i.test(sec), 'plain links, no script');
      assert.ok(html.indexOf('id="share"') < html.indexOf('</main>'), 'inside the page, before the footer');
    }
  }
});

/* ③ — one year through the generator: its page and its card */
const Y = await import('../scripts/year-pages.mjs');
const OTDP = await import('../scripts/on-this-day-pages.mjs');
const YM = await Y.model({ years: [1914] });
const yout = Y.outputs(YM);
const yp = YM.pages[0];

test('③ a year page names its own card, drawn from the page\'s own features', async () => {
  assert.equal(yp.y, 1914);
  for (const L of LANGS) {
    const html = yout[Y.yearPath(1914, L) + 'index.html'];
    assert.ok(html.includes('<meta property="og:image" content="' + SITE_TOKEN + Y.cardPath(1914) + '">'), 'og:image is the year\'s card');
    assert.ok(!html.includes('og-image.jpg'), 'not the site card');
    assert.match(html, /<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">/);
    assert.match(html, /<meta property="og:image:alt" content="[^"]*1914/);
  }
  const png = await PC.drawWorldCard({ land: YM.land, features: yp.drawn, label: H.yearWords(1914, 'en') });
  const img = decodePng(png);
  assert.deepEqual([img.w, img.h], [PC.CARD.width, PC.CARD.height]);
  /* outside the world's outline is the card's black; the mid-Pacific is ocean */
  assert.deepEqual(img.at(4, 4), [0, 0, 0], 'outside the outline (top left)');
  assert.deepEqual(img.at(30, 600), [0, 0, 0], 'outside the outline (bottom left)');
  assert.ok(near(img.at(60, 330), [12, 26, 43], 2), 'the Pacific is ocean: ' + img.at(60, 330));
  /* the interior of Australia (a polity the page draws in 1914) is a tint over land, not the bare land or the ocean */
  const aus = yp.drawn.find((f) => /Australia/.test(f.name));
  assert.ok(aus, 'the page draws Australia in 1914');
  const c = img.at(1010, 440);
  assert.ok(!near(c, [58, 58, 60], 3) && !near(c, [12, 26, 43], 3), 'Australia is tinted: ' + c);
  /* the year in figures, white on its shade, top left */
  let white = 0; for (let x = 56; x < 250; x++) for (let y = 50; y < 125; y++) if (near(img.at(x, y), [255, 255, 255], 8)) white++;
  assert.ok(white > 1500, 'the year is written (' + white + ' white pixels)');
});

test('④ a country card fills the country, and marks one too small to see', async () => {
  const C = await import('../scripts/country-pages.mjs');
  const M = C.model();
  const out = C.outputs(M);
  for (const L of LANGS) {
    const html = out[C.countryPath('JPN', L) + 'index.html'];
    assert.ok(html.includes('<meta property="og:image" content="' + SITE_TOKEN + C.cardPath('JPN') + '">'));
    const name = L.key === 'jp' ? '日本' : 'Japan';
    assert.ok(html.includes('<meta property="og:image:alt" content="' + H.fill(CT[L.key].cardAlt, { name }) + '">'), 'the alt names the country in ' + L.key);
  }
  const card = async (code) => { const c = M.countries.find((x) => x.code === code); return decodePng(await PC.drawCountryCard({ box: c.ext, country: c.polys, context: M.context })); };
  const blue = [10, 132, 255], sea = [9, 17, 31];
  /* Japan: somewhere in the middle third is the fill (the frame puts the country there) */
  const jp = await card('JPN');
  let filled = 0; for (let x = 400; x < 800; x += 2) for (let y = 210; y < 420; y += 2) if (near(jp.at(x, y), [Math.round(sea[0] + (blue[0] - sea[0]) * 0.9), Math.round(sea[1] + (blue[1] - sea[1]) * 0.9), Math.round(sea[2] + (blue[2] - sea[2]) * 0.9)], 30)) filled++;
  assert.ok(filled > 200, 'Japan is filled (' + filled + ' samples)');
  /* the Vatican: under a pixel at its frame — the mark (white ring, blue dot) sits in the middle of the card */
  const va = await card('VAT');
  let ring = 0, dot = 0;
  for (let x = 560; x < 640; x++) for (let y = 275; y < 355; y++) { const p = va.at(x, y); if (near(p, [255, 255, 255], 10)) ring++; if (near(p, blue, 10)) dot++; }
  assert.ok(ring > 50 && dot > 50, 'the Vatican is marked (white ' + ring + ', blue ' + dot + ')');
});

test('⑤ the year post drafts hold to the channels, the counter and X', () => {
  const site = siteUrl('');
  const drafts = Y.draftsFor(YM, yp, site);
  assert.equal(drafts.length, LANGS.length * 3);
  for (const d of drafts) {
    const link = new URL(d.link);
    assert.equal(link.origin + link.pathname, new URL(Y.yearPath(1914, LANGS.find((l) => l.key === d.lang)), site).href);
    assert.equal(campaignOf(link.search).length, 3, d.channel + ' tags');
    assert.equal(link.searchParams.get('utm_campaign'), Y.POST_CAMPAIGN);
    assert.equal(d.image, site + Y.cardPath(1914));
    assert.ok(d.text.includes(d.link), 'the post carries its link');
    assert.ok(d.text.includes(yp.names.length.toLocaleString(d.lang === 'jp' ? 'ja-JP' : 'en-US')), 'the page\'s count');
    assert.ok(d.text.includes(d.lang === 'jp' ? (yp.names[0].jp || yp.names[0].en) : yp.names[0].en), 'the largest name');
  }
  const { xWeight } = OTDP;
  for (const d of drafts.filter((x) => x.channel === 'x')) assert.ok(xWeight(d.text) <= 280, 'X within 280: ' + xWeight(d.text));
  assert.deepEqual([...new Set(drafts.map((d) => d.channel))], OTDP.CHANNELS, 'the channels the owner posts to — one list');
});

test('⑥ the words, key for key', () => {
  for (const [k, T] of [['share', HT], ['cardAlt', CT], ['post', YT]]) {
    assert.ok(T.en[k] && T.jp[k], k + ' in both languages');
    assert.equal(typeof T.en[k], typeof T.jp[k], k);
    if (typeof T.en[k] === 'object') assert.equal(JSON.stringify(Object.keys(T.en[k]).sort()), JSON.stringify(Object.keys(T.jp[k]).sort()), k);
  }
  assert.match(CT.en.cardAlt, /\{name\}/); assert.match(CT.jp.cardAlt, /\{name\}/);
  assert.match(YT.en.post.x, /\{link\}/); assert.match(YT.jp.post.x, /\{link\}/);
});
