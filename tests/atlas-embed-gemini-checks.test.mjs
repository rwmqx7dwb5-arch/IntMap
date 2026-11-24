/* ============================================================================
 *  atlas-embed-gemini — the meaning half of find_capability embeds with a provider whose key REACHES
 *  an embedding model, and never compares vectors of two models
 * ----------------------------------------------------------------------------
 *  THE DEFECT (production, 2026-11-20): public.atlas_capability_vectors had 0 rows. atlas-embed only
 *  ever called OpenAI's /v1/embeddings, and this project's OpenAI key lists three models and no
 *  embedding model (/v1/embeddings answers 403). GEMINI_API_KEY was set; news-ingest had already
 *  moved to it. So every seed answered `model_unavailable` and every capability search answered from
 *  spellings alone.
 *
 *  What is held here, by EVALUATING the Edge Function (Deno.serve captured, fetch stubbed with a fake
 *  database and fake providers — the runner shape of tests/edge-spend-and-models-checks), each
 *  scenario in a fresh process (= a fresh isolate):
 *    ① the production keys: OpenAI's list names no embedding model → the Gemini route; the catalogue
 *      is embedded in batches the API accepts, every stored vector is 1536 long and unit length; the
 *      query is embedded by the same model and compared only with that model's rows.
 *    ② the model comes from the provider's list (paged), not from a constant.
 *    ③ a key whose list NAMES a model it is then refused (403): the seed moves to the other route
 *      whole, nothing is stored under the refused model, and a fresh isolate finds the catalogue
 *      under the route that holds it instead of answering «unknown» for ever.
 *    ④ one key: no list is asked; a refused model is answered `model_unavailable`, not compared.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions/atlas-embed');
const core = await import(pathToFileURL(join(FN, 'core.js')).href);
const EP = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/embedding-provider.js')).href);
const AP = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/ai-provider.js')).href);

/* 150 documents: more than one Gemini batch (GEMINI_BATCH_MAX = 100) */
const ENTRIES = Array.from({ length: 150 }, (_, i) => ({ id: 'cap.item' + i, text: 'capability ' + i + ' does thing ' + (i * 7) }));
const CATALOG = await core.catalogueHash(ENTRIES);

const SEARCH = { op: 'search', catalog: CATALOG, q: '現在地' };
const SEED = { op: 'seed', catalog: CATALOG, entries: ENTRIES };

/* One isolate: the handler evaluated in a child process, `requests` sent in order. `world` is the fake:
     openai: { list: { status, ids } , embed: { status } }       (absent = that route answers 404)
     gemini: { pages: [[{ name, methods }]…], embed: { status, nativeDim } }
     db: { "<catalog>|<model>": { <id>: [vector] } }  — carried in and out, so a second isolate can
         start from what the first stored. */
function isolate(env, world, requests) {
  const url = pathToFileURL(join(FN, 'index.ts')).href;
  const src = `
    import { readFileSync } from "node:fs";
    const ENV = ${JSON.stringify({ SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ...env })};
    const W = JSON.parse(readFileSync(0, "utf8"));  /* on stdin: a carried database is megabytes */
    const DB = W.db || {};
    globalThis.Deno = { env: { get: (k) => ENV[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const log = [];
    const reply = (j, s) => new Response(JSON.stringify(j), { status: s || 200, headers: { "content-type": "application/json" } });
    /* a deterministic, deliberately NON-unit vector for a text (so normalisation is observable) */
    const raw = (text, dim) => { let h = 7; for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 100003;
      return Array.from({ length: dim }, (_, i) => 3 + ((h + i * 7919) % 1000) / 250); };
    const parseVec = (lit) => String(lit).slice(1, -1).split(",").map(Number);
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
      if (s.endsWith("/auth/v1/user")) return reply({ id: "u1" });
      if (s.endsWith("/rest/v1/rpc/relay_take")) { log.push({ k: "take", scope: body.p_scope }); return reply([{ allowed: true, remaining: 9 }]); }
      if (s.endsWith("/rpc/atlas_capability_catalog_size")) {
        const t = DB[body.p_catalog + "|" + body.p_model] || {};
        log.push({ k: "size", model: body.p_model }); return reply(Object.keys(t).length);
      }
      if (s.endsWith("/rpc/atlas_capability_seed")) {
        const key = body.p_catalog + "|" + body.p_model;
        const t = DB[key] || (DB[key] = {});
        for (const r of body.p) if (!t[r.id]) t[r.id] = parseVec(r.e);
        log.push({ k: "seed", model: body.p_model, n: body.p.length }); return reply(Object.keys(t).length);
      }
      if (s.endsWith("/rpc/atlas_capability_similarity")) {
        const q = parseVec(body.p_query);
        const t = DB[body.p_catalog + "|" + body.p_model] || {};
        const norm = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
        log.push({ k: "similarity", model: body.p_model, qlen: q.length, qnorm: norm(q) });
        return reply(Object.entries(t).map(([id, v]) => ({ capability_id: id, similarity: v.reduce((a, x, i) => a + x * q[i], 0) / (norm(v) * norm(q)) })));
      }
      if (s === "https://api.openai.com/v1/models") {
        log.push({ k: "openai:list" });
        const L = W.openai && W.openai.list;
        if (!L) return reply({ error: "no" }, 404);
        return reply({ data: (L.ids || []).map((id) => ({ id })) }, L.status || 200);
      }
      if (s === "https://api.openai.com/v1/embeddings") {
        log.push({ k: "openai:embed", model: body.model, n: body.input.length });
        const E = W.openai && W.openai.embed;
        if (!E || (E.status && E.status !== 200)) return reply({ error: { message: "secret org text" } }, (E && E.status) || 404);
        return reply({ data: body.input.map((t, i) => ({ index: i, embedding: raw(t, 1536).map((x) => x / 1000) })) });
      }
      const gl = s.match(/^https:\\/\\/generativelanguage\\.googleapis\\.com\\/v1beta\\/models\\?pageSize=\\d+(?:&pageToken=(.+))?$/);
      if (gl) {
        const page = gl[1] ? Number(decodeURIComponent(gl[1])) : 0;
        log.push({ k: "gemini:list", page });
        const pages = (W.gemini && W.gemini.pages) || [];
        const ms = (pages[page] || []).map((m) => ({ name: "models/" + m.name, supportedGenerationMethods: m.methods }));
        return reply(page + 1 < pages.length ? { models: ms, nextPageToken: String(page + 1) } : { models: ms });
      }
      const ge = s.match(/^https:\\/\\/generativelanguage\\.googleapis\\.com\\/v1beta\\/models\\/([^:]+):batchEmbedContents$/);
      if (ge) {
        const reqs = body.requests || [];
        log.push({ k: "gemini:embed", model: decodeURIComponent(ge[1]), n: reqs.length,
          reqModels: [...new Set(reqs.map((r) => r.model))], tasks: [...new Set(reqs.map((r) => r.taskType))], dims: [...new Set(reqs.map((r) => r.outputDimensionality))] });
        const E = W.gemini && W.gemini.embed;
        if (E && E.status && E.status !== 200) return reply({ error: "no" }, E.status);
        return reply({ embeddings: reqs.map((r) => ({ values: raw(r.content.parts[0].text, r.outputDimensionality || (E && E.nativeDim) || 3072) })) });
      }
      throw new Error("unexpected fetch " + s);
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = log.length;
      const r = await globalThis.__h(new Request("https://fn.test/atlas-embed", { method: "POST",
        headers: { authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify(q) }));
      let json = null; try { json = await r.json(); } catch (_) { json = null; }
      out.push({ status: r.status, json, log: log.slice(before) });
    }
    /* the stored vectors' shape, per model key (lengths and norms, not the numbers) */
    const shape = {};
    for (const [k, t] of Object.entries(DB)) {
      const vs = Object.values(t);
      shape[k] = { n: vs.length, lens: [...new Set(vs.map((v) => v.length))], norms: vs.map((v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0))) };
    }
    /* ⚠ exit only once the write has drained: on Linux a pipe is asynchronous, and exit() right after write() cut the
       JSON at 146 kB on CI (Windows pipes are synchronous, so it passed locally) */
    process.stdout.write(JSON.stringify({ out, db: DB, shape }), () => process.exit(0));
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', input: JSON.stringify(world), stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(raw);
}

const kinds = (log) => log.map((x) => x.k);
const unit = (n) => Math.abs(n - 1) < 1e-9;
const EMBED_METHODS = ['embedContent', 'batchEmbedContents'];
const CHAT_METHODS = ['generateContent', 'countTokens'];
const G = AP.GEMINI_EMBEDDING_MODEL;

/* the production keys and lists (2026-11-20): the OpenAI key lists 3 models, none an embedding model */
const PROD = {
  openai: { list: { ids: ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna'] }, embed: { status: 403 } },
  gemini: { pages: [[{ name: 'gemini-3.5-flash', methods: CHAT_METHODS }, { name: 'text-embedding-004', methods: EMBED_METHODS }, { name: G, methods: EMBED_METHODS }]] },
};
const BOTH = { OPENAI_API_KEY: 'sk-stub', GEMINI_API_KEY: 'g-stub' };

test('atlas-embed-gemini ① production keys: OpenAI lists no embedding model → Gemini; 1536-long unit vectors; query and catalogue by one model', () => {
  const { out, shape } = isolate(BOTH, PROD, [SEARCH, SEED, SEARCH]);
  const [unknown, seeded, found] = out;

  /* the catalogue is unknown, and the key it is unknown under is Gemini's — decided from the lists */
  assert.equal(unknown.status, 200, JSON.stringify(unknown.json));
  assert.equal(unknown.json.state, 'catalog_unknown');
  const KEY = unknown.json.model;
  assert.ok(KEY.startsWith(G + '@1536'), 'stored key is the listed Gemini model at 1536: ' + KEY);
  assert.deepEqual(kinds(unknown.log).filter((k) => k.endsWith(':list')).sort(), ['gemini:list', 'openai:list'], 'both lists asked once');
  assert.ok(!kinds(unknown.log).some((k) => k.endsWith(':embed')), 'an unknown catalogue embeds nothing');

  /* the seed: Gemini, in batches the API accepts, documents as documents, at 1536 */
  assert.equal(seeded.status, 200, JSON.stringify(seeded.json));
  assert.equal(seeded.json.state, 'ok');
  assert.equal(seeded.json.stored, ENTRIES.length);
  assert.equal(seeded.json.model, KEY);
  const gb = seeded.log.filter((x) => x.k === 'gemini:embed');
  assert.deepEqual(gb.map((x) => x.n), [100, 50], 'no batch above GEMINI_BATCH_MAX');
  for (const b of gb) {
    assert.equal(b.model, G);
    assert.deepEqual(b.reqModels, ['models/' + G]);
    assert.deepEqual(b.tasks, ['RETRIEVAL_DOCUMENT']);
    assert.deepEqual(b.dims, [1536]);
  }
  assert.ok(!kinds(seeded.log).some((k) => k.startsWith('openai')), 'OpenAI is not asked again: the route is remembered');
  assert.ok(!kinds(seeded.log).some((k) => k.endsWith(':list')), 'the lists are not asked again');
  assert.deepEqual(seeded.log.filter((x) => x.k === 'seed').map((x) => x.model), [KEY]);

  /* what was stored: one model, 1536 long, unit length */
  assert.deepEqual(Object.keys(shape), [CATALOG + '|' + KEY], 'one catalogue under one model');
  const sh = shape[CATALOG + '|' + KEY];
  assert.equal(sh.n, ENTRIES.length);
  assert.deepEqual(sh.lens, [1536]);
  assert.ok(sh.norms.every(unit), 'every stored vector is unit length');

  /* the search: the SAME model embeds the query, as a query, and is compared only with its own rows */
  assert.equal(found.json.state, 'ok', JSON.stringify(found.json));
  assert.equal(found.json.model, KEY);
  assert.equal(Object.keys(found.json.sims).length, ENTRIES.length);
  const q = found.log.find((x) => x.k === 'gemini:embed');
  assert.equal(q.model, G);
  assert.deepEqual(q.tasks, ['RETRIEVAL_QUERY']);
  assert.deepEqual(q.dims, [1536]);
  const sim = found.log.find((x) => x.k === 'similarity');
  assert.equal(sim.model, KEY, 'compared under the key the catalogue was stored under');
  assert.equal(sim.qlen, 1536);
  assert.ok(unit(sim.qnorm), 'the query vector is unit length');
  assert.ok(!kinds(found.log).some((k) => k.startsWith('openai')));
  assert.deepEqual(found.log.filter((x) => x.k === 'size').map((x) => x.model), [KEY]);
});

test('atlas-embed-gemini ① (the stub is not vacuous) Gemini\'s raw vectors are not unit length — the normalisation is what makes them so', () => {
  const v = Array.from({ length: 1536 }, (_, i) => 3 + (i % 7));
  assert.ok(!unit(Math.sqrt(v.reduce((a, x) => a + x * x, 0))));
  const n = EP.l2normalize(v);
  assert.ok(unit(Math.sqrt(n.reduce((a, x) => a + x * x, 0))));
  assert.deepEqual(EP.l2normalize([0, 0]), [0, 0], 'a zero vector is not divided by zero');
});

test('atlas-embed-gemini ② the model is the one the provider lists (paged), not a constant', () => {
  const NEXT = 'gemini-embedding-2';
  const world = {
    openai: PROD.openai,
    gemini: { pages: [[{ name: 'gemini-3.5-flash', methods: CHAT_METHODS }], [{ name: 'text-embedding-004', methods: EMBED_METHODS }, { name: NEXT, methods: EMBED_METHODS }]] },
  };
  const { out } = isolate(BOTH, world, [SEARCH]);
  assert.equal(out[0].json.state, 'catalog_unknown');
  assert.ok(out[0].json.model.startsWith(NEXT + '@1536'), out[0].json.model);
  assert.deepEqual(out[0].log.filter((x) => x.k === 'gemini:list').map((x) => x.page), [0, 1], 'the second page was read');

  /* and the pick itself: the preference where the list names it, else the multilingual family, else the first */
  assert.equal(EP.pickEmbeddingModel('gemini', ['text-embedding-004', G], [G]), G);
  assert.equal(EP.pickEmbeddingModel('gemini', ['text-embedding-004', NEXT], [G]), NEXT);
  assert.equal(EP.pickEmbeddingModel('gemini', ['text-embedding-004'], [G]), 'text-embedding-004');
  assert.equal(EP.pickEmbeddingModel('gemini', [G], [G], (id) => id === G), null, 'a model seen to fail is not picked again');
});

test('atlas-embed-gemini ② a key whose list does name an embedding model keeps the OpenAI route', () => {
  const world = { openai: { list: { ids: ['gpt-6.2-sol', 'text-embedding-3-small'] }, embed: { status: 200 } }, gemini: PROD.gemini };
  const { out, shape } = isolate(BOTH, world, [SEARCH, SEED, SEARCH]);
  assert.equal(out[0].json.model, 'text-embedding-3-small');
  assert.equal(out[1].json.state, 'ok');
  assert.equal(out[2].json.state, 'ok');
  assert.deepEqual(Object.keys(shape), [CATALOG + '|text-embedding-3-small']);
  assert.ok(!out.some((o) => kinds(o.log).includes('gemini:embed')));
});

test('atlas-embed-gemini ③ a listed model the key is refused: the seed moves whole, and a fresh isolate finds it', () => {
  const world = { openai: { list: { ids: ['text-embedding-3-small'] }, embed: { status: 403 } }, gemini: PROD.gemini };
  const first = isolate(BOTH, world, [SEARCH, SEED, SEARCH]);
  const [unknown, seeded, found] = first.out;
  assert.equal(unknown.json.state, 'catalog_unknown');
  assert.equal(unknown.json.model, 'text-embedding-3-small', 'the lists named OpenAI\'s model first');

  assert.equal(seeded.json.state, 'ok', JSON.stringify(seeded.json));
  assert.equal(seeded.json.stored, ENTRIES.length);
  assert.ok(seeded.json.model.startsWith(G + '@1536'), seeded.json.model);
  const order = kinds(seeded.log);
  assert.ok(order.indexOf('openai:embed') < order.indexOf('gemini:embed'), 'refused first, then moved: ' + order.join(' '));
  assert.equal(order.filter((k) => k === 'openai:embed').length, 1, 'the refused model is asked once, not again');
  /* nothing stored under the refused model; everything under one */
  assert.deepEqual(Object.keys(first.shape), [CATALOG + '|' + seeded.json.model]);
  assert.ok(first.shape[CATALOG + '|' + seeded.json.model].norms.every(unit));

  assert.equal(found.json.state, 'ok');
  assert.equal(found.json.model, seeded.json.model);
  assert.ok(!kinds(found.log).includes('openai:embed'), 'this isolate remembers the refusal');

  /* a FRESH isolate does not know the refusal; it must still find the catalogue, not say «unknown» */
  const fresh = isolate(BOTH, { ...world, db: first.db }, [SEARCH]);
  const f = fresh.out[0];
  assert.equal(f.json.state, 'ok', JSON.stringify(f.json));
  assert.equal(f.json.model, seeded.json.model);
  assert.deepEqual(f.log.filter((x) => x.k === 'size').map((x) => x.model), ['text-embedding-3-small', seeded.json.model]);
  assert.ok(!kinds(f.log).includes('openai:embed'), 'the query is embedded by the model that holds the catalogue');
  assert.equal(f.log.find((x) => x.k === 'similarity').model, seeded.json.model);
});

test('atlas-embed-gemini ④ one key: no list on the way in; a refused model is not compared with anything', () => {
  /* Gemini alone: its default from the one model table, no list asked */
  const g = isolate({ GEMINI_API_KEY: 'g-stub' }, { gemini: PROD.gemini }, [SEARCH, SEED, SEARCH]);
  assert.equal(g.out[0].json.state, 'catalog_unknown');
  assert.ok(!kinds(g.out[0].log).some((k) => k.endsWith(':list')));
  assert.equal(g.out[1].json.state, 'ok');
  assert.equal(g.out[2].json.state, 'ok');
  assert.ok(g.out[2].json.model.startsWith(G + '@1536'));

  /* OpenAI alone, refused, and its list names nothing else: model_unavailable, nothing stored */
  const o = isolate({ OPENAI_API_KEY: 'sk-stub' }, { openai: PROD.openai }, [SEED]);
  assert.equal(o.out[0].status, 502);
  assert.equal(o.out[0].json.state, 'model_unavailable');
  assert.deepEqual(Object.keys(o.shape), []);
  assert.ok(!JSON.stringify(o.out[0].json).includes('secret'), 'the provider\'s words are not carried');
  assert.ok(kinds(o.out[0].log).includes('openai:list'), 'after the refusal the list was asked for another model');
  /* (atlas-embed-diag) the 502 says WHY in facts — which list was read and what it named, which model refused with what status */
  const dg = o.out[0].json.diag;
  assert.ok(dg && Array.isArray(dg.lists) && dg.lists.some((L) => L.provider === 'openai' && L.answered === true), 'the list that was read is named: ' + JSON.stringify(dg));
  assert.equal(dg.refused && dg.refused.provider, 'openai');
  assert.equal(dg.refused && dg.refused.status, 403);

  /* no key at all */
  const none = isolate({}, {}, [SEARCH]);
  assert.equal(none.out[0].status, 503);
  assert.equal(none.out[0].json.state, 'unconfigured');
});

test('atlas-embed-gemini batches: a provider\'s per-call input bound splits the catalogue, order kept', () => {
  const b = core.batches(ENTRIES, EP.GEMINI_BATCH_MAX);
  assert.deepEqual(b.map((x) => x.length), [100, 50]);
  assert.deepEqual(b.flat().map((e) => e.id), ENTRIES.map((e) => e.id));
  assert.deepEqual(core.batches(ENTRIES).map((x) => x.length), [150], 'without a bound, characters alone decide (as before)');
});
