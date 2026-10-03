/* ============================================================================
 *  IntMap · Atlas capabilities — the `news.*` namespace   (js/atlas-cap-news.js)
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
import { str, int, bool, one, noArgs } from './atlas-caps.js';

/* (news-intelligence) the windows the news pulse counts over — the facade's own (js/news-intel.js WINDOWS); a
   request between two of them takes the next one up and SAYS so, rather than quietly answering another question */
const NEWS_WINDOWS = [1, 3, 7, 14];
function newsWindowDays(a) {
  const raw = a.days != null ? String(a.days) : String(a.window || '');
  const m = /(\d+(?:\.\d+)?)\s*(h|hour|hours|時間|d|day|days|日|w|week|weeks|週)?/i.exec(raw);
  let days = 7;
  if (m) { const v = +m[1], u = (m[2] || 'd').toLowerCase(); days = /^(h|hour|hours|時間)$/.test(u) ? v / 24 : /^(w|week|weeks|週)$/.test(u) ? v * 7 : v; }
  else if (/week|週/i.test(raw)) days = 7; else if (/today|今日|24/i.test(raw)) days = 1;
  const pick = NEWS_WINDOWS.find((w) => w >= days - 1e-9) || NEWS_WINDOWS[NEWS_WINDOWS.length - 1];
  return { days: pick, note: (m && Math.abs(pick - days) > 1e-9) ? ('window ' + raw + ' → ' + pick + ' d (the pulse counts 1, 3, 7 or 14 days)') : '' };
}
/* a category the reader named, as the key js/news-events.js uses — 'all' when none, null when it names nothing */
async function newsCategoryKey(c) {
  const want = String(c || '').trim(); if (!want) return 'all';
  try { await window.IntMapLazy.need('newsEvents'); } catch (_) { }
  const E = window.IntMapNewsEvents; if (!E) return 'all';
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '');
  if (norm(want) === 'all') return 'all';
  const cats = E.categories();
  const hit = cats.find((k) => norm(k.key) === norm(want) || norm(k.label) === norm(want)) || cats.find((k) => norm(k.key).indexOf(norm(want)) >= 0 || norm(k.label).indexOf(norm(want)) >= 0);
  return hit ? hit.key : null;
}

export default [
  /* (#R386) 出来事のカテゴリで News の一覧と地図を同時に絞る。docs/NEWS-EVENTS.md §9/§10。
     ⚠ observer は `paint`、produces は `map,explanation` ——research.events と同じ形である。
        最初は `panel` / `panel,map` と書いたが、capability audit の `map-verified` が
        **正しく赤くした**: 地図を約束するなら、地図を見る観測者でなければならない。
        この操作が実際に変えるのは `news-points` のピンと、返す件数の説明である。
     ⚠ `lazy` は js/lazy-modules.js に実在する id でなければならない（#R347 が 4 件の
        「存在しない lazy を名指しした行」を測っている）。`newsEvents` はそこに在る。 */
  {
    row: ['news.category',              'newsCategory',   'newsFilter,eventCategory',                                    'data',    'paint',   'panel.news',             'map,explanation',     'session', 'none',   'text',     'newsEvents', 'external'],
    doc: [
      { in: 'news.category', text: 'NEWS CATEGORY FILTER: {"type":"newsCategory","text":str} \u2014 narrows the News list AND the map pins to ONE event category, or "all" to clear it. The eight categories are world, politics, business, technology, science_health, climate_weather, disasters, society (their localised names work too). Use when the user asks to see only one kind of news \u2014 \u300c\u707d\u5bb3\u306e\u30cb\u30e5\u30fc\u30b9\u3060\u3051\u8868\u793a\u3057\u3066\u300d, "show me just the business events", "clear the news filter". It filters what is ALREADY loaded: it does not fetch a new topic (use mapReport for that) and it does not answer a question (use events or analyze). The reply states how many events and how many pins remain, so an empty category is REPORTED rather than looking like a broken filter.\n' },
    ],
    schema: () => ({ type: 'object', properties: { text: str(), category: str(), q: str() }, anyOf: [{ required: ['text'] }, { required: ['category'] }, { required: ['q'] }] }), /* `newsCategory`; "all" clears the filter */
      /* (#R386) news.category — 一覧と地図を同時に絞る（docs/NEWS-EVENTS.md §9/§10）。述語は
         js/news-events.js の `passes()` 1 本なので片方だけに効く状態が作れない。⚠ **観測してから
         名乗る**: 件数とピンの本数を state provider から読み、0 件なら `partial` にする。 */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, HOST = K.HOST, fetchData = K.fetchData, esc = K.esc;
      {
          const want=String(a.text||a.category||a.q||'').trim();
          if(!want) return R(false, warn(L('Name a category','カテゴリ名を指定してください','Kategorie angeben','Укажите категорию','Indique una categoría')), {meta:{code:'NEEDS_INPUT',category:'input',retryable:true,produced:[],userGoalSatisfied:false}});
          const okLazy=await window.IntMapLazy.need('newsEvents');
          const E=okLazy&&window.IntMapNewsEvents;
          if(!E) return R(false, warn(L('The events surface is not available','出来事の一覧が利用できません','Die Ereignisansicht ist nicht verfügbar','Лента событий недоступна','La vista de sucesos no está disponible')), {meta:{code:'MODULE_UNAVAILABLE',category:'capability',retryable:false,produced:[],userGoalSatisfied:false}});
          if(!(typeof HOST.newsSurfaceMode==='function'&&HOST.newsSurfaceMode()==='events')){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
          const cats=E.categories();
          const norm=(x)=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,'');
          const hit=(norm(want)==='all'||norm(want)===norm(L('All','すべて','Alle','Все','Todas')))
            ? {key:'all',label:L('All','すべて','Alle','Все','Todas')}
            : cats.find(c=>norm(c.key)===norm(want)||norm(c.label)===norm(want))
              || cats.find(c=>norm(c.key).indexOf(norm(want))>=0||norm(c.label).indexOf(norm(want))>=0);
          if(!hit) return R(false, warn(L('No such event category','そのカテゴリはありません','Keine solche Kategorie','Такой категории нет','No existe esa categoría')+': '+esc(want)+' — '+cats.map(c=>esc(c.label)).join(' · ')), {meta:{code:'NOT_FOUND',category:'input',retryable:true,semanticTarget:want,produced:[],userGoalSatisfied:false}});
          E.setCategory(hit.key);
          const st=E.state()||{};
          const n=st.visibleEventCount||0, pins=st.visiblePinCount||0;
          let html='<div style="font-weight:600;margin:2px 0 4px;">'+esc(hit.label)+'</div>';
          html+='<div style="font-size:11px;color:var(--text-muted);line-height:1.55;">'
            +n+' '+L('matching events','件の出来事','passende Ereignisse','подходящих событий','sucesos coincidentes')+' · '+pins+' '+L('pins','ピン','Pins','меток','pines')
            +(st.unplacedCount?(' · '+st.unplacedCount+' '+L('with no location','地点不明','ohne Ort','без места','sin ubicación')):'')
            +(st.multiSourceCount?(' · '+st.multiSourceCount+' '+L('reported by 2+ independent outlets','は独立2媒体以上が報道','von 2+ unabhängigen Quellen','сообщили 2+ независимых источника','con 2+ medios independientes')):'')
            +'</div>';
          const produced=[]; if(n) produced.push('panel'); if(pins) produced.push('map');
          return R(true, html, {meta:{code:n?'OK':'NO_RESULTS',category:n?'ok':'evidence',retryable:!n,semanticTarget:hit.key,
            produced,userGoalSatisfied:!!n,partial:!(n&&pins)}}); }
    },
  },

  /* ══ (news-intelligence) THE NEWS PULSE, THE COUNTRY BRIEF, OUTAGES BESIDE THE NEWS, COMPANIES IN THE NEWS,
     AND WHETHER THE COLLECTION IS ALIVE ═══════════════════════════════════════════════════════════════════
     docs/NEWS-EVENTS.md §16. The arithmetic is js/news-intel-core.js; the body is js/news-intel.js (lazy) behind
     the boot facade window.IntMapNewsIntel (js/news-pulse.js). These runs pick the arguments, call the facade and
     word the answer — they decide no fact. ⚠ A COUNT IS NOT A JUDGEMENT: every answer that ranks countries says
     that it counts what IntMap's news sources reported, so a quiet country is not presented as a calm one. */
  {
    row: ['news.pulse',                 'newsPulse',      'countryNews,newsByCountry,newsHeat',                          'data',    'layer',   'map.layer',              'map,explanation',     'session', 'none',   '',         'newsIntel'],
    doc: [
      { in: 'events', at: 30, text: 'NEWS PULSE BY COUNTRY: {"type":"newsPulse","window"?:"24h"|"3d"|"7d"|"14d","mode"?:"volume"|"rising","category"?:str,"n"?:int,"show"?:bool} — how many news EVENTS were FIRST REPORTED in each country over the window (from IntMap\'s own event table, every event it holds, not only the 200 in the News list), or with "mode":"rising" which countries rose most against the window before it. Shows the Layers row 「国ごとのニュースの脈」 unless "show":false, and REPLIES with the ranking and the totals. It follows the Chronos clock (the window ends at the clock\'s instant), so "what was in the news the week of 20 September" is the same call with the clock moved. Use for 「いま世界でニュースが多い国は？」, 「先週より報道が増えている国」, "where is the news this week", "which countries are rising in the news", "show me disaster news by country". The counts are what IntMap\'s news SOURCES reported, so a country with few events may simply be little covered — say so; never call it calm.\n' },
    ],
    schema: () => ({ type: 'object', properties: { window: str(), days: int(1, 14), mode: one('volume', 'rising'), category: str(), n: int(1, 40), show: bool() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const N = window.IntMapNewsIntel;
      if (!N) return R(false, warn(L('The news pulse is not available', 'ニュースの脈を利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      const w = newsWindowDays(a);
      const mode = String(a.mode || '').toLowerCase() === 'rising' ? 'rising' : 'volume';
      const cat = await newsCategoryKey(a.category);
      if (cat === null) return R(false, warn(L('No such event category', 'そのカテゴリはありません') + ': ' + esc(a.category)), { meta: { code: 'NOT_FOUND', category: 'input', retryable: true, semanticTarget: String(a.category || ''), produced: [], userGoalSatisfied: false } });
      const show = a.show !== false;
      if (show) { await N.setOn(true); await N.setOptions({ windowDays: w.days, mode, category: cat }); }
      const r = await N.ranking({ windowDays: w.days, mode, category: cat, limit: a.n || 10 });
      if (!r || !r.ok) return R(false, warn(L('The news collection could not be reached — this does not mean nothing happened', 'ニュースの収集に到達できませんでした（何も起きていないという意味ではありません）')), { meta: { code: 'UPSTREAM_UNAVAILABLE', category: 'evidence', retryable: true, produced: [], userGoalSatisfied: false } });
      const wl = w.days === 1 ? L('24 h', '24時間') : L('{n} days', '{n}日').replace('{n}', String(w.days));
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(mode === 'rising' ? L('Rising in the news — last {w}', 'ニュースが増えている国 — 直近{w}').replace('{w}', wl) : L('Most news events — last {w}', 'ニュースの出来事が多い国 — 直近{w}').replace('{w}', wl)) + '</div>';
      if (w.note) html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(w.note) + '</div>';
      html += '<ol style="margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.55;">' + r.top.map((c) => {
        const ch = c.change && c.change.kind === 'new' ? L('new', '新規') : (c.change && c.change.ratio ? ((c.change.ratio >= 1 ? '+' : '') + Math.round((c.change.ratio - 1) * 100) + '%') : '');
        return '<li>' + esc(c.country) + ' — ' + esc(L('{n} events', '{n} 件').replace('{n}', String(c.events))) + ' (' + esc(L('{p} before', '前の期間 {p}').replace('{p}', String(c.previous))) + (ch ? ', ' + esc(ch) : '') + ')</li>';
      }).join('') + '</ol>';
      html += '<div style="font-size:11px;color:var(--text-muted);line-height:1.5;">' + esc(L('{t} events first reported in the window across {c} countries ({u} with no place, {x} at sea). These are counts of what IntMap’s news sources reported; a country with few events may simply be little covered.', '期間中に新しく報じられた出来事 {t} 件・{c} か国（地点不明 {u} 件・海上 {x} 件）。IntMap のニュース源が報じたものの件数で、件数の少ない国は報道が少ないだけの場合があります。')
        .replace('{t}', String(r.total)).replace('{c}', String(r.countries)).replace('{u}', String(r.unplaced)).replace('{x}', String(r.atSea))) + '</div>';
      const n = r.top.length;
      return R(true, html, { meta: { code: n ? 'OK' : 'NO_RESULTS', category: n ? 'ok' : 'evidence', retryable: false, semanticTarget: mode + ':' + w.days + ':' + cat,
        produced: show ? ['map', 'explanation'] : ['explanation'], userGoalSatisfied: !!n, pulse: r } }); },
  },
  {
    row: ['news.brief',                 'newsBrief',      'countryBrief,countryNewsBrief,dailyBrief',                    'data',    'panel',   'panel.newsBrief',        'panel,explanation',   'session', 'none',   'country',  'newsIntel', 'external'],
    doc: [
      { in: 'events', at: 40, text: 'COUNTRY NEWS BRIEF: {"type":"newsBrief","country":str,"window"?:"24h"|"3d"|"7d"|"14d"} — opens the brief of ONE country and replies with its facts: how many news events were first reported there in the window and in the window before, how many were reported by 2+ independent outlets, the categories, the most-reported events (headline, place, time, number of outlets), and the internet outages IODA measured in that country over the same days, each with the news first reported there around it (reported together — NOT shown to be connected; never say one caused the other). Use for 「イランの今週のニュースをまとめて」, 「ブラジルの日報」, "brief me on the news in Nigeria this week", "what happened in Japan in the last 3 days". It reads IntMap\'s whole event table, not only the loaded News list.\n' },
    ],
    schema: () => ({ type: 'object', properties: { country: str(), place: str(), window: str(), days: int(1, 14) }, anyOf: [{ required: ['country'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const N = window.IntMapNewsIntel;
      const q = String(a.country || a.place || '').trim();
      if (!q) return R(false, warn(L('Name a country', '国名を指定してください')), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
      if (!N) return R(false, warn(L('The news brief is not available', 'ニュースの日報を利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      const w = newsWindowDays(a);
      await N.setOptions({ windowDays: w.days });
      const r = await N.brief(q);
      if (!r || !r.ok) return R(false, warn(L('No such country', 'その国が見つかりません') + ': ' + esc(q)), { meta: { code: 'NOT_FOUND', category: 'input', retryable: true, semanticTarget: q, produced: [], userGoalSatisfied: false } });
      const wl = r.windowDays === 1 ? L('24 h', '24時間') : L('{n} days', '{n}日').replace('{n}', String(r.windowDays));
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(r.country) + ' — ' + esc(L('news brief, last {w}', 'ニュースの日報・直近{w}').replace('{w}', wl)) + '</div>';
      html += '<div style="font-size:12px;line-height:1.55;">' + esc(L('{n} events first reported ({p} in the window before) · {m} by 2+ independent outlets', '新しく報じられた出来事 {n} 件（直前の期間 {p} 件）・独立した2媒体以上 {m} 件').replace('{n}', String(r.events)).replace('{p}', String(r.previous)).replace('{m}', String(r.multiSource))) + '</div>';
      if (r.top && r.top.length) html += '<ul style="margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.5;">' + r.top.map((e) => '<li>' + esc(e.title) + ' <span style="color:var(--text-muted)">(' + esc([e.place, e.sources + ' ' + L('outlets', '媒体')].filter(Boolean).join(' · ')) + ')</span></li>').join('') + '</ul>';
      if (r.outagesReachable === false) html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('IODA could not be reached — this is not an all-clear', 'IODA に到達できませんでした（障害が無いという意味ではありません）')) + '</div>';
      else if (r.outages && r.outages.length) html += '<div style="font-size:11.5px;line-height:1.5;">' + esc(L('{n} internet outage event(s) measured by IODA in this window — shown beside the news reported around them, not as their cause.', 'この期間に IODA が計測したインターネット障害 {n} 件 — 前後に報じられたニュースと並べており、原因としてではありません。').replace('{n}', String(r.outages.length))) + '</div>';
      return R(true, html, { meta: { code: r.events ? 'OK' : 'NO_RESULTS', category: r.events ? 'ok' : 'evidence', retryable: false, semanticTarget: r.key,
        produced: ['panel', 'explanation'], userGoalSatisfied: true, brief: r } }); },
  },
  {
    row: ['news.outages',               'outageNews',     'internetOutageNews,outagesAndNews',                           'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'newsIntel'],
    doc: [
      { in: 'events', at: 50, text: 'INTERNET OUTAGES BESIDE THE NEWS: {"type":"outageNews","days"?:1-14,"n"?:int} — the internet outage EVENTS IODA (Georgia Tech) measured in every country over the last days (start, duration, the signal that saw it, its score), each with the number of news events first reported in that country from the day before to the day after. Read live from IODA, never stored. Use for 「最近ネット遥断があった国とそのときのニュース」, "which countries had internet outages this week, and was there news". The count is what was REPORTED TOGETHER, not what was reported ABOUT the outage, and never a cause; for whether a place is offline RIGHT NOW use the internet-health layer (nethlth.report). If IODA cannot be reached say exactly that — it is not an all-clear.\n' },
    ],
    schema: () => ({ type: 'object', properties: { days: int(1, 14), n: int(1, 50) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const N = window.IntMapNewsIntel;
      if (!N) return R(false, warn(L('The news pulse is not available', 'ニュースの脈を利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      const r = await N.outageNews({ days: a.days, limit: a.n });
      if (!r || !r.ok) return R(false, warn(L('IODA could not be reached — this is not an all-clear', 'IODA に到達できませんでした（障害が無いという意味ではありません）')), { meta: { code: 'UPSTREAM_UNAVAILABLE', category: 'evidence', retryable: true, produced: [], userGoalSatisfied: false } });
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Internet outages measured by IODA — last {d} days', 'IODA が計測したインターネット障害 — 直近{d}日').replace('{d}', String(r.days))) + '</div>';
      html += r.outages.length ? '<ul style="margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.5;">' + r.outages.map((o) => '<li>' + esc(o.country) + ' — ' + esc(o.start.slice(0, 16).replace('T', ' ')) + ' UTC · ' + esc(o.signal)
        + (o.newsEventsAround != null ? ' · ' + esc(L('{n} news events reported there around it', '前後にその国で報じられた出来事 {n} 件').replace('{n}', String(o.newsEventsAround))) : '') + '</li>').join('') + '</ul>'
        : '<div style="font-size:12px;">' + esc(L('IODA recorded no outage events in this window', 'この期間、IODA は障害イベントを記録していません')) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('Source: IODA (Georgia Tech), read live and not stored. News counts are what was reported together, not a cause.', '出典: IODA（ジョージア工科大学）。その場で読み、保存していません。ニュースの件数は同時に報じられたもので、原因ではありません。')) + '</div>';
      return R(true, html, { meta: { code: r.outages.length ? 'OK' : 'NO_RESULTS', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true, outages: r } }); },
  },
  {
    row: ['news.health',                'newsHealth',     'newsFreshness,ingestHealth',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'newsEvents'],
    doc: [
      { in: 'events', at: 60, text: 'IS THE NEWS CURRENT: {"type":"newsHealth"} — when IntMap\'s news collection last ran successfully, its rhythm, and which processing steps are failing (fetch, locate, embed, assign, link, entities, summarise, prune). Use for 「ニュースは最新？」, "is the news up to date", "why are there no new events". It distinguishes 「no update for N hours」 (the collection answered and has stalled) from 「could not check」 (the status could not be read — say exactly that, never that it is down).\n' },
    ],
    schema: () => noArgs('newsHealth'),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const ok = await window.IntMapLazy.need('newsEvents');
      const E = ok && window.IntMapNewsEvents;
      if (!E || !E.health) return R(false, warn(L('The news surface is not available', 'ニュースを利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      const h = await E.health();
      const when = h.lastOkAt ? new Date(h.lastOkAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
      let line;
      if (h.state === 'unverified') line = L('Could not check the news collection’s status — this does not mean it is down.', 'ニュース収集の状態を確認できませんでした（止まっているという意味ではありません）。');
      else if (h.state === 'stale') line = L('No successful update since {t} — the collection has stalled.', '{t} 以降、更新に成功していません（収集が止まっています）。').replace('{t}', when);
      else if (h.state === 'fresh') line = L('Last successful update {t}.', '最後に更新に成功したのは {t}。').replace('{t}', when);
      else line = L('No run of the news collection is recorded.', 'ニュース収集の実行記録がありません。');
      let html = '<div style="font-size:12px;line-height:1.55;">' + esc(line) + '</div>';
      if (h.rhythmMs) html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('Runs every {m} min ({f}).', '{m} 分ごとに実行（{f}）。').replace('{m}', String(Math.round(h.rhythmMs / 60000))).replace('{f}', h.rhythmFrom === 'schedule' ? L('its schedule', '予定表') : L('the measured gap between runs', '実行間隔の実測'))) + '</div>';
      if (h.failing && h.failing.length) html += '<div style="font-size:11px;">' + esc(L('Steps failing now: {s}', '現在失敗している段: {s}').replace('{s}', h.failing.join(', '))) + '</div>';
      if (h.skipped && h.skipped.length) html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('Steps switched off: {s}', '止めてある段: {s}').replace('{s}', h.skipped.join(', '))) + '</div>';
      return R(h.state !== 'unverified', html, { meta: { code: h.state === 'unverified' ? 'UNOBSERVED' : 'OK', category: h.state === 'unverified' ? 'evidence' : 'ok', retryable: h.state === 'unverified', produced: ['explanation'], userGoalSatisfied: h.state !== 'unverified', health: { state: h.state, lastOkAt: when || null, failing: h.failing, skipped: h.skipped } } }); },
  },
  {
    row: ['news.company',               'companyNews',    'newsAboutCompany,companyEvents',                              'data',    'panel',   'panel.company',          'panel,explanation',   'session', 'none', 'text',     'companyPanel', 'external'],
    doc: [
      { in: 'events', at: 70, text: 'A COMPANY IN THE NEWS: {"type":"companyNews","company":str} — the news events whose headline or description names that company (matched against the company atlas\'s own roster by its registered name, its ticker with an exchange, or its common name with its capital letter; every match carries the sentence it rests on), opened on the company panel\'s News tab, with a line on the map from the company\'s nearest published site to each event. Use for 「トヨタの最近のニュース」, 「TSMC が出てくる出来事を地図で」, "news about Boeing", "where is Nike in the news". Only companies in the company atlas can be asked; a company it does not hold is NOT FOUND, not 「no news」.\n' },
    ],
    schema: () => ({ type: 'object', properties: { company: str(), text: str() }, anyOf: [{ required: ['company'] }, { required: ['text'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const q = String(a.company || a.text || '').trim();
      if (!q) return R(false, warn(L('Name a company', '企業名を指定してください')), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
      const ok = await window.IntMapLazy.need('companyPanel');
      const D = ok && window.IntMapCompanyData, P = ok && window.IntMapCompanyPanel;
      if (!D || !P || !window.IntMapNewsIntel) return R(false, warn(L('The company atlas is not available', '企業アトラスを利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      try { await D.index(); } catch (_) { }
      let row = null; try { row = D.get(q) || D.resolve(q) || null; } catch (_) { row = null; }
      if (!row || !row.id) return R(false, warn(L('That company is not in the company atlas', 'その企業は企業アトラスにありません') + ': ' + esc(q)), { meta: { code: 'NOT_FOUND', category: 'input', retryable: false, semanticTarget: q, produced: [], userGoalSatisfied: false } });
      await P.open(row.id, { focus: 'news' });
      const r = await window.IntMapNewsIntel.companyEvents(row.id);
      if (!r.ok) return R(false, warn(L('The news for this company could not be loaded', 'この企業のニュースを読み込めませんでした')), { meta: { code: 'UPSTREAM_UNAVAILABLE', category: 'evidence', retryable: true, produced: ['panel'], userGoalSatisfied: false } });
      const n = r.items.length;
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(row.n || row.id) + ' — ' + esc(L('{n} news events name it', 'この企業が出てくる出来事 {n} 件').replace('{n}', String(n))) + '</div>';
      if (n) html += '<ul style="margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.5;">' + r.items.slice(0, 8).map((x) => '<li>' + esc(x.row.representative_title || '') + ' <span style="color:var(--text-muted)">(' + esc([x.row.rep_place_name_en, (x.row.first_published_at || '').slice(0, 10)].filter(Boolean).join(' · ')) + ')</span></li>').join('') + '</ul>';
      else html += '<div style="font-size:12px;">' + esc(L('No event kept by IntMap (the last 30 days) names this company.', 'IntMap が保持している出来事（直近30日）に、この企業が出てくるものはありません。')) + '</div>';
      return R(true, html, { meta: { code: n ? 'OK' : 'NO_RESULTS', category: n ? 'ok' : 'evidence', retryable: false, semanticTarget: row.id, produced: n ? ['panel', 'map', 'explanation'] : ['panel', 'explanation'], userGoalSatisfied: true,
        events: r.items.slice(0, 20).map((x) => ({ title: x.row.representative_title, place: x.row.rep_place_name_en, firstReported: x.row.first_published_at, matchedBy: x.matchedBy, evidence: x.evidence, publicId: x.row.public_id })) } }); },
  },
];
