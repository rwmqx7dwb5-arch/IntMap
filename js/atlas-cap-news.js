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
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str } from './atlas-caps.js';

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
    schema: () => ({ type: 'object', properties: { text: str(), category: str(), q: str() }, anyOf: [{ required: ['text'] }, { required: ['category'] }, { required: ['q'] }] }), /* `newsCategory`; "all" clears the filter */
      /* (#R386) news.category — 一覧と地図を同時に絞る（docs/NEWS-EVENTS.md §9/§10）。述語は
         js/news-events.js の `passes()` 1 本なので片方だけに効く状態が作れない。⚠ **観測してから
         名乗る**: 件数とピンの本数を state provider から読み、0 件なら `partial` にする。 */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, HOST = K.HOST, fetchData = K.fetchData, esc = K.esc;
      {
          const want=String(a.text||a.category||a.q||'').trim();
          if(!want) return R(false, warn('⚠ '+L('Name a category','カテゴリ名を指定してください','Kategorie angeben','Укажите категорию','Indique una categoría')), {meta:{code:'NEEDS_INPUT',category:'input',retryable:true,produced:[],userGoalSatisfied:false}});
          const okLazy=await window.IntMapLazy.need('newsEvents');
          const E=okLazy&&window.IntMapNewsEvents;
          if(!E) return R(false, warn('⚠ '+L('The events surface is not available','出来事の一覧が利用できません','Die Ereignisansicht ist nicht verfügbar','Лента событий недоступна','La vista de sucesos no está disponible')), {meta:{code:'MODULE_UNAVAILABLE',category:'capability',retryable:false,produced:[],userGoalSatisfied:false}});
          if(!(typeof HOST.newsSurfaceMode==='function'&&HOST.newsSurfaceMode()==='events')){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
          const cats=E.categories();
          const norm=(x)=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,'');
          const hit=(norm(want)==='all'||norm(want)===norm(L('All','すべて','Alle','Все','Todas')))
            ? {key:'all',label:L('All','すべて','Alle','Все','Todas')}
            : cats.find(c=>norm(c.key)===norm(want)||norm(c.label)===norm(want))
              || cats.find(c=>norm(c.key).indexOf(norm(want))>=0||norm(c.label).indexOf(norm(want))>=0);
          if(!hit) return R(false, warn('⚠ '+L('No such event category','そのカテゴリはありません','Keine solche Kategorie','Такой категории нет','No existe esa categoría')+': '+esc(want)+' — '+cats.map(c=>esc(c.label)).join(' · ')), {meta:{code:'NOT_FOUND',category:'input',retryable:true,semanticTarget:want,produced:[],userGoalSatisfied:false}});
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
];
