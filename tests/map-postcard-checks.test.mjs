/* ============================================================================
 *  map-postcard — THE MAP AS ONE PICTURE TO POST, AND A LINK THAT SAYS WHAT IT IS ABOUT
 * ----------------------------------------------------------------------------
 *  「SNS で流通する単位は静止画なのに、いまの地図を 1 枚の画像として保存・共有するボタンが無い。共有リンクは状態を
 *  運ぶが意味を運ばない。」 What this file holds, without a browser (the browser half — the picture decoded, the caption
 *  on the opened map, the embed — is tests/map-postcard.spec.js):
 *    ① the codec carries `title` / `note`: round trip, last in the address bar, absence is «no caption», the text is
 *      cleaned (control characters, bidirectional overrides) and cut by characters, a malformed escape is no caption,
 *      and a link without them is byte-identical to before;
 *    ② the postcard's layout, in each of its three shapes: the caption card, the legend column and the band stay inside
 *      the frame and do not overlap; a legend that does not fit at the floor is left out and COUNTED; the share link is
 *      printed whole or not at all;
 *    ③ the gradient reader the legend pictures use, and the shapes' names;
 *    ④ the Atlas capabilities, evaluated: `postcard` hands back what it made (or says why it could not), `share` sets
 *      the caption it is given before it reads the link, and the catalogue states the shapes the module has;
 *    ⑤ the strings the caption and the Image tab look up exist in en and jp; the caption is text, never markup; the
 *      embed keeps it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const S = await import('../js/map-state.js');
const M = await import('../js/map-recorder.js');

/* ══ ① the codec ═════════════════════════════════════════════════════════════════════════════════ */
test('① title and note travel in the link, last, and come back as the same characters', () => {
  const base = '#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato&tt=1914-06-28';
  const st = S.decode(base);
  assert.equal(st.title, '', 'no title is «no title»');
  assert.equal(st.note, '');
  assert.equal(S.encode(st), base, 'a link without a caption is byte-identical to before');
  const h = S.encode(Object.assign({}, st, { title: '1914年のヨーロッパ & Co.', note: 'Where the war began — 開戦の地。' }));
  assert.match(h, /&title=[^&]+&note=[^&]+$/, 'the caption is appended after every older field: ' + h);
  assert.ok(h.startsWith(base), 'the older fields are unchanged');
  const back = S.decode(h);
  assert.equal(back.title, '1914年のヨーロッパ & Co.');
  assert.equal(back.note, 'Where the war began — 開戦の地。');
  assert.deepEqual(S.decode(S.encode(back)), back, 'encode → decode is stable');
  /* both fields are in the schema with their spelling, and nobody else spells them (map-state-store-checks ⑤ reads PARAMS) */
  assert.ok(S.PARAMS.includes('title') && S.PARAMS.includes('note'));
  const rows = S.SCHEMA.filter((f) => f.key === 'title' || f.key === 'note');
  assert.equal(rows.length, 2);
  for (const r of rows) { assert.equal(r.owner, 'js/map-ui.js'); assert.equal(r.restore, 'always', r.key + ': a reload keeps what the link says'); }
});

test('① a caption is text: controls and direction overrides become spaces, it is cut by characters, a broken escape is nothing', () => {
  const cc = (n) => String.fromCharCode(n);
  const dirty = 'A' + cc(0x202e) + 'B' + cc(0) + 'C\n\tD' + cc(0x2028) + 'E';
  assert.equal(S.captionText(dirty, 100), 'A B C D E');
  const h = '#v=1.0000,2.0000,3.00,0,0,f&title=' + encodeURIComponent(dirty);
  assert.equal(S.decode(h).title, 'A B C D E', 'the decoder applies the writer\'s rule — a hand-made link cannot do more');
  /* cut at TITLE_MAX / NOTE_MAX characters, not UTF-16 units: an astral character is never split */
  const astral = String.fromCodePoint(0x1f30d);
  const long = astral.repeat(S.TITLE_MAX + 20);
  const cut = S.decode('#v=1,2,3&title=' + encodeURIComponent(long)).title;
  assert.equal(Array.from(cut).length, S.TITLE_MAX);
  assert.ok(Array.from(cut).every((c) => c === astral), 'a surrogate pair was split');
  assert.equal(Array.from(S.decode('#v=1,2,3&note=' + encodeURIComponent('x'.repeat(1000))).note).length, S.NOTE_MAX);
  assert.equal(S.decode('#v=1,2,3&title=%E0%A4%A').title, '', 'a malformed escape is no title, not an exception');
  assert.equal(S.encode({ view: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, title: '   ', note: '\n' }), '#v=1.0000,2.0000,3.00,0,0,f',
    'white space alone is no caption');
});

/* ══ ② the layout ════════════════════════════════════════════════════════════════════════════════ */
const measure = (s, font) => String(s).length * 0.6 * +/(\d+(?:\.\d+)?)px/.exec(font)[1];
const inside = (b, W, H) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const brand = { name: 'IntMap', link: 'example.org/IntMap' };
const credits = ['© CARTO © OpenStreetMap contributors', 'Köppen–Geiger (Beck et al. 2023, CC BY 4.0)', 'Natural Earth'];

test('② each postcard shape: the caption card, the legends and the band are inside the frame and do not overlap', () => {
  assert.deepEqual(Object.entries(M.POSTCARD_SIZES).map(([k, s]) => [k, s.w, s.h]), [['card', 1200, 630], ['square', 1080, 1080], ['portrait', 1080, 1350]]);
  const caption = { title: 'The Western Front, summer 1916 — where the line stood when the Somme began', note: 'Each colour is a country as CShapes records it on that day; the band shows every source drawn.' };
  for (const [key, { w, h }] of Object.entries(M.POSTCARD_SIZES)) {
    for (const legends of [[], [{ w: 178, h: 120 }], [{ w: 178, h: 300 }, { w: 230, h: 160 }, { w: 178, h: 90 }]]) {
      const where = key + ' with ' + legends.length + ' legend(s)';
      const F = M.layoutFrame({ w, h, panes: [{ label: '1916' }], credits, brand, caption, legends }, measure);
      assert.ok(F.card, where + ': a caption makes the card');
      assert.equal(F.panes[0].label.text, '', where + ': the instant is not drawn twice');
      assert.equal(F.card.lines[0].kind, 'instant'); assert.equal(F.card.lines[0].text, '1916');
      assert.ok(F.card.lines.some((l) => l.kind === 'title') && F.card.lines.some((l) => l.kind === 'note'), where);
      assert.ok(inside(F.card.box, w, h), where + ': the card leaves the frame');
      assert.ok(F.card.box.y + F.card.box.h <= F.band.y, where + ': the card runs into the band');
      for (const l of F.card.lines) assert.ok(l.x + l.w <= F.card.box.x + F.card.box.w + 0.5, where + ': a caption line is wider than its card');
      for (const b of F.legends) {
        assert.ok(inside(b, w, h), where + ': a legend leaves the frame');
        assert.ok(b.y + b.h <= F.band.y, where + ': a legend runs into the band');
        assert.ok(!overlap(b, F.card.box), where + ': a legend covers the caption');
      }
      for (let i = 1; i < F.legends.length; i++) assert.ok(!overlap(F.legends[i - 1], F.legends[i]), where + ': two legends overlap');
      assert.equal(F.legends.length + F.legendsOmitted, legends.length, where + ': every legend is drawn or counted as left out');
      if (F.legends.length) assert.ok(F.legendScale >= 0.9 * F.u - 1e-9 || F.legends.length === 1, where + ': a legend shrunk below the floor');
      for (const l of F.credit.lines) assert.ok(inside(l, w, h) && l.y >= F.band.y, where + ': a credit line is outside the band');
    }
  }
});

test('② a legend that does not fit at the floor is left out and counted; the first is always kept', () => {
  const room = { W: 1200, top: 19, bottom: 450, right: 1181, u: 630 / 1080 };
  const many = Array.from({ length: 8 }, () => ({ w: 178, h: 260 }));
  const L = M.layoutLegends(many, room);
  assert.ok(L.boxes.length >= 1 && L.boxes.length < 8, 'some fit, not all: ' + L.boxes.length);
  assert.equal(L.boxes.length + L.omitted, 8);
  assert.ok(L.k >= 0.9 * room.u - 1e-9);
  const tall = M.layoutLegends([{ w: 178, h: 2000 }], room);
  assert.equal(tall.boxes.length, 1, 'one very tall legend is still carried');
  assert.ok(tall.boxes[0].y + tall.boxes[0].h <= room.bottom + 0.5);
  assert.deepEqual(M.layoutLegends([], room), { boxes: [], omitted: 0, k: 0 });
});

test('② the share link is printed whole when it fits, and the site address when it does not — never a cut link', () => {
  const fits = 'https://example.org/IntMap/#v=1.0000,2.0000,3.00,0,0,f';
  const A = M.layoutFrame({ w: 1200, h: 630, panes: [{ label: 'x' }], credits, brand: Object.assign({ full: fits }, brand) }, measure);
  assert.equal(A.brand.link.text, fits.replace('https://', ''));
  assert.equal(A.brand.link.full, true);
  const huge = fits + '&s=' + 'x'.repeat(400);
  const B = M.layoutFrame({ w: 1200, h: 630, panes: [{ label: 'x' }], credits, brand: Object.assign({ full: huge }, brand) }, measure);
  assert.equal(B.brand.link.text, brand.link, 'a link that does not fit is not cut');
  assert.equal(B.brand.link.full, false);
  assert.ok(B.brand.link.x + B.brand.link.w <= 1200);
  /* no caption, no legends: exactly the time-lapse / comparison layout it always was */
  const C = M.layoutFrame({ w: 1080, h: 1080, panes: [{ label: '1914' }], credits, brand }, measure);
  assert.equal(C.card, null); assert.equal(C.panes[0].label.text, '1914'); assert.deepEqual(C.legends, []);
});

/* ══ ③ gradients and shapes ══════════════════════════════════════════════════════════════════════ */
test('③ the legend gradients are read as CSS draws them', () => {
  const g = M.parseGradient('linear-gradient(to right, rgb(0, 0, 255) 0%, rgb(255, 255, 0) 50%, rgb(255, 0, 0) 100%)');
  assert.equal(g.angle, 90);
  assert.deepEqual(g.stops.map((s) => [s.color, s.at]), [['rgb(0, 0, 255)', 0], ['rgb(255, 255, 0)', 0.5], ['rgb(255, 0, 0)', 1]]);
  const even = M.parseGradient('linear-gradient(90deg, rgb(1, 1, 1), rgba(2, 2, 2, 0.5), rgb(3, 3, 3))');
  assert.deepEqual(even.stops.map((s) => s.at), [0, 0.5, 1], 'positions left out are spread evenly');
  assert.equal(M.parseGradient('linear-gradient(rgb(1, 1, 1), rgb(2, 2, 2))').angle, 180, 'the default is to bottom');
  assert.equal(M.parseGradient('linear-gradient(to top right, red, blue)').angle, 45);
  const hard = M.parseGradient('linear-gradient(to right, red 0% 25%, blue 25% 100%)');
  assert.deepEqual(hard.stops.map((s) => [s.color, s.at]), [['red', 0], ['red', 0.25], ['blue', 0.25], ['blue', 1]], 'two positions are a hard band');
  assert.equal(M.parseGradient('none'), null);
  assert.equal(M.parseGradient('repeating-linear-gradient(red, blue 10px)'), null);
  assert.equal(M.parseGradient('url("x.png"), linear-gradient(red, blue)').stops.length, 2, 'the first gradient layer');
});

test('③ a shape named any way is one of the three, and the link card is the default', () => {
  assert.deepEqual(['card', '1200x630', 'square', 'instagram', '1:1', '正方形', 'portrait', '4:5', '縦長', '', 'anything'].map(M.postcardSizeKey),
    ['card', 'card', 'square', 'square', 'square', 'square', 'portrait', 'portrait', 'portrait', 'card', 'card']);
});

/* ══ ④ Atlas ══════════════════════════════════════════════════════════════════════════════════════ */
const PANEL = (await import('../js/atlas-cap-panel.js')).default;
const POSTCARD = PANEL.find((e) => e.row[0] === 'panel.postcard');
const SHARE = PANEL.find((e) => e.row[0] === 'panel.share');
function kernel() {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
    note: (h) => '<note>' + h + '</note>', warn: (h) => '<warn>' + h + '</warn>', esc, L: (en, jp) => en, clickId: () => false };
}

test('④ the postcard capability is registered, described in en and jp, and states the shapes the module has', () => {
  assert.ok(POSTCARD, 'panel.postcard is an entry of js/atlas-cap-panel.js');
  assert.equal(POSTCARD.row[1], 'postcard');
  assert.equal(POSTCARD.row[5], SHARE.row[5], 'it writes the share panel, so it is serialised with `share`');
  const p = POSTCARD.schema().properties;
  assert.deepEqual(Object.keys(p).sort(), ['note', 'size', 'title']);
  const doc = POSTCARD.doc.map((d) => d.text).join(' ');
  for (const [k, s] of Object.entries(M.POSTCARD_SIZES)) {
    assert.ok(doc.includes('"' + k + '"') && doc.includes(s.w + '×' + s.h), 'the catalogue states ' + k + ' ' + s.w + '×' + s.h);
  }
  assert.match(doc, /絵葉書/); assert.match(doc, /postcard/i);
  const reg = src('js/atlas-capabilities.js');
  assert.ok(reg.includes('["panel.postcard","postcard"'), 'the generated registry row is written (node scripts/atlas-caps.mjs --write)');
  const sp = SHARE.schema().properties;
  assert.equal(sp.title.type, 'string'); assert.equal(sp.note.type, 'string');
});

test('④ Atlas `postcard` hands back what it made, and says why when it could not', async () => {
  const made = { ok: true, size: 'square', w: 1080, h: 1080, name: 'intmap-1914-1080x1080.png', title: 'Sarajevo', note: 'June 1914', link: 'https://example.test/IntMap/#v=1',
    instant: '1914', legends: 2, legendsOmitted: 1, credits: ['© CARTO', 'CShapes 2.0'] };
  const asked = [];
  globalThis.window = { IntMapShare: { postcard: async (o) => { asked.push(o); return made; } } };
  try {
    const r = await POSTCARD.run({ type: 'postcard', size: 'square', title: 'Sarajevo', note: 'June 1914' }, {}, kernel());
    assert.equal(r.ok, true);
    assert.deepEqual(asked.pop(), { size: 'square', title: 'Sarajevo', note: 'June 1914' });
    assert.equal(r.postcard.file, made.name); assert.equal(r.postcard.width, 1080);
    assert.deepEqual(r.postcard.credits, made.credits);
    assert.equal(r.postcard.legendsOmitted, 1);
    for (const s of [made.name, 'Sarajevo', '© CARTO', 'CShapes 2.0', '1 did not fit']) assert.ok(r.html.includes(kernel().esc(s)), 'the result says ' + s + ': ' + r.html);
    /* a caption Atlas did not give (the reader opened someone's link) is stated as present, never quoted back to the model */
    const other = await POSTCARD.run({ type: 'postcard' }, {}, kernel());
    assert.equal(other.ok, true);
    assert.equal(other.postcard.captioned, true);
    assert.equal(other.postcard.title, undefined); assert.equal(other.postcard.note, undefined);
    assert.ok(!other.html.includes('Sarajevo') && !other.html.includes('June 1914'), 'a third party\'s words reached the result: ' + other.html);
    for (const e of ['not-drawn', 'busy', 'encoder']) {
      window.IntMapShare.postcard = async () => ({ ok: false, error: e });
      const f = await POSTCARD.run({ type: 'postcard' }, {}, kernel());
      assert.equal(f.ok, false, e + ' is a failure');
      assert.equal(f.postcard.error, e);
    }
    window.IntMapShare.postcard = async () => null;
    assert.equal((await POSTCARD.run({ type: 'postcard' }, {}, kernel())).ok, false, 'no picture is not a success');
    globalThis.window = {};
    assert.equal((await POSTCARD.run({ type: 'postcard' }, {}, kernel())).ok, false, 'no share panel is not a success');
  } finally { globalThis.window = globalThis; }
});

test('④ Atlas `share` with a title hands it to the panel BEFORE the link is read, and reports the caption', async () => {
  const opened = []; let cap = { title: '', note: '' };
  globalThis.window = { IntMapShare: {
    open: (o) => { opened.push(o); if (o.title != null || o.note != null) cap = { title: o.title || '', note: o.note || '' }; },
    link: () => 'https://example.test/IntMap/#v=1' + (cap.title ? '&title=' + encodeURIComponent(cap.title) : ''),
    caption: () => cap } };
  try {
    const r = await SHARE.run({ type: 'share', title: 'Edo 1850' }, {}, kernel());
    assert.equal(r.ok, true);
    assert.deepEqual(opened.pop(), { tab: 'link', title: 'Edo 1850', note: undefined });
    assert.ok(r.html.includes(kernel().esc('&title=Edo%201850')), 'the link handed over carries the title: ' + r.html);
    assert.deepEqual(r.caption, { title: 'Edo 1850', note: '' });
    const plain = await SHARE.run({ type: 'share' }, {}, kernel());
    assert.deepEqual(opened.pop(), { tab: 'link' }, 'no caption asked: the panel is opened exactly as before');
    assert.equal(plain.ok, true);
    assert.equal(plain.caption, undefined, 'a caption Atlas did not give is not said back');
    assert.ok(!/Caption:/.test(plain.html));
  } finally { globalThis.window = globalThis; }
});

/* ══ ⑤ strings, text-only, embed ═════════════════════════════════════════════════════════════════ */
test('⑤ every string the caption and the Image tab look up exists in en and jp, and jp is not a copy', async () => {
  const { IntMapLang } = await import('../js/lang-registry.js');
  await import('../js/locales/ui.en.js'); await import('../js/locales/ui.jp.js');
  const keys = new Set();
  const share = src('js/map-ui.js').split('export function share(')[1] || '';
  for (const m of share.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)) keys.add(m[1]);
  const tab = src('js/map-recorder.js').split('export function createPostcardTab(')[1].split('\nexport function ')[0];
  for (const m of tab.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)) keys.add(m[1]);
  for (const m of tab.matchAll(/'(postcard[A-Za-z]+)'/g)) keys.add(m[1]);   /* the shapes' label keys, looked up through a table */
  for (const k of ['shareTabImage', 'captionTitlePh', 'captionNotePh', 'postcardShare', 'postcardSaveCopy', 'postcardSizeCard', 'postcardSizePortrait']) assert.ok(keys.has(k), k + ' was not found in use');
  const en = IntMapLang.keyed('en'), jp = IntMapLang.keyed('jp');
  for (const [lang, tbl] of [['en', en], ['jp', jp]]) {
    const missing = [...keys].filter((k) => !(typeof tbl[k] === 'string' && tbl[k].trim()));
    assert.deepEqual(missing, [], lang + ' is missing ' + missing.join(', '));
  }
  for (const k of keys) if (/^(caption|postcard|shareTabImage)/.test(k)) assert.notEqual(jp[k], en[k], k + ': jp is the English');
  assert.ok(en.postcardLegendsOmitted.includes('{n}') && jp.postcardLegendsOmitted.includes('{n}'), 'the count has its slot in both');
});

test('⑤ the caption reaches the page only as text, the title bar and the picture only as characters', () => {
  const share = codeOnly(src('js/map-ui.js')).split('export function share(')[1] || '';
  const body = share.split('window.IntMapShare=(function(){')[0];
  assert.match(body, /\.textContent=cap\.title/); assert.match(body, /\.textContent=cap\.note/);
  assert.doesNotMatch(body, /innerHTML/, 'the caption code never writes markup');
  /* in the panel the fields are filled as properties, never written into its markup */
  assert.match(share, /capTi\.value=cap\.title/); assert.match(share, /capNo\.value=cap\.note/);
  assert.doesNotMatch(share.split('panel.innerHTML=')[1].split(';')[0], /cap\.(title|note)/, 'the caption is spliced into the panel markup');
  /* the picture paints text with fillText only */
  const rec = codeOnly(src('js/map-recorder.js'));
  assert.doesNotMatch(rec.split('async function postcard(')[1].split('\nexport ')[0], /innerHTML/);
});

test('⑤ an embed keeps the caption, and both fields of the store have their owner', async () => {
  const E = await import('../js/embed-mode.js');
  assert.match(E.EMBED_CSS, /\.map-container > \*:not\(#map\)[^{]*:not\(#im-caption\)\{display:none/, 'the embed keep-list names #im-caption');
  const code = codeOnly(src('js/map-ui.js'));
  assert.match(code, /MapState\.own\('title',/); assert.match(code, /MapState\.own\('note',/);
});
