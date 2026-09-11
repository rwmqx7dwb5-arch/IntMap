import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const admin = read('js/time-admin1.js');
function fn(name, source = admin) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
/* the module's own constants, READ rather than retyped — a value this harness invents is a value
   that can disagree with the shipped one on the first edit (#R536). */
function constOf(name, source = admin) {
  let k = -1;
  for (let p = source.indexOf(name); p >= 0; p = source.indexOf(name, p + 1)) {
    const before = p === 0 ? ' ' : source[p - 1];
    if (/[A-Za-z0-9_$]/.test(before)) continue;
    let q = p + name.length;
    while (q < source.length && source[q] === ' ') q++;
    if (source[q] !== '=' || source[q + 1] === '=') continue;
    k = q + 1; break;
  }
  assert.ok(k >= 0, 'js/time-admin1.js: no declaration of ' + name);
  let e = k;
  while (e < source.length && source[e] !== ',' && source[e] !== ';') e++;
  return source.slice(k, e).trim();
}

function runtime() {
  const ctx = vm.createContext({ window: { IntMapHistScale: { FLOOR: -123000 } }, cfg: { key: 'a1' }, nameOf: f => f[0], geomOf: () => null, Math, Map });
  /* ⚠ `fcAt` stamps the collision order of the name on every feature, so the harness that
     evaluates it has to carry the three names that ordering is made of. They are LIFTED from the
     shipped module, not stubbed: a hand-written `sortKeyOf` is free to disagree with the real one
     and this file would still be green (#R621 — a fixture more capable than the real thing cannot
     see the real thing’s defect). `geomOf` stays stubbed to null because the SUBJECT here is the
     clock, and `areaKm2` answers 0 for a geometry that is not there. */
  vm.runInContext('const _ymd=(y,m,d)=>y*10000+m*100+d; let _bnd=null; const _area=new Map(); const SORT_PROP=' + constOf('SORT_PROP') + '; '
    + ['areaKm2', 'sortKeyOf', 'areaOf', 'bounds', 'epoch', 'fcAt'].map(n => fn(n)).join('\n'), ctx);
  return ctx;
}
const row = (name, start, end) => [name, 4, ...start, ...end, [], {}, 123];
test('OHM changeover day removes the previous polygon and advances the epoch', () => {
  const c = runtime();
  c.data = { since: 1, feats: [row('old', [1,1,1], [99,2,28]), row('new', [99,2,28], [100,1,1])] };
  assert.equal(vm.runInContext('fcAt(data,99,2,28).features.map(f=>f.properties.NAME).join()', c), 'new');
  assert.equal(vm.runInContext('epoch(data,99,2,28)', c), 990228);
  assert.equal(vm.runInContext('fcAt(data,99,2,27).features[0].properties.NAME', c), 'old');
});
test('ended units without successors vanish at their end, including early leap years', () => {
  const c = runtime();
  c.data = { since: 1, feats: [row('unit', [1,1,1], [4,2,29])] };
  assert.equal(vm.runInContext('fcAt(data,4,2,29).features.length', c), 0);
  assert.equal(vm.runInContext('epoch(data,4,2,29)', c), 40229);
});
test('OHM tile expression and evaluator exclude the end instant', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read('js/hist-scale.js'), c);
  const h = c.window.IntMapHistScale;
  const p = { type: 'administrative', admin_level: 4, start_decdate: 1800, end_decdate: 1900 };
  assert.equal(h.inForce(p,3,4,1900), false);
  assert.equal(h.inForce(p,3,4,1899.99), true);
  assert.equal(h.inForce({...p,end_decdate:undefined},3,4,1900), true);
  assert.match(JSON.stringify(h.ohmFilter(3,4,1900)), /\[">",\["to-number",\["get","end_decdate"\]/);
});

test('epoch floor follows the time kernel for bundles with no declared since', () => {
  const c = runtime();
  c.data = { feats: [row('unit', [-500,1,1], [-400,1,1])] };
  assert.equal(vm.runInContext('epoch(data,-400,1,1)', c), -3999899);
});
test('KUNI uses the same abolition date contract as its OHM neighbours', () => {
  const c = runtime();
  const f = row('kuni', [-199,1,1], [1871,8,29]); f[10] = null;
  c.data = { since: 1, feats: [f] };
  assert.equal(vm.runInContext('fcAt(data,1871,8,28).features.length', c), 1);
  assert.equal(vm.runInContext('fcAt(data,1871,8,29).features.length', c), 0);
});

test('rendered features retain raw date precision instead of publishing normalized bounds as facts', () => {
  const c = runtime();
  const dates = { start: { raw: '1800', precision: 'year', qualified: false }, end: { raw: '1900-02', precision: 'month', qualified: false } };
  c.data = { since: 1, dateSemantics: 'exclusive-end', dates: { 123: dates }, feats: [row('unit', [1800,1,1], [1900,3,1])] };
  const p = vm.runInContext('fcAt(data,1900,2,28).features[0].properties', c);
  assert.deepEqual(p.dates, dates);
  assert.equal(p.dateSemantics, 'exclusive-end');
  assert.equal(vm.runInContext('fcAt(data,1900,3,1).features.length', c), 0);
});

test('tile one-day events require raw day precision and only survive on that day', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read('js/hist-scale.js'), c);
  const h = c.window.IntMapHistScale;
  const t = h.decYear(1900, 2, 28);
  const p = { type: 'administrative', admin_level: 4, start_date: '1900-02-28', end_date: '1900-02-28', start_decdate: t, end_decdate: t };
  assert.equal(h.inForce(p,3,4,t), true);
  assert.equal(h.inForce(p,3,4,h.decYear(1900,2,27)), false);
  assert.equal(h.inForce(p,3,4,h.decYear(1900,3,1)), false);
  for (const raw of [undefined, '1900', '1900-02', '1900-02-28?']) {
    assert.equal(h.inForce({...p,start_date:raw,end_date:raw},3,4,t), false);
  }
});

test('province popup shows only original source dates, including qualification and unknown endpoints', () => {
  const ui = read('js/map-ui.js');
  const c = vm.createContext({ HOST: { lang: 'jp' }, window: {} });
  vm.runInContext(read('js/lang-registry.js'), c);
  vm.runInContext(fn('_eraSourceDates', ui), c);
  c.props = { dates: JSON.stringify({ start: { raw: null }, end: { raw: '1871-08~', precision: 'month', qualified: true } }) };
  assert.equal(vm.runInContext('_eraSourceDates(props)', c), '出典の日付: ? – 1871-08~');
  c.HOST.lang = 'en';
  assert.equal(vm.runInContext('_eraSourceDates({})', c), 'Source dates: ? – ?');
});
test('province label click carries source-date supplement; exact hit delegates to it and padded hit preserves it', () => {
  const ui = read('js/map-ui.js');
  let shown;
  const c = vm.createContext({ HOST: {lang:'en'}, window: { IntMapTimeAdmin1: { geomAt: () => ({type:'Polygon'}), geomFullAt: () => null } },
    _ownedByOther: () => false, _deferLabel: (e, cb) => cb(), labelAnchor: () => [0,0], _bothNames: (p,n) => n,
    showPopup: (...args) => { shown=args[3]; } });
  vm.runInContext(read('js/lang-registry.js'), c);
  vm.runInContext(['_eraSourceDates','_eraGeom','onLabel'].map(n=>fn(n,ui)).join('\n'), c);
  c.e={features:[{layer:{id:'imta-lbl'},properties:{name:'Province',_ix:0,dates:{start:{raw:'1800'},end:{raw:null}}}}]};
  vm.runInContext('onLabel(false)(e)', c);
  assert.equal(shown.sub,'Source dates: 1800 – ?');
  assert.equal(shown.geojson.type,'Polygon');
  assert.match(ui, /if\(hit.length\) return;/, 'exact hits use the same per-layer handler');
  const call=ui.slice(ui.indexOf('if(nm){ showPopup(labelAnchor(near[0],e)'));
  const invocation=call.slice(call.indexOf('showPopup('),call.indexOf(';')+1);
  Object.assign(c,{near:c.e.features,nm:'Province',lid:'imta-lbl',geoLbl:false,ttl:'Province'});
  vm.runInContext('const peg=_eraGeom(near[0]);'+invocation,c);
  assert.equal(shown.sub,'Source dates: 1800 – ?');
});

