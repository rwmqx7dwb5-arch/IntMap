/* ============================================================================
 *  IntMap · Live webcams layer — IntMapModules.cameras  (#R164)
 * ----------------------------------------------------------------------------
 *  The keyless live-camera layer: Overpass-discovered webcams plus TfL / Caltrans / Finland /
 *  OTCM / OneStop feeds, viewport-driven loading, and the in-map preview popup (#dl-webcams row).
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
import { everyTick, stopTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */
import { overpassQuery } from './overpass.js';   /* the one Overpass client, with a clock — js/overpass.js */
import { fetchViaProxy } from './proxy-fetch.js';   /* (own-fetch-relay) the app's ONE relay ladder — the 511 lists ride fetch-relay */
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { icon, iconNode, iconImageData } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import * as bus from './bus.js';

export function cameras(HOST){
 const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const satToast=HOST.satToast;
  (function(){
    if(!GE().hasRenderer()) return;
    const LLw=IntMapLang.pick(()=>HOST.lang);
    const lbl=()=>LLw('Live cameras','ライブカメラ','Live-Kameras','Веб-камеры','Cámaras en vivo');
    let on=false, popup=null, fetching=false, lastBox=null, lastZoom=-1, moveT=null, camById={}, tflDone=false, caltransDone=false, finlandDone=false, otcmDone=false, oneStopDone=false, refreshTimer=null, _osDataT=null;
    function fc(){ const a=[]; for(const k in camById) a.push(camById[k]); return {type:'FeatureCollection',features:a}; }
    function ytId(u){ const m=/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/.exec(u||''); return m?m[1]:null; }
    /* only classify a cam we can ACTUALLY DISPLAY — '' means link-out-only, which we now DROP (the facade cause) */
    /* ⚠ SEC: THE PANORAMA EMBED IS THE ONE IFRAME HERE WHOSE URL COMES FROM OSM, i.e. from anyone with
       an OSM account, and it is framed WITHOUT a sandbox. The gate on it was
       `/roundshot\.com|panomax\.com/i.test(u)` — a substring test on the WHOLE url, so
       `https://attacker.example/?ref=roundshot.com` classified as a panorama and got framed. The two
       providers are hosts, so the test is on the HOST, with a dot boundary (a neighbour that merely ends
       in the same letters is a different party). Legitimate URLs are unaffected: every roundshot/panomax
       webcam in OSM is on those domains. */
    function _panoHost(u){ try{ var h=new URL(String(u),location.href).hostname.toLowerCase();
      return ['roundshot.com','panomax.com'].some(function(d){ return h===d||h.endsWith('.'+d); });
    }catch(_){ return false; } }
    function classify(u){ u=String(u||''); if(!u) return ''; if(ytId(u)) return 'yt'; if(_panoHost(u)) return 'pano'; if(/\.(mp4|webm)(\?|#|$)/i.test(u)) return 'video'; if(/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)||/(?:snapshot|current\.jpg|image\.jpg|axis-cgi\/(?:mjpg|jpg)|cam\.jpg|webcam\.jpg|\/jpg\/image)/i.test(u)) return 'img';
      /* (#R87b) also accept standard single-shot IP-camera JPEG endpoints (Canon GetOneShot/wvhttp, Panasonic
         SnapshotJPEG, generic cgi-bin image / ?action=snapshot) — these return a real JPEG that displays + refreshes
         cleanly. HTTPS-only so we never add a dead mixed-content pin (an http cam can't load on an https page). */
      if(/^https:/i.test(u)&&/getoneshot|snapshotjpeg|oneshotimage|wvhttp|nph-(?:jpeg|update)|[?&]action=snapshot|\/cgi-bin\/[^?]*(?:jpe?g|image|snapshot)/i.test(u)) return 'img';
      return ''; }
    function _stopRefresh(){ if(refreshTimer){ stopTick(refreshTimer); refreshTimer=null; } }
    function contains(a,c){ return a&&c&&a[0]<=c[0]&&a[1]<=c[1]&&a[2]>=c[2]&&a[3]>=c[3]; }
    function ensure(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource('webcams-src')) GE().layers.addSource('webcams-src',{type:'geojson',data:fc()});
      try{ if(!GE().scene.hasImage('im-icon-camera')) GE().scene.addImage('im-icon-camera',iconImageData('camera',48),{pixelRatio:2}); }catch(_){}   /* (icon-system) re-registered after a style change, which drops images */
      if(!GE().layers.has('webcams-pt')){
        GE().layers.add({id:'webcams-pt',type:'circle',source:'webcams-src',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,3,6,5,11,7],'circle-color':['coalesce',['get','col'],['match',['get','kind'],'tfl','#ff6d00','yt','#ff3b30','pano','#00b8d4','video','#a142f4','#00c853']],'circle-stroke-color':'#fff','circle-stroke-width':1.3,'circle-opacity':0.92}});
        GE().layers.add({id:'webcams-ico',type:'symbol',source:'webcams-src',minzoom:6,layout:{visibility:'none','icon-image':'im-icon-camera','icon-size':0.5,'icon-allow-overlap':false}});
        GE().events.onLayer('click','webcams-pt',(e)=>{ if(!e.features||!e.features.length) return; openCam(e.features[0]); });
        GE().events.onLayer('mouseenter','webcams-pt',()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave','webcams-pt',()=>{ GE().render.canvas().style.cursor=''; });
      }
      return true; }catch(_){ return false; } }
    function openCam(f){ _stopRefresh(); const p=f.properties||{}; const nm=String(p.n||'Camera').replace(/[<>]/g,''); const url=String(p.url||''); const kind=String(p.kind||''); const c=f.geometry.coordinates.slice();
      const box='width:300px;max-width:80vw;';
      const offlineMsg='<div class="wc-off" style="display:none;'+box+'font-size:11.5px;color:var(--text-muted);padding:8px 0;line-height:1.5;">'+LLw('This camera is momentarily offline.','このカメラは現在オフラインです。','Diese Kamera ist momentan offline.','Камера временно недоступна.','La cámara está temporalmente fuera de línea.')+'</div>';
      let media='';
      if(kind==='yt'){ const yt=ytId(url); media='<div style="position:relative;'+box+'height:170px;border-radius:11px;overflow:hidden;background:#000;"><iframe src="https://www.youtube-nocookie.com/embed/'+yt+'?autoplay=1&mute=1&playsinline=1&rel=0" width="100%" height="100%" style="border:0;position:absolute;inset:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe></div>'; }
      else if(kind==='pano'){ media='<div style="position:relative;'+box+'height:175px;border-radius:11px;overflow:hidden;background:#000;"><iframe src="'+IntMapSafe.html(IntMapSafe.url(url))+'" width="100%" height="100%" style="border:0;position:absolute;inset:0;" allowfullscreen referrerpolicy="no-referrer" loading="lazy"></iframe></div>'; }   /* (#R138 SEC) OSM-editable webcam url → http(s)-only + escape (an unvalidated javascript: iframe src runs in our origin) */
      else if(kind==='video'){ media='<div style="position:relative;'+box+'">'+'<video class="wc-live" src="'+IntMapSafe.html(IntMapSafe.url(url))+'" autoplay muted loop playsinline style="'+box+'border-radius:11px;display:block;background:#000;" data-im-error="webcamOffline"></video>'+offlineMsg+'</div>'; }
      else { const base=IntMapSafe.url((kind==='tfl')?String(p.img||''):url); const bust=base?(base+(base.indexOf('?')>=0?'&':'?')+'_t='+Date.now()):''; media='<div style="position:relative;'+box+'">'+'<img class="wc-live" data-base="'+IntMapSafe.html(base)+'" src="'+IntMapSafe.html(bust)+'" referrerpolicy="no-referrer" style="'+box+'border-radius:11px;display:block;background:#000;min-height:60px;" data-im-error="webcamOffline">'+offlineMsg+'</div>'; }   /* (#R138 SEC) validate+escape webcam image url */
      /* the credit is built from the feed (OpenTrafficCamMap's state/agency names, 511 hosts) — escaped */
      const srcTxt=IntMapSafe.html(p.attr||(kind==='tfl'?'© Transport for London':'© OpenStreetMap'));
      const refreshTxt=(kind!=='yt'&&kind!=='pano')?(LLw('↻ live','↻ ライブ','↻ live','↻ вживую','↻ en vivo')+' · '):'';
      /* (#R87) a station with several camera views (Finland weather stations) → switchable thumbnails; tapping one
         swaps the main live image (the refresh loop then keeps THAT view live via its data-base). */
      let gallery='';
      if(p.presets){ try{ const arr=JSON.parse(p.presets); if(arr&&arr.length>1){ gallery='<div class="wc-gal" style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">'+arr.slice(0,8).map((u,i)=>{ const su=IntMapSafe.url(u); if(!su) return '';   /* OSM-editable preset URLs: http(s) only, like the main view above */ return '<button class="wc-thumb" data-u="'+IntMapSafe.html(su)+'" title="'+LLw('View','ビュー','Ansicht','Вид','Vista')+' '+(i+1)+'" style="width:46px;height:34px;border-radius:5px;overflow:hidden;border:1px solid rgba(128,128,128,0.35);background:#000;cursor:pointer;padding:0;"><img src="'+IntMapSafe.html(su+(su.indexOf('?')>=0?'&':'?')+'_t='+Date.now())+'" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;"></button>'; }).join('')+'</div>'; } }catch(_){} }
      const html='<div style="font-weight:700;font-size:13px;margin:0 0 7px;display:flex;align-items:center;gap:6px;">'+icon('camera')+' '+nm
        +' <span style="font-size:9px;font-weight:800;letter-spacing:.4px;background:#ff3b30;color:#fff;border-radius:4px;padding:1px 5px;">LIVE</span></div>'
        +media+gallery
        +'<div style="margin-top:7px;display:flex;justify-content:space-between;align-items:center;gap:8px;"><span style="font-size:10px;color:var(--text-muted);">'+refreshTxt+srcTxt+'</span>'
        +'<a href="'+IntMapSafe.html(IntMapSafe.url(url||p.video||p.img)||'#')+'" target="_blank" rel="noopener" style="font-size:11.5px;font-weight:600;color:var(--primary-color);text-decoration:none;white-space:nowrap;">'+LLw('Source','ソース','Quelle','Источник','Fuente')+' ↗</a></div>';   /* (#R138 SEC) http(s)-only + escape */
      if(popup) popup.remove();
      popup=GE().ui.attach(GE().ui.popup({offset:14,closeButton:true,maxWidth:'330px',className:'plc-popup webcam-popup'}).setLngLat(c).setHTML(html));
      try{ popup.on('close',_stopRefresh); }catch(_){}
      /* (#R87) thumbnail → swap the main live image to that view */
      try{ const root=popup.getElement&&popup.getElement(); if(root){ root.addEventListener('click',ev=>{ const b=ev.target&&ev.target.closest&&ev.target.closest('.wc-thumb'); if(!b) return; const u=b.getAttribute('data-u'); const main=root.querySelector('img.wc-live'); if(main&&u){ main.setAttribute('data-base',u); main.style.display='block'; const off=main.parentNode&&main.parentNode.querySelector('.wc-off'); if(off) off.style.display='none'; main.src=u+(u.indexOf('?')>=0?'&':'?')+'_t='+Date.now(); } }); } }catch(_){}
      /* (#R86) genuinely LIVE: re-fetch the still image every 4 s while the popup is open (cache-busted) */
      /* ⚠ (#R408) ONE key, not one per camera: this module holds ONE `popup` and ONE `refreshTimer`, and openCam opens by
         calling _stopRefresh() and popup.remove() first — two popups cannot exist, so two of these cannot either. A key
         carrying the camera id would be a key that is never reused, i.e. a missed stop could never be replaced. */
      if(kind==='img'||kind==='tfl'){ refreshTimer=everyTick('cameras:popup-refresh',4000,()=>{ try{ const root=popup&&popup.getElement&&popup.getElement(); const el=root&&root.querySelector('img.wc-live'); if(!el){ _stopRefresh(); return; } const b=el.getAttribute('data-base')|| (kind==='tfl'?String(p.img||''):url); if(!b){ _stopRefresh(); return; } el.style.display='block'; const off=el.parentNode&&el.parentNode.querySelector('.wc-off'); if(off) off.style.display='none'; el.src=b+(b.indexOf('?')>=0?'&':'?')+'_t='+Date.now(); }catch(_){ _stopRefresh(); } }); }
    }
    /* (icon-system) the legend's swatches, in the colours the pins are painted (each feed's `col`, and the circle layer's
       default for OpenStreetMap) — they were coloured emoji that only approximated them. The markup tag escapes the
       sentence's words; the swatches are markup it made. */
    const CAM_COL={osm:'#00c853',tfl:'#ff6d00',ct:'#2979ff',fi:'#ffab00',us:'#e0409a','511':'#00bfa5'};
    function camLegend(t){
      const parts=String(t).split(/\{(osm|tfl|ct|fi|us|511)\}/).map((p,i)=>(i%2)?IntMapSafe.markup`<span style="color:${CAM_COL[p]}">${icon('dot',{size:'0.85em'})}</span>`:p);
      return IntMapSafe.markup`${parts}`; }
    function updateLegend(){ try{ const el=window._registerLayerOpacity&&window._registerLayerOpacity('webcams',[lbl(),lbl(),lbl(),lbl()],['webcams-pt','webcams-ico'],'dl-webcams'); if(el){ let h=el.querySelector('.wc-note'); if(!h){ h=document.createElement('div'); h.className='wc-note'; h.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; el.appendChild(h);} const n=Object.keys(camById).length;
      h.innerHTML=camLegend(LLw(n+' live cameras loaded · every pin plays real imagery · pan/zoom for more · OpenStreetMap {osm} · TfL London {tfl} · Caltrans {ct} · Fintraffic Finland {fi} · US DOTs CO/IN/AK/AZ {us} · US/Canada 511 DOTs {511}', 'ライブカメラ '+n+' 台読込 · 各ピンが実映像を再生 · 移動/拡大で追加 · OpenStreetMap{osm} · ロンドンTfL{tfl} · Caltrans{ct} · フィンランドFintraffic{fi} · 米州DOT（CO/IN/AK/AZ）{us} · 米国/カナダ 511 各州DOT{511}', n+' Live-Kameras · jeder Pin zeigt echtes Bild · OpenStreetMap {osm} · TfL {tfl} · Caltrans {ct} · Fintraffic {fi} · US-DOTs {us} · US/Kanada 511 {511}', n+' камер · живое изображение · OpenStreetMap {osm} · TfL {tfl} · Caltrans {ct} · Fintraffic {fi} · US-DOT {us} · США/Канада 511 {511}', n+' cámaras en vivo · imagen real · OpenStreetMap {osm} · TfL {tfl} · Caltrans {ct} · Fintraffic {fi} · US DOT {us} · EE.UU./Canadá 511 {511}')); } }catch(_){} }
    /* (#R86) Transport for London JamCams — 882 live traffic cams (keyless, refreshing JPEG + MP4 clip). Fetched
       ONCE; every camera plays real live imagery. A genuinely-real, dense example alongside the worldwide OSM set. */
    function loadTfL(){ if(tflDone) return; tflDone=true;
      fetch('https://api.tfl.gov.uk/Place/Type/JamCam').then(r=>r.ok?r.json():null).then(arr=>{ if(!Array.isArray(arr)) return; let add=0;
        arr.forEach(cm=>{ const ap={}; (cm.additionalProperties||[]).forEach(x=>{ ap[x.key]=x.value; }); if(String(ap.available)==='false'||!ap.imageUrl) return; const id='tfl_'+cm.id; if(camById[id]) return;
          camById[id]={type:'Feature',id:id,geometry:{type:'Point',coordinates:[+cm.lon,+cm.lat]},properties:{n:cm.commonName||'Traffic camera',url:ap.imageUrl||'',kind:'tfl',img:ap.imageUrl||'',video:ap.videoUrl||'',net:'tfl',col:'#ff6d00',attr:'© Transport for London'}}; add++; });
        if(add){ try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){} try{ if(on) updateLegend(); }catch(_){} }
      }).catch(()=>{ tflDone=false; }); }
    /* (#R87) Caltrans (California DOT) CCTV — ~3,500 live traffic cameras across the state's 12 districts, keyless
       open JSON, each a direct refreshing JPEG (`currentImageURL`, updated ~5 min). Fetched ONCE per district. A
       whole US state that previously showed almost nothing now shows thousands of genuinely-displaying cameras. */
    function loadCaltrans(){ if(caltransDone) return; caltransDone=true;
      for(let d=1; d<=12; d++){ const dd='d'+d, DD='D'+(d<10?'0'+d:''+d);
        fetch('https://cwwp2.dot.ca.gov/data/'+dd+'/cctv/cctvStatus'+DD+'.json').then(r=>r.ok?r.json():null).then(j=>{ if(!j||!Array.isArray(j.data)) return; let add=0;
          j.data.forEach(rec=>{ const c=rec&&rec.cctv; if(!c||!c.location) return; if(String(c.inService)!=='true') return; const st=c.imageData&&c.imageData.static; const img=st&&st.currentImageURL; if(!img) return;
            const lon=+c.location.longitude, lat=+c.location.latitude; if(!isFinite(lon)||!isFinite(lat)||(!lon&&!lat)) return; const id='ca_'+dd+'_'+c.index; if(camById[id]) return;
            camById[id]={type:'Feature',id:id,geometry:{type:'Point',coordinates:[lon,lat]},properties:{n:c.location.locationName||('Caltrans '+(c.location.nearbyPlace||'camera')),url:img,kind:'img',net:'ca',col:'#2979ff',attr:'© Caltrans (California DOT)'}}; add++; });
          if(add){ try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){} try{ if(on) updateLegend(); }catch(_){} }
        }).catch(()=>{}); }
    }
    /* (#R87) Finland — Fintraffic / Digitraffic road weather cameras — 811 stations, 2,272 live camera views
       (each preset a real direction). Keyless open API (CORS-enabled); the preset id maps deterministically to a
       direct JPEG at weathercam.digitraffic.fi. One pin per station; the popup shows every view of that station. */
    function loadFinland(){ if(finlandDone) return; finlandDone=true;
      fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations').then(r=>r.ok?r.json():null).then(j=>{ if(!j||!Array.isArray(j.features)) return; let add=0;
        j.features.forEach(ft=>{ const g=ft.geometry&&ft.geometry.coordinates, pr=ft.properties||{}; if(!g||g.length<2) return;
          const presets=(pr.presets||[]).filter(p=>p&&p.id&&p.inCollection!==false); if(!presets.length) return;
          const imgs=presets.map(p=>'https://weathercam.digitraffic.fi/'+p.id+'.jpg'); const id='fi_'+pr.id; if(camById[id]) return;
          const nm=String(pr.name||'').replace(/_/g,' ').trim()||'Weather camera';
          camById[id]={type:'Feature',id:id,geometry:{type:'Point',coordinates:[+g[0],+g[1]]},properties:{n:nm,url:imgs[0],kind:'img',net:'fi',col:'#ffab00',attr:'© Fintraffic / Digitraffic',presets:JSON.stringify(imgs).slice(0,1800)}}; add++; });
        if(add){ try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){} try{ if(on) updateLegend(); }catch(_){} }
      }).catch(()=>{ finlandDone=false; }); }
    /* (#R87) MORE US STATE DOT cameras via the OpenTrafficCamMap open dataset (MIT, crowdsourced, served from the
       jsDelivr CDN so the LIST is keyless + CORS-OK). PINNED to a commit for a stable schema. Only the hosts whose
       images were verified to actually HOTLINK are allowlisted (Colorado / Indiana / Alaska / Arizona = 1,815 cams);
       M3U8 video streams and hosts that don't hotlink (e.g. Ohio, Kentucky) are dropped so no pin is a dead facade.
       California is skipped (already covered by the official Caltrans layer). */
    function loadOTCM(){ if(otcmDone) return; otcmDone=true;
      const ALLOW={'cocam.carsprogram.org':['CO','© Colorado DOT'],'public.carsprogram.org':['IN','© Indiana DOT (INDOT)'],'511.alaska.gov':['AK','© Alaska DOT&PF'],'az511.gov':['AZ','© Arizona DOT']};
      fetch('https://cdn.jsdelivr.net/gh/AidanWelch/OpenTrafficCamMap@362223187b5b00b87d78cb8a321e25dbb89aae32/cameras/USA.json').then(r=>r.ok?r.json():null).then(j=>{ if(!j||typeof j!=='object') return;
        /* group by site coordinate: a location often has several directional views — one pin, all views in the popup */
        const groups={};
        for(const st in j){ if(st==='California') continue; const cs=j[st]; if(!cs||typeof cs!=='object') continue;
          for(const cty in cs){ const arr=cs[cty]; if(!Array.isArray(arr)) continue; arr.forEach(c=>{ try{ if(!c||!c.url||String(c.format||'').indexOf('IMAGE')<0) return;
            let h=''; try{ h=new URL(c.url).host; }catch(_){ return; } const meta=ALLOW[h]; if(!meta) return;
            const lon=+c.longitude, lat=+c.latitude; if(!isFinite(lon)||!isFinite(lat)||(!lon&&!lat)) return;
            const u=String(c.url).replace(/\?\d{10,}$/,''); const key=lat.toFixed(5)+'_'+lon.toFixed(5);
            let g=groups[key]; if(!g){ g=groups[key]={lon:lon,lat:lat,urls:[],desc:c.description||'Traffic camera',attr:meta[1]+' ('+meta[0]+') · via OpenTrafficCamMap'}; }
            if(g.urls.indexOf(u)<0 && g.urls.length<10) g.urls.push(u); }catch(_){} }); }
        }
        let add=0;
        for(const key in groups){ const g=groups[key]; if(!g.urls.length) continue; const id='otcm_'+key; if(camById[id]) continue;
          camById[id]={type:'Feature',id:id,geometry:{type:'Point',coordinates:[g.lon,g.lat]},properties:{n:g.desc,url:g.urls[0],kind:'img',net:'us',col:'#e0409a',attr:g.attr,presets:JSON.stringify(g.urls).slice(0,1800)}}; add++; }
        if(add){ try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){} try{ if(on) updateLegend(); }catch(_){} }
      }).catch(()=>{ otcmDone=false; }); }
    /* (#R96c) US-state + Canadian-province DOT "511" traffic cameras — a huge keyless network on the shared "511"
       map platform. The marker list (/map/mapIcons/Cameras → item2:[{itemId,location:[lat,lon],title}]) has no CORS
       header so it is fetched ONCE per site through the app's proxy ladder, but every camera IMAGE hotlinks DIRECTLY
       and auto-refreshing at /map/Cctv/{itemId} (verified: list-access AND image-display both tested per site — no
       facades). ~17,000 cameras across 13 regions (FL/GA/NY/PA/NC/NV/WI/ID/LA + New England + Ontario/Alberta/Yukon)
       that previously showed nothing. Staggered so our relay (own-fetch-relay; a shared public proxy before it) isn't hit by 13 simultaneous requests. */
    const ONESTOP=[
      ['fl511.com','© Florida DOT · FL511'],['511ga.org','© Georgia DOT · 511GA'],['511ny.org','© New York State DOT · 511NY'],
      ['www.511pa.com','© PennDOT · 511PA'],['drivenc.gov','© NCDOT · DriveNC'],['511on.ca','© Ontario MTO · 511 Ontario'],
      ['nvroads.com','© Nevada DOT · NV Roads'],['511wi.gov','© Wisconsin DOT · 511WI'],['511.idaho.gov','© Idaho Transportation Dept · 511'],
      ['newengland511.org','© New England 511 (ME/NH/VT)'],['511.alberta.ca','© Alberta Transportation · 511'],
      ['511la.org','© Louisiana DOTD · 511LA'],['511yukon.ca','© Yukon · 511']
    ];
    /* (own-fetch-relay) OUR RELAY, NOT THREE STRANGERS. None of the thirteen 511 sites sends Access-Control-Allow-Origin
       (measured 2026-09-25), so these lists were only ever read through public CORS relays. They now go through
       supabase/functions/fetch-relay, whose policy (_shared/fetch-relay-policy.js) admits exactly these hosts at
       /map/mapIcons/Cameras; js/proxy-fetch.js keeps the deadline and says null when nothing answered. */
    function _osFetchJSON(url){ return fetchViaProxy(url,{as:'json'}).then(t=>{ try{ return t?JSON.parse(t):null; }catch(_){ return null; } }).catch(()=>null); }
    /* throttle the source rebuild — with 13 sites & ~25k features we must not re-serialize the whole FeatureCollection on every camera add */
    function _osSchedule(){ if(_osDataT) return; _osDataT=setTimeout(()=>{ _osDataT=null; try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){} try{ if(on) updateLegend(); }catch(_){} },600); }
    function loadOneStop(){ if(oneStopDone) return; oneStopDone=true;
      ONESTOP.forEach((site,idx)=>{ const dom=site[0], attr=site[1];
        setTimeout(()=>{ _osFetchJSON('https://'+dom+'/map/mapIcons/Cameras').then(j=>{ const arr=j&&j.item2; if(!Array.isArray(arr)) return; let add=0;
          arr.forEach(c=>{ if(!c||!c.location||c.location.length<2) return; const lat=+c.location[0], lon=+c.location[1]; if(!isFinite(lat)||!isFinite(lon)||(!lat&&!lon)) return;
            const id='os_'+dom+'_'+c.itemId; if(camById[id]) return;
            const nm=String(c.title||'').replace(/[<>]/g,'').trim()||LLw('Traffic camera','交通カメラ','Verkehrskamera','Дорожная камера','Cámara de tráfico');
            camById[id]={type:'Feature',id:id,geometry:{type:'Point',coordinates:[lon,lat]},properties:{n:nm,url:'https://'+dom+'/map/Cctv/'+c.itemId,kind:'img',net:'511',col:'#00bfa5',attr:attr}}; add++; });
          if(add) _osSchedule();
        }); }, idx*350);
      });
    }
    function loadView(force){ if(!on||!GE().hasRenderer()||fetching) return; loadTfL(); loadCaltrans(); loadFinland(); loadOTCM(); loadOneStop(); let b; try{ b=GE().camera.getBounds(); }catch(_){ return; }
      const cur=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()], z=GE().camera.getZoom();
      /* skip if the view is already covered AND we haven't zoomed in meaningfully (zoom-in fetches denser cams) */
      if(!force && contains(lastBox,cur) && z<=lastZoom+0.8) return;
      const padLa=Math.max(1.5,(cur[2]-cur[0])*0.25), padLo=Math.max(1.5,(cur[3]-cur[1])*0.25);
      const qb=[Math.max(-90,cur[0]-padLa),Math.max(-180,cur[1]-padLo),Math.min(90,cur[2]+padLa),Math.min(180,cur[3]+padLo)].map(n=>n.toFixed(4)).join(',');
      const q='[out:json][timeout:25];(node["contact:webcam"]('+qb+');node["webcam"]('+qb+'););out body 1500;';
      fetching=true; if(window.satToast && !Object.keys(camById).length){ try{ satToast(LLw('Loading cameras…','カメラを読み込み中…','Kameras werden geladen…','Загрузка камер…','Cargando cámaras…')); }catch(_){} }
      overpassQuery(q).then(j=>{ fetching=false; lastBox=[+qb.split(',')[0],+qb.split(',')[1],+qb.split(',')[2],+qb.split(',')[3]]; lastZoom=z;
        ((j&&j.elements)||[]).forEach(el=>{ if(!el.tags||camById[el.id]) return; let u=el.tags['contact:webcam']||el.tags.webcam; if(!u) return; u=String(u).trim();
          if(!/^https?:\/\//i.test(u)){ if(/^\/\//.test(u)) u='https:'+u; else u='https://'+u.replace(/^\/+/,''); }
          const kind=classify(u); if(!kind) return;   /* DROP link-out-only cams (the old facade) — keep only cams that display */
          const oc=(kind==='yt')?'#ff3b30':(kind==='pano')?'#00b8d4':(kind==='video')?'#a142f4':'#00c853';
          camById[el.id]={type:'Feature',id:el.id,geometry:{type:'Point',coordinates:[el.lon,el.lat]},properties:{n:el.tags.name||el.tags.operator||el.tags['operator:short']||'Camera',url:u,kind:kind,net:'osm',col:oc,attr:'© OpenStreetMap'}}; });
        try{ GE().layers.setSourceData('webcams-src',fc()); }catch(_){}
        try{ if(on) updateLegend(); }catch(_){}
      }).catch(()=>{ fetching=false; try{ if(!Object.keys(camById).length) satToast(LLw('Could not load cameras — try again.','カメラを取得できませんでした。','Kameras konnten nicht geladen werden.','Не удалось загрузить камеры.','No se pudieron cargar las cámaras.')); }catch(_){} });
    }
    function toggle(v){ on=v; const apply=()=>{ if(!ensure()){ GE().events.once('idle',apply); return; }
      ['webcams-pt','webcams-ico'].forEach(id=>{ try{ GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });
      if(on){ updateLegend(); loadTfL(); loadCaltrans(); loadFinland(); loadOTCM(); loadOneStop(); loadView(true); try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} }
      else { _stopRefresh(); try{ window._hideGenericLegend&&window._hideGenericLegend('webcams'); }catch(_){} if(popup){ popup.remove(); popup=null; } } };
      apply(); if(on)[400,1500].forEach(ms=>setTimeout(apply,ms)); }
    GE().events.on('moveend',()=>{ if(!on) return; clearTimeout(moveT); moveT=setTimeout(()=>loadView(false),550); });
    GE().events.on('styledata',()=>{ if(on) setTimeout(()=>{ if(on&&ensure()){   /* (world-at-time) `on` again at the timer: an «off» inside these 80 ms (js/layer-time-kernel.js withdraws a box on a styledata-busy map) was undone here — measured: the webcams stayed drawn with their box held */ ['webcams-pt','webcams-ico'].forEach(id=>{ try{ GE().layers.setLayout(id,'visibility','visible'); }catch(_){} }); } },80); });
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('dl-webcams')) return;
      const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-webcams';
      const lab=document.createElement('label'); lab.className='layer-option';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.id='dl-webcams';
      const sw=document.createElement('span'); sw.className='lyr-sw'; sw.style.background='#00b8d4';
      const sp=document.createElement('span'); sp.id='dl-webcams-lbl'; sp.replaceChildren(iconNode('camera'),' '+lbl());
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sw); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
      w.appendChild(lab); dd.appendChild(w);
      cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); toggle(e.target.checked); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    bus.on('intmap-lang',()=>{ const s=document.getElementById('dl-webcams-lbl'); if(s) s.replaceChildren(iconNode('camera'),' '+lbl()); try{ if(on) updateLegend(); }catch(_){} });
    if(document.readyState!=='loading') setTimeout(buildUI,900); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildUI,900));
  })();
}
