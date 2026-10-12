/* ============================================================================
 *  polity-pages — «Mongol Empire through time»: one entry page per polity the map's dated records draw
 * ----------------------------------------------------------------------------
 *  ① every polity the app's «Rise and fall» ranks (js/polity-arc.js largest) has exactly one address, folded from its
 *    English name; a name with no Latin fold or a fold two names share carries its Wikidata item (else its first year);
 *    the addresses do not depend on the order the index lists the polities in
 *  ② named polities, read as history (.agents/rules/historical-verification.md §2-1): the page states what the map
 *    draws — Mongol Empire 1206–1293, largest 1279; Roman Empire largest 117; Ming 1368–1644, largest 1422; Tokugawa
 *    Shogunate 1600–1867; Russian Empire 1721–1917, largest 1881 — in both languages, and an edge that is a record's
 *    (San Marino: OpenHistoricalMap begins 1689, hands over to CShapes 1886) is said to be the record's; one name drawn in
 *    separate stretches (Kingdom of Italy: 887… and 1861–1945) is listed as stretches, not as one life
 *  ③ the page: its own card and alt; the map links decode to the polity's own box and to 1 July of its largest, first and
 *    last year; the chart is the app's own (chartSvg, byte for byte); every year link is a year page inside the span in
 *    which the map draws it; every «on this day» link is a day page that names it; the other names link their pages;
 *    hreflang reciprocal, canonical, structured data, every relative link resolves, nothing executes
 *  ④ the card's shape is the one the index measured (its area, on the sphere, is the index's largest area) and the card is
 *    1200×630 with the polity's colour inside it; an empty cache draws every card, a full one draws none and hands back the
 *    same bytes, and the key moves with each input of the pixels
 *  ⑤ the hub lists every page once; the sitemap lists every page; the sitemap index joins it; the build writes it after the
 *    year pages; the counter counts the pages as the `history` entry (a year page linking each name to its polity page is
 *    tests/history-year-pages-checks.test.mjs ⑤'s, on the pages it renders)
 *  ⑥ the post drafts: every channel × language, tags the counter accepts, the link a polity page, the image its card
 *  ⑦ the words key for key in both languages; the chart's record colours are the app sheet's
 *  ⑧ the card store sits beside the data store, its CI cache (restore, save on main) shares neither path nor key prefix with
 *    the data-assets cache, and one function decides what it keeps (pruneUnused)
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const P = await import('../scripts/polity-pages.mjs');
const PT = (await import('../scripts/polity-pages-text.mjs')).TEXT;
const H = await import('../scripts/history-pages.mjs');
const A = await import('../js/polity-arc.js');
const OTD = await import('../js/on-this-day.js');
const { decode } = await import('../js/map-state.js');
const { campaignOf, sitePageOf } = await import('../supabase/functions/usage-count/shape.js');
const { siteUrl } = await import('../supabase/functions/_shared/site-origin.js');
const LANGS = H.LANGS;

/* the polities read below — the model is built for these only (the addresses are always worked out over the whole index) */
const NAMED = ['mongol-empire', 'roman-empire', 'ming-dynasty', 'tokugawa-shogunate', 'russian-empire', 'san-marino', 'east-germany', 'ottoman-empire', 'kingdom-of-italy'];
const M = await P.model({ only: NAMED });
const out = await P.outputs(M);
const bySlug = new Map(M.pages.map((p) => [p.slug, p]));
const page = (slug, L) => out[P.polityPath(slug, L) + 'index.html'];

test('① one address per polity, folded from its name, independent of the index order', () => {
  const idx = P.readIndex(), all = A.largest(idx, Infinity);
  assert.equal(all.length, idx.arcs.filter((a) => a.d && a.d.length).length, 'the app\'s rule: every polity a dated record draws');
  const slugs = P.assignSlugs(idx, all);
  assert.equal(new Set(slugs.values()).size, all.length, 'every address is unique');
  for (const s of slugs.values()) assert.match(s, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, s);
  assert.equal(P.slugBase('Göktürk Khaganate'), 'gokturk-khaganate');
  assert.equal(P.slugBase('Đại Việt'), 'dai-viet');
  assert.equal(P.slugBase('ອານາຈັກຈຳປາສັກ'), '');
  const lao = all.find((a) => a.n === 'ອານາຈັກຈຳປາສັກ');
  if (lao) assert.match(slugs.get(lao), /^polity-/, 'a name with no Latin fold still has an address');
  /* two names that fold alike both carry a tag */
  const dn = all.filter((a) => P.slugBase(a.n) === 'denmark-norway');
  if (dn.length > 1) for (const a of dn) assert.notEqual(slugs.get(a), 'denmark-norway');
  /* the order of the index does not move an address */
  const again = P.assignSlugs(idx, [...all].reverse());
  for (const a of all) assert.equal(again.get(a), slugs.get(a), a.n);
});

test('② named polities state what the map draws, in both languages', () => {
  const want = {
    'mongol-empire': { first: 1206, last: 1293, peak: 1279 },
    'roman-empire': { peak: 117 },
    'ming-dynasty': { first: 1368, last: 1644, peak: 1422 },
    'tokugawa-shogunate': { first: 1600, last: 1867 },
    'russian-empire': { first: 1721, last: 1917, peak: 1881 },
  };
  for (const [slug, w] of Object.entries(want)) {
    const p = bySlug.get(slug);
    assert.ok(p, slug + ' has a page');
    if (w.first != null) assert.equal(p.D.first.y, w.first, slug + ' first');
    if (w.last != null) assert.equal(p.D.last.y, w.last, slug + ' last');
    if (w.peak != null) assert.equal(p.D.peak.y, w.peak, slug + ' largest');
    for (const L of LANGS) {
      const html = page(slug, L);
      const name = L.key === 'jp' && p.arc.j ? p.arc.j : p.arc.n;
      assert.ok(html.includes('<h1>' + H.esc(H.fill(PT[L.key].h1, { name })) + '</h1>'), slug + ' ' + L.key + ' h1');
      assert.ok(html.includes(H.esc(H.yearWords(p.D.peak.y, L.key))), slug + ' ' + L.key + ' names its largest year');
    }
  }
  assert.equal(bySlug.get('mongol-empire').arc.j, 'モンゴル帝国');
  /* a record's edge is said to be the record's, not the polity's */
  const sm = bySlug.get('san-marino');
  assert.equal(sm.D.first.edge, 'reach');
  assert.equal(sm.D.last.edge, 'reach');
  const en = page('san-marino', LANGS[0]);
  assert.ok(en.includes('1689 is the first year OpenHistoricalMap covers'), 'the begin is the record\'s');
  assert.ok(en.includes('In 1886 CShapes 2.0 takes over from OpenHistoricalMap'), 'the end is a hand-over');
  /* an edge read on 1 July is said to be one */
  assert.ok(page('east-germany', LANGS[0]).includes('The map draws it on 1 July 1990 and not on 1 July of the year after.'));
  /* one name, several lives: the medieval Regnum Italicum and the kingdom of 1861 share «Kingdom of Italy» — the page lists the
     stretches and says the map does not call them one polity */
  assert.deepEqual(P.stretchesOf(bySlug.get('kingdom-of-italy').D, M.idx.instants.to).slice(-1), [{ a: 1861, b: 1945 }]);
  assert.ok(P.stretchesOf(bySlug.get('kingdom-of-italy').D, M.idx.instants.to).some((x) => x.b < 1000), 'a medieval stretch');
  assert.ok(page('kingdom-of-italy', LANGS[0]).includes('it does not say they are one polity'));
  assert.ok(!page('mongol-empire', LANGS[0]).includes('separate stretches'), 'one stretch is not called several');
  /* the page never claims a founding or a fall */
  for (const L of LANGS) for (const slug of NAMED) assert.ok(!/\b(founded|fell|ruled|conquered)\b/i.test(page(slug, L).replace(/<[^>]+>/g, ' ')), slug + ' makes a claim of its own');
});

test('③ the page: card, map links, the app\'s chart, year and day links, structured data, links resolve, nothing executes', () => {
  const idx = M.idx, otdDays = JSON.parse(read(OTD.INDEX_PATH)).days;
  for (const p of M.pages) for (const L of LANGS) {
    const html = page(p.slug, L);
    assert.ok(html.includes(`<meta property="og:image" content="__INTMAP_SITE_URL__${P.cardPath(p.slug)}">`), p.slug + ' names its own card');
    assert.ok(html.includes('<meta property="og:image:alt"'), p.slug + ' states the card\'s alt');
    for (const [kind, y] of [['peak', p.D.peak.y], ['first', p.D.first.y], ['last', p.D.last.y]]) {
      const m = new RegExp('href="(?:\\.\\./)*index\\.html(#[^"]+)" data-polity-map="' + kind + '"').exec(html);
      assert.ok(m, p.slug + ' ' + kind + ' link');
      const st = decode(m[1].replace(/&amp;/g, '&'));
      assert.equal(st.time.at, H.isoDay(y), p.slug + ' ' + kind + ' opens on 1 July of the year');
      assert.deepEqual(st.view, OTD.viewOf({ src: 'polity', appeared: [{ bb: p.D.peak.bb }] }), p.slug + ' on its own box');
    }
    assert.ok(html.includes(A.chartSvg(idx, p.arc, p.D, L.key, null)), p.slug + ' the chart is the app\'s own');
    for (const m of html.matchAll(/data-year="(-?\d+)"/g)) {
      const y = +m[1];
      assert.ok(y >= p.D.first.y && y <= p.D.last.y && A.valueAt(idx, p.arc, y), p.slug + ' year ' + y + ' is in its life and drawn');
    }
    for (const m of html.matchAll(/href="([^"]*on-this-day\/(\d{2}-\d{2})\/)" data-otd="([^"]+)"/g)) {
      const ev = (otdDays[m[2]] || []).find((e) => e.d === m[3]);
      assert.ok(ev && ['appeared', 'ended', 'redrawn'].some((k) => (ev[k] || []).some((x) => x.en === p.arc.n)), p.slug + ' ' + m[3] + ' names it');
    }
    for (const l of LANGS) assert.ok(html.includes(`<link rel="alternate" hreflang="${l.tag}" href="__INTMAP_SITE_URL__${P.polityPath(p.slug, l)}">`));
    assert.ok(html.includes(`<link rel="canonical" href="__INTMAP_SITE_URL__${P.polityPath(p.slug, L)}">`));
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.equal(lds[0].mainEntity['@type'], 'Map');
    assert.match(lds[0].mainEntity.temporalCoverage, /^-?\d{4}\/-?\d{4}$/);
    if (p.arc.q) assert.deepEqual(lds[0].about.sameAs, p.arc.q.map((q) => 'https://www.wikidata.org/wiki/' + q));
  }
  assert.ok(bySlug.get('ottoman-empire').days.length > 0, 'the Ottoman Empire has «on this day» days (CShapes ends it 1923)');
  assert.ok(bySlug.get('ottoman-empire').years.length > 0, 'and year pages');
  /* links resolve: to a file this writes, a tracked file, or a page another generator writes */
  const generated = /^(ja\/)?(history|on-this-day|countries)\//;
  for (const [rel, html] of Object.entries(out)) {
    if (!rel.endsWith('.html')) continue;
    assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), rel + ' runs a script');
    const dir = posix.dirname(rel) + '/';
    for (const m of html.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const u = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|__INTMAP_SITE_URL__)/.test(u)) continue;
      const p = posix.normalize(posix.join(dir, u));
      assert.ok(out[p] || out[p + 'index.html'] || existsSync(join(ROOT, p)) || generated.test(p), rel + ' links to ' + u);
    }
    /* a polity link points at a polity that has a page */
    const all = new Set(P.assignSlugs(M.idx, A.largest(M.idx, Infinity)).values());
    for (const m of html.matchAll(/data-polity="([^"]+)"/g)) assert.ok(all.has(m[1]), rel + ' → ' + m[1]);
  }
});

/* ── a PNG, decoded (palette or RGB, filters 0/1 — what scripts/lib/map-card.mjs writes) ─────────── */
function decodePng(buf) {
  let i = 8, w = 0, h = 0, type = 0, plte = null; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), t = buf.toString('ascii', i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; } else if (t === 'PLTE') plte = d; else if (t === 'IDAT') idat.push(d);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = type === 3 ? 1 : 3, stride = w * bpp, px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; for (let x = 0; x < stride; x++) { const v = raw[y * (stride + 1) + 1 + x], left = x >= bpp ? px[y * stride + x - bpp] : 0; px[y * stride + x] = f === 1 ? (v + left) & 0xff : v; } }
  const at = (x, y) => { if (type === 3) { const k = px[y * w + x] * 3; return [plte[k], plte[k + 1], plte[k + 2]]; } const k = (y * w + x) * 3; return [px[k], px[k + 1], px[k + 2]]; };
  return { w, h, at };
}

test('④ the card draws the shape the index measured', async () => {
  const { mapReader } = await import('../scripts/history-pages.mjs');
  const { july1 } = await import('../scripts/year-choice.mjs');
  const { areaKm2 } = await import('../js/year-book.js');
  const R = await mapReader();
  const p = bySlug.get('mongol-empire');
  const r = await R.labelsAt(july1(p.D.peak.y));
  const { polity, context } = P.shapesAt(r, p.arc.n);
  const km = polity.reduce((s, poly) => s + areaKm2({ type: 'Polygon', coordinates: poly }), 0);
  assert.ok(Math.abs(km - p.D.peak.km) < 1, 'the card\'s shape is ' + Math.round(km) + ' km², the index says ' + p.D.peak.km);
  assert.ok(context.length > polity.length, 'the other outlines of the day are drawn around it');
  const dir = mkdtempSync(join(tmpdir(), 'polity-card-'));
  /* a store of its own (scripts/data-assets.mjs storeRoot reads INTMAP_DATA_STORE when asked; the cards sit beside it), so the cache starts empty */
  const store = mkdtempSync(join(tmpdir(), 'polity-store-')), was = process.env.INTMAP_DATA_STORE;
  process.env.INTMAP_DATA_STORE = store;
  try {
    const two = M.pages.filter((q) => q.slug === 'mongol-empire' || q.slug === 'san-marino');
    const first = await P.drawCards({ ...M, pages: two }, dir);
    assert.deepEqual(first.files, two.map((q) => P.cardPath(q.slug)));
    assert.deepEqual([first.drawn, first.cached], [2, 0], 'an empty cache draws every card');
    assert.equal(first.pruned, 0, 'a subset of the pages removes nothing from the store');
    assert.ok(first.workers >= 1 && first.workers <= 2, 'never more workers than years');
    const bytes = two.map((q) => readFileSync(join(dir, P.cardPath(q.slug))));
    const again = await P.drawCards({ ...M, pages: two }, dir);
    assert.deepEqual([again.drawn, again.cached], [0, 2], 'a full cache draws nothing');
    two.forEach((q, i) => assert.ok(readFileSync(join(dir, P.cardPath(q.slug))).equals(bytes[i]), q.slug + ': the cached card is the drawn card'));
    /* the key moves with every input of the pixels: the drawing code, the day, the outline, the frame, the figures */
    const base = ['d', 'day', [[[[0, 0], [1, 0], [0, 1]]]], [0, 0, 1, 1], '1279'];
    const k0 = P.cardKey(...base);
    for (let i = 0; i < base.length; i++) { const v = base.slice(); v[i] = i === 2 ? [[[[0, 0], [2, 0], [0, 1]]]] : i === 3 ? [0, 0, 1, 2] : base[i] + 'x'; assert.notEqual(P.cardKey(...v), k0, 'input ' + i); }
    const files = [P.cardPath(p.slug)];
    const png = decodePng(readFileSync(join(dir, files[0])));
    assert.equal(png.w, 1200); assert.equal(png.h, 630);
    /* the card's frame (scripts/lib/map-card.mjs frameFor) and Mongolia (105° E, 47° N), inside the empire in 1279 */
    const MC = await import('../scripts/lib/map-card.mjs');
    const F = MC.frameFor(p.D.peak.bb);
    const x = Math.round((105 - F.w) / (F.e - F.w) * 1200), y = Math.round((F.yN - MC.mercY(47)) / (F.yN - F.yS) * 630);
    const c = png.at(x, y), blue = MC.CARD_COLOURS.war;
    assert.ok(c.every((v, k) => Math.abs(v - blue[k]) < 40), 'Mongolia is filled with the polity\'s colour, got ' + c);
  } finally {
    if (was == null) delete process.env.INTMAP_DATA_STORE; else process.env.INTMAP_DATA_STORE = was;
    rmSync(dir, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true }); rmSync(P.cardStoreOf(store), { recursive: true, force: true });
  }
});

test('⑤ hub, sitemap, index, build order, counter, year pages link polities', async () => {
  for (const L of LANGS) {
    const hub = out[P.hubPath(L) + 'index.html'];
    for (const p of M.pages) assert.ok(hub.includes('data-polity="' + p.slug + '"'), p.slug + ' listed');
  }
  const sm = out[P.POLITY_SITEMAP];
  const locs = [...sm.matchAll(/<loc>__INTMAP_SITE_URL__([^<]*)<\/loc>/g)].map((m) => m[1]);
  const pages = Object.keys(out).filter((r) => r.endsWith('index.html')).map((r) => r.slice(0, -'index.html'.length));
  assert.deepEqual(locs.slice().sort(), pages.slice().sort());
  assert.ok(H.sitemapIndex().includes('__INTMAP_SITE_URL__' + P.POLITY_SITEMAP), 'the sitemap index joins the polity sitemap');
  assert.ok(P.POLITY_HUB.startsWith(H.HUB));
  assert.match(read('vite.config.js'), /yearPagesPlugin\(\), [^\]]*polityPagesPlugin\(\)/, 'after the year pages it links');
  const site = new URL(siteUrl(''));
  for (const L of LANGS) for (const path of [P.hubPath(L), P.polityPath('mongol-empire', L)]) {
    assert.equal(sitePageOf(new URL(path, site).href, site.host), 'history', path + ' is counted as the history entry');
  }
  /* (the year pages linking each name to its polity page is held by tests/history-year-pages-checks.test.mjs ⑤, on the pages it renders) */
});

test('⑥ the post drafts', () => {
  const site = siteUrl('');
  const p = bySlug.get('mongol-empire');
  const drafts = P.draftsFor(M, p, site);
  assert.equal(drafts.length, LANGS.length * 3);
  for (const d of drafts) {
    assert.equal(campaignOf(new URL(d.link).search).length, 3, d.channel + ' tags pass the counter');
    assert.ok(d.link.startsWith(site + P.polityPath(p.slug, LANGS.find((l) => l.key === d.lang))), d.link);
    assert.equal(d.image, site + P.cardPath(p.slug));
    assert.ok(d.text.includes(d.link));
    if (d.channel === 'x') assert.ok(d.fits, 'fits X: ' + d.text);
  }
});

test('⑦ the words, key for key; the chart colours are the app\'s', () => {
  const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, pre + k + '.') : [pre + k + (Array.isArray(v) ? '[' + v.length + ']' : '')])).sort();
  assert.deepEqual(keys(PT.en), keys(PT.jp));
  const app = read('js/polity-arc.js'), css = read('css/history-pages.css');
  for (const rec of ['clio', 'ohm', 'cshapes']) {
    const want = new RegExp('\\.pa-' + rec + '\\{ fill:(#[0-9a-f]{6}); \\}').exec(app);
    assert.ok(want, rec + ' colour in the app');
    assert.ok(new RegExp('\\.pp-chart \\.pa-' + rec + ',\\.pa-key i\\.pa-' + rec + '\\{ fill:' + want[1] + '; background:' + want[1] + '; \\}').test(css), rec + ' colour on the pages');
  }
});

test('⑧ the card store: beside the data store, its own CI cache that the data cache never writes, one rule for what it keeps', async () => {
  const yaml = await import('js-yaml');
  const { utimesSync, writeFileSync: put, mkdirSync: mk } = await import('node:fs');
  const ci = yaml.load(read('.github/workflows/ci.yml'));
  const steps = ci.jobs.build.steps;
  const action = yaml.load(read('.github/actions/data-assets/action.yml'));
  const dataCache = action.runs.steps.find((s) => /actions\/cache@/.test(s.uses || '')).with;
  const restore = steps.find((s) => /actions\/cache\/restore@/.test(s.uses || '') && /polity/.test(s.with.key));
  const save = steps.find((s) => /actions\/cache\/save@/.test(s.uses || '') && /polity/.test(s.with.key));
  const build = steps.find((s) => s.run && /npm run build/.test(s.run));
  assert.ok(restore && save && build, 'restore, build, save');
  assert.ok(steps.indexOf(restore) < steps.indexOf(build) && steps.indexOf(build) < steps.indexOf(save), 'restore before the build, save after it');
  assert.ok(steps.includes(steps.find((s) => s.uses === './.github/actions/data-assets')), 'the data cache is the data-assets action');
  /* the build sets no store, so the code's card store on the runner is ~/.cache/<data store name>-cards (scripts/data-assets.mjs storeRoot's default) */
  assert.ok(!(build.env && build.env.INTMAP_DATA_STORE), 'the build step uses the default store');
  assert.match(read('scripts/data-assets.mjs'), /join\(process\.env\.XDG_CACHE_HOME \|\| join\(homedir\(\), '\.cache'\), 'intmap-data'\)/, 'the default store on a Linux runner');
  const cards = P.cardStoreOf('~/.cache/intmap-data');
  assert.equal(restore.with.path, cards); assert.equal(save.with.path, cards);
  /* neither path holds the other, and neither key prefix is the other's */
  const norm = (x) => x.replace(/\/+$/, '') + '/';
  assert.ok(!norm(cards).startsWith(norm(dataCache.path)) && !norm(dataCache.path).startsWith(norm(cards)), cards + ' vs ' + dataCache.path);
  const prefix = (k) => k.replace(/\$\{\{.*$/, '');
  assert.ok(!prefix(restore.with.key).startsWith(prefix(dataCache.key)) && !prefix(dataCache.key).startsWith(prefix(restore.with.key)));
  assert.equal(restore.with['restore-keys'], prefix(restore.with.key), 'read back by its own prefix');
  assert.equal(save.with.key, restore.with.key);
  assert.match(save.if, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/, 'saved on a push to main only');
  assert.ok(!steps.some((s) => s.run && /polity-card|intmap-data-cards/.test(s.run)), 'no second pruning rule in the workflow');
  /* the one rule: a card not touched since the build began is removed; a touched one stays */
  const dir = mkdtempSync(join(tmpdir(), 'polity-prune-'));
  try {
    mk(join(dir, 'ab'), { recursive: true });
    const old = join(dir, 'ab', 'old.png'), part = join(dir, 'ab', 'x.png.1-2-3.part'), used = join(dir, 'ab', 'used.png');
    for (const f of [old, part, used]) put(f, 'x');
    const past = new Date(Date.now() - 60000);
    utimesSync(old, past, past); utimesSync(part, past, past);
    const startedAt = Date.now() - 30000;
    assert.equal(P.pruneUnused(dir, startedAt), 2);
    assert.ok(existsSync(used) && !existsSync(old) && !existsSync(part));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
