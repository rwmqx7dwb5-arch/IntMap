// (#R333) The CORS contract an Edge Function declares, read out of the repository.
// ----------------------------------------------------------------------------------------------
//  WHY THIS EXISTS
//    The front end is deployed by pushing to main (GitHub Pages, deploy.yml). An Edge Function is
//    deployed by a human typing `supabase functions deploy`. Nothing compared the two, so the two
//    halves of one commit could — and did — end up in production out of step.
//
//    #R318 added the `x-intmap-turn` header so one user turn costs one use. The front end shipped
//    it; ai-proxy did not. A custom request header the server does not list in
//    Access-Control-Allow-Headers makes the browser fail the PREFLIGHT, so the POST is never sent
//    and fetch() rejects — Atlas answered every question with a bare "Failed to fetch", and no
//    HTTP status ever reached the client to say why.
//
//  ⚠ A STATIC CHECK CANNOT CATCH THIS. The repository was self-consistent the whole time: js/
//    sent the header and supabase/functions/ai-proxy/index.ts allowed it. Only production
//    disagreed. That is why the assertion using this module lives in prod-smoke.spec.js, which
//    runs against the LIVE deployment after deploy.yml publishes.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLF } from '../../scripts/eol.mjs';

export const FN_DIR = 'supabase/functions';

/** Functions the repository ships. `_shared/` is a library the CLI bundles INTO its importers,
 *  not a function — declaring it as one is the mistake CLAUDE.md §5 calls out by name. */
export function repoFunctionNames(root) {
  const dir = join(root, FN_DIR);
  return readdirSync(dir)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter((n) => statSync(join(dir, n)).isDirectory())
    .filter((n) => existsSync(join(dir, n, 'index.ts')))
    .sort();
}

/** An Access-Control-Allow-Headers value → a normalised set. Header names are case-insensitive. */
export function parseAllowHeaders(value) {
  return new Set(String(value || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const ACAH_RE = /["']Access-Control-Allow-Headers["']\s*:\s*["']([^"']*)["']/gi;
const CORSFOR_RE = /corsFor\(\s*(?:["']([^"']*)["'])?\s*\)/g;
const SHARED_GUARD = '_shared/relay-guard.js';

/** Exactly-one-match or refuse.
 *  ⚠ (#R323) A regex over a whole file cannot say WHICH table it matched. Two matches means the
 *  answer is ambiguous, so refuse loudly instead of silently taking the first — that is exactly how
 *  a check ends up describing a table nobody ships. */
function onlyMatch(src, re, label, what) {
  const hits = [...String(src).matchAll(re)];
  if (hits.length === 0) return null;
  if (hits.length > 1) throw new Error(`${label}: ${what} appears ${hits.length}x — ambiguous`);
  return hits[0];
}

/** The header set ONE index.ts declares literally, or null when it declares none. */
export function declaredAllowHeaders(src, label = 'source') {
  const m = onlyMatch(src, ACAH_RE, label, 'Access-Control-Allow-Headers');
  return m ? parseAllowHeaders(m[1]) : null;
}

/** The base set `corsFor()` builds on, read out of _shared/relay-guard.js. */
export function sharedCorsBase(root) {
  return declaredAllowHeaders(readLF(join(root, FN_DIR, SHARED_GUARD)), SHARED_GUARD);
}

/** The set ONE index.ts gets from `corsFor(extra)`, or null when it does not call it.
 *  corsFor concatenates: base + (extra ? ", " + extra : "") — see _shared/relay-guard.js. */
export function corsForAllowHeaders(src, base, label = 'source') {
  const m = onlyMatch(src, CORSFOR_RE, label, 'corsFor(...)');
  if (!m) return null;
  const out = new Set(base);
  for (const h of parseAllowHeaders(m[1] || '')) out.add(h);
  return out;
}

/** name → { headers, via } for EVERY function the repo ships.
 *  ⚠ A function whose contract cannot be read is reported with via:'unknown', never dropped. A
 *  silently shortened list reads as a complete one (#R320), and this list is the whole point. */
export function repoCorsContract(root) {
  const base = sharedCorsBase(root) || new Set();
  const out = new Map();
  for (const name of repoFunctionNames(root)) {
    // ⚠ index.ts ONLY. ai-proxy also carries index.gemini-backup.ts, which is not deployed and
    //   declares a CORS table of its own — reading the directory would compare a ghost.
    const label = `${name}/index.ts`;
    const src = readLF(join(root, FN_DIR, name, 'index.ts'));
    const literal = declaredAllowHeaders(src, label);
    if (literal) { out.set(name, { headers: literal, via: 'literal' }); continue; }
    const shared = corsForAllowHeaders(src, base, label);
    if (shared) { out.set(name, { headers: shared, via: 'corsFor' }); continue; }
    out.set(name, { headers: new Set(), via: 'unknown' });
  }
  return out;
}

const FRONT_RE = /['"](x-intmap-[a-z0-9-]+)['"]\s*(?:\]\s*=|:)/gi;

/** Custom `x-intmap-*` request headers the FRONT END actually sets, with the file that sets each.
 *  Matches both `headers['x-foo'] = v` and `{ 'x-foo': v }`; a bare mention in prose does not
 *  count, because a header nobody assigns is never sent and never needs allowing. */
export function frontendCustomHeaders(root, dir = 'js') {
  const out = new Map();
  const walk = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!e.name.endsWith('.js')) continue;
      for (const m of readLF(join(root, rel)).matchAll(FRONT_RE)) {
        const h = m[1].toLowerCase();
        if (!out.has(h)) out.set(h, []);
        if (!out.get(h).includes(rel)) out.get(h).push(rel);
      }
    }
  };
  walk(dir);
  return out;
}
