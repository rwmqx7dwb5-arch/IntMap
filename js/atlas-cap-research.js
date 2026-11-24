/* ============================================================================
 *  IntMap · Atlas capabilities — the `research.*` namespace   (js/atlas-cap-research.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, num, int, one, list, lat, lng, obj, bool, loose } from './atlas-caps.js';
import { stateLabel } from './relation-evidence.js';
import { scenarioModels, scenarioFrame, scenarioCall, scenarioReport, forecastReport } from './atlas-reasoning.js';   /* (atlas-reasoning) research.scenario: what is decided is in that module, as values */
import SIM_ENTRIES from './atlas-cap-sim.js';   /* the entries that declare a `scenario` ARE the models — discovered, not listed (same lazy chunk as this file) */
import { personaPrompt } from './atlas-persona.js';
import { datasetFactsOnPage } from './evidence-graph-record.js';   /* (evidence-graph) a GIS result put in front of the answer carries its lineage node */
import { settleWithin, lateNote } from './atlas-deadlines.js';
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { worldObjects } from './atlas-world-objects.js';   /* (world-objects) the one shape a result names the thing it is about by */
const W = worldObjects;   /* the one session index (js/atlas-world-objects.js) */
import { makeLogisticsImpact } from './logistics-impact.js';   /* (logistics-network) «this port stops» read from data/logistics-network.json */
import { makeWorldGraphStore } from './world-graph-store.js';
const LOGI = makeLogisticsImpact();
const G = makeWorldGraphStore({ worldObjects: W });   /* (world-graph) the persistent graph (Supabase) read into that same index */
import { placeProfile, hereNow, profileHtml, placeCardStyle } from './place-dossier.js';   /* (place-dossier · place-card-unify) the ONE place card: research.placeProfile and research.hereNow gather and draw the same record */
import { readQuakes } from './events-near.js';   /* (place-card-unify) the app's one reader of the USGS feed — shared with the card and the watched places */
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';   /* the one great-circle distance */
import { planOutline, runLongform, assemble, storageStore } from './atlas-longform.js';   /* (atlas-longform) research.longform: chapter by chapter, kept as it goes */
import { makeResearchSearch } from './atlas-research-search.js';   /* (atlas-research-search) research.search — the tool side of an investigation Atlas steers */
import { makeDelegation, makeWorkerExecutor, pageDelegationStore, delegationKey, CONTRACT_KINDS } from './atlas-delegate.js';
import { integrate, mergeFacts, makeFactResolver, makeCapabilityExecutor, makeRouterExecutor, verifyContract, verifyOutcome } from './atlas-orchestrate.js';   /* (atlas-orchestration) what is built on the substrate: the lane that runs one read capability, the router, and what several results say together */   /* (atlas-delegation) research.delegate — the substrate and its worker executor */
const researchMemory = { search: null };   /* research.search's per-turn memory — built on first use; a const holder (the kernel copy never runs it) */

/* ══ (atlas-completion) WHAT A RESEARCH ANSWER RESTS ON, SAID FROM WHAT HAPPENED ═══════════════════════════════
   An answer to a time-sensitive question used to carry ONE fixed caveat whenever `webUsed` was false —
   «a provisional assessment based mainly on already-gathered headlines» — whether the search timed out,
   was refused, ran and found nothing, or was never attached, and whether or not the answer cited a single
   headline. Both halves of that sentence are now read off the facts: the search's outcome as ai-proxy
   reported it (meta.web — supabase/functions/ai-proxy/provider-call.ts webOutcome) and the records the
   rendered claims actually cite (citedRecords). The same facts go to Atlas in the tool result, with the
   documents retrieved so far, so it can look the thing up another way instead of only being told it was not. */
function webOutcomeLine(w, L) {
  if (!w) return L('Whether a live web search ran was not reported for this answer.', 'この回答でライブWeb検索が実行されたかは報告されていません。');
  const why = w.reason ? String(w.reason) : '';
  if (w.state === 'failed') {
    if (why === 'timeout') return L('The live web search timed out, so the answer was written without it.', 'ライブWeb検索がタイムアウトしたため、検索なしで回答を作成しました。');
    if (why === 'rejected') return L('The AI provider refused the live web search for this request, so the answer was written without it.', 'AIプロバイダがこのリクエストでのライブWeb検索を受け付けなかったため、検索なしで回答を作成しました。');
    return L('The live web search failed (' + why + ').', 'ライブWeb検索が失敗しました（' + why + '）。');
  }
  if (w.state === 'empty') return L('The live web search ran (' + w.searches + ' searches) but found no matching pages.', 'ライブWeb検索は実行されました（' + w.searches + '回）が、該当するページは見つかりませんでした。');
  if (w.state === 'not_run' && why === 'model_did_not_search') return L('A live web search was available, but the model did not run it.', 'ライブWeb検索は利用可能でしたが、モデルは実行しませんでした。');
  if (w.state === 'not_run') return L('No live web search was available for this answer.', 'この回答ではライブWeb検索を利用できませんでした。');
  return '';
}
function groundsLine(records, L) {
  const n = { client_source: 0, app_data: 0, hosted_web: 0 };
  (records || []).forEach((r) => { if (r && Object.prototype.hasOwnProperty.call(n, r.origin)) n[r.origin]++; });
  const en = [], jp = [];
  if (n.hosted_web) { en.push(n.hosted_web + ' web page(s) found by the search'); jp.push('検索で見つかったWebページ ' + n.hosted_web + ' 件'); }
  if (n.client_source) { en.push(n.client_source + ' retrieved article(s) or page(s)'); jp.push('取得済みの記事・ページ ' + n.client_source + ' 件'); }
  if (n.app_data) { en.push(n.app_data + ' IntMap data record(s)'); jp.push('IntMapのデータ ' + n.app_data + ' 件'); }
  if (!en.length) return L('The answer cites no record IntMap retrieved — it rests on the model\'s own knowledge, so treat time-sensitive statements as unconfirmed.', 'この回答はIntMapが取得した記録を1件も引用しておらず、モデル自身の知識に基づいています。時間に依存する記述は未確認として扱ってください。');
  return L('What the answer cites: ' + en.join(', ') + '. Treat time-sensitive statements beyond those as unconfirmed.', 'この回答が引用しているのは ' + jp.join('、') + ' です。それ以外の時間に依存する記述は未確認として扱ってください。');
}
/* The pages retrieved earlier in THIS turn, carried into its next answer call so they have ids there
   (js/atlas-answer-pipeline.js opts.webSources). Keyed by the turn: a page from another turn is not handed on. */
const _turnPages = { turn: '', pages: [] };   /* read and written only by run (the kernel's copy of this module never runs it) */
function turnPages(turn) {
  if (!turn) return [];
  if (_turnPages.turn !== turn) { _turnPages.turn = turn; _turnPages.pages = []; }
  return _turnPages.pages;
}
function keepTurnPages(turn, list) {
  if (!turn) return;
  const pages = turnPages(turn);
  (list || []).forEach((x) => { if (x && x.url && !pages.some((q) => q.url === x.url)) pages.push({ url: x.url, title: x.title || '', publisher: x.publisher || '', retrievedAt: x.retrievedAt || '' }); });
}

/* ══ (world-objects) RESOLVING «THAT EARTHQUAKE / THIS VOLCANO / THAT COMPANY» TO ONE REAL-WORLD OBJECT ═══════════════
   The index (js/atlas-world-objects.js) holds what this session already surfaced; a miss falls through to the readers
   the product already has — the loaded news, the volcano catalogue, the company atlas, the USGS feed — each of which
   writes its record down through the SAME adapters. Nothing here guesses: a name nothing holds is answered as not found. */
/** the company atlas' data module, loaded on first use — the ONE place this file reaches for it (a name resolve and a graph hydrate both read it) */
async function companyData() {
  const ok = await window.IntMapLazy.need('companyPanel');
  return ok ? window.IntMapCompanyData : null;
}
async function resolveWorldObject(a, K) {
  const HOST = K.HOST, q = String(a.ref || a.name || a.place || '').trim(), type = String(a.objectType || '').trim() || undefined;
  if (!q) return { obj: null, code: 'NEEDS_INPUT' };
  const hit0 = W.find(q, { type });
  if (hit0) return { obj: hit0, via: 'session' };
  /* (world-graph) a ref or an external identifier (`facility:wd-Q123`, `wikidata:Q123`) is a key the persistent graph can answer exactly — ask it first; a name is asked last */
  const keyed = /^[A-Za-z][A-Za-z0-9_]*:[^\s]+$/.test(q);
  const fromGraph = async () => {
    const g = await G.findPersisted(HOST.DB, q);
    if (g.ok && g.object && (!type || g.object.type === type)) return { obj: g.object, via: 'graph' };
    /* a uid, or an external id the object held in an earlier release (a re-issued `gers:…`): the identity layer follows it to the object it now is */
    if (g.ok && !g.object) {
      const p = await G.resolvePersisted(HOST.DB, q);
      if (p.ok && p.object && !p.ambiguous && (!type || p.object.type === type)) return { obj: p.object, via: 'graph' };
    }
    return g.ok ? null : { obj: null, code: 'GRAPH_' + String(g.error || 'failed').toUpperCase() };
  };
  let graphErr = null;
  if (keyed) { const g = await fromGraph(); if (g && g.obj) return g; if (g) graphErr = g; }
  const want = (t) => !type || type === t;
  if (want('news_event') || want('article')) {
    const news = W.register(W.fromLoadedNews((typeof HOST.globalData !== 'undefined' && HOST.globalData) || []).filter((o) => !type || o.type === type));
    const hit = W.find(q, { type }); if (hit && news.indexOf(hit) >= 0) return { obj: hit, via: 'news' };
  }
  if (want('volcano')) {
    try {
      const ok = await window.IntMapLazy.need('volcanoIntel'), V = ok && window.IntMapVolcano; const h = V && V.byName(q)[0];
      if (h) { const o = W.fromVolcano(await V.record(h.v)); if (o) return { obj: W.register(o)[0], via: 'volcano' }; }
    } catch (_) { /* the catalogue is optional here */ }
  }
  if (want('company')) {
    try {
      const D = await companyData();
      if (D) {
        await D.index(); const row = D.get(q) || D.resolve(q);
        if (row && row.id) {
          let prof = null; try { prof = await D.profile(row.id); } catch (_) { /* no profile → no position, and the object says so */ }
          const { company: o, sites } = W.fromCompanyProfile(row, prof);   /* its sites are written down with it (each tied `operated_by`), so «what does it operate» can be followed */
          if (o) { const stored = W.register([o].concat(sites)); return { obj: stored[0], via: 'company' }; }
        }
      }
    } catch (_) { /* the company atlas is optional here */ }
  }
  if (want('earthquake')) {
    try {
      const rq = await readQuakes({});
      const qs = W.register(rq.features.map((f) => W.fromUsgs(f)).filter(Boolean));
      const hit = W.find(q, { type: 'earthquake' }); if (hit && qs.indexOf(hit) >= 0) return { obj: hit, via: 'usgs' };
    } catch (_) { /* the feed is optional here */ }
  }
  if (!keyed) { const g = await fromGraph(); if (g && g.obj) return g; if (g) graphErr = g; }
  /* a graph that did not answer is not a graph that holds nothing: say which */
  return graphErr ? { obj: null, code: 'NOT_FOUND', graph: graphErr.code } : { obj: null, code: 'NOT_FOUND' };
}

/* (world-graph) A company the graph names by the atlas id (`ids.company`) has SITES in the company atlas. They are written down through the
   same adapter as `news.company`, so «this terminal → its operator → what else it runs» is one walk over one index — joined by the id the
   graph states, never by a spelling. A profile that cannot be read leaves the company without sites, and the answer says nothing more than that. */
async function hydrateAtlasCompanies(objs, K) {
  const todo = (objs || []).filter((o) => o && o.type === 'company' && o.ids && o.ids.company);
  if (!todo.length) return 0;
  let n = 0;
  try {
    const D = await companyData(); if (!D) return 0;
    await D.index();
    for (const o of todo) {
      const row = D.get(o.ids.company); if (!row) continue;
      let prof = null; try { prof = await D.profile(row.id); } catch (_) { continue; }
      const { sites } = W.fromCompanyProfile(row, prof); W.register(sites); n += sites.length;
    }
  } catch (_) { /* the company atlas is optional here */ }
  return n;
}

/** why the persistent graph added nothing, when it could not be read — a graph that did not answer is not a graph that is empty */
function graphMode0(rels, a) { return rels.length > 0 || (a.depth != null && +a.depth > 1); }
function graphUnreadNote(code, L) {
  return code ? L(' (The persistent world graph could not be read: ' + String(code).replace(/^GRAPH_/, '').toLowerCase() + '.)', '（永続の世界グラフを読み込めませんでした: ' + String(code).replace(/^GRAPH_/, '').toLowerCase() + '。）') : '';
}

/** a number carried with its period: one line per claim, and a long series (a port's tonnage by year) as its newest five periods plus the span — the model still receives every row (W.brief) */
function claimLines(claims, L) {
  const day = (t) => new Date(t).toISOString().slice(0, 10), yr = (t) => new Date(t).toISOString().slice(0, 4);
  const per = (c) => c.fromMs != null ? ' (' + day(c.fromMs) + (c.toMs != null && c.toMs !== c.fromMs ? ' → ' + day(c.toMs) : '') + ')' : L(' (period not stated)', '（期間の記載なし）');
  const groups = new Map();
  claims.forEach((c) => { const k = [c.key, c.unit, c.source].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(c); });
  const out = [];
  groups.forEach((g) => {
    if (g.length <= 4) { g.forEach((c) => out.push(c.key + ' ' + c.value + (c.unit ? ' ' + c.unit : '') + per(c) + (c.source ? ' — ' + c.source : ''))); return; }
    const d = g.filter((c) => c.fromMs != null).sort((a, b) => b.fromMs - a.fromMs), c0 = g[0];
    out.push(c0.key + (c0.unit ? ' [' + c0.unit + ']' : '') + ': ' + d.slice(0, 5).map((c) => yr(c.fromMs) + ' ' + c.value).join(' · ')
      + (d.length > 5 ? L(' … ' + d.length + ' periods, ' + yr(d[d.length - 1].fromMs) + '–' + yr(d[0].fromMs), ' … 全 ' + d.length + ' 期間・' + yr(d[d.length - 1].fromMs) + '〜' + yr(d[0].fromMs)) : '') + (c0.source ? ' — ' + c0.source : ''));
  });
  return out;
}
/** how fresh the persistent graph's feed is — said beside an answer that came from it, and said as a problem when the latest run did not end ok */
function freshnessLine(feeds, L) {
  const f = (feeds || []).filter((x) => x && x.feed);
  if (!f.length) return '';
  return f.map((x) => {
    const when = x.finishedAt ? String(x.finishedAt).slice(0, 10) : null;
    const eu = x.upstream && x.upstream.eurostat && x.upstream.eurostat.updated ? L(' · Eurostat updated ', ' ・Eurostat 更新 ') + String(x.upstream.eurostat.updated).slice(0, 10) : '';
    const bad = x.latestStatus && x.latestStatus !== 'ok' ? L(' · the latest refresh ' + x.latestStatus + ' (' + (x.latestNote || '') + ')', ' ・直近の更新は ' + x.latestStatus + '（' + (x.latestNote || '') + '）') : '';
    return L('Data feed “' + x.feed + '”: ', 'データ更新「' + x.feed + '」: ') + (when ? L('last confirmed ', '最終確認 ') + when : L('never completed', '完了した更新なし')) + eu + bad;
  }).join(' / ');
}

/** the one-line facts an object states, in the reader's language — values only, from `facts` and `time` */
function worldObjectLine(o, L) {
  const f = o.facts || {}, bits = [], iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  if (f.magnitude != null) bits.push('M' + (+f.magnitude).toFixed(1));
  if (f.depthKm != null) bits.push(L('depth ', '深さ') + Math.round(f.depthKm) + ' km');
  if (f.alertLevel) bits.push(String(f.alertLevel));
  if (f.maxVei != null) bits.push('VEI ' + f.maxVei);
  if (f.lastEruptionYear != null) bits.push(L('last eruption ', '最終噴火 ') + f.lastEruptionYear);
  if (f.population != null) bits.push(L('pop ', '人口') + (+f.population).toLocaleString());
  if (f.unlocodeFunctions) bits.push(L('UN/LOCODE lists at this location: ', 'UN/LOCODE が記す機能: ') + f.unlocodeFunctions);
  if (f.articles != null) bits.push(f.articles + L(' articles', ' 記事'));
  if (f.outlets != null) bits.push(f.outlets + L(' outlets', ' 媒体'));
  if (o.time) bits.push(iso(o.time.atMs) + (o.time.endMs !== o.time.atMs ? (' → ' + iso(o.time.endMs)) : ''));
  return bits.join(' · ');
}

export default [
  {
    row: ['research.brief',             'brief',          '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'place?',   '', 'external'],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'country', at: 40, text: '{"type":"brief","place":str} (structured AI intelligence brief with live web headlines, rendered right here in the chat — use ONLY when the user EXPLICITLY asks for a brief/report/調査/ブリーフ; NEVER as a substitute for answering a question); ' },
    ],
    policy: { answer: true },   /* an ANSWER about a topic (#R159) — js/atlas-turn-results.js keys its results by topic */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat() } }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, GE = K.GE, _setLast = K._setLast, _langLine = K._langLine, _newsData = K._newsData, WEB_BUDGET_MS = K.WEB_BUDGET_MS, _gdeltNews = K._gdeltNews, _gnewsNews = K._gnewsNews, askAIJSONEnvelope = K.askAIJSONEnvelope, L = K.L, linkCards = K.linkCards, dropLeadTitle = K.dropLeadTitle, mdMini = K.mdMini;
      { /* (#R62) AI Brief is INTEGRATED into Atlas — same structured brief, rendered inline in this chat. */
          const ll=(a.lng!=null&&a.lat!=null)?{lng:+a.lng,lat:+a.lat,name:String(a.place||'')}:await geocode(a.place);
          const nm3=(ll&&ll.name)||String(a.place||'').trim(); if(!nm3) return R(false, warn(esc(a.place||'')));
          if(ll&&isFinite(ll.lng)){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),4),duration:900}); }catch(_){} try{ _setLast(ll); }catch(_){} }
          const today=new Date().toISOString().slice(0,10); const langB=_langLine();
          const srcSink=[];   /* (#R79) collect real article URLs → ChatGPT-style source cards under the brief */
          let hl2=''; try{ const heads=_newsData(ll&&isFinite(ll.lng)?{lng:ll.lng,lat:ll.lat}:null,nm3,srcSink); if(heads) hl2='\n\nRecent nearby news headlines — reflect these in "Recent developments":\n'+heads; }catch(_){}
          /* (#R113d) recent-news evidence for "Recent developments": GDELT (exact phrase → unquoted fallback, last 7
             days for wider coverage than 72 h) + Google News, in parallel. Empty results just leave the section honest
             (no fabrication) — but the quoted-only, 3-day, no-fallback version was returning nothing for topics like
             "South China Sea", which is why the section came back empty. */
          try{ const [gd,gn]=await Promise.all([
              /* ⚠ (#R464) SEQUENTIAL, so the pair shares ONE budget — otherwise it costs two (js/atlas-deadlines.js) */
              (async()=>{ const b0=Date.now(); const bLeft=()=>WEB_BUDGET_MS-(Date.now()-b0); let v=await _gdeltNews('"'+nm3+'"',srcSink,'7d',bLeft()); if(!v&&bLeft()>0) v=await _gdeltNews(nm3,srcSink,'7d',bLeft()); return v; })().catch(()=>null),
              _gnewsNews(nm3,srcSink).catch(()=>null)
            ]);
            if(gd) hl2+='\n\nLive web news search results (GDELT, last 7 days) — use for "Recent developments":\n'+gd;
            if(gn) hl2+='\n\nLive Google News search results — use for "Recent developments":\n'+gn;
          }catch(_){}
          /* (#R114) LUNA: the brief PROMISES latest developments, so it now really searches. The old prompt
             attached the tool (webMode) yet ordered the model "do NOT call any tool" — a Gemini-era contradiction
             that left 0 web searches run. Prompt is now tool-CONDITIONAL (use search if attached; else the supplied
             headlines) and the call is webMode:'required' so the proxy forces the search. */
          const sysB=personaPrompt('working here as IntMap\'s geopolitical and area-studies research desk')/* (#R285) this opened with a DIFFERENT character from the one answering two panels away; the task role stays, the name and the character are Atlas's */+'The real current date is '+today+' (never treat it as a future date). Be factual and concise; include concrete years, dates and figures (population, GDP, troop counts, distances) wherever possible; clearly flag anything uncertain. IMPORTANT: if a web-search tool is attached to this request, USE it to find and verify the most recent developments, and cite each recent event with its date and a source; if no web-search tool is attached, rely only on the supplied recent-news headlines below and do not claim to have searched. Either way, treat the supplied headlines as leads. GROUNDING (the user reported hallucinated, non-existent events): every RECENT development you list must come from your web-search results this turn OR the supplied headlines — never invent a plausible-sounding recent event from memory. If neither surfaces anything recent, say so plainly under "Recent developments" rather than fabricating one or presenting an old event as if it were current. Do NOT open with a heading or bold line that merely repeats the place name — it is already on screen above your reply. Start straight with the content. Respond in '+langB+'.';
          const pB='Write a concise intelligence brief on "'+nm3+'"'+((ll&&isFinite(ll.lat))?(' (around '+ll.lat.toFixed(2)+', '+ll.lng.toFixed(2)+')'):'')+' with the sections:\n## Background\n## History (date the key events)\n## Economy (latest figures with their year)\n## Military & strategic significance\n## Recent developments (prioritize the last 1-2 years; date each event)\n2-4 sentences per section, section headers translated into '+langB+'. Prefer named entities, dates and numbers over generalities.'+hl2;
          let txtB='', _envB=null; try{ _envB=await askAIJSONEnvelope(pB,sysB,null,{task:'brief',webMode:'required',turnId:K._curTurnKey}); txtB=(_envB&&_envB.text)||''; }catch(e){ return R(false, warn(esc((e&&e.message)||'AI error'))); }
          try{ if(_envB&&_envB.meta&&_envB.meta.webUsed) keepTurnPages(K._curTurnKey, (_envB.citations||[]).map(c=>({url:c&&c.url,title:c&&c.title,retrievedAt:new Date().toISOString()}))); }catch(_){}   /* (atlas-completion) what this brief's search retrieved, for the turn's next answer call */
          if(!String(txtB||'').trim()) return R(false, warn(L('The brief came back empty','ブリーフが空でした','Bericht kam leer zurück','Пустой ответ','El informe volvió vacío')));
          /* ⚠⚠ (#R232) 「返答の最初に地名だけ」 — re-sent: #R231 fixed the OTHER panel; this branch printed it itself (#R69). */
          /* (#R232) …and the TOPIC with it — resolved name AND typed string (often different scripts). */
          let srcCardsB=''; try{ srcCardsB=linkCards(srcSink,txtB,nm3+' / '+String(a.place||'')); if(srcCardsB) srcCardsB='<div class="atl-src-h">'+L('Sources','ソース','Quellen','Источники','Fuentes')+'</div>'+srcCardsB; }catch(_){}   /* (#R79) real article cards; (#R152/#R153) relevance now runs INSIDE linkCards (after host-clean) so the section is never blanked by an only-SNS coincidence */
          /* (#R103) the per-message "AI-generated — verify" note is dropped — the single static note under the input bar
             now carries that disclaimer (毎メッセージに書くな). */
          /* (#R114) honest recency footer: show the as-of date, and flag when a LIVE web search actually ran
             (meta.webUsed) so a search-less brief is never mistaken for fresh "latest" intelligence. */
          let asofB=''; try{ const _m=(_envB&&_envB.meta)||{};   /* (#R350) THIS call's meta, not window._aiLastMeta — a concurrent Atlas turn used to decide whether this brief said 「ライブWeb検索」 */ asofB='<div style="font-size:10.5px;color:var(--text-muted);margin-top:7px;">'+L('As of','時点','Stand','На дату','A fecha de')+' '+today+(_m.webUsed?(' · '+L('live web search','ライブWeb検索','Live-Websuche','поиск в интернете','búsqueda web en vivo')):'')+'</div>'; }catch(_){}
          /* (#R232) …and the model's own version of it — dropLeadTitle is in js/atlas-reply.js. */
          const bodyB=dropLeadTitle(txtB,nm3); try{ if(window.IntMapWidgetBriefStore) window.IntMapWidgetBriefStore.remember({place:nm3,text:bodyB,at:Date.now()}); }catch(_){}   /* (#R292) the widget board is SHOWN this brief and never asks for one — see js/widget-defs-map.js. ⚠ ON THIS LINE because #R199's ceiling is never raised (#R272): the file had one line of headroom and this addition pays for itself. */
          return R(true,'<div class="atl-md">'+mdMini(bodyB)+'</div>'+asofB+srcCardsB); }
    },
  },
  {
    row: ['research.askHere',           'askHere',        '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'point',    ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'country', at: 50, text: '{"type":"askHere","place":str} (ask AI about a spot); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), question: str(), query: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, GE = K.GE, dispatch = K.dispatch, note = K.note, L = K.L;
      { /* (#R83) absorbed into Atlas — pin the point HERE so the ongoing conversation resolves
            "here/there" to it; if a concrete question came with it, answer it straight away via analyze. */
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place);
          if(!ll) return R(false, warn(esc(a.place||'')));
          K._herePoint={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; try{ K._lastPlace={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; }catch(_){}
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),5),duration:900}); }catch(_){}
          const qq=String(a.question||a.query||'').trim();
          if(qq) return await dispatch({type:'analyze',question:qq,place:'there'});
          return R(true, note(esc(ll.name||(ll.lat.toFixed(3)+', '+ll.lng.toFixed(3)))+' — '+L('ask me anything about this spot','この地点について何でも聞いてください','fragen Sie mich alles zu diesem Ort','спросите что угодно об этом месте','pregúntame lo que sea sobre este lugar'))); }
    },
  },
  {
    /* (place-dossier · place-card-unify) EVERYTHING THE MAP KNOWS ABOUT ONE POINT, AS VALUES — js/place-dossier.js gathers it (the
       same gatherer and record research.hereNow returns; the two capabilities differ only in which sections come first and in
       hereNow's door to the device position),
       the card on the map draws the same record, and Atlas receives it whole as `exec.placeProfile`
       (js/atlas-toolsurface.js → `observed`), so a figure Atlas quotes is one the reader can see. */
    row: ['research.placeProfile',      'placeProfile',   'placeDossier,pointProfile,whatIsHere',                        'research','none',    '',                       'explanation',         'read',    'none',   'point',    ''],
    ui: { at: ['#src-profile', '#ctx-menu'] },
    doc: [
      { in: 'country', at: 55, text: '{"type":"placeProfile","place"?:str,"lng"?:num,"lat"?:num} = PLACE PROFILE / 地点プロファイル — one card of everything IntMap holds about a single point, as values with their units and sources: coordinates, the OpenStreetMap name and administrative chain (市区町村・都道府県・州), the country (Natural Earth) with its statistics, the elevation or sea depth (標高・水深, terrarium DEM), the value of EVERY data layer the reader has switched on at that point (表示中レイヤーの値) — and, by name, each layer that is on but cannot be read at a point, with the reason — the local time and time zone (現地時刻・タイムゾーン), sunrise, sunset and daylight (日の出・日の入り・昼の長さ) — and what is happening there now: the weather now, the earthquakes of M2.5+ within 300 km in the last 7 days (USGS), the news events placed within 300 km in the last 72 hours, and what the place used to be called. It is the SAME card and record as hereNow (which lists the «now» sections first). Use it for 「この地点について教えて」「ここはどんな場所」「what is at this spot / what does the map know here」. A section that could not be read says why instead of being left out; do not describe an unavailable section as empty. "place":"here" is the point Atlas last touched (e.g. after askHere). ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, L = K.L, HOST = K.HOST;
      let pt=null, ptProv;   /* (world-objects) how the point was known — only a gazetteer hit is declared; a bare number's origin is not ours to name */
      if(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)&&isFinite(+a.lat)) pt={lng:+a.lng,lat:+a.lat,name:String(a.place||'')};
      else if(a.place){ const ll=await geocode(a.place); if(!ll) return R(false, warn(L('IntMap could not place «'+esc(String(a.place))+'». Give coordinates, or name a place IntMap holds.','「'+esc(String(a.place))+'」を地図上に特定できませんでした。座標を指定するか、IntMap が持つ地名で言い直してください。'))); pt={lng:+ll.lng,lat:+ll.lat,name:ll.name||String(a.place)}; ptProv='geocoded_point'; }
      /* ⚠ (#R302) the target is required (the schema demands a place or a lat/lng pair); a call with neither is answered, not guessed */
      if(!pt) return R(false, warn(L('Which point? Name a place or give its coordinates.','どの地点ですか？地名か座標を指定してください。')));
      const prof=await placeProfile(pt, HOST, { ensureCountries: K.ensureData, metrics: Object.assign({}, K.METRICS, K.XMET), label: K.lx, format: K.fmtVal });
      const ttl=(prof.place&&prof.place.status==='ok'&&prof.place.name)||pt.name||prof.at.text;
      const wp=W.register(W.fromPlaceProfile(Object.assign({asked:pt.name},prof), ptProv))[0];   /* (world-objects) the profile's point, named by a ref the follow-ups can open */
      placeCardStyle();   /* the «now» and «past» lists' rules — the bubble draws the card's sections */
      const out=R(true, '<div><b>'+icon('pin')+' '+esc(ttl)+'</b>'+profileHtml(prof, HOST, { inert: true })+'</div>', { exec: { placeProfile: prof } });
      if(wp) out.exec.worldObjects={ subject: wp.ref, objects: [W.brief(wp)] };
      return out;
    },
  },
  {
    /* (mobile-next · place-card-unify) WHAT IS HAPPENING HERE, NOW — js/place-dossier.js gathers it (weather now, earthquakes and news within the
       reach, the place's former names), the card on the map draws the same record, and Atlas receives it whole as
       `exec.hereNow`. With no place it reads the DEVICE position (js/locate-me.js, the one reading view.locate uses),
       and the lookups (weather, earthquakes, news) go out with those coordinates — which is why the risk is `external` and the confirm cell `explicit`: Atlas proposing it unasked must not read the sensor and send the position out silently. */
    row: ['research.hereNow',           'hereNow',        'hereAndNow,whatIsHappeningHere,aroundMeNow,nearMeNow',          'research','none',    '',                       'explanation',         'external', 'explicit','place?',   '',  'external'],
    ui: { at: ['[data-hn-entry="here"]'] },
    doc: [
      { in: 'country', at: 56, text: '{"type":"hereNow","place"?:str,"lng"?:num,"lat"?:num} = HERE, NOW / いま、ここ — what is happening at one point right now, as values with their sources: the weather now and today (Open-Meteo, MET Norway as fallback) with the local time, sunrise and sunset, the earthquakes of M2.5+ within 300 km in the last 7 days (USGS), the news events placed within 300 km in the last 72 hours (IntMap news events), and what the place used to be called with each span (IntMap\'s renamed-city record — e.g. Edo for Tokyo) — plus everything placeProfile reads (it is the SAME card and record, with these sections first). With NO place it uses the reader\'s device position (asks browser permission; the exact position stays on the device — only a point rounded to 0.1° is sent, for the place name and the weather). Use it for 「いまここで何が起きてる」「近くで地震あった？」「この辺のニュース」「ここは昔なんて呼ばれてた」, "what is happening around me", "anything near me right now". A section that could not be read says why; an empty section (no quake within the reach) is an answer, not a failure. ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat() } }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, L = K.L, HOST = K.HOST;
      let pt=null;
      if(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)&&isFinite(+a.lat)) pt={lng:+a.lng,lat:+a.lat,name:String(a.place||'')};
      else if(a.place&&String(a.place).toLowerCase()==='here'&&K._herePoint) pt={lng:+K._herePoint.lng,lat:+K._herePoint.lat,name:K._herePoint.name||''};
      else if(a.place&&String(a.place).toLowerCase()!=='here'){ const ll=await geocode(a.place); if(!ll) return R(false, warn(L('IntMap could not place «'+esc(String(a.place))+'». Give coordinates, or name a place IntMap holds.','「'+esc(String(a.place))+'」を地図上に特定できませんでした。座標を指定するか、IntMap が持つ地名で言い直してください。'))); pt={lng:+ll.lng,lat:+ll.lat,name:ll.name||String(a.place)}; }
      else {
        /* no place: the device — the same reading view.locate makes, and the dot drawn from it */
        const { requestFix } = await import('./locate-me.js');
        const fix=await requestFix();
        if(!fix.ok) return R(false, warn(L('Your position could not be read ('+fix.reason+'). Name a place, or allow location for this site.','現在地を読み取れませんでした（'+fix.reason+'）。地名を指定するか、このサイトの位置情報を許可してください。')), { meta: { code: 'LOCATION_'+String(fix.reason).toUpperCase(), category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
        try{ if(window.IntMapLocate&&window.IntMapLocate.start) window.IntMapLocate.start({ fly: false, fix }); }catch(_){}
        pt={lng:fix.lng,lat:fix.lat,from:'device',accuracyM:fix.acc};
      }
      /* (place-card-unify) the SAME gatherer and record as research.placeProfile, with the «now» sections first */
      const rec=await hereNow(pt, HOST, { ensureCountries: K.ensureData, metrics: Object.assign({}, K.METRICS, K.XMET), label: K.lx, format: K.fmtVal });
      placeCardStyle();
      const ttl=(rec.place&&rec.place.status==='ok'&&rec.place.name)||pt.name||rec.at.text;
      return R(true, '<div><b>'+icon('target')+' '+esc((pt.from==='device'?L('Here, now','いま、ここ')+' — ':'')+ttl)+'</b>'+profileHtml(rec, HOST, { inert: true })+'</div>', { exec: { hereNow: rec } });
    },
  },
  {
    /* (logistics-network) «THIS PORT STOPS — WHICH CITIES AND FACTORIES LOSE THEIR NEAREST PORT?» answered from data/logistics-network.json
       (scripts/logistics/build.mjs): the ports each city / factory reaches BY RAIL, in order, with the kilometres. The arithmetic is
       js/logistics-impact.js; the model is a reachability model over OpenStreetMap track and the answer says so every time. */
    row: ['research.portImpact',        'portImpact',     'portClosure,portDisruption,portStops',                           'research','none',    '',                       'explanation',         'read',    'none',   '',         ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'country', at: 64, text: '{"type":"portImpact","port":str,"top"?:num} = 港湾が止まったときの影響 — WHAT A PORT STOPPING DOES TO ITS HINTERLAND, read from the rail network: the cities of 100,000+ people and the factory-type sites (company atlas: factories, assembly plants, refineries, smelters, shipyards, breweries, mines, power plants) whose NEAREST port BY RAIL it is, where each falls back to (the next port in its own order, with the extra rail kilometres), which fall-back ports receive the most (with their stated annual cargo — Eurostat or Wikidata — or «not stated»), and how many have NO further port inside the model; AND the coal / oil / gas / petcoke power plants that stand within 30 km of it (Global Power Plant Database 1.3.0, CC BY 4.0, June 2021: capacity in MW, the current operator it states, commissioning year — proximity, NOT a stated fuel supply). "port" is a name, a UN/LOCODE (NLRTM) or a Wikidata id; an ambiguous name is returned as candidates for you to ask about, not chosen. THE MODEL IS REACHABILITY OVER OPENSTREETMAP TRACK, NOT FREIGHT: gauge, electrification, track capacity, operators, road and barge legs are not in it, the ports are those that state cargo, a UN/LOCODE or a rail terminal and lie within 120 km of the ocean, and a city or site with no rail within 25 / 10 km is not in the file (the answer states the coverage) — say that, do not present the list as the observed flow of goods. Use it for 「ロッテルダム港が止まったら影響を受ける工場と都市は」, "which factories and cities depend on the port of Hamburg". For a CABLE or ROUTE network (centrality, max-flow/min-cut, what a zone going down cuts off) use data.gis network / networkDisrupt instead.' },
    ],
    schema: () => ({ type: 'object', properties: { port: str(), top: num(1) }, required: ['port'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const q = String(a.port || a.name || '').trim();
      if (!q) return R(false, warn(L('Which port? Give its name, UN/LOCODE (e.g. NLRTM) or Wikidata id.', 'どの港湾ですか？名前・UN/LOCODE（例 NLRTM）・Wikidata の id を指定してください。')), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
      const r = await LOGI.impact(q, { top: a.top });
      if (!r.ok) {
        const msg = r.code === 'unavailable' ? L('The logistics network file could not be read, so nothing can be said about ports stopping.', '物流網のファイルを読めなかったため、港湾停止の影響は答えられません。')
          : r.code === 'ambiguous' ? L('Several ports answer to «' + esc(q) + '» — which one? ', '「' + esc(q) + '」に当たる港湾が複数あります。どれですか？ ') + r.candidates.map((c) => esc(c.name + (c.cc ? ' (' + c.cc + ')' : '') + (c.locode ? ' ' + c.locode : ''))).join(' · ')
          : L('The logistics network holds no port called «' + esc(q) + '» (' + r.listed + ' ocean-facing ports with rail access are listed). Name it another way or give its UN/LOCODE.', '物流網に「' + esc(q) + '」という港湾はありません（鉄道に接続できる外洋港 ' + r.listed + ' 件を収録）。別の呼び方か UN/LOCODE を指定してください。');
        return R(false, warn(msg), { meta: { code: r.code === 'unavailable' ? 'DATA_UNAVAILABLE' : r.code === 'ambiguous' ? 'AMBIGUOUS' : 'NOT_FOUND', category: r.code === 'unavailable' ? 'transient' : 'input', retryable: r.code === 'unavailable', semanticTarget: q, produced: [], userGoalSatisfied: false } });
      }
      const num0 = (n) => Number(n).toLocaleString('en-US');
      const cap = (p) => (p.capacity ? num0(p.capacity.value) + ' ' + p.capacity.unit + (p.capacity.year ? ' (' + p.capacity.year + ')' : '') : L('cargo not stated', '取扱量の記載なし'));
      const A = r.affected;
      let h = '<div><b>' + icon('pin') + ' ' + esc(r.port.name) + '</b> <span style="font-size:10.5px;color:var(--text-muted);">' + esc([r.port.cc, r.port.locode].filter(Boolean).join(' · ')) + '</span></div>';
      h += '<div style="font-size:12px;margin-top:2px;">' + esc(L('If this port stops, ' + A.cities + ' cities (' + num0(A.population) + ' people) and ' + A.factories + ' factory-type sites of ' + A.companies + ' companies lose their NEAREST port by rail.', 'この港湾が止まると、鉄道で最寄りの港を失うのは都市 ' + A.cities + ' 件（人口 ' + num0(A.population) + '）と、' + A.companies + ' 社の工場系拠点 ' + A.factories + ' 件です。')) + '</div>';
      h += '<div style="font-size:11.5px;color:var(--text-muted);">' + esc(L('Its own cargo: ', 'この港の取扱量: ') + cap(r.port)) + '</div>';
      if (r.medianExtraKm != null) h += '<div style="font-size:12px;margin-top:3px;">' + esc(L('Median extra rail distance to the next port: ', '次の港までの鉄道距離の増加（中央値）: ') + r.medianExtraKm + ' km') + (r.stranded.cities + r.stranded.factories ? ' · ' + esc(L(r.stranded.cities + ' cities and ' + r.stranded.factories + ' sites have no further port within the model', 'モデルの範囲に次の港がない: 都市 ' + r.stranded.cities + ' 件・拠点 ' + r.stranded.factories + ' 件')) : '') + '</div>';
      if (r.rerouted.length) h += '<div style="font-size:11.5px;margin-top:3px;"><b>' + esc(L('Where they fall back', '代わりに向かう港')) + '</b><br>' + r.rerouted.map((x) => esc(x.port.name + ': ' + x.entities + L(' places, median +', ' 件・中央値 +') + x.medianExtraKm + ' km · ' + cap(x.port))).join('<br>') + '</div>';
      if (r.topCities.length) h += '<div style="font-size:11.5px;margin-top:3px;"><b>' + esc(L('Largest cities affected', '影響を受ける主な都市')) + '</b><br>' + r.topCities.map((c) => esc(L(c.name, c.nameJa || c.name) + (c.cc ? ' (' + c.cc + ')' : '') + ' ' + num0(c.population || 0) + ' — ' + (c.fallback ? L('next: ', '次: ') + c.fallback.port.name + ' +' + c.fallback.extraKm + ' km' : L('no further port in the model', 'モデル内に次の港なし')))).join('<br>') + '</div>';
      if (r.factories.length) h += '<div style="font-size:11.5px;margin-top:3px;"><b>' + esc(L('Factory-type sites affected', '影響を受ける工場系拠点')) + ' (' + r.factories.length + (r.factoriesTotal > r.factories.length ? ' / ' + r.factoriesTotal : '') + ')</b><br>' + r.factories.map((f) => esc(f.name + ' [' + (f.siteType || '') + (f.company ? ' · ' + f.company : '') + '] ' + (f.fallback ? '→ ' + f.fallback.port.name + ' +' + f.fallback.extraKm + ' km' : L('no further port in the model', 'モデル内に次の港なし')))).join('<br>') + '</div>';
      const pw = r.power;
      if (pw && pw.ok) h += '<div style="font-size:11.5px;margin-top:3px;"><b>' + esc(L('Fuel-burning power plants at this port', 'この港にある燃料火力発電所')) + '</b> ' + esc(pw.plants ? pw.plants + L(' plants, ', ' 基・') + num0(Math.round(pw.mw)) + ' MW (' + Object.keys(pw.byFuel).map((k) => k + ' ' + num0(Math.round(pw.byFuel[k].mw)) + ' MW').join(', ') + ')' + (pw.noNextPort ? L('; ' + pw.noNextPort + ' have no other port within reach', '；うち ' + pw.noNextPort + ' 基は他に近い港なし') : '') : L('none within ' + pw.model.portReachKm + ' km in the database', 'データベース上 ' + pw.model.portReachKm + ' km 以内に無し')) + '<br>' + pw.top.map((x) => esc(x.name + ' [' + x.fuel + (x.mw != null ? ' ' + num0(Math.round(x.mw)) + ' MW' : '') + (x.commissioned ? ' · ' + x.commissioned : '') + (x.operator ? ' · ' + x.operator : '') + ']')).join('<br>') + '<br><span style="color:var(--text-muted);font-size:10px;">' + esc(L('Proximity, not a stated fuel supply: ', '近接であって、燃料供給の記載ではありません: ') + pw.source.name + ' (' + pw.source.licence + '), ' + pw.asOf) + '</span></div>';
      else if (pw) h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('The power-plant file could not be read, so nothing is said about plants at this port.', '発電所のファイルを読めなかったため、この港の発電所については答えられません。')) + '</div>';
      const cv = r.coverage;
      h += '<div class="acp-src" style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + esc(L('Model: ', 'モデル: ') + r.model.kind + '. ' + L('Covered: ', '収録: ') + cv.entities.assigned + L(' of ', ' / ') + (cv.entities.cities + cv.entities.industrialSites) + L(' cities and sites reach a port by rail; ', ' の都市・拠点が鉄道で港に到達；') + cv.portsListed + L(' ports. As of ', ' 港。時点 ') + r.asOf + L('. Sources: ', '。出典: ') + r.sources.map((s) => s.name + ' (' + s.licence + ')').join(' · ')) + '</div>';
      return R(true, h, { exec: { portImpact: r }, meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: r.port.name, produced: ['explanation'], userGoalSatisfied: true } });
    },
  },
  {
    /* (world-objects) THE REAL-WORLD OBJECT BEHIND A NAME — `research.impact`, `research.events`, `data.volcano`, `news.company`
       and `research.placeProfile` each name the thing they are about by the same `ref` (type:id), and the next two
       capabilities follow it. They draw nothing: the answer is the object and what is tied to it. */
    row: ['research.object',            'worldObject',    'realWorldObject,whatIsThis',                                     'research','none',    '',                       'explanation',         'read',    'none',   '',         ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'country', at: 62, text: '{"type":"worldObject","ref"?:str,"name"?:str,"objectType"?:TYPE} = 実世界オブジェクト — RELATIONS CARRY A STATE: every tie it lists is `confirmed` (a named source states it), `inferred` (derived by a stated rule — never a fact about the world) or `unconfirmed` (no record). Before you state that X is operated_by / owned_by / located_in Y, pass it as "check":[{"rel":…,"ref":…}] and say only what comes back: a relation with no record is "not recorded", NEVER completed from what such ties usually are, and "not recorded" is not "does not exist". — THE REAL-WORLD OBJECT behind a name or a ref — one record with its type, id (ref = type:id), position and how that position is known (provenance), time, extent, the article ids and evidence ids that vouch for it, its sources and its typed ties to other objects. Use it for 「この地震は何？」「その火山の記録を」「2番の出来事の詳細」, "what is that earthquake", when the question is about ONE thing a previous answer surfaced (impact, events, volcano, company news and place profile name their objects by ref in `observed.worldObjects`) — pass that ref, or an external identifier such as "wikidata:Q123" / "osm:node/123" (the same thing surfaced by two sources is ONE object; the answer lists its identifiers, the refs folded into it and look-alikes that were not merged). TYPE is one of earthquake, news_event, article, facility, company, volcano, city, place_profile, place, dataset_feature. A name IntMap holds is resolved from the loaded news, the volcano catalogue, the company atlas or the USGS week; a name nothing holds is answered as not found, never guessed. IntMap ALSO keeps a PERSISTENT world graph (database) that outlives the session — today the LNG terminals and PORTS of the world — a port (港湾) with its UN/LOCODE, operator and owner (with the dates each tie held), the railway line or road Wikidata states it connects to, the UN/LOCODE function flags of its location (port / rail terminal / road terminal …) and its cargo handled per year in thousand tonnes (Eurostat mar_go_aa, EU/EFTA/UK/Türkiye ports; a port outside that has no yearly series — say so, do not estimate one); the answer ends with when the feed was last confirmed. Name a port by its English or Japanese name, its UN/LOCODE (\"unlocode:NLRTM\") or its ref; a ref such as \"facility:wd-Q104518607\", an identifier such as \"wikidata:Q104518607\" or an exact name is looked up there, and the answer lists each number with its unit, period and source. Use research.related for «what else belongs with it».\n' },
    ],
    schema: () => ({ type: 'object', properties: { ref: str(), name: str(), place: str(), objectType: str(), check: list(loose()) }, anyOf: [{ required: ['ref'] }, { required: ['name'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const r = await resolveWorldObject(a, K);
      if (!r.obj) {
        const q = String(a.ref || a.name || a.place || '');
        const msg = r.code === 'NEEDS_INPUT'
          ? L('Which object? Give its ref (from an earlier answer) or its name.', 'どの対象ですか？先の回答に出た ref か名前を指定してください。')
          : L('IntMap holds no object called «' + esc(q) + '» — name one a previous answer surfaced, or a volcano, company, loaded news event or recent earthquake.', '「' + esc(q) + '」という対象を IntMap は持っていません。先の回答に出たもの、火山・企業・読み込み済みの出来事・直近の地震の名前で指定してください。');
        return R(false, warn(msg + graphUnreadNote(r.graph, L)), { meta: { code: r.code, category: 'input', retryable: false, semanticTarget: q, produced: [], userGoalSatisfied: false } });
      }
      const o = r.obj, placed = isFinite(+o.lng) && o.lng != null && o.lat != null;
      let h = '<div><b>' + icon('pin') + ' ' + esc(o.name || o.ref) + '</b> <span style="font-size:10.5px;color:var(--text-muted);">' + esc(o.type + (o.kind && o.kind !== o.type ? ' · ' + o.kind : '')) + ' · ' + esc(o.ref) + '</span></div>';
      const line = worldObjectLine(o, L); if (line) h += '<div style="font-size:12px;margin-top:2px;">' + esc(line) + '</div>';
      h += '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">' + (placed ? esc(o.lat.toFixed(3) + ', ' + o.lng.toFixed(3) + ' — ' + o.provenance) : esc(L('no position known', '位置は不明'))) + (o.bounds ? ' · ' + esc(L('has an extent', '範囲あり')) : '') + '</div>';
      if (o.articleIds.length || o.evidenceIds.length || o.links.length) h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(o.articleIds.length + L(' articles', ' 記事') + ' · ' + o.evidenceIds.length + L(' evidence records', ' 証拠記録') + ' · ' + o.links.length + L(' ties', ' 結び付き')) + '</div>';
      if (o.sources.length) h += '<div class="acp-src" style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + esc(L('Sources: ', '出典: ') + o.sources.map((s) => s.name + (s.licence ? ' (' + s.licence + ')' : '')).filter(Boolean).join(' · ')) + '</div>';
      /* WHO it is: the identifiers other systems gave it, the records folded into it, and look-alikes that were NOT folded (so a reader can see what was and was not asserted) */
      const idn = W.identity(o);
      const idBits = Object.keys(idn.ids).map((k) => k + ':' + idn.ids[k]);
      if (idBits.length || idn.aliases.length) h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(idBits.join(' · ') + (idn.aliases.length ? ' · ' + L('also known here as ', 'ここでの別の ref: ') + idn.aliases.join(', ') : '')) + '</div>';
      if (o.validity) h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('in force ', '存続期間 ') + (o.validity.fromMs != null ? new Date(o.validity.fromMs).toISOString().slice(0, 10) : '?') + ' → ' + (o.validity.toMs != null ? new Date(o.validity.toMs).toISOString().slice(0, 10) : L('now / not stated', '現在／記載なし'))) + '</div>';
      if (idn.candidates.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Not merged (same name, close by, no shared identifier): ', '同一とは扱っていない候補（同名・近接・共通の識別子なし）: ') + idn.candidates.map((c) => c.name + ' [' + c.ref + ']').join(', ')) + '</div>';
      if (idn.conflicts.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Identifier disagreement left unresolved: ', '識別子の食い違い（未解決）: ') + idn.conflicts.map((c) => (c.rel || c.scheme) + ' ' + (c.ref || (c.kept + ' vs ' + c.dropped))).join(', ')) + '</div>';
      /* (world-graph) the numbers it carries, each with its unit, period and who said it — side by side, never merged into one */
      if (o.claims && o.claims.length) h += '<div style="font-size:11.5px;margin-top:3px;">' + claimLines(o.claims, L).map(esc).join('<br>') + '</div>';
      const cc = W.claimConflicts(o);
      if (cc.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Sources disagree on: ', '出典間で値が異なる項目: ') + cc.map((c) => c.key + (c.unitMismatch ? ' (' + L('units differ', '単位が異なる') + ')' : '')).join(', ')) + '</div>';
      /* (relation-evidence) THE RELATIONS THE ANSWER IS ABOUT TO STATE, ASKED OF THE GRAPH FIRST: `check` is a list of {rel, ref} — each comes back recorded or not, with its state
         (confirmed / inferred / unconfirmed) and what backs it. No record is reported as «not recorded», never completed from what such ties usually are. */
      let relChecks = null;
      if (Array.isArray(a.check) && a.check.length) {
        relChecks = W.checkRelations(o, a.check.slice(0, 40).map((q) => ({ rel: String((q && q.rel) || ''), ref: String((q && (q.ref || q.to)) || '') })));
        h += '<div style="font-size:11.5px;margin-top:5px;"><b>' + esc(L('Are these relations recorded?', 'これらの関係は記録されているか')) + '</b></div>';
        relChecks.forEach((x) => { h += '<div style="font-size:11.5px;padding-left:8px;color:' + (x.state === 'confirmed' ? 'inherit' : '#ff9f0a') + ';">' + esc(o.name + ' ' + x.rel + ' ' + (x.ref || '?') + ' — ' + stateLabel(x.state, L) + (x.recorded ? (x.evidence && x.evidence.source ? ' · ' + x.evidence.source : '') + (x.rule ? ' · ' + x.rule : '') : ' · ' + L('not recorded in the graph (that is not proof it does not exist)', 'グラフに記録なし（存在しない証拠ではない）'))) + '</div>'; });
      }
      let fresh = null;
      if (r.via === 'graph') {
        const fr = await G.freshness(K.HOST.DB);
        if (fr.ok) { fresh = fr.feeds; const fl = freshnessLine(fr.feeds, L); if (fl) h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">' + esc(fl) + '</div>'; }
        else h += warn(L('Data freshness could not be read: ', 'データの鮮度を読めませんでした: ') + esc(String(fr.error)));
      }
      return R(true, h, { exec: { worldObjects: { subject: o.ref, objects: [W.brief(o)], via: r.via, identity: idn, claimConflicts: cc.length ? cc : undefined, relationChecks: relChecks || undefined, freshness: fresh || undefined } }, meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: o.ref, produced: ['explanation'], userGoalSatisfied: true } }); },
  },
  {
    row: ['research.related',           'worldRelated',   'related,relatedObjects,whatIsAround',                                 'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { at: ['[data-pd="related"]'] },
    doc: [
      { in: 'country', at: 63, text: '{"type":"worldRelated","ref"?:str,"name"?:str,"objectType"?:str,"km"?:num,"hours"?:num,"types"?:[TYPE,…],"rels"?:[str,…],"depth"?:num,"at"?:"YYYY-MM-DD"} = 関連オブジェクト・周辺の対象 — TYPED TIES: pass "rels" (names such as contains, part_of, operated_by, operates, owned_by, mentions — read from the object you start at) and/or "depth" > 1 to FOLLOW named edges across several steps («the terminals of this port, then who operates them»); only stated edges are followed, never proximity. "at" asks as of a date: ties and objects whose stated period excludes it are left out. Without rels/depth: WHAT BELONGS WITH ONE REAL-WORLD OBJECT: the earthquakes, news events, articles, facilities, cities, volcanoes and companies tied to it, each with WHY: `linked` (an edge, or an article / evidence id they share), `near` (within km — default 300 — or inside its extent) and `concurrent` (within hours — default 72). Two things are related when linked, or near and concurrent (a facility has no time, so it is judged by place alone); time alone is never a relation. Use it for 「この地震について、近くの施設と関連記事も」「この出来事の周辺」, "what is around that quake", "news about this volcano"; pass the `ref` an earlier answer returned (observed.worldObjects) or the name. It reads the objects this session surfaced plus the loaded news and the USGS week; it reports what it found and how many, and says so when nothing is tied to the object. It ALSO reads the persistent world graph (LNG terminals and ports → operated_by / owned_by company, and terminals part_of a port (rels [\"part_of\",\"contains\"] lists the terminals inside a port), with the period each tie held — pass \"at\" for «who owned it in 2018» — and, through the company atlas id the graph states, the own sites of the company): «terminal → its operator → what else that operator runs» is rels [\"operated_by\",\"operates\"], depth 2; a proximity question also lists the persisted objects near it.\n' },
    ],
    schema: () => ({ type: 'object', properties: { ref: str(), name: str(), place: str(), objectType: str(), km: num(0), hours: num(0), types: list(str()), rels: list(str()), depth: num(1), at: str() }, anyOf: [{ required: ['ref'] }, { required: ['name'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc, HOST = K.HOST;
      const r = await resolveWorldObject(a, K);
      if (!r.obj) {
        const q = String(a.ref || a.name || a.place || '');
        const msg = r.code === 'NEEDS_INPUT' ? L('Related to what? Give a ref from an earlier answer or a name.', '何の関連ですか？先の回答に出た ref か名前を指定してください。') : L('IntMap holds no object called «' + esc(q) + '».', '「' + esc(q) + '」という対象を IntMap は持っていません。');
        return R(false, warn(msg + graphUnreadNote(r.graph, L)), { meta: { code: r.code, category: 'input', retryable: false, semanticTarget: q, produced: [], userGoalSatisfied: false } });
      }
      const types = Array.isArray(a.types) ? a.types.map(String) : [];
      const extra = W.fromLoadedNews((typeof HOST.globalData !== 'undefined' && HOST.globalData) || []);
      let quakeFeedFailed = false;
      if (!types.length || types.indexOf('earthquake') >= 0) {
        /* the whole feed (the object's own reach is applied by W.related); `unavailable` is a feed that did not answer — said
           below — and never the same as a feed that answered with nothing near */
        const rq = await readQuakes({});
        if (rq.state === 'unavailable') quakeFeedFailed = true;
        else rq.features.forEach((f) => { const o = W.fromUsgs(f); if (o) extra.push(o); });
      }
      /* typed-edge mode: `rels` (the names of the ties to follow, read from the object being left) and/or `depth` (how many to follow); `at` asks «as of this date» */
      const rels = Array.isArray(a.rels) ? a.rels.map(String).filter(Boolean) : [];
      const atMs = a.at != null && a.at !== '' ? (typeof a.at === 'number' ? a.at : Date.parse(String(a.at))) : null;
      if (atMs != null && !isFinite(atMs)) return R(false, warn(L('«at» must be a date such as 1990-06-01.', '«at» は 1990-06-01 のような日付で指定してください。')), { meta: { code: 'INVALID_INPUT', category: 'input', retryable: false, semanticTarget: String(a.at), produced: [], userGoalSatisfied: false } });
      /* (world-graph) What the PERSISTENT graph holds joins the session's index before the walk, by the same shapes and the same rules:
         the ties within reach of this object as of `at`, and (for a proximity question) the persisted objects near it. */
      let graphNote = '', graphCode = '';
      {
        const sub = await G.fetchSubgraph(K.HOST.DB, r.obj.ref, { rels, depth: a.depth, atMs });
        if (!sub.ok) graphCode = 'GRAPH_' + String(sub.error).toUpperCase();
        else await hydrateAtlasCompanies(sub.objects, K);
        if (!graphMode0(rels, a) && r.obj.lng != null && r.obj.lat != null) {
          const nr = await G.nearPersisted(K.HOST.DB, r.obj.lng, r.obj.lat, (a.km != null && isFinite(+a.km)) ? +a.km : W.RELATED_DEFAULTS.km);
          if (!nr.ok && !graphCode) graphCode = 'GRAPH_' + String(nr.error).toUpperCase();
        }
        graphNote = graphUnreadNote(graphCode, L);
      }
      const res = W.related(r.obj, { km: a.km, hours: a.hours, types, extra, rels, depth: a.depth, atMs });
      W.register(res.items.map((x) => x.object));   /* what was found can be followed next */
      const rows = W.relatedHtml(res, { L, esc }), byType = rows.byType;
      const km = (a.km != null && isFinite(+a.km)) ? +a.km : W.RELATED_DEFAULTS.km, hrs = (a.hours != null && isFinite(+a.hours)) ? +a.hours : W.RELATED_DEFAULTS.hours;
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + icon('target') + ' ' + esc(r.obj.name || r.obj.ref) + ' — ' + esc(L('related objects', '関連する対象') + ' (' + res.total + ')') + '</div>';
      const graphMode = rels.length > 0 || (a.depth != null && +a.depth > 1);
      const scope = graphMode
        ? L('following ' + (rels.length ? rels.join(', ') : 'any tie') + ' up to ' + Math.max(1, Math.floor(+a.depth || 1)) + ' step(s)', (rels.length ? rels.join('、') : 'すべての結び付き') + ' を最大 ' + Math.max(1, Math.floor(+a.depth || 1)) + ' 段たどる')
        : L('within ' + km + ' km and ' + hrs + ' h, or linked directly', km + ' km・' + hrs + ' 時間以内、または直接の結び付き');
      h += '<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">' + esc(scope + (atMs != null ? L(' · as of ', ' ・基準日 ') + new Date(atMs).toISOString().slice(0, 10) : '')) + '</div>' + rows.html;
      if (!res.total) h += '<div style="font-size:12px;">' + esc(L('Nothing IntMap holds is tied to this object within that reach.', 'その範囲で、このオブジェクトに結び付く対象は IntMap にありません。')) + '</div>';
      if (graphNote) h += warn(graphNote.trim());
      if (quakeFeedFailed) h += warn(L('The USGS feed could not be read — earthquakes are not part of this answer.', 'USGS のフィードを読めなかったため、地震はこの答えに含まれていません。'));
      const shown = res.items.slice(0, 40).map((x) => Object.assign(W.brief(x.object), { why: x.why, rels: x.rels && x.rels.length ? x.rels : undefined, depth: x.depth, distanceKm: x.distanceKm == null ? undefined : x.distanceKm, gapHours: x.gapHours == null ? undefined : x.gapHours }));
      const totals = {}; Object.keys(byType).forEach((t) => { totals[t] = byType[t].count; });
      return R(true, h, { exec: { worldObjects: { subject: r.obj.ref, objects: [W.brief(r.obj)], related: shown, totals, total: res.total, partial: quakeFeedFailed || undefined } }, meta: { code: res.total ? 'OK' : 'NO_RESULTS', category: res.total ? 'ok' : 'evidence', retryable: false, semanticTarget: r.obj.ref, produced: ['explanation'], userGoalSatisfied: true } }); },
  },
  {
    row: ['research.mapReport',         'mapReport',      'newsMap,reportMap',                                           'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'research.mapReport', text: 'NOT FOR A MULTI-CONDITION FILTER. A question of the form 「AかつBかつCの都市・地点」 — several numeric thresholds at once, or a threshold on one dataset beside a threshold on another — is a QUERY, not an essay: emit {"type":"query"} and let IntMap compute the rows. Answering such a question with prose about what WOULD have to be checked is the exact failure that action exists to remove. RESEARCH MAPPED ONTO THE MAP (CURRENT / RECENT live-news incidents ONLY): {"type":"mapReport","topic":str,"place"?:str,"count"?:int} = Atlas researches the topic from LIVE NEWS EVIDENCE that IntMap gathers (GDELT + Google News + loaded IntMap news — the model does NOT web-search; it classifies/summarizes the evidence) (pass "count" whenever the user asks for a specific number of items, e.g. 「10件表示して」 → count:10) and puts the concrete findings ON THE MAP as pins — each pin is ONE real, DATED, current/recent incident/event/entity with a 1-2 sentence AI summary and, where a real article exists, a link — plus an overview and clickable item list in the chat. mapReport is for CURRENT/RECENT dated incidents backed by LIVE NEWS ONLY. Do NOT use it for: a past-era or historical situation, historical background / powers / trade / strategic importance, a place general situation at a past time, or stable knowledge — for ANY of those use researchMap (below). USE mapReport (not a plain "answer", not "analyze") whenever the user asks to summarize/investigate CURRENT events ON the map ("〇〇の近況について地図上にまとめて", "map the situation in X right now") OR to research a topic of recent incidents that have real locations — recent incidents ("最近のアメリカの銃犯罪を調べて" → each ACTUAL shooting incident pinned in the city it happened, with date and casualties; NEVER a generic "gun crime is common in city X" answer), conflicts, disasters, elections, disease outbreaks, strikes, protests, infrastructure projects. Combine it freely with flyTo/layers. Plain "answer" is for questions with no geographic footprint.\n' },
    ],
    /* #R115: non-equivalent substitutions the planner has actually made, recorded so it cannot make them again; and the genuinely interchangeable one, the ONLY substitution repair may make */
    policy: { answer: true, forbidden: ['research.historicalMap'], equivalents: ['research.situationMap'] },
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { topic: str(), question: str(), query: str(), place: str(), count: int(1) }, anyOf: [{ required: ['topic'] }, { required: ['question'] }, { required: ['query'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, WORLD_RE = K.WORLD_RE, placeExtent = K.placeExtent, geocode = K.geocode, _langLine = K._langLine, _gdeltNews = K._gdeltNews, _gnewsNews = K._gnewsNews, _newsData = K._newsData, _lnorm = K._lnorm, aiParseJSON = K.aiParseJSON, askAI = K.askAI, esc = K.esc, GLEDGER = K.GLEDGER, _poiAdd = K._poiAdd, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, _atlCleanUrl = K._atlCleanUrl, linkCards = K.linkCards, note = K.note, _PINNED = K._PINNED;
      { /* (#R72) research mapped ONTO the map ("地図上にまとめて" /
          "銃犯罪を調べて→地図上にマッピングし、そこから簡易的な説明やニュース記事にアクセス"): live web/news evidence
          → AI geolocates the concrete events/places → pins with an AI summary + article link in each popup. */
          const topic=String(a.topic||a.question||a.query||'').trim();
          if(!topic) return R(false, warn(L('What should I map?','何を地図にまとめますか？','Was soll kartiert werden?','Что нанести на карту?','¿Qué mapeo?')));
          /* (#R74) requested item count ("10件表示してといったところ、10件ですと言って7件しか出なかった"):
             honour an explicit N — from the action's "count" or parsed out of the topic/last message. */
          let wantN=null; try{ if(a.count!=null&&isFinite(+a.count)) wantN=Math.max(1,Math.min(20,Math.round(+a.count)));
            if(wantN==null){ const cm=(topic+' '+String(K._lastUserMsg||'')).match(/(\d{1,2})\s*(?:件|事例|例|个|つ|カ所|か所|箇所)|(?:top|first|last)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:incidents?|cases?|events?|items?|examples?|shootings?|attacks?)/i);
              if(cm){ const nv=+(cm[1]||cm[2]||cm[3]); if(isFinite(nv)&&nv>=1&&nv<=20) wantN=nv; } } }catch(_){}
          let ctx=null; const plc=String(a.place||'').trim();
          if(plc&&!WORLD_RE.test(plc)){ try{ ctx=await placeExtent(plc); }catch(_){} if(!ctx){ try{ ctx=await geocode(plc); }catch(_){} } }
          /* (#R113) EVIDENCE-BASED, NO web-search tool. IntMap gathers the evidence (GDELT + Google News + loaded
             IntMap news), normalises it into ID'd records, and Gemini 3.5 Flash Low only CLASSIFIES/SUMMARISES it +
             names the place — it does NOT search, invent coordinates, or invent URLs/sources. Coordinates come from
             the cited evidence's known location or IntMap's geocoder; url/source/date come from the cited evidence. */
          const langR=_langLine();
          const evSink=[]; const evJobs=[];
          evJobs.push(_gdeltNews(topic,evSink).catch(()=>{}));
          evJobs.push(_gnewsNews(topic,evSink).catch(()=>{}));
          try{ _newsData(ctx,topic,evSink); }catch(_){}
          await Promise.all(evJobs);
          /* dedupe by URL, assign stable evidence IDs (e1, e2, …), cap the set. */
          const evidence=[]; const _seenU=new Set(); const evById={};
          for(const r of evSink){ if(!r||!r.title) continue; const u=String(r.url||''); if(u&&_seenU.has(u)) continue; if(u) _seenU.add(u);
            const rec={id:'e'+(evidence.length+1),title:String(r.title).slice(0,180),source:String(r.src||'').slice(0,60),url:u,date:String(r.date||''),loc:(r.loc&&isFinite(+r.loc[0])?[+r.loc[0],+r.loc[1]]:null),place:String(r.place||'').slice(0,80)};
            evidence.push(rec); evById[rec.id]=rec; if(evidence.length>=40) break; }
          if(!evidence.length) return R(false, warn(L('No live news evidence could be gathered for this topic right now — nothing was invented. Try a broader topic or again shortly.','このトピックのライブニュース証拠を取得できませんでした（創作はしていません）。トピックを広げるか、少し後に再試行してください。','Keine Live-Nachrichten-Belege gefunden — nichts erfunden. Breiteres Thema oder später erneut.','Не удалось собрать доказательства из новостей — ничего не выдумано. Расширьте тему или повторите позже.','No se pudieron reunir evidencias de noticias — nada inventado. Prueba un tema más amplio o reintenta.')), {meta:{code:'NO_LIVE_EVIDENCE',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const evBlock=evidence.map(e=>'['+e.id+'] '+e.title+(e.source?(' — '+e.source):'')+(e.date?(' ('+e.date+')'):'')+(e.place?(' — reported location: '+e.place):'')+(e.url?('\n     url: '+e.url):'')).join('\n');
          /* (#R113 §12.3) separate the REAL current date from the map's time-travel date. */
          const _nowISO=new Date().toISOString().slice(0,10);
          let _mapISO=_nowISO; try{ if(IntMapTime&&IntMapTime.when){ const w=IntMapTime.when(); if(w) _mapISO=new Date(w).toISOString().slice(0,10); } }catch(_){}
          const dateLine='The real current date is '+_nowISO+'.'+((_mapISO&&_mapISO!==_nowISO)?(' The map is time-traveled to '+_mapISO+'; treat "as of" as '+_mapISO+', but the real current date is still '+_nowISO+' (never call '+_nowISO+' a future date).'):'');
          const sysR=personaPrompt('the research-mapping engine of the IntMap world map')/* (#R285) */+dateLine+' No web-search or function-calling tool is attached to this request — do NOT call tools or functions, and do NOT search the web. The action/type names elsewhere are plain data, not callable functions. Use ONLY the evidence records provided below. Return STRICT JSON only (no prose, no code fence): {"title":str,"overview":str,"items":[{"name":str,"locationName":str,"country":str,"summary":str,"date":"YYYY-MM-DD"|null,"evidenceIds":[str,...]}]}. HARD RULES: each item = ONE concrete, real OCCURRENCE or ENTITY that the evidence supports — for incident topics that means ONE specific incident (what happened, where, when, figures if reported). Every item MUST cite at least one evidenceId (e.g. "e3") from the evidence below; do NOT invent incidents, dates, casualties, place names, sources or URLs that are not in the evidence. Do NOT merge separate incidents into one item unless the evidence explicitly says they are the same incident. Give "locationName" (the specific city/place the evidence indicates) and "country" — do NOT output coordinates; the app resolves the real position from locationName + country. "summary" = 1-2 factual sentences in '+langR+' using only evidence details (date, actors, figures). "date" = the incident date if the evidence gives one, else null. NEVER emit region-level generalities, statistics-as-items, or trends as items. If the evidence supports fewer items than requested, return only those it supports — an EMPTY items array is preferable to a fabricated or generalised item. NEVER state an item count in the title or overview. "overview" = 2-4 sentence synthesis in '+langR+' (patterns are allowed in the overview, never in the items). "title" in '+langR+'.'
            +(wantN?(' The user asked for up to '+wantN+' items — return that many ONLY if the evidence genuinely supports that many distinct real ones.'):'')
            +(ctx&&isFinite(ctx.lng)?(' Focus area: '+(ctx.name||plc)+'.'):'');
          let jr=null; try{ jr=aiParseJSON(await askAI('[TOPIC]\n'+topic+'\n\n[EVIDENCE RECORDS — cite these ids in evidenceIds; use ONLY these, do not go beyond them]\n'+evBlock,sysR,null,{task:'map_report',webMode:'off',requestedCount:(wantN||undefined)})); }catch(e){ return R(false, warn(esc((e&&e.message)||'AI error'))); }
          /* validate: keep only items that cite a REAL evidence id and name a place (no fabricated evidenceIds). */
          let raw=(jr&&Array.isArray(jr.items))?jr.items.filter(it=>it&&it.name&&it.locationName&&Array.isArray(it.evidenceIds)&&it.evidenceIds.some(id=>evById[id])):[];
          if(wantN&&raw.length>wantN) raw=raw.slice(0,wantN);
          /* resolve coordinates OUTSIDE the model: cited evidence's known location first, else IntMap geocode of
             locationName + country. Items whose position can't be verified are shown in the list but NOT pinned. */
          const _seenXY=[]; const items=[];
          for(const it of raw){ const cites=it.evidenceIds.filter(id=>evById[id]).map(id=>evById[id]);
            let lng=null,lat=null; const withLoc=cites.find(e=>e.loc); if(withLoc){ lng=+withLoc.loc[0]; lat=+withLoc.loc[1]; }
            if(lng==null){ const qn=[String(it.locationName||'').trim(),String(it.country||'').trim()].filter(Boolean).join(', ');
              let g=null; try{ const _k=GLEDGER.resolve(it.locationName,{countryName:it.country}); if(_k&&_k.lng!=null) g={lng:_k.lng,lat:_k.lat,name:_k.canonicalName||_k.name}; }catch(_){}   /* (#R489) a place this conversation already resolved is not geocoded again */
              if(!g){ try{ g=await geocode(qn); }catch(_){} } if(!g&&it.locationName){ try{ g=await geocode(String(it.locationName).trim()); }catch(_){} }
              if(g&&isFinite(+g.lng)){ lng=+g.lng; lat=+g.lat; try{ GLEDGER.record({kind:'city',name:String(it.locationName||''),canonicalName:g.name||String(it.locationName||''),countryName:String(it.country||''),lng,lat,role:'incident',summary:String(it.summary||''),when:{start:String(it.date||''),end:String(it.date||'')},source:'evidence',provenance:'event_location'}); }catch(_){} } }
            const mappable=(lng!=null&&isFinite(lng)&&isFinite(lat)&&Math.abs(lat)<=90&&Math.abs(lng)<=180);
            if(mappable&&_seenXY.some(p=>Math.abs(p[0]-lng)<0.02&&Math.abs(p[1]-lat)<0.02)) continue;   /* dedupe same spot */
            if(mappable) _seenXY.push([lng,lat]);
            const first=cites[0];
            items.push({ name:String(it.name).slice(0,90), locationName:String(it.locationName||''), country:String(it.country||''),
              summary:String(it.summary||'').slice(0,400), date:(/^\d{4}-\d{2}-\d{2}$/.test(String(it.date||''))?String(it.date):(first&&first.date||'')),
              lng, lat, mappable, url:(first&&/^https?:\/\//i.test(first.url)?first.url.slice(0,300):''), src:(first?String(first.source||'').slice(0,40):'') }); }
          if(!items.length) return R(false, warn(L('The evidence did not support any concrete mappable items — nothing was invented','証拠から具体的にマッピングできる項目は得られませんでした（創作はしていません）','Die Belege ergaben keine konkreten kartierbaren Einträge — nichts erfunden','Доказательства не дали конкретных объектов для карты — ничего не выдумано','La evidencia no dio elementos mapeables concretos — nada inventado')), {meta:{code:'NO_MAPPABLE_ITEMS',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const mappableItems=items.filter(i=>i.mappable); const unmappable=items.length-mappableItems.length;
          const _kpR=_poiAdd(a); const _pvR=_kpR?K._pois.slice():[]; clearPois();   /* ⚠ (#R489) A SECOND mapReport IN THE SAME TURN USED TO ERASE THE FIRST'S PINS. The reported transcript ran four research-and-map passes for one request and each said 「地図に表示中」; only the last one's pins existed. Accumulating within the turn is what makes that claim true — see the note beside `_poiAdd`. */
          K._pois=_pvR.concat(mappableItems.map(it=>({lng:+it.lng,lat:+it.lat,name:String(it.name).slice(0,90),kind:[it.date,it.src].filter(Boolean).join(' · ').slice(0,60),
            sum:String(it.summary||''),url:it.url,src:it.src})));
          let okR=paintPois(); for(let i2=0;i2<6&&!okR&&K._pois.length;i2++){ await new Promise(r2=>setTimeout(r2,700)); okR=paintPois(); }
          try{ if(K._pois.length){ let a2=180,b2=90,c2=-180,d2=-90; K._pois.forEach(p=>{ a2=Math.min(a2,p.lng);b2=Math.min(b2,p.lat);c2=Math.max(c2,p.lng);d2=Math.max(d2,p.lat); });
            if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:90,maxZoom:9,duration:1100}); } }catch(_){}
          const listHtml2=items.map((p,i)=>{ const mi=p.mappable?mappableItems.indexOf(p):-1; const pu=_atlCleanUrl(p.url); return '<div class="atl-rp-item"'+(mi>=0?(' data-i="'+mi+'"'):'')+' style="display:flex;gap:7px;align-items:baseline;padding:4px 0;border-top:1px solid rgba(128,128,128,0.12);'+(mi>=0?'cursor:pointer;':'')+'"><span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:'+(p.mappable?(K._poiColor||'#ff453a'):'rgba(128,128,128,0.5)')+';position:relative;top:-1px;"></span><span style="flex:1;min-width:0;"><span style="font-weight:600;font-size:12px;">'+esc(p.name)+'</span>'+((p.date||p.src)?' <span style="font-size:10px;color:var(--text-muted);">'+esc([p.date,p.src].filter(Boolean).join(' · '))+'</span>':'')+(p.summary?'<br><span style="font-size:11px;line-height:1.5;color:var(--text-main);opacity:0.9;">'+esc(p.summary.length>150?p.summary.slice(0,150)+'…':p.summary)+'</span>':'')+(pu?' <a href="'+esc(IntMapSafe.url(pu.url))+'" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--primary-color);text-decoration:none;">'+L('article','記事','Artikel','статья','artículo')+' ↗</a>':'')   /* (#R153) inline evidence link goes through _atlCleanUrl too (decode GNews aggregator → real article, drop SNS) — was raw p.url, the "無関係リンク／SNS" leak */+(!p.mappable?' <span style="font-size:9.5px;color:var(--text-muted);">('+L('location unverified','位置未確認','Ort unbestätigt','место не подтв.','ubicación no verif.')+')</span>':'')+'</span></div>'; }).join('');
          return R(true,'<div style="font-weight:600;margin:2px 0 4px;">'+esc(jr.title||topic)+'</div>'
            +(jr.overview?'<div style="font-size:12.5px;line-height:1.6;margin-bottom:6px;">'+esc(jr.overview)+'</div>':'')
            +'<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">'+icon('pin')+' '+K._pois.length+' '+L('points mapped — click a pin (or an item below) for the summary & article','地点をマッピングしました — ピンまたは下の項目をクリックすると要約と記事を開けます','Punkte kartiert — Pin anklicken für Zusammenfassung & Artikel','точек на карте — клик по метке открывает сводку и статью','puntos mapeados — clic en un pin para el resumen y artículo')+'</div>'
            +((wantN&&items.length<wantN)?('<div style="font-size:11px;color:#ff9f0a;font-weight:600;margin:2px 0 4px;">'+icon('warning')+' '+L('You asked for '+wantN+' — the gathered evidence only supported '+items.length+' real item(s); nothing was padded with generalities','要求は'+wantN+'件でしたが、収集した証拠で裏付けられたのは'+items.length+'件のみです（一般論での水増しはしていません）','Angefragt: '+wantN+' — die Belege stützten nur '+items.length+' echte(n) Eintrag/Einträge','Запрошено '+wantN+' — доказательства подтвердили только '+items.length+' реальн.','Pediste '+wantN+' — la evidencia solo respaldó '+items.length+' elemento(s) reales')+'</div>'):'')
            +(unmappable?('<div style="font-size:10.5px;color:var(--text-muted);margin:1px 0 3px;">'+L(unmappable+' item(s) had no verifiable location and are listed without a pin.',unmappable+'件は位置を確認できず、ピンなしで一覧のみ表示しています。',unmappable+' Eintrag/Einträge ohne bestätigten Ort — nur gelistet.',unmappable+' без подтверждённого места — только в списке.',unmappable+' sin ubicación verificable — solo en la lista.')+'</div>'):'')
            +listHtml2
            +linkCards(items.filter(p=>p.url).map(p=>({url:p.url,title:p.name,src:p.src})))   /* (#R74) article cards (ChatGPT-style) */
            +note(L('Mapped from IntMap-gathered news evidence (GDELT + Google News + loaded news); positions are city-level — verify important facts.','IntMapが収集したニュース証拠（GDELT＋Google News＋読み込み済みニュース）に基づきます。位置は都市レベルの精度です — 重要な事実は確認してください。','Aus von IntMap gesammelten Nachrichtenbelegen (GDELT + Google News + geladene News); Positionen auf Stadtebene — wichtige Fakten prüfen.','На основе собранных IntMap новостных доказательств (GDELT + Google News + загруженные новости); позиции с точностью до города — проверяйте факты.','A partir de evidencias de noticias reunidas por IntMap (GDELT + Google News + noticias cargadas); posiciones a nivel de ciudad — verifica los datos.')), _PINNED({meta:{code:'OK',category:'ok',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:['explanation','map'],userGoalSatisfied:true}},okR)); }   /* (#R802) …and the pins it placed, so a second pass over the same subject reads as `already_there` rather than `not_rendered` */
    },
  },
  {
    row: ['research.situationMap',      'researchMap',    'research_map,situationMap',                                   'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'research.situationMap', text: 'NOT FOR A MULTI-CONDITION FILTER. A question of the form 「AかつBかつCの都市・地点」 — several numeric thresholds at once, or a threshold on one dataset beside a threshold on another — is a QUERY, not an essay: emit {"type":"query"} and let IntMap compute the rows. Answering such a question with prose about what WOULD have to be checked is the exact failure that action exists to remove. RESEARCH & SITUATION MAP (HISTORICAL / CURRENT / MIXED — the general research-onto-the-map action): {"type":"researchMap","topic":str,"place":str,"temporalMode":"historical"|"current"|"mixed","year"?:int,"evidenceMode":"historical"|"live"|"mixed"} = researches a place or topic SITUATION and returns BOTH a written explanation AND related REAL places pinned on the map, produced INDEPENDENTLY (the written answer is returned even when the map cannot be drawn). USE THIS — not mapReport, not historicalMap — for: "what was the situation at PLACE in YEAR" or "この時代／当時のPLACEは？" (temporalMode:"historical", year = the asked or currently-displayed year, evidenceMode:"historical"); a place present-day general situation that is not a specific live-incident hunt (temporalMode:"current"); and "compare YEAR vs now / 1900年と現在を比較" (temporalMode:"mixed"). It resolves the place REAL extent (IntMapRegionResolver / placeExtent) and, for a sea / gulf / strait / region with no polygon, still frames the bbox or center and pins the related places — a failure to draw does NOT fail the answer. Historical mode is grounded in established history + Wikipedia (NOT live news); current/mixed adds live-news evidence for the present part. Do NOT output coordinates (locationName + country resolve client-side). Examples: [map shows 1900] "当時のオホーツク海の状況を地図で教えて" → {"type":"researchMap","topic":"1900年ごろのオホーツク海の状況","place":"オホーツク海","temporalMode":"historical","year":1900,"evidenceMode":"historical"}; "この時代の中央アジアは？" → researchMap historical with the displayed year; "1750年のサヘル交易圏を表示して" → year:1750; "1900年と現在の樺太／サハリンを比較して" → temporalMode:"mixed".\n' },
    ],
    /* genuinely interchangeable — the ONLY substitution repair may make */
    policy: { answer: true, equivalents: ['research.mapReport'] },
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { topic: str(), question: str(), query: str(), place: str(), region: str(), location: str(), temporalMode: one('historical', 'current', 'mixed'), temporal: one('historical', 'current', 'mixed'), year: int(), evidenceMode: one('historical', 'live', 'mixed') }, anyOf: [{ required: ['topic'] }, { required: ['question'] }, { required: ['query'] }, { required: ['place'] }, { required: ['region'] }, { required: ['location'] }] }), /* `researchMap` */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, _lnorm = K._lnorm, _buildResearchAnswer = K._buildResearchAnswer, _tryMapResearch = K._tryMapResearch, note = K.note, esc = K.esc, _PINNED = K._PINNED, mdMini = K.mdMini;
      {
          /* (#R135) GENERAL research-onto-the-map action for HISTORICAL / CURRENT / MIXED questions — the text answer
             and the map are produced INDEPENDENTLY (§11): the explanation is returned even when the map cannot be
             drawn (a sea/gulf with no polygon still frames its bbox/centre and pins the related places). Evidence is
             switched by mode (§6): historical = established history + Wikipedia, NOT live news; current = live news;
             mixed = both, separated. The model never outputs coordinates — locationName+country resolve client-side. */
          const topic=String(a.topic||a.question||a.query||'').trim();
          const place=String(a.place||a.region||a.location||'').trim();
          if(!topic&&!place) return R(false, warn(L('What should I research and map?','何を調べて地図に示しますか？','Was recherchieren & kartieren?','Что исследовать и нанести на карту?','¿Qué investigo y mapeo?')), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,userGoalSatisfied:false,produced:[]}});
          let live=true; try{ if(IntMapTime) live=IntMapTime.isLive(); }catch(_){}
          let mode=String(a.temporalMode||a.temporal||'').toLowerCase(); if(!/^(historical|current|mixed)$/.test(mode)) mode=(!live?'historical':'current');
          let year=(a.year!=null&&isFinite(+a.year))?Math.round(+a.year):null;
          if(year==null&&mode!=='current'){ try{ if(IntMapTime&&!live) year=IntMapTime.year(); }catch(_){} }
          if(mode==='current') year=null;
          let evid=String(a.evidenceMode||'').toLowerCase(); if(!/^(historical|live|mixed)$/.test(evid)) evid=(mode==='historical'?'historical':mode==='mixed'?'mixed':'live');
          const semTarget=_lnorm(place||topic);
          /* 1) TEXT (independent of the map) */
          const research=await _buildResearchAnswer({topic,place,mode,year,evid});
          /* 2) MAP (independent, non-fatal) */
          let mapRes={rendered:false,method:'',name:(place||topic),pinCount:0,pinsDrawn:false,hasExtent:false,pinIdx:[]};
          try{ mapRes=await _tryMapResearch(place||topic, research.items, {mode,year,act:a}); }catch(_){}
          /* 3) compose — the explanation ALWAYS wins; the map is reported honestly (§11/§13) */
          if(!research.ok){
            if(mapRes.rendered) return R(true, note(icon('map')+' '+esc(mapRes.name)+' — '+L('shown on the map. I could not compile a written summary this time — try rephrasing the question.','を地図に表示しました。今回は文章の要約を作成できませんでした。質問を言い換えてお試しください。','auf der Karte gezeigt. Konnte diesmal keine Textzusammenfassung erstellen.','показано на карте. На этот раз не удалось составить текстовую сводку.','mostrado en el mapa. No pude redactar un resumen esta vez.')), _PINNED({meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:['map'],userGoalSatisfied:false}},mapRes.pinsDrawn));
            return R(false, warn(esc(research.error||L('Could not research this right now','今回は調べられませんでした','Konnte das gerade nicht recherchieren','Не удалось исследовать сейчас','No se pudo investigar ahora'))), {meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:[],userGoalSatisfied:false}});
          }
          /* (#R231) 「返答の最初にその地名だけ…やらなくていい」 — a "title" that is only the place the
             user just typed is dropped. ⚠ EQUALITY, NEVER CONTAINMENT: "Okhotsk in 1905" is a real
             title and stays. The temporal basis survives on its own line. */
          const _bare=(s)=>String(s||'').replace(/[\s:：・.,、。()（）"'“”「」]/g,'').toLowerCase();
          const _tt=String(research.title||'').trim();
          const _titleIsJustThePlace=!!_tt&&(_bare(_tt)===_bare(place)||_bare(_tt)===_bare(topic));
          let h='';
          if(_tt&&!_titleIsJustThePlace){
            h='<div style="font-weight:600;margin:2px 0 4px;">'+esc(_tt)+(research.temporalBasis?(' <span style="font-size:10.5px;color:var(--text-muted);font-weight:500;">· '+esc(research.temporalBasis)+'</span>'):'')+'</div>';
          } else if(research.temporalBasis){
            h='<div style="font-size:10.5px;color:var(--text-muted);margin:2px 0 4px;">'+esc(research.temporalBasis)+'</div>';
          }
          h+='<div class="atl-md" style="margin-bottom:6px;">'+mdMini(research.explanation)+'</div>';
          if(mapRes.rendered){ const ml=mapRes.pinCount?L(mapRes.pinCount+' related place(s) shown on the map',mapRes.pinCount+'件の関連地点を地図に表示しました',mapRes.pinCount+' zugehörige Orte auf der Karte',mapRes.pinCount+' связанных мест на карте',mapRes.pinCount+' lugares relacionados en el mapa'):(mapRes.method==='bbox'?L('Framed the area on the map','対象範囲を地図に表示しました','Gebiet auf der Karte eingerahmt','Область показана на карте','Área enmarcada en el mapa'):L('Centered the map on the location','地図を対象地点に移動しました','Karte auf den Ort zentriert','Карта отцентрирована','Mapa centrado en el lugar'));
            h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">'+icon('map')+' '+esc(ml)+((!mapRes.hasExtent&&mapRes.pinCount)?(' · '+L('the region outline was not available, so related places are shown as points','海域・地域の輪郭は取得できなかったため関連地点を表示','Regionsumriss nicht verfügbar — Punkte stattdessen','контур недоступен — показаны точки','sin contorno — se muestran puntos')):'')+'</div>'; }
          else h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">'+icon('map')+' '+L('The map view could not be updated for this, but the explanation above stands.','この件では地図表示を更新できませんでしたが、上の説明は有効です。','Kartenansicht nicht aktualisierbar — die Erklärung oben gilt.','Не удалось обновить карту — пояснение выше остаётся в силе.','No se pudo actualizar el mapa, pero la explicación anterior es válida.')+'</div>';
          if(research.items&&research.items.length){ h+='<div style="font-size:11.5px;color:var(--text-muted);margin:5px 0 2px;font-weight:600;">'+L('Related places','関連地点','Zugehörige Orte','Связанные места','Lugares relacionados')+'</div>';
            h+=research.items.map((it,i)=>{ const mi=(mapRes.pinIdx&&mapRes.pinIdx[i]!=null)?mapRes.pinIdx[i]:-1; return '<div class="atl-rp-item"'+(mi>=0?(' data-i="'+mi+'"'):'')+' style="display:flex;gap:7px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.12);'+(mi>=0?'cursor:pointer;':'')+'"><span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:'+((mi>=0)?(K._poiColor||'#ff453a'):'rgba(128,128,128,0.5)')+';position:relative;top:-1px;"></span><span style="flex:1;min-width:0;"><span style="font-weight:600;font-size:12px;">'+esc(it.name)+'</span>'+(it.dateOrPeriod?' <span style="font-size:10px;color:var(--text-muted);">'+esc(it.dateOrPeriod)+'</span>':'')+(it.summary?'<br><span style="font-size:11px;line-height:1.5;opacity:0.9;">'+esc(it.summary)+'</span>':'')+'</span></div>'; }).join(''); }
          if(research.limitations&&research.limitations.length) h+=note(L('Note','注記','Hinweis','Примечание','Nota')+': '+esc(research.limitations.join(' · ')));
          h+=note(mode==='historical'?L('Historical overview from established sources — borders and figures are approximate.','歴史的知見に基づく概説です。国境や数値は概略です。','Historischer Überblick aus etablierten Quellen — Grenzen/Zahlen näherungsweise.','Исторический обзор по установленным источникам — границы и цифры приблизительны.','Panorama histórico de fuentes establecidas — fronteras y cifras aproximadas.'):(mode==='mixed'?L('Combines a historical overview with current live-news evidence.','歴史的概説と現在のライブニュース証拠を組み合わせています。','Kombiniert historischen Überblick mit aktuellen Live-Nachrichten.','Сочетает исторический обзор с текущими новостями.','Combina un panorama histórico con noticias en vivo actuales.'):L('Compiled from current live-news evidence IntMap gathered.','IntMapが収集した現在のライブニュース証拠に基づきます。','Aus aktuellen Live-Nachrichten von IntMap.','На основе собранных IntMap текущих новостей.','A partir de noticias en vivo reunidas por IntMap.')));
          return R(true, h, _PINNED({meta:{code:'OK',category:'ok',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:(mapRes.rendered?['explanation','map']:['explanation']),userGoalSatisfied:true,geographicRelevance:(mapRes.rendered?1:0.5),temporalMatch:true}},mapRes.pinsDrawn)); }   /* ⚠ (#R802) THE SIX-TIMES CASE. Measured on production 2026-09-17, 「1914年のヨーロッパの国境…」: this line returned `ok` and `not_rendered` ALTERNATELY for one subject, because a repin of the same places moves no feature count. The pins now name themselves. */
    },
  },
  {
    row: ['research.historicalMap',     'historicalMap',  'historical,powerMap,allianceMap',                             'research','factions','map.factions',           'map,explanation',     'session', 'none',   '',         ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'historical-alliances', at: 10, text: '{"type":"historicalMap","era":str} = colors the country fills by faction/alliance for a historical moment (mapped onto modern borders, clearly labeled approximate). Use ONLY for an era ALLIANCE / faction / power / bloc map — "第一次世界大戦1916年3月の勢力図をマッピングして" → {"type":"historicalMap","era":"World War I March 1916"}, "map the Cold War alliances in 1962", "WWII in 1942". Do NOT use it for a single sea / region / city situation at a past time — that is researchMap (a water body or a local region is NEVER an alliance map). A curated, accurate WWI-1916 map is built in; other eras are composed live. ' },
    ],
    /* #R115: non-equivalent substitutions the planner has actually made, recorded so it cannot make them again */
    policy: { answer: true, forbidden: ['research.mapReport'] },
    chips: 'map.factions',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { era: str(), date: str(), title: str(), topic: str(), question: str(), place: str() }, anyOf: [{ required: ['era'] }, { required: ['date'] }, { required: ['title'] }, { required: ['topic'] }, { required: ['question'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const clearFac = K.clearFac, histMatch = K.histMatch, HIST_SCENARIOS = K.HIST_SCENARIOS, paintFactions = K.paintFactions, GE = K.GE, esc = K.esc, note = K.note, R = K.R, _langLine = K._langLine, aiParseJSON = K.aiParseJSON, askAI = K.askAI, warn = K.warn, L = K.L, parseColor = K.parseColor;
      {
          clearFac();
          const era=String(a.era||a.date||a.title||a.topic||a.question||a.place||'').trim();
          const key=histMatch(era)||histMatch(a.question||'');
          if(key&&HIST_SCENARIOS[key]){ const sc=HIST_SCENARIOS[key]; const n=paintFactions(sc.factions);
            for(let i2=0;i2<6&&!n;i2++){ await new Promise(r2=>setTimeout(r2,600)); if(paintFactions(sc.factions)) break; }
            try{ GE().camera.flyTo({center:[18,32],zoom:1.6,duration:1000}); }catch(_){}
            let h='<div style="font-weight:600;margin:2px 0 5px;">'+esc(sc.title)+'</div>'
              +'<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">'+sc.factions.map(f=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;background:'+f.color+';display:inline-block;flex:0 0 auto;"></span><span>'+esc(f.name)+'</span> <span style="color:var(--text-muted);font-size:10.5px;">('+f.codes.length+')</span></div>').join('')+'</div>'
              +note(sc.note);
            return R(paintFactions(sc.factions)>0, h); }
          /* fallback: build the faction set for ANY era via AI, then paint onto modern borders */
          const sysH=personaPrompt('working here as the historical-geography engine of the IntMap world map')/* (#R285) was "a historical-geography engine" — a third character */+'Build a political/alliance map for the exact historical moment the user names. Output ONLY strict JSON (no prose/fence): {"title":str,"factions":[{"name":str,"color":"#rrggbb","countries":[ISO3,...]},...],"note":str}. Map the powers of that date onto MODERN ISO3 codes (an empire → every modern country in its territory; e.g. Austria-Hungary → AUT,HUN,CZE,SVK,SVN,HRV,BIH,…). 2-6 factions, distinct colors. "note" must say it is approximate on modern borders. Title, faction names & note in '+_langLine()+'.';
          let jr=null; try{ jr=aiParseJSON(await askAI('Historical political/alliance/power map for: '+era,sysH,null,{})); }catch(_){}
          if(!jr||!Array.isArray(jr.factions)||!jr.factions.length) return R(false, warn(L('Could not build that historical map — try naming the war/year more specifically','その歴史地図を作成できませんでした。戦争名や年をより具体的に指定してください','Konnte diese historische Karte nicht erstellen','Не удалось построить эту историческую карту','No se pudo construir ese mapa histórico')));
          const groups=jr.factions.slice(0,6).map(f=>({name:String(f.name||''),color:(parseColor(f.color)||'#8a8f98'),codes:(Array.isArray(f.countries)?f.countries.map(c=>String(c).toUpperCase()):[])}));
          let n=paintFactions(groups); for(let i2=0;i2<6&&!n;i2++){ await new Promise(r2=>setTimeout(r2,600)); n=paintFactions(groups); }
          try{ GE().camera.flyTo({center:[18,32],zoom:1.6,duration:1000}); }catch(_){}
          let h='<div style="font-weight:600;margin:2px 0 5px;">'+esc(jr.title||era)+'</div>'
            +'<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">'+groups.map(f=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;background:'+f.color+';display:inline-block;flex:0 0 auto;"></span><span>'+esc(f.name)+'</span> <span style="color:var(--text-muted);font-size:10.5px;">('+f.codes.length+')</span></div>').join('')+'</div>'
            +note(jr.note||L('Approximate — historical powers mapped onto modern borders.','概略 — 歴史上の勢力を現代の国境上に表示。','Näherung — auf modernen Grenzen.','Приблизительно — на современных границах.','Aproximado — sobre fronteras actuales.'));
          return R(n>0, h); }
    },
  },
  {
    row: ['research.analyze',           'analyze',        'research,synthesize',                                         'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-16' },
    /* ⚠ AND THE OTHER ONE THIS ROUND IS NAMED AFTER: 「何を分析しますか？」 was reached by a plan
       that had already been accepted. Every caller in this repo spells it `question`. */
    /* ⚠ `temporalMode` IS ATLAS'S, AND IT IS WHY IT IS DECLARED HERE. The analyze case used to
       derive it by running _requestProfile(q) — a regular expression over the reader's sentence,
       which #R406 removed. The dispatch now reads it off the call, so whether a question is about
       now or about the past is a judgement Atlas states rather than one a pattern guesses. */
    doc: [
      { in: 'research.analyze', text: 'NOT FOR A MULTI-CONDITION FILTER. A question of the form 「AかつBかつCの都市・地点」 — several numeric thresholds at once, or a threshold on one dataset beside a threshold on another — is a QUERY, not an essay: emit {"type":"query"} and let IntMap compute the rows. Answering such a question with prose about what WOULD have to be checked is the exact failure that action exists to remove. INTEGRATED ANALYSIS (cross-cutting "combine IntMap\'s data and answer"): {"type":"analyze","question":str,"place"?:str,"countries"?:[str],"use"?:["news","web","weather","airquality","marine","elevation","quakes","stats"]} — Atlas GATHERS the real data (latest loaded news, a LIVE WEB NEWS SEARCH across all outlets (GDELT, last 72 h) + Wikipedia background, live weather/air-quality/sea-temperature/elevation at the place, USGS earthquakes of the last 24 h, country statistics) and synthesizes an evidence-based answer FROM THAT DATA. Use it whenever the user asks a question needing live/current data, a situation report, or a combination of news+data+map (e.g. "what is happening around Taiwan right now and how is the weather there", "summarize the latest earthquakes and nearby news", "compare France and Germany and give context from the news"). Pass "place" to focus geographically (deixis like "there" works), "countries" for stats, "use" to control which datasets (omit for sensible defaults incl. the web search). (#R131) For a NAMED MULTI-COUNTRY REGION ("Central Asia", "the Baltics", "the Sahel", "Central America", "the Gulf states") OR an explicitly requested set of countries, POPULATE "countries" with the actual member countries (English names) IN ADDITION to "place" — this is real geographic knowledge, not a time-sensitive fact — so the search and coverage span ALL of them instead of collapsing to one; and keep the user\'s COMPLETE question verbatim in "question" (do not truncate a monitoring/analysis prompt to a keyword). (#R119) It ALSO receives the live values of the layers the user is displaying at the anchor point, and "datasets":[GIS dataset ids] puts what those datasets measured (rows, and the min, max and filled-row count of each numeric column) in front of the answer as evidence that traces back through the GIS steps to the imported data — pass the ids of the results you computed so a figure in the answer can be followed to its source. "scope":"drawn-area" analyses the USER-DRAWN measure polygon / circles (news inside it + layer values + WorldPop population — use for "この範囲を要約/分析して"). Freely COMBINE analyze with map actions (flyTo, layer, highlight…) in one plan. It reports honestly which datasets were unavailable, and — for a question about the latest/current situation or a monitoring/alert judgment — verifies against a LIVE web search and marks the answer provisional if that verification could not complete.\n' },
      { in: 'events', at: 20, text: '{"type":"analyze","question":<that event\'s headline>,"place":<its location>}.\n' },
      { in: 'answer', at: 20, text: '{"type":"analyze"} INSTEAD, because analyze GATHERS and CITES real source links, whereas a bare "answer" cannot attach sources and reads as untrustworthy. Reserve "answer" for genuinely timeless conceptual explanations and IntMap how-to, where there is nothing to cite. FORMAT FOR READABILITY — REQUIRED for any answer longer than ~2 sentences (the user has repeatedly, angrily reported that Atlas replies are a monotonous wall of same-size text with no headings or spacing): OPEN with a short **bold** lead line, use "## " sub-headings to name each distinct section, "- " bullets for lists, and ALWAYS put a blank line between sections — these render as real, larger headings (differentiated by SIZE and SPACING) with clear separation. Use a heading ONLY for a genuine section title, never to enlarge an ordinary sentence. Only a genuinely one-idea reply stays plain sentences. MAP VALUE (IntMap is a map product): if the answer names specific mappable places (cities, towns, districts, landmarks, stations, airports, ports, parks, museums, squares, named natural features), you MUST list EVERY one in "places" as [{"n":"exact place name","c":"modern country it lies in","k":"kind"}] so IntMap pins them — NEVER output coordinates, exclude whole countries and vague/relative terms, and the spots you name in the prose MUST match "places". If the request is PRIMARILY about mapping locations, prefer a mapping action instead — "poi" for facilities, "researchMap" for a place/topic situation. CITE sources by NAME only (e.g. "according to the World Bank", "Reuters reported") — do NOT put article/source URLs or markdown links in the prose: the user reported that Atlas\'s attached links frequently 404, and fabricated or guessed URLs are the cause. The ONLY urls you may output are ones that literally appear in the evidence block or your web_search results, and only inside "analyze"/"mapReport" items — never invent a URL for an "answer". Do NOT deflect such questions to "brief" or any panel — the user asked a question, so answer it (you may ADD a relevant map action like flyTo alongside). Also use "answer" to honestly explain anything you could NOT do. Answer text must NOT pretend an un-emitted action happened.\n' },
    ],
    policy: { answer: true },   /* an ANSWER about a topic (#R159) — js/atlas-turn-results.js keys its results by topic */
    schema: () => ({ type: 'object', properties: { question: str(), query: str(), text: str(), place: str(), countries: list(str()), country: str(), use: list(str()), scope: str(), temporalMode: one('current', 'historical', 'mixed', 'unspecified'), requestedOutputs: list(str()), datasets: list(str()) }, required: ['question'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, ensureData = K.ensureData, WORLD_RE = K.WORLD_RE, placeExtent = K.placeExtent, geocode = K.geocode, resolveCountry = K.resolveCountry, codeAtPoint = K.codeAtPoint, OFFICE_RE = K.OFFICE_RE, countryStats = K.countryStats, HOST = K.HOST, fetchData = K.fetchData, _newsData = K._newsData, _gnewsNews = K._gnewsNews, WEB_BUDGET_MS = K.WEB_BUDGET_MS, _gdeltNews = K._gdeltNews, _wikiSummary = K._wikiSummary, _weatherData = K._weatherData, _airData = K._airData, _sstData = K._sstData, _elevData = K._elevData, _leaderData = K._leaderData, _quakeData = K._quakeData, _statsData = K._statsData, GATHER_BUDGET_MS = K.GATHER_BUDGET_MS, _nowContext = K._nowContext, _analyzeFreshness = K._analyzeFreshness, nm = K.nm, _analyzeHeaderBlock = K._analyzeHeaderBlock, _analyzeEvidence = K._analyzeEvidence, POLICY = K.POLICY, _evidenceBlock = K._evidenceBlock, _newsLbl = K._newsLbl, ANOM = K.ANOM, stateContext = K.stateContext, _langLine = K._langLine, _analysisSystemPrompt = K._analysisSystemPrompt, runStructuredAnswer = K.runStructuredAnswer, _statsFacts = K._statsFacts, askAIJSONEnvelope = K.askAIJSONEnvelope, aiParseJSON = K.aiParseJSON, esc = K.esc, renderAnswer = K.renderAnswer, mdMini = K.mdMini, linkCards = K.linkCards, _pinReplyPlaces = K._pinReplyPlaces, answerPlainText = K.answerPlainText, citedRecords = K.citedRecords, auditMeta = K.auditMeta;
      { const q=String(a.question||a.query||a.text||'').trim();
          if(!q) return R(false, warn(L('What should I analyze?','何を分析しますか？','Was soll analysiert werden?','Что проанализировать?','¿Qué analizo?')));
          await ensureData();
          const use=Array.isArray(a.use)?a.use.map(x=>String(x||'').toLowerCase()):null;
          const wantD=k=>use?use.indexOf(k)>=0:null;   /* null = "not specified" → sensible defaults below */
          /* place context (filters news/quakes + anchors point values); "there" resolves via deixis. */
          let ctx=null; const placeStr=String(a.place||'').trim();
          if(placeStr&&!WORLD_RE.test(placeStr)){ try{ ctx=await placeExtent(placeStr); }catch(_){} if(!ctx){ try{ ctx=await geocode(placeStr); }catch(_){} } }
          const pt=(ctx&&ctx.lng!=null&&isFinite(ctx.lng))?ctx:null;
          /* countries for stats: explicit list, else the country under the place point. */
          let codes=[]; const cnames=Array.isArray(a.countries)?a.countries:(a.country?[a.country]:[]);
          for(const n2 of cnames){ try{ const c=await resolveCountry(n2); if(c&&c.code&&codes.indexOf(c.code)<0) codes.push(c.code); }catch(_){} }
          if(!codes.length&&pt){ const cd=codeAtPoint(pt.lng,pt.lat); if(cd) codes.push(cd); }
          /* (#R74) officeholder questions: find the country IN the question when none was passed, so the
             live Wikidata incumbent block below can anchor the answer. */
          const isOffice=OFFICE_RE.test(q);
          if(isOffice&&!codes.length){ try{ for(const cd in countryStats){ const s3=countryStats[cd]; if(!s3) continue;
            const en3=String(s3.nameEn||''), jp3=String(s3.nameJp||'');
            if((en3.length>3&&q.toLowerCase().indexOf(en3.toLowerCase())>=0)||(jp3.length>1&&q.indexOf(jp3)>=0)){ codes.push(cd); if(codes.length>=3) break; } } }catch(_){} }
          /* gather — defaults: news + quakes + stats(+weather when a place anchors it); air/marine/elevation on request. */
          const got={}, missing=[], srcSink=[];   /* (#R79) srcSink collects real article {url,title,src} for ChatGPT-style source cards */
          if(wantD('news')!==false){ if(typeof HOST.globalData!=='undefined'&&(!HOST.globalData||!HOST.globalData.length)){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
            got.news=_newsData(ctx,q,srcSink); if(!got.news) missing.push(L('loaded news','読み込み済みニュース','geladene News','загруженные новости','noticias cargadas')); }
          const jobs=[];
          /* (#R62) LIVE WEB SEARCH is now a first-class dataset (default ON) — the loaded RSS feed alone produced
             honest-but-useless "insufficient data" answers (the Taiwan report). GDELT covers current events across
             the world's outlets; Wikipedia supplies stable background. */
          if(wantD('web')!==false){ const topic=(ctx&&ctx.name)||placeStr||'';
            /* (#R64) GDELT needs an ENGLISH topic (a Japanese place name returned nothing → the Greece report's
               "取得不可: ライブWebニュース"); Google News RSS covers the user's own language. Both run.
               (#R131) MULTI-COUNTRY FIX (root cause of the missing Kazakhstan/Turkmenistan coverage): the old
               code OVERRODE the topic with codes[0]'s English name, so "Central Asia (5 countries)" silently
               searched only Kazakhstan. Now: search the REGION and an OR of the REQUESTED countries, so every
               requested country can surface — without an unbounded per-country search explosion. */
            const cnEn=[]; try{ codes.forEach(c=>{ const s5=countryStats[c]; if(s5&&s5.nameEn&&cnEn.indexOf(s5.nameEn)<0) cnEn.push(s5.nameEn); }); }catch(_){}
            const multi=cnEn.length>1;
            let regionQ=''; if(topic) regionQ='"'+topic.replace(/"/g,'')+'"'; else if(cnEn.length===1) regionQ='"'+cnEn[0].replace(/"/g,'')+'"';
            if(!regionQ&&!multi){ try{ regionQ=q.split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>3).slice(0,4).join(' '); }catch(_){ regionQ=q.slice(0,60); } }
            const orQ=multi?('('+cnEn.map(n=>'"'+n.replace(/"/g,'')+'"').join(' OR ')+')'):'';
            jobs.push((async()=>{ let any=false;
              /* ⚠⚠ (#R452) GOOGLE NEWS IS A DIFFERENT HOST, SO IT STARTS NOW AND IS AWAITED LAST — all three were in one file, so own-language news waited out every GDELT attempt first, and the file exists for GDELT's per-IP limit, which says nothing about news.google.com */
              const gnQ=topic||cnEn.join(' OR ')||q.slice(0,60);
              const wNotes=[],nn=()=>{ const n={}; wNotes.push(n); return n; }; const gn=_gnewsNews(gnQ,srcSink,nn).catch(()=>null);   /* 3) user-language Google News — started first, awaited last. ⚠⚠⚠ (#R769) ONE NOTE PER ATTEMPT, never one shared object — the ladder states its own verdict (js/proxy-fetch.js opts.note) and a shared note lets the LAST engine to finish speak for all of them */
              const w0=Date.now(); const wLeft=()=>WEB_BUDGET_MS-(Date.now()-w0);
              /* ⚠⚠ (#R464) wLeft() is HANDED to each call, not just consulted before it — consulting alone gated only whether to START one, so 3×14 s ran inside a 「20 s」 budget (js/atlas-deadlines.js)
                 1) region-wide GDELT (the whole area) — runs sequentially with (2) to stay gentle on GDELT's rate limit */
              if(regionQ){ let v=await _gdeltNews(regionQ,srcSink,null,wLeft(),nn()); if(!v&&regionQ.indexOf('"')>=0&&wLeft()>0) v=await _gdeltNews(regionQ.replace(/"/g,''),srcSink,null,wLeft(),nn()); if(v){ got.web=v; any=true; } }
              /* 2) a search that INCLUDES the explicit countries (OR of the requested set), so no country is dropped */
              if(orQ&&wLeft()>0){ let v3=await _gdeltNews(orQ,srcSink,null,wLeft(),nn()); if(v3){ got.web3=v3; any=true; } }
              const v2=await gn;
              if(v2){ got.web2=v2; any=true; }
              if(!any) missing.push(L('live web news','ライブWebニュース','Live-Webnews','живые веб-новости','noticias web en vivo')+(wNotes.some(n=>n&&n.reason==='ok')?L(' — sources answered, no matching story',' — 各取得先は応答、該当記事なし',' — Quellen antworteten, kein Treffer',' — источники ответили, совпадений нет',' — las fuentes respondieron, sin coincidencias'):L(' — no source could be reached',' — どの取得先にも到達できず',' — keine Quelle erreichbar',' — ни один источник недоступен',' — ninguna fuente accesible')));   /* ⚠ (#R769) THE TEST IS 「did ANY source answer」, not 「did any attempt fail」 — a ladder that reached Google News and found no matching story is the world saying no; a ladder where nothing answered is IntMap saying nothing, and only the second is ours to fix. ⚠ The base string is UNCHANGED so the readers who already have it keep it (CONSTITUTION.md §0-3); the clause is what is new */ })());
            if(topic) jobs.push(_wikiSummary(topic).then(v=>{ if(v) got.wiki=v; })); }
          if(wantD('weather')===true||(wantD('weather')===null&&pt)){ if(pt) jobs.push(_weatherData(pt.lng,pt.lat).then(v=>{ if(v) got.weather=v; else missing.push(L('weather','天気','Wetter','погода','tiempo')); })); else missing.push(L('weather (no place given)','天気（場所未指定）','Wetter (kein Ort)','погода (нет места)','tiempo (sin lugar)')); }
          if(wantD('airquality')===true||wantD('air')===true){ if(pt) jobs.push(_airData(pt.lng,pt.lat).then(v=>{ if(v) got.air=v; else missing.push(L('air quality','大気質','Luftqualität','качество воздуха','calidad del aire')); })); else missing.push(L('air quality (no place given)','大気質（場所未指定）','Luftqualität (kein Ort)','воздух (нет места)','aire (sin lugar)')); }
          if(wantD('marine')===true||wantD('sst')===true){ if(pt) jobs.push(_sstData(pt.lng,pt.lat).then(v=>{ if(v) got.sst=v; else missing.push(L('sea temperature','海水温','Meerestemperatur','темп. моря','temp. del mar')); })); else missing.push(L('sea temperature (no place given)','海水温（場所未指定）','Meerestemperatur (kein Ort)','море (нет места)','mar (sin lugar)')); }
          if(wantD('elevation')===true){ if(pt) jobs.push(_elevData(pt.lng,pt.lat).then(v=>{ if(v) got.elev=v; else missing.push(L('elevation','標高','Höhe','высота','elevación')); })); else missing.push(L('elevation (no place given)','標高（場所未指定）','Höhe (kein Ort)','высота (нет места)','elevación (sin lugar)')); }
          if(isOffice&&codes.length) jobs.push(_leaderData(codes).then(v=>{ if(v) got.leaders=v; }).catch(()=>{}));   /* (#R74) live incumbents */
          if(wantD('quakes')!==false) jobs.push(_quakeData(ctx).then(v=>{ if(v) got.quakes=v; else missing.push(L('earthquakes','地震','Erdbeben','землетрясения','sismos')); }));
          /* (#R119) the DISPLAYED layers' live values at the anchor point become first-class evidence */
          if(pt&&window.IntMapLayers){ jobs.push(window.IntMapLayers.sampleAt(pt.lng,pt.lat).then(v=>{ if(v&&v.length) got.layers=v.filter(x=>x&&x.value!=null).map(x=>x.label+': '+x.value).join('\n'); }).catch(()=>{})); }
          /* (#R119) scope:"drawn-area" — the old standalone area-summary is absorbed here: news inside the user's
             drawn polygon / circle(s) + layer values at its centroid feed the SAME analyze pipeline. */
          try{ const scope=String(a.scope||'').toLowerCase();
            if(/drawn|area|circle|radius/.test(scope)&&typeof turf!=='undefined'){
              let inside=null, ctr=null;
              if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3){ const poly=turf.polygon([[...HOST.measurePoints,HOST.measurePoints[0]]]); inside=(x,y)=>{ try{ return turf.booleanPointInPolygon(turf.point([x,y]),poly); }catch(_){ return false; } }; try{ const c4=turf.centroid(poly).geometry.coordinates; ctr={lng:c4[0],lat:c4[1]}; }catch(_){} }
              else if(typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length){ inside=(x,y)=>HOST.radiusItems.some(c=>{ try{ return turf.distance(turf.point(c.center),turf.point([x,y]),{units:'kilometers'})<=c.radiusKm; }catch(_){ return false; } }); ctr={lng:HOST.radiusItems[0].center[0],lat:HOST.radiusItems[0].center[1]}; }
              if(inside){ const rows=[];
                try{ (typeof HOST.globalData!=='undefined'?(HOST.globalData||[]):[]).forEach(it=>{ const lc=it&&it.analysis&&it.analysis.loc; if(lc&&isFinite(lc[0])&&inside(+lc[0],+lc[1])&&rows.length<24) rows.push('- '+String(it.title||'').slice(0,120)+(it.pubDate?(' ('+String(it.pubDate).slice(0,16)+')'):'')); }); }catch(_){}
                got.areaNews=(rows.length?rows.join('\n'):L('(no loaded news points inside the drawn area)','（描画範囲内に読み込み済みニュース地点なし）','(keine geladenen News im Gebiet)','(нет новостей в области)','(sin noticias en el área)'));
                if(ctr&&window.IntMapLayers){ jobs.push(window.IntMapLayers.sampleAt(ctr.lng,ctr.lat).then(v=>{ if(v&&v.length) got.layersArea=v.filter(x=>x&&x.value!=null).map(x=>x.label+': '+x.value).join('\n'); }).catch(()=>{})); }
                try{ if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3){ jobs.push(window.IntMapLazy.need('popArea').then(()=>window.IntMapPopArea.estimate({type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]})).then(v=>{ if(v) got.areaPop=v.pop.toLocaleString()+' (WorldPop 2020, 100m grid)'; }).catch(()=>{})); } }catch(_){}
              } } }catch(_){}
          if(wantD('stats')!==false){ got.stats=_statsData(codes); if(!got.stats&&(wantD('stats')===true||codes.length)) missing.push(L('country stats','国別統計','Länderstatistik','статистика стран','estadísticas')); }
          { const late=await settleWithin(jobs,GATHER_BUDGET_MS); if(late) missing.push(lateNote(late,GATHER_BUDGET_MS)); }
          /* build the DATA block + synthesize with ONE text-AI call (answers ONLY from this data). */
          /* (#R131) Give the model a REAL clock + requested time window (the old prompt passed only a UTC date, so
             it had no way to reject out-of-window items) and, for a multi-country request, the explicit country set
             it must report coverage for. */
          const nowCtx=_nowContext(); const freshness=_analyzeFreshness(q);
          const analysisWebMode=(freshness.critical||(use&&use.indexOf('web')>=0))?'required':'auto';   /* (#R131) freshness-critical → FORCE live web verification; (#R158) an explicit use:['web'] (e.g. an informational answer routed here for sources) also forces it, so sources are never zero */
          const covNames=[]; try{ codes.forEach(c=>{ const s6=countryStats[c]; if(s6&&(s6.nameEn||nm(s6))) covNames.push(s6.nameEn||nm(s6)); }); }catch(_){}
          if(!covNames.length&&cnames.length) cnames.forEach(n7=>{ const t7=String(n7||'').trim(); if(t7) covNames.push(t7); });
          const coverage={ region:(placeStr||(ctx&&ctx.name)||''), countries:covNames };
          let block=''; const parts=[];   /* ⚠⚠⚠ (#732) each DATA block is a part with its reader label, and becomes an evidence record the answer's claims can cite (js/atlas-answer-pipeline.js) — 「使用データ」 is read off those citations below, no longer off what was put in the prompt */
          const push2=(tag,lbl,v)=>{ if(v){ parts.push(block,{tag:tag,label:lbl,text:v}); block=''; } };
          /* TIME CONTEXT + REQUESTED COVERAGE first — the model reads the clock (and the country set it must cover)
             before the evidence. Shared with the regression harness via _analyzeHeaderBlock so they never drift. */
          block+=_analyzeHeaderBlock(nowCtx, freshness, coverage);
          /* (#R131) ONE dated NEWS EVIDENCE block (loaded + GDELT + Google News), newest-first, each stamped with
             its date_type and event_date:unknown — replaces the 3 undated headline dumps that let the model read a
             publication/seen date as the event date. */
          const evRecs=_analyzeEvidence(srcSink);
          /* ⚠⚠⚠ (atlas-find-semantic) ONE NUMBERING. This list and the pipeline's EVIDENCE RECORDS list the same articles, and the
             registry is what resolves a citation — so the list is written from the registry's ids (a part that is a function of
             it, js/atlas-answer-pipeline.js), and the registry is handed the articles in this list's order, newest first. */
          if(evRecs.length){ parts.push(block, reg=>'[NEWS EVIDENCE — headlines IntMap gathered'+(ctx&&ctx.name?(', around '+ctx.name):'')+'. Each item is a LEAD, not a confirmed event: article_date/date_type = when the ARTICLE appeared; event_date is UNKNOWN unless the wording itself verifies it. Ordered newest-first by article date. The ids are the EVIDENCE RECORDS ids below.]\n'+POLICY.turnMechanics.fence.wrap(_evidenceBlock(evRecs,reg.idOf))+'\n\n'); block='';   /* (#R801) outside text, fenced — see _agentPrompt */ }
          else if(got.news) push2('LATEST NEWS (loaded in IntMap'+(ctx&&ctx.name?(', filtered to '+ctx.name):'')+')',_newsLbl('loaded'),POLICY.turnMechanics.fence.wrap(got.news));
          else if(freshness.critical) missing.push(L('in-window verified events','対象期間内の確認済み出来事','verifizierte Ereignisse im Zeitfenster','подтверждённые события в окне','eventos verificados en la ventana'));
          push2('CURRENT NATIONAL LEADERS (Wikidata LIVE query, P6/P35 — authoritative for who currently holds office)','Wikidata',got.leaders);
          push2('BACKGROUND (Wikipedia)','Wikipedia',got.wiki);
          push2('CURRENT WEATHER'+(pt&&(pt.name||placeStr)?(' @ '+(pt.name||placeStr)):''),L('weather','天気','Wetter','погода','tiempo'),got.weather);
          push2('AIR QUALITY',L('air quality','大気質','Luftqualität','воздух','aire'),got.air);
          push2('SEA SURFACE',L('sea temperature','海水温','Meerestemperatur','темп. моря','mar'),got.sst);
          push2('ELEVATION',L('elevation','標高','Höhe','высота','elevación'),got.elev);
          push2('ACTIVE MAP LAYER VALUES @ the anchor point (live values of the layers the user is displaying)',L('displayed-layer values','表示レイヤーの実値','Layer-Werte','значения слоёв','valores de capas'),got.layers);
          push2('NEWS INSIDE THE USER-DRAWN AREA (loaded news points whose location falls in the drawn polygon / circles)',L('area news','範囲内ニュース','Gebiets-News','новости области','noticias del área'),got.areaNews);
          push2('LAYER VALUES @ the drawn-area center',L('area layer values','範囲のレイヤー実値','Gebiets-Layerwerte','значения слоёв области','valores de capas del área'),got.layersArea);
          push2('POPULATION INSIDE THE DRAWN AREA',L('area population','範囲内人口','Gebietsbevölkerung','население области','población del área'),got.areaPop);
          push2('EARTHQUAKES (USGS, last 24 h'+(ctx?', in the area':'')+')',L('earthquakes','地震','Erdbeben','землетрясения','sismos'),got.quakes);
          /* (#R397) …AND THE SAME EVENTS ON ONE SCALE WITH EVERYTHING ELSE. The block above is a sorted
             list of magnitudes; every other hazard arrives as prose, which is why 「世界の異常TOP3」 came
             back as three earthquakes — they were the only rows that could be ORDERED. This adds the
             cross-domain ranking, with each score's components, so the comparison is IntMap's and not
             an artefact of which feed happens to publish numbers. */
          try{ const _cands=ANOM.fromUsgs(K._lastQuakeFeatures||[],Date.now())
                 .concat(ANOM.fromAlerts((window.__wpAlerts&&typeof window.__wpAlerts.at==='function'&&pt)?window.__wpAlerts.at(pt.lng,pt.lat):[],Date.now()));
               const _rk=ANOM.rank(_cands,{nowMs:Date.now(),n:5}); if(_rk.length) block+=ANOM.promptBlock(_rk); }catch(_){}
          push2('COUNTRY STATISTICS',L('country stats','国別統計','Länderstatistik','статистика','estadísticas'),got.stats);
          const st=stateContext(); if(st) block+='[CURRENT MAP STATE]\n'+st+'\n\n';
          /* (#R113) IntMap already ran the live web-news search (GDELT + Google News) into the DATA blocks above;
             the model does NOT have its own web-search tool by default, so it works from that evidence and answers
             honestly when the evidence is thin (rather than the old "the model MUST search" assertion). */
          const lang=_langLine();
          /* (#R64) REPORT quality ("クソみたいなレポート出力してんじゃねーよ"): lead with what is actually happening
             (news, dated), analyse rather than recite — no weather/quake/statistics dumps unless they answer the
             question.
             (#R69) the old prompt said "use ONLY the DATA blocks", which actively FORBADE the model from using its
             web_search results → the "ギリシャの近況" non-answer ("特筆すべきニュースなし"). The web search is now a
             REQUIRED evidence source whenever the blocks are thin, and no-news answers without a search are banned. */
          const sys2=_analysisSystemPrompt(nowCtx, freshness, coverage, lang);
          /* ══ (#R350) THE ANSWER IS A CONTRACT, NOT A STRING ══════════════════════════════════
             What stood here: ONE askAI for prose, a regex that peeled a "PLACES:" JSON trailer off
             the end, a second regex that peeled a "SOURCES:" line off the end, and then
             window._aiLastMeta / window._aiLastCitations — the globals whichever call answered LAST
             overwrites — read AFTER the await. Every defect of the reported China answer was ALLOWED
             by that shape rather than caused by one bad generation: an opening sentence nothing could
             compare with the body, three meanings of 「支えている」 carried by one word, two statistical
             series chained inside one sentence, and a URL the model invented rendered as a live link.
             The orchestration is js/atlas-answer-pipeline.js, the rules are js/atlas-answer-audit.js,
             the drawing is js/atlas-answer-render.js. This is the CALL SITE and nothing more — the
             kernel is under a shrink-only ceiling (tests/atlas-console-kernel-checks.test.mjs #R199 ⑤) and new logic goes to a module. */
          let RES=null;
          try{ RES=await runStructuredAnswer({
              question:q, dataBlock:parts.concat([block]), systemPrompt:sys2, language:lang,
              /* (#R406) ATLAS says whether this is about now or about the past, as an argument on the
                 call. It used to be _requestProfile(q) — a regular expression over the reader's
                 sentence, which is the layer this round removed. */
              temporalMode:String((a&&a.temporalMode)||'unspecified'),
              requestedOutputs:Array.isArray(a&&a.requestedOutputs)?a.requestedOutputs:[],
              turnId:K._curTurnKey, webMode:analysisWebMode, clientSources:evRecs.map(s=>Object.assign({label:_newsLbl(s&&s.origin)},s)),
              webSources:turnPages(K._curTurnKey).slice(),   /* (atlas-completion) pages an earlier call of this turn retrieved — they get ids before this call */
              appFacts:_statsFacts(codes).map(f=>Object.assign({label:L('country stats','国別統計','Länderstatistik','статистика','estadísticas')},f)).concat((()=>{ try{ return datasetFactsOnPage(a&&a.datasets); }catch(_){ return []; } })()), retrievedAt:nowCtx.local, answerGoal:String(q||'').slice(0,200),
              ask:(pr,sy,o)=>askAIJSONEnvelope(pr,sy,null,o), parseJSON:aiParseJSON }); }
          catch(e){ return R(false, warn(esc((e&&e.message)||'AI error'))); }
          const _env=RES.env, _reg=RES.registry;
          try{ keepTurnPages(K._curTurnKey, (RES.retrieved||[]).filter(r=>r.origin==='hosted_web')); }catch(_){}   /* (atlas-completion) this call's search results, for the turn's next call */
          if(!String((_env.answer.directAnswer&&_env.answer.directAnswer.text)||'').trim()) return R(false, warn(L('The analysis returned no answer','分析結果が空でした','Analyse ergab keine Antwort','Анализ не дал ответа','El análisis no dio respuesta')));
          /* ⚠ THE FULL TRACE IS A DEVELOPER FACILITY AND CARRIES NO PROMPT, NO TOKEN AND NO ARTICLE
             BODY — call ids, audit codes and counts only, so turning it on in production leaks
             nothing. window.IntMapAtlasDev is the same switch the rest of Atlas debugging uses. */
          try{ if(window.IntMapAtlasDev) window.IntMapAtlasTrace=Object.assign({},RES.trace,{errors:RES.audit.errors.map(x=>x.code),warnings:RES.audit.warnings.map(x=>x.code)}); }catch(_){}
          let html='<div class="atl-md">'+renderAnswer(_env,_reg,{L,esc,mdMini,linkCards})+'</div>';
          /* (#R150) prose↔map reconciliation is unchanged in intent — it now reads the STRUCTURE's
             places instead of a JSON line scraped off the end of the prose. */
          /* ⚠ (#R397) PASS THE PLACE, NOT THREE OF ITS FIELDS. This re-flattened every place to
             {n,c,k} — so the coordinate and provenance `normalizeAnswer` had just merged in were
             discarded ONE LINE before the pinning step that needed them, and the name was resolved
             again from scratch. `_env.places` are already GeoObjects; hand them over whole. */
          try{ html+=await _pinReplyPlaces(_env.places||[],{text:answerPlainText(_env),placesDeclared:true,citations:_reg.all().filter(r=>r.finalUrl).map(r=>({url:r.finalUrl,title:r.title,publisher:r.publisher||''}))}); }catch(e){ try{ console.warn('analyze map audit',e); }catch(_){} }
          /* (#R131) Freshness-critical question but live web verification did NOT complete: the answer is said to be
             provisional, so leads are never presented as confirmed direct evidence (the Central-Asia failure).
             ⚠ (atlas-completion) WHAT IS SAID IS READ OFF WHAT HAPPENED — the search's own outcome (RES.web) and what
             the rendered claims actually cite — not one sentence about headlines for every case (webOutcomeLine /
             groundsLine above). A search that ran and found nothing is not one that failed, and an answer that cites
             no headline is not «based mainly on headlines». */
          const _cited=citedRecords(_env,_reg);
          const _web=RES.web||null, _webShort=_web?(_web.state!=='ok'):!RES.webUsed;
          const _caveat=(freshness.critical&&_webShort)?(webOutcomeLine(_web,L)+' '+groundsLine(_cited,L)):'';
          const _cut=(RES.finish&&RES.finish.status==='incomplete')?L('The model stopped before finishing this answer ('+(RES.finish.reason||'incomplete')+') — what is shown is the part it wrote.','モデルはこの回答を書き終える前に停止しました（'+(RES.finish.reason||'incomplete')+'）。表示されているのは書かれた部分までです。'):'';
          [_cut,_caveat].filter(Boolean).forEach(t=>{ html+='<div style="margin-top:8px;padding:7px 10px;border:1px solid var(--warn-color,#c98a00);border-radius:8px;background:rgba(201,138,0,.09);font-size:11px;line-height:1.5;color:var(--text-main);">'+icon('warning')+' '+esc(t)+'</div>'; });
          const usedAll=[]; _cited.forEach(r=>{ if(r.label&&usedAll.indexOf(r.label)<0) usedAll.push(r.label); });   /* (#732) what the rendered claims CITE (js/atlas-answer-render.js citedRecords) — not every block that was put in the prompt */
          if(RES.webUsed) usedAll.push(L('live web verification','ライブWeb検証','Live-Web-Verifizierung','проверка в интернете','verificación web en vivo'));
          if(usedAll.length) html+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">'+L('Data used','使用データ','Verwendete Daten','Данные','Datos usados')+': '+usedAll.join(', ')+'</div>';   /* (#R118) no data → NO empty "Data used:" line */
          /* (atlas-completion) …and the same facts to Atlas: what the search did, whether the answer ended, and every
             document retrieved so far with its id — so a search that failed or found nothing can be followed by a
             lookup another way, from what is already in hand, rather than only by the caveat. */
          const _am=auditMeta(_env);
          const _webMeta={ web:_web||{state:'unreported',reason:null,searches:0,sources:null}, finish:RES.finish||null,
            retrieved:(RES.retrieved||[]).map(r=>({id:r.id,url:r.url,title:r.title,origin:r.origin,retrievedAt:r.retrievedAt})),
            citedOrigins:_cited.map(r=>r.origin),
            webNote:(_webShort?(webOutcomeLine(_web,(en)=>en)+' '):'')+groundsLine(_cited,(en)=>en) };
          return R(true,html,{meta:Object.assign({},_am||{},_webMeta)}); }   /* ⚠ (#R419/#R472) THE ANSWER IS RENDERED IN FULL AND ATLAS IS TOLD WHAT THE AUDIT NOTICED — codes, not a verdict, and never a claim that something was removed (nothing is). auditMeta() in js/atlas-answer-pipeline.js. */
    },
  },
  {
    row: ['research.impact',            'impact',         'impactAnalysis,nearbyCritical',                               'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   '', 'external'],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'research.impact', text: 'GEOGRAPHIC IMPACT ANALYSIS: {"type":"impact","place"?:str,"event"?:"quake","km"?:num,"focus"?:["nuclear"|"dam"|"port"|"airport"|"hospital"|"military"|"power", …]} — analyses WHERE an event\'s impact spreads: real critical facilities (OpenStreetMap), nearby cities with real population tags, week\'s earthquakes in radius, loaded news, country density; draws the radius circle + clickable pins and fits the view (use for "この地震に最も近い原発と人口集中地を表示して" → {"type":"impact","event":"quake","focus":["nuclear"]}, "チェルノブイリ周辺300kmの影響分析"). event:"quake" targets the most relevant recent earthquake (nearest to the last referenced place, else the day\'s largest). Default focus = nuclear + dams; km default 300.\n' },
    ],
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), km: num(0), event: str(), focus: list(str()) } }),
    async run(a, dctx, K) { const ensureData = K.ensureData, _fetchJSON = K._fetchJSON, R = K.R, warn = K.warn, L = K.L, _havKm = (p1, p2) => haversineKm(p1.lng, p1.lat, p2.lng, p2.lat), _setLast = K._setLast, DEIXIS_RE = K.DEIXIS_RE, placeExtent = K.placeExtent, geocode = K.geocode, esc = K.esc, overpassPOIs = K.overpassPOIs, overpassRaw = K.overpassRaw, HOST = K.HOST, _newsData = K._newsData, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, codeAtPoint = K.codeAtPoint, countryStats = K.countryStats, nm = K.nm, _PINNED = K._PINNED;
      { /* (#R75) vision §11 — WHERE an event's impact
          spreads: real critical facilities + population context + nearby quakes/news around a point, on the map. */
          await ensureData();
          const kmR=Math.max(20,Math.min(1500,(+a.km||300)));
          let ctr=null,label='',evLine='',quakeF=null;
          const wantQuake=(String(a.event||'').toLowerCase()==='quake')||/地震|earthquake|quake/i.test(String(a.place||a.event||''));
          if(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)){ ctr={lng:+a.lng,lat:+a.lat}; label=String(a.place||'').trim()||((+a.lat).toFixed(2)+', '+(+a.lng).toFixed(2)); }
          else if(wantQuake){
            const j=await _fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
            let fs=(j&&j.features)||[]; if(!fs.length) return R(false, warn(L('No M2.5+ earthquakes in the last 24 h','直近24時間にM2.5以上の地震がありません','Keine Beben M2.5+ in 24 h','Нет землетрясений M2.5+ за сутки','Sin sismos M2.5+ en 24 h')));
            /* nearest to the last referenced place if we have one, else the largest of the day */
            let f=null; if(K._lastPlace&&isFinite(K._lastPlace.lng)){ let bd=1e9; fs.forEach(f2=>{ const c=f2.geometry&&f2.geometry.coordinates; if(!c) return; const d=_havKm({lng:+c[0],lat:+c[1]},K._lastPlace); if(d<bd){ bd=d; f=f2; } }); if(bd>1500) f=null; }
            if(!f) f=fs.slice().sort((x,y)=>(((y.properties&&y.properties.mag)||0)-((x.properties&&x.properties.mag)||0)))[0];
            const c=f.geometry.coordinates; ctr={lng:+c[0],lat:+c[1]}; label=(f.properties&&f.properties.place)||'earthquake';
            const hAgo=f.properties&&f.properties.time?Math.round((Date.now()-f.properties.time)/3600000):null;
            evLine='M'+(f.properties&&f.properties.mag!=null?(+f.properties.mag).toFixed(1):'?')+(c[2]!=null?(' · '+L('depth ','深さ','Tiefe ','глубина ','prof. ')+Math.round(c[2])+' km'):'')+(hAgo!=null?(' · '+hAgo+L('h ago','時間前','h zuvor','ч назад','h atrás')):'')+' · USGS';
            _setLast({lng:ctr.lng,lat:ctr.lat,name:label}); quakeF=f;
          } else {
            const p=String(a.place||'').trim(); let g=null;
            if(p&&!DEIXIS_RE.test(p)){ try{ g=await placeExtent(p); }catch(_){} if(!g){ try{ g=await geocode(p); }catch(_){} } }
            else g=await geocode(p);
            if(!g||!isFinite(+g.lng)) return R(false, warn(L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(p)));
            ctr={lng:+g.lng,lat:+g.lat}; label=g.name||p;
          }
          const d2r=Math.PI/180; const dLat=kmR/111, dLng=kmR/(111*Math.max(0.2,Math.cos(ctr.lat*d2r)));
          const box=[[ctr.lng-dLng,ctr.lat-dLat],[ctr.lng+dLng,ctr.lat+dLat]];
          /* focus kinds → the existing real-data POI engine (OSM Overpass, mirror-raced) */
          const FK={nuclear:'nuclear power plant',dam:'dams',dams:'dams',port:'ports',ports:'ports',airport:'airports',airports:'airports',hospital:'hospitals',hospitals:'hospitals',military:'military bases',power:'power plants'};
          let kinds=Array.isArray(a.focus)?a.focus.map(x=>FK[String(x||'').toLowerCase()]).filter(Boolean):[];
          if(!kinds.length) kinds=['nuclear power plant','dams'];
          kinds=kinds.slice(0,3);
          const facJobs=kinds.map(k=>overpassPOIs(k,box,false,null).then(r2=>r2===null?overpassPOIs(k,box,true,null):r2).then(r2=>({k,list:r2||[]})).catch(()=>({k,list:[]})));
          /* real cities/towns with OSM population tags (the honest population anchor).
             Runs AFTER the facility queries — Overpass rejects parallel requests from one IP (measured live:
             the same query succeeds alone and 429s beside the facility race). */
          const cityJob=(async()=>{
            const bb='('+(ctr.lat-dLat).toFixed(3)+','+(ctr.lng-dLng).toFixed(3)+','+(ctr.lat+dLat).toFixed(3)+','+(ctr.lng+dLng).toFixed(3)+')';
            const q3='[out:json][timeout:12];node[place~"^(city|town)$"]["population"]'+bb+';out 200;';
            const j=await overpassRaw(q3).catch(()=>null); if(!j) return null;
            /* a successful reply with ZERO cities is a real answer (open ocean), not a failure */
            return j.elements.map(e=>({lng:+e.lon,lat:+e.lat,name:(e.tags&&(e.tags['name:'+(HOST.lang==='jp'?'ja':HOST.lang)]||e.tags.name))||'?',pop:+((e.tags&&e.tags.population)||0),osm:e.id!=null?'node/'+e.id:'',wd:(e.tags&&e.tags.wikidata)||''})).filter(c2=>isFinite(c2.pop)&&c2.pop>0); });
          /* (place-card-unify) the app's one reader of the week's feed, filtered to the radius here. `unavailable` (the feed did not
             answer) is said in the report and marked partial — it used to be `.catch(()=>null)`, which drew «no quakes» for both */
          const qkP=readQuakes({ area:{ point:ctr, radiusKm:kmR }, days:7 });
          const facRes=await Promise.all(facJobs);
          let cities=await cityJob();   /* sequential — after the facility race frees the Overpass slots */
          const qk=await qkP;
          /* distance-filter, sort, annotate */
          const inR=p2=>{ const d=_havKm(p2,ctr); return d<=kmR?d:null; };
          const fac=[]; facRes.forEach(fr=>{ (fr.list||[]).forEach(p2=>{ const d=inR(p2); if(d==null) return; fac.push(Object.assign({},p2,{_d:d,_k:fr.k})); }); });
          fac.sort((x,y)=>x._d-y._d);
          if(cities){ cities=cities.map(c2=>Object.assign(c2,{_d:inR(c2)})).filter(c2=>c2._d!=null).sort((x,y)=>y.pop-x.pop).slice(0,10); }
          const qkN=qk.state==='ok'?qk.features:[], qkFailed=qk.state==='unavailable';
          let news=null; try{ news=_newsData({lng:ctr.lng,lat:ctr.lat,name:label},label); }catch(_){}
          /* draw: pins (facilities + top cities) + the radius circle + fit */
          clearPois();
          K._pois=fac.slice(0,50).map(p2=>({lng:p2.lng,lat:p2.lat,name:p2.name||p2._k,kind:p2._k+' · '+Math.round(p2._d)+' km',sum:'',url:'',src:'OpenStreetMap'}))
            .concat((cities||[]).slice(0,8).map(c2=>({lng:c2.lng,lat:c2.lat,name:c2.name,kind:L('city','都市','Stadt','город','ciudad')+' · '+L('pop ','人口','Bev. ','нас. ','pob. ')+c2.pop.toLocaleString()+' · '+Math.round(c2._d)+' km',sum:'',url:'',src:'OpenStreetMap'})));
          let okP=K._pois.length?paintPois():true; for(let i2=0;i2<6&&!okP;i2++){ await new Promise(r2=>setTimeout(r2,700)); okP=paintPois(); }
          try{ if(typeof HOST.radiusKm!=='undefined') HOST.radiusKm=kmR; if(window._radiusFromPoint) window._radiusFromPoint(ctr.lng,ctr.lat); }catch(_){}
          try{ GE().camera.fitBounds(box,{padding:70,duration:1100,maxZoom:9}); }catch(_){}
          /* report */
          const cd0=codeAtPoint(ctr.lng,ctr.lat); const cs=cd0&&countryStats[cd0];
          const popSum=(cities||[]).reduce((s2,c2)=>s2+c2.pop,0);
          let html='<div style="font-weight:600;margin:2px 0 4px;">'+icon('target')+' '+esc(label)+' — '+L('impact analysis within ','影響分析（半径','Wirkungsanalyse im Umkreis ','анализ воздействия в радиусе ','análisis de impacto en ')+kmR+' km'+(IntMapLang.t(HOST.lang,'','）'))+'</div>';
          if(evLine) html+='<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:5px;">'+esc(evLine)+'</div>';
          kinds.forEach(k=>{ const list=fac.filter(p2=>p2._k===k);
            html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+esc(k)+'</b>: '+list.length+(list.length?(' — '+list.slice(0,3).map(p2=>esc(p2.name||'?')+' ('+Math.round(p2._d)+' km)').join(', ')+(list.length>3?' …':'')):' '+L('(none found in OSM within the radius)','（半径内にOSM登録なし）','(keine in OSM im Radius)','(в OSM не найдено)','(ninguno en OSM en el radio)'))+'</div>'; });
          if(cities===null) html+='<div style="font-size:11px;color:#ff9f0a;">'+icon('warning')+' '+L('City/population query failed (Overpass busy) — population context unavailable','都市・人口の照会に失敗しました（Overpass混雑）','Stadt-/Bevölkerungsabfrage fehlgeschlagen','Запрос городов не удался','Consulta de ciudades falló')+'</div>';
          else if(cities.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Population nearby','周辺人口','Bevölkerung','Население рядом','Población cercana')+'</b>: ≈'+popSum.toLocaleString()+' '+L('in ','（','in ','в ','en ')+cities.length+L(' cities/towns w/ OSM population tags','都市・町のOSM人口タグ合計）',' Städten (OSM-Tags)',' городах (теги OSM)',' ciudades (etiquetas OSM)')+' — '+cities.slice(0,3).map(c2=>esc(c2.name)+' '+(c2.pop>=1e6?(c2.pop/1e6).toFixed(1)+'M':Math.round(c2.pop/1000)+'k')).join(', ')+'</div>';
          else html+='<div style="font-size:11px;color:var(--text-muted);">'+L('No populated cities/towns within the radius (per OSM population tags)','半径内に人口タグ付きの都市・町はありません（OSM基準）','Keine Städte im Radius (OSM)','Городов в радиусе нет (OSM)','Sin ciudades en el radio (OSM)')+'</div>';
          if(cs) html+='<div style="font-size:11px;color:var(--text-muted);">'+esc(nm(cs))+': '+L('density ','人口密度 ','Dichte ','плотность ','densidad ')+(cs.density!=null?Math.round(cs.density).toLocaleString()+'/km²':'—')+'</div>';
          if(qkN.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Earthquakes (7 days, in radius)','地震（過去7日・半径内）','Beben (7 Tage)','Землетрясения (7 дней)','Sismos (7 días)')+'</b>: '+qkN.length+' — max M'+Math.max.apply(null,qkN.map(f2=>(f2.properties&&f2.properties.mag)||0)).toFixed(1)+'</div>';
          if(qkFailed) html+=warn(L('The USGS feed could not be read — earthquakes are not part of this answer.', 'USGS のフィードを読めなかったため、地震はこの答えに含まれていません。'));
          if(news) html+='<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">'+icon('news')+' '+L('Loaded news near here','周辺の読み込み済みニュース','Geladene News','Новости рядом','Noticias cercanas')+':<br>'+esc(String(news).split('\n').slice(0,3).join(' · ').slice(0,220))+'</div>';
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'+L('Sources: OpenStreetMap (facilities, city population tags — coverage varies by region), USGS (earthquakes), IntMap country statistics. Pins are clickable; the circle marks the analysis radius.','出典: OpenStreetMap（施設・都市人口タグ — 地域によって登録密度が異なります）、USGS（地震）、IntMap国別統計。ピンはクリック可能、円は分析半径です。','Quellen: OpenStreetMap, USGS, IntMap-Statistiken.','Источники: OpenStreetMap, USGS, статистика IntMap.','Fuentes: OpenStreetMap, USGS, estadísticas de IntMap.')+'</div>';
          if(!okP&&K._pois.length) html+=warn(L('Could not draw the markers (map still loading)','マーカーを描画できませんでした（地図読込中）','Marker nicht gezeichnet','Маркеры не отрисованы','Marcadores no dibujados'));
          /* (world-objects) WHAT THIS ANALYSIS IS ABOUT, AND WHAT IT FOUND, AS REAL-WORLD OBJECTS. The centre is the quake the
             feed named (its own id, time and depth) or the place that was asked for; each facility, city and quake in the radius
             is tied to it by `within_impact_of`, so «that earthquake» can be followed to what stands near it (research.related). */
          const subj=quakeF?W.fromUsgs(quakeF):W.fromPlace({lng:ctr.lng,lat:ctr.lat,name:label});
          const toCentre=subj?[{rel:'within_impact_of',ref:subj.ref}]:[];
          const wFac=fac.map(p2=>W.fromFacility(p2,{links:toCentre})).filter(Boolean);
          const wCity=(cities||[]).map(c2=>W.fromCity(c2,{links:toCentre})).filter(Boolean);
          const wQk=qkN.filter(f2=>!quakeF||f2.id!==quakeF.id).map(f2=>W.fromUsgs(f2,{links:toCentre})).filter(Boolean);
          W.register([subj].concat(wFac,wCity,wQk).filter(Boolean));
          const wShown=[subj].concat(wFac.slice(0,50),wCity.slice(0,8),wQk.slice().sort((x,y)=>((y.facts.magnitude||0)-(x.facts.magnitude||0))).slice(0,10)).filter(Boolean);
          const exec={ worldObjects:{ subject:subj&&subj.ref, objects:wShown.map(W.brief), totals:{ facility:wFac.length, city:wCity.length, earthquake:wQk.length }, partial: qkFailed || undefined } };
          return R(true, html, Object.assign({}, _PINNED(null,okP), { exec })); }   /* (#R802) the facilities and cities this analysis pinned, declared by the painter — `okP` is the same witness the sentence above prints */
    },
  },
  {
    row: ['research.events',            'events',         'newsEvents,groupNews',                                        'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   'newsEvents', 'external'],
    ui: { at: ['#live-news-feed', '#news-cat-chips'] },
    doc: [
      { in: 'events', at: 10, text: '{"type":"events","place"?:str,"hours"?:6-168,"n"?:int} — ONE event = its many articles (multiple outlets, first report → latest, one map pin per event, clickable). Use for "最近の出来事をまとめて", "what is happening (in X)?", "group the news by event" — the News tab already shows events, clustered SERVER-SIDE over the whole 72-hour window, and this reads what is loaded rather than re-clustering it (fast, deterministic); use mapReport instead when the user wants NEW research via web search on a specific topic. Follow-ups like "2番の出来事を分析して" → emit ' },
    ],
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), hours: num(1), n: int(1) } }),
    async run(a, dctx, K) { const ensureData = K.ensureData, HOST = K.HOST, fetchData = K.fetchData, _agoH = K._agoH, WORLD_RE = K.WORLD_RE, DEIXIS_RE = K.DEIXIS_RE, geocode = K.geocode, placeExtent = K.placeExtent, R = K.R, warn = K.warn, L = K.L, esc = K.esc, _bboxOK = K._bboxOK, newsSubject = K.newsSubject, _havKm = (p1, p2) => haversineKm(p1.lng, p1.lat, p2.lng, p2.lat), note = K.note, groupNewsEvents = K.groupNewsEvents, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, _atlCleanUrl = K._atlCleanUrl, linkCards = K.linkCards, EVENT_RULES = K.EVENT_RULES, _PINNED = K._PINNED;
      { /* (#R76) vision §6 / stage 4 — the loaded news
          grouped into EVENTS (one real-world occurrence, many articles) instead of a flat article list.
          (#R340) THE GROUPING ITSELF IS js/news-cluster.js — the one implementation, with the production
          measurement behind every constant. This case picks the window and the area, draws and writes;
          it decides nothing about what counts as one event. ⚠ Do not re-inline a copy of it here. */
          await ensureData();
          if(typeof HOST.globalData==='undefined'||!HOST.globalData||!HOST.globalData.length){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
          /* ⚠⚠ (#R386) 出来事モードでは**ここで束ね直さない**。すでに Event ならそのまま使う——
             再クラスタリングは「同じ出来事か」を決める場所を 2 つにし、しかもブラウザの 200 件は
             サーバーが見た窓全体より必ず悪い答えを出す（docs/NEWS-EVENTS.md §4.5/§10）。 */
          const _evMode=(typeof HOST.newsSurfaceMode==='function')&&HOST.newsSurfaceMode()==='events';
          let items=(typeof HOST.globalData!=='undefined'&&HOST.globalData)?HOST.globalData.filter(it=>it&&it.analysis&&Array.isArray(it.analysis.loc)&&it.title):[];
          const hrs=Math.max(6,Math.min(168,(+a.hours||96)));
          items=items.filter(it=>{ const h=_agoH(it.pubDate); return h==null||h<=hrs; });
          /* optional place focus */
          let ctx=null; const plc=String(a.place||'').trim();
          if(plc&&!WORLD_RE.test(plc)){ if(DEIXIS_RE.test(plc)) ctx=await geocode(plc); else { try{ ctx=await placeExtent(plc); }catch(_){} if(!ctx){ try{ ctx=await geocode(plc); }catch(_){} } }
            if(!ctx) return R(false, warn(L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(plc)), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,semanticTarget:plc,produced:[],userGoalSatisfied:false}});
            /* (#R340) the area filter asks the SAME question the grouper does — where the story IS, not where
               the pin currently sits (Publisher pin mode moves the pin to the newsroom; see newsSubject). */
            if(ctx.box&&_bboxOK(ctx.box)){ const w=ctx.box[0][0],s2=ctx.box[0][1],e=ctx.box[1][0],n2=ctx.box[1][1]; items=items.filter(it=>{ const sj=newsSubject(it.analysis); return sj&&sj.loc[0]>=w&&sj.loc[0]<=e&&sj.loc[1]>=s2&&sj.loc[1]<=n2; }); }
            else if(isFinite(+ctx.lng)) items=items.filter(it=>{ const sj=newsSubject(it.analysis); return sj&&_havKm({lng:sj.loc[0],lat:sj.loc[1]},ctx)<=800; }); }
          if(items.length<1) return R(true, note('◌ '+L('No geolocated articles in the loaded news for this window/area','この期間・範囲に地点解析済みの記事がありません','Keine georeferenzierten Artikel','Нет геолоцированных статей','Sin artículos geolocalizados')+' ('+hrs+' h'+(ctx&&ctx.name?(' · '+esc(ctx.name)):'')+')'), {meta:{code:'NO_ARTICLES',category:'evidence',retryable:true,semanticTarget:(ctx&&ctx.name)||'',temporalMode:'current',produced:[],userGoalSatisfied:false}});
          /* (#R386) サーバーの Event を、この case が使う形へ**翻訳するだけ**。判定はしない。 */
          const evs=_evMode
            ? items.map(it=>{ const e=it._event; const mem=(e.members||[]).slice().sort((x,y)=>Date.parse(y.publishedAt||0)-Date.parse(x.publishedAt||0));
                const g=mem.length?mem.map(m=>({it:{title:m.title,link:m.url,pubDate:m.publishedAt}})):[{it:{title:e.titleShown||e.title,link:it.link,pubDate:e.lastAt}}];
                return { g, outlets:e.outlets||[], cx:it.analysis.loc[0], cy:it.analysis.loc[1], pname:e.place||'',
                         oldest:_agoH(e.firstAt), newest:_agoH(e.lastAt), _srcCount:e.sourceCount, _it:it }; })
                .sort((a2,b2)=>(b2.g.length-a2.g.length)||((b2._srcCount||0)-(a2._srcCount||0)))
            : groupNewsEvents(items,{agoH:_agoH,fallbackH:hrs});   /* (#R340) ↳ js/news-cluster.js — the rules, the constants and the measurements that set them */
          const N=Math.max(3,Math.min(12,(+a.n||8)));
          const top=evs.slice(0,N);
          /* one pin per EVENT (not per article) */
          clearPois();
          K._pois=top.map((e,i2)=>({lng:e.cx,lat:e.cy,name:(i2+1)+'. '+String(e.g[0].it.title).slice(0,70),
            kind:e.g.length+' '+L('articles','記事','Artikel','статей','artículos')+' · '+e.outlets.length+' '+L('outlets','媒体','Quellen','источников','medios'),
            sum:e.g.slice(0,3).map(x=>String(x.it.title).slice(0,80)).join(' ⏐ ').slice(0,320),
            url:(e.g[0].it.link&&/^https?:/i.test(e.g[0].it.link))?e.g[0].it.link:'',src:e.outlets.slice(0,3).join(', ')}));
          let okE=K._pois.length?paintPois():true; for(let i2=0;i2<6&&!okE;i2++){ await new Promise(r2=>setTimeout(r2,700)); okE=paintPois(); }
          try{ let a2=180,b2=90,c2=-180,d2=-90; K._pois.forEach(p2=>{ a2=Math.min(a2,p2.lng);b2=Math.min(b2,p2.lat);c2=Math.max(c2,p2.lng);d2=Math.max(d2,p2.lat); });
            if(K._pois.length&&c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:90,maxZoom:8,duration:1100}); }catch(_){}
          const fmtH=h=>h<1?L('<1h ago','1時間以内','<1 h','<1 ч','<1 h'):Math.round(h)+L('h ago','時間前','h','ч назад','h');
          let html='<div style="font-weight:600;margin:2px 0 4px;">'+icon('news')+' '+L('Events (grouped news, last ','出来事（ニュースをイベント単位に集約・過去','Ereignisse (letzte ','События (за ','Eventos (últimas ')+hrs+'h'+(IntMapLang.t(HOST.lang,')','）'))+(ctx&&ctx.name?(' — '+esc(ctx.name)):'')+'</div>';
          /* (#R340) the count is the number of articles the events are ACTUALLY built from, not the number
             loaded: the grouper caps the comparison at 600 (pairs are O(n²)) and skips an article whose
             subject will not resolve. Printing items.length would claim a coverage nobody delivered (#R320). */
          const graded=evs.reduce((n2,e)=>n2+e.g.length,0);
          html+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'+graded+' '+L('articles → ','記事 → ','Artikel → ','статей → ','artículos → ')+evs.length+' '+L('events; the ','イベント。上位','Ereignisse; Top ','событий; топ-','eventos; los ')+top.length+L(' biggest shown — click an item or pin to fly','件を表示 — 項目/ピンをクリックで移動',' angezeigt',' показаны',' mayores mostrados')+'</div>';
          top.forEach((e,i2)=>{ const first=e.g[e.g.length-1], latest=e.g[0]; const eu=_atlCleanUrl(latest.it.link);
            html+='<div class="atl-rp-item" data-i="'+i2+'" style="padding:5px 0;border-top:1px solid rgba(128,128,128,0.14);cursor:pointer;">'
              +'<div style="font-size:12px;font-weight:600;line-height:1.45;">'+(i2+1)+'. '+esc(String(latest.it.title).slice(0,110))+'</div>'
              +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">'+(e.pname?(esc(e.pname)+' · '):'')+e.g.length+' '+L('articles from ','記事・','Artikel von ','статей от ','artículos de ')+e.outlets.slice(0,4).map(esc).join(', ')+(e.outlets.length>4?' …':'')+' · '+fmtH(e.oldest)+' → '+fmtH(e.newest)+'</div>'
              +((e.g.length>1&&first.it.title!==latest.it.title)?('<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+L('First report','最初の報道','Erste Meldung','Первое сообщение','Primer reporte')+': '+esc(String(first.it.title).slice(0,90))+'</div>'):'')
              +(eu?(' <a href="'+esc(IntMapSafe.url(eu.url))+'" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--primary-color);text-decoration:none;">'+L('article','記事','Artikel','статья','artículo')+' ↗</a>'):'')   /* (#R153) inline event link via _atlCleanUrl (real article, no aggregator/SNS) */
              +'</div>'; });
          html+=linkCards(top.filter(e=>e.g[0].it.link).slice(0,4).map(e=>({url:e.g[0].it.link,title:e.g[0].it.title,src:e.outlets[0]})));
          /* (#R340) the numbers in this sentence are READ from the grouper, so the explanation cannot describe
             a rule the code no longer applies (#R76's copy still said «place ≤150 km» after the rule changed). */
          /* (#R386) 説明は**実際に通った経路**を印字する（#R340 の「規則が変わったのに説明が古い」の再発防止）。 */
          const _evR=_evMode
            ? L('server-side clustering over the full 72-hour window','サーバー側で72時間の窓全体を見たクラスタリング','serverseitiges Clustering über das gesamte 72-Stunden-Fenster','серверная кластеризация по всему 72-часовому окну','agrupación en el servidor sobre toda la ventana de 72 horas')
            : L('place','位置','Ort','место','lugar')+' × ≤'+EVENT_RULES.HOURS+' h × '+L('headline similarity','見出し類似','Titelähnlichkeit','сходство заголовков','similitud de titulares')+' '+Math.round(EVENT_RULES.SIM_MIN*100)+'–'+Math.round(EVENT_RULES.SIM_MAX*100)+'%';
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'+L('Grouping is mechanical on the loaded IntMap feed ('+_evR+'). A country-level reference point is not a place, so articles that merely file under the same country face a HIGHER wording bar, not a lower one. One group = reports that likely cover the same occurrence; "first report → latest" shows how coverage moved. For source disagreements or deeper analysis, ask e.g. "analyze event 2".','グループ化は読み込み済みニュースに対する機械的クラスタリング（'+_evR+'）です。国レベルの代表点は「同じ場所」とは見なさないので、同じ国に分類されただけの記事には見出しの一致を<b>より強く</b>求めます。1グループ=同一の出来事を扱うとみられる報道で、「最初の報道→最新」で経過が分かります。報道間の相違や深掘りは「2番の出来事を分析して」のように聞いてください。','Mechanische Gruppierung ('+_evR+'); ein Länder-Referenzpunkt gilt nicht als Ort. Für Analysen: "analysiere Ereignis 2".','Механическая группировка ('+_evR+'); точка-представитель страны местом не считается. Для анализа: «проанализируй событие 2».','Agrupación mecánica ('+_evR+'); un punto representativo de país no cuenta como lugar. Para análisis: "analiza el evento 2".')+'</div>';
          if(!okE&&K._pois.length) html+=warn(L('Could not draw the pins (map still loading)','ピンを描画できませんでした（地図読込中）','Pins nicht gezeichnet','Метки не отрисованы','Pines no dibujados'));
          /* (#R340) …and the structured half of the same honesty: research.events declares produces='map,explanation',
             so the result says which of the two actually happened rather than letting the executor assume both. */
          const _evMapped=!!(okE&&K._pois.length);
          /* (world-objects) each event as a real-world object — the server's Event when that is what was read, else the group the
             grouper built — so «event 2» is a ref the follow-up (research.related) can open, not a position in a list that is gone. */
          const wEv=W.register(top.map(e=>e._it?W.fromNewsEvent(e._it):W.fromNewsGroup(e)).filter(Boolean));
          const exec={ worldObjects:{ objects:wEv.map(W.brief), totals:{ news_event:evs.length } } };
          return R(true, html, Object.assign({}, _PINNED({meta:{code:'OK',category:'ok',retryable:false,produced:(_evMapped?['map','explanation']:['explanation']),userGoalSatisfied:true,partial:!_evMapped}},_evMapped), { exec })); }   /* (#R802) …and WHICH events are pinned, so re-grouping the same top events reads as `already_there` rather than `not_rendered` */
    },
  },
  {
    row: ['research.scenario',          'scenario',       'whatIf,runScenario,scenarioRun',                              'research','none',    '',                       'explanation',         'session', 'none',   '',         '', 'external'],
    ui: { none: '2026-11-16' },
    /* (atlas-reasoning) PRODUCT.md §4 item 12 — «IF X HAPPENED, WHAT FOLLOWS?», answered as a structure. It runs one of the
       simulators through its OWN capability (K.dispatch — the executor of record, so nothing here re-implements a model) and
       optionally research.impact around the same point, then reports FOUR FIELDS that are never empty: the assumptions (and
       which of them the model could represent), the data the number stood on, what the model does not consider, and how
       uncertain it is. js/atlas-reasoning.js decides what each says; this draws it. A call with an empty field is refused,
       naming every empty field at once. */
    doc: [
      { in: 'research.impact', at: 10, text: 'WHAT-IF SCENARIO シナリオ・もしもの想定 (assumptions → result, in four fixed fields): {"type":"scenario","model":"ashPlume"|"radiation"|"tsunami"|"pandemicRun","place"?:str or "lng"+"lat","baseline":ISO date/time|"now","assumptions":[{"name":the model\'s own argument (e.g. "hKm","bq","magnitude","days"),"value":…,"basis"?:why}],"impact"?:true|{"km"?:num,"focus"?:[…]}} = run that simulator on exactly the stated assumptions (and, with impact, research.impact around the same point) and answer with FOUR FIELDS that are always present — 前提 (the assumptions, each marked applied or not), 使用データ, 考慮外 (what the model does not represent: an assumption it has no input for, a baseline it cannot take, a failed exposure analysis), 不確実性 (the model\'s own stated limits and, for the pandemic, whether a band or a single draw). It REFUSES, naming every field at once, when the model, the assumptions, the subject or the baseline is empty. A bare year is never turned into a day: give an ISO date for ash and radiation, or it is reported as not applied. Use for 「もし桜島が噴火したら」「もし福島で放出があったら」「M9の地震なら津波はどうなる」「ここで感染が始まったら」 — NOT for a plain simulator run with no stated assumptions (use the simulator itself). EXTERNAL FORECAST (外部の予測データ): add "forecast":{"source":"open-meteo-flood" (GloFAS river discharge, with the provider\'s ensemble spread) | "open-meteo-forecast" (weather; "variable":precipitation_sum|temperature_2m_max|temperature_2m_min|wind_speed_10m_max|wind_gusts_10m_max),"bounds":[w,s,e,n] or lng+lat+halfWidthKm,"days"?:1-16,"nx"?,"ny"?:grid ≤10×10,"conditions"?:{"threshold":number},"observations"?:[dataset ids]} — with no "model" it is the whole scenario: real model output is fetched and put into the GIS as SEPARATE datasets (model estimate, uncertainty; observations are only referenced, this source publishes none), each feature marked dataClass, drawn and coloured by it. The reader\'s threshold is only compared (exceeds), never fed to the model. A request that failed is missing, not zero. Free API is non-commercial, CC BY 4.0 data. ' },
    ],
    chips: 'map.poi',
    schema: () => ({ type: 'object', properties: { model: str(), place: str(), lng: lng(), lat: lat(), baseline: str(), assumptions: list(obj()), impact: obj(), forecast: obj() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L, esc = K.esc, dispatch = K.dispatch, CAPS = K.CAPS;
      /* (forecast) EXTERNAL FORECAST DATA BROUGHT INTO THE GIS — js/gis-forecast.js. With `forecast` and no `model`, this is the whole scenario;
         with both, the simulator's scenario runs as before and the forecast is appended after it. */
      let fcHtml = '', fcMeta = null;
      if (a.forecast && typeof a.forecast === 'object') {
        await window.IntMapLazy.need('gisCore');
        const FC = window.IntMapGisForecast, f = a.forecast;
        if (!FC) return R(false, warn(L('The forecast module could not be loaded.', '予測データのモジュールを読み込めませんでした。')));
        let bounds = f.bounds;
        const flo = f.lng != null ? f.lng : a.lng, fla = f.lat != null ? f.lat : a.lat;
        if (!bounds && flo != null && fla != null && isFinite(+flo) && isFinite(+fla)) {
          const km = Math.max(1, Math.min(500, +f.halfWidthKm || 25));
          const dLat = km / 111.32, dLng = km / (111.32 * Math.max(0.05, Math.cos(+fla * Math.PI / 180)));
          bounds = [+flo - dLng, +fla - dLat, +flo + dLng, +fla + dLat];
        }
        const fr = await FC.fetchForecast({ source: f.source, bounds, nx: f.nx, ny: f.ny, days: f.days, variable: f.variable, models: f.models, conditions: f.conditions, observations: f.observations });
        if (!fr.ok) return R(false, warn(L('The forecast could not be brought in: ', '予測データを取り込めませんでした: ') + esc(fr.why) + (fr.detail ? ' ' + esc(JSON.stringify(fr.detail).slice(0, 300)) : '')),
          { meta: { code: 'forecast-' + fr.why, category: 'upstream', retryable: false, forecast: { why: fr.why, detail: fr.detail }, produced: [], userGoalSatisfied: false } });
        const reg = FC.register(fr);
        const drawn = f.draw === false ? null : await FC.draw(reg);
        const rep0 = forecastReport(fr.record);
        const pick0 = (t) => L(t[0], t[1]);
        const li0 = (rows) => '<ul style="margin:2px 0 4px 16px;padding:0;">' + rows.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
        const hd0 = (t) => '<div style="font-weight:600;margin-top:6px;">' + esc(t) + '</div>';
        fcHtml = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Forecast scenario', '予測シナリオ')) + ' — ' + esc(fr.record.source.id) + '</div>'
          + '<div>' + esc(L('Model estimate dataset: ', '推計のデータセット: ')) + '<code>' + esc(reg.datasets.modelEstimate) + '</code>' + (reg.datasets.uncertainty ? ' · ' + esc(L('uncertainty: ', '不確実性: ')) + '<code>' + esc(reg.datasets.uncertainty) + '</code>' : '') + ' · ' + esc(String(fr.record.modelEstimates.points)) + ' ' + esc(L('forecast grid points', '予測の格子点')) + '</div>'
          + hd0(L('Assumptions (stated by the reader)', '前提（利用者が述べた条件）')) + li0(rep0.assumptions.length ? rep0.assumptions.map((x) => '<b>' + esc(x.name) + '</b> = ' + esc(JSON.stringify(x.value)) + ' — ' + esc(x.applied ? L('applied as a comparison', '比較として反映') : L('stored, not applied', '記録のみ'))) : [esc(L('none stated', '述べられていない'))])
          + hd0(L('Data used', '使用データ')) + li0(rep0.dataUsed.map((t) => esc(pick0(t))))
          + hd0(L('Not considered', '考慮外')) + li0(rep0.excluded.map((t) => esc(pick0(t))))
          + hd0(L('Uncertainty', '不確実性')) + li0(rep0.uncertainty.map((t) => esc(pick0(t))));
        fcMeta = Object.assign({}, rep0, { datasets: reg.datasets, drawn: drawn && drawn.drawn });
        if (!a.model) return R(true, fcHtml, { meta: { forecast: fcMeta, scenario: rep0, produced: ['explanation'], userGoalSatisfied: true } });
      }
      const MODELS = scenarioModels(SIM_ENTRIES);
      const frame = scenarioFrame(a, (s) => CAPS.ofSpelling(s), MODELS);
      const pick = (t) => L(t[0], t[1]);
      if (!frame.ok) {
        const names = Object.keys(MODELS).map((k) => MODELS[k].dispatch);
        const why = { model: L('a model (' + names.join(', ') + ')', 'モデル（' + names.join('・') + '）'),
          assumptions: L('assumptions — each a name and a value (an empty list is not a scenario)', '前提 — それぞれ名前と値を持つこと（空の一覧はシナリオではない）'),
          subject: L('a place, or lng and lat', '場所、または経度と緯度'), baseline: L('a baseline instant (an ISO date/time, or "now")', '基準時点（ISO の日付・時刻、または "now"）') };
        return R(false, warn(L('A scenario needs every field before it runs. Missing: ', 'シナリオは全ての欄が揃うまで実行しません。不足: ') + frame.missing.map((m) => esc(why[m])).join(L('; ', '；'))),
          { meta: { code: 'scenario-incomplete', category: 'input', retryable: false, missing: frame.missing, models: Object.keys(MODELS), produced: [], userGoalSatisfied: false } });
      }
      const call = scenarioCall(frame, MODELS);
      const run = await dispatch(call.args);
      let exposure = null, exHtml = '';
      if (run && run.ok && a.impact) {
        const io = (a.impact && typeof a.impact === 'object') ? a.impact : {};
        const at = (run.meta && run.meta.ash && isFinite(+run.meta.ash.lng)) ? { lng: +run.meta.ash.lng, lat: +run.meta.ash.lat } : frame.point;
        const ia = { type: 'impact' };
        if (at) { ia.lng = at.lng; ia.lat = at.lat; if (frame.place) ia.place = frame.place; } else ia.place = frame.place;
        if (io.km != null) ia.km = io.km;
        if (io.focus) ia.focus = io.focus;
        let ir = null;
        try { ir = await dispatch(ia); } catch (e) { ir = { ok: false, html: String((e && e.message) || e) }; }
        exposure = { asked: true, ok: !!(ir && ir.ok), why: ir && !ir.ok ? String(ir.html || '').split(/[<>]/).filter((_, i) => i % 2 === 0).join('').slice(0, 160) /* the text between tags; no '<' or '>' survives, so nothing can re-form an element */ : '' };
        if (ir && ir.ok) exHtml = ir.html;
      }
      const rep = scenarioReport(frame, call, run, exposure, MODELS);
      if (!rep.complete) return R(false, warn(L('The scenario report has an empty field, so it is not reported.', 'シナリオの報告に空の欄があるため、報告しません。')), { meta: { code: 'scenario-incomplete', category: 'internal', retryable: false, produced: [], userGoalSatisfied: false } });
      const li = (rows) => '<ul style="margin:2px 0 4px 16px;padding:0;">' + rows.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
      const head = (t) => '<div style="font-weight:600;margin-top:6px;">' + esc(t) + '</div>';
      const val = (v) => esc(typeof v === 'object' ? JSON.stringify(v) : String(v));
      const fields = head(L('Assumptions', '前提')) + li(rep.assumptions.map((x) => '<b>' + esc(x.name) + '</b> = ' + val(x.value) + (x.basis ? ' (' + esc(x.basis) + ')' : '') + ' — ' + esc(x.applied ? L('applied', '反映') : L('not applied', '未反映'))))
        + '<div style="font-size:11.5px;">' + esc(L('Baseline', '基準時点')) + ': <b>' + esc(rep.baseline.given) + '</b> — ' + esc(rep.baseline.applied ? L('applied', '反映') : L('not applied', '未反映')) + '</div>'
        + head(L('Data used', '使用データ')) + li(rep.dataUsed.map((t) => esc(pick(t))))
        + head(L('Not considered', '考慮外')) + li(rep.excluded.map((t) => esc(pick(t))))
        + head(L('Uncertainty', '不確実性')) + li(rep.uncertainty.map((t) => esc(pick(t))));
      const title = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Scenario', 'シナリオ')) + ' — ' + esc(frame.modelId) + '</div>';
      if (!run || !run.ok) {
        return R(false, title + (run && run.html ? run.html : warn(L('The model did not run.', 'モデルが実行されませんでした。'))) + fields, { meta: Object.assign({}, run && run.meta, { code: (run && run.meta && run.meta.code) || 'scenario-model-failed', scenario: rep, userGoalSatisfied: false, produced: [] }) });
      }
      return R(true, title + run.html + (exHtml ? '<div style="margin-top:6px;">' + exHtml + '</div>' : '') + fields + fcHtml,
        { meta: Object.assign({}, run.meta, { scenario: rep, forecast: fcMeta, produced: ['explanation'], userGoalSatisfied: true }) });
    },
  },
  {
    /* ══ (atlas-delegation) HAND PIECES OF THE REQUEST TO WORKERS, AND GET THEIR FINDINGS BACK ═══════════════
       Atlas decides whether a request has pieces worth researching apart, how many, and what each returns; the
       workers run at once (js/atlas-delegate.js), each in its own context, and only their findings come back.
       They read and search; they never touch the map — what is drawn, Atlas draws, from what came back.
       How the workers are paid for and whether they may run at all is the server's (ai-proxy config.ts
       delegationPolicy): a refusal comes back as the task's `refused` state with its code, not as a failure. */
    policy: { delegates: true },   /* (capability-facets) starts other model work */
    row: ['research.delegate',          'delegate',       'delegateResearch,parallelResearch',                           'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-18' },
    phrases: () => ['並行して調べる', '手分けして調査', '分担して調べる', '複数の調査', '同時に調査'].concat(['in parallel', 'split the research', 'research separately', 'several pieces', 'delegate']),
    doc: [
      { in: 'research.analyze', at: 30, text: 'DELEGATE RESEARCH TO WORKERS (parallel, each in its own context): {"type":"delegate","tasks":[{"id"?:str,"goal":str,"returns"?:str,"tools"?:[read capability ids this worker may call itself (it then looks, calls, reads the result and calls again, within the per-worker request limit the server states); add "find_capability" to let it search IntMap\'s registry itself — every read-only capability it finds becomes callable by it, anything else is refused with the reason],"model"?:[the id of one of the models listed under «Delegation» in the context, with prices — pick a cheaper one for a piece that only reads or extracts, the stronger one where the piece needs judgement; omit it to use the server default],"inputs"?:[{"from":task id}]} | {"id"?:str,"kind":"capability","capability":str (a read capability id),"args"?:{...}}]} — 並行して調べる・手分けして調査 — hands independent pieces of a large request to worker models that run AT THE SAME TIME, search the web, and return structured findings (summary, claims with places/coordinates/dates/source URLs, and what they could not establish). Use it when a request has several pieces that can be researched apart (e.g. crude oil from the Gulf, iron ore and coal from Australia, and LNG routes to Japan) — not for a single lookup, which you answer faster yourself. A task that needs another task\'s result names it in "inputs" and starts when that one ends. A task of kind "capability" runs ONE exact lookup you already know how to ask (a read-only capability id and its arguments) with NO model and NO cost, alongside the others — use it to fan the same lookup out over several places or items (the weather in five cities, a figure for each of ten countries) and to mix exact figures in with the research; its answer comes back as the task\'s summary and "data". A capability that is not read-only (it draws, changes the view, saves or sends anything) is refused with capability_not_read_only — run that yourself. Tasks may be listed in any order: an input may name a task that comes later in the list, and a loop of inputs is ended input_cycle. A capability task\'s argument may be the string "@<task id>:data.<path>" (also "@<task id>:summary") to receive what an input task produced — e.g. a spatial step\'s "inputs":["@acq:data.gis.dataset"] is handed the dataset the "acq" step made (name acq in "inputs" too); a string that must begin with @ is written "@@…". A reference that leads nowhere ends the task input_ref_unresolved without running it. Add "verify":true to a worker task to have a SECOND worker check its claims against sources of its own: the result\'s integrated.verification says per claim supported / contradicted / unsupported / unchecked (a claim the checker did not repeat stays unchecked, never assumed supported). The workers do not draw anything: you integrate their findings and draw the map from them. Besides each task, the result carries "integrated": findings that more than one worker found (duplicateFindings), places where workers\' figures differ (placeOverlaps with numbersDiffer), the deduplicated sources and who cited each, the gaps, "facts" (what the workers stated as data — object, attribute, value, unit, time, source — matched BY OBJECT across workers even when one wrote «Port of Rotterdam» and another 「ロッテルダム港」: each row is agree / conflict / single with the source of every observation and evidence id, and missingFrom names workers that covered the object but not that attribute; subjects nothing resolved are listed in unresolved), the cost, and which tasks did not return and in what state (unreturned) — read it before you write the answer. Each task comes back with a state (done / partial / failed / refused / unobservable / cancelled) and its cost; a refused task carries the server\'s reason (e.g. delegation_children = the server admits fewer workers; delegation_off = delegation is switched off). The same task list asked again soon after (within the server\'s turn lifetime — e.g. after the page was closed or the turn was cut off) answers its tasks that already ended done/partial from that earlier run — marked "resumed", not run or paid for again; pass "fresh":true to run every task anew.\n' },
    ],
    schema: () => ({ type: 'object', required: ['tasks'], properties: { tasks: list({ type: 'object', properties: { id: str(), kind: one(...CONTRACT_KINDS),   /* the substrate's own list of kinds, not a copy of it */ goal: str(), returns: str(), model: str(), capability: str(), args: obj(), verify: bool(), tools: list(str()), inputs: list({ type: 'object', required: ['from'], properties: { from: str() } }) } }, 1), fresh: bool() } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const tasks = Array.isArray(a && a.tasks) ? a.tasks : [];
      if (!tasks.length) return R(false, warn(L('No task was given to delegate.', '委譲する仕事が指定されていません。')), { meta: { status: 'failed', code: 'no_tasks' } });
      const parent = String(K._curTurnKey || '');
      if (!parent) return R(false, warn(L('Delegation needs a running Atlas turn.', '委譲は Atlas のターンの中でだけ行えます。')), { meta: { status: 'failed', code: 'no_turn' } });
      /* (delegation-limits) THE SERVER'S POLICY, BEFORE ANYTHING IS SPENT. ai-proxy refuses a worker past its policy anyway; asking it
         would cost a round trip per excess task and leave Atlas to discover the number from the wreckage (measured 2026-11-19: three
         workers under a two-worker policy — the third refused after the first two had started). Said back with the number, so Atlas
         regroups the pieces; nothing is cut or merged here (atlas-full-authority — which pieces belong together is Atlas's call). */
      const pol = K._delegationPolicy;
      if (pol && pol.mode === 'off') return R(false, warn(L('Delegation is switched off on the server; research the pieces directly.', 'サーバで委譲が停止されています。各部分は直接調べてください。')), { meta: { status: 'failed', code: 'delegation_off', permanent: true } });
      const isWorker = (x) => !x || !x.kind || x.kind === 'worker';   /* a capability task runs no model: it opens no child turn on the server and is not counted against the worker limit */
      const workerCount = tasks.filter(isWorker).length, checkerCount = tasks.filter((x) => isWorker(x) && x.verify === true).length;   /* a verify:true worker is followed by a second worker — a child turn of its own */
      const childTurns = workerCount + checkerCount;
      if (pol && pol.mode === 'independent' && Number.isInteger(pol.maxChildren) && childTurns > pol.maxChildren) {
        return R(false, warn(L('The server admits at most ' + pol.maxChildren + ' model worker(s) per request; this call needs ' + childTurns + ' (' + workerCount + ' worker task(s)' + (checkerCount ? ' + ' + checkerCount + ' checker(s) for verify:true' : '') + '). Capability tasks are not counted.', 'サーバが 1 つの依頼で受け付ける AI の子は最大 ' + pol.maxChildren + ' 件です。この呼び出しは ' + childTurns + ' 件を要します（worker ' + workerCount + ' 件' + (checkerCount ? ' + verify:true の検証 ' + checkerCount + ' 件' : '') + '。能力タスクは数えません）。')),
          { meta: { status: 'failed', code: 'too_many_tasks', maxChildren: pol.maxChildren, given: tasks.length, workers: workerCount, checkers: checkerCount, childMaxCalls: pol.childMaxCalls } });
      }
      const signal = (typeof K.turnSignal === 'function') ? K.turnSignal() : undefined;
      /* (atlas-orchestration) ONE EXECUTOR, TWO KINDS OF TASK. A worker task is a model behind ai-proxy; a capability task runs one
         read-only capability through the same kernel path a call of Atlas's own takes — no model, no cost. The router sends each
         contract to its kind's lane and REFUSES a kind with no lane (a host that cannot run capabilities says so, it does not run
         the task as a worker). The retry after a transient failure is on only when the server has said how many requests a child
         may make (policy.childMaxCalls), so the retry can never ask for more than the server allows. */
      /* a NUMBER bounds; null (the server states no count) stays null, which runs the worker on progress and not on a count; no policy at all → undefined (the plain two-request worker) */
      const childMax = (pol && Number.isInteger(pol.childMaxCalls)) ? pol.childMaxCalls : (pol && pol.childMaxCalls === null ? null : undefined);
      const executor = makeRouterExecutor({
        worker: makeWorkerExecutor({ ask: K.askAIJSONEnvelope, parentTurn: parent, signal, maxCalls: childMax,
          capability: typeof K.runReadCapability === 'function' ? { run: K.runReadCapability, classify: K.classifyCapability, describe: K.describeCapability, find: K.findCapabilities } : null }),   /* (delegation-agency) a worker granted `tools` runs read capabilities itself, through the same lane */
        capability: typeof K.runReadCapability === 'function' ? makeCapabilityExecutor({ run: K.runReadCapability, classify: K.classifyCapability }) : null,
      });
      /* (delegate-child-loop) RESUMING. The same task list asked again — after the tab was closed, the page reloaded or the turn cut off —
         finds what the last run of it wrote (js/atlas-delegate.js pageDelegationStore, within ai-proxy's turn lifetime), and its tasks that
         ended done/partial answer from that record instead of running and paying again (`resumed`). `fresh:true` runs every task anew.
         The record is written each time a task ends, so an interruption loses only the tasks that had not ended. The list's identity is
         every contract's key (its `tools` grant included) and its `verify` flag (delegationKey). */
      const store = pageDelegationStore();
      const dKey = delegationKey(tasks);
      let prior = null;
      if (store && a.fresh !== true) { try { prior = await store.get(dKey); } catch (_) { prior = null; } }
      const D = makeDelegation({ parent, executor, resume: prior || undefined, maxConcurrent: (pol && Number.isInteger(pol.maxConcurrent)) ? pol.maxConcurrent : null });
      let saving = Promise.resolve(), saves = 0;
      const save = () => { saving = saving.then(() => store.save(dKey, D.snapshot())).then((ok) => { if (ok) saves++; }, () => {}); };
      const unsave = store ? D.subscribe((e) => { if (e && e.kind === 'task.ended') save(); }) : () => {};
      const stateWord = (st) => ({ done: L('done', '完了'), partial: L('partly', '一部'), failed: L('failed', '失敗'), refused: L('refused', '拒否'), unobservable: L('no answer came back', '応答なし'), cancelled: L('cancelled', '取消'), waiting: L('waiting', '待機中'), running: L('running', '実行中'), retrying: L('retrying', '再試行中') })[st] || st;
      const usd = (n) => '$' + (Number(n) || 0).toFixed(3);
      /* LIVE PROGRESS — read off the delegation's own event log as it is written (D.subscribe), not kept beside it. dctx.progress is
         the executor's progress(p) for THIS operation (js/atlas-capabilities.js legacyExecute passes it); js/atlas-progress.js writes
         p.text into the running row of the work trace. Absent (a host without a trace) → nothing is reported and nothing breaks. */
      const progress = (dctx && typeof dctx.progress === 'function') ? dctx.progress : null;
      const live = new Map();
      const unsub = D.subscribe((e) => {
        if (!e || !e.task) return;
        if (e.kind === 'task.created') live.set(e.task, { state: 'waiting' });
        else if (e.kind === 'task.lease') live.set(e.task, { state: 'running' });
        else if (e.kind === 'effect.retry') live.set(e.task, { state: 'retrying' });
        else if (e.kind === 'task.ended') live.set(e.task, { state: String(e.data.state || 'failed') });
        else if (e.kind !== 'effect.done' && e.kind !== 'effect.failed') return;
        if (!progress) return;
        const t = Array.from(live.entries()).map(([id, v]) => ({ id, state: v.state }));
        const ended = t.filter((x) => x.state !== 'waiting' && x.state !== 'running' && x.state !== 'retrying').length;
        const spent = D.spendUsd();
        try { progress({ text: t.map((x) => x.id + ' ' + stateWord(x.state)).join(' · ') + ' — ' + usd(spent), tasks: t, done: ended, total: t.length, costUsd: spent }); } catch (_) { /* a trace that cannot show it is not the work's problem */ }
      });
      /* CANCELLATION — the turn's signal stops every running task (a worker's request is aborted, a capability's run is handed
         the signal); the listener is removed when the run is over, so a later abort of an earlier turn does nothing here */
      const onAbort = () => D.cancelAll();
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true });
      let results, verification = null;
      try {
        const pending = D.run(tasks);
        if (signal && signal.aborted) D.cancelAll();
        results = await pending;
        /* VERIFICATION, WHEN ASKED (`verify:true` on a worker task). A second worker is handed the first one's findings and asked to
           check each against sources of its own; its verdicts come back per claim, and a claim it did not repeat or a checker that did not
           return stays `unchecked` — never assumed supported. It is a child like any other: the server's policy admits it or refuses it,
           and a refusal is reported as the checker's state. */
        const toCheck = results.filter((r, i) => tasks[i] && tasks[i].verify === true && (!tasks[i].kind || tasks[i].kind === 'worker') && (r.state === 'done' || r.state === 'partial') && r.findings.length);
        if (toCheck.length && !(signal && signal.aborted)) {
          const vres = await D.run(toCheck.map((r) => verifyContract(r.id)));
          verification = verifyOutcome(toCheck.map((r, k) => ({ of: r, by: vres[k] })));
          verification.costUsd = vres.reduce((m, r) => m + (Number(r.costUsd) || 0), 0);
          verification.calls = vres.reduce((m, r) => m + (Number(r.calls) || 0), 0);
        }
      } finally {
        if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);
        unsub(); unsave();
        await saving;   /* the record of every task that ended is written before the answer leaves */
      }
      const done = results.filter((r) => r.state === 'done' || r.state === 'partial').length;
      const cost = results.reduce((m, r) => m + r.costUsd, 0);
      /* WHAT THE RESULTS SAY TOGETHER (js/atlas-orchestrate.js integrate) — the card says what a reader should look at; the meta
         carries the same without repeating the findings and gaps the per-task list already carries (what is not carried is not seen
         by the model — js/atlas-toolsurface.js mechanical) */
      const I = integrate(results);
      /* (fact-merge) what the workers STATED as data, matched by object and attribute — a name becomes an object through the session index and the persistent graph, never a list here */
      const F = results.some((r) => r.facts && r.facts.length) ? await mergeFacts(results, { resolve: makeFactResolver({ find: (q) => W.find(q), findPersisted: async (q) => { const g = await G.findPersisted(K.HOST.DB, q); return g && g.ok ? g.object : null; } }), semantics: window.IntMapGisSemantics || null, units: window.IntMapGisUnits || null, ties: (ref) => G.tiesOf(K.HOST.DB, ref) }) : null;
      const dupes = I.findings.filter((f) => f.alsoFoundBy.length).map((f) => ({ claim: f.claim, tasks: [f.task].concat(f.alsoFoundBy) }));
      const differ = I.placeOverlaps.filter((p) => p.numbersDiffer);
      const integrated = {
        coverage: I.coverage, cost: I.cost, gaps: I.gaps, unreturned: I.unreturned,
        placeOverlaps: I.placeOverlaps.map((p) => ({ place: p.place, tasks: p.tasks, numbersDiffer: p.numbersDiffer })),
        duplicateFindings: dupes,
        facts: F ? { objects: F.objects, counts: F.counts, unresolved: F.unresolved } : undefined,
        sources: I.sources.map((x) => ({ url: x.url, title: x.title, citedBy: x.citedBy })),
        verification: verification || undefined,
      };
      const label = (r, i) => String((tasks[i] && (tasks[i].goal || tasks[i].capability)) || r.id).slice(0, 120);
      const rows = results.map((r, i) => '<li style="margin:2px 0;"><b>' + esc(label(r, i)) + '</b> — ' + esc(stateWord(r.state))
        + (r.code ? ' (' + esc(r.code) + ')' : '') + (r.resumed ? ' · ' + esc(L('from the earlier run, not run again', '前回の実行の結果・再実行なし')) : '') + (r.sources.length ? ' · ' + esc(L(r.sources.length + ' source(s)', '出典 ' + r.sources.length + ' 件')) : '') + '</li>').join('');
      const notes = [];
      if (dupes.length) notes.push(L(dupes.length + ' finding(s) were found by more than one worker', dupes.length + ' 件の所見が複数の子で一致しました'));
      if (F && F.counts.conflict) notes.push(L(F.counts.conflict + ' stated value(s) conflict between workers (integrated.facts, with the source of each)', '子どうしで述べられた値が ' + F.counts.conflict + ' 件食い違っています（integrated.facts に根拠つき）'));
      if (F) { const nd = F.objects.reduce((n, o) => n + o.attributes.filter((a) => a.comparability && a.comparability.differing.length).length, 0); if (nd) notes.push(L(nd + ' compared row(s) differ in what they measure (scope, borders, period, unit or aggregation): see comparability before calling it a disagreement', nd + ' 件は測っているものが違います（範囲・境界・期間・単位・集計）。食い違いと呼ぶ前に comparability を確認してください')); }
      if (differ.length) notes.push(L('Figures differ between workers at: ', '子どうしで数値が異なる地点: ') + differ.map((p) => p.place).slice(0, 6).join(', '));
      if (I.unreturned.length) notes.push(L('Did not return: ', '結果が戻らなかった仕事: ') + I.unreturned.map((u) => u.task + ' (' + stateWord(u.state) + (u.code ? ', ' + u.code : '') + ')').slice(0, 8).join(', '));
      if (verification) { const c = verification.counts; notes.push(L('Checked by a second worker: ' + c.supported + ' supported, ' + c.contradicted + ' contradicted, ' + c.unsupported + ' unsupported, ' + c.unchecked + ' not checked', '別の子による検証: 支持 ' + c.supported + ' / 反証 ' + c.contradicted + ' / 根拠なし ' + c.unsupported + ' / 未検証 ' + c.unchecked)); }
      const totalUsd = I.cost.usd + (verification ? verification.costUsd : 0), totalCalls = I.cost.calls + (verification ? verification.calls : 0);
      if (totalUsd > 0) notes.push(L('Worker cost ', '子の費用 ') + usd(totalUsd) + ' · ' + totalCalls + L(' request(s)', ' 回'));
      const noteHtml = notes.length ? '<div style="margin-top:4px;opacity:.7;">' + notes.map((n) => '<div>' + esc(n) + '</div>').join('') + '</div>' : '';
      const html = '<div class="atl-deleg" style="font-size:12px;line-height:1.5;"><div style="font-weight:600;margin-bottom:2px;">'
        + esc(L('Researched in parallel', '並行して調査')) + ' — ' + esc(L(done + ' of ' + results.length + ' returned findings', results.length + ' 件中 ' + done + ' 件が結果を返しました')) + '</div><ul style="margin:2px 0 0 16px;padding:0;">' + rows + '</ul>' + noteHtml + '</div>';
      return R(done > 0, html, { meta: {
        status: done === results.length ? 'completed' : (done ? 'partial' : 'failed'),
        code: done === results.length ? undefined : (done ? 'some_tasks_ended_otherwise' : (results[0] && results[0].code) || 'no_findings'),
        produced: done ? ['explanation'] : undefined,
        delegated: results.map((r) => ({ id: r.id, state: r.state, code: r.code, detail: r.detail, reused: r.reused || undefined, resumed: r.resumed || undefined, summary: r.summary, findings: r.findings, gaps: r.gaps, sources: r.sources, data: r.data, costUsd: r.costUsd, calls: r.calls, ms: r.ms })),
        delegatedCostUsd: cost,
        integrated,
        /* (delegate-child-loop) what was answered from the last run of the same list, and whether this run's record was kept */
        resume: store ? { key: dKey, resumed: results.filter((r) => r.resumed).length, from: prior ? prior.at : undefined, saved: saves > 0 } : undefined,
      } });
    },
  },
  {
    /* ══ (atlas-longform) A LONG DOCUMENT, WRITTEN CHAPTER BY CHAPTER, KEPT AS IT GOES, JOINED AT THE END ══════
       One answer is bounded (a task's output ceiling) and one tool call is bounded (the loop's tool clock); a long
       report or a long source file meets both. js/atlas-longform.js writes each section as its own call with the
       outline and the end of the previous section in front of it, saves each the moment it exists, continues a
       section the model cut off, and stops writing before the tool clock — `remaining` says how many are left, and
       asking again with the SAME outline resumes: finished sections are not written again (said, not re-run).
       The assembled document is SHOWN TO THE READER by this card; Atlas does not write it out again. */
    policy: { delegates: true },   /* (capability-facets) starts other model work */
    row: ['research.longform',          'longform',       'writeLongReport,longDocument,writeInChapters',                'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-21' },
    phrases: () => ['長い報告書', '章ごとに書く', '長文のレポート', '詳細な報告書', '長いコード'].concat(['long report', 'write in chapters', 'long document', 'section by section', 'full report']),
    doc: [
      { in: 'research.analyze', at: 32, text: 'WRITE A LONG DOCUMENT CHAPTER BY CHAPTER (a report, a chaptered text or a long source file that one answer cannot hold): {"type":"longform","title"?:str,"brief"?:str (what the document is for, who reads it, the facts and sources every chapter must keep to),"format"?:"prose"|"code","sections":[{"id"?:str,"title":str,"goal":str (what this chapter must contain),"words"?:int}]} — 章ごとに書く・長い報告書 — writes each section as its own request with the outline and the end of the previous section in front of it, SAVES each section as it is written, continues a section that was cut off by the length limit, and joins them into one document that is SHOWN TO THE READER by this tool (do not write it out again — say what it covers). It stops before the tool clock: when "remaining" is above 0, call it AGAIN with the SAME outline — finished sections are answered from the saved copy, not written again, and only the rest is written. Plan the outline first (the sections are yours to choose), keep each goal specific, and put sources and figures the chapters must share in "brief". It is a writer, not a researcher: gather facts first (research.delegate / research.analyze), then hand them over in "brief".\n' },
    ],
    schema: () => ({ type: 'object', required: ['sections'], properties: { title: str(), brief: str(), format: one('prose', 'code'), sections: list({ type: 'object', required: ['title', 'goal'], properties: { id: str(), title: str(), goal: str(), words: int() } }, 1) } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const plan = planOutline(a);
      if (!plan.ok) return R(false, warn(L('The outline could not be used: ', 'アウトラインを使えません: ') + esc(plan.why)), { meta: { status: 'failed', code: 'bad_outline' } });
      if (typeof K.askAIJSONEnvelope !== 'function') return R(false, warn(L('The model is not available here.', 'ここではモデルを使えません。')), { meta: { status: 'failed', code: 'no_model' } });
      const turn = String(K._curTurnKey || '');
      const signal = (typeof K.turnSignal === 'function') ? K.turnSignal() : undefined;
      let ls = null; try { ls = window.localStorage; } catch (_) { ls = null; }
      /* the time budget is UNDER the loop's tool clock (js/atlas-agent.js toolTimeoutMs = 240 s; one section measured at roughly 40-70 s): 150 s leaves a section in flight room to finish. Expires with: a change to either number */
      const out = await runLongform({ plan, store: storageStore(ls), signal, budgetMs: 150000,
        ask: (prompt, system, img, o) => K.askAIJSONEnvelope(prompt, system, img, Object.assign({}, o, turn ? { turnId: turn } : {})) });
      const doc = assemble(plan, out.chapters);
      const n = out.chapters.length, written = out.chapters.filter((c) => c.text).length;
      const cut = out.chapters.filter((c) => c.state === 'cut').map((c) => c.title);
      const word = (c) => (c.state === 'done' ? (c.resumed ? L('kept from the earlier run, not written again', '前回の分を保存済み・再執筆なし') : L('written', '執筆済み')) + ' · ' + c.chars
        : c.state === 'cut' ? L('written, still cut by the length limit', '執筆済み・長さの上限でまだ途中')
        : c.state === 'failed' ? L('failed', '失敗') + (c.code ? ' (' + c.code + ')' : '') : L('not yet written', '未執筆'));
      const rows = out.chapters.map((c) => '<li style="margin:2px 0;"><b>' + esc(c.title) + '</b> — ' + esc(word(c)) + '</li>').join('');
      const body = plan.format === 'code' ? '<pre style="white-space:pre-wrap;font-size:12px;">' + esc(doc) + '</pre>' : '<div class="atl-md">' + K.mdMini(doc) + '</div>';
      const html = '<div class="atl-longform" style="font-size:12px;line-height:1.5;"><div style="font-weight:600;margin-bottom:2px;">' + esc(plan.title || L('Document', '文書')) + ' — '
        + esc(L(written + ' of ' + n + ' sections written', n + ' 章中 ' + written + ' 章を執筆')) + '</div><ul style="margin:2px 0 6px 16px;padding:0;">' + rows + '</ul>'
        + (out.remaining ? '<div style="opacity:.8;margin-bottom:6px;">' + esc(L(out.remaining + ' section(s) remain: ask again with the same outline to continue; the finished ones are kept.', '残り ' + out.remaining + ' 章: 同じアウトラインでもう一度呼ぶと続きから書きます（書いた章は保存済み）。')) + '</div>' : '')
        + (doc ? '<details' + (out.state === 'done' ? ' open' : '') + '><summary>' + esc(L('The document', '本文')) + '</summary>' + body + '</details>' : '') + '</div>';
      return R(written > 0, html, { meta: {
        status: out.state === 'done' && !cut.length ? 'completed' : (written ? 'partial' : 'failed'),
        code: out.state === 'done' ? (cut.length ? 'section_cut' : undefined) : (written ? 'sections_remaining' : (out.code || 'no_sections')),
        produced: written ? ['explanation'] : undefined,
        longform: { key: out.key, sections: n, written, remaining: out.remaining, resumed: out.resumed, cut, chars: doc.length, costUsd: out.costUsd, outline: plan.sections.map((s) => s.title) },
      } });
    },
  },
  {
    row: ['research.search',            'researchSearch', 'investigate,searchNews,searchSources',                                'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-24' },
    phrases: () => ['調べ直す', '別の言葉で検索', '原文で調べる', '一次資料', '裏を取る'].concat(['search again', 'in the original language', 'primary source', 'cross-check', 'investigate']),
    doc: [
      { in: 'research.analyze', at: 31, text: 'AN INVESTIGATION THAT YOU STEER: {"type":"researchSearch","queries":[{"q":str,"lang"?:"uk"|"ru"|"pl"|… (the language the SOURCES write in — a BCP-47 tag),"country"?:"UA"|"PL"|… (ISO 3166-1 alpha-2: the country whose press to read),"site"?:"president.gov.ua" (ONE outlet or an official/primary source),"engine"?:"gdelt"|"gnews"|"both","timespan"?:"72h"|"7d"|"3m"}, …],"gap"?:str,"contradiction"?:str,"changed"?:str} — 調べる・検索し直す・原文/一次資料で裏を取る. Searches SEVERAL queries AT THE SAME TIME, each in the language, country and outlet you name, and returns documents (headline, outlet, date, URL) — it does NOT write an answer; you read what came back, decide what is missing or contradicted, and search again DIFFERENTLY: other words, the sources\' OWN language (Ukrainian, Russian, Polish, … for a story from there, not only English), a primary source via "site", another engine. HOW MANY rounds, WHICH languages, WHEN to stop are yours — nothing here counts or caps them. Say what you are doing in "gap" (what is still missing), "contradiction" (what disagrees) and "changed" (what you now search differently); they are kept with the round and returned, and what is NEW in method (words, languages, sites, engines) is computed from your queries. A query already run this turn is answered "alreadyRun" with no new fetch, and a document found twice is listed once — repeat a search only after a real failure. Each query\'s state is ok / empty (a source answered and had none) / unavailable (no source answered — that is NOT proof nothing was published). A result is a headline, never a verified fact: read the primary source, and use research.delegate for pieces that need reading in parallel.\n' },
    ],
    schema: () => ({ type: 'object', properties: { queries: list({ type: 'object', required: ['q'], properties: { q: str(), lang: str(), country: str(), site: str(), engine: one('both', 'gdelt', 'gnews'), timespan: str() } }, 1), gap: str(), contradiction: str(), changed: str(), budgetMs: num(0) }, required: ['queries'] }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      if (!researchMemory.search) researchMemory.search = makeResearchSearch({ gdelt: (...x) => K._gdeltNews(...x), gnews: (...x) => K._gnewsNews(...x) });
      const out = await researchMemory.search.run(a, K._curTurnKey);
      if (!out.ok) return R(false, warn(esc(L(out.message, '検索語を queries:[{q,…}] で指定してください。'))), { meta: { status: 'failed', code: out.code } });
      const got = out.documents.length, st = out.totals.states;
      const html = '<div style="font-size:12px;line-height:1.5;"><div style="font-weight:600;">' + esc(L('Investigation search', '調査の検索')) + ' — ' + esc(L(out.queries.length + ' quer' + (out.queries.length === 1 ? 'y' : 'ies') + ', ' + got + ' new document(s)', out.queries.length + ' 件の検索で新しい記事 ' + got + ' 件')) + '</div>'
        + '<ul style="margin:2px 0 0 16px;padding:0;">' + out.queries.map((q) => '<li>' + esc(q.q) + (q.lang ? ' [' + esc(q.lang) + (q.country ? '/' + esc(q.country) : '') + ']' : '') + (q.site ? ' @' + esc(q.site) : '') + ' — ' + esc(q.alreadyRun ? L('already run', '実行済み') : q.state === 'rejected' ? q.error : (q.state + ' · ' + q.found)) + '</li>').join('') + '</ul>'
        + (st.unavailable ? '<div style="opacity:.7;">' + esc(L(st.unavailable + ' search(es) could not reach a source — not proof that nothing was published.', st.unavailable + ' 件は取得先に届きませんでした。報道が無かったという意味ではありません。')) + '</div>' : '') + '</div>';
      const okAny = out.queries.some((q) => q.state === 'ok' || q.alreadyRun && q.state === 'ok');
      return R(okAny || out.queries.every((q) => q.state === 'empty' || q.alreadyRun), html, { meta: {
        status: okAny ? 'completed' : (st.unavailable && !st.empty ? 'failed' : 'partial'),
        code: okAny ? undefined : (st.unavailable && !st.empty ? 'sources_unavailable' : 'no_documents'),
        produced: ['explanation'],
        research: { round: out.round, queries: out.queries, documents: out.documents, alreadySeen: out.alreadySeen, delta: out.delta, investigation: out.investigation, totals: out.totals, reading: out.reading },
      } });
    },
  },
];
