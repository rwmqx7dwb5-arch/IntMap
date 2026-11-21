// ============================================================================
//  IntMap · _shared/news-history.js — WHICH EVENTS ARE KEPT FOR YEARS, AND HOW THEY ARE TIED (news-event-history)
// ----------------------------------------------------------------------------
//  The rules behind public.news_event_history (docs/NEWS-EVENTS.md §19). Given an event, its articles, the
//  companies the entities stage found and the world-graph nodes, produce the one compact archive row — or say
//  the event is not worth keeping. PURE: no network, no clock, no Deno, no DOM (tests import it as it is).
//
//  ⚠ WHAT A TIE IS. world_refs holds a node only when the event's OWN TEXT names it (the node's name as a whole
//    phrase) or the entities stage already tied the event to that company. Proximity is never a tie: a plant
//    being near a point is not a statement by anyone. (The graph's own rule — «a tie is a statement».)
//  ⚠ WHAT `kind` IS. What the HEADLINE reports, read from a small multilingual lexicon, strongest first
//    (a closure that was once planned is a closure). `other` is the honest answer when no phrase matches;
//    the lexicon is a reader of headlines, not a judge of events, and the row says nothing more than it.
//  ⚠ WHAT A THREAD IS. One facility's series (plan -> construction -> operation). It is keyed by the facility's
//    world ref when the text names one; otherwise by company + a 1-degree cell (the same company in another
//    region is another thread); otherwise by the event itself. Two events in the same region that name different
//    facilities or companies are therefore different threads — that is the distinction, not a similarity score.
// ============================================================================

/* Seen 2026-11-20 on production: 4,464 of 20,669 events had >= 2 independent source families. */
export const HISTORY = Object.freeze({
  minSources: 2,        /* archive an event reported by this many independent source families … */
  maxSources: 12,       /* … keeping this many source links (the articles leave news_articles after 72 h) */
  maxRows: 300000,      /* the hard cap (~1.2 KB a row = ~360 MB with indexes); news_history_trim enforces it */
  cell: 1,              /* degrees; a 1-degree cell is ~110 km */
});

/* strongest first. English phrases are whole words; CJK phrases are substrings. */
const KIND_RULES = [
  ['closure', /\b(clos(e|es|ed|ing|ure)|shut(s|ting)? down|shutter(s|ed|ing)?|wind(s|ing)? down|cease(s|d)? (production|operations)|halt(s|ed)? production|mothball(s|ed)?|decommission(s|ed|ing)?|pull(s|ed|ing)? out of|exit(s|ed|ing)? the)\b|閉鎖|撤退|閉山|廃止|生産終了|操業停止|工場閉鎖|关闭|关停|撤出|폐쇄|철수/i],
  ['acquisition', /\b(acquir(e|es|ed|ing)|acquisition|takeover|take(s)? over|buy(s|ing)? (out|a stake)|bought|merg(e|es|ed|er)|divest(s|ed|ing|iture)?|sells? (its )?stake|stake sale)\b|買収|子会社化|合併|経営統合|並购|收购|인수|합병/i],
  ['construction_start', /\b(break(s|ing)? ground|groundbreaking|ground-breaking|begin(s)? construction|construction (begins|starts|started|kicks off)|start(s|ed)? construction|kick(s|ed)? off construction|lays? (the )?foundation)\b|着工|起工|建設開始|地鎮祭|动工|开工|착공/i],
  ['operational', /\b(begin(s)? (commercial )?(operation|operations|production)|start(s|ed)? (commercial )?(operation|operations|production)|goes? (online|live)|come(s)? online|commission(s|ed|ing)|inaugurat(e|es|ed|ion)|officially opens?|opens? (a|its|new)|mass production)\b|稼働|開所|開業|竣工|操業開始|量産開始|落成|投产|开业|量产|가동|준공/i],
  ['expansion', /\b(expand(s|ed|ing)?|expansion|additional (line|capacity|plant)|boost(s|ed)? capacity|add(s|ed)? capacity)\b|増設|拡張|増産|扩建|扩产|증설/i],
  ['plan', /\b(plan(s|ned|ning)? (to )?(build|construct|open|invest|set up)|to build|will build|proposed (plant|factory|fab|facility|terminal|refinery)|new (plant|factory|fab|facility|terminal|refinery)|unveil(s|ed)? plans?|announce(s|d)? plans?|invest(s|ing)? .{0,40}(plant|factory|fab|facility|terminal))\b|建設へ|新設へ|建設計画|新工場|建設を計画|计划建设|新建|건설 계획|신설/i],
];

export function classifyKind(title, summary) {
  const text = String(title || '') + ' ' + String(summary || '').slice(0, 300);
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return 'other';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[‘’'`"“”]/g, '').replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isCjk = (s) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

/**
 * Compile the matchers once per run. A node name matches only as a whole phrase; a Latin name must be at least
 * two words or 8 characters (so «Arun» alone is not enough but «Arun LNG terminal» is); a CJK name at least 4
 * characters. The «terminal»/«plant» suffix is optional in the text, so the stripped form of a two-word-or-longer
 * name is also accepted. ⚠ A name that is a common word is not rescued by this — the length floor is the rule.
 * @param {Array<{ref:string,name:string,type?:string,ids?:object}>} nodes
 */
export function makeWorldMatcher(nodes) {
  const phrases = [];
  const byCompanyId = new Map();
  for (const n of nodes || []) {
    if (!n || !n.ref || !n.name) continue;
    const ids = n.ids || {};
    if (ids.company) byCompanyId.set(String(ids.company), n.ref);
    if (/^company:[a-z0-9-]+$/.test(n.ref) && !/^company:wd-/.test(n.ref)) byCompanyId.set(n.ref.slice(8), n.ref);
    const full = norm(n.name);
    const forms = new Set([full]);
    const stripped = full.replace(/\s+(lng|terminal|plant|factory|refinery|fab|facility|power station)(\s+terminal)?$/i, '').trim();
    if (stripped.split(' ').length >= 2) forms.add(stripped);
    for (const f of forms) {
      if (isCjk(f) ? f.length < 4 : (f.length < 8 && f.split(' ').length < 2)) continue;
      phrases.push({ ref: n.ref, f, re: isCjk(f) ? null : new RegExp('(^|[^a-z0-9])' + escRe(f) + '($|[^a-z0-9])') });
    }
  }
  return {
    byCompanyId,
    /** the refs whose names the text states */
    match(text) {
      const t = norm(text);
      const out = new Set();
      for (const p of phrases) if (p.re ? p.re.test(t) : t.includes(p.f)) out.add(p.ref);
      return [...out].sort();
    },
  };
}

export function cellKey(lng, lat, cell = HISTORY.cell) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return 'nowhere';
  return Math.floor(lat / cell) + ',' + Math.floor(lng / cell);
}

/** The series this event belongs to. Pure function of the tie and the place — never of similarity. */
export function threadKey({ publicId, worldRefs, companyIds, lng, lat }) {
  const refs = (worldRefs || []).filter((r) => !/^company:/.test(r)).sort();
  if (refs.length) return 'ref:' + refs[0];
  const co = [...(companyIds || [])].sort()[0];
  if (co && Number.isFinite(lng) && Number.isFinite(lat)) return 'co:' + co + '@' + cellKey(lng, lat);
  return 'ev:' + publicId;
}

/**
 * The archive row, or null when the event is not worth keeping for years.
 * ev: a news_events row; articles: [{title,canonical_url,published_at,source_id,source_name,source_family}];
 * companyIds: ids from news_event_entities; matcher: makeWorldMatcher(nodes); starred: saved by a reader.
 */
export function buildArchiveRow(ev, articles, companyIds, matcher, starred) {
  if (!ev || !ev.public_id || !ev.representative_title) return null;
  const text = ev.representative_title + ' ' + (ev.summary || '') + ' ' + (articles || []).map((a) => a.title).join(' ');
  const refs = new Set(matcher ? matcher.match(text) : []);
  const cos = [...new Set(companyIds || [])].sort();
  for (const id of cos) { const r = matcher && matcher.byCompanyId.get(id); if (r) refs.add(r); }
  const worldRefs = [...refs].sort();
  const sourceCount = Number(ev.independent_source_count) || 0;
  if (!(sourceCount >= HISTORY.minSources || worldRefs.length || cos.length || starred)) return null;
  const arts = (articles || []).filter((a) => a && a.canonical_url).slice()
    .sort((x, y) => String(x.published_at || '').localeCompare(String(y.published_at || '')));
  const seenFam = new Set(); const sources = [];
  for (const a of arts) {
    const fam = a.source_family || a.source_id;
    if (seenFam.has(fam) && sources.length >= 3) continue;
    seenFam.add(fam);
    sources.push({ name: a.source_name || a.source_id || '', url: a.canonical_url, title: String(a.title || '').slice(0, 240), at: a.published_at || null });
    if (sources.length >= HISTORY.maxSources) break;
  }
  const lng = Number.isFinite(ev.rep_lng) ? ev.rep_lng : null, lat = Number.isFinite(ev.rep_lat) ? ev.rep_lat : null;
  const occurred = ev.first_published_at || ev.first_seen_at;
  if (!occurred) return null;
  return {
    event_public_id: ev.public_id, event_id: ev.id, merged_into: null,
    thread_key: threadKey({ publicId: ev.public_id, worldRefs, companyIds: cos, lng, lat }),
    title: String(ev.representative_title).slice(0, 400), summary: ev.summary ? String(ev.summary).slice(0, 1200) : null,
    category: ev.primary_category || 'world', kind: classifyKind(ev.representative_title, ev.summary),
    occurred_at: occurred, last_reported_at: ev.last_article_at || null,
    place_name: ev.rep_place_name_en || null, lng: lng == null || lat == null ? null : lng, lat: lng == null || lat == null ? null : lat,
    world_refs: worldRefs, company_ids: cos, source_count: sourceCount, sources, starred: !!starred,
  };
}
