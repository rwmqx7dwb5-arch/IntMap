/* ============================================================================
 *  IntMap · WHAT A BEARING IS CALLED — window.IntMapCompass   (#R289)
 * ----------------------------------------------------------------------------
 *  「日本語設定でも座標標高常時表示欄にNEと表示されますが、ちゃんと北東と書くように。
 *    （ほかの言語でも。それが自然な表記ならば。）」
 *
 *  ══ WHY THIS IS A FILE AND NOT A LINE ═══════════════════════════════════════════════════════
 *  「NE」 was not written once. Six places in this app turned a bearing into a word, each with its
 *  own private array of the same sixteen ENGLISH abbreviations:
 *
 *      js/map-readout.js  the always-on readout's wind chip      ← the one the report names
 *      js/weather.js      the point-weather popup's wind line
 *      js/app-body.js     `compassDir()` (aircraft heading)
 *      js/night-sky.js    the sky panel's look-azimuth
 *      js/sims.js         the sun-position panel's azimuth
 *      js/street-view.js  the street-view heading chip
 *
 *  A seventh copy would have fixed the readout and left the other five saying 「NE」 in Japanese,
 *  which is the same defect with a smaller blast radius. So the sixteen points have ONE owner and
 *  every one of those call sites reads them from here.
 *
 *  ══ WHY THE TABLE IS EXPLICIT PER LANGUAGE, NOT AN L(…) CALL ════════════════════════════════
 *  `window.IntMapLang.pick()` resolves a language past the fifth argument through the `inline`
 *  table, KEYED BY THE ENGLISH STRING. The English strings here are 'N', 'E', 'S', 'W', 'NE' … —
 *  one and two letters, the most collision-prone keys this app could possibly mint, and #R277
 *  already paid for a key collision of exactly that shape (LA('Hail', …) put a Saudi city into the
 *  disaster table). A bearing name is also not a UI string a translator should be asked to guess
 *  at: it is a fixed convention per language. So all nine tables are written out, and
 *  tests/r289-checks.test.mjs holds them to the invariants that make them a compass at all —
 *  sixteen entries, all distinct, and the eight-point set being every other one of them.
 *
 *  ══ THE CONVENTIONS, AND WHY THEY DIFFER ════════════════════════════════════════════════════
 *  · en / es / fr use the Latin initials of their own words, so Spanish and French west is O
 *    (Oeste / Ouest) and their south-west is SO, not SW.
 *  · de uses O for Ost — NO, not NE.
 *  · ru abbreviates Cyrillic: С В Ю З (север / восток / юг / запад).
 *  · ja spells the direction out (北東), and the ORDER is north-first: 北東, 南西.
 *  · zh spells it out too but the order is the OTHER way round — 東北, 西南 — so 「北東」 is not a
 *    Chinese word and a shared CJK table would have been wrong in one of the two.
 *  · ko spells it out north-first like Japanese: 북동, 남서.
 * ==========================================================================*/
window.IntMapCompass=(function(){
  'use strict';
  /* the sixteen points, clockwise from north. Index i covers bearings [i·22.5 − 11.25, i·22.5 + 11.25). */
  var P={
    en:['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'],
    jp:['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'],
    de:['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSW','SW','WSW','W','WNW','NW','NNW'],
    ru:['С','ССВ','СВ','ВСВ','В','ВЮВ','ЮВ','ЮЮВ','Ю','ЮЮЗ','ЮЗ','ЗЮЗ','З','ЗСЗ','СЗ','ССЗ'],
    es:['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'],
    zh:['北','北北東','東北','東北東','東','東南東','東南','南南東','南','南南西','西南','西南西','西','西北西','西北','北北西'],
    'zh-hans':['北','北北东','东北','东北东','东','东南东','东南','南南东','南','南南西','西南','西南西','西','西北西','西北','北北西'],
    fr:['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'],
    ko:['북','북북동','북동','동북동','동','동남동','남동','남남동','남','남남서','남서','서남서','서','서북서','북서','북북서']
  };
  /* ⚠ THERE IS NO GLOBAL «CURRENT LANGUAGE» — `IM_HOST` is a module-local const in js/app-body.js
     and `window.IM_HOST` does not exist (#R253 measured that, after #R242 had been reading it for
     eleven rounds). So a caller that HAS the app's code passes it, and the fallback walks
     `<html lang>` — a BCP-47 tag — back through the ONE registry rather than through a second table.
     Never captured: the reader can switch language at runtime (#R165's rule). */
  function code(lang){
    var c=lang;
    try{ if(c==null) c=String(document.documentElement.lang||'en'); }catch(_){ c='en'; }
    try{
      var R=window.IntMapLang;
      if(R){
        if(R.has&&R.has(c)) c=R.normalise(c);
        else{
          var rows=R.LANGS||[], raw=String(c).toLowerCase(), hit='';
          for(var i=0;i<rows.length;i++){ if(String(rows[i]&&rows[i].html||'').toLowerCase()===raw){ hit=rows[i].code; break; } }
          c=hit||(R.normalise?R.normalise(c):c);
        }
      }
    }catch(_){}
    return P[c]?c:'en';
  }
  /* deg → the point's INDEX in the 16-point table. `n` is 8 or 16 (anything else is 16). */
  function index(deg,n){
    var d=+deg; if(!isFinite(d)) return -1;
    d=((d%360)+360)%360;
    if(n===8) return (Math.round(d/45)%8)*2;
    if(n===4) return (Math.round(d/90)%4)*4;
    return Math.round(d/22.5)%16;
  }
  /* deg → the name, in `lang` (or the app's current language). '' when the bearing is not a number. */
  function point(deg,lang,n){ var i=index(deg,n); return i<0?'':P[code(lang)][i]; }
  return {
    point:point, index:index,
    /* the whole table for one language — the tests read it, and so does any caller that needs the
       set rather than one member. A COPY: a table somebody can push onto is not a table (#R167 ③). */
    table:function(lang,n){ var t=P[code(lang)]; return n===8?t.filter(function(_,i){ return i%2===0; }):t.slice(); },
    /* every language code this file answers for — the i18n audit and the tests enumerate it */
    langs:function(){ return Object.keys(P); }
  };
})();
