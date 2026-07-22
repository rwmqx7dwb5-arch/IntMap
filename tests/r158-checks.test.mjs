// R158 source-level regression checks (deterministic, no browser).
// One batch across 10 items: Atlas/Terra execution authority, flight-sim camera teleport, sea water-fill removal,
// satellite quality + grey-tile suppression, Atlas typography + sources, +-attach with files, Companies hover month/day,
// sidebar flicker. Literal-substring assertions guard the exact load-bearing lines against silent regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 80)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 80)));

test('R158 #7 Companies time-series hover shows the real month/day (not just the year)', () => {
  ok('series.push([d.getUTCFullYear()+d.getUTCMonth()/12, cv, ts[i]*1000]);', 'full-history keeps the raw ms timestamp');
  ok('series.push([d.getUTCFullYear()+d.getUTCMonth()/12, +q[i], ts[i]*1000]);', 'per-symbol fine series keeps the timestamp');
  ok('.map(p=>({fy:p[0],v:p[1]*sh,ts:p[2]}))', 'the mcap points carry the timestamp');
  ok('return new Date(+ts).toLocaleDateString(_tsLoc,{year:\'numeric\',month:\'short\',day:\'numeric\'});', 'tooltip formats the real localized date');
  gone("'<div class=\"co-ts-tth\">'+Math.round(Math.min(to,Math.max(from,fyr)))", 'the old year-only header is gone');
});

test('R158 #3 flight-sim sea water-FILL removed; physics floor kept', () => {
  gone("addLayer({id:'fs-ocean-water',type:'fill'", 'no blue water-fill layer');
  gone('function _fsAddOcean(){', 'water-fill builder removed');
  gone('function _fsOceanFC(){', 'inverse-mask ocean polygon builder removed');
  gone('function _fsOceanStyleGuard(){', 'the style-guard is gone');
  ok('function _isOpenOcean(lng,lat){', 'physics ocean discriminator kept');
  ok('if(st._overOcean && terr<0){ terr=0;', 'physics sea-surface floor kept');
});

test('R158 #6 flight-sim camera teleport — FromTo + smoothing + validation + clearance + pinned MapLibre', () => {
  ok('cam=map.calculateCameraOptionsFromTo({lng:eLng,lat:eLat},camAlt,{lng:tLng,lat:tLat},tAlt);', 'eye→fixed-distance-target look (stable center+zoom)');
  ok('const _pk=1-Math.exp(-Math.max(0.001,dt)/0.055); st._cP+=(pitchT-st._cP)*_pk;', 'time-based pitch low-pass (no 1-frame spike)');
  ok('if(_qn>1e-9&&Math.abs(_qn-1)>1e-6) st.q=', 'attitude quaternion normalised');
  ok('let okCam=!!(cam&&cam.center&&_fin(cam.center.lng)', 'every camera output validated (NaN/Inf/range)');
  ok('if(_dC>9000||_dZ>3){ okCam=false;', 'abnormal one-frame jump is skipped (safety net)');
  ok('const camAlt=Math.max(st.alt, _grd+2.5);', 'camera eye altitude floored above smoothed terrain (decoupled from aircraft)');
  ok('try{ if(map&&map.stop) map.stop(); }catch(_){} try{ window.__fsCamSkips=0', 'flight start halts other camera animations (sole controller)');
  ok('https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js', 'MapLibre pinned to an exact version');
  gone('cam=map.calculateCameraOptionsFromCameraLngLatAltRotation', 'the near-horizontal-unstable rotation API is no longer the primary path');
});

test('R158 #8/#9 satellite tile protocol — grey placeholder replaced by real cropped imagery, native kept', () => {
  ok("maplibregl.addProtocol('imapsat'", 'custom satellite tile protocol registered');
  ok('const _SAT_PLACEHOLDER_MAX=3500;', 'grey "no data" placeholder detected by byte length');
  ok('async function _satCrop(buf, dz, subX, subY)', 'nearest real ancestor cropped to the child quadrant');
  ok('for(let up=0; up<13 && az>1; up++)', 'walk-up deep enough for open ocean (Esri imagery ends ~z8)');
  ok("tiles:(window.__imSatProto?['imapsat://{z}/{y}/{x}']", 'base satellite source uses the protocol, with a direct-Esri fallback');
  ok('if(first&&first.buf) return {data: first.buf.slice(0)}; throw e;', 'any error falls back to raw bytes (never worse than before)');
  ok('window.IntMapSatProto=', 'testable resolve hook exposed');
});

test('R158 #10 → R160 sidebar open/close — never moves the map (overlay; per-frame/anchor machinery deleted)', () => {
  // R160 superseded both the R158 (transitionend snap) and R159 (per-frame resize + anchor) schemes with a
  // structural overlay: the map-container is a fixed full-width backdrop, so a toggle can't resize/recentre it.
  gone("window._sbBeginAnim=function(onEnd, anchor)", 'the R159 anchor-taking slide gate is gone');
  gone('window._sbBeginAnim(null, _sbAnchor0)', 'the left toggle no longer drives an anchored slide');
  gone('if (time - start < 450) requestAnimationFrame(sync);', 'the old per-frame 450ms resize loop is gone');
  ok('const coalescedResize=()=>{ if(_rsRAF) return;', 'a plain coalesced resize remains for GENUINE viewport changes only');
  ok('body:not(.ws-mode) .map-container{ position:absolute; inset:0; width:100%; }', 'the map is a fixed full-width backdrop under both sidebars');
});

test('R158 #4 Atlas attach button is "+" and accepts non-image (text) files', () => {
  ok("L('Attach a file (image or text)','ファイルを添付（画像・テキスト）'", 'button relabelled Attach a file (5 languages)');
  ok('let _atlFiles=[];', 'pending non-image file attachments');
  ok('function _atlFileKind(f){', 'image / text / unsupported classifier');
  ok("const _fileBlock=files.length?('\\n\\n[ATTACHED FILE'", 'attached file text is given to the model at the API boundary');
  gone("fi.type='file'; fi.accept='image/*'; fi.multiple=true;", 'the image-only picker restriction is removed');
  ok('function fire(){ const v=inEl.value.trim(); const imgs=_atlImgs.slice(); const files=_atlFiles.slice();', 'files are sent with the message');
});

test('R158 #1 → R159 Atlas typography — no bold, no ## divider; body 14px + mobile lift; still monochrome', () => {
  gone('border-top:1.5px solid rgba(128,128,128,.34)', 'R159 removed the ## hairline divider ("区切りの横線はいらない")');
  ok("font-size:14px;line-height:1.68", 'desktop reply body lifted from 12.5px to 14px');
  ok("style*=\"font-size:14px\"]{font-size:15.5px !important;}", 'mobile still lifts the (now 14px) body');
  // still monochrome — every mdMini heading keeps --text-main (R154 "色分け廃止" preserved) — R159 also drops the bold weight
  ok('.replace(/^##\\s*(.+)$/gm,\'<div style="font-weight:600;color:var(--text-main)', 'H2 heading is semibold (R159 no bold), still --text-main');
});

test('R158 #2 Atlas sources — informational answers gather sources (use:[web] forces the search)', () => {
  ok("const analysisWebMode=(freshness.critical||(use&&use.indexOf('web')>=0))?'required':'auto';", 'an explicit use:[web] forces a live search → citations');
  ok('const informational=q.length>=8 && !SOCIAL.test(q) && (TIMEVAR.test(q)||INFO.test(q));', 'informational answers route to analyze for sources');
  ok('(routed to live analysis for sources)', 'the re-route is recorded honestly');
});

test('R158 #5 Terra is the decision-maker, IntMap the faithful executor', () => {
  // no code-side auto-correction of a wrong identifier
  gone('if(!code&&t.name){ try{ const c=resolveCountrySync(t.name); if(c&&c.code&&valid.has', 'resolveCountrySync auto-rescue removed');
  ok('unresolved.push({name:t.name||\'\', iso3:gi, reason:', 'a wrong/blank identifier is reported as unresolved (not rescued, not dropped)');
  ok('availableIdentifiers:available})', 'a deterministic candidate identifier is REPORTED, not applied');
  // the mechanical structured execution result (the work order contract)
  ok("status:(gUnresolved.length?'partial_or_failed':'ok')", 'structured status');
  ok('renderState:{painted:!!painted, features:(features!=null?features:0), verified:!!verified}', 'observed render state');
  ok("capabilities:{ identifierScheme:'ISO 3166-1 alpha-3', validIdentifierCount:_hlValidCodeSet().size }", 'observed capabilities');
  // fed back to Terra via the repair loop; Terra decides
  ok('if(r&&r.exec) a.__exec=r.exec;', 'runActions captures the execution result');
  ok("a.__exec.status==='partial_or_failed'&&pending.indexOf(a)<0) pending.push(a)", 'a partial execution seeds the repair loop');
  ok('EXECUTION RESULT — IntMap executed your action and OBSERVED', 'the structured result is fed back to the model');
  ok('re-issue the SAME action type with the corrected identifier(s)', 'the model is told it may correct identifiers itself');
});
