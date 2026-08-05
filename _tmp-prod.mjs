import { chromium } from '@playwright/test';
const URL='https://rwmqx7dwb5-arch.github.io/IntMap/';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(URL,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.IntMapCanDraw&&window.IntMapCanDraw(),null,{timeout:120000});
const r=await page.evaluate(async()=>{
  const out={};
  /* 1. the bundled land mask */
  try{ const LM=window.IntMapLandMask; await LM.warm();
    out.mask={...LM.state(), tokyo:LM.isLand(139.76,35.68), pacific:LM.isLand(-150,20)}; }catch(e){ out.mask='ERR '+e.message; }
  /* 2. the satellite worker */
  try{ const P=window.IntMapSatProto; out.sat={worker:P.worker(), hi:P.hiDPI(), dpr:P.dpr()}; }catch(e){ out.sat='ERR '+e.message; }
  /* 3. the aircraft mark */
  try{ const cb=document.getElementById('dl-planes');
    if(cb&&!cb.checked){ const row=cb.closest('label')||cb.parentElement;
      ['pointerdown','pointerup'].forEach(t=>row.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:1}))); }
    window.IntMapGeoEngine.camera.jumpTo({center:[8.57,50.05],zoom:10.5});
    for(let i=0;i<60;i++){ if(window.IntMapPlanes3D.state().aircraft>0) break; await new Promise(s=>setTimeout(s,500)); }
    const rows=[];
    for(const z of [5,12,17]){ window.IntMapGeoEngine.camera.jumpTo({center:[8.57,50.05],zoom:z});
      await new Promise(s=>setTimeout(s,900)); const st=window.IntMapPlanes3D.state();
      rows.push({z, halfPx:st.halfPx, glyphHalfPx:st.glyphHalfPx, thickPx:st.thickPx, on:st.on}); }
    out.planes=rows;
  }catch(e){ out.planes='ERR '+e.message; }
  /* 4. the seismic field */
  try{ const S=window.IntMapSeismic;
    S.open({lng:142.37,lat:38.30,depth:24,mw:9.0}); await new Promise(s=>setTimeout(s,700)); S.setScale('jma');
    await new Promise(s=>setTimeout(s,1200)); await S.rebuildField(); await new Promise(s=>setTimeout(s,2500));
    const st=S.state(); const at=(lo,la)=>{const a=S.at(lo,la); return a?+a.jma.toFixed(2):null;};
    out.seis={rEdgeKm:st.field&&st.field.rEdgeKm, far:st.far&&{painted:st.far.painted,sea:st.far.sea,src:st.far.landSource},
      sendai:at(140.87,38.27), osaka:at(135.50,34.69), beijing:at(116.40,39.90)};
  }catch(e){ out.seis='ERR '+e.message; }
  /* 5. the tsunami model */
  try{ const T=window.IntMapTsunami;
    T.open({lng:142.37,lat:38.30,mw:9.1,depth:24,hours:6,run:true});
    for(let i=0;i<400;i++){ const s=T.state(); if(!s.busy&&(s.sim||s.err)) break; await new Promise(r2=>setTimeout(r2,500)); }
    const st=T.state();
    out.tsu=st.sim?{uplift:st.sim.upliftM,sub:st.sim.subsidenceM,frames:st.sim.frames,cell:st.sim.cellKm,
      coast:st.sim.coastMaxM, guam:T.at(144.75,13.47)}:('ERR '+st.err);
    try{ T.close(); }catch(_){}
  }catch(e){ out.tsu='ERR '+e.message; }
  return out;
});
console.log(JSON.stringify(r,null,1));
await b.close();
