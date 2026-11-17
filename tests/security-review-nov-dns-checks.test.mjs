// security-review-nov · N3 — resolvesPublic() must ESTABLISH that a name is public, not merely fail
// to find a reason it is not.
//
// Before: A then AAAA in sequence, and every error swallowed as "no record of that type" — so a
// public A answer plus an AAAA query that failed (SERVFAIL, timeout) answered true, and the lookups
// carried no deadline, so fetch-relay's article rule spent DNS time outside the exchange's clock.
// Here the resolver is Deno's (`Deno.resolveDns`), stubbed on globalThis the way
// tests/security-hardening-checks.test.mjs ④ stubs it, and fetch is stubbed for the redirect case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href;
const { resolvesPublic, fetchGuarded, RelayError } = await import(GUARD);

const PUB4 = '93.184.215.14';
const PUB6 = '2606:2800:21f:cb07:6820:80da:af6b:8b2c';

/* Deno's own shapes: NXDOMAIN / no record is `Deno.errors.NotFound` (name "NotFound"); anything else
   (a SERVFAIL, a timeout, an abort) is some other error. */
function notFound() { const e = new Error('no record found'); e.name = 'NotFound'; return e; }
function servfail() { const e = new Error('proto error: server failure'); e.name = 'Error'; return e; }

async function withResolver(resolveDns, fn) {
  const saved = globalThis.Deno;
  globalThis.Deno = resolveDns === undefined ? {} : { resolveDns };
  try { return await fn(); } finally { if (saved === undefined) delete globalThis.Deno; else globalThis.Deno = saved; }
}
const answers = (byType) => async (_h, type) => {
  const v = byType[type];
  if (v instanceof Error) throw v;
  if (typeof v === 'function') return v();
  return v;
};

test('an IPv4-only public site and an IPv6-only public site both pass', async () => {
  await withResolver(answers({ A: [PUB4], AAAA: notFound() }), async () => {
    assert.equal(await resolvesPublic('v4only.example'), true);
  });
  await withResolver(answers({ A: notFound(), AAAA: [PUB6] }), async () => {
    assert.equal(await resolvesPublic('v6only.example'), true);
  });
});

test('a public A answer beside a private AAAA answer refuses the name', async () => {
  await withResolver(answers({ A: [PUB4], AAAA: ['fd00::1'] }), async () => {
    assert.equal(await resolvesPublic('mixed.example'), false);
  });
});

test('a public A answer beside an AAAA query that FAILED (not absent) is not established — false', async () => {
  await withResolver(answers({ A: [PUB4], AAAA: servfail() }), async () => {
    assert.equal(await resolvesPublic('servfail.example'), false, 'SERVFAIL on AAAA is not "no AAAA record"');
  });
  const timedOut = new Error('timed out'); timedOut.name = 'TimedOut';
  await withResolver(answers({ A: timedOut, AAAA: [PUB6] }), async () => {
    assert.equal(await resolvesPublic('timeout.example'), false, 'a timed-out A query is not "no A record"');
  });
});

test('both types absent, or no resolver at all, answers false', async () => {
  await withResolver(answers({ A: notFound(), AAAA: notFound() }), async () => {
    assert.equal(await resolvesPublic('nx.example'), false);
  });
  await withResolver(undefined, async () => {
    assert.equal(await resolvesPublic('any.example'), false);
  });
});

test('the two queries are asked together, not one after the other', async () => {
  let inFlight = 0, peak = 0;
  const slow = async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 20)); inFlight--; return null; };
  await withResolver(async (_h, type) => { await slow(); return type === 'A' ? [PUB4] : [PUB6]; }, async () => {
    assert.equal(await resolvesPublic('both.example'), true);
  });
  assert.equal(peak, 2, 'A and AAAA in flight at the same time');
});

test('the caller\'s signal reaches the resolver, and an abort answers false promptly', async () => {
  const seen = [];
  /* Deno-like: a query that hangs until its signal aborts, then rejects with an AbortError */
  const hanging = (_h, type, opts) => {
    seen.push({ type, signal: opts && opts.signal });
    if (type === 'A') return Promise.resolve([PUB4]);
    return new Promise((_res, rej) => {
      const s = opts && opts.signal;
      if (s) s.addEventListener('abort', () => rej(s.reason || new DOMException('aborted', 'AbortError')), { once: true });
    });
  };
  const ctl = new AbortController();
  await withResolver(hanging, async () => {
    const t0 = Date.now();
    const p = resolvesPublic('hang.example', { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 30);
    assert.equal(await p, false);
    assert.ok(Date.now() - t0 < 1000, 'returned when the signal aborted');
  });
  assert.equal(seen.length, 2);
  for (const s of seen) assert.equal(s.signal, ctl.signal, `the ${s.type} query was handed the caller's signal`);

  /* a resolver that ignores the signal still cannot hold the caller past it */
  const deaf = (_h, type) => (type === 'A' ? Promise.resolve([PUB4]) : new Promise(() => {}));
  const ctl2 = new AbortController();
  await withResolver(deaf, async () => {
    const p = resolvesPublic('deaf.example', { signal: ctl2.signal });
    setTimeout(() => ctl2.abort(), 30);
    assert.equal(await p, false);
  });

  /* an already-aborted signal asks nothing */
  let asked = 0;
  await withResolver(async () => { asked++; return [PUB4]; }, async () => {
    assert.equal(await resolvesPublic('late.example', { signal: AbortSignal.abort() }), false);
  });
  assert.equal(asked, 0);
});

test('fetchGuarded refuses a redirect whose target name cannot be established public', async () => {
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (u, init) => {
    fetched.push({ u: String(u), signal: init.signal });
    return new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/a' } });
  };
  const budget = new AbortController();
  const dnsSignals = [];
  try {
    await withResolver(async (h, type, opts) => {
      dnsSignals.push(opts && opts.signal);
      if (h === 'elsewhere.example' && type === 'AAAA') throw servfail();
      return type === 'A' ? [PUB4] : [PUB6];
    }, async () => {
      await assert.rejects(
        fetchGuarded('https://start.example/x', {
          timeoutMs: 5000,
          signal: budget.signal,
          allowRedirect: async (next) => resolvesPublic(next.hostname, { signal: budget.signal }),
        }),
        (e) => e instanceof RelayError && e.code === 'upstream_redirect',
      );
    });
  } finally { globalThis.fetch = realFetch; }
  assert.equal(fetched.length, 1, 'the refused hop was never fetched');
  assert.ok(dnsSignals.length === 2 && dnsSignals.every((s) => s === budget.signal), 'the hop\'s DNS ran under the request budget');
  /* the fetch's own signal follows the caller's budget */
  assert.equal(fetched[0].signal.aborted, false);
  budget.abort();
  assert.equal(fetched[0].signal.aborted, true, 'aborting the request budget aborts the fetch');
});

test('fetchGuarded still keeps its own deadline when the caller passes a signal', async () => {
  const realFetch = globalThis.fetch;
  let sig;
  globalThis.fetch = async (_u, init) => {
    sig = init.signal;
    return new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason), { once: true }));
  };
  try {
    await assert.rejects(
      fetchGuarded('https://start.example/x', { timeoutMs: 30, signal: new AbortController().signal }),
      (e) => e instanceof RelayError,
    );
  } finally { globalThis.fetch = realFetch; }
  assert.equal(sig.aborted, true);
});

test('every resolvesPublic call in the Edge Functions runs under a signal', () => {
  const dir = join(ROOT, 'supabase/functions');
  const calls = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|js)$/.test(ent.name)) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/(?<![\w.])resolvesPublic\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
          if (/export\s+async\s+function\s*$/.test(src.slice(0, m.index))) continue;   /* the definition */
          if (!m[1].trim()) continue;   /* `resolvesPublic()` named in prose — a call always passes a hostname */
          calls.push({ file: p.slice(ROOT.length + 1), args: m[1] });
        }
      }
    }
  };
  walk(dir);
  assert.ok(calls.length > 0, 'the callers were found');
  for (const c of calls) assert.match(c.args, /\bsignal\b/, `${c.file}: resolvesPublic(${c.args}) has no time budget`);
});
