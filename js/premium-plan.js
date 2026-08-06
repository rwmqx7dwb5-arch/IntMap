/* ============================================================================
 *  IntMap · the premium section — every feature of which is free  (#R200)
 * ----------------------------------------------------------------------------
 *  The Layers-panel "Premium features" section and the pricing modal behind it. There is no paid
 *  plan: refreshProUI() unlocks everything and openProModal() is a no-op, which is exactly why this
 *  belongs outside the core — it is a self-contained piece of UI with its own i18n keys and styles.
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 54 of its 55 lines are byte-identical,
 *  and the 1 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (currentMapType → HOST.mapType),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makePremiumPlan(HOST, CTX) {
  const i18n=CTX.i18n, satRenderController=CTX.satRenderController, satRenderKeyInputs=CTX.satRenderKeyInputs;
  /* ===================== GROUP 4: PREMIUM / PRO PLAN =====================
   *  Fully self-contained (own i18n keys, own <style>, own DOM) so it can never
   *  collide with the map/layer logic, the [data-theme] CSS, or the i18n loop.
   *  Adds a locked "Premium features" section at the very BOTTOM of the layer
   *  dropdown (runs after GROUP 3 has appended its rows) and a centered, iOS
   *  liquid-glass pricing modal that floats above the map without blocking it.
   *  ===================================================================== */
  (function(){
    /* --- i18n keys (merged in; reuses the existing data-i18n update loop) --- */
    Object.assign(i18n.en,{ proSection:"Premium features", proArchive:"🔒 10-Year Time-Travel Archive", proIntel:"🔒 RU·CN Local Primary-Source Intel", proModalTitle:"Unlock IntMap Pro", proModalSub:"Go beyond the live map — deep historical archives and primary-source intelligence." });
    Object.assign(i18n.jp,{ proSection:"プレミアム機能", proArchive:"🔒 過去10年のタイムトラベルアーカイブ", proIntel:"🔒 露・中ローカル一次情報インテリジェンス", proModalTitle:"IntMap Pro を解放", proModalSub:"ライブマップの先へ — 深層アーカイブと一次情報インテリジェンス。" });

    /* --- styles (scoped under .premium-* / .ppm-* ; theme-aware via vars) --- */
    const style=document.createElement('style');
    style.textContent=`
      .premium-divider{ border:0; border-top:1px solid rgba(128,128,128,0.2); width:100%; margin:6px 0 2px; }
      .premium-group-title{ display:flex; align-items:center; gap:6px; }
      .premium-group-title::before{ content:"✦"; color:#d4a017; font-size:11px; }
      .premium-option{ position:relative; }
      .premium-option input[type="checkbox"]{ accent-color:#caa24a; }
      .premium-option span[data-i18n]{ flex:1; min-width:0; }
      .premium-option:hover{ background:linear-gradient(90deg, rgba(212,160,23,0.14), rgba(212,160,23,0.02)); }
      .premium-option .pro-pill{ flex-shrink:0; font-size:9px; font-weight:800; letter-spacing:0.4px; padding:2px 6px; border-radius:6px; color:#7a5a00; background:linear-gradient(135deg,#ffe08a,#e9b949); box-shadow:0 1px 2px rgba(0,0,0,0.18); }

      /* Modal: always laid out (display:flex) but inert when hidden
         (pointer-events:none) so the map underneath stays fully interactive. */
      .ppm-overlay{ position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.42); -webkit-backdrop-filter:saturate(160%) blur(14px); backdrop-filter:saturate(160%) blur(14px); opacity:0; visibility:hidden; pointer-events:none; transition:opacity 0.3s ease, visibility 0.3s ease; }
      .ppm-overlay.show{ opacity:1; visibility:visible; pointer-events:auto; }
      .ppm-card{ position:relative; width:min(940px,96vw); max-height:90vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:26px; padding:30px 30px 26px; transform:scale(0.92) translateY(20px); opacity:0; transition:transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.32s ease; }
      .ppm-overlay.show .ppm-card{ transform:scale(1) translateY(0); opacity:1; }
      .ppm-close{ position:absolute; top:13px; right:14px; width:32px; height:32px; border:none; cursor:pointer; font-size:22px; font-weight:300; line-height:1; color:var(--text-muted); background:transparent; display:flex; align-items:center; justify-content:center; transition:color 0.2s ease; z-index:3; }
      .ppm-close:hover{ color:var(--text-main); }
      .ppm-head{ text-align:center; margin-bottom:22px; padding:0 6px; }
      .ppm-badge{ display:inline-block; font-size:11px; font-weight:800; letter-spacing:1.2px; padding:5px 13px; border-radius:999px; color:#7a5a00; background:linear-gradient(135deg,#ffe08a,#e9b949); box-shadow:0 2px 8px rgba(233,185,73,0.4); margin-bottom:12px; }
      .ppm-title{ margin:0; font-size:26px; font-weight:700; letter-spacing:-0.02em; color:var(--text-main); }
      .ppm-sub{ margin:8px auto 0; max-width:520px; font-size:15px; line-height:1.5; color:var(--text-muted); }
      .ppm-stripe{ border-radius:16px; overflow:hidden; min-height:120px; }
      @media (max-width:768px){
        .ppm-card{ width:100%; max-height:92vh; border-radius:22px; padding:24px 14px 18px; }
        .ppm-title{ font-size:21px; }
        .ppm-sub{ font-size:13px; }
      }`;
    document.head.appendChild(style);

    /* (#R10) Premium/Pro section + pricing modal REMOVED — the app is fully free. The two former
       "premium" layers (proArchive / proIntel) were name-only with no real data, so they're deleted
       entirely (not unlocked). refreshProUI + openProModal are kept as harmless stubs so any lingering
       caller (satellite settings, account menu) does nothing instead of erroring. */
    window.refreshProUI=function(){
      try{ if(typeof HOST.mapType!=='undefined' && HOST.mapType==='sat' && typeof satRenderController==='function') satRenderController(); }catch(_){}
      try{ const sm=document.getElementById('settings-modal'); if(sm && sm.style.display==='flex' && typeof satRenderKeyInputs==='function') satRenderKeyInputs(); }catch(_){}
    };
    window.openProModal=function(){};   /* no-op: there is no paid plan */
    try{ window.refreshProUI(); }catch(_){}
  })();
}
