/* ============================================================================
 *  IntMap · Atlas capabilities — the `sim.*` namespace   (js/atlas-cap-sim.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, bool, num, one, obj, lat, lng } from './atlas-caps.js';

export default [
  {
    row: ['sim.lineOfSight',            'los',            'lineOfSight',                                                 'sim',     'sim',     'map.los',                'map',                 'session', 'none',   'place',    'los'],
    schema: () => ({ type: 'object', properties: { place: str(), from: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }] }), /* `los` */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place||a.from); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),8)}); }catch(_){} await window.IntMapLazy.need('los'); let ok=false; try{ if(window.IntMapLOS&&window.IntMapLOS.open){ if(window.IntMapLOS.setMode) window.IntMapLOS.setMode('los');   /* (#R296) the merged panel has two analyses; 「見通し線」 is this one */
          window.IntMapLOS.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note('📡 '+L('Line of sight','見通し線','Sichtlinie','Линия видимости','Línea de visión')+': '+esc(ll.name||a.place||'')):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||a.from||''))); }
    },
  },
  {
    row: ['sim.radiation',              'radiation',      'fallout,dispersion,plume,radiationSim',                       'sim',     'sim',     'map.radiation',          'map',                 'session', 'none',   'place',    ''],
    /* `source` is BOTH a preset key and a place name (the preset carries its own coordinates), so
       it can stand alone as the release point and cannot be an enum */
    schema: () => ({ type: 'object', properties: { place: str(), from: str(), at: str(), source: str(), lng: lng(), lat: lat(), isotope: one('cs137', 'i131', 'cs134', 'sr90'), bq: num(0), pbq: num(0), tbq: num(0), becquerel: num(0), emitHours: num(0), halfLife: num(0), halfLifeHours: num(0), hours: num(0), seconds: num(0), date: str(), datetime: str(), when: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }, { required: ['at'] }, { required: ['source'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, esc = K.esc, HOST = K.HOST, radiationChain = K.radiationChain, note = K.note;
      {
          /* (#R85b) robust source resolution ("福島第一原発 → Where is the release source?"): explicit coords →
             built-in nuclear-site gazetteer → online geocode → simplified retry → source-preset default coords. */
          const _place=String(a.place||a.from||a.at||a.source||'').trim();
          let ll=(a.lng!=null&&isFinite(+a.lng)&&a.lat!=null)?{lng:+a.lng,lat:+a.lat,name:a.place||''}:null;
          if(!ll){ try{ ll=window.IntMapRadiation.resolveSite&&await window.IntMapRadiation.resolveSite(_place); }catch(_){} }   /* (#R585) the nuclear gazetteer is now the discovered registry (data/npp.json) and resolving is async — the rung below this one already awaited */
          if(!ll&&_place){ try{ ll=await geocode(_place); }catch(_){} }
          if(!ll&&_place){ /* strip generic words the geocoder chokes on (原発/nuclear/power plant/npp…) and retry */
            const _clean=_place.replace(/(原子力発電所|原発|発電所|nuclear\s*power\s*(plant|station)?|power\s*(plant|station)|nuclear|npp|reactor|станция|аэс)/ig,'').replace(/\s{2,}/g,' ').trim();
            if(_clean&&_clean!==_place){ try{ ll=window.IntMapRadiation.resolveSite&&await window.IntMapRadiation.resolveSite(_clean); }catch(_){} if(!ll){ try{ ll=await geocode(_clean); }catch(_){} } } }
          if(!ll){ const _sp=(window.IntMapRadiation.SOURCES||{})[String(a.source||'').toLowerCase()]; if(_sp&&_sp.ll) ll={lng:_sp.ll[0],lat:_sp.ll[1],name:_sp.n}; }   /* fall back to the preset's own location */
          if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where is the release source? Name a plant/place, or right-click a point.','放出源はどこですか？（原発名・地名の指定、または地点を右クリック）','Wo ist die Quelle?','Где источник выброса?','¿Dónde está la fuente?'), _place)));
          /* (#R85) selectable source term / emission duration / isotope / start date-time + a FINAL deposition map
             with real dose zones ("放出量や放出時間、日時等も選べるように … 最終的な飛散もマッピング … 地点によってどの程度の
             放射線被害があるかも説明"). */
          const SRCS=window.IntMapRadiation.SOURCES||{}, ISOS=window.IntMapRadiation.ISOTOPES||{};
          /* (#R568) the source term is source × ISOTOPE — an accident has no single activity. Why, and where each figure comes from: docs/RADIATION-MODEL.md §1. A preset with no published figure for the chosen nuclide does not appear rather than borrowing another's. */ const _radPresetTerm=(sk,ik)=>{ try{ return (window.IntMapRadiation.sourceTerm&&window.IntMapRadiation.sourceTerm(sk,ik))||null; }catch(_){ return null; } }, _radPresetBq=(sk,ik)=>{ const t=_radPresetTerm(sk,ik); return t?t.bq:undefined; }; const _radBqOptions=(ik)=>{ const out=[]; for(const k of ['chernobyl','fukushima','dirtybomb','research']){ const t=_radPresetTerm(k,ik); if(!t||!(t.bq>0)) continue; out.push([t.bq,((SRCS[k]&&SRCS[k].n)||k)+' · '+((ISOS[ik]&&ISOS[ik].n)||ik)+' · '+fmtBq(t.bq)]); } out.push([1e15,'1 PBq'],[1e12,'1 TBq']); return out; };
          const srcKey=String(a.source||'').toLowerCase(); const srcPreset=SRCS[srcKey];
          const opts={ seconds:a.seconds, hours:a.hours, emitHours:a.emitHours, halfLifeHours:a.halfLifeHours||a.halfLife,
            isotope:a.isotope, source:a.source, date:a.date||a.datetime||a.when,
            /* ⚠ `srcPreset.bq` no longer exists and must not come back (see above). */ bq:(a.bq!=null?+a.bq:(a.becquerel!=null?+a.becquerel:(a.pbq!=null?+a.pbq*1e15:(a.tbq!=null?+a.tbq*1e12:_radPresetBq(srcKey,String(a.isotope||'cs137').toLowerCase()))))) };
          let r=null; try{ r=await window.IntMapRadiation.run({lng:ll.lng,lat:ll.lat,name:ll.name},opts); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'error'))); }
          if(!r||!r.ok) return R(false, warn('⚠ '+((r&&r.reason==='wind')?L('Could not fetch the live wind data the dispersion model needs','拡散モデルに必要な風データを取得できませんでした','Konnte keine Live-Winddaten abrufen','Не удалось получить данные о ветре','No se pudieron obtener datos de viento'):L('The dispersion simulation could not run (map still loading)','拡散シミュレーションを実行できませんでした（地図読込中）','Simulation nicht möglich','Симуляция не запустилась','No se pudo ejecutar la simulación'))));
          const dirName=d=>{ const names=[L('north','北','Nord','север','norte'),L('northeast','北東','Nordost','северо-восток','noreste'),L('east','東','Ost','восток','este'),L('southeast','南東','Südost','юго-восток','sureste'),L('south','南','Süd','юг','sur'),L('southwest','南西','Südwest','юго-запад','suroeste'),L('west','西','West','запад','oeste'),L('northwest','北西','Nordwest','северо-запад','noroeste')]; return names[Math.round(((d%360)/45))%8]; };
          const fmtBq=v=>{ v=+v; if(!isFinite(v)) return '?'; if(v>=1e15) return (v/1e15).toFixed(1)+' PBq'; if(v>=1e12) return (v/1e12).toFixed(0)+' TBq'; if(v>=1e9) return (v/1e9).toFixed(0)+' GBq'; return v.toExponential(1)+' Bq'; };
          /* ⚠⚠⚠ (#R568 ⑩) THE ANNUAL DOSE IS NO LONGER EXTRAPOLATED HERE. It used to be «rate × 8766 × 0.5», i.e. «this dose rate holds for a year» — false for every nuclide and absurd for I-131. The model integrates against decay AND weathering and returns `firstYearMSv`; this side only prints it (docs/RADIATION-MODEL.md §6). */ let h='<div style="font-weight:600;">☢ '+esc(ll.name||a.place)+' — '+L('radioactive dispersion & fallout','放射性物質の拡散・降下','radioaktive Ausbreitung & Fallout','рассеивание и выпадение','dispersión y lluvia radiactiva')+'</div>'
            +'<div style="font-size:12.5px;line-height:1.72;margin-top:3px;">'
            +'<div>☢ '+L('Source term','放出量','Quellterm','Выброс','Término fuente')+': <b>'+fmtBq(r.bq)+'</b> '+esc(r.iso)+' · '+L('released over','放出時間','über','за','durante')+' '+r.emitHours+' h</div>'
            +(r.startISO?('<div>🕒 '+L('Release start','放出開始','Freisetzungsbeginn','Начало','Inicio')+': '+esc(new Date(r.startISO).toLocaleString(window.IntMapLang.locale(HOST.lang,"en-GB")))+'</div>'):'')
            +'<div>💨 '+L('Surface wind','地上風','Bodenwind','Приземный ветер','Viento')+': '+r.windSpeed.toFixed(1)+' m/s '+L('toward the','→ ','Richtung ','на ','hacia el ')+dirName(r.windToward)+' · '+L('plume reach','到達','Reichweite','дальность','alcance')+' ~'+r.reachKm+' km</div>'
            +'<div>🌧 '+L('Wet deposition','湿性沈着（降雨洗浄）','Nassdeposition','Влажное осаждение','Deposición húmeda')+': '+(r.wet?L('active — rain washing particles down','あり — 降雨が粒子を洗い落とし','aktiv','активно','activa'):L('none in area','領域内でなし','keine','нет','ninguna'))+'</div>'
            +'</div>';   h+=await radiationChain(ll);   /* (#R585) the measured half of the chain — the body is in js/atlas-controls.js, because this file shrinks only by MOVING (tests/atlas-turn-checks.test.mjs #R419 ⑨d, tests/atlas-agent-loop-checks.test.mjs #R511 ⑨) */
          /* final deposition dose zones */
          const zLbls=r.zones||[]; const rows=[];
          for(let z=0;z<zLbls.length;z++){ const km2=(r.zoneKm2&&r.zoneKm2[z])||0; if(km2<=0) continue;
            rows.push('<div style="display:flex;align-items:center;gap:7px;padding:2px 0;"><span style="width:12px;height:12px;border-radius:3px;flex:0 0 auto;background:'+zLbls[z].c+';"></span><span style="flex:1;">'+esc(window.IntMapLang.pick(()=>HOST.lang).arr(zLbls[z].n))+'</span><span style="color:var(--text-muted);">≥'+zLbls[z].min+' kBq/m² · '+km2.toFixed(km2<10?1:0)+' km²</span></div>'); }
          /* ⚠ (#R568 ⑨) the heading no longer says «Cs-137-equivalent» over an iodine deposit: which ladder is drawn is the model's answer, because a deposition-density statute exists for Cs-137 and Sr-90 and does NOT exist for I-131 or Cs-134 (docs/RADIATION-MODEL.md §3). */ h+='<div style="font-weight:600;margin:6px 0 2px;font-size:12px;">'+(r.zonesAreLegal ? (L('Final ground deposition — statutory zones','最終的な地表沈着—法定区分','Endgültige Bodendeposition — gesetzliche Zonen','Итоговое выпадение — законодательные зоны','Deposición final — zonas legales')+(r.zoneJurisdiction==='ua'?' (UA)':'')) : L('Final ground deposition — density only (this nuclide has no statutory zoning)','最終的な地表沈着—密度のみ（この核種に法定区分はない）','Endgültige Bodendeposition — nur Dichte','Итоговое выпадение — только плотность','Deposición final — sólo densidad'))+'</div>';
          h+=rows.length?('<div style="font-size:11.5px;">'+rows.join('')+'</div>'):('<div style="font-size:11.5px;color:var(--text-muted);">'+L('Deposition stays below mapped thresholds in this run (winds carried most activity out of the modeled area).','この条件では地図化しきい値未満（大半が領域外へ運ばれました）。','unter den Schwellen','ниже порогов','por debajo de umbrales')+'</div>');
          /* ⚠⚠⚠ (#R568 ⑦) A PEAK CELL IS AN ESTIMATE AND NOW SAYS SO — `peakRelSE` ≈ 1/√n is its error bar and below `minPeakN` no figure is headlined at all, because a number with no error bar is read as having none. ⚠ And the external dose is not universal: Sr-90 → Y-90 are pure beta, so `externalMeaningful` is false and this says so rather than printing a µSv/h that would be read as the hazard (docs/RADIATION-MODEL.md §2, §7). */ if(r.peakKBqM2>0){ const uH=r.peakDoseUSvH, yr=r.firstYearMSv, se=Math.round((r.peakRelSE||0)*100), pk=r.peakKBqM2>=1?Math.round(r.peakKBqM2).toLocaleString():r.peakKBqM2.toFixed(2); h+='<div style="font-size:11.5px;margin-top:4px;">📈 '+L('Peak deposition','最大沈着','Spitzendeposition','Пик','Pico')+': <b>'+pk+' kBq/m²</b>' +(r.peakWellSampled?(' <span style="color:var(--text-muted);">±'+se+'%</span>'):(' <span style="color:var(--text-muted);">— '+L('too few particles reached this cell to quote a value','この地点に到達した粒子が少なく、数値として示せません','zu wenige Partikel für einen Wert','слишком мало частиц для оценки','muy pocas partículas para un valor')+'</span>')) +(r.externalMeaningful ? (' → '+L('external dose rate','外部被ばく線量率','Dosisleistung','мощность дозы','tasa de dosis')+' ≈ <b>'+(uH>=1?uH.toFixed(1):uH.toFixed(2))+' µSv/h</b> ('+L('first year','初年度','erstes Jahr','первый год','primer año')+' ≈ '+(yr>=1?Math.round(yr):yr.toFixed(2))+' mSv)') : (' · '+L('external dose from this deposit is minor — Sr-90/Y-90 are beta emitters, and the hazard is ingestion, not ground shine','この沈着からの外部被ばくは小さい（Sr-90/Y-90 はベータ核種で、危険は地表からの放射線ではなく摂取）','externe Dosis gering — Beta-Strahler','внешняя доза мала — бета-излучатели','dosis externa menor — emisores beta'))) +'</div>';
            /* ⚠ (#R568 ④⑥) WHAT IS NOT ON THE MAP. The old run settled half of everything still airborne onto the ground and clamped straying particles to the domain edge, so the map always LOOKED complete. Both are gone, so it can now be honestly incomplete — and that is a fact about the figures above it. */ const away=[]; if(r.escapedMassFrac>0.02) away.push(Math.round(r.escapedMassFrac*100)+'% '+L('left the modelled area','領域外へ流出','außerhalb','вышло за область','fuera del área')); if(r.airborneFrac>0.02) away.push(Math.round(r.airborneFrac*100)+'% '+L('still airborne when the window closed','計算終了時にまだ大気中','noch in der Luft','ещё в воздухе','aún en el aire')); if(away.length) h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">🌬 '+L('Not on this map','この地図に含まれないもの','Nicht auf dieser Karte','Не на этой карте','No en este mapa')+': '+away.join(' · ')+'</div>';
            h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+L('For reference: natural background ≈ 2–3 mSv/yr; Japan\'s Fukushima evacuation criterion was 20 mSv/yr; Chernobyl\'s permanent-exclusion zone ≥1480 kBq/m².','参考：自然放射線 約2–3 mSv/年、福島の避難基準 20 mSv/年、チェルノブイリの永久立入禁止 1480 kBq/m²以上。','Referenz: Untergrund ≈2–3 mSv/a.','Для справки: фон ≈2–3 мЗв/год.','Referencia: fondo ≈2–3 mSv/año.')+'</div>'; }
          /* (#R85d) FULL inline configuration IN the message ("こちらで設定できない項目が多すぎる" — no popup): isotope,
             source term, emission duration, simulation hours, start time — each re-runs the model in place. */
          K._lastRadCtx={place:(a.place||a.from||a.source||ll.name),lng:ll.lng,lat:ll.lat,bq:r.bq,isotope:String(opts.isotope||'cs137').toLowerCase(),emitHours:r.emitHours,hours:r.hours,date:opts.date||''};
          const cur=K._lastRadCtx;
          const _rb=(o,lbl)=>'<button class="atl-traj-btn" data-rad=\''+esc(JSON.stringify(o))+'\'>'+esc(lbl)+'</button>';
          const _sel=(key,list,val)=>'<select class="atl-rad-sel" data-radp="'+key+'">'+list.map(o=>'<option value="'+o[0]+'"'+((''+o[0])===(''+val)||(key==='bq'&&Math.abs(+o[0]-+val)<+o[0]*0.03)?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
          const _step=(key,val,delta,min,max,unit,label)=>'<div class="atl-rad-ctl"><span>'+label+'</span><button class="atl-traj-btn atl-rad-mini" data-rad=\''+esc(JSON.stringify({[key]:Math.max(min,val-delta)}))+'\'>−</button><b>'+val+unit+'</b><button class="atl-traj-btn atl-rad-mini" data-rad=\''+esc(JSON.stringify({[key]:Math.min(max,val+delta)}))+'\'>＋</button></div>';
          h+='<div class="atl-rad-cfg">'
            +'<div class="atl-rad-ctl"><label style="display:contents;"><span>'+L('Isotope','核種','Isotop','Изотоп','Isótopo')+'</span>'+_sel('isotope',[['cs137','Cs-137 (30y)'],['i131','I-131 (8d)'],['cs134','Cs-134 (2y)'],['sr90','Sr-90 (29y)']],cur.isotope)+'</label></div>'
            /* ⚠⚠⚠ (#R568 ⑧) THE SOURCE-TERM MENU IS BUILT FROM THE CHOSEN ISOTOPE. It used to be five hard-coded pairs — «Chernobyl · 85 PBq», «Fukushima · 15 PBq» — which are Cs-137 figures wearing an accident's name, so switching the isotope above left them saying the same thing about a completely different inventory. Now the accident presets come from the model's source × isotope table and are LABELLED with what they are, and the two generic magnitudes stay generic because that is all they ever were. */ +'<div class="atl-rad-ctl"><label style="display:contents;"><span>'+L('Source term','放出量','Quellterm','Выброс','Término fuente')+'</span>'+_sel('bq',_radBqOptions(cur.isotope),cur.bq)+'</label></div>'
            +_step('emitHours',cur.emitHours,2,0.5,72,'h',L('Emission','放出時間','Freisetzung','Выброс','Emisión'))
            +_step('hours',cur.hours,12,6,80,'h',L('Sim window','計算時間','Zeitfenster','Окно','Ventana'))
            +'</div>';
          h+='<div class="atl-traj-row">'+_rb({source:'chernobyl',emitHours:10,hours:60},L('Chernobyl','チェルノブイリ級','Tschernobyl','Чернобыль','Chernóbil'))
            +_rb({source:'fukushima',emitHours:8,hours:48},L('Fukushima','福島級','Fukushima','Фукусима','Fukushima'))
            +_rb({source:'dirtybomb',isotope:'cs137',emitHours:0.5,hours:24},L('Dirty bomb','ダーティボム','Schmutzige Bombe','Грязная бомба','Bomba sucia'))+'</div>';
          h+=note(L('Lagrangian particle model on LIVE Open-Meteo wind/temperature/precipitation (or the ERA5 archive for a past date): advection + stability-scaled turbulent diffusion + wet & dry deposition + radioactive decay. The source term (Bq), emission duration, isotope half-life and start time are yours to set; the colored ground zones are the final deposition classified by the real Chernobyl Cs-137 thresholds, and the dose figures assume a Cs-137 ground-shine conversion. EDUCATIONAL approximation, NOT an operational forecast — in a real emergency follow official authorities (SPEEDI / IAEA / local government).','ラグランジュ粒子モデル。Open-Meteoのライブ風・気温・降水（過去日はERA5アーカイブ）で移流＋安定度依存の乱流拡散＋湿性乾性沈着＋放射性崩壊を計算。放出量(Bq)・放出時間・核種半減期・開始時刻を指定できます。色分けゾーンは最終沈着を実際のチェルノブイリのCs-137しきい値で分類、線量はCs-137地表γ線換算です。教育目的の近似であり運用予報ではありません。実際の緊急時は公的機関（SPEEDI／IAEA／自治体）に従ってください。','Lagrange-Partikelmodell mit Live-Wetter — Bildungsnäherung.','Лагранжева модель с реальной погодой — образовательная.','Modelo lagrangiano con clima real — educativo.'));
          return R(true, h); }
    },
  },
  {
    row: ['sim.flightSim',              'flightSim',      'flightsim,flightsimulator,flysim,pilot',                      'sim',     'sim',     'camera,map.flightsim',   'map,camera',          'session', 'none',   'place?',   'flightSim'],
    schema: () => ({ type: 'object', properties: { place: str(), over: str(), from: str(), lng: lng(), lat: lat(), alt: num(), aircraft: str(), plane: str(), craft: str(), mode: str(), action: str(), on: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, geocode = K.geocode, GE = K.GE, esc = K.esc, warn = K.warn;
      {
          if(a.on===false||/^(stop|exit|off|quit|end|land)$/i.test(String(a.mode||a.action||''))){ try{ window.IntMapFlightSim&&window.IntMapFlightSim.stop&&window.IntMapFlightSim.stop(); }catch(_){} return R(true, note('✓ '+L('Flight simulator stopped','飛行シミュレーターを終了しました','Flugsimulator beendet','Авиасимулятор остановлен','Simulador de vuelo detenido'))); }
          const opts={}; let nm=''; let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place||a.over||a.from){ try{ ll=await geocode(a.place||a.over||a.from); }catch(_){} }
          if(ll){ opts.lng=ll.lng; opts.lat=ll.lat; nm=ll.name||a.place||''; try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:11,duration:500}); }catch(_){} }
          if(a.alt!=null&&isFinite(+a.alt)) opts.alt=+a.alt;
          /* (#R94p) pick the aircraft by name (explicit field only — never the geocoded place) */
          const _acs=String(a.aircraft||a.plane||a.craft||a.mode||'').toLowerCase();
          if(/fighter|f-?16|戦闘機|jäger|истреб|caza/.test(_acs)) opts.aircraft='fighter';
          else if(/airliner|a320|737|旅客機|verkehr|авиалайнер|avión|ジェット/.test(_acs)) opts.aircraft='airliner';
          else if(/cessna|trainer|セスナ|練習|schul|учебн|escuela/.test(_acs)) opts.aircraft='cessna';
          else if(/glider|sailplane|グライダー|滑空|segelflug|планёр|planeador/.test(_acs)) opts.aircraft='glider';
          else if(/mustang|p-?51|warbird|大戦|マスタング|大戦機/.test(_acs)) opts.aircraft='warbird';
          await window.IntMapLazy.need('flightSim'); let ok=false; try{ if(window.IntMapFlightSim&&window.IntMapFlightSim.setup){ window.IntMapFlightSim.setup(opts); ok=true; } else if(window.IntMapFlightSim&&window.IntMapFlightSim.start){ ok=window.IntMapFlightSim.start(opts); } }catch(_){}
          return R(ok, ok?note('✈ '+L('Flight simulator — pick your aircraft & runway, then START','飛行シミュレーター — 機体と滑走路を選んで START','Flugsimulator — Flugzeug & Piste wählen, dann START','Авиасимулятор — выберите самолёт и полосу, затем СТАРТ','Simulador — elige avión y pista, luego INICIAR')+(nm?(' · '+esc(nm)):'')):warn('⚠ '+L('Could not start the flight simulator','飛行シミュレーターを開始できませんでした','Konnte den Flugsimulator nicht starten','Не удалось запустить','No se pudo iniciar')), ok?{meta:{opened:'flightSim'}}:null); }   /* (#R760) the window IS the deliverable here — js/atlas-capabilities.js `sim` reads this instead of asking a map surface that cannot hold it */
    },
  },
  {
    row: ['sim.rfCoverage',             'rfCoverage',     'coverage,radioCoverage,signalCoverage,reception,viewshed',    'sim',     'sim',     'map.coverage',           'map',                 'session', 'none',   'point',    'los'],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), height: num(0), antennaHeight: num(0), frequency: num(0), freq: num(0) }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R89) RF / radio coverage from an antenna */
      /* (#R318) `lineOfSight` WAS ALSO LISTED HERE, AND WAS UNREACHABLE. A switch enters the FIRST
         matching case and `case 'los': case 'lineOfSight':` above already claims that spelling, so
         this label had never once been entered. Removing a label the language cannot reach cannot
         change behaviour; leaving it said IntMap had a route to the viewshed by that name when
         every such request had always gone to the line-of-sight tool instead. */
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {
          /* ⚠ (#R299) NO MAST IS PLANTED AT THE CAMERA'S CENTRE — 「勝手に地図中心を選択している…のを辞めろ」. The service area, the farthest
             sight line and the terrain shadow are all functions of ONE coordinate, and the fallback here was wherever the reader happened to be looking. It asks now, the way `tsunami` below does. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where? Give the transmitter site (place, or lng/lat).','送信点はどこですか（地名または経緯度）。','Wo? Senderstandort angeben.','Где передатчик?','¿Dónde? Indica el emplazamiento del emisor.'), a.place||a.at||a.location)));
          /* ⚠ (#R296) ONE PANEL — 「電波・通信圏と見通し線解析を統合して」. `IntMapRF` is gone; this is `IntMapLOS` with a frequency. */
          try{ if(window.IntMapLOS){ const L2=window.IntMapLOS;
            if(L2.setMode) L2.setMode(/^(los|lineOfSight|viewshed)$/.test(String(a.type||''))?'los':'radio');
            if(L2.setParams) L2.setParams((+a.height||+a.antennaHeight||null), null, null, 1.3333, (+a.frequency||+a.freq||null));
            L2.open(ll); } }catch(_){}
          return R(true, note('📡 '+L('Radio coverage','電波・通信圏','Funkabdeckung','Радиопокрытие','Cobertura de radio')+' — '+L('line-of-sight service area over real terrain. Set antenna height / power / frequency in the panel; click to move the mast.','実地形上の見通し到達域。パネルでアンテナ高・出力・周波数を設定、クリックで基地局を移動。','Sichtlinie über echtem Gelände.','зона прямой видимости.','área de línea de vista.'))); }
    },
  },
  {
    row: ['sim.sunPosition',            'sun',            'shadow,shadows,sunlight,sunPosition,daylight,insolation',     'sim',     'sim',     'map.sun',                'map',                 'session', 'none',   'point',    ''],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), date: str(), datetime: str(), time: str() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }), /* `sun` */
      /* (#R90) sun & shadow */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {
          /* ⚠ (#R302) THE RESOLVED PLACE WAS THROWN AWAY — geocoded, flown to, then `open()` WITH NO ARGUMENT, so the panel answered for the camera's centre, which `flyTo` had not even reached yet. It is handed over now, and with none the reply asks. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),15)}); }catch(_){} } } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){} if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).'), a.place||a.at||a.location)));
          try{ if(window.IntMapSun){ window.IntMapSun.open({lng:ll.lng,lat:ll.lat}); if(a.date||a.time||a.datetime){ const d=new Date(a.datetime||((a.date||'')+(a.time?('T'+a.time):''))); if(!isNaN(d)) window.IntMapSun.setTime(d); } } }catch(_){}
          return R(true, note('🌇 '+L('Sun & shadow','日照・影','Sonne & Schatten','Солнце и тень','Sol y sombra')+' — '+L('pick a date & time; buildings in view (zoom in) cast real shadows and the 3D scene is lit from the sun. Press ▶ to sweep the day.','日時を選択。表示中の建物（拡大時）が実際の影を落とし、3Dは太陽方向から照らされます。▶で一日を再生。','Datum/Zeit wählen — echte Gebäudeschatten.','выберите дату/время — реальные тени зданий.','elige fecha/hora — sombras reales.'))); }
    },
  },
  {
    row: ['sim.terrainWater',           'terrainWater',   'waterFlow,terrainEdit,watershedSim,sculpt',                   'sim',     'sim',     'map.terrainWater',       'map',                 'session', 'none',   'point',    'terrainWater'],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), rainMm: num(0), waterM3: num(0), flowM3s: num(0), raiseM: num(), lowerM: num(), radiusM: num(0), mode: str(), pour: one('once', 'cont', 'continuous', 'stop'), pourRateM3s: num(0), timeSpeed: num(0), resetTerrain: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R176) terrain sculpting + water routing */
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, note = K.note, L = K.L, warn = K.warn;
      {
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          await window.IntMapLazy.need('terrainWater'); let ok=false; try{ if(window.IntMapTerrainWater){ await window.IntMapTerrainWater.open(ll?{lng:ll.lng,lat:ll.lat,refit:true}:{refit:true}); ok=true;
            if(a.rainMm!=null) window.IntMapTerrainWater.setRain(+a.rainMm||0);
            if(a.flowM3s!=null&&window.IntMapTerrainWater.setFlow) window.IntMapTerrainWater.setFlow(+a.flowM3s);   /* (#R189) channel discharge */
            if(a.waterM3!=null&&ll) window.IntMapTerrainWater.addSource(ll.lng,ll.lat,+a.waterM3||0);
            if(a.raiseM!=null&&ll) window.IntMapTerrainWater.brush(ll.lng,ll.lat,'raise',{heightM:+a.raiseM,radiusM:+a.radiusM||undefined});
            if(a.lowerM!=null&&ll) window.IntMapTerrainWater.brush(ll.lng,ll.lat,'lower',{heightM:+a.lowerM,radiusM:+a.radiusM||undefined});
            if(a.mode) window.IntMapTerrainWater.setMode(String(a.mode));
            const _tw=window.IntMapTerrainWater;   /* (#R211) the continuous pour and the terrain-only reset — every feature is operable from Atlas */
            if(a.resetTerrain&&_tw.resetTerrain) _tw.resetTerrain();
            if((a.pour!=null||a.pourRateM3s!=null||a.timeSpeed!=null)&&_tw.pour) _tw.pour({ mode:(a.pour==='cont'||a.pour==='continuous')?'cont':(a.pour==='once'?'once':undefined), rateM3s:a.pourRateM3s!=null?+a.pourRateM3s:undefined, speed:a.timeSpeed!=null?+a.timeSpeed:undefined, run:(a.pour==='stop'||a.pour===false)?false:((a.pour==='cont'||a.pour==='continuous')?true:undefined) });
          } }catch(_){}
          const st=(()=>{ try{ return window.IntMapTerrainWater.state().result; }catch(_){ return null; } })();
          return R(ok, ok?note('⛰💧 '+L('Terrain & water','地形編集・水流','Gelände & Wasser','Рельеф и вода','Terreno y agua')+' — '
            +(st?(L('ponded','湛水','aufgestaut','затоплено','embalsado')+' '+Math.round(st.storedM3).toLocaleString()+' m³ · '+st.floodKm2.toFixed(2)+' km² · '
              +(st.breaches?(st.breaches+' '+L('spill points','箇所で越流','Überströmstellen','точек перелива','desbordes')):L('nothing overtopping','越流なし','kein Überströmen','без перелива','sin desborde'))+' · ')
              :'')
            +L('brush the ground up or down, draw a levee, drop water — the flow paths, the ponding and the breach direction follow.','ブラシで盛る・削る、堤防を線で引く、水を落とす——流下経路・湛水域・決壊方向がそのまま追随します。','Gelände formen, Deich zeichnen, Wasser fallen lassen.','лепите рельеф, рисуйте дамбу, лейте воду.','esculpa el terreno, dibuje un dique, suelte agua.')):warn('⚠')); }
    },
  },
  {
    row: ['sim.earthquake',             'earthquake',     'seismic,quakeSim,seismicWaves,earthquakeSim',                 'sim',     'sim',     'map.seismic',            'map',                 'session', 'none',   'point',    'seismic'],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), epicentre: str(), epicenter: str(), lng: lng(), lat: lat(), depth: num(0), magnitude: num(), mw: num(), t: num(), site: one('hard', 'rock', 'stiff', 'soft'), scale: one('mmi', 'jma'), speed: num(0), slip: num(0), opacity: num(0, 1), tsunami: bool(), hours: num(1, 30), maximum: bool(), play: bool(), amplitude: num(0), contours: bool(), real: bool(), seconds: num(0) }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['epicentre'] }, { required: ['epicenter'] }, { required: ['lat', 'lng'] }] }),
      /* (#R176) seismic wave propagation */
    async run(a, dctx, K) { const geocode = K.geocode, L = K.L, esc = K.esc, warn = K.warn, R = K.R, note = K.note;
      {
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location||a.epicentre||a.epicenter){ const g=await geocode(a.place||a.at||a.location||a.epicentre||a.epicenter); if(g) ll={lng:g.lng,lat:g.lat,name:g.name}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          await window.IntMapLazy.need('seismic'); let ok=false; try{ if(window.IntMapSeismic){
            window.IntMapSeismic.open(ll?{lng:ll.lng,lat:ll.lat,depth:(a.depth!=null?+a.depth:null),mw:(a.magnitude!=null?+a.magnitude:(a.mw!=null?+a.mw:null))}:{});
            if(a.real) await window.IntMapSeismic.loadReal();
            if(a.site) window.IntMapSeismic.setSite(String(a.site));
            if(a.scale&&window.IntMapSeismic.setScale) window.IntMapSeismic.setScale(String(a.scale).toLowerCase());   /* (#R189) mmi | jma */
            if(a.speed!=null&&window.IntMapSeismic.setSpeed) window.IntMapSeismic.setSpeed(+a.speed);                  /* (#R189) playback rate */
            if(a.slip!=null) window.IntMapSeismic.setParams({slip:+a.slip});                                           /* (#R189) rupture slip */
            if(a.t!=null||a.seconds!=null) window.IntMapSeismic.setParams({t:+(a.t!=null?a.t:a.seconds)});
            /* (#R190) the new controls, reachable the same way every other one is (#R82) */
            if(a.opacity!=null&&window.IntMapSeismic.setOpacity) window.IntMapSeismic.setOpacity(+a.opacity>1?(+a.opacity/100):+a.opacity);
            if(a.tsunami&&window.IntMapSeismic.openTsunami) window.IntMapSeismic.openTsunami();
            /* (#R192) the propagation model's own controls, once the hand-off has opened it */
            try{ const T=window.IntMapTsunami;
              if(a.tsunami&&T){
                if(a.hours!=null&&T.setHours) T.setHours(+a.hours);
                if(a.maximum!=null&&T.showMaximum) T.showMaximum(!!a.maximum);
                /* (#R193) the two controls the rebuild added: the amplitude the ramp saturates at,
                   and the hourly travel-time contours */
                if(a.amplitude!=null&&T.setAmplitude) T.setAmplitude(+a.amplitude);
                if(a.contours!=null&&T.showContours) T.showContours(!!a.contours);
                if(a.play&&T.play) T.play();
              } }catch(_){}
            ok=true; } }catch(_){}
          /* ⚠ (#R302) 「ここへP波◯秒」 IS A SECOND POINT AND NOBODY HAD CHOSEN IT EITHER — read at `GE().camera.getCenter()` and naming no place at all. Only a point the reader really named answers now (`_herePoint`, which the system prompt's [PINNED POINT] line DEFINES 「ここ」 as), carrying its own name; with none the reply asks. */
          let extra='', ask='', h=null; try{ h=(typeof K._herePoint!=='undefined'&&K._herePoint&&isFinite(K._herePoint.lng))?K._herePoint:null; const at=h?window.IntMapSeismic.at(h.lng,h.lat):null;
            if(at&&at.tP!=null) extra=' · '+L('P here in','ここへP波','P hier in','P здесь через','P aquí en')+' '+Math.round(at.tP)+' s, S '+Math.round(at.tS)+' s ('+esc(h.name||((+h.lat).toFixed(3)+', '+(+h.lng).toFixed(3)))+')'; else if(!h) ask=warn('⚠ '+L('Arrival times need a point — name a place, or tap the map first.','到達時刻には地点が必要です。地名を指定するか、先に地図をタップしてください。','Ankunftszeiten brauchen einen Punkt — Ort nennen oder zuerst auf die Karte tippen.','Для времени прихода нужна точка — укажите место или сначала коснитесь карты.','Los tiempos de llegada necesitan un punto — indica un lugar o toca antes el mapa.')); }catch(_){}
          /* (#R232) 🌐 removed with the panel header's — same feature, same instruction. */
          return R(ok, ok?(note(L('Seismic waves','地震波','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+' — '
            +L('P, S and surface wavefronts ray-traced through the IASP91 Earth model, with arrival time, shaking duration and Modified-Mercalli intensity for the places around it.','P波・S波・表面波の波面をIASP91地球モデルでレイトレーシングし、周辺地点への到達時刻・揺れの継続時間・改正メルカリ震度を表示します。','P-, S- und Oberflächenwellen durch IASP91.','волны P, S и поверхностные по модели IASP91.','frentes P, S y superficiales por IASP91.')+extra)+ask):warn('⚠')); }
    },
  },
  {
    row: ['sim.sunHours',               'sunHours',       'shadeHours,terrainShadow,solarHours,insolationYear',          'sim',     'sim',     'map.sunhours',           'map',                 'session', 'none',   'point',    ''],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), solstice: bool(), terrainOnly: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R176) terrain shade + the annual sunlight budget (the Sun panel owns the controls) */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {
          /* ⚠ (#R302) AND THE `else` THAT ENDED THIS LINE TOOK THE CAMERA'S CENTRE — after which the block below ran the WHOLE-YEAR horizon analysis on it and printed the hours: 「勝手に地図中心を選択しているものとして結果を出す」 at its most expensive. It asks now. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),12)}); }catch(_){} } } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){} if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).'), a.place||a.at||a.location)));
          let ok=false, txt='';
          /* ⚠ (#R298) THE PANEL IS OPENED ON THE POINT THIS ACTION RESOLVED. `open()` with no argument
             named the camera's centre in its own heading, and the `flyTo` above has not landed yet, so
             the reader was shown a heading for the place they were looking at BEFORE they asked. */
          try{ if(window.IntMapSun){ window.IntMapSun.open({lng:ll.lng,lat:ll.lat}); ok=true;
            if(a.solstice){ await window.IntMapSun.solsticeShade(); }
            else if(a.terrainOnly){ window.IntMapSun.terrainShadow(true); }
            else if(ll){ const r=await window.IntMapSun.analysePoint(ll.lng,ll.lat);
              if(r) txt=' — '+Math.round(r.annualHours).toLocaleString()+' h/'+L('year','年','Jahr','год','año')
                +' ('+L('open horizon','遮蔽なし','offener Horizont','открытый горизонт','horizonte abierto')+' '+Math.round(r.annualOpenHours).toLocaleString()+' h, −'+r.lossPct.toFixed(0)+'%) · '
                +L('winter solstice','冬至','Wintersonnenwende','солнцестояние','solsticio')+' '+r.winterSolstice.toFixed(1)+' h'; }
          } }catch(_){}
          return R(ok, ok?note('🌇 '+L('Sunlight hours & terrain shade','日照時間・地形の影','Sonnenstunden & Geländeschatten','Часы солнца и тень рельефа','Horas de sol y sombra')+txt):warn('⚠')); }
    },
  },
  {
    row: ['sim.nightSky',               'nightSky',       'starsFromHere,skyFromHere,stargazing,standHere,skyStanding',  'sim',     'sim',     'map.nightsky',           'map',                 'session', 'none',   'point',    'nightSky'],
    /* `alt` here is how far UP to look, not an altitude; the point is place/at/location or lng+lat */
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), when: str(), time: str(), date: str(), play: bool(), rate: num(), mode: str(), view: str(), stand: bool(), az: num(0, 360), alt: num(-85, 85), fov: num(15, 110), bearing: num() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R208) 「ある地点からの星空」— reachable from Atlas as well as the right-click item (#R112) */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, geocode = K.geocode, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {   /* (#R214) +「立った」モード */
          await window.IntMapLazy.need('nightSky'); const NS=window.IntMapNightSky; if(!NS||!NS.open) return R(false, warn('⚠'));
          /* ⚠ (#R299) 「ここからの星空」 IS NOT 「ここを見ている星空」 — the sky, the measured skyline and the rise
             times belong to ONE standing point, and the reply quoted the centre back as though it were chosen. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where from? Give a place (or lng/lat).','どこからの空ですか（地名または経緯度）。','Von wo aus? Ort angeben.','Откуда? Укажите место.','¿Desde dónde? Indica un lugar.'), a.place||a.at||a.location)));
          await NS.open({lng:ll.lng, lat:ll.lat, when:(a.when||a.time||a.date||null), az:a.az, alt:a.alt, fov:a.fov, bearing:a.bearing, mode:(a.type==='standHere'||a.type==='skyStanding')?'stand':a.mode, view:a.view, stand:a.stand});   /* (#R214) the view is a parameter — js/night-sky.js resolves the spellings */
          if(a.rate!=null&&NS.setRate) NS.setRate(+a.rate); if(a.play&&NS.play) NS.play(true);   /* (#R208) */
          const st=NS.state(), facing=(st.mode==='stand'&&st.look)?(' · '+L('facing','向き','Blick','взгляд','mirando')+' '+Math.round(st.look.az)+'°'):''; return R(true, note((st.mode==='stand'?'🧍 ':'✨ ')+L('Sky from','星空：','Himmel von','Небо от','Cielo desde')+' '+ll.lat.toFixed(3)+'°, '+ll.lng.toFixed(3)+facing+(st.last?' — '+st.last.starsDrawn.toLocaleString()+' '+L('stars above the measured skyline','個が実測した稜線の上に','Sterne über der Skyline','звёзд над горизонтом','estrellas sobre el horizonte'):''))); }
    },
  },
  {
    row: ['sim.space',                  'space',          'solarSystem,planet,planets,explore Space',                    'sim',     'sim',     'map.space',              'map',                 'session', 'none',   '',         ''],
    /* leaving the Earth needs nothing: the default is the solar system, live, at model scale */
    schema: () => ({ type: 'object', properties: { body: str(), planet: str(), target: str(), mode: one('system', 'body'), scale: one('real', 'model'), date: str(), datetime: str(), when: str(), rate: num() } }),
      /* (#R197) the space explorer — the same surface the button at the zoom floor opens */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      {
          const S=window.IntMapSpace;
          if(!S||!S.open) return R(false, warn('⚠ '+L('The space explorer is not available in this build.','宇宙探索はこのビルドで利用できません。','Weltraum-Explorer nicht verfügbar.','Космический обозреватель недоступен.','El explorador espacial no está disponible.')));
          const raw=String(a.body||a.planet||a.target||'').toLowerCase().trim();
          const ALIAS={ sun:'sun','太陽':'sun', mercury:'mercury','水星':'mercury', venus:'venus','金星':'venus',
            earth:'earth','地球':'earth', moon:'moon','月':'moon', luna:'moon', mars:'mars','火星':'mars',
            jupiter:'jupiter','木星':'jupiter', saturn:'saturn','土星':'saturn', uranus:'uranus','天王星':'uranus',
            neptune:'neptune','海王星':'neptune', pluto:'pluto','冥王星':'pluto' };
          const body=ALIAS[raw]||null;
          const mode=(a.type==='planet'||a.mode==='body'||(body&&a.type!=='solarSystem'&&a.type!=='space'))?'body':'system';
          let when=null; if(a.date||a.when||a.datetime){ const d=new Date(a.date||a.when||a.datetime); if(!isNaN(d)) when=d; }
          try{ S.open({ body:body||undefined, mode, scale:(a.scale==='real'||a.scale==='true')?'real':(a.scale==='model'?'model':undefined), when:when||undefined });
            if(a.rate!=null&&S.setRate) S.setRate(+a.rate);
          }catch(_){}
          const nm={sun:'the Sun',mercury:'Mercury',venus:'Venus',earth:'Earth',moon:'the Moon',mars:'Mars',
            jupiter:'Jupiter',saturn:'Saturn',uranus:'Uranus',neptune:'Neptune',pluto:'Pluto'}[body||'earth'];
          return R(true, note('🪐 '+L('Space explorer','宇宙探索','Weltraum-Explorer','Космос','Explorador espacial')+' — '
            +(mode==='body'?L('viewing '+nm+' as a globe, with its IAU place names.','を球体として表示（IAU地名付き）。','als Globus.','как шар.','como globo.')
                            :L('the solar system at the chosen instant, from published orbital elements.','指定時刻の太陽系を、公表軌道要素から計算して表示。','das Sonnensystem zum gewählten Zeitpunkt.','Солнечная система на выбранный момент.','el sistema solar en el instante elegido.')))); }
    },
  },
  {
    row: ['sim.tsunami',                'tsunami',        'tsunamiSim,tsunamiPropagation',                               'sim',     'sim',     'map.tsunami',            'map',                 'session', 'none',   'point',    'tsunami'],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), magnitude: num(), mw: num(), depth: num(0), scope: one('global', 'near'), near: bool(), resolution: str(), hours: num(1, 30), amplitude: num(0), maximum: bool(), contours: bool(), play: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* ⚠ (#R197) `tsunami` IS NOT A HAZARD OF THE DISASTER SIMULATOR ANY MORE — it is its own model.
         「勝手に災害シミュレータ内の津波シミュレータを起動するな」. Both the type and the free-text
         `hazard` field used to land on js/sims.js's bathtub; they now open the propagation simulator
         (js/tsunami.js), which is the only tsunami this app has. It needs an epicentre, a magnitude and
         a focal depth rather than a coastal wave height, so the defaults are the ones the panel itself
         uses and every one of them is overridable in the same call. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, geocode = K.geocode, whereMiss = K.whereMiss, note = K.note;
      {
          await window.IntMapLazy.need('tsunami'); const T=window.IntMapTsunami;
          if(!T||!T.open) return R(false, warn('⚠ '+L('The tsunami propagation simulator is not available in this build.','津波伝播シミュレーターはこのビルドで利用できません。','Tsunami-Simulator nicht verfügbar.','Симулятор цунами недоступен.','El simulador de tsunamis no está disponible.')));
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat,name:g.name}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+whereMiss(L('Where? Give an epicenter (place, or lng/lat).','震源はどこですか（地名または経緯度）。','Wo? Epizentrum angeben.','Где эпицентр?','¿Dónde? Indica el epicentro.'), a.place||a.at||a.location)));
          const mag=(a.magnitude!=null?+a.magnitude:(a.mw!=null?+a.mw:8.5));
          /* ⚠ (#R204) THE SCOPE IS SET BEFORE open() RUNS THE SOLVE. `open()` starts the run itself, so
             a setScope() after it would re-render the panel while the WRONG domain was already being
             integrated — the same "the fix has no path to the thing it fixes" shape as #R183. */
          const nearScope=(a.scope!=null)?(/^near/i.test(String(a.scope))) : (a.near===true||/high|近傍|высок|alta|hoch/i.test(String(a.resolution||'')));   /* ⚠⚠⚠ (#R667) AWAITED, BECAUSE open() DELEGATES TO THE RUNTIME AND THE RUNTIME IS ASYNC. Measured: immediately after this call returned, state() still reported `open:false` and the PREVIOUS epicentre — activation lands a tick later — so every line below it drove a module that had not adopted this event, `build()` found no epicentre, and the reader got nothing while the tool reported it had run. `run:false` itself is right (#R204: the scope must be settled before the solve starts); what was wrong was not waiting for the module to exist. */
          try{ await T.open({ lng:ll.lng, lat:ll.lat, mw:mag, depth:(a.depth!=null?+a.depth:20),
                        scope:nearScope?'near':'global', run:false });
            if(a.hours!=null&&T.setHours) T.setHours(+a.hours);
            if(T.run) T.run();
            if(a.maximum!=null&&T.showMaximum) T.showMaximum(!!a.maximum);
            if(a.amplitude!=null&&T.setAmplitude) T.setAmplitude(+a.amplitude);
            if(a.contours!=null&&T.showContours) T.showContours(!!a.contours);
            if(a.play&&T.play) T.play();
          }catch(_){}
          return R(true, note('🌊 '+L('Tsunami propagation','津波伝播','Tsunami-Ausbreitung','Распространение цунами','Propagación del tsunami')+' — M'+mag.toFixed(1)+' '+(ll.name||(ll.lat.toFixed(2)+', '+ll.lng.toFixed(2)))+'. '
            +L('Shallow-water long waves over the whole ocean; the frames stream in as they are solved.','全球の海洋上を伝わる浅水長波。解けたフレームから順に届きます。','Flachwasser-Langwellen über den ganzen Ozean.','Длинные волны по всему океану.','Ondas largas en todo el océano.'))); }
    },
  },
  /* ══ ⚠⚠⚠ (#R754) THE SIMULATOR ITSELF, NOT THE SCREEN IT IS DRAWN ON ═══════════════════════
     The row above opens the Playground PANEL, and until this round that was the only thing Atlas
     could do about a pandemic: asked to simulate one from Lagos it answered, correctly given what
     it had been told, that IntMap has no transmission simulator (#R747 §6). It has had one since
     #R575. What it had no door to was placing a seed, advancing days and reading a day back.
     ⚠ TWO ROWS, NOT ONE, FOR #R743'S REASON. Computing promises the map nothing; drawing promises
     exactly that. One row declaring both would make the observer measure an unmoved map on every
     run nobody asked to draw and call a correct answer not_rendered — #R736/#R737's 21 wasted
     calls, and #R742's 52 failures in 207. The vocabulary (presets, parameters, ranges) is
     js/pandemic-model.js's PANDEMIC_PARAMS, handed to the planner by js/pandemic-atlas.js
     declaration() rather than copied into a list here. */
  {
    row: ['sim.pandemicRun',            'pandemicRun',    'simulatePandemic,runPandemic,pandemicSimulate,outbreakSim',   'sim',     'none',    '',                       'explanation',         'read',    'none',   'place',    'pandemicSim'],
    /* (#R754) ⚠ `params` IS DELIBERATELY UNENUMERATED, for the reason `data.gis` states above: the
       vocabulary is js/pandemic-model.js's PANDEMIC_PARAMS, which this file cannot read at planning
       time, and a copy of it here would be a second list to keep in step. The REFUSALS carry the
       vocabulary instead — an unknown key answers with every key, and an out-of-range number
       answers with that parameter's own bounds — so one wrong call becomes one corrected call.
       ⚠ `days` IS REQUIRED because «simulate a pandemic» with no horizon has no answer to report;
       the origin is the capability's `place` target and is checked by targetPolicy, which accepts
       place / country / origin / lng+lat. */
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), origin: str(), lng: num(-180, 180), lat: num(-90, 90), preset: str(), scenario: str(), days: num(1), seed: num(), params: obj() }, required: ['days'] }),
      /* (#R52) features the user could not reach reliably through the fuzzy "control" path are now FIRST-CLASS
         actions (verified window fns / element ids), so "open the pandemic simulator", "switch news pins to the
         publisher", "log in", "donate", "send feedback", "report a bug" execute deterministically. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, ensureData = K.ensureData, loadCountryData = K.loadCountryData, countryStats = K.countryStats, HOST = K.HOST;
      { await window.IntMapLazy.need('pandemicSim'); const _P=window.IntMapPandemicAtlas; if(!_P) return R(false, warn('⚠ '+L('The pandemic engine could not be loaded.','パンデミックエンジンを読み込めませんでした。','Die Pandemie-Engine konnte nicht geladen werden.','Не удалось загрузить движок пандемии.','No se pudo cargar el motor de pandemia.'))); await ensureData(); _P.bind({loadCountryData, countryStats:()=>countryStats, lang:()=>HOST.lang}); const _pr=await _P.run(a); return _pr.ok ? R(true,_pr.html,{meta:{pandemic:_pr.meta}}) : R(false, warn(_pr.html), {meta:{code:(_pr.meta&&_pr.meta.code)||'failed'}}); }   /* ⚠⚠ (#R754) THE DOOR TO THE MODEL — the row above opens the SCREEN. Asked to simulate a pandemic from Lagos, Atlas made zero tool calls and said IntMap has no transmission simulator (#R747 §6); it has had one since #R575 and no way in. The engine, the world, the parameter vocabulary and the reply are js/pandemic-atlas.js, because the file this line sits in may not grow (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ). Computing declares NO map — see the second door below. */   /* ⚠⚠ (#R754) THESE TWO DOORS SHARE A ROW WITH THE ONE BELOW, and the sharing is the point: tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ budgets THIS FILE BY LINE, and raising a ceiling to fit one's own change is the move that check exists to catch (js/lazy-modules.js folds for the same reason, in the same words). They sit beside `playground` because that is the same feature: the row below opens the SCREEN, these two drive the MODEL. ⚠ THE ROW MUST STILL BEGIN WITH `case '` — scripts/atlas-catalog.mjs and scripts/atlas-capability-audit.mjs read dispatch labels off line STARTS, so a door folded into the middle of a block is a door they cannot see (measured: both went red). */
    },
  },
  {
    row: ['sim.ballistic',              'missile',        'ballistic,ballisticMissile,strike,icbm',                      'sim',     'sim',     'map.ballistic',          'map',                 'session', 'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), place: str(), target: str(), missile: str(), weapon: str(), name: str(), loft: str(), trajectory: str(), traj: str(), mode: str(), marv: bool(), maneuver: bool(), maneuvering: bool(), coriolis: bool(), nuclear: bool(), warhead: str(), yield: num(0), blast: bool(), seconds: num(1) }, anyOf: [{ required: ['from', 'to'] }, { required: ['from', 'place'] }, { required: ['from', 'target'] }] }), /* `missile` */
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, _gcKm = K._gcKm, missileClass = K.missileClass, esc = K.esc, ballisticSolve = K.ballisticSolve, clearFly = K.clearFly, _ballTrack = K._ballTrack, GE = K.GE, clearBlast = K.clearBlast, drawBlastRings = K.drawBlastRings, ballisticProfileSVG = K.ballisticProfileSVG, note = K.note;
      {
          /* (#R83) proper ballistic-missile simulation (real Keplerian minimum-energy trajectory + Kepler-timed
             flight + to-scale altitude profile + honest physics numbers; optional warhead-effect rings). */
          const A=await geocode(a.from); const B=await geocode(a.to||a.place||a.target);
          if(!A||!B) return R(false, warn('⚠ '+L('Need a launch site and a target','発射地点と目標が必要です','Startort & Ziel nötig','Нужны точка пуска и цель','Se necesita origen y objetivo')));
          const km=_gcKm(A,B); const cls=missileClass(a.missile||a.weapon||a.name);
          let rangeWarn=''; if(cls&&cls.range&&km>cls.range*1.02) rangeWarn=warn('⚠ '+L(esc(cls.name)+' max range is ~'+cls.range.toLocaleString()+' km, but this shot is '+Math.round(km).toLocaleString()+' km — beyond its reach','「'+esc(cls.name)+'」の最大射程は約'+cls.range.toLocaleString()+' kmですが、この距離は'+Math.round(km).toLocaleString()+' kmで射程外です',esc(cls.name)+' Reichweite ~'+cls.range.toLocaleString()+' km, Schuss '+Math.round(km).toLocaleString()+' km — außer Reichweite',esc(cls.name)+' дальность ~'+cls.range.toLocaleString()+' км, а тут '+Math.round(km).toLocaleString()+' км — вне досягаемости',esc(cls.name)+' alcance ~'+cls.range.toLocaleString()+' km, pero son '+Math.round(km).toLocaleString()+' km — fuera de alcance'));
          /* (#R85) selectable trajectory (min-energy / lofted / depressed), Coriolis ground track, MaRV weave and a
             world-scale 3-D altitude arc. Real Keplerian core + Allen–Eggers drag for the impact speed. */
          const loft=(a.loft||a.trajectory||a.traj||(/^(lofted|depressed|minenergy|min-energy|minimum-energy|flat|high|low)$/i.test(String(a.mode||''))?a.mode:'')||'minenergy');
          const marv=!!(a.marv||a.maneuver||a.maneuvering||/marv|maneuv|機動/i.test(String(a.mode||'')+' '+String(a.missile||'')));
          const sol=ballisticSolve(km, loft); const mm=Math.floor(sol.tof/60), ss=Math.round(sol.tof%60);
          K._lastMissileCtx={from:a.from,to:(a.to||a.place||a.target),missile:(a.missile||a.weapon||a.name||''),yieldKt:(a.yield!=null?+a.yield:((a.blast||a.warhead||a.nuclear)&&cls?cls.yield:0)),marv};
          try{ clearFly(); }catch(_){}
          const N=Math.max(80,Math.min(400,Math.round(km/40)));
          const track=_ballTrack(A,B,sol,N,{coriolis:a.coriolis!==false, marv}); const pts=track.pts, alts=track.alts;
          try{ let a2=180,b2=90,c2=-180,d2=-90; pts.forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); });
            if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:{top:160,bottom:80,left:80,right:80},maxZoom:6,duration:900}); }catch(_){}
          const secs=Math.max(10,Math.min(40,+a.seconds||Math.round(9+km/900)));
          try{ window.IntMapArc3D.show({pts,alts,apogee:sol.apogee,prog:0}); setTimeout(()=>{ try{ window.IntMapArc3D.animate(secs); }catch(_){} },950); }catch(_){}
          /* optional warhead-effect rings at the impact point */
          clearBlast(); let rings=null; const Y=(a.yield!=null&&isFinite(+a.yield))?+a.yield:((a.blast||a.warhead||a.nuclear)&&cls?cls.yield:0);
          if(Y>0){ rings=drawBlastRings(B,Y); }
          const nm=cls?(' · '+esc(cls.name)):'';
          const modeLbl={minenergy:L('Minimum-energy','最小エネルギー','Minimalenergie','Мин. энергия','Energía mínima'),lofted:L('Lofted','ロフテッド','Gelobt','Настильная','Elevada'),depressed:L('Depressed','ディプレスト','Flach','Пониженная','Deprimida')}[sol.mode]||sol.mode;
          const angDeg=(sol.gammaL*180/Math.PI);
          let h='<div style="font-weight:600;margin:2px 0 3px;">🚀 '+esc(A.name||a.from)+' → '+esc(B.name||a.to||a.place)+nm+' · '+esc(modeLbl)+(marv?(' · MaRV'):'')+'</div>';
          h+=ballisticProfileSVG(sol,km);
          h+='<div style="font-size:12px;line-height:1.7;">'
            +'<div>'+L('Ground range','地上射程','Bodenreichweite','Дальность','Alcance')+': <b>'+Math.round(km).toLocaleString()+' km</b></div>'
            +'<div>'+L('Apogee (peak altitude)','アポジー（最高高度）','Apogäum','Апогей','Apogeo')+': <b>'+Math.round(sol.apogee).toLocaleString()+' km</b></div>'
            +'<div>'+L('Launch angle','打上げ角','Startwinkel','Угол пуска','Ángulo de lanzamiento')+': <b>'+angDeg.toFixed(1)+'°</b> '+L('above horizontal','（水平から）','über Horizont','над горизонтом','sobre horizontal')+'</div>'
            +'<div>'+L('Burnout velocity','ブーストアウト速度','Brennschlussgeschw.','Скорость выгорания','Velocidad de apagado')+': <b>'+sol.vLaunch.toFixed(2)+' km/s</b> (Mach '+Math.round(sol.vLaunch/0.34)+')</div>'
            +'<div>'+L('Re-entry velocity (100 km)','再突入速度（高度100km）','Wiedereintritt (100 km)','Скорость входа (100 км)','Reentrada (100 km)')+': <b>'+sol.vEntry.toFixed(2)+' km/s</b></div>'
            +'<div>'+L('Impact velocity (after drag)','着弾速度（空気抵抗後）','Aufschlag (nach Luftwiderstand)','Скорость удара (с трением)','Impacto (con rozamiento)')+': <b>'+sol.vImpact.toFixed(2)+' km/s</b> (Mach '+Math.round(sol.vImpact/0.34)+')</div>'
            +'<div>'+L('Coriolis cross-range','コリオリ横偏差','Coriolis-Querablage','Кориолис (боковой снос)','Desvío Coriolis')+': <b>'+Math.round(track.crossRangeKm).toLocaleString()+' km</b></div>'
            +'<div>'+L('Flight time','飛翔時間','Flugzeit','Время полёта','Tiempo de vuelo')+': <b>'+mm+' min '+ss+' s</b></div>'
            +'</div>';
          if(rings){ h+='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;line-height:1.6;">💥 '+L('Warhead','弾頭','Sprengkopf','Боеголовка','Ojiva')+' '+Y.toLocaleString()+' kt — '+rings.map(rg=>esc(rg.l)+' ('+rg.r.toFixed(1)+' km)').join(' · ')+'</div>'; }
          /* (#R85) trajectory-preset buttons ("軌道もボタンで変更可能にしろ") — re-fly the SAME shot on a different profile */
          const _tb=(m,lbl)=>'<button class="atl-traj-btn'+(sol.mode===m?' on':'')+'" data-traj="'+m+'">'+esc(lbl)+'</button>';
          h+='<div class="atl-traj-row">'+_tb('minenergy',L('Min-energy','最小エネルギー','Min-Energie','Мин.','Mín'))+_tb('lofted',L('Lofted','ロフテッド','Gelobt','Настильн.','Elevada'))+_tb('depressed',L('Depressed','ディプレスト','Flach','Пониж.','Deprimida'))
            +'<button class="atl-traj-btn'+(marv?' on':'')+'" data-traj="marv">MaRV '+(marv?'✓':'')+'</button></div>';
          h+=note(L('Keplerian two-body core with a selectable launch angle, plus Allen–Eggers atmospheric drag on the re-entry vehicle, an Earth-rotation (Coriolis) ground track and an optional MaRV terminal weave. Boost thrust is treated as an impulsive burnout at ~200 km; the 3-D arc is drawn to real world scale. Educational estimate — not an operational tool.','ケプラー二体問題を核に、打上げ角を可変化し、再突入体にアレン–エッグスの空気抵抗、地球自転（コリオリ）による地上軌跡、任意で機動再突入体（MaRV）の終末機動を加えています。ブースト推力は高度約200kmでの瞬間的な燃焼終了として近似。立体軌道は実スケールで描画。教育目的の概算であり運用ツールではありません。','Kepler-Zweikörperkern mit wählbarem Startwinkel, Allen–Eggers-Luftwiderstand, Coriolis-Bodenspur und optionalem MaRV-Endmanöver. Bildungsschätzung.','Кеплерова задача двух тел с выбираемым углом пуска, аэродинамическим торможением (Аллен–Эггерс), кориолисовой трассой и опциональным манёвром MaRV. Образовательная оценка.','Núcleo kepleriano con ángulo de lanzamiento variable, rozamiento de reentrada (Allen–Eggers), traza de Coriolis y maniobra MaRV opcional. Estimación educativa.'));
          return R(true, rangeWarn+h); }
    },
  },
  {
    row: ['sim.flyAnimate',             'fly',            'flight,trajectory',                                           'sim',     'sim',     'camera,map.fly',         'camera,map',          'session', 'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), mode: str(), seconds: num(1), missile: str(), yield: num(0), blast: bool() }, required: ['from', 'to'] }), /* `fly` */
    async run(a, dctx, K) { const dispatch = K.dispatch, geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, flyAnimate = K.flyAnimate, note = K.note, esc = K.esc;
      { /* (#R72) animated camera flight ("モスクワからワシントンまで
          ICBMの視点と速度、運動で飛行して") — great-circle path, drawn trajectory, camera follows with a
          mode-specific altitude/pitch profile. */
          /* (#R83) ballistic modes now run the REAL missile simulator (the old icbm mode was just a parabolic
             camera zoom — "粗悪すぎる"); plane/cruise stay cinematic camera flights. */
          if(/^(icbm|missile|ballistic|rocket|弾道|ミサイル)$/i.test(String(a.mode||'')) ) return await dispatch({type:'missile',from:a.from,to:a.to,seconds:a.seconds,missile:a.missile,yield:a.yield,blast:a.blast});
          const A=await geocode(a.from); const B=await geocode(a.to);
          if(!A||!B) return R(false, warn('⚠ '+L('Need start & destination','出発地と目的地が必要です','Start & Ziel nötig','Нужны старт и цель','Se necesitan origen y destino')));
          const mode=({plane:'plane',aircraft:'plane',jet:'plane',cruise:'cruise',drone:'cruise',bird:'plane'})[String(a.mode||'').toLowerCase()]||'plane';
          const secs=Math.max(6,Math.min(90,+a.seconds||22));
          const r=await flyAnimate(A,B,mode,secs);
          return R(r.ok, r.ok?note('🚀 '+esc(A.name||a.from)+' → '+esc(B.name||a.to)+' · '+Math.round(r.km).toLocaleString()+' km · '+r.real):warn('⚠ '+L('Flight could not start','飛行を開始できませんでした','Flug konnte nicht starten','Полёт не запустился','No se pudo iniciar el vuelo'))); }
    },
  },
];
