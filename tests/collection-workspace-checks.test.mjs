/* ============================================================================
 *  collection-workspace — saved maps in a collection, and the read-only link its owner publishes
 * ----------------------------------------------------------------------------
 *  The database half is proved by supabase/tests/24_collection_workspace_test.sql (pgTAP, CI's DB job:
 *  one row per map, one link per collection, the public read carries no account, copy twice = copy once,
 *  unpublish kills the link, export and deletion reach both tables). This file is the offline half:
 *    ① the migration's doors decide the account from auth.uid() and take no uuid; the authenticated role
 *      has no INSERT on either table; the public read is anon's ONLY door, says why in its comment, and
 *      builds its answer from keys that name no account, id or e-mail;
 *    ② the shipped helpers, EVALUATED: the link's token is read only when it is one, the link is the page's
 *      own address, closing removes only `collection` from the query, a collection groups places AND maps,
 *      a map from outside is rewritten by the codec before it is kept or opened;
 *    ③ the Atlas capabilities, EVALUATED with a stand-in database: publish never defaults to «everything»
 *      (asks, calls nothing), names only a collection that exists, hands back the link, answers «already
 *      published» with the same link; unpublishing what is not published is «already done»; opening a map
 *      that several names match opens nothing; a map is opened through the share link's own restore;
 *    ④ the UI doors are on demand (no static import on the boot path) and every writing control declares
 *      its effect (publishing is 'outward').
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIG = read('supabase/migrations/20261003211500_collection_workspace.sql');
const SQL = codeOnly(MIG, { lang: 'sql' });

/* the body of `create or replace function public.<name>(` up to its closing `$$;` */
function fnBody(name) {
  const at = SQL.search(new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + name + '\\s*\\('));
  assert.ok(at >= 0, name + ' is defined');
  const rest = SQL.slice(at);
  const open = rest.indexOf('$$'), close = rest.indexOf('$$', open + 2);
  return { sig: rest.slice(0, rest.indexOf(')') + 1), body: rest.slice(open + 2, close) };
}

test('① the doors: the account is auth.uid(), anon reads only through shared_collection', () => {
  for (const name of ['save_view', 'publish_collection', 'copy_shared_collection']) {
    const f = fnBody(name);
    assert.doesNotMatch(f.sig, /uuid/i, name + ' takes no uuid — no door names another account');
    assert.match(f.body, /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/, name + ' decides the account from auth.uid()');
    assert.match(SQL, new RegExp('revoke\\s+execute\\s+on\\s+function\\s+public\\.' + name + '\\([^)]*\\)\\s+from\\s+public,\\s*anon'), name + ' is revoked from anon');
  }
  for (const t of ['saved_views', 'collection_shares']) {
    assert.doesNotMatch(SQL, new RegExp('grant\\s+[^;]*\\binsert\\b[^;]*on\\s+table\\s+public\\.' + t + '\\s+to\\s+authenticated', 'i'), 'authenticated holds no INSERT on ' + t);
    assert.match(SQL, new RegExp('revoke\\s+all\\s+on\\s+table\\s+public\\.' + t + '\\s+from\\s+public,\\s*anon,\\s*authenticated'), t + ' starts from nothing (TRUNCATE ignores RLS)');
    assert.doesNotMatch(SQL, new RegExp('grant\\s+[^;]*on\\s+table\\s+public\\.' + t + '\\s+to\\s+[^;]*\\banon\\b', 'i'), 'anon holds nothing on ' + t);
  }
  /* the public read */
  assert.match(SQL, /grant\s+execute\s+on\s+function\s+public\.shared_collection\(text\)\s+to\s+anon/, 'anon may call shared_collection');
  assert.match(MIG, /comment on function public\.shared_collection\(text\) is[\s\S]*?ANON MAY CALL: \S/, 'and its comment says why (supabase/tests/11_definer_execute_test.sql reads it)');
  const read_ = fnBody('shared_collection').body;
  const keys = [...read_.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]);
  assert.ok(keys.includes('places') && keys.includes('views') && keys.includes('title'), 'the read is built from named keys (not vacuous): ' + keys.join(','));
  for (const k of ['user_id', 'id', 'email', 'token']) assert.ok(!keys.includes(k), 'the public read carries no «' + k + '» key');
  assert.doesNotMatch(read_, /to_jsonb\(\s*[a-z]\s*\)/, 'no whole-row to_jsonb (a column added later would be published)');
});

test('② the shipped helpers, evaluated', async () => {
  const S = await import('../js/shared-collection.js');
  const M = await import('../js/my-places.js');
  const tok = '0123456789abcdef0123456789abcdef';
  assert.equal(S.tokenFromSearch('?collection=' + tok), tok);
  assert.equal(S.tokenFromSearch('?collection=' + tok.toUpperCase() + '&embed=1'), tok, 'case-insensitive');
  assert.equal(S.tokenFromSearch('?collection=../../etc'), '', 'a value that is not a token is not read');
  assert.equal(S.tokenFromSearch('?tour=a'), '');
  assert.equal(S.shareUrl(tok, { origin: 'https://example.test', pathname: '/IntMap/' }), 'https://example.test/IntMap/?collection=' + tok, 'the link is the page\'s own address');
  assert.equal(S.shareUrl('nope', { origin: 'x', pathname: '/' }), '');
  assert.equal(S.searchWithout('?collection=' + tok + '&tour=x'), '?tour=x', 'closing removes only the collection');
  assert.equal(S.searchWithout('?collection=' + tok), '');
  for (const e of ['sign_in', 'empty', 'not_found', 'full', 'unavailable', 'failed']) {
    assert.notEqual(S.shareFailureText(e, 'en'), S.shareFailureText(e, 'jp'), e + ' is written in both languages');
    assert.match(S.shareFailureText(e, 'jp'), /[぀-ヿ㐀-鿿]/);
  }
  assert.match(S.copyResultText({ collection: 'Trip', placesAdded: 2, viewsAdded: 1, placesHad: 1, viewsHad: 0 }, 'en'), /2 place\(s\), 1 map\(s\) \(1 already there\)/);

  const g = M.groupCollection(
    [{ id: 'a', collection: 'Trip', created_at: '2026-10-01' }, { id: 'b', collection: '', created_at: '2026-10-02' }],
    [{ id: 'v1', collection: 'Trip', created_at: '2026-10-03' }, { id: 'v2', collection: 'Maps only', created_at: '2026-10-01' }]);
  assert.deepEqual(g.map((x) => x.collection), ['Maps only', 'Trip', ''], 'a collection of maps only is a group; unfiled last');
  assert.deepEqual(g[1].places.map((p) => p.id), ['a']); assert.deepEqual(g[1].views.map((v) => v.id), ['v1']);

  assert.equal(M.canonicalState('#v=10,50,4,0,0,f&l=dl-ww1&evil=<x>&tt=1914-07-28'), 'v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28', 'a map from outside is written again by the codec — what it does not write is dropped');
  assert.equal(M.canonicalState('l=dl-ww1'), '', 'a fragment with no view is not a map');
  assert.equal(M.viewLabel('v=1,1,1,0,0,f&title=Europe%201914', 'en'), 'Europe 1914', 'a map is named by its caption');
  assert.equal(M.viewLabel('v=1,1,1,0,0,f', 'jp', new Date('2026-10-03T00:00:00Z')), '地図 · 2026-10-03');
  for (const e of ['no_map', 'full_maps']) assert.match(M.placeFailureText(e, 'jp'), /[぀-ヿ㐀-鿿]/, e + ' (jp)');
});

/* a stand-in for supabase-js with one array per table, recording every call */
function fakeDB(state) {
  const calls = [];
  const from = (table) => {
    const ctx = { table, op: 'select', filters: [] };
    const rows = () => state[table] || (state[table] = []);
    const chain = {
      select() { return chain; }, order() { return chain; },
      delete() { ctx.op = 'delete'; return chain; },
      update(row) { ctx.op = 'update'; ctx.row = row; return chain; },
      in(col, vals) { ctx.filters.push([col, vals]); return chain; },
      eq(col, val) { ctx.filters.push([col, [val]]); return chain; },
      then(res, rej) {
        calls.push(ctx);
        let data = rows().slice();
        if (ctx.op === 'delete') { const ids = ctx.filters[0][1]; data = rows().filter((r) => ids.includes(r.id)); state[table] = rows().filter((r) => !ids.includes(r.id)); }
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return chain;
  };
  return {
    calls, from,
    rpc(fn, args) {
      calls.push({ rpc: fn, args });
      if (fn === 'publish_collection') {
        const shares = state.collection_shares || (state.collection_shares = []);
        const at = shares.find((s) => s.collection === args.p_collection);
        if (at) return Promise.resolve({ data: [{ token: at.token, created: false, place_count: 1, view_count: 0 }], error: null });
        const token = String(shares.length + 1).repeat(32).slice(0, 32).replace(/[^0-9a-f]/g, 'a');
        shares.push({ id: 's' + shares.length, collection: args.p_collection, title: args.p_title, token });
        return Promise.resolve({ data: [{ token, created: true, place_count: 1, view_count: 0 }], error: null });
      }
      if (fn === 'save_view') return Promise.resolve({ data: [{ view_id: 'v9', created: true, view_count: 1 }], error: null });
      return Promise.resolve({ data: null, error: { code: 'XX' } });
    },
  };
}
function kernel(HOST) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return { HOST, esc, R: (ok, html, x) => Object.assign({ ok: !!ok, html: html || '' }, x || null), note: (s) => '<n>' + s + '</n>', warn: (s) => '<w>' + s + '</w>' };
}

test('③ the Atlas capabilities, evaluated with a stand-in database', async () => {
  const PLACES = (await import('../js/atlas-cap-places.js')).default;
  const cap = (id) => PLACES.find((e) => e.row[0] === id);
  const pub = cap('places.publish'), unpub = cap('places.unpublish'), saveMap = cap('places.saveView'), open = cap('places.openView');
  assert.ok(pub && unpub && saveMap && open);
  assert.equal(pub.row[7], 'external', 'publishing is risk «external» — whoever has the link reads it');
  assert.equal(pub.row[8], 'explicit', '…and the executor asks the reader when outside content was in front of the model');

  for (const c of [pub, unpub, saveMap, open]) {
    const r = await c.run({ collection: 'Trip' }, {}, kernel({ lang: 'en', user: null }));
    assert.equal(r.meta.code, 'SIGN_IN_REQUIRED', c.row[0] + ': signed out is input only the reader can give');
  }

  const state = {
    saved_places: [{ id: 'p1', name: 'Kyoto Station', collection: 'Trip', lng: 135.7, lat: 34.9, created_at: '2026-10-01' }],
    saved_views: [{ id: 'v1', name: 'Europe 1914', collection: 'Trip', state: 'v=10,50,4,0,0,f&l=dl-ww1', created_at: '2026-10-01' },
      { id: 'v2', name: 'Europe 1918', collection: '', state: 'v=10,50,4,0,0,f&l=dl-ww1&tt=1918-11-11', created_at: '2026-10-02' }],
  };
  const DB = fakeDB(state);
  const HOST = { lang: 'jp', user: { id: 'u' }, DB };
  const K = kernel(HOST);

  const ask = await pub.run({}, {}, K);
  assert.equal(ask.meta.code, 'NEEDS_INPUT', 'no collection named → asked, never «everything» by default');
  assert.equal(DB.calls.filter((c) => c.rpc).length, 0, 'and nothing was published');
  const none = await pub.run({ collection: 'Atlantis' }, {}, K);
  assert.equal(none.meta.code, 'NOT_FOUND'); assert.match(none.html, /Trip/, 'the collections there are, listed');
  const first = await pub.run({ collection: 'trip' }, {}, K);
  assert.equal(first.ok, true); assert.equal(first.meta.code, 'OK');
  assert.match(first.meta.link, /\?collection=[0-9a-f]{32}$/, 'the result carries the link');
  assert.ok(first.html.includes(first.meta.link), 'and says it');
  assert.equal(DB.calls.find((c) => c.rpc === 'publish_collection').args.p_collection, 'Trip', 'the collection as it is spelled in the account');
  const again = await pub.run({ collection: 'Trip' }, {}, K);
  assert.equal(again.meta.code, 'ALREADY_PUBLISHED'); assert.equal(again.meta.link, first.meta.link, 'publishing again answers with the same link');
  const everything = await pub.run({ all: 'everything' }, {}, K);
  assert.equal(DB.calls.filter((c) => c.rpc === 'publish_collection').pop().args.p_collection, null, '«everything» is asked for by name');
  assert.notEqual(everything.meta.link, first.meta.link);

  const notPub = await unpub.run({ collection: 'Elsewhere' }, {}, K);
  assert.equal(notPub.ok, true); assert.equal(notPub.meta.code, 'ALREADY_UNPUBLISHED', 'not published is the state asked for — «already done»');
  const stop = await unpub.run({ collection: 'TRIP' }, {}, K);
  assert.equal(stop.ok, true); assert.equal(state.collection_shares.filter((s) => s.collection === 'Trip').length, 0, 'the share row is deleted');
  assert.equal(state.collection_shares.length, 1, '…and only that one');

  const amb = await open.run({ name: 'Europe' }, {}, K);
  assert.equal(amb.meta.code, 'AMBIGUOUS', 'two maps match → nothing is opened');
  const restored = [];
  globalThis.window = { IntMapBookmark: { restore: (o) => restored.push(o) } };
  try {
    const one = await open.run({ name: 'Europe 1918' }, {}, K);
    assert.equal(one.ok, true);
    assert.deepEqual(restored, [{ shared: true }], 'the map is opened by the share link\'s own restore, once');
  } finally { delete globalThis.window; }

  const noView = await saveMap.run({ name: 'x' }, {}, K);
  assert.equal(noView.meta.code, 'NO_MAP', 'a map that names no view yet is not saved');
  const M = await import('../js/my-places.js');
  await M.saveView(DB, { name: 'Outside', state: '#v=1,2,3,0,0,f&evil=1' });
  assert.equal(DB.calls.find((c) => c.rpc === 'save_view').args.p_state, 'v=1.0000,2.0000,3.00,0,0,f', 'what is kept is what the codec writes');
});

test('④ the UI doors are on demand, and every writing control says what it does', () => {
  const auth = read('js/auth-ui.js');
  assert.match(auth, /import\('\.\/shared-collection\.js'\)/, 'a collection link loads js/shared-collection.js on demand');
  assert.doesNotMatch(auth, /^import[^;]*'\.\/shared-collection\.js'/m, 'not on the boot path');
  const S = read('js/shared-collection.js');
  assert.match(auth, new RegExp("sessionStorage\\.getItem\\('" + /PENDING_KEY = '([^']+)'/.exec(S)[1] + "'\\)"), 'auth-ui reads the same pending key the card writes');
  assert.match(S, /keep\.dataset\.effect = 'private'/);
  const P = read('js/my-places.js');
  assert.match(P, /saveMap\.dataset\.effect = 'private'/);
  assert.match(P, /go\.dataset\.effect = 'outward'/, 'publishing declares it reaches outside the account');
  assert.match(P, /stop\.dataset\.effect = 'private'/);
});
