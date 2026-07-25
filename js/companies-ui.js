/* ============================================================================
 *  IntMap · Companies tab, compare view & dashboard  (#R168)
 * ----------------------------------------------------------------------------
 *  The Companies subject: the company list and detail card, the multi-company compare sheet
 *  (bar / table / CSV / time series) and the legacy dashboard renderer. Thirty-six statements,
 *  all of them declarations — the compare view carries its own state, cache and palette.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.companiesUi=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  /* =============================================================================
   * WEBGL PIN INFRASTRUCTURE — pins are rendered as native MapLibre circle layers
   * on the WebGL canvas. The map projection math runs on the GPU at the exact
   * lng/lat, so pins CANNOT drift relative to the map at any zoom or projection.
   * The hover tooltip is a single shared DOM element positioned by mouse pixel.
   * ============================================================================= */
  const INFO_COLORS={ choke:'#ff9500', mil:'#ff3b30', tech:'#007aff', space:'#af52de', energy:'#34c759', hub:'#5856d6', maritime:'#30b0c7' };

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {CO_SECTORS,CO_CC}=window.IntMapTables;

  /* (#R145) Companies compare view state — mirrors the Countries #scp-view (Bar / Time-series / Table, metric picker). */
  let _coCmpMode='bar', _coCmpMetOpen=false, _coCmpMet=new Set(['mcap','rev','ni','emp']), _coCmpTsFrom=null, _coCmpTsTo=null, _coCmpCss=0, _coCmpSort={key:null,dir:-1};

  let _coCmpTsMetric='mcap';

  const _CO_CMP_METS=['mcap','rev','ni','emp','pe','price'];

  const _coCmpMetLbl=k=>{ const m={mcap:HOST._coL('Market cap','時価総額','Marktkap.','Капитализация','Cap. bursátil'),rev:HOST._coL('Revenue','売上高','Umsatz','Выручка','Ingresos'),ni:HOST._coL('Net income','純利益','Nettogewinn','Чистая прибыль','Beneficio neto'),emp:HOST._coL('Employees','従業員数','Mitarbeiter','Сотрудники','Empleados'),pe:HOST._coL('P/E ratio','株価収益率 (P/E)','KGV','P/E','P/E'),price:HOST._coL('Share price','株価','Aktienkurs','Цена акции','Precio acción')}; return m[k]||k; };

  const _CO_CMP_PAL=['#0a84ff','#ff9f0a','#30d158','#ff375f','#bf5af2','#64d2ff','#ffd60a','#ac8e68'];

  function _coWireTime(){ if(HOST._coTimeWired||!(window.IntMapTime&&window.IntMapTime.on)) return; HOST._coTimeWired=true;
    const _apply=hy=>{ try{ IntMapCompanies.setYear(hy, ()=>{ if(document.getElementById('co-cmp-view')){ try{ HOST.showCoCompare([...HOST.coCompareSet]); }catch(_){} } else if(HOST.mode==='info'||document.body.classList.contains('ws-mode')){ try{ renderCompanies(); }catch(_){} } }); }catch(_){} };
    window.IntMapTime.on(e=>{ clearTimeout(HOST._coTimeDeb); HOST._coTimeDeb=setTimeout(()=>{
      const cur=new Date().getFullYear(); const y=(e&&e.year!=null)?e.year:null; _apply(((e&&e.isLive)||y==null||y>=cur)?null:y);
    }, 320); });
    /* (#R142) initial sync: if the map was ALREADY time-travelled before Companies was first opened, the subscription
       above would miss that past event — reflect the current clock now so the ranking opens on the historical year. */
    try{ const cur=new Date().getFullYear(); const y=window.IntMapTime.year(); if(!window.IntMapTime.isLive()&&y!=null&&y<cur) _apply(y); }catch(_){}
  }

  let _coCmpTsGen=0;

  function _coCmpEnsureCss(){ if(_coCmpCss) return; _coCmpCss=1; const st=document.createElement('style');
    st.textContent='#co-cmp-view{container-type:inline-size;}'
      +'#co-cmp-view .scp-stickhead{position:sticky;top:0;z-index:8;background:var(--panel-bg,var(--glass-fill));display:flex;flex-direction:column;gap:6px;margin:0 0 6px;padding:8px 0 6px;}'
      +'#co-cmp-view .scp-back{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;background:#fff;color:#111;padding:3px 12px 3px 9px;font-size:12px;font-weight:600;cursor:pointer;flex:0 0 auto;}'
      +'#co-cmp-view .scp-back:hover{background:#f2f2f4;}'
      +'#co-cmp-view .scp-cmptitle{font-weight:700;font-size:13px;line-height:1.15;}'
      +'#co-cmp-view .scp-cmpsub{font-weight:500;font-size:10.5px;color:var(--text-muted);}'
      +'#co-cmp-view .scp-ctrlrow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}'
      +'#co-cmp-view .scp-modes{display:inline-flex;border:1px solid rgba(128,128,128,0.3);border-radius:10px;overflow:hidden;align-self:center;}'
      +'#co-cmp-view .scp-modes button{border:none;background:transparent;color:var(--text-muted);font-size:13.5px;font-weight:600;padding:5px 9px;cursor:pointer;}'
      +'#co-cmp-view .scp-modes button + button{border-left:1px solid rgba(128,128,128,0.35);}'
      +'[data-theme="dark"] #co-cmp-view .scp-modes button + button{border-left-color:rgba(255,255,255,0.6);}'
      +'#co-cmp-view .scp-modes button.on{background:var(--primary-color);color:#fff;}'
      +'[data-theme="dark"] #co-cmp-view .scp-modes,[data-theme="dark"] #co-cmp-view .scp-mtog:not(.open){border-color:rgba(255,255,255,0.85);}'
      +'#co-cmp-view .scp-mtog{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);border-radius:10px;font-size:13.5px;font-weight:600;padding:5px 9px;cursor:pointer;align-self:center;white-space:nowrap;}'
      +'#co-cmp-view .scp-mtog .scp-mcount{font-weight:500;color:var(--text-muted);font-variant-numeric:tabular-nums;}'
      +'#co-cmp-view .scp-mtog.open{background:var(--primary-color);border-color:var(--primary-color);color:#fff;}'
      +'#co-cmp-view .scp-mtog.open .scp-mcount{color:rgba(255,255,255,0.85);}'
      +'#co-cmp-view .scp-metrics{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0;}'
      +'#co-cmp-view .scp-m{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid rgba(128,128,128,0.28);background:transparent;color:var(--text-muted);cursor:pointer;}'
      +'#co-cmp-view .scp-m.on{background:var(--primary-color);border-color:var(--primary-color);color:#fff;font-weight:600;}'
      +'[data-theme="dark"] #co-cmp-view .scp-m{border-color:rgba(255,255,255,0.85);}'
      +'#co-cmp-view .scp-add{height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.3);background:var(--card-bg);color:var(--text-main);font-size:12.5px;outline:none;width:100%;box-sizing:border-box;}'
      +'#co-cmp-view #co-cmp-list{display:none;position:absolute;left:0;right:0;top:38px;max-height:230px;overflow-y:auto;background:var(--popup-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:12px;box-shadow:var(--shadow);z-index:40;padding:4px;}'
      +'#co-cmp-view #co-cmp-list .scp-cr{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--text-main);}'
      +'#co-cmp-view #co-cmp-list .scp-cr:hover{background:var(--input-bg);}'
      +'#co-cmp-view .scp-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--input-bg);color:var(--text-main);border:1.5px solid transparent;}'   /* (#R152) match the canonical Countries .scp-chip (was missing the transparent border) */
      +'#co-cmp-view .scp-chip .scp-x{cursor:pointer;color:var(--text-muted);font-weight:700;padding:0 2px;} #co-cmp-view .scp-chip .scp-x:hover{color:#ff453a;}'
      +'#co-cmp-view .scp-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}'
      +'#co-cmp-view .scp-sec{margin:12px 0 4px;font-weight:700;font-size:13px;color:var(--text-main);}'
      +'#co-cmp-view .scp-bars{display:flex;flex-direction:column;gap:5px;margin:4px 0 10px;}'
      +'#co-cmp-view .scp-brow{display:flex;align-items:center;gap:8px;font-size:12px;}'
      +'#co-cmp-view .scp-bnm{flex:0 0 116px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-main);}'
      +'#co-cmp-view .scp-btrack{flex:1;height:14px;border-radius:7px;background:var(--input-bg);overflow:hidden;position:relative;}'
      +'#co-cmp-view .scp-bfill{position:absolute;top:0;bottom:0;border-radius:4px;}'
      +'#co-cmp-view .scp-zline{position:absolute;top:-1px;bottom:-1px;width:1.5px;background:var(--text-muted);opacity:0.6;z-index:1;}'
      +'#co-cmp-view .scp-bval{flex:0 0 104px;font-size:11.5px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;}'
      +'#co-cmp-view .scp-tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}'
      +'#co-cmp-view .scp-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin:4px 0 6px;}'
      +'#co-cmp-view .scp-tbl td,#co-cmp-view .scp-tbl th{padding:4px 7px;text-align:right;border-bottom:1px solid rgba(128,128,128,0.12);white-space:nowrap;}'
      +'#co-cmp-view .scp-tbl th{color:var(--text-muted);font-weight:600;}'
      +'#co-cmp-view .scp-tbl td:first-child,#co-cmp-view .scp-tbl th:first-child{text-align:left;}'
      +'#co-cmp-view .scp-ttools{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 8px;}'
      +'#co-cmp-view .scp-ttools button{height:28px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:11.5px;padding:0 10px;cursor:pointer;}'
      +'#co-cmp-view .scp-ttools button:hover{border-color:var(--primary-color);color:var(--primary-color);}'
      +'#co-cmp-view .scp-tsrange{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;padding:6px 8px;background:var(--input-bg);border:1px solid rgba(128,128,128,0.2);border-radius:9px;font-size:12px;}'
      +'#co-cmp-view .scp-tsrange select{background:var(--card-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.25);border-radius:7px;font-size:12px;padding:4px 6px;cursor:pointer;outline:none;}'
      +'#co-cmp-view .scp-tsrange .scp-tsl{color:var(--text-muted);font-weight:600;}'
      +'#co-cmp-view .co-ts-note{font-size:10.5px;color:var(--text-muted);margin:2px 0 8px;line-height:1.4;}'
      +'#co-cmp-view .co-ts-wrap svg{width:100%;height:150px;display:block;}'
      +'#co-cmp-view .scp-tsmsel{display:inline-flex;gap:4px;margin-left:auto;}'   /* (#R153) TS metric toggle pushed to the right of the year range */
      +'#co-cmp-view .scp-tsm{background:var(--card-bg);color:var(--text-muted);border:1px solid rgba(128,128,128,0.25);border-radius:7px;font-size:11.5px;font-weight:600;padding:4px 9px;cursor:pointer;}'
      +'#co-cmp-view .scp-tsm.on{background:var(--primary-color);color:#fff;border-color:var(--primary-color);}'
      +'#co-cmp-view .co-ts-chart{position:relative;}'
      +'#co-cmp-view .co-ts-ax{position:absolute;left:4px;font-size:9.5px;color:var(--text-muted);pointer-events:none;font-variant-numeric:tabular-nums;}'
      +'#co-cmp-view .co-ts-axhi{top:2px;} #co-cmp-view .co-ts-axlo{bottom:2px;}'
      +'#co-cmp-view .co-ts-cursor{position:absolute;top:0;bottom:0;width:1px;background:var(--text-muted);opacity:0.5;display:none;pointer-events:none;}'
      +'#co-cmp-view .co-ts-tip{position:absolute;top:2px;display:none;pointer-events:none;background:var(--card-bg);border:1px solid rgba(128,128,128,0.28);border-radius:8px;box-shadow:var(--shadow);padding:5px 8px;font-size:11px;z-index:5;min-width:120px;}'
      +'#co-cmp-view .co-ts-tth{font-weight:700;margin-bottom:2px;white-space:nowrap;}'
      +'#co-cmp-view .co-ts-ttr{display:flex;align-items:center;gap:5px;line-height:1.5;white-space:nowrap;} #co-cmp-view .co-ts-ttr b{margin-left:auto;font-variant-numeric:tabular-nums;}'
      +'#co-cmp-view .co-ts-ttd{width:8px;height:8px;border-radius:50%;flex:0 0 auto;} #co-cmp-view .co-ts-ttn{overflow:hidden;text-overflow:ellipsis;max-width:120px;}';
    document.head.appendChild(st); }

  function _coCmpRender(cos){ const root=document.getElementById('co-cmp-view'); if(!root) return;
    const hy=IntMapCompanies.histYear&&IntMapCompanies.histYear();
    const modes=[['bar',HOST._coL('Bar chart','棒グラフ','Balken','Столбцы','Barras')],['ts',HOST._coL('Time-series','時系列','Zeitreihe','Динамика','Series')],['table',HOST._coL('Table','表','Tabelle','Таблица','Tabla')]];
    let h='<div class="scp-stickhead"><div style="display:flex;align-items:center;gap:8px;">'
      +'<button class="scp-back" data-cmpback="1"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'+HOST._coL('Back','戻る','Zurück','Назад','Atrás')+'</button>'
      +'<div><div class="scp-cmptitle">'+HOST._coL('Compare companies','企業を比較','Unternehmen vergleichen','Сравнение компаний','Comparar empresas')+'</div><div class="scp-cmpsub">'+cos.length+'/10</div></div></div>';   /* (#R153) /8→/10: the cap is 10 (matches _coToggleCompare + the dock) */
    h+='<div class="scp-ctrlrow"><div class="scp-modes">'+modes.map(m=>'<button data-cmpmode="'+m[0]+'" class="'+(_coCmpMode===m[0]?'on':'')+'">'+m[1]+'</button>').join('')+'</div>';
    if(_coCmpMode!=='ts') h+='<button class="scp-mtog'+(_coCmpMetOpen?' open':'')+'" data-cmpmtog="1">'+HOST._coL('Metrics','指標','Kennzahlen','Показатели','Métricas')+' <span class="scp-mcount">'+_coCmpMet.size+'/'+_CO_CMP_METS.length+'</span></button>';   /* (#R153) the generic multi-metric picker only applies to Bar/Table — HIDE it in Time-series mode where it did nothing (rev/ni/emp/pe have no history); TS has its own metric toggle inside the chart */
    h+='</div>';
    if(_coCmpMetOpen&&_coCmpMode!=='ts') h+='<div class="scp-metrics">'+_CO_CMP_METS.map(k=>'<button class="scp-m'+(_coCmpMet.has(k)?' on':'')+'" data-cmpmet="'+k+'">'+IntMapSafe.html(_coCmpMetLbl(k))+'</button>').join('')+'</div>';
    h+='<div style="position:relative;margin:6px 0 2px;"><input class="scp-add" id="co-cmp-add" placeholder="'+HOST._coL('Add a company…','企業を追加…','Firma hinzufügen…','Добавить компанию…','Añadir empresa…')+'" autocomplete="off"><div id="co-cmp-list"></div></div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px;">'+cos.map((c,i)=>'<span class="scp-chip"><span class="scp-dot" style="background:'+_CO_CMP_PAL[i%_CO_CMP_PAL.length]+'"></span>'+IntMapSafe.html(HOST._coName(c))+' <span class="scp-x" data-cmpx="'+IntMapSafe.html(c.tk)+'">×</span></span>').join('')+'</div>';
    if(hy) h+='<div class="stats-timebanner co-banner" style="margin:4px 0 0;"><b>'+hy+(HOST.lang==='jp'?'年':'')+'</b> · '+HOST._coL('market cap at year-end · today\'s share counts · other figures latest reported','その年の年末時点の時価総額 · 株数は現在値 · 他の指標は最新報告値','Marktkap. zum Jahresende · heutige Aktienzahl · übrige Angaben aktuell','капитализация на конец года · число акций текущее · прочие показатели последние','cap. a fin de año · acciones actuales · demás cifras recientes')+'</div>';
    h+='</div><div id="co-cmp-body"></div>';
    root.innerHTML=h; _coCmpBody(cos); _coCmpWire(cos); }

  function _coCmpBody(cos){ const body=document.getElementById('co-cmp-body'); if(!body) return;
    const met=_CO_CMP_METS.filter(k=>_coCmpMet.has(k));
    if(_coCmpMode==='table'){ const tmet=met.length?met:_CO_CMP_METS; body.innerHTML=_coCmpTable(cos,tmet); const b=body.querySelector('[data-cmpcsv]'); if(b) b.onclick=()=>_coCmpCsv(cos,tmet); body.querySelectorAll('[data-cmpsort]').forEach(th=>th.onclick=()=>{ const k=th.getAttribute('data-cmpsort'); if(_coCmpSort.key===k) _coCmpSort.dir=-_coCmpSort.dir; else { _coCmpSort.key=k; _coCmpSort.dir=-1; } _coCmpBody(cos); }); }   /* (#R147) sortable columns */
    else if(_coCmpMode==='ts'){ _coCmpTs(cos,body); }
    else body.innerHTML=_coCmpBar(cos,met); }

  function _coCmpBar(cos,met){ if(!met.length) return '<div class="co-ts-note">'+HOST._coL('Pick at least one metric above.','上で指標を1つ以上選択してください。','Mindestens eine Kennzahl wählen.','Выберите хотя бы один показатель.','Elige al menos una métrica.')+'</div>';
    let h='';
    met.forEach(k=>{ const fin=cos.map(c=>_coVal(c,k)).filter(v=>isFinite(v)); if(!fin.length) return;
      const hi=Math.max(0,Math.max.apply(null,fin)), lo=Math.min(0,Math.min.apply(null,fin)); const span=(hi-lo)||1; const zero=(0-lo)/span*100;
      h+='<div class="scp-sec">'+IntMapSafe.html(_coCmpMetLbl(k))+'</div><div class="scp-bars">';
      cos.forEach((c,i)=>{ const v=_coVal(c,k); const col=_CO_CMP_PAL[i%_CO_CMP_PAL.length]; let fill='';
        if(isFinite(v)){ const pv=(v-lo)/span*100; const l=Math.min(zero,pv), w=Math.max(1,Math.abs(pv-zero)); fill='<span class="scp-bfill" style="left:'+l.toFixed(2)+'%;width:'+w.toFixed(2)+'%;background:'+col+'"></span>'; }
        const zl=(lo<0)?'<span class="scp-zline" style="left:'+zero.toFixed(2)+'%"></span>':'';
        h+='<div class="scp-brow"><span class="scp-bnm">'+IntMapSafe.html(HOST._coName(c))+'</span><span class="scp-btrack">'+zl+fill+'</span><span class="scp-bval">'+(isFinite(v)?(IntMapSafe.html(_coMetric(c,k))+_coAsOfChip(c,k)):'—')+'</span></div>'; });   /* (#R170) as-of stamp on every compared value */
      h+='</div>'; });
    return h||'<div class="co-ts-note">'+HOST._coL('No data for the selected metrics.','選択した指標のデータがありません。','Keine Daten.','Нет данных.','Sin datos.')+'</div>'; }

  function _coCmpTable(cos,met){ const ths=met.map(k=>{ const act=_coCmpSort.key===k, arr=act?(_coCmpSort.dir<0?' ▼':' ▲'):''; return '<th class="scp-th-sort'+(act?' on':'')+'" data-cmpsort="'+k+'" style="cursor:pointer;user-select:none;white-space:nowrap;">'+IntMapSafe.html(_coCmpMetLbl(k))+arr+'</th>'; }).join('');
    let h='<div class="scp-ttools"><button data-cmpcsv="1">'+HOST._coL('Export CSV','CSV書き出し','CSV-Export','Экспорт CSV','Exportar CSV')+'</button></div><div class="scp-tblwrap"><table class="scp-tbl"><thead><tr><th>'+HOST._coL('Company','企業','Firma','Компания','Empresa')+'</th>'+ths+'</tr></thead><tbody>';
    let rows=cos.slice(); const sk=_coCmpSort.key;   /* (#R147) sort rows by the active metric column, blanks last */
    if(sk&&met.indexOf(sk)>=0){ const d=_coCmpSort.dir; rows.sort((a,b)=>{ const va=_coVal(a,sk),vb=_coVal(b,sk),fa=isFinite(va),fb=isFinite(vb); if(!fa&&!fb) return 0; if(!fa) return 1; if(!fb) return -1; return (va-vb)*d; }); }
    rows.forEach(c=>{ h+='<tr><td>'+IntMapSafe.html(HOST._coName(c))+'</td>'+met.map(k=>'<td>'+IntMapSafe.html(_coMetric(c,k))+_coAsOfChip(c,k)+'</td>').join('')+'</tr>'; });   /* (#R170) as-of stamp per cell */
    return h+'</tbody></table></div>'; }

  function _coCmpCsv(cos,met){ const esc=s=>{ s=String(s==null?'':s); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const rows=[[HOST._coL('Company','企業','Firma','Компания','Empresa')].concat(met.map(k=>_coCmpMetLbl(k))).concat(met.map(k=>_coCmpMetLbl(k)+' — '+HOST._coL('as of','時点','Stand','на дату','a fecha')))];
    /* (#R170) the CSV gets an "as of" column beside every metric — the exported numbers must carry their dates too. */
    cos.forEach(c=>rows.push([HOST._coName(c)].concat(met.map(k=>{ const v=_coVal(c,k); return isFinite(v)?v:''; })).concat(met.map(k=>_coAsOf(c,k)))));
    const csv='﻿'+rows.map(r=>r.map(esc).join(',')).join('\r\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='companies-compare.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ try{ a.remove(); URL.revokeObjectURL(url); }catch(_){} },200); }

  async function _coCmpTs(cos,body){ const cur=new Date().getFullYear(); if(_coCmpTsTo==null) _coCmpTsTo=cur; if(_coCmpTsFrom==null) _coCmpTsFrom=cur-20;   /* (#R153) default the Time-series to a DEEPER 20-year window (was 10) so the available deep history is visible immediately ("もっと昔も見れる"); the picker still reaches Yahoo's keyless floor of 1962 for the oldest names */
    if(_coCmpTsFrom>_coCmpTsTo) _coCmpTsFrom=_coCmpTsTo; const from=_coCmpTsFrom, to=_coCmpTsTo, gen=++_coCmpTsGen;
    const metric=(_coCmpTsMetric==='price')?'price':'mcap';   /* (#R153) the TS metric picker now DRIVES the chart (was ignored) */
    const yrs=[]; for(let y=cur;y>=1962;y--) yrs.push(y); const opt=sel=>yrs.map(y=>'<option value="'+y+'"'+(y===sel?' selected':'')+'>'+y+'</option>').join('');   /* (#R152) 1990→1962: reach back as far as Yahoo has data ("もっと昔も見れる"); names without data that far show "no history" honestly */
    const mBtn=(k)=>'<button class="scp-tsm'+(metric===k?' on':'')+'" data-cmptsm="'+k+'" type="button">'+IntMapSafe.html(_coCmpMetLbl(k))+'</button>';   /* (#R153) TS metric toggle — only mcap/price have real history */
    body.innerHTML='<div class="scp-tsrange"><span class="scp-tsl">'+HOST._coL('Years','期間','Jahre','Годы','Años')+'</span><select data-cmptsfrom="1">'+opt(from)+'</select><span>–</span><select data-cmptsto="1">'+opt(to)+'</select><span class="scp-tsmsel">'+mBtn('mcap')+mBtn('price')+'</span></div>'
      +'<div class="co-ts-wrap" id="co-ts-wrap"><div class="co-ts-note">'+HOST._coL('Loading price history…','株価履歴を読み込み中…','Kursverlauf wird geladen…','Загрузка истории цен…','Cargando histórico…')+'</div></div>';
    const wf=body.querySelector('[data-cmptsfrom]'), wt=body.querySelector('[data-cmptsto]');
    if(wf) wf.onchange=()=>{ _coCmpTsFrom=+wf.value; _coCmpTs(cos,body); }; if(wt) wt.onchange=()=>{ _coCmpTsTo=+wt.value; _coCmpTs(cos,body); };
    body.querySelectorAll('[data-cmptsm]').forEach(b=>b.onclick=()=>{ _coCmpTsMetric=b.getAttribute('data-cmptsm'); _coCmpTs(cos,body); });
    const series=await Promise.all(cos.map(async c=>{ if(c.sh<=0) return {c,data:null}; try{ return {c,data:await IntMapCompanies.priceSeriesFine(c.tk,from,to)}; }catch(_){ return {c,data:null}; } }));   /* (#R152) MONTHLY series for a high-precision curve */
    if(gen!==_coCmpTsGen) return; const wrap=document.getElementById('co-ts-wrap'); if(!wrap) return;
    const W=600,H=150,padL=6,padR=6,padT=10,padB=6, innerW=W-padL-padR, innerH=H-padT-padB;
    const lines=[]; let vmin=Infinity,vmax=-Infinity;
    series.forEach(s=>{ const arr=s.data; if(!arr||arr.length<2) return;
      let pts;
      if(metric==='mcap'){ const sh=s.c.sh; if(!(sh>0)) return; pts=arr.filter(p=>p[1]>0).map(p=>({fy:p[0],v:p[1]*sh,ts:p[2]})); }   /* (#R153) ABSOLUTE market cap = today's share count × historical price (same approximation the time-machine already uses); (#R158) carry the point's real timestamp */
      else { const base=arr[0][1]; if(!(base>0)) return; pts=arr.filter(p=>p[1]>0).map(p=>({fy:p[0],v:p[1]/base*100,ts:p[2]})); }   /* share price indexed to 100 at the first point */
      if(pts.length<2) return;
      pts.forEach(p=>{ if(p.v<vmin)vmin=p.v; if(p.v>vmax)vmax=p.v; }); lines.push({c:s.c,col:_CO_CMP_PAL[cos.indexOf(s.c)%_CO_CMP_PAL.length],pts}); });
    if(!lines.length){ wrap.innerHTML='<div class="co-ts-note">'+HOST._coL('No price history for these companies (US-listed live names only).','これらの企業の株価履歴がありません（米国上場のライブ銘柄のみ）。','Kein Kursverlauf (nur live gelistete US-Namen).','Нет истории цен (только листингованные в США).','Sin histórico (solo cotizadas en EE. UU.).')+'</div>'; return; }
    const lo=(metric==='mcap')?0:vmin, hi=(metric==='mcap')?(vmax||1):vmax; const vspan=(hi-lo)||1;   /* (#R153) mcap on a real $ axis from 0; indexed price on [min,max] */
    const _sp=((to+1)>from)?((to+1)-from):1; const X=fy=>padL+((to>from)?(fy-from)/_sp:0.5)*innerW; const Y=v=>padT+(1-(v-lo)/vspan)*innerH;   /* (#R152) X by fractional year over [from, to+1) */
    let svg='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
    if(metric==='price'&&vmin<=100&&vmax>=100){ const y1=Y(100).toFixed(1); svg+='<line x1="'+padL+'" y1="'+y1+'" x2="'+(W-padR)+'" y2="'+y1+'" stroke="var(--text-muted)" stroke-opacity="0.3" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>'; }
    lines.forEach(ln=>{ svg+='<path d="'+ln.pts.map((p,j)=>(j?'L':'M')+X(p.fy).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ')+'" fill="none" stroke="'+ln.col+'" stroke-width="2" vector-effect="non-scaling-stroke"/>'; });
    svg+='</svg>';
    const axHi=(metric==='mcap')?('<span class="co-ts-ax co-ts-axhi">'+IntMapSafe.html(HOST.fmtMoney(hi))+'</span><span class="co-ts-ax co-ts-axlo">$0</span>'):'';   /* (#R153) real $ axis labels for the mcap view */
    const missing=cos.filter(c=>!lines.find(l=>l.c===c));
    let note=(metric==='mcap')
      ? HOST._coL('Market cap: today\'s share count × historical price · US-listed live names only','時価総額：現在の株数×当時の株価 · 米国上場のライブ銘柄のみ','Marktkap.: heutige Aktienzahl × historischer Kurs · nur live gelistete US-Namen','Капитализация: текущее число акций × историческая цена · только листингованные в США','Cap. bursátil: acciones actuales × precio histórico · solo cotizadas en EE. UU.')
      : HOST._coL('Share price indexed to 100 at '+from+' · US-listed live names only','株価を'+from+'年＝100に指数化 · 米国上場のライブ銘柄のみ','Aktienkurs indexiert auf 100 ('+from+') · nur live gelistete US-Namen','Цена акции: индекс 100 в '+from+' · только листингованные в США','Precio de acción base 100 en '+from+' · solo cotizadas en EE. UU.');
    if(missing.length) note+=' · '+HOST._coL('no history','履歴なし','kein Verlauf','нет истории','sin histórico')+': '+missing.map(c=>IntMapSafe.html(HOST._coName(c))).join(', ');
    wrap.innerHTML='<div class="co-ts-chart" style="position:relative;">'+svg+axHi+'<div class="co-ts-cursor"></div><div class="co-ts-tip"></div></div><div class="co-ts-note">'+note+'</div>';
    /* (#R153) crosshair tooltip (Countries-parity) — hover shows the year + each company's value at that year. */
    const chart=wrap.querySelector('.co-ts-chart'), cursor=wrap.querySelector('.co-ts-cursor'), tip=wrap.querySelector('.co-ts-tip');
    /* (#R158) hover date shows the MATCHED data point's REAL month/day (was Math.round(year) only — "月/日が出ない").
       The monthly series now carries each point's raw timestamp, so the tooltip reads the actual date localised. */
    const _tsLoc=HOST.lang==='jp'?'ja-JP':HOST.lang==='de'?'de-DE':HOST.lang==='ru'?'ru-RU':HOST.lang==='es'?'es-ES':'en-US';
    const _fmtTsD=(ts,fyFb)=>{ try{ if(ts!=null&&isFinite(+ts)) return new Date(+ts).toLocaleDateString(_tsLoc,{year:'numeric',month:'short',day:'numeric'}); }catch(_){} return String(Math.round(fyFb)); };
    if(chart&&cursor&&tip){ const onMove=(e)=>{ const rc=chart.getBoundingClientRect(); if(!rc.width) return; const fx=Math.min(1,Math.max(0,(e.clientX-rc.left)/rc.width)); const fyr=from+fx*_sp;
        cursor.style.left=(fx*100).toFixed(2)+'%'; cursor.style.display='block';
        const rows=lines.map(ln=>{ let best=ln.pts[0],bd=Infinity; ln.pts.forEach(p=>{ const d=Math.abs(p.fy-fyr); if(d<bd){bd=d;best=p;} }); return {c:ln.c,col:ln.col,p:best}; });
        let hdTs=null,hdBd=Infinity; rows.forEach(r=>{ if(r.p&&r.p.ts!=null){ const d=Math.abs(r.p.fy-fyr); if(d<hdBd){ hdBd=d; hdTs=r.p.ts; } } });   /* (#R158) date of the nearest actual point */
        tip.innerHTML='<div class="co-ts-tth">'+IntMapSafe.html(_fmtTsD(hdTs,Math.min(to,Math.max(from,fyr))))+'</div>'+rows.map(r=>'<div class="co-ts-ttr"><span class="co-ts-ttd" style="background:'+r.col+'"></span><span class="co-ts-ttn">'+IntMapSafe.html(HOST._coName(r.c))+'</span><b>'+(metric==='mcap'?IntMapSafe.html(HOST.fmtMoney(r.p.v)):(Math.round(r.p.v)+''))+'</b></div>').join('');
        tip.style.display='block'; tip.style.left=Math.min(Math.max(4,e.clientX-rc.left+12), Math.max(4,rc.width-150))+'px'; };
      chart.addEventListener('mousemove',onMove); chart.addEventListener('mouseleave',()=>{ cursor.style.display='none'; tip.style.display='none'; }); } }

  function _coCmpWire(cos){ const root=document.getElementById('co-cmp-view'); if(!root) return;
    const bk=root.querySelector('[data-cmpback]'); if(bk) bk.onclick=()=>{ root.remove(); try{ renderCompanies(); }catch(_){} };
    root.querySelectorAll('[data-cmpmode]').forEach(b=>b.onclick=()=>{ _coCmpMode=b.getAttribute('data-cmpmode'); _coCmpRender(cos); });
    const mt=root.querySelector('[data-cmpmtog]'); if(mt) mt.onclick=()=>{ _coCmpMetOpen=!_coCmpMetOpen; _coCmpRender(cos); };
    root.querySelectorAll('[data-cmpmet]').forEach(b=>b.onclick=()=>{ const k=b.getAttribute('data-cmpmet'); if(_coCmpMet.has(k)){ if(_coCmpMet.size>1) _coCmpMet.delete(k); } else _coCmpMet.add(k); _coCmpRender(cos); });
    root.querySelectorAll('[data-cmpx]').forEach(b=>b.onclick=()=>{ HOST.coCompareSet.delete(b.getAttribute('data-cmpx')); const left=[...HOST.coCompareSet]; if(left.length<2){ root.remove(); try{ renderCompanies(); }catch(_){} } else HOST.showCoCompare(left); });
    const inp=root.querySelector('#co-cmp-add'), list=root.querySelector('#co-cmp-list'); if(inp&&list){ const have=new Set(cos.map(c=>c.tk));
      const upd=()=>{ const q=inp.value.trim().toLowerCase(); if(!q){ list.style.display='none'; return; }
        const hits=IntMapCompanies.DATA.filter(c=>!have.has(c.tk)&&(((HOST._coName(c)||'').toLowerCase().includes(q))||c.tk.toLowerCase().includes(q)||(c.n||'').toLowerCase().includes(q))).slice(0,30);
        if(!hits.length){ list.style.display='none'; return; }
        list.innerHTML=hits.map(c=>'<div class="scp-cr" data-cmpadd="'+IntMapSafe.html(c.tk)+'">'+IntMapSafe.html(HOST._coName(c))+' <span style="color:var(--text-muted);font-size:11px;">'+IntMapSafe.html(c.tk)+'</span></div>').join(''); list.style.display='block';
        list.querySelectorAll('[data-cmpadd]').forEach(r=>r.onmousedown=e=>{ e.preventDefault(); const tk=r.getAttribute('data-cmpadd'); if(HOST.coCompareSet.size<10){ HOST.coCompareSet.add(tk); HOST.showCoCompare([...HOST.coCompareSet]); } }); };
      inp.oninput=upd; inp.onfocus=upd; inp.onblur=()=>setTimeout(()=>{ try{ list.style.display='none'; }catch(_){} },180); } }

  const _coSec=(k)=>{ const s=CO_SECTORS[k]; return s?HOST._coL(s[0],s[1],s[2],s[3],s[4]):k; };

  const _coCountry=(cc)=>{ const c=CO_CC[cc]; return c?(HOST.lang==='jp'?c[1]:c[0]):cc; };

  const _coFlag=(cc)=>{ const c=CO_CC[cc]; return c?c[2]:''; };

  const CO_IND=()=>[['mcap',HOST._coL('Market cap','時価総額','Marktkap.','Капитализация','Cap. bursátil')],['rev',HOST._coL('Revenue','売上高','Umsatz','Выручка','Ingresos')],['ni',HOST._coL('Net income','純利益','Nettogewinn','Чистая прибыль','Beneficio neto')],['pe',HOST._coL('P/E ratio','株価収益率 (P/E)','KGV','P/E','P/E')],['emp',HOST._coL('Employees','従業員数','Mitarbeiter','Сотрудники','Empleados')],['price',HOST._coL('Share price','株価','Aktienkurs','Цена акции','Precio acción')],['fnd',HOST._coL('Founded','設立年','Gegründet','Год основания','Fundada')],['name',HOST._coL('Name','名称','Name','Название','Nombre')]];

  function _coVal(c,key){ const _pr=IntMapCompanies.priceOf(c); switch(key){ case 'rev':return c.rev; case 'ni':return c.ni; case 'emp':return c.emp; case 'fnd':return c.fnd; case 'price':return _pr>0?_pr:NaN; case 'pe':{ const mc=IntMapCompanies.mcap(c); return (c.ni>0&&mc>0)?(mc/c.ni):NaN; } case 'name':return 0; default:return IntMapCompanies.mcap(c); } }

  function _coMetric(c,key){ const _pr=IntMapCompanies.priceOf(c); switch(key){ case 'rev':return HOST.fmtMoney(c.rev); case 'ni':return (c.ni<0?'-':'')+HOST.fmtMoney(Math.abs(c.ni)); case 'emp':return (c.emp?c.emp.toLocaleString():'—'); case 'fnd':return ''+c.fnd; case 'price':return _pr>0?('$'+_pr.toFixed(2)):'—'; case 'pe':{ const v=_coVal(c,'pe'); return (isFinite(v)&&v>0)?v.toFixed(1):'—'; } case 'mcap':{ const m=IntMapCompanies.mcap(c); return isFinite(m)?HOST.fmtMoney(m):'—'; } default:{ const m=IntMapCompanies.mcap(c); return isFinite(m)?HOST.fmtMoney(m):'—'; } } }

  /* ===== (#R170) AS-OF STAMPS — 「Companiesのすべての数値に、その情報の年や年月、日時を書くように」 =====
     Every number the Companies tab prints now says WHEN it is from. The stamp is derived, never guessed:

       market cap / share price   time-machine year → "year-end <YYYY>";
                                  live              → the quote's own date+time (or, if the feed gave no quote
                                                      time, the fetch time — said as "fetched", not as a quote);
                                  no live listing   → the curated snapshot's compile date.
       revenue / net income /     the curated fiscal-year basis (IntMapCompanies.CURATED_FY). Deliberately a
       employees                  BASIS, not a shared date: fiscal years end on different days per company.
       P/E                        a live cap over a curated FY profit — so it honestly shows BOTH dates.
       founded                    already a year; no stamp needed.

     _coAsOf returns the short chip text; _coAsOfTitle the full sentence for the tooltip. */
  function _2(n){ return (n<10?'0':'')+n; }
  function _coDT(ms,withTime){ try{ const d=new Date(ms); if(!isFinite(d.getTime())) return '';
      const s=d.getFullYear()+'-'+_2(d.getMonth()+1)+'-'+_2(d.getDate());
      return withTime?(s+' '+_2(d.getHours())+':'+_2(d.getMinutes())):s; }catch(_){ return ''; } }
  function _coYearEnd(y){ return HOST._coL('year-end '+y, y+'年末', 'Jahresende '+y, 'конец '+y, 'fin de '+y); }
  function _coAsOf(c,key){ try{
    const hy=(IntMapCompanies.histYear&&IntMapCompanies.histYear())||null;
    const FY=IntMapCompanies.CURATED_FY, SNAP=IntMapCompanies.CURATED_ASOF;
    switch(key){
      case 'rev': case 'ni': case 'emp': return FY;
      case 'fnd': return '';
      case 'price': case 'mcap': {
        if(hy!=null) return _coYearEnd(hy);
        const t=IntMapCompanies.priceAsOf(c);
        if(t) return _coDT(t,true);
        return (key==='mcap')?SNAP:'';   /* snapshot cap = compiled that day; a name with no live price has no price date */
      }
      case 'pe': {
        if(!isFinite(_coVal(c,'pe'))) return '';
        const t=(hy!=null)?_coYearEnd(hy):(IntMapCompanies.priceAsOf(c)?_coDT(IntMapCompanies.priceAsOf(c),true):SNAP);
        return t+' / '+FY;   /* cap date / profit fiscal year — the ratio mixes two vintages, so it shows both */
      }
      default: return '';
    } }catch(_){ return ''; } }
  function _coAsOfTitle(c,key){ try{
    const hy=(IntMapCompanies.histYear&&IntMapCompanies.histYear())||null;
    const FY=IntMapCompanies.CURATED_FY, SNAP=IntMapCompanies.CURATED_ASOF;
    const L=HOST._coL;
    if(key==='rev'||key==='ni'||key==='emp')
      return L('Latest reported annual figures, '+FY+' basis (each company\'s own fiscal-year end). Dataset compiled '+SNAP+'.',
               '直近の通期報告値（'+FY+'基準・会計年度末は企業ごとに異なります）。データ収録日 '+SNAP+'。',
               'Zuletzt berichtete Jahreszahlen, Basis '+FY+' (Geschäftsjahresende je Unternehmen verschieden). Datensatz vom '+SNAP+'.',
               'Последние годовые отчётные данные, база '+FY+' (конец финансового года у каждой компании свой). Набор данных от '+SNAP+'.',
               'Últimas cifras anuales reportadas, base '+FY+' (cada empresa cierra su ejercicio en su propia fecha). Datos compilados el '+SNAP+'.');
    if(key==='price'||key==='mcap'||key==='pe'){
      if(hy!=null) return L('Share price at the '+hy+' year-end close; share counts are current.',
                            hy+'年の年末終値ベース。株数は現在値です。','Kurs zum Jahresschluss '+hy+'; Aktienzahl aktuell.',
                            'Цена на закрытие '+hy+' года; число акций текущее.','Precio al cierre de '+hy+'; número de acciones actual.');
      const t=IntMapCompanies.priceAsOf(c);
      if(t) return IntMapCompanies.priceAsOfExact(c)
        ? L('Quote time '+_coDT(t,true)+' (your local time).','気配値時刻 '+_coDT(t,true)+'（端末のローカル時刻）。','Kurszeit '+_coDT(t,true)+' (Ortszeit).','Время котировки '+_coDT(t,true)+' (местное).','Hora de la cotización '+_coDT(t,true)+' (hora local).')
        : L('Fetched '+_coDT(t,true)+' (the feed gave no quote time).','取得時刻 '+_coDT(t,true)+'（配信元が気配値時刻を返さなかったため）。','Abgerufen '+_coDT(t,true)+' (keine Kurszeit geliefert).','Получено '+_coDT(t,true)+' (источник не указал время котировки).','Obtenido '+_coDT(t,true)+' (la fuente no dio hora).');
      return L('Reported market-cap snapshot, compiled '+SNAP+' (no live US listing for this name).',
               '報告ベースの時価総額スナップショット（収録日 '+SNAP+'）。この銘柄は米国市場でのライブ価格がありません。',
               'Berichteter Marktkapitalisierungs-Snapshot vom '+SNAP+' (keine Live-US-Notierung).',
               'Отчётный снимок капитализации от '+SNAP+' (нет живой котировки в США).',
               'Instantánea de capitalización reportada, compilada el '+SNAP+' (sin cotización en vivo en EE. UU.).');
    }
    return ''; }catch(_){ return ''; } }
  /* the stamp as a chip, ready to append after a value */
  function _coAsOfChip(c,key){ const s=_coAsOf(c,key); if(!s) return '';
    return '<span class="co-asof" title="'+IntMapSafe.html(_coAsOfTitle(c,key))+'">'+IntMapSafe.html(s)+'</span>'; }

  const _coLogoCache=new Map();

  function _coLogoInner(dom,nm,hue){
    const d=String(dom||''), r=_coLogoCache.get(d);
    if(r==='mono'){ const ch=(String(nm||'?').trim().slice(0,1)||'?').toUpperCase(); return '<span class="co-mono" style="background:hsl('+hue+',55%,45%)">'+IntMapSafe.html(ch)+'</span>'; }
    const step=r?'1':'0';   /* a cached url is already resolved → on any later error skip straight to the monogram */
    const src=r||('https://logo.clearbit.com/'+encodeURIComponent(d));
    return '<img class="co-logo" alt="" data-dom="'+IntMapSafe.html(d)+'" data-name="'+IntMapSafe.html(nm)+'" data-hue="'+hue+'" data-step="'+step+'" src="'+IntMapSafe.html(src)+'">';
  }

  function _coWireLogo(img){ if(!img) return;
    img.onload=function(){ try{ if(this.src && this.dataset.dom) _coLogoCache.set(this.dataset.dom,this.src); }catch(_){} };
    img.onerror=function(){ const s=+this.dataset.step||0, dom=this.dataset.dom||'';
      if(s===0){ this.dataset.step='1'; this.src='https://www.google.com/s2/favicons?domain='+encodeURIComponent(dom)+'&sz=64'; }
      else { this.onerror=null; try{ if(dom) _coLogoCache.set(dom,'mono'); }catch(_){} const mono=document.createElement('span'); mono.className='co-mono'; mono.textContent=(this.dataset.name||'?').trim().slice(0,1).toUpperCase(); try{ mono.style.background='hsl('+(this.dataset.hue||0)+',55%,45%)'; }catch(_){} this.replaceWith(mono); } };
  }

  let _coRrT=null;

  function _coRerenderSoon(){ if(_coRrT) return; _coRrT=setTimeout(()=>{ _coRrT=null; if(HOST.mode==='info'||document.body.classList.contains('ws-mode')){ try{ renderCompanies(); }catch(_){} } },350); }

  function renderCompanies(q){
    const feed=document.getElementById('info-dashboard'); if(!feed) return;
    if(document.getElementById('co-cmp-view')) return;   /* (#R142) the compare view owns the feed — don't clobber it */
    try{ _coWireTime(); }catch(_){}   /* (#R142) subscribe to the time machine once */
    try{ HOST.clearMarkers(); }catch(_){}
    if(q==null) q=HOST._companiesSearchVal();   /* (#R153) reads the ws-mode Companies filter box too (Countries parity) — was '' in ws-mode → un-filterable */
    let arr=IntMapCompanies.DATA.slice();
    if(q){ const ql=String(q).toLowerCase(); arr=arr.filter(c=>c.n.toLowerCase().includes(ql)||(c.nJp&&c.nJp.includes(q))||c.tk.toLowerCase().includes(ql)||_coSec(c.sec).toLowerCase().includes(ql)); }
    const actF=HOST.coFilters.filter(f=>f&&f.key&&isFinite(f.val));
    if(actF.length) arr=arr.filter(c=>actF.every(f=>{ const v=_coVal(c,f.key); if(!isFinite(v)) return false; return f.op==='lte'?(v<=f.val):(v>=f.val); }));
    const key=HOST.coSort, dir=HOST.coSortDir;
    arr.sort((a,b)=>{ if(key==='name'){ const av=HOST._coName(a),bv=HOST._coName(b); const cc=av.localeCompare(bv,HOST.lang==='jp'?'ja':undefined); return dir==='asc'?cc:-cc; }
      const av=_coVal(a,key), bv=_coVal(b,key); const aok=isFinite(av), bok=isFinite(bv); if(!aok&&!bok)return 0; if(!aok)return 1; if(!bok)return -1; return dir==='asc'?(av-bv):(bv-av); });
    /* (#R142) rank = the company's standing in the CURRENTLY-SORTED metric by VALUE (largest = 1), independent of
       sort DIRECTION — so toggling asc/desc actually moves "#1" and the number means something (the old code printed
       the row position i+1, which stayed 1,2,3… for every sort → "順序を変えても順位が変わらない"). Name/text sort
       falls back to the canonical market-cap rank so the badge stays meaningful. Rank is over the displayed set. */
    const _rankKey=(key==='name'||key==='fnd')?'mcap':key;
    const _rankOf=new Map(); arr.slice().filter(c=>isFinite(_coVal(c,_rankKey))).sort((a,b)=>_coVal(b,_rankKey)-_coVal(a,_rankKey)).forEach((c,ri)=>_rankOf.set(c.tk,ri+1));
    const IND=CO_IND();
    const _arrow=up=>'<svg class="ssd-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+(up?'<path d="M12 19.5V5M6.5 11l5.5-6 5.5 6"/>':'<path d="M12 4.5V19M6.5 13l5.5 6 5.5-6"/>')+'</svg>';
    const dirLbl=_arrow(dir==='asc')+'<span class="ssd-labels" data-dir="'+(dir==='asc'?'asc':'desc')+'"><span class="ssd-l ssd-l-asc">'+HOST.t('sortAsc')+'</span><span class="ssd-l ssd-l-desc">'+HOST.t('sortDesc')+'</span></span>';
    const _FIND=IND.filter(([k])=>k!=='name');
    const nAct=HOST.coFilters.filter(f=>f&&f.key&&isFinite(f.val)).length;
    const funnel='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>';
    const filterBtn=`<button type="button" class="stats-filter-btn${HOST.coFilterOpen?' on':''}${nAct?' has':''}" onclick="_coSfToggle()" title="${HOST._sfL('Filter by value','値でフィルター','Nach Wert filtern','Фильтр по значению','Filtrar por valor')}">${funnel}${nAct?`<span class="sf-badge">${nAct}</span>`:''}</button>`;   /* (#R152) Countries-parity: filter button now has the same tooltip Countries has */
    const sfPanel=(()=>{ if(!HOST.coFilterOpen) return ''; const opts=(sel)=>_FIND.map(([k,l])=>`<option value="${k}"${sel===k?' selected':''}>${l}</option>`).join('');
      const rows=HOST.coFilters.map((f,i)=>`<div class="sf-row"><select onchange="_coSfSetKey(${i},this.value)">${opts(f.key)}</select><select class="sf-op" onchange="_coSfSetOp(${i},this.value)"><option value="gte"${f.op!=='lte'?' selected':''}>≥</option><option value="lte"${f.op==='lte'?' selected':''}>≤</option></select><input type="text" class="sf-val" value="${(f.raw||'').replace(/"/g,'&quot;')}" placeholder="${HOST._sfL('value (5B, 100000…)','値（5B, 100000…）','Wert','значение','valor')}" onchange="_coSfSetVal(${i},this.value)"><button type="button" class="sf-x" onclick="_coSfRemove(${i})">✕</button></div>`).join('');
      return `<div class="stats-filter-panel">${rows||`<div class="sf-empty">${HOST._sfL('No conditions yet.','条件がありません。','Keine Bedingungen.','Нет условий.','Sin condiciones.')}</div>`}<div class="sf-actions"><button type="button" class="sf-add" onclick="_coSfAdd()">+ ${HOST._sfL('Add condition','条件を追加','Bedingung','Условие','Añadir')}</button>${HOST.coFilters.length?`<button type="button" class="sf-clear" onclick="_coSfClear()">${HOST._sfL('Clear','クリア','Löschen','Очистить','Limpiar')}</button>`:''}</div></div>`; })();
    let html=`<div class="stats-toolbar"><select class="stats-sort-sel" onchange="setCoSort(this.value)">${IND.map(([k,l])=>`<option value="${k}"${HOST.coSort===k?' selected':''}>${l}</option>`).join('')}</select><button type="button" class="stats-sort-dir" onclick="toggleCoSortDir()" title="${HOST.t('sortDir')}">${dirLbl}</button>${filterBtn}</div>${sfPanel}`;
    const _hy=(IntMapCompanies.histYear&&IntMapCompanies.histYear())||null;   /* (#R142) time-machine year (null = present) */
    /* (#R170) the banner now names the exact vintages the per-row chips use, instead of a vague
       "latest reported" — header and rows must tell the same story. */
    const _FY=IntMapCompanies.CURATED_FY, _SNAP=IntMapCompanies.CURATED_ASOF;
    html+=_hy?`<div class="stats-timebanner co-banner"><b>${_hy}${HOST.lang==='jp'?'年':''}</b> · ${HOST._coL('market cap at the '+_hy+' year-end close · current share counts · revenue / profit / employees on a '+_FY+' basis','時価総額は'+_hy+'年の年末終値ベース · 株数は現在値 · 売上・利益・従業員数は'+_FY+'基準','Marktkap. zum Jahresschluss '+_hy+' · heutige Aktienzahl · Umsatz/Gewinn/Mitarbeiter auf Basis '+_FY,'капитализация на закрытие '+_hy+' года · число акций текущее · выручка/прибыль/сотрудники — база '+_FY,'cap. al cierre de '+_hy+' · acciones actuales · ingresos/beneficio/empleados base '+_FY)}</div>`:`<div class="stats-timebanner co-banner">${HOST._coL('Market cap and share price live where available — each value is stamped with its quote time · revenue / profit / employees on a '+_FY+' basis · reported snapshots compiled '+_SNAP,'時価総額・株価は可能な限りライブ（各値に取得時刻を表示） · 売上・利益・従業員数は'+_FY+'基準 · 報告ベースのスナップショットは'+_SNAP+'収録','Marktkap. und Kurs live, wo verfügbar — jeder Wert mit Kurszeit · Umsatz/Gewinn/Mitarbeiter Basis '+_FY+' · berichtete Snapshots vom '+_SNAP,'Капитализация и цена — в реальном времени, где возможно (у каждого значения указано время) · выручка/прибыль/сотрудники — база '+_FY+' · отчётные снимки от '+_SNAP,'Cap. y precio en vivo cuando es posible — cada valor lleva su hora · ingresos/beneficio/empleados base '+_FY+' · instantáneas reportadas del '+_SNAP)}</div>`;
    if(!arr.length) html+=`<div class="empty-msg">${HOST.t('noMatch')}</div>`;
    arr.forEach((c,i)=>{ const nm=HOST._coName(c);
      const cn=_coCountry(c.cc), fl=_coFlag(c.cc);
      const sub=_coSec(c.sec)+(cn?(' / '+(fl?fl+' ':'')+cn):'');
      const hue=[...nm].reduce((a,ch)=>a+ch.charCodeAt(0),0)%360;
      const logo=_coLogoInner(c.dom,nm,hue);   /* (#R147) cached-logo builder — no flicker */
      html+=`<div class="stat-row co-row${HOST.coCompareSet.has(c.tk)?' compare-on':''}" data-tk="${IntMapSafe.html(c.tk)}" title="${IntMapSafe.html(nm)}">${(window.imShowRank!=='off')?`<span class="stat-rank">${_rankOf.get(c.tk)||'—'}</span>`:''}<span class="stat-flag co-logo-box">${logo}</span><div class="stat-main"><div class="stat-name">${IntMapSafe.html(nm)}</div><div class="stat-sub">${IntMapSafe.html(sub)}</div></div><div class="stat-val">${_coMetric(c,key)}${_coAsOfChip(c,key)}</div></div>`;
    });
    const st0=feed.scrollTop;
    feed.innerHTML=html;
    try{ feed.scrollTop=st0; }catch(_){}
    feed.querySelectorAll('.co-logo').forEach(_coWireLogo);   /* (#R147) shared cached-logo wiring */
    /* (#R142) single-click selects the row for comparison, double-click opens the detail overlay — mirrors Countries. */
    feed.querySelectorAll('.co-row').forEach(row=>{ let ct=null; row.onclick=()=>{ const tk=row.getAttribute('data-tk');
      if(ct){ clearTimeout(ct); ct=null; try{ showCompanyDetail(tk); }catch(_){} return; }
      ct=setTimeout(()=>{ ct=null; try{ window._coToggleCompare(tk); }catch(_){} },250); }; });
    feed.style.paddingBottom='92px';   /* (#R152) reserve room for the absolute-overlay compare dock, matching Countries (was 24px for the old in-feed sticky tray) */
    try{ HOST.renderCoCompareFixed(); }catch(_){}   /* (#R142) re-attach the compare selection tray after the rebuild */
    if(!(IntMapCompanies.histYear&&IntMapCompanies.histYear())){ try{ IntMapCompanies.loadPrices(_coRerenderSoon); }catch(_){} }   /* (#R142) live prices only in the present; historical prices come from setYear; (#R147) debounced re-render kills repaint churn */
  }

  /* Company detail overlay — every indicator for one company + a link to its site (all figures honestly sourced). */
  function showCompanyDetail(tk){ const c=IntMapCompanies.DATA.find(x=>x.tk===tk); if(!c) return;
    let ov=document.getElementById('co-detail-ov'); if(ov) ov.remove();
    ov=document.createElement('div'); ov.id='co-detail-ov'; ov.className='co-detail-ov';
    const nm=HOST._coName(c); const hue=[...nm].reduce((a,ch)=>a+ch.charCodeAt(0),0)%360;
    const mc=IntMapCompanies.mcap(c), live=IntMapCompanies.isLive(c);
    const peV=_coVal(c,'pe');
    /* (#R170) 3rd element = the metric key, so every numeric row can carry its own as-of stamp. */
    const _hp=IntMapCompanies.priceOf(c);
    const rows=[ [HOST._coL('Market cap','時価総額','Marktkap.','Капитализация','Cap. bursátil'), (isFinite(mc)?HOST.fmtMoney(mc):'—')+' · '+(live?HOST._coL('live','ライブ','live','в реальном времени','en vivo'):HOST._coL('reported','報告値','berichtet','отчёт','reportado')), 'mcap'],
      [HOST._coL('Share price','株価','Aktienkurs','Цена акции','Precio acción'), _hp>0?('$'+_hp.toFixed(2)):'—', 'price'],
      [HOST._coL('P/E ratio','株価収益率 (P/E)','KGV','P/E','P/E'), (isFinite(peV)&&peV>0)?peV.toFixed(1):'—', 'pe'],
      [HOST._coL('Revenue','売上高','Umsatz','Выручка','Ingresos'), HOST.fmtMoney(c.rev), 'rev'],
      [HOST._coL('Net income','純利益','Nettogewinn','Чистая прибыль','Beneficio neto'), (c.ni<0?'-':'')+HOST.fmtMoney(Math.abs(c.ni)), 'ni'],
      [HOST._coL('Employees','従業員数','Mitarbeiter','Сотрудники','Empleados'), c.emp?c.emp.toLocaleString():'—', 'emp'],
      [HOST._coL('Founded','設立年','Gegründet','Год основания','Fundada'), ''+c.fnd, 'fnd'],
      [HOST._coL('Sector','セクター','Sektor','Сектор','Sector'), _coSec(c.sec)],
      [HOST._coL('Headquarters','本社','Hauptsitz','Штаб-квартира','Sede'), (_coFlag(c.cc)?_coFlag(c.cc)+' ':'')+_coCountry(c.cc)] ];
    const site='https://'+c.dom;
    ov.innerHTML=`<div class="co-detail" role="dialog" aria-modal="true"><button class="co-detail-x" type="button" aria-label="Close">✕</button>`+
      `<div class="co-detail-head"><span class="co-logo-box co-logo-lg">${_coLogoInner(c.dom,nm,hue)}</span>`+
      `<div class="co-detail-title"><div class="co-detail-name">${IntMapSafe.html(nm)}</div><div class="co-detail-tk">${IntMapSafe.html(c.tk)}</div></div></div>`+
      `<div class="co-detail-btns"><button class="co-detail-btn${HOST.coCompareSet.has(c.tk)?' on':''}" data-cmp="1" type="button">${HOST.coCompareSet.has(c.tk)?HOST._coL('In comparison','比較中','Im Vergleich','В сравнении','En comparación'):HOST._coL('Compare','比較する','Vergleichen','Сравнить','Comparar')}${HOST.coCompareSet.size?` (${HOST.coCompareSet.size}/8)`:''}</button></div>`+
      `<div class="co-detail-rows">${rows.map(r=>`<div class="co-drow"><span>${IntMapSafe.html(r[0])}</span><b>${IntMapSafe.html(String(r[1]))}${r[2]?_coAsOfChip(c,r[2]):''}</b></div>`).join('')}</div>`+
      (c.sh>0?`<div class="co-detail-spark" id="co-detail-spark"><div class="co-spark-note">${HOST._coL('Loading share-price history…','株価履歴を読み込み中…','Kursverlauf wird geladen…','Загрузка истории цен…','Cargando histórico…')}</div></div>`:'')+
      `<a class="co-detail-link" href="${IntMapSafe.html(IntMapSafe.url(site)||'#')}" target="_blank" rel="noopener">${IntMapSafe.html(c.dom)} ↗</a></div>`;
    document.body.appendChild(ov);
    const close=()=>{ try{ ov.remove(); }catch(_){} };
    ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
    const xb=ov.querySelector('.co-detail-x'); if(xb) xb.onclick=close;
    /* (#R146) Compare from the detail (Countries parity): add this company; open the compare view once ≥2 are selected */
    const cmpB=ov.querySelector('[data-cmp]'); if(cmpB) cmpB.onclick=()=>{ const wasIn=HOST.coCompareSet.has(c.tk);
      try{ window._coToggleCompare(c.tk); }catch(_){} try{ HOST.renderCoCompareFixed(); }catch(_){}
      if(!wasIn && HOST.coCompareSet.size>=2){ close(); try{ window._coShowCompare(); }catch(_){} }
      else { close(); } };
    const img=ov.querySelector('.co-logo'); if(img) _coWireLogo(img);   /* (#R147) shared cached-logo wiring */
    /* (#R153) real share-price SPARKLINE in the detail (Countries-parity enrichment — the detail was a static rows-only
       stub). Uses the same monthly full-history data as the compare Time-series; snapshot-only names show an honest note. */
    if(c.sh>0){ (async()=>{ try{ const cur=new Date().getFullYear(), from=cur-15, to=cur;
        const data=await IntMapCompanies.priceSeriesFine(c.tk, from, to); const el=document.getElementById('co-detail-spark'); if(!el) return;
        const pts=(data||[]).filter(p=>p&&p[1]>0);
        if(pts.length<2){ el.innerHTML='<div class="co-spark-note">'+HOST._coL('No share-price history (snapshot figure only).','株価履歴なし（スナップショットのみ）。','Kein Kursverlauf (nur Momentaufnahme).','Нет истории цен (только снимок).','Sin histórico (solo instantánea).')+'</div>'; return; }
        const W=280,H=52,pad=3; let vmin=Infinity,vmax=-Infinity; const fmin=pts[0][0], fmax=pts[pts.length-1][0];
        pts.forEach(p=>{ if(p[1]<vmin)vmin=p[1]; if(p[1]>vmax)vmax=p[1]; });
        const span=(vmax-vmin)||1, fsp=(fmax-fmin)||1; const X=f=>pad+(f-fmin)/fsp*(W-2*pad), Y=v=>pad+(1-(v-vmin)/span)*(H-2*pad);
        const d=pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
        const first=pts[0][1], last=pts[pts.length-1][1], chg=first>0?(last-first)/first*100:0, up=chg>=0, col=up?'#30d158':'#ff453a';
        el.innerHTML='<div class="co-spark-head"><span>'+HOST._coL('Share price','株価','Aktienkurs','Цена акции','Precio acción')+' · '+Math.round(fmin)+'–'+Math.round(fmax)+'</span><span style="color:'+col+';font-weight:700;">'+(up?'+':'')+chg.toFixed(0)+'%</span></div>'
          +'<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" class="co-spark-svg"><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>'
          +'<div class="co-spark-note">$'+first.toFixed(2)+' → $'+last.toFixed(2)+' · '+HOST._coL('monthly close, split-adjusted (Yahoo)','月次終値・分割調整済（Yahoo）','Monatsschluss, splitbereinigt (Yahoo)','мес. закрытие, скорр. (Yahoo)','cierre mensual, ajustado (Yahoo)')+'</div>';
      }catch(_){ const el=document.getElementById('co-detail-spark'); if(el) el.innerHTML=''; } })(); }
  }

  /* Cache & lazy-fetch the lead image from a Wikipedia URL */
  const wikiImgCache={};

  async function fetchWikiImage(wikiUrl){
    if(!wikiUrl) return null;
    if(wikiImgCache[wikiUrl]!==undefined) return wikiImgCache[wikiUrl];
    try{
      const m=wikiUrl.match(/^https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/);
      if(!m) { wikiImgCache[wikiUrl]=null; return null; }
      const lang=m[1], title=m[2];
      const r=await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`);
      if(!r.ok){ wikiImgCache[wikiUrl]=null; return null; }
      const j=await r.json();
      const url=(j&&j.thumbnail&&j.thumbnail.source)||(j&&j.originalimage&&j.originalimage.source)||null;
      wikiImgCache[wikiUrl]=url; return url;
    }catch(e){ wikiImgCache[wikiUrl]=null; return null; }
  }

  function applyWikiImageBackground(info){
    if(info.img||!info.wiki) return;
    const wikiUrl=info.wiki[HOST.lang]||info.wiki.en;
    fetchWikiImage(wikiUrl).then(url=>{
      if(!url) return;
      const card=document.getElementById('card-'+info.id); if(!card) return;
      const img=card.querySelector('.wiki-card-img');
      if(img){ img.style.backgroundImage=`url('${url}')`; img.classList.remove('wc-noimg'); }   /* (#R23) real image loaded → restore the gradient */
    });
  }

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {_DASH_BADGE}=window.IntMapTables;

  function dashBadgeLabel(b){ if(!b||HOST.lang==='en') return b||''; const e=_DASH_BADGE[b]; return (e&&e[HOST.lang])||b; }

  function renderDashboard(){
    /* (#R139) The Information dashboard was RETIRED — the "info" tab is now COMPANIES. Every renderDashboard() call
       site (tab render, ws window, search input, Supabase/cache hooks) delegates here, so they all render Companies
       and can never clobber the Companies view. The original dashboard body below is retained (dead) to avoid
       touching the many references it holds; it is unreachable. */
    try{ return renderCompanies(); }catch(_){ }
    const dash=document.getElementById('info-dashboard'); HOST.clearMarkers(); const dict=HOST.i18n[HOST.lang];
    const q=(HOST.mode==='info')?HOST.searchVal():'';   /* live text filter (#27) */
    /* (#R20) World Events Archive — the Information tab is split into Places (the original cards)
       and Events (curated historical events, year-range + text searchable, plotted on the map). */
    if(window._dashView==='events' && typeof window._renderEventsArchive==='function'){ window._renderEventsArchive(dash,q); return; }
    const filtered=HOST.extendedDashDB.filter(i=>HOST.activeDashCategories.has(i.cat) && (!q ||
      ((i.title.en+' '+(i.title.jp||'')+' '+(i.body.en||'')+' '+(i.body.jp||'')+' '+(i.badge||'')).toLowerCase().includes(q))));
    /* Push features into WebGL source. Pins are mathematically placed by the GPU. */
    HOST.dashFeatures=filtered.map(info=>({type:'Feature',id:info.id,geometry:{type:'Point',coordinates:info.loc},properties:{
      fid:info.id, type:info.type, color:INFO_COLORS[info.type]||'#007aff',
      title:info.title[HOST.lang]||info.title.en, body:info.body[HOST.lang]||info.body.en, layerRef:info.layerRef||''
    }}));
    /* Ensure pin layers exist NOW. Without this, on first tab-switch the source may not yet
       have been created → pins appeared with a delay. */
    if(_imCanDraw()) HOST.setupIntelLayers();
    if(map&&map.getSource('dash-points')) map.getSource('dash-points').setData({type:'FeatureCollection',features:HOST.dashFeatures});
    /* Sidebar cards */
    let cards='<div class="dash-cards-container">';
    filtered.forEach(info=>{
      let specsHTML='';
      if(info.specs){
        const items=Object.entries(info.specs).map(([k,v])=>`<div class="spec-item"><span class="spec-label">${dict[k]||k}</span><span class="spec-value">${v[HOST.lang]||v.en||'—'}</span></div>`).join('');
        if(items) specsHTML=`<div class="wiki-card-specs">${items}</div>`;
      }
      /* (#R23) imageless cards must NOT emit background-image:url('') and must NOT paint the dark ::before
         gradient over the bare card — that overlay over the white card read as "うっすらグレーの四角いもの".
         The wc-noimg class drops the gradient; the real image (+ its gradient) returns once it lazy-loads. */
      const _cimg=info.img||'';
      cards+=`<div class="wiki-card" id="card-${info.id}" onclick="flyToLoc(${info.loc[0]},${info.loc[1]})" onmouseenter="triggerLayerHover('${info.layerRef||''}',true); highlightDashMarker('${info.id}',true)" onmouseleave="triggerLayerHover('${info.layerRef||''}',false); highlightDashMarker('${info.id}',false)">
        <div class="wiki-card-img${_cimg?'':' wc-noimg'}" data-type="${info.type||''}"${_cimg?` style="background-image:url('${_cimg}');"`:''}><span class="wiki-card-badge">${dashBadgeLabel(info.badge)}</span></div>
        <div class="wiki-card-content"><h4 class="wiki-card-title">${info.title[HOST.lang]||info.title.en}</h4><p class="wiki-card-body">${info.body[HOST.lang]||info.body.en}</p>${specsHTML}<div class="wiki-card-footer"><a href="${IntMapSafe.html(IntMapSafe.url(info.wiki[HOST.lang]||info.wiki.en)||'#')}" target="_blank" rel="noopener" class="wiki-link" onclick="event.stopPropagation()">${dict.readWiki}</a></div></div></div>`;
    });
    cards+='</div>';
    /* (#R20) top-level Places | Events switch, then the existing category nav */
    const seg=`<div class="dash-nav"><button class="dash-nav-btn active" onclick="_setDashView('places')">${({en:'📍 Places',jp:'📍 場所',de:'📍 Orte',ru:'📍 Места',es:'📍 Lugares'})[HOST.lang]||'📍 Places'}</button><button class="dash-nav-btn" onclick="_setDashView('events')">${({en:'🗓 Events',jp:'🗓 出来事',de:'🗓 Ereignisse',ru:'🗓 События',es:'🗓 Eventos'})[HOST.lang]||'🗓 Events'}</button></div>`;
    const nav=`<div class="dash-nav" id="dash-nav"><button class="dash-nav-btn ${HOST.activeDashCategories.has('mil')?'active':''}" onclick="toggleDashCat('mil')">${dict.dashCatMil}</button><button class="dash-nav-btn ${HOST.activeDashCategories.has('tech')?'active':''}" onclick="toggleDashCat('tech')">${dict.dashCatTech}</button><button class="dash-nav-btn ${HOST.activeDashCategories.has('maritime')?'active':''}" onclick="toggleDashCat('maritime')">${dict.dashCatMar}</button><button class="dash-nav-btn ${HOST.activeDashCategories.has('geo')?'active':''}" onclick="toggleDashCat('geo')">${dict.dashCatGeo}</button></div>`;
    dash.innerHTML=seg+nav+cards;
    /* Mouse wheel → horizontal scroll on the category nav */
    const dnav=document.getElementById('dash-nav');
    if(dnav){ dnav.addEventListener('wheel',(e)=>{ if(e.deltaY===0)return; e.preventDefault(); dnav.scrollLeft+=e.deltaY+e.deltaX; },{passive:false}); }
    /* Lazy-fetch Wikipedia thumbnails for cards without an explicit image */
    filtered.forEach(info=>{ if(!info.img) applyWikiImageBackground(info); });
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { renderCompanies, showCompanyDetail, renderDashboard, _coCmpEnsureCss, _coCmpRender };
};
