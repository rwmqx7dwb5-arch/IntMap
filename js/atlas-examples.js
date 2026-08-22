/* ============================================================================
 *  IntMap · Atlas — the starter chips  (#R309)
 * ----------------------------------------------------------------------------
 *  The four example questions the Atlas panel offers before a conversation starts, and the rule
 *  that decides WHICH four: the country under the camera, or the world-scale set when no single
 *  country is the subject.
 *
 *  Lifted out of js/atlas-console.js because that file is at #R199's 5,300-line ceiling and the
 *  ceiling is never raised — a subject moves out instead (#R199 / #R278 / #R298 all paid the same
 *  way). Same shape as js/atlas-controls.js and js/atlas-sims.js: a real ES module that
 *  js/atlas-console.js names in an `import`, with everything it used to read from that closure
 *  arriving through `CTX` and rebound below under the ORIGINAL names, so the body is unchanged.
 * ==========================================================================*/
export function makeAtlasExamples(HOST, CTX) {
  const L=CTX.L, GE=CTX.GE, codeAtPoint=CTX.codeAtPoint, countryStats=CTX.countryStats,
        cName=CTX.cName, loadCountryData=CTX.loadCountryData, panelEl=CTX.panelEl, pick=CTX.pick;
    /* (#R103) examples showcase what Atlas is UNIQUELY good at — multi-country comparison, computed rankings, live
       news synthesis, cross-data analysis — NOT routing (still rough, so not advertised). JP stays Japan-flavoured. */
    /* (#R309) draw the chips. `force` ignores the "did the subject change" guard (a language change
       changes every string without changing the place). Silent while the row is hidden — a
       conversation has started and the chips are gone until the panel is rebuilt. */
    let _exKey=null;
    function renderExamples(force){ try{
      const panel=panelEl(); if(!panel) return; const ew=panel.querySelector('.atl-ex'); if(!ew) return;
      if(ew.style.display==='none') return;
      const p=_exPlace(); const key=(p?p.code:'')+'|'+HOST.lang;
      if(!force&&key===_exKey) return; _exKey=key;
      ew.innerHTML='';
      examples().forEach(ex=>{ const b=document.createElement('button'); b.className='atl-chip'; b.textContent=ex; b.onclick=()=>{ pick(ex); }; ew.appendChild(b); });
    }catch(_){} }
    /* ⚠ (#R309) DEBOUNCED, and on the camera's own settle — not on every frame. 600 ms is the same
       quiet the widget scheduler waits for after a pan (js/widget-scheduler.js), so the two agree on
       what "the reader has stopped moving" means. The guard above means a pan that stays inside one
       country costs one `codeAtPoint` and redraws nothing. */
    let _exWired=false, _exT=null;
    function _wireExampleCamera(){ if(_exWired) return; _exWired=true;
      const bump=()=>{ clearTimeout(_exT); _exT=setTimeout(()=>{ try{ renderExamples(); }catch(_){} },600); };
      try{ if(window.IntMapRuntime&&window.IntMapRuntime.onCamera) window.IntMapRuntime.onCamera('atlas-examples',bump,{phase:'read'});
        else GE().events.on('moveend',bump); }catch(_){ try{ GE().events.on('moveend',bump); }catch(__){} }
      /* the country table arrives after boot; until it does `_exPlace` can only answer «nowhere». */
      try{ if(typeof loadCountryData==='function') loadCountryData().then(()=>{ try{ renderExamples(); }catch(_){} }); }catch(_){}
    }
    /* ══ ⚠⚠⚠ (#R309) THE STARTER CHIPS ARE ABOUT WHAT THE READER IS LOOKING AT ═════════════════════
       「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて用意して
         変えるようにして。」 The four chips were four constants. Somebody who had flown to Kenya was
       still being offered «Compare the USA, China and India», and the one door that already knows
       which country is under the camera — `codeAtPoint`, sixty lines up in this same file — was never
       asked. `_exPlace()` asks it; `renderExamples()` redraws when the answer CHANGES (not on every
       frame), and the chips fall back to the world-scale four when the answer is «nowhere in
       particular»: mid-ocean, or zoomed out far enough that no single country is the subject.
       ⚠ THE ZOOM FLOOR IS PART OF THE ANSWER, NOT A TUNING KNOB. At z<2.5 the centre pixel lands in
       some country by arithmetic, but the reader is looking at a hemisphere — naming that country
       would be the same "a name for a guess" mistake #R302 removed from the daylight panel.
       ⚠ AND THEY ARE ORDINARY `L(...)` CALLS NOW. The old form passed ARRAYS, and js/lang-registry.js
       only reaches its inline table when `arguments[0]` is a string — so zh-Hant / zh-Hans / fr / ko
       fell through to English on all four chips while `npm run check:i18n` reported 100 %, because
       scripts/i18n-report.mjs drops any `L()` whose first argument is not a Literal. Written one
       string per call, all nine languages are reachable and the gate can see them.
       ⚠⚠ AND EVERY LANGUAGE PUTS `{place}` WHERE A BARE PROPER NOUN IS GRAMMATICAL. `cName()`
       returns the CLDR country name with no article and in the nominative — `Кения`, `Schweiz`,
       `Kenya` — so any slot that governs a case or wants an article produces «в Кения» and «von
       Schweiz». Russian inflects nearly every country name and German articles a couple of dozen
       of them, so both are written as an APPOSITIVE with the name first, which is also the shape
       French needs (`{place} : …`, no `sur le`/`de la` to get wrong) and the reason Korean below
       carries no 은/는 or 와/과 — those particles change with the preceding syllable's final
       consonant. English, Japanese and Spanish take the name as it comes.
       ⚠ The ENGLISH string is the KEY the four keyed languages are resolved by, so it is the one
       argument that must not be reworded for grammar — the locale tables are indexed on it. */
    function _exPlace(){ try{
      const c=GE().camera.getCenter(); if(!c||!isFinite(c.lng)) return null;
      const z=GE().camera.getZoom(); if(!(z>=2.5)) return null;
      const code=codeAtPoint(c.lng,c.lat); if(!code) return null;
      const st=(typeof countryStats!=='undefined'&&countryStats)?countryStats[code]:null; if(!st) return null;
      const nm=cName(st); return nm?{code:code,name:nm}:null;
    }catch(_){ return null; } }
    function examples(){ const p=_exPlace();
      if(p) return [
        L('Brief me on {place} — the latest','{place}でいま何が起きている？','{place}: Lagebericht — was passiert gerade?','{place} — что происходит прямо сейчас?','{place}: ¿qué está pasando ahora?'),
        L('Compare {place} with its neighbours — GDP, defense and population','{place}と周辺国を比較（GDP・国防費・人口）','{place} und seine Nachbarländer — BIP, Militär, Bevölkerung vergleichen','{place} и соседние страны — сравнить ВВП, оборону и население','{place} y sus países vecinos: comparar PIB, defensa y población'),
        L("How has {place}'s economy changed since 1990?",'{place}の経済は1990年からどう変わった？','{place}: Wie hat sich die Wirtschaft seit 1990 entwickelt?','{place}: как изменилась экономика с 1990 года?','{place}: ¿cómo ha cambiado la economía desde 1990?'),
        L('What is the weather and any active warnings in {place}?','{place}の天気と発表中の警報は？','{place}: Wetter und aktive Warnungen?','{place}: погода и действующие предупреждения?','{place}: ¿qué tiempo hace y qué avisos hay activos?'),
      ].map(t2=>String(t2).replace(/\{place\}/g,p.name));
      /* nowhere in particular — the world-scale four (#R103: what Atlas is UNIQUELY good at) */
      return [
        L('Compare the USA, China and India — GDP, defense and population','日本・ドイツ・インドを比較（GDP・国防費・人口）','USA, China und Indien vergleichen — BIP, Militär, Bevölkerung','Сравнить США, Китай и Индию — ВВП, оборона, население','Comparar EE. UU., China e India — PIB, defensa y población'),
        L('Which countries spend the most on defense relative to GDP?','GDP比で国防費が最も高い国は？','Welche Länder geben gemessen am BIP am meisten fürs Militär aus?','Какие страны тратят на оборону больше всего относительно ВВП?','¿Qué países gastan más en defensa respecto a su PIB?'),
        L('Brief me on the South China Sea — the latest','南シナ海でいま何が起きている？','Lagebericht Südchinesisches Meer — was passiert gerade?','Что происходит в Южно-Китайском море прямо сейчас?','¿Qué está pasando ahora en el Mar de China Meridional?'),
        L('Which countries have the highest life expectancy?','平均寿命が最も長い国は？','Welche Länder haben die höchste Lebenserwartung?','В каких странах самая высокая продолжительность жизни?','¿Qué países tienen mayor esperanza de vida?'),
      ]; }
  return { renderExamples, wireExamples: _wireExampleCamera };
}
