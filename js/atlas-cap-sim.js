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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, num, one, obj, lat, lng } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
const T = IntMapLang.pickArgs();   /* (atlas-reasoning) a sentence of a `scenario` declaration: the array [en, jp] */
import { icon, withIcons } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

export default [
  {
    row: ['sim.lineOfSight',            'los',            'lineOfSight',                                                 'sim',     'sim',     'map.los',                'map',                 'session', 'none',   'place',    'los'],
    science: 'sun',
    doc: [
      { in: 'tools-panels', at: 90, text: '{"type":"los","place":str} (line-of-sight / radar shadow); ' },
      { in: 'more-features', at: 150, text: '{"type":"los"} with radio refraction (k=4/3), first-Fresnel clearance and knife-edge diffraction, and a range from the link budget; antenna height, power and frequency are adjustable in the panel and the site can be moved by clicking. Use for 「電波の届く範囲」「基地局のカバーエリア」「受信できるか」, "radio coverage from here", "where would this antenna reach", "reception area". (For pure visibility / radar shadow with no radio budget use {"type":"los"} above.)\n' },
    ],
    chips: 'map.los',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), from: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }] }), /* `los` */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place||a.from); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),8)}); }catch(_){} await window.IntMapLazy.need('los'); let ok=false; try{ if(window.IntMapLOS&&window.IntMapLOS.open){ if(window.IntMapLOS.setMode) window.IntMapLOS.setMode('los');   /* (#R296) the merged panel has two analyses; 「見通し線」 is this one */
          window.IntMapLOS.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note(icon('antenna')+' '+L('Line of sight','見通し線','Sichtlinie','Линия видимости','Línea de visión')+': '+esc(ll.name||a.place||'')):warn('')); } return R(false, warn(esc(a.place||a.from||''))); }
    },
  },
  {
    row: ['sim.radiation',              'radiation',      'fallout,dispersion,plume,radiationSim',                       'sim',     'sim',     'map.radiation',          'map',                 'session', 'none',   'place',    ''],
    science: 'radiation',
    /* (atlas-reasoning) WHAT A WHAT-IF OVER THIS MODEL STANDS ON AND DOES NOT REPRESENT — read by research.scenario (js/atlas-cap-research.js)
       through js/atlas-reasoning.js `scenarioModels`. `subject` is the argument the place goes in, `baselineParam` the one an instant goes in
       (null: the model takes no instant, and the scenario says so under «not considered»). The model's own argument vocabulary is not
       restated: it is this entry's `schema`. The sentences are the ones this model already prints (its note) and its method section states. */
    scenario: {
      subject: 'place', baselineParam: 'date',
      data: [
        T('Open-Meteo wind, temperature and precipitation (live, or the ERA5 archive for a past date)', 'Open-Meteo の風・気温・降水（ライブ、過去の日付は ERA5 の記録）'),
        T('IntMap nuclear-site registry (data/npp.json) and the place resolver for the release point', 'IntMap の原子力施設台帳 (data/npp.json) と地名解決による放出点'),
        T('The real Chernobyl Cs-137 deposition thresholds for the dose zones', '線量帯の区分に使う実際のチェルノブイリ Cs-137 沈着量の閾値'),
      ],
      excluded: [
        T('The source term, release duration and isotope are the ones stated; the model does not estimate what a real accident would release', '放出量・放出時間・核種は述べた値で、実際の事故がどれだけ放出するかは見積もらない'),
        T('Dose figures assume a Cs-137 ground-shine conversion; inhalation, ingestion and shielding are not modelled', '線量は Cs-137 の地表沈着からの外部被ばくの換算を仮定する。吸入・摂取・遮蔽は扱わない'),
      ],
      uncertainty: [
        T('An educational approximation, not an operational forecast — in an emergency follow SPEEDI / IAEA / local authorities', '教育用の近似で、運用予測ではない — 実際の緊急時は SPEEDI・IAEA・自治体に従う'),
        T('Turbulent diffusion is stochastic: several runs (the `runs` argument) show the spread between seeds', '乱流拡散は確率的で、複数回実行（`runs`）すると乱数による幅が見える'),
      ],
    },
    /* `source` is BOTH a preset key and a place name (the preset carries its own coordinates), so
       it can stand alone as the release point and cannot be an enum */
    doc: [
      { in: 'radiation-dispersion', at: 10, text: '{"type":"radiation","place":str,"source"?:"chernobyl"|"fukushima"|"dirtybomb"|"research","bq"?:number,"pbq"?:number,"isotope"?:"cs137"|"i131"|"cs134"|"sr90","emitHours"?:num,"hours"?:6-80,"date"?:"YYYY-MM-DDTHH:MM","runs"?:2-10,"seed"?:int} (or {"type":"radiation","hindcast":"obs"|"model"|"ratio","rung"?:"preset"|"jaea"|"jaea-regional"|"jaea-regional-particulate"} = the 2011 answer-check of the model: its own Fukushima run on the 2011 ERA5 wind against the Japanese government aerial Cs-137 survey, cell by cell, with the correlation / bias / factor-of-2 / p10-p90 coverage; no place needed. "rung" picks what the model was given — "preset" (default: the simulator as readers run it, one rate for 120 h), "jaea" (the release the accident had hour by hour, JAEA reconstruction), "jaea-regional" (+ a finer regional wind nest), "jaea-regional-particulate" (+ caesium counted wholly depositable); every answer carries the whole ladder, so "why is the model wrong", "how much is the release to blame" are answered by comparing rungs. Use for "福島の実測と比べて", "how good is the radiation model", "check the plume model against Fukushima", "放出の時間変化を入れたら当たる？") = a real Lagrangian particle plume from a release point advected by the LIVE Open-Meteo wind field (or the ERA5 archive for a past "date"), spread by turbulent diffusion, scavenged by precipitation and decayed by the isotope half-life. It animates the plume AND maps the FINAL ground deposition, classified into the real Chernobyl Cs-137 dose zones, and reports the external dose rate (µSv/h) and annual dose (mSv/yr) at the peak with health context. The user can set the source term (preset, or bq/pbq), emission duration, isotope and start date-time. Use for "福島からの放射性物質の拡散", "simulate a Chernobyl-scale release at X on 2011-03-15", "dirty bomb fallout in Y". ' },
    ],
    chips: 'map.radiation',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), from: str(), at: str(), source: str(), lng: lng(), lat: lat(), isotope: one('cs137', 'i131', 'cs134', 'sr90'), bq: num(0), pbq: num(0), tbq: num(0), becquerel: num(0), emitHours: num(0), halfLife: num(0), halfLifeHours: num(0), hours: num(0), seconds: num(0), date: str(), datetime: str(), when: str(), runs: num(1, 10), seed: num(1), hindcast: one('obs', 'model', 'ratio'), rung: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }, { required: ['at'] }, { required: ['source'] }, { required: ['lat', 'lng'] }, { required: ['hindcast'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, esc = K.esc, HOST = K.HOST, radiationChain = K.radiationChain, note = K.note;
      {
          /* (radiation-hindcast) THE ANSWER-CHECK NEEDS NO RELEASE POINT: it is the model's own Fukushima run against the 2011 survey, precomputed and gated (docs/RADIATION-MODEL.md §10). It is answered before a place is demanded, because «how good is this» has no place in it. */
          if (a.hindcast) {
            const view = (a.hindcast === 'model' || a.hindcast === 'ratio') ? a.hindcast : 'obs';
            let hr = null; try { hr = await window.IntMapRadiation.hindcast(view, a.rung == null ? 'preset' : String(a.rung)); } catch (e) { return R(false, warn(esc((e && e.message) || 'error'))); }
            /* (science-next) an unknown rung is refused WITH the rungs that exist, so the next call can be right */
            if (hr && hr.reason === 'rung') return R(false, warn(esc(L('No such rung: ' + a.rung + '. Rungs: ' + hr.rungs.join(', '), 'その段はありません: ' + a.rung + '。段: ' + hr.rungs.join('、')))));
            if (!hr || !hr.ok) return R(false, warn(L('Could not draw the 2011 comparison.', '2011 年の比較を描けませんでした。')));
            const fx = (b) => { const k = Math.pow(10, -b); return k >= 1 ? L('1/' + k.toFixed(k < 10 ? 1 : 0), k.toFixed(k < 10 ? 1 : 0) + ' 分の 1') : L((1 / k).toFixed(1) + '×', (1 / k).toFixed(1) + ' 倍'); };
            const ladder = hr.ladder.map((x) => x.id + ': r ' + x.metrics.pearsonLog.toFixed(2) + ', ' + L('median cell ', '中央のセル ') + fx(x.metrics.biasLog10) + ', ' + L('within 2× ', '2 倍以内 ') + (x.metrics.fac2 * 100).toFixed(1) + ' %').join(' / ');
            const m = hr.metrics, pc = (v) => (v * 100).toFixed(1) + ' %';
            return R(true, note(icon('radiation') + ' ' + esc(L('The plume model against the 2011 Fukushima survey', 'プルームモデルと 2011 年の福島の実測') + ' (' + ({ obs: L('2011 survey', '2011 年の実測'), model: L('model p50', 'モデル p50'), ratio: L('model ÷ measured', 'モデル ÷ 実測') })[view] + ')')
              + '<div style="font-size:12px;line-height:1.7;margin-top:3px;">'
              + esc(L('Same release as the Fukushima preset, 2011 ERA5 wind, survey of ' + hr.survey.cells + ' cells decay-compensated to ' + hr.asOf + ' (MEXT/NRA via IRSN, CC BY 4.0). Nothing is fitted.', '福島プリセットと同じ放出・2011 年の ERA5 の風。実測は ' + hr.survey.cells + ' セル（' + hr.asOf + ' に減衰補正、文科省／規制委・IRSN 編纂、CC BY 4.0）。調整はしていません。'))
              + '<br>' + esc(L('Correlation (log) r = ' + m.pearsonLog.toFixed(2) + ' · median cell ' + Math.round(Math.pow(10, -m.biasLog10)) + '× too low · within 2×: ' + pc(m.fac2) + ' · within 5×: ' + pc(m.fac5) + ' · measured inside p10–p90: ' + pc(m.bandCoverage) + ' · activity placed in the surveyed area: ' + Math.round(m.massRatioP50 * 100) + ' % of measured.',
                '対数相関 r = ' + m.pearsonLog.toFixed(2) + '・中央のセルで約 ' + Math.round(Math.pow(10, -m.biasLog10)) + ' 分の 1 の過小・2 倍以内 ' + pc(m.fac2) + '・5 倍以内 ' + pc(m.fac5) + '・実測が p10〜p90 内 ' + pc(m.bandCoverage) + '・調査範囲に置かれた量は実測の ' + Math.round(m.massRatioP50 * 100) + ' %。'))
              + '<br>' + esc(L('Rung shown: ' + hr.rung + '. The ladder (one stated change per rung) — ', '表示中の段: ' + hr.rung + '。段ごとの比較（1 段に 1 つの変更）— ') + ladder)
              + (hr.release ? '<br>' + esc(L('The 2011 release (' + hr.release.totalPBq + ' PBq, JAEA / Katata et al. 2015, CC BY 3.0) was itself estimated by fitting a model to measurements, so a better score with it is not an independent test.', '2011 年の放出（' + hr.release.totalPBq + ' PBq、JAEA／Katata ほか 2015、CC BY 3.0）はモデルを実測に合わせて推定されたものなので、これで点が上がっても独立の検証ではありません。')) : '')
              + '</div>'));
          }
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
          if(!ll) return R(false, warn(whereMiss(L('Where is the release source? Name a plant/place, or right-click a point.','放出源はどこですか？（原発名・地名の指定、または地点を右クリック）','Wo ist die Quelle?','Где источник выброса?','¿Dónde está la fuente?'), _place)));
          /* (#R85) selectable source term / emission duration / isotope / start date-time + a FINAL deposition map
             with real dose zones ("放出量や放出時間、日時等も選べるように … 最終的な飛散もマッピング … 地点によってどの程度の
             放射線被害があるかも説明"). */
          const SRCS=window.IntMapRadiation.SOURCES||{}, ISOS=window.IntMapRadiation.ISOTOPES||{};
          /* (#R568) the source term is source × ISOTOPE — an accident has no single activity. Why, and where each figure comes from: docs/RADIATION-MODEL.md §1. A preset with no published figure for the chosen nuclide does not appear rather than borrowing another's. */ const _radPresetTerm=(sk,ik)=>{ try{ return (window.IntMapRadiation.sourceTerm&&window.IntMapRadiation.sourceTerm(sk,ik))||null; }catch(_){ return null; } }, _radPresetBq=(sk,ik)=>{ const t=_radPresetTerm(sk,ik); return t?t.bq:undefined; }; const _radBqOptions=(ik)=>{ const out=[]; for(const k of ['chernobyl','fukushima','dirtybomb','research']){ const t=_radPresetTerm(k,ik); if(!t||!(t.bq>0)) continue; out.push([t.bq,((SRCS[k]&&SRCS[k].n)||k)+' · '+((ISOS[ik]&&ISOS[ik].n)||ik)+' · '+fmtBq(t.bq)]); } out.push([1e15,'1 PBq'],[1e12,'1 TBq']); return out; };
          const srcKey=String(a.source||'').toLowerCase(); const srcPreset=SRCS[srcKey];
          const opts={ seconds:a.seconds, hours:a.hours, emitHours:a.emitHours, halfLifeHours:a.halfLifeHours||a.halfLife,
            isotope:a.isotope, source:a.source, date:a.date||a.datetime||a.when, runs:a.runs, seed:a.seed,
            /* ⚠ `srcPreset.bq` no longer exists and must not come back (see above). */ bq:(a.bq!=null?+a.bq:(a.becquerel!=null?+a.becquerel:(a.pbq!=null?+a.pbq*1e15:(a.tbq!=null?+a.tbq*1e12:_radPresetBq(srcKey,String(a.isotope||'cs137').toLowerCase()))))) };
          let r=null; try{ r=await window.IntMapRadiation.run({lng:ll.lng,lat:ll.lat,name:ll.name},opts); }catch(e){ return R(false, warn(esc((e&&e.message)||'error'))); }
          if(!r||!r.ok) return R(false, warn(((r&&r.reason==='wind')?L('Could not fetch the live wind data the dispersion model needs','拡散モデルに必要な風データを取得できませんでした','Konnte keine Live-Winddaten abrufen','Не удалось получить данные о ветре','No se pudieron obtener datos de viento'):L('The dispersion simulation could not run (map still loading)','拡散シミュレーションを実行できませんでした（地図読込中）','Simulation nicht möglich','Симуляция не запустилась','No se pudo ejecutar la simulación'))));
          const dirName=d=>{ const names=[L('north','北','Nord','север','norte'),L('northeast','北東','Nordost','северо-восток','noreste'),L('east','東','Ost','восток','este'),L('southeast','南東','Südost','юго-восток','sureste'),L('south','南','Süd','юг','sur'),L('southwest','南西','Südwest','юго-запад','suroeste'),L('west','西','West','запад','oeste'),L('northwest','北西','Nordwest','северо-запад','noroeste')]; return names[Math.round(((d%360)/45))%8]; };
          const fmtBq=v=>{ v=+v; if(!isFinite(v)) return '?'; if(v>=1e15) return (v/1e15).toFixed(1)+' PBq'; if(v>=1e12) return (v/1e12).toFixed(0)+' TBq'; if(v>=1e9) return (v/1e9).toFixed(0)+' GBq'; return v.toExponential(1)+' Bq'; };
          /* ⚠⚠⚠ (#R568 ⑩) THE ANNUAL DOSE IS NO LONGER EXTRAPOLATED HERE. It used to be «rate × 8766 × 0.5», i.e. «this dose rate holds for a year» — false for every nuclide and absurd for I-131. The model integrates against decay AND weathering and returns `firstYearMSv`; this side only prints it (docs/RADIATION-MODEL.md §6). */ let h='<div style="font-weight:600;">'+icon('radiation')+' '+esc(ll.name||a.place)+' — '+L('radioactive dispersion & fallout','放射性物質の拡散・降下','radioaktive Ausbreitung & Fallout','рассеивание и выпадение','dispersión y lluvia radiactiva')+'</div>'
            +'<div style="font-size:12.5px;line-height:1.72;margin-top:3px;">'
            +'<div>'+icon('radiation')+' '+L('Source term','放出量','Quellterm','Выброс','Término fuente')+': <b>'+fmtBq(r.bq)+'</b> '+esc(r.iso)+' · '+L('released over','放出時間','über','за','durante')+' '+r.emitHours+' h</div>'
            +(r.startISO?('<div>'+icon('clock')+' '+L('Release start','放出開始','Freisetzungsbeginn','Начало','Inicio')+': '+esc(new Date(r.startISO).toLocaleString(IntMapLang.locale(HOST.lang,"en-GB")))+'</div>'):'')
            +'<div>'+icon('wind')+' '+L('Surface wind','地上風','Bodenwind','Приземный ветер','Viento')+': '+r.windSpeed.toFixed(1)+' m/s '+L('toward the','→ ','Richtung ','на ','hacia el ')+dirName(r.windToward)+' · '+L('plume reach','到達','Reichweite','дальность','alcance')+' ~'+r.reachKm+' km</div>'
            +'<div>'+icon('cloud-rain')+' '+L('Wet deposition','湿性沈着（降雨洗浄）','Nassdeposition','Влажное осаждение','Deposición húmeda')+': '+(r.wet?L('active — rain washing particles down','あり — 降雨が粒子を洗い落とし','aktiv','активно','activa'):L('none in area','領域内でなし','keine','нет','ninguna'))+'</div>'
            +'</div>';   h+=await radiationChain(ll);   /* (#R585) the measured half of the chain — the body is in js/atlas-controls.js, because this file shrinks only by MOVING (tests/atlas-turn-checks.test.mjs #R419 ⑨d, tests/atlas-agent-loop-checks.test.mjs #R511 ⑨) */
          /* final deposition dose zones */
          const zLbls=r.zones||[]; const rows=[];
          for(let z=0;z<zLbls.length;z++){ const km2=(r.zoneKm2&&r.zoneKm2[z])||0; if(km2<=0) continue;
            rows.push('<div style="display:flex;align-items:center;gap:7px;padding:2px 0;"><span style="width:12px;height:12px;border-radius:3px;flex:0 0 auto;background:'+zLbls[z].c+';"></span><span style="flex:1;">'+esc(IntMapLang.pick(()=>HOST.lang).arr(zLbls[z].n))+'</span><span style="color:var(--text-muted);">≥'+zLbls[z].min+' kBq/m² · '+km2.toFixed(km2<10?1:0)+' km²</span></div>'); }
          /* ⚠ (#R568 ⑨) the heading no longer says «Cs-137-equivalent» over an iodine deposit: which ladder is drawn is the model's answer, because a deposition-density statute exists for Cs-137 and Sr-90 and does NOT exist for I-131 or Cs-134 (docs/RADIATION-MODEL.md §3). */ h+='<div style="font-weight:600;margin:6px 0 2px;font-size:12px;">'+(r.zonesAreLegal ? (L('Final ground deposition — statutory zones','最終的な地表沈着—法定区分','Endgültige Bodendeposition — gesetzliche Zonen','Итоговое выпадение — законодательные зоны','Deposición final — zonas legales')+(r.zoneJurisdiction==='ua'?' (UA)':'')) : L('Final ground deposition — density only (this nuclide has no statutory zoning)','最終的な地表沈着—密度のみ（この核種に法定区分はない）','Endgültige Bodendeposition — nur Dichte','Итоговое выпадение — только плотность','Deposición final — sólo densidad'))+'</div>';
          h+=rows.length?('<div style="font-size:11.5px;">'+rows.join('')+'</div>'):('<div style="font-size:11.5px;color:var(--text-muted);">'+L('Deposition stays below mapped thresholds in this run (winds carried most activity out of the modeled area).','この条件では地図化しきい値未満（大半が領域外へ運ばれました）。','unter den Schwellen','ниже порогов','por debajo de umbrales')+'</div>');
          /* (science-instruments) THE SPREAD, when `runs` asked for one — seeds × the assessment's published source-term range (RAD.ensemble). The zone areas are read off the p10 / p50 / p90 MAPS, so the p90 figure is the pessimistic map's area, not a percentile of areas. */
          if(r.ensemble){ const E=r.ensemble, f1=(v)=>v>=10?Math.round(v).toLocaleString():v.toFixed(1); const zr=[]; for(let z=0;z<E.zones.length;z++){ const a=E.zoneKm2.p10[z], b=E.zoneKm2.p50[z], c=E.zoneKm2.p90[z]; if(!(c>0)) continue; zr.push(esc(IntMapLang.pick(()=>HOST.lang).arr(E.zones[z].n))+' ≥'+E.zones[z].min+' kBq/m²: '+f1(b)+' km² ('+f1(a)+'–'+f1(c)+')'); }
            h+='<div style="font-size:11.5px;margin-top:4px;"><b>'+esc(L('Across {m} members ({s} seeds','{m} 通りの計算（乱数の種 {s} 個').replace('{m}',String(E.members)).replace('{s}',String(E.seeds.length)))+(E.ranged?esc(L(' × the published low / central / high release',' × 公表された放出量の下限・中央・上限')):'')+esc(L('): median (10th–90th percentile)','）: 中央値（10〜90 パーセンタイル）'))+'</b><br>'+zr.join('<br>')+'<br>'+esc(L('Peak','最大値'))+' '+f1(E.peakKBqM2.p50)+' kBq/m² ('+f1(E.peakKBqM2.p10)+'–'+f1(E.peakKBqM2.p90)+')</div>'; }
          if(r.seed) h+='<div style="font-size:10.5px;color:var(--text-muted);">'+esc(L('Seed {s} — the same seed on the same wind repeats this run.','乱数の種 {s} — 同じ種と同じ風なら同じ結果を再現します。').replace('{s}',String(r.seed)))+'</div>';
          /* ⚠⚠⚠ (#R568 ⑦) A PEAK CELL IS AN ESTIMATE AND NOW SAYS SO — `peakRelSE` ≈ 1/√n is its error bar and below `minPeakN` no figure is headlined at all, because a number with no error bar is read as having none. ⚠ And the external dose is not universal: Sr-90 → Y-90 are pure beta, so `externalMeaningful` is false and this says so rather than printing a µSv/h that would be read as the hazard (docs/RADIATION-MODEL.md §2, §7). */ if(r.peakKBqM2>0){ const uH=r.peakDoseUSvH, yr=r.firstYearMSv, se=Math.round((r.peakRelSE||0)*100), pk=r.peakKBqM2>=1?Math.round(r.peakKBqM2).toLocaleString():r.peakKBqM2.toFixed(2); h+='<div style="font-size:11.5px;margin-top:4px;">'+icon('chart')+' '+L('Peak deposition','最大沈着','Spitzendeposition','Пик','Pico')+': <b>'+pk+' kBq/m²</b>' +(r.peakWellSampled?(' <span style="color:var(--text-muted);">±'+se+'%</span>'):(' <span style="color:var(--text-muted);">— '+L('too few particles reached this cell to quote a value','この地点に到達した粒子が少なく、数値として示せません','zu wenige Partikel für einen Wert','слишком мало частиц для оценки','muy pocas partículas para un valor')+'</span>')) +(r.externalMeaningful ? (' → '+L('external dose rate','外部被ばく線量率','Dosisleistung','мощность дозы','tasa de dosis')+' ≈ <b>'+(uH>=1?uH.toFixed(1):uH.toFixed(2))+' µSv/h</b> ('+L('first year','初年度','erstes Jahr','первый год','primer año')+' ≈ '+(yr>=1?Math.round(yr):yr.toFixed(2))+' mSv)') : (' · '+L('external dose from this deposit is minor — Sr-90/Y-90 are beta emitters, and the hazard is ingestion, not ground shine','この沈着からの外部被ばくは小さい（Sr-90/Y-90 はベータ核種で、危険は地表からの放射線ではなく摂取）','externe Dosis gering — Beta-Strahler','внешняя доза мала — бета-излучатели','dosis externa menor — emisores beta'))) +'</div>';
            /* ⚠ (#R568 ④⑥) WHAT IS NOT ON THE MAP. The old run settled half of everything still airborne onto the ground and clamped straying particles to the domain edge, so the map always LOOKED complete. Both are gone, so it can now be honestly incomplete — and that is a fact about the figures above it. */ const away=[]; if(r.escapedMassFrac>0.02) away.push(Math.round(r.escapedMassFrac*100)+'% '+L('left the modelled area','領域外へ流出','außerhalb','вышло за область','fuera del área')); if(r.airborneFrac>0.02) away.push(Math.round(r.airborneFrac*100)+'% '+L('still airborne when the window closed','計算終了時にまだ大気中','noch in der Luft','ещё в воздухе','aún en el aire')); if(away.length) h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+icon('wind')+' '+L('Not on this map','この地図に含まれないもの','Nicht auf dieser Karte','Не на этой карте','No en este mapa')+': '+away.join(' · ')+'</div>';
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
  /* ══ (science-instruments) IF IT ERUPTED NOW — the volcanic-ash what-if ══════════════════════════
     The volcano card answers what a volcano HAS done and what agencies SAY; this answers where the ash
     of an eruption starting now would go, over the live upper-air wind (js/ash-model.js, panel
     js/ash-plume.js). The volcano is RESOLVED IN THE GVP CATALOGUE or the call is refused — a geocoder's
     nearest stranger would put an eruption somewhere that is not a volcano (#R515). */
  {
    row: ['sim.ashPlume',               'ashPlume',       'volcanicAsh,ashFall,ashCloud,eruptionSim,tephraFall',         'sim',     'sim',     'map.ashPlume',           'map,explanation',     'session', 'none',   '',         'ashPlume'],
    science: 'ash',
    /* (atlas-reasoning) WHAT A WHAT-IF OVER THIS MODEL STANDS ON AND DOES NOT REPRESENT — read by research.scenario (js/atlas-cap-research.js)
       through js/atlas-reasoning.js `scenarioModels`. `subject` is the argument the place goes in, `baselineParam` the one an instant goes in
       (null: the model takes no instant, and the scenario says so under «not considered»). The model's own argument vocabulary is not
       restated: it is this entry's `schema`. The sentences are the ones this model already prints (its note) and its method section states. */
    scenario: {
      subject: 'name', baselineParam: 'start',
      data: [
        T('Smithsonian Global Volcanism Program catalogue — vent position and dominant rock', 'スミソニアン世界火山計画のカタログ — 火口の位置と主要岩石'),
        T('Open-Meteo upper-air wind, 850–50 hPa (live, or the archive for a past start)', 'Open-Meteo の上空風（850–50 hPa。ライブ、過去の開始時刻は再解析の記録）'),
        T('Mastin et al. (2009) eruption source parameters — eruption type and rate from column height', 'Mastin ほか (2009) の噴火源パラメータ — 噴煙高度から噴火の型と噴出率'),
      ],
      excluded: [
        T('Whether, when or how large the eruption would be — this is a what-if over a stated eruption, not a forecast', '噴火が起きるか・いつか・どの規模かは扱わない — 述べた噴火を仮定した「もしも」であり予報ではない'),
        T('Ash aggregation and rain-out are not modelled; the airborne cloud is distal fine ash only', '火山灰の凝集と降雨による除去は扱わない。空中の雲は遠方の細粒灰のみ'),
      ],
      uncertainty: [
        T('The mass eruption rate follows from the column height and is uncertain by a factor of several (Mastin et al. 2009)', '噴出率は噴煙高度から導かれ、数倍の不確かさがある (Mastin ほか 2009)'),
        T('One wind field drives the whole run; a different day\'s wind moves the deposit', '1 つの風の場で全体を動かす。別の日の風なら降灰域は動く'),
      ],
    },
    doc: [
      { in: 'volcanoes', at: 30, text: '{"type":"ashPlume","name":VOLCANO_NAME_OR_GVP_NUMBER (or "lng"+"lat"),"style"?:"M1"|"M0"|"S1"|"S0"|"S3","hKm"?:num (column height above the vent),"hours"?:num (eruption duration),"window"?:6-72,"m63"?:0-1,"start"?:ISO-8601 UTC,"seed"?:int} = IF THIS VOLCANO ERUPTED NOW (いま噴火したら火山灰はどこへ): a Lagrangian ash model over the LIVE upper-air wind (Open-Meteo 850–50 hPa). The eruption type defaults from the volcano\'s own dominant rock (Mastin et al. 2009 eruption source parameters) and the mass eruption rate follows from the column height. Returns the ground deposit (mm, areas ≥0.1/1/10/100 mm, the named towns under ≥1 mm with their population), the airborne cloud by London-VAAC flight-level bands (SFC–FL200, FL200–350, FL350–550) and concentration thresholds (0.2/2/4 mg/m³) hour by hour, and what the run leaves out. It also registers the deposit and the cloud as two datasets (meta.ash.datasets) that {"type":"query","from":<that id>} and the GIS steps can read — e.g. which cities sit under ≥1 mm. A WHAT-IF, NOT A FORECAST: real ash advisories come from the VAACs, and the SIGMET layer shows what is in force. Use for 「桜島が今噴火したら灰はどこに降る？」「富士山が噴火したら羽田は？」, "where would ash from Etna go today", "which airports would an eruption of Hekla close". ' },
    ],
    schema: () => ({ type: 'object', properties: { volcano: str(), name: str(), place: str(), lng: lng(), lat: lat(), ventM: num(), style: one('M1', 'M0', 'S1', 'S0', 'S3'), hKm: num(0.5, 40), hours: num(0.1, 120), window: num(6, 72), m63: num(0.005, 0.95), distalFrac: num(0.001, 0.5), start: str(), seed: num(1) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L, esc = K.esc, HOST = K.HOST;
      await window.IntMapLazy.need('ashPlume');
      const A = window.IntMapAshPlume;
      if (!A) return R(false, warn(L('The ash model could not be loaded.', '火山灰モデルを読み込めませんでした。')));
      const q = a.volcano != null ? a.volcano : (a.name || a.place || '');
      const hasLL = a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat);
      if (!hasLL && !String(q).trim()) return R(false, warn(L('Name the volcano (as the Smithsonian catalogue names it), or give its coordinates.', '火山の名前（スミソニアンのカタログの名称）か、座標を指定してください。')), { meta: { code: 'needs-volcano' } });
      if (!hasLL && !(await A.resolveVolcano(q))) return R(false, warn(L('«{q}» is not a volcano in the Smithsonian Global Volcanism Program catalogue. Use its catalogue name (e.g. «Aira» for Sakurajima) or its coordinates.', '「{q}」はスミソニアン世界火山計画のカタログにある火山ではありません。カタログの名称（例: 桜島は «Aira»）か座標で指定してください。').replace('{q}', String(q))), { meta: { code: 'not-a-volcano' } });
      await A.open(hasLL ? { lng: +a.lng, lat: +a.lat, name: String(q || ''), elevM: a.ventM } : q);
      const r = await A.run({ style: a.style, hKm: a.hKm, hours: a.hours, window: a.window, m63: a.m63, distalFrac: a.distalFrac, start: a.start, seed: a.seed });
      if (!r || !r.ok) return R(false, warn(r && r.reason === 'wind' ? L('The upper-air wind could not be fetched, so nothing was computed.', '上空の風を取得できなかったため、計算していません。')
        : r && r.reason === 'range' ? L('The wind service covers the last 92 days and the next 14 days; that start is outside it.', '風のデータは過去92日〜先14日の範囲です。その開始時刻は範囲外です。')
        : L('The ash model could not run.', '火山灰モデルを実行できませんでした。')), { meta: { code: (r && r.reason) || 'failed' } });
      const f = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0 });
      const ex = (v) => { const e = Math.floor(Math.log10(v)); return (v / Math.pow(10, e)).toFixed(1) + '×10^' + e; };
      let h = '<div style="font-weight:600;">' + icon('volcano') + ' ' + esc(r.volcano || (r.lat.toFixed(2) + ', ' + r.lng.toFixed(2))) + ' — ' + esc(L('if it erupted now', 'いま噴火したら')) + '</div>'
        + '<div style="font-size:12.5px;line-height:1.7;margin-top:3px;">'
        + '<div>' + esc(L('Type', '型')) + ' ' + esc(r.style) + (r.styleFrom === 'rock' ? ' (' + esc(L('from its dominant rock', '主要岩石から')) + ')' : '') + ' · ' + f(r.hKm, 1) + ' km · ' + f(r.eruptionHours, 1) + ' h · ' + esc(L('rate', '噴出率')) + ' ' + ex(r.merKgS) + ' kg/s</div>'
        + '<div>' + esc(L('Deposit', '降灰')) + ': ' + (r.peakDepositMm != null ? esc(L('thickest', '最大')) + ' ' + f(r.peakDepositMm, 1) + ' mm ±' + Math.round(100 * r.peakDepositRelSE) + '% · ' : '') + Object.keys(r.depositKm2).map((k) => esc(k) + ' ' + f(r.depositKm2[k]) + ' km²').join(' · ') + '</div>'
        + (r.exposure && r.exposure.towns ? '<div>' + esc(L('Named towns under ≥1 mm', '≥1 mm の地名辞典の町')) + ': ' + f(r.exposure.towns) + ' · ' + esc(L('their population', 'その人口')) + ' ' + f(r.exposure.population) + ' (' + r.exposure.top.slice(0, 5).map((t) => esc((HOST.lang === 'jp' && t.nameJa) ? t.nameJa : t.name) + ' ' + f(t.mm, 1) + ' mm').join(', ') + ')</div>' : '')
        + '<div>' + esc(L('Cloud peak', '雲の最大濃度')) + ': ' + Object.keys(r.peakConcMgM3).map((k) => esc(k) + ' ' + f(r.peakConcMgM3[k], 2) + ' mg/m³').join(' · ') + ' · ' + esc(L('≥0.2 mg/m³ reaches', '0.2 mg/m³ 以上の到達')) + ' ' + f(r.cloudReachKm) + ' km</div>'
        + '</div>';
      h += note(L('A what-if over a hypothetical eruption on the live wind, not a forecast. Rate from column height (Mastin et al. 2009, uncertain by a factor of several); cloud = distal fine ash only; aggregation and rain-out not modelled. Seed {s}. Method: science.html#ash', '実際の風の上で仮想の噴火を計算した「もしも」で、予報ではありません。噴出率は噴煙柱の高さから推定（Mastin ほか 2009・数倍の不確かさ）、雲は遠方まで残る細粒分のみ、凝集と降雨による除去は扱いません。乱数の種 {s}。手法: science.html#ash').replace(/\{s\}/g, String(r.seed)));
      return R(true, h, { meta: { ash: r } });
    },
  },
  {
    row: ['sim.flightSim',              'flightSim',      'flightsim,flightsimulator,flysim,pilot',                      'sim',     'sim',     'camera,map.flightsim',   'map,camera',          'session', 'none',   'place?',   'flightSim'],
    science: 'flight',
    doc: [
      { in: 'sim.flightSim', text: 'FLIGHT SIMULATOR: {"type":"flightSim","place"?:str,"alt"?:meters} = starts a real, flyable arcade flight simulator over the actual world map (the camera becomes the cockpit; keyboard W/S throttle, ↑/↓ pitch, ←/→ bank, A/D rudder, Esc to exit; live HUD with airspeed/altitude/heading/artificial-horizon; coordinated-turn physics, stall and ground collision). Use for "フライトシミュレーターを起動して", "let me fly a plane over the Alps" → pass place. {"type":"flightSim","on":false} exits it.\n' },
    ],
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
          return R(ok, ok?note(icon('plane')+' '+L('Flight simulator — pick your aircraft & runway, then START','飛行シミュレーター — 機体と滑走路を選んで START','Flugsimulator — Flugzeug & Piste wählen, dann START','Авиасимулятор — выберите самолёт и полосу, затем СТАРТ','Simulador — elige avión y pista, luego INICIAR')+(nm?(' · '+esc(nm)):'')):warn(L('Could not start the flight simulator','飛行シミュレーターを開始できませんでした','Konnte den Flugsimulator nicht starten','Не удалось запустить','No se pudo iniciar')), ok?{meta:{opened:'flightSim'}}:null); }   /* (#R760) the window IS the deliverable here — js/atlas-capabilities.js `sim` reads this instead of asking a map surface that cannot hold it */
    },
  },
  {
    row: ['sim.rfCoverage',             'rfCoverage',     'coverage,radioCoverage,signalCoverage,reception,viewshed',    'sim',     'sim',     'map.coverage',           'map',                 'session', 'none',   'point',    'los'],
    science: 'sun',
    doc: [
      { in: 'more-features', at: 140, text: '{"type":"rfCoverage","place"?:str,"lng"?:num,"lat"?:num,"height"?:num (antenna height in m),"power"?:num (dBm),"frequency"?:num (MHz)} = the line-of-sight service area over the REAL terrain, solved by the same viewshed as ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'map.los',   /* ⚠ the line-of-sight kind, because that is what it switched before; its own painter claims nothing */
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
          if(!ll) return R(false, warn(whereMiss(L('Where? Give the transmitter site (place, or lng/lat).','送信点はどこですか（地名または経緯度）。','Wo? Senderstandort angeben.','Где передатчик?','¿Dónde? Indica el emplazamiento del emisor.'), a.place||a.at||a.location)));
          /* ⚠ (#R296) ONE PANEL — 「電波・通信圏と見通し線解析を統合して」. `IntMapRF` is gone; this is `IntMapLOS` with a frequency. */
          try{ if(window.IntMapLOS){ const L2=window.IntMapLOS;
            if(L2.setMode) L2.setMode(/^(los|lineOfSight|viewshed)$/.test(String(a.type||''))?'los':'radio');
            if(L2.setParams) L2.setParams((+a.height||+a.antennaHeight||null), null, null, 1.3333, (+a.frequency||+a.freq||null));
            L2.open(ll); } }catch(_){}
          return R(true, note(icon('antenna')+' '+L('Radio coverage','電波・通信圏','Funkabdeckung','Радиопокрытие','Cobertura de radio')+' — '+L('line-of-sight service area over real terrain. Set antenna height / power / frequency in the panel; click to move the mast.','実地形上の見通し到達域。パネルでアンテナ高・出力・周波数を設定、クリックで基地局を移動。','Sichtlinie über echtem Gelände.','зона прямой видимости.','área de línea de vista.'))); }
    },
  },
  {
    row: ['sim.sunPosition',            'sun',            'shadow,shadows,sunlight,sunPosition,daylight,insolation',     'sim',     'sim',     'map.sun',                'map',                 'session', 'none',   'point',    ''],
    science: 'sun',
    doc: [
      { in: 'sunlight', at: 20, text: '{"type":"sun"} instead. BOTH OF THEM NEED A POINT: give "place" or "lng"/"lat", or let the spot the user tapped on the map supply it. Neither falls back to the map centre any more — every number they print is a function of one coordinate — so an action with no point at all is answered with a question rather than with a guess.\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), date: str(), datetime: str(), time: str() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }), /* `sun` */
      /* (#R90) sun & shadow */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {
          /* ⚠ (#R302) THE RESOLVED PLACE WAS THROWN AWAY — geocoded, flown to, then `open()` WITH NO ARGUMENT, so the panel answered for the camera's centre, which `flyTo` had not even reached yet. It is handed over now, and with none the reply asks. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),15)}); }catch(_){} } } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){} if(!ll) return R(false, warn(whereMiss(L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).'), a.place||a.at||a.location)));
          try{ if(window.IntMapSun){ window.IntMapSun.open({lng:ll.lng,lat:ll.lat}); if(a.date||a.time||a.datetime){ const d=new Date(a.datetime||((a.date||'')+(a.time?('T'+a.time):''))); if(!isNaN(d)) window.IntMapSun.setTime(d); } } }catch(_){}
          return R(true, note(icon('sunset')+' '+L('Sun & shadow','日照・影','Sonne & Schatten','Солнце и тень','Sol y sombra')+' — '+withIcons(L('pick a date & time; buildings in view (zoom in) cast real shadows and the 3D scene is lit from the sun. Press {icon:play} to sweep the day.','日時を選択。表示中の建物（拡大時）が実際の影を落とし、3Dは太陽方向から照らされます。{icon:play}で一日を再生。','Datum/Zeit wählen — echte Gebäudeschatten.','выберите дату/время — реальные тени зданий.','elige fecha/hora — sombras reales.')))); }
    },
  },
  {
    row: ['sim.terrainWater',           'terrainWater',   'waterFlow,terrainEdit,watershedSim,sculpt',                   'sim',     'sim',     'map.terrainWater',       'map',                 'session', 'none',   'point',    'terrainWater'],
    science: 'water',
    doc: [
      { in: 'terrain-water', at: 10, text: '{"type":"terrainWater","place"?:str,"lng"?:num,"lat"?:num,"rainMm"?:num,"waterM3"?:num,"flowM3s"?:num,"raiseM"?:num,"lowerM"?:num,"radiusM"?:num,"mode"?:"pan"|"raise"|"lower"|"levee"|"source","pour"?:"once"|"cont"|"stop","pourRateM3s"?:num,"timeSpeed"?:num,"resetTerrain"?:bool} = opens the terrain sculptor over the REAL elevation model for the area in view: the user brushes the ground up or down, draws levees and dams as lines, and drops any amount of water on it. The water is routed by priority-flood depression filling plus downslope volume accounting, so the FLOW PATHS, the PONDED AREA and the OVERTOPPING (breach) DIRECTION all change with every edit, in real time. It reports the ponded volume, the flooded area, the maximum depth and every spill point with the volume going over it. "rainMm" applies a uniform rainfall, "waterM3" drops that volume at the point, "flowM3s" sets the downstream channel DISCHARGE in m³/s (the drawn channel width/depth follows it; omit = derive from the placed volume), "raiseM"/"lowerM" sculpt there (with "radiusM"). "pour":"cont" keeps water arriving at the last placed source at "pourRateM3s" cubic meters per SIMULATED second, sped up by "timeSpeed" (the quasi-static filling sequence — the solver is steady-state, so this repeats the same solve as the volume grows); "pour":"stop" halts it and "pour":"once" restores the single fixed volume per click. "resetTerrain":true undoes the sculpting and the levees but LEAVES the placed water, so the same water can be re-run on the original ground. Use for "この谷にダムを作ったらどこまで水没する", "地形を編集して水を流したい", "sculpt the terrain and pour water on it", "what happens if I build a levee here". NOTE this is a where-does-the-water-END-UP model, not a wave-speed model — for tsunami ARRIVAL use ' },
    ],
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
          return R(ok, ok?note((icon('mountain')+icon('drop')+' ')+L('Terrain & water','地形編集・水流','Gelände & Wasser','Рельеф и вода','Terreno y agua')+' — '
            +(st?(L('ponded','湛水','aufgestaut','затоплено','embalsado')+' '+Math.round(st.storedM3).toLocaleString()+' m³ · '+st.floodKm2.toFixed(2)+' km² · '
              +(st.breaches?(st.breaches+' '+L('spill points','箇所で越流','Überströmstellen','точек перелива','desbordes')):L('nothing overtopping','越流なし','kein Überströmen','без перелива','sin desborde'))+' · ')
              :'')
            +L('brush the ground up or down, draw a levee, drop water — the flow paths, the ponding and the breach direction follow.','ブラシで盛る・削る、堤防を線で引く、水を落とす——流下経路・湛水域・決壊方向がそのまま追随します。','Gelände formen, Deich zeichnen, Wasser fallen lassen.','лепите рельеф, рисуйте дамбу, лейте воду.','esculpa el terreno, dibuje un dique, suelte agua.')):warn('')); }
    },
  },
  {
    row: ['sim.earthquake',             'earthquake',     'seismic,quakeSim,seismicWaves,earthquakeSim',                 'sim',     'sim',     'map.seismic',            'map',                 'session', 'none',   'point',    'seismic'],
    science: 'seismic',
    doc: [
      { in: 'sim.earthquake', text: 'SEISMIC WAVE SIMULATION: {"type":"earthquake","place"?:str,"lng"?:num,"lat"?:num,"depth"?:km,"magnitude"?:Mw,"t"?:seconds,"site"?:"hard"|"rock"|"stiff"|"soft","scale"?:"mmi"|"jma","speed"?:num,"slip"?:m,"opacity"?:0-1,"tsunami"?:bool,"hours"?:1-30,"maximum"?:bool,"play"?:bool,"amplitude"?:m,"contours"?:bool,"real"?:bool} = set an epicentre, depth and magnitude and watch the P wave, the S wave and the surface waves spread over the globe in REAL TIME (playback "speed" ×1 default, user-adjustable). Arrival times are RAY-TRACED through the IASP91 reference Earth model (the same model the USGS locates earthquakes with), so the travel-time curve, its triplications and the core shadow all come out of the physics. The intensity is PAINTED as a terrain-aware field: Vs30 is estimated from real DEM topographic slope (Wald & Allen 2007) cell by cell, so basins amplify and hard ground does not — not concentric circles. "scale" switches between Modified-Mercalli (Worden et al. 2012, the ShakeMap GMICE, on PGV taken over the usable band of a strong-motion record) and the JMA shindo, which is computed by its own definition (the JMA period/10 Hz/0.5 Hz filters and the level exceeded for a total of 0.3 s) rather than converted. In the panel the user can FREE-DRAW a rupture area and set the average "slip" (m): the magnitude then comes from M0=μAD and all distances become distance-to-rupture, so the field follows the fault shape. "site" sets the fallback ground class where no DEM is available; "real":true loads the largest real earthquake of the past month from the USGS feed. The field is computed on demand: the panel has a COMPUTE button with a real progress percentage, and "opacity" (0-1) sets how solidly the intensity is painted over the map (default 0.85). The painted field runs out to where the LOWEST class of the chosen scale ends; past 1,000 km the regional attenuation law is extrapolated and the panel says how many cells that is. Crustal attenuation is frequency-dependent, Q = Q0*f^eta (Raoof, Herrmann & Malagnini 1999), and both numbers are adjustable in the panel. When the event is TSUNAMIGENIC by the operational screening (Mw>=6.5, focal depth <=100 km, and the epicentre under the sea per the real DEM) the panel offers the TSUNAMI PROPAGATION SIMULATOR and "tsunami":true opens it directly: shallow-water long waves (total-depth pressure and Manning bottom friction) solved on a spherical staggered grid over the real sea floor IN A BACKGROUND THREAD, so the page never freezes and the frames stream in as they are computed — the wave is watchable within seconds of pressing the button. It is initialized with the Okada (1985) co-seismic sea-floor displacement summed over a tapered sub-fault grid, ANIMATED (interpolated between frames, so it is smooth at any playback speed) so the wave is seen crossing the ocean, with TRAVEL-TIME CONTOURS every hour, a maximum-wave-height field ("maximum":true), a coastal height by Green law, and a click anywhere on the sea to read the arrival time and wave height there. "hours" (1-30) is how long to simulate, "play":true starts the animation, "amplitude" (m) sets the sea-surface amplitude at which the color ramp saturates and "contours":false hides the hour lines. The domain is the WHOLE PLANET at 0.25° — longitude wraps, so a wave leaves one side of the Pacific and arrives at the other instead of running off the edge of a box. Use for "東京の真下でM7の地震が起きたら", "simulate an M8 off Chile and tell me when it reaches Tokyo", "地震波の伝わり方を見せて", "震度分布を気象庁階級で見せて".\n' },
    ],
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
            if(at&&at.tP!=null) extra=' · '+L('P here in','ここへP波','P hier in','P здесь через','P aquí en')+' '+Math.round(at.tP)+' s, S '+Math.round(at.tS)+' s ('+esc(h.name||((+h.lat).toFixed(3)+', '+(+h.lng).toFixed(3)))+')'; else if(!h) ask=warn(L('Arrival times need a point — name a place, or tap the map first.','到達時刻には地点が必要です。地名を指定するか、先に地図をタップしてください。','Ankunftszeiten brauchen einen Punkt — Ort nennen oder zuerst auf die Karte tippen.','Для времени прихода нужна точка — укажите место или сначала коснитесь карты.','Los tiempos de llegada necesitan un punto — indica un lugar o toca antes el mapa.')); }catch(_){}
          /* (#R232) 🌐 removed with the panel header's — same feature, same instruction. */
          return R(ok, ok?(note(L('Seismic waves','地震波','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+' — '
            +L('P, S and surface wavefronts ray-traced through the IASP91 Earth model, with arrival time, shaking duration and Modified-Mercalli intensity for the places around it.','P波・S波・表面波の波面をIASP91地球モデルでレイトレーシングし、周辺地点への到達時刻・揺れの継続時間・改正メルカリ震度を表示します。','P-, S- und Oberflächenwellen durch IASP91.','волны P, S и поверхностные по модели IASP91.','frentes P, S y superficiales por IASP91.')+extra)+ask):warn('')); }
    },
  },
  {
    row: ['sim.sunHours',               'sunHours',       'shadeHours,terrainShadow,solarHours,insolationYear',          'sim',     'sim',     'map.sunhours',           'map',                 'session', 'none',   'point',    ''],
    science: 'sun',
    doc: [
      { in: 'sunlight', at: 10, text: '{"type":"sunHours","place"?:str,"lng"?:num,"lat"?:num,"solstice"?:bool,"terrainOnly"?:bool} = the Sun & shadow panel\'s terrain half. Without options it analyses ONE POINT for a whole year: it builds a 360° horizon from the real elevation model (with earth curvature and refraction) and steps a year of sun positions against it, giving the annual sunlight hours, how many hours the terrain costs compared with an open horizon, the hours on the winter solstice / summer solstice / equinox, the days a year with no sun at all, the hours a solar panel could work and the clear-sky direct-beam total in kWh/m². "solstice":true instead paints every cell in view that the sun NEVER reaches on the winter solstice; "terrainOnly":true just switches the live terrain-shadow (mountain shade) overlay on. Use for "この土地の年間日照時間は", "冬至にこの家に日は当たる", "山影がかかるのはどこ", "how many hours of sun does this valley get", "solar potential here". For BUILDING shadows at one moment, use ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), solstice: bool(), terrainOnly: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R176) terrain shade + the annual sunlight budget (the Sun panel owns the controls) */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {
          /* ⚠ (#R302) AND THE `else` THAT ENDED THIS LINE TOOK THE CAMERA'S CENTRE — after which the block below ran the WHOLE-YEAR horizon analysis on it and printed the hours: 「勝手に地図中心を選択しているものとして結果を出す」 at its most expensive. It asks now. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),12)}); }catch(_){} } } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){} if(!ll) return R(false, warn(whereMiss(L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).'), a.place||a.at||a.location)));
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
          return R(ok, ok?note(icon('sunset')+' '+L('Sunlight hours & terrain shade','日照時間・地形の影','Sonnenstunden & Geländeschatten','Часы солнца и тень рельефа','Horas de sol y sombra')+txt):warn('')); }
    },
  },
  {
    row: ['sim.nightSky',               'nightSky',       'starsFromHere,skyFromHere,stargazing,standHere,skyStanding',  'sim',     'sim',     'map.nightsky',           'map',                 'session', 'none',   'point',    'nightSky'],
    science: 'space',
    /* `alt` here is how far UP to look, not an altitude; the point is place/at/location or lng+lat */
    doc: [
      { in: 'night-sky', at: 10, text: '{"type":"nightSky","place"?:str,"lng"?:num,"lat"?:num,"when"?:ISO-8601 str,"play"?:bool,"rate"?:num (simulated seconds per real second),"mode"?:"dome"|"stand","az"?:num (0-360, compass direction to face),"alt"?:num (-85..85, how far up to look),"fov"?:num (15-110, field of view in degrees)} = the sky a person STANDING at that point has: the Hipparcos catalog precessed to the instant and resolved into the observer own horizon, the Sun, Moon and planets from the JPL elements, and — this is the part that makes it a place and not a chart — the SKYLINE MEASURED off the elevation model, so a mountain to the west really does hide the stars setting behind it. TWO VIEWS of the same sky: "dome" (default) is the all-sky chart, the whole hemisphere at once; "mode":"stand" is FIRST PERSON — a rectilinear lens you point with "az"/"alt" and zoom with "fov", the way it looks to someone actually standing there, and the one to use when asked what the sky looks like FROM somewhere, what is visible toward a direction, or to stand/be at a place. {"type":"standHere"} is the same thing. Defaults to NOW at the point; "when" sets an instant and "play" runs the sky forward at "rate". For the solar system seen from outside, use ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), when: str(), time: str(), date: str(), play: bool(), rate: num(), mode: str(), view: str(), stand: bool(), az: num(0, 360), alt: num(-85, 85), fov: num(15, 110), bearing: num() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] }),
      /* (#R208) 「ある地点からの星空」— reachable from Atlas as well as the right-click item (#R112) */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, geocode = K.geocode, whereMiss = K.whereMiss, L = K.L, note = K.note;
      {   /* (#R214) +「立った」モード */
          await window.IntMapLazy.need('nightSky'); const NS=window.IntMapNightSky; if(!NS||!NS.open) return R(false, warn(''));
          /* ⚠ (#R299) 「ここからの星空」 IS NOT 「ここを見ている星空」 — the sky, the measured skyline and the rise
             times belong to ONE standing point, and the reply quoted the centre back as though it were chosen. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          if(!ll) return R(false, warn(whereMiss(L('Where from? Give a place (or lng/lat).','どこからの空ですか（地名または経緯度）。','Von wo aus? Ort angeben.','Откуда? Укажите место.','¿Desde dónde? Indica un lugar.'), a.place||a.at||a.location)));
          await NS.open({lng:ll.lng, lat:ll.lat, when:(a.when||a.time||a.date||null), az:a.az, alt:a.alt, fov:a.fov, bearing:a.bearing, mode:(a.type==='standHere'||a.type==='skyStanding')?'stand':a.mode, view:a.view, stand:a.stand});   /* (#R214) the view is a parameter — js/night-sky.js resolves the spellings */
          if(a.rate!=null&&NS.setRate) NS.setRate(+a.rate); if(a.play&&NS.play) NS.play(true);   /* (#R208) */
          const st=NS.state(), facing=(st.mode==='stand'&&st.look)?(' · '+L('facing','向き','Blick','взгляд','mirando')+' '+Math.round(st.look.az)+'°'):''; return R(true, note((st.mode==='stand'?(icon('person-standing')+' '):(icon('sparkle')+' '))+L('Sky from','星空：','Himmel von','Небо от','Cielo desde')+' '+ll.lat.toFixed(3)+'°, '+ll.lng.toFixed(3)+facing+(st.last?' — '+st.last.starsDrawn.toLocaleString()+' '+L('stars above the measured skyline','個が実測した稜線の上に','Sterne über der Skyline','звёзд над горизонтом','estrellas sobre el horizonte'):''))); }
    },
  },
  {
    row: ['sim.space',                  'space',          'solarSystem,planet,planets,explore Space',                    'sim',     'sim',     'map.space',              'map',                 'session', 'none',   '',         ''],
    science: 'space',
    /* leaving the Earth needs nothing: the default is the solar system, live, at model scale */
    doc: [
      { in: 'sim.space', text: 'SPACE EXPLORER (planets as globes, and the solar system in time): {"type":"space"|"solarSystem"|"planet","body"?:"sun"|"mercury"|"venus"|"earth"|"moon"|"mars"|"jupiter"|"saturn"|"uranus"|"neptune"|"pluto","mode"?:"system"|"body","scale"?:"real"|"model","date"?:ISO,"rate"?:seconds-per-second} = leave the Earth. "mode":"body" (or naming a "body" with {"type":"planet"}) shows that world AS A GLOBE in the same form the app shows the Earth — the real surface imagery, lit by the real Sun direction for the instant on the clock, turning about its real IAU pole and prime meridian, with the IAU-approved place names from the USGS Gazetteer placed at their published coordinates. "mode":"system" shows the SOLAR SYSTEM: the Sun, the eight planets, Pluto and the Moon at their real positions for ANY instant from 3000 BC to 3000 AD (JPL approximate elements; the Moon from truncated ELP-2000/82), with orbits, a clock that can run forwards or backwards at any "rate", and two honest scales — "real" (1 unit = 1 AU and true radii, so a planet is a fraction of a pixel) and "model" (orbits compressed, bodies enlarged, so the whole system is legible). Default: live, model scale, the solar system. Satellites other than the Moon are NOT modeled — their phase cannot be computed faithfully from published elements alone, and the app says so rather than drawing an invented one. Reachable in the UI only from the button that appears when the map cannot zoom out any further. Use for "太陽系を見せて", "show me Mars", "火星の地名を見たい", "where were the planets on my birthday", "show the solar system in the year 2200", "冥王星まで行って".\n' },
      { in: 'night-sky', at: 20, text: '{"type":"space"} instead.\n' },
    ],
    schema: () => ({ type: 'object', properties: { body: str(), planet: str(), target: str(), mode: one('system', 'body'), scale: one('real', 'model'), date: str(), datetime: str(), when: str(), rate: num() } }),
      /* (#R197) the space explorer — the same surface the button at the zoom floor opens */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      {
          const S=window.IntMapSpace;
          if(!S||!S.open) return R(false, warn(L('The space explorer is not available in this build.','宇宙探索はこのビルドで利用できません。','Weltraum-Explorer nicht verfügbar.','Космический обозреватель недоступен.','El explorador espacial no está disponible.')));
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
          return R(true, note(icon('planet')+' '+L('Space explorer','宇宙探索','Weltraum-Explorer','Космос','Explorador espacial')+' — '
            +(mode==='body'?L('viewing '+nm+' as a globe, with its IAU place names.','を球体として表示（IAU地名付き）。','als Globus.','как шар.','como globo.')
                            :L('the solar system at the chosen instant, from published orbital elements.','指定時刻の太陽系を、公表軌道要素から計算して表示。','das Sonnensystem zum gewählten Zeitpunkt.','Солнечная система на выбранный момент.','el sistema solar en el instante elegido.')))); }
    },
  },
  {
    row: ['sim.tsunami',                'tsunami',        'tsunamiSim,tsunamiPropagation',                               'sim',     'sim',     'map.tsunami',            'map',                 'session', 'none',   'point',    'tsunami'],
    science: 'tsunami',
    /* (atlas-reasoning) WHAT A WHAT-IF OVER THIS MODEL STANDS ON AND DOES NOT REPRESENT — read by research.scenario (js/atlas-cap-research.js)
       through js/atlas-reasoning.js `scenarioModels`. `subject` is the argument the place goes in, `baselineParam` the one an instant goes in
       (null: the model takes no instant, and the scenario says so under «not considered»). The model's own argument vocabulary is not
       restated: it is this entry's `schema`. The sentences are the ones this model already prints (its note) and its method section states. */
    scenario: {
      subject: 'place', baselineParam: null,
      data: [
        T('Measured ocean bathymetry on a 0.25° global grid', '実測の海底地形（0.25° 全球格子）'),
        T('The epicentre, magnitude and focal depth stated in the scenario (Okada 1985 sea-surface displacement)', 'シナリオで述べた震源・規模・震源の深さ（Okada 1985 の海面変位）'),
      ],
      excluded: [
        T('Coastal inundation on land is not computed — the grid is 0.25°, far coarser than a harbour', '陸上の浸水は計算しない — 格子は 0.25° で港湾よりはるかに粗い'),
        T('The baseline instant is not an input: the model has no clock, so the time of day and tide are not represented', '基準時点は入力にならない — モデルに時計はなく、時刻や潮位は反映されない'),
        T('Whether an earthquake of that size happens, and its slip distribution, are not modelled beyond the stated magnitude', '述べた規模の地震が起きるか、およびすべり分布は規模以上には扱わない'),
      ],
      uncertainty: [
        T('Long-wave propagation over the measured seafloor; amplitude near a coast is not resolved at this grid', '実測の海底上の長波の伝播。この格子では沿岸の振幅は解像できない'),
        T('The result is one solve of one stated rupture; a different focal depth or magnitude changes it', '述べた 1 つの破壊を 1 回解いた結果で、震源の深さや規模が変われば変わる'),
      ],
    },
    doc: [
      { in: 'terrain-water', at: 20, text: '{"type":"tsunami"}.\n' },
      { in: 'sim.tsunami', text: 'TSUNAMI PROPAGATION (its own model — NOT a hazard of the disaster simulator): {"type":"tsunami","place"?:str,"lng"?:num,"lat"?:num,"magnitude"?:Mw,"depth"?:km,"scope"?:"global"|"near","hours"?:1-30,"amplitude"?:m,"maximum"?:bool,"contours"?:bool,"play"?:bool} = solve the tsunami a given earthquake would radiate and watch it cross the ocean. Shallow-water long waves (total-depth pressure, Manning bottom friction, Coriolis) on a spherical Arakawa C-grid over the WHOLE PLANET at 0.25° — longitude wraps, so the wave keeps going round rather than reflecting off the edge of a box, and a Chilean event really does arrive in Japan about twenty-two hours later. "scope":"near" solves the SAME physics on a latitude band around the epicentre at FOUR TIMES the resolution (about 9 km a cell instead of 28) — use it when the question is about the source region rather than about a trans-ocean arrival; it is capped at 3 hours, because past that the wave reaches the band edge. The sea floor is the same bundled 0.25° bathymetry in both scopes, so "near" refines the source, the numerics and the arrival field, NOT the coastline. The sea floor is the bundled global bathymetry (every cell has a measured depth; nothing falls back to a constant). The source is the Okada (1985) co-seismic sea-floor displacement over a tapered sub-fault grid, with the Tanioka & Satake (1996) horizontal-motion term added over sloping floor. It is solved in a background thread and the frames STREAM in, so the animation is watchable within a second or two. Reports travel-time contours, a maximum-crest field ("maximum":true), a Green\'s-law coastal height, and a click anywhere on the sea reads the arrival time and wave height there. Defaults: Mw 8.5, focal depth 20 km, 6 hours. Use for "チリでM9が起きたら日本にいつ津波が来る", "simulate the 2011 Tōhoku tsunami", "津波シミュレーター", "show me a tsunami from the Aleutians". Its cells are tens of kilometers and it does not claim run-up, so it cannot say which street floods.\n' },
    ],
    /* #R115: non-equivalent substitutions the planner has actually made, recorded so it cannot make them again */
    policy: { forbidden: ['sim.earthquake'] },
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
          if(!T||!T.open) return R(false, warn(L('The tsunami propagation simulator is not available in this build.','津波伝播シミュレーターはこのビルドで利用できません。','Tsunami-Simulator nicht verfügbar.','Симулятор цунами недоступен.','El simulador de tsunamis no está disponible.')));
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat,name:g.name}; } else if(typeof K._herePoint!=='undefined'&&K._herePoint) ll=K._herePoint; }catch(_){}
          if(!ll) return R(false, warn(whereMiss(L('Where? Give an epicenter (place, or lng/lat).','震源はどこですか（地名または経緯度）。','Wo? Epizentrum angeben.','Где эпицентр?','¿Dónde? Indica el epicentro.'), a.place||a.at||a.location)));
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
          return R(true, note(icon('waves')+' '+L('Tsunami propagation','津波伝播','Tsunami-Ausbreitung','Распространение цунами','Propagación del tsunami')+' — M'+mag.toFixed(1)+' '+(ll.name||(ll.lat.toFixed(2)+', '+ll.lng.toFixed(2)))+'. '
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
    science: 'pandemic',
    /* (atlas-reasoning) WHAT A WHAT-IF OVER THIS MODEL STANDS ON AND DOES NOT REPRESENT — read by research.scenario (js/atlas-cap-research.js)
       through js/atlas-reasoning.js `scenarioModels`. `subject` is the argument the place goes in, `baselineParam` the one an instant goes in
       (null: the model takes no instant, and the scenario says so under «not considered»). The model's own argument vocabulary is not
       restated: it is this entry's `schema`. The sentences are the ones this model already prints (its note) and its method section states. */
    scenario: {
      subject: 'place', baselineParam: null,
      data: [
        T('World Bank country populations and OurAirports / OpenFlights route structure for the spread between countries', '国別人口（世界銀行）と、国間の広がりの OurAirports・OpenFlights の路線構造'),
        T('The pathogen preset\'s published parameters (each parameter names its source)', '病原体プリセットの公表済みパラメータ（各パラメータが出典を名指す）'),
      ],
      excluded: [
        T('Within-country structure (cities, age groups) and behaviour change are not represented — one well-mixed set of compartments per country', '国内の構造（都市・年齢層）と行動変容は扱わない — 国ごとに 1 つの混合区画'),
        T('The baseline instant is not an input: the run starts at day 0 from the stated origin, not at a calendar date', '基準時点は入力にならない — 暦の日付ではなく、述べた起点の 0 日目から始まる'),
      ],
      uncertainty: [
        T('A stochastic SEIR run is ONE DRAW: an outbreak can die out by chance. `runs` answers with the median and the 10th–90th percentile band', '確率的 SEIR の 1 回は「1 つの標本」で、偶然に収束することがある。`runs` を使うと中央値と 10〜90 パーセンタイルの幅が返る'),
        T('Parameters are the preset\'s; changing them (`params`) moves the answer more than the seed does', 'パラメータはプリセットの値で、`params` を変えると乱数より大きく答えが動く'),
      ],
    },
    /* (#R754) ⚠ `params` IS DELIBERATELY UNENUMERATED, for the reason `data.gis` states above: the
       vocabulary is js/pandemic-model.js's PANDEMIC_PARAMS, which this file cannot read at planning
       time, and a copy of it here would be a second list to keep in step. The REFUSALS carry the
       vocabulary instead — an unknown key answers with every key, and an out-of-range number
       answers with that parameter's own bounds — so one wrong call becomes one corrected call.
       ⚠ `days` IS REQUIRED because «simulate a pandemic» with no horizon has no answer to report;
       the origin is the capability's `place` target and is checked by targetPolicy, which accepts
       place / country / origin / lng+lat. */
    doc: [
      { in: 'pandemic', at: 10, text: '{"type":"pandemicRun","days":int,"country"|"place"|"origin":str or "lng"+"lat":num,"preset"?:"covid"|"flu"|"sars"|"ebola"|"measles","scenario"?:"naive"|"real-world","seed"?:int,"runs"?:10|25|50,"params"?:{…}} — "runs" replays the same question with that many seeds (seed, seed+1, …) in ONE call and answers with the median, the 10th–90th percentile band and how often each ending happened (複数回実行して中央値と幅を出す) — use it whenever the reader asks how likely, how uncertain, best/worst case, or 「何回かやって」. A CITY is fine for "place" (it is resolved to the country that contains it, and the reply says which). It returns THE STATE at the day you asked for: world totals, and per country the cumulative infections, deaths, currently infectious, arrival day and border tier. IT DRAWS NOTHING — so if the reader said "show", "map", "draw", "見せ" or anything else that asks to SEE it, the run alone has not answered them and you MUST make the second call in the same turn. ONE RUN PER TURN: if a call is refused, CHANGE it (the refusal says how) — never repeat the same arguments, and never print two different runs of the same question as if both were the answer. TO PUT IT ON THE MAP: ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), origin: str(), lng: num(-180, 180), lat: num(-90, 90), preset: str(), scenario: str(), days: num(1), seed: num(), runs: num(2, 50), params: obj() }, required: ['days'] }),
      /* (#R52) features the user could not reach reliably through the fuzzy "control" path are now FIRST-CLASS
         actions (verified window fns / element ids), so "open the pandemic simulator", "switch news pins to the
         publisher", "log in", "donate", "send feedback", "report a bug" execute deterministically. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, ensureData = K.ensureData, loadCountryData = K.loadCountryData, countryStats = K.countryStats, HOST = K.HOST;
      { await window.IntMapLazy.need('pandemicSim'); const _P=window.IntMapPandemicAtlas; if(!_P) return R(false, warn(L('The pandemic engine could not be loaded.','パンデミックエンジンを読み込めませんでした。','Die Pandemie-Engine konnte nicht geladen werden.','Не удалось загрузить движок пандемии.','No se pudo cargar el motor de pandemia.'))); await ensureData(); _P.bind({loadCountryData, countryStats:()=>countryStats, lang:()=>HOST.lang}); const _pr=await _P.run(a); return _pr.ok ? R(true,_pr.html,{meta:{pandemic:_pr.meta}}) : R(false, warn(_pr.html), {meta:{code:(_pr.meta&&_pr.meta.code)||'failed'}}); }   /* ⚠⚠ (#R754) THE DOOR TO THE MODEL — the row above opens the SCREEN. Asked to simulate a pandemic from Lagos, Atlas made zero tool calls and said IntMap has no transmission simulator (#R747 §6); it has had one since #R575 and no way in. The engine, the world, the parameter vocabulary and the reply are js/pandemic-atlas.js, because the file this line sits in may not grow (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ). Computing declares NO map — see the second door below. */   /* ⚠⚠ (#R754) THESE TWO DOORS SHARE A ROW WITH THE ONE BELOW, and the sharing is the point: tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ budgets THIS FILE BY LINE, and raising a ceiling to fit one's own change is the move that check exists to catch (js/lazy-modules.js folds for the same reason, in the same words). They sit beside `playground` because that is the same feature: the row below opens the SCREEN, these two drive the MODEL. ⚠ THE ROW MUST STILL BEGIN WITH `case '` — scripts/atlas-catalog.mjs and scripts/atlas-capability-audit.mjs read dispatch labels off line STARTS, so a door folded into the middle of a block is a door they cannot see (measured: both went red). */
    },
  },
  {
    row: ['sim.ballistic',              'missile',        'ballistic,ballisticMissile,strike,icbm',                      'sim',     'sim',     'map.ballistic',          'map',                 'session', 'none',   'place',    ''],
    science: 'ballistic',
    doc: [
      { in: 'ballistic', at: 10, text: '{"type":"missile","from":str,"to":str,"missile"?:str,"loft"?:"minenergy"|"lofted"|"depressed","marv"?:bool,"yield"?:number_kt,"blast"?:bool,"seconds"?:8-55} = solves the Keplerian trajectory for the great-circle range at a SELECTABLE launch angle (loft: minimum-energy default, "lofted"=steep/high-apogee, "depressed"=flat/low), applies Allen–Eggers atmospheric DRAG for the impact velocity, curves the ground track by the Earth\'s rotation (Coriolis), optionally adds a MaRV terminal weave ("marv":true), and draws a WORLD-SCALE 3-D altitude-colored arc (correct under any zoom). Reports apogee, launch angle, burn-out / re-entry / drag-reduced impact velocity, Coriolis cross-range and flight time. "missile" may name a class ("Minuteman III","DF-41","Sarmat","Trident II"); pass "yield" (kt) or "blast":true for warhead-effect rings. The reply has buttons to re-fly it lofted/depressed/MaRV. Use for "モスクワからワシントンへ弾道ミサイル", "lofted ICBM from X to Y", "depressed trajectory strike on Z". ' },
    ],
    /* #R115: non-equivalent substitutions the planner has actually made, recorded so it cannot make them again */
    policy: { forbidden: ['sim.flyAnimate'] },
    chips: ['arc', 'map.fly', 'map.ballistic'],   /* (#R142) the blast ring too, so a strike's blast overlay gets a chip (#9). ⚠ map.fly stays its own kind: the trajectory is also the fly kind's surface, and a later fly call taking it over must still turn this chip OFF (#R122) */
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), place: str(), target: str(), missile: str(), weapon: str(), name: str(), loft: str(), trajectory: str(), traj: str(), mode: str(), marv: bool(), maneuver: bool(), maneuvering: bool(), coriolis: bool(), nuclear: bool(), warhead: str(), yield: num(0), blast: bool(), seconds: num(1) }, anyOf: [{ required: ['from', 'to'] }, { required: ['from', 'place'] }, { required: ['from', 'target'] }] }), /* `missile` */
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, _gcKm = K._gcKm, missileClass = K.missileClass, esc = K.esc, ballisticSolve = K.ballisticSolve, clearFly = K.clearFly, _ballTrack = K._ballTrack, GE = K.GE, clearBlast = K.clearBlast, drawBlastRings = K.drawBlastRings, ballisticProfileSVG = K.ballisticProfileSVG, note = K.note;
      {
          /* (#R83) proper ballistic-missile simulation (real Keplerian minimum-energy trajectory + Kepler-timed
             flight + to-scale altitude profile + honest physics numbers; optional warhead-effect rings). */
          const A=await geocode(a.from); const B=await geocode(a.to||a.place||a.target);
          if(!A||!B) return R(false, warn(L('Need a launch site and a target','発射地点と目標が必要です','Startort & Ziel nötig','Нужны точка пуска и цель','Se necesita origen y objetivo')));
          const km=_gcKm(A,B); const cls=missileClass(a.missile||a.weapon||a.name);
          let rangeWarn=''; if(cls&&cls.range&&km>cls.range*1.02) rangeWarn=warn(L(esc(cls.name)+' max range is ~'+cls.range.toLocaleString()+' km, but this shot is '+Math.round(km).toLocaleString()+' km — beyond its reach','「'+esc(cls.name)+'」の最大射程は約'+cls.range.toLocaleString()+' kmですが、この距離は'+Math.round(km).toLocaleString()+' kmで射程外です',esc(cls.name)+' Reichweite ~'+cls.range.toLocaleString()+' km, Schuss '+Math.round(km).toLocaleString()+' km — außer Reichweite',esc(cls.name)+' дальность ~'+cls.range.toLocaleString()+' км, а тут '+Math.round(km).toLocaleString()+' км — вне досягаемости',esc(cls.name)+' alcance ~'+cls.range.toLocaleString()+' km, pero son '+Math.round(km).toLocaleString()+' km — fuera de alcance'));
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
          let h='<div style="font-weight:600;margin:2px 0 3px;">'+icon('rocket')+' '+esc(A.name||a.from)+' → '+esc(B.name||a.to||a.place)+nm+' · '+esc(modeLbl)+(marv?(' · MaRV'):'')+'</div>';
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
          if(rings){ h+='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;line-height:1.6;">'+icon('burst')+' '+L('Warhead','弾頭','Sprengkopf','Боеголовка','Ojiva')+' '+Y.toLocaleString()+' kt — '+rings.map(rg=>esc(rg.l)+' ('+rg.r.toFixed(1)+' km)').join(' · ')+'</div>'; }
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
    science: 'aviation',
    doc: [
      { in: 'animated-flight', at: 10, text: '{"type":"fly","from":str,"to":str,"mode"?:"plane"|"cruise","seconds"?:6-90} = cinematic camera flight along the real great-circle from A to B with a drawn trajectory (plane/cruise stay level; use for "fly me from London to Tokyo"). It reports the real-world flight time honestly. User interaction cancels it. ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'map.fly',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), mode: str(), seconds: num(1), missile: str(), yield: num(0), blast: bool() }, required: ['from', 'to'] }), /* `fly` */
    async run(a, dctx, K) { const dispatch = K.dispatch, geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, flyAnimate = K.flyAnimate, note = K.note, esc = K.esc;
      { /* (#R72) animated camera flight ("モスクワからワシントンまで
          ICBMの視点と速度、運動で飛行して") — great-circle path, drawn trajectory, camera follows with a
          mode-specific altitude/pitch profile. */
          /* (#R83) ballistic modes now run the REAL missile simulator (the old icbm mode was just a parabolic
             camera zoom — "粗悪すぎる"); plane/cruise stay cinematic camera flights. */
          if(/^(icbm|missile|ballistic|rocket|弾道|ミサイル)$/i.test(String(a.mode||'')) ) return await dispatch({type:'missile',from:a.from,to:a.to,seconds:a.seconds,missile:a.missile,yield:a.yield,blast:a.blast});
          const A=await geocode(a.from); const B=await geocode(a.to);
          if(!A||!B) return R(false, warn(L('Need start & destination','出発地と目的地が必要です','Start & Ziel nötig','Нужны старт и цель','Se necesitan origen y destino')));
          const mode=({plane:'plane',aircraft:'plane',jet:'plane',cruise:'cruise',drone:'cruise',bird:'plane'})[String(a.mode||'').toLowerCase()]||'plane';
          const secs=Math.max(6,Math.min(90,+a.seconds||22));
          const r=await flyAnimate(A,B,mode,secs);
          return R(r.ok, r.ok?note(icon('rocket')+' '+esc(A.name||a.from)+' → '+esc(B.name||a.to)+' · '+Math.round(r.km).toLocaleString()+' km · '+r.real):warn(L('Flight could not start','飛行を開始できませんでした','Flug konnte nicht starten','Полёт не запустился','No se pudo iniciar el vuelo'))); }
    },
  },
];
