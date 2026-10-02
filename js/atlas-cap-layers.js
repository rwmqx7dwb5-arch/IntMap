/* ============================================================================
 *  IntMap · Atlas capabilities — the `layers.*` namespace   (js/atlas-cap-layers.js)
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
import { str, bool, num, loose } from './atlas-caps.js';
import { resolveObserver, satelliteFacts } from './atlas-result-facts.js';
import { isDisplay } from './layer-manifest.js';   /* (basic-display-not-layers) which rows are the map display, not layers */

export default [
  {
    row: ['layers.toggle',              'layer',          '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
    doc: [
      { in: 'layers', at: 10, text: '{"type":"layer","name":EXACT_NAME,"on":bool} — copy the layer name VERBATIM from the "Available layers" list at the very end (do NOT paraphrase — paraphrasing is what selected the WRONG layer before). If you truly cannot find an exact match you MAY use a single common keyword (temperature, rain, precipitation, clouds, snow, sea ice, wind, humidity, pressure, population, gdp, co2, co, earthquakes, aurora, night lights, volcanoes, nato, eu, railways, time zones, webcams, vegetation, soil moisture, land cover, elevation) — Atlas maps these to the correct layer. ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str(), on: bool() }, required: ['name'] }),
    async run(a, dctx, K) { const _visSnapshot = K._visSnapshot, toggleLayer = K.toggleLayer, doControl = K.doControl, R = K.R, warn = K.warn, L = K.L, esc = K.esc, _visDelta = K._visDelta, note = K.note, layerOpacityControl = K.layerOpacityControl;
      {
          /* (#R73) SELF-VERIFICATION ("レイヤーのオンオフが実情と対応していない" / vision §16): snapshot the
             style's visible layers (+ overlay canvas count) BEFORE the toggle, then verify the map actually
             changed. No change after a grace poll → re-fire the toggle once; still nothing → say so honestly
             instead of reporting success. */
          const preSnap=_visSnapshot();
          const r=toggleLayer(a.name,a.on!==false); if(!r.ok){ const c=doControl({target:a.name,on:a.on}); if(c.ok) return c; return R(false, warn('⚠ '+L('Layer not found','レイヤーが見つかりません','Ebene nicht gefunden','Слой не найден','Capa no encontrada')+': '+esc(a.name||''))); }
          let verifyNote='', unverified=false;
          if(!r.already){ let changed=false;
            for(let i2=0;i2<6&&!changed;i2++){ await new Promise(r2=>setTimeout(r2,700)); changed=_visDelta(preSnap,_visSnapshot()); }
            if(!changed&&r.want){ /* one honest retry: re-fire THIS checkbox's change handler (r.cb — never a re-resolved guess) */
              try{ if(r.cb&&r.cb.checked){ r.cb.checked=false; r.cb.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r2=>setTimeout(r2,250)); r.cb.checked=true; r.cb.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){}
              for(let i2=0;i2<4&&!changed;i2++){ await new Promise(r2=>setTimeout(r2,700)); changed=_visDelta(preSnap,_visSnapshot()); } }
            /* (#R142) a turn-ON that never changed the map is UNVERIFIED — flag it so runActions suppresses the planner's
               optimistic "…をオンにしました" say (#2); the honest ⚠ note below leads instead. */
            /* ⚠⚠⚠ (#R747) A LAYER ASKED TO GO OFF IS NOT EVIDENCE ABOUT PAINTING. `unverified` already
               asked only of a turn-ON; the WARNING did not, so 「✓ Waves★ — off」 shipped followed by
               「⚠ Could not confirm the layer actually painted … toggling it again may help」 (measured
               on production 2026-09-15). The 「— off」 line already states the outcome. */
            if(!changed&&r.want){ unverified=true; verifyNote=warn('⚠ '+L('Could not confirm the layer actually painted on the map (its data may still be loading or its source may be down) — check the map; toggling it again may help','地図上で実際に描画されたことを確認できませんでした（データ読込中またはソース障害の可能性）。地図をご確認ください。もう一度切り替えると直る場合があります','Konnte nicht bestätigen, dass die Ebene wirklich gezeichnet wurde','Не удалось подтвердить отрисовку слоя на карте','No se pudo confirmar que la capa se dibujó en el mapa')); }
            else if(r.want) verifyNote=note('☑ '+L('verified on the map','地図上での描画を確認','auf der Karte bestätigt','отрисовка подтверждена','verificado en el mapa')); }
          const onTxt=r.want?L('on','オン','an','вкл','activado'):L('off','オフ','aus','выкл','desactivado');
          /* (#R72/#R142) a WORKING inline toggle appears right in the reply — for BOTH on AND off (turning a layer off still
             leaves a re-toggle switch, #9) — reading THIS exact checkbox r.cb so the switch's default state is the real one
             (#17), never a fuzzy re-resolve. The opacity slider is only meaningful while the layer is on. */
          let ctl=''; try{ if(r.cb){ const cbRef=' data-cb="'+esc(r.cb.id||'')+'"';
            ctl='<div style="display:flex;flex-direction:column;gap:6px;margin:5px 0 2px;">'
            +'<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+esc(r.label)+'</span><button class="atl-ctl-toggle'+(r.cb.checked?' on':'')+'" data-layer="'+esc(r.label)+'"'+cbRef+' role="switch" aria-checked="'+(r.cb.checked?'true':'false')+'"><span class="atl-ctl-knob"></span></button></div>';
            if(r.want){ const sl=layerOpacityControl(r.cb);
              if(sl) ctl+='<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+L('Opacity','不透明度','Deckkraft','Непрозрачность','Opacidad')+'</span><input type="range" class="atl-ctl-op" data-layer="'+esc(r.label)+'"'+cbRef+' min="0" max="1" step="0.05" value="'+esc(sl.value)+'"></div>'; }
            ctl+='</div>'; } }catch(_){}
          return R(true, note('✓ '+esc(r.label)+' — '+onTxt+(r.already?(' ('+L('already','既に','bereits','уже','ya')+')'):''))+verifyNote+ctl, unverified?{meta:{unverified:true}}:undefined); }
    },
  },
  {
    row: ['layers.opacity',             'opacity',        '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
    /* the case needs the layer AND a value: name alone answers «no opacity control» */
    doc: [
      { in: 'layers', at: 20, text: '{"type":"opacity","name":EXACT_NAME,"value":0..1} (or {"delta":±0..1} for "more/less transparent"); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str(), value: num(0, 100), percent: num(0, 100), delta: num(-100, 100) }, anyOf: [{ required: ['name', 'value'] }, { required: ['name', 'percent'] }, { required: ['name', 'delta'] }] }),
    async run(a, dctx, K) { const resolveLayer = K.resolveLayer, R = K.R, warn = K.warn, L = K.L, esc = K.esc, layerOpacityControl = K.layerOpacityControl, note = K.note;
      { const r=resolveLayer(a.name); if(!r) return R(false, warn('⚠ '+L('Layer not found','レイヤーが見つかりません','Ebene nicht gefunden','Слой не найден','Capa no encontrada')+': '+esc(a.name||''))); const sl=layerOpacityControl(r.cb); let v=(a.value!=null?+a.value:(a.percent!=null?+a.percent:null)); if(v!=null&&v>1) v=v/100; if(v==null&&a.delta!=null&&sl){ let d=+a.delta; if(!isNaN(d)){ if(Math.abs(d)>1) d/=100; v=Math.max(0,Math.min(1,(parseFloat(sl.value)||0)+d)); } } if(sl&&v!=null&&!isNaN(v)){ if(!r.cb.checked){ r.cb.checked=true; r.cb.dispatchEvent(new Event('change',{bubbles:true})); } sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); sl.dispatchEvent(new Event('change',{bubbles:true})); return R(true, note('🎚 '+esc(r.label)+' '+Math.round(v*100)+'%')); } return R(false, warn('⚠ '+L('No opacity control: ','不透明度の調整なし: ','Keine Deckkraft: ','Нет управления непрозрачностью: ','Sin opacidad: ')+esc(r.label))); }
    },
  },
  {
    row: ['layers.countryInfo',         'countryInfo',    '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'layers', at: 50, text: '{"type":"countryInfo","on":bool}; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const cb=document.getElementById('cb-countries'); if(cb){ const want=a.on!==false; if(cb.checked!==want){ cb.checked=want; cb.dispatchEvent(new Event('change',{bubbles:true})); } return R(cb.checked===want, note('✓ '+L('Country info','国情報','Länderinfo','Инфо о странах','Info de países')+': '+(a.on===false?'off':'on'))+_featTogHtml('countryInfo')); } return R(false, warn('⚠')); }
    },
  },
  {
    row: ['layers.railAxis',            'railAxis',       'railwayAxis,gaugeAxis',                                       'data',    'paint',   'map.layer,map.layerOption',              'map,explanation',     'session', 'none',   '',         'railways'],
    doc: [
      { in: 'layers', at: 80, text: '{"type":"railAxis","axis":"gauge"|"electrification"|"speed"|"tracks"|"traffic"|"status"|"kind"} = choose WHICH PROPERTY the World railways layer colours by. Every value it draws is OpenStreetMap\'s own tag on that track, and each axis has an explicit "not stated" bucket — OSM answers these questions at very different rates by country, so a grey line means the tag is absent, never a default. Use for "鉄道を電化方式で塗り分けて", "colour the railways by line speed", "show me which lines are single track", "建設中の路線を見せて" (axis "status"). The layer must be on; turn it on with {"type":"layer","name":"World railways","on":true} first.\n' },
    ],
    schema: () => ({ type: 'object', properties: { axis: str(), name: str(), by: str() }, anyOf: [{ required: ['axis'] }, { required: ['name'] }, { required: ['by'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      { const RM=window.IntMapRailways; if(!RM||!RM.setAxis) return R(false,warn('⚠')); const want=String(a.axis||a.name||a.by||'').trim().toLowerCase(); const SYN={gauge:'gauge','track gauge':'gauge','軌間':'gauge',electrification:'electrification',electrified:'electrification',electric:'electrification',power:'electrification','電化':'electrification',speed:'speed',maxspeed:'speed','line speed':'speed','最高速度':'speed',tracks:'tracks','track count':'tracks','single track':'tracks','double track':'tracks','複線':'tracks',traffic:'traffic',passenger:'traffic',freight:'traffic','旅客':'traffic','貨物':'traffic',status:'status',construction:'status','運行状態':'status','建設中':'status',kind:'kind',type:'kind','line type':'kind','線種':'kind'}; const known=RM.axes().map(x=>x[0]); const ax=(known.indexOf(want)>=0)?want:(SYN[want]||''); if(!ax) return R(false,warn('⚠ '+L('no such railway view','その鉄道の塗り分けはありません','keine solche Bahn-Ansicht','нет такого вида для железных дорог','no existe esa vista ferroviaria'))); RM.setAxis(ax); const lbl=(RM.axes().find(x=>x[0]===ax)||[ax,ax])[1]; return R(true,note('🚆 '+lbl)); }   /* (#R388) one layer, one option, named in words — same shape as wxModel; the axis is resolved through the module's OWN list so this table cannot drift from the legend */
    },
  },
  {
    row: ['layers.allOff',              'layersOff',      'allLayersOff',                                                'layers',  'layer',   'map.layer',              'map',                 'session', 'explicit','',        ''],
    doc: [
      { in: 'layers', at: 30, text: '{"type":"layersOff"} turns EVERY active data layer off at once (use for "turn off all layers"); the map display (place names, labels, borders, roads, railways, day/night, 3-D buildings) is not a layer and stays as it is — "all":true clears it too; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { all: bool() } }), /* `layersOff`; all:true clears the map display too */
    async run(a, dctx, K) { const layerCatalog = K.layerCatalog, R = K.R, note = K.note, L = K.L;
      { const keepBase=a.all!==true; let n=0, nd=0;
          /* (basic-display-not-layers) «all layers» is the layers: the map display is not one (「基本表示をレイヤーって言うな」,
             2026-10-02), and which rows are display is the manifest's `kind` — this was four ids written out here */
          layerCatalog().forEach(c=>{ if(!c.cb.checked) return; if(keepBase&&isDisplay(c.cb.id||'')) return; const shown=isDisplay(c.cb.id||''); try{ c.cb.checked=false; c.cb.dispatchEvent(new Event('change',{bubbles:true})); if(shown) nd++; else n++; }catch(_){} });
          /* …and the reply counts them apart, for the same reason: a display item switched off is not a layer turned off */
          return R(true, note('✓ '+L(n+' layer(s) turned off','レイヤーを '+n+' 件オフにしました',n+' Ebene(n) ausgeschaltet','Слоёв выключено: '+n,n+' capa(s) desactivada(s)')
            +(nd?L(' · '+nd+' map display item(s) turned off',' · 基本表示を '+nd+' 件オフにしました'):''))); }
    },
  },
  /* (#R313) the animated streaks inside the Wind layer, on their own switch — the colour
     raster and the particles come from one forecast field and are toggled separately. */
  {
    row: ['layers.windParticles',       'windParticles',  'windAnimation',                                               'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 310, text: '{"type":"windParticles","on":bool} = the ANIMATED STREAKS inside the Wind layer, separately from the layer itself. Wind draws two things from one forecast field — a colour raster of speed and thousands of moving particles — and this switches only the particles, so the colours stay. On by default and remembered. Use for "風のパーティクルを消して" (on:false), "風のアニメーションを止めて" (on:false), "turn off the wind particles", "stop the wind animation", "パーティクルを戻して" (on:true). ⚠ This is NOT the same as switching the Wind LAYER off — for that emit {"type":"layer","name":"wind","on":false}. ⚠ ADD "over":"temperature" | "gusts" | "pressure" | "precipitation" TO DRAW THE SAME STREAKS OVER THAT LAYER instead — the wind moving across that field, with no wind colour raster and without switching the Wind layer on. EACH of the four is remembered SEPARATELY, and each needs ITS OWN layer ("ec-temp" / "ec-gust" / "ec-slp" / "ec-precip") to be on to show anything, so turn that layer on in the same answer when it is not. Gusts, sea-level pressure and forecast precipitation have the streaks ON by default (the weather system is what a reader is looking at in those fields); temperature is OFF by default. Use for "気温レイヤーの上に風のパーティクルを出して", "気温の上に風の動きを重ねて", "show the wind over the temperature map", "最大瞬間風速の上に風の動きを重ねて" (over:"gusts"), "気圧レイヤーにパーティクルを出して" (over:"pressure"), "降水量予報の上に風の動きを重ねて" (over:"precipitation"), and with on:false for "気温の上の風を消して"; ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str(), over: str(), layer: str(), on_layer: str() } }),
      /* (#R172) aircraft at their reported altitude, or flat on the map */
      /* ⚠ (#R313) the animated streaks inside the Wind layer, on their own switch — the reader put
         a box for it in the wind legend and AGENTS.md §3-3 says a feature reaches Atlas in the same
         change: dispatch here, the sentence in the SYS catalogue below, and the inline toggle in
         `_FEAT_TOG` so a reply can carry the switch. All three call window.Wind.setParticles — the
         legend box calls it too, so no two of them can hold different ideas of the state. */
    async run(a, dctx, K) { const R = K.R, note = K.note, _FEAT_TOG = K._FEAT_TOG, _featTogHtml = K._featTogHtml, warn = K.warn, L = K.L;
      { const want=!(a.on===false||/^(off|hide|none|static)$/i.test(String(a.mode||''))); let ok=false;
          /* ⚠ (#R337) 「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
             `over` names the layer the streaks are wanted OVER. The two switches are two questions
             (js/weather.js): 「does the Wind layer animate」 and 「is the wind drawn over the
             temperature field」, so this branch writes the one the reader named and never both. */
          const OVER=[['ec-temp',/temp|気温|気溫|temperatur|температ/,'tempWindParticles'],['ec-gust',/gust|突風|瞬間風速|böe|boe|порыв|racha/,'gustWindParticles'],['ec-slp',/press|気圧|luftdruck|druck|давлен|presi/,'slpWindParticles'],['ec-precip',/precip|降水|雨|niederschlag|regen|осадк|lluvia|precipit/,'precipWindParticles']];   /* ⚠ (#R455) A FOURTH LAYER CAN ASK — the forecast-precipitation raster. ⚠ IT IS LAST ON PURPOSE: `presi`/`precip` both begin with `pre`, and `ec-slp`'s row is tested first, so a bare 'precipitation' must not be caught by the pressure pattern — it is not, because `presi` does not match 'precip', but the ORDER is what keeps that true if either pattern is ever widened. */   /* ⚠ (#R439) THREE LAYERS CAN ASK NOW, each remembering its own answer, so `over` resolves to WHICH one rather than to a boolean. One door: window._imWxParts(layerId,v). ⚠ THE LABEL IS NOT REPEATED HERE — `_FEAT_TOG` already declares one per layer and the reply reads it from there, which is the same rule the legend follows. docs/MAP-LAYERS.md §7.10 */
          const over=String(a.over||a.layer||a.on_layer||'').toLowerCase(), hit=over?OVER.find(o=>o[1].test(over)):null;
          if(hit){ try{ if(window._imWxParts){ window._imWxParts(hit[0],want); ok=true; } }catch(_){} return R(ok, ok?note('✓ '+_FEAT_TOG[hit[2]].lbl()+': '+(want?'on':'off'))+_featTogHtml(hit[2]):warn('⚠')); }
          try{ if(window.Wind&&window.Wind.setParticles){ window.Wind.setParticles(want); ok=true; } }catch(_){}
          return R(ok, ok?note('✓ '+L('Wind particles','風のパーティクル','Wind-Partikel','Частицы ветра','Partículas de viento')+': '+(want?'on':'off'))+_featTogHtml('windParticles'):warn('⚠')); }
    },
  },
  /* (#R439) the 4 hPa contours over the sea-level-pressure field — a switch inside that layer's
     legend, so it is its own verb rather than a layer name (js/weather.js `sub`). */
  {
    row: ['layers.isobars',             'isobars',        'pressureContours,isolines',                                   'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    /* (#R439) 等圧線 — the contours over the sea-level-pressure field */
    doc: [
      { in: 'tools-panels', at: 320, text: '{"type":"isobars","on":bool} = ISOBARS: 4 hPa contours of sea-level pressure, labelled in hPa, drawn over the sea-level-pressure field. They are a SWITCH INSIDE that layer rather than a layer of their own, so ask for them with this and never with {"type":"layer","name":"Isobars"}; switching them on switches the sea-level-pressure layer on too when it is off, and the reply says so. Use for "等圧線を出して", "show the isobars", "気圧の等圧線を重ねて", "draw pressure contours", and with on:false for "等圧線を消して"; ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, _FEAT_TOG = K._FEAT_TOG, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|hide|none)$/i.test(String(a.mode||''))); let ok=false,lit=false; if(want){ try{ const cb=document.getElementById('dl-ec-slp'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); lit=true; } }catch(_){} } try{ if(window._imWxIsobars){ window._imWxIsobars(want); ok=true; } }catch(_){} return R(ok, ok?note('✓ '+_FEAT_TOG.isobars.lbl()+': '+(want?'on':'off')+(lit?(' · '+L('sea-level pressure switched on','海面気圧をオンにしました','Luftdruck eingeschaltet','слой давления включён','presión al nivel del mar activada')):''))+_featTogHtml('isobars'):warn('⚠')); }   /* ⚠ (#R439) THE ISOBARS ARE A SWITCH, SO ATLAS GETS A SWITCH — a control inside the sea-level-pressure legend rather than a row, so a layer name resolves to nothing. It switches that layer on too, because contours of a field that is not on the map are nothing at all, and the reply says both halves. docs/MAP-LAYERS.md §7.10 */
    },
  },
  /* The base-display preset the layer panel offers as a radio — Default / Clean / Custom
     (js/data-layers.js IntMapBaseDisplay). It was a control the reader had and Atlas did not:
     「基本表示をデフォルトに戻して」 sent Atlas through nine find_capability calls and out of
     steps with nothing done (measured on production, 2026-09-15). */
  {
    row: ['layers.baseDisplay',         'baseDisplay',    'baseMode,basemapMode,basicDisplay,basePreset,defaultDisplay,cleanDisplay,displayPreset', 'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'persist', 'none',   '',         ''],
    doc: [
      { in: 'layers.baseDisplay', text: 'BASE DISPLAY PRESET: {"type":"baseDisplay","mode":"default"|"clean"|"custom"} = the radio at the top of the layer panel that sets the base-map rows (place names, water & terrain labels, places & facilities, country borders, coastlines, state borders, roads, railways, grid, day/night, 3-D buildings) as a set: "default" restores the standard rows, "clean" turns every base row off (an unlabeled globe for an overlay to sit on), and the panel shows "custom" whenever the rows differ from either — a preset is what the reader means by 「基本表示をデフォルトに戻して」 / "reset the base map" / "clean map". Omit "mode" to REPORT the current preset and which base rows are on. Individual rows are still set_layer (a single row name); this is the whole set at once.\n' },
    ],
    schema: () => ({ type: 'object', properties: { mode: { type: 'string', enum: ['default', 'clean', 'custom'] } } }), /* no mode = REPORT the current preset and the rows it holds */
    async run(a, dctx, K) { const doBaseDisplay = K.doBaseDisplay;
      return doBaseDisplay(a);   /* the Default / Clean / Custom preset — js/atlas-controls.js, through js/data-layers.js IntMapBaseDisplay */
    },
  },
  {
    row: ['layers.nightSide',           'nightSide',      '',                                                            'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 300, text: '{"type":"nightSide","on":bool} = the DAY/NIGHT SIDE of the planet: as the camera pulls back towards the whole-Earth view, the hemisphere the Sun is not on darkens through a real twilight band and NASA’s VIIRS “Black Marble” city lights appear on it. On by default, and invisible once a continent fills the view. Use for “夜側を消して” / “turn off the night shading” (on:false), “夜間光を見せて” / “show the city lights at night”, “地球の夜側を戻して” (on:true); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
      /* (#R196) the day/night side of the planet, and the city lights on it */
    async run(a, dctx, K) { const L = K.L, R = K.R, note = K.note, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let ok=false, st=null;
          try{ if(window.IntMapNightSide){ window.IntMapNightSide.setEnabled(want); st=window.IntMapNightSide.state(); ok=true; } }catch(_){}
          try{ window._imSyncNightSideRow&&window._imSyncNightSideRow(); }catch(_){}   /* (#R232) the Layers row + the Settings picker follow */
          const detail=(want&&st)?(' — '+(st.built?L('drawn','描画中','gezeichnet','нарисовано','dibujado'):L('appears as you zoom out','ズームアウトすると現れます','erscheint beim Herauszoomen','появится при отдалении','aparece al alejar'))
            +(st.lights?(' · '+L('city lights loaded','夜間光を読み込み済み','Nachtlichter geladen','ночные огни загружены','luces nocturnas cargadas')):'')):'';
          return R(ok, ok?note('✓ '+L('Night side of the Earth','地球の夜側','Nachtseite der Erde','Ночная сторона Земли','Lado nocturno de la Tierra')+': '+(want?'on':'off')+detail)+_featTogHtml('nightSide'):warn('⚠')); }
    },
  },
  {
    row: ['layers.planeAltitude',       'planeAltitude',  'aircraftAltitude',                                            'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 330, text: '{"type":"planeAltitude","on":bool} = draw the LIVE AIRCRAFT layer at each aircraft\'s REAL reported altitude in 3-D space (a jet at 11 km really floats 11 km above the ground, with a hairline down to the point it is over) instead of flat on the map surface; on by default (use for "航空機を実際の高度で描画して", "飛行機を高度どおりに立体表示", "show aircraft at their real altitude", "put the planes back flat" (on:false)); ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const L = K.L, R = K.R, note = K.note, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|flat|2d)$/i.test(String(a.mode||''))); let ok=false;
          try{ if(window.IntMapPlanes3D){ window.IntMapPlanes3D.set(want); ok=true; } }catch(_){}
          const st=(()=>{ try{ const s=window.IntMapPlanes3D.state(); return s.lifted?(' — '+s.lifted+' '+L('airborne, up to','機が飛行中・最高','in der Luft, bis','в воздухе, до','en vuelo, hasta')+' '+s.maxAlt.toLocaleString()+' m'):''; }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Aircraft at real altitude','航空機を実際の高度で描画','Flugzeuge in echter Höhe','Самолёты на реальной высоте','Aviones a su altitud real')+': '+(want?'on':'off')+(want?st:''))+_featTogHtml('planeAltitude'):warn('⚠')); }
    },
  },
  {
    row: ['layers.aircraftTrack',       'aircraftTrack',  'planeTrack',                                                  'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 340, text: '{"type":"aircraftTrack","aircraft":str (callsign, registration or ICAO24 hex; omit for the aircraft already selected),"on"?:bool} = draw the OBSERVED TRACK of one live aircraft — the same thing clicking it on the map does. The track is what this browser has actually received from the ADS-B feed since the Live aircraft layer was switched on (one fix every 20 s), drawn at the reported ALTITUDE of each leg while the 3-D representation is on; there is no historical feed behind it, so an aircraft that has just appeared has only a fix or two. Use for "ANA123の軌跡を出して", "show the track of BAW256", "この機体の飛行経路", and on:false for "軌跡を消して" / "hide the track".\n' },
    ],
    schema: () => ({ type: 'object', properties: { aircraft: str(), callsign: str(), flight: str(), reg: str(), icao24: str(), on: bool(), mode: str() } }), /* no aircraft = the one already selected */
      /* (#R173) the track of ONE aircraft — the same thing a click on it draws. "clear" (or on:false)
         puts it away. The track is what this browser has observed since the layer came on; there is no
         history feed behind it, so the reply says how many fixes and how long it covers. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L, esc = K.esc;
      {
          const P=window.IntMapPlanes3D; if(!P) return R(false,warn('⚠'));
          const off=(a.on===false)||/^(off|clear|hide|none)$/i.test(String(a.mode||a.aircraft||''));
          if(off){ try{ P.select(null); }catch(_){} return R(true,note('✓ '+L('Aircraft track cleared','航空機の軌跡を消去','Flugspur entfernt','Трек убран','Traza borrada'))); }
          const q=String(a.aircraft||a.callsign||a.flight||a.reg||a.icao24||'').trim();
          const key=q?((await P.find(q))||null):(P.selected()||null);
          if(!key) return R(false,warn('⚠ '+L('No aircraft matching','該当する航空機がありません','Kein Flugzeug gefunden','Самолёт не найден','Ningún avión coincide')+(q?' “'+esc(q)+'”':'')));
          let ok=false; try{ await P.select(key); ok=true; }catch(_){}   /* (#R506) awaited — find/select are worker round trips now, and trackStats below would read an empty track if it ran first */
          const s2=(()=>{ try{ const t=P.trackStats(key); return ' — '+t.fixes+' '+L('fixes','点','Punkte','точек','puntos')+' · '+t.minutes+' '+L('min','分','min','мин','min')+(t.maxAlt?(' · '+L('up to','最高','bis','до','hasta')+' '+t.maxAlt.toLocaleString()+' m'):''); }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Track of','軌跡','Spur von','Трек','Traza de')+' '+esc(q||key)+s2):warn('⚠')); }
    },
  },
  {
    row: ['layers.satellites',          'satellites',     'satellite,sats,orbit',                                        'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'layers.satellites', text: 'LIVE SATELLITES: {"type":"satellites","on"?:bool,"group"?:"visual"|"stations"|"weather"|"geo"|"gps-ops"|"galileo"|"science"|"starlink"|"active","name"?:str (a satellite NAME, NORAD catalog number or international designator)} = the LIVE SATELLITE layer: real orbital element sets from CelesTrak, propagated in the browser with SGP4/SDP4, drawn at each object\'s SUB-SATELLITE POINT (the spot on the ground it is directly above) — the altitude is reported as a NUMBER and never faked as a height, because geostationary is 5.6 Earth radii up and there is no honest way to draw that to scale on a map. "group" chooses WHICH catalog is propagated; when no group is passed the layer keeps its default, which is the FULL active catalogue (every active object drawn at once — the layer\'s baseline when the reader wants the sky, and thousands of dots around the one object when they asked about a single satellite). Choose the group that fits the question. Passing "name" singles one object out: it draws that satellite\'s FOOTPRINT (the region from which it is above the horizon) and its GROUND TRACK for one orbit either side of now, opens a detail card, and the RESULT states the sub-satellite point (latitude, longitude it is above right now), altitude, speed, orbital period, sunlight/shadow, the elevation angle and the NEXT PASSES (up to three within 48 h, each with rise time, maximum elevation and duration — or that it does not rise within the horizon) as seen from "place" when one is given, else from the reader\'s pinned point, else the map centre. These are computed here from the live element set: ANSWER "where is X now / when does it pass over Y" FROM THIS RESULT — do not research it, and do not call again with another "mode" hoping for a pass table: there is no track/pass mode, ONE call with name (+place) returns everything this layer knows. Use for "人工衛星を表示して", "show live satellites", "ISSは今どこ？" (name:"ISS"), "when does the ISS next pass over Tokyo" (name:"ISS", place:"Tokyo"), "where is Hubble" (name:"HST"), "GPS衛星を見せて" (group:"gps-ops"), "静止衛星" (group:"geo"), "今この空を通る衛星" , and on:false for "衛星を消して".\n' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str(), group: str(), catalogue: str(), kind: str(), name: str(), satellite: str(), object: str(), norad: loose(), place: str() } }),
      /* (#R184) LIVE SATELLITES — the same three verbs the aircraft layer answers, applied to orbit:
         turn the layer on, choose which CelesTrak catalogue it propagates, and single out one object
         (which draws its footprint + ground track and opens the detail card). Every number in the
         reply is read back out of the layer's own state, so a reply can never claim a satellite the
         map is not showing. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L, esc = K.esc, GE = K.GE, geocode = K.geocode;
      {
          await window.IntMapLazy.need('satellitesLive'); const A=window.IntMapSatellites; if(!A) return R(false,warn('⚠'));   /* (#R311) on-demand, and the OFF branch reads A too */
          const offS=(a.on===false)||/^(off|hide|stop|clear|none)$/i.test(String(a.mode||''));
          if(offS){ try{ const cb=document.getElementById('dl-sats'); if(cb&&cb.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } else A.stop(); }catch(_){}
            return R(true,note('✓ '+L('Live satellites off','人工衛星レイヤーを非表示にしました','Live-Satelliten aus','Спутники выключены','Satélites en vivo desactivados'))); }
          /* the group first, so a request that names both ("show me the GPS satellites") loads the right
             catalogue before the layer starts propagating the wrong one */
          const gWant=String(a.group||a.catalogue||a.kind||'').toLowerCase().trim();
          let gSet=null;
          if(gWant){ const GM={'visual':'visual','bright':'visual','brightest':'visual','naked eye':'visual','肉眼':'visual',
              'stations':'stations','space stations':'stations','iss':'stations','宇宙ステーション':'stations',
              'weather':'weather','気象':'weather','geo':'geo','geostationary':'geo','静止':'geo',
              'gps':'gps-ops','gps-ops':'gps-ops','navstar':'gps-ops','galileo':'galileo',
              'science':'science','科学':'science','starlink':'starlink','active':'active','all':'active','すべて':'active'};
            const gid=GM[gWant]||(A.groups().some(g=>g.id===gWant)?gWant:null);
            if(gid){ try{ gSet=A.setGroup(gid); }catch(_){} } }
          let okS=false;
          try{ const cb=document.getElementById('dl-sats');
            if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); okS=true; }
            else { A.start(); okS=true; } }catch(_){}
          const q=String(a.name||a.satellite||a.object||a.norad||'').trim();
          let found=null;
          if(q){
            /* the catalogue may have only just been asked for — wait for it rather than answering
               "not found" about a list that is still in flight */
            for(let k=0;k<24&&!found;k++){ found=A.find(q); if(found) break; await new Promise(r=>setTimeout(r,250)); }
            /* ⚠⚠⚠ (#R747) ONE OBJECT NAMED IS NOT A REQUEST FOR THE WHOLE SKY. `name` chose a focus and
               only `group` chose what is propagated, so 「put a SINGLE marker on the ISS」 drew 16,010
               dots while the reply said it had drawn one (measured on production 2026-09-15). Which
               catalogue holds a named object is a fact about the catalogues: js/satellites-live.js
               `narrow`. ⚠ Not a hidden filter — #R266 removed that; the catalogue is named in the reply. */
            if(!gWant&&found===null){ try{ found=await A.narrow(q); }catch(_){} }
            if(!found) for(let k=0;k<8&&!found;k++){ found=A.find(q); if(found) break; await new Promise(r=>setTimeout(r,250)); }
            if(!found) return R(okS, warn('⚠ '+L('No satellite matching','該当する衛星がありません','Kein Satellit gefunden','Спутник не найден','Ningún satélite coincide')+' “'+esc(q)+'”'
              +' — '+L('the loaded catalog is','読み込み中のカタログは','geladener Katalog:','загруженный каталог:','el catálogo cargado es')+' '+esc(A.group())));
            try{ A.select(found.id); }catch(_){}
            try{ window.IntMapSatPanel&&window.IntMapSatPanel.open(found.id); }catch(_){}
            try{ GE().camera.easeTo({center:[found.lng,found.lat],duration:900}); }catch(_){} const {obsPt,obsLabel}=await resolveObserver(a,{geocode,herePoint:(typeof K._herePoint!=='undefined')?K._herePoint:null,L}); const det=satelliteFacts(A,found,obsPt,obsLabel,L);   /* the place the reader named, else their pin, else the map centre; the sub-satellite point and NEXT PASS ride on the result (js/atlas-result-facts.js) */
            /* ⚠ (#R747) WHAT IS ON THE MAP, SAID IN THE RESULT — the reply claimed 「a single marker」
               for a map holding thousands, and how many are drawn is not Atlas's to guess. */
            let _satCat=''; try{ const _st=A.state(); _satCat=' · '+esc(A.groups().filter(g=>g.id===A.group()).map(g=>g.name)[0]||A.group())+(_st&&_st.catalogue?(' · '+_st.catalogue.toLocaleString()+' '+L('objects','機','Objekte','объектов','objetos')):''); }catch(_){}
            return R(true,note('✓ '+esc(found.name||('#'+found.id))+esc(det))+note(_satCat.replace(/^ · /,'')));
          }
          const st=A.state();
          return R(okS, okS?note('✓ '+L('Live satellites on','人工衛星レイヤーを表示しました','Live-Satelliten an','Спутники включены','Satélites en vivo activados')
              +' — '+esc(A.groups().filter(g=>g.id===(gSet||A.group())).map(g=>g.name)[0]||A.group())
              +(st.catalogue?(' · '+st.catalogue.toLocaleString()+' '+L('objects','機','Objekte','объектов','objetos')):'')):warn('⚠')); }
    },
  },
];
