/* ============================================================================
 *  IntMap · Atlas capabilities — the `time.*` namespace   (js/atlas-cap-time.js)
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
import { str, bool, num, int } from './atlas-caps.js';
import { IntMapTime } from './chronos.js';

export default [
  {
    row: ['time.travel',                'timeTravel',     'setTime,timeSet',                                             'time',    'time',    'time',                   'map,time',            'session', 'none',   '',         ''],
    /* Chronos: a year, a date, a number of days — or the return to live. With none of them the
       case says «give a year or date», which is what this branch list makes it stop needing to. */
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), daysAgo: int(), value: num(), now: bool(), reset: bool(), live: bool() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['daysAgo'] }, { required: ['value'] }, { required: ['now'] }, { required: ['reset'] }, { required: ['live'] }] }), /* `timeTravel` */
      /* (#R94) time-travel now drives the WHOLE spacetime OS (IntMapTime): news, the Countries statistics,
         borders, the climate era, NATO/EU accession & the day/night terminator all move together. Accepts a
         year (deep time back to `IntMapTime.min` — AD 1 since #R604), an exact date, or daysAgo; "now/reset" returns everything to live. */
    async run(a, dctx, K) { const L = K.L, R = K.R, note = K.note, warn = K.warn, ymdISO = K.ymdISO;
      { try{ const T=IntMapTime;
          const synced=L('the whole map (news, countries, borders, climate era) moves with it','地図全体（ニュース・国データ・国境・気候区分）が同期します','die ganze Karte bewegt sich mit','вся карта движется вместе','todo el mapa se mueve con él');
          const nowMsg=()=>R(true, note('✓ '+L('Back to now','現在に戻しました','Zurück zu jetzt','Вернулись в настоящее','Volvimos al presente')));
          if(!T){ const sl=document.getElementById('ntl-slider'); if(sl){ let v=3650,da=(a.daysAgo!=null)?Math.round(+a.daysAgo):null; if(da==null&&a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)) da=Math.round((Date.now()-t0)/86400000); } if(da!=null) v=Math.max(0,Math.min(3650,3650-da)); else if(a.value!=null) v=+a.value; sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); } return R(true, note(L('Time set','時刻を設定しました','Zeit gesetzt','Время задано','Hora establecida'))); }   /* (#R108) explained, not a bare ✓ */
          if(a.reset||a.now||a.live){ T.setNow({source:'atlas'}); return nowMsg(); }
          const curY=new Date().getFullYear();
          let y=(a.year!=null)?Math.round(+a.year):null;
          if(y==null&&typeof a.date==='string'){ const m=a.date.match(/^\s*(\d{3,4})\s*$/); if(m) y=+m[1]; }
          /* ⚠⚠ (#R380) THE GUARD READ THE KERNEL AND THE SENTENCE BESIDE IT DID NOT. `y<T.min` has always
             been the real test, but the words were the literal 1900 in all nine languages — so when #R349
             moved the floor to 1850 (and #R604 to AD 1) this refusal went on telling every reader that 1875, a year the
             next statement accepts, is out of reach. The number now comes from the same place the test does. */
          if(y!=null){ if(y>=curY){ T.setNow({source:'atlas'}); return nowMsg(); } if(y<T.min) return R(false, warn('⚠ '+L('Chronos reaches back to {y}','Chronosは{y}年まで遡れます','Bis {y} zurück','До {y} года','Hasta {y}').replace(/\{y\}/g,String(T.min)))); T.setYear(y,{source:'atlas'}); return R(true, note(y+' — '+synced)); }
          if(a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)){ if(t0>Date.now()){ T.setNow({source:'atlas'}); return nowMsg(); } T.set(new Date(t0),{source:'atlas'}); return R(true, note(ymdISO(new Date(t0))+' — '+synced)); } }
          if(a.daysAgo!=null){ const da=Math.round(+a.daysAgo); if(da<=0){ T.setNow({source:'atlas'}); return nowMsg(); } T.setDaysAgo(da,{source:'atlas'}); return R(true, note(ymdISO(T.when())+' — '+synced)); }
          if(a.value!=null){ T.setDaysAgo(3650-(+a.value),{source:'atlas'}); return R(true, note(ymdISO(T.when()))); }
          return R(false, warn('⚠ '+L('Give a year or date','年か日付を指定してください','Jahr/Datum angeben','Укажите год/дату','Indica un año o fecha')));
        }catch(_){ return R(false, warn('⚠ '+L('Time machine unavailable','タイムマシンが使えません','Zeitmaschine nicht verfügbar','Машина времени недоступна','Máquina del tiempo no disponible'))); } }
    },
  },
];
