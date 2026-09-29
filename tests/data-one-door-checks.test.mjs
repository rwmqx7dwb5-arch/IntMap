/* ============================================================================
 *  data-one-door — the shipped data/ files have ONE reader, and it is run here, not read
 * ----------------------------------------------------------------------------
 *  js/data-door.js is imported and EVALUATED (not grepped) against a stubbed `fetch` that counts:
 *    ① two calls for one file while it is in flight → one request, one value;
 *       'data/x' and its absolute spelling are one file; a settled value is handed back again
 *       with no request while somebody holds it.
 *    ② a failure is not kept: 'http' (with the status) and 'network' reject, and the next call
 *       reads again; the host going silent is 'timeout' — told apart from both.
 *    ③ gzip is decided from the bytes, and the page path's answer equals node's own gunzip of the
 *       REAL shipped file (json and arrayBuffer).
 *    ④ the WORKER path runs the door's own worker source on a real second thread (worker_threads)
 *       and gives the same answer as the page path; a thread that dies rejects as 'worker' and the
 *       next call runs on the page.
 *    ⑤ discovered from the code (scripts/code-only.mjs, comments removed), not from a list of files:
 *       nothing in js/ or src/ but the door both fetches and inflates gzip itself; no data/ file is
 *       fetched by name from two files; and the readers this change moved reach the door.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Worker as NodeWorker } from 'node:worker_threads';
import { makeDataDoor, loadData } from '../js/data-door.js';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const BASE = 'https://door.test/';

/* a fetch that serves the repository's own files, counting every request by absolute URL */
function servingFetch(opts) {
  const o = opts || {};
  const calls = [];
  const fn = async (url, init) => {
    calls.push(String(url));
    if (o.fail) { const f = o.fail(String(url), calls.length); if (f) return f(init); }
    const path = new URL(String(url)).pathname.slice(1);
    let body;
    try { body = readFileSync(join(ROOT, path)); } catch (_) { return new Response('nope', { status: 404 }); }
    if (o.delay) await new Promise((r) => setTimeout(r, o.delay));
    return new Response(body, { status: 200 });
  };
  fn.calls = calls;
  return fn;
}
async function withFetch(f, body) {
  const saved = globalThis.fetch;
  globalThis.fetch = f;
  try { return await body(); } finally { globalThis.fetch = saved; }
}
const pageDoor = () => makeDataDoor({ base: () => BASE, spawn: () => null });

/* the door's worker source, run on a real second thread: worker_threads evaluates it as CommonJS, so
   `self` is the one shim — everything the job touches (Response, Blob, DecompressionStream,
   TextDecoder, JSON) is the runtime's own */
function nodeSpawn(src, hook) {
  return () => {
    const shim = 'const { parentPort } = require("node:worker_threads");\n' +
      'const self = { postMessage: (m, t) => parentPort.postMessage(m, t) };\n' +
      'parentPort.on("message", (data) => self.onmessage({ data }));\n';
    const nw = new NodeWorker(shim + src, { eval: true });
    const it = {
      onmessage: null, onerror: null, onmessageerror: null,
      postMessage: (m, t) => { if (hook) hook(nw); nw.postMessage(m, t); },
      terminate: () => nw.terminate(),
    };
    nw.on('message', (data) => it.onmessage && it.onmessage({ data }));
    nw.on('error', (e) => it.onerror && it.onerror(e));
    return it;
  };
}

/* ═══ ① ONE PROMISE PER FILE ═══════════════════════════════════════════════════════════════════ */
test('data-one-door ①: two calls in flight for one file make ONE request and get ONE value', async () => {
  const f = servingFetch({ delay: 20 });
  await withFetch(f, async () => {
    const door = pageDoor();
    const [a, b] = await Promise.all([door.load('data/volcanoes_gvp.json'), door.load(BASE + 'data/volcanoes_gvp.json')]);
    assert.equal(f.calls.length, 1, `one file, ${f.calls.length} requests`);
    assert.equal(a, b, 'both callers hold the same object');
    assert.ok(Array.isArray(a.features) && a.features.length > 1000, 'and it is the real catalogue');
    /* a call after it settled, while `a` is still held, costs nothing */
    const c = await door.load('data/volcanoes_gvp.json');
    assert.equal(c, a);
    assert.equal(f.calls.length, 1, 'a settled, still-held value is not read again');
    const n = door.counts();
    assert.equal(n.reads, 1); assert.equal(n.shared, 1); assert.equal(n.reused, 1);
  });
});

test('data-one-door ①b: the shape asked for is part of the key, and an unknown shape is refused', async () => {
  const f = servingFetch();
  await withFetch(f, async () => {
    const door = pageDoor();
    const j = await door.load('data/crust1.json');
    const t = await door.load('data/crust1.json', { as: 'text' });
    assert.equal(typeof j, 'object'); assert.equal(typeof t, 'string');
    assert.deepEqual(JSON.parse(t), j);
    await assert.rejects(door.load('data/crust1.json', { as: 'blob' }), (e) => e.reason === 'parse');
  });
});

/* ═══ ② A FAILURE IS NOT KEPT, AND IT IS NAMED ═════════════════════════════════════════════════ */
test('data-one-door ②: http and network failures reject by name and the next call reads again', async () => {
  let refuse = 2;
  const f = servingFetch({ fail: (url, n) => {
    if (!refuse) return null;
    refuse--;
    return n === 1 ? () => new Response('gone', { status: 503 }) : () => { throw new TypeError('connection refused'); };
  } });
  await withFetch(f, async () => {
    const door = pageDoor();
    await assert.rejects(door.load('data/whc-sites.json'), (e) => e.reason === 'http' && e.status === 503);
    await assert.rejects(door.load('data/whc-sites.json'), (e) => e.reason === 'network');
    const ok = await door.load('data/whc-sites.json');
    assert.ok(Array.isArray(ok.sites) && ok.sites.length > 1000, 'the third call — after two observed failures — reads the file');
    assert.equal(f.calls.length, 3, 'each failure was followed by exactly one new read, and only because it was asked');
  });
});

test('data-one-door ②b: a host that goes silent is \'timeout\', not a refusal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = async (url, init) => new Promise((_, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await withFetch(f, async () => {
    const door = pageDoor();
    const p = door.load('data/volcanoes_gvp.json');
    let why = null; p.catch((e) => { why = e.reason; });
    /* node's mock timers do not run a timer scheduled inside the same tick(), so step one ms at a time */
    for (let i = 0; i < 6100 && why === null; i++) { t.mock.timers.tick(1); await Promise.resolve(); }
    await assert.rejects(p);
    assert.equal(why, 'timeout', 'silence past the clock is named as silence');
  });
});

/* ═══ ③ GZIP FROM THE BYTES, AND THE PAGE PATH EQUALS NODE'S OWN GUNZIP ═══════════════════════ */
test('data-one-door ③: the page path inflates the real shipped files exactly as node does', async () => {
  const f = servingFetch();
  await withFetch(f, async () => {
    const door = pageDoor();
    const doc = await door.load('data/coastline.json.gz');
    assert.deepEqual(doc, JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/coastline.json.gz'))).toString('utf8')));
    const ab = await door.load('data/crust1.bin.gz', { as: 'arrayBuffer' });
    assert.ok(ab instanceof ArrayBuffer);
    assert.ok(Buffer.from(ab).equals(gunzipSync(readFileSync(join(ROOT, 'data/crust1.bin.gz')))), 'binary bytes identical');
    /* an uncompressed body is not inflated, whatever its name says */
    const plain = await door.load('data/volcanoes_gvp.json');
    assert.deepEqual(plain, JSON.parse(read('data/volcanoes_gvp.json')));
    assert.equal(door.counts().worker, 0, 'no thread was asked for on the page path');
  });
});

/* ═══ ④ THE WORKER PATH, ON A REAL SECOND THREAD ═══════════════════════════════════════════════ */
test('data-one-door ④: the worker source gives the page path\'s answer, from another thread', async () => {
  const f = servingFetch();
  await withFetch(f, async () => {
    const probe = pageDoor();
    const onThread = makeDataDoor({ base: () => BASE, spawn: nodeSpawn(probe.workerSource()) });
    const [a, b] = await Promise.all([onThread.load('data/admin1-world.json.gz'), pageDoor().load('data/admin1-world.json.gz')]);
    assert.deepEqual(a, b, 'the same document either way');
    assert.ok(Array.isArray(a.f) && a.f.length > 4000, 'and it is the real first-level index');
    const ab = await onThread.load('data/slab2.bin.gz', { as: 'arrayBuffer' });
    assert.ok(Buffer.from(ab).equals(gunzipSync(readFileSync(join(ROOT, 'data/slab2.bin.gz')))), 'binary transferred back intact');
    assert.equal(onThread.counts().worker, 2, 'both compressed reads ran on the thread');
    assert.equal(onThread.counts().thread, false, 'and the thread was given back once idle');
    /* the job text IS the page's function — one implementation, two callers */
    assert.ok(probe.workerSource().includes(probe.inflate.toString()), 'the worker is built from inflate()\'s own source');
  });
});

test('data-one-door ④b: a thread that dies rejects as \'worker\', and the next call runs on the page', async () => {
  const f = servingFetch();
  await withFetch(f, async () => {
    const door = makeDataDoor({ base: () => BASE, spawn: nodeSpawn('throw new Error("boom");') });
    await assert.rejects(door.load('data/coastline.json.gz'), (e) => e.reason === 'worker');
    const doc = await door.load('data/coastline.json.gz');
    assert.ok(Array.isArray(doc.coords), 'the retry read the file on the page');
    assert.equal(door.counts().page, 1);
  });
});

test('data-one-door ④c: the module\'s own instance is the one classic scripts reach', () => {
  assert.equal(typeof loadData, 'function');
  /* js/gazetteer.js and js/earth-structure.js are evaluated with `new Function` by their harnesses and
     cannot import; they must ask window.IntMapDataDoor at call time, not capture it at load */
  for (const f of ['js/gazetteer.js', 'js/earth-structure.js']) {
    const c = codeOnly(read(f));
    assert.match(c, /window\.IntMapDataDoor/, `${f} reaches the door by its window name`);
  }
  assert.match(codeOnly(read('js/data-door.js')), /window\.IntMapDataDoor\s*=/, 'the door publishes that name');
});

/* ═══ ⑤ DISCOVERED FROM THE CODE ═══════════════════════════════════════════════════════════════ */
const SOURCES = [
  ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f),
  ...readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f),
];
const CODE = new Map(SOURCES.map((f) => [f, codeOnly(read(f))]));

/* Files that still inflate a fetched gzip body themselves. Each row says why it is not through the
   door yet; a row whose file no longer does it FAILS, so this can only shrink. Empty: every reader
   of a shipped gzip goes through the door. */
const NOT_YET = {};

/* directReads(code) -> [{ path, how }] — every data/ file this code fetches ITSELF, found in the three
   forms the tree has used: a literal (`fetch('data/x')`), an inline URL (`fetch(new URL('data/x', …))`),
   and a name bound to an expression that holds a data/ literal (`const U = new URL('data/x', …)…;
   fetch(U)`, `const BASE = 'data/rail/'; fetch(BASE + k)`). A `data/` path read through a parameter
   (`function get(url){ fetch(url) }`) is invisible here — the inflate rule (⑤) and the door's own
   counting are what see that shape. */
function directReads(code) {
  const out = [];
  const lit = /['"`]((?:\.\/)?data\/[^'"`$]*)['"`]/;
  for (const m of code.matchAll(/\bfetch\s*\(\s*(?:new\s+URL\s*\(\s*)?['"`]((?:\.\/)?data\/[^'"`$]*)['"`]/g)) {
    out.push({ path: m[1].replace(/^\.\//, ''), how: 'literal' });
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]{0,400})/g)) {
    const l = lit.exec(m[2]);
    if (!l) continue;
    const name = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('\\bfetch\\s*\\(\\s*(?:new\\s+URL\\s*\\(\\s*)?' + name + '(?![\\w$])').test(code)) {
      out.push({ path: l[1].replace(/^\.\//, ''), how: 'via ' + m[1] });
    }
  }
  return out;
}

test('data-one-door ⑤: nothing but the door both fetches and inflates gzip itself', () => {
  const inflatesFetched = [...CODE].filter(([f, c]) => f !== 'js/data-door.js'
    && /\bDecompressionStream\s*\(\s*['"`]gzip['"`]/.test(c) && /\bfetch\s*\(/.test(c)).map(([f]) => f);
  const unexplained = inflatesFetched.filter((f) => !NOT_YET[f]);
  assert.deepEqual(unexplained, [], 'these fetch and inflate a gzip body themselves — read it through js/data-door.js loadData()');
  for (const [f, why] of Object.entries(NOT_YET)) {
    assert.ok(why.length > 20, `${f} needs a reason`);
    assert.ok(inflatesFetched.includes(f), `${f} no longer inflates on its own — remove its NOT_YET row`);
  }
});

test('data-one-door ⑤b: no data/ file is fetched directly from two files — literal, new URL(…) or a bound name', () => {
  const by = new Map();
  for (const [f, c] of CODE) {
    if (f === 'js/data-door.js') continue;
    for (const r of directReads(c)) {
      if (!by.has(r.path)) by.set(r.path, new Set());
      by.get(r.path).add(f + ' (' + r.how + ')');
    }
  }
  const twice = [...by].filter(([, s]) => s.size > 1).map(([p, s]) => `${p}: ${[...s].join(', ')}`);
  assert.deepEqual(twice, [], 'a second reader of one file must share the first one\'s read (js/data-door.js)');
});

test('data-one-door ⑤c: no file but the door fetches a data/*.gz itself, in any of those forms', () => {
  const offenders = [];
  for (const [f, c] of CODE) {
    if (f === 'js/data-door.js' || NOT_YET[f]) continue;
    for (const r of directReads(c)) if (/\.gz$/.test(r.path)) offenders.push(`${f}: ${r.path} (${r.how})`);
  }
  assert.deepEqual(offenders, [], 'read these through js/data-door.js loadData()');
});

test('data-one-door ⑤d: the discovery sees every form it forbids (run on the shapes this change removed)', () => {
  const seen = (src) => directReads(codeOnly(src)).map((r) => r.path + ' ' + r.how);
  assert.deepEqual(seen("const ADM1_URL='data/admin1-world.json.gz'; fetch(ADM1_URL).then(r=>r)"),
    ['data/admin1-world.json.gz via ADM1_URL']);
  assert.deepEqual(seen("const url = (() => { try { return new URL('data/volcanoes_gvp.json', document.baseURI).toString(); } catch (_) { return 'data/volcanoes_gvp.json'; } })();\nfetch(url).then((r) => r.json());"),
    ['data/volcanoes_gvp.json via url']);
  assert.deepEqual(seen("fetch(new URL('data/x.json.gz', document.baseURI))"), ['data/x.json.gz literal']);
  assert.deepEqual(seen("const BASE = 'data/railways/'; fetch(BASE + 'world.json.gz')"), ['data/railways/ via BASE']);
  assert.deepEqual(seen("// fetch('data/a.json')\nloadData('data/a.json')"), [], 'a comment and a door call are not reads');
});

/* ═══ ⑥ js/world-packs.js worldAdm1 — THE SHIPPED FUNCTION, EVALUATED ══════════════════════════ */
test('data-one-door ⑥: a failed world-index read is not kept, so the next ask reaches the door again', async () => {
  const src = read('js/world-packs.js');
  const at = src.indexOf('function worldAdm1(){');
  assert.ok(at > 0, 'worldAdm1 is in js/world-packs.js');
  /* the function's own text, cut at its closing brace (strings in it hold no braces) */
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const make = new Function('SUBDIV', 'loadData', 'ADM1_URL', '_alias', '_norm', src.slice(at, end) + '\nreturn worldAdm1;');
  let calls = 0;
  const SUBDIV = {};
  const doc = { f: [{ i: 'JPN', n: 'Tokyo|JP-13', g: { type: 'Polygon', coordinates: [[[139, 35], [140, 35], [140, 36], [139, 35]]] } }] };
  const loadData = (u) => { calls++; return calls === 1 ? Promise.reject(Object.assign(new Error('http 503'), { reason: 'http' })) : Promise.resolve(doc); };
  const worldAdm1 = make(SUBDIV, loadData, 'data/admin1-world.json.gz', (s) => String(s || '').split('|'), (s) => String(s).toLowerCase());
  await assert.rejects(worldAdm1(), (e) => e.reason === 'http');
  assert.equal(SUBDIV.world, null, 'the rejected promise is dropped from the memo');
  const w = await worldAdm1();
  assert.equal(calls, 2, 'the second ask reached the door — after an observed failure, and only then');
  assert.equal(w.units, 1); assert.ok(w.geoms.JPN && w.names.JPN.tokyo, 'and it built the index from the answer');
  assert.equal(await worldAdm1(), w, 'a success IS kept');
  assert.equal(calls, 2);
});
