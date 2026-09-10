/* ============================================================================
 *  IntMap · the labels OpenHistoricalMap's `wikidata` tags point at           (#R695)
 * ----------------------------------------------------------------------------
 *  The only network this round adds. `wbgetentities` answers 50 items per request, so the whole
 *  admin-1/2 extract is ~140 requests once, and never again: the cache is keyed BY ITEM, not by the
 *  batch an item happened to fall into — #R669 measured what the other key costs (admitting one
 *  more record shifted every later batch boundary and re-downloaded 3.4 GB).
 *
 *  ⚠ THE HARVEST ASKS FOR ALL NINE LANGUAGES WHATEVER SHIPS. scripts/histnames/langs.mjs narrows
 *  the SHIPPED table to English and Japanese this round; narrowing the cache too would mean that
 *  restoring the full set — the one edit that module promises — silently re-downloaded everything.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { harvestWikidataCodes, wikidataCodes, codeForTag, registry } from './langs.mjs';

const API = 'https://www.wikidata.org/w/api.php';
const UA = 'IntMap/build-hist-admin1 (+https://github.com/rwmqx7dwb5-arch/IntMap)';

export function cacheDir(root) {
  const d = path.join(root, 'node_modules', '.cache', 'intmap-histadmin');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function getJSON(url, tries = 5) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return JSON.parse(await r.text());
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 2500 * (i + 1))); }
  }
  throw last || new Error('wikidata exhausted');
}

/**
 * Fetch (and cache) the labels of every QID given.
 * @returns Map qid → {code: label} in WIKIDATA's own language codes
 */
export async function labelsFor(qids, root, log = () => {}) {
  const dir = cacheDir(root);
  const langs = harvestWikidataCodes(root).join('|');
  const want = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  const out = new Map();
  const missing = [];
  for (const q of want) {
    const f = path.join(dir, q + '.json');
    if (fs.existsSync(f)) { try { out.set(q, JSON.parse(fs.readFileSync(f, 'utf8'))); continue; } catch (_) { /* re-fetch */ } }
    missing.push(q);
  }
  log('  wikidata: ' + out.size + ' cached, ' + missing.length + ' to fetch');
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const url = API + '?action=wbgetentities&format=json&props=labels&languages=' + encodeURIComponent(langs)
      + '&ids=' + chunk.join('|');
    const j = await getJSON(url);
    const ents = (j && j.entities) || {};
    for (const q of chunk) {
      const e = ents[q];
      const lab = {};
      /* a redirected item answers under its target id; an item that no longer exists answers with
         `missing`. Both are recorded — as the empty table — so a resumed run does not ask again. */
      const src = (e && e.labels) || (e && e.redirects && ents[e.redirects.to] && ents[e.redirects.to].labels) || {};
      for (const k of Object.keys(src)) if (src[k] && src[k].value) lab[k] = src[k].value;
      out.set(q, lab);
      fs.writeFileSync(path.join(dir, q + '.json'), JSON.stringify(lab));
    }
    log('\r  wikidata ' + Math.min(i + 50, missing.length) + '/' + missing.length + '   ');
  }
  return out;
}

/**
 * One item's labels, keyed by the OSM suffix the bundle uses, narrowed to the suffixes given.
 * ⚠ The per-language candidate order is scripts/histeras/match.mjs's, so «which Chinese is bare
 * `zh`» is answered in one place for both name pipelines.
 */
export function labelsByTag(labels, tags, reg = registry()) {
  const out = {};
  for (const tag of tags) {
    const code = codeForTag(tag, reg);
    if (!code) continue;
    for (const w of wikidataCodes(code)) {
      const v = labels && labels[w];
      if (v) { out[tag] = v; break; }
    }
  }
  return out;
}
