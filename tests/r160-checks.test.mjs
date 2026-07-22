// R160 source-level regression checks (deterministic, no browser).
// Batch: (A) right-sidebar default width smaller (340→300); (B) BOTH sidebars OVERLAY a fixed full-width map so
// opening/closing a panel can NEVER resize or recentre the map ("左サイドバー/右サイドバー開閉で地図が勝手に動く"
// の根絶) — the R158/R159 per-frame-resize + edge-anchor machinery is deleted; (C) settings save no longer
// force-reopens the right sidebar ("設定を変更すると勝手に右サイドバーが出てくる"). Literal-substring assertions
// guard the load-bearing lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 90)));

test('R160 (A) right sidebar default width smaller (340 → 300)', () => {
  ok(':root{--lsr-w:min(300px,92vw);}', 'CSS default width 300');
  ok('Math.max(280,Math.min(300,', 'JS default cap 300 (floor 280 kept)');
  gone('--lsr-w:min(340px,92vw)', 'the old 340 default is gone');
  gone('--lsr-w:min(380px,92vw)', 'the old 380 default is gone');
});

test('R160 (B1) both sidebars OVERLAY a fixed full-width map (solid AND frosted, desktop, not ws-mode)', () => {
  // the map is a full-bleed backdrop; the sidebar is an absolute overlay — for EVERY sidebar style, not just frosted
  ok('body:not(.ws-mode) .map-container{ position:absolute; inset:0; width:100%; }', 'desktop map-container is a fixed full-width backdrop');
  ok('body:not(.ws-mode) .sidebar{ position:absolute; left:0; top:0; bottom:0; height:100%; z-index:1000;', 'desktop sidebar overlays the map (solid + frosted)');
  ok('body:not(.ws-mode) .sidebar.collapsed{ margin-left:calc(-1 * var(--sidebar-w)); }', 'collapsing slides the overlay off-screen (reveals the map, never shifts it)');
  // the old glass-ONLY overlay rules are generalised away (they no longer gate on sidebar-glass)
  gone('body.sidebar-glass .map-container{ position:absolute; inset:0; width:100%; }', 'overlay layout is no longer frosted-only');
});

test('R160 (B2) the R158/R159 per-frame-resize + edge-anchor machinery is DELETED', () => {
  gone('function _sbCaptureAnchor(side){', 'anchor-capture helper deleted');
  gone('function _sbReanchor(){', 'reanchor helper deleted');
  gone('function _sbFrame(){', 'per-frame resize loop deleted');
  gone('function _sbFinishAnim(){', 'finish-anim helper deleted');
  gone('map.panBy([-dx,-dy],{duration:0})', 'no per-frame pan compensation anymore');
  gone("const _sbAnchor0=(!document.body.classList.contains('sidebar-glass') && !isMobile()) ? _sbCaptureAnchor('left') : null;", 'left toggle no longer captures an anchor');
  // a plain coalesced resize survives, for GENUINE viewport changes only (keyed on _rsRAF, not the old _sbRAF loop)
  ok('const coalescedResize=()=>{ if(_rsRAF) return;', 'plain coalesced resize kept for real window/container resizes');
  ok('window._sbBeginAnim=function(onEnd){', 'back-compat shim: no animation, just fire the callback');
});

test('R160 (B3) the LEFT toggle touches nothing but the panel + pill layout (no camera, no resize)', () => {
  ok("try{ applySidebarStyle(false); }catch(_){}   /* keep the frost/material classes in sync; NO camera padding */", 'toggle only syncs material classes (no camera padding)');
  ok("try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}   /* nudge ms-narrow", 'toggle nudges ms-narrow (sidebar size unchanged so RO will not)');
});

test('R160 (B4) applySidebarStyle no longer shifts the camera on toggle/style change', () => {
  gone('map.easeTo({padding:_pad, duration:400', 'the frosted optical-center easeTo is gone');
  gone('const pad=(document.body.classList.contains(\'ws-mode\')) ? 0 : (collapsed ? 0 : (sb ? sb.offsetWidth : 440));', 'no sidebar-width padding computed on toggle');
  ok('NO camera padding on toggle or style change anymore', 'documented: the sidebar style change never pans the map');
  // material classes are still driven (blur/translucency)
  ok("document.body.classList.toggle('sidebar-glass', frosted);", 'the frosted material class is still applied');
});

test('R160 (B5) the RIGHT sidebar no longer pushes the map; HUD slides to clear the overlay', () => {
  gone('body.lsr-open .map-container{margin-right', 'the desktop margin-right push is gone (both desktop + mobile variants)');
  gone("mc.style.marginRight=isMob()?'':'var(--lsr-w)'", 'open() no longer pushes the map via inline margin');
  ok('if(mc&&mc.style.marginRight) mc.style.marginRight=', 'open() clears any stale inline margin instead');
  // right-anchored HUD slides left by the panel width while the panel is open
  ok('body.lsr-open:not(.ws-mode) .map-controls-top{ right:calc(var(--lsr-w) + 10px); }', 'top-right controls clear the open right panel');
  ok('body.lsr-open:not(.ws-mode) .news-timeline{ right:calc(var(--lsr-w) + 10px); }', 'the news timeline clears the open right panel');
  // left-anchored HUD shift is generalised to all overlay styles (was glass-only)
  ok('body:not(.ws-mode) .coord-readout{ left:calc(var(--sidebar-w) + 16px); }', 'coord readout clears the (always-overlaying) left sidebar');
  ok('body:not(.ws-mode) .country-info{ left:calc(var(--sidebar-w) + 24px); }', 'country-info popup clears the left sidebar');
  // ms-narrow accounts for the left overlay in every style, not just frosted
  ok("if(!document.body.classList.contains('ws-mode')){ const sb=document.querySelector('.sidebar'); if(sb&&!sb.classList.contains('collapsed')&&getComputedStyle(sb).position==='absolute')", 'the search pill avoids the left overlay in every sidebar style');
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
  ok('zoomTo(z,o){ const m=_m(); if(m) m.zoomTo(z,o); }', 'adapter.zoomTo');
  ok('zoomIn(o){ const m=_m(); if(m) m.zoomIn(o); }', 'adapter.zoomIn');
  ok('zoomOut(o){ const m=_m(); if(m) m.zoomOut(o); }', 'adapter.zoomOut');
  ok('resize(){ const m=_m(); if(m&&m.resize) m.resize(); }', 'adapter.resize');
  ok('triggerRepaint(){ const m=_m(); if(m&&m.triggerRepaint) m.triggerRepaint(); }', 'adapter.triggerRepaint');
  ok('setFeatureState(f,s){ const m=_m(); if(m&&m.setFeatureState) m.setFeatureState(f,s); }', 'adapter.setFeatureState');
  ok('removeFeatureState(f,k){ const m=_m(); if(m&&m.removeFeatureState){', 'adapter.removeFeatureState (with/without key)');
});

test('R160 (D2) IntMapGeoEngine facade exposes the broadened contract', () => {
  ok('getZoom:()=>_adapter.getZoom(), getCenter:()=>_adapter.getCenter(), getBearing:()=>_adapter.getBearing(), getPitch:()=>_adapter.getPitch(), getBounds:()=>_adapter.getBounds()', 'camera getters on the facade');
  ok('zoomTo:(z,o)=>_adapter.zoomTo(z,o), zoomIn:o=>_adapter.zoomIn(o), zoomOut:o=>_adapter.zoomOut(o), stop:()=>_adapter.stop()', 'zoom controls on the facade');
  ok('setFeatureState:(f,s)=>_adapter.setFeatureState(f,s), removeFeatureState:(f,k)=>_adapter.removeFeatureState(f,k)', 'feature-state on the layers namespace');
  ok('render:{ resize:()=>_adapter.resize(), triggerRepaint:()=>_adapter.triggerRepaint(), canvas:()=>_adapter.getCanvas() }', 'render namespace (resize/repaint/canvas)');
});

test('R160 (D3) Atlas camera-control dispatch (zoom/bearing/pitch) reads AND drives via the engine', () => {
  ok('const GE=IntMapGeoEngine.camera; if(a.to!=null){ tz=+a.to; GE.zoomTo(tz,{duration:600}); }', 'zoom case routes through the engine');
  ok('GE.getZoom()-1; GE.zoomOut();', 'zoom-out reads + drives through the engine');
  ok('(a.delta!=null?(GE.getBearing()+(+a.delta)):0)); GE.easeTo({bearing:tb', 'bearing case reads getBearing + drives easeTo through the engine');
  ok('(a.delta!=null?(GE.getPitch()+(+a.delta)):(a.on===false?0:60)); tp=Math.max(0,Math.min(85,tp)); GE.easeTo({pitch:tp,duration:600});', 'pitch case reads getPitch + drives easeTo through the engine');
});
