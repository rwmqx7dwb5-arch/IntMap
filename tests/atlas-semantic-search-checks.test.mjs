/* atlas-semantic-search — find_capability matched spellings only; a request that MEANT a capability in words it did not
 * share reached nothing, or reached it behind the alphabet.
 *
 * Measured (DEV-NOTES #R802, production; and this checkout before the change):
 *   · three Japanese requests ran ZERO operations on production;
 *   · 「現在地」 ranked view.locate FOURTH, behind navigation.camera, routing.isochrone and map.radius —
 *     equal `self`, and the tie was decided by `localeCompare` on the id;
 *   · 「地図を現代に戻す」 matched nothing, although time.travel {"now":true} is exactly that.
 *
 * Each assertion states the DEFECT ([[intmap-restate-the-defect-not-the-fix]]). There is no network
 * here, so the meaning half is a DETERMINISTIC fake embedding (below) bound through the same
 * `bindRuntime({ semantic })` door the default transport fills — what is evaluated is the fusion,
 * the threshold, the reporting and the wire contract, all as running code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const core = await import(pathToFileURL(join(ROOT, 'supabase/functions/atlas-embed/core.js')).href);

/* ══ THE FAKE EMBEDDING ════════════════════════════════════════════════════════════════════════════
   What a multilingual model provides that spellings cannot: a Japanese phrase and an English one that
   MEAN the same thing land on the same direction. Modelled as a few concept axes, each reached by
   surface forms in both languages, plus a signed character-trigram hash for «everything else the
   text says» (signed, so unrelated texts are near-orthogonal rather than all alike). Deterministic.
   It is a fixture for the fusion logic, not a claim about the real model's geometry. */
const CONCEPTS = [
  ['現在地', '今いる場所', 'my location', 'where am i'],
  ['現代に戻', '今日に戻', 'back to the present', 'back to today', '"now":true'],
  ['天気', '予報', 'weather', 'forecast'],
];
const HASH_DIM = 64, BG = 0.05;
function fakeEmbed(text) {
  const t = String(text).toLowerCase();
  const v = new Array(CONCEPTS.length + HASH_DIM).fill(0);
  CONCEPTS.forEach((forms, i) => { for (const f of forms) { let k = t.indexOf(f); while (k >= 0) { v[i] += 1; k = t.indexOf(f, k + 1); } } });
  for (let i = 0; i + 3 <= t.length; i++) {
    let h = 2166136261;
    for (let j = i; j < i + 3; j++) { h ^= t.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; }
    v[CONCEPTS.length + (h % HASH_DIM)] += ((h >>> 16) & 1 ? 1 : -1) * BG;
  }
  return v;
}
const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? d / Math.sqrt(na * nb) : 0;
};
/* the fake SERVER: embeds the catalogue it is handed (as atlas-embed does on seed) and answers one
   similarity per capability (as atlas_capability_similarity does) */
function fakeTransport() {
  const store = new Map();
  const calls = [];
  const fn = async (q, cat) => {
    calls.push(q);
    if (!store.has(cat.hash)) store.set(cat.hash, cat.entries.map((e) => [e.id, fakeEmbed(e.text)]));
    const qv = fakeEmbed(q), sims = {};
    for (const [id, v] of store.get(cat.hash)) sims[id] = cos(qv, v);
    return { state: 'ok', model: 'fake', sims };
  };
  fn.calls = calls;
  return fn;
}

function registry(semantic) {
  const CAPS = makeAtlasCapabilities({});
  CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}), semantic });
  return CAPS;
}
const ids = (r, n) => r.ranked.slice(0, n || r.ranked.length).map((x) => x.id);

/* ══ ① A JAPANESE REQUEST REACHES WHAT THE ENGLISH ONE REACHES ═════════════════════════════════════ */
test('atlas-semantic-search ① a request in Japanese reaches the same capability as the same request in English', async () => {
  const CAPS = registry(fakeTransport());
  for (const [ja, en, want] of [
    ['現在地', 'where am i', 'view.locate'],
    ['地図を現代に戻して', 'take the map back to the present', 'time.travel'],
    ['東京の天気予報', 'weather forecast for Tokyo', 'data.weather'],
  ]) {
    const J = await CAPS.searchFused(ja, { want: 3, min: 1 });
    const E = await CAPS.searchFused(en, { want: 3, min: 1 });
    assert.equal(J.basis, 'lexical+semantic', ja + ' was answered with the meaning half');
    assert.equal(ids(E, 1)[0], want, en + ' → ' + ids(E, 5).join(', '));
    assert.equal(ids(J, 1)[0], want, ja + ' → ' + (ids(J, 5).join(', ') || '(nothing)'));
  }
});

test('atlas-semantic-search ① (the defect, restated) spellings alone put view.locate behind the alphabet and found nothing for 「地図を現代に戻す」', () => {
  const CAPS = registry(fakeTransport());
  const here = CAPS.search('現在地', { want: 3, min: 1 });
  assert.notEqual(ids(here, 1)[0], 'view.locate', 'this is the case the meaning half exists for; if spellings now reach it, restate ① ');
  assert.deepEqual(ids(CAPS.search('地図を現代に戻す', { want: 3, min: 1 })), [], 'spellings alone reach nothing for it');
});

/* ══ ② «COULD NOT ASK» IS NOT «NOTHING MEANS THIS» ════════════════════════════════════════════════ */
test('atlas-semantic-search ② when the meaning half cannot be consulted, the result says so — and says why', async () => {
  /* the default transport in a context with no endpoint (this process has no window) */
  const plain = makeAtlasCapabilities({});
  plain.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
  const cases = [
    [plain, 'no_endpoint'],
    [registry(async () => ({ state: 'signed_out' })), 'signed_out'],
    [registry(async () => { throw new Error('network'); }), 'unreachable'],
    [registry(async () => ({ state: 'model_unavailable' })), 'model_unavailable'],
    [registry(() => new Promise(() => {})), 'timeout'],
  ];
  for (const [CAPS, reason] of cases) {
    const r = await CAPS.searchFused('where am i', { want: 3, min: 1, timeoutMs: 50 });
    assert.equal(r.basis, 'lexical', reason + ': answered from spellings');
    assert.equal(r.semantic.state, 'unavailable', reason + ': and says the meaning half was unavailable');
    assert.equal(r.semantic.reason, reason, 'the reason is carried');
    assert.equal(ids(r, 1)[0], 'view.locate', reason + ': the lexical answer is still given in full');
  }
  /* and the synchronous door states that it never asked */
  const s = plain.search('where am i');
  assert.equal(s.basis, 'lexical');
  assert.equal(s.semantic.state, 'not_consulted');
});

test('atlas-semantic-search ② an empty answer that WAS consulted differs from one that could not be', async () => {
  const asked = await registry(fakeTransport()).searchFused('ありがとう', { want: 3, min: 1 });
  const notAsked = await registry(async () => ({ state: 'timeout' })).searchFused('ありがとう', { want: 3, min: 1 });
  assert.deepEqual(ids(asked), [], 'a thank-you still matches nothing (#R745, #R802 ③) — the nearest capability is not a match');
  assert.deepEqual(ids(notAsked), []);
  assert.notDeepEqual([asked.basis, asked.semantic.state], [notAsked.basis, notAsked.semantic.state],
    'the two empty lists carry different statements about what was looked at');
  assert.equal(asked.semantic.state, 'ok');
  assert.equal(asked.semantic.candidates, 0);
  assert.ok(asked.semantic.compared >= 100, 'it compared against the whole registry (' + asked.semantic.compared + ')');
});

/* ══ ③ THE ORDER OF EQUALS HAS A REASON OTHER THAN THE SPELLING ════════════════════════════════════ */
test('atlas-semantic-search ③ every adjacent pair is ordered by evidence, or is a declared tie', async () => {
  const CAPS = registry(fakeTransport());
  const cmp = (a, b) => b.self - a.self || b.score - a.score || (b.terms || 0) - (a.terms || 0);
  for (const q of ['現在地', '現在地から大阪駅までの経路', '東京から大阪までの鉄道ルート', 'nuclear power plants worldwide', '表示']) {
    const r = CAPS.search(q, { want: 3, min: 1 }).ranked;
    for (let i = 1; i < r.length; i++) {
      if (r[i].rank === r[i - 1].rank) continue;                     /* declared: nothing in the request separates them */
      assert.ok(cmp(r[i - 1], r[i]) < 0, q + ': ' + r[i - 1].id + ' before ' + r[i].id + ' with equal evidence and different ranks');
    }
  }
  /* 「現在地」: the four rows the alphabet used to order are ONE declared tie lexically … */
  const lex = CAPS.search('現在地', { want: 3, min: 1 }).ranked;
  const tied = lex.filter((x) => x.rank === lex.find((y) => y.id === 'view.locate').rank);
  assert.ok(tied.length >= 2 && tied.some((x) => x.id !== 'view.locate'), 'view.locate shares its lexical rank');
  /* … and the meaning of the request is what separates them */
  const fused = (await CAPS.searchFused('現在地', { want: 3, min: 1 })).ranked;
  assert.equal(fused[0].id, 'view.locate');
  assert.ok(fused[0].semantic && fused[0].rank < fused[1].rank, 'decided by the meaning half, not declared equal');
});

test('atlas-semantic-search ③ reversing the spelling order of the registry does not reorder rows that differ in evidence', async () => {
  const CAPS = registry(fakeTransport());
  for (const q of ['現在地', 'weather forecast for Tokyo', '東京から大阪までの鉄道ルート']) {
    const r = (await CAPS.searchFused(q, { want: 3, min: 1 })).ranked;
    const byRank = new Map();
    r.forEach((x) => { (byRank.get(x.rank) || byRank.set(x.rank, []).get(x.rank)).push(x.id); });
    const ranks = [...byRank.keys()];
    assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b), q + ': ranks ascend');
    /* within a rank the ids are a SET (declared tie); across ranks the order is the ranking */
    const alpha = r.slice().sort((a, b) => a.rank - b.rank || b.id.localeCompare(a.id)).map((x) => x.rank);
    assert.deepEqual(alpha, r.map((x) => x.rank), q + ': any spelling order inside a tie yields the same ranking');
  }
});

/* ══ ④ THE WIRE: one key on both sides, and a key that cannot be claimed for other text ═════════════ */
test('atlas-semantic-search ④ the page and the Edge Function compute the same catalogue key, and the server refuses a key that is not the text\'s', async () => {
  const CAPS = registry(fakeTransport());
  const cat = await CAPS.semanticCatalogue();
  assert.ok(cat && /^[0-9a-f]{64}$/.test(cat.hash));
  assert.equal(await core.catalogueHash(cat.entries), cat.hash, 'browser and server agree on the key');
  assert.equal(CAPS.SEMANTIC_MAX_DOC_CHARS, core.MAX_DOC_CHARS, 'the page cuts documents at the length the server accepts');
  assert.ok(cat.entries.every((e) => e.text.length <= core.MAX_DOC_CHARS && e.text.trim()));
  assert.equal(cat.entries.length, CAPS.all().filter((c) => !c.withdrawn).length, 'every live capability is embedded — none is left for spellings only');
  const ok = await core.parseSeed({ catalog: cat.hash, entries: cat.entries });
  assert.equal(ok.ok, true, ok.code);
  const tampered = cat.entries.map((e, i) => (i ? e : { id: e.id, text: e.text + ' (anything)' }));
  const bad = await core.parseSeed({ catalog: cat.hash, entries: tampered });
  assert.deepEqual([bad.ok, bad.code], [false, 'catalog_mismatch']);
  assert.equal(core.parseSearch({ catalog: cat.hash, q: 'x'.repeat(core.MAX_QUERY_CHARS + 1) }).code, 'query_too_long', 'a long query is refused, not truncated');
});

/* ══ ⑤ THE EDGE FUNCTION, EVALUATED (Deno.serve and fetch stubbed) ═════════════════════════════════ */
test('atlas-semantic-search ⑤ atlas-embed: login required, an unknown catalogue costs nothing upstream, and the limiter runs before OpenAI', async () => {
  const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', OPENAI_API_KEY: 'sk-stub' };
  let HANDLER = null;
  globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: (h) => { HANDLER = h; } };
  await import(pathToFileURL(join(ROOT, 'supabase/functions/atlas-embed/index.ts')).href);
  assert.equal(typeof HANDLER, 'function');

  const log = [];
  let stored = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url), body = init && init.body ? JSON.parse(init.body) : null;
    const reply = (j, s) => new Response(JSON.stringify(j), { status: s || 200, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/auth/v1/user')) { log.push('auth'); return /good/.test(init.headers.authorization) ? reply({ id: 'u1' }) : reply({}, 401); }
    if (u.includes('/rpc/relay_take')) { log.push('take:' + body.p_scope); return reply([{ allowed: true, remaining: 1 }]); }
    if (u.includes('/rpc/atlas_capability_catalog_size')) { log.push('size'); return reply(stored); }
    if (u.includes('/rpc/atlas_capability_similarity')) { log.push('similarity'); return reply([{ capability_id: 'view.locate', similarity: 0.5 }]); }
    if (u.includes('/rpc/atlas_capability_seed')) { log.push('seed'); stored = body.p.length; return reply(stored); }
    if (u.includes('api.openai.com/v1/embeddings')) {
      log.push('openai:' + body.input.length);
      return reply({ data: body.input.map((_, i) => ({ index: i, embedding: new Array(core.EMBED_DIM).fill(0.01) })) });
    }
    throw new Error('unexpected fetch ' + u);
  };
  const call = (tok, body) => HANDLER(new Request('https://fn.test/atlas-embed', {
    method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  try {
    const cat = await registry(fakeTransport()).semanticCatalogue();

    let r = await call('bad', { op: 'search', catalog: cat.hash, q: '現在地' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).state, 'signed_out');
    assert.ok(!log.some((x) => x.startsWith('openai')), 'no upstream call without a user');

    log.length = 0;
    r = await call('good', { op: 'search', catalog: cat.hash, q: '現在地' });
    assert.equal((await r.json()).state, 'catalog_unknown');
    assert.ok(!log.some((x) => x.startsWith('openai')), 'an unknown catalogue is reported before the query is embedded: ' + log.join(' '));

    log.length = 0;
    r = await call('good', { op: 'seed', catalog: cat.hash, entries: cat.entries });
    const seeded = await r.json();
    assert.equal(seeded.state, 'ok');
    assert.equal(seeded.stored, cat.entries.length);
    assert.ok(log.indexOf('take:atlas-embed:global:day') < log.findIndex((x) => x.startsWith('openai')), 'the ceiling is taken before the paid call: ' + log.join(' '));

    log.length = 0;
    r = await call('good', { op: 'seed', catalog: cat.hash, entries: cat.entries });
    assert.equal((await r.json()).already, true, 'a second seed of the same catalogue is idempotent');
    assert.ok(!log.some((x) => x.startsWith('openai')), '…and costs nothing upstream');

    log.length = 0;
    r = await call('good', { op: 'search', catalog: cat.hash, q: '現在地' });
    const j = await r.json();
    assert.equal(j.state, 'ok');
    assert.equal(j.sims['view.locate'], 0.5);
    assert.deepEqual(log, ['auth', 'take:atlas-embed:user', 'size', 'take:atlas-embed:global:day', 'openai:1', 'similarity']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
