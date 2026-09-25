/* ============================================================================
 *  own-fetch-relay — the page's relays are its own, and a relay's allow-list and its own client agree
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE STATES (so that the next variant of them fails here too):
 *
 *  ① #R803: alerts-relay's allow-list and the URL its own client sends drifted apart, and nothing in
 *     the repository could see it — the relay answered 400 to `https://www.nmc.cn/…` for an hour of
 *     production before anyone noticed. A relay and its client are two halves of one rule; nothing
 *     compared them. ⇒ Every URL the page hands to a relay of ours is DISCOVERED from the source
 *     (the arguments of the calls that reach js/proxy-fetch.js, and of the functions that build a
 *     relay URL themselves), routed the way the page routes it, and then EVALUATED against the
 *     relay's handler with the upstream stubbed. A relay that would not forward it is a failure.
 *     The allow-lists are never read as text: the handler is run.
 *
 *  ② The page reached upstreams that send no ACAO through four PUBLIC CORS proxies, written out by
 *     hand in eighteen files; a third party saw every such request and could rewrite every answer.
 *     ⇒ fetch-relay's list is ONE file (_shared/fetch-relay-policy.js) that both the function and
 *     the page import; a caller that relies on a relay (no `direct` rung) and names an upstream no
 *     relay of ours admits fails here; and every host the list admits is named by some caller.
 *
 *  ③ Of the fifteen functions deployed with verify_jwt = false, only routing-relay took a token from
 *     the shared bucket. ⇒ Each of them is run with the bucket refusing, and none may reach an
 *     upstream: it either took a token and answered 429, or it refused the request before any
 *     network at all.
 *
 *  Runner: Edge Functions are evaluated in a child process (Deno.serve captured, fetch stubbed) —
 *  the shape of tests/r801-relay-input-checks.test.mjs.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = 'https://sb.test';
const HOLE = '\u0000';

/* ── the runner ───────────────────────────────────────────────────────────────────────────────
   Each request is answered in turn, and the upstream calls made WHILE it was being answered are
   attributed to it. `rpc` is what relay_take answers (null = the function is not given a
   database at all, which is how every relay behaves when its env is empty). */
function runEdge(fn, requests, opts) {
  const o = opts || {};
  const url = pathToFileURL(join(ROOT, 'supabase/functions', fn, 'index.ts')).href;
  const env = o.env || {};
  const src = `
    const dns = ${JSON.stringify(o.dns === undefined ? null : o.dns)};
    globalThis.Deno = { env: { get: (k) => (${JSON.stringify(env)})[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    if (dns) globalThis.Deno.resolveDns = async (h, t) => (dns[h] || []).filter((a) => (t === "AAAA") === a.includes(":"));
    const routes = ${JSON.stringify(o.routes || [])}.map(([re, r]) => [new RegExp(re), r]);
    const rpc = ${JSON.stringify(o.rpc === undefined ? null : o.rpc)};
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) {
        globalThis.__calls.push("RPC " + s);
        return new Response(JSON.stringify(rpc), { status: rpc ? 200 : 503, headers: { "content-type": "application/json" } });
      }
      globalThis.__calls.push("GET " + s);
      const hit = routes.find(([re]) => re.test(s));
      const r = hit ? hit[1] : { status: 200, body: "{}", type: "application/json" };
      const h = { "content-type": r.type || "application/json" };
      if (r.location) h.location = r.location;
      return new Response(r.body == null ? "" : r.body, { status: r.status || 200, headers: h });
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      let status = 0, body = "";
      try { const r = await globalThis.__h(new Request("http://relay.test/" + q, { headers: { "x-forwarded-for": "203.0.113.7" } })); status = r.status; body = (await r.text()).slice(0, 200); }
      catch (e) { status = -1; body = String(e && e.message || e).slice(0, 200); }
      out.push({ q, status, body, calls: globalThis.__calls.slice(before) });
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(raw);
}

/* ── the page's router, evaluated (never read) ─────────────────────────────────────────────── */
globalThis.window = { SUPABASE_URL: SUPA };
const proxyFetch = await import(pathToFileURL(join(ROOT, 'js/proxy-fetch.js')).href);
const policy = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/fetch-relay-policy.js')).href);
/* the relay a URL goes to, as the page decides it: { fn, u } or null */
function routeOf(url) {
  const r = proxyFetch.ownRelayUrl(url);
  if (!r) return null;
  const m = /^https:\/\/sb\.test\/functions\/v1\/([a-z0-9-]+)\?u=(.*)$/.exec(r);
  assert.ok(m, 'the page builds our relays only as <SUPABASE_URL>/functions/v1/<fn>?u=…: ' + r);
  return { fn: m[1], u: decodeURIComponent(m[2]) };
}

/* ══ DISCOVERY ══════════════════════════════════════════════════════════════════════════════
   Every call that hands a URL to the page's relays, from the source. The entry points are what
   js/proxy-fetch.js exports (read from the module, not typed here); a function that passes one of
   its own parameters to an entry point becomes one too (to a fixpoint, across files, because
   `_fetchJSON` is made in one file and called in three). A function whose body builds
   `/functions/v1/<fn>?` is a relay builder for <fn> (js/world-packs.js's `relay`). */
function jsFilesUnder(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'locales' && e.name !== 'vendor') out.push(...jsFilesUnder(join(dir, e.name))); continue; }
    if (e.name.endsWith('.js')) out.push(join(dir, e.name).replace(/\\/g, '/'));
  }
  return out;
}
const FILES = jsFilesUnder('js').map((f) => {
  const src = readFileSync(join(ROOT, f), 'utf8');
  let ast = null;
  for (const sourceType of ['module', 'script']) {
    try { ast = parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, locations: true }); break; } catch (_) { /* try the other */ }
  }
  assert.ok(ast, f + ' parses');
  /* parent links, so a name can be resolved from wherever it is used */
  (function link(n, p) {
    if (!n || typeof n.type !== 'string') return;
    n.parent = p;
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => link(c, n));
      else if (v && typeof v.type === 'string') link(v, n);
    }
  })(ast, null);
  return { f, ast };
});
function each(node, fn) {
  (function go(n) {
    if (!n || typeof n.type !== 'string') return;
    fn(n);
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v);
    }
  })(node);
}
const isFn = (n) => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
const calleeName = (c) => (c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') ? c.property.name : null);
function fnName(f) {
  if (f.id && f.id.name) return f.id.name;
  const p = f.parent;
  if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if (p && p.type === 'AssignmentExpression' && p.left.type === 'Identifier') return p.left.name;
  return null;
}
const directOf = (call) => {
  const o = call.arguments[1];
  return !!(o && o.type === 'ObjectExpression' && o.properties.some((p) => p.key && (p.key.name === 'direct' || p.key.value === 'direct') && p.value && p.value.type === 'Literal' && p.value.value === true));
};

/* entry name → { direct }  (direct: the caller also asks the host itself, so a URL with no relay is not a defect) */
const ENTRIES = new Map(Object.keys(proxyFetch).map((k) => [k, { direct: k !== 'fetchViaProxy' }]));
for (let grew = true; grew;) {
  grew = false;
  for (const { ast } of FILES) {
    each(ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const name = calleeName(n.callee);
      if (!name || !ENTRIES.has(name) || !n.arguments[0] || n.arguments[0].type !== 'Identifier') return;
      /* the nearest enclosing function that OWNS the name as a parameter (a Promise executor or a
         callback in between does not) */
      let f = n.parent;
      while (f && !(isFn(f) && f.params.some((p) => p.type === 'Identifier' && p.name === n.arguments[0].name))) f = f.parent;
      if (!f) return;
      const w = fnName(f);
      if (!w || ENTRIES.has(w)) return;
      ENTRIES.set(w, { direct: ENTRIES.get(name).direct || directOf(n) });
      grew = true;
    });
  }
}
/* relay builders: a function whose own body names /functions/v1/<fn>? */
const BUILDERS = new Map();
for (const { ast } of FILES) {
  each(ast, (n) => {
    if (!isFn(n)) return;
    let fn = null;
    each(n.body, (m) => { if (m.type === 'Literal' && typeof m.value === 'string') { const x = /\/functions\/v1\/([a-z0-9-]+)\?$/.exec(m.value); if (x) fn = x[1]; } });
    const w = fnName(n);
    if (fn && w && !ENTRIES.has(w)) BUILDERS.set(w, fn);
  });
}

/* ── partial evaluation: an expression → the strings it can be, HOLE where it cannot be known ── */
const MAX = 64;
const cross = (as, bs) => { const out = []; for (const a of as) for (const b of bs) { if (out.length >= MAX) return out; out.push(a + b); } return out; };
function strs(vals) { return vals.map((v) => (typeof v === 'string' ? v : HOLE)); }
function declIn(block, name) {
  const body = block.type === 'Program' || block.type === 'BlockStatement' ? block.body : [];
  for (const s of body) {
    if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier' && d.id.name === name) return d;
    if (s.type === 'FunctionDeclaration' && s.id && s.id.name === name) return s;
  }
  return null;
}
function resolve(node, name, env, depth) {
  if (env && Object.prototype.hasOwnProperty.call(env, name)) return env[name];
  for (let p = node.parent; p; p = p.parent) {
    const d = declIn(p, name);
    if (d) {
      if (d.type === 'FunctionDeclaration') return [{ fn: d }];
      if (d.init && isFn(d.init)) return [{ fn: d.init }];
      return d.init ? ev(d.init, null, depth + 1) : [HOLE];
    }
    if (isFn(p)) {
      const i = p.params.findIndex((q) => q.type === 'Identifier' && q.name === name);
      if (i < 0) continue;
      /* a callback's first parameter, over an array this file spells out */
      const c = p.parent;
      if (i === 0 && c && c.type === 'CallExpression' && c.arguments[0] === p && c.callee.type === 'MemberExpression'
          && /^(forEach|map|filter|some|every|flatMap)$/.test(calleeName(c.callee) || '')) {
        const arrs = ev(c.callee.object, null, depth + 1).filter((v) => v && v.arr);
        const items = [];
        for (const a of arrs) for (const el of a.arr.elements) if (el) items.push(...ev(el, null, depth + 1));
        if (items.length) return items.slice(0, MAX);
      }
      return [HOLE];
    }
  }
  return [HOLE];
}
function ev(n, env, depth) {
  depth = depth || 0;
  if (!n || depth > 12) return [HOLE];
  switch (n.type) {
    case 'Literal': return [n.value == null ? HOLE : String(n.value)];
    case 'TemplateLiteral': {
      let acc = [n.quasis[0].value.cooked];
      n.expressions.forEach((e, i) => { acc = cross(cross(acc, strs(ev(e, env, depth + 1))), [n.quasis[i + 1].value.cooked]); });
      return acc;
    }
    case 'BinaryExpression': return n.operator === '+' ? cross(strs(ev(n.left, env, depth + 1)), strs(ev(n.right, env, depth + 1))) : [HOLE];
    case 'LogicalExpression': return [...ev(n.left, env, depth + 1), ...ev(n.right, env, depth + 1)].slice(0, MAX);
    case 'ConditionalExpression': return [...ev(n.consequent, env, depth + 1), ...ev(n.alternate, env, depth + 1)].slice(0, MAX);
    case 'ArrayExpression': return [{ arr: n }];
    case 'Identifier': return resolve(n, n.name, env, depth);
    case 'MemberExpression': {
      if (n.computed && n.property.type === 'Literal' && typeof n.property.value === 'number') {
        const out = [];
        for (const v of ev(n.object, env, depth + 1)) {
          const el = v && v.arr && v.arr.elements[n.property.value];
          out.push(...(el ? ev(el, env, depth + 1) : [HOLE]));
        }
        return out.slice(0, MAX);
      }
      return [HOLE];
    }
    case 'CallExpression': {
      const name = calleeName(n.callee);
      if (name === 'encodeURIComponent' || name === 'String') {
        const inner = strs(ev(n.arguments[0], env, depth + 1));
        return name === 'String' ? inner : inner.map((s) => s.split(HOLE).map(encodeURIComponent).join(HOLE));
      }
      if (n.callee.type === 'Identifier') {
        const fns = resolve(n, n.callee.name, env, depth).map((v) => (v && v.fn) ? v.fn : null).filter(Boolean);
        const target = fns[0] || null;
        const f = target && isFn(target) ? target : null;
        if (f) {
          const bind = {};
          f.params.forEach((p, i) => { if (p.type === 'Identifier') bind[p.name] = n.arguments[i] ? ev(n.arguments[i], env, depth + 1) : [HOLE]; });
          if (f.body.type !== 'BlockStatement') return ev(f.body, bind, depth + 1);
          const out = [];
          each(f.body, (m) => { if (m.type === 'ReturnStatement' && m.argument) { let q = m.parent; while (q && !isFn(q)) q = q.parent; if (q === f) out.push(...ev(m.argument, bind, depth + 1)); } });
          return out.length ? out.slice(0, MAX) : [HOLE];
        }
      }
      return [HOLE];
    }
    default: return [HOLE];
  }
}
/* what a HOLE may stand for when asking a relay: a number, a word, a range token, nothing */
const FILLS = ['0', 'x', '1d', 'A', ''];
function fillsOf(s) {
  const k = s.split(HOLE).length - 1;
  if (!k) return [s];
  /* the uniform fills FIRST — a hole repeated in one URL is usually the same kind of value, and the
     list below is cut to a bounded number of requests per call site */
  const out = FILLS.map((f) => s.split(HOLE).join(f));
  const combos = Math.min(Math.pow(FILLS.length, k), MAX);
  for (let c = 0; c < combos; c++) {
    let i = 0, x = c;
    out.push(s.replace(/\u0000/g, () => { const f = FILLS[x % FILLS.length]; x = Math.floor(x / FILLS.length); i++; return f; }));
  }
  return [...new Set(out)];
}

/* the discovered calls: { site, raw (with holes), relay?: fn (builder calls), direct } */
const SITES = [];
for (const { f, ast } of FILES) {
  each(ast, (n) => {
    if (n.type !== 'CallExpression' || !n.arguments[0]) return;
    const name = calleeName(n.callee);
    const site = f + ':' + n.loc.start.line;
    if (name && ENTRIES.has(name)) {
      /* a call INSIDE an entry's own definition that forwards its parameter is the definition, not a caller */
      if (n.arguments[0].type === 'Identifier') {
        let q = n.parent; while (q && !(isFn(q) && q.params.some((p) => p.type === 'Identifier' && p.name === n.arguments[0].name))) q = q.parent;
        if (q && ENTRIES.has(fnName(q) || '')) return;
      }
      const direct = ENTRIES.get(name).direct || directOf(n);
      const o2 = n.arguments[1];
      const asProp = o2 && o2.type === 'ObjectExpression' && o2.properties.find((p) => p.key && (p.key.name === 'as' || p.key.value === 'as'));
      const as = asProp && asProp.value.type === 'Literal' ? asProp.value.value : null;
      for (const v of strs(ev(n.arguments[0]))) SITES.push({ site, via: name, raw: v, direct, as });
      return;
    }
    if (name && BUILDERS.has(name)) {
      for (const v of strs(ev(n.arguments[0]))) {
        const m = /(?:^|&)u=([^&]*)/.exec(v);
        if (m) SITES.push({ site, via: name, raw: decodeURIComponent(m[1].split(HOLE).join(HOLE)), relay: BUILDERS.get(name), direct: false });
      }
    }
  });
}

/* route every discovered URL; group the ones that land on a relay by relay */
const RESOLVED = SITES.filter((s) => /^https?:\/\//.test(s.raw));
const PLAN = new Map();      /* fn → [{ site, raw, candidates: [upstream URL…] }] */
const UNROUTED = [];
for (const s of RESOLVED) {
  const cands = [];
  let fn = s.relay || null;
  for (const u of fillsOf(s.raw)) {
    if (s.relay) { cands.push(u); continue; }
    const r = routeOf(u);
    if (r) { fn = fn || r.fn; if (r.fn === fn) cands.push(r.u); }
  }
  if (!fn) { if (!s.direct) UNROUTED.push(s); continue; }
  if (!PLAN.has(fn)) PLAN.set(fn, []);
  PLAN.get(fn).push({ site: s.site, via: s.via, raw: s.raw.split(HOLE).join('…'), concrete: !s.raw.includes(HOLE), candidates: cands.slice(0, 24) });
}

/* ══ ① the relay forwards what its client sends ══════════════════════════════════════════════ */
test('own-fetch-relay ① discovery sees the page\'s calls into its relays (it is not vacuously green)', () => {
  assert.ok(ENTRIES.size >= 6, 'entry points found: ' + [...ENTRIES.keys()].join(', '));
  /* which functions take a caller's URL in `?u=` is read from the functions directory (the one
     place this file reads source as text — it decides what must be COVERED, not what is allowed):
     each of them must have at least one caller found here, or the check below says nothing about it. */
  const takesU = readdirSync(join(ROOT, 'supabase/functions')).filter((d) => existsSync(join(ROOT, 'supabase/functions', d, 'index.ts'))
    && /searchParams\.get\("u"\)|\bq\.get\("u"\)/.test(readFileSync(join(ROOT, 'supabase/functions', d, 'index.ts'), 'utf8')));
  assert.ok(takesU.length >= 6, 'relays that take ?u=: ' + takesU.join(', '));
  const reached = [...PLAN.keys()];
  const blind = takesU.filter((fn) => !reached.includes(fn));
  assert.deepEqual(blind, [], 'no caller of these relays was discovered — the check below would be vacuous for them');
});

test('own-fetch-relay ① every URL the page sends a relay of ours is one that relay forwards (#R803, evaluated)', () => {
  const problems = [];
  for (const [fn, sites] of PLAN) {
    const reqs = [];
    for (const s of sites) for (const u of s.candidates) reqs.push('?u=' + encodeURIComponent(u));
    const uniq = [...new Set(reqs)];
    const out = runEdge(fn, uniq, {});
    const forwarded = new Map();
    for (const o of out) {
      const u = new URL('http://x/' + o.q).searchParams.get('u');
      const host = new URL(u).hostname;
      forwarded.set(u, o.calls.some((c) => { try { return new URL(c.replace(/^GET /, '')).hostname === host; } catch (_) { return false; } }));
    }
    for (const s of sites) {
      const ok = s.candidates.filter((u) => forwarded.get(u));
      /* a URL the source spells out completely must be forwarded as written; one with unknown parts
         must be forwardable for SOME value of them (the literal skeleton is what can drift) */
      const pass = s.concrete ? (s.candidates.length > 0 && ok.length === s.candidates.length) : ok.length > 0;
      if (!pass) problems.push(`${fn} refuses what ${s.site} (${s.via}) sends: ${s.raw}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* ══ ② fetch-relay: one list, every caller covered, every entry has a caller ═════════════════ */
test('own-fetch-relay ② a caller with no direct rung names only upstreams some relay of ours admits', () => {
  assert.deepEqual(UNROUTED.map((s) => `${s.site} (${s.via}): ${s.raw.split(HOLE).join('…')}`), [],
    'these callers rely on a relay (no `direct: true`) for an upstream no relay admits — add a rule to '
    + 'supabase/functions/_shared/fetch-relay-policy.js, after measuring that the host sends no ACAO');
});

test('own-fetch-relay ② every host fetch-relay admits is named by a caller the discovery found', () => {
  const seen = new Set();
  for (const s of (PLAN.get(policy.FETCH_RELAY_FUNCTION) || [])) for (const u of s.candidates) seen.add(new URL(u).hostname);
  const idle = [];
  for (const r of policy.FETCH_RELAY_RULES) for (const h of r.hosts) if (!seen.has(h)) idle.push(r.id + ': ' + h);
  assert.deepEqual(idle, [], 'a rule with no caller is an open door nobody asked for');
});

test('own-fetch-relay ② the page and fetch-relay answer the same question from the same list', () => {
  /* the page's router is asked about every candidate the policy admits and every one it refuses */
  const admitted = [...(PLAN.get(policy.FETCH_RELAY_FUNCTION) || [])].flatMap((s) => s.candidates);
  assert.ok(admitted.length >= 4, 'fetch-relay callers found: ' + admitted.length);
  for (const u of admitted) assert.equal((routeOf(u) || {}).fn, policy.FETCH_RELAY_FUNCTION, u);
  const base = admitted.find((u) => u.startsWith('https://www.imf.org/'));
  assert.ok(base, 'the IMF series is among them');
  const refused = [
    base.replace('https:', 'http:'),                                  /* scheme */
    base.replace('www.imf.org', 'www.imf.org:8443'),                  /* port */
    base.replace('https://', 'https://user:pw@'),                     /* userinfo */
    base.replace('www.imf.org', 'imf.org.evil.example'),              /* another host */
    base + '?x=1',                                                    /* a query key nobody sends */
    base + '?constructor=1',                                          /* …that is also Object's */
    base + '#frag',
    base.replace('/api/v1/', '/api/v2/'),                             /* another path */
    'https://127.0.0.1/external/datamapper/api/v1/NGDPD',
    'https://[::1]/external/datamapper/api/v1/NGDPD',
    'https://www.drivenc.gov/map/mapIcons/Cameras',                   /* a redirect target is not a first request */
  ];
  for (const u of refused) {
    assert.equal(policy.fetchRelayRule(u), null, 'the policy refuses ' + u);
    assert.notEqual((routeOf(u) || {}).fn, policy.FETCH_RELAY_FUNCTION, 'the page does not offer it: ' + u);
  }
  const out = runEdge('fetch-relay', refused.map((u) => '?u=' + encodeURIComponent(u)), {});
  for (const o of out) {
    assert.equal(o.status, 400, 'fetch-relay refuses ' + o.q + ' → ' + o.body);
    assert.equal(o.calls.length, 0, 'and asks nobody: ' + o.calls.join(', '));
  }
});

test('own-fetch-relay ② fetch-relay follows a redirect only onto the same rule, and never relays a wrong answer', () => {
  const cam = 'https://drivenc.gov/map/mapIcons/Cameras';
  const imf = 'https://www.imf.org/external/datamapper/api/v1/NGDPD';
  const out = runEdge('fetch-relay', [
    '?u=' + encodeURIComponent(cam),
    '?u=' + encodeURIComponent(imf),
  ], {
    routes: [
      ['^https://drivenc\\.gov/', { status: 302, location: 'https://www.drivenc.gov:443/map/mapIcons/Cameras', body: '' }],
      ['^https://www\\.drivenc\\.gov/', { status: 200, body: '{"item2":[]}', type: 'application/json; charset=utf-8' }],
      ['^https://www\\.imf\\.org/', { status: 200, body: '<html>maintenance</html>', type: 'text/html' }],
    ],
  });
  assert.equal(out[0].status, 200, 'the measured 302 to the www. name is followed: ' + out[0].body);
  assert.equal(out[0].body, '{"item2":[]}');
  assert.equal(out[1].status, 502, 'an HTML page is not the JSON the rule promises');
  assert.doesNotMatch(out[1].body, /maintenance/, 'and its body is never relayed');

  const off = runEdge('fetch-relay', ['?u=' + encodeURIComponent(cam), '?u=' + encodeURIComponent(imf)], {
    routes: [
      ['^https://drivenc\\.gov/', { status: 302, location: 'https://evil.example/map/mapIcons/Cameras', body: '' }],
      ['^https://www\\.imf\\.org/', { status: 500, body: '{"secret":"upstream says"}', type: 'application/json' }],
    ],
  });
  assert.equal(off[0].status, 502, 'a redirect off the rule is refused');
  assert.ok(!off[0].calls.some((c) => /evil\.example/.test(c)), 'and the other host is never asked');
  assert.equal(off[1].status, 502);
  assert.doesNotMatch(off[1].body, /secret/, 'a non-2xx upstream body is not relayed');
  /* (relay-no-data-one-pass) a 404 is the upstream saying «not there» — an answer the page must be able
     to tell from a failure (relay-guard.js noData) — and its body is not relayed either */
  const gone = runEdge('fetch-relay', ['?u=' + encodeURIComponent(imf)], {
    routes: [['^https://www\\.imf\\.org/', { status: 404, body: '{"secret":"upstream says"}', type: 'application/json' }]],
  });
  assert.equal(gone[0].status, 200);
  assert.doesNotMatch(gone[0].body, /secret/, 'a non-2xx upstream body is not relayed');
  assert.match(gone[0].body, /"noData":true/);
});

test('own-fetch-relay ② nothing in js/ hands a whole URL to somebody else\'s relay', () => {
  /* The shape of every public-relay rung this app ever had, whichever file it was copied into:
       ⑴ a function of ONE parameter whose result is `https://<host>/…?<key>=` followed by that
          parameter, whole (`x => 'https://corsproxy.io/?url=' + encodeURIComponent(x)`);
       ⑵ the same prefix applied inline to an expression that is itself a URL
          (`'https://corsproxy.io/?url=' + encodeURIComponent(url)`).
     A URL handed whole to another host's query string IS a relay request, whatever the host is
     called — so this names no host. Ours are the ones under /functions/v1/. The same shape, run over the
     tree before own-fetch-relay, found 31 rungs of kind ⑴ in 12 files. */
  const found = [];
  const flat = (e) => {
    const parts = [];
    if (e.type === 'TemplateLiteral') e.quasis.forEach((q, i) => { if (q.value.cooked) parts.push({ lit: q.value.cooked }); if (e.expressions[i]) parts.push({ ex: e.expressions[i] }); });
    else (function go(x) { if (x.type === 'BinaryExpression' && x.operator === '+') { go(x.left); go(x.right); } else if (x.type === 'Literal' && typeof x.value === 'string') { if (x.value) parts.push({ lit: x.value }); } else parts.push({ ex: x }); })(e);
    return parts;
  };
  const whole = (p, isArg) => p && p.ex && (isArg(p.ex) || (p.ex.type === 'CallExpression' && calleeName(p.ex.callee) === 'encodeURIComponent' && p.ex.arguments[0] && isArg(p.ex.arguments[0])));
  const prefixOf = (parts) => {
    const last = parts[parts.length - 1], prev = parts[parts.length - 2];
    if (!prev || !prev.lit || !/[?&=]$/.test(prev.lit)) return null;
    const head = parts[0].lit || '';
    if (!/^https?:\/\//.test(head) || /\/functions\/v1\//.test(head)) return null;
    return { head, last };
  };
  for (const { f, ast } of FILES) {
    each(ast, (n) => {
      if (isFn(n) && n.params.length === 1 && n.params[0].type === 'Identifier') {
        let e = n.body;
        if (e.type === 'BlockStatement') e = (e.body.length === 1 && e.body[0].type === 'ReturnStatement') ? e.body[0].argument : null;
        if (!e || !(e.type === 'TemplateLiteral' || (e.type === 'BinaryExpression' && e.operator === '+'))) return;
        const pr = prefixOf(flat(e));
        const P = n.params[0].name;
        if (pr && whole(pr.last, (x) => x.type === 'Identifier' && x.name === P)) found.push(`${f}:${n.loc.start.line} ⑴ ${pr.head.split('/').slice(0, 3).join('/')}`);
        return;
      }
      if (n.type === 'BinaryExpression' && n.operator === '+' && !(n.parent && n.parent.type === 'BinaryExpression' && n.parent.operator === '+')) {
        const parts = flat(n);
        const pr = prefixOf(parts);
        if (!pr || !pr.last.ex) return;
        const isUrl = (x) => strs(ev(x)).some((s) => /^https?:\/\//.test(s));
        if (whole(pr.last, isUrl)) found.push(`${f}:${n.loc.start.line} ⑵ ${pr.head.split('/').slice(0, 3).join('/')}`);
      }
    });
  }
  assert.deepEqual(found, [], 'a whole URL handed to another host\'s query string is a request through a relay that is not ours');
});

/* ══ ③ every public function takes a token before it reaches an upstream ═════════════════════ */
test('own-fetch-relay ③ with the shared bucket refusing, no verify_jwt=false function reaches an upstream', () => {
  const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8').split(/\r?\n/);
  const open = [];
  toml.forEach((l, i) => {
    const m = /^\[functions\.([a-z0-9-]+)\]\s*$/.exec(l);
    if (!m) return;
    let j = i + 1; while (j < toml.length && (/^\s*$/.test(toml[j]) || /^\s*#/.test(toml[j]))) j++;
    if (/^\s*verify_jwt\s*=\s*false\b/.test(toml[j] || '')) open.push(m[1]);
  });
  assert.ok(open.length >= 15, 'the public functions: ' + open.join(', '));
  const env = { SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  const problems = [];
  const took = [];
  for (const fn of open) {
    const [o] = runEdge(fn, [''], { env, rpc: [{ allowed: false, remaining: 0 }] });
    const upstream = o.calls.filter((c) => !c.startsWith('RPC '));
    const asked = o.calls.some((c) => c.startsWith('RPC '));
    if (upstream.length) problems.push(`${fn}: reached ${upstream[0]} with the bucket empty (status ${o.status})`);
    if (asked) { took.push(fn); if (o.status !== 429) problems.push(`${fn}: took from the bucket, was refused, and answered ${o.status}`); }
    else if (o.status < 400) problems.push(`${fn}: answered ${o.status} without asking the bucket`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(took.length >= 10, 'functions that took a token on a bare GET: ' + took.join(', '));
  /* …and a request each relay WOULD forward (one its own client sends) is refused by the bucket
     before the upstream is asked — not merely a bare GET it would have refused anyway */
  for (const [fn, sites] of PLAN) {
    const u = sites.flatMap((x) => x.candidates)[0];
    const [o] = runEdge(fn, ['?u=' + encodeURIComponent(u)], { env, rpc: [{ allowed: false, remaining: 0 }] });
    assert.equal(o.status, 429, fn + ' answers 429 for ' + u + ' when the bucket is empty: ' + o.body);
    assert.deepEqual(o.calls.filter((c) => !c.startsWith('RPC ')), [], fn + ' asked nobody else');
  }
});

test('own-fetch-relay ③ the bucket is the shared one, per address, and a database outage does not take the layers down', async () => {
  const { callerGate, callerCapacity, READERS_PER_ADDRESS } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/rate-limit.js')).href);
  const env = (k) => ({ SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] || '';
  const realFetch = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (u, init) => { seen.push({ u: String(u), body: JSON.parse(init.body) }); return new Response('[{"allowed":true,"remaining":5}]', { status: 200 }); };
    const req = new Request('http://relay.test/', { headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' } });
    assert.equal(await callerGate(req, {}, { scope: 'fetch-relay', readerPerMin: 60, env }), null);
    assert.equal(seen[0].body.p_scope, 'fetch-relay:ip');
    assert.equal(seen[0].body.p_key, '198.51.100.9', 'keyed by the caller\'s own address');
    assert.equal(seen[0].body.p_capacity, 60 * READERS_PER_ADDRESS);
    assert.equal(callerCapacity('alerts-relay', 240, (k) => (k === 'ALERTS_RELAY_PER_IP_PER_MIN' ? '9000' : '')), 9000, 'the environment may move one relay');
    assert.equal(callerCapacity('alerts-relay', 240, () => 'nonsense'), 240 * READERS_PER_ADDRESS);
    globalThis.fetch = async () => new Response('{"message":"db down"}', { status: 503 });
    assert.equal(await callerGate(req, {}, { scope: 'fetch-relay', readerPerMin: 60, env }), null, 'a limiter that cannot answer does not stop the layer');
    globalThis.fetch = async () => new Response('[{"allowed":false,"remaining":0}]', { status: 200 });
    const r = await callerGate(req, { 'Access-Control-Allow-Origin': '*' }, { scope: 'fetch-relay', readerPerMin: 60, env });
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('access-control-allow-origin'), '*', 'the refusal is readable by the page');
    assert.ok(+r.headers.get('retry-after') >= 1);
  } finally { globalThis.fetch = realFetch; }
});

/* ══ ④ the article rule: the reader keeps its second strategy without a stranger, and without an
   open proxy. THE DEFECT it answers: removing the public relays left a publisher that sends no ACAO
   (aljazeera, bbc, guardian, lemonde — measured) readable only embedded — a capability lost. ══ */
const PAGE = '<!doctype html><html><head><meta property="og:description" content="d"></head><body><article>'
  + '<p>' + 'An article paragraph long enough to be prose. '.repeat(3) + '</p><p>' + 'Second paragraph. '.repeat(3) + '</p>'
  + '</article><!-- ' + 'x'.repeat(5000) + ' --></body></html>';
const ART = 'https://www.bbc.com/news/articles/c0000000';

test('own-fetch-relay ④ the page offers the article rule only to a caller that parses an article, and only for a public name', () => {
  const html = SITES.filter((s) => s.as === 'html');
  assert.ok(html.some((s) => /article-reader\.js/.test(s.site)), 'the article reader is the caller the rule exists for');
  const r = proxyFetch.ownRelayUrl(ART, 'html');
  assert.equal(r, SUPA + '/functions/v1/fetch-relay?as=article&u=' + encodeURIComponent(ART));
  assert.equal(proxyFetch.ownRelayUrl(ART), '', 'a caller that did not ask for an article page is not offered it');
  assert.equal(proxyFetch.ownRelayUrl(ART, 'json'), '');
  for (const u of ['http://www.bbc.com/news/x', 'https://www.bbc.com:8443/x', 'https://u:p@www.bbc.com/x',
                   'https://127.0.0.1/x', 'https://[::1]/x', 'https://intranet/x', 'https://nas.local/x'])
    assert.equal(proxyFetch.ownRelayUrl(u, 'html'), '', 'not offered: ' + u);
  /* a URL a listed relay admits keeps its listed relay, even asked for as html */
  assert.match(proxyFetch.ownRelayUrl('https://www.imf.org/external/datamapper/api/v1/NGDPD', 'html'), /fetch-relay\?u=/);
});

test('own-fetch-relay ④ fetch-relay\'s article rule checks the ADDRESS, the type and the page, and every hop again', () => {
  const q = (u) => '?as=article&u=' + encodeURIComponent(u);
  const pub = { 'www.bbc.com': ['151.101.0.81'], 'evil.example': ['10.0.0.5'], 'mapped.example': ['::ffff:127.0.0.1'], 'www.dw.com': ['2a02:26f0::1'] };
  const out = runEdge('fetch-relay', [
    q(ART),                                         /* 0 a public page */
    q('https://evil.example/news'),                 /* 1 a public-looking name that resolves inside */
    q('https://mapped.example/news'),               /* 2 …or to a mapped loopback */
    q('https://www.dw.com/en/redir'),               /* 3 a redirect to a name that resolves inside */
    q('https://www.dw.com/en/json'),                /* 4 not HTML */
    q('https://www.dw.com/en/stub'),                /* 5 HTML that is not an article */
    q('http://www.bbc.com/news/x'),                 /* 6 scheme */
    '?u=' + encodeURIComponent(ART),                /* 7 not asked for as an article: no listed rule */
  ], {
    dns: pub,
    routes: [
      ['^https://www\.bbc\.com/', { body: PAGE, type: 'text/html; charset=utf-8' }],
      ['^https://www\.dw\.com/en/redir', { status: 302, location: 'https://evil.example/news', body: '' }],
      ['^https://www\.dw\.com/en/json', { body: '{"a":1}', type: 'application/json' }],
      ['^https://www\.dw\.com/en/stub', { body: '<!doctype html><html><body><div>' + 'z'.repeat(9000) + '</div></body></html>', type: 'text/html' }],
    ],
  });
  assert.equal(out[0].status, 200, out[0].body);
  for (const i of [1, 2]) {
    assert.equal(out[i].status, 400, 'refused by address: ' + out[i].q);
    assert.deepEqual(out[i].calls, [], 'and nothing was fetched');
  }
  assert.equal(out[3].status, 502, 'a hop to a name that resolves inside is refused');
  assert.ok(!out[3].calls.some((c) => /evil\.example/.test(c)), 'and that host is never asked');
  assert.equal(out[4].status, 502, 'not text/html');
  assert.equal(out[5].status, 502, 'HTML with nothing an article has');
  assert.match(out[5].body, /not_an_article/);
  assert.equal(out[6].status, 400);
  assert.equal(out[7].status, 400, 'without as=article the listed rules decide, and none lists a news site');

  /* ⚠ FAIL-CLOSED: a runtime with no resolver refuses the article rule rather than trusting the name */
  const [noDns] = runEdge('fetch-relay', [q(ART)], { routes: [['^https://www\.bbc\.com/', { body: PAGE, type: 'text/html' }]] });
  assert.equal(noDns.status, 400, 'no resolver, no article: ' + noDns.body);
  assert.deepEqual(noDns.calls, []);

  /* …and it takes from its own bucket before anything else (③'s rule, for the rule with no host list) */
  const [full] = runEdge('fetch-relay', [q(ART)], { dns: pub, env: { SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'svc' }, rpc: [{ allowed: false, remaining: 0 }] });
  assert.equal(full.status, 429, full.body);
  assert.deepEqual(full.calls.filter((c) => !c.startsWith('RPC ')), [], 'nobody else was asked');
});

test('own-fetch-relay ④ publicAddress refuses every special-purpose range', async () => {
  const { publicAddress } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href);
  for (const a of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
                   '192.168.1.1', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
                   '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1', '::ffff:a00:1', '64:ff9b::a00:1', '', 'x'])
    assert.equal(publicAddress(a), false, a);
  for (const a of ['8.8.8.8', '151.101.0.81', '172.32.0.1', '2a02:26f0::1', '2001:4860:4860::8888', '::ffff:8.8.8.8'])
    assert.equal(publicAddress(a), true, a);
});

/* ══ ⑤ the outside monitor watches the relays the page actually uses. THE DEFECT: the probe asked
   the public ladder a question our relays do not answer, discovered no rung, called that `dead`, and
   would have opened its issue every six hours (own-fetch-relay). ══ */
test('own-fetch-relay ⑤ scripts/probe-relay-ladder.mjs has a routed target for every relay the page routes to', () => {
  const raw = execFileSync(process.execPath, ['scripts/probe-relay-ladder.mjs', '--list', '--supabase-url', SUPA],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  const targets = JSON.parse(raw);
  const unrouted = targets.filter((t) => !t.relay).map((t) => t.url);
  assert.deepEqual(unrouted, [], 'a probe target no relay of ours takes measures nothing of ours');
  const probed = new Set(targets.map((t) => t.relay));
  /* the relays js/proxy-fetch.js routes to (a relay a module builds for itself, like alerts-relay in
     js/world-packs.js, is not on the router and is not what this monitor replaced) */
  const routedByTheRouter = [...PLAN].filter(([, sites]) => sites.some((x) => ENTRIES.has(x.via))).map(([fn]) => fn);
  assert.ok(routedByTheRouter.length >= 5, routedByTheRouter.join(', '));
  const missing = routedByTheRouter.filter((fn) => !probed.has(fn));
  assert.deepEqual(missing, [], 'relays the page routes to that the monitor never asks');
  /* every fetch-relay rule is probed with a URL that rule itself admits (not merely some rule) */
  for (const r of policy.FETCH_RELAY_RULES) assert.equal(policy.fetchRelayRule(r.probe), r, r.id + ' probes a URL its own rule admits');
  assert.ok(targets.some((t) => t.as === 'html' && t.relay === policy.FETCH_RELAY_FUNCTION), 'and the article rule is probed as an article');
  assert.ok(policy.articleUrlAllowed(policy.ARTICLE_RULE.probe));
});

test('own-fetch-relay publicHostname refuses what can only be this network', async () => {
  const { publicHostname } = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href);
  for (const h of ['localhost', 'a.localhost', '127.0.0.1', '10.0.0.1', '0x7f000001', '2130706433', '[::1]', '::1', 'intranet', 'printer.local', 'db.internal', 'nas.home.arpa', ''])
    assert.equal(publicHostname(h), false, h);
  for (const h of ['www.imf.org', 'fl511.com', '511.idaho.gov', 'celestrak.org'])
    assert.equal(publicHostname(h), true, h);
});
