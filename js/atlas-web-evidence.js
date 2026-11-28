/* ============================================================================
 *  IntMap · ATLAS — THE SESSION'S WEB EVIDENCE STORE   (js/atlas-web-evidence.js)        (atlas-search-evidence-store)
 * ----------------------------------------------------------------------------
 *  WHAT IT IS. One store, per page session, that every reader of the web in Atlas writes to and asks first: a page the light reader
 *  opened, a page the real browser rendered, a web search that ran, a source a hosted search cited. The parent turn and every
 *  delegated child run in the same page, so they share this ONE instance (`webEvidence`, bottom of file) — a page the parent
 *  read is not read again by a child, two children asking for the same address share one request, and a search that was run
 *  is not run again while its answer is fresh.
 *
 *  WHY. Measured on production (public.ai_delegation_journal, 2026-11-18 → 25): of 479 parent calls 56% carried a web search, a call
 *  that searched took 8–36 s and one that did not took 2–3 s, and the hosted search runs one query after another INSIDE the
 *  provider's call (38 / 18 / 26 / 46 s in a single reply — js/atlas-toolsurface.js). Nothing in the page remembered a result:
 *  the same country's population was searched four times, the same portal page opened again by the next worker.
 *
 *  WHAT IT IS NOT.
 *   · Not the answer's source registry. js/atlas-evidence.js is per CALL and decides which source an ANSWER may cite; this is per
 *     SESSION and decides whether a FETCH has to happen. A record here is not a citation until it reaches that registry.
 *   · Not a refusal. A repeat is answered from the store with where and when the first came from (`reused`), never refused
 *     (one-pass-or-a-reason.md §1 — the shape js/atlas-turn-results.js callKey already has). `refresh:true` fetches again.
 *   · Not a cap. Nothing here limits how many pages or searches Atlas may make; MAX_ENTRIES only bounds memory, and
 *     drops the entry least recently used.
 *
 *  FRESHNESS. A record is reused only inside its time to live. The numbers are the page's own choice of how stale a read may be
 *  and each is stated where it is used (TTL below); a record past it is fetched again; an expired one is never served as current
 *  (list() leaves it out unless asked, find()/acquire() do not see it).
 *
 *  WHO FETCHED IT AND WHO USED IT ARE TWO FACTS (atlas-completion-verdict). A record keeps the turn that fetched it (`fetchedTurn`, with
 *  `fetchedAt`) apart from every turn that was handed it (`usedBy`): a search run in turn 1 and asked again in turn 2 is answered from
 *  here, and turn 2's answer cites it, because turnSources() lists what a turn USED, not only what it fetched. A turn is named by its
 *  caller (opts / ctx `turn`); a caller that names none adds no use.
 *  WHEN THE TURN USED IT. `evidence_used` (js/atlas-turn-metrics.js markTurn, first time only) is the moment a record is handed to the
 *  turn's OWN reader: an operation Atlas ran (fetched, joined, answered from here, re-read with web.evidence) or the turn's answer
 *  call taking the turn's sources (turnSources(turn, { use:true })). A delegated worker's read (ctx `worker:true`) is the worker's use,
 *  not the parent's: it is recorded in usedBy, and the parent's moment is marked when the parent itself takes the record.
 *
 *  IDENTITY. An address is compared by the ONE canonicaliser the answer registry already owns (js/atlas-evidence.js canonicalizeUrl:
 *  lower-case host, no fragment, no campaign parameters, no trailing slash). A query is compared by its words, not its spelling
 *  (case, width, spacing, edge punctuation).
 * ==========================================================================*/
import { makeAtlasEvidence } from './atlas-evidence.js';
import { markTurn } from './atlas-turn-metrics.js';   /* the moment a fetched source reaches the page (`evidence_arrived`) and the moment the turn itself first takes one in hand (`evidence_used`): acquire() and use() below */

/* Time to live, per kind — an OBSERVATION-FREE CHOICE, not a measured number: a portal page and a rendered page do not change inside
   ten minutes of one conversation, while a search's answer can (news) and so lives shorter. Expires: when the journal's per-call
   timings (web_searches, latency_ms) show a repeat inside these windows that the reader needed fresh — then the kind that was wrong
   is changed here, the one place. */
const TTL = Object.freeze({ page: 10 * 60e3, render: 10 * 60e3, search: 5 * 60e3, cited: 60 * 60e3 });
const MAX_ENTRIES = 300;   /* memory only (a record holds one page snapshot, a few KB to ~30 KB); least recently used goes first */
const MAX_TEXT_CHARS = 24000;   /* what read() may hand back at most — web.browse's own textChars ceiling (js/atlas-cap-web.js) */

/** a query's identity: its words (Unicode-folded, lower-cased, whitespace collapsed, edge punctuation off) */
export function queryKey(q, lang) {
  let s = String(q == null ? '' : q);
  try { s = s.normalize('NFKC'); } catch (_) { /* old engine */ }
  const words = s.toLowerCase().replace(/\s+/g, ' ').replace(/^[\s"'“”‘’.,;:!?、。！？]+|[\s"'“”‘’.,;:!?、。！？]+$/g, '');
  return JSON.stringify([words, String(lang || '').trim().toLowerCase()]);
}

export function makeWebEvidence(opt) {
  const o = opt || {};
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const ttl = Object.assign({}, TTL, o.ttl || {});
  const canon = makeAtlasEvidence().canonicalizeUrl;
  const byId = new Map();       /* id → entry */
  const byKey = new Map();      /* kind + ':' + key → id */
  const inflight = new Map();   /* kind + ':' + key → Promise<entry-or-result> */
  const sourcesByTurn = new Map(); /* lightweight snapshots survive the eviction of large response bodies */
  let seq = 0;

  const urlKey = (u) => { const c = canon(u); return c && c.ok ? c.key : ''; };
  const slot = (kind, key) => kind + ':' + key;
  const age = (e) => Math.max(0, now() - e.fetchedAt);
  const fresh = (e) => now() < e.expiresAt;
  function touch(e) { e.usedAt = now(); e.hits += 1; }
  /* use(e, ctx) — the turn ctx.turn was handed this record. Recorded once per turn; the parent's first use of any record marks evidence_used. */
  function use(e, ctx) {
    const c = ctx || {};
    const turn = String(c.turn || '');
    if (!e || !turn) return;
    if (!e.usedBy.includes(turn)) {
      e.usedBy.push(turn);
      const cited = e.kind === 'search' ? e.sources : [{ url: e.url, title: e.title }, ...e.sources];
      let sources = sourcesByTurn.get(turn);
      for (const s of cited) {
        const key = urlKey(s.url);
        if (!key) continue;
        if (!sources) {
          sources = new Map();
          sourcesByTurn.set(turn, sources);
          if (sourcesByTurn.size > MAX_ENTRIES) sourcesByTurn.delete(sourcesByTurn.keys().next().value);
        }
        const isDocument = e.kind === 'page' || e.kind === 'render';
        const sourceKey = isDocument ? JSON.stringify([key, e.id]) : key;
        if (!sources.has(sourceKey)) sources.set(sourceKey, {
          url: s.url, title: s.title || '', publisher: '', retrievedAt: new Date(e.fetchedAt).toISOString(),
          ...(isDocument ? { sourceVersion: e.id } : {}),
        });
      }
    }
    if (!c.worker) markTurn('evidence_used', turn);
  }
  function evict() {
    while (byId.size > MAX_ENTRIES) {
      let oldest = null;
      byId.forEach((e) => { if (!oldest || e.usedAt < oldest.usedAt) oldest = e; });
      if (!oldest) break;
      byId.delete(oldest.id);
      if (byKey.get(slot(oldest.kind, oldest.key)) === oldest.id) byKey.delete(slot(oldest.kind, oldest.key));
    }
  }
  function put(kind, key, fields, ttlMs) {
    const t = now();
    /* Re-fetching moves only the cache pointer. Earlier ids and the turns that read them still describe their original fetch. */
    const version = ++seq;
    const e = Object.assign({ id: 'ev' + version, version, kind, key, fetchedAt: t, expiresAt: t + (ttlMs == null ? ttl[kind] : ttlMs), usedAt: t, hits: 0, fetchedTurn: '', usedBy: [] }, fields);
    byId.set(e.id, e);
    byKey.set(slot(kind, key), e.id);
    evict();
    return e;
  }

  /** the freshest record for (kind, key), or null */
  function find(kind, key) {
    const e = byId.get(byKey.get(slot(kind, key)));
    return e && fresh(e) ? e : null;
  }

  /* acquire(kind, key, fetcher, opts) — THE ONE DOOR for a fetch.
       a fresh record that `fits` the request → returned, how:'stored'
       the same fetch already running           → its promise is joined, how:'joined'
       otherwise                                → fetcher() runs once; an `ok` result is stored, how:'fetched'
     `fetcher` returns { ok, value, title?, url?, text?, sources? }; only ok:true is kept (a failure is shared with the callers that
     were waiting on it and with no one after — the next call tries again, which is the retry after a REAL failure the rule allows).
     opts: refresh (skip the store), fits(entry) (is the stored one enough for THIS request), ttlMs, turn (the turn this read is for: the
     record's `usedBy` gains it whichever way it was answered, and a fetch records it as `fetchedTurn`), worker (the reader is a delegated
     worker, not the parent: see use()). A fetcher's own `result.turn` names the turn when opts does not. */
  async function acquire(kind, key, fetcher, opts) {
    const p = opts || {};
    const k = slot(kind, key);
    if (!p.refresh) {
      const hit = find(kind, key);
      if (hit && (typeof p.fits !== 'function' || p.fits(hit))) { touch(hit); use(hit, p); return { entry: hit, how: 'stored', result: null }; }
      if (inflight.has(k)) {
        const r = await inflight.get(k);
        use(r.entry, p);
        return { entry: r.entry, how: 'joined', result: r.result };
      }
    }
    const run = (async () => {
      const result = await fetcher();
      if (!result || !result.ok) return { entry: null, result };
      const turn = String(p.turn || result.turn || '');
      const entry = put(kind, key, { url: result.url || '', title: result.title || '', query: result.query || '', lang: result.lang || '', fetchedTurn: turn, text: result.text || '', value: result.value, sources: normSources(result.sources) }, p.ttlMs);
      markTurn('evidence_arrived', turn);
      use(entry, { turn, worker: p.worker });
      return { entry, result };
    })();
    inflight.set(k, run);
    try {
      const r = await run;
      return { entry: r.entry, how: 'fetched', result: r.result };
    } finally {
      if (inflight.get(k) === run) inflight.delete(k);
    }
  }

  function normSources(list) {
    const out = [], seen = new Set();
    (Array.isArray(list) ? list : []).forEach((x) => {
      const u = x && x.url ? String(x.url) : '';
      const k = urlKey(u);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push({ url: u.slice(0, 500), title: String((x && x.title) || '').slice(0, 200) });
    });
    return out;
  }

  /** note(list, {via, query, turn?, worker?}) — sources a hosted search CITED. No page body: they say "this address was found, by this search",
      so the next asker can open it (and the open will be recorded as a page) instead of searching for it again. Titles and
      addresses are kept exactly as cited; a source seen twice keeps its first title and gains the later query. */
  function note(list, ctx) {
    const c = ctx || {};
    let added = 0;
    normSources(list).forEach((s) => {
      const key = urlKey(s.url);
      const have = byId.get(byKey.get(slot('cited', key)));
      if (have) { if (c.query && !have.queries.includes(c.query)) have.queries.push(String(c.query).slice(0, 200)); have.expiresAt = now() + ttl.cited; use(have, c); return; }
      use(put('cited', key, { url: s.url, title: s.title, via: String(c.via || 'search').slice(0, 40), queries: c.query ? [String(c.query).slice(0, 200)] : [], text: '', value: null, sources: [], fetchedTurn: String(c.turn || '') }), c);
      added += 1;
    });
    return added;
  }

  const brief = (e) => ({ id: e.id, kind: e.kind, url: e.url || undefined, title: e.title || undefined, query: e.query || undefined, lang: e.lang || undefined, fetchedAt: new Date(e.fetchedAt).toISOString(), fetchedTurn: e.fetchedTurn || undefined, usedBy: e.usedBy.length ? e.usedBy.slice() : undefined, ageSec: Math.round(age(e) / 1000), fresh: fresh(e), sources: e.sources.length || undefined });

  /** lookup by reference id, address or query words */
  function lookup(ref) {
    const s = String(ref == null ? '' : ref).trim();
    if (!s) return null;
    const byRef = byId.get(s);
    if (byRef) return byRef;
    const uk = /^https?:\/\//i.test(s) ? urlKey(s) : '';
    if (uk) { for (const kind of ['page', 'render', 'cited']) { const id = byKey.get(slot(kind, uk)); if (id) return byId.get(id); } return null; }
    const id = byKey.get(slot('search', queryKey(s)));
    return id ? byId.get(id) : null;
  }

  /** read(ref, chars, ctx?) — what the record holds, as the model may re-read it; the sources are never dropped. ctx {turn, worker}: that turn re-read it, so used it */
  function read(ref, chars, ctx) {
    const e = lookup(ref);
    if (!e) return null;
    touch(e);
    use(e, ctx);
    const n = Math.max(200, Math.min(MAX_TEXT_CHARS, Number(chars) || 6000));
    const body = String(e.text || '');
    return Object.assign(brief(e), {
      sourceList: e.sources.length ? e.sources.map((s) => ({ ...s })) : undefined,   /* BEFORE the text: a reader that cuts the front of this record keeps the addresses */
      text: body.slice(0, n), textChars: body.length, truncated: body.length > n || undefined,
      cited: e.kind === 'cited' ? { via: e.via, queries: e.queries } : undefined,
    });
  }

  /** turnSources(turn, opts?) — the pages and cited sources THIS turn's readers USED (fetched, joined, were answered from the store, re-read),
      in the shape the answer call takes as `webSources` (js/atlas-answer-pipeline.js), so a page opened or a search run through here has an id
      in the answer that follows — as one run through research.brief already did. `retrievedAt` is when the record was FETCHED (an earlier
      turn's fetch keeps its own time). opts.use: the caller hands these to the turn's answer, which is the turn using them (evidence_used). */
  function turnSources(turn, opts) {
    const sources = sourcesByTurn.get(String(turn || ''));
    const out = sources ? Array.from(sources.values(), (source) => ({ ...source })) : [];
    if (out.length && opts && opts.use) markTurn('evidence_used', turn);
    return out;
  }

  function documentForTurn(ref, turn) {
    const direct = byId.get(String(ref || ''));
    if (direct && (direct.kind === 'page' || direct.kind === 'render')) return direct;
    const key = urlKey(ref);
    if (!key) return null;
    const versions = new Set(turnSources(turn).filter((entry) => entry.sourceVersion && urlKey(entry.url) === key)
      .map((entry) => entry.sourceVersion));
    return versions.size === 1 ? byId.get(versions.values().next().value) || null : null;
  }

  function list(o2) {
    const q = o2 || {};
    const out = [];
    byId.forEach((e) => { if ((!q.kind || e.kind === q.kind) && (q.stale || fresh(e))) out.push(e); });
    out.sort((a, b) => b.usedAt - a.usedAt);
    return out.slice(0, q.limit > 0 ? q.limit : 60).map(brief);
  }

  /** a few lines naming what is already held and fresh — for a prompt that would otherwise search for it again */
  function promptBlock(limit) {
    const rows = list({ limit: limit > 0 ? limit : 12 });
    if (!rows.length) return '';
    return rows.map((r) => r.id + ' · ' + r.kind + ' · ' + (r.title || r.query || r.url || '') + (r.url && (r.title || r.query) ? ' · ' + r.url : '') + ' · ' + r.ageSec + ' s old').join('\n');
  }

  /* (atlas-early-results) which answers an earlier call of THIS turn has already carried to the model — the set a "wait":"any" search consults
     to wait for the next arrival rather than for one an earlier answer already satisfied. One turn at a time: a new turn starts empty. */
  let shownTurn = null, shownKeys = new Set();
  function shown(turn) { if (shownTurn !== turn) { shownTurn = turn; shownKeys = new Set(); } return shownKeys; }
  return { shown, acquire, find, note, lookup, read, list, turnSources, documentForTurn, promptBlock, brief, size: () => byId.size, clear() { byId.clear(); byKey.clear(); inflight.clear(); sourcesByTurn.clear(); } };
}

/** the page's ONE store (the parent turn and every delegated child run in this page) */
export const webEvidence = makeWebEvidence();
