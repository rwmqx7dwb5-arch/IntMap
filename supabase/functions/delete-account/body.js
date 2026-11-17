// IntMap · delete-account — reading the request body under a byte cap and a deadline (security review N4).
//
// The only legitimate body is {"confirm":"DELETE"}. This runs AFTER the JWT and re-auth checks, but a
// signed-in caller could still stream an unbounded body or hold the connection open, so the body is read
// here with a ceiling on the bytes actually received (not just Content-Length, which may be absent in a
// chunked request or simply lie) and a wall-clock deadline. Pure: no Deno globals, importable by node tests.
// (the shared relays' `readCapped` was not reused: it takes a Response, throws a RelayError whose
// vocabulary is the relays', and has no deadline.)

/* DELETE_BODY_MAX_BYTES
   Observation: the sole browser caller, js/auth-ui.js (fetch '.../functions/v1/delete-account'), sends
   JSON.stringify({confirm:'DELETE'}) = 20 bytes (measured 2026-11-17).
   Cap = 1024 = ~50x that, one KiB: room for a future field or two, far below anything that costs memory.
   Invalidation: if the client ever sends more fields (re-read js/auth-ui.js), size this from the new body.
   Canonical source: here; index.ts imports it. */
export const DELETE_BODY_MAX_BYTES = 1024;

/* DELETE_BODY_DEADLINE_MS
   Observation: a 20-byte body arrives with the request headers; every read of it in a healthy connection
   completes within a network round trip. 5 s is ~50x the worst round trip we plan for (100 ms mobile) and
   far inside the Edge runtime's own request limit; a slower body is a held connection, not a person.
   Invalidation: if legitimate deletes start returning "timeout" in the function logs, measure and raise.
   Canonical source: here. */
export const DELETE_BODY_DEADLINE_MS = 5000;

/* error code -> HTTP status; index.ts answers with { error: code } and nothing else about the body */
const STATUS = { too_large: 413, timeout: 408, invalid_json: 400, not_object: 400 };
export function rejectionStatus(error) { return STATUS[error] || 400; }

export async function readDeleteConfirm(req, opts) {
  const o = opts || {};
  const maxBytes = o.maxBytes ?? DELETE_BODY_MAX_BYTES;
  const deadlineMs = o.deadlineMs ?? DELETE_BODY_DEADLINE_MS;

  const declared = Number(req.headers.get("content-length"));
  if (req.headers.get("content-length") !== null && Number.isFinite(declared) && declared > maxBytes) {
    try { await req.body?.cancel(); } catch (_) { /* nothing to keep */ }
    return { ok: false, error: "too_large" };
  }

  const bytes = await readBounded(req.body, maxBytes, deadlineMs);
  if (bytes.error) return { ok: false, error: bytes.error };

  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.buf)); }
  catch (_) { return { ok: false, error: "invalid_json" }; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "not_object" };
  return { ok: true, payload: value };
}

async function readBounded(body, maxBytes, deadlineMs) {
  if (!body) return { buf: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks = [];
  let n = 0;
  let timer;
  let expired = false;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => { expired = true; resolve(null); }, deadlineMs); });
  const stop = (error) => {
    /* not awaited: cancel() on a source that never answers must not outlive the deadline */
    try { reader.cancel().catch(() => {}); } catch (_) { /* */ }
    try { reader.releaseLock(); } catch (_) { /* a read is still pending; cancel settles it */ }
    return { error };
  };
  try {
    for (;;) {
      const step = await Promise.race([reader.read(), deadline]);
      if (expired || step === null) return stop("timeout");
      if (step.done) break;
      n += step.value.length;
      if (n > maxBytes) return stop("too_large");
      chunks.push(step.value);
    }
  } catch (_) {
    return stop("invalid_json");
  } finally {
    clearTimeout(timer);
  }
  const buf = new Uint8Array(n);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return { buf };
}
