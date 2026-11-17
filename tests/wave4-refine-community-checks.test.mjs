/* ============================================================================
 *  wave4-refine — Community maps and class sets, held to what review found wrong
 * ----------------------------------------------------------------------------
 *  The database half is supabase/tests/47_wave4_refine_test.sql (pgTAP) and supabase/tests/38 (the directory's
 *  keyset pages). This file is the offline half:
 *    ① EVERY CLIENT RPC CALL NAMES ARGUMENTS ITS FUNCTION HAS. The administrator's moderation sent `p_token` to
 *      moderate_community_map(p_ref, …) and failed on every call while every gate was green. The rule is put on the
 *      FACT, for every call: each `.rpc(name, {…})` found in js/ and in the pages' inline scripts, against the latest
 *      definition of `name` in supabase/migrations/ (create … function, drop function; overloads by arity) — the keys
 *      sent are parameters of one overload, and every parameter without a default is sent. Nothing here lists a call
 *      or a function; a call whose name or arguments cannot be read is a failure, not a skip.
 *    ② a row whose run calls a door that hands back words somebody else wrote declares ingests:'external' — the
 *      check:capabilities rule (scripts/atlas-capability-audit.mjs wordsByOthers / ingests-declared), shown to pass on
 *      the repository and to FAIL on a fixture with the defect;
 *    ③ a student's name: one rule in the page and the database (NFKC, and the same refused code points), evaluated;
 *    ④ class_set_submit stores what it rebuilt — three decimals, integer years — after bounding the size;
 *    ⑤ the directory pages by keyset: no offset anywhere, a `next` cursor, each order still exactly its index;
 *    ⑥ the doors, evaluated with a stand-in database: the cursor travels, the holds are asked for this account, the
 *      owner's own card offers no report and the owner's refusal has its own words.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { parseSource } from './helpers/ast.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIG_DIR = 'supabase/migrations';
const REFINE = MIG_DIR + '/20261116140000_wave4_refine_community_class.sql';

/* ══ the SQL side: every function's parameters as the migrations leave them ═══════════════════════════ */
function splitTop(s) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function balanced(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')' && --depth === 0) return s.slice(open + 1, i);
  }
  return null;
}
/* one parameter → { mode, name, hasDefault }; IN-only parameters are what a caller sends */
function param(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const hasDefault = /\s(default)\s|\s=\s|=/i.test(' ' + t + ' ');
  const words = t.split(' ');
  let mode = 'in';
  if (/^(in|out|inout|variadic)$/i.test(words[0])) mode = words.shift().toLowerCase();
  return { mode, name: words.length >= 2 ? words[0].replace(/"/g, '') : null, hasDefault };
}
export function sqlFunctions(root = ROOT) {
  const files = readdirSync(join(root, MIG_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const fns = new Map();   /* name → Map(arity → { params, file }) */
  for (const f of files) {
    const sql = codeOnly(readFileSync(join(root, MIG_DIR, f), 'utf8'), { lang: 'sql' });
    const re = /\b(create(?:\s+or\s+replace)?\s+function|drop\s+function(?:\s+if\s+exists)?)\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const name = m[2].toLowerCase();
      const inner = balanced(sql, m.index + m[0].length - 1);
      if (inner == null) continue;
      const ps = splitTop(inner).map(param);
      const ins = ps.filter((p) => p.mode === 'in' || p.mode === 'inout' || p.mode === 'variadic');
      if (!fns.has(name)) fns.set(name, new Map());
      if (/^drop/i.test(m[1])) fns.get(name).delete(ins.length);
      else fns.get(name).set(ins.length, { params: ins, file: f });
    }
  }
  return fns;
}

/* ══ the client side: every `.rpc(name, args)` and what it sends ═════════════════════════════════════ */
function walk(node, fn, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  const next = parents.concat([node]);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, fn, next)); else if (v && typeof v.type === 'string') walk(v, fn, next);
  }
}
const isFn = (n) => /Function/.test(n.type);
const keyOf = (p) => (p.type === 'Property' && !p.computed && p.key ? (p.key.name || p.key.value) : null);
/* what an argument expression says about the keys sent: a literal object, or a local bound to one plus `x.k = …` */
function keysOf(expr, parents) {
  if (!expr) return { keys: [] };
  if (expr.type === 'ObjectExpression') {
    if (expr.properties.some((p) => p.type !== 'Property' || keyOf(p) == null)) return { unresolved: 'a spread or computed key' };
    return { keys: expr.properties.map(keyOf) };
  }
  if (expr.type === 'Identifier') {
    for (let i = parents.length - 1; i >= 0; i--) {
      const scope = parents[i];
      if (!isFn(scope) && scope.type !== 'Program') continue;
      let decl = null; const extra = [];
      walk(scope, (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === expr.name && n.init && n.init.type === 'ObjectExpression') decl = n.init;
        if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
            && n.left.object.type === 'Identifier' && n.left.object.name === expr.name) extra.push(n.left.property.name);
      });
      if (decl) { const k = keysOf(decl, []); return k.unresolved ? k : { keys: k.keys.concat(extra) }; }
    }
  }
  return { unresolved: 'the arguments are not an object this file spells out' };
}
function rpcCallsIn(src, rel, offsetLine = 0) {
  const out = [];
  const ast = parseSource(src);
  walk(ast, (n, parents) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || n.callee.property.name !== 'rpc') return;
    const at = rel + ':' + (n.loc.start.line + offsetLine);
    const [nameArg, argsArg] = n.arguments;
    if (nameArg && nameArg.type === 'Literal' && typeof nameArg.value === 'string') { out.push(Object.assign({ at, name: nameArg.value }, keysOf(argsArg, parents))); return; }
    /* a wrapper: the name (and the arguments) are parameters of the function around the call — read every call of it */
    const fnNode = parents.slice().reverse().find(isFn);
    const pi = fnNode && nameArg && nameArg.type === 'Identifier' ? fnNode.params.findIndex((p) => p.type === 'Identifier' && p.name === nameArg.name) : -1;
    const fnName = fnNode && (fnNode.id ? fnNode.id.name : null);
    if (pi < 0 || !fnName) { out.push({ at, name: null, unresolved: 'the function name is not a string this file spells out' }); return; }
    const ai = argsArg && argsArg.type === 'Identifier' ? fnNode.params.findIndex((p) => p.type === 'Identifier' && p.name === argsArg.name) : -2;
    let sites = 0;
    walk(ast, (c, ps) => {
      if (c.type !== 'CallExpression' || c.callee.type !== 'Identifier' || c.callee.name !== fnName) return;
      sites++;
      const nm = c.arguments[pi];
      const site = rel + ':' + (c.loc.start.line + offsetLine) + ' (through ' + fnName + '(), ' + at + ')';
      if (!nm || nm.type !== 'Literal' || typeof nm.value !== 'string') { out.push({ at: site, name: null, unresolved: 'the function name is not a string this file spells out' }); return; }
      out.push(Object.assign({ at: site, name: nm.value }, ai >= 0 ? keysOf(c.arguments[ai], ps) : ai === -1 ? { keys: [] } : keysOf(argsArg, parents)));
    });
    if (!sites) out.push({ at, name: null, unresolved: fnName + '() calls rpc with a name it is given, and nothing in this file calls it' });
  });
  return out;
}
function jsFiles(dir) {
  const out = [];
  for (const f of readdirSync(join(ROOT, dir))) {
    const rel = dir + '/' + f;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...jsFiles(rel));
    else if (f.endsWith('.js') || f.endsWith('.mjs')) out.push(rel);
  }
  return out;
}
export function clientRpcCalls() {
  const calls = [];
  for (const rel of jsFiles('js')) {
    const src = read(rel);
    if (!/\.rpc\s*\(/.test(src)) continue;
    calls.push(...rpcCallsIn(src, rel));
  }
  /* the pages' own inline scripts (admin.html calls the database directly) */
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
    const html = read(f);
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (!/\.rpc\s*\(/.test(m[1])) continue;
      const line = html.slice(0, m.index + m[0].indexOf(m[1])).split('\n').length - 1;
      calls.push(...rpcCallsIn(m[1], f, line));
    }
  }
  return calls;
}
/* the verdict for one call against the functions: '' when it fits an overload, else why not */
export function rpcMismatch(call, fns) {
  if (call.unresolved) return call.unresolved;
  const defs = fns.get(String(call.name).toLowerCase());
  if (!defs || !defs.size) return 'no migration defines public.' + call.name + '() (or the last one dropped it)';
  const sent = new Set(call.keys);
  const why = [];
  for (const [, d] of defs) {
    const names = new Set(d.params.map((p) => p.name));
    const unknown = [...sent].filter((k) => !names.has(k));
    const missing = d.params.filter((p) => !p.hasDefault && !sent.has(p.name)).map((p) => p.name);
    if (!unknown.length && !missing.length) return '';
    why.push('(' + d.params.map((p) => p.name + (p.hasDefault ? '?' : '')).join(', ') + ' — ' + d.file + ')'
      + (unknown.length ? ' has no ' + unknown.join(', ') : '') + (missing.length ? ' needs ' + missing.join(', ') : ''));
  }
  return 'sends {' + [...sent].join(', ') + '} but ' + why.join('; ');
}

test('wave4-refine ① every client rpc call sends the arguments its function has (all of js/ and the pages, against the migrations)', () => {
  const fns = sqlFunctions();
  const calls = clientRpcCalls();
  assert.ok(calls.length >= 25, 'the reader found the calls (not vacuous): ' + calls.length);
  assert.ok(calls.some((c) => c.name === 'moderate_community_map'), 'the call that was wrong is among them');
  const bad = calls.map((c) => [c, rpcMismatch(c, fns)]).filter(([, w]) => w).map(([c, w]) => c.at + ' ' + (c.name || '?') + '(): ' + w);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('wave4-refine ① the rpc reader fails the defect it was written for, and reads the migrations\' last word', () => {
  const fns = sqlFunctions();
  /* the defect, as it shipped */
  assert.match(rpcMismatch({ name: 'moderate_community_map', keys: ['p_token', 'p_action', 'p_reason'] }, fns), /has no p_token/);
  assert.equal(rpcMismatch({ name: 'moderate_community_map', keys: ['p_ref', 'p_action', 'p_reason'] }, fns), '');
  assert.match(rpcMismatch({ name: 'moderate_community_map', keys: ['p_reason'] }, fns), /needs p_ref, p_action/, 'a parameter without a default must be sent');
  /* a later migration's drop + create is the definition (the directory's offset is gone) */
  assert.match(rpcMismatch({ name: 'community_maps', keys: ['p_sort', 'p_offset'] }, fns), /has no p_offset/);
  assert.equal(rpcMismatch({ name: 'community_maps', keys: ['p_sort', 'p_after'] }, fns), '');
  assert.match(rpcMismatch({ name: 'no_such_function', keys: [] }, fns), /no migration defines/);
  /* a call written through a local and `x.k = …` is read, and a wrapper is read at its call sites */
  const local = rpcCallsIn("async function f(DB){ const args = { p_a: 1 }; args.p_b = 2; return DB.rpc('fx', args); }", 'fixture.js');
  assert.deepEqual(local[0].keys.sort(), ['p_a', 'p_b']);
  const wrapped = rpcCallsIn("async function w(fn, args){ return sb.rpc(fn, args); } w('fy', { p_c: 1 }); w('fz', {});", 'fixture.js');
  assert.deepEqual(wrapped.map((c) => c.name + ':' + c.keys.join('|')), ['fy:p_c', 'fz:']);
  assert.ok(rpcCallsIn("DB.rpc(name, { ...o })", 'fixture.js')[0].unresolved, 'a call that cannot be read is reported, never skipped');
});

/* ══ ② ingests ════════════════════════════════════════════════════════════════════════════════════ */
test('wave4-refine ② a row whose run calls a door that hands back somebody else\'s words declares ingests:\'external\'', async () => {
  const A = await import('../scripts/atlas-capability-audit.mjs');
  const found = A.wordsByOthers();
  const rows = [...new Set(found.calls.map((c) => c.id))].sort();
  for (const id of ['community.browse', 'community.open', 'community.list', 'learn.class']) assert.ok(rows.includes(id), id + ' calls a declared door (found from the code, not listed): ' + rows.join(', '));
  assert.deepEqual(found.stale, [], 'every declared door is an exported function');
  const { checks } = await A.audit();
  const c = checks.find((x) => x.id === 'ingests-declared');
  assert.ok(c, 'check:capabilities runs the rule');
  assert.deepEqual(c.failures, []);
  /* and it goes red on the defect: a row that does not declare it, a declaration that names nothing */
  const bad = await A.audit({ othersWords: { calls: [{ id: 'community.mine', file: 'js/atlas-cap-community.js', line: 1, module: 'js/x.js', door: 'f', whose: 'w' }], stale: ['js/x.js: gone'] } });
  const r = bad.checks.find((x) => x.id === 'ingests-declared');
  assert.equal(r.failures.length, 2, r.failures.join('\n'));
  assert.match(r.failures[0], /community\.mine: .*must declare ingests:'external'/);
});

/* ══ ③ a student's name ════════════════════════════════════════════════════════════════════════════ */
const codePoints = (cls) => {
  const set = new Set();
  for (const m of cls.matchAll(/\\u([0-9A-Fa-f]{4})(?:-\\u([0-9A-Fa-f]{4}))?/g)) {
    const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a;
    for (let x = a; x <= b; x++) set.add(x);
  }
  return set;
};
test('wave4-refine ③ a student\'s name: one rule in the page and the database, evaluated', async () => {
  const CLASS = await import('../js/quest-class.js');
  const sql = codeOnly(read(REFINE), { lang: 'sql' });
  const fn = /create or replace function public\.display_name[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(read(REFINE));
  assert.ok(fn, 'public.display_name is defined');
  assert.match(fn[1], /normalize\(coalesce\(p_name, ''\), NFKC\)/, 'the database normalises NFKC');
  const sqlSet = codePoints(/v ~ '\[([^\]]*)\]'/.exec(fn[1])[1]);
  const jsSet = codePoints(/\[([^\]]*)\]/.exec(CLASS.NAME_REFUSED.source)[1]);
  jsSet.delete(0);   /* NUL: a database text value cannot hold one, so only the page needs to refuse it */
  assert.deepEqual([...jsSet].sort((a, b) => a - b), [...sqlSet].sort((a, b) => a - b), 'the same refused code points on both sides');
  for (const cp of [0x202E, 0x2066, 0x200B, 0x200F, 0xFEFF, 0x0007]) assert.ok(sqlSet.has(cp), 'U+' + cp.toString(16) + ' is refused');
  /* the submit stores the normalised name, so the unique (set_id, lower(name)) decides on what the teacher reads */
  const submit = /create or replace function public\.class_set_submit[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  assert.match(submit, /v_name\s+text\s*:=\s*public\.display_name\(p_name,\s*(\d+)\)/);
  assert.equal(+/public\.display_name\(p_name,\s*(\d+)\)/.exec(submit)[1], CLASS.CLASS_NAME_MAX, 'the ceiling is CLASS_NAME_MAX');
  assert.match(read(MIG_DIR + '/20261116090000_class_quest.sql'), /unique index if not exists class_set_answers_name_uq on public\.class_set_answers \(set_id, lower\(name\)\)/);
  /* the page, evaluated */
  assert.equal(CLASS.cleanName('  Ａｉｋｏ '), 'Aiko', 'full-width is what it looks like');
  assert.equal(CLASS.cleanName('Ai' + String.fromCharCode(0x200B) + 'ko'), null, 'a zero-width space is refused');
  assert.equal(CLASS.cleanName(String.fromCharCode(0x202E) + 'okiA'), null, 'a right-to-left override is refused');
  assert.equal(CLASS.cleanName('Aiko\u0007'), null, 'a control character is refused');
  assert.equal(CLASS.cleanName('田中 花子'), '田中 花子');
  assert.equal(CLASS.cleanName('x'.repeat(CLASS.CLASS_NAME_MAX + 1)), null);
});

/* ══ ④ the answers are rebuilt ═════════════════════════════════════════════════════════════════════ */
test('wave4-refine ④ class_set_submit bounds the answers, then stores what it rebuilt', () => {
  const sql = codeOnly(read(REFINE), { lang: 'sql' });
  const submit = /create or replace function public\.class_set_submit[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  const size = submit.indexOf('pg_column_size(p_answers) > ');
  assert.ok(size >= 0 && size < submit.indexOf('jsonb_array_elements(p_answers)'), 'the size is bounded before anything in the answers is read');
  assert.equal(+/pg_column_size\(p_answers\) > (\d+)/.exec(submit)[1], +/· (\d+) bytes — the largest p_answers/.exec(read(REFINE))[1], 'the bound is the number the header derives');
  assert.match(submit, /jsonb_build_array\(round\(v_lng, 3\), round\(v_lat, 3\)\)/, 'a point is kept to three decimals');
  assert.match(submit, /to_jsonb\(v_yr::integer\)/, 'a year is kept as an integer');
  assert.match(submit, /values \(v_set\.id, v_name, v_clean\)/, 'what is inserted is the rebuilt array and the normalised name');
  assert.doesNotMatch(submit, /values \([^)]*p_answers/, 'never the answers as sent');
});

/* ══ ⑤ the directory pages by keyset ════════════════════════════════════════════════════════════════ */
test('wave4-refine ⑤ the directory pages by keyset: no offset, a cursor, each order exactly its index', () => {
  const sql = codeOnly(read(REFINE), { lang: 'sql' });
  const all = codeOnly(read(MIG_DIR + '/20261116080000_community_maps.sql'), { lang: 'sql' });
  assert.match(sql, /drop function if exists public\.community_maps\(text, text, integer, integer, double precision\[\]\);/, 'the offset overload is dropped');
  const body = /create or replace function public\.community_maps\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql);
  assert.ok(body);
  assert.match(body[1], /p_after\s+text\s+default null/);
  assert.doesNotMatch(body[1] + body[2], /offset/i, 'no offset anywhere');
  assert.match(body[2], /'next', v_next/); assert.match(body[2], /'has_more', v_next is not null/);
  assert.match(body[2], /'invalid_cursor'/, 'a cursor that is not one is said, never quietly the first page');
  const keys = [...body[2].matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]);
  for (const k of ['user_id', 'id', 'email', 'share_id']) assert.ok(!keys.includes(k), 'the directory carries no «' + k + '» key');
  const indexes = [...all.matchAll(/create index if not exists \w+\s+on public\.collection_shares \(([^)]*)\) where listed_at is not null/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  const orders = [...body[2].matchAll(/order by (c\.[^\n]*?)\s+limit v_lim \+ 1\)/g)].map((m) => m[1].replace(/\bc\./g, '').replace(/\s+/g, ' ').trim());
  assert.equal(orders.length, 3, 'one page query per order');
  for (const o of orders) assert.ok(indexes.includes(o), 'the order «' + o + '» is exactly a partial index: ' + indexes.join(' | '));
  assert.match(read(REFINE), /comment on function public\.community_maps\(text, text, integer, text, double precision\[\]\) is[\s\S]*?ANON MAY CALL: \S/, 'and says why anon may call it');
});

/* ══ ⑥ the doors, evaluated ═════════════════════════════════════════════════════════════════════════ */
function fakeDB(answers, uid) {
  const calls = [];
  const from = (table) => {
    const q = { table, eq: [] };
    calls.push(q);
    const chain = {
      select() { return chain; }, order() { return chain; }, limit() { return chain; },
      eq(k, v) { q.eq.push([k, v]); return chain; },
      then(res, rej) { const a = answers['from:' + table]; return Promise.resolve(typeof a === 'function' ? a(q) : (a || { data: [], error: null })).then(res, rej); },
    };
    return chain;
  };
  return { calls, from,
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) },
    rpc(fn, args, opts) { calls.push({ rpc: fn, args, opts }); const a = answers[fn]; return Promise.resolve(typeof a === 'function' ? a(args) : (a || { data: null, error: { code: 'XX' } })); },
    /* (security-review-nov) the server-only doors are reached through the community-class Edge Function */
    functions: { invoke(name, o) { calls.push({ fn: name, op: o.body.op, args: o.body.args }); const a = answers[o.body.op]; return Promise.resolve(typeof a === 'function' ? a(o.body.args) : (a || { data: null, error: { code: 'XX' } })); } } };
}
/* the smallest document the card needs */
function fakeDocument() {
  const mk = (tag) => {
    const n = { tag, kids: [], attrs: {}, dataset: {}, style: {}, textContent: '', className: '',
      appendChild(c) { this.kids.push(c); return c; }, append(...cs) { cs.forEach((c) => this.kids.push(c)); }, setAttribute(k, v) { this.attrs[k] = v; },
      insertBefore(c) { this.kids.unshift(c); return c; } };
    return n;
  };
  return { createElement: mk, getElementById: () => null, head: mk('head') };
}
const texts = (n) => [n.textContent].concat((n.kids || []).flatMap(texts)).filter(Boolean);

test('wave4-refine ⑥ the doors, evaluated with a stand-in database', async () => {
  const C = await import('../js/community-maps.js');
  const S = await import('../js/shared-collection.js');
  /* the cursor travels; no offset is sent */
  const tok = 'abcdefabcdefabcdefabcdefabcdefab';
  const DB = fakeDB({ community_maps: (a) => ({ data: { ok: true, has_more: !a.p_after, next: a.p_after ? null : 'v1|new|0|1|x', items: [{ token: tok, title: 'T', author: 'A' }] }, error: null }) });
  const p1 = await C.browse(DB, { sort: 'new' });
  assert.equal(p1.next, 'v1|new|0|1|x'); assert.equal(p1.hasMore, true);
  const p2 = await C.browse(DB, { sort: 'new', after: p1.next });
  assert.equal(DB.calls[1].args.p_after, 'v1|new|0|1|x', 'the next page asks after the cursor');
  assert.equal(p2.hasMore, false); assert.equal(p2.next, null);
  for (const c of DB.calls) assert.ok(!('p_offset' in c.args), 'no offset is sent');
  const badCur = await C.browse(fakeDB({ community_maps: { data: { ok: false, error: 'invalid_cursor' }, error: null } }), { after: 'x' });
  assert.equal(badCur.error, 'invalid_cursor');
  assert.notEqual(C.failureText('invalid_cursor', 'en'), C.failureText('failed', 'en'), 'and it has its own words');
  /* the holds are asked for THIS account (an administrator reads every hold under RLS) */
  const DB2 = fakeDB({ 'from:collection_shares': { data: [{ id: 's1', collection: 'Trip', token: tok }], error: null },
    'from:community_map_holds': (q) => ({ data: q.eq.some(([k, v]) => k === 'user_id' && v === 'u-admin') ? [] : [{ collection: 'Trip', reason: 'someone else', hidden_at: 'x' }], error: null }) }, 'u-admin');
  const ls = await S.listShares(DB2);
  assert.equal(ls.ok, true);
  assert.equal(ls.shares[0].hidden_at, null, 'another account\'s hold on a collection of the same name is not this account\'s');
  assert.deepEqual(DB2.calls.find((c) => c.table === 'community_map_holds').eq, [['user_id', 'u-admin']]);
  /* ownership is asked of the database (RLS shows the owner only their own rows) */
  const owner = fakeDB({ 'from:collection_shares': { data: [{ id: 's1' }], error: null } }, 'u1');
  assert.equal(await S.ownsShare(owner, tok), true);
  assert.deepEqual(owner.calls[0].eq, [['token', tok], ['user_id', 'u1']], 'the question names this account');
  assert.equal(await S.ownsShare(fakeDB({ 'from:collection_shares': { data: [{ id: 's1' }], error: null } }), tok), false, 'signed out: not yours');
  assert.equal(await S.ownsShare(fakeDB({ 'from:collection_shares': { data: [], error: null } }, 'u1'), tok), false);
  /* the owner's own card offers no report; another reader's does */
  const prev = globalThis.document; globalThis.document = fakeDocument();
  try {
    const HOST = { lang: 'en', user: { id: 'u' } };
    const listing = { author: 'Ms A', summary: '', reused: 0, derived: 0, based_on: null };
    const mine = texts(C.listingSection(HOST, tok, listing, () => { }, true));
    const theirs = texts(C.listingSection(HOST, tok, listing, () => { }, false));
    assert.ok(!mine.some((t) => /Report this collection/.test(t)), 'no report button on one\'s own collection');
    assert.ok(mine.some((t) => /You listed this collection/.test(t)), 'it says where the owner changes it');
    assert.ok(theirs.some((t) => /Report this collection/.test(t)), 'another reader can report it');
  } finally { globalThis.document = prev; }
  /* the database's own refusal has its own code, and the page its own words for it */
  const code = /this is your own collection' using errcode = '([A-Z0-9]{5})'/.exec(codeOnly(read(REFINE), { lang: 'sql' }))[1];
  assert.notEqual(code, '22023', 'not the code every other door uses for «not valid»');
  assert.match(codeOnly(read('js/community-maps.js')), new RegExp("c === '" + code + "'\\) return 'own'"), 'the page reads that code as «own»');
  for (const lang of ['en', 'jp']) assert.notEqual(C.failureText('own', lang), C.failureText('invalid', lang));
  assert.match(C.failureText('own', 'jp'), /[぀-ヿ㐀-鿿]/);
});
