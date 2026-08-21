/* ============================================================================
 *  IntMap · The data-layer catalogue + engine — IntMapModules.dataLayers  (#R164)
 * ----------------------------------------------------------------------------
 *  The big layers IIFE: layer i18n strings, the ~50 regular data layers (Köppen, weather, wind,
 *  sea level, choropleths, night lights, …), their legends, the layer-panel organisation, per-layer
 *  opacity, dated-layer refresh and the self-healing layer audit (window.IntMapLayerAudit).
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, countryGeo -> HOST.countryGeo, unitMode -> HOST.unitMode, mapTooltipEl -> HOST.mapTooltipEl
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
/* ── (#R186) THE DATA LAYERS THAT ARE ON BEFORE ANYONE TOUCHES ANYTHING ──────────────────────────
   「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。」
   Three readers need this list and they must not disagree, so it is stated once, here, above the
   factory that builds the rows:
     · the row builder below marks these checkboxes `checked`;
     · js/app-body.js dispatches their `change` once the style can accept layers — a checked box on
       its own paints nothing, which is the mistake #R34 already recorded for the Place-names toggle;
     · the session restore in js/app-body.js switches one back OFF when the saved snapshot says the
       user had switched it off, so "default on" never means "cannot be turned off".
   Ids, not layer keys, because that is what all three readers hold. */
window.IntMapDefaultLayers=['dl-climate','dl-subcables'];
/* ══ ⚠⚠ (#R225) THE BASE TOGGLES SHIP `checked` AND THE RESTORE NEVER TURNED THEM BACK OFF ══════════
   「base map & labelsも勝手に全部オンになる」 — and it was structural, not a glitch. index.html ships
   `cb-names / cb-geolabels / cb-poi / cb-borders / cb-admin1 / cb-roads / cb-rail2` CHECKED. The session
   snapshot records the boxes that are ticked, and js/session-tabs.js's restore turns ON everything in
   that list but only turns OFF the ids in `IntMapDefaultLayers` — which is Köppen and the cables.
   So a base toggle the reader switched off was saved correctly as «absent» and then, on the next load,
   was left at its HTML default: ON. Every reload undid the choice, for ever.
   ⚠ THE LIST HAS TO BE ONE LIST. #R186's rule is «absent means the user switched it off» and it has to
   hold for every DEFAULT-ON id, not for the two that happened to be thematic. `IntMapDefaultLayers`
   keeps its old meaning (the thematic layers the app switches on for a first-time reader, and the ones
   `imAutoOff` protects); `IntMapDefaultOn` is that set PLUS the base toggles the HTML ticks, and it is
   what the restore's off-sweep reads. Adding a default-on row means adding it here, once. */
window.IntMapDefaultOn=['cb-names','cb-geolabels','cb-poi','cb-borders','cb-admin1','cb-roads','cb-rail2']
  .concat(window.IntMapDefaultLayers);
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.dataLayers=function(HOST){
  const LDL=window.IntMapLang.pick(()=>HOST.lang);
  /* (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. */
  const LA=window.IntMapLang.pickArgs();
  /* (#R178) "have I already wired this hover / click?" — module state, not renderer state. These three
     were properties hung on the map object itself (map.__choroHover / __natoHover / __euHover), which
     is both invisible to anyone reading this file and something no other engine would carry. */
  const _hoverWired={}; let _natoHoverWired=false, _euHoverWired=false;
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const _collapseGroup=HOST._collapseGroup, _imTouchPrimary=HOST._imTouchPrimary, addCountryLayers=HOST.addCountryLayers, cName=HOST.cName, convTempText=HOST.convTempText, countryStats=HOST.countryStats, ensureMapTooltip=HOST.ensureMapTooltip, ensureTerrainSource=HOST.ensureTerrainSource, escapeHtml=HOST.escapeHtml, fmtPc=HOST.fmtPc, fmtTemp=HOST.fmtTemp, i18n=HOST.i18n, imToast=HOST.imToast, isMobile=HOST.isMobile, loadCountryData=HOST.loadCountryData, positionTooltip=HOST.positionTooltip, renderCoordReadout=HOST.renderCoordReadout, satToast=HOST.satToast, t=HOST.t;
  (function(){
    if(!GE().hasRenderer()) return;


    /* (#R12) New layer-category labels for the re-organized panel. */


/* (#R40) Spanish layer-group names */
    /* (#R41) Russian layer-group names were MISSING entirely → group headers showed English in RU. */

    /* ══ (#R202) A GROUP CALLED WHAT IT IS ═══════════════════════════════════════════════════════
       「いや今衛星レイヤーなんてないわ」— it was there, and it was filed under 「海洋・船舶」 (Oceans &
       maritime), because #R184 put it beside the live-aircraft layer to say the two are built the
       same way. That is a fact about the CODE, and nobody looking for satellites opens Oceans. A
       layer nobody can find is a layer that does not exist, which is exactly what the report said. */






    /* ⚠ (#R219) THE FOUR TRANSLATIONS WERE WRITTEN INTO THE ENGLISH OBJECT, ONE AFTER ANOTHER.
       One key repeated five times inside one object literal — English, Japanese, German, Russian and
       Spanish, all written into `i18n.en` — is a LEGAL object whose fifth value wins, so
       `i18n.en.lyrOceanCur` was Spanish. And because
       the other four languages never got the key at all, every language fell back to `en` and the
       「海流」 layer row read «Corrientes oceánicas» in all five. One key per language object.
       ⚠ (#R224) The key itself is gone with the row it labelled (see the note by the row list); the
       rule it is here to state is not, and every `Object.assign` around it still obeys it. */

    /* (#R32) German for the layer panel + theme names + sections so DE isn't just the top chrome ("細部までドイツ語対応"). */

    /* (#R33) German country-stat + common labels so the country panel/stats aren't English in DE mode. */

    /* (#R36) Complete the German dictionary so every t()-driven dynamic surface (measure/area/radius tool,
       community, satellite controller, AI features, context menu, sources/premium modals, etc.) renders in
       German instead of falling back to English — closes the visible EN-leak in DE mode. */


    const style=document.createElement('style');
    style.textContent=`
      .lyr-row{ display:flex; flex-direction:column; gap:2px; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
      .lyr-op{ width:100%; accent-color:var(--primary-color); display:none; margin:0 0 4px 24px; }
      .lyr-row.on .lyr-op{ display:block; }
      /* (#R128) NORMAL / desktop category heading. It was 12.5px muted — SMALLER and grayer than its own 13px
         layer rows, so a section title read as a de-emphasised sub-item ("分類名のテキストサイズが小さい・余白に
         合ってない・UIとしておかしい"). Make it a real heading: clearly larger than the rows (15.5px vs 13px),
         bold, full text color, with a top margin that gives each group visible breathing room. Mirrors the mobile
         sheet's 18.5px-over-15.5px step (R127). */
      .lyr-head{ font-size:15.5px; font-weight:700; color:var(--text-main); margin:14px 2px 6px; text-transform:none; letter-spacing:-0.01em; }
      /* (#R15 / #26) "Others (beta)" group note */
      .lyr-others-note{ font-size:10.5px; color:var(--text-muted); opacity:0.8; margin:0 2px 4px; line-height:1.4; font-style:italic; }
      /* (#R8c) Desktop Köppen legend: FULL-HEIGHT by default (no scroll — all ~30 classes fit), and the
         ONLY legend that is resizable like a desktop window — vertical-only via the native resize grabber
         (CSS resize:vertical). Anchored to the top with an explicit height so the grabber actually resizes. */
      /* (#R9/#24) The legend box itself no longer scrolls — only the inner .kl-scroll does — so the title,
         the ⋮⋮ drag handle and the min/close buttons (all anchored to this non-scrolling box) stay pinned
         at the top while the climate rows scroll under them. */
      /* (#R10) Flex column (shown via inline display:flex): header (h4) pinned top, .kl-scroll flexes +
         scrolls, footer (opacity slider + hint) pinned bottom — so the opacity slider & minimize button
         are never clipped (the old overflow-hidden + max-height combo clipped them). */
      /* (#R13c) Width is LOCKED (min=max=216) so the native resize grabber can only change HEIGHT — the
         user reported the legend "stretching left-right"; vertical-only resize is the requested behavior. */
      /* (#R145) COMPACT legends: tighter padding/width/font. (#R146) but the 56dvh cap meant the vertical-resize grabber
         couldn't be dragged tall enough to reveal all 30 Köppen classes ("長く伸ばせられない") — restore the near-full-viewport
         ceiling so the legend can be stretched long again; height stays auto (fits content) with a comfortable default. */
      .koppen-legend{ box-sizing:border-box; display:none; flex-direction:column; position:absolute; top:74px; bottom:auto; left:24px; right:auto; z-index:1100; background:var(--popup-bg); border:1px solid rgba(128,128,128,0.15); border-radius:11px; padding:7px 10px; box-shadow:var(--shadow); backdrop-filter:blur(15px); height:auto; min-height:150px; max-height:calc(100dvh - 84px); overflow:hidden; resize:vertical; width:220px; min-width:180px; max-width:460px; font-size:10.4px; }   /* (#R155) box-sizing:border-box is load-bearing — the width _fitKoppenLegend sets now INCLUDES the 20px padding + 2px border, so the panel really hugs the text (the old content-box math under-counted them → "テキスト以上に横幅伸ばして…行の幅変わってない" dead space). max-width raised 340→460 so the longest German/Russian names are no longer clipped ("行の幅が狭すぎる"). width:220 is the pre-JS fallback. */
      .koppen-legend .kl-scroll{ overflow-y:auto; flex:1 1 auto; min-height:0; margin-top:1px; scrollbar-gutter:stable; }   /* (#R151) reserve the scrollbar gutter ALWAYS so climate-name rows keep a constant width while the legend is resized ("気候名の行幅が勝手に動かないように") — the appearing/disappearing scrollbar was stealing ~15px and reflowing the row text */
      /* (#R15 / #37) Make the vertical-resize grabber VISIBLE so users discover it — the user reported the
         resize "isn't implemented", but it was: the native grabber was just painted transparent. Now it
         shows a small diagonal grip at the bottom-right, matching the resize:vertical affordance. */
      .koppen-legend::-webkit-resizer{ background:linear-gradient(135deg, transparent 0 44%, var(--text-muted) 44% 52%, transparent 52% 68%, var(--text-muted) 68% 76%, transparent 76%); }
      .koppen-legend.legend-collapsed{ resize:none !important; }
      .koppen-legend h4{ margin:0 0 2px; font-size:11px; padding-right:18px; } .koppen-legend .kl-hint{ color:var(--text-muted); margin-top:2px; font-size:9px; line-height:1.35; }   /* (#R149/#R152) compact chrome so all 30 zones fit */
      .kl-period{ display:flex; align-items:center; gap:6px; margin:0 0 3px; }
      .kl-period label{ font-size:11px; color:var(--text-muted); }
      .kl-period select{ flex:1; background:var(--input-bg); color:var(--text-main); border:1px solid var(--glass-border,rgba(128,128,128,0.25)); border-radius:6px; padding:3px 6px; font-size:11.5px; cursor:pointer; }
      .legend-collapsed .kl-period{ display:none !important; }
      .kl-item{ display:flex; align-items:center; gap:6px; padding:0 4px; cursor:pointer; border-radius:5px; white-space:nowrap; line-height:1.2; }   /* (#R152) white-space:nowrap = ONE line per zone (was wrapping to 2 for the 14 long names → doubled the legend height); the code stays fixed, only the name ellipsises. (#R153) vertical padding 0.5px→0 + line-height 1.25→1.2 shaves ~35px off the 30-row block so the whole legend clears a 1366×768 laptop and the LAST zone (EF) is reachable by stretching. */
      .kl-item .kl-code{ flex-shrink:0; font-weight:600; }   /* (#R152) climate code always fully visible — it is the canonical identifier, so ellipsising the name never loses which zone a row is */
      .kl-item .kl-nm{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); }   /* (#R152) name ellipsises on one line (full text on hover via title=) so rows stay 14px and 30 zones fit the screen */
      .kl-item:hover{ background:var(--input-bg); } .kl-item.sel{ font-weight:700; background:var(--input-bg); outline:2px solid var(--primary-color); } .kl-item.sel .kl-nm{ color:var(--text-main); }
      .kl-sw{ width:11px; height:11px; border-radius:3px; flex-shrink:0; border:1px solid rgba(0,0,0,0.2); }
      .kl-clear{ width:100%; margin-top:6px; padding:5px; background:var(--input-bg); color:var(--text-main); border:none; border-radius:7px; cursor:pointer; font-size:10.5px; font-weight:600; }
      .kl-clear:hover{ background:var(--primary-color); color:#fff; }
      .layer-popup-x{ position:absolute; top:6px; right:8px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:4px 6px; border-radius:6px; line-height:1; }
      .layer-popup-x:hover{ background:var(--input-bg); color:var(--info-mil); }
      /* Generic color-scale legend (HDI/Dem/Pop/NATO) */
      .data-legend{ display:none; position:absolute; left:24px; right:auto; z-index:1100; background:var(--popup-bg); border:1px solid rgba(128,128,128,0.15); border-radius:11px; padding:8px 10px; box-shadow:var(--shadow); backdrop-filter:blur(15px); width:178px; font-size:10.5px; }
      .data-legend h4{ margin:0 0 5px; font-size:11px; padding-right:18px; }
      .data-legend .dl-bar{ height:8px; border-radius:4px; margin:4px 0 3px; border:1px solid rgba(0,0,0,0.1); }
      .data-legend .dl-scale{ display:flex; justify-content:space-between; color:var(--text-muted); font-size:9.5px; }
      .data-legend .dl-hint{ color:var(--text-muted); margin-top:5px; font-size:9.5px; }
      /* (#R39) Short "what is this data" explanation for the non-obvious metrics. */
      .data-legend .dl-desc{ color:var(--text-main); opacity:0.82; margin-top:5px; font-size:9.5px; line-height:1.45; border-top:1px solid var(--glass-border,rgba(128,128,128,0.16)); padding-top:5px; }
      /* ══ (#R276) THE NUMERIC WEATHER LEGEND AND ITS FORECAST PLAYER ═══════════════════════════
         Sized from the SAME declarations the rest of the legend uses (10.5px body, 9.5px hints) — a
         panel whose inner controls are twice the size of the legend beside it is #R275's report. */
      .data-legend .ecl-model{ color:var(--text-muted); font-size:9.5px; line-height:1.35; margin:0 0 5px; }
      .data-legend .ecl-player{ display:flex; gap:3px; justify-content:center; margin:5px 0 3px; }
      .data-legend .ecl-b, .data-legend .rv-b{ flex:0 0 auto; min-width:22px; height:20px; padding:0 4px; font-size:10.5px; line-height:1; border:1px solid var(--glass-border,rgba(128,128,128,0.2)); border-radius:6px; background:var(--input-bg); color:var(--text-main); cursor:pointer; }
      .data-legend .ecl-b:hover, .data-legend .rv-b:hover{ background:var(--primary-color); color:#fff; border-color:transparent; }
      .data-legend .ecl-b.ecl-play{ background:var(--primary-color); color:#fff; border-color:transparent; }
      .data-legend .ecl-b.ecl-now{ min-width:auto; padding:0 7px; font-size:9.5px; font-weight:600; }
      .data-legend .ecl-b svg{ display:block; margin:0 auto; }
      .data-legend .ecl-items{ margin-top:6px; }
      .data-legend .ecl-item{ border-top:1px solid var(--glass-border,rgba(128,128,128,0.16)); padding-top:5px; margin-top:5px; }
      .data-legend .ecl-item:first-child{ border-top:none; padding-top:0; margin-top:0; }
      .data-legend .ecl-name{ font-weight:600; font-size:10.5px; line-height:1.25; }
      .data-legend .ecl-unit, .data-legend .ecl-unitline{ color:var(--text-muted); font-weight:400; }
      .data-legend .ecl-unitline{ font-size:9.5px; margin-top:1px; }
      .data-legend .ecl-bar{ height:8px; border-radius:4px; margin:4px 0 1px; border:1px solid rgba(0,0,0,0.1); }
      .data-legend .ecl-ticks{ position:relative; height:11px; color:var(--text-muted); font-size:9px; }
      .data-legend .ecl-ticks span{ position:absolute; transform:translateX(-50%); white-space:nowrap; }
      .data-legend .ecl-ticks span:first-child{ transform:none; } .data-legend .ecl-ticks span:last-child{ transform:translateX(-100%); }
      .data-legend .ecl-desc{ color:var(--text-main); opacity:0.8; margin-top:3px; font-size:9.5px; line-height:1.4; }
      /* (#R288) each weather legend states WHICH INSTANT its picture is of, and the line opens the
         one shared time control rather than carrying a second copy of it. */
      /* (#R290) 「いつの絵か」 is a READING now, not a button — the hour is chosen in this same box
         (window.IntMapWxPlayer.timeUI) rather than in a control somewhere else. */
      .data-legend .ecl-when{ display:block; width:100%; margin-top:5px; padding:4px 6px; border:1px solid var(--glass-border,rgba(128,128,128,0.22)); border-radius:7px; background:var(--input-bg); color:var(--text-main); font-weight:600; font-size:9.5px; text-align:center; font-variant-numeric:tabular-nums; }
      .data-legend .ecl-timesel{ font-variant-numeric:tabular-nums; }
      .data-legend #ec-validtime, .data-legend #wind-validtime{ color:var(--text-main); font-weight:600; font-size:9.5px; margin-top:3px; text-align:center; }
      .data-legend .rv-player{ margin:5px 0 2px; }
      .data-legend .rv-btns{ display:flex; gap:3px; justify-content:center; margin-bottom:3px; }
      .data-legend .rv-when{ color:var(--text-main); font-weight:600; font-size:9.5px; margin-top:3px; text-align:center; font-variant-numeric:tabular-nums; }
      .legend-collapsed .ecl-items, .legend-collapsed .ecl-when, .legend-collapsed .ecl-player, .legend-collapsed .ecl-model, .legend-collapsed .ecl-one, .legend-collapsed .ecl-timebody, .legend-collapsed .rv-player, .legend-collapsed .wind-legend-body{ display:none !important; }
      /* #30 — balanced legend header controls: drag handle (top-left), minimize + close (top-right,
         same size, evenly spaced), and the title padded so it never collides with either side. */
      .koppen-legend h4, .data-legend h4{ padding:0 44px 0 18px !important; min-height:16px; display:flex; align-items:center; }
      /* (#R8b) Minimize/close icons are DRAWN as CSS shapes at EVERY width (desktop · tablet · phone) —
         NOT font glyphs. ▢ / – / × have different ink positions, so as glyphs they never quite line up;
         as identical centerd bars they are pixel-aligned at any DPR. (The earlier fix only covered ≤768px,
         leaving tablet/landscape-phone widths with the misaligned glyphs the user still saw.) */
      /* (#R8c) ONE shared declaration for the box, so close & min cannot diverge in top/size — only the
         horizontal offset differs. Verified on a live legend: both buttons share top and height exactly. */
      /* (#R9/#25) Center EVERY icon with transform:translate(-50%,-50%) — size-INDEPENDENT, so close (×),
         minimize (–) and collapsed (▢) share one pixel-exact center at any box size / DPR. This removes
         the last sub-pixel vertical drift between □ and × (the negative-margin centring rounded the 1.8px
         bar and the 12px square differently). Larger sizes below change ONLY width/height. */
      .data-legend .layer-popup-x, .koppen-legend .layer-popup-x, .legend-min{ position:absolute; top:6px; width:20px; height:20px; padding:0; font-size:0; border-radius:6px; line-height:0; box-sizing:border-box; }
      .data-legend .layer-popup-x, .koppen-legend .layer-popup-x{ right:6px; }
      .legend-min{ right:30px; }
      .data-legend .layer-popup-x::before, .data-legend .layer-popup-x::after,
      .koppen-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::after,
      .legend-min::before{ content:''; position:absolute; top:50%; left:50%; width:11px; height:1.8px; border-radius:2px; background:currentColor; transform:translate(-50%,-50%); }
      .data-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::before{ transform:translate(-50%,-50%) rotate(45deg); }
      .data-legend .layer-popup-x::after,  .koppen-legend .layer-popup-x::after{ transform:translate(-50%,-50%) rotate(-45deg); }
      .legend-collapsed .legend-min::before{ width:12px; height:12px; background:none; border:1.8px solid currentColor; border-radius:3px; transform:translate(-50%,-50%); }
      .data-legend .dl-drag, .koppen-legend .kl-drag{ top:8px; left:7px; font-size:12px; }
      /* Köppen criteria popup (#25) */
      .koppen-info-pop{ display:none; position:absolute; z-index:1300; width:236px; max-width:calc(100vw - 24px); background:var(--glass-fill); border:1px solid var(--glass-border); border-radius:12px; padding:12px 14px; box-shadow:var(--shadow); backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur)); -webkit-backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur)); font-size:12px; }
      .koppen-info-pop .kip-x{ position:absolute; top:6px; right:6px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; line-height:1; padding:4px 6px; border-radius:6px; }
      .koppen-info-pop .kip-x:hover{ background:var(--input-bg); }
      .koppen-info-pop .kip-h{ display:flex; align-items:center; gap:7px; font-weight:600; font-size:13px; padding-right:22px; margin-bottom:6px; }
      .koppen-info-pop ul{ margin:0; padding-left:16px; color:var(--text-muted); line-height:1.5; } .koppen-info-pop li{ margin:2px 0; }
      /* (#R8b) Phones just enlarge the same drawn icons to 30px tap targets with a clear gap; the SHAPES
         (centerd bars) come from the global rules above, so desktop & mobile are identical & aligned. */
      @media(max-width:768px){
        /* (#R18) ONE size for EVERY mobile ×/–: 32px. The R17 40px boxes made the legend buttons huge
           while the rest stayed small ("×の大きさがバラバラ。凡例はデカすぎる") and bloated the minimized
           legend. 32px is still a comfortable tap target and identical across legends, popups and panels. */
        .data-legend .layer-popup-x, .koppen-legend .layer-popup-x,
        .data-legend .legend-min, .koppen-legend .legend-min{ top:6px !important; width:27px !important; height:27px !important; border-radius:8px; background:rgba(128,128,128,0.16); }
        .data-legend .layer-popup-x, .koppen-legend .layer-popup-x{ right:6px !important; }
        .data-legend .legend-min, .koppen-legend .legend-min{ right:37px !important; }
        .data-legend .layer-popup-x::before, .data-legend .layer-popup-x::after,
        .koppen-legend .layer-popup-x::before, .koppen-legend .layer-popup-x::after,
        .legend-min::before{ width:15px; height:2.1px; }   /* transform:translate(-50%,-50%) keeps them centerd at any size */
        /* (#R23) match the LEGEND ×'s exact look (gray rounded box) on EVERY popup × so they read as the
           same UI ("ポップアップの×は凡例と同じUIに") — not just the same size. */
        .koppen-info-pop .kip-x, .pin-popup-close{ width:32px !important; height:32px !important; font-size:17px !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); top:6px !important; right:6px !important; }
        /* (#R24) tool-panel × (measure / radius / draw / LOS / route …) gets the SAME gray rounded box as
           the legend × so every popup close reads as one UI ("測定機能などの×も凡例と同じUIに"). */
        .tool-panel .tp-close{ width:32px !important; height:32px !important; font-size:17px; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); position:relative; top:0; right:0; }
        /* (#R19) The R18 32px unification covered legends/tool-panels but MISSED the other popups
           ("凡例はちょうどいいが、その他ポップアップは大きさが変わっていない"): the place-search result card,
           every MapLibre popup (place-label / pin / news), and the country info card. One 32px size for all. */
        .src-card-close{ width:32px !important; height:32px !important; font-size:17px !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); top:6px !important; right:6px !important; }
        .maplibregl-popup-close-button{ width:32px !important; height:32px !important; font-size:19px !important; line-height:1 !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16) !important; right:6px !important; top:6px !important; }
        /* (#R26 FIX) R25 added position:relative here, which OVERRODE the position:absolute these close
           buttons rely on for their top/right corner placement — so they jumped out of position and taps
           missed them entirely ("×を押しても反応しない"). Keep ONLY touch-action (kills the iOS click delay);
           never set position here (each button keeps its own absolute corner rule).
           NOTE: this whole CSS block is a JS template-literal string, so this comment must contain NO
           back-tick characters (one would close the string early and break the entire script). */
        .maplibregl-popup-close-button, .layer-popup-x, .legend-min, .kip-x, .pin-popup-close,
        .country-popup-close, #cp-close, .src-card-close, .tp-close, .satc-close, .wgt-x{
          touch-action:manipulation !important; }
        /* (#R20) the real close button is .country-popup-close / #cp-close — the R19 selectors
           (.cp-close as a CLASS, .country-close, #country-popup-close) matched nothing, which is why
           the country popup's × stayed tiny ("ポップアップの右上の×が小さすぎて押せない"). */
        .country-popup-close, #cp-close{ width:32px !important; height:32px !important; font-size:19px !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border-radius:9px; background:rgba(128,128,128,0.16); }
        .maplibregl-popup-content{ padding-right:40px; }
        /* (#R22) Catch-all so NO popup/panel × can stay tiny again — the satellite controller (was 26px)
           and every "Close" button get the same 32px tap target ("×が小さすぎて押せない" re-report). */
        .satc-close{ width:32px !important; height:32px !important; font-size:20px !important; display:flex !important; align-items:center; justify-content:center; }
        button[aria-label="Close"], .ai-panel-close, .ai-x, .nrp-close, .fb-x, #fb-x{ min-width:32px !important; min-height:32px !important; }
        /* (#R21) the last stragglers — widget board ×/⚙ and the widget-gallery × join the ONE 32px size */
        .wgt-x{ width:32px !important; height:32px !important; border-radius:9px !important; font-size:15px !important; }
        .wgt-cfg{ width:32px !important; height:32px !important; border-radius:16px !important; right:6px !important; }
        #wgt-g-close{ width:32px !important; height:32px !important; border-radius:9px !important; font-size:15px !important; }
        .legend-collapsed .legend-min::before{ width:12px; height:12px; }
        /* (#R35) Tool-panel (Measure/Draw) min+close get the SAME 32px tap target + box as the legends. */
        .tp-min-btn,.tp-close{ width:32px !important; height:32px !important; border-radius:9px; }
        .tp-min-btn::before{ width:15px; height:2.1px; }
        .tool-panel.tp-collapsed .tp-min-btn::before{ width:13px; height:13px; }
        .tp-close::before,.tp-close::after{ width:15px; height:2.1px; }
        /* Minimized legend: keep the header compact so the (now 32px) buttons don't dwarf the title. */
        .data-legend.legend-collapsed, .koppen-legend.legend-collapsed{ padding:6px 10px !important; min-width:150px; }
        .data-legend.legend-collapsed h4, .koppen-legend.legend-collapsed h4{ min-height:32px !important; display:flex; align-items:center; }
        .data-legend .layer-popup-x:active, .koppen-legend .layer-popup-x:active,
        .data-legend .legend-min:active, .koppen-legend .legend-min:active{ background:var(--input-bg); color:var(--text-main); }
        .data-legend .dl-drag, .koppen-legend .kl-drag{ top:10px !important; left:8px !important; font-size:13px !important; }
        .koppen-legend h4, .data-legend h4{ padding:0 78px 0 24px !important; min-height:32px !important; }
        /* (#R10) Mobile Köppen legend ≈ square (width ≈ height) and the climate rows slide inside it.
           ⚠ (#R240) …WHILE IT IS FLOATING OVER THE MAP. This rule is written at run time, so it lands
           after css/intmap.css and its !important width beat the dock's width:100% at equal
           specificity — measured on a phone, the docked legend came out 252 px inside a 390 px
           column, which is the 「画面の左右いっぱいをつかえ」 report from the other side. :not(.im-docked)
           is the whole fix: over the map it is still a 66 vw square, in the column it is the column.
           ⚠⚠ AND NO BACKTICK MAY APPEAR IN THIS COMMENT — it is inside a template literal, and one
           backtick here ends the CSS string and blanks the site. See [[intmap-template-literal-css-backtick]]. */
        .koppen-legend:not(.im-docked){ width:min(66vw,252px) !important; right:12px !important; height:auto !important; min-height:0 !important; max-height:min(72vw,330px) !important; resize:none !important; }
        .koppen-legend .kl-scroll{ max-height:none !important; }
      }`;
    document.head.appendChild(style);

    const mc=document.getElementById('map-container');
    const legend=document.createElement('div'); legend.className='koppen-legend'; legend.id='koppen-legend'; mc.appendChild(legend);
    /* Data legends for HDI / Democracy / Pop density / NATO / EEZ / Temperature — colored scale bars */
    /* (#R39) Short "what is this data" explanations for the NON-obvious metrics (well-known ones like
       population density / GDP are left without one, per "よく知られているもの以外は…説明を入れて"). 4-language. */
    const LEGEND_DESC={
      hdi:LA('Human Development Index — a 0–1 blend of life expectancy, schooling and income. Higher = more developed.','人間開発指数 — 平均寿命・教育・所得を0〜1で合成した指標。高いほど発展。','Index der menschlichen Entwicklung — 0–1 aus Lebenserwartung, Bildung und Einkommen. Höher = entwickelter.','Индекс человеческого развития — 0–1 из продолжительности жизни, образования и дохода. Выше = развитее.','Índice de Desarrollo Humano — 0–1 combinando esperanza de vida, educación e ingresos. Mayor = más desarrollado.'),
      dem:LA('EIU score (0–10) of elections, pluralism, civil liberties and governance. Higher = more democratic.','EIUによる選挙・多元性・自由・統治の評価（0〜10）。高いほど民主的。','EIU-Wert (0–10) für Wahlen, Pluralismus, Freiheiten und Regierungsführung. Höher = demokratischer.','Оценка EIU (0–10): выборы, плюрализм, свободы и управление. Выше = демократичнее.','Puntuación EIU (0–10) de elecciones, pluralismo, libertades y gobernanza. Mayor = más democrático.'),
      tfr:LA('Average number of children a woman would have over her lifetime; about 2.1 keeps a population stable.','女性が生涯に産む子どもの平均数。約2.1で人口が維持される。','Durchschnittliche Kinderzahl pro Frau; etwa 2,1 hält die Bevölkerung stabil.','Среднее число детей на женщину; около 2,1 удерживает население стабильным.','Número medio de hijos por mujer a lo largo de su vida; en torno a 2,1 mantiene estable la población.'),
      milSpendGDP:LA('Defense budget as a share of the country’s GDP — its military burden on the economy.','国防費が国のGDPに占める割合。経済における軍事負担。','Verteidigungsbudget als Anteil am BIP — die militärische Last für die Wirtschaft.','Военный бюджет как доля ВВП — военная нагрузка на экономику.','Presupuesto de defensa como porcentaje del PIB — la carga militar sobre la economía.'),
      aod:LA('Aerosol optical depth — how much haze, smoke and dust dim sunlight in the air column.','エアロゾル光学的厚さ — 大気中の霞・煙・砂塵が日射を遮る度合い。','Aerosol-optische Dicke — wie stark Dunst, Rauch und Staub das Sonnenlicht dämpfen.','Аэрозольная оптическая толщина — насколько дымка, дым и пыль ослабляют солнечный свет.','Profundidad óptica de aerosoles — cuánto atenúan la luz solar la calima, el humo y el polvo.'),
      nightsat:LA('Artificial light at night, from satellite — a proxy for urbanization and economic activity.','衛星が捉えた夜間の人工光 — 都市化や経済活動の代理指標。','Künstliches Licht bei Nacht (Satellit) — ein Indikator für Urbanisierung und Wirtschaft.','Искусственный свет ночью со спутника — индикатор урбанизации и экономики.','Luz artificial nocturna vista por satélite — indicador de urbanización y actividad económica.'),
      snow:LA('Snow and ice cover from satellite (NDSI index). Brighter = more snow/ice on the ground.','衛星による積雪・海氷（NDSI指数）。明るいほど積雪・氷が多い。','Schnee- und Eisbedeckung per Satellit (NDSI). Heller = mehr Schnee/Eis.','Снежный и ледяной покров со спутника (индекс NDSI). Ярче = больше снега/льда.','Cubierta de nieve y hielo por satélite (índice NDSI). Más brillante = más nieve/hielo.'),
      /* (#R40) explanations for more non-obvious metrics. Well-known ones (population, GDP, area,
         density) intentionally get none.
         ⚠ (#R248) They used to say 「en + jp; de/ru/es fall back to en」 and that is no longer true:
         every one of them now carries all five positional languages, and fr/ko/zh/zh-Hans answer
         from the inline table like every other call site. A comment that describes a gap outlives
         the gap unless the round that closes it edits the comment too. */
      eez:LA('Exclusive Economic Zone — the sea a country controls for fishing & resources, out to 200 nautical miles.','排他的経済水域 — 漁業・資源を管理できる海域（沿岸から200海里）。','Ausschließliche Wirtschaftszone — das Meer, das ein Staat für Fischerei und Rohstoffe kontrolliert, bis 200 Seemeilen.','Исключительная экономическая зона — море, которое государство контролирует для рыболовства и ресурсов, до 200 морских миль.','Zona económica exclusiva — el mar que un país controla para pesca y recursos, hasta 200 millas náuticas.'),
      sst:LA('Sea-surface temperature from satellite — the skin temperature of the ocean.','衛星による海面水温 — 海の表層の温度。','Meeresoberflächentemperatur per Satellit — die Hauttemperatur des Ozeans.','Температура поверхности моря со спутника — температура тонкого верхнего слоя океана.','Temperatura de la superficie del mar por satélite — la temperatura de la capa superficial del océano.'),
      popgrid:LA('People per km² on a fine 1 km grid (not country averages) — shows where people actually cluster.','1kmグリッドの人口密度（国平均ではない）— 実際に人が集まる場所がわかる。','Menschen pro km² auf einem feinen 1-km-Raster (keine Landesmittel) — zeigt, wo sich Menschen wirklich ballen.','Человек на км² в мелкой сетке 1 км (не средние по стране) — видно, где люди действительно скапливаются.','Personas por km² en una malla fina de 1 km (no promedios nacionales) — muestra dónde se concentra la gente.'),
      sealevel:LA('Projected coastline change if sea level rises by the chosen amount — areas below that height flood.','選んだ海面上昇量で浸水する沿岸域 — その標高以下が水没。','Voraussichtliche Küstenveränderung beim gewählten Meeresspiegelanstieg — Flächen unter dieser Höhe werden überflutet.','Прогноз изменения береговой линии при выбранном подъёме уровня моря — территории ниже этой высоты затапливаются.','Cambio previsto de la costa si el nivel del mar sube lo indicado — se inundan las zonas por debajo de esa altura.'),
      subcables:LA('Submarine fiber-optic cables carrying almost all intercontinental internet traffic.','大陸間インターネットの大半を担う海底光ファイバーケーブル。','Unterseeische Glasfaserkabel, die fast den gesamten interkontinentalen Internetverkehr tragen.','Подводные оптоволоконные кабели, несущие почти весь межконтинентальный интернет-трафик.','Cables submarinos de fibra óptica que transportan casi todo el tráfico de internet intercontinental.'),
      plates:LA('Boundaries of Earth’s tectonic plates — where most earthquakes and volcanoes occur.','地球のプレート境界 — 地震・火山の多くが起きる場所。','Grenzen der Erdplatten — dort treten die meisten Erdbeben und Vulkane auf.','Границы тектонических плит Земли — где происходит большинство землетрясений и извержений.','Límites de las placas tectónicas — donde ocurren la mayoría de terremotos y volcanes.'),
      ecoregions:LA('Distinct ecological regions (WWF/RESOLVE) grouping similar species, climate and habitat.','類似の生物・気候・生息環境でまとめた生態地域（WWF/RESOLVE）。','Abgegrenzte Ökoregionen (WWF/RESOLVE), die ähnliche Arten, Klima und Lebensräume zusammenfassen.','Отдельные экорегионы (WWF/RESOLVE), объединяющие схожие виды, климат и местообитания.','Ecorregiones diferenciadas (WWF/RESOLVE) que agrupan especies, clima y hábitats similares.'),
      worldcover:LA('ESA satellite land-cover classes (forest, cropland, built-up, water…) at 10 m resolution.','ESA衛星による土地被覆分類（森林・農地・市街地・水域など、10m解像度）。','ESA-Satelliten-Landbedeckungsklassen (Wald, Ackerland, Bebauung, Wasser …) mit 10 m Auflösung.','Классы земного покрова со спутников ESA (лес, пашня, застройка, вода…) с разрешением 10 м.','Clases de cobertura del suelo del satélite de la ESA (bosque, cultivo, urbano, agua…) a 10 m de resolución.'),
      aurora:LA('Modeled auroral oval — where the northern/southern lights are likely visible right now.','オーロラ帯のモデル — 今オーロラが見える可能性が高い場所。','Modelliertes Polarlichtoval — wo Nord-/Südlichter gerade sichtbar sein dürften.','Модельный авроральный овал — где сейчас вероятно видно полярное сияние.','Óvalo auroral modelado — dónde es probable ver ahora las auroras boreales o australes.'),
      thermal:LA('Satellite-detected heat sources in the last hours — mostly wildfires, also flares and volcanoes.','直近数時間に衛星が検知した熱源 — 主に山火事、ガスフレアや火山も。','Vom Satelliten in den letzten Stunden erkannte Wärmequellen — meist Waldbrände, auch Abfackelung und Vulkane.','Тепловые источники, обнаруженные спутником за последние часы — в основном пожары, а также факелы и вулканы.','Focos de calor detectados por satélite en las últimas horas — sobre todo incendios, también antorchas y volcanes.'),
      cpi:LA('Transparency International score (0–100) of perceived public-sector corruption. Higher = cleaner.','トランスペアレンシーによる公的部門の汚職体感指数（0〜100）。高いほど清廉。','Wert von Transparency International (0–100) für wahrgenommene Korruption im öffentlichen Sektor. Höher = sauberer.','Индекс Transparency International (0–100) восприятия коррупции в госсекторе. Выше = чище.','Puntuación de Transparency International (0–100) de corrupción percibida en el sector público. Mayor = más limpio.'),
      wbco2:LA('Carbon-dioxide emissions — the country total in megatonnes a year, or the same series divided by population; switch between the two in this legend.','年間のCO₂排出量。国全体の総量（百万t）と、それを人口で割った国民1人当たり（t）を、この凡例で切り替えられます。','Kohlendioxid-Ausstoß — die Landessumme in Megatonnen pro Jahr oder dieselbe Reihe pro Kopf; in dieser Legende umschaltbar.','Выбросы углекислого газа — итог по стране в мегатоннах в год либо тот же ряд на душу населения; переключается в этой легенде.','Emisiones de dióxido de carbono — el total del país en megatoneladas al año, o la misma serie por persona; se alterna en esta leyenda.'),
      wbgini:LA('Gini index of income inequality (0 = perfectly equal, 100 = maximally unequal).','所得格差のジニ指数（0=完全平等、100=最大格差）。','Gini-Index der Einkommensungleichheit (0 = völlig gleich, 100 = maximal ungleich).','Индекс Джини неравенства доходов (0 = полное равенство, 100 = максимальное неравенство).','Índice de Gini de desigualdad de ingresos (0 = igualdad total, 100 = desigualdad máxima).'),
      wbpov:LA('Share of people living on less than ~$2.15 a day (extreme poverty).','1日約2.15ドル未満で暮らす人の割合（極度の貧困）。','Anteil der Menschen, die von weniger als etwa 2,15 $ am Tag leben (extreme Armut).','Доля людей, живущих менее чем на ~2,15 $ в день (крайняя бедность).','Proporción de personas que viven con menos de ~2,15 $ al día (pobreza extrema).'),
      wbinfmort:LA('Infant deaths before age 1 per 1,000 live births — a core health/development indicator.','出生1000人当たりの満1歳未満の死亡数 — 基本的な保健・開発指標。','Säuglingssterblichkeit vor dem 1. Lebensjahr je 1.000 Lebendgeburten — ein zentraler Gesundheits- und Entwicklungsindikator.','Смертность детей до 1 года на 1000 живорождений — ключевой показатель здравоохранения и развития.','Muertes de menores de 1 año por cada 1.000 nacidos vivos — un indicador central de salud y desarrollo.'),
      wbu5mort:LA('Deaths before age 5 per 1,000 live births.','出生1000人当たりの5歳未満死亡数。','Todesfälle vor dem 5. Lebensjahr je 1.000 Lebendgeburten.','Смертность детей до 5 лет на 1000 живорождений.','Muertes de menores de 5 años por cada 1.000 nacidos vivos.'),
      wbgdpgrow:LA('Year-on-year real GDP growth (%) — how fast the economy is expanding or contracting.','実質GDPの前年比成長率（％）。','Reales BIP-Wachstum im Jahresvergleich (%) — wie schnell die Wirtschaft wächst oder schrumpft.','Реальный рост ВВП год к году (%) — насколько быстро растёт или сокращается экономика.','Crecimiento real del PIB interanual (%) — a qué ritmo se expande o contrae la economía.'),
      wbinfl:LA('Annual consumer-price inflation (%) — how fast prices are rising.','消費者物価の年間インフレ率（％）。','Jährliche Verbraucherpreisinflation (%) — wie schnell die Preise steigen.','Годовая инфляция потребительских цен (%) — насколько быстро растут цены.','Inflación anual de precios al consumo (%) — a qué ritmo suben los precios.'),
      wbrenew:LA('Share of final energy from renewable sources (hydro, wind, solar, biomass…).','最終エネルギーに占める再生可能エネルギー（水力・風力・太陽光・バイオなど）の割合。','Anteil erneuerbarer Quellen (Wasser, Wind, Sonne, Biomasse …) am Endenergieverbrauch.','Доля возобновляемых источников (гидро, ветер, солнце, биомасса…) в конечном потреблении энергии.','Proporción de energía final procedente de fuentes renovables (hidráulica, eólica, solar, biomasa…).'),
      wbphys:LA('Physicians per 1,000 people — a measure of healthcare capacity.','人口1000人当たりの医師数 — 医療提供力の指標。','Ärztinnen und Ärzte je 1.000 Einwohner — ein Maß für die Kapazität des Gesundheitswesens.','Врачей на 1000 человек — мера возможностей системы здравоохранения.','Médicos por cada 1.000 habitantes — una medida de la capacidad sanitaria.'),
      wbwater:LA('Share of people with safely managed drinking water.','安全に管理された飲料水を利用できる人の割合。','Anteil der Menschen mit sicher verwaltetem Trinkwasser.','Доля людей с безопасно организованным питьевым водоснабжением.','Proporción de personas con agua potable gestionada de forma segura.'),
      wbagri:LA('Share of land used for agriculture (crops + pasture).','農業（耕地＋牧草地）に使われる土地の割合。','Anteil der landwirtschaftlich genutzten Fläche (Acker + Weide).','Доля земель, используемых в сельском хозяйстве (пашня + пастбища).','Proporción de tierra dedicada a la agricultura (cultivos + pastos).'),
      milSpend:LA('Total annual defense budget in US$ billions.','年間の国防費総額（10億米ドル）。','Gesamtes jährliches Verteidigungsbudget in Milliarden US-Dollar.','Общий годовой оборонный бюджет в миллиардах долларов США.','Presupuesto anual total de defensa en miles de millones de dólares.'),
      /* (#R41) new layers */
      tz:LA('Standard time-zone boundaries (Natural Earth) with each zone’s current local time, updated every minute.','標準時タイムゾーンの境界（Natural Earth）。各ゾーンの現在時刻を毎分更新して表示。','Standard-Zeitzonengrenzen (Natural Earth) mit der aktuellen Ortszeit je Zone, jede Minute aktualisiert.','Границы часовых поясов (Natural Earth) с текущим местным временем каждой зоны, обновление каждую минуту.','Límites de husos horarios (Natural Earth) con la hora local actual de cada zona, actualizada cada minuto.'),
      webcams:LA('Public webcams worldwide, loaded live from OpenStreetMap for the current view — pan/zoom for more. Click a point: YouTube/image/panorama cams play in the popup, others open the operator page.','世界中の公開ウェブカメラを、表示範囲に応じてOpenStreetMapからライブ取得（移動・拡大で追加読み込み）。点をクリックするとYouTube・画像・パノラマはその場で再生、その他は提供元ページを開きます。','Öffentliche Webcams weltweit, live aus OpenStreetMap für den aktuellen Ausschnitt geladen — zum Laden verschieben/zoomen. Punkt anklicken: YouTube/Bild/Panorama spielen im Popup, andere öffnen die Betreiberseite.','Общедоступные веб-камеры по всему миру, подгружаются вживую из OpenStreetMap для текущего вида — двигайте/масштабируйте. Нажмите точку: YouTube/изображение/панорама — в окне, прочие — на сайте оператора.','Cámaras web públicas de todo el mundo, cargadas en vivo desde OpenStreetMap para la vista actual — desplaza/amplía. Haz clic en un punto: YouTube/imagen/panorámica se reproducen en la ventana, las demás abren la página del operador.')
    };
    /* ⚠⚠⚠ (#R248) THE FOURTEENTH SHAPE — this read `d[HOST.lang==='jp'?1:…==='es'?4:0]||d[0]`, a
       language→POSITION map written as an EXPRESSION, so scripts/i18n-langmap-audit.mjs (which wants
       an object whose values are numbers) counted none of it. The last arm is `0`, so every layer's
       legend description was ENGLISH in fr / ko / zh / zh-Hans however complete the locale file was
       — there is no inline-table fallback down this path. `LDL.arr()` IS `pick()` applied to the
       array, which is the one rule the rest of the app resolves by. */
    function _legendDesc(id){ const d=LEGEND_DESC[id]; if(!d||!d[0]) return ''; return '<div class="dl-desc">'+LDL.arr(d)+'</div>'; }
    window._legendDescHTML=_legendDesc;
    function makeLegend(id,bottomPx,title,gradient,labels,hint){
      const el=document.createElement('div'); el.className='data-legend'; el.id='data-legend-'+id;
      el.style.bottom=bottomPx+'px';
      const noData=(['hdi','dem','pop','gdppc','tfr','milSpend','milSpendGDP'].includes(id))?`<div style="display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10px;color:var(--text-muted);"><span style="display:inline-block;width:14px;height:10px;border-radius:3px;background:#9aa0a6;border:1px solid rgba(0,0,0,0.12);"></span>${window.IntMapLang.t(HOST.lang,'No data','データなし','Keine Daten','Нет данных','Sin datos')}</div>`:'';
      el.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="${id}" title="${t('close')}">×</button><h4>${title}</h4><div class="dl-bar" style="background:${gradient};"></div><div class="dl-scale"><span>${labels[0]}</span><span>${labels[1]}</span></div>${noData}${hint?`<div class="dl-hint">${hint}</div>`:''}${_legendDesc(id)}`;
      mc.appendChild(el);
      el.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
      /* Drag (mouse + touch) is wired centrally by wireDrag() once it is defined below, so every
         data-legend behaves like the Köppen legend and stays movable on phones too (#10). */
      return el;
    }
    /* ══ ⚠⚠⚠ (#R270) A YEAR SELECTOR ON THE LAYER, DRIVING THE ONE CLOCK ══════════════════════════
       「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」 (re-sent for the
         third time; confirmed: 各レイヤー個別に年セレクタを付ける.)

       #R268's audit answered this with three buckets and put six layers in the bucket 「既にマスター
       クロックで変えられる」 — 1人当たりGDP・合計特殊出生率・人口密度・平均寿命・国防費・HDI. That is
       true of the DATA and it was not true of the READER: nothing on those layers says a year can be
       changed at all, and the control that changes it is a button called 「過去の世界を見る」 on the
       other side of the screen. Meanwhile the World-Bank choropleths (#R266), the GIBS rasters
       (#R268), Köppen, land cover, night lights, annual precipitation and the US elections all carry
       a year picker in their own legend. Same question, two answers, depending on which layer you
       happened to open.

       ⚠ IT IS THE SAME CLOCK, NOT A SECOND ONE. The standing rule is one master clock
       (window.IntMapTime, #R94); a per-layer year that kept its own state would be exactly the
       「2つの時計」 #R265 and #R267 each had to remove. This row READS `IntMapTime` and WRITES
       `IntMapTime`, and it subscribes so that moving the time machine moves every one of these
       selectors with it. The hint under it says so, because a control that silently moves the whole
       app is worse than one that says it does.
       ⚠ ONE BUILDER, exported, because js/world-packs.js needs the identical row on trade, energy
       and crops — #R239's lesson is a thing implemented twice and fixed once. */
    let _syncYearHints=null;     /* (#R270) set by buildCoreLegends; called by _imReapplyChoros */
    function legendClockYear(el,opts){ if(!el) return null; opts=opts||{};
      /* ⚠ the newest selectable year is LAST year: `IntMapTime.setYear(y)` treats the current year
         as live (it is), so offering it would put two options on the list meaning 「現在」. */
      const min=opts.min||1960, thisYear=new Date().getFullYear();
      const max=Math.min(opts.max||(thisYear-1),thisYear-1);
      let row=el.querySelector('.dl-clockrow');
      if(!row){ row=document.createElement('div'); row.className='dl-clockrow';
        row.style.cssText='display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--text-muted);';
        row.innerHTML='<span class="dl-clocklbl"></span><select class="dl-clockyear" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;"></select>';
        el.appendChild(row);
        row.querySelector('.dl-clockyear').addEventListener('change',(e)=>{
          const v=e.target.value;
          try{ if(v==='') window.IntMapTime.setNow({source:'layer-legend'});
               else window.IntMapTime.setYear(+v,{source:'layer-legend'}); }catch(_){} });
      }
      const nowTxt=window.IntMapLang.t(HOST.lang,'Now','現在','Jetzt','Сейчас','Ahora');
      row.querySelector('.dl-clocklbl').textContent=window.IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año');
      const sel=row.querySelector('.dl-clockyear');
      const sig=min+'-'+max;
      if(sel.getAttribute('data-built')!==sig||sel.getAttribute('data-lang')!==String(HOST.lang)){
        const ys=[]; for(let y=max;y>=min;y--) ys.push(y);
        sel.innerHTML='<option value="">'+escapeHtml(nowTxt)+'</option>'+ys.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
        sel.setAttribute('data-built',sig); sel.setAttribute('data-lang',String(HOST.lang)); }
      const sync=()=>{ let y=null; try{ y=window.IntMapTime.isLive()?null:window.IntMapTime.year(); }catch(_){}
        sel.value=(y!=null&&y>=min&&y<=max)?String(y):''; };
      sync();
      if(!row._imClockSub){ row._imClockSub=1; try{ window.IntMapTime.on(()=>sync()); }catch(_){} }
      return row; }
    try{ window._legendClockYear=legendClockYear; }catch(_){}
    /* (#R110) the core data-legends bake `currentLang` at construction, so a LANGUAGE CHANGE left already-shown
       legends in the old language ("言語設定を変更したとき、すでに表示済みのレイヤーの凡例はその言語に切り替わらない").
       Wrap their build in buildCoreLegends() so it can be re-run in the new language; the element refs are hoisted to
       `let` (tileLegends & co. reference them) and reassigned on each rebuild. Opacity / date / unit VALUES live in
       persistent JS state (opacities[], layerDates[], windUnit…), so they survive a rebuild. */
    const CORE_LEGEND_IDS=['hdi','dem','pop','nato','gdppc','tfr','milSpend','milSpendGDP','snow','aod','nightsat','eez','thermal','radar','sst','popgrid','relief','sealevel','wind'];
    let lgdHDI,lgdDem,lgdPop,lgdNATO,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdWind;
    function buildCoreLegends(){
      CORE_LEGEND_IDS.forEach(id=>{ const e=document.getElementById('data-legend-'+id); if(e) e.remove(); });   /* drop the old-language elements before rebuilding (no duplicate ids) */
    lgdHDI=makeLegend('hdi',140,(HOST.lang==='jp'?'HDI':'HDI'),'linear-gradient(to right,#a50026,#f46d43,#fee08b,#a6d96a,#1a9850)',['0.45','0.95'], window.IntMapLang.t(HOST.lang,'2022 UNDP','2022 国連UNDP','2022 UNDP','2022 ПРООН','2022 PNUD'));
    lgdDem=makeLegend('dem',140,(window.IntMapLang.t(HOST.lang,'Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice de democracia')),'linear-gradient(to right,#a50026,#f46d43,#fee08b,#74add1,#313695)',['1','10'], HOST.lang==='jp'?'2023 EIU':'2023 EIU');
    lgdPop=makeLegend('pop',140,(window.IntMapLang.t(HOST.lang,'Pop. density','人口密度','Bevölkerungsdichte','Плотность населения','Densidad de población')),'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)',['2','3000+'], HOST.lang==='jp'?'per km²':'per km²');
    lgdNATO=makeLegend('nato',140,'NATO',`linear-gradient(to right,#0a3d91,#1e63ff)`,[window.IntMapLang.t(HOST.lang,'Member','加盟国','Mitglied','Член','Miembro'),''],window.IntMapLang.t(HOST.lang,'32 members','32か国','32 Mitglieder','32 членов','32 miembros'));
    /* (#R15b / #38) Legends the value-scale layers were missing — choropleths (GDP pc, fertility, military
       spend $B & %GDP) and the snow / aerosol / night-lights rasters. They auto-gain an opacity slider via
       ensureLegendOpacity (their ids exist in `opacities`), moving that control onto the legend too. */
    lgdGdppc=makeLegend('gdppc',140,(window.IntMapLang.t(HOST.lang,'GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу населения','PIB per cápita')),'linear-gradient(to right,#fff7ec,#fee8c8,#fdbb84,#fc8d59,#e34a33,#7f0000)',['$1k','$90k+'], window.IntMapLang.t(HOST.lang,'USD, nominal','名目・米ドル','USD, nominal','долл. США, номинал','USD, nominal'));
    lgdTfr=makeLegend('tfr',140,(window.IntMapLang.t(HOST.lang,'Total fertility rate','合計特殊出生率','Geburtenrate (TFR)','Суммарный коэффициент рождаемости','Tasa de fecundidad total')),'linear-gradient(to right,#2c7fb8,#7fcdbb,#ffffb2,#fe9929,#cc4c02)',['1.0','6.5+'], window.IntMapLang.t(HOST.lang,'2022 World Bank','2022 世界銀行','2022 Weltbank','2022 Всемирный банк','2022 Banco Mundial'));
    lgdMil=makeLegend('milSpend',140,(window.IntMapLang.t(HOST.lang,'Mil. spending ($B)','国防費（$B）','Militärausgaben ($ Mrd.)','Военные расходы ($ млрд)','Gasto militar ($ mil M)')),'linear-gradient(to right,#fff7ec,#fdd49e,#fc8d59,#d7301f,#7f0000)',['$1B','$900B+'], 'SIPRI / IISS 2023');
    lgdMilGDP=makeLegend('milSpendGDP',140,(window.IntMapLang.t(HOST.lang,'Mil. spending (% GDP)','国防費（対GDP）','Militärausgaben (% BIP)','Военные расходы (% ВВП)','Gasto militar (% PIB)')),'linear-gradient(to right,#edf8fb,#b2e2e2,#66c2a4,#2ca25f,#006d2c)',['0.5%','6%+'], 'SIPRI / IISS 2023');
    /* ══ (#R270) …AND EACH OF THEM SAYS SO ══════════════════════════════════════════════════════════
       These six are the layers #R268 filed under 「既にマスタークロックで変えられる」. They are, and
       until now nothing on them said it: the year lives on the legend as well, as one control that
       moves the one clock (see legendClockYear). The floors are each source's own — the World Bank's
       annual series start in 1960 (js/time-countries.js WB_FLOOR), Maddison carries GDP and
       population back to 1900 which is `IntMapTime.min`, and HDI is exactly UNDP's 1990–2022. */
    try{
      const WBF=(window.IntMapTimeCountries&&window.IntMapTimeCountries.floor)||1960;
      const MAD=(window.IntMapTime&&window.IntMapTime.min)||1900;
      legendClockYear(lgdGdppc,{min:MAD});                    /* Maddison real GDP pc back to 1900 */
      legendClockYear(lgdPop,{min:MAD});                      /* population → density, same source */
      legendClockYear(lgdTfr,{min:WBF});
      legendClockYear(lgdMil,{min:WBF});
      legendClockYear(lgdMilGDP,{min:WBF});
      /* HDI's range is UNDP's own, and it is asked for rather than assumed */
      legendClockYear(lgdHDI,{min:1990,max:2022});
      if(window.IntMapTimeCountries&&window.IntMapTimeCountries.hdiLoad){
        window.IntMapTimeCountries.hdiLoad().then(()=>{ try{
          const ys=window.IntMapTimeCountries.hdiYears();
          if(ys&&ys.length) legendClockYear(lgdHDI,{min:ys[0],max:ys[ys.length-1]}); }catch(_){} }); }
      /* ⚠ (#R270) …AND THE SOURCE LINE MOVES WITH IT. These hints are dated — 「2022 UNDP」,
         「2022 世界銀行」, 「SIPRI / IISS 2023」 — and a year picker that leaves them saying 2022 while
         the map draws 2005 is a label lying about the picture, which is the whole class of defect
         #R266 was reported for. The HDI line names the year UNDP actually publishes for the chosen
         year (`hdiYear`, clamped at both ends by js/time-countries.js); the rest keep their own text
         and gain 「· <年>」 while the clock is in the past. */
      [[lgdHDI,'hdi'],[lgdGdppc,'gdppc'],[lgdPop,'pop'],[lgdTfr,'tfr'],[lgdMil,'mil'],[lgdMilGDP,'mil']].forEach(([el,kind])=>{
        if(!el) return; const h=el.querySelector('.dl-hint'); if(!h) return;
        if(!h.getAttribute('data-base')) h.setAttribute('data-base',h.textContent||'');
      });
      const syncHints=()=>{ try{
        let y=null; try{ y=window.IntMapTime.isLive()?null:window.IntMapTime.year(); }catch(_){}
        const undp=window._imHdiYear;
        [[lgdHDI,1],[lgdGdppc,0],[lgdPop,0],[lgdTfr,0],[lgdMil,0],[lgdMilGDP,0]].forEach(([el,isHdi])=>{
          if(!el) return; const h=el.querySelector('.dl-hint'); if(!h) return;
          const base=h.getAttribute('data-base')||'';
          if(isHdi){ const yy=(y==null)?2022:(undp||null);
            h.textContent=(yy==null)
              ?window.IntMapLang.t(HOST.lang,'UNDP publishes no HDI for this year','この年のHDIは UNDP が公表していません','UNDP veröffentlicht für dieses Jahr keinen HDI','ПРООН не публикует ИЧР за этот год','El PNUD no publica IDH para este año')
              :(yy+' UNDP'); return; }
          h.textContent=base+((y!=null)?(' · '+y):''); });
      }catch(_){} };
      syncHints();
      /* ⚠ (#R270) HOOKED TO THE REPAINT, NOT TO A TIMER. #R264's lesson: 「終わった時刻を推定するな、
         終わったと教えてくれるものに繋げ」. The overlay lands after loadCountryData, Maddison and the
         HDI file have all resolved — MEASURED at several seconds on a cold travel — so a
         `setTimeout(…,420)` after the clock event reads `_imHdiYear` before it is written and the
         line says 「この年のHDIは公表されていません」 about a year UNDP does publish. `_imReapplyChoros`
         is called by js/time-countries.js's `repaint()`, which runs AFTER the overlay; the clock
         subscription stays as the answer for the case where no choropleth is on. */
      _syncYearHints=syncHints;
      try{ window.IntMapTime.on(()=>{ setTimeout(syncHints,420); setTimeout(syncHints,2500); }); }catch(_){}
    }catch(_){}
    lgdSnow=makeLegend('snow',140,(window.IntMapLang.t(HOST.lang,'Snow & ice','積雪・海氷','Schnee & Eis','Снег и лёд','Nieve y hielo')),'linear-gradient(to right,#2a78b8,#7fb3d9,#cfe6f5,#ffffff)',[window.IntMapLang.t(HOST.lang,'Low','少','Wenig','Мало','Bajo'),window.IntMapLang.t(HOST.lang,'High','多','Viel','Много','Alto')], 'MODIS NDSI');
    lgdAod=makeLegend('aod',140,(window.IntMapLang.t(HOST.lang,'Aerosol / haze','エアロゾル / 煙霧','Aerosol / Dunst','Аэрозоль / дымка','Aerosol / bruma')),'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)',[window.IntMapLang.t(HOST.lang,'Clear','清浄','Klar','Чисто','Limpio'),window.IntMapLang.t(HOST.lang,'Hazy','濃い','Trüb','Мутно','Brumoso')], 'MODIS AOD');
    lgdNightsat=makeLegend('nightsat',140,(window.IntMapLang.t(HOST.lang,'Night lights','夜間光（衛星）','Nachtlichter','Ночные огни','Luces nocturnas')),'linear-gradient(to right,#05050f,#241a40,#7a5a1e,#ffd27f,#ffffff)',[window.IntMapLang.t(HOST.lang,'Dark','暗','Dunkel','Темно','Oscuro'),window.IntMapLang.t(HOST.lang,'Bright','明','Hell','Ярко','Brillante')], 'VIIRS Black Marble');
    /* EEZ legend — one row per boundary TYPE (kept distinct), swatches match the BRIGHT SLD colours in addEEZ */
    lgdEEZ=document.createElement('div'); lgdEEZ.className='data-legend'; lgdEEZ.id='data-legend-eez'; lgdEEZ.style.bottom='140px';
    /* (#R79g) restored per-type colour coding (flattening it to one colour was wrong) — but now each type is a
       BRIGHT line for visibility. Colours here MUST match EEZ_STYLE in addEEZ. */
    const EEZ_CATS=[
      {c:'#39FF6A',n:LA('EEZ — 200 NM','EEZ（200海里）','AWZ — 200 sm','ИЭЗ — 200 миль','ZEE — 200 mn')},
      {c:'#12E3D6',n:LA('Territorial sea — 12 NM','領海（12海里）','Küstenmeer — 12 sm','Терр. море — 12 миль','Mar territorial — 12 mn')},
      {c:'#4D8BFF',n:LA('Treaty boundary','条約による境界','Vertragsgrenze','Договорная граница','Límite por tratado')},
      {c:'#B6FF3A',n:LA('Median line','中間線','Mittellinie','Срединная линия','Línea media')},
      {c:'#FFC21A',n:LA('Court ruling','司法判断による境界','Gerichtsurteil','Судебное решение','Fallo judicial')},
      {c:'#FF9E3D',n:LA('Joint regime','共同管理水域','Gemeinsames Regime','Совместный режим','Régimen conjunto')},
      {c:'#E64DFF',n:LA('Unilateral claim (undisputed)','一方的主張（係争なし）','Einseitiger Anspruch','Односторонняя претензия','Reclamación unilateral')},
      {c:'#FF4D4D',d:1,n:LA('Unsettled / disputed','未確定・係争中','Ungeklärt / strittig','Не урегулировано / спор','Sin resolver / disputa')},
      {c:'#FF7A3D',d:1,n:LA('Unsettled median line','未確定の中間線','Ungeklärte Mittellinie','Неурег. срединная линия','Línea media sin resolver')},
      {c:'#E6ECF2',d:1,n:LA('Baselines (archipelagic / straight / normal)','基線（群島・直線・通常）','Basislinien','Исходные линии','Líneas de base')},
      {c:'#C8D0D8',n:LA('Connection line','接続線','Verbindungslinie','Соединительная линия','Línea de conexión')}
    ];
    const eezRows=EEZ_CATS.map(cat=>`<div style="display:flex;align-items:center;gap:8px;font-size:11px;padding:1.5px 0;"><span style="display:inline-block;width:26px;height:0;border-top:3px ${cat.d?'dashed':'solid'} ${cat.c};box-shadow:0 0 4px ${cat.c};flex-shrink:0;"></span><span>${LDL.arr(cat.n)}</span></div>`).join('');
    lgdEEZ.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="eez" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Maritime zones','海洋管轄区域','Meereszonen','Морские зоны','Zonas marítimas')}</h4>
      <div style="max-height:34vh; overflow-y:auto; margin:2px 0 4px; padding-right:2px;">${eezRows}</div>
      <div style="font-size:10px; color:var(--text-muted); line-height:1.5; margin-top:2px;">${window.IntMapLang.t(HOST.lang,'EEZ = Exclusive Economic Zone (to 200 nm). Line color = boundary type (bright colors for visibility); overlaps flag disputed claims.','EEZ＝排他的経済水域。沿岸国が漁業・海底資源を管轄（最大200海里）。境界の種類で色分け（視認性のため明るい配色）。重なりは領有権紛争の目安。','AWZ = Ausschließliche Wirtschaftszone (bis 200 sm). Linienfarbe = Grenztyp (helle Farben für bessere Sichtbarkeit); Überlappungen = Streitfälle.','ИЭЗ = исключительная экономическая зона (до 200 миль). Цвет линий — тип границы (яркие цвета для читаемости); наложения — споры.','ZEE = Zona Económica Exclusiva (hasta 200 mn). Color de línea = tipo de límite (colores vivos para visibilidad); solapamientos = disputas.')}</div>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'Source: MarineRegions WMS','出典: MarineRegions WMS','Quelle: MarineRegions WMS','Источник: MarineRegions WMS','Fuente: MarineRegions WMS')}</div>`;
    mc.appendChild(lgdEEZ);
    lgdEEZ.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-eez'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Thermal anomalies legend (fire/heat-signature pixels) */
    lgdThermal=document.createElement('div'); lgdThermal.className='data-legend'; lgdThermal.id='data-legend-thermal'; lgdThermal.style.bottom='140px';
    lgdThermal.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="thermal" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Thermal anomalies','熱異常(火災)','Thermische Anomalien','Тепловые аномалии','Anomalías térmicas')}</h4>
      <div style="display:flex; align-items:center; gap:8px; font-size:11px; padding:4px 0;"><span style="display:inline-block;width:14px;height:14px;background:#ff3b30;border-radius:50%;box-shadow:0 0 8px rgba(255,59,48,0.6);"></span> ${window.IntMapLang.t(HOST.lang,'Detected active fire / heat source','検知された火災・熱源','Erkannte Brände / Wärmequellen','Обнаруженные пожары / тепловые источники','Fuegos activos / fuentes de calor detectados')}</div>
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; margin:4px 0 2px; color:var(--text-muted);">${window.IntMapLang.t(HOST.lang,'Window','期間','Zeitfenster','Окно','Ventana')}: <select class="thermal-window" style="flex:1; padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"><option value="24" data-i18n="thermWin24">${t('thermWin24')}</option><option value="48" data-i18n="thermWin48">${t('thermWin48')}</option><option value="72" data-i18n="thermWin72">${t('thermWin72')}</option></select></label>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'NASA FIRMS · MODIS + VIIRS (real, near-real-time)','NASA FIRMS · MODIS + VIIRS（実データ・準リアルタイム）','NASA FIRMS · MODIS + VIIRS (echt, nahezu Echtzeit)','NASA FIRMS · MODIS + VIIRS (реальные данные, почти в реальном времени)','NASA FIRMS · MODIS + VIIRS (real, casi en tiempo real)')}</div>`;
    mc.appendChild(lgdThermal);
    lgdThermal.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-thermal'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    { const sw=lgdThermal.querySelector('.thermal-window'); if(sw){ sw.value=window._thermalWindow||'24'; sw.addEventListener('change',()=>{ window._thermalWindow=sw.value; if(window._refreshThermal) window._refreshThermal(); try{ window._refreshLegendDates&&window._refreshLegendDates(); }catch(_){} }); } }
    /* Precipitation-radar legend (RainViewer rain-rate scale) */
    lgdRadar=document.createElement('div'); lgdRadar.className='data-legend'; lgdRadar.id='data-legend-radar'; lgdRadar.style.bottom='140px';
    lgdRadar.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="radar" title="${t('close')}">×</button><h4>${t('lgdRadarTitle')||'Rain rate'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#9bd2ff,#0080ff,#00c800,#ffe000,#ff7800,#ff0000,#c800c8);"></div>
      <div class="dl-scale"><span>${window.IntMapLang.t(HOST.lang,'Light','弱い','Leicht','Слабый','Ligero')}</span><span>${window.IntMapLang.t(HOST.lang,'Heavy','激しい','Stark','Сильный','Fuerte')}</span></div>
      <div class="rv-player">
        <div class="rv-btns"><button class="rv-b" data-act="first" title="${window.IntMapLang.t(HOST.lang,'Oldest frame','最も古いフレーム','Ältester Frame','Самый старый кадр','Fotograma más antiguo')}">⏮</button><button class="rv-b" data-act="prev" title="${window.IntMapLang.t(HOST.lang,'Previous frame','前のフレーム','Vorheriger Frame','Предыдущий кадр','Fotograma anterior')}">◀</button><button class="rv-b" data-act="play" title="${window.IntMapLang.t(HOST.lang,'Animate','アニメーション','Animieren','Анимация','Animar')}">▶</button><button class="rv-b" data-act="next" title="${window.IntMapLang.t(HOST.lang,'Next frame','次のフレーム','Nächster Frame','Следующий кадр','Fotograma siguiente')}">▶</button><button class="rv-b" data-act="last" title="${window.IntMapLang.t(HOST.lang,'Latest frame','最新フレーム','Neuester Frame','Последний кадр','Último fotograma')}">⏭</button></div>
        <input type="range" id="rv-time" min="0" max="0" step="1" value="0" style="width:100%;accent-color:var(--primary-color);">
        <div class="rv-when">—</div>
      </div>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'RainViewer radar — the last two hours, 10 min apart','RainViewer レーダー — 直近2時間・10分間隔','RainViewer-Radar — die letzten zwei Stunden, 10-Minuten-Schritte','Радар RainViewer — последние два часа с шагом 10 мин','Radar RainViewer — las últimas dos horas, cada 10 min')}</div>`;
    mc.appendChild(lgdRadar);
    lgdRadar.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-radar'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    { const box=lgdRadar.querySelector('.rv-player');
      box.querySelectorAll('.rv-b').forEach(b=>{ b.onclick=()=>{ const P=window._rvPlayer; if(!P) return; const a=b.getAttribute('data-act');
        if(a==='play'){ P.play(!P.playing()); return; }
        P.play(false);
        if(a==='first') P.show(0); else if(a==='last') P.show(P.frames().length-1);
        else P.step(a==='prev'?-1:1); }; });
      const sl=box.querySelector('#rv-time'); if(sl) sl.oninput=()=>{ const P=window._rvPlayer; if(!P) return; P.play(false); P.show(+sl.value); }; }
    /* Sea-surface-temperature legend (GHRSST MUR L4) */
    lgdSST=document.createElement('div'); lgdSST.className='data-legend'; lgdSST.id='data-legend-sst'; lgdSST.style.bottom='140px';
    lgdSST.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="sst" title="${t('close')}">×</button><h4>${t('lgdSSTTitle')||'Sea-surface temp'}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#3a0088,#0033cc,#0099ff,#00e0c0,#7dff66,#ffe000,#ff7800,#e00000);"></div>
      <div class="dl-scale"><span>${fmtTemp(-2)}</span><span>${fmtTemp(32)}</span></div>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'GHRSST MUR L4 (oceans only)','GHRSST MUR L4（海域のみ）','GHRSST MUR L4 (nur Ozeane)','GHRSST MUR L4 (только океаны)','GHRSST MUR L4 (solo océanos)')}</div>`;
    mc.appendChild(lgdSST);
    lgdSST.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-sst'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Gridded population-density legend (NASA SEDAC GPW v4) */
    lgdPopGrid=document.createElement('div'); lgdPopGrid.className='data-legend'; lgdPopGrid.id='data-legend-popgrid'; lgdPopGrid.style.bottom='140px';
    lgdPopGrid.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="popgrid" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Pop. density (grid)','人口密度（グリッド）','Bevölkerungsdichte (Raster)','Плотность населения (сетка)','Densidad de población (malla)')}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#ffffd4,#fee391,#fec44f,#fe9929,#ec7014,#cc4c02,#8c2d04);"></div>
      <div class="dl-scale"><span>0</span><span>1000+ /km²</span></div>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'NASA SEDAC GPW v4 (2020, ~1 km). Real distribution, independent of borders.','NASA SEDAC GPW v4（2020・約1km）。国境に依存しない実分布。','NASA SEDAC GPW v4 (2020, ~1 km). Reale Verteilung, unabhängig von Grenzen.','NASA SEDAC GPW v4 (2020, ~1 км). Реальное распределение, независимое от границ.','NASA SEDAC GPW v4 (2020, ~1 km). Distribución real, independiente de fronteras.')}</div>`;
    mc.appendChild(lgdPopGrid);
    lgdPopGrid.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-popgrid'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Color-relief elevation legend (#5) */
    lgdRelief=document.createElement('div'); lgdRelief.className='data-legend'; lgdRelief.id='data-legend-relief'; lgdRelief.style.bottom='140px';
    lgdRelief.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="relief" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Elevation (color)','標高（カラー段彩）','Höhe (farbig)','Высота (цвет)','Elevación (color)')}</h4>
      <div class="dl-bar" style="background:linear-gradient(to right,#0b4f8a,#7fb3d9,#1a7a3c,#a6d96a,#e6e08b,#d9a066,#a87b52,#cdbfb4,#ffffff);"></div>
      <div class="dl-scale"><span>${window.IntMapLang.t(HOST.lang,'Deep sea','深海','Tiefsee','Глубоководье','Mar profundo')}</span><span>${window.IntMapLang.t(HOST.lang,'Peaks','高峰','Gipfel','Вершины','Cumbres')}</span></div>
      <div class="dl-hint">AWS Terrain (terrarium DEM)</div>`;
    mc.appendChild(lgdRelief);
    lgdRelief.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-relief'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Sea-level-rise legend (#24) */
    lgdSeaLevel=document.createElement('div'); lgdSeaLevel.className='data-legend'; lgdSeaLevel.id='data-legend-sealevel'; lgdSeaLevel.style.bottom='140px';
    const slL=window._seaLevelM||0;
    lgdSeaLevel.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="sealevel" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Sea-level change','海面変動','Meeresspiegel-Änderung','Изменение уровня моря','Cambio del nivel del mar')}</h4>
      <div style="display:flex; align-items:center; gap:8px; font-size:11px; padding:4px 0;"><span style="display:inline-block;width:16px;height:11px;border-radius:3px;background:rgba(40,120,200,0.75);border:1px solid rgba(0,0,0,0.15);"></span> ${window.IntMapLang.t(HOST.lang,'Flooded (≤ today ','浸水域 (≤ 現海面 ','Überflutet (≤ heute ','Затоплено (≤ текущего ','Inundado (≤ hoy ')}<b class="sl-cur">${(slL>=0?'+':'')+slL} m</b>${HOST.lang==='jp'?')':')'}</div>
      <label style="display:flex; align-items:center; gap:8px; font-size:11px; margin:4px 0 2px; color:var(--text-muted);">-150<input type="range" class="sl-legend-range" min="-150" max="70" step="1" value="${Math.max(-150,Math.min(70,slL))}" style="flex:1; accent-color:var(--primary-color);">+70 m</label>
      <div style="display:flex; gap:6px; margin:4px 0 2px;"><input type="number" class="sl-num" min="-11000" max="9000" step="1" value="${slL}" placeholder="m" style="flex:1; min-width:0; padding:5px 8px; border-radius:8px; border:1px solid rgba(128,128,128,0.25); background:var(--input-bg); color:var(--text-main); font-size:12px;"><button class="sl-set" style="padding:5px 12px; border:none; border-radius:8px; background:var(--primary-color); color:#fff; font-size:11px; font-weight:600; cursor:pointer;">${window.IntMapLang.t(HOST.lang,'Set','設定','Festlegen','Задать','Fijar')}</button></div>
      <div class="sl-err" style="display:none; color:var(--info-mil); font-size:10px; margin:0 0 2px;"></div>
      <div class="dl-hint">${window.IntMapLang.t(HOST.lang,'Slider or a number (-11000–9000 m; negative = sea-level fall). Naïve "bathtub" fill from the AWS Terrain DEM — ignores tides & defenses.','スライダーまたは数値（-11000〜9000 m、マイナス=海面低下）。AWS Terrain DEM に基づく簡易浸水。潮汐・防潮堤は未考慮。','Schieberegler oder Zahl (-11000–9000 m; negativ = Meeresspiegel-Abfall). Einfache „Badewannen“-Flutung aus dem AWS-Terrain-DEM — ohne Gezeiten & Deiche.','Ползунок или число (-11000–9000 м; минус = падение уровня). Простое «наполнение ванны» по DEM AWS Terrain — без приливов и дамб.','Deslizador o número (-11000–9000 m; negativo = descenso del nivel). Inundación simple («bañera») según el DEM de AWS Terrain — sin mareas ni defensas.')}</div>`;
    mc.appendChild(lgdSeaLevel);
    lgdSeaLevel.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-sealevel'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    /* Sea-level slider lives in the legend too (#11) — control the simulation straight from the legend. */
    { const r=lgdSeaLevel.querySelector('.sl-legend-range'); if(r) r.addEventListener('input',()=>{ window._seaLevelM=parseInt(r.value,10)||0; if(window._refreshSeaLevel) window._refreshSeaLevel(); }); }
    /* (#R9) Custom value button: any number in [-11000, +9000]; out-of-range shows an inline error. */
    /* (#R186) 「Sea-level changeは、setを押さなくても、数値を変えた時点で結果が変わるように。」 — the number box
       now applies AS IT CHANGES, exactly like the slider beside it (which has always been on `input`).
       `input` fires on every keystroke AND on the spinner arrows, so a partially-typed value like "-"
       or "1" would repaint at each character; the apply is therefore debounced by one animation-frame-ish
       tick and a lone sign/empty box is treated as "still typing" rather than as an error. Set stays —
       it is the explicit commit for anyone who has learned to press it, and Enter still commits — but
       nothing waits for either of them any more. */
    { const num=lgdSeaLevel.querySelector('.sl-num'), setb=lgdSeaLevel.querySelector('.sl-set'), err=lgdSeaLevel.querySelector('.sl-err');
      const apply=(quiet)=>{ const raw=String(num.value||'').trim();
        if(quiet && (raw===''||raw==='-'||raw==='+')){ if(err) err.style.display='none'; return; }   /* mid-typing, not an error */
        const v=parseInt(raw,10);
        if(isNaN(v)||v<-11000||v>9000){ if(err){ err.textContent=window.IntMapLang.t(HOST.lang,'Enter a number between -11000 and 9000','-11000〜9000 の数値を入力してください','Zahl zwischen -11000 und 9000 eingeben','Введите число от -11000 до 9000','Introduce un número entre -11000 y 9000'); err.style.display='block'; } return; }
        if(err) err.style.display='none'; window._seaLevelM=v; if(window._refreshSeaLevel) window._refreshSeaLevel(); };
      if(setb) setb.onclick=()=>apply(false);
      if(num){ let _slT=0;
        num.addEventListener('input',()=>{ clearTimeout(_slT); _slT=setTimeout(()=>apply(true),90); });
        num.addEventListener('change',()=>{ clearTimeout(_slT); apply(true); });
        num.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); clearTimeout(_slT); apply(false); } });
      }
    }
    /* === Wind legend (#R12 / #19,#22) — replaces the floating top-center valid-time pill that overlapped
       the search box. Same draggable data-legend format as every other layer, carries the GFS valid time,
       a speed color ramp, AND a UNIT pulldown (m/s · km/h · kn · mph). === */
    window.WIND_UNITS=[['ms','m/s',1],['kmh','km/h',3.6],['kn','kn',1.94384],['mph','mph',2.23694]];
    try{ window.windUnit=localStorage.getItem('intmap_wind_unit')||'ms'; }catch(_){ window.windUnit='ms'; }
    if(!window.WIND_UNITS.some(u=>u[0]===window.windUnit)) window.windUnit='ms';
    window._windUnitEntry=()=>window.WIND_UNITS.find(u=>u[0]===window.windUnit)||window.WIND_UNITS[0];
    window.windUnitFactor=()=>window._windUnitEntry()[2];
    window.windUnitLabel=()=>window._windUnitEntry()[1];
    window.fmtWindSpeed=(ms)=>{ const v=(ms||0)*window.windUnitFactor(); return v.toFixed(v<10?1:0)+' '+window.windUnitLabel(); };
    /* ⚠⚠ (#R276) THE RAMP IS NO LONGER WRITTEN HERE, AND NEITHER IS THE MAXIMUM. 「凡例の最大値と
       実際のLUTも一致させる」 — the gradient above was hand-typed and its label said 「40 m/s」 while
       the raster it described actually ran to 60 m/s, so the legend and the picture disagreed by half
       a hurricane. The body is rendered by js/weather.js from the model's OWN colour table
       (IntMapECMWF.legend), together with the model name, its run hour and the valid time — the
       three facts 「Open-Meteo GFS」 was standing in for, wrongly, on a field that is ECMWF IFS. */
    lgdWind=document.createElement('div'); lgdWind.className='data-legend'; lgdWind.id='data-legend-wind'; lgdWind.style.bottom='140px';
    lgdWind.innerHTML=`<span class="dl-drag" title="${window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover')}">⋮⋮</span><button class="layer-popup-x" data-x="wind" title="${t('close')}">×</button><h4>${window.IntMapLang.t(HOST.lang,'Wind 10 m','風（10m）','Wind 10 m','Ветер 10 м','Viento 10 m')}</h4><div class="wind-legend-body"></div>`;
    mc.appendChild(lgdWind);
    lgdWind.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('dl-wind'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
    window._updateWindLegend=function(){
      const body=lgdWind.querySelector('.wind-legend-body'); if(!body) return;
      try{ if(window._renderWindLegendBody){ window._renderWindLegendBody(body); return; } }catch(_){}
      body.innerHTML='<div class="dl-hint">'+window.IntMapLang.t(HOST.lang,'Loading the wind model…','風モデルを読み込み中…','Windmodell wird geladen…','Загрузка модели ветра…','Cargando el modelo de viento…')+'</div>';
    };
    window._updateWindLegend();
    }
    buildCoreLegends();   /* (#R110) build once now; re-run on language change (see the intmap-lang listener below) */
    /* Unified legend drag — MOUSE + TOUCH (#33), idempotent. Works for any legend whose handle is
       .dl-drag or .kl-drag, so EEZ/Temp/Thermal/… AND the Köppen legend are all movable on phones. */
    function wireDrag(el){
      if(!el) return;
      /* (#R19) DELEGATED drag — the fix for "凡例が動かせなくなることがたまにある": the old code wired the
         ⋮⋮/h4 handle NODES directly, but every innerHTML rebuild (date-pickers, opacity rows, language
         switch, Köppen era swap…) REPLACED those nodes and the new ones were never re-wired → the legend
         silently stopped moving. The listeners now live on the legend ROOT (which innerHTML rebuilds never
         replace) and find the live handle via closest(), so drag survives every rebuild, forever. */
      if(el.dataset.dragRootWired) return; el.dataset.dragRootWired='1';
      const HANDLE='.dl-drag,.kl-drag,h4,.tp-header';
      const begin=(cx,cy)=>{
        const startRect=el.getBoundingClientRect(), mcRect=mc.getBoundingClientRect();
        const ox=cx-startRect.left, oy=cy-startRect.top;
        /* Pin to the current on-screen spot BEFORE releasing the CSS bottom/right anchor, so the
           legend never flashes to a default corner when the drag starts (esp. on mobile, #10). Use
           inline !important so any mobile !important dock rule can't fight the drag. */
        const setp=(k,v)=>el.style.setProperty(k,v,'important');
        setp('left',(startRect.left-mcRect.left)+'px'); setp('top',(startRect.top-mcRect.top)+'px');
        setp('bottom','auto'); setp('right','auto'); el.dataset.dragged='1';
        return (mx,my)=>{
          const x=Math.max(8,Math.min(mcRect.width-startRect.width-8, mx-mcRect.left-ox));
          const y=Math.max(8,Math.min(mcRect.height-startRect.height-8, my-mcRect.top-oy));
          setp('left',x+'px'); setp('top',y+'px');
        };
      };
      /* ══ ⚠⚠⚠ (#R239) A DOCKED LEGEND DOES NOT DRAG — AND THIS IS THE SECOND DRAG IMPLEMENTATION ══
         「パネル内のポップアップや凡例は×可能だがドラッグ可能にはしないように。」
         「タップしたらどんどん消えていく現象ふざけるな。」

         js/window-manager.js refuses the gesture for a docked panel, and that fix did NOT stop the
         legends — measured in the sidebar: a 100 px drag on the Köppen legend's header still moved
         it 378 px down and wrote `inset:378.25px auto auto 8px !important`, i.e. straight out of the
         column. Because a legend has never gone through `makeDraggable`: #R19 gave the legends their
         own delegated drag HERE, so that an `innerHTML` rebuild could not orphan the handle. Two
         implementations of one gesture, and the guard was added to one of them —
         [[intmap-recurring-lessons]] G, one level down from the defect it was fixing.

         ⚠ THE TEST IS THE CLASS, NOT A NEW GLOBAL. `im-docked` is what js/window-manager.js puts on
         every docked element and what the stylesheet already keys off, so this asks the same
         question the CSS asks and there is no third place that decides what «docked» means.
         ⚠ AND WHY IT LOOKED LIKE «消えていく»: `begin()` pins the legend to its on-screen spot with
         inline `!important` before releasing the anchors. In the column that spot is measured from
         the map container, hundreds of pixels away, so one touch that moved a few pixels teleported
         the legend out of view. It never closed. */
      const hitHandle=(t)=>{ const h=t&&t.closest&&t.closest(HANDLE); if(!h||!el.contains(h)) return null;
        if(el.classList&&el.classList.contains('im-docked')) return null;
        if(t.closest('button,input,select,a,.legend-min,.layer-popup-x,.tp-close')) return null;   /* keep controls tappable */
        return h; };
      el.addEventListener('mousedown',ev=>{ const h=hitHandle(ev.target); if(!h) return; ev.preventDefault();
        const move=begin(ev.clientX,ev.clientY);
        const mv=e=>move(e.clientX,e.clientY); const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); });
      el.addEventListener('touchstart',ev=>{ const h=hitHandle(ev.target); if(!h) return; const t0=ev.touches[0]; if(!t0) return; ev.preventDefault();
        const move=begin(t0.clientX,t0.clientY);
        const mv=e=>{ const t=e.touches[0]; if(t) move(t.clientX,t.clientY); }; const up=()=>{ document.removeEventListener('touchmove',mv); document.removeEventListener('touchend',up); };
        document.addEventListener('touchmove',mv,{passive:false}); document.addEventListener('touchend',up); },{passive:false});
      /* the h4 cursor/touch-action hints are cosmetic — set them now and after any rebuild on hover */
      const hint=()=>{ const dk=el.classList&&el.classList.contains('im-docked');
        el.querySelectorAll('h4').forEach(h=>{ h.style.cursor=dk?'default':'move'; h.style.touchAction=dk?'':'none'; h.style.userSelect='none'; }); };
      hint(); el.addEventListener('mouseenter',hint);
    }
    window._wireLegendDrag=wireDrag;
    wireDrag(lgdEEZ); wireDrag(lgdThermal); wireDrag(lgdRadar); wireDrag(lgdSST); wireDrag(lgdPopGrid); wireDrag(lgdRelief); wireDrag(lgdSeaLevel);
    wireDrag(lgdHDI); wireDrag(lgdDem); wireDrag(lgdPop); wireDrag(lgdNATO);   /* the makeLegend legends drag centrally too now (#10) */
    wireDrag(lgdGdppc); wireDrag(lgdTfr); wireDrag(lgdMil); wireDrag(lgdMilGDP); wireDrag(lgdSnow); wireDrag(lgdAod); wireDrag(lgdNightsat);   /* (#R15b #38) */
    /* (#R110) LANGUAGE CHANGE → rebuild the core legends in the new language, preserving which are open + any dragged
       position (opacity/date/unit values live in JS state and are re-injected by tileLegends/_refreshLegendDates).
       Generic legends re-localize their title in place; the Köppen legend rebuilds when it is open. */
    function _rebuildCoreLegends(){ if(!lgdHDI) return;
      const snap={};
      CORE_LEGEND_IDS.forEach(id=>{ const el=document.getElementById('data-legend-'+id); if(el) snap[id]={disp:el.style.display,dragged:el.dataset.dragged,cssText:el.style.cssText}; });
      buildCoreLegends();
      [lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdHDI,lgdDem,lgdPop,lgdNATO,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,lgdWind].forEach(el=>{ try{ wireDrag(el); }catch(_){} });
      CORE_LEGEND_IDS.forEach(id=>{ const s=snap[id]; if(!s) return; const el=document.getElementById('data-legend-'+id); if(!el) return;
        if(s.dragged){ el.style.cssText=s.cssText; el.dataset.dragged='1'; }   /* keep a user-dragged legend exactly where it was */
        else if(s.disp&&s.disp!=='none'){ el.style.display=s.disp; } });   /* keep an open legend open (re-tiled below) */
      try{ document.querySelectorAll('.data-legend.generic-legend').forEach(el=>{ const id=(el.id||'').replace('data-legend-',''); if(id&&window._ensureGenericLegend) window._ensureGenericLegend(id); }); }catch(_){}
      try{ const kl=document.getElementById('koppen-legend'); if(kl&&getComputedStyle(kl).display!=='none'&&typeof buildLegend==='function') buildLegend(); }catch(_){}
      try{ tileLegends(); }catch(_){}
      try{ _refreshLegendDates(); }catch(_){}
      /* (#R289) the 国防費 mode switch is INSIDE those two legends, so a rebuild drops it; re-assert
         the mode rather than leaving a row that can no longer be switched. */
      try{ applyMilMode(); }catch(_){}
    }
    window.addEventListener('intmap-lang', _rebuildCoreLegends);
    /* The Köppen legend's drag handle is (re)injected inside buildLegend() so it survives the
       innerHTML rebuild that previously wiped it — that rebuild was why it "couldn't be moved" (#22). */

    const dd=document.getElementById('layer-dropdown');
    const hr=document.createElement('hr'); hr.style.cssText='border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;'; dd.appendChild(hr);
    /* The top-level "Data layers" line is a SECTION LABEL, not a collapsible group (the real groups
       are the Weather/Terrain/… sub-headers below it). Mark it so it doesn't show a ▷ it can't act
       on (#30). */
    const head=document.createElement('div'); head.className='lyr-head lyr-section-label'; head.setAttribute('data-i18n','lyrSection'); head.textContent=i18n[HOST.lang].lyrSection; dd.appendChild(head);

    const opacities={climate:1,precip:0.6,pop:0.7,hdi:0.65,dem:0.65,milSpend:0.7,milSpendGDP:0.7,gdppc:0.7,tfr:0.72,nato:0.55,nightsat:1,nightside:1,eez:0.7,ships:0.9,planes:0.9,thermal:0.75,radar:0.8,sst:0.7,snow:0.7,aod:0.7,popgrid:0.8,hillshade:0.55,contours:0.85,relief:0.7,sealevel:0.60,wind:1,subcables:0.95,sats:0.95};   /* (#R122) Köppen climate default opacity = 100% */
    if(window._seaLevelM==null) window._seaLevelM=2;   /* default +2 m sea-level rise (#24) */
    /* Default to the freshest GIBS day that is reliably processed (−2 days). */
    const GIBS_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    /* Date-aware layers: temp, precip, thermal — these vary day-by-day. */
    const PRECIP_DATE=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    /* ⚠ (#R288) THE MERRA-2 MONTHLY AIR-TEMPERATURE RASTER IS NOT A LAYER OF ITS OWN ANY MORE.
       「気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、グラフィックに。
         ソースだけ切り替えられる仕様に。」 It is the `merra2` SOURCE of the one 「気温」 layer
       (js/weather.js), re-coloured through the same ramp the forecast uses (js/wx-reanalysis.js).
       Its month, its legend and its opacity live there; nothing about it is declared twice any more. */
    /* thermal is NOT date-keyed any more (#5): NASA FIRMS publishes rolling time-window layers, so the
       thermal row carries a window selector in its legend instead of a calendar date. */
    const layerDates={precip:PRECIP_DATE,sst:GIBS_DATE,snow:GIBS_DATE,aod:GIBS_DATE};
    /* ══ (#R268) THE NIGHT-LIGHTS EPOCHS, MEASURED ════════════════════════════════════════════════
       「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」 — and night
       lights is the layer where a decade of difference is the whole subject (a city that was dark in
       2012 and lit in 2016). GIBS's `VIIRS_Black_Marble` is not a daily product: probed one tile per
       candidate year, **2012-01-01 and 2016-01-01 answer 200 and every other year answers 404**, so
       those two are the choice and the picker offers exactly them rather than a calendar that would
       mostly draw nothing. */
    const NIGHTSAT_EPOCHS=['2016-01-01','2012-01-01'];
    if(!window._nightsatEpoch) window._nightsatEpoch=NIGHTSAT_EPOCHS[0];
    /* ══ (#R268 追記) …AND THE 1 km POPULATION GRID HAS FIVE ═════════════════════════════════════
       Reviewing 「年を変えることに意味があるレイヤーは一つ残らずすべて」 against the whole panel after
       the round shipped: 1人当たりGDP・合計特殊出生率・人口・平均寿命・軍事費 already travel with the
       MASTER CLOCK (#R94/#R200 fetch that year's World Bank figures onto countryStats), and HDI/UNDP
       and 民主主義指数/EIU are single published editions with no annual series — #R94 deliberately
       never relabels those with a year they do not have. The one genuine gap left was this layer:
       GPW is published as a SEPARATE GIBS product per epoch and the app was pinned to 2020.
       Probed one tile each: 2000 / 2005 / 2010 / 2015 / 2020 all answer 200. Two decades of where
       people are, on a 1 km grid, is exactly what 「年を変えることに意味がある」 means. */
    const POPGRID_EPOCHS=['2020','2015','2010','2005','2000'];
    if(!window._popgridYear) window._popgridYear=POPGRID_EPOCHS[0];
    const popgridTiles=()=>gibsStatic('GPW_Population_Density_'+window._popgridYear,7,'png');
    window._imLayerDates=layerDates;   /* (#R77) live reference for Atlas stateContext (vision §2 — dated-layer awareness) */
    /* (#R13c) Time-varying layers state WHEN their data is from, in the legend (user request). A small
       "as-of" line is appended to each dated legend and refreshed whenever the date/window changes. */
    function _legendWhenText(id){ const jp=HOST.lang==='jp';
      if(id==='radar') return (window.IntMapLang.t(HOST.lang,'Latest frame (live)','最新フレーム（実時間）','Neuestes Bild (live)','Последний кадр (в реальном времени)','Último fotograma (en vivo)'));
      if(id==='thermal'){ const w=window._thermalWindow||'24'; return (jp?('直近'+w+'時間'):('Last '+w+' h')); }
      /* (#R268 追記) …before the `layerDates` gate: this layer's year is an EPOCH, not a date */
      if(id==='popgrid') return (window.IntMapLang.t(HOST.lang,'Data: ','データ: ','Daten: ','данные: ','datos: '))+window._popgridYear;
      const d=layerDates[id]; if(!d) return '';
      return (window.IntMapLang.t(HOST.lang,'Data: ','データ: ','Daten: ','данные: ','datos: '))+d;
    }
    /* (#R15d) The date/window control now lives IN the legend (not the Layers panel). For radar (live) we
       just show the as-of text; temp gets a month picker; sst/snow/aod a date picker; thermal a 24/48/72 h
       window select. Each writes layerDates[id] / _thermalWindow and reloads the dated layer. */
    const _today=()=>new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    function _refreshLegendDates(){
      [['thermal',lgdThermal],['radar',lgdRadar],['sst',lgdSST],['snow',lgdSnow],['aod',lgdAod],['nightsat',lgdNightsat],['popgrid',lgdPopGrid]].forEach(([id,lg])=>{
        if(!lg) return;
        let w=lg.querySelector('.dl-when');
        if(!w){
          w=document.createElement('div'); w.className='dl-when'; w.style.cssText='font-size:10px;color:var(--text-muted);margin-top:4px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
          const inSty='padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;';
          if(id==='radar'){ w.innerHTML='🕒 <span class="dl-when-t"></span>'; }
          else if(id==='thermal'){ w.innerHTML='🕒 <span>'+(window.IntMapLang.t(HOST.lang,'Window','期間','Zeitfenster','Окно','Ventana'))+'</span> <select class="dl-win" style="'+inSty+'"><option value="24">24 h</option><option value="48">48 h</option><option value="72">72 h</option></select>';
            const s=w.querySelector('.dl-win'); s.value=window._thermalWindow||'24'; s.addEventListener('change',()=>{ window._thermalWindow=s.value; try{ window._refreshThermal&&window._refreshThermal(); }catch(_){} _refreshLegendDates(); }); }
          else if(id==='nightsat'){ w.innerHTML='🕒 <span>'+(window.IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año'))+'</span> <select class="dl-epoch" style="'+inSty+'">'
              +NIGHTSAT_EPOCHS.map(d=>'<option value="'+d+'">'+d.slice(0,4)+'</option>').join('')+'</select>';
            const e=w.querySelector('.dl-epoch'); e.value=window._nightsatEpoch;
            e.addEventListener('change',()=>{ window._nightsatEpoch=e.value;
              try{ GE().layers.setSourceTiles('src-nightsat',gibs('VIIRS_Black_Marble',8,'png',window._nightsatEpoch)); }catch(_){}
              _refreshLegendDates(); }); }
          else if(id==='popgrid'){ w.innerHTML='🕒 <span>'+(window.IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año'))+'</span> <select class="dl-epoch" style="'+inSty+'">'
              +POPGRID_EPOCHS.map(y=>'<option value="'+y+'">'+y+'</option>').join('')+'</select>';
            const e=w.querySelector('.dl-epoch'); e.value=window._popgridYear;
            e.addEventListener('change',()=>{ window._popgridYear=e.value;
              try{ GE().layers.setSourceTiles('src-popgrid',popgridTiles()); }catch(_){}
              _refreshLegendDates(); }); }
          else { w.innerHTML='🕒 <input type="date" class="dl-date" max="'+_today()+'" style="'+inSty+'">';
            const d=w.querySelector('.dl-date'); d.value=layerDates[id]||_today(); d.addEventListener('change',()=>{ layerDates[id]=d.value||_today(); if(GE().layers.has('lyr-'+id)&&GE().layers.getLayout('lyr-'+id,'visibility')==='visible') refreshDatedLayer(id); _refreshLegendDates(); }); }
          lg.appendChild(w);
        }
        /* keep values in sync */
        const dt=w.querySelector('.dl-date'); if(dt){ dt.value = layerDates[id]||_today(); }
        const wn=w.querySelector('.dl-win'); if(wn) wn.value=window._thermalWindow||'24';
        const ep=w.querySelector('.dl-epoch'); if(ep) ep.value=(id==='popgrid')?window._popgridYear:window._nightsatEpoch;
        const tt=w.querySelector('.dl-when-t'); if(tt) tt.textContent=_legendWhenText(id);
      });
    }
    window._refreshLegendDates=_refreshLegendDates;
    _refreshLegendDates();
    /* Thermal anomalies / active fire (#R7) — REAL NASA FIRMS detections served through NASA GIBS WMS.
       Why GIBS, not FIRMS' own WMS: the FIRMS MapServer caps requests per IP, so a tiled web map (dozens
       of tiles per view) quickly trips its quota and every tile comes back as the red error image
       "You have exceeded the transaction limit" — exactly what the user saw. GIBS is NASA's purpose-built
       high-volume tile/WMS service (no per-IP transaction cap), it rasterizes the VIIRS (NOAA-20 + SNPP)
       and MODIS (Terra + Aqua) thermal-anomaly point layers to PNG, needs no key and returns CORS:*.
       Verified live: 200 image/png, Access-Control-Allow-Origin:*.
       Each WMS GetMap takes a single day (TIME=YYYY-MM-DD), so the 24/48/72 h "window" is built by
       stacking the most-recent N UTC days as separate raster layers (today + previous days). */
    window._thermalWindow=window._thermalWindow||'24';        /* rolling window: 24 | 48 | 72 (h) → 2 | 3 | 4 recent UTC days */
    const GIBS_FIRE_LAYERS='VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,MODIS_Terra_Thermal_Anomalies_All,MODIS_Aqua_Thermal_Anomalies_All';
    const THERMAL_IDS=['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'];
    let _thermalOn=false;
    function _utcDayISO(back){ return new Date(Date.now()-back*86400000).toISOString().slice(0,10); }
    function gibsThermalWMS(dayISO,layers){ return 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+(layers||GIBS_FIRE_LAYERS)+'&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+dayISO; }
    function thermalDayOffsets(){ const n={'24':2,'48':3,'72':4}[window._thermalWindow||'24']||2; const out=[]; for(let i=0;i<n;i++) out.push(i); return out; }
    /* (#R121) ROOT FIX — a combined LAYERS= GetMap fails ENTIRELY ("msShapefileOpen(): The requested shapefile
       cannot be found") when ANY one product has no data for that day (live-verified: VIIRS_SNPP missing for
       today & yesterday blanked the whole thermal layer). Probe each day once with a tiny GetMap, parse the
       failing product out of the ServiceException, and request only the products that actually draw. */
    const _thermalDayCache={};
    async function _thermalLayersFor(day){ if(_thermalDayCache[day]!==undefined) return _thermalDayCache[day];
      let list=GIBS_FIRE_LAYERS.split(',');
      for(let t=0;t<4&&list.length;t++){
        try{ const M=20037508.34;
          const r=await fetch('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+list.join(',')+'&CRS=EPSG:3857&BBOX='+(-M)+','+(-M)+','+M+','+M+'&WIDTH=4&HEIGHT=4&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day);
          const ct=(r.headers.get('content-type')||'');
          if(r.ok&&ct.indexOf('image')>=0) break;
          const tx=await r.text(); const m=tx.match(/named '([^']+)'/)||tx.match(/named &#39;([^&#]+)&#39;/);
          if(!m||list.indexOf(m[1])<0){ list=[]; break; }
          list=list.filter(x=>x!==m[1]);
        }catch(_){ break; } }   /* network error → keep the current list (the layer may still draw) */
      _thermalDayCache[day]=list; return list; }
    function _clearThermal(){ THERMAL_IDS.forEach((lid,i)=>{ try{ if(GE().layers.has(lid)) GE().layers.remove(lid); }catch(_){} try{ const sid='src-thermal-'+i; if(GE().layers.hasSource(sid)) GE().layers.removeSource(sid); }catch(_){} }); }
    function addFirmsThermal(){
      _clearThermal();
      thermalDayOffsets().forEach((off,i)=>{
        const sid='src-thermal-'+i, lid=THERMAL_IDS[i], day=_utcDayISO(off);
        _thermalLayersFor(day).then(list=>{
          if(!list||!list.length) return;   /* no fire product at all for that day (yet) — skip the slot honestly */
          try{
            if(GE().layers.hasSource(sid)||GE().layers.has(lid)) return;   /* a re-toggle raced us */
            GE().layers.addSource(sid,{type:'raster',tiles:[gibsThermalWMS(day,list.join(','))],tileSize:256,attribution:'NASA FIRMS / GIBS — MODIS & VIIRS active fire'});
            GE().layers.add({id:lid,type:'raster',source:sid,layout:{visibility:_thermalOn?'visible':'none'},paint:{'raster-opacity':opacities.thermal}},beforeId);
          }catch(_){}
        }).catch(()=>{});
      });
    }
    function setThermalVis(on){ _thermalOn=on; THERMAL_IDS.forEach(lid=>{ if(GE().layers.has(lid)) GE().layers.setLayout(lid,'visibility',on?'visible':'none'); }); }
    window._setThermalOpacity=function(v){ THERMAL_IDS.forEach(lid=>{ if(GE().layers.has(lid)) GE().layers.setPaint(lid,'raster-opacity',v); }); };
    /* Rebuild the stacked layers when the user switches the 24/48/72 h window in the legend. */
    window._refreshThermal=function(){
      const was=_thermalOn;
      try{ addFirmsThermal(); setThermalVis(was); }catch(e){ console.warn('thermal rebuild fail',e); }
    };
    /* (#R12) Layer taxonomy re-organized into clearer, purpose-built categories (per request to
       re-classify the panel): Climate & weather · Terrain & elevation · Oceans & maritime ·
       Hazards & night sky · Population & economy · Geopolitics & defense. */
    [
      ['__grp','lyrGrpClimate'],
      /* ⚠ (#R289) THERE IS NO 'clouds' ROW HERE ANY MORE — 「雲・赤外（実時間）レイヤーは削除して」.
         #R276 gave it one (it had been reachable only through a share link since #R7). The three
         NASA GIBS geostationary discs, their opacity entries, their legend hint and their
         toggleLayer branches all go with it. The ECMWF cloud-cover layer `ec-cloud` is a
         DIFFERENT layer and stays — and so is `ec-temp`, which is where 「気温」 lives since #R288. */
      ['climate','lyrClimate'],['precip','lyrPrecip'],['radar','lyrRadar'],['wind','lyrWind'],['sst','lyrSST'],['snow','lyrSnow'],['aod','lyrAOD'],
      ['__grp','lyrGrpTerrain'],
      ['relief','lyrRelief'],['hillshade','lyrHillshade'],['contours','lyrContours'],['sealevel','lyrSeaLevel'],
      ['__grp','lyrGrpMaritime'],
      /* ⚠ (#R224) THERE IS NO 'oceancur' ROW HERE ANY MORE — 「海流レイヤー、二つあるなんていうややこしい
         ことするな。統一しろ。」 This app had TWO ocean-current layers: this one (#R208 — 61 traced lines
         plus a 1°-strided arrow field) and the World-data plate (js/ocean-currents.js — 108 named
         currents, the source's own 0.25° grid strided to the view, twelve monthly climatologies, the
         list panel and the legend). Both were reachable and both drew over each other. The plate is
         the survivor and the ONLY implementation; a session that had this row ticked is migrated to
         `wp-dl-currents` once, in js/session-tabs.js. */
      ['eez','lyrEEZ'],['subcables','lyrSubcables'],['ships','lyrShips'],['planes','lyrPlanes'],['sats','lyrSats'],
      ['__grp','lyrGrpHazard'],
      /* ══ (#R232) 「昼/夜レイヤーは削除。（新たな昼夜機能がすでにあるため不要。）」 ════════════════════
         ⚠ THERE IS NO 'night' ROW HERE ANY MORE, AND THE ROW THAT REPLACED IT IS NOT A LAYER. The old
         one was #R0-era: one flat #00112a disc from turf.circle, 10,001 km across, redrawn every 60 s.
         js/night-side.js (#R196/#R201) has since done the same job properly — a real twilight ramp and
         NASA's VIIRS city lights, fading in as the camera pulls back — so the app carried TWO day/night
         shadings that drew over each other, which is the same 「二つあるなんていうややこしいことするな」
         defect the ocean currents had one group above.
         ⚠ AND THE NEW ROW IS THE SECOND HALF OF THE SAME INSTRUCTION: 「昼夜の表示は、設定だけでなく
         レイヤー選択欄の基本表示からもオンオフできるように。」 It drives window.IntMapNightSide, which
         owns its own on/off state and its own persistence (localStorage 'intmap_night_side', #R210) —
         so this row READS that state rather than keeping a second copy of it, and Settings' own
         `#setting-night-side` picker is mirrored both ways. One quantity, one owner. */
      ['thermal','lyrThermal'],['nightsat','lyrNightSat'],['nightside','lyrNightSide'],
      ['__grp','lyrGrpDemo'],
      ['pop','lyrPop'],['popgrid','lyrPopGrid'],['gdppc','lyrGDPpc'],['tfr','lyrTFR'],['hdi','lyrHDI'],['dem','lyrDem'],
      ['__grp','lyrGrpGeoPol'],
      /* (#R289) ONE 国防費 ROW. 「一人当たりレイヤーとその元の対となるレイヤーがあるものは統合して
         一つに」 — the same shape as the CO₂ pair: the total ($B) and the same quantity divided (%
         of GDP) were two rows of one series. `milMode` switches between them inside the legend, so
         both fills, both ramps and both legends stay exactly as they were. */
      ['milSpend','lyrMilSpend'],['nato','lyrNATO'],['eu','lyrEU']
    ].forEach(([id,key])=>{
      if(id==='__grp'){ const h=document.createElement('div'); h.className='lyr-head'; h.setAttribute('data-i18n',key); h.textContent=i18n[HOST.lang][key]||''; dd.appendChild(h); return; }
      const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+id;
      const isDated=layerDates.hasOwnProperty(id);   /* (#R288) the one month-sliced layer moved to js/weather.js */
      const isTraffic=(id==='ships'||id==='planes');
      let extra='';
      /* ⚠ (#R138/#R186) `layerDates[id]` IS DOM TEXT — it is written from the date input's own `value`
         in the change handler below, so it leaves our code and comes back. CodeQL traces exactly that
         flow into the innerHTML a few lines down and calls it high severity. Nothing realistic rides
         it (same origin, and a `type=date` value is browser-validated), but "nothing realistic" is not
         "nothing", and #R138's rule is that a value which came from outside our own code reaches the
         DOM through window.IntMapSafe. So it does. */
      const _esc=(v)=>window.IntMapSafe.html(v==null?'':v);
      if(isDated){
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:6px; color:var(--text-muted);">${t('lyrTime')||'Date'}: <input type="date" id="dt-${id}" value="${_esc(layerDates[id])}" max="${_esc(new Date().toISOString().slice(0,10))}" style="padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"></label></div>`;
      }
      if(isTraffic){
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:6px; color:var(--text-muted);">${t('trafficFilter')||'Filter'}: <select id="ft-${id}" style="padding:3px 6px; border-radius:6px; border:1px solid rgba(128,128,128,0.2); background:var(--input-bg); color:var(--text-main); font-size:11px;"><option value="all" data-i18n="filtAll">${t('filtAll')||'All'}</option><option value="civilian" data-i18n="filtCiv">${t('filtCiv')||'Civilian'}</option><option value="military" data-i18n="filtMil">${t('filtMil')||'Military'}</option></select></label></div>`;
      }
      const isSeaLevel=(id==='sealevel');
      if(isSeaLevel){
        /* Sea-level-rise simulator (#24): slider chooses a +rise in meters; the DEM recolors so
           everything below that level floods blue. */
        /* the same rule: `window._seaLevelM` is written from an input's value (and from Atlas), so it
           becomes a NUMBER before it is ever spliced into markup — Number() is the barrier here, and
           it is also the only thing that makes the clamp below mean anything */
        const _sl=Number(window._seaLevelM)||0;
        extra=`<div class="lyr-extras" style="display:none; padding:4px 0 6px 24px; font-size:11px;"><label style="display:flex; align-items:center; gap:8px; color:var(--text-muted);">${window.IntMapLang.t(HOST.lang,'Sea-level','海面変動','Meeresspiegel','Уровень моря','Nivel del mar')}: <input type="range" id="sl-${id}" min="-150" max="70" value="${Math.max(-150,Math.min(70,_sl))}" step="1" style="flex:1; accent-color:var(--primary-color);"><span id="sllbl-${id}" style="min-width:52px; text-align:right; font-variant-numeric:tabular-nums;">${(_sl>=0?'+':'')+_sl} m</span></label></div>`;
      }
      /* (#R15c) EVERY opacity layer now owns a legend (specific, generic, or the wind legend), so the
         opacity control lives THERE and the inline Layers-panel slider is hidden for all of them. */
      const HAS_LEGEND=new Set(['climate','hdi','dem','pop','popgrid','eez','thermal','radar','sst','relief','sealevel',
        'gdppc','tfr','milSpend','snow','aod','nightsat','wind',
        'precip','ships','planes','sats','hillshade','contours','subcables','nato','eu']);   /* (#R232) 'night' removed with its row */
      if(HAS_LEGEND.has(id)) w.classList.add('has-legend');
      /* (#R186) 「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。」 — these two rows ship
         CHECKED. window.IntMapDefaultLayers is the single list; app-body dispatches the change event for
         each of them once the style can accept layers (a checked box alone paints nothing), and the
         session restore consults the same list so a user who switches one OFF is not overruled on the
         next load. Declared as a window value rather than a local const so both readers see one list. */
      /* (#R232) …and the day/night row's own answer comes from the module that owns it, not from this
         list: js/night-side.js is on unless the reader turned it off, and it remembers that itself. */
      const defOn=(id==='nightside')
        ? (function(){ try{ return !window.IntMapNightSide||window.IntMapNightSide.isOn(); }catch(_){ return true; } })()
        : (window.IntMapDefaultLayers||[]).indexOf('dl-'+id)>=0;
      w.innerHTML=`<label class="layer-option"><input type="checkbox" id="dl-${id}"${defOn?' checked':''}> <span data-i18n="${key}">${i18n[HOST.lang][key]}</span></label><input type="range" class="lyr-op" id="op-${id}" min="0" max="1" step="0.05" value="${opacities[id]}">${extra}`;
      if(defOn){ w.classList.add('on'); const ex0=w.querySelector('.lyr-extras'); if(ex0) ex0.style.display='block'; }
      dd.appendChild(w);
      const cb=w.querySelector('#dl-'+id);
      cb.addEventListener('change',e=>{
        w.classList.toggle('on',e.target.checked);
        const ex=w.querySelector('.lyr-extras'); if(ex) ex.style.display=e.target.checked?'block':'none';
        toggleLayer(id,e.target.checked);
      });
      w.querySelector('#op-'+id).addEventListener('input',e=>setLayerOpacity(id,parseFloat(e.target.value)));
      if(isDated){
        w.querySelector('#dt-'+id).addEventListener('change',e=>{ layerDates[id]=e.target.value||GIBS_DATE; if(cb.checked){ /* reload tiles for new date */ refreshDatedLayer(id); } try{ _refreshLegendDates(); }catch(_){} });
      }
      if(isTraffic){
        w.querySelector('#ft-'+id).addEventListener('change',e=>{ trafficFilters[id]=e.target.value; refreshTrafficLayer(id); });
      }
      if(isSeaLevel){
        const sl=w.querySelector('#sl-'+id);
        sl.addEventListener('input',e=>{ window._seaLevelM=parseInt(e.target.value,10)||0; if(window._refreshSeaLevel) window._refreshSeaLevel(); });
      }
    });

    /* (#R13) Re-classify the WHOLE layer panel into one coherent taxonomy. The static "Strategic
       geography / networks" groups, the dynamic data layers, the ECMWF rows and the land-cover rows are
       all appended from different places (static HTML + several IIFEs), so rather than rewrite each
       source we re-file every row under fresh category headers here. Place names / Country borders /
       Grid / Countries stay pinned at the top, untouched. Idempotent → safe to re-run on every open.
       Also moves "Open compare view" + "Upload GeoJSON" into a tidy Tools section at the very bottom
       (the user disliked them sitting mid-list). The old "Data layers" section label is dropped. */
    /* (#R14 / #17) "Active layers" — a live list of every currently-ON thematic layer, shown in the
       Layers panel just below the favorites bar and the Country-borders/Grid toggles. Each entry is a
       chip: click the name to scroll to its row, click × to switch it off. Rebuilt whenever any layer
       checkbox changes and on every panel open. (The 4 utility toggles names/borders/grid/countries are
       excluded — they sit right above and would be redundant.) */
    window._refreshActiveLayers=function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      const sec=document.getElementById('layer-active-section'); if(!sec) return;
      const lang=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
      /* ⚠ (#R235) 「昼夜の表示は他の基本表示と同様に、レイヤーとして扱うな。基本表示です。」
         #R233 moved the day/night row into the 基本表示 block, which put it in the right PLACE and
         left it a LAYER everywhere else: it was the one member of that block still counted here, so
         it took a chip in "Active layers", and — through `_imActiveLayerCount` two lines down — it
         accented the mobile FAB as though a thematic overlay were on. The other nine basics are
         skipped precisely because they are views of the map rather than data on top of it, and which
         half of the planet the Sun is lighting is the same kind of statement. */
      const skip=new Set(['cb-names','cb-geolabels','cb-poi','cb-borders','cb-coast','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2','dl-nightside']);
      const seen=new Set(), chips=[];
      dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{
        if(!cb.checked || skip.has(cb.id) || seen.has(cb)) return; seen.add(cb);   /* key by ELEMENT — geo/strategic rows have no id, so an id key collapsed them all to one */
        const lab=cb.closest('label'); if(!lab) return;
        /* (#R64) :not(.lsr-thumb) — the right-sidebar preview span sits BEFORE the name span and is empty,
           which silently blanked every chip name in right-sidebar mode. */
        const sp=lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');   /* the name span, not a color-swatch/preview span */
        let name=((sp?sp.textContent:lab.textContent)||'').trim();
        if(!name) return; chips.push({el:cb, name});
      });
      /* (#R139) publish the active thematic-layer count and, when it changes, re-sync the mobile FABs so the
         "Map & layers" FAB is accent-coloured ONLY while at least one thematic layer is on (matches this same
         set — the base name/border/grid/countries toggles above are already excluded via `skip`). */
      const _prevCnt=window._imActiveLayerCount; window._imActiveLayerCount=chips.length;
      if(_prevCnt!==chips.length){ try{ window._imSyncMobile&&window._imSyncMobile(); }catch(_){} }
      /* (#R15c) Skip the rebuild entirely when the active set is unchanged (kills needless flicker), and
         compensate the panel's scroll for any height change so toggling a layer doesn't make the whole
         list jump ("いちいち動いて目にうるさい"). */
      const sig=chips.map(c=>c.name).join('|');
      if(sec.dataset.sig===sig) return;
      /* (#R22) Compensate the ACTUAL scroll container's scrollTop. On mobile the layer-dropdown is
         position:static and the m-sheet body scrolls, so the old dd.scrollTop math was a no-op there →
         the list jerked on every toggle ("チェックをつけると視点位置がパチっと移動"). Walk up to the real
         scroller and, since the Active-layers section sits near the top, just add the height delta. */
      const scrollParent=(el)=>{ let n=el&&el.parentElement; while(n){ const st=getComputedStyle(n); if(/(auto|scroll)/.test(st.overflowY)&&n.scrollHeight>n.clientHeight+2) return n; n=n.parentElement; } return dd; };
      const scroller=scrollParent(sec);
      const beforeTop=scroller.scrollTop;
      sec.dataset.sig=sig;
      /* (#R32) Active layers is now a sticky-BOTTOM bar (pushed last in flow), so its growth/shrink no
         longer reflows the rows above. The old TOP-placement compensation (scrollTop += heightDelta) would
         NOW itself scroll the panel — so it is removed. Instead we simply PIN the scroller to exactly where
         it was, a pure no-move guard ("チェックを付けても1pxたりとも動かない / 視点を一切動かさない"). */
      const _restore=()=>{ try{ if(scroller && scroller.scrollTop!==beforeTop) scroller.scrollTop=beforeTop; }catch(_){} };
      /* (#R64) the bar is ALWAYS rendered (with "(0)" when empty) — if it appeared/disappeared with the first
         toggle, the rows below would shift by its height (the original R32 complaint). Constant height, always. */
      sec.style.display='';
      const title=(window.IntMapLang.t(lang,'Active layers','表示中のレイヤー','Aktive Ebenen','Активные слои','Capas activas'));
      const clearTxt=(window.IntMapLang.t(lang,'Clear all','すべて解除','Alle aus','Сбросить все','Quitar todo'));
      const listTxt=(window.IntMapLang.t(lang,'List','一覧','Liste','Список','Lista'));
      /* (#R19) One-tap deselect-ALL ("すべてのレイヤーを選択解除できるボタン") in the section header.
         (#R69) + a "List" expander (see .alc-panel CSS note) — better UI, same constant bar height. */
      /* (#R72) icon List button (SVG list glyph; title carries the localized label) */
      const _listSvg='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="3.6" cy="18" r="1.15" fill="currentColor" stroke="none"/></svg>';
      sec.innerHTML=`<div class="lyr-head lyr-section-label" style="margin-top:2px;display:flex;align-items:center;justify-content:space-between;gap:8px;"><span style="flex:1;min-width:0;">${title} (${chips.length})</span><button class="alc-exp" title="${listTxt}" aria-label="${listTxt}" aria-expanded="false">${_listSvg}</button><button class="alc-clear-all" style="flex:0 0 auto;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);border-radius:8px;padding:3px 9px;font-size:10.5px;cursor:pointer;">${clearTxt}</button></div><div class="active-lyr-chips"></div>`;
      sec.querySelector('.alc-clear-all').onclick=(e)=>{ e.stopPropagation();
        chips.forEach(c=>{ try{ if(c.el.checked){ c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){} });
        setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
      const wrap=sec.querySelector('.active-lyr-chips');
      /* (#R69) vertical mouse wheel scrolls the horizontal strip (it was near-impossible to reach overflowing
         chips with a mouse). */
      wrap.addEventListener('wheel',(e)=>{ if(e.deltaY&&!e.deltaX&&wrap.scrollWidth>wrap.clientWidth){ wrap.scrollLeft+=e.deltaY; e.preventDefault(); } },{passive:false});
      chips.forEach(c=>{
        const chip=document.createElement('span'); chip.className='active-lyr-chip';
        const nm=document.createElement('span'); nm.className='alc-name'; nm.textContent=c.name;
        nm.onclick=()=>{ const row=c.el.closest('.lyr-row')||c.el.closest('label'); if(row&&row.scrollIntoView) try{ row.scrollIntoView({block:'nearest'}); }catch(_){} };
        const x=document.createElement('button'); x.className='alc-x'; x.textContent='×'; x.title=(window.IntMapLang.t(lang,'Hide','非表示','Ausblenden','Скрыть','Ocultar'));
        x.onclick=(e)=>{ e.stopPropagation(); c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
        chip.appendChild(nm); chip.appendChild(x); wrap.appendChild(chip);
      });
      /* (#R69) expandable full list — an ABSOLUTE overlay under the bar (so the rows below never move): full
         layer names, the layer's own opacity slider mirrored inline (drives the real control), jump + remove. */
      const findOp=(cb)=>{ try{ const row=cb.closest('.lyr-row')||cb.closest('label'); if(!row) return null;
        let sl=row.querySelector('input[type=range]'); if(sl) return sl;
        let n=row.nextElementSibling,k2=0; while(n&&k2++<2){ if(n.matches&&n.matches('input[type=range]')) return n; const s2=n.querySelector&&n.querySelector('input[type=range]'); if(s2) return s2; n=n.nextElementSibling; } }catch(_){} return null; };
      const expBtn=sec.querySelector('.alc-exp');
      const buildPanel=()=>{
        const old=sec.querySelector('.alc-panel'); if(old) old.remove();
        const pn=document.createElement('div'); pn.className='alc-panel';
        if(!chips.length){ const em=document.createElement('div'); em.className='alc-empty'; em.textContent=(window.IntMapLang.t(lang,'No layers are on','表示中のレイヤーはありません','Keine aktiven Ebenen','Нет активных слоёв','Sin capas activas')); pn.appendChild(em); }
        chips.forEach(c=>{ const row=document.createElement('div'); row.className='alc-row';
          const nm=document.createElement('span'); nm.className='alcr-name'; nm.textContent=c.name; nm.title=c.name;
          nm.onclick=()=>{ const r2=c.el.closest('.lyr-row')||c.el.closest('label'); if(r2&&r2.scrollIntoView) try{ r2.scrollIntoView({block:'nearest'}); }catch(_){} };
          row.appendChild(nm);
          const src=findOp(c.el);
          if(src){ const rg=document.createElement('input'); rg.type='range';
            rg.min=src.min||0; rg.max=src.max||1; rg.step=src.step||'any'; rg.value=src.value;
            rg.title=(window.IntMapLang.t(lang,'Opacity','不透明度','Deckkraft','Непрозрачность','Opacidad'));
            rg.oninput=()=>{ try{ src.value=rg.value; src.dispatchEvent(new Event('input',{bubbles:true})); src.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} };
            row.appendChild(rg); }
          const x=document.createElement('button'); x.className='alc-x'; x.textContent='×'; x.title=(window.IntMapLang.t(lang,'Hide','非表示','Ausblenden','Скрыть','Ocultar'));
          x.onclick=()=>{ try{ c.el.checked=false; c.el.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0); };
          row.appendChild(x); pn.appendChild(row); });
        sec.appendChild(pn); };
      const setExp=(on)=>{ window._alcExpanded=!!on; expBtn.classList.toggle('on',!!on); expBtn.setAttribute('aria-expanded',on?'true':'false');
        if(on) buildPanel(); else { const old=sec.querySelector('.alc-panel'); if(old) old.remove(); } };
      expBtn.onclick=(e)=>{ e.stopPropagation(); setExp(!window._alcExpanded); };
      if(!window._alcCloser){ window._alcCloser=true;
        document.addEventListener('pointerdown',(e)=>{ try{ if(!window._alcExpanded) return; const s2=document.getElementById('layer-active-section'); if(s2&&!s2.contains(e.target)){ window._alcExpanded=false; const b2=s2.querySelector('.alc-exp'); if(b2){ b2.classList.remove('on'); b2.setAttribute('aria-expanded','false'); } const old=s2.querySelector('.alc-panel'); if(old) old.remove(); } }catch(_){} }); }
      if(window._alcExpanded) setExp(true);   /* keep the list open across rebuilds (layer set changed) */
      _restore();
    };
    /* (#R34) Relocate the Active-layers bar to the right scroll container per platform. On mobile it must be a
       sticky LAST CHILD of the SHEET scroller (.m-sheet-scroll) so it pins to the sheet bottom; on desktop it
       belongs at the bottom of the dropdown. reorganizeLayerPanel always re-appends it to the dropdown, so we
       re-place it after every reorganize and on layout changes. */
    /* (#R64) the bar goes to the TOP of its scroll container on BOTH platforms ("一番下にあったら意味ない");
       its fixed-height chip row keeps the R32 no-reflow guarantee. */
    window._placeActiveSection=function(){
      try{ const act=document.getElementById('layer-active-section'); if(!act) return;
        const isM = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
        if(isM){ const sc=document.querySelector('#mo-sheet .m-sheet-scroll'); if(sc && sc.firstChild!==act) sc.insertBefore(act,sc.firstChild); }
        /* (#R70) while the right tile sidebar is open, the Active-layers bar lives at ITS top */
        else if(document.body.classList.contains('lsr-open')){ const bd=document.querySelector('#layer-sidebar-r .lsr-body'); if(bd && bd.firstChild!==act) bd.insertBefore(act,bd.firstChild); }
        else { const dd=document.getElementById('layer-dropdown'); if(dd && dd.firstChild!==act) dd.insertBefore(act,dd.firstChild); }
      }catch(_){}
    };
    /* Any layer checkbox toggle → refresh the active-layers list (deferred so toggleLayer runs first). */
    document.getElementById('layer-dropdown')&&document.getElementById('layer-dropdown').addEventListener('change',(e)=>{
      if(e.target&&e.target.type==='checkbox'){ setTimeout(()=>{ try{ window._refreshActiveLayers(); }catch(_){} },0);
        /* (#R24 fix) ONE deferred label re-assert, and NOT during the intro demo. The old 60/400/1200 ms burst
           spammed moveLayer → styledata, which kept the map from reaching 'idle' — and the GIBS overlays
           (nightsat/relief/popgrid) add inside `whenStyleReady()` (resolves on idle), so during the demo's
           rapid cycling their add was delayed past the 6.5 s window → "ケッペン以外のレイヤーが表示されない".
           The existing idle/styledata self-heal (labels-on-top block) keeps labels on top during the demo. */
        if(!window._imDemoActive) setTimeout(()=>{ try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} },700); }
    });
    /* (#R106) re-localize the "Active layers" heading (+ empty/chip text) on a language change. _refreshActiveLayers
       early-returns when the layer SET is unchanged (a signature guard), so the heading stayed in the old language
       ("言語設定を変えてもすぐ変わらない" in the Layers window). Clear the sig so it truly re-renders. */
    window.addEventListener('intmap-lang',()=>{ try{ const sec=document.getElementById('layer-active-section'); if(sec) sec.dataset.sig='relang'; /* a sentinel that never equals a real layer-name signature (incl. the empty "0 layers" case) → truly forces a re-render */ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){} });
    /* (#R28) SCROLL-CANCEL guard — only cancel a layer toggle when the gesture was a REAL scroll/drag,
       NOT a tap that jittered a little. The R27 version cancelled ANY click after a >10px pointer move,
       which silently DROPPED legitimate taps (a finger tap easily moves >10px on a phone) → that was the
       "チェックの動作が不安定" / "デスクトップでもチェックを付けても動かない" instability. The right signal is
       whether the LIST actually scrolled: remember the scroll container's scrollTop on pointer-down, and on
       click cancel ONLY if it moved (a real scroll) or the pointer travelled a long way (>26px = a drag, not
       a tap). A clean tap ALWAYS toggles; a scroll NEVER toggles. We only ever SUPPRESS — we never synthesize
       a toggle — so this can never turn a layer on by itself (no phantom layers). */
    /* (#R29) DETERMINISTIC single-toggle for the simple layer rows (the 4 utility toggles + every
       strategic/geo `label.layer-option`). The user re-reported the 4 checks "チラついたり誤チェックが入る".
       Root model: a tap can (a) double-fire on touch, or (b) land on a row a mid-tap reflow shifted →
       the WRONG row toggles. Fix: we OWN the toggle — preventDefault the native label toggle and toggle
       EXACTLY the row the FINGER WENT DOWN ON, exactly once, and only if the gesture was a real tap (no
       scroll, no drag, didn't drift to another row). Interactive sub-controls (color/opacity/buttons)
       are left alone. Rows with sub-controls (.lyr-row) keep suppress-only so their controls still work. */
    (function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      const scrollerOf=(el)=>{ let n=el; while(n&&n!==document.body){ const st=getComputedStyle(n); if(/(auto|scroll)/.test(st.overflowY)&&n.scrollHeight>n.clientHeight+2) return n; n=n.parentElement; } return dd; };
      const SUBCTRL='button, input[type=color], input[type=range], select, a, textarea, [role="button"], input[type=date], .alc-x, .alc-name, .alc-clear-all';
      /* (#R37) Resolve the checkbox a tap should toggle from EITHER a `label.layer-option` OR the whole
         `.lyr-row` (so a tap on the row's padding — outside the inner label — is no longer a dead zone, a
         real part of "しっかりタップしないとチェックがつかない"). The box always has pointer-events:none, so the
         finger never lands on the <input> itself → we are always the single, deterministic toggle path. */
      const boxFor=(el)=>{ if(!el||!el.closest) return null;
        const lab=el.closest('label.layer-option'); if(lab){ const c=lab.querySelector('input[type=checkbox]'); if(c) return c; }
        const row=el.closest('.lyr-row'); if(row){ const c=row.querySelector('input[type=checkbox]'); if(c) return c; }
        return null; };
      let downBox=null, downX=0, downY=0, far=false, pUpRan=false;
      dd.addEventListener('pointerdown',(e)=>{ pUpRan=false; if(e.target.closest&&e.target.closest(SUBCTRL)){ downBox=null; return; } downBox=boxFor(e.target); downX=e.clientX; downY=e.clientY; far=false; },true);
      /* >30px finger travel = a genuine drag/scroll (well above tap jitter, well below a deliberate swipe).
         This — NOT scrollTop-delta (momentum-settle false-positives, R28→R36) — is the reliable scroll signal. */
      dd.addEventListener('pointermove',(e)=>{ if(Math.abs(e.clientX-downX)>30||Math.abs(e.clientY-downY)>30) far=true; },true);
      /* (#R38) ROOT FIX for the re-reported "感度がよわい / しっかりタップしないとチェックがつかない": the toggle used to
         fire on the synthetic CLICK, which iOS emits ~300ms late and DROPS unpredictably inside a scroll container —
         so a normal tap often did nothing unless you pressed firmly. Toggle on POINTERUP instead (fires the instant
         the finger lifts, every time); the click handler is now ONLY a suppressor so the native label→checkbox
         activation can never double-toggle. Down-targeting (toggle the row the finger went DOWN on) is KEPT — it
         fixed "タップした行と違う行が反応する / Grid が勝手にチェックされる". We only ever SUPPRESS on a real drag —
         never synthesize a phantom toggle (no auto-check). */
      const toggleFromPointer=(e)=>{
        if(e.target.closest && e.target.closest(SUBCTRL)) return;
        const cb = downBox || boxFor(e.target);
        if(!cb || !cb.isConnected || far || cb.disabled) return;
        const scNow=scrollerOf(cb); const tp=scNow?scNow.scrollTop:0;
        const pin=()=>{ if(scNow){ scNow.scrollTop=tp; requestAnimationFrame(()=>{ try{ if(scNow.scrollTop!==tp) scNow.scrollTop=tp; }catch(_){} }); setTimeout(()=>{ try{ if(scNow.scrollTop!==tp) scNow.scrollTop=tp; }catch(_){} },0); } };
        cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true}));
        try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
        pin();
      };
      dd.addEventListener('pointerup',(e)=>{ pUpRan=true; try{ toggleFromPointer(e); }catch(_){} },true);
      dd.addEventListener('click',(e)=>{
        try{
          if(e.target.closest && e.target.closest(SUBCTRL)) return;     /* a real control handles itself */
          const r=e.target.closest&&(e.target.closest('label.layer-option')||e.target.closest('.lyr-row'));
          if(r){ e.preventDefault(); e.stopPropagation();   /* cancel the native label→box click so it can't double-toggle */
            if(!pUpRan){ toggleFromPointer(e); }            /* fallback for engines that synthesize click without pointerup */
          }
        }catch(_){ } finally { pUpRan=false; }
      },true);
    })();
    window.reorganizeLayerPanel=function(){
      const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      try{
        /* (#R15 / #26) Curated taxonomy. Only the layers the user wants front-and-center live in these
           categories; every other (beta / incomplete) layer is swept into the "Others (beta)" group at the
           bottom so the panel reads cleanly. (#R15c) ec-time moved OUT of the panel into a floating legend. */
        /* (#R32b) The World-Bank choropleths + earthquakes are PROMOTED out of "Others (beta)" into real
           groups ("正規レイヤーに") — wbco2/wbforest = environment, the rest = population & economy, eq = hazards. */
        /* ══ ⚠⚠⚠ (#R271) THE PANEL WAS RE-SORTED, THIS TIME BECAUSE IT WAS ASKED FOR ═════════════
           「レイヤーのカテゴリ分類があきらかに不適切なレイヤーが大量にある。大規模にレイヤーカテゴリ分類を
             再編しろ。」

           #R255, #R258, #R261 and #R270 all wrote the same ⚠ note into this file — 「再編 is not a
           licence to overturn a list the reader wrote out by hand」 — and each moved three or four
           rows. That reservation was right while the instruction said 「任せる」 about 「いくつか」.
           It is now 「大量にある」 and 「大規模に…再編しろ」, which is the licence those notes said they
           did not have, so the whole panel was read against its headings and TWENTY rows moved. Each
           one is named below with the reason, and the reason is always the same shape: the row's own
           subject names a category that exists on this panel and is not the one it was on.

           WHAT MOVED, and out of / into what:
             · 民主主義指数 `dem`, 汚職・腐敗指標 `cpi`   人口・経済 → 政治・統治
               Two governance indices on the population shelf while a Politics & governance shelf
               existed (#R255 created it and #R270 explicitly left these two behind, saying 「say the
               word and they move」). This is the word.
             · 平均寿命 `lifeexp`                        人口・経済 → 医療・衛生
               …where 平均寿命（世界銀行） `wblife` already was. Two life-expectancy rows, two shelves.
             · エネルギー構成 `energy`                    人口・経済 → エネルギー・資源
               #R254 filed it under 人口・経済 because there was no energy shelf; #R258 built one.
             · オーロラ予測 `aurora`                      災害・夜空 → 宇宙・軌道
               A space-weather forecast, beside the satellites it disturbs.
             · 夜間光 `nightsat`                          災害・夜空 → 人口・経済
               Night lights are the satellite view of where people live; they are not a hazard.
               (…and with those two gone the heading no longer says 「夜空」 — see the locale files.)
             · 人口増加率・65歳以上・合計特殊出生率（世界銀行）・都市人口・農村人口・人口密度（世界銀行）・
               難民受け入れ数  `wbpopgrow` `wbaging` `wbfert` `wburb` `wbrural` `wbdensity` `wbref`
                                                          社会・教育 → 人口・経済
               Seven demographic series were on the education shelf while the population shelf held
               eight rows. A reader looking for 人口 statistics looks under 人口.
             · 土地被覆・エコリージョン・植生指数・森林面積率
               `worldcover` `ecoregions` `gxndvi` `wbforest`   地形・標高 → 自然・土地被覆 (NEW)
               Land COVER is not elevation. Four rows about what grows on the ground were filed with
               the rows about the shape of it; they get their own shelf.
             · 3D建物（都市）`bldg3d`                     地形・標高 → テクノロジー・インフラ
               #R261 filed it under terrain with 「built ground is still ground」. A building is not
               ground; it is built infrastructure, which this panel has a shelf for.
             · タイムゾーン `tz`                          指標・オーバーレイ → the always-on switches
               「指標・オーバーレイ」 held exactly one row. A live-clock overlay of the whole planet is
               the same KIND of switch as the grid and the day/night shading (#R233's reasoning for
               `nightside`), so it joins them and the one-row shelf is empty (its KEY is kept).

           ⚠ WHAT DID NOT MOVE, and why: every row whose subject the heading above it actually names.
           #R254's sixty-one World-Bank rows keep their families and their internal order; the four
           shelves #R261 created keep their contents; nothing is deleted, and the safety sweep at the
           end of this function still catches anything unlisted. */
        const GROUPS=[
          /* ══ (#R268) FOUR ROWS THAT WERE ON THE WRONG SHELF ══════════════════════════════════════
             「レイヤーのカテゴリ分類があきらかに不適切なレイヤーがいくつかある。任せる。」 Only rows whose
             own subject names a different category are moved, and each one is said out loud here;
             #R233's 人口・経済 seven and #R254's World-Bank list are untouched, for the reason
             #R255/#R258/#R261 all give — 再編 is not a licence to overturn a list written by hand.
               · `wbforest` 森林面積率 : Climate → Terrain & land. It is a LAND-COVER share, and it
                 belongs beside `worldcover` and `ecoregions`, not beside CO₂ and rainfall.
               · `wbagri` 農地率 : Terrain → Agriculture. Its own twin `wbagremp`(農業就業率) was
                 already there and these two are the same subject counted two ways.
               · `gxsoil` 土壌水分 : Terrain → Agriculture. The layer's own note says what it is for
                 — 「干ばつ・農業の指標」 — and that sentence names the category.
               · `wbpm25` PM2.5大気汚染 : Health → Climate & atmosphere, where the other three air
                 -composition rasters (AOD, UV aerosol index, CO) already are. Air pollution was
                 split across two shelves by whether the number came from a satellite or a table. */
          ['lyrGrpClimate',['climate','ec-temp','annprecip','wind','radar','ec-cloud','snow','aod','wbpm25','wbco2']],   /* (#R289) the two CO₂ rows (#R261) are ONE row with a total/per-capita switch in its own legend; 紫外線エアロゾル指数・一酸化炭素・雲・赤外 are deleted */
          /* (#R202) `sats` moved OUT of Maritime and into its own group, second from the top — see the
             lyrGrpOrbit note above. Nothing else moved: live aircraft stay where they were. */
          ['lyrGrpOrbit',['sats','osmspace','aurora']],   /* (#R261) +spaceports and satellite ground stations — a one-row shelf is not a category */
          /* ⚠ (#R255) `subcables` LEFT THIS GROUP for Technology & infrastructure. A submarine cable
             is under the sea the way a railway is under a hill — the sea is where it runs, not what
             it is — and a reader looking for the internet's physical plant looks under technology,
             beside the data centres it lands at. ⚠ It must appear in exactly ONE list: `order.push`
             MOVES the element, so an id in two groups renders only in the last one. */
          /* (#R261) `planes` LEFT for Transport & mobility (it is aircraft, not ocean); tides and
             ocean currents ARRIVED from the beta sweep — both are finished world-packs layers with
             their own panel, legend and sources, and neither was ever demoted by an instruction. */
          ['lyrGrpMaritime',['sst','tides','currents','gxseaice','gxsstanom']],   /* (#R184) the live-satellite layer filed beside live aircraft — 「Live aircraft trafficの要領で」; moved to lyrGrpOrbit in #R202. (#R42b) chlorophyll-a DEMOTED to Others(beta) per request — stays out of the real group, swept into beta below */
          /* (#R273) +slope / aspect (← Beta, where it had no shelf): it is computed FROM the
             elevation model and belongs beside the hillshade and the contours. */
          ['lyrGrpTerrain',['plates','relief','hillshade','contours','slope','sealevel','gxrelief']],
          /* (#R271) the new shelf: what is ON the ground, as against the shape of it */
          ['lyrGrpNature',['worldcover','ecoregions','gxndvi','wbforest']],   /* (#R261) +3-D city buildings — built ground is still ground */   /* (#R40) Blue Marble removed (deleted); +agricultural-land (World Bank) promoted. (#R42) +soil moisture (AMSR2, objective + exact legend) */
          /* ⚠ (#R233) SEVEN, NAMED BY THE INSTRUCTION — everything else in this group was DEMOTED.
             「人口・経済レイヤーは 人口密度（1kmグリッド）／1人当たりGDP／合計特殊出生率／HDI (2022)／
             民主主義指数 (2023)／汚職・腐敗指標／平均寿命 以外のものはbetaに降格。」
             #R39/#R40 had promoted eighteen more World-Bank choropleths here on the argument that they
             were "objective and sourced", which is true and is not the same question as whether the
             category reads as a curated set. Nothing is deleted and nothing is unreachable: a row that
             leaves a GROUP falls through the safety sweep below into Others (beta), which is exactly
             where 'beta に降格' puts it — same row, same data, same legend, one section lower. */
          /* (#R254) 「エネルギー構成レイヤーは昇格」 — out of the beta sweep and into the curated set,
             beside the other per-country statistics (confirmed: 人口・経済). It is the world-packs row
             `wp-dl-energy`; see rowFor's prefix list. */
          /* ══ ⚠⚠⚠ (#R273) THE BIG RE-SHELVING — AND THE PERMISSION FOR IT IS EXPLICIT ═════════
             「レイヤーのカテゴリ分類があきらかに不適切なレイヤーが大量にある。大規模にレイヤーカテゴリ分類を再編しろ。」
             — and, asked directly whether the hand-written lists (#R233's seven, #R254's sixty-one
             and their order) were included: 「全部動かしてよい」. #R255, #R258, #R261 and #R270 each
             wrote the note that 再編 is not a licence to overturn a list somebody wrote out by hand,
             and each was right at the time. That reservation is now withdrawn in writing, so this
             round applies ONE rule to all 167 rows:

                 A LAYER BELONGS TO THE SUBJECT IT MEASURES — not to the instrument that produced
                 it, not to the place it happens to be about, and not to the family of the table it
                 came out of.

             Fourteen rows moved and one heading was renamed; every one is named on its own line
             below with the sentence that puts it where it now is. Nothing is deleted, nothing
             becomes unreachable, and no row that an instruction DEMOTED (the ECMWF rasters, #R40)
             is promoted — 「beta」 is a judgement about quality and this is one about subject. */
          /* (#R273) −GDP per capita (→ Economy: it measures the economy), −HDI (→ Society: a
             human-development composite of health, schooling and income), +adolescent fertility
             (← Health: it is a fertility rate, and the other four already live here). The heading
             is 「人口・人口動態」 now, because with GDP gone there is no economy left on the shelf. */
          ['lyrGrpDemo',['popgrid','tfr','nightsat','wbpopgrow','wbaging','wbfert','wbadofert','wburb','wbrural','wbdensity','wbref']],
          /* (#R233) 'nightside' LEFT this group — 「昼夜の表示はレイヤー選択欄の基本表示カテゴリです。」
             It is not a hazard overlay, it is which half of the planet the Sun is on, so it belongs with
             the other always-there view switches (place names, borders, roads, grid) at the top of the
             panel. Moved by name into that list below, not duplicated: one row, one owner. */
          ['lyrGrpHazard',['thermal','volc2','eq','alerts','osmemg']],   /* (#R270) +emergency response bases — see the note below */   /* (#R273) +live weather & disaster warnings — one national agency per country, GDACS removed */   /* (#R232) the flat 'night' disc row became the day/night SHADING switch */
          /* ══ ⚠ (#R255) FOUR NEW CATEGORIES, AND «Geopolitics & defense» SPLIT INTO TWO OF THEM ══════
             「政治、軍事、医療・衛生、IT・テックレイヤーカテゴリを追加し、レイヤーの再編や追加を行うように。
               それぞれのレイヤーカテゴリの名前は任せる。」 (naming delegated; reorganisation confirmed
             as «任せる» when asked.)

             `lyrGrpGeoPol` was one shelf holding two unrelated subjects — who governs (elections, EU
             membership, democracy and corruption indices) and who is armed (defence spending, NATO,
             a front line). It is replaced by `lyrGrpPolitics` and `lyrGrpSecurity`, which is the
             split the instruction names. The health family and the digital/infrastructure family were
             not shelved at all: #R233 demoted the World-Bank health indicators to «Others» with the
             rest of that table, and the submarine cables sat in «Oceans & maritime» because that is
             where the water is — neither is where a reader looks for them.

             ⚠ NOTHING IS DELETED AND NOTHING BECOMES UNREACHABLE. Every id below already existed; a
             row that leaves one GROUP arrives in another, and the safety sweep at the end of this
             function still catches anything not listed. `lyrGrpGeoPol`'s KEY is retained in the nine
             locale files (an old saved session or a share link can still name it) — it simply has no
             rows any more, and a group with no rows is not rendered.
             ⚠ `rail` is in Technology & infrastructure on purpose: it is the rail NETWORK layer
             (js/routing.js, line colours and routing), i.e. built infrastructure, which is what that
             category is named for — the base «Railways» toggle is a different row and stays at the
             top with the other always-there view switches.
             ⚠⚠ 民主主義指数 (`dem`), 汚職・腐敗指標 (`cpi`) and 平均寿命 (`lifeexp`) READ like Politics and
             Health and are DELIBERATELY LEFT in 人口・経済: #R233 is an explicit instruction naming
             those seven rows as that category's contents, and this round's authorisation to
             reorganise is not a reason to quietly overturn a list the reader wrote out by hand. Say
             the word and they move. */
          /* (#R273) +maritime EEZ / 12 nm (← Oceans): an exclusive economic zone is a JURISDICTION
             drawn on water, not a property of the water — it belongs with the other borders. */
          ['lyrGrpPolitics',['uselect','eu','dem','cpi','eez','wbwomparl','osmdiplo']],
          /* ══ ⚠ (#R270) THREE ROWS WERE ON THE WRONG SHELF, AND ONLY THREE ═════════════════════════
             「レイヤーのカテゴリ分類があきらかに不適切なレイヤーがいくつかある。任せる。」

             The whole panel was read against its headings again (167 rows, 17 headings). Most of it
             is where a reader would look; these three were not, and each is wrong for a reason that
             can be stated rather than felt:

               · 殺人発生率 (`wbhomicide`) was in 「軍事・安全保障 / Defense & security」, whose other
                 seven rows are defence spending, NATO, armed-forces strength, a front line and
                 military installations. A homicide rate is a crime statistic about a society, and it
                 joins the social indicators.
               · 緊急対応拠点 —— 消防・警察・救急 (`osmemg`) was in 「医療・衛生 / Health & sanitation」.
                 An ambulance station belongs to that subject; a POLICE station and a FIRE station do
                 not. All three are what a place has for an emergency, so they sit with the hazards.
               · 合計特殊出生率 (`wbfert`) was in Health, one shelf away from the OTHER 合計特殊出生率
                 (`tfr`, in 人口・経済) and away from the World-Bank demographic family it belongs to
                 (人口増加率・65歳以上人口比率・都市/農村人口比率・人口密度), all of which are in
                 Society & education. It joins them, and its NAME now says which of the two it is.

             ⚠ NOTHING ELSE MOVED, and that is deliberate. #R233's seven in 人口・経済, #R254's
             sixty-one and #R261's four new shelves were each written out by a reader by hand, and
             「任せる」 for the obviously-wrong rows is not a licence to re-sort a list somebody chose.
             オーロラ予測 and 夜間光 stay in 「災害・夜空 / Hazards & night sky」 — that heading names
             them; the shelf is not only about disasters. */
          ['lyrGrpSecurity',['milSpend','nato','ukrfront','wbmilgdp','wbmilppl','osmmil']],   /* (#R289) 国防費 is one row with a $B / %GDP switch */
          /* (#R273) −clean cooking fuel access (→ Energy: it is an energy-access rate and sits
             beside electricity access), −undernourishment (→ Agriculture & food: it measures food),
             −adolescent fertility (→ Population), −pharma hubs (→ Economy: they are factories).
             What is left is care, disease, sanitation and the things a body does. */
          ['lyrGrpHealth',['wbhealth','wbphys','wbbeds','wbinfmort','wbu5mort','lifeexp','wblife','wbwater','wbsan','wbsmoke','wbalcohol','wbsuicide','wboverwt','osmhealth','osmwater']],   /* (#R261) +water & wastewater plant, +pharma hubs. (#R270) −emergency services (→ hazards), −fertility (→ society) */
          /* (#R261) `rail` LEFT for Transport & mobility — a railway network is transport, and the
             category it was in is the one about computing and communications. */
          /* (#R273) −high-tech exports (→ Economy: it is a share of EXPORTS, i.e. a trade
             statistic), − 3-D city buildings (→ the always-on view switches at the top: it is a way
             of DRAWING the map, like Roads and Place names, not a statistic about technology). */
          ['lyrGrpTech',['dc','subcables','wbnet','wbmobile','wbbbnd','wbrnd','wbresearch','wbpatent','osmtelecom']],
          /* ══ ⚠⚠ (#R261) FOUR NEW SHELVES, AND «OTHERS» AND «BETA» EMPTIED INTO THEM ═══════════════
             「追加すべきと思うレイヤーカテゴリはありますか？あれば作り、Others, Betaも含め既存レイヤーの
               再編のほか、新レイヤー…全部任せる。結局何もしませんはやめろ。」

             This is the authorisation #R255 and #R258 both said they did not have. Both wrote the
             same ⚠ note — «再編 is not a licence to overturn a list the reader wrote out by hand» —
             and refused to touch #R233's seven or #R254's sixty-one. The instruction now names
             Others and Beta specifically, so those two are what moves; #R233's 人口・経済 seven and
             #R254's energy-mix promotion stay exactly where the reader put them.

             WHAT WAS WRONG, MEASURED off the shipped panel (167 rows, 16 headings):
               · «Others» was 33 rows and every one was a World-Bank indicator — inflation beside
                 literacy beside refugees beside renewable electricity. That is not a category, it is
                 the tail of one table. It is now four families: economic (14), social and
                 educational (14), energy (5), and CO₂ total, which joins its own per-capita twin in
                 Climate. Nothing is dropped and the order inside each family is #R254's.
               · «Beta» was 40 rows, six of which are finished world-packs layers with their own
                 panel, legend, time-machine wiring and published sources (trade flows, ocean
                 currents, tides, crops, industry web, weather warnings). They were never demoted by
                 an instruction; they had no shelf and fell through the safety sweep at the end of
                 this function.
               · Three shelves had ONE row (Space & orbit, Indicators) or two (Energy). Six new
                 surveyed-object layers (js/osm-facilities.js) fill them with things you can click.
             ⚠ NOTHING DEMOTED BY AN INSTRUCTION IS PROMOTED. The GIBS rasters and the plain
             temp/precip rows carry «DEMOTED to Others(beta) per request» in #R40's note, and the
             ECMWF family sits with them; all of that stays in Beta. Assuming a past instruction has
             expired is the failure this file has warned about twice. */
          /* (#R273) +GDP per capita (← Population), +extreme poverty, +income inequality (Gini) and
             +female labour participation (← Society: all three measure income and the labour market),
             +high-tech exports (← Technology), +pharma manufacturing hubs (← Health). */
          ['lyrGrpEconomy',['trade','industry','gdppc','wbgdpgrow','wbinfl','wbtrade','wbtax','wbdebt','wbmanuf','wbhitech','wbfdi','wbunemp','wbgni','wbpov','wbgini','wbflfp','wbremit','wbtour','pharma']],
          /* (#R273) +HDI (← Population: it is the human-development composite), and −poverty,
             −Gini, −female labour participation (→ Economy). */
          ['lyrGrpSociety',['hdi','wblit','wbschool','wbtert','wbedu','osmedu','wbhomicide','cat-religion','cat-language']],   /* (#R270) +homicide rate, +fertility rate — see the note above */
          /* (#R273) +live cameras (← Beta, where it had no shelf rather than a demotion): the feeds
             are road and traffic cameras — TfL JamCams, Caltrans, the DOT 「511」 networks. */
          ['lyrGrpTransport',['planes','rail','ships','oxrail','oxsea','osmair','osmport','webcams']],
          /* (#R273) +undernourishment (← Health): it is the food-security measure, and it belongs
             with the land that grows the food. */
          ['lyrGrpAgri',['crops','wbagri','wbagremp','gxsoil','wbunder']],
          /* ══ (#R258) A FIFTH NEW CATEGORY — WHERE THE ENERGY AND THE MATERIAL COME FROM ═════════════
             「追加すべきと思うレイヤーカテゴリはありますか？あれば作り…新レイヤー（国単位で塗るだけの
               やつじゃなくて、モノホンのやつ。）」 The map had no shelf for energy at all: the country
             energy MIX is a choropleth the reader filed under 人口・経済 by name (#R254) and CO₂ is
             in Climate, so there was nowhere that answers 「この発電所は何を燃やしているのか」. Both
             rows here are surveyed OSM objects for the current view (js/osm-facilities.js), not a
             country painted a colour.
             ⚠ NOTHING IS MOVED INTO IT. Every existing row stays where it is: #R233's seven and
             #R254's sixty-one were named one by one by the reader, and 「再編」 is not a licence to
             overturn a list somebody wrote out by hand (the same reasoning as the ⚠⚠ note above). */
          /* (#R273) +clean cooking fuel access (← Health), directly beside electricity access:
             both are 「does this household have energy」 rates. */
          ['lyrGrpEnergy',['osmpower','osmextract','dams','energy','wbelec','wbcook','wbrenew','wbelecuse','wbrenelec','wbenergy']],
          /* (#R271) EMPTY, AND KEPT — `tz` joined the always-on switches at the top of the panel;
             the KEY stays for the same reason `lyrGrpGeoPol` and `lyrGrpOthers` keep theirs. */
          ['lyrGrpIndic',[]],   /* (#R41) Indicators & overlays — Time-zone layer promoted out of beta (objective Natural Earth data, has a legend + live clock) */
          /* ══ ⚠ (#R254) "OTHERS" IS A REAL CATEGORY NOW, AND "BETA" MEANS BETA ═══════════════════════
             「以下のレイヤーは、Others(beta) layersから移動し、新たなカテゴリであるOthersにおくこと。
               Others(beta)は単にベータとすること。」 The sixty-one rows named in that instruction are
             EXACTLY the World-Bank indicator rows that #R233 demoted (`bx-wb*`, ids without the
             prefix here — the row wrapper is `lyrrow-<id>`); the only three `bx-wb*` rows NOT in the
             reader's list are wbco2 / wbforest / wbagri, and those three are already filed in Climate
             and Terrain above. So this list is not a hand-picked subset that will drift: it is «the
             World-Bank indicator family», and the demoted-vs-promoted split is now a category rather
             than a beta warning. The group is ordered exactly as the instruction listed them.
             ⚠ `lyrGrpOthers` keeps its KEY and loses its «(beta)» wording in all nine languages — the
             key is what js/map-ui.js and js/layer-dropdown.js use to find the collapsible beta group
             on mobile, and renaming it would silently un-collapse that section. */
          /* (#R261) EMPTY, AND KEPT — every one of #R254's thirty-three rows is on a named shelf
             above, in the order that instruction listed them. The KEY stays for the same reason
             #R255 kept `lyrGrpGeoPol`: an old saved session or a share link can still name it, and a
             group with no rows is simply not rendered. Nothing is deleted; the shelf is empty
             because the things on it found their families. */
          ['lyrGrpOthersReal',[]]
        ];
        /* Explicit order for the Others/beta group; a safety sweep below also catches anything missed. */
        const OTHERS_IDS=['ec-precip','precip','ec-wind','ec-dew','ec-isobars','ec-slp','ec-cape','ec-sst'];   /* (#R261) `ships` → Transport, `dams` → Energy & resources */   /* (#R225) the nine geopolitics keys left this list with the layers themselves */
        const rowFor=(id)=>{ let el=document.getElementById('lyrrow-'+id); if(el) return el;
          /* (#R20) beta-dl- so promoted ex-beta layers (histb, ukrfront) can be filed into a real group.
             (#R254) …and wp-dl- for the same reason, so a world-packs row (energy mix) can be too. */
          /* (#R255) …and fac-dl- for the four surveyed-facility layers (js/osm-facilities.js). */
          /* ⚠ (#R261) …and `ox-` for the two OpenRailwayMap / OpenSeaMap overlays. MEASURED: filing
             them under Transport & mobility changed nothing at all — the group came out with five
             rows instead of seven and both stayed in Beta, because this list is what turns an id
             into a row and it had never been told about that prefix. A prefix table is a place a
             new family gets forgotten, which is why the check is a test now (tests/r261). */
          el=document.getElementById('eco-dl-'+id)||document.getElementById('l9-dl-'+id)||document.getElementById('beta-dl-'+id)||document.getElementById('wp-dl-'+id)||document.getElementById('fac-dl-'+id)||document.getElementById('ox-'+id); if(el) return el.closest('.lyr-row')||el.closest('label');
          el=dd.querySelector('input[data-layer="'+id+'"]'); if(el) return el.closest('.lyr-row')||el.closest('label');
          return null; };
        const lang=(typeof HOST.lang!=='undefined')?HOST.lang:'en';
        const T=(k)=>{ try{ return (i18n[lang]&&i18n[lang][k])||(i18n.en&&i18n.en[k])||k; }catch(_){ return k; } };   /* (#R40) fall back to English (e.g. Spanish/beta) so group headers never show the raw key */
        /* strip old headers + top-level dividers (favorites' inner <hr> is nested, so it survives) */
        dd.querySelectorAll(':scope > .layer-group-title, :scope > .lyr-head').forEach(n=>n.remove());
        dd.querySelectorAll(':scope > hr').forEach(n=>n.remove());
        dd.querySelectorAll(':scope > .lyr-others-note').forEach(n=>n.remove());   /* (#R15b) was accumulating one note per run */
        const order=[];
        const fav=document.getElementById('layer-fav-section'); if(fav) order.push(fav);
        /* (#R33) Requested order: Place names, Country borders, State/province, Roads, Railways, Grid, Countries(info). */
        ['cb-names','cb-geolabels','cb-poi','cb-borders','cb-coast','cb-admin1','cb-roads','cb-rail2','cb-grid','cb-countries'].forEach(id=>{ const el=document.getElementById(id); const lab=el&&el.closest('label'); if(lab) order.push(lab); });
        /* (#R233) …and the day/night shading, which is the same KIND of switch as the nine above (a view
           of the whole planet that is either on or off) rather than a data layer about a hazard. It is a
           .lyr-row rather than a bare label, so it is fetched through rowFor() and marked `placed` — the
           safety sweep below would otherwise find it unplaced and file it under Others (beta). */
        const nsRow=rowFor('nightside'); if(nsRow){ try{ nsRow.style.display=''; }catch(_){} order.push(nsRow); }
        /* (#R271) …and the time zones, for the same reason: a live-clock overlay of the whole planet
           is a view switch, not an indicator, and 「指標・オーバーレイ」 held nothing else. */
        const tzRow=rowFor('tz'); if(tzRow){ try{ tzRow.style.display=''; }catch(_){} order.push(tzRow); }
        /* (#R273) …and the 3-D city buildings, for the same reason again: 「how the map is drawn」
           rather than 「a statistic about a subject」. It was filed under IT & infrastructure, beside
           broadband subscriptions and patent counts. ⚠ `placed.add` below is half of this move. */
        const b3Row=rowFor('bldg3d'); if(b3Row){ try{ b3Row.style.display=''; }catch(_){} order.push(b3Row); }
        /* (#R14 / #17) the live "Active layers" list. DESKTOP: right below the favorites + top toggles.
           (#R25) MOBILE: moved to the BOTTOM (just before Tools) — when it sat at the top, toggling the
           FIRST layer made it appear above the rows and the scroll-compensation had to scroll the list,
           which read as "視点位置がパチっと移動". At the bottom it never pushes the rows you're tapping, so the
           list truly doesn't move on check/uncheck. */
        let act=document.getElementById('layer-active-section'); if(!act){ act=document.createElement('div'); act.id='layer-active-section'; act.style.display='none'; }
        /* (#R28) Active layers is ALWAYS at the TOP now (right below the 4 utility toggles) on EVERY platform.
           The R25 move-to-bottom on mobile read as "active layers欄が消えた" — the list was buried below the
           whole layer list + Tools, so it looked removed. Back at the top it's always visible. (The iOS
           delayed-click retarget that the bottom-placement worked around is already killed by
           touch-action:manipulation, so growing this section no longer mis-targets a tap.) */
        /* (#R32) Active layers is NO LONGER at the top. It is pushed LAST as a position:sticky;bottom:0 bar
           (see end of this fn + the #layer-active-section CSS) so adding/removing chips never reflows the
           rows above → a layer toggle moves the panel 0px on desktop AND mobile, while it stays pinned visible. */
        const mkHr=()=>{ const h=document.createElement('hr'); h.style.cssText='border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;'; return h; };
        /* (#R242) one button, created once and re-used on every rebuild — the same shape `_edu` and
           `btn-correlate` have, so `reorganizeLayerPanel` moves it rather than duplicating it. */
        const _seisBtn=()=>{
          let b=document.getElementById('btn-seismic-sim');
          const lbl=window.IntMapLang.t(lang,'Earthquake simulator','地震シミュレーター','Erdbeben-Simulator','Симулятор землетрясений','Simulador de terremotos');
          if(b){ const sp=b.querySelector('span'); if(sp) sp.textContent=lbl; return b; }
          b=document.createElement('button'); b.id='btn-seismic-sim'; b.type='button'; b.className='ai-test-btn';
          b.style.cssText='width:100%;text-align:center;margin:6px 0 0;';
          b.innerHTML='<span></span>'; b.querySelector('span').textContent=lbl;
          b.onclick=()=>{ try{ const OS=window.IntMapOS; if(OS&&OS.exec&&OS.has&&OS.has('sim.seismic')){ OS.exec('sim.seismic',{source:'ui'}); return; } }catch(_){}
            try{ window.IntMapLazy.need('seismic').then(()=>{ try{ window.IntMapSeismic&&window.IntMapSeismic.open({}); }catch(_){} }); }catch(_){} };
          return b;
        };
        order.push(mkHr());
        const placed=new Set();
        if(nsRow) placed.add(nsRow);   /* (#R233) already in the basic-display block above */
        /* ⚠ (#R271) …AND SO IS THE TIME-ZONE OVERLAY, FOR THE SAME REASON. Pushing a row into the
           always-on block without marking it here does nothing at all: the safety sweep below finds
           it unplaced, and `order.push` MOVES the element, so it lands in Beta. MEASURED on the
           built page before this line existed — 「Beta」 is exactly where 🕒 タイムゾーン came out. */
        if(tzRow) placed.add(tzRow);
        if(b3Row) placed.add(b3Row);
        GROUPS.forEach(([key,ids])=>{ const rows=ids.map(rowFor).filter(Boolean); if(!rows.length) return;
          const h=document.createElement('div'); h.className='lyr-head'; h.setAttribute('data-i18n',key); h.textContent=T(key); order.push(h);
          rows.forEach(r=>{ try{ r.style.display=''; }catch(_){} order.push(r); placed.add(r); }); });
        /* (#R15 / #26) "Others (beta)" — every remaining thematic layer row. Start with the explicit list,
           then a safety sweep adds any layer row not already placed (so new layers never strand at the top). */
        const otherRows=[];
        OTHERS_IDS.forEach(id=>{ const r=rowFor(id); if(r && !placed.has(r)){ otherRows.push(r); placed.add(r); } });
        /* (#R15b) CRITICAL: use :scope > so we only sweep TOP-LEVEL rows. The old `.lyr-row, label.layer-option`
           also matched the <label.layer-option> NESTED inside every .lyr-row and ripped those labels out of
           their parent rows (the panel "ぐちゃぐちゃ"). Direct children only: .lyr-row divs + the standalone
           geo/strategic labels. */
        dd.querySelectorAll(':scope > .lyr-row, :scope > label.layer-option').forEach(r=>{
          if(placed.has(r)) return;
          const cb=r.querySelector('input[type=checkbox]'); if(!cb) return;
          if(['cb-names','cb-geolabels','cb-poi','cb-borders','cb-coast','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2'].includes(cb.id)) return;
          otherRows.push(r); placed.add(r);
        });
        if(otherRows.length){
          const oh=document.createElement('div'); oh.className='lyr-head'; oh.setAttribute('data-i18n','lyrGrpOthers'); oh.textContent=T('lyrGrpOthers'); order.push(oh);
          const note=document.createElement('div'); note.className='lyr-others-note'; note.textContent=(window.IntMapLang.t(lang,'May be incomplete or not fully working.','動作しない場合や不完全な場合があります。','Kann unvollständig sein oder nicht voll funktionieren.','Может быть неполным или работать не полностью.','Puede estar incompleto o no funcionar del todo.')); order.push(note);
          otherRows.forEach(r=>{ try{ r.style.display=''; }catch(_){} order.push(r); });
        }
        /* ══ ⚠ (#R242) THE SEISMIC SIMULATOR IS REACHABLE FROM THE LAYERS PANEL ═════════════════════
           「地震シミュレータはレイヤー欄からも開けるようにしろ。」 It could be opened from Atlas, from
           a right-click on the map (js/tool-panel.js) and from the command palette — none of which is
           where a reader looking for it goes. It joins the Tools strip beside 比較ビュー / 相関分析 /
           プレイグラウンド. ⚠ It is NOT a layer toggle: the module is lazy (js/lazy-modules.js), so
           the button fetches it on press exactly like every other on-demand feature (#R209), and the
           OPEN itself goes through the OS action so the palette and this button are one path. */
        /* Tools section (compare + upload) pinned to the very bottom */
        const upBtn=document.getElementById('btn-upload-geojson');
        const cmpBtn=document.getElementById('btn-compare'); const ugj=document.getElementById('ugj-list');
        const corrBtn=document.getElementById('btn-correlate');   /* (#R39) capture BEFORE tools.innerHTML='' detaches it */
        let tools=document.getElementById('layer-tools'); if(!tools){ tools=document.createElement('div'); tools.id='layer-tools'; }
        const _pr=document.getElementById('lyr-presets');   /* (#R20) rescue the presets host before the wipe */
        const _edu=document.getElementById('edu-mount');    /* (#R20) …and the Education-mode button */
        const _seis=_seisBtn();   /* (#R242) 「地震シミュレータはレイヤー欄からも開けるようにしろ。」 */
        tools.innerHTML='';
        const th=document.createElement('div'); th.className='lyr-head lyr-section-label'; th.style.marginTop='2px'; th.textContent=(window.IntMapLang.t(lang,'Tools','ツール','Werkzeuge','Инструменты','Herramientas')); tools.appendChild(th);
        /* reset display: these persistent buttons get moved here each rebuild; clear any stale display:none
           left over from an earlier collapse so the Tools section always shows (#R13c). */
        if(cmpBtn){ cmpBtn.style.display=''; cmpBtn.style.width='100%'; cmpBtn.style.margin='4px 0 0'; tools.appendChild(cmpBtn); }
        if(corrBtn){ corrBtn.style.display=''; corrBtn.style.width='100%'; corrBtn.style.margin='6px 0 0'; tools.appendChild(corrBtn); }   /* (#R39) two-layer scatter/correlation */
        if(upBtn){ upBtn.style.display=''; upBtn.style.width='100%'; upBtn.style.margin='6px 0 0'; tools.appendChild(upBtn); }
        if(ugj){ ugj.style.display=''; tools.appendChild(ugj); }
        if(_seis) tools.appendChild(_seis);   /* (#R242) the seismic simulator, beside the other tools */
        if(_edu) tools.appendChild(_edu); /* (#R20) Education mode button lives in Tools */
        if(_pr) tools.appendChild(_pr);   /* (#R20) layer presets live in Tools */
        if(cmpBtn||upBtn||_seis){ order.push(mkHr()); order.push(tools); }
        order.forEach(n=>dd.appendChild(n));
        /* (#R64) Active layers is now the sticky-TOP bar ("一番下にあったら意味ない"); its fixed-height chip row
           preserves the R32 zero-movement guarantee. _placeActiveSection (called below) prepends it. */
        dd.insertBefore(act,dd.firstChild);
        /* drop the now-emptied module wrappers (their buttons/lists were moved into Tools above) */
        ['ec-mount','cmp-mount','ugj-mount'].forEach(id=>{ const w=document.getElementById(id); if(w) w.remove(); });
        /* (#R29) Mobile: "Others (beta)" is a pulldown — collapse it by default (unless the user opened it). */
        try{ if(window.matchMedia && window.matchMedia('(max-width:768px)').matches){ const _oh=dd.querySelector(':scope > .lyr-head[data-i18n="lyrGrpOthers"]'); if(_oh && !_oh.dataset.userToggled) _collapseGroup(_oh); } }catch(_){}
        try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
        try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* (#R34) move the bar to the sheet scroller on mobile */
      }catch(e){ try{ console.warn('reorganizeLayerPanel',e); }catch(_){} }
    };
    /* (#R19) Mobile-start smoothness: the very first panel reorganization (a few hundred DOM moves)
       used to run synchronously inside the boot path and contributed to the "スタート時の動作がぎこちない"
       jank. On phones it now waits for an idle slice (the panel is reorganized again on every open
       anyway, so nothing can be stale); desktop keeps the immediate call. */
    if(typeof isMobile==='function'&&isMobile()&&window.requestIdleCallback){ requestIdleCallback(()=>{ try{ window.reorganizeLayerPanel(); }catch(_){} },{timeout:2500}); }
    else window.reorganizeLayerPanel();

    const beforeId = GE().layers.has('tool-poly') ? 'tool-poly' : undefined;
    const setVis=(l,on)=>{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); };
    /* Verified: IMERG date-only URL (e.g. .../IMERG_Precipitation_Rate/default/2026-05-26/...)
       returns 200 OK for tile (0,0,0). The "blank" appearance was because there is little global
       precipitation visible at zoom 0 — keeping the date-only URL like MODIS Temperature. */
    const gibs=(layer,lvl,ext,time)=>[`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${time||GIBS_DATE}/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.${ext}`];
    /* Non-temporal GIBS layers (e.g. GPW population) omit the date segment entirely. */
    const gibsStatic=(layer,lvl,ext)=>[`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.${ext}`];
    function addRaster(id,tiles,maxz){ if(GE().layers.hasSource('src-'+id))return; GE().layers.addSource('src-'+id,{type:'raster',tiles,tileSize:256,maxzoom:maxz}); GE().layers.add({id:'lyr-'+id,type:'raster',source:'src-'+id,layout:{visibility:'none'},paint:{'raster-opacity':opacities[id]}},beforeId); }

    const NATO=new Set("USA CAN GBR FRA DEU ITA ESP PRT NLD BEL LUX DNK NOR ISL POL CZE SVK HUN ROU BGR HRV SVN EST LVA LTU GRC TUR ALB MNE MKD FIN SWE".split(' '));
    /* BUG FIX: previous version polled for the 'countries' source but never created it
       if the style finished loading after countryData arrived. Now we explicitly add
       the source/layers whenever we are ready and it is missing. */
    /* ══ ⚠⚠⚠ (#R254) EVERY COUNTRY LAYER GETS THE 10 m OUTLINE — NOT ONLY THE COUNTRIES TAB ═════════
       「以下のレイヤーは国境線が雑い…勝手に解像度の低い国境線に変えるな。いつもにすればいいだけ。
         これは今後の国境線を使用するものすべてに言える。」

       MEASURED on the shipped build with only 1人当たりGDP switched on: Japan's polygon in the
       `countries` SOURCE carried **65 vertices**, while `window.countryGeo` already held the 10 m
       outline at **6,952** — 107× more, sitting in `window._imCountryGeoPending` and never handed to
       the renderer. Switching Countries(info) on flushed it and the same border became the fine one,
       which is exactly the reader's 「いつもの」.

       WHY. js/countries-ui.js boots on Natural Earth 110 m so the Countries tab can list its rows
       without waiting on 4.3 MB, then parks the 10 m collection until something is about to DRAW it
       (#R195 — pushing 548,000 vertices at a hidden layer cost two CI runs). #R216 gave
       `_imFlushCountryGeo` a `force` flag and used it in js/world-packs.js. This gate — the one every
       `dl-*` choropleth in this file goes through — was never given it, so gdppc / tfr / hdi / dem /
       milSpend / milSpendGDP / pop all painted the 110 m stand-in for the whole session.

       ⚠ `setSourceData` CLEARS FEATURE STATE, and these layers ARE feature state. So the flush is
       asked for BEFORE the paint, and again while the upgrade is still in flight (it lands 4-15 s
       after boot, later on a phone) — and when a late one succeeds, every visible choropleth is
       repainted through `_imReapplyChoros`. One poller for the whole module, not one per layer. */
    let _hiResPolling=false;
    function _hiResCountries(){
      try{ if(window._imFlushCountryGeo&&window._imFlushCountryGeo(true)){ try{ window._imReapplyChoros&&window._imReapplyChoros(); }catch(_){} return; } }catch(_){}
      if(_hiResPolling) return; _hiResPolling=true;
      let n=0;
      (function t(){
        try{ if(window._imFlushCountryGeo&&window._imFlushCountryGeo(true)){ _hiResPolling=false;
          try{ window._imReapplyChoros&&window._imReapplyChoros(); }catch(_){} return; } }catch(_){}
        if(n++<20) setTimeout(t,1500); else _hiResPolling=false;
      })();
    }
    function withCountries(cb){
      loadCountryData().then(()=>{
        function tryAdd(){
          if(_canDraw()&&HOST.countryGeo&&!GE().layers.hasSource('countries')){   /* (#R170) parsed style is all addCountryLayers needs */
            try{ addCountryLayers(); }catch(e){ console.warn('addCountryLayers failed (will retry)',e); }
          }
        }
        tryAdd();
        let n=0;
        (function w(){
          if(GE().layers.hasSource('countries')&&HOST.countryGeo){
            try{ if(window._imFlushCountryGeo) window._imFlushCountryGeo(true); }catch(_){}   /* (#R254) fine borders BEFORE the paint */
            try{ cb(); }catch(e){ console.warn('withCountries cb failed',e); }
            _hiResCountries();                                                               /* (#R254) …and again when the late upgrade lands */
            return; }
          /* Wait MUCH longer (200 tries × 200ms = 40 s) to survive slow CDN style loads. */
          if(n++<200){ tryAdd(); setTimeout(w,200); }
          else console.warn('withCountries: gave up waiting for country source');
        })();
      });
    }
    /* Helper: resolves as soon as it is SAFE TO ADD sources/layers — not when the map has fully settled.
       (#R170) That distinction is the whole point. This gate used to test map.isStyleLoaded(), which in
       MapLibre means "style parsed AND every source cache loaded", so it stayed false for most of the time
       the user was panning (measured 86% of a 12 s pan). Every layer that adds inside whenStyleReady()
       therefore waited for the map to fall idle, or for the 6 s hard-resolve below — measured toggle-ON →
       painted: 4497 ms / 3171 ms while busy vs 189 ms while idle. Same click, wildly different latency:
       the reported 「レイヤーをオンオフしても、時間差で表示されたり表示されなかったりする」.
       HOST.canDraw() answers the question actually being asked (is the style object parsed?), which is all
       addSource/addLayer need. The listeners + poll + hard-resolve below are kept unchanged as the safety
       net for the genuine not-yet-parsed window (first load, and a real setStyle() base-map swap). */
    /* function DECLARATION, not a const: it is called from withCountries() further UP this file, and a
       `const` here would leave those calls in the temporal dead zone (the #R167 trap). */
    function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
    function whenStyleReady(){
      return new Promise(res=>{
        let done=false;
        const fin=()=>{ if(done) return; done=true; try{ GE().events.off('idle',ck); GE().events.off('styledata',ck); GE().events.off('load',ck); }catch(_){} res(); };
        const ck=()=>{ if(_canDraw()) fin(); };
        if(_canDraw()){ res(); return; }
        GE().events.on('idle',ck); GE().events.on('styledata',ck); GE().events.on('load',ck);
        /* (#R41) ROOT CAUSE of "レイヤー/ラベルをチェックしても表示されない・ブラウザ再読み込みで治る": the old version
           waited ONLY on idle/load. If ANOTHER source is still loading or erroring, the map never reaches a clean
           idle, so this promise hung FOREVER and the layer was never added — a reload (clean state) was the only
           cure. Now also listen on styledata, POLL independently (covers the TOCTOU race where the style finished
           between the sync check and the listener registration), and as a last resort resolve anyway after ~6 s —
           addSource/addLayer work fine as long as the style object exists, so a slightly-early add beats a layer
           that never appears. */
        let n=0; (function poll(){ if(done) return; if(_canDraw()||n++>40) fin(); else setTimeout(poll,150); })();
      });
    }
    /* Hover a choropleth country → tooltip with its name + the metric value. */
    const CHORO_META={
      pop:{label:()=>window.IntMapLang.t(HOST.lang,'Pop. density','人口密度','Bevölkerungsdichte','Плотность населения','Densidad de población'), fmt:s=>s.density!=null?Math.round(s.density).toLocaleString()+' /km²':'—'},
      hdi:{label:()=>'HDI (2022)', fmt:s=>s.hdi!=null?s.hdi.toFixed(3):'—'},
      dem:{label:()=>window.IntMapLang.t(HOST.lang,'Democracy Index (2023)','民主主義指数 (2023)','Demokratieindex (2023)','Индекс демократии (2023)','Índice de democracia (2023)'), fmt:s=>s.dem!=null?s.dem.toFixed(2):'—'},
      /* Military spending choropleths (#26) — absolute (SIPRI 2023, $B) and as a share of GDP. */
      milSpend:{label:()=>window.IntMapLang.t(HOST.lang,'Mil. spending (2023)','国防費 (2023)','Militärausgaben (2023)','Военные расходы (2023)','Gasto militar (2023)'), fmt:s=>s.milSpend!=null?'$'+s.milSpend+'B':'—'},
      milSpendGDP:{label:()=>window.IntMapLang.t(HOST.lang,'Mil. spending (% GDP)','国防費 (対GDP)','Militärausgaben (% BIP)','Военные расходы (% ВВП)','Gasto militar (% PIB)'), fmt:s=>{ const p=(s.milSpend!=null&&s.gdp)?(s.milSpend/s.gdp*100):null; return p!=null?p.toFixed(2)+'%':'—'; }},
      /* GDP per capita (#R9) — nominal USD; (#R22) the readout also shows the PPP figure when loaded. */
      gdppc:{label:()=>window.IntMapLang.t(HOST.lang,'GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу населения','PIB per cápita'), fmt:s=>s.gdppc!=null?(fmtPc(s.gdppc)+(s.gdppcPPP!=null?' · PPP '+fmtPc(s.gdppcPPP):'')):'—'},
      tfr:{label:()=>window.IntMapLang.t(HOST.lang,'Total fertility rate','合計特殊出生率','Geburtenrate (TFR)','Суммарный коэффициент рождаемости','Tasa de fecundidad total'), fmt:s=>s.tfr!=null?s.tfr.toFixed(2):'—'}
    };
    /* (#R13c) Value of the active choropleth under the cursor, for the bottom-left coord readout —
       so EVERY numeric layer (not just Köppen/temp/SST) shows its value at the cursor. One
       queryRenderedFeatures over all visible choropleth fills → topmost wins. Returns "Label: value". */
    window.choroValueAt=function(lng,lat){
      try{
        if(!GE().hasRenderer()||!countryStats) return null;
        const fillIds=Object.keys(CHORO_META).map(id=>id+'-fill').filter(L=>GE().layers.get(L));
        if(!fillIds.length) return null;
        const pt=GE().coords.project([lng,lat]);
        const cv=GE().render.canvas();
        const onScreen=pt&&pt.x>=0&&pt.y>=0&&pt.x<=((cv&&cv.clientWidth)||1e9)&&pt.y<=((cv&&cv.clientHeight)||1e9);
        if(onScreen){
          const hit=GE().coords.queryRenderedFeatures(pt,{layers:fillIds});
          if(hit&&hit.length){ const f=hit[0]; const id=f.layer.id.replace(/-fill$/,''); const meta=CHORO_META[id]; const s=countryStats[f.id];
            if(meta&&s){ return meta.label()+': '+meta.fmt(s); } } }
        /* (#R121) OFF-SCREEN (or renderer miss) → resolve the country by point-in-polygon over countryGeo and
           read the SAME countryStats the visible fill paints — the choropleth value no longer needs the point
           to be on screen ("choropleth画面外サンプリング"). Only VISIBLE fills report. */
        const visIds=fillIds.filter(Lid=>{ try{ return GE().layers.getLayout(Lid,'visibility')==='visible'; }catch(_){ return false; } });
        if(!visIds.length||!HOST.countryGeo||!HOST.countryGeo.features||!window._imPipGeo) return null;
        const f2=HOST.countryGeo.features.find(ft=>ft&&ft.id!=null&&ft.geometry&&window._imPipGeo(lng,lat,ft.geometry));
        if(f2){ const s2=countryStats[f2.id]; if(s2){ const id2=visIds[0].replace(/-fill$/,''); const meta2=CHORO_META[id2];
          if(meta2) return meta2.label()+': '+meta2.fmt(s2); } }
      }catch(_){}
      return null;
    };
    function wireChoroHover(id){
      const meta=CHORO_META[id]; if(!meta) return;
      if(_hoverWired[id]) return; _hoverWired[id]=true;
      GE().events.onLayer('mousemove',id+'-fill',e=>{
        if(!e.features.length) return;
        const s=countryStats[e.features[0].id]; if(!s) return;
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div><div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${meta.label()}: <b style="color:var(--text-main);">${meta.fmt(s)}</b></div>`;
        positionTooltip(e.point);
      });
      GE().events.onLayer('mouseleave',id+'-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }
    function addChoro(id){
      if(GE().layers.has(id+'-fill'))return;
      let ramp;
      if(id==='hdi') ramp=['interpolate',['linear'],['to-number',['feature-state','hdi'],-1],.45,'#a50026',.6,'#f46d43',.7,'#fee08b',.8,'#a6d96a',.95,'#1a9850'];
      else if(id==='dem') ramp=['interpolate',['linear'],['to-number',['feature-state','dem'],-1],1,'#a50026',4,'#f46d43',6,'#fee08b',8,'#74add1',10,'#313695'];
      else if(id==='milSpend') ramp=['interpolate',['linear'],['to-number',['feature-state','milSpend'],-1],1,'#fff7ec',5,'#fdd49e',20,'#fc8d59',75,'#d7301f',300,'#7f0000',916,'#4d0000'];
      else if(id==='milSpendGDP') ramp=['interpolate',['linear'],['to-number',['feature-state','milSpendGDP'],-1],0.5,'#edf8fb',1,'#b2e2e2',2,'#66c2a4',3.5,'#2ca25f',6,'#006d2c'];
      else if(id==='gdppc') ramp=['interpolate',['linear'],['to-number',['feature-state','gdppc'],-1],1000,'#fff7ec',5000,'#fee8c8',15000,'#fdbb84',30000,'#fc8d59',55000,'#e34a33',90000,'#7f0000'];
      else if(id==='tfr') ramp=['interpolate',['linear'],['to-number',['feature-state','tfr'],-1],1,'#2c7fb8',2.1,'#7fcdbb',3,'#ffffb2',4.5,'#fe9929',6.5,'#cc4c02'];
      else ramp=['interpolate',['linear'],['to-number',['feature-state','pop'],-1],2,'#ffffcc',20,'#fed976',100,'#fd8d3c',500,'#e31a1c',3000,'#800026'];
      /* Countries WITHOUT data are painted neutral gray. NOTE: an UNSET feature-state reads as
         null, and MapLibre's to-number(null) is 0 (NOT the -1 fallback) — so we must test "<= 0",
         and applyChoro also writes an explicit -1 sentinel for no-data countries. All real metric
         values (HDI, Democracy 0–10, pop-density) are > 0, so "<= 0" cleanly means "no data". */
      const noData=['<=',['to-number',['feature-state',id],0],0];
      GE().layers.add({id:id+'-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{
        'fill-color':['case',noData,'#9aa0a6',ramp],
        /* No-data gray now scales with the opacity slider too (#44) — slightly subtler than data fills. */
        'fill-opacity':['case',noData,Math.max(0,opacities[id]*0.75),opacities[id]]
      }},beforeId);
      wireChoroHover(id);
    }
    function applyChoro(id,valFn){
      if(!HOST.countryGeo) return;
      let count=0;
      HOST.countryGeo.features.forEach(f=>{
        if(f.id==null) return;
        const s=countryStats[f.id];
        const v=s?valFn(s):null;
        if(v!=null && !isNaN(v) && v>0){ GE().layers.setFeatureState({source:'countries',id:f.id},{[id]:v}); count++; }
        else { GE().layers.setFeatureState({source:'countries',id:f.id},{[id]:-1}); }   /* explicit no-data → gray */
      });
      /* If no data made it through, the layer would be invisible — warn and bail. */
      if(count===0) console.warn('applyChoro: no feature-state set for',id);
    }
    /* (#R94) Re-apply every VISIBLE country choropleth from the current countryStats — used by the
       time-machine after it overlays a past year's World Bank figures (or restores the present). */
    window._imReapplyChoros=function(){ try{
      const M={ pop:s=>s.density, hdi:s=>s.hdi, dem:s=>s.dem,
        milSpend:s=>s.milSpend, milSpendGDP:s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null,
        gdppc:s=>(s.gdppc!=null?s.gdppc:null), tfr:s=>(s.tfr!=null?s.tfr:null) };
      Object.keys(M).forEach(id=>{ try{ if(GE().layers.has(id+'-fill')&&GE().layers.getLayout(id+'-fill','visibility')==='visible') applyChoro(id,M[id]); }catch(_){} });
      /* (#R270) the year on the source line is repainted with the map it describes */
      try{ if(_syncYearHints) _syncYearHints(); }catch(_){}
    }catch(_){} };
    /* NATO members fill (#R7): brighter blue so it's clearly visible on the dark basemap, with a crisp
       outline. Built from a DEDICATED geojson (not the shared country feature-state) so we can drop the
       two member territories that lie SOUTH of the Tropic of Cancer — French Guiana (France) and Hawaii
       (USA) — which fall outside NATO's Article-6 treaty area. The Tropic of Cancer (23.4366°N) is drawn
       as a labeled gold line so the exclusion is self-explanatory. */
    const TROPIC_CANCER=23.4366;
    /* (#R7) NATO Article 6 limits the treaty area to Europe/North America and North-Atlantic islands
       NORTH of the Tropic of Cancer. So we drop EVERY member sub-polygon whose centroid is south of that
       line — French Guiana, Guadeloupe, Martinique, Saint-Martin, Mayotte, Réunion, New Caledonia, French
       Polynesia, Hawaii, Puerto Rico, Guam, … — while keeping all mainlands and the Atlantic islands
       (Azores, Madeira, Canaries) that ARE covered. Mainland polygons aren't clipped (centroid is north),
       so e.g. southern Florida/Texas stay whole. */
    /* ══ ⚠ (#R289) 「加盟年ごとに色分けされたバージョンも用意して」 ═══════════════════════════════════
       NATO and the EU each paint every member ONE colour, which answers 「who is in」 and says
       nothing about 「since when」 — although both layers have carried the real accession year
       since #R14/#R26 and both already have a year slider driven by it. A second colouring makes
       that year visible instead of only filterable, and the switch is in the legend beside the
       slider that uses the same numbers.
       ⚠ ONE PALETTE FOR BOTH.
       ⚠ AND THE BAR GOES AWAY WITH IT. #R270's defect was a legend whose gradient contradicted
       the colours on the map; a flat blue bar over a year-coloured map is the same statement. So
       the mode hides `.dl-bar`/`.dl-scale` and shows a chip per wave instead. */
    /* ══ ⚠⚠⚠ (#R290) 「加盟年別の色分けの色味が分かりにくい」 — AND THAT IS MEASURABLE ═══════════
       #R289 chose viridis for this on the argument that 「a rainbow would imply an order the eye
       has to be taught」. The reader has now looked at the result and cannot read it, so the
       trade-off is settled by the other criterion: how far apart two waves actually LOOK.
       MEASURED, CIEDE2000 between the closest pair in the set (which for a monotone ramp is
       always an adjacent pair — the one a reader has to tell apart on the legend):

           waves   viridis (before)   this palette (after)
             8         ΔE00 12.2            ΔE00 19.7      ← the EU
            11         ΔE00  8.1            ΔE00 19.7      ← NATO
            14         ΔE00  6.1            ΔE00 13.0

       ΔE00 ≈ 2.3 is the just-noticeable difference for large flat areas; 8.1 across eleven country
       fills at 55 % opacity over a basemap is not enough, and it is why 「分かりにくい」 is a fact
       about the palette rather than about the reader. The new set sweeps hue a full turn instead
       of a third of one, so the separation stops shrinking as waves are added — at eleven it is
       the same 19.7 as at eight. Order is still read off the sequence and off the legend chips,
       which name the year beside every swatch.
       ⚠ AND IT IS INDEXED, NOT INTERPOLATED. Sampling eleven colours out of a ten-anchor gradient
       is what put the closest pair at 8.1 in the first place; when there are no more waves than
       entries, each wave takes an ENTRY, so the measured separation is the separation on screen.
       (More entries than that — no such layer today — falls back to interpolation.) */
    /* ══ ⚠⚠ (#R293) 「ランダムな色の分け方ではなく、古いのから新しいのまで、赤から紫に連続的に」 ═══
       #R290 maximised how far apart the waves LOOK and got 26.1 (CIE76) by sweeping hue a full turn
       — which starts at dark blue, ends at lavender, and passes red in the middle. That is far apart
       and it is not an ORDER anybody can read off the map, which is what 「ランダム」 names.
       This ramp is the one the reader asked for: hue sweeps MONOTONICALLY from red (oldest) through
       orange, yellow, green and blue to purple (newest), so where a country sits in the sequence is
       legible without the key.
       ⚠ THE SEPARATION IS NOW A CONSEQUENCE, NOT THE OBJECTIVE, AND IT IS SMALLER — MEASURED:
       closest pair 23.9 (CIE76) against #R290's 26.1, and the closest pair is always an ADJACENT
       one, which is the signature of a continuous ramp: two waves that could be confused are
       neighbours in time, and no two distant waves ever are. It is still an order of magnitude
       above the 2.3 JND and roughly twice the 12.8 of the viridis sampling both of these replace.
       `tests/r293` asserts the monotone red→purple sweep AND re-computes the separation. */
    const _WAVEPAL=['#cf0032','#ea4a1c','#fa8b00','#f2c200','#c9df00','#5fbb46','#00a878','#0096bf','#2f66cf','#5a3cc4','#902fa6'];
    function _mixHex(a,b,t){ const p=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
      const A=p(a),B=p(b),o=A.map((v,i)=>Math.round(v+(B[i]-v)*t));
      return '#'+o.map(v=>v.toString(16).padStart(2,'0')).join(''); }
    function _rampAt(f){ const x=Math.max(0,Math.min(1,f))*(_WAVEPAL.length-1), i=Math.min(_WAVEPAL.length-2,Math.floor(x));
      return _mixHex(_WAVEPAL[i],_WAVEPAL[i+1],x-i); }
    /* year → colour, ordered oldest-first. ONE entry means one colour, not a division by zero. */
    function yearColors(years){ const o={}; const n=years.length, P=_WAVEPAL.length;
      years.forEach((y,i)=>{ o[y]=(n<2)?_WAVEPAL[0]
        :(n<=P)?_WAVEPAL[Math.round(i*(P-1)/(n-1))]
        :_rampAt(i/(n-1)); }); return o; }
    /* the fill expression: an exact match on the accession year, with the uniform colour as the
       fallback so a member whose year is missing is never invisible. */
    function yearFillExpr(years,colors,fallback){
      const e=['match',['to-number',['get','__y'],0]];
      years.forEach(y=>{ e.push(y,colors[y]); });
      e.push(fallback); return e; }
    /* the chips: one per wave that is actually on the map at the selected year, with its count */
    function yearKeyHTML(years,colors,joinTable,upTo,leftTable){
      const rows=[];
      years.forEach(y=>{ if(upTo!=null&&y>upTo) return;
        let n=0; Object.keys(joinTable).forEach(code=>{ if(joinTable[code]!==y) return;
          if(upTo!=null&&leftTable&&leftTable[code]&&upTo>=leftTable[code]) return; n++; });
        if(!n) return;
        rows.push('<span style="display:inline-flex;align-items:center;gap:4px;"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:'+colors[y]+';"></i>'+y+' ('+n+')</span>'); });
      return '<div class="dl-yearkey" style="display:flex;flex-wrap:wrap;gap:5px 9px;margin-top:6px;font-size:10px;color:var(--text-muted);font-variant-numeric:tabular-nums;">'+rows.join('')+'</div>'; }
    /* the two-button switch every one of these legends gets. `get`/`set` keep the state with its
       own layer rather than making a second copy here. */
    function styleModeRow(el,cls,get,set){ if(!el) return;
      let r=el.querySelector('.'+cls);
      const OPT=[['uniform',()=>window.IntMapLang.t(HOST.lang,'One colour','単色','Eine Farbe','Один цвет','Un color')],
                 ['byYear', ()=>window.IntMapLang.t(HOST.lang,'By accession year','加盟年別','Nach Beitrittsjahr','По году вступления','Por año de ingreso')]];
      if(!r){ r=document.createElement('div'); r.className=cls;
        r.style.cssText='display:flex;gap:5px;margin-top:7px;';
        r.innerHTML=OPT.map(o=>'<button type="button" data-s="'+o[0]+'" style="flex:1;min-width:0;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></button>').join('');
        const bar=el.querySelector('.dl-scale'); if(bar&&bar.parentNode===el) el.insertBefore(r,bar.nextSibling); else el.appendChild(r);
        r.addEventListener('click',(ev)=>{ const b=ev.target.closest('button[data-s]'); if(b&&r.contains(b)) set(b.getAttribute('data-s')); }); }
      r.querySelectorAll('button[data-s]').forEach(b=>{ const k=b.getAttribute('data-s');
        const o=OPT.filter(x=>x[0]===k)[0]; if(o) b.textContent=o[1]();
        const act=(k===get());
        b.style.background=act?'var(--primary-color)':'var(--input-bg)';
        b.style.color=act?'#fff':'var(--text-main)';
        b.setAttribute('aria-pressed',act?'true':'false'); });
      /* the gradient bar describes the uniform colouring only — see the note above */
      const byYear=(get()==='byYear');
      ['.dl-bar','.dl-scale'].forEach(sel=>{ const e2=el.querySelector(sel); if(e2) e2.style.display=byYear?'none':''; });
      return r; }
    function _ringCentroidLat(ring){ if(!ring||!ring.length) return 0; let sy=0; for(const p of ring) sy+=p[1]; return sy/ring.length; }
    function _dropSouthOfTropic(geom){
      if(!geom) return null;
      const keep=pc=>_ringCentroidLat(pc[0])>=TROPIC_CANCER;
      if(geom.type==='Polygon') return keep(geom.coordinates)?geom:null;
      if(geom.type==='MultiPolygon'){ const polys=geom.coordinates.filter(keep); return polys.length?{type:'MultiPolygon',coordinates:polys}:null; }
      return geom;
    }
    function buildNatoFC(){
      const feats=[];
      if(HOST.countryGeo&&HOST.countryGeo.features){
        HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!NATO.has(code)) return;
          /* (#R25) Time-travel like Historical borders: only show members who had ALREADY joined by the
             selected year (based on each country's real accession year). */
          const jy=NATO_JOIN[code]; if(jy && _natoYear && jy>_natoYear) return;
          const g=_dropSouthOfTropic(f.geometry);
          /* (#R289) the accession year travels WITH the feature, so the fill can colour by it */
          if(g) feats.push({type:'Feature',id:code,properties:{__code:code,__y:(jy||0)},geometry:g});
        });
      }
      return {type:'FeatureCollection',features:feats};
    }
    function tropicFC(){ const c=[]; for(let lo=-180;lo<=180;lo+=5) c.push([lo,TROPIC_CANCER]); return {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}]}; }
    function addNato(){
      if(!GE().layers.hasSource('src-nato')) GE().layers.addSource('src-nato',{type:'geojson',data:buildNatoFC(),promoteId:'__code'});
      if(!GE().layers.has('nato-fill')) GE().layers.add({id:'nato-fill',type:'fill',source:'src-nato',layout:{visibility:'none'},paint:{'fill-color':natoFillColor(),'fill-opacity':opacities.nato}},beforeId);
      if(!GE().layers.has('nato-line')) GE().layers.add({id:'nato-line',type:'line',source:'src-nato',layout:{visibility:'none'},paint:{'line-color':'#7fb0ff','line-width':1.6}},beforeId);
      if(!GE().layers.hasSource('src-tropic')) GE().layers.addSource('src-tropic',{type:'geojson',data:tropicFC()});
      if(!GE().layers.has('nato-tropic-line')) GE().layers.add({id:'nato-tropic-line',type:'line',source:'src-tropic',layout:{visibility:'none'},paint:{'line-color':'#f4b740','line-width':1.4,'line-dasharray':[3,3],'line-opacity':0.9}},beforeId);
      if(!GE().layers.has('nato-tropic-label')) GE().layers.add({id:'nato-tropic-label',type:'symbol',source:'src-tropic',layout:{visibility:'none','symbol-placement':'line','text-field':(window.IntMapLang.t(HOST.lang,'Tropic of Cancer (23.4°N)','北回帰線 (北緯23.4°)','Wendekreis des Krebses (23,4°N)','Северный тропик (23,4° с.ш.)','Trópico de Cáncer (23,4°N)')),'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']],'symbol-spacing':340,'text-letter-spacing':0.04},paint:{'text-color':'#f4b740','text-halo-color':'rgba(0,0,0,0.65)','text-halo-width':1.3}},beforeId);
    }
    function natoFillColor(){ return (_natoStyle==='byYear')
      ? yearFillExpr(NATO_YEARS,yearColors(NATO_YEARS),'#2f6bff') : '#2f6bff'; }
    function applyNato(){ try{ GE().layers.setSourceData('src-nato',buildNatoFC()); }catch(_){}
      /* (#R289) the colouring is re-asserted on every repaint, not only at creation — the same
         rule the World-Bank ramp needed: the addLayer branch runs once and the mode can change
         afterwards. */
      try{ if(GE().layers.has('nato-fill')) GE().layers.setPaint('nato-fill','fill-color',natoFillColor()); }catch(_){}
      /* ⚠ the legend is only re-drawn while the layer is ON — `_registerLayerOpacity` SHOWS the
         box, so calling it from a repaint that ran with the layer off would open a legend for a
         layer that is not on the map. */
      try{ const cb=document.getElementById('dl-nato'); if(cb&&cb.checked) natoLegend(); }catch(_){} }
    function setNatoVis(on){ ['nato-fill','nato-line','nato-tropic-line','nato-tropic-label'].forEach(l=>setVis(l,on)); }
    /* NATO accession years (#14) — shown on hover alongside the member's defense spend as % of GDP. */
    const NATO_JOIN={USA:1949,CAN:1949,GBR:1949,FRA:1949,ITA:1949,NLD:1949,BEL:1949,LUX:1949,DNK:1949,NOR:1949,ISL:1949,PRT:1949,GRC:1952,TUR:1952,DEU:1955,ESP:1982,CZE:1999,HUN:1999,POL:1999,BGR:2004,EST:2004,LVA:2004,LTU:2004,ROU:2004,SVK:2004,SVN:2004,ALB:2009,HRV:2009,MNE:2017,MKD:2020,FIN:2023,SWE:2024};
    /* (#R25 / #24) NATO enlargement time-travel: a year control (like Historical borders) filters the
       members fill to those who had joined by the chosen year. NATO_YEARS = the distinct accession years. */
    const NATO_YEARS=[...new Set(Object.values(NATO_JOIN))].sort((a,b)=>a-b);
    let _natoYear=NATO_YEARS[NATO_YEARS.length-1];   /* default: latest = all current members */
    let _natoStyle='uniform';                        /* (#R289) 'uniform' | 'byYear' */
    function setNatoStyle(k){ if(k!=='uniform'&&k!=='byYear') return; if(k===_natoStyle) return; _natoStyle=k; applyNato(); }
    window._imNatoStyle=(k)=>{ if(k==null) return _natoStyle; setNatoStyle(k); return _natoStyle; };
    function natoMemberCount(){ try{ return Object.values(NATO_JOIN).filter(y=>y<=_natoYear).length; }catch(_){ return ''; } }
    function natoLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('nato',LA('NATO members','NATO加盟国','NATO-Mitglieder','Страны НАТО','Países de la OTAN'),['nato-fill','nato-line'],'dl-nato');
        if(!el) return;
        /* ⚠ (#R289) THE «BUILT ONCE» GUARD IS NOW A BRANCH, NOT A RETURN. It used to leave the
           function the moment the year row existed, which is right for the row (rebuilding a
           <select> under the finger that opened it is #R266's defect) and wrong for everything
           added after it: the colouring switch's own selected state and its key CHANGE while the
           legend stays up, so a return would have made this round's control build once and never
           update — which looks exactly like a button that does nothing. */
        if(el.querySelector('.nato-year-row')){ const lbl=el.querySelector('.nato-year-val'); if(lbl) lbl.textContent=_natoYear; }
        else {
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='nato-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML=(window.IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año'))+' <select class="nato-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
            NATO_YEARS.map(y=>'<option value="'+y+'"'+(y===_natoYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
          row.querySelector('.nato-year-sel').addEventListener('change',(e)=>{ _natoYear=+e.target.value||_natoYear; applyNato(); const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; });
        } else {
          /* (#R27) Only the START and END years are labeled (a flex space-between row), not every
             accession year — the dense per-year ticks collided (1999/2004/2009/2017/2020/2023/2024 all
             bunched at the right) which was the "範囲のテキストが重なるクソUI". The selected year shows in
             the <b> readout, so no information is lost. */
          row.innerHTML=(window.IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año'))+' <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">'+
            '<input type="range" min="0" max="'+(NATO_YEARS.length-1)+'" step="1" value="'+NATO_YEARS.indexOf(_natoYear)+'" style="width:100%;display:block;margin:0;box-sizing:border-box;">'+
            '<span style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>'+NATO_YEARS[0]+'</span><span>'+NATO_YEARS[NATO_YEARS.length-1]+'</span></span>'+
            '</span> <b class="nato-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">'+_natoYear+'</b>';
          row.querySelector('input').addEventListener('input',(e)=>{ _natoYear=NATO_YEARS[+e.target.value]||_natoYear; const v=el.querySelector('.nato-year-val'); if(v) v.textContent=_natoYear; clearTimeout(natoLegend._t); natoLegend._t=setTimeout(applyNato,120); });
        }
        el.appendChild(row);
        }
      }catch(_){}
      /* (#R289) …and the colouring switch, which is OUTSIDE the «built once» early return above
         because its selected state and its key both change while the legend stays up. */
      try{ const el2=document.getElementById('data-legend-nato'); if(el2){
        styleModeRow(el2,'nato-style-row',()=>_natoStyle,setNatoStyle);
        let k=el2.querySelector('.nato-yearkey-wrap');
        if(!k){ k=document.createElement('div'); k.className='nato-yearkey-wrap';
          const r=el2.querySelector('.nato-style-row'); if(r&&r.parentNode===el2) el2.insertBefore(k,r.nextSibling); else el2.appendChild(k); }
        k.innerHTML=(_natoStyle==='byYear')?yearKeyHTML(NATO_YEARS,yearColors(NATO_YEARS),NATO_JOIN,_natoYear,null):'';
        try{ tileLegends(); }catch(_){}
      } }catch(_){}
    }
    /* ══ (#R289) 国防費: ONE ROW, TWO WAYS OF EXPRESSING THE SAME BUDGET ═════════════════════════
       Total US$ billions and the same figure as a share of the country's GDP were `dl-milSpend` and
       `dl-milSpendGDP`: two rows side by side in 政治・軍事 painting one series. They are one row
       now, with the switch in the legend — and NOTHING about either picture changed. Both fills,
       both ramps, both legends and both `applyChoro` expressions are the ones that were already
       there; this function only decides which of the two is showing.
       ⚠ THE MODE BUTTONS GO IN BOTH LEGENDS, because the legend a reader is looking at is the one
       for the ACTIVE mode — a switch that lived in only one of them would be unreachable from the
       other half of its own toggle. */
    let milMode='total';                       /* 'total' = US$ billions · 'gdp' = % of GDP */
    const MIL_MODES=[['total',()=>window.IntMapLang.t(HOST.lang,'Total ($B)','総額（$B）','Gesamt ($ Mrd.)','Всего ($ млрд)','Total ($ mil M)')],
                     ['gdp',  ()=>window.IntMapLang.t(HOST.lang,'% of GDP','対GDP比','% des BIP','% ВВП','% del PIB')]];
    function milIsOn(){ try{ const cb=document.getElementById('dl-milSpend'); return !!(cb&&cb.checked); }catch(_){ return false; } }
    function milModeRow(el){ if(!el) return;
      let r=el.querySelector('.dl-milmode');
      if(!r){ r=document.createElement('div'); r.className='dl-milmode';
        r.style.cssText='display:flex;gap:5px;margin-top:7px;';
        r.innerHTML=MIL_MODES.map(m=>'<button type="button" data-m="'+m[0]+'" style="flex:1;min-width:0;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></button>').join('');
        const bar=el.querySelector('.dl-scale'); if(bar&&bar.parentNode===el) el.insertBefore(r,bar.nextSibling); else el.appendChild(r);
        r.addEventListener('click',(ev)=>{ const b=ev.target.closest('button[data-m]'); if(b&&r.contains(b)) setMilMode(b.getAttribute('data-m')); }); }
      r.querySelectorAll('button[data-m]').forEach(b=>{ const k=b.getAttribute('data-m');
        const m=MIL_MODES.filter(x=>x[0]===k)[0]; if(m) b.textContent=m[1]();
        const act=(k===milMode);
        b.style.background=act?'var(--primary-color)':'var(--input-bg)';
        b.style.color=act?'#fff':'var(--text-main)';
        b.setAttribute('aria-pressed',act?'true':'false'); }); }
    function applyMilMode(){
      const gdp=(milMode==='gdp'), on=milIsOn();
      try{ if(lgdMil) lgdMil.style.display=(on&&!gdp)?'block':'none'; }catch(_){}
      try{ if(lgdMilGDP) lgdMilGDP.style.display=(on&&gdp)?'block':'none'; }catch(_){}
      try{ milModeRow(lgdMil); milModeRow(lgdMilGDP); }catch(_){}
      try{ tileLegends(); }catch(_){}
      try{ setVis('milSpend-fill',on&&!gdp); }catch(_){}
      try{ setVis('milSpendGDP-fill',on&&gdp); }catch(_){}
      if(!on) return;
      withCountries(()=>{ try{
        if(gdp){ addChoro('milSpendGDP'); applyChoro('milSpendGDP',s=>(s.milSpend!=null&&s.gdp)?s.milSpend/s.gdp*100:null); setVis('milSpendGDP-fill',true); }
        else   { addChoro('milSpend');    applyChoro('milSpend',   s=>s.milSpend);                                          setVis('milSpend-fill',true); }
      }catch(e){ console.warn('milSpend choro fail',e); } });
    }
    function setMilMode(k){ if(k!=='gdp'&&k!=='total') return; if(k===milMode) return; milMode=k; applyMilMode(); }
    window._imMilMode=(k)=>{ if(k==null) return milMode; setMilMode(k); return milMode; };
    function defensePctGDP(s){ if(!s||s.milSpend==null||!s.gdp) return null; const p=(s.milSpend/s.gdp)*100; return isFinite(p)?p:null; }
    function wireNatoHover(){
      if(_natoHoverWired) return; _natoHoverWired=true;
      GE().events.onLayer('mousemove','nato-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; if(!s) return;
        const yr=NATO_JOIN[s.code], pct=defensePctGDP(s);
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div>`+
          `<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${window.IntMapLang.t(HOST.lang,'Joined NATO','NATO加盟年','NATO-Beitritt','Вступление в НАТО','Ingreso en la OTAN')}: <b style="color:var(--text-main);">${yr||'—'}</b></div>`+
          `<div style="color:var(--text-muted);font-size:12px;">${window.IntMapLang.t(HOST.lang,'Defense spending','国防費','Verteidigungsausgaben','Расходы на оборону','Gasto en defensa')}: <b style="color:var(--text-main);">${s.milSpend!=null?'$'+s.milSpend+'B (2023)':'—'}</b></div>`+
          `<div style="color:var(--text-muted);font-size:12px;">${window.IntMapLang.t(HOST.lang,'Defense (% GDP)','国防費 (対GDP)','Verteidigung (% BIP)','Оборона (% ВВП)','Defensa (% PIB)')}: <b style="color:var(--text-main);">${pct!=null?pct.toFixed(2)+'%':'—'}</b></div>`;
        positionTooltip(e.point);
      });
      GE().events.onLayer('mouseleave','nato-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }

    /* (#R26 / EU) European Union members fill + accession-year time-travel control (mirrors NATO). Real
       enlargement years; the UK is dropped from 2020 (Brexit). EU outermost regions are NOT clipped. */
    const EU=new Set(['BEL','FRA','DEU','ITA','LUX','NLD','DNK','IRL','GBR','GRC','ESP','PRT','AUT','FIN','SWE','CYP','CZE','EST','HUN','LVA','LTU','MLT','POL','SVK','SVN','BGR','ROU','HRV']);
    const EU_JOIN={BEL:1958,FRA:1958,DEU:1958,ITA:1958,LUX:1958,NLD:1958,DNK:1973,IRL:1973,GBR:1973,GRC:1981,ESP:1986,PRT:1986,AUT:1995,FIN:1995,SWE:1995,CYP:2004,CZE:2004,EST:2004,HUN:2004,LVA:2004,LTU:2004,MLT:2004,POL:2004,SVK:2004,SVN:2004,BGR:2007,ROU:2007,HRV:2013};
    const EU_LEFT={GBR:2020};
    const EU_YEARS=[1958,1973,1981,1986,1995,2004,2007,2013,2020,2024];
    let _euYear=EU_YEARS[EU_YEARS.length-1];
    function euMemberAt(code,y){ const j=EU_JOIN[code]; if(j==null||j>y) return false; const l=EU_LEFT[code]; if(l&&y>=l) return false; return true; }
    function buildEuFC(){ const feats=[]; if(HOST.countryGeo&&HOST.countryGeo.features){ HOST.countryGeo.features.forEach(f=>{ const code=String(f.id); if(!EU.has(code)) return; if(!euMemberAt(code,_euYear)) return; feats.push({type:'Feature',id:code,properties:{__code:code,__y:(EU_JOIN[code]||0)},geometry:f.geometry}); }); } return {type:'FeatureCollection',features:feats}; }
    /* (#R289) 2020 and 2024 are in EU_YEARS as SLIDER stops (Brexit, and «today»); nobody joined in
       either, so the colour key is built from the years countries actually acceded in — otherwise
       the ramp would spend two of its eight steps on waves with no members. */
    const EU_JOIN_YEARS=[...new Set(Object.values(EU_JOIN))].sort((a,b)=>a-b);
    let _euStyle='uniform';                          /* (#R289) 'uniform' | 'byYear' */
    function euFillColor(){ return (_euStyle==='byYear')
      ? yearFillExpr(EU_JOIN_YEARS,yearColors(EU_JOIN_YEARS),'#1c3faa') : '#1c3faa'; }
    function setEuStyle(k){ if(k!=='uniform'&&k!=='byYear') return; if(k===_euStyle) return; _euStyle=k; applyEu(); }
    window._imEuStyle=(k)=>{ if(k==null) return _euStyle; setEuStyle(k); return _euStyle; };
    function addEu(){
      if(!GE().layers.hasSource('src-eu')) GE().layers.addSource('src-eu',{type:'geojson',data:buildEuFC(),promoteId:'__code'});
      if(!GE().layers.has('eu-fill')) GE().layers.add({id:'eu-fill',type:'fill',source:'src-eu',layout:{visibility:'none'},paint:{'fill-color':euFillColor(),'fill-opacity':opacities.eu!=null?opacities.eu:0.5}},beforeId);
      if(!GE().layers.has('eu-line')) GE().layers.add({id:'eu-line',type:'line',source:'src-eu',layout:{visibility:'none'},paint:{'line-color':'#ffd617','line-width':1.5}},beforeId);
    }
    function applyEu(){ try{ GE().layers.setSourceData('src-eu',buildEuFC()); }catch(_){}
      try{ if(GE().layers.has('eu-fill')) GE().layers.setPaint('eu-fill','fill-color',euFillColor()); }catch(_){}
      /* ⚠ the legend is only re-drawn while the layer is ON — `_registerLayerOpacity` SHOWS the
         box, so calling it from a repaint that ran with the layer off would open a legend for a
         layer that is not on the map. */
      try{ const cb=document.getElementById('dl-eu'); if(cb&&cb.checked) euLegend(); }catch(_){} }
    function setEuVis(on){ ['eu-fill','eu-line'].forEach(l=>setVis(l,on)); }
    function euLegend(){
      try{
        const el=window._registerLayerOpacity&&window._registerLayerOpacity('eu',LA('EU members','EU加盟国','EU-Mitglieder','Страны ЕС','Países de la UE'),['eu-fill','eu-line'],'dl-eu');
        if(!el) return;
        /* ⚠ (#R289) THE «BUILT ONCE» GUARD IS NOW A BRANCH, NOT A RETURN. It used to leave the
           function the moment the year row existed, which is right for the row (rebuilding a
           <select> under the finger that opened it is #R266's defect) and wrong for everything
           added after it: the colouring switch's own selected state and its key CHANGE while the
           legend stays up, so a return would have made this round's control build once and never
           update — which looks exactly like a button that does nothing. */
        if(el.querySelector('.eu-year-row')){ const lbl=el.querySelector('.eu-year-val'); if(lbl) lbl.textContent=_euYear; }
        else {
        const jp=HOST.lang==='jp';
        const row=document.createElement('div'); row.className='eu-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:7px;display:flex;align-items:center;gap:7px;';
        if(typeof isMobile==='function'&&isMobile()){
          row.innerHTML=(window.IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año'))+' <select class="eu-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
            EU_YEARS.map(y=>'<option value="'+y+'"'+(y===_euYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
          row.querySelector('.eu-year-sel').addEventListener('change',(e)=>{ _euYear=+e.target.value||_euYear; applyEu(); const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; });
        } else {
          /* (#R27) Same fix as NATO: label only the first/last year (space-between), not every dense
             enlargement year, so the range text no longer overlaps. */
          row.innerHTML=(window.IntMapLang.t(HOST.lang,'Year','加盟年','Beitrittsjahr','Год','Año'))+' <span style="flex:1;min-width:90px;display:flex;flex-direction:column;gap:1px;">'+
            '<input type="range" min="0" max="'+(EU_YEARS.length-1)+'" step="1" value="'+EU_YEARS.indexOf(_euYear)+'" style="width:100%;display:block;margin:0;box-sizing:border-box;">'+
            '<span style="display:flex;justify-content:space-between;font-size:8px;line-height:1;color:var(--text-muted);"><span>'+EU_YEARS[0]+'</span><span>'+EU_YEARS[EU_YEARS.length-1]+'</span></span>'+
            '</span> <b class="eu-year-val" style="color:var(--text-main);min-width:34px;text-align:right;">'+_euYear+'</b>';
          row.querySelector('input').addEventListener('input',(e)=>{ _euYear=EU_YEARS[+e.target.value]||_euYear; const v=el.querySelector('.eu-year-val'); if(v) v.textContent=_euYear; clearTimeout(euLegend._t); euLegend._t=setTimeout(applyEu,120); });
        }
        el.appendChild(row);
        }
      }catch(_){}
      /* (#R289) …and the same colouring switch the NATO legend gets, for the same instruction:
         「EU加盟国レイヤーでも同じことをやって。」 ⚠ The key is built from EU_JOIN_YEARS and it
         subtracts a member who has LEFT by the selected year — the United Kingdom is in EU_JOIN
         for ever and off the map from 2020, so counting the 1973 wave as three after Brexit would
         put a number in the legend that is not on the map. */
      try{ const el2=document.getElementById('data-legend-eu'); if(el2){
        styleModeRow(el2,'eu-style-row',()=>_euStyle,setEuStyle);
        let k=el2.querySelector('.eu-yearkey-wrap');
        if(!k){ k=document.createElement('div'); k.className='eu-yearkey-wrap';
          const r=el2.querySelector('.eu-style-row'); if(r&&r.parentNode===el2) el2.insertBefore(k,r.nextSibling); else el2.appendChild(k); }
        k.innerHTML=(_euStyle==='byYear')?yearKeyHTML(EU_JOIN_YEARS,yearColors(EU_JOIN_YEARS),EU_JOIN,_euYear,EU_LEFT):'';
        try{ tileLegends(); }catch(_){}
      } }catch(_){}
    }
    function wireEuHover(){
      if(_euHoverWired) return; _euHoverWired=true;
      GE().events.onLayer('mousemove','eu-fill',e=>{ if(!e.features.length) return; const s=countryStats[e.features[0].id]; const code=e.features[0].id; if(!s) return;
        const el=ensureMapTooltip(); el.style.display='block';
        el.innerHTML=`<div style="font-weight:600;font-size:14px;">${s.flag?s.flag+' ':''}${cName(s)}</div>`+
          `<div style="margin-top:5px;color:var(--text-muted);font-size:12px;">${window.IntMapLang.t(HOST.lang,'Joined EU','EU加盟年','EU-Beitritt','Вступление в ЕС','Ingreso en la UE')}: <b style="color:var(--text-main);">${EU_JOIN[code]||'—'}${EU_LEFT[code]?(' → '+EU_LEFT[code]+(window.IntMapLang.t(HOST.lang,' left',' 離脱',' ausgetreten',' вышла',' salió'))):''}</b></div>`;
        positionTooltip(e.point);
      });
      GE().events.onLayer('mouseleave','eu-fill',()=>{ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
    }

    /* (#R94) NATO & EU enlargement follow the master spacetime clock: travel to a year → only members that
       had already joined by then are shown; back to "Now" → every current member. The per-layer year sliders
       in the legend still work as instant overrides and are kept in step with the clock. */
    function _syncYearLegend(prefix,years,val){ try{
      const v=document.querySelector('.'+prefix+'-year-val'); if(v) v.textContent=val;
      const row=document.querySelector('.'+prefix+'-year-row'); if(!row) return;
      const rg=row.querySelector('input[type=range]'); if(rg){ let idx=0; for(let i=0;i<years.length;i++){ if(years[i]<=val) idx=i; } rg.value=idx; }
      const se=row.querySelector('select'); if(se){ let best=years[0]; years.forEach(y=>{ if(y<=val) best=y; }); se.value=best; }
    }catch(_){} }
    try{ if(window.IntMapTime) window.IntMapTime.on(e=>{
      const nt=e.isLive?NATO_YEARS[NATO_YEARS.length-1]:e.year;
      if(nt!==_natoYear){ _natoYear=nt;
        try{ if(GE().layers.has('nato-fill')&&GE().layers.getLayout('nato-fill','visibility')==='visible') applyNato(); }catch(_){}
        _syncYearLegend('nato',NATO_YEARS,_natoYear); }
      const et=e.isLive?EU_YEARS[EU_YEARS.length-1]:e.year;
      if(et!==_euYear){ _euYear=et;
        try{ if(GE().layers.has('eu-fill')&&GE().layers.getLayout('eu-fill','visibility')==='visible') applyEu(); }catch(_){}
        _syncYearLegend('eu',EU_YEARS,_euYear); }
    }); }catch(_){}

    /* Rimland (#15,#17) — Spykman's coastal crescent as a LAND-only country fill (no sea painted). */
    const RIMLAND=new Set("GBR IRL FRA ESP PRT ITA NLD BEL DEU DNK NOR HRV ALB MNE GRC TUR SYR LBN ISR JOR IRQ IRN SAU YEM OMN ARE QAT KWT BHR PAK IND BGD LKA MMR THA KHM VNM MYS SGP IDN PHL BRN CHN KOR PRK JPN TWN".split(' '));
    function addRimland(){
      if(!GE().layers.has('rimland-fill')) GE().layers.add({id:'rimland-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#0a84ff','fill-opacity':['case',['boolean',['feature-state','rimland'],false],0.30,0]}},beforeId);
      if(!GE().layers.has('rimland-line')) GE().layers.add({id:'rimland-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#5ab0ff','line-width':['case',['boolean',['feature-state','rimland'],false],1.2,0]}},beforeId);
    }
    function applyRimland(){ if(!HOST.countryGeo) return; HOST.countryGeo.features.forEach(f=>{ if(f.id==null) return; const s=countryStats[String(f.id)]; GE().layers.setFeatureState({source:'countries',id:f.id},{rimland:!!(s&&RIMLAND.has(s.code))}); }); }
    window.imToggleRimland=function(on){ if(on){ withCountries(()=>{ try{ addRimland(); applyRimland(); setVis('rimland-fill',true); setVis('rimland-line',true); }catch(e){ console.warn('rimland fail',e); } }); } else { setVis('rimland-fill',false); setVis('rimland-line',false); } };

    /* Former Soviet Union (#15) — the 15 republics of the USSR as a RED land-only country fill (no sea
       painted; uses the country polygons directly). Matches on the feature's ISO3 id so every republic
       fills even if it has no economic stats. */
    const FSU=new Set("RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM KGZ TJK".split(' '));
    function addFSU(){
      if(!GE().layers.has('fsu-fill')) GE().layers.add({id:'fsu-fill',type:'fill',source:'countries',layout:{visibility:'none'},paint:{'fill-color':'#e0312e','fill-opacity':['case',['boolean',['feature-state','fsu'],false],0.42,0]}},beforeId);
      if(!GE().layers.has('fsu-line')) GE().layers.add({id:'fsu-line',type:'line',source:'countries',layout:{visibility:'none'},paint:{'line-color':'#ff6b6b','line-width':['case',['boolean',['feature-state','fsu'],false],1.2,0]}},beforeId);
    }
    function applyFSU(){ if(!HOST.countryGeo) return; HOST.countryGeo.features.forEach(f=>{ if(f.id==null) return; GE().layers.setFeatureState({source:'countries',id:f.id},{fsu:FSU.has(String(f.id))}); }); }
    window.imToggleFSU=function(on){ if(on){ withCountries(()=>{ try{ addFSU(); applyFSU(); setVis('fsu-fill',true); setVis('fsu-line',true); }catch(e){ console.warn('fsu fail',e); } }); } else { setVis('fsu-fill',false); setVis('fsu-line',false); } };

    /* Sea-level-rise simulator (#24): a color-relief layer over the DEM that floods everything at or
       below the chosen +rise (window._seaLevelM, meters) in blue, leaving higher land transparent so
       the basemap shows through. The slider rebuilds the ramp live via _refreshSeaLevel. */
    function seaLevelRamp(){
      const L=window._seaLevelM||0;
      /* (#R9) Works for ANY offset incl. NEGATIVE (sea-level fall, the slider's minus side): build the
         candidate depth→color stops, then keep only strictly-ASCENDING ones so MapLibre's interpolate
         never receives a non-monotonic input (which threw with the old fixed -50 stop at low L). */
      /* ⚠ (#R186) 「Opacityの100%は、全然100% Opacityではない」 — ROOT CAUSE, and it was in these stops.
         The layer's `color-relief-opacity` MULTIPLIES the ramp's own alpha, and the ramp carried a
         baked-in 0.60-0.92. So the slider at 100 % produced at most 92 % over deep water and only
         60 % at the shoreline — the control could not reach opaque no matter where it was dragged.
         The stops are now FULLY OPAQUE and the slider is the one and only transparency, so 100 %
         means 100 %. Depth still reads, because depth was never carried by the alpha: it is the
         colour ramp (deep navy → pale blue), which is untouched. The land side fades out through the
         SAME hue instead of through rgba(0,0,0,0) — interpolating towards transparent BLACK darkened
         the 0.6 m coastal feather, which was a second, smaller bug in the same line. */
      const cand=[[-11000,'rgba(5,40,90,1)'],[L-50,'rgba(25,95,175,1)'],[L-1.5,'rgba(45,125,205,1)'],[L,'rgba(120,180,235,1)'],[L+0.6,'rgba(120,180,235,0)'],[12000,'rgba(120,180,235,0)']];
      const out=[]; let last=-Infinity;
      for(const c of cand){ if(c[0]>last){ out.push(c[0],c[1]); last=c[0]; } }
      return ['interpolate',['linear'],['elevation'], ...out];
    }
    function addSeaLevel(){
      try{ ensureTerrainSource(); }catch(_){}
      if(!GE().layers.has('lyr-sealevel')){
        GE().layers.add({id:'lyr-sealevel',type:'color-relief',source:'terrain-dem',layout:{visibility:'none'},paint:{'color-relief-opacity':opacities.sealevel,'color-relief-color':seaLevelRamp()}},beforeId);
      }
    }
    window._refreshSeaLevel=function(){
      if(GE().layers.has('lyr-sealevel')){ try{ GE().layers.setPaint('lyr-sealevel','color-relief-color',seaLevelRamp()); }catch(_){} }
      const L=window._seaLevelM||0, clamp=Math.max(-150,Math.min(70,L));
      /* (#R13c) imperial → show the offset in feet (slider stays in meters internally) */
      const _um=(typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both';
      const slDisp=(L>=0?'+':'')+(_um==='imperial'?(Math.round(L*3.28084)+' ft'):(L+' m'));
      const sgn=slDisp;
      try{ const s=lgdSeaLevel.querySelector('.sl-cur'); if(s) s.textContent=slDisp; }catch(_){}
      /* Keep the legend slider, the legend number box and the in-dropdown slider in lock-step (#11). */
      try{ const lr=lgdSeaLevel.querySelector('.sl-legend-range'); if(lr && +lr.value!==clamp) lr.value=clamp; }catch(_){}
      try{ const nb=lgdSeaLevel.querySelector('.sl-num'); if(nb && +nb.value!==L) nb.value=L; }catch(_){}
      try{ const dd=document.getElementById('sl-sealevel'); if(dd){ if(+dd.value!==clamp) dd.value=clamp; const lbl=document.getElementById('sllbl-sealevel'); if(lbl) lbl.textContent=sgn; } }catch(_){}
    };

    /* (#R232) buildNight() and its 60-second interval were DELETED here. It drew one flat #00112a
       turf.circle 10,001 km across and re-made it every minute; js/night-side.js draws the real
       twilight ramp and the city lights, and two of them over each other was the defect. */

    /* Köppen-Geiger climate (#13): rendered locally from the native 1 km GeoTIFFs in
       "Köppen-Geiger climate classification data/<period>.tif" (Beck et al. 2018, 30 classes) and
       REPROJECTED to Web Mercator (EPSG:3857) at ±85.0511° → koppen_mercator_<period>.png, so the image
       source aligns pixel-exactly with the Mercator basemap (no latitude drift) and avoids the
       "y=Infinity" error. Transparent ocean. Falls back to the Wikipedia PNG if the local file isn't
       published. The palette below is byte-identical to the PNGs so cursor pixel-sampling
       (Mercator-inverse) round-trips perfectly. */
    /* (#R12/#R13c) Multi-period Köppen. Default stays present-day (1991-2020). All four eras are
       reprojected by _koppen_convert.py to Web Mercator at 8192² (nearest-neighbor, crisp class
       boundaries) and named koppen_mercator_<period>.png (the old koppen_mercator.png was retired);
       1931-1960 & 1961-1990 now use the user's updated, distinct source TIFFs. */
    /* (#R31) The Köppen layer already supports multiple 30-year periods (1901–2020) via the SAME mechanism
       & UI. To add the Beck et al. 2018 "1980–2016" period the user asked for, drop the reprojected assets
       data/koppen_mercator_1980-2016.png (+ _4k.png) — produced by the SAME pipeline (Web-Mercator ±85.0511°,
       same palette) as the existing ones — then add ['1980-2016','koppen_mercator_1980-2016.png'] to the
       front of this list. The asset can't be generated in-app (it needs the raw 1980–2016 raster + a
       reprojection), so it's wired for one-line activation rather than shipped broken. */
    window.KOPPEN_PERIODS=[['1991-2020','koppen_mercator_1991-2020.png'],['1961-1990','koppen_mercator_1961-1990.png'],['1931-1960','koppen_mercator_1931-1960.png'],['1901-1930','koppen_mercator_1901-1930.png']];
    /* To enable 1980–2016 once the asset exists: window.KOPPEN_PERIODS.unshift(['1980-2016','koppen_mercator_1980-2016.png']); */
    if(!window._koppenPeriod) window._koppenPeriod='1991-2020';
    /* (#R17) The DISPLAYED Köppen is ALWAYS the full 8192² PNG — on EVERY device, no silent downgrade
       (the user: "画質を勝手に下げるな…画質は保持しろ"). The mobile OOM that crashed the tab was driven by a
       SECOND full-res copy we kept ourselves (the ~268 MB cursor-sampling/highlight decode) on top of
       MapLibre's own texture. So the DISPLAY uses the full 8192² here, while the sampling/highlight work
       canvas is built from the bundled 4096² on phones (koppenWorkURL) — quality of what you SEE is
       untouched, but peak memory drops by ~270 MB so it no longer crashes. */
    function koppenURLFor(p){ const e=window.KOPPEN_PERIODS.find(x=>x[0]===p)||window.KOPPEN_PERIODS[0]; return e[1]; }
    /* (#R23) The DISPLAY texture is the lighter 4k PNG on phones — the full 8192² PNG is a ~268 MB GPU
       texture that crashes iPhone Safari ("重い動作でブラウザが落ちる"); desktops keep the full 8192². */
    /* ══ (#R193) THE FIRST KÖPPEN PICTURE IS THE SMALL ONE ════════════════════════════════════════
       「起動時の読み込みをもっと早く。」 Köppen is one of the two default-on layers
       (window.IntMapDefaultLayers), so on a cold desktop load the 8192²-wide era PNG — 2.2 MB —
       started at 985 ms, ahead of every base-map tile. The SAME map exists at 4k, 754 KB, produced by
       the same pipeline with the same palette, and phones have been using it since #R23.
       So: paint the 4k immediately and swap the full-resolution one in when the browser is idle. The
       layer ends up exactly where it was — this only changes WHICH of the two identical maps is on
       screen for the first second or two, and the difference between them is invisible until the
       user zooms past about z5. Phones stay on the 4k for good, as before. */
    function koppenSmallURL(p){ return koppenURLFor(p||window._koppenPeriod).replace(/\.png$/,'_4k.png'); }
    function koppenFullURL(p){ return koppenURLFor(p||window._koppenPeriod); }
    function koppenPhone(){ try{ return typeof isMobile==='function'&&isMobile(); }catch(_){ return false; } }
    function koppenDisplayURL(p){ return koppenPhone()?koppenSmallURL(p):koppenSmallURL(p); }
    /* raise the on-screen raster to the full-resolution file once nothing is waiting on the thread */
    let _kUpgraded='';
    function koppenUpgrade(p){
      if(koppenPhone()) return;                       /* #R23: phones keep the 4k texture — RAM */
      const per=p||window._koppenPeriod, full=koppenFullURL(per);
      if(_kUpgraded===full) return;
      const run=()=>{ try{
          if(_kUpgraded===full) return;
          if(!GE().layers.hasSource('src-climate')) return;
          if(window._koppenPeriod!==per) return;      /* the era moved on while we waited */
          _kUpgraded=full; KURL=full;
          GE().layers.updateImage('src-climate',{url:full,coordinates:KCOORDS});
        }catch(_){} };
      const go=()=>{ if(typeof requestIdleCallback==='function') requestIdleCallback(run,{timeout:8000}); else setTimeout(run,3000); };
      try{ const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        if(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||''))) return; }catch(_){}
      let started=false; const once=()=>{ if(started) return; started=true; go(); };
      try{ GE().events.once('idle',()=>setTimeout(once,300)); }catch(_){}
      setTimeout(once,5000);
    }
    /* The sampling/highlight WORK image is ALWAYS the 4k PNG (downscaled to ≤2048² for CPU pixel ops):
       decoding the 8192² just to read a 2048² work canvas wasted ~200 MB on desktop too. */
    function koppenWorkURL(p){ return koppenURLFor(p).replace(/\.png$/,'_4k.png'); }
    let KURL=koppenDisplayURL(window._koppenPeriod);
    const KURL_FALLBACK='https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Koppen-Geiger_Map_World_present.svg/1920px-Koppen-Geiger_Map_World_present.svg.png';
    const KOPPEN_LATMAX=85.0511287798066;
    window.KCOORDS=[[-180,KOPPEN_LATMAX],[180,KOPPEN_LATMAX],[180,-KOPPEN_LATMAX],[-180,-KOPPEN_LATMAX]];
    const KCOORDS=window.KCOORDS;
    window.KCOL=[['Af',[0,0,255]],['Am',[0,120,255]],['Aw',[70,170,250]],['BWh',[255,0,0]],['BWk',[255,150,150]],['BSh',[245,165,0]],['BSk',[255,220,100]],['Csa',[255,255,0]],['Csb',[200,200,0]],['Csc',[150,150,0]],['Cwa',[150,255,150]],['Cwb',[100,200,100]],['Cwc',[50,150,50]],['Cfa',[200,255,80]],['Cfb',[100,255,80]],['Cfc',[50,200,0]],['Dsa',[255,0,255]],['Dsb',[200,0,200]],['Dsc',[150,50,150]],['Dsd',[150,100,150]],['Dwa',[170,175,255]],['Dwb',[90,120,220]],['Dwc',[75,80,180]],['Dwd',[50,0,135]],['Dfa',[0,255,255]],['Dfb',[55,200,255]],['Dfc',[0,125,125]],['Dfd',[0,70,95]],['ET',[178,178,178]],['EF',[102,102,102]]];
    /* ══ ⚠⚠⚠ (#R245) ONE TABLE, AND IT IS A CALL — THE ELEVENTH SHAPE, CLOSED HERE ═══════════════════
       「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」
       The thirty climate names were FOUR tables: `{en,jp}` literals here, then `_kde`, `_kru` and
       `_kes` patched onto them at load. That is [[intmap-recurring-lessons]] G — one quantity in four
       places — and it is also the eleventh translation shape (#R244): a language-keyed OBJECT is
       invisible to every instrument, so the audit saw thirty `{en,jp}` pairs and every gauge printed
       100 % while fr / ko / zh / zh-Hans read the ENGLISH climate name in the legend the reader has
       just been looking at.
       ⚠ WRITTEN AS `LA(…)` — `IntMapLang.pickArgs()`, which returns the array it is given — the data
       does not change but the file now contains an ordinary CALL, so the inline report and the
       positional audit read all 150 strings with no edit, and `L.arr()` resolves a language past the
       five arguments through the inline table keyed by the English name. Nothing is patched on
       afterwards, and there is no second copy to keep in step. */
    window.KNAME={
      Af:LA('Tropical rainforest','熱帯雨林','Tropischer Regenwald','Влажный тропический лес','Selva tropical'),
      Am:LA('Tropical monsoon','熱帯モンスーン','Tropisches Monsunklima','Тропический муссонный','Monzónico tropical'),
      Aw:LA('Savanna','サバナ','Savanne','Саванна','Sabana'),
      BWh:LA('Hot desert','砂漠(高温)','Heißwüste','Жаркая пустыня','Desierto cálido'),
      BWk:LA('Cold desert','砂漠(寒冷)','Kaltwüste','Холодная пустыня','Desierto frío'),
      BSh:LA('Hot steppe','ステップ(高温)','Heiße Steppe','Жаркая степь','Estepa cálida'),
      BSk:LA('Cold steppe','ステップ(寒冷)','Kalte Steppe','Холодная степь','Estepa fría'),
      Csa:LA('Mediterranean, hot summer','地中海性(高温夏)','Mediterran, heißer Sommer','Средиземноморский, жаркое лето','Mediterráneo, verano caluroso'),
      Csb:LA('Mediterranean, warm summer','地中海性(温暖夏)','Mediterran, warmer Sommer','Средиземноморский, тёплое лето','Mediterráneo, verano templado'),
      Csc:LA('Mediterranean, cold summer','地中海性(冷涼夏)','Mediterran, kühler Sommer','Средиземноморский, прохладное лето','Mediterráneo, verano fresco'),
      Cwa:LA('Humid subtropical, dry winter','温暖冬季少雨','Feuchtsubtropisch, trockener Winter','Влажный субтропический, сухая зима','Subtropical húmedo, invierno seco'),
      Cwb:LA('Subtropical highland','温帯高地','Subtropisches Hochland','Субтропическое нагорье','Tierras altas subtropicales'),
      Cwc:LA('Subtropical highland, dry winter','温帯高地(冬季少雨)','Subtropisches Hochland, trockener Winter','Субтропическое нагорье, сухая зима','Tierras altas subtropicales, invierno seco'),
      Cfa:LA('Humid subtropical','温暖湿潤','Feuchtsubtropisch','Влажный субтропический','Subtropical húmedo'),
      Cfb:LA('Oceanic','西岸海洋性','Ozeanisch','Океанический','Oceánico'),
      Cfc:LA('Subpolar oceanic','亜寒帯海洋性','Subpolar-ozeanisch','Субполярный океанический','Oceánico subpolar'),
      Dsa:LA('Continental, dry-hot summer','大陸性夏季少雨(高温)','Kontinental, trocken-heißer Sommer','Континентальный, сухое жаркое лето','Continental, verano seco y caluroso'),
      Dsb:LA('Continental, dry-warm summer','大陸性夏季少雨(温暖)','Kontinental, trocken-warmer Sommer','Континентальный, сухое тёплое лето','Continental, verano seco y templado'),
      Dsc:LA('Continental, dry summer (cold)','大陸性夏季少雨(冷涼)','Kontinental, trockener Sommer (kühl)','Континентальный, сухое лето (холодный)','Continental, verano seco (frío)'),
      Dsd:LA('Continental, dry summer (severe)','大陸性夏季少雨(厳寒)','Kontinental, trockener Sommer (streng)','Континентальный, сухое лето (суровый)','Continental, verano seco (severo)'),
      Dwa:LA('Continental, dry winter (hot summer)','大陸性冬季少雨(高温夏)','Kontinental, trockener Winter (heißer Sommer)','Континентальный, сухая зима (жаркое лето)','Continental, invierno seco (verano caluroso)'),
      Dwb:LA('Continental, dry winter (warm summer)','大陸性冬季少雨(温暖夏)','Kontinental, trockener Winter (warmer Sommer)','Континентальный, сухая зима (тёплое лето)','Continental, invierno seco (verano templado)'),
      Dwc:LA('Subarctic, dry winter','亜寒帯冬季少雨','Subarktisch, trockener Winter','Субарктический, сухая зима','Subártico, invierno seco'),
      Dwd:LA('Subarctic, dry winter (severe)','亜寒帯冬季少雨(厳寒)','Subarktisch, trockener Winter (streng)','Субарктический, сухая зима (суровый)','Subártico, invierno seco (severo)'),
      Dfa:LA('Humid continental, hot summer','亜寒帯湿潤(高温夏)','Feuchtkontinental, heißer Sommer','Влажный континентальный, жаркое лето','Continental húmedo, verano caluroso'),
      Dfb:LA('Humid continental, warm summer','亜寒帯湿潤(温暖夏)','Feuchtkontinental, warmer Sommer','Влажный континентальный, тёплое лето','Continental húmedo, verano templado'),
      Dfc:LA('Subarctic','亜寒帯','Subarktisch','Субарктический','Subártico'),
      Dfd:LA('Subarctic, severe winter','亜寒帯(厳寒)','Subarktisch, strenger Winter','Субарктический, суровая зима','Subártico, invierno severo'),
      ET:LA('Tundra','ツンドラ','Tundra','Тундра','Tundra'),
      EF:LA('Ice cap','氷雪','Eiskappe','Ледниковый','Casquete glaciar')
    };
    const KCOL=window.KCOL, KNAME=window.KNAME;
    /* THE one name lookup — every reader goes through it (js/map-ui.js, js/map-readout.js and the two
       in this file), so a climate name is resolved in exactly one place and never «undefined». */
    window.kName=function(code){ const e=window.KNAME&&window.KNAME[code]; return e?(LDL.arr(e)||code):code; };
    const kSelected=window.kSelected||(window.kSelected=new Set());
    window.kSelected=kSelected;
    /* === Köppen image → hidden canvas
       Lets us (a) sample climate at a lng/lat in O(1) by reading pixels,
       (b) build a "highlight only selected" canvas image and feed it back
           into the same source for in-place filtering. */
    window._koppenCanvas=null; window._koppenImg=null; window._koppenReady=false;
    /* PERF (#R13): the DISPLAYED Köppen raster is the full-res 8192² PNG (composited on the GPU). But
       cursor-sampling and class highlighting are CPU pixel ops, so they run on a small capped
       work-canvas (≤2048, nearest-neighbor so the exact KCOL palette is preserved). ~19 km/px is
       plenty to classify a point, and it makes the per-pixel index + highlight ~16× cheaper → the
       laggy period-switch / class-select the user reported is gone. */
    const KWORK_CAP=2048;
    /* ══ (#R217) THE DECODED SOURCE IMAGE IS NOT KEPT WHERE NOTHING CAN USE ITS EXTRA PIXELS ══════
       「モバイル版が、非常に重くなっている…わたしのguessは…iPhoneのメモリを占有して」— measured, and this
       is one of the two places the phone's memory was going. A phone loads the 4k Köppen file
       (koppenWorkURL), and the decoded bitmap of a 4096² PNG is 4096·4096·4 = 67 MB. It was then
       held FOREVER in window._koppenImg, on top of the ≤2048² work canvas built from it (17 MB) and
       the renderer's own texture for the same file (another 67 MB).

       Its only reader is ensureKoppenFull(), and on a phone _koppenFullCap() is 2048 — the SAME cap
       the work canvas is already built at. So the extra pixels are unreachable by construction, and
       dropping them is not a quality decision: the class highlight is rasterised from exactly the
       resolution it would have used. Where the cap IS higher than the work canvas (desktop: 3072 or
       4096) the image is kept, unchanged.

       ⚠ `im.src=''` as well as the reference: an <img> that is not in the document still owns its
       decoded bitmap for as long as anything points at it, and dropping the last reference only
       makes it collectable — which on a phone under pressure is later than "now". */
    function _mkKoppenWork(im){
      const nw=im.naturalWidth||im.width, nh=im.naturalHeight||im.height;
      const sc=Math.min(1, KWORK_CAP/Math.max(nw,nh,1));
      const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(nw*sc)); c.height=Math.max(1,Math.round(nh*sc));
      const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false; cx.drawImage(im,0,0,c.width,c.height);
      window._koppenCanvas=c; window._koppenReady=true;
      if(_koppenFullCap()<=c.width&&_koppenFullCap()<=c.height){ window._koppenImg=null; try{ im.src=''; }catch(_){ } }
      else window._koppenImg=im;
    }
    /* ⚠ (#R201) THE 738 KB PNG THAT LOOKS LIKE IT IS FETCHED TWICE IS NOT. Measured on the local
       preview it arrives at t≈320 ms (this Image) and again at t≈810 ms (the renderer's own fetch for
       the display raster), 738 KB each — which reads exactly like a cache-key split between the
       Image's no-cors request and MapLibre's cors fetch. It is not: `scripts/serve.mjs` sends
       `cache-control: no-store`, so the preview cannot cache anything. MEASURED AGAINST PRODUCTION
       (github.io, real headers) the second request is `transferSize: 0` — a cache hit. The candidate
       fix for this was written, measured and REMOVED; what is on the record instead is that the
       instrument had the defect. */
    /* ══ ⚠⚠ (#R224) THE WORK CANVAS DECODED 64 MB TO KEEP 17 ═══════════════════════════════════════
       「モバイル版がまだ劇的に遅い…ブラウザが落ちることもある。」 (iPhone / iOS Safari, confirmed.)

       MEASURED: koppen_mercator_1991-2020_4k.png is 4096 × 4096, i.e. 737 kB on the wire and
       **64 MB as a decoded bitmap** — and the Köppen layer is ON BY DEFAULT (IntMapDefaultLayers).
       `_mkKoppenWork` then draws that bitmap into a 2048² canvas and, on a phone, throws it away
       again (#R217). So the phone allocated 64 MB, used 17, and released it — a peak spike of 64 MB
       on a device whose whole tab budget is a few hundred, happening while MapLibre is uploading its
       own texture for the SAME file. That is a plausible tab kill, and it is entirely avoidable.

       `createImageBitmap(blob, { resizeWidth, resizeHeight })` decodes STRAIGHT to the target size:
       the 64 MB intermediate never exists. ⚠ `resizeQuality:'pixelated'` is not a preference here, it
       is the correctness condition — the whole point of the work canvas is that KCOL's exact palette
       survives so a pixel can be classified, and any smoothing invents colours between classes. That
       is the same reason `_mkKoppenWork` sets `imageSmoothingEnabled=false`.
       ⚠ FALLS BACK TO THE <img> PATH on anything that cannot do it (no createImageBitmap, no resize
       support, a fetch the CORS setup refuses), so the behaviour is unchanged where it cannot help. */
    function _koppenBitmapWork(){
      const cap=KWORK_CAP;
      if(typeof createImageBitmap!=='function'||typeof fetch!=='function') return Promise.reject();
      return fetch(koppenWorkURL(window._koppenPeriod),{cache:'force-cache'})
        .then(r=>{ if(!r.ok) throw new Error('koppen '+r.status); return r.blob(); })
        .then(b=>createImageBitmap(b,{resizeWidth:cap,resizeHeight:cap,resizeQuality:'pixelated'}))
        .then(bm=>{
          const c=document.createElement('canvas'); c.width=bm.width; c.height=bm.height;
          const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false;
          cx.drawImage(bm,0,0);
          try{ bm.close(); }catch(_){}
          window._koppenCanvas=c; window._koppenReady=true; window._koppenImg=null;
        });
    }
    function loadKoppenCanvas(){
      if(window._koppenImg||window._koppenReady) return Promise.resolve();
      /* the phone is the case this exists for; on desktop `_koppenFullCap()` may be above the work
         canvas, and then `_koppenImg` has readers, so that path is left exactly as it was */
      if(koppenPhone()) return _koppenBitmapWork().catch(()=>_loadKoppenCanvasImg());
      return _loadKoppenCanvasImg();
    }
    function _loadKoppenCanvasImg(){
      if(window._koppenImg) return Promise.resolve();
      return new Promise(resolve=>{
        /* (#R13b) NO crossOrigin on the LOCAL PNG: under file:// an `anonymous` request to a same-folder
           file can fail (no CORS headers on file://), which used to drop us to the wrong remote Wikipedia
           fallback → garbled highlight. Loading it plainly always gets the real image; getImageData may
           still throw on a tainted file:// canvas, but that's caught and only disables highlighting, never
           the base map. The remote fallback keeps crossOrigin (Wikimedia sends CORS). */
        const im=new Image();
        im.onload=()=>{ _mkKoppenWork(im); resolve(); };
        im.onerror=()=>{
          const im2=new Image(); im2.crossOrigin='anonymous';
          im2.onload=()=>{ _mkKoppenWork(im2); resolve(); };
          im2.onerror=()=>resolve(); im2.src=KURL_FALLBACK;
        };
        /* (#R17) sample/highlight from the lighter work image (4k on mobile); the DISPLAY source still uses
           the full 8192² KURL, so on-screen quality is unchanged while we avoid a 2nd 268 MB decode. */
        im.src=koppenWorkURL(window._koppenPeriod);
      });
    }
    function nearestKoppenCode(r,g,b,a){
      if(a<32) return null;
      let best=null,bestD=Infinity;
      for(const [code,c] of KCOL){
        const dr=r-c[0], dg=g-c[1], db=b-c[2]; const d=dr*dr+dg*dg+db*db;
        if(d<bestD){ bestD=d; best=code; }
      }
      return bestD<6000?best:null;
    }
    /* Sample Köppen code at lng/lat (image is equirectangular over lat [+90,-90], lng [-180,180]).
       Lazily loads the canvas on first call so the cursor-readout shows climate even
       when the Köppen overlay isn't enabled. */
    window._koppenLoadStarted=false;
    /* (#R23) Cursor/click climate sampling RESTORED — memory-safe: it reads the ≤2048² work canvas
       (~16 MB), never the full 8192² image (the 268 MB decode that caused the OOM). The big full-res
       highlight path (_koppenFull) stays disabled; only this cheap sampling + the small-canvas highlight
       come back, which is what the user asked to restore ("以前まであった…復活させて"). */
    window.sampleKoppenAt=function(lng,lat){ try{ return window.sampleKoppenAt_LEGACY(lng,lat); }catch(_){ return null; } };
    window.sampleKoppenAt_LEGACY=function(lng,lat){
      if(!window._koppenReady){
        if(!window._koppenLoadStarted){ window._koppenLoadStarted=true; loadKoppenCanvas(); }
        return null;
      }
      if(!window._koppenCanvas) return null;
      if(lat>85.0511||lat<-85.0511) return null;
      const W=window._koppenCanvas.width, H=window._koppenCanvas.height;
      const x=Math.max(0,Math.min(W-1,Math.round((lng+180)/360*W)));
      /* canvas is Web-Mercator → invert the Mercator Y to find the pixel row */
      const mercY=Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
      const y=Math.max(0,Math.min(H-1,Math.round((Math.PI-mercY)/(2*Math.PI)*H)));
      try{ const p=window._koppenCanvas.getContext('2d').getImageData(x,y,1,1).data; return nearestKoppenCode(p[0],p[1],p[2],p[3]); }
      catch(e){ return null; }
    };
    /* PERF (#12): classify every pixel into a Köppen-code index ONCE. The previous code ran a
       30-color nearest-match for every pixel on every highlight rebuild (W·H·30 ops per click,
       tens of millions), which is why per-climate highlighting felt heavy. With the index cached,
       each rebuild is a single cheap pass (no nearest-color search), ~30× faster. */
    window._koppenCodeIdx=null; window._koppenSrcData=null;
    function ensureKoppenCodeIndex(){
      if(window._koppenCodeIdx || !window._koppenCanvas) return;
      const c=window._koppenCanvas, W=c.width, H=c.height;
      let d; try{ d=c.getContext('2d').getImageData(0,0,W,H).data; }catch(e){ return; }
      const idx=new Uint8Array(W*H), cache=new Map();      /* RGB→code-index cache (only ~30 colors) */
      for(let p=0,i=0;p<idx.length;p++,i+=4){
        if(d[i+3]<32){ idx[p]=255; continue; }
        const key=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
        let ci=cache.get(key);
        if(ci===undefined){
          let best=255,bestD=Infinity;
          for(let k=0;k<KCOL.length;k++){ const cc=KCOL[k][1],dr=d[i]-cc[0],dg=d[i+1]-cc[1],db=d[i+2]-cc[2],dd2=dr*dr+dg*dg+db*db; if(dd2<bestD){bestD=dd2;best=k;} }
          ci=(bestD<6000)?best:255; cache.set(key,ci);
        }
        idx[p]=ci;
      }
      window._koppenCodeIdx=idx; window._koppenSrcData=d;   /* keep the original pixels for fast recolor */
    }
    /* Highlight = recolor the climate image so SELECTED classes stay vivid and the rest is grayed +
       faded, then feed it back into the SAME image source (the proven R12 approach the user was happy
       with — no separate overlay layer). It's computed on the small work-canvas, so the per-pixel pass
       and the toDataURL are ~16× cheaper than on the full 8192² image → the class-select lag is gone but
       the behavior/appearance matches the version that worked. When nothing is selected we restore the
       full-res KURL. */
    function buildKoppenHighlightURL(selectedSet){
      if(!window._koppenReady||!window._koppenCanvas) return null;
      if(!selectedSet||selectedSet.size===0) return null;
      ensureKoppenCodeIndex();
      const idx=window._koppenCodeIdx, src=window._koppenSrcData; if(!idx||!src) return null;
      const W=window._koppenCanvas.width, H=window._koppenCanvas.height;
      const selIdx=new Uint8Array(KCOL.length);
      for(let k=0;k<KCOL.length;k++) if(selectedSet.has(KCOL[k][0])) selIdx[k]=1;
      const out=document.createElement('canvas'); out.width=W; out.height=H;
      const octx=out.getContext('2d'), img=octx.createImageData(W,H), o=img.data;
      for(let p=0,i=0;p<idx.length;p++,i+=4){
        const ci=idx[p];
        if(ci!==255 && selIdx[ci]){ o[i]=src[i]; o[i+1]=src[i+1]; o[i+2]=src[i+2]; o[i+3]=src[i+3]; }   /* selected: keep */
        else { const g=(src[i]+src[i+1]+src[i+2])/3; o[i]=g*0.6; o[i+1]=g*0.6; o[i+2]=g*0.6; o[i+3]=Math.floor(src[i+3]*0.28); }   /* rest: gray + faded */
      }
      octx.putImageData(img,0,0);
      try{ return out.toDataURL('image/png'); }catch(e){ return null; }
    }
    /* (#R13c) FULL-RES highlight. The user asked us to STOP dropping resolution when a class is
       highlighted: the small 2048² work-canvas is kept ONLY for fast cursor sampling, while the
       DISPLAYED highlight is now recolored at the source image's native resolution (8192² desktop /
       4096² mobile cap) and encoded ASYNCHRONOUSLY (toBlob → objectURL) so the map never blurs and the
       UI never freezes. Built lazily on first highlight, freed when the selection clears / era changes.
       Graceful fallback to the small-canvas highlight if the full path can't run (file:// taint / OOM). */
    window._koppenFull=null;
    /* (#R15) MEMORY-BUDGET-AWARE cap. The re-reported crash ("特定の気候を選ぶと落ちて先祖返り") is the tab
       being OOM-killed during the full-res highlight; the reloaded tab then serves a STALE file:// disk
       cache (the "old version revives" symptom). The output canvas alone is 4·W·H bytes (268 MB at 8192²),
       so on low-RAM machines we cap lower — keeping the highlight crisp but never crashing. 8 GB+ desktops
       keep full 8192² (no quality loss where it's safe). navigator.deviceMemory is coarse GB (or undefined). */
    /* (#R15c) The OOM kills the tab BEFORE any try/catch can fire (Chrome's OOM killer), so the only
       reliable fix is to never allocate the ~268 MB (8192²) output canvas + PNG buffer for the HIGHLIGHT.
       Cap the highlight at 4096² desktop / 2048² mobile (out-canvas ≤67 MB / ≤16 MB). The BASE Köppen
       image stays full 8192² (unhighlighted view = no quality loss); the grayed highlight at 4096² is
       still crisp at any normal zoom. This is what finally stops the "選ぶと落ちて先祖返り" crash. */
    function _koppenFullCap(){ try{
      if(typeof isMobile==='function'&&isMobile()) return 2048;
      const dm=(typeof navigator!=='undefined'&&navigator.deviceMemory)||0;
      if(dm && dm<=4) return 3072;        /* ≤4 GB → 3072² */
      return 4096;                        /* desktop → 4096² (≈67 MB out canvas — safe on any machine) */
    }catch(_){ return 3072; } }
    /* (#R14) MEMORY-SAFE full-res highlight — the previous version OOM-crashed the tab (and the page
       reloaded → "先祖返り"): at 8192² it held the 268 MB source pixel array + a 268 MB output ImageData
       + a 268 MB output canvas + the PNG-encode buffer ALL AT ONCE (>1 GB peak). Two changes roughly
       HALVE the peak so it no longer crashes, while keeping the SAME 8192²/4096² resolution (画質維持):
       (1) The Köppen image is a CATEGORICAL palette, so we never keep the raw RGBA — we keep only a
           1-byte-per-pixel class index (`idx`), built in horizontal STRIPS (peak ≈ one strip, not the
           whole image), and reconstruct every color from KCOL.
       (2) The output is written in STRIPS too (one small ImageData per strip, blitted onto the canvas),
           so we never allocate a second full-frame ImageData.
       Any allocation/taint failure is caught → the caller falls back to the small-canvas highlight. */
    function ensureKoppenFull(){
      if(window._koppenFull) return window._koppenFull;
      /* (#R217) the work canvas is the source wherever the decoded image was released — on a phone
         the two are the same 2048², so this is the identical raster and not a fallback in quality.
         `drawImage` reads a canvas exactly as it reads an <img>; only the size fields differ. */
      const im=window._koppenImg||window._koppenCanvas; if(!im) return null;
      const nw=im.naturalWidth||im.width, nh=im.naturalHeight||im.height;
      const cap=_koppenFullCap(), sc=Math.min(1, cap/Math.max(nw,nh,1));
      const W=Math.max(1,Math.round(nw*sc)), H=Math.max(1,Math.round(nh*sc));
      try{
        const idx=new Uint8Array(W*H), cache=new Map();
        const STRIP=Math.max(1,Math.min(H,Math.floor((1<<21)/Math.max(1,W))));   /* ≈2 M px / strip */
        const c=document.createElement('canvas'); c.width=W; c.height=STRIP;
        const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false;
        const srcScaleY=nh/H, srcScaleX=nw/W;
        for(let y0=0;y0<H;y0+=STRIP){
          const rows=Math.min(STRIP,H-y0);
          cx.clearRect(0,0,W,rows);
          /* draw the matching source-image band (handles cap down-scale via the source rect) */
          cx.drawImage(im, 0, Math.round(y0*srcScaleY), nw, Math.round(rows*srcScaleY), 0, 0, W, rows);
          const d=cx.getImageData(0,0,W,rows).data;   /* may throw on tainted file:// canvas → caught */
          for(let p=y0*W, i=0; i<d.length; p++, i+=4){
            if(d[i+3]<32){ idx[p]=255; continue; }
            const key=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; let ci=cache.get(key);
            if(ci===undefined){ let best=255,bestD=Infinity; for(let k=0;k<KCOL.length;k++){ const cc=KCOL[k][1],dr=d[i]-cc[0],dg=d[i+1]-cc[1],db=d[i+2]-cc[2],dd2=dr*dr+dg*dg+db*db; if(dd2<bestD){bestD=dd2;best=k;} } ci=(bestD<6000)?best:255; cache.set(key,ci); }
            idx[p]=ci;
          }
        }
        c.width=c.height=0;                            /* free the strip canvas backing */
        window._koppenFull={idx, W, H};                /* NO 268 MB src array kept — palette reconstructs it */
        return window._koppenFull;
      }catch(e){ return null; }
    }
    function freeKoppenFull(){ window._koppenFull=null; }   /* drop ~refs; GC reclaims the big typed arrays */
    function buildKoppenHighlightFull(selectedSet, cb){
      const f=ensureKoppenFull(); if(!f){ cb(null); return; }
      try{
        const idx=f.idx, W=f.W, H=f.H, N=KCOL.length;
        /* per-class color LUT (selected→vivid KCOL, else gray+faded); index 255 → transparent */
        const LR=new Uint8Array(256),LG=new Uint8Array(256),LB=new Uint8Array(256),LA=new Uint8Array(256);
        for(let k=0;k<N;k++){ const c=KCOL[k][1];
          if(selectedSet.has(KCOL[k][0])){ LR[k]=c[0];LG[k]=c[1];LB[k]=c[2];LA[k]=255; }
          else { const g=Math.round((c[0]+c[1]+c[2])/3*0.6); LR[k]=g;LG[k]=g;LB[k]=g;LA[k]=71; } }
        const out=document.createElement('canvas'); out.width=W; out.height=H;
        const octx=out.getContext('2d');
        if(!octx){ try{ out.width=out.height=0; }catch(_){} cb(null); return; }   /* alloc failed → small-canvas fallback, no crash */
        const STRIP=Math.max(1,Math.min(H,Math.floor((1<<21)/Math.max(1,W))));   /* one small ImageData / strip */
        for(let y0=0;y0<H;y0+=STRIP){
          const rows=Math.min(STRIP,H-y0);
          const img=octx.createImageData(W,rows), o=img.data;
          for(let p=y0*W, j=0; j<o.length; p++, j+=4){ const ci=idx[p]; o[j]=LR[ci]; o[j+1]=LG[ci]; o[j+2]=LB[ci]; o[j+3]=LA[ci]; }
          octx.putImageData(img,0,y0);
        }
        if(out.toBlob){ out.toBlob(b=>{ try{ out.width=out.height=0; }catch(_){} cb(b?URL.createObjectURL(b):null); }, 'image/png'); }
        else { let u=null; try{ u=out.toDataURL('image/png'); }catch(_){} try{ out.width=out.height=0; }catch(_){} cb(u); }
      }catch(e){ cb(null); }
    }
    /* ===== (#R18) GPU highlight — FULL native resolution on EVERY device, ZERO allocation. =====
       The canvas pipeline above re-encodes the whole image to highlight a class, which forced a
       resolution cap (the 8192² output canvas alone is ~268 MB → mobile OOM). Instead: the Köppen
       palette is CATEGORICAL, so `raster-color` (MapLibre ≥4.6 — we ship v5) can re-color each class
       IN THE SHADER on the original full-res texture: selected classes keep their vivid palette color,
       the rest collapse to faded gray. raster-color-mix maps each palette RGB to a unique scalar
       (weights [2.7,0.6,0.1] separate all 30 classes by ≥1.1% of the 0–3.3 range — safe even in fp16),
       and a `step` ramp assigns the output color per class. No second decode, no canvas, no PNG encode →
       the displayed quality is the full 8192² everywhere AND the crash vector is gone ("画質は保持しろ、
       ただしモバイルでも落とすな" — both at once). raster-resampling:nearest while highlighted keeps
       texels exact (no blended colors falling into the wrong bin); restored to linear when cleared.
       Runtime feature-detect (window._koppenGPUOK) falls back to the proven canvas path on old engines. */
    const KOPPEN_MIX=[2.7,0.6,0.1,0], KOPPEN_RANGE=[0,3.3];
    function _kScalar(c){ return 2.7*c[0]/255+0.6*c[1]/255+0.1*c[2]/255; }
    function koppenColorRamp(selectedSet){
      /* a `step` over the normalised raster-value: ocean/transparent (value≈0) → fully transparent;
         each class band → its color (selected = vivid, else faded gray). Stops are the midpoints
         between adjacent class scalars so every texel lands squarely in its own band. */
      const entries=KCOL.map(([code,c])=>({code,c,v:_kScalar(c)/KOPPEN_RANGE[1]})).sort((a,b)=>a.v-b.v);
      const colFor=(e)=>{ if(selectedSet.has(e.code)) return 'rgba('+e.c[0]+','+e.c[1]+','+e.c[2]+',1)';
        const g=Math.round((e.c[0]+e.c[1]+e.c[2])/3*0.6); return 'rgba('+g+','+g+','+g+',0.28)'; };
      const expr=['step',['raster-value'],'rgba(0,0,0,0)'];   /* below the first stop → transparent (ocean) */
      for(let i=0;i<entries.length;i++){ const lo=(i===0)?entries[0].v/2:(entries[i-1].v+entries[i].v)/2; expr.push(lo, colFor(entries[i])); }
      return expr;
    }
    /* Apply (or clear) the GPU recolor. Returns null if the layer isn't added yet (retry later, do NOT
       disable GPU), true on success, false only if the engine actually rejects raster-color → canvas fallback. */
    function applyKoppenGPUHighlight(){
      if(!GE().layers.has('lyr-climate')) return null;
      try{
        if(kSelected.size===0){
          GE().layers.setPaint('lyr-climate','raster-color', null);
          GE().layers.setPaint('lyr-climate','raster-color-mix', null);
          GE().layers.setPaint('lyr-climate','raster-color-range', null);
          try{ GE().layers.setPaint('lyr-climate','raster-resampling','linear'); }catch(_){}
        } else {
          GE().layers.setPaint('lyr-climate','raster-color-mix', KOPPEN_MIX);
          GE().layers.setPaint('lyr-climate','raster-color-range', KOPPEN_RANGE);
          GE().layers.setPaint('lyr-climate','raster-color', koppenColorRamp(kSelected));
          try{ GE().layers.setPaint('lyr-climate','raster-resampling','nearest'); }catch(_){}
        }
        return true;
      }catch(e){ return false; }
    }
    window._koppenHLUrl=null; window._koppenHLSeq=0; window._koppenGPUOK=undefined;
    /* (#R22) Highlight recolor retired (backend raster only) — keep the function as a safe no-op so the
       many existing callers don't need touching; it just guarantees the plain era PNG is shown. */
    /* (#R23) Class highlight RESTORED — memory-safe small-canvas recolor only (≤2048² → ≤16 MB out).
       The big full-res highlight (_koppenFull / GPU path, 67-268 MB) stays OFF: that was the OOM source,
       not this cheap work-canvas. No selection → restore the plain display PNG. */
    window._refreshKoppenImage=function(){
      if(!GE().layers.hasSource('src-climate')) return;
      clearTimeout(window._koppenRefreshT);
      window._koppenRefreshT=setTimeout(()=>{
        const setImg=(url)=>{ try{ if(GE().layers.hasSource('src-climate')) GE().layers.updateImage('src-climate',{url:url,coordinates:KCOORDS}); }catch(e){} };
        if(!window.kSelected || window.kSelected.size===0){ setImg(KURL); return; }
        if(!window._koppenReady){ if(!window._koppenLoadStarted){ window._koppenLoadStarted=true; loadKoppenCanvas().then(()=>{ try{ window._refreshKoppenImage(); }catch(_){} }); } return; }
        let u=null; try{ u=buildKoppenHighlightURL(window.kSelected); }catch(_){}
        setImg(u||KURL);
      },45);
    };
    window._refreshKoppenImage_LEGACY=function(){
      if(!GE().layers.hasSource('src-climate')) return;
      /* Debounce so rapid multi-class selection coalesces into one rebuild (#12). */
      clearTimeout(window._koppenRefreshT);
      window._koppenRefreshT=setTimeout(()=>{
        /* (#R18) GPU path first — full-res, instant, no allocation. */
        if(window._koppenGPUOK!==false){
          const ok=applyKoppenGPUHighlight();
          if(ok===true){ window._koppenGPUOK=true;
            /* the GPU recolors the live full-res texture, so the source image stays the plain era PNG */
            if(window._koppenHLUrl){ try{ URL.revokeObjectURL(window._koppenHLUrl); }catch(_){} window._koppenHLUrl=null; }
            try{ if(GE().layers.hasSource('src-climate')) GE().layers.updateImage('src-climate',{url:KURL,coordinates:KCOORDS}); }catch(_){}
            freeKoppenFull();
            /* (#R19) The shader path never touches the per-pixel code index / source-copy buffers —
               drop them (up to ~270 MB desktop / ~80 MB mobile). The canvas fallback rebuilds them
               on demand, and cursor sampling reads the (kept) work canvas directly. */
            window._koppenCodeIdx=null; window._koppenSrcData=null;
            return;
          }
          if(ok===false){ window._koppenGPUOK=false; }   /* engine REJECTED raster-color → canvas pipeline below */
          else { return; }   /* ok===null: layer not added yet — addKoppen re-calls us once it is */
        }
        const seq=++window._koppenHLSeq;
        const setImg=(url)=>{ try{ GE().layers.updateImage('src-climate',{url:url,coordinates:KCOORDS}); }catch(e){} };
        if(kSelected.size===0){
          setImg(KURL);
          if(window._koppenHLUrl){ try{ URL.revokeObjectURL(window._koppenHLUrl); }catch(_){} window._koppenHLUrl=null; }
          freeKoppenFull();
          return;
        }
        buildKoppenHighlightFull(kSelected,(url)=>{
          if(seq!==window._koppenHLSeq){ if(url){ try{ URL.revokeObjectURL(url); }catch(_){} } return; }   /* superseded by a newer selection */
          if(!url){ /* full-res path unavailable → low-res fallback so highlight still works */
            const u2=buildKoppenHighlightURL(kSelected); setImg(u2||KURL); return;
          }
          const prev=window._koppenHLUrl; setImg(url); window._koppenHLUrl=url;
          if(prev){ try{ URL.revokeObjectURL(prev); }catch(_){} }
        });
      },45);
    };
    /* Switch the active Köppen era (#R12). Resets the cached sampling canvas + per-pixel code index so
       cursor sampling and class-highlighting reflect the chosen period, then swaps the map image. */
    window.setKoppenPeriod=function(period){
      if(!window.KOPPEN_PERIODS.some(x=>x[0]===period)) return;
      window._koppenPeriod=period; KURL=koppenDisplayURL(period);
      /* (#R23) era changed → invalidate the cached sampling canvas + per-pixel code index so cursor
         sampling and the class highlight reflect the chosen period (they lazily reload the new era). */
      window._koppenImg=null; window._koppenCanvas=null; window._koppenReady=false; window._koppenLoadStarted=false;
      window._koppenCodeIdx=null; window._koppenSrcData=null;
      try{ if(GE().layers.hasSource('src-climate')) GE().layers.updateImage('src-climate',{url:KURL,coordinates:KCOORDS}); }catch(e){}
      /* (#R193) a NEW era is a new pair of files: show the small one at once (which is what KURL is
         now) and let the full-resolution one arrive behind it. Switching eras is the one moment a
         user is watching this layer, so the small file landing first is the point, not a compromise. */
      _kUpgraded=''; koppenUpgrade(period);
      try{ buildLegend(); }catch(_){}
      if(window.kSelected && window.kSelected.size>0 && window._refreshKoppenImage) window._refreshKoppenImage();
    };

    function addKoppen(){
      /* (#R22) Köppen is now a PURE BACKEND-RENDERED raster ("フロントエンドではなくバックエンドに戻して").
         We add the pre-rendered era PNG straight to the map — NO in-browser canvas decode, pixel
         sampling, or client-side highlight recolor (that whole pipeline was the recurring OOM / iPhone
         crash source). The legend stays as a color key (+ era switch + right-click criteria). */
      KURL=koppenDisplayURL(window._koppenPeriod);   /* (#R23) recompute now that isMobile() is reliable → phones get the 4k texture */
      if(!GE().layers.hasSource('src-climate')){
        GE().layers.addSource('src-climate',{type:'image',url:KURL,coordinates:KCOORDS});
        /* (#R24) insert the raster BELOW the place-name / border label stack so Köppen never hides the
           country labels ("ケッペンを重ねると国名ラベルが後ろに隠れる"); raise() still self-heals as a backstop. */
        const _lblAnchor=['layer-sat-labels','borders-only-line','ofm-country','ofm-city','ofm-other'].find(id=>GE().layers.get(id))||beforeId;
        GE().layers.add({id:'lyr-climate',type:'raster',source:'src-climate',layout:{visibility:'visible'},paint:{'raster-opacity':opacities.climate,'raster-fade-duration':0}},_lblAnchor);
      } else { setVis('lyr-climate',true); }
      koppenUpgrade(window._koppenPeriod);     /* (#R193) the full-resolution file, once the page is idle */
      try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){}
      buildLegend();
      if(window.kSelected && window.kSelected.size>0 && window._refreshKoppenImage) window._refreshKoppenImage();
    }
    function buildLegend(){
      const lg=document.getElementById('koppen-legend');
      /* (#R189) the default-on dispatcher fires synthetic changes up to 2.6 s after boot — if the
         legend element is not in the DOM at that moment (measured: tests/r151 removes it between
         ticks), this wrote innerHTML on null and the whole change handler died uncaught */
      if(!lg) return;
      const clearBtn=kSelected.size>0?`<button class="kl-clear" id="kl-clear">${window.IntMapLang.t(HOST.lang,'Clear selection','選択解除','Auswahl aufheben','Снять выделение','Quitar selección')}</button>`:'';
      const dragTitle=window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите для перемещения','Arrastra para mover');
      /* The drag handle is part of the rebuilt markup so it survives every innerHTML refresh — the
         old code injected it once after setup and buildLegend() wiped it, so the legend "couldn't be
         moved" (#22). */
      /* (#R12) Period pulldown — default present-day, switch to historical eras. */
      const perLabel=window.IntMapLang.t(HOST.lang,'Period','期間','Zeitraum','Период','Período');
      const periodSel=`<div class="kl-period"><label>${perLabel}</label><select id="kl-period">`+window.KOPPEN_PERIODS.map(([p])=>`<option value="${p}"${p===window._koppenPeriod?' selected':''}>${p}</option>`).join('')+`</select></div>`;
      /* (#R23) Click a class = highlight just that climate on the map (RESTORED). Selected rows get the
         .sel outline + a Clear button; long-press (mobile) / right-click (desktop) shows the criteria. */
      lg.innerHTML=`<span class="kl-drag" title="${dragTitle}">⋮⋮</span><button class="layer-popup-x" id="kl-close" title="${t('close')}">×</button><h4>${t('lgdTitle')}</h4>`+periodSel+`<div class="kl-scroll">`+KCOL.map(([code,c])=>{ const _kn=window.kName(code), _knm=(_kn===code?'':_kn); return `<div class="kl-item${kSelected.has(code)?' sel':''}" data-c="${code}" title="${code}${_knm?' · '+_knm:''}"><span class="kl-sw" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span><span class="kl-code">${code}</span>${_knm?`<span class="kl-nm"> · ${_knm}</span>`:''}</div>`; }).join('')+`</div>`+clearBtn+`<div class="kl-hint">${_imTouchPrimary()?(window.IntMapLang.t(HOST.lang,'Tap to highlight • long-press for criteria','タップでその気候だけ強調 / 長押しで定義','Tippen: Klima hervorheben • lange drücken: Kriterien','Касание — выделить климат • долгое нажатие — критерии','Toca para resaltar el clima • mantén pulsado para criterios')):(window.IntMapLang.t(HOST.lang,'Click to highlight • right-click for criteria','クリックでその気候だけ強調 / 右クリックで定義','Klick: Klima hervorheben • Rechtsklick: Kriterien','Клик — выделить климат • правый клик — критерии','Clic: resaltar clima • clic derecho: criterios'))}</div>`;
      const psel=lg.querySelector('#kl-period'); if(psel) psel.onchange=(e)=>{ window.setKoppenPeriod(e.target.value); };
      const clr=lg.querySelector('#kl-clear'); if(clr) clr.onclick=()=>{ kSelected.clear(); buildLegend(); if(window._refreshKoppenImage) window._refreshKoppenImage(); };
      lg.querySelectorAll('.kl-item').forEach(it=>{
        const code=it.dataset.c;
        const crit=(x,y)=>showKoppenInfo(code,x,y);
        let lpT=null, lpFired=false;
        it.onclick=()=>{ if(lpFired){ lpFired=false; return; } kSelected.has(code)?kSelected.delete(code):kSelected.add(code); buildLegend(); if(window._refreshKoppenImage) window._refreshKoppenImage(); };
        it.oncontextmenu=(e)=>{ e.preventDefault(); crit(e.clientX,e.clientY); };
        it.addEventListener('touchstart',(e)=>{ lpFired=false; const tt=e.touches&&e.touches[0]; lpT=setTimeout(()=>{ lpT=null; lpFired=true; crit(tt?tt.clientX:0,tt?tt.clientY:0); },480); },{passive:true});
        it.addEventListener('touchmove',()=>{ if(lpT){ clearTimeout(lpT); lpT=null; } },{passive:true});
        it.addEventListener('touchend',()=>{ if(lpT){ clearTimeout(lpT); lpT=null; } },{passive:true});
      });
      const xb=lg.querySelector('#kl-close'); if(xb) xb.onclick=()=>{ /* × also disables the layer (user request) */ const cb2=document.getElementById('dl-climate'); if(cb2){ cb2.checked=false; cb2.dispatchEvent(new Event('change')); } };
      try{ window._ensureLegendOpacity&&window._ensureLegendOpacity(lg); window._ensureLegendMinimize&&window._ensureLegendMinimize(lg); }catch(_){}
      try{ window._wireLegendDrag&&window._wireLegendDrag(lg); }catch(_){}
      try{ _fitKoppenLegend(lg); }catch(_){}
    }
    /* (#R150) "上下に伸ばして…一番下まで伸ばせない" — the user wants to DRAG the legend all the way down to the
       BOTTOM OF THE SCREEN and have it stop there. R147–R149 clamped max-height to the CONTENT height, so
       resize:vertical could never exceed the content: on a tall display (or with only a few classes selected)
       the grip stopped short of the bottom and the box refused to grow — exactly "一番下まで伸ばせない". The fix
       is to base the ceiling on the VIEWPORT, not the content: from the legend's own top edge down to ~12px
       above the screen bottom. Now the grip stretches to the very bottom and STOPS at the screen edge (the CSS
       max-height cap), while the inner .kl-scroll keeps every one of the ~30 classes reachable when the box is
       shorter than the content. Recomputed on rebuild / show / window-resize. Desktop only (mobile CSS owns it). */
    function _fitKoppenLegend(lg){ try{
      lg=lg||document.getElementById('koppen-legend'); if(!lg) return;
      const cs=getComputedStyle(lg);
      if(cs.display==='none' || lg.classList.contains('legend-collapsed')) return;
      if(window.innerWidth<=768) return;
      /* (#R154) WIDTH HUGS THE CONTENT (per language). Measure the widest zone row (code + " · name") with an off-screen
         span in the legend's own font, then size the panel to exactly that + row chrome + the reserved scrollbar gutter,
         clamped 176–324px and to what fits right of the panel. Ends BOTH width complaints at once: no dead space when the
         text is short (Japanese ≈ 205px border-box, was 286 = ~80px empty) and no clipping when it is long (German fits).
         Set ONLY here (build / show / window-resize), never during the vertical drag → the row width never shifts on its
         own ("気候名の行幅が勝手に動かない"). Rows are single-line (nowrap), so width does not change the measured height. */
      try{ const items=lg.querySelectorAll('.kl-item');
        if(items.length){ const m=document.createElement('span');
          m.style.cssText='position:absolute;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;font-size:'+cs.fontSize+';font-family:'+cs.fontFamily+';';
          document.body.appendChild(m); let mx=0;
          items.forEach(it=>{ const cd=it.querySelector('.kl-code'), nm=it.querySelector('.kl-nm');
            m.style.fontWeight='600'; m.textContent=cd?cd.textContent:''; let w=m.offsetWidth;
            if(nm){ m.style.fontWeight='400'; m.textContent=nm.textContent; w+=m.offsetWidth; }
            if(w>mx) mx=w; });
          document.body.removeChild(m);
          if(mx>0){ const contentW=Math.round(mx + 11 + 12 + 8 + 15 + 22 + 6);   /* (#R155) border-box: swatch(11)+2 flex gaps(12)+item padding(8)+scrollbar gutter(15)+CONTAINER padding+border(22)+slack(6). Under box-sizing:border-box the width we set includes the 20px padding+2px border, so it must be added here — the old content-box formula omitted them, so the visible panel ran ~22px wider than the text it was sized for. */
            const room=Math.round((window.innerWidth - lg.getBoundingClientRect().left) - 16);
            const w=Math.max(190, Math.min(460, room>200?room:460, contentW));   /* (#R155) max 324→460 so the longest German/Russian names fit without clipping */
            lg.style.width=w+'px'; } }
      }catch(_){}
      const top=lg.getBoundingClientRect().top;                 /* rendered top edge (top-anchored: stable as it grows) */
      const renderedMax=Math.round(window.innerHeight - top - 8);   /* (#R154) 12→8: a few more px of reach toward the bottom so the LAST zone clears on a slightly shorter viewport too */
      /* (#R151) STOP WHEN ALL CLASSES ARE SHOWN ("すべての気候区分が表示されたら止まる"). R150 set max-height = the
         viewport ceiling with NO content clamp, so the resize grabber kept stretching into EMPTY space past the last
         class. Measure the natural height that shows every class (temporarily neutralise any dragged inline height +
         max-height so the box shrink-wraps), then cap at min(content, viewport): a short list stops exactly at its
         last row (no blank space), a list taller than the screen stops at the screen bottom with the inner .kl-scroll
         revealing the rest. Measured set→read→restore in one synchronous task → no paint, no flicker. */
      const prevH=lg.style.height, prevMH=lg.style.maxHeight;
      lg.style.maxHeight='none'; lg.style.height='auto';
      const naturalBorderBox=lg.getBoundingClientRect().height;   /* full height that shows every climate class */
      lg.style.height=prevH; lg.style.maxHeight=prevMH;
      const ceil=Math.min(renderedMax, Math.ceil(naturalBorderBox));   /* border-box: content OR viewport, whichever is smaller */
      /* max-height on a content-box element sizes the CONTENT box; the rendered border-box is that + padding + border. */
      let mh=ceil;
      if(cs.boxSizing!=='border-box'){ const pb=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0)+(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0); mh=Math.max(0, ceil-pb); }
      lg.style.maxHeight=Math.max(150, mh)+'px';
    }catch(_){} }
    window._fitKoppenLegend=_fitKoppenLegend;
    (function(){ let _klRz=null; window.addEventListener('resize',()=>{ if(_klRz) return; _klRz=setTimeout(()=>{ _klRz=null; try{ const lg=document.getElementById('koppen-legend'); if(!lg||getComputedStyle(lg).display==='none') return; if(window.innerWidth<=768) lg.style.maxHeight=''; else _fitKoppenLegend(lg); }catch(_){} },200); }); })();
    /* Decode a Köppen code into its defining criteria (#25) — letter by letter, EN + JP. */
    /* ══ ⚠ (#R236) THE KÖPPEN CRITERIA WERE ENGLISH AND JAPANESE ONLY ══════════════════════════════
       「ドイツ語、ロシア語、スペイン語について、すべての面において対応が完璧かどうか最終点検し、
         未了点があれば修正して。」

       This table returned `{en, jp}` and the caller picked with `HOST.lang==='jp'?info.jp:info.en`,
       so a German, Russian or Spanish reader who clicked a climate cell got the criteria in English
       — nineteen strings, on a layer whose whole purpose is explaining what the letters mean.
       ⚠ INVISIBLE TO BOTH INSTRUMENTS, which is why it survived seven rounds of "100 % translated":
       scripts/i18n-positional-audit.mjs reads `L(…)` call sites and this was neither `L(…)` nor a
       five-language ternary, just a two-column table. Through the registry now, so the five slots
       are positional and a missing one shows up. */
    function koppenCriteria(code){
      const T5=(a)=>window.IntMapLang.t(HOST.lang,a[0],a[1],a[2],a[3],a[4]);
      const g=code[0], rest=code.slice(1), out=[];
      const main={A:LA('Tropical — coldest month ≥ 18 °C','熱帯 — 最寒月も18°C以上','Tropisch — kältester Monat ≥ 18 °C','Тропический — самый холодный месяц ≥ 18 °C','Tropical — mes más frío ≥ 18 °C'),
        B:LA('Arid — annual precipitation below the Köppen dryness threshold','乾燥帯 — 年降水量が乾燥限界未満','Arid — Jahresniederschlag unter der Köppen-Trockengrenze','Аридный — годовые осадки ниже порога сухости Кёппена','Árido — precipitación anual por debajo del umbral de aridez de Köppen'),
        C:LA('Temperate — coldest month 0–18 °C','温帯 — 最寒月0〜18°C','Gemäßigt — kältester Monat 0–18 °C','Умеренный — самый холодный месяц 0–18 °C','Templado — mes más frío 0–18 °C'),
        D:LA('Continental — coldest month < 0 °C, warmest > 10 °C','冷帯（亜寒帯）— 最寒月0°C未満・最暖月10°C超','Kontinental — kältester Monat < 0 °C, wärmster > 10 °C','Континентальный — самый холодный месяц < 0 °C, самый тёплый > 10 °C','Continental — mes más frío < 0 °C, más cálido > 10 °C'),
        E:LA('Polar — warmest month < 10 °C','寒帯 — 最暖月10°C未満','Polar — wärmster Monat < 10 °C','Полярный — самый тёплый месяц < 10 °C','Polar — mes más cálido < 10 °C')}[g];
      if(main) out.push(T5(main));
      const seg={ f:LA('No dry season (rain year-round)','年中湿潤（乾季なし）','Keine Trockenzeit (ganzjährig Regen)','Без сухого сезона (осадки круглый год)','Sin estación seca (lluvia todo el año)'),
        m:LA('Monsoonal — brief dry season, very wet overall','モンスーン（短い乾季・多雨）','Monsunal — kurze Trockenzeit, insgesamt sehr feucht','Муссонный — короткий сухой сезон, очень влажно','Monzónico — estación seca breve, muy húmedo en conjunto'),
        w:LA('Dry winter','冬季乾燥','Trockener Winter','Сухая зима','Invierno seco'),
        s:LA('Dry summer','夏季乾燥','Trockener Sommer','Сухое лето','Verano seco'),
        W:LA('Desert (true arid)','砂漠','Wüste (vollarid)','Пустыня (полностью аридная)','Desierto (árido pleno)'),
        S:LA('Steppe (semi-arid)','ステップ（半乾燥）','Steppe (semiarid)','Степь (полуаридная)','Estepa (semiárida)'),
        h:LA('Hot — mean annual ≥ 18 °C','高温（年平均18°C以上）','Heiß — Jahresmittel ≥ 18 °C','Жаркий — среднегодовая ≥ 18 °C','Cálido — media anual ≥ 18 °C'),
        k:LA('Cold — mean annual < 18 °C','寒冷（年平均18°C未満）','Kalt — Jahresmittel < 18 °C','Холодный — среднегодовая < 18 °C','Frío — media anual < 18 °C'),
        a:LA('Hot summer — warmest ≥ 22 °C','高温の夏（最暖月22°C以上）','Heißer Sommer — wärmster ≥ 22 °C','Жаркое лето — самый тёплый ≥ 22 °C','Verano cálido — más cálido ≥ 22 °C'),
        b:LA('Warm summer — warmest < 22 °C, ≥4 months > 10 °C','温暖な夏（最暖月22°C未満、10°C超が4か月以上）','Warmer Sommer — wärmster < 22 °C, ≥ 4 Monate > 10 °C','Тёплое лето — самый тёплый < 22 °C, ≥ 4 месяцев > 10 °C','Verano templado — más cálido < 22 °C, ≥ 4 meses > 10 °C'),
        c:LA('Cool short summer — 1–3 months > 10 °C','冷涼で短い夏（10°C超が1〜3か月）','Kühler kurzer Sommer — 1–3 Monate > 10 °C','Прохладное короткое лето — 1–3 месяца > 10 °C','Verano corto y fresco — 1–3 meses > 10 °C'),
        d:LA('Severe winter — coldest < −38 °C','厳寒の冬（最寒月−38°C未満）','Strenger Winter — kältester < −38 °C','Суровая зима — самый холодный < −38 °C','Invierno riguroso — más frío < −38 °C'),
        T:LA('Tundra — warmest month 0–10 °C','ツンドラ（最暖月0〜10°C）','Tundra — wärmster Monat 0–10 °C','Тундра — самый тёплый месяц 0–10 °C','Tundra — mes más cálido 0–10 °C'),
        F:LA('Ice cap — every month < 0 °C','氷雪（全月0°C未満）','Eiskappe — jeder Monat < 0 °C','Ледниковый — каждый месяц < 0 °C','Casquete glaciar — todos los meses < 0 °C') };
      for(const ch of rest){ if(seg[ch]) out.push(T5(seg[ch])); }
      return out;
    }
    function showKoppenInfo(code,x,y){
      const info=koppenCriteria(code), nm=window.kName(code);   /* (#R245) the one lookup */
      const lines=info.map(s=>`<li>${convTempText(s)}</li>`).join('');   /* (#R236) already in the reader's language */
      const col=(KCOL.find(k=>k[0]===code)||[,[150,150,150]])[1];
      let pop=document.getElementById('koppen-info-pop');
      if(!pop){ pop=document.createElement('div'); pop.id='koppen-info-pop'; pop.className='koppen-info-pop'; mc.appendChild(pop); }
      pop.innerHTML=`<button class="kip-x" title="${t('close')}">×</button><div class="kip-h"><span class="kl-sw" style="background:rgb(${col[0]},${col[1]},${col[2]})"></span><b>${code}</b> · ${nm}</div><ul>${lines}</ul>`;
      pop.style.display='block';
      const r=mc.getBoundingClientRect();
      pop.style.left=Math.max(8,Math.min((x||0)-r.left, r.width-248))+'px';
      pop.style.top=Math.max(8,Math.min((y||0)-r.top, r.height-180))+'px';
      pop.querySelector('.kip-x').onclick=()=>{ pop.style.display='none'; };
    }
    window.showKoppenInfo=showKoppenInfo;
    window._buildKoppenLegend=buildLegend;   /* so a map-click highlight can refresh the legend's selection state */

    /* Stagger legends vertically so multiple can show without overlapping. Only re-tile
       legends that haven't been manually dragged (left/top still 'auto'/unset). */
    /* Opacity slider moved INTO the legend popup (#17). Injected lazily into each legend the first
       time it's shown; covers every layer that has a legend. */
    function legendIdOf(el){ if(!el) return null; if(el.id==='koppen-legend') return 'climate'; const m=/^data-legend-(.+)$/.exec(el.id||''); return m?m[1]:null; }
    function ensureLegendOpacity(el){
      const id=legendIdOf(el); if(!id||opacities[id]==null) return;
      if(el.querySelector('.dl-op-row')) return;
      const row=document.createElement('div'); row.className='dl-op-row';
      row.innerHTML=`${window.IntMapLang.t(HOST.lang,'Opacity','不透明度','Deckkraft','Непрозрачность','Opacidad')}<input type="range" min="0" max="1" step="0.05" value="${opacities[id]}"><span class="dl-op-val">${Math.round(opacities[id]*100)}%</span>`;
      const hint=el.querySelector('.dl-hint, .kl-hint'); if(hint && hint.parentNode===el) el.insertBefore(row,hint); else el.appendChild(row);
      const r=row.querySelector('input'), val=row.querySelector('.dl-op-val');
      r.addEventListener('input',()=>{ const v=parseFloat(r.value); setLayerOpacity(id,v); if(val) val.textContent=Math.round(v*100)+'%'; });
    }
    window._ensureLegendOpacity=ensureLegendOpacity;
    /* (#R152) contour DENSITY slider — added to the contour legend right under its opacity row (layer controls live
       in the legend, R16 rule). Dragging rebuilds contour-src with a finer/coarser interval table (on release). */
    function ensureContourDensity(el){ try{
      if(!el || legendIdOf(el)!=='contours') return;
      if(el.querySelector('.dl-cd-row')) return;
      const d=Math.max(0.25,Math.min(4,+window._contourDensity||1));
      const row=document.createElement('div'); row.className='dl-op-row dl-cd-row';
      row.innerHTML=`${window.IntMapLang.t(HOST.lang,'Detail','細かさ','Dichte','Детализация','Detalle')}<input type="range" min="0.5" max="3" step="0.25" value="${d}"><span class="dl-op-val">${d}×</span>`;
      const op=el.querySelector('.dl-op-row:not(.dl-cd-row)');
      if(op && op.parentNode===el) el.insertBefore(row, op.nextSibling);
      else { const hint=el.querySelector('.dl-hint, .kl-hint'); if(hint && hint.parentNode===el) el.insertBefore(row,hint); else el.appendChild(row); }
      const r=row.querySelector('input'), val=row.querySelector('.dl-op-val');
      r.addEventListener('input',()=>{ if(val) val.textContent=parseFloat(r.value)+'×'; });
      r.addEventListener('change',()=>{ if(window._setContourDensity) window._setContourDensity(parseFloat(r.value)); });
    }catch(_){} }
    window._ensureContourDensity=ensureContourDensity;
    /* (#R15c) Generic legend for layers that previously had ONLY an inline opacity slider in the Layers
       panel and no legend of their own (precip, ships, planes, hillshade, contours, day/night).
       Now every opacity lives in a legend, so the Layers panel can drop its inline sliders. The opacity row
       + minimise button are added automatically by tileLegends()/ensureLegendOpacity() (id matches
       data-legend-<id> → opacities[<id>]). */
    /* ══ ⚠⚠ (#R241) THE LEGEND TITLES WERE A TWO-ELEMENT ARRAY ═══════════════════════════════════
       `['Precipitation (IMERG)','降水量 (IMERG)']` read at `IntMapLang.index(lang)` — so DE, RU, ES,
       FR, KO and both Chinese scripts all fell to element 0, English, and no instrument could see it
       (an array literal is not a call). Written as `LA(…)` these are ordinary L(…) sites: the
       positional audit checks the five slots and the inline table carries the rest. */
    const GENERIC_LEG={
      precip:LA('Precipitation (IMERG)','降水量 (IMERG)','Niederschlag (IMERG)','Осадки (IMERG)','Precipitación (IMERG)'),
      ships:LA('Live ship traffic','船舶（リアルタイム）','Schiffsverkehr (live)','Суда (в реальном времени)','Tráfico marítimo en vivo'),
      planes:LA('Live aircraft traffic','航空機（リアルタイム）','Flugverkehr (live)','Самолёты (в реальном времени)','Tráfico aéreo en vivo'),
      sats:LA('Live satellites','人工衛星（リアルタイム）','Live-Satelliten','Спутники в реальном времени','Satélites en vivo'),
      hillshade:LA('Elevation relief (hillshade)','陰影起伏','Schummerung (Relief)','Отмывка рельефа','Relieve sombreado'),
      contours:LA('Contour lines','等高線','Höhenlinien','Изолинии высот','Curvas de nivel'),
      night:LA('Day / night','昼/夜','Tag / Nacht','День / ночь','Día / noche'),
      subcables:LA('Submarine cables','海底ケーブル','Seekabel','Подводные кабели','Cables submarinos'),
      nato:LA('NATO members','NATO加盟国','NATO-Mitglieder','Страны НАТО','Miembros de la OTAN')
    };
    /* (#R19) `names`/`cbId` make this usable for ANY layer ("どのレイヤーも透明度選択ができるように"):
       a caller can register a legend (with auto opacity row) for a layer that has none — geo/strategic
       lines, l9 dams/volcanoes/aurora, plates, the new beta layers… — without touching GENERIC_LEG. */
    function ensureGenericLegend(id, names, cbId){
      /* (#R38) store all four [EN, JP, DE, RU]; callers that pass only [EN, JP] still work (DE/RU fall back to
         EN — never Japanese). (#R215) …and ES, which used to fall off the end of the array and show
         an English title to a Spanish reader (standing instruction 3). */
      /* == (#R268) A STRING IS NOT A LIST OF NAMES, AND INDEXING ONE GIVES A LETTER ==============
         「年降水量レイヤの凡例が、「降」となっている。」 MEASURED on the shipped build: the legend's
         <h4> read 「降」 in Japanese and 「A」 in English. js/precip-annual.js passed the ALREADY
         RESOLVED name (`NAME()`) where every other caller passes the LA(...) array, so `names[1]`
         was the second CHARACTER of 年降水量 and `names[0]` the 'A' of «Annual precipitation» — one
         letter per language, picked by the reader's language index. The caller is fixed, and so is
         this: a bare string is one name in every language, which is what a caller writing one
         obviously means, and there is no longer a way to spell it that yields a letter. */
      if(typeof names==='string') names=[names,names,names,names,names];
      if(names && !GENERIC_LEG[id]) GENERIC_LEG[id]=[names[0], names[1]||names[0], names[2]||names[0], names[3]||names[0], names[4]||names[0]];
      if(!GENERIC_LEG[id]) return null;
      let el=document.getElementById('data-legend-'+id);
      if(!el){ el=document.createElement('div'); el.className='data-legend generic-legend'; el.id='data-legend-'+id; el.style.bottom='140px';
        (document.getElementById('map-container')||document.body).appendChild(el);
        try{ window._wireLegendDrag&&window._wireLegendDrag(el); }catch(_){} }
      if(cbId) el.dataset.cbId=cbId;
      /* (#R241) resolved through `pick()` itself, so a language past the five positional slots
         gets its inline-table entry rather than English at index 0. */
      const nm=LDL.arr(GENERIC_LEG[id]);
      const _dragT=window.IntMapLang.t(HOST.lang,'Drag to move','ドラッグして移動','Zum Verschieben ziehen','Перетащите','Arrastra para mover');
      if(!el.querySelector('h4')){ el.innerHTML='<span class="dl-drag" title="'+_dragT+'">⋮⋮</span><button class="layer-popup-x" data-x="'+(cbId||id)+'" title="'+t('close')+'">×</button><h4>'+nm+'</h4>';   /* (#R40) data-x so the universal delegated × handler is a guaranteed fallback */
        el.querySelector('.layer-popup-x').onclick=()=>{ const cb=(el.dataset.cbId&&document.getElementById(el.dataset.cbId))||document.getElementById('dl-'+id); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } };
        /* (#R15d) ships/planes: the military/civilian filter moves from the Layers panel INTO the legend. */
        if(id==='ships'||id==='planes'){
          const fr=document.createElement('div'); fr.className='gl-filter-row'; fr.style.cssText='font-size:10.5px;color:var(--text-muted);margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
          const _fL=window.IntMapLang.t(HOST.lang,'Filter','絞り込み','Filter','Фильтр','Filtro');
          const _fAll=window.IntMapLang.t(HOST.lang,'All','すべて','Alle','Все','Todos');
          const _fCiv=window.IntMapLang.t(HOST.lang,'Civilian','民間','Zivil','Гражданские','Civil');
          const _fMil=window.IntMapLang.t(HOST.lang,'Military','軍用','Militär','Военные','Militar');
          fr.innerHTML=_fL+' <select class="gl-filter" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;"><option value="all">'+_fAll+'</option><option value="civilian">'+_fCiv+'</option><option value="military">'+_fMil+'</option></select>';
          el.appendChild(fr);
          const s=fr.querySelector('.gl-filter'); try{ s.value=(trafficFilters&&trafficFilters[id])||'all'; }catch(_){}
          s.addEventListener('change',()=>{ try{ trafficFilters[id]=s.value; }catch(_){} try{ refreshTrafficLayer(id); }catch(_){} });
          /* (#R172) aircraft can stand at their real altitude; the flat glyph is still one click away for
             anyone who wants a plain top-down picture. Lives next to the filter, same row, same legend. */
          if(id==='planes'){
            const a3=document.createElement('label'); a3.style.cssText='display:flex;align-items:center;gap:5px;cursor:pointer;';
            const _aL=window.IntMapLang.t(HOST.lang,'At real altitude','実際の高度で表示','In echter Höhe','На реальной высоте','A su altitud real');
            a3.innerHTML='<input type="checkbox" class="gl-alt3d" style="accent-color:var(--primary-color);">'+_aL;
            fr.appendChild(a3);
            const c3=a3.querySelector('.gl-alt3d'); try{ c3.checked=planes3DOn(); }catch(_){}
            c3.addEventListener('change',()=>{ try{ setPlanes3D(c3.checked); }catch(_){} });
          }
        }
        /* (#R184) satellites: the CelesTrak group is the equivalent of the traffic filter — it decides
           which catalogue is being propagated at all, so it belongs in the same place.
           ⚠ (#R266) THE "only visible from here" CHECKBOX IS GONE, BY INSTRUCTION (「ここから見えるもの
           だけ、チェックはいらない」). It was a second, silent way for the layer to be showing fewer
           objects than the catalogue holds, and the count line already reports drawn/total. The
           horizon geometry itself stays — `lookFrom` / `nextPass` are what the satellite card uses to
           say when a pass is — it is only the whole-layer FILTER that no longer exists. */
        if(id==='sats'){
          const A=()=>window.IntMapSatellites;
          const fr=document.createElement('div'); fr.className='gl-filter-row'; fr.style.cssText='font-size:10.5px;color:var(--text-muted);margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
          const _gL=window.IntMapLang.t(HOST.lang,'Catalog','カタログ','Katalog','Каталог','Catálogo');
          let opts='';
          try{ (A()?A().groups():[]).forEach(g=>{ opts+='<option value="'+HOST.escapeHtml(g.id)+'">'+HOST.escapeHtml(g.name)+(g.kb>=1000?(' ('+Math.round(g.kb/1000)+' MB)'):'')+'</option>'; }); }catch(_){}
          fr.innerHTML=_gL+' <select class="gl-satgrp" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;max-width:170px;">'+opts+'</select>';
          el.appendChild(fr);
          const gs=fr.querySelector('.gl-satgrp'); try{ gs.value=A()?A().group():'visual'; }catch(_){}
          gs.addEventListener('change',()=>{ try{ A().setGroup(gs.value); }catch(_){} try{ _satLegendCount(); }catch(_){} });
          const cnt=document.createElement('div'); cnt.className='gl-satcount'; cnt.style.cssText='font-size:10px;color:var(--text-muted);margin-top:3px;';
          el.appendChild(cnt);
          /* fill it NOW rather than on the next one-second tick: the legend is created after the layer
             has already started, so waiting for the interval leaves the box blank for up to a second
             on every single toggle — visible, and indistinguishable from "this layer counts nothing". */
          try{ _satLegendCount(); }catch(_){}
        }
      } else { el.querySelector('h4').textContent=nm; }
      /* (#R40) attach the 1-line "what is this data" explanation to the generic legend too (it was only on the
         dedicated climate legends before). Refreshed each call so it tracks the language; well-known metrics
         (population/GDP/area/density) have no entry and get nothing. */
      try{ if(window._legendDescHTML){ const dh=window._legendDescHTML(id); const old=el.querySelector('.dl-desc'); if(old) old.remove(); if(dh) el.insertAdjacentHTML('beforeend',dh); } }catch(_){}
      return el;
    }
    window._ensureGenericLegend=ensureGenericLegend;
    /* Minimize/expand a legend so a kept-open one doesn't hog the screen (esp. mobile Köppen). */
    function toggleLegendMin(el){
      const collapsed=el.classList.toggle('legend-collapsed');
      Array.from(el.children).forEach(ch=>{ if(ch.tagName==='H4'||ch.classList.contains('dl-drag')||ch.classList.contains('kl-drag')||ch.classList.contains('legend-min')||ch.classList.contains('layer-popup-x')) return; ch.style.display = collapsed?'none':''; });
      const b=el.querySelector('.legend-min'); if(b){ b.textContent=collapsed?'▢':'–'; b.title=collapsed?(window.IntMapLang.t(HOST.lang,'Expand','展開','Ausklappen','Развернуть','Expandir')):(window.IntMapLang.t(HOST.lang,'Minimize','最小化','Minimieren','Свернуть','Minimizar')); }
    }
    function ensureLegendMinimize(el){
      if(!el) return;
      let b=el.querySelector('.legend-min');
      if(!b){ b=document.createElement('button'); b.className='legend-min'; b.onclick=(e)=>{ e.stopPropagation(); toggleLegendMin(el); }; el.appendChild(b); }
      const collapsed=el.classList.contains('legend-collapsed');
      b.textContent=collapsed?'▢':'–'; b.title=collapsed?(window.IntMapLang.t(HOST.lang,'Expand','展開','Ausklappen','Развернуть','Expandir')):(window.IntMapLang.t(HOST.lang,'Minimize','最小化','Minimieren','Свернуть','Minimizar'));
      /* On phones, start minimized so the legend never covers the map on open.
         ⚠⚠ (#R240) …EXCEPT IN THE SIDEBAR, WHERE THERE IS NOTHING TO COVER ═══════════════════════
         「パネル内のポップアップや凡例は最小化された状態でスタートしないように。」 Measured on a
         phone: the Köppen legend is 488 px tall docked on a desktop and 95 px — header only — in the
         phone's sheet, because this line runs whatever the legend is parented to. The reason it
         exists is that a legend floating OVER THE MAP on a small screen hides the map; a legend in
         the sidebar column hides nothing, and arriving collapsed just means every panel has to be
         opened by hand before the tab shows anything. So the auto-collapse is scoped to the case it
         was written for. */
      const inDock=(window.imDockPanels==='on')||!!(el.classList&&el.classList.contains('im-docked'));
      if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches && !inDock && !el.dataset.minInit){ el.dataset.minInit='1'; if(!collapsed) toggleLegendMin(el); }
    }
    window._ensureLegendMinimize=ensureLegendMinimize;
    /* (#R240) the dock calls this on the way in, so a legend that was auto-collapsed while it floated
       over the map arrives in the column open. It is the panel's OWN toggle — nothing is
       re-implemented, and switching the mode off leaves the legend exactly as the reader last set it. */
    window._legendExpand=function(el){
      try{ if(el&&el.classList&&el.classList.contains('legend-collapsed')) toggleLegendMin(el); }catch(_){}
    };
    /* Collapse every open, expanded legend (used when a phone user taps the map outside a legend, #29). */
    window._minimizeOpenLegends=function(){
      [document.getElementById('koppen-legend'),lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat]
        /* (#R240) a DOCKED legend is not over the map, so tapping the map has no reason to collapse
           it — and doing so is the other half of 「最小化された状態でスタートしないように」: the
           reader taps the map once and every panel in the sidebar shuts. */
        .forEach(el=>{ if(el && (el.style.display==='block'||el.style.display==='flex') && !el.classList.contains('im-docked') && !el.classList.contains('legend-collapsed')){ try{ toggleLegendMin(el); }catch(_){} } });
    };
    function tileLegends(){
      /* ⚠ (#R276) THE ECMWF BOXES HAVE TO BE IN THIS LIST. They dock at the same left/bottom as every
         other legend, and a legend the tiler cannot see is a legend that sits ON TOP of the one below
         it — MEASURED with the wind field and two ECMWF layers on: the wind legend covered the ECMWF
         one completely, so the numeric bars #R276 added were invisible whenever both were up.
         ⚠⚠ (#R284) …and there is no longer ONE of them. 「ECMWFレイヤーはなぜか凡例が連結してしまう。」 — every
         ECMWF layer now has its own box under its own name (js/weather.js), so the list matches them
         by ID PREFIX rather than naming one element. A box added later is picked up by construction;
         a hand-maintained name would have gone stale on the next layer. */
      const all=[document.getElementById('koppen-legend'),lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat,document.getElementById('data-legend-wind')].concat([...document.querySelectorAll('[id^="data-legend-ec-"]')]).concat([...document.querySelectorAll('.data-legend.generic-legend')]);
      const visible=all.filter(el=>el&&el.style.display==='block' && !el.dataset.dragged);
      all.forEach(el=>{ if(el&&(el.style.display==='block'||el.style.display==='flex')) try{ ensureLegendOpacity(el); ensureContourDensity(el); ensureLegendMinimize(el); }catch(_){} });
      /* (#R13c) Desktop legends live on the LEFT of the map. In frosted-overlay mode the sidebar floats
         over the map, so offset past it (unless collapsed); mobile keeps its own right-dock CSS. */
      const ws=document.body.classList.contains('ws-mode');
      let leftBase=24;
      /* (#R85) BUGFIX: in workspace mode #sidebar is display:none, so getBoundingClientRect().width is 0 and the
         old `(0||440)+24` shoved every legend 464px to the RIGHT — that is why legends never appeared at the map's
         bottom-left in ws-mode. Only offset past the sidebar when it is genuinely visible with a real width. */
      try{ if(!ws && document.body.classList.contains('sidebar-glass')){ const sb=document.querySelector('.sidebar'); if(sb && !sb.classList.contains('collapsed') && getComputedStyle(sb).display!=='none'){ const w=sb.getBoundingClientRect().width; if(w>1) leftBase=w+24; } } }catch(_){}
      const mobile = !ws && window.matchMedia && window.matchMedia('(max-width:768px)').matches;
      if(ws){
        /* (#R85) workspace mode: dock legends to the BOTTOM-LEFT of the Map window ("ワークスペースモードでレイヤーを
           オンにしたら、凡例は地図の左下あたりに") — stack upward, clearing the coordinate readout in the corner. */
        let bottom=30;
        visible.forEach(el=>{ el.style.bottom=bottom+'px'; el.style.top='auto'; el.style.left='12px'; el.style.right='auto'; bottom += el.getBoundingClientRect().height+10; });
      } else if(mobile){
        /* (#R15d) Stack legends DOWNWARD from just below the search bar (top:64), left-aligned. The CSS
           default above is for the first paint; this keeps multiple open legends from overlapping. */
        let top=64;
        visible.forEach(el=>{ el.style.top=top+'px'; el.style.bottom='auto'; el.style.left='6px'; el.style.right='auto'; top += el.getBoundingClientRect().height+8; });
      } else {
        let bottom=140;
        /* ══ ⚠ (#R244) A LEGEND MAY ASK TO GROW DOWNWARD ═════════════════════════════════════════════
           「アメリカ大統領選挙レイヤーは、操作時に凡例が上に伸びるのではなく下に伸びるように。」
           Desktop legends are anchored by `bottom`, so a legend that gets TALLER grows out of its top
           edge — and the U.S. election legend re-renders its whole body on every year change (a year
           with three candidates is two rows taller than one with two), which walks the year selector
           the reader is pointing at up the screen under their cursor.
           A legend that declares `data-grow-down` is placed by its TOP instead. The stack maths is
           unchanged — the same `bottom` cursor decides where it sits — so it lands in exactly the
           same place and only its GROWTH direction differs. */
        const mcH=(()=>{ try{ const mc=document.getElementById('map-container'); return (mc&&mc.getBoundingClientRect().height)||window.innerHeight; }catch(_){ return window.innerHeight; } })();
        visible.forEach((el,idx)=>{ el.style.left=leftBase+'px'; el.style.right='auto';
          const h=el.getBoundingClientRect().height;
          if(el.dataset.growDown==='1'){
            /* ⚠ WRITING `top` IS NOT ENOUGH — `top = mcH − bottom − h` is the bottom-anchored place
               expressed as a top, so it still moves when `h` changes. Measured on the election
               legend: 2020 → top 233, 1912 → 211, 1860 → 152, bottom pinned at 580, i.e. exactly the
               upward growth the report is about. The top is therefore REMEMBERED: the stack decides
               it once (so the legend still lands in its slot, and still moves when another legend
               opens or closes — `gdKey` is its position in the stack), and a re-render that only
               changes the CONTENT keeps it. */
            const key=visible.length+':'+idx;
            let top=+el.dataset.gdTop;
            if(el.dataset.gdKey!==key||!isFinite(top)){ top=Math.max(8,mcH-bottom-h); el.dataset.gdKey=key; el.dataset.gdTop=String(top); }
            el.style.top=top+'px'; el.style.bottom='auto';
          }
          else { el.style.bottom=bottom+'px'; el.style.top='auto'; }
          bottom += h+10; });
      }
    }
    /* Mark a legend as user-dragged so tileLegends() leaves it alone. */
    document.addEventListener('mousedown', e=>{
      const drag=e.target.closest('.dl-drag,.kl-drag'); if(!drag) return;
      const lg=drag.closest('.data-legend,.koppen-legend'); if(lg) lg.dataset.dragged='1';
    });
    /* ===== Traffic layer state ===== */
    const trafficFilters={ships:'all',planes:'all'};
    let planesData=[], shipsData=[], planesTimer=null, shipsTimer=null;
    let planesTime=0, planesSynthetic=false;   /* live-feed snapshot time (ms) + synthetic-fallback flag */
    let _planesMove=null, _planesMoveT=null;   /* viewport-follow refetch handle */
    let _planes3DZoom=null, _planes3DZoomT=null;   /* (#R172) rebuild the lifted glyphs when the scale changes */
    let _planesClear=null, _planesHover=null, _pickHover=false, _pickAt=0;   /* (#R173) picking a lifted aircraft */
    let _planesDbl=null, _planesClearT=null;   /* (#R174) a double-click is a ZOOM, not "you clicked empty sky" */
    /* (#R172) "is the aircraft layer on?" — it has two renderings now, so asking after one of them by name
       (as every call site used to) reports the layer as OFF whenever the other one is the visible one. */
    function planesLayerOn(){ try{
      const a=GE().layers.get('lyr-planes')&&GE().layers.getLayout('lyr-planes','visibility')==='visible';
      const b=GE().layers.get(PLANE3D_LYR)&&GE().layers.getLayout(PLANE3D_LYR,'visibility')==='visible';
      return !!(a||b); }catch(_){ return false; } }
    /* Aircraft military operator hints (very rough — based on callsign prefixes) */
    const MILITARY_CALLSIGN_PREFIXES=['RCH','REACH','SAM','EVAC','MUSCLE','HOMR','BLUE','RNGR','NATO','PAT','RFR','SPAR','THUG','SHELL','GRZLY','CLAMP','POPS','HAWG','SLAY','DUKE','LOBO','GUMP','HUSKY','HUNTR','BAND','TYRN','MAGMA','KING','CAMEL'];
    function classifyAircraft(callsign){
      if(!callsign) return 'civilian';
      const c=callsign.trim().toUpperCase();
      if(MILITARY_CALLSIGN_PREFIXES.some(p=>c.startsWith(p))) return 'military';
      if(/^[A-Z]{3,4}\d/.test(c)) return 'civilian';
      return 'civilian';
    }
    /* Try OpenSky first; if CORS / rate-limit fails, fall back to synthetic civilian + military aircraft so the layer is never empty. */
    const AIRPORTS=[
      [-73.78,40.64,'civilian','JFK'],[-118.41,33.94,'civilian','LAX'],[-87.90,41.98,'civilian','ORD'],[-122.38,37.62,'civilian','SFO'],[-97.04,32.90,'civilian','DFW'],[-80.29,25.79,'civilian','MIA'],[-79.63,43.68,'civilian','YYZ'],[-99.07,19.43,'civilian','MEX'],
      [-0.45,51.47,'civilian','LHR'],[2.55,49.01,'civilian','CDG'],[8.57,50.04,'civilian','FRA'],[4.76,52.31,'civilian','AMS'],[14.28,40.89,'civilian','FCO'],[28.81,41.28,'civilian','IST'],[-3.56,40.49,'civilian','MAD'],
      [37.41,55.97,'civilian','SVO'],[55.36,25.25,'civilian','DXB'],[51.61,25.27,'civilian','DOH'],[51.16,35.69,'civilian','IKA'],[31.40,30.11,'civilian','CAI'],[28.05,-26.13,'civilian','JNB'],
      [116.58,40.07,'civilian','PEK'],[121.81,31.14,'civilian','PVG'],[114.20,22.31,'civilian','HKG'],[121.55,25.07,'civilian','TPE'],[126.45,37.46,'civilian','ICN'],[139.78,35.55,'civilian','HND'],[140.39,35.77,'civilian','NRT'],[103.99,1.36,'civilian','SIN'],[100.75,13.69,'civilian','BKK'],[106.66,10.81,'civilian','SGN'],[77.10,28.55,'civilian','DEL'],[72.86,19.09,'civilian','BOM'],[101.71,2.74,'civilian','KUL'],[106.66,-6.13,'civilian','CGK'],[120.98,14.51,'civilian','MNL'],
      [151.18,-33.93,'civilian','SYD'],[174.79,-37.01,'civilian','AKL'],
      [-46.48,-23.43,'civilian','GRU'],[-58.42,-34.82,'civilian','EZE'],[-70.79,-33.39,'civilian','SCL'],[-74.14,4.70,'civilian','BOG'],
      /* Military bases (less dense) */
      [144.92,13.58,'military','Andersen'],[72.41,-7.31,'military','DG'],[-157.97,21.36,'military','HCK'],[127.02,36.96,'military','OSAN'],[7.60,49.44,'military','RAM'],[33.52,44.61,'military','SEV'],[126.68,37.96,'military','DMZ'],[35.18,32.99,'military','ROT'],[140.13,35.30,'military','YKS']
    ];
    function genSyntheticPlanes(){
      const arr=[], now=Math.floor(Date.now()/1000);
      AIRPORTS.forEach(([lng,lat,type,name])=>{
        const count = type==='military'?2:6;
        for(let i=0;i<count;i++){
          const r=200+Math.random()*1400; /* km radius */
          const ang=Math.random()*Math.PI*2;
          const dLat = (r/111)*Math.sin(ang);
          const dLng = (r/(111*Math.cos(lat*Math.PI/180)+1e-3))*Math.cos(ang);
          arr.push({
            icao24:Math.random().toString(36).slice(2,8).toUpperCase(),
            callsign: type==='military'?'MIL'+Math.floor(Math.random()*9000+1000):name+Math.floor(Math.random()*900+100),
            country: type==='military'?'MIL':'',
            tpos:now, lastContact:now,
            lng:lng+dLng, lat:lat+dLat,
            baroAlt:9000+Math.random()*3500, onGround:false, vel:200+Math.random()*60, heading:Math.random()*360, vrate:0,
            geoAlt:9000+Math.random()*3500, squawk:null, type
          });
        }
      });
      planesData=arr; planesTime=Date.now(); planesSynthetic=true;
      refreshTrafficLayer('planes');
    }
    /* Live aircraft = airplanes.live (free, key-less, CORS-enabled community ADS-B network).
       OpenSky's REST API is CORS-blocked from browsers and now rate-limits/auth-gates anonymous
       access, so it cannot be reached client-side; airplanes.live serves the SAME real live ADS-B
       data with proper CORS headers (and richer fields). We query the current viewport (center +
       radius, capped at the API's 250 nm max) so the aircraft match what's on screen, capturing
       every field for the tooltip + the exact data timestamp. Synthetic data is now a last resort
       only when the device is offline / the feed is unreachable. */
    let _lastPlaneFetch=0;
    /* ══ (#R186) HOW MUCH SKY THE LAYER COVERS ════════════════════════════════════════════════════
       「Live aircraft trafficの最大航空機表示領域/数をもっと増やして。」

       The ceiling was never the renderer and never the aircraft count — it was ONE query. The feed's
       point endpoint takes a centre and a radius, and 250 nm is a HARD cap: measured against the live
       API, r=250 answers 200 and r=300/500/1000 all answer **403**, so a bigger circle is not on
       offer. #R? therefore refused to draw below z5, because one 463-km circle inside a
       continent-wide viewport is a blob in the middle rather than "the aircraft on screen".

       A circle is not the only shape available, though — several of them are. The viewport is now
       TILED with 250-nm circles on the step that makes their inscribed squares meet, the results are
       merged and de-duplicated on the ICAO 24-bit address, and the covered area grows with the
       number of circles instead of being fixed by one radius. Measured on the live API: eight
       sequential queries over Europe returned 200 every time, took 3.4 s in total, and yielded 1,956
       distinct aircraft where a single circle at the same centre returned 611.

       ⚠ AND THE PACE IS MEASURED, NOT ASSUMED. The first version fired four at a time and 9 of 20
       came back as network failures — not 429s, bare "Failed to fetch", i.e. the host stopped
       answering this address at all — after which even single retries failed. Probed properly: the
       block lifts after 30 s of quiet, and 14 consecutive requests spaced 1.2 s apart then ALL
       succeed. So the sweep is STRICTLY SEQUENTIAL at 1.2 s, the budget is 16 circles rather than
       30, and the poll interval grows with the sweep (16 circles → one refresh a minute). That is
       0.29 requests a second in the long run — a fraction of what the feed tolerates — while a
       close-in single-circle view still refreshes every 20 s exactly as it always did. The
       staleness a wide sweep buys is invisible: a minute of flight is 15 km, five pixels at z4. */
    /* ══ (#R187) WIDER STILL ═══════════════════════════════════════════════════════════════════════
       「Live aircraft trafficの最大航空機表示領域/数をもっと増やして。」— re-reported after #R186.

       Re-measured against the live API first, because the ceiling has to be the feed's and not a
       guess: r=250 answers 200 (570 KB), r=300 and r=500 both answer 403, and there is no bounding-box
       or all-aircraft endpoint (/v2/all is 404). So 250 nm per query still stands and the only way to
       cover more sky is still more circles.

       The budget is therefore raised from 16 to 48 (mobile 6 → 12). One circle's inscribed square is
       615 km on a side, so the covered block grows from 4 × 4 = 2,460 × 2,460 km to 8 × 6 = 4,920 ×
       3,690 km — a continent rather than a country group.

       ⚠ THE PACE IS NOT RAISED WITH IT. #R186 measured where this feed cuts an address off: four
       concurrent requests killed 9 of 20 outright, while 1.2 s spacing sustained 14 in a row. That
       spacing is unchanged, which makes a full sweep ~58 s to issue, and the poll interval keeps its
       3.5 s-per-circle rule so the long-run rate stays where #R186 left it (48 circles → one refresh
       every 168 s ≈ 0.29 requests a second). The ceiling on that interval is raised to 180 s from 120
       purely so the rule is not silently clipped — a clipped interval would mean asking FASTER than
       the measured budget, which is the one thing that gets the address blocked. A close-in view is a
       single circle and still refreshes every 20 s exactly as before. */
    const PLANE_CIRCLE_NM=250;                       /* the API's hard maximum, re-verified by 403 above it (#R187) */
    /* (#R188) 48 → 128 (mobile 12 → 24). The long-run request rate does NOT move with this number:
       planePollMs() has always been 3.5 s a circle, so a bigger sweep refreshes less often instead of
       asking faster. What it buys, together with the triangular lattice, is 65.7 million km². */
    const PLANE_CIRCLE_BUDGET=()=>((typeof isMobile==='function'&&isMobile())?24:128);
    const PLANE_GAP_MS=1200;                         /* measured sustainable spacing — see above */
    const PLANE_MAX_AIRCRAFT=50000;                  /* was 1,800 = one circle's worth; a continental sweep is many times that */
    /* (#R188) a 128-circle sweep takes ~154 s to ISSUE, so it publishes what it has every few seconds
       instead of at the end — and an aircraft that a later publish has not re-seen is only dropped
       when the sweep has actually re-asked about the patch of sky it was in (planeCellOf). */
    const PLANE_PUBLISH_MS=4000;
    /* Below this the covered block is a small fraction of an ocean-sized view and the old "zoom in"
       prompt is still the honest answer. It used to be z5, then z3; a 48-circle sweep covers roughly
       4,900 × 3,700 km, which is a real region at z2. */
    const PLANES_MIN_ZOOM=2, SHIPS_MIN_ZOOM=6;
    function zoomHintEl(id,onClickZoom){
      let el=document.getElementById(id);
      if(!el){ el=document.createElement('button'); el.id=id; el.type='button';
        el.style.cssText='position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:1200;display:none;white-space:nowrap;background:rgba(18,18,20,0.82);color:#fff;border:none;border-radius:999px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,0.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
        el.onclick=()=>{ if(GE().hasRenderer()) GE().camera.easeTo({zoom:onClickZoom,duration:600}); };
        const mc=document.getElementById('map-container'); if(mc) mc.appendChild(el);
      }
      return el;
    }
    function updatePlanesZoomHint(){
      const on=!!(planesLayerOn());   /* (#R172) either rendering counts as "the layer is on" */
      const el=zoomHintEl('planes-zoom-hint',PLANES_MIN_ZOOM+2);
      if(!on){ el.style.display='none'; return; }
      if(GE().camera.getZoom()<PLANES_MIN_ZOOM){ el.textContent=t('planesZoomHint'); el.style.display='block'; return; }
      /* (#R186) …and when the budget covers only part of a very wide view, SAY SO rather than letting
         a partly-filled sky read as an empty one.
         (#R191) The question is asked about THE VIEW ON SCREEN NOW — planeCircles(false) plans without
         adopting the plan — not about `_planeCover`, which belongs to the sweep that is running and can
         be minutes old. Reading the running sweep's answer is what left the notice up long after the
         user had zoomed into a view one circle covers («ズームインで全域表示がいつまでも出てくる»).
         A clipped sweep always covers the CENTRAL block, so a view zoomed inside it really is complete. */
      let clipped=false; try{ const p=planeCircles(false); clipped=!!(p&&p.cover&&p.cover.clipped); }catch(_){}
      if(clipped){ el.textContent=t('planesAreaHint')||t('planesZoomHint'); el.style.display='block'; return; }
      el.style.display='none';
    }
    /* ── (#R186) THE SWEEP PLAN: which circles cover the view ──────────────────────────────────────
       Each 250-nm circle fully contains a square of side r·√2, so stepping by that side leaves no
       gap between neighbours (0.94 of it, for a little overlap at the corners where the projection
       stretches). Longitude steps are widened by 1/cos(lat) so the ground spacing stays constant as
       the grid climbs away from the equator. When the view needs more circles than the budget, the
       grid is CLIPPED to the central block and `clipped` is set — the hint above then says the
       coverage is partial instead of leaving the user to guess. */
    /* ══ (#R188) THE SAME REQUESTS, HALF AS MANY OF THEM PER MILLION SQUARE KILOMETRES ═════════════
       「Live aircraft trafficの最大航空機表示領域/数をもっと増やして。」— reported a third time.

       Everything that could have made this easy was measured away first, and none of it survived:

         · A SECOND FEED. adsb.fi and adsb.lol both answer the same shape of query, and adsb.fi
           returns the same aircraft as airplanes.live (554 vs 554 over Frankfurt, union 561), so a
           second host would have been a second rate-limit bucket and twice the circles per minute.
           Measured from the page's own origin, BOTH answer `TypeError: Failed to fetch`: neither
           sends `Access-Control-Allow-Origin`, so neither can be reached from a browser at all.
           airplanes.live remains the only key-less CORS-enabled ADS-B feed there is.
         · A FASTER PACE. #R186's 1.2 s came from a measurement, and it still holds: 34 consecutive
           circles at 1,200 ms all answered 200, while the same 34 at 700 ms gave 12 successes and
           then SIXTEEN consecutive hard failures — the address cut off, exactly the state #R186
           described. The gap is not negotiable and is unchanged.
         · A BIGGER CIRCLE. r=250 answers, r=300 and r=500 are 403. Unchanged since #R187.

       What was left is the one thing nobody had looked at: the LATTICE. Stepping by a circle's
       inscribed square throws away everything outside that square — a circle of radius r covers
       πr², the square keeps 2r², i.e. 64% of what each request already paid for. The optimal
       covering of a plane by equal circles is the TRIANGULAR lattice (Kershner 1939): neighbours at
       d = r√3, rows at d·√3/2, alternate rows offset by d/2, and every point of the plane inside
       some circle. Each request then owns a hexagon of (√3/2)d² = 2.598 r² instead of 2 r².

       Measured on this app's own numbers (r = 463 km, keeping a 4% overlap margin for the
       projection): 770 km between centres and 667 km between rows, so ONE REQUEST NOW COVERS
       513,600 km² where it used to cover 378,700 — 1.36× the sky for exactly the same 1.2 s.

       The circle budget then goes 48 → 128 (mobile 12 → 24). Combined: 18.2 → 65.7 million km², or
       3.6× the area of #R187, and the long-run request rate is IDENTICAL because the poll interval
       has always been 3.5 s per circle — a bigger sweep refreshes less often, it does not ask
       faster. The two costs a 128-circle sweep would have had are both paid off below: it takes
       154 s to issue (so the layer publishes AS IT GOES rather than at the end), and it used to
       lock out the next viewport for its whole duration (so a sweep the camera has left behind is
       now abandoned — which is only safe because what it had already published survives). */
    const PLANE_LATTICE_MARGIN=0.96;    /* shrink the ideal covering step so the corners overlap slightly */
    let _planeCover=null;
    function planeCircles(commit){
      const NM=1.852, toR=Math.PI/180;
      let c={lat:48,lng:8}, b=null;
      try{ if(GE().hasRenderer()){ c=GE().camera.getCenter(); b=GE().camera.getBounds(); } }catch(_){}
      const rKm=PLANE_CIRCLE_NM*NM;                          /* the query radius on the ground */
      const stepKm=rKm*Math.sqrt(3)*PLANE_LATTICE_MARGIN;    /* triangular-lattice spacing — see above */
      const rowKm=stepKm*Math.sqrt(3)/2;                     /* …and the row pitch that goes with it */
      const dLat=rowKm/110.574;
      let wantX=1, wantY=1, spanKmX=stepKm, spanKmY=rowKm;
      if(b){ try{
        const w=b.getWest(), e=b.getEast(), s=b.getSouth(), n=b.getNorth();
        const lonSpan=((e-w)+360)%360||360;
        spanKmX=Math.max(1,lonSpan*111.320*Math.max(0.05,Math.cos(c.lat*toR)));
        spanKmY=Math.max(1,(n-s)*110.574);
        wantX=Math.max(1,Math.ceil(spanKmX/stepKm)); wantY=Math.max(1,Math.ceil(spanKmY/rowKm));
        /* ⚠ THE EXTRA COLUMN IS ONLY FOR THE OFFSET ROWS. A triangular lattice shifts alternate rows
           half a step, so the block needs one more column to cover its own edges — but ONLY when
           there are offset rows to cover and more than one column to offset. Adding it
           unconditionally made a close-in view ask for TWO requests where one has always been
           enough, which tests/r186 caught at z6.2 (`close.circles` 1 → 2). One circle for a small
           view is not a detail: it is the 20-second refresh that view has always had. */
        if(wantX>1&&wantY>1) wantX++;
      }catch(_){} }
      const budget=PLANE_CIRCLE_BUDGET();
      let nx=wantX, ny=wantY, clipped=false;
      /* Shrink the grid towards the budget while keeping the viewport's aspect, so the covered block
         stays the shape of the screen rather than collapsing into a column. */
      while(nx*ny>budget&&(nx>1||ny>1)){ clipped=true; if(nx*spanKmY>=ny*spanKmX&&nx>1) nx--; else if(ny>1) ny--; else nx--; }
      const out=[], rows=[];
      for(let j=0;j<ny;j++){ const lat=c.lat+((j-(ny-1)/2)*dLat);
        const dLng=stepKm/(111.320*Math.max(0.05,Math.cos(lat*toR)));
        const off=(j&1)?dLng/2:0;                            /* alternate rows are offset by half a step */
        rows.push({lat,dLng,off});
        if(lat>88||lat<-88) continue;
        for(let i=0;i<nx;i++){ let lng=c.lng+off+((i-(nx-1)/2)*dLng);
          lng=((lng+540)%360)-180;
          /* the third element is the CELL KEY, not the list position: rows beyond ±88° are skipped,
             so the two stop matching after the first skipped row and a carried-over aircraft would
             be tested against the wrong patch of sky. */
          out.push([Math.max(-89.9,Math.min(89.9,lat)),lng,j*nx+i]); } }
      /* ⚠ (#R188) CENTRE FIRST. The sweep is now long enough to be watched, and it publishes as it
         goes, so the ORDER decides what the user sees for the first two minutes. Row-major starts at
         a corner of the block — measured over Europe at z3, the first four circles landed in the
         mid-Atlantic and found ONE aircraft while Frankfurt sat unasked. Sorting by distance from the
         view centre costs one sort and fills the middle of the screen first, which is where the user
         is looking; the set of circles is identical either way. */
      out.sort((a,b)=>{
        const da=Math.pow((((a[1]-c.lng+540)%360)-180)*Math.cos(c.lat*toR),2)+Math.pow(a[0]-c.lat,2);
        const db=Math.pow((((b[1]-c.lng+540)%360)-180)*Math.cos(c.lat*toR),2)+Math.pow(b[0]-c.lat,2);
        return da-db;
      });
      const cover={ nx, ny, wantX, wantY, clipped, circles:out.length,
                    coverKmX:nx*stepKm, coverKmY:ny*rowKm, spanKmX, spanKmY,
                    /* the lattice itself, so a carried-over aircraft can be asked "has the sweep
                       already looked where you are?" in O(1) — see _sweep()'s publish step */
                    c, dLat, rows, stepKm, rowKm };
      out.cover=cover;
      /* (#R191) `commit === false` PLANS WITHOUT ADOPTING. The hint below needs to know whether THIS
         view can be covered, and `_planeCover` is the running sweep's plan — which is replaced only
         when the next sweep starts, i.e. after as much as 154 s for a 128-circle block. That is why
         「ズームインで全域表示がいつまでも出てくる」: the answer on screen belonged to a view the
         user had already left. The planner is cheap (≤128 cells), so the question is simply asked
         again about the current viewport instead of being remembered. */
      if(commit!==false) _planeCover=cover;
      return out;
    }
    /* Which lattice cell a position falls in, or null when it is outside the planned block. The
       answer is the index into the circle list the planner just built, so "cell k has been swept"
       is a plain Set lookup. */
    function planeCellOf(lat,lng){
      const cv=_planeCover; if(!cv||!cv.rows||!cv.rows.length) return null;
      const j=Math.round((lat-cv.c.lat)/cv.dLat+(cv.ny-1)/2);
      if(j<0||j>=cv.ny) return null;
      const row=cv.rows[j]; if(!row) return null;
      let dl=((lng-cv.c.lng-row.off+540)%360)-180;
      const i=Math.round(dl/row.dLng+(cv.nx-1)/2);
      if(i<0||i>=cv.nx) return null;
      return j*cv.nx+i;
    }
    /* Normalise an airplanes.live ADS-B record to our internal plane shape (units → m, m/s). */
    function adsbToPlane(a,nowMs){
      const FT=0.3048, KT=0.514444, FPM=0.00508, onGround=a.alt_baro==='ground';
      /* (#R19) Military = dbFlags bit 0 ONLY. That bit comes from the curated Mictronics/tar1090
         registration database (per-airframe, not guessed), so it's trustworthy — which is why the
         military/civilian Filter stays. The old callsign-prefix heuristic ("KING", "SHELL", "BLUE"…)
         mislabeled ordinary airline callsigns as military and is dropped from the live path
         (classifyAircraft is still used by the clearly-labeled offline synthetic fallback only). */
      const mil=!!((a.dbFlags|0)&1);
      return {
        icao24:(a.hex||'').toUpperCase(), callsign:(a.flight||'').trim(), reg:a.r||'', acType:a.t||'', desc:a.desc||'',
        lng:a.lon, lat:a.lat,
        baroAlt: onGround?0:(typeof a.alt_baro==='number'?a.alt_baro*FT:null),
        geoAlt: (typeof a.alt_geom==='number'?a.alt_geom*FT:null),
        vel: (typeof a.gs==='number'?a.gs*KT:null),
        heading: (a.track!=null?a.track:(a.true_heading!=null?a.true_heading:(a.mag_heading!=null?a.mag_heading:0))),
        vrate: (typeof a.baro_rate==='number'?a.baro_rate*FPM:(typeof a.geom_rate==='number'?a.geom_rate*FPM:null)),
        squawk:a.squawk||'', onGround, category:(a.category||null),
        lastContact: a.seen!=null ? Math.floor(nowMs/1000 - a.seen) : Math.floor(nowMs/1000),
        type: mil?'military':'civilian',
        /* (#R175) …and the REST of what the feed already sends. The hover tooltip only ever had room for
           eight fields, so these were parsed away and thrown out on every poll; the detail card behind a
           click (js/aircraft-detail.js) shows them, and the flight simulator starts from the true airspeed
           rather than the ground speed because of them. Nothing here is derived or guessed — every value
           is a field airplanes.live reports, converted into the units this file already uses. */
        ias:(typeof a.ias==='number'?a.ias:null), tas:(typeof a.tas==='number'?a.tas:null),
        mach:(typeof a.mach==='number'?a.mach:null), oat:(typeof a.oat==='number'?a.oat:null),
        navAlt:(typeof a.nav_altitude_mcp==='number'?a.nav_altitude_mcp*FT:null),
        navQnh:(typeof a.nav_qnh==='number'?a.nav_qnh:null),
        roll:(typeof a.roll==='number'?a.roll:null),
        trueHdg:(typeof a.true_heading==='number'?a.true_heading:null),
        magHdg:(typeof a.mag_heading==='number'?a.mag_heading:null),
        windDir:(typeof a.wd==='number'?a.wd:null), windSpd:(typeof a.ws==='number'?a.ws:null),
        rssi:(typeof a.rssi==='number'?a.rssi:null), messages:(typeof a.messages==='number'?a.messages:null),
        src:(a.type||''), emergency:((a.emergency&&a.emergency!=='none')?a.emergency:'')
      };
    }
    /* (#R186) One sweep at a time. A sweep is now several requests over a second or two, so a moveend
       arriving mid-sweep must not start a second one on top of it — the two would interleave their
       partial results and the layer would flicker between them. The in-flight sweep is aborted and
       the new one takes over; `_planeSweep` is the token that says which one is allowed to publish. */
    let _planeSweep=0, _planeStats=null, _planeBusy=false, _planeSweepAt=null;
    async function fetchPlanes(){
      /* ⚠ (#R186) A SWEEP THAT IS ALREADY RUNNING IS LEFT TO FINISH. The token below exists so a
         stale sweep cannot publish into a layer that has moved on — but using it to abort on every
         new request threw away work that had already been done: on a slow machine each sweep took
         longer than the gap between two moveends, so every one was killed by the next and the
         positions it had collected were lost. tests/r174 measured that as an aircraft track with 2
         legs where five fixes had been fed to it. Skipping is right and abandoning is not: the
         running sweep is about to publish the same view, and the next poll covers anything newer. */
      /* ⚠ (#R188) …UNLESS THE CAMERA HAS LEFT THAT SKY ALTOGETHER. #R186's rule was right for a
         16-circle sweep of a few seconds; a 128-circle sweep takes 154 s to issue, and refusing every
         new request for that long means panning to another continent shows the previous continent's
         traffic for two and a half minutes. The reason #R186 could not abandon a sweep — that its
         collected positions would be lost — no longer holds, because the sweep publishes as it goes:
         everything it has found is already on the layer before it is abandoned. So a new request
         while busy still yields to the running sweep when it is about the same sky, and takes over
         when the centre has moved more than half the covered block. */
      if(_planeBusy){
        try{
          const cv=_planeCover, at=_planeSweepAt;
          if(!cv||!at) return;
          const now=GE().camera.getCenter();
          const dLng=(((now.lng-at.lng+540)%360)-180)*111.320*Math.max(0.05,Math.cos(now.lat*Math.PI/180));
          const dLat=(now.lat-at.lat)*110.574;
          if(Math.abs(dLng)<cv.coverKmX/2&&Math.abs(dLat)<cv.coverKmY/2) return;
        }catch(_){ return; }
      }
      _lastPlaneFetch=Date.now();
      /* Too zoomed out → don't query a central blob; show the "zoom in" prompt instead. */
      if(GE().camera.getZoom()<PLANES_MIN_ZOOM){ planesData=[]; planesSynthetic=false; _planeCover=null; refreshTrafficLayer('planes'); updatePlanesZoomHint(); return; }
      const mine=++_planeSweep;
      _planeBusy=true;
      try{ _planeSweepAt=GE().camera.getCenter(); }catch(_){ _planeSweepAt=null; }
      /* ⚠ only the sweep that still OWNS the token may clear the busy flag: an abandoned sweep
         finishing after its replacement has started would otherwise unlock a slot that is in use. */
      try{ return await _sweep(mine); } finally { if(mine===_planeSweep) _planeBusy=false; }
    }
    async function _sweep(mine){
      const circles=planeCircles();
      updatePlanesZoomHint();
      const t0=Date.now();
      /* ⚠ `lastPub` starts at the sweep's own start, not at 0. Starting it at 0 made the elapsed time
         the whole Unix epoch, so the FIRST circle always tripped the in-loop publish and every short
         sweep published twice with identical data. Harmless (recordTracks de-duplicates on position)
         but pointless work; a one-circle sweep should publish once, at the end. */
      const byHex=new Map(); let ok=0, fail=0, newest=0, retried=0, published=0, lastPub=Date.now();
      const swept=new Set();                                    /* cell keys this sweep has already asked about */
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=async(la,lo,cell)=>{
        try{
          const r=await fetch(`https://api.airplanes.live/v2/point/${la.toFixed(3)}/${lo.toFixed(3)}/${PLANE_CIRCLE_NM}`);
          if(!r.ok) return false;                               /* (#R183) an error body is valid JSON — check r.ok */
          const j=await r.json();
          if(j&&j.now>newest) newest=j.now;
          const ac=Array.isArray(j&&j.ac)?j.ac:[];
          for(const a of ac){ if(a&&a.lat!=null&&a.lon!=null&&a.hex&&!byHex.has(a.hex)) byHex.set(a.hex,a); }
          if(cell!=null) swept.add(cell);
          return true;
        }catch(e){ return false; }
      };
      /* ══ (#R188) THE LAYER FILLS IN AS THE SWEEP RUNS ═════════════════════════════════════════════
         A 128-circle sweep takes 154 s to issue. Publishing only at the end would mean two and a half
         minutes of the previous answer and then everything at once, which is not what a bigger budget
         was asked for. So every few seconds the layer is rebuilt from:
           · every aircraft this sweep has seen so far, and
           · every aircraft the LAST published answer held that this sweep has not re-seen AND whose
             position is in a cell the sweep has not yet re-asked about.
         The second rule is what makes this exact rather than merely optimistic: an aircraft is only
         dropped once the feed has been asked about the patch of sky it was in and did not mention it.
         Age is a backstop for aircraft outside the current lattice entirely. */
      const KEEP_MS=Math.max(150000,circles.length*PLANE_GAP_MS+60000);
      const prev=(!planesSynthetic&&Array.isArray(planesData))?planesData.slice():[];
      const publish=(final)=>{
        if(mine!==_planeSweep) return;
        planesTime=(newest||Date.now());
        const seenNow=Date.now();
        const raw=Array.from(byHex.values());
        const fresh=new Set(); raw.forEach(a=>{ const h=String(a.hex||'').toLowerCase(); if(h) fresh.add(h); });
        const merged=raw.slice(0,PLANE_MAX_AIRCRAFT).map(a=>adsbToPlane(a,planesTime));
        merged.forEach(d=>{ d.seenAt=seenNow; });
        let carried=0;
        for(const d of prev){
          if(merged.length>=PLANE_MAX_AIRCRAFT) break;
          const h=String(d.icao24||'').toLowerCase(); if(!h||fresh.has(h)) continue;
          if(seenNow-(d.seenAt||0)>KEEP_MS) continue;
          const cell=planeCellOf(d.lat,d.lng);
          if(cell!=null&&swept.has(cell)) continue;             /* asked, and the feed did not mention it */
          merged.push(d); carried++;
        }
        planesSynthetic=false;
        planesData=merged;
        published++; lastPub=Date.now();
        /* No silent caps (#R185): every number the sweep produced is readable from the console API. */
        _planeStats={ circles:circles.length, asked:swept.size, ok, fail, retried, carried, publishes:published,
                      unique:raw.length, kept:planesData.length, complete:!!final,
                      dropped:Math.max(0,raw.length-Math.min(raw.length,PLANE_MAX_AIRCRAFT)), ms:Date.now()-t0,
                      cover:_planeCover?{ nx:_planeCover.nx, ny:_planeCover.ny, clipped:_planeCover.clipped,
                        coverKmX:Math.round(_planeCover.coverKmX), coverKmY:Math.round(_planeCover.coverKmY),
                        areaMkm2:+((_planeCover.coverKmX*_planeCover.coverKmY)/1e6).toFixed(1) }:null };
        recordTracks(planesData,planesTime);   /* (#R173) keep what we have actually seen — see planeTracks */
        refreshTrafficLayer('planes');
      };
      const missed=[];
      for(let k=0;k<circles.length;k++){
        if(mine!==_planeSweep) return;
        if(k) await sleep(PLANE_GAP_MS);
        const good=await one(circles[k][0],circles[k][1],circles[k][2]);
        if(good) ok++; else { fail++; missed.push(circles[k]); }
        /* ══ ⚠⚠ (#R245) THE FIRST ANSWER IS DRAWN THE MOMENT IT ARRIVES ═══════════════════════════
           「Live aircraft trafficで航空機が表示されるまでが遅い。」
           `lastPub` starts at the sweep's own start, so the in-loop publish could not fire until
           PLANE_PUBLISH_MS (4 s) had passed — i.e. until the FIFTH circle on a multi-circle sweep,
           at 1.2 s spacing. The centre circle answers in a fraction of a second and #R188 already
           sorts the lattice centre-first, so the aircraft the reader is looking at were sitting in
           `byHex` for four seconds with nothing on screen. The first success now publishes
           immediately and the 4 s cadence takes over from there.
           ⚠ NOTHING ABOUT THE REQUEST RATE MOVES. `PLANE_GAP_MS` is the measured limit (#R186/#R188)
           and this changes only when what has already arrived is DRAWN.
           ⚠ A ONE-CIRCLE SWEEP STILL PUBLISHES ONCE, at the end — that is what `circles.length>1`
           preserves, and it is the case the note above `lastPub` is about. */
        if(ok>0&&(published===0 ? circles.length>1 : Date.now()-lastPub>=PLANE_PUBLISH_MS)) publish(false);
      }
      /* One retry pass for the circles that came back empty-handed, at the same pace. A failed circle
         is a HOLE in the sky, not a slightly smaller answer, so it is worth 1.2 s to fill it. */
      for(const c of missed){
        if(mine!==_planeSweep) return;
        await sleep(PLANE_GAP_MS*2);
        if(await one(c[0],c[1],c[2])){ ok++; fail--; retried++;
          if(Date.now()-lastPub>=PLANE_PUBLISH_MS) publish(false); }
      }
      if(mine!==_planeSweep) return;                            /* a newer sweep owns the layer now */
      if(ok>0){
        publish(true);
        if(_planeStats.dropped) console.warn('live aircraft: '+_planeStats.dropped+' beyond the '+PLANE_MAX_AIRCRAFT+' render cap were not drawn');
        if(fail>0) console.warn('live aircraft: '+fail+' of '+circles.length+' circles did not answer; '+_planeStats.carried+' aircraft carried over from the previous sweep');
        schedulePlanePoll(); return;
      }
      /* Every circle failed. If we still hold real aircraft, KEEP them — replacing real data with a
         placeholder because one refresh was refused is a downgrade, not a fallback. The synthetic set
         is only for a layer that has nothing at all. */
      if(!planesSynthetic&&planesData.length){ console.warn('Live aircraft feed did not answer — keeping the previous positions'); schedulePlanePoll(); return; }
      /* feed unreachable (offline / blocked) → clearly-labeled synthetic placeholder so the layer isn't empty */
      console.warn('Live aircraft feed unavailable — using synthetic placeholder'); genSyntheticPlanes(); schedulePlanePoll();
    }
    /* (#R186) The poll interval follows the size of the sweep, so the long-run request rate stays
       roughly constant instead of multiplying by the number of circles. One circle keeps the original
       20 s; a full 30-circle sweep settles at ~66 s, which is five pixels of aircraft movement at the
       zoom where a 30-circle sweep is what you get. */
    function planePollMs(){ const n=(_planeCover&&_planeCover.circles)||1;
      /* one circle → the original 20 s; a full 48-circle sweep takes ~58 s to issue, so its gap is
         set well clear of that (3.5 s a circle) and the feed sees 0.29 requests a second.
         (#R187) the ceiling is 180 s so a 48-circle sweep's interval is the rule's answer and not a
         clip — clipping it would mean polling FASTER than the measured budget.
         (#R188) …and 600 s for the same reason now the budget is 128: 128 × 3.5 s = 448 s, so the
         ceiling has to be above it or the long-run rate would rise with the budget instead of
         staying at the 0.29 requests a second #R186 measured as sustainable. */
      return Math.max(20000,Math.min(600000,Math.round(n*3500))); }
    function schedulePlanePoll(){ if(!planesTimer) return;    /* the layer is off — nothing to re-arm */
      clearInterval(planesTimer); clearTimeout(planesTimer);
      planesTimer=setTimeout(()=>{ if(planesLayerOn()) fetchPlanes(); else planesTimer=null; },planePollMs()); }
    /* Synthetic ship demo data — real-time AIS is paywalled. Distributes ships GLOBALLY along major sea lanes + chokepoints. */
    /* ===== Live ships via AISstream.io (real AIS over WebSocket) =====
       There is NO free, key-less, CORS-friendly global AIS feed, so this is BYOK: the user pastes
       their own FREE aisstream.io API key in Settings (stored only in this browser). With a key we
       stream real vessel positions for the current viewport; WITHOUT a key we show an honest prompt
       and NO ships — we never fabricate vessels. */
    let aisKey=''; try{ aisKey=localStorage.getItem('intmap_ais_key')||''; }catch(_){}
    let aisWS=null, shipsByMMSI={}, aisRefreshT=null, _aisMove=null, _aisMoveT=null, aisReconnectT=null;
    function updateShipsZoomHint(){
      const on=GE().layers.get('lyr-ships')&&GE().layers.getLayout('lyr-ships','visibility')==='visible';
      const el=zoomHintEl('ships-zoom-hint',SHIPS_MIN_ZOOM);
      if(on&&aisKey&&GE().camera.getZoom()<SHIPS_MIN_ZOOM){ el.textContent=t('shipsZoomHint'); el.style.display='block'; } else el.style.display='none';
    }
    function aisBBox(){ const b=GE().camera.getBounds(); return [[[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]]]; }
    function stopAIS(){
      if(aisRefreshT){ clearTimeout(aisRefreshT); aisRefreshT=null; }
      if(aisReconnectT){ clearTimeout(aisReconnectT); aisReconnectT=null; }
      if(aisWS){ try{ aisWS.onclose=null; aisWS.close(); }catch(_){} aisWS=null; }
    }
    function shipMaterialize(){
      const cutoff=Date.now()-15*60000;   /* drop vessels not heard from in 15 min */
      shipsData=Object.values(shipsByMMSI).filter(s=>s.lat!=null&&s.lng!=null&&s.t>cutoff).map(s=>({
        lng:s.lng, lat:s.lat, mmsi:s.mmsi, name:s.name||'', callsign:s.callsign||'',
        speed:(s.sog!=null?s.sog:null), cog:(s.cog!=null?s.cog:null), heading:(s.heading!=null?s.heading:(s.cog!=null?s.cog:0)),
        navStatus:(s.navStatus!=null?s.navStatus:null), shipType:(s.shipType!=null?s.shipType:null),
        dest:s.dest||'', draught:(s.draught!=null?s.draught:null), imo:(s.imo!=null?s.imo:null), t:s.t,
        type:(s.shipType===35?'military':'civilian')
      }));
      refreshTrafficLayer('ships');
    }
    function scheduleShipRefresh(){ if(aisRefreshT) return; aisRefreshT=setTimeout(()=>{ aisRefreshT=null; shipMaterialize(); },1200); }
    function handleAIS(m){
      const md=m.MetaData||m.metadata||{}; const mmsi=md.MMSI||md.mmsi; if(mmsi==null) return;
      const s=shipsByMMSI[mmsi]||(shipsByMMSI[mmsi]={mmsi});
      if(md.latitude!=null) s.lat=md.latitude; if(md.longitude!=null) s.lng=md.longitude;
      if(md.ShipName) s.name=String(md.ShipName).trim();
      s.t=md.time_utc?(Date.parse(md.time_utc)||Date.now()):Date.now();
      const body=m.Message||m.message||{};
      if(m.MessageType==='PositionReport'){ const p=body.PositionReport||{};
        if(p.Latitude!=null) s.lat=p.Latitude; if(p.Longitude!=null) s.lng=p.Longitude;
        if(p.Sog!=null) s.sog=p.Sog; if(p.Cog!=null) s.cog=p.Cog;
        if(p.TrueHeading!=null&&p.TrueHeading<360) s.heading=p.TrueHeading; else if(p.Cog!=null) s.heading=p.Cog;
        if(p.NavigationalStatus!=null) s.navStatus=p.NavigationalStatus;
      } else if(m.MessageType==='ShipStaticData'){ const p=body.ShipStaticData||{};
        if(p.Name) s.name=String(p.Name).trim(); if(p.CallSign) s.callsign=String(p.CallSign).trim();
        if(p.Type!=null) s.shipType=p.Type; if(p.Destination) s.dest=String(p.Destination).trim();
        if(p.MaximumStaticDraught!=null) s.draught=p.MaximumStaticDraught; if(p.ImoNumber!=null) s.imo=p.ImoNumber;
      }
    }
    function connectAIS(){
      if(!aisKey||!GE().hasRenderer()) return;
      stopAIS(); shipsByMMSI={}; shipsData=[]; refreshTrafficLayer('ships');
      let ws; try{ ws=new WebSocket('wss://stream.aisstream.io/v0/stream'); }catch(e){ imToast((window.IntMapLang.t(HOST.lang,'AIS connect failed: ','AIS接続失敗: ','AIS-Verbindung fehlgeschlagen: ','Сбой подключения AIS: ','Fallo de conexión AIS: '))+((e&&e.message)||e)); return; }
      aisWS=ws;
      ws.onopen=()=>{ try{ ws.send(JSON.stringify({APIKey:aisKey, BoundingBoxes:aisBBox(), FilterMessageTypes:['PositionReport','ShipStaticData']})); }catch(_){} };
      ws.onmessage=(ev)=>{ if(ws!==aisWS) return; try{ handleAIS(JSON.parse(ev.data)); scheduleShipRefresh(); }catch(_){} };
      ws.onerror=()=>{};
      ws.onclose=()=>{ if(ws!==aisWS) return; aisReconnectT=setTimeout(()=>{ if(GE().layers.has('lyr-ships')&&GE().layers.getLayout('lyr-ships','visibility')==='visible'&&aisKey&&GE().camera.getZoom()>=SHIPS_MIN_ZOOM) connectAIS(); },4000); };
    }
    function startShips(){
      if(!aisKey){ imToast(t('aisNoKey')); updateShipsZoomHint(); return; }
      if(GE().camera.getZoom()<SHIPS_MIN_ZOOM){ updateShipsZoomHint(); return; }  /* connect once the user zooms in */
      connectAIS();
    }
    /* AIS ship-type code → label */
    function shipTypeLabel(c){ if(c==null) return ''; const jp=HOST.lang==='jp';
      if(c===35) return window.IntMapLang.t(HOST.lang,'Military','軍用','Militär','Военное','Militar'); if(c===30) return window.IntMapLang.t(HOST.lang,'Fishing','漁船','Fischerei','Рыболовное','Pesca'); if(c===36) return window.IntMapLang.t(HOST.lang,'Sailing','帆船','Segelschiff','Парусное','Vela'); if(c===37) return window.IntMapLang.t(HOST.lang,'Pleasure craft','プレジャー','Sportboot','Прогулочное судно','Embarcación de recreo');
      if(c>=60&&c<=69) return window.IntMapLang.t(HOST.lang,'Passenger','旅客船','Passagierschiff','Пассажирское','Pasaje'); if(c>=70&&c<=79) return window.IntMapLang.t(HOST.lang,'Cargo','貨物船','Frachtschiff','Грузовое','Carga'); if(c>=80&&c<=89) return window.IntMapLang.t(HOST.lang,'Tanker','タンカー','Tanker','Танкер','Petrolero');
      if(c>=40&&c<=49) return window.IntMapLang.t(HOST.lang,'High-speed craft','高速船','Schnellboot','Скоростное судно','Nave rápida'); if(c===50) return window.IntMapLang.t(HOST.lang,'Pilot','パイロット','Lotsenboot','Лоцманское','Práctico'); if(c===51) return 'SAR'; if(c===52) return window.IntMapLang.t(HOST.lang,'Tug','タグ','Schlepper','Буксир','Remolcador'); if(c===55) return window.IntMapLang.t(HOST.lang,'Law enforcement','法執行','Behördenschiff','Правоохранительное','Autoridad');
      return window.IntMapLang.t(HOST.lang,'Other','その他','Sonstige','Прочее','Otro'); }
    /* AIS navigational-status code → label */
    function navStatusLabel(c){ if(c==null) return ''; const jp=HOST.lang==='jp';
      const en=['Under way (engine)','At anchor','Not under command','Restricted maneuverability','Constrained by draught','Moored','Aground','Fishing','Under way (sailing)'];
      const ja=['航行中(機走)','錨泊','操縦不能','操縦制限','喫水制限','係留','座礁','漁労中','航行中(帆走)'];
      return (c>=0&&c<=8)?(jp?ja[c]:en[c]):''; }
    /* Ship glyphs (top-view hull) — colored + rotated by heading/COG, like the plane icons. */
    function ensureShipIcons(){
      if(!GE().hasRenderer()) return;
      const make=(color)=>{ const s=40, cv=document.createElement('canvas'); cv.width=s; cv.height=s;
        const ctx=cv.getContext('2d'); ctx.translate(s/2,s/2);
        ctx.fillStyle=color; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=1.6; ctx.lineJoin='round';
        const P=[[0,-16],[4.5,-7],[4.5,11],[3,15],[-3,15],[-4.5,11],[-4.5,-7]];
        ctx.beginPath(); P.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
        return ctx.getImageData(0,0,s,s); };
      try{ if(!GE().scene.hasImage('ship-civ')) GE().scene.addImage('ship-civ',make('#17a2b8')); }catch(_){}
      try{ if(!GE().scene.hasImage('ship-mil')) GE().scene.addImage('ship-mil',make('#ff3b30')); }catch(_){}
    }
    /* AISstream key field in Settings (added via addEventListener so the existing handlers still run). */
    (function wireAisKey(){
      const ob=document.getElementById('btn-open-settings'), cb=document.getElementById('btn-close-settings');
      if(ob) ob.addEventListener('click',()=>{ const i=document.getElementById('setting-ais-key'); if(i) i.value=aisKey; });
      if(cb) cb.addEventListener('click',()=>{ const i=document.getElementById('setting-ais-key'); if(!i) return; const nk=i.value.trim();
        if(nk!==aisKey){ aisKey=nk; try{ aisKey?localStorage.setItem('intmap_ais_key',aisKey):localStorage.removeItem('intmap_ais_key'); }catch(_){}
          if(GE().layers.has('lyr-ships')&&GE().layers.getLayout('lyr-ships','visibility')==='visible'){ stopAIS(); startShips(); updateShipsZoomHint(); } } });
    })();
    /* ===== (#R172) AIRCRAFT AT THEIR REAL ALTITUDE ==========================================
       「Live aircraft trafficは、飛行中の高度に応じて、実際にIntMapの空間でもその高度に描画して。」
       The glyphs were a `symbol` layer, which MapLibre pins to the map SURFACE — a jet at 11 km and one
       taxiing sat at exactly the same height, and tilting the map showed no difference at all.
       MapLibre 5.24 has NO way to lift a symbol: `symbol-z-offset` / `symbol-elevation-reference` are
       absent from this build (checked in the dist — the properties simply do not exist), so the only
       primitive that takes a real altitude is `fill-extrusion`. Each aircraft therefore becomes a small
       aeroplane-shaped POLYGON built in ground metres, turned to its ADS-B track and extruded at its
       reported altitude, plus a hairline post down to its ground position so the height is readable and
       the aircraft stays tied to the point it is over.
       Honest about the one exaggeration: a real 60 m airframe is far under a pixel at these zooms, so the
       glyph has a MINIMUM on-screen size (it never shrinks below ~13 px) — the POSITION is real data, the
       silhouette's size is a symbol, exactly as the flat glyph always was.
       Altitude reference: the same trap the 3-D volume tool documents — with 3-D terrain on, the
       renderer's metres are above the GROUND, otherwise above SEA LEVEL. Airborne aircraft get the ground
       under the map centre subtracted so their altitude means AMSL either way; aircraft ON the ground are
       left at 0 so they sit on the terrain instead of hovering over it. */
    /* ══ (#R190) DEFAULT ON — AND A THIRD KEY GENERATION, BECAUSE THAT IS WHAT A DEFAULT CHANGE COSTS ══
       「（あと、at real altitudeはデフォルトで選択状態に。）」

       #R187 made this default OFF so its restored 2-D glyph would be the thing on screen; #R189 had to
       bump the key because the #R172–#R186 era's TRUE was still sitting in storage. Now the default is
       TRUE again — and the mark no longer depends on the toggle at all, because #R190 draws the SAME
       original silhouette in both renderings (see _PLANE_OUTLINE). The two halves of the instruction
       stop fighting each other.

       ⚠ The generation is bumped a second time for the same measured reason it was bumped the first.
       `intmap_planes3d2` was written only by the checkbox — but it was written under a regime whose
       default was OFF, so a '0' in it is very often the era's default arriving by way of a check and
       an uncheck, not a standing preference for the flat glyph. Reading it here would hand exactly
       the reported bug back to anyone who had ever touched the toggle. Both legacy keys are removed;
       only a toggle flipped AFTER this ships is honoured. (#R189's lesson, applied to itself.) */
    const PLANES3D_KEY='intmap_planes3d3';
    let planes3D=true; try{ const _p3=localStorage.getItem(PLANES3D_KEY); if(_p3!=null) planes3D=(_p3==='1');
      localStorage.removeItem('intmap_planes3d'); localStorage.removeItem('intmap_planes3d2'); }catch(_){}
    let _planes3DStats={features:0,lifted:0,maxAlt:0,offsetM:0};
    const PLANE3D_SRC='src-planes-3d', PLANE3D_LYR='lyr-planes-3d', PLANE3D_POST='lyr-planes-post';
    /* ===== (#R173) THE TRACK OF A CLICKED AIRCRAFT =========================================
       「クリックした航空機はそれまでの軌跡も出るように。」 The track is REAL and it is OURS: every
       ADS-B poll (one every 20 s) is written into planeTracks, so what a click draws is the path this
       browser has actually watched the aeroplane fly since the layer was switched on — never an
       interpolation, never a guess about where it was before we were looking. The feed has no public
       history endpoint, and inventing one would be exactly the fabrication this project forbids, so the
       readout says how long the recorded track is and how many fixes it has.
       In 3-D the track is drawn where it happened: each leg is a thin ribbon extruded at the pair's own
       reported altitude, so a climb is visibly a climb. Flat mode keeps a plain line on the ground. */
    const TRACK_SRC='src-plane-track', TRACK_LINE='lyr-plane-track', TRACK_3D='lyr-plane-track-3d';
    const TRACK_MAX=400;            /* fixes per aircraft (~2 h at one poll every 20 s) */
    const TRACK_TTL=20*60000;       /* forget an aircraft 20 min after its last fix */
    const planeTracks=Object.create(null);
    let selectedPlane=null;         /* icao24 of the aircraft whose track is on screen */
    function recordTracks(list,tMs){
      const now=+tMs||Date.now();
      for(const d of list){
        const k=d.icao24; if(!k||d.lng==null||d.lat==null) continue;
        const alt=d.onGround?0:(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0));
        const arr=planeTracks[k]||(planeTracks[k]=[]);
        const last=arr[arr.length-1];
        /* skip a fix that repeats the previous one — a parked aircraft would otherwise fill the buffer */
        if(last&&Math.abs(last[0]-d.lng)<1e-6&&Math.abs(last[1]-d.lat)<1e-6&&Math.abs(last[2]-alt)<1) { last[3]=now; continue; }
        arr.push([d.lng,d.lat,alt,now]);
        if(arr.length>TRACK_MAX) arr.splice(0,arr.length-TRACK_MAX);
      }
      const cut=now-TRACK_TTL;
      for(const k in planeTracks){ const a=planeTracks[k]; if(!a.length||a[a.length-1][3]<cut) delete planeTracks[k]; }
      if(selectedPlane) drawTrack(selectedPlane);
      /* (#R175) …and an open detail card is refreshed from the SAME poll, so the altitude and speed on the
         card are never older than the aircraft on the map. Only the airframe the card is showing. */
      try{ const P=window.IntMapAircraftPanel;
        if(P&&P.isOpen()){ const k=P.current();
          const d=k?list.find(x=>String(x.icao24||'').toUpperCase()===k):null;
          if(d) P.update(d,{track:_trackCard(d.icao24)}); } }catch(_){}
    }
    /* a strip of ground metres along a leg, so the 3-D track is a ribbon rather than a zero-width sheet */
    function legRing(a,b,halfM){
      const r=Math.PI/180, mLat=110574, mLng=(111320*Math.cos(((a[1]+b[1])/2)*r))||1;
      let dx=(b[0]-a[0])*mLng, dy=(b[1]-a[1])*mLat; const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
      const nx=-dy*halfM, ny=dx*halfM;
      const P=(p,ox,oy)=>[p[0]+ox/mLng, p[1]+oy/mLat];
      const ring=[P(a,nx,ny),P(b,nx,ny),P(b,-nx,-ny),P(a,-nx,-ny)]; ring.push(ring[0]); return ring;
    }
    function trackStats(k){ const a=planeTracks[k]||[]; if(a.length<2) return {fixes:a.length,minutes:0,maxAlt:0};
      return { fixes:a.length, minutes:Math.round((a[a.length-1][3]-a[0][3])/60000),
        maxAlt:Math.round(a.reduce((m2,p)=>p[2]>m2?p[2]:m2,0)) }; }
    function drawTrack(k){
      if(!GE().hasRenderer()||!GE().layers.hasSource(TRACK_SRC)) return;
      const pts=(k&&planeTracks[k])||[];
      const feats=[];
      if(pts.length>=2){
        feats.push({type:'Feature',geometry:{type:'LineString',coordinates:pts.map(p=>[p[0],p[1]])},properties:{kind:'line'}});
        _gndFresh();
        const mpp=_mppCentre(), half=Math.max(25,1.6*mpp), thick=Math.max(20,1.6*mpp);
        for(let i=1;i<pts.length;i++){
          const a=pts[i-1], b=pts[i];
          /* the ground under THIS leg (see _groundAt) — a single centre reading put a mountain under an
             aeroplane 40 km out to sea, and the clamp below then deleted the leg */
          const off=_groundAt((a[0]+b[0])/2,(a[1]+b[1])/2);
          const alt=Math.max(0,((a[2]+b[2])/2)-off);
          /* (#R174) NEVER DROPPED. A leg at or below the local ground used to be skipped outright, which is
             how a whole track vanished while its aircraft stayed on screen. A track that runs along the
             ground is a real thing that happened and it gets drawn like one — at 0, with the same thickness
             the rest of the track has, exactly as the aircraft glyph is already treated. */
          feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[legRing(a,b,half)]},
            properties:{kind:'leg',alt,top:alt+thick}});
        }
      }
      try{ GE().layers.setSourceData(TRACK_SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
      const on=!!(k&&pts.length>=2);
      try{ if(GE().layers.has(TRACK_LINE)) GE().layers.setLayout(TRACK_LINE,'visibility',(on&&!planes3D)?'visible':'none');
        if(GE().layers.has(TRACK_3D)) GE().layers.setLayout(TRACK_3D,'visibility',(on&&planes3D)?'visible':'none'); }catch(_){}
    }
    /* ===== (#R173) PICKING AN AIRCRAFT THAT IS UP IN THE AIR =================================
       「立体時もホバーやクリックができるように。」 MapLibre answers queryRenderedFeatures on a
       fill-extrusion at its FOOTPRINT: measured with one stubbed aircraft at 11,003 m, the glyph drawn at
       y=272 and its ground point at y=388, the only row on the whole screen that reported the feature was
       388 — at z9.5, z11.5 and z13.5 alike. So the lifted aircraft could not be hovered or clicked where
       it is drawn; only the patch of ground it happened to be over could.
       The pick is therefore done here, against the aircraft's real position: the engine projects
       (lng, lat, altitude) through the renderer's own model matrices (coords.projectAltitude), and the
       nearest aircraft within a finger-sized radius wins. The ground footprint keeps working too — the
       post is a real thing to click at — so both ways of aiming at an aeroplane select the same one. */
    const PICK_PX=16;
    /* ⚠ (#R187) WHERE THE AIRCRAFT IS DRAWN DEPENDS ON WHICH RENDERING IS ON, AND THE PICK HAS TO
       ASK THE SAME QUESTION AS THE DRAWING. In 3-D the body stands at its reported altitude; the flat
       glyph is a symbol at the ground position. #R174's rule — "a pick that used a different offset
       would look for the aeroplane somewhere it is not" — is the reason this exists, and making the
       flat glyph the default (see planes3D) is exactly the case it had never been asked about:
       `pickPlane` began with `if(!planes3D) return null`, so with 2-D restored, clicking an aircraft
       would have selected nothing, opened no detail card and drawn no track. Found by tests/r175,
       which is about the card and not about 3-D at all. */
    function _planeDrawAlt(d){
      if(!planes3D||d.onGround) return 0;
      return Math.max(0,(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0))-_groundAt(d.lng,d.lat));
    }
    function pickPlane(pt){
      if(!pt) return null;
      const E=window.IntMapGeoEngine, pa=E&&E.coords&&E.coords.projectAltitude; if(!pa) return null;
      /* (#R174) the SAME per-aircraft ground the drawing uses — a pick that used a different offset would
         look for the aeroplane somewhere it is not */
      _gndFresh(); let best=null, bestD=PICK_PX*PICK_PX;
      const filt=trafficFilters.planes;
      for(const d of planesData){
        if(d.lng==null||d.lat==null) continue;
        if(filt&&filt!=='all'&&d.type!==filt) continue;
        const p=pa([d.lng,d.lat],_planeDrawAlt(d)); if(!p) continue;
        const dx=p.x-pt.x, dy=p.y-pt.y, q=dx*dx+dy*dy;
        if(q<bestD){ bestD=q; best=d; }
      }
      return best;
    }
    /* Select / deselect the aircraft whose track is shown. Returns the icao24 now selected (or null). */
    function selectPlane(k){
      selectedPlane=(k&&planeTracks[k])?k:(k||null);
      drawTrack(selectedPlane);
      try{ refreshTrafficLayer('planes'); }catch(_){}   /* the glyph highlights itself via `sel` */
      /* (#R175) the detail card follows the selection: deselecting an aircraft closes its card, and the
         card's own Show/Hide button lands back here, so the two can never disagree about what is selected. */
      try{ const P=window.IntMapAircraftPanel;
        if(P&&P.isOpen()){ if(!selectedPlane&&P.current()) P.close();
          else if(selectedPlane&&P.current()===selectedPlane.toUpperCase()) P.setTrack(_trackCard(selectedPlane)); } }catch(_){}
      return selectedPlane;
    }
    /* (#R175) what the detail card needs to know about the observed track: how much of it there is, and
       whether it is on screen right now. */
    function _trackCard(k){ const st=trackStats(k); return { fixes:st.fixes, minutes:st.minutes, on:(k===selectedPlane) }; }
    /* (#R175) open the aircraft detail card — the photograph + every ADS-B field + "fly from here".
       `d` is the internal plane record, which is the only shape that carries the full feed (the rendered
       feature's properties are the tooltip subset), so a footprint hit that cannot find one falls back to
       the properties rather than opening a half-empty card. */
    function openPlaneCard(d){
      try{ const P=window.IntMapAircraftPanel; if(!P||!d||!d.icao24) return false;
        return P.open(d,{ track:_trackCard(d.icao24), onToggleTrack:(k)=>{ selectPlane(k===selectedPlane?null:k); } }); }catch(_){ return false; }
    }
    /* ground metres per screen pixel at the map centre — the same figure IntMapGeoEngine derives for the
       camera, computed here from the renderer's own map scale so it is defined at any pitch. */
    function _mppCentre(){ try{ const R=6371008.8, r=Math.PI/180, c=GE().camera.getCenter();
      let w=0; try{ const v=GE().coords.worldSize(); if(isFinite(v)&&v>0) w=v; }catch(_){}
      if(!w) w=512*Math.pow(2,GE().camera.getZoom()||0);
      const m=(2*Math.PI*R*Math.cos((c.lat||0)*r))/w; return (isFinite(m)&&m>0)?m:50; }catch(_){ return 50; } }
    /* the DEM height under the map centre (0 when 3-D terrain is off — then the renderer's metres already
       mean altitude above sea level and nothing has to be taken off) */
    /* (#R174) …UNDER THAT AIRCRAFT, not under the map centre. THIS is 「ズームインすると軌跡が消える」, and it
       is nothing to do with the zoom gesture — the zoom just moves the centre onto higher ground and refines
       the DEM under it. With 3-D terrain on, one ground elevation was read at the map CENTRE and subtracted
       from every aircraft on screen, however far away it was. Reproduced over Mt Fuji with a stubbed
       aircraft at 5,000 ft (1,524 m AMSL) and the centre standing at 2,827 m: the subtraction went negative,
       clamped to 0 — and the TRACK then dropped every single leg (`if(!(alt>0)) continue`) while the
       aircraft glyph survived, because that one is pushed whatever its altitude. Measured at eight zoom
       steps from z10.5 to z14.3: legCount 0 at every one, with the aeroplane plainly drawn on screen.
       That is exactly the reported symptom — the machine stays, its trail goes.
       So the offset is now read where the thing actually is. Memoised per ~100 m cell for the length of one
       refresh, because a busy sky is hundreds of aircraft and this runs on every poll and every zoom. */
    let _gndMemo=null;
    function _groundAt(lng,lat){ try{ if(!HOST.terrain3D||!GE().coords.terrainElevation) return 0;
      if(!_gndMemo) _gndMemo=new Map();
      const k=lng.toFixed(3)+','+lat.toFixed(3);
      if(_gndMemo.has(k)) return _gndMemo.get(k);
      const g=GE().coords.terrainElevation({lng,lat});
      const v=(g==null||!isFinite(g))?0:+g;
      _gndMemo.set(k,v); return v; }catch(_){ return 0; } }
    function _gndFresh(){ _gndMemo=null; }
    /* kept for the diagnostics readout only — "what would the old single offset have been" */
    function _groundOffset(){ try{ if(!HOST.terrain3D) return 0;
      const c=GE().camera.getCenter(); return _groundAt(c.lng,c.lat); }catch(_){ return 0; } }
    /* An aeroplane silhouette in ground metres, centred on [lng,lat] and turned to `hdg` (°, clockwise from
       north). Same outline as the 2-D glyph so the layer does not change character when it goes 3-D. */
    /* ══ (#R190) THE MARK IS THE ORIGINAL ONE IN BOTH RENDERINGS ═══════════════════════════════════
       「Live aircraft trafficの飛行機のマークはat real altitude中も昔のものに戻して。」

       #R187 restored the flat 2-D glyph to the outline this app shipped with, and left the LIFTED
       body as #R183/#R185 had rebuilt it: an eight-part airliner (two fuselage prisms, wing, two
       nacelles, tailplane, two fin stages) sitting on a white rim and a dark halo. That is a
       different mark, and 「at real altitude中も」 says so — the aircraft must not change shape when
       it is drawn at its altitude.

       So the lifted body is the #R172 rendering again: ONE plan-form polygon — `_PLANE_ORIG`, the
       same outline the 2-D glyph draws — extruded to a uniform thickness at the reported altitude,
       plus the hairline post down to the ground. The rim/halo plates and the eight parts are gone
       with the plan-form they were grown from.

       ⚠ DECLARED HERE, above every use. `_PLANE_ORIG` used to live next to ensurePlaneIcons, ~250
       lines further down; naming it from here would have put this `const` in its own temporal dead
       zone and thrown ReferenceError while the factory was still being constructed, taking the whole
       data-layers module with it — the #R167/#R183/#R189 trap, three rounds running. */
    const _PLANE_ORIG=[[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],
                       [-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]];
    const _PLANE_OUTLINE=_PLANE_ORIG;
    /* ══ (#R192) ONE SIZE RAMP, READ BY BOTH RENDERINGS ════════════════════════════════════════════
       The glyph's size on screen is `icon-size` × the artwork, and the lifted body's size is metres of
       ground. They were written as two independent numbers and drifted apart (see refreshPlanes3D).
       This is the ramp — the original one, restored by #R187 — stated ONCE: the symbol layer builds
       its `icon-size` expression from it and the extrusion evaluates it at the current zoom, so
       "the same mark" is true by construction rather than by two matching constants. */
    /* ⚠ (#R247) 「Live aircraft trafficで航空機の大きさを少し大きく。」 — 1.25× at every stop, so the
       ramp's SHAPE (how the mark grows with zoom) is untouched and only its scale moves. Because
       both renderings read this one table — the symbol layer builds `icon-size` from it and the
       lifted body evaluates it for its metres of ground — the flat glyph and the 3-D body grow by
       exactly the same factor, which is the whole reason #R192 stated the ramp once. */
    const _PLANE_SIZE=[[2,0.5],[5,0.725],[9,0.975]];
    function _planeIconSize(z){
      const t=_PLANE_SIZE; const zz=(+z||0);
      if(zz<=t[0][0]) return t[0][1];
      for(let i=1;i<t.length;i++){ if(zz<=t[i][0]){ const a=t[i-1], b=t[i];
        return a[1]+(b[1]-a[1])*(zz-a[0])/(b[0]-a[0]); } }
      return t[t.length-1][1];
    }
    const _planeIconSizeExpr=()=>['interpolate',['linear'],['zoom']].concat(_PLANE_SIZE.reduce((a,p)=>a.concat(p),[]));
    /* ══ (#R191) THE ORIGINAL MARK'S WHITE STROKE, IN THE LIFTED RENDERING TOO ═════════════════════
       「元に戻せと言っているのに、色を勝手に変えるな。」 #R190 gave the lifted body the original
       SILHOUETTE and stopped there, so the two renderings still drew different marks — measured over
       866 aircraft at z10.5: the flat glyph carries 0.037 white-outline pixels per body pixel and the
       lifted body 0.012. The original mark is not a bare blue shape: `ensurePlaneIcons` fills it and
       then strokes it with `PLANE_STROKE` px of white on a 44-unit canvas whose half-length is 19,
       i.e. a stroke that straddles the path by half that either side. That stroke is half the mark's
       identity — and (#R246) it is now the WIDTH the reader asked to be thicker, so it is a constant
       both renderings read rather than a number written twice.
       An extrusion has no stroke, so it is drawn as its own polygon (see refreshPlanes3D:
       `part:'rim'`) — (#R192) a RING, outer boundary _PLANE_RIM and inner boundary _PLANE_CORE, which
       is exactly the annulus `ctx.stroke()` paints and shares no surface with the body.
       ⚠ MITRED, NOT SCALED. #R185's rim was the whole plan-form grown about its centre, which puts
       more outset at the nose and the wingtips than beside the fuselage — a scaled copy, not a
       stroke. This offsets each vertex along the mitre of its two edge normals, so the band is
       `_PLANE_STROKE` units wide everywhere, exactly as the canvas stroke is. The mitre is limited at
       3.25× that so the 2.2-unit-wide fuselage notches cannot spike. */
    /* ══ ⚠ (#R246) THE TWO AIRCRAFT COLOURS AND THE OUTLINE WIDTH, EACH WRITTEN ONCE ════════════
       「Live aircraft trafficで航空機の色は以下に。民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040
         両方とも：より太いアウトライン」
       All three are read by the flat glyph (`ensurePlaneIcons`) AND by the lifted 3-D body below, so
       the 2-D mark and the 3-D one cannot disagree — they did in #R173, which is what `_feHex` and
       the `part:'rim'` ring exist to keep true. ⚠ THIS IS WHY THEY ARE DECLARED HERE, ABOVE
       `_PLANE_RIM`: the ring's half-width is derived from the stroke rather than typed again, so
       thickening the outline thickens the lifted mark's white band by exactly the same amount.
       ⚠ The military red is deliberately not the app's --info-mil #ff3b30 any more: beside cyan the
       warmer, more saturated #FF3040 is what tells the two apart at a glance. */
    const PLANE_CIV='#00D9FF';                                /* civil — cyan */
    const PLANE_MIL='#FF3040';                                /* military — vivid red */
    const PLANE_STROKE=2.6;                                   /* the white outline, in the glyph's 44-unit space */
    const _PLANE_STROKE=PLANE_STROKE/2;                       /* half of ensurePlaneIcons' stroke */
    function _outsetRing(pts,w){
      const n=pts.length, area=(()=>{ let a=0; for(let i=0,j=n-1;i<n;j=i++) a+=(pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1]); return a; })();
      const sgn=area>0?1:-1;                                  /* so the offset always goes OUTWARD */
      const en=[];                                            /* one outward unit normal per edge */
      for(let i=0;i<n;i++){ const a=pts[i], b=pts[(i+1)%n];
        const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1;
        en.push([sgn*dy/L, -sgn*dx/L]); }
      const out=[];
      for(let i=0;i<n;i++){ const p=en[(i-1+n)%n], q=en[i];
        const mx=p[0]+q[0], my=p[1]+q[1], d=1+(p[0]*q[0]+p[1]*q[1]);
        const k=(d>0.05)?(w/d):(w/0.05);
        const ox=mx*k, oy=my*k, m=Math.hypot(ox,oy), lim=Math.abs(w)*3.25;
        const s=(m>lim&&m>0)?(lim/m):1;
        out.push([pts[i][0]+ox*s, pts[i][1]+oy*s]); }
      return out;
    }
    /* `ctx.fill()` then `ctx.stroke()` puts HALF the line inside the path and half outside, so the
       glyph's fill ends `_PLANE_STROKE` units short of the outline and its white ring is `PLANE_STROKE`
       units wide. The lifted mark is built the same way round: the body is the outline INSET by
       `_PLANE_STROKE`, the stroke is it OUTSET by the same, and the mark's overall size is unchanged
       (the ring reaches exactly where the canvas one does — which is why #R246's thicker outline
       widens the band inward and outward equally in both renderings, from one number). */
    const _PLANE_RIM=_outsetRing(_PLANE_OUTLINE,_PLANE_STROKE);
    const _PLANE_CORE=_outsetRing(_PLANE_OUTLINE,-_PLANE_STROKE);
    /* ══ (#R191) A `fill-extrusion` NEVER RENDERS THE COLOUR IT IS GIVEN ═══════════════════════════
       MapLibre lights every extrusion in the vertex shader — read it in fill_extrusion.vertex.glsl:

           color += vec4(0.03);                              // a fixed ambient, on every channel
           directional = clamp(dot(normal/16384.0, u_lightpos), 0, 1);
           directional = mix(1-I, max(1-luminance+I, 1), directional);
           v_color.rgb = clamp(color.rgb * directional * u_lightcolor, …, 1.0);

       so the mark's declared `#1e90ff` reached the screen as rgb(35,141,245) while the flat glyph —
       an icon, which is not lit — reached it as rgb(30,144,255). That is the reported colour change,
       and it is not something the aircraft layer chose.

       Two exits were measured and rejected. There is no per-layer escape in 5.24: the paint
       properties are opacity/color/pattern/translate/height/base/vertical-gradient — no
       emissive-strength. And `light.intensity = 0` DOES make every extrusion render its exact colour
       in every projection (measured: rgb(38,152,255) at z8 globe, z13 Mercator and at 62° of pitch,
       all identical) — but the light is a STYLE property, and with it flat the 3-D buildings lose
       their form completely: walls and roofs become one tone (screenshotted over Midtown).

       What is left is to ask for the colour that comes out right, which needs `directional`. It is
       not a free variable: measured with a white body, it is 0.933 under the globe projection —
       stable across z4→z10, off-centre views, 55° of pitch and 90° of bearing — and 1.0 under
       Mercator, which the app switches to at z12. So the compensation is a two-stop zoom ramp
       matching the renderer's own transition band, and it is exact except where a channel is already
       at the ceiling: blue 255 needs 1.075 of a channel under the globe, so it stays at 245 there.
       Measured result — globe rgb(30,144,245), Mercator rgb(30,144,255) against the glyph's
       rgb(30,144,255): two channels exact instead of none, and the third as close as the renderer
       can be asked to go. tests/r191 pins the constants against live pixels. */
    const _FE_AMBIENT=0.03;                                   /* the shader's fixed ambient term */
    const _FE_DIR_GLOBE=0.933, _FE_DIR_MERC=1.0;              /* measured roof `directional`, per projection */
    const _FE_Z0=11.5, _FE_Z1=13;                             /* the globe→Mercator transition band */
    function _feHex(hex,dir){
      const n=parseInt(hex.slice(1),16), ch=[(n>>16)&255,(n>>8)&255,n&255];
      return '#'+ch.map(v=>{ const want=v/255;
        const need=Math.max(0,Math.min(1,want/dir-_FE_AMBIENT));
        return Math.round(need*255).toString(16).padStart(2,'0'); }).join('');
    }
    /* the two-stop zoom ramp above, built from a factory so every plane layer states its colours once.
       ⚠ The zoom expression has to be the OUTERMOST one — MapLibre rejects `['zoom']` nested inside a
       data expression — which is why the factory is called twice rather than wrapped once. */
    const _feRamp=(mk)=>['interpolate',['linear'],['zoom'],_FE_Z0,mk(_FE_DIR_GLOBE),_FE_Z1,mk(_FE_DIR_MERC)];
    /* Turn a list of aircraft-frame offsets into a lng/lat ring. `pts` are in the SCREEN convention the
       2-D glyph uses (+y = aft), in units where the half-length is 19; `halfM` is that half-length in
       real ground metres. Shared by the whole-aircraft silhouette and by every 3-D part below. */
    function planeRingPts(lng,lat,hdg,halfM,pts){
      const r=Math.PI/180, s=halfM/19, th=(+hdg||0)*r, cs=Math.cos(th), sn=Math.sin(th);
      const mLat=110574, mLng=(111320*Math.cos(lat*r))||1, out=[];
      for(const p of pts){
        /* the outline is drawn nose-up in screen space (+y = south); rotate it into a compass track */
        const ex=p[0]*s, ey=-p[1]*s;                          /* east, north offsets in metres, track 0 */
        const e=ex*cs+ey*sn, n=-ex*sn+ey*cs;
        out.push([lng+e/mLng, lat+n/mLat]);
      }
      out.push(out[0]); return out; }
    /* (#R183) 「立体的に見たときの感じもリアルに。」
       #R172 gave the aircraft their real ALTITUDE, which was the important half. What stood there was
       one flat plan-view polygon given a uniform thickness — a cookie-cutter plate. #R183 split that
       into four parts at four heights and #R185 grew it to eight with a white rim and a dark halo, so
       that a tilted camera would see structure.
       (#R190) ALL OF THAT IS WITHDRAWN, by the same verdict #R187 delivered on the 2-D glyph:
       「Live aircraft trafficの飛行機のマークはat real altitude中も昔のものに戻して。」 The lifted body
       is one polygon of `_PLANE_OUTLINE` again — the original silhouette, the original 13-px size, a
       uniform thickness and the hairline post. The parts, the rim, the halo, their level table and the
       aircraft-count budget that switched between the detailed and plain versions are gone with the
       plan-form they were grown from. `fill-extrusion` is still the only primitive with a real
       altitude in MapLibre 5.24 (#R172 established that `symbol-z-offset` does not exist in this
       build), which is why the mark is an extrusion at all rather than the symbol layer's own glyph. */
    function squareRing(lng,lat,halfM){ const r=Math.PI/180, mLat=110574, mLng=(111320*Math.cos(lat*r))||1;
      const dx=halfM/mLng, dy=halfM/mLat;
      return [[lng-dx,lat-dy],[lng+dx,lat-dy],[lng+dx,lat+dy],[lng-dx,lat+dy],[lng-dx,lat-dy]]; }
    /* (#R186) The 3-D body is 3-10 polygons PER AIRCRAFT, and #R186 raised the feed cap from 1,800 to
       20,000 — so the quantity that used to be bounded by the feed now has to be bounded here. Two
       steps, in this order, because only the first one is free:
         1. CULL TO WHAT IS ON SCREEN (with a margin, so a small pan does not pop bodies in). An
            aircraft outside the viewport contributes nothing to the picture; dropping it is not a
            reduction in quality, it is not drawing the invisible.
         2. If MORE than the cap are still on screen, keep the ones nearest the centre and say in the
            console how many were left out — a silent truncation would read as "that is all there is"
            (#R185). The flat glyph layer has no such limit: it is one symbol per aircraft and
            MapLibre draws tens of thousands of those without noticing. */
    const PLANES_3D_MAX=4000;
    let _planes3DCulled=0;
    function _cullFor3D(list){
      _planes3DCulled=0;
      /* Under the budget nothing is culled at all, so the drawn set does not depend on the viewport
         and a pan cannot change which aircraft have bodies. Culling only engages where it has to. */
      if(list.length<=PLANES_3D_MAX) return list;
      let b=null; try{ b=GE().camera.getBounds(); }catch(_){}
      let inView=list;
      if(b){ try{
        const w=b.getWest(), e=b.getEast(), s=b.getSouth(), n=b.getNorth();
        const padY=(n-s)*0.25, lonSpan=((e-w)+360)%360||360, padX=lonSpan*0.25;
        const s2=s-padY, n2=n+padY;
        const inLon=(lng)=>{ const d=((lng-w+540)%360)-180; return d>=-padX&&d<=lonSpan+padX; };
        inView=list.filter(d=>d.lat!=null&&d.lat>=s2&&d.lat<=n2&&d.lng!=null&&inLon(d.lng));
      }catch(_){ inView=list; } }
      if(inView.length<=PLANES_3D_MAX){ _planes3DCulled=list.length-inView.length; return inView; }
      let c={lat:0,lng:0}; try{ c=GE().camera.getCenter(); }catch(_){}
      const d2=(d)=>{ const dy=d.lat-c.lat, dx=(((d.lng-c.lng)+540)%360-180)*Math.cos(c.lat*Math.PI/180); return dy*dy+dx*dx; };
      const near=inView.slice().sort((a,b2)=>d2(a)-d2(b2)).slice(0,PLANES_3D_MAX);
      _planes3DCulled=list.length-near.length;
      console.warn('live aircraft 3-D: '+(inView.length-near.length)+' aircraft on screen are beyond the '+PLANES_3D_MAX+'-body budget and have no 3-D body this frame');
      return near;
    }
    function refreshPlanes3D(all){
      if(!GE().hasRenderer()||!GE().layers.hasSource(PLANE3D_SRC)) return;
      const list=_cullFor3D(all||[]);
      _gndFresh();
      const mpp=_mppCentre();
      /* ══ (#R192) THE SAME MARK MEANS THE SAME NUMBER OF PIXELS ═════════════════════════════════════
         「Live aircraft trafficの飛行機のマークはat real altitude中もそうでないときと同じデザインに。」
         — reported for the fourth round. #R187 restored the glyph, #R190 gave the lifted body the same
         silhouette, #R191 matched the colour and put the white stroke back. What none of them checked
         is HOW BIG the two marks are, and they were never the same size:

             half-length on screen      z5      z9      z12     z15     z17
             flat glyph (icon-size)   11.0px  14.8px  14.8px  14.8px  14.8px
             lifted (#R190 sizes)     13.0px  13.0px  13.0px  40.0px  160px

         Measured on a live aircraft over Frankfurt at z15: the lifted mark's bounding box is 41 × 82
         px against the glyph's 19 × 26. The cause is the metre FLOOR — `max(60, 13·mpp)` reads as a
         minimum size but 13·mpp IS 13 px at every zoom, so the floor only ever binds deep in, where it
         pins the mark to a 120 m aeroplane and it grows without limit. That is a different mark.

         So the size is taken from the glyph's OWN ramp — the interpolation in the symbol layer below,
         evaluated at the same zoom — and the floor is gone with it. The two renderings are now the
         same picture at every zoom; only the parallax of the altitude separates them, which is the
         whole point of the mode.

         AND IT IS NOT A BLOCK. #R190 gave the extrusion 2.2 px of thickness so it would "not be a
         zero-height sheet"; that thickness is what a tilted camera sees as lit side walls, i.e. a
         solid object where the flat rendering has a flat mark. It is now sub-pixel (0.35 px), which is
         enough to separate the body from its own white stroke in the depth buffer and too little to
         draw a wall at any pitch. */
      const iconHalfPx=19*_planeIconSize(GE().camera.getZoom());
      const half=iconHalfPx*mpp;                       /* exactly the glyph's half-length, in ground metres */
      const post=Math.max(6, 1.1*mpp);                 /* the hairline down to the ground */
      const thick=0.35*mpp;                            /* sub-pixel: enough for the depth test, never a wall */
      const feats=[];
      for(const d of list){
        if(d.lng==null||d.lat==null) continue;
        const off=_groundAt(d.lng,d.lat);              /* (#R174) the ground under THIS aircraft */
        const alt=d.onGround?0:Math.max(0,(d.geoAlt!=null?d.geoAlt:(d.baroAlt!=null?d.baroAlt:0))-off);
        /* (#R185) `acAlt` is THE AIRCRAFT'S OWN ALTITUDE and is never overwritten by a part. `alt`
           is a part's BASE, and the parts no longer start at the aircraft's altitude (the outline
           plates are under it and the fuselage sits on them), so every reader that means "how high
           is this aeroplane" — the diagnostics, `lifted`, `maxAlt`, and the three tests that pin
           them — has to read this instead. Deriving it from a part's base is what #R183's note
           warns about one level up. */
        const props={ type:d.type, alt, acAlt:alt, top:alt+thick, sel:(d.icao24&&d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'',
          acType:d.acType||'', desc:d.desc||'', baroAlt:(d.baroAlt!=null?d.baroAlt:null), geoAlt:(d.geoAlt!=null?d.geoAlt:null),
          vel:(d.vel!=null?d.vel:null), heading:(d.heading!=null?d.heading:0), vrate:(d.vrate!=null?d.vrate:null),
          squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0), category:(d.category!=null?d.category:null) };
        /* (#R190) ONE polygon per aircraft — the original silhouette, standing at its own altitude.
           `part:'body'` is kept on it so every reader that resolves a rendered feature back to an
           aircraft (the pick fallback, the stats, the tests) asks the same question it always did. */
        /* (#R191) …preceded by the original glyph's white stroke, which is the other half of the mark
           (see _PLANE_RIM). It carries the same properties, so a click that lands on the stroke still
           resolves to the aircraft.
           (#R192) …and it is a RING — outer boundary outset 0.8, inner boundary the body's own outline
           — rather than a larger plate drawn 8 % lower. `ctx.stroke()` paints an annulus and nothing
           underneath; two overlapping extrusions at 0.35 px of separation are two coplanar surfaces
           asking a depth buffer to break a tie it cannot see. Disjoint geometry has no tie to break. */
        feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[
            planeRingPts(d.lng,d.lat,d.heading,half,_PLANE_RIM),
            planeRingPts(d.lng,d.lat,d.heading,half,_PLANE_CORE).slice().reverse()]},
          properties:Object.assign({},props,{ alt, top:alt+thick, part:'rim' }) });
        feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[planeRingPts(d.lng,d.lat,d.heading,half,_PLANE_CORE)]},
          properties:Object.assign({},props,{ alt, top:alt+thick, part:'body' }) });
        /* (#R183) The post carries the aircraft's IDENTITY, not just its colour. The click handler's
           fallback resolves a rendered feature back to an aircraft through `properties.icao24`
           (see _planesClear), and the post had only {type, alt, top, post} — so a click that landed
           on the hairline under an aeroplane found a feature, failed to match it to anything in
           planesData, and selected nothing. The post IS the aircraft's footprint; saying so is what
           makes "click the post to select it" true by construction rather than by luck. */
        if(!d.onGround&&alt>0) feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[squareRing(d.lng,d.lat,post)]},
          properties:Object.assign({},props,{ alt:0, top:alt, post:1 }) });
      }
      try{ GE().layers.setSourceData(PLANE3D_SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
      /* what was actually handed over, kept here rather than read back out of the renderer: MapLibre 5 does
         not expose a GeoJSON source's data, and a reader that guessed at its internals reported "0 features"
         while the screen was full of aircraft. */
      /* (#R183) `lifted` used to be "features that are off the ground", which was the same thing as
         "aircraft in the air" only while one aircraft was exactly one feature — it stopped being that
         the moment the body became several, and counting features then reported a multiple of the
         real number (#R181: suspect what a counter counts). Aircraft are counted by the ONE solid
         that is the aeroplane, and the raw feature total is kept under its own name.
         (#R190) With the original silhouette back there is exactly one such feature per aircraft
         again — `part:'body'` — but the counters keep asking for it by name rather than assuming it,
         because that assumption is precisely what broke here twice. */
      const bodies=feats.filter(f=>!f.properties.post&&f.properties.part==='body');
      /* maxAlt is THE AIRCRAFT'S ALTITUDE and is read off `acAlt`, never off a part's extrusion base:
         #R183/#R185's parts were deliberately offset ABOVE the aircraft, so a max over the features'
         `alt` returned the base of the tallest TAIL FIN — at z9 that is +0.19 × half, about 485 m, so
         a jet at 36,000 ft reported 11,458 m instead of 10,973 m. Caught by tests/r172, r173 and
         r174, all three of which are really the same assertion. */
      _planes3DStats={ features:feats.length, aircraft:bodies.length,
        lifted:bodies.filter(f=>(+f.properties.acAlt||0)>0).length,
        maxAlt:Math.round(bodies.reduce((m2,f)=>Math.max(m2,+f.properties.acAlt||0),0)),
        /* (#R192) the mark's size AS DRAWN, in screen pixels, beside the size the flat glyph draws at
           the same zoom. Two numbers that must be the same number — this is the contract four rounds
           of 「同じデザインに」 have been about, and it is the one thing nobody had measured. */
        halfPx:+(half/mpp).toFixed(2), glyphHalfPx:+iconHalfPx.toFixed(2), thickPx:+(thick/mpp).toFixed(2),
        offsetM:Math.round(_groundOffset()) };   /* the centre reading, for the readout only — the drawing uses one per aircraft */
    }
    function planes3DOn(){ return planes3D; }
    function setPlanes3D(v){ planes3D=!!v; try{ localStorage.setItem(PLANES3D_KEY,planes3D?'1':'0'); }catch(_){}
      try{ const on=GE().layers.get('lyr-planes')&&GE().layers.getLayout('lyr-planes','visibility')==='visible';
        const on3=GE().layers.get(PLANE3D_LYR)&&GE().layers.getLayout(PLANE3D_LYR,'visibility')==='visible';
        if(on||on3) applyPlanesMode(true); }catch(_){}
      return planes3D; }
    /* One representation at a time — the flat glyph and the lifted body are the same aircraft. */
    function applyPlanesMode(visible){
      try{ if(GE().layers.has('lyr-planes')) GE().layers.setLayout('lyr-planes','visibility',(visible&&!planes3D)?'visible':'none');
        if(GE().layers.has(PLANE3D_LYR)) GE().layers.setLayout(PLANE3D_LYR,'visibility',(visible&&planes3D)?'visible':'none');
        if(GE().layers.has(PLANE3D_POST)) GE().layers.setLayout(PLANE3D_POST,'visibility',(visible&&planes3D)?'visible':'none');
      }catch(_){}
      if(!visible) selectPlane(null);            /* (#R173) the layer went off — the track goes with it */
      else drawTrack(selectedPlane);             /* …and it follows the flat/3-D switch */
      if(visible&&planes3D) refreshTrafficLayer('planes');
    }
    function refreshTrafficLayer(id){
      if(!GE().hasRenderer()) return;
      const filt=trafficFilters[id];
      if(!GE().layers.hasSource('src-'+id)) return;
      const data=id==='planes'?planesData:shipsData;
      const filtered=filt==='all'?data:data.filter(d=>d.type===filt);
      if(id==='planes') refreshPlanes3D(filtered);   /* (#R172) the lifted bodies ride the same filter */
      const features=filtered.map(d=>{
        const props = id==='planes'
          ? { type:d.type, sel:(d.icao24&&d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'', acType:d.acType||'', desc:d.desc||'',
              baroAlt:(d.baroAlt!=null?d.baroAlt:null), geoAlt:(d.geoAlt!=null?d.geoAlt:null),
              vel:(d.vel!=null?d.vel:null), heading:(d.heading!=null?d.heading:0), vrate:(d.vrate!=null?d.vrate:null),
              squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||d.tpos||0), category:(d.category!=null?d.category:null) }
          : { type:d.type, name:d.name||'', callsign:d.callsign||'', mmsi:(d.mmsi!=null?d.mmsi:null),
              vel:(d.speed!=null?d.speed:null), cog:(d.cog!=null?d.cog:null), heading:(d.heading!=null?d.heading:0),
              navStatus:(d.navStatus!=null?d.navStatus:null), shipType:(d.shipType!=null?d.shipType:null),
              dest:d.dest||'', draught:(d.draught!=null?d.draught:null), imo:(d.imo!=null?d.imo:null), t:(d.t||0) };
        return { type:'Feature', geometry:{type:'Point',coordinates:[d.lng,d.lat]}, properties:props };
      });
      GE().layers.setSourceData('src-'+id,{type:'FeatureCollection',features});
    }
    /* Plane glyphs (top-view silhouette) generated on a canvas, one per class, so we can color +
       rotate them by heading. Pointing "up" = heading 0; MapLibre icon-rotate is clockwise-from-north. */
    /* ══ (#R187) BACK TO THE FIRST DESIGN ═══════════════════════════════════════════════════════════
       「航空機のマークは最初のデザインに戻して。」

       #R183 answered 「飛行機アイコンはもっと目立つものに」 by replacing this glyph — a real airliner
       plan-form, a white rim, a drop shadow, a larger size ramp — and #R185 carried the same treatment
       into the lifted 3-D body. The verdict on all of it is in: the FIRST design is the wanted one.

       `_PLANE_ORIG` (declared far above, next to _PLANE_OUTLINE — see the TDZ warning there) is the
       outline this app shipped with, taken verbatim from the original implementation (identical from
       the first commit through #R164, replaced in #R183). So are the canvas size (44), the colours,
       the 1.6-px white stroke, and the size ramp restored at the layer. There is no shadow, no rim,
       no halo: a flat fill and a thin white line, which is what was asked for.
       (#R190) …and the LIFTED body draws the same outline now, so the mark no longer depends on the
       toggle: 「at real altitude中も昔のもの」. `planes3D` is default ON again for that reason —
       #R187's OFF existed only because the two renderings disagreed.

       ⚠ The ONE thing not reverted is the raster resolution. #R183 found `addImage` being handed a
       44-px bitmap with no `pixelRatio`, so MapLibre treated 44 canvas pixels as 44 CSS pixels and the
       GPU upscaled it on every HiDPI screen. That is a defect, not a design: drawing the same 44-unit
       artwork at devicePixelRatio and declaring it produces the SAME on-screen size, just not blurred.
       Reverting it would restore a bug rather than an appearance. */
    /* ══ ⚠ (#R246) THE TWO AIRCRAFT COLOURS AND THE OUTLINE, EACH WRITTEN ONCE ═══════════════════
       「Live aircraft trafficで航空機の色は以下に。民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040
         両方とも：より太いアウトライン」
       Both constants are read by the flat glyph AND by the two fill-extrusion cases below, so the
       2-D mark and the 3-D body cannot disagree (they did in #R173, which is why _feHex exists).
       ⚠ The military red is deliberately NOT the app's --info-mil #ff3b30 any more: beside cyan the
       warmer, more saturated #FF3040 is what separates the two at a glance, which is the point of
       having two colours at all. ⚠ And the outline is a CONSTANT rather than a number typed into
       the one place that strokes: 1.6 → 2.6 units of the 44-unit artwork, drawn at devicePixelRatio
       like the rest of the glyph (see the note above), so it thickens on every screen equally. */
    function ensurePlaneIcons(){
      if(!GE().hasRenderer()) return;
      const dpr=Math.max(1,Math.min(3,Math.round(window.devicePixelRatio||1)));
      const make=(color)=>{
        const s=44, cv=document.createElement('canvas'); cv.width=s*dpr; cv.height=s*dpr;
        const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr); ctx.translate(s/2,s/2);
        ctx.fillStyle=color; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=PLANE_STROKE; ctx.lineJoin='round';
        ctx.beginPath(); _PLANE_ORIG.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath();
        ctx.fill(); ctx.stroke();
        return { data:ctx.getImageData(0,0,s*dpr,s*dpr), pixelRatio:dpr };
      };
      const add=(id,color)=>{ try{ if(!GE().scene.hasImage(id)){ const m=make(color); GE().scene.addImage(id,m.data,{pixelRatio:m.pixelRatio}); } }catch(_){} };
      add('plane-civ',PLANE_CIV);
      add('plane-mil',PLANE_MIL);
      add('plane-sel','#ffd23f');   /* (#R173) the clicked aircraft */
    }
    function fmtClock(ms){ try{ return new Date(ms).toLocaleTimeString(window.IntMapLang.locale(HOST.lang)); }catch(_){ return ''; } }
    function agoStr(sec){ if(!sec) return ''; const s=Math.max(0,Math.round(Date.now()/1000-sec));
      const U=HOST.lang==='jp'?['秒前','分前','時間前']:HOST.lang==='de'?['s her','min her','h her']:HOST.lang==='ru'?['с назад','мин назад','ч назад']:HOST.lang==='es'?['s atrás','min atrás','h atrás']:['s ago','m ago','h ago'];
      const sep=window.IntMapLang.t(HOST.lang,' ','');
      if(s<60) return s+sep+U[0]; if(s<3600) return Math.floor(s/60)+sep+U[1]; return Math.floor(s/3600)+sep+U[2]; }
    function trafficTooltipHTML(id,p){
      const jp=HOST.lang==='jp';
      const row=(label,val)=>val!==''&&val!=null?`<div style="font-size:11px;margin-top:2px;"><span style="color:var(--text-muted);">${label}:</span> ${val}</div>`:'';
      const typeChip=`<div style="font-size:11px;margin-top:4px;color:${p.type==='military'?'var(--info-mil)':'var(--info-energy)'};font-weight:600;">${p.type==='military'?(window.IntMapLang.t(HOST.lang,'Military','軍用','Militär','Военное','Militar')):(window.IntMapLang.t(HOST.lang,'Civilian','民間','Zivil','Гражданское','Civil'))}</div>`;
      if(id==='ships'){
        const nm=escapeHtml(p.name||'')||('MMSI '+(p.mmsi||'—'));
        const spd=p.vel!=null?(Math.round(p.vel*10)/10)+' kn'+(p.vel?` · ${Math.round(p.vel*1.852)} km/h`:''):'';
        return `<div style="font-weight:700;font-size:13px;">🚢 ${nm}</div>`+
          row(window.IntMapLang.t(HOST.lang,'Type','種別','Typ','Тип','Tipo'),shipTypeLabel(p.shipType))+
          row('MMSI',p.mmsi)+
          row(window.IntMapLang.t(HOST.lang,'Call sign','呼出符号','Rufzeichen','Позывной','Indicativo'),escapeHtml(p.callsign||''))+
          (p.imo?row('IMO',p.imo):'')+
          row(window.IntMapLang.t(HOST.lang,'Speed','速力','Geschwindigkeit','Скорость','Velocidad'),spd)+
          row(window.IntMapLang.t(HOST.lang,'Course','針路(COG)','Kurs (COG)','Курс (COG)','Rumbo (COG)'),p.cog!=null?Math.round(p.cog)+'°':'')+
          row(window.IntMapLang.t(HOST.lang,'Heading','船首方位','Steuerkurs','Курс носа','Proa'),p.heading!=null?Math.round(p.heading)+'°':'')+
          row(window.IntMapLang.t(HOST.lang,'Status','状態','Status','Состояние','Estado'),navStatusLabel(p.navStatus))+
          row(window.IntMapLang.t(HOST.lang,'Draught','喫水','Tiefgang','Осадка','Calado'),p.draught?p.draught+' m':'')+
          row(window.IntMapLang.t(HOST.lang,'Destination','仕向地','Ziel','Пункт назначения','Destino'),escapeHtml(p.dest||''))+
          typeChip+
          `<div style="font-size:10px;color:var(--text-muted);margin-top:5px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;">${(window.IntMapLang.t(HOST.lang,'Last seen','最終受信','Zuletzt empfangen','Последний приём','Última recepción'))+' '+agoStr(Math.floor((p.t||0)/1000))}<br>aisstream.io · AIS</div>`;
      }
      /* planes — every available ADS-B field (airplanes.live) */
      const baroFt=p.baroAlt!=null?` (${Math.round(p.baroAlt*3.281)} ft)`:'';
      const velKmh=p.vel!=null?` · ${Math.round(p.vel*3.6)} km/h · ${Math.round(p.vel*1.944)} kn`:'';
      const vr=p.vrate!=null&&Math.abs(p.vrate)>=0.3?`${p.vrate>0?'▲':'▼'} ${Math.abs(p.vrate).toFixed(1)} m/s`:(p.vrate!=null?(window.IntMapLang.t(HOST.lang,'level','水平飛行','Reiseflug','горизонтальный полёт','nivelado')):'');
      const acName=p.desc||p.acType||'';
      return `<div style="font-weight:700;font-size:13px;">✈️ ${p.callsign||p.reg||p.icao24||'—'}</div>`+
        row(window.IntMapLang.t(HOST.lang,'Aircraft','機体','Luftfahrzeug','Воздушное судно','Aeronave'),acName)+
        row(window.IntMapLang.t(HOST.lang,'Reg.','登録記号','Kennzeichen','Рег. номер','Matrícula'),p.reg)+
        row('ICAO24',p.icao24?p.icao24.toUpperCase():'')+
        row(window.IntMapLang.t(HOST.lang,'Altitude','高度(気圧)','Höhe (baro)','Высота (баро)','Altitud (baro)'),p.onGround?(window.IntMapLang.t(HOST.lang,'on ground','地上','am Boden','на земле','en tierra')):(p.baroAlt!=null?Math.round(p.baroAlt)+' m'+baroFt:''))+
        row(window.IntMapLang.t(HOST.lang,'Geo alt','高度(GPS)','Höhe (GPS)','Высота (GPS)','Altitud (GPS)'),p.geoAlt!=null?Math.round(p.geoAlt)+' m':'')+
        row(window.IntMapLang.t(HOST.lang,'Speed','対地速度','Geschwindigkeit','Путевая скорость','Velocidad'),p.vel!=null?Math.round(p.vel)+' m/s'+velKmh:'')+
        row(window.IntMapLang.t(HOST.lang,'Track','針路','Kurs über Grund','Путевой угол','Derrota'),p.heading!=null?Math.round(p.heading)+'°':'')+
        row(window.IntMapLang.t(HOST.lang,'Vert. rate','昇降率','Steig-/Sinkrate','Верт. скорость','Régimen vertical'),vr)+
        row(window.IntMapLang.t(HOST.lang,'Squawk','スコーク','Squawk','Сквок','Squawk'),p.squawk)+
        typeChip+
        /* (#R173) what a click will draw, and how much of it there is. Named "observed" because that is
           exactly what it is — the fixes this browser has received, not a history we do not have. */
        (()=>{ const k=p.icao24||''; const st=trackStats(k);
          const en=`Observed track: ${st.fixes} fixes · ${st.minutes} min`;
          const ja=`観測した軌跡: ${st.fixes}点 · ${st.minutes}分`;
          const de=`Beobachtete Spur: ${st.fixes} Punkte · ${st.minutes} min`;
          const ru=`Наблюдаемый трек: ${st.fixes} точек · ${st.minutes} мин`;
          const es=`Traza observada: ${st.fixes} puntos · ${st.minutes} min`;
          const lbl=HOST.lang==='jp'?ja:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
          const tip=k===selectedPlane
            ? (window.IntMapLang.t(HOST.lang,'Click to hide','クリックで軌跡を消す','Klicken zum Ausblenden','Нажмите, чтобы скрыть','Clic para ocultar'))
            : (window.IntMapLang.t(HOST.lang,'Click to show','クリックで軌跡を表示','Klicken für die Spur','Нажмите, чтобы показать','Clic para mostrar'));
          return st.fixes>=2?`<div style="font-size:11px;margin-top:3px;color:#ffd23f;">${lbl} — ${tip}</div>`:''; })()+
        `<div style="font-size:10px;color:var(--text-muted);margin-top:5px;border-top:1px solid rgba(128,128,128,0.18);padding-top:4px;">${planesSynthetic?(window.IntMapLang.t(HOST.lang,'Simulated placeholder (live feed unavailable)','※デモ用合成データ（実データ取得不可）','Simulierte Platzhalterdaten (kein Live-Feed)','Демонстрационные данные (живой поток недоступен)','Datos simulados de muestra (sin flujo en vivo)')):(window.IntMapLang.t(HOST.lang,'Last seen','最終受信','Zuletzt empfangen','Последний приём','Última recepción'))+' '+agoStr(p.lastContact)+' · '+fmtClock(planesTime)}<br>airplanes.live · ADS-B</div>`;
    }
    function setupTrafficLayer(id){
      if(GE().layers.hasSource('src-'+id)) return;
      GE().layers.addSource('src-'+id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(id==='planes'){
        ensurePlaneIcons();
        /* Aircraft = a real plane glyph rotated to its track (not a dot). */
        GE().layers.add({id:'lyr-planes',type:'symbol',source:'src-planes',layout:{
          visibility:'none',
          'icon-image':['case',['==',['get','sel'],1],'plane-sel',['match',['get','type'],'military','plane-mil','plane-civ']],
          'icon-size':_planeIconSizeExpr(),   /* (#R187) the original ramp — (#R192) stated once, in _PLANE_SIZE */
          'icon-rotate':['coalesce',['get','heading'],0],
          'icon-rotation-alignment':'map',
          'icon-allow-overlap':true,
          'icon-ignore-placement':true
        },paint:{'icon-opacity':opacities.planes}},beforeId);
        /* (#R172) the same aircraft, standing at their reported altitude. Two layers off one source: the
           post first so the body always draws over it. */
        if(!GE().layers.hasSource(PLANE3D_SRC)) GE().layers.addSource(PLANE3D_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(PLANE3D_POST)) GE().layers.add({id:PLANE3D_POST,type:'fill-extrusion',source:PLANE3D_SRC,
          filter:['==',['get','post'],1], layout:{visibility:'none'},
          paint:{ 'fill-extrusion-color':_feRamp(d=>['match',['get','type'],'military',_feHex(PLANE_MIL,d),_feHex(PLANE_CIV,d)]),
            'fill-extrusion-opacity':Math.min(0.5,opacities.planes*0.5),
            'fill-extrusion-base':['get','alt'], 'fill-extrusion-height':['get','top'] }},beforeId);
        if(!GE().layers.has(PLANE3D_LYR)) GE().layers.add({id:PLANE3D_LYR,type:'fill-extrusion',source:PLANE3D_SRC,
          filter:['!=',['get','post'],1], layout:{visibility:'none'},
          paint:{ /* (#R173) the selected aircraft is the one whose track is drawn — say so in its colour.
                     (#R190) the rim/halo cases went with the plates — the mark is the original one.
                     (#R191) …and the original mark's own white stroke came back with it (see
                     _PLANE_RIM), so `part:'rim'` is a case again — but it is the 0.8-unit outset of
                     ensurePlaneIcons' stroke, not #R185's whole-plan-form plate, and there is still
                     no halo. Every colour goes through _feHex so the extrusion renders the glyph's
                     colour rather than the shader's idea of it. */
            'fill-extrusion-color':_feRamp(d=>['case',
              ['==',['get','part'],'rim'],_feHex('#ffffff',d),
              ['==',['get','sel'],1],_feHex('#ffd23f',d),['match',['get','type'],'military',_feHex(PLANE_MIL,d),_feHex(PLANE_CIV,d)]]),
            'fill-extrusion-opacity':opacities.planes,
            'fill-extrusion-base':['get','alt'], 'fill-extrusion-height':['get','top'] }},beforeId);
        /* (#R173) the clicked aircraft's observed track — a flat line on the ground, and the same fixes as
           altitude ribbons for the 3-D representation. One source feeds both; only one is ever visible. */
        if(!GE().layers.hasSource(TRACK_SRC)) GE().layers.addSource(TRACK_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(TRACK_LINE)) GE().layers.add({id:TRACK_LINE,type:'line',source:TRACK_SRC,
          filter:['==',['get','kind'],'line'], layout:{visibility:'none','line-cap':'round','line-join':'round'},
          paint:{'line-color':'#ffd23f','line-width':['interpolate',['linear'],['zoom'],4,1.4,10,2.6],'line-opacity':0.95}},beforeId);
        if(!GE().layers.has(TRACK_3D)) GE().layers.add({id:TRACK_3D,type:'fill-extrusion',source:TRACK_SRC,
          filter:['==',['get','kind'],'leg'], layout:{visibility:'none'},
          paint:{'fill-extrusion-color':'#ffd23f','fill-extrusion-opacity':0.75,
            'fill-extrusion-base':['get','alt'],'fill-extrusion-height':['get','top']}},beforeId);
        /* the glyph's on-screen size is derived from the zoom, so rebuild the geometry when it changes */
        if(!_planes3DZoom){ _planes3DZoom=()=>{ if(!planes3D) return;
          if(!(GE().layers.has(PLANE3D_LYR)&&GE().layers.getLayout(PLANE3D_LYR,'visibility')==='visible')) return;
          /* (#R174) the TRACK's ribbons are sized from the scale too (see drawTrack), and only the glyphs
             were being rebuilt — a track drawn at z8 kept its kilometre-wide legs all the way in. */
          clearTimeout(_planes3DZoomT); _planes3DZoomT=setTimeout(()=>{ try{ refreshTrafficLayer('planes'); }catch(_){}
            try{ if(selectedPlane) drawTrack(selectedPlane); }catch(_){} },160); };
          GE().events.on('zoomend',_planes3DZoom); GE().events.on('terrain',_planes3DZoom); }
      } else {
        ensureShipIcons();
        /* Ships = a ship glyph rotated to heading/COG (real AIS). */
        GE().layers.add({id:'lyr-ships',type:'symbol',source:'src-ships',layout:{
          visibility:'none',
          'icon-image':['match',['get','type'],'military','ship-mil','ship-civ'],
          'icon-size':['interpolate',['linear'],['zoom'],4,0.5,8,0.72,12,0.95],
          'icon-rotate':['coalesce',['get','heading'],0],
          'icon-rotation-alignment':'map',
          'icon-allow-overlap':true,'icon-ignore-placement':true
        },paint:{'icon-opacity':opacities.ships}},beforeId);
      }
      /* Hover tooltip via shared map-tooltip — shows every available field + data freshness. */
      GE().events.onLayer('mouseenter','lyr-'+id,(e)=>{ if(!e.features.length)return; GE().render.canvas().style.cursor='pointer'; const f=e.features[0]; const el=ensureMapTooltip(); el.style.display='block'; el.innerHTML=trafficTooltipHTML(id,f.properties); positionTooltip(GE().coords.project(f.geometry.coordinates)); });
      GE().events.onLayer('mousemove','lyr-'+id,(e)=>{ positionTooltip(e.point); });
      GE().events.onLayer('mouseleave','lyr-'+id,()=>{ GE().render.canvas().style.cursor=''; if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
      /* (#R172) the lifted bodies answer the same hover — the aircraft is the same aircraft whichever way
         it is drawn, so the tooltip is the identical one (it is fed from the same ADS-B properties).
         (#R173) …and the same CLICK. Both representations, and the post under a lifted aircraft, select it
         and draw its track; clicking the map anywhere else clears the selection. */
      if(id==='planes'){
        [PLANE3D_LYR,PLANE3D_POST].forEach(ly=>{
          GE().events.onLayer('mouseenter',ly,(e)=>{ if(!e.features.length)return; GE().render.canvas().style.cursor='pointer';
            const f=e.features[0]; const el=ensureMapTooltip(); el.style.display='block'; el.innerHTML=trafficTooltipHTML('planes',f.properties); positionTooltip(e.point); });
          GE().events.onLayer('mousemove',ly,(e)=>{ positionTooltip(e.point); });
          GE().events.onLayer('mouseleave',ly,()=>{ GE().render.canvas().style.cursor=''; if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; });
        });

        /* The pick above, wired to the pointer: hovering a lifted aircraft shows the same tooltip and
           clicking it selects it, wherever on screen it is drawn. A click that hits neither the pick nor
           the footprint clears the selection — asked of the renderer rather than of a flag set by the layer
           handlers, so it does not depend on which listener MapLibre calls first. */
        if(!_planesHover){ _planesHover=(e)=>{
          if(!planes3D||!(GE().layers.has(PLANE3D_LYR)&&GE().layers.getLayout(PLANE3D_LYR,'visibility')==='visible')) return;
          /* one pick per frame at most: a pointer emits far more moves than the screen has frames, and the
             pick walks every aircraft in the viewport (hundreds over a busy sky). */
          const _t=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
          if(_t-_pickAt<16) return; _pickAt=_t;
          const d=pickPlane(e.point);
          if(d){ GE().render.canvas().style.cursor='pointer'; const el=ensureMapTooltip(); el.style.display='block';
            el.innerHTML=trafficTooltipHTML('planes',{ type:d.type, sel:(d.icao24===selectedPlane)?1:0, callsign:d.callsign||'', icao24:d.icao24||'', reg:d.reg||'',
              acType:d.acType||'', desc:d.desc||'', baroAlt:d.baroAlt, geoAlt:d.geoAlt, vel:d.vel, heading:d.heading,
              vrate:d.vrate, squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0) });
            positionTooltip(e.point); _pickHover=true; }
          else if(_pickHover){ _pickHover=false; GE().render.canvas().style.cursor='';
            try{ if(GE().coords.queryRenderedFeatures(e.point,{layers:[PLANE3D_LYR,PLANE3D_POST].filter(l=>GE().layers.get(l))}).length) return; }catch(_){}
            if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; }
        }; GE().events.on('mousemove',_planesHover); }
        /* ONE click handler, deliberately. It began as two — a layer-scoped one for the renderer's own
           footprint hit and a map-level one for the pick — and each of them TOGGLED, so a click that
           satisfied both selected the aircraft and immediately deselected it. Caught on production with
           41 real aircraft: the pick found the aeroplane, the click reported nothing selected. One
           handler, one decision: the pick first (that is where the aeroplane is drawn), then the
           renderer's footprint (the post and the flat glyph are real things to click at), else clear. */
        /* (#R174) 「Live air traffic でズームインすると、軌跡が消える」 — REPRODUCED, and it was this handler.
           Double-click IS how you zoom in on a map, and MapLibre delivers a double-click as two ordinary
           `click` events before its own `dblclick`. Both of them landed here, found no aircraft under the
           pointer, and cleared the selection — so the track vanished the instant the zoom began. Measured
           against a stubbed feed: wheel zoom z11 → z12.9 kept the selection and its 6 legs; one
           double-click at the same spot left `selected: null, legs: 0`.
           Two guards, and neither of them touches the zoom gesture:
             · the SECOND click of a double-click (originalEvent.detail ≥ 2) is ignored outright — it would
               otherwise also toggle OFF an aircraft that the first click had just selected;
             · clearing is DEFERRED past MapLibre's double-click window and cancelled by `dblclick`, so a
               click on empty map still deselects, one frame later than before.
           Selecting stays instantaneous: a click that actually hits an aeroplane is never deferred. */
        if(!_planesDbl){ _planesDbl=()=>{ if(_planesClearT){ clearTimeout(_planesClearT); _planesClearT=null; } };
          GE().events.on('dblclick',_planesDbl); }
        if(!_planesClear){ _planesClear=(e)=>{
          try{ if(e&&e.originalEvent&&(e.originalEvent.detail|0)>=2) return; }catch(_){}
          let d=pickPlane(e.point), props=null;
          if(!d){ try{ const ls=['lyr-planes',PLANE3D_LYR,PLANE3D_POST].filter(l=>GE().layers.get(l));
              const f=ls.length?GE().coords.queryRenderedFeatures(e.point,{layers:ls}):[];
              if(f&&f.length){ props=f[0].properties||{}; d=planesData.find(x=>x.icao24===(props.icao24||''))||null; } }catch(_){} }
          if(d&&d.icao24){
            try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){}   /* (#R210) this tap belongs to the aircraft, not to the city name under it */
            if(_planesClearT){ clearTimeout(_planesClearT); _planesClearT=null; }
            selectPlane(d.icao24===selectedPlane?null:d.icao24);
            /* (#R175) a click now opens the DETAIL CARD — the airframe's own photograph, every ADS-B field
               the feed carries, and "fly from these conditions". The pinned tooltip stays as the fallback
               for the case where js/aircraft-detail.js did not load, so the click never becomes a no-op;
               when the card does open it takes the tooltip's place rather than sitting on top of it. */
            if(selectedPlane){
              if(openPlaneCard(d)){ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; }
              else { const el=ensureMapTooltip(); el.style.display='block';
                el.innerHTML=trafficTooltipHTML('planes',props||{ type:d.type, sel:1, callsign:d.callsign||'', icao24:d.icao24||'',
                  reg:d.reg||'', acType:d.acType||'', desc:d.desc||'', baroAlt:d.baroAlt, geoAlt:d.geoAlt, vel:d.vel,
                  heading:d.heading, vrate:d.vrate, squawk:d.squawk||'', onGround:!!d.onGround, lastContact:(d.lastContact||0) });
                positionTooltip(e.point); } }
            return; }
          if(selectedPlane&&!_planesClearT) _planesClearT=setTimeout(()=>{ _planesClearT=null; if(selectedPlane) selectPlane(null); },320);
        }; GE().events.on('click',_planesClear); }
      }
    }
    function startTraffic(id){
      setupTrafficLayer(id);
      setVis('lyr-'+id,true);
      if(id==='planes'){
        applyPlanesMode(true);   /* (#R172) flat glyphs OR lifted bodies — never both */
        /* (#R186) a self-re-arming TIMEOUT, not an interval: one sweep is now several requests over a
           second or two, and the gap to the next one is chosen from how big that sweep was
           (planePollMs). An interval would keep firing at a fixed rate while a wide sweep was still
           running. The non-null value is also what schedulePlanePoll reads as "the layer is on". */
        if(planesTimer){ clearInterval(planesTimer); clearTimeout(planesTimer); }
        planesTimer=setTimeout(()=>{ if(planesLayerOn()) fetchPlanes(); else planesTimer=null; },20000);
        fetchPlanes();
        /* follow the viewport: refetch real aircraft for wherever the user pans/zooms */
        /* ⚠ (#R186) The minimum gap between two view-driven sweeps is HOW LONG THE SWEEP TAKES — the
           number of circles times their spacing — and NOT a fraction of the poll interval. The first
           version used planePollMs()/4, which is 5 s even for a ONE-circle sweep whose floor is 20 s
           for a quite different reason; that quietly tripled the close-in refetch gap from the 1.5 s
           it had always been, and tests/r174 caught it exactly (a track that accumulated 2 legs over
           five moveends instead of 5). One circle is 1.5 s, as before; sixteen circles is 19 s, which
           is the time those sixteen requests actually occupy. */
        if(!_planesMove){ _planesMove=()=>{ if(planesLayerOn()){
            try{ refreshTrafficLayer('planes'); }catch(_){}   /* (#R186) re-draw from what we already hold: the 3-D cull is viewport-shaped when the sky is very busy, and the per-aircraft ground offset follows the view */
            updatePlanesZoomHint();                           /* (#R191) a PAN changes the required coverage too, not just a zoom */
            clearTimeout(_planesMoveT); _planesMoveT=setTimeout(()=>{
              const sweepMs=Math.max(1500,(((_planeCover&&_planeCover.circles)||1)*PLANE_GAP_MS));
              if(Date.now()-_lastPlaneFetch>sweepMs) fetchPlanes(); },700); } }; GE().events.on('moveend',_planesMove); GE().events.on('zoom',updatePlanesZoomHint); }
        updatePlanesZoomHint();
      } else {
        startShips();
        /* viewport-follow: reconnect AIS for wherever the user pans (when zoomed in enough) */
        if(!_aisMove){ _aisMove=()=>{ if(GE().layers.has('lyr-ships')&&GE().layers.getLayout('lyr-ships','visibility')==='visible'){ updateShipsZoomHint(); if(aisKey&&GE().camera.getZoom()>=SHIPS_MIN_ZOOM){ clearTimeout(_aisMoveT); _aisMoveT=setTimeout(connectAIS,1500); } else { stopAIS(); shipsByMMSI={}; shipsData=[]; refreshTrafficLayer('ships'); } } }; GE().events.on('moveend',_aisMove); GE().events.on('zoom',updateShipsZoomHint); }
        updateShipsZoomHint();
      }
    }
    function stopTraffic(id){
      setVis('lyr-'+id,false);
      if(id==='planes'){ applyPlanesMode(false); if(planesTimer){ clearInterval(planesTimer); clearTimeout(planesTimer); planesTimer=null; } _planeSweep++; updatePlanesZoomHint(); }   /* (#R186) bump the token so an in-flight sweep cannot publish into a layer that is now off */
      if(id==='ships'){ if(shipsTimer){ clearInterval(shipsTimer); shipsTimer=null; } stopAIS(); updateShipsZoomHint(); }
    }
    /* === (#R184) LIVE SATELLITES ============================================================
       Three thin functions, because js/satellites-live.js owns the feed, the SGP4 propagation, its
       own one-second timer, its hover/click handlers and its own layers. This file's whole job for
       this layer is the same as for the traffic layers: turn it on, turn it off, give it a legend
       and route the opacity slider. Nothing about orbits lives here. */
    let _satCountT=null;
    function _satLegendCount(){
      const el=document.getElementById('data-legend-sats'); if(!el) return;
      const box=el.querySelector('.gl-satcount'); if(!box) return;
      let s=null; try{ s=window.IntMapSatellites&&window.IntMapSatellites.state(); }catch(_){}
      if(!s){ box.textContent=''; return; }
      const jp=HOST.lang==='jp';
      if(s.loading){ box.textContent=jp?'カタログを取得中…':window.IntMapLang.t(HOST.lang,'Loading the catalog…',undefined,'Katalog wird geladen…','Загрузка каталога…','Cargando el catálogo…'); return; }
      if(s.err&&!s.catalogue){ box.textContent=(window.IntMapLang.t(HOST.lang,'Could not load: ','取得できませんでした: ','Konnte nicht geladen werden: ','Не удалось загрузить: ','No se pudo cargar: '))+s.err; return; }
      /* Two numbers, because they answer two different questions and conflating them would hide the
         filter: how many objects are being propagated, and how many are being drawn right now. */
      const drawn=s.drawn, total=s.catalogue;
      box.textContent = jp ? (drawn.toLocaleString('ja-JP')+' / '+total.toLocaleString('ja-JP')+' 機を表示中'+(s.sunlit?('・'+s.sunlit+' 機が太陽光下'):''))
        : (drawn.toLocaleString()+' / '+total.toLocaleString()+' shown'+(s.sunlit?(' · '+s.sunlit+' sunlit'):''));
    }
    function startSats(){
      const A=window.IntMapSatellites;
      if(!A){ try{ satToast(window.IntMapLang.t(HOST.lang,'The satellite layer is unavailable','人工衛星レイヤーを読み込めませんでした','Satellitenebene nicht verfügbar','Слой спутников недоступен','La capa de satélites no está disponible')); }catch(_){}
        const cb=document.getElementById('dl-sats'); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); } return; }
      whenStyleReady().then(()=>{ try{ A.setOpacity(opacities.sats); A.start(); }catch(e){ console.warn('sats start fail',e); } });
      if(_satCountT) clearInterval(_satCountT);
      _satCountT=setInterval(_satLegendCount,1000); _satLegendCount();
    }
    function stopSats(){
      try{ window.IntMapSatellites&&window.IntMapSatellites.stop(); }catch(_){}
      if(_satCountT){ clearInterval(_satCountT); _satCountT=null; }
    }
    /* === EEZ via MarineRegions WMS === */
    /* (#R79g) The MarineRegions default style colours each boundary TYPE (200 NM / 12 NM / treaty / median /
       court / joint / unilateral / disputed / baselines / connection) but in DIM near-black tones that were
       unreadable over the ocean. The fix is NOT to flatten them to one colour (that destroyed the whole point
       of the layer) — it is to recolour EACH type to a BRIGHT, distinct line via an inline SLD (filter on the
       `line_type` attribute; verified against the live WMS). This same table drives the legend below, so the
       swatches always match exactly. Dash patterns are kept so baseline/unsettled variants stay distinguishable. */
    const EEZ_STYLE=[
      ['200 NM','#39FF6A',1.8,''],['12 NM','#12E3D6',1.8,''],['Treaty','#4D8BFF',1.8,''],
      ['Median line','#B6FF3A',1.7,''],['Court ruling','#FFC21A',1.8,''],['Joint regime','#FF9E3D',1.8,''],
      ['Unilateral claim (undisputed)','#E64DFF',1.8,''],
      ['Unsettled (maritime)','#FF4D4D',1.9,'10 5'],['Unsettled (land)','#FF4D4D',1.9,'3 3'],
      ['Unsettled median line (maritime)','#FF7A3D',1.9,'10 5'],['Unsettled median line (land)','#FF7A3D',1.9,'3 3'],
      ['Straight baseline','#B9C4CE',1.5,''],['Normal baseline (official)','#E6ECF2',1.5,'9 5'],
      ['Archipelagic baseline','#E6ECF2',1.5,'1 5'],['Connection line','#C8D0D8',1.1,'']
    ];
    function addEEZ(){
      if(GE().layers.hasSource('src-eez')) return;
      const _x=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rules=EEZ_STYLE.map(r=>'<Rule><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>line_type</ogc:PropertyName><ogc:Literal>'+_x(r[0])+'</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter><LineSymbolizer><Stroke><CssParameter name="stroke">'+r[1]+'</CssParameter><CssParameter name="stroke-width">'+r[2]+'</CssParameter><CssParameter name="stroke-opacity">1</CssParameter>'+(r[3]?('<CssParameter name="stroke-dasharray">'+r[3]+'</CssParameter>'):'')+'</Stroke></LineSymbolizer></Rule>').join('');
      const sld='<?xml version="1.0" encoding="UTF-8"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>eez_boundaries</Name><UserStyle><FeatureTypeStyle>'+rules+'</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';
      const wms='https://geo.vliz.be/geoserver/MarineRegions/wms?service=WMS&version=1.1.1&request=GetMap&layers=eez_boundaries&SLD_BODY='+encodeURIComponent(sld)+'&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&format=image/png&transparent=true';
      GE().layers.addSource('src-eez',{type:'raster',tiles:[wms],tileSize:256});
      GE().layers.add({id:'lyr-eez',type:'raster',source:'src-eez',layout:{visibility:'none'},paint:{'raster-opacity':opacities.eez}},beforeId);
    }
    /* === Submarine cables (#36) — TeleGeography "Submarine Cable Map" open data ===
       Their public API serves all cable routes + landing points as GeoJSON; each cable
       carries its own color. Loaded lazily with the same CORS-proxy fallbacks used elsewhere. */
    let _subcablesLoading=false;
    /* ══ (#R188) WHY IT WAS ALWAYS THE CABLES THAT WENT MISSING ════════════════════════════════════
       「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

       #R187 found a real defect (a refused addSource that was logged and abandoned) and fixed it. The
       report came back, so the asymmetry between the two default layers was measured from the page's
       own origin instead of reasoned about:

           fetch('https://www.submarinecablemap.com/api/v3/cable/cable-geo.json')
               → TypeError: Failed to fetch          (no Access-Control-Allow-Origin, EVERY time)

       So the direct request in the proxy list below has never once succeeded from a browser: the
       submarine cables have ALWAYS come through a free public CORS proxy, and the layer is up only
       when one of three volunteer proxies happens to be up. Köppen has no such dependency — it is a
       bundled PNG on the app's own origin — which is exactly why 「片方しかつかない」 names this one
       every time and never that one.

       Two changes, and neither invents a data source:

       1. THE ANSWER IS KEPT. A successful download goes into the Cache API and is served from there
          on the next visit BEFORE the network is tried, with a refresh behind it that updates the
          source in place when it lands. Same data, same attribution; a proxy outage now costs a
          refresh rather than the layer. (#R186's rule: a fallback that only appears after the
          network has timed out is not a fallback, it is a delay.)
       2. A FAILED DOWNLOAD IS NOT A PREFERENCE. When everything failed, the old code unticked the
          box — and _snapshot() saves the ticked boxes, so the next thing the user toggled wrote a
          session in which this layer was OFF. From then on the restore switched it off deliberately,
          for ever: one bad afternoon for corsproxy.io became a permanent 「片方しかつかない」.
          The box is now marked `imAutoOff` when the app is the one unticking it, the session keeps
          wanting it (js/app-body.js), and it is retried with backoff before giving up at all. */
    const _CABLE_CACHE='intmap-subcables-v1';
    async function _cableCached(u){ try{ if(!self.caches) return null;
        const c=await caches.open(_CABLE_CACHE); const r=await c.match(u); if(!r) return null;
        const j=await r.json(); return (j&&j.features)?j:null; }catch(_){ return null; } }
    async function _cableStore(u,j){ try{ if(!self.caches||!j||!j.features) return;
        const c=await caches.open(_CABLE_CACHE);
        await c.put(u,new Response(JSON.stringify(j),{headers:{'content-type':'application/json'}})); }catch(_){} }
    const CABLE_URL='https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
    const CABLE_LP_URL='https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
    /* ══ (#R190) THE LAYER STOPS DEPENDING ON A STRANGER'S UPTIME ══════════════════════════════════
       「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

       #R188 measured why it is always THIS layer: submarinecablemap.com sends no ACAO, so the direct
       request has never once succeeded from a browser, and the layer was up only when one of three
       VOLUNTEER proxies happened to be alive. #R188 kept the answer (Cache API) and #R189 stopped a
       failure being recorded as a preference — both real, both about the SECOND visit. The first
       visit still asked a stranger.

       So the app now relays it through its own Edge Function, exactly as #R145 did for the
       Street-View coverage tiles: supabase/functions/cable-geo, an allowlist of these two URLs and
       nothing else, `Access-Control-Allow-Origin: *`, one day of edge cache. Same data, same source,
       same attribution — a request to our origin instead of to someone else's goodwill.

       ⚠ the bare URL stays FIRST even though it is measured to fail from a browser: the app is also
       opened from origins that are allowed to read it (a local file server, an extension host), and
       the data should not travel through anyone — including us — when it need not. The volunteer
       proxies stay LAST, as the fallback for a build with no Supabase URL configured. */
    const _cableProxies=(function(){ const b=(window.SUPABASE_URL||'').replace(/\/$/,'');
      return [ x=>x,
        ...(b?[ x=>`${b}/functions/v1/cable-geo?u=${encodeURIComponent(x)}` ]:[]),
        x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`,
        x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`,
        x=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(x)}` ]; })();
    async function _cableNet(u){ for(const mk of _cableProxies){ try{ const r=await fetch(mk(u)); if(!r.ok) continue; const j=await r.json(); if(j&&j.features){ _cableStore(u,j); return j; } }catch(_){} } return null; }
    async function fetchSubcables(){
      const [cCache,lCache]=await Promise.all([_cableCached(CABLE_URL),_cableCached(CABLE_LP_URL)]);
      if(cCache){ /* draw from the kept copy now, and refresh behind it */
        Promise.all([_cableNet(CABLE_URL),_cableNet(CABLE_LP_URL)]).then(([c2,l2])=>{
          try{ if(c2&&GE().layers.hasSource('src-subcables')) GE().layers.setSourceData('src-subcables',c2); }catch(_){}
          try{ if(l2&&GE().layers.hasSource('src-subcables-lp')) GE().layers.setSourceData('src-subcables-lp',l2); }catch(_){}
        });
        return {cab:cCache,lp:lCache,fromCache:true};
      }
      const [cab,lp]=await Promise.all([_cableNet(CABLE_URL),_cableNet(CABLE_LP_URL)]);
      return {cab,lp,fromCache:false};
    }
    /* The app — not the user — is switching this box off. Recorded on the element so the session
       snapshot can tell the two apart (js/app-body.js reads `imAutoOff`). */
    function autoUncheck(id){ const cb=document.getElementById(id); if(!cb) return;
      cb.dataset.imAutoOff='1'; cb.checked=false;
      const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');
      const ex=r&&r.querySelector('.lyr-extras'); if(ex) ex.style.display='none'; }
    let _subcableTries=0;
    /* ⚠ (#R224) THE #R208 OCEAN-CURRENT LAYER LIVED HERE AND IS GONE.
       「海流レイヤー、二つあるなんていうややこしいことするな。統一しろ。」 What stood here was ~100 lines
       that fetched data/ocean-currents.json, drew its 61 named lines, strided the shared 0.25° field
       to 1° for a global arrow layer and (since #R223) registered a legend — a second, thinner copy of
       js/ocean-currents.js. The plate in that file is the one implementation now: it reads the same
       bundled data, strides the field to the VIEW instead of to a fixed 1°, carries the twelve monthly
       climatologies and the named-current list, and owns the legend. Nothing here forwards to it —
       forwarding would leave two rows, which is the thing being removed. The single row is
       `wp-dl-currents` under World data, and js/session-tabs.js migrates a saved `dl-oceancur` to it.
       ⚠ `data/ocean-currents.json` and `data/ocean-currents-field.bin.gz` are UNCHANGED and still
       shipped — they were always the plate's data; this file was the second reader. */
    function addSubcables(){
      if(GE().layers.has('lyr-subcables')){ setVis('lyr-subcables',true); setVis('lyr-subcables-glow',true); setVis('lyr-subcables-pts',true); return; }
      if(_subcablesLoading) return; _subcablesLoading=true;
      fetchSubcables().then(({cab,lp})=>{
        _subcablesLoading=false;
        if(!cab){
          /* (#R188) three volunteer proxies all refusing at the same second is a bad minute, not an
             answer. Back off and ask again while the box is still ticked; only a fourth failure is
             reported — and even then as `imAutoOff`, which the session does not record as a choice. */
          const cb=document.getElementById('dl-subcables');
          if(cb&&cb.checked&&_subcableTries<3){ const wait=[5000,15000,45000][_subcableTries++];
            setTimeout(()=>{ const c2=document.getElementById('dl-subcables'); if(c2&&c2.checked) addSubcables(); },wait); return; }
          _subcableTries=0; autoUncheck('dl-subcables');
          try{ satToast(window.IntMapLang.t(HOST.lang,'Submarine cable data unavailable','海底ケーブルデータを取得できませんでした','Seekabel-Daten nicht verfügbar','Данные о подводных кабелях недоступны','Datos de cables submarinos no disponibles')); }catch(_){} return; }
        _subcableTries=0;
        /* ══ (#R187) A REFUSED ADD IS NOT AN ANSWER — TRY AGAIN ═══════════════════════════════════
           「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

           Reproduced on a cold first load, and the console says it outright:
               addSubcables Error: Style is not done loading.
           whenStyleReady() resolves for real when the style is parsed, but it also HARD-RESOLVES
           after ~6 s (#R41 put that there because the promise could otherwise hang forever and the
           layer would never appear at all). On a slow first load — and #R186 measured that its own two
           new default layers push "ready" from 3.2 s to 9.2 s, so this load is exactly the slow one —
           the hard resolve wins, MapLibre refuses addSource, and the old code logged the refusal and
           stopped. The box stayed ticked, the row stayed lit, and the layer did not exist: one of the
           two default layers on screen, which is the report.

           Köppen survives the same race because its branch polls for `lyr-climate` for 5 s and calls
           setVis when it appears. This gives the cables the same persistence at the point where it
           actually failed: build, and if the style refused, wait and build again. Bounded (12 tries
           over ~9 s), abandoned the moment the user unticks the box, and a no-op once the layers are
           there — so the successful path is byte-for-byte what it was. */
        const build=(tries)=>{
          try{
            if(!GE().layers.hasSource('src-subcables')) GE().layers.addSource('src-subcables',{type:'geojson',data:cab});
            if(!GE().layers.has('lyr-subcables-glow')) GE().layers.add({id:'lyr-subcables-glow',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':3.2,'line-opacity':0.20,'line-blur':3}},beforeId);
            if(!GE().layers.has('lyr-subcables')) GE().layers.add({id:'lyr-subcables',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':['interpolate',['linear'],['zoom'],0,0.6,4,1.1,8,2],'line-opacity':opacities.subcables}},beforeId);
            if(lp){ if(!GE().layers.hasSource('src-subcables-lp')) GE().layers.addSource('src-subcables-lp',{type:'geojson',data:lp});
              if(!GE().layers.has('lyr-subcables-pts')) GE().layers.add({id:'lyr-subcables-pts',type:'circle',source:'src-subcables-lp',minzoom:3,layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,1.6,8,3.5],'circle-color':'#ffd23f','circle-stroke-color':'#1a1a1a','circle-stroke-width':0.6,'circle-opacity':0.9}},beforeId); }
          }catch(e){
            /* the style refused this add — it is not parsed yet however hard whenStyleReady insisted */
            const cb=document.getElementById('dl-subcables');
            if(tries>0&&cb&&cb.checked){ setTimeout(()=>build(tries-1),750); return; }
            /* (#R189) giving up QUIETLY here left the one state #R187 was hunting: box ticked, layer
               absent. Say so the same way the download path does — imAutoOff, so the session still
               wants the layer, and a toast, so the screen is not silently missing what the row claims. */
            console.warn('addSubcables',e); autoUncheck('dl-subcables');
            try{ satToast(window.IntMapLang.t(HOST.lang,'Could not add the submarine-cable layer','海底ケーブルレイヤーを追加できませんでした','Seekabel-Ebene konnte nicht hinzugefügt werden','Не удалось добавить слой подводных кабелей','No se pudo añadir la capa de cables submarinos')); }catch(_){} return;
          }
          if(!GE().layers.has('lyr-subcables')){                 /* refused without throwing */
            const cb=document.getElementById('dl-subcables');
            if(tries>0&&cb&&cb.checked){ setTimeout(()=>build(tries-1),750); return; }
            console.warn('addSubcables: the style never accepted the cable layers'); autoUncheck('dl-subcables');
            try{ satToast(window.IntMapLang.t(HOST.lang,'Could not add the submarine-cable layer','海底ケーブルレイヤーを追加できませんでした','Seekabel-Ebene konnte nicht hinzugefügt werden','Не удалось добавить слой подводных кабелей','No se pudo añadir la capa de cables submarinos')); }catch(_){} return;
          }
          setVis('lyr-subcables-glow',true); setVis('lyr-subcables',true); if(GE().layers.has('lyr-subcables-pts')) setVis('lyr-subcables-pts',true);
          /* the layer is up — whatever an earlier failure recorded is settled (#R188) */
          try{ const cb=document.getElementById('dl-subcables'); if(cb&&cb.dataset) delete cb.dataset.imAutoOff; }catch(_){}
        };
        build(12);
      });
    }
    /* === Contour lines — generated on the fly from the terrarium DEM ===
       (#R179) the DEM source itself now lives in the engine (scene.demContourSource): it has to be
       handed the renderer's namespace to register a tile protocol, which is not this file's business.
       The `_mlcDem` handle that used to be cached here went with it. */
    /* (#R152) contour GRANULARITY slider — the [minor, major] metre intervals per zoom are BAKED into the vector
       tiles at source creation, so changing them means rebuilding the source. `_contourDensity` scales the base
       table (1 = default, >1 = finer/more lines by dividing the interval, <1 = coarser). The slider lives in the
       contour legend (per the R16 rule that layer controls live in the legend, never the Layers panel). */
    const _CONTOUR_BASE={ 5:[1000,4000], 6:[500,2000], 7:[500,2000], 8:[250,1000], 9:[200,1000], 10:[100,500], 11:[100,500], 12:[50,250], 13:[25,100], 14:[10,50], 15:[10,50] };
    window._contourDensity=window._contourDensity||1;
    function _contourThresholds(){ const d=Math.max(0.25,Math.min(4,+window._contourDensity||1)); const out={}; for(const z in _CONTOUR_BASE){ const b=_CONTOUR_BASE[z]; out[z]=[Math.max(1,Math.round(b[0]/d)), Math.max(2,Math.round(b[1]/d))]; } return out; }
    function _rebuildContours(){ try{ if(!GE().hasRenderer()) return;
      const wasOn=GE().layers.get('contour-lines') && GE().layers.getLayout('contour-lines','visibility')!=='none';
      ['contour-labels','contour-lines'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.remove(id); }catch(_){} });
      try{ if(GE().layers.hasSource('contour-src')) GE().layers.removeSource('contour-src'); }catch(_){}
      addContours();
      if(wasOn){ try{ GE().layers.setLayout('contour-lines','visibility','visible'); }catch(_){} try{ GE().layers.setLayout('contour-labels','visibility','visible'); }catch(_){} }
    }catch(e){ console.warn('rebuildContours',e); } }
    window._setContourDensity=function(d){ window._contourDensity=Math.max(0.25,Math.min(4,+d||1)); _rebuildContours(); };
    function addContours(){
      if(GE().layers.has('contour-lines')) return true;
      try{
        if(!GE().layers.hasSource('contour-src')){
          /* (#R179) the ENGINE derives the contour tiles. This used to build the DEM source here and
             hand maplibre-contour the renderer's namespace (`setupMaplibre(maplibregl)`) — the last
             bare reference to the map library anywhere outside js/geo-engine.js. Registering a tile
             protocol is a renderer detail, so the contract owns it; null means the library is absent,
             which is what the old `if(!MLC||!MLC.DemSource) return false` said. */
          const url=GE().scene.demContourSource({
            url:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            encoding:'terrarium', maxzoom:13, worker:true,
            /* (#R152) [minor, major] metre intervals, scaled by the user's density slider (_contourThresholds). */
            thresholds:_contourThresholds(),
            elevationKey:'ele', levelKey:'level', contourLayer:'contours' });
          if(!url) return false;
          GE().layers.addSource('contour-src',{ type:'vector', maxzoom:15, tiles:[url] });
        }
        const dark=document.documentElement.getAttribute('data-theme')==='dark';
        GE().layers.add({ id:'contour-lines', type:'line', source:'contour-src', 'source-layer':'contours', layout:{visibility:'none'},
          paint:{ 'line-color': dark?'rgba(220,180,120,0.6)':'rgba(150,100,40,0.7)', 'line-width':['match',['get','level'],1,1.3,0.55], 'line-opacity':opacities.contours } }, beforeId);
        GE().layers.add({ id:'contour-labels', type:'symbol', source:'contour-src', 'source-layer':'contours', layout:{visibility:'none','symbol-placement':'line','symbol-spacing':320,'text-size':window.IntMapLabelScale.sub(0.82),'text-field':['concat',['to-string',['get','ele']],' m'],'text-font':['Noto Sans Regular'],'text-allow-overlap':false},
          paint:{ 'text-color': dark?'#e8c890':'#7a5320', 'text-halo-color': dark?'rgba(0,0,0,0.7)':'rgba(255,255,255,0.8)', 'text-halo-width':1.2 } }, beforeId);
        return true;
      }catch(e){ console.warn('addContours',e); return false; }
    }
    /* ══ (#R276) RAINVIEWER IS A LOOP NOW, AND THE DEAD HALF OF IT IS GONE ═══════════════════
       「RainViewerは最新1枚だけでなく、利用可能な過去フレームをアニメーション可能にする。フレーム時刻と
         経過時間を表示する。廃止済みSatellite IRと旧配色番号への依存は削除または現行データ源へ置換する。」

       MEASURED against the live API on 2026-08-20:
         · radar.past           -> 13 frames, 10 min apart, covering the last two hours;
         · radar.nowcast        -> 0 frames (a paid feature; handled if it ever appears);
         · satellite.infrared   -> 0 frames. The free satellite product is RETIRED, so `frames[len-1]`
           read `undefined`, rvTiles returned null, and the Clouds layer could only ever toast
           「Live weather data unavailable」 and untick itself. It has not worked since RainViewer
           withdrew it. It is replaced below by NASA GIBS geostationary clean-IR, which is current.
         · the colour-scheme number: schemes 0/2/3/6/7/8 return BYTE-IDENTICAL tiles and 1/4/5/9
           return the other one, so the free tier serves two palettes behind ten numbers. The app
           asked for 「4」 as if it were a choice. RV_SCHEME names the one we actually get. */
    let _rvData=null, _rvAt=0, _rvPending=null, _rvTimer=null;
    let _rvFrames=[], _rvIdx=-1, _rvPlay=false, _rvPlayT=0;
    const RV_SCHEME=4;                 /* the blue->red palette the two-palette free tier gives back */
    const RV_STEP_MS=520;              /* one radar frame per ~half second, the RainViewer pace */
    function rvFetch(){
      if(_rvData && Date.now()-_rvAt<5*60000) return Promise.resolve(_rvData);
      if(_rvPending) return _rvPending;
      _rvPending=fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.ok?r.json():null)
        .then(j=>{ if(j){ _rvData=j; _rvAt=Date.now(); rvRefreshFrames(); } _rvPending=null; return _rvData; })
        .catch(()=>{ _rvPending=null; return null; });
      return _rvPending;
    }
    function rvRefreshFrames(){
      const r=(_rvData&&_rvData.radar)||{};
      const was=(_rvIdx>=0)?_rvFrames[_rvIdx]:null;
      _rvFrames=(r.past||[]).concat(r.nowcast||[]);
      /* stay on the SAME INSTANT across a refresh; a reader watching -60 min should not be jumped to
         «now» just because a newer frame arrived at the end of the list */
      if(was&&_rvFrames.length){ let best=_rvFrames.length-1,bd=Infinity;
        _rvFrames.forEach((f,i)=>{ const d=Math.abs(f.time-was.time); if(d<bd){bd=d;best=i;} });
        _rvIdx=best; }
      else _rvIdx=_rvFrames.length-1;
    }
    function rvTiles(idx){
      if(!_rvData||!_rvFrames.length) return null;
      const host=_rvData.host||'https://tilecache.rainviewer.com';
      const f=_rvFrames[Math.max(0,Math.min(_rvFrames.length-1,idx==null?_rvIdx:idx))];
      if(!f) return null;
      return [host+f.path+'/256/{z}/{x}/{y}/'+RV_SCHEME+'/1_1.png'];
    }
    function rvFrameTime(){ const f=_rvFrames[_rvIdx]; return f?f.time*1000:null; }
    function addRainViewer(){
      const tiles=rvTiles(); if(!tiles) return false;
      try{ if(GE().layers.has('lyr-radar')) GE().layers.remove('lyr-radar'); if(GE().layers.hasSource('src-radar')) GE().layers.removeSource('src-radar'); }catch(_){}
      addRaster('radar',tiles,12);
      setVis('lyr-radar',true);
      rvUpdateLegend();
      return true;
    }
    /* Re-point the tiles rather than rebuild the source — MapLibre cross-fades between the old and the
       new tile set (raster-fade-duration), which is what stops a step looking like a blink. */
    function rvShow(idx){
      if(!_rvFrames.length) return;
      _rvIdx=Math.max(0,Math.min(_rvFrames.length-1,idx));
      const tiles=rvTiles();
      if(!(tiles&&GE().layers.setSourceTiles('src-radar',tiles))&&tiles) addRainViewer();
      rvUpdateLegend();
    }
    function rvStep(n){ if(!_rvFrames.length) return; rvShow((_rvIdx+n+_rvFrames.length)%_rvFrames.length); }
    function rvSetPlay(on){
      _rvPlay=!!on; clearTimeout(_rvPlayT);
      if(_rvPlay){ const tick=()=>{ if(!_rvPlay) return; rvStep(1);
        /* hold the newest frame a beat longer so the loop reads as a loop, not a stutter */
        _rvPlayT=setTimeout(tick,(_rvIdx===_rvFrames.length-1)?RV_STEP_MS*3:RV_STEP_MS); };
        _rvPlayT=setTimeout(tick,RV_STEP_MS); }
      rvUpdateLegend();
    }
    window._rvPlayer={ show:rvShow, step:rvStep, play:rvSetPlay, playing:()=>_rvPlay,
      frames:()=>_rvFrames.slice(), index:()=>_rvIdx, time:rvFrameTime };
    function rvUpdateLegend(){
      const box=lgdRadar&&lgdRadar.querySelector('.rv-player'); if(!box) return;
      const n=_rvFrames.length, tt=rvFrameTime();
      const sl=box.querySelector('#rv-time'); if(sl){ sl.max=Math.max(0,n-1); sl.value=Math.max(0,_rvIdx); }
      const pb=box.querySelector('.rv-b[data-act="play"]'); if(pb) pb.textContent=_rvPlay?'⏸':'▶';
      const cap=box.querySelector('.rv-when');
      if(cap){
        if(!tt) cap.textContent=window.IntMapLang.t(HOST.lang,'no frames','フレームなし','keine Bilder','нет кадров','sin fotogramas');
        else{
          const mins=Math.round((Date.now()-tt)/60000);
          const clock=new Date(tt).toLocaleTimeString(window.IntMapLang.locale(HOST.lang,'en-GB'),{hour:'2-digit',minute:'2-digit'});
          const rel=(mins<=0)?window.IntMapLang.t(HOST.lang,'now','現在','jetzt','сейчас','ahora')
            :('−'+mins+' '+window.IntMapLang.t(HOST.lang,'min','分','Min.','мин','min'));
          cap.textContent=clock+' · '+rel+' · '+(_rvIdx+1)+'/'+n;
        }
      }
    }
    window._rvUpdateLegend=rvUpdateLegend;
    function rvAutoRefresh(){
      if(_rvTimer) return;
      _rvTimer=setInterval(()=>{ _rvAt=0; rvFetch().then(()=>{
        if(GE().layers.has('lyr-radar')&&GE().layers.getLayout('lyr-radar','visibility')==='visible'){
          try{ const tiles=rvTiles(); if(!(tiles&&GE().layers.setSourceTiles('src-radar',tiles))&&tiles) addRainViewer(); }catch(_){}
          rvUpdateLegend();
        }
      }); },240000);
    }
    /* === Refresh tiles for dated layers when the date selector changes === */
    function refreshDatedLayer(id){
      const date=layerDates[id]||GIBS_DATE;
      let tiles=null;
      /* NOTE: thermal is intentionally NOT here — it is a FIRMS WMS layer now (rolling time window),
         refreshed by window._refreshThermal, not by a GIBS date (#5). */
      if(id==='precip') tiles=gibs('IMERG_Precipitation_Rate',6,'png',date+'T12:00:00Z');  /* IMERG requires a sub-daily timestamp or returns 404 */
      else if(id==='sst') tiles=gibs('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'png',date);
      else if(id==='snow') tiles=gibs('MODIS_Terra_NDSI_Snow_Cover',8,'png',date);
      else if(id==='aod') tiles=gibs('MODIS_Combined_Value_Added_AOD',6,'png',date);
      if(!tiles) return;
      /* Remove and re-add the source/layer with new tiles */
      const wasVis=GE().layers.has('lyr-'+id)?GE().layers.getLayout('lyr-'+id,'visibility')==='visible':false;
      if(GE().layers.has('lyr-'+id)) GE().layers.remove('lyr-'+id);
      if(GE().layers.hasSource('src-'+id)) GE().layers.removeSource('src-'+id);
      const maxzMap={precip:6,sst:7,snow:8,aod:6};
      addRaster(id,tiles, maxzMap[id]||6);
      if(wasVis) setVis('lyr-'+id,true);
    }
    function toggleLayer(id,on){
      if(on){
        if(id==='climate'){ addKoppen(); /* layer added async after CORS preflight; setVis once it appears */ const t0=Date.now(); (function w(){ if(GE().layers.has('lyr-climate')){ setVis('lyr-climate',true); } else if(Date.now()-t0<5000){ setTimeout(w,150); } })(); legend.style.display='flex'; try{ const _f=()=>{ try{ window._fitKoppenLegend&&window._fitKoppenLegend(); }catch(_){} }; requestAnimationFrame(()=>{ requestAnimationFrame(_f); }); setTimeout(_f,120); }catch(_){} }   /* (#R147/#R148) fit legend height to content once visible — double-rAF + a timeout backstop so it runs after layout settles */
        else if(id==='precip'){ whenStyleReady().then(()=>{ try{ addRaster('precip',gibs('IMERG_Precipitation_Rate',6,'png',layerDates.precip+'T12:00:00Z'),6); }catch(_){} try{ setVis('lyr-precip',true); }catch(_){} }); }
        else if(id==='thermal'){
          lgdThermal.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addFirmsThermal(); setThermalVis(true); }catch(e){ console.warn('thermal (GIBS) fail',e); const cb=document.getElementById('dl-thermal'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} try{ satToast(window.IntMapLang.t(HOST.lang,'Active-fire data unavailable','火災データを取得できませんでした','Branddaten nicht verfügbar','Данные о пожарах недоступны','Datos de incendios no disponibles')); }catch(_){} } });
        }
        else if(id==='radar'){
          lgdRadar.style.display='block'; tileLegends();
          whenStyleReady().then(()=>rvFetch()).then(()=>{
            if(!addRainViewer()){
              try{ satToast(window.IntMapLang.t(HOST.lang,'Live weather data unavailable','気象データを取得できませんでした','Wetterdaten nicht verfügbar','Данные о погоде недоступны','Datos meteorológicos no disponibles')); }catch(_){}
              const cb=document.getElementById('dl-radar'); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); }
              lgdRadar.style.display='none'; tileLegends();
              return;
            }
            rvAutoRefresh();
          });
        }
        else if(id==='sst'){
          lgdSST.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addRaster('sst',gibs('GHRSST_L4_MUR_Sea_Surface_Temperature',7,'png',layerDates.sst),7); }catch(_){} try{ setVis('lyr-sst',true); }catch(_){} });
        }
        else if(id==='snow'){ lgdSnow.style.display='block'; tileLegends(); whenStyleReady().then(()=>{ try{ addRaster('snow',gibs('MODIS_Terra_NDSI_Snow_Cover',8,'png',layerDates.snow),8); }catch(_){} try{ setVis('lyr-snow',true); }catch(_){} }); }
        else if(id==='aod'){ lgdAod.style.display='block'; tileLegends(); whenStyleReady().then(()=>{ try{ addRaster('aod',gibs('MODIS_Combined_Value_Added_AOD',6,'png',layerDates.aod),6); }catch(_){} try{ setVis('lyr-aod',true); }catch(_){} }); }
        /* Night-time satellite (#R9/#39) — VIIRS "Black Marble" city-lights composite via NASA GIBS. */
        else if(id==='nightsat'){ lgdNightsat.style.display='block'; tileLegends(); try{ _refreshLegendDates(); }catch(_){} whenStyleReady().then(()=>{ try{ addRaster('nightsat',gibs('VIIRS_Black_Marble',8,'png',window._nightsatEpoch),8); }catch(_){} try{ GE().layers.setSourceTiles('src-nightsat',gibs('VIIRS_Black_Marble',8,'png',window._nightsatEpoch)); }catch(_){} try{ setVis('lyr-nightsat',true); }catch(_){} }); }
        else if(id==='popgrid'){
          lgdPopGrid.style.display='block'; tileLegends();
          try{ _refreshLegendDates(); }catch(_){}
          whenStyleReady().then(()=>{ try{ addRaster('popgrid',popgridTiles(),7); }catch(_){} try{ GE().layers.setSourceTiles('src-popgrid',popgridTiles()); }catch(_){} try{ setVis('lyr-popgrid',true); }catch(_){} });
        }
        /* (#R289) 「風レイヤーオン時は（海岸線が）デフォルトでオン」 — a colour field covers the basemap,
           so the coast is what tells you where you are looking. `_imCoastAuto` latches, so this is a
           DEFAULT and not a coupling: a reader who switches the coast back off keeps it off. */
        else if(id==='wind'){ try{ const l=document.getElementById('data-legend-wind'); if(l){ l.style.display='block'; tileLegends(); window._updateWindLegend&&window._updateWindLegend(); } window.Wind&&window.Wind.toggle(true); window._imCoastAuto&&window._imCoastAuto(); }catch(_){} }
        else if(id==='relief'){
          /* Color elevation relief (#5) — MapLibre v5 color-relief over the DEM, hypsometric tint. */
          whenStyleReady().then(()=>{ try{
            ensureTerrainSource();
            if(!GE().layers.has('lyr-relief')){
              GE().layers.add({id:'lyr-relief',type:'color-relief',source:'terrain-dem',layout:{visibility:'none'},paint:{'color-relief-opacity':opacities.relief,
                'color-relief-color':['interpolate',['linear'],['elevation'],
                  -8000,'#062c5a',-4000,'#0b4f8a',-1000,'#2a78b8',-100,'#7fb3d9',-1,'#cfe6f5',
                  0,'#1a7a3c',150,'#4fae5b',500,'#a6d96a',1000,'#e6e08b',1800,'#d9a066',2800,'#a87b52',3800,'#9b6b4a',4800,'#cdbfb4',6000,'#ffffff']}},beforeId);
            }
            setVis('lyr-relief',true); if(lgdRelief){ lgdRelief.style.display='block'; tileLegends(); }
          }catch(e){ console.warn('relief fail',e); const cb=document.getElementById('dl-relief'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} try{ satToast(window.IntMapLang.t(HOST.lang,'Color relief unavailable','カラー標高を初期化できませんでした','Farbrelief nicht verfügbar','Цветной рельеф недоступен','Relieve en color no disponible')); }catch(_){} } });
        }
        else if(id==='sealevel'){
          lgdSeaLevel.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{ try{ addSeaLevel(); setVis('lyr-sealevel',true); window._refreshSeaLevel(); }catch(e){ console.warn('sealevel fail',e); const cb=document.getElementById('dl-sealevel'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} } });
        }
        else if(id==='subcables'){ whenStyleReady().then(()=>{ try{ addSubcables(); }catch(e){ console.warn('subcables',e); } }); }
        else if(id==='hillshade'){
          whenStyleReady().then(()=>{ try{
            ensureTerrainSource();
            if(!GE().layers.has('lyr-hillshade')) GE().layers.add({id:'lyr-hillshade',type:'hillshade',source:'terrain-dem',layout:{visibility:'none'},paint:{'hillshade-exaggeration':0.6,'hillshade-shadow-color':'#1a2a44','hillshade-highlight-color':'#ffffff','hillshade-accent-color':'#5a6b85'}},beforeId);
            setVis('lyr-hillshade',true);
          }catch(e){ console.warn('hillshade fail',e); } });
        }
        else if(id==='contours'){
          whenStyleReady().then(()=>{ try{ if(addContours()){ setVis('contour-lines',true); setVis('contour-labels',true); } else { const cb=document.getElementById('dl-contours'); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); } try{ satToast(window.IntMapLang.t(HOST.lang,'Could not initialize contours','等高線を初期化できませんでした','Höhenlinien konnten nicht initialisiert werden','Не удалось инициализировать изолинии','No se pudieron iniciar las curvas de nivel')); }catch(_){} } }catch(e){ console.warn('contours fail',e); } });
        }
        else if(id==='eez'){
          /* Show legend immediately so user sees feedback; defer source add until style loads */
          lgdEEZ.style.display='block'; tileLegends();
          whenStyleReady().then(()=>{
            try{ addEEZ(); }catch(e){ console.warn('addEEZ failed',e); }
            try{ setVis('lyr-eez',true); }catch(_){}
          });
        }
        else if(id==='ships'||id==='planes'){ startTraffic(id); }
        else if(id==='sats'){ startSats(); }
        else if(id==='pop'){
          lgdPop.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('pop'); applyChoro('pop',s=>s.density); setVis('pop-fill',true); }catch(e){ console.warn('pop choro fail',e); } });
        }
        else if(id==='hdi'){
          lgdHDI.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('hdi'); applyChoro('hdi',s=>s.hdi); setVis('hdi-fill',true); }catch(e){ console.warn('hdi choro fail',e); } });
        }
        else if(id==='dem'){
          lgdDem.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('dem'); applyChoro('dem',s=>s.dem); setVis('dem-fill',true); }catch(e){ console.warn('dem choro fail',e); } });
        }
        else if(id==='milSpend'){ applyMilMode(); }   /* (#R289) whichever of the two modes is selected */
        else if(id==='gdppc'){
          lgdGdppc.style.display='block'; tileLegends();
          withCountries(()=>{ try{ addChoro('gdppc'); applyChoro('gdppc',s=>s.gdppc!=null?s.gdppc:null); setVis('gdppc-fill',true); }catch(e){ console.warn('gdppc choro fail',e); } });
        }
        else if(id==='tfr'){
          lgdTfr.style.display='block'; tileLegends();
          /* (#R11) Total fertility rate — fetched live from the World Bank (latest year), cached. */
          withCountries(()=>{ try{ addChoro('tfr'); setVis('tfr-fill',true);
            const apply=()=>applyChoro('tfr',s=>s.tfr!=null?s.tfr:null);
            if(window._tfrData){ apply(); }
            else { fetch('https://api.worldbank.org/v2/country/all/indicator/SP.DYN.TFRT.IN?format=json&date=2022&per_page=400').then(r=>r.json()).then(j=>{ const arr=(j&&j[1])||[]; window._tfrData={}; arr.forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code){ window._tfrData[d.countryiso3code]=+d.value; if(countryStats[d.countryiso3code]) countryStats[d.countryiso3code].tfr=+d.value; } }); apply(); }).catch(()=>{ try{ imToast(window.IntMapLang.t(HOST.lang,'Could not load fertility data','出生率データを取得できませんでした','Fruchtbarkeitsdaten nicht verfügbar','Не удалось загрузить данные о рождаемости','No se pudieron cargar los datos de fecundidad')); }catch(_){} }); }
          }catch(e){ console.warn('tfr choro fail',e); } });
        }
        else if(id==='nato'){
          /* NATO members fill (#14) + accession-year time-travel control (#R25/#24); accession year +
             defense %GDP also show on hover. */
          withCountries(()=>{ try{ addNato(); applyNato(); wireNatoHover(); setNatoVis(true); natoLegend(); }catch(e){ console.warn('nato fail',e); } });
        }
        else if(id==='eu'){
          /* (#R26) EU members fill + accession-year time-travel control (mirrors NATO). */
          withCountries(()=>{ try{ addEu(); applyEu(); wireEuHover(); setEuVis(true); euLegend(); }catch(e){ console.warn('eu fail',e); } });
        }
        /* (#R232) the day/night SHADING — one call to its owner, and the Settings picker follows. */
        else if(id==='nightside'){ _setNightSide(true); }
        /* (#R15c) layers without a dedicated legend get a generic one (so opacity moves out of the panel) */
        { try{ const gl=ensureGenericLegend(id); if(gl){ gl.style.display='block'; tileLegends(); } }catch(_){} }
        /* (#R30) ASYNC-RACE ORPHAN GUARD — root cause of "オンになっているのにactive layersに表示されず、消せない" /
           "勝手にレイヤーがオンになる". Most layers add+show inside whenStyleReady()/poll callbacks that resolve
           LATER. If the user UNCHECKED before that resolved, the deferred setVis(true) re-showed a layer whose
           checkbox is now OFF — a visible-but-unremovable orphan (the active-layers list reads the checkbox, so
           it never lists it). Re-assert the OFF state a few times after if the box went off in the meantime.
           toggleLayer(id,false) runs the full per-id hide path, so map ⇄ checkbox ⇄ active-list stay in sync. */
        { const _dlid='dl-'+id; [600,1500,3200].forEach(ms=>setTimeout(()=>{ try{ const cb=document.getElementById(_dlid); if(cb && !cb.checked){ toggleLayer(id,false); try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){} } }catch(_){} }, ms)); }
      } else {
        if(id==='hdi'||id==='dem'||id==='pop'||id==='milSpend'||id==='gdppc'||id==='tfr'){ setVis(id+'-fill',false); }
        else if(id==='nato'){ setNatoVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('nato'); }catch(_){} }
        else if(id==='eu'){ setEuVis(false); try{ window._hideGenericLegend&&window._hideGenericLegend('eu'); }catch(_){} }
        else if(id==='ships'||id==='planes'){ stopTraffic(id); }
        else if(id==='sats'){ stopSats(); }
        else if(id==='contours'){ setVis('contour-lines',false); setVis('contour-labels',false); }
        else if(id==='wind'){ try{ window.Wind&&window.Wind.toggle(false); const l=document.getElementById('data-legend-wind'); if(l) l.style.display='none'; }catch(_){} }
        else if(id==='thermal'){ setThermalVis(false); }
        else if(id==='subcables'){ setVis('lyr-subcables',false); setVis('lyr-subcables-glow',false); setVis('lyr-subcables-pts',false); }
        else { setVis('lyr-'+id,false); }
        if(id==='climate'){ legend.style.display='none';
          /* (#R19) Phones: drop the Köppen sampling work-set (4096² canvas + pixel copies, ~150 MB)
             the moment the layer is off — it lazily rebuilds on the next toggle. A big slice of the
             "何か重い動作をすると頻繁にブラウザが落ちます" memory pressure. Desktop keeps it for instant
             re-toggle. The GPU recolor path never needs these buffers at all. */
          if(typeof isMobile==='function'&&isMobile()){
            try{ window._koppenImg=null; window._koppenCanvas=null; window._koppenReady=false; window._koppenLoadStarted=false;
                 window._koppenCodeIdx=null; window._koppenSrcData=null; window._koppenFull=null; }catch(_){}
          }
        }
        if(id==='hdi') lgdHDI.style.display='none';
        if(id==='dem') lgdDem.style.display='none';
        if(id==='pop') lgdPop.style.display='none';
        if(id==='popgrid') lgdPopGrid.style.display='none';
        if(id==='relief') lgdRelief.style.display='none';
        if(id==='sealevel') lgdSeaLevel.style.display='none';
        if(id==='eez') lgdEEZ.style.display='none';

        if(id==='thermal') lgdThermal.style.display='none';
        if(id==='radar') lgdRadar.style.display='none';
        if(id==='sst') lgdSST.style.display='none';
        if(id==='gdppc') lgdGdppc.style.display='none';
        if(id==='tfr') lgdTfr.style.display='none';
        if(id==='milSpend'){ lgdMil.style.display='none'; lgdMilGDP.style.display='none'; setVis('milSpendGDP-fill',false); }   /* (#R289) both halves of the one row */
        if(id==='snow') lgdSnow.style.display='none';
        if(id==='aod') lgdAod.style.display='none';
        if(id==='nightsat') lgdNightsat.style.display='none';
        if(GENERIC_LEG[id]){ const gl=document.getElementById('data-legend-'+id); if(gl){ gl.style.display='none'; tileLegends(); } }   /* (#R15c) */
        if(id==='radar'){ if(_rvTimer){ clearInterval(_rvTimer); _rvTimer=null; } try{ rvSetPlay(false); }catch(_){} }
        tileLegends();
        if(id==='nightside'){ _setNightSide(false); }   /* (#R232) */
      }
    }
    /* ══ (#R232) THE ONE PLACE THE DAY/NIGHT SWITCH IS WRITTEN ═══════════════════════════════════
       There are now THREE surfaces for one boolean — this layer row, the Settings picker
       (`#setting-night-side`) and Atlas's `nightSide` action — and this project's recurring defect is
       exactly that shape: 「同じ量の設定が二か所にあると片方は永久に届かない」. So none of them owns
       the value. js/night-side.js does (it persists it); every surface calls through here, and here
       re-points the OTHER surfaces at the answer it just got back. */
    function _setNightSide(on){
      let now=!!on;
      try{ if(window.IntMapNightSide) now=!!window.IntMapNightSide.setEnabled(!!on); }catch(_){}
      try{ const sel=document.getElementById('setting-night-side'); if(sel) sel.value=now?'on':'off'; }catch(_){}
      try{ const cb=document.getElementById('dl-nightside'); if(cb&&cb.checked!==now){ cb.checked=now;
        const row=document.getElementById('lyrrow-nightside'); if(row) row.classList.toggle('on',now); } }catch(_){}
      try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
      return now;
    }
    /* …and the reverse direction: Settings and Atlas both go through window.IntMapNightSide directly,
       so this is what lets the row notice. Published rather than local because js/app-body.js's
       Settings handler and js/atlas-console.js's action both need it. */
    window._imSyncNightSideRow=function(){ try{
      const on=!window.IntMapNightSide||window.IntMapNightSide.isOn();
      const cb=document.getElementById('dl-nightside'); if(cb&&cb.checked!==on){ cb.checked=on;
        const row=document.getElementById('lyrrow-nightside'); if(row) row.classList.toggle('on',on); }
      const sel=document.getElementById('setting-night-side'); if(sel) sel.value=on?'on':'off';
      window._refreshActiveLayers&&window._refreshActiveLayers();
    }catch(_){} };
    /* (#R34) GENERIC ORPHAN SWEEP — the definitive fix for "オンになっているのにactive layersに表示されず、消すこと
       もできない" / "消したレイヤーが表示されっぱなし". Any data layer whose checkbox is OFF but whose map layer is
       still VISIBLE is an orphan: the active-layers list reads the checkbox, so it never lists it → the user
       can't remove it. The dl- guard at toggle time only re-checks for ~3s and only the dl- id; this catches
       EVERY case (slow async adds, any path) by reconciling on idle. Pure hide-only + idempotent: it walks
       each dl- checkbox and, if it's unchecked yet its layer is still painted, runs the real hide path. It
       NEVER turns anything on, so it can't cause "勝手にオンになる". */
    window._sweepOrphanLayers=function(){
      if(!_canDraw()||window._imDemoActive) return;   /* (#R170) reads getStyle().layers — a parsed style suffices */
      try{
        const visSet=new Set();
        GE().scene.getStyle().layers.forEach(l=>{ try{ if((GE().layers.getLayout(l.id,'visibility')||'visible')==='visible') visSet.add(l.id); }catch(_){} });
        document.querySelectorAll('#layer-dropdown input[id^="dl-"]').forEach(cb=>{
          if(cb.checked) return; const id=cb.id.slice(3);
          /* (#R36) catch EVERY visible sub-layer of this id, not just lyr-<id>/<id>-fill: a multi-part layer
             (subcables-glow/-pts, contour-lines/-labels …) left ONE sublayer painted = still a ghost. */
          let vis = visSet.has('lyr-'+id) || visSet.has(id+'-fill') || visSet.has(id+'-line');
          if(!vis) for(const L of visSet){ if(L.indexOf('lyr-'+id+'-')===0){ vis=true; break; } }
          if(vis){ try{ toggleLayer(id,false); }catch(_){} }
        });
      }catch(_){}
    };
    try{ if(GE().hasRenderer()) GE().events.on('idle',()=>{ try{ window._sweepOrphanLayers&&window._sweepOrphanLayers(); }catch(_){} }); }catch(_){}
    /* (#R41) The orphan sweep + label-raise self-heals were driven ONLY by 'idle'. When the map is wedged
       not-idle (a tile source erroring / looping), idle never fires, so "消したはずのレイヤーが残り続ける" and
       buried labels persisted until a reload. Drive the SAME idempotent, drift-only self-heals on a slow
       heartbeat too so they recover without an idle and without a reload. Each only acts on real drift, so in
       steady state this does nothing. */
    try{ if(GE().hasRenderer()){ setInterval(()=>{ try{ window._sweepOrphanLayers&&window._sweepOrphanLayers(); }catch(_){} try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} }, 2500); } }catch(_){}
    /* (#R36) UNIVERSAL async-race orphan guard for EVERY layer subsystem (main dl-, eco-dl-, beta-dl-, bx-, l9-dl-).
       The dl- toggle-time guard + the dl- idle sweep only cover the MAIN system; the eco / World-Bank / hazard
       layers add+show inside THEIR OWN async callbacks, so an ON-then-quick-OFF can re-show a layer whose box is
       now OFF ("閉じたはずのレイヤーが表示され続ける"). When ANY layer checkbox goes OFF, re-assert that OFF a few
       times by re-running the checkbox's OWN change/hide path — idempotent, never turns anything on. */
    try{ const _dd=document.getElementById('layer-dropdown'); if(_dd) _dd.addEventListener('change',(e)=>{
      const cb=e.target; if(!cb||cb.type!=='checkbox'||cb.checked||cb.__reassertGuard) return;
      /* (#R38) NEVER re-dispatch on the 7 utility toggles. They are not async-race layers, and several have
         stateful handlers (cb-grid's setGrid; borders/roads/rail have their OWN multi-retry re-assert) — a
         re-dispatched change here is what flipped Grid back ON ("何度消しても自動的にチェックされる"). */
      if(['cb-names','cb-geolabels','cb-poi','cb-borders','cb-coast','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2'].includes(cb.id)) return;
      [500,1400,3000].forEach(ms=>setTimeout(()=>{ try{ if(cb.checked||!cb.isConnected) return; cb.__reassertGuard=1; cb.dispatchEvent(new Event('change',{bubbles:true})); cb.__reassertGuard=0; }catch(_){ try{cb.__reassertGuard=0;}catch(__){} } },ms));
    }); }catch(_){}
    /* Expose for the lyr-row dt-/ft- handlers above */
    window.refreshDatedLayer=refreshDatedLayer;
    window.refreshTrafficLayer=refreshTrafficLayer;
    /* (#R172) aircraft altitude rendering — Atlas + the tests drive it through this, never through the layer ids */
    window.IntMapPlanes3D={ isOn:planes3DOn, set:setPlanes3D,
      /* (#R173) the clicked aircraft's track, also reachable by callsign / registration / ICAO24 so Atlas
         and the tests drive exactly what a click drives (#R82: everything is operable from Atlas). */
      select:selectPlane, selected:()=>selectedPlane, track:k=>((planeTracks[k||selectedPlane]||[]).slice()),
      /* diagnostics for the pick: where an aircraft is DRAWN, and which one a screen point would select */
      screenPos:k=>{ const d=planesData.find(x=>x.icao24===k); if(!d) return null;
        const E=window.IntMapGeoEngine, pa=E&&E.coords&&E.coords.projectAltitude; if(!pa) return null;
        /* (#R187) …and it answers for the rendering that is ON — see _planeDrawAlt. This is the
           "where is it drawn" diagnostic, so it has to move with the drawing. */
        return pa([d.lng,d.lat],_planeDrawAlt(d)); },
      pickAt:pt=>{ const d=pickPlane(pt); return d?d.icao24:null; },
      trackStats:k=>trackStats(k||selectedPlane),
      find:q=>{ const s2=String(q||'').trim().toUpperCase(); if(!s2) return null;
        const hit=planesData.find(d=>(d.icao24||'').toUpperCase()===s2)
          ||planesData.find(d=>(d.callsign||'').trim().toUpperCase()===s2)
          ||planesData.find(d=>(d.reg||'').toUpperCase()===s2)
          ||planesData.find(d=>((d.callsign||'')+' '+(d.reg||'')).toUpperCase().indexOf(s2)>=0);
        return hit?hit.icao24:null; },
      state:()=>{ const s2=_planes3DStats;
        /* (#R183) `aircraft` and `detailed` are surfaced because `features` stopped meaning "one per
           aircraft" the moment the body became four extrusions — a reader that only sees `features`
           cannot tell 3 aircraft drawn in detail from 14 drawn plainly. */
        return { on:planes3DOn(), planes:planesData.length, features:s2.features, aircraft:s2.aircraft,
          /* (#R186) the SWEEP — how much sky was asked for, how many circles it took, what came back
             and what the render cap left out. No silent caps (#R185). */
          sweep:_planeStats, cover:_planeCover, culled3D:_planes3DCulled, minZoom:PLANES_MIN_ZOOM,
          circleBudget:PLANE_CIRCLE_BUDGET(), maxAircraft:PLANE_MAX_AIRCRAFT, pollMs:planePollMs(), gapMs:PLANE_GAP_MS,
          lifted:s2.lifted, maxAlt:s2.maxAlt, groundOffsetM:s2.offsetM,
          halfPx:s2.halfPx, glyphHalfPx:s2.glyphHalfPx, thickPx:s2.thickPx,   /* (#R192) same mark = same pixels */
          visible:(()=>{ try{ return !!(GE().layers.has(PLANE3D_LYR)&&GE().layers.getLayout(PLANE3D_LYR,'visibility')==='visible'); }catch(_){ return false; } })(),
          flatVisible:(()=>{ try{ return !!(GE().layers.has('lyr-planes')&&GE().layers.getLayout('lyr-planes','visibility')==='visible'); }catch(_){ return false; } })(),
          selected:selectedPlane, tracked:Object.keys(planeTracks).length, track:trackStats(selectedPlane),
          trackVisible:(()=>{ try{ const l=planes3D?TRACK_3D:TRACK_LINE; return !!(GE().layers.has(l)&&GE().layers.getLayout(l,'visibility')==='visible'); }catch(_){ return false; } })(),
          synthetic:planesSynthetic }; } };
    /* Unified time slider (#8): drive the day-based weather layers from the global news date.
       GIBS imagery lags ~2 days, so clamp future-ish dates back to the freshest processed day. */
    window.setGlobalLayerDate=function(iso){
      const maxIso=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
      let d = iso || maxIso; if(d>maxIso) d=maxIso;
      ['sst','snow','aod','thermal','precip'].forEach(id=>{
        layerDates[id]=d;
        const dp=document.getElementById('dt-'+id); if(dp) dp.value=d;
        if(GE().layers.has('lyr-'+id) && GE().layers.getLayout('lyr-'+id,'visibility')==='visible') refreshDatedLayer(id);
      });
      try{ _refreshLegendDates(); }catch(_){}
    };
    window._trafficFilters=trafficFilters;
    function setLayerOpacity(id,v){ opacities[id]=v;
      if(id==='hdi'||id==='dem'||id==='pop'||id==='milSpend'||id==='milSpendGDP'||id==='gdppc'||id==='tfr'){
        /* Keep no-data countries gray (0.45) — see addChoro for the "<= 0" reasoning. */
        if(GE().layers.has(id+'-fill')) GE().layers.setPaint(id+'-fill','fill-opacity',['case',['<=',['to-number',['feature-state',id],0],0],Math.max(0,v*0.75),v]);
      }
      else if(id==='nato'){ if(GE().layers.has('nato-fill'))GE().layers.setPaint('nato-fill','fill-opacity',v); }
      else if(id==='eu'){ if(GE().layers.has('eu-fill'))GE().layers.setPaint('eu-fill','fill-opacity',v); }
      /* (#R232) the 'night' opacity branch went with the layer — the day/night shading has no opacity knob. */
      else if(id==='planes'){ if(GE().layers.has('lyr-planes'))GE().layers.setPaint('lyr-planes','icon-opacity',v);
        /* (#R172) the lifted bodies follow the same opacity slider; the posts stay fainter than the aircraft */
        try{ if(GE().layers.has(PLANE3D_LYR))GE().layers.setPaint(PLANE3D_LYR,'fill-extrusion-opacity',v);
          if(GE().layers.has(PLANE3D_POST))GE().layers.setPaint(PLANE3D_POST,'fill-extrusion-opacity',Math.min(0.5,v*0.5)); }catch(_){} }
      else if(id==='ships'){ if(GE().layers.has('lyr-ships'))GE().layers.setPaint('lyr-ships','icon-opacity',v); }
      /* (#R184) the satellite layer paints its own icons AND labels, and the eclipsed dimming is part of
         the same expression — so the slider goes to the module rather than to one paint property. */
      else if(id==='sats'){ try{ window.IntMapSatellites&&window.IntMapSatellites.setOpacity(v); }catch(_){} }
      else if(id==='hillshade'){ if(GE().layers.has('lyr-hillshade'))GE().layers.setPaint('lyr-hillshade','hillshade-exaggeration',Math.max(0.05,v)); }
      else if(id==='contours'){ if(GE().layers.has('contour-lines'))GE().layers.setPaint('contour-lines','line-opacity',v); if(GE().layers.has('contour-labels'))GE().layers.setPaint('contour-labels','text-opacity',v); }
      else if(id==='relief'){ if(GE().layers.has('lyr-relief'))GE().layers.setPaint('lyr-relief','color-relief-opacity',v); }
      else if(id==='sealevel'){ if(GE().layers.has('lyr-sealevel'))GE().layers.setPaint('lyr-sealevel','color-relief-opacity',v); }
      /* ⚠ (#R276) ONE number, applied ONCE. This used to multiply the reader's choice by 0.82 before
         handing it on, on top of a colour field that was already being painted at 0.50 — 「風色面の
         二重透過を解消する」. The module applies it to the raster and to the particle canvas itself. */
      else if(id==='wind'){ try{ window.Wind&&window.Wind.setOpacity&&window.Wind.setOpacity(v); }catch(_){} }
      else if(id==='subcables'){ if(GE().layers.has('lyr-subcables'))GE().layers.setPaint('lyr-subcables','line-opacity',v); }
      else if(id==='thermal'){ try{ window._setThermalOpacity(v); }catch(_){} }
      else if(window._opacityTargets&&window._opacityTargets[id]){ _applyGenericOpacity(window._opacityTargets[id],v); }
      else { if(GE().layers.has('lyr-'+id))GE().layers.setPaint('lyr-'+id,'raster-opacity',v); }
    }
    /* ===== (#R19) Opacity for EVERY layer ("どのレイヤーも透明度選択ができるように") =====
       A type-aware setter + a registry mapping a legend id → its MapLibre layer ids. Any module can call
       window._registerLayerOpacity(id,[en,jp],layerIds,cbId) on toggle-ON: it gets a floating generic
       legend whose auto opacity row drives all its layers; _hideGenericLegend(id) on toggle-OFF. */
    window._opacityTargets=window._opacityTargets||{};
    /* ══ (#R205) A NAME IS NOT PART OF THE WASH ═════════════════════════════════════════════════════
       「プレート境界レイヤーのプレート名は透過するな」 — MEASURED: `getPaintProperty('eco-plates-lbl',
       'text-opacity')` came back **0.3**. Nothing in js/layer-packs.js sets it; the value is #R20's
       「プレートは30%から」 default (line below) travelling through this function, which dims a symbol
       layer's TEXT along with everything else the checkbox owns.

       That default is about the plate POLYGONS — a filled overlay at full strength hides the map under
       it, which is what 30 % was asked for. A label is not a wash over the map, it is the map's answer
       to "which plate is this", and at 0.3 over a light basemap it is barely there. So a layer can
       declare that its TEXT stays opaque while its fills and lines keep following the slider. The
       registry is a plain id→true map so the declaration lives next to the layer that needs it
       (js/layer-packs.js) rather than as a special case in here. */
    window._opacityOpaqueText=window._opacityOpaqueText||{};
    const _OP_PROP={fill:'fill-opacity',line:'line-opacity',raster:'raster-opacity',circle:'circle-opacity',heatmap:'heatmap-opacity','fill-extrusion':'fill-extrusion-opacity',hillshade:'hillshade-exaggeration','color-relief':'color-relief-opacity'};
    function _applyGenericOpacity(ids,v){ (ids||[]).forEach(lid=>{ try{ const L=GE().layers.get(lid); if(!L) return;
      if(L.type==='symbol'){ const keep=!!window._opacityOpaqueText[lid];
        try{ GE().layers.setPaint(lid,'icon-opacity',keep?1:v); }catch(_){} try{ GE().layers.setPaint(lid,'text-opacity',keep?1:v); }catch(_){} return; }
      const p=_OP_PROP[L.type]; if(!p) return;
      GE().layers.setPaint(lid,p,(p==='hillshade-exaggeration')?Math.max(0.05,v):v); }catch(_){} }); }
    window._applyGenericOpacity=_applyGenericOpacity;
    window._registerLayerOpacity=function(id,namesEnJp,layerIds,cbId){ try{
      /* (#R20) per-layer defaults: tectonic plates start at 30% per request. */
      /* ⚠ (#R273) 「色が濃すぎて地図を殺している。」 — the warning layer starts at 38 %, not 85 %: it is a
         WASH over the whole world and at 85 % the terrain, the roads and the borders under it are
         gone. Its rank is carried by the outline and its hazard by a label, both of which survive a
         fill you can see through (see the alerts block in js/world-packs.js). */
      if(opacities[id]==null) opacities[id]=((id==='plates'||id==='eco-plates')?0.30:(id==='worldcover'?1:(id==='tz'?0.5:(id==='wpalerts'?0.38:0.85))));   /* (#R40) Land cover 100%; (#R79c) Time zones default 50% */
      window._opacityTargets[id]=layerIds||[];
      /* (#R74) feed the layer-state audit: remember which REAL style layers belong to this checkbox */
      try{ if(cbId&&layerIds&&layerIds.length){ (window._imAuditReg=window._imAuditReg||{})[cbId]=layerIds.slice(); } }catch(_){}
      const el=ensureGenericLegend(id,namesEnJp,cbId);
      if(el){ el.style.display='block'; try{ ensureLegendOpacity(el); }catch(_){} try{ ensureContourDensity(el); }catch(_){} try{ ensureLegendMinimize(el); }catch(_){} try{ tileLegends(); }catch(_){} }
      /* apply the registered default immediately so the layer paints at it (was: slider showed the
         default but the layer kept its hard-coded paint until first slider move) */
      try{ setTimeout(()=>{ try{ setLayerOpacity(id,opacities[id]); }catch(_){} },120); }catch(_){}
      return el; }catch(_){ return null; } };
    window._hideGenericLegend=function(id){ const el=document.getElementById('data-legend-'+id); if(el) el.style.display='none'; try{ tileLegends(); }catch(_){} };
    /* (#R215) a legend that grows after it was registered has to be re-tiled, and the world-data
       families (js/world-packs.js, js/industry-web.js) render their controls INTO this box rather
       than into a second window of their own. Same function every legend already goes through. */
    window._tileLegends=tileLegends;
    /* (#R108/#R109) re-localize every VISIBLE data-layer legend on a language change ("言語設定を変更したとき、すでに
       表示済みのレイヤーの凡例はその言語に切り替わらない"). ROOT CAUSE of the R108 miss: the common legends are
       DEDICATED `.data-legend` built once by makeLegend (NOT `.generic-legend`), so the old selector matched nothing.
       Now: generic legends re-render via ensureGenericLegend (title + description from GENERIC_LEG); dedicated legends
       get their <h4> title refreshed from the layer's CURRENT localized checkbox-label name (which updateI18n/the
       modules already re-localize). */
    window.addEventListener('intmap-lang',()=>{ setTimeout(()=>{ try{
      const _cleanName=(cb)=>{ try{ const lab=cb&&(cb.closest('label')||cb.closest('.lyr-row')); if(!lab) return ''; const sp=lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label')||lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb):not(.dl-drag)'); let s=(sp?sp.textContent:lab.textContent)||''; return s.replace(/\s+/g,' ').trim(); }catch(_){ return ''; } };
      document.querySelectorAll('.data-legend').forEach(el=>{ try{ if(!el||getComputedStyle(el).display==='none') return;
        const id=(el.id||'').replace(/^data-legend-/,''); if(!id) return;
        if(el.classList.contains('generic-legend')&&GENERIC_LEG[id]){ ensureGenericLegend(id); return; }   /* generic → curated multi-lang title + desc */
        const h4=el.querySelector('h4'); if(!h4) return;                                                    /* dedicated → localized layer name from its checkbox */
        const cb=document.getElementById('dl-'+id)||document.getElementById('cb-'+id)||document.getElementById(id);
        const nm=_cleanName(cb); if(nm) h4.textContent=nm;
      }catch(_){} });
    }catch(_){} },40); });
    /* (#R74) LAYER-STATE AUDIT ("レイヤーのオンオフが実情と対応していないことがある" / vision §16-17):
       a background reconciler that compares every layer CHECKBOX against the map's REAL style layers.
       Two mismatch directions, both observed in the wild:
         (a) box checked but nothing painted (source failed silently / a style swap wiped the layer and
             nothing re-added it) → after two consecutive detections the toggle is re-fired once (off→on,
             the same self-heal a human would do), at most once per 4 min per layer;
         (b) box unchecked but the layer is still visible (an engine's off-path missed it) → the stray
             style layers are hidden directly.
       Coverage: a static table for the classic dl-* engine + every layer that registers through
       _registerLayerOpacity (gx-*, bx-*, NATO/EU, webcams, heat, …). Canvas overlays (wind) and
       zoom-gated live traffic are intentionally excluded (their emptiness is legitimate).
       Diagnostics: window.IntMapLayerAudit.{run,check,log} — Atlas reads check() for honest state. */
    window._imAuditReg=window._imAuditReg||{};
    /* (#R81) AUTO-LEARN layer ownership so the reconciler covers EVERY layer, not only the hand-maintained
       tables. Empirically only 31 of 129 checkboxes were audit-covered — the rest (World-Bank, GIBS, ECMWF,
       geo-theory, NATO/EU, …) had NO "checked-but-blank" self-heal, so an occasional wipe left the box ON with
       nothing painted and nothing corrected it (the residual "レイヤーのオンオフと実態が乖離" the user still hit).
       On every toggle-ON we diff the style's layer list to learn which real layer ids that checkbox added and
       feed them to the SAME reconciler. STRICTLY additive + safe: the learned ids are used ONLY for the
       "checked-but-blank" (direction-a) heal — a harmless idempotent re-fire of the box's OWN change handler —
       NEVER to hide a layer (hiding stays with the id-table path + _sweepOrphanLayers), so a mis-attribution can
       at worst cause a needless re-fire of the correct checkbox, never hide the wrong layer. Attribution is
       skipped whenever another checkbox toggles during the capture window (ambiguous → conservative miss, which
       is safe: it just falls back to today's behaviour). */
    window._imLayerOwn=window._imLayerOwn||{};
    (function(){
      if(!GE()||!GE().events) return;
      const SKIP=/^(ofm-|country-|borders-|ref-|gl-|background$|land$|water$|waterway|admin|place-|poi-|road|bridge|tunnel|building|boundary|natural|landcover|landuse|coastline|sat$|layer-sat|nlq-|pl-outline|tool-|measure|radius|user-pin|news-|hl-|highlight|iso-mask|contour-label|imcmp-|imrad-|imroute-|sv-cov-|wind-field)/;   /* (#R84) exclude Atlas overlay layers + the wind colour-field from checkbox ownership learning */
      const snap=()=>{ const s=new Set(); try{ (GE().scene.getStyle().layers||[]).forEach(l=>s.add(l.id)); }catch(_){} return s; };
      let _seq=0;
      function learn(cbId){ const mine=++_seq; const before=snap();
        [500,1800,4000].forEach(ms=>setTimeout(()=>{ try{
          if(mine!==_seq) return;                 /* another checkbox toggled since → ambiguous window, skip */
          const cb=document.getElementById(cbId); if(!cb||!cb.checked) return;
          const now=snap(), own=window._imLayerOwn[cbId]=window._imLayerOwn[cbId]||new Set();
          now.forEach(id=>{ if(before.has(id)||SKIP.test(id)) return;
            for(const k in window._imLayerOwn){ if(k!==cbId&&window._imLayerOwn[k]&&window._imLayerOwn[k].has(id)) return; }   /* first owner keeps it — never steal */
            own.add(id); });
        }catch(_){} },ms)); }
      try{ const dd=document.getElementById('layer-dropdown'); if(dd) dd.addEventListener('change',e=>{ const cb=e.target; if(cb&&cb.type==='checkbox'&&cb.id){ if(cb.checked) learn(cb.id); else _seq++; } }); }catch(_){}
    })();
    (function(){
      const STATIC={
        'dl-climate':['lyr-climate'],'dl-precip':['lyr-precip'],'dl-sst':['lyr-sst'],
        'dl-snow':['lyr-snow'],'dl-aod':['lyr-aod'],'dl-nightsat':['lyr-nightsat'],'dl-popgrid':['lyr-popgrid'],
        'dl-relief':['lyr-relief'],'dl-hillshade':['lyr-hillshade'],'dl-sealevel':['lyr-sealevel'],
        'dl-eez':['lyr-eez'],'dl-radar':['lyr-radar'],   /* (#R232) dl-night deleted with its layer */
        'dl-contours':['contour-lines','contour-labels'],
        'dl-subcables':['lyr-subcables','lyr-subcables-glow','lyr-subcables-pts'],
        'dl-thermal':['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'],
        'dl-pop':['pop-fill'],'dl-hdi':['hdi-fill'],'dl-dem':['dem-fill'],'dl-gdppc':['gdppc-fill'],
        'dl-tfr':['tfr-fill'],'dl-milSpend':['milSpend-fill','milSpendGDP-fill']   /* (#R289) one row, two fills — whichever mode is on */
      };
      /* (#R79) the base VECTOR toggles were never audited (idsFor returned null) — yet they are the most
         VISIBLE layers of all: default-on country borders, place names, water labels, state lines. Those are
         exactly the ones a user notices when the checkbox says ON but the map shows nothing. Cover them with
         the same reconciler. Their change handlers are idempotent + retry-hardened (ensurePlaceLabels /
         ensureBordersLayer / ensureRefLayers / applyCountryVisibility), so the heal is a single gentle
         re-fire of the change event (see BASE branch below) — no off→on flicker of the whole label stack. */
      const BASE={
        'cb-names':['ofm-country','ofm-admin1','ofm-city','ofm-other'],   /* (#R198) admin-1 names are place names — same switch, same audit */
        'cb-geolabels':['ofm-water','ofm-water2','ofm-river','ofm-peak','geo-sea'],
        'cb-poi':['ofm-poi','ofm-poi-dot'],   /* (#R186) shop/facility names — audited like every other label group */
        'cb-borders':['borders-only-line','borders-only-casing'],'cb-countries':['country-fill'],
        'cb-coast':['coast-only-line','coast-only-casing'],   /* (#R289) same source, same race, same heal */
        'cb-admin1':['ref-admin1'],'cb-roads':['ref-roads'],'cb-rail2':['ref-rail']
      };
      const sus={}, healed={}, log=[];
      /* (#R85) NEVER FIGHT THE USER. The checked-but-blank heal pulses a layer off→on to force a re-add; the
         old 2nd half re-checked the box UNCONDITIONALLY, so if the user turned a layer OFF inside the 420 ms
         window it snapped back ON — the "オフにしてるレイヤーが勝手につく" the user still hit on desktop. Now every
         SYNTHETIC dispatch is tagged (cb.__syn) and every GENUINE user toggle is timestamped (cb.__userChangeT,
         via the capture listener below); the re-arm aborts if the user touched the box, and the audit skips any
         box the user toggled in the last 4 s. Purely additive: it can only DECLINE to act, never turn extra on. */
      const RECENT_USER=4000;
      const userTouched=cb=>{ try{ return !!cb.__userChangeT && (Date.now()-cb.__userChangeT)<RECENT_USER; }catch(_){ return false; } };
      const fireSyn=cb=>{ try{ cb.__syn=(cb.__syn||0)+1; }catch(_){} try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }finally{ try{ cb.__syn=Math.max(0,(cb.__syn||1)-1); }catch(_){} } };
      function rearm(cb){ const t0=Date.now();
        try{ cb.checked=false; fireSyn(cb); }catch(_){}
        setTimeout(()=>{ try{ if(cb.__userChangeT&&cb.__userChangeT>t0) return;   /* user intervened during the pulse → respect their choice */
          if(!cb.checked){ cb.checked=true; fireSyn(cb); } }catch(_){} },420); }
      try{ document.addEventListener('change',e=>{ const cb=e.target; try{ if(cb&&cb.type==='checkbox'&&!cb.__syn&&!cb.__reassertGuard&&cb.closest&&cb.closest('#layer-dropdown')) cb.__userChangeT=Date.now(); }catch(_){} },true); }catch(_){}
      const idsFor=cbId=>STATIC[cbId]||BASE[cbId]||window._imAuditReg[cbId]||null;
      function painted(ids){ try{ for(const lid of ids){ if(GE().layers.has(lid)&&GE().layers.getLayout(lid,'visibility')!=='none') return true; } }catch(_){} return false; }
      function check(cbId){ let ids=idsFor(cbId); if(!ids||!ids.length){ const own=window._imLayerOwn&&window._imLayerOwn[cbId]; ids=(own&&own.size)?Array.from(own):null; } if(!ids||!ids.length) return null; return painted(ids); }
      /* (#R190) "is this checkbox's layer really on the map?" — the launch screen asks it too, to
         decide when the map is FINISHED rather than merely quiet (js/app-body.js). Exposing the
         existing reconciler answer is the alternative to a second id table that would rot. */
      window.__imLayerPainted=check;
      /* (#R81) direction-(a) heal for AUTO-LEARNED layers (those with no id-table entry). Checked-but-blank only —
         the exact same 2-hit debounce + 4-min cooldown + idempotent off→on re-fire the id-table path uses. Never
         hides anything (that path stays with the id tables + _sweepOrphanLayers), so learned ids can't mis-hide. */
      /* (#R81) layers whose emptiness is LEGITIMATE (live traffic is zoom-gated / may have no data; wind is a
         canvas) or whose handler is stateful (grid — see #R38) must NOT be re-fired by the learned-heal. Base
         vector toggles never reach here (they are in the BASE id-table). */
      const _LEARN_SKIP=/^(dl-ships|dl-planes|dl-sats|dl-wind|cb-grid)$/;   /* (#R184) +sats: a live layer whose visibility its own module owns */
      /* (#R154) a layer id is owned by exactly ONE checkbox (learn code above never steals), but guard anyway: don't hide
         a learned-owned layer that a DIFFERENT *checked* layer also paints/owns — so an OFF-hide can never mis-hide. */
      function _ownedByCheckedOther(cbId,lid){ try{
          for(const k in window._imLayerOwn){ if(k!==cbId&&window._imLayerOwn[k]&&window._imLayerOwn[k].has(lid)){ const o=document.getElementById(k); if(o&&o.checked) return true; } }
          const boxes=document.querySelectorAll('#layer-dropdown input[type=checkbox]');
          for(let i=0;i<boxes.length;i++){ const o=boxes[i]; if(o.id===cbId||!o.checked) continue; const ids=idsFor(o.id); if(ids&&ids.indexOf(lid)>=0) return true; }
        }catch(_){} return false; }
      /* (#R154) the `!cb.checked` bail here was the "オフにしたレイヤーが表示されてしまう" root cause: for an AUTO-LEARNED
         layer (no id-table entry) toggleLayer(id,false) can't know its layer ids, so it stays painted, and NO reconciler
         hid it (the id-table hide branch never sees it; _sweepOrphanLayers only covers dl-* standard names). Now both
         directions are handled: OFF + still-painted owned layers → hide them (minus any a checked sibling legitimately owns). */
      function _auditLearned(cb){ try{ if(_LEARN_SKIP.test(cb.id)||userTouched(cb)) { sus[cb.id]=0; return; }
        const own=window._imLayerOwn&&window._imLayerOwn[cb.id]; if(!own||!own.size) return;
        const ownArr=Array.from(own);
        if(!cb.checked){
          if(painted(ownArr)){ const safe=ownArr.filter(lid=>!_ownedByCheckedOther(cb.id,lid));
            if(safe.length){ log.push({id:cb.id,t:Date.now(),fix:'hide-learned'}); if(log.length>60) log.shift();
              safe.forEach(lid=>{ try{ if(GE().layers.has(lid)) GE().layers.setLayout(lid,'visibility','none'); }catch(_){} }); } }
          sus[cb.id]=0; return; }
        if(painted(ownArr)){ sus[cb.id]=0; return; }
        sus[cb.id]=(sus[cb.id]||0)+1;
        if(sus[cb.id]>=2&&(!healed[cb.id]||Date.now()-healed[cb.id]>240000)){ healed[cb.id]=Date.now(); sus[cb.id]=0;
          log.push({id:cb.id,t:Date.now(),fix:'rearm-learned'}); if(log.length>60) log.shift();
          rearm(cb); } }catch(_){} }
      function audit(){ try{
        /* (#R170) was gated on isStyleLoaded() — false ~86% of the time while browsing, so the self-heal that
           exists precisely to fix "box on, nothing painted" was itself mostly asleep. It reads getLayer() +
           visibility, which need only a parsed style. */
        if(!_canDraw()) return;
        document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ const ids=idsFor(cb.id); if(!ids||!ids.length){ _auditLearned(cb); return; }
          if(userTouched(cb)){ sus[cb.id]=0; return; }   /* (#R85) defer to a very recent user toggle — never race it */
          const vis=painted(ids);
          if(cb.checked&&!vis){ sus[cb.id]=(sus[cb.id]||0)+1;
            if(sus[cb.id]>=2&&(!healed[cb.id]||Date.now()-healed[cb.id]>240000)){ healed[cb.id]=Date.now(); sus[cb.id]=0;
              log.push({id:cb.id,t:Date.now(),fix:'rearm'}); if(log.length>60) log.shift();
              if(BASE[cb.id]){ /* base vector layer: idempotent handler → ONE gentle re-fire, no label flicker */
                fireSyn(cb); }
              else { rearm(cb); } } }
          else if(!cb.checked&&vis){ log.push({id:cb.id,t:Date.now(),fix:'hide'}); if(log.length>60) log.shift();
            ids.forEach(lid=>{ try{ if(GE().layers.has(lid)) GE().layers.setLayout(lid,'visibility','none'); }catch(_){} }); sus[cb.id]=0; }
          else sus[cb.id]=0; });
      }catch(_){} }
      /* (#R108) periodic audit runs a bit sooner + more often (25s→12s start, 15s→10s cadence) so a checked-but-blank
         layer self-corrects faster ("選択状況と表示状況があっていない"); heal thresholds/cooldown unchanged (safe). */
      setTimeout(()=>{ setInterval(()=>{ if(!document.hidden) audit(); },10000); },12000);
      /* (#R109) TARGETED post-toggle heal — the moment a USER turns a layer ON, check ~2.8 s later whether its layers
         actually painted; if not (and they haven't re-toggled it), re-fire ONCE right away instead of waiting for the
         2-hit background audit. Directly attacks "選択状況と表示状況が合っていない" for a freshly-toggled layer, using
         the SAME cooldown + skip list so it can never fight the user. */
      try{ document.addEventListener('change',e=>{ const cb=e.target;
        try{ if(!(cb&&cb.type==='checkbox'&&!cb.__syn&&cb.checked&&cb.closest&&cb.closest('#layer-dropdown'))) return; if(_LEARN_SKIP.test(cb.id)) return;
          const t0=Date.now(); setTimeout(()=>{ try{ if(!cb.checked) return; if(cb.__userChangeT&&cb.__userChangeT>t0) return;   /* user re-toggled → respect it */
            let ids=idsFor(cb.id); if(!ids||!ids.length){ const own=window._imLayerOwn&&window._imLayerOwn[cb.id]; ids=(own&&own.size)?Array.from(own):null; } if(!ids||!ids.length) return;
            if(painted(ids)) return; if(healed[cb.id]&&Date.now()-healed[cb.id]<240000) return; healed[cb.id]=Date.now();
            log.push({id:cb.id,t:Date.now(),fix:'toggle-heal'}); if(log.length>60) log.shift();
            if(BASE[cb.id]) fireSyn(cb); else rearm(cb); }catch(_){} },2800);
        }catch(_){} },true); }catch(_){}
      /* (#R79) The audit was RIGHT but too SLOW: on a 15s cadence a checked-but-blank layer (source failed,
         or a base-map/style swap wiped the overlay and nothing re-added it) stayed visibly wrong for up to
         ~30s — that latency IS the "レイヤーのオンオフが実情と対応していないことがある" the user still notices.
         Trigger the SAME audit() (same thresholds, same 2-hit debounce, same 4-min heal cooldown) shortly
         after the map SETTLES (idle → every engine's styledata re-add has run) and when the tab regains
         focus (a background wipe otherwise waited out the whole 15s). So real desyncs now self-heal in a
         couple of seconds instead of half a minute — no new heal logic, just more trigger points. */
      try{ let _st=null; const soon=()=>{ clearTimeout(_st); _st=setTimeout(()=>{ if(!document.hidden) audit(); },1200); };
        GE().events.on('idle',soon);
        document.addEventListener('visibilitychange',()=>{ if(!document.hidden) soon(); }); }catch(_){}
      window.IntMapLayerAudit={run:audit,check,log:()=>log.slice(-20)};
    })();
  })();
};
