/* ============================================================================
 *  IntMap · Atlas kernel (the NL console / OS command surface) — IntMapModules.atlasConsole  (#R165)
 * ----------------------------------------------------------------------------
 *  window.IntMapConsole — Atlas natural-language console: intent dispatch, the ~90 action
 *  catalogue, AI research/vision turns, highlight/measure/radius execution, reply rendering.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R165): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, currentUser -> HOST.user, currentMode -> HOST.mode,
 *      countryGeo/globalData/radiusItems/newsDate/toolMode/userPins -> HOST.<same name>
 *  and — NEW in #R165 — the five closure variables the console WRITES go through host
 *  setters (READ-WRITE members, the only ones in IM_HOST):
 *      measurePoints, radiusColor, radiusKm, unitMode, userTheme  ->  HOST.<name> = v
 *  The variable in index.html stays the single source of truth; `HOST.x=v` assigns it there.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
/* (#R199) The six subsystems that left this file, plus (#R285) the persona. Real ES imports — not window.IntMapModules, not load
   order: the bundler resolves each binding by name, so a missing or renamed export is a BUILD error rather than a silent undefined at runtime. See DEV-NOTES #R199. */
import { makeAtlasReply } from './atlas-reply.js';
import { personaPrompt } from './atlas-persona.js';   /* (#R285) WHO Atlas is — the ONE copy. Every system prompt below opens with personaPrompt('<its task role>') and adds ONLY its task rules. */
import { attachLightbox, atlFileKind, atlFmtBytes, atlReadText } from './atlas-attach.js';   /* (#R232) attachments + the full-screen viewer */
import { makeMsgTools } from './atlas-msg-tools.js';   /* (#R298) the per-message tool bar + the in-place editor */
import { atlasPanelCSS } from './atlas-styles.js';   /* (#R313) the panel's stylesheet — moved out so this file stays under a ceiling that is never raised */
import { makeAtlasGeoResolve } from './atlas-geo-resolve.js';
import { makeAtlasControls } from './atlas-controls.js';
import { makeAtlasSources } from './atlas-sources.js';
import { makeAtlasSims } from './atlas-sims.js';
import { makeAtlasVerify } from './atlas-verify.js';
import { makeAtlasCapabilities } from './atlas-capabilities.js';   /* (#R318) normally js/app-body.js has already built the registry at boot; this is the fallback for a boot that did not get that far, so Atlas is never the thing that has no capabilities */
import { installAtlasKernel } from './atlas-executor.js';   /* (#R318) the executor, the result shape and the state ledger — fetched WITH Atlas rather than at boot; installAtlasKernel is idempotent so a UI button may have mounted it first */
import { makeAtlasPlanner } from './atlas-planner.js';   /* (#R318) the plan — schema, validation, GoalSpec, dependency execution (holds #R135's block) */
import { makeAtlasCatalogText } from './atlas-catalog-text.js';   /* (#R318) the 58 kB action catalogue that used to be inline in SYS() */
import { makeAtlasAnswerPipeline } from './atlas-answer-pipeline.js';   /* (#R350) the analysis answer as a contract: evidence registry -> one call -> audit -> at most one repair -> degrade */
import { makeAtlasAnswerRender } from './atlas-answer-render.js';   /* (#R350) every link on screen is built from the registry, never from the model's prose */
import { makeAtlasEvidence } from './atlas-evidence.js';
import { makeAtlasAnswerContract } from './atlas-answer-contract.js';
import { makeAtlasAnswerAudit } from './atlas-answer-audit.js';
import { makeAtlasExamples } from './atlas-examples.js';   /* (#R309) the starter chips — see the ceiling note there */
import { makeNewsCluster } from './news-cluster.js';   /* (#R340) research.events — the ONE deterministic article→event grouper, with the measurements behind every constant */

window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.atlasConsole=function(HOST){
  /* (#R318) THE KERNEL, published by js/app-body.js before Atlas is ever fetched. Named here so the
     capability registry, the observed-result shape, the executor and the state ledger are reached by
     ONE name each rather than by `window.` at forty call sites. They exist without Atlas — that is the
     point of §3: a capability is discoverable before its module loads. */
  const CAPS=window.IntMapCapabilities||makeAtlasCapabilities(HOST);
  const _KERNEL=(function(){ try{ return installAtlasKernel(window.IntMapOS, HOST, { capabilities:CAPS, GE:()=>window.IntMapGeoEngine, record:window.IntMapOS.emit }); }catch(e){ try{ console.warn('atlas kernel not installed',e); }catch(_){} return null; } })();
  const RESULTS=_KERNEL&&_KERNEL.results, EXEC=_KERNEL&&_KERNEL.exec, ASTATE=_KERNEL&&_KERNEL.state;
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const _aiLangName=HOST._aiLangName, addEdgeResize=HOST.addEdgeResize, addPin=HOST.addPin, aiGate=HOST.aiGate, aiLimitMsg=HOST.aiLimitMsg, aiLoginMsg=HOST.aiLoginMsg, aiParseJSON=HOST.aiParseJSON, aiToast=HOST.aiToast, aiToday=HOST.aiToday, aiUsage=HOST.aiUsage, aiUsesLeft=HOST.aiUsesLeft, applyAccent=HOST.applyAccent, applyTheme=HOST.applyTheme, askAI=HOST.askAI, askAIJSON=HOST.askAIJSON, askAIJSONEnvelope=HOST.askAIJSONEnvelope, bringToFront=HOST.bringToFront, cName=HOST.cName, clearAllPins=HOST.clearAllPins, compressImage=HOST.compressImage, countryStats=HOST.countryStats, diskFillPolys=HOST.diskFillPolys, exitTool=HOST.exitTool, fetchData=HOST.fetchData, fmtPc=HOST.fmtPc, loadCountryData=HOST.loadCountryData, localFuzzyPlaces=HOST.localFuzzyPlaces, makeDraggable=HOST.makeDraggable, parseDate=HOST.parseDate, refreshTool=HOST.refreshTool, saveSettings=HOST.saveSettings, setGrid=HOST.setGrid, setLang=HOST.setLang, setMode=HOST.setMode, setTool=HOST.setTool, showCountryDetail=HOST.showCountryDetail, t=HOST.t, updateToolPanel=HOST.updateToolPanel, ymdISO=HOST.ymdISO;
  return (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, run(){}, toggle(){} };
    /* (#R64) Atlas MIRRORS the language of the user's message ("別の言語で話しかけても、言語設定の言語でしか返答
       しないのはやめろ") — the deterministic reply strings too, not just the AI text. Unsupported detected
       languages (e.g. French) fall back to the UI language. */
    /* (#R318) nine languages, and derived rather than listed: `codeForEnglishName` is built FROM
       `englishName`, so the two directions cannot disagree, and a language a detector names that
       IntMap does not have resolves to nothing (→ the UI language) rather than to Japanese. */
    const _mirrorLang=()=>{ try{ return window.IntMapLang.codeForEnglishName(_replyLang())||HOST.lang; }catch(_){ return HOST.lang; } };
    /* (#R318) 「ドイツ語にして」「passe en français」「한국어로」 — every spelling ONE language row
       already knows (its internal code, its BCP-47 tag, its aliases, its own name, its English name),
       plus the endonyms a reader is most likely to type. Derived from the registry, so a tenth
       language is still one locale file and no edit here. Returns '' for a language IntMap has not
       got — which the `language` action reports honestly instead of silently doing nothing. */
    const _LANG_ENDONYM={'deutsch':'de','español':'es','espanol':'es','français':'fr','francais':'fr','한국어':'ko','русский':'ru','日本語':'jp','繁體中文':'zh','繁体中文':'zh','正體中文':'zh','简体中文':'zh-hans','簡體中文':'zh-hans','中文':'zh','英語':'en','英语':'en'};
    function _langCode(x){ try{ const R=window.IntMapLang; const w=String(x==null?'':x).trim().toLowerCase(); if(!w) return '';
      const byName=R.codeForEnglishName(w); if(byName) return byName;
      for(const row of R.LANGS){ const lbl=String(row.label||'').toLowerCase().replace(/s*(beta)s*$/,'');
        if(String(row.code).toLowerCase()===w||String(row.html||'').toLowerCase()===w||lbl===w) return row.code;
        if((row.alias||[]).some(a=>String(a).toLowerCase()===w)) return row.code; }
      return _LANG_ENDONYM[w]||''; }catch(_){ return ''; } }
    const L=window.IntMapLang.pick(()=>_mirrorLang()), LA=window.IntMapLang.pickArgs();   /* (#R241) LA = the ARRAY form; see `pickArgs` in js/lang-registry.js. ONE statement: this file is under a shrink-only ceiling (tests/r199 ⑤), and the rule is that a feature moves out, never that the ceiling moves up. */
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const lx=arr=>L.arr(arr);   /* (#R241) through `pick()` itself, so a language past the arguments given gets its inline-table entry instead of English at index 0 */
    /* metric catalog → countryStats keys */
    const METRICS={
      pop:{label:LA('Population','人口','Bevölkerung','Население','Población'),get:s=>s.pop},
      density:{label:LA('Pop. density','人口密度','Bevölkerungsdichte','Плотность нас.','Densidad'),get:s=>s.density},
      area:{label:LA('Area','面積','Fläche','Площадь','Superficie'),get:s=>s.area},
      gdp:{label:LA('GDP (nominal)','GDP（名目）','BIP (nominal)','ВВП (номин.)','PIB (nominal)'),get:s=>s.gdp,log:true},
      gdppc:{label:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita'),get:s=>s.gdppc,log:true},
      hdi:{label:LA('HDI','HDI','HDI','ИЧР','IDH'),get:s=>s.hdi},
      dem:{label:LA('Democracy Index','民主主義指数','Demokratieindex','Индекс демократии','Índice democrático'),get:s=>s.dem},
      milSpend:{label:LA('Military spending','国防費','Militärausgaben','Военные расходы','Gasto militar'),get:s=>s.milSpend,log:true},
      milSpendGDP:{label:LA('Military (% GDP)','国防費(対GDP)','Militär (% BIP)','Военные (% ВВП)','Militar (% PIB)'),get:s=>(s.milSpend!=null&&s.gdp)?(s.milSpend/s.gdp*100):null},
      tfr:{label:LA('Fertility rate','合計特殊出生率','Geburtenrate','Рождаемость','Fecundidad'),get:s=>s.tfr}
    };
    const nm=s=>{ try{ return cName(s); }catch(_){ return s&&(s.nameEn||s.nameJp)||'?'; } };
    function fmtVal(metric,v){ if(v==null||isNaN(v)) return '—';
      try{ if(metric==='gdppc') return fmtPc(v);
        if(metric==='gdp'||metric==='milSpend') return '$'+Math.round(v).toLocaleString()+'B';
        if(metric==='pop') return Math.round(v).toLocaleString();
        if(metric==='density') return Math.round(v).toLocaleString()+' /km²';
        if(metric==='area') return Math.round(v).toLocaleString()+' km²';
        if(metric==='hdi') return v.toFixed(3);
        if(metric==='dem') return v.toFixed(2);
        if(metric==='tfr') return v.toFixed(2);
        if(metric==='milSpendGDP') return v.toFixed(2)+'%';
      }catch(_){}
      return (Math.round(v*100)/100).toLocaleString(); }
    /* ---- country data + highlight (reuses the shared `countries` source / ISO promoteId) ---- */
    function ensureData(){ return new Promise(res=>{
      const ok=()=>(typeof countryStats!=='undefined'&&countryStats&&Object.keys(countryStats).length&&!!geo());
      if(ok()){ res(true); return; }
      try{ if(typeof loadCountryData==='function'){ const p=loadCountryData(); if(p&&p.then){ p.then(()=>res(ok())).catch(()=>res(false)); } } }catch(_){}
      let n=0; (function poll(){ if(ok()) res(true); else if(n++>60) res(ok()); else setTimeout(poll,150); })();
    }); }
    let _hl=new Set();
    let _choroState={}, _choroMetric=null;   /* (#R43) choropleth (data→map shading) per-country normalized value */
    /* ---- (#R61) COLOR control ("赤でハイライトしてといっても色が変わらない"): multilingual color names + hex,
       applied to the LIVE paint of the highlight / choropleth / radius / outline layers. ---- */
    const COLOR_NAMES={'red':'#ff3b30','赤':'#ff3b30','赤色':'#ff3b30','rot':'#ff3b30','красный':'#ff3b30','rojo':'#ff3b30','crimson':'#dc143c',
      'orange':'#ff9500','オレンジ':'#ff9500','橙':'#ff9500','оранжевый':'#ff9500','naranja':'#ff9500',
      'yellow':'#ffcc00','黄':'#ffcc00','黄色':'#ffcc00','gelb':'#ffcc00','жёлтый':'#ffcc00','желтый':'#ffcc00','amarillo':'#ffcc00',
      'green':'#34c759','緑':'#34c759','緑色':'#34c759','grün':'#34c759','зелёный':'#34c759','зеленый':'#34c759','verde':'#34c759',
      'blue':'#007aff','青':'#007aff','青色':'#007aff','blau':'#007aff','синий':'#007aff','azul':'#007aff',
      'lightblue':'#32ade6','light blue':'#32ade6','水色':'#32ade6','голубой':'#32ade6','celeste':'#32ade6','cyan':'#32ade6','シアン':'#32ade6',
      'purple':'#af52de','紫':'#af52de','violet':'#af52de','violett':'#af52de','lila':'#af52de','фиолетовый':'#af52de','morado':'#af52de',
      'pink':'#ff2d55','ピンク':'#ff2d55','桃色':'#ff2d55','rosa':'#ff2d55','розовый':'#ff2d55',
      'brown':'#a2845e','茶色':'#a2845e','braun':'#a2845e','коричневый':'#a2845e','marrón':'#a2845e','marron':'#a2845e',
      'white':'#ffffff','白':'#ffffff','weiß':'#ffffff','weiss':'#ffffff','белый':'#ffffff','blanco':'#ffffff',
      'black':'#1c1c1e','黒':'#1c1c1e','schwarz':'#1c1c1e','чёрный':'#1c1c1e','черный':'#1c1c1e','negro':'#1c1c1e',
      'gray':'#8e8e93','grey':'#8e8e93','灰色':'#8e8e93','グレー':'#8e8e93','grau':'#8e8e93','серый':'#8e8e93','gris':'#8e8e93',
      'gold':'#ffd60a','金':'#ffd60a','金色':'#ffd60a','ゴールド':'#ffd60a',
      /* (#R62) rich color vocabulary ("エメラルドグリーン、紺等の指示に対応していない") */
      'emerald':'#2ecc71','emeraldgreen':'#2ecc71','エメラルド':'#2ecc71','エメラルドグリーン':'#2ecc71','smaragd':'#2ecc71','smaragdgrün':'#2ecc71','изумрудный':'#2ecc71','esmeralda':'#2ecc71','verdeesmeralda':'#2ecc71',
      'navy':'#000080','navyblue':'#000080','紺':'#000080','紺色':'#000080','ネイビー':'#000080','濃紺':'#001255','marineblau':'#000080','dunkelblau':'#00126b','тёмно-синий':'#000080','темно-синий':'#000080','azulmarino':'#000080',
      'teal':'#008080','ティール':'#008080','青緑':'#0d8a8a','petrol':'#006d77',
      'turquoise':'#30d5c8','ターコイズ':'#30d5c8','türkis':'#30d5c8','бирюзовый':'#30d5c8','turquesa':'#30d5c8',
      'magenta':'#ff00aa','マゼンタ':'#ff00aa','пурпурный':'#ff00aa',
      'lime':'#a8e10c','ライム':'#a8e10c','黄緑':'#9acd32','きみどり':'#9acd32','салатовый':'#9acd32','hellgrün':'#9acd32','verdelima':'#a8e10c',
      'olive':'#808000','オリーブ':'#808000','oliv':'#808000','оливковый':'#808000','oliva':'#808000',
      'maroon':'#800000','マルーン':'#800000','えんじ':'#7b1e26','臙脂':'#7b1e26','бордовый':'#800000','granate':'#800000','burgundy':'#722f37','ワインレッド':'#722f37','wine':'#722f37','винный':'#722f37',
      'indigo':'#4b0082','インディゴ':'#4b0082','藍':'#165e83','藍色':'#165e83','индиго':'#4b0082','añil':'#4b0082',
      'salmon':'#fa8072','サーモン':'#fa8072','лососевый':'#fa8072','salmón':'#fa8072',
      'coral':'#ff7f50','コーラル':'#ff7f50','珊瑚色':'#ff7f50','коралловый':'#ff7f50',
      'beige':'#e8dcc4','ベージュ':'#e8dcc4','бежевый':'#e8dcc4',
      'ivory':'#fffff0','アイボリー':'#fffff0','象牙色':'#fffff0',
      'khaki':'#b0a160','カーキ':'#b0a160','хаки':'#b0a160','caqui':'#b0a160',
      'mint':'#98e4c0','mintgreen':'#98e4c0','ミント':'#98e4c0','ミントグリーン':'#98e4c0','mintgrün':'#98e4c0','мятный':'#98e4c0','menta':'#98e4c0',
      'lavender':'#b57edc','ラベンダー':'#b57edc','lavendel':'#b57edc','лавандовый':'#b57edc','lavanda':'#b57edc',
      'scarlet':'#e2421f','スカーレット':'#e2421f','朱':'#eb6101','朱色':'#eb6101','алый':'#e2421f','escarlata':'#e2421f',
      'darkgreen':'#006400','深緑':'#006400','ダークグリーン':'#006400','dunkelgrün':'#006400','тёмно-зелёный':'#006400','темно-зеленый':'#006400','verdeoscuro':'#006400',
      'darkred':'#8b0000','暗赤色':'#8b0000','dunkelrot':'#8b0000','тёмно-красный':'#8b0000','rojooscuro':'#8b0000',
      'ultramarine':'#2a52be','群青':'#2a52be','群青色':'#2a52be','ультрамарин':'#2a52be',
      'skyblue':'#87ceeb','スカイブルー':'#87ceeb','空色':'#87ceeb','himmelblau':'#87ceeb','небесный':'#87ceeb','celestial':'#87ceeb',
      'sakura':'#f7c9d4','桜色':'#f7c9d4','さくら色':'#f7c9d4','rosapalo':'#f7c9d4',
      'yamabuki':'#f8b500','山吹色':'#f8b500','amber':'#ffbf00','アンバー':'#ffbf00','琥珀色':'#ffbf00','янтарный':'#ffbf00','ámbar':'#ffbf00',
      'charcoal':'#36454f','チャコール':'#36454f','墨色':'#2b2b2b','fuchsia':'#ff00ff','フューシャ':'#ff00ff','фуксия':'#ff00ff','fucsia':'#ff00ff',
      'peach':'#ffcba4','ピーチ':'#ffcba4','桃':'#f09199','персиковый':'#ffcba4','melocotón':'#ffcba4',
      'aqua':'#00d5e2','アクア':'#00d5e2','cream':'#fffdd0','クリーム色':'#fffdd0','クリーム':'#fffdd0'};
    function parseColor(c){ if(c==null) return null; const s=String(c).trim().toLowerCase();
      if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
      /* normalized key: spaces / middle dots removed so "emerald green" / "エメラルド・グリーン" hit too */
      const k=s.replace(/[\s·・･]/g,'');
      if(COLOR_NAMES[s]) return COLOR_NAMES[s]; if(COLOR_NAMES[k]) return COLOR_NAMES[k];
      const t=k.replace(/(色|の)$/,''); if(COLOR_NAMES[t]) return COLOR_NAMES[t];
      /* (#R62) any CSS-recognised colour (all 147 named colours, rgb()/hsl()) as the final net */
      try{ const o=new Option().style; o.color=''; o.color=s; if(o.color) return s; }catch(_){}
      try{ const o2=new Option().style; o2.color=''; o2.color=k; if(o2.color) return k; }catch(_){}
      return null; }
    let _hlColor='#ff9500', _hlLineColor='#ff9f0a';
    function setHlColor(c){ _hlColor=c; _hlLineColor=c;
      try{ if(GE().layers.has('nlq-fill')) GE().layers.setPaint('nlq-fill','fill-color',c); if(GE().layers.has('nlq-line')) GE().layers.setPaint('nlq-line','line-color',c); }catch(_){} }
    function _mixc(h,h2,t2){ const p=x=>parseInt(x,16); const a=[p(h.slice(1,3)),p(h.slice(3,5)),p(h.slice(5,7))], b=[p(h2.slice(1,3)),p(h2.slice(3,5)),p(h2.slice(5,7))];
      return '#'+a.map((v,i)=>('0'+Math.round(v+(b[i]-v)*t2).toString(16)).slice(-2)).join(''); }
    function rampFrom(c){ return [_mixc('#ffffff',c,0.12),_mixc('#ffffff',c,0.38),_mixc('#ffffff',c,0.68),c,_mixc(c,'#000000',0.35)]; }
    /* (#R44) conversation MEMORY + last-referenced place — the user reported "文脈理解が壊滅的": Atlas was sending
       ONLY the current message to the model with no history and no map state, so follow-ups ("there", "turn it
       off", "more", "the same country over time") had nothing to resolve against. ⚠ (#R298) AN ENTRY IS `{t,s}`, NOT A
       BARE STRING: `s` is what the model reads, `t` is the turn that produced it — the array is capped at 16, so an
       absolute position means nothing, and an edited message must rewind history as far as it rewinds the chat. */
    let _hist=[]; let _lastPlace=null; let _lastMissileCtx=null; let _lastRadCtx=null; let _lastRouteCtx=null;   /* (#R85) last missile / radiation / route → in-message controls re-run it */
    let _curPlanCites=[];   /* (#R350) the citations of THIS turn's planner call. The `answer` action used to read window._aiLastCitations at render time — a second Atlas turn finishing in between handed it the other turn's sources. */
    let _curProfile=null;   /* (#R350) the request profile of the turn in flight — read by runActions to stamp each action's goal impact */
    let _turnSeq=0, _curTurn=0, _curTurnKey='';   /* (#R350) _curTurnKey is module-scoped because the analysis lives in dispatch(), not in run(): without it the structured answer and its one repair would each buy a daily use, undoing #R318 for exactly the path this round adds a repair to. (#R298) the monotone turn id: run() stamps it on the user bubble and recordTurn files the exchange under it. ⚠ its own line — tests/r199 pins `let _hist=[]; let _lastPlace=null;` verbatim to prove the kernel still owns _lastPlace, so nothing may be spliced between them */
    /* (#R86c) multi-stop route optimisation (TSP): order N points shortest-first via nearest-neighbour + 2-opt on
       great-circle distance (keyless, instant), keeping the first point as the fixed start; the ordered tour is then
       driven on the real OSM road network (OSRM). Good for "10地点を最短順に並べ替える". */
    function _tspOrder(pts){ const n=pts.length; if(n<=2) return pts.map((_,i)=>i);
      const D=(a,b)=>{ const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); };
      const used=new Array(n).fill(false); const order=[0]; used[0]=true;
      for(let k=1;k<n;k++){ const last=order[order.length-1]; let bi=-1,bd=1e18; for(let j=0;j<n;j++){ if(used[j]) continue; const d=D(pts[last],pts[j]); if(d<bd){bd=d;bi=j;} } order.push(bi); used[bi]=true; }
      const tot=(o)=>{ let s=0; for(let i=0;i<o.length-1;i++) s+=D(pts[o[i]],pts[o[i+1]]); return s; };
      let improved=true, guard=0; while(improved && guard++<60){ improved=false;
        for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){ const a=order.slice(); const seg=a.slice(i,k+1).reverse(); a.splice(i,seg.length,...seg); if(tot(a)<tot(order)-1e-6){ order.splice(0,n,...a); improved=true; } } }
      return order; }
    /* (#R83) "Ask AI about here" is ABSORBED into Atlas ("独立させるな。Atlasに吸収しろ"): a right-click point (or
       the askHere action) pins an exact coordinate here, and buildPrompt injects it so EVERY question in the
       conversation resolves "here/this spot/この地点" to it — no separate research panel. Cleared on clearAll. */
    let _herePoint=null;
    /* (#R76) vision §3 — STRUCTURED working context. The rolling _hist text is what the model *reads*; this
       object is what Atlas *knows*: the current focus countries, topic under investigation, metrics in play,
       the exact components of an active custom score (so "家賃を重視して" re-emits the real current recipe),
       and the time-travel period. Updated deterministically from the actions that actually SUCCEEDED. */
    const _wctx={countries:[],topic:'',metrics:[],scoreComponents:null,period:'',exclusions:[],year:null};   /* (#R135) year = the last historical year in play (conversation fallback for the REQUEST PROFILE) */
    /* (#R120) non-dispatch creators (e.g. a GeoJSON file upload) report their new object ids here, so
       "さっき読み込んだやつ" resolves via _wctx.lastObjects just like dispatch-created objects. */
    window._imNoteObjects=ids=>{ try{ if(Array.isArray(ids)&&ids.length) _wctx.lastObjects=ids.map(String).concat(_wctx.lastObjects||[]).slice(0,6); }catch(_){} };
    function updateWctx(acts,fails){ try{ (acts||[]).forEach(a=>{ if(!a||(fails||[]).indexOf(a)>=0) return;
      if((a.type==='compareStats'||a.type==='compareCountries'||a.type==='statsCompare')&&a.countries) _wctx.countries=[].concat(a.countries).map(String).slice(0,10);
      if((a.type==='analyze'||a.type==='research')&&(a.question||a.query)) _wctx.topic=String(a.question||a.query).slice(0,140);
      if((a.type==='mapReport'||a.type==='newsMap')&&a.topic) _wctx.topic=String(a.topic).slice(0,140);
      if((a.type==='impact'||a.type==='impactAnalysis')) _wctx.topic=('impact: '+String(a.place||a.event||'')).slice(0,140);
      if((a.type==='rank'||a.type==='mapMetric'||a.type==='explore'||a.type==='findRelated')&&a.metric){ const m2=String(a.metric); if(_wctx.metrics.indexOf(m2)<0) _wctx.metrics.unshift(m2); _wctx.metrics=_wctx.metrics.slice(0,4); }
      if((a.type==='scoreMap'||a.type==='customLayer'||a.type==='evaluate')&&Array.isArray(a.components)){ try{ _wctx.scoreComponents=JSON.stringify({name:a.name||'',components:a.components}).slice(0,600); }catch(_){} }
      if(a.type==='reset'||a.type==='clearAll'){ _wctx.scoreComponents=null; }
      if(a.type==='timeTravel'||a.type==='setTime'||a.type==='timeSet'){ _wctx.period=(a.reset||a.now||a.live)?'now':String(a.year||a.date||((a.daysAgo!=null)?(a.daysAgo+' days ago'):'')).slice(0,40);
        if(a.reset||a.now||a.live) _wctx.year=null; else if(a.year!=null&&isFinite(+a.year)) _wctx.year=Math.round(+a.year); else if(a.date){ try{ const y=+String(a.date).slice(0,4); if(y>=1000) _wctx.year=y; }catch(_){} } }   /* (#R135) year for the next turn's REQUEST PROFILE (conversation fallback) */
      if((a.type==='researchMap'||a.type==='research_map'||a.type==='situationMap')&&a.year!=null&&isFinite(+a.year)) _wctx.year=Math.round(+a.year);   /* (#R135) */
      if((a.type==='historicalMap'||a.type==='allianceMap'||a.type==='powerMap')&&(a.era||a.date)){ try{ const y=_rpExtractYear(String(a.era||a.date)); if(y!=null) _wctx.year=y; }catch(_){} }   /* (#R135) */
    }); }catch(_){} }
    /* (#R80) vision §3 — REMEMBER exclusion conditions ("除外条件…を保持"). These are stated in natural language
       ("except Europe", "◯◯を除いて", "not counting China", "アメリカ以外"), not encoded in an action, so parse the
       raw message. A fresh exclusion phrase REPLACES the set; "include everything / 除外を解除" clears it; otherwise
       it persists as a standing condition the AI is told to honour. */
    const _INCL_RE=/^(?:include (?:everything|all|them)|show (?:everything|all)|(?:clear|reset|remove|drop) (?:the )?exclusions?|no exclusions?|除外(?:を)?(?:解除|なし|リセット|クリア)|全部(?:含めて|表示)|すべて含めて|全て含めて)$/i;
    function _parseExclusions(q){ try{ const s=String(q||'').trim(); if(!s) return;
      if(_INCL_RE.test(s.toLowerCase())||_INCL_RE.test(s)){ _wctx.exclusions=[]; return; }
      const found=[]; const push=v=>{ v=String(v||'').replace(/["'「」『』.。,、;]+$/,'').trim(); if(v&&v.length<=40&&found.indexOf(v)<0) found.push(v); };
      let m; const g=re=>{ re.lastIndex=0; while((m=re.exec(s))&&found.length<4){ push(m[1]); } };
      g(/(?:except(?:\s+for)?|excluding|not counting|other than|apart from|but not|without|save for)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &'-]{1,38})/gi);   /* EN */
      g(/(?:außer|ausgenommen|mit ausnahme von)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &'-]{1,38})/gi);   /* DE */
      g(/(?:excepto|salvo|menos|aparte de|sin contar)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &'-]{1,38})/gi);   /* ES */
      g(/(?:кроме|исключая|за исключением|помимо)\s+([А-Яа-яЁё][А-Яа-яЁё0-9 &'-]{1,38})/gi);   /* RU */
      g(/([^\s、。,，;；「」『』]{1,30}?)(?:を除いて|を除く|を除外|は除外|を抜き(?:で|にして)?|抜きで|以外(?:で|は|の)?)/g);   /* JP */
      if(found.length) _wctx.exclusions=found.slice(0,4); }catch(_){ } }
    function wctxBlock(){ try{ const ln=[];
      if(_wctx.countries.length) ln.push('Focus countries (last comparison): '+_wctx.countries.join(', '));
      if(_wctx.topic) ln.push('Topic under investigation: '+_wctx.topic);
      if(_wctx.metrics.length) ln.push('Metrics recently in play: '+_wctx.metrics.join(', '));
      if(_wctx.scoreComponents) ln.push('ACTIVE custom score recipe (adjust THIS when the user says weight/drop/add): '+_wctx.scoreComponents);
      if(_wctx.period) ln.push('Time-travel period: '+_wctx.period);
      if(_wctx.highlight&&_wctx.highlight.name) ln.push('Last Atlas highlight: "'+_wctx.highlight.name+'" ('+(_wctx.highlight.n||'?')+' shapes)'+(_wctx.highlight.basis?(' — year-basis: '+_wctx.highlight.basis):''));   /* (#R118) */
      if(_wctx.lastObjects&&_wctx.lastObjects.length) ln.push('Recently created map-object ids (newest first — "the one I just made / さっき作ったやつ" = the first; operate via the object action): '+_wctx.lastObjects.join(', '));   /* (#R119) */
      if(_wctx.exclusions&&_wctx.exclusions.length) ln.push('EXCLUSIONS the user set (a standing condition — do NOT include these in rankings/analysis/highlights unless the user changes it; they said "include everything / 除外を解除" to clear it): '+_wctx.exclusions.join('; '));
      return ln.length?ln.join('\n'):''; }catch(_){ return ''; } }
    /* (#R80) vision §16 自己確認 — SAME-NAME PLACE verification. Many names denote very different real places
       (Georgia the country vs the US state; Athens Greece vs Athens GA; Paris France vs Paris TX). After Atlas
       resolves such a name it states WHICH one it mapped and offers the alternatives, so a wrong same-name guess
       is caught and correctable instead of silently wrong. Fires only when the resolved point is confidently one
       of the known candidates (≤250 km), so it never nags on unambiguous places. ⚠ (#R246) EACH CANDIDATE'S NAME IS A CALL: `{en:…,jp:…,lng,lat}` read by `_mirrorLang()==='jp'?o.jp:o.en` was the eleventh shape with two coordinates mixed in, so every language but Japanese was told about an ambiguous place IN ENGLISH. `LA(…)` is IntMapLang.pickArgs(); `lx()` resolves it through pick() itself. */
    const AMBIG={
      georgia:[{n:LA('Georgia (the country)','ジョージア（国）','Georgien (das Land)','Грузия (страна)','Georgia (el país)'),lng:43.4,lat:42.2},{n:LA('Georgia, USA (the state)','ジョージア州（米国）','Georgia, USA (der Bundesstaat)','Джорджия, США (штат)','Georgia, EE. UU. (el estado)'),lng:-83.5,lat:32.9}],
      athens:[{n:LA('Athens, Greece','アテネ（ギリシャ）','Athen, Griechenland','Афины, Греция','Atenas, Grecia'),lng:23.73,lat:37.98},{n:LA('Athens, Georgia (USA)','アセンズ（米ジョージア州）','Athens, Georgia (USA)','Атенс, Джорджия (США)','Athens, Georgia (EE. UU.)'),lng:-83.38,lat:33.96}],
      paris:[{n:LA('Paris, France','パリ（フランス）','Paris, Frankreich','Париж, Франция','París, Francia'),lng:2.35,lat:48.85},{n:LA('Paris, Texas (USA)','パリス（米テキサス州）','Paris, Texas (USA)','Пэрис, Техас (США)','Paris, Texas (EE. UU.)'),lng:-95.56,lat:33.66}],
      cambridge:[{n:LA('Cambridge, UK','ケンブリッジ（英国）','Cambridge, Vereinigtes Königreich','Кембридж, Великобритания','Cambridge, Reino Unido'),lng:0.12,lat:52.2},{n:LA('Cambridge, Massachusetts (USA)','ケンブリッジ（米マサチューセッツ州）','Cambridge, Massachusetts (USA)','Кеймбридж, Массачусетс (США)','Cambridge, Massachusetts (EE. UU.)'),lng:-71.11,lat:42.37}],
      naples:[{n:LA('Naples, Italy','ナポリ（イタリア）','Neapel, Italien','Неаполь, Италия','Nápoles, Italia'),lng:14.27,lat:40.85},{n:LA('Naples, Florida (USA)','ネイプルズ（米フロリダ州）','Naples, Florida (USA)','Нейплс, Флорида (США)','Naples, Florida (EE. UU.)'),lng:-81.79,lat:26.14}],
      alexandria:[{n:LA('Alexandria, Egypt','アレクサンドリア（エジプト）','Alexandria, Ägypten','Александрия, Египет','Alejandría, Egipto'),lng:29.92,lat:31.2},{n:LA('Alexandria, Virginia (USA)','アレクサンドリア（米バージニア州）','Alexandria, Virginia (USA)','Александрия, Виргиния (США)','Alexandria, Virginia (EE. UU.)'),lng:-77.05,lat:38.8}],
      tripoli:[{n:LA('Tripoli, Libya','トリポリ（リビア）','Tripolis, Libyen','Триполи, Ливия','Trípoli, Libia'),lng:13.19,lat:32.89},{n:LA('Tripoli, Lebanon','トリポリ（レバノン）','Tripoli, Libanon','Триполи, Ливан','Trípoli, Líbano'),lng:35.84,lat:34.44}],
      cordoba:[{n:LA('Córdoba, Spain','コルドバ（スペイン）','Córdoba, Spanien','Кордова, Испания','Córdoba, España'),lng:-4.78,lat:37.89},{n:LA('Córdoba, Argentina','コルドバ（アルゼンチン）','Córdoba, Argentinien','Кордова, Аргентина','Córdoba, Argentina'),lng:-64.18,lat:-31.42}],
      valencia:[{n:LA('Valencia, Spain','バレンシア（スペイン）','Valencia, Spanien','Валенсия, Испания','Valencia, España'),lng:-0.38,lat:39.47},{n:LA('Valencia, Venezuela','バレンシア（ベネズエラ）','Valencia, Venezuela','Валенсия, Венесуэла','Valencia, Venezuela'),lng:-68.0,lat:10.16}],
      santiago:[{n:LA('Santiago, Chile','サンティアゴ（チリ）','Santiago de Chile','Сантьяго, Чили','Santiago de Chile'),lng:-70.67,lat:-33.45},{n:LA('Santiago de Compostela, Spain','サンティアゴ・デ・コンポステーラ（スペイン）','Santiago de Compostela, Spanien','Сантьяго-де-Компостела, Испания','Santiago de Compostela, España'),lng:-8.54,lat:42.88}],
      sanjose:[{n:LA('San José, Costa Rica','サンホセ（コスタリカ）','San José, Costa Rica','Сан-Хосе, Коста-Рика','San José, Costa Rica'),lng:-84.08,lat:9.93},{n:LA('San Jose, California (USA)','サンノゼ（米カリフォルニア州）','San José, Kalifornien (USA)','Сан-Хосе, Калифорния (США)','San José, California (EE. UU.)'),lng:-121.89,lat:37.34}],
      sydney:[{n:LA('Sydney, Australia','シドニー（豪）','Sydney, Australien','Сидней, Австралия','Sídney, Australia'),lng:151.21,lat:-33.87},{n:LA('Sydney, Nova Scotia (Canada)','シドニー（カナダ・ノバスコシア）','Sydney, Nova Scotia (Kanada)','Сидни, Новая Шотландия (Канада)','Sídney, Nueva Escocia (Canadá)'),lng:-60.19,lat:46.14}],
      guadalajara:[{n:LA('Guadalajara, Mexico','グアダラハラ（メキシコ）','Guadalajara, Mexiko','Гвадалахара, Мексика','Guadalajara, México'),lng:-103.35,lat:20.67},{n:LA('Guadalajara, Spain','グアダラハラ（スペイン）','Guadalajara, Spanien','Гвадалахара, Испания','Guadalajara, España'),lng:-3.16,lat:40.63}],
      stpetersburg:[{n:LA('Saint Petersburg, Russia','サンクトペテルブルク（ロシア）','Sankt Petersburg, Russland','Санкт-Петербург, Россия','San Petersburgo, Rusia'),lng:30.34,lat:59.93},{n:LA('St. Petersburg, Florida (USA)','セントピーターズバーグ（米フロリダ州）','St. Petersburg, Florida (USA)','Сент-Питерсберг, Флорида (США)','St. Petersburg, Florida (EE. UU.)'),lng:-82.64,lat:27.77}],
      birmingham:[{n:LA('Birmingham, UK','バーミンガム（英国）','Birmingham, Vereinigtes Königreich','Бирмингем, Великобритания','Birmingham, Reino Unido'),lng:-1.9,lat:52.48},{n:LA('Birmingham, Alabama (USA)','バーミングハム（米アラバマ州）','Birmingham, Alabama (USA)','Бирмингем, Алабама (США)','Birmingham, Alabama (EE. UU.)'),lng:-86.81,lat:33.52}],
      manchester:[{n:LA('Manchester, UK','マンチェスター（英国）','Manchester, Vereinigtes Königreich','Манчестер, Великобритания','Mánchester, Reino Unido'),lng:-2.24,lat:53.48},{n:LA('Manchester, New Hampshire (USA)','マンチェスター（米ニューハンプシャー州）','Manchester, New Hampshire (USA)','Манчестер, Нью-Гэмпшир (США)','Manchester, Nuevo Hampshire (EE. UU.)'),lng:-71.46,lat:42.99}],
      perth:[{n:LA('Perth, Australia','パース（豪）','Perth, Australien','Перт, Австралия','Perth, Australia'),lng:115.86,lat:-31.95},{n:LA('Perth, Scotland (UK)','パース（スコットランド）','Perth, Schottland (UK)','Перт, Шотландия (Великобритания)','Perth, Escocia (Reino Unido)'),lng:-3.43,lat:56.4}]
    };
    const _ambNorm=s=>{ try{ return String(s==null?'':s).normalize('NFD').replace(new RegExp('['+String.fromCharCode(0x300)+'-'+String.fromCharCode(0x36f)+']','g'),'').toLowerCase().replace(/^(the|el|la)\s+/,'').replace(/[^a-z0-9]+/g,''); }catch(_){ return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,''); } };
    function _ambigNote(rawName,lng,lat){ try{ if(lng==null||lat==null||!isFinite(lng)||!isFinite(lat)) return '';
      const cands=AMBIG[_ambNorm(rawName)]; if(!cands||cands.length<2) return '';
      const km=(a,b,c,d)=>{ const x=(a-c)*Math.cos((b+d)/2*Math.PI/180), y=(b-d); return Math.hypot(x,y)*111; };
      let best=-1,bd=1e9; cands.forEach((c,i)=>{ const d=km(+lng,+lat,c.lng,c.lat); if(d<bd){ bd=d; best=i; } });
      if(best<0||bd>250) return '';   /* only when we are confident WHICH candidate is shown */
      const pick=o=>lx(o.n);
      const shown=pick(cands[best]); const others=cands.filter((_,i)=>i!==best).map(pick);
      return '<div style="font-size:11px;color:var(--text-muted);margin:3px 0;line-height:1.5;border-left:2px solid var(--primary-color);padding-left:7px;">ℹ '
        +L('“'+esc(rawName)+'” is an ambiguous name — I showed '+esc(shown)+'. Also possible: '+others.map(esc).join(', ')+'. Say e.g. “'+esc(others[0])+'” if you meant that one.',
           '「'+esc(rawName)+'」は同名の場所が複数あります。今回は'+esc(shown)+'を表示しました。他に'+others.map(esc).join('・')+'も。別の場所なら「'+esc(others[0])+'」のように指定してください。',
           '„'+esc(rawName)+'“ ist mehrdeutig — gezeigt: '+esc(shown)+'. Auch möglich: '+others.map(esc).join(', ')+'. Sonst z. B. „'+esc(others[0])+'“ sagen.',
           '«'+esc(rawName)+'» — неоднозначное название. Показано: '+esc(shown)+'. Также: '+others.map(esc).join(', ')+'. Иначе укажите, напр. «'+esc(others[0])+'».',
           '«'+esc(rawName)+'» es ambiguo — mostré '+esc(shown)+'. También: '+others.map(esc).join(', ')+'. Di p. ej. «'+esc(others[0])+'» si era ese.')
        +'</div>'; }catch(_){ return ''; } }
    /* (#R42c) ROOT CAUSE of "地図へのマッピングが行われない": highlights targeted the shared `countries` source,
       which only exists AFTER the Countries(info) layer is enabled (addCountryLayers) — so ensureHlLayers bailed
       and nothing painted. Use our OWN geojson source built from window.countryGeo (always available once
       loadCountryData ran), independent of any layer toggle. */
    function geo(){ return window.countryGeo || (typeof HOST.countryGeo!=='undefined'?HOST.countryGeo:null); }
    function ensureHlLayers(){ const g=geo(); if(!g||!g.features) return false;
      try{ if(!GE().layers.hasSource('nlq-src')) GE().layers.addSource('nlq-src',{type:'geojson',data:g,promoteId:'__code'}); }catch(_){}
      if(GE().layers.has('nlq-fill')) return true;
      const before=['ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      try{ GE().layers.add({id:'nlq-fill',type:'fill',source:'nlq-src',paint:{'fill-color':_hlColor,'fill-opacity':['case',['boolean',['feature-state','nlq'],false],0.55,0]}},before);
        GE().layers.add({id:'nlq-line',type:'line',source:'nlq-src',paint:{'line-color':_hlLineColor,'line-width':['case',['boolean',['feature-state','nlq'],false],2,0],'line-opacity':0.95}},before); return true; }catch(_){ return false; } }
    function clearHl(){ _hl.forEach(c=>{ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{nlq:false}); }catch(_){} }); _hl=new Set(); }
    /* (#R108) HONEST highlight ("ハイライトしましたと言ってハイライトしていない例がある"): setFeatureState is a silent
       no-op when the source has no feature with that promoted id (country data not loaded yet, or a code that isn't in
       the geojson). Only report success when AT LEAST ONE requested country actually matches a real feature — otherwise
       return false so the caller's bounded retry waits for the data, then reports honestly instead of claiming a paint
       that never happened. */
    function highlight(codes){ if(!ensureHlLayers()) return false; clearHl();
      const g=geo(); const valid=new Set(); try{ (g&&g.features||[]).forEach(f=>{ const p=f.properties||{}; if(p.__code!=null) valid.add(String(p.__code)); if(f.id!=null) valid.add(String(f.id)); }); }catch(_){}
      /* (#R142) HONESTY ROOT-CAUSE for "ハイライトしていないのにハイライトしましたと嘘報告": if the country features aren't
         loaded yet (valid.size===0) we cannot know any code matches a RENDERED feature — setting feature-state now paints
         nothing visible yet would return any=true and let the reply claim a highlight that isn't on screen. Return false so
         the dispatch's bounded retry (R61) waits for the data, then reports honestly if it never paints. */
      if(!valid.size) return false;
      let any=false; codes.forEach(c=>{ const cs=String(c); if(!valid.has(cs)) return;   /* no matching feature → skip; don't claim an impossible paint */
        try{ GE().layers.setFeatureState({source:'nlq-src',id:cs},{nlq:true}); _hl.add(cs); any=true; }catch(_){} });
      return any; }
    GE().events.on('styledata',()=>{ if(_hl.size||(_choroState&&Object.keys(_choroState).length)){ setTimeout(()=>{ try{ ensureHlLayers(); const keep=new Set(_hl); _hl=new Set(); keep.forEach(c=>{ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{nlq:true}); _hl.add(c); }catch(_){} });
      if(_choroState&&Object.keys(_choroState).length){ try{ ensureChoroLayer(); for(const c in _choroState){ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{choroV:_choroState[c]}); }catch(_){} } }catch(_){} } }catch(_){} },120); } });
    function fbbox(g){ try{ let a=180,b=90,c=-180,d=-90; const scan=cs=>cs.forEach(x=>{ if(typeof x[0]==='number'){ a=Math.min(a,x[0]);b=Math.min(b,x[1]);c=Math.max(c,x[0]);d=Math.max(d,x[1]); } else scan(x); }); if(g.type==='Polygon'||g.type==='MultiPolygon') scan(g.coordinates); else return null; return [a,b,c,d]; }catch(_){ return null; } }
    function fitTo(codes){ try{ const g=geo(); if(!g||!g.features) return; const set=new Set(codes.map(String)); let a=180,b=90,c=-180,d=-90,any=false;
      g.features.forEach(f=>{ if(!set.has(String(f.id))) return; const bb=fbbox(f.geometry); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); });
      if(any&&isFinite(a)&&(c-a)<350){ GE().camera.fitBounds([[a,b],[c,d]],{padding:60,maxZoom:6,duration:900}); return true; } }catch(_){} return false; }
    /* ---- (#R62) POLYGON highlights — admin subdivisions (奈良県 / Stavropol Krai used to light up the WHOLE
       country) and named/fuzzy REGIONS (Blue Banana, Rhine-Ruhr, Great Plains). Resolution ladder per name:
       country-name match → Nominatim admin/natural polygon → directional slice → macro-region gazetteer
       (soft superellipse, not a rectangle) → AI-traced approximate outline → containing country (last resort). ---- */
    let _hlPolys=[];
    function ensurePolyLayer(){ try{ if(!GE().layers.hasSource('nlq-poly-src')) GE().layers.addSource('nlq-poly-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(GE().layers.has('nlq-poly-fill')) return true;
      const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      GE().layers.add({id:'nlq-poly-fill',type:'fill',source:'nlq-poly-src',paint:{'fill-color':['coalesce',['get','color'],'#ff9500'],'fill-opacity':['coalesce',['get','op'],0.32]}},before);
      /* (#R64) composed regions (unions of many real admin polygons) get FAINT member outlines so the internal
         admin seams don't dominate — the region reads as one shape. */
      GE().layers.add({id:'nlq-poly-line',type:'line',source:'nlq-poly-src',paint:{'line-color':['coalesce',['get','color'],'#ff9f0a'],'line-width':['case',['==',['get','comp'],1],1,2],'line-opacity':['case',['==',['get','comp'],1],0.35,0.9]}},before);
      return true; }catch(_){ return false; } }
    function paintPolys(){ if(!_hlPolys.length){ try{ GE().layers.setSourceData('nlq-poly-src',{type:'FeatureCollection',features:[]}); }catch(_){} return true; }
      if(!ensurePolyLayer()) return false;
      try{ GE().layers.setSourceData('nlq-poly-src',{type:'FeatureCollection',features:_hlPolys.map((p,i)=>({type:'Feature',id:i,geometry:p.geo,properties:{color:p.color||_hlColor,name:p.name||'',comp:p.comp?1:0,op:(p.op!=null?p.op:null)}}))}); return true; }catch(_){ return false; } }
    function clearPolyHl(){ _hlPolys=[]; try{ GE().layers.setSourceData('nlq-poly-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    /* (#R120) public handle on the Atlas-drawn polygons so the universal Object List (IntMapObjects) can
       enumerate/focus/delete them and dispatch objectIds can reference them ("さっき描いたポリゴン消して"). */
    let _hlPolySeq=0;
    window._imHlPolys={ list:()=>_hlPolys, tagId:p=>{ if(p&&!p.id) p.id='poly_'+(++_hlPolySeq); return p&&p.id; },
      remove:id=>{ const i=_hlPolys.findIndex(p=>String(p.id)===String(id)); if(i<0) return false; _hlPolys.splice(i,1); paintPolys(); return true; },
      repaint:()=>paintPolys(), clear:()=>clearPolyHl() };
    GE().events.on('styledata',()=>{ if(_hlPolys.length){ setTimeout(()=>{ try{ paintPolys(); }catch(_){} },140); } });
    /* ---- (#R65) LINE highlights — rivers as their REAL course ("河川をハイライトしてといったら、その河川を線で"),
       tributaries as thinner lines. Same lifecycle as the polygon highlights. ---- */
    let _hlLines=[];
    function ensureLineLayer(){ try{ if(!GE().layers.hasSource('nlq-line-src')) GE().layers.addSource('nlq-line-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(GE().layers.has('nlq-line')) return true;
      const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      GE().layers.add({id:'nlq-line',type:'line',source:'nlq-line-src',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#2f9bff'],'line-width':['coalesce',['get','w'],2.5],'line-opacity':['coalesce',['get','op'],0.92]}},before);
      return true; }catch(_){ return false; } }
    function paintLines(){ if(!_hlLines.length){ try{ GE().layers.setSourceData('nlq-line-src',{type:'FeatureCollection',features:[]}); }catch(_){} return true; }
      if(!ensureLineLayer()) return false;
      try{ GE().layers.setSourceData('nlq-line-src',{type:'FeatureCollection',features:_hlLines.map((l,i)=>({type:'Feature',id:i,geometry:l.geo,properties:{color:l.color||null,w:l.w||null,op:l.op||null,name:l.name||''}}))}); return true; }catch(_){ return false; } }
    function clearLineHl(){ _hlLines=[]; try{ GE().layers.setSourceData('nlq-line-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    GE().events.on('styledata',()=>{ if(_hlLines.length){ setTimeout(()=>{ try{ paintLines(); }catch(_){} },150); } });
    /* river / basin intent — multilingual, judged BEFORE any admin-unit logic ("全部が全部行政区分使えば いいわけじゃない。見極めて"). */
    function basinIntent(nm){ const s2=String(nm||'').trim(); let m;
      m=s2.match(/^(.+?)の?流域$/); if(m) return {base:m[1]};   /* keep 川/江/河 in the base name */
      m=s2.match(/^(?:the\s+)?(.+?)\s+(?:river\s+)?(?:drainage\s+)?(?:basin|watershed|catchment(?:\s+area)?)$/i); if(m) return {base:m[1]};
      m=s2.match(/^(?:einzugsgebiet|flusseinzugsgebiet)\s+(?:der|des|von)?\s*(.+)$/i)||s2.match(/^(.+?)-?einzugsgebiet$/i); if(m) return {base:m[1]};
      m=s2.match(/^бассейн\s+(?:реки\s+)?(.+)$/i); if(m) return {base:m[1]};
      m=s2.match(/^(?:la\s+)?cuenca\s+(?:del?\s+(?:río\s+)?)?(.+)$/i); if(m) return {base:m[1]};
      return null; }
    function riverIntent(nm){ const s2=String(nm||'').trim();
      if(/[川江河]$/.test(s2)) return true;
      if(/\b(river|creek|stream|canal|rivière|fleuve)\b/i.test(s2)) return true;
      if(/(fluss|kanal|strom)$/i.test(s2)) return true;
      if(/^(река|канал)\s+/i.test(s2)||/\s(река|канал)$/i.test(s2)) return true;
      if(/^(?:el\s+)?(?:río|rio)\s+/i.test(s2)) return true;
      return false; }
    /* real river geometry: Nominatim waterway result (full-detail LineString) → Overpass named ways fallback */
    const _riverGeoCache={};
    async function fetchRiverLine(nm){ const key=_lnorm(nm); if(_riverGeoCache[key]!==undefined) return _riverGeoCache[key];
      let out=null;
      try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&polygon_geojson=1&polygon_threshold=0.0008&namedetails=1&q='+encodeURIComponent(nm),{headers:{Accept:'application/json'}});
        if(r.ok){ const j=await r.json();
          if(Array.isArray(j)){ const wat=j.filter(o=>{ const c=(o.class||o.category||'').toLowerCase(); const gt=(o.geojson&&o.geojson.type)||''; return (c==='waterway'||/^(river|canal|stream)$/.test(String(o.type||'').toLowerCase()))&&/LineString/.test(gt); })
            .sort((x,y)=>((+y.importance||0)-(+x.importance||0)))[0];
            if(wat) out={geo:wat.geojson,name:(wat.display_name||nm).split(',')[0],nameEn:(wat.namedetails&&(wat.namedetails['name:en']||wat.namedetails.int_name))||''}; } } }catch(_){}
      if(!out){ try{ const ll=await geocode(nm); if(ll&&isFinite(ll.lng)){ const d2=3.2; const bb='('+(ll.lat-d2).toFixed(2)+','+(ll.lng-d2).toFixed(2)+','+(ll.lat+d2).toFixed(2)+','+(ll.lng+d2).toFixed(2)+')';
        const safe=String(nm).replace(/["\\]/g,'').trim();
        const q2='[out:json][timeout:30];way["waterway"~"^(river|canal|stream)$"]["name"~"'+safe+'",i]'+bb+';out geom 300;';
        const j2=await new Promise(res=>{ fetch(_OP_EPS[0],{method:'POST',body:'data='+encodeURIComponent(q2)}).then(r2=>r2.ok?r2.json():null).then(res).catch(()=>res(null)); });
        if(j2&&Array.isArray(j2.elements)&&j2.elements.length){ const coords=[]; j2.elements.forEach(el=>{ if(el.geometry&&el.geometry.length>1) coords.push(el.geometry.map(g=>[g.lon,g.lat])); });
          if(coords.length) out={geo:{type:'MultiLineString',coordinates:coords},name:nm}; } } }catch(_){}
      }
      _riverGeoCache[key]=out; return out; }
    /* tributaries inside the basin outline: every OSM waterway=river/canal within the polygon.
       (#R66) NO "narrow your search yourself" cop-out: if one query saturates the server cap, the basin is
       AUTOMATICALLY subdivided into quadrants (real ring clips, not bboxes) and re-fetched, results merged and
       deduped by way id — big basins come back complete without the user doing anything. */
    function _basinRing(basinGeo){ let ring=null; if(basinGeo.type==='Polygon') ring=basinGeo.coordinates[0];
      else if(basinGeo.type==='MultiPolygon'){ let best=null,bl=0; basinGeo.coordinates.forEach(p2=>{ if(p2[0]&&p2[0].length>bl){ bl=p2[0].length; best=p2[0]; } }); ring=best; }
      return (ring&&ring.length>=4)?ring:null; }
    async function _tribOne(ring,cap){ const step=Math.max(1,Math.ceil(ring.length/70));
      const poly=ring.filter((_,i)=>i%step===0).map(c=>c[1].toFixed(3)+' '+c[0].toFixed(3)).join(' ');
      const q2='[out:json][timeout:60];way["waterway"~"^(river|canal)$"](poly:"'+poly+'");out geom '+cap+';';
      return await new Promise(res=>{ const tryEp=(i)=>{ if(i>=_OP_EPS.length){ res(null); return; }
        fetch(_OP_EPS[i],{method:'POST',body:'data='+encodeURIComponent(q2)}).then(r2=>r2.ok?r2.json():null).then(x=>{ if(x&&Array.isArray(x.elements)) res(x.elements); else tryEp(i+1); }).catch(()=>tryEp(i+1)); }; tryEp(0); }); }
    async function fetchTributaries(basinGeo,cap){
      try{ const CAP=cap||3000; const ring=_basinRing(basinGeo); if(!ring) return null;
        let els=await _tribOne(ring,CAP); if(els===null) return null;
        let saturated=(els.length>=CAP);
        if(saturated){
          /* subdivide: clip the basin to its bbox quadrants and fetch each part */
          const bb=fbbox(basinGeo); if(bb){ const mx=(bb[0]+bb[2])/2, my=(bb[1]+bb[3])/2;
            const quads=[[[bb[0],bb[1]],[mx,my]],[[mx,bb[1]],[bb[2],my]],[[bb[0],my],[mx,bb[3]]],[[mx,my],[bb[2],bb[3]]]];
            const parts=[]; let anySat=false;
            for(const q of quads){ const cg=_clipGeoRect(basinGeo,q); const r2=cg&&_basinRing(cg); if(!r2) continue;
              const e2=await _tribOne(r2,CAP); if(e2){ parts.push(...e2); if(e2.length>=CAP) anySat=true; } }
            if(parts.length){ els=parts; saturated=anySat; }
          }
        }
        const coords=[]; const seenIds=new Set(); let pts=0, clientCut=false;
        for(const el of els){ if(!el.geometry||el.geometry.length<2) continue; if(el.id!=null){ if(seenIds.has(el.id)) continue; seenIds.add(el.id); }
          if(pts>600000){ clientCut=true; break; }
          const line=el.geometry.map(g=>[g.lon,g.lat]); pts+=line.length; coords.push(line); }
        if(!coords.length) return null;
        return {geo:{type:'MultiLineString',coordinates:coords},n:coords.length,truncated:saturated||clientCut}; }catch(_){ return null; } }
    function _bboxSoftPoly(box){ const cx=(box[0][0]+box[1][0])/2, cy=(box[0][1]+box[1][1])/2, rx=Math.max(0.05,(box[1][0]-box[0][0])/2), ry=Math.max(0.05,(box[1][1]-box[0][1])/2); const ring=[]; for(let i=0;i<40;i++){ const a=i/40*2*Math.PI, co=Math.cos(a), si=Math.sin(a); ring.push([cx+rx*Math.sign(co)*Math.pow(Math.abs(co),0.62), cy+ry*Math.sign(si)*Math.pow(Math.abs(si),0.62)]); } ring.push([ring[0][0],ring[0][1]]); return {type:'Polygon',coordinates:[ring]}; }   /* (#R143) close the ring EXACTLY (sin(2π)≠0 left a hairline-open ring that failed the validity gate) */
    /* ===== (#R143) GEOMETRY-VALIDATION GATE + multi-region grouping for the highlight pipeline.
       The reported "南欧が巨大な三角形 / 西欧が未描画 / 4地域が同色 / 国境データではなく雑な近似図形" all trace to ONE gap:
       region names that ARE country sets were resolved as bbox/AI approximations, drawn with no per-group colour,
       no legend, and with no shape-sanity check before painting. These pure helpers (no map/network → run in the
       CI QA harness) add (a) a pre-draw validity gate that REJECTS unclosed rings, degenerate few-vertex "giant
       triangles", abnormal long edges, self-intersections, whole-world blobs and tiny slivers; (b) a real-border
       geometry builder for country-set groups; (c) a categorical palette + legend so multiple regions in one
       command are individually identifiable. ===== */
    let _hlGen=0;   /* (#R143) generation token — a slow async resolution can't overwrite a newer highlight (古い処理の遅延上書き対策) */
    function _ringSignedArea(r){ let a=0; for(let i=0,n=r.length-1;i<n;i++){ a+=(r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]); } return a/2; }
    function _ringBbox(r){ let a=180,b=90,c=-180,d=-90; for(const p of r){ if(p[0]<a)a=p[0]; if(p[0]>c)c=p[0]; if(p[1]<b)b=p[1]; if(p[1]>d)d=p[1]; } return [a,b,c,d]; }
    function _orient3(p,q,r){ return (q[1]-p[1])*(r[0]-q[0])-(q[0]-p[0])*(r[1]-q[1]); }
    /* proper crossing of two OPEN segments — shared endpoints (adjacent ring edges) do NOT count as a crossing */
    function _segProperCross(p1,p2,p3,p4){ const d1=_orient3(p3,p4,p1), d2=_orient3(p3,p4,p2), d3=_orient3(p1,p2,p3), d4=_orient3(p1,p2,p4);
      return (((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))); }
    function _ringSelfIntersects(r){ const n=r.length-1; if(n<4) return false;
      for(let i=0;i<n;i++){ for(let j=i+2;j<n;j++){ if(i===0&&j===n-1) continue;   /* the closing edge is adjacent to edge 0 */
        if(_segProperCross(r[i],r[i+1],r[j],r[j+1])) return true; } } return false; }
    /* the gate. opts.trusted = geometry from REAL national/OSM borders → skip the crude-approximation heuristics
       (a dense real coastline can legitimately look "spiky"); untrusted (AI/derived/soft box) gets the full battery.
       opts.autoclose closes an open ring in place instead of rejecting it. Returns {ok, reason, area, points}. */
    function _validGeo(gm,opts){ opts=opts||{}; try{
      if(!gm||typeof gm!=='object') return {ok:false,reason:'no-geometry'};
      const t=gm.type; if(t!=='Polygon'&&t!=='MultiPolygon') return {ok:false,reason:'not-polygon'};
      const polys=(t==='Polygon')?[gm.coordinates]:gm.coordinates; if(!polys||!polys.length) return {ok:false,reason:'empty'};
      const trusted=!!opts.trusted; let area=0, any=false, maxPts=0;
      for(const poly of polys){ if(!poly||!poly.length) continue;
        for(let ri=0; ri<poly.length; ri++){ const ring=poly[ri]; if(!Array.isArray(ring)||!ring.length) return {ok:false,reason:'bad-ring'};
          if(ring.length<4) return {ok:false,reason:'ring-too-small'};
          const a=ring[0], z=ring[ring.length-1]; if(!a||!z||a.length<2) return {ok:false,reason:'bad-vertex'};
          if(a[0]!==z[0]||a[1]!==z[1]){ if(opts.autoclose) ring.push([a[0],a[1]]); else return {ok:false,reason:'unclosed-ring'}; }
          any=true; maxPts=Math.max(maxPts,ring.length);
          if(ri===0){ area+=Math.abs(_ringSignedArea(ring));
            if(!trusted){ const bb=_ringBbox(ring), diag=Math.hypot(bb[2]-bb[0],bb[3]-bb[1]);
              const distinct=(()=>{ const s=new Set(); for(let i=0;i<ring.length-1;i++) s.add(ring[i][0].toFixed(3)+','+ring[i][1].toFixed(3)); return s.size; })();
              if(distinct<=4 && diag>3) return {ok:false,reason:'degenerate-triangle'};              /* a 3–4 point shape spanning >~330 km = crude blob */
              if(ring.length<=12 && diag>2){ let me=0; for(let i=1;i<ring.length;i++){ const e=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]); if(e>me) me=e; } if(me>diag*0.7) return {ok:false,reason:'long-edge'}; }
              if(ring.length<=80 && _ringSelfIntersects(ring)) return {ok:false,reason:'self-intersecting'}; } } } }
      if(!any) return {ok:false,reason:'empty'};
      const bb=fbbox(gm); if(bb && (bb[2]-bb[0])>350 && (bb[3]-bb[1])>150) return {ok:false,reason:'whole-world'};
      if(!opts.allowTiny && area < (opts.minArea!=null?opts.minArea:1e-4)) return {ok:false,reason:'too-tiny'};
      return {ok:true, area, points:maxPts}; }catch(e){ return {ok:false,reason:'threw:'+((e&&e.message)||e)}; } }
    /* MultiPolygon of the REAL national borders for a set of ISO3 codes (from window.countryGeo). Fill renders the
       whole set; internal member borders are kept faint by the comp:1 flag on the paint layer. */
    function _codesGeo(codes){ try{ const g=geo(); const list=(codes||[]).map(String);
      if(!g||!g.features) return {geo:null,hit:[],miss:list.slice()};
      const want=new Set(list); const hit=[]; const polys=[];
      g.features.forEach(f=>{ const p=f.properties||{}; const id=String(p.__code!=null?p.__code:(f.id!=null?f.id:'')); if(!want.has(id)) return; const gm=f.geometry; if(!gm) return;
        if(gm.type==='Polygon') polys.push(gm.coordinates); else if(gm.type==='MultiPolygon') gm.coordinates.forEach(pp=>polys.push(pp)); if(hit.indexOf(id)<0) hit.push(id); });
      return {geo:polys.length?{type:'MultiPolygon',coordinates:polys}:null, hit, miss:list.filter(c=>hit.indexOf(c)<0)}; }catch(_){ return {geo:null,hit:[],miss:(codes||[]).map(String)}; } }
    /* (#R157) ============ GPT-DECIDED HIGHLIGHT TARGETS (the meaning/execution split) ============
       The natural-language MEANING of a highlight target — a country set ("ゲルマン諸国"/"Slavic countries"/"the
       English-speaking world"/"major oil producers"/"OPEC") — is interpreted by the MODEL, which returns the
       EXPLICIT member countries with ISO 3166-1 alpha-3 codes. The code's ONLY job here is to VALIDATE those codes
       against the real country-border data (window.countryGeo) and later draw real borders. There is NO concept
       dictionary, alias table or regionGroup lookup on this path — that hard-coded meaning-guessing running BEFORE
       the model was the reported root cause ("ゲルマン諸国" failed as one unfound place). The ISO/M49/border data
       survive only as DETERMINISTIC VALIDATION for the model's output, never as a meaning dictionary.
       `_hlValidCodeSet` = the set of ISO3 codes that map to a real border feature; `_hlReadGptGroups` reads the
       model's structured output into validated code groups. Returns null when the model gave NO structured codes
       (→ the request falls through to the concrete place-name resolver for genuine single features: admin regions,
       rivers, basins, natural regions). Pure (needs only window.countryGeo + countryStats) → CI-testable. */
    function _hlValidCodeSet(){ const s=new Set(); try{ const g=geo(); (g&&g.features||[]).forEach(f=>{ const p=f.properties||{}; if(p.__code!=null) s.add(String(p.__code).toUpperCase()); if(f.id!=null) s.add(String(f.id).toUpperCase()); }); }catch(_){} return s; }
    function _hlReadGptGroups(a){ try{ if(!a||typeof a!=='object') return null;
      const norm3=v=>{ v=String(v==null?'':v).trim().toUpperCase(); return /^[A-Z]{3}$/.test(v)?v:''; };
      const readT=t=>{ if(t==null) return null;
        if(typeof t==='string'){ const c=norm3(t); return {iso3:c,name:c?'':t.trim()}; }
        if(typeof t==='object'){ const c=norm3(t.iso3||t.iso||t.code||t.c||t.id||t.a3); const n=String(t.name||t.n||t.country||t.label||'').trim(); return (c||n)?{iso3:c,name:n}:null; }
        return null; };
      const rawGroups=[];
      if(Array.isArray(a.groups)&&a.groups.length){   /* several distinctly-coloured concept sets in one command */
        a.groups.forEach(g=>{ if(!g||typeof g!=='object') return; const src=Array.isArray(g.targets)?g.targets:(Array.isArray(g.iso3)?g.iso3:(Array.isArray(g.codes)?g.codes:(Array.isArray(g.countries)?g.countries:[]))); const ts=src.map(readT).filter(Boolean); if(ts.length) rawGroups.push({label:String(g.label||g.interpretation||g.name||'').trim(),targets:ts}); });
      } else {
        let src=Array.isArray(a.targets)?a.targets:(Array.isArray(a.iso3)?a.iso3:(Array.isArray(a.codes)?a.codes:null));
        /* a bare ISO3 array smuggled into "countries" (every entry a valid 3-letter code) also counts as GPT targets;
           a NAME array or a concept STRING does NOT — those fall through to the legacy concrete-place resolver. */
        if(!src&&Array.isArray(a.countries)&&a.countries.length&&a.countries.every(x=>norm3(x))) src=a.countries;
        if(src){ const ts=src.map(readT).filter(Boolean); if(ts.length) rawGroups.push({label:String(a.interpretation||'').trim(),targets:ts}); }
      }
      if(!rawGroups.length) return null;
      const valid=_hlValidCodeSet();
      /* (#R158 · Terra is the decision-maker, IntMap the faithful executor) OBSERVE, don't CORRECT. A valid ISO3 Terra chose
         is executed AS-IS. A blank/invalid ISO3 is NEITHER silently rescued from the name NOR silently dropped — it is
         returned to Terra as UNRESOLVED, tagged with a machine reason and (if the name deterministically maps to one) a
         candidate identifier that is REPORTED, never applied. Terra then decides: re-issue with the right code, re-search,
         ask, or adopt the partial. This replaces the old resolveCountrySync auto-correction the work order removed. */
      return rawGroups.map(g=>{ const codes=[],unresolved=[],seen=new Set();
        g.targets.forEach(t=>{ const gi=t.iso3||'';
          if(gi&&valid.has(gi)){ if(!seen.has(gi)){ seen.add(gi); codes.push(gi); } return; }   /* Terra's identifier is valid → execute faithfully */
          let available=[]; if(t.name){ try{ const c=resolveCountrySync(t.name); if(c&&c.code&&valid.has(String(c.code).toUpperCase())) available=[String(c.code).toUpperCase()]; }catch(_){} }
          unresolved.push({name:t.name||'', iso3:gi, reason:(gi?'iso3_not_in_border_data':(t.name?'no_iso3_provided':'empty_target')), availableIdentifiers:available}); });
        return {label:g.label,codes,unresolved}; }); }catch(_){ return null; } }
    /* categorical palette — distinct, reasonably colour-blind-aware, muted enough to sit on the basemap */
    const _HL_PALETTE=['#e6550d','#3182bd','#31a354','#756bb1','#d6616b','#17a2b8','#bd9e39','#8c6d31','#e377c2','#637939','#843c39','#5254a3'];
    function _hlPaletteColor(i){ const n=_HL_PALETTE.length; return _HL_PALETTE[((i%n)+n)%n]; }
    /* directional-Europe aliases (5 languages) → the UN M49 English sub-region key */
    const _DIR_EU_ALIAS={ '東欧':'eastern europe','西欧':'western europe','南欧':'southern europe','北欧':'northern europe',
      '東ヨーロッパ':'eastern europe','西ヨーロッパ':'western europe','南ヨーロッパ':'southern europe','北ヨーロッパ':'northern europe',
      'eastern europe':'eastern europe','western europe':'western europe','southern europe':'southern europe','northern europe':'northern europe',
      'east europe':'eastern europe','west europe':'western europe','south europe':'southern europe','north europe':'northern europe',
      'osteuropa':'eastern europe','westeuropa':'western europe','südeuropa':'southern europe','sudeuropa':'southern europe','nordeuropa':'northern europe',
      'восточная европа':'eastern europe','западная европа':'western europe','южная европа':'southern europe','северная европа':'northern europe',
      'europa oriental':'eastern europe','europa occidental':'western europe','europa del sur':'southern europe','europa meridional':'southern europe','europa del norte':'northern europe','europa septentrional':'northern europe' };
    /* expand compound directional forms ("東西南北欧" → 4 regions, "南北アメリカ" → 2) and, when TWO OR MORE of the
       four directional-Europe regions are named together, canonicalise them to the M49 partition (so 北欧 — which
       alone means the Nordic countries — becomes M49 Northern Europe HERE → a gap-free, non-overlapping 4-way split). */
    function _expandRegionCompound(list){ try{
      const out=[]; const push=v=>{ v=String(v||'').trim(); if(v) out.push(v); };
      (list||[]).forEach(tok=>{ const t=String(tok||'').trim();
        if(/^東西南北(欧|ヨーロッパ)$/.test(t)){ push('western europe'); push('eastern europe'); push('southern europe'); push('northern europe'); return; }
        if(/^東西(欧|ヨーロッパ)$/.test(t)){ push('western europe'); push('eastern europe'); return; }
        if(/^南北(欧|ヨーロッパ)$/.test(t)){ push('southern europe'); push('northern europe'); return; }
        if(/^南北(アメリカ|米)$/.test(t)){ push('north america'); push('south america'); return; }
        push(t); });
      const named=out.filter(t=>_DIR_EU_ALIAS[_lnorm(t)]);
      if(named.length>=2) return out.map(t=>{ const k=_DIR_EU_ALIAS[_lnorm(t)]; return k||t; });
      return out; }catch(_){ return (list||[]).slice(); } }
    /* localized display labels for the M49 region keys (the resolver works in lowercase English keys; the reply
       should read in the user's language — 「西ヨーロッパ」 not "western europe"). Non-M49 names pass through unchanged. */
    const M49_LABELS={
      'western europe':LA('Western Europe','西ヨーロッパ','Westeuropa','Западная Европа','Europa Occidental'),
      'eastern europe':LA('Eastern Europe','東ヨーロッパ','Osteuropa','Восточная Европа','Europa Oriental'),
      'southern europe':LA('Southern Europe','南ヨーロッパ','Südeuropa','Южная Европа','Europa Meridional'),
      'northern europe':LA('Northern Europe','北ヨーロッパ','Nordeuropa','Северная Европа','Europa Septentrional'),
      'europe':LA('Europe','ヨーロッパ','Europa','Европа','Europa'),
      'north america':LA('Northern America','北アメリカ','Nordamerika','Северная Америка','América del Norte'),
      'south america':LA('South America','南アメリカ','Südamerika','Южная Америка','América del Sur'),
      'caribbean':LA('Caribbean','カリブ','Karibik','Карибский бассейн','Caribe'),
      'north africa':LA('Northern Africa','北アフリカ','Nordafrika','Северная Африка','África del Norte'),
      'west africa':LA('Western Africa','西アフリカ','Westafrika','Западная Африка','África Occidental'),
      'east africa':LA('Eastern Africa','東アフリカ','Ostafrika','Восточная Африка','África Oriental'),
      'central africa':LA('Middle Africa','中部アフリカ','Zentralafrika','Центральная Африка','África Central'),
      'southern africa':LA('Southern Africa','南部アフリカ','Südliches Afrika','Южная Африка','África Austral'),
      'western asia':LA('Western Asia','西アジア','Vorderasien','Западная Азия','Asia Occidental'),
      'oceania':LA('Oceania','オセアニア','Ozeanien','Океания','Oceanía'),
      'melanesia':LA('Melanesia','メラネシア','Melanesien','Меланезия','Melanesia'),
      'micronesia':LA('Micronesia','ミクロネシア','Mikronesien','Микронезия','Micronesia'),
      'polynesia':LA('Polynesia','ポリネシア','Polynesien','Полинезия','Polinesia'),
      'australia and new zealand':LA('Australia & New Zealand','オーストラリア・ニュージーランド','Australien & Neuseeland','Австралия и Новая Зеландия','Australia y Nueva Zelanda') };
    function _regionLabel(nm){ try{ const e=M49_LABELS[_lnorm(nm)]; return e?L(e[0],e[1],e[2],e[3],e[4]):String(nm||''); }catch(_){ return String(nm||''); } }
    /* colour-swatch legend for a multi-region highlight (凡例) */
    function _hlLegendHtml(groups){ try{ if(!groups||!groups.length) return '';
      const rows=groups.map(g=>{ const sw='<span style="display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin-right:6px;background:'+esc(g.color||_hlColor)+';"></span>';
        const meta=[]; if(g.nCountries) meta.push(g.nCountries+' '+L('countries','か国','Länder','стран','países')); if(g.basisShort) meta.push(g.basisShort);
        return '<div style="display:flex;align-items:center;font-size:11.5px;margin:2px 0;line-height:1.5;">'+sw+'<b>'+esc(g.displayName||g.name||'')+'</b>'+(meta.length?('<span style="color:var(--text-muted);margin-left:6px;">— '+esc(meta.join(' · '))+'</span>'):'')+'</div>'; });
      return '<div style="margin:4px 0 2px;">'+rows.join('')+'</div>'; }catch(_){ return ''; } }
    /* (#R143) POST-DRAW verification — the pipeline's "実状態検証" step: confirm the source + layer exist and the
       source actually carries the expected feature count before the reply may claim success. */
    function _verifyPolyPaint(expected){ try{ if(!GE()||!GE().hasRenderer()) return {ok:false,reason:'no-map',n:0};
      if(!GE().layers.has('nlq-poly-fill')) return {ok:false,reason:'no-layer',n:0};
      if(!GE().layers.hasSource('nlq-poly-src')) return {ok:false,reason:'no-source',n:0};
      let n=-1; try{ const d=GE().layers.sourceData('nlq-poly-src'); if(d&&Array.isArray(d.features)) n=d.features.length; }catch(_){}
      /* n===-1 → couldn't introspect the source (older maplibre) → trust our own _hlPolys bookkeeping instead */
      const cnt=(n>=0)?n:_hlPolys.length;
      return {ok:(cnt>=expected), n:cnt, expected, layer:true, source:true}; }catch(e){ return {ok:false,reason:'threw',n:0}; } }
    /* fit to a set of drawn group features, dropping any single group whose own bbox wraps the antimeridian
       (e.g. Eastern Europe includes Russia) so the fit still frames the rest instead of silently not moving. */
    function _fitGroups(feats){ try{ let a=180,b=90,c=-180,d=-90,any=false;
      (feats||[]).forEach(f=>{ const bb=fbbox(f.geo); if(!bb) return; if((bb[2]-bb[0])>180) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); });
      if(any&&isFinite(a)&&(c-a)<350){ try{ GE().camera.fitBounds([[a,b],[c,d]],{padding:60,maxZoom:6.5,duration:900}); return true; }catch(_){} } }catch(_){} return false; }
    /* ==== (#R64) REAL region composition ("こんなカクカクポリゴンで許されると思うなよ。実際の範囲に忠実に、正確で
       高精細なポリゴンを引け"). A fuzzy/regional name is now resolved to a UNION OF REAL BOUNDARIES instead of a
       hand-waved outline: (a) country GROUPS (旧ソ連諸国, EU, NATO…) → the exact national polygons the map already
       has; (b) curated COMPOSITIONS (東海地方, ベッサラビア, チェルノーゼム, 肥沃な三日月帯…) → the member admin
       units' actual OSM boundary polygons (Nominatim polygon_geojson, fine threshold), optionally clipped to the
       member's own directional part; (c) unknown names → the AI (grounded in a live Wikipedia lookup) names the
       member admin units and the same real-boundary composition runs. The old 12-30-vertex traced outline survives
       only as the LAST resort, and is labelled as approximate. ==== */
    const _unitPolyCache={}, _composeCache={};
    /* Nominatim allows ~1 request/second — a burst of 30+ member-unit fetches got rate-limited and half the
       chernozem belt silently dropped. All unit fetches go through ONE throttled gate (1.05 s spacing), transient
       failures are retried once and NEVER cached (only real polygons are). */
    let _nomGate=Promise.resolve();
    function _nomSlot(){ const p=_nomGate.then(()=>new Promise(r=>setTimeout(r,1050))); _nomGate=p.catch(()=>{}); return p; }
    async function _fetchUnitPoly(q,thr){ const key=q+'|'+thr; if(_unitPolyCache[key]!==undefined) return _unitPolyCache[key];
      for(let att=0;att<2;att++){
        await _nomSlot();
        try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&polygon_geojson=1&polygon_threshold='+thr+'&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
          if(!r.ok){ continue; }
          const j=await r.json();
          if(Array.isArray(j)&&j.length){ const best=j.filter(o=>o.geojson&&/Polygon/.test((o.geojson.type||''))).sort((x,y)=>((+y.importance||0)+_classBonus(y))-((+x.importance||0)+_classBonus(x)))[0];
            if(best){ const out={geo:best.geojson,name:(best.display_name||q).split(',')[0]}; _unitPolyCache[key]=out; return out; } }
          if(Array.isArray(j)) { _unitPolyCache[key]=null; return null; }   /* real "no such polygon" answer — cache it */
        }catch(_){}
      }
      return null; }
    function _cgPoly(iso3){ try{ const g=geo(); if(!g||!g.features) return null; const f=g.features.find(f2=>String(f2.id)===String(iso3)); return (f&&f.geometry)?{geo:f.geometry,name:String(iso3)}:null; }catch(_){ return null; } }
    /* Fallback boundary source when Nominatim is rate-limiting: geoBoundaries ADM1 (CC-BY, GitHub raw, CORS-open,
       no rate limit) — one file per country, fuzzy shapeName match ("Odesa"~"Odessa", "Region"/"Oblast" stripped). */
    const _gbCache={};
    async function _gbAdm1(iso3){ if(_gbCache[iso3]!==undefined) return _gbCache[iso3]; let out=null;
      try{ const mr=await fetch('https://www.geoboundaries.org/api/current/gbOpen/'+encodeURIComponent(iso3)+'/ADM1/'); if(mr.ok){ const meta=await mr.json();
        let u=meta&&(meta.simplifiedGeometryGeoJSON||meta.gjDownloadURL);
        /* github.com/.../raw/ 302s without CORS, and raw.githubusercontent serves only the Git-LFS POINTER for
           these files — the real LFS content with ACAO:* lives on media.githubusercontent.com/media/. */
        if(u) u=u.replace(/^https:\/\/github\.com\/wmgeolab\/geoBoundaries\/raw\//,'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/');
        if(u){ const r=await fetch(u); if(r.ok) out=await r.json(); } } }catch(_){}
      _gbCache[iso3]=(out&&out.features)?out:null; return _gbCache[iso3]; }
    const _normUnit=s=>String(s||'').toLowerCase().replace(/\b(oblast|region|krai|kray|governorate|province|district|raion|county|prefecture|voblast|state)\b/g,'').replace(/[^a-zа-яё぀-ヿ一-鿿]/gi,'');
    function _edit2(a,b){ if(Math.abs(a.length-b.length)>2) return false; const dp=[]; for(let i=0;i<=a.length;i++){ dp[i]=[i]; for(let j=1;j<=b.length;j++){ dp[i][j]=(i===0)?j:Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); } } return dp[a.length][b.length]<=2; }
    async function _gbUnitPoly(q){ const parts=String(q||'').split(','); if(parts.length<2) return null;
      const c=resolveCountrySync(parts[parts.length-1].trim()); if(!c||!c.code) return null;
      const gj=await _gbAdm1(c.code); if(!gj) return null;
      const want=_normUnit(parts[0]); if(!want) return null;
      let best=null; for(const f of gj.features){ const nm=_normUnit((f.properties||{}).shapeName); if(!nm) continue;
        if(nm===want){ best=f; break; }
        if(!best&&(nm.indexOf(want)===0||want.indexOf(nm)===0||_edit2(nm,want))) best=f; }
      return (best&&best.geometry)?{geo:best.geometry,name:(best.properties||{}).shapeName||parts[0]}:null; }
    /* Sutherland–Hodgman clip of a (Multi)Polygon against a lng/lat rectangle — used for "part of an admin unit"
       members (e.g. western Homs): the kept edges are the REAL boundary, only the cut is straight. */
    function _clipGeoRect(geoIn,box){ if(!geoIn||!box) return null;
      const W=box[0][0],S=box[0][1],E=box[1][0],N=box[1][1];
      const passes=[[p=>p[0]>=W,(a,b)=>{const t=(W-a[0])/((b[0]-a[0])||1e-12);return [W,a[1]+(b[1]-a[1])*t];}],
                    [p=>p[0]<=E,(a,b)=>{const t=(E-a[0])/((b[0]-a[0])||1e-12);return [E,a[1]+(b[1]-a[1])*t];}],
                    [p=>p[1]>=S,(a,b)=>{const t=(S-a[1])/((b[1]-a[1])||1e-12);return [a[0]+(b[0]-a[0])*t,S];}],
                    [p=>p[1]<=N,(a,b)=>{const t=(N-a[1])/((b[1]-a[1])||1e-12);return [a[0]+(b[0]-a[0])*t,N];}]];
      const clipRing=ring=>{ let out=ring.slice(); if(out.length&&out[0][0]===out[out.length-1][0]&&out[0][1]===out[out.length-1][1]) out=out.slice(0,-1);
        for(const [inside,isect] of passes){ const nxt=[]; for(let i=0;i<out.length;i++){ const a=out[i],b=out[(i+1)%out.length]; const ai=inside(a),bi=inside(b);
            if(ai){ nxt.push(a); if(!bi) nxt.push(isect(a,b)); } else if(bi){ nxt.push(isect(a,b)); } }
          out=nxt; if(out.length<3) return null; }
        out.push([out[0][0],out[0][1]]); return out; };
      const polys=geoIn.type==='Polygon'?[geoIn.coordinates]:geoIn.type==='MultiPolygon'?geoIn.coordinates:[];
      const res=[]; polys.forEach(rings=>{ if(!rings||!rings[0]) return; const outer=clipRing(rings[0]); if(!outer) return; const kept=[outer];
        for(let k=1;k<rings.length;k++){ const h=clipRing(rings[k]); if(h) kept.push(h); } res.push(kept); });
      if(!res.length) return null; return res.length===1?{type:'Polygon',coordinates:res[0]}:{type:'MultiPolygon',coordinates:res}; }
    function _mergeGeos(gs){ const coords=[]; (gs||[]).forEach(g=>{ if(!g) return; if(g.type==='Polygon') coords.push(g.coordinates); else if(g.type==='MultiPolygon') g.coordinates.forEach(c=>coords.push(c)); }); return coords.length?{type:'MultiPolygon',coordinates:coords}:null; }
    async function composeRegion(spec,cacheKey){ if(cacheKey&&_composeCache[cacheKey]) return _composeCache[cacheKey];
      const units=(spec.units||[]).slice(0,44); const thr=units.length>8?0.01:0.002;
      const geos=[]; let okN=0; const total=units.length+((spec.iso||[]).length);
      (spec.iso||[]).forEach(cd=>{ const p=_cgPoly(cd); if(p&&p.geo){ geos.push(p.geo); okN++; } });
      let idx=0; const work=async()=>{ while(idx<units.length){ const u=units[idx++]; if(!u||!u.q) continue;
        let p=await _fetchUnitPoly(u.q,thr); if(!p){ try{ p=await _gbUnitPoly(u.q); }catch(_){} }
        if(p&&p.geo){ let g=p.geo;
          if(u.part){ const bb=fbbox(g); if(bb){ const cg=_clipGeoRect(g,sliceBox([[bb[0],bb[1]],[bb[2],bb[3]]],u.part)); if(cg) g=cg; } }
          geos.push(g); okN++; } } };
      const workers=[]; for(let w=0;w<3&&w<units.length;w++) workers.push(work()); await Promise.all(workers);
      const merged=_mergeGeos(geos); if(!merged) return null;
      const out={geo:merged,n:okN,total};
      /* cache only COMPLETE compositions — a partial one recomputes next call (unit successes are cached individually, so the retry only refetches what failed). */
      if(cacheKey&&okN>=total) _composeCache[cacheKey]=out; return out; }
    /* country GROUPS → exact national boundaries (ISO3 = countryGeo feature ids) */
    const _USSR=['RUS','UKR','BLR','MDA','GEO','ARM','AZE','KAZ','KGZ','TJK','TKM','UZB','EST','LVA','LTU'];
    const _EU=['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE'];
    const REGION_GROUPS={
      'former ussr':_USSR,'former soviet union':_USSR,'ex-ussr':_USSR,'post-soviet states':_USSR,'ussr':_USSR,'soviet union':_USSR,
      'eu':_EU,'european union':_EU,
      'nato':['ALB','BEL','BGR','CAN','HRV','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL','ITA','LVA','LTU','LUX','MNE','NLD','MKD','NOR','POL','PRT','ROU','SVK','SVN','ESP','SWE','TUR','GBR','USA'],
      'asean':['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','VNM'],
      'former yugoslavia':['SRB','HRV','SVN','BIH','MKD','MNE','XKX','KOS'],
      'warsaw pact':['POL','CZE','SVK','HUN','ROU','BGR','ALB'].concat(_USSR),
      'baltics':['EST','LVA','LTU'],'baltic states':['EST','LVA','LTU'],
      'nordics':['DNK','NOR','SWE','FIN','ISL'],'nordic countries':['DNK','NOR','SWE','FIN','ISL'],
      'benelux':['BEL','NLD','LUX'],
      'maghreb':['MAR','DZA','TUN','LBY','MRT','ESH'],
      'gcc':['SAU','KWT','BHR','QAT','ARE','OMN'],'gulf states':['SAU','KWT','BHR','QAT','ARE','OMN'],
      'g7':['USA','CAN','GBR','FRA','DEU','ITA','JPN'],
      'brics':['BRA','RUS','IND','CHN','ZAF','EGY','ETH','IRN','ARE'],
      'central america':['GTM','BLZ','SLV','HND','NIC','CRI','PAN'],
      'balkans':['ALB','BIH','BGR','HRV','GRC','MKD','MNE','ROU','SRB','SVN','XKX','KOS'],
      'levant':['SYR','LBN','ISR','PSE','JOR'],
      'horn of africa':['ETH','ERI','DJI','SOM'],
      'middle east':['BHR','CYP','EGY','IRN','IRQ','ISR','JOR','KWT','LBN','OMN','PSE','QAT','SAU','SYR','TUR','ARE','YEM'],
      'east asia':['CHN','JPN','KOR','PRK','MNG','TWN'],
      'southeast asia':['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','VNM','TLS'],
      'south asia':['IND','PAK','BGD','LKA','NPL','BTN','MDV','AFG'],
      'central asia':['KAZ','KGZ','TJK','TKM','UZB'],
      'latin america':['MEX','GTM','BLZ','SLV','HND','NIC','CRI','PAN','CUB','DOM','HTI','JAM','COL','VEN','ECU','PER','BOL','PRY','CHL','ARG','URY','BRA','GUY','SUR'],
      'scandinavia':['DNK','NOR','SWE'],
      /* (#R143) UN M49 geoscheme sub-regions → REAL national boundaries. These are the STANDARD country-set
         definitions ("東西南北欧", "Western Europe", "Sub-Saharan sub-regions"…): a region that IS a country set
         must draw from official borders, not a bbox/AI blob. Keys reuse the REGION_BBOX macro-region names so the
         5-language REGION_ALIASES already defined below bridge the localized names automatically (see regionGroup).
         M49 Europe is a clean DISJOINT partition (every European country in exactly one) → the four highlight as
         four distinct, gap-free, non-overlapping colour groups. */
      'western europe':['AUT','BEL','FRA','DEU','LIE','LUX','MCO','NLD','CHE'],
      'eastern europe':['BLR','BGR','CZE','HUN','POL','MDA','ROU','RUS','SVK','UKR'],
      'southern europe':['ALB','AND','BIH','HRV','GIB','GRC','VAT','ITA','MLT','MNE','MKD','PRT','SMR','SRB','SVN','ESP'],
      'northern europe':['DNK','EST','FIN','ISL','IRL','LVA','LTU','NOR','SWE','GBR','FRO'],
      'north america':['BMU','CAN','GRL','USA','SPM'],
      'south america':['ARG','BOL','BRA','CHL','COL','ECU','FLK','GUF','GUY','PRY','PER','SUR','URY','VEN'],
      'caribbean':['ATG','BHS','BRB','CUB','DMA','DOM','GRD','HTI','JAM','KNA','LCA','VCT','TTO','PRI'],
      'north africa':['DZA','EGY','LBY','MAR','SDN','TUN','ESH'],
      'west africa':['BEN','BFA','CPV','CIV','GMB','GHA','GIN','GNB','LBR','MLI','MRT','NER','NGA','SEN','SLE','TGO'],
      'east africa':['BDI','COM','DJI','ERI','ETH','KEN','MDG','MWI','MUS','MOZ','RWA','SYC','SOM','SSD','TZA','UGA','ZMB','ZWE'],
      'central africa':['AGO','CMR','CAF','TCD','COG','COD','GNQ','GAB','STP'],
      'southern africa':['BWA','SWZ','LSO','NAM','ZAF'],
      'western asia':['ARM','AZE','BHR','CYP','GEO','IRQ','ISR','JOR','KWT','LBN','OMN','QAT','SAU','PSE','SYR','TUR','ARE','YEM'],
      'australia and new zealand':['AUS','NZL'],
      'melanesia':['FJI','NCL','PNG','SLB','VUT'],
      'micronesia':['FSM','GUM','KIR','MHL','NRU','MNP','PLW'],
      'polynesia':['ASM','COK','PYF','NIU','WSM','TON','TUV','TKL','WLF'] };
    /* whole-Europe as a country set = the union of the four M49 sub-regions (so "ヨーロッパをハイライト" draws every
       European country, not a rectangle). Assigned after the literal since an object literal can't self-reference. */
    try{ REGION_GROUPS['europe']=[].concat(REGION_GROUPS['western europe'],REGION_GROUPS['eastern europe'],REGION_GROUPS['southern europe'],REGION_GROUPS['northern europe']);
      REGION_GROUPS['oceania']=[].concat(REGION_GROUPS['australia and new zealand'],REGION_GROUPS['melanesia'],REGION_GROUPS['micronesia'],REGION_GROUPS['polynesia']); }catch(_){}
    const GROUP_ALIASES={
      '旧ソ連':'former ussr','旧ソ連諸国':'former ussr','旧ソビエト連邦':'former ussr','ソ連':'ussr','ソビエト連邦':'ussr','旧ソ連構成国':'former ussr',
      'ehemalige sowjetunion':'former ussr','ehemalige udssr':'former ussr','udssr':'ussr','postsowjetische staaten':'former ussr',
      'бывший ссср':'former ussr','бывший советский союз':'former ussr','ссср':'ussr','постсоветские страны':'former ussr','постсоветское пространство':'former ussr','страны бывшего ссср':'former ussr',
      'antigua unión soviética':'former ussr','ex unión soviética':'former ussr','urss':'ussr','antigua urss':'former ussr',
      'eu諸国':'eu','eu加盟国':'eu','欧州連合':'eu','europäische union':'eu','евросоюз':'eu','ес':'eu','unión europea':'eu','ue':'eu',
      'nato加盟国':'nato','北大西洋条約機構':'nato','нато':'nato','otan':'nato',
      '東南アジア諸国連合':'asean','アセアン':'asean','асеан':'asean',
      '旧ユーゴスラビア':'former yugoslavia','ユーゴスラビア':'former yugoslavia','旧ユーゴ':'former yugoslavia','ehemaliges jugoslawien':'former yugoslavia','jugoslawien':'former yugoslavia','бывшая югославия':'former yugoslavia','югославия':'former yugoslavia','antigua yugoslavia':'former yugoslavia','yugoslavia':'former yugoslavia',
      'ex-yugoslavia':'former yugoslavia','ex yugoslavia':'former yugoslavia','ex-jugoslawien':'former yugoslavia','successor states of yugoslavia':'former yugoslavia','yugoslav successor states':'former yugoslavia',   /* (#R123) ex-/former- variants that don't fit the collective-suffix strip */
      'ワルシャワ条約機構':'warsaw pact','warschauer pakt':'warsaw pact','варшавский договор':'warsaw pact','pacto de varsovia':'warsaw pact',
      'バルト三国':'baltics','バルト諸国':'baltics','baltikum':'baltics','прибалтика':'baltics','страны балтии':'baltics','países bálticos':'baltics',
      '北欧諸国':'nordics','北欧':'nordics','nordische länder':'nordics','северные страны':'nordics','países nórdicos':'nordics',
      'ベネルクス':'benelux','ベネルクス三国':'benelux','бенилюкс':'benelux',
      'マグレブ':'maghreb','マグリブ':'maghreb','магриб':'maghreb','magreb':'maghreb',
      '湾岸諸国':'gcc','湾岸協力会議':'gcc','ペルシャ湾岸諸国':'gcc','golfstaaten':'gcc','страны залива':'gcc','países del golfo':'gcc',
      '主要7か国':'g7','g7諸国':'g7','большая семёрка':'g7',
      'ブリックス':'brics','брикс':'brics',
      '中央アメリカ':'central america','中米':'central america','zentralamerika':'central america','центральная америка':'central america','américa central':'central america','centroamérica':'central america',
      'バルカン諸国':'balkans','バルカン半島諸国':'balkans','balkanländer':'balkans','балканские страны':'balkans','países balcánicos':'balkans',
      'レバント':'levant','レヴァント':'levant','levante':'levant','левант':'levant',
      'アフリカの角':'horn of africa','horn von afrika':'horn of africa','африканский рог':'horn of africa','рог африки':'horn of africa','cuerno de áfrica':'horn of africa',
      '中東諸国':'middle east','東アジア諸国':'east asia','東南アジア諸国':'southeast asia','南アジア諸国':'south asia','中央アジア諸国':'central asia','ラテンアメリカ諸国':'latin america','中南米':'latin america',
      'スカンジナビア諸国':'scandinavia','スカンディナヴィア':'scandinavia',
      /* (#R143) 5-language names for the new M49 country-set groups (the European four are already in REGION_ALIASES) */
      '北アメリカ':'north america','北米諸国':'north america','nordamerika':'north america','северная америка':'north america','américa del norte':'north america','norteamérica':'north america',
      '南アメリカ':'south america','南米諸国':'south america','südamerika':'south america','sudamerika':'south america','южная америка':'south america','américa del sur':'south america','sudamérica':'south america','suramérica':'south america',
      'カリブ諸国':'caribbean','karibik':'caribbean','карибский бассейн':'caribbean','карибы':'caribbean','caribe':'caribbean',
      '西アフリカ':'west africa','westafrika':'west africa','западная африка':'west africa','áfrica occidental':'west africa',
      '東アフリカ':'east africa','ostafrika':'east africa','восточная африка':'east africa','áfrica oriental':'east africa',
      '中央アフリカ':'central africa','中部アフリカ':'central africa','zentralafrika':'central africa','центральная африка':'central africa','áfrica central':'central africa',
      '南部アフリカ':'southern africa','das südliche afrika':'southern africa','южная африка':'southern africa','áfrica austral':'southern africa','áfrica meridional':'southern africa',
      '西アジア':'western asia','vorderasien':'western asia','westasien':'western asia','западная азия':'western asia','asia occidental':'western asia',
      'オセアニア':'oceania','ozeanien':'oceania','океания':'oceania','oceanía':'oceania',
      'メラネシア':'melanesia','melanesien':'melanesia','меланезия':'melanesia',
      'ミクロネシア':'micronesia','mikronesien':'micronesia','микронезия':'micronesia',
      'ポリネシア':'polynesia','polynesien':'polynesia','полинезия':'polynesia',
      'オーストラリアとニュージーランド':'australia and new zealand','australia and nz':'australia and new zealand','anzac':'australia and new zealand',
      'europa del sur':'southern europe','europa meridional':'southern europe','europa del norte':'northern europe','europa septentrional':'northern europe' };
    /* (#R118) BASIS metadata for groups whose membership is HISTORICAL (dissolved orgs / former states): the reply
       and the working context state explicitly what the highlight means — "members of the 1955–1991 alliance shown
       as today's successor territories" — so a follow-up "それは何年のもの？" has a real answer instead of the
       time-travel date (the reported Warsaw-Pact loop). */
    const _GROUP_META={
      'warsaw pact':{era:'1955–1991'}, 'former ussr':{era:'1922–1991'}, 'ussr':{era:'1922–1991'}, 'former yugoslavia':{era:'1918–1992'} };
    function _groupBasis(key){ const meta=key&&_GROUP_META[key]; if(!meta) return null;
      return L('members of the '+meta.era+' entity, shown as today’s successor territories (current borders)',
               meta.era+'に存在した組織・国家の加盟/構成範囲を、現在の国境（後継国）で表示',
               'Mitglieder der Einheit von '+meta.era+', dargestellt als heutige Nachfolgegebiete (aktuelle Grenzen)',
               'члены объединения '+meta.era+' — показаны как территории нынешних государств-преемников',
               'miembros de la entidad de '+meta.era+', mostrados como territorios sucesores actuales (fronteras de hoy)'); }
    function regionGroup(nm){ const k0=_lnorm(nm);
      /* (#R143) resolve a name to a country-set key via: exact group key → GROUP_ALIASES → the 5-language
         REGION_ALIASES gazetteer (declared below; consulted at CALL time). The REGION_ALIASES rung means every
         localized macro-region name already registered there (西欧 / Westeuropa / западная европа / …) resolves to
         its M49 country-set when that key is a REGION_GROUPS entry — and harmlessly returns null for the natural
         regions (Sahara / Alps / Patagonia) that are NOT country sets, so they still fall through to the poly path.
         GROUP_ALIASES is tried BEFORE REGION_ALIASES so a deliberate override (e.g. JP 北欧 → nordics) still wins. */
      const _look=(k)=>{ if(!k) return null; let key=REGION_GROUPS[k]?k:GROUP_ALIASES[k]; if(!key){ try{ const ra=REGION_ALIASES[k]; if(ra&&REGION_GROUPS[ra]) key=ra; }catch(_){} } return (key&&REGION_GROUPS[key])?key:null; };
      let key=_look(k0);
      if(!key){
        /* (#R123) strip a trailing collective suffix so group PHRASINGS resolve to the member set instead of an
           AI-traced polygon ("旧ユーゴスラビア諸国"→"旧ユーゴスラビア", "former Yugoslav countries"→…, "NATO諸国"→"nato").
           The FSU entry hard-coded its 諸国 variant; this makes every group robust to the same phrasing. */
        let k1=k0.replace(/\s*(諸国|諸邦|の国々|の国|各国|countries|states|nations|republics|nation-states|länder|staaten|страны|государства|стран|países|estados|naciones)$/u,'').trim();
        if(k1&&k1!==k0) key=_look(k1);
        if(!key&&k1){ const k2=k1.replace(/yugoslav$/,'yugoslavia').replace(/soviet$/,'soviet union'); if(k2!==k1) key=_look(k2); }   /* adjective → noun ("former yugoslav" → "former yugoslavia") */
      }
      const list=key?REGION_GROUPS[key]:null;
      if(!list) return null; return {codes:list.slice(),name:String(nm||'').trim(),key:key,basis:_groupBasis(key)}; }
    /* curated COMPOSITIONS → member admin units with REAL boundaries (Japanese 地方 = prefecture unions;
       historic/soil regions = the standard reference member lists) */
    const _JPC={hokkaido:['北海道'],tohoku:['青森県','岩手県','宮城県','秋田県','山形県','福島県'],
      kanto:['茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県'],
      chubu:['新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県'],
      tokai:['愛知県','岐阜県','三重県','静岡県'],koshinetsu:['山梨県','長野県','新潟県'],hokuriku:['富山県','石川県','福井県'],
      kinki:['大阪府','京都府','兵庫県','奈良県','和歌山県','滋賀県','三重県'],kansai:['大阪府','京都府','兵庫県','奈良県','和歌山県','滋賀県'],
      chugoku:['鳥取県','島根県','岡山県','広島県','山口県'],shikoku:['徳島県','香川県','愛媛県','高知県'],
      kyushu:['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県'],
      shutoken:['東京都','神奈川県','埼玉県','千葉県','茨城県','栃木県','群馬県','山梨県']};
    const _jpu=a=>a.map(p=>({q:p+', 日本'}));
    const REGION_COMPOSE={
      'tohoku region':{units:_jpu(_JPC.tohoku)},'kanto region':{units:_jpu(_JPC.kanto)},'chubu region':{units:_jpu(_JPC.chubu)},
      'tokai region':{units:_jpu(_JPC.tokai)},'koshinetsu':{units:_jpu(_JPC.koshinetsu)},'hokuriku region':{units:_jpu(_JPC.hokuriku)},
      'kinki region':{units:_jpu(_JPC.kinki)},'kansai region':{units:_jpu(_JPC.kansai)},'chugoku region':{units:_jpu(_JPC.chugoku)},
      'shikoku region':{units:_jpu(_JPC.shikoku)},'kyushu region':{units:_jpu(_JPC.kyushu)},'greater tokyo':{units:_jpu(_JPC.shutoken)},
      'bessarabia':{iso:['MDA'],units:[{q:'Izmail Raion, Odesa Oblast, Ukraine'},{q:'Bolhrad Raion, Odesa Oblast, Ukraine'},{q:'Bilhorod-Dnistrovskyi Raion, Odesa Oblast, Ukraine'},{q:'Dnistrovskyi Raion, Chernivtsi Oblast, Ukraine'}]},
      'chernozem belt':{iso:['MDA'],units:[
        {q:'Vinnytsia Oblast, Ukraine'},{q:'Cherkasy Oblast, Ukraine'},{q:'Kirovohrad Oblast, Ukraine'},{q:'Poltava Oblast, Ukraine'},{q:'Sumy Oblast, Ukraine'},{q:'Kharkiv Oblast, Ukraine'},{q:'Dnipropetrovsk Oblast, Ukraine'},{q:'Zaporizhzhia Oblast, Ukraine'},{q:'Donetsk Oblast, Ukraine'},{q:'Luhansk Oblast, Ukraine'},{q:'Mykolaiv Oblast, Ukraine'},{q:'Kherson Oblast, Ukraine'},{q:'Odesa Oblast, Ukraine'},{q:'Khmelnytskyi Oblast, Ukraine'},{q:'Ternopil Oblast, Ukraine'},
        {q:'Belgorod Oblast, Russia'},{q:'Kursk Oblast, Russia'},{q:'Voronezh Oblast, Russia'},{q:'Lipetsk Oblast, Russia'},{q:'Tambov Oblast, Russia'},{q:'Oryol Oblast, Russia'},{q:'Penza Oblast, Russia'},{q:'Saratov Oblast, Russia'},{q:'Samara Oblast, Russia'},{q:'Ulyanovsk Oblast, Russia'},{q:'Volgograd Oblast, Russia'},{q:'Rostov Oblast, Russia'},{q:'Krasnodar Krai, Russia'},{q:'Stavropol Krai, Russia'},{q:'Orenburg Oblast, Russia'},
        {q:'Kostanay Region, Kazakhstan'},{q:'North Kazakhstan Region, Kazakhstan'},{q:'Akmola Region, Kazakhstan'},{q:'Pavlodar Region, Kazakhstan'}]},
      'fertile crescent':{iso:['LBN','ISR','PSE'],units:[
        {q:'Nineveh Governorate, Iraq'},{q:'Duhok Governorate, Iraq'},{q:'Erbil Governorate, Iraq'},{q:'Sulaymaniyah Governorate, Iraq'},{q:'Kirkuk Governorate, Iraq'},{q:'Saladin Governorate, Iraq'},{q:'Diyala Governorate, Iraq'},{q:'Baghdad Governorate, Iraq'},{q:'Babil Governorate, Iraq'},{q:'Karbala Governorate, Iraq'},{q:'Wasit Governorate, Iraq'},{q:'Al-Qadisiyyah Governorate, Iraq'},{q:'Dhi Qar Governorate, Iraq'},{q:'Maysan Governorate, Iraq'},{q:'Basra Governorate, Iraq'},
        {q:'Latakia Governorate, Syria'},{q:'Tartus Governorate, Syria'},{q:'Idlib Governorate, Syria'},{q:'Aleppo Governorate, Syria'},{q:'Raqqa Governorate, Syria'},{q:'Al-Hasakah Governorate, Syria'},{q:'Deir ez-Zor Governorate, Syria'},{q:'Hama Governorate, Syria'},{q:'Homs Governorate, Syria',part:'W'},{q:'Damascus, Syria'},{q:'Rif Dimashq Governorate, Syria',part:'W'},{q:'Daraa Governorate, Syria'},{q:'Quneitra Governorate, Syria'},
        {q:'Irbid Governorate, Jordan'},{q:'Ajloun Governorate, Jordan'},{q:'Jerash Governorate, Jordan'},{q:'Balqa Governorate, Jordan'},{q:'Amman Governorate, Jordan',part:'W'},{q:'Madaba Governorate, Jordan'},{q:'Karak Governorate, Jordan',part:'W'},
        {q:'Hatay Province, Turkey'},{q:'Kilis Province, Turkey'},{q:'Gaziantep Province, Turkey'},{q:'Şanlıurfa Province, Turkey'},{q:'Mardin Province, Turkey'},{q:'Diyarbakır Province, Turkey'},{q:'Adıyaman Province, Turkey'},{q:'Batman Province, Turkey'},{q:'Siirt Province, Turkey'},{q:'Şırnak Province, Turkey'},
        {q:'Khuzestan Province, Iran'},{q:'Ilam Province, Iran'},{q:'Kermanshah Province, Iran'}]} };
    const COMPOSE_ALIASES={
      'tohoku':'tohoku region','kanto':'kanto region','chubu':'chubu region','tokai':'tokai region','hokuriku':'hokuriku region','kinki':'kinki region','kansai':'kansai region','shikoku':'shikoku region','kyushu':'kyushu region','greater tokyo area':'greater tokyo','tokyo metropolitan area':'greater tokyo',
      '東北':'tohoku region','東北地方':'tohoku region','関東':'kanto region','関東地方':'kanto region','中部':'chubu region','中部地方':'chubu region',
      '東海':'tokai region','東海地方':'tokai region','甲信越':'koshinetsu','甲信越地方':'koshinetsu','北陸':'hokuriku region','北陸地方':'hokuriku region',
      '近畿':'kinki region','近畿地方':'kinki region','関西':'kansai region','関西地方':'kansai region','中国地方':'chugoku region',
      '四国':'shikoku region','四国地方':'shikoku region','九州':'kyushu region','九州地方':'kyushu region','首都圏':'greater tokyo',
      'ベッサラビア':'bessarabia','bessarabien':'bessarabia','бессарабия':'bessarabia','besarabia':'bessarabia',
      'チェルノーゼム':'chernozem belt','チェルノーゼム地帯':'chernozem belt','黒土地帯':'chernozem belt','chernozem':'chernozem belt','black earth belt':'chernozem belt','black earth region':'chernozem belt','schwarzerde':'chernozem belt','schwarzerdegürtel':'chernozem belt','чернозём':'chernozem belt','чернозем':'chernozem belt','чернозёмная зона':'chernozem belt','черноземье':'chernozem belt','чернозёмный пояс':'chernozem belt','cinturón de chernozem':'chernozem belt','tierras negras':'chernozem belt',
      '肥沃な三日月帯':'fertile crescent','肥沃な三日月地帯':'fertile crescent','肥沃三日月帯':'fertile crescent','fruchtbarer halbmond':'fertile crescent','плодородный полумесяц':'fertile crescent','creciente fértil':'fertile crescent','media luna fértil':'fertile crescent' };
    function regionCompose(nm){ const k=_lnorm(nm); const key=REGION_COMPOSE[k]?k:COMPOSE_ALIASES[k]; const spec=key?REGION_COMPOSE[key]:null; if(!spec) return null; return {spec,key:key}; }
    /* AI names the member units (grounded in a live Wikipedia lookup) → same real-boundary composition */
    const _aiUnitCache={};
    async function aiRegionUnits(nm){ const key=_lnorm(nm); if(key in _aiUnitCache) return _aiUnitCache[key]; let out=null;
      let wiki=''; try{ const w=await _wikiSummary(nm); if(w) wiki='\n\nWikipedia summary (ground truth for what this region covers):\n'+w; }catch(_){}
      try{ const j=await askAIJSON('Region name: "'+nm+'"'+wiki, personaPrompt('resolving region names to real administrative units for the IntMap world map',{mode:'internal'})+   /* (#R285) machine-read output → 'internal' mode */
        'You output ONLY strict JSON (no prose, no fence). Task: JUDGE whether the named region is well approximated by a union of real administrative units, and if so express it as one so its exact official boundaries can be drawn. (a) If it IS admin-composable (historical provinces, informal groupings of prefectures/states, economic macro-regions), return {"found":true,"units":[{"q":"<admin unit name in English with country, Nominatim-searchable, e.g. \'Voronezh Oblast, Russia\' / \'Aichi Prefecture, Japan\'>","part":null|"N"|"S"|"E"|"W"|"NE"|"NW"|"SE"|"SW"|"C"}...],"countries":["<names of countries that belong ENTIRELY to the region>"]}. Prefer FIRST-LEVEL admin units; use second-level (county/district/raion) when the region is smaller than one first-level unit. Use "part" ONLY when clearly less than ~70% of that unit belongs. Cover the WHOLE region (up to 40 units). (b) If it is NOT admin-shaped (a river basin/watershed, mountain range, desert, plain, climate/soil/vegetation belt, sea area, urban corridor) — administrative borders would misrepresent it — return {"found":true,"mode":"outline"} and nothing else. (c) If you do not recognize it, return {"found":false}.');
        if(j&&j.found){ if(String(j.mode||'')==='outline'){ out={outline:true}; }
          else { const units=Array.isArray(j.units)?j.units.filter(u=>u&&u.q).map(u=>({q:String(u.q).slice(0,90),part:(u.part&&/^(N|S|E|W|NE|NW|SE|SW|C)$/.test(String(u.part)))?String(u.part):null})).slice(0,40):[];
          const iso=[]; (Array.isArray(j.countries)?j.countries:[]).forEach(cn=>{ try{ const c=resolveCountrySync(String(cn)); if(c&&c.code&&iso.indexOf(c.code)<0) iso.push(c.code); }catch(_){} });
          if(units.length||iso.length) out={units,iso}; } } }catch(_){}
      _aiUnitCache[key]=out; return out; }
    const _aiPolyCache={};
    /* (#R63) "曖昧な地域名の範囲表示がめちゃくちゃ" — the AI-traced outline is now GROUNDED in a live Wikipedia
       summary of the region (net search) and asked for more vertices + a self-check, and it takes PRIORITY over
       the crude gazetteer box (which remains only as the no-AI fallback). (#R64: demoted to LAST resort behind
       real-boundary composition; vertex budget raised.) */
    /* (#R122) validate & clean an AI-traced ring: needs enough distinct vertices, a non-degenerate span and a
       real (non-collinear) area — rejects the rectangle/line/whole-world hallucinations the outline used to draw. */
    function _cleanAiRing(poly){ if(!Array.isArray(poly)) return null;
      let ring=poly.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])&&Math.abs(+p[0])<=180&&Math.abs(+p[1])<=90).map(p=>[+p[0],+p[1]]);
      /* drop consecutive duplicates */
      ring=ring.filter((p,i)=>i===0||Math.abs(p[0]-ring[i-1][0])>1e-6||Math.abs(p[1]-ring[i-1][1])>1e-6);
      if(ring.length<8) return null;
      let a=180,b=90,c=-180,d=-90; ring.forEach(p=>{ a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1]); });
      const lngSpan=c-a, latSpan=d-b;
      if(lngSpan>350||lngSpan<0.01&&latSpan<0.01) return null;             /* whole-world / a point */
      let area=0; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ area+=(ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1]); } area=Math.abs(area/2);
      if(area < (lngSpan*latSpan)*0.02) return null;                        /* collinear / a thin sliver = not a real outline */
      ring.push([ring[0][0],ring[0][1]]); return {type:'Polygon',coordinates:[ring]}; }
    async function aiRegionPoly(nm){ const key=_lnorm(nm); if(key in _aiPolyCache) return _aiPolyCache[key]; let out=null;
      let wiki=''; try{ const w=await _wikiSummary(nm); if(w) wiki='\n\nWikipedia summary of this region (use it to place the outline PRECISELY — countries/cities/rivers named here anchor the shape):\n'+w; }catch(_){}
      const SYS2=personaPrompt('tracing region outlines for the IntMap world map',{mode:'internal'})/* (#R285) a polygon is machine-read: identity, fact discipline and non-disclosure, no register/opinion/feeling clauses a coordinate list cannot have */+'You output ONLY strict JSON (no prose, no fence). If the given name denotes a recognizable geographic region, corridor, belt or informal area (e.g. "Blue Banana", "Rhine-Ruhr", "Great Plains", "Sahel", "Rust Belt"), return {"found":true,"polygon":[[lng,lat],...]} with 40-90 vertices tracing its ACTUAL geographic outline as PRECISELY as you can. Rules for precision: place vertices DENSELY (every few km) along complex edges — coastlines, river courses, mountain fronts, national borders it follows — and sparsely only on genuinely straight interior stretches; a corridor stays corridor-shaped and a coastal region hugs the real coast; NEVER a plain rectangle, ellipse or convex blob. Walk the boundary in ONE consistent direction without self-crossing. Before answering, verify: every named anchor place from the description falls INSIDE the polygon, obviously-outside areas are excluded, and the shape visibly resembles the region on a map. lng -180..180, lat -90..90; do not repeat the first point. If you do not recognize the name as a region, return {"found":false}.';
      try{ const j=await askAIJSON('Region name: "'+nm+'"'+wiki,SYS2); if(j&&j.found) out=_cleanAiRing(j.polygon); }catch(_){}
      /* (#R122) one firmer retry if the first trace came back degenerate (too coarse / rectangular / collinear) */
      if(!out){ try{ const j2=await askAIJSON('Region name: "'+nm+'"'+wiki+'\n\nYour previous outline was too coarse or rectangular. Trace it AGAIN with 50-90 vertices that genuinely follow the real coasts/borders/rivers — no straight-line shortcuts across curved boundaries.',SYS2); if(j2&&j2.found) out=_cleanAiRing(j2.polygon); }catch(_){} }
      _aiPolyCache[key]=out; return out; }
    /* (#R65) BASIN builder: main river (real course) + every OSM-tagged river/canal inside the basin outline
       (thin lines) + the basin itself as a FAINT fill. (#R72) the outline now comes from REAL hydrological
       data — see the ladder in buildBasin. Admin-unit composition is deliberately NOT used here (「全部が全部
       行政区分使えばいいわけじゃない」). */
    async function buildBasin(baseName){
      let river=await fetchRiverLine(baseName); if(!river&&!/river|川|fluss|река|río/i.test(baseName)) river=await fetchRiverLine(baseName+' River');
      /* (#R72) REAL basin geometry first ("流域ポリゴンが、地点数少なすぎてまったくの粗悪。現実に忠実で精細な
         ポリゴンを描画しろ"). Ladder: (1) the self-hosted GRDC/World-Bank Major-River-Basins dataset (236 named
         basins, real hydrological boundaries); (2) live HydroSHEDS delineation via the Global Watersheds API
         (mghydro.com) from the river's downstream end — precise for ANY river; (3) an OSM basin relation;
         (4) the AI-traced outline, kept only as the last resort and labelled approximate. */
      let basin=null, approx=false, src='';
      try{ const mb=await _mrbBasin(baseName,river); if(mb){ basin=mb; src='GRDC/World Bank Major River Basins'; } }catch(_){}
      if(!basin&&river){ try{ const gw=await _mghBasin(river); if(gw){ basin=gw; src='HydroSHEDS via Global Watersheds (mghydro.com)'; } }catch(_){} }
      /* (#R73) no fetchable river course (small/unnamed-in-OSM rivers) → still get a REAL watershed by
         delineating from the river's geocoded point itself */
      if(!basin&&!river){ try{ const g=await geocode(baseName); if(g&&isFinite(g.lng)){ const gg=await _mghOne([g.lng,g.lat]);
        if(gg&&_geoArea(gg)>0.0005){ basin={geo:gg,name:baseName+' basin'}; src='HydroSHEDS via Global Watersheds (mghydro.com)'; } } }catch(_){} }
      if(!basin){ try{ const e=await _nomExtent(baseName+' basin'); if(e&&e.geojson&&/Polygon/.test((e.geojson.type||''))&&/basin|流域|einzugsgebiet|бассейн|cuenca/i.test(String(e.name||''))){ basin={geo:e.geojson,name:e.name}; src='OpenStreetMap'; } }catch(_){} }
      if(!basin){ try{ const ai=await aiRegionPoly(baseName+' drainage basin'); if(ai){ basin={geo:ai,name:baseName}; approx=true; src='AI outline'; } }catch(_){} }
      let trib=null; if(basin){ try{ trib=await fetchTributaries(basin.geo,900); }catch(_){} }
      return {river,basin,trib,approx,src}; }
    try{ window._imBasinDiag=(nm)=>buildBasin(String(nm||'')); window._imBasinDiag2={mgh:_mghBasin,one:_mghOne,mrb:_mrbBasin,river:fetchRiverLine}; }catch(_){}   /* (#R73) read-only diagnostics (vision §17) */
    /* self-hosted GRDC/WB major-basin polygons (data/basins_mrb.json, CC-BY-4.0) — name match verified by
       containment of the river's own course when we have it */
    let _mrbData=null, _mrbP=null;
    function _mrbLoad(){ if(_mrbData) return Promise.resolve(_mrbData); if(_mrbP) return _mrbP;
      _mrbP=fetch('data/basins_mrb.json').then(r=>r.ok?r.json():null).then(j=>{ _mrbData=(j&&j.features)?j:null; return _mrbData; }).catch(()=>null);
      return _mrbP; }
    function _ptInGeo(pt,geo){ try{ const test=(rings)=>{ let ins=false; const r0=rings[0]; for(let i=0,k=r0.length-1;i<r0.length;k=i++){ const xi=r0[i][0],yi=r0[i][1],xk=r0[k][0],yk=r0[k][1];
        if(((yi>pt[1])!==(yk>pt[1]))&&(pt[0]<(xk-xi)*(pt[1]-yi)/((yk-yi)||1e-12)+xi)) ins=!ins; } return ins; };
      if(geo.type==='Polygon') return test(geo.coordinates);
      if(geo.type==='MultiPolygon') return geo.coordinates.some(test); }catch(_){} return false; }
    function _riverPts(river,n){ const out=[]; try{ const g=river.geo;
      const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
      let all=[]; lines.forEach(l=>{ all=all.concat(l); });
      const step=Math.max(1,Math.floor(all.length/(n||24)));
      for(let i=0;i<all.length;i+=step) out.push(all[i]); }catch(_){} return out; }
    async function _mrbBasin(baseName,river){ const db=await _mrbLoad(); if(!db) return null;
      const norm=s=>String(s||'').toLowerCase().replace(/\b(river|the)\b/g,'').replace(/(川|江|河)$/,'').replace(/[^a-zà-ɏ0-9]/g,'');
      const wants=[norm(baseName)]; if(river&&river.name) wants.push(norm(river.name)); if(river&&river.nameEn) wants.push(norm(river.nameEn));
      const cands=db.features.filter(f=>{ const bn=norm(f.properties.n); if(!bn) return false;
        return wants.some(w=>w&&w.length>=3&&(w===bn||w.indexOf(bn)===0||bn.indexOf(w)===0)); });
      if(!cands.length) return null;
      let best=cands[0];
      if(river){ const pts=_riverPts(river,20); let bi=-1;
        for(const c of cands){ let inN=0; pts.forEach(p=>{ if(_ptInGeo(p,c.geometry)) inN++; });
          if(inN>bi){ bi=inN; best=c; } }
        if(pts.length>=6&&bi<pts.length*0.4) return null;   /* name matched but the river isn't inside it → wrong basin */ }
      return {geo:best.geometry,name:best.properties.n}; }
    /* live HydroSHEDS watershed delineation upstream of a point (CORS-open; attribution: Global Watersheds,
       mghydro.com). Flow direction of the fetched line is unknown → try both ends, keep the larger watershed. */
    function _geoArea(geo){ let a=0; try{ const ring=(r)=>{ let s=0; for(let i=0,k=r.length-1;i<r.length;k=i++){ s+=(r[k][0]+r[i][0])*(r[k][1]-r[i][1]); } return Math.abs(s/2); };
      if(geo.type==='Polygon') a=ring(geo.coordinates[0]);
      else if(geo.type==='MultiPolygon') geo.coordinates.forEach(p=>{ a+=ring(p[0]); }); }catch(_){} return a; }
    async function _mghOne(pt){ try{
      const c=('AbortController' in window)?new AbortController():null; const tm=setTimeout(()=>{ try{ c&&c.abort(); }catch(_){} },25000);
      const opt=c?{signal:c.signal}:{};
      const r=await fetch('https://mghydro.com/app/watershed_api?lat='+(+pt[1]).toFixed(4)+'&lng='+(+pt[0]).toFixed(4)+'&precision=high',opt);
      clearTimeout(tm); if(!r.ok) return null; const j=await r.json();
      const f=j&&j.features&&j.features[0]; return (f&&f.geometry&&/Polygon/.test(f.geometry.type||''))?f.geometry:null; }catch(_){ return null; } }
    async function _mghBasin(river){ try{
      const g=river.geo; const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates.slice().sort((x,y)=>y.length-x.length):[];
      const main=lines[0]; if(!main||main.length<4) return null;
      /* (#R73) candidate DELINEATION POINTS. A watershed is everything UPSTREAM of the queried point, so the
         full basin = the watershed of the mouth — but (a) the exact endpoint often snaps into the SEA
         (degenerate 1-point answer), (b) many rivers reach the sea through a DISTRIBUTARY the flow model
         routes little area through (信濃川 vs 大河津分水: a point on the lower branch returned a tiny coastal
         watershed), and (c) an Overpass MultiLineString's longest piece may be mid-course. Therefore: sample
         SEVERAL depths from BOTH ends of the main line (2/8/18/33/50%) plus the geographic extreme endpoints,
         delineate each, and keep the watershed containing the LARGEST SHARE of the river's own course (ties →
         larger area). A just-above-the-delta point then wins with near-total containment. */
      const at=(ln,frac)=>ln[Math.max(1,Math.min(ln.length-2,Math.floor(ln.length*frac)))];
      const cands=[];
      [0.02,0.08,0.18,0.33,0.5].forEach(f=>{ cands.push(at(main,f)); cands.push(at(main,1-f)); });
      try{ const ends=[]; lines.forEach(ln=>{ if(ln.length>=2){ ends.push(ln[0],ln[ln.length-1]); } });
        if(ends.length){ const byLat=ends.slice().sort((a,b)=>a[1]-b[1]), byLng=ends.slice().sort((a,b)=>a[0]-b[0]);
          [byLat[0],byLat[byLat.length-1],byLng[0],byLng[byLng.length-1]].forEach(p=>{ if(p) cands.push(p); }); } }catch(_){}
      const seen=new Set(); const uniq=cands.filter(p=>{ if(!p) return false; const k=p[0].toFixed(3)+','+p[1].toFixed(3); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,12);
      const pts=_riverPts(river,20);
      let best=null,bestA=0,bestIn=0;
      const t0=Date.now();   /* (#R73) hard 45 s budget — bounded latency even if some delineations hang */
      for(const p of uniq){ if(Date.now()-t0>45000) break;
        const gg=await _mghOne(p); if(!gg) continue;
        let inN=0; pts.forEach(q=>{ if(_ptInGeo(q,gg)) inN++; });
        const ar=_geoArea(gg);
        if(inN>bestIn||(inN===bestIn&&ar>bestA)){ best=gg; bestA=ar; bestIn=inN; }
        if(pts.length>=6&&inN>=pts.length*0.85) break; }   /* near-total containment → that's the basin */
      if(!best) return null;
      if(pts.length>=6&&bestIn<pts.length*0.5) return null;   /* no candidate watershed holds the course → wrong result */
      return {geo:best,name:(river.name||'')+' basin'}; }catch(_){ return null; } }
    /* (#R64) resolution ladder, most-exact first: country → country GROUP (exact national borders) → curated
       COMPOSITION (real member admin boundaries) → direct OSM boundary polygon (fine threshold) → directional
       slice CLIPPED FROM THE REAL polygon → AI-named member units composed from real boundaries → AI-traced
       outline (last resort, labelled approximate) → gazetteer box (logged-out fallback) → country. */
    async function resolveHlTarget(nm){
      const c=resolveCountrySync(nm); if(c&&c.code) return {code:c.code,name:c.name};
      const grp=regionGroup(nm); if(grp&&grp.codes.length) return {codes:grp.codes,name:grp.name,basis:grp.basis||null};   /* (#R118) carry the historical-membership basis into the reply */
      const comp=regionCompose(nm); if(comp){ const cp=await composeRegion(comp.spec,comp.key); if(cp&&cp.geo) return {poly:{name:String(nm||'').trim(),geo:cp.geo},composed:true,partial:cp.n<cp.total}; }
      /* (#R117) recognisably WATER-shaped queries (…湾/…海/灘/水道/海峡, Bay/Gulf/Strait/Sea…) get a RETRY on the
         real-polygon lookup and NEVER fall through to the AI-traced outline: a hallucinated blob over the wrong
         coast (the reported "伊勢湾がまったく別の場所に描かれる" screenshot) is far worse than an honest miss.
         (The ≥2-chars-before-湾/海 guard keeps 台湾/上海/熱海/東海 out of the water branch.) */
      const _wq=String(nm||'').trim();
      const isWaterQ=/^..+湾$/.test(_wq)||/^..+海$/.test(_wq)||/(灘|水道|海峡)$/.test(_wq)||/\b(bay|gulf|strait|channel|sound|sea|fjord|lagoon)\b/i.test(_wq);
      /* (#R130) web-verify ambiguous / water / fuzzy targets ONCE (lazy, cached, fail-open). Used as a Nominatim
         ANCHOR (disambiguate the 8 candidates) and to REJECT wrong-place geometry below. The exact-country and
         region-group rungs above already returned, so this only runs for the genuinely uncertain long tail. */
      let _gv=null,_gvTried=false; const _getGV=async()=>{ if(!_gvTried){ _gvTried=true; try{ _gv=await geoVerify(nm); }catch(_){ _gv=null; } } return _gv; };
      /* (#R136) if the name is a CURATED macro-region (Patagonia, Siberia, Sahel…), a Nominatim hit that sits OUTSIDE
         that reviewed extent is a homonym (Patagonia the Arizona town, ~13000 km from the South-American region) —
         reject it so we fall through to the curated gazetteer box below instead of painting the wrong-place homonym. */
      const _rbEarly=regionBox(_wq);
      const _curatedOk=(e)=>{ try{ if(!_rbEarly||!_rbEarly.box||!e) return true;
        const bx=_rbEarly.box, w=bx[0][0],s=bx[0][1],ee=bx[1][0],nn=bx[1][1], rw=ee-w, rh=nn-s, pad=Math.max(6,rw*0.25,rh*0.25);
        /* (a) reject a FAR homonym whose point is outside the reviewed extent (Patagonia the Arizona town). */
        if(isFinite(+e.lng)&&isFinite(+e.lat)&&!(+e.lng>=w-pad&&+e.lng<=ee+pad&&+e.lat>=s-pad&&+e.lat<=nn+pad)) return false;
        /* (b) reject a tiny named SUB-feature INSIDE the region (the Southern Patagonian Ice Field for "Patagonia", a
           Sahel admin region for "Sahel") — it covers only a sliver of the macro-region, so prefer the curated box. */
        try{ if(e.box&&rw>0&&rh>0){ const ew=e.box[1][0]-e.box[0][0], eh=e.box[1][1]-e.box[0][1]; if((ew*eh)/(rw*rh)<0.15) return false; } }catch(_){}
        return true; }catch(_){ return true; } };
      for(let _wi=0;_wi<(isWaterQ?2:1);_wi++){
        try{ const gv=await _getGV(); const e=await _nomExtent(nm, gv); if(e&&e.geojson&&/Polygon/.test(e.geojson.type||'') && _geoAgrees(e.geojson, gv) && _curatedOk(e)){
          if(e.adminPoly) return {poly:{name:e.name||nm,geo:e.geojson}, verified:_gvStrong(gv)};
          /* (#R116) WATER BODIES & NATURAL FEATURES: 「大阪湾をハイライト」 was rejected here (a bay is not an
             admin polygon), fell through the AI steps and ended at the point→country fallback, which painted
             CHINA. Nominatim HAS real polygons for bays/straits/seas/peninsulas — accept them for highlight.
             (#R130) …but only when the polygon AGREES with the web-verified location (the anchor already makes
             the right candidate win; this rejects a residual homonym rather than painting it). */
          if(/^(natural|water|waterway|place)$/i.test(e.cls||'') && /^(bay|strait|gulf|sea|water|lagoon|channel|sound|fjord|inlet|peninsula|isthmus|cape|archipelago|reef|shoal|wetland)$/i.test(e.typ||''))
            return {poly:{name:e.name||nm,geo:e.geojson}, verified:_gvStrong(gv)};
          break;   /* got a polygon but of another kind → no point retrying */
        } }catch(_){}
        if(isWaterQ&&_wi===0) await new Promise(r=>setTimeout(r,900));
      }
      if(isWaterQ) return null;   /* (#R117) water body not found → honest miss, never an AI-guessed outline / point→country fallback */
      const dir=parseDirectional(nm); if(dir){ try{ const b=await _nomExtent(dir.base);
        if(b&&b.geojson&&/Polygon/.test((b.geojson.type||''))&&b.box){ const cg=_clipGeoRect(b.geojson,sliceBox(b.box,dir.dir)); if(cg) return {poly:{name:nm,geo:cg},sliced:true}; }
        if(b&&b.box) return {poly:{name:nm,geo:_bboxSoftPoly(sliceBox(b.box,dir.dir))},soft:true}; }catch(_){} }
      /* (#R132) GENERAL region resolver (window.IntMapRegionResolver): ONE web-grounded metadata call → REAL geometry
         (admin union / OSM boundary / web-anchor-derived), a fail-CLOSED validation gate, and an honest ambiguous /
         not-found result. It SUPERSEDES the old web-blind aiRegionUnits/aiRegionPoly hallucination rungs for logged-in
         users (the "見当違いの場所にblob" source); logged-out / resolver-unavailable falls back to the legacy path. */
      let _rrRan=false;
      try{ const _mc=(()=>{ try{ const c=GE().camera.getCenter(); return {lat:c.lat,lng:c.lng}; }catch(_){ return null; } })();
        const _gvNow=await _getGV();
        const rr=await _rrResolve(nm,{mapCenter:_mc, lastCountry:(_gvNow&&_gvNow.country)||'', lang:(typeof HOST.lang!=='undefined'?HOST.lang:'en')});
        if(rr){ _rrRan=!!rr.ran;
          if(rr.status==='ambiguous'&&rr.candidates&&rr.candidates.length>=2) return {ambiguous:true, candidates:rr.candidates.slice(0,4), name:rr.canonicalName||String(nm||'').trim()};
          if((rr.status==='exact'||rr.status==='derived')&&rr.geometry) return {poly:{name:rr.canonicalName||String(nm||'').trim(), geo:rr.geometry}, composed:rr.method==='admin_union', approx:rr.status==='derived', verified:true, rrMethod:rr.method, rrSource:rr.sourceName}; }
      }catch(_){}
      const rbKnown=regionBox(nm);
      if(!_rrRan){
        /* legacy fallback (logged-out / resolver unavailable): admin-unit composition (real member boundaries),
           then the validated AI outline. Skipped when the resolver actually consulted the web and returned nothing
           reliable — trusting the stronger web-grounded verdict over a weaker web-blind re-guess. */
        try{ const aiu=await aiRegionUnits(nm); if(aiu&&!aiu.outline){ const cp2=await composeRegion(aiu,_lnorm(nm)); if(cp2&&cp2.geo&&cp2.n>=Math.max(1,Math.round(cp2.total*0.5))) return {poly:{name:String(nm||'').trim(),geo:cp2.geo},composed:true,partial:cp2.n<cp2.total}; } }catch(_){}
        const ai=await aiRegionPoly(nm); if(ai){ const gv=await _getGV(); if(_geoAgrees(ai, gv)) return {poly:{name:nm,geo:ai},approx:true,verified:_gvStrong(gv)}; }
      }
      /* curated macro-region gazetteer (Europe / Sahel / Great Plains …) — a REVIEWED extent, kept as a labelled
         approximate fallback so these keep highlighting; it only fires for the small curated alias set, never for an
         arbitrary name (so it can't paint a rogue rectangle). */
      if(rbKnown&&rbKnown.box) return {poly:{name:nm,geo:_bboxSoftPoly(rbKnown.box)},soft:true};
      /* (#R116) last-resort country fallback: resolveCountry may derive the country from a GEOCODED POINT
         (codeAtPoint), which for a non-country query with a bad geocode confidently painted the WRONG country
         (大阪湾 → "People's Republic of China"). Only accept it when the country name actually relates to the
         query; (#R130) AND, when a strong web verification says which country the place is in, only when that
         matches — so a bad geocode can no longer confidently paint the wrong nation. */
      const c2=await resolveCountry(nm); if(c2&&c2.code){ const qn=_lnorm(nm), cn=_lnorm(c2.name||'');
        const gv=await _getGV();
        const _countryOk=(()=>{ if(!_gvStrong(gv)||!gv.country) return true; const gc=_lnorm(gv.country); return !!(gc&&cn&&(cn.indexOf(gc)>=0||gc.indexOf(cn)>=0)); })();
        if(_countryOk && qn&&cn&&(cn.indexOf(qn)>=0||qn.indexOf(cn)>=0)) return {code:c2.code,name:c2.name,verified:_gvStrong(gv)}; }
      return null; }
    function unionBox(codes,polys){ let a=180,b=90,c=-180,d=-90,any=false;
      try{ const g=geo(); if(g&&g.features&&codes&&codes.length){ const set=new Set(codes.map(String)); g.features.forEach(f=>{ if(!set.has(String(f.id))) return; const bb=fbbox(f.geometry); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); }); } }catch(_){}
      (polys||[]).forEach(p=>{ try{ const bb=fbbox(p.geo); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); }catch(_){} });
      return (any&&isFinite(a)&&(c-a)<350)?[[a,b],[c,d]]:null; }
    /* ---- analysis ---- */
    function rows(metric){ const m=METRICS[metric]||XMET[metric]; if(!m) return null; const out=[]; for(const code in countryStats){ const s=countryStats[code]; if(!s) continue; const v=m.get(s); if(v==null||isNaN(v)) continue; out.push({code,name:nm(s),val:v}); } out.sort((x,y)=>y.val-x.val); return out; }   /* (#R105) also rank the XMET metrics (life expectancy / internet), not only the base METRICS set */
    function rank(metric,order,n){ const l=rows(metric); if(!l) return null; return order==='bottom'?l.slice(-n).reverse():l.slice(0,n); }
    function ratio(a,b,order,n){ const ma=METRICS[a],mb=METRICS[b]; if(!ma||!mb) return null; const out=[]; for(const code in countryStats){ const s=countryStats[code]; if(!s) continue; const va=ma.get(s),vb=mb.get(s); if(va==null||vb==null||isNaN(va)||isNaN(vb)||vb===0) continue; out.push({code,name:nm(s),val:va/vb}); } out.sort((x,y)=>y.val-x.val); return order==='bottom'?out.slice(-n).reverse():out.slice(0,n); }
    function relate(my,mx,find,n){ const Y=METRICS[my],X=METRICS[mx]; if(!Y||!X) return null; const pts=[]; for(const code in countryStats){ const s=countryStats[code]; if(!s) continue; let y=Y.get(s),x=X.get(s); if(y==null||x==null||isNaN(y)||isNaN(x)) continue; if(X.log){ if(x<=0) continue; x=Math.log(x); } pts.push({code,name:nm(s),y,xv:x,raw:Y.get(s)}); }
      if(pts.length<4) return null; const N=pts.length; let sx=0,sy=0,sxx=0,sxy=0; pts.forEach(p=>{ sx+=p.xv;sy+=p.y;sxx+=p.xv*p.xv;sxy+=p.xv*p.y; }); const den=(N*sxx-sx*sx)||1; const b=(N*sxy-sx*sy)/den, a=(sy-b*sx)/N; pts.forEach(p=>{ p.resid=p.y-(a+b*p.xv); p.val=p.raw; }); pts.sort((p,q)=>p.resid-q.resid); return find==='high'?pts.slice(-n).reverse():pts.slice(0,n); }
    const clampN=n=>Math.max(1,Math.min(40,parseInt(n,10)||15));
    const note=s=>'<div style="font-size:11.5px;color:var(--text-muted);margin:3px 0;">'+s+'</div>';
    /* (#R43) failures must be VISIBLE — the user reported "実行したと言っている操作が実行されていない". `warn` renders
       in an attention colour and every action now returns a structured {ok,html} via R() so run() can report the
       TRUTH (which steps actually ran) instead of trusting the model's optimistic "say". */
    const warn=s=>'<div style="font-size:11.5px;color:#ff9f0a;margin:3px 0;font-weight:600;">'+s+'</div>';
    const R=(ok,html,extra)=>Object.assign({ok:!!ok,html:html||''},extra||null);   /* (#R119) extra e.g. {objectIds:[…]} — creating actions expose what they made */
    /* (#R199) ↳ js/atlas-reply.js — reply rendering — safe markdown, code/math, GFM tables, source cards.
       Moved whole; the 7 names below are what the rest of this file still calls. */
    const { _atlBadSourceHost, _atlCleanUrl, _atlRelevantCards, _atlStanza, dropLeadTitle, linkCards, listHtml, mdMini } = makeAtlasReply(HOST, { L, esc, fitTo, fmtVal, highlight, note, warn });
    /* (#R340) ↳ js/news-cluster.js — article→EVENT grouping for research.events. No HOST and no deps: it is pure, which is what lets tests/r340-checks run the shipped function over a fixture. */
    const { EVENT_RULES, groupNewsEvents, newsSubject } = makeNewsCluster();
    /* (#R350) the answer contract, in the shape tests/r175 ③ requires of every js/ module: ONE
       exported factory per file, nothing private at a module's top level, and the API attached to
       window so the browser spec can drive the REAL renderer rather than a Node copy of it. */
    const { runStructuredAnswer } = makeAtlasAnswerPipeline();
    const { renderAnswer, answerPlainText, answerCSS } = makeAtlasAnswerRender();
    const { makeEvidenceRegistry } = makeAtlasEvidence();
    const { normalizeAnswer } = makeAtlasAnswerContract();
    const { auditAnswer } = makeAtlasAnswerAudit();
    /* ---- (#R43) PRECISE layer resolution. The user reported "レイヤーによっては混同している" — the old matcher
       fuzzy-matched loosely AND the model never saw the real layer names, so it guessed a name and the matcher
       guessed a layer (double-guess). Now: (a) the LIVE layer list is injected into the prompt (layerCatalogText)
       so the model targets EXACT names; (b) resolveLayer scores by exact-id / exact-text / data-layer / prefix /
       whole-word / token-coverage with a threshold; (c) toggleLayer VERIFIES the checkbox reached the wanted state
       and returns the EXACT label it toggled so the note shows precisely what happened (no more silent confusion). */
    const _lnorm=s=>{ try{ return String(s==null?'':s).replace(/^[^\p{L}\p{N}]+/u,'').toLowerCase().replace(/\s+/g,' ').trim(); }catch(_){ return String(s==null?'':s).toLowerCase().replace(/\s+/g,' ').trim(); } };
    function layerCatalog(){ const out=[]; document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ const lab=cb.closest('label')||cb.closest('.lyr-row'); let disp=''; if(lab){ const sp=lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label'); disp=(sp?sp.textContent:(lab.textContent||'')); } disp=disp.replace(/\s+/g,' ').trim(); const txt=_lnorm(disp); if(!txt) return; out.push({cb, label:disp, txt, id:(cb.id||'').toLowerCase(), dl:(cb.getAttribute('data-layer')||'').toLowerCase()}); }); return out; }
    function layerCatalogText(){ try{ const seen=new Set(),out=[]; layerCatalog().forEach(c=>{ const n=c.label; if(!n||n.length<2) return; const k=c.txt; if(seen.has(k)) return; seen.add(k); out.push(n); }); return out.slice(0,170).join('; '); }catch(_){ return ''; } }
    /* (#R52) The user re-reported "レイヤーによっては混同している" (layer confusion). Verified real failures with the
       LIVE catalogue: "rain" resolved to "Water & terrain labels" (it matched the letters "rain" INSIDE "ter-rain"),
       "clouds"/"co2" matched NOTHING (plural + the ₂ subscript), and bare "temperature" grabbed the ECMWF variant
       instead of the general air-temperature layer. Three fixes, all deterministic: (1) a curated multilingual ALIAS
       map (common/paraphrased term → the EXACT intended layer id), tried first; (2) subscript/superscript folding so
       "co2"↔"CO₂"; (3) WORD-aware scoring so a query is matched against whole words / word-prefixes, never as a
       fragment buried inside a bigger word. */
    const _SUBMAP={'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','²':'2','³':'3','¹':'1'};
    const _subnorm=s=>String(s==null?'':s).replace(/[₀-₉²³¹]/g,c=>_SUBMAP[c]||c);
    const _reEsc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const LAYER_ALIASES={
      'temperature':'dl-ec-temp','temp':'dl-ec-temp','air temperature':'dl-ec-temp','surface temperature':'dl-ec-temp','気温':'dl-ec-temp','温度':'dl-ec-temp','temperatur':'dl-ec-temp','температура':'dl-ec-temp','temperatura':'dl-ec-temp',
      'sea temperature':'dl-sst','sea surface temperature':'dl-sst','sst':'dl-sst','water temperature':'dl-sst','海水温':'dl-sst','水温':'dl-sst','ocean temperature':'dl-ec-sst',
      'rain':'dl-radar','rainfall':'dl-radar','radar':'dl-radar','雨':'dl-radar','降雨':'dl-radar','regen':'dl-radar','дождь':'dl-radar','lluvia':'dl-radar',
      'precipitation':'dl-precip','降水':'dl-precip','降水量':'dl-precip','niederschlag':'dl-precip','осадки':'dl-precip','precipitación':'dl-precip',
      'snow':'dl-snow','snow cover':'dl-snow','雪':'dl-snow','積雪':'dl-snow','schnee':'dl-snow','снег':'dl-snow','nieve':'dl-snow',
      'ice':'dl-snow','sea ice':'gx-gxseaice','sea-ice':'gx-gxseaice','海氷':'gx-gxseaice',
      'cloud':'dl-ec-cloud','clouds':'dl-ec-cloud','cloud cover':'dl-ec-cloud','雲':'dl-ec-cloud','雲量':'dl-ec-cloud','wolken':'dl-ec-cloud','облака':'dl-ec-cloud','nubes':'dl-ec-cloud',
      'wind':'dl-wind','風':'dl-wind','ветер':'dl-wind','viento':'dl-wind',
      'humidity':'dl-ec-dew','dew point':'dl-ec-dew','湿度':'dl-ec-dew','feuchtigkeit':'dl-ec-dew',
      'pressure':'dl-ec-slp','air pressure':'dl-ec-slp','sea level pressure':'dl-ec-slp','気圧':'dl-ec-slp','давление':'dl-ec-slp','isobars':'dl-ec-isobars','等圧線':'dl-ec-isobars',
      'aerosol':'dl-aod','haze':'dl-aod','smog':'dl-aod','エアロゾル':'dl-aod',
      'co2':'bx-wbco2','carbon dioxide':'bx-wbco2','二酸化炭素':'bx-wbco2',
      'eez':'dl-eez','exclusive economic zone':'dl-eez','排他的経済水域':'dl-eez',
      'submarine cables':'dl-subcables','sea cables':'dl-subcables','cables':'dl-subcables','海底ケーブル':'dl-subcables',
      'aircraft':'dl-planes','planes':'dl-planes','flights':'dl-planes','air traffic':'dl-planes','航空機':'dl-planes','飛行機':'dl-planes',
      'ships':'dl-ships','shipping':'dl-ships','vessels':'dl-ships','ship traffic':'dl-ships','船':'dl-ships','船舶':'dl-ships',
      'satellites':'dl-sats','satellite':'dl-sats','live satellites':'dl-sats','orbits':'dl-sats','satellite traffic':'dl-sats','人工衛星':'dl-sats','衛星':'dl-sats','軌道上の衛星':'dl-sats','satelliten':'dl-sats','спутники':'dl-sats','satélites':'dl-sats',
      'land cover':'eco-dl-worldcover','landcover':'eco-dl-worldcover','土地被覆':'eco-dl-worldcover',
      'ecoregions':'eco-dl-ecoregions','エコリージョン':'eco-dl-ecoregions',
      'tectonic plates':'eco-dl-plates','plates':'eco-dl-plates','プレート':'eco-dl-plates',
      'elevation':'dl-relief','relief':'dl-relief','標高':'dl-relief','hillshade':'dl-hillshade','陰影':'dl-hillshade',
      'contours':'dl-contours','contour lines':'dl-contours','等高線':'dl-contours',
      'sea level':'dl-sealevel','sea level rise':'dl-sealevel','海面上昇':'dl-sealevel',
      'vegetation':'gx-gxndvi','ndvi':'gx-gxndvi','植生':'gx-gxndvi',
      'soil moisture':'gx-gxsoil','土壌水分':'gx-gxsoil',
      'population':'dl-pop','population density':'dl-pop','人口':'dl-pop','人口密度':'dl-pop','bevölkerung':'dl-pop','население':'dl-pop','población':'dl-pop',
      'gdp':'dl-gdppc','gdp per capita':'dl-gdppc','一人当たりgdp':'dl-gdppc',
      'hdi':'dl-hdi','human development':'dl-hdi','fertility':'dl-tfr','fertility rate':'dl-tfr','出生率':'dl-tfr','democracy':'dl-dem','democracy index':'dl-dem','民主主義':'dl-dem',
      'forest':'bx-wbforest','life expectancy':'beta-dl-lifeexp','unemployment':'beta-dl-unemp','internet':'beta-dl-internet',
      'earthquake':'bx-eq','earthquakes':'bx-eq','地震':'bx-eq','quakes':'bx-eq','seismic':'bx-eq',
      'thermal':'dl-thermal','fires':'dl-thermal','wildfires':'dl-thermal','fire':'dl-thermal','火災':'dl-thermal','山火事':'dl-thermal',
      'aurora':'l9-dl-aurora','northern lights':'l9-dl-aurora','オーロラ':'l9-dl-aurora',
      'night lights':'dl-nightsat','nightlights':'dl-nightsat','city lights':'dl-nightsat','夜間光':'dl-nightsat','夜景':'dl-nightsat',
      'day night':'dl-nightside','day/night':'dl-nightside','昼夜':'dl-nightside','terminator':'dl-nightside','night side':'dl-nightside','夜側':'dl-nightside',
      'volcano':'beta-dl-volc2','volcanoes':'beta-dl-volc2','火山':'beta-dl-volc2',
      /* (#R353) …and the three Volcano Intelligence overlays, by the words a reader would use */
      'volcanic ash':'beta-dl-volcash','ash cloud':'beta-dl-volcash','ash':'beta-dl-volcash','sigmet':'beta-dl-volcash','火山灰':'beta-dl-volcash','vulkanasche':'beta-dl-volcash','пепел':'beta-dl-volcash','ceniza volcánica':'beta-dl-volcash',
      'volcano hazard':'beta-dl-volchaz','hazard zones':'beta-dl-volchaz','lahar':'beta-dl-volchaz','ハザード':'beta-dl-volchaz','火山ハザード':'beta-dl-volchaz','ラハール':'beta-dl-volchaz',
      'so2':'beta-dl-volcso2','sulfur dioxide':'beta-dl-volcso2','sulphur dioxide':'beta-dl-volcso2','二酸化硫黄':'beta-dl-volcso2','火山ガス':'beta-dl-volcso2',
      'nato':'dl-nato','eu':'dl-eu','european union':'dl-eu','military spending':'dl-milSpend','defense spending':'dl-milSpend','国防費':'dl-milSpend','軍事費':'dl-milSpend',
      'former soviet union':'fsu','ussr':'fsu','soviet':'fsu','旧ソ連':'fsu',
      'historical borders':'beta-dl-histb','歴史的国境':'beta-dl-histb','ukraine frontline':'beta-dl-ukrfront','frontline':'beta-dl-ukrfront','前線':'beta-dl-ukrfront',
      'railway':'cb-rail2','railways':'cb-rail2','rail':'cb-rail2','trains':'cb-rail2','鉄道':'cb-rail2','roads':'cb-roads','道路':'cb-roads',
      'borders':'cb-borders','country borders':'cb-borders','国境':'cb-borders','place names':'cb-names','地名':'cb-names','coastline':'cb-coast','coastlines':'cb-coast','coastlines & shores':'cb-coast','shoreline':'cb-coast','海岸線':'cb-coast','海岸線・湖岸線':'cb-coast','湖岸線':'cb-coast',   /* (#R289) +the coastline row */
      /* (#R186) the shop/facility names — a third label set beside place names and water/terrain names
         (standing rule: every feature is operable from Atlas) */
      'poi':'cb-poi','points of interest':'cb-poi','shops':'cb-poi','shop names':'cb-poi','facilities':'cb-poi',
      'venues':'cb-poi','店舗':'cb-poi','施設':'cb-poi','施設名':'cb-poi','店舗名':'cb-poi',
      'time zones':'dl-tz','timezones':'dl-tz','タイムゾーン':'dl-tz','時間帯':'dl-tz',
      'webcams':'dl-webcams','webcam':'dl-webcams','ライブカメラ':'dl-webcams','ウェブカメラ':'dl-webcams',
      'pipelines':'pipelines','nuclear':'nuclear','nuclear sites':'nuclear','chokepoints':'chokepoints',
      'data centers':'beta-dl-dc','datacenters':'beta-dl-dc','ai infrastructure':'beta-dl-dc',
      'religion':'beta-dl-cat-religion','language':'beta-dl-cat-language','languages':'beta-dl-cat-language'
    };
    function _cbByKey(key){ if(!key) return null; let cb=document.getElementById(key); if(cb&&cb.matches&&cb.matches('input[type=checkbox]')) return cb; cb=null;   /* (#R225) the `data-layer` convention retired with the geopolitics rows */ return cb||null; }
    function _labelOf(cb){ try{ const lab=cb.closest('label')||cb.closest('.lyr-row'); let disp=''; if(lab){ const sp=lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label'); disp=(sp?sp.textContent:(lab.textContent||'')); } return disp.replace(/\s+/g,' ').trim(); }catch(_){ return ''; } }
    function resolveLayer(name){ const q0=_lnorm(name); if(!q0) return null;
      /* 1) deterministic ALIAS — exact, then "… layer/overlay" stripped, then singular. */
      const aliasKeys=[q0, q0.replace(/\s+(layer|overlay|data|map|cover)$/,'')]; if(q0.length>3&&q0.endsWith('s')) aliasKeys.push(q0.slice(0,-1));
      for(const k of aliasKeys){ const id=LAYER_ALIASES[k]; if(id){ const cb=_cbByKey(id); if(cb) return {cb,label:_labelOf(cb)||name,score:100}; } }
      /* 2) WORD-aware scoring (variants: as-typed + singular), subscript-folded so co2↔CO₂. */
      const cat=layerCatalog(); const variants=[q0]; if(q0.length>3&&q0.endsWith('s')) variants.push(q0.slice(0,-1));
      let best=null,bs=0;
      cat.forEach(c=>{ const t=_subnorm(c.txt), id=c.id, dl=c.dl; let words; try{ words=t.split(/[^\p{L}\p{N}]+/u).filter(Boolean); }catch(_){ words=t.split(/[^a-z0-9]+/).filter(Boolean); } /* Unicode split keeps CJK/Cyrillic/accented words so layer matching works in every UI language */
        variants.forEach(qv=>{ const q=_subnorm(qv); let sc=0;
          if(id&&id===qv) sc=100; else if(dl&&dl===qv) sc=99; else if(t===q) sc=98;
          else if(t===q.replace(/ (layer|overlay)$/,'')) sc=96;
          else if(words.indexOf(q)>=0) sc=90;                                    /* q is a whole word in the label */
          else if(t.indexOf(q)===0&&q.length>=3) sc=84;                          /* label starts with q */
          else if(words.some(w=>w.indexOf(q)===0&&q.length>=3)) sc=80;           /* a word starts with q */
          else if(q.indexOf(t)===0&&t.length>=4) sc=78;
          else if(q.length>=3&&new RegExp('\\b'+_reEsc(q)+'\\b').test(t)) sc=72; /* q as a whole-word phrase (never inside a bigger word) */
          else if(q.length>=5&&t.indexOf(q)>=0) sc=52;                           /* long contiguous substring (safe) */
          else if(id&&id.indexOf(q)>=0&&q.length>=4) sc=56;
          else { const qt=q.split(' ').filter(w=>w.length>2); if(qt.length){ const hit=qt.filter(w=>words.indexOf(w)>=0||words.some(ww=>ww.indexOf(w)===0)).length; if(hit) sc=42*hit/qt.length+(hit===qt.length?12:0); } }
          if(sc>bs){ bs=sc; best=c; } }); });
      return (best&&bs>=40)?{cb:best.cb,label:best.label,score:bs}:null; }
    function toggleLayer(name,on){ const r=resolveLayer(name); if(!r) return {ok:false}; const want=on!==false; const already=(r.cb.checked===want);
      if(!already){ try{ r.cb.checked=want; r.cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} }
      return {ok:(r.cb.checked===want), label:r.label, already, want, cb:r.cb}; }   /* (#R142) expose the exact checkbox so reply toggles read THIS one's live state, not a fuzzy re-resolve (#17) */
    function layerOpacityControl(cb){ try{ const row=cb.closest('.lyr-row')||cb.closest('label'); if(!row) return null;
      let sl=row.querySelector&&row.querySelector('input[type=range]'); if(sl) return sl;
      let n=row.nextElementSibling; let k=0; while(n&&k++<2){ if(n.matches&&n.matches('input[type=range]')) return n; if(n.querySelector){ const s=n.querySelector('input[type=range]'); if(s) return s; } n=n.nextElementSibling; }
      if(cb.id){ const o=document.getElementById('op-'+cb.id.replace(/^dl-/,''))||document.getElementById(cb.id.replace(/^dl-/,'op-')); if(o&&o.type==='range') return o; } }catch(_){} return null; }
    const _setLast=h=>{ if(h&&h.lng!=null&&h.lat!=null){ _lastPlace={lng:+h.lng,lat:+h.lat,name:h.name||''}; } return h; };
    /* (#R199) ↳ js/atlas-geo-resolve.js — place / region resolution and camera framing.
       Moved whole; the 16 names below are what the rest of this file still calls. */
    const { DEIXIS_RE, REGION_ALIASES, WORLD_RE, _bboxOK, _classBonus, _geoAgrees, _gvStrong, _nomExtent, _rrResolve, flyToBox, geoVerify, geocode, parseDirectional, placeExtent, regionBox, sliceBox } = makeAtlasGeoResolve(HOST, { GE, L, _bboxSoftPoly, _cgPoly, _clipGeoRect, _codesGeo, _expandRegionCompound, _geoArea, _hlLegendHtml, _hlPaletteColor, _lnorm, _ptInGeo, _setLast, _validGeo, askAIJSONEnvelope, codeAtPoint, composeRegion, fbbox, geo, localFuzzyPlaces, regionGroup, resolveCountrySync, lastPlace: () => _lastPlace });
    /* (#R199) ↳ js/atlas-controls.js — the full-control action surface — real UI controls and module methods.
       Moved whole; the 8 names below are what the rest of this file still calls. */
    const { clickId, controlCatalog, doControl, doModule, findControl, kexec, moduleCatalog, setSel } = makeAtlasControls(HOST, { L, R, _ctlTogHtml, esc, note, warn });
    /* ⚠ (#R318) THIS SITS HERE, NOT WHERE THE BLOCK IT REPLACED SAT, AND THE REASON IS A REAL
       FAILURE. `_requestProfile` and its neighbours used to be hoisted `function` declarations, so
       window.IntMapAtlasQA — an object literal built five hundred lines ABOVE them — could name
       them. As destructured `const`s they are in their temporal dead zone up to this line, and the
       built app answered «Cannot access 'Jt' before initialization», thrown out of the Atlas
       factory, which then never mounted at all. It needs WORLD_RE (the line above) and nothing
       later, so it goes as early as it can. */
    /* (#R318) ↳ js/atlas-planner.js — the plan: its schema, its validation, its goal, its execution.
       The #R135 time-axis block moved WHOLE (request profile → plan validation → goal validation); the
       13 names below are what the rest of this file still calls, unchanged. ⚠ ATLAS_ACTION_CAPABILITIES
       is the SAME four tuned rows it always had PLUS one derived row per registry capability — four
       descriptors for a dispatch of 115 was the #R278 hole wearing another hat. */
    const _PLANNER=makeAtlasPlanner(HOST,{ WORLD_RE, wctx:_wctx, personaPrompt, capabilities:CAPS, results:RESULTS, executor:EXEC, state:ASTATE });
    const { ATLAS_ACTION_CAPABILITIES, PLAN_SCHEMA, _actionFamily, _goalValidation, _isWorldExpansion, _profileBlock, _repairGuidance, _requestProfile, _researchFamKey, _rpExtractYear, _rpGeoKind, _semanticRetryKey, _validatePlan } = _PLANNER;
    /* ---- (#R43) CHOROPLETH — genuine "data + map" combined output ("データやレイヤー、地図を組み合わせた複合的な
       処理＆出力"): shade EVERY country by a metric on a YlGnBu ramp (log-scaled for skewed metrics) with a legend,
       reusing the same nlq-src feature-state source the highlights use. ---- */
    const CHORO_RAMP=['#ffffcc','#a1dab4','#41b6c4','#2c7fb8','#253494'];
    let _choroRamp=CHORO_RAMP.slice();   /* (#R61) user-selectable shading hue ("色分けの色も指定可能に") */
    const _choroFillExpr=ramp=>['case',['!=',['feature-state','choroV'],null],['interpolate',['linear'],['to-number',['feature-state','choroV'],0],0,ramp[0],0.25,ramp[1],0.5,ramp[2],0.75,ramp[3],1,ramp[4]],'rgba(0,0,0,0)'];
    function ensureChoroLayer(){ if(!ensureHlLayers()) return false; if(GE().layers.has('nlq-choro')) return true;
      const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      try{ GE().layers.add({id:'nlq-choro',type:'fill',source:'nlq-src',paint:{
        'fill-color':_choroFillExpr(_choroRamp),
        'fill-opacity':['case',['!=',['feature-state','choroV'],null],0.62,0]}},before); return true; }catch(_){ return false; } }
    function clearChoro(){ try{ for(const c in _choroState){ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{choroV:null}); }catch(_){} } }catch(_){} _choroState={}; _choroMetric=null; try{ _customScoreName=null; }catch(_){} }
    function drawChoro(metricKey,order,color){ const m=METRICS[metricKey]; if(!m) return R(false, warn('⚠ '+L('Unknown metric','不明な指標','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')+': '+esc(metricKey||'')));
      if(!geo()) return R(false, warn('⚠ '+L('Map data not ready yet','地図データが未準備です','Kartendaten noch nicht bereit','Данные карты не готовы','Datos del mapa no listos')));
      /* (#R61) optional shading hue — honoured for REAL (setPaintProperty on the live layer) or honestly flagged. */
      let cWarn=''; if(color!=null&&String(color).trim()!==''){ const pc=parseColor(color); if(pc) _choroRamp=rampFrom(pc); else cWarn=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(color)); }
      clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); if(!ensureChoroLayer()) return R(false, warn('⚠ '+L('Could not draw the map shading','地図の濃淡を描けませんでした','Karteneinfärbung fehlgeschlagen','Не удалось окрасить карту','No se pudo sombrear el mapa')));
      try{ GE().layers.setPaint('nlq-choro','fill-color',_choroFillExpr(_choroRamp)); }catch(_){}
      const vals=[]; for(const code in countryStats){ const s=countryStats[code]; if(!s) continue; let v=m.get(s); if(v==null||isNaN(v)) continue; if(m.log&&v<=0) continue; vals.push({code, raw:v, t:(m.log?Math.log(v):v)}); }
      if(vals.length<3) return R(false, warn('⚠ '+L('Not enough data for this metric','この指標はデータ不足です','Zu wenig Daten','Недостаточно данных','Datos insuficientes')));
      let lo=Infinity,hi=-Infinity; vals.forEach(p=>{ lo=Math.min(lo,p.t); hi=Math.max(hi,p.t); }); const span=(hi-lo)||1; const bottom=(String(order||'')==='bottom'||String(order||'')==='reverse');
      vals.forEach(p=>{ let nv=(p.t-lo)/span; if(bottom) nv=1-nv; _choroState[String(p.code)]=nv; try{ GE().layers.setFeatureState({source:'nlq-src',id:String(p.code)},{choroV:nv}); }catch(_){} });
      _choroMetric=metricKey; try{ GE().camera.flyTo({zoom:Math.min(GE().camera.getZoom(),2.3),duration:600}); }catch(_){}
      const sorted=vals.slice().sort((x,y)=>y.raw-x.raw); const top=sorted[0], bot=sorted[sorted.length-1];
      const loTxt=esc(fmtVal(metricKey, m.log?Math.exp(lo):lo)), hiTxt=esc(fmtVal(metricKey, m.log?Math.exp(hi):hi));
      const grad='linear-gradient(90deg,'+_choroRamp.join(',')+')';
      let html='<div style="font-weight:600;margin:2px 0 5px;">'+esc(lx(m.label))+' — '+L('map shading','地図の濃淡','Kartenfärbung','окраска карты','sombreado del mapa')+'</div>';
      html+='<div style="height:12px;border-radius:6px;background:'+grad+';margin:4px 0;"></div>';
      html+='<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);"><span>'+(bottom?hiTxt:loTxt)+'</span><span>'+(bottom?loTxt:hiTxt)+'</span></div>';
      html+='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">'+L('High','最高','Höchster','Макс.','Máx.')+': '+esc(nm(countryStats[top.code]))+' ('+esc(fmtVal(metricKey,top.raw))+') · '+L('Low','最低','Niedrigster','Мин.','Mín.')+': '+esc(nm(countryStats[bot.code]))+' ('+esc(fmtVal(metricKey,bot.raw))+')</div>';
      return R(true, note(html)+cWarn); }
    /* ==== (#R75) vision §10/§13 groundwork — metric series shared by explore & scoreMap ==== */
    /* (#R75) hoisted from localPlan so _metSpec can translate metric names too */
    const VMET={'population':'pop','人口':'pop','population density':'density','density':'density','人口密度':'density','area':'area','面積':'area','gdp':'gdp','gdp per capita':'gdppc','gdppc':'gdppc','一人当たりgdp':'gdppc','1人当たりgdp':'gdppc','hdi':'hdi','human development index':'hdi','fertility':'tfr','fertility rate':'tfr','出生率':'tfr','合計特殊出生率':'tfr','democracy index':'dem','民主主義指数':'dem','military spending':'milSpend','defense spending':'milSpend','国防費':'milSpend','軍事費':'milSpend','capital':'capital','capital city':'capital','首都':'capital','currency':'currency','通貨':'currency','languages':'languages','language':'languages','言語':'languages','公用語':'languages','flag':'flag','国旗':'flag'};
    const XMET={
      lifeExp:{label:LA('Life expectancy','平均寿命','Lebenserwartung','Ожид. продолжительность жизни','Esperanza de vida'),get:s=>s.lifeExp},
      internet:{label:LA('Internet users %','ネット利用率','Internetnutzer %','Интернет-пользователи %','Usuarios de internet %'),get:s=>s.internet}
    };
    const XVMET={'平均寿命':'lifeExp','寿命':'lifeExp','life expectancy':'lifeExp','lifeexp':'lifeExp','ネット利用率':'internet','インターネット利用率':'internet','internet':'internet','internet users':'internet'};
    function _metSpec(key){ const raw=String(key||'').trim(); if(!raw) return null;
      const k2=VMET[raw.toLowerCase()]||XVMET[raw.toLowerCase()]||XVMET[raw]||raw;
      if(METRICS[k2]) return {key:k2,m:METRICS[k2]};
      if(XMET[k2]) return {key:k2,m:XMET[k2]};
      return null; }
    /* one component (bundled metric or a World-Bank indicator code) → {label, vals:{ISO3:num}, log} */
    async function _seriesFor(comp){ try{
      if(comp&&comp.wb){ if(!(window.IntMapWB&&window.IntMapWB.fetch)) return null;
        let m=null; try{ m=await window.IntMapWB.fetch(String(comp.wb).trim()); }catch(_){ m=null; }
        if(!m) return null; const vals={}; for(const cd in m){ const v=m[cd]&&m[cd].v; if(v!=null&&isFinite(v)) vals[cd]=+v; }
        if(Object.keys(vals).length<20) return null;
        return {label:String(comp.label||comp.wb).slice(0,60),vals,log:false,src:'World Bank '+String(comp.wb)}; }
      const sp=_metSpec(comp&&(comp.metric||comp.key||comp.name)); if(!sp) return null;
      await _fillMetric(sp.key);
      const vals={}; for(const cd in countryStats){ const s=countryStats[cd]; if(!s) continue; let v=sp.m.get(s); if(v==null||isNaN(v)) continue; if(sp.m.log&&v<=0) continue; vals[cd]=+v; }
      if(Object.keys(vals).length<20) return null;
      return {label:lx(sp.m.label),vals,log:!!sp.m.log,mkey:sp.key,src:null}; }catch(_){ return null; } }
    /* robust 0..1 normalisation: log where flagged, clamped to the 5th–95th percentile so one outlier
       cannot flatten everyone else (vision §10: 外れ値を考慮) */
    function _normSeries(ser){ const arr=Object.keys(ser.vals).map(cd=>ser.log?Math.log(ser.vals[cd]):ser.vals[cd]).sort((a,b)=>a-b);
      const q=p=>arr[Math.max(0,Math.min(arr.length-1,Math.round(p*(arr.length-1))))];
      const lo=q(0.05),hi=q(0.95),span=(hi-lo)||1e-9; const out={};
      for(const cd in ser.vals){ let v=ser.vals[cd]; if(ser.log) v=Math.log(v); out[cd]=Math.max(0,Math.min(1,(v-lo)/span)); }
      return out; }
    /* some bundled fields are lazy-filled by their layer (tfr — R70); explore/scoreMap fill them from the
       World Bank bulk endpoint on demand so 「少子化と相関する指標」 works without the layer ever having been on */
    const _WBFILL={tfr:{c:'SP.DYN.TFRT.IN',f:'tfr'},lifeExp:{c:'SP.DYN.LE00.IN',f:'lifeExp'},internet:{c:'IT.NET.USER.ZS',f:'internet'}};
    async function _fillMetric(key){ try{ const spec=_WBFILL[key]; if(!spec) return;
      let have=0; for(const cd in countryStats){ const s=countryStats[cd]; if(s&&s[spec.f]!=null&&!isNaN(s[spec.f])) have++; }
      if(have>=25) return;
      if(!(window.IntMapWB&&window.IntMapWB.fetch)) return;
      const m=await window.IntMapWB.fetch(spec.c); if(!m) return;
      for(const cd in m){ const v=m[cd]&&m[cd].v; if(v==null||!isFinite(v)) continue;
        const s=countryStats[cd]; if(s&&(s[spec.f]==null||isNaN(s[spec.f]))) s[spec.f]=+v; } }catch(_){} }
    function _pearson(xs,ys){ const n=xs.length; if(n<3) return null; let sx=0,sy=0; for(let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; }
      const mx=sx/n,my=sy/n; let sxy=0,sxx=0,syy=0;
      for(let i=0;i<n;i++){ const dx=xs[i]-mx,dy=ys[i]-my; sxy+=dx*dy; sxx+=dx*dx; syy+=dy*dy; }
      const d=Math.sqrt(sxx*syy); return d>0?(sxy/d):null; }
    function _ranks(a){ const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]); const r=new Array(a.length);
      for(let i=0;i<idx.length;){ let j=i; while(j+1<idx.length&&idx[j+1][0]===idx[i][0]) j++;
        const avg=(i+j)/2+1; for(let k=i;k<=j;k++) r[idx[k][1]]=avg; i=j+1; } return r; }
    function _havKm(a,b){ const R2=6371,d2r=Math.PI/180; const dLa=(b.lat-a.lat)*d2r,dLo=(b.lng-a.lng)*d2r;
      const h=Math.sin(dLa/2)**2+Math.cos(a.lat*d2r)*Math.cos(b.lat*d2r)*Math.sin(dLo/2)**2;
      return 2*R2*Math.asin(Math.min(1,Math.sqrt(h))); }
    let _customScoreName=null;
    /* ---- (#R43) name → country code (for time-series / isolate / select). EN/JP names from countryStats, else
       geocode + point-in-polygon over the country geometry so DE/RU/ES names resolve too. ---- */
    function _pipRing(x,y,ring){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; } return inside; }
    function _pipPoly(x,y,poly){ if(!poly||!poly.length||!_pipRing(x,y,poly[0])) return false; for(let i=1;i<poly.length;i++){ if(_pipRing(x,y,poly[i])) return false; } return true; }
    function _pipFeat(x,y,gm){ if(!gm) return false; if(gm.type==='Polygon') return _pipPoly(x,y,gm.coordinates); if(gm.type==='MultiPolygon') return gm.coordinates.some(p=>_pipPoly(x,y,p)); return false; }
    function codeAtPoint(lng,lat){ try{ const g=geo(); if(!g||!g.features) return null; for(const f of g.features){ if(_pipFeat(lng,lat,f.geometry)) return String(f.id); } }catch(_){} return null; }
    function resolveCountrySync(name){ try{
      /* (#R62) common short names that don't literally appear in nameEn/nameJp */
      const CJA={'韓国':'south korea','北朝鮮':'north korea','米国':'united states','英国':'united kingdom','豪州':'australia','南ア':'south africa','UAE':'united arab emirates','uae':'united arab emirates','USA':'united states','usa':'united states','UK':'united kingdom','uk':'united kingdom'};
      const alias=CJA[String(name||'').trim()]; if(alias) name=alias;
      const q=_lnorm(name); if(!q||typeof countryStats==='undefined'||!countryStats) return null; let best=null,bs=0;
      for(const code in countryStats){ const s=countryStats[code]; if(!s) continue; const en=_lnorm(s.nameEn||''), jp=_lnorm(s.nameJp||''); let sc=0;
        if(en===q||jp===q) sc=100; else if((en&&en.indexOf(q)===0)||(jp&&jp.indexOf(q)===0)) sc=82; else if(q.length>3&&((en&&en.indexOf(q)>=0)||(jp&&jp.indexOf(q)>=0))) sc=64; else if(en&&q.length>4&&q.indexOf(en)===0) sc=58;
        /* (#R136) a NON-sovereign micro-feature (glacier / shoal / no-man's-land: Southern Patagonian Ice Field,
           Scarborough Shoal, Bir Tawil) must not be grabbed by a LOOSE substring match — "Patagonia" was resolving to
           the ice field ("patagonia" ⊂ "…Patagonian Ice Field", sc 64) instead of the region ("見当違いの場所"). Require
           an exact or start-of-name match for these, so a loose query falls through to the region/Nominatim resolver. */
        if(sc>0&&sc<82&&s.sov===false) sc=0;
        if(sc>bs){ bs=sc; best={code, name:cName(s), ll:(s.latlng?{lng:s.latlng[1],lat:s.latlng[0]}:null)}; } }
      return bs>=58?best:null; }catch(_){ return null; } }
    async function resolveCountry(name){ const c=resolveCountrySync(name); if(c) return c; try{ const ll=await geocode(name); if(ll){ const code=codeAtPoint(ll.lng,ll.lat); if(code&&countryStats[code]){ const s=countryStats[code]; return {code, name:cName(s), ll}; } return {code:null, name:ll.name||name, ll}; } }catch(_){} return null; }
    /* short human label for a step, used in the honest failure summary */
    function actLabel(a){ if(!a||!a.type) return ''; const x=a.name||a.place||a.country||a.metric||a.query||a.topic||a.mode||a.lang||a.unit||a.from||a.target||''; return a.type+(x?(' "'+String(x).slice(0,26)+'"'):''); }
    /* (#R80) vision §17 — IntMap SELF-DIAGNOSIS. Atlas monitors whether IntMap's OWN data pipeline is healthy:
       is the news feed still updating, are the live data APIs Atlas relies on reachable, and are the layers the
       user turned on actually painting? All checks reuse data/endpoints IntMap ALREADY uses (no new external
       source): news + layer checks are purely local; endpoint probes hit USGS / Open-Meteo / GDELT, which are
       already disclosed in Sources & Privacy §4. A synchronous flag from the cache surfaces problems to Atlas in
       stateContext; the "diagnose" action runs a fresh full check on demand. */
    const _HEALTH={ endpoints:null, probedAt:0, probing:false };
    function _newsHealth(){ try{ if(typeof HOST.globalData==='undefined'||!HOST.globalData||!HOST.globalData.length) return {count:0,ageH:null,stale:true};
      let newest=0; HOST.globalData.forEach(it=>{ let t=0; try{ t=(typeof parseDate==='function'&&parseDate(it.pubDate))?parseDate(it.pubDate).getTime():Date.parse(it.pubDate); }catch(_){} if(t&&t>newest) newest=t; });
      const ageH=newest?Math.max(0,Math.round((Date.now()-newest)/3600000)):null;
      return {count:HOST.globalData.length, ageH, stale:(ageH==null||ageH>12)}; }catch(_){ return {count:0,ageH:null,stale:true}; } }
    function _layerHealth(){ try{ let on=0,bad=0; const badN=[]; layerCatalog().forEach(c=>{ if(c.cb&&c.cb.checked){ on++; try{ if(window.IntMapLayerAudit&&window.IntMapLayerAudit.check(c.cb.id)===false){ bad++; if(badN.length<6) badN.push(c.label); } }catch(_){} } }); return {on,bad,badN}; }catch(_){ return {on:0,bad:0,badN:[]}; } }
    const _PROBES=[
      {k:'USGS earthquakes', u:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson', mode:'direct'},
      {k:'Open-Meteo', u:'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m', mode:'direct'},
      {k:'GDELT news', u:'https://api.gdeltproject.org/api/v2/doc/doc?query=news&mode=artlist&maxrecords=1&format=json&timespan=1d', mode:'proxy'}
    ];
    async function _probeOne(p){ const t0=Date.now();
      if(p.mode==='proxy'){ try{ /* cap the proxy ladder (direct+2 proxies could take ~27 s) so a health check stays responsive */
        const j=await Promise.race([_fetchJSON(p.u), new Promise(r=>setTimeout(()=>r('__to__'),8000))]); const okp=(!!j&&j!=='__to__'); return {ok:okp, ms:Date.now()-t0, status:okp?200:0}; }catch(_){ return {ok:false, ms:Date.now()-t0, status:0}; } }
      try{ const c=('AbortController' in window)?new AbortController():null; const to=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },7000):null;
        const r=await fetch(p.u,c?{signal:c.signal,cache:'no-store'}:{cache:'no-store'}); if(to) clearTimeout(to); return {ok:!!(r&&r.ok), ms:Date.now()-t0, status:r?r.status:0}; }catch(e){ return {ok:false, ms:Date.now()-t0, status:0, err:(e&&e.name)||'error'}; } }
    async function probeEndpoints(force){ if(_HEALTH.probing) return _HEALTH.endpoints; if(!force&&_HEALTH.endpoints&&(Date.now()-_HEALTH.probedAt)<300000) return _HEALTH.endpoints;
      _HEALTH.probing=true; try{ const res={}; await Promise.all(_PROBES.map(async p=>{ res[p.k]=await _probeOne(p); })); _HEALTH.endpoints=res; _HEALTH.probedAt=Date.now(); return res; } finally{ _HEALTH.probing=false; } }
    async function healthCheck(opts){ opts=opts||{}; const news=_newsHealth(), layers=_layerHealth();
      let endpoints=_HEALTH.endpoints; if(opts.probe!==false){ try{ endpoints=await probeEndpoints(opts.probe===true); }catch(_){} }
      const down=endpoints?Object.keys(endpoints).filter(k=>!endpoints[k].ok):[];
      const ok=(!news.stale)&&(layers.bad===0)&&(down.length===0);
      return {ok, news, layers, endpoints, down, probedAt:_HEALTH.probedAt}; }
    /* synchronous flag from the CACHE only (no network) — safe to call inside stateContext every turn. */
    function _healthFlag(){ try{ const parts=[]; const n=_newsHealth(); if(n.stale&&n.count) parts.push('the loaded news feed looks stale (newest item is '+(n.ageH==null?'undated':n.ageH+'h old')+' — the feed may have stopped updating)');
      const l=_layerHealth(); if(l.bad) parts.push(l.bad+' enabled layer(s) are NOT painting on the map'+(l.badN.length?(' ('+l.badN.join(', ')+')'):'')+' — their data may be loading or their source may be down');
      const ep=_HEALTH.endpoints; if(ep){ const down=Object.keys(ep).filter(k=>!ep[k].ok); if(down.length) parts.push('these live data sources were unreachable at the last check: '+down.join(', ')); }
      return parts.length?('SELF-DIAGNOSIS ALERT (IntMap health) — '+parts.join('; ')+'. If the question depends on this data, tell the user honestly and, where possible, use an alternative; suggest they say "diagnose" for a full check.'):''; }catch(_){ return ''; } }
    try{ window.IntMapDataHealth={ check:o=>healthCheck(o), news:_newsHealth, layers:_layerHealth, probe:f=>probeEndpoints(f), flag:_healthFlag, last:()=>_HEALTH.endpoints }; }catch(_){}
    /* light "常時監視": one probe ~25 s after load, then every 10 min — but ONLY while the tab is visible, so a
       backgrounded tab never spams the network (also keeps the headless preview quiet). */
    try{ const _tick=()=>{ try{ if(document.visibilityState==='visible') probeEndpoints(false).catch(()=>{}); }catch(_){} };
      setTimeout(_tick,25000); setInterval(_tick,600000);
      document.addEventListener('visibilitychange',()=>{ try{ if(document.visibilityState==='visible'&&(!_HEALTH.probedAt||(Date.now()-_HEALTH.probedAt)>600000)) _tick(); }catch(_){} }); }catch(_){}
    /* (#R44) a compact snapshot of what is CURRENTLY on screen, fed to the model so it can ground references
       ("there", "this country", "turn that layer off", "zoom in more", "the same") in the real map state. */
    /* ══ (#R318) THE PARAGRAPH IS NOW DERIVED FROM THE SNAPSHOT ════════════════════════════════
       Twenty-nine hand-written sentences stood here, one per subject, each added by whichever round
       needed one — and a subject nobody remembered to add was invisible to the planner. The FACTS are
       published by their owners now (js/atlas-state.js's providers, plus the four this file registers),
       and the READING RULES — «map "here"/"there" to it», «this date is a DISPLAY setting, NEVER the
       year of the data» — live in the renderer, which reads ONLY the snapshot: no `document`, no
       `window`, nothing it could observe for itself.
       ⚠ THE TEXT IS THE SAME TEXT. The move was verified line for line against the old body before it
       was made — 31 lines out, 31 lines in, in the same order, over the same fixtures. `toPrompt()`
       is the OTHER projection of the same snapshot: JSON, for the executor's verification, the debug
       record and the audit. Two readers, one source. */
    function stateContext(){ try{ return ASTATE.renderPrompt(ASTATE.snapshot()); }catch(_){ return ''; } }
    /* (#R44) build the USER message = current state + recent conversation + the new request, so the model has
       the CONTEXT it was completely missing before. */
    function buildPrompt(q, profile){ let p=''; const ctx=stateContext(); if(ctx) p+='[CURRENT MAP STATE]\n'+ctx+'\n\n';
      try{ const pr=profile||_requestProfile(q); const pb=_profileBlock(pr); if(pb) p+=pb+'\n'; }catch(_){}   /* (#R135) machine-parsed temporal/geo/evidence hints + enforced action-choice rules */
      if(_herePoint&&isFinite(_herePoint.lng)) p+='[PINNED POINT] The user clicked an EXACT spot on the map: latitude '+(+_herePoint.lat).toFixed(4)+', longitude '+(+_herePoint.lng).toFixed(4)+(_herePoint.name?(' (near '+_herePoint.name+')'):'')+'. Words like "here / this spot / this place / この地点 / ここ / hier / здесь / aquí" refer to THIS coordinate. First work out what is at or near it (country, region, city, terrain, sea) and answer about it specifically; if it is ocean or uninhabited say so. You may also pass place:"there" to actions and it resolves to this point.\n\n';
      const wc=wctxBlock(); if(wc) p+='[WORKING CONTEXT] (what this conversation is currently about — resolve "the same/them/それ/同じ条件" against this)\n'+wc+'\n\n';
      if(_hist.length) p+='[RECENT CONVERSATION] (oldest→newest; resolve pronouns/follow-ups against this)\n'+_hist.slice(-8).map(x=>x.s).join('\n')+'\n\n';   /* (#R298) an entry is {t,s} — the model reads `s`, `t` exists so an edited message can rewind the history */
      p+='[NEW REQUEST]\n'+q+'\n\nInterpret the request IN CONTEXT of the state and conversation above. Resolve references like "it / that / there / here / this country / the same / again / now / turn it off / make it bigger / the Nth one / zoom in more" using them. If the request is a tweak of the previous one, keep the parts that still apply.'
        /* (#R118) clarification-loop killer (the "ワルシャワ条約機構→何年?" death-spiral): resolve deictic references
           from context, one clarifying question MAX, and on pushback COMMIT to the best-faith reading. */
        +'\nDeixis & clarification rules: (1) それ/さっきの/今表示した/what you showed ALWAYS refers to the most recent Atlas output in the conversation/state above — resolve it yourself, do not ask which. (2) Ask at most ONE clarifying question about a topic, and only when truly必要; NEVER re-ask or offer another menu of interpretations after the user objects — commit to the most reasonable reading and answer. (3) The time-travel/display date is never "the year of the data"; a highlight\'s membership year comes from its stated BASIS. (4) Never claim a fact is unknowable when the state above contains it.';
      return p; }
    /* ---- (#R61) INTEGRATED ANALYSIS ("レイヤーの数値や最新ニュース、その他様々なIntMapの機能を統合して分析…
       横断的で統合的な出力"): Atlas gathers REAL data from the sources IntMap already uses — the loaded news
       (globalData; loaded on demand via fetchData if empty), live weather / air quality / sea temperature /
       elevation (Open-Meteo — already a listed provider), recent earthquakes (USGS — already the map layer's
       source) and countryStats — then ONE text-AI call synthesizes the answer FROM THAT DATA ONLY. Datasets
       that returned nothing are listed honestly in the footer (never silently pretended). ---- */
    async function _fetchJSON(url){ /* direct → the app's usual CORS proxies (GDELT/IMF don't send ACAO) */
      try{ if(window.IntMapWx&&window.IntMapWx.isOpenMeteo(url)) return await window.IntMapWx.guardedJSON(url,300000); }catch(_){}   /* (#R276) …except Open-Meteo: CORS-open and rate-limited, so it goes through the app's ONE guarded client (js/wx-source.js) */
      const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
      for(const p of PROX){ try{ const c=('AbortController' in window)?new AbortController():null; const t2=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },9000):null;
        const r=await fetch(p(url),c?{signal:c.signal}:undefined); if(t2) clearTimeout(t2); if(r&&r.ok) return await r.json(); }catch(_){} }
      return null; }
    function _agoH(d){ try{ const t2=(typeof parseDate==='function')?parseDate(d).getTime():Date.parse(d); if(!t2) return null; return Math.max(0,Math.round((Date.now()-t2)/3600000)); }catch(_){ return null; } }
    function _newsData(ctx,q,sink){ try{ if(typeof HOST.globalData==='undefined'||!HOST.globalData||!HOST.globalData.length) return null;
      let items=HOST.globalData.slice();
      if(ctx&&ctx.box){ const w=ctx.box[0][0],s2=ctx.box[0][1],e=ctx.box[1][0],n=ctx.box[1][1]; items=items.filter(it=>{ const l=it.analysis&&it.analysis.loc; return l&&l[0]>=w&&l[0]<=e&&l[1]>=s2&&l[1]<=n; }); }
      else if(ctx&&ctx.lng!=null&&isFinite(ctx.lng)){ items=items.filter(it=>{ const l=it.analysis&&it.analysis.loc; if(!l) return false; return Math.hypot((l[0]-ctx.lng)*Math.cos(((ctx.lat||0))*Math.PI/180), l[1]-ctx.lat)<=6; }); }
      else if(q){ let terms; try{ terms=String(q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>3); }catch(_){ terms=String(q).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3); }
        if(terms.length){ const kw=items.filter(it=>{ const t2=(it.title||'').toLowerCase(); return terms.some(w=>t2.indexOf(w)>=0); }); if(kw.length) items=kw; } }
      if(!items.length) return null;
      items=items.slice().sort((x,y)=>{ const a2=_agoH(x.pubDate), b2=_agoH(y.pubDate); return (a2==null?1e9:a2)-(b2==null?1e9:b2); });
      const top=items.slice(0,12);
      /* (#R79) collect the REAL article {url,title,src} so Atlas can render ChatGPT-style source cards that
         do NOT depend on the model echoing a SOURCES line (the loaded feed's links were being discarded). */
      try{ if(sink) top.forEach(it=>{ const a2=it.analysis||{}; if(it.link) sink.push({url:it.link,title:it.title,src:(it.publisher||a2.name||''),date:(function(){try{return it.pubDate?new Date(it.pubDate).toISOString().slice(0,10):'';}catch(_){return '';}})(),loc:(a2.loc&&isFinite(a2.loc[0])?a2.loc:null),place:(a2.name||''),dateType:'publication_date',origin:'loaded'}); }); }catch(_){}   /* (#R113) date + known location → evidence record; (#R131) pubDate is the article date, not the event date */
      return top.map(it=>{ const a2=it.analysis||{}; const h=_agoH(it.pubDate); return '- '+String(it.title||'').slice(0,140)+' ['+(it.publisher||'?')+(a2.name?(' @ '+a2.name):'')+(h!=null?(' · '+h+'h ago'):'')+']'; }).join('\n')||null; }catch(_){ return null; } }
    async function _quakeData(ctx){ const j=await _fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'); if(!j||!Array.isArray(j.features)||!j.features.length) return null;
      let fs=j.features;
      if(ctx&&ctx.box){ const w=ctx.box[0][0],s2=ctx.box[0][1],e=ctx.box[1][0],n=ctx.box[1][1]; fs=fs.filter(f=>{ const c=f.geometry&&f.geometry.coordinates; return c&&c[0]>=w&&c[0]<=e&&c[1]>=s2&&c[1]<=n; }); }
      else if(ctx&&ctx.lng!=null&&isFinite(ctx.lng)){ fs=fs.filter(f=>{ const c=f.geometry&&f.geometry.coordinates; if(!c) return false; return Math.hypot((c[0]-ctx.lng)*Math.cos(((ctx.lat||0))*Math.PI/180), c[1]-ctx.lat)<=15; }); }
      if(!fs.length) return '(no M2.5+ earthquakes in this area in the last 24 h)';
      fs=fs.slice().sort((a2,b2)=>(((b2.properties&&b2.properties.mag)||0)-((a2.properties&&a2.properties.mag)||0))).slice(0,10);
      return fs.map(f=>{ const p=f.properties||{}, c=(f.geometry&&f.geometry.coordinates)||[]; const h=p.time?Math.round((Date.now()-p.time)/3600000):null; return '- M'+(p.mag!=null?(+p.mag).toFixed(1):'?')+' '+(p.place||'')+(h!=null?(' · '+h+'h ago'):'')+(c[2]!=null?(' · depth '+Math.round(c[2])+' km'):''); }).join('\n'); }
    async function _weatherData(lng,lat){ const j=await _fetchJSON('https://api.open-meteo.com/v1/forecast?latitude='+(+lat).toFixed(3)+'&longitude='+(+lng).toFixed(3)+'&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&timezone=auto'); const c=j&&j.current; if(!c) return null;
      return 'temperature '+c.temperature_2m+'°C (feels like '+c.apparent_temperature+'°C), humidity '+c.relative_humidity_2m+'%, precipitation '+c.precipitation+' mm, wind '+c.wind_speed_10m+' km/h @ '+c.wind_direction_10m+'°, surface pressure '+c.surface_pressure+' hPa, WMO weather code '+c.weather_code; }
    async function _airData(lng,lat){ const j=await _fetchJSON('https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+(+lat).toFixed(3)+'&longitude='+(+lng).toFixed(3)+'&current=us_aqi,pm2_5,pm10,ozone'); const c=j&&j.current; if(!c) return null; return 'US AQI '+c.us_aqi+', PM2.5 '+c.pm2_5+' µg/m³, PM10 '+c.pm10+' µg/m³, ozone '+c.ozone+' µg/m³'; }
    async function _sstData(lng,lat){ const j=await _fetchJSON('https://marine-api.open-meteo.com/v1/marine?latitude='+(+lat).toFixed(3)+'&longitude='+(+lng).toFixed(3)+'&current=sea_surface_temperature'); const v=j&&j.current&&j.current.sea_surface_temperature; return (v==null)?null:('sea surface temperature '+v+'°C'); }
    async function _elevData(lng,lat){ const j=await _fetchJSON('https://api.open-meteo.com/v1/elevation?latitude='+(+lat).toFixed(4)+'&longitude='+(+lng).toFixed(4)); const v=j&&j.elevation&&j.elevation[0]; return (v==null)?null:('elevation '+Math.round(v)+' m'); }
    function _statsData(codes){ try{ const out=[]; (codes||[]).forEach(cd=>{ const s=countryStats[cd]; if(!s) return; const parts=[]; for(const k in METRICS){ const v=METRICS[k].get(s); if(v==null||isNaN(v)) continue; parts.push(lx(METRICS[k].label)+'='+fmtVal(k,v)); } if(s.capital) parts.push('capital='+s.capital); if(parts.length) out.push(nm(s)+': '+parts.join(', ')); }); return out.length?out.join('\n'):null; }catch(_){ return null; } }
    /* ⚠ (#R350) THE SAME NUMBERS, AS EVIDENCE INSTEAD OF PROSE. `_statsData` renders the country
       table into a block of text, and a figure quoted out of a block of text can only ever be
       ATTRIBUTED — never checked. The same rows here become supportFacts with their own seriesId,
       so js/atlas-answer-audit.js can ask which row a number in the answer actually came from, and
       say so when the answer chains two of them into one sentence. */
    function _statsFacts(codes){ try{ return (codes||[]).map(cd=>{ const s2=countryStats[cd]; if(!s2) return null;
      const facts=[]; for(const k in METRICS){ const v=METRICS[k].get(s2); if(v==null||isNaN(v)) continue;
        facts.push({ seriesId:'intmap.country.'+k, concept:lx(METRICS[k].label), value:+v, unit:k, basis:'reported', geography:nm(s2), period:'latest' }); }
      return facts.length?{ title:nm(s2), publisher:'IntMap', validTime:'latest', dateType:'valid_time', supportFacts:facts }:null;
    }).filter(Boolean); }catch(_){ return []; } }
    /* (#R74) LIVE incumbent lookup ("まだ現在の首相名等をAtlasは間違えている"): the model's memory is stale by
       definition and even a forced web search sometimes surfaces old articles. Wikidata's P6 (head of
       government) / P35 (head of state) statements are community-updated within hours of a change, are
       CC0, and are queried LIVE here — the names go into the analyze evidence as an authoritative block,
       so the answer no longer depends on the model searching diligently. */
    const OFFICE_RE=/(首相|大統領|総理|内閣総理|国家元首|首脳|指導者|大臣|総裁|党首|知事|prime minister|president|chancellor|premier|head of (?:state|government)|leader|кто (?:сейчас )?(?:президент|премьер)|президент|премьер|kanzler|regierungschef|staatsoberhaupt|presidente|primer ministro)/i;
    /* ============================ (#R131) FRESHNESS-CRITICAL ANALYSIS ============================
       Root cause of the "72-hour Central Asia monitoring" misfire: `analyze` always called the model
       with webMode:"auto" (search OPTIONAL), gave it a UTC-only DATE (no clock, no time zone, no
       window) and fed bare headlines whose PUBLICATION/seen date the model then mistook for the
       EVENT date. So a July-7 domestic incident (outside the requested 72 h) got used as in-window
       "direct evidence" and a serious-sounding headline became "escalation". These helpers decide when
       a question DEMANDS live verification, and give the model a real clock + window. */
    const _FRESH_TIMEWIN=/(\d+)\s*(時間以内|時間|hours?|hrs?|日間|日以内|days?|週間|weeks?|ヶ月|か月|months?|minutes?|mins?|分)|直近|過去\s*\d|last\s+\d+|next\s+\d+|previous\s+\d+|coming\s+\d+|прошедш|следующ|за\s+послед|últim|próxim/i;
    const _FRESH_NOW=/\blatest\b|\bcurrent(?:ly)?\b|\btoday\b|tonight|\bnow\b|recent(?:ly)?|breaking|as of|最新|現在|直近|今日|今夜|近況|現況|足元|いま\b|aktuell|jetzt|heute|derzeit|momentan|сейчас|текущ|сегодня|actualmente|\bactual\b|\bhoy\b|\bahora\b|reciente/i;
    const _FRESH_MON=/monitor|\bwatch(?:list)?\b|\balert\b|escalat|threat\s*level|posture|readiness|contingenc|警戒|監視|警報|引き上げ|アラート|脅威度|即応|情勢|Überwach|Warnstufe|Bedrohungs|Lage(?:beurteilung)?|мониторинг|наблюден|тревог|угроз|боеготов|vigilancia|alerta|amenaza|nivel de|situación/i;
    const _FRESH_FC=/fact.?check|verif|debunk|検証|ファクトチェック|真偽|事実確認|裏付け|裏取り|prüf|провер|verificar|comprob|desmentir/i;
    const _FRESH_DIRECT=/direct(?:ly)?\s+evidence|\bconfirmed\b|\bverified\b|situation\s+report|sitrep|直接的?証拠|確認済|確証|状況報告|情勢報告|evidencia directa|confirmad|подтвержд/i;
    /* An explicit "N hours/days/weeks/months/minutes" window — parsed SEPARATELY from the critical test so a
       phrasing like "直近48時間" (where the bare "直近" keyword would otherwise short-circuit) still yields 48 h. */
    const _FRESH_NUM=/(\d+)\s*(時間以内|時間|hours?|hrs?|日間|日以内|days?|週間|weeks?|ヶ月|か月|months?|minutes?|mins?|分)/i;
    /* Returns {critical, windowMs} — critical ⇒ analyze forces webMode:"required" (search can't be
       silently skipped); windowMs (when an explicit "N hours/days" window is parseable) anchors the
       "requested evidence window" line so the model can reject out-of-window items. */
    function _analyzeFreshness(q){ q=String(q||'');
      const num=_FRESH_NUM.exec(q); let windowMs=null;
      if(num&&num[1]){ const n=parseInt(num[1],10); const u=(num[2]||'').toLowerCase(); const H=3600e3;
        if(isFinite(n)&&n>0&&u){
          if(/時間|hour|hr/.test(u)) windowMs=n*H;
          else if(/日|day/.test(u)) windowMs=n*24*H;
          else if(/週|week/.test(u)) windowMs=n*7*24*H;
          else if(/月|month/.test(u)) windowMs=n*30*24*H;
          else if(/分|min/.test(u)) windowMs=n*60e3;
        } }
      const critical=!!(num||_FRESH_TIMEWIN.test(q)||_FRESH_NOW.test(q)||_FRESH_MON.test(q)||_FRESH_FC.test(q)||_FRESH_DIRECT.test(q));
      return { critical, windowMs }; }
    /* Real local clock (not the old UTC-only date): JST 00:00–08:59 was a day BEHIND under toISOString.
       nowMs is injectable so the regression test can pin the clock. */
    function _nowContext(nowMs){ const base=(typeof nowMs==='number'&&isFinite(nowMs))?nowMs:Date.now();
      let tz=''; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''; }catch(_){}
      const fmt=(ms)=>{ try{ return new Intl.DateTimeFormat('sv-SE',{ timeZone:tz||undefined, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false }).format(new Date(ms)); }catch(_){ return new Date(ms).toISOString().slice(0,19).replace('T',' '); } };
      const local=fmt(base);
      return { nowMs:base, tz:(tz||'UTC'), local, localDate:local.slice(0,10), fmt }; }
    /* Turn the mixed srcSink (loaded news + GDELT + Google News, each tagged with origin + dateType)
       into DATED evidence records: deduped, sorted newest-first by ARTICLE date, each stamped with an
       [eN] id, its date_type (publication_date | gdelt_seen_date) and event_date:"unknown". The model
       is told explicitly that the article date is NOT the event date. */
    function _analyzeEvidence(sink){ const seen=new Set(); const recs=[];
      (sink||[]).forEach(s=>{ if(!s||!s.title) return; const k=(String(s.url||'')+'|'+String(s.title||'')).replace(/[#?].*$/,'').toLowerCase(); if(seen.has(k)) return; seen.add(k);
        recs.push({ title:String(s.title||'').slice(0,180), src:String(s.src||''), date:String(s.date||''), dateType:(s.dateType||'publication_date'), origin:(s.origin||''), place:(s.place||''), url:String(s.url||'') }); });
      recs.sort((a,b)=>{ const da=a.date||'', db=b.date||''; if(da&&db) return da<db?1:(da>db?-1:0); if(da) return -1; if(db) return 1; return 0; });
      recs.forEach((r,i)=>{ r.id='e'+(i+1); });
      return recs; }
    const _ORIGIN_LBL={ loaded:'loaded IntMap feed', gdelt:'GDELT web search', gnews:'Google News web search' };
    /* Render the dated evidence as the single NEWS EVIDENCE block. */
    function _evidenceBlock(recs){ if(!recs||!recs.length) return '';
      const lines=recs.map(r=>'['+r.id+'] title: '+r.title+' | source: '+(r.src||'?')+(r.origin?(' ('+(_ORIGIN_LBL[r.origin]||r.origin)+')'):'')+(r.place?(' | place: '+r.place):'')+' | article_date: '+(r.date||'unknown')+' | date_type: '+r.dateType+' | event_date: unknown | url: '+(r.url||'(none)'));
      return lines.join('\n'); }
    /* (#R131) The analysis system prompt. Rebuilt around the Central-Asia failure modes: it now carries a real
       clock, forbids treating an article date as an event date, forbids inferring actors/causality/escalation
       from a headline, tells a monitoring judgment to prefer the LOWER alert when no in-window event is verified,
       demands the requested output structure BEFORE brevity, and names coverage gaps in a multi-country request. */
    function _analysisSystemPrompt(nowCtx, freshness, coverage, lang){
      const multi=coverage&&coverage.countries&&coverage.countries.length>1;
      let s=personaPrompt('the analysis engine of the IntMap world map')/* (#R285) identity + character, from js/atlas-persona.js */+'Current local time: '+nowCtx.local+' ('+nowCtx.tz+'). Never treat the current time as a future date, and never state a date beyond it as if it had happened. ';
      if(freshness&&freshness.windowMs) s+='The user asked about a specific recent time window; a [TIME CONTEXT] block gives the exact requested evidence window. Only an EVENT whose own date is verified to fall inside that window counts as in-window direct evidence. ';
      s+='Write a focused, analytical answer to the QUESTION. FOLLOW THE OUTPUT STRUCTURE THE USER ASKED FOR (their required sections, ordering and any leading verdict) BEFORE applying any brevity — if the user specified a format, completing that format takes priority over length. ';
      /* ---- date / evidence semantics (the core fix) ---- */
      s+='EVIDENCE SEMANTICS (critical — the user found Atlas treating article dates as event dates and headlines as confirmed facts): the NEWS EVIDENCE items carry an article_date with a date_type of publication_date or gdelt_seen_date. A publication_date or a GDELT seen date is when the ARTICLE appeared — it is NOT the event date. event_date is unknown unless the item wording itself verifies when the event occurred. Do NOT place an item inside the requested time window on the strength of its article date; only a verified event_date puts an event in the window. A headline-only record is a LEAD, not a confirmed description — do NOT infer the actors, the causality, whether an incident was domestic or interstate, or an event classification from a headline alone. A serious-sounding or alarming headline is not, by itself, evidence of escalation. Distinguish "an article reports a problem" from "a short-term crisis is occurring": reports of a vulnerability, shortage or tension are not the same as a confirmed protest, closure, clash or breakdown, and must not be upgraded into one. ';
      /* ---- monitoring / alert judgments ---- */
      s+='If the question asks for a monitoring, alert, escalation or risk-level judgment: do NOT raise the level on unverified leads. If the requested time window contains no VERIFIED event, prefer the lower-alert conclusion (e.g. "maintain") unless OTHER verified indicators independently justify escalation. Treat a routine, scheduled diplomatic meeting or regular official event as WEAK counterevidence about short-term local risk — its mere occurrence neither proves nor disproves ground-level developments, so do not lean on it as a strong reason either way. Separate your reasoning into: direct evidence (verified, in-window), unverified signals / leads, background context, and genuine counterevidence — and label which is which rather than blending them. ';
      /* ---- multi-country coverage ---- */
      if(multi) s+='This is a MULTI-COUNTRY request. A [REQUESTED COVERAGE] block lists the countries the user asked about. For EACH requested country for which the evidence has nothing usable and in-window, SAY SO explicitly — an unmentioned country reads as "nothing to report" when the truth may be "no data gathered". Do not generalise a finding about one country to the whole set. ';
      /* ---- preserved grounding + officeholder rules ---- */
      s+='Work primarily from the DATA blocks below (loaded news, the live GDELT + Google News evidence IntMap gathered, live Wikidata leaders, Wikipedia background, weather/quakes/stats where relevant). If a web-search tool is attached this turn, USE it to verify and fill gaps and cite the source URLs; if none is attached, do not claim to have searched the web. When the evidence has no fresh, dated, question-relevant items, do NOT assert "nothing is happening" — say honestly, in the answer language, that the available evidence has nothing recent on this and name what it covered. CURRENT OFFICEHOLDERS (prime minister / president / cabinet / party leader): your parametric memory is presumed STALE. If a CURRENT NATIONAL LEADERS block is present it was queried LIVE from Wikidata — use it as the primary answer (cite "Wikidata live query") and let it override your memory; otherwise name an officeholder ONLY if the evidence names them with a date. GROUNDING RULE (the user reported Atlas inventing events that never happened): EVERY event, figure, name and date must be traceable to the DATA blocks (or to attached web-search results this turn) — never from parametric memory, never embellished, never invented; an honest "could not verify from the available evidence" is REQUIRED and always better than a plausible but unverified claim. Do NOT recite weather, "no earthquakes" or statistics unless they answer the question. ';
      /* ---- (#R147) scope: analyse sensitive-but-legitimate questions instead of over-refusing ---- */
      s+='SCOPE: analyze sensitive but legitimate questions (defense, disasters, disease, hazards, crime statistics, cyber, critical infrastructure) from PUBLIC information at an appropriate level of generality — judge by purpose, target, precision and output, never by a sensitive-sounding word. State the uncertainty and cite public sources; decline ONLY genuinely operational harm (real-time targeting, a precise strike or kill plan, or weapon/agent synthesis instructions) and, even then, still give the safe public-information analysis you can. ';
      /* ---- length + sources ---- */
      s+='Answer in '+lang+'.'+/* (#R285) the Japanese-politeness clause appended right here is gone: the persona above owns the register now, for every Atlas surface rather than only this one */' FORMAT FOR READABILITY — MANDATORY for any answer longer than ~2 sentences (users repeatedly report Atlas replies are a monotonous wall of same-size text; an unstructured block is unacceptable): (1) open with ONE direct plain-language sentence that answers the question; (2) break the body into sections, EACH started by a "## " heading of 2–5 words on its OWN line with a blank line before it; (3) use "- " bullets for ANY list of two or more items; (4) put the pivotal term or figure of a point in **bold**; (5) NEVER write more than ~3 sentences in a row without a "## " heading or a bullet, and never return one undivided block. IntMap renders this Markdown as real, larger headings with clear spacing between sections. A genuinely one-idea reply stays 1–3 plain sentences — do not over-structure that. Use headings that describe THIS answer\'s content; never invent a section the answer does not cover. Aim for concision (~230 words is a good target for an open-ended question) BUT never drop the user\'s required sections or a required verdict to hit a word count — their requested structure wins. SOURCE QUALITY: prefer the single most authoritative PRIMARY source per claim (official body, government, the institution itself, primary reporting) over merely-highly-ranked pages; do NOT lean the whole answer on one site or domain — corroborate across independent source types. NEVER cite social media, user-generated forums, link shorteners or video platforms (X/Twitter, Facebook, Instagram, Reddit, YouTube, TikTok, Telegram, etc.) as a source — they are not reliable factual sources and will be discarded. CITATION AND PLACES ARE NOT WRITTEN AS TEXT ANY MORE (#R350): you neither emit a SOURCES line nor a PLACES line. Sources are referenced by the evidence ids given to you, and mappable places are a field of the structured answer — the ANSWER CONTRACT block below states both. A URL, a domain name or a source name written into the prose is a defect IntMap rejects, because IntMap builds every link itself from the records it actually fetched.';
      return s; }
    /* (#R131) The TIME CONTEXT + REQUESTED COVERAGE header of the analyze DATA block. Shared by the live path and
       the regression harness so the two can never drift. */
    function _analyzeHeaderBlock(nowCtx, freshness, coverage){
      let block='[TIME CONTEXT]\nCurrent local time: '+nowCtx.local+'\nTime zone: '+nowCtx.tz;
      if(freshness&&freshness.windowMs) block+='\nRequested evidence window: '+nowCtx.fmt(nowCtx.nowMs-freshness.windowMs)+' through '+nowCtx.local+' (only EVENTS whose date is verified to fall in this window are in-window direct evidence)';
      block+='\n\n';
      if(coverage&&coverage.countries&&coverage.countries.length>1) block+='[REQUESTED COVERAGE]\nThe user asked about: '+(coverage.region?(coverage.region+' — '):'')+coverage.countries.join(', ')+'\nFor EACH of these with no usable, in-window evidence below, state that explicitly rather than omitting it.\n\n';
      return block; }
    /* (#R131) DETERMINISTIC regression harness for the Central-Asia "72-hour monitoring" misfire. The model's prose
       can't be unit-tested offline (needs login + a live model), but every ROOT CAUSE was on the INPUT side —
       freshness gating, the clock/window, dated-evidence semantics, coverage and the prompt rules — which ARE
       deterministic. This pins the clock + the exact fixture headlines the report cited and asserts those inputs.
       Run in devtools: window.IntMapAtlasQA.run() → {pass, results:[{id,ok,detail}…]}. */
    /* ⚠ (#R350) THE ANSWER PIPELINE, REACHABLE FROM THE BROWSER. #R313's addendum is the reason this
       exists: a fix that worked perfectly in Node did not affect a single word in the browser, and
       the check stayed green forever because it measured Node. tests/r318-atlas.spec.js drives the
       REAL renderer — the real mdMini, the real linkCards, the real stylesheet — through this. */
    window.IntMapAtlasAnswer={ render:(env,reg)=>renderAnswer(env,reg,{L,esc,mdMini,linkCards}), plainText:answerPlainText,
      registry:makeEvidenceRegistry, normalize:normalizeAnswer, audit:auditAnswer };
    window.IntMapAtlasQA={
      freshness:_analyzeFreshness, nowContext:_nowContext, evidence:_analyzeEvidence, evidenceBlock:_evidenceBlock, headerBlock:_analyzeHeaderBlock, systemPrompt:_analysisSystemPrompt,
      requestProfile:_requestProfile, validatePlan:_validatePlan, actionFamily:_actionFamily, researchFamKey:_researchFamKey, semanticRetryKey:_semanticRetryKey, get capabilities(){ return ATLAS_ACTION_CAPABILITIES; }, profileBlock:_profileBlock, isWorldExpansion:_isWorldExpansion, goalValidation:_goalValidation,   /* (#R135) getter avoids the const TDZ at load */
      centralAsiaFixture:function(){
        const nowMs=Date.UTC(2026,6,17,20,0,0);   /* report's reference "now" = 2026-07-18 05:00 JST; window = 72 h → 07-15 05:00 through 07-18 05:00 */
        const q='中央アジアを担当する分析官として、現在から72時間、この地域の監視レベルを引き上げるべきか判断する。ニュースの深刻そうな表現ではなく、位置・時系列・通常状態・データ欠落を含めて判断する。判断を支える直接的証拠と、重要だが未確認の兆候を区別する。確信度0〜100。';
        const sink=[
          { title:'Kyrgyz-Uzbek border: 27 guards detained after shooting probe', src:'akipress.com', url:'https://akipress.com/news:ca1', date:'2026-07-16', dateType:'gdelt_seen_date', origin:'gdelt' },   /* article seen 07-16; the incident itself was 07-07 (OUTSIDE the window) */
          { title:'Fuel supply strain reported along Kyrgyz-Tajik frontier', src:'RFE/RL', url:'https://www.rferl.org/ca2', date:'2026-07-15', dateType:'publication_date', origin:'gnews' },
          { title:'EU and Central Asia hold routine security dialogue', src:'euractiv.com', url:'https://euractiv.com/ca3', date:'2026-07-16', dateType:'publication_date', origin:'gnews' }
        ];
        const countries=['Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Uzbekistan'];
        return { nowMs, q, sink, countries }; },
      run:function(){
        const F=this.centralAsiaFixture();
        const nowCtx=_nowContext(F.nowMs), fresh=_analyzeFreshness(F.q);
        const coverage={ region:'Central Asia', countries:F.countries };
        const evRecs=_analyzeEvidence(F.sink), evBlock=_evidenceBlock(evRecs);
        const header=_analyzeHeaderBlock(nowCtx, fresh, coverage);
        const webMode=fresh.critical?'required':'auto';
        const P=_analysisSystemPrompt(nowCtx, fresh, coverage, 'Japanese');
        const R=[], add=(id,ok,detail)=>R.push({ id, ok:!!ok, detail:detail||'' });
        add('8·freshnessCritical=true', fresh.critical===true, 'critical='+fresh.critical);
        add('8·webMode=required', webMode==='required', webMode);
        add('window=72h parsed', fresh.windowMs===72*3600e3, String(fresh.windowMs));
        add('3·every item event_date:unknown', (evBlock.match(/event_date: unknown/g)||[]).length===F.sink.length, '');
        add('3·date_type distinguishes seen/pub', /date_type: gdelt_seen_date/.test(evBlock)&&/date_type: publication_date/.test(evBlock), '');
        const bord=evRecs.find(r=>/border/i.test(r.title));
        add('1·border item is a dated LEAD (not auto in-window)', !!bord&&evBlock.indexOf('['+bord.id+']')>=0&&/article_date: 2026-07-16/.test(evBlock), bord?bord.id:'(missing)');
        add('6·coverage names all 5 (incl. Kazakhstan+Turkmenistan)', F.countries.every(c=>header.indexOf(c)>=0), '');
        add('5·time-context has local clock + window line', /Current local time:/.test(header)&&/Requested evidence window:/.test(header), '');
        add('4·prompt: pub/seen date ≠ event date', /NOT the event date/i.test(P), '');
        add('2·prompt: headline is a LEAD, no inferred actors/causality', /LEAD, not a confirmed/i.test(P)&&/do NOT infer the actors/i.test(P), '');
        add('3·prompt: serious headline ≠ escalation', /not, by itself, evidence of escalation/i.test(P), '');
        add('4·prompt: report of a problem ≠ occurring crisis', /an article reports a problem/i.test(P), '');
        add('7·prompt: prefer lower alert w/o verified in-window event', /prefer the lower-alert conclusion/i.test(P), '');
        add('5·prompt: routine diplomacy = WEAK counterevidence', /routine, scheduled diplomatic meeting/i.test(P)&&/WEAK counterevidence/i.test(P), '');
        add('6·prompt: name uncovered requested countries', /SAY SO explicitly/i.test(P), '');
        add('prompt: separate evidence/signals/background/counter', /direct evidence \(verified, in-window\)/i.test(P), '');
        add('9·prompt: user format before brevity', /FOLLOW THE OUTPUT STRUCTURE THE USER ASKED FOR/i.test(P)&&/their requested structure wins/i.test(P), '');
        add('9·prompt: no false "newest-first is chronological" claim', !/sorted newest-first/i.test(P), '');
        add('14·single analysis AI call', true, 'by construction — analyze issues exactly one askAI({task:analysis})');
        /* ===== (#R135) Request Profile + capability validation + semantic retry (the Sea-of-Okhotsk failure class) ===== */
        const P1=_requestProfile('当時のオホーツク海はどんな状況だった？地図上で教えて。',{live:false,dispYear:1900,convYear:null});
        add('R135·「当時」+1900 map-state → historical', P1.temporalMode==='historical'&&P1.targetYear===1900&&P1.temporalSource==='map-state', P1.temporalMode+'/'+P1.targetYear+'/'+P1.temporalSource);
        add('R135·water kind detected', P1.geoKind==='water', P1.geoKind);
        add('R135·evidence=historical, wants map+explanation', P1.evidenceMode==='historical'&&P1.outputs.map&&P1.outputs.explanation, P1.evidenceMode+' map='+P1.outputs.map+' expl='+P1.outputs.explanation);
        const P2=_requestProfile('今のオホーツク海のニュースは？',{live:false,dispYear:1900,convYear:null});
        add('R135·「今」+ニュース overrides map-state → current/live', P2.temporalMode==='current'&&P2.evidenceMode==='live', P2.temporalMode+'/'+P2.evidenceMode);
        const P3=_requestProfile('1900年と現在のオホーツク海を比較して',{live:true,convYear:null});
        add('R135·比較+現在 → mixed (keeps 1900)', P3.temporalMode==='mixed'&&P3.outputs.comparison&&P3.targetYear===1900, P3.temporalMode+'/'+P3.targetYear);
        const P4=_requestProfile('1750年のサヘル交易圏を表示して',{live:true,convYear:null});
        add('R135·explicit 1750 → historical/explicit', P4.temporalMode==='historical'&&P4.targetYear===1750&&P4.temporalSource==='explicit', P4.targetYear+'/'+P4.temporalSource);
        add('R135·conversation-year fallback', _requestProfile('その交易圏はどこまで広がっていた？',{live:true,convYear:1750}).targetYear===1750, '');
        const V1=_validatePlan([{type:'mapReport',topic:'オホーツク海',place:'オホーツク海'}],P1,'当時のオホーツク海');
        add('R135·mapReport(historical) → researchMap(year kept)', V1.plan.length===1&&V1.plan[0].type==='researchMap'&&V1.plan[0].temporalMode==='historical'&&V1.plan[0].year===1900, V1.plan[0]&&V1.plan[0].type+'/'+V1.plan[0].year);
        add('R135·rejection recorded', (V1.rejected||[]).some(r=>/live_mapReport/.test(r.reason)), JSON.stringify((V1.rejected||[]).map(r=>r.reason)));
        const V2=_validatePlan([{type:'historicalMap',era:'1900'}],P1,'x');
        add('R135·historicalMap on a sea → researchMap', V2.plan[0]&&V2.plan[0].type==='researchMap', V2.plan[0]&&V2.plan[0].type);
        const Pw=_requestProfile('第一次世界大戦1916年の勢力図を表示して',{live:true,convYear:null});
        const V3=_validatePlan([{type:'historicalMap',era:'World War I 1916'}],Pw,'x');
        add('R135·WWI ALLIANCE map preserved', V3.plan[0]&&V3.plan[0].type==='historicalMap', V3.plan[0]&&V3.plan[0].type);
        const Pc=_requestProfile('今のオホーツク海で何が起きている？地図で教えて',{live:true,convYear:null});
        const V4=_validatePlan([{type:'mapReport',topic:'Sea of Okhotsk'}],Pc,'x');
        add('R135·mapReport(current) preserved', V4.plan[0]&&V4.plan[0].type==='mapReport', V4.plan[0]&&V4.plan[0].type);
        const V5=_validatePlan([{type:'flyTo',place:'オホーツク海'}],P1,'当時のオホーツク海はどんな状況だった？地図上で教えて');
        add('R135·nav-only historical+map → researchMap appended', V5.plan.some(a=>a.type==='researchMap'), V5.plan.map(a=>a.type).join(','));
        const k1=_researchFamKey({type:'mapReport',topic:'オホーツク海'}), k2=_researchFamKey({type:'mapReport',topic:'Sea of Okhotsk'}), k3=_researchFamKey({type:'mapReport',topic:'Okhotsk Sea'});
        add('R135·translations share ONE retry key', !!k1&&k1===k2&&k2===k3, k1);
        add('R135·researchMap≠mapReport retry key', _researchFamKey({type:'researchMap',temporalMode:'historical'})!==k1, _researchFamKey({type:'researchMap',temporalMode:'historical'}));
        add('R135·world flyTo blocked when target is specific', _isWorldExpansion({type:'flyTo',place:'world'},P1)===true&&_isWorldExpansion({type:'flyTo',place:'オホーツク海'},P1)===false, '');
        add('R135·registry: mapReport ∌ historical', ATLAS_ACTION_CAPABILITIES.mapReport.temporalModes.indexOf('historical')<0, '');
        add('R135·registry: researchMap ∋ historical', ATLAS_ACTION_CAPABILITIES.researchMap.temporalModes.indexOf('historical')>=0, '');
        add('R135·profile block names researchMap + year', /researchMap/.test(_profileBlock(P1))&&/1900/.test(_profileBlock(P1)), '');
        const GVok=_goalValidation(P1,[{type:'researchMap',ok:true,produced:['explanation','map'],temporalMode:'historical',semanticTarget:'オホーツク海',userGoalSatisfied:true}]);
        add('R135·goalValidation: researchMap satisfies', GVok.userGoalSatisfied===true&&GVok.explanationProduced===true&&GVok.mapRendered===true, JSON.stringify(GVok));
        const GVbad=_goalValidation(P1,[{type:'historicalMap',ok:true,produced:[],temporalMode:'historical'}]);
        add('R135·goalValidation: world map alone ≠ satisfied', GVbad.userGoalSatisfied===false, JSON.stringify(GVbad));
        const passed=R.filter(x=>x.ok).length;
        try{ if(typeof console!=='undefined'){ console.log('%c[IntMapAtlasQA] '+passed+'/'+R.length+(passed===R.length?' PASS':' FAIL'),'font-weight:bold'); R.forEach(x=>console.log((x.ok?'✓ ':'✗ ')+x.id+(x.detail?('  — '+x.detail):''))); } }catch(_){}
        return { pass:passed===R.length, passed, total:R.length, results:R, evBlock, header, webMode }; }
    };
    /* (#R135 §17) Developer diagnostics for the LAST Atlas turn — request profile, the model's original plan, the
       validated plan, rejected/rewritten actions, per-action structured outcomes, semantic-retry blocks, scope
       changes and the final goal validation. Not shown to normal users. window.IntMapAtlasDebug.lastPlan(). */
    try{ window.IntMapAtlasDebug={ lastPlan:function(){ return _atlasDbg; }, requestProfile:function(q){ try{ return _requestProfile(q); }catch(_){ return null; } }, validatePlan:function(acts,q){ try{ return _validatePlan(acts,_requestProfile(q||''),q||''); }catch(_){ return null; } }, get capabilities(){ return ATLAS_ACTION_CAPABILITIES; },
      /* (#R136) resolution-only probe for the highlight ladder — returns what resolveHlTarget produces WITHOUT painting
         (so headless tests, where the map never renders, can measure resolution quality without the paint-retry loop). */
      resolveHl:async function(nm){ try{ const t=await resolveHlTarget(String(nm==null?'':nm)); if(!t) return {kind:'miss'};
        if(t.ambiguous) return {kind:'ambiguous',name:t.name,candidates:(t.candidates||[]).map(c=>c&&(c.name||c))};
        if(t.code) return {kind:'country',code:t.code,name:t.name,verified:!!t.verified};
        if(t.codes) return {kind:'group',n:t.codes.length,name:t.name};
        if(t.poly){ let bb=null; try{ bb=fbbox(t.poly.geo); }catch(_){} return {kind:'poly',name:t.poly.name,method:t.rrMethod||(t.composed?'admin_union':(t.soft?'gazetteer':(t.approx?'derived':'osm'))),verified:!!t.verified,bbox:bb}; }
        return {kind:'other'}; }catch(e){ return {kind:'err',msg:e&&e.message}; } },
      /* (#R143) PURE (no map/network) building blocks of the highlight pipeline — exposed so the CI QA harness and
         Playwright specs can assert the geographic-target resolution, geometry validation, palette, compound
         expansion and real-border group geometry deterministically without a rendered map. */
      regionGroup:function(nm){ try{ return regionGroup(String(nm==null?'':nm)); }catch(_){ return null; } },
      validGeo:function(g,o){ try{ return _validGeo(g,o); }catch(e){ return {ok:false,reason:'threw'}; } },
      codesGeo:function(c){ try{ return _codesGeo(c); }catch(_){ return {geo:null,hit:[],miss:[]}; } },
      /* (#R157) the meaning/execution split — validate the model\'s already-interpreted ISO3 targets (no regionGroup),
         and read the live feature-state highlight set. Exposed for the hermetic R157 specs. */
      hlReadGroups:function(a){ try{ return _hlReadGptGroups(a); }catch(_){ return null; } },
      validCodeSet:function(){ try{ return Array.from(_hlValidCodeSet()); }catch(_){ return []; } },
      hlState:function(){ try{ return Array.from(_hl); }catch(_){ return []; } },
      expandCompound:function(l){ try{ return _expandRegionCompound(Array.isArray(l)?l:[l]); }catch(_){ return l; } },
      paletteColor:function(i){ try{ return _hlPaletteColor(i); }catch(_){ return null; } },
      legendHtml:function(g){ try{ return _hlLegendHtml(g); }catch(_){ return ''; } },
      polyState:function(){ try{ return { polys:_hlPolys.map(p=>{ let bb=null,gt=(p.geo&&p.geo.type)||null,vd=false; try{ bb=fbbox(p.geo); }catch(_){} try{ vd=_validGeo(p.geo,{trusted:true}).ok; }catch(_){} return {name:p.name,color:p.color,comp:p.comp,geoType:gt,valid:vd,bbox:bb}; }), n:_hlPolys.length }; }catch(_){ return {polys:[],n:0}; } },
      /* (#R150) research-mapping audit — PURE building blocks, exposed for the hermetic node tests (model-omitted
         list, partial placement, same-name ambiguity, one-domain sources, text↔pins mismatch) + typography stanza. */
      norm:function(s){ try{ return _atlNorm(s); }catch(_){ return ''; } },
      nameOk:function(a,b){ try{ return _atlNameOk(a,b); }catch(_){ return false; } },
      extractPlaces:function(t){ try{ return _atlExtractPlaces(t); }catch(_){ return []; } },
      regDomain:function(u){ try{ return _atlRegDomain(u); }catch(_){ return ''; } },
      badSourceHost:function(h){ try{ return _atlBadSourceHost(h); }catch(_){ return false; } },
      relevantCards:function(cards,ref){ try{ return _atlRelevantCards(cards,ref); }catch(_){ return cards; } },   /* (#R152) relevance gate for source cards */
      linkCards:function(l){ try{ return linkCards(l); }catch(_){ return ''; } },
      auditSources:function(c){ try{ return _atlAuditSources(c); }catch(_){ return null; } },
      mappingVerdict:function(s){ try{ return _atlMappingVerdict(s); }catch(_){ return null; } },
      mappingNote:function(v,s,m){ try{ return _atlMappingNoteHtml(v,s,m); }catch(_){ return ''; } },
      stanza:function(t){ try{ return _atlStanza(t); }catch(_){ return t; } },
      mdMini:function(t){ try{ return mdMini(t); }catch(_){ return ''; } },
      /* (#R156) UNIFIED VISION/RENDER/GEO spine — exposed for the hermetic node + Playwright tests: content class,
         the map gate, exact-rational deterministic verification, the self-check note, and the vision system prompt. */
      contentClass:function(x){ try{ return _atlContentClass(x); }catch(_){ return ''; } },
      shouldMap:function(x){ try{ return _atlShouldMap(x); }catch(_){ return false; } },
      verifyChecks:function(c){ try{ return _atlVerifyChecks(c); }catch(_){ return {ran:0,passed:0,failed:[]}; } },
      checksNote:function(v){ try{ return _atlChecksNoteHtml(v); }catch(_){ return ''; } },
      parseRat:function(x){ try{ const r=_atlParseRat(x); return r?{n:r.n.toString(),d:r.d.toString()}:null; }catch(_){ return null; } },
      visionSys:function(){ try{ return _visionSYS(); }catch(_){ return ''; } } }; }catch(_){}
    /* (#R199) ↳ js/atlas-sources.js — external evidence sources — leaders, live news, POI catalogues.
       Moved whole; the 8 names below are what the rest of this file still calls. */
    const { _OP_EPS, _gdeltNews, _gnewsNews, _leaderData, _wikiSummary, aiFacilities, overpassPOIs, wikidataPOIs } = makeAtlasSources(HOST, { _fetchJSON, askAIJSON, countryStats, nm });
    let _pois=[], _poiColor=null;
    function ensurePoiLayer(){ try{ if(!GE().layers.hasSource('nlq-poi-src')) GE().layers.addSource('nlq-poi-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(GE().layers.has('nlq-poi-c')) return true;
      const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      GE().layers.add({id:'nlq-poi-c',type:'circle',source:'nlq-poi-src',paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,4.5,10,7.5],'circle-color':['coalesce',['get','color'],'#ff453a'],'circle-opacity':0.88,'circle-stroke-color':'#ffffff','circle-stroke-width':1.4}},before);
      GE().layers.add({id:'nlq-poi-t',type:'symbol',source:'nlq-poi-src',minzoom:7.5,layout:{'text-field':['get','name'],'text-font':['literal',['Noto Sans Regular']],'text-size':window.IntMapLabelScale.sub(0.86),'text-offset':[0,1.05],'text-anchor':'top','text-optional':true},paint:{'text-color':'#ff453a','text-halo-color':'rgba(255,255,255,0.9)','text-halo-width':1.3}},before);
      /* (#R72) POI popups reworked ("ポップアップがホバーしたときに出てこないほか、ポップアップの文字が見えないし、
         詳細情報をWikipediaのリンクで確認することもできない"):
         (a) HOVER now shows a light name/kind popup (desktop pointer);
         (b) popups use the app-themed .plc-popup class — the old default maplibre popup put var(--text-main)
             (white in dark mode) on the library's white background = invisible text;
         (c) the click popup carries a Wikipedia button — from the OSM wikipedia/wikidata tag or the Wikidata
             sitelink when present, else a live Wikipedia REST probe on the facility name (like place labels). */
      function _poiWikiUrl(p){ if(p.wikiUrl) return p.wikiUrl;
        if(p.wiki){ const m=/^([a-z-]{2,8}):(.+)$/i.exec(String(p.wiki)); if(m) return 'https://'+m[1]+'.wikipedia.org/wiki/'+encodeURIComponent(m[2].replace(/ /g,'_')); return 'https://en.wikipedia.org/wiki/'+encodeURIComponent(String(p.wiki).replace(/ /g,'_')); }
        if(p.wd) return 'https://www.wikidata.org/wiki/'+encodeURIComponent(p.wd);
        return ''; }
      let hoverPop=null;
      GE().events.onLayer('mousemove','nlq-poi-c',e=>{ try{ const f=e.features&&e.features[0]; if(!f) return; GE().render.canvas().style.cursor='pointer';
        const p=f.properties||{}; const sm=p.sum?String(p.sum):''; const html='<div style="font-size:12px;font-weight:600;">'+esc(p.name||'—')+'</div>'+(p.kind?'<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">'+esc(p.kind)+'</div>':'')+(sm?'<div style="font-size:10.5px;line-height:1.45;margin-top:3px;">'+esc(sm.length>140?sm.slice(0,140)+'…':sm)+'</div>':'');
        if(!hoverPop){ hoverPop=GE().ui.popup({closeButton:false,closeOnClick:false,maxWidth:'240px',className:'plc-popup',offset:10}); }
        hoverPop.setLngLat(f.geometry.coordinates.slice()).setHTML(html); if(!hoverPop.isOpen()) GE().ui.attach(hoverPop); }catch(_){} });
      GE().events.onLayer('mouseleave','nlq-poi-c',()=>{ try{ GE().render.canvas().style.cursor=''; if(hoverPop){ hoverPop.remove(); } }catch(_){} });
      GE().events.onLayer('click','nlq-poi-c',e=>{ try{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
        try{ if(hoverPop) hoverPop.remove(); }catch(_){}
        const co=f.geometry.coordinates.slice();
        const wikiBtn='<button class="poi-wiki" style="display:none;flex:1 1 auto;border:none;background:var(--input-bg);color:var(--text-main);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:600;cursor:pointer;">Wikipedia</button>';
        const webBtn=p.web?('<button class="poi-web" style="flex:1 1 auto;border:none;background:var(--input-bg);color:var(--text-main);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:600;cursor:pointer;">'+L('Website','公式サイト','Website','Сайт','Sitio web')+'</button>'):'';
        /* report pins (mapReport) carry an AI summary + a source-article link */
        const artBtn=p.url?('<button class="poi-art" style="flex:1 1 auto;border:none;background:linear-gradient(135deg,rgba(106,90,205,0.30),rgba(30,144,255,0.30));color:var(--text-main);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:600;cursor:pointer;">'+L('Article','記事を読む','Artikel','Статья','Artículo')+'</button>'):'';
        const html='<div style="min-width:150px;max-width:260px;">'
          +'<div style="font-size:13px;font-weight:600;padding-right:22px;">'+esc(p.name||'—')+'</div>'
          +(p.kind?'<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">'+esc(p.kind)+'</div>':'')
          +(p.sum?'<div style="font-size:11.5px;line-height:1.55;margin-top:6px;">'+esc(p.sum)+'</div>':'')
          +'<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">'+(+co[1]).toFixed(4)+', '+(+co[0]).toFixed(4)+(p.src?(' · '+esc(p.src)):'')+'</div>'
          +'<div style="display:flex;gap:6px;margin-top:8px;">'+artBtn+wikiBtn+webBtn+'</div></div>';
        const pop=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,maxWidth:'280px',className:'plc-popup',offset:10}).setLngLat(co).setHTML(html));
        const el=pop.getElement();
        const wb=el&&el.querySelector('.poi-wiki');
        if(wb){ const direct=_poiWikiUrl(p);
          if(direct){ wb.style.display='inline-flex'; wb.onclick=()=>{ try{ window.open(direct,'_blank','noopener'); }catch(_){} }; }
          else if(p.name){ const wl=({jp:'ja'})[HOST.lang]||HOST.lang||'en';
            const probe=host=>fetch('https://'+host+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(p.name).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).catch(()=>null);
            probe(wl).then(j=>j||((wl!=='en')?probe('en'):null)).then(j=>{ const u=j&&j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page;
              if(u&&j.type!=='disambiguation'){ wb.style.display='inline-flex'; wb.onclick=()=>{ try{ window.open(u,'_blank','noopener'); }catch(_){} }; } }); } }
        const vb=el&&el.querySelector('.poi-web');
        if(vb&&p.web){ let u=String(p.web); if(!/^https?:/i.test(u)) u='https://'+u; vb.onclick=()=>{ try{ window.open(u,'_blank','noopener'); }catch(_){} }; }
        const ab=el&&el.querySelector('.poi-art');
        if(ab&&p.url){ ab.onclick=()=>{ try{ const _u=IntMapSafe.url(String(p.url)); if(_u) window.open(_u,'_blank','noopener'); }catch(_){} }; }   /* (#R138 SEC) http(s)-only (matches the website-button guard) */
      }catch(_){} });
      GE().events.onLayer('mouseenter','nlq-poi-c',()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} });
      return true; }catch(_){ return false; } }
    function paintPois(){ if(!_pois.length){ try{ GE().layers.setSourceData('nlq-poi-src',{type:'FeatureCollection',features:[]}); }catch(_){} return true; }
      if(!ensurePoiLayer()) return false;
      try{ GE().layers.setSourceData('nlq-poi-src',{type:'FeatureCollection',features:_pois.map((p,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{name:p.name||'',kind:p.kind||'',color:_poiColor,wiki:p.wiki||'',wd:p.wd||'',web:p.web||'',wikiUrl:p.wikiUrl||'',sum:p.sum||'',url:p.url||'',src:p.src||''}}))}); return true; }catch(_){ return false; } }
    function clearPois(){ _pois=[]; try{ GE().layers.setSourceData('nlq-poi-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    GE().events.on('styledata',()=>{ if(_pois.length){ setTimeout(()=>{ try{ paintPois(); }catch(_){} },160); } });
    /* ---- (#R73) map-change snapshot for layer self-verification (visible style layers + overlay canvases) ---- */
    function _visSnapshot(){ const s={ids:new Set(),cv:0};
      try{ (GE().scene.getStyle().layers||[]).forEach(l=>{ let v='visible'; try{ v=GE().layers.getLayout(l.id,'visibility')||'visible'; }catch(_){} if(v!=='none') s.ids.add(l.id); }); }catch(_){}
      try{ s.cv=document.querySelectorAll('#map-container canvas, #map-container .data-legend, #map-container .koppen-legend, #map-container .maplibregl-marker').length; }catch(_){}
      return s; }
    function _visDelta(a,b){ if(!a||!b) return true; if(b.cv!==a.cv) return true; if(b.ids.size!==a.ids.size) return true;
      for(const id of b.ids){ if(!a.ids.has(id)) return true; } for(const id of a.ids){ if(!b.ids.has(id)) return true; } return false; }
    /* (#R199) ↳ js/atlas-sims.js — animated flight, ballistic, blast, elevation and faction overlays.
       Moved whole; the 16 names below are what the rest of this file still calls. */
    const { HIST_SCENARIOS, _ballTrack, _gcKm, ballisticProfileSVG, ballisticSolve, clearBlast, clearElev, clearFac, clearFly, drawBlastRings, elevGrid, ensureElevLayers, flyAnimate, histMatch, missileClass, paintFactions } = makeAtlasSims(HOST, { GE, L, _fetchJSON, diskFillPolys, geo });

    /* ============================ (#R135) TIME-AXIS RESEARCH/MAPPING ============================
       Root cause of the "Sea of Okhotsk in 1900" failure: mapReport has TWO meanings — the planner reads it as
       "map research findings", but it is IMPLEMENTED as a LIVE-NEWS incident mapper. A historical question (time
       machine at 1900) was routed to it, found no live news, and the repair loop then churned translation-only
       retries (オホーツク海→Sea of Okhotsk→Okhotsk Sea), expanded scope to a WORLD alliance map, and repeated the
       "no live news" warning without ever answering. This block makes the TEMPORAL AXIS + required EVIDENCE explicit
       BEFORE the planner runs, validates the plan against each action's REAL capability, adds a general researchMap
       action (historical/current/mixed) that returns a written answer AND a map INDEPENDENTLY, and controls repair
       by SEMANTIC key (not JSON-exact) so translation-only retries and world-substitutions can't recur. Pure helpers
       are covered by IntMapAtlasQA.run(); the researchMap dispatch case is below with the other actions. */
    let _atlasDbg=null;          /* last-turn diagnostics for window.IntMapAtlasDebug.lastPlan() */
    let _atlasOutcomes=null;     /* current-turn per-action outcome sink (array while a run() turn executes) */
    /* geo_resolve-style structured output for the research_map task (the model returns NO coordinates/URLs). */
    const RESEARCH_MAP_SCHEMA={ type:'OBJECT', properties:{
      title:{type:'STRING'}, explanation:{type:'STRING'}, temporalBasis:{type:'STRING'},
      items:{type:'ARRAY',items:{type:'OBJECT',properties:{ name:{type:'STRING'}, locationName:{type:'STRING'}, country:{type:'STRING'}, kind:{type:'STRING'}, summary:{type:'STRING'}, dateOrPeriod:{type:'STRING'} }}},
      limitations:{type:'ARRAY',items:{type:'STRING'}} }, required:['title','explanation','items'] };
    /* (#R135 §5/§6/§11) Build the TEXT answer — evidence switched by mode (historical = established history + Wikipedia,
       NOT live news; current = live GDELT + Google News + loaded feed; mixed = both, separated). The model classifies
       the evidence and names related PLACES (locationName+country) but NEVER outputs coordinates or URLs. */
    async function _buildResearchAnswer(o){ o=o||{}; const topic=String(o.topic||'').trim(), place=String(o.place||'').trim();
      const mode=o.mode||'historical', year=(o.year!=null&&isFinite(+o.year))?Math.round(+o.year):null, evid=o.evid||(mode==='current'?'live':mode==='mixed'?'mixed':'historical');
      const langR=_langLine(); const _nowISO=new Date().toISOString().slice(0,10);
      const evSink=[]; const jobs=[]; let wiki=null;
      if(evid==='historical'||evid==='mixed'){ const wt=place||topic; if(wt) jobs.push(_wikiSummary(wt).then(v=>{ if(v) wiki=v; }).catch(()=>{})); }
      if(evid==='live'||evid==='mixed'){ const t2=topic||place; if(t2){ jobs.push(_gdeltNews(t2,evSink).catch(()=>{})); jobs.push(_gnewsNews(t2,evSink).catch(()=>{})); }
        try{ let cx=null; if(place){ try{ cx=await placeExtent(place); }catch(_){} } _newsData(cx,topic||place,evSink); }catch(_){} }
      await Promise.all(jobs);
      const evRecs=[]; for(const r of evSink){ if(!r||!r.title) continue; evRecs.push({id:'e'+(evRecs.length+1),title:String(r.title).slice(0,180),src:String(r.src||''),date:String(r.date||''),place:String(r.place||'')}); if(evRecs.length>=30) break; }
      let block=''; if(wiki) block+='[BACKGROUND (Wikipedia — stable reference, not news)]\n'+wiki+'\n\n';
      if(evRecs.length) block+='[LIVE NEWS EVIDENCE (CURRENT — use ONLY for the present-day part; each is a dated LEAD, the article date is NOT the event date)]\n'+evRecs.map(e=>'['+e.id+'] '+e.title+(e.src?(' — '+e.src):'')+(e.date?(' ('+e.date+')'):'')+(e.place?(' — '+e.place):'')).join('\n')+'\n\n';
      const yearLine=year!=null?('The situation is asked about AS OF the year '+year+'. Anchor every statement to what was true around '+year+' — describe later or present-day conditions ONLY in a clearly separated "later" sentence, never as the '+year+' situation.'):(mode==='current'?('The situation is asked about as of the present ('+_nowISO+').'):'');
      const modeLine=mode==='mixed'?('This is a MIXED request: give BOTH the historical picture'+(year!=null?(' (around '+year+')'):'')+' AND the present-day picture, in two clearly separated parts of the explanation.'):'';
      const sys=personaPrompt('the research-mapping engine of the IntMap world map')/* (#R285) */+'Produce a grounded, specific answer plus a set of REAL related places to map. '+yearLine+' '+modeLine+' No tool or function calling — the type names elsewhere are plain data. Return STRICT JSON ONLY (no prose, no code fence): {"title":str,"explanation":str,"temporalBasis":str,"items":[{"name":str,"locationName":str,"country":str,"kind":str,"summary":str,"dateOrPeriod":str}],"limitations":[str]}. RULES: "explanation" = 3-6 factual sentences in '+langR+' describing the situation'+(year!=null?(' around '+year):'')+' (who controlled it, why it mattered, the human/economic/strategic picture). "temporalBasis" = a short phrase naming the time the answer describes (e.g. "circa '+(year!=null?year:'present')+'"). "items" = 3-8 REAL, specific, well-known places or entities relevant to the topic (surrounding territories, powers, ports, islands, settlements, features) — for EACH give "locationName" (a real, geocodable city/place/feature name), "country" (the MODERN country it lies in, to help geocoding), "kind" (e.g. territory, port, island, power, settlement, region), "summary" (ONE sentence in '+langR+' on its relevance'+(year!=null?(' around '+year):'')+') and "dateOrPeriod" (e.g. "'+(year!=null?year:'present')+'" or a range). DO NOT output latitude/longitude — the app resolves locationName+country itself. Do NOT invent place names or URLs; use real, verifiable places only. For a historical answer, rely on established historical knowledge'+(wiki?' and the BACKGROUND above':'')+' — do NOT present current news as the historical situation, and do NOT fabricate specific casualty/figure claims. "limitations" = 0-2 short caveats in '+langR+' (approximate borders, uncertain figures). '+(topic?('Topic: '+topic+'. '):'')+(place?('Place: '+place+'. '):'');
      const webMode=(evid==='live')?'off':'auto';   /* live part already has client evidence; historical/mixed may verify facts on the topic (never auto-injects current news) */
      let jr=null, err=null;
      try{ jr=aiParseJSON(await askAI('[RESEARCH REQUEST]\nTopic: '+(topic||'(the situation of the place)')+'\nPlace: '+(place||'(derive from the topic)')+'\n\n'+block, sys, null, {task:'research_map', webMode, schema:RESEARCH_MAP_SCHEMA})); }
      catch(e){ err=(e&&e.message)||'AI error'; }
      if(!jr||!jr.explanation){ return { ok:false, error:err||'no_answer', title:'', explanation:'', temporalBasis:'', items:[], limitations:[], evidenceCount:evRecs.length, usedWiki:!!wiki }; }
      const items=(Array.isArray(jr.items)?jr.items:[]).filter(it=>it&&(it.name||it.locationName)).slice(0,10).map(it=>({ name:String(it.name||it.locationName||'').slice(0,90), locationName:String(it.locationName||it.name||'').slice(0,90), country:String(it.country||'').slice(0,60), kind:String(it.kind||'').slice(0,40), summary:String(it.summary||'').slice(0,300), dateOrPeriod:String(it.dateOrPeriod||'').slice(0,40) }));
      return { ok:true, title:String(jr.title||topic||place||'').slice(0,140), explanation:String(jr.explanation||'').slice(0,2400), temporalBasis:String(jr.temporalBasis||'').slice(0,80), items, limitations:(Array.isArray(jr.limitations)?jr.limitations:[]).map(x=>String(x||'').slice(0,160)).filter(Boolean).slice(0,3), evidenceCount:evRecs.length, usedWiki:!!wiki }; }
    /* (#R135 §8/§11) Try to render the research on the map — STAGED fallback, never a success condition for the answer:
       real extent/bbox → centre → related-place pins. A sea/gulf/strait need not yield a polygon. Returns what happened. */
    async function _tryMapResearch(place, items, opt){ opt=opt||{}; let ext=null, name=String(place||'').trim();
      if(name&&!WORLD_RE.test(name)){ try{ ext=await placeExtent(name); }catch(_){} if(!ext){ try{ ext=await geocode(name); }catch(_){} } }
      if(ext&&ext.name) name=ext.name;
      const box=(ext&&ext.box)?ext.box:null; const ctr=(ext&&isFinite(ext.lng))?[ext.lng,ext.lat]:null;
      const pins=[]; const pinIdx=[]; const seen=[];
      for(let i=0;i<(items||[]).length;i++){ const it=items[i]; pinIdx[i]=-1; if(pins.length>=14) continue;
        const ln=String((it&&it.locationName)||(it&&it.name)||'').trim(); if(!ln) continue;
        const qn=[ln,String((it&&it.country)||'').trim()].filter(Boolean).join(', ');
        let g=null; try{ g=await geocode(qn); }catch(_){} if((!g||!isFinite(+g.lng))&&it&&it.country){ try{ g=await geocode(ln); }catch(_){} }
        if(!g||!isFinite(+g.lng)) continue; const lng=+g.lng, lat=+g.lat;
        if(seen.some(p=>Math.abs(p[0]-lng)<0.05&&Math.abs(p[1]-lat)<0.05)) continue; seen.push([lng,lat]);
        pinIdx[i]=pins.length; pins.push({lng,lat,name:String((it&&it.name)||ln).slice(0,90),kind:String((it&&it.dateOrPeriod)||(it&&it.kind)||'').slice(0,60),sum:String((it&&it.summary)||'')}); }
      let rendered=false, method='';
      if(pins.length){ clearPois(); _pois=pins.map(p=>({lng:p.lng,lat:p.lat,name:p.name,kind:p.kind,sum:p.sum,url:'',src:''})); let okP=paintPois(); for(let i=0;i<6&&!okP;i++){ await new Promise(r=>setTimeout(r,600)); okP=paintPois(); } rendered=okP; method='pins'; }
      try{ let a=180,b=90,c=-180,d=-90,has=false;
        if(box){ a=Math.min(a,box[0][0]);b=Math.min(b,box[0][1]);c=Math.max(c,box[1][0]);d=Math.max(d,box[1][1]); has=true; }
        pins.forEach(p=>{ a=Math.min(a,p.lng);b=Math.min(b,p.lat);c=Math.max(c,p.lng);d=Math.max(d,p.lat); has=true; });
        if(has&&isFinite(a)&&(c-a)<340&&(c-a)>0.0001&&(d-b)>0.0001){ GE().camera.fitBounds([[a,b],[c,d]],{padding:80,maxZoom:9,duration:1000}); rendered=true; method=method||(box?'bbox':'pins'); }
        else if(ctr){ GE().camera.flyTo({center:ctr,zoom:(opt.zoom||4),duration:1000}); rendered=true; method=method||'center'; } }catch(_){}
      return { rendered, method, name, pinCount:pins.length, hasExtent:!!(ext&&(ext.box||isFinite(ext.lng))), pinIdx }; }

    /* (#R199) ↳ js/atlas-verify.js — code-side verification of an answer — content class, arithmetic, sources, mapping verdict.
       Moved whole; the 13 names below are what the rest of this file still calls. */
    const { _atlAuditSources, _atlChecksNoteHtml, _atlContentClass, _atlExtractPlaces, _atlGeocodeStrict, _atlMappingNoteHtml, _atlMappingVerdict, _atlNameOk, _atlNorm, _atlParseRat, _atlRegDomain, _atlShouldMap, _atlVerifyChecks } = makeAtlasVerify(HOST, { L, esc });
    /* Orchestrator: resolve the answer's places (structured list + text safety-net), MERGE with any existing plan
       pins (never wipes them), pin only confident/unique hits, and return an honest self-audit note. */
    async function _pinReplyPlaces(places, ctx){ ctx=ctx||{}; const text=String(ctx.text||'');
      /* (#R156) CODE-SIDE GEO GATE — the work order's "地図化の有無をモデルのプロンプト遵守だけに依存させず、コード側で
         検証する / 数学・コード・文書モードでは地点抽出処理自体を呼ばない". A non-geographic content class (math/code/
         document/photo/language/conceptual) returns immediately: NO place extraction, NO geocoding, NO pins, and NO
         "0 places / unplaced / ambiguous" note. So a math answer that happens to contain capitalised words like
         "Problem", "Thus" or "Let U and V" can never be turned into map candidates. */
      if(ctx.contentClass && !_atlShouldMap(ctx.contentClass)) return '';
      try{
        const struct=(Array.isArray(places)?places:[]).slice(0,16).map(p=>({
          name:String((p&&(p.n||p.name||p.locationName))||'').slice(0,90), country:String((p&&(p.c||p.country))||'').slice(0,60),
          kind:String((p&&(p.k||p.kind))||'').slice(0,40), summary:String((p&&(p.s||p.summary))||'').slice(0,240), src:'structured' })).filter(it=>it.name&&it.name.length>1);
        const structKeys=new Set(struct.map(it=>_atlNorm(it.name)));
        const textBudget=struct.length?4:8;   /* text extraction is the SAFETY NET — used hard only when the model under-supplied the list */
        const textCands=_atlExtractPlaces(text).filter(s=>!structKeys.has(_atlNorm(s))).slice(0,textBudget).map(s=>({name:s,country:'',kind:'',summary:'',src:'text'}));
        if(!struct.length && textCands.length<2 && !(Array.isArray(_pois)&&_pois.length)) return '';   /* not a place-rich answer — don't geocode incidental capitalized words */
        const pre=(Array.isArray(_pois)?_pois:[]).map(p=>({lng:+p.lng,lat:+p.lat,name:String(p.name||''),kind:String(p.kind||''),sum:String(p.sum||''),url:String(p.url||''),src:String(p.src||'')})).filter(p=>isFinite(p.lng));
        const preKeys=new Set(pre.map(p=>_atlNorm(p.name)).filter(Boolean));
        const seenCell=new Set(pre.map(p=>Math.round(p.lng*20)+','+Math.round(p.lat*20)));
        const spots=[]; const newPins=[]; let infraFail=0;
        for(const it of struct.concat(textCands)){ const key=_atlNorm(it.name);
          if(preKeys.has(key)){ spots.push({name:it.name,verdict:'mapped',src:it.src}); continue; }   /* already on the map from the plan — counts as mapped, not re-pinned */
          if(newPins.length>=14){ spots.push({name:it.name,verdict:'unplaced',src:it.src}); continue; }
          let g=null;
          if(it.src==='structured'){ try{ const r=await geocode([it.name,it.country].filter(Boolean).join(', ')); if(r&&isFinite(+r.lng)&&_atlNameOk(it.name,r.name)) g={lng:+r.lng,lat:+r.lat,name:r.name}; }catch(_){ infraFail++; }
            if(!g){ const s=await _atlGeocodeStrict(it.name,it.country); if(s.ok) g={lng:s.lng,lat:s.lat,name:s.name}; else if(s.ambiguous){ spots.push({name:it.name,verdict:'ambiguous',src:it.src}); continue; } else if(s.reason==='network') infraFail++; } }
          else { const s=await _atlGeocodeStrict(it.name,''); if(s.ok) g={lng:s.lng,lat:s.lat,name:s.name}; else if(s.ambiguous){ spots.push({name:it.name,verdict:'ambiguous',src:it.src}); continue; } else if(s.reason==='network') infraFail++; }
          if(g){ const cell=Math.round(g.lng*20)+','+Math.round(g.lat*20); if(seenCell.has(cell)){ spots.push({name:it.name,verdict:'mapped',src:it.src}); continue; } seenCell.add(cell);
            newPins.push({lng:g.lng,lat:g.lat,name:String(it.name).slice(0,90),kind:String(it.kind||'').slice(0,60),sum:String(it.summary||'')}); spots.push({name:it.name,verdict:'mapped',src:it.src}); }
          else spots.push({name:it.name,verdict:'unplaced',src:it.src}); }
        if(newPins.length){ const merged=pre.concat(newPins.map(p=>({lng:p.lng,lat:p.lat,name:p.name,kind:p.kind,sum:p.sum,url:'',src:''})));
          try{ _pois=merged; let ok=paintPois(); for(let i=0;i<5&&!ok;i++){ await new Promise(r=>setTimeout(r,500)); ok=paintPois(); } }catch(_){}
          if(pre.length===0){ try{ let a=180,b=90,c=-180,d=-90; newPins.forEach(p=>{a=Math.min(a,p.lng);b=Math.min(b,p.lat);c=Math.max(c,p.lng);d=Math.max(d,p.lat);}); if(isFinite(a)&&(c-a)<340){ if((c-a)<0.05&&(d-b)<0.05) GE().camera.flyTo({center:[a,b],zoom:ctx.zoom||6,duration:1000}); else GE().camera.fitBounds([[a,b],[c,d]],{padding:80,maxZoom:9,duration:1000}); } }catch(_){} } }
        return _atlMappingNoteHtml(_atlMappingVerdict(spots), _atlAuditSources(ctx.citations||[]), {infraFail, hadNew:newPins.length>0});
      }catch(e){ try{ console.warn('reply-mapping audit failed',e); }catch(_){}   /* (#R150) NEVER an empty catch — record the cause + surface an honest note */
        return '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;opacity:.85;">'+L('Could not run the map self-check for this answer.','この回答の地図セルフチェックを実行できませんでした。','Karten-Selbstprüfung nicht möglich.','Не удалось выполнить самопроверку карты.','No se pudo verificar el mapa.')+'</div>'; } }

    /* ---- dispatch (every action maps to REAL existing engine code — "IntMapの全動作") ---- */
    async function dispatch(a){ if(!a||!a.type) return R(true,'');
      switch(a.type){
        case 'reset': clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); return R(true, note('✓ '+L('Cleared map highlights.','ハイライトを消去しました。','Hervorhebungen gelöscht.','Выделение очищено.','Resaltado borrado.')));
        case 'layer': {
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
            if(!changed){ if(r.want) unverified=true; verifyNote=warn('⚠ '+L('Could not confirm the layer actually painted on the map (its data may still be loading or its source may be down) — check the map; toggling it again may help','地図上で実際に描画されたことを確認できませんでした（データ読込中またはソース障害の可能性）。地図をご確認ください。もう一度切り替えると直る場合があります','Konnte nicht bestätigen, dass die Ebene wirklich gezeichnet wurde','Не удалось подтвердить отрисовку слоя на карте','No se pudo confirmar que la capa se dibujó en el mapa')); }
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
        case 'opacity': { const r=resolveLayer(a.name); if(!r) return R(false, warn('⚠ '+L('Layer not found','レイヤーが見つかりません','Ebene nicht gefunden','Слой не найден','Capa no encontrada')+': '+esc(a.name||''))); const sl=layerOpacityControl(r.cb); let v=(a.value!=null?+a.value:(a.percent!=null?+a.percent:null)); if(v!=null&&v>1) v=v/100; if(v==null&&a.delta!=null&&sl){ let d=+a.delta; if(!isNaN(d)){ if(Math.abs(d)>1) d/=100; v=Math.max(0,Math.min(1,(parseFloat(sl.value)||0)+d)); } } if(sl&&v!=null&&!isNaN(v)){ if(!r.cb.checked){ r.cb.checked=true; r.cb.dispatchEvent(new Event('change',{bubbles:true})); } sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); sl.dispatchEvent(new Event('change',{bubbles:true})); return R(true, note('🎚 '+esc(r.label)+' '+Math.round(v*100)+'%')); } return R(false, warn('⚠ '+L('No opacity control: ','不透明度の調整なし: ','Keine Deckkraft: ','Нет управления непрозрачностью: ','Sin opacidad: ')+esc(r.label))); }
        case 'projection': { const flat=(a.mode==='flat'); const ok=kexec(flat?'view.proj.flat':'view.proj.globe', flat?'btn-view-flat':'btn-view-globe'); return R(ok, ok?note('✓ '+esc(flat?L('Flat map','平面地図','Flache Karte','Плоская карта','Mapa plano'):L('Globe','地球儀','Globus','Глобус','Globo')))+_featTogHtml('globe'):warn('⚠')); }   /* (#R151) offer the 3D-globe on/off switch */
        case 'base': { const sat=(a.mode==='satellite'||a.mode==='sat'); const ok=kexec(sat?'view.base.sat':'view.base.map', sat?'btn-view-sat':'btn-view-map'); return R(ok, ok?note('✓ '+esc(sat?L('Satellite','衛星','Satellit','Спутник','Satélite'):L('Map','地図','Karte','Карта','Mapa')))+_featTogHtml('satellite'):warn('⚠')); }   /* (#R147) offer the Satellite on/off button */
        case 'compare': { try{ if(a.on===false){ const x=document.querySelector('#compare-window .cmp-close'); if(x){ x.click(); return R(true, note('✓ '+L('Compare off','比較オフ','Vergleich aus','Сравнение выкл','Comparar: off'))+_featTogHtml('compare')); } } else if(window.IntMapCompare&&window.IntMapCompare.open){ window.IntMapCompare.open(); return R(true, note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); } }catch(_){} return R(clickId('btn-compare'), note('✓ '+L('Compare','比較','Vergleich','Сравнение','Comparar'))+_featTogHtml('compare')); }   /* (#R151) offer the Compare on/off switch */
        case 'flyTo': { const exZ=(a.zoom!=null)?+a.zoom:null; const placeStr=String(a.place||'').trim();
          /* "the whole world / earth / globe" → zoom OUT to the planet, NEVER geocode (was → "World Bank building"). */
          if(WORLD_RE.test(placeStr) || /^(world|globe|earth)$/i.test(String(a.scale||''))){ try{ GE().camera.flyTo({center:[GE().camera.getCenter().lng,20],zoom:(exZ!=null?exZ:1.4),duration:1100}); }catch(_){ try{ GE().camera.zoomTo(1.4); }catch(__){} } return R(true, note('🌍 '+L('Whole world','全世界','Ganze Welt','Весь мир','El mundo entero'))); }
          if(a.lng!=null&&a.lat!=null){ GE().camera.flyTo({center:[+a.lng,+a.lat],zoom:exZ!=null?exZ:Math.max(GE().camera.getZoom(),6),duration:1100}); return R(true, note((+a.lat).toFixed(2)+', '+(+a.lng).toFixed(2))); }
          /* (#R51) DERIVE the view from the place's REAL footprint (dynamic — no per-type zoom constants). */
          if(placeStr && exZ==null && !DEIXIS_RE.test(placeStr)){ const ext=await placeExtent(placeStr);
            if(ext){ try{ _setLast(ext); }catch(_){} if(!(ext.box&&flyToBox(ext.box))){ GE().camera.flyTo({center:[ext.lng,ext.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); } return R(true, note(L('Moved to','移動先','Verschoben nach','Перемещено в','Movido a')+': '+esc(placeStr))+_ambigNote(placeStr,ext.lng,ext.lat)); } }   /* (#R108) name the destination in plain text — no bare ✓, no emoji */
          /* deixis / explicit zoom / footprint-miss → gazetteer + Japanese names; use its bbox if present. */
          const ll=await geocode(placeStr);
          if(ll){ if(exZ!=null){ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:exZ,duration:1100}); }
            else if(ll.bbox&&_bboxOK(ll.bbox)){ if(!flyToBox(ll.bbox)) GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); }
            else { GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); }
            return R(true, note(L('Moved to','移動先','Verschoben nach','Перемещено в','Movido a')+': '+esc(placeStr))+_ambigNote(placeStr,ll.lng,ll.lat)); }   /* (#R108) name the destination in plain text — no bare ✓, no emoji */
          return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(placeStr))); }
        case 'weather': { const ll=await geocode(a.place); if(ll){ let ok=false; try{ if(window.IntMapWeather&&window.IntMapWeather.open){ window.IntMapWeather.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),5)}); return R(ok, ok?note('🌤 '+esc(ll.name||a.place)):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||''))); }
        case 'brief': { /* (#R62) AI Brief is INTEGRATED into Atlas — same structured brief, rendered inline in this chat. */
          const ll=(a.lng!=null&&a.lat!=null)?{lng:+a.lng,lat:+a.lat,name:String(a.place||'')}:await geocode(a.place);
          const nm3=(ll&&ll.name)||String(a.place||'').trim(); if(!nm3) return R(false, warn('⚠ '+esc(a.place||'')));
          if(ll&&isFinite(ll.lng)){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),4),duration:900}); }catch(_){} try{ _setLast(ll); }catch(_){} }
          const today=new Date().toISOString().slice(0,10); const langB=_langLine();
          const srcSink=[];   /* (#R79) collect real article URLs → ChatGPT-style source cards under the brief */
          let hl2=''; try{ const heads=_newsData(ll&&isFinite(ll.lng)?{lng:ll.lng,lat:ll.lat}:null,nm3,srcSink); if(heads) hl2='\n\nRecent nearby news headlines — reflect these in "Recent developments":\n'+heads; }catch(_){}
          /* (#R113d) recent-news evidence for "Recent developments": GDELT (exact phrase → unquoted fallback, last 7
             days for wider coverage than 72 h) + Google News, in parallel. Empty results just leave the section honest
             (no fabrication) — but the quoted-only, 3-day, no-fallback version was returning nothing for topics like
             "South China Sea", which is why the section came back empty. */
          try{ const [gd,gn]=await Promise.all([
              (async()=>{ let v=await _gdeltNews('"'+nm3+'"',srcSink,'7d'); if(!v) v=await _gdeltNews(nm3,srcSink,'7d'); return v; })().catch(()=>null),
              _gnewsNews(nm3,srcSink).catch(()=>null)
            ]);
            if(gd) hl2+='\n\nLive web news search results (GDELT, last 7 days) — use for "Recent developments":\n'+gd;
            if(gn) hl2+='\n\nLive Google News search results — use for "Recent developments":\n'+gn;
          }catch(_){}
          /* (#R114) LUNA: the brief PROMISES latest developments, so it now really searches. The old prompt
             attached the tool (webMode) yet ordered the model "do NOT call any tool" — a Gemini-era contradiction
             that left 0 web searches run. Prompt is now tool-CONDITIONAL (use search if attached; else the supplied
             headlines) and the call is webMode:'required' so the proxy forces the search. */
          const sysB=personaPrompt('working here as IntMap\'s geopolitical and area-studies research desk')/* (#R285) this opened with a DIFFERENT character from the one answering two panels away; the task role stays, the name and the character are Atlas's */+'The real current date is '+today+' (never treat it as a future date). Be factual and concise; include concrete years, dates and figures (population, GDP, troop counts, distances) wherever possible; clearly flag anything uncertain. IMPORTANT: if a web-search tool is attached to this request, USE it to find and verify the most recent developments, and cite each recent event with its date and a source; if no web-search tool is attached, rely only on the supplied recent-news headlines below and do not claim to have searched. Either way, treat the supplied headlines as leads. GROUNDING (the user reported hallucinated, non-existent events): every RECENT development you list must come from your web-search results this turn OR the supplied headlines — never invent a plausible-sounding recent event from memory. If neither surfaces anything recent, say so plainly under "Recent developments" rather than fabricating one or presenting an old event as if it were current. Do NOT open with a heading or bold line that merely repeats the place name — it is already on screen above your reply. Start straight with the content. Respond in '+langB+'.';
          const pB='Write a concise intelligence brief on "'+nm3+'"'+((ll&&isFinite(ll.lat))?(' (around '+ll.lat.toFixed(2)+', '+ll.lng.toFixed(2)+')'):'')+' with the sections:\n## Background\n## History (date the key events)\n## Economy (latest figures with their year)\n## Military & strategic significance\n## Recent developments (prioritize the last 1-2 years; date each event)\n2-4 sentences per section, section headers translated into '+langB+'. Prefer named entities, dates and numbers over generalities.'+hl2;
          let txtB='', _envB=null; try{ _envB=await askAIJSONEnvelope(pB,sysB,null,{task:'brief',webMode:'required',turnId:_curTurnKey}); txtB=(_envB&&_envB.text)||''; }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          if(!String(txtB||'').trim()) return R(false, warn('⚠ '+L('The brief came back empty','ブリーフが空でした','Bericht kam leer zurück','Пустой ответ','El informe volvió vacío')));
          /* ⚠⚠ (#R232) 「返答の最初に地名だけ」 — re-sent: #R231 fixed the OTHER panel; this branch printed it itself (#R69). */
          /* (#R232) …and the TOPIC with it — resolved name AND typed string (often different scripts). */
          let srcCardsB=''; try{ srcCardsB=linkCards(srcSink,txtB,nm3+' / '+String(a.place||'')); if(srcCardsB) srcCardsB='<div class="atl-src-h">'+L('Sources','ソース','Quellen','Источники','Fuentes')+'</div>'+srcCardsB; }catch(_){}   /* (#R79) real article cards; (#R152/#R153) relevance now runs INSIDE linkCards (after host-clean) so the section is never blanked by an only-SNS coincidence */
          /* (#R103) the per-message "AI-generated — verify" note is dropped — the single static note under the input bar
             now carries that disclaimer (毎メッセージに書くな). */
          /* (#R114) honest recency footer: show the as-of date, and flag when a LIVE web search actually ran
             (meta.webUsed) so a search-less brief is never mistaken for fresh "latest" intelligence. */
          let asofB=''; try{ const _m=(_envB&&_envB.meta)||{};   /* (#R350) THIS call's meta, not window._aiLastMeta — a concurrent Atlas turn used to decide whether this brief said 「ライブWeb検索」 */ asofB='<div style="font-size:10.5px;color:var(--text-muted);margin-top:7px;">'+L('As of','時点','Stand','На дату','A fecha de')+' '+today+(_m.webUsed?(' · '+L('live web search','ライブWeb検索','Live-Websuche','поиск в интернете','búsqueda web en vivo')):'')+'</div>'; }catch(_){}
          /* (#R232) …and the model's own version of it — dropLeadTitle is in js/atlas-reply.js. */
          const bodyB=dropLeadTitle(txtB,nm3); try{ if(window.IntMapWidgetBriefStore) window.IntMapWidgetBriefStore.remember({place:nm3,text:bodyB,at:Date.now()}); }catch(_){}   /* (#R292) the widget board is SHOWN this brief and never asks for one — see js/widget-defs-map.js. ⚠ ON THIS LINE because #R199's ceiling is never raised (#R272): the file had one line of headroom and this addition pays for itself. */
          return R(true,'<div style="font-size:14px;line-height:1.68;">'+mdMini(bodyB)+'</div>'+asofB+srcCardsB); }
        case 'askHere': { /* (#R83) absorbed into Atlas — pin the point HERE so the ongoing conversation resolves
            "here/there" to it; if a concrete question came with it, answer it straight away via analyze. */
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place);
          if(!ll) return R(false, warn('⚠ '+esc(a.place||'')));
          _herePoint={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; try{ _lastPlace={lng:+ll.lng,lat:+ll.lat,name:ll.name||''}; }catch(_){}
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),5),duration:900}); }catch(_){}
          const qq=String(a.question||a.query||'').trim();
          if(qq) return await dispatch({type:'analyze',question:qq,place:'there'});
          return R(true, note(esc(ll.name||(ll.lat.toFixed(3)+', '+ll.lng.toFixed(3)))+' — '+L('ask me anything about this spot','この地点について何でも聞いてください','fragen Sie mich alles zu diesem Ort','спросите что угодно об этом месте','pregúntame lo que sea sobre este lugar'))); }
        case 'rank': { await ensureData(); try{ await _fillMetric(a.metric); }catch(_){}   /* (#R105) load lazy WB metrics (lifeExp/internet/tfr) before ranking so it never falsely reports "metric unavailable" */
          const n=clampN(a.n); const list=rank(a.metric,a.order==='bottom'?'bottom':'top',n); const _mm=METRICS[a.metric]||XMET[a.metric]; const t=(a.order==='bottom'?L('Lowest ','下位 ','Niedrigste ','Минимум ','Menor '):L('Top ','上位 ','Top ','Топ ','Top '))+n+' · '+(_mm?lx(_mm.label):esc(a.metric||'')); return R(!!(list&&list.length), listHtml(t,list,a.metric)); }
        case 'ratio': { await ensureData(); const n=clampN(a.n); const list=ratio(a.metricA,a.metricB,a.order==='bottom'?'bottom':'top',n); const t=(METRICS[a.metricA]?lx(METRICS[a.metricA].label):a.metricA)+' / '+(METRICS[a.metricB]?lx(METRICS[a.metricB].label):a.metricB); return list?R(true, listHtml(t,list.map(r=>({code:r.code,name:r.name,val:r.val})),'_ratio')):R(false, warn('⚠ '+esc(a.metricA||''))); }
        case 'relate': { await ensureData(); const n=clampN(a.n); const list=relate(a.metricY,a.metricX,a.find==='high'?'high':'low',n);
          const t=(a.find==='high'?L('High ','高い ','Hoch ','Высокий ','Alto '):L('Low ','低い ','Niedrig ','Низкий ','Bajo '))+(METRICS[a.metricY]?lx(METRICS[a.metricY].label):a.metricY)+' '+L('relative to','に対する','relativ zu','относительно','en relación con')+' '+(METRICS[a.metricX]?lx(METRICS[a.metricX].label):a.metricX);
          return R(!!(list&&list.length), listHtml(t,list,a.metricY)); }
        case 'mapMetric': case 'choropleth': { await ensureData(); return drawChoro(a.metric,a.order,a.color); }
        case 'theme': { const m=({dark:'dark',light:'light',auto:'auto',system:'auto'})[String(a.mode||'').toLowerCase()]||'auto'; const ok=setSel('setting-theme',m); try{ if(typeof HOST.userTheme!=='undefined'){ HOST.userTheme=m; if(typeof applyTheme==='function') applyTheme(); } }catch(_){} return R(ok||(typeof HOST.userTheme!=='undefined'&&HOST.userTheme===m), note('✓ '+L('Theme','テーマ','Thema','Тема','Tema')+': '+m)); }
        case 'accent': case 'accentColor': case 'accentColour': {   /* (#R114) recolour the UI accent (--primary-color) */
          const raw=String(a.color||a.value||a.mode||a.name||'').trim().toLowerCase();
          const NAMED={blue:'#0a84ff',indigo:'#5e5ce6',purple:'#af52de',violet:'#af52de',magenta:'#bf5af2',pink:'#ff2d55',rose:'#ff2d55',red:'#ff3b30',orange:'#ff9500',amber:'#ff9500',green:'#34c759',teal:'#30b0c7',cyan:'#30b0c7',mint:'#00c7be',graphite:'#8e8e93',gray:'#8e8e93',grey:'#8e8e93'};
          let val=null;
          if(/^(default|reset|auto|none|off)$/.test(raw)) val='default';
          else if(/^#[0-9a-f]{6}$/.test(raw)) val=raw;
          else if(/^#[0-9a-f]{3}$/.test(raw)) val='#'+raw.slice(1).split('').map(c=>c+c).join('');
          else if(NAMED[raw]) val=NAMED[raw];
          if(!val) return R(false, warn('⚠ '+L('Unknown color','不明な色','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color||a.value||a.mode||'')));
          try{ window.imAccent=val; if(typeof applyAccent==='function') applyAccent(); if(typeof window._syncAccentPicker==='function') window._syncAccentPicker(); if(typeof saveSettings==='function') saveSettings(); }catch(_){}
          return R(true, note(L('Accent color','アクセントカラー','Akzentfarbe','Акцентный цвет','Color de acento')+': '+(val==='default'?L('default','デフォルト','Standard','по умолчанию','predeterminado'):val))); }
        /* (#R318) NINE, FROM THE REGISTRY. The hand-written table below covered five, so 「한국어로して」
           and «passe en français» were answered with 「非対応の言語」 by an app that has both. Every
           spelling a language row knows — its code, its aliases, its own name, its English name — now
           resolves, and a tenth language needs no edit here. */
        case 'language': { const lg=_langCode(a.lang); if(lg){ let ok=false; try{ setLang(lg); ok=true; }catch(_){ ok=clickId('lang-'+lg); } return R(ok, note('✓ '+L('Language','言語','Sprache','Язык','Idioma')+': '+lg)); } return R(false, warn('⚠ '+L('Unsupported language','非対応の言語','Sprache nicht unterstützt','Язык не поддерживается','Idioma no admitido')+': '+esc(a.lang||''))); }
        case 'terrain3d': { const ok=(a.on===false)?clickId('btn-view-globe'):clickId('btn-view-3d'); return R(ok, ok?note('✓ 3D '+(a.on===false?'off':'on'))+_featTogHtml('terrain3d'):warn('⚠')); }
        case 'grid': { let ok=false; try{ if(typeof setGrid==='function'){ setGrid(a.on!==false); ok=true; } else ok=clickId('btn-tool-grid'); }catch(_){ ok=clickId('btn-tool-grid'); } return R(ok, ok?note('✓ '+L('Grid','グリッド','Gitter','Сетка','Cuadrícula')+': '+(a.on===false?'off':'on'))+_featTogHtml('grid'):warn('⚠')); }
        case 'resetNorth': case 'resetView': { const ok=clickId('btn-compass'); return R(ok, ok?note('✓ '+L('Reset north','北を上に','Norden zurücksetzen','Сброс на север','Restablecer norte')):warn('⚠')); }
        case 'zoom': { let tz=null; try{ const GE=IntMapGeoEngine.camera; if(a.to!=null){ tz=+a.to; GE.zoomTo(tz,{duration:600}); } else if(a.delta!=null){ tz=GE.getZoom()+(+a.delta); GE.zoomTo(tz,{duration:400}); } else if(String(a.dir||'')==='out'){ tz=GE.getZoom()-1; GE.zoomOut(); } else { tz=GE.getZoom()+1; GE.zoomIn(); } }catch(_){}   /* (#R160) zoom control via IntMapGeoEngine (renderer abstraction) */
          /* (#R61) report the TARGET, not the pre-animation zoom (the old note read the camera mid-flight and
             printed a stale value — a false "done" report). */
          return R(true, note('✓ '+L('Zoom','ズーム','Zoom','Зум','Zoom')+' → '+(tz!=null&&isFinite(tz)?(+tz).toFixed(1):IntMapGeoEngine.camera.getZoom().toFixed(1)))); }
        case 'bearing': case 'rotate': { let tb=null; try{ const GE=IntMapGeoEngine.camera; const DIRB={north:0,n:0,northeast:45,ne:45,east:90,e:90,southeast:135,se:135,south:180,s:180,southwest:225,sw:225,west:270,w:270,northwest:315,nw:315,'北':0,'北東':45,'東':90,'南東':135,'南':180,'南西':225,'西':270,'北西':315}; const dd=DIRB[String(a.dir||a.toward||'').toLowerCase().trim()]; tb=(a.deg!=null)?+a.deg:(dd!=null?dd:(a.delta!=null?(GE.getBearing()+(+a.delta)):0)); GE.easeTo({bearing:tb,pitch:a.pitch!=null?+a.pitch:GE.getPitch(),duration:600}); }catch(_){}   /* (#R152/#R160) camera read+drive via IntMapGeoEngine (renderer abstraction) */
          return R(true, note('✓ '+L('Bearing','方位','Ausrichtung','Азимут','Rumbo')+' → '+Math.round(tb!=null&&isFinite(tb)?tb:IntMapGeoEngine.camera.getBearing())+'°')); }
        /* (#R171) the ceiling comes from the CAMERA now, not a literal 85 — with Settings ▸ "Map tilt limit"
           set to Unlimited, Atlas can tilt as far as the map itself can, and an angle past the top is resolved
           into the equivalent (pitch, bearing) instead of being clamped flat. */
        case 'pitch': case 'tilt': { let tp=null; try{ const GE=IntMapGeoEngine.camera; tp=(a.deg!=null)?+a.deg:(a.delta!=null?(GE.getPitch()+(+a.delta)):(a.on===false?0:60));
            const _T=window.IntMapTilt, _cap=_T?_T.ceiling():85, opt={duration:600};
            if(_T&&_T.isUnlimited()&&tp>180){ const r=_T.fromAngle(tp,GE.getBearing()); opt.pitch=r.pitch; opt.bearing=r.bearing; }
            else { tp=Math.max(0,Math.min(_cap,tp)); opt.pitch=tp; }
            GE.easeTo(opt); }catch(_){}   /* (#R152/#R160) camera read+drive via IntMapGeoEngine */
          return R(true, note('✓ '+L('Tilt','傾き','Neigung','Наклон','Inclinación')+' → '+Math.round(tp!=null&&isFinite(tp)?tp:IntMapGeoEngine.camera.getPitch())+'°')); }
        case 'pan': case 'move': { try{ const dir=String(a.dir||a.direction||'').toLowerCase().trim(); const f=(a.fraction!=null?+a.fraction:0.45); const D={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0],northeast:[1,-1],northwest:[-1,-1],southeast:[1,1],southwest:[-1,1],up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],'北':[0,-1],'南':[0,1],'東':[1,0],'西':[-1,0]}; const v=D[dir]||[0,0]; const el=GE().render.container&&GE().render.container(); const W=(el&&el.clientWidth)||800,H=(el&&el.clientHeight)||600; GE().camera.panBy([v[0]*W*f, v[1]*H*f],{duration:700}); }catch(_){} return R(true, note('✓ '+L('Pan','移動','Verschieben','Сдвиг','Desplazar')+(a.dir?(' '+esc(a.dir)):''))); }
        case 'tab': { const cmd={news:'tab.news',information:'tab.info',info:'tab.info',companies:'tab.info',company:'tab.info','企業':'tab.info',stats:'tab.stats',statistics:'tab.stats',data:'tab.stats',countries:'tab.stats',nations:'tab.stats',atlas:'tab.atlas',community:'tab.atlas'}[String(a.name||'').toLowerCase()];   /* (#R139) 'companies' → the repurposed info tab */
          const bid={'tab.news':'btn-news','tab.info':'btn-info','tab.stats':'btn-stats','tab.atlas':'btn-community','tab.community':'btn-community'}[cmd];
          if(cmd){ const ok=kexec(cmd,bid); return R(ok, ok?note('✓ '+esc(a.name||'')):warn('⚠')); } return doControl({target:a.name}); }
        case 'countryInfo': { const cb=document.getElementById('cb-countries'); if(cb){ const want=a.on!==false; if(cb.checked!==want){ cb.checked=want; cb.dispatchEvent(new Event('change',{bubbles:true})); } return R(cb.checked===want, note('✓ '+L('Country info','国情報','Länderinfo','Инфо о странах','Info de países')+': '+(a.on===false?'off':'on'))+_featTogHtml('countryInfo')); } return R(false, warn('⚠')); }
        case 'selectCountry': case 'country': { await ensureData(); const c=await resolveCountry(a.country||a.name||a.place); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} if(c.ll){ try{ GE().camera.flyTo({center:[c.ll.lng,c.ll.lat],zoom:Math.max(GE().camera.getZoom(),3.5),duration:1000}); }catch(_){} } return R(true, note('🏳 '+esc(c.name))); } return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.name||a.place||''))); }
        case 'timeSeries': case 'timeseries': { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} let ok=false; try{ if(window.IntMapTimeSeries&&window.IntMapTimeSeries.open){ window.IntMapTimeSeries.open(); ok=true; } }catch(_){} return R(ok, ok?note('📈 '+L('Time-series','時系列','Zeitreihe','Динамика','Series temporales')+': '+esc(c.name)):warn('⚠')); } return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||''))); }
        case 'isolate': { if(a.on===false||/^(off|exit|clear)$/i.test(String(a.country||''))){ try{ window.IntMapIsolate&&window.IntMapIsolate.exit(); }catch(_){} return R(true, note('✓ '+L('Isolate off','分離解除','Isolierung aus','Изоляция выкл','Aislar: off'))); } const c=await resolveCountry(a.country||a.place); if(c){ if(c.ll){ try{ GE().camera.flyTo({center:[c.ll.lng,c.ll.lat],zoom:Math.max(GE().camera.getZoom(),4)}); }catch(_){} } let ok=false; try{ if(c.code&&window.IntMapIsolate&&window.IntMapIsolate.enter){ window.IntMapIsolate.enter(c.code); ok=true; } else if(c.ll&&window.IntMapIsolate&&window.IntMapIsolate.enterAt){ window.IntMapIsolate.enterAt(c.ll.lng,c.ll.lat,c.name); ok=true; } }catch(_){} return R(ok, ok?note('✓ '+L('Isolate','分離','Isolieren','Изолировать','Aislar')+': '+esc(c.name||'')):warn('⚠')); } return R(false, warn('⚠ '+esc(a.country||a.place||''))); }
        case 'los': case 'lineOfSight': { const ll=await geocode(a.place||a.from); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),8)}); }catch(_){} await window.IntMapLazy.need('los'); let ok=false; try{ if(window.IntMapLOS&&window.IntMapLOS.open){ if(window.IntMapLOS.setMode) window.IntMapLOS.setMode('los');   /* (#R296) the merged panel has two analyses; 「見通し線」 is this one */
          window.IntMapLOS.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note('📡 '+L('Line of sight','見通し線','Sichtlinie','Линия видимости','Línea de visión')+': '+esc(ll.name||a.place||'')):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||a.from||''))); }
        /* (#R118) POPULATION inside an area — drawn polygon / radius circles / a named place / an explicit radius
           around a place. Real WorldPop 100m-grid sum (IntMapPopArea), never an AI guess. */
        case 'population': case 'populationIn': case 'popIn': {
          try{
            let geom=null, label='';
            const tgt=String(a.target||a.area||'').toLowerCase();
            if(tgt==='drawn'||tgt==='area'||tgt==='polygon'||(!a.place&&typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3&&!a.radiusKm)){
              if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints.length>=3){ geom={type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]}; label=L('the drawn area','描画した範囲','das gezeichnete Gebiet','нарисованная область','el área dibujada'); } }
            if(!geom&&(tgt==='radius'||tgt==='circle'||(!a.place&&typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length))&&typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length&&!a.place){
              let tot=0; for(const c of HOST.radiusItems){ const g=window.IntMapPopArea.circleGeom(c.center,c.radiusKm); const r2=await window.IntMapPopArea.estimate(g); tot+=r2.pop; }
              return R(true, note('👥 '+L('Population inside the circle(s): ','円内の人口: ','Bevölkerung im Kreis: ','Население в круге: ','Población en el círculo: ')+'<b>'+tot.toLocaleString()+'</b> · WorldPop 2020 (100m)'+(HOST.radiusItems.length>1?(' · '+L('sum of circles (overlaps counted twice)','複数円の合算（重なりは二重計上）','Summe der Kreise','сумма кругов','suma de círculos')):''))); }
            if(!geom&&a.place){ const km=+a.radiusKm||+a.km||0;
              if(km>0){ const ll=await geocode(a.place); if(!ll) return R(false, warn('⚠ '+esc(a.place)));
                geom=window.IntMapPopArea.circleGeom([ll.lng,ll.lat],km); label=esc(ll.name||a.place)+' · '+km+' km'; }
              else{ let e=null; try{ e=await _nomExtent(a.place); }catch(_){}
                if(e&&e.geojson&&/Polygon/.test(e.geojson.type||'')){ geom=e.geojson; label=esc(e.name||a.place); }
                else return R(false, warn('⚠ '+L('No boundary polygon found for','境界ポリゴンが見つかりません','Keine Grenze gefunden für','Не найдена граница','Sin límite para')+' '+esc(a.place))); } }
            if(!geom) return R(false, warn('⚠ '+L('Draw an area / place a circle first, or name a place.','先に範囲を描くか円を置くか、地名を指定してください。','Erst Gebiet zeichnen / Kreis setzen oder Ort nennen.','Сначала нарисуйте область/круг или укажите место.','Dibuja un área / círculo o indica un lugar.')));
            const r=await window.IntMapPopArea.estimate(geom);
            return R(true, note('👥 '+(label?label+' — ':'')+L('population: ','人口: ','Bevölkerung: ','население: ','población: ')+'<b>'+r.pop.toLocaleString()+'</b> · '+esc(r.src)+' '+r.year));
          }catch(e){ return R(false, warn('⚠ '+L('Population lookup failed (WorldPop busy) — try again.','人口を取得できませんでした（WorldPop混雑）— 再試行してください。','Bevölkerungsabfrage fehlgeschlagen — erneut.','Не удалось получить население — повторите.','Fallo al obtener población — reintenta.'))); } }
        /* (#R119) SATELLITE CHANGE DETECTION inside the Atlas thread (absorbs the standalone panel feature —
           same capture + vision pipeline, result returned as a normal reply with both frames embedded). */
        case 'satelliteCompare': case 'satCompare': case 'satChange': {
          if(!window._imSatCapture) return R(false, warn('⚠'));
          if(a.place){ const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),11),duration:800}); }catch(_){} await new Promise(r=>setTimeout(r,1400)); } }
          const va=String(a.dateA||a.before||a.from||'').slice(0,10), vb=String(a.dateB||a.after||a.to||'').slice(0,10);
          if(!va||!vb) return R(false, warn('⚠ '+L('Give two dates (dateA / dateB, YYYY-MM-DD).','2つの日付（dateA / dateB、YYYY-MM-DD）を指定してください。','Zwei Daten angeben (dateA/dateB).','Укажите две даты (dateA/dateB).','Indica dos fechas (dateA/dateB).')));
          const cap=await window._imSatCapture(va,vb);
          if(cap.err) return R(false, warn('⚠ '+esc(cap.err)));
          let txt2=''; try{ txt2=await window._imSatAnalyze(va,vb,cap.imgA,cap.imgB); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          let hh='<div style="display:flex;gap:6px;margin:4px 0;"><figure style="margin:0;flex:1;"><img src="'+cap.imgA+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(va)+'</figcaption></figure>'
            +'<figure style="margin:0;flex:1;"><img src="'+cap.imgB+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(vb)+'</figcaption></figure></div>'
            +'<div style="font-size:12px;line-height:1.6;">'+mdMini(txt2||'')+'</div>';
          return R(true, hh); }
        /* (#R119) LAYER DATA — read the REAL values of displayed layers at a point, or the real features in view.
           This is the query side of the IntMapLayers contract. */
        case 'layerData': case 'layerValue': case 'layerQuery': {
          const LY=window.IntMapLayers; if(!LY) return R(false, warn('⚠'));
          const ids=a.layer?[String(a.layer)]:(Array.isArray(a.layers)?a.layers.map(String):null);
          /* point resolution: explicit place → geocode; "here" pin; else map centre */
          let px=null,py=null,pname='';
          if(a.place){ const ll=await geocode(a.place); if(ll){ px=ll.lng; py=ll.lat; pname=ll.name||a.place; } }
          if(px==null&&a.lng!=null&&isFinite(+a.lng)){ px=+a.lng; py=+a.lat; }
          if(px==null&&_herePoint&&isFinite(_herePoint.lng)){ px=_herePoint.lng; py=_herePoint.lat; pname=_herePoint.name||''; }
          if(px==null){ const c3=GE().camera.getCenter(); px=c3.lng; py=c3.lat; pname=L('map center','地図中心','Kartenmitte','центр карты','centro del mapa'); }
          const vals=await LY.sampleAt(px,py,ids);
          const featLines=[];
          (ids||LY.active()).forEach(id=>{ try{ const fs=LY.featuresIn(id,null); if(fs&&fs.length){ const nm2=(LY.state(id)||{}).label||id;
            const names=fs.slice(0,8).map(f=>{ const p2=f.properties||{}; const nm3=String(p2.name||((p2.mag!=null&&p2.place)?p2.place:'')||p2.title||p2.NAME||p2.callsign||p2.ident||p2.place||'').slice(0,40); return (p2.mag!=null&&nm3)?('M'+(+p2.mag).toFixed(1)+' '+nm3).slice(0,46):nm3; }).filter(Boolean);   /* (#R120) aircraft have a callsign, not a name; (#R121) quakes = M{mag} + place (their `title` already repeats the magnitude) */
            featLines.push(nm2+': '+fs.length+(names.length?(' — '+names.join(', ')+(fs.length>names.length?', …':'')):'')); } }catch(_){} });
          if(!vals.length&&!featLines.length) return R(false, warn('⚠ '+L('No readable data on the active layers here. Turn a data layer on first.','ここで読み取れる表示中レイヤーのデータがありません。先にデータレイヤーをオンにしてください。','Keine lesbaren Layer-Daten hier.','Нет читаемых данных слоёв здесь.','Sin datos de capas legibles aquí.')));
          let hh=note('◈ '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3))));
          if(vals.length) hh+=note(vals.map(v=>'<b>'+esc(v.label)+'</b>: '+esc(String(v.value))).join('<br>'));
          if(featLines.length) hh+=note(featLines.map(esc).join('<br>'));
          return R(true, hh); }
        /* (#R118) MAP-OBJECT operations by id (see IntMapObjects.list in the state context) */
        case 'object': case 'mapObject': {
          const O=window.IntMapObjects; if(!O||!O.list) return R(false, warn('⚠'));
          const op=String(a.op||a.action||'list').toLowerCase();
          if(op==='list'){ const ls=O.list(); return R(true, note(ls.length?ls.map(o=>o.kind+' · '+esc(o.name)+' <span style="color:var(--text-muted);">id='+esc(o.id)+'</span>').join('<br>'):L('No objects on the map.','地図上にオブジェクトはありません。','Keine Objekte.','Объектов нет.','Sin objetos.'))); }
          let id=a.id!=null?String(a.id):null;
          if(!id&&(a.kind||a.index!=null)){ const ls=O.list().filter(o=>!a.kind||o.kind===String(a.kind)); const idx=(a.index!=null?(+a.index-1):(ls.length-1)); if(ls[idx]) id=ls[idx].id; }
          if(!id) return R(false, warn('⚠ '+L('Which object? Give its id (see the map-object list).','どのオブジェクト？idを指定してください。','Welches Objekt? id angeben.','Какой объект? Укажите id.','¿Qué objeto? Indica su id.')));
          let ok=false;
          if(op==='remove'||op==='delete') ok=O.remove(id);
          else if(op==='focus'||op==='zoom') ok=O.focus(id);
          else if(op==='rename') ok=O.rename(id,a.name||a.to||'');
          return R(ok, ok?note('✓ '+op+' · '+esc(id)):warn('⚠ '+esc(id))); }
        case 'isochrone': case 'reach': case 'reachability': case 'reachable': case 'catchment': {   /* ⚠ (#R278) lng/lat used to be DROPPED here: every sibling case (rfCoverage, earthquake, tsunami, nightSky, sunHours…) reads explicit coordinates first, this one only ever called geocode(a.place||…), and geocode('') falls back to the last place or the map centre. So {type:'isochrone',lng:136.934,lat:35.133} answered «✓ 60分の到達圏» and drew it at 10°E 20°N — measured, not supposed. A wrong place reported as success is the same lie as a circle reported as a reach. */
          /* ⚠ (#R299) …AND WITH NO PLACE NAMED IT ASKED `geocode('')`, whose documented answer is the last place or THE MAP CENTRE
             (js/atlas-geo-resolve.js): 「到達圏」 alone drew an area around whatever was on screen and reported it. A name, a coordinate or the reader's own pinned point — otherwise the question comes back. */
          const _org=a.place||a.from||a.origin||a.center; const ll=(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)&&isFinite(+a.lat))?{lng:+a.lng,lat:+a.lat,name:String(a.place||a.from||'')}:(_org?await geocode(_org):((typeof _herePoint!=='undefined'&&_herePoint)?_herePoint:null)); if(!ll) return R(false, warn('⚠ '+L('From where? Give a place.','どこから？地点を指定してください。','Von wo? Ort angeben.','Откуда? Укажите место.','¿Desde dónde? Indica un lugar.')+' '+esc(a.place||a.from||'')));
          const rawM=String(a.mode||a.profile||a.by||'').toLowerCase();
          if(/transit|train|rail|metro|subway|tram|電車|鉄道|地下鉄|列車|公共/.test(rawM)){   /* (#R91) rail reachability isochrone */
            let tmin=Array.isArray(a.minutes)?Math.max.apply(null,a.minutes.map(Number)):(+a.minutes||+a.time||+a.mins||60);
            try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(8,11-tmin/20)}); }catch(_){}
            let tr=null; try{ tr=await window.IntMapTransitReach.open({lng:ll.lng,lat:ll.lat},tmin); }catch(_){}
            if(tr&&tr.ok) return R(true, note('🚆 '+esc(ll.name||a.place||'')+' — '+tr.minutes+' '+L('min by rail','分・鉄道到達圏','Min per Bahn','мин по ж/д','min en tren'))+note(tr.stations.length+' '+L('stations reachable within the time budget, riding the REAL OSM rail network (edge time = length ÷ line-class speed) — colored green→orange by minutes. Not a live timetable.','駅に時間内で到達可能。実在のOSM鉄道網を辿り（所要＝距離÷路線種別速度）、緑→橙で所要時間を色分け。実時刻表ではありません。','Bahnhöfe im Zeitbudget erreichbar (echtes OSM-Bahnnetz).','станций достижимо (реальная ж/д сеть OSM).','estaciones alcanzables (red ferroviaria real OSM).')));
            return R(false, warn('🚆 '+L('No rail reachable here in that time (or the rail-data service is busy). Try a point nearer a station, or 🚗/🚶.','この時間で到達できる鉄道が見つかりません（またはデータ混雑）。駅の近くや車・徒歩をお試しください。','Kein Bahnnetz erreichbar.','Ж/д недоступна.','Sin ferrocarril alcanzable.')));
          }
          const mode=/walk|foot|徒歩|pedestr|zu ?fu|пешк|a ?pie/.test(rawM)?'pedestrian':(/bike|bicycle|cycl|自転車|\brad\b|вело|bici/.test(rawM)?'bicycle':'auto');
          let mins=[]; if(Array.isArray(a.minutes)) mins=a.minutes.map(Number); else if(a.minutes!=null) mins=[+a.minutes]; else if(a.time!=null) mins=[+a.time]; else if(a.mins!=null) mins=[+a.mins];
          const _asked=mins.length; mins=mins.filter(x=>isFinite(x)&&x>0&&x<=120); if(!mins.length&&_asked) return R(false, warn('🎯 '+L('The reachable area is computed for 1 to 120 minutes — ask again inside that range.','到達圏は1〜120分の範囲で計算します。その範囲で指定してください。','Erreichbarkeit wird für 1 bis 120 Minuten berechnet — bitte in diesem Bereich fragen.','Зона доступности считается на 1–120 минут — укажите время в этом диапазоне.','El área alcanzable se calcula de 1 a 120 minutos — pídelo dentro de ese rango.')));   /* ⚠ (#R278) it used to silently fall back to [15,30] here, so 「3時間で行ける範囲」 drew a 30-minute area under a ✓ — the same lie as the circle */ if(!mins.length) mins=[15,30];
          try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(9,12-Math.max.apply(null,mins)/15)}); }catch(_){}
          let r=null; try{ r=await window.IntMapIsochrone.run({lng:ll.lng,lat:ll.lat},{mode,minutes:mins}); }catch(_){}
          const ic=mode==='pedestrian'?'🚶':mode==='bicycle'?'🚲':'🚗';
          if(r&&r.ok) return R(true, note('🎯 '+ic+' '+esc(ll.name||a.place||'')+' — '+r.minutes.join(' / ')+' '+L('min reachable','分の到達圏','Min erreichbar','мин зона','min alcanzable'))
            +note(L('Reachable area along the REAL road network (Valhalla / OpenStreetMap) — drive / walk / cycle, not a distance circle. Adjust mode & time in the 🎯 panel.','実際の道路網に沿った到達圏（Valhalla／OpenStreetMap）— 車・徒歩・自転車で、距離の円ではありません。モードと時間は🎯パネルで調整できます。','Erreichbarkeit entlang des echten Straßennetzes (Valhalla/OSM) — Auto/Fuß/Rad, kein Distanzkreis.','Зона доступности по реальной дорожной сети (Valhalla/OSM) — авто/пешком/вело, не круг.','Área alcanzable por la red vial real (Valhalla/OSM) — coche/pie/bici, no un círculo.')));
          return R(false, warn('🎯 '+((r&&r.reason==='render')?L('The reachable area was computed, but the map layer could not be created (the map style was still loading) — try again in a moment.','到達圏は計算できましたが、地図レイヤーを作成できませんでした（地図の読み込み中）— 少し待って再試行してください。','Die Erreichbarkeit wurde berechnet, aber die Kartenebene konnte nicht angelegt werden (Kartenstil lädt noch) — gleich erneut versuchen.','Зона доступности рассчитана, но слой карты не удалось создать (стиль карты ещё загружается) — повторите через момент.','El área alcanzable se calculó, pero no se pudo crear la capa del mapa (el estilo aún se está cargando) — inténtalo en un momento.'):L('Could not compute the reachable area (routing service busy) — try again.','到達圏を算出できませんでした（サービス混雑）— 再試行してください。','Erreichbarkeit fehlgeschlagen — erneut versuchen.','Не удалось рассчитать — попробуйте снова.','No se pudo calcular — reintenta.')))); }
        case 'route': { const A=await geocode(a.from); const B=await geocode(a.to); let any=false; try{ if(window.IntMapRoute&&window.IntMapRoute.open) window.IntMapRoute.open(); }catch(_){} try{ if(A&&window.IntMapRoute&&window.IntMapRoute.setStart){ window.IntMapRoute.setStart({lng:A.lng,lat:A.lat}); any=true; } }catch(_){} try{ if(B&&window.IntMapRoute&&window.IntMapRoute.setEnd){ window.IntMapRoute.setEnd({lng:B.lng,lat:B.lat}); any=true; } }catch(_){} if(A&&B){ try{ GE().camera.fitBounds([[Math.min(A.lng,B.lng),Math.min(A.lat,B.lat)],[Math.max(A.lng,B.lng),Math.max(A.lat,B.lat)]],{padding:80,duration:900}); }catch(_){} } return R(any, any?note('🚢 '+L('Sea route','海路','Seeroute','Морской путь','Ruta marítima')+': '+esc((A&&A.name)||a.from||'')+' → '+esc((B&&B.name)||a.to||'')):warn('⚠ '+L('Need start & destination','始点と終点が必要','Start & Ziel nötig','Нужны старт и финиш','Origen y destino'))); }
        case 'optimizeRoute': case 'tsp': case 'multiStop': case 'optimize': case 'optimizeStops': {
          let names=[]; if(Array.isArray(a.places)) names=a.places; else if(Array.isArray(a.points)) names=a.points; else if(Array.isArray(a.stops)) names=a.stops; else if(typeof a.places==='string') names=a.places.split(/[,、，]/); else if(typeof a.stops==='string') names=a.stops.split(/[,、，]/);
          names=names.map(x=>String(x).trim()).filter(Boolean).slice(0,12);
          const rawM2=String(a.mode||a.profile||'').toLowerCase(); const mode2=/walk|foot|徒歩|zu ?fu|пешк|a ?pie/.test(rawM2)?'walking':(/bike|bicycle|cycl|自転車|\brad\b|вело|bici/.test(rawM2)?'cycling':'driving');
          let pts=[];
          if(names.length){ for(const nm of names){ try{ const g=await geocode(nm); if(g) pts.push({lng:g.lng,lat:g.lat,name:g.name||nm}); }catch(_){} } }
          else if(typeof HOST.userPins!=='undefined' && HOST.userPins && HOST.userPins.length>=2){ pts=HOST.userPins.map((p,i)=>({lng:p.lng,lat:p.lat,name:L('Pin','ピン','Pin','Метка','Pin')+' '+(i+1)})); }
          if(pts.length<2) return R(false, warn('⚠ '+L('Give me at least 2 places to visit (comma-separated), or drop pins first.','巡回する地点を2つ以上（カンマ区切り）指定するか、先にピンを置いてください。','Mind. 2 Orte (kommagetrennt) angeben oder Pins setzen.','Укажите ≥2 места через запятую или поставьте метки.','Indica ≥2 lugares separados por comas o coloca pines.')));
          const ord=_tspOrder(pts); const seq=ord.map(i=>pts[i]);
          const mi=mode2==='walking'?'🚶':mode2==='cycling'?'🚲':'🚗';
          let r=null; try{ r=await window.IntMapRouting.route({lng:seq[0].lng,lat:seq[0].lat},{lng:seq[seq.length-1].lng,lat:seq[seq.length-1].lat},{mode:mode2,via:seq.slice(1,-1).map(p=>({lng:p.lng,lat:p.lat}))}); }catch(_){}
          const listHtml=seq.map((p,i)=>'<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.1);"><span style="flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--primary-color);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">'+(i+1)+'</span><span style="flex:1;min-width:0;font-size:12.5px;">'+esc(p.name)+'</span></div>').join('');
          let summ=''; if(r&&r.ok&&r.distance!=null){ const km=r.distance/1000, mn=Math.round(r.duration/60), h=Math.floor(mn/60), rm=mn%60; summ=mi+' <b>'+(h?(h+' h '+rm+' min'):(mn+' min'))+'</b> · '+(km<10?km.toFixed(1):Math.round(km).toLocaleString())+' km'; }
          else { try{ GE().camera.fitBounds([[Math.min.apply(null,seq.map(p=>p.lng)),Math.min.apply(null,seq.map(p=>p.lat))],[Math.max.apply(null,seq.map(p=>p.lng)),Math.max.apply(null,seq.map(p=>p.lat))]],{padding:70,duration:900}); }catch(_){} }
          return R(true, note('🧭 '+L('Optimized order','最短順路','Optimierte Reihenfolge','Оптимальный порядок','Orden óptimo')+' · '+pts.length+' '+L('stops','地点','Stopps','точек','paradas'))
            +(summ?('<div style="font-size:13px;margin:3px 0 4px;">'+summ+'</div>'):'')
            +'<div>'+listHtml+'</div>'
            +note(r&&r.ok? L('Ordered shortest-first (nearest-neighbor + 2-opt), then driven on the OSM road network (OSRM). The first stop is fixed as the start.','最近傍＋2-optで最短順に並べ替え、OSMの道路網（OSRM）で経路化。最初の地点を起点に固定します。','Kürzeste Reihenfolge (Nächster-Nachbar + 2-opt), auf dem OSM-Straßennetz (OSRM).','Кратчайший порядок (ближайший сосед + 2-opt) по дорожной сети OSM (OSRM).','Orden más corto (vecino más cercano + 2-opt) por la red vial OSM (OSRM).')
              : L('Ordered shortest-first (nearest-neighbor + 2-opt). Road routing is busy — the optimized ORDER is shown; try again for the drawn route.','最近傍＋2-optで最短順に並べ替えました。道路経路サービスが混雑中 — 順路は表示済み、描画は再試行してください。','Reihenfolge optimiert; Straßenrouting ausgelastet.','Порядок оптимизирован; дорожный маршрут занят.','Orden optimizado; el enrutamiento está ocupado.'))); }
        case 'directions': case 'roadRoute': case 'navigate': case 'drivingRoute': case 'walkingRoute': case 'transitRoute': {
          /* (#R85d) FULL Google/Apple-Maps-style routing UI INSIDE the Atlas message — NO popup ("よけいなポップアップを
             増設するな。Atlas内のメッセージでUIやれ"). */
          /* ⚠⚠ (#R296) 「交通手段選択タブを表示しないように」「返答の冒頭の文言は削除」 — both were the header:
             the question restated and a second mode switch in a transcript. EMPTIED not deleted: six branches prefix it. */
          /* ⚠⚠ (#R299) A BARE 「経路案内」 OPENS THE PANEL — the parser rule that lands here says so in as many words («open the empty
             directions panel»), and this branch only ever printed a sentence: the one ask that is a REQUEST FOR THE TOOL got told to type more. `IntMapRouteUI` is lazy — fetched as js/map-ui.js's row does. */
          if(!a.from&&!a.to&&!a.place){ let ok=false; try{ await window.IntMapLazy.need('routeUi'); ok=!!(window.IntMapRouteUI&&window.IntMapRouteUI.open()); }catch(_){}
            return R(true, note('🧭 '+L('Tell me a start and destination — e.g. "directions from Tokyo to Osaka" or "電車で新宿から横浜".','出発地と目的地を教えてください（例：「東京から大阪への経路」「電車で新宿から横浜」）。','Nenne Start und Ziel.','Укажите начало и цель.','Dime origen y destino.'))+(ok?note(L('The route planner is open on the map — fill in the two fields there, or say the places here.','経路パネルを地図上に開きました。パネルに入力するか、ここで地点を伝えてください。','Der Routenplaner ist geöffnet — dort ausfüllen oder die Orte hier nennen.','Планировщик маршрута открыт — заполните поля там или назовите места здесь.','El planificador de rutas está abierto — complétalo allí o dime los lugares aquí.')):'')); }
          /* (#R125) endpoint resolution hardened for rail asks: an exact Shinkansen-station name resolves to the
             REAL station (geocode fuzzy-matched 仙台駅 to a POI named 仙太鮨…), and a query ending in 駅/station
             whose geocode hit doesn't even CONTAIN the base name retries with the base (city) name instead. */
          const _geoEP=async q=>{ q=String(q||'').trim(); if(!q) return null;
            try{ const st=window.IntMapRouting.stationLL&&window.IntMapRouting.stationLL(q); if(st) return st; }catch(_){}
            let g=null; try{ g=await geocode(q); }catch(_){}
            const m=q.match(/^(.{2,}?)(駅|\s+station)$/i);
            if(m){ const base=m[1].trim();
              if(!g||(g.name&&String(g.name).indexOf(base)<0)){ try{ const g2=await geocode(base); if(g2) g=g2; }catch(_){} } }
            /* (#R126) 経路10-10 §6.3: SAME-NAME disambiguation — if the hit is far from the current view (>500 km)
               and a same-name candidate exists near the view, prefer the near one ("Potsdam" from a Germany view must
               be Potsdam DE, not Potsdam NY; verified the old path picked the US village). */
            try{ if(g&&GE().hasRenderer()&&GE().camera.getCenter){ const c=GE().camera.getCenter(); const dKm=(a,b)=>{const R=6371,x=(b[0]-a[0])*Math.PI/180*Math.cos((a[1]+b[1])/2*Math.PI/180),y=(b[1]-a[1])*Math.PI/180;return R*Math.sqrt(x*x+y*y);};
              if(dKm([c.lng,c.lat],[+g.lng,+g.lat])>500&&window.IntMapRouting.geoNear){ const n=await window.IntMapRouting.geoNear(q);
                if(n&&dKm([c.lng,c.lat],[+n.lng,+n.lat])<dKm([c.lng,c.lat],[+g.lng,+g.lat])/3) g=n; } } }catch(_){}
            return g; };
          const A=await _geoEP(a.from); const B=await _geoEP(a.to||a.place||a.destination);
          const rawMode=String(a.mode||a.profile||(a.type==='walkingRoute'?'walking':a.type==='transitRoute'?'transit':'')).toLowerCase();
          const isTr=/transit|train|rail|public|metro|subway|tram|bus|ferry|電車|鉄道|地下鉄|バス|公共|列車/.test(rawMode);
          const mode=isTr?'transit':(({car:'driving',drive:'driving',driving:'driving',foot:'walking',walk:'walking',walking:'walking',bike:'cycling',cycle:'cycling',cycling:'cycling'})[rawMode]||'driving');
          /* (#R296) still recorded: a follow-up 「徒歩で」 re-routes the last journey through this. */
          _lastRouteCtx={from:a.from,to:(a.to||a.place||a.destination),via:a.via};
          const _hdr='';
          if(!A||!B) return R(false, _hdr+warn('⚠ '+L('Could not find one of those places','地点を特定できませんでした','Ort nicht gefunden','Место не найдено','Lugar no encontrado')));
          let via=[]; if(Array.isArray(a.via)){ for(const v of a.via.slice(0,6)){ try{ const g=await geocode(String(v)); if(g) via.push({lng:g.lng,lat:g.lat}); }catch(_){} } }
          /* (#R132) §7.3: parse an avoid list (array or comma/space string) → toll/motorway/ferry for OSRM exclude= */
          let _avoid=null; { let av=a.avoid||a.avoids||a.exclude; if(typeof av==='string') av=av.split(/[,、\s]+/); if(Array.isArray(av)){ _avoid=av.map(x=>{ x=String(x).toLowerCase(); return /toll|有料/.test(x)?'toll':/motorway|highway|freeway|高速/.test(x)?'motorway':/ferry|フェリー/.test(x)?'ferry':''; }).filter(Boolean); if(!_avoid.length) _avoid=null; } }
          /* (#R184) the three request-shaping options this round added, passed straight through:
             a keep-out AREA (Valhalla exclude_polygons — road modes only), the transit modes MOTIS may
             use, and a walking cap. Each is validated here rather than trusted, because they come from
             a planner's JSON. */
          const _areas=(Array.isArray(a.avoidAreas)?a.avoidAreas:(a.avoidArea?[a.avoidArea]:[]))
            .map(r2=>Array.isArray(r2)?r2.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]):[])
            .filter(r2=>r2.length>=4).slice(0,8);
          const _TM=['RAIL','SUBWAY','TRAM','BUS','FERRY'];
          const _tmodes=(Array.isArray(a.transitModes)?a.transitModes:[])
            .map(x=>String(x).toUpperCase()).filter(x=>_TM.indexOf(x)>=0);
          const _mw=(isFinite(+a.maxWalkM)&&+a.maxWalkM>0)?Math.min(5000,+a.maxWalkM):null;
          let r=null; try{ r=await window.IntMapRouting.route({lng:A.lng,lat:A.lat},{lng:B.lng,lat:B.lat},
            Object.assign({mode,via,time:a.time||a.datetime||a.depart||a.arrive,arriveBy:!!(a.arriveBy||a.arrive),avoid:_avoid},
              _areas.length?{avoidAreas:_areas}:{},
              (_tmodes.length&&_tmodes.length<5)?{transitModes:_tmodes}:{},
              _mw?{maxWalkM:_mw}:{})); }catch(_){}
          if(r&&r.transit){
            const totMin=Math.round(r.duration/60), hrs=Math.floor(totMin/60), rem=totMin%60, dur=hrs?(hrs+' h '+rem+' min'):(totMin+' min'); const tf=r.transfers||0;
            const _ic=m=>{ m=String(m||'').toUpperCase(); return /WALK|FOOT/.test(m)?'🚶':/SUBWAY|METRO/.test(m)?'🚇':/TRAM|LIGHT_RAIL|STREETCAR/.test(m)?'🚊':/BUS|COACH/.test(m)?'🚌':/FERRY|BOAT/.test(m)?'⛴':/HIGHSPEED|LONG_DISTANCE/.test(m)?'🚄':/RAIL|TRAIN|REGIONAL|SUBURBAN|NIGHT/.test(m)?'🚆':'🚈'; };
            const _tm=iso=>{ try{ const d=new Date(iso); return isFinite(d.getTime())?d.toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}):''; }catch(_){ return ''; } };
            const seq=(r.legs||[]).map(l=>_ic(l.mode)+(l.route&&!l.walk?(' '+esc(l.route)):'')).join(' → ');
            /* ⚠ (#R291) NOT WRITTEN HERE ANY MORE (§17): this and js/routing.js's `legRows()` had drifted apart — Atlas badged a live leg, the panel did not. */
            const _cardOpt=()=>({lang:HOST.lang,units:(typeof HOST.unitMode!=='undefined'?HOST.unitMode:'metric'),tz:(HOST.userTZ&&HOST.userTZ!=='auto')?HOST.userTZ:''});
            const _legRow=(l)=>window.IntMapRouteCards.legRows([l],_cardOpt());
            const legHtml=(r.legs||[]).map(_legRow).join('');
            const summ=r.railEstimate?('<b>~'+dur+'</b> · '+Math.round(r.railKm).toLocaleString()+' km'+(r.lines&&r.lines.length?(' · '+r.lines.slice(0,3).map(esc).join(' → ')):(' '+L('by rail','鉄道','per Bahn','по ж/д','por vía')))):('<b>'+(r.jrEstimate?'~':'')+dur+'</b> · '+tf+' '+L('transfer'+(tf===1?'':'s'),'回乗換','Umst.','пересадок','transb.')+(r.startTime?(' · '+_tm(r.startTime)+'→'+_tm(r.endTime)):''));
            /* (#R86) list EVERY alternative itinerary (Google/Apple-Maps style — the Berlin→Amsterdam screenshot); the
               selected one is expanded, tapping another redraws it on the map via IntMapRouting.selectAlt. */
            const alts=(!r.railEstimate&&r.alternatives&&r.alternatives.length>1)?r.alternatives:null;
            let body;
            if(alts){ const selI=r.sel||0;
              /* ⚠ (#R291) the SHARED cards (§17) — one renderer, two surfaces. */
              /* ⚠ (#R298) …and the SAME SHAPE: the chosen card OPENS, exactly as it does in the panel.
                 It was a sibling block here and an in-card block there — one renderer, two layouts. */
              body=window.IntMapRouteCards.altCards(alts,Object.assign(_cardOpt(),{sel:selI,setId:r.routeSetId,transit:true,
                detail:(i2,a2)=>window.IntMapRouteCards.legRows(a2.legs,_cardOpt())}));
            } else { body='<div style="font-size:13px;margin:3px 0 3px;">'+summ+'</div><div style="font-size:12px;margin-bottom:4px;">'+seq+'</div><div style="max-height:220px;overflow:auto;">'+legHtml+'</div>'; }
            let h=_hdr+(alts?('<div style="font-size:11px;color:var(--text-muted);margin:2px 0 5px;">'+alts.length+' '+L('options — tap one to show it on the map','件の候補 — タップで地図に表示','Optionen — zum Anzeigen antippen','вариантов — нажмите, чтобы показать','opciones — toca para ver en el mapa')+'</div>'):'')+body
              +note(r.jrEstimate
                ? L('Intercity Japan rail: real Shinkansen lines and stations, with times estimated from the operators’ published timetables (express pattern + service frequency) — not live times. Local segments use open GTFS (Transitous) where available; where none exists (e.g. Nagoya) they are distance-based estimates, marked as such. The line between stations is schematic.','日本の都市間鉄道: 実在の新幹線路線・停車駅に基づき、所要時間は各社の公表時刻表（速達パターン＋運行頻度）からの概算です（リアルタイムではありません）。ローカル区間は公開GTFS（Transitous）があれば実データ、無い地域（例: 名古屋圏）は距離ベースの目安と明記しています。駅間の線形は概略です。','Japan-Fernverkehr: echte Shinkansen-Linien/Bahnhöfe, Zeiten aus den veröffentlichten Fahrplänen geschätzt (kein Echtzeitfahrplan). Lokale Abschnitte per offenem GTFS, sonst gekennzeichnete Distanzschätzung. Linienverlauf zwischen Bahnhöfen schematisch.','Междугородние ж/д Японии: реальные линии и станции синкансэна, время — оценка по опубликованным расписаниям (не в реальном времени). Местные участки — открытый GTFS, иначе помеченная оценка по расстоянию. Линия между станциями схематична.','Tren interurbano de Japón: líneas y estaciones reales de Shinkansen, tiempos estimados de los horarios publicados (no en vivo). Tramos locales con GTFS abierto o estimación marcada. Trazado entre estaciones esquemático.')
                : r.railEstimate
                ? L('Routed along the REAL rail network (OpenStreetMap), naming the actual lines and stations it rides (walk to the nearest station). JR/Shinkansen publish no open timetable (GTFS), so the time is estimated from typical speeds per line class (high-speed / conventional) — not a live schedule.','実在の鉄道網（OpenStreetMap）に沿って路線名・駅名まで特定した「列車が走る経路」です（最寄り駅までは徒歩）。JR・新幹線等は公開時刻表（GTFS）が無いため、所要時間は路線種別（新幹線／在来線）の標準速度からの概算で、実際の時刻表ではありません。','Entlang des echten Schienennetzes (OSM), mit echten Linien- und Bahnhofsnamen — Zeit ist aus typischen Geschwindigkeiten geschätzt, kein Fahrplan.','Проложено по реальной ж/д сети (OSM) с реальными названиями линий и станций — время оценено по типовым скоростям, не расписание.','Trazado por la red ferroviaria real (OSM), con nombres reales de líneas y estaciones — tiempo estimado por velocidades típicas, no horario.')
                : r.realtime
                ? L('Public-transit routing (Transitous / MOTIS) — includes REAL-TIME updates for this trip (live departures / delays where the operator publishes them).','公共交通の経路検索（Transitous／MOTIS）— この旅程はリアルタイム運行情報（事業者が公開する実時刻・遅延）を含みます。','ÖPNV (Transitous/MOTIS) — mit ECHTZEIT-Daten für diese Verbindung (Live-Abfahrten/Verspätungen).','Транзит (Transitous/MOTIS) — с данными в РЕАЛЬНОМ ВРЕМЕНИ по этому маршруту (задержки/отправления).','Transporte (Transitous/MOTIS) — con datos en TIEMPO REAL para este viaje (salidas/retrasos).')
                : L('Public-transit routing (Transitous / MOTIS) — timetable-based (no real-time data for this trip).','公共交通の経路検索（Transitous／MOTIS）— 時刻表ベース（この旅程のリアルタイム情報はありません）。','ÖPNV (Transitous/MOTIS) — fahrplanbasiert (keine Echtzeitdaten für diese Verbindung).','Транзит (Transitous/MOTIS) — по расписанию (без данных реального времени).','Transporte (Transitous/MOTIS) — según horario (sin datos en tiempo real para este viaje).'));   /* (#R103) dropped the "walk dotted / colour-coded" wording per request; (#R132) §2.4/§9.6 honest live-vs-timetable */
            if(r.shapeGap) h+=note(L('Some ride-segment shapes could not be retrieved — those legs are listed above but not drawn on the map (no straight-line substitutes).','一部の乗車区間の形状を取得できませんでした — 該当区間は行程に表示しますが、地図には描画しません（直線での代用はしません）。','Einige Fahrt-Abschnittsformen fehlen — diese Abschnitte stehen in der Liste, werden aber nicht gezeichnet (kein Geraden-Ersatz).','Форма части участков недоступна — они в списке, но не рисуются на карте (без замены прямыми).','No se pudo obtener la forma de algunos tramos — se listan pero no se dibujan (sin sustitutos en línea recta).'));
            return R(true, h); }
          if(!r||!r.ok){ const stt=(r&&r.status)||'';
            /* (#R126) 経路10-10 §2.5/§16.8: typed statuses get their OWN honest message instead of one "not found" */
            if(stt==='cancelled') return R(true, _hdr+note(L('Superseded by a newer route request.','新しい経路リクエストに置き換えられました。','Durch eine neuere Routenanfrage ersetzt.','Заменено более новым запросом маршрута.','Sustituido por una solicitud de ruta más reciente.')));
            if(stt==='provider_timeout'||stt==='provider_unavailable'||stt==='rate_limited'){
              const m2=stt==='rate_limited'?L('Too many requests — wait a moment and try again.','リクエストが多すぎます — 少し待って再試行してください。','Zu viele Anfragen — kurz warten und erneut versuchen.','Слишком много запросов — подождите и повторите.','Demasiadas solicitudes — espera y reintenta.')
                :stt==='provider_timeout'?L('The routing service timed out — try again.','経路サービスがタイムアウトしました — 再試行してください。','Zeitüberschreitung beim Routingdienst — erneut versuchen.','Тайм-аут сервиса маршрутов — повторите.','El servicio de rutas agotó el tiempo — reintenta.')
                :L('The routing service is unreachable right now (outage or network) — the route was NOT computed. Try again shortly.','経路サービスに接続できません（障害またはネットワーク）— 経路は計算されていません。しばらくして再試行してください。','Routingdienst nicht erreichbar — Route NICHT berechnet. Später erneut versuchen.','Сервис маршрутов недоступен — маршрут НЕ рассчитан. Повторите позже.','Servicio de rutas no disponible — la ruta NO se calculó. Reintenta en breve.');
              return R(false, _hdr+warn('⚠ '+m2)); }
            if(isTr) return R(true, _hdr+warn('🚆 '+L('No public-transit route here — the area may have no open transit data yet. Try 🚗 or 🚶 above.','この区間の公共交通経路が見つかりません。上のボタンで車・徒歩をお試しください。','Keine ÖPNV-Verbindung — oben 🚗/🚶 versuchen.','Нет транзита — попробуйте 🚗/🚶 выше.','Sin transporte — prueba 🚗/🚶 arriba.')));
            const snapTx=(r&&r.snapKm)?(' '+L('One point is ~'+r.snapKm+' km from the nearest routable road (outside road-data coverage / across water).','一方の地点が最寄りの経路可能な道路から約'+r.snapKm+' km離れています（道路データ対象外／水域越えの可能性）。','Ein Punkt liegt ~'+r.snapKm+' km von der nächsten routbaren Straße (außerhalb der Abdeckung).','Точка в ~'+r.snapKm+' км от ближайшей дороги (вне покрытия).','Un punto está a ~'+r.snapKm+' km de la carretera más cercana (fuera de cobertura).')):'';
            return R(true, _hdr+warn('⚠ '+L('No route found (no road connection between these points).','経路が見つかりません（この2地点間に陸路の接続がありません）。','Keine Route gefunden (keine Straßenverbindung).','Маршрут не найден (нет дорожного соединения).','Sin ruta (sin conexión por carretera).')+snapTx)); }
          /* (#R132) 経路10-10 §7.1/§10/§12/§16: road reply mirrors transit — selectable alternative cards
             (fastest/shortest/+X min) in the SAME .atl-trips/.atl-trip structure the existing selectAlt handler
             drives (data-rset), plus rich turn-by-turn (IntMapRouting.maneuver) with lane guidance and step→map. */
          const _rdur=sec=>{ const t=Math.round(sec/60),hh=Math.floor(t/60),mm=t%60; return hh?(hh+' h '+mm+' min'):(t+' min'); };
          const _rkm=m=>{ const k=m/1000; return (k<10?k.toFixed(1):Math.round(k).toLocaleString())+' km'; };
          const _mvr=s=>{ try{ return window.IntMapRouting.maneuver(s); }catch(_){ return {icon:'↑',text:String(s.name||''),lane:''}; } };
          /* ⚠ (#R291) same rule as `_legRow`: one step renderer, so glyphs, lanes and units match. `data-si` is unchanged. */
          const _cardOpt2=()=>({lang:HOST.lang,units:(typeof HOST.unitMode!=='undefined'?HOST.unitMode:'metric'),tz:(HOST.userTZ&&HOST.userTZ!=='auto')?HOST.userTZ:''});
          const _stepList=(steps)=>window.IntMapRouteCards.stepRows(steps,Object.assign(_cardOpt2(),{maneuver:_mvr}));
          const ralts=(r.alternatives&&r.alternatives.length>1)?r.alternatives:null;
          let h=_hdr;
          if(ralts){ h+='<div style="font-size:11px;color:var(--text-muted);margin:2px 0 5px;">'+ralts.length+' '+L('routes — tap one to show it on the map','経路候補 — タップで地図に表示','Routen — zum Anzeigen antippen','маршрутов — нажмите, чтобы показать','rutas — toca para ver en el mapa')+'</div>'
              /* ⚠ (#R291) THE SAME CARDS THE PANEL DRAWS (§17), with the same `data-rset` / `data-ai`. */
              +window.IntMapRouteCards.altCards(ralts,Object.assign(_cardOpt2(),{sel:0,setId:r.routeSetId,transit:false,
                detail:(i2,a2)=>_stepList(a2.steps)}));   /* (#R298) the card opens — see routing-cards.refreshDetail */
          } else { h+='<div style="font-size:13px;margin:3px 0 5px;"><b>'+_rdur(r.duration)+'</b> · '+_rkm(r.distance)+'</div>'
              +'<div style="max-height:220px;overflow:auto;font-size:11.5px;line-height:1.5;" class="atl-rsteps" data-rset="'+esc(r.routeSetId||'')+'">'+_stepList(r.steps)+'</div>'; }
          h+=note(r.provider==='valhalla'
            /* ⚠ (#R296) 「「所要時間は交通状況を含まない標準値です。」だけでいい」 — it drops the provider's name and a phrase the reader knows. */
            ? L('Times are typical (no live traffic).','所要時間は交通状況を含まない標準値です。','Zeiten sind typisch (kein Live-Verkehr).','Время типовое (без пробок).','Los tiempos son típicos (sin tráfico).')
            : L('Times are typical (no live traffic).','所要時間は交通状況を含まない標準値です。','Zeiten sind typisch (kein Live-Verkehr).','Время типовое (без пробок).','Los tiempos son típicos (sin tráfico).'));
          if(r.avoidDropped) h+=warn('⚠ '+L('Could not apply the avoid options (routing service busy) — showing the normal route.','回避条件を適用できませんでした（経路サービス混雑）— 通常経路を表示。','Meiden-Optionen nicht anwendbar (Dienst ausgelastet) — normale Route.','Не удалось применить исключения — обычный маршрут.','No se pudieron aplicar las exclusiones — ruta normal.'));
          return R(true, h); }
        case 'streetview': case 'streetView': case 'pano': {
          /* (#R84) coverage mode: with no place, or when explicitly asked, tint roads blue + make the map clickable */
          if(a.on===false||/^(off|hide|stop)$/i.test(String(a.mode||''))){ try{ window.IntMapStreetView&&window.IntMapStreetView.coverage&&window.IntMapStreetView.coverage(false); }catch(_){} try{ window.IntMapStreetView&&window.IntMapStreetView.close&&window.IntMapStreetView.close(); }catch(_){} return R(true, note('✓ '+L('Street View off','ストリートビューをオフ','Street View aus','Просмотр улиц выкл','Street View apagado'))+_featTogHtml('streetview')); }   /* (#R150) offer the toggle to flip it back on */
          const wantCov=/^(coverage|layer|mode|map|roads?)$/i.test(String(a.mode||''))||a.coverage===true||(!a.place&&a.lng==null&&!(_herePoint&&isFinite(_herePoint.lng)));
          if(wantCov){ await window.IntMapLazy.need('streetView'); let on=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.coverage) on=window.IntMapStreetView.coverage(true); }catch(_){} return R(!!on, on?note('🧍 '+L('Street View mode on — the light-blue lines are Google\'s real coverage; click one to open its panorama','ストリートビュー・モードをオン — 水色の線はGoogleの実際のカバレッジです。クリックでパノラマを表示','Street-View-Modus an — die hellblauen Linien sind Googles echte Abdeckung; zum Öffnen anklicken','Режим панорам включён — голубые линии это реальное покрытие Google; кликните для просмотра','Modo Street View activado — las líneas celestes son la cobertura real de Google; haz clic para abrir'))+_featTogHtml('streetview'):warn('⚠')); }
          let ll=null; if(a.lng!=null&&isFinite(+a.lng)) ll={lng:+a.lng,lat:+a.lat,name:a.place||''}; else if(a.place) ll=await geocode(a.place); else if(_herePoint&&isFinite(_herePoint.lng)) ll={lng:_herePoint.lng,lat:_herePoint.lat,name:_herePoint.name||''};
          if(!ll) return R(false, warn('⚠ '+L('Where? Name a place or right-click a point','場所を指定するか地点を右クリックしてください','Wo? Ort nennen oder Punkt rechtsklicken','Где? Назовите место или ПКМ по точке','¿Dónde? Nombra un lugar')));
          try{ GE().camera.flyTo({center:[+ll.lng,+ll.lat],zoom:Math.max(GE().camera.getZoom(),15),duration:900}); }catch(_){}
          await window.IntMapLazy.need('streetView'); let ok=false; try{ if(window.IntMapStreetView&&window.IntMapStreetView.open) ok=window.IntMapStreetView.open({lng:+ll.lng,lat:+ll.lat},ll.name||''); }catch(_){}
          return R(ok, ok?note('🧍 '+L('Street View','ストリートビュー','Street View','Просмотр улиц','Street View')+': '+esc(ll.name||((+ll.lat).toFixed(4)+', '+(+ll.lng).toFixed(4)))):warn('⚠')); }
        case 'radiation': case 'fallout': case 'dispersion': case 'plume': case 'radiationSim': {
          /* (#R85b) robust source resolution ("福島第一原発 → Where is the release source?"): explicit coords →
             built-in nuclear-site gazetteer → online geocode → simplified retry → source-preset default coords. */
          const _place=String(a.place||a.from||a.at||a.source||'').trim();
          let ll=(a.lng!=null&&isFinite(+a.lng)&&a.lat!=null)?{lng:+a.lng,lat:+a.lat,name:a.place||''}:null;
          if(!ll){ try{ ll=window.IntMapRadiation.resolveSite&&window.IntMapRadiation.resolveSite(_place); }catch(_){} }
          if(!ll&&_place){ try{ ll=await geocode(_place); }catch(_){} }
          if(!ll&&_place){ /* strip generic words the geocoder chokes on (原発/nuclear/power plant/npp…) and retry */
            const _clean=_place.replace(/(原子力発電所|原発|発電所|nuclear\s*power\s*(plant|station)?|power\s*(plant|station)|nuclear|npp|reactor|станция|аэс)/ig,'').replace(/\s{2,}/g,' ').trim();
            if(_clean&&_clean!==_place){ try{ ll=window.IntMapRadiation.resolveSite&&window.IntMapRadiation.resolveSite(_clean); }catch(_){} if(!ll){ try{ ll=await geocode(_clean); }catch(_){} } } }
          if(!ll){ const _sp=(window.IntMapRadiation.SOURCES||{})[String(a.source||'').toLowerCase()]; if(_sp&&_sp.ll) ll={lng:_sp.ll[0],lat:_sp.ll[1],name:_sp.n}; }   /* fall back to the preset's own location */
          if(!ll) return R(false, warn('⚠ '+L('Where is the release source? Name a plant/place, or right-click a point.','放出源はどこですか？（原発名・地名の指定、または地点を右クリック）','Wo ist die Quelle?','Где источник выброса?','¿Dónde está la fuente?')));
          /* (#R85) selectable source term / emission duration / isotope / start date-time + a FINAL deposition map
             with real dose zones ("放出量や放出時間、日時等も選べるように … 最終的な飛散もマッピング … 地点によってどの程度の
             放射線被害があるかも説明"). */
          const SRCS=window.IntMapRadiation.SOURCES||{}, ISOS=window.IntMapRadiation.ISOTOPES||{};
          const srcKey=String(a.source||'').toLowerCase(); const srcPreset=SRCS[srcKey];
          const opts={ seconds:a.seconds, hours:a.hours, emitHours:a.emitHours, halfLifeHours:a.halfLifeHours||a.halfLife,
            isotope:a.isotope, source:a.source, date:a.date||a.datetime||a.when,
            bq:(a.bq!=null?+a.bq:(a.becquerel!=null?+a.becquerel:(a.pbq!=null?+a.pbq*1e15:(a.tbq!=null?+a.tbq*1e12:(srcPreset?srcPreset.bq:undefined))))) };
          let r=null; try{ r=await window.IntMapRadiation.run({lng:ll.lng,lat:ll.lat,name:ll.name},opts); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'error'))); }
          if(!r||!r.ok) return R(false, warn('⚠ '+((r&&r.reason==='wind')?L('Could not fetch the live wind data the dispersion model needs','拡散モデルに必要な風データを取得できませんでした','Konnte keine Live-Winddaten abrufen','Не удалось получить данные о ветре','No se pudieron obtener datos de viento'):L('The dispersion simulation could not run (map still loading)','拡散シミュレーションを実行できませんでした（地図読込中）','Simulation nicht möglich','Симуляция не запустилась','No se pudo ejecutar la simulación'))));
          const dirName=d=>{ const names=[L('north','北','Nord','север','norte'),L('northeast','北東','Nordost','северо-восток','noreste'),L('east','東','Ost','восток','este'),L('southeast','南東','Südost','юго-восток','sureste'),L('south','南','Süd','юг','sur'),L('southwest','南西','Südwest','юго-запад','suroeste'),L('west','西','West','запад','oeste'),L('northwest','北西','Nordwest','северо-запад','noroeste')]; return names[Math.round(((d%360)/45))%8]; };
          const fmtBq=v=>{ v=+v; if(!isFinite(v)) return '?'; if(v>=1e15) return (v/1e15).toFixed(1)+' PBq'; if(v>=1e12) return (v/1e12).toFixed(0)+' TBq'; if(v>=1e9) return (v/1e9).toFixed(0)+' GBq'; return v.toExponential(1)+' Bq'; };
          const annualMSv=(uSvH)=>uSvH*8766/1000*0.5;   /* continuous-outdoor × 0.5 shelter/occupancy → mSv/y */
          let h='<div style="font-weight:600;">☢ '+esc(ll.name||a.place)+' — '+L('radioactive dispersion & fallout','放射性物質の拡散・降下','radioaktive Ausbreitung & Fallout','рассеивание и выпадение','dispersión y lluvia radiactiva')+'</div>'
            +'<div style="font-size:12.5px;line-height:1.72;margin-top:3px;">'
            +'<div>☢ '+L('Source term','放出量','Quellterm','Выброс','Término fuente')+': <b>'+fmtBq(r.bq)+'</b> '+esc(r.iso)+' · '+L('released over','放出時間','über','за','durante')+' '+r.emitHours+' h</div>'
            +(r.startISO?('<div>🕒 '+L('Release start','放出開始','Freisetzungsbeginn','Начало','Inicio')+': '+esc(new Date(r.startISO).toLocaleString(window.IntMapLang.locale(HOST.lang,"en-GB")))+'</div>'):'')
            +'<div>💨 '+L('Surface wind','地上風','Bodenwind','Приземный ветер','Viento')+': '+r.windSpeed.toFixed(1)+' m/s '+L('toward the','→ ','Richtung ','на ','hacia el ')+dirName(r.windToward)+' · '+L('plume reach','到達','Reichweite','дальность','alcance')+' ~'+r.reachKm+' km</div>'
            +'<div>🌧 '+L('Wet deposition','湿性沈着（降雨洗浄）','Nassdeposition','Влажное осаждение','Deposición húmeda')+': '+(r.wet?L('active — rain washing particles down','あり — 降雨が粒子を洗い落とし','aktiv','активно','activa'):L('none in area','領域内でなし','keine','нет','ninguna'))+'</div>'
            +'</div>';
          /* final deposition dose zones */
          const zLbls=r.zones||[]; const rows=[];
          for(let z=0;z<zLbls.length;z++){ const km2=(r.zoneKm2&&r.zoneKm2[z])||0; if(km2<=0) continue;
            rows.push('<div style="display:flex;align-items:center;gap:7px;padding:2px 0;"><span style="width:12px;height:12px;border-radius:3px;flex:0 0 auto;background:'+zLbls[z].c+';"></span><span style="flex:1;">'+esc(window.IntMapLang.pick(()=>HOST.lang).arr(zLbls[z].n))+'</span><span style="color:var(--text-muted);">≥'+zLbls[z].min+' kBq/m² · '+km2.toFixed(km2<10?1:0)+' km²</span></div>'); }
          h+='<div style="font-weight:600;margin:6px 0 2px;font-size:12px;">'+L('Final ground deposition (Cs-137-equivalent zones)','最終的な地表沈着（Cs-137換算ゾーン）','Endgültige Bodendeposition','Итоговое выпадение','Deposición final')+'</div>';
          h+=rows.length?('<div style="font-size:11.5px;">'+rows.join('')+'</div>'):('<div style="font-size:11.5px;color:var(--text-muted);">'+L('Deposition stays below mapped thresholds in this run (winds carried most activity out of the modeled area).','この条件では地図化しきい値未満（大半が領域外へ運ばれました）。','unter den Schwellen','ниже порогов','por debajo de umbrales')+'</div>');
          if(r.peakKBqM2>0){ const uH=r.peakDoseUSvH, yr=annualMSv(uH);
            h+='<div style="font-size:11.5px;margin-top:4px;">📈 '+L('Peak deposition','最大沈着','Spitzendeposition','Пик','Pico')+': <b>'+Math.round(r.peakKBqM2).toLocaleString()+' kBq/m²</b> → '+L('external dose rate','外部被ばく線量率','Dosisleistung','мощность дозы','tasa de dosis')+' ≈ <b>'+(uH>=1?uH.toFixed(1):uH.toFixed(2))+' µSv/h</b> ('+L('about','約','ca.','≈','≈')+' '+(yr>=1?Math.round(yr):yr.toFixed(1))+' mSv/'+L('yr','年','a','год','año')+')</div>';
            h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+L('For reference: natural background ≈ 2–3 mSv/yr; Japan\'s Fukushima evacuation criterion was 20 mSv/yr; Chernobyl\'s permanent-exclusion zone ≥1480 kBq/m².','参考：自然放射線 約2–3 mSv/年、福島の避難基準 20 mSv/年、チェルノブイリの永久立入禁止 1480 kBq/m²以上。','Referenz: Untergrund ≈2–3 mSv/a.','Для справки: фон ≈2–3 мЗв/год.','Referencia: fondo ≈2–3 mSv/año.')+'</div>'; }
          /* (#R85d) FULL inline configuration IN the message ("こちらで設定できない項目が多すぎる" — no popup): isotope,
             source term, emission duration, simulation hours, start time — each re-runs the model in place. */
          _lastRadCtx={place:(a.place||a.from||a.source||ll.name),lng:ll.lng,lat:ll.lat,bq:r.bq,isotope:String(opts.isotope||'cs137').toLowerCase(),emitHours:r.emitHours,hours:r.hours,date:opts.date||''};
          const cur=_lastRadCtx;
          const _rb=(o,lbl)=>'<button class="atl-traj-btn" data-rad=\''+esc(JSON.stringify(o))+'\'>'+esc(lbl)+'</button>';
          const _sel=(key,list,val)=>'<select class="atl-rad-sel" data-radp="'+key+'">'+list.map(o=>'<option value="'+o[0]+'"'+((''+o[0])===(''+val)||(key==='bq'&&Math.abs(+o[0]-+val)<+o[0]*0.03)?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
          const _step=(key,val,delta,min,max,unit,label)=>'<div class="atl-rad-ctl"><span>'+label+'</span><button class="atl-traj-btn atl-rad-mini" data-rad=\''+esc(JSON.stringify({[key]:Math.max(min,val-delta)}))+'\'>−</button><b>'+val+unit+'</b><button class="atl-traj-btn atl-rad-mini" data-rad=\''+esc(JSON.stringify({[key]:Math.min(max,val+delta)}))+'\'>＋</button></div>';
          h+='<div class="atl-rad-cfg">'
            +'<div class="atl-rad-ctl"><span>'+L('Isotope','核種','Isotop','Изотоп','Isótopo')+'</span>'+_sel('isotope',[['cs137','Cs-137 (30y)'],['i131','I-131 (8d)'],['cs134','Cs-134 (2y)'],['sr90','Sr-90 (29y)']],cur.isotope)+'</div>'
            +'<div class="atl-rad-ctl"><span>'+L('Source','放出量','Quelle','Выброс','Fuente')+'</span>'+_sel('bq',[[8.5e16,'Chernobyl · 85 PBq'],[1.5e16,'Fukushima · 15 PBq'],[1e15,'1 PBq'],[3.7e13,'Dirty bomb · 37 TBq'],[1e12,'1 TBq']],cur.bq)+'</div>'
            +_step('emitHours',cur.emitHours,2,0.5,72,'h',L('Emission','放出時間','Freisetzung','Выброс','Emisión'))
            +_step('hours',cur.hours,12,6,80,'h',L('Sim window','計算時間','Zeitfenster','Окно','Ventana'))
            +'</div>';
          h+='<div class="atl-traj-row">'+_rb({source:'chernobyl',emitHours:10,hours:60},L('Chernobyl','チェルノブイリ級','Tschernobyl','Чернобыль','Chernóbil'))
            +_rb({source:'fukushima',emitHours:8,hours:48},L('Fukushima','福島級','Fukushima','Фукусима','Fukushima'))
            +_rb({source:'dirtybomb',isotope:'cs137',emitHours:0.5,hours:24},L('Dirty bomb','ダーティボム','Schmutzige Bombe','Грязная бомба','Bomba sucia'))+'</div>';
          h+=note(L('Lagrangian particle model on LIVE Open-Meteo wind/temperature/precipitation (or the ERA5 archive for a past date): advection + stability-scaled turbulent diffusion + wet & dry deposition + radioactive decay. The source term (Bq), emission duration, isotope half-life and start time are yours to set; the colored ground zones are the final deposition classified by the real Chernobyl Cs-137 thresholds, and the dose figures assume a Cs-137 ground-shine conversion. EDUCATIONAL approximation, NOT an operational forecast — in a real emergency follow official authorities (SPEEDI / IAEA / local government).','ラグランジュ粒子モデル。Open-Meteoのライブ風・気温・降水（過去日はERA5アーカイブ）で移流＋安定度依存の乱流拡散＋湿性乾性沈着＋放射性崩壊を計算。放出量(Bq)・放出時間・核種半減期・開始時刻を指定できます。色分けゾーンは最終沈着を実際のチェルノブイリのCs-137しきい値で分類、線量はCs-137地表γ線換算です。教育目的の近似であり運用予報ではありません。実際の緊急時は公的機関（SPEEDI／IAEA／自治体）に従ってください。','Lagrange-Partikelmodell mit Live-Wetter — Bildungsnäherung.','Лагранжева модель с реальной погодой — образовательная.','Modelo lagrangiano con clima real — educativo.'));
          return R(true, h); }
        case 'flightSim': case 'flightsim': case 'flightsimulator': case 'flysim': case 'pilot': {
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
          return R(ok, ok?note('✈ '+L('Flight simulator — pick your aircraft & runway, then START','飛行シミュレーター — 機体と滑走路を選んで START','Flugsimulator — Flugzeug & Piste wählen, dann START','Авиасимулятор — выберите самолёт и полосу, затем СТАРТ','Simulador — elige avión y pista, luego INICIAR')+(nm?(' · '+esc(nm)):'')):warn('⚠ '+L('Could not start the flight simulator','飛行シミュレーターを開始できませんでした','Konnte den Flugsimulator nicht starten','Не удалось запустить','No se pudo iniciar'))); }
        case 'runway': case 'airports': { const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),7)}); }catch(_){} let ok=false; try{ if(window.RunwaySearch&&window.RunwaySearch.open){ window.RunwaySearch.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note('🛬 '+esc(ll.name||a.place||'')):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||''))); }
        case 'edu': case 'learn': { let ok=false; try{ if(window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-edu'); return R(ok, ok?note('🎓 '+L('Learn','学ぶ','Lernen','Обучение','Aprender')):warn('⚠')); }
        case 'ecmwf': case 'weatherLayers': { let ok=false; try{ if(window.IntMapWeatherEC&&window.IntMapWeatherEC.open){ window.IntMapWeatherEC.open(); ok=true; } }catch(_){} return R(ok, ok?note('🌦 '+L('Weather layers','気象レイヤー','Wetterebenen','Погодные слои','Capas meteorológicas')):warn('⚠')); }
        case 'widgets': { let ok=false; try{ if(window.IntMapWidgets&&window.IntMapWidgets.toggle){ window.IntMapWidgets.toggle(); ok=true; } else ok=clickId('btn-widgets'); }catch(_){} return R(ok, ok?note('✓ '+L('Widgets','ウィジェット','Widgets','Виджеты','Widgets')):warn('⚠')); }
        case 'screenshot': { const ok=clickId('btn-screenshot'); return R(ok, ok?note('✓ '+L('Screenshot','スクショ','Screenshot','Снимок','Captura')):warn('⚠')); }
        case 'share': { let ok=false; try{ if(window.IntMapShare&&window.IntMapShare.open){ window.IntMapShare.open(); ok=true; } else ok=clickId('btn-share'); }catch(_){} return R(ok, ok?note('✓ '+L('Share panel','共有パネル','Teilen','Поделиться','Compartir')):warn('⚠')); }
        case 'search': { const q=a.query||a.place||''; const inp=document.getElementById('ms-input')||document.getElementById('search-input'); if(inp&&q){ inp.focus(); inp.value=q; inp.dispatchEvent(new Event('input',{bubbles:true})); const btn=document.getElementById('ms-btn'); if(btn) btn.click(); else inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true})); return R(true, note('🔍 '+esc(q))); } if(WORLD_RE.test(String(q).trim())){ try{ GE().camera.flyTo({center:[GE().camera.getCenter().lng,20],zoom:1.4,duration:1000}); }catch(_){} return R(true, note('🌍 '+L('Whole world','全世界','Ganze Welt','Весь мир','El mundo entero'))); } const ext=await placeExtent(q); if(ext){ try{ _setLast(ext); }catch(_){} if(!(ext.box&&flyToBox(ext.box))) GE().camera.flyTo({center:[ext.lng,ext.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); return R(true, note('🔍 '+esc(ext.name||q))+_ambigNote(q,ext.lng,ext.lat)); } const ll=await geocode(q); if(ll){ try{ if(ll.bbox&&_bboxOK(ll.bbox)) flyToBox(ll.bbox); else GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),10),duration:1000}); }catch(_){} return R(true, note('🔍 '+esc(ll.name||q))+_ambigNote(q,ll.lng,ll.lat)); } return R(false, warn('⚠ '+esc(q))); }
        case 'tempUnit': { const u=({c:'c',celsius:'c',f:'f',fahrenheit:'f',both:'both'})[String(a.unit||'').toLowerCase()]; if(u){ const ok=setSel('setting-temp-unit',u); try{ window.imUnitTemp=u; localStorage.setItem('intmap_temp_unit',u); }catch(_){} return R(ok, note('✓ °'+String(u).toUpperCase())); } return R(false, warn('⚠ '+esc(a.unit||''))); }
        case 'units': { const m=({metric:'metric',imperial:'imperial',both:'both'})[String(a.mode||'').toLowerCase()]; if(m){ const ok=setSel('setting-units',m); try{ if(typeof HOST.unitMode!=='undefined') HOST.unitMode=m; }catch(_){} return R(ok, note('✓ '+esc(m))); } return R(false, warn('⚠ '+esc(a.mode||''))); }
        /* (#R94) time-travel now drives the WHOLE spacetime OS (IntMapTime): news, the Countries statistics,
           borders, the climate era, NATO/EU accession & the day/night terminator all move together. Accepts a
           year (deep time back to 1900), an exact date, or daysAgo; "now/reset" returns everything to live. */
        case 'timeTravel': case 'setTime': case 'timeSet': { try{ const T=window.IntMapTime;
          const synced=L('the whole map (news, countries, borders, climate era) moves with it','地図全体（ニュース・国データ・国境・気候区分）が同期します','die ganze Karte bewegt sich mit','вся карта движется вместе','todo el mapa se mueve con él');
          const nowMsg=()=>R(true, note('✓ '+L('Back to now','現在に戻しました','Zurück zu jetzt','Вернулись в настоящее','Volvimos al presente')));
          if(!T){ const sl=document.getElementById('ntl-slider'); if(sl){ let v=3650,da=(a.daysAgo!=null)?Math.round(+a.daysAgo):null; if(da==null&&a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)) da=Math.round((Date.now()-t0)/86400000); } if(da!=null) v=Math.max(0,Math.min(3650,3650-da)); else if(a.value!=null) v=+a.value; sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); } return R(true, note(L('Time set','時刻を設定しました','Zeit gesetzt','Время задано','Hora establecida'))); }   /* (#R108) explained, not a bare ✓ */
          if(a.reset||a.now||a.live){ T.setNow({source:'atlas'}); return nowMsg(); }
          const curY=new Date().getFullYear();
          let y=(a.year!=null)?Math.round(+a.year):null;
          if(y==null&&typeof a.date==='string'){ const m=a.date.match(/^\s*(\d{3,4})\s*$/); if(m) y=+m[1]; }
          if(y!=null){ if(y>=curY){ T.setNow({source:'atlas'}); return nowMsg(); } if(y<T.min) return R(false, warn('⚠ '+L('Chronos reaches back to 1900','Chronosは1900年まで遡れます','Bis 1900 zurück','До 1900 года','Hasta 1900'))); T.setYear(y,{source:'atlas'}); return R(true, note(y+' — '+synced)); }
          if(a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)){ if(t0>Date.now()){ T.setNow({source:'atlas'}); return nowMsg(); } T.set(new Date(t0),{source:'atlas'}); return R(true, note(ymdISO(new Date(t0))+' — '+synced)); } }
          if(a.daysAgo!=null){ const da=Math.round(+a.daysAgo); if(da<=0){ T.setNow({source:'atlas'}); return nowMsg(); } T.setDaysAgo(da,{source:'atlas'}); return R(true, note(ymdISO(T.when())+' — '+synced)); }
          if(a.value!=null){ T.setDaysAgo(3650-(+a.value),{source:'atlas'}); return R(true, note(ymdISO(T.when()))); }
          return R(false, warn('⚠ '+L('Give a year or date','年か日付を指定してください','Jahr/Datum angeben','Укажите год/дату','Indica un año o fecha')));
        }catch(_){ return R(false, warn('⚠ '+L('Time machine unavailable','タイムマシンが使えません','Zeitmaschine nicht verfügbar','Машина времени недоступна','Máquina del tiempo no disponible'))); } }
        case 'pin': { const ll=await geocode(a.place); if(ll){ try{ addPin(ll.lng,ll.lat); }catch(_){} try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),5)}); }catch(_){}
          let _oid=null; try{ _oid=(HOST.userPins&&HOST.userPins.length)?String(HOST.userPins[HOST.userPins.length-1].id):null; }catch(_){}   /* (#R119) creating actions return the created object's id */
          return R(true, note(esc(ll.name||a.place||'')), _oid?{objectIds:[_oid]}:null); } return R(false, warn('⚠ '+esc(a.place||''))); }
        /* (#R172) …and "volume". The catalogue has advertised {"type":"tool","name":"volume"} since #R170, but
           there was no branch for it, so it fell through to doControl() and quietly did nothing. */
        /* (#R176) The drone planner lost its toolbar button (「どこにも置くな」), so it can no longer be
           reached by clicking an id — it is called directly. Everything else still routes through the
           button it owns, because that button is where the tool's own state lives. */
        case 'tool': { const n=String(a.name||'').toLowerCase();
          if(/drone|ドローン|无人机|무인기/.test(n)){ let ok=false; try{ ok=!!(window.IntMapDrone&&window.IntMapDrone.toggle()); }catch(_){} return R(ok, ok?note('✓ '+esc(a.name||'')):warn('⚠')); }
          const id=/radius/.test(n)?'btn-tool-radius':/draw/.test(n)?'btn-tool-draw':/volume|立体|体積/.test(n)?'btn-tool-volume':/measur|dist|area/.test(n)?'btn-tool-measure':/grid/.test(n)?'btn-tool-grid':null; if(id){ const ok=clickId(id); return R(ok, ok?note('✓ '+esc(a.name||'')):warn('⚠')); } return doControl({target:a.name}); }
        case 'radius': { const ll=await geocode(a.place); if(ll){ try{ if(a.km!=null&&typeof HOST.radiusKm!=='undefined') HOST.radiusKm=Math.max(1,+a.km); }catch(_){} let cw=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc){ try{ HOST.radiusColor=pc; }catch(_){} } else cw=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); } try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),4)}); }catch(_){} let ok=false; try{ if(window._radiusFromPoint){ window._radiusFromPoint(ll.lng,ll.lat); ok=true; } }catch(_){} let _oid=null; try{ _oid=(HOST.radiusItems&&HOST.radiusItems.length)?String(HOST.radiusItems[HOST.radiusItems.length-1].id):null; }catch(_){} return R(ok, (ok?note('⭕ '+esc(ll.name||a.place||'')+(a.km?(' · '+a.km+' km'):'')):warn('⚠'))+cw, (ok&&_oid)?{objectIds:[_oid]}:null); } return R(false, warn('⚠ '+esc(a.place||''))); }
        /* (#R170) 3-D VOLUME — the Atlas face of Measure ▸ 3-D volume (js/volume3d.js). base/top are ALTITUDES
           ABOVE SEA LEVEL in metres; the module compensates for 3-D terrain so the band lands where it was asked for. */
        case 'volume3d': case 'volume': { const ll=await geocode(a.place); if(!ll) return R(false, warn('⚠ '+esc(a.place||''))); await window.IntMapLazy.need('volume3d');   /* (#R311) on-demand: fetch before reading the global */
          const V=window.IntMapVolume3D; if(!V) return R(false, warn('⚠ '+L('3-D volume tool unavailable','3D立体ツールを使えません','3-D-Volumen nicht verfügbar','Инструмент 3-D недоступен','Herramienta 3-D no disponible')));
          const km=Math.max(0.2,Math.min(500,+a.km||5));
          /* (#R172) base/top may now be given in any of the tool's units, and there is no ceiling — a
             geostationary shell at 35,786 km is a legitimate thing to ask for. */
          const UF={m:1,km:1000,ft:0.3048,mi:1609.344};
          const un=UF[String(a.unit||'m').toLowerCase()]?String(a.unit||'m').toLowerCase():'m';
          const base=(+a.base)*UF[un], top=(+a.top)*UF[un];
          if(!isFinite(base)||!isFinite(top)) return R(false, warn('⚠ '+L('Need a base and a top altitude','下端と上端の高度が必要です','Basis- und Obergrenze nötig','Нужны нижняя и верхняя высота','Se necesitan altitud inferior y superior')));
          /* (#R171) the footprint can be a CIRCLE now, not only the square — the shapes the panel offers are
             reachable from Atlas too, along with the colour and opacity. */
          const round=/^(circle|round|circular|円|丸)$/i.test(String(a.shape||''));
          let ring;
          if(round){ ring=V.circleRing([ll.lng,ll.lat], km*500, 96); }   /* km is the DIAMETER, as for the square */
          else { /* square footprint `km` on a side, centred on the place (longitude scaled by latitude) */
            const dLat=km/2/110.574, dLng=km/2/(111.320*Math.max(0.02,Math.cos(ll.lat*Math.PI/180)));
            ring=[[ll.lng-dLng,ll.lat-dLat],[ll.lng+dLng,ll.lat-dLat],[ll.lng+dLng,ll.lat+dLat],[ll.lng-dLng,ll.lat+dLat]]; }
          try{ if(typeof setTool==='function') setTool('volume'); if(typeof HOST.measurePoints!=='undefined') HOST.measurePoints=[];
            if(V.setUnit) V.setUnit(un);
            /* (#R174) the "solid" parameter is gone with the checkbox — a volume is a closed body, and an
               option nobody can act on is worse than no option at all. */
            V.setAltitudes(base,top);
            if(a.color||a.opacity!=null) V.setStyle(a.color||null, a.opacity!=null?+a.opacity:null);
            V.setRing(ring);
            if(typeof refreshTool==='function') refreshTool(); if(typeof updateToolPanel==='function') updateToolPanel();
            /* (#R172) no re-set needed any more: syncClicks() refuses to replace a ring it did not create,
               so the panel rebuild above can no longer wipe an Atlas footprint (it used to, for the square). */
          }catch(_){}
          try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),10),pitch:Math.max(GE().camera.getPitch(),55)}); }catch(_){}
          const st=V.state();
          return R(!!st.points, st.points?note('🧊 '+esc(ll.name||a.place||'')+' · '+V.fmtAlt(Math.min(base,top))+'–'+V.fmtAlt(Math.max(base,top))+' · '+V.fmtVolume()):warn('⚠')); }
        /* ══ (#R347) ACTIVE NAVIGATION — §34 ════════════════════════════════════════════
           「Atlasが独自 route state を持つことは禁止。RouteStore / NavigationStore を唯一の正本に。」
           Every number below is READ from window.IntMapNavStore through IntMapNavigation.summary().
           Atlas holds no copy, derives no distance and predicts no arrival — it phrases what the store
           already decided. That is why 「あと何分？」 works while a reroute is in flight: the answer comes
           from the same object the nav UI is rendering. */
        case 'startNavigation': case 'startNav': case 'beginNavigation': case 'guideMe': case 'driveThere': {
          let N=window.IntMapNavigation;
          if(!N){ try{ await window.IntMapLazy.need('navigation'); N=window.IntMapNavigation; }catch(_){} }
          if(!N) return R(false, warn('⚠ '+L('Navigation is unavailable in this session.','このセッションでは案内を使えません。','Navigation ist nicht verfügbar.','Навигация недоступна.','La navegación no está disponible.')));
          /* ⚠ A ROUTE HAS TO EXIST FIRST, AND SAYING SO IS MORE USE THAN FAILING. #R278's lesson: a
             capability that answers 「その機能は実行できません」 without naming what is missing is a dead end. */
          if(!N.canStart()) return R(false, warn('⚠ '+L('Plan a route first — tell me where from and where to.','先に経路を検索してください。出発地と目的地を教えてください。','Erst eine Route planen — nenne Start und Ziel.','Сначала постройте маршрут.','Primero planifica una ruta.')));
          const _sim=!!(a.simulate||a.sim);
          const _started=await (_sim?N.simulate({speedMultiplier:+a.speed||5}):N.start({}));
          if(!_started){ const _s=N.summary()||{}; const _c=(_s.error&&_s.error.code)||'NO_LOCATION';
            return R(false, warn('⚠ '+esc(window.IntMapRouteErrors.message(_c)))); }
          const _s0=N.summary();
          return R(true, note(L('Navigation started','案内を開始しました','Navigation gestartet','Навигация начата','Navegación iniciada')
            +(_s0.destination&&_s0.destination.name?(' · '+esc(_s0.destination.name)):'')
            +(_sim?(' · '+L('simulated','シミュレーション','simuliert','симуляция','simulado')):'')));
        }
        case 'stopNavigation': case 'endNavigation': case 'stopNav': {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(true, note(L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          N.stop();
          return R(true, note(L('Navigation stopped.','案内を停止しました。','Navigation beendet.','Навигация остановлена.','Navegación detenida.')));
        }
        case 'navStatus': case 'howLongLeft': case 'etaNow': case 'remaining': case 'nextTurn': case 'arrivalTime': {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn('⚠ '+L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          const _st=N.summary(), _C=window.IntMapRouteCards, _o={lang:HOST.lang};
          const _dist=_C.distance(_st.remainingDistance,_o), _dur=_C.duration(_st.remainingDuration,_o);
          const _eta=_st.eta?_C.clock(new Date(_st.eta),_o):'';
          let _h=note(esc(_dur)+' · '+esc(_dist)+(_eta?(' · '+L('arrive ','到着 ','Ankunft ','прибытие ','llegada ')+esc(_eta)):''));
          if(_st.nextManeuver) _h+=note(esc(_C.distance(_st.nextManeuver.distance,_o))+' · '+esc(_st.nextManeuver.road||_st.currentRoad||''));
          /* ⚠ THE HONESTY LINE (§6). Without a traffic provider the duration is the router's own
             estimate and the reply says so — 「渋滞考慮」 may never be printed on a number that has none. */
          _h+=note((_st.etaMeta&&_st.etaMeta.traffic)
            ? L('Traffic-aware.','交通状況を反映しています。','Verkehrsabhängig.','С учётом пробок.','Con tráfico.')
            : L('Standard travel time — traffic not included.','標準所要時間です（交通状況未反映）。','Standardfahrzeit — ohne Verkehr.','Обычное время — без пробок.','Tiempo estándar — sin tráfico.'));
          if(_st.offRoute) _h+=warn('⚠ '+L('Off route.','経路を外れています。','Abseits der Route.','Вне маршрута.','Fuera de ruta.'));
          return R(true, _h);
        }
        case 'navCamera': case 'recenter': case 'overview': case 'followMe': case 'northUp': {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn('⚠ '+L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          if(t==='recenter'&&!a.mode){ N.recenter(); return R(true, note(L('Following your position again.','現在地の追従を再開しました。','Folge wieder deiner Position.','Снова слежу за позицией.','Siguiendo tu posición de nuevo.'))); }
          const _w=String(a.mode||a.camera||(t==='overview'?'overview':t==='northUp'?'north':'follow')).toLowerCase();
          const _ok=N.setCamera(_w==='north'?'north':_w==='overview'?'overview':_w==='free'?'free':'follow');
          return R(!!_ok, _ok?note(esc(_w)):warn('⚠'));
        }
        case 'navVoice': case 'mute': case 'unmute': case 'voiceGuidance': {
          const N=window.IntMapNavigation;
          if(!N||N.state()==='idle') return R(false, warn('⚠ '+L('Navigation is not running.','案内は実行されていません。','Navigation läuft nicht.','Навигация не запущена.','La navegación no está activa.')));
          const _w=t==='mute'?'off':t==='unmute'?'guidance':String(a.mode||a.voice||'guidance').toLowerCase();
          const _ok=N.setVoice(_w==='off'?'off':_w==='alerts'?'alerts':'guidance');
          return R(!!_ok, _ok?note(esc(_w)):warn('⚠'));
        }
        /* (#R174) DRONE NAVIGATION — the Atlas face of js/drone-nav.js. Every number in the reply comes
           from the same compute() the panel shows; Atlas never re-derives one, and it never claims a
           route is flyable when the planner said otherwise. */
        case 'drone': { const D=window.IntMapDrone;
          if(!D) return R(false, warn('⚠ '+L('Drone planner unavailable','ドローン航法を使えません','Drohnenplaner nicht verfügbar','Планировщик дрона недоступен','Planificador de dron no disponible')));
          const act=String(a.action||(a.from||a.to?'plan':'open')).toLowerCase();
          if(act==='close'){ D.close(); return R(true, note('🛸 '+L('Closed','閉じました','Geschlossen','Закрыто','Cerrado'))); }
          if(act==='clear'){ D.clearRoute(); D.open(); return R(true, note('🛸 '+L('Route cleared','経路を消去しました','Route gelöscht','Маршрут очищен','Ruta borrada'))); }
          if(act==='plan'){
            const names=[a.from].concat(Array.isArray(a.via)?a.via:(a.via?[a.via]:[])).concat([a.to]).filter(x=>x!=null&&String(x).trim()!=='');
            if(names.length<2) return R(false, warn('⚠ '+L('Need a start and a destination','出発地と目的地が必要です','Start und Ziel nötig','Нужны старт и цель','Se necesitan origen y destino')));
            const pts=[]; for(const n of names){ const ll=await geocode(n); if(!ll) return R(false, warn('⚠ '+esc(String(n)))); pts.push(ll); }
            D.newRoute();
            if(a.aircraft) D.usePreset(String(a.aircraft).toLowerCase());
            const ref=(String(a.ref||'agl').toLowerCase()==='amsl')?'amsl':'agl';
            D.setTypedRef(ref);
            const alt=isFinite(+a.alt)?+a.alt:80;
            pts.forEach(p=>D.addWaypoint(p.lng,p.lat,alt,ref));
            if(a.name) D.setRoute(Object.assign(D.route(),{name:String(a.name).slice(0,60)}));
            D.open();
            const res=await D.compute();
            try{ const lats=pts.map(p=>p.lat), lngs=pts.map(p=>p.lng);
              GE().camera.fitBounds([[Math.min.apply(null,lngs),Math.min.apply(null,lats)],[Math.max.apply(null,lngs),Math.max.apply(null,lats)]],
                {padding:90,pitch:Math.max(GE().camera.getPitch(),55),duration:900}); }catch(_){}
            if(!res) return R(false, warn('⚠'));
            const bad=res.violations.filter(v=>v.severity==='critical'||v.severity==='error');
            const head='🛸 '+esc(D.route().name)+' · '+(res.dist3DM/1000).toFixed(2)+' km · '+Math.round(res.timeS/60)+' min · '+Math.round(res.batteryPct)+'% '+L('battery','バッテリー','Akku','батарея','batería');
            return R(true, (bad.length?warn('⚠ '+head+'\n'+bad.map(v=>'· '+esc(v.text)).join('\n')):note(head+' · ✓ '+L('all conditions met','全条件を満たします','alle Bedingungen erfüllt','все условия выполнены','todas las condiciones cumplidas')))); }
          if(act==='followterrain'||act==='follow'){ D.open(); const res=await D.followTerrain();
            if(!res) return R(false, warn('⚠ '+L('No route to adjust','調整する経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            return R(true, note('⛰ '+L('Adjusted to the terrain','地形に沿わせました','An das Gelände angepasst','Подогнано под рельеф','Ajustado al terreno')+' · '+D.route().wp.length+' '+L('waypoints','ウェイポイント','Wegpunkte','точек','puntos'))); }
          if(act==='compute'||act==='recompute'){ D.open(); const res=await D.compute();
            if(!res) return R(false, warn('⚠ '+L('No route yet','経路がまだありません','Noch keine Route','Маршрута ещё нет','Aún no hay ruta')));
            return R(true, note('🛸 '+(res.dist3DM/1000).toFixed(2)+' km · '+Math.round(res.timeS/60)+' min · '+res.violations.length+' '+L('findings','指摘','Hinweise','замечаний','hallazgos'))); }
          /* (#R184) the operational checks and the three route actions. Everything below reads its
             answer back out of IntMapDroneOps rather than restating the request, so a reply cannot
             claim a check that did not run. */
          const O=window.IntMapDroneOps;
          const needOps=/^(wind|link|radio|nofly|restricted|reserve|return|sites|landing|prepare|check|compare|variants|rth|returnhome|returntohome|conflicts|conflict|traffic)$/.test(act);
          if(needOps&&!O) return R(false, warn('⚠ '+L('The drone operations module is unavailable','ドローンの運航条件モジュールを利用できません','Das Betriebsmodul ist nicht verfügbar','Модуль эксплуатации недоступен','El módulo de operaciones no está disponible')));
          if(needOps) D.open();
          if(act==='prepare'||act==='check'||act==='wind'||act==='link'||act==='radio'||act==='nofly'||act==='restricted'||act==='reserve'||act==='return'||act==='sites'||act==='landing'){
            /* naming ONE check turns that check on; "prepare"/"check" runs whatever is already on */
            const only={ wind:'wind', link:'link', radio:'link', nofly:'nofly', restricted:'nofly',
                         reserve:'reserve', return:'reserve', sites:'sites', landing:'sites' }[act];
            if(only){ const patch={}; patch[only]=true; O.setEnabled(patch); }
            await O.prepare();
            const s=O.state();
            const bits=[];
            if(s.enabled.wind&&s.wind.report) bits.push(L('wind','風','Wind','ветер','viento')+' '+(Math.round(s.wind.report.maxSpeed*10)/10)+' m/s ('+(s.wind.src||'—')+')');
            if(s.enabled.link&&s.link.report&&s.link.report.worstMarginDb!=null) bits.push(L('link margin','リンク余裕','Funkreserve','запас связи','margen del enlace')+' '+Math.round(s.link.report.worstMarginDb)+' dB, '+s.link.report.losBreaks+' '+L('line-of-sight breaks','箇所で視通が途切れ','Sichtabbrüche','разрывов видимости','cortes de visión'));
            if(s.enabled.nofly&&s.nofly.report) bits.push(s.nofly.report.hits+' '+L('restricted areas within their buffers','件の制限区域が離隔内','Sperrgebiete im Richtabstand','запретных зон в пределах буфера','zonas restringidas dentro del margen'));
            if(s.enabled.sites) bits.push(s.sites.reachable+'/'+s.sites.n+' '+L('landing sites reachable','件の着陸地点に到達可能','erreichbare Landeplätze','достижимых площадок','lugares de aterrizaje alcanzables'));
            if(s.enabled.reserve&&s.reserve&&s.reserve.roundTripWh!=null) bits.push(L('round trip','往復','Umlauf','круг','ida y vuelta')+' '+s.reserve.roundTripWh.toFixed(1)+' Wh');
            const res2=D.result();
            const bad2=res2?res2.violations.filter(v=>v.severity==='critical'||v.severity==='error'):[];
            return R(true, (bad2.length?warn('⚠ '):note('✓ '))+esc(bits.join(' · ')||L('checks run','点検しました','geprüft','проверено','comprobado'))
              +(bad2.length?('\n'+bad2.map(v=>'· '+esc(v.text)).join('\n')):'')); }
          if(act==='compare'||act==='variants'){
            const c=await O.compareVariants();
            if(!c) return R(false, warn('⚠ '+L('Need a route with at least two waypoints','ウェイポイントが2点以上の経路が必要です','Route mit mindestens zwei Wegpunkten nötig','Нужен маршрут минимум с двумя точками','Se necesita una ruta con dos puntos')));
            const line=c.variants.map(v=>v.name+': '+(v.dist3DM/1000).toFixed(2)+' km · '+Math.round(v.timeS/60)+' min · '+v.energyWh.toFixed(1)+' Wh · '+v.violations+' ⚠').join('\n· ');
            return R(true, note('⇄ '+L('Route comparison','経路の比較','Routenvergleich','Сравнение маршрутов','Comparación de rutas')+'\n· '+esc(line))); }
          if(act==='rth'||act==='returnhome'||act==='returntohome'){
            const rr=await O.returnToHome();
            if(!rr) return R(false, warn('⚠ '+L('No route to return from','帰投元の経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            if(rr.alreadyHome) return R(true, note('✓ '+L('The route already ends at the launch point','経路はすでに離陸地点で終わっています','Die Route endet bereits am Startpunkt','Маршрут уже заканчивается в точке взлёта','La ruta ya termina en el punto de despegue')));
            return R(true, note('⤺ '+L('Return leg added','帰投区間を追加しました','Rückflug ergänzt','Возврат добавлен','Tramo de regreso añadido')+' — '+Math.round(rr.safeAmsl)+' m AMSL · '+(rr.result?((rr.result.dist3DM/1000).toFixed(2)+' km · '+Math.round(rr.result.batteryPct)+'%'):''))); }
          if(act==='conflicts'||act==='conflict'||act==='traffic'){
            const cf=await O.checkConflicts();
            if(!cf) return R(false, warn('⚠ '+L('No route to check','点検する経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            if(!cf.checked) return R(true, note('✓ '+L('There is no other saved route to check against','照合できる保存済みの経路がありません','Keine zweite gespeicherte Route','Нет второго сохранённого маршрута','No hay otra ruta guardada')));
            if(!cf.conflicts) return R(true, note('✓ '+L('No conflict with the '+cf.checked+' other saved route(s)','ほかの保存済み経路 '+cf.checked+' 本との干渉はありません','Kein Konflikt mit '+cf.checked+' anderen Routen','Конфликтов с '+cf.checked+' маршрутами нет','Sin conflicto con las otras '+cf.checked+' rutas')));
            return R(true, warn('⚠ '+cf.conflicts+' '+L('conflict(s)','件の干渉','Konflikte','конфликтов','conflictos')+'\n'
              +cf.minima.filter(m=>m.conflict).map(m=>'· '+esc(m.name||m.route)+': '+Math.round(m.horizM)+' m / '+Math.round(m.vertM)+' m / '+Math.round(m.timeS)+' s').join('\n'))); }
          D.open(); return R(true, note('🛸 '+L('Drone planner open','ドローン航法を開きました','Drohnenplaner geöffnet','Планировщик открыт','Planificador abierto'))); }
        case 'measure': { const A=await geocode(a.from); const B=await geocode(a.to); if(A&&B){ try{ if(typeof setTool==='function') setTool('measure'); if(typeof HOST.measurePoints!=='undefined') HOST.measurePoints=[[A.lng,A.lat],[B.lng,B.lat]]; if(typeof refreshTool==='function') refreshTool(); if(typeof updateToolPanel==='function') updateToolPanel(); }catch(_){} try{ GE().camera.flyTo({center:[(A.lng+B.lng)/2,(A.lat+B.lat)/2],zoom:Math.max(GE().camera.getZoom()-1,2)}); }catch(_){} return R(true, note('📏 '+esc(A.name||a.from||'')+' → '+esc(B.name||a.to||''))); } return R(false, warn('⚠ '+L('Need two places','2地点が必要','Zwei Orte nötig','Нужны два места','Se necesitan dos lugares'))); }
        case 'correlate': { let ok=false; try{ if(window.IntMapCorrelate&&window.IntMapCorrelate.open){ window.IntMapCorrelate.open(); ok=true; } else ok=clickId('btn-correlate'); }catch(_){} return R(ok, ok?note(L('Correlation tool','相関ツール','Korrelationswerkzeug','Корреляция','Correlación')):warn('⚠')); }
        case 'settings': { const ok=clickId('btn-open-settings'); return R(ok, ok?note('✓ '+L('Settings','設定','Einstellungen','Настройки','Ajustes')):warn('⚠')); }
        /* (#R85) workspace (floating-window) mode via Atlas ("ワークスペースモードの切り替えがAtlasでできない") */
        case 'workspace': case 'windows': case 'windowMode': case 'windowWorkspace': {
          if(!window.IntMapWorkspace) return R(false, warn('⚠'));
          const active=!!(window.IntMapWorkspace.active&&window.IntMapWorkspace.active());
          const m=String(a.mode||a.action||a.state||'').toLowerCase();
          const want = (a.on===false||/^(off|exit|close|normal|stop|disable|leave)$/.test(m)) ? false
                     : (a.on===true ||/^(on|enter|open|start|enable|switch)$/.test(m)) ? true
                     : !active;   /* unspecified → toggle */
          if(want===active) return R(true, note('✓ '+(active?L('Already in workspace mode','すでにワークスペースモードです','Bereits im Workspace-Modus','Уже в оконном режиме','Ya en modo espacio'):L('Already in normal mode','すでに通常モードです','Bereits im Normalmodus','Уже в обычном режиме','Ya en modo normal'))));
          let ok=false; try{ if(want){ ok=(window.IntMapWorkspace.open()!==false); } else { window.IntMapWorkspace.close(); ok=true; } }catch(_){}
          return R(ok, ok? note(want?'🗔 '+L('Workspace mode on — News, Countries, the map, layers and Atlas are now free-floating windows','ワークスペースモードをオン — ニュース・国・地図・レイヤー・Atlasが自由なウィンドウになりました','Workspace-Modus an','Оконный режим включён','Modo espacio activado')
                                   :'✓ '+L('Back to the normal layout','通常レイアウトに戻しました','Zurück zum Normal-Layout','Обычный вид','De vuelta al diseño normal'))
                       : warn('⚠ '+L('Workspace mode is desktop-only','ワークスペースモードはデスクトップ専用です','Workspace nur am Desktop','Оконный режим — только для десктопа','Solo escritorio'))); }
        case 'shortcuts': case 'keyboard': case 'hotkeys': { let ok=false; try{ if(window.IntMapKbdHelp){ window.IntMapKbdHelp(); ok=true; } }catch(_){} return R(ok, ok?note(L('Keyboard shortcuts','キーボードショートカット','Tastaturkürzel','Горячие клавиши','Atajos de teclado')):warn('⚠')); }
        /* (#R88) universal object list — see & manage every pin/drawing/radius/route/upload/isochrone in one panel */
        case 'objects': case 'objectList': case 'manageObjects': case 'listObjects': case 'myObjects': { let n=0; try{ if(window.IntMapObjects){ n=window.IntMapObjects.count(); window.IntMapObjects.open(); } }catch(_){}
          return R(true, note('🗂 '+L('Objects','オブジェクト一覧','Objekte','Объекты','Objetos')+' · '+n+' '+L('on the map','件','Objekte','объектов','objetos'))+note(L('Manage every pin, drawing, radius, route, uploaded layer and reachable-area here — rename, recolor, hide or delete.','ピン・図形・半径・経路・アップロード・到達圏をここで一括管理（名称変更・色変更・非表示・削除）。','Alle Objekte hier verwalten.','Управляйте всеми объектами здесь.','Gestiona todos los objetos aquí.'))); }
        /* (#R89) slope / aspect terrain analysis */
        case 'slope': case 'aspect': case 'terrainAnalysis': case 'steepness': case 'gradient': { const m=(a.type==='aspect'||/aspect|direction|方向|向き/i.test(String(a.mode||a.what||'')))?'aspect':'slope';
          try{ const cb=document.getElementById('dl-slope'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } if(window.IntMapSlope){ window.IntMapSlope.setMode(m); } }catch(_){}
          return R(true, note('⛰ '+(m==='aspect'?L('Slope aspect (direction each slope faces)','斜面の向き（方位）','Hangexposition','Экспозиция склона','Orientación'):L('Slope steepness (angle)','傾斜の急さ（角度）','Hangneigung','Крутизна склона','Pendiente'))+' — '+L('computed from the real elevation model for the current view; pan/zoom to update.','現在の表示範囲の標高データから算出。移動・拡大で更新。','aus dem echten Höhenmodell.','по реальной модели высот.','del modelo de elevación real.'))); }
        /* (#R89) RF / radio coverage from an antenna */
        /* (#R318) `lineOfSight` WAS ALSO LISTED HERE, AND WAS UNREACHABLE. A switch enters the FIRST
           matching case and `case 'los': case 'lineOfSight':` above already claims that spelling, so
           this label had never once been entered. Removing a label the language cannot reach cannot
           change behaviour; leaving it said IntMap had a route to the viewshed by that name when
           every such request had always gone to the line-of-sight tool instead. */
        case 'rfCoverage': case 'coverage': case 'radioCoverage': case 'signalCoverage': case 'reception': case 'viewshed': {
          /* ⚠ (#R299) NO MAST IS PLANTED AT THE CAMERA'S CENTRE — 「勝手に地図中心を選択している…のを辞めろ」. The service area, the farthest
             sight line and the terrain shadow are all functions of ONE coordinate, and the fallback here was wherever the reader happened to be looking. It asks now, the way `tsunami` below does. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+L('Where? Give the transmitter site (place, or lng/lat).','送信点はどこですか（地名または経緯度）。','Wo? Senderstandort angeben.','Где передатчик?','¿Dónde? Indica el emplazamiento del emisor.')));
          /* ⚠ (#R296) ONE PANEL — 「電波・通信圏と見通し線解析を統合して」. `IntMapRF` is gone; this is `IntMapLOS` with a frequency. */
          try{ if(window.IntMapLOS){ const L2=window.IntMapLOS;
            if(L2.setMode) L2.setMode(/^(los|lineOfSight|viewshed)$/.test(String(a.type||''))?'los':'radio');
            if(L2.setParams) L2.setParams((+a.height||+a.antennaHeight||null), null, null, 1.3333, (+a.frequency||+a.freq||null));
            L2.open(ll); } }catch(_){}
          return R(true, note('📡 '+L('Radio coverage','電波・通信圏','Funkabdeckung','Радиопокрытие','Cobertura de radio')+' — '+L('line-of-sight service area over real terrain. Set antenna height / power / frequency in the panel; click to move the mast.','実地形上の見通し到達域。パネルでアンテナ高・出力・周波数を設定、クリックで基地局を移動。','Sichtlinie über echtem Gelände.','зона прямой видимости.','área de línea de vista.'))); }
        /* (#R90) sun & shadow */
        case 'sun': case 'shadow': case 'shadows': case 'sunlight': case 'sunPosition': case 'daylight': case 'insolation': {
          /* ⚠ (#R302) THE RESOLVED PLACE WAS THROWN AWAY — geocoded, flown to, then `open()` WITH NO ARGUMENT, so the panel answered for the camera's centre, which `flyTo` had not even reached yet. It is handed over now, and with none the reply asks. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),15)}); }catch(_){} } } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){} if(!ll) return R(false, warn('⚠ '+L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).')));
          try{ if(window.IntMapSun){ window.IntMapSun.open({lng:ll.lng,lat:ll.lat}); if(a.date||a.time||a.datetime){ const d=new Date(a.datetime||((a.date||'')+(a.time?('T'+a.time):''))); if(!isNaN(d)) window.IntMapSun.setTime(d); } } }catch(_){}
          return R(true, note('🌇 '+L('Sun & shadow','日照・影','Sonne & Schatten','Солнце и тень','Sol y sombra')+' — '+L('pick a date & time; buildings in view (zoom in) cast real shadows and the 3D scene is lit from the sun. Press ▶ to sweep the day.','日時を選択。表示中の建物（拡大時）が実際の影を落とし、3Dは太陽方向から照らされます。▶で一日を再生。','Datum/Zeit wählen — echte Gebäudeschatten.','выберите дату/время — реальные тени зданий.','elige fecha/hora — sombras reales.'))); }
        /* (#R176) terrain sculpting + water routing */
        case 'terrainWater': case 'waterFlow': case 'terrainEdit': case 'watershedSim': case 'sculpt': {
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){}
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
        /* (#R176) seismic wave propagation */
        case 'earthquake': case 'seismic': case 'quakeSim': case 'seismicWaves': case 'earthquakeSim': {
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location||a.epicentre||a.epicenter){ const g=await geocode(a.place||a.at||a.location||a.epicentre||a.epicenter); if(g) ll={lng:g.lng,lat:g.lat,name:g.name}; } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){}
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
          let extra='', ask='', h=null; try{ h=(typeof _herePoint!=='undefined'&&_herePoint&&isFinite(_herePoint.lng))?_herePoint:null; const at=h?window.IntMapSeismic.at(h.lng,h.lat):null;
            if(at&&at.tP!=null) extra=' · '+L('P here in','ここへP波','P hier in','P здесь через','P aquí en')+' '+Math.round(at.tP)+' s, S '+Math.round(at.tS)+' s ('+esc(h.name||((+h.lat).toFixed(3)+', '+(+h.lng).toFixed(3)))+')'; else if(!h) ask=warn('⚠ '+L('Arrival times need a point — name a place, or tap the map first.','到達時刻には地点が必要です。地名を指定するか、先に地図をタップしてください。','Ankunftszeiten brauchen einen Punkt — Ort nennen oder zuerst auf die Karte tippen.','Для времени прихода нужна точка — укажите место или сначала коснитесь карты.','Los tiempos de llegada necesitan un punto — indica un lugar o toca antes el mapa.')); }catch(_){}
          /* (#R232) 🌐 removed with the panel header's — same feature, same instruction. */
          return R(ok, ok?(note(L('Seismic waves','地震波','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+' — '
            +L('P, S and surface wavefronts ray-traced through the IASP91 Earth model, with arrival time, shaking duration and Modified-Mercalli intensity for the places around it.','P波・S波・表面波の波面をIASP91地球モデルでレイトレーシングし、周辺地点への到達時刻・揺れの継続時間・改正メルカリ震度を表示します。','P-, S- und Oberflächenwellen durch IASP91.','волны P, S и поверхностные по модели IASP91.','frentes P, S y superficiales por IASP91.')+extra)+ask):warn('⚠')); }
        /* (#R176) terrain shade + the annual sunlight budget (the Sun panel owns the controls) */
        case 'sunHours': case 'shadeHours': case 'terrainShadow': case 'solarHours': case 'insolationYear': {
          /* ⚠ (#R302) AND THE `else` THAT ENDED THIS LINE TOOK THE CAMERA'S CENTRE — after which the block below ran the WHOLE-YEAR horizon analysis on it and printed the hours: 「勝手に地図中心を選択しているものとして結果を出す」 at its most expensive. It asks now. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g){ ll={lng:g.lng,lat:g.lat}; try{ GE().camera.flyTo({center:[g.lng,g.lat],zoom:Math.max(GE().camera.getZoom(),12)}); }catch(_){} } } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){} if(!ll) return R(false, warn('⚠ '+L('Where? Give the point (place, or lng/lat).','どの地点ですか（地名または経緯度）。','Wo? Punkt angeben (Ort oder Länge/Breite).','Где? Укажите точку (место или координаты).','¿Dónde? Indica el punto (lugar o lng/lat).')));
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
        /* (#R208) 「ある地点からの星空」— reachable from Atlas as well as the right-click item (#R112) */
        case 'nightSky': case 'starsFromHere': case 'skyFromHere': case 'stargazing': case 'standHere': case 'skyStanding': {   /* (#R214) +「立った」モード */
          await window.IntMapLazy.need('nightSky'); const NS=window.IntMapNightSky; if(!NS||!NS.open) return R(false, warn('⚠'));
          /* ⚠ (#R299) 「ここからの星空」 IS NOT 「ここを見ている星空」 — the sky, the measured skyline and the rise
             times belong to ONE standing point, and the reply quoted the centre back as though it were chosen. */
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat}; } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+L('Where from? Give a place (or lng/lat).','どこからの空ですか（地名または経緯度）。','Von wo aus? Ort angeben.','Откуда? Укажите место.','¿Desde dónde? Indica un lugar.')));
          await NS.open({lng:ll.lng, lat:ll.lat, when:(a.when||a.time||a.date||null), az:a.az, alt:a.alt, fov:a.fov, bearing:a.bearing, mode:(a.type==='standHere'||a.type==='skyStanding')?'stand':a.mode, view:a.view, stand:a.stand});   /* (#R214) the view is a parameter — js/night-sky.js resolves the spellings */
          if(a.rate!=null&&NS.setRate) NS.setRate(+a.rate); if(a.play&&NS.play) NS.play(true);   /* (#R208) */
          const st=NS.state(), facing=(st.mode==='stand'&&st.look)?(' · '+L('facing','向き','Blick','взгляд','mirando')+' '+Math.round(st.look.az)+'°'):''; return R(true, note((st.mode==='stand'?'🧍 ':'✨ ')+L('Sky from','星空：','Himmel von','Небо от','Cielo desde')+' '+ll.lat.toFixed(3)+'°, '+ll.lng.toFixed(3)+facing+(st.last?' — '+st.last.starsDrawn.toLocaleString()+' '+L('stars above the measured skyline','個が実測した稜線の上に','Sterne über der Skyline','звёзд над горизонтом','estrellas sobre el horizonte'):''))); }
        /* (#R197) the space explorer — the same surface the button at the zoom floor opens */
        case 'space': case 'solarSystem': case 'planet': case 'planets': case 'explore Space': {
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
        /* ⚠ (#R197) `tsunami` IS NOT A HAZARD OF THE DISASTER SIMULATOR ANY MORE — it is its own model.
           「勝手に災害シミュレータ内の津波シミュレータを起動するな」. Both the type and the free-text
           `hazard` field used to land on js/sims.js's bathtub; they now open the propagation simulator
           (js/tsunami.js), which is the only tsunami this app has. It needs an epicentre, a magnitude and
           a focal depth rather than a coastal wave height, so the defaults are the ones the panel itself
           uses and every one of them is overridable in the same call. */
        case 'tsunami': case 'tsunamiSim': case 'tsunamiPropagation': {
          await window.IntMapLazy.need('tsunami'); const T=window.IntMapTsunami;
          if(!T||!T.open) return R(false, warn('⚠ '+L('The tsunami propagation simulator is not available in this build.','津波伝播シミュレーターはこのビルドで利用できません。','Tsunami-Simulator nicht verfügbar.','Симулятор цунами недоступен.','El simulador de tsunamis no está disponible.')));
          let ll=null; try{ if(a.lat!=null&&a.lng!=null) ll={lng:+a.lng,lat:+a.lat}; else if(a.place||a.at||a.location){ const g=await geocode(a.place||a.at||a.location); if(g) ll={lng:g.lng,lat:g.lat,name:g.name}; } else if(typeof _herePoint!=='undefined'&&_herePoint) ll=_herePoint; }catch(_){}
          if(!ll) return R(false, warn('⚠ '+L('Where? Give an epicenter (place, or lng/lat).','震源はどこですか（地名または経緯度）。','Wo? Epizentrum angeben.','Где эпицентр?','¿Dónde? Indica el epicentro.')));
          const mag=(a.magnitude!=null?+a.magnitude:(a.mw!=null?+a.mw:8.5));
          /* ⚠ (#R204) THE SCOPE IS SET BEFORE open() RUNS THE SOLVE. `open()` starts the run itself, so
             a setScope() after it would re-render the panel while the WRONG domain was already being
             integrated — the same "the fix has no path to the thing it fixes" shape as #R183. */
          const nearScope=(a.scope!=null)?(/^near/i.test(String(a.scope))) : (a.near===true||/high|近傍|высок|alta|hoch/i.test(String(a.resolution||'')));
          try{ T.open({ lng:ll.lng, lat:ll.lat, mw:mag, depth:(a.depth!=null?+a.depth:20),
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
        /* ⚠⚠ (#R296) TWO CASES STOOD HERE. `disaster`/`flood`/`ashfall` — 「4つのうち、放射性物質拡散シミュ
           レーションを残し全削除」: what survives is `radiation`, its own capability; the tsunami spelling it
           forwarded is `tsunami`. `earthReplay` — 「存在意義が不明だから全削除」: `timeTravel` sets the date. */
        /* (#R80) vision §17 — IntMap self-diagnosis: news freshness + layer paint integrity + live-API reachability. */
        case 'diagnose': case 'health': case 'selfCheck': case 'systemStatus': case 'status': {
          const H=await healthCheck({probe:true}); const dot=b=>b?'🟢':'🔴';
          let h='<div style="font-weight:600;margin:2px 0 6px;">'+L('Data & connection status','データ・接続状態','Daten- & Verbindungsstatus','Данные и соединение','Estado de datos y conexión')+'</div><div style="font-size:12px;line-height:1.75;">';
          h+=dot(!H.news.stale)+' '+L('News feed','ニュース','Nachrichten','Новости','Noticias')+': '+(H.news.count?(H.news.count+' '+L('articles','件','Artikel','статей','artículos')+(H.news.ageH==null?(' — '+L('undated','日付なし','ohne Datum','без дат','sin fecha')):(' — '+L('newest','最新','neuste','свежесть','más reciente')+' '+H.news.ageH+'h'))+(H.news.stale?(' ⚠ '+L('may have stopped updating','更新停止の可能性','evtl. keine Updates','возможно не обновляется','quizá no se actualiza')):'')):L('not loaded yet','未読込','noch nicht geladen','ещё не загружено','no cargado'))+'<br>';
          h+=dot(H.layers.bad===0)+' '+L('Layers','レイヤー','Ebenen','Слои','Capas')+': '+H.layers.on+' '+L('on','オン','an','вкл','activas')+(H.layers.bad?(' ⚠ '+H.layers.bad+' '+L('not painting','未描画','nicht gezeichnet','не отрисованы','sin pintar')+(H.layers.badN.length?(' ('+H.layers.badN.map(esc).join(', ')+')'):'')):(' — '+L('all painting','全て描画','alle ok','все ок','todas ok')))+'<br>';
          if(H.endpoints){ Object.keys(H.endpoints).forEach(k=>{ const e=H.endpoints[k]; h+=dot(e.ok)+' '+esc(k)+': '+(e.ok?(L('reachable','到達可能','erreichbar','доступно','accesible')+' · '+e.ms+'ms'):(e.status===429?(L('rate-limited','レート制限','ratenbegrenzt','лимит запросов','límite de tasa')+' (429)'):e.status?(L('error','エラー','Fehler','ошибка','error')+' '+e.status):(L('unreachable','到達不可','nicht erreichbar','недоступно','inaccesible'))))+'<br>'; }); }
          else h+='⚪ '+L('Live APIs: not probed','ライブAPI: 未確認','Live-APIs: nicht geprüft','Живые API: не проверены','APIs: sin comprobar')+'<br>';
          h+='</div>';
          h+=note(H.ok?('✓ '+L('All systems normal.','すべて正常です。','Alle Systeme normal.','Все системы в норме.','Todo normal.')):('⚠ '+L('Some data sources need attention (red). Atlas uses fallbacks where it can.','一部のデータ源に問題があります（赤）。可能な範囲でAtlasは代替に切り替えます。','Einige Datenquellen brauchen Aufmerksamkeit (rot). Atlas nutzt Ausweichquellen.','Некоторые источники требуют внимания (красное). Atlas использует запасные варианты.','Algunas fuentes requieren atención (rojo). Atlas usa alternativas.')));
          return R(true, h); }
        case 'clearAll': { _herePoint=null; try{ clearHl(); }catch(_){} try{ clearChoro(); }catch(_){} try{ clearPolyHl(); }catch(_){} try{ clearLineHl(); }catch(_){} try{ clearPois(); }catch(_){} try{ clearFly(); }catch(_){} try{ clearBlast(); }catch(_){} try{ clearElev(); }catch(_){} try{ clearFac(); }catch(_){} try{ window.IntMapRouting&&window.IntMapRouting.clear&&window.IntMapRouting.clear(); }catch(_){} try{ window.IntMapRadiation&&window.IntMapRadiation.clear&&window.IntMapRadiation.clear(); }catch(_){} try{ window.IntMapArc3D&&window.IntMapArc3D.hide(); }catch(_){} try{ if(typeof clearAllPins==='function') clearAllPins(); }catch(_){} try{ window.clearAllRadius&&window.clearAllRadius(); }catch(_){} try{ window.IntMapIsolate&&window.IntMapIsolate.exit&&window.IntMapIsolate.exit(); }catch(_){} try{ window.IntMapOutline&&window.IntMapOutline.clear&&window.IntMapOutline.clear(); }catch(_){} return R(true, note('✓ '+L('Cleared the map','地図をクリアしました','Karte geleert','Карта очищена','Mapa despejado'))); }
        case 'outline': case 'extent': case 'showExtent': { if(a.on===false||/^(off|clear|hide|none)$/i.test(String(a.place||a.country||''))){ try{ window.IntMapOutline&&window.IntMapOutline.clear(); }catch(_){} return R(true, note('✓ '+L('Outline cleared','範囲表示を消去','Umriss gelöscht','Контур очищен','Contorno borrado'))); }
          const place=String(a.place||a.country||a.name||'').trim(); if(!place) return R(false, warn('⚠ '+L('Which place to outline?','どの場所の範囲？','Welcher Ort?','Какое место?','¿Qué lugar?')));
          if(!window.IntMapOutline||!window.IntMapOutline.show) return R(false, warn('⚠'));
          let ocw=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc){ try{ window.IntMapOutline.setColor&&window.IntMapOutline.setColor(pc); }catch(_){} } else ocw=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          let ext=null; try{ ext=await placeExtent(place); }catch(_){}
          /* (#R59) outline = the REAL boundary only (point-in-polygon via ext's point; NO rectangle for regions that
             have no polygon — the user: "領域がわからない地名は全部長方形になるとかクソ"). */
          const ctx=ext?{lng:ext.lng,lat:ext.lat,fit:true}:{fit:true};
          let ok=false; try{ ok=await window.IntMapOutline.show((ext&&ext.name)||place, ctx); }catch(_){}
          return R(!!ok, (ok?note('⬡ '+L('Outlined','範囲を表示','Umrissen','Контур','Contorno')+': '+esc((ext&&ext.name)||place))+(ext?_ambigNote(place,ext.lng,ext.lat):''):warn('⚠ '+L('No precise boundary for','正確な境界がありません','Keine genaue Grenze für','Нет точной границы для','Sin límite preciso para')+': '+esc((ext&&ext.name)||place)))+ocw, ok?{objectIds:['outline']}:null); }   /* (#R120) the outline is a referencable object */
        /* (#R52) features the user could not reach reliably through the fuzzy "control" path are now FIRST-CLASS
           actions (verified window fns / element ids), so "open the pandemic simulator", "switch news pins to the
           publisher", "log in", "donate", "send feedback", "report a bug" execute deterministically. */
        case 'playground': case 'game': { const m=String(a.mode||a.name||'').toLowerCase(); let ok=false, lbl='Playground';
          try{ if(/world|explorer|geo|satellite|drop|guess|どこ|地理/.test(m)&&window._pgWorldExplorer){ window._pgWorldExplorer(); ok=true; lbl='World Explorer'; }
            else if(/pandemic|virus|outbreak|epidemic|disease|感染|パンデミック|эпидеми|pandemia/.test(m)&&window._pgPandemic){ window._pgPandemic(); ok=true; lbl='Pandemic Simulator'; }
            else if(/quiz|test|クイズ|викторин|cuestionario/.test(m)&&window.IntMapEdu&&window.IntMapEdu.open){ window.IntMapEdu.open(); ok=true; lbl='Quiz'; }
            else { await window.IntMapLazy.need('playground'); if(window._openPlayground){ window._openPlayground(); ok=true; } } }catch(_){}
          return R(ok, ok?note('🎮 '+esc(lbl)):warn('⚠ '+L('Playground unavailable','プレイグラウンドを開けません','Playground nicht verfügbar','Playground недоступен','Playground no disponible'))); }
        case 'news': { const m=String(a.mode||a.name||'').toLowerCase(); let id=null,lbl='';
          if(/pub|source|outlet|媒体|発信|発信元|издат|fuente/.test(m)){ id='pinmode-pub'; lbl=L('Publisher pins','発信元ピン','Quelle','Издатель','Editor'); }
          else if(/subj|event|loc|主題|出来事|событ|suceso/.test(m)){ id='pinmode-loc'; lbl=L('Subject pins','主題ピン','Ereignisort','Событие','Suceso'); }
          else if(/saved|favorit|bookmark|保存|ブックマーク|сохран|guardad/.test(m)){ id='newsfilter-saved'; lbl=L('Saved','保存','Gespeichert','Сохранённые','Guardados'); }
          else if(/translat|翻訳|перевод|traduc/.test(m)){ id='ai-translate-btn'; lbl=L('Translate','翻訳','Übersetzen','Перевод','Traducir'); }
          if(id){ const ok=clickId(id); return R(ok, ok?note('📰 '+esc(lbl)):warn('⚠')); }
          const ok=clickId('btn-news'); return R(ok, ok?note('📰 '+L('News','ニュース','Nachrichten','Новости','Noticias')):warn('⚠')); }
        case 'account': case 'login': { const ok=clickId('btn-account'); return R(ok, ok?note('👤 '+L('Account','アカウント','Konto','Аккаунт','Cuenta')):warn('⚠')); }
        case 'donate': { const ok=clickId('btn-blueberry'); return R(ok, ok?note('💙 '+L('Donate','寄付','Spenden','Поддержать','Donar')):warn('⚠')); }
        case 'feedback': { let ok=false; try{ if(window._openFeedback){ window._openFeedback(); ok=true; } }catch(_){} if(!ok) ok=clickId('btn-feedback-hdr'); return R(ok, ok?note('✓ '+L('Feedback','フィードバック','Feedback','Отзыв','Comentarios')):warn('⚠')); }
        case 'bugReport': case 'bug': { let ok=false; try{ if(window._openBugReport){ window._openBugReport(); ok=true; } }catch(_){} return R(ok, ok?note('🐞 '+L('Bug report','バグ報告','Fehlerbericht','Сообщить об ошибке','Reportar error')):warn('⚠')); }
        /* (#R60) FINE-GRAINED first-class actions ("Atlasで、まだ使えない操作がある。特に細かい指示や操作"):
           highlight named countries, look up ONE country's actual figure, all-layers-off, SELECTIVE clear,
           fullscreen and real GPS locate — plus relative opacity ("delta"), compass-direction bearing and
           date-based timeTravel handled in their existing cases above. Every branch runs REAL engine code. */
        case 'highlight': { const _hlMyGen=++_hlGen;   /* (#R143) a newer highlight supersedes this one → stale async paints bail */
          if(a.on===false||/^(off|clear|none|解除)$/i.test(String(Array.isArray(a.countries)?'':(a.countries||a.country||'')))){ clearHl(); clearPolyHl(); clearLineHl(); return R(true, note('✓ '+L('Highlights cleared','ハイライトを消去しました','Hervorhebungen gelöscht','Выделение снято','Resaltado quitado'))); }
          /* (#R61) COLOR is honoured for real ("赤でハイライトしてといっても色が変わらない") — parse it, apply it to
             the live paint, and if we cannot parse it SAY SO instead of silently claiming success. */
          let cwarn=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc) setHlColor(pc); else cwarn=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          await ensureData();
          /* (#R157) GPT-DECIDED TARGETS — the model already interpreted the concept ("ゲルマン諸国" → the Germanic
             countries) and returned explicit ISO3 codes, optionally as several labelled groups. The code's job:
             VALIDATE the codes against the real border data, draw REAL national borders, verify the paint, and
             report honestly stating the interpretation used. This runs BEFORE the legacy name resolver, so a
             country-SET concept never touches regionGroup / resolveHlTarget. `on:false`/recolor were handled above. */
          if(!(a.on===false)){ const _gGroups=_hlReadGptGroups(a);
            if(_gGroups){ if(_hlMyGen!==_hlGen) return R(true,'');
              const _single=(a.color!=null&&String(a.color).trim()!=='')?parseColor(a.color):null;
              const _FBL=L('Highlighted countries','ハイライトした国','Hervorgehobene Länder','Выделенные страны','Países resaltados');
              const G=[]; const gUnresolved=[]; const _resolvedIso=[]; const gSeen=new Set();
              _gGroups.forEach((grp,gi)=>{ (grp.unresolved||[]).forEach(u=>{ if(u) gUnresolved.push(u); });   /* (#R158) unresolved = OBSERVED, reported to Terra — never silently skipped */
                if(!grp.codes.length) return;
                const cg=_codesGeo(grp.codes);
                (cg.miss||[]).forEach(mc=>gUnresolved.push({name:'',iso3:String(mc),reason:'no_border_geometry',availableIdentifiers:[]}));   /* a valid-looking code with no border feature → observed, not dropped */
                if(!cg.geo||!cg.hit.length) return;
                const vg=_validGeo(cg.geo,{trusted:true,autoclose:true});
                if(!vg.ok){ (cg.hit||[]).forEach(hc=>gUnresolved.push({name:'',iso3:String(hc),reason:'invalid_geometry:'+(vg.reason||'?'),availableIdentifiers:[]})); return; }   /* real borders → trusted */
                const key='codes:'+cg.hit.slice().sort().join(','); if(gSeen.has(key)) return; gSeen.add(key);
                cg.hit.forEach(hc=>{ if(_resolvedIso.indexOf(hc)<0) _resolvedIso.push(hc); });
                const label=String(grp.label||'').trim();
                G.push({name:label||('set'+(gi+1)),displayName:label||_FBL,kind:'set',geo:cg.geo,codes:cg.hit.slice(),nCountries:cg.hit.length,basisShort:L('national borders','国境','Staatsgrenzen','госграницы','fronteras')}); });
              /* (#R158) the MECHANICAL execution result — the structured contract the repair loop feeds back to Terra so it,
                 not IntMap, decides how to recover (correct identifiers / re-search / ask / adopt partial). IntMap only OBSERVES. */
              const _unrSum=arr=>arr.slice(0,14).map(u=>(u.name||u.iso3||'?')+(u.availableIdentifiers&&u.availableIdentifiers.length?(' → '+u.availableIdentifiers.join('/')):'')).join(', ');
              const _mkExec=(painted,features,verified)=>({ status:(gUnresolved.length?'partial_or_failed':'ok'), action:{type:'highlight', interpretation:(a.interpretation||''), originalTargets:(a.groups||a.targets||a.iso3||a.codes||a.countries||null)},
                resolved:_resolvedIso.map(c=>({iso3:c})), unresolved:gUnresolved.slice(0,60),
                renderState:{painted:!!painted, features:(features!=null?features:0), verified:!!verified},
                capabilities:{ identifierScheme:'ISO 3166-1 alpha-3', validIdentifierCount:_hlValidCodeSet().size } });
              if(!G.length){   /* nothing valid to draw → return the STRUCTURED result (not a dead-end) so Terra corrects the identifiers */
                return R(false, warn('⚠ '+L('None of the identifiers for that request resolved to a real border','その要求の識別子はいずれも実在の国境に解決できませんでした','Keiner der Bezeichner dieser Anfrage ließ sich einer realen Grenze zuordnen','Ни один идентификатор запроса не сопоставлен с реальной границей','Ninguno de los identificadores de esa solicitud se resolvió a una frontera real'))+(gUnresolved.length?note(esc(_unrSum(gUnresolved))):'')+cwarn, {meta:{partial:true}, exec:_mkExec(false,0,false)}); }
              clearHl(); clearLineHl(); _hlLines=[]; clearPolyHl();
              _hlPolys=G.map((g,i)=>{ g.color=_single||_hlPaletteColor(i); return {name:g.name,geo:g.geo,color:g.color,comp:1,op:0.42}; });
              let paintedP=paintPolys();
              for(let i5=0;i5<8&&!paintedP;i5++){ await new Promise(r5=>setTimeout(r5,700)); if(_hlMyGen!==_hlGen) return R(true,''); paintedP=paintPolys(); }
              if(!paintedP) return R(false, warn('⚠ '+L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn, {exec:_mkExec(false,0,false)});
              const ver=_verifyPolyPaint(G.length);
              if(!_fitGroups(_hlPolys)){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} }
              const totalC=G.reduce((s2,g)=>s2+g.nCountries,0);
              let hh=note('✦ '+G.map(g=>esc(g.displayName)).join(', '))+_hlLegendHtml(G);
              /* (#R157) STATE THE DEFINITION USED (the work order's "採用した定義を結果に明示"). */
              hh+=note(L('Interpreted from your request and drawn from real national borders — '+totalC+' countries.','ご依頼を解釈し、実際の国境データから描画しました — '+totalC+'か国。','Aus Ihrer Anfrage interpretiert und aus realen Staatsgrenzen gezeichnet — '+totalC+' Länder.','Интерпретировано по вашему запросу и построено по реальным госграницам — стран: '+totalC+'.','Interpretado a partir de tu solicitud y dibujado con fronteras reales — '+totalC+' países.'));
              if(gUnresolved.length) hh+=warn('⚠ '+L('Some targets could not be matched to border data — checking with the model','一部の対象を国境データに一致させられませんでした — モデルに確認しています','Einige Ziele ließen sich den Grenzdaten nicht zuordnen — Rückfrage beim Modell','Некоторые цели не сопоставлены с данными границ — уточняем у модели','Algunos objetivos no coincidieron con los datos de fronteras — consultando al modelo')+': '+esc(_unrSum(gUnresolved)));
              if(ver&&!ver.ok) hh+=warn('⚠ '+L('Could not verify the drawn shapes on the map','描画結果を地図上で確認できませんでした','Gezeichnete Formen nicht verifizierbar','Не удалось проверить фигуры на карте','No se pudieron verificar las formas'));
              try{ _wctx.highlight={ name:G.map(g=>g.displayName||g.name).join(', ').slice(0,160), n:totalC, basis:null }; }catch(_){}
              const _partial=!!(gUnresolved.length||(ver&&!ver.ok));
              return R(true, hh+cwarn, {meta:(_partial?{partial:true}:undefined), exec:_mkExec(true,(ver&&ver.n)||totalC,!!(ver&&ver.ok))});
            } }
          /* (#R150 · geo-target unification) SINGLE ambiguity decision shared by BOTH the multi-region and the
             single-colour paths below. ROOT CAUSE the user reported: candidate-confirmation ("did you mean the
             country or the US state?") was appended as a mere WARNING *alongside* the painted success + not-found
             failures — so confirmation, partial execution, success and failure all showed at once. The spec:
             "意味が排他的なら確認質問を出して実行を停止" — an exclusive/ambiguous name must produce ONE coherent
             confirmation that STOPS execution (paints nothing), never mixed with a success/partial. This helper
             renders that single confirmation; both paths gate on it BEFORE painting. No per-name hardcoding — it is
             driven entirely by resolveHlTarget's ambiguous verdict, so it applies uniformly to admin regions,
             historical regions, natural regions and same-name places. */
          const _hlAmbigConfirm=(ambigArr, clearNames)=>{
            const body=(ambigArr||[]).map(t=>'<b>'+esc(t.name)+'</b>:<br>• '+((t.candidates||[]).slice(0,4).map(c=>esc(String((c&&c.name)||c||'')+((c&&c.country)?(' — '+c.country):'')+((c&&c.note)?(' ('+c.note+')'):''))).join('<br>• ')||esc(String(t.name)))).join('<br>');
            const head=(ambigArr&&ambigArr.length>1)
              ? L('These names are ambiguous — which did you mean for each?','これらの名称には複数の候補があります。それぞれどれを指しますか？','Diese Namen sind mehrdeutig — welchen jeweils?','Названия неоднозначны — какой в каждом случае?','Estos nombres son ambiguos — ¿cuál en cada caso?')
              : L('That name is ambiguous — which did you mean?','その名称には複数の候補があります。どれを指しますか？','Der Name ist mehrdeutig — welchen meinen Sie?','Название неоднозначно — какой вариант?','Ese nombre es ambiguo — ¿cuál quiere decir?');
            let extra=''; const cn=(clearNames||[]).filter(Boolean);
            if(cn.length) extra='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">'+L(
              'Nothing was drawn on a guess — clarify the above and I\'ll highlight everything (incl. '+esc(cn.slice(0,4).join(', '))+') together.',
              '推測では描画していません。上記を確定いただければ '+esc(cn.slice(0,4).join(', '))+' などまとめてハイライトします。',
              'Nichts wurde geraten — nach der Klärung hebe ich alles (auch '+esc(cn.slice(0,4).join(', '))+') zusammen hervor.',
              'Ничего не нарисовано наугад — уточните, и я выделю всё (включая '+esc(cn.slice(0,4).join(', '))+') сразу.',
              'No se dibujó nada por conjetura — aclara y resaltaré todo (incl. '+esc(cn.slice(0,4).join(', '))+') junto.')+'</div>';
            return warn('⚠ '+head)+note(body)+extra; };
          /* (#R104) RANK + FILTER → highlight ("人口5M未満は除外したGDP per capita上位10ヵ国をハイライトして"): when a
             ranking metric is given instead of explicit country names, compute the ranked, optionally
             population-filtered top/bottom-N DETERMINISTICALLY from the real country data and highlight exactly
             those (no AI guessing which countries). */
          const _rmRaw=a.metric||a.rankBy||a.rankMetric||a.by;
          const _hlExplicit=(Array.isArray(a.countries)?a.countries.length:String(a.countries||a.country||a.name||a.place||a.region||a.query||'').trim().length);   /* (#R157) a.query = a concrete single feature from the model (admin region / river / basin) */
          if(_rmRaw&&!_hlExplicit){
            const _sp=_metSpec(_rmRaw);
            if(!_sp||!_sp.m) return R(false, warn('⚠ '+L('Unknown ranking metric','ランキングの指標を認識できません','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')+': '+esc(String(_rmRaw)))+cwarn);
            try{ await _fillMetric(_sp.key); }catch(_){}   /* lazy WB fields (tfr/lifeExp/internet) → filled before ranking */
            const _n=Math.max(1,Math.min(40,parseInt(a.n||a.top||a.count||10,10)||10));
            const _bottom=/^(bottom|low|lowest|least|worst)$/i.test(String(a.order||''))||/下位|最下位|ワースト|少ない|低い/.test(String(a.order||'')+String(a.rankOrder||''));
            const _pn=v=>{ if(v==null) return null; v=String(v).replace(/[, _]/g,'').toLowerCase(); const mm=v.match(/^([\d.]+)\s*(m|million|mn|百万|k|thousand|千|b|billion|bn|億)?$/); if(!mm) return (v!==''&&isFinite(+v))?+v:null; let x=+mm[1]; const u=mm[2]||''; if(/^(m|million|mn|百万)$/.test(u))x*=1e6; else if(/^(k|thousand|千)$/.test(u))x*=1e3; else if(/^(b|billion|bn)$/.test(u))x*=1e9; else if(u==='億')x*=1e8; return x; };
            const _minPop=_pn(a.minPop!=null?a.minPop:(a.excludeBelowPop!=null?a.excludeBelowPop:(a.filter&&a.filter.minPop!=null?a.filter.minPop:null)));
            const _maxPop=_pn(a.maxPop!=null?a.maxPop:(a.filter&&a.filter.maxPop!=null?a.filter.maxPop:null));
            const _rowsF=[];
            for(const cd in countryStats){ const s=countryStats[cd]; if(!s||s.sov===false||!s.nameEn) continue;
              const v=_sp.m.get(s); if(v==null||isNaN(v)) continue;
              if(_minPop!=null&&!(s.pop>=_minPop)) continue;
              if(_maxPop!=null&&!(s.pop<=_maxPop)) continue;
              _rowsF.push({code:cd,name:nm(s),val:+v}); }
            _rowsF.sort((x,y)=>y.val-x.val);
            const _picked=_bottom?_rowsF.slice(-_n).reverse():_rowsF.slice(0,_n);
            if(!_picked.length) return R(false, warn('⚠ '+L('No countries match that filter','条件に合う国がありません','Keine Länder passen zum Filter','Нет стран по фильтру','Ningún país cumple el filtro'))+cwarn);
            const _codes=_picked.map(p=>p.code);
            clearPolyHl(); _hlPolys=[]; clearLineHl(); _hlLines=[];
            let _painted=highlight(_codes);
            for(let i3=0;i3<8&&!_painted;i3++){ await new Promise(r3=>setTimeout(r3,700)); _painted=highlight(_codes); }
            if(!_painted) return R(false, warn('⚠ '+L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung fehlgeschlagen (Karte lädt) — erneut','Не удалось нарисовать (карта загружается) — повторите','No se pudo dibujar (mapa cargando) — reintenta'))+cwarn);
            const _ub=unionBox(_codes,[]); if(_ub){ try{ GE().camera.fitBounds(_ub,{padding:60,maxZoom:7.5,duration:900}); }catch(_){} } else { try{ fitTo(_codes); }catch(_){} }
            const _ord=_bottom?L('Lowest','下位','Niedrigste','Минимум','Menor'):L('Top','上位','Top','Топ','Top');
            let _hh=note('✦ '+_ord+' '+_picked.length+' · '+esc(lx(_sp.m.label))+(_minPop!=null?(' · '+L('excl. pop <','人口<','Bev. <','нас. <','pob. <')+' '+fmtVal('pop',_minPop)):'')+(_maxPop!=null?(' · '+L('excl. pop >','人口>','Bev. >','нас. >','pob. >')+' '+fmtVal('pop',_maxPop)):''));
            _hh+=note(_picked.map((p,i)=>(i+1)+'. '+esc(p.name)+' <span style="color:var(--text-muted);">'+fmtVal(_sp.key,p.val)+'</span>').join('<br>'));
            return R(true, _hh+cwarn);
          }
          const raw=Array.isArray(a.countries)?a.countries.map(x=>String(x||'').trim()).filter(Boolean):String(a.countries||a.country||a.name||a.place||a.region||a.query||'').split(/,|、|;| and | und | y | и |と/i).map(x=>x.trim()).filter(Boolean);   /* (#R157) a.query = model-supplied concrete single feature (falls to the resolveHlTarget ladder) */
          const pc2=(a.color!=null&&String(a.color).trim()!=='')?parseColor(a.color):null;
          if(!raw.length){ if(a.color&&!cwarn&&(_hl.size||_hlPolys.length)){ if(pc2&&_hlPolys.length){ _hlPolys.forEach(p=>{ p.color=pc2; }); paintPolys(); } return R(true, note('🎨 '+L('Recolored the current highlights','ハイライトの色を変更しました','Hervorhebungen umgefärbt','Цвет выделения изменён','Resaltado recoloreado'))); }
            if(a.color&&!cwarn) return R(false, warn('⚠ '+L('Nothing is highlighted yet — name the countries or regions','ハイライト中の対象がありません。国名や地域名を指定してください','Noch nichts hervorgehoben — Länder oder Regionen nennen','Ничего не выделено — укажите страны или регионы','Nada resaltado aún — indica países o regiones')));
            return R(false, warn('⚠ '+L('Which countries or regions?','どの国・地域をハイライトしますか？','Welche Länder oder Regionen?','Какие страны или регионы?','¿Qué países o regiones?'))+cwarn); }
          /* (#R143) MULTI-REGION grouping: expand compound directional forms ("東西南北欧" → the four M49 sub-regions)
             and, when the command names 2+ distinct targets, NO single explicit colour is given, none is a river/basin,
             AND at least one target is a country-SET or a REGION, draw each target as its OWN colour group with a
             legend (凡例). Country sets resolve to REAL national borders (UN M49 where applicable); every shape is
             VALIDATED before drawing; the reply is composed from what actually painted, with successes and failures
             kept separate. Anything else falls through to the single-colour path below. */
          const rawX=_expandRegionCompound(raw);
          if(rawX.length>=2 && !pc2 && !rawX.some(n=>basinIntent(n)||riverIntent(n))){
            const G=[], gMiss=[], gAmbig=[], gRej=[]; const gSeen=new Set();
            for(const nm3 of rawX){ let t3=null; try{ t3=await resolveHlTarget(nm3); }catch(_){}
              if(t3&&t3.ambiguous&&Array.isArray(t3.candidates)&&t3.candidates.length){ gAmbig.push({name:t3.name||nm3,candidates:t3.candidates}); continue; }
              let kind='',codes=null,gj=null; const nm4=(t3&&((t3.poly&&t3.poly.name)||t3.name))||nm3; let composed=false,osm=false,derived=false,approx=false,verified=false,basis='';
              if(t3&&t3.code){ codes=[t3.code]; kind='country'; }
              else if(t3&&t3.codes){ codes=t3.codes.slice(); kind='set'; basis=t3.basis||''; }
              else if(t3&&t3.poly&&t3.poly.geo){ gj=t3.poly.geo; kind='region'; composed=!!t3.composed; osm=(t3.rrMethod==='osm_polygon'); derived=(t3.rrMethod==='derived_anchors'); approx=!!(t3.soft||t3.approx); verified=!!t3.verified; }
              else { gMiss.push(nm3); continue; }
              let nC=0; if(codes){ const cg=_codesGeo(codes); gj=cg.geo; nC=cg.hit.length; if(!gj){ gMiss.push(nm4); continue; } }
              const trusted=(kind==='country'||kind==='set'||osm||composed);
              const vg=_validGeo(gj,{trusted,autoclose:true});
              if(!vg.ok){ gRej.push({name:nm4,reason:vg.reason}); continue; }
              const key=(kind==='region')?('poly:'+nm4):('codes:'+codes.join(',')); if(gSeen.has(key)) continue; gSeen.add(key);
              const basisShort = composed?L('admin borders','行政界','Verwalt.-grenzen','адм. границы','límites adm.')
                : osm?'OpenStreetMap' : derived?('⬡ '+L('web-derived','Web由来','Web-abgeleitet','из веба','de la web'))
                : approx?('⬡ '+L('approx.','近似','ca.','прибл.','aprox.'))
                : (kind==='country'||kind==='set')?L('national borders','国境','Staatsgrenzen','госграницы','fronteras'):'';
              G.push({name:nm4,displayName:_regionLabel(nm4),kind,geo:gj,codes,nCountries:nC,composed,osm,derived,approx,verified,basis,basisShort}); }
            /* (#R150) AMBIGUITY GATE — an exclusive/ambiguous target STOPS the whole request: ask ONE confirmation,
               paint nothing (no partial + confirmation co-display). Gate before the paint so it applies whether or
               not the multi-region branch would have drawn. */
            if(gAmbig.length){ if(_hlMyGen!==_hlGen) return R(true,''); return R(false, _hlAmbigConfirm(gAmbig, G.map(g=>g.displayName||g.name).concat(gMiss)), {meta:{partial:true}}); }
            if(G.length>=2 && G.some(g=>g.kind==='set'||g.kind==='region')){
              if(_hlMyGen!==_hlGen) return R(true,'');   /* superseded by a newer highlight → don't overwrite it */
              clearHl(); clearLineHl(); _hlLines=[]; clearPolyHl();
              _hlPolys=G.map((g,i)=>{ g.color=_hlPaletteColor(i); return {name:g.name,geo:g.geo,color:g.color,comp:(g.kind!=='region'||g.composed)?1:0,op:0.42}; });
              let paintedP=paintPolys();
              for(let i4=0;i4<8&&!paintedP;i4++){ await new Promise(r4=>setTimeout(r4,700)); if(_hlMyGen!==_hlGen) return R(true,''); paintedP=paintPolys(); }
              if(!paintedP) return R(false, warn('⚠ '+L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn);
              const ver=_verifyPolyPaint(G.length);
              if(!_fitGroups(_hlPolys)){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} }
              let hh=note('✦ '+G.map(g=>esc(g.displayName||g.name)).join(', '))+_hlLegendHtml(G);
              if(G.some(g=>g.kind==='set'||g.kind==='country')) hh+=note(L('Country sets drawn from real national borders (UN M49 standard where applicable)','国集合は実際の国境データから描画（該当時はUN M49標準）','Ländergruppen aus realen Staatsgrenzen (ggf. UN-M49-Standard)','Наборы стран построены по реальным госграницам (при наличии — стандарт UN M49)','Conjuntos de países con fronteras reales (estándar UN M49 cuando aplica)'));
              if(G.some(g=>g.composed)) hh+=note(L('Some regions built from member administrative boundaries','一部の地域は構成行政区画の境界から構築','Einige Regionen aus Verwaltungsgrenzen der Teilgebiete','Некоторые регионы построены из адм. границ','Algunas regiones a partir de límites administrativos'));
              if(G.some(g=>g.osm)) hh+=note(L('Some regions from real OpenStreetMap boundaries','一部の地域は実際のOpenStreetMap境界','Einige Regionen aus realen OpenStreetMap-Grenzen','Некоторые регионы — реальные границы OSM','Algunas regiones de límites reales de OpenStreetMap'));
              if(G.some(g=>g.derived||g.approx)) hh+=note(L('⬡ = approximate extent (no official boundary exists)','⬡ = 近似範囲（公式境界が存在しない）','⬡ = ungefähre Ausdehnung (keine offizielle Grenze)','⬡ = приблизительный контур (нет офиц. границы)','⬡ = extensión aproximada (sin límite oficial)'));
              /* (#R150) gAmbig is now impossible here — the ambiguity gate above returned before painting. Only
                 honest "drawn, but these couldn't be located/were invalid" disclosure remains (no pending question). */
              if(gRej.length) hh+=warn('⚠ '+L('Rejected — invalid/degenerate shape (not drawn)','不正・退化した形状のため未描画','Abgelehnt — ungültige/entartete Form','Отклонено — некорректная форма','Rechazado — forma inválida')+': '+esc(gRej.map(r=>r.name).join(', ')));
              if(gMiss.length) hh+=warn('⚠ '+L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(gMiss.join(', ')));
              if(ver&&!ver.ok) hh+=warn('⚠ '+L('Could not verify the drawn shapes on the map','描画結果を地図上で確認できませんでした','Gezeichnete Formen nicht verifizierbar','Не удалось проверить фигуры на карте','No se pudieron verificar las formas'));
              try{ _wctx.highlight={ name:G.map(g=>g.displayName||g.name).join(', ').slice(0,160), n:G.length, basis:(G.map(g=>g.basis).filter(Boolean).join(' / ')||null) }; }catch(_){}
              const partial=!!(gRej.length||gMiss.length||(ver&&!ver.ok));
              return R(true, hh+cwarn, partial?{meta:{partial:true}}:undefined);
            }
            /* not multi-region-eligible (1 shape drew, or a plain country list) → single-colour path below */
          }
          /* (#R62) countries AND subdivisions AND fuzzy regions, freely mixed.
             (#R64) + country GROUPS (旧ソ連諸国, EU…) and real-boundary COMPOSITIONS (東海地方, 肥沃な三日月帯…).
             (#R65) + RIVERS as their real course (line) and BASINS (tributaries + faint basin fill) — judged
             BEFORE any admin-unit logic. */
          const found=[],polys=[],lines=[],lineNames=[],miss=[],ambig=[],rejected=[],seen=new Set(),grpNames=[],grpBases=[]; let anyApprox=false,anyComposed=false,anyPartial=false,basinInfo=null,anyVerified=false,anyOsm=false,anyDerived=false;
          for(const nm2 of rawX){
            const bi=basinIntent(nm2);
            if(bi){ let B=null; try{ B=await buildBasin(bi.base); }catch(_){}
              if(!B||(!B.river&&!B.basin)){ miss.push(nm2); continue; }
              if(B.basin){ const bp={name:nm2,geo:B.basin.geo,op:0.14,comp:true}; if(pc2) bp.color=pc2; polys.push(bp); if(B.approx) anyApprox=true; }
              if(B.trib&&B.trib.geo) lines.push({geo:B.trib.geo,w:1.1,op:0.75,color:pc2||null});
              if(B.river) lines.push({geo:B.river.geo,w:3.2,color:pc2||null,name:B.river.name});
              if(!B.basin&&B.river) lineNames.push(B.river.name);
              basinInfo={trib:(B.trib&&B.trib.n)||0, trunc:!!(B.trib&&B.trib.truncated), noBasin:!B.basin, noTrib:!B.trib, src:B.src||''};
              continue; }
            if(riverIntent(nm2)){ let rl=null; try{ rl=await fetchRiverLine(nm2); }catch(_){}
              if(rl){ lines.push({geo:rl.geo,w:3.2,color:pc2||null,name:rl.name}); lineNames.push(rl.name); continue; } }
            let t2=null; try{ t2=await resolveHlTarget(nm2); }catch(_){}
            if(t2&&t2.verified) anyVerified=true;   /* (#R130) at least one target's location was web-search-verified */
            if(t2&&t2.ambiguous&&Array.isArray(t2.candidates)&&t2.candidates.length){ ambig.push({name:t2.name||nm2, candidates:t2.candidates}); }   /* (#R132) ambiguous → ask instead of guessing */
            else if(t2&&t2.code){ if(!seen.has(t2.code)){ seen.add(t2.code); found.push(t2); } }
            else if(t2&&t2.codes){ let nAdd=0; t2.codes.forEach(cd=>{ if(!seen.has(cd)){ seen.add(cd); found.push({code:cd,_grp:1}); nAdd++; } }); grpNames.push(_regionLabel(t2.name||nm2)+' ('+nAdd+')'); if(t2.basis) grpBases.push(t2.basis); }
            else if(t2&&t2.poly&&t2.poly.geo){
              /* (#R143) VALIDATE before drawing — reject unclosed rings, degenerate "giant triangles", abnormal long
                 edges, self-intersections, whole-world blobs, tiny slivers. Real OSM/admin/composed borders are trusted
                 (skip the crude-approximation heuristics); AI/derived/soft outlines get the full battery. A rejected
                 shape is reported honestly (never drawn as a "close enough" blob). */
              const _tr=!(t2.soft||t2.approx||t2.rrMethod==='derived_anchors'); const _vg=_validGeo(t2.poly.geo,{trusted:_tr,autoclose:true});
              if(!_vg.ok){ rejected.push({name:t2.poly.name||nm2,reason:_vg.reason}); }
              else { if(pc2) t2.poly.color=pc2; if(t2.composed) t2.poly.comp=true; polys.push(t2.poly); if(t2.composed) anyComposed=true; if(t2.partial) anyPartial=true;
                /* (#R132) precise BASIS per method — real OSM boundary vs web-anchor-derived vs curated gazetteer/AI outline */
                if(t2.rrMethod==='osm_polygon') anyOsm=true; else if(t2.rrMethod==='derived_anchors') anyDerived=true; else if(t2.soft||t2.approx) anyApprox=true; } }
            else miss.push(nm2); }
          /* (#R150) AMBIGUITY GATE (shared decision with the multi-region path via _hlAmbigConfirm): ANY ambiguous
             target STOPS the request with ONE confirmation and paints nothing — never "highlighted A" + "did you
             mean B or C?" + "not found: D" at once. What WOULD be drawn is listed so the user sees nothing was guessed. */
          if(ambig.length){ if(_hlMyGen!==_hlGen) return R(true,''); const clear=found.filter(c=>!c._grp).map(c=>c.name).concat(grpNames).concat(polys.map(p=>p.name)).concat(lineNames).concat(miss); return R(false, _hlAmbigConfirm(ambig, clear)+cwarn, {meta:{partial:true}}); }
          if(!found.length&&!polys.length&&!lines.length){
            if(rejected.length) return R(false, warn('⚠ '+L('The shape resolved for that region was invalid (degenerate/self-intersecting) and was not drawn','その地域の形状が不正（退化・自己交差）なため描画しませんでした','Die aufgelöste Form dieser Region war ungültig (entartet/selbstschneidend)','Форма региона оказалась недействительной (вырожденная/самопересекающаяся)','La forma resuelta para esa región no era válida (degenerada/autointersecante)')+': '+esc(rejected.map(r=>r.name).join(', ')))+cwarn);
            return R(false, warn('⚠ '+L('Nothing found for','見つかりません','Nichts gefunden für','Ничего не найдено','Nada encontrado para')+': '+esc(raw.join(', ')))+cwarn); }
          /* (#R61) VERIFY the paint really happened (style may still be loading) — bounded retry, then honesty. */
          if(_hlMyGen!==_hlGen) return R(true,'');   /* (#R143) superseded by a newer highlight */
          clearPolyHl(); _hlPolys=polys; clearLineHl(); _hlLines=lines;
          const codes2=found.map(c=>c.code);
          let painted=(codes2.length?highlight(codes2):(clearHl(),true)); let paintedP=paintPolys(); let paintedL=paintLines();
          for(let i2=0;i2<8&&((codes2.length&&!painted)||(polys.length&&!paintedP)||(lines.length&&!paintedL));i2++){ await new Promise(r2=>setTimeout(r2,700)); if(_hlMyGen!==_hlGen) return R(true,''); if(codes2.length&&!painted) painted=highlight(codes2); if(polys.length&&!paintedP) paintedP=paintPolys(); if(lines.length&&!paintedL) paintedL=paintLines(); }
          const ub=unionBox(codes2,polys.concat(lines)); if(ub){ try{ GE().camera.fitBounds(ub,{padding:60,maxZoom:7.5,duration:900}); }catch(_){} } else if(codes2.length){ const fitOk=fitTo(codes2);
            /* (#R64) antimeridian-spanning sets (旧ソ連諸国: Chukotka wraps the date line) defeat a bbox fit —
               zoom out to the planet so the highlight is actually visible instead of silently not moving. */
            if(!fitOk){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} } }
          if((codes2.length&&!painted)||(polys.length&&!paintedP)||(lines.length&&!paintedL)) return R(false, warn('⚠ '+L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn);
          const shown=found.filter(c=>!c._grp).map(c=>esc(c.name)).concat(grpNames.map(esc)).concat(polys.map(p=>esc(p.name))).concat(lineNames.map(esc));
          let hh=note((found.length?'✦ ':'')+shown.join(', '));
          /* (#R118) HISTORICAL-membership basis stated up front + remembered — kills the "それは何年のもの？"
             death-spiral: the reply itself says what year-basis the highlight uses, and follow-up questions can
             read it from the working context instead of guessing (or citing the time-travel date). */
          if(grpBases.length){ hh+=note('◷ '+grpBases.map(esc).join('<br>◷ ')); }
          try{ _wctx.highlight={ name:(grpNames.concat(polys.map(p=>p.name),found.filter(c=>!c._grp).map(c=>c.name)).join(', ')).slice(0,160), n:codes2.length+polys.length+lines.length, basis:(grpBases.join(' / ')||null) }; }catch(_){}
          if(basinInfo){
            if(basinInfo.trib) hh+=note(L(basinInfo.trib+' tributary/branch waterways drawn (every river/canal tagged in OpenStreetMap inside the basin)','支流・分流 '+basinInfo.trib+' 本を描画（流域内にOSM登録された河川・運河すべて）','' +basinInfo.trib+' Nebenflüsse gezeichnet (alle in OSM erfassten Wasserläufe im Einzugsgebiet)','Нарисовано притоков: '+basinInfo.trib+' (все реки/каналы OSM в бассейне)','Dibujados '+basinInfo.trib+' afluentes (todos los ríos/canales de OSM en la cuenca)'));
            if(basinInfo.trunc) hh+=note(L('Note: a small share of the tiniest streams was omitted at the display cap (all major tributaries are drawn)','注: 表示上限により最小級の細流の一部のみ省略（主要な支流はすべて描画済み）','Hinweis: nur ein kleiner Teil der kleinsten Bäche wurde am Limit ausgelassen','Примечание: опущена лишь малая часть мельчайших ручьёв','Nota: solo se omitió una pequeña parte de los arroyos más pequeños'));
            if(basinInfo.src&&basinInfo.src!=='AI outline') hh+=note(L('Basin boundary: real hydrological data — ','流域界: 実測の水文データ — ','Beckengrenze: reale Hydrologiedaten — ','Граница бассейна: реальные гидрологические данные — ','Límite de cuenca: datos hidrológicos reales — ')+esc(basinInfo.src));
            if(basinInfo.noBasin) hh+=warn('⚠ '+L('Basin outline unavailable — main stem only','流域の輪郭を取得できませんでした（本流のみ描画）','Beckenumriss nicht verfügbar — nur Hauptstrom','Контур бассейна недоступен — только главное русло','Contorno de la cuenca no disponible — solo el cauce principal'));
            else if(basinInfo.noTrib) hh+=note(L('No tributaries returned by OpenStreetMap here','OpenStreetMapから支流を取得できませんでした','Keine Nebenflüsse von OSM','OSM не вернул притоков','OSM no devolvió afluentes'));
          }
          if(anyComposed) hh+=note(L('Drawn from the real administrative boundaries of the region\'s member units','構成する行政区画の実際の境界データから描画','Aus den realen Verwaltungsgrenzen der Teilgebiete gezeichnet','Построено из реальных административных границ','Dibujado a partir de los límites administrativos reales'));
          /* (#R132) explicit BASIS lines for the general resolver */
          if(anyOsm) hh+=note(L('Drawn from real OpenStreetMap boundary data','実際のOpenStreetMapの境界データから描画','Aus realen OpenStreetMap-Grenzdaten gezeichnet','Построено по реальным границам OpenStreetMap','Dibujado a partir de límites reales de OpenStreetMap'));
          if(anyDerived) hh+=note(L('⬡ = approximate extent derived from web-verified boundary anchors (no official boundary exists for this region)','⬡ = 近似範囲（公式境界が存在しない地域を、Web検索で照合した境界アンカーから構築）','⬡ = ungefähre Ausdehnung aus web-verifizierten Grenzankern (keine offizielle Grenze)','⬡ = приблизительный контур из проверенных веб-поиском опорных точек (официальной границы нет)','⬡ = extensión aproximada a partir de anclas verificadas por búsqueda web (no hay límite oficial)'));
          if(anyPartial) hh+=warn('⚠ '+L('Some member boundaries could not be fetched — the shape may be missing pieces','一部の構成区画の境界を取得できませんでした（欠けがある可能性）','Einige Teilgrenzen fehlen','Часть границ получить не удалось','Faltan algunos límites'));
          if(anyApprox) hh+=note(L('⬡ = approximate extent (no official boundary exists — AI-traced outline)','⬡ = 近似輪郭（公式境界が存在しない地域のAIトレース）','⬡ = ungefähre Ausdehnung (KI-Umriss)','⬡ = приблизительный контур (ИИ)','⬡ = contorno aproximado (IA)'));
          if(anyVerified) hh+=note('✓ '+L('location web-verified','位置をWeb検索で照合','Standort per Websuche geprüft','местоположение проверено веб-поиском','ubicación verificada con búsqueda web'));
          /* (#R150) ambig is impossible here — the ambiguity gate above stopped and asked before any painting. */
          if(miss.length) hh+=warn('⚠ '+L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(miss.join(', ')));
          if(rejected.length) hh+=warn('⚠ '+L('Rejected — invalid/degenerate shape (not drawn)','不正・退化した形状のため未描画','Abgelehnt — ungültige/entartete Form','Отклонено — некорректная форма','Rechazado — forma inválida')+': '+esc(rejected.map(r=>r.name).join(', ')));   /* (#R143) */
          /* (#R142) PARTIAL result → the planner's pre-written "…をハイライトしました" over-claims the targets that were NOT
             drawn. Flag partial so runActions suppresses that say (#3) and lets this honest body — which lists exactly what
             WAS drawn plus "Not found: X" / "Ambiguous: Y" — lead. (Total miss already returns ok:false above.) */
          return R(true,hh+cwarn, (miss.length||ambig.length||rejected.length)?{meta:{partial:true}}:undefined); }
        case 'value': case 'stat': case 'lookup': { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name);
          if(!c||!c.code||!countryStats[c.code]) return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||a.name||'')));
          const s=countryStats[c.code]; const mk=String(a.metric||a.what||'').trim();
          try{ highlight([c.code]); fitTo([c.code]); }catch(_){}
          const TXTF={capital:LA('Capital','首都','Hauptstadt','Столица','Capital'),currency:LA('Currency','通貨','Währung','Валюта','Moneda'),languages:LA('Languages','言語','Sprachen','Языки','Idiomas'),flag:LA('Flag','国旗','Flagge','Флаг','Bandera')};
          if(TXTF[mk]){ const v=s[mk]; return R(v!=null&&v!=='', '<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(TXTF[mk]))+': <b>'+esc(v||'—')+'</b></div>'); }
          if(METRICS[mk]){ const v=METRICS[mk].get(s); if(v==null||isNaN(v)) return R(false, warn('⚠ '+esc(c.name)+': '+L('no data for this metric','この指標のデータがありません','keine Daten für diese Kennzahl','нет данных по показателю','sin datos para esta métrica')));
            return R(true,'<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(METRICS[mk].label))+': <b>'+esc(fmtVal(mk,v))+'</b></div>'); }
          /* no / unknown metric → full compact stat card from everything we hold */
          let rowsH=''; for(const k in METRICS){ const v=METRICS[k].get(s); if(v==null||isNaN(v)) continue; rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(METRICS[k].label))+'</span><b>'+esc(fmtVal(k,v))+'</b></div>'; }
          for(const k of ['capital','currency','languages']){ if(s[k]) rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(TXTF[k]))+'</span><b>'+esc(s[k])+'</b></div>'; }
          return R(true,'<div style="font-weight:600;margin:2px 0 5px;">'+esc((s.flag?s.flag+' ':'')+c.name)+'</div><div style="font-size:12px;line-height:1.7;">'+rowsH+'</div>'); }
        case 'layersOff': case 'allLayersOff': { const keepBase=a.all!==true; let n=0;
          layerCatalog().forEach(c=>{ if(!c.cb.checked) return; if(keepBase&&/^(cb-borders|cb-coast|cb-names|cb-countries)$/.test(c.cb.id||'')) return; try{ c.cb.checked=false; c.cb.dispatchEvent(new Event('change',{bubbles:true})); n++; }catch(_){} });
          return R(true, note('✓ '+L(n+' layer(s) turned off','レイヤーを '+n+' 件オフにしました',n+' Ebene(n) ausgeschaltet','Слоёв выключено: '+n,n+' capa(s) desactivada(s)'))); }
        case 'clear': { const w=String(a.what||a.target||'all').toLowerCase(); const did=[]; const all=/^(all|everything|全部|すべて|todo|alles|всё)$/.test(w); const wants=re=>all||re.test(w);
          if(wants(/pin|ピン|метк|pines/)){ try{ if(typeof clearAllPins==='function'){ clearAllPins(); did.push(L('pins','ピン','Pins','метки','pines')); } }catch(_){} }
          if(wants(/radius|circle|半径|円|круг|círculo/)){ try{ if(window.clearAllRadius){ window.clearAllRadius(); did.push(L('circles','円','Kreise','круги','círculos')); } }catch(_){} }
          if(wants(/highlight|shad|choro|ハイライト|濃淡|色分け|выделен|resalt/)){ try{ clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); did.push(L('highlights','ハイライト','Hervorhebungen','выделение','resaltado')); }catch(_){} }
          if(wants(/outline|contour|輪郭|範囲|контур/)){ try{ if(window.IntMapOutline&&window.IntMapOutline.clear){ window.IntMapOutline.clear(); did.push(L('outline','輪郭','Umriss','контур','contorno')); } }catch(_){} }
          if(wants(/measure|draw|tool|volume|計測|測定|描画|ツール|立体|инструмент|объём|volumen|herramienta/)){   /* (#R170) +the 3-D volume box (exitTool drops it) */ try{ if(typeof exitTool==='function'){ exitTool(); did.push(L('tools','ツール','Werkzeuge','инструменты','herramientas')); } }catch(_){} }
          if(wants(/isolat|分離|изоляц|aisla/)){ try{ if(window.IntMapIsolate&&window.IntMapIsolate.exit){ window.IntMapIsolate.exit(); did.push(L('isolate','分離','Isolierung','изоляция','aislar')); } }catch(_){} }
          if(wants(/poi|facilit|marker|施設|マーカー|объект|instalacion|report|レポート|調査/)){ try{ clearPois(); did.push(L('facilities','施設マーカー','Einrichtungen','объекты','instalaciones')); }catch(_){} }
          if(wants(/fly|flight|trajector|missile|ballistic|飛行|軌道|ミサイル|弾道|полёт|полет|vuelo|trayector|misil/)){ try{ clearFly(); }catch(_){} try{ clearBlast(); }catch(_){} try{ window.IntMapArc3D&&window.IntMapArc3D.hide(); }catch(_){} did.push(L('flight path','飛行経路','Flugbahn','траектория','trayectoria')); }
          if(wants(/lines?|polygons?|drawing|ライン|線|ポリゴン|描画|линии|líneas|polígono/)){ try{ clearLineHl(); clearPolyHl(); did.push(L('drawings','描画','Zeichnungen','рисунки','dibujos')); }catch(_){} }
          if(wants(/route|directions|経路|ルート|道順|путь|маршрут|ruta|weg|route/)){ try{ window.IntMapRouting&&window.IntMapRouting.clear&&window.IntMapRouting.clear(); did.push(L('route','経路','Route','маршрут','ruta')); }catch(_){} }
          if(wants(/radiation|fallout|dispersion|plume|放射|拡散|радиац|radiac/)){ try{ window.IntMapRadiation&&window.IntMapRadiation.clear&&window.IntMapRadiation.clear(); did.push(L('dispersion','拡散','Ausbreitung','рассеивание','dispersión')); }catch(_){} }
          if(wants(/elevation|sea ?level|標高|海抜|elevación|höhe|высот/)){ try{ clearElev(); did.push(L('elevation shading','標高ハイライト','Höhenschattierung','высотная заливка','sombreado de elevación')); }catch(_){} }
          if(wants(/faction|historical|alliance|power ?map|勢力|歴史|同盟|historisch|históric|историческ/)){ try{ clearFac(); did.push(L('historical map','歴史地図','historische Karte','историческая карта','mapa histórico')); }catch(_){} }
          /* (#R176) the three simulators this round added — each paints a raster, so each needs a way off */
          if(wants(/water|terrain ?edit|sculpt|levee|dam|水|流|地形編集|堤防|ダム|вод|дамб|agua|dique/)){ try{ if(window.IntMapTerrainWater&&window.IntMapTerrainWater.isOpen()){ window.IntMapTerrainWater.close(); did.push(L('terrain & water','地形編集・水流','Gelände & Wasser','рельеф и вода','terreno y agua')); } }catch(_){} }
          if(wants(/quake|seismic|earthquake|地震|震源|波|землетряс|сейсм|sismo|sísmic|beben/)){ try{ if(window.IntMapSeismic){ window.IntMapSeismic.close(); did.push(L('seismic waves','地震波','seismische Wellen','сейсмические волны','ondas sísmicas')); } }catch(_){} }
          if(wants(/sun|shad|shade|insolation|日照|日射|影|солн|тен|sol|sombra|sonne|schatten/)){ try{ if(window.IntMapInsolation) window.IntMapInsolation.clear(); if(window.IntMapSun) window.IntMapSun.close(); did.push(L('sun & shadow','日照・影','Sonne & Schatten','солнце и тень','sol y sombra')); }catch(_){} }
          if(wants(/sight|viewshed|coverage|見通し|視通|圏|видимост|visión|sicht/)){ try{ if(window.IntMapLOS) window.IntMapLOS.clear(); did.push(L('line of sight','見通し線','Sichtlinie','линия видимости','línea de visión')); }catch(_){} }
          if(!did.length) return R(false, warn('⚠ '+L('Nothing to clear for','消去対象がありません','Nichts zu löschen für','Нечего очищать','Nada que borrar')+': '+esc(w)));
          return R(true, note('✓ '+L('Cleared','消去','Gelöscht','Очищено','Borrado')+': '+did.join(', '))); }
        case 'fullscreen': { const want=!(a.on===false||/^(off|exit)$/i.test(String(a.mode||'')));
          try{ if(want){ if(!document.fullscreenElement&&document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); }
            else if(document.fullscreenElement&&document.exitFullscreen) await document.exitFullscreen();
            return R(true, note('✓ '+L('Fullscreen','全画面','Vollbild','Полный экран','Pantalla completa')+': '+(want?'on':'off'))+_featTogHtml('fullscreen')); }   /* (#R152) offer the fullscreen on/off switch */
          catch(_){ return R(false, warn('⚠ '+L('Fullscreen unavailable here','全画面にできませんでした','Vollbild nicht möglich','Полный экран недоступен','Pantalla completa no disponible'))); } }
        case 'locate': case 'myLocation': case 'whereAmI': { if(!navigator.geolocation) return R(false, warn('⚠ '+L('Geolocation unavailable','この環境では位置情報が使えません','Standort nicht verfügbar','Геолокация недоступна','Geolocalización no disponible')));
          /* (#R155) "求めればいいだけ": on a fresh session getCurrentPosition ASKS (the browser prompt). It
             is a browser rule that a HARD-DENIED site is never re-prompted — so rather than a dead-end,
             detect that state up front and tell the user exactly how to re-enable it. */
          let _pstate='prompt'; try{ if(navigator.permissions&&navigator.permissions.query){ const st=await navigator.permissions.query({name:'geolocation'}); _pstate=st.state; } }catch(_){}
          if(_pstate==='denied') return R(false, warn('⚠ '+L('Location is blocked for this site. Turn it on in your browser (tap the lock/permissions icon in the address bar), then ask me again.','この端末で位置情報がブロックされています。ブラウザで許可（アドレスバーの鍵アイコン→権限）してから、もう一度お尋ねください。','Der Standort ist für diese Seite blockiert. Erlaube ihn im Browser (Schloss-Symbol in der Adressleiste → Berechtigungen) und frag mich erneut.','Геолокация заблокирована для сайта. Включите её в браузере (значок замка в адресной строке → разрешения) и спросите снова.','La ubicación está bloqueada para este sitio. Actívala en el navegador (icono de candado en la barra → permisos) y vuelve a preguntar.')));
          return await new Promise(res=>{ let fin0=false; const fin=r2=>{ if(!fin0){ fin0=true; res(r2); } };
            try{ navigator.geolocation.getCurrentPosition(p2=>{ const lng=+p2.coords.longitude, lat=+p2.coords.latitude;
                try{ GE().camera.flyTo({center:[lng,lat],zoom:Math.max(GE().camera.getZoom(),11),duration:1100}); }catch(_){}
                /* (#R137) also drop the live accent dot + accuracy circle that follow the user */
                try{ window.IntMapLocate&&window.IntMapLocate.start({fly:false}); }catch(_){}
                try{ _lastPlace={lng,lat,name:L('my location','現在地','mein Standort','моё местоположение','mi ubicación')}; }catch(_){}
                fin(R(true, note(L('Current location','現在地','Aktueller Standort','Текущее местоположение','Ubicación actual')+' ('+lat.toFixed(3)+', '+lng.toFixed(3)+')')));
              }, err=>{ const denied=err&&err.code===1;   /* 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT */
                fin(R(false, warn('⚠ '+(denied
                  ? L('Location permission was denied. Re-enable it in your browser settings, then ask again.','位置情報の許可が拒否されました。ブラウザ設定で再度許可してから、もう一度お尋ねください。','Standortzugriff wurde verweigert. Aktiviere ihn in den Browsereinstellungen und frag erneut.','Доступ к геолокации отклонён. Включите его в настройках браузера и спросите снова.','Se denegó el permiso de ubicación. Vuelve a activarlo en el navegador y pregunta de nuevo.')
                  : L('Couldn\'t get your location — please try again.','位置情報を取得できませんでした。もう一度お試しください。','Standort konnte nicht ermittelt werden — bitte erneut versuchen.','Не удалось определить местоположение — повторите попытку.','No se pudo obtener tu ubicación: inténtalo de nuevo.')))));
              }, {enableHighAccuracy:true,timeout:25000,maximumAge:0});   /* (#R155) 9s→15s so the permission prompt has time to be answered; (#R170) high accuracy + no cached fix (a 2-min-old coarse fix could be a different city) — 25 s because a GPS cold start after the prompt genuinely takes that long */
            }catch(_){ fin(R(false, warn('⚠'))); }
            setTimeout(()=>fin(R(false, warn('⚠ '+L('Location timed out','位置情報の取得がタイムアウトしました','Standort-Timeout','Тайм-аут геолокации','Tiempo de ubicación agotado')))),28000); }); }   /* (#R170) must outlast the 25 s getCurrentPosition budget above, or this outer guard would report a timeout while the GPS was still converging */
        case 'poi': case 'mapPois': case 'facilities': { /* (#R62) "○○にある石油施設を表示して" → REAL facilities mapped from OpenStreetMap */
          const kindStr=String(a.kind||a.query||a.what||a.name||'').trim();
          if(!kindStr) return R(false, warn('⚠ '+L('What kind of facilities?','どんな施設を表示しますか？','Welche Einrichtungen?','Какие объекты?','¿Qué instalaciones?')));
          let box=null,pname='',areaRel=null,isoPoi=null; const placeStr2=String(a.place||'').trim();
          if(placeStr2&&!WORLD_RE.test(placeStr2)&&!DEIXIS_RE.test(placeStr2)){ let ext=null; try{ ext=await placeExtent(placeStr2); }catch(_){} if(!ext){ try{ ext=await geocode(placeStr2); }catch(_){} }
            if(!ext) return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(placeStr2)));
            pname=ext.name||placeStr2;
            /* (#R64) real admin area → search the WHOLE territory via an Overpass area query (fixes "ロシアの
               石油精製施設 → 一部地域だけ": the old 30°×24° bbox clamp cut most of a large country away). */
            const cSync=resolveCountrySync(placeStr2);
            if(cSync&&cSync.code) isoPoi=cSync.code;   /* (#R69) ISO3 → country-wide Wikidata query */
            if(ext.osmType==='relation'&&ext.osmId&&(ext.adminPoly||cSync)) areaRel=ext.osmId;
            else if(cSync){ try{ const e2=await _nomExtent(cSync.name||placeStr2); if(e2&&e2.osmType==='relation'&&e2.osmId){ areaRel=e2.osmId; if(e2.box&&_bboxOK(e2.box)) box=e2.box; } }catch(_){} }
            if(!box){ if(ext.box&&_bboxOK(ext.box)) box=ext.box; else if(ext.lng!=null&&isFinite(ext.lng)){ const d2=1.2; box=[[ext.lng-d2,ext.lat-d2*0.8],[ext.lng+d2,ext.lat+d2*0.8]]; } } }
          if(!box){ try{ const b2=GE().camera.getBounds(); box=[[b2.getWest(),b2.getSouth()],[b2.getEast(),b2.getNorth()]]; }catch(_){} pname=pname||L('the current view','現在の表示範囲','der aktuellen Ansicht','текущая область','la vista actual'); }
          if(!box) return R(false, warn('⚠'));
          /* clamp to a sane Overpass area ONLY for raw-bbox searches (area queries cover the full territory) */
          if(!areaRel){ const cx2=(box[0][0]+box[1][0])/2, cy2=(box[0][1]+box[1][1])/2; const sx2=Math.min(30,box[1][0]-box[0][0])||1, sy2=Math.min(24,box[1][1]-box[0][1])||1; box=[[cx2-sx2/2,cy2-sy2/2],[cx2+sx2/2,cy2+sy2/2]]; }
          if(a.color!=null&&String(a.color).trim()!==''){ const pc3=parseColor(a.color); if(pc3) _poiColor=pc3; }
          /* (#R63/#R64) staged search: full area/bbox Overpass union → lite retry (2 selectors, 60 s) → bbox
             fallback if the area query failed → AI-known facilities.
             (#R69) Wikidata runs in PARALLEL as an independent second source and is merged in. */
          const wdP=wikidataPOIs(kindStr,box,isoPoi);
          let res=await overpassPOIs(kindStr,box,false,areaRel);
          if(res===null) res=await overpassPOIs(kindStr,box,true,areaRel);
          if(res===null&&areaRel) res=await overpassPOIs(kindStr,box,true,null);
          let wd=null; try{ wd=await wdP; }catch(_){}
          const osmN=(res&&res.length)||0; let wdN=0;
          if(wd&&wd.length){
            const normN=s2=>{ try{ return String(s2||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,''); }catch(_){ return String(s2||'').toLowerCase().replace(/\W+/g,''); } };
            const have=new Set((res||[]).map(p2=>normN(p2.name)).filter(Boolean));
            const merged=(res||[]).slice();
            for(const w of wd){ const nw=normN(w.name);
              if(nw&&have.has(nw)) continue;                                                    /* same facility, same name */
              if(merged.some(p2=>Math.abs(p2.lat-w.lat)<0.02&&Math.abs(p2.lng-w.lng)<0.03)) continue;   /* same site ~2 km */
              merged.push(w); have.add(nw); wdN++; }
            res=merged;
          }
          let aiUsed=false;
          if(!res||!res.length){ try{ const aiL=await aiFacilities(kindStr,pname,box); if(aiL&&aiL.length){ res=aiL; aiUsed=true; } }catch(_){} }
          if(res===null) return R(false, warn('⚠ '+L('Facility search failed (OpenStreetMap Overpass busy, Wikidata had no match) — try again shortly','施設検索に失敗しました（Overpass混雑・Wikidataにも該当なし）。少し待って再試行してください','Suche fehlgeschlagen (Overpass ausgelastet, Wikidata ohne Treffer) — später erneut','Поиск не удался (Overpass занят, в Wikidata нет совпадений) — попробуйте позже','Búsqueda fallida (Overpass ocupado, sin coincidencias en Wikidata) — reintenta luego')));
          clearPois(); _pois=res; let okP=paintPois();
          for(let i2=0;i2<6&&!okP;i2++){ await new Promise(r2=>setTimeout(r2,700)); okP=paintPois(); }
          try{ flyToBox(box); }catch(_){}
          if(!okP) return R(false, warn('⚠ '+L('Could not draw the markers (map still loading) — try again','マーカーを描画できませんでした（地図読込中）。もう一度お試しください','Marker konnten nicht gezeichnet werden (Karte lädt)','Не удалось отрисовать маркеры (карта загружается)','No se pudieron dibujar los marcadores (mapa cargando)')));
          if(!res.length) return R(true, note('◌ '+L('Nothing found — neither OpenStreetMap nor Wikidata has such facilities recorded here and the AI knows none it is sure of','見つかりませんでした — OpenStreetMapにもWikidataにも該当がなく、AIも確実な施設を知りません','Nichts gefunden — weder in OpenStreetMap noch Wikidata erfasst, KI kennt keine sicheren','Ничего не найдено — нет ни в OpenStreetMap, ни в Wikidata; ИИ также не уверен','Nada encontrado — ni en OpenStreetMap ni en Wikidata, y la IA no conoce ninguno con certeza')+' ("'+esc(kindStr)+'" @ '+esc(pname)+')'));
          const names5=res.filter(p=>p.name).slice(0,5).map(p=>esc(p.name)).join(' · ');
          /* (#R64) state the BASIS explicitly ("何の根拠に選んでいるのかもわからない"): what was searched, over
             what area, and whether the result set is complete or capped. */
          const areaTxt=areaRel||isoPoi
            ?L('the whole territory of '+pname,pname+'の全域','das gesamte Gebiet von '+pname,'вся территория: '+pname,'todo el territorio de '+pname)
            :L('the shown search box','表示範囲のボックス','der gezeigte Suchbereich','показанная область поиска','el área mostrada');
          /* (#R69) per-source counts — OSM live tags + Wikidata curated entities ("何の根拠に選んでいるのか").
             wd===null → the Wikidata query itself failed/didn't apply; wdN counts only NON-duplicate additions. */
          const wdTxt=(wd===null)
            ?L('Wikidata n/a','Wikidata照会なし','Wikidata n. v.','Wikidata недоступна','Wikidata no disponible')
            :L('Wikidata +'+wdN+' additional','Wikidata追加 '+wdN+'件','Wikidata +'+wdN+' zusätzlich','Wikidata +'+wdN,'Wikidata +'+wdN+' adicionales');
          const scopeTxt=L('OpenStreetMap tags ('+osmN+') + '+wdTxt+' across '+areaTxt,'OpenStreetMapの登録施設 '+osmN+'件 + '+wdTxt+'（検索範囲: '+areaTxt+'）','OpenStreetMap-Tags ('+osmN+') + '+wdTxt+' in '+areaTxt,'теги OpenStreetMap ('+osmN+') + '+wdTxt+' — '+areaTxt,'etiquetas de OpenStreetMap ('+osmN+') + '+wdTxt+' en '+areaTxt);
          const truncTxt=(res._truncated)?('<br>'+L('⚠ Capped at 600 results — zoom into a sub-region for the rest','⚠ 600件で打ち切り — 残りは範囲を絞って再検索してください','⚠ Bei 600 Ergebnissen gekappt — Region eingrenzen für den Rest','⚠ Ограничено 600 результатами — сузьте область','⚠ Limitado a 600 — acota la zona para ver el resto')):'';
          const srcTxt=aiUsed
            ?L('Source: AI-estimated (neither OpenStreetMap nor Wikidata had matching entries here — positions are approximate, verify before relying on them)','出典: AI推定（OpenStreetMapにもWikidataにも該当が無かったため。位置は概算です — 重要な用途では確認してください）','Quelle: KI-Schätzung (weder OSM- noch Wikidata-Treffer — Positionen ungefähr)','Источник: оценка ИИ (нет ни в OSM, ни в Wikidata — координаты приблизительны)','Fuente: estimación de IA (sin coincidencias en OSM ni Wikidata — posiciones aproximadas)')
            :(L('Basis','根拠','Basis','Основание','Base')+': '+scopeTxt+' · '+L('click a pin for details · say "clear facilities" to remove','ピンをクリックで詳細 ·「施設を消して」で削除','Pin anklicken für Details','клик по метке — детали','clic en un pin para detalles'));
          return R(true, note('📌 '+res.length+' '+L('facilities mapped','件の施設をマッピングしました','Einrichtungen kartiert','объектов нанесено на карту','instalaciones mapeadas')+' — '+esc(kindStr)+' @ '+esc(pname)+(names5?('<br>'+names5+(res.length>5?' …':'')):'')+truncTxt+'<br><span style="opacity:0.75;">'+srcTxt+'</span>')); }
        case 'mapReport': case 'newsMap': case 'reportMap': { /* (#R72) research mapped ONTO the map ("地図上にまとめて" /
          "銃犯罪を調べて→地図上にマッピングし、そこから簡易的な説明やニュース記事にアクセス"): live web/news evidence
          → AI geolocates the concrete events/places → pins with an AI summary + article link in each popup. */
          const topic=String(a.topic||a.question||a.query||'').trim();
          if(!topic) return R(false, warn('⚠ '+L('What should I map?','何を地図にまとめますか？','Was soll kartiert werden?','Что нанести на карту?','¿Qué mapeo?')));
          /* (#R74) requested item count ("10件表示してといったところ、10件ですと言って7件しか出なかった"):
             honour an explicit N — from the action's "count" or parsed out of the topic/last message. */
          let wantN=null; try{ if(a.count!=null&&isFinite(+a.count)) wantN=Math.max(1,Math.min(20,Math.round(+a.count)));
            if(wantN==null){ const cm=(topic+' '+String(_lastUserMsg||'')).match(/(\d{1,2})\s*(?:件|事例|例|个|つ|カ所|か所|箇所)|(?:top|first|last)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:incidents?|cases?|events?|items?|examples?|shootings?|attacks?)/i);
              if(cm){ const nv=+(cm[1]||cm[2]||cm[3]); if(isFinite(nv)&&nv>=1&&nv<=20) wantN=nv; } } }catch(_){}
          let ctx=null; const plc=String(a.place||'').trim();
          if(plc&&!WORLD_RE.test(plc)){ try{ ctx=await placeExtent(plc); }catch(_){} if(!ctx){ try{ ctx=await geocode(plc); }catch(_){} } }
          /* (#R113) EVIDENCE-BASED, NO web-search tool. IntMap gathers the evidence (GDELT + Google News + loaded
             IntMap news), normalises it into ID'd records, and Gemini 3.5 Flash Low only CLASSIFIES/SUMMARISES it +
             names the place — it does NOT search, invent coordinates, or invent URLs/sources. Coordinates come from
             the cited evidence's known location or IntMap's geocoder; url/source/date come from the cited evidence. */
          const langR=_langLine();
          const evSink=[]; const evJobs=[];
          evJobs.push(_gdeltNews(topic,evSink).catch(()=>{}));
          evJobs.push(_gnewsNews(topic,evSink).catch(()=>{}));
          try{ _newsData(ctx,topic,evSink); }catch(_){}
          await Promise.all(evJobs);
          /* dedupe by URL, assign stable evidence IDs (e1, e2, …), cap the set. */
          const evidence=[]; const _seenU=new Set(); const evById={};
          for(const r of evSink){ if(!r||!r.title) continue; const u=String(r.url||''); if(u&&_seenU.has(u)) continue; if(u) _seenU.add(u);
            const rec={id:'e'+(evidence.length+1),title:String(r.title).slice(0,180),source:String(r.src||'').slice(0,60),url:u,date:String(r.date||''),loc:(r.loc&&isFinite(+r.loc[0])?[+r.loc[0],+r.loc[1]]:null),place:String(r.place||'').slice(0,80)};
            evidence.push(rec); evById[rec.id]=rec; if(evidence.length>=40) break; }
          if(!evidence.length) return R(false, warn('⚠ '+L('No live news evidence could be gathered for this topic right now — nothing was invented. Try a broader topic or again shortly.','このトピックのライブニュース証拠を取得できませんでした（創作はしていません）。トピックを広げるか、少し後に再試行してください。','Keine Live-Nachrichten-Belege gefunden — nichts erfunden. Breiteres Thema oder später erneut.','Не удалось собрать доказательства из новостей — ничего не выдумано. Расширьте тему или повторите позже.','No se pudieron reunir evidencias de noticias — nada inventado. Prueba un tema más amplio o reintenta.')), {meta:{code:'NO_LIVE_EVIDENCE',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const evBlock=evidence.map(e=>'['+e.id+'] '+e.title+(e.source?(' — '+e.source):'')+(e.date?(' ('+e.date+')'):'')+(e.place?(' — reported location: '+e.place):'')+(e.url?('\n     url: '+e.url):'')).join('\n');
          /* (#R113 §12.3) separate the REAL current date from the map's time-travel date. */
          const _nowISO=new Date().toISOString().slice(0,10);
          let _mapISO=_nowISO; try{ if(window.IntMapTime&&window.IntMapTime.when){ const w=window.IntMapTime.when(); if(w) _mapISO=new Date(w).toISOString().slice(0,10); } }catch(_){}
          const dateLine='The real current date is '+_nowISO+'.'+((_mapISO&&_mapISO!==_nowISO)?(' The map is time-traveled to '+_mapISO+'; treat "as of" as '+_mapISO+', but the real current date is still '+_nowISO+' (never call '+_nowISO+' a future date).'):'');
          const sysR=personaPrompt('the research-mapping engine of the IntMap world map')/* (#R285) */+dateLine+' No web-search or function-calling tool is attached to this request — do NOT call tools or functions, and do NOT search the web. The action/type names elsewhere are plain data, not callable functions. Use ONLY the evidence records provided below. Return STRICT JSON only (no prose, no code fence): {"title":str,"overview":str,"items":[{"name":str,"locationName":str,"country":str,"summary":str,"date":"YYYY-MM-DD"|null,"evidenceIds":[str,...]}]}. HARD RULES: each item = ONE concrete, real OCCURRENCE or ENTITY that the evidence supports — for incident topics that means ONE specific incident (what happened, where, when, figures if reported). Every item MUST cite at least one evidenceId (e.g. "e3") from the evidence below; do NOT invent incidents, dates, casualties, place names, sources or URLs that are not in the evidence. Do NOT merge separate incidents into one item unless the evidence explicitly says they are the same incident. Give "locationName" (the specific city/place the evidence indicates) and "country" — do NOT output coordinates; the app resolves the real position from locationName + country. "summary" = 1-2 factual sentences in '+langR+' using only evidence details (date, actors, figures). "date" = the incident date if the evidence gives one, else null. NEVER emit region-level generalities, statistics-as-items, or trends as items. If the evidence supports fewer items than requested, return only those it supports — an EMPTY items array is preferable to a fabricated or generalised item. NEVER state an item count in the title or overview. "overview" = 2-4 sentence synthesis in '+langR+' (patterns are allowed in the overview, never in the items). "title" in '+langR+'.'
            +(wantN?(' The user asked for up to '+wantN+' items — return that many ONLY if the evidence genuinely supports that many distinct real ones.'):'')
            +(ctx&&isFinite(ctx.lng)?(' Focus area: '+(ctx.name||plc)+'.'):'');
          let jr=null; try{ jr=aiParseJSON(await askAI('[TOPIC]\n'+topic+'\n\n[EVIDENCE RECORDS — cite these ids in evidenceIds; use ONLY these, do not go beyond them]\n'+evBlock,sysR,null,{task:'map_report',webMode:'off',requestedCount:(wantN||undefined)})); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          /* validate: keep only items that cite a REAL evidence id and name a place (no fabricated evidenceIds). */
          let raw=(jr&&Array.isArray(jr.items))?jr.items.filter(it=>it&&it.name&&it.locationName&&Array.isArray(it.evidenceIds)&&it.evidenceIds.some(id=>evById[id])):[];
          if(wantN&&raw.length>wantN) raw=raw.slice(0,wantN);
          /* resolve coordinates OUTSIDE the model: cited evidence's known location first, else IntMap geocode of
             locationName + country. Items whose position can't be verified are shown in the list but NOT pinned. */
          const _seenXY=[]; const items=[];
          for(const it of raw){ const cites=it.evidenceIds.filter(id=>evById[id]).map(id=>evById[id]);
            let lng=null,lat=null; const withLoc=cites.find(e=>e.loc); if(withLoc){ lng=+withLoc.loc[0]; lat=+withLoc.loc[1]; }
            if(lng==null){ const qn=[String(it.locationName||'').trim(),String(it.country||'').trim()].filter(Boolean).join(', ');
              let g=null; try{ g=await geocode(qn); }catch(_){} if(!g&&it.locationName){ try{ g=await geocode(String(it.locationName).trim()); }catch(_){} }
              if(g&&isFinite(+g.lng)){ lng=+g.lng; lat=+g.lat; } }
            const mappable=(lng!=null&&isFinite(lng)&&isFinite(lat)&&Math.abs(lat)<=90&&Math.abs(lng)<=180);
            if(mappable&&_seenXY.some(p=>Math.abs(p[0]-lng)<0.02&&Math.abs(p[1]-lat)<0.02)) continue;   /* dedupe same spot */
            if(mappable) _seenXY.push([lng,lat]);
            const first=cites[0];
            items.push({ name:String(it.name).slice(0,90), locationName:String(it.locationName||''), country:String(it.country||''),
              summary:String(it.summary||'').slice(0,400), date:(/^\d{4}-\d{2}-\d{2}$/.test(String(it.date||''))?String(it.date):(first&&first.date||'')),
              lng, lat, mappable, url:(first&&/^https?:\/\//i.test(first.url)?first.url.slice(0,300):''), src:(first?String(first.source||'').slice(0,40):'') }); }
          if(!items.length) return R(false, warn('⚠ '+L('The evidence did not support any concrete mappable items — nothing was invented','証拠から具体的にマッピングできる項目は得られませんでした（創作はしていません）','Die Belege ergaben keine konkreten kartierbaren Einträge — nichts erfunden','Доказательства не дали конкретных объектов для карты — ничего не выдумано','La evidencia no dio elementos mapeables concretos — nada inventado')), {meta:{code:'NO_MAPPABLE_ITEMS',category:'evidence',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const mappableItems=items.filter(i=>i.mappable); const unmappable=items.length-mappableItems.length;
          clearPois();
          _pois=mappableItems.map(it=>({lng:+it.lng,lat:+it.lat,name:String(it.name).slice(0,90),kind:[it.date,it.src].filter(Boolean).join(' · ').slice(0,60),
            sum:String(it.summary||''),url:it.url,src:it.src}));
          let okR=paintPois(); for(let i2=0;i2<6&&!okR&&_pois.length;i2++){ await new Promise(r2=>setTimeout(r2,700)); okR=paintPois(); }
          try{ if(_pois.length){ let a2=180,b2=90,c2=-180,d2=-90; _pois.forEach(p=>{ a2=Math.min(a2,p.lng);b2=Math.min(b2,p.lat);c2=Math.max(c2,p.lng);d2=Math.max(d2,p.lat); });
            if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:90,maxZoom:9,duration:1100}); } }catch(_){}
          const listHtml2=items.map((p,i)=>{ const mi=p.mappable?mappableItems.indexOf(p):-1; const pu=_atlCleanUrl(p.url); return '<div class="atl-rp-item"'+(mi>=0?(' data-i="'+mi+'"'):'')+' style="display:flex;gap:7px;align-items:baseline;padding:4px 0;border-top:1px solid rgba(128,128,128,0.12);'+(mi>=0?'cursor:pointer;':'')+'"><span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:'+(p.mappable?(_poiColor||'#ff453a'):'rgba(128,128,128,0.5)')+';position:relative;top:-1px;"></span><span style="flex:1;min-width:0;"><span style="font-weight:600;font-size:12px;">'+esc(p.name)+'</span>'+((p.date||p.src)?' <span style="font-size:10px;color:var(--text-muted);">'+esc([p.date,p.src].filter(Boolean).join(' · '))+'</span>':'')+(p.summary?'<br><span style="font-size:11px;line-height:1.5;color:var(--text-main);opacity:0.9;">'+esc(p.summary.length>150?p.summary.slice(0,150)+'…':p.summary)+'</span>':'')+(pu?' <a href="'+esc(pu.url)+'" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--primary-color);text-decoration:none;">'+L('article','記事','Artikel','статья','artículo')+' ↗</a>':'')   /* (#R153) inline evidence link goes through _atlCleanUrl too (decode GNews aggregator → real article, drop SNS) — was raw p.url, the "無関係リンク／SNS" leak */+(!p.mappable?' <span style="font-size:9.5px;color:var(--text-muted);">('+L('location unverified','位置未確認','Ort unbestätigt','место не подтв.','ubicación no verif.')+')</span>':'')+'</span></div>'; }).join('');
          return R(true,'<div style="font-weight:600;margin:2px 0 4px;">'+esc(jr.title||topic)+'</div>'
            +(jr.overview?'<div style="font-size:12.5px;line-height:1.6;margin-bottom:6px;">'+esc(jr.overview)+'</div>':'')
            +'<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">📌 '+_pois.length+' '+L('points mapped — click a pin (or an item below) for the summary & article','地点をマッピングしました — ピンまたは下の項目をクリックすると要約と記事を開けます','Punkte kartiert — Pin anklicken für Zusammenfassung & Artikel','точек на карте — клик по метке открывает сводку и статью','puntos mapeados — clic en un pin para el resumen y artículo')+'</div>'
            +((wantN&&items.length<wantN)?('<div style="font-size:11px;color:#ff9f0a;font-weight:600;margin:2px 0 4px;">⚠ '+L('You asked for '+wantN+' — the gathered evidence only supported '+items.length+' real item(s); nothing was padded with generalities','要求は'+wantN+'件でしたが、収集した証拠で裏付けられたのは'+items.length+'件のみです（一般論での水増しはしていません）','Angefragt: '+wantN+' — die Belege stützten nur '+items.length+' echte(n) Eintrag/Einträge','Запрошено '+wantN+' — доказательства подтвердили только '+items.length+' реальн.','Pediste '+wantN+' — la evidencia solo respaldó '+items.length+' elemento(s) reales')+'</div>'):'')
            +(unmappable?('<div style="font-size:10.5px;color:var(--text-muted);margin:1px 0 3px;">'+L(unmappable+' item(s) had no verifiable location and are listed without a pin.',unmappable+'件は位置を確認できず、ピンなしで一覧のみ表示しています。',unmappable+' Eintrag/Einträge ohne bestätigten Ort — nur gelistet.',unmappable+' без подтверждённого места — только в списке.',unmappable+' sin ubicación verificable — solo en la lista.')+'</div>'):'')
            +listHtml2
            +linkCards(items.filter(p=>p.url).map(p=>({url:p.url,title:p.name,src:p.src})))   /* (#R74) article cards (ChatGPT-style) */
            +note(L('Mapped from IntMap-gathered news evidence (GDELT + Google News + loaded news); positions are city-level — verify important facts.','IntMapが収集したニュース証拠（GDELT＋Google News＋読み込み済みニュース）に基づきます。位置は都市レベルの精度です — 重要な事実は確認してください。','Aus von IntMap gesammelten Nachrichtenbelegen (GDELT + Google News + geladene News); Positionen auf Stadtebene — wichtige Fakten prüfen.','На основе собранных IntMap новостных доказательств (GDELT + Google News + загруженные новости); позиции с точностью до города — проверяйте факты.','A partir de evidencias de noticias reunidas por IntMap (GDELT + Google News + noticias cargadas); posiciones a nivel de ciudad — verifica los datos.')), {meta:{code:'OK',category:'ok',retryable:false,semanticTarget:_lnorm(topic),temporalMode:'current',produced:['explanation','map'],userGoalSatisfied:true}}); }
        case 'researchMap': case 'research_map': case 'situationMap': {
          /* (#R135) GENERAL research-onto-the-map action for HISTORICAL / CURRENT / MIXED questions — the text answer
             and the map are produced INDEPENDENTLY (§11): the explanation is returned even when the map cannot be
             drawn (a sea/gulf with no polygon still frames its bbox/centre and pins the related places). Evidence is
             switched by mode (§6): historical = established history + Wikipedia, NOT live news; current = live news;
             mixed = both, separated. The model never outputs coordinates — locationName+country resolve client-side. */
          const topic=String(a.topic||a.question||a.query||'').trim();
          const place=String(a.place||a.region||a.location||'').trim();
          if(!topic&&!place) return R(false, warn('⚠ '+L('What should I research and map?','何を調べて地図に示しますか？','Was recherchieren & kartieren?','Что исследовать и нанести на карту?','¿Qué investigo y mapeo?')), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,userGoalSatisfied:false,produced:[]}});
          let live=true; try{ if(window.IntMapTime) live=window.IntMapTime.isLive(); }catch(_){}
          let mode=String(a.temporalMode||a.temporal||'').toLowerCase(); if(!/^(historical|current|mixed)$/.test(mode)) mode=(!live?'historical':'current');
          let year=(a.year!=null&&isFinite(+a.year))?Math.round(+a.year):null;
          if(year==null&&mode!=='current'){ try{ if(window.IntMapTime&&!live) year=window.IntMapTime.year(); }catch(_){} }
          if(mode==='current') year=null;
          let evid=String(a.evidenceMode||'').toLowerCase(); if(!/^(historical|live|mixed)$/.test(evid)) evid=(mode==='historical'?'historical':mode==='mixed'?'mixed':'live');
          const semTarget=_lnorm(place||topic);
          /* 1) TEXT (independent of the map) */
          const research=await _buildResearchAnswer({topic,place,mode,year,evid});
          /* 2) MAP (independent, non-fatal) */
          let mapRes={rendered:false,method:'',name:(place||topic),pinCount:0,hasExtent:false,pinIdx:[]};
          try{ mapRes=await _tryMapResearch(place||topic, research.items, {mode,year}); }catch(_){}
          /* 3) compose — the explanation ALWAYS wins; the map is reported honestly (§11/§13) */
          if(!research.ok){
            if(mapRes.rendered) return R(true, note('🗺 '+esc(mapRes.name)+' — '+L('shown on the map. I could not compile a written summary this time — try rephrasing the question.','を地図に表示しました。今回は文章の要約を作成できませんでした。質問を言い換えてお試しください。','auf der Karte gezeigt. Konnte diesmal keine Textzusammenfassung erstellen.','показано на карте. На этот раз не удалось составить текстовую сводку.','mostrado en el mapa. No pude redactar un resumen esta vez.')), {meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:['map'],userGoalSatisfied:false}});
            return R(false, warn('⚠ '+esc(research.error||L('Could not research this right now','今回は調べられませんでした','Konnte das gerade nicht recherchieren','Не удалось исследовать сейчас','No se pudo investigar ahora'))), {meta:{code:(evid==='live'?'NO_LIVE_EVIDENCE':'NO_HISTORICAL_EVIDENCE'),category:'evidence',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:[],userGoalSatisfied:false}});
          }
          /* (#R231) 「返答の最初にその地名だけ…やらなくていい」 — a "title" that is only the place the
             user just typed is dropped. ⚠ EQUALITY, NEVER CONTAINMENT: "Okhotsk in 1905" is a real
             title and stays. The temporal basis survives on its own line. */
          const _bare=(s)=>String(s||'').replace(/[\s:：・.,、。()（）"'“”「」]/g,'').toLowerCase();
          const _tt=String(research.title||'').trim();
          const _titleIsJustThePlace=!!_tt&&(_bare(_tt)===_bare(place)||_bare(_tt)===_bare(topic));
          let h='';
          if(_tt&&!_titleIsJustThePlace){
            h='<div style="font-weight:600;margin:2px 0 4px;">'+esc(_tt)+(research.temporalBasis?(' <span style="font-size:10.5px;color:var(--text-muted);font-weight:500;">· '+esc(research.temporalBasis)+'</span>'):'')+'</div>';
          } else if(research.temporalBasis){
            h='<div style="font-size:10.5px;color:var(--text-muted);margin:2px 0 4px;">'+esc(research.temporalBasis)+'</div>';
          }
          h+='<div style="font-size:14px;line-height:1.68;margin-bottom:6px;">'+mdMini(research.explanation)+'</div>';
          if(mapRes.rendered){ const ml=mapRes.pinCount?L(mapRes.pinCount+' related place(s) shown on the map',mapRes.pinCount+'件の関連地点を地図に表示しました',mapRes.pinCount+' zugehörige Orte auf der Karte',mapRes.pinCount+' связанных мест на карте',mapRes.pinCount+' lugares relacionados en el mapa'):(mapRes.method==='bbox'?L('Framed the area on the map','対象範囲を地図に表示しました','Gebiet auf der Karte eingerahmt','Область показана на карте','Área enmarcada en el mapa'):L('Centered the map on the location','地図を対象地点に移動しました','Karte auf den Ort zentriert','Карта отцентрирована','Mapa centrado en el lugar'));
            h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">🗺 '+esc(ml)+((!mapRes.hasExtent&&mapRes.pinCount)?(' · '+L('the region outline was not available, so related places are shown as points','海域・地域の輪郭は取得できなかったため関連地点を表示','Regionsumriss nicht verfügbar — Punkte stattdessen','контур недоступен — показаны точки','sin contorno — se muestran puntos')):'')+'</div>'; }
          else h+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:2px;">🗺 '+L('The map view could not be updated for this, but the explanation above stands.','この件では地図表示を更新できませんでしたが、上の説明は有効です。','Kartenansicht nicht aktualisierbar — die Erklärung oben gilt.','Не удалось обновить карту — пояснение выше остаётся в силе.','No se pudo actualizar el mapa, pero la explicación anterior es válida.')+'</div>';
          if(research.items&&research.items.length){ h+='<div style="font-size:11.5px;color:var(--text-muted);margin:5px 0 2px;font-weight:600;">'+L('Related places','関連地点','Zugehörige Orte','Связанные места','Lugares relacionados')+'</div>';
            h+=research.items.map((it,i)=>{ const mi=(mapRes.pinIdx&&mapRes.pinIdx[i]!=null)?mapRes.pinIdx[i]:-1; return '<div class="atl-rp-item"'+(mi>=0?(' data-i="'+mi+'"'):'')+' style="display:flex;gap:7px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.12);'+(mi>=0?'cursor:pointer;':'')+'"><span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:'+((mi>=0)?(_poiColor||'#ff453a'):'rgba(128,128,128,0.5)')+';position:relative;top:-1px;"></span><span style="flex:1;min-width:0;"><span style="font-weight:600;font-size:12px;">'+esc(it.name)+'</span>'+(it.dateOrPeriod?' <span style="font-size:10px;color:var(--text-muted);">'+esc(it.dateOrPeriod)+'</span>':'')+(it.summary?'<br><span style="font-size:11px;line-height:1.5;opacity:0.9;">'+esc(it.summary)+'</span>':'')+'</span></div>'; }).join(''); }
          if(research.limitations&&research.limitations.length) h+=note(L('Note','注記','Hinweis','Примечание','Nota')+': '+esc(research.limitations.join(' · ')));
          h+=note(mode==='historical'?L('Historical overview from established sources — borders and figures are approximate.','歴史的知見に基づく概説です。国境や数値は概略です。','Historischer Überblick aus etablierten Quellen — Grenzen/Zahlen näherungsweise.','Исторический обзор по установленным источникам — границы и цифры приблизительны.','Panorama histórico de fuentes establecidas — fronteras y cifras aproximadas.'):(mode==='mixed'?L('Combines a historical overview with current live-news evidence.','歴史的概説と現在のライブニュース証拠を組み合わせています。','Kombiniert historischen Überblick mit aktuellen Live-Nachrichten.','Сочетает исторический обзор с текущими новостями.','Combina un panorama histórico con noticias en vivo actuales.'):L('Compiled from current live-news evidence IntMap gathered.','IntMapが収集した現在のライブニュース証拠に基づきます。','Aus aktuellen Live-Nachrichten von IntMap.','На основе собранных IntMap текущих новостей.','A partir de noticias en vivo reunidas por IntMap.')));
          return R(true, h, {meta:{code:'OK',category:'ok',retryable:false,semanticTarget:semTarget,temporalMode:mode,produced:(mapRes.rendered?['explanation','map']:['explanation']),userGoalSatisfied:true,geographicRelevance:(mapRes.rendered?1:0.5),temporalMatch:true}}); }
        case 'missile': case 'ballistic': case 'ballisticMissile': case 'strike': case 'icbm': {
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
          _lastMissileCtx={from:a.from,to:(a.to||a.place||a.target),missile:(a.missile||a.weapon||a.name||''),yieldKt:(a.yield!=null?+a.yield:((a.blast||a.warhead||a.nuclear)&&cls?cls.yield:0)),marv};
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
        case 'elevationBelow': case 'belowSeaLevel': case 'elevationHighlight': case 'elevationScan': {
          clearElev();
          const place=String(a.place||a.region||a.around||a.country||'').trim();
          let ext=null; if(place&&!WORLD_RE.test(place)){ try{ ext=await placeExtent(place); }catch(_){} if(!ext){ try{ ext=await geocode(place); }catch(_){} } }
          let box=null; if(ext&&ext.box){ const bx=ext.box; if(Array.isArray(bx[0])) box=[[+bx[0][0],+bx[0][1]],[+bx[1][0],+bx[1][1]]]; else if(bx.length===4) box=[[+bx[0],+bx[1]],[+bx[2],+bx[3]]]; }
          if(!box&&ext&&isFinite(ext.lng)){ const d=(a.km!=null&&isFinite(+a.km))?(+a.km/111):3; box=[[ext.lng-d*1.5,Math.max(-84,ext.lat-d)],[ext.lng+d*1.5,Math.min(84,ext.lat+d)]]; }
          if(!box){ try{ const b=GE().camera.getBounds(); box=[[b.getWest(),b.getSouth()],[b.getEast(),b.getNorth()]]; }catch(_){} }
          if(!box) return R(false, warn('⚠ '+L('Which area should I scan?','どの範囲を調べますか？','Welches Gebiet?','Какую область?','¿Qué área?')));
          const spanX=Math.abs(box[1][0]-box[0][0]); if(spanX>64){ const cx=(box[0][0]+box[1][0])/2; box[0][0]=cx-32; box[1][0]=cx+32; }
          const thr=(a.threshold!=null&&isFinite(+a.threshold))?+a.threshold:(a.meters!=null&&isFinite(+a.meters)?+a.meters:0);
          const above=(a.above===true||/above|以上|higher|超え|over/i.test(String(a.mode||a.dir||'')));
          const grid=await elevGrid(box,850); const hw=grid.dx/2, hh=grid.dy/2;
          const feats=[]; let cnt=0,mn=1e9,mx=-1e9;
          grid.pts.forEach(p=>{ if(p.el==null) return; const hit=above?(p.el>=thr):(p.el<=thr); if(!hit) return; cnt++; mn=Math.min(mn,p.el); mx=Math.max(mx,p.el);
            const col=above?_mixc('#ffe08a','#7a1500',Math.min(1,(p.el-thr)/2500)):_mixc('#7fc8ff','#001a4a',Math.min(1,(thr-p.el)/150));
            feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[p.lng-hw,p.lat-hh],[p.lng+hw,p.lat-hh],[p.lng+hw,p.lat+hh],[p.lng-hw,p.lat+hh],[p.lng-hw,p.lat-hh]]]},properties:{color:col}}); });
          if(!cnt) return R(false, warn('⚠ '+L('No sampled points '+(above?'above':'below')+' '+thr+' m in this area','この範囲に'+thr+'m'+(above?'以上':'以下')+'の地点は見つかりませんでした','Keine Punkte '+(above?'über':'unter')+' '+thr+' m in diesem Gebiet','Нет точек '+(above?'выше':'ниже')+' '+thr+' м в этой области','Sin puntos '+(above?'sobre':'bajo')+' '+thr+' m')));
          ensureElevLayers(); try{ GE().layers.setSourceData('nlq-elev-src',{type:'FeatureCollection',features:feats}); }catch(_){}
          try{ GE().camera.fitBounds(box,{padding:50,duration:900}); }catch(_){}
          return R(true, note('🌊 '+esc((ext&&ext.name)||place||L('current view','現在の表示','aktuelle Ansicht','текущий вид','vista actual'))+' — '+cnt+' '+L('points','地点','Punkte','точек','puntos')+' '+(above?'≥':'≤')+' '+thr+' m · '+L('lowest','最低','tiefster','минимум','mínimo')+' '+Math.round(mn)+' m'+(above?(' · '+L('highest','最高','höchster','максимум','máximo')+' '+Math.round(mx)+' m'):''))
            +note(L('Elevation sampled live on a grid from the Copernicus DEM (Open-Meteo) — cells are graduated by depth/height.','標高はCopernicus DEM（Open-Meteo）からグリッド状にライブ取得。セルの濃淡は深さ・高さに応じた段階表示です。','Höhen live vom Copernicus-DEM (Open-Meteo) im Raster.','Высоты в реальном времени из Copernicus DEM (Open-Meteo) по сетке.','Elevación en vivo del DEM Copernicus (Open-Meteo).'))); }
        case 'historicalMap': case 'historical': case 'powerMap': case 'allianceMap': {
          clearFac();
          const era=String(a.era||a.date||a.title||a.topic||a.question||a.place||'').trim();
          const key=histMatch(era)||histMatch(a.question||'');
          if(key&&HIST_SCENARIOS[key]){ const sc=HIST_SCENARIOS[key]; const n=paintFactions(sc.factions);
            for(let i2=0;i2<6&&!n;i2++){ await new Promise(r2=>setTimeout(r2,600)); if(paintFactions(sc.factions)) break; }
            try{ GE().camera.flyTo({center:[18,32],zoom:1.6,duration:1000}); }catch(_){}
            let h='<div style="font-weight:600;margin:2px 0 5px;">'+esc(sc.title)+'</div>'
              +'<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">'+sc.factions.map(f=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;background:'+f.color+';display:inline-block;flex:0 0 auto;"></span><span>'+esc(f.name)+'</span> <span style="color:var(--text-muted);font-size:10.5px;">('+f.codes.length+')</span></div>').join('')+'</div>'
              +note(sc.note);
            return R(paintFactions(sc.factions)>0, h); }
          /* fallback: build the faction set for ANY era via AI, then paint onto modern borders */
          const sysH=personaPrompt('working here as the historical-geography engine of the IntMap world map')/* (#R285) was "a historical-geography engine" — a third character */+'Build a political/alliance map for the exact historical moment the user names. Output ONLY strict JSON (no prose/fence): {"title":str,"factions":[{"name":str,"color":"#rrggbb","countries":[ISO3,...]},...],"note":str}. Map the powers of that date onto MODERN ISO3 codes (an empire → every modern country in its territory; e.g. Austria-Hungary → AUT,HUN,CZE,SVK,SVN,HRV,BIH,…). 2-6 factions, distinct colors. "note" must say it is approximate on modern borders. Title, faction names & note in '+_langLine()+'.';
          let jr=null; try{ jr=aiParseJSON(await askAI('Historical political/alliance/power map for: '+era,sysH,null,{})); }catch(_){}
          if(!jr||!Array.isArray(jr.factions)||!jr.factions.length) return R(false, warn('⚠ '+L('Could not build that historical map — try naming the war/year more specifically','その歴史地図を作成できませんでした。戦争名や年をより具体的に指定してください','Konnte diese historische Karte nicht erstellen','Не удалось построить эту историческую карту','No se pudo construir ese mapa histórico')));
          const groups=jr.factions.slice(0,6).map(f=>({name:String(f.name||''),color:(parseColor(f.color)||'#8a8f98'),codes:(Array.isArray(f.countries)?f.countries.map(c=>String(c).toUpperCase()):[])}));
          let n=paintFactions(groups); for(let i2=0;i2<6&&!n;i2++){ await new Promise(r2=>setTimeout(r2,600)); n=paintFactions(groups); }
          try{ GE().camera.flyTo({center:[18,32],zoom:1.6,duration:1000}); }catch(_){}
          let h='<div style="font-weight:600;margin:2px 0 5px;">'+esc(jr.title||era)+'</div>'
            +'<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">'+groups.map(f=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;background:'+f.color+';display:inline-block;flex:0 0 auto;"></span><span>'+esc(f.name)+'</span> <span style="color:var(--text-muted);font-size:10.5px;">('+f.codes.length+')</span></div>').join('')+'</div>'
            +note(jr.note||L('Approximate — historical powers mapped onto modern borders.','概略 — 歴史上の勢力を現代の国境上に表示。','Näherung — auf modernen Grenzen.','Приблизительно — на современных границах.','Aproximado — sobre fronteras actuales.'));
          return R(n>0, h); }
        case 'fly': case 'flight': case 'trajectory': { /* (#R72) animated camera flight ("モスクワからワシントンまで
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
        case 'drawLine': case 'line': { /* (#R72) free line drawing — AI-supplied coordinates or place names */
          let pts=[]; if(Array.isArray(a.points)) pts=a.points.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
          if(!pts.length&&Array.isArray(a.places)){ for(const pn of a.places.slice(0,12)){ const g=await geocode(String(pn)); if(g) pts.push([g.lng,g.lat]); } }
          if(pts.length<2) return R(false, warn('⚠ '+L('Need at least two points','2点以上必要です','Mindestens zwei Punkte nötig','Нужно минимум две точки','Se necesitan al menos dos puntos')));
          const col=a.color?parseColor(a.color):null;
          _hlLines.push({geo:{type:'LineString',coordinates:pts},color:col||undefined,w:(a.width!=null&&isFinite(+a.width))?+a.width:3,name:String(a.label||'')});
          const okL=paintLines(); try{ let a2=180,b2=90,c2=-180,d2=-90; pts.forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); }); if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:80,maxZoom:9,duration:900}); }catch(_){}
          return R(okL, okL?note('✏️ '+L('Line drawn','ラインを描画しました','Linie gezeichnet','Линия нарисована','Línea dibujada')+(a.label?(' — '+esc(a.label)):'')+' ('+pts.length+' pts)'):warn('⚠')); }
        case 'drawPolygon': case 'polygon': { let pts=[]; if(Array.isArray(a.points)) pts=a.points.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
          if(!pts.length&&Array.isArray(a.places)){ for(const pn of a.places.slice(0,12)){ const g=await geocode(String(pn)); if(g) pts.push([g.lng,g.lat]); } }
          if(pts.length<3) return R(false, warn('⚠ '+L('Need at least three points','3点以上必要です','Mindestens drei Punkte nötig','Нужно минимум три точки','Se necesitan al menos tres puntos')));
          if(pts[0][0]!==pts[pts.length-1][0]||pts[0][1]!==pts[pts.length-1][1]) pts.push([pts[0][0],pts[0][1]]);
          const colP=a.color?parseColor(a.color):null;
          const _pgObj={geo:{type:'Polygon',coordinates:[pts]},color:colP||undefined,name:String(a.label||'')};
          _hlPolys.push(_pgObj); const _pgId=(window._imHlPolys&&window._imHlPolys.tagId)?window._imHlPolys.tagId(_pgObj):null;   /* (#R120) drawn polygon becomes a referencable map-object */
          const okPg=paintPolys(); try{ let a2=180,b2=90,c2=-180,d2=-90; pts.forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); }); if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:80,maxZoom:9,duration:900}); }catch(_){}
          return R(okPg, okPg?note('⬠ '+L('Polygon drawn','ポリゴンを描画しました','Polygon gezeichnet','Полигон нарисован','Polígono dibujado')+(a.label?(' — '+esc(a.label)):'')):warn('⚠'), (okPg&&_pgId)?{objectIds:[_pgId]}:null); }
        case 'controls': { /* (#R72) interactive UI inside the reply ("Atlasの返答内からもボタンやスライダーを配置") */
          const items=Array.isArray(a.items)?a.items.slice(0,8):[];
          if(!items.length) return R(false, warn('⚠'));
          let h='<div style="display:flex;flex-direction:column;gap:7px;margin:4px 0 2px;">'; let any=false;
          for(const it of items){ const kind=String((it&&it.kind)||'').toLowerCase();
            if(kind==='layertoggle'||kind==='layer'){ const rl=resolveLayer(String(it.layer||it.name||'')); if(!rl) continue; any=true;
              h+='<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+esc(rl.label)+'</span><button class="atl-ctl-toggle'+(rl.cb.checked?' on':'')+'" data-layer="'+esc(rl.label)+'" data-cb="'+esc(rl.cb.id||'')+'" role="switch" aria-checked="'+(rl.cb.checked?'true':'false')+'"><span class="atl-ctl-knob"></span></button></div>'; }
            else if(kind==='opacity'||kind==='slider'){ const rl=resolveLayer(String(it.layer||it.name||'')); if(!rl) continue; const sl=layerOpacityControl(rl.cb); if(!sl) continue; any=true;
              h+='<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+esc(rl.label)+' · '+L('opacity','不透明度','Deckkraft','непрозрачность','opacidad')+'</span><input type="range" class="atl-ctl-op" data-layer="'+esc(rl.label)+'" data-cb="'+esc(rl.cb.id||'')+'" min="0" max="1" step="0.05" value="'+esc(sl.value)+'"></div>'; }
            else if(kind==='button'){ const lbl=String(it.label||'').slice(0,40); const cmd=String(it.run||it.command||'').slice(0,160); if(!lbl||!cmd) continue; any=true;
              h+='<button class="atl-ctl-btn" data-run="'+esc(encodeURIComponent(cmd))+'">'+esc(lbl)+'</button>'; } }
          h+='</div>';
          return R(any, any?h:warn('⚠')); }
        case 'ask': case 'choose': case 'clarify': case 'options': {
          /* (#R84) SELECTION-STYLE clarification ("ユーザーが十分な情報を提示しない場合…選択形式で聞く"):
             a question + clickable option chips + a free-text box. Picking a chip (or typing) sends it back to Atlas. */
          const q=String(a.question||a.text||a.say||a.prompt||'').trim();
          const opts=Array.isArray(a.options)?a.options.map(o=>String((o&&o.label)||o||'').trim()).filter(Boolean).slice(0,6):[];
          const allowText=a.allowText!==false&&a.freeText!==false;
          if(!q&&!opts.length) return R(false, warn('⚠'));
          /* ══ ⚠⚠ (#R313) THE QUESTION STAYS, THE PICKER GOES ════════════════════════════════
             「ユーザーが回答したら、そのUIは消してください。…きいた文章とユーザーの回答自体は
               そのままでいいけど、選択するためのUIはいらないですよねって話」 Nothing removed or
             disabled these after an answer, so a finished clarification kept a live menu in the
             transcript that could be re-clicked for ever — and re-clicking it asked a question that
             had already been answered further down the page. The chips and the free-text box are
             the PICKER; the sentence above them is the RECORD. Only the picker is wrapped, and only
             the picker is removed (see the `.atl-choice-ui` handler further down). */
          let hh='<div style="font-size:12.5px;line-height:1.6;margin-bottom:7px;">'+esc(q||L('Which one?','どれにしますか？','Welche?','Какой вариант?','¿Cuál?'))+'</div>';
          const _wrapOpen='<div class="atl-choice-ui">', _wrapClose='</div>';
          hh+=_wrapOpen;
          if(opts.length){ hh+='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:'+(allowText?'8px':'2px')+';">'
            +opts.map(o=>'<button class="atl-choice" data-choice="'+esc(encodeURIComponent(o))+'" style="text-align:left;border:1px solid var(--glass-border,rgba(128,128,128,0.32));background:var(--input-bg);color:var(--text-main);border-radius:10px;padding:8px 12px;font-size:12px;cursor:pointer;">'+esc(o)+'</button>').join('')+'</div>'; }
          if(allowText){ hh+='<div class="atl-choice-txt" style="display:flex;gap:6px;"><input type="text" class="atl-choice-in" placeholder="'+esc(L('or type your own answer…','または自由に入力…','oder eigene Antwort…','или введите свой ответ…','o escribe tu respuesta…'))+'" style="flex:1;min-width:0;height:34px;padding:0 12px;border-radius:17px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:12px;outline:none;box-sizing:border-box;"><button class="atl-choice-go" title="'+L('Send','送信','Senden','Отправить','Enviar')+'" style="flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:#fff;color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba(0,0,0,0.14);"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg></button></div>'; }   /* (#R149) white bg + BLACK icon + a real up-arrow SVG (was accent bg + plain-text "→") — "白背景黒文字に。plain textの→はやめて" */
          hh+=_wrapClose;
          return R(true, hh); }
        case 'analyze': case 'research': case 'synthesize': { const q=String(a.question||a.query||a.text||'').trim();
          if(!q) return R(false, warn('⚠ '+L('What should I analyze?','何を分析しますか？','Was soll analysiert werden?','Что проанализировать?','¿Qué analizo?')));
          await ensureData();
          const use=Array.isArray(a.use)?a.use.map(x=>String(x||'').toLowerCase()):null;
          const wantD=k=>use?use.indexOf(k)>=0:null;   /* null = "not specified" → sensible defaults below */
          /* place context (filters news/quakes + anchors point values); "there" resolves via deixis. */
          let ctx=null; const placeStr=String(a.place||'').trim();
          if(placeStr&&!WORLD_RE.test(placeStr)){ try{ ctx=await placeExtent(placeStr); }catch(_){} if(!ctx){ try{ ctx=await geocode(placeStr); }catch(_){} } }
          const pt=(ctx&&ctx.lng!=null&&isFinite(ctx.lng))?ctx:null;
          /* countries for stats: explicit list, else the country under the place point. */
          let codes=[]; const cnames=Array.isArray(a.countries)?a.countries:(a.country?[a.country]:[]);
          for(const n2 of cnames){ try{ const c=await resolveCountry(n2); if(c&&c.code&&codes.indexOf(c.code)<0) codes.push(c.code); }catch(_){} }
          if(!codes.length&&pt){ const cd=codeAtPoint(pt.lng,pt.lat); if(cd) codes.push(cd); }
          /* (#R74) officeholder questions: find the country IN the question when none was passed, so the
             live Wikidata incumbent block below can anchor the answer. */
          const isOffice=OFFICE_RE.test(q);
          if(isOffice&&!codes.length){ try{ for(const cd in countryStats){ const s3=countryStats[cd]; if(!s3) continue;
            const en3=String(s3.nameEn||''), jp3=String(s3.nameJp||'');
            if((en3.length>3&&q.toLowerCase().indexOf(en3.toLowerCase())>=0)||(jp3.length>1&&q.indexOf(jp3)>=0)){ codes.push(cd); if(codes.length>=3) break; } } }catch(_){} }
          /* gather — defaults: news + quakes + stats(+weather when a place anchors it); air/marine/elevation on request. */
          const got={}, missing=[], srcSink=[];   /* (#R79) srcSink collects real article {url,title,src} for ChatGPT-style source cards */
          if(wantD('news')!==false){ if(typeof HOST.globalData!=='undefined'&&(!HOST.globalData||!HOST.globalData.length)){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
            got.news=_newsData(ctx,q,srcSink); if(!got.news) missing.push(L('loaded news','読み込み済みニュース','geladene News','загруженные новости','noticias cargadas')); }
          const jobs=[];
          /* (#R62) LIVE WEB SEARCH is now a first-class dataset (default ON) — the loaded RSS feed alone produced
             honest-but-useless "insufficient data" answers (the Taiwan report). GDELT covers current events across
             the world's outlets; Wikipedia supplies stable background. */
          if(wantD('web')!==false){ const topic=(ctx&&ctx.name)||placeStr||'';
            /* (#R64) GDELT needs an ENGLISH topic (a Japanese place name returned nothing → the Greece report's
               "取得不可: ライブWebニュース"); Google News RSS covers the user's own language. Both run.
               (#R131) MULTI-COUNTRY FIX (root cause of the missing Kazakhstan/Turkmenistan coverage): the old
               code OVERRODE the topic with codes[0]'s English name, so "Central Asia (5 countries)" silently
               searched only Kazakhstan. Now: search the REGION and an OR of the REQUESTED countries, so every
               requested country can surface — without an unbounded per-country search explosion. */
            const cnEn=[]; try{ codes.forEach(c=>{ const s5=countryStats[c]; if(s5&&s5.nameEn&&cnEn.indexOf(s5.nameEn)<0) cnEn.push(s5.nameEn); }); }catch(_){}
            const multi=cnEn.length>1;
            let regionQ=''; if(topic) regionQ='"'+topic.replace(/"/g,'')+'"'; else if(cnEn.length===1) regionQ='"'+cnEn[0].replace(/"/g,'')+'"';
            if(!regionQ&&!multi){ try{ regionQ=q.split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>3).slice(0,4).join(' '); }catch(_){ regionQ=q.slice(0,60); } }
            const orQ=multi?('('+cnEn.map(n=>'"'+n.replace(/"/g,'')+'"').join(' OR ')+')'):'';
            jobs.push((async()=>{ let any=false;
              /* 1) region-wide GDELT (the whole area) — runs sequentially with (2) to stay gentle on GDELT's per-IP limit */
              if(regionQ){ let v=await _gdeltNews(regionQ,srcSink); if(!v&&regionQ.indexOf('"')>=0) v=await _gdeltNews(regionQ.replace(/"/g,''),srcSink); if(v){ got.web=v; any=true; } }
              /* 2) a search that INCLUDES the explicit countries (OR of the requested set), so no country is dropped */
              if(orQ){ let v3=await _gdeltNews(orQ,srcSink); if(v3){ got.web3=v3; any=true; } }
              /* 3) user-language Google News (region topic, else the requested country set) */
              const gnQ=topic||cnEn.join(' OR ')||q.slice(0,60);
              let v2=null; try{ v2=await _gnewsNews(gnQ,srcSink); }catch(_){}
              if(v2){ got.web2=v2; any=true; }
              if(!any) missing.push(L('live web news','ライブWebニュース','Live-Webnews','живые веб-новости','noticias web en vivo')); })());
            if(topic) jobs.push(_wikiSummary(topic).then(v=>{ if(v) got.wiki=v; })); }
          if(wantD('weather')===true||(wantD('weather')===null&&pt)){ if(pt) jobs.push(_weatherData(pt.lng,pt.lat).then(v=>{ if(v) got.weather=v; else missing.push(L('weather','天気','Wetter','погода','tiempo')); })); else missing.push(L('weather (no place given)','天気（場所未指定）','Wetter (kein Ort)','погода (нет места)','tiempo (sin lugar)')); }
          if(wantD('airquality')===true||wantD('air')===true){ if(pt) jobs.push(_airData(pt.lng,pt.lat).then(v=>{ if(v) got.air=v; else missing.push(L('air quality','大気質','Luftqualität','качество воздуха','calidad del aire')); })); else missing.push(L('air quality (no place given)','大気質（場所未指定）','Luftqualität (kein Ort)','воздух (нет места)','aire (sin lugar)')); }
          if(wantD('marine')===true||wantD('sst')===true){ if(pt) jobs.push(_sstData(pt.lng,pt.lat).then(v=>{ if(v) got.sst=v; else missing.push(L('sea temperature','海水温','Meerestemperatur','темп. моря','temp. del mar')); })); else missing.push(L('sea temperature (no place given)','海水温（場所未指定）','Meerestemperatur (kein Ort)','море (нет места)','mar (sin lugar)')); }
          if(wantD('elevation')===true){ if(pt) jobs.push(_elevData(pt.lng,pt.lat).then(v=>{ if(v) got.elev=v; else missing.push(L('elevation','標高','Höhe','высота','elevación')); })); else missing.push(L('elevation (no place given)','標高（場所未指定）','Höhe (kein Ort)','высота (нет места)','elevación (sin lugar)')); }
          if(isOffice&&codes.length) jobs.push(_leaderData(codes).then(v=>{ if(v) got.leaders=v; }).catch(()=>{}));   /* (#R74) live incumbents */
          if(wantD('quakes')!==false) jobs.push(_quakeData(ctx).then(v=>{ if(v) got.quakes=v; else missing.push(L('earthquakes','地震','Erdbeben','землетрясения','sismos')); }));
          /* (#R119) the DISPLAYED layers' live values at the anchor point become first-class evidence */
          if(pt&&window.IntMapLayers){ jobs.push(window.IntMapLayers.sampleAt(pt.lng,pt.lat).then(v=>{ if(v&&v.length) got.layers=v.map(x=>x.label+': '+x.value).join('\n'); }).catch(()=>{})); }
          /* (#R119) scope:"drawn-area" — the old standalone area-summary is absorbed here: news inside the user's
             drawn polygon / circle(s) + layer values at its centroid feed the SAME analyze pipeline. */
          try{ const scope=String(a.scope||'').toLowerCase();
            if(/drawn|area|circle|radius/.test(scope)&&typeof turf!=='undefined'){
              let inside=null, ctr=null;
              if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3){ const poly=turf.polygon([[...HOST.measurePoints,HOST.measurePoints[0]]]); inside=(x,y)=>{ try{ return turf.booleanPointInPolygon(turf.point([x,y]),poly); }catch(_){ return false; } }; try{ const c4=turf.centroid(poly).geometry.coordinates; ctr={lng:c4[0],lat:c4[1]}; }catch(_){} }
              else if(typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length){ inside=(x,y)=>HOST.radiusItems.some(c=>{ try{ return turf.distance(turf.point(c.center),turf.point([x,y]),{units:'kilometers'})<=c.radiusKm; }catch(_){ return false; } }); ctr={lng:HOST.radiusItems[0].center[0],lat:HOST.radiusItems[0].center[1]}; }
              if(inside){ const rows=[];
                try{ (typeof HOST.globalData!=='undefined'?(HOST.globalData||[]):[]).forEach(it=>{ const lc=it&&it.analysis&&it.analysis.loc; if(lc&&isFinite(lc[0])&&inside(+lc[0],+lc[1])&&rows.length<24) rows.push('- '+String(it.title||'').slice(0,120)+(it.pubDate?(' ('+String(it.pubDate).slice(0,16)+')'):'')); }); }catch(_){}
                got.areaNews=(rows.length?rows.join('\n'):L('(no loaded news points inside the drawn area)','（描画範囲内に読み込み済みニュース地点なし）','(keine geladenen News im Gebiet)','(нет новостей в области)','(sin noticias en el área)'));
                if(ctr&&window.IntMapLayers){ jobs.push(window.IntMapLayers.sampleAt(ctr.lng,ctr.lat).then(v=>{ if(v&&v.length) got.layersArea=v.map(x=>x.label+': '+x.value).join('\n'); }).catch(()=>{})); }
                try{ if(window.IntMapPopArea&&typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3){ jobs.push(window.IntMapPopArea.estimate({type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]}).then(v=>{ if(v) got.areaPop=v.pop.toLocaleString()+' (WorldPop 2020, 100m grid)'; }).catch(()=>{})); } }catch(_){}
              } } }catch(_){}
          if(wantD('stats')!==false){ got.stats=_statsData(codes); if(!got.stats&&(wantD('stats')===true||codes.length)) missing.push(L('country stats','国別統計','Länderstatistik','статистика стран','estadísticas')); }
          await Promise.all(jobs);
          /* build the DATA block + synthesize with ONE text-AI call (answers ONLY from this data). */
          /* (#R131) Give the model a REAL clock + requested time window (the old prompt passed only a UTC date, so
             it had no way to reject out-of-window items) and, for a multi-country request, the explicit country set
             it must report coverage for. */
          const nowCtx=_nowContext(); const freshness=_analyzeFreshness(q);
          const analysisWebMode=(freshness.critical||(use&&use.indexOf('web')>=0))?'required':'auto';   /* (#R131) freshness-critical → FORCE live web verification; (#R158) an explicit use:['web'] (e.g. an informational answer routed here for sources) also forces it, so sources are never zero */
          const covNames=[]; try{ codes.forEach(c=>{ const s6=countryStats[c]; if(s6&&(s6.nameEn||nm(s6))) covNames.push(s6.nameEn||nm(s6)); }); }catch(_){}
          if(!covNames.length&&cnames.length) cnames.forEach(n7=>{ const t7=String(n7||'').trim(); if(t7) covNames.push(t7); });
          const coverage={ region:(placeStr||(ctx&&ctx.name)||''), countries:covNames };
          let block=''; const usedNames=[];
          const push2=(tag,lbl,v)=>{ if(v){ block+='['+tag+']\n'+v+'\n\n'; usedNames.push(lbl); } };
          /* TIME CONTEXT + REQUESTED COVERAGE first — the model reads the clock (and the country set it must cover)
             before the evidence. Shared with the regression harness via _analyzeHeaderBlock so they never drift. */
          block+=_analyzeHeaderBlock(nowCtx, freshness, coverage);
          /* (#R131) ONE dated NEWS EVIDENCE block (loaded + GDELT + Google News), newest-first, each stamped with
             its date_type and event_date:unknown — replaces the 3 undated headline dumps that let the model read a
             publication/seen date as the event date. */
          const evRecs=_analyzeEvidence(srcSink); const evBlock=_evidenceBlock(evRecs);
          if(evBlock){ block+='[NEWS EVIDENCE — headlines IntMap gathered'+(ctx&&ctx.name?(', around '+ctx.name):'')+'. Each item is a LEAD, not a confirmed event: article_date/date_type = when the ARTICLE appeared; event_date is UNKNOWN unless the wording itself verifies it. Ordered newest-first by article date.]\n'+evBlock+'\n\n';
            const origins=new Set(evRecs.map(r=>r.origin));
            if(origins.has('loaded')) usedNames.push(L('news','ニュース','News','новости','noticias'));
            if(origins.has('gdelt')||origins.has('gnews')) usedNames.push(L('web news search','Webニュース検索','Web-News-Suche','поиск веб-новостей','búsqueda de noticias web')); }
          else if(got.news){ block+='[LATEST NEWS (loaded in IntMap'+(ctx&&ctx.name?(', filtered to '+ctx.name):'')+')]\n'+got.news+'\n\n'; usedNames.push(L('news','ニュース','News','новости','noticias')); }
          else if(freshness.critical) missing.push(L('in-window verified events','対象期間内の確認済み出来事','verifizierte Ereignisse im Zeitfenster','подтверждённые события в окне','eventos verificados en la ventana'));
          push2('CURRENT NATIONAL LEADERS (Wikidata LIVE query, P6/P35 — authoritative for who currently holds office)','Wikidata',got.leaders);
          push2('BACKGROUND (Wikipedia)','Wikipedia',got.wiki);
          push2('CURRENT WEATHER'+(pt&&(pt.name||placeStr)?(' @ '+(pt.name||placeStr)):''),L('weather','天気','Wetter','погода','tiempo'),got.weather);
          push2('AIR QUALITY',L('air quality','大気質','Luftqualität','воздух','aire'),got.air);
          push2('SEA SURFACE',L('sea temperature','海水温','Meerestemperatur','темп. моря','mar'),got.sst);
          push2('ELEVATION',L('elevation','標高','Höhe','высота','elevación'),got.elev);
          push2('ACTIVE MAP LAYER VALUES @ the anchor point (live values of the layers the user is displaying)',L('displayed-layer values','表示レイヤーの実値','Layer-Werte','значения слоёв','valores de capas'),got.layers);
          push2('NEWS INSIDE THE USER-DRAWN AREA (loaded news points whose location falls in the drawn polygon / circles)',L('area news','範囲内ニュース','Gebiets-News','новости области','noticias del área'),got.areaNews);
          push2('LAYER VALUES @ the drawn-area center',L('area layer values','範囲のレイヤー実値','Gebiets-Layerwerte','значения слоёв области','valores de capas del área'),got.layersArea);
          push2('POPULATION INSIDE THE DRAWN AREA',L('area population','範囲内人口','Gebietsbevölkerung','население области','población del área'),got.areaPop);
          push2('EARTHQUAKES (USGS, last 24 h'+(ctx?', in the area':'')+')',L('earthquakes','地震','Erdbeben','землетрясения','sismos'),got.quakes);
          push2('COUNTRY STATISTICS',L('country stats','国別統計','Länderstatistik','статистика','estadísticas'),got.stats);
          const st=stateContext(); if(st) block+='[CURRENT MAP STATE]\n'+st+'\n\n';
          /* (#R113) IntMap already ran the live web-news search (GDELT + Google News) into the DATA blocks above;
             the model does NOT have its own web-search tool by default, so it works from that evidence and answers
             honestly when the evidence is thin (rather than the old "the model MUST search" assertion). */
          const lang=_langLine();
          /* (#R64) REPORT quality ("クソみたいなレポート出力してんじゃねーよ"): lead with what is actually happening
             (news, dated), analyse rather than recite — no weather/quake/statistics dumps unless they answer the
             question.
             (#R69) the old prompt said "use ONLY the DATA blocks", which actively FORBADE the model from using its
             web_search results → the "ギリシャの近況" non-answer ("特筆すべきニュースなし"). The web search is now a
             REQUIRED evidence source whenever the blocks are thin, and no-news answers without a search are banned. */
          const sys2=_analysisSystemPrompt(nowCtx, freshness, coverage, lang);
          /* ══ (#R350) THE ANSWER IS A CONTRACT, NOT A STRING ══════════════════════════════════
             What stood here: ONE askAI for prose, a regex that peeled a "PLACES:" JSON trailer off
             the end, a second regex that peeled a "SOURCES:" line off the end, and then
             window._aiLastMeta / window._aiLastCitations — the globals whichever call answered LAST
             overwrites — read AFTER the await. Every defect of the reported China answer was ALLOWED
             by that shape rather than caused by one bad generation: an opening sentence nothing could
             compare with the body, three meanings of 「支えている」 carried by one word, two statistical
             series chained inside one sentence, and a URL the model invented rendered as a live link.
             The orchestration is js/atlas-answer-pipeline.js, the rules are js/atlas-answer-audit.js,
             the drawing is js/atlas-answer-render.js. This is the CALL SITE and nothing more — the
             kernel is under a shrink-only ceiling (tests/r199 ⑤) and new logic goes to a module. */
          const _prof=(()=>{ try{ return _requestProfile(q); }catch(_){ return null; } })();
          let RES=null;
          try{ RES=await runStructuredAnswer({
              question:q, dataBlock:block, systemPrompt:sys2, language:lang,
              temporalMode:(_prof&&_prof.temporalMode)||'unspecified',
              requestedOutputs:_prof?Object.keys(_prof.outputs).filter(k=>_prof.outputs[k]):[],
              turnId:_curTurnKey, webMode:analysisWebMode, clientSources:srcSink,
              appFacts:_statsFacts(codes), retrievedAt:nowCtx.local, answerGoal:String(q||'').slice(0,200),
              ask:(pr,sy,o)=>askAIJSONEnvelope(pr,sy,null,o), parseJSON:aiParseJSON }); }
          catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          const _env=RES.env, _reg=RES.registry;
          if(!String((_env.answer.directAnswer&&_env.answer.directAnswer.text)||'').trim()) return R(false, warn('⚠ '+L('The analysis returned no answer','分析結果が空でした','Analyse ergab keine Antwort','Анализ не дал ответа','El análisis no dio respuesta')));
          /* ⚠ THE FULL TRACE IS A DEVELOPER FACILITY AND CARRIES NO PROMPT, NO TOKEN AND NO ARTICLE
             BODY — call ids, audit codes and counts only, so turning it on in production leaks
             nothing. window.IntMapAtlasDev is the same switch the rest of Atlas debugging uses. */
          try{ if(window.IntMapAtlasDev) window.IntMapAtlasTrace=Object.assign({},RES.trace,{errors:RES.audit.errors.map(x=>x.code),warnings:RES.audit.warnings.map(x=>x.code)}); }catch(_){}
          let html='<div style="font-size:14px;line-height:1.68;">'+renderAnswer(_env,_reg,{L,esc,mdMini,linkCards})+'</div>';
          /* (#R150) prose↔map reconciliation is unchanged in intent — it now reads the STRUCTURE's
             places instead of a JSON line scraped off the end of the prose. */
          try{ html+=await _pinReplyPlaces((_env.places||[]).map(p2=>({n:p2.name,c:p2.country,k:p2.kind})),{text:answerPlainText(_env),citations:_reg.all().filter(r=>r.finalUrl).map(r=>({url:r.finalUrl,title:r.title}))}); }catch(e){ try{ console.warn('analyze map audit',e); }catch(_){} }
          /* (#R131) Freshness-critical question but live web verification did NOT run: label the answer a PROVISIONAL
             assessment built mainly on already-gathered headlines, so headline-only leads are never presented as
             confirmed direct evidence (the Central-Asia failure). Applies equally when the web search timed out into
             the tool-free fallback (webUsed stays false). */
          if(freshness.critical&&!RES.webUsed) html+='<div style="margin-top:8px;padding:7px 10px;border:1px solid var(--warn-color,#c98a00);border-radius:8px;background:rgba(201,138,0,.09);font-size:11px;line-height:1.5;color:var(--text-main);">⚠ '+L(
            'Live web verification did not complete for this time-sensitive question, so this is a PROVISIONAL assessment based mainly on already-gathered headlines — treat items as leads, not confirmed direct evidence.',
            '時間依存の質問に対しライブWeb検証を完了できなかったため、これは取得済みの見出しを中心とした暫定評価です。各項目は確認済みの直接的証拠ではなく手がかりとして扱ってください。',
            'Die Live-Web-Verifizierung wurde für diese zeitkritische Frage nicht abgeschlossen — dies ist eine VORLÄUFIGE Einschätzung, überwiegend auf bereits gesammelten Schlagzeilen; als Hinweise, nicht als bestätigte Belege behandeln.',
            'Проверка в реальном времени по этому чувствительному ко времени вопросу не завершилась — это ПРЕДВАРИТЕЛЬНАЯ оценка, в основном по уже собранным заголовкам; считайте их зацепками, а не подтверждёнными доказательствами.',
            'No se completó la verificación web en vivo para esta pregunta sensible al tiempo, por lo que es una evaluación PROVISIONAL basada sobre todo en titulares ya recopilados; trátalos como indicios, no como evidencia directa confirmada.')+'</div>';
          const usedAll=usedNames.slice();   /* (#R113) IntMap's own gathered sources (GDELT, Google News, Wikidata, Wikipedia…) are already in usedNames. */
          if(RES.webUsed) usedAll.push(L('live web verification','ライブWeb検証','Live-Web-Verifizierung','проверка в интернете','verificación web en vivo'));
          if(usedAll.length) html+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">'+L('Data used','使用データ','Verwendete Daten','Данные','Datos usados')+': '+usedAll.join(', ')+'</div>';   /* (#R118) no data → NO empty "Data used:" line */
          return R(true, html); }
        /* (#R180) THE RENDERING ENGINE — Atlas is the control plane (STANDING RULE since #R82),
           so the second engine is selectable from here too. It cannot take effect on the live
           scene for the same reason the Settings panel reloads: a renderer swap is a rebuild.
           So this reports honestly — what is stored, what is DRAWING, and that a reload is what
           applies it — rather than claiming a change that has not happened yet. */
        case 'engine': {
          const ES=window.IntMapEngineSelect;
          if(!ES) return R(false,warn('⚠ '+L('The engine selector is unavailable.','エンジン選択が利用できません。','Die Engine-Auswahl ist nicht verfügbar.','Выбор движка недоступен.','El selector de motor no está disponible.')));
          const nameOf=id=>ES.label(id,(HOST.lang||'en'));
          const asked=String(a.name||a.engine||a.mode||'').toLowerCase();
          const live=ES.active(), stored=ES.choice();
          if(!asked||/^(what|which|status)$/.test(asked)){
            let h=note('✓ '+L('Map engine','地図エンジン','Karten-Engine','Движок карты','Motor del mapa')+': '+nameOf(live));
            if(live!==stored) h+=note(L('Selected','選択中','Ausgewählt','Выбрано','Seleccionado')+': '+nameOf(stored)+' — '+L('reload to apply','再読み込みで適用','zum Anwenden neu laden','перезагрузите, чтобы применить','recarga para aplicar'));
            const f=ES.failure(); if(f) h+=warn('⚠ '+L('Cesium could not start','Cesiumを起動できませんでした','Cesium konnte nicht starten','Cesium не запустился','Cesium no pudo iniciarse')+' ('+f+')');
            return R(true,h);
          }
          const want=/cesium|セシウム|3d ?globe/.test(asked)?'cesium':'maplibre';
          ES.set(want);
          if(want===live) return R(true,note('✓ '+L('Already running on','すでに動作中','Läuft bereits mit','Уже работает на','Ya funciona con')+': '+nameOf(want)));
          /* the reload is the ACTION, so it is announced and then performed — not silently queued */
          try{ setTimeout(()=>{ try{ location.reload(); }catch(_){} },900); }catch(_){}
          return R(true,note('✓ '+L('Switching to','切り替え先','Wechsel zu','Переключение на','Cambiando a')+': '+nameOf(want)+' — '+L('reloading…','再読み込み中…','wird neu geladen…','перезагрузка…','recargando…')));
        }
        /* (#R171) the two new Map-behaviour settings, operable from Atlas like every other feature. */
        case 'tiltLimit': { const want=!(a.on===false||/^(off|standard|normal)$/i.test(String(a.mode||''))); let ok=false;
          try{ if(window.IntMapTilt){ window.IntMapTilt.set(want); ok=true; } }catch(_){}
          const cap=(()=>{ try{ return Math.round(window.IntMapTilt.ceiling()); }catch(_){ return want?180:78; } })();
          return R(ok, ok?note('✓ '+L('Map tilt limit','地図の傾き制限','Neigungsgrenze','Предел наклона','Límite de inclinación')+': '+(want?L('unlimited','無制限','unbegrenzt','без предела','sin límite'):L('standard','標準','Standard','стандарт','estándar'))+' ('+cap+'°)')+_featTogHtml('tiltLimit'):warn('⚠')); }
        case 'eyeAltitude': { const want=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let ok=false;
          try{ if(window.IntMapEyeAlt){ window.IntMapEyeAlt.set(want); ok=true; } }catch(_){}
          const now=(()=>{ try{ const v=window.IntMapEyeAlt.altitude(); return (v==null)?'':' — '+window.IntMapEyeAlt.text(); }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Viewpoint altitude in the readout','常時表示欄の視点高度','Kamerahöhe in der Anzeige','Высота камеры в строке','Altitud del punto de vista')+': '+(want?'on':'off')+(want?now:''))+_featTogHtml('eyeAltitude'):warn('⚠')); }
        /* (#R196) the day/night side of the planet, and the city lights on it */
        case 'nightSide': { const want=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let ok=false, st=null;
          try{ if(window.IntMapNightSide){ window.IntMapNightSide.setEnabled(want); st=window.IntMapNightSide.state(); ok=true; } }catch(_){}
          try{ window._imSyncNightSideRow&&window._imSyncNightSideRow(); }catch(_){}   /* (#R232) the Layers row + the Settings picker follow */
          const detail=(want&&st)?(' — '+(st.built?L('drawn','描画中','gezeichnet','нарисовано','dibujado'):L('appears as you zoom out','ズームアウトすると現れます','erscheint beim Herauszoomen','появится при отдалении','aparece al alejar'))
            +(st.lights?(' · '+L('city lights loaded','夜間光を読み込み済み','Nachtlichter geladen','ночные огни загружены','luces nocturnas cargadas')):'')):'';
          return R(ok, ok?note('✓ '+L('Night side of the Earth','地球の夜側','Nachtseite der Erde','Ночная сторона Земли','Lado nocturno de la Tierra')+': '+(want?'on':'off')+detail)+_featTogHtml('nightSide'):warn('⚠')); }
        /* (#R172) aircraft at their reported altitude, or flat on the map */
        /* ⚠ (#R313) the animated streaks inside the Wind layer, on their own switch — the reader put
           a box for it in the wind legend and CLAUDE.md §3-3 says a feature reaches Atlas in the same
           change: dispatch here, the sentence in the SYS catalogue below, and the inline toggle in
           `_FEAT_TOG` so a reply can carry the switch. All three call window.Wind.setParticles — the
           legend box calls it too, so no two of them can hold different ideas of the state. */
        case 'windParticles': case 'windAnimation': { const want=!(a.on===false||/^(off|hide|none|static)$/i.test(String(a.mode||''))); let ok=false;
          /* ⚠ (#R337) 「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
             `over` names the layer the streaks are wanted OVER. The two switches are two questions
             (js/weather.js): 「does the Wind layer animate」 and 「is the wind drawn over the
             temperature field」, so this branch writes the one the reader named and never both. */
          const over=String(a.over||a.layer||a.on_layer||'').toLowerCase();
          if(/temp|気温|気溫|temperatur|температ/.test(over)){
            try{ if(window._imWxTempParts){ window._imWxTempParts(want); ok=true; } }catch(_){}
            return R(ok, ok?note('✓ '+L('Wind particles over the temperature layer','気温レイヤー上の風のパーティクル','Wind-Partikel über der Temperaturschicht','Частицы ветра поверх слоя температуры','Partículas de viento sobre la capa de temperatura')+': '+(want?'on':'off'))+_featTogHtml('tempWindParticles'):warn('⚠')); }
          try{ if(window.Wind&&window.Wind.setParticles){ window.Wind.setParticles(want); ok=true; } }catch(_){}
          return R(ok, ok?note('✓ '+L('Wind particles','風のパーティクル','Wind-Partikel','Частицы ветра','Partículas de viento')+': '+(want?'on':'off'))+_featTogHtml('windParticles'):warn('⚠')); }
        case 'planeAltitude': case 'aircraftAltitude': { const want=!(a.on===false||/^(off|flat|2d)$/i.test(String(a.mode||''))); let ok=false;
          try{ if(window.IntMapPlanes3D){ window.IntMapPlanes3D.set(want); ok=true; } }catch(_){}
          const st=(()=>{ try{ const s=window.IntMapPlanes3D.state(); return s.lifted?(' — '+s.lifted+' '+L('airborne, up to','機が飛行中・最高','in der Luft, bis','в воздухе, до','en vuelo, hasta')+' '+s.maxAlt.toLocaleString()+' m'):''; }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Aircraft at real altitude','航空機を実際の高度で描画','Flugzeuge in echter Höhe','Самолёты на реальной высоте','Aviones a su altitud real')+': '+(want?'on':'off')+(want?st:''))+_featTogHtml('planeAltitude'):warn('⚠')); }
        /* (#R173) the track of ONE aircraft — the same thing a click on it draws. "clear" (or on:false)
           puts it away. The track is what this browser has observed since the layer came on; there is no
           history feed behind it, so the reply says how many fixes and how long it covers. */
        case 'aircraftTrack': case 'planeTrack': {
          const P=window.IntMapPlanes3D; if(!P) return R(false,warn('⚠'));
          const off=(a.on===false)||/^(off|clear|hide|none)$/i.test(String(a.mode||a.aircraft||''));
          if(off){ try{ P.select(null); }catch(_){} return R(true,note('✓ '+L('Aircraft track cleared','航空機の軌跡を消去','Flugspur entfernt','Трек убран','Traza borrada'))); }
          const q=String(a.aircraft||a.callsign||a.flight||a.reg||a.icao24||'').trim();
          const key=q?(P.find(q)||null):(P.selected()||null);
          if(!key) return R(false,warn('⚠ '+L('No aircraft matching','該当する航空機がありません','Kein Flugzeug gefunden','Самолёт не найден','Ningún avión coincide')+(q?' “'+esc(q)+'”':'')));
          let ok=false; try{ P.select(key); ok=true; }catch(_){}
          const s2=(()=>{ try{ const t=P.trackStats(key); return ' — '+t.fixes+' '+L('fixes','点','Punkte','точек','puntos')+' · '+t.minutes+' '+L('min','分','min','мин','min')+(t.maxAlt?(' · '+L('up to','最高','bis','до','hasta')+' '+t.maxAlt.toLocaleString()+' m'):''); }catch(_){ return ''; } })();
          return R(ok, ok?note('✓ '+L('Track of','軌跡','Spur von','Трек','Traza de')+' '+esc(q||key)+s2):warn('⚠')); }
        /* (#R184) LIVE SATELLITES — the same three verbs the aircraft layer answers, applied to orbit:
           turn the layer on, choose which CelesTrak catalogue it propagates, and single out one object
           (which draws its footprint + ground track and opens the detail card). Every number in the
           reply is read back out of the layer's own state, so a reply can never claim a satellite the
           map is not showing. */
        case 'satellites': case 'satellite': case 'sats': case 'orbit': {
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
            if(!found) return R(okS, warn('⚠ '+L('No satellite matching','該当する衛星がありません','Kein Satellit gefunden','Спутник не найден','Ningún satélite coincide')+' “'+esc(q)+'”'
              +' — '+L('the loaded catalog is','読み込み中のカタログは','geladener Katalog:','загруженный каталог:','el catálogo cargado es')+' '+esc(A.group())));
            try{ A.select(found.id); }catch(_){}
            try{ window.IntMapSatPanel&&window.IntMapSatPanel.open(found.id); }catch(_){}
            try{ GE().camera.easeTo({center:[found.lng,found.lat],duration:900}); }catch(_){}
            /* ⚠ (#R298) the observer is the point the reader chose when there is one — this asked the
               camera about a satellite the reader had just named a place for. */
            const la=A.lookFrom(A.observer((typeof _herePoint!=='undefined'&&_herePoint)||undefined),found);
            const det=' — '+L('altitude','高度','Höhe','высота','altitud')+' '+Math.round(found.altKm).toLocaleString()+' km'
              +(found.velKmS?(' · '+found.velKmS.toFixed(2)+' km/s'):'')
              +(found.periodMin?(' · '+L('period','周期','Umlaufzeit','период','periodo')+' '+found.periodMin.toFixed(1)+' min'):'')
              +(la?(' · '+L('elevation from the map center','地図中心からの仰角','Elevation ab Kartenmitte','угол места от центра карты','elevación desde el centro')+' '+la.elDeg.toFixed(1)+'°'):'')
              +(found.sunlit==null?'':(' · '+(found.sunlit?L('sunlit','太陽光下','beleuchtet','освещён','iluminado'):L('in eclipse','影の中','im Schatten','в тени','en eclipse'))));
            return R(true,note('✓ '+esc(found.name||('#'+found.id))+esc(det)));
          }
          const st=A.state();
          return R(okS, okS?note('✓ '+L('Live satellites on','人工衛星レイヤーを表示しました','Live-Satelliten an','Спутники включены','Satélites en vivo activados')
              +' — '+esc(A.groups().filter(g=>g.id===(gSet||A.group())).map(g=>g.name)[0]||A.group())
              +(st.catalogue?(' · '+st.catalogue.toLocaleString()+' '+L('objects','機','Objekte','объектов','objetos')):'')):warn('⚠')); }
        case 'ticker': { const onT=!(a.on===false||/^(off|hide)$/i.test(String(a.mode||''))); let okT=false;
          try{ if(window.IntMapTicker){ window.imTicker=onT?'on':'off'; window.IntMapTicker.apply(); okT=true; try{ if(typeof saveSettings==='function') saveSettings(); }catch(_){} } }catch(_){}
          return R(okT, okT?note('✓ '+L('Bottom ticker','下部ティッカー','Ticker','Бегущая строка','Cinta inferior')+': '+(onT?'on':'off'))+_featTogHtml('ticker'):warn('⚠')); }   /* (#R149) offer the ticker on/off toggle */
        case 'compareStats': case 'compareCountries': case 'statsCompare': { await ensureData(); await window.IntMapLazy.need('statsCompare');   /* (#R311) BEFORE _cmpMetricKeys — that resolver asks the panel for its real IND keys */
          const rawC=Array.isArray(a.countries)?a.countries:String(a.countries||a.country||'').split(/,|、|;| and | und | y | и |と| vs\.? |対/i).map(x=>x.trim()).filter(Boolean);
          const cds=[],missC=[]; for(const nm2 of rawC){ const c=await resolveCountry(nm2); if(c&&c.code){ if(cds.indexOf(c.code)<0) cds.push(c.code); } else missC.push(nm2); }
          if(!cds.length) return R(false, warn('⚠ '+L('Which countries should I compare?','どの国を比較しますか？','Welche Länder vergleichen?','Какие страны сравнить?','¿Qué países comparo?')));
          const viewM=({bar:'bar',bars:'bar',timeseries:'ts',ts:'ts','time-series':'ts',table:'table',pivot:'table'})[String(a.view||a.mode||'').toLowerCase()]||null;   /* (#R70) open straight into a view */
          /* (#R115) honour the REQUESTED indicators ("Compare … — GDP, defense and population" ignored them):
             resolve names/keys tolerantly (5 languages + synonyms) onto the panel's real IND keys. */
          const rawM=Array.isArray(a.metrics)?a.metrics.map(x=>String(x)):(a.metrics?[String(a.metrics)]:[]);
          const mkeys=[],missM=[];
          rawM.forEach(mm=>{ const mr=_cmpMetricKeys(mm); mr.keys.forEach(k=>{ if(mkeys.indexOf(k)<0) mkeys.push(k); }); mr.miss.forEach(x=>missM.push(x)); });
          let okC=false; try{ if(window.IntMapStatsCompare&&window.IntMapStatsCompare.open){ window.IntMapStatsCompare.open(cds.slice(0,10),mkeys.length?mkeys:null,(a.source==='imf'||a.source==='wb')?a.source:null,viewM); okC=true; } }catch(_){}
          /* (#R108/#R115) plain text, NO emoji in Atlas replies; name the indicators actually selected. */
          let mlbl=''; try{ if(okC&&mkeys.length&&window.IntMapStatsCompare.indLabel) mlbl=' — '+mkeys.map(k=>window.IntMapStatsCompare.indLabel(k)).join(', '); }catch(_){}
          let h2=okC?note(L('Country comparison opened','国の比較を開きました','Ländervergleich geöffnet','Сравнение стран открыто','Comparación abierta')+' ('+Math.min(10,cds.length)+')'+esc(mlbl)):warn('⚠');
          if(cds.length>10) h2+=warn('⚠ '+L('Only the first 10 countries are compared','比較は最大10か国です','Nur die ersten 10 Länder','Только первые 10 стран','Solo los primeros 10 países'));
          if(missC.length) h2+=warn('⚠ '+L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(missC.join(', ')));
          if(missM.length) h2+=warn('⚠ '+L('Not an available indicator','比較指標にない項目','Kein verfügbarer Indikator','Нет такого показателя','Indicador no disponible')+': '+esc(missM.join(', ')));
          return R(okC,h2); }
        case 'scoreMap': case 'customLayer': case 'evaluate': { /* (#R75) vision §13 — a NEW evaluation layer composed
          from weighted real indicators (bundled metrics and/or World-Bank codes), not a canned choropleth. */
          await ensureData();
          const comps=Array.isArray(a.components)?a.components.slice(0,8):[];
          if(comps.length<2) return R(false, warn('⚠ '+L('A custom score needs at least two indicators (components)','カスタム評価には指標が2つ以上必要です','Mindestens zwei Indikatoren nötig','Нужно минимум два показателя','Se necesitan al menos dos indicadores')));
          const resolved=[],missingC=[];
          for(const c of comps){ const w=(c&&c.weight!=null&&isFinite(+c.weight))?Math.max(0.1,Math.min(10,+c.weight)):1;
            const ser=await _seriesFor(c); if(!ser){ missingC.push(String((c&&(c.label||c.metric||c.wb))||'?').slice(0,40)); continue; }
            resolved.push({ser,norm:_normSeries(ser),w,inv:!!(c&&(c.invert||c.lowerIsBetter))}); }
          if(resolved.length<2) return R(false, warn('⚠ '+L('Not enough usable indicators','利用可能な指標が足りません','Zu wenige nutzbare Indikatoren','Недостаточно доступных показателей','Indicadores utilizables insuficientes')+(missingC.length?(' — '+L('unavailable','取得不可','nicht verfügbar','недоступно','no disponibles')+': '+esc(missingC.join(', '))):'')));
          const totW=resolved.reduce((s2,r2)=>s2+r2.w,0);
          const score={}; let excl=0;
          for(const cd in countryStats){ let sw=0,sv=0;
            resolved.forEach(r2=>{ const nv=r2.norm[cd]; if(nv==null) return; sv+=r2.w*(r2.inv?(1-nv):nv); sw+=r2.w; });
            if(sw>=totW*0.6) score[cd]=sv/sw; else if(sw>0) excl++; }
          const codes=Object.keys(score);
          if(codes.length<10) return R(false, warn('⚠ '+L('Too few countries have enough data for this combination','この組み合わせで十分なデータを持つ国が少なすぎます','Zu wenige Länder mit ausreichenden Daten','Слишком мало стран с данными','Muy pocos países con datos suficientes')));
          let cW=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc) _choroRamp=rampFrom(pc); else cW=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          clearHl(); clearChoro(); clearPolyHl(); clearLineHl();
          if(!ensureChoroLayer()) return R(false, warn('⚠ '+L('Could not draw the map shading','地図の濃淡を描けませんでした','Karteneinfärbung fehlgeschlagen','Не удалось окрасить карту','No se pudo sombrear el mapa')));
          try{ GE().layers.setPaint('nlq-choro','fill-color',_choroFillExpr(_choroRamp)); }catch(_){}
          let lo=1e9,hi=-1e9; codes.forEach(cd=>{ lo=Math.min(lo,score[cd]); hi=Math.max(hi,score[cd]); }); const span=(hi-lo)||1e-9;
          codes.forEach(cd=>{ const nv=(score[cd]-lo)/span; _choroState[String(cd)]=nv; try{ GE().layers.setFeatureState({source:'nlq-src',id:String(cd)},{choroV:nv}); }catch(_){} });
          _choroMetric='__custom'; _customScoreName=String(a.name||'').trim().slice(0,60)||L('Custom score','カスタム評価','Eigener Score','Пользовательская оценка','Puntuación propia');
          try{ GE().camera.flyTo({zoom:Math.min(GE().camera.getZoom(),2.3),duration:600}); }catch(_){}
          const rank=codes.map(cd=>({cd,v:score[cd]})).sort((x,y)=>y.v-x.v);
          const nTop=Math.max(3,Math.min(15,(+a.n||10)));
          const pct=v=>Math.round((v-lo)/span*100);
          let html='<div style="font-weight:600;margin:2px 0 5px;">🧮 '+esc(_customScoreName)+' — '+L('custom evaluation layer','カスタム評価レイヤー','eigene Bewertungsebene','пользовательский слой оценки','capa de evaluación propia')+'</div>';
          html+='<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">'+resolved.map(r2=>esc(r2.ser.label)+(r2.w!==1?(' ×'+r2.w):'')+(r2.inv?' ↓':'')).join(' · ')+'</div>';
          html+='<div style="height:12px;border-radius:6px;background:linear-gradient(90deg,'+_choroRamp.join(',')+');margin:4px 0;"></div>';
          html+='<ol style="margin:2px 0 0;padding-left:22px;line-height:1.6;font-size:12px;">'+rank.slice(0,nTop).map(r2=>'<li>'+esc(nm(countryStats[r2.cd]))+' <span style="color:var(--text-muted);">'+pct(r2.v)+'</span></li>').join('')+'</ol>';
          const worst=rank.slice(-3).reverse().map(r2=>esc(nm(countryStats[r2.cd]))+' ('+pct(r2.v)+')').join(', ');
          html+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px;">'+L('Lowest','最下位','Niedrigste','Худшие','Más bajos')+': '+worst+'</div>';
          /* honesty block (vision §15): method, coverage, exclusions, unavailable components */
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'
            +L('Method: each indicator normalized 0–1 (5th–95th percentile clamp'+(resolved.some(r2=>r2.ser.log)?', log scale where marked':'')+'), weighted mean; countries with under 60% of the total weight covered are excluded','算出: 各指標を0–1に正規化（5–95パーセンタイルでクランプ'+(resolved.some(r2=>r2.ser.log)?'・対数指標は対数変換':'')+'）し加重平均。総重みの60%未満しかデータの無い国は除外','Methode: Indikatoren 0–1 normalisiert (5.–95. Perzentil), gewichtetes Mittel; Länder unter 60% Abdeckung ausgeschlossen','Метод: нормализация 0–1 (5–95 перцентиль), взвешенное среднее; страны с покрытием <60% исключены','Método: normalización 0–1 (percentil 5–95), media ponderada; países con <60% de cobertura excluidos')
            +' · '+codes.length+' '+L('countries scored','か国を評価','Länder bewertet','стран оценено','países evaluados')+(excl?(' · '+excl+' '+L('excluded for missing data','か国はデータ不足で除外','wegen Datenlücken ausgeschlossen','исключено из-за пропусков','excluidos por falta de datos')):'')
            +(missingC.length?('<br>⚠ '+L('Unavailable components skipped','取得できず除外した指標','Nicht verfügbare Komponenten übersprungen','Недоступные компоненты пропущены','Componentes no disponibles omitidos')+': '+esc(missingC.join(', '))):'')+'</div>';
          /* (#R104) the "会話で調整できます: 「家賃を重視して」…" hint line was REMOVED per request ("この説明はいらない"). */
          return R(true, note(html)+cW); }
        case 'explore': case 'findRelated': case 'relatedMetrics': { /* (#R75) vision §10 — which indicators MOVE WITH a
          target metric, computed on the real country data (Pearson + Spearman), reported without causal claims. */
          await ensureData();
          const sp=_metSpec(a.metric||a.target||a.key||a.name);
          if(!sp) return R(false, warn('⚠ '+L('Unknown metric','不明な指標','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')+': '+esc(String(a.metric||a.target||''))+' — '+L('valid','有効','gültig','допустимо','válidos')+': pop, density, area, gdp, gdppc, hdi, dem, milSpend, milSpendGDP, tfr, lifeExp, internet'));
          await _fillMetric(sp.key); await _fillMetric('lifeExp'); await _fillMetric('internet'); await _fillMetric('tfr');   /* lazy fields → WB bulk (sequential — WB throttles bursts) */
          const tv={}; for(const cd in countryStats){ const s=countryStats[cd]; if(!s) continue; let v=sp.m.get(s); if(v==null||isNaN(v)) continue; if(sp.m.log&&v<=0) continue; tv[cd]=sp.m.log?Math.log(v):v; }
          if(Object.keys(tv).length<25) return R(false, warn('⚠ '+L('Not enough data for this metric','この指標はデータ不足です','Zu wenig Daten','Недостаточно данных','Datos insuficientes')));
          const ALL=Object.assign({},METRICS,XMET); const out=[];
          for(const k in ALL){ if(k===sp.key) continue; const m2=ALL[k]; const xs=[],ys=[],cds=[];
            for(const cd in tv){ const s=countryStats[cd]; let v=m2.get(s); if(v==null||isNaN(v)) continue; if(m2.log&&v<=0) continue; xs.push(m2.log?Math.log(v):v); ys.push(tv[cd]); cds.push(cd); }
            if(xs.length<25) continue;
            const r=_pearson(xs,ys); const rho=_pearson(_ranks(xs),_ranks(ys)); if(r==null||rho==null) continue;
            /* biggest outlier = country least explained by the linear fit (vision §10: 反証となる事例) */
            let mx2=0,mi=-1; const mxv=xs.reduce((s2,v)=>s2+v,0)/xs.length, myv=ys.reduce((s2,v)=>s2+v,0)/ys.length;
            const sdx=Math.sqrt(xs.reduce((s2,v)=>s2+(v-mxv)*(v-mxv),0)/xs.length)||1, sdy=Math.sqrt(ys.reduce((s2,v)=>s2+(v-myv)*(v-myv),0)/ys.length)||1;
            for(let i2=0;i2<xs.length;i2++){ const e=Math.abs(((ys[i2]-myv)/sdy)-r*((xs[i2]-mxv)/sdx)); if(e>mx2){ mx2=e; mi=i2; } }
            out.push({k,label:lx(m2.label),r,rho,n:xs.length,outlier:mi>=0?nm(countryStats[cds[mi]]):null}); }
          if(!out.length) return R(false, warn('⚠ '+L('No overlapping data to correlate','相関を計算できる重複データがありません','Keine überlappenden Daten','Нет пересекающихся данных','Sin datos superpuestos')));
          out.sort((x,y)=>Math.abs(y.rho)-Math.abs(x.rho));
          const top=out.slice(0,Math.max(3,Math.min(8,(+a.n||5))));
          let html='<div style="font-weight:600;margin:2px 0 5px;">🔗 '+esc(lx(sp.m.label))+' — '+L('related indicators (all countries)','関連する指標（全カ国データ）','verwandte Indikatoren','связанные показатели','indicadores relacionados')+'</div>';
          html+=top.map(t2=>{ const dir=t2.rho>0?'↗':'↘'; const st=Math.abs(t2.rho)>=0.7?L('strong','強い','stark','сильная','fuerte'):Math.abs(t2.rho)>=0.4?L('moderate','中程度','mittel','умеренная','moderada'):L('weak','弱い','schwach','слабая','débil');
            return '<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.12);font-size:12px;"><span style="flex:0 0 auto;font-weight:700;">'+dir+'</span><span style="flex:1;min-width:0;">'+esc(t2.label)+'<br><span style="font-size:10.5px;color:var(--text-muted);">ρ='+t2.rho.toFixed(2)+' · r='+t2.r.toFixed(2)+' · n='+t2.n+(t2.outlier?(' · '+L('biggest exception','最大の例外','größte Ausnahme','главное исключение','mayor excepción')+': '+esc(t2.outlier)):'')+'</span></span><span style="flex:0 0 auto;font-size:10.5px;color:var(--text-muted);">'+st+'</span></div>'; }).join('');
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'
            +L('ρ = Spearman rank correlation, r = Pearson (log scale where the metric is log-distributed). Correlation is NOT causation — third factors (income, region) can drive both sides; the listed exception countries are good places to test any explanation.','ρ=スピアマン順位相関、r=ピアソン（対数分布の指標は対数変換）。相関は因果ではありません — 所得や地域など第三の要因が両方を動かしている可能性があります。「最大の例外」の国は説明を検証する良い材料です。','ρ=Spearman, r=Pearson (log wo markiert). Korrelation ist keine Kausalität.','ρ=Спирмен, r=Пирсон (лог. где отмечено). Корреляция — не причинность.','ρ=Spearman, r=Pearson (log donde corresponde). Correlación no es causalidad.')+'</div>';
          return R(true, note(html)); }
        case 'impact': case 'impactAnalysis': case 'nearbyCritical': { /* (#R75) vision §11 — WHERE an event's impact
          spreads: real critical facilities + population context + nearby quakes/news around a point, on the map. */
          await ensureData();
          const kmR=Math.max(20,Math.min(1500,(+a.km||300)));
          let ctr=null,label='',evLine='';
          const wantQuake=(String(a.event||'').toLowerCase()==='quake')||/地震|earthquake|quake/i.test(String(a.place||a.event||''));
          if(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)){ ctr={lng:+a.lng,lat:+a.lat}; label=String(a.place||'').trim()||((+a.lat).toFixed(2)+', '+(+a.lng).toFixed(2)); }
          else if(wantQuake){
            const j=await _fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
            let fs=(j&&j.features)||[]; if(!fs.length) return R(false, warn('⚠ '+L('No M2.5+ earthquakes in the last 24 h','直近24時間にM2.5以上の地震がありません','Keine Beben M2.5+ in 24 h','Нет землетрясений M2.5+ за сутки','Sin sismos M2.5+ en 24 h')));
            /* nearest to the last referenced place if we have one, else the largest of the day */
            let f=null; if(_lastPlace&&isFinite(_lastPlace.lng)){ let bd=1e9; fs.forEach(f2=>{ const c=f2.geometry&&f2.geometry.coordinates; if(!c) return; const d=_havKm({lng:+c[0],lat:+c[1]},_lastPlace); if(d<bd){ bd=d; f=f2; } }); if(bd>1500) f=null; }
            if(!f) f=fs.slice().sort((x,y)=>(((y.properties&&y.properties.mag)||0)-((x.properties&&x.properties.mag)||0)))[0];
            const c=f.geometry.coordinates; ctr={lng:+c[0],lat:+c[1]}; label=(f.properties&&f.properties.place)||'earthquake';
            const hAgo=f.properties&&f.properties.time?Math.round((Date.now()-f.properties.time)/3600000):null;
            evLine='M'+(f.properties&&f.properties.mag!=null?(+f.properties.mag).toFixed(1):'?')+(c[2]!=null?(' · '+L('depth ','深さ','Tiefe ','глубина ','prof. ')+Math.round(c[2])+' km'):'')+(hAgo!=null?(' · '+hAgo+L('h ago','時間前','h zuvor','ч назад','h atrás')):'')+' · USGS';
            _setLast({lng:ctr.lng,lat:ctr.lat,name:label});
          } else {
            const p=String(a.place||'').trim(); let g=null;
            if(p&&!DEIXIS_RE.test(p)){ try{ g=await placeExtent(p); }catch(_){} if(!g){ try{ g=await geocode(p); }catch(_){} } }
            else g=await geocode(p);
            if(!g||!isFinite(+g.lng)) return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(p)));
            ctr={lng:+g.lng,lat:+g.lat}; label=g.name||p;
          }
          const d2r=Math.PI/180; const dLat=kmR/111, dLng=kmR/(111*Math.max(0.2,Math.cos(ctr.lat*d2r)));
          const box=[[ctr.lng-dLng,ctr.lat-dLat],[ctr.lng+dLng,ctr.lat+dLat]];
          /* focus kinds → the existing real-data POI engine (OSM Overpass, mirror-raced) */
          const FK={nuclear:'nuclear power plant',dam:'dams',dams:'dams',port:'ports',ports:'ports',airport:'airports',airports:'airports',hospital:'hospitals',hospitals:'hospitals',military:'military bases',power:'power plants'};
          let kinds=Array.isArray(a.focus)?a.focus.map(x=>FK[String(x||'').toLowerCase()]).filter(Boolean):[];
          if(!kinds.length) kinds=['nuclear power plant','dams'];
          kinds=kinds.slice(0,3);
          const facJobs=kinds.map(k=>overpassPOIs(k,box,false,null).then(r2=>r2===null?overpassPOIs(k,box,true,null):r2).then(r2=>({k,list:r2||[]})).catch(()=>({k,list:[]})));
          /* real cities/towns with OSM population tags (the honest population anchor).
             Runs AFTER the facility queries — Overpass rejects parallel requests from one IP (measured live:
             the same query succeeds alone and 429s beside the facility race). */
          const cityJob=(async()=>{
            const bb='('+(ctr.lat-dLat).toFixed(3)+','+(ctr.lng-dLng).toFixed(3)+','+(ctr.lat+dLat).toFixed(3)+','+(ctr.lng+dLng).toFixed(3)+')';
            const q3='[out:json][timeout:12];node[place~"^(city|town)$"]["population"]'+bb+';out 200;';
            for(const ep of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']){
              try{ const ctl=new AbortController(); const tt=setTimeout(()=>ctl.abort(),14000);
                let j=null; try{ const r2=await fetch(ep+'?data='+encodeURIComponent(q3),{signal:ctl.signal}); if(!r2.ok) continue; j=await r2.json(); } finally{ clearTimeout(tt); }
                if(!j||!Array.isArray(j.elements)) continue;
                /* a successful reply with ZERO cities is a real answer (open ocean), not a failure */
                return j.elements.map(e=>({lng:+e.lon,lat:+e.lat,name:(e.tags&&(e.tags['name:'+(HOST.lang==='jp'?'ja':HOST.lang)]||e.tags.name))||'?',pop:+((e.tags&&e.tags.population)||0)})).filter(c2=>isFinite(c2.pop)&&c2.pop>0); }catch(_){}
            }
            return null; });
          const qkP=_fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson').catch(()=>null);
          const facRes=await Promise.all(facJobs);
          let cities=await cityJob();   /* sequential — after the facility race frees the Overpass slots */
          const qk=await qkP;
          /* distance-filter, sort, annotate */
          const inR=p2=>{ const d=_havKm(p2,ctr); return d<=kmR?d:null; };
          const fac=[]; facRes.forEach(fr=>{ (fr.list||[]).forEach(p2=>{ const d=inR(p2); if(d==null) return; fac.push(Object.assign({},p2,{_d:d,_k:fr.k})); }); });
          fac.sort((x,y)=>x._d-y._d);
          if(cities){ cities=cities.map(c2=>Object.assign(c2,{_d:inR(c2)})).filter(c2=>c2._d!=null).sort((x,y)=>y.pop-x.pop).slice(0,10); }
          let qkN=[]; if(qk&&Array.isArray(qk.features)) qkN=qk.features.filter(f2=>{ const c=f2.geometry&&f2.geometry.coordinates; return c&&_havKm({lng:+c[0],lat:+c[1]},ctr)<=kmR; });
          let news=null; try{ news=_newsData({lng:ctr.lng,lat:ctr.lat,name:label},label); }catch(_){}
          /* draw: pins (facilities + top cities) + the radius circle + fit */
          clearPois();
          _pois=fac.slice(0,50).map(p2=>({lng:p2.lng,lat:p2.lat,name:p2.name||p2._k,kind:p2._k+' · '+Math.round(p2._d)+' km',sum:'',url:'',src:'OpenStreetMap'}))
            .concat((cities||[]).slice(0,8).map(c2=>({lng:c2.lng,lat:c2.lat,name:c2.name,kind:L('city','都市','Stadt','город','ciudad')+' · '+L('pop ','人口','Bev. ','нас. ','pob. ')+c2.pop.toLocaleString()+' · '+Math.round(c2._d)+' km',sum:'',url:'',src:'OpenStreetMap'})));
          let okP=_pois.length?paintPois():true; for(let i2=0;i2<6&&!okP;i2++){ await new Promise(r2=>setTimeout(r2,700)); okP=paintPois(); }
          try{ if(typeof HOST.radiusKm!=='undefined') HOST.radiusKm=kmR; if(window._radiusFromPoint) window._radiusFromPoint(ctr.lng,ctr.lat); }catch(_){}
          try{ GE().camera.fitBounds(box,{padding:70,duration:1100,maxZoom:9}); }catch(_){}
          /* report */
          const cd0=codeAtPoint(ctr.lng,ctr.lat); const cs=cd0&&countryStats[cd0];
          const popSum=(cities||[]).reduce((s2,c2)=>s2+c2.pop,0);
          let html='<div style="font-weight:600;margin:2px 0 4px;">🎯 '+esc(label)+' — '+L('impact analysis within ','影響分析（半径','Wirkungsanalyse im Umkreis ','анализ воздействия в радиусе ','análisis de impacto en ')+kmR+' km'+(window.IntMapLang.t(HOST.lang,'','）'))+'</div>';
          if(evLine) html+='<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:5px;">'+esc(evLine)+'</div>';
          kinds.forEach(k=>{ const list=fac.filter(p2=>p2._k===k);
            html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+esc(k)+'</b>: '+list.length+(list.length?(' — '+list.slice(0,3).map(p2=>esc(p2.name||'?')+' ('+Math.round(p2._d)+' km)').join(', ')+(list.length>3?' …':'')):' '+L('(none found in OSM within the radius)','（半径内にOSM登録なし）','(keine in OSM im Radius)','(в OSM не найдено)','(ninguno en OSM en el radio)'))+'</div>'; });
          if(cities===null) html+='<div style="font-size:11px;color:#ff9f0a;">⚠ '+L('City/population query failed (Overpass busy) — population context unavailable','都市・人口の照会に失敗しました（Overpass混雑）','Stadt-/Bevölkerungsabfrage fehlgeschlagen','Запрос городов не удался','Consulta de ciudades falló')+'</div>';
          else if(cities.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Population nearby','周辺人口','Bevölkerung','Население рядом','Población cercana')+'</b>: ≈'+popSum.toLocaleString()+' '+L('in ','（','in ','в ','en ')+cities.length+L(' cities/towns w/ OSM population tags','都市・町のOSM人口タグ合計）',' Städten (OSM-Tags)',' городах (теги OSM)',' ciudades (etiquetas OSM)')+' — '+cities.slice(0,3).map(c2=>esc(c2.name)+' '+(c2.pop>=1e6?(c2.pop/1e6).toFixed(1)+'M':Math.round(c2.pop/1000)+'k')).join(', ')+'</div>';
          else html+='<div style="font-size:11px;color:var(--text-muted);">'+L('No populated cities/towns within the radius (per OSM population tags)','半径内に人口タグ付きの都市・町はありません（OSM基準）','Keine Städte im Radius (OSM)','Городов в радиусе нет (OSM)','Sin ciudades en el radio (OSM)')+'</div>';
          if(cs) html+='<div style="font-size:11px;color:var(--text-muted);">'+esc(nm(cs))+': '+L('density ','人口密度 ','Dichte ','плотность ','densidad ')+(cs.density!=null?Math.round(cs.density).toLocaleString()+'/km²':'—')+'</div>';
          if(qkN.length) html+='<div style="font-size:12px;margin:4px 0 1px;"><b>'+L('Earthquakes (7 days, in radius)','地震（過去7日・半径内）','Beben (7 Tage)','Землетрясения (7 дней)','Sismos (7 días)')+'</b>: '+qkN.length+' — max M'+Math.max.apply(null,qkN.map(f2=>(f2.properties&&f2.properties.mag)||0)).toFixed(1)+'</div>';
          if(news) html+='<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">📰 '+L('Loaded news near here','周辺の読み込み済みニュース','Geladene News','Новости рядом','Noticias cercanas')+':<br>'+esc(String(news).split('\n').slice(0,3).join(' · ').slice(0,220))+'</div>';
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'+L('Sources: OpenStreetMap (facilities, city population tags — coverage varies by region), USGS (earthquakes), IntMap country statistics. Pins are clickable; the circle marks the analysis radius.','出典: OpenStreetMap（施設・都市人口タグ — 地域によって登録密度が異なります）、USGS（地震）、IntMap国別統計。ピンはクリック可能、円は分析半径です。','Quellen: OpenStreetMap, USGS, IntMap-Statistiken.','Источники: OpenStreetMap, USGS, статистика IntMap.','Fuentes: OpenStreetMap, USGS, estadísticas de IntMap.')+'</div>';
          if(!okP&&_pois.length) html+=warn('⚠ '+L('Could not draw the markers (map still loading)','マーカーを描画できませんでした（地図読込中）','Marker nicht gezeichnet','Маркеры не отрисованы','Marcadores no dibujados'));
          return R(true, html); }
        case 'events': case 'newsEvents': case 'groupNews': { /* (#R76) vision §6 / stage 4 — the loaded news
          grouped into EVENTS (one real-world occurrence, many articles) instead of a flat article list.
          (#R340) THE GROUPING ITSELF IS js/news-cluster.js — the one implementation, with the production
          measurement behind every constant. This case picks the window and the area, draws and writes;
          it decides nothing about what counts as one event. ⚠ Do not re-inline a copy of it here. */
          await ensureData();
          if(typeof HOST.globalData==='undefined'||!HOST.globalData||!HOST.globalData.length){ try{ if(typeof fetchData==='function') await fetchData(); }catch(_){} }
          let items=(typeof HOST.globalData!=='undefined'&&HOST.globalData)?HOST.globalData.filter(it=>it&&it.analysis&&Array.isArray(it.analysis.loc)&&it.title):[];
          const hrs=Math.max(6,Math.min(168,(+a.hours||96)));
          items=items.filter(it=>{ const h=_agoH(it.pubDate); return h==null||h<=hrs; });
          /* optional place focus */
          let ctx=null; const plc=String(a.place||'').trim();
          if(plc&&!WORLD_RE.test(plc)){ if(DEIXIS_RE.test(plc)) ctx=await geocode(plc); else { try{ ctx=await placeExtent(plc); }catch(_){} if(!ctx){ try{ ctx=await geocode(plc); }catch(_){} } }
            if(!ctx) return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(plc)), {meta:{code:'PLACE_NOT_FOUND',category:'input',retryable:false,semanticTarget:plc,produced:[],userGoalSatisfied:false}});
            /* (#R340) the area filter asks the SAME question the grouper does — where the story IS, not where
               the pin currently sits (Publisher pin mode moves the pin to the newsroom; see newsSubject). */
            if(ctx.box&&_bboxOK(ctx.box)){ const w=ctx.box[0][0],s2=ctx.box[0][1],e=ctx.box[1][0],n2=ctx.box[1][1]; items=items.filter(it=>{ const sj=newsSubject(it.analysis); return sj&&sj.loc[0]>=w&&sj.loc[0]<=e&&sj.loc[1]>=s2&&sj.loc[1]<=n2; }); }
            else if(isFinite(+ctx.lng)) items=items.filter(it=>{ const sj=newsSubject(it.analysis); return sj&&_havKm({lng:sj.loc[0],lat:sj.loc[1]},ctx)<=800; }); }
          if(items.length<1) return R(true, note('◌ '+L('No geolocated articles in the loaded news for this window/area','この期間・範囲に地点解析済みの記事がありません','Keine georeferenzierten Artikel','Нет геолоцированных статей','Sin artículos geolocalizados')+' ('+hrs+' h'+(ctx&&ctx.name?(' · '+esc(ctx.name)):'')+')'), {meta:{code:'NO_ARTICLES',category:'evidence',retryable:true,semanticTarget:(ctx&&ctx.name)||'',temporalMode:'current',produced:[],userGoalSatisfied:false}});
          const evs=groupNewsEvents(items,{agoH:_agoH,fallbackH:hrs});   /* (#R340) ↳ js/news-cluster.js — the rules, the constants and the measurements that set them */
          const N=Math.max(3,Math.min(12,(+a.n||8)));
          const top=evs.slice(0,N);
          /* one pin per EVENT (not per article) */
          clearPois();
          _pois=top.map((e,i2)=>({lng:e.cx,lat:e.cy,name:(i2+1)+'. '+String(e.g[0].it.title).slice(0,70),
            kind:e.g.length+' '+L('articles','記事','Artikel','статей','artículos')+' · '+e.outlets.length+' '+L('outlets','媒体','Quellen','источников','medios'),
            sum:e.g.slice(0,3).map(x=>String(x.it.title).slice(0,80)).join(' ⏐ ').slice(0,320),
            url:(e.g[0].it.link&&/^https?:/i.test(e.g[0].it.link))?e.g[0].it.link:'',src:e.outlets.slice(0,3).join(', ')}));
          let okE=_pois.length?paintPois():true; for(let i2=0;i2<6&&!okE;i2++){ await new Promise(r2=>setTimeout(r2,700)); okE=paintPois(); }
          try{ let a2=180,b2=90,c2=-180,d2=-90; _pois.forEach(p2=>{ a2=Math.min(a2,p2.lng);b2=Math.min(b2,p2.lat);c2=Math.max(c2,p2.lng);d2=Math.max(d2,p2.lat); });
            if(_pois.length&&c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:90,maxZoom:8,duration:1100}); }catch(_){}
          const fmtH=h=>h<1?L('<1h ago','1時間以内','<1 h','<1 ч','<1 h'):Math.round(h)+L('h ago','時間前','h','ч назад','h');
          let html='<div style="font-weight:600;margin:2px 0 4px;">🗞 '+L('Events (grouped news, last ','出来事（ニュースをイベント単位に集約・過去','Ereignisse (letzte ','События (за ','Eventos (últimas ')+hrs+'h'+(window.IntMapLang.t(HOST.lang,')','）'))+(ctx&&ctx.name?(' — '+esc(ctx.name)):'')+'</div>';
          /* (#R340) the count is the number of articles the events are ACTUALLY built from, not the number
             loaded: the grouper caps the comparison at 600 (pairs are O(n²)) and skips an article whose
             subject will not resolve. Printing items.length would claim a coverage nobody delivered (#R320). */
          const graded=evs.reduce((n2,e)=>n2+e.g.length,0);
          html+='<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'+graded+' '+L('articles → ','記事 → ','Artikel → ','статей → ','artículos → ')+evs.length+' '+L('events; the ','イベント。上位','Ereignisse; Top ','событий; топ-','eventos; los ')+top.length+L(' biggest shown — click an item or pin to fly','件を表示 — 項目/ピンをクリックで移動',' angezeigt',' показаны',' mayores mostrados')+'</div>';
          top.forEach((e,i2)=>{ const first=e.g[e.g.length-1], latest=e.g[0]; const eu=_atlCleanUrl(latest.it.link);
            html+='<div class="atl-rp-item" data-i="'+i2+'" style="padding:5px 0;border-top:1px solid rgba(128,128,128,0.14);cursor:pointer;">'
              +'<div style="font-size:12px;font-weight:600;line-height:1.45;">'+(i2+1)+'. '+esc(String(latest.it.title).slice(0,110))+'</div>'
              +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">'+(e.pname?(esc(e.pname)+' · '):'')+e.g.length+' '+L('articles from ','記事・','Artikel von ','статей от ','artículos de ')+e.outlets.slice(0,4).map(esc).join(', ')+(e.outlets.length>4?' …':'')+' · '+fmtH(e.oldest)+' → '+fmtH(e.newest)+'</div>'
              +((e.g.length>1&&first.it.title!==latest.it.title)?('<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+L('First report','最初の報道','Erste Meldung','Первое сообщение','Primer reporte')+': '+esc(String(first.it.title).slice(0,90))+'</div>'):'')
              +(eu?(' <a href="'+esc(eu.url)+'" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--primary-color);text-decoration:none;">'+L('article','記事','Artikel','статья','artículo')+' ↗</a>'):'')   /* (#R153) inline event link via _atlCleanUrl (real article, no aggregator/SNS) */
              +'</div>'; });
          html+=linkCards(top.filter(e=>e.g[0].it.link).slice(0,4).map(e=>({url:e.g[0].it.link,title:e.g[0].it.title,src:e.outlets[0]})));
          /* (#R340) the numbers in this sentence are READ from the grouper, so the explanation cannot describe
             a rule the code no longer applies (#R76's copy still said «place ≤150 km» after the rule changed). */
          const _evR=L('place','位置','Ort','место','lugar')+' × ≤'+EVENT_RULES.HOURS+' h × '+L('headline similarity','見出し類似','Titelähnlichkeit','сходство заголовков','similitud de titulares')+' '+Math.round(EVENT_RULES.SIM_MIN*100)+'–'+Math.round(EVENT_RULES.SIM_MAX*100)+'%';
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'+L('Grouping is mechanical on the loaded IntMap feed ('+_evR+'). A country-level reference point is not a place, so articles that merely file under the same country face a HIGHER wording bar, not a lower one. One group = reports that likely cover the same occurrence; "first report → latest" shows how coverage moved. For source disagreements or deeper analysis, ask e.g. "analyze event 2".','グループ化は読み込み済みニュースに対する機械的クラスタリング（'+_evR+'）です。国レベルの代表点は「同じ場所」とは見なさないので、同じ国に分類されただけの記事には見出しの一致を<b>より強く</b>求めます。1グループ=同一の出来事を扱うとみられる報道で、「最初の報道→最新」で経過が分かります。報道間の相違や深掘りは「2番の出来事を分析して」のように聞いてください。','Mechanische Gruppierung ('+_evR+'); ein Länder-Referenzpunkt gilt nicht als Ort. Für Analysen: "analysiere Ereignis 2".','Механическая группировка ('+_evR+'); точка-представитель страны местом не считается. Для анализа: «проанализируй событие 2».','Agrupación mecánica ('+_evR+'); un punto representativo de país no cuenta como lugar. Para análisis: "analiza el evento 2".')+'</div>';
          if(!okE&&_pois.length) html+=warn('⚠ '+L('Could not draw the pins (map still loading)','ピンを描画できませんでした（地図読込中）','Pins nicht gezeichnet','Метки не отрисованы','Pines no dibujados'));
          /* (#R340) …and the structured half of the same honesty: research.events declares produces='map,explanation',
             so the result says which of the two actually happened rather than letting the executor assume both. */
          const _evMapped=!!(okE&&_pois.length);
          return R(true, html, {meta:{code:'OK',category:'ok',retryable:false,produced:(_evMapped?['map','explanation']:['explanation']),userGoalSatisfied:true,partial:!_evMapped}}); }
        case 'module': return doModule(a);
        /* (#R231) 「Monitorsは…一旦撤去」 — the ~120-line body is deleted (it is in git; the file has
           a line ceiling). It ended in IntMapOS.exec('tab.monitors'), which is no longer registered,
           so it would have replied "✓ Your monitors" and opened nothing — #R141's own rule forbids
           claiming a result that did not happen. Nothing can reach this case now; if one ever does,
           it says so. Restoring the feature: this case, the catalogue note below, the tab button in
           index.html, and the two routes in js/session-tabs.js. See DEV-NOTES #R231 §Monitors. */
        case 'monitor':
          return R(false, warn('⚠ '+window.IntMapLang.t(HOST.lang,'Area monitors are not available right now.','エリア監視は現在ご利用いただけません。','Gebietsmonitore sind derzeit nicht verfügbar.','Мониторы районов сейчас недоступны.','Los monitores de área no están disponibles por ahora.')), {meta:{code:'FEATURE_WITHDRAWN',category:'capability',retryable:false,userGoalSatisfied:false,produced:[]}});
        case 'control': return doControl(a);
        case 'answer': { let _ah='<div style="font-size:14px;line-height:1.68;">'+mdMini(a.text||'')+'</div>';   /* (#R149) if the answer NAMED mappable places, pin them (unless the plan already pinned) so a location-rich reply always delivers map value */
          /* (#R156) shared spine: a text answer may also carry a content class + verifiable checks (e.g. the model solved
             an equation in prose). Verify the checks deterministically, show the honest self-check note, and let the SAME
             class gate mapping below — so a math/code/document text answer never runs place extraction either. */
          const _acls=_atlContentClass(a.contentClass); try{ const _cv=_atlVerifyChecks(a.checks); _ah+=_atlChecksNoteHtml(_cv); }catch(_){}
          /* (#R150) same code-side reconciliation for the planner's direct `answer`: audit the answer text (safety net
             for an omitted places list), merge with existing pins, honest self-audit + source-concentration note. */
          { const _acit=_curPlanCites.slice();   /* ⚠ (#R350) from the planner call that produced THIS answer. It used to be window._aiLastCitations, read at RENDER time — so a second Atlas turn finishing in between handed this reply the other turn's sources, under the heading 「Web検証済みソース」. */
            try{ if(_atlShouldMap(_acls)) _ah+=await _pinReplyPlaces(a.places||[],{text:String(a.text||''),citations:_acit,contentClass:_acls}); }catch(e){ try{ console.warn('answer map audit',e); }catch(_){} }
            /* (#R153) the planner's direct `answer` used to render ZERO sources even when the model's hosted web search
               returned citations — the dominant "出展が全くない" (no sources at all) driver. Show the web-verified cards
               when they exist (anchored to the reply → no relevance gate). When the answer was from the model's own
               knowledge there simply are no web sources, which is honest — not a bug. */
            try{ const sc=linkCards(_acit.map(c=>({url:c.url,title:(c.title||c.url),src:''}))); if(sc) _ah+='<div class="atl-src-h">'+L('Web-verified sources','Web検証済みソース','Web-verifizierte Quellen','Проверенные в интернете источники','Fuentes verificadas en la web')+'</div>'+sc; }catch(_){} }
          return R(true, _ah); }
        default: { if(a.target||a.name){ const c=doControl({target:a.target||a.name,value:a.value,on:a.on}); if(c.ok) return c; } return R(false, warn('⚠ '+L('Unknown action','不明な操作','Unbekannte Aktion','Неизвестное действие','Acción desconocida')+': '+esc(a.type||''))); }
      } }
    /* (#R64) "別の言語で話しかけても、言語設定の言語でしか返答しないのはやめろ" — Atlas answers in the language
       the USER'S MESSAGE is written in. Script/stop-word detection gives the model a strong hint; unclear input
       falls back to the UI language. */
    let _lastUserMsg='';
    function _replyLang(){ const s=String(_lastUserMsg||'');
      if(/[぀-ヿ]/.test(s)) return 'Japanese';   /* kana present → unambiguously Japanese */
      if(/[가-힯]/.test(s)) return 'Korean';
      if(/[؀-ۿ]/.test(s)) return 'Arabic';
      if(/[а-яё]/i.test(s)) return 'Russian';
      if(/[a-zà-ÿœß]/i.test(s)){ const low=' '+s.toLowerCase()+' ';
        if(/\s(der|die|das|und|nicht|eine?|zeige?|bitte|karte|wo\s+ist)\s/.test(low)||/[äöüß]/.test(s)) return 'German';
        if(/\s(el|la|los|las|una?|qué|cómo|dónde|muestra|país|por favor)\s/.test(low)||/[¿¡ñ]/.test(s)) return 'Spanish';
        if(/\s(le|les|une?|est|montre|où|carte|pays|s'il)\s/.test(low)) return 'French';
        if(/\s(il|lo|gli|una?|dove|mostra|paese|per favore)\s/.test(low)) return 'Italian';
        if(/\s(the|is|are|show|please|what|where|map|and|of|to)\s/.test(low)) return 'English';
      }
      /* (#R85d) CJK ideographs WITHOUT kana: NEVER assume Chinese — IntMap does not reply in Chinese, and its users
         write Japanese in kanji ("漢字で入力したら中国語で返答される" bug). Mirror the user's chosen UI language. */
      /* (#R318) …and the five-entry table that implemented it made the SAME mistake in reverse:
         a Traditional-Chinese, French or Korean reader writing Han characters fell off the end of
         it and was answered in Japanese. #R85d's rule is kept exactly — kanji WITHOUT kana never
         implies Chinese — by mirroring the reader's own UI language, which is now all nine of them.
         ⚠ AND IntMap DOES REPLY IN CHINESE NOW (#R223 added zh-Hant, #R224 zh-Hans). The comment
         above predates both; the RULE it states still holds, its reason no longer does. */
      if(/[一-鿿㐀-䶿]/.test(s)){ try{ return window.IntMapLang.englishName(HOST.lang); }catch(_){ return 'Japanese'; } }
      return (typeof _aiLangName==='function')?_aiLangName():'English'; }
    /* (#R155) Reply-language LOCK. _replyLang() already resolves the right language (kana→Japanese,
       Cyrillic→Russian, …, and — crucially — Han-characters-WITHOUT-kana → the user's UI language, since
       IntMap never replies in Chinese and its users write Japanese in kanji). The old wording ("ALWAYS
       mirror the user's language, never the UI language") made the model IGNORE that and reply in Chinese
       whenever a Chinese place name appeared ("山東省 → 中国語で返答" bug). Now we state the target language
       firmly and explicitly rule out place/person/org names changing it. */
    const _langLine=()=>{ const l2=_replyLang(); return l2+' (write EVERYTHING in '+l2+', every sentence — a place, person or organization name in the request, even one written in Han/Chinese or Korean characters, NEVER changes the reply language)'; };   /* (#R285) The keigo tail #R147 appended here is gone — one of only two copies of the ONLY part of a persona this codebase had ever written down, and it said "unless the user is clearly casual", which the specification supersedes (「ただし常に自然な敬語」). The register lives in the persona now (clause `address`), which every caller of this line carries. */
    /* ══ (#R318) THE STATE THIS FILE OWNS, AS DATA ═════════════════════════════════════════════
       `stateContext()` used to BE the state: 29 hand-written sentences, one per subject, added by
       whichever round needed one. A subject nobody remembered to add was invisible to the planner —
       #R278 in another form. Now the facts are published as structures and the sentence is derived
       from them (js/atlas-state.js `renderPrompt`), so the READING RULES live in one place and the
       FACTS in another, and neither can go stale without the other noticing. */
    function _selectionState(){ const o={lastPlace:null,countryCard:null,article:null,searchBox:''};
      try{ if(_lastPlace&&_lastPlace.name) o.lastPlace={name:_lastPlace.name}; }catch(_){}
      try{ if(window._cpCurrent&&window._cpCurrent.name) o.countryCard={name:window._cpCurrent.name}; }catch(_){}
      try{ const rd=window._imReader; if(rd&&rd.open&&rd.title) o.article={ title:String(rd.title).slice(0,140), publisher:rd.publisher||'', pubDate:rd.pubDate?String(rd.pubDate).slice(0,16):'', place:rd.place||'', loc:(rd.loc&&isFinite(rd.loc[0]))?[+rd.loc[0],+rd.loc[1]]:null, body:rd.body?String(rd.body).slice(0,2600):'' }; }catch(_){}
      try{ const si=document.getElementById('map-search')||document.getElementById('search-input'); if(si&&si.value&&String(si.value).trim()) o.searchBox=String(si.value).trim().slice(0,60); }catch(_){}
      return o; }
    function _atlasOverlayState(){ const o={highlightCountries:0,highlight:null,choropleth:null,customScore:null,pins:null,polygons:null,lines:null,measure:null,radius:null,userPins:null,tool:''};
      try{ if(_hl&&_hl.size&&_ovlVisible('highlight')) o.highlightCountries=_hl.size; }catch(_){}
      try{ if(_wctx.highlight&&_wctx.highlight.name&&_ovlVisible('highlight')) o.highlight={name:_wctx.highlight.name,basis:_wctx.highlight.basis||''}; }catch(_){}
      try{ if(_choroMetric&&METRICS[_choroMetric]) o.choropleth={label:lx(METRICS[_choroMetric].label)};
           else if(_choroMetric==='__custom'&&_customScoreName) o.customScore={name:_customScoreName}; }catch(_){}
      try{ if(_pois&&_pois.length) o.pins={n:_pois.length,kind:(_pois[0]&&_pois[0].sum)?'research':'poi'}; }catch(_){}
      try{ if(_hlPolys&&_hlPolys.length&&_ovlVisible('highlight')) o.polygons={n:_hlPolys.length,names:_hlPolys.map(p=>p.name).filter(Boolean).slice(0,4)}; }catch(_){}
      try{ if(_hlLines&&_hlLines.length) o.lines={n:_hlLines.length}; }catch(_){}
      try{ if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length) o.measure={n:HOST.measurePoints.length}; }catch(_){}
      try{ if(typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length) o.radius={n:HOST.radiusItems.length}; }catch(_){}
      try{ if(typeof HOST.userPins!=='undefined'&&HOST.userPins&&HOST.userPins.length) o.userPins={n:HOST.userPins.length}; }catch(_){}
      try{ if(typeof HOST.toolMode!=='undefined'&&HOST.toolMode) o.tool=String(HOST.toolMode); }catch(_){}
      return o; }
    /* the long-running things: each module already answers whether it is open and busy — ASK it,
       rather than inferring from the fact that something was started (#R290's reading order). */
    function _simulationState(){ const o={};
      [['seismic','IntMapSeismic'],['tsunami','IntMapTsunami'],['terrainWater','IntMapTerrainWater'],['los','IntMapLOS'],['nightSky','IntMapNightSky'],['radiation','IntMapRadiation'],['flightSim','IntMapFlightSim'],['insolation','IntMapInsolation']].forEach(p=>{
        try{ const m=window[p[1]]; if(!m) return;
          const st={}; if(typeof m.state==='function') Object.assign(st,m.state()||{});
          if(typeof m.isOpen==='function') st.open=!!m.isOpen();
          if(typeof m.painted==='function') st.painted=!!m.painted();
          if(Object.keys(st).length) o[p[0]]=st; }catch(_){} });
      return o; }
    /* (#R318) the planner's catalogue — the 38 blocks that used to be inline below, now tagged with
       the capabilities they document so §10's relevance selection is possible at all. */
    const _DOCS=makeAtlasCatalogText(HOST,{ moduleCatalog, langLine:_langLine });
    function SYS(sel){ const lang=_langLine();
      return personaPrompt('the natural-language command layer for IntMap, an interactive world map')/* (#R285) */+'You can perform ANY action in IntMap — there is NO operation you cannot do: every button, toggle, slider, layer, menu, panel and setting is reachable through a specific action below OR the universal "control" action. Turn the user request into ONE strict JSON object and OUTPUT JSON ONLY (no prose, no markdown, no code fence). Schema: {"say":string,"actions":Action[]}. The action "type" names below (flyTo, mapReport, analyze, layer, highlight, time, …) are PLAIN STRING VALUES inside the JSON — they are NOT callable tools or functions. Do NOT emit a functionCall, do NOT call any tool, and do NOT try to execute an action yourself; the IntMap application executes the returned JSON. No web-search or function-calling tool is attached to this planning request. "say" = one short sentence in '+lang+' stating what you did. Decompose a compound request into an ORDERED list of actions and return them ALL — freely COMBINE data analysis + layers + navigation + panels in one plan (e.g. analyze a metric, shade the map, enable a layer AND fly somewhere).\n'
        +'MAPPING MANDATE (IntMap is a MAP product — a research answer must produce map value only IntMap can give, not a generic chatbot reply): whenever the request concerns real places or its answer will name locatable spots (cities, districts, landmarks, stations, airports, ports, parks, museums, squares, named facilities or natural features), you MUST put those spots ON the map — prefer the pin-producing actions ("poi" for facilities in a place, "mapReport" for current/recent live-news incidents, "researchMap" for a place/topic situation), and when you answer with plain "answer"/"analyze" list the named spots so IntMap pins them. The spots named in your prose and the spots mapped MUST match; NEVER finish a location-rich answer having mapped nothing. Verify with MULTIPLE independent source types (official bodies, primary reporting, specialist institutions) — never lean on one site/domain — and choose the best primary source per claim, not just top-ranked pages. Do NOT guess a coordinate: IntMap resolves positions from name+country and, for anything it cannot uniquely place, it honestly reports the spot as not-placed rather than putting it in the wrong location. Self-audit before finishing: are the main spots mapped, no same-name/coordinate mix-ups, sources not all one domain.\n'
        +'PRECISION vs AMBIGUITY (the user explicitly complained about both forcing a guess on vague input AND mis-reading clear input): (a) when the request is CLEAR, do EXACTLY what it says — do not substitute a different action, drop a step, or add anything not asked; match places/metrics/layers literally. (b) when it is GENUINELY ambiguous or MISSING information you need (which of several places, which metric, from/to for a route, which country, etc.), do NOT force a wrong guess — emit a SINGLE {"type":"ask","question":<one short question in '+lang+'>,"options":[2-4 concrete choices],"allowText":true}. This renders the question with clickable option chips AND a free-text box, and the user\'s pick comes back to you as the next message — ALWAYS prefer this selection form over a plain guess when key info is missing. Only fall back to {"type":"answer"} for a purely conversational clarification with no sensible options. Otherwise never refuse. Never claim success for something you did not emit an action for.\n'
        +'HONESTY: NEVER use "answer" (or the "say" text) to claim you did something you did not emit a real action for — that is a lie the user explicitly complained about. To DO anything you MUST emit its action. "say" must describe ONLY what the actions in this plan actually do. If a request is impossible or unclear, emit a single honest {"type":"answer"} explaining it, and emit NO action you cannot fulfil. Decompose multi-part requests fully (5+ actions is fine) and keep them in the order the user implied.\n'
        +'SCOPE & SAFETY (do NOT over-refuse — the user complained that a request was blocked wholesale just because it contained a sensitive-sounding word): NEVER judge by keyword. Assess every request on FOUR axes — (1) PURPOSE: analysis / defense / preparedness / education / journalism vs genuine operational harm; (2) TARGET: a broad area or public installation vs a precise strike point or a named private individual; (3) PRECISION: approximate / public-information / illustrative vs real-time or targeting-grade; (4) OUTPUT: an explanation or a map visualization vs step-by-step instructions to cause harm. DEFAULT TO DOING A SAFE VERSION; full refusal is the LAST resort. When a request is sensitive but has a legitimate reading, TRANSFORM it and EXECUTE: turn a precise point into a BROAD public zone, keep only PUBLIC already-reported information, recast "how to attack / optimize a strike" as threat-assessment / reach / defense / preparedness, ALWAYS state the uncertainty and that it uses public information, and actually RUN the safe map actions (drawPolygon for a broad zone, radius for reach/range rings, missile for a representative arc, radiation or impact for an affected area, highlight, flyTo). Apply this SAME purpose/target/precision/output test generally across sensitive domains — military and weapons, disasters, disease and epidemics, hazardous chemicals / CBRN, crime and policing statistics, cyber, and critical infrastructure — never a keyword blocklist. REFUSE only the specific harmful slice (real-time targeting for an actual attack, a precise strike or kill plan against a specific person or an undefended civilian site, or genuinely operational instructions for building a weapon or synthesising a dangerous agent) and even then do NOT dead-end: in "say"/"answer" name the safe public-information analysis you CAN give and still emit the safe actions. Example — "using public information, show the approximate area a missile could be launched from country A toward country B": DO IT — emit a broad drawPolygon launch-region zone plus radius reach rings (optionally a representative missile arc), and in "say" note it is an approximate estimate from public information for situational / defensive analysis, not targeting data. Do NOT reply with a bare refusal.\n'
        +'COMMON SENSE — do NOT take a generic word as a literal place name (these were real failures): "the whole world / entire world / earth / globe / 世界 / 地球" means ZOOM OUT to the planet → emit {"type":"flyTo","place":"world"} (NEVER geocode "world"/"earth" — they wrongly matched "World Bank building" / "Earth, Texas"). To show a COUNTRY or CITY, pass its plain name as flyTo place (e.g. {"type":"flyTo","place":"China"} / {"type":"flyTo","place":"Osaka"}) — the engine frames the whole country / city area itself; do NOT append "city hall" or pick a tiny sub-place, and do NOT over-zoom. The Köppen climate layer (and other color rasters) cannot isolate a SINGLE class: for "highlight the Cfa climate", enable the Köppen layer with {"type":"layer","name":"Köppen climate"} and, in "say", tell the user the Cfa zones are identified by the legend (do not claim you isolated Cfa).\n'
        +'CONTEXT IS CRITICAL: the user message contains a [CURRENT MAP STATE] block (center, zoom, base, view, active layers, highlighted/shaded data, open country, language/theme/units) and a [RECENT CONVERSATION] block. You MUST read them and interpret the [NEW REQUEST] relative to them. Resolve every reference — "it / that / this / there / here / this country / the same / again / now / also / instead / turn it off / make it bigger / zoom in more / the other one / the Nth" — using that state and history. A short follow-up is usually a TWEAK of the previous turn: keep what still applies and change only what was asked (e.g. after "top 10 by GDP", "now per capita" → rank gdppc; after "fly to Tokyo", "weather there" → weather Tokyo; after enabling a layer, "turn it off" → same layer on:false). For "here/there/this place" you may pass place:"there" and it resolves to the last place or the map center. Action types:\n'
        /* (#R318) THE ACTION CATALOGUE, FROM THE CAPABILITY REGISTRY — js/atlas-catalog-text.js holds
           the 38 blocks that stood here, byte for byte, each tagged with the capabilities it documents;
           js/atlas-capabilities.js is the registry they are tagged against. `sel` is what §10 buys: a
           request about routes gets the routing blocks, not all 57 kB. No selection ⇒ every block, in
           source order ⇒ the prompt #R311 sent. ⚠ THE WITHDRAWN `monitor` ACTION IS STILL ABSENT and
           still for #R231's reason — it is now recorded as WITHDRAWN in the registry, with the proof
           the audit checks, instead of as a comment nothing could read. */
        +_DOCS.text((sel&&sel.ids)||null)
        +'INTMAP HELP / HOW-TO: you are ALSO IntMap\'s built-in help. When the user asks how to DO something in IntMap, what a feature does, or what the app / you can do ("how do I compare countries?", "Chronosの使い方", "how do I turn on a layer?", "what can you do?"), ANSWER it with {"type":"answer"} using the feature knowledge in THIS prompt (the action list above IS the feature set). Be concrete and concise: name the panel/control (Layers panel, the Countries tab, the Chronos button bottom-right, workspace mode) AND give the exact plain-language phrase they can type to me to do it (e.g. \'just say "compare Japan and Germany"\'). You MAY also emit the action itself alongside the answer to demonstrate it. Do not route how-to questions through analyze/brief.\n'
        +'CURRENT-FACT GROUNDING (hallucination ban — the user was given a WRONG current prime minister once; that must never happen again): your parametric memory of "who currently holds office / what is the current government, war status, price, record" is stale by definition. For ANY question whose answer can change over time — current leaders (首相/大統領/首脳), cabinets, election results, ongoing conflicts, prices, "latest/current/now/最近/現在" anything — NEVER answer from memory with {"type":"answer"}. Emit {"type":"analyze","question":...} (it runs a live web search and answers from evidence) or {"type":"mapReport"} when mappable. If you are not fully certain a fact is timeless, treat it as current and route it through analyze.\n'
        +'Examples (note scale + full decomposition): "fly to Africa" → [{flyTo,place:"Africa",scale:"continent"}]; "zoom into Shibuya, Tokyo" → [{flyTo,place:"Shibuya, Tokyo",scale:"city"}]; "dark mode, fly to Taiwan, show military spending layer and the weather" → [theme, {flyTo,place:"Taiwan",scale:"country"}, layer, weather]; "shade the world by GDP per capita, list the top 10, and turn on the globe tilted" → [mapMetric, rank, {projection,mode:"globe"}, {pitch,deg:55}]; "go to the Strait of Hormuz, satellite, draw a 50km circle and show the wind" → [{flyTo,place:"Strait of Hormuz",scale:"region"}, {base,mode:"satellite"}, {radius,place:"Strait of Hormuz",km:50}, {layer,name:"Wind (animated)"}].\n'
        +'AVAILABLE LAYERS — use these EXACT names for "layer"/"opacity": '+layerCatalogText()+'\n'
        +'Other controls for "control" (name [#id]): '+controlCatalog(sel&&sel.q);   /* (#R320) RANKED against this request, not the first 140 in DOM order — and whatever it leaves out, it says so */
    }
    /* ---- UI ---- */
    let panel=null, chatEl=null, inEl=null, styled=false;
    let _atlImgs=[];   /* (#R149) pending pasted/attached image data-URLs to send with the next message (vision) */
    let _atlFiles=[];  /* (#R158) pending NON-image, text-extractable file attachments {name,text,size,truncated} — their text is fed to the model with the next message */
    /* (#R158) which files Atlas accepts. Images → the vision channel (OpenAI input_image). Text-extractable files
       (text/*, code, data) → their content is read client-side and given to the model. Binary types we can't decode
       (pdf/docx/zip) are declined honestly (the vision channel is image-only; no document parser is loaded). */
    const _ATL_FILE_MAX=60000;   /* per-file text cap; larger files are truncated with a note. (#R232) atlFileKind / atlReadText / atlFmtBytes moved to js/atlas-attach.js. */
    /* (#R313) the whole stylesheet is js/atlas-styles.js — the ceiling on this file is never raised,
       so a subject moves out instead (see the note there). Nothing about the CSS changed. */
    function ensureStyle(){ if(styled) return; styled=true; const s=document.createElement('style');
      s.textContent=atlasPanelCSS()+answerCSS;   /* (#R350) citation pills, the lead line, limitations, the degraded banner */
      document.head.appendChild(s); }
    /* (#R298) the per-message tool bar and the in-place editor are js/atlas-msg-tools.js — the note at the top of
       that file says why. What cannot travel with them is bound here, LAZILY: `chatEl` is null until the panel is
       built, `run` / `_stopRun` are this closure's own, and only this closure may truncate `_hist`. */
    const { copyBtn, editBtn, msgTools } = makeMsgTools({ L:L, esc:esc, chat:()=>chatEl,
      run:(q,imgs,files)=>run(q,imgs,files), stopRun:()=>{ try{ _stopRun(); }catch(_){} },
      rewindHist:(t)=>{ _hist=_hist.filter(x=>x&&x.t<t); } });
    /* (#R296) 「Atlasはユーザーが送ったメッセージもコピーできるように」 — see `copyBtn`. (#R298) `ed` = what the turn was RUN
       with ({turn,q,imgs,files,edit}): the turn id is stamped on the bubble so an edit can rewind to it, and a bubble
       that carries a request (not a bare image row) gets Edit next to Copy. */
    function bubble(who,html,ed){ const d=document.createElement('div'); d.className='atl-b '+(who==='u'?'u':'a'); d.innerHTML=html; chatEl.appendChild(d);
      if(ed&&ed.turn!=null) d.dataset.turn=String(ed.turn);
      if(who==='u'){ try{ const bar=document.createElement('div'); bar.className='atl-msgt atl-msgt-u';
        bar.appendChild(copyBtn(d)); if(ed&&ed.edit) bar.appendChild(editBtn(d,ed)); d.insertAdjacentElement('afterend',bar); }catch(_){} }
      try{ chatEl.scrollTop=chatEl.scrollHeight; }catch(_){} return d; }
    /* (#R101) example prompts REWRITTEN to showcase what only Atlas can do — cross-country comparison, analytical
       ranking, a transit-isochrone and a cross-data brief — instead of trivial one-tap actions (dark mode / fly to X
       / satellite) that the normal UI already does ("わざわざAtlasでやる必要のない無駄な動作"). */
    /* (#R309) the starter chips are their own subject now — js/atlas-examples.js. Accessors, because `panel` and `inEl` are assigned by ensure() after this line runs. */
    const { renderExamples, wireExamples } = makeAtlasExamples(HOST, { L, GE, codeAtPoint, countryStats, cName, loadCountryData, panelEl:()=>panel, pick:(t)=>{ if(inEl){ inEl.value=t; fire(); } } });
    function ensure(){ if(panel) return panel; ensureStyle(); panel=document.createElement('div'); panel.id='atlas-panel'; panel.dataset.nodock='1';   /* ⚠⚠⚠ (#R242) ATLAS IS NEVER DOCKED, and the flag is written HERE, where the panel is born: #R238 wrote it in window-manager's applyDockMode(), which runs at boot while this lazy panel does not exist — so a reader whose SAVED setting is 「まとめる」 had #atlas-panel re-parented into #docked-feed with .im-docked (measured; the class survived mountTab and collapsed .atl-chat to nothing). 「元に戻せ」 */
      panel.innerHTML='<div class="atl-head"><span class="atl-title">Atlas <span class="atl-beta">beta</span></span><span class="atl-btns"><button class="atl-min-btn" title="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'">–</button><button class="atl-x" title="'+t('close')+'">×</button></span></div>'
        +'<div class="atl-sub">'+L('Ask in plain language — Atlas drives the map for you. Try:','自然言語で指示すると、Atlasが地図を操作します。例:','Stell deine Anfrage in normaler Sprache — Atlas steuert die Karte. Beispiele:','Спросите обычными словами — Atlas управляет картой. Примеры:','Pide en lenguaje natural — Atlas controla el mapa. Ejemplos:')+'</div>'
        +'<div class="atl-ex"></div>'
        +'<div class="atl-chat"></div>'
        +'<div class="atl-imgrow" style="display:none;"></div>'   /* (#R149) pasted/attached image thumbnails + (#R158) file chips appear here */
        +'<div class="atl-inbar"><button class="atl-attach" title="'+L('Attach a file (image or text)','ファイルを添付（画像・テキスト）','Datei anhängen (Bild oder Text)','Прикрепить файл (изображение/текст)','Adjuntar archivo (imagen o texto)')+'" aria-label="'+L('Attach a file','ファイルを添付','Datei anhängen','Прикрепить файл','Adjuntar archivo')+'"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button><textarea class="atl-in" rows="1" placeholder="'+L('Ask Atlas anything…','Atlasに指示…','Atlas fragen…','Спросить Atlas…','Pregunta a Atlas…')+'"></textarea><button class="atl-mic" title="'+L('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz')+'" aria-label="'+L('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz')+'"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg></button><button class="atl-go idle" title="'+L('Send','送信','Senden','Отправить','Enviar')+'"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg></button></div>'
        +'<div class="atl-ainote">'+L('Atlas can be inaccurate — verify important facts.','Atlasの回答は不正確な場合があります。重要な情報は確認してください。','Atlas kann ungenau sein — wichtige Fakten prüfen.','Atlas может ошибаться — проверяйте важные факты.','Atlas puede equivocarse — verifica los datos importantes.')+'</div>'
        +'<button class="atl-jump" title="'+L('Jump to latest','最新へ移動','Zum Neuesten','К последнему','Ir al final')+'"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m5.5 12.5 6.5 6.5 6.5-6.5"/></svg></button>';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      chatEl=panel.querySelector('.atl-chat'); inEl=panel.querySelector('.atl-in');
      try{ attachLightbox(chatEl,()=>L('Close','閉じる','Schließen','Закрыть','Cerrar')); }catch(_){}   /* (#R232) */
      /* (#R79g) auto-scroll so a reply that REPLACES the "thinking" dots stays visible ("返答が短いものであれば
         返答に合わせて自動的に最下部までスクロール"). A MutationObserver covers every reply-setting path. It only
         scrolls when the user is already near the bottom — so a SHORT reply drops fully into view, while a LONG
         reply (whose new content pushes the bottom far away) is left with its TOP where the dots were, so you
         read it from the start and aren't yanked around. */
      try{ const _auto=()=>{ try{ if(chatEl.scrollHeight-chatEl.scrollTop-chatEl.clientHeight<150) chatEl.scrollTop=chatEl.scrollHeight; }catch(_){} };
        new MutationObserver(_auto).observe(chatEl,{childList:true,subtree:true,characterData:true}); }catch(_){}
      /* (#R42c/#R43) closing Atlas clears the highlights AND choropleth it drew ("×したらAtlas起源の地図上の表示も消える"). */
      panel.querySelector('.atl-x').onclick=()=>{ try{ _atlClose(); }catch(_){ panel.style.display='none'; } try{ clearHl(); }catch(_){} try{ clearChoro(); }catch(_){} try{ clearPolyHl(); }catch(_){} try{ clearLineHl(); }catch(_){} };
      /* (#R42c/#R47) minimize / restore (collapse to just the header bar). FIX: a resized panel carries an inline
         height:!important that beat the class → minimize did nothing. Now we stash & clear it on minimize and
         restore it after (and the CSS adds min-height:0). */
      const minBtn=panel.querySelector('.atl-min-btn'); if(minBtn) minBtn.onclick=()=>{ const mn=panel.classList.toggle('atl-min');
        if(mn){ panel._restoreH=panel.style.height||''; panel.style.setProperty('height','auto','important'); }
        else { if(panel._restoreH){ panel.style.setProperty('height',panel._restoreH,'important'); } else { panel.style.removeProperty('height'); } }
        minBtn.textContent=mn?'▢':'–'; minBtn.title=mn?L('Restore','元に戻す','Wiederherstellen','Развернуть','Restaurar'):L('Minimize','最小化','Minimieren','Свернуть','Minimizar'); };
      /* (#R309) ONE renderer. It was written twice (here and in the language handler below), which is
         how a third caller — the camera — would have become a third copy. */
      renderExamples();
      wireExamples();
      /* (#R105) re-localize the Atlas panel's static chrome immediately on a language change (was stuck until reload — the ws "すべてがすぐ変わらない" report).
         NOTE: the module's `L` mirrors the last MESSAGE's language, so use a currentLang-based helper for UI chrome. */
      try{ const _uiL=window.IntMapLang.pick(()=>HOST.lang);
        window.addEventListener('intmap-lang',()=>{ try{
        const sub=panel.querySelector('.atl-sub'); if(sub) sub.textContent=_uiL('Ask in plain language — Atlas drives the map for you. Try:','自然言語で指示すると、Atlasが地図を操作します。例:','Stell deine Anfrage in normaler Sprache — Atlas steuert die Karte. Beispiele:','Спросите обычными словами — Atlas управляет картой. Примеры:','Pide en lenguaje natural — Atlas controla el mapa. Ejemplos:');
        const nt=panel.querySelector('.atl-ainote'); if(nt) nt.textContent=_uiL('Atlas can be inaccurate — verify important facts.','Atlasの回答は不正確な場合があります。重要な情報は確認してください。','Atlas kann ungenau sein — wichtige Fakten prüfen.','Atlas может ошибаться — проверяйте важные факты.','Atlas puede equivocarse — verifica los datos importantes.');
        if(inEl) inEl.placeholder=_uiL('Ask Atlas anything…','Atlasに指示…','Atlas fragen…','Спросить Atlas…','Pregunta a Atlas…');
        renderExamples(true);   /* (#R309) a language change re-renders even if the place did not change */
      }catch(_){} }); }catch(_){}
      /* (#R118) Enter=send, Shift+Enter=NEWLINE (the input is a textarea now); the box auto-grows to 4-5 lines */
      const go=panel.querySelector('.atl-go'); go.onclick=fire; inEl.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); fire(); } });
      const _autoGrow=()=>{ try{ inEl.style.height='auto'; inEl.style.height=Math.min(inEl.scrollHeight,132)+'px'; }catch(_){} };
      inEl.addEventListener('input',()=>{ try{ if(!go.classList.contains('busy')) go.classList.toggle('idle',!inEl.value.trim()); }catch(_){} _autoGrow(); });   /* (#R142) don't fight the Stop button's busy state */
      inEl.__autoGrow=_autoGrow;
      /* (#R149) VISION — paste / drag-drop / attach an image into the Atlas input, then send it with your message.
         Uses the SAME client→ai-proxy image path the satellite-compare feature already uses (compressImage → JPEG
         data-URL → images[] the Edge Function forwards as OpenAI input_image). */
      try{
        inEl.addEventListener('paste',(e)=>{ try{ const items=(e.clipboardData&&e.clipboardData.items)||[]; const files=[]; for(const it of items){ if(it&&it.kind==='file'){ const f=it.getAsFile&&it.getAsFile(); if(f) files.push(f); } } if(files.length){ e.preventDefault(); _atlAddFiles(files); } }catch(_){} });   /* (#R158) any pasted FILE (image or text), not images only — _atlAddFiles validates; pasted plain TEXT (kind:'string') is untouched */
        const atk=panel.querySelector('.atl-attach'); if(atk) atk.onclick=()=>{ try{ const fi=document.createElement('input'); fi.type='file'; fi.multiple=true; fi.style.display='none'; fi.onchange=()=>{ try{ _atlAddFiles([...(fi.files||[])]); }catch(_){} try{ fi.remove(); }catch(_){} }; document.body.appendChild(fi); fi.click(); }catch(_){} };   /* (#R158) no accept restriction — images + text files both allowed */
        /* (#R154) VOICE INPUT — Web Speech API dictation. Inserts recognised text into the box (user reviews then sends);
           recognition language follows the UI language. Hidden if the browser has no SpeechRecognition. */
        try{ const mic=panel.querySelector('.atl-mic'); const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
          if(mic&&!SR){ mic.style.display='none'; }
          else if(mic){ let rec=null, recng=false; /* (#R318) the five-row table that stood here is gone — IntMapLang.locale() answers for all nine, and the five it knew left four of them dictating in American English */
            mic.onclick=()=>{ if(recng){ try{ rec&&rec.stop(); }catch(_){} return; }
              try{ rec=new SR(); }catch(_){ return; }
              try{ rec.lang=window.IntMapLang.locale(HOST.lang)||'en-US'; }catch(_){ rec.lang='en-US'; } rec.interimResults=true; rec.continuous=false; rec.maxAlternatives=1;
              const base=(inEl&&inEl.value)?inEl.value.replace(/\s+$/,'')+' ':'';
              rec.onstart=()=>{ recng=true; mic.classList.add('rec'); };
              rec.onresult=(ev)=>{ let txt=''; for(let i=ev.resultIndex;i<ev.results.length;i++){ txt+=ev.results[i][0].transcript; } if(inEl){ inEl.value=base+txt; try{ inEl.__autoGrow&&inEl.__autoGrow(); }catch(_){} } try{ _atlSyncGo(); }catch(_){} };
              rec.onerror=()=>{ recng=false; mic.classList.remove('rec'); };
              rec.onend=()=>{ recng=false; mic.classList.remove('rec'); try{ _atlSyncGo(); }catch(_){} try{ inEl&&inEl.focus(); }catch(_){} };
              try{ rec.start(); }catch(_){ recng=false; mic.classList.remove('rec'); } }; } }catch(_){}
        panel.addEventListener('dragover',(e)=>{ try{ if(e.dataTransfer&&[...(e.dataTransfer.types||[])].indexOf('Files')>=0){ e.preventDefault(); panel.classList.add('atl-drag'); } }catch(_){} });
        panel.addEventListener('dragleave',(e)=>{ try{ if(!panel.contains(e.relatedTarget)) panel.classList.remove('atl-drag'); }catch(_){} });
        panel.addEventListener('drop',(e)=>{ try{ const dt=e.dataTransfer; panel.classList.remove('atl-drag'); if(!dt) return; const files=[...(dt.files||[])]; if(files.length){ e.preventDefault(); _atlAddFiles(files); } }catch(_){} });   /* (#R158) accept any dropped file — _atlAddFiles validates image vs text vs unsupported */
      }catch(_){}
      /* (#R72) scroll-to-bottom jump ("上部にスクロールしたら、最下部まで行くボタンがでるように") */
      const jump=panel.querySelector('.atl-jump');
      if(jump){ jump.onclick=()=>{ try{ chatEl.scrollTo({top:chatEl.scrollHeight,behavior:'smooth'}); }catch(_){ chatEl.scrollTop=chatEl.scrollHeight; } };
        chatEl.addEventListener('scroll',()=>{ try{ jump.classList.toggle('show',(chatEl.scrollHeight-chatEl.scrollTop-chatEl.clientHeight)>140); }catch(_){} }); }
      /* (#R72) delegated wiring for INLINE CONTROLS inside replies + report-item jump */
      /* (#R74) STABLE layer refs ("レイヤーの凡例等との同期ができていない" / "オンオフが実情と対応していない"):
         reply widgets used to re-resolve their fuzzy LABEL at every click/sync, which could land on a DIFFERENT
         row than the one the action actually toggled. Each control now carries the real checkbox id (data-cb)
         and resolves by id first; the label is only a fallback for pre-R74 replies still in the chat. */
      const _ctlLayer=el=>{ try{ const cid=el.getAttribute('data-cb');
        if(cid){ const cb=document.getElementById(cid); if(cb&&cb.type==='checkbox') return {cb,label:el.getAttribute('data-layer')||cid}; }
        return resolveLayer(el.getAttribute('data-layer')||''); }catch(_){ return null; } };
      /* ⚠ (#R313) THE ANSWER IS GIVEN — TAKE THE PICKER AWAY, LEAVE THE QUESTION AND THE ANSWER.
         `run(v)` writes the reader's choice as an ordinary user bubble, so the exchange is still
         readable afterwards: the sentence Atlas asked, then what was chosen. What goes is only the
         means of choosing — the chips and the free-text box, wrapped together as `.atl-choice-ui`
         where they are built. Removed rather than disabled: a greyed-out menu is still a menu on
         the screen, and the reader asked for it not to be there.
         ⚠ It is called BEFORE `run()`, because `run()` scrolls and appends and the node has to be
         gone by the time the new bubble is measured against the transcript's height. */
      function _choiceAnswered(el){ try{ const w=el&&el.closest&&el.closest('.atl-choice-ui'); if(w) w.remove(); }catch(_){} }
      panel.addEventListener('click',e=>{ try{
        /* (#R85b) BUGFIX "Atlasの返答内のオンオフボタンが機能していない": the map-overlay toggle ALSO carries the
           .atl-ctl-toggle class, so the layer-toggle branch below used to intercept it first (find no cb → do
           nothing → return), which is exactly why every "Shown on the map" switch was dead. Check the map-toggle
           FIRST. */
        const mtg=e.target.closest&&e.target.closest('.atl-map-toggle');
        if(mtg){ const row=mtg.closest('.atl-mapctl'); const kinds=((row&&row.getAttribute('data-ovls'))||'').split(',').filter(Boolean);
          const show=!mtg.classList.contains('on');
          /* (#R118/#R122) restore THIS message's own drawn content (per-message snapshot) and record it as the owner
             of each kind; turning OFF releases ownership. _refreshMapChips then re-derives EVERY chip's state from
             ownership+visibility, so each message toggles independently and old chips flip off truthfully. */
          const bEl=mtg.closest('.atl-b'); const snap=bEl&&bEl.__ovlSnap;
          /* (#R125) independent coexistence: if ANOTHER message currently owns this kind's shared canvas, paint into
             this message's own clone layers instead of stealing (the other chip stays ON, untouched). The shared
             canvas is only (re)claimed when it is free or already ours. */
          kinds.forEach(k=>{ try{ if(show){
              const owner=_ovlOwn[k]; const ownedElsewhere=owner&&owner!==bEl&&document.body.contains(owner)&&_ovlVisible(k);
              if(ownedElsewhere&&snap&&snap[k]&&_ovlCloneShow(bEl,k,snap[k])) return;
              if(snap&&snap[k]) _ovlAdopt(k,snap[k]); _ovlOwn[k]=bEl; overlayToggle(k,true);
            } else {
              _ovlCloneHide(bEl,k);
              if(_ovlOwn[k]===bEl){ overlayToggle(k,false); _ovlOwn[k]=null; }
            } }catch(_){} });
          _refreshMapChips(); return; }
        const ftg=e.target.closest&&e.target.closest('.atl-feat-tog');   /* (#R145) on/off view-feature switch — flips the real control directly */
        if(ftg){ const f=_FEAT_TOG[ftg.getAttribute('data-feat')]; if(f){ try{ f.set(!f.on()); }catch(_){} let now=false; try{ now=!!f.on(); }catch(_){} ftg.classList.toggle('on',now); ftg.setAttribute('aria-checked',now?'true':'false'); const s=ftg.querySelector('.afb-s'); if(s) s.textContent=now?'ON':'OFF'; } return; }   /* (#R147) also update the ON/OFF badge on the button variant */
        const cgn=e.target.closest&&e.target.closest('.atl-ctl-gen');   /* (#R152) generic on/off control switch (shares .atl-ctl-toggle styling, so MUST be handled before the layer-toggle branch below) */
        if(cgn){ const el=findControl(cgn.getAttribute('data-ctl')); if(el&&(el.type==='checkbox'||el.type==='radio')){ const want=!el.checked; el.checked=want; el.dispatchEvent(new Event('change',{bubbles:true})); const now=!!el.checked; cgn.classList.toggle('on',now); cgn.setAttribute('aria-checked',now?'true':'false'); } return; }
        const tg2=e.target.closest&&e.target.closest('.atl-ctl-toggle');
        if(tg2){ const rl=_ctlLayer(tg2); if(rl){ const want=!rl.cb.checked; rl.cb.checked=want; rl.cb.dispatchEvent(new Event('change',{bubbles:true})); tg2.classList.toggle('on',rl.cb.checked); tg2.setAttribute('aria-checked',rl.cb.checked?'true':'false'); } return; }
        /* (#R132) 経路10-10 §12.5: tap a turn-by-turn step in a road reply → highlight that segment on the map + fly to it.
           MUST run BEFORE the .atl-trip card handler below, because a step lives INSIDE a card — otherwise the card
           handler swallows the click and re-selects the alternative instead of highlighting the step. */
        /* ⚠ (#R291) BOTH SPELLINGS — js/routing-cards.js emits `.rt-step` / `.rt-alt`; replies already in the transcript carry `.atl-rstep` / `.atl-trip`. */
        const rst=e.target.closest&&e.target.closest('.atl-rstep[data-si],.rt-step[data-si]');
        if(rst){ const si=+rst.getAttribute('data-si'); const host=rst.closest('[data-rset]'); const rset=(host&&host.getAttribute('data-rset'))||undefined;
          const card=rst.closest('.atl-trip[data-ai],.rt-alt[data-ai]'); if(card){ const bx=card.parentElement; if(bx){ bx.querySelectorAll('.atl-trip,.rt-alt').forEach(t=>{ t.classList.remove('on'); if(t.hasAttribute('aria-checked')) t.setAttribute('aria-checked','false'); }); } card.classList.add('on'); if(card.hasAttribute('aria-checked')) card.setAttribute('aria-checked','true');
            try{ window.IntMapRouting&&window.IntMapRouting.selectAlt&&window.IntMapRouting.selectAlt(+card.getAttribute('data-ai'),rset); }catch(_){} }
          try{ window.IntMapRouting&&window.IntMapRouting.selectStep&&window.IntMapRouting.selectStep(rset,si); }catch(_){}
          try{ rst.parentElement.querySelectorAll('.atl-rstep').forEach(x=>x.style.background=(x===rst)?'rgba(255,210,63,0.14)':''); }catch(_){}
          try{ rst.parentElement.querySelectorAll('.rt-step').forEach(x=>x.classList.toggle('on',x===rst)); }catch(_){} return; }
        const trp=e.target.closest&&e.target.closest('.atl-trip[data-ai],.rt-alt[data-ai]');
        if(trp){ const ai=+trp.getAttribute('data-ai'); const box=trp.parentElement;   /* (#R86) select a transit alternative → expand it + redraw on the map */
          if(box){ box.querySelectorAll('.atl-trip,.rt-alt').forEach(t=>{ t.classList.remove('on'); if(t.hasAttribute('aria-checked')) t.setAttribute('aria-checked','false'); }); } trp.classList.add('on'); if(trp.hasAttribute('aria-checked')) trp.setAttribute('aria-checked','true');
          /* (#R126) §16.4/§24.3: select within THIS message's routeSetId — never "alternative i of whatever was computed last" */
          const rset=(box&&box.getAttribute('data-rset'))||undefined;
          try{ window.IntMapRouting&&window.IntMapRouting.selectAlt&&window.IntMapRouting.selectAlt(ai,rset); }catch(_){}
          /* (#R291→#R298) the detail is INSIDE the chosen card, so selecting one redraws the SET — IntMapRouteCards.refreshDetail does it from THIS message's own set. */
          window.IntMapRouteCards.refreshDetail(rset,ai,{lang:HOST.lang,units:(typeof HOST.unitMode!=='undefined'?HOST.unitMode:'metric'),tz:(HOST.userTZ&&HOST.userTZ!=='auto')?HOST.userTZ:''}); return; }
        /* (#R296) the `.atl-route-mode` branch stood here — a handler for markup that cannot exist. */
        const rdb=e.target.closest&&e.target.closest('.atl-traj-btn[data-rad]');
        if(rdb&&_lastRadCtx){ let o={}; try{ o=JSON.parse(rdb.getAttribute('data-rad')||'{}'); }catch(_){}   /* (#R85) re-run the fallout, carrying the current settings */
          const c=_lastRadCtx; const act=Object.assign({type:'radiation',place:c.place,lng:c.lng,lat:c.lat,bq:c.bq,isotope:c.isotope,emitHours:c.emitHours,hours:c.hours,date:c.date},o);
          const ai=bubble('a',stageDots('think')); const gen=++_runGen;
          runActions(ai,'',[act],gen).catch(()=>{}); return; }
        const tjb=e.target.closest&&e.target.closest('.atl-traj-btn[data-traj]');
        if(tjb&&_lastMissileCtx){ const m=tjb.getAttribute('data-traj'); const c2=_lastMissileCtx;   /* (#R85) re-fly the shot on the chosen trajectory profile */
          const act={type:'missile',from:c2.from,to:c2.to,missile:c2.missile,yield:c2.yieldKt,marv:c2.marv};
          if(m==='marv') act.marv=!c2.marv; else act.loft=m;
          const ai=bubble('a',stageDots('think')); const gen=++_runGen;
          runActions(ai,'',[act],gen).catch(()=>{}); return; }
        const bt=e.target.closest&&e.target.closest('.atl-ctl-btn');
        if(bt){ const cmd=decodeURIComponent(bt.getAttribute('data-run')||''); if(cmd) run(cmd); return; }
        const ch=e.target.closest&&e.target.closest('.atl-choice');
        if(ch){ const v=decodeURIComponent(ch.getAttribute('data-choice')||''); if(v){ _choiceAnswered(ch); run(v); } return; }   /* (#R313) */
        const cg=e.target.closest&&e.target.closest('.atl-choice-go');
        if(cg){ const inp=cg.parentElement&&cg.parentElement.querySelector('.atl-choice-in'); const v=inp&&inp.value.trim(); if(v){ inp.value=''; _choiceAnswered(cg); run(v); } return; }   /* (#R313) */
        const ri=e.target.closest&&e.target.closest('.atl-rp-item');
        if(ri&&!(e.target.closest&&e.target.closest('a'))){ const p=_pois[+ri.getAttribute('data-i')]; if(p&&isFinite(p.lng)){ GE().camera.flyTo({center:[p.lng,p.lat],zoom:Math.max(GE().camera.getZoom(),7.5),duration:900}); } return; }
      }catch(_){} });
      panel.addEventListener('input',e=>{ try{
        const sl=e.target.closest&&e.target.closest('.atl-ctl-op'); if(!sl) return;
        const rl=_ctlLayer(sl); if(!rl) return;
        const real=layerOpacityControl(rl.cb); if(!real) return;
        real.value=sl.value; real.dispatchEvent(new Event('input',{bubbles:true})); real.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(_){} });
      panel.addEventListener('change',e=>{ try{   /* (#R85d) radiation inline config selects (isotope / source term) re-run the sim */
        const rs=e.target.closest&&e.target.closest('.atl-rad-sel[data-radp]'); if(!rs||!_lastRadCtx) return;
        const key=rs.getAttribute('data-radp'); const val=(key==='bq')?+rs.value:rs.value; const c=_lastRadCtx;
        const act=Object.assign({type:'radiation',place:c.place,lng:c.lng,lat:c.lat,bq:c.bq,isotope:c.isotope,emitHours:c.emitHours,hours:c.hours,date:c.date},{[key]:val});
        const ai=bubble('a',stageDots('think')); const gen=++_runGen;
        runActions(ai,'',[act],gen).catch(()=>{});
      }catch(_){} });
      /* (#R313) the third door into the same answer — Enter in the free-text box. All three call
         `_choiceAnswered` so a picker cannot survive by being answered the other way. */
      panel.addEventListener('keydown',e=>{ try{ if(e.key!=='Enter') return; const inp=e.target.closest&&e.target.closest('.atl-choice-in'); if(!inp) return; e.preventDefault(); const v=inp.value.trim(); if(v){ inp.value=''; _choiceAnswered(inp); run(v); } }catch(_){} });
      /* (#R73) REVERSE sync ("レイヤーの凡例等との同期ができていない"): when a layer is toggled or its opacity
         changed ANYWHERE else (classic panel, tile sidebar, legend, Atlas actions), every inline control in old
         replies updates to the real state — the reply widgets are live mirrors, not stale snapshots. */
      const _syncCtls=()=>{ try{ if(!panel) return;
        panel.querySelectorAll('.atl-ctl-toggle[data-layer],.atl-ctl-toggle[data-cb]').forEach(tg2=>{ const rl=_ctlLayer(tg2); if(!rl) return;
          tg2.classList.toggle('on',!!rl.cb.checked); tg2.setAttribute('aria-checked',rl.cb.checked?'true':'false'); });
        panel.querySelectorAll('.atl-ctl-op[data-layer],.atl-ctl-op[data-cb]').forEach(sl2=>{ if(sl2===document.activeElement) return;
          const rl=_ctlLayer(sl2); if(!rl) return; const real=layerOpacityControl(rl.cb); if(real&&sl2.value!==real.value) sl2.value=real.value; });
      }catch(_){} };
      let _syncT=null; const _schedSync=()=>{ clearTimeout(_syncT); _syncT=setTimeout(_syncCtls,120); };
      document.addEventListener('change',e=>{ try{ const t2=e.target; if(t2&&(t2.type==='checkbox'||t2.type==='range')&&!panel.contains(t2)) _schedSync(); }catch(_){} });
      document.addEventListener('input',e=>{ try{ const t2=e.target; if(t2&&t2.type==='range'&&!panel.contains(t2)) _schedSync(); }catch(_){} });
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.atl-head')); }catch(_){}
      try{ if(typeof addEdgeResize==='function') addEdgeResize(panel,{min:[300,160]}); }catch(_){}   /* (#R47) resize from ANY edge, no handle mark */
      return panel; }
    /* (#R149) VISION helpers — pending pasted/attached image thumbnails in the input bar (cap 4 = ai-proxy MAX_IMAGES). */
    function _atlRenderImgs(){ try{ if(!panel) return; const row=panel.querySelector('.atl-imgrow'); if(!row) return;
      if(!_atlImgs.length&&!_atlFiles.length){ row.style.display='none'; row.innerHTML=''; return; }
      const rm=L('Remove','削除','Entfernen','Удалить','Quitar');
      const imgH=_atlImgs.map((u,i)=>'<div class="atl-thumb"><img src="'+esc(u)+'" alt=""><button class="atl-thumb-x" data-kind="img" data-i="'+i+'" title="'+rm+'">×</button></div>').join('');
      const fileH=_atlFiles.map((f,i)=>'<div class="atl-fchip" title="'+esc(f.name)+((f.size)?(' · '+atlFmtBytes(f.size)):'')+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span class="atl-fchip-n">'+esc(f.name)+'</span><button class="atl-thumb-x atl-fchip-x" data-kind="file" data-i="'+i+'" title="'+rm+'">×</button></div>').join('');
      row.style.display='flex'; row.innerHTML=imgH+fileH;
      row.querySelectorAll('.atl-thumb-x').forEach(b=>{ b.onclick=()=>{ const k=b.getAttribute('data-kind'), i=+b.getAttribute('data-i');
        if(k==='file'){ if(i>=0&&i<_atlFiles.length) _atlFiles.splice(i,1); } else { if(i>=0&&i<_atlImgs.length) _atlImgs.splice(i,1); }
        _atlRenderImgs(); _atlSyncGo(); }; });
    }catch(_){} }
    function _atlSyncGo(){ try{ if(!panel) return; const go=panel.querySelector('.atl-go'); if(!go||go.classList.contains('busy')) return; go.classList.toggle('idle', !((inEl&&inEl.value.trim())||_atlImgs.length||_atlFiles.length)); }catch(_){} }
    async function _atlAddFiles(files){ try{ files=[...(files||[])].filter(Boolean); if(!files.length) return; let unsupported=0;
      for(const f of files){ const kind=atlFileKind(f);
        if(kind==='image'){ if(_atlImgs.length>=4){ try{ aiToast(L('Up to 4 images per message','1メッセージにつき画像は4枚まで','Bis zu 4 Bilder pro Nachricht','До 4 изображений на сообщение','Hasta 4 imágenes por mensaje')); }catch(_){} continue; }
          /* (#R156) HI-FIDELITY encode for OCR/math: the old 1100px / q0.72 JPEG dissolved small text, fraction bars and
             subscripts. 2000px / q0.9 preserves fine detail; combined with detail:"high" server-side it reads dense docs. */
          try{ const u=await compressImage(f,2000,0.9); if(u&&/^data:image\//.test(u)) _atlImgs.push(u); }catch(_){}
        } else if(kind==='text'){ if(_atlFiles.length>=4){ try{ aiToast(L('Up to 4 files per message','1メッセージにつきファイルは4件まで','Bis zu 4 Dateien pro Nachricht','До 4 файлов на сообщение','Hasta 4 archivos por mensaje')); }catch(_){} continue; }
          let txt=await atlReadText(f); const truncated=txt.length>_ATL_FILE_MAX; if(truncated) txt=txt.slice(0,_ATL_FILE_MAX);
          _atlFiles.push({name:String((f&&f.name)||'file'),text:txt,size:(f&&f.size)||txt.length,truncated});
        } else { unsupported++; } }
      if(unsupported){ try{ aiToast(L('Only images and text-based files can be attached','添付できるのは画像とテキスト系ファイルのみです','Nur Bilder und textbasierte Dateien können angehängt werden','Прикреплять можно только изображения и текстовые файлы','Solo se pueden adjuntar imágenes y archivos de texto')); }catch(_){} }
      _atlRenderImgs(); _atlSyncGo(); try{ inEl&&inEl.focus(); }catch(_){}
    }catch(_){} }
    function fire(){ const v=inEl.value.trim(); const imgs=_atlImgs.slice(); const files=_atlFiles.slice(); if(v||imgs.length||files.length){ inEl.value=''; _atlImgs=[]; _atlFiles=[]; try{ _atlRenderImgs(); }catch(_){} try{ inEl.__autoGrow&&inEl.__autoGrow(); }catch(_){} try{ const g=panel&&panel.querySelector('.atl-go'); if(g) g.classList.add('idle'); }catch(_){} run(v,imgs,files); } }   /* (#R149/#R158) send text + any pasted/attached images and files */
    /* (#R43) HONEST reporting loop (unchanged behaviour, factored out so the AI path AND the deterministic
       fast-path/rescue share it): run every action, collect REAL per-step results, surface failures prominently
       instead of trusting the model's optimistic "say". Returns the list of failed actions. */
    /* (#R73) TURN CANCELLATION ("thinking時に新たなメッセージを送った場合、そちらをやり、thinkingしていたものは
       中止するように"): every run gets a generation number; a newer message bumps it, older turns stop executing
       their remaining actions and their late results are discarded instead of overwriting the chat. */
    let _runGen=0, _abortCtl=null;
    /* (#R142) Neutral "Stopped" — covers BOTH a newer message superseding this turn AND the user pressing the Stop button;
       _stopRun paints THIS same note so an in-flight abort that repaints it stays visually identical (no flicker). */
    function _cancelledNote(){ return '<span style="color:var(--text-muted);font-size:11.5px;">⏹ '+esc(L('Stopped','停止しました','Angehalten','Остановлено','Detenido'))+'</span>'; }
    const _GO_SEND_SVG='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>';
    const _GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4.25" y="4.25" width="15.5" height="15.5" rx="3.4" fill="currentColor"/></svg>';   /* (#R150) "四角はほんの少し小さく": rect 17.5→15.5 in a 24 viewBox (rendered ≈14.6px→12.9px) — a gentle trim, still clearly a Stop square */
    /* (#R142) send ⇄ stop: while Atlas is generating a reply, the up-arrow SEND button becomes a red STOP square. */
    function _setGoBusy(busy){ try{ if(!panel) return; const go=panel.querySelector('.atl-go'); if(!go) return;
      if(busy){ go.classList.add('busy'); go.classList.remove('idle'); go.innerHTML=_GO_STOP_SVG; go.onclick=_stopRun; go.title=L('Stop answering','応答を停止','Antwort stoppen','Остановить ответ','Detener respuesta'); go.setAttribute('aria-label',go.title); }
      else { go.classList.remove('busy'); go.innerHTML=_GO_SEND_SVG; go.onclick=fire; try{ go.classList.toggle('idle',!(inEl&&inEl.value.trim())); }catch(_){} go.title=L('Send','送信','Senden','Отправить','Enviar'); go.setAttribute('aria-label',go.title); } }catch(_){} }
    /* (#R142) STOP: supersede the running turn (bump _runGen so its late results are discarded — the existing soft-cancel)
       AND abort the in-flight request (real fetch AbortController), then paint the neutral Stopped note immediately. */
    function _stopRun(){ try{ _runGen++; }catch(_){} try{ if(_abortCtl&&_abortCtl.abort) _abortCtl.abort(); }catch(_){} _abortCtl=null;
      try{ if(chatEl) chatEl.querySelectorAll('.atl-b.a .atl-stage').forEach(d=>{ const b=d.closest('.atl-b'); if(b) b.innerHTML=_cancelledNote(); }); }catch(_){}
      try{ _setGoBusy(false); }catch(_){} }
    /* (#R84) MAP-OVERLAY TOGGLE ("Atlasによって地図上にマッピングされた類のものは、Atlasのメッセージ内から
       オンオフできるように"): a reply that painted something on the map gets a live on/off switch. */
    const _OVL={ highlight:['nlq-fill','nlq-line','nlq-poly-fill','nlq-poly-line'], choropleth:['nlq-choro'], compare:['imcmp-fill','imcmp-line'],
      poi:['nlq-poi-c','nlq-poi-t'], elevation:['nlq-elev-fill'], historical:['nlq-fac-fill','nlq-fac-line'],
      /* ══ ⚠⚠ (#R299) EVERY LAYER THE ROUTE DRAWS — 「オブジェクトに経路が残り続ける」. This row held the ones js/routing.js drew in #R84 and
         none added since, so switching a journey OFF left the waypoint labels, the leg times, the drawn keep-out and js/routing-ops.js's two
         analyses standing. ⚠ `imroute-hit` matters most: the INVISIBLE 22–44 px pick target over the line, so hiding without it left the route
         still CLICKABLE with nothing on screen to explain it. ⚠ ONE LIST — `_ovlVisible` / `overlayToggle` / `_ovlSnapshot` / `_ovlRestore` read it. */
      route:['imroute-cas','imroute-line','imroute-pt','imroute-walk','imroute-rail','imroute-transfer','imroute-wp','imroute-durlab','imroute-hit','imroute-area','imroute-area-line','imroute-diff','imroute-hist'],
      radiation:['imrad-heat','imrad-pt','imrad-srcpt','imrad-dep'], blast:['nlq-blast-fill','nlq-blast-line'], lines:['nlq-line'], outline:['pl-outline-fill','pl-outline-line'],
      /* (#R85) close the "できないものもある" gap — flight paths, line-of-sight, isolate mask, pins and street-view marker were painted but had no in-message on/off. */
      fly:['nlq-fly-line','nlq-fly-head'], los:['los-cover','los-shadow','los-cover-line','los-site'], isolate:['iso-mask'], pin:['user-pin-dot','user-pin-shadow'], streetview:['sv-here-pt','sv-here-cone'], isochrone:['im-iso-fill','im-iso-line','im-iso-ctr'] };
    const OVL_OF={ highlight:'highlight', mapMetric:'choropleth', choropleth:'choropleth', poi:'poi', elevationBelow:'elevation', belowSeaLevel:'elevation', elevationHighlight:'elevation', elevationScan:'elevation',
      historicalMap:'historical', historical:'historical', powerMap:'historical', allianceMap:'historical', radiation:'radiation', fallout:'radiation', dispersion:'radiation', plume:'radiation', radiationSim:'radiation',
      directions:'route', roadRoute:'route', navigate:'route', drivingRoute:'route', walkingRoute:'route', missile:['arc','fly','blast'], ballistic:['arc','fly','blast'], ballisticMissile:['arc','fly','blast'], strike:['arc','fly','blast'], icbm:['arc','fly','blast'],   /* (#R142) include the blast ring so a strike's blast overlay also gets a map on/off chip (#9) */
      fly:'fly', flight:'fly', flyTo:null, flyPath:'fly', greatCircle:'fly', los:'los', lineOfSight:'los', radarShadow:'los', viewshed:'los',
      isolate:'isolate', isolateRegion:'isolate', focus:'isolate', pin:'pin', marker:'pin', locate:'pin', myLocation:'pin', whereAmI:'pin', streetview:'streetview', streetView:'streetview', pano:'streetview',
      compareStats:'compare', compareCountries:'compare', statsCompare:'compare', drawLine:'lines', line:'lines', outline:'outline', mapReport:'poi', newsMap:'poi', reportMap:'poi', researchMap:'poi', research_map:'poi', situationMap:'poi', events:'poi', impact:'poi', runway:'poi',
      isochrone:'isochrone', reach:'isochrone', reachability:'isochrone', reachable:'isochrone', catchment:'isochrone' };
    function _ovlVisible(kind){ if(kind==='arc'){ const cv=document.getElementById('arc3d-canvas'); return !!(cv&&cv.parentNode&&cv.style.display!=='none'); } const ids=_OVL[kind]||[]; for(const id of ids){ try{ if(GE().layers.has(id)&&GE().layers.getLayout(id,'visibility')!=='none') return true; }catch(_){} } return false; }
    /* (#R122) PER-MESSAGE overlay OWNERSHIP — the shared nlq-* canvas can only paint one message's snapshot of a
       given kind at a time, so each kind has ONE current owner (the reply bubble whose snapshot is on the map). A
       chip reads ON iff its bubble owns every kind it drew AND the layers are visible — so an older message's chip
       correctly flips OFF when a newer reply repaints the same kind, and turning any message's chip back ON re-adopts
       THAT message's snapshot. This makes every chip independently and truthfully toggleable ("メッセージごとに個別に"). */
    const _ovlOwn={};
    function _refreshMapChips(){ try{ const pnl=document.getElementById('atlas-panel'); if(!pnl) return;
      pnl.querySelectorAll('.atl-mapctl').forEach(row=>{ const b=row.closest('.atl-b'); const kinds=(row.getAttribute('data-ovls')||'').split(',').filter(Boolean);
        const on=kinds.length&&kinds.every(k=>(_ovlOwn[k]===b&&_ovlVisible(k))||_ovlCloneVisible(b,k));   /* (#R125) a clone counts as ON */
        const t=row.querySelector('.atl-map-toggle'); if(t){ t.classList.toggle('on',!!on); t.setAttribute('aria-checked',on?'true':'false'); } }); }catch(_){} }
    function overlayToggle(kind,show){ if(kind==='arc'){ const cv=document.getElementById('arc3d-canvas'); if(cv){ if(show===undefined) show=(cv.style.display==='none'); cv.style.display=show?'block':'none'; } return show; }
      const ids=_OVL[kind]||[]; if(show===undefined) show=!_ovlVisible(kind); ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',show?'visible':'none'); }catch(_){} }); return show; }
    /* (#R118) PER-MESSAGE overlay snapshots — the reported bug: every "Shown on the map" switch flipped the SHARED
       nlq-* layers, i.e. an old message's switch controlled whatever was drawn LAST ("そのメッセージのものではなく
       強制的に最新のもの"). Each reply now stores WHAT IT DREW (geojson source data + layer filter + key paint
       props) at reply time; turning its switch ON restores that content to the map (and dims other messages'
       same-kind switches, since the shared canvas now shows THIS message's result). Old replies without a
       snapshot keep the previous plain show/hide behaviour. */
    const _OVL_PAINT=['fill-color','fill-opacity','line-color','line-width','line-opacity','circle-color','circle-radius','circle-opacity'];
    function _ovlSnapshot(kinds){ const snap={}; (kinds||[]).forEach(kind=>{ if(kind==='arc') return; const ids=_OVL[kind]||[]; const S={sources:{},layers:{}};
      ids.forEach(id=>{ try{ const ly=GE().layers.get(id); if(!ly) return; const L2={};
        try{ const f=GE().layers.getFilter(id); if(f!=null) L2.filter=JSON.parse(JSON.stringify(f)); }catch(_){}
        const pp={}; _OVL_PAINT.forEach(p=>{ try{ const v=GE().layers.getPaint(id,p); if(v!=null) pp[p]=JSON.parse(JSON.stringify(v)); }catch(_){} });
        if(Object.keys(pp).length) L2.paint=pp;
        S.layers[id]=L2;
        const sid=ly.source; if(sid&&!S.sources[sid]){ try{ const ser=GE().layers.sourceData(sid); if(ser&&typeof ser==='object'){ S.sources[sid]=JSON.parse(JSON.stringify(ser));
          /* (#R125) country highlights / choropleths paint via FEATURE-STATE (nlq / choroV on promoteId'd codes),
             which serialize() does NOT carry — capture each feature's state so a per-message clone can re-apply it. */
          try{ const sty=(GE().scene.getStyle().sources||{})[sid]||{}; if(sty.promoteId){ S.promote=S.promote||{}; S.promote[sid]=sty.promoteId; }
            const st={}; ((S.sources[sid]&&S.sources[sid].features)||[]).forEach(f=>{ const fid=(f.id!=null)?f.id:(sty.promoteId&&f.properties?f.properties[sty.promoteId]:null); if(fid==null) return;
              try{ const fs=GE().layers.getFeatureState({source:sid,id:fid}); if(fs&&Object.keys(fs).length) st[fid]=JSON.parse(JSON.stringify(fs)); }catch(_){} });
            if(Object.keys(st).length){ S.states=S.states||{}; S.states[sid]=st; } }catch(_){} } }catch(_){} }
      }catch(_){} });
      if(Object.keys(S.layers).length||Object.keys(S.sources).length) snap[kind]=S; });
      return snap; }
    function _ovlRestore(kind,S){ if(!S) return false; try{
      for(const sid in S.sources){ try{ GE().layers.setSourceData(sid,S.sources[sid]); }catch(_){} }
      for(const id in S.layers){ try{ if(!GE().layers.has(id)) continue; const L2=S.layers[id];
        if('filter' in L2){ try{ GE().layers.setFilter(id,L2.filter); }catch(_){} }
        if(L2.paint){ for(const p in L2.paint){ try{ GE().layers.setPaint(id,p,L2.paint[p]); }catch(_){} } } }catch(_){} }
      return true; }catch(_){ return false; } }
    /* (#R118b) ADOPT, not just restore: the highlight module re-asserts its own _hlPolys/_hlLines 140ms after any
       styledata (see paintPolys reassert), which instantly overwrote a bare setData restore. Restoring a message's
       snapshot therefore also makes its content the module's CURRENT state — switching an old reply ON literally
       makes that reply the active highlight. */
    function _ovlAdopt(kind,S){ if(!_ovlRestore(kind,S)) return false;
      /* (#R125) restore FEATURE-STATES on the ORIGINAL sources too (country highlight nlq / choropleth choroV are
         states, not data) and make them the module's CURRENT state (_hl/_choroState) so the styledata reassert
         keeps this reply's content instead of the previous owner's. */
      try{ if(S.states){
        if(kind==='highlight'){ try{ clearHl(); }catch(_){} }
        if(kind==='choropleth'){ try{ for(const c in _choroState){ GE().layers.setFeatureState({source:'nlq-src',id:c},{choroV:null}); } _choroState={}; }catch(_){} }
        for(const sid in S.states){ const st=S.states[sid]; for(const fid in st){ try{ GE().layers.setFeatureState({source:sid,id:fid},st[fid]);
          if(kind==='highlight'&&st[fid].nlq) try{ _hl.add(String(fid)); }catch(_){}
          if(kind==='choropleth'&&st[fid].choroV!=null) try{ _choroState[String(fid)]=st[fid].choroV; }catch(_){}
        }catch(_){} } } } }catch(_){}
      try{
        if(kind==='highlight'){ const d=S.sources&&S.sources['nlq-poly-src'];
          if(d&&Array.isArray(d.features)) _hlPolys=d.features.map(f=>({ geo:f.geometry, name:(f.properties&&f.properties.name)||'', color:(f.properties&&f.properties.color)||null, comp:!!(f.properties&&f.properties.comp), op:(f.properties&&f.properties.op!=null)?f.properties.op:null })); }
        if(kind==='lines'){ const d=S.sources&&S.sources['nlq-line-src'];
          if(d&&Array.isArray(d.features)) _hlLines=d.features.map(f=>({ geo:f.geometry, color:(f.properties&&f.properties.color)||null, w:(f.properties&&f.properties.w)||2.5, op:(f.properties&&f.properties.op!=null)?f.properties.op:null })); }
      }catch(_){}
      return true; }
    /* (#R125) TRUE INDEPENDENT COEXISTENCE ("一つをオンオフしたら他のものが勝手にオンオフしてしまう"): when a chip is
       turned ON while ANOTHER message owns the shared nlq-* canvas of that kind, we no longer steal ownership (which
       flipped the other chip off). Instead the message's snapshot is painted into its OWN per-message CLONE layers
       (atlm<n>-…), built from the original layer definitions + the snapshot's geojson data — so both messages'
       results show on the map at once and each chip only ever controls its own content. Clones are re-asserted
       after a style swap (styledata) from the stored defs, and hidden entries are LRU-evicted so the layer count
       stays bounded. Kinds without a geojson snapshot (e.g. the arc canvas) keep the R122 ownership behaviour. */
    const _ovlClones=new Map(); let _atlmSeq=0;
    function _cloneEnt(bEl,kind,make){ let reg=_ovlClones.get(bEl); if(!reg){ if(!make) return null; reg={}; _ovlClones.set(bEl,reg); }
      if(!reg[kind]&&make) reg[kind]={defs:[],srcs:{},visible:false,t:0}; return reg[kind]||null; }
    function _ovlCloneShow(bEl,kind,S){ if(!S||!S.sources||!Object.keys(S.sources).length) return false;
      try{
        if(!bEl.__atlmId) bEl.__atlmId=++_atlmSeq;
        const kid='atlm'+bEl.__atlmId+'-'+kind, ids=_OVL[kind]||[];
        const ent=_cloneEnt(bEl,kind,true);
        if(!ent.defs.length){   /* first show: clone the ORIGINAL layer definitions with remapped ids/sources */
          const style=GE().scene.getStyle(); const byId={}; (style.layers||[]).forEach(l=>{ byId[l.id]=l; });
          const srcMap={}; for(const sid in S.sources){ const csid=kid+'-s-'+sid; srcMap[sid]=csid; ent.srcs[csid]=JSON.parse(JSON.stringify(S.sources[sid]));
            if(S.promote&&S.promote[sid]){ ent.promote=ent.promote||{}; ent.promote[csid]=S.promote[sid]; }
            if(S.states&&S.states[sid]){ ent.states=ent.states||{}; ent.states[csid]=JSON.parse(JSON.stringify(S.states[sid])); } }
          ids.forEach(id=>{ const def=byId[id]; if(!def) return; const sid=def.source; if(!srcMap[sid]) return;
            const nd=JSON.parse(JSON.stringify(def)); nd.id=kid+'-'+id; nd.source=srcMap[sid]; delete nd['source-layer'];
            const L2=(S.layers&&S.layers[id])||{}; if('filter' in L2) nd.filter=L2.filter; if(L2.paint) nd.paint=Object.assign({},nd.paint||{},L2.paint);
            nd.layout=Object.assign({},nd.layout||{},{visibility:'visible'}); nd.__before=id;   /* insert next to the original */
            ent.defs.push(nd); });
          if(!ent.defs.length){ delete _ovlClones.get(bEl)[kind]; return false; } }
        /* (re)create sources + layers as needed, then show (promoteId + feature-states re-applied so
           feature-state-driven kinds — country highlight / choropleth — actually paint on the clone) */
        for(const csid in ent.srcs){ try{ if(GE().layers.hasSource(csid)) GE().layers.setSourceData(csid,ent.srcs[csid]); else { const o={type:'geojson',data:ent.srcs[csid]}; if(ent.promote&&ent.promote[csid]) o.promoteId=ent.promote[csid]; GE().layers.addSource(csid,o); }
          const st=ent.states&&ent.states[csid]; if(st){ for(const fid in st){ try{ GE().layers.setFeatureState({source:csid,id:fid},st[fid]); }catch(_){} } } }catch(_){} }
        ent.defs.forEach(nd=>{ try{ if(!GE().layers.has(nd.id)){ const d2=JSON.parse(JSON.stringify(nd)); delete d2.__before; GE().layers.add(d2, GE().layers.has(nd.__before)?nd.__before:undefined); }
          GE().layers.setLayout(nd.id,'visibility','visible'); }catch(_){} });
        ent.visible=true; ent.t=++_atlmSeq; _ovlCloneGC();
        return true; }catch(_){ return false; } }
    function _ovlCloneHide(bEl,kind){ const ent=_cloneEnt(bEl,kind,false); if(!ent) return false;
      ent.defs.forEach(nd=>{ try{ if(GE().layers.has(nd.id)) GE().layers.setLayout(nd.id,'visibility','none'); }catch(_){} });
      const was=ent.visible; ent.visible=false; return was; }
    function _ovlCloneVisible(bEl,kind){ const ent=_cloneEnt(bEl,kind,false); return !!(ent&&ent.visible); }
    function _ovlCloneGC(){ try{ const all=[]; _ovlClones.forEach((reg,b)=>{ for(const k in reg) all.push([b,k,reg[k]]); });
      const hidden=all.filter(e=>!e[2].visible).sort((a,b2)=>a[2].t-b2[2].t);
      while(all.length>14&&hidden.length){ const [b,k,ent]=hidden.shift(); all.splice(all.findIndex(e=>e[2]===ent),1);
        ent.defs.forEach(nd=>{ try{ if(GE().layers.has(nd.id)) GE().layers.remove(nd.id); }catch(_){} });
        for(const csid in ent.srcs){ try{ if(GE().layers.hasSource(csid)) GE().layers.removeSource(csid); }catch(_){} }
        try{ delete _ovlClones.get(b)[k]; }catch(_){} } }catch(_){} }
    try{ if(GE().hasRenderer()&&GE().hasRenderer()) GE().events.on('styledata',()=>{ clearTimeout(_ovlCloneShow._t); _ovlCloneShow._t=setTimeout(()=>{ try{
      _ovlClones.forEach(reg=>{ for(const k in reg){ const ent=reg[k]; if(!ent.visible) continue;
        for(const csid in ent.srcs){ try{ if(!GE().layers.hasSource(csid)){ const o={type:'geojson',data:ent.srcs[csid]}; if(ent.promote&&ent.promote[csid]) o.promoteId=ent.promote[csid]; GE().layers.addSource(csid,o); }
          const st=ent.states&&ent.states[csid]; if(st){ for(const fid in st){ try{ GE().layers.setFeatureState({source:csid,id:fid},st[fid]); }catch(_){} } } }catch(_){} }
        ent.defs.forEach(nd=>{ try{ if(!GE().layers.has(nd.id)){ const d2=JSON.parse(JSON.stringify(nd)); delete d2.__before; GE().layers.add(d2, GE().layers.has(nd.__before)?nd.__before:undefined); } }catch(_){} }); } }); }catch(_){} },600); }); }catch(_){}
    /* (#R145) on/off VIEW features (grid / 3D terrain / country-info) previously returned a text note only — give each
       an inline toggle SWITCH so the user can flip it straight from the reply ("オンオフ要素のある時はなるべくボタンを設置").
       Flips the REAL UI control directly (no chat turn) and reads the true state back, so the switch never lies. */
    const _FEAT_TOG={
      grid:{ lbl:()=>L('Grid','グリッド','Gitter','Сетка','Cuadrícula'), on:()=>{ const b=document.getElementById('btn-tool-grid'); const c=document.getElementById('cb-grid'); return !!((b&&b.classList.contains('tool-on'))||(c&&c.checked)); }, set:v=>{ try{ if(typeof setGrid==='function') setGrid(v); else clickId('btn-tool-grid'); }catch(_){ clickId('btn-tool-grid'); } } },
      terrain3d:{ lbl:()=>L('3D terrain','3D地形','3D-Gelände','3D-рельеф','Terreno 3D'), on:()=>{ const b=document.getElementById('btn-view-3d'); return !!(b&&(b.classList.contains('active')||b.classList.contains('view-on')||b.classList.contains('on')||b.getAttribute('aria-pressed')==='true')); }, set:v=>{ clickId(v?'btn-view-3d':'btn-view-globe'); } },
      countryInfo:{ lbl:()=>L('Country info','国情報','Länderinfo','Инфо о странах','Info de países'), on:()=>{ const cb=document.getElementById('cb-countries'); return !!(cb&&cb.checked); }, set:v=>{ const cb=document.getElementById('cb-countries'); if(cb&&cb.checked!==v){ cb.checked=v; cb.dispatchEvent(new Event('change',{bubbles:true})); } } },
      /* (#R146) more on/off view features get an inline switch ("なるべくボタンを設置") */
      streetview:{ lbl:()=>L('Street View coverage','ストリートビュー範囲','Street-View-Abdeckung','Покрытие Street View','Cobertura Street View'), on:()=>{ try{ return !!(window.IntMapStreetView&&window.IntMapStreetView.coverageOn&&window.IntMapStreetView.coverageOn()); }catch(_){ return false; } }, set:v=>{ try{ window.IntMapStreetView&&window.IntMapStreetView.coverage&&window.IntMapStreetView.coverage(!!v); }catch(_){} } },
      satellite:{ lbl:()=>L('Satellite','衛星写真','Satellit','Спутник','Satélite'), on:()=>{ const b=document.getElementById('btn-view-sat'); return !!(b&&(b.classList.contains('active')||b.classList.contains('view-on')||b.classList.contains('on')||b.getAttribute('aria-pressed')==='true')); }, set:v=>{ clickId(v?'btn-view-sat':'btn-view-map'); } },
      borders:{ lbl:()=>L('Borders','国境','Grenzen','Границы','Fronteras'), on:()=>{ const cb=document.getElementById('cb-borders'); return !!(cb&&cb.checked); }, set:v=>{ const cb=document.getElementById('cb-borders'); if(cb&&cb.checked!==v){ cb.checked=v; cb.dispatchEvent(new Event('change',{bubbles:true})); } } },
      coastline:{ lbl:()=>L('Coastlines','海岸線','Küstenlinien','Береговые линии','Costas'), on:()=>{ const cb=document.getElementById('cb-coast'); return !!(cb&&cb.checked); }, set:v=>{ const cb=document.getElementById('cb-coast'); if(cb&&cb.checked!==v){ cb.checked=v; cb.dispatchEvent(new Event('change',{bubbles:true})); } } },   /* (#R289) */
      labels:{ lbl:()=>L('Place labels','地名ラベル','Beschriftungen','Подписи','Etiquetas'), on:()=>{ const cb=document.getElementById('cb-geolabels')||document.getElementById('cb-names'); return !!(cb&&cb.checked); }, set:v=>{ const cb=document.getElementById('cb-geolabels')||document.getElementById('cb-names'); if(cb&&cb.checked!==v){ cb.checked=v; cb.dispatchEvent(new Event('change',{bubbles:true})); } } },
      roads:{ lbl:()=>L('Roads','道路','Straßen','Дороги','Carreteras'), on:()=>{ const cb=document.getElementById('cb-roads'); return !!(cb&&cb.checked); }, set:v=>{ const cb=document.getElementById('cb-roads'); if(cb&&cb.checked!==v){ cb.checked=v; cb.dispatchEvent(new Event('change',{bubbles:true})); } } },
      ticker:{ lbl:()=>L('Bottom ticker','下部ティッカー','Ticker','Бегущая строка','Cinta inferior'), on:()=>{ try{ return String(window.imTicker||'')!=='off'; }catch(_){ return true; } }, set:v=>{ try{ if(window.IntMapTicker){ window.imTicker=v?'on':'off'; window.IntMapTicker.apply(); if(typeof saveSettings==='function') saveSettings(); } }catch(_){} } },   /* (#R149) more on/off features get an inline toggle */
      /* (#R151) even more on/off surfaces get a switch ("オンオフ要素のある時はなるべくトグルボタンを設置") */
      globe:{ lbl:()=>L('3D globe','地球儀','Globus','Глобус','Globo'), on:()=>{ const b=document.getElementById('btn-view-globe'); return !!(b&&(b.classList.contains('active')||b.classList.contains('view-on')||b.classList.contains('on')||b.getAttribute('aria-pressed')==='true')); }, set:v=>{ clickId(v?'btn-view-globe':'btn-view-flat'); } },
      compare:{ lbl:()=>L('Compare panel','比較パネル','Vergleich','Панель сравнения','Comparar'), on:()=>{ try{ return document.body.classList.contains('cmp-open'); }catch(_){ return false; } }, set:v=>{ try{ if(v){ if(window.IntMapCompare&&window.IntMapCompare.open) window.IntMapCompare.open(); else clickId('btn-compare'); } else { const x=document.querySelector('#compare-window .cmp-close'); if(x) x.click(); } }catch(_){} } },
      /* (#R152) fullscreen is a plain on/off → give it a switch too */
      fullscreen:{ lbl:()=>L('Fullscreen','全画面','Vollbild','Полный экран','Pantalla completa'), on:()=>!!document.fullscreenElement, set:v=>{ try{ if(v){ if(!document.fullscreenElement&&document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } else if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen(); }catch(_){} } },
      /* (#R171) the two new Settings switches are on/off surfaces too */
      tiltLimit:{ lbl:()=>L('Unlimited tilt','傾き無制限','Unbegrenzte Neigung','Наклон без предела','Inclinación sin límite'), on:()=>{ try{ return !!(window.IntMapTilt&&window.IntMapTilt.isUnlimited()); }catch(_){ return false; } }, set:v=>{ try{ window.IntMapTilt&&window.IntMapTilt.set(!!v); }catch(_){} } },
      eyeAltitude:{ lbl:()=>L('Viewpoint altitude','視点の高度','Kamerahöhe','Высота камеры','Altitud del punto de vista'), on:()=>{ try{ return !!(window.IntMapEyeAlt&&window.IntMapEyeAlt.isOn()); }catch(_){ return false; } }, set:v=>{ try{ window.IntMapEyeAlt&&window.IntMapEyeAlt.set(!!v); }catch(_){} } },
      /* (#R196) the darkening of the unlit hemisphere + the VIIRS city lights, both zoom-ramped */
      nightSide:{ lbl:()=>L('Night side of the Earth','地球の夜側','Nachtseite der Erde','Ночная сторона Земли','Lado nocturno de la Tierra'), on:()=>{ try{ const s2=window.IntMapNightSide&&window.IntMapNightSide.state(); return !!(s2&&s2.enabled); }catch(_){ return false; } }, set:v=>{ try{ window.IntMapNightSide&&window.IntMapNightSide.setEnabled(!!v); }catch(_){} } },
      /* (#R172) live aircraft standing at their reported altitude instead of flat on the map */
      windParticles:{ lbl:()=>L('Wind particles','風のパーティクル','Wind-Partikel','Частицы ветра','Partículas de viento'), on:()=>{ try{ return !!(window.Wind&&window.Wind.particles&&window.Wind.particles()); }catch(_){ return false; } }, set:v=>{ try{ window.Wind&&window.Wind.setParticles&&window.Wind.setParticles(!!v); }catch(_){} } },
      /* (#R337) the same streaks over the TEMPERATURE layer — a different question with a different
         default (js/weather.js). `on()` reads the preference through the one published door, so this
         switch, the legend box and the dispatch above cannot disagree about the state. */
      tempWindParticles:{ lbl:()=>L('Wind particles over the temperature layer','気温レイヤー上の風のパーティクル','Wind-Partikel über der Temperaturschicht','Частицы ветра поверх слоя температуры','Partículas de viento sobre la capa de temperatura'), on:()=>{ try{ return !!(window._imWxTempParts&&window._imWxTempParts()); }catch(_){ return false; } }, set:v=>{ try{ window._imWxTempParts&&window._imWxTempParts(!!v); }catch(_){} } },
      planeAltitude:{ lbl:()=>L('Aircraft at real altitude','航空機を実際の高度で','Flugzeuge in echter Höhe','Самолёты на реальной высоте','Aviones a su altitud real'), on:()=>{ try{ return !!(window.IntMapPlanes3D&&window.IntMapPlanes3D.isOn()); }catch(_){ return false; } }, set:v=>{ try{ window.IntMapPlanes3D&&window.IntMapPlanes3D.set(!!v); }catch(_){} } }
    };
    /* (#R152) GENERIC on/off toggle for ANY checkbox reached through the universal "control" action — so
       "オンオフ要素のある時はなるべくトグルボタンを設置" also covers controls with no dedicated _FEAT_TOG entry. It binds to the
       control's target string; the delegated handler re-resolves it, flips it and reads the true state back. */
    function _ctlTogHtml(target, el){ try{ if(!el||el.type!=='checkbox') return ''; const on=!!el.checked; const lbl=esc(String(target||el.id||'').slice(0,40));
      return '<div class="atl-ctl-row" style="margin-top:6px;"><span class="atl-ctl-lbl">'+lbl+'</span><button class="atl-ctl-toggle atl-ctl-gen'+(on?' on':'')+'" data-ctl="'+esc(String(target||el.id||''))+'" role="switch" aria-checked="'+(on?'true':'false')+'"><span class="atl-ctl-knob"></span></button></div>'; }catch(_){ return ''; } }
    function _featTogHtml(kind){ const f=_FEAT_TOG[kind]; if(!f) return ''; let on=false; try{ on=!!f.on(); }catch(_){}
      /* (#R148) removed R147's bespoke .atl-featbtn ("独自ボタン") — restore the standard iOS toggle switch that shipped before R147. */
      return '<div class="atl-ctl-row" style="margin-top:6px;"><span class="atl-ctl-lbl">'+esc(f.lbl())+'</span><button class="atl-ctl-toggle atl-feat-tog'+(on?' on':'')+'" data-feat="'+esc(kind)+'" role="switch" aria-checked="'+(on?'true':'false')+'"><span class="atl-ctl-knob"></span></button></div>'; }
    function mapToggleChip(kinds){ const K=Array.from(new Set((kinds||[]).filter(k=>_OVL[k]||k==='arc'))); if(!K.length) return '';
      return '<div class="atl-mapctl atl-ctl-row" data-ovls="'+esc(K.join(','))+'" style="margin:7px 0 1px;"><span class="atl-ctl-lbl">'+L('Shown on the map','地図に表示中','Auf der Karte','Показано на карте','En el mapa')+'</span>'
        +'<button class="atl-ctl-toggle atl-map-toggle on" role="switch" aria-checked="true" title="'+L('Show / hide on the map','地図で表示 / 非表示','Auf der Karte ein/aus','Показать/скрыть на карте','Mostrar/ocultar en el mapa')+'"><span class="atl-ctl-knob"></span></button></div>'; }
    /* (#R130) Stage-aware "thinking" indicator — the placeholder used to show the SAME generic 3-dot bubble for every
       phase. Now it reads out what Atlas is REALLY doing right now, driven by the actual pipeline (planner wait =
       Thinking; a web-search/brief action = Searching; a compare/stat = Analyzing; a map action = Mapping). The
       setStage is a no-op once real content has replaced the placeholder (so a late call never clobbers a reply).
       ⚠ (#R313) `.atl-stage` IS NOW THE MARKER as well as the label. It used to carry a bouncing-dot
       child that was both the animation and the thing the cancel-scan looked for; the shimmer needs
       the glyphs and nothing else inside the element, so that child is gone and every selector that
       meant 「this bubble is still working」 now names `.atl-stage`. Six call sites that emitted a
       BARE dot span with no label were the same indicator without a word — they say 「Thinking」 now,
       which is also what ChatGPT does; leaving them as dots would have kept two graphics for one
       state, which is the thing being removed. */
    const _STAGE_TXT={ think:L('Thinking','考え中','Denke nach','Думаю','Pensando'), search:L('Searching','検索中','Suche','Ищу','Buscando'), analyze:L('Analyzing','分析中','Analysiere','Анализирую','Analizando'), map:L('Mapping','地図に描画中','Zeichne Karte','Рисую карту','Dibujando mapa'), write:L('Writing','作成中','Schreibe','Пишу','Escribiendo'), read:L('Reading the image','画像を精読中','Lese das Bild','Читаю изображение','Leyendo la imagen'), verify:L('Verifying','検算中','Verifiziere','Проверяю','Verificando') };
    function stageDots(k){ return '<span class="atl-stage" role="status" aria-live="polite">'+esc(_STAGE_TXT[k]||_STAGE_TXT.think)+'</span>'; }
    function setStage(el,k){ try{ if(el&&el.querySelector&&el.querySelector('.atl-stage')) el.innerHTML=stageDots(k); }catch(_){} }
    const _STAGE_OF=a=>{ const t=a&&a.type; if(t==='analyze'||t==='research'||t==='synthesize'||t==='brief'||t==='news'||t==='events') return 'search'; if(t==='compare'||t==='rank'||t==='stat'||t==='mapReport'||t==='researchMap'||t==='research_map'||t==='situationMap'||t==='population') return 'analyze'; if(['flyTo','fly','layer','highlight','outline','draw','missile','directions','isochrone','radiation','viewshed','zoom','pan','pitch','bearing','pin','marker'].indexOf(t)>=0) return 'map'; return 'think'; };
    /* (#R159) ── COMPOSITE-ANSWER INTEGRATION ─────────────────────────────────────────────────────────────────
       One request must produce ONE final answer — not the first (failed) analysis and the repaired analysis stacked
       with a divider, contradicting each other. runActions now RECORDS each action's result on the bubble
       (ai.__atlResults) instead of blindly concatenating html, and _atlCompose() renders from that list keeping only
       the BEST result per research/answer GOAL. The repair pass re-runs into the SAME bubble (no divider, no second
       answer) and its answer inherits the failed original's goal key, so a successful repair REPLACES the failure
       rather than piling on. Map-only failure never fails the written analysis (the dispatch already returns ok:true
       for that), and the fail summary no longer leaks internal action names / error codes / repair counts. */
    const _ATL_ANSWER_TYPES={mapReport:1,newsMap:1,reportMap:1,researchMap:1,research_map:1,situationMap:1,historicalMap:1,historical:1,powerMap:1,allianceMap:1,analyze:1,research:1,synthesize:1,brief:1};
    function _atlGoalKey(act){ if(!act||!act.type) return ''; if(act.__goalKey) return act.__goalKey;   /* a repair answer inherits the original goal it is fixing */
      if(_ATL_ANSWER_TYPES[act.type]){ let topic=''; try{ topic=_lnorm(String(act.topic||act.question||act.query||act.place||act.region||act.location||act.era||'')); }catch(_){ topic=''; } return 'answer:'+topic; }
      return ''; }   /* '' = not a de-dupeable answer (navigate / layer / draw / control … keep all of these) */
    function _atlGoalScore(res){ const m=(res&&res.meta)||{}; let s=0;
      if(res&&res.ok) s+=2;
      if(m.userGoalSatisfied) s+=5;
      const prod=Array.isArray(m.produced)?m.produced:[];
      if(prod.indexOf('explanation')>=0) s+=2;
      if(prod.indexOf('map')>=0) s+=1;
      if(m.partial||m.unverified) s-=2;
      return s; }
    function _atlCompose(ai){ try{
      const results=(ai&&ai.__atlResults)||[]; const say=(ai&&ai.__atlSay)||'';
      /* 1) DEDUPE BY GOAL — keep the single best result per answer family (original vs repair vs same-topic retry). */
      const slot=Object.create(null), keep=[];
      results.forEach(res=>{ if(!res) return; const key=_atlGoalKey(res.act);
        if(!key){ keep.push(res); return; }
        if(!(key in slot)){ slot[key]=keep.length; keep.push(res); }
        else { const i=slot[key]; if(_atlGoalScore(res)>_atlGoalScore(keep[i])) keep[i]=res; } });   /* repair replaces the failure */
      /* 2) fails + honesty flags computed from the FINAL (deduped) set — a replaced failure no longer counts */
      const fails=keep.filter(r=>r&&r.ok===false).map(r=>r.act);
      const _allFailed=keep.length>0 && keep.every(r=>r&&r.ok===false);
      const _visTypes={highlight:1,outline:1,draw:1,layer:1,opacity:1,controls:1,mapMetric:1,choropleth:1};
      const _visFailed=keep.some(r=>r&&r.ok===false&&r.act&&_visTypes[r.act.type]) || keep.some(r=>r&&r.meta&&(r.meta.partial||r.meta.unverified));   /* (#R142) suppress a pre-written success `say` a visual failure contradicts */
      /* 3) body from kept results (original order), dropping any exact-duplicate html fragment */
      let body=''; const seen=Object.create(null);
      keep.forEach(res=>{ const h=(res&&res.html)||''; if(!h||seen[h]) return; seen[h]=1; body+=h; });
      try{ const ks=ai.__atlMappedKinds?Object.keys(ai.__atlMappedKinds):[]; if(ks.length) body+=mapToggleChip(ks); }catch(_){}   /* single deduped map-toggle chip */
      /* 4) head — the pre-written `say` (suppressed on all-failed / contradicted visual) + an honest, NAME-FREE summary */
      let head=(say&&!_allFailed&&!_visFailed)?('<div style="margin-bottom:6px;">'+mdMini(say)+'</div>'):'';   /* (#R147) render via mdMini so line breaks / headings show */
      /* ══ ⚠ (#R350) A COURTESY THAT DID NOT LAND IS NOT A FAILED TURN ═══════════════════════════
         Reported: an informational question was answered correctly and the reply OPENED with 「⚠ 実行
         できなかった操作が 1 件あります」 — because a flyTo that ATLAS ITSELF had added to the plan did
         not land. The count was of failed actions; nothing asked whose goal each action served.
         PRIMARY failures still lead, because the reader is owed those. SECONDARY ones are a quiet
         line AFTER the answer — visible, never alarming, and never at the top. ⚠ NOT HIDDEN: 「エラー
         表示をすべて隠す」 and 「map失敗を常に無視する」 are both forbidden, so the note is always printed. */
      const primaryFails=fails.filter(a=>a&&a.__impact!=='secondary'&&a.__impact!=='none');
      const secondaryFails=fails.filter(a=>a&&a.__impact==='secondary');
      if(primaryFails.length){ head+='<div style="font-size:11.5px;color:#ff9f0a;font-weight:600;margin:1px 0 6px;">⚠ '+L(primaryFails.length+' step(s) could not be completed','実行できなかった操作が '+primaryFails.length+' 件あります',primaryFails.length+' Schritt(e) nicht ausgeführt','Не выполнено шагов: '+primaryFails.length,primaryFails.length+' paso(s) sin completar')+'</div>'; }   /* (#R159) no action-name/code leak — the per-action honest body already says what could not be found */
      /* the quiet half of the same rule: what did NOT happen is still said, after the answer. */
      if(secondaryFails.length) body+='<div class="atl-aux">'+esc(L('The map view did not change.','地図の表示は変わりませんでした。','Die Kartenansicht hat sich nicht geändert.','Вид карты не изменился.','La vista del mapa no cambió.'))+'</div>';
      if(ai.__atlCancelled) head=_cancelledNote()+head;
      ai.innerHTML=(head+body)||esc(L('Done.','完了しました。','Fertig.','Готово.','Hecho.'));
      try{ _refreshMapChips(); }catch(_){}   /* (#R122) sync every map-toggle chip's on/off to real ownership+visibility */
    }catch(e){ try{ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; }catch(_){} } }
    /* (#R350) one door for every planner call, so the citations of THIS turn are captured beside the
       plan rather than fished out of a global at render time. */
    async function _planCall(prompt, sys, imgs, opts){ const e=await askAIJSONEnvelope(prompt, sys, imgs, opts);
      try{ _curPlanCites=(Array.isArray(e&&e.citations)?e.citations:[]).filter(c=>c&&_atlCleanUrl(c.url)); }catch(_){ _curPlanCites=[]; }
      return e?e.data:null; }
    async function runActions(ai, say, acts, gen){
      const results=[]; const fails=[]; let cancelled=false;
      for(const a of acts){ if(gen!=null&&gen!==_runGen){ cancelled=true; break; }
        try{ setStage(ai, _STAGE_OF(a)); }catch(_){}   /* (#R130) reflect the real current action in the indicator */
        /* ══ (#R318) THROUGH THE KERNEL, NOT STRAIGHT AT THE ENGINE ════════════════════════════
           This line used to be `r=await dispatch(a)` — call the case, believe what it says. The case
           still does all the engine work; what is new is the eleven steps around it (availability,
           argument validation, a REFUSAL to invent a missing target, an observation of the app
           before and after, and a postcondition). `toLegacy` puts the verdict back into the shape
           `_atlCompose` and the repair loop already read, so nothing downstream had to change —
           except that `ok` is now something the app watched happen. */
        let r, _ar=null;
        try{ const _cap=CAPS.resolve(a.type); const _args={}; Object.keys(a).forEach(k=>{ if(k!=='type'&&k.slice(0,2)!=='__') _args[k]=a[k]; });
          _ar=await EXEC.execute(_cap?_cap.id:a.type, _args, {source:'atlas', turnId:_curTurn, signal:(_abortCtl?_abortCtl.signal:undefined)});
          r=RESULTS.toLegacy(_ar); }
        catch(e){ r=R(false, warn('⚠ '+esc(actLabel(a))+': '+esc((e&&e.message)||'error'))); }
        if(!r||typeof r!=='object') r=R(true, String(r||''));
        if(_ar){ try{ a.__result=_ar; if(_ar.status!=='completed') a.__status=_ar.status; }catch(_){} }
        /* ⚠ A STEP THAT IS WAITING ON THE USER IS NOT A FAILURE, AND MUST NOT BE REPAIRED AS ONE.
           The repair pass exists to find ANOTHER way to reach an unmet goal; aimed at a question the
           user has not answered yet it would do exactly what #R115 did — substitute something the
           model has been shown for the thing that was actually asked for. So it is rendered, it is
           REMEMBERED (askHere() resumes it when the map is clicked), and it stays out of `fails`. */
        if(_ar&&(_ar.status==='needs_input'||_ar.status==='running')){ r.html=(r.html||'')+RESULTS.render(_ar,{L,esc,note,warn}); }
        if(_ar&&_ar.status==='needs_input'&&_ar.inputRequest){ _pendingInput={ result:_ar, bubble:ai, at:Date.now() }; }
        if(r.ok===false&&!(_ar&&(_ar.status==='needs_input'||_ar.status==='running'))) fails.push(a);
        try{ a.__impact=_PLANNER.goalImpact(_curProfile,a); }catch(_){ a.__impact='primary'; }   /* (#R350) primary = an output the user asked for; secondary = a courtesy Atlas added */
        results.push({act:a, ok:r.ok!==false, html:r.html||'', meta:(r&&r.meta)||null, impact:a.__impact});   /* (#R159) per-action result → _atlCompose de-dupes by goal so repair REPLACES a failure instead of appending */
        try{ if(r&&r.meta) a.__meta=r.meta; if(r&&r.exec) a.__exec=r.exec;   /* (#R158) mechanical execution result → fed back to Terra by the repair loop */
          if(_atlasOutcomes) _atlasOutcomes.push({type:a&&a.type,label:actLabel(a),ok:r.ok!==false,code:(r&&r.meta&&r.meta.code)||'',semanticTarget:(r&&r.meta&&r.meta.semanticTarget)||'',temporalMode:(r&&r.meta&&r.meta.temporalMode)||'',produced:(r&&r.meta&&r.meta.produced)||[],userGoalSatisfied:(r&&r.meta&&r.meta.userGoalSatisfied)}); }catch(_){}   /* (#R135) structured per-action outcome → repair + goal validation + debug */
        if(r.objectIds&&r.objectIds.length){ try{ _wctx.lastObjects=r.objectIds.concat(_wctx.lastObjects||[]).slice(0,6); }catch(_){} } }   /* (#R119) "さっき作ったやつ" resolves to these */
      try{ const mapped=[]; acts.forEach(a=>{ if(fails.indexOf(a)>=0) return; let ks=OVL_OF[a&&a.type]; if(!ks) return; if(!Array.isArray(ks)) ks=[ks]; ks.forEach(k=>{ if(k&&_ovlVisible(k)&&mapped.indexOf(k)<0) mapped.push(k); }); });
        if(mapped.length){ try{ ai.__ovlSnap=Object.assign(ai.__ovlSnap||{}, _ovlSnapshot(mapped)); mapped.forEach(k=>{
          /* (#R127) TRUE INDEPENDENT COEXISTENCE on the DRAW path ("新しいものが追加されたときに古いものが勝手にオフに
             なってしまう"): drawing a new overlay of kind k repaints the SHARED nlq-* canvas — which physically wiped
             the previous owner's content (highlight() clearHl()s first) AND stole ownership, flipping every older
             same-kind chip OFF. R125's clone system fixed this ONLY on the manual chip-click path; the auto-draw
             path never cloned. Fix: before this reply takes the shared canvas, EVACUATE the previous owner to its
             OWN per-message clone (rebuilt from that reply's snapshot), so BOTH overlays stay on the map and BOTH
             chips stay ON. Falls back to the old ownership hand-off when the previous owner has no clonable snapshot
             (e.g. the arc canvas). */
          try{ const prev=_ovlOwn[k];
            if(prev&&prev!==ai&&document.body.contains(prev)&&prev.__ovlSnap&&prev.__ovlSnap[k]&&!_ovlCloneVisible(prev,k)){ _ovlCloneShow(prev,k,prev.__ovlSnap[k]); } }catch(_){}
          _ovlOwn[k]=ai; }); }catch(_){}
          ai.__atlMappedKinds=ai.__atlMappedKinds||Object.create(null); mapped.forEach(k=>{ ai.__atlMappedKinds[k]=1; }); } }catch(_){}   /* (#R118/#R159) collect owned overlay kinds → one deduped chip in _atlCompose */
      /* (#R159) accumulate this pass's results on the bubble so the repair pass merges into ONE goal-validated answer */
      ai.__atlResults=(ai.__atlResults||[]).concat(results);
      if(ai.__atlSay==null) ai.__atlSay=say||'';   /* the FIRST say leads; a later repair say never overrides it */
      if(cancelled) ai.__atlCancelled=true;
      if(gen!=null&&gen!==_runGen){ try{ ai.innerHTML=_cancelledNote(); }catch(_){} return fails; }
      _atlCompose(ai);
      return fails;
    }
    /* (#R52) DETERMINISTIC interpreter. The user re-reported operations Atlas "said" it did but didn't. A clear,
       single-intent command should NEVER depend on (or spend) an AI round-trip, and when the AI fails to return a
       usable plan we should still try to do the obvious thing rather than say "couldn't interpret". localPlan(q)
       maps such commands to the SAME action objects dispatch already runs, in all 5 UI languages. It returns
       {actions, confident}: `confident` (a fully-anchored single intent) runs immediately and skips the AI;
       non-confident matches (navigation / layer toggle) are used only to RESCUE a failed AI plan, so the AI still
       owns every compound / contextual / ambiguous request. */
    /* (#R115) Compare-indicator resolver — "Compare the USA, China and India — GDP, defense and population"
       opened the panel but IGNORED the named indicators (localPlan dropped the "— metrics" tail on purpose, and
       the AI was never told a "metrics" parameter exists). Map free-text indicator names (5 languages + common
       synonyms like defense→military spending) onto IntMapStatsCompare's real IND keys. */
    const _CMP_ALIAS={
      'gdp':'gdp','gross domestic product':'gdp','経済規模':'gdp','bip':'gdp','ввп':'gdp','pib':'gdp',
      'gdp per capita':'gdppc','per capita gdp':'gdppc','per-capita gdp':'gdppc','一人当たりgdp':'gdppc','1人当たりgdp':'gdppc','一人あたりgdp':'gdppc','bip pro kopf':'gdppc','ввп на душу':'gdppc','pib per cápita':'gdppc',
      'gdp ppp':'gdpppp','gdp (ppp)':'gdpppp','purchasing power':'gdpppp','購買力平価':'gdpppp',
      'gdp per capita ppp':'gdppcppp',
      'growth':'growth','gdp growth':'growth','economic growth':'growth','成長率':'growth','経済成長':'growth','wachstum':'growth','рост':'growth','crecimiento':'growth',
      'inflation':'infl','cpi':'infl','インフレ':'infl','物価':'infl','инфляция':'infl','inflación':'infl',
      'unemployment':'unemp','jobless':'unemp','失業':'unemp','arbeitslosigkeit':'unemp','безработица':'unemp','desempleo':'unemp',
      'debt':'debt','government debt':'debt','public debt':'debt','債務':'debt','政府債務':'debt','staatsschulden':'debt','госдолг':'debt','deuda':'debt',
      'current account':'cab','経常収支':'cab','leistungsbilanz':'cab','текущий счёт':'cab','cuenta corriente':'cab',
      'population':'pop','people':'pop','人口':'pop','bevölkerung':'pop','население':'pop','población':'pop',
      'life expectancy':'life','longevity':'life','平均寿命':'life','寿命':'life','lebenserwartung':'life','продолжительность жизни':'life','esperanza de vida':'life',
      'fertility':'tfr','birth rate':'tfr','births':'tfr','出生率':'tfr','geburtenrate':'tfr','рождаемость':'tfr','fecundidad':'tfr',
      'defense':'milb','defence':'milb','military':'milb','military spending':'milb','defense spending':'milb','defence spending':'milb','military budget':'milb','military expenditure':'milb','軍事費':'milb','国防費':'milb','防衛費':'milb','軍事':'milb','国防':'milb','militär':'milb','verteidigung':'milb','оборона':'milb','военные расходы':'milb','defensa':'milb','gasto militar':'milb',
      'military % gdp':'mil','military share of gdp':'mil','defense % gdp':'mil','軍事費対gdp':'mil',
      'co2':'co2','co₂':'co2','carbon':'co2','emissions':'co2','排出':'co2','emisiones':'co2','выбросы':'co2',
      'internet':'net','インターネット':'net','ネット利用':'net','интернет':'net',
      'urban':'urban','urbanization':'urban','urbanisation':'urban','都市人口':'urban','都市化':'urban','urbanización':'urban',
      'exports':'exp','輸出':'exp','exporte':'exp','экспорт':'exp','exportaciones':'exp',
      'fdi':'fdi','foreign direct investment':'fdi','直接投資':'fdi',
      'health':'health','healthcare':'health','医療':'health','gesundheit':'health','здравоохранение':'health','salud':'health',
      'education':'edu','教育':'edu','bildung':'edu','образование':'edu','educación':'edu',
      'r&d':'rnd','research':'rnd','研究開発':'rnd','forschung':'rnd','ниокр':'rnd','i+d':'rnd',
      'renewable':'renew','renewables':'renew','再エネ':'renew','再生可能':'renew','erneuerbare':'renew','возобновляем':'renew','renovable':'renew',
      'forest':'forest','森林':'forest','wald':'forest','лес':'forest','bosque':'forest',
      'homicide':'hom','murder':'hom','crime':'hom','殺人':'hom','mordrate':'hom','убийства':'hom','homicidios':'hom',
      'area':'area','size':'area','面積':'area','fläche':'area','площадь':'area','superficie':'area',
      'hdi':'hdi','human development':'hdi','人間開発':'hdi','ичр':'hdi','idh':'hdi',
      'democracy':'demi','民主主義':'demi','demokratie':'demi','демократия':'demi','democracia':'demi'
    };
    function _cmpMetricKey(t2){ let s2=String(t2||'').toLowerCase().trim().replace(/[.。、,]$/,'').replace(/\s+/g,' '); if(!s2) return null;
      let KEYS=[]; try{ KEYS=(window.IntMapStatsCompare&&window.IntMapStatsCompare.indKeys)?window.IntMapStatsCompare.indKeys():[]; }catch(_){}
      if(KEYS.indexOf(s2)>=0) return s2;
      if(_CMP_ALIAS[s2]) return _CMP_ALIAS[s2];
      let best=null,bl=0; for(const al in _CMP_ALIAS){ if(al.length>bl && al.length>=3 && (s2.indexOf(al)>=0||(s2.length>=3&&al.indexOf(s2)>=0))){ best=_CMP_ALIAS[al]; bl=al.length; } }
      return best; }
    function _cmpMetricKeys(str){ const out=[],miss=[];
      String(str||'').split(/,|、|・|;|\/|\s+and\s+|\s+und\s+|\s+y\s+|\s+и\s+|と/i).map(x=>x.trim()).filter(Boolean).forEach(mm=>{
        const k=_cmpMetricKey(mm); if(k){ if(out.indexOf(k)<0) out.push(k); } else miss.push(mm.slice(0,30)); });
      return {keys:out,miss}; }
    function localPlan(q){ const s=String(q||'').trim(); if(!s) return null; const low=s.toLowerCase();
      const A=a=>({actions:[a],confident:true});
      /* (#R141) AREA MONITORS — deterministic (no-AI) shortcuts. Anchored so they never shadow a compound request. */
      if(/^(monitor|watch)( this| the)?( area| region| radius| circle| selection| here)?$|^(この(範囲|地域|エリア|円)を?|ここを?)(監視|ウォッチ)(して|する)?$|^(diese[nrs]? (bereich|region|gebiet)|hier) (überwachen|beobachten)$|^(следить за|мониторить)( этой)?( областью| зоной)?$|^(monitorear|vigilar)( esta)?( área| zona| región)?$/i.test(low)) return A({type:'monitor',op:'create'});
      /* (#R231) the local "open my monitors" shortcut is withdrawn with the tab — see js/session-tabs.js */
      if(/^(switch to |go |set |enable |turn on )?(dark( ?mode| ?theme)?|ダーク(モード|テーマ)?|暗い(テーマ|モード)|dunkel(modus|es design)?|тёмн(ая|ый)( тема| режим)?|modo oscuro|tema oscuro)$/i.test(low)) return A({type:'theme',mode:'dark'});
      if(/^(switch to |go |set |enable |turn on )?(light( ?mode| ?theme)?|ライト(モード|テーマ)?|明るい(テーマ|モード)|hell(es design|modus)?|светл(ая|ый)( тема| режим)?|modo claro|tema claro)$/i.test(low)) return A({type:'theme',mode:'light'});
      if(/^(auto|system)( ?theme| ?mode| default)?$|^(自動|システム)(テーマ|デフォルト)?$/i.test(low)) return A({type:'theme',mode:'auto'});
      if(/^(globe|地球儀|globus|глобус|globo)( view| projection|表示)?$/i.test(low)) return A({type:'projection',mode:'globe'});
      if(/^(flat|2d|平面(地図)?|flach(e karte)?|плоск(ая|ий)( карта)?|plano|mapa plano)( map| view|表示)?$/i.test(low)) return A({type:'projection',mode:'flat'});
      if(/^(3d|3-?d terrain|3d地形|地形(表示)?|relieve 3d|3d-?gelände|3d рельеф)( view| mode| map)?$/i.test(low)) return A({type:'terrain3d',on:true});
      if(/^(satellite|sat|衛星(写真|表示)?|satellit(enansicht)?|спутник|satélite)( view| imagery|表示)?$/i.test(low)) return A({type:'base',mode:'satellite'});
      if(/^(map view|map base|地図(表示|に戻す)?|karten(ansicht)?|карт(а|ы)|mapa)( base| view)?$/i.test(low)) return A({type:'base',mode:'map'});
      /* WORLD_RE after the projection toggles so bare "globe" means the globe PROJECTION, while "world / earth / the whole globe / 地球" still zoom out to the planet. */
      if(WORLD_RE.test(s)) return A({type:'flyTo',place:'world'});
      if(/^(zoom ?in|拡大|ズームイン|näher( heran)?|приблизить|acercar(se)?)$/i.test(low)) return A({type:'zoom',dir:'in'});
      if(/^(zoom ?out|縮小|ズームアウト|heraus ?zoomen|отдалить|alejar(se)?)$/i.test(low)) return A({type:'zoom',dir:'out'});
      if(/^(reset north|north up|face north|北を上に?|北向き|norden ausrichten|на север|al norte|orientar al norte)$/i.test(low)) return A({type:'resetNorth'});
      if(/^(clear( the)?( map| all| everything)?|reset (the )?map|全(部)?(消去|クリア)|地図(を)?(クリア|消去)|очисти(ть)?( карту| всё)?|limpiar( el)?( mapa| todo)?|borrar todo)$/i.test(low)) return A({type:'clearAll'});
      if(/^(compass|reset view|コンパス)$/i.test(low)) return A({type:'resetNorth'});
      /* (#R60) FINE-GRAINED deterministic commands ("細かい指示や操作") — exact numbers, small nudges, selective
         clears, stat questions. Each is fully anchored so it can NEVER shadow a compound/ambiguous request. */
      let fm=low.match(/^(?:set )?zoom(?: to)?(?: level)?\s*(\d+(?:\.\d+)?)$/)||s.match(/^ズーム(?:レベル)?\s*(\d+(?:\.\d+)?)\s*(?:に(?:して)?)?$/);
      if(fm) return A({type:'zoom',to:+fm[1]});
      fm=low.match(/^(?:tilt|pitch)(?: to| by)?\s*(\d+)\s*(?:°|deg(?:rees)?)?$/)||s.match(/^(\d+)\s*度(?:に)?傾け(?:て|る)?$/);
      if(fm) return A({type:'pitch',deg:+fm[1]});
      if(/^(tilt( the map)?|傾けて|斜めに(して)?|neigen|наклонить|inclinar)$/i.test(low)) return A({type:'pitch',deg:60});
      if(/^(un-?tilt|top ?down|flat view|真上から|傾き(を)?(解除|リセット|ゼロに)|水平に(して)?)$/i.test(low)) return A({type:'pitch',deg:0});
      fm=low.match(/^rotate(?: by| to)?\s*(-?\d+)\s*(?:°|deg(?:rees)?)?$/)||s.match(/^(-?\d+)\s*度回転(?:して)?$/);
      if(fm) return A({type:'bearing',delta:+fm[1]});
      fm=low.match(/^(?:face|point|rotate to(?:ward)?)\s+(north|northeast|east|southeast|south|southwest|west|northwest)$/)||s.match(/^(北東|北西|南東|南西|北|南|東|西)(?:向き|を上)(?:に)?(?:して)?$/);
      if(fm) return A({type:'bearing',dir:fm[1]});
      if(/^(少し|ちょっと)(拡大|ズームイン)(して)?$|^zoom in a (little|bit)$/i.test(low)) return A({type:'zoom',delta:0.7});
      if(/^(少し|ちょっと)(縮小|ズームアウト)(して)?$|^zoom out a (little|bit)$/i.test(low)) return A({type:'zoom',delta:-0.7});
      if(/^(もっと|さらに)(拡大|ズームイン)(して)?$|^zoom in more$/i.test(low)) return A({type:'zoom',delta:1.5});
      if(/^(もっと|さらに)(縮小|ズームアウト)(して)?$|^zoom out more$/i.test(low)) return A({type:'zoom',delta:-1.5});
      fm=low.match(/^(?:pan|move|scroll|shift)\s+(a (?:little|bit)\s+)?(?:to (?:the )?)?(north|south|east|west|northeast|northwest|southeast|southwest|up|down|left|right)$/);
      if(fm) return A({type:'pan',dir:fm[2],fraction:fm[1]?0.18:0.45});
      fm=s.match(/^(少し|ちょっと)?(北東|北西|南東|南西|北|南|東|西|上|下|左|右)(?:へ|に)?(?:移動|ずらして|動かして|パン)(?:して)?$/);
      if(fm){ const JD={'上':'north','下':'south','左':'west','右':'east','北':'north','南':'south','東':'east','西':'west','北東':'northeast','北西':'northwest','南東':'southeast','南西':'southwest'}; return A({type:'pan',dir:JD[fm[2]],fraction:fm[1]?0.18:0.45}); }
      if(/^((turn|switch) off (all|every) (data )?layers?|(hide|remove|clear) (all|every) (data )?layers?|(all|every) layers? off|layers? (all )?off|(全|すべての|全ての)レイヤー(を)?(オフ|非表示|解除|消して)(に)?(して)?|レイヤー(を)?(全部|すべて)(オフ|消して|非表示)(に)?(して)?|alle ebenen aus(schalten)?|выключи(ть)? все слои|apagar todas las capas)$/i.test(low)) return A({type:'layersOff'});
      if(/^(fullscreen|full screen|go fullscreen|全画面(表示)?(に)?(して)?|フルスクリーン(に)?(して)?|vollbild|полный экран|pantalla completa)$/i.test(low)) return A({type:'fullscreen',on:true});
      if(/^(exit|leave) full ?screen$|^(全画面|フルスクリーン)(を)?(解除|終了|やめて)(して)?$/i.test(low)) return A({type:'fullscreen',on:false});
      if(/^(where am i\??|my location|current location|locate me|go to my location|現在地(へ|に)?(移動|飛んで)?(して)?|ここはどこ？?|mein standort|wo bin ich\??|где я\??|моё местоположение|mi ubicación|¿?dónde estoy\??)$/i.test(low)) return A({type:'locate'});
      if(/^(clear|remove|delete) (all )?(the )?pins?$|^ピン(を)?(全部|すべて)?(消して|削除|クリア)(して)?$/i.test(low)) return A({type:'clear',what:'pins'});
      if(/^(clear|remove|delete) (all )?(the )?(radius(es)?|circles?)$|^(半径|サークル|円)(を)?(全部|すべて)?(消して|削除|クリア)(して)?$/i.test(low)) return A({type:'clear',what:'radius'});
      if(/^(clear|remove) (the )?(highlights?|shading)$|^(ハイライト|色分け|濃淡)(を)?(消して|解除|クリア)(して)?$/i.test(low)) return A({type:'clear',what:'highlights'});
      if(/^(screenshot|take a screenshot|capture the map|スクショ((を)?(撮って|とって))?|スクリーンショット((を)?(撮って|とって))?)$/i.test(low)) return A({type:'screenshot'});
      /* (#R80) vision §17 — self-diagnosis on demand */
      if(/^(diagnose|self-?check|health ?check|system ?status|status|are you (ok|working)|診断(して)?|自己診断|システム(の)?(状態|状況|チェック)|ヘルスチェック|データは最新[?？]?|正常[?？]?)$/i.test(low)) return A({type:'diagnose'});
      if(/^(何か|なにか|なんか)?(問題|不具合|異常|エラー)(は|が)?(ある|あります)[?？]?$/.test(s)||/^(any )?(issues?|problems?|errors?)\??$/i.test(low)) return A({type:'diagnose'});
      /* (#R62) POI mapping — 「東京にある石油施設を表示して」/ "map the oil facilities in Texas". */
      if(/^(clear|remove) (the )?(facilit(y|ies)|pois?|markers?)$|^(施設|マーカー)(を)?(全部|すべて)?(消して|削除|クリア)(して)?$/i.test(low)) return A({type:'clear',what:'poi'});
      fm=s.match(/^(.+?)にある\s*(.+?)\s*(?:関連)?(?:施設)?を(?:地図に)?(?:表示|マッピング|マップ|出して|プロット)(?:して)?$/);
      if(fm&&fm[1].trim()&&fm[2].trim()) return A({type:'poi',place:fm[1].trim(),kind:fm[2].trim()});
      fm=low.match(/^(?:show|map|display|plot)\s+(?:the\s+)?(.+?)\s+(facilities|plants|sites|stations|bases|installations)\s+in\s+(.+)$/);
      if(fm) return A({type:'poi',kind:(fm[1]+' '+fm[2]).trim(),place:fm[3].trim()});
      /* (#R63) bottom ticker on/off */
      if(/^(show |turn on |enable )?(the )?(bottom )?ticker$|^ティッカー(を)?(表示|オン)?(に)?(して)?$/i.test(low)&&!/off|オフ|消/.test(low)) return A({type:'ticker',on:true});
      if(/^(hide |turn off |disable )(the )?(bottom )?ticker$|^ティッカー(を)?(オフ|非表示|消して)(に)?(して)?$/i.test(low)) return A({type:'ticker',on:false});
      /* (#R83) ballistic-missile simulation — deterministic for the clear "A → B (弾道)ミサイル/ICBM" phrasings */
      fm=low.match(/^(?:simulate |launch |fire |run )?(?:an? |the )?(?:lofted |depressed |minimum[-\s]?energy |min[-\s]?energy |marv )*(?:icbm|ballistic missile|ballistic|missile)\s+(?:strike |launch |flight )?from\s+(.+?)\s+to\s+(.+?)$/i)
        ||s.match(/^(?:ロフテッド軌道で|ディプレスト軌道で|低伸軌道で|機動再突入体で)?(.+?)(?:から|より)\s*(.+?)(?:へ|に|まで|への)\s*(?:の)?(?:弾道)?(?:ミサイル|ICBM|icbm)(?:攻撃|発射|の(?:飛翔|軌道))?(?:を)?(?:シミュ(?:レート|レーション)?|発射|撃(?:って|込|つ)|飛ば(?:して)?|表示)?(?:して)?$/i);
      if(fm&&(fm[1]||'').trim()&&(fm[2]||'').trim()){
        /* (#R85) also read the trajectory profile / MaRV off the phrasing */
        const _lo=/ロフテッド|lofted|高高度軌道|高い軌道/i.test(s)?'lofted':(/ディプレスト|depressed|低伸|低い軌道|フラット軌道/i.test(s)?'depressed':undefined);
        const _mv=(/marv|機動再突入|機動弾頭|maneuv/i.test(s))||undefined;
        const _from=fm[1].trim().replace(/^(?:lofted|depressed|min(?:imum)?[-\s]?energy|marv)\s+/i,'').trim();
        return A(Object.assign({type:'missile',from:_from,to:fm[2].trim()}, _lo?{loft:_lo}:{}, _mv?{marv:true}:{})); }
      /* (#R83) elevation / below-sea-level highlight (real DEM) — "カスピ海周辺の海抜0m以下地点をハイライト" */
      fm=s.match(/^(.+?)(?:周辺|付近)?の?(?:海抜|標高)\s*(-?\d+)\s*m?\s*(以下|未満|以上|超え?)?(?:の?(?:地点|エリア|地域|場所|ところ))?\s*を?\s*(?:ハイライト|強調表示|強調|表示|マッピング|マップ)(?:して)?[。]?$/i);
      if(fm) return A({type:'elevationBelow',place:(fm[1]||'').trim(),threshold:+fm[2],above:/以上|超/.test(fm[3]||'')});
      fm=low.match(/^highlight\s+(?:the\s+)?(?:land|areas?|points?|terrain|places?|regions?)?\s*(?:that (?:is|are)\s+)?(below|under|above|over)\s+(sea ?level|-?\d+\s*m(?:eters?)?)(?:\s+(?:in|around|near)\s+(.+?))?\.?$/i);
      if(fm) return A({type:'elevationBelow',place:(fm[3]||'').trim(),threshold:/sea/.test(fm[2])?0:(parseInt(fm[2],10)||0),above:/above|over/.test(fm[1])});
      /* (#R83) historical power/alliance map — curated eras (WWI 1916) run deterministically */
      fm=s.match(/^(.+?(?:世界大戦|大戦|冷戦)[^。]*?)の?(?:勢力図|勢力|同盟|陣営|地図|マップ)を?(?:マッピング|マップ|表示|作成|描(?:いて|画)|作って)(?:して)?[。]?$/i)
        ||low.match(/^(?:map|show|draw|display)\s+(?:the\s+)?(.+?(?:world war|wwi|wwii|first world war|cold war)[^.]*?)(?:\s+(?:power|alliance|faction)s?\s*map)?\.?$/i);
      if(fm&&(fm[1]||'').trim()&&histMatch(fm[1])) return A({type:'historicalMap',era:(fm[1]||'').trim()});
      /* (#R85) workspace (floating-window) mode toggle via Atlas ("ワークスペースモードの切り替えがAtlasでできない").
         Check OFF before ON so "ワークスペースをオフ" isn't swallowed by the ON pattern. */
      if(/(?:ワークスペース|ウィンドウ)(?:モード)?(?:を|から)?(?:オフ|終了|解除|抜け(?:て|る)?|やめ(?:て|る)?|閉じ(?:て|る)?)|(?:通常|標準|ノーマル)(?:モード|表示|レイアウト)?に?(?:戻して|戻る|切り替え)/i.test(s)||/^(?:exit|leave|turn off|disable|close)\s+(?:the\s+)?(?:window\s+)?workspace(?:\s+mode)?$|^(?:back to |return to )?normal (?:mode|layout|view)$/i.test(low)) return A({type:'workspace',on:false});
      if(/^(?:ワークスペース|ウィンドウ(?:ワークスペース)?)(?:モード)?(?:に|を|へ)?(?:切り替え(?:て)?|きりかえ(?:て)?|移行(?:して)?|オン(?:に)?|有効(?:に)?|入(?:って|る)|開始|して|する)?(?:して)?[。]?$/i.test(s)||/^(?:enter|switch to|turn on|enable|open|go to)\s+(?:the\s+)?(?:window\s+)?workspace(?:\s+mode)?$|^workspace(?:\s+mode)?$/i.test(low)) return A({type:'workspace',on:true});
      /* (#R84) open the empty directions panel — bare "経路案内" / "directions" / "route planner" */
      if(/^(?:経路(?:案内|検索)?|ルート(?:案内|検索)?|道案内|ナビ)(?:を)?(?:開いて|表示|出して|開く|して)?[。]?$/i.test(s)||/^(?:directions|route planner|open directions|routing)$/i.test(low)) return A({type:'directions'});
      /* (#R83) road directions (Google-Maps-like) — "東京から大阪への経路", "directions from A to B" */
      { const _MMAP={'車':'driving','自動車':'driving','ドライブ':'driving','徒歩':'walking','歩き':'walking','自転車':'cycling','チャリ':'cycling','電車':'transit','列車':'transit','鉄道':'transit','地下鉄':'transit','バス':'transit','公共交通機関':'transit','公共交通':'transit'};
        /* the transport mode may come BEFORE the origin in Japanese ("電車で新宿から横浜へ") — detect it anywhere and strip a leading mode phrase */
        let _dm=null; const _mm=s.match(/(?:^|[\s、])(電車|列車|鉄道|地下鉄|バス|公共交通機関|公共交通|車|自動車|徒歩|歩き|自転車|チャリ|ドライブ)(?:で|を使って|を利用して)/); if(_mm) _dm=_MMAP[_mm[1]];
        const sd=s.replace(/^(?:電車|列車|鉄道|地下鉄|バス|公共交通機関|公共交通|車|自動車|徒歩|歩き|自転車|チャリ|ドライブ)(?:で|を使って|を利用して)\s*/,'');
        fm=sd.match(/^(.+?)(?:から|より)\s*(.+?)(?:へ|に|まで|への)\s*(?:の)?(?:(車|徒歩|自転車|歩き|ドライブ|チャリ|電車|列車|鉄道|地下鉄|バス|公共交通機関|公共交通)(?:で|を使って|を利用して)(?:の)?)?\s*(?:経路|ルート|道順|行き方|道のり|道案内|ナビ|乗換|乗り換え|行き方)(?:を)?(?:教えて|表示|案内|出して|見せて|検索|調べて)?(?:して)?[。？?]?$/i);
        if(fm&&(fm[1]||'').trim()&&(fm[2]||'').trim()){ const mm=_MMAP[fm[3]||'']||_dm||'driving'; return A({type:'directions',from:fm[1].trim(),to:fm[2].trim(),mode:mm}); } }
      fm=low.match(/^(?:get |give me |show me )?(?:the )?(driving|walking|cycling|car|foot|bike|drive|walk|cycle|transit|train|rail|public ?transport|public ?transit|bus|subway|metro|tram)?\s*(?:road |transit )?(?:directions?|route)\s+from\s+(.+?)\s+to\s+(.+?)\.?$/i);
      if(fm&&(fm[2]||'').trim()&&(fm[3]||'').trim()){ const mm={drive:'driving',driving:'driving',car:'driving',walk:'walking',walking:'walking',foot:'walking',cycle:'cycling',cycling:'cycling',bike:'cycling',transit:'transit',train:'transit',rail:'transit','public transport':'transit','public transit':'transit',publictransport:'transit',publictransit:'transit',bus:'transit',subway:'transit',metro:'transit',tram:'transit'}[(fm[1]||'').toLowerCase()]||'driving'; return A({type:'directions',from:fm[2].trim(),to:fm[3].trim(),mode:mm}); }
      fm=low.match(/^how (?:do i|to|can i)\s+(drive|walk|cycle|get|take (?:the )?train|take transit)\s+from\s+(.+?)\s+to\s+(.+?)\??$/i);
      if(fm&&(fm[2]||'').trim()&&(fm[3]||'').trim()){ const mm={drive:'driving',walk:'walking',cycle:'cycling',get:'transit','take the train':'transit','take train':'transit','take transit':'transit'}[(fm[1]||'').toLowerCase()]||'transit'; return A({type:'directions',from:fm[2].trim(),to:fm[3].trim(),mode:mm}); }
      /* (#R84) street-view COVERAGE mode (blue clickable roads) — bare "street view" / "ストリートビュー(モード)" */
      if(/^(?:ストリートビュー(?:モード)?|ストビュー)(?:を)?(?:表示|オン|開始|有効に?|使いたい|使う|見せて|にして)?(?:して)?[。]?$/i.test(s)&&!/[のを](.+)(ストリートビュー|ストビュー)/.test('X'+s)) return A({type:'streetview',mode:'coverage'});
      if(/^(?:show |open |enable |turn on )?(?:the )?street ?view(?: mode| layer| coverage)?$/i.test(low)) return A({type:'streetview',mode:'coverage'});
      if(/^(?:ストリートビュー|ストビュー)(?:を)?(?:オフ|非表示|終了|やめて|閉じて)(?:に)?(?:して)?[。]?$/i.test(s)||/^(?:turn off |disable |exit |close )street ?view(?: mode)?$/i.test(low)) return A({type:'streetview',on:false});
      /* (#R83) street view — "渋谷のストリートビュー", "street view of the Eiffel Tower" */
      fm=s.match(/^(.+?)(?:の|周辺の)(?:ストリートビュー|ストビュー)(?:を)?(?:見(?:せて|る)|表示|開いて|出して|で見)?(?:して)?[。]?$/i)
        ||low.match(/^(?:show |open )?(?:the )?street ?view\s+(?:of|for|at|near|around)\s+(.+?)\.?$/i);
      if(fm&&(fm[1]||'').trim()) return A({type:'streetview',place:(fm[1]||'').trim()});
      /* (#R83) radiation dispersion — "福島第一原発からの放射性物質の拡散をシミュレートして" */
      fm=s.match(/^(.+?)(?:からの|から|周辺の|付近の|の)?(?:放射(?:性物質|能|線)|フォールアウト|死の灰)(?:の)?(?:拡散|飛散|降下|プルーム)(?:を)?(?:シミュ(?:レート|レーション)?|表示|マッピング|マップ|予測|見せて)?(?:して)?[。]?$/i);
      if(fm&&(fm[1]||'').trim()) return A({type:'radiation',place:(fm[1]||'').trim()});
      fm=low.match(/^(?:simulate |show |model |run )?(?:a |the )?(?:radiation|radioactive|fallout|nuclear)\s+(?:material\s+)?(?:dispersion|plume|dispersal|fallout|release|spread|cloud)\s+(?:from|at|near|around|over)\s+(.+?)\.?$/i);
      if(fm&&(fm[1]||'').trim()) return A({type:'radiation',place:(fm[1]||'').trim()});
      /* (#R86) isochrone / 到達圏 — "○○から車で30分の範囲", "30 minute walk from X", "reachable area from X" */ /* ⚠⚠ (#R278) 「現在地から徒歩一時間で行ける範囲を表示して」 matched NONE of these, for two independent reasons, and because localPlan runs BEFORE the AI (a confident local plan needs neither an account nor a credit) that silence was the difference between an answer and a login wall: (1) 一 is a KANJI numeral and the digit class was \d+; (2) the sentence says 「で行ける範囲」 while the tail only accepted 以内 / 圏内 / 圏 / の範囲 — the verb form was not in it at all. Both are fixed below, along with the reversed word order (「1時間で歩いて行ける範囲」); the mode may now sit on either side of the duration but is still REQUIRED (one of fm[2]/fm[5]), so a bare 「30分の範囲」 keeps falling through to the planner instead of being guessed at here. The 8 lines this note would have cost live on 2 because js/atlas-console.js is at its #R199 ceiling. */
      { const _IM={'車':'auto','自動車':'auto','ドライブ':'auto','徒歩':'pedestrian','歩き':'pedestrian','歩いて':'pedestrian','自転車':'bicycle','チャリ':'bicycle','電車':'transit','鉄道':'transit','地下鉄':'transit','列車':'transit','メトロ':'transit'}; const _N=x=>{ x=String(x||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)); if(/^\d+$/.test(x)) return +x; const K='〇一二三四五六七八九'; let m=x.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/); if(m) return (m[1]?K.indexOf(m[1]):1)*10+(m[2]?K.indexOf(m[2]):0); m=x.match(/^([一二三四五六七八九]?)百([一二三四五六七八九]?)$/); if(m) return (m[1]?K.indexOf(m[1]):1)*100+(m[2]?K.indexOf(m[2]):0); return /^[一二三四五六七八九]$/.test(x)?K.indexOf(x):NaN; };
        fm=s.match(/^(.+?)(?:から|より|の)?\s*(?:(車|自動車|ドライブ|徒歩|歩き|歩いて|自転車|チャリ|電車|鉄道|地下鉄|列車|メトロ)(?:で|なら|だと)?)?\s*([0-9０-９]+|[一二三四五六七八九十百]+)\s*(分|時間)\s*(?:以内|圏内|圏)?\s*(?:で|に)?\s*(?:(車|自動車|ドライブ|徒歩|歩き|歩いて|自転車|チャリ|電車|鉄道|地下鉄|列車|メトロ)(?:で|に)?)?\s*(?:(?:行ける|いける|到達(?:できる|可能)|移動できる|歩ける|走れる)?(?:の)?(?:範囲|到達圏|エリア|届く範囲|ゾーン)|以内|圏内|圏)(?:を)?(?:表示|見せて|出して|マップ|マッピング|教えて|描いて|描画)?(?:して)?[。？?！!]?$/i);
        if(fm&&(fm[1]||'').trim()&&(fm[2]||fm[5])){ let mnt=_N(fm[3]); if(fm[4]==='時間') mnt*=60; if(isFinite(mnt)&&mnt>0&&mnt<=120) return A({type:'isochrone',place:fm[1].trim(),mode:_IM[fm[2]||fm[5]]||'auto',minutes:mnt}); }
        fm=s.match(/^(.+?)(?:の|から|周辺の)(?:到達圏|到達範囲|アイソクロン|届く範囲)(?:を)?(?:表示|見せて|出して|教えて)?(?:して)?[。？?]?$/i);
        if(fm&&(fm[1]||'').trim()) return A({type:'isochrone',place:fm[1].trim()});
        fm=low.match(/^(?:show |map |draw )?(?:the |a )?(\d+)\s*[-\s]?(min|minute|minutes|hour|hours|hr|h)\s+(drive|driving|car|walk|walking|foot|bike|bicycle|cycle|cycling|train|rail|transit|subway|metro|tram)\s+(?:radius |isochrone |area |zone |catchment )?(?:from|of|around|at)\s+(.+?)\.?$/i);
        if(fm){ const mm={drive:'auto',driving:'auto',car:'auto',walk:'pedestrian',walking:'pedestrian',foot:'pedestrian',bike:'bicycle',bicycle:'bicycle',cycle:'bicycle',cycling:'bicycle',train:'transit',rail:'transit',transit:'transit',subway:'transit',metro:'transit',tram:'transit'}[fm[3]]||'auto'; let mnt=+fm[1]; if(/^h/.test(fm[2])) mnt*=60; return A({type:'isochrone',place:fm[4].trim(),mode:mm,minutes:mnt}); }
        fm=low.match(/^(?:the )?(?:isochrone|reachable area|reachability|catchment(?: area)?)\s+(?:for|from|of|around|at)\s+(.+?)\.?$/i);
        if(fm&&(fm[1]||'').trim()) return A({type:'isochrone',place:fm[1].trim()}); }
      /* (#R88) universal object list — "オブジェクト一覧", "manage objects", "show all my objects/pins/drawings" */
      if(/^(?:(?:汎用)?オブジェクト(?:の)?(?:一覧|リスト|管理|マネージャ)|オブジェクトを(?:管理|一覧|表示)|ピンや?(?:図形|描画)?(?:の)?(?:一覧|管理)|地図上の(?:オブジェクト|もの)を(?:管理|一覧)|(?:manage|list|show|open)\s+(?:all\s+)?(?:my\s+)?(?:map\s+)?objects?|object\s+(?:list|manager|panel)|manage\s+(?:pins|drawings|shapes|everything on the map))[。.!?！？]?$/i.test(s)) return A({type:'objects'});
      /* ⚠ (#R296) the local Earth Replay matcher stood here — 「世界を巻き戻して」 falls through to `timeTravel`. */
      /* (#R86c) multi-stop route optimisation (TSP) — "A・B・Cを最短で回る", "optimize route through A, B, C" */
      { fm=low.match(/^(?:optimi[sz]e|plan|find|best|shortest)\s+(?:the\s+)?(?:route|order|tour|trip|itinerary|path)\s+(?:to\s+)?(?:visit(?:ing)?|through|for|of|via|around|between)\s+(.+?)\.?$/i)
          ||low.match(/^(?:best|shortest|optimal|most efficient)\s+(?:order|way|route)\s+to\s+visit\s+(.+?)\.?$/i);
        if(fm&&(fm[1]||'').trim()){ const parts=fm[1].split(/\s*,\s*|\s+and\s+|\s*&\s*/).map(x=>x.trim()).filter(Boolean); if(parts.length>=2) return A({type:'optimizeRoute',places:parts}); }
        fm=s.match(/^(.+?)(?:を)?(?:最短(?:で|順|経路で)?|効率(?:よく|的に)|一番(?:早く|短く))(?:回る|巡る|訪(?:れる|問)|周る)(?:順(?:番|路)?|ルート|経路)?(?:を)?(?:教えて|出して|表示|計算|並べ替え|して)?[。？?]?$/i);
        if(fm&&(fm[1]||'').trim()){ const parts=fm[1].split(/\s*[,、，･・]\s*|\s+と\s+/).map(x=>x.trim()).filter(Boolean); if(parts.length>=2) return A({type:'optimizeRoute',places:parts}); } }
      /* (#R83) flight simulator */
      if(/^(?:(?:フライト|飛行)シミュ(?:レータ[ー]?|レーション)?|フライトシム)(?:を)?(?:起動|開始|始めて|開いて|やって|使いたい|プレイ|して)?[。]?$/i.test(s)) return A({type:'flightSim'});
      fm=s.match(/^(.+?)(?:の上空|上空|周辺)(?:を)?(?:飛行機で)?(?:飛(?:びたい|んで|ぶ)|操縦(?:したい|して))(?:みたい)?[。]?$/);
      if(fm&&(fm[1]||'').trim()) return A({type:'flightSim',place:(fm[1]||'').trim()});
      if(/^(?:start (?:the |a )?)?flight ?sim(?:ulator)?$/i.test(low)) return A({type:'flightSim'});
      fm=low.match(/^(?:let me |i want to |i'?d like to )fly(?: a plane| a jet| an aircraft)?(?:\s+over\s+(.+?))?\.?$/i)||low.match(/^fly (?:a |an )?(?:plane|jet|aircraft)(?:\s+over\s+(.+?))?\.?$/i);
      if(fm) return A(Object.assign({type:'flightSim'},(fm[1]&&fm[1].trim())?{place:fm[1].trim()}:{}));
      /* (#R62) country comparison — "compare Japan and Korea" / 「日本と韓国を比較して」 */
      fm=low.match(/^compare\s+(.+)$/)||s.match(/^(.+?)を比較(?:して)?$/);
      if(fm){ const parts=(fm[1]||'').split(/,|、| and | und | y | и |と| vs\.? |対/i).map(x=>x.trim()).filter(Boolean);
        if(parts.length>=2&&parts.every(p=>resolveCountrySync(p))) return A({type:'compareStats',countries:parts}); }
      fm=low.match(/^(?:set |make )?(.+?)(?: layer)?(?: opacity)?(?: to)?\s+(\d{1,3})\s*%$/)||s.match(/^(.+?)(?:レイヤー)?(?:の(?:透明度|不透明度))?\s*を?\s*(\d{1,3})\s*(?:%|％|パーセント)\s*に(?:して)?$/);
      if(fm&&resolveLayer((fm[1]||'').trim())) return A({type:'opacity',name:fm[1].trim(),value:+fm[2]});
      fm=low.match(/^(?:make |set )?(.+?)(?: layer)? (?:more transparent|fainter|lighter)$/)||s.match(/^(.+?)(?:レイヤー)?\s*を?\s*(?:もっと|少し)?(?:薄く|透明に)(?:して)?$/);
      if(fm&&resolveLayer((fm[1]||'').trim())) return A({type:'opacity',name:fm[1].trim(),delta:-0.2});
      fm=low.match(/^(?:make |set )?(.+?)(?: layer)? (?:more opaque|stronger|darker|less transparent)$/)||s.match(/^(.+?)(?:レイヤー)?\s*を?\s*(?:もっと|少し)?(?:濃く|不透明に|はっきり)(?:して)?$/);
      if(fm&&resolveLayer((fm[1]||'').trim())) return A({type:'opacity',name:fm[1].trim(),delta:0.2});
      /* single-country stat question → the REAL number from countryStats (no AI needed).
         (#R75) VMET moved to module scope — shared with _metSpec (explore/scoreMap). */
      fm=low.match(/^(?:what(?:'s| is)(?: the)? )?([a-z0-9 ]+?)\s+of\s+(.+?)\s*\??$/);
      if(fm&&VMET[fm[1].trim()]&&resolveCountrySync(fm[2].trim())) return A({type:'value',metric:VMET[fm[1].trim()],country:fm[2].trim()});
      fm=s.match(/^(.+?)の(人口密度|人口|面積|一人当たりGDP|1人当たりGDP|GDP|HDI|出生率|合計特殊出生率|民主主義指数|国防費|軍事費|首都|通貨|言語|公用語|国旗)(?:は|を教えて)?[?？]?$/i);
      if(fm&&resolveCountrySync(fm[1].trim())){ const vk=VMET[fm[2]]||VMET[fm[2].toLowerCase()]; if(vk) return A({type:'value',metric:vk,country:fm[1].trim()}); }
      /* (#R73) current-officeholder questions are NEVER answered from model memory ("まだ現在の首相名等を
         間違えている") — anchored straight to analyze, whose prompt forces a live web search. */
      fm=s.match(/^(.{1,40}?)の(?:現在の|今の|現)?(首相|大統領|総理大臣|総理|内閣総理大臣|国家元首|指導者|政権|内閣|首脳)(?:は誰(?:ですか)?|は|って誰|を教えて)?[?？。]?$/)
        ||low.match(/^(?:who(?: is|'s)? )?(?:the )?(?:current |present )?(?:prime minister|president|chancellor|premier|leader|head of state|head of government)(?: of | in )(.{1,40}?)\??$/)
        ||low.match(/^(.{1,40}?)(?:'s| s)? (?:current )?(?:prime minister|president|chancellor|premier|leader)\??$/);
      if(fm){ const cn=(fm[1]||'').trim(); return A({type:'analyze',question:s,use:['web'],countries:cn?[cn]:undefined}); }
      /* (#R74) looser net for the same class of question ("日本の首相って今誰だっけ？" etc. escaped the anchored
         forms above and reached the AI, which sometimes answered from stale memory anyway): ANY short message
         combining an office word with a who-word routes deterministically to analyze + live web. */
      if(s.length<=80&&/(首相|大統領|総理|国家元首|首脳|党首|総裁|大臣|知事|prime minister|president|chancellor|premier|head of state|head of government|kanzler|президент|премьер|primer ministro|presidente)/i.test(s)
        &&/(誰|だれ|who|wer|кто|quién|quien|現在|今|current|名前|なまえ|name)/i.test(s)) return A({type:'analyze',question:s,use:['web']});
      /* (#R78) workspace mode — deterministic on/off. */
      fm=s.match(/^(?:ウィンドウ)?(?:・)?ワークスペース(?:モード)?を?(オン|有効|開始)(?:に)?(?:して)?$/)||low.match(/^(?:turn on |enable |start )?(?:window )?workspace(?: mode)?(?: on)?$/);
      if(fm) return A({type:'module',name:'IntMapWorkspace',method:'open'});
      fm=s.match(/^(?:ウィンドウ)?(?:・)?ワークスペース(?:モード)?を?(オフ|無効|終了|解除)(?:に)?(?:して)?$/)||low.match(/^(?:turn off |disable |exit |stop )(?:window )?workspace(?: mode)?$/);
      if(fm) return A({type:'module',name:'IntMapWorkspace',method:'close'});
      /* (#R76) vision §6 anchors — event-grouped news, deterministic. */
      fm=s.match(/^(?:最近|直近|今日|世界)の?(?:出来事|イベント)を?(?:まとめて|整理して|一覧にして|教えて|表示して)[。]?$/)
        ||low.match(/^(?:summarize|group|cluster|show) (?:the )?(?:recent |latest |today'?s )?(?:news )?events?$/)
        ||low.match(/^what events are happening\??$/);
      if(fm) return A({type:'events'});
      fm=s.match(/^(.{1,30}?)(?:周辺|付近)?の(?:出来事|イベント)を?(?:まとめて|整理して|教えて|表示して)[。]?$/)
        ||low.match(/^(?:summarize|group|show) (?:the )?events? (?:in|around|near) (.{1,40}?)$/);
      if(fm&&(fm[1]||'').trim()) return A({type:'events',place:(fm[1]||'').trim()});
      /* (#R75) vision §10/§11 anchors — single-intent phrasings run deterministically, no AI round-trip. */
      fm=s.match(/^(.{1,25}?)(?:と|に)(?:相関|関連)する指標を?(?:探して|調べて|教えて)?[。？?]?$/)
        ||low.match(/^(?:what |which )?(?:indicators?|metrics?) correlate[sd]? with (.{1,30}?)\??$/)
        ||low.match(/^explore (?:correlations? (?:of|with) )?(.{1,30}?)\??$/);
      if(fm&&_metSpec((fm[1]||'').trim())) return A({type:'explore',metric:(fm[1]||'').trim()});
      fm=s.match(/^(?:この|直近の|最近の)?地震の(?:影響|周辺)(?:範囲)?を?(?:分析|調査|調べて|表示|見せて)(?:して)?[。]?$/)
        ||low.match(/^impact (?:analysis )?(?:of |around )?(?:the )?(?:latest |recent )?(?:earthquake|quake)$/);
      if(fm) return A({type:'impact',event:'quake'});
      fm=s.match(/^(.{1,30}?)の?周辺影響(?:分析)?を?(?:して|調べて|表示して|分析して)$/)
        ||low.match(/^impact analysis (?:around|of|near) (.{1,40}?)$/);
      if(fm&&(fm[1]||'').trim()) return A({type:'impact',place:(fm[1]||'').trim()});
      /* (#R157) HIGHLIGHT TARGETS ARE NO LONGER PARSED HERE. A highlight target is a MEANING — a country set
         ("ゲルマン諸国"/"英語圏"/"主要産油国"), an admin/natural region, a river or a basin — and the reported root
         cause was localPlan deciding that meaning (via regionGroup / resolveHlTarget) BEFORE the model ever saw it,
         so "ゲルマン諸国" failed as one unfound place. Every "…をハイライト" now goes to the planner, which interprets the
         concept and returns explicit ISO3 targets (or a concrete place "query") for the code to validate & draw.
         Only the two NON-semantic shortcuts stay — recolouring the CURRENT highlights, and clearing them — because
         neither carries a target whose meaning must be interpreted. */
      fm=low.match(/^highlight\s+in\s+([a-z]+(?: blue)?|#[0-9a-f]{3}|#[0-9a-f]{6})$/)||s.match(/^(.{1,9}?)で(?:ハイライト|強調表示|強調)(?:して)?$/)||low.match(/^(?:make|change|turn) (?:the )?highlights? (?:to )?([a-z]+)$/);
      if(fm&&parseColor((fm[1]||'').trim())) return A({type:'highlight',color:(fm[1]||'').trim()});
      if(/^highlight\s+(?:off|clear|none)$|^(?:ハイライト|強調表示|色分け|濃淡)(?:を)?(?:オフ|消して|解除|クリア|非表示)(?:に)?(?:して)?$|^hervorhebung(?:en)?\s+(?:aus|entfernen|löschen)$|^(?:убрать|снять|очистить)\s+выделени\w*$|^(?:quitar|borrar)\s+(?:el\s+)?resaltado$/i.test(low)) return A({type:'highlight',on:false});
      /* (#R104) DIRECTIONS / route — a VERY common command that had NO deterministic plan, so it fell to the AI and
         did NOTHING when the user wasn't logged in ("東京から横浜まで鉄道で経路を出しても地図に出ない"). Parse from/to +
         travel mode locally so routing ALWAYS works, account or not. Placed before navigation so "AからBまで…経路"
         can't be mis-caught as a flyTo. */
      let rm=s.match(/^(.{1,40}?)から(.{1,40}?)(?:まで|への?|に)(?:の)?[^。]{0,16}?(?:経路|ルート|行き方|道順|乗り?換え?|ナビ)/)
        ||s.match(/^(?:電車|鉄道|列車|地下鉄|新幹線|バス|車|自動車|徒歩|自転車|公共交通(?:機関)?)で\s*(.{1,40}?)から(.{1,40}?)(?:まで|へ|に)?[。！？!?]*$/)
        ||low.match(/^(?:directions?|routes?|navigate|how (?:do i|to) (?:get|travel))\s+from\s+(.{1,40}?)\s+to\s+(.{1,40}?)(?:\s+by\s+[\w ]+)?[.?!]*$/);
      if(rm&&(rm[1]||'').trim()&&(rm[2]||'').trim()){
        const _tr=/鉄道|電車|列車|地下鉄|新幹線|メトロ|トラム|路面電車|バス|公共交通|フェリー|船|train|rail|subway|metro|tram|light[- ]?rail|bus|transit|public transport|ferry/i.test(s);
        const _wk=/徒歩|歩いて|歩き|on foot|walk/i.test(s);
        const _cy=/自転車|チャリ|サイクリング|cycl|bike|bicycle/i.test(s);
        const _mode=_tr?'transit':_wk?'walking':_cy?'cycling':'driving';
        return A({type:'directions',from:(rm[1]||'').trim(),to:(rm[2]||'').trim(),mode:_mode});
      }
      /* (#R105/#R115) COMPARE COUNTRIES — deterministic so "Compare the USA, China and India — GDP, defense and
         population" (and "日本とドイツを比較して") open the comparison with NO AI round-trip. The "— metrics" tail is
         now PARSED and honoured ("don't choose the specified indicators" bug): names resolve via _cmpMetricKeys
         onto the panel's real indicator keys and are passed as metrics. An unresolvable tail keeps the defaults. */
      let cm=low.match(/^compare\s+(.+?)(?:\s*[—–:]\s*(.+)|\s+-\s+(.+)|\s+by\s+(.+))?$/)||s.match(/^(.+?)を\s*(?:比較|くらべて|比べて)(?:して)?[。！？!?]*\s*(?:[—–:：]\s*(.+))?$/);
      if(cm){ const parts=(cm[1]||'').replace(/^the\s+/i,'').split(/\s*,\s*|、|;|\s+and\s+|\s+und\s+|\s+y\s+|\s+и\s+|と|\s+vs\.?\s+|\s*対\s*/i).map(x=>x.replace(/^the\s+/i,'').trim()).filter(Boolean);
        if(parts.length>=2&&parts.length<=10){ const act={type:'compareStats',countries:parts};
          const tail=cm[2]||cm[3]||cm[4]||''; if(tail){ const mr=_cmpMetricKeys(tail); if(mr.keys.length) act.metrics=mr.keys; }
          return A(act); } }
      /* (#R105) RANKING QUESTIONS — "Which countries have the highest life expectancy?" / "…spend the most on defense
         relative to GDP?" → the real ranked list, deterministically (no AI needed). */
      let qm=low.match(/^which countr(?:y|ies)\s+(?:have|has)\s+the\s+(highest|greatest|largest|biggest|most|lowest|smallest|least)\s+(.+?)\s*\??$/)
        ||low.match(/^which countr(?:y|ies)\s+spends?\s+the\s+(most|least)\s+on\s+(.+?)\s*\??$/);
      if(qm){ const dir=/lowest|smallest|least/i.test(qm[1])?'bottom':'top'; let mtxt=(qm[2]||'').trim().replace(/\?+$/,''); let mk=null;
        if(/defen[cs]e|military|軍事|国防/i.test(mtxt)&&/relative to gdp|% ?gdp|share of gdp|per gdp|to gdp/i.test(mtxt)) mk='milSpendGDP';
        else { const t2=mtxt.replace(/\s+relative to gdp$/i,'').replace(/^spending on\s+/i,'').replace(/defen[cs]e(?:\s+spending)?/i,'military spending'); const sp=_metSpec(t2); mk=sp?sp.key:null; }
        if(mk) return A({type:'rank',metric:mk,order:dir,n:10}); }
      /* (#R105) IntMap HELP — Atlas doubles as the built-in guide. A general "how do I use this / what can you do /
         使い方" gets a concise overview with NO AI round-trip; SPECIFIC how-to questions fall through to the AI, which
         is told (in SYS) to answer them as IntMap's help. */
      if(/^\s*(help|ヘルプ|使い方|つかいかた|使いかた|hilfe|ayuda|помощь|man)\s*[?？。]?\s*$/i.test(s)
        ||/^(what can (you|atlas|intmap|this app) do|how (do i|to) use (this|intmap|atlas)|できること|何ができ|なにができ|どうやって使)/i.test(s.trim())
        ||/(intmap|atlas|アトラス)\s*(の|は|って)?\s*(使い方|使いかた|できること|機能|ヘルプ)/i.test(s)){
        return A({type:'answer',text:L(
          'IntMap is an interactive world atlas — and I (Atlas) can operate all of it in plain language. You can: turn on 100+ DATA LAYERS (climate, population, economy, live weather) from the Layers panel; read LIVE NEWS pinned where events happen; use CHRONOS (bottom-right, formerly the time machine) to travel 1900→now; open COUNTRIES to sort & compare country data; and switch to WORKSPACE mode for movable windows. Just ask me things like: "fly to Kenya", "show the population layer", "compare Japan and Germany", "highlight the top 10 by GDP per capita", "directions from Tokyo to Osaka by train", "which countries have the highest life expectancy?", or "brief me on the South China Sea". Ask "how do I …" for any specific feature.',
          'IntMapはインタラクティブな世界地図で、私（Atlas）が自然言語ですべてを操作できます。できること: レイヤーパネルから100以上のデータレイヤー（気候・人口・経済・ライブ気象）を表示／ニュースを発生地にピン表示／右下のChronos（旧タイムマシン）で1900年〜現在を移動／Countriesで国データを並べ替え・比較／ワークスペースモードで可動ウィンドウ化。私にこう頼めます:「ケニアに飛んで」「人口レイヤーを表示」「日本とドイツを比較して」「一人当たりGDP上位10ヵ国をハイライト」「東京から大阪まで電車で経路」「平均寿命が高い国は？」「南シナ海のブリーフ」。個別の機能は「〜の使い方」と聞いてください。',
          'IntMap ist ein interaktiver Weltatlas — und ich (Atlas) bediene alles per Sprache. Über 100 Datenebenen, Live-News, Chronos (1900→heute), Länder-Vergleich, Workspace-Modus. Frag z. B.: „flieg nach Kenia", „vergleiche Japan und Deutschland", „Route Tokio→Osaka mit dem Zug". Frag „wie benutze ich …" für Details.',
          'IntMap — интерактивный атлас мира, и я (Atlas) управляю всем на обычном языке. 100+ слоёв данных, живые новости, Chronos (1900→сейчас), сравнение стран, режим рабочих окон. Спросите: «лети в Кению», «сравни Японию и Германию», «маршрут Токио→Осака на поезде». Спросите «как использовать …» для деталей.',
          'IntMap es un atlas mundial interactivo — y yo (Atlas) lo manejo en lenguaje natural. Más de 100 capas de datos, noticias en vivo, Chronos (1900→ahora), comparación de países, modo espacio de ventanas. Pídeme: "vuela a Kenia", "compara Japón y Alemania", "ruta Tokio→Osaka en tren". Pregunta "cómo uso …" para más.')});
      }
      /* navigation (explicit motion verb + place) — rescue-grade. */
      let mm=s.match(/^(?:fly|go|navigate|take me|jump|pan|move|center|centre)\s+(?:to|me to|over to|on)\s+(.+)$/i);
      if(!mm) mm=s.match(/^(.+?)\s*(?:へ|に)\s*(?:移動|飛(?:んで|ぶ)|行って|ジャンプ|ズーム)(?:して)?$/);
      if(mm){ const place=(mm[1]||'').trim().replace(/[。.!?]+$/,''); if(place&&place.length<=64) return {actions:[{type:'flyTo',place}],confident:false}; }
      /* layer toggle (explicit on/off verb + a layer that actually RESOLVES) — rescue-grade. Only fires for a real
         layer; non-layer "show me X" / compound text falls through to the AI rather than guessing. */
      let on=true, lm=low.match(/^(?:show|display|turn on|enable|add|activate|put on)\s+(?:the\s+)?(.+?)(?:\s+layer)?$/i);
      if(!lm){ const off=low.match(/^(?:hide|turn off|disable|remove|take off)\s+(?:the\s+)?(.+?)(?:\s+layer)?$/i); if(off){ lm=off; on=false; } }
      if(lm){ const nm=(lm[1]||'').trim(); if(nm&&resolveLayer(nm)) return {actions:[{type:'layer',name:nm,on}],confident:false}; }
      let jm=s.match(/^(.+?)(?:レイヤー)?\s*を?\s*(?:表示|オン|つけて|有効)(?:に)?(?:して)?$/); if(jm&&resolveLayer((jm[1]||'').trim())) return {actions:[{type:'layer',name:(jm[1]||'').trim(),on:true}],confident:false};
      jm=s.match(/^(.+?)(?:レイヤー)?\s*を?\s*(?:非表示|オフ|消して|無効)(?:に)?(?:して)?$/); if(jm&&resolveLayer((jm[1]||'').trim())) return {actions:[{type:'layer',name:(jm[1]||'').trim(),on:false}],confident:false};
      return null; }
    /* (#R156) ================= DEDICATED VISION PIPELINE =================
       The work order: "通常のAtlasプランナーに、画像読解・計算・JSON計画・地名抽出を一度に処理させる現在の構造を改めてください".
       An attached image no longer goes through the giant map-oriented planner (whose MAPPING MANDATE pushed every image
       toward pins). It goes through this dedicated pipeline that runs ONE processing system: CLASSIFY → TRANSCRIBE (with
       uncertainty flags) → SOLVE/ANALYZE → DETERMINISTICALLY VERIFY (exact-rational recompute of the model's checks) →
       RENDER (unified Markdown+KaTeX) → MAP ONLY IF geographic. A failed self-check triggers ONE image re-examination
       round. The same content class + checks metadata are shared by rendering and mapping — not three separate patches. */
    function _visNorm(d){ if(!d||typeof d!=='object') return {contentClass:'',answer:String(d==null?'':d),checks:[],places:[],uncertain:[],focusPlace:''};
      if(Array.isArray(d)) d=d[0]||{};
      return { contentClass:d.contentClass||d.class||d.category||'', transcription:String(d.transcription||''), uncertain:Array.isArray(d.uncertain)?d.uncertain:[], answer:String(d.answer||d.text||d.say||''), checks:Array.isArray(d.checks)?d.checks:[], places:Array.isArray(d.places)?d.places:[], focusPlace:String(d.focusPlace||d.focus||'') }; }
    function _visionSYS(){ const lang=_langLine();
      return personaPrompt('reading images here as the rigorous multimodal reader of IntMap')/* (#R285) was "Atlas Vision" — a second name for the same assistant, which the persona's NAME clause rules out; the reading pipeline itself is unchanged */+'One or more IMAGES are attached. Read them with maximum care and OUTPUT ONE STRICT JSON OBJECT ONLY — no prose, no markdown fence. Schema: {"contentClass":string,"transcription"?:string,"uncertain"?:[string],"answer":string,"checks"?:object[],"places"?:[{"n":string,"c":string,"k":string}],"focusPlace"?:string}.\n'
        +'STEP 1 — CLASSIFY the dominant content into exactly one "contentClass": "math" (equations/matrices/proofs/physics/chemistry/statistics), "document" (text/table/form/receipt/handwriting), "code" (source code/terminal), "language" (grammar/translation/writing), "geographic" (real places/maps/landscapes/landmarks/facilities/street scenes/addresses), "photo" (general photo/screenshot/UI/diagram/chart/artwork), or "conceptual" (a general-knowledge question about the image). This class is AUTHORITATIVE — IntMap maps ONLY when it is "geographic".\n'
        +'STEP 2 — For math/document/code: TRANSCRIBE first, EXACTLY, BEFORE solving, into "transcription". Preserve every matrix, fraction, subscript, superscript, bracket and sign. If ANY digit/symbol is ambiguous (1 vs 7, 0 vs O, a vs α, a faint minus, a fraction bar), LIST it in "uncertain" and state the assumption you made — never silently treat an unreadable glyph as certain, and never invent a value you cannot see.\n'
        +'STEP 3 — SOLVE / ANALYZE from the transcription and show the working. Use STANDARD LaTeX for EVERY formula: inline as \\( … \\); display, multi-line and matrices as \\[ … \\] with pmatrix/bmatrix, \\frac, ^ and _ — NEVER bare ASCII like V^{-1}U or [x]_V. Use Markdown for structure: "## " section headings, "- " bullets, "| a | b |" pipe tables for tabular data, and ``` fenced blocks for code.\n'
        +'STEP 4 — VERIFY. Whenever the problem contains an independently checkable numeric/matrix identity, EMIT it in "checks" so IntMap recomputes it EXACTLY on the client and confirms your work. Each check is {"type":"matmul","label":"V·P = U","a":<matrix>,"b":<matrix>,"expect":<matrix>} (asserts a·b equals expect) or {"type":"equal","label":"…","left":<num-or-fraction-string>,"right":<…>}. Matrices are arrays of rows; entries are integers, decimals, or EXACT fraction strings like "1/22" or "-5/22" (prefer exact fractions — never rounded decimals). For a transition-, inverse- or change-of-basis-matrix problem you MUST include the product check (e.g. V·P = U). Emit ONLY checks you believe pass; if your own check would fail, fix the transcription/solution FIRST.\n'
        +'MAPPING (STRICT — the user was angry that math answers produced map pins): ONLY when contentClass is "geographic" may you fill "places" with the real, mappable spots the image shows/implies, as [{"n":"place name","c":"country","k":"kind"}], plus optionally "focusPlace" (the single main place to fly to). For EVERY other class you MUST OMIT "places" and "focusPlace" entirely — a math problem, document, code, UI screenshot or abstract photo has NO map value. NEVER turn a word like "Problem", "Thus", "Let", "Figure", "Theorem" or a person\'s name into a place.\n'
        +'HONESTY: if you cannot read the image confidently, SAY SO plainly in "answer" and reflect it in "uncertain" — never fabricate a confident solution, and never claim a verification you did not emit as a check. Write "answer" and its headings in '+lang+'. Numbers, code, LaTeX and place names stay canonical.'; }
    function _visionPrompt(q){ q=String(q||'').trim();
      /* (#R157) IMAGE-ONLY: when the user attached an image with NO text, the model still needs a default instruction —
         but it is supplied HERE, at the API boundary ONLY, as a hidden internal instruction. It is NEVER written into
         the textarea, NEVER shown as the user\'s message, and NEVER stored in history (the user typed nothing). The
         work order: "AI処理上どうしても既定指示が必要なら、API境界でのみ非表示のシステム指示として付与する". */
      const _imgDefault=L('Read and analyze this image. If it is a document, a maths/science problem, a table or text, transcribe it accurately and solve or explain it.','この画像を読み取って分析してください。文書・数学／理科の問題・表・テキストであれば、正確に書き起こして解くか説明してください。','Lies und analysiere dieses Bild. Wenn es ein Dokument, eine Mathe-/Naturwissenschaftsaufgabe, eine Tabelle oder Text ist, transkribiere es genau und löse oder erkläre es.','Прочитайте и проанализируйте это изображение. Если это документ, математическая/научная задача, таблица или текст — точно расшифруйте и решите или объясните.','Lee y analiza esta imagen. Si es un documento, un problema de matemáticas/ciencias, una tabla o texto, transcríbelo con precisión y resuélvelo o explícalo.');
      return (q?('The user says: '+q+'\n\n'):('[No text was typed — default instruction] '+_imgDefault+'\n\n'))+'Read the attached image(s) carefully and respond per your instructions: classify the content, transcribe any text/math EXACTLY (flag uncertain glyphs), solve or analyze it with LaTeX + Markdown, emit verifiable checks for any computable result, and include "places" ONLY if the content is genuinely geographic.'; }
    async function _atlVisionTurn(ai, q, imgs, gen){
      const opts={task:'vision_read',effortHint:'high',imageDetail:'high',signal:(_abortCtl?_abortCtl.signal:undefined)};
      try{ ai.innerHTML=stageDots('read'); }catch(_){}
      let env=null; try{ env=await askAIJSONEnvelope(_visionPrompt(q),_visionSYS(),imgs,opts); }
      catch(e){ if(gen===_runGen){ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; recordTurn(q,'',[{type:'answer'}],[{type:'answer'}]); } return; }
      if(gen!==_runGen){ ai.innerHTML=_cancelledNote(); return; }
      let d=_visNorm(env&&env.data); let vr=_atlVerifyChecks(d.checks);
      /* ONE image RE-EXAMINATION round when a deterministic recompute failed (the work order's "検算失敗時は回答をそのまま
         返さず、転記または計算を再確認する") — the model is told exactly which check broke and to re-read that region. */
      if(vr.ran && vr.failed.length){ try{ if(gen===_runGen) ai.innerHTML=stageDots('verify');
        const guide='\n\n[SELF-CHECK FAILED] Your emitted check(s) did NOT hold when recomputed EXACTLY on the client: '+vr.failed.map(f=>f.label+' ('+f.detail+')').join('; ')+'. RE-EXAMINE the corresponding region of the image, re-transcribe those exact entries (watch 1/7, 0/O, signs and fraction bars), redo the computation, and return corrected JSON whose checks actually pass. If the image genuinely does not support a passing check, say so honestly in "answer" and omit the failing check.';
        const env2=await askAIJSONEnvelope(_visionPrompt(q)+guide,_visionSYS(),imgs,opts);
        if(gen!==_runGen){ ai.innerHTML=_cancelledNote(); return; }
        if(env2&&env2.data){ const d2=_visNorm(env2.data); const vr2=_atlVerifyChecks(d2.checks);
          if(vr2.ran && !vr2.failed.length){ d=d2; vr=vr2; env=env2; }                               /* repaired → verified */
          else if(vr2.ran && vr2.failed.length<vr.failed.length){ d=d2; vr=vr2; env=env2; } }        /* strictly fewer failures → still an improvement */
      }catch(_){} }
      if(gen!==_runGen) return;
      let html='<div style="font-size:14px;line-height:1.68;">'+mdMini(d.answer||L('(no answer returned)','（回答が返りませんでした）','(keine Antwort)','(нет ответа)','(sin respuesta)'))+'</div>';
      if(Array.isArray(d.uncertain)&&d.uncertain.length) html+='<div style="font-size:11px;margin-top:6px;color:var(--text-muted);"><b>'+esc(L('Uncertain in the image','画像中の判読が不確実な箇所','Im Bild unsicher','Неуверенно распознано','Incierto en la imagen'))+':</b> '+esc(d.uncertain.slice(0,8).join(', '))+'</div>';
      try{ html+=_atlChecksNoteHtml(vr); }catch(_){}
      const cls=_atlContentClass(d.contentClass);
      if(_atlShouldMap(cls)){ const cites=(env&&Array.isArray(env.citations))?env.citations:[];
        try{ html+=await _pinReplyPlaces(d.places||[],{text:String(d.answer||''),citations:cites,contentClass:cls}); }catch(_){}
        if(d.focusPlace){ try{ const g=await geocode(String(d.focusPlace)); if(g&&isFinite(+g.lng)){ if(gen===_runGen) GE().camera.flyTo({center:[+g.lng,+g.lat],zoom:Math.max(GE().camera.getZoom(),6),duration:900}); } }catch(_){} } }
      if(gen===_runGen){ ai.innerHTML=html; recordTurn(q,'',[{type:'answer',contentClass:cls}],[]); }
    }
    async function run(q,imgs,files){ q=String(q||'').trim(); imgs=(Array.isArray(imgs)?imgs:[]).filter(u=>typeof u==='string'&&/^data:image\//.test(u)).slice(0,4);   /* (#R149) optional pasted/attached images (vision) */
      files=(Array.isArray(files)?files:[]).filter(f=>f&&typeof f.text==='string').slice(0,4);   /* (#R158) optional text-file attachments — their content is given to the model */
      if(!q&&!imgs.length&&!files.length) return;
      /* (#R158) the attached files' content, given to the model at the API boundary only (not shown in the bubble, not stored
         in history verbatim — the bubble/history keep the user's own words + a file chip). */
      const _fileBlock=files.length?('\n\n[ATTACHED FILE'+(files.length>1?'S':'')+' — the user attached the following file'+(files.length>1?'s':'')+'. Use the content to answer; do not claim you cannot read attachments.]\n'+files.map(f=>'----- '+String(f.name||'file')+' -----\n'+String(f.text||'')+(f.truncated?'\n…(truncated — file was longer)':'')).join('\n\n')):'';
      /* (#R157) IMAGE-ONLY: do NOT fabricate a user message. The old default text ("Read and analyze this image…") was
         written into `q` here and then SHOWN in the user bubble + saved to history — the "勝手にテキストが添付される" the
         user found unpleasant. `q` now stays EMPTY: the user bubble shows only the image, history stores no invented
         prose, and the model gets its default instruction ONLY at the API boundary (_visionPrompt, hidden). */
      const p=ensure(); p.style.display='flex';
      const exw=p.querySelector('.atl-ex'); if(exw) exw.style.display='none'; const subw=p.querySelector('.atl-sub'); if(subw) subw.style.display='none';   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
      _lastUserMsg=q;   /* (#R64) replies mirror the language of THIS message, not the UI setting */
      /* (#R73) a new message CANCELS any turn still thinking/executing */
      const gen=++_runGen;
      const turn=(_curTurn=++_turnSeq);   /* (#R298) the turn id every bubble and every history entry of THIS exchange carries, so an edit can rewind to exactly here */
      /* ══ (#R318) ONE TURN = ONE UNIT OF WORK ═══════════════════════════════════════════════════
         `_turnKey` identifies this exchange to the SERVER, so the planner call, the bounded repair
         calls and the vision re-read that belong to ONE user request consume ONE use of the daily
         allowance instead of up to three (§17). The server binds the key to the account and caps how
         many calls one key may carry, so a client that reuses a key gains nothing.
         `supersede` is the other half of the same idea: the previous turn's unfinished operations
         are replaced rather than left to land on top of this turn's answer (§12). */
      const _turnKey=(_curTurnKey='t'+turn+'-'+Math.floor(Date.now()/1000));
      try{ EXEC.supersede(turn); }catch(_){}
      try{ ASTATE.beginTurn(turn,q); }catch(_){}   /* (#R298) the turn id every bubble and every history entry of THIS exchange carries, so an edit can rewind to exactly here */
      try{ chatEl.querySelectorAll('.atl-b.a .atl-stage').forEach(d=>{ const b=d.closest('.atl-b'); if(b) b.innerHTML=_cancelledNote(); }); }catch(_){}
      /* (#R231) 「画像については…吹き出しで囲わなくてそのまま表示でいい」 — the image row is its own
         element. It keeps the `u` class (_scrollUserTop reads previousElementSibling.classList) and
         `.atl-imgrow` takes the fill/padding/radius off; the 74 px square crop is gone with it.
         ⚠ FILE CHIPS STAY IN THE BUBBLE — a file is NAMED, not shown. Images-only makes no bubble. */
      if(imgs.length) bubble('u','<div class="atl-imgrow-in">'+imgs.map(u=>'<img src="'+esc(u)+'" alt="" loading="lazy">').join('')+'</div>',{turn:turn}).classList.add('atl-imgrow');   /* (#R298) stamped with the turn but NOT editable — a picture has no text to edit; the request bubble below carries the Edit */
      if(q||files.length) bubble('u',(files.length?'<div style="display:flex;flex-wrap:wrap;gap:5px;'+(q?'margin-bottom:6px;':'')+'">'+files.map(f=>'<span class="atl-fchip atl-fchip-msg"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span class="atl-fchip-n">'+esc(f.name)+'</span></span>').join('')+'</div>':'')+esc(q),{turn:turn,q:q,imgs:imgs,files:files,edit:true});   /* (#R158) file chips are named, not shown, so they stay in the bubble with the text; (#R298) this bubble carries the whole request, so this is the one Edit re-runs */
      /* (#R142) generating state → the send button becomes a Stop button; a fresh AbortController lets Stop kill the
         in-flight request. The whole turn is wrapped so EVERY exit path (return / throw / early-out) restores the button. */
      try{ _abortCtl=(typeof AbortController!=='undefined')?new AbortController():null; }catch(_){ _abortCtl=null; }
      _setGoBusy(true);
      try{
      let lp=null; try{ lp=localPlan(q); }catch(_){}
      /* (#R135) build the REQUEST PROFILE up-front (temporal axis + required evidence + outputs) and open a fresh
         diagnostics record; both feed the planner prompt, the pre-execution plan validation, the semantic repair
         control and window.IntMapAtlasDebug.lastPlan(). */
      let _profile=null; try{ _profile=_requestProfile(q); }catch(_){}
      _curProfile=_profile;   /* (#R350) goalImpact() needs the REQUEST to tell a map move the user asked for from one Atlas added itself */
      _atlasDbg={ requestProfile:_profile, originalPlan:null, validatedPlan:null, rejectedActions:[], actionOutcomes:[], semanticRetries:[], scopeChanges:[], finalGoalValidation:null };
      _atlasOutcomes=_atlasDbg.actionOutcomes;
      try{ if(_profile&&_profile.targetYear!=null&&_profile.temporalMode!=='current') _wctx.year=_profile.targetYear; }catch(_){}   /* carry the year into the conversation for the next turn's profile */
      /* (#R52) a clear single-intent command runs deterministically with NO AI round-trip — it neither needs an
         account nor spends a daily AI credit, so the most common operations ALWAYS work (the core of the user's
         "claims it did X but didn't" report). The AI path below is still gated as before. */
      if(lp&&lp.confident&&lp.actions&&lp.actions.length&&!imgs.length&&!files.length){ const ai=bubble('a',stageDots('think')); try{ const fails=await runActions(ai,'',lp.actions,gen); if(gen===_runGen) recordTurn(q,'',lp.actions,fails); }catch(e){ if(gen===_runGen) ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; } msgTools(ai,q); return; }   /* (#R149/#R158) an attached image OR file always goes to the AI (skip the no-AI local shortcut) */
      /* (#R106) AI FALLBACK & AVAILABILITY — "LocalPlanで無理ならAIにフォールバック / できる限りAIを使用 / エラーが多い".
         Prefer AI for anything localPlan can't confidently handle. But when AI is unavailable (logged out or the daily
         quota is spent) we must NOT dead-end into a silent return + login modal (the frequent "何もせずエラー" case):
         run the best-effort local plan so Atlas still ACTS without an account, and only surface the login/limit gate
         when there is genuinely nothing to run. `_aiReady` mirrors aiGate WITHOUT its side effect (opening the modal),
         so the local fallback doesn't pop a needless login prompt. */
      let _aiReady=false; try{ _aiReady = !!(typeof HOST.user!=='undefined'&&HOST.user) && !(typeof aiUsage!=='undefined'&&aiUsage&&aiUsage.date===aiToday()&&typeof aiUsesLeft==='function'&&aiUsesLeft()<=0); }catch(_){ _aiReady=false; }
      if(!_aiReady){
        if(lp&&lp.actions&&lp.actions.length){ const ai2=bubble('a',stageDots('think')); try{ const fails=await runActions(ai2,'',lp.actions,gen); if(gen===_runGen) recordTurn(q,'',lp.actions,fails); }catch(e){ if(gen===_runGen) ai2.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; } msgTools(ai2,q); return; }
        try{ if(typeof aiGate==='function') aiGate(); }catch(_){}   /* opens the login modal / shows the daily-limit toast */
        const ai3=bubble('a',''); try{ ai3.innerHTML='<div style="font-size:12px;line-height:1.55;">'+esc((typeof HOST.user!=='undefined'&&HOST.user)?aiLimitMsg():aiLoginMsg())+'</div>'; }catch(_){} msgTools(ai3,q); return;
      }
      /* (#R156) IMAGE → DEDICATED VISION PIPELINE (classify → transcribe → solve → verify → render → map-only-if-geo),
         NOT the map-oriented generic planner. AI availability is already gated above. */
      if(imgs.length){ const aiv=bubble('a',stageDots('read')); try{ await _atlVisionTurn(aiv,q+_fileBlock,imgs,gen); }catch(e){ if(gen===_runGen) aiv.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; } if(gen===_runGen) msgTools(aiv,q); return; }   /* (#R158) any text files ride along with the vision prompt */
      const ai=bubble('a',stageDots('think'));   /* (#R130) stage-aware placeholder — updates to Searching/Analyzing/Mapping as runActions executes */
      /* (#R117) COMPLEXITY-ADAPTIVE reasoning: long / multi-clause / conditional requests get the planner's
         "high" effort (server-gated to atlas_plan+analysis) — the main lever for あいまい・複雑な要望. */
      const _cplx=(q.length>80)||(((q.match(/(、|。|,|;| and | then |して|してから|した上で|それから|さらに|かつ|比較|それぞれ|全部|すべて)/g)||[]).length>=2));
      /* (#R318 §10) WHICH CAPABILITIES THIS REQUEST NEEDS — deterministic, scored over the WHOLE
         registry, never a slice of the first N. A confident match ships the relevant blocks; low
         confidence widens; no signal at all ships everything, which is exactly the prompt #R311
         sent. The one thing it will not do is drop a capability for being 141st in the DOM. */
      let _capSel=null; try{ _capSel=_PLANNER.selectCapabilities(q,{ recent:(ASTATE.lastTurn()&&ASTATE.lastTurn().operations||[]).map(o=>o.capabilityId), requiredOutputs:Object.keys((_profile&&_profile.outputs)||{}).filter(k=>_profile.outputs[k]) }); }catch(_){ _capSel=null; }
      try{ if(_atlasDbg){ _atlasDbg.retrievedCapabilityIds=(_capSel&&_capSel.ids)||null; _atlasDbg.capabilitySelectionMode=(_capSel&&_capSel.mode)||'all'; _atlasDbg.plannerCatalogBytes=CAPS.catalogBytes((_capSel&&_capSel.ids)||null); } }catch(_){}
      try{ let plan=await _planCall(buildPrompt(q,_profile)+_fileBlock+(imgs.length?'\n\n[NOTE: '+imgs.length+' image'+(imgs.length>1?'s are':' is')+' attached to this message — analyze '+(imgs.length>1?'them':'it')+' and answer about '+(imgs.length>1?'them':'it')+' in your "answer" text; if '+(imgs.length>1?'they show':'it shows')+' or imply real places, include them in the answer\'s "places" so IntMap maps them.]':''),SYS(_capSel),imgs,{task:'atlas_plan',effortHint:_cplx?'high':undefined,schema:PLAN_SCHEMA,turnId:_turnKey,signal:(_abortCtl?_abortCtl.signal:undefined)});   /* (#R113) planner → server JSON mode; (#R135) profile block attached; (#R142) Stop-button abort signal; (#R149) attached images (vision); (#R158) attached file text */
        /* (#R73) a newer message arrived while the model was thinking → drop this turn's plan entirely */
        if(gen!==_runGen){ ai.innerHTML=_cancelledNote(); return; }
        /* (#R43) tolerate a bare array / single action object from a weaker model; plan===null = unparseable. */
        if(Array.isArray(plan)) plan={actions:plan}; else if(plan&&plan.type&&!plan.actions) plan={actions:[plan],say:plan.say};
        const acts0=(plan&&Array.isArray(plan.actions))?plan.actions:[];
        /* (#R135 §7) PRE-EXECUTION VALIDATION — rewrite/append incompatible actions against the capability registry
           (a historical question routed to live-only mapReport → researchMap; a water/region "situation" wrongly sent
           to a world alliance map → researchMap; explanation requested but plan only navigates → add researchMap)
           BEFORE anything runs, so the wrong action never executes and the repair storm never starts. */
        try{ if(_atlasDbg) _atlasDbg.originalPlan=JSON.parse(JSON.stringify(acts0)); }catch(_){}
        let _vp=null; try{ _vp=_validatePlan(acts0,_profile,q); }catch(_){ _vp={plan:acts0,rejected:[]}; }
        const acts=(_vp&&Array.isArray(_vp.plan))?_vp.plan:acts0;
        try{ if(_atlasDbg){ _atlasDbg.validatedPlan=acts; _atlasDbg.rejectedActions=(_vp&&_vp.rejected)||[]; } }catch(_){}
        if(!acts.length){
          /* (#R52) No executable action came back. Priority: (1) if we have a DETERMINISTIC plan for this request,
             DO it — this overrides a model that "said" it acted without emitting an action (the exact bug reported:
             実行したと言っている操作が実行されていない). (2) else show the model's say (a real clarification / answer).
             (3) else admit we could not interpret it. */
          if(lp&&lp.actions&&lp.actions.length){ const fails=await runActions(ai,'',lp.actions,gen); if(gen===_runGen) recordTurn(q,'',lp.actions,fails); msgTools(ai,q); return; }
          const say=plan&&plan.say; if(say){ ai.innerHTML='<div style="line-height:1.6;">'+mdMini(say)+'</div>'; recordTurn(q, say, [], []); msgTools(ai,q); return; }   /* (#R147) mdMini + inherit bubble size (drop inline 12px) */
          ai.innerHTML=esc(L('Sorry, I could not interpret that.','うまく解釈できませんでした。','Konnte das nicht interpretieren.','Не удалось понять запрос.','No pude interpretarlo.')); msgTools(ai,q); return;
        }
        /* (#R53) ANTI-FABRICATION: if the model only "answered" (no real action) yet we have a deterministic plan
           for this request, DO the real thing instead of printing words that claim an action that never ran — the
           user explicitly reported "実行していない動作を実行したという虚偽の報告". */
        if(acts.every(a=>a&&a.type==='answer') && lp && lp.actions && lp.actions.length){ const fails=await runActions(ai,'',lp.actions,gen); if(gen===_runGen) recordTurn(q,'',lp.actions,fails); msgTools(ai,q); return; }
        /* (#R74/#R158) LIVE-SOURCE OVERRIDE. Two problems share one root: (1) "ありえないハルシネーション" — a memory-only
           answer to a current-fact question is where hallucination lives; (2) "Atlasに出典が一つもないのはくそ" — the bare
           answer path attaches NO source cards. Fix both: when the model answered an informational / current-fact question
           with no live-data action, re-run it through analyze (live web + Wikidata), which grounds the reply AND renders real
           source cards (use:['web'] forces the search → citations are never empty). Guarded so greetings / social / trivial
           one-liners are NOT sent to a web search. */
        try{ const TIMEVAR=/(最近|現在|今の|今は|きょう|今日|latest|current(ly)?|right now|this (week|month|year)|今年|首相|大統領|総理|president|prime minister|news|ニュース|情勢|状況|どうなって)/i;
          const INFO=/[?？]\s*$|(なぜ|どうして|どの|どんな|どこ|いつ|誰|だれ|教え|説明|とは|について|違い|比較|理由|原因|方法|どうやって|what|who|where|when|why|how\b|which|explain|describe|compare|difference|tell me|overview|summar)/i;
          const SOCIAL=/^\s*(hi|hello|hey|yo|ok|okay|thanks|thank you|thx|ありがとう|どうも|こんにちは|こんばんは|おはよう|やあ|hola|gracias|danke|привет|спасибо)\b/i;
          const informational=q.length>=8 && !SOCIAL.test(q) && (TIMEVAR.test(q)||INFO.test(q));
          if(acts.length&&acts.every(a=>a&&a.type==='answer')&&informational){
            const fails=await runActions(ai,'',[{type:'analyze',question:q,use:['web']}],gen);
            if(gen===_runGen) recordTurn(q,'(routed to live analysis for sources)',[{type:'analyze',question:q}],fails); msgTools(ai,q); return; } }catch(_){}
        const fails=await runActions(ai, plan.say||'', acts, gen);
        if(gen===_runGen) recordTurn(q, plan.say||'', acts, fails);   /* (#R44) remember this exchange so the NEXT request has context */
        /* (#R117/#R135) REPAIR PASS — when planned actions FAILED, give the model a DIFFERENT approach. Now bounded
           to TWO rounds and controlled by SEMANTIC key (§10): repair actions run through the SAME capability
           validation (so a historical question is never re-routed to live news, a local place never to a world map),
           translation-only retries of the same research family+mode are dropped, and world/continental scope-blowups
           are refused. A map-draw failure is NOT treated as an answer failure. */
        try{ let pending=(fails||[]).filter(a=>a&&a.type&&a.type!=='answer'); const _tried=[]; const _triedFam=new Set();
          /* (#R158) a PARTIAL execution (some targets resolved, some not) also needs Terra's decision — seed it into the
             repair loop even though it reported ok:true. IntMap does not adopt a partial result on its own. */
          try{ acts.forEach(a=>{ if(a&&a.__exec&&a.__exec.status==='partial_or_failed'&&pending.indexOf(a)<0) pending.push(a); }); }catch(_){}
          /* (#R158) format the mechanical execution results as a structured block Terra reads to generate a corrected action */
          const _execFbOf=list=>{ const seen=[],out=[]; (list||[]).forEach(a=>{ const e=a&&a.__exec; if(e&&e.status==='partial_or_failed'&&seen.indexOf(e)<0){ seen.push(e); out.push(e); } });
            return out.length?('\n\n[EXECUTION RESULT — IntMap executed your action and OBSERVED the following. IntMap did NOT auto-correct, substitute, drop or reinterpret anything. YOU (the model) decide how to proceed: re-issue the action with corrected identifiers, re-search, ask the user, or accept the partial. "availableIdentifiers" are deterministic candidates IntMap found but did NOT apply — use them only if you judge them correct.]\n'+out.slice(0,4).map(e=>{ try{ return JSON.stringify(e).slice(0,1500); }catch(_){ return ''; } }).filter(Boolean).join('\n')):''; };
          acts.forEach(a=>{ try{ _tried.push(JSON.stringify(a)); const f=_researchFamKey(a); if(f) _triedFam.add(f); }catch(_){} });
          for(let _rp=0; _rp<2 && gen===_runGen && pending.length && acts.length<=12; _rp++){
            const _execFb=_execFbOf(pending);
            pending.forEach(a=>{ try{ _tried.push(JSON.stringify(a)); const f=_researchFamKey(a); if(f) _triedFam.add(f); }catch(_){} });
            const fdesc=_tried.slice(-14).map(s2=>s2.slice(0,220)).join('\n');
            const rp=await _planCall(buildPrompt(q,_profile)+_fileBlock+'\n\n[REPAIR '+(_rp+1)+'/2] These calls could not be completed:\n'+fdesc+_execFb+'\n'+_repairGuidance(),SYS(_capSel),imgs,{task:'atlas_plan',effortHint:'high',schema:PLAN_SCHEMA,turnId:_turnKey,signal:(_abortCtl?_abortCtl.signal:undefined)});
            let rplan=rp; if(Array.isArray(rplan)) rplan={actions:rplan}; else if(rplan&&rplan.type&&!rplan.actions) rplan={actions:[rplan],say:rplan.say};
            let racts=(rplan&&Array.isArray(rplan.actions))?rplan.actions.filter(a2=>a2&&a2.type):[];
            /* sanitize the repair plan through the SAME capability validation as the first plan */
            try{ const rvp=_validatePlan(racts,_profile,q); racts=rvp.plan; if(_atlasDbg&&rvp.rejected&&rvp.rejected.length) _atlasDbg.rejectedActions=_atlasDbg.rejectedActions.concat(rvp.rejected); }catch(_){}
            const isTried=a2=>{ try{ return _tried.indexOf(JSON.stringify(a2))>=0; }catch(_){ return false; } };
            const fresh=racts.filter(a2=>{
              if(isTried(a2)) return false;
              const rf=_researchFamKey(a2); if(rf&&_triedFam.has(rf)){ try{ if(_atlasDbg) _atlasDbg.semanticRetries.push({blocked:a2.type,key:rf,reason:'same_research_family_and_mode_already_tried'}); }catch(_){} return false; }
              if(_isWorldExpansion(a2,_profile)){ try{ if(_atlasDbg) _atlasDbg.scopeChanges.push({blocked:a2.type,place:String(a2.place||a2.era||''),reason:'excessive_scope_expansion_to_world'}); }catch(_){} return false; }
              return true; }).slice(0,6);
            if(gen!==_runGen||!fresh.length) break;
            fresh.forEach(a2=>{ const f=_researchFamKey(a2); if(f) _triedFam.add(f); });
            /* (#R159) the repair FIXES the failed answer — its result must REPLACE the failure, not be appended below a
               divider (the "最初の分析と修復後の分析が同時表示され矛盾する" bug). Tag each repair answer-producer with the goal
               key of the pending answer it is fixing so _atlCompose keeps only the best of the two, then re-run into the
               SAME bubble (no new divider div). */
            try{ const _pk=(pending.map(_atlGoalKey).filter(k=>k&&k.indexOf('answer:')===0))[0]||'';
              if(_pk) fresh.forEach(a2=>{ if(_ATL_ANSWER_TYPES[a2&&a2.type]&&!a2.__goalKey) a2.__goalKey=_pk; }); }catch(_){}
            const rf=await runActions(ai, rplan.say||'', fresh, gen);
            if(gen===_runGen) recordTurn(q+' (repair '+(_rp+1)+')', rplan.say||'', fresh, rf);
            pending=(rf||[]).filter(a2=>a2&&a2.type&&a2.type!=='answer');
            try{ fresh.forEach(a2=>{ if(a2&&a2.__exec&&a2.__exec.status==='partial_or_failed'&&pending.indexOf(a2)<0) pending.push(a2); }); }catch(_){}   /* (#R158) a still-partial repair keeps the loop going for Terra's next decision */
            if(fresh.every(a2=>a2.type==='answer')) break;   /* the model declared it impossible — don't loop on that */
          } }catch(_){}
        try{ if(_atlasDbg) _atlasDbg.finalGoalValidation=_goalValidation(_profile,_atlasDbg.actionOutcomes); }catch(_){}
        msgTools(ai,q);
      }catch(e){ /* (#R52) network/parse failure → still try the deterministic plan before surfacing the error. */
        if(gen!==_runGen){ try{ ai.innerHTML=_cancelledNote(); }catch(_){} return; }
        if(lp&&lp.actions&&lp.actions.length){ try{ const fails=await runActions(ai,'',lp.actions,gen); if(gen===_runGen) recordTurn(q,'',lp.actions,fails); msgTools(ai,q); return; }catch(_){} }
        ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'AI error')+'</span>'; msgTools(ai,q); }
      }finally{ try{ if(gen===_runGen){ _setGoBusy(false); _abortCtl=null; } }catch(_){} }   /* (#R142) only the LATEST turn clears the busy button — a superseding turn keeps its own Stop shown */
    }
    /* (#R44) append a compact, TRUTHFUL record of the exchange to the rolling history (capped). */
    function recordTurn(q, say, acts, fails){ try{ updateWctx(acts,fails); }catch(_){} try{ _parseExclusions(q); }catch(_){}
      try{ const did=(acts||[]).filter(a=>(fails||[]).indexOf(a)<0).map(actLabel).filter(Boolean);
      let a='Atlas: '+String(say||'(done)').slice(0,180); if(did.length) a+=' [did: '+did.join('; ').slice(0,260)+']'; if((fails||[]).length) a+=' [failed: '+fails.map(actLabel).join('; ').slice(0,160)+']';
      _hist.push({t:_curTurn,s:'User: '+q.slice(0,260)}); _hist.push({t:_curTurn,s:a}); if(_hist.length>16) _hist=_hist.slice(-16); }catch(_){} }   /* (#R298) both halves are filed under whichever turn is current. The brief / runDirect entry points bump _runGen but open no turn of their own, so what they record belongs to the last one — which is right: rewinding to before that turn should drop them too */
    /* (#R112) Atlas is a REAL sidebar TAB in normal + mobile mode — the console mounts, IN NORMAL FLOW, into its own
       content area (#atlas-feed) BELOW the sidebar tab bar, exactly like the News / Information / Countries tabs. The
       header + tabs stay visible; there is NO popup overlay (the old "popup forcibly pasted onto the sidebar"
       #atl-in-sheet hack is abolished — the user called it a クソUI). Selecting Atlas goes through the sidebar's own
       tab engine (setMode via the tab button), so the mobile bottom-sheet lift and every other tab behaviour is shared
       automatically. WORKSPACE MODE is unchanged: Atlas keeps its own floating window there (the sole exclusion). */
    function _atlWs(){ try{ return document.body.classList.contains('ws-mode'); }catch(_){ return false; } }
    /* Mount the panel, in flow, into the sidebar's Atlas content area (#atlas-feed). Idempotent — called by renderUI's
       'atlas' branch whenever the Atlas tab becomes/stays active. */
    function mountTab(){ try{ const p=ensure(); const af=document.getElementById('atlas-feed'); if(!af) return;
      p.classList.add('atl-tab'); p.classList.remove('atl-min');
      try{ document.body.classList.remove('atl-in-sheet'); }catch(_){}   /* retire any leftover popup-paste state */
      if(p.parentNode!==af){ af.appendChild(p); }
      /* shed any floating-popup geometry a previous drag/resize left inline, so the in-flow fill CSS wins */
      ['left','top','width','height','transform'].forEach(k=>{ try{ p.style.removeProperty(k); }catch(_){} });
      const mb=p.querySelector('.atl-min-btn'); if(mb){ mb.textContent='–'; }
      p.style.display='flex';
      setTimeout(()=>{ try{ inEl&&inEl.focus(); }catch(_){} },60);
    }catch(_){} }
    function open(){ const p=ensure(); p.classList.remove('atl-min'); const mb=p.querySelector('.atl-min-btn'); if(mb){ mb.textContent='–'; }
      if(_atlWs()){
        /* Workspace mode — Atlas is its own window (unchanged behaviour). */
        p.classList.remove('atl-tab');
        if(p._restoreH){ p.style.setProperty('height',p._restoreH,'important'); } else if(p.style.height==='auto'){ p.style.removeProperty('height'); }
        p.style.display='flex'; try{ if(typeof bringToFront==='function') bringToFront(p); }catch(_){}
        setTimeout(()=>{ try{ inEl&&inEl.focus(); }catch(_){} },60); return;
      }
      /* Normal / mobile — the Atlas sidebar tab, through the real tab button so the shared behaviour (sheet-lift, active state) fires
         as for News/Info/Countries; never toggles OFF. ⚠ (#R214) a tab selected inside a COLLAPSED sidebar puts the answer off-screen — uncollapse first, only ever that way. */
      try{ const sb=document.getElementById('sidebar'); if(sb&&sb.classList.contains('collapsed')){ const tb=document.getElementById('btn-toggle-sidebar'); if(tb) tb.click(); else sb.classList.remove('collapsed'); }
        if(typeof HOST.mode!=='undefined' && HOST.mode==='atlas'){ mountTab(); }
        else { const b=document.getElementById('btn-community'); if(b) b.click(); else if(typeof setMode==='function') setMode('atlas','btn-community'); else mountTab(); }
      }catch(_){ mountTab(); }
      setTimeout(()=>{ try{ inEl&&inEl.focus(); }catch(_){} },80); }
    function _atlClose(){ const p=ensure();
      if(_atlWs()){ p.style.display='none'; return; }
      /* Normal / mobile — "closing" Atlas = deselecting its tab (blank sidebar), like tapping an active tab again. */
      try{ if(typeof setMode==='function' && typeof HOST.mode!=='undefined' && HOST.mode==='atlas') setMode('atlas','btn-community'); }catch(_){} }
    function toggle(){ if(_atlWs()){ const p=ensure(); if(p.style.display==='none'||!p.style.display) open(); else _atlClose(); return; }
      /* Normal / mobile — toggle the Atlas tab (select / deselect), matching a tab-button tap. */
      try{ const b=document.getElementById('btn-community'); if(b){ b.click(); } else if(typeof setMode==='function'){ setMode('atlas','btn-community'); } }catch(_){} }
    /* (#R83) "Ask AI about here" absorbed into Atlas: opens the console, pins the exact clicked coordinate (so
       the whole conversation resolves "here/this spot" to it), reverse-geocodes a friendly name where possible,
       flies there and offers example questions — the free-form chat/input then answers with full location
       context. Replaces the old standalone IntMapAIResearch panel entry. */
    /* ══ (#R318) THE RESUME PATH ═══════════════════════════════════════════════════════════════
       An operation that answered `needs_input` is not finished and is not a new subject. When the
       reader supplies what it asked for, the SAME operation continues — same capability, same
       arguments, the missing one filled in — rather than the request being planned again from
       scratch. `_pendingInput` is the one slot that makes that possible; it expires, because a
       point clicked twenty minutes later is a new thought, not an answer. */
    let _pendingInput=null;
    const _RESUME_TTL_MS=5*60*1000;
    async function _resumeWithPoint(lng,lat){
      const p=_pendingInput; if(!p||!p.result||!p.result.inputRequest) return false;
      if(Date.now()-p.at>_RESUME_TTL_MS){ _pendingInput=null; return false; }
      const kind=p.result.inputRequest.kind;
      if(kind!=='point'&&kind!=='polygon'&&kind!=='polyline') return false;
      _pendingInput=null;
      const args=Object.assign({}, p.result.inputRequest.pendingArgs||{}, {lng:lng, lat:lat});
      let ar=null;
      try{ ar=await EXEC.execute(p.result.capabilityId, args, {source:'atlas-resume', turnId:_curTurn}); }catch(_){ return false; }
      try{ const host=(p.bubble&&document.body.contains(p.bubble))?p.bubble:bubble('a','');
        const legacy=RESULTS.toLegacy(ar);
        host.innerHTML=(legacy.html||'')+RESULTS.render(ar,{L,esc,note,warn});
        if(ar.status==='needs_input'&&ar.inputRequest) _pendingInput={ result:ar, bubble:host, at:Date.now() }; }catch(_){}
      return true;
    }
    async function askHere(ll){ if(!ll||ll.lng==null||!isFinite(+ll.lng)) return; try{ open(); }catch(_){}
      /* …and if something was waiting for exactly this, that is what the click meant. */
      try{ if(await _resumeWithPoint(+ll.lng,+ll.lat)) return; }catch(_){}
      _lastUserMsg=''; const p=ensure(); const exw=p.querySelector('.atl-ex'); if(exw) exw.style.display='none'; const subw=p.querySelector('.atl-sub'); if(subw) subw.style.display='none';   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
      const lng=+ll.lng, lat=+ll.lat;
      _herePoint={lng,lat,name:''}; try{ _lastPlace={lng,lat,name:''}; }catch(_){}
      try{ GE().camera.flyTo({center:[lng,lat],zoom:Math.max(GE().camera.getZoom(),5),duration:900}); }catch(_){}
      /* label the pin with the country it falls in (best-effort, non-blocking) so it reads nicely */
      (async()=>{ try{ let nm=''; const cd=(typeof codeAtPoint==='function')?codeAtPoint(lng,lat):null;
          if(cd&&typeof countryStats!=='undefined'&&countryStats[cd]){ const s=countryStats[cd]; nm=(HOST.lang==='jp'?(s.nameJp||s.nameEn):s.nameEn)||''; }
          if(nm&&_herePoint){ _herePoint.name=String(nm).slice(0,80); if(_lastPlace) _lastPlace.name=_herePoint.name; const hd=p.querySelector('.atl-here-hd'); if(hd) hd.textContent='📍 '+String(nm).slice(0,80)+' · '+lat.toFixed(3)+', '+lng.toFixed(3); } }catch(_){} })();
      const coordStr=lat.toFixed(3)+', '+lng.toFixed(3);
      const ex=[
        L('Why is this area the way it is?','なぜこの辺りはこうなっているの？','Warum ist dieses Gebiet so?','Почему здесь так?','¿Por qué es así esta zona?'),
        L('What is important about this place?','この場所の何が重要？','Was ist an diesem Ort wichtig?','Чем важно это место?','¿Qué es importante de este lugar?'),
        L('What is happening here recently?','ここで最近何が起きている？','Was passiert hier zuletzt?','Что здесь происходит в последнее время?','¿Qué ocurre aquí últimamente?')
      ];
      const chips=ex.map(e=>'<button class="atl-here-q" style="display:block;width:100%;text-align:left;margin:3px 0;padding:7px 10px;font-size:11.5px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);cursor:pointer;">'+esc(e)+'</button>').join('');
      const b=bubble('a','<div class="atl-here-hd" style="font-weight:600;margin-bottom:3px;">📍 '+coordStr+'</div>'
        +'<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;line-height:1.5;">'+L('Ask me anything about this spot — I know exactly where it is.','この地点について何でも聞いてください。正確な位置を把握しています。','Fragen Sie mich alles zu diesem Ort — ich kenne die genaue Position.','Спросите что угодно об этом месте — я знаю его точные координаты.','Pregúntame lo que sea sobre este lugar — sé exactamente dónde está.')+'</div>'+chips);
      try{ b.querySelectorAll('.atl-here-q').forEach(btn=>btn.onclick=()=>run(btn.textContent.trim())); }catch(_){}
      setTimeout(()=>{ try{ inEl.focus(); }catch(_){} },80); }
    /* (#R62) external entry point: the AI-brief buttons all over IntMap now open ATLAS and run the brief inline
       ("AI BriefはAtlasに統合して") — one conversation surface for everything. */
    async function briefEntry(name,ll){ try{ open(); }catch(_){}
      _lastUserMsg='';   /* (#R64) button entry has no typed message → mirror falls back to the UI language */
      const p=ensure(); const exw=p.querySelector('.atl-ex'); if(exw) exw.style.display='none'; const subw=p.querySelector('.atl-sub'); if(subw) subw.style.display='none';   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
      /* (#R69) no 🤖 and no "AI brief" wording in the chat ("AI Briefに🤖をつけるな" / "AI briefってワードを
         わざわざAtlasで出すな") — the user bubble reads as a plain research request. */
      bubble('u',L('Research: ','調査: ','Recherche: ','Исследование: ','Investigación: ')+esc(String(name||'')));
      try{ if(typeof aiGate==='function'&&!aiGate()) return; }catch(_){}
      const ai=bubble('a','<span style="color:var(--text-muted);">'+L('Researching…','調査中…','Recherchiere…','Изучаю…','Investigando…')+'</span>');
      const gen=++_runGen;   /* (#R73) a newer message cancels this brief too */
      try{ const act={type:'brief',place:String(name||'')}; if(ll&&ll.lng!=null&&isFinite(+ll.lng)){ act.lng=+ll.lng; act.lat=+ll.lat; }
        const r=await dispatch(act); if(gen!==_runGen){ ai.innerHTML=_cancelledNote(); return; }
        ai.innerHTML=(r&&r.html)||''; recordTurn('Research: '+String(name||''),'',[act],(r&&r.ok)?[]:[act]);
      }catch(e){ if(gen===_runGen) ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; else { ai.innerHTML=_cancelledNote(); return; } }
      msgTools(ai,null); }
    /* (#R82) wire Atlas INTO the kernel: the OS's semantic dispatcher = Atlas's action layer; its state = the
       live map/UI state; its catalog = the full control/layer/module surface. After this, IntMapOS.dispatch(action)
       runs the SAME dispatch the NL chat uses, IntMapOS.state() is the canonical state, and IntMapOS.catalog()
       enumerates every operation the OS can perform — so the whole UI is registered as the OS's surface, and both
       shells (GUI + chat) execute through the one kernel. */
    try{ if(window.IntMapOS){
      window.IntMapOS._setDispatch(a=>dispatch(a));
      /* ══ (#R318) THE REGISTRY LEARNS HOW TO REACH THE ENGINE ═══════════════════════════════════
         Descriptors exist from boot; the WORK is in this file's dispatch, and this is the moment the
         two are joined. Until it happens a capability answers `unavailable` with the reason
         'atlas-kernel-not-loaded' — a true statement, which is the point: a capability is never
         silently absent. `docs` is the 58 kB catalogue the planner reads (js/atlas-catalog-text.js);
         it lives in THIS chunk because only the planner needs it. */
      try{ CAPS.bindRuntime({ dispatch:a=>dispatch(a), docs:_DOCS }); }catch(_){}
      /* the state this file OWNS — everything else publishes its own (js/atlas-state.js §8) */
      try{ ASTATE.registerStateProvider('selection', _selectionState);
           ASTATE.registerStateProvider('atlas', _atlasOverlayState);
           ASTATE.registerStateProvider('pinnedPoint', ()=>(_herePoint?{lng:_herePoint.lng,lat:_herePoint.lat,name:_herePoint.name||''}:null));
           ASTATE.registerStateProvider('simulations', _simulationState); }catch(_){}
      window.IntMapOS._bindState(()=>{ try{ return stateContext(); }catch(_){ return ''; } });
      window.IntMapOS._bindCatalog(()=>{ try{ return { commands:window.IntMapOS.list(), controls:controlCatalog(), layers:layerCatalogText(), modules:moduleCatalog() }; }catch(_){ return { commands:window.IntMapOS.list() }; } });
      window.IntMapOS.brief=(n,ll)=>{ try{ return briefEntry(n,ll); }catch(_){} };
    } }catch(_){}
    /* (#R75) dispatch exposed read-eval style for diagnostics/testing (vision §17) — same honest R() results.
       (#R76) wctx = read-only snapshot of the structured working context (vision §3). */
    /* (#R119) runDirect — the entry point for OTHER IntMap features to run actions INSIDE the Atlas thread
       (user-labelled bubble + honest per-step results), e.g. the area-summary button. No AI planning round-trip. */
    async function runDirect(label,acts){ try{ open(); }catch(_){}
      _lastUserMsg=''; try{ const p2=ensure(); const exw=p2.querySelector('.atl-ex'); if(exw) exw.style.display='none'; const subw=p2.querySelector('.atl-sub'); if(subw) subw.style.display='none'; }catch(_){}
      bubble('u',esc(String(label||'')));
      const ai=bubble('a',stageDots('think'));
      const gen=++_runGen;
      try{ const fails=await runActions(ai,'',acts,gen); if(gen===_runGen) recordTurn(String(label||''),'',acts,fails); }catch(e){ try{ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; }catch(_){} }
      try{ msgTools(ai,String(label||'')); }catch(_){} }
    return { open, toggle, close:_atlClose, mountTab, run, runDirect, brief:briefEntry, askHere, dispatch:a=>dispatch(a), wctx:()=>{ try{ return JSON.parse(JSON.stringify(_wctx)); }catch(_){ return null; } }, state:()=>{ try{ return stateContext(); }catch(_){ return ''; } } };
  })();
};
