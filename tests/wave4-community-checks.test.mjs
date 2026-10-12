/* ============================================================================
 *  wave4-community — Community maps: the directory of collections owners chose to list, their reuse and lineage
 * ----------------------------------------------------------------------------
 *  The database half is proved by supabase/tests/38_community_maps_test.sql (pgTAP, CI's DB job: only listed and
 *  unhidden collections in the directory, named keys only, one receipt per copier, the lineage disclosed only while
 *  the original is listed, reports and moderation). This file is the offline half:
 *    ① the migration's doors: the account is auth.uid() and no door takes a uuid; the directory is anon's only new
 *      door and says why; the directory and the listing are built from named keys that name no account or e-mail;
 *      the new tables start from nothing and nobody but the functions inserts;
 *    ② the words the database bounds are the words the page bounds (read from the migration, not restated);
 *    ③ the shipped helpers, EVALUATED (names, entries, the area across the antimeridian, both languages);
 *    ④ the doors and the Atlas capabilities, EVALUATED with a stand-in database: the directory is asked as a GET
 *      and leaves out what was not given; a listing never takes a name Atlas made up (it asks), never lists a
 *      collection that was not named, says «already listed / unlisted»; a title several listings match opens nothing;
 *    ⑤ the UI doors are on demand and declared (the bus event, the account sheet, the gallery, the card).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIG = read('supabase/migrations/20261013080000_community_maps.sql');
const SQL = codeOnly(MIG, { lang: 'sql' });

function fnBody(name) {
  const at = SQL.search(new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + name + '\\s*\\('));
  assert.ok(at >= 0, name + ' is defined');
  const rest = SQL.slice(at);
  const open = rest.indexOf('$$'), close = rest.indexOf('$$', open + 2);
  return { sig: rest.slice(0, rest.indexOf(')') + 1), body: rest.slice(open + 2, close) };
}
const DOORS = ['list_community_map', 'unlist_community_map', 'report_community_map', 'copy_shared_collection'];

test('① the doors: the account is auth.uid(), anon reads only the directory and a collection by its link', () => {
  for (const name of DOORS) {
    const f = fnBody(name);
    assert.doesNotMatch(f.sig, /uuid/i, name + ' takes no uuid — no door names another account');
    assert.match(f.body, /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/, name + ' decides the account from auth.uid()');
    assert.match(SQL, new RegExp('revoke\\s+execute\\s+on\\s+function\\s+public\\.' + name + '\\([^)]*\\)\\s+from\\s+public,\\s*anon'), name + ' is revoked from anon');
  }
  for (const name of ['community_map_reports_admin', 'moderate_community_map']) {
    assert.match(fnBody(name).body, /public\.is_admin\(\)/, name + ' asks the database whether the caller is an administrator');
    assert.match(SQL, new RegExp('revoke\\s+execute\\s+on\\s+function\\s+public\\.' + name + '\\([^)]*\\)\\s+from\\s+public,\\s*anon'), name + ' is revoked from anon');
  }
  /* every grant to anon in this migration, found rather than listed: exactly the two public reads */
  const anonGrants = [...SQL.matchAll(/grant\s+execute\s+on\s+function\s+public\.([a-z_]+)\([^)]*\)\s+to\s+[^;]*\banon\b/g)].map((m) => m[1]).sort();
  assert.deepEqual(anonGrants, ['community_maps', 'shared_collection'], 'anon may call the directory and the read of one collection — nothing else');
  for (const name of anonGrants) assert.match(MIG, new RegExp('comment on function public\\.' + name + '\\([^)]*\\) is[\\s\\S]*?ANON MAY CALL: \\S'), name + ' says why anon may call it (supabase/tests/11)');
  /* the keys the public reads are built from */
  for (const name of anonGrants) {
    const body = fnBody(name).body;
    const keys = [...body.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]);
    assert.ok(keys.length > 5, name + ' builds its answer from named keys (not vacuous)');
    for (const k of ['user_id', 'id', 'email', 'share_id']) assert.ok(!keys.includes(k), name + ' carries no «' + k + '» key');
    assert.doesNotMatch(body, /to_jsonb\(\s*[a-z]+\s*\)/, name + ': no whole-row to_jsonb (a column added later would be published)');
  }
  /* the original's link travels only while the original is listed and not hidden — at every place it is read */
  const origins = SQL.match(/where\s+o\.id\s*=\s*[a-z]+\.derived_from[^)]*/g) || [];
  assert.ok(origins.length >= 2, 'the lineage is read in the directory and in the collection\'s read');
  for (const o of origins) assert.match(o, /o\.listed_at\s+is\s+not\s+null\s+and\s+o\.hidden_at\s+is\s+null/, 'an unlisted or hidden original is never named: ' + o);
  for (const t of ['collection_copies', 'community_map_reports']) {
    assert.match(SQL, new RegExp('revoke\\s+all\\s+on\\s+table\\s+public\\.' + t + '\\s+from\\s+public,\\s*anon,\\s*authenticated'), t + ' starts from nothing (TRUNCATE ignores RLS)');
    assert.doesNotMatch(SQL, new RegExp('grant\\s+[^;]*\\b(insert|update)\\b[^;]*on\\s+table\\s+public\\.' + t + '\\s+to\\s+[^;]*\\b(authenticated|anon)\\b', 'i'), 'nobody but the functions writes ' + t);
    assert.match(SQL, new RegExp("\\('" + t + "',\\s*'you'"), t + ' carries its sentence in the account data catalogue');
  }
  /* the owner's column grant on a share is not widened: listing is a function */
  assert.doesNotMatch(SQL, /grant\s+update\s*\([^)]*\)\s+on\s+table\s+public\.collection_shares/, 'the owner still updates (title) only — listing, the name, the lineage and the hiding are functions');
  /* a copy by the owner of their own collection is not reuse */
  assert.match(fnBody('copy_shared_collection').body, /if\s+v_uid\s*<>\s*sh\.user_id\s+then\s+insert\s+into\s+public\.collection_copies/, 'the receipt is left only by somebody else');
});

test('② the words the database bounds are the words the page bounds', async () => {
  const C = await import('../js/community-maps.js');
  const between = (re) => { const m = re.exec(SQL); assert.ok(m, String(re)); return m; };
  assert.equal(+between(/char_length\(btrim\(author_name\)\)\s+between\s+1\s+and\s+(\d+)/)[1], C.AUTHOR_MAX, 'the longest name');
  assert.equal(+between(/char_length\(summary\)\s*<=\s*(\d+)/)[1], C.SUMMARY_MAX, 'the longest summary');
  assert.equal(+between(/char_length\(note\)\s*<=\s*(\d+)/)[1], C.REPORT_NOTE_MAX, 'the longest report note');
  const reasons = between(/reason\s+text\s+not\s+null\s+check\s*\(reason\s+in\s*\(([^)]*)\)\)/)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...C.REPORT_REASONS], reasons, 'the report reasons, in the same order');
  const sorts = between(/p_sort\s+in\s*\(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...C.SORTS], sorts, 'the orders the directory knows');
});

test('③ the shipped helpers, evaluated', async () => {
  const C = await import('../js/community-maps.js');
  assert.equal(C.authorOk('  Ms Tanaka  '), 'Ms Tanaka');
  assert.equal(C.authorOk('a\u0000b\n'), 'ab', 'control characters are not part of a name');
  assert.equal(C.authorOk(''), ''); assert.equal(C.authorOk('x'.repeat(C.AUTHOR_MAX + 1)), '', 'a name the table would refuse is not one');
  const tok = '0123456789abcdef0123456789abcdef';
  assert.equal(C.entryOf({ token: 'nope' }), null, 'an entry without a token is not one');
  const e = C.entryOf({ token: tok, title: 'T', author: 'A', places: '2', maps: 1, tours: 0, lng: 135.6, lat: null, reused: 3, derived: 1, based_on: { title: 'O', author: 'B', token: 'bad' } });
  assert.equal(e.places, 2); assert.equal(e.lat, null); assert.equal(e.basedOn, null, 'an original without a valid token is not linked');
  assert.deepEqual(C.bboxOfBounds([[130, 30], [140, 40]]), [130, 30, 140, 40]);
  assert.deepEqual(C.bboxOfBounds([[170, -10], [200, 10]]), [170, -10, -160, 10], 'a view across the antimeridian is west > east');
  assert.equal(C.bboxOfBounds([[-200, -80], [200, 80]]), null, 'the whole globe is no area');
  assert.deepEqual(C.bboxOfBounds({ getWest: () => 1, getSouth: () => 2, getEast: () => 3, getNorth: () => 95 }), [1, 2, 3, 90], 'a renderer\'s bounds, latitudes clamped');
  assert.equal(C.reachText(0, 0, 'en'), '', 'nobody kept it: nothing is claimed');
  assert.equal(C.reachText(1, 2, 'en'), 'Kept by 1 reader · 2 collections built on it');
  assert.equal(C.reachText(3, 0, 'jp'), '3 人が保存');
  for (const err of ['sign_in', 'invalid', 'too_long', 'hidden', 'not_listed', 'not_deployed', 'unavailable', 'failed']) {
    assert.notEqual(C.failureText(err, 'en'), C.failureText(err, 'jp'), err + ' is written in both languages');
    assert.match(C.failureText(err, 'jp'), /[぀-ヿ㐀-鿿]/);
  }
  for (const r of C.REPORT_REASONS) assert.match(C.reasonLabel(r, 'jp'), /[぀-ヿ㐀-鿿]/, r + ' has a Japanese name');
});

/* a stand-in for supabase-js — every call recorded, the answers given per function */
function fakeDB(answers, state) {
  const calls = [];
  const from = (table) => {
    const chain = { select() { return chain; }, order() { return chain; },
      then(res, rej) { calls.push({ table }); return Promise.resolve({ data: (state && state[table]) || [], error: null }).then(res, rej); } };
    return chain;
  };
  return { calls, from,
    rpc(fn, args, opts) { calls.push({ rpc: fn, args, opts }); const a = answers[fn]; return Promise.resolve(typeof a === 'function' ? a(args) : (a || { data: null, error: { code: 'XX' } })); } };
}
function kernel(HOST) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return { HOST, esc, R: (ok, html, x) => Object.assign({ ok: !!ok, html: html || '' }, x || null), note: (s) => '<n>' + s + '</n>', warn: (s) => '<w>' + s + '</w>' };
}

test('④ the doors and the Atlas capabilities, evaluated with a stand-in database', async () => {
  const C = await import('../js/community-maps.js');
  const tok = 'abcdefabcdefabcdefabcdefabcdefab', tok2 = '1234512345123451234512345123451a';
  const item = (t, title) => ({ token: t, title, author: 'Ms A', summary: '', places: 2, maps: 0, tours: 0, lng: 135.6, lat: 34.8, reused: 1, derived: 0, based_on: null });
  const DB = fakeDB({ community_maps: { data: { ok: true, total: 2, offset: 0, items: [item(tok, 'Kansai trip'), item(tok2, 'Kansai trip (2)')] }, error: null } });
  const r = await C.browse(DB, { query: '  ', sort: 'bogus', limit: 999 });
  assert.equal(r.ok, true); assert.equal(r.items.length, 2);
  const call = DB.calls[0];
  assert.deepEqual(call.opts, { get: true }, 'the directory is asked as a GET (read-only in PostgREST)');
  assert.ok(!('p_query' in call.args) && !('p_bbox' in call.args), 'what was not given is left out (a GET would send the word null)');
  assert.equal(call.args.p_sort, 'new'); assert.equal(call.args.p_limit, 50);
  await C.browse(DB, { query: 'Kyoto', bbox: [170, -10, -160, 10] });
  assert.deepEqual(DB.calls[1].args.p_bbox, [170, -10, -160, 10]); assert.equal(DB.calls[1].args.p_query, 'Kyoto');
  const bad = await C.listMap(fakeDB({}), { collection: 'Trip', author: '   ' });
  assert.equal(bad.error, 'invalid', 'an empty name is refused before the database is asked');

  const CAPS = (await import('../js/atlas-cap-community.js')).default;
  const cap = (id) => CAPS.find((x) => x.row[0] === id);
  const list = cap('community.list'), unlist = cap('community.unlist'), open = cap('community.open'), browse = cap('community.browse'), mine = cap('community.mine');
  assert.ok(list && unlist && open && browse && mine);
  assert.equal(list.row[7], 'external', 'listing makes a collection findable by anyone — risk «external»');
  assert.equal(list.row[8], 'explicit');
  for (const c of [list, unlist, mine]) assert.equal((await c.run({ collection: 'Trip' }, {}, kernel({ lang: 'en', user: null }))).meta.code, 'SIGN_IN_REQUIRED', c.row[0] + ': signed out');

  const state = { saved_places: [{ id: 'p1', name: 'Kyoto Station', collection: 'Trip', lng: 135.7, lat: 34.9 }], saved_views: [], collection_shares: [] };
  const DB2 = fakeDB({
    list_community_map: { data: [{ token: tok, listed: true, derived_from_title: null }], error: null },
    unlist_community_map: { data: false, error: null },
  }, state);
  const K = kernel({ lang: 'jp', user: { id: 'u' }, DB: DB2 });
  const ask = await list.run({}, {}, K);
  assert.equal(ask.meta.code, 'NEEDS_INPUT', 'no collection named → asked, never «everything» by default');
  const noName = await list.run({ collection: 'trip' }, {}, K);
  assert.equal(noName.meta.code, 'NEEDS_INPUT', 'no name given and none from an earlier listing → asked; Atlas never makes one up');
  assert.equal(DB2.calls.filter((c) => c.rpc === 'list_community_map').length, 0, 'and nothing was listed');
  const ok = await list.run({ collection: 'trip', author: 'Ms A', summary: 'Two stops' }, {}, K);
  assert.equal(ok.ok, true); assert.match(ok.meta.link, /\?collection=[0-9a-f]{32}$/, 'the result carries the link');
  const sent = DB2.calls.find((c) => c.rpc === 'list_community_map').args;
  assert.equal(sent.p_collection, 'Trip', 'the collection as it is spelled in the account'); assert.equal(sent.p_author, 'Ms A');
  const notListed = await unlist.run({ collection: 'Trip' }, {}, K);
  assert.equal(notListed.meta.code, 'ALREADY_UNLISTED', 'not listed is the state asked for — «already done»');

  const K3 = kernel({ lang: 'en', user: null, DB });
  const amb = await open.run({ title: 'Kansai' }, {}, K3);
  assert.equal(amb.meta.code, 'AMBIGUOUS', 'a title two listings match opens nothing and lists both');
  assert.match(amb.html, /Kansai trip \(2\)/);
  const area = await browse.run({ area: true }, {}, K3);
  assert.equal(area.meta.code, 'NEEDS_INPUT', 'no map to read an area from → asked, not the whole world quietly');
  const all = await browse.run({ query: 'Kansai' }, {}, K3);
  assert.equal(all.ok, true); assert.ok(all.html.includes(tok) && all.html.includes('Kept by 1 reader'), 'each entry with its token and reach');
});

test('⑤ the UI doors are on demand and declared', () => {
  const auth = read('js/auth-ui.js'), bus = read('js/bus.js'), gal = read('js/showcase-gallery.js'), sc = read('js/shared-collection.js'), mp = read('js/my-places.js');
  for (const [name, src] of [['js/auth-ui.js', auth], ['js/shared-collection.js', sc], ['js/my-places.js', mp]]) {
    assert.match(src, /import\('\.\/community-maps\.js'\)/, name + ' loads js/community-maps.js on demand');
    assert.doesNotMatch(src, /^import[^;]*community-maps\.js/m, name + ' does not put it on its own load path');
  }
  assert.match(auth, /id="acct-community"/, 'the account sheet has the door');
  assert.match(bus, /'intmap-open-community':\s*\{[\s\S]*?from:\s*\['js\/showcase-gallery\.js'\]/, 'the gallery\'s request is a declared event, from the gallery');
  assert.match(gal, /bus\.emit\('intmap-open-community'/, 'the gallery raises it');
  assert.match(auth, /bus\.on\('intmap-open-community'/, 'and the host answers it');
  /* every owner-written word on a card is set as text: the module never writes markup from data */
  const cm = codeOnly(read('js/community-maps.js'));
  assert.doesNotMatch(cm, /innerHTML|insertAdjacentHTML|outerHTML/, 'js/community-maps.js writes no markup — names, titles and summaries are text');
});
