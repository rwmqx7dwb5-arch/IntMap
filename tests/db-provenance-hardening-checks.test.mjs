// ============================================================================
//  tests/db-provenance-hardening-checks.test.mjs
// ----------------------------------------------------------------------------
//  The four invariants of supabase/tests/12_db_provenance_hardening_test.sql, measured
//  WITHOUT a database: every migration is replayed, in order, as a sequence of SQL
//  statements, and the assertions are about the STATE that replay ends in — not about the
//  text of one file. (That distinction is the finding: the audit read
//  `set search_path = public` in 20260824090000 and reported the news_event_* functions as
//  unpinned, while 20260918090000 had already re-pinned them with ALTER FUNCTION inside a
//  DO block. Any single-file reading of either migration gets that wrong.)
//
//    ① every SECURITY DEFINER function in public ends with a search_path that names no
//      schema a caller could create in: not public, not $user, pg_temp only last;
//    ② no bucket that ends `public = true` keeps a SELECT policy on storage.objects that
//      names it (or names no bucket at all);
//    ③ community_posts / community_comments end with a BEFORE INSERT row trigger whose
//      function writes author_name from profiles_public and created_at from now(), and
//      reads neither from the request;
//    ④ the INSERT grant for authenticated ends column-level, covers every column the two
//      client insert paths send, and none of the provenance columns.
//
//  The replay is the pgTAP file's shadow, not its substitute: pgTAP runs against a real
//  Postgres in CI (.github/workflows/db.yml); this one runs on every `npm test`, and it is
//  honest about its edges — a GRANT/REVOKE issued through dynamic SQL is not interpreted,
//  so the test FAILS if one ever touches INSERT (rather than quietly not seeing it).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const MIGRATIONS = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => ({ file: f, sql: readFileSync(join(MIG_DIR, f), 'utf8') }));

/* ── a statement splitter that knows the four ways SQL hides a semicolon ─────────────────── */
export function splitSql(src) {
  const out = []; let cur = ''; let i = 0;
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    if (two === '--') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; cur += ' '; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) { if (j >= src.length) break; if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; } j++; }
      cur += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i));
      if (m) { const tag = m[0]; const e = src.indexOf(tag, i + tag.length); const end = e < 0 ? src.length : e + tag.length; cur += src.slice(i, end); i = end; continue; }
    }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/* the text of a statement with its string literals and dollar bodies blanked, for keyword parsing */
function skeleton(stmt) {
  return stmt.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, ' $BODY$ ').replace(/'(?:[^']|'')*'/g, "'…'");
}
function dollarBody(stmt) {
  const m = /\$([A-Za-z_][A-Za-z0-9_]*)?\$([\s\S]*?)\$\1\$/.exec(stmt);
  return m ? m[2] : '';
}
/* split on commas at paren depth 0, outside quotes */
function splitTop(s) {
  const out = []; let d = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) { if (s[i + 1] === q) { cur += s[++i]; } else q = null; } continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unq = (id) => id.trim().replace(/^"(.*)"$/, '$1');
const relName = (s) => { const p = s.trim().split('.').map(unq); return (p.length === 1 ? 'public.' + p[0] : p.join('.')).toLowerCase(); };
const unLiteral = (s) => { const m = /^'((?:[^']|'')*)'$/.exec(s.trim()); return m ? m[1].replace(/''/g, "'") : null; };

/* ── ① function identity: name + input argument types, normalised the way Postgres does ─── */
const TYPE_ALIAS = { int: 'integer', int4: 'integer', int8: 'bigint', int2: 'smallint', float8: 'double precision',
  float4: 'real', bool: 'boolean', varchar: 'character varying', timestamptz: 'timestamp with time zone',
  'timestamp without time zone': 'timestamp', decimal: 'numeric' };
const MULTIWORD_TYPE_HEADS = new Set(['double', 'character', 'timestamp', 'time', 'bit', 'interval']);
function normType(t) {
  let s = t.trim().toLowerCase().replace(/\s+/g, ' ');
  let arr = ''; while (/\[\]$/.test(s)) { arr += '[]'; s = s.slice(0, -2).trim(); }
  s = s.replace(/^public\./, '');
  return (TYPE_ALIAS[s] || s) + arr;
}
function argTypes(argList) {
  if (!argList.trim()) return [];
  return splitTop(argList).map((a) => {
    let s = a.replace(/\s+default\s+[\s\S]*$/i, '').replace(/\s*=\s*[\s\S]*$/, '').trim();
    let toks = s.split(/\s+/);
    const mode = toks[0].toLowerCase();
    if (['in', 'out', 'inout', 'variadic'].includes(mode)) { if (mode === 'out') return null; toks = toks.slice(1); }
    if (toks.length >= 2 && !MULTIWORD_TYPE_HEADS.has(toks[0].toLowerCase())) toks = toks.slice(1);
    return normType(toks.join(' '));
  }).filter((t) => t !== null);
}
const fnKey = (name, types) => relName(name) + '(' + types.join(',') + ')';
function parseSig(sig) {   /* 'public.f(bigint, text)' */
  const m = /^\s*([\w."]+)\s*\(([\s\S]*)\)\s*$/.exec(sig);
  return m ? fnKey(m[1], argTypes(m[2])) : null;
}
function searchPathOf(skel) {
  const m = /\bset\s+search_path\s*(?:=|to)\s*((?:'…'|[\w$"]+)(?:\s*,\s*(?:'…'|[\w$"]+))*)/i.exec(skel);
  return m ? m[1] : null;
}

/* ── the replay ───────────────────────────────────────────────────────────────────────────── */
function replay() {
  const fns = new Map();          // key → { definer, searchPath:[...], body, file }
  const triggers = new Map();     // table → Map(name → { timing, events, forEachRow, fn })
  const privs = new Map();        // table → role → { table:Set, cols:Map(priv→Set) }
  const buckets = new Map();      // id → public
  const policies = new Map();     // 'storage.objects' policy name → { cmd, roles, using }
  const dynamicTouches = [];      // dynamic GRANT/REVOKE statements that mention INSERT/ALL
  const doPins = [];
  const ROLES = ['anon', 'authenticated'];
  const ALL_TABLE_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
  const privOf = (t, r) => {
    if (!privs.has(t)) privs.set(t, new Map());
    const m = privs.get(t); if (!m.has(r)) m.set(r, { table: new Set(), cols: new Map() }); return m.get(r);
  };

  for (const { file, sql } of MIGRATIONS) {
    for (const stmt of splitSql(sql)) {
      const sk = skeleton(stmt), low = sk.toLowerCase().replace(/\s+/g, ' ').trim();

      /* create table → Supabase's default privileges hand anon/authenticated ALL (production's
         condition, SECURITY-ARCHITECTURE.md §8 item 6); later GRANT/REVOKE decide what remains */
      let m = /^create table (?:if not exists )?([\w."]+)/.exec(low);
      if (m) { const t = relName(m[1]); if (!privs.has(t)) for (const r of ROLES) ALL_TABLE_PRIVS.forEach((p) => privOf(t, r).table.add(p)); continue; }

      m = /^(grant|revoke) ([\s\S]+?) on (?:table )?([\w."]+(?:\s*,\s*[\w."]+)*) (to|from) ([\w", ]+?)(?: with grant option)?$/.exec(low);
      if (m && !/^(function|schema|sequence|all tables|all functions|all sequences)\b/.test(m[3]) && !/ on (function|schema|sequence|all )/.test(' on ' + m[3])) {
        const [, verb, plist, objs, , roleList] = m;
        const roles = roleList.split(',').map((r) => unq(r)).filter((r) => ROLES.includes(r));
        const items = splitTop(plist).map((p) => {
          const pm = /^(\w+)(?: privileges)?\s*(?:\(([^)]*)\))?$/.exec(p.trim());
          return pm ? { priv: pm[1], cols: pm[2] ? pm[2].split(',').map((c) => unq(c).toLowerCase()) : null } : null;
        }).filter(Boolean);
        for (const t of objs.split(',').map(relName)) for (const r of roles) for (const it of items) {
          const st = privOf(t, r);
          const list = it.priv === 'all' ? ALL_TABLE_PRIVS : [it.priv];
          for (const p of list) {
            if (verb === 'grant') {
              if (it.cols) { if (!st.cols.has(p)) st.cols.set(p, new Set()); it.cols.forEach((c) => st.cols.get(p).add(c)); }
              else st.table.add(p);
            } else if (it.cols) { if (st.cols.has(p)) it.cols.forEach((c) => st.cols.get(p).delete(c)); }
            else { st.table.delete(p); st.cols.delete(p); }   // revoking the table privilege takes its column grants too
          }
        }
        continue;
      }

      m = /^create (?:or replace )?function ([\w."]+)\s*\(/.exec(low);
      if (m) {
        const open = sk.indexOf('(', sk.toLowerCase().indexOf('function'));
        let d = 0, close = open;
        for (let i = open; i < sk.length; i++) { if (sk[i] === '(') d++; else if (sk[i] === ')') { d--; if (d === 0) { close = i; break; } } }
        const key = fnKey(m[1], argTypes(stmt.slice(open + 1, close)));
        const attrs = sk.slice(close + 1);
        const sp = searchPathOf(attrs);
        fns.set(key, { definer: /\bsecurity definer\b/i.test(attrs), searchPath: sp, body: dollarBody(stmt), file });
        continue;
      }
      m = /^drop function (?:if exists )?([\s\S]+?)(?: cascade| restrict)?$/.exec(low);
      if (m) { for (const sig of splitTop(m[1])) { const k = parseSig(sig); if (k) fns.delete(k); } continue; }
      m = /^alter function ([\w."]+\s*\([^)]*\)) ([\s\S]*)$/.exec(low);
      if (m) {
        const k = parseSig(m[1]); const f = k && fns.get(k);
        if (f) { const sp = searchPathOf(sk.slice(sk.toLowerCase().indexOf(m[2].slice(0, 12)))); if (sp) f.searchPath = sp;
          if (/\bsecurity definer\b/.test(m[2])) f.definer = true; if (/\bsecurity invoker\b/.test(m[2])) f.definer = false; }
        continue;
      }

      /* DO blocks: interpret the one dynamic form migrations use for functions —
           foreach <x> in array <arr> loop … execute format('alter function %s set search_path = …', <x>)
         with <arr> declared as an array literal of signatures, applied only to functions that
         exist (the migration guards each with to_regprocedure). Any OTHER dynamic GRANT/REVOKE
         that could change INSERT is recorded so ④ refuses to pass blind. */
      if (/^do\b/.test(low)) {
        const body = dollarBody(stmt);
        const arrays = new Map();
        for (const am of body.matchAll(/(\w+)\s+text\[\]\s*:=\s*array\s*\[([\s\S]*?)\]\s*;/gi)) {
          arrays.set(am[1].toLowerCase(), splitTop(am[2]).map(unLiteral).filter(Boolean));
        }
        for (const em of body.matchAll(/execute\s+format\s*\(\s*('(?:[^']|'')*')\s*,\s*(\w+)\s*\)/gi)) {
          const fmt = unLiteral(em[1]) || '';
          const lowFmt = fmt.toLowerCase();
          if (/^\s*(grant|revoke)\b/.test(lowFmt) && /\b(insert|all)\b/.test(lowFmt)) dynamicTouches.push(file + ': ' + fmt);
          const am = /^\s*alter function %s (.*)$/i.exec(fmt);
          if (!am) continue;
          const before = body.slice(0, em.index);
          const loops = [...before.matchAll(/foreach\s+(\w+)\s+in\s+array\s+(\w+)/gi)].filter((l) => l[1].toLowerCase() === em[2].toLowerCase());
          const arr = loops.length && arrays.get(loops[loops.length - 1][2].toLowerCase());
          if (!arr) continue;
          const sp = searchPathOf(skeleton(am[1]).replace(/''/g, "'…'")) || searchPathOf(am[1].replace(/''/g, "'…'"));
          for (const sig of arr) { const k = parseSig(sig); const f = k && fns.get(k); if (f && sp) { f.searchPath = sp; doPins.push(k); } }
        }
        for (const em of body.matchAll(/execute\s+'((?:[^']|'')*)'/gi)) {
          const s = em[1].replace(/''/g, "'").toLowerCase();
          if (/^\s*(grant|revoke)\b/.test(s) && /\b(insert|all)\b/.test(s)) dynamicTouches.push(file + ': ' + s);
        }
        continue;
      }

      m = /^drop trigger (?:if exists )?([\w"]+) on ([\w."]+)/.exec(low);
      if (m) { const t = relName(m[2]); if (triggers.has(t)) triggers.get(t).delete(unq(m[1])); continue; }
      m = /^create (?:or replace )?trigger ([\w"]+) (before|after|instead of) ([\w ]+?) on ([\w."]+) ([\s\S]*?)execute (?:function|procedure) ([\w."]+)\s*\(/.exec(low);
      if (m) {
        const t = relName(m[4]);
        if (!triggers.has(t)) triggers.set(t, new Map());
        triggers.get(t).set(unq(m[1]), { timing: m[2], events: m[3].split(/\s+or\s+/).map((e) => e.trim().split(' ')[0]),
          forEachRow: /for each row/.test(m[5]), fn: relName(m[6]) });
        continue;
      }

      m = /^insert into storage\.buckets \(([^)]*)\) values \(([\s\S]*?)\)(?: on conflict[\s\S]*)?$/.exec(stmt.toLowerCase().replace(/\s+/g, ' ').trim());
      if (m) {
        const cols = m[1].split(',').map((c) => c.trim()), vals = splitTop(m[2]);
        const id = unLiteral(vals[cols.indexOf('id')] || ''); let pub = /^true$/.test((vals[cols.indexOf('public')] || '').trim());
        const upd = /on conflict[\s\S]*?\bpublic\s*=\s*(true|false)/.exec(stmt.toLowerCase());
        if (upd && buckets.has(id)) pub = upd[1] === 'true';
        if (id) buckets.set(id, buckets.has(id) && !upd ? buckets.get(id) : pub);
        continue;
      }
      m = /^drop policy (?:if exists )?("(?:[^"]|"")*"|\w+) on storage\.objects/.exec(stmt.toLowerCase().replace(/\s+/g, ' ').trim());
      if (m) { policies.delete(unq(m[1])); continue; }
      m = /^create policy ("(?:[^"]|"")*"|\w+) on storage\.objects([\s\S]*)$/.exec(stmt.toLowerCase().replace(/\s+/g, ' ').trim());
      if (m) {
        const rest = m[2];
        const cmd = (/\bfor (all|select|insert|update|delete)\b/.exec(rest) || [, 'all'])[1];
        const roles = (/\bto ([\w", ]+?)(?= using| with|$)/.exec(rest) || [, 'public'])[1].split(',').map((r) => unq(r));
        const using = (/\busing \(([\s\S]*)\)(?: with check|$)/.exec(rest) || [, null])[1];
        policies.set(unq(m[1]), { cmd, roles, using });
        continue;
      }
    }
  }
  return { fns, triggers, privs, buckets, policies, dynamicTouches, doPins };
}
const STATE = replay();

/* ── the columns the client sends, read from the two insert paths ────────────────────────── */
function clientInsertColumns(rel, table) {
  const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
  const at = src.indexOf(`.from('${table}').insert(`);
  assert.ok(at > 0, `${rel} no longer inserts into ${table} — re-read the client before trusting ④`);
  const argName = (/\.insert\((\w+)\)/.exec(src.slice(at)) || [])[1];
  const fnStart = src.lastIndexOf('async function', at);
  const scope = src.slice(fnStart, at);
  const lit = new RegExp(`(?:const|let)\\s+${argName}\\s*=\\s*\\{([\\s\\S]*?)\\};`).exec(scope);
  assert.ok(lit, `${rel}: the row object for ${table} is not a literal in the inserting function`);
  const cols = new Set(splitTop(lit[1]).map((kv) => kv.split(':')[0].trim()).filter(Boolean));
  for (const a of scope.matchAll(new RegExp(`\\b${argName}\\.(\\w+)\\s*=(?!=)`, 'g'))) cols.add(a[1]);
  return cols;
}

test('① every SECURITY DEFINER function in public ends with a search_path no caller can create in', () => {
  const definers = [...STATE.fns].filter(([k, f]) => k.startsWith('public.') && f.definer);
  assert.ok(definers.length >= 20, `the replay found only ${definers.length} SECURITY DEFINER functions — the parser lost some`);
  assert.ok(STATE.doPins.length > 0, 'the replay interpreted no DO-block ALTER FUNCTION — the #R801 re-pin is invisible to it');
  const bad = [];
  for (const [k, f] of definers) {
    if (!f.searchPath) { bad.push(`${k}: no search_path (${f.file})`); continue; }
    const entries = splitTop(f.searchPath).map((e) => e.trim());
    entries.forEach((e, i) => {
      const n = e === "'…'" ? '' : unq(e).toLowerCase();
      if (n === 'public' || n.startsWith('$') || (n === 'pg_temp' && i !== entries.length - 1)) bad.push(`${k}: search_path ${f.searchPath}`);
    });
  }
  assert.deepEqual(bad, [], 'these SECURITY DEFINER functions resolve names through a schema a caller could create in');
});

test('② no public bucket keeps a SELECT policy that lets it be listed', () => {
  const pub = [...STATE.buckets].filter(([, p]) => p).map(([id]) => id);
  assert.ok(pub.length > 0, 'the replay found no public bucket — the parser lost the storage.buckets inserts');
  const bad = [];
  for (const [name, p] of STATE.policies) {
    if (!['select', 'all'].includes(p.cmd)) continue;
    if (!p.roles.some((r) => ['public', 'anon', 'authenticated'].includes(r))) continue;
    for (const id of pub) {
      if (p.using == null || /^\(?\s*true\s*\)?$/.test(p.using) || p.using.includes(`'${id}'`)) bad.push(`${id} ← "${name}"`);
    }
  }
  assert.deepEqual(bad, [], 'a public object is served by URL without RLS; a SELECT policy on it adds only the listing');
  /* and nothing that reads these buckets lists them — the reason the policies could go */
  const callers = ['supabase/functions/aviation-feed/index.ts', 'supabase/functions/ais-feed/index.ts', 'supabase/functions/gdelt-relay/index.ts'];
  for (const c of callers) assert.doesNotMatch(read(c), /\/storage\/v1\/object\/list|\.storage\.from\(/, `${c} lists a bucket — the SELECT policy would be needed`);
});

test('③ a community insert is stamped by a BEFORE INSERT row trigger that reads the card, not the request', () => {
  for (const table of ['public.community_posts', 'public.community_comments']) {
    const trs = [...(STATE.triggers.get(table) || new Map()).values()].filter((t) => t.timing === 'before' && t.events.includes('insert') && t.forEachRow);
    assert.ok(trs.length > 0, `${table} has no BEFORE INSERT row trigger`);
    const stamped = trs.some((t) => {
      const f = [...STATE.fns].find(([k]) => k === t.fn + '()');
      if (!f) return false;
      const body = f[1].body.replace(/--[^\n]*/g, '').toLowerCase();
      const assign = (col) => { const a = new RegExp(`\\bnew\\.${col}\\s*:=\\s*([\\s\\S]*?);`).exec(body); return a ? a[1] : null; };
      const name = assign('author_name'), created = assign('created_at');
      if (!name || !created) return false;
      if (/\bnew\.author_name\b/.test(name) || /\bnew\.created_at\b/.test(created)) return false;   // the request's value must not flow back in
      if (!/^(now|transaction_timestamp|statement_timestamp|clock_timestamp)\(\)$/.test(created.trim())) return false;
      /* the name is built from a variable filled by a SELECT … INTO from profiles_public, keyed on the row's user */
      const intoVars = [...body.matchAll(/select\s[\s\S]*?\binto\s+(\w+)\s+from\s+public\.profiles_public\b[\s\S]*?where[\s\S]*?\bnew\.user_id\b/g)].map((x) => x[1]);
      return intoVars.some((v) => new RegExp(`\\b${v}\\b`).test(name));
    });
    assert.ok(stamped, `${table}: no BEFORE INSERT trigger writes author_name from profiles_public and created_at from now()`);
  }
});

test('④ the community INSERT grant is column-level, covers what the client sends, and no provenance column', () => {
  assert.deepEqual(STATE.dynamicTouches, [], 'a dynamic GRANT/REVOKE that can change INSERT exists; this replay cannot see it');
  const cases = [
    { table: 'public.community_posts', client: clientInsertColumns('js/community-board.js', 'community_posts') },
    { table: 'public.community_comments', client: clientInsertColumns('js/community.js', 'community_comments') },
  ];
  for (const { table, client } of cases) {
    for (const role of ['anon', 'authenticated']) {
      const st = STATE.privs.get(table)?.get(role);
      assert.ok(st, `the replay never saw ${table}`);
      assert.ok(!st.table.has('insert'), `${role} holds a table-level INSERT on ${table} — every column, provenance included, is writable`);
    }
    const auth = STATE.privs.get(table).get('authenticated').cols.get('insert') || new Set();
    const anon = STATE.privs.get(table).get('anon').cols.get('insert') || new Set();
    assert.equal(anon.size, 0, `anon may INSERT ${[...anon]} on ${table}`);
    const missing = [...client].filter((c) => !auth.has(c));
    assert.deepEqual(missing, [], `the client sends ${missing} to ${table} but the grant refuses it — posting would break`);
    for (const c of ['id', 'created_at', 'edited_at']) assert.ok(!auth.has(c), `${table}.${c} is INSERT-able by authenticated`);
  }
});

test('the splitter keeps dollar bodies, quoted semicolons and comments intact', () => {
  const s = splitSql("select 'a;b'; -- x;\ncreate function f() returns int as $$ begin return 1; end; $$ language plpgsql; /* ; */ select \"q;\";");
  assert.equal(s.length, 3);
  assert.match(s[1], /return 1; end;/);
  assert.deepEqual(argTypes('p_lng double precision default null, p_ids bigint[], out used integer, p_note text = null'),
    ['double precision', 'bigint[]', 'text']);
});
