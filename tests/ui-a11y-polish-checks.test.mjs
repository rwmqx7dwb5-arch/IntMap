// ui-a11y-polish — THE SEARCH CARD SAYS WHAT EACH ROW IS, AND THE ACCENT IS READABLE AS TEXT
//
// Two of the five findings of the 2026-09-27 production health check are decided by code that can be
// evaluated without a browser; this file evaluates it (tests/ui-a11y-polish.spec.js measures the other
// three — focus rings, the map-search placeholder and the phone credit's tap target — on the page).
//
// ① 「Kyoto」 listed the city and Kyoto Station as two rows that both read 「Kyoto, Kyoto Prefecture,
//    Japan」: Photon's label is name + city + state + country and carries no kind. The SHIPPED doGeocode
//    runs here against the three geocoders' live answers (captured 2026-09-27 WITH the admin fields
//    Photon and Open-Meteo publish), with the real place-framing, the real name rules and the real
//    language registry — and every row on the card has to read differently from every other.
// ② The selected Map/Satellite segment was #007aff 12 px on white = 4.02:1 (WCAG AA wants 4.5:1). The
//    ratio is COMPUTED here from css/intmap.css itself — the tokens and the rules that read them — so a
//    new accent value is measured, not trusted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.IntMapSafe = globalThis.IntMapSafe || { html: (s) => String(s) };

await import(pathToFileURL(join(ROOT, 'js/lang-registry.js')).href);   /* the real pick() / pickArgs() */
await import(pathToFileURL(join(ROOT, 'js/place-framing.js')).href);
await import(pathToFileURL(join(ROOT, 'js/atlas-geo-resolve.js')).href);
await import(pathToFileURL(join(ROOT, 'js/search-geocode.js')).href);
window.IntMapNominatimGate = { nominatimSlot: () => Promise.resolve(true) };

/* ── the captured answers (live, 2026-09-27, q=Kyoto, en), trimmed to the fields the adapters read ── */
const OPEN_METEO = {"results":[{"name":"Kyoto","latitude":35.02107,"longitude":135.75385,"feature_code":"PPLA","population":1463723,"country":"Japan","admin1":"Kyoto","admin2":"Kyōto","admin3":"Kamigyō Ku"},{"name":"Kyoto","latitude":-2.05,"longitude":31.68333,"feature_code":"PPL","country":"Tanzania","admin1":"Kagera","admin2":"Muleba District Council","admin3":"Kimwani"},{"name":"Kyojomanyi","latitude":0.43333,"longitude":31.68333,"feature_code":"PPL","country":"Uganda","admin1":"Central Region","admin2":"Mubende District","admin3":"Kassanda","admin4":"Kiganda"},{"name":"Kyoto Heliport","latitude":34.92141,"longitude":135.74231,"feature_code":"AIRH","country":"Japan","admin1":"Kyoto","admin2":"Kyōto","admin3":"Fushimi-ku"},{"name":"Kyoto Imperial Palace","latitude":35.02328,"longitude":135.76329,"feature_code":"PRK","country":"Japan","admin1":"Kyoto","admin2":"Kyōto","admin3":"Kamigyō Ku"}]};
const NOMINATIM = [{"osm_type":"relation","osm_id":357794,"lat":"35.0115754","lon":"135.7681441","category":"boundary","type":"administrative","importance":0.70860091756966,"addresstype":"city","name":"Kyoto","display_name":"Kyoto, Kyoto Prefecture, Japan","boundingbox":["34.8749160","35.3212207","135.5590060","135.8784420"]}];
const PHOTON = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7584303,34.9846076]},"properties":{"osm_type":"N","osm_id":3628707764,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","locality":"Higashikujo-Kamitonodacho","district":"Minami Ward","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7681441,35.0115754]},"properties":{"osm_type":"R","osm_id":357794,"osm_key":"place","osm_value":"city","type":"city","name":"Kyoto","state":"Kyoto Prefecture","country":"Japan","extent":[135.559006,35.3212207,135.878442,34.874916]}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.758766,34.9853497]},"properties":{"osm_type":"N","osm_id":267316272,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","locality":"Nishikujo-Kitanouchicho","district":"Minami Ward","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7576627,34.9847375]},"properties":{"osm_type":"N","osm_id":3340028686,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","locality":"Higashishiokojicho","district":"Shimogyo Ward","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.454601,35.242552]},"properties":{"osm_type":"R","osm_id":2137477,"osm_key":"place","osm_value":"province","type":"state","name":"Kyoto Prefecture","country":"Japan","extent":[134.8513426,36.1500281,136.055476,34.705754]}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7600629,34.9861909]},"properties":{"osm_type":"N","osm_id":7780637510,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyōto","locality":"Higashishiokojicho","district":"Shimogyo Ward","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}}]};

/* ── a DOM whose textContent behaves like the real one (the setter replaces the children) ────────── */
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this._text = ''; this.style = {}; this.onclick = null; this.parent = null; this._html = ''; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  setAttribute(k, v) { (this._attrs = this._attrs || {})[k] = String(v); }   /* (a11y-shared-dialog) a row is role=option */
  getAttribute(k) { return (this._attrs && k in this._attrs) ? this._attrs[k] : null; }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  set textContent(v) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(h) {
    this.children.forEach((c) => { c.parent = null; }); this.children = []; this._text = ''; this._html = String(h || '');
    const m = /^<div class="([^"]+)"/.exec(this._html); if (m) { const c = new El('div'); c.className = m[1]; this.appendChild(c); }
  }
  get innerHTML() { return this._html; }
  querySelector(sel) { const cls = sel.startsWith('.') ? sel.slice(1) : null; return (cls && this.children.find((c) => c.className.split(/\s+/).includes(cls))) || null; }
}

async function searchKyoto(lang, order) {
  const delay = Object.fromEntries(order.map((h, i) => [h, i * 15]));
  globalThis.fetch = async (url) => {
    const host = new URL(String(url)).hostname;
    const body = host.startsWith('geocoding-api.open-meteo') ? OPEN_METEO : host.startsWith('nominatim') ? NOMINATIM : host.startsWith('photon') ? PHOTON : null;
    await new Promise((r) => setTimeout(r, delay[host.split('.')[0]] || 0));
    return new Response(JSON.stringify(body || []), { headers: { 'content-type': 'application/json' } });
  };
  const byId = { 'ms-input': Object.assign(new El('input'), { value: 'Kyoto' }), 'ms-results': new El('div') };
  globalThis.document = { getElementById: (id) => byId[id] || null, createElement: (t) => new El(t) };
  const HOST = { lang, countryStats: {}, BUILTIN_GAZETTEER: null, t: (k) => k };
  await window.IntMapModules.searchGeocode(HOST).doGeocode();
  return byId['ms-results'].children.filter((c) => c.className === 'ms-item').map((r) => ({
    label: r._text, sub: (r.children.find((c) => c.className === 'ms-kind') || { textContent: '' }).textContent,
  }));
}

const PF = window.IntMapPlaceFraming;
const R = (await import(pathToFileURL(join(ROOT, 'js/atlas-geo-resolve.js')).href)).makeAtlasGeoResolve.placeRules;
const fold = (s) => R.nkey(s);
const nameOf = (lang, cls) => window.IntMapLang.pick(() => lang).arr(PF.classNames()[cls]);
const ORDERS = [['geocoding-api', 'nominatim', 'photon'], ['photon', 'nominatim', 'geocoding-api'], ['nominatim', 'photon', 'geocoding-api']];

test('ui-a11y-polish ① every class placeClass can answer has a name in en and jp — the population is zoomTable(), not a list', () => {
  const names = PF.classNames();
  for (const cls of Object.keys(PF.zoomTable())) {
    const t = names[cls];
    assert.ok(Array.isArray(t) && t.length >= 2, `class ${cls} has no name tuple — a search row of that class would carry no kind`);
    assert.ok(String(t[0]).trim() && String(t[1]).trim(), `class ${cls}: en 「${t[0]}」 / jp 「${t[1]}」 — both are required (AGENTS.md §3-5)`);
  }
});

for (const lang of ['en', 'jp']) {
  for (const order of ORDERS) {
    test(`ui-a11y-polish ② no two rows on the card read the same, and each row says what it is (${lang}, arrival: ${order.join(' → ')})`, async () => {
      const rows = await searchKyoto(lang, order);
      const seen = new Map();
      for (const r of rows) {
        /* the label's places, folded (Kyoto = Kyōto) and as a SET, and what the row says it is. Photon
           labels the two stations 「Kyoto, Kyoto Prefecture, Japan」 and 「Kyōto, Kyoto, Kyoto Prefecture,
           Japan」 — they differ only by whether it dropped the city for equalling the name, which is no
           difference a reader can use */
        const k = [...new Set(r.label.split(',').map(fold))].sort().join('|') + '\u0000' + r.sub;
        assert.ok(!seen.has(k), `「${r.label}」 / 「${r.sub}」 reads like 「${(seen.get(k) || {}).label}」 — the reader cannot tell them apart: ${JSON.stringify(rows)}`);
        seen.set(k, r);
      }
      /* the classes, read off the capture through the real placeClass — not retyped */
      const cityName = nameOf(lang, PF.placeClass(NOMINATIM[0])), stationName = nameOf(lang, PF.placeClass({ osm_key: 'railway', osm_value: 'station' }));
      const provName = nameOf(lang, PF.placeClass({ osm_key: 'place', osm_value: 'province' }));
      const city = rows.filter((r) => /Kyoto Prefecture/.test(r.label) && r.sub === cityName);
      assert.equal(city.length, 1, `the city reads 「${cityName}」 once: ${JSON.stringify(rows)}`);
      assert.ok(rows.some((r) => r.label.startsWith('Kyoto Prefecture') && r.sub === provName), `the prefecture reads 「${provName}」`);
      /* the two station rows whose names fold together say which ward each point is in — the wards come
         from the capture: the first station node Photon returned, and the 「Kyōto」 node */
      const st = PHOTON.features.filter((f) => f.properties.osm_value === 'station');
      const wardA = st[0].properties.district, wardB = st.find((f) => f.properties.name !== st[0].properties.name).properties.district;
      assert.notEqual(wardA, wardB, 'the capture has two wards to tell the rows apart by');
      const stations = rows.filter((r) => r.sub.startsWith(stationName));      assert.equal(stations.length, 2, `the folded station and the subway node: ${JSON.stringify(rows)}`);
      assert.deepEqual(stations.map((r) => r.sub).sort(), [`${stationName} · ${wardA}`, `${stationName} · ${wardB}`].sort(), 'each says the ward its point is in');
      /* ⚠ and the qualifier is added only where it is needed: the city is not told its ward */
      assert.ok(!/ · /.test(city[0].sub), 'a row with no look-alike carries its kind alone');
    });
  }
}

/* ══ ② CONTRAST, COMPUTED FROM THE STYLESHEET ═══════════════════════════════════════════════════════ */
const CSS = codeOnly(readFileSync(join(ROOT, 'css/intmap.css'), 'utf8'), { lang: 'css' });
/** every style rule in the sheet, @media bodies included: [{ sel, decl:{prop:value} }] */
function rules(src) {
  const out = []; let i = 0;
  const walk = (end) => {
    while (i < end) {
      const open = src.indexOf('{', i); if (open < 0 || open >= end) { i = end; return; }
      const head = src.slice(i, open).trim(); let depth = 1, j = open + 1;
      while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      if (head.startsWith('@')) { if (/^@(media|supports|layer)/.test(head)) { i = open + 1; walk(j - 1); } i = j; continue; }
      const decl = {};
      for (const d of src.slice(open + 1, j - 1).split(';')) { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).replace(/!important/, '').trim(); }
      out.push({ sel: head.replace(/\s+/g, ' '), decl }); i = j;
    }
  };
  walk(src.length); return out;
}
const RULES = rules(CSS);
const bySel = (s) => RULES.filter((r) => r.sel.split(',').map((x) => x.trim()).includes(s));
const vars = (sel) => Object.fromEntries(bySel(sel).flatMap((r) => Object.entries(r.decl).filter(([k]) => k.startsWith('--'))));
const LIGHT = vars(':root'), DARK = { ...LIGHT, ...vars('[data-theme="dark"]') };
const resolve = (v, env, n = 0) => { const m = /var\((--[\w-]+)(?:,([^)]*))?\)/.exec(v); return (!m || n > 8) ? String(v).trim() : resolve(v.replace(m[0], env[m[1]] ?? m[2] ?? ''), env, n + 1); };
/* top-level comma split, so a color-mix() inside a color-mix() stays one argument */
const args = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
/** a CSS colour as [r, g, b, a] — hex, rgb()/rgba(), white/transparent, and color-mix(in srgb, …): the forms this sheet writes */
function rgba(v) {
  const c = String(v).replace(/!important/, '').trim();
  if (c === 'transparent') return [0, 0, 0, 0];
  if (c === 'white') return [255, 255, 255, 1];
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)).concat(1); }
  m = /^rgba?\(([^)]*)\)$/.exec(c);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  m = /^color-mix\(\s*in srgb\s*,(.*)\)$/.exec(c);
  if (m) {   /* CSS Color 5: the percentages normalise to 1, and the mix is premultiplied in gamma-encoded sRGB */
    const [a, b] = args(m[1]).map((x) => { const q = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(x); return q ? { c: rgba(q[1]), p: +q[2] / 100 } : { c: rgba(x), p: null }; });
    let pa = a.p, pb = b.p; if (pa == null && pb == null) pa = pb = 0.5; else if (pa == null) pa = 1 - pb; else if (pb == null) pb = 1 - pa;
    const t = pa + pb; pa /= t; pb /= t;
    const al = a.c[3] * pa + b.c[3] * pb; if (!al) return [0, 0, 0, 0];
    return [0, 1, 2].map((k) => (a.c[k] * a.c[3] * pa + b.c[k] * b.c[3] * pb) / al).concat(al);
  }
  return null;
}
/** the opaque colour a reader sees: `v` in theme `env`, composited over `under` */
const paint = (v, env, under = [255, 255, 255]) => { const c = rgba(resolve(v, env)); if (!c) return null; return [0, 1, 2].map((k) => c[k] * c[3] + under[k] * (1 - c[3])); };
const lum = (c) => { const l = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(c[0]) + 0.7152 * l(c[1]) + 0.0722 * l(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const px = (v) => parseFloat(v);
const WHITE = [255, 255, 255];
const notDark = (r) => !/data-theme="dark"/.test(r.sel);

test('ui-a11y-polish ③ the SELECTED view segment is ≥4.5:1 in both themes, computed from the rules that paint it', () => {
  const light = Object.assign({}, ...bySel('.view-btn').map((r) => r.decl), ...bySel('.view-btn.active').map((r) => r.decl));
  const dark = Object.assign({}, light, ...bySel(':root[data-theme="dark"] .view-btn.active').map((r) => r.decl));
  assert.ok(px(light['font-size']) < 18.66, 'the segment label is small text (WCAG: under 18.66 px bold / 24 px), so 4.5:1 is the bar');
  for (const [theme, d, env] of [['light', light, LIGHT], ['dark', dark, DARK]]) {
    const bg = paint(d.background, env), fg = paint(d.color, env, bg), r = ratio(fg, bg);
    assert.ok(r >= 4.5, `${theme}: ${hex(fg)} on ${hex(bg)} = ${r.toFixed(2)}:1 — under 4.5:1`);
  }
});

test('ui-a11y-polish ④ accent TEXT is ≥4.5:1 on the card in both themes — the population is every rule that paints it', () => {
  const accentText = RULES.filter((r) => r.decl.color && /var\(--primary-color\)/.test(r.decl.color) && notDark(r));
  assert.ok(accentText.length > 10, `found ${accentText.length} accent-text rules — the scan is reading the sheet`);
  for (const [theme, env] of [['light', LIGHT], ['dark', DARK]]) {
    const card = paint('var(--card-bg)', env), acc = paint('var(--primary-color)', env, card);
    assert.ok(ratio(acc, card) >= 4.5, `${theme}: accent ${hex(acc)} on the card ${hex(card)} = ${ratio(acc, card).toFixed(2)}:1 (${accentText.length} rules paint text this way)`);
  }
});

test('ui-a11y-polish ⑤ the keyboard focus ring is ≥3:1 against the card in both themes (WCAG 1.4.11)', () => {
  for (const [theme, env] of [['light', LIGHT], ['dark', DARK]]) {
    const card = paint('var(--card-bg)', env), ring = paint('var(--focus-ring)', env, card);
    assert.ok(ring, `${theme}: --focus-ring resolves to a colour`);
    assert.ok(ratio(ring, card) >= 3, `${theme}: ring ${hex(ring)} on ${hex(card)} = ${ratio(ring, card).toFixed(2)}:1`);
  }
});

/* ══ ⑥ THE ACCENT AS A SURFACE IS ITS OWN TOKEN ══════════════════════════════════════════════════════
   White on the dark accent (#0a84ff) was 3.65:1. No single value can be ≥4.5:1 as text on the dark card
   (relative luminance ≥ 0.228) AND ≥4.5:1 under white text (≤ 0.183), so a SURFACE painted in the accent
   reads --primary-fill and text keeps --primary-color. The population is every place the shipped code
   paints a background in the accent — css/, js/ (inline styles and style assignments) and index.html —
   found by the pattern the conversion used, so one written the old way tomorrow fails here. */
const FILL_RE = /background[A-Za-z-]*['"]?\s*[:=]\s*[^;,}\n]{0,40}?var\(--primary-color\)/g;
test('ui-a11y-polish ⑥ every accent SURFACE reads --primary-fill, and white on it is ≥4.5:1 in both themes', () => {
  const files = [
    ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f),
    ...readdirSync(join(ROOT, 'css')).filter((f) => f.endsWith('.css')).map((f) => 'css/' + f), 'index.html'];
  const left = [];
  let fills = 0;
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(FILL_RE)) left.push(`${f}:${src.slice(0, m.index).split('\n').length}  ${m[0]}`);
    fills += (src.match(/var\(--primary-fill\)/g) || []).length;
  }
  assert.deepEqual(left, [], 'a background painted in the TEXT accent — that is the surface token\'s job');
  assert.ok(fills > 100, `the surfaces read --primary-fill (${fills} places) — the scan is reading the code`);
  for (const [theme, env] of [['light', LIGHT], ['dark', DARK]]) {
    const card = paint('var(--card-bg)', env), fill = paint('var(--primary-fill)', env, card);
    assert.ok(fill, `${theme}: --primary-fill resolves to a colour`);
    assert.ok(ratio(WHITE, fill) >= 4.5, `${theme}: white on the fill ${hex(fill)} = ${ratio(WHITE, fill).toFixed(2)}:1`);
  }
});

/* ══ ⑦ ACCENT TEXT ON THE LIGHT THEME'S GREY SURFACES ═══════════════════════════════════════════════
   #0071e3 was 4.31:1 on --bg-color (#f5f5f7) and 4.20:1 on --input-bg over the card. WHICH grey surfaces
   accent text really sits on is read from the sheet: for every rule that paints text in the accent, the
   background of that rule — or, for a state (:hover, .has, .on …), of the rule it is a state of —
   composited over the card. MEASURED 2026-09-27: .stats-filter-btn.has (a resting state) and five :hover
   states sit on --input-bg. Only NEUTRAL surfaces are asked here (channel spread ≤ 8): an accent-TINTED
   badge is a different surface — see dev-notes/2026-09-27-ui-a11y-polish.md. */
test('ui-a11y-polish ⑦ light: accent text is ≥4.5:1 on every grey surface it is painted on, and on --bg-color', () => {
  const card = paint('var(--card-bg)', LIGHT), acc = paint('var(--primary-color)', LIGHT);
  const baseOf = (one) => one.trim().replace(/:(hover|focus|focus-visible|active|not\([^)]*\))/g, '').replace(/\.(on|has|sel|active|voted|first|open)\b/g, '').trim();
  const bgOf = (r) => r.decl.background || r.decl['background-color'];
  const surfaces = [['--bg-color', paint('var(--bg-color)', LIGHT, card)]];
  for (const r of RULES.filter((x) => x.decl.color && /var\(--primary-color\)/.test(x.decl.color) && notDark(x))) {
    for (const one of r.sel.split(',')) {
      const base = bgOf(r) ? null : RULES.find((b) => b.sel.split(',').some((x) => x.trim() === baseOf(one)) && bgOf(b));
      const v = bgOf(r) || (base && bgOf(base));
      const s = v && paint(v, LIGHT, card);
      if (s && Math.max(...s) - Math.min(...s) <= 8) surfaces.push([one.trim() + ' on ' + v, s]);
    }
  }
  assert.ok(surfaces.some(([w]) => /input-bg/.test(w)), `the scan found the --input-bg surfaces: ${surfaces.map(([w]) => w).join(' / ')}`);
  for (const [what, s] of surfaces) assert.ok(ratio(acc, s) >= 4.5, `${what}: ${hex(acc)} on ${hex(s)} = ${ratio(acc, s).toFixed(2)}:1`);
});

test('⑧ text on an accent TINT (the «first report» badge, the evidence chip) reads at 4.5:1 in both themes, on every surface', () => {
  /* Measured before: `.ev-badge.first` 4.33:1 light / 4.03:1 dark, `.mon-evchip` 3.23:1 light — hard-coded
     rgba(0,122,255,…) tints under the accent itself. Both now read the two tokens derived from the accent:
     the tint is the accent at 12 %, the text is the accent pulled 25 % toward the body text colour. */
  for (const sel of ['.ev-badge.first', '.mon-evchip']) {
    const d = Object.assign({}, ...bySel(sel).map((r) => r.decl));
    assert.match(String(d.color), /var\(--primary-on-tint\)/, `${sel} writes its text with the token`);
    assert.match(String(d.background), /var\(--primary-tint\)/, `${sel} paints its tint with the token`);
    for (const [name, env] of [['light', LIGHT], ['dark', DARK]]) {
      for (const surf of ['--card-bg', '--bg-color']) {
        const under = paint(`var(${surf})`, env);
        const bg = paint('var(--primary-tint)', env, under);
        const fg = paint('var(--primary-on-tint)', env, bg);
        assert.ok(ratio(fg, bg) >= 4.5, `${sel} ${name} on ${surf}: ${hex(fg)} on ${hex(bg)} = ${ratio(fg, bg).toFixed(2)}:1`);
      }
    }
  }
});
