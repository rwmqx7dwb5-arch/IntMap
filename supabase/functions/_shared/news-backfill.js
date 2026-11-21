// ============================================================================
//  IntMap · _shared/news-backfill.js — PAST EVENTS FROM A DATED, SOURCED RECORD (news-event-history · backfill)
// ----------------------------------------------------------------------------
//  The live feeds only reach back to the day the collector started. A question such as «how did military tension
//  in the Taiwan Strait change over the last ten years» needs rows from before that. This module reads one
//  public record that exists for every day since 2004: Wikipedia's «Portal:Current events» daily pages. Each
//  page lists, per day and per section, the things that happened — one sentence each, with the PUBLISHERS'
//  links that reported it, nested under the running story it belongs to («Cross-Strait relations»).
//  PURE: no network, no clock, no Deno (tests import it as it is).
//
//  ⚠ WHAT A ROW SAYS. Exactly what the page says, no more: the sentence, the day (precision is a DAY — the row's
//    source is named «Wikipedia Current events» so a reader sees the grain), the publishers' links the editors
//    cited, the running story the editors filed it under. A sentence with no cited publisher is NOT kept (nobody
//    sourced it). IntMap adds no place and no judgement: world_refs / company_ids are the same whole-phrase ties
//    the live archive makes (news-history.js), and `kind` is the same headline reader — `other` when none fits.
//  ⚠ WHAT A THREAD IS HERE. The running story the page's own heading names — `wp:<article title>` — so the
//    series is the editors' statement, not a similarity score. A sentence under no running story is its own thread.
//  ⚠ LICENCE. The page text is CC BY-SA 4.0 (Wikipedia); the row carries the page URL as its first source and the
//    sources/privacy page names the record (js/legal-text.js).
// ============================================================================
import { classifyKind } from './news-history.js';

export const BACKFILL = Object.freeze({
  record: 'wikipedia-current-events',
  sourceName: 'Wikipedia Current events',
  pageUrl: (y, m, d) => 'https://en.wikipedia.org/wiki/Portal:Current_events/' + y + '_' + MONTHS[m - 1] + '_' + d,
  pageTitle: (y, m, d) => 'Portal:Current_events/' + y + '_' + MONTHS[m - 1] + '_' + d,
  perDayCap: 60,     /* observed 2022-08: the busiest days list ~40 sourced sentences */
  maxSources: 8,
});
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Delete every `<!-- … -->` span by position (no pattern that a removal could re-assemble); an unclosed one runs to the end. */
function dropComments(s) {
  let out = s, i;
  while ((i = out.indexOf('<!--')) >= 0) {
    const j = out.indexOf('-->', i + 4);
    out = out.slice(0, i) + (j < 0 ? '' : out.slice(j + 3));
  }
  return out;
}

/** Remove wiki markup, leaving the sentence a reader would read. */
export function plainText(s) {
  /* Repeat until nothing changes, then drop every angle bracket: one pass can leave a tag the first removal assembled
     (CodeQL js/incomplete-multi-character-sanitization). The result is a sentence, never HTML. */
  let t = String(s || ''), prev;
  do {
    prev = t;
    t = dropComments(t)
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[https?:\/\/[^\s\]]+(?:\s+[^\]]*)?\]/g, '')          /* external links: kept separately as sources */
      .replace(/\{\{[^{}]*\}\}/g, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/<[^<>]*>/g, '');
  } while (t !== prev);
  return t.replace(/[<>]/g, '').replace(/'{2,}/g, '').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

/** The first article a heading line links to — the running story's canonical title. */
export function firstWikiTarget(s) {
  const m = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/.exec(String(s || ''));
  return m ? m[1].trim().replace(/_/g, ' ') : null;
}

/** [{url,name}] from `[https://… (Name)]` / `[https://… Name]`. */
export function externalLinks(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g)) {
    const name = plainText(m[2] || '').replace(/^\(|\)$/g, '').trim();
    out.push({ url: m[1].replace(/&amp;/g, '&'), name: name || hostOf(m[1]) });
  }
  return out;
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

/**
 * One day's wikitext -> [{section, topic, topicTitle, text, links}].
 * A list line with a cited publisher is an event; a shallower line without one names the running story it sits under.
 */
export function parseDay(wikitext) {
  const out = [];
  let section = 'world';
  const stack = [];                       /* stack[depth] = the heading line at that depth */
  for (const raw of String(wikitext || '').split('\n')) {
    const line = raw.trimEnd();
    const sec = /^'''([^']+)'''\s*$/.exec(line);
    if (sec) { section = plainText(sec[1]).toLowerCase(); stack.length = 0; continue; }
    const m = /^(\*+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const depth = m[1].length, body = m[2];
    const links = externalLinks(body);
    stack.length = depth - 1;
    if (!links.length) { stack[depth - 1] = body; continue; }
    const text = plainText(body);
    if (text.length < 20) continue;
    let topic = null, topicTitle = null;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]) { const t = firstWikiTarget(stack[i]); if (t) { topicTitle = t; topic = t; break; } }
    }
    out.push({ section, topic, topicTitle, text, links });
  }
  return out;
}

/* FNV-1a, two seeds -> 16 hex chars. An id only has to be stable for the same sentence on the same day. */
export function stableHash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Archive rows for one day. `matcher` is makeWorldMatcher(nodes) from news-history.js (optional).
 * @returns {Array<object>} rows for public.news_history_upsert
 */
export function dayRows(year, month, day, wikitext, matcher) {
  const items = parseDay(wikitext).slice(0, BACKFILL.perDayCap);
  const date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const page = BACKFILL.pageUrl(year, month, day);
  const rows = [];
  for (const it of items) {
    const refs = matcher ? matcher.match(it.text) : [];
    const cos = [...new Set(refs.filter((r) => /^company:/.test(r) && !/^company:wd-/.test(r)).map((r) => r.slice(8)))].sort();
    const id = 'wce:' + date + ':' + stableHash(it.text);
    const nonCompany = refs.filter((r) => !/^company:/.test(r)).sort();
    const thread = it.topic ? 'wp:' + it.topic : nonCompany.length ? 'ref:' + nonCompany[0] : 'ev:' + id;
    const seen = new Set();
    const sources = [{ name: BACKFILL.sourceName, url: page, title: date, at: date + 'T12:00:00Z' }];
    for (const l of it.links) {
      if (seen.has(l.url) || sources.length > BACKFILL.maxSources) continue;
      seen.add(l.url);
      sources.push({ name: l.name, url: l.url, title: '', at: date + 'T12:00:00Z' });
    }
    rows.push({
      event_public_id: id, event_id: null, merged_into: null, thread_key: thread,
      title: it.text.slice(0, 400), summary: null, category: it.section.slice(0, 60), kind: classifyKind(it.text, ''),
      occurred_at: date + 'T12:00:00Z', last_reported_at: null, place_name: null, lng: null, lat: null,
      world_refs: refs, company_ids: cos, source_count: seen.size, sources, starred: false,
    });
  }
  return rows;
}

/** Wikitext of the daily pages from a MediaWiki `action=query&prop=revisions` reply (formatversion=2). */
export function pagesFromQuery(j) {
  const out = new Map();
  for (const p of (j && j.query && j.query.pages) || []) {
    if (p.missing) continue;
    const r = p.revisions && p.revisions[0];
    const txt = r && (r.slots && r.slots.main ? r.slots.main.content : r.content);
    if (typeof txt === 'string') out.set(String(p.title).replace(/ /g, '_'), txt);
  }
  return out;
}
