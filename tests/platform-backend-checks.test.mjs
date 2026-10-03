/* ============================================================================
 *  platform-backend — «Your data» (account-data-center) and «My places» (my-places)
 * ----------------------------------------------------------------------------
 *  The database half is proved by supabase/tests/23_account_data_center_test.sql (pgTAP, CI's DB job).
 *  This file is the offline half, run by `node --test` with no database:
 *    ① the catalogue is complete — every table the migrations make owned by an account (a column that
 *      references auth.users, or a uuid user_id) has its sentence in account_data_catalog, in en AND jp,
 *      and every sentence names such a table. Read from the migrations themselves, never from a list;
 *    ② the account's doors take NO account argument (inventory / export / save_place decide the
 *      account from auth.uid()), and only the authenticated role may call them;
 *    ③ the shipped helpers, EVALUATED: file name, inventory grouping (an undescribed table is kept),
 *      place grouping and matching, the failure sentences in both languages;
 *    ④ the Atlas capabilities, EVALUATED with a stand-in database: sign-in is input only the reader can
 *      give, no place → asked for (never the map centre), a repeat save → «already saved», an
 *      ambiguous delete deletes nothing, show → the pins it made;
 *    ⑤ the three UI doors reach the modules on demand (no static import on the boot path) and every
 *      writing control declares its effect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const migrations = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => ({ f, sql: readFileSync(join(MIG, f), 'utf8') }));
const ALL_SQL = migrations.map((m) => m.sql).join('\n');

/* every `create table … public.<t> ( … );` body in the migrations, comments stripped */
function tableBodies() {
  const out = new Map();
  for (const { sql } of migrations) {
    const s = codeOnly(sql, { lang: 'sql' });
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s*\(/gi;
    let m;
    while ((m = re.exec(s))) {
      let depth = 1, i = re.lastIndex;
      for (; i < s.length && depth; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; }
      out.set(m[1], (out.get(m[1]) || '') + s.slice(re.lastIndex, i));
    }
  }
  return out;
}
/* the catalogue rows the migrations insert: tbl → {written_by, label_en, label_jp, …} */
function catalogueRows() {
  const rows = new Map();
  const block = /insert\s+into\s+public\.account_data_catalog\s*\([^)]*\)\s*values([\s\S]*?)on\s+conflict/gi;
  let b;
  while ((b = block.exec(ALL_SQL))) {
    const tuple = /\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'(you|intmap)'\s*,((?:\s*'(?:[^']|'')*'\s*,?){6})\s*\)/g;
    let t;
    while ((t = tuple.exec(b[1]))) {
      const vals = [...t[3].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
      rows.set(t[1], { by: t[2], label_en: vals[0], label_jp: vals[1], purpose_en: vals[2], purpose_jp: vals[3], retention_en: vals[4], retention_jp: vals[5] });
    }
  }
  return rows;
}

test('① every account-owned table has its sentence in the catalogue, in en and jp — and nothing else does', () => {
  const owned = [...tableBodies()].filter(([, body]) => /references\s+auth\.users/i.test(body) || /\buser_id\s+uuid\b/i.test(body)).map(([t]) => t).sort();
  assert.ok(owned.length >= 20, 'the migrations make at least 20 tables account-owned (not vacuous): ' + owned.length);
  assert.ok(owned.includes('saved_places'), 'saved_places is owned through user_id → auth.users');
  const cat = catalogueRows();
  const missing = owned.filter((t) => !cat.has(t));
  assert.deepEqual(missing, [], 'owned tables with no catalogue sentence: ' + missing.join(', '));
  const stray = [...cat.keys()].filter((t) => !owned.includes(t));
  assert.deepEqual(stray, [], 'catalogue sentences naming a table no account owns: ' + stray.join(', '));
  for (const [t, r] of cat) {
    for (const k of ['label_en', 'label_jp', 'purpose_en', 'purpose_jp', 'retention_en', 'retention_jp']) assert.ok(r[k] && r[k].trim(), t + '.' + k + ' is written');
    assert.match(r.label_jp + r.purpose_jp, /[぀-ヿ㐀-鿿]/, t + ': the jp sentence is Japanese');
  }
});

/* every regex metacharacter, backslash included — a name is matched as text, never as a pattern */
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('② the account doors take no account argument and are not anon\'s', () => {
  const sig = (name) => { const m = ALL_SQL.match(new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + name + '\\s*\\(([^)]*)\\)', 'i')); return m && m[1]; };
  assert.equal(sig('account_data_inventory').trim(), '', 'account_data_inventory() has no parameter');
  assert.equal(sig('export_account_data').trim(), '', 'export_account_data() has no parameter');
  assert.doesNotMatch(sig('save_place'), /uuid/i, 'save_place() takes no uuid');
  for (const fn of ['account_data_inventory()', 'export_account_data()']) {
    assert.match(ALL_SQL, new RegExp('revoke\\s+execute\\s+on\\s+function\\s+public\\.' + reEsc(fn) + '\\s+from\\s+public,\\s*anon'), fn + ' is revoked from anon');
  }
  for (const name of ['account_data_inventory', 'export_account_data', 'save_place']) {
    const body = ALL_SQL.slice(ALL_SQL.search(new RegExp('function\\s+public\\.' + name + '\\s*\\(')));
    assert.match(body.slice(0, 2500), /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/, name + ' decides the account from auth.uid()');
  }
  /* the export, the inventory and account deletion walk ONE discovery */
  for (const name of ['account_data_inventory', 'export_account_data', 'delete_account_data']) {
    const body = ALL_SQL.slice(ALL_SQL.search(new RegExp('function\\s+public\\.' + name + '\\s*\\(')));
    assert.match(body.slice(0, 4000), /public\._owned_by_user_cols\(\)/, name + ' walks public._owned_by_user_cols()');
  }
  assert.doesNotMatch(read('supabase/migrations/20261003140000_saved_places.sql'), /grant\s+[^;]*insert[^;]*on\s+table\s+public\.saved_places\s+to\s+authenticated/i, 'authenticated gets no INSERT on saved_places — save_place() is the door');
});

test('③ the shipped helpers, evaluated', async () => {
  const AD = await import('../js/account-data.js');
  const MP = await import('../js/my-places.js');
  assert.equal(AD.exportFileName({ exported_at: '2026-10-03T12:00:00Z' }), 'intmap-account-2026-10-03.json');
  const v = AD.inventoryView([
    { tbl: 'favorites', row_count: 2, described: true, written_by: 'you', label_en: 'Saved articles', label_jp: '保存した記事' },
    { tbl: 'ai_usage', row_count: 5, described: true, written_by: 'intmap', label_en: 'AI usage per day', label_jp: '日ごとのAI利用' },
    { tbl: 'donations', row_count: 0, described: true, written_by: 'you', label_en: 'Donation notes', label_jp: '寄付の記録' },
    { tbl: 'next_years_table', row_count: 3, described: false, written_by: null },
  ], 'jp');
  assert.equal(v.total, 10, 'every held row is counted — including the table nobody has described yet');
  assert.deepEqual(v.you.map((i) => i.label), ['保存した記事', 'next_years_table'], 'jp labels; an undescribed table is shown by its name, never hidden');
  assert.deepEqual(v.intmap.map((i) => i.table), ['ai_usage']);
  assert.deepEqual(v.none.map((i) => i.table), ['donations']);
  assert.deepEqual(v.undescribed, ['next_years_table']);
  for (const e of ['sign_in', 'rate_limited', 'unavailable', 'failed']) {
    assert.notEqual(AD.failureText(e, 'en'), AD.failureText(e, 'jp'), e + ' is written in both languages');
    assert.match(AD.failureText(e, 'jp'), /[぀-ヿ㐀-鿿]/);
  }
  for (const e of ['sign_in', 'full', 'invalid', 'unavailable', 'failed']) assert.match(MP.placeFailureText(e, 'jp'), /[぀-ヿ㐀-鿿]/, e + ' (jp)');

  assert.equal(MP.placeLabel(139.69171, 35.6895), '35.6895°N 139.6917°E');
  assert.equal(MP.placeLabel(-58.38, -34.6), '34.6000°S 58.3800°W');
  const places = [
    { id: 'a', name: 'Kyoto Station', collection: 'Field trip', created_at: '2026-10-01' },
    { id: 'b', name: 'Osaka Castle', collection: 'Field trip', created_at: '2026-10-02' },
    { id: 'c', name: 'Home', collection: '', created_at: '2026-09-01' },
    { id: 'd', name: 'Kyoto Tower', collection: 'Towers', created_at: '2026-09-02' },
  ];
  const g = MP.groupPlaces(places);
  assert.deepEqual(g.map((x) => x.collection), ['Field trip', 'Towers', ''], 'collections in order, the unfiled group last');
  assert.deepEqual(g[0].places.map((p) => p.id), ['b', 'a'], 'newest first');
  assert.deepEqual(MP.matchPlaces(places, { name: 'ｋｙｏｔｏ station' }).map((p) => p.id), ['a'], 'name match is width- and case-insensitive; exact beats partial');
  assert.deepEqual(MP.matchPlaces(places, { name: 'kyoto' }).map((p) => p.id), ['a', 'd'], 'a partial name may match several');
  assert.deepEqual(MP.matchPlaces(places, { collection: 'field trip' }).map((p) => p.id), ['a', 'b']);
  assert.deepEqual(MP.matchPlaces(places, { id: 'c' }).map((p) => p.id), ['c']);
  assert.equal(MP.matchPlaces(places, {}).length, 4, 'nothing named = all');
});

/* a stand-in for supabase-js: records every call, answers from a table */
function fakeDB(state) {
  const calls = [];
  const q = (table) => {
    const ctx = { table, op: 'select', filters: [] };
    const chain = {
      select() { return chain; }, order() { return chain; },
      delete() { ctx.op = 'delete'; return chain; },
      update(row) { ctx.op = 'update'; ctx.row = row; return chain; },
      in(col, vals) { ctx.filters.push([col, vals]); return chain; },
      eq(col, val) { ctx.filters.push([col, [val]]); return chain; },
      then(res, rej) {
        calls.push(ctx);
        let data = state.places.slice();
        if (ctx.op === 'delete') { const ids = ctx.filters[0][1]; data = state.places.filter((p) => ids.includes(p.id)); state.places = state.places.filter((p) => !ids.includes(p.id)); }
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return chain;
  };
  return {
    calls,
    from: q,
    rpc(fn, args) {
      calls.push({ rpc: fn, args });
      if (fn === 'save_place') {
        const same = state.places.find((p) => (+p.lng).toFixed(5) === (+args.p_lng).toFixed(5) && (+p.lat).toFixed(5) === (+args.p_lat).toFixed(5));
        if (same) return Promise.resolve({ data: [{ place_id: same.id, created: false, place_count: state.places.length }], error: null });
        const id = 'id' + (state.places.length + 1);
        state.places.push({ id, name: args.p_name, lng: args.p_lng, lat: args.p_lat, note: args.p_note || '', collection: args.p_collection || '' });
        return Promise.resolve({ data: [{ place_id: id, created: true, place_count: state.places.length }], error: null });
      }
      return Promise.resolve({ data: null, error: { code: 'XX' } });
    },
  };
}
function kernel(HOST, extra) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return Object.assign({
    HOST, esc,
    R: (ok, html, x) => Object.assign({ ok: !!ok, html: html || '' }, x || null),
    note: (s) => '<n>' + s + '</n>', warn: (s) => '<w>' + s + '</w>',
    _lnorm: (s) => String(s || '').toLowerCase().trim(),
    GLEDGER: { resolve: () => null },
    geocode: async (q) => (/kyoto/i.test(q) ? { lng: 135.75875, lat: 34.98559, name: 'Kyoto Station' } : null),
  }, extra || null);
}

test('④ the Atlas capabilities, evaluated with a stand-in database', async () => {
  const PLACES = (await import('../js/atlas-cap-places.js')).default;
  const ACCOUNT = (await import('../js/atlas-cap-account.js')).default;
  const cap = (list, id) => list.find((e) => e.row[0] === id);
  const save = cap(PLACES, 'places.save'), show = cap(PLACES, 'places.show'), remove = cap(PLACES, 'places.remove'), lst = cap(PLACES, 'places.list');
  assert.ok(save && show && remove && lst && cap(ACCOUNT, 'account.data') && cap(ACCOUNT, 'account.export'));

  const signedOut = { lang: 'en', user: null };
  for (const c of [save, show, remove, lst, cap(ACCOUNT, 'account.data'), cap(ACCOUNT, 'account.export')]) {
    const r = await c.run({ place: 'Kyoto' }, {}, kernel(signedOut));
    assert.equal(r.ok, false); assert.equal(r.meta.code, 'SIGN_IN_REQUIRED', c.row[0] + ': signed out is input only the reader can give');
  }

  const state = { places: [] };
  const pins = [];
  const HOST = { lang: 'jp', user: { id: 'u' }, DB: fakeDB(state), userPins: [{ id: 'p1', lng: 10, lat: 20, meta: { title: 'Pinned', description: 'from a pin' } }],
    addPin(lng, lat, meta) { const at = pins.find((p) => p.lng === lng && p.lat === lat); if (at) return at.id; const id = 'p' + (pins.length + 10); pins.push({ id, lng, lat, meta }); return id; } };
  const K = kernel(HOST);

  const none = await save.run({}, {}, K);
  assert.equal(none.ok, false); assert.equal(none.meta.code, 'NEEDS_INPUT', 'no place named → asked for, never the map centre');
  assert.equal(HOST.DB.calls.length, 0, 'and nothing was saved');

  const first = await save.run({ place: 'Kyoto Station', collection: '京都旅行' }, {}, K);
  assert.equal(first.ok, true); assert.equal(first.meta.code, 'OK');
  const again = await save.run({ place: 'Kyoto Station' }, {}, K);
  assert.equal(again.ok, true); assert.equal(again.meta.code, 'ALREADY_SAVED', 'the same place twice is «already saved», not a second place');
  assert.equal(state.places.length, 1);
  const fromPin = await save.run({ pinId: 'p1' }, {}, K);
  assert.equal(fromPin.ok, true); assert.equal(state.places[1].name, 'Pinned'); assert.equal(state.places[1].note, 'from a pin', 'a pin\'s own words become the place\'s');
  assert.equal((await save.run({ place: 'Atlantis' }, {}, K)).meta.code, 'PLACE_NOT_FOUND');

  const listed = await lst.run({}, {}, K);
  assert.match(listed.html, /Kyoto Station/); assert.match(listed.html, /34\.98559, 135\.75875/, 'the list gives the model positions, not just names');

  const shown = await show.run({ collection: '京都旅行' }, {}, K);
  assert.equal(shown.ok, true); assert.equal(shown.objectIds.length, 1, 'show returns the pins it made');
  assert.equal(pins[0].meta.savedPlaceId, 'id1', 'a shown pin knows which saved place it is');

  state.places.push({ id: 'id9', name: 'Kyoto Station', lng: 1, lat: 1, collection: '' });
  const amb = await remove.run({ name: 'kyoto station' }, {}, K);
  assert.equal(amb.ok, false); assert.equal(amb.meta.code, 'AMBIGUOUS'); assert.equal(state.places.length, 3, 'an ambiguous delete deletes nothing');
  assert.equal((await remove.run({}, {}, K)).meta.code, 'NEEDS_INPUT', 'delete never defaults to «everything»');
  const gone = await remove.run({ id: 'id9' }, {}, K);
  assert.equal(gone.ok, true); assert.equal(state.places.length, 2);
});

test('⑤ the UI doors are on demand, and every writing control says what it does', () => {
  const auth = read('js/auth-ui.js'), body = read('js/app-body.js');
  for (const [src, mod] of [[auth, 'my-places.js'], [auth, 'account-data.js'], [body, 'my-places.js']]) {
    assert.match(src, new RegExp("import\\('\\./" + mod.replace('.', '\\.') + "'\\)"), 'reached by a dynamic import of ./' + mod);
    assert.doesNotMatch(src, new RegExp("^import[^;]*'\\./" + mod.replace('.', '\\.') + "'", 'm'), mod + ' is not statically imported (boot path)');
  }
  assert.match(auth, /id="acct-export" data-effect="private"/);
  assert.match(body, /data-pinact="save" data-effect="private"/);
  const places = read('js/my-places.js');
  assert.match(places, /saveView\.dataset\.effect = 'private'/);
  assert.match(places, /ren\.dataset\.effect = 'private'/);
  assert.match(places, /del\.dataset\.effect = 'destructive'/);
  assert.match(read('js/account-data.js'), /go\.dataset\.effect = 'private'/);
});
