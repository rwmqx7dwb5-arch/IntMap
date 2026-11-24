#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS — WHAT EVERY TURN SENDS BEFORE THE USER SAYS A WORD  (a measurement, not a gate)
 * ----------------------------------------------------------------------------
 *  Each model call of a turn carries the tool definitions (name + description + JSON schema of every tool).
 *  Those bytes are the same on every call of every turn, so they are the part a prompt cache can serve at a
 *  fraction of the price — IF they are byte-identical and come FIRST. This measures, from the real surface:
 *
 *    · the size of the base tool list, per tool (chars; ≈ chars/4 tokens for English, ≈ chars/1.5 for Japanese)
 *    · whether the list is byte-stable across two builds (a cache hit needs it) and ordered the same
 *    · the size of the promoted tools find_capability adds when a query is answered (they ride on later calls)
 *
 *  And it reads the REAL provider answer from the cost record when handed one — `--ledger <run.json>`, a
 *  `run` object as js/atlas-run-ledger.js writes it (input / cachedInput tokens per call) — so «the cache is
 *  hit» is a measured share, not a hope.
 *
 *      node scripts/atlas-prompt-weight.mjs [--json] [--find "<query>"] [--ledger <run.json>]
 *
 *  ⚠ It limits nothing and gates nothing: it reports. Chars are chars; tokens are only estimated and say so.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const href = (p) => new URL(p, import.meta.url).href;
const { makeAtlasCapabilities } = await import(href('../js/atlas-capabilities.js'));
const { makeAtlasSchemas } = await import(href('../js/atlas-schemas.js'));
const { makeAtlasToolSurface } = await import(href('../js/atlas-toolsurface.js'));

function build() {
  const caps = makeAtlasCapabilities({});
  return { caps, surface: makeAtlasToolSurface({ capabilities: caps, schemas: makeAtlasSchemas(), runAction: async () => ({}) }) };
}
const wire = (t) => JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters });
const nonAscii = (s) => (s.match(/[^\x00-\x7f]/g) || []).length;
/** a rough token estimate: ASCII at 4 chars/token, everything else at 1.5 chars/token. An ESTIMATE — stated as one. */
export const estTokens = (s) => Math.round((s.length - nonAscii(s)) / 4 + nonAscii(s) / 1.5);

export async function measure(opts = {}) {
  const a = build(), b = build();
  const tools = Object.values(a.surface.baseTools());   /* an object keyed by tool name */
  const rows = tools.map((t) => { const w = wire(t); return { name: t.name, chars: w.length, descChars: String(t.description || '').length, estTokens: estTokens(w) }; }).sort((x, y) => y.chars - x.chars);
  const total = tools.reduce((s, t) => s + wire(t).length, 0);
  const again = Object.values(b.surface.baseTools());
  const stable = tools.length === again.length && tools.every((t, i) => wire(t) === wire(again[i]));
  const out = { baseTools: tools.length, chars: total, estTokens: tools.reduce((s, t) => s + estTokens(wire(t)), 0), byteStableAcrossBuilds: stable, tools: rows };
  if (opts.find) {
    const res = await a.surface.find(opts.find, {});
    const promoted = a.surface.promotionsOf(res);
    const schemaChars = (res.matches || []).reduce((n, x) => n + JSON.stringify(x.schema || {}).length, 0);
    out.find = { query: opts.find, matches: (res.matches || []).length, resultChars: JSON.stringify(res).length, schemaCharsInResult: schemaChars,
      documentationChars: String(res.documentation || '').length, promoted: promoted.length, promotedToolChars: promoted.reduce((n, t) => n + wire(t).length, 0) };
  }
  return out;
}

/** a cost-record `run` (js/atlas-run-ledger.js) → the measured cache share; null when the provider reported none */
export function cacheShare(run) {
  const calls = (run && (run.calls || run.providerCalls)) || [];
  let input = 0, cached = 0, seen = 0;
  for (const c of calls) {
    const i = Number(c.inputTokens != null ? c.inputTokens : c.input), k = Number(c.cachedTokens != null ? c.cachedTokens : c.cachedInput);
    if (!Number.isFinite(i)) continue;
    seen++; input += i; if (Number.isFinite(k)) cached += k;
  }
  return seen ? { calls: seen, inputTokens: input, cachedTokens: cached, share: input ? cached / input : null } : null;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const m = await measure({ find: arg('--find') });
  const led = arg('--ledger');
  if (led) m.cache = cacheShare(JSON.parse(readFileSync(led, 'utf8')));
  if (process.argv.includes('--json')) console.log(JSON.stringify(m, null, 2));
  else {
    console.log(m.baseTools + ' base tools · ' + m.chars + ' chars · ≈' + m.estTokens + ' tokens (estimate) · byte-stable across builds: ' + m.byteStableAcrossBuilds);
    for (const r of m.tools) console.log(String(r.chars).padStart(7) + '  ' + r.name + '  (description ' + r.descChars + ')');
    if (m.find) console.log('find_capability "' + m.find.query + '": ' + m.find.matches + ' matches · result ' + m.find.resultChars + ' chars (schemas ' + m.find.schemaCharsInResult + ', documentation ' + m.find.documentationChars + ') · promoted as tool definitions ' + m.find.promoted + ' · ' + m.find.promotedToolChars + ' chars');
    if (m.cache) console.log('provider cache: ' + m.cache.cachedTokens + ' of ' + m.cache.inputTokens + ' input tokens served from cache over ' + m.cache.calls + ' calls (' + (m.cache.share == null ? 'n/a' : (m.cache.share * 100).toFixed(1) + '%') + ')');
  }
}
