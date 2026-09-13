import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const source = rd('js/time-borders.js');
const functions = new Map();
simple(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), {
  FunctionDeclaration(n) { functions.set(n.id.name, source.slice(n.start, n.end)); },
});
const square = (a, b) => ({ type: 'Polygon', coordinates: [[[a, -90], [b, -90], [b, 90], [a, 90], [a, -90]]] });
function harness() {
  const ctx = {
    HOST: { lang: 'en' }, countryStats: {
      AAA: { nameEn: 'Modern western country', wiki: 'Modern_west', flag: 'western flag' },
      BBB: { nameEn: 'Modern eastern country', wiki: 'Modern_east', flag: 'eastern flag' },
    },
    window: { countryGeo: { features: [{ id: 'AAA', geometry: square(-180, 0) }, { id: 'BBB', geometry: square(0, 180) }] } },
    cache: new Map(), shownY: 1500, _hn: JSON.parse(rd('data/histnames.json')),
    _LTB: { arr: n => Array.isArray(n) ? n[0] : n },
    _VANISHED: [], _GW2ISO: { 123: 'AAA' }, _ERA_WIKI: {},
    _ERA_LOC: [], _COLONIZER: {}, _normNm: n => n.toLowerCase().trim(),
  };
  vm.createContext(ctx);
  vm.runInContext(['_bbox', '_bboxArea', '_contains', 'featureAt', 'hnFor', '_eraLocName', 'resolveHist'].map(n => functions.get(n)).join('\n'), ctx);
  return { ctx, resolve(name, properties = {}, lng = -20) {
    const f = { properties: { NAME: name, ...properties }, geometry: square(-40, 40) };
    ctx.cache.set(ctx.shownY, { features: [f] });
    return ctx.resolveHist(name, { lng, lat: 20 });
  } };
}

test('R710: historical identity is independent of translation availability and the modern country under the tap', () => {
  const h = harness();
  for (const properties of [{}, { _i18n: { en: 'Historical polity', jp: '歴史上の政体' } }]) {
    const west = h.resolve('Historical polity', properties, -20);
    const east = h.resolve('Historical polity', properties, 20);
    assert.equal(west.code, 'AAA'); assert.equal(east.code, 'BBB', 'statistical carriers remain available');
    for (const result of [west, east]) {
      assert.equal(result.name, 'Historical polity'); assert.equal(result.wiki, 'Historical_polity');
      assert.equal(result.flag, null, 'a statistical carrier cannot lend its modern flag');
      assert.equal(result.geometry.coordinates[0][0][0], -40, 'the full historical territory is retained');
    }
  }
  h.ctx.HOST.lang = 'jp';
  assert.equal(h.resolve('Historical polity', { _i18n: { en: 'Historical polity', jp: '歴史上の政体' } }).name, '歴史上の政体');
  assert.equal(h.resolve('Untranslated polity').name, 'Untranslated polity');
});

test('R710: source QID translations and CShapes carrier IDs enrich without replacing the historical identity', () => {
  const h = harness(); h.ctx.HOST.lang = 'jp';
  const [qid, row] = Object.entries(h.ctx._hn.byQid).find(([, r]) => r.n.jp);
  const own = h.ctx.hnFor('histBorders', 'Source polity', qid, { en: 'Source polity' });
  const result = h.resolve('Source polity', { _i18n: own, _gw: 123 });
  assert.equal(result.code, 'AAA'); assert.equal(result.name, row.n.jp); assert.equal(result.wiki, 'Source_polity');
  assert.equal(result.flag, null);
  assert.equal(h.resolve('Colonial polity (Possessor)', { _gw: 123 }).wiki, 'Colonial_polity');
});

test('R710: same-name country and attested former-state identity retain their existing detail', () => {
  const h = harness();
  const unchanged = h.resolve('Modern western country');
  assert.equal(unchanged.wiki, 'Modern_west'); assert.equal(unchanged.flag, 'western flag');
  h.ctx.window.IntMapHistStates = { STATES: [{ code: 'FORMER', name: 'Former state', wiki: 'Former_state', flag: 'era flag' }], hbRe: () => /^Former state$/ };
  const former = h.resolve('Former state');
  assert.equal(former.name, 'Former state'); assert.equal(former.wiki, 'Former_state'); assert.equal(former.flag, 'era flag');
});

test('R710: every shipped era spelling remains its own identity without a translation table', () => {
  const h = harness(), bundle = { window: {} };
  vm.createContext(bundle); vm.runInContext(rd('data/hist-eras.js'), bundle);
  const names = new Set(bundle.window.__HISTERAS.snaps.flatMap(s => s.feats.map(f => f[0].en)).filter(Boolean));
  for (const name of names) {
    const result = h.resolve(name);
    assert.equal(result.name, name, name + ' must not become the modern country beneath it');
    assert.notEqual(result.wiki, 'Modern_west'); assert.notEqual(result.wiki, 'Modern_east');
    assert.equal(result.flag, null);
  }
  console.log('Historical identity census: ' + names.size + ' distinct shipped spellings retain their source identity.');
});
