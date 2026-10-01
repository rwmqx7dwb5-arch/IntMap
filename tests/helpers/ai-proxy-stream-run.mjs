/* ============================================================================
 *  Runs supabase/functions/ai-proxy/index.ts in THIS node process, as a child of a check
 *  (tests/atlas-live-stream-checks.test.mjs). Deno.serve is captured and fetch is stubbed; nothing
 *  of the function under test is replaced. Configuration arrives as JSON in AIPS_CFG:
 *    env        the function's environment
 *    user       what /auth/v1/user answers
 *    provider   the provider's answers, consumed one per provider request, in order:
 *               { status, json }            — a plain body
 *               { sse: [[event, data]...],   — a server-sent-event body, cut into `chunk`-byte
 *                 chunk }                      pieces (bytes, so a character may be split)
 *    requests   [{ headers, body, cancelAfter?: 'open' }]
 *  Output (stdout, JSON): per request { status, ctype, json, events:[{event,data,callsAt}], calls }
 *  where `calls` is every fetch the function made for that request, in order, and `callsAt` is how
 *  many of them had been made when that event reached the reader.
 * ==========================================================================*/
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(process.env.AIPS_CFG || '{}');
const HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'];

globalThis.Deno = { env: { get: (k) => (cfg.env || {})[k] || '' }, serve: (h) => { globalThis.__h = h; } };
const seq = [];
let providerN = 0;
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const sseBody = (events, chunk) => {
  const text = events.map(([e, d]) => 'event: ' + e + '\r\ndata: ' + JSON.stringify(d) + '\r\n\r\n').join('');
  const bytes = new TextEncoder().encode(text);
  const n = Math.max(1, chunk || bytes.length);
  let off = 0;
  return new ReadableStream({ pull(c) { if (off >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(off, off + n)); off += n; } });
};
const routes = [
  [/\/auth\/v1\/user$/, () => json(cfg.user)],
  [/\/rest\/v1\/profiles/, () => json([])],
  [/\/rest\/v1\/rpc\/relay_take$/, () => json([{ allowed: true, remaining: 9 }])],
  [/\/rest\/v1\/rpc\/consume_ai_turn$/, () => json([{ allowed: true, used: 1, charged: true, calls: 1 }])],
  [/\/rest\/v1\/rpc\/(refund|settle)_ai_turn$/, () => json([{ ok: true }])],
  [/\/rest\/v1\/rpc\/record_ai_usage$/, () => json(null)],
];
globalThis.fetch = async (u, init) => {
  const s = String(u && u.url ? u.url : u);
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
  const provider = HOSTS.includes(new URL(s).hostname);
  seq.push({ url: s, provider, rpc: (/\/rpc\/([a-z_]+)$/.exec(s) || [])[1] || '', body: provider ? body : (/record_ai_usage$/.test(s) ? body : undefined) });
  if (provider) {
    const list = cfg.provider || [];
    const r = list[Math.min(providerN, list.length - 1)] || { status: 404, json: {} };
    providerN++;
    if (r.sse) return new Response(sseBody(r.sse, r.chunk), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    return json(r.json === undefined ? {} : r.json, r.status || 200);
  }
  const hit = routes.find(([re]) => re.test(s));
  return hit ? hit[1]() : json({ message: 'no route' }, 404);
};

await import(pathToFileURL(join(ROOT, 'supabase/functions/ai-proxy/index.ts')).href);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
for (const q of cfg.requests || []) {
  const before = seq.length;
  const r = await globalThis.__h(new Request('https://fn.test/', { method: 'POST', headers: q.headers, body: JSON.stringify(q.body) }));
  const ctype = r.headers.get('content-type') || '';
  const rec = { status: r.status, ctype, json: null, events: [], calls: [] };
  if (/event-stream/.test(ctype)) {
    const rd = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let stop = false;
    while (!stop) {
      const st = await rd.read();
      if (st.done) break;
      buf += dec.decode(st.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (block.startsWith(':')) { rec.events.push({ event: ':', data: null, callsAt: seq.length - before }); continue; }
        const ev = (/^event: (.*)$/m.exec(block) || [])[1] || 'message';
        const dl = (/^data: (.*)$/m.exec(block) || [])[1];
        rec.events.push({ event: ev, data: dl ? JSON.parse(dl) : null, callsAt: seq.length - before });
        if (q.cancelAfter && q.cancelAfter === ev) { stop = true; break; }
      }
    }
    if (stop) { try { await rd.cancel(); } catch (_) { /* gone */ } await wait(300); }
  } else {
    try { rec.json = await r.json(); } catch (_) { rec.json = null; }
  }
  rec.calls = seq.slice(before);
  out.push(rec);
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
