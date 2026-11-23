/* (atlas-knowledge) the knowledge layer put to work: kept claims reach LATER analysis by the object they are about, age and
   expire in view, have their sources looked at again, and follow the reader to another device only when they ask.
   Evaluates the code (the store, the identity resolver, the sync with a fake database, and the capabilities with a fake kernel);
   nothing here reads source text.
   ① same object, not same spelling  ② time: standing / due  ③ re-check: what each outcome does  ④ account copy: merge, removal
   elsewhere, a failed read leaves the device alone  ⑤ the capabilities end to end, including KNOWLEDGE_OFF and the account refusals */
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
globalThis.window = globalThis;

const { claimFromInput, makeKnowledgeStore, recall, standing, applyRecheck } = await import('../js/atlas-knowledge-store.js');
const { resolveRefKeys, keysOfObject } = await import('../js/atlas-knowledge-identity.js');
const { makeKnowledgeSync, claimFromRow } = await import('../js/atlas-knowledge-sync.js');
const prefs = await import('../js/atlas-knowledge-prefs.js');

const DAY = 864e5, T0 = Date.UTC(2026, 0, 1), NOW = T0 + 100 * DAY;
const src = { url: 'https://www.example.org/report', title: 'Report' };
const keep = (S, a, now) => { const r = claimFromInput(Object.assign({ kind: 'verified', evidence: [src] }, a), now || T0, undefined, a.__ctx); assert.ok(r.claim, JSON.stringify(r.error)); return S.remember(r.claim, now || T0); };

/* ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('① a claim kept under one ref is found by another key of the SAME object, and says that is how it matched', async () => {
  const S = makeKnowledgeStore();
  const ident = await resolveRefKeys(['facility:wd-Q1'], { find: () => ({ ref: 'facility:wd-Q1', ids: { wikidata: 'Q1', osm: 'node/5' } }) });
  assert.deepEqual(ident.keys['facility:wd-Q1'], ['facility:wd-Q1', 'wikidata:Q1', 'osm:node/5']);
  await keep(S, { statement: 'Terminal X handled 5 Mt in 2023', refs: ['facility:wd-Q1'], __ctx: { refKeys: ident.keys } });
  await keep(S, { statement: 'An unrelated claim about Y', refs: ['facility:wd-Q9'] });
  const all = await S.list();
  /* literal ref */
  assert.equal(recall(all, { refs: ['facility:wd-Q1'] }, NOW).claims.length, 1);
  assert.equal(recall(all, { refs: ['facility:wd-Q1'] }, NOW).claims[0].matchedVia, undefined);
  /* another spelling of the same object: the claim carries the keys the graph gave it WHEN IT WAS KEPT, so a later session needs no lookup */
  const r = recall(all, { refs: ['wikidata:Q1'] }, NOW);
  assert.equal(r.claims.length, 1);
  assert.equal(r.claims[0].matchedVia, 'same-object');
  /* a claim kept before keys were stored (or for a ref the graph did not know then) is reached only if the question's keys are handed in */
  await keep(S, { statement: 'An older claim kept by ref only', refs: ['facility:wd-Q3'] });
  const older = await S.list();
  assert.equal(recall(older, { refs: ['wikidata:Q3'] }, NOW).claims.length, 0, 'no keys anywhere: literal refs only, and nothing is guessed');
  assert.equal(recall(older, { refs: ['wikidata:Q3'] }, NOW, { keysOf: { 'wikidata:Q3': ['wikidata:Q3', 'facility:wd-Q3'] } }).claims.length, 1);
  /* a claim about a different object is not reached by an id it does not share */
  assert.equal(recall(all, { refs: ['wikidata:Q2'] }, NOW, { keysOf: { 'wikidata:Q2': ['wikidata:Q2'] } }).claims.length, 0);
});

test('① the resolver says resolved / unresolved / unobserved — a graph that threw is not «not in the graph»', async () => {
  const find = (q) => (q === 'a:1' ? { ref: 'a:1', ids: { wikidata: 'Q7' } } : null);
  const r = await resolveRefKeys(['a:1', 'b:2', 'c:3'], { find, findPersisted: async (q) => { if (q === 'c:3') throw new Error('db down'); return null; } });
  assert.deepEqual(r.status, { 'a:1': 'resolved', 'b:2': 'unresolved', 'c:3': 'unobserved' });
  assert.deepEqual(r.keys['b:2'], ['b:2'], 'an unplaced ref still answers to itself');
  assert.deepEqual(keysOfObject(null), []);
});

/* ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('② age and a re-check date are shown, not silently applied; no default period is invented', async () => {
  const S = makeKnowledgeStore();
  await keep(S, { statement: 'Tariff for route R is 40 USD', recheckAfterDays: 30 });
  await keep(S, { statement: 'The harbour opened in 1952', validTo: '2020' });
  await keep(S, { statement: 'A claim that gave no period' });
  const all = await S.list();
  const by = (re) => all.find((c) => re.test(c.statement));
  assert.equal(by(/Tariff/).recheckAfterMs, 30 * DAY);
  assert.equal(by(/no period/).recheckAfterMs, undefined);
  assert.equal(standing(by(/Tariff/), T0 + 10 * DAY).recheckDue, false);
  const late = standing(by(/Tariff/), NOW);
  assert.equal(late.recheckDue, true); assert.equal(late.ageDays, 100); assert.equal(late.recheckAfterDays, 30);
  assert.equal(standing(by(/no period/), NOW).recheckDue, false, 'age alone never expires a claim');
  assert.equal(standing(by(/harbour/), NOW).periodEnded, true);
  const due = recall(all, { due: true }, NOW).claims.map((c) => c.statement).sort();
  assert.deepEqual(due, ['Tariff for route R is 40 USD', 'The harbour opened in 1952'], 'due = re-check date passed or period ended; the undated claim is not due');
  assert.equal(recall(all, {}, NOW).claims.length, 3, 'nothing is dropped by time: the claims are still returned, labelled');
  assert.equal(claimFromInput({ statement: 'abc', basis: 'b', recheckAfterDays: 0 }, T0).error.code, 'recheck_period_invalid');
  assert.equal(claimFromInput({ statement: 'abc', basis: 'b', recheckAfterDays: 'soon' }, T0).error.code, 'recheck_period_invalid');
});

/* ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('③ each outcome does what it says and no more', async () => {
  const S = makeKnowledgeStore();
  const { claim } = await keep(S, { statement: 'Capacity of Terminal Z is 9 Mtpa', recheckAfterDays: 30, evidence: [src, { origin: 'app_data', dataset: 'IntMap LNG terminals' }] });
  const id = claim.id, at = NOW;
  /* unreachable: failing to look is not finding */
  let r = await S.recheck(id, [{ source: src.url, outcome: 'unreachable' }], at);
  assert.equal(r.claim.kind, 'verified'); assert.equal(r.claim.verifiedAt, undefined); assert.equal(standing(r.claim, at).recheckDue, true);
  /* confirmed / changed must say what the page says now */
  r = await S.recheck(id, [{ source: src.url, outcome: 'confirmed' }], at);
  assert.equal(r.applied.length, 0); assert.equal(r.rejected[0].code, 'needs_note');
  /* a source that is not this claim's is refused by name */
  r = await S.recheck(id, [{ source: 'https://other.example/x', outcome: 'gone' }], at);
  assert.equal(r.rejected[0].code, 'not_a_source_of_this_claim');
  /* confirmed on every web source renews: the clock restarts */
  r = await S.recheck(id, [{ source: 'https://www.example.org/report?utm_source=mail', outcome: 'confirmed', note: 'Table 2 still lists 9 Mtpa' }], at);
  assert.equal(r.applied.length, 1);
  assert.equal(r.claim.verifiedAt, at); assert.equal(standing(r.claim, at + 5 * DAY).ageDays, 5); assert.equal(standing(r.claim, at + 5 * DAY).recheckDue, false);
  assert.equal(r.claim.sources[0].lastCheck.note, 'Table 2 still lists 9 Mtpa');
  /* changed marks the source changed; the kind is left to the new claim that supersedes it */
  r = await S.recheck(id, [{ source: src.url, outcome: 'changed', note: 'now says 11 Mtpa' }], at + DAY);
  assert.equal(standing(r.claim, at + DAY).sourceChanged, true); assert.equal(r.claim.kind, 'verified');
  assert.equal(recall(await S.list(), { due: true }, at + DAY).claims.length, 1, 'a changed source is due');
  /* gone on every source: nothing is left to check again, so it is no longer verified — and it stays, as an inference with its history */
  r = await S.recheck(id, [{ source: src.url, outcome: 'gone' }, { source: 'IntMap LNG terminals', outcome: 'gone' }], at + 2 * DAY);
  assert.equal(r.claim.kind, 'inferred'); assert.equal(r.claim.wasKind, 'verified'); assert.match(r.claim.basis, /none of those was found/);
  assert.equal((await S.get(id)).kind, 'inferred', 'persisted');
  assert.equal(await S.recheck('kn-nope-0000', [], at), null);
});

test('③ gone on ONE of two sources does not take verified away', () => {
  const c = { id: 'kn-aaaa-bbbb', kind: 'verified', statement: 's', at: T0, updatedAt: T0, sources: [{ url: 'https://a.example/x', canonicalUrl: 'a.example/x' }, { url: 'https://b.example/y', canonicalUrl: 'b.example/y' }], refs: [] };
  const r = applyRecheck(c, [{ source: 'https://a.example/x', outcome: 'gone' }], NOW);
  assert.equal(r.claim.kind, 'verified');
  assert.equal(c.sources[0].lastCheck, undefined, 'the input is not mutated');
});

/* ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
function fakeDb(rows, opts) {
  opts = opts || {}; const log = [];
  const q = (tbl) => {
    const st = { op: 'select', filters: {}, payload: null };
    const chain = {
      select() { return chain; }, eq(k, v) { st.filters[k] = v; return chain; }, order() { return chain; },
      range(a, b) { st.range = [a, b]; return chain; },
      upsert(p) { st.op = 'upsert'; st.payload = p; return chain; },
      delete() { st.op = 'delete'; return chain; },
      then(res, rej) {
        let out;
        if (st.op === 'select') out = opts.failRead ? { data: null, error: { message: 'boom' } } : { data: rows.filter((r) => r.user_id === st.filters.user_id).slice(st.range[0], st.range[1] + 1), error: null };
        else if (st.op === 'upsert') { if (opts.failWrite) out = { error: { message: 'full' } }; else { st.payload.forEach((p) => { const i = rows.findIndex((r) => r.user_id === p.user_id && r.id === p.id); if (i >= 0) rows[i] = p; else rows.push(p); }); out = { error: null }; } }
        else { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === st.filters.user_id && (st.filters.id == null || rows[i].id === st.filters.id)) rows.splice(i, 1); out = { error: null }; }
        log.push([tbl, st.op]); return Promise.resolve(out).then(res, rej);
      },
    };
    return chain;
  };
  return { from: q, log };
}
const USER = { id: 'u-1' };

test('④ the account copy: a claim made here goes up, one made elsewhere comes down, the newer copy wins', async () => {
  const rows = [];
  const A = makeKnowledgeStore(), B = makeKnowledgeStore();
  const db = fakeDb(rows);
  const sa = makeKnowledgeSync({ store: A, account: () => ({ db, user: USER }) }), sb = makeKnowledgeSync({ store: B, account: () => ({ db, user: USER }) });
  const a1 = (await keep(A, { statement: 'Made on device A' }, T0)).claim;
  let r = await sa.syncNow(T0 + 1);
  assert.equal(r.ok, true); assert.equal(r.pushed, 1); assert.equal(rows.length, 1);
  assert.ok((await A.get(a1.id)).syncedAt, 'marked as sent');
  assert.equal((await A.get(a1.id)).updatedAt, a1.updatedAt, 'a sync mark is not a change of knowledge');
  r = await sb.syncNow(T0 + 2);
  assert.equal(r.pulled, 1); assert.equal((await B.get(a1.id)).statement, 'Made on device A');
  /* B changes it later: the newer copy wins on A */
  await B.recheck(a1.id, [{ source: src.url, outcome: 'confirmed', note: 'still there' }], T0 + 5);
  await sb.syncNow(T0 + 6);
  r = await sa.syncNow(T0 + 7);
  assert.equal(r.pulled, 1); assert.equal((await A.get(a1.id)).verifiedAt, T0 + 5);
  /* the row on the account carries no device-local mark */
  assert.equal(rows[0].payload.syncedAt, undefined);
});

test('④ a claim forgotten on one device is gone from the other by ABSENCE (no tombstone); a never-synced claim is not mistaken for one', async () => {
  const rows = []; const db = fakeDb(rows);
  const A = makeKnowledgeStore(), B = makeKnowledgeStore();
  const sa = makeKnowledgeSync({ store: A, account: () => ({ db, user: USER }) }), sb = makeKnowledgeSync({ store: B, account: () => ({ db, user: USER }) });
  const x = (await keep(A, { statement: 'To be forgotten' }, T0)).claim;
  await sa.syncNow(T0 + 1); await sb.syncNow(T0 + 2);
  const fresh = (await keep(B, { statement: 'Made on B, not yet sent' }, T0 + 3)).claim;
  await A.forget(x.id); const f = await sa.forgetRemote(x.id); assert.equal(f.ok, true);
  const r = await sb.syncNow(T0 + 4);
  assert.equal(r.removed, 1); assert.equal(await B.get(x.id), null);
  assert.ok(await B.get(fresh.id), 'never synced = new, kept and pushed');
  assert.equal(rows.some((p) => p.id === fresh.id), true);
});

test('④ a failed read ends the sync with the device untouched; a failed write is reported and nothing is marked sent', async () => {
  const A = makeKnowledgeStore();
  const c = (await keep(A, { statement: 'Sent once' }, T0)).claim;
  await A.markSynced([c.id], T0 + 1);
  const rows = [];   /* the account holds nothing: reading it FAILS, so «absent» must not be believed */
  let s = makeKnowledgeSync({ store: A, account: () => ({ db: fakeDb(rows, { failRead: true }), user: USER }) });
  let r = await s.syncNow(T0 + 2);
  assert.equal(r.ok, false); assert.equal(r.reason, 'read-failed'); assert.ok(await A.get(c.id), 'not deleted on a failed read');
  const n = (await keep(A, { statement: 'Not sent yet' }, T0 + 3)).claim;
  s = makeKnowledgeSync({ store: A, account: () => ({ db: fakeDb([], { failWrite: true }), user: USER }) });
  r = await s.syncNow(T0 + 4);
  assert.equal(r.ok, false); assert.equal(r.reason, 'write-failed');
  assert.equal((await A.get(n.id)).syncedAt, undefined, 'a write that failed is not marked sent');
  s = makeKnowledgeSync({ store: A, account: () => ({ db: null, user: null }) });
  assert.equal((await s.syncNow(T0 + 5)).reason, 'signed-out');
});

test('④ deleting the account copy removes every row of the reader and keeps the device\'s own claims', async () => {
  const rows = [{ user_id: 'someone-else', id: 'kn-zzzz-0001', payload: {}, updated_at: new Date(T0).toISOString() }];
  const db = fakeDb(rows), A = makeKnowledgeStore();
  const s = makeKnowledgeSync({ store: A, account: () => ({ db, user: USER }) });
  const c = (await keep(A, { statement: 'Mine' }, T0)).claim; await s.syncNow(T0 + 1);
  assert.equal(rows.length, 2);
  assert.equal((await s.deleteAccountCopy()).ok, true);
  assert.deepEqual(rows.map((r) => r.user_id), ['someone-else'], 'only this reader\'s rows');
  assert.ok(await A.get(c.id)); assert.equal((await A.get(c.id)).syncedAt, undefined);
  assert.equal(claimFromRow({ id: 'kn-aaaa-0001' }, T0), null, 'a row with no payload is not a claim');
});

/* ⑤ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑤ the switches: off until chosen, account copy only with the device switch, and the row reads what Atlas wrote', () => {
  mem.clear();
  assert.deepEqual(prefs.readKnowledgePrefs(), { on: false, sync: false });
  prefs.writeKnowledgePrefs({ on: false, sync: true });
  assert.equal(prefs.readKnowledgePrefs().sync, false, 'sync without on is not a thing');
  prefs.writeKnowledgePrefs({ on: true, sync: true });
  assert.equal(prefs.modeOf(prefs.readKnowledgePrefs()), 'account');
  prefs.writeKnowledgePrefs({ on: true, sync: false });
  assert.equal(prefs.modeOf(prefs.readKnowledgePrefs()), 'device');
  mem.clear();
});

const caps = (await import('../js/atlas-cap-knowledge.js')).default;
const cap = (id) => caps.find((e) => e.row[0] === id);
const K = (user) => ({ R: (ok, html, o) => Object.assign({ ok, html }, o), L: (en) => en, esc: (s) => String(s), note: (s) => '<n>' + s + '</n>', warn: (s) => '<w>' + s + '</w>', HOST: { DB: null, user: user || null } });

test('⑤ the capabilities: off refuses by name; on, a claim is kept with its refs and found by context, and re-checked', async () => {
  mem.clear();
  assert.equal((await cap('knowledge.recall').run({ query: 'x' }, {}, K())).meta.code, 'KNOWLEDGE_OFF');
  assert.equal((await cap('knowledge.recheck').run({ id: 'kn-aaaa-bbbb' }, {}, K())).meta.code, 'KNOWLEDGE_OFF');
  assert.equal((await cap('knowledge.setting').run({ sync: true }, {}, K())).meta.code, 'needs_signin', 'the account copy needs a signed-in reader');
  assert.equal((await cap('knowledge.setting').run({ sync: true }, {}, K({ id: 'u' }))).meta.code, 'KNOWLEDGE_OFF', '…and the device switch first');
  assert.equal((await cap('knowledge.setting').run({ on: true }, {}, K())).meta.knowledge.on, true);

  const { worldObjects } = await import('../js/atlas-world-objects.js');
  const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
  worldObjects.register([makeAtlasGeoObject().worldObject({ type: 'facility', kind: 'port', id: 'wd-Q555', name: 'Port Test', lng: 1, lat: 2, provenance: 'feed_coordinate', ids: { wikidata: 'Q555' } })]);
  const kept = await cap('knowledge.remember').run({ claims: [{ statement: 'Port Test handled 12 Mt in 2023', kind: 'verified', evidence: [{ url: 'https://stats.example.org/p', title: 'Stats' }], refs: ['facility:wd-Q555', 'facility:unknown-9'], recheckAfterDays: 1 }] }, {}, K());
  assert.equal(kept.ok, true);
  assert.deepEqual(kept.meta.knowledge.unplacedRefs, ['facility:unknown-9'], 'a ref the graph did not place is reported, not refused');
  const id = kept.meta.knowledge.ids[0];

  /* a later question that names the object by its Wikidata id */
  const byId = await cap('knowledge.recall').run({ refs: ['wikidata:Q555'] }, {}, K());
  assert.equal(byId.meta.knowledge.count, 1); assert.equal(byId.meta.knowledge.claims[0].matchedVia, 'same-object');
  /* …or from what this session has already surfaced */
  const ctx = await cap('knowledge.recall').run({ context: true }, {}, K());
  assert.ok(ctx.meta.knowledge.claims.some((c) => c.id === id));
  assert.equal(ctx.meta.knowledge.claims.find((c) => c.id === id).standing.neverChecked, true);

  /* the plan, then the record */
  const plan = await cap('knowledge.recheck').run({ id }, {}, K());
  assert.equal(plan.meta.knowledge.sources[0].source, 'https://stats.example.org/p');
  const done = await cap('knowledge.recheck').run({ id, results: [{ source: 'https://stats.example.org/p', outcome: 'confirmed', note: 'still 12 Mt' }] }, {}, K());
  assert.equal(done.ok, true); assert.equal(done.meta.knowledge.kind, 'verified');
  const refused = await cap('knowledge.recheck').run({ id, results: [{ source: 'https://stats.example.org/p', outcome: 'confirmed' }] }, {}, K());
  assert.equal(refused.ok, false); assert.equal(refused.meta.code, 'needs_note');

  await cap('knowledge.setting').run({ clear: true, on: false }, {}, K());
  mem.clear();
});
