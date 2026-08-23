/* ============================================================================
 *  IntMap · ATLAS — THE EVIDENCE REGISTRY: the one place a source may come from  (#R347)
 * ----------------------------------------------------------------------------
 *  Up to #R333 an analysis answer carried its own sources: the model wrote a `SOURCES:` line and
 *  the client peeled it off with a regex, `mdMini()` linkified any bare URL left in the prose, and
 *  the source cards were assembled from three different lists that nothing reconciled. Two defects
 *  follow from that shape and both were REPORTED:
 *
 *    · a URL the model INVENTED reaches the reader. `stats.gov.stats.gov.cn` is not a typo — it is
 *      what a language model produces when it concatenates two host names it has seen. Nothing in
 *      the pipeline asked whether a URL in the prose was a URL IntMap had ever fetched.
 *    · «Web-verified sources» was a HEADING, not a fact. It was printed whenever the provider
 *      returned any `url_citation`, regardless of whether the hosted search ran for THIS call.
 *
 *  The registry inverts the direction. Code puts records in — from the articles IntMap actually
 *  fetched, from the provider's citation annotations for THIS call, from app data, from a
 *  calculation — and the model may only REFERENCE them by `evidenceId`. A model that writes a URL
 *  is writing something the renderer will never turn into a link, and something the audit will
 *  fail (js/atlas-answer-audit.js, code `url.raw_in_prose`).
 *
 *  ⚠ THE REGISTRY IS PER CALL, NOT PER PAGE. `callId` is bound at construction and
 *  `addProviderCitations` REFUSES a citation stamped with a different call. That is the whole of
 *  the concurrency fix: two analyses running at once cannot swap citations, because neither of them
 *  reads a global (the old path read `window._aiLastCitations`, which is whichever call answered
 *  last).
 *
 *  ⚠ CANONICALISATION IS ONE FUNCTION, USED BY EVERY ENTRY POINT. `canonicalizeUrl()` below is the
 *  only judge of whether a URL may be shown, and it keeps `originalUrl`, `canonicalUrl` and
 *  `finalUrl` apart rather than overwriting one with another — «where the model said it came from»,
 *  «what we compare for identity» and «where a redirect actually landed» are three different facts.
 *
 *  Pure over its inputs and free of the DOM, so tests/r334-checks.test.mjs can hand it a registry
 *  that is wrong on purpose and watch it say so.
 * ==========================================================================*/

export function makeAtlasEvidence() {
  return (function () {

  /* Query parameters that identify a CAMPAIGN, not a document. Stripped for the identity key only —
     the URL that is actually opened keeps whatever the publisher put there. */
  const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
    'gclid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'igshid', 'mc_cid', 'mc_eid',
    'ref', 'ref_src', 'referrer', 'spm', 'cmpid', 'CMP', 'ncid', 'partner', '_ga', '_gl',
  ];

  /* Hosts that are never a public source. Rejected BEFORE any network use, so a "check reachability"
     step added later cannot be pointed at the loopback interface or a cloud metadata endpoint. */
  const PRIVATE_HOST_RE = /^(localhost|127\.[0-9.]+|0\.0\.0\.0|\[::1\]|::1|169\.254\.[0-9.]+|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|metadata\.google\.internal)$/i;
  const PRIVATE_SUFFIX_RE = /\.(local|internal|localdomain|home\.arpa)$/i;

  /* The four places a record may come from. Nothing else may be added — see `add()`. */
  const ORIGINS = ['hosted_web', 'client_source', 'app_data', 'calculation'];
  const SOURCE_TYPES = ['official', 'primary_reporting', 'secondary', 'dataset', 'encyclopedia', 'other'];
  const DATE_TYPES = ['publication_date', 'event_date', 'valid_time', 'retrieval_time', 'other'];

  /* Bounds. A registry is serialised into a prompt, so it has a size, and the size is a cost. */
  const MAX_RECORDS = 40;
  const MAX_TITLE = 180;
  const MAX_FACTS_PER_RECORD = 12;

  /* ── ⚠ THE DOUBLED HOST ─────────────────────────────────────────────────────────────────────────
     `stats.gov.stats.gov.cn`. A model that has seen `stats.gov.cn` and `www.stats.gov.cn` emits the
     join of the two, and it parses as a perfectly valid host name. What marks it is that a RUN of two
     or more labels repeats inside the same name — real host names do not do that. A single repeated
     label (`news.news.example.com`) is left alone; two in a row is the signature. */
  function looksDoubledHost(host) {
    const labels = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (labels.length < 4) return false;
    for (let len = 2; len <= Math.floor(labels.length / 2); len++) {
      for (let i = 0; i + len * 2 <= labels.length; i++) {
        let same = true;
        for (let k = 0; k < len; k++) { if (labels[i + k] !== labels[i + len + k]) { same = false; break; } }
        if (same) return true;
      }
    }
    return false;
  }

  /**
   * canonicalizeUrl(raw) — the ONE judge of whether a URL may be stored, compared or shown.
   * @returns {{ok:true, url:string, key:string, host:string} | {ok:false, reason:string}}
   *   `url` is safe to open (tracking parameters intact, fragment intact);
   *   `key` is the identity used for de-duplication (lower-case host, no fragment, no tracking).
   */
  function canonicalizeUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, reason: 'empty' };
    if (s.length > 700) return { ok: false, reason: 'too_long' };
    /* ⚠ CONTROL CHARACTERS AND WHITESPACE ARE SPELLED OUT AS ESCAPES. A newline inside a URL is how
       a header injection is smuggled and a URL with a space in it was never a URL — but the class must
       not also swallow the hyphen that every real host name contains, which is what a careless
       [ -\s] range does.  */
    if (/[\u0000-\u0020\u007f]/.test(s)) return { ok: false, reason: 'control_char' };
    if (!/^https?:\/\//i.test(s)) return { ok: false, reason: 'scheme' };
    let u;
    try { u = new URL(s); } catch (_) { return { ok: false, reason: 'unparseable' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'scheme' };
    if (u.username || u.password) return { ok: false, reason: 'credentials' };
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return { ok: false, reason: 'no_host' };
    if (u.port && !(+u.port > 0 && +u.port <= 65535)) return { ok: false, reason: 'bad_port' };
    if (PRIVATE_HOST_RE.test(host) || PRIVATE_SUFFIX_RE.test(host)) return { ok: false, reason: 'private_host' };
    if (host.indexOf('.') < 0) return { ok: false, reason: 'no_tld' };
    if (looksDoubledHost(host)) return { ok: false, reason: 'doubled_host' };
    /* the identity key: lower-case host, no fragment, no campaign parameters, no trailing slash */
    let key = '';
    try {
      const k = new URL(u.href);
      k.hash = '';
      k.hostname = host;
      TRACKING_PARAMS.forEach((p) => { try { k.searchParams.delete(p); } catch (_) { /* older URL */ } });
      key = k.href.replace(/\/$/, '');
    } catch (_) { key = u.href.replace(/#.*$/, '').replace(/\/$/, ''); }
    return { ok: true, url: u.href, key, host };
  }

  function clampText(s, n) { return String(s == null ? '' : s).slice(0, n); }

  /* A single measured fact a record actually carries. This is what makes a NUMBER in the answer
     checkable rather than merely attributed: the audit matches the figure in a claim against these,
     and a figure that matches nothing here has no evidence no matter which id it names. */
  function normFact(f) {
    if (!f || typeof f !== 'object') return null;
    const v = Number(f.value);
    return {
      seriesId: clampText(f.seriesId || '', 80),
      concept: clampText(f.concept || '', 120),
      value: isFinite(v) ? v : null,
      unit: clampText(f.unit || '', 40),
      basis: clampText(f.basis || '', 40),
      geography: clampText(f.geography || '', 80),
      period: clampText(f.period || '', 40),
    };
  }

  /**
   * makeEvidenceRegistry({callId, turnId, retrievedAt}) — a registry bound to ONE model call.
   */
  function makeEvidenceRegistry(opts) {
    opts = opts || {};
    const callId = String(opts.callId || '');
    const turnId = String(opts.turnId || '');
    const retrievedAt = String(opts.retrievedAt || '');
    const byId = new Map();
    const byKey = new Map();
    const rejected = [];
    let seq = 0;

    function add(rec) {
      rec = rec || {};
      const origin = ORIGINS.indexOf(rec.origin) >= 0 ? rec.origin : 'client_source';
      const needsUrl = (origin === 'hosted_web' || origin === 'client_source');
      let canon = null;
      if (rec.originalUrl || needsUrl) {
        canon = canonicalizeUrl(rec.originalUrl);
        if (!canon.ok) {
          rejected.push({ originalUrl: String(rec.originalUrl || ''), reason: canon.reason });
          return null;
        }
        const dup = byKey.get(canon.key);
        if (dup) return dup;                              /* same document, already registered */
      }
      if (byId.size >= MAX_RECORDS) return null;
      seq++;
      const id = 'e' + seq;
      const out = {
        id,
        origin,
        sourceType: SOURCE_TYPES.indexOf(rec.sourceType) >= 0 ? rec.sourceType : 'other',
        originalUrl: rec.originalUrl ? String(rec.originalUrl) : null,
        canonicalUrl: canon ? canon.key : null,
        finalUrl: canon ? canon.url : null,
        host: canon ? canon.host : '',
        title: clampText(rec.title || (canon ? canon.host : ''), MAX_TITLE),
        publisher: clampText(rec.publisher || (canon ? canon.host : ''), 90),
        publishedAt: rec.publishedAt ? clampText(rec.publishedAt, 32) : null,
        validTime: rec.validTime ? clampText(rec.validTime, 32) : null,
        retrievedAt: clampText(rec.retrievedAt || retrievedAt, 32),
        dateType: DATE_TYPES.indexOf(rec.dateType) >= 0 ? rec.dateType : 'other',
        supportFacts: (Array.isArray(rec.supportFacts) ? rec.supportFacts : [])
          .map(normFact).filter(Boolean).slice(0, MAX_FACTS_PER_RECORD),
        status: rec.status === 'unreachable' ? 'unreachable' : (origin === 'hosted_web' ? 'verified' : 'provisional'),
        providerCitation: rec.providerCitation || null,
        callId: rec.callId || callId,
      };
      byId.set(id, out);
      if (canon) byKey.set(canon.key, out);
      return out;
    }

    /* ⚠ THE «WEB-VERIFIED» GATE, AND IT IS HERE RATHER THAN IN THE RENDERER. A provider citation is
       admitted only when the hosted search ACTUALLY ran for this call (`webUsed`) and the annotation
       is stamped with THIS call's id. Everything downstream can then trust the label, because a
       record with origin 'hosted_web' cannot exist unless both were true. */
    /* ⚠ A REPAIR IS A SECOND CALL AND IT BELONGS TO THE SAME ANSWER. The bounded repair pass
       (js/atlas-answer-pipeline.js) mints its own callId, so the registry is told about it EXPLICITLY
       rather than the check being loosened to "same turn" — a citation from an unrelated call still
       has nowhere to land. */
    const ownCalls = new Set([callId]);
    function allowCall(id) { if (id) ownCalls.add(String(id)); }
    function ownsCall(id) { return ownCalls.has(String(id || '')); }

    function addProviderCitations(citations, meta) {
      meta = meta || {};
      const out = [];
      if (!meta.webUsed) return out;
      if (meta.callId && callId && !ownCalls.has(String(meta.callId))) return out;
      (Array.isArray(citations) ? citations : []).forEach((c) => {
        if (!c || !c.url) return;
        const r = add({
          origin: 'hosted_web',
          sourceType: 'secondary',
          originalUrl: c.url,
          title: c.title || '',
          retrievedAt: retrievedAt,
          dateType: 'retrieval_time',
          providerCitation: (typeof c.startIndex === 'number' || typeof c.endIndex === 'number')
            ? { startIndex: (typeof c.startIndex === 'number' ? c.startIndex : null), endIndex: (typeof c.endIndex === 'number' ? c.endIndex : null) }
            : null,
          callId: String(meta.callId || callId),
        });
        if (r) out.push(r);
      });
      return out;
    }

    /* The articles IntMap itself fetched (loaded feed, GDELT, Google News). They are REAL — they were
       retrieved over the network by this app — but they are not «web-verified by the model», so they
       enter as `client_source` and the renderer never files them under that heading. */
    function addClientSources(list) {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((s) => {
        if (!s || !s.url) return;
        const r = add({
          origin: 'client_source',
          sourceType: s.sourceType || 'primary_reporting',
          originalUrl: s.url,
          title: s.title || '',
          publisher: s.src || '',
          publishedAt: s.date || null,
          retrievedAt: retrievedAt,
          dateType: s.dateType === 'gdelt_seen_date' ? 'retrieval_time' : (s.dateType || 'publication_date'),
          supportFacts: s.supportFacts || [],
        });
        if (r) out.push(r);
      });
      return out;
    }

    /* Values IntMap holds itself — country statistics, the live value of a displayed layer, a figure
       a simulator computed. They have no URL and they are still evidence; what they must carry is
       WHEN they were true, which is why `validTime` is separate from `retrievedAt`. */
    function addAppData(rec) {
      return add(Object.assign({ origin: 'app_data', sourceType: 'dataset', dateType: 'valid_time' }, rec || {}));
    }

    function get(id) { return byId.get(String(id || '')) || null; }
    function all() { return Array.from(byId.values()); }
    function hosts() { const h = new Set(); byId.forEach((r) => { if (r.host) h.add(r.host); }); return h; }

    /* What the model is shown. Ids and facts — never a URL, so the model has no URL to copy. */
    function promptBlock() {
      const rows = all().map((r) => {
        const bits = ['[' + r.id + ']', 'source: ' + (r.publisher || r.host || r.origin)];
        if (r.title) bits.push('title: ' + r.title);
        if (r.publishedAt) bits.push('date: ' + r.publishedAt + ' (' + r.dateType + ')');
        if (r.validTime) bits.push('valid_time: ' + r.validTime);
        if (r.retrievedAt) bits.push('retrieved: ' + r.retrievedAt);
        bits.push('origin: ' + r.origin);
        r.supportFacts.forEach((f) => {
          bits.push('fact: ' + [f.seriesId || f.concept, (f.value == null ? '' : f.value), f.unit, f.basis, f.geography, f.period]
            .filter(Boolean).join(' | '));
        });
        return bits.join(' · ');
      });
      return rows.join('\n');
    }

    return {
      callId, turnId, retrievedAt,
      add, addProviderCitations, addClientSources, addAppData, allowCall, ownsCall,
      get, all, hosts, promptBlock,
      rejected: () => rejected.slice(),
      size: () => byId.size,
    };
  }

    const API = { DATE_TYPES, MAX_FACTS_PER_RECORD, MAX_RECORDS, MAX_TITLE, ORIGINS, SOURCE_TYPES, TRACKING_PARAMS, canonicalizeUrl, looksDoubledHost, makeEvidenceRegistry };
    try { window.IntMapEvidence = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}