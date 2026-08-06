/* ============================================================================
 *  IntMap · HOW BIG A LABEL IS — window.IntMapLabelScale  (#R198)
 * ----------------------------------------------------------------------------
 *  「全体的にラベルのテキストサイズを下げたうえで、地名ラベル以外のテキストは地名ラベルよりも小さめに。」
 *
 *  Two requirements, and the second one is the reason this file exists rather than a pass of
 *  hand-edited numbers. "Smaller than the place-name labels" is not a property of any one layer —
 *  it is a relation between EVERY piece of text the map draws and a reference that lives somewhere
 *  else. Thirty independent literals cannot hold that relation; they can only happen to satisfy it
 *  on the day they are written. So the sizes come from ONE ladder here, and
 *  `tests/r198-checks.test.mjs` re-derives the relation from this file on every commit.
 *
 *  ── THE TWO LADDERS ─────────────────────────────────────────────────────────────────────────
 *  `PLACE` is the 地名ラベル: the settlement / country / admin-1 names, i.e. the layer group behind
 *  the "Place names" switch. Each class keeps its own curve (a country is not a hamlet), and every
 *  curve is BELOW what it was before this round — that is the 「全体的に…下げた」 half.
 *
 *  `REF` is the pointwise MAXIMUM of those curves: at any zoom, the biggest a place name can be.
 *  `SUB` is `REF × SUB_RATIO`, rounded DOWN to a tenth so the inequality can never land on equal.
 *  Every other label on the map — water, peaks, POIs, grid, overlays, tools, era names, satellites —
 *  asks for `sub(w)` with a weight `w ≤ 1`, which makes
 *
 *      sub(w)(z)  ≤  SUB(z)  =  floor(REF(z) · 0.88)  <  REF(z)  =  max place size at z
 *
 *  true at every zoom by construction rather than by inspection. Both ladders are piecewise linear
 *  over the SAME breakpoints, so checking the breakpoints checks the whole range.
 *
 *  ⚠ ZOOM MUST BE THE OUTERMOST EXPRESSION. #R73 lost the entire sea-label layer to a zoom
 *  `interpolate` nested inside a `case`: MapLibre rejected the addLayer asynchronously, the try
 *  swallowed it, and the majors were labelled nowhere. Everything here therefore returns a plain
 *  `['interpolate', ['linear'], ['zoom'], …]` whose STOP OUTPUTS may be a `case` (`subCase`) but
 *  which never puts `['zoom']` anywhere but the top. Both renderers evaluate that form —
 *  js/cesium-style.js implements `interpolate`/`case`/`step` for exactly this reason.
 * ==========================================================================*/
window.IntMapLabelScale=(function(){
  /* ── 地名ラベル ────────────────────────────────────────────────────────────────────────────
     kind → [[zoom, px], …]. Compare with what these were before #R198:
       country  10 → 15   ·  city  11 → 15   ·  other (village/suburb)  10 → 13
     admin1 (states / provinces / prefectures) is new in #R198 and sits between country and city:
     a prefecture is a smaller thing than the country it is in and a bigger thing than a town.
     `era` is the time machine's country name (js/time-borders.js): a country name for a past year is
     a place name, and it keeps the half-step-smaller relation to the present-day label it replaces
     that #R103 gave it (it was 9.5→13 against the modern 10→15). */
  const PLACE={
    country:[[1,9],[4,13]],
    admin1 :[[3.2,9.5],[7,11.5]],
    city   :[[3,9.5],[10,13]],
    other  :[[7,9],[13,11]],
    era    :[[1,8.5],[4,12]]
  };
  /* The pointwise MAXIMUM of the curves above — at any zoom, the biggest a place name can be.
     tests/r198-checks.test.mjs re-derives it from PLACE, so raising a class past this fails the
     build rather than quietly making the relation false.

     ⚠ WHY THE MAXIMUM AND NOT THE MINIMUM — the one thing this file cannot promise. Binding the
     cap to the SMALLEST place class instead would make "no non-place label is ever bigger than any
     place label" true, and it is not achievable together with the first half of the request. The
     smallest place class is `other` (village / suburb / hamlet), which was already 10 px where a
     lake name was 13; pinning every non-place label under a REDUCED `other` would put sea and lake
     names at ~7 px. So the cap is the place tier's own reference, and one pair is left inverted on
     purpose: a hamlet's name can be smaller than the name of the sea it sits beside, which is what
     a paper atlas does too. The inversion the request is actually about — an OCEAN at 19.3 px
     against a CITY at 15 — is gone: no non-place label exceeds 11.4 px at any zoom. */
  const REF=[[1,9.5],[4,13],[22,13]];
  const SUB_RATIO=0.88;
  const _fl=(v)=>Math.floor(v*10)/10;
  const SUB=REF.map(([z,s])=>[z,_fl(s*SUB_RATIO)]);

  /* piecewise-linear read of a stop table, clamped outside its ends — the same thing
     `['interpolate',['linear'],['zoom'],…]` does, so a test can predict the renderer. */
  function _at(stops,z){
    if(z<=stops[0][0]) return stops[0][1];
    const last=stops[stops.length-1];
    if(z>=last[0]) return last[1];
    for(let i=1;i<stops.length;i++){ const [z0,s0]=stops[i-1],[z1,s1]=stops[i];
      if(z<=z1) return s0+(s1-s0)*((z-z0)/(z1-z0)); }
    return last[1];
  }
  function _expr(stops){ const e=['interpolate',['linear'],['zoom']]; for(const [z,s] of stops){ e.push(z,s); } return e; }

  /* ── the API ──────────────────────────────────────────────────────────────────────────────── */
  /* A place name. `kind` is one of PLACE's keys. */
  function place(kind){ const s=PLACE[kind]; if(!s) throw new Error('IntMapLabelScale.place: unknown kind '+kind); return _expr(s); }
  function placeAt(kind,z){ const s=PLACE[kind]; if(!s) throw new Error('IntMapLabelScale.placeAt: unknown kind '+kind); return _at(s,z); }
  /* The biggest a place name can be at this zoom — the thing everything else must stay under. */
  function refAt(z){ return _at(REF,z); }

  /* Everything that is NOT a place name. `w` (0 < w ≤ 1) is how prominent this label is WITHIN the
     non-place group: 1 is a sea name, ~0.8 is a grid tick. Values above 1 are clamped, because the
     one thing this function exists to guarantee is that its output stays under a place name. */
  function sub(w){ const k=Math.min(1,(w==null?1:w)); return _expr(SUB.map(([z,s])=>[z,_fl(s*k)])); }
  function subAt(z,w){ const k=Math.min(1,(w==null?1:w)); return _fl(_at(SUB,z)*k); }
  /* …and the two-sizes-in-one-layer form (#R73's valid shape): zoom stays outermost and each stop
     output is a `case`. `cond` is any non-zoom expression; wTrue/wFalse are weights as above. */
  function subCase(cond,wTrue,wFalse){
    const a=Math.min(1,(wTrue==null?1:wTrue)), b=Math.min(1,(wFalse==null?1:wFalse));
    return _expr(SUB.map(([z,s])=>[z,['case',cond,_fl(s*a),_fl(s*b)]]));
  }

  return { place, placeAt, refAt, sub, subAt, subCase, PLACE, REF, SUB, SUB_RATIO };
})();
