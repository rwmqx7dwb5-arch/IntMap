#!/usr/bin/env node
/* (mcp-oauth) Measures the MCP client against REAL hosted MCP servers — the thing the mock tests cannot say.
   Usage: node scripts/mcp-real-probe.mjs [--oauth]
   · open servers (no sign-in): connects, lists tools, runs one read-only tool, reports protocol and timings;
   · --oauth: for servers that answer 401, runs discovery + dynamic client registration for real and prints the sign-in URL it WOULD open
     (it cannot sign in: that needs the reader's own account at the service). Registers a throw-away public client at each service.
   Nothing here is a secret; it writes nothing to disk. Node's fetch has no CORS: the browser side is measured separately (curl with an Origin header). */
import { createMcpClient } from '../js/atlas-mcp-client.js';

const REDIRECT = 'https://rwmqx7dwb5-arch.github.io/IntMap/mcp-oauth-callback.html';
const mem = {}; const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
const c = createMcpClient({ storage, relayUrl: null, redirectUri: REDIRECT, timeoutMs: 45000 });
const open = [
  { name: 'deepwiki', url: 'https://mcp.deepwiki.com/mcp', tool: 'read_wiki_structure', args: { repoName: 'modelcontextprotocol/modelcontextprotocol' } },
  { name: 'context7', url: 'https://mcp.context7.com/mcp', tool: 'resolve-library-id', args: { query: 'react hooks', libraryName: 'react' } },
];
const oauth = [['linear', 'https://mcp.linear.app/mcp'], ['notion', 'https://mcp.notion.com/mcp'], ['sentry', 'https://mcp.sentry.dev/mcp']];
const t0 = () => Date.now();
for (const s of open) {
  c.addServer({ name: s.name, url: s.url, readOnly: true });
  let t = t0();
  try {
    const r = await c.refresh(s.name);
    console.log(`[${s.name}] protocol=${c._live[s.name].mode}${c._live[s.name].version ? ' ' + c._live[s.name].version : ''} tools=${r.tools.length} (${t0() - t} ms) e.g. ${r.tools.slice(0, 4).map((x) => x.tool).join(', ')}`);
    t = t0();
    const k = await c.callTool({ server: s.name, tool: s.tool, arguments: s.args }, { mustBeReadOnly: true });
    console.log(`[${s.name}] call ${s.tool}: ok=${k.ok} code=${k.code || '-'} chars=${(k.raw || '').length} (${t0() - t} ms)`);
    if (k.raw) console.log('   ' + k.raw.replace(/\s+/g, ' ').slice(0, 160));
  } catch (e) { console.log(`[${s.name}] FAILED ${e.code || ''} ${e.message}`); }
}
if (process.argv.includes('--oauth')) {
  for (const [name, url] of oauth) {
    c.addServer({ name, url });
    const r = await c.callTool({ server: name, tool: 'x' }).catch((e) => ({ code: e.code }));
    console.log(`[${name}] unauthenticated: ${r.code}` + (r.auth && r.auth.resourceMetadata ? ' resource_metadata=' + r.auth.resourceMetadata : ''));
    try {
      const b = await c.beginOAuth(name);
      const q = new URL(b.url).searchParams;
      console.log(`[${name}] OAuth ready: issuer=${b.issuer} client=${q.get('client_id')} scope="${b.scope}" S256=${q.get('code_challenge_method')} resource=${q.get('resource')}\n   ${new URL(b.url).origin}${new URL(b.url).pathname}`);
    } catch (e) { console.log(`[${name}] OAuth NOT ready: ${e.code} — ${e.message}`); }
  }
}
