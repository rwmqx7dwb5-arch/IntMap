/* ============================================================================
 *  community-next — map corrections: «this is wrong, here», the answer coming back, the public log
 * ----------------------------------------------------------------------------
 *  ① ONE VOCABULARY: the kinds, statuses, publishable answers, ceilings and the year's range are declared once
 *     (supabase/functions/_shared/correction-shape.js); the table's CHECKs and the status functions
 *     (20261003224500_map_corrections.sql) must say the same, spam→closed included.
 *  ② THE RECEIPT: the Edge Function's hash is the database's (sha256 over UTF-8, lowercase hex).
 *  ③ THE WRITE PATH, EVALUATED: reader-reports takes kind 'correction' to map_corrections behind the same
 *     buckets, stores only the receipt's hash, answers the receipt once in the 201, asks no e-mail, takes
 *     user_id from the verified session — and refuses a malformed body before touching anything.
 *  ④ THE READER'S HALF, EVALUATED: the draft the card builds passes the same rule; the device's receipts and
 *     the database's rows merge into one list where a vanished receipt is said, not dropped; the notice reads
 *     only when a report is open and the last read is old, and says an answer once.
 *  ⑤ THE DOORS: the place profile, the map's context menu, Settings and Atlas (three capabilities in the
 *     registry) all reach it; Atlas drafts and the reader sends; the store key is one value in three files.
 *  ⑥ THE PAGES: corrections.html (en/ja) and the operator's console are what the generator writes, every word
 *     of the vocabulary has a label, and the public log never asks for the reader's words.
 *  ⑦ THE PRIVACY TEXT says what is stored and for how long, in both languages.
 *  The database half (RLS, the receipt read, the publish rule, the purge) is supabase/tests/28_map_corrections_test.sql.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(join(ROOT, p)).href;
const norm = (s) => s.replace(/\r\n/g, '\n');

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SUPABASE_ANON_KEY: 'stub-publishable-key' };
globalThis.Deno = globalThis.Deno || { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const SHAPE = await import(modUrl('supabase/functions/_shared/correction-shape.js'));
const FN = await import(modUrl('supabase/functions/reader-reports/index.ts'));
const { PRODUCTION_ORIGIN: PROD } = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const MC = await import(modUrl('js/map-corrections.js'));
const GEN = await import(modUrl('scripts/org-pages.mjs'));
const MIG = src('supabase/migrations/20261003224500_map_corrections.sql');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────── */
const listIn = (re) => { const m = re.exec(MIG); assert.ok(m, 'the migration states ' + re); return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]); };
test('community-next ① the kinds, statuses and publishable answers are the same in the declaration and the table', () => {
  assert.deepEqual(listIn(/kind\s+text\s+not null check \(kind in \(([^)]*)\)\)/), [...SHAPE.CORRECTION.kinds]);
  assert.deepEqual(listIn(/status\s+text\s+not null default 'new' check \(status in \(([^)]*)\)\)/), [...SHAPE.CORRECTION.statuses]);
  assert.deepEqual(listIn(/map_corrections_publish_rule check \(not published or \(reply is not null and status in \(([^)]*)\)\)\)/), [...SHAPE.CORRECTION.publishable]);
  assert.deepEqual(listIn(/if new\.status in \(([^)]*)\) then/), [...SHAPE.CORRECTION.open], 'the trigger\'s open statuses are the declaration\'s');
  /* every status the sender may see, and spam as «closed» — the mapping the two status functions apply */
  for (const [stored, shown] of Object.entries(SHAPE.READER_STATUS)) {
    if (stored === shown) continue;
    assert.equal((MIG.match(new RegExp("case when c\\.status = '" + stored + "' then '" + shown + "' else c\\.status end", 'g')) || []).length, 2, stored + ' reads as ' + shown + ' in both status functions');
  }
  assert.deepEqual(Object.keys(SHAPE.READER_STATUS), [...SHAPE.CORRECTION.statuses], 'every stored status has a reader-facing word');
});
test('community-next ① every ceiling and the year range are the table\'s own', () => {
  const COL = { message: 'message', mapLink: 'map_link', layerId: 'layer_id', layerLabel: 'layer_label', placeLabel: 'place_label', evidence: 'evidence_url',
    mapTime: 'map_time', lang: 'lang', reply: 'reply', adminNote: 'admin_note', fixedRef: 'fixed_ref' };
  for (const [k, col] of Object.entries(COL)) {
    const m = new RegExp('\\n\\s*' + col + '\\s+text[^\\n]*char_length\\(' + col + '\\)\\s*(?:<=\\s*(\\d+)|between \\d+ and (\\d+))').exec(MIG);
    assert.ok(m, col + ': the migration states a length CHECK');
    assert.equal(Number(m[1] || m[2]), SHAPE.CORRECTION_LIMITS[k], col + ': the declaration and the table agree');
  }
  assert.match(MIG, new RegExp('year between ' + SHAPE.YEAR_RANGE.min + ' and ' + SHAPE.YEAR_RANGE.max));
  assert.match(MIG, new RegExp("where n <= " + SHAPE.MAX_RECEIPTS_PER_READ + " and r ~ '\\^\\[A-Za-z0-9_-\\]\\{43\\}\\$'"), 'the status function reads the declared number of receipts of the declared shape');
  assert.equal(FN.LIMITS.correction, SHAPE.CORRECTION_LIMITS, 'reader-reports restates nothing — it imports the declaration');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────── */
test('community-next ② a receipt is 43 base64url characters and its hash is the database\'s sha256-over-UTF-8', async () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) { const r = SHAPE.newReceipt(); assert.match(r, SHAPE.RECEIPT_RE); seen.add(r); }
  assert.equal(seen.size, 50, 'receipts do not repeat');
  for (const r of ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', SHAPE.newReceipt()]) {
    assert.equal(await SHAPE.receiptHash(r), createHash('sha256').update(r, 'utf8').digest('hex'));
  }
  assert.match(MIG, /encode\(sha256\(convert_to\(r, 'UTF8'\)\), 'hex'\)/, 'the status function hashes the receipt the same way');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────── */
const USER = { id: '11111111-2222-4333-8444-555555555555', email: 'account@example.test' };
function req(body, headers) {
  return new Request('https://stub.supabase.test/functions/v1/reader-reports', {
    method: 'POST', headers: { origin: PROD, 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
}
function stub() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url), h = new Headers((init && init.headers) || {});
    calls.push({ url: u, body: init && init.body ? String(init.body) : '' });
    if (u.endsWith('/rpc/relay_take')) return new Response(JSON.stringify([{ allowed: true, remaining: 3 }]), { status: 200 });
    if (u.endsWith('/auth/v1/user')) return h.get('authorization') === 'Bearer good' ? new Response(JSON.stringify(USER), { status: 200 }) : new Response('{}', { status: 401 });
    if (u.endsWith('/rest/v1/map_corrections')) return new Response(null, { status: 201 });
    return new Response('{}', { status: 404 });
  };
  return calls;
}
const GOOD = { kind: 'correction', what: 'date', lng: 135.5, lat: 34.7, zoom: 8, year: 1900, mapTime: '1900-01-01', mapLink: '#v=135.5000,34.7000,8.00,0,0,f&tt=1900-01-01',
  layerId: 'hist-admin', layerLabel: 'Historical provinces', placeLabel: 'Osaka', country: 'JPN', message: 'This province did not exist in 1900.', evidence: 'https://en.wikipedia.org/wiki/Abolition_of_the_han_system', lang: 'en' };

test('community-next ③ a correction is stored with only its receipt\'s hash, and the receipt is answered once', async () => {
  const calls = stub();
  const res = await FN.handle(req(GOOD));
  assert.equal(res.status, 201);
  const j = await res.json();
  assert.equal(j.stored, true);
  assert.match(j.receipt, SHAPE.RECEIPT_RE);
  const ins = calls.find((c) => c.url.endsWith('/rest/v1/map_corrections'));
  assert.ok(ins, 'written to map_corrections');
  const row = JSON.parse(ins.body);
  assert.equal(row.receipt_hash, createHash('sha256').update(j.receipt, 'utf8').digest('hex'));
  assert.ok(!JSON.stringify(row).includes(j.receipt), 'the receipt itself is never stored');
  assert.ok(!('email' in row), 'no e-mail column is written');
  assert.equal(row.user_id, null, 'anonymous');
  assert.equal(row.kind, 'date'); assert.equal(row.year, 1900); assert.equal(row.map_link, GOOD.mapLink); assert.equal(row.evidence_url, GOOD.evidence);
  assert.deepEqual(Object.keys(row).sort(), ['country', 'evidence_url', 'kind', 'lang', 'lat', 'layer_id', 'layer_label', 'lng', 'map_link', 'map_time', 'message',
    'place_label', 'receipt_hash', 'user_id', 'year', 'zoom'].sort(), 'only the table\'s sender-stated columns, the hash and user_id');
  assert.equal(calls.filter((c) => c.url.endsWith('/rpc/relay_take')).length, 2, 'behind both shared buckets');
});
test('community-next ③ a signed-in sender: user_id is the verified account\'s, never the body\'s', async () => {
  const calls = stub();
  const res = await FN.handle(req({ ...GOOD, user_id: 'forged', email: 'x@y.z' }, { authorization: 'Bearer good' }));
  assert.equal(res.status, 201);
  const row = JSON.parse(calls.find((c) => c.url.endsWith('/rest/v1/map_corrections')).body);
  assert.equal(row.user_id, USER.id);
  assert.ok(!('email' in row));
});
test('community-next ③ what is refused never reaches the database or the buckets', async () => {
  const bad = [
    { ...GOOD, what: 'opinion' }, { ...GOOD, lat: 91 }, { ...GOOD, lng: 'x' }, { ...GOOD, message: '   ' },
    { ...GOOD, message: 'x'.repeat(SHAPE.CORRECTION_LIMITS.message + 1) }, { ...GOOD, mapLink: 'https://evil.example/#v=1' },
    { ...GOOD, evidence: 'javascript:alert(1)' }, { ...GOOD, layerId: 'a b' }, { ...GOOD, year: 1900.5 }, { ...GOOD, year: 99999 },
    { ...GOOD, country: 'jp<script>' }, { ...GOOD, zoom: 40 }, { ...GOOD, mapLink: null },
  ];
  for (const b of bad) {
    const calls = stub();
    const res = await FN.handle(req(b));
    assert.equal(res.status, 400, JSON.stringify(b).slice(0, 80));
    assert.equal(calls.length, 0, 'nothing was asked');
  }
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────── */
function memStorage(init) { const m = new Map(Object.entries(init || {})); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; }

test('community-next ④ the draft the card builds passes the one rule; the map state is always the codec\'s, never cut and never hand-built', () => {
  const b = MC.buildBody({ what: 'name', layerId: 'basemap', layerLabel: 'Base map', message: 'The town is Kyōto', evidence: null }, { lng: 135.76, lat: 35.01, zoom: 11, mapLink: '#v=135.7600,35.0100,11.00,0,0,f', year: null, lang: 'jp' });
  assert.equal(SHAPE.checkCorrection(b).ok, true);
  assert.equal(b.kind, 'correction');
  assert.match(src('js/map-corrections.js'), /const link = \(hash && hash\.length <= CORRECTION_LIMITS\.mapLink\) \? hash : own;/);
  assert.match(src('js/map-corrections.js'), /const own = MapState\.encode\(\{ view:/, 'the fallback is the codec, from the reported point');
  assert.equal(SHAPE.checkCorrection({ ...b, mapLink: null }).field, 'mapLink', 'a report without its map state is refused — no reader ever builds one');
});
test('community-next ④ the device\'s receipts and the database\'s rows are one list; a vanished receipt is said', async () => {
  const r1 = SHAPE.newReceipt(), r2 = SHAPE.newReceipt();
  const h1 = await SHAPE.receiptHash(r1), h2 = await SHAPE.receiptHash(r2);
  const items = [{ receipt: r1, hash: h1, at: '2026-10-02T00:00:00Z', what: 'name', seen: 'new' }, { receipt: r2, hash: h2, at: '2026-10-03T00:00:00Z', what: 'date', place: 'Osaka', lng: 1, lat: 2, year: 1900, seen: 'new' }];
  const rows = [{ receipt_hash: h1, id: 'a', created_at: '2026-10-02T00:00:00Z', kind: 'name', status: 'fixed', reply: 'Renamed.' },
    { receipt_hash: 'f'.repeat(64), id: 'b', created_at: '2026-10-01T00:00:00Z', kind: 'value', status: 'new' }];
  const reps = MC.mergeReports(items, rows);
  assert.deepEqual(reps.map((r) => r.status), ['gone', 'fixed', 'new'], 'newest first: the receipt the database no longer has, the answered one, another device\'s');
  assert.equal(reps[0].place_label, 'Osaka');
  assert.deepEqual(MC.newsSince(reps).map((r) => r.id), ['a'], 'the answered one is news; the gone one and the other device\'s are not');
  const store = MC.markSeen({ v: 1, items, checkedAt: 0 }, reps, 5);
  assert.equal(store.items[0].seen, 'fixed'); assert.equal(store.checkedAt, 5);
  assert.equal(MC.newsSince(MC.mergeReports(store.items, rows)).length, 0, 'said once');
  assert.equal(MC.hasOpenReceipt({ items: [{ seen: 'fixed' }] }), false);
  assert.equal(MC.hasOpenReceipt({ items: [{ seen: 'confirmed' }] }), true);
});
test('community-next ④ the notice reads only for an open report whose last read is old, and tells the answer once', async () => {
  const r1 = SHAPE.newReceipt(), h1 = await SHAPE.receiptHash(r1);
  const storage = memStorage({ [MC.STORE_KEY]: JSON.stringify({ v: 1, items: [{ receipt: r1, hash: h1, at: '2026-10-02T00:00:00Z', what: 'name', seen: 'new' }], checkedAt: 0 }) });
  const asked = [], toasts = [];
  const HOST = { lang: 'en', user: null, imToast: (t) => toasts.push(t),
    DB: { rpc: async (fn, args) => { asked.push([fn, args]); return { data: [{ receipt_hash: h1, id: 'a', created_at: '2026-10-02T00:00:00Z', kind: 'name', status: 'fixed', reply: 'ok', place_label: 'Kyoto' }], error: null }; } } };
  const now = Date.parse('2026-10-03T12:00:00Z');
  const a = await MC.checkForNews(HOST, { storage, now });
  assert.equal(a.checked, true); assert.equal(a.answered, 1);
  assert.deepEqual(asked.map((x) => x[0]), ['map_correction_status'], 'signed out: only the receipt read');
  assert.deepEqual(asked[0][1], { p_receipts: [r1] });
  assert.equal(toasts.length, 1); assert.match(toasts[0], /Fixed — Kyoto/);
  const b = await MC.checkForNews(HOST, { storage, now: now + 1000, force: true });
  assert.equal(b.checked, false, 'nothing open any more'); assert.equal(asked.length, 1); assert.equal(toasts.length, 1);
  const s2 = memStorage({ [MC.STORE_KEY]: JSON.stringify({ v: 1, items: [{ receipt: r1, hash: h1, seen: 'new' }], checkedAt: now }) });
  assert.equal((await MC.checkForNews(HOST, { storage: s2, now: now + 60000 })).reason, 'checked-recently');
  assert.equal((await MC.checkForNews(HOST, { storage: memStorage(), now })).reason, 'nothing-open');
});
test('community-next ④ a signed-in reader also reads the account\'s rows (every device)', async () => {
  const asked = [];
  const HOST = { lang: 'jp', user: { id: 'u' }, DB: { rpc: async (fn) => { asked.push(fn); return { data: fn === 'my_map_corrections' ? [{ receipt_hash: 'a'.repeat(64), id: 'z', created_at: '2026-10-01', kind: 'boundary', status: 'confirmed' }] : [], error: null }; } } };
  const got = await MC.readReports(HOST, memStorage());
  assert.equal(got.ok, true);
  assert.deepEqual(asked, ['my_map_corrections']);
  assert.equal(got.reports.length, 1);
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────── */
test('community-next ⑤ the doors: place profile, context menu, Settings, boot notice and Atlas', async () => {
  assert.match(src('js/place-dossier.js'), /data-pd="correct"/);
  assert.match(src('js/place-dossier.js'), /import\('\.\/map-corrections\.js'\)\.then\(\(m\) => m\.openCorrection\(HOST/);
  assert.match(src('js/tool-panel.js'), /Report a map error','地図の誤りを報告'/);
  assert.match(src('index.html'), /id="btn-map-reports"[^>]*data-effect="none"/);
  const body = src('js/app-body.js');
  assert.match(body, /getElementById\('btn-map-reports'\)/);
  /* one store key in three files: the module, the boot's cheap check and the public page */
  assert.equal(MC.STORE_KEY, 'intmap_corrections');
  assert.ok(body.includes("localStorage.getItem('" + MC.STORE_KEY + "')"), 'js/app-body.js reads the module\'s key');
  assert.ok(src('js/org-page.js').includes("localStorage.getItem('" + MC.STORE_KEY + "')"), 'js/org-page.js reads the module\'s key');
  assert.ok(!/from '\.\/map-corrections\.js'/.test(body), 'the boot path does not import the module statically');
  /* Atlas: three rows in the registry, the report row is a session-risk panel that never sends */
  const caps = src('js/atlas-capabilities.js');
  for (const id of ['corrections.report', 'corrections.mine', 'corrections.log']) assert.ok(caps.includes('["' + id + '"'), id + ' is in the registry');
  const C = (await import(modUrl('js/atlas-cap-corrections.js'))).default;
  const rep = C.find((e) => e.row[0] === 'corrections.report');
  assert.equal(rep.row[7], 'session'); assert.equal(rep.row[9], 'place?');
  assert.ok(!/sendCorrection/.test(rep.run.toString()), 'Atlas drafts; the reader sends');
  assert.deepEqual(rep.schema().properties.what.enum, [...SHAPE.CORRECTION.kinds]);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────── */
test('community-next ⑥ the pages are what the generator writes, and the public log never asks for the reader\'s words', () => {
  const out = GEN.outputs();
  for (const rel of ['corrections.html', 'ja/corrections.html', 'admin-corrections.html']) {
    assert.ok(out[rel], rel + ' is generated');
    assert.equal(norm(src(rel)), out[rel], rel + ' is on disk as the generator writes it');
  }
  assert.ok(GEN.TALKS.has('corrections'));
  const js = src('js/org-page.js');
  assert.match(js, /rest\('rpc\/public_map_corrections\?p_limit=200'\)/);
  assert.ok(!/innerHTML/.test(js) && !/innerHTML/.test(src('js/admin-corrections.js')), 'nothing from the backend is inserted as markup');
  const admin = out['admin-corrections.html'];
  assert.match(admin, new RegExp('data-statuses="' + SHAPE.CORRECTION.statuses.join(',') + '"'));
  assert.match(admin, /noindex/);
  /* the public log reads the published rows' columns only (the function returns no message) */
  const fn = /create or replace function public\.public_map_corrections[\s\S]*?\$\$;/.exec(MIG)[0];
  assert.ok(!/message|user_id|receipt_hash|admin_note/.test(fn.replace(/comment on[\s\S]*/, '')), 'public_map_corrections names no private column');
  assert.ok(existsSync(join(ROOT, 'supabase/tests/28_map_corrections_test.sql')));
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────────────────── */
test('community-next ⑦ the privacy text says what a map error report stores and how long, in both languages', async () => {
  globalThis.window = globalThis.window || {};
  await import(modUrl('js/legal-text.js'));
  const L = globalThis.window.IntMapLegalText;
  const ja = L.html('privacy', 'jp'), en = L.html('privacy', 'en');
  assert.match(ja, /<b>地図の誤り報告<\/b>/); assert.match(ja, /ハッシュ値だけ/); assert.match(ja, /730日後/);
  assert.match(en, /<b>Map error reports\.<\/b>/); assert.match(en, /we keep only its hash/); assert.match(en, /730 days after the answer/);
  const [, spam, ans] = /p_spam_days integer default (\d+), p_answered_days integer default (\d+)/.exec(MIG);
  assert.ok(ja.includes(ans + '日後') && en.includes(ans + ' days') && en.includes('spam after ' + spam + ' days'), 'the text quotes the purge defaults');
});
