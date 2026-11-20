#!/usr/bin/env node
/* ============================================================================
 *  scripts/upstream-change.mjs — DID AN UPSTREAM CHANGE UNDER A BUNDLE NOBODY REBUILT?
 * ----------------------------------------------------------------------------
 *  BEFORE THIS FILE, ONE BUILDER WATCHED ITS UPSTREAM (build-hist-eras.mjs --check-upstream). The other
 *  78 builders that write into data/ declare where their rows come from (GOVERNANCE `url` /
 *  `upstreams[].url`) and nothing ever looked again, so an upstream that published a new edition, moved,
 *  or went away was found by a reader (memory intmap-discovered-list-is-a-photograph: the same shape).
 *  `freshness-stated` compares the date we wrote a bundle with a declared period; it cannot see that the
 *  upstream moved on inside that period.
 *
 *  WHAT THIS DOES. The roster is DISCOVERED from the builders' own declarations (never listed here). For
 *  every distinct upstream URL it takes ONE fingerprint — the validators the server itself states
 *  (ETag, Last-Modified, Content-Length) — and compares it with the one recorded in
 *  data/upstream-fingerprints.json, the answer from the last time somebody looked.
 *
 *      changed     a validator the server states now differs from the recorded one
 *      unchanged   every validator both sides state agrees
 *      unobserved  this runner could not look (no answer, a non-2xx, a timeout) — NOT «changed», NOT «fine»
 *      unprobeable the server states no validator at all (an API that answers a query fresh each time):
 *                  recorded as such with the reason; this script does not claim to watch it
 *      new         no recorded fingerprint yet
 *
 *  ⚠ 「確認できなかった」 IS NOT 「変わらなかった」 and not 「変わった」 (.agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ A VALIDATOR THE SERVER DID NOT STATE IS NEVER INVENTED. No body is hashed: a body that embeds a
 *  timestamp or a rendered date differs every time and would report change where there is none, and
 *  fetching 165 MB nightly is not a probe. A resource with no validator is `unprobeable` and says so.
 *  ⚠ A CHANGE IS A PROMPT TO LOOK, NOT A VERDICT. An upstream that changed may have changed in a way the
 *  bundle does not carry. The nightly prints the list; whoever rebuilds decides, and `--update` then
 *  records the new fingerprint.
 *
 *  Run:
 *    node scripts/upstream-change.mjs --check      offline: every discovered upstream URL has a recorded
 *                                                  fingerprint row (or says why none is possible)
 *    node scripts/upstream-change.mjs              measure (network); print; exit 0 — a change is reported,
 *                                                  never silently absorbed
 *    node scripts/upstream-change.mjs --update     … and record what was observed (only observations: an
 *                                                  `unobserved` URL keeps its previous row)
 *    node scripts/upstream-change.mjs --fail-on-change   exit 1 when anything `changed` (the nightly)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upstreamRoster, readUpstreamStore } from './data-governance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STORE = 'data/upstream-fingerprints.json';

/* the governance record — check:datagov reads it statically, so the key is a literal path (same as STORE). The file states
   what servers answered to a HEAD request on the day it was written; no supplier's data travels in it. */
export const GOVERNANCE = {
  'data/upstream-fingerprints.json': {
    publisher: 'IntMap (scripts/upstream-change.mjs)',
    licence: 'IntMap — Personal & Research Use License (LICENSE)',
    licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
    attribution: false,
    cadence: 'P1M',
    cadenceBasis: {
      kind: 'estimate',
      observed: 'estimate, not measured: nothing schedules a re-recording — a person runs --update after looking at what the nightly or a manual run reported as changed, so how often it happens is a habit, not a period anybody declared',
      expires: 'when a scheduled job records the fingerprints itself, or a period is agreed for reviewing them',
      canon: 'scripts/upstream-change.mjs',
    },
    builtBy: 'scripts/upstream-change.mjs',
  },
};
const has = (k) => process.argv.includes(k);

/* A URL that is a template or a base cannot be asked as written. */
const askable = (u) => typeof u === 'string' && /^https?:\/\/[^\s{}<>]+$/.test(u) && !/\$\{|\{[a-z]/i.test(u);

export const roster = upstreamRoster;
export const readStore = readUpstreamStore;

const VALIDATORS = ['etag', 'lastModified', 'contentLength'];

/* ONE observation of one URL. HEAD first; a server that refuses HEAD is asked GET with a 1-byte range
   (a different request, not a retry of the same one). */
export async function fingerprint(url, fetchImpl = fetch) {
  const attempt = async (init) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try { return await fetchImpl(url, { ...init, signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'IntMap-upstream-change/1', ...(init.headers || {}) } }); }
    finally { clearTimeout(t); }
  };
  let res = null, how = 'head', err = null;
  try { res = await attempt({ method: 'HEAD' }); } catch (e) { err = String(e && e.message || e); }
  if (!res || !res.ok) {
    try { const r2 = await attempt({ method: 'GET', headers: { range: 'bytes=0-0' } }); if (r2 && (r2.ok || r2.status === 206)) { res = r2; how = 'get-range'; err = null; } else if (!res) { res = r2; err = null; } } catch (e) { err = err || String(e && e.message || e); }
  }
  if (!res) return { state: 'unobserved', why: 'no-answer', detail: err };
  if (!(res.ok || res.status === 206)) return { state: 'unobserved', why: 'status-' + res.status };
  const h = (n) => res.headers.get(n);
  const cr = h('content-range');
  const out = {
    etag: h('etag') || null,
    lastModified: h('last-modified') || null,
    /* a ranged GET reports the TOTAL after the slash; a HEAD states content-length directly */
    contentLength: how === 'get-range' ? (cr && /\/(\d+)$/.exec(cr) ? +/\/(\d+)$/.exec(cr)[1] : null) : (h('content-length') != null ? +h('content-length') : null),
  };
  if (!VALIDATORS.some((k) => out[k] != null)) return { state: 'unprobeable', why: 'server-states-no-validator', status: res.status };
  return { state: 'observed', ...out, via: how, status: res.status };
}

/* previous row × new observation → the verdict. Pure. */
export function compare(prev, now) {
  if (now.state === 'unobserved') return { verdict: 'unobserved', why: now.why };
  if (now.state === 'unprobeable') return { verdict: 'unprobeable', why: now.why };
  if (!prev || prev.state !== 'observed') return { verdict: 'new' };
  const differs = VALIDATORS.filter((k) => prev[k] != null && now[k] != null && prev[k] !== now[k]);
  /* ⚠ weak ETags and a CDN that re-signs a response can differ while the bytes do not; Last-Modified
     and Content-Length are the second opinion. Both being equal while the ETag differs is `unchanged`
     with a note, not `changed`. */
  if (differs.length === 0) return { verdict: 'unchanged' };
  if (differs.length === 1 && differs[0] === 'etag' && prev.lastModified === now.lastModified && prev.contentLength === now.contentLength && (prev.lastModified != null || prev.contentLength != null)) {
    return { verdict: 'unchanged', note: 'etag-only-difference' };
  }
  return { verdict: 'changed', differs };
}

async function main() {
  const ro = roster();
  const store = readStore();
  const urls = [...ro.keys()].filter(askable).sort();
  const skipped = [...ro.keys()].filter((u) => !askable(u)).sort();

  if (has('--check')) {
    let bad = 0;
    if (!store || store._broken) { console.log('✖ ' + STORE + ' ' + (store ? 'is unreadable: ' + store._broken : 'does not exist — run `node scripts/upstream-change.mjs --update`')); process.exit(1); }
    const rows = store.upstreams || {};
    const missing = urls.filter((u) => !rows[u]);
    const gone = Object.keys(rows).filter((u) => !ro.has(u));
    if (missing.length) { bad++; console.log('✖ ' + missing.length + ' declared upstream URL(s) have no fingerprint row: ' + missing.slice(0, 8).join(', ')); }
    if (gone.length) { bad++; console.log('✖ ' + gone.length + ' fingerprint row(s) are for a URL no builder declares any more: ' + gone.slice(0, 8).join(', ')); }
    if (!bad) console.log('ok   ' + urls.length + ' upstream URL(s) discovered from the builders, each with a fingerprint row (' + skipped.length + ' URL(s) are templates and cannot be asked as written)');
    process.exit(bad ? 1 : 0);
  }

  const prevRows = (store && store.upstreams) || {};
  const results = [];
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const now = await fingerprint(u);
      results.push({ url: u, subjects: [...ro.get(u)].sort(), now, ...compare(prevRows[u], now) });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  results.sort((a, b) => a.url.localeCompare(b.url));
  const tally = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  console.log('upstream-change: ' + urls.length + ' URL(s) — ' + Object.entries(tally).map(([k, v]) => k + ' ' + v).join(' · '));
  for (const r of results) if (r.verdict === 'changed') console.log('  CHANGED  ' + r.url + '  (' + r.differs.join(',') + ')  ← ' + r.subjects.join(', '));
  for (const r of results) if (r.verdict === 'unobserved') console.log('  unobserved ' + r.url + '  (' + r.why + ')');

  if (has('--update')) {
    const at = new Date().toISOString();
    const rows = {};
    for (const u of urls) {
      const r = results.find((x) => x.url === u);
      if (r.now.state === 'unobserved') { if (prevRows[u]) rows[u] = prevRows[u]; else rows[u] = { state: 'unobserved', why: r.now.why, observedAt: null, subjects: r.subjects }; continue; }
      rows[u] = { ...r.now, observedAt: at, subjects: r.subjects };
    }
    const out = {
      note: 'The last fingerprint of each upstream URL the builders declare (scripts/upstream-change.mjs). Validators are what the SERVER stated; nothing here is a hash of a body or an inferred value. `unobserved` means no run has yet been able to look. A recorded row is the answer of the last time somebody looked, not a claim about today.',
      generatedAt: at,
      declaredBy: 'scripts/upstream-change.mjs',
      upstreams: rows,
    };
    fs.writeFileSync(path.join(ROOT, STORE), JSON.stringify(out, null, 1) + '\n');
    console.log('recorded ' + Object.keys(rows).length + ' row(s) in ' + STORE);
  }
  if (has('--fail-on-change') && results.some((r) => r.verdict === 'changed')) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
