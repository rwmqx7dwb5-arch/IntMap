/* ============================================================================
 *  IntMap · WHAT STAGE A DISCOVERED DATASET HAS REACHED — js/gis-pipeline.js
 * ----------------------------------------------------------------------------
 *  A catalogue stating that a collection exists is not data in hand, and data in hand is not data that can
 *  be analysed. Until now one word («found») covered five different facts, and the Atlas could not tell
 *  which one it was standing on (the 2026-11-20 audit, items 5.11 / 6.5):
 *
 *      discovered → access → fetched → inspected → dataset → (analysis)
 *
 *   discovered   a catalogue STATES this thing exists                  (a statement, not a measurement)
 *   access       we are allowed to read it, as an anonymous client     (open | signed | login | refused | unknown)
 *   fetched      bytes actually came back                              (ok | partial | failed | unknown)
 *   inspected    the bytes were LOOKED AT: not empty, not all nodata, where they should be
 *   dataset      the content is a registry record the next step can take as `inputs`
 *
 *  ⚠⚠⚠ `analysis` IS NEVER RECORDED. It is derived by verdict(): it can only be `ready` when every stage before it
 *  is `ok`, and `ready-partial` when one is `partial` — with what is missing stated. Nobody can write «analysable»
 *  into this ledger, which is the point: a field a supplier may set is a claim, not a proof (the argument
 *  js/gis-sources.js coverageOf() is written from).
 *
 *  ⚠⚠⚠ A STAGE WE COULD NOT OBSERVE IS NOT A STAGE THAT FAILED. `unknown` (a catalogue that timed out, a host we
 *  could not reach) and `failed` (the host said no; the file is empty) are different facts that ask a different
 *  thing of the reader — «try again later» versus «this is not there» (.agents/rules/one-pass-or-a-reason.md §5).
 *  `blocked` is a third: it is there, and it is not ours to take (a login, a licence we may not satisfy). It is
 *  said as blocked and is NEVER worked around — IntMap holds no one's credentials.
 *
 *  ⚠ THE LEDGER LIVES IN MEMORY, PER SESSION. It describes what THIS session did; it is not a catalogue of the
 *  world and it is not persisted. A record carries the time it was written (`at`), so a reader can say how old
 *  a claim is.
 *
 *  Nothing here knows a service by name: every verdict is read from a refusal code and the words a response
 *  carried (js/gis-http.js), or from the values the reader measured.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY and nothing is published on `window` (no DOM, imports in Node).
 * ==========================================================================*/

export const STAGES = ['discovered', 'access', 'fetched', 'inspected', 'dataset'];
/* ok: observed to hold · partial: observed to hold for PART of what was asked · failed: observed NOT to hold ·
   blocked: it exists and is not ours to take · unknown: we could not observe · pending: not attempted */
const STATUSES = ['ok', 'partial', 'failed', 'blocked', 'unknown', 'pending'];

export function makeGisPipeline(deps) {
  const D = deps || {};
  const now = () => (typeof D.now === 'function' ? D.now() : Date.now());
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /* ── why a read did not work, said by KIND ────────────────────────────────────────────────────────
     Input: a refusal code and its detail (js/gis-remote.js, js/gis-cog.js, js/gis-ogcapi.js, js/gis-http.js).
     Output: {status, kind, retryable, say}. 観測 2026-11-20: USGS Landsat answered 200 with a sign-in page and
     `redirectedTo: https://ers.cr.usgs.gov/login`; Planetary Computer answered 409 PublicAccessNotPermitted;
     NASA CMR-STAC without `collections` took 31 s and answered 500; a Copernicus bucket gave an opaque
     TypeError in a page. 失効条件: a new refusal code is added to a reader — add its row here (the test walks
     every code the readers declare and fails on one this table does not know). */
  function classify(why, detail) {
    const d = detail || {};
    const status = Number(d.status);
    const words = String(d.serverSaid || d.reason || '');
    const say = (st, kind, retryable, text) => ({ status: st, kind: kind, retryable: retryable, say: text });
    if (why === 'timeout') return say('unknown', 'unresponsive', true, 'did not answer within our clock — that is «not observed», not «nothing there»');
    if (why === 'cancelled') return say('unknown', 'cancelled', true, 'cancelled before it answered');
    if (why === 'fetch-failed') {
      if (d.corsBlocked || /cors-blocked/.test(words)) return say('blocked', 'cors', false, 'the host answers but a browser page may not read it (no CORS) and the data relay did not take it');
      if (d.relay || /via-relay/.test(words)) return say('unknown', 'relay-refused', !!d.retryable, 'the data relay refused or could not read it');
      return say('unknown', 'unreachable', true, 'could not be reached');
    }
    if (why === 'http-status' || why === 'upstream_is_a_page' || why === 'upstream_status') {
      if (d.redirectedTo && /log\s*in|login|signin|sso|auth|oauth|cas\b/i.test(String(d.redirectedTo))) return say('blocked', 'login', false, 'the host sends an anonymous reader to a sign-in page (' + d.redirectedTo + ')');
      if (d.redirectedTo) return say('blocked', 'redirected-away', false, 'the host redirected to another origin (' + d.redirectedTo + ') that did not give the data');
      if (status === 401) return say('blocked', 'login', false, 'the host requires authentication (401)');
      if (status === 403) return say('blocked', 'forbidden', false, 'the host refused an anonymous reader (403)');
      if (status === 409 && /PublicAccessNotPermitted|signature|SAS|token/i.test(words)) return say('blocked', 'needs-signing', false, 'the store needs a signed address and no catalogue states how to sign it');
      if (status === 404 || status === 410) return say('failed', 'gone', false, 'not at that address (' + status + ')');
      if (status === 429) return say('unknown', 'rate-limited', true, 'the host asked us to slow down (429)');
      if (status >= 500) return say('unknown', 'upstream-error', true, 'the host failed (' + status + (d.serverSaid ? ': ' + d.serverSaid : '') + ')');
      return say('failed', 'http-error', false, 'HTTP ' + (isNum(status) ? status : '?'));
    }
    if (why === 'no-signer' || why === 'sign-failed') return say('blocked', 'needs-signing', false, why === 'no-signer' ? 'no catalogue states how to sign this address' : 'the signing endpoint did not give a token');
    if (why === 'budget_exhausted' || why === 'rate_limited') return say('unknown', 'budget', true, 'the data relay\'s budget is spent for now');
    if (why === 'response-too-large') return say('failed', 'too-large', false, 'larger than this reader will take');
    if (why === 'not-json') return say('failed', 'not-a-catalogue', false, 'did not answer with the JSON a catalogue serves');
    if (why === 'url-not-public' || why === 'not_https' || why === 'blocked_host') return say('blocked', 'not-public', false, 'not a public https address — this reader will not fetch it');
    if (why === 'catalog-unknown' || why === 'collection-unknown') return say('failed', 'unknown-reference', false, 'no such catalogue or collection');
    if (why === 'bad-param') return say('failed', 'bad-request', false, 'the request itself was malformed');
    return say('failed', 'other', false, 'refused: ' + String(why));
  }

  /* ── the ledger ───────────────────────────────────────────────────────────────────────────────── */

  const rows = new Map();   /* ref → {ref, parent, stages:{name:{status, at, why?, kind?, say?, detail?, facts?}}} */
  const health = new Map(); /* catalogue id → {asked, answered, unanswered, lastWhy, lastMs, lastAt} */

  const blank = () => { const s = {}; for (const k of STAGES) s[k] = { status: 'pending' }; return s; };
  const rowOf = (ref) => {
    const k = String(ref);
    if (!rows.has(k)) rows.set(k, { ref: k, parent: null, stages: blank() });
    return rows.get(k);
  };

  /* outcome = {status, why?, kind?, say?, detail?, facts?}. ⚠ A stage cannot be recorded `ok` with a reason of
     failure, nor a failure without one: the two ways to write a lie into a ledger. */
  function record(ref, stage, outcome) {
    if (STAGES.indexOf(stage) < 0) return { ok: false, why: 'bad-param', detail: { param: 'stage', stages: STAGES.slice() } };
    const o = outcome || {};
    if (STATUSES.indexOf(o.status) < 0 || o.status === 'pending') return { ok: false, why: 'bad-param', detail: { param: 'status', statuses: STATUSES.filter((s) => s !== 'pending') } };
    if ((o.status === 'failed' || o.status === 'blocked' || o.status === 'unknown') && !o.why && !o.kind) return { ok: false, why: 'bad-param', detail: { param: 'why', reason: 'a stage that did not hold must say why' } };
    const r = rowOf(ref);
    const rec = { status: o.status, at: now() };
    for (const k of ['why', 'kind', 'say', 'detail', 'facts']) if (o[k] !== undefined && o[k] !== null) rec[k] = o[k];
    r.stages[stage] = rec;
    /* a stage re-attempted invalidates what was built on it: the later stages described the OLD bytes */
    let after = false;
    for (const k of STAGES) { if (after && r.stages[k].status !== 'pending' && stage !== 'discovered') r.stages[k] = { status: 'pending', invalidatedBy: stage }; if (k === stage) after = true; }
    return { ok: true };
  }
  /* a failed read, classified, recorded — the one road every reader's refusal takes */
  function recordFailure(ref, stage, why, detail) {
    const c = classify(why, detail);
    return Object.assign(record(ref, stage, { status: c.status, why: why, kind: c.kind, say: c.say, detail: detail || null, facts: { retryable: c.retryable } }), { classified: c });
  }
  function link(ref, parent) { rowOf(ref).parent = String(parent); }

  /* ── the verdict ──────────────────────────────────────────────────────────────────────────────── */

  /* → {ref, analysis:'ready'|'ready-partial'|'not-ready', blockedAt, reached, stages, next, say}.
     Derived from the stages only. ⚠ A DISCOVERY ALONE IS 'not-ready': what a catalogue states is a lead. */
  function verdict(ref) {
    const r = rows.get(String(ref));
    if (!r) return { ref: String(ref), known: false, analysis: 'not-ready', blockedAt: 'discovered', reached: null, stages: blank(), next: 'discovered', say: 'nothing has been done with this reference in this session' };
    let reached = null, blockedAt = null, partial = [];
    for (const k of STAGES) {
      const s = r.stages[k];
      if (s.status === 'ok') { reached = k; continue; }
      if (s.status === 'partial') { reached = k; partial.push(k); continue; }
      blockedAt = k; break;
    }
    /* a stage that was ATTEMPTED and did not hold is where it stopped, even if an earlier stage was never recorded (a reader that
       fails reports its own failure; it does not have to have recorded the stages before it) */
    const attempted = STAGES.find((k) => ['failed', 'blocked', 'unknown'].indexOf(r.stages[k].status) >= 0);
    if (attempted) blockedAt = attempted;
    const ready = blockedAt == null;
    const analysis = !ready ? 'not-ready' : (partial.length ? 'ready-partial' : 'ready');
    const stuck = blockedAt ? r.stages[blockedAt] : null;
    const say = ready
      ? (partial.length ? 'usable for what was read; ' + partial.map((k) => k + ': ' + ((r.stages[k].facts && r.stages[k].facts.missing) || (r.stages[k].say) || 'partial')).join('; ') : 'every stage held')
      : (stuck.status === 'pending' ? 'not yet attempted: ' + blockedAt : blockedAt + ' ' + stuck.status + (stuck.say ? ' — ' + stuck.say : stuck.why ? ' — ' + stuck.why : ''));
    return {
      ref: r.ref, known: true, parent: r.parent, analysis: analysis, reached: reached, blockedAt: blockedAt,
      next: blockedAt && (!stuck || stuck.status === 'pending' || stuck.facts && stuck.facts.retryable) ? blockedAt : null,
      retryable: !!(stuck && stuck.facts && stuck.facts.retryable),
      stages: JSON.parse(JSON.stringify(r.stages)), say: say,
    };
  }
  /* ── the two ends of EVERY read, shared by the door and by anything that reads (js/gis-atlas.js, the live probe) ── */
  /* a read that did not work: access carries the host's verdict when it said no, and «answered» otherwise */
  function readFailed(key, why, detail) {
    const c = classify(why, detail);
    if (c.status === 'blocked' || c.status === 'unknown') record(key, 'access', { status: c.status, why: why, kind: c.kind, say: c.say, detail: detail || null, facts: { retryable: c.retryable } });
    else record(key, 'access', { status: 'ok', say: 'the host answered' });
    return recordFailure(key, 'fetched', why, detail);
  }
  /* bytes came back: access held; the source's own coverage says whether ALL of what was asked came; the inspection says what is in it.
     ⚠ A grid read at the caller's resolution is a sample BY CONSTRUCTION (js/gis-sources.js 'sample') — that is not a shortfall. */
  function readSucceeded(key, cov, insp, dsId) {
    record(key, 'access', { status: 'ok', say: 'an anonymous read returned data' });
    const complete = !cov || cov.completeness === 'all' || cov.completeness === 'sample';
    record(key, 'fetched', complete
      ? { status: 'ok', say: cov && cov.completeness === 'sample' ? 'a field read at the stated resolution (a sample by construction)' : 'everything asked for came back', facts: { coverage: cov ? { completeness: cov.completeness, reason: cov.reason } : null } }
      : { status: 'partial', why: cov.reason || 'partial', say: 'only part of what was asked came back: ' + (cov.reason || 'partial'), facts: { missing: cov.reason || 'part of the window', coverage: { completeness: cov.completeness, reason: cov.reason, acrossAntimeridian: cov.acrossAntimeridian || null } } });
    record(key, 'inspected', { status: insp.status, why: insp.why, say: insp.say, facts: Object.assign({}, insp.facts || {}, insp.missing ? { missing: insp.missing } : {}) });
    /* a content that failed inspection is recorded as a dataset that must NOT be analysed (it may still be registered: that is the registry's behaviour, not a verdict) */
    record(key, 'dataset', insp.status === 'failed'
      ? { status: 'failed', why: insp.why, say: 'the content failed inspection, so it must not be analysed', facts: { id: dsId } }
      : { status: insp.status === 'partial' ? 'partial' : 'ok', say: 'registered as ' + dsId, facts: { id: dsId, missing: insp.missing || undefined } });
  }

  /* ── one thing read in PARTS (a window across ±180 is two files) ───────────────────────────────────
     parts = [{key, label}]. Per stage: every part ok → ok; some held and some did not → PARTIAL, naming the parts that did
     not and why (never «ok» because the larger half came back); none held → the first part's own failure, said as that.
     ⚠ This is the only place a parent's stage is computed from other records, and it can only be as good as the parts. */
  function combine(parent, parts) {
    const P = (parts || []).map((x) => ({ label: x.label, key: String(x.key), row: rows.get(String(x.key)) })).filter((x) => x.row);
    if (!P.length) return { ok: false, why: 'bad-param', detail: { param: 'parts', reason: 'none of the parts has a record' } };
    for (const x of P) link(x.key, parent);
    for (const stage of STAGES) {
      if (stage === 'discovered') continue;
      const got = P.map((x) => ({ label: x.label, s: x.row.stages[stage] }));
      const held = got.filter((g) => g.s.status === 'ok' || g.s.status === 'partial');
      const lacking = got.filter((g) => g.s.status !== 'ok');
      if (!held.length) {
        const first = got.find((g) => g.s.status !== 'pending') || got[0];
        if (first.s.status === 'pending') { rowOf(parent).stages[stage] = { status: 'pending' }; continue; }
        const rec = Object.assign({}, first.s, { say: first.label + ': ' + (first.s.say || first.s.why || first.s.status) });
        rowOf(parent).stages[stage] = rec;
      } else if (lacking.length) {
        const missing = lacking.map((g) => g.label + ' (' + g.s.status + (g.s.why ? ': ' + g.s.why : '') + ')').join('; ');
        rowOf(parent).stages[stage] = { status: 'partial', at: now(), why: 'some-parts-did-not-hold', say: 'held for ' + held.map((g) => g.label).join(', ') + '; not for ' + missing, facts: { missing: missing, parts: got.map((g) => ({ label: g.label, status: g.s.status })) } };
      } else {
        rowOf(parent).stages[stage] = { status: 'ok', at: now(), say: 'every part held', facts: { parts: got.map((g) => ({ label: g.label, status: g.s.status })) } };
      }
    }
    return { ok: true };
  }
  function list() { return Array.from(rows.keys()).map(verdict); }
  function summary() {
    const l = list();
    const by = { ready: 0, 'ready-partial': 0, 'not-ready': 0 };
    const stuckAt = {};
    for (const v of l) { by[v.analysis]++; if (v.blockedAt) stuckAt[v.blockedAt] = (stuckAt[v.blockedAt] || 0) + 1; }
    return { total: l.length, analysis: by, stuckAt: stuckAt };
  }
  function forget(ref) { return rows.delete(String(ref)); }

  /* ── catalogue health: «did not answer» is counted, and is not «has nothing» ───────────────────── */
  function noteCatalog(id, row) {
    const k = String(id);
    const h = health.get(k) || { id: k, asked: 0, answered: 0, unanswered: 0, lastWhy: null, lastMs: null, lastAt: null };
    h.asked++;
    if (row && row.answered) h.answered++; else { h.unanswered++; h.lastWhy = row && row.why ? row.why : 'unknown'; }
    if (row && isNum(row.ms)) h.lastMs = row.ms;
    h.lastAt = now();
    health.set(k, h);
  }
  const catalogHealth = () => Array.from(health.values()).map((h) => Object.assign({}, h));

  /* ── content inspection: the bytes are LOOKED AT before anyone calls them a dataset ──────────────────
     ⚠ These judge what was MEASURED here (counts, finite fractions, positions), never what a catalogue said.
     An empty answer is `failed`/`empty-answer` for THIS window — it is not «there is no data in the world». */
  function inspectRaster(cells, o) {
    const opts = o || {};
    if (!cells || typeof cells.length !== 'number') return { status: 'failed', why: 'no-cells', say: 'no cells came back' };
    const n = cells.length;
    const nodata = opts.nodata;
    let finite = 0, min = Infinity, max = -Infinity, sum = 0, nd = 0;
    for (let i = 0; i < n; i++) {
      const v = cells[i];
      if (!isNum(v) || (nodata != null && isNum(nodata) && v === nodata)) { nd++; continue; }
      finite++; if (v < min) min = v; if (v > max) max = v; sum += v;
    }
    const facts = { cells: n, finite: finite, finiteFraction: n ? finite / n : 0, noData: nd };
    if (finite) { facts.min = min; facts.max = max; facts.mean = sum / finite; }
    if (!n) return { status: 'failed', why: 'empty-answer', say: 'zero cells', facts: facts };
    if (!finite) return { status: 'failed', why: 'all-nodata', say: 'every cell is nodata or not a number — the window holds no measurement', facts: facts };
    facts.constant = (min === max);
    if (opts.expect && (isNum(opts.expect.min) || isNum(opts.expect.max))) {
      const lo = isNum(opts.expect.min) ? opts.expect.min : -Infinity, hi = isNum(opts.expect.max) ? opts.expect.max : Infinity;
      let out = 0; for (let i = 0; i < n; i++) { const v = cells[i]; if (isNum(v) && (v < lo || v > hi) && !(nodata != null && v === nodata)) out++; }
      facts.outsideStatedRange = out;
      if (out) return { status: 'partial', why: 'values-outside-stated-range', say: out + ' cells lie outside the range the source states (' + lo + '…' + hi + ')', facts: facts };
    }
    if (finite < n) return { status: 'partial', why: 'some-nodata', say: Math.round((1 - finite / n) * 1000) / 10 + '% of the cells carry no measurement', facts: facts, missing: (n - finite) + ' of ' + n + ' cells have no value' };
    return { status: 'ok', facts: facts };
  }

  function bboxOfGeometry(g, acc) {
    const a = acc || { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
    const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < a.w) a.w = c[0]; if (c[0] > a.e) a.e = c[0]; if (c[1] < a.s) a.s = c[1]; if (c[1] > a.n) a.n = c[1]; } else for (const x of c) walk(x); };
    if (g && g.coordinates) walk(g.coordinates); else if (g && Array.isArray(g.geometries)) for (const x of g.geometries) bboxOfGeometry(x, a);
    return a;
  }
  function inspectFeatures(features, o) {
    const opts = o || {};
    const list = Array.isArray(features) ? features : [];
    const facts = { count: list.length, withGeometry: 0, emptyGeometry: 0, types: {} };
    if (!list.length) return { status: 'failed', why: 'empty-answer', say: 'no features came back for this window — that is this window, not «nothing exists»', facts: facts };
    const box = opts.box && isNum(opts.box.w) ? opts.box : (Array.isArray(opts.box) && opts.box.length >= 4 ? { w: opts.box[0], s: opts.box[1], e: opts.box[2], n: opts.box[3] } : null);
    let outside = 0;
    for (const f of list) {
      const g = f && f.geometry;
      if (!g) { facts.emptyGeometry++; continue; }
      facts.withGeometry++; facts.types[g.type] = (facts.types[g.type] || 0) + 1;
      if (box) {
        const b = bboxOfGeometry(g);
        const lonOk = box.w <= box.e ? !(b.e < box.w || b.w > box.e) : !(b.e < box.w && b.w > box.e);
        if (b.n < box.s || b.s > box.n || !lonOk) outside++;
      }
    }
    if (box) facts.outsideAskedWindow = outside;
    if (!facts.withGeometry) return { status: 'partial', why: 'no-geometry', say: 'the rows carry no geometry: a table, not a layer a map operation can use', facts: facts };
    if (outside) return { status: 'partial', why: 'features-outside-window', say: outside + ' of ' + list.length + ' features lie outside the window that was asked', facts: facts, missing: outside + ' features outside the window' };
    if (facts.emptyGeometry) return { status: 'partial', why: 'some-without-geometry', say: facts.emptyGeometry + ' rows carry no geometry', facts: facts, missing: facts.emptyGeometry + ' rows without geometry' };
    return { status: 'ok', facts: facts };
  }

  /* ── the antimeridian ─────────────────────────────────────────────────────────────────────────────
     A window across ±180 is two windows on two sides of the line, and a catalogue that tiles the world
     holds them in DIFFERENT files (measured 2026-11-20: Copernicus DEM E179 and W180 are separate objects).
     One file read cannot answer both; the honest move is to say which side is missing and to ask the catalogue for
     the other. → null when the window does not cross, else [{w,s,e,n}, {w,s,e,n}] (east side first). */
  function splitAtAntimeridian(b) {
    const w = Array.isArray(b) ? b[0] : b && b.w, s = Array.isArray(b) ? b[1] : b && b.s, e = Array.isArray(b) ? b[2] : b && b.e, n = Array.isArray(b) ? b[3] : b && b.n;
    if (![w, s, e, n].every(isNum)) return null;
    if (w > e) return [{ w: w, s: s, e: 180, n: n }, { w: -180, s: s, e: e, n: n }];
    if (e > 180) return [{ w: w, s: s, e: 180, n: n }, { w: -180, s: s, e: e - 360, n: n }];
    if (w < -180) return [{ w: w + 360, s: s, e: 180, n: n }, { w: -180, s: s, e: e, n: n }];
    return null;
  }

  return {
    STAGES: STAGES.slice(), STATUSES: STATUSES.slice(),
    classify, record, recordFailure, readFailed, readSucceeded, link, combine, verdict, list, summary, forget,
    noteCatalog, catalogHealth, inspectRaster, inspectFeatures, splitAtAntimeridian,
    /* the codes classify() answers by name — read by the check that walks every reader's declared refusals */
    kinds: () => ['unresponsive', 'cancelled', 'cors', 'relay-refused', 'unreachable', 'login', 'redirected-away', 'forbidden', 'needs-signing', 'gone', 'rate-limited', 'upstream-error', 'http-error', 'budget', 'too-large', 'not-a-catalogue', 'not-public', 'unknown-reference', 'bad-request', 'other'],
  };
}
