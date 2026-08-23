/* ============================================================================
 *  IntMap · Wikidata / HTTP plumbing shared by the company data pipeline
 * ----------------------------------------------------------------------------
 *  Three transports, because the three questions have different shapes:
 *
 *    sparql()    "which items satisfy this pattern" — WDQS. Expensive; every query
 *                here is written to stay inside the public query budget, and a 502
 *                from the front proxy is retried with backoff rather than treated
 *                as an empty answer (an empty answer would silently DROP data).
 *    entities()  "everything Wikidata knows about these 50 items" — wbgetentities.
 *                50 ids per request, language-filtered. This is the bulk path.
 *    httpJSON()  plain JSON over HTTP for SEC / GLEIF, with the same retry ladder.
 *
 *  Everything is cached on disk under .cache/companies/ (git-ignored) so a rebuild
 *  after an edit costs nothing and the upstreams are not hammered.
 * ==========================================================================*/
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, '.cache', 'companies');
const UA = 'IntMap-company-pipeline/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap; intmapofficial@gmail.com)';
/* ⚠ SEC's fair-access policy wants a declared identity, and www.sec.gov answers
   403 to the UA above — MEASURED: the same request with the string below returns
   200. It is the contact form SEC asks for (a name and a working address) and it
   carries no URL, which is what the edge appears to reject. */
export const SEC_UA = 'IntMap intmapofficial@gmail.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
export const qid = (u) => String(u || '').split('/').pop();
export const val = (r, k) => (r && r[k] ? r[k].value : '');

export function point(wkt) {
  const m = /^Point\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)$/.exec(String(wkt || ''));
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return (Number.isFinite(lon) && Number.isFinite(lat)) ? [lon, lat] : null;
}

function cachePath(kind, key) {
  const h = createHash('sha1').update(key).digest('hex').slice(0, 24);
  return join(CACHE, kind, h + '.json');
}
export function cacheGet(kind, key, maxAgeMs = 30 * 24 * 3600 * 1000) {
  const p = cachePath(kind, key);
  try {
    if (!existsSync(p)) return null;
    const o = JSON.parse(readFileSync(p, 'utf8'));
    if (Date.now() - o.t > maxAgeMs) return null;
    return o.v;
  } catch (_) { return null; }
}
export function cachePut(kind, key, v) {
  const p = cachePath(kind, key);
  try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify({ t: Date.now(), v })); } catch (_) {}
  return v;
}

/* ── generic fetch with a retry ladder ───────────────────────────────────────
   A transport failure must NEVER look like "upstream says there is nothing".
   Every caller treats a throw as fatal for that record, which is what keeps a
   flaky network from silently shrinking the dataset. */
export async function httpJSON(url, opts = {}) {
  const { headers = {}, method = 'GET', body = null, retries = 5, timeoutMs = 120000 } = opts;
  let wait = 1500;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method, body, signal: ac.signal, headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' }, headers) });
      clearTimeout(timer);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if ([429, 500, 502, 503, 504].indexOf(r.status) < 0) throw new Error('HTTP ' + r.status + ' ' + String(url).slice(0, 140));
    } catch (e) {
      clearTimeout(timer);
      if (i === retries) throw e;
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 45000);
  }
  throw new Error('retries exhausted: ' + String(url).slice(0, 140));
}

/* ── WDQS ────────────────────────────────────────────────────────────────── */
export async function sparql(query, opts = {}) {
  const { cache = true, maxAgeMs } = opts;
  if (cache) { const hit = cacheGet('sparql', query, maxAgeMs); if (hit) return hit; }
  const j = await httpJSON('https://query.wikidata.org/sparql', {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
    timeoutMs: 180000,
  });
  const rows = (j && j.results && j.results.bindings) || [];
  if (cache) cachePut('sparql', query, rows);
  return rows;
}

/* ── wbgetentities — the bulk path (50 ids per request) ──────────────────── */
export const WD_LANGS = 'en|ja|de|fr|es|ru|ko|zh|zh-hans|zh-hant';
export async function entities(ids, opts = {}) {
  const props = opts.props || 'claims|labels|descriptions';
  const out = {};
  const list = [...new Set(ids)].filter(Boolean);
  for (const grp of chunk(list, 50)) {
    const key = props + '|' + WD_LANGS + '|' + grp.join(',');
    let ents = cacheGet('ent', key);
    if (!ents) {
      const u = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=' + grp.join('%7C')
        + '&props=' + encodeURIComponent(props) + '&languages=' + encodeURIComponent(WD_LANGS);
      const j = await httpJSON(u);
      ents = (j && j.entities) || {};
      cachePut('ent', key, ents);
    }
    Object.assign(out, ents);
  }
  return out;
}

/* ── claim readers ───────────────────────────────────────────────────────── */
export const claims = (e, p) => (((e && e.claims && e.claims[p]) || []).filter((c) => c.rank !== 'deprecated'));
export function best(list) {
  if (!list || !list.length) return null;
  return list.find((c) => c.rank === 'preferred') || list[0];
}
export const dvItem = (c) => { try { return c.mainsnak.datavalue.value.id; } catch (_) { return null; } };
export const dvStr = (c) => { try { const v = c.mainsnak.datavalue.value; return typeof v === 'string' ? v : null; } catch (_) { return null; } };
export const dvTime = (c) => { try { return c.mainsnak.datavalue.value.time; } catch (_) { return null; } };
export const dvCoord = (c) => { try { const v = c.mainsnak.datavalue.value; return [v.longitude, v.latitude]; } catch (_) { return null; } };
export function dvQuantity(c) {
  try {
    const v = c.mainsnak.datavalue.value;
    return { amount: Number(String(v.amount).replace('+', '')), unit: qid(v.unit) };
  } catch (_) { return null; }
}
export function qualTime(c, p) { try { return c.qualifiers[p][0].datavalue.value.time; } catch (_) { return null; } }
export function qualItem(c, p) { try { return c.qualifiers[p][0].datavalue.value.id; } catch (_) { return null; } }
export function qualStr(c, p) { try { const v = c.qualifiers[p][0].datavalue.value; return typeof v === 'string' ? v : null; } catch (_) { return null; } }
export function qualQuantity(c, p) {
  try { const v = c.qualifiers[p][0].datavalue.value; return { amount: Number(String(v.amount).replace('+', '')), unit: qid(v.unit) }; } catch (_) { return null; }
}

/* Wikidata times are ISO-8601 with a leading sign and a precision code.
   Precision matters: "1976" and "1976-04-01" are different facts, and printing
   the second when Wikidata only asserts the first invents a day. */
export function wdDate(claim) {
  if (!claim) return null;
  let t = null;
  let prec = 11;
  try { t = claim.mainsnak.datavalue.value.time; prec = claim.mainsnak.datavalue.value.precision; } catch (_) { return null; }
  const m = /^([+-])(\d{4,})-(\d{2})-(\d{2})/.exec(String(t || ''));
  if (!m) return null;
  if (m[1] === '-') return null;
  const y = m[2].replace(/^0+(?=\d)/, '');
  if (prec <= 9) return y;
  if (prec === 10) return y + '-' + m[3];
  return y + '-' + m[3] + '-' + m[4];
}
export function timeYear(t) {
  const m = /^\+(\d{4,})/.exec(String(t || ''));
  return m ? Number(m[1]) : null;
}
export function label(e, langs) {
  const ls = langs || ['en'];
  for (const l of ls) { const v = e && e.labels && e.labels[l]; if (v && v.value) return v.value; }
  return null;
}
export function labelMap(e) {
  const out = {};
  const want = { ja: 'ja', de: 'de', fr: 'fr', es: 'es', ru: 'ru', ko: 'ko', 'zh-hant': 'zh-hant', 'zh-hans': 'zh-hans', zh: 'zh' };
  for (const k of Object.keys(want)) { const v = e && e.labels && e.labels[k]; if (v && v.value) out[k] = v.value; }
  return out;
}
