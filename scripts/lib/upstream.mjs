/* ============================================================================
 *  scripts/lib/upstream.mjs — ONE JUDGEMENT OF WHAT AN UPSTREAM ANSWERED
 * ----------------------------------------------------------------------------
 *  Two readers ask the same question of an HTTP exchange and must get the same answer:
 *
 *    · a BUILDER that writes into data/ — «may the bytes I received become a bundle?»
 *    · scripts/upstream-liveness.mjs — «is the host the reader's browser talks to still there?»
 *
 *  Before this file the builders each answered it their own way, and three of them did not answer
 *  it at all: scripts/build-deepsky.mjs, build-smallbodies.mjs and build-spacecraft.mjs read the
 *  body of whatever came back without asking its status, and a query that failed four times was
 *  returned as `null` / `[]` — so a failed upstream ended as a SHORTER bundle rather than as a
 *  failed build (check:datagov, rule update-failure, measured 2026-09-30).
 *
 *  ⚠⚠ FOUR VERDICTS, AND `unobserved` IS NOT A WEAKER `dead`.
 *      alive       the host answered with a status its caller declared acceptable
 *      refused     the host answered and said no — a 4xx (including 429), or an explicit refusal
 *      dead        the host did not answer (timeout, connection refused, DNS) or answered 5xx
 *      unobserved  we could not look: the prober itself had no network, or nothing was declared
 *  「確認できなかった」 is not 「死んでいる」 (.agents/rules/one-pass-or-a-reason.md §5): a builder that
 *  cannot reach the network has learnt nothing about its upstream, and a monitor that reports its
 *  own outage as 177 dead hosts is a monitor nobody reads twice.
 *
 *  ⚠ RETRYING IS ALLOWED ONLY AFTER AN OBSERVED FAILURE, AND ONLY FOR THE KIND THAT CAN CHANGE.
 *  A 404 is the upstream's answer and asking again asks the same question; a 503 or a reset
 *  connection is weather. `fetchChecked` therefore retries `dead` and a 429 (the upstream said
 *  «later», which is an instruction, not a verdict on the question), never `refused`, and every
 *  attempt is recorded on the error it finally throws.
 * ==========================================================================*/

export const VERDICTS = Object.freeze(['alive', 'refused', 'dead', 'unobserved']);

/* The user agent every IntMap build and probe identifies itself with. Several upstreams refuse an
   anonymous or library agent (measured: WHO answers 403 to `Python-urllib`; Nominatim and the
   Wikimedia APIs require an identifying agent in their usage policies). One string, so that an
   upstream's operator who reads it can find who we are. */
export const USER_AGENT = 'IntMap-build (+https://github.com/rwmqx7dwb5-arch/IntMap)';

/**
 * Classify one exchange.
 *   status   the HTTP status, or null when no response arrived
 *   error    the thrown error when no response arrived (timeout, DNS, reset)
 *   expect   the statuses the caller declared acceptable (default: any 2xx)
 *   networkObserved  false when the PROBER is known to have had no network at all — then a
 *            missing response says nothing about the host
 * Returns { verdict, why }.
 */
export function classify({ status = null, error = null, expect = null, networkObserved = true } = {}) {
  if (status == null) {
    if (!networkObserved) {
      return { verdict: 'unobserved', why: 'no probe from this runner reached any host, so a missing answer here is about the runner: ' + errText(error) };
    }
    return { verdict: 'dead', why: errText(error) };
  }
  const ok = Array.isArray(expect) && expect.length ? expect.includes(status) : status >= 200 && status < 300;
  if (ok) return { verdict: 'alive', why: 'HTTP ' + status };
  if (status >= 500) return { verdict: 'dead', why: 'HTTP ' + status };
  if (status >= 400) return { verdict: 'refused', why: 'HTTP ' + status };
  /* a 1xx/3xx that reached us (redirects are followed, so a 3xx here was not) or a 2xx the caller
     did not declare: the host answered, and not with what was declared — the caller's statement is
     the thing to re-read, so it is reported as refused with the real status rather than guessed at */
  return { verdict: 'refused', why: 'HTTP ' + status + ' (declared ' + (expect || ['2xx']).join('/') + ')' };
}

function errText(e) {
  if (!e) return 'no response';
  const c = e.cause && (e.cause.code || e.cause.message);
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'no response within the time limit';
  return String(c || e.code || e.message || e).slice(0, 160);
}

/** What a builder throws when an upstream's answer may not become a bundle. */
export class UpstreamError extends Error {
  constructor(url, verdict, why, attempts, status = null) {
    super(`${url} — ${verdict}: ${why}${attempts > 1 ? ` (after ${attempts} attempts)` : ''}`);
    this.name = 'UpstreamError';
    this.url = url;
    this.verdict = verdict;
    this.why = why;
    this.attempts = attempts;
    /* the HTTP status when there was one — a caller may treat one refusal as an answer (SBDB's 400 for a
       designation its query grammar cannot express is an answer about the question, not an outage) */
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch, and refuse anything that is not a usable answer. Resolves to the parsed body.
 *
 *   as        'json' | 'text' | 'buffer' | 'status' (the status among `expect` that answered)
 *   expect    acceptable statuses (default any 2xx)
 *   validate  (body) => true | string — a string is the reason the body is not what was asked for
 *             (a JSON error envelope under HTTP 200, an empty result set, a changed header row)
 *   attempts  how many times a `dead` (or 429) answer may be asked again; 1 = never
 *   backoffMs base delay between attempts, multiplied by the attempt number
 *   timeoutMs per-attempt limit
 *   fetchImpl injected in tests so the judgement can be evaluated without a network
 *   log       where retries are announced (default console.warn)
 *
 * ⚠ AN EMPTY BODY IS NEVER DATA. A 200 with zero bytes (or only whitespace) is refused as
 *   `refused: empty body` — it is the upstream's answer, and it is not the answer that was asked for.
 */
export async function fetchChecked(url, init = {}, opt = {}) {
  const { as = 'json', expect = null, validate = null, attempts = 1, backoffMs = 1500,
    timeoutMs = 60000, fetchImpl = globalThis.fetch, log = (m) => console.warn(m) } = opt;
  const headers = { 'user-agent': USER_AGENT, ...(init.headers || {}) };
  let last = null;
  for (let n = 1; n <= Math.max(1, attempts); n++) {
    let res = null, error = null;
    try {
      res = await fetchImpl(url, { ...init, headers, signal: init.signal || AbortSignal.timeout(timeoutMs) });
    } catch (e) { error = e; }
    const c = classify({ status: res ? res.status : null, error, expect });
    if (c.verdict === 'alive' && as === 'status') {
      /* the caller declared several statuses as ANSWERS (GIBS: 200 = the date exists, 404 = it does
         not) and wants to know which one it got; the body is not the question */
      try { await res.body?.cancel(); } catch { /* nothing to release */ }
      return res.status;
    }
    if (c.verdict === 'alive') {
      let body;
      try {
        if (as === 'buffer') body = Buffer.from(await res.arrayBuffer());
        else {
          const text = await res.text();
          if (!text.trim()) throw new UpstreamError(url, 'refused', 'empty body under HTTP ' + res.status, n);
          if (as === 'text') body = text;
          else {
            try { body = JSON.parse(text); } catch { throw new UpstreamError(url, 'refused', 'HTTP ' + res.status + ' but the body is not JSON: ' + text.slice(0, 120).replace(/\s+/g, ' '), n); }
          }
        }
      } catch (e) {
        if (e instanceof UpstreamError) throw e;
        /* the connection broke while the body was streaming — weather, like any other dead answer */
        last = new UpstreamError(url, 'dead', 'the body did not arrive: ' + errText(e), n);
        if (n < attempts) { log(`  ${last.message} — asking again`); await sleep(backoffMs * n); continue; }
        throw last;
      }
      if (as === 'buffer' && !body.length) throw new UpstreamError(url, 'refused', 'empty body under HTTP ' + res.status, n);
      if (validate) {
        const v = validate(body);
        if (v !== true) throw new UpstreamError(url, 'refused', 'the answer is not what was asked for: ' + (typeof v === 'string' ? v : 'failed validation'), n);
      }
      return body;
    }
    if (res) { try { await res.body?.cancel(); } catch { /* nothing to release */ } }
    last = new UpstreamError(url, c.verdict, c.why, n, res ? res.status : null);
    const retryable = c.verdict === 'dead' || (res && res.status === 429);
    if (!retryable || n >= attempts) throw last;
    log(`  ${last.message} — asking again`);
    await sleep(backoffMs * n);
  }
  throw last;
}
