/* ============================================================================
 *  output-taint-gate — what flows INTO an HTML sink is measured; the cache and the CSP admit only
 *  what the app uses; a control that writes says so
 * ----------------------------------------------------------------------------
 *  ① scripts/output-taint.mjs judges every value that reaches innerHTML / outerHTML /
 *     insertAdjacentHTML / setHTML by its leaves — fed small programs that hold the defect and the
 *     fix side by side (a raw record field; the same field through IntMapSafe.html, a local delegate,
 *     a destructured escaper, a map/join, a translation, a local builder, an encoder-shaped replace
 *     chain), in both directions. The rules that make it say «safe» are each shown refusing their
 *     near-miss (a decoder is not an encoder; a picker that reads `arguments` depends on all of them;
 *     a CSV quoter named `esc` spoils the name for everyone who receives an `esc`).
 *  ② the TRUSTED declarations are checked like claims: a missing reason, a function that is gone
 *     and an entry nothing calls are each refused.
 *  ③ the ledger (tests/output-taint-baseline.json) agrees with the tree and goes red when the fixed
 *     sinks are reverted (in memory — no file in the working tree is written), when a new raw value
 *     is added, and when one is escaped without lowering the ledger.
 *  ④ the three reported sinks stay escaped: OpenFreeMap names (js/map-extras.js), the ADS-B and AIS
 *     strings of the traffic tooltip (js/data-layers.js — built in one place, written elsewhere, so
 *     the RETURN of the builder is judged), the country card (js/countries-ui.js).
 *  ⑤ sw.js caches a DEM tile only for one host + one path prefix: every DEM URL template in js/ is
 *     admitted, and a foreign bucket on the same path-style endpoint is not.
 *  ⑥ index.html's CSP admits the ECMWF SDK by its full path, and that path is exactly the one
 *     js/wx-ecmwf.js builds from SDK_VER — a version bump without a CSP change is red here.
 *  ⑦ scripts/data-effects.mjs: the ledger agrees; a new undeclared writing control is red, declaring it
 *     is green; a call through a parameter is not followed by name.
 *  ⑧ both are rules of check:static.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, walk } from './helpers/ast.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { measure, check, scan, trustedProblems, TRUSTED, LEDGER } from '../scripts/output-taint.mjs';
import * as DE from '../scripts/data-effects.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the real js/ tree as a { rel: source } map — mutated copies of it are what the gate is run on */
function jsTree() {
  const out = {};
  (function go(dir) {
    for (const n of readdirSync(dir).sort()) {
      const a = join(dir, n);
      if (statSync(a).isDirectory()) go(a); else if (n.endsWith('.js')) out[relative(ROOT, a).replace(/\\/g, '/')] = readFileSync(a, 'utf8');
    }
  })(join(ROOT, 'js'));
  return out;
}
const TREE = jsTree();
const withFile = (rel, fn) => { const t = { ...TREE }; const was = t[rel]; t[rel] = fn(was); assert.notEqual(t[rel], was, 'the mutation must change ' + rel); return t; };

/* a small program → its unjudged leaves (texts) */
const leavesOf = (files) => {
  const m = measure(ROOT, typeof files === 'string' ? { 'js/x.js': files } : files);
  return Object.values(m.files).flat().flatMap((s) => s.leaves.map((l) => l.text));
};

/* ══ ① the judge ═════════════════════════════════════════════════════════════════════════════════ */

test('①a a record field written raw is unjudged; through IntMapSafe.html, a local delegate or a copy-shaped encoder it is not', () => {
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = '<b>' + p.name + '</b>'; }`), ['p.name']);
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = '<b>' + window.IntMapSafe.html(p.name) + '</b>'; }`), []);
  assert.deepEqual(leavesOf(`const esc = (s) => window.IntMapSafe.html(s); function f(p){ el.innerHTML = \`<b>\${esc(p.name)}</b>\`; }`), []);
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = String(p.n).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }`), [],
    'a global one-character replace of & and < is an encoder whatever its name');
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = String(p.n).replace(/&lt;/g,'<').replace(/&amp;/g,'&'); }`).length, 1,
    'a DECODER has the same characters in it and is not an encoder');
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = String(p.n).replace(/<b>/g,'').replace(/&/g,'&amp;'); }`).length, 1,
    'removing one tag leaves every other tag standing');
});

test('①b numbers, dates, a falsy left side, ternaries and literal tables are safe; `.textContent` and JSON are not', () => {
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = Math.round(p.v) + ' / ' + p.v.toFixed(1) + (p.a - p.b) + new Date(p.t).toISOString() + (p.ok && '<i>ok</i>') + (p.x ? 'a' : 'b'); }`), []);
  assert.deepEqual(leavesOf(`const ICON = { a: '<svg/>', b: '<i/>' }; function f(k){ el.innerHTML = ICON[k]; }`), []);
  assert.deepEqual(leavesOf(`function f(p){ el.innerHTML = p.ok && p.name; }`), ['p.name'], 'the right side of && is what is written');
  assert.equal(leavesOf(`function f(a){ el.innerHTML = a.textContent + JSON.stringify(a); }`).length, 2);
});

test('①c map/join is judged by what the callback returns and what it is handed', () => {
  assert.deepEqual(leavesOf(`const esc=(s)=>window.IntMapSafe.html(s); function f(xs){ el.innerHTML = xs.map((x) => '<li>' + esc(x.n) + '</li>').join(''); }`), []);
  assert.equal(leavesOf(`function f(xs){ el.innerHTML = xs.map((x) => '<li>' + x.n + '</li>').join(''); }`).length, 1);
  assert.deepEqual(leavesOf(`const YEARS=[1990,2000]; function f(){ el.innerHTML = YEARS.map((y) => '<option>' + y + '</option>').join(''); }`), [],
    'a callback handed the elements of a literal array is handed literals');
  assert.equal(leavesOf(`function f(){ const rows=[]; rows.push('<b>ok</b>'); rows.push(location.hash); el.innerHTML = rows.join(''); }`).length, 1,
    'a pushed value is part of the array');
});

test('①d translations: a declared picker with authored arguments is safe, with a variable it is not; a picker reading `arguments` needs ALL of them', () => {
  assert.deepEqual(leavesOf(`function f(){ el.innerHTML = window.IntMapLang.t(HOST.lang, 'Close', '閉じる'); }`), []);
  assert.equal(leavesOf(`function f(p){ el.innerHTML = window.IntMapLang.t(HOST.lang, p.name, '閉じる'); }`).length, 1);
  const picker = `function L(){ if(!L._p) L._p = window.IntMapLang.pick(() => HOST.lang); return L._p.apply(null, arguments); }`;
  assert.deepEqual(leavesOf(picker + `function f(){ el.innerHTML = L('Close', '閉じる'); }`), []);
  assert.equal(leavesOf(picker + `function f(p){ el.innerHTML = L(p.title, '閉じる'); }`).length, 1,
    'a function with no named parameter that forwards `arguments` depends on every argument');
});

test('①e a local builder is judged per parameter, and a local helper\'s parameter is judged at its callers', () => {
  const row = `const esc=(s)=>window.IntMapSafe.html(s); const row=(k,v)=>'<div><span>'+k+'</span>'+esc(v)+'</div>';`;
  assert.deepEqual(leavesOf(row + `function f(p){ el.innerHTML = row('Name', p.name); }`), [], 'v is escaped inside row');
  assert.deepEqual(leavesOf(row + `function f(p){ el.innerHTML = row(p.label, 'x'); }`), ['p.label'], 'k is not');
  const bubble = `function bubble(h){ box.innerHTML = h; }`;
  assert.deepEqual(leavesOf(bubble + `bubble('<b>ok</b>'); bubble(location.hash);`), ['location.hash'], 'what the callers pass');
  assert.deepEqual(leavesOf(bubble + `bubble('<b>ok</b>'); window.b = bubble;`), ['h'], 'a helper handed out has callers this file cannot see');
});

test('①f a destructured escaper is judged by every function offered under that name in js/', () => {
  const offer = { 'js/a.js': `const esc=(s)=>window.IntMapSafe.html(s); window.makeB({ esc });` };
  const use = { 'js/b.js': `window.makeB=function({ esc }){ return (p) => { el.innerHTML = esc(p.name); }; };` };
  assert.deepEqual(leavesOf({ ...offer, ...use }), []);
  const csv = { 'js/c.js': `const esc=(s)=>/[",]/.test(s)?'"'+s+'"':s; window.csv({ esc });` };
  assert.deepEqual(leavesOf({ ...offer, ...use, ...csv }), ['p.name'],
    'a CSV quoter offered as `esc` passes its argument through, so `esc` is no longer an encoder and what it is given is judged');
  assert.deepEqual(leavesOf({ ...offer, ...use, 'js/d.js': `function exp(rows){ const esc=(s)=>'"'+s+'"'; return rows.map((r) => esc(r)).join(','); }` }), [],
    'a helper only ever called inside its own function is not offered');
});

test('①g every kind of sink is read; an element of an inert document is not a sink', () => {
  assert.equal(leavesOf(`function f(p){ a.outerHTML = p.x; b.insertAdjacentHTML('beforeend', p.y); popup.setHTML(p.z); c.innerHTML += p.w; }`).length, 4);
  assert.deepEqual(leavesOf(`function t(s){ const doc = document.implementation.createHTMLDocument(''); const d = doc.createElement('div'); d.innerHTML = s; return d.textContent; } t(location.hash);`), []);
  assert.deepEqual(leavesOf(`function t(s){ const d = document.createElement('div'); d.innerHTML = s; return d.textContent; } t(location.hash);`), ['location.hash'],
    'an element of the LIVE document fetches what it parses');
});

/* ══ ② the declarations ══════════════════════════════════════════════════════════════════════════ */

test('② a TRUSTED entry needs a reason, a function that exists where it says, and a caller', () => {
  const r = scan();
  assert.deepEqual(trustedProblems(r), [], 'the shipped table is sound');
  const t0 = TRUSTED[0];
  assert.ok(trustedProblems(r, [{ ...t0, why: 'safe' }]).some((p) => /needs a reason/.test(p)));
  assert.ok(trustedProblems(r, [{ ...t0, fn: 'noSuchFunction' }]).some((p) => /no longer defines a function noSuchFunction/.test(p)));
  assert.ok(trustedProblems(r, [{ ...t0, callee: 'Nobody.calls' }]).some((p) => /nothing in js\/ calls it/.test(p)));
});

/* ══ ③ the ledger ═════════════════════════════════════════════════════════════════════════════════ */

test('③ the ledger agrees with the tree, and moves only when the tree does', () => {
  const now = check(ROOT, LEDGER, TREE);
  assert.ok(now.ok, now.lines.join('\n'));
  const ledger = JSON.parse(read('tests/output-taint-baseline.json'));
  assert.equal(ledger.total, now.total);
  /* a new raw value in a real file */
  const added = check(ROOT, LEDGER, withFile('js/cameras.js', (s) => s + `\nfunction __probe(p){ document.body.innerHTML = '<b>' + p.name + '</b>'; }\n`));
  assert.ok(added.lines.some((l) => l.startsWith('js/cameras.js:') && /p\.name/.test(l)), added.lines.join('\n'));
  /* an unjudged value escaped without lowering the ledger */
  const f = Object.keys(ledger.files).find((k) => k === 'js/beta-overlays.js');
  const lowered = check(ROOT, LEDGER, withFile(f, (s) => s.replace("L.arr(BLBL[k])", "window.IntMapSafe.html(L.arr(BLBL[k]))")));
  assert.ok(lowered.lines.some((l) => l.startsWith(f + ':') && /lower it/.test(l)), lowered.lines.join('\n'));
});

/* ══ ④ the three reported sinks ═══════════════════════════════════════════════════════════════════ */

test('④a the OpenFreeMap country name and the country card are escaped — and reverting either turns the ledger red', () => {
  const ofm = check(ROOT, LEDGER, withFile('js/map-extras.js', (s) => s.replace(/\(HOST\.lang==='jp'\?\(nmH\+/, "(HOST.lang==='jp'?(name+")));
  assert.ok(ofm.lines.some((l) => l.startsWith('js/map-extras.js:')), ofm.lines.join('\n'));
  const card = check(ROOT, LEDGER, withFile('js/countries-ui.js', (s) => s.replace("<b>${s&&s.capital?escC(s.capital):HOST.t('dataNA')}</b>", "<b>${s&&s.capital?s.capital:HOST.t('dataNA')}</b>")));
  assert.ok(card.lines.some((l) => l.startsWith('js/countries-ui.js:') && /s\.capital/.test(l)), card.lines.join('\n'));
});

test('④b no field of the ADS-B / AIS record reaches the tooltip markup unescaped', () => {
  const feedField = (l) => /^(?:p\.|p\[|acName$|nm$)/.test(l.text);
  const now = scan(ROOT, TREE).analyzers['js/data-layers.js'].functionLeaves('trafficTooltipHTML');
  assert.ok(now.length > 0 && now.length < 8, 'the builder is found and judged: ' + JSON.stringify(now));
  assert.deepEqual(now.filter(feedField), [], JSON.stringify(now));
  /* the defect as it was: the callsign, registration and squawk raw */
  const raw = withFile('js/data-layers.js', (s) => s.replace("escapeHtml(p.callsign||p.reg||p.icao24||'—')", "p.callsign||p.reg||p.icao24||'—'")
    .replace("escapeHtml(p.squawk||'')", 'p.squawk'));
  const was = scan(ROOT, raw).analyzers['js/data-layers.js'].functionLeaves('trafficTooltipHTML');
  assert.ok(was.filter(feedField).length >= 4, 'the raw callsign / reg / icao24 / squawk are seen: ' + JSON.stringify(was));
});

/* ══ ⑤ the service worker ════════════════════════════════════════════════════════════════════════ */

const SW = read('sw.js');
const isTile = new Function(SW.slice(SW.indexOf('const TILE_HOSTS'), SW.indexOf("self.addEventListener('install'")) + '\nreturn isTileRequest;')();

test('⑤ the DEM is cached for one host + one path prefix: every DEM URL the app builds is admitted, a foreign bucket is not', () => {
  /* discovered, not listed: every terrarium template written anywhere in js/ */
  const urls = new Set();
  for (const src of Object.values(TREE)) for (const m of src.matchAll(/https:\/\/[a-z0-9.-]+\.amazonaws\.com\/[A-Za-z0-9_\-/]*terrarium\/\{z\}\/\{x\}\/\{y\}\.png/g)) urls.add(m[0]);
  assert.ok(urls.size >= 5, 'the five js/dem-source.js aliases are found: ' + [...urls].join(' '));
  for (const u of urls) assert.equal(isTile(u.replace('{z}', '12').replace('{x}', '3639').replace('{y}', '1612')), true, u);
  for (const bad of [
    'https://s3.amazonaws.com/any-bucket/terrarium/1/1/1.png',                       /* path-style: another bucket */
    'https://s3.dualstack.us-east-1.amazonaws.com/x/elevation-tiles-prod/terrarium/1.png',
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/../../evil/terrarium/x.png',   /* normalised away */
    'https://elevation-tiles-prod.s3.amazonaws.com/other/terrarium/1.png',           /* the bucket, another prefix */
    'https://anything.example/terrarium/1.png',
    'http://s3.amazonaws.com/elevation-tiles-prod/terrarium/1/1/1.png',              /* plaintext */
  ]) assert.equal(isTile(bad), false, bad);
  assert.equal(isTile('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1'), true, 'host rules are unchanged');
});

/* ══ ⑥ the CSP ═══════════════════════════════════════════════════════════════════════════════════ */

/* CSP Level 3 §6.7.2.9 (source expression matching), for the https host-sources in this policy */
function sourceMatches(source, url) {
  const m = /^(https?:\/\/)?(\*\.)?([^/:]+)(\/[^\s]*)?$/.exec(source); if (!m) return false;
  const u = new URL(url);
  if (m[1] && u.protocol !== m[1].slice(0, -2)) return false;
  if (m[2] ? !(u.hostname.endsWith('.' + m[3])) : u.hostname !== m[3]) return false;
  if (!m[4]) return true;
  const path = decodeURIComponent(u.pathname);
  return m[4].endsWith('/') ? path.startsWith(m[4]) : path === m[4];
}
function sdkUrls() {
  /* SDK_URLS in js/wx-ecmwf.js, with SDK_VER substituted — evaluated from the AST, not copied */
  const ast = parseSource(TREE['js/wx-ecmwf.js']);
  let ver = null; const srcs = [];
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.name === 'SDK_VER' && n.init && n.init.type === 'Literal') ver = n.init.value;
    if (n.type === 'Property' && n.key && n.key.name === 'src' && n.value.type === 'BinaryExpression') srcs.push(n.value);
  });
  const val = (e) => (e.type === 'Literal' ? e.value : e.type === 'Identifier' && e.name === 'SDK_VER' ? ver : e.type === 'BinaryExpression' ? val(e.left) + val(e.right) : null);
  return srcs.map(val);
}

test('⑥ the CSP admits the ECMWF SDK by its exact path — the one js/wx-ecmwf.js loads — and no longer every script on unpkg', () => {
  const csp = /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/.exec(read('index.html'))[1];
  const scriptSrc = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src ')).split(/\s+/).slice(1);
  const unpkg = scriptSrc.filter((s) => /unpkg\.com/.test(s));
  assert.equal(unpkg.length, 1);
  assert.ok(new URL(unpkg[0]).pathname.length > 1, 'the unpkg source carries a path, not the whole host: ' + unpkg[0]);
  const urls = sdkUrls();
  const sdk = urls.find((u) => /^https:\/\/unpkg\.com\//.test(u));
  assert.ok(sdk, 'js/wx-ecmwf.js still loads the SDK from unpkg: ' + urls.join(' '));
  assert.ok(scriptSrc.some((s) => sourceMatches(s, sdk)), `script-src must admit ${sdk} — bump SDK_VER and the CSP path together`);
  assert.ok(!scriptSrc.some((s) => sourceMatches(s, 'https://unpkg.com/some-other-package@1.0.0/dist/index.js')), 'another package on unpkg is refused');
  assert.ok(!scriptSrc.some((s) => sourceMatches(s, sdk.replace('@0.', '@9.'))), 'another version of the same package is refused');
  assert.ok(/'unsafe-eval'/.test(csp), "Cesium's 'unsafe-eval' is not this change's to remove");
});

/* ══ ⑦ data-effect ═══════════════════════════════════════════════════════════════════════════════ */

test('⑦ writing controls: the ledger agrees; an undeclared new one is red, declaring it is green; a parameter is not followed by name', () => {
  const tree = DE.readTree(ROOT);
  const now = DE.check(tree);
  assert.ok(now.ok, now.lines.join('\n'));
  assert.ok(now.found.some((x) => x.selector === '#fb-send' && x.declared), 'the feedback send button is found and declared');
  assert.ok(now.found.some((x) => x.file === 'js/app-body.js' && x.selector === '#lang-en' && x.declared),
    'the language buttons reach the preferences upsert through window._syncPrefsUp, and are found — and declared private');
  assert.ok(now.found.some((x) => x.file === 'js/map-ui.js' && x.selector === '[data-del]' && x.declared),
    'a selector is answered from its own file first: [data-del] in js/map-ui.js is the preset delete, not the waypoint in js/drone-nav.js');
  const add = (markup, js) => ({ files: tree.files.concat([{ path: 'js/__probe.js', src: js }]), markup: DE.corpus(tree.files.concat([{ path: 'x', src: markup }, { path: 'index.html', src: read('index.html') }])) });
  const js = `(function(){ document.getElementById('probe-send').onclick = async () => { await HOST.DB.from('t').insert({ a: 1 }); }; })();`;
  const bare = DE.check(add('<button id="probe-send">Send</button>', js));
  assert.ok(bare.lines.some((l) => l.startsWith('js/__probe.js:') && /#probe-send/.test(l)), bare.lines.join('\n'));
  assert.ok(DE.check(add('<button id="probe-send" data-effect="outward">Send</button>', js)).ok);
  const viaInvoke = DE.check(add('<button id="probe-inv">Go</button>', `document.getElementById('probe-inv').onclick = () => sb.functions.invoke('x', { body: {} });`));
  assert.ok(viaInvoke.lines.some((l) => /functions\.invoke/.test(l)), 'functions.invoke is a write');
  const viaParam = DE.measure(add('<button id="probe-p">Go</button>', `function wire(fn){ document.getElementById('probe-p').onclick = () => fn(); }`));
  assert.ok(!viaParam.found.some((x) => x.file === 'js/__probe.js'), 'fn() is whatever was passed, not every function called fn');
});

/* ══ ⑧ wiring ════════════════════════════════════════════════════════════════════════════════════ */

test('⑧ both ledgers are rules of check:static', () => {
  const s = codeOnly(read('scripts/static-checks.mjs'));
  assert.match(s, /import\('\.\/output-taint\.mjs'\)[\s\S]{0,200}err\('output-taint'/);
  assert.match(s, /import\('\.\/data-effects\.mjs'\)[\s\S]{0,200}err\('data-effect'/);
});
