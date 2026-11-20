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
 *  `tests/labels-stack-and-scale-checks.test.mjs (#R198)` re-derives the relation from this file on every commit.
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
     ⚠ (#R707) `era` HAS NO CALLER. It was the time machine's country name, and it stopped being one
     in #R309: 「昔の国名ラベルの見た目や挙動も今の国名ラベルと完全に同じに。」 — js/time-borders.js
     measured its two era layers against `ofm-country` (8.5→12 against 12→17, among six other
     differences) and moved BOTH of them to `place('country')`, which is the whole point of that
     request. Nothing has asked for this curve since. It is left in place rather than deleted because
     removing a shipped key is a reduction (AGENTS.md §3-1); the check in
     tests/chronos-unnamed-shapes-checks.test.mjs (#R707) is what stops a SECOND unreachable key appearing
     quietly beside it. */
  /* (place-label-size-up) 「地名ラベルのテキストサイズを全体的に少し大きく」(2026-11-20): every place curve below is the previous one x ~1.09
     (country 12/17 -> 13/18.5, admin1 9.5/11.5 -> 10.4/12.5, city 9.5..19.5 -> 10.4..21.2, other 9/11 -> 9.8/12), REF follows. The
     non-place ladder (SUB_REF) is NOT raised: only place names grow. A design number; it lapses if the reader asks for another size. */
  const PLACE={
    /* ⚠ (#R210) country is the ONE class that went back UP, and it is a later instruction rather
       than a drift: 「国名ラベルと地名ラベルで大きさの差が少ないから、国名ラベルを大きくして差を出して
       視認性を高めて」. At z4 a country now reads 17 px against a city's 10.2 (was 13 vs 10.2), and
       at z7 — where `ofm-country` stops drawing — 17 against 11.6 (was 13 vs 11.6). Every other
       class still honours #R198's 「全体的に…下げた」, and tests/labels-stack-and-scale-checks.test.mjs #R198 ①c states the exemption
       by name so the next round cannot mistake it for a regression. */
    country:[[1,13],[4,18.5]],
    admin1 :[[4,10.4],[7,12.5]],
    /* (city-label-grow) 「Google Earth のように、ズームするほど都市名が大きくなる」(2026-11-18). The curve used to stop at z10
       and stay flat for the other twelve zooms, so a street-level city name was the size of a regional one. It now keeps
       growing — z10 13 -> z13 16 -> z17 19.5 (top tier x1.10 = 21.4 px) — and is flat only past z17, where the tiles carry no
       further settlements to tell apart. The three slopes (0.5 / 1.0 / 0.875 px per zoom) are a design choice, not a
       measurement; they lapse if the reader asks for another growth rate. z3..z10 is unchanged byte for byte. */
    city   :[[3,10.4],[10,14.2],[13,17.4],[17,21.2]],
    other  :[[7,9.8],[13,12]],
    era    :[[1,8.5],[4,12]]
  };
  /* The pointwise MAXIMUM of the curves above — at any zoom, the biggest a place name can be.
     tests/labels-stack-and-scale-checks.test.mjs (#R198) re-derives it from PLACE, so raising a class past this fails the
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
  /* (city-label-grow) the maximum now follows the tallest place name, which past z10 is the top city step
     (TIER_K[0] x the city curve: 14.3 @z10, 17.6 @z13, 21.45 @z17). Up to z10 it is the country's 17 as before. */
  const REF=[[1,13],[4,18.5],[10,18.5],[13,19.2],[17,23.4],[22,23.4]];
  /* ⚠ (#R210) SUB IS NO LONGER DERIVED FROM REF, AND THAT IS THE POINT. REF answers "how big can a
     place name get" and had to follow the country class up. SUB answers "how big may a NON-place
     label be", and nothing asked the sea names to grow — deriving one from the other would have made
     enlarging the country labels silently enlarge every overlay, tool and grid label on the map by
     31 %. SUB_REF is REF as it stood before this round (the pointwise max of the non-country place
     classes), so every non-place size is byte-identical to #R198's and the guarantee
     `sub(w) ≤ SUB < SUB_REF ≤ REF` is STRICTER than before, not weaker. */
  const SUB_REF=[[1,9.5],[4,13],[22,13]];
  const SUB_RATIO=0.88;
  const _fl=(v)=>Math.floor(v*10)/10;
  const SUB=SUB_REF.map(([z,s])=>[z,_fl(s*SUB_RATIO)]);

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

  /* ══ (city-label-size) A BIGGER PLACE HAS A BIGGER NAME ═════════════════════════════════════════════════════
     「Google earthみたいに、都市の規模に応じて、地名ラベルの大きさも変わる仕組みにして。」 (2026-10-05). Measured on
     Google Earth the same day, Japanese view: at an 800 km camera Tokyo and Osaka ≈14 px, Fukuoka ≈13, Hakodate ≈10;
     at 500 km Tokyo/Yokohama ≈16, Shizuoka/Kyoto ≈15, Nagano ≈13, Fukui ≈11 — three to four steps of one curve, the
     prefecture names smaller still. So a class's curve now has TIERS: tier 0 is the most important, and each tier is
     the class's own curve × TIER_K[tier]. WHICH tier a feature is in is not decided here — the layer that knows its
     source's schema says it (js/place-labels.js `CITY_TIER`, from the tiles' own rank and capital marks); this file
     only owns how big each step is, so the relations above keep holding by construction:
       · TIER_K[0] = 1.10 is the largest factor that keeps every tier under the pre-#R198 city curve
         (tests/labels-stack-and-scale-checks.test.mjs ①c — the binding zoom is z4: 11 / 10.0) and so under REF;
       · the steps are strictly decreasing, so a bigger place is never drawn smaller;
       · the spread 1.10 / 0.82 ≈ 1.34 is Google Earth's 14 / 10.4 at one camera, read off the screenshots above.
     These are design numbers taken from that observation; they lapse if the reader asks for a different spread,
     and the tier rule (not these) is what changes if the source's rank changes meaning. */
  const TIER_K=[1.10,1.02,0.94,0.82];
  function placeTierAt(kind,tier,z){ const k=TIER_K[Math.max(0,Math.min(TIER_K.length-1,tier|0))]; return _fl(placeAt(kind,z)*k); }
  /* zoom outermost (#R73), each stop a `step` over the tier expression — the shape both renderers evaluate */
  /* `mult` (default 1) scales every step — kept for callers that size a companion to a name; the city layer no longer has one. */
  function placeTiered(kind,tierExpr,mult){ const s=PLACE[kind]; if(!s) throw new Error('IntMapLabelScale.placeTiered: unknown kind '+kind);
    const m=(mult==null?1:mult);
    return _expr(s.map(([z,px])=>{ const st=['step',tierExpr,_fl(px*TIER_K[0]*m)]; for(let i=1;i<TIER_K.length;i++) st.push(i,_fl(px*TIER_K[i]*m)); return [z,st]; })); }

  /* ══ (news-type-polish) HOW THICK THE OUTLINE AROUND A NAME IS ═══════════════════════════════════
     「地名ラベルの周囲の黒縁取りは幅を細く。」 (2026-11-16). The halo widths were written as literals per
     layer (1.7 country, 1.6 city, 1.45 others, 1.1 water…), so «thinner» could only be done as thirty
     edits that would drift apart again. Each layer now keeps its OWN weight — the relation between a
     country's ring and a river's stays what it was — and this one factor scales them all. 0.6 is the
     design number of this request (country 1.7 → 1.02 px); it lapses if the reader asks for another
     thickness. Overlay labels that are not place names (news bands, POIs, tools) do not ask for it. */
  const HALO_K=0.6;
  function halo(w){ return Math.round(w*HALO_K*100)/100; }

  return { place, placeAt, placeTiered, placeTierAt, refAt, sub, subAt, subCase, halo, HALO_K, PLACE, REF, SUB_REF, SUB, SUB_RATIO, TIER_K };
})();
