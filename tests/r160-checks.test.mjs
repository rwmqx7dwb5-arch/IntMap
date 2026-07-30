// R160 source-level regression checks (deterministic, no browser).
// Batch: (A) right-sidebar default width smaller (340→300); (B) BOTH sidebars OVERLAY a fixed full-width map so
// opening/closing a panel can NEVER resize or recentre the map ("左サイドバー/右サイドバー開閉で地図が勝手に動く"
// の根絶) — the R158/R159 per-frame-resize + edge-anchor machinery is deleted; (C) settings save no longer
// force-reopens the right sidebar ("設定を変更すると勝手に右サイドバーが出てくる"). Literal-substring assertions
// guard the load-bearing lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 90)));

test('R160 (A) right sidebar default width smaller (340 → 300)', () => {
  ok(':root{--lsr-w:min(300px,92vw);}', 'CSS default width 300');
  ok('Math.max(280,Math.min(300,', 'JS default cap 300 (floor 280 kept)');
  gone('--lsr-w:min(340px,92vw)', 'the old 340 default is gone');
  gone('--lsr-w:min(380px,92vw)', 'the old 380 default is gone');
});

test('R160 (B1) the LEFT sidebar keeps its ORIGINAL mechanism, UNCHANGED — SOLID=beside-flex, FROSTED=overlay', () => {
  // SOLID mode: the sidebar is a flex sibling and the map sits beside it (position:relative, NOT an overlay).
  ok('.sidebar{ position:relative; }', 'solid sidebar stays a flex sibling');
  // FROSTED mode ONLY overlays the map (unchanged #23 behaviour).
  ok('body.sidebar-glass .map-container{ position:absolute; inset:0; width:100%; }', 'only the frosted sidebar overlays a full-width map');
  ok('body.sidebar-glass .sidebar{ position:absolute; left:0; top:0; bottom:0; height:100%; z-index:1000;', 'frosted sidebar is the overlay');
  // the wrong overlay-for-everything generalisation AND the transition:none tweak are both reverted — the sidebar
  // CSS is exactly the original (nothing about the mechanism or its animation was touched).
  gone('body:not(.ws-mode) .map-container{ position:absolute; inset:0; width:100%; }', 'the map-container is NOT force-overlaid in solid mode');
  gone('body:not(.sidebar-glass) .sidebar{ transition:none; }', 'the sidebar animation is left as the original (no transition tweak)');
});

test('R160 (B2) the R158/R159 per-frame resize + edge-anchor machinery is DELETED (nothing replaces it)', () => {
  gone('function _sbCaptureAnchor(side){', 'per-frame anchor-capture helper deleted');
  gone('function _sbReanchor(){', 'per-frame reanchor helper deleted');
  gone('function _sbFrame(){', 'per-frame resize loop deleted');
  gone('function _sbFinishAnim(){', 'finish-anim helper deleted');
  // a plain coalesced resize survives, for GENUINE viewport changes only (keyed on _rsRAF, not the old _sbRAF loop)
  ok('const coalescedResize=()=>{ if(_rsRAF) return;', 'plain coalesced resize kept for real window/container resizes');
});

test('R160 (B3) the LEFT toggle does NOTHING to the camera (no pin, no panBy — panBy ROTATES a globe)', () => {
  // The whole point: the toggle only flips `collapsed` + syncs material classes + nudges the pill. It must not call
  // panBy / setPadding / easeTo / map.resize — every one of those moved or rotated the map. The ResizeObserver re-fits.
  ok("try{ applySidebarStyle(false); }catch(_){}   /* material classes only (blur/translucency) — never the camera */", 'toggle syncs material classes only (never the camera)');
  ok("try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}   /* recompute the search-pill layout only */", 'toggle only nudges the search-pill layout');
  // no camera manipulation of ANY kind lives in the toggle handler
  gone('if(solidBeside && map){', 'the R160 edge-pin block is gone');
  gone('map.panBy([-dx,-dy],{duration:0}); }', 'no panBy in the toggle (it would spin the globe)');
});

test('R160 (B4) applySidebarStyle no longer shifts the camera on toggle/style change', () => {
  gone('map.easeTo({padding:_pad, duration:400', 'the frosted optical-center easeTo is gone');
  gone('const pad=(document.body.classList.contains(\'ws-mode\')) ? 0 : (collapsed ? 0 : (sb ? sb.offsetWidth : 440));', 'no sidebar-width padding computed on toggle');
  ok('NO camera padding on toggle or style change anymore', 'documented: the sidebar style change never pans the map');
  ok("document.body.classList.toggle('sidebar-glass', frosted);", 'the frosted material class is still applied');
});

test('R160 (B5) the RIGHT sidebar no longer pushes the map; right HUD slides to clear it; left HUD stays glass-only', () => {
  gone('body.lsr-open .map-container{margin-right', 'the desktop margin-right push is gone (both desktop + mobile variants)');
  gone("mc.style.marginRight=isMob()?'':'var(--lsr-w)'", 'open() no longer pushes the map via inline margin');
  ok('if(mc&&mc.style.marginRight) mc.style.marginRight=', 'open() clears any stale inline margin instead');
  // right-anchored HUD slides left by the panel width while the panel is open
  ok('body.lsr-open:not(.ws-mode) .map-controls-top{ right:calc(var(--lsr-w) + 10px); }', 'top-right controls clear the open right panel');
  ok('body.lsr-open:not(.ws-mode) .news-timeline{ right:calc(var(--lsr-w) + 10px); }', 'the news timeline clears the open right panel');
  // the LEFT sidebar is beside the map in solid mode, so its HUD shift stays FROSTED-only (reverted the generalisation)
  ok('body.sidebar-glass .coord-readout{ left:calc(var(--sidebar-w) + 16px); }', 'coord readout shift is frosted-only again');
  gone('body:not(.ws-mode) .coord-readout{ left:calc(var(--sidebar-w) + 16px); }', 'left HUD is NOT shifted in solid (beside) mode');
});

test('R160 (C) settings save no longer force-reopens the right sidebar', () => {
  // apply() (which always re-opens on desktop) now runs ONLY when the layer-panel MODE actually changed
  ok('const _oldLP=window.imLayerPanel; window.imLayerPanel=v(\'setting-layerpanel\').value;', 'capture the previous layer-panel mode before overwriting it');
  ok('if(_oldLP!==window.imLayerPanel){ try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.apply(); }catch(_){} } }', 'reconcile the panel ONLY on a real mode change');
});

// (D) MapLibre-dependency reduction — Phase 2 of the IntMapGeoEngine renderer abstraction (R152 was Phase 1).
// The adapter/facade contract is broadened with the common camera getters, zoom controls, a render surface and
// feature-state, and the self-contained Atlas camera-control dispatch cases (zoom/bearing/pitch) now read AND
// drive the camera through the engine instead of the raw `map` — so a future engine swap needs no call-site edits.
test('R160 (D1) MapLibreAdapter contract broadened (camera getters, zoom, render, feature-state) — 1:1 pass-through', () => {
  ok('getZoom(){ const m=_m(); return m?m.getZoom():null; }', 'adapter.getZoom');
  ok('getCenter(){ const m=_m(); return m?m.getCenter():null; }', 'adapter.getCenter');
  ok('getBearing(){ const m=_m(); return m?m.getBearing():0; }', 'adapter.getBearing');
  ok('getPitch(){ const m=_m(); return m?m.getPitch():0; }', 'adapter.getPitch');
  ok('getBounds(){ const m=_m(); return m?m.getBounds():null; }', 'adapter.getBounds');
  /* (#R179) the three zoom controls are no longer BARE pass-throughs: each one now records that a
     zoom was named before forwarding it (_declare), because the eye-anchored tilt had no other way
     to tell 「zoom in」 from a gesture and was fighting it — measured, a zoom-button press while
     looking up on the globe drove the viewpoint 2,143 km under the ground. Still 1:1 in the sense
     #R160 meant it: one contract call, one renderer call, no reinterpretation of the argument. */
  ok("zoomTo(z,o){ const m=_m(); if(m){ _declare(m,{zoom:true}); m.zoomTo(z,o); } }", 'adapter.zoomTo');
  ok("zoomIn(o){ const m=_m(); if(m){ _declare(m,{zoom:true}); m.zoomIn(o); } }", 'adapter.zoomIn');
  ok("zoomOut(o){ const m=_m(); if(m){ _declare(m,{zoom:true}); m.zoomOut(o); } }", 'adapter.zoomOut');
  ok('resize(){ const m=_m(); if(m&&m.resize) m.resize(); }', 'adapter.resize');
  ok('triggerRepaint(){ const m=_m(); if(m&&m.triggerRepaint) m.triggerRepaint(); }', 'adapter.triggerRepaint');
  ok('setFeatureState(f,s){ const m=_m(); if(m&&m.setFeatureState) m.setFeatureState(f,s); }', 'adapter.setFeatureState');
  ok('removeFeatureState(f,k){ const m=_m(); if(m&&m.removeFeatureState){', 'adapter.removeFeatureState (with/without key)');
});

test('R160 (D2) IntMapGeoEngine facade exposes the broadened contract', () => {
  /* (#R179) the facade is a FUNCTION of an adapter now (engineFacade(A)), so the bindings read
     `A().x()` rather than `_adapter.x()` — an additional view has to get the same object, and it
     cannot if the object closes over the engine's own adapter. The claim is unchanged. */
  ok('getZoom:()=>A().getZoom(), getCenter:()=>A().getCenter(), getBearing:()=>A().getBearing(), getPitch:()=>A().getPitch(), getBounds:()=>A().getBounds()', 'camera getters on the facade');
  ok('zoomTo:(z,o)=>A().zoomTo(z,o), zoomIn:o=>A().zoomIn(o), zoomOut:o=>A().zoomOut(o), stop:()=>A().stop()', 'zoom controls on the facade');
  ok('setFeatureState:(f,s)=>A().setFeatureState(f,s), removeFeatureState:(f,k)=>A().removeFeatureState(f,k),', 'feature-state on the layers namespace');
  // (#R161) the render namespace gained container/size/setCursor — assert the R160 members only
  ok('render:{ resize:()=>A().resize(), triggerRepaint:()=>A().triggerRepaint(), canvas:()=>A().getCanvas(),', 'render namespace (resize/repaint/canvas)');
});

test('R160 (D3) Atlas camera-control dispatch (zoom/bearing/pitch) reads AND drives via the engine', () => {
  ok('const GE=IntMapGeoEngine.camera; if(a.to!=null){ tz=+a.to; GE.zoomTo(tz,{duration:600}); }', 'zoom case routes through the engine');
  ok('GE.getZoom()-1; GE.zoomOut();', 'zoom-out reads + drives through the engine');
  ok('(a.delta!=null?(GE.getBearing()+(+a.delta)):0)); GE.easeTo({bearing:tb', 'bearing case reads getBearing + drives easeTo through the engine');
  /* (#R171) The literal call shape here was pinning the CLAMP as well as the routing: the tilt ceiling is a
     user setting now (Settings ▸ Map tilt limit), so a hard-coded Math.min(85,…) is exactly what must NOT be
     there, and easeTo takes an options object because an angle past the top also changes the bearing. The
     claim this test exists to make — "reads through the engine, drives through the engine" — is unchanged. */
  ok('(a.delta!=null?(GE.getPitch()+(+a.delta)):(a.on===false?0:60))', 'pitch case reads getPitch through the engine');
  ok('GE.easeTo(opt); }catch(_){}', 'pitch case drives easeTo through the engine');
});
