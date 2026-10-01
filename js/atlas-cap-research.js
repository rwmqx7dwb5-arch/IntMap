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
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, num, int, one, list, lat, lng } from './atlas-caps.js';
import { personaPrompt } from './atlas-persona.js';
import { settleWithin, lateNote } from './atlas-deadlines.js';
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';

export default [
  {
    row: ['research.brief',             'brief',          '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'place?',   '', 'external'],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat() } }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, GE = K.GE, _setLast = K._setLast, _langLine = K._langLine, _newsData = K._newsData, WEB_BUDGET_MS = K.WEB_BUDGET_MS, _gdeltNews = K._gdeltNews, _gnewsNews = K._gnewsNews, askAIJSONEnvelope = K.askAIJSONEnvelope, L = K.L, linkCards = K.linkCards, dropLeadTitle = K.dropLeadTitle, mdMini = K.mdMini;
      { /* (#R62) AI Brief is INTEGRATED into Atlas — same structured brief, rendered inline in this chat. */
          const ll=(a.lng!=null&&a.lat!=null)?{lng:+a.lng,lat:+a.lat,name:String(a.place||'')}:await geocode(a.place);
          const nm3=(ll&&ll.name)||String(a.place||'').trim(); if(!nm3) return R(false, warn('⚠ '+esc(a.place||'')));
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
          let txtB='', _envB=null; try{ _envB=await askAIJSONEnvelope(pB,sysB,null,{task:'brief',webMode:'required',turnId:K._curTurnKey}); txtB=(_envB&&_envB.text)||''; }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          if(!String(txtB||'').trim()) return R(false, warn('⚠ '+L('The brief came back empty','ブリーフが空でした','Bericht kam leer zurück','Пустой ответ','El informe volvió vacío')));
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
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), question: str(), query: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, GE = K.GE, dispatch = K.dispatch, note = K.note, L = K.L;
      { /* (#R83) absorbed into Atlas — pin the point HERE so the ongoing conversation resolves
            "here/there" to it; if a concrete question came with it, answer it straight away via analyze. */
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place);
          if(!ll) return R(false, warn('⚠ '+esc(a.place||'')));
          K._herePoint={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; try{ K._lastPlace={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; }catch(_){}
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),5),duration:900}); }catch(_){}
          const qq=String(a.question||a.query||'').trim();
          if(qq) return await dispatch({type:'analyze',question:qq,place:'there'});
          return R(true, note(esc(ll.name||(ll.lat.toFixed(3)+', '+ll.lng.toFixed(3)))+' — '+L('ask me anything about this spot','この地点について何でも聞いてください','fragen Sie mich alles zu diesem Ort','спросите что угодно об этом месте','pregúntame lo que sea sobre este lugar'))); }
    },
  },
  {
    row: ['research.mapReport',         'mapReport',      'newsMap,reportMap',                                           'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { topic: str(), question: str(), query: str(), place: str(), count: int(1) }, anyOf: [{ required: ['topic'] }, { required: ['question'] }, { required: ['query'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, WORLD_RE = K.WORLD_RE, placeExtent = K.placeExtent, geocode = K.geocode, _langLine = K._langLine, _gdeltNews = K._gdeltNews, _gnewsNews = K._gnewsNews, _newsData = K._newsData, _lnorm = K._lnorm, aiParseJSON = K.aiParseJSON, askAI = K.askAI, esc = K.esc, GLEDGER = K.GLEDGER, _poiAdd = K._poiAdd, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, _atlCleanUrl = K._atlCleanUrl, linkCards = K.linkCards, note = K.note, _PINNED = K._PINNED;
      { /* (#R72) research mapped ONTO the map ("地図上にまとめて" /
          "銃犯罪を調べて→地図上にマッピングし、そこから簡易的な説明やニュース記事にアクセス"): live web/news evidence
          → AI geolocates the concrete events/places → pins with an AI summary + article link in each popup. */
          const topic=String(a.topic||a.question||a.query||'').trim();
          if(!topic) return R(false, warn('⚠ '+L('What should I map?','何を地図にまとめますか？','Was soll kartiert werden?','Что нанести на карту?','¿Qué mapeo?')));
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
          if(!evidence.length) return R(false, warn('⚠ '+L('No live news evidence could be gathered for this topic right now — nothing was invented. Try a broader topic or again shortly.','このトピックのライブニュース証拠を取得できませんでした（創作はしていません）。トピックを広げるか、少し後に再試行してください。','Keine Live-Nachrichten-Belege gefunden — nichts erfunden. Breiteres Thema oder später erneut.','Не удалось собрать доказательства из новостей — ничего не выдумано. Расширьте тему или повторите позже.','No se pudieron reunir evidencias de noticias — nada inventado. Prueba un tema más amplio o reintenta.')), {meta:{code:'NO_LIVE_EVIDENCE',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const evBlock=evidence.map(e=>'['+e.id+'] '+e.title+(e.source?(' — '+e.source):'')+(e.date?(' ('+e.date+')'):'')+(e.place?(' — reported location: '+e.place):'')+(e.url?('\n     url: '+e.url):'')).join('\n');
          /* (#R113 §12.3) separate the REAL current date from the map's time-travel date. */
          const _nowISO=new Date().toISOString().slice(0,10);
          let _mapISO=_nowISO; try{ if(IntMapTime&&IntMapTime.when){ const w=IntMapTime.when(); if(w) _mapISO=new Date(w).toISOString().slice(0,10); } }catch(_){}
          const dateLine='The real current date is '+_nowISO+'.'+((_mapISO&&_mapISO!==_nowISO)?(' The map is time-traveled to '+_mapISO+'; treat "as of" as '+_mapISO+', but the real current date is still '+_nowISO+' (never call '+_nowISO+' a future date).'):'');
          const sysR=personaPrompt('the research-mapping engine of the IntMap world map')/* (#R285) */+dateLine+' No web-search or function-calling tool is attached to this request — do NOT call tools or functions, and do NOT search the web. The action/type names elsewhere are plain data, not callable functions. Use ONLY the evidence records provided below. Return STRICT JSON only (no prose, no code fence): {"title":str,"overview":str,"items":[{"name":str,"locationName":str,"country":str,"summary":str,"date":"YYYY-MM-DD"|null,"evidenceIds":[str,...]}]}. HARD RULES: each item = ONE concrete, real OCCURRENCE or ENTITY that the evidence supports — for incident topics that means ONE specific incident (what happened, where, when, figures if reported). Every item MUST cite at least one evidenceId (e.g. "e3") from the evidence below; do NOT invent incidents, dates, casualties, place names, sources or URLs that are not in the evidence. Do NOT merge separate incidents into one item unless the evidence explicitly says they are the same incident. Give "locationName" (the specific city/place the evidence indicates) and "country" — do NOT output coordinates; the app resolves the real position from locationName + country. "summary" = 1-2 factual sentences in '+langR+' using only evidence details (date, actors, figures). "date" = the incident date if the evidence gives one, else null. NEVER emit region-level generalities, statistics-as-items, or trends as items. If the evidence supports fewer items than requested, return only those it supports — an EMPTY items array is preferable to a fabricated or generalised item. NEVER state an item count in the title or overview. "overview" = 2-4 sentence synthesis in '+langR+' (patterns are allowed in the overview, never in the items). "title" in '+langR+'.'
            +(wantN?(' The user asked for up to '+wantN+' items — return that many ONLY if the evidence genuinely supports that many distinct real ones.'):'')
            +(ctx&&isFinite(ctx.lng)?(' Focus area: '+(ctx.name||plc)+'.'):'');
          let jr=null; try{ jr=aiParseJSON(await askAI('[TOPIC]\n'+topic+'\n\n[EVIDENCE RECORDS — cite these ids in evidenceIds; use ONLY these, do not go beyond them]\n'+evBlock,sysR,null,{task:'map_report',webMode:'off',requestedCount:(wantN||undefined)})); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
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
          if(!items.length) return R(false, warn('⚠ '+L('The evidence did not support any concrete mappable items — nothing was invented','証拠から具体的にマッピングできる項目は得られませんでした（創作はしていません）','Die Belege ergaben keine konkreten kartierbaren Einträge — nichts erfunden','Доказательства не дали конкретных объектов для карты — ничего не выдумано','La evidencia no dio elementos mapeables concretos — nada inventado')), {meta:{code:'NO_MAPPABLE_ITEMS',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
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
            +'<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">📌 '+K._pois.length+' '+L('points mapped — click a pin (or an item below) for the summary & article','地点をマッピングしました — ピンまたは下の項目をクリックすると要約と記事を開けます','Punkte kartiert — Pin anklicken für Zusammenfassung & Artikel','точек на карте — клик по метке открывает сводку и статью','puntos mapeados — clic en un pin para el resumen y artículo')+'</div>'
            +((wantN&&items.length<wantN)?('<div style="font-size:11px;color:#ff9f0a;font-weight:600;margin:2px 0 4px;">⚠ '+L('You asked for '+wantN+' — the gathered evidence only supported '+items.length+' real item(s); nothing was padded with generalities','要求は'+wantN+'件でしたが、収集した証拠で裏付けられたのは'+items.length+'件のみです（一般論での水増しはしていません）','Angefragt: '+wantN+' — die Belege stützten nur '+items.length+' echte(n) Eintrag/Einträge','Запрошено '+wantN+' — доказательства подтвердили только '+items.length+' реальн.','Pediste '+wantN+' — la evidencia solo respaldó '+items.length+' elemento(s) reales')+'</div>'):'')
            +(unmappable?('<div style="font-size:10.5px;color:var(--text-muted);margin:1px 0 3px;">'+L(unmappable+' item(s) had no verifiable location and are listed without a pin.',unmappable+'件は位置を確認できず、ピンなしで一覧のみ表示しています。',unmappable+' Eintrag/Einträge ohne bestätigten Ort — nur gelistet.',unmappable+' без подтверждённого места — только в списке.',unmappable+' sin ubicación verificable — solo en la lista.')+'</div>'):'')
            +listHtml2
            +linkCards(items.filter(p=>p.url).map(p=>({url:p.url,title:p.name,src:p.src})))   /* (#R74) article cards (ChatGPT-style) */
            +note(L('Mapped from IntMap-gathered news evidence (GDELT + Google News + loaded news); positions are city-level — verify important facts.','IntMapが収集したニュース証拠（GDELT＋Google News＋読み込み済みニュース）に基づきます。位置は都市レベルの精度です — 重要な事実は確認してください。','Aus von IntMap gesammelten Nachrichtenbelegen (GDELT + Google News + geladene News); Positionen auf Stadtebene — wichtige Fakten prüfen.','На основе собранных IntMap новостных доказательств (GDELT + Google News + загруженные новости); позиции с точностью до города — проверяйте факты.','A partir de evidencias de noticias reunidas por IntMap (GDELT + Google News + noticias cargadas); posiciones a nivel de ciudad — verifica los datos.')), _PINNED({meta:{code:'OK',category:'ok',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:['explanation','map'],userGoalSatisfied:true}},okR)); }   /* (#R802) …and the pins it placed, so a second pass over the same subject reads as `already_there` rather than `not_rendered` */
    },
  },
  {
    row: ['research.situationMap',      'researchMap',    'research_map,situationMap',                                   'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
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
          if(!topic&&!place) return R(false, warn('⚠ '+L('What should I research and map?','何を調べて地図に示しますか？','Was recherchieren & kartieren?','Что исследовать и нанести на карту?','¿Qué investigo y mapeo?')), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,userGoalSatisfied:false,produced:[]}});
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
            if(mapRes.rendered) return R(true, note('🗺 '+esc(mapRes.name)+' — '+L('shown on the map. I could not compile a written summary this time — try rephrasing the question.','を地図に表示しました。今回は文章の要約を作成できませんでした。質問を言い換えてお試しください。','auf der Karte gezeigt. Konnte diesmal keine Textzusammenfassung erstellen.','показано на карте. На этот раз не удалось составить текстовую сводку.','mostrado en el mapa. No pude redactar un resumen esta vez.')), _PINNED({meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:['map'],userGoalSatisfied:false}},mapRes.pinsDrawn));
            return R(false, warn('⚠ '+esc(research.error||L('Could not research this right now','今回は調べられませんでした','Konnte das gerade nicht recherchieren','Не удалось исследовать сейчас','No se pudo investigar ahora'))), {meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:[],userGoalSatisfied:false}});
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
            h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">🗺 '+esc(ml)+((!mapRes.hasExtent&&mapRes.pinCount)?(' · '+L('the region outline was not available, so related places are shown as points','海域・地域の輪郭は取得できなかったため関連地点を表示','Regionsumriss nicht verfügbar — Punkte stattdessen','контур недоступен — показаны точки','sin contorno — se muestran puntos')):'')+'</div>'; }
          else h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">🗺 '+L('The map view could not be updated for this, but the explanation above stands.','この件では地図表示を更新できませんでしたが、上の説明は有効です。','Kartenansicht nicht aktualisierbar — die Erklärung oben gilt.','Не удалось обновить карту — пояснение выше остаётся в силе.','No se pudo actualizar el mapa, pero la explicación anterior es válida.')+'</div>';
          if(research.items&&research.items.length){ h+='<div style="font-size:11.5px;color:var(--text-muted);margin:5px 0 2px;font-weight:600;">'+L('Related places','関連地点','Zugehörige Orte','Связанные места','Lugares relacionados')+'</div>';
            h+=research.items.map((it,i)=>{ const mi=(mapRes.pinIdx&&mapRes.pinIdx[i]!=null)?mapRes.pinIdx[i]:-1; return '<div class="atl-rp-item"'+(mi>=0?(' data-i="'+mi+'"'):'')+' style="display:flex;gap:7px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.12);'+(mi>=0?'cursor:pointer;':'')+'"><span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:'+((mi>=0)?(K._poiColor||'#ff453a'):'rgba(128,128,128,0.5)')+';position:relative;top:-1px;"></span><span style="flex:1;min-width:0;"><span style="font-weight:600;font-size:12px;">'+esc(it.name)+'</span>'+(it.dateOrPeriod?' <span style="font-size:10px;color:var(--text-muted);">'+esc(it.dateOrPeriod)+'</span>':'')+(it.summary?'<br><span style="font-size:11px;line-height:1.5;opacity:0.9;">'+esc(it.summary)+'</span>':'')+'</span></div>'; }).join(''); }
          if(research.limitations&&research.limitations.length) h+=note(L('Note','注記','Hinweis','Примечание','Nota')+': '+esc(research.limitations.join(' · ')));
          h+=note(mode==='historical'?L('Historical overview from established sources — borders and figures are approximate.','歴史的知見に基づく概説です。国境や数値は概略です。','Historischer Überblick aus etablierten Quellen — Grenzen/Zahlen näherungsweise.','Исторический обзор по установленным источникам — границы и цифры приблизительны.','Panorama histórico de fuentes establecidas — fronteras y cifras aproximadas.'):(mode==='mixed'?L('Combines a historical overview with current live-news evidence.','歴史的概説と現在のライブニュース証拠を組み合わせています。','Kombiniert historischen Überblick mit aktuellen Live-Nachrichten.','Сочетает исторический обзор с текущими новостями.','Combina un panorama histórico con noticias en vivo actuales.'):L('Compiled from current live-news evidence IntMap gathered.','IntMapが収集した現在のライブニュース証拠に基づきます。','Aus aktuellen Live-Nachrichten von IntMap.','На основе собранных IntMap текущих новостей.','A partir de noticias en vivo reunidas por IntMap.')));
          return R(true, h, _PINNED({meta:{code:'OK',category:'ok',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:(mapRes.rendered?['explanation','map']:['explanation']),userGoalSatisfied:true,geographicRelevance:(mapRes.rendered?1:0.5),temporalMatch:true}},mapRes.pinsDrawn)); }   /* ⚠ (#R802) THE SIX-TIMES CASE. Measured on production 2026-09-17, 「1914年のヨーロッパの国境…」: this line returned `ok` and `not_rendered` ALTERNATELY for one subject, because a repin of the same places moves no feature count. The pins now name themselves. */
    },
  },
  {
    row: ['research.historicalMap',     'historicalMap',  'historical,powerMap,allianceMap',                             'research','factions','map.factions',           'map,explanation',     'session', 'none',   '',         ''],
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
          if(!jr||!Array.isArray(jr.factions)||!jr.factions.length) return R(false, warn('⚠ '+L('Could not build that historical map — try naming the war/year more specifically','その歴史地図を作成できませんでした。戦争名や年をより具体的に指定してください','Konnte diese historische Karte nicht erstellen','Не удалось построить эту историческую карту','No se pudo construir ese mapa histórico')));
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
    /* ⚠ AND THE OTHER ONE THIS ROUND IS NAMED AFTER: 「何を分析しますか？」 was reached by a plan
       that had already been accepted. Every caller in this repo spells it `question`. */
    /* ⚠ `temporalMode` IS ATLAS'S, AND IT IS WHY IT IS DECLARED HERE. The analyze case used to
       derive it by running _requestProfile(q) — a regular expression over the reader's sentence,
       which #R406 removed. The dispatch now reads it off the call, so whether a question is about
       now or about the past is a judgement Atlas states rather than one a pattern guesses. */
    schema: () => ({ type: 'object', properties: { question: str(), query: str(), text: str(), place: str(), countries: list(str()), country: str(), use: list(str()), scope: str(), temporalMode: one('current', 'historical', 'mixed', 'unspecified'), requestedOutputs: list(str()) }, required: ['question'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, ensureData = K.ensureData, WORLD_RE = K.WORLD_RE, placeExtent = K.placeExtent, geocode = K.geocode, resolveCountry = K.resolveCountry, codeAtPoint = K.codeAtPoint, OFFICE_RE = K.OFFICE_RE, countryStats = K.countryStats, HOST = K.HOST, fetchData = K.fetchData, _newsData = K._newsData, _gnewsNews = K._gnewsNews, WEB_BUDGET_MS = K.WEB_BUDGET_MS, _gdeltNews = K._gdeltNews, _wikiSummary = K._wikiSummary, _weatherData = K._weatherData, _airData = K._airData, _sstData = K._sstData, _elevData = K._elevData, _leaderData = K._leaderData, _quakeData = K._quakeData, _statsData = K._statsData, GATHER_BUDGET_MS = K.GATHER_BUDGET_MS, _nowContext = K._nowContext, _analyzeFreshness = K._analyzeFreshness, nm = K.nm, _analyzeHeaderBlock = K._analyzeHeaderBlock, _analyzeEvidence = K._analyzeEvidence, POLICY = K.POLICY, _evidenceBlock = K._evidenceBlock, _newsLbl = K._newsLbl, ANOM = K.ANOM, stateContext = K.stateContext, _langLine = K._langLine, _analysisSystemPrompt = K._analysisSystemPrompt, runStructuredAnswer = K.runStructuredAnswer, _statsFacts = K._statsFacts, askAIJSONEnvelope = K.askAIJSONEnvelope, aiParseJSON = K.aiParseJSON, esc = K.esc, renderAnswer = K.renderAnswer, mdMini = K.mdMini, linkCards = K.linkCards, _pinReplyPlaces = K._pinReplyPlaces, answerPlainText = K.answerPlainText, citedRecords = K.citedRecords, auditMeta = K.auditMeta;
      { const q=String(a.question||a.query||a.text||'').trim();
          if(!q) return R(false, warn('⚠ '+L('What should I analyze?','何を分析しますか？','Was soll analysiert werden?','Что проанализировать?','¿Qué analizo?')));
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
                try{ if(window.IntMapPopArea&&typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3){ jobs.push(window.IntMapPopArea.estimate({type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]}).then(v=>{ if(v) got.areaPop=v.pop.toLocaleString()+' (WorldPop 2020, 100m grid)'; }).catch(()=>{})); } }catch(_){}
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
              appFacts:_statsFacts(codes).map(f=>Object.assign({label:L('country stats','国別統計','Länderstatistik','статистика','estadísticas')},f)), retrievedAt:nowCtx.local, answerGoal:String(q||'').slice(0,200),
              ask:(pr,sy,o)=>askAIJSONEnvelope(pr,sy,null,o), parseJSON:aiParseJSON }); }
          catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          const _env=RES.env, _reg=RES.registry;
          if(!String((_env.answer.directAnswer&&_env.answer.directAnswer.text)||'').trim()) return R(false, warn('⚠ '+L('The analysis returned no answer','分析結果が空でした','Analyse ergab keine Antwort','Анализ не дал ответа','El análisis no dio respuesta')));
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
          try{ html+=await _pinReplyPlaces(_env.places||[],{text:answerPlainText(_env),citations:_reg.all().filter(r=>r.finalUrl).map(r=>({url:r.finalUrl,title:r.title}))}); }catch(e){ try{ console.warn('analyze map audit',e); }catch(_){} }
          /* (#R131) Freshness-critical question but live web verification did NOT run: label the answer a PROVISIONAL
             assessment built mainly on already-gathered headlines, so headline-only leads are never presented as
             confirmed direct evidence (the Central-Asia failure). Applies equally when the web search timed out into
             the tool-free fallback (webUsed stays false). */
          if(freshness.critical&&!RES.webUsed) html+='<div style="margin-top:8px;padding:7px 10px;border:1px solid var(--warn-color,#c98a00);border-radius:8px;background:rgba(201,138,0,.09);font-size:11px;line-height:1.5;color:var(--text-main);">⚠ '+L(
            'Live web verification did not complete for this time-sensitive question, so this is a PROVISIONAL assessment based mainly on already-gathered headlines — treat items as leads, not confirmed direct evidence.',
            '時間依存の質問に対しライブWeb検証を完了できなかったため、これは取得済みの見出しを中心とした暫定評価です。各項目は確認済みの直接的証拠ではなく手がかりとして扱ってください。',
            'Die Live-Web-Verifizierung wurde für diese zeitkritische Frage nicht abgeschlossen — dies ist eine VORLÄUFIGE Einschätzung, überwiegend auf bereits gesammelten Schlagzeilen; als Hinweise, nicht als bestätigte Belege behandeln.',
            'Проверка в реальном времени по этому чувствительному ко времени вопросу не завершилась — это ПРЕДВАРИТЕЛЬНАЯ оценка, в основном по уже собранным заголовкам; считайте их зацепками, а не подтверждёнными доказательствами.',
            'No se completó la verificación web en vivo para esta pregunta sensible al tiempo, por lo que es una evaluación PROVISIONAL basada sobre todo en titulares ya recopilados; trátalos como indicios, no como evidencia directa confirmada.')+'</div>';
          const usedAll=[]; citedRecords(_env,_reg).forEach(r=>{ if(r.label&&usedAll.indexOf(r.label)<0) usedAll.push(r.label); });   /* (#732) what the rendered claims CITE (js/atlas-answer-render.js citedRecords) — not every block that was put in the prompt */
          if(RES.webUsed) usedAll.push(L('live web verification','ライブWeb検証','Live-Web-Verifizierung','проверка в интернете','verificación web en vivo'));
          if(usedAll.length) html+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">'+L('Data used','使用データ','Verwendete Daten','Данные','Datos usados')+': '+usedAll.join(', ')+'</div>';   /* (#R118) no data → NO empty "Data used:" line */
          const _am=auditMeta(_env); return _am?R(true,html,{meta:_am}):R(true,html); }   /* ⚠ (#R419/#R472) THE ANSWER IS RENDERED IN FULL AND ATLAS IS TOLD WHAT THE AUDIT NOTICED — codes, not a verdict, and never a claim that something was removed (nothing is). auditMeta() in js/atlas-answer-pipeline.js. */
    },
  },
  {
    row: ['research.impact',            'impact',         'impactAnalysis,nearbyCritical',                               'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   '', 'external'],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), km: num(0), event: str(), focus: list(str()) } }),
    async run(a, dctx, K) { const ensureData = K.ensureData, _fetchJSON = K._fetchJSON, R = K.R, warn = K.warn, L = K.L, _havKm = K._havKm, _setLast = K._setLast, DEIXIS_RE = K.DEIXIS_RE, placeExtent = K.placeExtent, geocode = K.geocode, esc = K.esc, overpassPOIs = K.overpassPOIs, overpassRaw = K.overpassRaw, HOST = K.HOST, _newsData = K._newsData, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, codeAtPoint = K.codeAtPoint, countryStats = K.countryStats, nm = K.nm, _PINNED = K._PINNED;
      { /* (#R75) vision §11 — WHERE an event's impact
          spreads: real critical facilities + population context + nearby quakes/news around a point, on the map. */
          await ensureData();
          const kmR=Math.max(20,Math.min(1500,(+a.km||300)));
          let ctr=null,label='',evLine='';
          const wantQuake=(String(a.event||'').toLowerCase()==='quake')||/地震|earthquake|quake/i.test(String(a.place||a.event||''));
          if(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)){ ctr={lng:+a.lng,lat:+a.lat}; label=String(a.place||'').trim()||((+a.lat).toFixed(2)+', '+(+a.lng).toFixed(2)); }
          else if(wantQuake){
            const j=await _fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
            let fs=(j&&j.features)||[]; if(!fs.length) return R(false, warn('⚠ '+L('No M2.5+ earthquakes in the last 24 h','直近24時間にM2.5以上の地震がありません','Keine Beben M2.5+ in 24 h','Нет землетрясений M2.5+ за сутки','Sin sismos M2.5+ en 24 h')));
            /* nearest to the last referenced place if we have one, else the largest of the day */
            let f=null; if(K._lastPlace&&isFinite(K._lastPlace.lng)){ let bd=1e9; fs.forEach(f2=>{ const c=f2.geometry&&f2.geometry.coordinates; if(!c) return; const d=_havKm({lng:+c[0],lat:+c[1]},K._lastPlace); if(d<bd){ bd=d; f=f2; } }); if(bd>1500) f=null; }
            if(!f) f=fs.slice().sort((x,y)=>(((y.properties&&y.properties.mag)||0)-((x.properties&&x.properties.mag)||0)))[0];
            const c=f.geometry.coordinates; ctr={lng:+c[0],lat:+c[1]}; label=(f.properties&&f.properties.place)||'earthquake';
            const hAgo=f.properties&&f.properties.time?Math.round((Date.now()-f.properties.time)/3600000):null;
            evLine='M'+(f.properties&&f.properties.mag!=null?(+f.properties.mag).toFixed(1):'?')+(c[2]!=null?(' · '+L('depth ','深さ','Tiefe ','глубина ','prof. ')+Math.round(c[2])+' km'):'')+(hAgo!=null?(' · '+hAgo+L('h ago','時間前','h zuvor','ч назад','h atrás')):'')+' · USGS';
            _setLast({lng:ctr.lng,lat:ctr.lat,name:label});
          } else {
            const p=String(a.place||'').trim(); let g=null;
            if(p&&!DEIXIS_RE.test(p)){ try{ g=await placeExtent(p); }catch(_){} if(!g){ try{ g=await geocode(p); }catch(_){} } }
            else g=await geocode(p);
            if(!g||!isFinite(+g.lng)) return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(p)));
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
            return j.elements.map(e=>({lng:+e.lon,lat:+e.lat,name:(e.tags&&(e.tags['name:'+(HOST.lang==='jp'?'ja':HOST.lang)]||e.tags.name))||'?',pop:+((e.tags&&e.tags.population)||0)})).filter(c2=>isFinite(c2.pop)&&c2.pop>0); });
          const qkP=_fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson').catch(()=>null);
          const facRes=await Promise.all(facJobs);
          let cities=await cityJob();   /* sequential — after the facility race frees the Overpass slots */
          const qk=await qkP;
          /* distance-filter, sort, annotate */
          const inR=p2=>{ const d=_havKm(p2,ctr); return d<=kmR?d:null; };
          const fac=[]; facRes.forEach(fr=>{ (fr.list||[]).forEach(p2=>{ const d=inR(p2); if(d==null) return; fac.push(Object.assign({},p2,{_d:d,_k:fr.k})); }); });
          fac.sort((x,y)=>x._d-y._d);
          if(cities){ cities=cities.map(c2=>Object.assign(c2,{_d:inR(c2)})).filter(c2=>c2._d!=null).sort((x,y)=>y.pop-x.pop).slice(0,10); }
          let qkN=[]; if(qk&&Array.isArray(qk.features)) qkN=qk.features.filter(f2=>{ const c=f2.geometry&&f2.geometry.coordinates; return c&&_havKm({lng:+c[0],lat:+c[1]},ctr)<=kmR; });
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
          let html='<div style="font-weight:600;margin:2px 0 4px;">🎯 '+esc(label)+' — '+L('impact analysis within ','影響分析（半径','Wirkungsanalyse im Umkreis ','анализ воздействия в радиусе ','análisis de impacto en ')+kmR+' km'+(IntMapLang.t(HOST.lang,'','）'))+'</div>';
          if(evLine) html+='<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:5px;">'+esc(evLine)+'</div>';
          kinds.forEach(k=>{ const list=fac.filter(p2=>p2._k===k);
            html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+esc(k)+'</b>: '+list.length+(list.length?(' — '+list.slice(0,3).map(p2=>esc(p2.name||'?')+' ('+Math.round(p2._d)+' km)').join(', ')+(list.length>3?' …':'')):' '+L('(none found in OSM within the radius)','（半径内にOSM登録なし）','(keine in OSM im Radius)','(в OSM не найдено)','(ninguno en OSM en el radio)'))+'</div>'; });
          if(cities===null) html+='<div style="font-size:11px;color:#ff9f0a;">⚠ '+L('City/population query failed (Overpass busy) — population context unavailable','都市・人口の照会に失敗しました（Overpass混雑）','Stadt-/Bevölkerungsabfrage fehlgeschlagen','Запрос городов не удался','Consulta de ciudades falló')+'</div>';
          else if(cities.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Population nearby','周辺人口','Bevölkerung','Население рядом','Población cercana')+'</b>: ≈'+popSum.toLocaleString()+' '+L('in ','（','in ','в ','en ')+cities.length+L(' cities/towns w/ OSM population tags','都市・町のOSM人口タグ合計）',' Städten (OSM-Tags)',' городах (теги OSM)',' ciudades (etiquetas OSM)')+' — '+cities.slice(0,3).map(c2=>esc(c2.name)+' '+(c2.pop>=1e6?(c2.pop/1e6).toFixed(1)+'M':Math.round(c2.pop/1000)+'k')).join(', ')+'</div>';
          else html+='<div style="font-size:11px;color:var(--text-muted);">'+L('No populated cities/towns within the radius (per OSM population tags)','半径内に人口タグ付きの都市・町はありません（OSM基準）','Keine Städte im Radius (OSM)','Городов в радиусе нет (OSM)','Sin ciudades en el radio (OSM)')+'</div>';
          if(cs) html+='<div style="font-size:11px;color:var(--text-muted);">'+esc(nm(cs))+': '+L('density ','人口密度 ','Dichte ','плотность ','densidad ')+(cs.density!=null?Math.round(cs.density).toLocaleString()+'/km²':'—')+'</div>';
          if(qkN.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Earthquakes (7 days, in radius)','地震（過去7日・半径内）','Beben (7 Tage)','Землетрясения (7 дней)','Sismos (7 días)')+'</b>: '+qkN.length+' — max M'+Math.max.apply(null,qkN.map(f2=>(f2.properties&&f2.properties.mag)||0)).toFixed(1)+'</div>';
          if(news) html+='<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">📰 '+L('Loaded news near here','周辺の読み込み済みニュース','Geladene News','Новости рядом','Noticias cercanas')+':<br>'+esc(String(news).split('\n').slice(0,3).join(' · ').slice(0,220))+'</div>';
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'+L('Sources: OpenStreetMap (facilities, city population tags — coverage varies by region), USGS (earthquakes), IntMap country statistics. Pins are clickable; the circle marks the analysis radius.','出典: OpenStreetMap（施設・都市人口タグ — 地域によって登録密度が異なります）、USGS（地震）、IntMap国別統計。ピンはクリック可能、円は分析半径です。','Quellen: OpenStreetMap, USGS, IntMap-Statistiken.','Источники: OpenStreetMap, USGS, статистика IntMap.','Fuentes: OpenStreetMap, USGS, estadísticas de IntMap.')+'</div>';
          if(!okP&&K._pois.length) html+=warn('⚠ '+L('Could not draw the markers (map still loading)','マーカーを描画できませんでした（地図読込中）','Marker nicht gezeichnet','Маркеры не отрисованы','Marcadores no dibujados'));
          return R(true, html, _PINNED(null,okP)); }   /* (#R802) the facilities and cities this analysis pinned, declared by the painter — `okP` is the same witness the sentence above prints */
    },
  },
  {
    row: ['research.events',            'events',         'newsEvents,groupNews',                                        'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   'newsEvents', 'external'],
    schema: () => ({ type: 'object', properties: { place: str(), hours: num(1), n: int(1) } }),
    async run(a, dctx, K) { const ensureData = K.ensureData, HOST = K.HOST, fetchData = K.fetchData, _agoH = K._agoH, WORLD_RE = K.WORLD_RE, DEIXIS_RE = K.DEIXIS_RE, geocode = K.geocode, placeExtent = K.placeExtent, R = K.R, warn = K.warn, L = K.L, esc = K.esc, _bboxOK = K._bboxOK, newsSubject = K.newsSubject, _havKm = K._havKm, note = K.note, groupNewsEvents = K.groupNewsEvents, clearPois = K.clearPois, paintPois = K.paintPois, GE = K.GE, _atlCleanUrl = K._atlCleanUrl, linkCards = K.linkCards, EVENT_RULES = K.EVENT_RULES, _PINNED = K._PINNED;
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
            if(!ctx) return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(plc)), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,semanticTarget:plc,produced:[],userGoalSatisfied:false}});
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
                         oldest:_agoH(e.firstAt), newest:_agoH(e.lastAt), _srcCount:e.sourceCount }; })
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
          let html='<div style="font-weight:600;margin:2px 0 4px;">🗞 '+L('Events (grouped news, last ','出来事（ニュースをイベント単位に集約・過去','Ereignisse (letzte ','События (за ','Eventos (últimas ')+hrs+'h'+(IntMapLang.t(HOST.lang,')','）'))+(ctx&&ctx.name?(' — '+esc(ctx.name)):'')+'</div>';
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
          if(!okE&&K._pois.length) html+=warn('⚠ '+L('Could not draw the pins (map still loading)','ピンを描画できませんでした（地図読込中）','Pins nicht gezeichnet','Метки не отрисованы','Pines no dibujados'));
          /* (#R340) …and the structured half of the same honesty: research.events declares produces='map,explanation',
             so the result says which of the two actually happened rather than letting the executor assume both. */
          const _evMapped=!!(okE&&K._pois.length);
          return R(true, html, _PINNED({meta:{code:'OK',category:'ok',retryable:false,produced:(_evMapped?['map','explanation']:['explanation']),userGoalSatisfied:true,partial:!_evMapped}},_evMapped)); }   /* (#R802) …and WHICH events are pinned, so re-grouping the same top events reads as `already_there` rather than `not_rendered` */
    },
  },
];
